lucide.createIcons();


const savedTransactions = localStorage.getItem("transactions");

let transactions = JSON.parse(savedTransactions) || [];


/* give old transactions an id */

let nextId = Date.now();

for (const transaction of transactions) {

    if (!transaction.id) {

        while (transactions.some(item => item.id === nextId)) {
            nextId++;
        }

        transaction.id = nextId;
        nextId++;

    }

}

localStorage.setItem("transactions", JSON.stringify(transactions));


const transactionHistory = document.querySelector("#transaction-history");

const transactionCount = document.querySelector("#transaction-count");

const emptyTransactions = document.querySelector("#empty-transactions");

const historyIncome = document.querySelector("#history-income");

const historyExpenses = document.querySelector("#history-expenses");

const historyBalance = document.querySelector("#history-balance");

const historySearch = document.querySelector("#history-search");
const pageParameters = new URLSearchParams(window.location.search);
const dashboardSearch = pageParameters.get("search");
const monthFromPage = pageParameters.get("month");
const selectedMonth = monthFromPage && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthFromPage)
    ? monthFromPage
    : "";

const historyMonth = document.querySelector("#history-month");
const allMonthsButton = document.querySelector("#all-months-button");
const historyTitle = document.querySelector("#history-title");

historyMonth.value = selectedMonth;
allMonthsButton.hidden = selectedMonth === "";

let addTransactionLink = "add-transaction.html?from=transactions";

if (selectedMonth) {
    addTransactionLink += `&month=${selectedMonth}`;
}

for (const link of document.querySelectorAll('a[href="add-transaction.html"]')) {
    link.href = addTransactionLink;
}

if (selectedMonth) {
    const year = Number(selectedMonth.slice(0, 4));
    const month = Number(selectedMonth.slice(5, 7));
    const monthName = new Date(year, month - 1, 1)
        .toLocaleDateString("en-US", { month: "long", year: "numeric" });

    historyTitle.textContent = `${monthName} transactions`;
    document.querySelector("#history-dashboard-link").href =
        `index.html?month=${selectedMonth}`;
    document.querySelector("#history-budgets-link").href =
        `budgets.html?month=${selectedMonth}`;
}

historyMonth.addEventListener("change", function() {
    const url = new URL(window.location.href);

    if (historyMonth.value) {
        url.searchParams.set("month", historyMonth.value);
    } else {
        url.searchParams.delete("month");
    }

    window.location.href = url.href;
});

allMonthsButton.addEventListener("click", function() {
    const url = new URL(window.location.href);
    url.searchParams.delete("month");
    window.location.href = url.href;
});

if (dashboardSearch) {
    historySearch.value = dashboardSearch;
}

const historyTypeFilter = document.querySelector("#history-type-filter");
const historyCategoryFilter = document.querySelector("#history-category-filter");
const historySort = document.querySelector("#history-sort");
const noMatchingTransactions = document.querySelector("#no-matching-transactions");

const transactionRows = [];


/* fill category filter */

const categories = [];

for (const transaction of transactions) {

    if (transaction.category && !categories.includes(transaction.category)) {
        categories.push(transaction.category);
    }

}

categories.sort();

for (const category of categories) {

    const option = document.createElement("option");

    option.value = category;
    option.textContent = category;

    historyCategoryFilter.appendChild(option);

}


let totalIncome = 0;
let totalExpenses = 0;


for (const transaction of transactions) {

    if (selectedMonth && (!transaction.date ||
        transaction.date.slice(0, 7) !== selectedMonth)) {
        continue;
    }

    if (transaction.amount > 0) {
        totalIncome += transaction.amount;
    }

    if (transaction.amount < 0) {
        totalExpenses += Math.abs(transaction.amount);
    }

}


const balance = totalIncome - totalExpenses;


historyIncome.textContent = `$${totalIncome.toFixed(2)}`;

historyExpenses.textContent = `$${totalExpenses.toFixed(2)}`;

historyBalance.textContent = `$${balance.toFixed(2)}`;


transactionCount.textContent =
    `${transactions.length} ${transactions.length === 1 ? "transaction" : "transactions"}`;


