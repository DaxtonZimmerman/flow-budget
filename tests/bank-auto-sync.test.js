const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),test=require('node:test'),vm=require('node:vm');
function makeApp(options={}){
 const saved=options.saved||new Map([['flow_user_id','person-1']]),session=new Map(),actions=[],events=[],timers=[],listeners={window:new Map(),document:new Map()};let clock=Date.parse('2026-10-19T16:00:00Z'),saves=0,cloudChecks=0,failed=false,authOwner='person-1',rows=[{transaction_id:'t1',account_id:'cash',amount:12.5,date:'2026-10-19',name:'Test Market',pending:false}],serverSyncedAt=null,feedStatus=options.feedStatus;
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 const listen=target=>(name,fn)=>{if(!listeners[target].has(name))listeners[target].set(name,[]);listeners[target].get(name).push(fn);};
 const context=vm.createContext({Date:ClockDate,Event,CustomEvent,localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>{if(options.blockFeedStorage&&k.startsWith('flow_bank_feed:'))throw Error('Status cache full');saved.set(k,v);},removeItem:k=>saved.delete(k)},sessionStorage:{getItem:k=>session.get(k)??null,setItem:(k,v)=>session.set(k,v)},navigator:{onLine:true},getFlowClient:()=>options.noClient?null:({auth:{getUser:async()=>({data:{user:{id:authOwner}},error:null})},functions:{invoke:async(_name,request)=>{
 const action=request.body.action;actions.push(action);if(failed||action==='sync'&&options.syncFailure)throw Error('Unavailable');
 if(action==='connections'){if(options.duringConnections)await options.duringConnections(saved);return {data:{connections:[{id:'bank-1',recovery_required:options.recoveryRequired,needs_reconnect:options.reconnect,last_synced_at:serverSyncedAt,institution_name:'Test Bank',transaction_status:feedStatus}]},error:null};}
 if(options.duringSync)await options.duringSync(saved);
 return {data:{transactions:rows,last_synced_at:new Date(clock).toISOString(),transaction_status:feedStatus},error:null};
 }}}),getFlowSnapshot:()=>({transactions:JSON.parse(saved.get('transactions')||'[]')}),flowDataChanged:async()=>{saves++;},refreshFlowDataViews:()=>events.push('view-refresh'),document:{hidden:false,addEventListener:listen('document'),dispatchEvent:event=>{events.push(event.type);for(const fn of listeners.document.get(event.type)||[])fn(event);},querySelector:()=>null},window:{addEventListener:listen('window'),location:{reload:()=>{throw Error('Sync must not reload the page');}}},setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;}});
 context.flowSync=async()=>{cloudChecks++;if(options.cloudBlocked)return false;context.document.dispatchEvent(new Event('flow-cloud-ready'));return true;};
 for(const file of ['bank-status.js','bank-data.js','bank-auto-sync.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js',file),'utf8'),context);
 return {saved,actions,events,context,timers,run:()=>vm.runInContext('updateBanksAutomatically()',context),force:()=>vm.runInContext('checkBanksOnReturn(true)',context),status:()=>vm.runInContext('bankSyncState',context),rows:value=>{rows=value;},feed:value=>{feedStatus=value;},advance:ms=>{clock+=ms;},webhook:()=>{serverSyncedAt=new Date(clock).toISOString();},fail:value=>{failed=value;},auth:value=>{authOwner=value;},saves:()=>saves,cloudChecks:()=>cloudChecks,tick:async()=>{const timer=timers.shift();clock+=timer.delay;await timer.fn();},emit:async(target,name,event={})=>{for(const fn of listeners[target].get(name)||[])await fn(event);await new Promise(setImmediate);}};
}
test('opening Flow imports available data once, with a visible status and no page reload',async()=>{
 const a=makeApp();await a.run();await a.run();assert.deepEqual(a.actions,['connections','sync']);assert.equal(a.saves(),1);assert.ok(a.events.includes('view-refresh'));assert.equal(JSON.parse(a.saved.get('transactions')).length,1);assert.match(a.status().message,/checked for bank updates/i);
 a.advance(60000);await a.run();assert.deepEqual(a.actions,['connections','sync','connections']);
});
test('a visible app checks each minute and pulls a new webhook snapshot without waiting 15 minutes',async()=>{
 const a=makeApp();await a.run();a.advance(1000);a.webhook();a.rows([{transaction_id:'transfer',account_id:'cash',amount:25,date:'2026-10-19',name:'Account transfer',pending:true}]);await a.tick();assert.deepEqual(a.actions,['connections','sync','connections','sync']);assert.equal(a.cloudChecks(),1);assert.equal(a.timers.length,1);const rows=JSON.parse(a.saved.get('transactions'));assert.equal(rows[0].name,'Account transfer');assert.equal(rows[0].status,'pending');
});
test('normal incremental sync remains a 15-minute fallback and never calls a forced refresh endpoint',async()=>{
 const a=makeApp();await a.run();for(let i=0;i<15;i++)await a.tick();assert.equal(a.actions.filter(x=>x==='sync').length,2);assert.ok(a.actions.every(x=>['connections','sync'].includes(x)));
});
test('focus, return to a visible tab, and connectivity recovery resume checks without duplicate requests',async()=>{
 const a=makeApp();await a.run();a.advance(60000);await a.emit('window','focus');await a.emit('document','visibilitychange');assert.equal(a.actions.filter(x=>x==='connections').length,2);
 a.context.navigator.onLine=false;a.advance(60000);await a.emit('window','offline');await a.tick();assert.equal(a.actions.filter(x=>x==='connections').length,2);assert.equal(a.status().phase,'offline');a.context.navigator.onLine=true;await a.emit('window','online');assert.equal(a.actions.filter(x=>x==='connections').length,3);
});
test('hidden tabs, signed-out copies, missing clients, and unsaved changes cannot poll banks',async()=>{
 const a=makeApp();a.context.document.hidden=true;await a.tick();assert.equal(a.actions.length,0);a.context.document.hidden=false;a.saved.set('flow_pending','1');await a.run();assert.equal(a.actions.length,0);assert.equal(a.status().phase,'waiting');a.saved.delete('flow_user_id');await a.tick();assert.equal(a.actions.length,0);assert.equal(a.status().phase,'none');const b=makeApp({noClient:true});await b.tick();assert.equal(b.actions.length,0);
 const c=makeApp({cloudBlocked:true});await c.tick();assert.equal(c.actions.length,0);assert.equal(c.status().phase,'waiting');
});
test('a manual check reads available updates but is limited against repeated clicks',async()=>{
 const a=makeApp();await a.run();a.advance(11000);await a.force();await a.force();assert.equal(a.actions.filter(x=>x==='sync').length,2);assert.equal(a.actions.filter(x=>x==='connections').length,2);
});
test('failed banks back off and recover automatically while reconnect warnings stay visible',async()=>{
 const a=makeApp();a.fail(true);await a.run();await a.tick();await a.tick();assert.equal(a.actions.length,2);assert.equal(a.status().phase,'error');a.fail(false);await a.tick();assert.equal(a.actions.length,4);assert.equal(a.status().phase,'ready');
 const b=makeApp({reconnect:true});await b.run();assert.deepEqual(b.actions,['connections']);assert.equal(b.status().phase,'reconnect');
});
test('an account switch while a request is in flight cannot write another owner’s transactions',async()=>{
 const a=makeApp({duringSync:s=>s.set('flow_user_id','person-2')});await a.run();assert.equal(a.saved.has('transactions'),false);assert.equal(a.saves(),0);assert.equal(a.saved.has('flow_bank_applied_at_person-2_bank-1'),false);assert.equal(a.status().phase,'none');
 const b=makeApp({duringConnections:s=>s.set('flow_user_id','person-2')});await b.run();assert.deepEqual(b.actions,['connections']);assert.equal(b.saved.has('transactions'),false);
 const c=makeApp();c.auth('other');await c.run();assert.equal(c.actions.length,0);assert.equal(c.status().phase,'signin');
});
test('a disconnect in flight prevents a late bank response from restoring transactions',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),a=makeApp({duringSync:()=>gate});const job=a.run();await new Promise(setImmediate);vm.runInContext("bankDisconnectingIds.add('bank-1')",a.context);release();await job;assert.equal(a.saved.has('transactions'),false);assert.equal(a.saves(),0);
});
test('manual and automatic requests for the same bank share one in-flight request',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),a=makeApp({duringSync:()=>gate});const first=vm.runInContext("syncBankConnection('bank-1')",a.context),second=vm.runInContext("syncBankConnection('bank-1')",a.context);release();await Promise.all([first,second]);assert.deepEqual(a.actions,['sync']);assert.equal(a.saves(),1);
});
test('visible copies share the check timestamp, while storage updates refresh their views',async()=>{
 const shared=new Map([['flow_user_id','person-1']]),a=makeApp({saved:shared}),b=makeApp({saved:shared});await a.run();await b.run();assert.equal(b.actions.length,0);await b.emit('window','storage',{key:'transactions'});assert.ok(b.events.includes('view-refresh'));await b.emit('window','storage',{key:'flow_bank_checked_at_person-1'});assert.match(b.status().message,/checked for bank updates/);
});
test('new bank data merges with the latest saved category and note instead of replacing user choices',async()=>{
 const a=makeApp();await a.run();const rows=JSON.parse(a.saved.get('transactions'));rows[0].category='Food';rows[0].notes='Keep this note';rows[0].reviewStatus='reviewed';a.saved.set('transactions',JSON.stringify(rows));a.advance(61000);a.webhook();await a.run();const current=JSON.parse(a.saved.get('transactions'));assert.equal(current[0].category,'Food');assert.equal(current[0].notes,'Keep this note');assert.equal(current.length,1);
});


