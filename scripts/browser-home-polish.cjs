/* Isolated sample bank balances and real touch scrolling; never contacts a provider. */
const { chromium } = require(process.env.FLOW_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.FLOW_TEST_URL || 'http://127.0.0.1:4341/';
(async () => {
 const browser = await chromium.launch({headless:true, executablePath:process.env.FLOW_CHROME_PATH || undefined});
 try {
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'America/Denver',serviceWorkers:'block'});
  const external=[],errors=[];
  await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : (external.push(route.request().url()),route.abort()));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.stack));page.setDefaultTimeout(7000);
  await page.goto(base+'demo/index.html');await page.locator('.demo-banner').waitFor();
  await page.evaluate(()=>{
   const p=loadFlowPlanning();p.manualBalance=null;p.selectedAccountIds=['sample:checking'];p.preferences.weeklyReminders=true;
   p.features=flowFeatureDefaults();p.features.goals=[{id:'sample-goal',name:'A weekend away',targetCents:100000,reservedCents:10000,contributionCents:1000,location:'outside'}];
   flowStorage.setItem('flowPlanning',JSON.stringify(p));
   flowStorage.setItem('bankAccounts',JSON.stringify([{id:'sample:checking',accountId:'checking',bankConnectionId:'sample',name:'Sample checking',type:'depository',subtype:'checking',currency:'USD',availableCents:50000,currentCents:50000,retrievedAt:new Date().toISOString(),bankUpdatedAt:null}]));
   flowStorage.removeItem('flowLastEstimate');
  });await page.reload();
  assert.equal(await page.locator('.home-notice').count(),0,'a normal missing bank date is not an error');
  assert.equal(await page.locator('.home-amount').innerText(),'$265.00');
  assert.match(await page.locator('.home-source-button').innerText(),/Bank estimate · checked/);
  await page.locator('.home-source-button').click();const details=page.locator('#payday-dialog');
  assert.match(await details.innerText(),/balance date isn’t supplied for this account/);
  assert.match(await details.innerText(),/checks your connected bank automatically/);
  assert.match(await details.innerText(),/check time is not the bank’s balance date/);
  await details.getByRole('button',{name:'Close',exact:true}).click();await details.waitFor({state:'hidden'});await page.waitForTimeout(100);
  const track=page.locator('.home-highlights-track'),panel=page.locator('.home-highlights');
  await track.scrollIntoViewIfNeeded();
  await page.evaluate(()=>{window.originalHome=document.querySelector('.home-hero');window.originalTrack=document.querySelector('.home-highlights-track');});
  const slideCount=await track.locator('.home-highlight-content').count();assert.ok(slideCount>=4);
  const amount=await page.locator('.home-amount').innerText();
  assert.equal(await panel.locator('[data-step="-1"]').isDisabled(),true);
  await panel.locator('[data-step="1"]').click();
  // Observe intermediate positions rather than merely testing the final slide.
  const samples=await track.evaluate(el=>new Promise(resolve=>{const values=[];let frames=0;function next(){values.push(el.scrollLeft);if(++frames<45)requestAnimationFrame(next);else resolve({values,width:el.clientWidth});}requestAnimationFrame(next);}));
  assert.ok(samples.values.some(x=>x>3&&x<samples.width-3),'arrow navigation animates through intermediate positions');
  await page.waitForFunction(()=>document.querySelector('[data-highlight-key=spending]').inert===false);
  assert.equal(await page.evaluate(()=>originalHome===document.querySelector('.home-hero') && originalTrack===document.querySelector('.home-highlights-track')),true,'slide changes preserve Home and the track');
  assert.equal(await page.locator('.home-amount').innerText(),amount);
  assert.equal(await panel.locator('[aria-pressed=true]').getAttribute('data-key'),'spending');
  assert.equal(await track.locator('[data-highlight-key=bills]').getAttribute('aria-hidden'),'true');
  // A real touch gesture moves content before the finger is released.
  const cdp=await context.newCDPSession(page),rect=await track.boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width*.85,y:rect.y+45}]});
  for(let i=1;i<=8;i++){
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:rect.x+rect.width*(.85-i*.075),y:rect.y+45}]});
   await page.waitForTimeout(20);
  }
  const dragging=await track.evaluate(el=>el.scrollLeft);
  assert.ok(dragging>samples.width+30,'the content follows the finger during a swipe');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>document.querySelector('.home-slide-dot[aria-pressed=true]').dataset.key==='goal');
  await page.waitForTimeout(200);
  await panel.locator('.home-slide-dot[data-key=weekly]').click();
  await page.waitForFunction(()=>Math.abs(document.querySelector('.home-highlights-track').scrollLeft-(document.querySelector('[data-highlight-key=weekly]').offsetLeft-document.querySelector('[data-highlight-key=bills]').offsetLeft))<2);
  assert.equal(await panel.locator('[data-step="1"]').isDisabled(),true);
  // Keyboard navigation and a live balance render retain the selected card.
  await track.focus();await page.keyboard.press('Home');await page.waitForFunction(()=>document.querySelector('.home-highlights-track').scrollLeft<2);
  await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('.home-slide-dot[aria-pressed=true]').dataset.key==='spending');
  await page.waitForFunction(()=>Math.abs(document.querySelector('.home-highlights-track').scrollLeft-(document.querySelector('[data-highlight-key=spending]').offsetLeft-document.querySelector('[data-highlight-key=bills]').offsetLeft))<2);
  await page.evaluate(()=>document.dispatchEvent(new Event('flow-accounts-updated')));
  await page.waitForFunction(()=>{const t=document.querySelector('.home-highlights-track'),s=t.querySelector('[data-highlight-key=spending]');return !s.inert&&Math.abs(t.scrollLeft-(s.offsetLeft-t.firstElementChild.offsetLeft))<2;});
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:1000});await page.waitForTimeout(100);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'no page overflow at '+width);
   assert.equal(await panel.locator('.home-slide-dot[aria-pressed=true]').getAttribute('data-key'),'spending');
  }
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await panel.locator('.home-slide-dot[data-key=bills]').click();
  assert.equal(await track.evaluate(el=>el.scrollLeft),0,'reduced motion changes position immediately');
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});
  await page.screenshot({path:'/private/tmp/flow-home-polish-phone.png',fullPage:true,animations:'disabled'});
  // An actually stale balance must still stop the spending estimate.
  await page.evaluate(()=>{const a=loadBankAccounts();a[0].bankUpdatedAt=new Date(Date.now()-72*3600000).toISOString();flowStorage.setItem('bankAccounts',JSON.stringify(a));document.dispatchEvent(new Event('flow-accounts-updated'));});
  assert.equal(await page.locator('.home-amount').innerText(),'Let’s check');assert.equal(await page.locator('.home-notice').count(),1);
  await page.evaluate(()=>{const a=loadBankAccounts();a[0].bankUpdatedAt=null;a[0].retrievedAt=new Date(Date.now()-72*3600000).toISOString();flowStorage.setItem('bankAccounts',JSON.stringify(a));document.dispatchEvent(new Event('flow-accounts-updated'));});
  assert.equal(await page.locator('.home-amount').innerText(),'Let’s check');
  await page.evaluate(()=>{const a=loadBankAccounts();a[0].retrievedAt=new Date().toISOString();flowStorage.setItem('bankAccounts',JSON.stringify(a));document.dispatchEvent(new Event('flow-accounts-updated'));});
  assert.equal(await page.locator('.home-amount').innerText(),'$265.00');assert.equal(await page.locator('.home-notice').count(),0);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  console.log('PASS: missing-date explanation, unchanged payday math, genuine stale-data protection, animated buttons, finger-following swipe, accessible controls, no Home replacement, selected-card preservation, 320–1440 layouts, reduced motion, and no provider requests.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
