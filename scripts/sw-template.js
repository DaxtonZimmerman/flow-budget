/* Generated public app-shell cache. No bank/auth requests or private responses. */
const VERSION='__FLOW_VERSION__';
const FILES=__FLOW_FILES__;
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
