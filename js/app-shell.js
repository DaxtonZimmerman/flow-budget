var flowStorage = typeof flowStorage !== 'undefined' ? flowStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
/* Small, shared app controls. No network calls or financial data writes. */
(function () {
    const searchDialog = document.querySelector('#app-search-dialog');
    const installDialog = document.querySelector('#install-dialog');
    let installPrompt = null;
    const accountDialog = document.querySelector('#app-account-dialog');
    const describeControl = element => element ? Object.fromEntries(['data-tool','data-plan-action','data-id','data-key','data-step','data-open-account'].filter(name => element.hasAttribute(name)).map(name => [name, element.getAttribute(name)])) : null;
    function restoreControl(record) {
        requestAnimationFrame(() => {
            if (document.querySelector('dialog[open]')) return;
            const match = record && Object.keys(record).length && [...document.querySelectorAll('button,a[href]')].find(element => element.getClientRects().length && !element.closest('dialog:not([open])') && Object.entries(record).every(([name,value]) => element.getAttribute(name) === value));
            (match || document.querySelector('[data-open-account]'))?.focus({preventScroll:true});
        });
    }
    async function signOut() {
        if (window.FlowAuth) await FlowAuth.ready;
        const owner = flowStorage.getItem('flow_user_id'), client = getFlowClient();
        if (!owner || !client || !window.FlowAuth?.authorized || FlowAuth.user?.id !== owner) throw new Error('Open your signed-in account before signing out.');
        if (flowStorage.getItem('flow_pending') === '1') throw new Error('Your changes are still saving. Reconnect and let them finish before signing out.');
        FlowAuth.handlingSignOut = true;
        try {
            const result = await client.auth.signOut({scope:'local'});
            if (result.error) throw result.error;
        } catch (_) { FlowAuth.handlingSignOut = false; throw new Error('Could not sign out. Please try again.'); }
        if (flowStorage.getItem('flow_user_id') === owner) {
            for (const key of ['transactions','budgets','budgetsByMonth','categoryRules','recurringItems','flowPlanning','bankAccounts','flow_user_id','flow_revision','flow_pending','flowLastEstimate','flow_pending_client','flow_verified_user']) flowStorage.removeItem(key);
        }
        location.replace('login.html');
    }
    window.FlowApp = {describeControl,restoreControl,signOut};
    const profileSignOut = accountDialog?.querySelector('[data-profile-sign-out]');
    profileSignOut?.addEventListener('click', async () => {
        if (profileSignOut.disabled) return;
        profileSignOut.disabled = true;
        try { await signOut(); } catch (error) { accountDialog.querySelector('.profile-message').textContent = error.message; profileSignOut.disabled = false; }
    });
    for (const button of document.querySelectorAll('[data-open-account]')) button.addEventListener('click', () => accountDialog?.showModal());
    accountDialog?.addEventListener('click', event => { if (event.target.closest('a[href]')) accountDialog.close(); });
    accountDialog?.addEventListener('close', () => restoreControl({'data-open-account':''}));
    function openHashTarget() {
        let target; try { target = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (_) { return; }
        if (!target) return;
        const details = target.tagName === 'DETAILS' ? target : target.closest('details');
        if (details) { details.open = true; requestAnimationFrame(() => target.scrollIntoView({block:'start'})); }
    }
    window.addEventListener('hashchange', openHashTarget);
    document.addEventListener('DOMContentLoaded', openHashTarget);


    for (const button of document.querySelectorAll('[data-open-search]')) {
        button.addEventListener('click', () => searchDialog.showModal());
    }
    for (const button of document.querySelectorAll('[data-close-dialog]')) {
        button.addEventListener('click', () => button.closest('dialog').close());
    }
    document.addEventListener('keydown', event => {
        if (event.key === 'Tab') {
            const modal = [...document.querySelectorAll('dialog[open]')].at(-1);
            if (modal) {
                const items = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]')].filter(item=>item.getClientRects().length);
                const first=items[0],last=items.at(-1);
                if (first && event.shiftKey && document.activeElement===first) {event.preventDefault();last.focus();}
                else if (last && !event.shiftKey && document.activeElement===last) {event.preventDefault();first.focus();}
            }
        }
        const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
        if ((event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !typing)) {
            if (document.querySelector('dialog[open]')) return;
            event.preventDefault();
            searchDialog.showModal();
        }
    });
    for (const dialog of document.querySelectorAll('dialog')) {
        dialog.addEventListener('click', event => {
            if (event.target !== dialog) return;
            const bounds = dialog.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
        });
    }
    const searchMonth = document.querySelector('#search-month');
    searchMonth.disabled = true;
    for (const button of document.querySelectorAll('[data-month-step]')) {
        button.addEventListener('click', () => {
            const input = document.querySelector('#dashboard-month');
            const [year, monthNumber] = input.value.split('-').map(Number);
            if (!year || !monthNumber) return;
            const next = new Date(year, monthNumber - 1 + Number(button.dataset.monthStep), 1);
            input.value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }
    const moreFilters = document.querySelector('#activity-more-filters');
    if (moreFilters) {
        const desktopFilters = matchMedia('(min-width: 769px)');
        moreFilters.open = desktopFilters.matches;
        desktopFilters.addEventListener('change', event => { moreFilters.open = event.matches; });
    }
    const typeFilter = document.querySelector('#history-type-filter');
    const tabs = document.querySelectorAll('[data-activity-type]');
    function updateTypeTabs() {
        for (const tab of tabs) {
            const active = tab.dataset.activityType === typeFilter.value;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-pressed', String(active));
        }
    }
    for (const tab of tabs) {
        tab.addEventListener('click', () => {
            typeFilter.value = tab.dataset.activityType;
            typeFilter.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }
    typeFilter?.addEventListener('change', updateTypeTabs);
    document.addEventListener('DOMContentLoaded', () => {
        if (typeFilter) updateTypeTabs();
        if (typeof lucide !== 'undefined') lucide.createIcons();
        updateReviewBadge();
    });
    function updateReviewBadge() {
        if (typeof needsTransactionReview !== 'function') return;
        try {
            const items = JSON.parse(flowStorage.getItem('transactions')) || [];
            const count = items.filter(typeof needsCurrentTransactionReview === 'function' ? needsCurrentTransactionReview : needsTransactionReview).length;
            for (const badge of document.querySelectorAll('[data-review-badge]')) {
                badge.hidden = count === 0;
                badge.textContent = count > 99 ? '99+' : String(count);
                badge.setAttribute('aria-label', `${count} transactions to review`);
            }
        } catch (_) { /* The data screens handle storage errors. */ }
    }
    document.addEventListener('flow-review-updated', updateReviewBadge);
    document.addEventListener('flow-transaction-updated', updateReviewBadge);
    const status = document.querySelector('#flow-sync-status');
    if (status) {
        new MutationObserver(() => {
            status.classList.toggle('sync-quiet', /^(All changes saved\.|Saving changes…|Checking for changes…)$/.test(status.textContent.trim()));
            status.classList.toggle('sync-warning', /could not|changes on two|choose which|data changed|different account/i.test(status.textContent));
        }).observe(status, { childList: true, characterData: true, subtree: true });
    }
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        installPrompt = event;
    });
    const isApplePhone = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg/.test(navigator.userAgent);
    const isEdge = /Edg\//.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    const steps = isApplePhone
        ? ['Open Flow in Safari and tap the Share button.', 'Choose “Add to Home Screen,” keep “Open as Web App” on if shown, then tap Add.']
        : isAndroid
            ? ['Open Flow in Chrome and open the browser menu.', 'Choose “Add to Home screen” or “Install app,” then follow the prompts.']
        : isEdge
            ? ['Open Flow in Microsoft Edge.', 'Open the browser menu, choose Apps → Install this site as an app, then choose Install.']
        : isSafari
            ? ['Open Flow in Safari.', 'Choose File → Add to Dock, then choose Add.']
            : ['Open Flow in Chrome.', 'Open the browser menu and choose “Cast, save, and share” → “Install page as app.” You can also use the install icon in the address bar.'];
    const stepList = document.querySelector('#install-steps');
    for (const step of steps) {
        const li = document.createElement('li');
        li.textContent = step;
        stepList.appendChild(li);
    }
    for (const button of document.querySelectorAll('[data-install-app]')) {
        button.addEventListener('click', async () => {
            if (installPrompt) {
                try {
                    await installPrompt.prompt();
                    await installPrompt.userChoice;
                } catch (_) { installDialog.showModal(); }
                installPrompt = null;
            } else installDialog.showModal();
        });
    }
    if ((typeof flowDemoMode !== 'undefined' && flowDemoMode) || matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
        for (const button of document.querySelectorAll('[data-install-app]')) button.hidden = true;
    }
})();
