const test=require('node:test'),assert=require('node:assert/strict');
const endpoint='https://web.push.apple.com/Qsynthetic',sub={endpoint,keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}};
const envs={SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server',PLAID_PILOT_USER_ID:'owner',FLOW_PUSH_PUBLIC_KEY:'A'.repeat(87),FLOW_PUSH_PRIVATE_KEY:'B'.repeat(43),FLOW_PUSH_SCHEDULE_SECRET:'S'.repeat(48)};
function fixture(options={}){
 const calls=[],devices=options.devices||[],ledger=new Map(),sent=[];
 const saved=options.snapshot;
 const db={from:table=>{
  let filters=[],mode='read',values,limit=Infinity;
  const q={select:()=>q,eq:(k,v)=>(filters.push([k,v]),q),in:(k,v)=>(filters.push([k,v,true]),q),limit:v=>(limit=v,q),insert:v=>(mode='insert',values=v,q),update:v=>(mode='update',values=v,q),delete:()=>(mode='delete',q),maybeSingle:async()=>{const r=await run();return {...r,data:Array.isArray(r.data)?r.data[0]||null:r.data};},then:(...a)=>run().then(...a)};
  async function run(){calls.push({table,mode,filters,values});let rows=table==='flow_push_subscriptions'?devices:table==='flow_push_deliveries'?[...ledger.values()]:table==='flow_data'?[{user_id:'owner',data:saved}]:[];
   const matches=r=>filters.every(([k,v,multi])=>multi?v.includes(r[k]):r[k]===v);let result=rows.filter(matches).slice(0,limit);
   if(mode==='insert'){const row={id:'device-'+devices.length,...values};devices.push(row);result=[row];}
   if(mode==='update')for(const r of result)Object.assign(r,values);
   if(mode==='delete')for(const r of result){const index=devices.indexOf(r);if(index>=0)devices.splice(index,1);}
   return {data:result,error:null};
  }return q;
 },rpc:async(_,{p_subscription,p_event})=>{const key=p_subscription+':'+p_event;if(ledger.has(key))return {data:false};ledger.set(key,{subscription_id:p_subscription,event_key:p_event,state:'sending'});return {data:true};}};
 const deps={env:k=>options.missingKey&&k==='FLOW_PUSH_PRIVATE_KEY'?undefined:envs[k],createClient:(_,key)=>key==='public'?{auth:{getUser:async token=>({data:{user:token==='valid'?{id:'owner',email_confirmed_at:'2026-10-01'}:token==='other'?{id:'other',email_confirmed_at:'2026-10-01'}:null}})}}:db,
  send:async(...args)=>{sent.push(args);if(options.sendError)throw options.sendError;},now:()=>options.now||Date.parse('2026-10-29T16:05:00Z')};
 return {deps,calls,devices,ledger,sent};
}
const request=(body,token='valid',origin='https://daxtonzimmerman.github.io')=>new Request('https://test/functions/v1/flow-notifications',{method:'POST',headers:{Authorization:'Bearer '+token,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('subscription handler authenticates the verified pilot, rejects cross-site and private-network endpoints, and exposes only the public key',async()=>{
 const {handleNotificationRequest,validPushSubscription}=await import('../supabase/functions/flow-notifications/handler.mjs');const x=fixture();
 assert.equal((await handleNotificationRequest(request({action:'status'},'invalid'),x.deps)).status,401);
 assert.equal((await handleNotificationRequest(request({action:'status'},'other'),x.deps)).status,403);
 assert.equal((await handleNotificationRequest(request({action:'status'},'valid','https://evil.invalid'),x.deps)).status,403);
 for(const e of ['http://web.push.apple.com/a','https://127.0.0.1/a','https://web.push.apple.com.evil.invalid/a','https://user@web.push.apple.com/a'])assert.equal(validPushSubscription({...sub,endpoint:e}),false);
 assert.equal(validPushSubscription(sub),true);
 const r=await handleNotificationRequest(request({action:'status'}),x.deps),body=await r.json();assert.equal(body.ready,true);assert.equal(body.publicKey,envs.FLOW_PUSH_PUBLIC_KEY);assert.equal('privateKey' in body,false);
});
test('registering a device uses the verified owner and cannot steal another account subscription',async()=>{
 const {handleNotificationRequest}=await import('../supabase/functions/flow-notifications/handler.mjs');let x=fixture();
 const r=await handleNotificationRequest(request({action:'subscribe',subscription:sub,timeZone:'America/Denver',user_id:'other'}),x.deps);assert.equal(r.status,200);assert.equal(x.devices[0].user_id,'owner');assert.equal(x.devices[0].time_zone,'America/Denver');
 x=fixture({devices:[{id:'private',user_id:'other',endpoint,subscription:sub}]});assert.equal((await handleNotificationRequest(request({action:'subscribe',subscription:sub,timeZone:'UTC'}),x.deps)).status,409);
 assert.equal((await handleNotificationRequest(request({action:'subscribe',subscription:sub,timeZone:'invalid'}),x.deps)).status,400);
});
test('device removal is owner-scoped and test pushes contain no account information',async()=>{
 const {handleNotificationRequest}=await import('../supabase/functions/flow-notifications/handler.mjs');const x=fixture({devices:[{id:'d',user_id:'owner',endpoint,subscription:sub,enabled:true}]});
 assert.equal((await handleNotificationRequest(request({action:'test',subscription:sub}),x.deps)).status,200);assert.equal(x.sent.length,1);assert.match(x.sent[0][1],/You’re all set/);assert.equal((await handleNotificationRequest(request({action:'test',subscription:sub}),x.deps)).status,429);
 assert.equal((await handleNotificationRequest(request({action:'unsubscribe',subscription:sub}),x.deps)).status,200);assert.equal(x.devices.length,0);
});
async function deliverySnapshot(){const {buildNotifications}=await import('../supabase/functions/_shared/notification-engine.mjs');const s={flowPlanning:{version:1,setup:{step:5,completed:true},periodStartedOn:'2026-10-23',selectedAccountIds:[],manualBalance:{cents:100000,date:'2026-10-29'},payday:{nextDate:'2026-11-06',frequency:'biweekly'},bills:[{id:'private-bill',name:'PRIVATE BILL NAME',amountCents:12345,nextDate:'2026-10-30',frequency:'monthly'}],billPaymentDecisions:[],dismissedBillSuggestions:[],billsConfirmed:true,essentials:[],cushionCents:0,reservesConfirmed:true,preferences:{billReminders:true,autoCategories:true}},transactions:[],bankAccounts:[],budgets:[],budgetsByMonth:{}};assert.equal(buildNotifications(s,'2026-10-29',Date.parse('2026-10-29T16:05:00Z')).length,1);return s;}
const scheduled=()=>new Request('https://test/functions/v1/flow-notification-delivery',{method:'POST',headers:{'x-flow-schedule-secret':envs.FLOW_PUSH_SCHEDULE_SECRET}});
test('scheduled pushes require a private schedule secret, respect device quiet hours and deduplicate concurrent delivery runs',async()=>{
 const {deliverNotifications}=await import('../supabase/functions/flow-notification-delivery/handler.mjs');const snapshot=await deliverySnapshot(),device={id:'d',user_id:'owner',subscription:sub,time_zone:'America/Denver',enabled:true};
 const x=fixture({snapshot,devices:[device]});assert.equal((await deliverNotifications(new Request('https://test',{method:'POST'}),x.deps)).status,401);assert.equal(x.calls.length,0);
 await Promise.all([deliverNotifications(scheduled(),x.deps),deliverNotifications(scheduled(),x.deps)]);assert.equal(x.sent.length,1);assert.equal(x.sent[0][1].includes('PRIVATE BILL'),false);assert.equal(x.sent[0][1].includes('12345'),false);
 await deliverNotifications(scheduled(),x.deps);assert.equal(x.sent.length,1);
 const quiet=fixture({snapshot,devices:[device],now:Date.parse('2026-10-29T04:00:00Z')});await deliverNotifications(scheduled(),quiet.deps);assert.equal(quiet.sent.length,0);
});
test('expired push destinations are removed without touching the saved workspace or bank connection',async()=>{
 const {deliverNotifications}=await import('../supabase/functions/flow-notification-delivery/handler.mjs');const x=fixture({snapshot:await deliverySnapshot(),devices:[{id:'d',user_id:'owner',subscription:sub,time_zone:'America/Denver',enabled:true}],sendError:{statusCode:410}});
 const r=await deliverNotifications(scheduled(),x.deps);assert.equal(r.status,200);assert.equal(x.devices.length,0);assert.equal(x.calls.some(c=>c.table==='flow_data'&&c.mode!=='read'),false);assert.equal(x.calls.some(c=>/plaid/.test(c.table)),false);
});
