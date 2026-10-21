/* Browser-only auth server fixture. Uses the real vendored SDK and synthetic data. */
const fixtureUser = { id:'11111111-1111-4111-8111-111111111111', aud:'authenticated', role:'authenticated', email:'sample@example.invalid', app_metadata:{provider:'email',providers:['email']}, user_metadata:{}, created_at:'2026-01-01T00:00:00Z' };
async function installTestAuth(context, options = {}) {
    const user = { ...fixtureUser, id:options.owner || fixtureUser.id };
    const tokenKey = 'sb-flow-test-auth-token';
    await context.addInitScript(({user,tokenKey,options}) => {
        if (localStorage.getItem('flow-test-initialized')) return;
        localStorage.setItem('flow-test-initialized','1');
        if (options.signedIn === false) return;
        const expires = options.expiresAt || Math.floor(Date.now()/1000)+3600;
        const encode = value => btoa(JSON.stringify(value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
        const session = {user,expires_at:expires,expires_in:3600,token_type:'bearer',refresh_token:'synthetic-refresh-only',access_token:encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.id,exp:expires,aud:'authenticated',role:'authenticated'})+'.synthetic'};
        localStorage.setItem(tokenKey,JSON.stringify(session));
        if (options.linked !== false) { localStorage.setItem('flow_user_id',user.id); localStorage.setItem('flow_verified_user',user.id); }
    }, {user,tokenKey,options});
    await context.route('**/js/cloud-config.js*', route => route.fulfill({contentType:'text/javascript',body:'const flowCloudUrl="https://flow-test.supabase.co";const flowCloudKey="synthetic-public-key";'}));
    await context.route('https://flow-test.supabase.co/**', async route => {
        const request = route.request(), url = new URL(request.url());
        const json = value => route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(value)});
        if (request.method() === 'OPTIONS') return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,DELETE,PUT,OPTIONS'}});
        if (url.pathname === '/auth/v1/user') return json(user);
        if (url.pathname === '/auth/v1/logout' || url.pathname === '/auth/v1/otp') return json({});
        if (url.pathname === '/auth/v1/verify') {
            const expires = Math.floor(Date.now()/1000)+3600;
            const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
            return json({user,expires_at:expires,expires_in:3600,token_type:'bearer',refresh_token:'synthetic-refresh-only',access_token:encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.id,exp:expires,aud:'authenticated',role:'authenticated'})+'.synthetic'});
        }
        if (url.pathname === '/functions/v1/plaid') return json({connections:[],accounts:[],transactions:[],environment:'sandbox',pilot_enabled:false});
        if (url.pathname === '/rest/v1/flow_data') {
            let cloud;
            try { cloud = await request.frame().evaluate(() => ({revision:Number(localStorage.getItem('flow_revision')||0),data:typeof getFlowSnapshot==='function'?getFlowSnapshot():{transactions:[],budgets:[],budgetsByMonth:{}}})); }
            catch (_) { return route.abort().catch(()=>{}); }
            return json(cloud);
        }
        if (url.pathname === '/rest/v1/rpc/save_flow_data') return json(Number(request.postDataJSON().expected_revision)+1);
        return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Unexpected fixture request'})});
    });
    return user;
}
module.exports = { installTestAuth, fixtureUser };
