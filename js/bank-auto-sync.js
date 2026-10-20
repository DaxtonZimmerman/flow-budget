var flowStorage = typeof flowStorage !== 'undefined' ? flowStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
/* Read available bank updates while Flow is visible. Never force a bank refresh. */
let bankRefreshing = false;
const bankDisconnectingIds = new Set();
const bankSyncRequests = new Map();
const bankCheckInterval = 60 * 1000;
const bankPullInterval = 15 * 60 * 1000;
let bankAutoOwner = '', bankRetryAt = 0, bankFailureCount = 0, bankLastReturn = 0;
let bankReturnChecking = false;
let bankSyncState = { phase: 'idle', message: '' };

async function bankRequest(action, values = {}) {
    const result = await getFlowClient().functions.invoke("plaid", {
        body: { action: action, ...values }
    });

    if (result.error) {
        let message = result.error.message || "Could not reach your bank.";
        let needsReconnect = false;

        try {
            const details = await result.error.context?.json();

            if (typeof details?.error === "string") message = details.error;
            needsReconnect = details?.needs_reconnect === true;
        } catch (_error) {
            // use the message we already have
        }

        const error = new Error(message);
        error.needsReconnect = needsReconnect;
        throw error;
    }

    if (result.data.error) {
        const error = new Error(result.data.error);
        error.needsReconnect = result.data.needs_reconnect === true;
        throw error;
    }

    return result.data;
}


