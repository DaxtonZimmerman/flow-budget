/* shared budget data */

const defaultBudgets = [
    { category: "Food", limit: 500 },
    { category: "Transport", limit: 300 },
    { category: "Entertainment", limit: 200 },
    { category: "Shopping", limit: 400 }
];


function loadBudgets() {

    const savedBudgets = localStorage.getItem("budgets");

    if (savedBudgets !== null) {
        return JSON.parse(savedBudgets) || [];
    }

    localStorage.setItem("budgets", JSON.stringify(defaultBudgets));

    return defaultBudgets;

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
