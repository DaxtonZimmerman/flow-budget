lucide.createIcons();

const savedTransactions = localStorage.getItem("transactions");

let transactions;

if (savedTransactions) {

    transactions = JSON.parse(savedTransactions);

} else {

    transactions = [
        {
            name: "Chick-fil-A",
            category: "Food",
            amount: -12.45
        },
        {
            name: "Spotify",
            category: "Entertainment",
            amount: -10.99
        },
        {
            name: "Direct deposit",
            category: "Income",
            amount: 2500
        },
        {
            name: "Maverik",
            category: "Transport",
            amount: -45.12
        }
    ];

    localStorage.setItem(
        "transactions",
        JSON.stringify(transactions)
    );

}

const budgets = [
    {
        category: "Food",
        limit: 500
    },
    {
        category: "Transport",
        limit: 300
    },
    {
        category: "Entertainment",
        limit: 200
    },
    {
        category: "Shopping",
        limit: 400
    }
];

console.log(transactions);
console.log(budgets);


let monthlyIncome = 0;

for (const transaction of transactions) {

    if (transaction.amount > 0) {
        monthlyIncome += transaction.amount;
    }

}

const monthlyIncomeText = document.querySelector("#monthly-income");

monthlyIncomeText.textContent = `$${monthlyIncome.toFixed(2)}`;


let monthlySpending = 0;

for (const transaction of transactions) {

    if (transaction.amount < 0) {
        monthlySpending += Math.abs(transaction.amount);
    }

}

const monthlySpendingText = document.querySelector("#monthly-spending");

monthlySpendingText.textContent = `$${monthlySpending.toFixed(2)}`;


const totalBalance = monthlyIncome - monthlySpending;

const totalBalanceText = document.querySelector("#total-balance");

totalBalanceText.textContent = `$${totalBalance.toFixed(2)}`;

let remainingBudget = 0;

for (const budget of budgets) {

    let spent = 0;

    for (const transaction of transactions) {

        if (
            transaction.category === budget.category &&
            transaction.amount < 0
        ) {
            spent += Math.abs(transaction.amount);
        }

    }

    const amountLeft = budget.limit - spent;

    if (amountLeft > 0) {
        remainingBudget += amountLeft;
    }

}

const safeToSpend = totalBalance - remainingBudget;

const safeToSpendText = document.querySelector("#safe-to-spend");

safeToSpendText.textContent = `$${safeToSpend.toFixed(2)}`;


const recentTransactions = document.querySelector("#recent-transactions");

for (const transaction of transactions) {

    let icon = "receipt";
    let iconColor = "blue-icon";

    if (transaction.category === "Food") {
        icon = "utensils";
        iconColor = "red-icon";
    }

    if (transaction.category === "Entertainment") {
        icon = "music";
        iconColor = "green-icon";
    }

    if (transaction.category === "Income") {
        icon = "banknote";
        iconColor = "blue-icon";
    }

    if (transaction.category === "Transport") {
        icon = "fuel";
        iconColor = "orange-icon";
    }


    let amountText = `$${Math.abs(transaction.amount).toFixed(2)}`;

    if (transaction.amount > 0) {
        amountText = `+$${transaction.amount.toFixed(2)}`;
    }

    if (transaction.amount < 0) {
        amountText = `-$${Math.abs(transaction.amount).toFixed(2)}`;
    }


    recentTransactions.innerHTML += `
        <div class="transaction-row">

            <div class="transaction-left">

                <div class="merchant-icon ${iconColor}">
                    <i data-lucide="${icon}"></i>
                </div>

                <div>
                    <strong>${transaction.name}</strong>
                    <span>${transaction.category}</span>
                </div>

            </div>

            <div class="transaction-right">
                <strong>${amountText}</strong>
            </div>

        </div>
    `;
}


const budgetList = document.querySelector("#budget-list");

for (const budget of budgets) {

    let spent = 0;

    for (const transaction of transactions) {

        if (
            transaction.category === budget.category &&
            transaction.amount < 0
        ) {
            spent += Math.abs(transaction.amount);
        }

    }

    const percentage = (spent / budget.limit) * 100;

    budgetList.innerHTML += `
        <div class="budget-row">

            <div class="budget-info">
                <strong>${budget.category}</strong>
                <span>
                    $${spent.toFixed(2)} / $${budget.limit.toFixed(2)}
                </span>
            </div>

            <div class="budget-progress">

                <div class="progress-bar">
                    <div
                        class="progress-fill"
                        style="width: ${percentage}%"
                    ></div>
                </div>

                <strong>${percentage.toFixed(0)}%</strong>

            </div>

        </div>
    `;
}


lucide.createIcons();