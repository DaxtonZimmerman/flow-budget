/* Require a Supabase sign-in before revealing a personal workspace. */
(function () {
    const root = new URL('../', document.currentScript.src);
    const loginPage = location.pathname === new URL('login.html', root).pathname;
    const accountPage = location.pathname === new URL('account.html', root).pathname;
    const callback = /(?:access_token=|[?&]code=)/.test(location.hash + location.search);
    const pageReady = document.readyState === 'complete' ? Promise.resolve() : new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once:true }));
    let resolveReady, running = false;
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
            location.replace(new URL('account.html', root).href);
        } else {
            try { sessionStorage.removeItem('flow_sign_in_next'); sessionStorage.removeItem('flow_sign_in_continue'); } catch (_) {}
            location.replace(next);
        }
    };
    function lock(text) {
        state.authorized = false;
        document.documentElement.dataset.flowAuth = 'checking';
        let panel = document.querySelector('.flow-auth-loading');
        if (!panel) {
            panel = document.createElement('section'); panel.className = 'flow-auth-loading';
            panel.innerHTML = '<span class="logo">Flow<span class="brand-dot">.</span></span><p role="status"></p><button type="button" class="save-button">Try again</button><a href="' + new URL('login.html', root).href + '">Go to sign-in</a>';
            panel.querySelector('button').addEventListener('click', () => check());
            document.body.appendChild(panel);
        }
        panel.querySelector('p').textContent = text;
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
        const next = destination(location.href);
        const url = new URL('login.html', root);
        url.searchParams.set('next', next.pathname.slice(root.pathname.length) + next.search + next.hash);
        if (reason) url.searchParams.set('reason', reason);
        location.replace(url.href);
    }
    async function check() {
        if (running) return;
        running = true; state.checking = true;
        try {
            const client = getFlowClient();
            if (!client) {
                if (loginPage) { reveal(); state.checking = false; resolveReady(null); return; }
                lock('Connect to the internet to load your sign-in. Your saved copy is kept on this device.');
                resolveReady(null); return;
            }
            const result = await client.auth.getSession();
            const session = result.data?.session;
            if (result.error || !session?.user?.id) { signIn(); return; }
            let user;
            if (!navigator.onLine) {
                if (session.expires_at * 1000 <= Date.now() || !Number.isFinite(session.expires_at) ||
                    localStorage.getItem('flow_verified_user') !== session.user.id || localStorage.getItem('flow_user_id') !== session.user.id) {
                    signIn('offline'); return;
                }
                user = session.user;
            } else {
                const verified = await client.auth.getUser();
                if (verified.error) {
                    if (verified.error.name === 'AuthRetryableFetchError' || verified.error.status === 0) {
                        lock('Your sign-in could not be checked. Reconnect and try again.'); resolveReady(null); return;
                    }
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
            else { lock('Your sign-in could not be checked. Your saved copy is still on this device.'); resolveReady(null); }
        } finally { running = false; state.checking = false; }
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
