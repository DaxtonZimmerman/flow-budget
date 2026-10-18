if (typeof lucide !== "undefined") {
    lucide.createIcons();
}

const transactions = loadTransactions();

document.querySelector("#start-options").hidden = transactions.length > 0;


const selectedMonth = getSelectedMonth();
const budgets = loadBudgets(selectedMonth);

document.querySelector(".nav-link.active").href =
    `index.html?month=${selectedMonth}`;


/* calculate totals */
const selectedYear = Number(selectedMonth.slice(0, 4));
const selectedMonthNumber = Number(selectedMonth.slice(5, 7));
const daysInMonth = new Date(selectedYear, selectedMonthNumber, 0).getDate();

const formatMoney = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const monthlyTotals = getMoneyTotals(transactions, selectedMonth);
const breakdown = getSpendingBreakdown(transactions, selectedMonth, daysInMonth);
const weeklySpending = breakdown.weeklySpending;
const categorySpending = breakdown.categorySpending;
const monthlyIncome = monthlyTotals.income;
const monthlySpending = monthlyTotals.spending;
const totalBalance = monthlyTotals.net;

const monthlyIncomeText = document.querySelector("#monthly-income");
const monthlySpendingText = document.querySelector("#monthly-spending");
const totalBalanceText = document.querySelector("#total-balance");
const dashboardMonth = document.querySelector("#dashboard-month");
const chartMonthLabel = document.querySelector("#chart-month-label");
const monthName = new Date(selectedYear, selectedMonthNumber - 1, 1)
    .toLocaleDateString("en-US", { month: "long", year: "numeric" });

monthlyIncomeText.textContent = formatMoney(monthlyIncome);
monthlySpendingText.textContent = formatMoney(monthlySpending);
totalBalanceText.textContent = formatMoney(totalBalance);
const priorMonthDate = new Date(selectedYear, selectedMonthNumber - 2, 1);
const priorMonth = `${priorMonthDate.getFullYear()}-${String(priorMonthDate.getMonth() + 1).padStart(2, "0")}`;
const priorItems = transactions.filter(item => item.date?.startsWith(priorMonth));
if (priorItems.length) {
    document.querySelector("#spending-comparison").textContent = `Last month: ${formatMoney(getMoneyTotals(priorItems).spending)}`;
}
dashboardMonth.value = selectedMonth;
chartMonthLabel.textContent = monthName;

dashboardMonth.addEventListener("change", function() {
    if (dashboardMonth.value) {
        window.location.href = `index.html?month=${dashboardMonth.value}`;
    }
});

for (const link of document.querySelectorAll('a[href="budgets.html"]')) {
    link.href = `budgets.html?month=${selectedMonth}`;
}

for (const link of document.querySelectorAll('a[href="transactions.html"]')) {
    link.href = `transactions.html?month=${selectedMonth}`;
}

document.querySelector("#search-month").value = selectedMonth;
document.querySelector('a[href="add-transaction.html"]').href =
    `add-transaction.html?from=dashboard&month=${selectedMonth}`;

let remainingBudgetCents = 0;

for (const budget of budgets) {

    const spent = getBudgetSpending(budget.category, transactions, selectedMonth);
    const amountLeft = moneyToCents(budget.limit) - moneyToCents(spent);

    if (amountLeft > 0) {
        remainingBudgetCents += amountLeft;
    }

}

const budgetRoomText = document.querySelector("#budget-room");
const budgetRoomNote = document.querySelector("#budget-room-note");

if (budgets.length === 0) {
    budgetRoomText.textContent = "Let’s make a plan";
    budgetRoomNote.textContent =
        "Set a few category limits. You can start small.";
} else {
    budgetRoomText.textContent = formatMoney(centsToMoney(remainingBudgetCents));
    budgetRoomNote.textContent = "Left across your category limits. This is your plan, not your bank balance.";
    document.querySelector("#budget-room-label").textContent = "Left in your category limits";
    const limitCents = budgets.reduce((sum, item) => sum + moneyToCents(item.limit), 0);
    const spentCents = budgets.reduce((sum, item) => sum + moneyToCents(getBudgetSpending(item.category, transactions, selectedMonth)), 0);
    const used = limitCents > 0 ? Math.max(0, Math.round(spentCents / limitCents * 100)) : 0;
    document.querySelector("#plan-ring-icon").setAttribute("hidden", "");
    document.querySelector("#plan-ring-percent").textContent = `${used}%`;
    document.querySelector("#plan-ring-caption").textContent = "of limits used";
    document.querySelector("#plan-ring").style.background = `conic-gradient(${used > 100 ? "var(--red)" : "#9eb780"} 0% ${Math.min(100, used)}%, #edf2e7 ${Math.min(100, used)}% 100%)`;
    document.querySelector("#plan-cta").firstChild.textContent = "View my plan ";
}


/* show what needs a look */

const attentionList = document.querySelector("#attention-list");
const overBudgetCategories = [];
const reviewCount = transactions.filter(needsTransactionReview).length;
const reviewToday = new Date();
const reviewDate = `${reviewToday.getFullYear()}-${String(reviewToday.getMonth() + 1).padStart(2, "0")}-${String(reviewToday.getDate()).padStart(2, "0")}`;
const monthlySuggestions = recurringSuggestions(transactions, loadRecurringItems(),
    reviewDate);

for (const budget of budgets) {
    const spent = getBudgetSpending(budget.category, transactions, selectedMonth);

    if (spent > budget.limit) {
        overBudgetCategories.push(budget.category);
    }
}

