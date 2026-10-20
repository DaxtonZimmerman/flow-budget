/* One-transaction edits never create or update a remembered rule. */
function transactionWithDetails(current, values, opened) {
    if (!current || !opened || String(current.id) !== String(opened.id)) {
        throw new Error("This transaction is no longer available. Close this window and refresh your activity.");
    }
    for (const key of ["amount", "date", "name", "type", "category", "source", "accountId", "status", "notes", "categoryRuleId", "bankTypeRuleId"]) {
        if ((current[key] ?? "") !== (opened[key] ?? "")) {
            throw new Error("This transaction changed while it was open. Reopen it to see the latest details.");
        }
    }
    if (JSON.stringify(current.transferPair) !== JSON.stringify(opened.transferPair)) throw new Error("This transfer match changed. Reopen it to see the latest details.");
    for (const key of ['allocations', 'relatedExpense', 'cardPayment']) if (JSON.stringify(current[key]) !== JSON.stringify(opened[key])) throw new Error('The payment details changed. Reopen this transaction.');
    if (current.cardPayment && values.type !== current.type) throw new Error('Undo the card payment link before changing its type.');
    if (current.allocations?.length && values.type !== current.type) throw new Error('Remove the split before changing the payment type.');
    if (current.transferPair && values.type !== current.type) throw new Error("Undo the transfer match before changing its type.");
    const inferredType = current.amount < 0 ? "Expense" : "Income";
    const allowed = current.source === "bank"
        ? current.amount < 0 ? ["Expense", "Transfer"] : current.amount > 0
            ? ["Income", "Refund", "Transfer"] : ["Income", "Transfer"]
        : [current.type || inferredType];
    if (!allowed.includes(values.type)) throw new Error("Choose a type that matches this transaction.");
    if (typeof values.notes !== "string") throw new Error("Enter a valid note.");
    if (typeof values.category !== "string" || !values.category.trim()) {
        throw new Error("Choose a category for this transaction.");
    }
    const date = current.source === "bank" ? current.date : values.date;
    const dateTime = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? Date.parse(`${date}T12:00:00Z`) : NaN;
    if (!Number.isFinite(dateTime) || new Date(dateTime).toISOString().slice(0, 10) !== date) {
        throw new Error("Choose a valid date for this transaction.");
    }
    const updated = { ...current, type: values.type, date: date,
        category: values.type === "Transfer" ? current.category || "Other" : values.category.trim(),
        notes: values.notes.trim(), categoryReason: "Chosen by you",
        categoryRuleId: undefined, bankCategoryAuto: false, reviewStatus: "reviewed" };
    if (current.source === "bank") {
        updated.typeOverride = values.type !== inferredType;
        updated.bankTypeRuleId = values.type === current.type ? current.bankTypeRuleId : undefined;
    }
    delete updated.transferMatchIssue;
    return updated;
}

function transactionsForReviewGroup(transactions, group) {
    const first = group.items[0];
    return transactions.filter(item => (item.source || "manual") === (first.source || "manual") &&
        (item.amount < 0) === (first.amount < 0) &&
        normalizedName(item.name) === normalizedName(first.name))
        .slice().sort((first, second) => (second.date || "").localeCompare(first.date || ""));
}
