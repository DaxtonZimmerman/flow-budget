import { buildNotifications, flowNotificationClock } from '../_shared/notification-engine.mjs';
import { pushOptions, validPushSubscription } from '../flow-notifications/handler.mjs';
const response=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
function sameSecret(a,b) {
    if(typeof a!=='string'||typeof b!=='string'||b.length<32)return false;
    let diff=a.length^b.length;
    for(let i=0;i<b.length;i++)diff|=(a.charCodeAt(i)||0)^b.charCodeAt(i);
    return diff===0;
}
function pushRetryAt(error,now,attempts) {
    // RFC 8030 explicitly identifies 429 as rejection, rather than uncertain
    // acceptance. Do not automatically resend timeouts or generic 5xx errors.
    if(error.statusCode!==429 || attempts>=3)return null;
    const value=error.headers?.['retry-after']??error.headers?.get?.('retry-after');
    const seconds=typeof value==='string'&&/^\d+$/.test(value.trim())?Number(value):null;
    const requested=seconds!==null?now+seconds*1000:Date.parse(value);
    return new Date(Math.max(now+300000*2**(attempts-1),Number.isFinite(requested)?requested:0)).toISOString();
}
async function recordClaims(db,subscription,events,values) {
    // Event keys contain JSON quotes and commas. Older PostgREST clients do not
    // escape these correctly inside in(...); exact equality preserves the key.
    for(const event of events) {
        const result=await db.from('flow_push_deliveries').update(values)
            .eq('subscription_id',subscription).eq('event_key',event).select('event_key').maybeSingle();
        if(result.error)throw result.error;
        if(result.data?.event_key!==event)throw new Error('Reminder claim could not be recorded.');
    }
}
export async function deliverNotifications(request,deps) {
    if(request.method!=='POST')return response(405,{error:'Use POST.'});
    if(!sameSecret(request.headers.get('x-flow-schedule-secret'),deps.env('FLOW_PUSH_SCHEDULE_SECRET')))return response(401,{error:'Unauthorized.'});
    const options=pushOptions(deps.env),pilot=deps.env('PLAID_PILOT_USER_ID');
    if(!options||!pilot)return response(503,{error:'Delivery is not configured.'});
    const now=deps.now?.()??Date.now();
    try {
        const raw=await request.text();
        if(raw.length>1024)return response(413,{error:'Request too large.'});
        let input;try{input=raw?JSON.parse(raw):{};}catch{return response(400,{error:'Invalid request.'});}
        if(!input||typeof input!=='object'||Array.isArray(input)||input.action!==undefined&&input.action!=='test')return response(400,{error:'Unsupported action.'});
        const db=deps.createClient(deps.env('SUPABASE_URL'),deps.env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
        const devices=await db.from('flow_push_subscriptions').select('id,user_id,subscription,time_zone').eq('user_id',pilot).eq('enabled',true).limit(5);
        if(devices.error)throw devices.error;
        if(!devices.data.length)return response(200,{sent:0});
        // An explicitly requested test uses the same private sender and saved
        // destinations. It never creates fake bills or consumes real alerts.
        if(input.action==='test') {
            let sent=0;
            const key='manual-test:'+Math.floor(now/60000);
            for(const device of devices.data) {
                if(!validPushSubscription(device.subscription))continue;
                const claim=await db.rpc('claim_flow_push',{p_subscription:device.id,p_event:key});
                if(claim.error)throw claim.error;if(!claim.data)continue;
                await deps.send(device.subscription,JSON.stringify({title:'Flow.',body:'Here’s your Flow alert. Notifications are working.',tag:'flow-test',href:'index.html#notifications'}),options);
                await recordClaims(db,device.id,[key],{state:'sent',sent_at:new Date(now).toISOString(),retry_at:null});
                sent++;
            }
            return response(200,{sent,test:true});
        }
        const saved=await db.from('flow_data').select('data').eq('user_id',pilot).maybeSingle();
        if(saved.error)throw saved.error;
        if(!saved.data)return response(200,{sent:0});
        let sent=0,failed=0;
        for(const device of devices.data) {
            const clock=flowNotificationClock(device.time_zone,now);
            if(!clock||clock.hour<9||clock.hour>=20||!validPushSubscription(device.subscription))continue;
            const alerts=buildNotifications(saved.data.data,clock.today,now).filter(item=>item.push);
            if(!alerts.length)continue;
            const prior=await db.from('flow_push_deliveries').select('event_key,state,retry_at,attempts').eq('subscription_id',device.id);
            if(prior.error)throw prior.error;
            const seen=new Set(prior.data.filter(r=>!(r.state==='failed'&&r.retry_at&&Date.parse(r.retry_at)<=now&&r.attempts<3)).map(r=>r.event_key));
            for(const kind of ['bill','budget']) {
                const fresh=alerts.filter(item=>item.kind===kind&&!seen.has(item.id));if(!fresh.length)continue;
                // At most one bill notice and one budget notice per local day.
                const dailyKey='daily:'+kind+':'+clock.today;
                const daily=await db.rpc('claim_flow_push',{p_subscription:device.id,p_event:dailyKey});
                if(daily.error)throw daily.error;if(!daily.data)continue;
                const claimed=[];
                for(const item of fresh){const r=await db.rpc('claim_flow_push',{p_subscription:device.id,p_event:item.id});if(r.error)throw r.error;if(r.data)claimed.push(item);}
                if(!claimed.length)continue;
                const keys=[dailyKey,...claimed.map(r=>r.id)];
                let accepted=false;
                try {
                    await deps.send(device.subscription,JSON.stringify({title:'Flow.',body:claimed.length===1?claimed[0].pushText:kind==='bill'?'Upcoming bills need a look. Open Flow to check them.':'Your budgets need a look. Open Flow to check them.',
                        tag:'flow-'+kind,href:'index.html#notifications'}),{...options,timeout:10000});
                    accepted=true;
                    await recordClaims(db,device.id,keys,{state:'sent',sent_at:new Date(now).toISOString(),retry_at:null});
                    sent++;
                } catch(error) {
                    if([404,410].includes(error.statusCode)) {
                        const r=await db.from('flow_push_subscriptions').delete().eq('id',device.id).eq('user_id',pilot);if(r.error)throw r.error;break;
                    }
                    const attempts=Math.max(1,...prior.data.filter(r=>keys.includes(r.event_key)).map(r=>(r.attempts||1)+1));
                    const retryAt=accepted?null:pushRetryAt(error,now,attempts);
                    await recordClaims(db,device.id,keys,{state:'failed',retry_at:retryAt});
                    failed++;
                }
            }
        }
        return response(failed?503:200,{sent,failed});
    } catch { return response(503,{error:'Delivery check could not finish.'}); }
}
