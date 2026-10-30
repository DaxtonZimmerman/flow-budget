/* Shared planning tools. Bank facts stay on the original transaction. */
function flowFeatureDefaults() {
    return { version: 1, categories: [], goals: [], adjustments: [], cards: [], partialBills: [], reminders: [], checkIn: null };
}
function flowFeatures(planning) { return planning.features || flowFeatureDefaults(); }
function flowCopy(value) { return JSON.parse(JSON.stringify(value)); }
function flowAmount(value, negative = false) {
    if (!(negative ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(String(value))) throw new Error('Enter an amount with up to two decimals.');
    const result = Math.round(Number(value) * 100);
    if (!Number.isSafeInteger(result)) throw new Error('This amount is too large.');
    return result;
}
function flowTransactionKey(t) { return t.source === 'bank' ? JSON.stringify([t.bankConnectionId || '', t.accountId, t.bankTransactionId]) : String(t.id); }
function flowTransactionStamp(t) { return JSON.stringify([flowTransactionKey(t), t.amount, t.date, t.status || 'posted']); }
function flowBalanceKey(planning, accounts) {
    return JSON.stringify(planning.manualBalance ? ['manual', planning.manualBalance.cents, planning.manualBalance.date] : planning.selectedAccountIds.map(id => {
        const a = accounts.find(a => a.id === id); return a ? [id, a.availableCents, a.bankUpdatedAt || a.retrievedAt] : [id, null];
    }));
}
function validFlowFeatures(f) {
    if (f === undefined) return true;
    const text = s => typeof s === 'string' && s.trim().length > 0 && s.length <= 2000;
    const cents = n => Number.isSafeInteger(n) && n >= 0;
    const rows = (a, check) => Array.isArray(a) && a.length <= 2000 && a.every(check);
    const unique = a => new Set(a.map(x => x.id)).size === a.length;
    return Boolean(f && (f.version === 1 || f.version === 2 && typeof validFlowGrowthFeatures === 'function' && validFlowGrowthFeatures(f)) &&
        rows(f.categories, c => c && text(c.id) && text(c.name) && c.name.length <= 50 && typeof c.archived === 'boolean') && unique(f.categories) &&
        new Set(f.categories.map(c => c.name.toLowerCase())).size === f.categories.length &&
        rows(f.goals, g => g && text(g.id) && text(g.name) && cents(g.targetCents) && g.targetCents > 0 && cents(g.reservedCents) && cents(g.contributionCents) && ['inside', 'outside'].includes(g.location) && (!g.dueDate || validPlanDate(g.dueDate)) &&
            (g.billId === undefined || typeof g.billId === 'string' && (!g.billId || g.location === 'inside')) && (g.coveredBillPayments === undefined || rows(g.coveredBillPayments, b => b && text(b.key) && cents(b.paidCents)))) && unique(f.goals) &&
        new Set(f.goals.filter(g=>g.billId).map(g=>g.billId)).size === f.goals.filter(g=>g.billId).length &&
        rows(f.adjustments, a => a && text(a.id) && text(a.transactionKey) && text(a.fingerprint) && text(a.balanceKey) && validPlanDate(a.confirmedOn)) && unique(f.adjustments) &&
        rows(f.cards, c => c && text(c.id) && text(c.accountId) && ['full', 'fixed', 'outside'].includes(c.mode) && cents(c.reserveCents) && validPlanDate(c.confirmedOn) && validPlanDate(c.dueDate) &&
            (c.essentialCovered===undefined || Array.isArray(c.essentialCovered) && c.essentialCovered.every(k=>typeof k==='string')) && (c.essentialPeriodKey===undefined || typeof c.essentialPeriodKey==='string' && c.essentialPeriodKey.length<=200) &&
            rows(c.covered, t => t && text(t.key) && Number.isSafeInteger(t.amountCents) && ['Expense', 'Refund', 'Income', 'Transfer'].includes(t.type) && (t.pendingId === null || typeof t.pendingId === 'string'))) && unique(f.cards) && new Set(f.cards.map(c => c.accountId)).size === f.cards.length &&
        rows(f.partialBills, b => b && text(b.id) && text(b.billId) && validPlanDate(b.dueDate) && cents(b.paidCents) && text(b.balanceKey)) && unique(f.partialBills) && new Set(f.partialBills.map(b=>b.billId+'|'+b.dueDate)).size === f.partialBills.length &&
        rows(f.reminders, r => r && text(r.id) && validPlanDate(r.until)) && unique(f.reminders) &&
        (f.checkIn === null || f.checkIn && validPlanDate(f.checkIn.date) && typeof f.checkIn.note === 'string' && f.checkIn.note.length <= 500));
}
function validFlowPlanningExtras(p) {
    const covered=p.manualBalance?.covered;
    if(covered!==undefined && (!Array.isArray(covered)||covered.length>100000||covered.some(c=>!c||typeof c.key!=='string'||typeof c.fingerprint!=='string')||new Set(covered.map(c=>c.key)).size!==covered.length))return false;
    for(const key of ['remindersEnabled','weeklyReminders','budgetReminders'])if(p.preferences?.[key]!==undefined&&typeof p.preferences[key]!=='boolean')return false;
    if(p.reservePeriodKey!==undefined&&(typeof p.reservePeriodKey!=='string'||p.reservePeriodKey.length>200))return false;
    return true;
}
function validFlowTransactionExtras(t) {
    if (!t || typeof t !== 'object') return false;
    if (t.allocations !== undefined && (!Array.isArray(t.allocations) || t.allocations.length > 30 || t.allocations.some(a => !a || typeof a.id !== 'string' || typeof a.category !== 'string' || !a.category.trim() || !Number.isSafeInteger(a.cents) || a.cents <= 0) || new Set(t.allocations.map(a => a.id)).size !== t.allocations.length)) return false;
    if (t.relatedExpense !== undefined && (!t.relatedExpense || typeof t.relatedExpense.key !== 'string' || !Number.isSafeInteger(t.relatedExpense.cents) || t.relatedExpense.cents <= 0)) return false;
    if (t.cardPayment !== undefined && (!t.cardPayment || typeof t.cardPayment.peerKey !== 'string' || typeof t.cardPayment.fingerprint !== 'string' || !['Expense', 'Income', 'Refund', 'Transfer'].includes(t.cardPayment.previousType))) return false;
    return true;
}
function flowCategories(planning = null, includeArchived = false) {
    const defaults = ['Salary', 'Income', 'Food', 'Transport', 'Entertainment', 'Shopping', 'Bills', 'Other'];
    try { planning ||= loadFlowPlanning(); } catch (_) { return defaults; }
    return [...new Set([...defaults, ...flowFeatures(planning).categories.filter(c => includeArchived || !c.archived).map(c => c.name)])];
}
function flowTransactionParts(t) {
    const total = Math.abs(Math.round(t.amount * 100));
    const valid = validFlowTransactionExtras(t) && t.allocations?.length && t.allocations.reduce((n, a) => n + a.cents, 0) === total && t.type !== 'Transfer';
    if (valid) return t.allocations.map(a => ({ category: a.category, cents: a.cents, income: Boolean(t.relatedExpense && a.id === 'remainder') }));
    if(t.type === 'Refund' && t.relatedExpense) {
        const linked=Math.min(total,t.relatedExpense.cents);
        return [{category:t.category||'Other',cents:linked},...(total>linked?[{category:'Income',cents:total-linked,income:true}]:[])];
    }
    return [{ category: t.category || 'Other', cents: total }];
}
function flowReportingAmounts(t) {
    if (t.status === 'pending' || t.type === 'Transfer') return { incomeCents: 0, spendingCents: 0 };
    const cents = Math.round(t.amount * 100);
    if (t.type === 'Refund') return { incomeCents: t.relatedExpense ? Math.max(0, cents - t.relatedExpense.cents) : 0, spendingCents: -(t.relatedExpense ? Math.min(cents, t.relatedExpense.cents) : cents) };
    if (cents < 0) return { incomeCents: 0, spendingCents: -cents };
    // A credit on a card is not earned income. Its purpose still needs a choice.
    try { if (typeof loadBankAccounts === 'function' && flowCardAccount(t, loadBankAccounts())) return { incomeCents: 0, spendingCents: 0 }; } catch (_) { /* Screens expose unreadable account data. */ }
    return { incomeCents: cents, spendingCents: 0 };
}
function flowSplitTransaction(t, parts) {
    if (!t || t.status === 'pending' || !['Expense', 'Refund'].includes(t.type)) throw new Error('Split a posted expense or refund. Transfers and pending payments stay as one record.');
    if (t.relatedExpense) throw new Error('Edit or remove the reimbursement link before changing its allocations.');
    const next = { ...t, allocations: parts.map((a, i) => ({ id: a.id || `part-${i}`, category: String(a.category).trim(), cents: a.cents })) };
    if (!validFlowTransactionExtras(next) || parts.length < 2 || parts.reduce((n, a) => n + a.cents, 0) !== Math.abs(Math.round(t.amount * 100))) throw new Error('Use at least two positive parts that add up exactly to this transaction.');
    next.categoryReason = 'Split by you'; next.categoryRuleId = undefined; next.bankCategoryAuto = false; next.reviewStatus = 'reviewed';
    delete next.allocationIssue;
    return next;
}
function flowPreserveTransactionExtras(next, previous) {
    if (!previous) return next;
    for (const key of ['allocations', 'relatedExpense', 'cardPayment']) if (previous[key] !== undefined) next[key] = flowCopy(previous[key]);
    if (next.allocations?.length && (next.type === 'Transfer' || next.allocations.reduce((n, a) => n + a.cents, 0) !== Math.abs(Math.round(next.amount * 100)))) {
        next.allocationIssue = true; next.reviewStatus = 'needs-review';
    }
    return next;
}
function flowLinkRefund(transactions, refundId, expenseId, cents) {
    const rows = flowCopy(transactions), credit = rows.find(t => String(t.id) === String(refundId)), expense = rows.find(t => String(t.id) === String(expenseId));
    if (!credit || !expense || credit.status === 'pending' || expense.status === 'pending' || credit.amount <= 0 || expense.amount >= 0 || expense.type !== 'Expense' || credit.type === 'Transfer') throw new Error('Choose a posted money-in transaction and the expense it repays.');
    const key = flowTransactionKey(expense);
    const used = rows.filter(t => t.id !== credit.id && t.status !== 'pending' && t.type === 'Refund' && t.relatedExpense?.key === key).reduce((n, t) => n + t.relatedExpense.cents, 0);
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > Math.round(credit.amount * 100) || cents + used > Math.abs(Math.round(expense.amount * 100))) throw new Error('The linked amount cannot exceed the money received or the unreimbursed part of this expense.');
    // The remaining part of a mixed deposit stays Income through allocations in reporting.
    credit.relatedExpense = { key, cents, previousType: credit.relatedExpense?.previousType || credit.type, previousCategory: credit.relatedExpense?.previousCategory || credit.category }; credit.type = 'Refund'; credit.typeOverride = true;
    credit.category = expense.category; credit.categoryReason = 'Refund / reimbursement linked by you'; credit.categoryRuleId = undefined; credit.bankCategoryAuto = false; credit.reviewStatus = 'reviewed';
    delete credit.allocationIssue;
    delete credit.allocations;
    const expenseParts = flowTransactionParts(expense), total = Math.abs(Math.round(expense.amount * 100));
    let remaining = cents;
    credit.allocations = expenseParts.map((a, i) => {
        const part = i === expenseParts.length - 1 ? remaining : Math.min(remaining, Math.floor(cents * a.cents / total)); remaining -= part;
        return { id: `refund-${i}`, category: a.category, cents: part };
    }).filter(a => a.cents > 0);
    if (Math.round(credit.amount * 100) > cents) credit.allocations.push({ id: 'remainder', category: 'Income', cents: Math.round(credit.amount * 100) - cents });
    return rows;
}
function flowCovered(planning, t, accounts, today, now) {
    const covered = planning.manualBalance?.covered;
    if (planning.manualBalance?.date === today && Array.isArray(covered) && covered.some(c => c.key === flowTransactionKey(t) && c.fingerprint === flowTransactionStamp(t))) return true;
    const account = accounts.find(a => a.bankConnectionId === t.bankConnectionId && a.accountId === t.accountId && planning.selectedAccountIds.includes(a.id));
    const asOf = planning.manualBalance?.date || planDateAt(account?.bankUpdatedAt);
    return Boolean(account && t.status !== 'pending' && validPlanDate(t.date) && validPlanDate(asOf) && t.date < asOf && (planning.manualBalance?.date === today || account.bankUpdatedAt && now - Date.parse(account.bankUpdatedAt) <= 36 * 3600000));
}
function flowCardAccount(t, accounts) { return accounts.find(a => a.accountId === t.accountId && a.bankConnectionId === t.bankConnectionId && a.type === 'credit' && a.currency === 'USD'); }
function flowReservePeriodKey(p) { return p.reservePeriodKey || p.periodStartedOn; }
function flowFundedCardPurchase(t, planning, accounts) {
    const account=flowCardAccount(t,accounts),c=account&&flowFeatures(planning).cards.find(c=>c.accountId===account.id);
    if(!c||c.mode==='outside'||t.type!=='Expense'||t.amount>=0||t.status==='pending')return false;
    return c.mode==='full' || !c.covered.some(row=>row.key===flowTransactionKey(t)) || (c.essentialPeriodKey===flowReservePeriodKey(planning)&&c.essentialCovered?.includes(flowTransactionKey(t)));
}
function flowCardFingerprint(t) { return JSON.stringify([flowTransactionKey(t), Math.round(t.amount * 100), t.date, t.status || 'posted']); }
function flowCardPeer(t, transactions, accounts) {
    if (!t.cardPayment || t.type !== 'Transfer' || t.status === 'pending') return null;
    const peer = transactions.find(p => flowTransactionKey(p) === t.cardPayment.peerKey);
    if (!peer || peer.type !== 'Transfer' || peer.status === 'pending' || peer.cardPayment?.peerKey !== flowTransactionKey(t) ||
        t.cardPayment.fingerprint !== flowCardFingerprint(peer) || peer.cardPayment.fingerprint !== flowCardFingerprint(t) || Math.round(t.amount * 100) !== -Math.round(peer.amount * 100)) return null;
    const debit = t.amount < 0 ? t : peer, credit = t.amount > 0 ? t : peer;
    return billCashAccount(debit, accounts) && flowCardAccount(credit, accounts) ? peer : null;
}
function flowCardPaymentCandidates(transactions, accounts) {
    const result = [];
    for (const debit of transactions) {
        if (debit.amount >= 0 || debit.status === 'pending' || !billCashAccount(debit, accounts) || debit.transferPair || debit.cardPayment) continue;
        for (const credit of transactions) {
            if (credit.amount <= 0 || credit.status === 'pending' || !flowCardAccount(credit, accounts) || credit.transferPair || credit.cardPayment || credit.type === 'Refund' || Math.round(debit.amount * 100) !== -Math.round(credit.amount * 100) || !validPlanDate(debit.date) || !validPlanDate(credit.date) || Math.abs(planDays(debit.date, credit.date)) > 5) continue;
            result.push({ debit, credit });
        }
    }
    return result;
}
function flowMatchCardPayment(transactions, accounts, debitId, creditId) {
    const candidate = flowCardPaymentCandidates(transactions, accounts).find(c => String(c.debit.id) === String(debitId) && String(c.credit.id) === String(creditId));
    if (!candidate) throw new Error('These payments changed or cannot be linked. Reopen the list.');
    const rows = flowCopy(transactions), a = rows.find(t => t.id === candidate.debit.id), b = rows.find(t => t.id === candidate.credit.id);
    if (a.allocations?.length || b.allocations?.length) throw new Error('Remove the split before linking a card payment.');
    for (const [t, peer] of [[a, b], [b, a]]) {
        t.cardPayment = { peerKey: flowTransactionKey(peer), fingerprint: flowCardFingerprint(peer), previousType: t.type };
        t.type = 'Transfer'; t.typeOverride = true; t.bankTypeRuleId = undefined; t.reviewStatus = 'reviewed';
    }
    return rows;
}
function flowUndoCardPayment(transactions, id) {
    const rows = flowCopy(transactions), first = rows.find(t => String(t.id) === String(id));
    if (!first?.cardPayment) throw new Error('This card payment is no longer linked.');
    const peer = rows.find(t => flowTransactionKey(t) === first.cardPayment.peerKey);
    for (const t of [first, peer].filter(Boolean)) {
        if (t.cardPayment && t.type === 'Transfer') { t.type = t.cardPayment.previousType; t.typeOverride = t.type !== (t.amount < 0 ? 'Expense' : 'Income'); }
        delete t.cardPayment;
    }
    return rows;
}
function flowCardReserves(planning, accounts, transactions, today, now) {
    const rows = [], missing = [];
    for (const c of flowFeatures(planning).cards) {
        if (c.mode === 'outside') continue;
        const a = accounts.find(a => a.id === c.accountId && a.type === 'credit' && a.currency === 'USD');
        if (!a) { missing.push('Check the card account in your plan'); continue; }
        if (c.confirmedOn > today || now - Date.parse(a.retrievedAt) > 36 * 3600000) missing.push(`Check ${a.name} and its repayment amount`);
        let reserve = c.reserveCents;
        const byKey = new Map();
        for (const t of transactions.filter(t => flowCardAccount(t, [a]))) {
            const key = flowTransactionKey(t);
            if (byKey.has(key) && flowCardFingerprint(byKey.get(key)) !== flowCardFingerprint(t)) missing.push(`Check duplicate bank records for ${a.name}`);
            else byKey.set(key, t);
        }
        const related = [...byKey.values()];
        for (const t of related) {
            const prior = c.covered.find(row => row.key === flowTransactionKey(t) || t.pendingTransactionId && row.key === JSON.stringify([t.bankConnectionId || '', t.accountId, t.pendingTransactionId]));
            const cents = Math.round(t.amount * 100);
            if (prior) {
                if (prior.amountCents !== cents) missing.push(`Reconfirm ${a.name}: a covered payment amount changed`);
                if(t.type === 'Transfer' && cents > 0) {
                    const peer=flowCardPeer(t,transactions,accounts);
                    if(!peer || !flowCovered(planning,peer,accounts,today,now)) missing.push(`Check whether the payment to ${a.name} is reflected in your cash balance`);
                }
                continue;
            }
            if (!validPlanDate(t.date) || t.date < c.confirmedOn) { missing.push(`Reconfirm ${a.name}: older activity arrived`); continue; }
            if (t.status === 'pending' && cents > 0) continue;
            if (t.type === 'Expense' && cents < 0) reserve += -cents;
            else if (t.type === 'Refund' && cents > 0) reserve -= cents;
            else if (t.type === 'Transfer' && cents > 0) {
                const peer = flowCardPeer(t, transactions, accounts);
                if (!peer || !flowCovered(planning, peer, accounts, today, now)) missing.push(`Check whether the payment to ${a.name} is reflected in your cash balance`);
                else reserve -= cents;
            } else if (cents > 0) missing.push(`Check the money credited to ${a.name}: refund or repayment?`);
            else missing.push(`Reconfirm ${a.name}: this card movement needs a repayment decision`);
        }
        for (const prior of c.covered) if (!related.some(t => flowTransactionKey(t) === prior.key || t.pendingTransactionId && prior.key === JSON.stringify([t.bankConnectionId || '', t.accountId, t.pendingTransactionId]))) missing.push(`Reconfirm ${a.name}: covered activity was removed`);
        const due=c.mode==='full'||c.dueDate<=planning.payday.nextDate;
        rows.push({ ...c, name: a.name, remainingCents: Math.max(0, reserve), due, deductCents: Math.max(0,due?reserve:reserve-c.reserveCents) });
        if (reserve > 0 && c.dueDate < today) missing.push(`Check the overdue repayment for ${a.name}`);
    }
    return { rows, missing: [...new Set(missing)], cents: rows.reduce((n, r) => n + r.deductCents, 0) };
}
function validFlowBillExtras(b) {
    return (b.endDate === undefined || b.endDate === '' || validPlanDate(b.endDate)) &&
        (b.variable === undefined || typeof b.variable === 'boolean') &&
        (b.ceilingCents === undefined || Number.isSafeInteger(b.ceilingCents) && b.ceilingCents >= b.amountCents) &&
        (b.occurrenceOverrides === undefined || Array.isArray(b.occurrenceOverrides) && b.occurrenceOverrides.length <= 1000 &&
            b.occurrenceOverrides.every(o => o && validPlanDate(o.date) && Number.isSafeInteger(o.amountCents) && o.amountCents >= 0 && typeof o.skipped === 'boolean') && new Set(b.occurrenceOverrides.map(o=>o.date)).size === b.occurrenceOverrides.length);
}
function flowBillOverride(bill, date) { return (bill.occurrenceOverrides || []).find(o => o.date === date); }
function flowBillIncluded(bill, date) { return (!bill.endDate || date <= bill.endDate) && !flowBillOverride(bill, date)?.skipped; }
function flowBillPaymentCoverage(planning, rows, accounts) {
    const basis = flowBalanceKey(planning, accounts);
    return rows.map(row => ({ key: row.key || `${row.id}|${row.dueDate}`, paidCents: row.paid ? row.amountCents :
        Math.min(row.amountCents, flowFeatures(planning).partialBills.find(b=>b.billId === row.id && b.dueDate === row.dueDate && b.balanceKey === basis)?.paidCents || 0) }));
}
function flowGoalReserves(planning, bills, billRows, accounts) {
    const currentPayments = flowBillPaymentCoverage(planning, billRows, accounts), basis = flowBalanceKey(planning, accounts), missing = [];
    const rows = flowFeatures(planning).goals.map(g => {
        let consumedCents=0, billReservedCents=0;
        if(g.billId) {
            if(!planning.bills.some(b=>b.id===g.billId)) missing.push(`Check the bill linked to goal ${g.name}`);
            for(const b of billRows.filter(b=>b.id===g.billId)) {
                const key=b.key || `${b.id}|${b.dueDate}`;
                const prior=(g.coveredBillPayments || []).find(p=>p.key===key)?.paidCents || 0;
                consumedCents+=Math.max(0,(currentPayments.find(p=>p.key===key)?.paidCents || 0)-prior);
            }
            for(const b of bills.filter(b=>b.id===g.billId)) {
                const partial=flowFeatures(planning).partialBills.find(p=>p.billId===b.id && p.dueDate===b.dueDate && p.balanceKey===basis)?.paidCents || 0;
                billReservedCents+=Math.max(0,b.amountCents-partial);
            }
        }
        const remainingCents=Math.max(0,g.reservedCents-consumedCents);
        return {...g,remainingCents,consumedCents,billReservedCents,deductCents:g.location==='inside'?Math.max(0,remainingCents-billReservedCents):0};
    });
    return { rows, missing, cents: rows.reduce((n,g)=>n+g.deductCents,0) };
}
function flowEnhanceEstimate(base, planning, accounts, transactions, today, now) {
    const e = { ...base, missing: [...base.missing], notes: [...base.notes], reserves: base.reserves.map(r => ({ ...r })) }, f = flowFeatures(planning);
    const balanceKey = flowBalanceKey(planning, accounts), adjustments = [], seen = new Set();
    for (const a of f.adjustments) {
        const t = transactions.find(t => flowTransactionKey(t) === a.transactionKey);
        if (!t || flowTransactionStamp(t) !== a.fingerprint || a.balanceKey !== balanceKey) { e.missing.push('Check your unreflected purchases after the balance or activity changed'); continue; }
        if (seen.has(a.transactionKey)) continue; seen.add(a.transactionKey);
        if (t.amount >= 0 || t.type !== 'Expense') { e.missing.push('Check the purchase deducted from your balance'); continue; }
        adjustments.push({ ...a, name: t.name, cents: -Math.round(t.amount * 100) });
        for (const part of flowTransactionParts(t)) {
            const r = e.reserves.find(r => r.category === part.category);
            if (r && !flowCovered(planning, t, accounts, today, now) && t.date >= planning.periodStartedOn) { r.spentCents += part.cents; r.remainingCents = Math.max(0, r.amountCents - Math.max(0, r.spentCents)); }
        }
    }
    // Explicit confirmations can cover today's posted purchases and their split parts.
    const coveredSeen = new Set();
    for (const t of transactions) {
        const key = flowTransactionKey(t);
        if (coveredSeen.has(key) || base.excludedPayments?.has(typeof billPaymentKey === 'function' ? billPaymentKey(t) : '') || t.type === 'Transfer' || t.status === 'pending' || t.date < planning.periodStartedOn || t.date > today || !flowCovered(planning, t, accounts, today, now)) continue;
        if (t.date === planning.periodStartedOn && !planning.manualBalance?.covered?.some(c=>c.key===key&&c.fingerprint===flowTransactionStamp(t))) continue;
        coveredSeen.add(key);
        const a = accounts.find(a => a.bankConnectionId === t.bankConnectionId && a.accountId === t.accountId);
        const oldAsOf = planning.manualBalance?.date || planDateAt(a?.bankUpdatedAt);
        const originallyCounted = t.source === 'bank' && planning.selectedAccountIds.includes(a?.id) && t.date > planning.periodStartedOn && t.date < oldAsOf;
        for (const r of e.reserves) {
            const parts = flowTransactionParts(t).filter(part => part.category === r.category).reduce((n, part) => n + part.cents, 0);
            const old = originallyCounted && t.category === r.category ? Math.abs(Math.round(t.amount * 100)) : 0;
            if (t.type === 'Expense' || t.type === 'Refund') r.spentCents += (t.type === 'Refund' ? -1 : 1) * (parts - old);
            r.remainingCents = Math.max(0, r.amountCents - Math.max(0, r.spentCents));
        }
    }
    e.adjustments = adjustments; e.adjustmentsCents = adjustments.reduce((n, a) => n + a.cents, 0);
    const goals = flowGoalReserves(planning, e.bills, base.billRows || e.bills, accounts);
    e.goalsCents = goals.cents; e.goals = goals.rows; e.missing.push(...goals.missing);
    const cards = flowCardReserves(planning, accounts, transactions, today, now);
    e.cardReserves = cards.rows; e.cardsCents = cards.cents; e.missing.push(...cards.missing);
    const cardSeen=new Set();
    for(const t of transactions) {
        const key=flowTransactionKey(t),a=flowCardAccount(t,accounts),c=a&&f.cards.find(c=>c.accountId===a.id);
        if(!c||c.mode==='outside'||cardSeen.has(key)||base.excludedPayments?.has(typeof billPaymentKey==='function'?billPaymentKey(t):'')||t.status==='pending'||!['Expense','Refund'].includes(t.type)||t.date<planning.periodStartedOn||t.date>today)continue;
        if(t.date===planning.periodStartedOn && !(c.essentialPeriodKey===flowReservePeriodKey(planning)&&c.essentialCovered?.includes(key)))continue;
        if(t.type==='Expense'&&!flowFundedCardPurchase(t,planning,accounts))continue;
        cardSeen.add(key);
        for(const part of flowTransactionParts(t)) {
            if(part.income)continue;const r=e.reserves.find(r=>r.category===part.category);if(!r)continue;
            r.spentCents+=(t.type==='Refund'?-1:1)*part.cents;r.remainingCents=Math.max(0,r.amountCents-Math.max(0,r.spentCents));
        }
    }
    if(cards.rows.length)e.notes.push('Card purchases funded by your repayment reserve use their essentials once. Pending or start-day purchases can keep essentials reserved until confirmed.');
    for (const a of accounts.filter(a => a.type === 'credit' && a.currency === 'USD')) if (!f.cards.some(c => c.accountId === a.id)) e.missing.push(`Set a repayment plan for ${a.name}, or confirm it is outside this plan`);
    let partialCents = 0;
    for (const b of f.partialBills) {
        const row = e.bills.find(r => r.billId === b.billId && r.dueDate === b.dueDate || r.id === b.billId && r.dueDate === b.dueDate);
        if (!row) continue;
        if (b.balanceKey !== balanceKey) e.missing.push('Recheck a partially paid bill after your balance changed');
        else partialCents += Math.min(b.paidCents, row.amountCents);
    }
    e.billsCents = Math.max(0, e.billsCents - partialCents);
    e.essentialsCents = e.reserves.reduce((n, r) => n + r.remainingCents, 0);
    e.leftCents = e.balanceCents - e.adjustmentsCents - e.billsCents - e.essentialsCents - e.cushionCents - e.goalsCents - e.cardsCents;
    if (![e.leftCents, e.goalsCents, e.cardsCents, e.adjustmentsCents].every(Number.isSafeInteger)) e.missing.push('Check your plan amounts');
    e.missing = [...new Set(e.missing)]; e.ready = e.missing.length === 0;
    e.dailyCents = e.ready && e.days ? Math.floor(e.leftCents / e.days) : null;
    return e;
}
function flowPurchasePreview(estimate, amountCents, category = '', when, today = flowToday(), horizon) {
    if (!estimate.ready) throw new Error('Check your available money and plan before previewing a purchase.');
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || !validPlanDate(when) || when < today || when > horizon) throw new Error('Choose a positive amount and a date within this plan.');
    const reserved = estimate.reserves.find(r => r.category === category)?.remainingCents || 0;
    const usesReserveCents = Math.min(amountCents, reserved), extraCents = amountCents - usesReserveCents;
    return { amountCents, usesReserveCents, extraCents, afterCents: estimate.leftCents - extraCents, shortfall: estimate.leftCents - extraCents < 0 };
}
function flowEstimateSnapshot(p, e, today = flowToday()) {
    return { date: today, payday: p.payday.nextDate, balanceKey: flowBalanceKey(p, typeof loadBankAccounts === 'function' ? loadBankAccounts() : []), ready: e.ready,
        balanceCents: e.balanceCents, billsCents: e.billsCents, essentialsCents: e.essentialsCents, cushionCents: e.cushionCents,
        goalsCents: e.goalsCents || 0, cardsCents: e.cardsCents || 0, adjustmentsCents: e.adjustmentsCents || 0, leftCents: e.leftCents };
}
function flowExplainChange(previous, current) {
    if (!previous || !previous.ready || !current.ready || previous.payday !== current.payday) return [];
    const labels = { balanceCents: 'Selected available money', billsCents: 'Unpaid bills', essentialsCents: 'Essentials still reserved', cushionCents: 'Cushion', goalsCents: 'Goal reserves', cardsCents: 'Card repayment reserves', adjustmentsCents: 'Unreflected purchases' };
    return Object.entries(labels).filter(([key]) => Number.isSafeInteger(previous[key]) && previous[key] !== current[key]).map(([key, label]) => ({ label, deltaCents: current[key] - previous[key], key }));
}
function flowWeeklySummary(planning, transactions, accounts, today = flowToday()) {
    const since = addPlanDays(today, -6), recent = transactions.filter(t => t.date >= since && t.date <= today && t.status !== 'pending');
    const totals = typeof getMoneyTotals === 'function' ? getMoneyTotals(recent) : { spending: 0, income: 0 };
    return { since, transactions: recent.length, spendingCents: Math.round(totals.spending * 100), incomeCents: Math.round(totals.income * 100),
        questions: recent.filter(t => typeof needsTransactionReview === 'function' && needsTransactionReview(t)).length,
        goals: flowFeatures(planning).goals, due: !flowFeatures(planning).checkIn || planDays(flowFeatures(planning).checkIn.date, today) >= 7 };
}
function flowReserveSuggestions(planning, transactions, accounts, today = flowToday()) {
    const from=addPlanDays(today,-28),seen=new Set();
    const rows=transactions.filter(t=>{
        const key=flowTransactionKey(t);
        if(seen.has(key)||t.status==='pending'||t.type!=='Expense'||t.amount>=0||t.date<from||t.date>today||!billCashAccount(t,accounts))return false;
        seen.add(key);return true;
    });
    const first=rows.map(t=>t.date).sort()[0],observedDays=first?planDays(first,today)+1:0;
    if(observedDays<14||rows.length<4||!validPlanDate(planning.payday.nextDate)||planning.payday.nextDate<=today)return null;
    const days=planDays(today,planning.payday.nextDate),amounts={Food:0,Transport:0,Entertainment:0};
    for(const t of rows)for(const part of flowTransactionParts(t))if(Object.hasOwn(amounts,part.category))amounts[part.category]+=part.cents;
    for(const name of Object.keys(amounts))amounts[name]=Math.ceil(amounts[name]/observedDays*days/100)*100;
    return {amounts,observedDays,transactions:rows.length,days,uncategorized:rows.filter(t=>t.category==='Other').length};
}
/* Editable starting points for a payday period. Never changes saved amounts or bank facts. */
function flowStarterReserves(planning, transactions, accounts, today = flowToday(), now = Date.now(), options = {}) {
    if (!validPlanDate(planning.payday.nextDate) || planning.payday.nextDate <= today) return null;
    const days = planDays(today, planning.payday.nextDate);
    if (days > 366) return null;
    const entries = planning.essentials.length ? planning.essentials : [
        {id:'food',name:'Food & groceries',category:'Food'}, {id:'transport',name:'Transport',category:'Transport'},
        {id:'fun',name:'Entertainment',category:'Entertainment'}];
    const history=typeof flowPeriodSpending==='function'?flowPeriodSpending(planning,transactions,accounts,today,options):null;
    const probe={...planning,setup:{...planning.setup,completed:true},essentials:[],cushionCents:0,periodStartedOn:today,reservesConfirmed:true};
    const estimate=paydayEstimate(probe,accounts,transactions,today,now),availableCents=estimate.ready?Math.max(0,estimate.leftCents):null;
    const source=history?.rows.some(r=>['periods','purchase-floor','purchases'].includes(r.method))?'history':planning.reservesConfirmed?'previous':'starter';
    const amounts=entries.map(e=>history?.rows.find(r=>r.category===e.category)?.suggestedCents??(planning.reservesConfirmed?e.amountCents||0:0));
    // A cushion is a choice, not inferred spending. Keep the user's choice or leave it at zero.
    const cushionCents=planning.reservesConfirmed?planning.cushionCents:0;
    const reservedCents = amounts.reduce((sum,n)=>sum+n,0)+cushionCents;
    if (![...amounts,cushionCents,reservedCents].every(Number.isSafeInteger)) return null;
    return {source,days,entries:entries.map((e,i)=>({...e,amountCents:amounts[i]})),cushionCents,
        availableCents,reservedCents,history,months:0,outlierCount:history?.outlierCount||0,preliminary:history?.rows.some(r=>r.confidence==='limited')??true};
}
function flowReminderItems(planning, estimate, accounts, transactions, today = flowToday()) {
    const items = [], f = flowFeatures(planning);
    if (planning.preferences.remindersEnabled !== true) return items;
    if (paydayCheckInDue(planning, today)) items.push({ id: 'payday:' + planning.payday.nextDate, title: 'Time for your payday check-in', text: 'Confirm money received and start your next plan.', action: 'payday-checkin' });
    if (estimate.ready && estimate.leftCents < 0) items.push({ id: 'shortfall:' + planning.payday.nextDate, title: 'Your plan needs an adjustment', text: 'Bills and set-asides exceed your available money.', action: 'reconcile' });
    if (planning.preferences.billReminders) for (const bill of estimate.bills.filter(b => planDays(today, b.dueDate) <= 3)) items.push({ id: 'bill:' + bill.id + ':' + bill.dueDate, title: bill.dueDate < today ? 'Check an overdue bill' : 'A bill is coming up', text: bill.name + ' · ' + bill.dueDate, action: 'bills' });
    if (estimate.missing.some(m => /balance|account/i.test(m))) items.push({ id: 'balance', title: 'Check your available money', text: 'An account balance needs a confirmation.', action: 'reconcile' });
    if (planning.preferences.weeklyReminders && flowWeeklySummary(planning,transactions,accounts,today).due) items.push({ id: 'weekly:'+(f.checkIn?.date || 'first'), title: 'A moment for your weekly check-in', text: 'See what changed, check bills, and look at your plan.', action: 'weekly' });
    return items.filter(i => !f.reminders.some(r => r.id === i.id && r.until >= today));
}
