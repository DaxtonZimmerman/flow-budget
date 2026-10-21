const { chromium } = require(process.env.FLOW_PLAYWRIGHT_PATH || 'playwright');
const { installTestAuth, fixtureUser } = require('./browser-auth-fixture.cjs');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
(async () => {
    const root = path.resolve('dist'); let phase = 'a';
    const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
    const server = http.createServer((request,response) => {
        const url = new URL(request.url,'http://local'), file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1), target = path.resolve(root,file);
        if (!target.startsWith(root+path.sep)) { response.statusCode=403; return response.end(); }
        try {
            let body = fs.readFileSync(target);
            if (file==='sw.js') body = body.toString().replace(/const VERSION='([^']+)';/,(_,version)=>"const VERSION='"+version+'-'+phase+"';");
            if (file.endsWith('.html')) body = body.toString().replace(/data-flow-release="([^"]+)"/,(_,version)=>'data-flow-release="'+version+'-'+phase+'"').replace('<html ', '<html data-test-release="'+phase+'" ');
            response.setHeader('Content-Type',types[path.extname(file)]||'text/plain');response.setHeader('Cache-Control','no-store');response.end(body);
        } catch (_) { response.statusCode=404;response.end('Not found'); }
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port+'/'; let browser;
    try {
        browser=await chromium.launch({headless:true,executablePath:process.env.FLOW_CHROME_PATH||undefined});
        const errors=[];
        const watch=page=>{page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(12000);return page;};

        const guest=await browser.newContext({serviceWorkers:'block'});
        await installTestAuth(guest,{signedIn:false});
        await guest.addInitScript(()=>{localStorage.setItem('flow_user_id','pretend-owner');localStorage.setItem('transactions',JSON.stringify([{id:'private',name:'Private stored payment',amount:-5,date:'2026-10-20',category:'Food',type:'Expense'}]));});
        const entry=watch(await guest.newPage());
        for(const file of ['index','transactions','budgets','bills','review','setup','import','add-transaction','account']) {
            await entry.goto(base+file+'.html');await entry.waitForURL('**/login.html?*');
            assert.equal(await entry.getByText('Private stored payment',{exact:true}).count(),0);
            assert.equal(await entry.locator('#login-form').isVisible(),true);
        }
        // A forged local owner marker alone cannot authorize access.
        assert.equal(await entry.evaluate(()=>localStorage.getItem('flow_user_id')),'pretend-owner');
        await guest.close();

        const expired=await browser.newContext({serviceWorkers:'block'});
        await installTestAuth(expired);
        await expired.route('**/auth/v1/user',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({code:'bad_jwt',msg:'Synthetic rejected session'})}));
        const expiredPage=watch(await expired.newPage());await expiredPage.goto(base+'index.html');await expiredPage.waitForURL('**/login.html*');
        assert.equal(await expiredPage.locator('#login-form').isVisible(),true);await expired.close();

        const signed=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
        await installTestAuth(signed);
        let releaseVerification;
        const verification=new Promise(resolve=>{releaseVerification=resolve;});
        await signed.route('**/auth/v1/user',async route=>{await verification;await route.fulfill({contentType:'application/json',body:JSON.stringify(fixtureUser)});});
        const page=watch(await signed.newPage());await page.goto(base+'index.html',{waitUntil:'domcontentloaded'});
        assert.equal(await page.locator('.app').isVisible(),false);
        assert.equal(await page.locator('.flow-auth-loading').isVisible(),true);
        releaseVerification();await page.waitForFunction(()=>FlowAuth.authorized&&document.documentElement.dataset.flowAuth==='ready');
        assert.equal(await page.locator('.app').isVisible(),true);
        await page.reload();await page.waitForFunction(()=>FlowAuth.authorized);assert.ok(page.url().endsWith('index.html'));
        // Unsafe return URLs are replaced with the app Home route.
        await page.goto(base+'login.html?next=https%3A%2F%2Fexample.invalid%2F');await page.waitForURL(base+'index.html');
        assert.equal(await page.evaluate(()=>FlowAuth.destination('transactions.html?month=2026-10&access_token=secret').search),'?month=2026-10');
        await page.goto(base+'account.html');await page.locator('#account-connected').waitFor();
        const other=watch(await signed.newPage());await other.goto(base+'transactions.html');await other.waitForFunction(()=>FlowAuth.authorized);
        await page.locator('#sign-out').click();await page.waitForURL('**/login.html*');await other.waitForURL('**/login.html*');
        assert.equal(await page.evaluate(()=>localStorage.getItem('transactions')),null);
        await signed.close();

        const login=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
        await installTestAuth(login,{signedIn:false});
        const loginPage=watch(await login.newPage());await loginPage.goto(base+'login.html?next=transactions.html');
        for(const width of [1440,390,320]) {
            await loginPage.setViewportSize({width,height:844});
            await loginPage.locator('#login-form').waitFor();
            assert.equal(await loginPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Sign-in overflow at '+width);
        }
        await loginPage.setViewportSize({width:390,height:844});
        await loginPage.screenshot({path:'/private/tmp/flow-sign-in-390.png',fullPage:true,animations:'disabled'});
        await loginPage.locator('[name=email]').fill('sample@example.invalid');await loginPage.locator('#login-form button').click();
        await loginPage.locator('#login-code-form').waitFor();
        assert.equal(await loginPage.locator('[name=link]').count(),0);
        await loginPage.locator('[name=code]').fill('000000');
        await loginPage.locator('#login-code-form button').click();await loginPage.getByText(/incorrect or expired/).waitFor();
        await loginPage.locator('[name=code]').fill('123456');
        await loginPage.locator('#login-code-form button').click();await loginPage.waitForURL(base+'account.html');
        await loginPage.locator('#account-choose').waitFor();loginPage.once('dialog',dialog=>dialog.accept());
        await loginPage.locator('#use-cloud').click();await loginPage.waitForURL(base+'transactions.html');
        await login.close();
        console.log('PASS: all personal routes require sign-in; cached owner markers cannot bypass it; verified sessions reopen; initial content stays hidden; return URLs are constrained; sign-out locks other tabs; email-code sign-in and workspace selection work without sign-in links.');

        // Exercise a real service-worker update with two open tabs and an unsaved form.
        const update=await browser.newContext({viewport:{width:390,height:844}});
        const home=watch(await update.newPage());await home.goto(base+'demo/index.html');
        await home.evaluate(()=>navigator.serviceWorker.ready);await home.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
        const editor=watch(await update.newPage());await editor.goto(base+'demo/add-transaction.html');await editor.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
        await editor.locator('#transaction-name').fill('Kept update draft');
        await editor.locator('#transaction-type').selectOption('Expense');await editor.locator('#transaction-category').selectOption('Food');await editor.locator('#transaction-amount').fill('12.34');
        phase='b';await home.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update();});
        await home.waitForFunction(async()=>Boolean((await navigator.serviceWorker.getRegistration()).waiting));
        await editor.waitForFunction(()=>document.querySelector('#flow-app-update')?.textContent.includes('current edit'));
        assert.equal(await home.locator('html').getAttribute('data-test-release'),'a');
        assert.equal(await editor.locator('#transaction-name').inputValue(),'Kept update draft');
        assert.equal(await home.getByRole('button',{name:'Update app',exact:true}).count(),0);
        await editor.locator('#save-transaction-button').click();
        try { await home.waitForFunction(()=>document.documentElement.dataset.testRelease==='b',null,{timeout:20000}); }
        catch(error) {
            for(const worker of update.serviceWorkers()) console.error('Worker diagnostic',await worker.evaluate(async()=>({version:VERSION,round:updateRound&&{...updateRound,acknowledgments:[...updateRound.acknowledgments]},states:[...updateStates],clients:(await flowWindows()).map(c=>({id:c.id,url:c.url,visibility:c.visibilityState}))})).catch(()=>null));
            for(const tab of [home,editor]) console.error('Tab diagnostic',await tab.evaluate(async()=>({url:location.href,phase:document.documentElement.dataset.testRelease,auth:window.FlowAuth&&{checking:FlowAuth.checking,authorized:FlowAuth.authorized},updating:document.documentElement.dataset.flowUpdating,notice:document.querySelector('#flow-app-update')?.textContent,forms:document.querySelectorAll('form').length,dialogs:document.querySelectorAll('dialog[open]').length,waiting:Boolean((await navigator.serviceWorker.getRegistration()).waiting)})).catch(()=>null));
            throw error;
        }
        await editor.waitForFunction(()=>document.documentElement.dataset.testRelease==='b',null,{timeout:20000});
        assert.equal(await editor.evaluate(()=>loadTransactions().find(t=>t.name==='Kept update draft').amount),-12.34);
        assert.equal(await editor.evaluate(()=>flowStorage.getItem('flowDemoSeeded')),'1');
        await home.screenshot({path:'/private/tmp/flow-auto-update-home.png',animations:'disabled'});
        await update.close();
        assert.deepEqual(errors,[]);
        console.log('PASS: a real automatic service-worker update waits for another tab’s unsaved form, activates without an Update button, reloads both idle tabs, and preserves the saved payment.');
    } finally { if(browser)await browser.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
