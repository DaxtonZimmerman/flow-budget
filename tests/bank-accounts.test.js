const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),vm=require('node:vm');
function setup(options={}){
 const saved=new Map([['flow_user_id','owner']]), session=new Map(),events=[],calls=[],listeners=new Map(),timers=new Map();let flushed=0,now=Date.now(),timerId=0;
 const remember=(name,fn)=>listeners.set(name,fn);
 class Clock extends Date { static now(){return now;} }
 const context={Date:Clock,Event,navigator:{onLine:true},setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,at:now+delay});return timerId;},clearTimeout:id=>timers.delete(id),localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},sessionStorage:{getItem:k=>{if(options.blockSession)throw Error('storage blocked');return session.get(k)??null;},setItem:(k,v)=>{if(options.blockSession)throw Error('storage blocked');session.set(k,v);}},document:{hidden:false,addEventListener:remember,dispatchEvent:e=>events.push(e.type)},window:{addEventListener:remember},getFlowClient:()=>({auth:{getUser:async()=>({data:{user:{id:options.authOwner||'owner'}}})}}),flowDataChanged:async()=>flushed++,bankRequest:async action=>{calls.push(action);if(action==='connections'){if(options.connectionFailure)throw Error('unavailable');return {connections:[{id:'conn',needs_reconnect:options.reconnect}]};}if(options.duringFetch)options.duringFetch(saved);if(options.unavailable)throw Error('Old endpoint');return {accounts:[{account_id:'cash',name:'Checking',type:'depository',subtype:'checking',balances:{available:50,iso_currency_code:'USD'}}],retrieved_at:new Date(now).toISOString()};}};
 vm.createContext(context);for(const file of ['planning-data','bank-accounts'])vm.runInContext(fs.readFileSync(`${__dirname}/../js/${file}.js`,'utf8'),context);
 return {saved,session,events,calls,context,refresh:(force=true)=>context.window.refreshFlowAccounts(force),event:(name)=>listeners.get(name)({}),onBankChange:()=>listeners.get('flow-bank-updated')({detail:{changed:true}}),flushes:()=>flushed,timers,advance:async ms=>{now+=ms;for(const [id,timer]of [...timers])if(timer.at<=now){timers.delete(id);await timer.fn();}}};
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

test('temporary balance failure retries in the background and preserves the last real snapshot',async()=>{
 const options={unavailable:true},x=setup(options),prior=JSON.stringify([{id:'conn:cash',accountId:'cash',bankConnectionId:'conn',name:'Checking',type:'depository',subtype:'checking',currency:'USD',availableCents:1200,currentCents:1200,retrievedAt:new Date().toISOString(),bankUpdatedAt:null}]);
 x.saved.set('bankAccounts',prior);await x.refresh(false);
 assert.equal(x.saved.get('bankAccounts'),prior);assert.equal(x.session.size,0);assert.equal(x.timers.size,1);
 await x.event('focus');assert.equal(x.calls.length,2,'failed requests are throttled');
 options.unavailable=false;await x.advance(60000);
 assert.equal(JSON.parse(x.saved.get('bankAccounts'))[0].availableCents,5000);assert.equal(JSON.parse(x.saved.get('bankAccounts'))[0].bankUpdatedAt,null);assert.equal(x.timers.size,0);assert.equal(x.session.size,1);
});
test('automatic checks happen on return, remain throttled, and pause while offline, hidden or saving',async()=>{
 const x=setup();await x.event('focus');await x.event('online');await x.event('flow-cloud-ready');assert.equal(x.calls.length,2);
 await x.advance(15*60000);x.context.navigator.onLine=false;await x.event('focus');assert.equal(x.calls.length,2);
 x.context.navigator.onLine=true;x.context.document.hidden=true;await x.event('online');assert.equal(x.calls.length,2);
 x.context.document.hidden=false;x.saved.set('flow_pending','1');await x.event('visibilitychange');assert.equal(x.calls.length,2);
 x.saved.delete('flow_pending');await x.event('visibilitychange');assert.equal(x.calls.length,4);
});
test('an edit arriving during a balance fetch is never overwritten by that fetch',async()=>{
 const x=setup({duringFetch:s=>s.set('flow_pending','1')});await x.refresh();assert.equal(x.saved.has('bankAccounts'),false);assert.equal(x.flushes(),0);
});
test('retry stops across an account switch and never loops on another owner',async()=>{
 const x=setup({connectionFailure:true});await x.refresh(false);assert.equal(x.timers.size,1);
 x.saved.set('flow_user_id','other');await x.advance(60000);assert.equal(x.calls.length,1);assert.equal(x.timers.size,0);
});
test('blocked session storage still keeps successful checks throttled',async()=>{
 const x=setup({blockSession:true});await x.event('focus');await x.event('online');assert.deepEqual(x.calls,['connections','accounts']);assert.equal(x.timers.size,0);
});

test('a payday check shares an in-progress cached fetch and receives an honest outcome',async()=>{
 const x=setup();const a=x.refresh(),b=x.refresh();assert.equal(a,b);assert.equal((await b).status,'checked');assert.deepEqual(x.calls,['connections','accounts']);
 assert.equal((await setup({unavailable:true}).refresh()).status,'unavailable');
 assert.equal((await setup({reconnect:true}).refresh()).status,'unavailable');
 const offline=setup();offline.context.navigator.onLine=false;assert.equal((await offline.refresh()).status,'unavailable');assert.equal(offline.calls.length,0);
});

test('replacement-server preparation keeps cached balances and does not query empty bank tables',async()=>{
 const app=setup();app.context.flowBankRecoveryPaused=true;
 const saved='[{"id":"retained-balance"}]';app.saved.set('bankAccounts',saved);
 assert.equal((await app.refresh()).status,'unavailable');
 assert.equal(app.saved.get('bankAccounts'),saved);assert.deepEqual(app.calls,[]);assert.equal(app.flushes(),0);
});
