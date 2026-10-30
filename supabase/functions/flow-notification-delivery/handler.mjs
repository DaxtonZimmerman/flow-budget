import { buildNotifications, flowNotificationClock } from '../_shared/notification-engine.mjs';
import { pushOptions, validPushSubscription } from '../flow-notifications/handler.mjs';
const response=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
function sameSecret(a,b) {
    if(typeof a!=='string'||typeof b!=='string'||b.length<32)return false;
    let diff=a.length^b.length;
    for(let i=0;i<b.length;i++)diff|=(a.charCodeAt(i)||0)^b.charCodeAt(i);
    return diff===0;
}
export async function deliverNotifications(request,deps) {
    if(request.method!=='POST')return response(405,{error:'Use POST.'});
    if(!sameSecret(request.headers.get('x-flow-schedule-secret'),deps.env('FLOW_PUSH_SCHEDULE_SECRET')))return response(401,{error:'Unauthorized.'});
    const options=pushOptions(deps.env),pilot=deps.env('PLAID_PILOT_USER_ID');
    if(!options||!pilot)return response(503,{error:'Delivery is not configured.'});
    const now=deps.now?.()??Date.now();
    try {
        const db=deps.createClient(deps.env('SUPABASE_URL'),deps.env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
        const devices=await db.from('flow_push_subscriptions').select('id,user_id,subscription,time_zone').eq('user_id',pilot).eq('enabled',true).limit(5);
        if(devices.error)throw devices.error;
        if(!devices.data.length)return response(200,{sent:0});
        const saved=await db.from('flow_data').select('data').eq('user_id',pilot).maybeSingle();
        if(saved.error)throw saved.error;
        if(!saved.data)return response(200,{sent:0});
        let sent=0;
        for(const device of devices.data) {
            const clock=flowNotificationClock(device.time_zone,now);
            if(!clock||clock.hour<9||clock.hour>=20||!validPushSubscription(device.subscription))continue;
            const alerts=buildNotifications(saved.data.data,clock.today,now).filter(item=>item.push);
            if(!alerts.length)continue;
            const prior=await db.from('flow_push_deliveries').select('event_key').eq('subscription_id',device.id);
            if(prior.error)throw prior.error;
            const seen=new Set(prior.data.map(r=>r.event_key));
            for(const kind of ['bill','budget']) {
                const fresh=alerts.filter(item=>item.kind===kind&&!seen.has(item.id));if(!fresh.length)continue;
                // At most one bill notice and one budget notice per local day.
                const daily=await db.rpc('claim_flow_push',{p_subscription:device.id,p_event:'daily:'+kind+':'+clock.today});
                if(daily.error)throw daily.error;if(!daily.data)continue;
                const claimed=[];
                for(const item of fresh){const r=await db.rpc('claim_flow_push',{p_subscription:device.id,p_event:item.id});if(r.error)throw r.error;if(r.data)claimed.push(item);}
                if(!claimed.length)continue;
                try {
                    await deps.send(device.subscription,JSON.stringify({title:'Flow.',body:claimed.length===1?claimed[0].pushText:kind==='bill'?'Upcoming bills need a look. Open Flow to check them.':'Your budgets need a look. Open Flow to check them.',
                        tag:'flow-'+kind,href:'index.html#notifications'}),options);
                    const result=await db.from('flow_push_deliveries').update({state:'sent',sent_at:new Date(now).toISOString()}).eq('subscription_id',device.id).in('event_key',claimed.map(r=>r.id));
                    if(result.error)throw result.error;sent++;
                } catch(error) {
                    if([404,410].includes(error.statusCode)) {
                        const r=await db.from('flow_push_subscriptions').delete().eq('id',device.id).eq('user_id',pilot);if(r.error)throw r.error;break;
                    }
                    const r=await db.from('flow_push_deliveries').update({state:'failed'}).eq('subscription_id',device.id).in('event_key',claimed.map(r=>r.id));if(r.error)throw r.error;
                }
            }
        }
        return response(200,{sent});
    } catch { return response(503,{error:'Delivery check could not finish.'}); }
}
