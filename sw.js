/* Generated public app-shell cache. No bank/auth requests or private responses. */
const VERSION='719f7cff6d5ecc4d';
const FILES=["account.html","add-transaction.html","assets/flow-icon-192.png?v=8a7551b81ec50ee3","assets/flow-icon-512.png?v=e7d0a8c28e3c4387","assets/flow-icon.svg?v=ccdbb5ef83a23c13","budgets.html","css/app.css?v=c91e86205087de8d","css/payday.css?v=66114351f438f117","css/product.css?v=69e4237b7169e882","css/styles.css?v=a854bef0a3b6ed9b","demo/account.html","demo/add-transaction.html","demo/budgets.html","demo/import.html","demo/index.html","demo/review.html","demo/setup.html","demo/transactions.html","import.html","index.html","js/account.js?v=bc2d6c2ecfc1805f","js/add-transaction.js?v=cf38cda5e301feb9","js/app-offline.js?v=550eab51741ec331","js/app-shell.js?v=1b2de99a2915a99b","js/backup.js?v=0c2f1493d698ba0c","js/bank-accounts.js?v=c651bf2d26c13e26","js/bank-auto-sync.js?v=c48bcb950ce9a052","js/bank-connections.js?v=ab82c1492c367c33","js/bank-data.js?v=cd6d15801fbf8272","js/bill-data.js?v=082c6c29c0c6c3cc","js/budget-data.js?v=979e7bedf38e0496","js/budgets.js?v=e6fdae24a2b8a76a","js/cloud-config.js?v=88e7e9526b908c52","js/cloud-sync.js?v=f42dd4744dc97498","js/import-data.js?v=2abb60f385fdd8cd","js/import.js?v=bb9853f99ad50459","js/money-data.js?v=33c255a943730776","js/payday-app.js?v=36a2813a962d2a8e","js/planning-data.js?v=059c82c4bab66211","js/product-app.js?v=3e78f051fd15d426","js/product-data.js?v=fdd4ba4504b92074","js/review-data.js?v=5fd89fdd5a557e23","js/review.js?v=cc5f24b2014f9428","js/script.js?v=b896f565a9ebb46b","js/storage.js?v=2f7e2302da412706","js/transaction-details-data.js?v=2705ef3f7ad5b54f","js/transaction-details.js?v=d0e6ba7ac4fea988","js/transactions.js?v=234c6f58a2e4de5f","js/transfer-app.js?v=85312566e1227586","js/transfer-data.js?v=bc42d3121be9a431","manifest.webmanifest?v=882cbb09a1dc67c1","offline.html","review.html","setup.html","transactions.html","vendor/lucide.min.js?v=f01557cbefed1c14"];
const PREFIX='flow-public-shell:'+self.registration.scope;
const CACHE=PREFIX+VERSION;
const root=new URL('./',self.registration.scope);
const allowed=new Map(FILES.map(file=>{const url=new URL(file,root);return [url.pathname,url];}));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(file=>new Request(new URL(file,root).href,{cache:'reload'}))))));
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
