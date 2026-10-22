const {chromium}=require(process.env.FLOW_PLAYWRIGHT_PATH || 'playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve('dist'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://local');
  if(url.pathname.endsWith('/js/cloud-config.js')){res.setHeader('Content-Type','text/javascript');return res.end('const flowCloudUrl="";const flowCloudKey="";');}
  if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');return res.end('{"privateFixture":true}');}
  const target=path.join(root,url.pathname==='/'?'index.html':url.pathname);
  if(!target.startsWith(root+path.sep)){res.statusCode=403;return res.end();}
  try{res.setHeader('Content-Type',types[path.extname(target)]||'text/plain');res.end(fs.readFileSync(target));}catch(_){res.statusCode=404;res.end('Not found');}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/';let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.FLOW_CHROME_PATH || undefined});
  const context=await browser.newContext({viewport:{width:390,height:844}}),errors=[];
  await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await require('./browser-auth-fixture.cjs').installTestAuth(context, {owner:'synthetic-offline-owner'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
  await page.goto(base+'index.html');await page.locator('#flow-decision-tools').waitFor();
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  await page.evaluate(()=>{const today=flowToday(),p=defaultFlowPlanning();p.setup={step:5,completed:true};p.periodStartedOn=today;p.payday={nextDate:addPlanDays(today,10),frequency:'biweekly'};p.manualBalance={cents:100000,date:today};p.essentials=[{id:'food',name:'Food',category:'Food',amountCents:10000}];p.cushionCents=10000;p.billsConfirmed=true;p.reservesConfirmed=true;localStorage.setItem('flowPlanning',JSON.stringify(p));localStorage.setItem('transactions','[]');localStorage.setItem('flow_user_id','synthetic-offline-owner');});
  await page.reload();await page.locator('.payday-hero').waitFor();
  await page.evaluate(async()=>{await fetch('api/private',{headers:{Authorization:'Bearer synthetic-test-only'}});await fetch('index.html?code=synthetic-test-only');});
  const cached=await page.evaluate(async()=>{const list=[];for(const name of await caches.keys())for(const r of await(await caches.open(name)).keys())list.push(r.url);return list;});
  assert.ok(cached.length>25);assert.equal(cached.some(u=>u.includes('/api/')||u.includes('code=')||u.includes('supabase.co')),false);
  await context.setOffline(true);await page.reload();await page.locator('#flow-connectivity').waitFor();assert.equal(await page.locator('#flow-connectivity').isVisible(),true);assert.match(await page.locator('.payday-hero h3').innerText(),/800.00/);
  await page.getByRole('link',{name:'Plan',exact:true}).first().click();await page.locator('#flow-plan-tools').waitFor({state:'attached'});
  await page.locator('[data-growth=goal-new]').first().click();const goalDialog=page.locator('#flow-growth-dialog'),dialog=page.locator('#flow-tools-dialog');await goalDialog.locator('[name=name]').fill('Offline goal');await goalDialog.locator('[name=target]').fill('100');await goalDialog.locator('[name=reserved]').fill('10');await goalDialog.locator('[name=locationChecked]').check();await goalDialog.locator('button[type=submit]').click();await goalDialog.locator('.goal-detail-total').waitFor();await goalDialog.getByRole('button',{name:'Close',exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('flow_pending')),'1');assert.equal(await page.evaluate(()=>localStorage.getItem('flow_pending_client')),'2');
  await page.reload();assert.match(await page.locator('#flow-growth-plan').innerText(),/Offline goal/);assert.match(await page.locator('.mobile-plan-summary').innerText(),/790.00/);
  await page.getByRole('link',{name:'Home',exact:true}).first().click();await page.locator('[data-tool=purchase]').click();
  for(let i=0;i<10;i++){await page.keyboard.press('Tab');const focus=await page.evaluate(()=>({inside:document.querySelector('#flow-tools-dialog').contains(document.activeElement),element:document.activeElement.outerHTML.slice(0,240)}));assert.equal(focus.inside,true,JSON.stringify(focus));}
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await context.setOffline(false);await page.waitForFunction(()=>navigator.onLine);await page.locator('#flow-connectivity').waitFor({state:'hidden'});assert.equal(await page.locator('#flow-connectivity').isVisible(),false);
  await page.screenshot({path:'/private/tmp/flow-product-offline-recovered.png',animations:'disabled'});
  assert.deepEqual(errors,[]);console.log('PASS: offline installation/reopen/navigation/edit persistence, queued owner changes, no private/auth caching, recovery indicator, keyboard modal focus trap and Escape.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
