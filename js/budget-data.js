/* shared budget data */

function loadBudgets(month) {

    const savedMonths = localStorage.getItem("budgetsByMonth");
    const budgetsByMonth = JSON.parse(savedMonths) || {};

    if (budgetsByMonth[month]) {
        return budgetsByMonth[month];
    }

    const savedBudgets = localStorage.getItem("budgets");

    if (savedBudgets !== null) {
        return JSON.parse(savedBudgets) || [];
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

    let spent = 0;

    for (const transaction of transactions) {

        if (
            transaction.category === category &&
            transaction.amount < 0 &&
            transaction.date &&
            transaction.date.slice(0, 7) === month
        ) {
            spent += Math.abs(transaction.amount);
        }

    }

    return spent;

}
