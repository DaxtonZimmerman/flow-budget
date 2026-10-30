/* Generated public app-shell cache. No bank/auth requests or private responses. */
const VERSION='__FLOW_VERSION__';
const FILES=__FLOW_FILES__;
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
