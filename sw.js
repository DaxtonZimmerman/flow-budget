/* Generated public app-shell cache. No bank/auth requests or private responses. */
const VERSION='2d568c7b2ab27e93';
const FILES=["account.html","add-transaction.html","assets/flow-icon-192.png?v=78f93f2dc35f7bbf","assets/flow-icon-512.png?v=81096bd3556532e1","assets/flow-icon.svg?v=52d47154a08e23b9","assets/flow-logo.png?v=59e60a4060dd5454","bills.html","budgets.html","css/app.css?v=e1fd8e3d6cb14f8b","css/auth.css?v=73756a2ac1c382dd","css/brand.css?v=02ec8d815aea327c","css/mobile.css?v=4b922839bff4e305","css/payday.css?v=66114351f438f117","css/product.css?v=69e4237b7169e882","css/redesign.css?v=3d34d081d50965e3","css/styles.css?v=a854bef0a3b6ed9b","demo/account.html","demo/add-transaction.html","demo/bills.html","demo/budgets.html","demo/import.html","demo/index.html","demo/review.html","demo/setup.html","demo/transactions.html","import.html","index.html","js/account.js?v=8aecc0b7b9942cc1","js/add-transaction.js?v=91f35220aed9447c","js/app-offline.js?v=6f36433ac1f7ec28","js/app-shell.js?v=67b6e5097e19e886","js/auth-gate.js?v=f51ec7880e11ffe8","js/auth-storage.js?v=af54d07b8b0f115a","js/backup.js?v=0c2f1493d698ba0c","js/bank-accounts.js?v=9cbed31eee9c868d","js/bank-auto-sync.js?v=c48bcb950ce9a052","js/bank-connections.js?v=ab82c1492c367c33","js/bank-data.js?v=cd6d15801fbf8272","js/bill-data.js?v=082c6c29c0c6c3cc","js/budget-data.js?v=979e7bedf38e0496","js/budgets.js?v=e6fdae24a2b8a76a","js/cloud-config.js?v=88e7e9526b908c52","js/cloud-sync.js?v=bc499d89d93c7f20","js/home-view.js?v=c292985d973d9da8","js/import-data.js?v=2abb60f385fdd8cd","js/import.js?v=bb9853f99ad50459","js/login.js?v=3cf03f2e8803f050","js/mobile-app.js?v=a689dae709361ac8","js/mobile-views.js?v=3e1f0400b0f2a6b0","js/money-data.js?v=441d63da0fcf89f6","js/payday-app.js?v=9d4956f130be7bcf","js/planning-data.js?v=41d5331e8fef48b0","js/product-app.js?v=56bf3901e645172d","js/product-data.js?v=fdd4ba4504b92074","js/review-data.js?v=5fd89fdd5a557e23","js/review.js?v=cc5f24b2014f9428","js/script.js?v=b896f565a9ebb46b","js/storage.js?v=2f7e2302da412706","js/transaction-details-data.js?v=2705ef3f7ad5b54f","js/transaction-details.js?v=d0e6ba7ac4fea988","js/transactions.js?v=6b8fc8bd27e31d6c","js/transfer-app.js?v=85312566e1227586","js/transfer-data.js?v=bc42d3121be9a431","login.html","manifest.webmanifest?v=882cbb09a1dc67c1","offline.html","review.html","setup.html","transactions.html","vendor/lucide.min.js?v=f01557cbefed1c14","vendor/supabase.min.js?v=bee24fc29228ed5a"];
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
