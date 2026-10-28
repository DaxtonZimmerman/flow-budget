/* Generated public app-shell cache. No bank/auth requests or private responses. */
const VERSION='b395e48748047d3a';
const FILES=["account.html","add-transaction.html","assets/flow-icon-192.png?v=78f93f2dc35f7bbf","assets/flow-icon-512.png?v=81096bd3556532e1","assets/flow-icon.svg?v=52d47154a08e23b9","assets/flow-logo.png?v=59e60a4060dd5454","bills.html","budgets.html","css/app.css?v=e1fd8e3d6cb14f8b","css/auth.css?v=a0677cf6455b9a8f","css/brand.css?v=02ec8d815aea327c","css/experience.css?v=8a52e7e78bc41a4a","css/growth.css?v=901f3fd09cdb3e09","css/mobile.css?v=4b922839bff4e305","css/payday.css?v=e17d22d754c11e99","css/product.css?v=69e4237b7169e882","css/redesign.css?v=3d34d081d50965e3","css/styles.css?v=a854bef0a3b6ed9b","demo/account.html","demo/add-transaction.html","demo/bills.html","demo/budgets.html","demo/import.html","demo/index.html","demo/review.html","demo/setup.html","demo/transactions.html","import.html","index.html","js/account.js?v=b2e1897385e9ff03","js/add-transaction.js?v=91f35220aed9447c","js/app-offline.js?v=314d8d989dd5f718","js/app-shell.js?v=42c9dfd62892041b","js/auth-gate.js?v=1bb1463f753b038c","js/auth-storage.js?v=af54d07b8b0f115a","js/backup.js?v=0c2f1493d698ba0c","js/bank-accounts.js?v=e30cfbe4cc2f23b6","js/bank-auto-sync.js?v=db02509d5ece0536","js/bank-connections.js?v=23c84014b70a72fc","js/bank-data.js?v=cd6d15801fbf8272","js/bank-status.js?v=f097ca92e0ca165f","js/bill-data.js?v=082c6c29c0c6c3cc","js/budget-data.js?v=979e7bedf38e0496","js/budgets.js?v=e6fdae24a2b8a76a","js/cloud-config.js?v=5611b0db114fde91","js/cloud-sync.js?v=69ca41a8fa85bdaf","js/experience-data.js?v=85e9d263de82e0c9","js/experience.js?v=c90311a4d423dcac","js/growth-app.js?v=23a91a3912fd73c3","js/growth-data.js?v=822611db8ab24bd1","js/home-view.js?v=6c67f704fed4c72a","js/import-data.js?v=2abb60f385fdd8cd","js/import.js?v=bb9853f99ad50459","js/login.js?v=a0cc74def8d4c65c","js/mobile-app.js?v=f822ea07457784fb","js/mobile-views.js?v=3e486e5e93372bbe","js/money-data.js?v=441d63da0fcf89f6","js/payday-app.js?v=ce44843ee904ddbd","js/planning-data.js?v=0e19a2166395a607","js/product-app.js?v=c51b0b233f1f02ee","js/product-data.js?v=107ad899f890c4c3","js/review-data.js?v=5fd89fdd5a557e23","js/review.js?v=cc5f24b2014f9428","js/script.js?v=b896f565a9ebb46b","js/setup-data.js?v=2d2b08b4e9c76860","js/storage.js?v=2f7e2302da412706","js/transaction-details-data.js?v=2705ef3f7ad5b54f","js/transaction-details.js?v=d0e6ba7ac4fea988","js/transactions.js?v=6b8fc8bd27e31d6c","js/transfer-app.js?v=a1c21c6858348f93","js/transfer-data.js?v=bc42d3121be9a431","login.html","manifest.webmanifest?v=882cbb09a1dc67c1","offline.html","review.html","setup.html","transactions.html","vendor/lucide.min.js?v=f01557cbefed1c14","vendor/supabase.min.js?v=bee24fc29228ed5a"];
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
