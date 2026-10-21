var flowStorage = typeof flowStorage !== 'undefined' ? flowStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
/* Read the free cached account endpoint. A successful check is not a bank balance date. */
(function () {
    let running = false, retryTimer;
    const checks = new Map(), interval = 15 * 60000;
    function savedCheck(key) {
        try { const time = Number(sessionStorage.getItem(key)); return time > 0 && time <= Date.now() + 5000 ? time : 0; }
        catch (_) { return 0; }
    }
    async function refresh(force = false) {
        const owner = flowStorage.getItem('flow_user_id');
        if (running || document.hidden || !owner || !navigator.onLine || flowStorage.getItem('flow_pending') === '1' || !getFlowClient()) return;
        const key = `flow_accounts_checked_${owner}`;
        const check = checks.get(owner) || { success: savedCheck(key), retryAt: 0, failures: 0 };
        checks.set(owner, check);
        if (!force && (Date.now() - check.success < interval || Date.now() < check.retryAt)) return;
        clearTimeout(retryTimer);
        running = true;
        let failed = false;
        try {
            const user = await getFlowClient().auth.getUser();
            if (flowStorage.getItem('flow_user_id') !== owner || user.error || user.data.user?.id !== owner) return;
            const result = await bankRequest('connections');
            if (flowStorage.getItem('flow_user_id') !== owner) return;
            if (!Array.isArray(result.connections)) throw new Error('Bank connections are unavailable.');
            const ids = new Set(result.connections.map(c => c.id));
            const cacheBase = flowStorage.getItem('bankAccounts');
            let accounts = loadBankAccounts().filter(a => ids.has(a.bankConnectionId));
            for (const connection of result.connections) {
                if (flowStorage.getItem('flow_user_id') !== owner || flowStorage.getItem('flow_pending') === '1') return;
                if (connection.needs_reconnect) {
                    accounts = accounts.filter(a => a.bankConnectionId !== connection.id);
                    continue;
                }
                try {
                    const data = await bankRequest('accounts', { connection_id: connection.id });
                    if (flowStorage.getItem('flow_user_id') !== owner) return;
                    if (typeof bankDisconnectingIds !== 'undefined' && bankDisconnectingIds.has(connection.id)) continue;
                    const next = bankAccountSnapshot(connection.id, data.accounts, data.retrieved_at);
                    accounts = accounts.filter(a => a.bankConnectionId !== connection.id).concat(next);
                } catch (_) { failed = true; /* Keep the dated balance until an automatic retry succeeds. */ }
            }
            if (flowStorage.getItem('flow_user_id') !== owner || flowStorage.getItem('flow_pending') === '1') return;
            if (flowStorage.getItem('bankAccounts') !== cacheBase) return;
            if (JSON.stringify(accounts) !== cacheBase) {
                flowStorage.setItem('bankAccounts', JSON.stringify(accounts));
                await flowDataChanged();
                if (flowStorage.getItem('flow_user_id') === owner) document.dispatchEvent(new Event('flow-accounts-updated'));
            }
            if (!failed) {
                check.success = Date.now(); check.failures = 0; check.retryAt = 0;
                try { sessionStorage.setItem(key, String(check.success)); } catch (_) { /* In-memory throttling still works. */ }
            }
        } catch (_) { failed = true; /* An unavailable bank never becomes a zero balance. */ }
        finally {
            running = false;
            if (failed && flowStorage.getItem('flow_user_id') === owner) {
                check.failures++;
                const delay = Math.min(interval, 60000 * 2 ** Math.min(check.failures - 1, 4));
                check.success = 0; check.retryAt = Date.now() + delay;
                retryTimer = setTimeout(() => { if (flowStorage.getItem('flow_user_id') === owner) return refresh(); }, delay);
            }
        }
    }
    window.refreshFlowAccounts = refresh;
    document.addEventListener('flow-cloud-ready', () => refresh());
    document.addEventListener('flow-bank-updated', event => refresh(event.detail?.changed === true));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) return refresh(); });
    window.addEventListener('focus', () => refresh());
    window.addEventListener('online', () => refresh());
})();
