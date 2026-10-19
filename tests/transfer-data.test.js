const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const context = vm.createContext({ Date });
for (const name of ['money-data.js', 'transfer-data.js', 'bank-data.js', 'transaction-details-data.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name), 'utf8'), context);
}
const run = code => vm.runInContext(code, context);
const plain = value => JSON.parse(JSON.stringify(value));
const account = (id, extra = {}) => ({ accountId: id, bankConnectionId: 'bank', name: id === 'a' ? 'Everyday checking' : 'Debit-card checking', type: 'depository', currency: 'USD', ...extra });
const row = (id, amount, accountId, extra = {}) => ({ id, bankTransactionId: id, bankConnectionId: 'bank', accountId,
    source: 'bank', amount, name: amount < 0 ? 'Home banking Withdrawal Transfer to S0058' : 'Home banking Deposit Transfer from S0050',
    date: '2026-10-19', status: 'posted', type: amount < 0 ? 'Expense' : 'Income', category: amount < 0 ? 'Other' : 'Income', notes: '', reviewStatus: 'needs-review', ...extra });
function seed(extra = {}) { context.accounts = [account('a'), account('b')]; context.items = [row('out', -25, 'a'), row('in', 25, 'b')]; Object.assign(context, extra); }
function link() { context.linked = run('matchTransferRecords(items, accounts, transferRecordKey(items[0]), transferRecordKey(items[1]))'); return context.linked; }

test('a new possible transfer needs confirmation; equal shopping and salary amounts do not suggest a transfer', () => {
    seed(); assert.equal(run('transferSuggestions(items, accounts).length'), 1);
    assert.equal(run('reconcileTransferRecords(items, accounts).some(t => t.transferPair)'), false);
    seed({ items: [row('out', -25, 'a', { name: 'Shop' }), row('in', 25, 'b', { name: 'Paycheck' })] });
    assert.equal(run('transferSuggestions(items, accounts).length'), 0);
    seed({ items: [row('out', -25, 'a', { name: 'Venmo', bankCategory: { primary: 'TRANSFER_OUT' } }), row('in', 25, 'b')] });
    assert.equal(run('transferSuggestions(items, accounts).length'), 0);
});
test('unique same-day entries already confirmed as Transfer link automatically and remain separate bank facts', () => {
    seed(); context.items.forEach(t => Object.assign(t, { type: 'Transfer', typeOverride: true, reviewStatus: 'reviewed' }));
    const result = run('reconcileTransferRecords(items, accounts)');
    assert.equal(result.length, 2); assert.equal(result[0].transferPair.mode, 'automatic');
    assert.equal(run('transferPairLabel(items[0], items[1], accounts)'), 'Everyday checking → Debit-card checking');
    for (let i = 0; i < 2; i++) for (const key of ['id', 'amount', 'date', 'name', 'bankTransactionId', 'accountId', 'status', 'notes']) assert.equal(result[i][key], context.items[i][key]);
    assert.equal(context.items[0].transferPair, undefined, 'pure helpers never modify their input');
    context.result = result; assert.equal(run('JSON.stringify(reconcileTransferRecords(result, accounts)) === JSON.stringify(result)'), true);
    assert.equal(run('getMoneyTotals(result).income'), 0); assert.equal(run('getMoneyTotals(result).spending'), 0);
});
test('repeated equal amounts remain ambiguous and cannot be linked by array order', () => {
    seed(); context.items.push(row('in-2', 25, 'b')); context.items.forEach(t => Object.assign(t, { type: 'Transfer', reviewStatus: 'reviewed' }));
    assert.equal(run('transferSuggestions(items, accounts).length'), 2);
    assert.equal(run('reconcileTransferRecords(items, accounts).some(t => t.transferPair)'), false);
    context.items.reverse(); assert.equal(run('reconcileTransferRecords(items, accounts).some(t => t.transferPair)'), false);
});
test('only posted USD cash entries in two different known accounts of the same bank can match', () => {
    const cases = [{ status: 'pending' }, { accountId: 'a' }, { accountId: 'missing' }, { bankConnectionId: 'another-bank' },
        { source: 'manual' }, { amount: 24.99 }, { amount: -25 }, { date: '2026-10-23' }, { date: '2026-02-30' }, { amount: 25.001 }];
    for (const extra of cases) { seed(); Object.assign(context.items[1], extra); assert.equal(run('transferSuggestions(items, accounts).length'), 0, JSON.stringify(extra)); }
    for (const extra of [{ type: 'credit' }, { currency: 'EUR' }]) { seed(); Object.assign(context.accounts[1], extra); assert.equal(run('transferSuggestions(items, accounts).length'), 0); }
});
test('nearby different posting dates can be explicitly confirmed but never automatically linked', () => {
    seed(); context.items[1].date = '2026-10-22'; context.items.forEach(t => Object.assign(t, { type: 'Transfer', reviewStatus: 'reviewed' }));
    assert.equal(run('transferSuggestions(items, accounts).length'), 1);
    assert.equal(run('reconcileTransferRecords(items, accounts).some(t => t.transferPair)'), false);
    link(); assert.equal(run('linkedTransferPeer(linked[0], linked, accounts).id'), 'in');
});
test('an explicit non-transfer correction is not offered for automatic transfer review', () => {
    seed(); Object.assign(context.items[0], { type: 'Expense', reviewStatus: 'reviewed', category: 'Food', categoryReason: 'Chosen by you' });
    assert.equal(run('transferSuggestions(items, accounts).length'), 0);
    assert.equal(run('transferCandidates(items[0], items, accounts, true).length'), 1, 'an intentional individual search may still find the other entry');
});
test('confirmation excludes both sides once without changing categories, notes, or bank balances', () => {
    seed(); context.items[0].notes = 'My movement'; const original = plain(context.items); link();
    assert.equal(run('getMoneyTotals(linked).income'), 0); assert.equal(run('getMoneyTotals(linked).spending'), 0);
    assert.deepEqual(plain(context.accounts), [account('a'), account('b')]);
    context.linked.forEach((t, i) => { assert.equal(t.category, original[i].category); assert.equal(t.notes, original[i].notes); });
    assert.equal(run('linkedTransferPeer(linked[1], linked, accounts).id'), 'out');
});
test('undo restores prior classifications, preserves later category and note edits, and blocks automatic relinking', () => {
    seed(); link(); Object.assign(context.linked[0], { category: 'Shopping', notes: 'Keep this later note' });
    context.undone = run('unlinkTransferRecords(linked, transferRecordKey(linked[0]))');
    assert.equal(context.undone[0].type, 'Expense'); assert.equal(context.undone[1].type, 'Income');
    assert.equal(context.undone[0].category, 'Shopping'); assert.equal(context.undone[0].notes, 'Keep this later note');
    assert.equal(run('transferSuggestions(undone, accounts).length'), 0);
    assert.equal(run('reconcileTransferRecords(undone, accounts).some(t => t.transferPair)'), false);
    context.items = context.undone; link(); assert.equal(run('linkedTransferPeer(linked[0], linked, accounts).id'), 'in', 'the user may deliberately reconsider');
});
test('undo of an automatic link keeps prior Transfer choices and remembered rules intact', () => {
    seed(); context.items.forEach((t, i) => Object.assign(t, { type: 'Transfer', reviewStatus: 'reviewed', typeOverride: true, bankTypeRuleId: 'rule-' + i }));
    context.linked = run('reconcileTransferRecords(items, accounts)');
    context.undone = run('unlinkTransferRecords(linked, transferRecordKey(linked[0]))');
    assert.equal(context.undone[0].type, 'Transfer'); assert.equal(context.undone[0].bankTypeRuleId, 'rule-0');
    assert.equal(run('reconcileTransferRecords(undone, accounts).some(t => t.transferPair)'), false);
});
test('changed bank amount, date, or removed counterpart invalidates a match and restores the surviving choices', () => {
    for (const update of [{ amount: 26 }, { date: '2026-10-20' }, { name: 'Corrected description' }, { status: 'pending' }]) {
        seed(); link(); Object.assign(context.linked[1], update);
        const result = run('reconcileTransferRecords(linked, accounts)');
        assert.equal(result.some(t => t.transferPair), false); assert.equal(result[0].type, 'Expense'); assert.equal(result[1].type, 'Income');
        assert.equal(result[0].transferMatchIssue, 'bank-change'); assert.equal(result[1].reviewStatus, 'needs-review');
        for (const key of Object.keys(update)) assert.equal(result[1][key], update[key]);
    }
    seed(); link(); context.linked.pop(); const result = run('reconcileTransferRecords(linked, accounts)');
    assert.equal(result[0].type, 'Expense'); assert.equal(result[0].transferPair, undefined);
});
test('new personal type corrections survive invalidation while the other side is restored', () => {
    seed(); link(); Object.assign(context.linked[0], { type: 'Expense', typeOverride: false, reviewStatus: 'reviewed', category: 'Food' });
    const result = run('reconcileTransferRecords(linked, accounts)'); assert.equal(result[0].type, 'Expense');
    assert.equal(result[0].category, 'Food'); assert.equal(result[0].reviewStatus, 'reviewed'); assert.equal(result[1].type, 'Income');
    assert.equal(result[0].transferMatchIssue, undefined, 'a newer explicit choice is not replaced by an automatic warning');
});
test('ordinary bank sync retains a match and undo history without duplicating the movement', () => {
    seed(); link(); context.incoming = context.items.map(t => ({ transaction_id: t.bankTransactionId, account_id: t.accountId, amount: -t.amount, date: t.date, name: t.name, pending: false }));
    context.merged = run("mergeBankSnapshot(linked, 'bank', incoming)");
    assert.equal(context.merged.length, 2); assert.equal(run('linkedTransferPeer(merged[0], merged, accounts).id'), 'in');
    context.roundTrip = plain(context.merged); assert.equal(run('linkedTransferPeer(roundTrip[0], roundTrip, accounts).id'), 'in');
    assert.equal(run('roundTrip.every(validTransferFields)'), true);
});
test('stale transaction editors cannot change linked types and duplicate bank IDs cannot be confirmed', () => {
    seed(); link(); context.opened = plain(context.items[0]); context.values = { type: 'Expense', category: 'Food', notes: '', date: '2026-10-19' };
    assert.throws(() => run('transactionWithDetails(linked[0], values, opened)'), /changed/);
    context.opened = plain(context.linked[0]); assert.throws(() => run('transactionWithDetails(linked[0], values, opened)'), /Undo the transfer/);
    seed(); context.items.push({ ...context.items[0] }); assert.throws(link, /changed or cannot/);
});
test('legacy records remain valid and malformed transfer metadata is rejected', () => {
    seed(); assert.equal(run('items.every(validTransferFields)'), true); link();
    context.bad = { ...context.linked[0], transferPair: { ...context.linked[0].transferPair, before: { type: 'Invalid' } } };
    assert.equal(run('validTransferFields(bad)'), false); assert.equal(run('validTransferFields(null)'), false);
    context.bad = { ...context.items[0], transferNoMatch: [13] }; assert.equal(run('validTransferFields(bad)'), false);
});
test('dismissed matches survive later bank sync and duplicate identities do not auto-link', () => {
    seed(); link(); context.undone = run('unlinkTransferRecords(linked, transferRecordKey(linked[0]))');
    context.incoming = context.items.map(t => ({ transaction_id: t.bankTransactionId, account_id: t.accountId,
        amount: -t.amount, date: t.date, name: t.name, pending: false }));
    context.merged = run("mergeBankSnapshot(undone, 'bank', incoming)");
    assert.equal(run('transferSuggestions(merged, accounts).length'), 0);
    seed(); context.items.forEach(t => Object.assign(t, { type: 'Transfer', reviewStatus: 'reviewed' }));
    context.items.push({ ...context.items[0] });
    assert.equal(run('reconcileTransferRecords(items, accounts).some(t => t.transferPair)'), false);
});