test('a newer bank feed triggers an immediate free import even before its webhook reaches Flow',async()=>{
 const a=makeApp({feedStatus:{last_successful_update:'2026-10-19T15:00:00Z'}});await a.run();
 a.advance(60000);await a.run();assert.equal(a.actions.filter(x=>x==='sync').length,1);
 a.feed({last_successful_update:'2026-10-19T16:01:00Z'});a.rows([{transaction_id:'new',account_id:'cash',amount:9,date:'2026-10-19',name:'New pending payment',pending:true}]);a.advance(60000);await a.run();
 assert.equal(a.actions.filter(x=>x==='sync').length,2);assert.equal(JSON.parse(a.saved.get('transactions'))[0].status,'pending');
 assert.equal(a.context.bankFeedNeedsImport('bank-1','person-1'),false);assert.ok(a.actions.every(x=>['connections','sync'].includes(x)));
});
test('failed imports leave the newer feed unapplied and recover on the automatic retry',async()=>{
 const options={feedStatus:{last_successful_update:'2026-10-19T15:00:00Z'}},a=makeApp(options);await a.run();
 options.syncFailure=true;a.feed({last_successful_update:'2026-10-19T16:00:00Z'});a.advance(60000);await a.run();assert.equal(a.context.bankFeedNeedsImport('bank-1','person-1'),true);assert.equal(a.status().phase,'error');
 options.syncFailure=false;a.advance(60000);await a.run();assert.equal(a.context.bankFeedNeedsImport('bank-1','person-1'),false);assert.equal(a.status().phase,'ready');
});
test('an unavailable status cache cannot block bank imports or alter the saved account',async()=>{
 const a=makeApp({blockFeedStorage:true,feedStatus:{last_successful_update:'2026-10-19T15:00:00Z'}});await a.run();assert.equal(JSON.parse(a.saved.get('transactions')).length,1);assert.equal(a.saves(),1);assert.equal(a.status().phase,'ready');assert.equal(a.saved.has('flow_bank_feed:person-1'),false);
});

test('server recovery pauses bank requests while keeping saved transactions untouched',async()=>{
 const app=makeApp();app.saved.set('transactions','[{"id":"saved-before-outage"}]');
 vm.runInContext('var flowBankRecoveryPaused=true',app.context);
 await app.run();await app.force();
 assert.deepEqual(app.actions,[]);assert.equal(app.saves(),0);
 assert.equal(JSON.parse(app.saved.get('transactions'))[0].id,'saved-before-outage');
});

test('a staged replacement is never imported by minute checks or manual background checks',async()=>{
 const a=makeApp({recoveryRequired:true});a.saved.set('transactions','[{"id":"old-history"}]');await a.run();await a.force();
 assert.deepEqual(a.actions,['connections']);assert.equal(a.status().phase,'recovery');assert.equal(JSON.parse(a.saved.get('transactions'))[0].id,'old-history');assert.equal(a.saves(),0);
});
