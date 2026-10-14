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


const budgets = loadBudgets();


/* calculate totals */

const currentMonth = getCurrentMonth();
const today = new Date();
const daysInMonth = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0
).getDate();

const weeklySpending = Array(Math.ceil(daysInMonth / 7)).fill(0);
const categorySpending = {};

let totalIncome = 0;
let totalSpending = 0;
let monthlyIncome = 0;
let monthlySpending = 0;


for (const transaction of transactions) {

    const isThisMonth = transaction.date &&
        transaction.date.slice(0, 7) === currentMonth;

    if (transaction.amount > 0) {

        totalIncome += transaction.amount;

        if (isThisMonth) {
            monthlyIncome += transaction.amount;
        }

    }

    if (transaction.amount < 0) {

        const amount = Math.abs(transaction.amount);

        totalSpending += amount;

        if (isThisMonth) {

            monthlySpending += amount;

            const category = transaction.category || "Other";
            categorySpending[category] =
                (categorySpending[category] || 0) + amount;

            const day = Number(transaction.date.slice(8, 10));

            if (day >= 1 && day <= daysInMonth) {
                const week = Math.floor((day - 1) / 7);
                weeklySpending[week] += amount;
            }

        }

    }

}


const totalBalance = totalIncome - totalSpending;

const monthlyIncomeText = document.querySelector("#monthly-income");
const monthlySpendingText = document.querySelector("#monthly-spending");
const totalBalanceText = document.querySelector("#total-balance");
const currentMonthLabel = document.querySelector("#current-month-label");

monthlyIncomeText.textContent = `$${monthlyIncome.toFixed(2)}`;
monthlySpendingText.textContent = `$${monthlySpending.toFixed(2)}`;
totalBalanceText.textContent = `$${totalBalance.toFixed(2)}`;
currentMonthLabel.textContent = today.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
});

let remainingBudget = 0;

for (const budget of budgets) {

    const spent = getBudgetSpending(budget.category, transactions);
    const amountLeft = budget.limit - spent;

    if (amountLeft > 0) {
        remainingBudget += amountLeft;
    }

}

const safeToSpend = totalBalance - remainingBudget;

const safeToSpendText = document.querySelector("#safe-to-spend");

safeToSpendText.textContent = `$${safeToSpend.toFixed(2)}`;


/* show spending charts */

const spendingChart = document.querySelector("#spending-chart");
const chartEmpty = document.querySelector("#spending-chart-empty");
const chartValues = document.querySelector("#chart-values");
const spendingBars = document.querySelector("#spending-bars");
const categoryDonut = document.querySelector("#category-donut");
const categoryTotal = document.querySelector("#category-total");
const categoryList = document.querySelector("#category-list");

categoryTotal.textContent = `$${monthlySpending.toFixed(2)}`;


if (monthlySpending === 0) {

    spendingChart.hidden = true;
    chartEmpty.hidden = false;

    const emptyCategory = document.createElement("p");
    emptyCategory.classList.add("budget-empty");
    emptyCategory.textContent = "No dated expenses this month.";
    categoryList.appendChild(emptyCategory);

} else {

    const largestWeek = Math.max(...weeklySpending);
    const chartMaximum = Math.max(10, Math.ceil(largestWeek / 10) * 10);

    for (let level = 3; level >= 0; level--) {

        const value = document.createElement("span");
        value.textContent = `$${((chartMaximum * level) / 3).toFixed(0)}`;
        chartValues.appendChild(value);

    }

    for (let week = 0; week < weeklySpending.length; week++) {

        const startDay = week * 7 + 1;
        const endDay = Math.min(startDay + 6, daysInMonth);

        const group = document.createElement("div");
        group.classList.add("bar-group");

        const bar = document.createElement("div");
        bar.classList.add("bar");
        bar.style.height =
            `${(weeklySpending[week] / chartMaximum) * 100}%`;
        bar.setAttribute(
            "title",
            `$${weeklySpending[week].toFixed(2)} spent on days ${startDay}-${endDay}`
        );

        const label = document.createElement("span");
        label.textContent = `${startDay}-${endDay}`;

        group.appendChild(bar);
        group.appendChild(label);
        spendingBars.appendChild(group);

    }


    const categoryColors = {
        Food: "var(--green)",
        Transport: "var(--orange)",
        Shopping: "var(--purple)",
        Entertainment: "var(--pink)",
        Bills: "var(--blue)"
    };

    const categories = Object.keys(categorySpending).sort(function(first, second) {
        return categorySpending[second] - categorySpending[first];
    });

    const segments = [];
    let startPercent = 0;

    for (const category of categories) {

        const spent = categorySpending[category];
        const percentage = (spent / monthlySpending) * 100;
        const endPercent = startPercent + percentage;
        const color = categoryColors[category] || "#cbd5e1";

        segments.push(
            `${color} ${startPercent.toFixed(2)}% ${endPercent.toFixed(2)}%`
        );

        const row = document.createElement("div");
        row.classList.add("category-row");

        const categoryName = document.createElement("div");
        const dot = document.createElement("span");
        dot.classList.add("dot");
        dot.style.background = color;

        const name = document.createElement("span");
        name.textContent = category;

        categoryName.appendChild(dot);
        categoryName.appendChild(name);

        const amount = document.createElement("strong");
        amount.textContent =
            `$${spent.toFixed(2)} (${percentage.toFixed(0)}%)`;

        row.appendChild(categoryName);
        row.appendChild(amount);
        categoryList.appendChild(row);

        startPercent = endPercent;

    }

    categoryDonut.style.background =
        `conic-gradient(${segments.join(", ")})`;

}


