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


function getBudgetSpending(category, transactions) {

    const currentMonth = getCurrentMonth();

    let spent = 0;

    for (const transaction of transactions) {

        if (
            transaction.category === category &&
            transaction.amount < 0 &&
            transaction.date &&
            transaction.date.slice(0, 7) === currentMonth
        ) {
            spent += Math.abs(transaction.amount);
        }

    }

    return spent;

}
