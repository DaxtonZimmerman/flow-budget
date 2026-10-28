/* A replacement Item has new IDs. Stage it, preview it, then replace one feed.
   Never combine two Items by amount alone or guess between repeated payments. */
function bankRecoverySources(snapshot) {
    const groups = new Map();
    for (const account of snapshot.bankAccounts || []) {
        if (!groups.has(account.bankConnectionId)) groups.set(account.bankConnectionId, new Map());
        groups.get(account.bankConnectionId).set(account.accountId, account);
    }
    for (const t of snapshot.transactions || []) {
        if (t.source !== 'bank' || !t.bankConnectionId || !t.accountId) continue;
        if (!groups.has(t.bankConnectionId)) groups.set(t.bankConnectionId, new Map());
        const accounts = groups.get(t.bankConnectionId);
        if (!accounts.has(t.accountId)) accounts.set(t.accountId, {accountId:t.accountId, name:'Saved account', type:'', subtype:'', currency:''});
    }
    return [...groups].map(([id, accounts]) => ({id, accounts:[...accounts.values()],
        count:(snapshot.transactions || []).filter(t => t.source === 'bank' && t.bankConnectionId === id).length}));
}
function bankRecoverySuggestions(source, accounts) {
    const result = {};
    const signature = a => JSON.stringify([String(a.name).trim().toLowerCase(), a.type, a.subtype, a.currency]);
    for (const old of source.accounts) {
        const matches = accounts.filter(a => signature(a) === signature(old));
        if (matches.length === 1 && source.accounts.filter(a => signature(a) === signature(old)).length === 1) result[old.accountId] = matches[0].accountId;
    }
    return result;
}
function prepareBankRecovery(snapshot, oldConnectionId, newConnectionId, feed, mapping) {
    if (!feed?.history_complete || !feed.recovery_required || !feed.cursor) throw new Error('Your bank is still preparing its history. Check again shortly.');
    const original = JSON.parse(JSON.stringify(snapshot));
    const source = bankRecoverySources(original).find(s => s.id === oldConnectionId);
    if (!source || !newConnectionId || oldConnectionId === newConnectionId) throw new Error('Choose the saved bank feed to replace.');
    if (original.transactions.some(t => t.source === 'bank' && t.bankConnectionId === newConnectionId)) throw new Error('This feed is already in your history. Open a fresh preview.');
    const newAccounts = bankAccountSnapshot(newConnectionId, feed.accounts, feed.last_synced_at);
    const mapped = source.accounts.map(a => mapping[a.accountId]);
    if (mapped.some(id => !id || !newAccounts.some(a => a.accountId === id)) || new Set(mapped).size !== mapped.length) throw new Error('Match each saved account to a different account at your bank.');
    for (const old of source.accounts) {
        const next = newAccounts.find(a => a.accountId === mapping[old.accountId]);
        if (old.type && old.type !== next.type || old.currency && old.currency !== next.currency) throw new Error('Match accounts of the same kind and currency.');
    }
    const oldRows = original.transactions.filter(t => t.source === 'bank' && t.bankConnectionId === oldConnectionId);
    const unchanged = original.transactions.filter(t => t.source !== 'bank' || t.bankConnectionId !== oldConnectionId);
    const text = name => String(name).trim().toLowerCase().replace(/\s+/g, ' ');
    const matchKey = (account, date, name, amount, status) => JSON.stringify([account, date, text(name), Math.round(amount * 100), status]);
    const oldByKey = new Map(), newByKey = new Map(), refs = new Map([[oldConnectionId,newConnectionId]]);
    for (const account of source.accounts) {
        refs.set(account.accountId, mapping[account.accountId]);
        refs.set(`${oldConnectionId}:${account.accountId}`, `${newConnectionId}:${mapping[account.accountId]}`);
    }
    const add = (map, key, item) => map.set(key, [...(map.get(key) || []), item]);
    for (const t of oldRows) add(oldByKey, matchKey(mapping[t.accountId],t.date,t.name,t.amount,t.status || 'posted'),t);
    const bankIds = new Set();
    for (const t of feed.transactions || []) {
        if (!t.transaction_id || bankIds.has(t.transaction_id) || !newAccounts.some(a => a.accountId === t.account_id) ||
            !/^\d{4}-\d\d-\d\d$/.test(t.date || '') || !Number.isFinite(t.amount) || typeof (t.merchant_name || t.name) !== 'string') throw new Error('The bank preview is incomplete or contains duplicate entries. Check again.');
        bankIds.add(t.transaction_id);
        add(newByKey,matchKey(t.account_id,t.date,t.merchant_name || t.name,-t.amount,t.pending?'pending':'posted'),t);
    }
    const matches = new Map();
    for (const [key, items] of newByKey) {
        const prior = oldByKey.get(key);
        if (items.length === 1 && prior?.length === 1) {
            matches.set(items[0].transaction_id,prior[0]);
            refs.set(prior[0].bankTransactionId,items[0].transaction_id);
        }
    }
    const referenceFields = new Set(['bankConnectionId','accountId','bankTransactionId','pendingTransactionId','pendingId',
        'selectedAccountIds','key','transactionKey','fingerprint','balanceKey','peerKey','ownFingerprint','peerFingerprint',
        'transferNoMatch','confirmedRefunds','excludedKeys','includedKeys','essentialCovered','sourceKey','dismissedSuggestions']);
    const jsonRefs = value => typeof value === 'string' ? refs.get(value) || (() => {
        if (!value.startsWith('[')) return value;
        try { return JSON.stringify(jsonRefs(JSON.parse(value))); } catch (_) { return value; }
    })() : Array.isArray(value) ? value.map(jsonRefs) : value;
    const remap = (value, field='') => {
        if (typeof value === 'string') return referenceFields.has(field) ? jsonRefs(value) : value;
        if (Array.isArray(value)) return value.map(v => remap(v,field));
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,remap(v,k)]));
        return value;
    };
    const rules = remap(original.categoryRules || []);
    let imported = (feed.transactions || []).map(item => {
        const prior = matches.get(item.transaction_id);
        const rebound = prior ? remap({...prior, bankTransactionId:item.transaction_id}) : null;
        const next = bankTransactionFromPlaid(item,item.account_id,rebound,rules);
        next.id = prior ? prior.id : `bank-${newConnectionId}-${item.transaction_id}`;
        next.bankConnectionId = newConnectionId;
        return next;
    });
    const accounts = (original.bankAccounts || []).filter(a => a.bankConnectionId !== oldConnectionId).concat(newAccounts);
    // Other feeds and manually entered facts stay intact. Only explicit links may follow a matched payment.
    let transactions = unchanged.map(t => ({...t, ...(t.relatedExpense ? {relatedExpense:remap(t.relatedExpense)} : {}),
        ...(t.cardPayment ? {cardPayment:remap(t.cardPayment)} : {})})).concat(imported);
    const activeKeys = new Set(transactions.map(t => t.source === 'bank' ? JSON.stringify([t.bankConnectionId || '', t.accountId, t.bankTransactionId]) : String(t.id)));
    for (const t of transactions) {
        if(t.relatedExpense && !activeKeys.has(t.relatedExpense.key)) {
            delete t.relatedExpense;delete t.allocations;t.reviewStatus='needs-review';t.categoryReason='Review reimbursement after bank recovery';
        }
        if(t.cardPayment && !activeKeys.has(t.cardPayment.peerKey)) {
            t.type=t.cardPayment.previousType;t.typeOverride=t.type==='Refund'||t.type==='Transfer';delete t.cardPayment;t.reviewStatus='needs-review';
        }
    }
    const ids = transactions.map(t => String(t.id));
    if (new Set(ids).size !== ids.length) throw new Error('A transaction identity conflicts with saved work. Nothing was replaced.');
    if (typeof reconcileTransferRecords === 'function') transactions = reconcileTransferRecords(transactions,accounts);
    const data = {...original, transactions, bankAccounts:accounts, categoryRules:rules, recurringItems:remap(original.recurringItems || []),
        flowPlanning:remap(original.flowPlanning)};
    if (typeof validateFlowSnapshot === 'function') validateFlowSnapshot(data);
    return {data, oldCount:oldRows.length, newCount:imported.length, matchedCount:matches.size,
        archivedCount:oldRows.length-matches.size, keptCount:unchanged.length,
        from:imported.map(t=>t.date).sort()[0] || null, through:imported.map(t=>t.date).sort().at(-1) || null};
}
