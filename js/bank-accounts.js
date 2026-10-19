/* Only the authenticated server reads Plaid's cached account endpoint. */
(function () {
    let running = false;
    async function refresh(force = false) {
        const owner = localStorage.getItem('flow_user_id');
        if (running || !owner || !navigator.onLine || localStorage.getItem('flow_pending') === '1' || !getFlowClient()) return;
        const key = `flow_accounts_checked_${owner}`;
        if (!force && Date.now() - Number(sessionStorage.getItem(key) || 0) < 15 * 60000) return;
        running = true;
        try {
            const user = await getFlowClient().auth.getUser();
            if (user.error || user.data.user?.id !== owner) return;
            const result = await bankRequest('connections');
            const ids = new Set(result.connections.map(c => c.id));
            const cacheBase = localStorage.getItem('bankAccounts');
            let accounts = loadBankAccounts().filter(a => ids.has(a.bankConnectionId));
            for (const connection of result.connections) {
                if (connection.needs_reconnect) {
                    accounts = accounts.filter(a => a.bankConnectionId !== connection.id);
                    continue;
                }
                try {
                    const data = await bankRequest('accounts', { connection_id: connection.id });
                    if (localStorage.getItem('flow_user_id') !== owner) return;
                    if (typeof bankDisconnectingIds !== 'undefined' && bankDisconnectingIds.has(connection.id)) continue;
                    const next = bankAccountSnapshot(connection.id, data.accounts, data.retrieved_at);
                    accounts = accounts.filter(a => a.bankConnectionId !== connection.id).concat(next);
                } catch (_) { /* Retain the dated cache; a manual balance remains available. */ }
            }
            if (localStorage.getItem('flow_user_id') !== owner) return;
            if (localStorage.getItem('bankAccounts') !== cacheBase) return;
            if (JSON.stringify(accounts) !== cacheBase) {
                localStorage.setItem('bankAccounts', JSON.stringify(accounts));
                await flowDataChanged();
                document.dispatchEvent(new Event('flow-accounts-updated'));
            }
            sessionStorage.setItem(key, String(Date.now()));
        } catch (_) { /* An offline or unavailable bank never turns a missing balance into zero. */ }
        finally { running = false; }
    }
    window.refreshFlowAccounts = refresh;
    document.addEventListener('flow-cloud-ready', () => refresh());
    document.addEventListener('flow-bank-updated', () => refresh());
})();
