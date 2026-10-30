const origin='https://daxtonzimmerman.github.io';
const headers={'Content-Type':'application/json','Cache-Control':'no-store',
    'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
export function validPushSubscription(s) {
    try {
        const url=new URL(s.endpoint),host=url.hostname;
        return url.protocol==='https:' && !url.username && !url.password && !url.port && s.endpoint.length<=2048 &&
            (host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host==='web.push.apple.com'||host.endsWith('.push.apple.com')) &&
            /^[A-Za-z0-9_-]{87}$/.test(s.keys?.p256dh) && /^[A-Za-z0-9_-]{22}$/.test(s.keys?.auth);
    } catch { return false; }
}
export function pushOptions(env) {
    const publicKey=env('FLOW_PUSH_PUBLIC_KEY'),privateKey=env('FLOW_PUSH_PRIVATE_KEY');
    if(!/^[A-Za-z0-9_-]{87}$/.test(publicKey||'')||!/^[A-Za-z0-9_-]{43}$/.test(privateKey||''))return null;
    return {TTL:3600,timeout:5000,vapidDetails:{subject:'https://daxtonzimmerman.github.io/flow-budget/',publicKey,privateKey}};
}
export async function handleNotificationRequest(request,deps) {
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='POST')return reply(405,{error:'Use POST.'});
    if(request.headers.get('origin')&&request.headers.get('origin')!==origin)return reply(403,{error:'Unsupported origin.'});
    try {
        const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
        if(!token)return reply(401,{error:'Sign in first.'});
        const auth=deps.createClient(deps.env('SUPABASE_URL'),deps.env('SUPABASE_ANON_KEY'),{auth:{persistSession:false}});
        const identity=await auth.auth.getUser(token),user=identity.data?.user;
        if(identity.error||!user?.id||!user.email_confirmed_at)return reply(401,{error:'Sign in again.'});
        if(user.id!==deps.env('PLAID_PILOT_USER_ID'))return reply(403,{error:'Notifications are available to the private pilot account.'});
        const raw=await request.text();if(raw.length>12000)return reply(413,{error:'Request too large.'});
        let input;try{input=JSON.parse(raw);}catch{return reply(400,{error:'Invalid request.'});}
        const options=pushOptions(deps.env),db=deps.createClient(deps.env('SUPABASE_URL'),deps.env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
        if(input.action==='status') {
            let query=db.from('flow_push_subscriptions').select('id').eq('user_id',user.id).eq('enabled',true);
            if(input.subscription){if(!validPushSubscription(input.subscription))return reply(400,{error:'Invalid subscription.'});query=query.eq('endpoint',input.subscription.endpoint);}
            const r=await query;
            if(r.error)throw r.error;
            return reply(200,{ready:Boolean(options),publicKey:options?.vapidDetails.publicKey||null,subscribed:Boolean(input.subscription&&r.data.length)});
        }
        if(!['subscribe','unsubscribe','test'].includes(input.action)||!validPushSubscription(input.subscription))return reply(400,{error:'This browser’s notification subscription is not supported.'});
        const endpoint=input.subscription.endpoint;
        if(input.action==='unsubscribe') {
            const r=await db.from('flow_push_subscriptions').delete().eq('user_id',user.id).eq('endpoint',endpoint);
            if(r.error)throw r.error;return reply(200,{ok:true});
        }
        if(!options)return reply(503,{error:'Phone notifications are not ready yet. Your inbox still works.'});
        if(input.action==='subscribe') {
            try{new Intl.DateTimeFormat('en',{timeZone:input.timeZone}).format();if(typeof input.timeZone!=='string'||input.timeZone.length>100)throw Error();}
            catch{return reply(400,{error:'Choose a valid time zone.'});}
            const existing=await db.from('flow_push_subscriptions').select('id,user_id').eq('endpoint',endpoint).maybeSingle();
            if(existing.error)throw existing.error;
            if(existing.data&&existing.data.user_id!==user.id)return reply(409,{error:'Turn off notifications on this device, then enable them again.'});
            const count=await db.from('flow_push_subscriptions').select('id').eq('user_id',user.id);
            if(count.error)throw count.error;
            if(!existing.data&&count.data.length>=5)return reply(409,{error:'Notifications are already enabled on five devices.'});
            const row={user_id:user.id,endpoint,subscription:{endpoint,keys:input.subscription.keys},time_zone:input.timeZone,enabled:true,updated_at:new Date().toISOString()};
            const r=existing.data?await db.from('flow_push_subscriptions').update(row).eq('id',existing.data.id).eq('user_id',user.id):await db.from('flow_push_subscriptions').insert(row);
            if(r.error)throw r.error;return reply(200,{ok:true});
        }
        const r=await db.from('flow_push_subscriptions').select('id,subscription,last_test_at').eq('user_id',user.id).eq('endpoint',endpoint).eq('enabled',true).maybeSingle();
        if(r.error)throw r.error;if(!r.data)return reply(404,{error:'Enable notifications on this device first.'});
        if(r.data.last_test_at&&Date.now()-Date.parse(r.data.last_test_at)<60000)return reply(429,{error:'Wait a minute before sending another test.'});
        const claimed=await db.from('flow_push_subscriptions').update({last_test_at:new Date().toISOString()}).eq('id',r.data.id);
        if(claimed.error)throw claimed.error;
        await deps.send(r.data.subscription,JSON.stringify({title:'Flow.',body:'You’re all set. Flow reminders will appear here.',tag:'flow-test',href:'index.html#notifications'}),options);
        return reply(200,{ok:true});
    } catch { return reply(503,{error:'Could not update notifications. Please try again.'}); }
}
