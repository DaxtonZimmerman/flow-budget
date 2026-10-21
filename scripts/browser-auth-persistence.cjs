/* Regression coverage for same-app sign-in, process restarts, durable recovery and email failures. */
const {chromium}=require(process.env.FLOW_PLAYWRIGHT_PATH || 'playwright');
const {installTestAuth,fixtureUser}=require('./browser-auth-fixture.cjs');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
(async()=>{
 const root=path.resolve('dist'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'flow-auth-recovery-'));
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://local'),target=path.resolve(root,'.'+url.pathname);
  if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  try{const body=fs.readFileSync(target);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(target)]||'text/plain');res.end(body);}
  catch(_){res.writeHead(404);res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/';
 let context,revoked=false,refreshes=0,sends=0,emailFailure=null,blockAuthLocal=false;
 const errors=[];
 function session(){const expires=Math.floor(Date.now()/1000)+3600,encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');return{user:fixtureUser,expires_at:expires,expires_in:3600,token_type:'bearer',refresh_token:'synthetic-refresh-'+refreshes,access_token:encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:fixtureUser.id,exp:expires,aud:'authenticated',role:'authenticated'})+'.synthetic'};}
 async function open(){
  context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:process.env.FLOW_CHROME_PATH||undefined,serviceWorkers:'block',viewport:{width:390,height:844}});
  await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await installTestAuth(context,{signedIn:false});
  await context.addInitScript(({blockAuthLocal})=>{
   Object.defineProperty(navigator,'standalone',{get:()=>true});
   if(blockAuthLocal)for(const method of ['getItem','setItem','removeItem']){
    const original=Storage.prototype[method];Storage.prototype[method]=function(key,...args){if(this===localStorage && key.endsWith('-auth-token'))throw new DOMException('Synthetic blocked auth storage','SecurityError');return original.call(this,key,...args);};
   }
  },{blockAuthLocal});
  await context.route('https://flow-test.supabase.co/auth/v1/token**',route=>{
   refreshes++;assert.ok(route.request().postDataJSON().refresh_token.startsWith('synthetic-'));
   return route.fulfill({status:revoked?400:200,contentType:'application/json',headers:{'x-supabase-api-version':'2024-01-01','access-control-allow-origin':'*','access-control-expose-headers':'x-supabase-api-version'},body:JSON.stringify(revoked?{code:'refresh_token_not_found',msg:'Synthetic revoked session'}:session())});
  });
  await context.route('https://flow-test.supabase.co/auth/v1/otp**',route=>{if(route.request().method()==='OPTIONS')return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST,OPTIONS'}});sends++;return route.fulfill({status:emailFailure?429:200,contentType:'application/json',headers:{'x-supabase-api-version':'2024-01-01','access-control-allow-origin':'*','access-control-expose-headers':'x-supabase-api-version'},body:JSON.stringify(emailFailure?{code:emailFailure,msg:'Synthetic send limit'}:{})});});
  const page=context.pages()[0];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);return page;
 }
 async function restart(){await context.close();context=null;return open();}
 async function completeSignIn(page){
  await page.locator('[name=code]').fill('123456');
  await page.locator('#login-code-form button').click();
  await page.waitForFunction(()=>window.FlowAuth?.authorized && location.pathname.endsWith('/index.html'));
  await page.waitForFunction(()=>FlowAuth.authorized);
 }
 async function signIn(page){
  await page.goto(base+'login.html');await page.locator('[name=email]').fill('sample@example.invalid');await page.locator('#login-form button').click();
  await completeSignIn(page);
 }
 async function removeLocal(page){await page.evaluate(()=>localStorage.removeItem('sb-flow-test-auth-token'));}
 try{
  let page=await open();await page.goto(base+'login.html');
  await page.locator('[name=email]').fill('sample@example.invalid');await page.locator('#login-form button').click();await page.locator('#login-code-form').waitFor();
  assert.equal(await page.locator('#login-resend').isEnabled(),false);const sent=sends;
  assert.equal(await page.locator('#login-diagnostics').isVisible(),false);
  await page.screenshot({path:'/private/tmp/flow-email-code-phone.png',fullPage:true});
  page=await restart();await page.goto(base+'login.html');await page.locator('#login-code-form').waitFor();assert.equal(sends,sent,'Reopening a pending code request must not send another email');
  await completeSignIn(page);
  page=await restart();await page.goto(base+'index.html');await page.waitForFunction(()=>FlowAuth.authorized);assert.equal(sends,sent);
  await removeLocal(page);page=await restart();const before=refreshes;
  await page.goto(base+'index.html');await page.waitForFunction(()=>FlowAuth.authorized);assert.ok(refreshes>before,'Recovered session must renew with server');assert.equal(sends,sent,'Recovery must not send email');
  await page.goto(base+'account.html');await page.locator('#sign-out').click();await page.waitForURL('**/login.html*');
  page=await restart();await page.goto(base+'index.html');await page.waitForURL('**/login.html*');assert.equal(await page.evaluate(()=>FlowAuth.authorized),false);
  await signIn(page);await removeLocal(page);revoked=true;page=await restart();
  await page.goto(base+'index.html');await page.waitForURL('**/login.html*');assert.equal(await page.evaluate(()=>FlowAuth.authorized),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('sb-flow-test-auth-token')),null);
  revoked=false;blockAuthLocal=true;page=await restart();await signIn(page);
  page=await restart();await page.goto(base+'index.html');await page.waitForFunction(()=>FlowAuth.authorized);assert.equal(sends,sent+2);
  await page.goto(base+'account.html');await page.locator('#sign-out').click();await page.waitForURL('**/login.html*');
  emailFailure='over_email_send_rate_limit';await page.locator('[name=email]').fill('sample@example.invalid');await page.locator('#login-form button').click();
  try { await page.getByText(/Email sending is temporarily limited/).waitFor(); } catch(error) { console.error({sends,message:await page.locator('#login-message').innerText()});throw error; }assert.equal(await page.locator('[name=link]').count(),0);
  await page.goto(base+'login.html?diagnostics=1');await page.locator('[name=email]').fill('sample@example.invalid');await page.locator('#login-form button').click();await page.getByText(/Email sending is temporarily limited/).waitFor();
  await page.locator('.login-troubleshooting summary').click();await page.locator('#login-check-status').click();const status=await page.locator('#login-status-details').innerText();
  assert.match(status,/email: over_email_send_rate_limit/);assert.doesNotMatch(status,/sample@|synthetic-refresh|access_token|token_hash/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:'/private/tmp/flow-sign-in-rate-limit.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: same-app sign-in survives process restarts; losing only the local token recovers through server renewal; sign-out and revoked sessions cannot be restored; IndexedDB works when auth localStorage is blocked; email-limit errors are clear and there is one email-code sign-in method; diagnostics contain no credentials.');
 }finally{if(context)await context.close();await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
