/* turn bank updates into Flow transactions */

function suggestedBankCategory(name, type, category) {
    if (!category || !['HIGH', 'VERY_HIGH'].includes(category.confidence_level) ||
        /\b(venmo|zelle|cash\s*app|paypal)\b/i.test(name) || type === 'Transfer' || type === 'Refund') return null;
    if (type === 'Income') return category.primary === 'INCOME' && /WAGES|PAYROLL/.test(category.detailed || '') ? 'Salary' : null;
    return ({ FOOD_AND_DRINK: 'Food', TRANSPORTATION: 'Transport', TRAVEL: 'Transport',
        ENTERTAINMENT: 'Entertainment', GENERAL_MERCHANDISE: 'Shopping', RENT_AND_UTILITIES: 'Bills' })[category.primary] || null;
}

function bankTransactionFromPlaid(item, accountId, previous, rules = []) {
    const amount = Math.round(Number(item.amount) * 100) / -100;
    const inferredType = amount < 0 ? "Expense" : "Income";
    const keepOverride = previous && previous.typeOverride && !previous.bankTypeRuleId &&
        (previous.type === "Transfer" ||
            (previous.type === "Refund" && amount > 0));
    const name = item.merchant_name || item.name || "Bank transaction";
    const normalized = String(name).trim().toLowerCase().replace(/\s+/g, " ");
    const transferRule = rules.find(candidate => candidate.bankType === "Transfer" &&
        candidate.name === normalized && candidate.type === inferredType &&
        typeof candidate.accountId === "string" && candidate.accountId.length > 0 &&
        candidate.accountId === accountId && amount !== 0);
    const useTransferRule = transferRule && !keepOverride &&
        (!previous || previous.reviewStatus !== "reviewed" || previous.bankTypeRuleId === transferRule.id);
    const type = keepOverride ? previous.type : useTransferRule ? "Transfer" : inferredType;
    const rule = rules.find(candidate => !candidate.bankType && candidate.name === normalized &&
        candidate.type === type);
    const useRule = rule && (!previous || previous.reviewStatus !== "reviewed" ||
        previous.categoryRuleId === rule.id);
    const removedTypeRule = previous && previous.bankTypeRuleId && !useTransferRule;
    const metadata = item.personal_finance_category || previous?.bankCategory || null;
    let automatic = true;
    try { if (typeof loadFlowPlanning === 'function') automatic = loadFlowPlanning().preferences.autoCategories; } catch (_) { automatic = false; }
    const suggestion = automatic ? suggestedBankCategory(name, type, metadata) : null;
    const useBankCategory = suggestion && !useRule && !useTransferRule &&
        (!previous || previous.bankCategoryAuto === true && previous.categoryReason === 'Bank category');

    return {
        id: previous && previous.bankTransactionId === item.transaction_id
            ? previous.id : `bank-${accountId}-${item.transaction_id}`,
        source: "bank",
        accountId: accountId,
        bankTransactionId: item.transaction_id,
        status: item.pending ? "pending" : "posted",
        type: type,
        typeOverride: Boolean(keepOverride || useTransferRule),
        bankTypeRuleId: useTransferRule ? transferRule.id : undefined,
        name: name,
        amount: amount,
        date: item.date,
        category: useRule ? rule.category : useBankCategory ? suggestion : previous ? previous.category
            : (type === "Income" ? "Income" : "Other"),
        notes: previous ? previous.notes : "",
        bankCategory: metadata,
        bankCategoryAuto: Boolean(useBankCategory),
        categoryReason: useRule ? `Rule for ${rule.label || rule.name}` : useBankCategory ? 'Bank category'
            : previous ? previous.categoryReason : "",
        categoryRuleId: useRule ? rule.id : previous ? previous.categoryRuleId : undefined,
        reviewStatus: useRule || useTransferRule || useBankCategory ? "reviewed" : removedTypeRule ? "needs-review"
            : previous ? previous.reviewStatus : "needs-review"
    };
}


function applyBankChanges(transactions, accountId, changes, rules = []) {
    const updated = transactions.slice();
    const original = transactions.slice();
    const removedIds = new Set((changes.removed || []).map(function(item) {
        return item.transaction_id;
    }));
    let addedCount = 0;
    let updatedCount = 0;
    let removedCount = 0;

    for (let index = updated.length - 1; index >= 0; index--) {
        const transaction = updated[index];

        if (transaction.source === "bank" && transaction.accountId === accountId &&
            removedIds.has(transaction.bankTransactionId)) {
            updated.splice(index, 1);
            removedCount++;
        }
    }

    for (const item of [...(changes.added || []), ...(changes.modified || [])]) {
        if (!item.transaction_id || !item.date || !Number.isFinite(Number(item.amount))) {
            continue;
        }

        const index = updated.findIndex(function(transaction) {
            return transaction.source === "bank" &&
                transaction.accountId === accountId &&
                transaction.bankTransactionId === item.transaction_id;
        });

        const previous = index >= 0 ? updated[index] : original.find(function(transaction) {
            return transaction.source === "bank" &&
                transaction.accountId === accountId &&
                transaction.bankTransactionId === item.pending_transaction_id;
        });

        const next = bankTransactionFromPlaid(item, accountId, previous, rules);

        if (index >= 0) {
            updated[index] = next;
            updatedCount++;
        } else {
            if (previous && item.pending_transaction_id) {
                const pendingIndex = updated.findIndex(function(transaction) {
                    return transaction.source === "bank" &&
                        transaction.accountId === accountId &&
                        transaction.bankTransactionId === item.pending_transaction_id;
                });

                if (pendingIndex >= 0) {
                    updated.splice(pendingIndex, 1);
                    removedCount++;
                }
            }

            updated.push(next);
            addedCount++;
        }
    }

    return {
        transactions: updated,
        addedCount: addedCount,
        updatedCount: updatedCount,
        removedCount: removedCount
    };
}


/* match one bank's saved snapshot */

function mergeBankSnapshot(transactions, connectionId, bankItems, rules = []) {
    const oldBankItems = transactions.filter(function(item) {
        return item.source === "bank" && item.bankConnectionId === connectionId;
    });
    const available = new Map();

    for (const item of bankItems) {
        if (!item.transaction_id || !item.account_id || !item.date ||
            !Number.isFinite(Number(item.amount))) {
            continue;
        }

        available.set(item.transaction_id, item);
    }

    const updated = [];

    for (const saved of transactions) {
        if (saved.source !== "bank" || saved.bankConnectionId !== connectionId) {
            updated.push(saved);
            continue;
        }

        const item = available.get(saved.bankTransactionId);

        if (item) {
            const next = bankTransactionFromPlaid(item, item.account_id, saved, rules);
            next.bankConnectionId = connectionId;
            updated.push(next);
            available.delete(item.transaction_id);
        }
    }

    for (const item of available.values()) {
        const previous = oldBankItems.find(function(saved) {
            return saved.accountId === item.account_id &&
                saved.bankTransactionId === item.pending_transaction_id;
        });
        const next = bankTransactionFromPlaid(item, item.account_id, previous, rules);

        next.id = `bank-${connectionId}-${item.transaction_id}`;
        next.bankConnectionId = connectionId;
        updated.push(next);
    }

    return updated;
}
