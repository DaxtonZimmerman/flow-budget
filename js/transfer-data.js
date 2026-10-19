/* Link two bank records; never replace their amounts, dates, IDs, or account balances. */
const transferChoiceFields = ['type', 'typeOverride', 'bankTypeRuleId', 'reviewStatus'];
function transferRecordKey(item) {
    return JSON.stringify([item.bankConnectionId || '', item.bankTransactionId || '']);
}
function transferFingerprint(item) {
    return JSON.stringify([item.source, item.bankConnectionId, item.bankTransactionId,
        item.accountId, item.amount, item.date, item.status, item.name]);
}
function transferChoice(item) {
    return Object.fromEntries(transferChoiceFields.map(key => [key, item[key] ?? null]));
}
function sameTransferChoice(item, choice) {
    return choice && transferChoiceFields.every(key => (item[key] ?? null) === (choice[key] ?? null));
}
function transferAccount(item, accounts) {
    const found = accounts.filter(a => a.accountId === item.accountId && a.bankConnectionId === item.bankConnectionId);
    return found.length === 1 ? found[0] : null;
}
function eligibleTransferRecord(item, accounts) {
    if (!item || item.source !== 'bank' || !item.bankConnectionId || !item.bankTransactionId ||
        !item.accountId || item.status !== 'posted' || !Number.isFinite(item.amount) || !item.amount ||
        !Number.isSafeInteger(Math.round(item.amount * 100)) || Math.abs(item.amount * 100 - Math.round(item.amount * 100)) > 0.00001 ||
        typeof item.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return false;
    const stamp = Date.parse(item.date + 'T12:00:00Z');
    if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== item.date) return false;
    const account = transferAccount(item, accounts);
    return Boolean(account && account.type === 'depository' && account.currency === 'USD');
}
function compatibleTransferRecords(first, second, accounts) {
    return eligibleTransferRecord(first, accounts) && eligibleTransferRecord(second, accounts) &&
        transferRecordKey(first) !== transferRecordKey(second) && first.accountId !== second.accountId &&
        first.bankConnectionId === second.bankConnectionId &&
        Math.round(first.amount * 100) === -Math.round(second.amount * 100) &&
        Math.abs(Date.parse(first.date + 'T12:00:00Z') - Date.parse(second.date + 'T12:00:00Z')) <= 3 * 86400000;
}
function hasTransferEvidence(item) {
    if (item.type === 'Transfer' && item.reviewStatus === 'reviewed') return true;
    // A personal correction is stronger than any bank label. Payment apps can have many purposes.
    if (item.reviewStatus === 'reviewed' && !item.bankCategoryAuto || /\b(venmo|zelle|paypal|cash\s*app)\b/i.test(item.name)) return false;
    return /\btransfer\b/i.test(item.name || '') ||
        /^TRANSFER_(IN|OUT)$/.test(item.bankCategory?.primary || '');
}
function validTransferFields(item) {
    if (!item || typeof item !== 'object') return false;
    if (item.transferMatchIssue !== undefined && item.transferMatchIssue !== 'bank-change') return false;
    if (item.transferNoMatch !== undefined && (!Array.isArray(item.transferNoMatch) ||
        item.transferNoMatch.some(key => typeof key !== 'string' || key.length > 4000))) return false;
    const p = item.transferPair;
    if (p === undefined) return true;
    const choice = value => value && typeof value === 'object' &&
        ['Expense', 'Income', 'Refund', 'Transfer'].includes(value.type) &&
        [null, true, false].includes(value.typeOverride) &&
        (value.bankTypeRuleId === null || typeof value.bankTypeRuleId === 'string') &&
        (value.reviewStatus === null || ['reviewed', 'needs-review'].includes(value.reviewStatus));
    return Boolean(p && p.version === 1 && ['automatic', 'confirmed'].includes(p.mode) &&
        [p.peerKey, p.ownFingerprint, p.peerFingerprint].every(v => typeof v === 'string' && v.length <= 8000) &&
        choice(p.before) && choice(p.applied) && p.applied.type === 'Transfer');
}
function linkedTransferPeer(item, transactions, accounts) {
    const p = item.transferPair;
    if (!p || !validTransferFields(item) || p.ownFingerprint !== transferFingerprint(item) || !sameTransferChoice(item, p.applied)) return null;
    const peers = transactions.filter(t => transferRecordKey(t) === p.peerKey);
    const peer = peers.length === 1 ? peers[0] : null;
    return peer && validTransferFields(peer) && compatibleTransferRecords(item, peer, accounts) &&
        peer.transferPair?.peerKey === transferRecordKey(item) &&
        p.peerFingerprint === transferFingerprint(peer) &&
        peer.transferPair.ownFingerprint === transferFingerprint(peer) &&
        peer.transferPair.peerFingerprint === transferFingerprint(item) &&
        sameTransferChoice(peer, peer.transferPair.applied) ? peer : null;
}
function transferPairLabel(item, peer, accounts) {
    const out = item.amount < 0 ? item : peer, incoming = item.amount > 0 ? item : peer;
    return `${transferAccount(out, accounts)?.name || 'From account'} → ${transferAccount(incoming, accounts)?.name || 'To account'}`;
}
function transferCandidates(item, transactions, accounts, includeDismissed = false) {
    if (!eligibleTransferRecord(item, accounts) || item.transferPair) return [];
    const counts = new Map();
    for (const entry of transactions) { const key = transferRecordKey(entry); counts.set(key, (counts.get(key) || 0) + 1); }
    if (counts.get(transferRecordKey(item)) !== 1) return [];
    return transactions.filter(peer => counts.get(transferRecordKey(peer)) === 1 && !peer.transferPair && compatibleTransferRecords(item, peer, accounts) &&
        (includeDismissed || !(item.transferNoMatch || []).includes(transferRecordKey(peer)) &&
            !(peer.transferNoMatch || []).includes(transferRecordKey(item))))
        .sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(item.date)) - Math.abs(Date.parse(b.date) - Date.parse(item.date)) || transferRecordKey(a).localeCompare(transferRecordKey(b)));
}
function transferSuggestions(transactions, accounts) {
    const result = [], seen = new Set();
    for (const item of transactions) {
        if (!hasTransferEvidence(item)) continue;
        for (const peer of transferCandidates(item, transactions, accounts)) {
            if (!hasTransferEvidence(peer)) continue;
            const outgoing = item.amount < 0 ? item : peer, incoming = item.amount > 0 ? item : peer;
            const key = JSON.stringify([transferRecordKey(outgoing), transferRecordKey(incoming)]);
            if (seen.has(key)) continue;
            seen.add(key);
            result.push({ key, outgoing, incoming, label: transferPairLabel(outgoing, incoming, accounts) });
        }
    }
    return result.sort((a, b) => b.outgoing.date.localeCompare(a.outgoing.date));
}
function matchTransferRecords(transactions, accounts, firstKey, secondKey, mode = 'confirmed') {
    const next = transactions.map(t => ({ ...t }));
    const first = next.filter(t => transferRecordKey(t) === firstKey), second = next.filter(t => transferRecordKey(t) === secondKey);
    if (first.length !== 1 || second.length !== 1 || !compatibleTransferRecords(first[0], second[0], accounts) ||
        first[0].transferPair || second[0].transferPair) throw new Error('These entries changed or cannot be linked. Reopen the transfer and check both accounts.');
    const [a, b] = [first[0], second[0]];
    for (const [item, peer] of [[a, b], [b, a]]) {
        const before = transferChoice(item);
        item.type = 'Transfer'; item.typeOverride = true; item.reviewStatus = 'reviewed';
        delete item.transferMatchIssue;
        item.transferNoMatch = (item.transferNoMatch || []).filter(key => key !== transferRecordKey(peer));
        item.transferPair = { version: 1, peerKey: transferRecordKey(peer),
            ownFingerprint: transferFingerprint(item), peerFingerprint: transferFingerprint(peer),
            mode, before, applied: transferChoice(item) };
    }
    return next;
}
function unlinkTransferRecords(transactions, firstKey) {
    const next = transactions.map(t => ({ ...t })), first = next.find(t => transferRecordKey(t) === firstKey);
    if (!first?.transferPair || !validTransferFields(first)) throw new Error('This transfer match has changed. Reopen it to see the latest details.');
    const peerKey = first.transferPair.peerKey;
    for (const item of next) {
        if (transferRecordKey(item) !== firstKey && !(transferRecordKey(item) === peerKey && item.transferPair?.peerKey === firstKey)) continue;
        const link = item.transferPair;
        if (!link || !validTransferFields(item)) continue;
        if (sameTransferChoice(item, link.applied)) {
            for (const key of transferChoiceFields) {
                if (link.before[key] === null) delete item[key]; else item[key] = link.before[key];
            }
        }
        item.transferNoMatch = [...new Set([...(item.transferNoMatch || []), link.peerKey])];
        delete item.transferPair;
    }
    return next;
}
function reconcileTransferRecords(transactions, accounts, automatic = true) {
    let next = transactions;
    // Broken links must not keep an unrelated edited payment excluded from spending.
    for (const item of transactions) {
        if (item.transferPair && !linkedTransferPeer(item, transactions, accounts)) {
            if (!next.find(t => transferRecordKey(t) === transferRecordKey(item))?.transferPair) continue;
            if (validTransferFields(item)) {
                const affected = transactions.filter(t => (transferRecordKey(t) === transferRecordKey(item) ||
                    transferRecordKey(t) === item.transferPair.peerKey && t.transferPair?.peerKey === transferRecordKey(item)) &&
                    sameTransferChoice(t, t.transferPair?.applied)).map(transferRecordKey);
                next = unlinkTransferRecords(next, transferRecordKey(item)).map(t => affected.includes(transferRecordKey(t))
                    ? { ...t, reviewStatus: 'needs-review', transferMatchIssue: 'bank-change' } : t);
            }
            else next = next.map(t => transferRecordKey(t) === transferRecordKey(item)
                ? (({ transferPair, ...rest }) => ({ ...rest, reviewStatus: 'needs-review', transferMatchIssue: 'bank-change' }))(t) : t);
        }
    }
    if (!automatic) return next;
    const candidates = transferSuggestions(next, accounts), counts = new Map();
    for (const pair of candidates) for (const item of [pair.outgoing, pair.incoming]) {
        const key = transferRecordKey(item); counts.set(key, (counts.get(key) || 0) + 1);
    }
    for (const pair of candidates) {
        if ([pair.outgoing, pair.incoming].every(t => t.type === 'Transfer' && t.reviewStatus === 'reviewed' &&
            counts.get(transferRecordKey(t)) === 1) && pair.outgoing.date === pair.incoming.date) {
            next = matchTransferRecords(next, accounts, transferRecordKey(pair.outgoing), transferRecordKey(pair.incoming), 'automatic');
        }
    }
    return next;
}