if (transactions.length === 0) {

    emptyTransactions.hidden = false;

} else {

    const newestTransactions = [...transactions].reverse();


    for (const transaction of newestTransactions) {

        const transactionRow = document.createElement("div");

        transactionRow.classList.add("history-row");


        const transactionName = document.createElement("div");

        transactionName.classList.add("history-name");


        const iconBox = document.createElement("div");

        iconBox.classList.add("merchant-icon");


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

        if (transaction.category === "Shopping") {
            icon = "shopping-bag";
            iconColor = "blue-icon";
        }

        if (transaction.category === "Bills") {
            icon = "file-text";
            iconColor = "orange-icon";
        }


        iconBox.classList.add(iconColor);

        iconBox.innerHTML = `<i data-lucide="${icon}"></i>`;


        const nameText = document.createElement("strong");

        nameText.textContent = transaction.name;


        transactionName.appendChild(iconBox);

        transactionName.appendChild(nameText);


        const categoryText = document.createElement("span");

        categoryText.textContent = transaction.category;


        const dateText = document.createElement("span");

        dateText.textContent = transaction.date || "No date";


        const notesText = document.createElement("span");

        notesText.textContent = transaction.notes || "No notes";


        const amountText = document.createElement("strong");

        amountText.classList.add("history-amount");


        if (transaction.amount > 0) {

            amountText.textContent =
                `+$${transaction.amount.toFixed(2)}`;

            amountText.classList.add("income-text");

        } else {

            amountText.textContent =
                `-$${Math.abs(transaction.amount).toFixed(2)}`;

        }


        transactionRow.appendChild(transactionName);

        transactionRow.appendChild(categoryText);

        transactionRow.appendChild(dateText);

        transactionRow.appendChild(notesText);

        transactionRow.appendChild(amountText);


        const actions = document.createElement("div");

        actions.classList.add("history-actions");


        const editLink = document.createElement("a");

        editLink.href =
            `add-transaction.html?edit=${encodeURIComponent(transaction.id)}`;

        if (selectedMonth) {
            editLink.href += `&month=${selectedMonth}`;
        }
        editLink.classList.add("edit-transaction-link");
        editLink.textContent = "Edit";
        editLink.setAttribute("aria-label", `Edit ${transaction.name}`);


        const deleteButton = document.createElement("button");

        deleteButton.type = "button";
        deleteButton.classList.add("delete-transaction-button");
        deleteButton.textContent = "Delete";
        deleteButton.setAttribute(
            "aria-label",
            `Delete ${transaction.name}`
        );

        deleteButton.addEventListener("click", function() {

            const shouldDelete = window.confirm(
                `Delete ${transaction.name}? This cannot be undone.`
            );

            if (!shouldDelete) {
                return;
            }

            transactions = transactions.filter(function(item) {
                return item.id !== transaction.id;
            });

            localStorage.setItem(
                "transactions",
                JSON.stringify(transactions)
            );

            window.location.reload();

        });


        actions.appendChild(editLink);
        actions.appendChild(deleteButton);

        transactionRow.appendChild(actions);


        transactionHistory.appendChild(transactionRow);

        transactionRows.push({
            transaction: transaction,
            row: transactionRow,
            order: transactionRows.length
        });

    }

}


/* sort transactions */

function sortTransactions() {

    const selectedSort = historySort.value;

    transactionRows.sort(function(first, second) {

        if (selectedSort === "date-newest" || selectedSort === "date-oldest") {

            const firstDate = first.transaction.date || "";
            const secondDate = second.transaction.date || "";

            if (!firstDate && secondDate) {
                return 1;
            }

            if (firstDate && !secondDate) {
                return -1;
            }

            if (firstDate !== secondDate) {
                return selectedSort === "date-newest"
                    ? secondDate.localeCompare(firstDate)
                    : firstDate.localeCompare(secondDate);
            }

        }

        if (selectedSort === "amount-high" || selectedSort === "amount-low") {

            const difference = selectedSort === "amount-high"
                ? second.transaction.amount - first.transaction.amount
                : first.transaction.amount - second.transaction.amount;

            if (difference !== 0) {
                return difference;
            }

        }

        return first.order - second.order;

    });

    for (const item of transactionRows) {
        transactionHistory.appendChild(item.row);
    }

}


/* filter visible rows */

function filterTransactions() {

    const searchText = historySearch.value.trim().toLowerCase();
    const selectedType = historyTypeFilter.value;
    const selectedCategory = historyCategoryFilter.value;

    let visibleCount = 0;


    for (const item of transactionRows) {

        const transaction = item.transaction;

        const searchableText = [
            transaction.name,
            transaction.category,
            transaction.notes || ""
        ].join(" ").toLowerCase();

        const matchesSearch = searchableText.includes(searchText);
        const matchesType = selectedType === "all" ||
            (selectedType === "income" && transaction.amount > 0) ||
            (selectedType === "expense" && transaction.amount < 0);
        const matchesCategory = selectedCategory === "all" ||
            transaction.category === selectedCategory;

        const matchesMonth = !selectedMonth ||
            (transaction.date && transaction.date.slice(0, 7) === selectedMonth);

        const matches = matchesSearch && matchesType &&
            matchesCategory && matchesMonth;

        item.row.hidden = !matches;

        if (matches) {
            visibleCount++;
        }

    }


    if (visibleCount === transactions.length) {
        transactionCount.textContent =
            `${transactions.length} ${transactions.length === 1 ? "transaction" : "transactions"}`;
    } else {
        transactionCount.textContent =
            `${visibleCount} of ${transactions.length} transactions`;
    }

    noMatchingTransactions.hidden =
        transactions.length === 0 || visibleCount > 0;

}


historySearch.addEventListener("input", filterTransactions);
historyTypeFilter.addEventListener("change", filterTransactions);
historyCategoryFilter.addEventListener("change", filterTransactions);
historySort.addEventListener("change", sortTransactions);

sortTransactions();
filterTransactions();


lucide.createIcons();