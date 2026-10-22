/* Exercise the real phone screens using isolated sample money, never a live bank. */
const {chromium}=require(process.env.FLOW_PLAYWRIGHT_PATH || 'playwright');
const assert=require('node:assert/strict');
const base=process.env.FLOW_TEST_URL || 'http://127.0.0.1:4338/';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.FLOW_CHROME_PATH || undefined});
 try {
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Denver',serviceWorkers:'block',isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const external=[];
  await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith(base))return route.continue();external.push(url);return route.abort();});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));page.setDefaultTimeout(7000);
  const go=async file=>{await page.goto(base+'demo/'+file+'.html',{waitUntil:'load'});await page.locator('.demo-banner').waitFor();};
  const payday=()=>page.locator('#payday-dialog'),tool=()=>page.locator('#flow-tools-dialog');
  const savePlan=()=>payday().locator('button[type=submit]').click();
  const closePlan=()=>payday().getByRole('button',{name:'Close',exact:true}).click();
  const assertFits=async label=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,label+' overflow');
  await go('index');
  await page.evaluate(()=>localStorage.setItem('real-workspace-sentinel','untouched'));
  assert.equal(await page.locator('.flow-wordmark img:visible').getAttribute('alt'),'Flow.');
  assert.equal(await page.locator('.flow-wordmark img:visible').evaluate(img=>img.naturalWidth),280);
  assert.equal(await page.locator('.home-amount').innerText(),'$265.00');
  assert.match(await page.locator('.mobile-daily-pace').innerText(),/37.85/);
  assert.equal(await page.locator('.mobile-home-overview').getAttribute('open'),null);
  await page.locator('.mobile-home-overview>summary').click();
  assert.equal(await page.locator('#home-income').isVisible(),true);
  await page.locator('.mobile-home-overview>summary').click();
  await page.locator('[data-tool=purchase]').click();await tool().locator('[name=purchase]').fill('120');await tool().locator('[name=category]').selectOption('Food');
  assert.match(await tool().locator('#purchase-result').innerText(),/245.00/);
  const sheet=await tool().boundingBox();assert.ok(sheet.y>0 && Math.abs(sheet.y+sheet.height-844)<2,'sheet attached to bottom');
  await page.screenshot({path:'/private/tmp/flow-mobile-spend-sheet.png',animations:'disabled'});
  await tool().getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('link',{name:'Activity',exact:true}).first().click();await page.waitForURL('**/demo/transactions.html');
  assert.ok(await page.locator('.mobile-date-heading:visible').count()>=2);
  await page.locator('#activity-more-filters>summary').click();
  const filters=page.locator('#mobile-filter-dialog');await filters.waitFor({state:'visible'});
  assert.equal(await page.locator('#history-type-filter').count(),1,'one shared filter control');
  await filters.locator('#history-type-filter').selectOption('transfer');
  await filters.getByRole('button',{name:'Show activity',exact:true}).click();
  assert.equal(await page.locator('.history-row:visible').count(),0);
  await page.locator('[data-activity-type=all]').click();
  await page.locator('#history-search').fill('venmo');assert.equal(await page.locator('.history-row:visible').count(),1);
  await page.locator('.history-row:visible .transaction-open-button').click();
  const transaction=page.locator('#transaction-details-dialog');await transaction.locator('#transaction-details-category').selectOption('Food');await transaction.locator('#transaction-details-notes').fill('Sample dinner');
  await transaction.getByRole('button',{name:'Save this transaction',exact:true}).click();await transaction.waitFor({state:'hidden'});
  const records=await page.evaluate(()=>loadTransactions());assert.equal(records.find(t=>t.id==='demo-friends').category,'Food');assert.equal(records.find(t=>t.id==='demo-groceries').notes,'Groceries for the week');
  assert.equal(await page.locator('#history-search').inputValue(),'venmo','search stays during a live render');
  await page.locator('.mobile-transaction-more:visible').click();await page.locator('#mobile-activity-options').getByRole('button',{name:'Open details',exact:true}).click();await transaction.waitFor({state:'visible'});await page.locator('#close-transaction-details').click();
  await page.locator('#history-search').fill('');
  await page.getByRole('link',{name:'Plan',exact:true}).first().click();await page.waitForURL('**/demo/budgets.html');
  const before=await page.evaluate(()=>loadFlowPlanning());
  await page.locator('.mobile-plan [data-plan-action=essential][data-id=food]').click();await payday().locator('[name=amount]').fill('80');await savePlan();await payday().waitFor({state:'hidden'});
  const after=await page.evaluate(()=>loadFlowPlanning());assert.equal(after.periodStartedOn,before.periodStartedOn);assert.equal(after.reservePeriodKey,before.reservePeriodKey);assert.deepEqual(after.essentials.find(e=>e.id==='travel'),before.essentials.find(e=>e.id==='travel'));assert.equal(after.essentials.find(e=>e.id==='food').amountCents,8000);
  await page.locator('.mobile-plan [data-plan-action=cushion]').click();await payday().locator('[name=amount]').fill('60');await savePlan();await payday().waitFor({state:'hidden'});
  assert.match(await page.locator('.mobile-plan-total').innerText(),/275.00/);
  // A new cloud/device copy must still reject a stale edit from a sheet.
  await page.locator('.mobile-plan [data-plan-action=essential][data-id=food]').click();await payday().locator('[name=amount]').fill('70');
  await page.evaluate(()=>{const p=loadFlowPlanning();p.cushionCents=6100;flowStorage.setItem('flowPlanning',JSON.stringify(p));});await savePlan();assert.match(await payday().locator('.form-message').innerText(),/changed/);assert.equal(await page.evaluate(()=>loadFlowPlanning().essentials[0].amountCents),8000);await closePlan();
  await go('budgets');await page.locator('[data-mobile-disclosure=more-plan-tools]>summary').click();assert.equal(await page.locator('#flow-plan-tools [data-tool=card]').first().isVisible(),true);
  await page.locator('#flow-plan-tools [data-tool=card]').first().click();await tool().getByRole('button',{name:'Close',exact:true}).click();
  assert.equal(await page.locator('[data-mobile-disclosure=more-plan-tools]').count(),1,'live tool renders reuse the disclosure');
  await page.getByRole('link',{name:'Bills',exact:true}).first().click();await page.waitForURL('**/demo/bills.html');
  await page.locator('[data-mobile-bill-tab=suggestions]').click();assert.equal(await page.locator('#bill-discovery').isVisible(),true);assert.equal(await page.locator('#bill-tracking').isVisible(),false);
  await page.locator('[data-mobile-bill-tab=upcoming]').click();await page.locator('.mobile-bill-row').click();await payday().waitFor({state:'visible'});assert.equal(await payday().locator('[name=name]').inputValue(),'Phone');await closePlan();
  // Resizing restores the same filter nodes and all desktop tools.
  await go('transactions');await page.setViewportSize({width:1440,height:1000});await page.locator('.history-filters #history-month').waitFor({state:'visible'});
  await go('budgets');assert.equal(await page.locator('.desktop-plan').isVisible(),true);assert.equal(await page.locator('.mobile-plan').isVisible(),false);assert.equal(await page.locator('#flow-plan-tools [data-tool=card]').first().isVisible(),true);
  // Missing and negative money never turn into an optimistic spending headline.
  await page.evaluate(()=>{const p=loadFlowPlanning();p.manualBalance.cents=1000;flowStorage.setItem('flowPlanning',JSON.stringify(p));});await go('index');assert.match(await page.locator('#home-money-title').innerText(),/shortfall/);assert.equal(await page.locator('.mobile-daily-pace').count(),0);
  await page.evaluate(()=>{const p=loadFlowPlanning();p.manualBalance=null;p.selectedAccountIds=[];flowStorage.setItem('flowPlanning',JSON.stringify(p));});await page.reload();assert.equal(await page.locator('.home-amount').innerText(),'Let’s check');
  for(const width of [320,390,736,768,1440]){
   await page.setViewportSize({width,height:844});
   for(const file of ['index','transactions','budgets','bills','review','account','setup']){await go(file);await assertFits(file+' '+width);}
  }
  // The guided setup still works from the first decision through a completed plan.
  await page.setViewportSize({width:390,height:844});await go('setup');
  await page.evaluate(()=>{const p=loadFlowPlanning();p.setup={step:0,completed:false};p.manualBalance={cents:50000,date:flowToday()};p.payday.nextDate=addPlanDays(flowToday(),7);flowStorage.setItem('flowPlanning',JSON.stringify(p));});await page.reload();
  for(let step=0;step<6;step++){await page.locator('#setup-form button[type=submit]').click();if(step<5)await page.waitForFunction(s=>loadFlowPlanning().setup.step===s,step+1);}
  await page.waitForURL('**/demo/index.html');assert.equal(await page.evaluate(()=>loadFlowPlanning().setup.completed),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('real-workspace-sentinel')),'untouched');assert.equal(await page.evaluate(()=>localStorage.getItem('flowPlanning')),null);
  assert.deepEqual(external,[],'sample screens do not contact outside providers');assert.deepEqual(errors,[]);
  console.log('PASS: phone navigation, official logo, spend sheet, grouped dates, one filter set, single-payment edit, reserve-period preservation, stale-save guard, bills segments, desktop resize, missing/negative money, guided setup, 320–1440 layouts and sample isolation.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