function addAttention(title, description, page) {
    const link = document.createElement("a");
    link.classList.add("attention-item");
    link.href = page;

    const text = document.createElement("span");
    const heading = document.createElement("strong");
    const detail = document.createElement("small");

    heading.textContent = title;
    detail.textContent = description;

    text.appendChild(heading);
    text.appendChild(detail);
    link.appendChild(text);

    const arrow = document.createElement("span");
    arrow.classList.add("attention-arrow");
    arrow.textContent = "↗";
    link.appendChild(arrow);

    attentionList.appendChild(link);
}

if (budgets.length === 0) {
    addAttention(
        "Set your first budget",
        "Start with one category. You can add more any time.",
        `budgets.html?month=${selectedMonth}`
    );
}

if (transactions.length === 0) {
    addAttention(
        "Start with a transaction",
        "Add one expense or income entry to see your own numbers here.",
        `add-transaction.html?from=dashboard&month=${selectedMonth}`
    );
}

if (overBudgetCategories.length > 0) {
    addAttention(
        "Budget over its limit",
        overBudgetCategories.join(", "),
        `budgets.html?month=${selectedMonth}`
    );
}

if (reviewCount > 0) {
    addAttention(
        `${reviewCount} transaction${reviewCount === 1 ? "" : "s"} need review`,
        "Sort repeated names together in quick review.",
        "review.html?quick=1"
    );
}

if (monthlySuggestions.length > 0) {
    addAttention(
        `${monthlySuggestions.length} possible monthly item${monthlySuggestions.length === 1 ? "" : "s"}`,
        "Confirm recurring payments you want to track.",
        "review.html"
    );
}

if (attentionList.children.length === 0) {
    const clearMessage = document.createElement("p");
    clearMessage.classList.add("attention-clear");
    clearMessage.textContent = "Nothing needs a look right now.";
    attentionList.appendChild(clearMessage);
}


/* show spending charts */

const spendingChart = document.querySelector("#spending-chart");
const chartEmpty = document.querySelector("#spending-chart-empty");
const chartValues = document.querySelector("#chart-values");
const spendingBars = document.querySelector("#spending-bars");
const categoryDonut = document.querySelector("#category-donut");
const categoryTotal = document.querySelector("#category-total");
const categoryList = document.querySelector("#category-list");

categoryTotal.textContent = formatMoney(monthlySpending);


if (monthlySpending <= 0) {

    spendingChart.hidden = true;
    chartEmpty.hidden = false;

    const emptyCategory = document.createElement("p");
    emptyCategory.classList.add("budget-empty");
    emptyCategory.textContent = "No dated expenses for this month.";
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

const recentTransactionsToShow = transactions.filter(item => item.date?.startsWith(selectedMonth)).reverse();

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
    emptyMessage.textContent = "No activity in this month yet.";
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


    if (transaction.type === "Transfer") { icon = "arrow-left-right"; iconColor = "blue-icon"; }
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
    category.textContent = transaction.type === "Transfer" ? "Transfer" : transaction.type === "Refund" ? `Refund · ${transaction.category || "Other"}` : transaction.category || "Uncategorized";

    details.appendChild(name);
    details.appendChild(category);

    left.appendChild(iconBox);
    left.appendChild(details);


    const right = document.createElement("div");
    right.classList.add("transaction-right");

    const amount = document.createElement("strong");

    if (transaction.amount > 0) {
        amount.textContent = `+$${transaction.amount.toFixed(2)}`;
        if (transaction.type !== "Transfer") amount.classList.add("income-text");
    } else {
        amount.textContent =
            `-$${Math.abs(transaction.amount).toFixed(2)}`;
    }

    const date = document.createElement("span");
    date.textContent = transaction.date ? new Date(`${transaction.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No date";

    right.appendChild(amount);
    right.appendChild(date);

    row.appendChild(left);
    row.appendChild(right);

    recentTransactions.appendChild(row);

}


const budgetList = document.querySelector("#budget-list");

if (budgets.length === 0) {
    const emptyBudget = document.createElement("p");
    emptyBudget.classList.add("budget-empty");
    emptyBudget.textContent = "Your plan starts small. Add your first category to see its progress here.";
    budgetList.appendChild(emptyBudget);
}

for (const budget of budgets) {

    const spent = getBudgetSpending(budget.category, transactions, selectedMonth);
    const percentage = (spent / budget.limit) * 100;
    const barWidth = Math.max(0, Math.min(percentage, 100));
    const row = document.createElement("div");
    row.classList.add("budget-row");

    const info = document.createElement("div");
    info.classList.add("budget-info");

    const category = document.createElement("strong");
    category.textContent = budget.category;

    const amounts = document.createElement("span");
    amounts.textContent = `$${spent.toFixed(2)} / $${budget.limit.toFixed(2)}`;

    info.appendChild(category);
    info.appendChild(amounts);

    const progress = document.createElement("div");
    progress.classList.add("budget-progress");

    const bar = document.createElement("div");
    bar.classList.add("progress-bar");

    const fill = document.createElement("div");
    fill.classList.add("progress-fill");
    fill.style.width = `${barWidth}%`;

    if (spent > budget.limit) {
        fill.classList.add("over-budget");
    }

    bar.appendChild(fill);

    const percent = document.createElement("strong");
    percent.textContent = `${percentage.toFixed(0)}%`;

    progress.appendChild(bar);
    progress.appendChild(percent);
    row.appendChild(info);
    row.appendChild(progress);
    budgetList.appendChild(row);
}


if (typeof lucide !== "undefined") {
    lucide.createIcons();
}