function showBankSyncStatus(phase, message) {
    bankSyncState = { phase, message };
    if (!document.body) return;
    let panel = document.querySelector('#flow-bank-sync');
    const owner = flowStorage.getItem('flow_user_id');
    if (!owner || !getFlowClient()) { if (panel) panel.hidden = true; return; }
    if (!panel) {
        const main = document.querySelector('.main'); if (!main) return;
        panel = document.createElement('section'); panel.id = 'flow-bank-sync'; panel.className = 'bank-sync-banner';
        panel.innerHTML = '<div class="bank-sync-line"><p id="flow-bank-sync-status" role="status" aria-live="polite"></p><button type="button" class="inline-link" id="flow-bank-check-now">Check now</button></div><details><summary>When will new transfers appear?</summary><p>Flow checks for available updates every minute while open and when you return. Your bank and Plaid can take time to report new activity. A check does not force the bank to send it sooner. Pending payments appear in Activity when the bank supplies them; transfers between your own accounts do not count as income or spending.</p></details>';
        const toolbar = main.querySelector('.app-toolbar'); if (toolbar) toolbar.after(panel); else main.prepend(panel);
        panel.querySelector('button').addEventListener('click', () => checkBanksOnReturn(true));
    }
    panel.hidden = phase === 'none'; panel.dataset.phase = phase;
    panel.querySelector('#flow-bank-sync-status').textContent = message;
    panel.querySelector('button').disabled = phase === 'checking';
}
function validBankCheckTime(value) {
    const time = Number(value); return Number.isFinite(time) && time > 0 && time <= Date.now() + 5000 ? time : 0;
}
function bankCheckLabel(owner) {
    const time = validBankCheckTime(flowStorage.getItem(`flow_bank_checked_at_${owner}`));
    return time ? `Auto sync on · checked for bank updates ${new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. New activity may arrive later.` : 'Auto sync on · waiting to check available bank updates.';
}
function bankOwnerIsCurrent(owner) {
    return Boolean(owner && flowStorage.getItem('flow_user_id') === owner);
}
async function syncBankConnection(connectionId) {
    const owner = flowStorage.getItem('flow_user_id');
    if (!owner || !getFlowClient()) throw new Error('Sign in to update your bank.');
    const key = owner + '|' + connectionId;
    if (bankSyncRequests.has(key)) return bankSyncRequests.get(key);
    const request = (async () => {
        const result = await bankRequest('sync', { connection_id: connectionId });
        if (!bankOwnerIsCurrent(owner)) throw new Error('Your signed-in account changed. Reopen Flow before syncing.');
        if (bankDisconnectingIds.has(connectionId)) return { ...result, changed: false };
        const current = getFlowSnapshot().transactions;
        const rules = JSON.parse(flowStorage.getItem('categoryRules') || '[]');
        let merged = mergeBankSnapshot(current, connectionId, result.transactions, rules);
        if (typeof reconcileTransferRecords === 'function' && typeof loadBankAccounts === 'function') {
            const accounts = loadBankAccounts();
            if (!merged.some(t => t.transferPair && !transferAccount(t, accounts))) merged = reconcileTransferRecords(merged, accounts);
        }
        const changed = JSON.stringify(current) !== JSON.stringify(merged);
        if (changed) {
            flowStorage.setItem('transactions', JSON.stringify(merged));
            if (typeof refreshFlowDataViews === 'function') refreshFlowDataViews();
            else document.dispatchEvent(new Event('flow-transaction-view-refresh'));
            await flowDataChanged();
        }
        if (!bankOwnerIsCurrent(owner)) return { changed: false };
        if (!bankDisconnectingIds.has(connectionId)) flowStorage.setItem(`flow_bank_applied_at_${owner}_${connectionId}`, String(Date.parse(result.last_synced_at) || Date.now()));
        if (changed) document.dispatchEvent(new CustomEvent('flow-bank-updated', { detail: { changed: true } }));
        return { ...result, changed };
    })();
    bankSyncRequests.set(key, request);
    try { return await request; } finally { bankSyncRequests.delete(key); }
}
async function updateBanksAutomatically(options = {}) {
    const owner = flowStorage.getItem('flow_user_id'), client = getFlowClient();
    if (!owner || !client) { showBankSyncStatus('none', ''); return; }
    if (document.hidden || bankRefreshing || typeof flowSyncing !== 'undefined' && flowSyncing) return;
    if (!navigator.onLine) { showBankSyncStatus('offline', 'Offline · bank updates will resume when you reconnect.'); return; }
    if (flowStorage.getItem('flow_pending') === '1') { showBankSyncStatus('waiting', 'Bank updates will resume after your changes are saved.'); return; }
    if (bankAutoOwner !== owner) { bankAutoOwner = owner; bankFailureCount = 0; bankRetryAt = 0; }
    const checkedAt = validBankCheckTime(flowStorage.getItem(`flow_bank_checked_at_${owner}`));
    const attemptedAt = validBankCheckTime(flowStorage.getItem(`flow_bank_attempted_at_${owner}`));
    const minimum = options.force ? 10 * 1000 : bankCheckInterval;
    if (['idle', 'none', 'waiting', 'offline'].includes(bankSyncState.phase) && checkedAt && flowStorage.getItem(`flow_bank_connections_present_${owner}`) === '1') showBankSyncStatus('ready', bankCheckLabel(owner));
    if (Date.now() - Math.max(checkedAt, attemptedAt) < minimum || !options.force && Date.now() < bankRetryAt) return;
    bankRefreshing = true; let failed = false, reconnect = false;
    flowStorage.setItem(`flow_bank_attempted_at_${owner}`, String(Date.now()));
    showBankSyncStatus('checking', 'Checking for available bank updates…');
    try {
        const user = await client.auth.getUser();
        if (!bankOwnerIsCurrent(owner)) return;
        if (user.error || user.data.user?.id !== owner) { showBankSyncStatus('signin', 'Sign in again from Account to resume bank updates.'); return; }
        const data = await bankRequest('connections');
        if (!bankOwnerIsCurrent(owner)) return;
        if (!Array.isArray(data.connections)) throw new Error('Bank connections are unavailable.');
        flowStorage.setItem(`flow_bank_connections_present_${owner}`, data.connections.length ? '1' : '0');
        if (!data.connections.length) { showBankSyncStatus('none', ''); flowStorage.setItem(`flow_bank_checked_at_${owner}`, String(Date.now())); return; }
        for (const connection of data.connections) {
            if (!bankOwnerIsCurrent(owner) || flowStorage.getItem('flow_pending') === '1') return;
            if (connection.needs_reconnect) { reconnect = true; continue; }
            const lastSync = Date.parse(connection.last_synced_at || '') || 0;
            const appliedAt = validBankCheckTime(flowStorage.getItem(`flow_bank_applied_at_${owner}_${connection.id}`));
            const lastPull = validBankCheckTime(sessionStorage.getItem(`flow_bank_pulled_at_${owner}_${connection.id}`));
            if (!options.force && appliedAt && lastSync <= appliedAt && Date.now() - Math.max(lastSync, lastPull) < bankPullInterval) continue;
            try {
                await syncBankConnection(connection.id);
                if (!bankOwnerIsCurrent(owner)) return;
                sessionStorage.setItem(`flow_bank_pulled_at_${owner}_${connection.id}`, String(Date.now()));
            } catch (error) { failed = true; reconnect = reconnect || error.needsReconnect === true; }
        }
        if (!bankOwnerIsCurrent(owner)) return;
        if (!failed) {
            flowStorage.setItem(`flow_bank_checked_at_${owner}`, String(Date.now()));
            sessionStorage.setItem(`flow_bank_checked_at_${owner}`, String(Date.now()));
            bankFailureCount = 0; bankRetryAt = 0;
        } else { bankFailureCount++; bankRetryAt = Date.now() + Math.min(bankPullInterval, bankCheckInterval * 2 ** Math.min(bankFailureCount - 1, 4)); }
        document.dispatchEvent(new Event('flow-bank-updated'));
        showBankSyncStatus(reconnect ? 'reconnect' : failed ? 'error' : 'ready', reconnect ? 'A bank needs attention. Open Account to reconnect it.' : failed ? 'Could not check every bank. Flow will retry automatically, or choose Check now.' : bankCheckLabel(owner));
    } catch (_) {
        if (!bankOwnerIsCurrent(owner)) return;
        bankFailureCount++; bankRetryAt = Date.now() + Math.min(bankPullInterval, bankCheckInterval * 2 ** Math.min(bankFailureCount - 1, 4));
        showBankSyncStatus('error', 'Could not check your bank. Flow will retry automatically, or choose Check now.');
    } finally {
        bankRefreshing = false;
        if (!bankOwnerIsCurrent(owner)) showBankSyncStatus('none', '');
        else if (bankSyncState.phase === 'checking' && flowStorage.getItem('flow_pending') === '1') showBankSyncStatus('waiting', 'Bank updates will resume after your changes are saved.');
    }
}
async function checkBanksOnReturn(force = false) {
    if (bankReturnChecking) return;
    if (document.hidden || !flowStorage.getItem('flow_user_id') || !getFlowClient()) { if (!flowStorage.getItem('flow_user_id')) showBankSyncStatus('none', ''); return; }
    if (!navigator.onLine) { showBankSyncStatus('offline', 'Offline · bank updates will resume when you reconnect.'); return; }
    if (!force && Date.now() - bankLastReturn < 1000) return;
    bankLastReturn = Date.now();
    bankReturnChecking = true;
    try {
        if (typeof flowSync === 'function' && await flowSync() !== true) {
            showBankSyncStatus('waiting', 'Waiting for cloud sync. Check Account if your changes cannot save.'); return;
        }
        await updateBanksAutomatically({ force });
    } finally { bankReturnChecking = false; }
}
function scheduleBankCheck() {
    setTimeout(async () => { try { await checkBanksOnReturn(); } finally { scheduleBankCheck(); } }, bankCheckInterval);
}
document.addEventListener('flow-cloud-ready', () => { if (!bankReturnChecking) updateBanksAutomatically(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkBanksOnReturn(); });
window.addEventListener('focus', () => checkBanksOnReturn());
window.addEventListener('online', () => checkBanksOnReturn());
window.addEventListener('offline', () => showBankSyncStatus('offline', 'Offline · bank updates will resume when you reconnect.'));
window.addEventListener('storage', event => {
    if (event.key === 'flow_user_id') { bankAutoOwner = ''; showBankSyncStatus('none', ''); return; }
    if (!flowStorage.getItem('flow_user_id')) return;
    if (['transactions', 'bankAccounts', 'flowPlanning', 'budgets', 'budgetsByMonth', 'categoryRules'].includes(event.key) && typeof refreshFlowDataViews === 'function') refreshFlowDataViews();
    if (event.key === `flow_bank_checked_at_${flowStorage.getItem('flow_user_id')}`) showBankSyncStatus('ready', bankCheckLabel(flowStorage.getItem('flow_user_id')));
});
scheduleBankCheck();
