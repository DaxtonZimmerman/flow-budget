const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),vm=require('node:vm');
function setup(options={}){
 const saved=new Map([['flow_user_id','owner']]), events=[],calls=[],listeners=new Map();let flushed=0;
 const context={Date,Event,navigator:{onLine:true},localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},sessionStorage:{getItem:()=>null,setItem:()=>{}},document:{addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent:e=>events.push(e.type)},window:{},getFlowClient:()=>({auth:{getUser:async()=>({data:{user:{id:options.authOwner||'owner'}}})}}),flowDataChanged:async()=>flushed++,bankRequest:async action=>{calls.push(action);if(action==='connections')return {connections:[{id:'conn',needs_reconnect:options.reconnect}]};if(options.duringFetch)options.duringFetch(saved);if(options.unavailable)throw Error('Old endpoint');return {accounts:[{account_id:'cash',name:'Checking',type:'depository',subtype:'checking',balances:{available:50,iso_currency_code:'USD'}}],retrieved_at:new Date().toISOString()};}};
 vm.createContext(context);for(const file of ['planning-data','bank-accounts'])vm.runInContext(fs.readFileSync(`${__dirname}/../js/${file}.js`,'utf8'),context);
 return {saved,events,calls,refresh:()=>context.window.refreshFlowAccounts(true),onBankChange:()=>listeners.get('flow-bank-updated')({detail:{changed:true}}),flushes:()=>flushed};
}
test('account snapshots stay owner scoped and use only the free cached account request',async()=>{
 const x=setup();await x.refresh();const accounts=JSON.parse(x.saved.get('bankAccounts'));assert.equal(accounts[0].availableCents,5000);assert.deepEqual(x.calls,['connections','accounts']);assert.equal(x.flushes(),1);assert.ok(x.events.includes('flow-accounts-updated'));
 const wrong=setup({authOwner:'different'});await wrong.refresh();assert.equal(wrong.calls.length,0);assert.equal(wrong.saved.has('bankAccounts'),false);
});
test('an account switch or cache removal while loading cannot restore another owner or disconnected snapshot',async()=>{
 for(const duringFetch of [s=>s.set('flow_user_id','other'),s=>s.set('bankAccounts','[]')]){const x=setup({duringFetch});await x.refresh();assert.equal(x.flushes(),0);assert.notEqual(x.saved.get('bankAccounts')?.includes('Checking'),true);}
});
test('unavailable account responses do not invent zero balances, and reconnecting banks lose their cached balances',async()=>{
 const unavailable=setup({unavailable:true});await unavailable.refresh();assert.equal(unavailable.saved.get('bankAccounts'),'[]');
 const reconnect=setup({reconnect:true});reconnect.saved.set('bankAccounts',JSON.stringify([{id:'conn:cash',accountId:'cash',bankConnectionId:'conn',name:'Checking',type:'depository',subtype:'checking',currency:'USD',availableCents:5000,currentCents:5000,retrievedAt:new Date().toISOString()}]));await reconnect.refresh();assert.equal(reconnect.saved.get('bankAccounts'),'[]');assert.deepEqual(reconnect.calls,['connections']);
});

test('newly imported bank activity also requests the free cached balance snapshot',async()=>{
 const app=setup();await app.refresh();await app.onBankChange();assert.deepEqual(app.calls,['connections','accounts','connections','accounts']);
});
