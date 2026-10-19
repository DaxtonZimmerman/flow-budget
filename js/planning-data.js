/* Versioned payday planning. Money is stored as integer cents. */
function flowToday() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function validPlanDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(Date.parse(value + 'T12:00:00Z')) &&
        new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
}
function planDateAt(timestamp) {
    const value = new Date(timestamp);
    if (!Number.isFinite(value.getTime())) return '';
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
function planDays(from, to) { return Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86400000); }
function addPlanDays(date, days) { return new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10); }
function nextPlanDate(date, frequency, anchorDay = Number(date?.slice(-2))) {
    if (!validPlanDate(date)) return '';
    if (frequency === 'weekly') return addPlanDays(date, 7);
    if (frequency === 'biweekly') return addPlanDays(date, 14);
    const [year, month, day] = date.split('-').map(Number);
    if (frequency === 'semimonthly' && day < 15) return `${date.slice(0, 7)}-15`;
    if (frequency === 'semimonthly' && day === 15) {
        return `${date.slice(0, 7)}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`;
    }
    if (!['monthly', 'semimonthly', 'quarterly', 'yearly'].includes(frequency)) return '';
    const step = frequency === 'quarterly' ? 3 : frequency === 'yearly' ? 12 : 1;
    const last = new Date(Date.UTC(year, month + step, 0)).getUTCDate();
    return `${new Date(Date.UTC(year, month + step - 1, 1)).toISOString().slice(0, 7)}-${String(frequency === 'semimonthly' ? 15 : Math.min(anchorDay, last)).padStart(2, '0')}`;
}
function defaultFlowPlanning() {
    return { version: 1, setup: { step: 0, completed: false }, periodStartedOn: '',
        selectedAccountIds: [], manualBalance: null, payday: { nextDate: '', frequency: 'biweekly' },
        bills: [], billPaymentDecisions: [], dismissedBillSuggestions: [], billsConfirmed: false, essentials: [], cushionCents: 0, reservesConfirmed: false,
        preferences: { billReminders: true, autoCategories: true } };
}
function validFlowPlanning(p) {
    const cents = n => Number.isSafeInteger(n) && n >= 0;
    const frequencies = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'yearly', 'once', 'irregular'];
    return Boolean(p && p.version === 1 && p.setup && Number.isInteger(p.setup.step) && p.setup.step >= 0 && p.setup.step <= 5 &&
        validBillAutomationFields(p) && typeof p.setup.completed === 'boolean' && (p.setup.reserveDraft === undefined || p.setup.reserveDraft && typeof p.setup.reserveDraft === 'object' && !Array.isArray(p.setup.reserveDraft) && Object.values(p.setup.reserveDraft).every(value => typeof value === 'string' && value.length <= 30)) && (p.periodStartedOn === '' || validPlanDate(p.periodStartedOn)) &&
        Array.isArray(p.selectedAccountIds) && p.selectedAccountIds.every(id => typeof id === 'string' && id) && new Set(p.selectedAccountIds).size === p.selectedAccountIds.length &&
        (p.manualBalance === null || p.manualBalance && Number.isSafeInteger(p.manualBalance.cents) && validPlanDate(p.manualBalance.date)) &&
        p.payday && (p.payday.nextDate === '' || validPlanDate(p.payday.nextDate)) && frequencies.includes(p.payday.frequency) &&
        Array.isArray(p.bills) && p.bills.every(b => b && typeof b.id === 'string' && typeof b.name === 'string' && b.name.trim() &&
            cents(b.amountCents) && b.amountCents > 0 && validPlanDate(b.nextDate) && frequencies.includes(b.frequency) && (b.anchorDay === undefined || Number.isInteger(b.anchorDay) && b.anchorDay >= 1 && b.anchorDay <= 31)) && new Set(p.bills.map(b => b.id)).size === p.bills.length &&
        typeof p.billsConfirmed === 'boolean' && Array.isArray(p.essentials) && p.essentials.every(e => e && typeof e.id === 'string' &&
            typeof e.name === 'string' && typeof e.category === 'string' && cents(e.amountCents)) && new Set(p.essentials.map(e => e.category)).size === p.essentials.length && cents(p.cushionCents) &&
        typeof p.reservesConfirmed === 'boolean' && p.preferences && typeof p.preferences.billReminders === 'boolean' && typeof p.preferences.autoCategories === 'boolean');
}
function validBillAutomationFields(p) {
    const text = value => typeof value === 'string' && value.length > 0 && value.length <= 2000;
    if (!Array.isArray(p.bills)) return false;
    const historyClaims = new Map();
    for (const b of p.bills) {
        if (!b || typeof b !== 'object') return false;
        if (b.tracking !== undefined && (!b.tracking || !text(b.tracking.merchant) || !text(b.tracking.accountId) || !text(b.tracking.bankConnectionId) || b.tracking.currency !== 'USD')) return false;
        if (b.paymentHistory !== undefined && (!Array.isArray(b.paymentHistory) || b.paymentHistory.some(h => !h || !text(h.transactionKey) || !text(h.fingerprint) || !validPlanDate(h.dueDate)))) return false;
        for (const h of b.paymentHistory || []) {
            if (Array.isArray(p.billPaymentDecisions) && p.billPaymentDecisions.some(d => d?.choice === 'ignore' && d.billId === b.id && d.dueDate === h.dueDate && d.transactionKey === h.transactionKey && d.fingerprint === h.fingerprint)) continue;
            const owner = b.id + '|' + h.dueDate;
            if (historyClaims.has(h.transactionKey) && historyClaims.get(h.transactionKey) !== owner) return false;
            historyClaims.set(h.transactionKey, owner);
        }
        if (b.amountChanges !== undefined && (!Array.isArray(b.amountChanges) || b.amountChanges.some(c => !c || !validPlanDate(c.fromDate) || !Number.isSafeInteger(c.amountCents) || c.amountCents <= 0) || new Set(b.amountChanges.map(c => c.fromDate)).size !== b.amountChanges.length)) return false;
    }
    if (p.dismissedBillSuggestions !== undefined && (!Array.isArray(p.dismissedBillSuggestions) || p.dismissedBillSuggestions.some(d => !d || !text(d.key) || !text(d.label)))) return false;
    if (p.billPaymentDecisions === undefined) return true;
    if (!Array.isArray(p.billPaymentDecisions)) return false;
    const paidRows = new Set(), paidKeys = new Set();
    for (const d of p.billPaymentDecisions) {
        if (!d || !text(d.billId) || !validPlanDate(d.dueDate) || !validPlanDate(d.confirmedOn) || !['paid', 'manual', 'ignore'].includes(d.choice)) return false;
        if (d.choice !== 'manual' && (!text(d.transactionKey) || !text(d.fingerprint))) return false;
        if (d.confirmedRefunds !== undefined && (!Array.isArray(d.confirmedRefunds) || d.confirmedRefunds.some(r => !text(r)))) return false;
        if (d.choice === 'ignore') continue;
        const key = d.billId + '|' + d.dueDate;
        if (paidRows.has(key) || d.choice === 'paid' && (paidKeys.has(d.transactionKey) || historyClaims.has(d.transactionKey) && historyClaims.get(d.transactionKey) !== key)) return false;
        paidRows.add(key); if (d.choice === 'paid') paidKeys.add(d.transactionKey);
    }
    return true;
}
function loadFlowPlanning() {
    const raw = localStorage.getItem('flowPlanning');
    if (!raw) return defaultFlowPlanning();
    const planning = JSON.parse(raw);
    if (!validFlowPlanning(planning)) throw new Error('Your payday plan could not be read. Download a backup from Account before restoring a saved copy.');
    return planning;
}
function saveFlowPlanning(planning) {
    if (!validFlowPlanning(planning)) throw new Error('Check the dates and amounts in your plan.');
    localStorage.setItem('flowPlanning', JSON.stringify(planning));
    if (typeof flowDataChanged === 'function') flowDataChanged();
    if (typeof document !== 'undefined') document.dispatchEvent(new Event('flow-planning-updated'));
}
function validBankAccounts(accounts) {
    return Array.isArray(accounts) && accounts.every(a => a && typeof a.id === 'string' && typeof a.accountId === 'string' &&
        typeof a.bankConnectionId === 'string' && typeof a.name === 'string' && typeof a.type === 'string' && typeof a.subtype === 'string' &&
        (a.currency === null || typeof a.currency === 'string') &&
        [a.availableCents, a.currentCents].every(n => n === null || Number.isSafeInteger(n)) &&
        typeof a.retrievedAt === 'string' && Number.isFinite(Date.parse(a.retrievedAt))) && new Set(accounts.map(a => a.id)).size === accounts.length;
}
function loadBankAccounts() {
    const accounts = JSON.parse(localStorage.getItem('bankAccounts') || '[]');
    if (!validBankAccounts(accounts)) throw new Error('Your saved account balances could not be read. Open Account to sync again.');
    return accounts;
}
function bankAccountSnapshot(connectionId, rows, retrievedAt) {
    if (!Array.isArray(rows) || !Number.isFinite(Date.parse(retrievedAt))) throw new Error('The bank did not return a valid account snapshot.');
    const convert = value => typeof value === 'number' && Number.isFinite(value) && Number.isSafeInteger(Math.round(value * 100)) ? Math.round(value * 100) : null;
    return rows.filter(a => a && typeof a.account_id === 'string').map(a => ({
        id: `${connectionId}:${a.account_id}`, accountId: a.account_id, bankConnectionId: connectionId,
        name: String(a.name || 'Bank account'), type: String(a.type || ''), subtype: String(a.subtype || ''),
        currency: typeof a.balances?.iso_currency_code === 'string' ? a.balances.iso_currency_code : null,
        availableCents: convert(a.balances?.available), currentCents: convert(a.balances?.current),
        retrievedAt, bankUpdatedAt: typeof a.balances?.last_updated_datetime === 'string' ? a.balances.last_updated_datetime : null
    }));
}
function planBillOccurrences(planning, through) {
    const result = [];
    for (const bill of planning.bills) {
        let date = bill.nextDate;
        for (let n = 0; n < 180 && date && date <= through; n++) {
            result.push({ ...bill, dueDate: date });
            date = nextPlanDate(date, bill.frequency, bill.anchorDay || Number(bill.nextDate.slice(-2)));
        }
    }
    return result.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
function paydayEstimate(planning, accounts, transactions, today = flowToday(), now = Date.now()) {
    const missing = [], notes = [];
    if (!planning.setup.completed) missing.push('Finish your setup');
    if (!validPlanDate(planning.payday.nextDate) || planning.payday.nextDate <= today) missing.push('Confirm your next payday');
    if (validPlanDate(planning.payday.nextDate) && planDays(today, planning.payday.nextDate) > 366) missing.push('Choose a planning date within the next year');
    if (planning.periodStartedOn > today) missing.push('Check when your set-asides begin');
    if (!planning.billsConfirmed) missing.push('Confirm upcoming bills');
    if (!planning.reservesConfirmed || !validPlanDate(planning.periodStartedOn)) missing.push('Confirm money to keep aside');
    let balanceCents = 0;
    const selected = accounts.filter(a => planning.selectedAccountIds.includes(a.id));
    if (planning.manualBalance) {
        balanceCents = planning.manualBalance.cents;
        if (planning.manualBalance.date !== today) missing.push('Update your manual balance');
        notes.push(`Available balance confirmed by you on ${planning.manualBalance.date}.`);
    } else if (!selected.length) missing.push('Choose a spending account or enter a balance');
    else if (selected.length !== planning.selectedAccountIds.length) missing.push('Check the spending accounts in your plan');
    if (!planning.manualBalance) for (const a of selected) {
        if (a.type !== 'depository' || a.currency !== 'USD' || a.availableCents === null) {
            missing.push(`Confirm an available USD cash balance for ${a.name}`); continue;
        }
        if (now - Date.parse(a.retrievedAt) > 36 * 3600000 || Date.parse(a.retrievedAt) > now + 300000) missing.push(`Update the balance for ${a.name}`);
        if (a.bankUpdatedAt && (!Number.isFinite(Date.parse(a.bankUpdatedAt)) || now - Date.parse(a.bankUpdatedAt) > 36 * 3600000 || Date.parse(a.bankUpdatedAt) > now + 300000)) missing.push(`Check the bank balance date for ${a.name}`);
        balanceCents += a.availableCents;
        notes.push(`${a.name}: cached bank balance retrieved ${new Date(a.retrievedAt).toLocaleString()}. Bank data may be older.`);
    }
    const tracking = typeof getBillTrackingState === 'function' ? getBillTrackingState(planning, accounts, transactions, today, now) : null;
    const bills = validPlanDate(planning.payday.nextDate) ? (tracking ? tracking.rows.filter(b => b.dueDate <= planning.payday.nextDate && !b.paid) : planBillOccurrences(planning, planning.payday.nextDate)) : [];
    if (bills.some(b => b.dueDate < today)) missing.push('Check overdue bills');
    // Release reserves only for posted spending known to precede the balance snapshot.
    // Retrieval time alone does not establish that a cached bank balance reflects a purchase.
    const reserves = planning.essentials.map(e => {
        const seen = new Set();
        let spent = 0;
        for (const t of transactions) {
            const account = selected.find(a => a.accountId === t.accountId && a.bankConnectionId === t.bankConnectionId);
            const asOf = planning.manualBalance?.date || planDateAt(account?.bankUpdatedAt);
            const key = t.bankConnectionId + ':' + (t.bankTransactionId || t.id);
            if (tracking?.excludedPayments.has(billPaymentKey(t)) || !account || seen.has(key) || t.category !== e.category || t.source !== 'bank' ||
                !validPlanDate(t.date) || !validPlanDate(asOf) || t.date <= planning.periodStartedOn || t.date >= asOf ||
                t.status === 'pending' || !['Expense', 'Refund'].includes(t.type) || !Number.isFinite(t.amount) || (t.type === 'Expense' ? t.amount >= 0 : t.amount <= 0)) continue;
            seen.add(key);
            spent += (t.type === 'Refund' ? -1 : 1) * Math.abs(Math.round(t.amount * 100));
        }
        return { ...e, spentCents: spent, remainingCents: Math.max(0, e.amountCents - Math.max(0, spent)) };
    });
    notes.push('Essentials stay reserved until confirmed spending is reflected in a dated balance. Payments made today may still be reserved. Bill payments are matched once and only released when reflected in a dated balance or confirmed by you.');
    if (transactions.some(t => t.source !== 'bank' && t.date >= planning.periodStartedOn && t.date <= today)) {
        notes.push('Manual and CSV activity may not be reflected in your available balance. Confirm it with your bank when you add purchases.');
    }
    const billsCents = bills.reduce((n, b) => n + b.amountCents, 0);
    const essentialsCents = reserves.reduce((n, e) => n + e.remainingCents, 0);
    const leftCents = balanceCents - billsCents - essentialsCents - planning.cushionCents;
    if (![balanceCents, billsCents, essentialsCents, leftCents].every(Number.isSafeInteger)) missing.push('Check your plan amounts');
    return { ready: missing.length === 0, missing: [...new Set(missing)], notes, balanceCents, billsCents, essentialsCents,
        cushionCents: planning.cushionCents, leftCents, bills, reserves,
        days: validPlanDate(planning.payday.nextDate) ? Math.max(1, planDays(today, planning.payday.nextDate)) : null };
}
function currentReviewStart(today = flowToday()) {
    try { const p = loadFlowPlanning(); return p.setup.completed && validPlanDate(p.periodStartedOn) ? p.periodStartedOn : addPlanDays(today, -14); }
    catch (_) { return addPlanDays(today, -14); }
}
function needsCurrentTransactionReview(item) {
    return needsTransactionReview(item) && (!item.date || item.date >= currentReviewStart());
}
