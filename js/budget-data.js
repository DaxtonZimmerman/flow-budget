var flowStorage = typeof flowStorage !== 'undefined' ? flowStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
/* shared budget data */

function loadBudgets(month) {

    const savedMonths = flowStorage.getItem("budgetsByMonth");
    const budgetsByMonth = JSON.parse(savedMonths) || {};

    if (budgetsByMonth[month]) {
        const budgets = budgetsByMonth[month];

        if (addMissingIds(budgets)) {
            flowStorage.setItem("budgetsByMonth", JSON.stringify(budgetsByMonth));

            if (typeof flowDataChanged === "function") flowDataChanged();
        }

        return budgets;
    }

    const savedBudgets = flowStorage.getItem("budgets");

    if (savedBudgets !== null) {
        const budgets = JSON.parse(savedBudgets) || [];

        if (addMissingIds(budgets)) {
            flowStorage.setItem("budgets", JSON.stringify(budgets));

            if (typeof flowDataChanged === "function") flowDataChanged();
        }

        return budgets;
    }

    flowStorage.setItem("budgets", "[]");

    return [];

}


function saveBudgets(month, budgets) {

    const savedMonths = flowStorage.getItem("budgetsByMonth");
    const budgetsByMonth = JSON.parse(savedMonths) || {};

    budgetsByMonth[month] = budgets;

    flowStorage.setItem("budgetsByMonth", JSON.stringify(budgetsByMonth));
    if (typeof flowDataChanged === "function") flowDataChanged();
    if (typeof document !== 'undefined') document.dispatchEvent(new Event('flow-budgets-updated'));

}


function getCurrentMonth() {

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");

    return `${year}-${month}`;

}


function getSelectedMonth() {

    const month = new URLSearchParams(window.location.search).get("month");

    if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        return month;
    }

    return getCurrentMonth();

}


function getBudgetSpending(category, transactions, month) {
    let cents = 0; const seen = new Set();
    for (const t of transactions) {
        if (!t.date || t.date.slice(0, 7) !== month || t.status === 'pending' || t.type === 'Transfer' || t.id !== undefined && seen.has(String(t.id))) continue;
        if (t.id !== undefined) seen.add(String(t.id));
        if (t.type !== 'Refund' && t.amount >= 0) continue;
        const parts = typeof flowTransactionParts === 'function' ? flowTransactionParts(t) : [{ category: t.category || 'Other', cents: Math.abs(moneyToCents(t.amount)) }];
        for (const part of parts) if (!part.income && part.category === category) cents += (t.type === 'Refund' ? -1 : 1) * part.cents;
    }
    return centsToMoney(cents);
}
