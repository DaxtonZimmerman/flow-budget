/* Generated public app-shell cache. No bank/auth requests or private responses. */
const VERSION='4f2f7f35bd315d2d';
const FILES=["account.html","add-transaction.html","assets/flow-icon-192.png","assets/flow-icon-512.png","assets/flow-icon.svg","budgets.html","css/app.css","css/payday.css","css/product.css","css/styles.css","demo/account.html","demo/add-transaction.html","demo/budgets.html","demo/import.html","demo/index.html","demo/review.html","demo/setup.html","demo/transactions.html","import.html","index.html","js/account.js","js/add-transaction.js","js/app-offline.js","js/app-shell.js","js/backup.js","js/bank-accounts.js","js/bank-auto-sync.js","js/bank-connections.js","js/bank-data.js","js/bill-data.js","js/budget-data.js","js/budgets.js","js/cloud-config.js","js/cloud-sync.js","js/import-data.js","js/import.js","js/money-data.js","js/payday-app.js","js/planning-data.js","js/product-app.js","js/product-data.js","js/review-data.js","js/review.js","js/script.js","js/storage.js","js/transaction-details-data.js","js/transaction-details.js","js/transactions.js","js/transfer-app.js","js/transfer-data.js","manifest.webmanifest","offline.html","review.html","setup.html","transactions.html","vendor/lucide.min.js"];
const PREFIX='flow-public-shell:'+self.registration.scope;
const CACHE=PREFIX+VERSION;
const root=new URL('./',self.registration.scope);
const allowed=new Set(FILES.map(file=>new URL(file,root).pathname));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(file=>new URL(file,root).href)))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);
    await self.clients.claim();
})()));
self.addEventListener('message',event=>{if(event.data?.type==='APPLY_FLOW_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
    const request=event.request,url=new URL(request.url);
    if(request.method!=='GET'||url.origin!==root.origin||request.headers.has('authorization'))return;
    if([...url.searchParams.keys()].some(key=>/token|code|secret|auth/i.test(key)))return;
    let path=url.pathname;if(path===root.pathname)path=new URL('index.html',root).pathname;
    if(!allowed.has(path))return;
    const canonical=new URL(path,root.origin).href;
    event.respondWith((async()=>{
        const cache=await caches.open(CACHE),cached=await cache.match(canonical);
        if(cached)return cached;
        try{const response=await fetch(request);if(response.ok&&response.type!=='opaque')await cache.put(canonical,response.clone());return response;}
        catch(error){if(request.mode==='navigate')return (await cache.match(new URL('offline.html',root).href))||Response.error();throw error;}
    })());
});
