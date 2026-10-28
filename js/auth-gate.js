/* Require a Supabase sign-in before revealing a personal workspace. */
(function () {
    const root = new URL('../', document.currentScript.src);
    const loginPage = location.pathname === new URL('login.html', root).pathname;
    const accountPage = location.pathname === new URL('account.html', root).pathname;
    const callback = /(?:access_token=|[?&]code=)/.test(location.hash + location.search);
    const pageReady = document.readyState === 'complete' ? Promise.resolve() : new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once:true }));
    let resolveReady, running = false, retryTimer, redirecting = false, attemptNumber = 0;
    const state = { authorized: false, user: null, checking: true, root: root.href };
    state.ready = new Promise(resolve => { resolveReady = resolve; });
    window.FlowAuth = state;

    function destination(value) {
        const allowed = ['index.html', 'transactions.html', 'add-transaction.html', 'budgets.html', 'bills.html', 'review.html', 'setup.html', 'import.html', 'account.html'];
        try {
            const url = new URL(value || 'index.html', root);
            if (url.origin !== root.origin || !allowed.some(file => url.pathname === new URL(file, root).pathname)) return new URL('index.html', root);
            for (const key of [...url.searchParams.keys()]) if (!['month', 'from', 'edit', 'search', 'view', 'step', 'quick'].includes(key)) url.searchParams.delete(key);
            if (!/^#[a-z][a-z0-9_-]*$/i.test(url.hash)) url.hash = '';
            return url;
        } catch (_) { return new URL('index.html', root); }
    }
    state.destination = destination;
    function rememberedNext() {
        try { return destination(sessionStorage.getItem('flow_sign_in_next')).href; }
        catch (_) { return destination().href; }
    }
    state.continue = function () {
        const next = rememberedNext();
        if (localStorage.getItem('flow_user_id') !== state.user?.id) {
            try { sessionStorage.setItem('flow_sign_in_continue', '1'); } catch (_) {}
            location.replace(new URL('account.html', root).href);
        } else {
            try { sessionStorage.removeItem('flow_sign_in_next'); sessionStorage.removeItem('flow_sign_in_continue'); } catch (_) {}
            location.replace(next);
        }
    };
    function lock(text, recovery = false) {
        state.authorized = false;
        document.documentElement.dataset.flowAuth = 'checking';
        let panel = document.querySelector('.flow-auth-loading');
        if (!panel) {
            panel = document.createElement('section'); panel.className = 'flow-auth-loading';
            panel.innerHTML = '<div class="flow-loader-mark"><span class="flow-wordmark"><img alt="Flow." width="280" height="124"></span><span class="flow-loader-orbit" aria-hidden="true"><span></span></span></div><p role="status"></p><div class="flow-loader-actions" hidden><button type="button" class="save-button">Try again</button><a href="' + new URL('login.html', root).href + '">Sign-in help</a></div>';
            panel.querySelector('img').src = new URL('assets/flow-logo.png', root).href;
            panel.querySelector('button').addEventListener('click', () => check());
            document.body.appendChild(panel);
        }
        panel.querySelector('p').textContent = recovery ? text : /Opening|Checking/.test(text) ? 'Opening Flow…' : text;
        panel.querySelector('.flow-loader-actions').hidden = !recovery;
        panel.dataset.phase = recovery ? 'recovery' : 'opening';
    }
    function reveal() {
        pageReady.then(() => {
            document.documentElement.dataset.flowAuth = 'ready';
            document.querySelector('.flow-auth-loading')?.remove();
        });
    }
    function signIn(reason = '') {
        state.checking = false; state.authorized = false; resolveReady(null);
        if (loginPage) { reveal(); return; }
        if (redirecting) return;
        redirecting = true;
        const next = destination(location.href);
        const url = new URL('login.html', root);
        url.searchParams.set('next', next.pathname.slice(root.pathname.length) + next.search + next.hash);
        if (reason) url.searchParams.set('reason', reason);
        location.replace(url.href);
    }
    function retryable(error) {
        return error && (error.name === 'AuthRetryableFetchError' || error.name === 'TypeError' || error.name === 'AbortError' ||
            error.status === 0 || error.status === 429 || error.status >= 500 || error.code === 'conflict');
    }
    function retryLater() {
        lock(navigator.onLine ? 'Restoring your sign-in. Flow will retry automatically.' : 'Waiting for a connection. Flow will retry automatically.', true);
        resolveReady(null);
        clearTimeout(retryTimer);
        if (navigator.onLine && !document.hidden) retryTimer = setTimeout(check, 10000);
    }
    state.signInStatus = function () {
        const storage = typeof flowAuthStorage !== 'undefined' && typeof flowAuthStorage?.status === 'function' ? flowAuthStorage.status() : {};
        const app = matchMedia('(display-mode: standalone)').matches || navigator.standalone ? 'installed' : 'browser';
        return 'Flow ' + (document.documentElement.dataset.flowRelease || 'preview') + ' | ' + app +
            ' | local: ' + (storage.local || 'unknown') + ' | durable: ' + (storage.durable || 'unknown') +
            ' | recovered: ' + (storage.recovered ? 'yes' : 'no') + ' | reason: ' +
            (['missing', 'expired', 'offline'].includes(new URLSearchParams(location.search).get('reason')) ? new URLSearchParams(location.search).get('reason') : 'none');
    };
    async function check() {
        if (running) return;
        clearTimeout(retryTimer);
        running = true; state.checking = true;
        const attempt = ++attemptNumber;
        let deadline;
        // A stalled request or SDK lock must not leave the app covered forever.
        // Racing the reads also prevents a late response from reopening an old attempt.
        const stalled = new Promise((_, reject) => {
            deadline = setTimeout(() => {
                const error = new Error('Sign-in check took too long.'); error.name = 'AbortError';
                reject(error);
            }, 12000);
        });
        const read = operation => Promise.race([Promise.resolve().then(operation), stalled]);
        try {
            const client = getFlowClient();
            if (!client) {
                if (loginPage) { reveal(); state.checking = false; resolveReady(null); return; }
                lock('Reconnect to open your saved account.', true);
                resolveReady(null); return;
            }
            if (typeof prepareFlowServerRecovery === 'function') await read(() => prepareFlowServerRecovery());
            const result = await read(() => client.auth.getSession());
            if (attempt !== attemptNumber || redirecting) return;
            const session = result.data?.session;
            if (result.error) { if (retryable(result.error)) retryLater(); else signIn('expired'); return; }
            if (!session?.user?.id) { signIn('missing'); return; }
            let user;
            if (!navigator.onLine) {
                if (session.expires_at * 1000 <= Date.now() || !Number.isFinite(session.expires_at) ||
                    localStorage.getItem('flow_verified_user') !== session.user.id || localStorage.getItem('flow_user_id') !== session.user.id) {
                    retryLater(); return;
                }
                user = session.user;
            } else {
                const verified = await read(() => client.auth.getUser());
                if (attempt !== attemptNumber || redirecting) return;
                if (verified.error) {
                    if (retryable(verified.error)) { retryLater(); return; }
                    signIn('expired'); return;
                }
                user = verified.data?.user;
                if (!user || user.id !== session.user.id) { signIn('expired'); return; }
                localStorage.setItem('flow_verified_user', user.id);
            }
            if (state.user && state.user.id !== user.id && !loginPage) { location.reload(); return; }
            state.user = user; state.authorized = true; state.checking = false;
            if (loginPage) { resolveReady(user); state.continue(); return; }
            if (!accountPage && localStorage.getItem('flow_user_id') !== user.id) {
                try { sessionStorage.setItem('flow_sign_in_next', destination(location.href).href); sessionStorage.setItem('flow_sign_in_continue', '1'); } catch (_) {}
                location.replace(new URL('account.html', root).href); resolveReady(null); return;
            }
            let continuing = callback;
            try { continuing ||= sessionStorage.getItem('flow_sign_in_continue') === '1'; } catch (_) {}
            if (accountPage && continuing && localStorage.getItem('flow_user_id') === user.id) {
                resolveReady(user); state.continue(); return;
            }
            if (accountPage && callback) try { sessionStorage.setItem('flow_sign_in_continue', '1'); } catch (_) {}
            document.documentElement.dataset.flowWorkspace = localStorage.getItem('flow_user_id') === user.id ? 'linked' : 'unlinked';
            reveal(); resolveReady(user);
            document.dispatchEvent(new Event('flow-auth-ready'));
        } catch (_) {
            if (loginPage) { reveal(); resolveReady(null); }
            else { retryLater(); }
        } finally { clearTimeout(deadline); running = false; state.checking = false; }
    }
    state.recheck = check;
    if (typeof flowDemoMode !== 'undefined' && flowDemoMode) {
        state.authorized = true; state.checking = false; reveal(); resolveReady(null); return;
    }
    if (loginPage) {
        const next = destination(new URLSearchParams(location.search).get('next'));
        try { if (new URLSearchParams(location.search).has('next')) sessionStorage.setItem('flow_sign_in_next', next.href); } catch (_) {}
    } else lock('Opening your Flow workspace…');
    const client = getFlowClient();
    client?.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            attemptNumber++;
            if (!loginPage) { lock('You’re signed out.'); if (!state.handlingSignOut) setTimeout(() => signIn(), 0); }
        } else if (state.authorized && session?.user?.id && session.user.id !== state.user?.id) {
            lock('Your signed-in account changed.'); setTimeout(() => location.reload(), 0);
        }
    });
    window.addEventListener('pageshow', event => { if (event.persisted) { lock('Checking your sign-in…'); check(); } });
    function resume() { if (!loginPage) { lock('Checking your sign-in…'); check(); } }
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
    window.addEventListener('online', () => check());
    window.addEventListener('storage', event => {
        if (event.key === 'flow_user_id' || event.key?.endsWith('-auth-token')) { if (!loginPage) lock('Checking your sign-in…'); check(); }
    });
    check();
})();
