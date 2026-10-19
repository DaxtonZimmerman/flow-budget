/* Recurring bills are confirmed by the user. Matching never edits bank facts. */
function billName(value) { return String(value || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function billPaymentKey(t) {
    return t?.source === 'bank' && t.bankConnectionId && t.accountId && t.bankTransactionId
        ? JSON.stringify([t.bankConnectionId, t.accountId, t.bankTransactionId]) : '';
}
function billSourceKey(t) { return JSON.stringify([billName(t.name), t.bankConnectionId, t.accountId]); }
function billTrackingKey(tracking) { return JSON.stringify([tracking.merchant, tracking.bankConnectionId, tracking.accountId]); }
function billFingerprint(t) { return JSON.stringify([billPaymentKey(t), billName(t.name), Math.round(t.amount * 100), t.date, t.status || 'posted', t.type]); }
function billCashAccount(t, accounts) {
    return accounts.find(a => a.bankConnectionId === t.bankConnectionId && a.accountId === t.accountId && a.type === 'depository' && a.currency === 'USD');
}
function billBankTransactions(transactions, today) {
    const map = new Map(), conflicts = new Set();
    for (const t of transactions) {
        const key = billPaymentKey(t);
        if (!key || !validPlanDate(t.date) || t.date > today || !Number.isSafeInteger(Math.round(t.amount * 100)) || !t.amount || conflicts.has(key)) continue;
        if (map.has(key) && billFingerprint(map.get(key)) !== billFingerprint(t)) { map.delete(key); conflicts.add(key); }
        else map.set(key, t);
    }
    return [...map.values()];
}
function billAmountAt(bill, date) {
    return [...(bill.amountChanges || [])].filter(c => c.fromDate <= date).sort((a, b) => b.fromDate.localeCompare(a.fromDate))[0]?.amountCents ?? bill.amountCents;
}
function billDateWindow(frequency) { return frequency === 'weekly' ? 2 : frequency === 'biweekly' ? 3 : frequency === 'yearly' ? 10 : 5; }
function suggestRecurringBills(planning, accounts, transactions, today = flowToday()) {
    const groups = new Map();
    for (const t of billBankTransactions(transactions, today)) {
        if (t.type !== 'Expense' || t.amount >= 0 || t.status === 'pending' || !billCashAccount(t, accounts) ||
            /\b(venmo|zelle|cash\s*app|paypal|transfer)\b/i.test(t.name) ||
            ['Food', 'Transport', 'Shopping'].includes(t.category)) continue;
        const key = billSourceKey(t);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(t);
    }
    const suggestions = [];
    for (const [key, entries] of groups) {
        if ((planning.dismissedBillSuggestions || []).some(d => d.key === key) || planning.bills.some(b => b.tracking ? billTrackingKey(b.tracking) === key : billName(b.name) === billName(entries[0].name))) continue;
        entries.sort((a, b) => b.date.localeCompare(a.date));
        const latest = entries[0], previous = entries[1];
        if (!previous || latest.date === previous.date) continue;
        const cents = Math.abs(Math.round(latest.amount * 100));
        const olderCents = Math.abs(Math.round(previous.amount * 100));
        const varies = Math.abs(cents - olderCents) > Math.max(100, olderCents * .15);
        if (varies && (latest.category !== 'Bills' || entries.length < 3)) continue;
        const anchorDay = Math.max(Number(latest.date.slice(-2)), Number(previous.date.slice(-2)));
        let frequency = null;
        for (const candidate of ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']) {
            const expected = nextPlanDate(previous.date, candidate, anchorDay);
            if (!expected || Math.abs(planDays(expected, latest.date)) > billDateWindow(candidate)) continue;
            if (['weekly', 'biweekly'].includes(candidate)) {
                if (entries.length < 3) continue;
                const earlier = nextPlanDate(entries[2].date, candidate, anchorDay);
                if (Math.abs(planDays(earlier, previous.date)) > billDateWindow(candidate)) continue;
            }
            frequency = candidate; break;
        }
        if (!frequency) continue;
        const nextDate = nextPlanDate(latest.date, frequency, anchorDay);
        // A pattern that has already stopped is not presented as a new active bill.
        if (!nextDate || nextDate < addPlanDays(today, -billDateWindow(frequency))) continue;
        // Keep a just-due date visible. Advancing it would silently skip an unpaid cycle.
        if (!validPlanDate(nextDate)) continue;
        suggestions.push({ key, name: latest.name, amountCents: cents, nextDate, frequency, anchorDay,
            lastDate: latest.date, previousDate: previous.date, previousAmountCents: olderCents, varies,
            sampleCount: entries.length, accountName: billCashAccount(latest, accounts).name,
            tracking: { merchant: billName(latest.name), bankConnectionId: latest.bankConnectionId, accountId: latest.accountId, currency: 'USD' } });
    }
    return suggestions.sort((a, b) => a.nextDate.localeCompare(b.nextDate) || a.name.localeCompare(b.name));
}
function billPaymentInBalance(t, planning, accounts, today, now) {
    const account = billCashAccount(t, accounts);
    if (!account) return false;
    if (planning.manualBalance && planning.manualBalance.date === today && planning.selectedAccountIds.includes(account.id)) return t.date < today;
    if (account.availableCents === null || !account.bankUpdatedAt) return false;
    const updated = Date.parse(account.bankUpdatedAt), retrieved = Date.parse(account.retrievedAt);
    return Number.isFinite(updated) && now - updated <= 36 * 3600000 && updated <= now &&
        now - retrieved <= 36 * 3600000 && retrieved <= now + 300000 && t.date < planDateAt(account.bankUpdatedAt);
}
function getBillTrackingState(planning, accounts, transactions, today = flowToday(), now = Date.now()) {
    const bank = billBankTransactions(transactions, today), byKey = new Map(bank.map(t => [billPaymentKey(t), t]));
    const decisions = planning.billPaymentDecisions || [], rows = [], claimed = new Map(), excludedPayments = new Set();
    const through = validPlanDate(planning.payday.nextDate) && planning.payday.nextDate > addPlanDays(today, 35) ? planning.payday.nextDate : addPlanDays(today, 35);
    for (const d of decisions.filter(d => d.choice === 'paid')) {
        const t = byKey.get(d.transactionKey);
        if (t && billFingerprint(t) === d.fingerprint) { excludedPayments.add(d.transactionKey); claimed.set(d.transactionKey, `${d.billId}|${d.dueDate}`); }
    }
    for (const bill of planning.bills) {
        for (const h of bill.paymentHistory || []) {
            const t = byKey.get(h.transactionKey);
            if (decisions.some(d => d.billId === bill.id && d.dueDate === h.dueDate && d.choice === 'ignore' && d.transactionKey === h.transactionKey && d.fingerprint === h.fingerprint)) continue;
            if (t?.type === 'Expense' && t.amount < 0 && t.status !== 'pending') excludedPayments.add(h.transactionKey);
            if (t && billFingerprint(t) === h.fingerprint) claimed.set(h.transactionKey, `${bill.id}|${h.dueDate}`);
        }
        let dueDate = bill.nextDate;
        for (let i = 0; dueDate && i < 180; i++) {
            rows.push({ ...bill, key: `${bill.id}|${dueDate}`, billId: bill.id, dueDate,
                amountCents: billAmountAt(bill, dueDate), paid: false, status: 'upcoming', candidates: [], pending: [], payment: null });
            if (dueDate > through) break;
            dueDate = nextPlanDate(dueDate, bill.frequency, bill.anchorDay || Number(bill.nextDate.slice(-2)));
        }
    }
    const sourceMatches = (row, t) => row.tracking && row.tracking.merchant === billName(t.name) &&
        row.tracking.bankConnectionId === t.bankConnectionId && row.tracking.accountId === t.accountId &&
        Math.abs(planDays(row.dueDate, t.date)) <= billDateWindow(row.frequency);
    const refundsFor = t => bank.filter(r => r.type === 'Refund' && r.amount > 0 && r.status !== 'pending' &&
        r.bankConnectionId === t.bankConnectionId && r.accountId === t.accountId && billName(r.name) === billName(t.name) &&
        Math.round(r.amount * 100) === Math.abs(Math.round(t.amount * 100)) && r.date >= t.date && planDays(t.date, r.date) <= 14);
    for (const row of rows) {
        const decision = decisions.find(d => d.billId === row.billId && d.dueDate === row.dueDate && ['paid', 'manual'].includes(d.choice));
        if (decision?.choice === 'manual') { row.paid = true; row.status = 'paid'; row.confirmed = true; row.manual = true; row.decision = decision; }
        for (const t of bank) {
            if (t.type !== 'Expense' || t.amount >= 0 || !sourceMatches(row, t) ||
                decisions.some(d => d.billId === row.billId && d.dueDate === row.dueDate && d.choice === 'ignore' && d.transactionKey === billPaymentKey(t) && d.fingerprint === billFingerprint(t)) ||
                (claimed.has(billPaymentKey(t)) && claimed.get(billPaymentKey(t)) !== row.key)) continue;
            if (t.status === 'pending') row.pending.push(t); else row.candidates.push(t);
        }
        for (const t of row.candidates) excludedPayments.add(billPaymentKey(t));
        if (decision && !row.manual) {
            const t = byKey.get(decision.transactionKey);
            row.decision = decision;
            if (!t || billFingerprint(t) !== decision.fingerprint) { row.status = 'changed'; row.payment = t || null; continue; }
            row.payment = t; excludedPayments.add(billPaymentKey(t));
            const newRefund = refundsFor(t).some(r => !(decision.confirmedRefunds || []).includes(billFingerprint(r)));
            row.status = newRefund ? 'refund' : 'paid'; row.paid = !newRefund; row.confirmed = true;
        }
    }
    const exactOwners = new Map();
    for (const row of rows.filter(r => (!r.confirmed || r.manual) && r.status !== 'changed')) {
        row.exact = row.candidates.filter(t => Math.abs(Math.round(t.amount * 100)) === row.amountCents);
        for (const t of row.exact) { const key = billPaymentKey(t); if (!exactOwners.has(key)) exactOwners.set(key, []); exactOwners.get(key).push(row.key); }
    }
    const assigned = new Set(claimed.keys());
    for (const row of rows) {
        if (row.manual) {
            if (row.exact.length === 1 && exactOwners.get(billPaymentKey(row.exact[0])).length === 1) {
                row.payment = row.exact[0]; assigned.add(billPaymentKey(row.payment));
                if (refundsFor(row.payment).some(r => !(row.decision.confirmedRefunds || []).includes(billFingerprint(r)))) { row.paid = false; row.status = 'refund'; }
            } else if (row.exact.length || row.candidates.length > 1) { row.paid = false; row.status = 'ambiguous'; }
            else if (row.candidates.length === 1) { row.payment = row.candidates[0]; row.paid = false; row.status = 'amount'; }
            continue;
        }
        if (row.confirmed || row.status === 'changed') continue;
        if (row.exact.length === 1 && exactOwners.get(billPaymentKey(row.exact[0])).length === 1) {
            row.payment = row.exact[0]; assigned.add(billPaymentKey(row.payment));
            if (refundsFor(row.payment).length) row.status = 'refund';
            else if (billPaymentInBalance(row.payment, planning, accounts, today, now)) { row.status = 'paid'; row.paid = true; }
            else row.status = 'found';
        } else if (row.exact.length) row.status = 'ambiguous';
    }
    for (const row of rows) {
        if (row.status !== 'upcoming') continue;
        const remaining = row.candidates.filter(t => !assigned.has(billPaymentKey(t)));
        if (remaining.length === 1) { row.status = 'amount'; row.payment = remaining[0]; }
        else if (remaining.length > 1) row.status = 'ambiguous';
        else if (row.pending.length) row.status = 'pending';
        else if (row.dueDate < today) row.status = 'overdue';
    }
    for (const row of rows) {
        row.refunds = row.payment ? refundsFor(row.payment) : [];
        row.needsAttention = ['found', 'amount', 'ambiguous', 'changed', 'refund', 'overdue'].includes(row.status);
    }
    rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name));
    const bills = planning.bills.map(bill => {
        const occurrences = rows.filter(r => r.billId === bill.id);
        return { ...bill, next: occurrences.find(r => !r.paid) || null,
            lastPaid: occurrences.filter(r => r.paid).sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0] || null,
            attention: occurrences.find(r => r.needsAttention) || null, occurrences };
    });
    return { rows, bills, alerts: bills.map(b => b.attention).filter(Boolean),
        excludedPayments, suggestions: suggestRecurringBills(planning, accounts, bank, today) };
}
function decideBillPayment(planning, transactions, accounts, billId, dueDate, choice, transactionKey = '', updateAmount = false, today = flowToday(), now = Date.now()) {
    const next = JSON.parse(JSON.stringify(planning));
    const state = getBillTrackingState(next, accounts, transactions, today, now);
    const row = state.rows.find(r => r.billId === billId && r.dueDate === dueDate);
    if (!row) throw new Error('This bill changed. Reload before matching a payment.');
    const existing = next.billPaymentDecisions || [];
    let decision;
    if (choice === 'manual') decision = { billId, dueDate, choice, confirmedOn: today, confirmedRefunds: row.refunds.map(billFingerprint) };
    else if (choice === 'paid' || choice === 'ignore') {
        const payment = billBankTransactions(transactions, today).find(t => billPaymentKey(t) === transactionKey);
        if (!payment || payment.status === 'pending' || payment.type !== 'Expense' || payment.amount >= 0 ||
            !row.candidates.some(t => billPaymentKey(t) === transactionKey)) throw new Error('That payment changed or is not available for this bill. Reload and check again.');
        if (choice === 'paid' && existing.some(d => d.choice === 'paid' && d.transactionKey === transactionKey && (d.billId !== billId || d.dueDate !== dueDate))) throw new Error('This payment is already matched to another bill.');
        decision = { billId, dueDate, choice, transactionKey, fingerprint: billFingerprint(payment), confirmedOn: today,
            confirmedRefunds: billBankTransactions(transactions, today).filter(r => r.type === 'Refund' && r.status !== 'pending' && r.bankConnectionId === payment.bankConnectionId && r.accountId === payment.accountId && billName(r.name) === billName(payment.name) && Math.round(r.amount * 100) === Math.abs(Math.round(payment.amount * 100)) && r.date >= payment.date && planDays(payment.date, r.date) <= 14).map(billFingerprint) };
        if (choice === 'paid' && updateAmount) {
            const bill = next.bills.find(b => b.id === billId);
            bill.amountChanges = (bill.amountChanges || []).filter(c => c.fromDate !== dueDate);
            bill.amountChanges.push({ fromDate: dueDate, amountCents: Math.abs(Math.round(payment.amount * 100)) });
        }
    } else throw new Error('Choose how to handle this payment.');
    next.billPaymentDecisions = existing.filter(d => !(d.billId === billId && d.dueDate === dueDate &&
        (['manual', 'paid'].includes(d.choice) || d.transactionKey === transactionKey)));
    next.billPaymentDecisions.push(decision);
    if (choice === 'ignore') {
        const bill = next.bills.find(b => b.id === billId);
        if (bill.paymentHistory) bill.paymentHistory = bill.paymentHistory.filter(h => h.dueDate !== dueDate || h.transactionKey !== transactionKey);
    }
    return next;
}
