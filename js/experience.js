/* App presentation only: shared profile identity, grouped settings, and concise labels. */
(function () {
    let queued = false;
    const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
    function identity() {
        const demo = typeof flowDemoMode !== 'undefined' && flowDemoMode;
        const user = window.FlowAuth?.authorized && FlowAuth.user?.id === flowStorage.getItem('flow_user_id') ? FlowAuth.user : null;
        const name = demo ? 'Your demo' : 'Your Flow account';
        document.querySelectorAll('[data-profile-name]').forEach(el => { el.textContent = name; });
        document.querySelectorAll('[data-profile-email]').forEach(el => { el.textContent = user?.email || (demo ? 'Sample money · explore freely' : ''); });
        document.querySelectorAll('[data-profile-sign-out]').forEach(el => { el.hidden = demo || !user; });
    }
    function group(node, key, title, symbol) {
        if (!node || node.closest('[data-account-group="' + key + '"]')) return;
        let details = document.querySelector('[data-account-group="' + key + '"]');
        if (!details) {
            details = document.createElement('details'); details.className = 'settings-group'; details.dataset.accountGroup = key;
            const summary = document.createElement('summary'); summary.innerHTML = icon(symbol) + '<span>' + title + '</span>' + icon('chevron-down');
            node.before(details); details.append(summary);
        }
        details.append(node);
        if (location.hash === '#' + node.id) details.open = true;
    }
    function settings() {
        if (document.body.dataset.page !== 'account') return;
        group(document.querySelector('#payday-settings'), 'preferences', 'Settings', 'sliders-horizontal');
        group(document.querySelector('#bank-connections'), 'banks', 'Bank connections', 'landmark');
        const help = document.querySelector('#flow-product-settings');
        const preferences = document.querySelector('[data-account-group=preferences]');
        if (help && preferences?.contains(help)) preferences.after(help);
        group(help, 'help', 'Help & tools', 'circle-help');
        group(document.querySelector('#account-delete'), 'privacy', 'Privacy', 'shield-check');
        group(document.querySelector('.app-install-card'), 'install', 'Install Flow', 'smartphone');
        const columns = document.querySelector('.account-columns');
        for (const selector of ['#account-connected','[data-account-group=preferences]','[data-account-group=banks]','[data-account-group=help]','#account-backups','[data-account-group=install]','[data-account-group=privacy]']) {
            const node = document.querySelector(selector);
            if (node && columns?.contains(node)) columns.append(node);
        }
        if (typeof flowDemoMode !== 'undefined' && flowDemoMode) {
            const banks = document.querySelector('[data-account-group=banks]');
            if (banks && !banks.querySelector('.demo-settings-note')) {
                const note = document.createElement('p'); note.className = 'demo-settings-note'; note.textContent = 'This preview uses sample money. Connect a bank in your own account.'; banks.append(note);
            }
        }
        const connected = document.querySelector('#account-connected');
        if (connected && !connected.querySelector('.account-auto-status')) {
            const status = document.createElement('span'); status.className = 'account-auto-status'; status.innerHTML = icon('refresh-cw') + (typeof flowDemoMode !== 'undefined' && flowDemoMode ? 'Sample workspace' : 'Automatic sync');
            connected.prepend(status);
        }
    }
    function refresh() { queued = false; identity(); settings(); if (typeof lucide !== 'undefined') lucide.createIcons(); }
    function schedule() { if (!queued) { queued = true; queueMicrotask(refresh); } }
    for (const event of ['flow-auth-ready','flow-cloud-ready','flow-payday-rendered','flow-accounts-updated']) document.addEventListener(event,schedule);
    document.addEventListener('DOMContentLoaded',schedule);
    window.FlowAuth?.ready.then(schedule);
    document.addEventListener('click', event => {
        const current = event.target.closest('.nav-link.active');
        if (current && new URL(current.href).pathname === location.pathname && new URL(current.href).search === location.search) {
            event.preventDefault(); scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth'});
        }
    });
    schedule();
})();
