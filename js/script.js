lucide.createIcons();

const transactions = [
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

console.log(transactions);

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