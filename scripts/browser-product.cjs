const {chromium}=require(process.env.FLOW_PLAYWRIGHT_PATH || 'playwright');
const assert=require('node:assert/strict');
const base=process.env.FLOW_TEST_URL||'http://127.0.0.1:4329/';
let testBrowser;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.FLOW_CHROME_PATH || undefined});
 testBrowser=browser;
 const context=await browser.newContext({viewport:{width:1440,height:1100},serviceWorkers:'block'});
 await context.route('**/*',route=>{const u=route.request().url();if(new URL(u).pathname.endsWith('/js/cloud-config.js'))return route.fulfill({contentType:'text/javascript',body:'const flowCloudUrl="";const flowCloudKey="";'});if(!u.startsWith(base))return route.abort();return route.continue();});
 await require('./browser-auth-fixture.cjs').installTestAuth(context);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));page.setDefaultTimeout(6000);
 const go=path=>page.goto(base+path,{waitUntil:'domcontentloaded'}),tool=()=>page.locator('#flow-tools-dialog'),click=async action=>{if(action==='reconcile'&&!await page.locator('[data-tool=reconcile]:visible').count())await page.locator('[data-plan-action=home-source]').click();if(action==='weekly'&&!await page.locator('[data-tool=weekly]:visible').count())await go('demo/account.html#flow-product-settings');const target=page.locator('[data-tool='+action+']').first();const parent=target.locator('xpath=ancestor::details[@data-mobile-disclosure]');if(await parent.count() && await parent.getAttribute('open') === null)await parent.locator('summary').first().click();return target.click();};
 async function close(){if(await tool().isVisible())await tool().getByRole('button',{name:'Close',exact:true}).click();}
 async function submit(){await tool().locator('button[type=submit]').click();}
 await go('index.html');await page.locator('#flow-decision-tools').waitFor();assert.equal(await page.locator('.payday-hero').innerText().then(x=>x.includes('Let’s make a plan')),true);
 await page.evaluate(()=>localStorage.setItem('real-workspace-sentinel','do-not-change'));
 await go('demo/index.html');await page.locator('.demo-banner').waitFor();assert.match(await page.locator('.payday-hero h3').innerText(),/265.00/);
 await click('purchase');await tool().locator('[name=purchase]').fill('120');await tool().locator('[name=category]').selectOption('Food');assert.match(await tool().locator('#purchase-result').innerText(),/245.00/);await close();
 await page.getByRole('link',{name:'Plan',exact:true}).first().click();await page.locator('#flow-plan-tools').waitFor();assert.ok(page.url().includes('/demo/'));
 await click('goal');await tool().locator('[name=name]').fill('Emergency fund');await tool().locator('[name=target]').fill('1000');await tool().locator('[name=reserved]').fill('50');await tool().locator('[name=contribution]').fill('10');await tool().locator('[name=locationChecked]').check();await submit();await tool().waitFor({state:'hidden'});assert.match(await page.locator('.plan-summary').innerText(),/215.00/);
 await click('contribute');await tool().locator('[name=confirmed]').check();await submit();await tool().waitFor({state:'hidden'});assert.match(await page.locator('.plan-summary').innerText(),/205.00/);
 await click('categories');await tool().locator('[name=name]').fill('Pets');await submit();await tool().waitFor({state:'hidden'});
 await page.getByRole('link',{name:'Activity',exact:true}).first().click();await page.locator('.history-row').first().waitFor().catch(async error=>{console.error('Activity diagnostic:',page.url(),await page.locator('body').innerText(),errors);throw error;});
 await page.evaluate(()=>FlowTransactionDetails.open('demo-groceries'));await page.locator('#transaction-tools-entry button').click();await tool().waitFor();await tool().getByRole('button',{name:'Split this payment',exact:true}).click();
 const lines=tool().locator('[data-split-row]');await lines.nth(0).locator('input').fill('30');await lines.nth(1).locator('input').fill('12.80');await lines.nth(1).locator('select').selectOption('Pets');await submit();await tool().waitFor({state:'hidden'});
 const stored=await page.evaluate(()=>JSON.parse(flowStorage.getItem('transactions')).find(t=>t.id==='demo-groceries'));assert.equal(stored.allocations.length,2);assert.equal(stored.amount,-42.8);
 await page.evaluate(()=>FlowTransactionDetails.open('demo-groceries'));assert.equal(await page.locator('#transaction-details-category').isDisabled(),true);await page.locator('#close-transaction-details').click();
 await go('demo/index.html');await click('reconcile');await submit();await tool().locator('[name=source]').selectOption('manual');await tool().locator('[name=balance]').fill('500');await tool().locator('[name=covered]').check();await submit();await submit();await tool().locator('[name=checked]').check();await submit();await tool().waitFor({state:'hidden'});
 await click('weekly');await tool().locator('[name=reviewed]').check();await tool().locator('[name=note]').fill('Reviewed sample plan');await submit();await tool().waitFor({state:'hidden'});
 await go('demo/account.html');await page.locator('[data-account-group=help]>summary').click();await page.locator('#flow-product-settings').waitFor();await page.locator('[data-tools-preference=remindersEnabled]').check();assert.equal(await page.evaluate(()=>loadFlowPlanning().preferences.remindersEnabled),true);
 await click('help');await tool().locator('#flow-help-search').fill('transfer');assert.ok(await tool().locator('.help-topic:visible').count()>=1);await close();
 assert.equal(await page.evaluate(()=>localStorage.getItem('real-workspace-sentinel')),'do-not-change');assert.equal(await page.evaluate(()=>localStorage.getItem('flowPlanning')),null);
 // Both phone and desktop can navigate every main screen without horizontal overflow.
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});
  for(const file of ['index','transactions','budgets','bills','review','account','setup']){
   await go('demo/'+file+'.html');await page.locator('.main').waitFor();
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,`${file} overflow at ${width}`);
  }
  await go('demo/index.html');await click('purchase');await tool().locator('[name=purchase]').fill('25');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:`/private/tmp/flow-product-purchase-${width}.png`,fullPage:false,animations:'disabled'});await close();
 }
 // A changed snapshot rejects a stale financial choice.
 await go('demo/budgets.html');await click('goal');await tool().locator('[name=name]').fill('Must not save');await tool().locator('[name=target]').fill('100');await tool().locator('[name=locationChecked]').check();await page.evaluate(()=>{const rows=loadTransactions();rows[0].notes='Newer edit';flowStorage.setItem('transactions',JSON.stringify(rows));});await submit();assert.match(await tool().locator('.form-message').innerText(),/changed/);await close();
 assert.deepEqual(errors,[]);console.log('PASS: demo isolation, purchase preview, goals, custom categories, splits, reconciliation, check-in, preferences, help, stale-save guards, desktop/390/320 layouts.');await browser.close();
})().catch(async error=>{console.error(error);await testBrowser?.close();process.exitCode=1;});
