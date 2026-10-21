/* Use the real sign-in SDK and UI with synthetic, owner-scoped account responses. */
const {chromium}=require(process.env.FLOW_PLAYWRIGHT_PATH || 'playwright');
const {installTestAuth,fixtureUser}=require('./browser-auth-fixture.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.FLOW_TEST_URL || 'http://127.0.0.1:4340/';
const transaction=id=>({id,name:id,amount:-12,type:'Expense',category:'Food',date:'2026-10-20',notes:'Synthetic test',source:'manual',status:'posted',reviewStatus:'reviewed'});
const snapshot=id=>({clientSchemaVersion:2,transactions:id?[transaction(id)]:[],budgets:[],budgetsByMonth:{},categoryRules:[],recurringItems:[],bankAccounts:[],flowPlanning:null});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.FLOW_CHROME_PATH || undefined});
 const errors=[],dialogs=[];
 try {
  async function scenario({localOwner,localId,pending=false,revision=3,cloudRevision=4,failRead=false}) {
   const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Denver',serviceWorkers:'block',reducedMotion:'reduce'});
   await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
   await installTestAuth(context,{linked:false});
   let cloud={revision:cloudRevision,data:snapshot('Saved account groceries')},readFails=failRead;
   const uploads=[];
   await context.route('https://flow-test.supabase.co/rest/v1/flow_data**',async route=>{
    if(route.request().method()==='OPTIONS')return route.fallback();
    return route.fulfill({status:readFails?503:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(readFails?{message:'Synthetic unavailable'}:cloud)});
   });
   await context.route('https://flow-test.supabase.co/rest/v1/rpc/save_flow_data',async route=>{
    if(route.request().method()==='OPTIONS')return route.fallback();
    const input=route.request().postDataJSON();uploads.push(input);
    if(input.expected_revision!==cloud.revision)return route.fulfill({status:400,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({message:'Flow data changed on another device',code:'P0001'})});
    cloud={revision:cloud.revision+1,data:input.new_data};
    return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(cloud.revision)});
   });
   await context.addInitScript(({localOwner,localId,pending,revision,data})=>{
    if(localStorage.getItem('automatic-account-scenario'))return;
    localStorage.setItem('automatic-account-scenario','1');
    if(localOwner)localStorage.setItem('flow_user_id',localOwner);
    localStorage.setItem('flow_verified_user','11111111-1111-4111-8111-111111111111');
    if(localId) for (const [key,value] of Object.entries(data)) if(key!=='clientSchemaVersion' && value!==null) localStorage.setItem(key,JSON.stringify(value));
    localStorage.setItem('flow_revision',String(revision));
    if(pending){localStorage.setItem('flow_pending','1');localStorage.setItem('flow_pending_client','2');}
   },{localOwner,localId,pending,revision,data:snapshot(localId)});
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.stack));page.on('dialog',dialog=>{dialogs.push(dialog.message());dialog.dismiss();});page.setDefaultTimeout(10000);
   return {context,page,uploads,cloud:()=>cloud,allowReads:()=>{readFails=false;}};
  }
  // A returning sign-in on a different device opens its own saved account without a choice or upload.
  let s=await scenario({localOwner:'different-owner',localId:'Other person private entry'});
  await s.page.goto(base+'login.html?next=transactions.html');await s.page.waitForURL('**/transactions.html');
  await s.page.waitForFunction(()=>FlowAuth.authorized && loadTransactions()[0]?.name==='Saved account groceries');
  assert.equal(await s.page.locator('#account-choose,#use-cloud,#use-device').count(),0);
  assert.equal(await s.page.getByText('Other person private entry',{exact:true}).count(),0);assert.equal(s.uploads.length,0);
  assert.equal(await s.page.evaluate(()=>getFlowRecoveryCopies(FlowAuth.user.id).length),0);
  assert.equal(await s.page.evaluate(()=>JSON.parse(localStorage.getItem('flow_recovery_v1:different-owner'))[0].data.transactions[0].name),'Other person private entry');
  await s.context.close();
  // A same-account overlap follows the saved account, with a working recovery export.
  s=await scenario({localOwner:fixtureUser.id,localId:'Unsynced dinner edit',pending:true});
  await s.page.goto(base+'account.html');await s.page.waitForFunction(()=>FlowAuth.authorized && !localStorage.getItem('flow_pending'));
  assert.equal(await s.page.evaluate(()=>loadTransactions()[0].name),'Saved account groceries');assert.equal(s.uploads.length,0);
  await s.page.locator('#account-backups>summary').click();await s.page.locator('#account-recovery').waitFor({state:'visible'});
  const downloadPromise=s.page.waitForEvent('download');await s.page.getByRole('button',{name:'Download earlier changes',exact:true}).click();
  const download=await downloadPromise;const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.equal(exported.version,1);assert.equal(exported.transactions[0].name,'Unsynced dinner edit');
  await s.page.screenshot({path:'/private/tmp/flow-automatic-sync-recovery.png',fullPage:true,animations:'disabled'});
  await s.context.close();
  // A normal offline edit still uploads automatically once the connection returns.
  s=await scenario({localOwner:fixtureUser.id,localId:'Before offline',cloudRevision:3});
  await s.page.goto(base+'account.html');await s.page.waitForFunction(()=>FlowAuth.authorized);
  await s.context.setOffline(true);
  await s.page.evaluate(data=>{localStorage.setItem('transactions',JSON.stringify(data.transactions));return flowDataChanged();},snapshot('Offline lunch'));
  assert.equal(await s.page.evaluate(()=>localStorage.getItem('flow_pending')),'1');
  await s.context.setOffline(false);
  await s.page.waitForFunction(()=>FlowAuth.authorized && !localStorage.getItem('flow_pending'));
  assert.equal(s.cloud().data.transactions[0].name,'Offline lunch');assert.equal(s.cloud().revision,4);assert.equal(s.uploads.length,1);
  assert.equal(await s.page.evaluate(()=>getFlowRecoveryCopies(FlowAuth.user.id).length),0);await s.context.close();
  // A failed account load keeps the prior workspace private and offers an ordinary retry.
  s=await scenario({localOwner:'different-owner',localId:'Private retained work',failRead:true});
  await s.page.goto(base+'login.html?next=index.html');await s.page.waitForURL('**/account.html');
  await s.page.locator('#account-retry-panel').waitFor({state:'visible'});
  assert.equal(await s.page.evaluate(()=>localStorage.getItem('flow_user_id')),'different-owner');
  assert.equal(await s.page.locator('.history-row:visible').count(),0);
  s.allowReads();await s.page.getByRole('button',{name:'Try again',exact:true}).click();await s.page.waitForURL('**/index.html');
  await s.page.waitForFunction(()=>FlowAuth.authorized);assert.equal(await s.page.evaluate(()=>loadTransactions()[0].name),'Saved account groceries');
  assert.equal(s.uploads.length,0);await s.context.close();
  assert.deepEqual(dialogs,[],'routine account opening and sync must not ask replacement questions');assert.deepEqual(errors,[]);
  console.log('PASS: automatic account opening, return route, cross-account isolation, overlap recovery export, pending offline upload, retry without data loss, and no copy-choice or replacement dialogs.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
