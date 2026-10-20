const {chromium}=require(process.env.FLOW_PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve('dist'),oldPaths=['js/planning-data.js','js/money-data.js','js/app-shell.js','js/cloud-sync.js'];
 let phase='old',browser;const requests=[];
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://local'),file=url.pathname.slice(1);requests.push(url.pathname+url.search);
  res.setHeader('Content-Security-Policy',"default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; worker-src 'self'");
  if(file==='prime.html'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>Cache upgrade fixture</title>');}
  const target=path.resolve(root,file);if(!target.startsWith(root+path.sep)){res.statusCode=403;return res.end();}
  try{
   let body=fs.readFileSync(target);res.setHeader('Content-Type',mime[path.extname(target)]||'text/plain');
   if(phase==='old'&&oldPaths.includes(file)&&!url.search){body=body.toString().replace(/^var flowStorage[^\n]*\n/,'').replaceAll('flowStorage','localStorage');res.setHeader('Cache-Control','public,max-age=31536000,immutable');}
   else res.setHeader('Cache-Control','no-cache');
   res.end(body);
  }catch(_){res.statusCode=404;res.end('Not found');}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/';
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.FLOW_CHROME_PATH||undefined});
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[],missing=[];
  page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(base)&&new URL(r.url()).pathname!=='/favicon.ico')missing.push(r.url());});
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  // Do not route requests: browser routing disables the HTTP cache being tested.
  await page.goto(base+'prime.html');
  await page.evaluate(async paths=>{await Promise.all(paths.map(p=>fetch(p)));localStorage.setItem('transactions',JSON.stringify([{id:'private-fixture',name:'Native workspace sentinel',type:'Expense',category:'Other',amount:-99,date:'2026-10-19'}]));localStorage.setItem('flowPlanning',JSON.stringify({sentinel:'private-native-plan'}));},oldPaths);
  const before=await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage))));phase='new';
  await page.goto(base+'demo/index.html');await page.locator('#flow-decision-tools').waitFor();
  assert.match(await page.locator('.payday-hero h3').innerText(),/265.00/);
  assert.match(await page.locator('.recent-list').innerText().catch(()=>page.locator('body').innerText()),/Corner Market/);
  assert.equal(await page.getByText('Native workspace sentinel',{exact:true}).count(),0);
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  const cached=await page.evaluate(async()=>{const keys=[];for(const name of await caches.keys())for(const r of await(await caches.open(name)).keys())keys.push(r.url);return keys;});
  assert.ok(cached.some(u=>/\/js\/planning-data\.js\?v=[a-f0-9]{16}$/.test(u)));
  assert.equal(cached.some(u=>/\/js\/[^?]+\.js$/.test(u)),false);
  assert.ok(requests.some(u=>u.startsWith('/js/planning-data.js?v=')));
  const legacy=await page.evaluate(()=>fetch('../js/planning-data.js').then(r=>r.text()));assert.ok(legacy.includes('localStorage.getItem'));assert.equal(legacy.includes('flowStorage.getItem'),false);
  await context.setOffline(true);await page.reload();await page.locator('#flow-decision-tools').waitFor();assert.match(await page.locator('.payday-hero h3').innerText(),/265.00/);
  assert.equal(await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage)))),before);
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);console.log('PASS: warm legacy HTTP cache cannot mix with demo assets; native workspace remains untouched; all public assets load; service worker stores versioned assets and preserves sample isolation offline.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
