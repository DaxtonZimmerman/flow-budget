/* UI research implementation QA uses sample balances and an isolated auth fixture. */
const {chromium}=require(process.env.FLOW_PLAYWRIGHT_PATH || 'playwright');
const assert=require('node:assert/strict');
const base=process.env.FLOW_TEST_URL||'http://127.0.0.1:4342/';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.FLOW_CHROME_PATH||undefined});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,timezoneId:'America/Denver',serviceWorkers:'block'}),outside=[],errors=[];
  await context.route('**/*',r=>r.request().url().startsWith(base)?r.continue():(outside.push(r.request().url()),r.abort()));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.stack));page.setDefaultTimeout(7000);
  async function go(file){await page.goto(base+'demo/'+file+'.html');await page.locator('.demo-banner').waitFor();}
  const shot=async name=>{await page.evaluate(()=>{document.activeElement?.blur();scrollTo({top:0,behavior:"instant"});});await page.screenshot({path:'/private/tmp/flow-refresh-'+name+'.png',animations:'disabled'});};
  await go('index');assert.equal(await page.locator('.home-amount').innerText(),'$265.00');
  assert.match(await page.locator('.payday-runway').getAttribute('aria-label'),/7 days until payday/);
  assert.equal(await page.locator('.money-map-track>span').count(),4);await shot('home');
  await page.locator('.map-part:visible').first().click();await page.locator('#payday-dialog').waitFor({state:'visible'});
  assert.match(await page.locator('#payday-dialog').innerText(),/Selected available money/);await page.locator('#payday-dialog [data-plan-action=close]').click();await page.waitForTimeout(150);
  await page.locator('[data-tool=purchase]').click();const tool=page.locator('#flow-tools-dialog'),before=await page.evaluate(()=>JSON.stringify(getFlowSnapshot()));
  await tool.locator('[data-spend-amount="50"]').click();assert.equal(await tool.locator('[name=purchase]').inputValue(),'50');assert.match(await tool.locator('#purchase-result').innerText(),/215.00/);
  await tool.locator('[name=category]').selectOption('Food');assert.match(await tool.locator('#purchase-result').innerText(),/265.00/,'a covered purchase uses the reserve first');
  await tool.locator('[name=purchase]').fill('500');assert.equal(await tool.locator('#purchase-result').getAttribute('data-preview-state'),'shortfall');assert.match(await tool.locator('#purchase-result').innerText(),/-\$135.00/);
  assert.equal(await page.evaluate(()=>JSON.stringify(getFlowSnapshot())),before,'what-if presets never record a purchase or change the plan');
  await tool.locator('[name=purchase]').fill('50');await shot('purchase');await tool.getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('[data-open-account]').click();const profile=page.locator('#app-account-dialog');
  for(const name of ['Settings','Bank connections','Setup guide','Help & tools','Your data'])assert.equal(await profile.getByRole('link',{name,exact:true}).count(),1);
  assert.equal(await profile.locator('[data-profile-sign-out]').isVisible(),false,'sample workspace has no real sign-out');await shot('profile-demo');
  await profile.getByRole('link',{name:'Settings',exact:true}).click();await page.waitForURL('**/demo/account.html#payday-settings');
  assert.equal(await page.locator('[data-account-group=preferences]').getAttribute('open'),'');
  assert.equal(await page.locator('[data-account-group=banks]').getAttribute('open'),null);await shot('settings');
  await page.locator('[data-open-account]').click();await profile.getByRole('link',{name:'Help & tools',exact:true}).click();await page.waitForURL('**/demo/account.html#flow-product-settings');
  assert.equal(await page.locator('[data-account-group=help]').getAttribute('open'),'');assert.equal(await page.locator('#flow-product-settings [data-tool=help]').isVisible(),true);
  await page.evaluate(()=>document.dispatchEvent(new Event('flow-accounts-updated')));await page.waitForTimeout(100);assert.equal(await page.locator('#flow-product-settings').count(),1,'help stays a single standalone settings group after a live update');
  await page.getByRole('link',{name:'Plan',exact:true}).first().click();await page.waitForURL('**/demo/budgets.html');
  assert.match(await page.locator('.plan-hero-total').innerText(),/265.00/);assert.equal(await page.locator('.plan-calculation').getAttribute('open'),null);
  await page.locator('.plan-calculation>summary').click();assert.equal(await page.locator('.plan-calculation .mobile-plan-math').isVisible(),true);await page.locator('.plan-calculation>summary').click();await shot('plan');
  await page.getByRole('link',{name:'Bills',exact:true}).first().click();await page.waitForURL('**/demo/bills.html');await shot('bills');
  await go('transactions');await shot('activity');
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:900});
   for(const file of ['index','budgets','bills','account','transactions','setup']){await go(file);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,file+' overflow '+width);}
  }
  await page.setViewportSize({width:1440,height:1000});await go('index');await shot('desktop');
  await context.close();assert.deepEqual(outside,[],'demo never contacts an outside provider');
  // A delayed real-SDK fixture checks that loading cannot reveal an unverified workspace.
  const signed=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await signed.route('**/*',r=>r.request().url().startsWith(base)||r.request().url().startsWith('https://flow-test.supabase.co/')?r.continue():r.abort());
  const user=await require('./browser-auth-fixture.cjs').installTestAuth(signed);let release;
  const delay=new Promise(r=>{release=r;});
  await signed.route('https://flow-test.supabase.co/auth/v1/user',async r=>{await delay;await r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(user)});});
  const live=await signed.newPage();live.on('pageerror',e=>errors.push(e.stack));await live.goto(base+'index.html',{waitUntil:'domcontentloaded'});
  await live.locator('.flow-auth-loading').waitFor();assert.equal(await live.locator('.app').isVisible(),false);assert.equal(await live.locator('.flow-loader-actions').isVisible(),false);
  await live.screenshot({path:'/private/tmp/flow-refresh-loading.png',animations:'disabled'});release();await live.waitForFunction(()=>FlowAuth.authorized&&document.documentElement.dataset.flowAuth==='ready');
  await live.locator('[data-open-account]').click();const account=live.locator('#app-account-dialog');assert.match(await account.locator('[data-profile-email]').innerText(),/sample@example.invalid/);
  assert.equal(await account.getByRole('button',{name:'Sign out',exact:true}).isVisible(),true);await live.screenshot({path:'/private/tmp/flow-refresh-profile.png',animations:'disabled'});
  await live.evaluate(()=>localStorage.setItem('flow_pending','1'));await signed.setOffline(true);await account.getByRole('button',{name:'Sign out',exact:true}).click();assert.match(await account.locator('.profile-message').innerText(),/still saving/);assert.equal(await live.evaluate(()=>FlowAuth.authorized),true);
  await live.evaluate(()=>{localStorage.removeItem('flow_pending');localStorage.setItem('transactions',JSON.stringify([{id:'private',name:'Synthetic private payment',amount:-10,type:'Expense',category:'Food',date:'2026-10-20'}]));});await signed.setOffline(false);
  await live.waitForFunction(()=>FlowAuth.authorized&&!localStorage.getItem('flow_pending'));if(!await account.isVisible())await live.locator('[data-open-account]').click();
  await account.getByRole('button',{name:'Sign out',exact:true}).click();await live.waitForURL('**/login.html*');assert.equal(await live.evaluate(()=>localStorage.getItem('transactions')),null);
  await signed.close();assert.deepEqual(errors,[]);
  console.log('PASS: visual summaries preserve engine amounts, purchase presets and reserve/shortfall math, no what-if writes, conventional account menu, settings deep links, calculation disclosure, 320–1440 layouts, private loading, pending-edit protection and direct profile sign-out.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
