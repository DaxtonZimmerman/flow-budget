/* Generated public app-shell cache. No bank/auth requests or private responses. */
const VERSION='222d0f40afd5d5f0';
const FILES=["account.html","add-transaction.html","assets/flow-icon-192.png?v=78f93f2dc35f7bbf","assets/flow-icon-512.png?v=81096bd3556532e1","assets/flow-icon.svg?v=52d47154a08e23b9","assets/flow-logo.png?v=59e60a4060dd5454","bills.html","budgets.html","css/app.css?v=e1fd8e3d6cb14f8b","css/auth.css?v=a0677cf6455b9a8f","css/brand.css?v=02ec8d815aea327c","css/experience.css?v=0dc0aacd4210587a","css/growth.css?v=901f3fd09cdb3e09","css/mobile.css?v=134ba2eb89880fc7","css/notifications.css?v=51ff706e90fa49bb","css/payday.css?v=e17d22d754c11e99","css/product.css?v=69e4237b7169e882","css/redesign.css?v=3d34d081d50965e3","css/styles.css?v=a854bef0a3b6ed9b","demo/account.html","demo/add-transaction.html","demo/bills.html","demo/budgets.html","demo/import.html","demo/index.html","demo/review.html","demo/setup.html","demo/transactions.html","import.html","index.html","js/account.js?v=41105a0ad21cb562","js/add-transaction.js?v=91f35220aed9447c","js/app-offline.js?v=cf2660da47baaba6","js/app-shell.js?v=278e202d2b07c699","js/auth-gate.js?v=1bb1463f753b038c","js/auth-storage.js?v=af54d07b8b0f115a","js/backup.js?v=0c2f1493d698ba0c","js/bank-accounts.js?v=79713a0b0e18d01e","js/bank-auto-sync.js?v=4a9e1f5819ddbbd7","js/bank-connections.js?v=5d12d9734c7c1fcf","js/bank-data.js?v=cd6d15801fbf8272","js/bank-recovery-data.js?v=0a17d65af6cff66f","js/bank-recovery.js?v=4add53cc5101431b","js/bank-status.js?v=f097ca92e0ca165f","js/bill-data.js?v=082c6c29c0c6c3cc","js/budget-data.js?v=86103c7b4fb5bd69","js/budgets.js?v=e6fdae24a2b8a76a","js/category-activity.js?v=2a0bb68c6d279700","js/cloud-config.js?v=b7eb02d2a2a0d83f","js/cloud-sync.js?v=e36c4d5e06b913e2","js/dialog-sheets.js?v=74935080b7ce7300","js/experience-data.js?v=85e9d263de82e0c9","js/experience.js?v=c90311a4d423dcac","js/growth-app.js?v=23a91a3912fd73c3","js/growth-data.js?v=822611db8ab24bd1","js/home-view.js?v=6c67f704fed4c72a","js/import-data.js?v=2abb60f385fdd8cd","js/import.js?v=bb9853f99ad50459","js/login.js?v=a0cc74def8d4c65c","js/mobile-app.js?v=dd6038e9df2741fe","js/mobile-views.js?v=fe505b0ad3551dc6","js/money-data.js?v=6f52008ebcbb4411","js/notification-data.js?v=80349ac0a703ac30","js/notifications.js?v=b0d825a6387c6413","js/payday-app.js?v=4da84b248e924cc2","js/planning-data.js?v=e2693c657b8cc09d","js/product-app.js?v=7d7fbe2a0c2c7c87","js/product-data.js?v=04ab297d75a890e2","js/review-data.js?v=5fd89fdd5a557e23","js/review.js?v=6f6dd471a74daf29","js/script.js?v=b896f565a9ebb46b","js/setup-data.js?v=2d2b08b4e9c76860","js/simple-ui.js?v=de6b7efa0fd4a82e","js/storage.js?v=2f7e2302da412706","js/transaction-details-data.js?v=2705ef3f7ad5b54f","js/transaction-details.js?v=d0e6ba7ac4fea988","js/transactions.js?v=6b8fc8bd27e31d6c","js/transfer-app.js?v=a1c21c6858348f93","js/transfer-data.js?v=bc42d3121be9a431","login.html","manifest.webmanifest?v=882cbb09a1dc67c1","offline.html","review.html","setup.html","transactions.html","vendor/lucide.min.js?v=f01557cbefed1c14","vendor/supabase.min.js?v=bee24fc29228ed5a"];
const PREFIX='flow-public-shell:'+self.registration.scope;
const CACHE=PREFIX+VERSION;
const root=new URL('./',self.registration.scope);
const allowed=new Map(FILES.map(file=>{const url=new URL(file,root);return [url.pathname,url];}));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(file=>new Request(new URL(file,root).href,{cache:'reload'}))))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);
    await self.clients.claim();
})()));
// Collect readiness from every tab, then briefly lock idle clients before activation.
const updateStates = new Map();
let updateRound = null, updateSerial = 0;
const flowWindows = async () => (await self.clients.matchAll({ type:'window', includeUncontrolled:true })).filter(client => client.url.startsWith(root.href));
async function abortUpdate() {
    if (!updateRound) return;
    const round = updateRound;
    updateRound = null;
    for (const client of await flowWindows()) client.postMessage({ type:'FLOW_UPDATE_ABORT', round:round.id });
}
async function considerUpdate() {
    const windows = await flowWindows();
    if (updateRound) {
        if (Date.now() - updateRound.started > 5000 || windows.length !== updateRound.clients.length || windows.some(client => !updateRound.clients.includes(client.id))) await abortUpdate();
        return;
    }
    const ready = windows.every(client => updateStates.get(client.id)?.ready && Date.now() - updateStates.get(client.id).at < 6000);
    if (!ready) {
        for (const client of windows) if (!updateStates.has(client.id) || Date.now()-updateStates.get(client.id).at >= 6000) client.postMessage({ type:'FLOW_UPDATE_CHECK' });
        return;
    }
    updateRound = { id:VERSION+':'+(++updateSerial), started:Date.now(), clients:windows.map(client=>client.id), acknowledgments:new Set() };
    for (const client of windows) client.postMessage({ type:'FLOW_UPDATE_COMMIT', round:updateRound.id });
    if (!windows.length) await self.skipWaiting();
}
self.addEventListener('message', event => {
    if (!event.source?.id || !event.source.url?.startsWith(root.href)) return;
    const data = event.data || {};
    if (data.type === 'FLOW_CLIENT_VERSION' && data.release !== VERSION) event.source.postMessage({type:'FLOW_RELOAD_REQUIRED'});
    if (data.type === 'FLOW_UPDATE_READY') event.waitUntil((async () => {
        updateStates.set(event.source.id, { ready:data.ready === true, at:Date.now() });
        if (!data.ready && updateRound) await abortUpdate();
        await considerUpdate();
    })());
    if (data.type === 'FLOW_UPDATE_ACK') event.waitUntil((async () => {
        if (!updateRound || data.round !== updateRound.id || !updateRound.clients.includes(event.source.id)) return;
        if (!data.ready) { updateStates.set(event.source.id, { ready:false, at:Date.now() }); await abortUpdate(); return; }
        updateRound.acknowledgments.add(event.source.id);
        if (updateRound.acknowledgments.size !== updateRound.clients.length) return;
        const round = updateRound;
        const windows = await flowWindows();
        if (updateRound !== round) return;
        if (windows.length !== round.clients.length || windows.some(client=>!round.clients.includes(client.id))) { await abortUpdate(); return; }
        await self.skipWaiting();
    })());
});
self.addEventListener('fetch',event=>{
    const request=event.request,url=new URL(request.url);
    if(request.method!=='GET'||url.origin!==root.origin||request.headers.has('authorization'))return;
    if([...url.searchParams.keys()].some(key=>/token|code|secret|auth/i.test(key)))return;
    let path=url.pathname;if(path===root.pathname)path=new URL('index.html',root).pathname;
    const entry=allowed.get(path);if(!entry)return;
    // Never answer an older asset version using a newer cached body.
    if(/\.(js|css)$/.test(path)?url.search!==entry.search:!path.endsWith('.html')&&url.search&&url.search!==entry.search)return;
    const canonical=entry.href;
    event.respondWith((async()=>{
        const cache=await caches.open(CACHE),cached=await cache.match(canonical);
        if(cached)return cached;
        try{const response=await fetch(request);if(response.ok&&response.type!=='opaque')await cache.put(canonical,response.clone());return response;}
        catch(error){if(request.mode==='navigate')return (await cache.match(new URL('offline.html',root).href))||Response.error();throw error;}
    })());
});

