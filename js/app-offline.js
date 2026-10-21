/* Automatic app updates wait for saved forms and every open Flow tab. */
(function () {
    let registration = null, pendingWorker = null, needsReload = false, updateLock = '', lockTimer;
    let lastInteraction = 0, hadController = Boolean(navigator.serviceWorker?.controller);
    const dirtyForms = new Set();
    const appRoot = new URL(typeof flowDemoMode !== 'undefined' && flowDemoMode ? '../' : './', location.href);
    const workerUrl = new URL('sw.js', appRoot).href;
    const mount = () => document.querySelector('.main') || document.querySelector('main');
    function banner() {
        let node = document.querySelector('#flow-connectivity');
        if (!node) { node = document.createElement('div'); node.id = 'flow-connectivity'; node.className = 'offline-banner'; node.setAttribute('role', 'status'); mount()?.prepend(node); }
        node.hidden = navigator.onLine;
        node.textContent = 'You’re offline. Your changes will sync when you reconnect.';
    }
    function busy() {
        for (const form of dirtyForms) if (!form.isConnected || form.closest('dialog:not([open])')) dirtyForms.delete(form);
        return Boolean(window.FlowAuth?.checking || document.querySelector('dialog[open], #transaction-form, #setup-form') ||
            dirtyForms.size || typeof window.hasFlowReviewDraft === 'function' && window.hasFlowReviewDraft() ||
            typeof flowSyncing !== 'undefined' && flowSyncing || Date.now() - lastInteraction < 1600);
    }
    function updateNotice(text) {
        let node = document.querySelector('#flow-app-update');
        if (!node) { node = document.createElement('div'); node.id = 'flow-app-update'; node.className = 'app-update-banner'; node.setAttribute('role', 'status'); mount()?.prepend(node); }
        node.textContent = text;
    }
    function unlock() {
        updateLock = ''; clearTimeout(lockTimer);
        document.documentElement.removeAttribute('data-flow-updating');
    }
    function report() {
        const worker = registration?.waiting || pendingWorker;
        if (!worker || worker.state === 'redundant') return;
        pendingWorker = worker;
        if (!updateLock) worker.postMessage({ type: 'FLOW_UPDATE_READY', ready: !busy() });
        updateNotice(busy() ? 'An update will finish automatically after your current edit.' : 'Flow will update automatically when all open tabs are ready.');
    }
    function changed(event) {
        if (updateLock) { event.preventDefault(); event.stopImmediatePropagation(); return; }
        lastInteraction = Date.now();
        if (['input', 'change'].includes(event.type) && event.target.form) dirtyForms.add(event.target.form);
        if (pendingWorker) report();
    }
    for (const name of ['beforeinput', 'input', 'change', 'click', 'keydown']) document.addEventListener(name, changed, true);
    document.addEventListener('reset', event => { dirtyForms.delete(event.target); }, true);
    document.addEventListener('close', () => setTimeout(report, 1700), true);
    function controllerChanged() {
        if (hadController) needsReload = true;
        hadController = true;
        navigator.serviceWorker.controller?.postMessage({ type:'FLOW_CLIENT_VERSION', release:document.documentElement.dataset.flowRelease });
        if (needsReload && (updateLock || !busy())) location.reload();
    }
    async function checkForUpdate() {
        if (!registration) return;
        if (navigator.onLine && !document.hidden) try { await registration.update(); } catch (_) { /* Retry when online. */ }
        report();
    }
    document.addEventListener('DOMContentLoaded', async () => {
        const skip = document.createElement('a'); skip.href = '#flow-main-content'; skip.className = 'skip-link'; skip.textContent = 'Skip to main content'; document.body.prepend(skip);
        const main = mount(); if (main) { main.id = 'flow-main-content'; main.tabIndex = -1; }
        banner();
        if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
        navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.source?.scriptURL !== workerUrl) return;
            const data = event.data || {};
            if (data.type === 'FLOW_RELOAD_REQUIRED') { needsReload = true; if (!busy()) location.reload(); }
            if (data.type === 'FLOW_UPDATE_CHECK') { pendingWorker = event.source; report(); }
            if (data.type === 'FLOW_UPDATE_COMMIT') {
                const ready = !busy();
                if (ready) {
                    updateLock = data.round;
                    document.documentElement.dataset.flowUpdating = 'true';
                    updateNotice('Updating Flow…');
                    lockTimer = setTimeout(unlock, 8000);
                }
                event.source.postMessage({ type: 'FLOW_UPDATE_ACK', round: data.round, ready });
            }
            if (data.type === 'FLOW_UPDATE_ABORT' && data.round === updateLock) unlock();
        });
        try {
            registration = await navigator.serviceWorker.register(workerUrl, { scope: appRoot.pathname, updateViaCache: 'none' });
            registration.active?.postMessage({ type:'FLOW_CLIENT_VERSION', release:document.documentElement.dataset.flowRelease });
            registration.addEventListener('updatefound', () => {
                const worker = registration.installing;
                worker?.addEventListener('statechange', () => { if (worker.state === 'installed') report(); });
            });
            report();
            setInterval(() => {
                if (needsReload && !busy()) location.reload();
                else if (registration.waiting || pendingWorker?.state === 'installed') report();
            }, 2000);
            setInterval(checkForUpdate, 5 * 60 * 1000);
        } catch (_) { /* The online app still works when an offline shell cannot be prepared. */ }
    });
    window.addEventListener('online', () => { banner(); checkForUpdate(); });
    window.addEventListener('offline', banner);
    window.addEventListener('focus', checkForUpdate);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
})();
