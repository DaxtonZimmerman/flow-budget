/* shared budget data */

function loadBudgets(month) {

    const savedMonths = localStorage.getItem("budgetsByMonth");
    const budgetsByMonth = JSON.parse(savedMonths) || {};

    if (budgetsByMonth[month]) {
        const budgets = budgetsByMonth[month];

        if (addMissingIds(budgets)) {
            localStorage.setItem("budgetsByMonth", JSON.stringify(budgetsByMonth));
        }

        return budgets;
    }

    const savedBudgets = localStorage.getItem("budgets");

    if (savedBudgets !== null) {
        const budgets = JSON.parse(savedBudgets) || [];

        if (addMissingIds(budgets)) {
            localStorage.setItem("budgets", JSON.stringify(budgets));
        }

        return budgets;
    }

    localStorage.setItem("budgets", "[]");

    return [];

}


function saveBudgets(month, budgets) {

    const savedMonths = localStorage.getItem("budgetsByMonth");
    const budgetsByMonth = JSON.parse(savedMonths) || {};

    budgetsByMonth[month] = budgets;

    localStorage.setItem("budgetsByMonth", JSON.stringify(budgetsByMonth));

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

    let spentCents = 0;
    const seenIds = new Set();

    for (const transaction of transactions) {

        if (
            transaction.category === category &&
            transaction.date &&
            transaction.date.slice(0, 7) === month &&
            transaction.status !== "pending" &&
            transaction.type !== "Transfer"
        ) {
            const id = String(transaction.id);

            if (transaction.id !== undefined && seenIds.has(id)) {
                continue;
            }

            seenIds.add(id);

            if (transaction.type === "Refund") {
                spentCents -= moneyToCents(transaction.amount);
            } else if (transaction.amount < 0) {
                spentCents += Math.abs(moneyToCents(transaction.amount));
            }
        }

    }

    return centsToMoney(spentCents);

}
