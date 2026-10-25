const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function app(options={}){
 const user={id:'synthetic-owner'},saved=new Map([['flow_user_id',user.id],['flow_verified_user',user.id]]),redirects=[],timers=new Map(),delays=new Map(),listeners={};let timerId=0;
 let session={data:{session:{user,expires_at:Math.floor(Date.now()/1000)+3600}},error:null},verification={data:{user},error:null},authEvent,panel;
 const document={currentScript:{src:'https://flow.invalid/js/auth-gate.js'},readyState:'complete',hidden:false,documentElement:{dataset:{}},body:{appendChild:value=>{panel=value;}},
  addEventListener:()=>{},dispatchEvent:()=>{},querySelector:selector=>selector==='.flow-auth-loading'?panel:null,
  createElement:()=>{const nodes=new Map();return {dataset:{},querySelector:selector=>{if(!nodes.has(selector))nodes.set(selector,{textContent:'',addEventListener:()=>{}});return nodes.get(selector);},remove:()=>{panel=null;}};}};
 const client={auth:{getSession:async()=>session,getUser:async()=>verification,onAuthStateChange:fn=>{authEvent=fn;}}};
 const context={document,URL,URLSearchParams,Date,Promise,Event,getFlowClient:()=>client,flowAuthStorage:{status:()=>({})},matchMedia:()=>({matches:false}),navigator:{onLine:options.online!==false},
 localStorage:{getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)},sessionStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
 location:{href:'https://flow.invalid/index.html',pathname:'/index.html',hash:'',search:'',replace:url=>redirects.push(url),reload:()=>{}},
 setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,fn);delays.set(id,delay);return id;},clearTimeout:id=>{timers.delete(id);delays.delete(id);},addEventListener:(name,fn)=>{listeners[name]=fn;}};
 context.window=context;
 if(options.session)session=options.session;if(options.verification)verification=options.verification;
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/auth-gate.js'),'utf8'),context);
 return{context,redirects,timers,saved,panel:()=>panel,ready:context.FlowAuth.ready,setSession:value=>{session=value;},setVerification:value=>{verification=value;},validSession:()=>({data:{session:{user,expires_at:Math.floor(Date.now()/1000)+3600}},error:null}),verify:()=>context.FlowAuth.recheck(),signedOut:()=>authEvent('SIGNED_OUT',null),async fire(delay){for(const [id,fn] of [...timers])if(delays.get(id)===delay){timers.delete(id);delays.delete(id);fn();}for(let i=0;i<12;i++)await Promise.resolve();}};
}
test('a temporary session-restore error waits and retries without asking for another email',async()=>{
 const a=app({session:{data:{session:null},error:{name:'AuthRetryableFetchError',status:503}}});await a.ready;
 assert.equal(a.redirects.length,0);assert.equal(a.context.FlowAuth.authorized,false);assert.equal(a.timers.size,1);
 a.setSession(a.validSession());await a.verify();assert.equal(a.context.FlowAuth.authorized,true);assert.equal(a.redirects.length,0);assert.equal(a.timers.size,0);
});
test('a transient verification failure keeps the workspace locked and restores it when verification succeeds',async()=>{
 const a=app({verification:{data:{user:null},error:{name:'AuthApiError',status:500}}});await a.ready;
 assert.equal(a.redirects.length,0);assert.equal(a.context.FlowAuth.authorized,false);
 a.setVerification({data:{user:{id:'synthetic-owner'}},error:null});await a.verify();assert.equal(a.context.FlowAuth.authorized,true);
});
test('an expired offline session waits for reconnection instead of discarding the saved sign-in',async()=>{
 const a=app({online:false,session:{data:{session:{user:{id:'synthetic-owner'},expires_at:1}},error:null}});await a.ready;
 assert.equal(a.redirects.length,0);assert.equal(a.context.FlowAuth.authorized,false);assert.equal(a.timers.size,0);
});
test('a workspace owner marker never replaces a missing auth session',async()=>{
 const a=app({session:{data:{session:null},error:null}});await a.ready;
 assert.equal(a.context.FlowAuth.authorized,false);assert.equal(a.redirects.length,1);assert.match(a.redirects[0],/reason=missing/);
});
test('revoked sessions remain blocked, with only one redirect even if sign-out also fires',async()=>{
 const a=app({verification:{data:{user:null},error:{name:'AuthApiError',status:401}}});await a.ready;a.signedOut();
 for(const fn of a.timers.values())fn();
 assert.equal(a.context.FlowAuth.authorized,false);assert.equal(a.redirects.length,1);assert.match(a.redirects[0],/reason=expired/);
});

test('normal loading shows branding without recovery buttons; recovery exposes a clear retry',async()=>{
 const a=app();assert.equal(a.panel().dataset.phase,'opening');assert.equal(a.panel().querySelector('.flow-loader-actions').hidden,true);await a.ready;
 const b=app({verification:{data:{user:null},error:{name:'AuthApiError',status:500}}});await b.ready;
 assert.equal(b.panel().dataset.phase,'recovery');assert.equal(b.panel().querySelector('.flow-loader-actions').hidden,false);assert.equal(b.context.FlowAuth.authorized,false);
});

test('a stalled session read exits the spinner, keeps saved work locked, and retries automatically',async()=>{
 const a=app({session:new Promise(()=>{})});
 a.saved.set('transactions','[{"id":"kept"}]');
 await a.fire(12000);await a.ready;
 assert.equal(a.context.FlowAuth.authorized,false);assert.equal(a.context.FlowAuth.checking,false);
 assert.equal(a.panel().dataset.phase,'recovery');assert.equal(a.panel().querySelector('.flow-loader-actions').hidden,false);
 assert.equal(a.saved.get('transactions'),'[{"id":"kept"}]');assert.equal(a.redirects.length,0);
 a.setSession(a.validSession());await a.fire(10000);
 assert.equal(a.context.FlowAuth.authorized,true);assert.equal(a.context.document.documentElement.dataset.flowAuth,'ready');assert.equal(a.timers.size,0);
});

test('a late verification cannot unlock an expired attempt or overwrite a newer sign-in decision',async()=>{
 let release;const pending=new Promise(resolve=>{release=resolve;});const a=app({verification:pending});
 for(let i=0;i<12;i++)await Promise.resolve();await a.fire(12000);await a.ready;
 assert.equal(a.context.FlowAuth.authorized,false);assert.equal(a.context.FlowAuth.checking,false);
 a.setSession({data:{session:null},error:null});await a.fire(10000);
 release({data:{user:{id:'synthetic-owner'}},error:null});for(let i=0;i<12;i++)await Promise.resolve();
 assert.equal(a.context.FlowAuth.authorized,false);assert.equal(a.context.document.documentElement.dataset.flowAuth,'checking');
 assert.equal(a.redirects.length,1);assert.match(a.redirects[0],/reason=missing/);
});

test('signing out while verification is pending cannot reveal the former account',async()=>{
 let release;const a=app({verification:new Promise(resolve=>{release=resolve;})});
 for(let i=0;i<12;i++)await Promise.resolve();a.signedOut();
 release({data:{user:{id:'synthetic-owner'}},error:null});for(let i=0;i<12;i++)await Promise.resolve();await a.fire(0);
 assert.equal(a.context.FlowAuth.authorized,false);assert.equal(a.redirects.length,1);
});