const recentTransactions = document.querySelector("#recent-transactions");

const recentTransactionsToShow = [...transactions].reverse();

recentTransactionsToShow.sort(function(first, second) {

    const firstDate = first.date || "";
    const secondDate = second.date || "";

    if (firstDate && !secondDate) {
        return -1;
    }

    if (!firstDate && secondDate) {
        return 1;
    }

    return secondDate.localeCompare(firstDate);

});


if (recentTransactionsToShow.length === 0) {

    const emptyMessage = document.createElement("p");
    emptyMessage.classList.add("budget-empty");
    emptyMessage.textContent = "No transactions yet.";
    recentTransactions.appendChild(emptyMessage);

}


for (const transaction of recentTransactionsToShow.slice(0, 5)) {

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

    if (
        transaction.category === "Income" ||
        transaction.category === "Salary"
    ) {
        icon = "banknote";
        iconColor = "blue-icon";
    }

    if (transaction.category === "Transport") {
        icon = "fuel";
        iconColor = "orange-icon";
    }


    const row = document.createElement("div");
    row.classList.add("transaction-row");

    const left = document.createElement("div");
    left.classList.add("transaction-left");

    const iconBox = document.createElement("div");
    iconBox.classList.add("merchant-icon", iconColor);
    iconBox.innerHTML = `<i data-lucide="${icon}"></i>`;

    const details = document.createElement("div");

    const name = document.createElement("strong");
    name.textContent = transaction.name;

    const category = document.createElement("span");
    category.textContent = transaction.category || "Uncategorized";

    details.appendChild(name);
    details.appendChild(category);

    left.appendChild(iconBox);
    left.appendChild(details);


    const right = document.createElement("div");
    right.classList.add("transaction-right");

    const amount = document.createElement("strong");

    if (transaction.amount > 0) {
        amount.textContent = `+$${transaction.amount.toFixed(2)}`;
        amount.classList.add("income-text");
    } else {
        amount.textContent =
            `-$${Math.abs(transaction.amount).toFixed(2)}`;
    }

    const date = document.createElement("span");
    date.textContent = transaction.date || "No date";

    right.appendChild(amount);
    right.appendChild(date);

    row.appendChild(left);
    row.appendChild(right);

    recentTransactions.appendChild(row);

}


const budgetList = document.querySelector("#budget-list");

if (budgets.length === 0) {
    budgetList.innerHTML =
        '<p class="budget-empty">No budgets yet. Add one on the Budgets page.</p>';
}

for (const budget of budgets) {

    const spent = getBudgetSpending(budget.category, transactions);
    const percentage = (spent / budget.limit) * 100;
    const barWidth = Math.min(percentage, 100);
    const barColor = spent > budget.limit ? "over-budget" : "";

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
                        class="progress-fill ${barColor}"
                        style="width: ${barWidth}%"
                    ></div>
                </div>

                <strong>${percentage.toFixed(0)}%</strong>

            </div>

        </div>
    `;
}


lucide.createIcons();