const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function app(fetch){
 const timers=new Map();let serial=0,clientOptions;
 const context={URL,AbortController,fetch,flowCloudUrl:'https://flow-test.supabase.co',flowCloudKey:'synthetic-public-key',
  supabase:{createClient:(_url,_key,options)=>{clientOptions=options;return {}; }},localStorage:{},
  document:{addEventListener:()=>{}},window:{addEventListener:()=>{}},
  setTimeout:(fn,delay)=>{const id=++serial;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/cloud-sync.js'),'utf8'),context);
 return {context,timers,options:()=>clientOptions,expire:()=>{for(const {fn} of [...timers.values()])fn();}};
}
test('stalled auth requests abort so SDK session refreshes can release their lock',async()=>{
 let signal;const a=app((_input,options)=>new Promise((_,reject)=>{signal=options.signal;signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});}));
 a.context.getFlowClient();assert.equal(a.options().global.fetch,a.context.flowAuthFetch);
 const request=a.context.flowAuthFetch('https://flow-test.supabase.co/auth/v1/user');
 assert.equal(a.timers.size,1);assert.equal([...a.timers.values()][0].delay,8000);a.expire();
 await assert.rejects(request,/aborted/);assert.equal(signal.aborted,true);assert.equal(a.timers.size,0);
});
test('caller cancellation and successful auth requests retain their original headers and release timers',async()=>{
 const caller=new AbortController();let actual;const a=app(async(_input,options)=>{actual=options;return {ok:true};});
 await a.context.flowAuthFetch('https://flow-test.supabase.co/auth/v1/user',{headers:{apikey:'synthetic-public-key'},signal:caller.signal});
 assert.equal(actual.headers.apikey,'synthetic-public-key');assert.equal(a.timers.size,0);caller.abort();assert.equal(actual.signal.aborted,false);
 const b=app((_input,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true})));
 const other=new AbortController();const pending=b.context.flowAuthFetch('https://flow-test.supabase.co/auth/v1/token',{signal:other.signal});other.abort();
 await assert.rejects(pending,/cancelled/);assert.equal(b.timers.size,0);
});
test('bank imports and other origins do not inherit the short sign-in timeout',async()=>{
 const calls=[];const a=app(async(input,options)=>{calls.push({input,options});return {ok:true};});const options={headers:{test:'kept'}};
 await a.context.flowAuthFetch('https://flow-test.supabase.co/functions/v1/plaid',options);
 await a.context.flowAuthFetch('https://other.invalid/auth/v1/user',options);
 assert.equal(a.timers.size,0);assert.equal(calls[0].options,options);assert.equal(calls[1].options,options);
});
test('a stalled account read times out without changing data and a later retry can succeed',async()=>{
 const a=app(async()=>({ok:true}));let finish;
 const client={from:()=>({select:()=>({eq:()=>({maybeSingle:()=>new Promise(resolve=>finish=resolve)})})})};
 const pending=a.context.getCloudData(client,'owner');assert.equal([...a.timers.values()][0].delay,10000);a.expire();
 await assert.rejects(pending,/took too long/);assert.equal(a.timers.size,0);
 finish({data:{revision:2,data:{transactions:[]}},error:null});
 client.from=()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{revision:3},error:null})})})});
 assert.equal((await a.context.getCloudData(client,'owner')).revision,3);assert.equal(a.timers.size,0);
});