// Push messages contain only generic copy. Never persist account data in the app-shell cache.
self.addEventListener('push',event=>{
    event.waitUntil((async()=>{
        let data;try{data=event.data?.json();}catch{}
        const allowedBodies=new Set(['A bill is due today. Open Flow to check it.','A bill is coming up. Open Flow to see what’s due.',
            'A budget needs a look. Open Flow to see your plan.','Upcoming bills need a look. Open Flow to check them.',
            'Your budgets need a look. Open Flow to check them.','You’re all set. Flow reminders will appear here.']);
        await self.registration.showNotification('Flow.',{
            body:allowedBodies.has(data?.body)?data.body:'Open Flow to check your reminders.',
            icon:new URL('assets/flow-icon-192.png',root).href,badge:new URL('assets/flow-icon-192.png',root).href,
            tag:['flow-bill','flow-budget','flow-test'].includes(data?.tag)?data.tag:'flow-reminder',
            data:{href:new URL('index.html#notifications',root).href}
        });
    })());
});
self.addEventListener('notificationclick',event=>{
    event.notification.close();
    event.waitUntil((async()=>{
        const target=new URL('index.html#notifications',root).href;
        const windows=await flowWindows();
        const existing=windows.find(client=>!client.url.startsWith(new URL('demo/',root).href)&&!['login.html','offline.html'].some(file=>new URL(client.url).pathname===new URL(file,root).pathname));
        if(existing){existing.postMessage({type:'FLOW_OPEN_NOTIFICATIONS'});await existing.focus();}
        else await self.clients.openWindow(target);
    })());
});
