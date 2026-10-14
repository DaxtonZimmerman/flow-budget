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


let totalIncome = 0;
let totalExpenses = 0;


for (const transaction of transactions) {

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


        transactionRow.appendChild(deleteButton);


        transactionHistory.appendChild(transactionRow);

    }

}


lucide.createIcons();