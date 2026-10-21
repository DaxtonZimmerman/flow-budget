const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function app(options={}){
 const saved=new Map([['flow_user_id','owner'],['transactions','private'],['flow_verified_user','owner'],['flow_recovery_v1:owner','protected recovery']]),calls=[],redirects=[];
 if(options.pending)saved.set('flow_pending','1');
 const document={querySelector:s=>s==='#search-month'?{}:s==='#install-steps'?{appendChild:()=>{}}:null,querySelectorAll:()=>[],addEventListener:()=>{},createElement:()=>({})};
 const context={document,URL,Promise,navigator:{userAgent:'',platform:'',maxTouchPoints:0},flowStorage:{getItem:k=>saved.get(k)??null,removeItem:k=>saved.delete(k)},FlowAuth:{ready:Promise.resolve(),authorized:true,user:{id:options.wrongOwner?'other':'owner'}},getFlowClient:()=>({auth:{signOut:async values=>{calls.push(values);return options.failed?{error:{message:'Failed'}}:{error:null};}}}),matchMedia:()=>({matches:false,addEventListener:()=>{}}),addEventListener:()=>{},location:{replace:url=>redirects.push(url)}};context.window=context;
 vm.runInNewContext(fs.readFileSync(__dirname+'/../js/app-shell.js','utf8'),context);
 return {saved,calls,redirects,context,signOut:()=>context.FlowApp.signOut()};
}
test('profile sign-out ends only this device session and clears private working data',async()=>{
 const x=app();await x.signOut();assert.equal(x.calls[0].scope,'local');assert.equal(x.saved.has('transactions'),false);assert.equal(x.saved.has('flow_user_id'),false);assert.equal(x.saved.get('flow_recovery_v1:owner'),'protected recovery');assert.deepEqual(x.redirects,['login.html']);
});
test('pending edits and a different owner block sign-out without touching data',async()=>{
 for(const options of [{pending:true},{wrongOwner:true}]){const x=app(options);await assert.rejects(x.signOut());assert.equal(x.calls.length,0);assert.equal(x.saved.get('transactions'),'private');assert.equal(x.redirects.length,0);}
});
test('a failed provider sign-out preserves the workspace and permits retry',async()=>{
 const x=app({failed:true});await assert.rejects(x.signOut(),/try again/);assert.equal(x.context.FlowAuth.handlingSignOut,false);assert.equal(x.saved.get('transactions'),'private');assert.equal(x.redirects.length,0);
});
