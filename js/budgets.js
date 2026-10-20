if (typeof lucide !== "undefined") {
    lucide.createIcons();
}


let transactions = loadTransactions();
const budgetMoney = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

const selectedMonth = getSelectedMonth();
let budgets = loadBudgets(selectedMonth);
const budgetMonth = document.querySelector("#budget-month");
const dashboardLink = document.querySelector("#dashboard-link");

budgetMonth.value = selectedMonth;
document.querySelector(".nav-link.active").href =
    `budgets.html?month=${selectedMonth}`;
dashboardLink.href = `index.html?month=${selectedMonth}`;
document.querySelector('a[href="transactions.html"]').href =
    `transactions.html?month=${selectedMonth}`;
document.querySelector('a[href="add-transaction.html"]').href =
    `add-transaction.html?from=budgets&month=${selectedMonth}`;

budgetMonth.addEventListener("change", function() {
    if (budgetMonth.value) {
        window.location.href = `budgets.html?view=categories&month=${budgetMonth.value}`;
    }
});

const budgetEditor = document.querySelector("#budget-editor");
const budgetForm = document.querySelector("#budget-form");
for (const button of document.querySelectorAll("[data-new-budget]")) {
    button.addEventListener("click", () => {
        budgetForm.reset();
        document.querySelector("#budget-message").textContent = "";
        document.querySelector("#budget-editor-title").textContent = "Set a category limit";
        budgetEditor.showModal();
    });
}
const categoryInput = document.querySelector("#budget-category");
const limitInput = document.querySelector("#budget-limit");
const budgetMessage = document.querySelector("#budget-message");
const budgetList = document.querySelector("#budget-page-list");
const emptyBudgets = document.querySelector("#empty-budgets");
const budgetTotal = document.querySelector("#budget-total");
const budgetSpent = document.querySelector("#budget-spent");
const budgetRemaining = document.querySelector("#budget-remaining");


/* show saved budgets */

function showBudgets() {
    if (typeof flowCategories === 'function') for (const name of flowCategories()) if (![...categoryInput.options].some(o=>o.value===name)) categoryInput.add(new Option(name,name));

    budgetList.replaceChildren();
    emptyBudgets.hidden = budgets.length > 0;

    let totalLimit = 0;
    let totalSpent = 0;
    let totalRemaining = 0;


    for (const budget of budgets) {

        const spent = getBudgetSpending(budget.category, transactions, selectedMonth);
        const remaining = Math.max(0, budget.limit - spent);
        const percentage = (spent / budget.limit) * 100;

        totalLimit += moneyToCents(budget.limit);
        totalSpent += moneyToCents(spent);
        totalRemaining += moneyToCents(remaining);


        const row = document.createElement("div");
        row.classList.add("budget-detail-row");

        const cardTop = document.createElement("div");
        cardTop.className = "budget-card-top";
        const icon = document.createElement("span");
        icon.className = "budget-card-icon";
        const icons = { Food: "utensils", Transport: "car-front", Entertainment: "clapperboard", Shopping: "shopping-bag", Bills: "receipt-text", Other: "shapes" };
        icon.innerHTML = `<i data-lucide="${icons[budget.category] || "shapes"}" aria-hidden="true"></i>`;
        const status = document.createElement("span");
        status.className = `budget-card-status${spent > budget.limit ? " is-over" : ""}`;
        status.textContent = spent > budget.limit ? "Over limit" : "Within limit";
        cardTop.append(icon, status);
        row.appendChild(cardTop);
        const info = document.createElement("div");
        info.classList.add("budget-info");

        const name = document.createElement("strong");
        name.textContent = budget.category;

        const amounts = document.createElement("span");
        amounts.textContent =
            `${budgetMoney(spent)} spent of ${budgetMoney(budget.limit)}`;

        info.appendChild(name);
        info.appendChild(amounts);


        const progress = document.createElement("div");
        progress.classList.add("budget-progress");

        const bar = document.createElement("div");
        bar.classList.add("progress-bar");

        const fill = document.createElement("div");
        fill.classList.add("progress-fill");
        fill.style.width = `${Math.min(percentage, 100)}%`;

        if (spent > budget.limit) {
            fill.classList.add("over-budget");
        }

        bar.appendChild(fill);

        const percentText = document.createElement("strong");
        percentText.textContent = `${percentage.toFixed(0)}%`;

        progress.appendChild(bar);
        progress.appendChild(percentText);


        const actions = document.createElement("div");
        actions.classList.add("history-actions");

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.classList.add("edit-transaction-link");
        editButton.textContent = "Edit";
        editButton.setAttribute("aria-label", `Edit ${budget.category} budget`);

        editButton.addEventListener("click", function() {
            categoryInput.value = budget.category;
            limitInput.value = budget.limit;
            budgetMessage.textContent = "";
            document.querySelector("#budget-editor-title").textContent = `Edit ${budget.category} limit`;
            budgetEditor.showModal();
            limitInput.focus();
        });

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.classList.add("delete-transaction-button");
        deleteButton.textContent = "Delete";
        deleteButton.setAttribute("aria-label", `Delete ${budget.category} budget`);

        deleteButton.addEventListener("click", function() {

            const shouldDelete = window.confirm(
                `Delete the ${budget.category} budget?`
            );

            if (!shouldDelete) {
                return;
            }

            budgets = budgets.filter(function(item) {
                return item.category !== budget.category;
            });

            saveBudgets(selectedMonth, budgets);
            showBudgets();

        });

        actions.appendChild(editButton);
        actions.appendChild(deleteButton);

        const left = document.createElement("div");
        left.className = "budget-card-left";
        left.textContent = budgetMoney(Math.abs(budget.limit - spent));
        const leftLabel = document.createElement("small");
        leftLabel.textContent = spent > budget.limit ? "over limit" : "left";
        left.appendChild(leftLabel);
        const footer = document.createElement("div");
        footer.className = "budget-card-footer";
        const periodLabel = document.createElement("span");
        periodLabel.textContent = "Monthly category limit";
        footer.append(periodLabel, actions);
        row.append(info, left, progress, footer);

        budgetList.appendChild(row);

    }


    budgetTotal.textContent = budgetMoney(centsToMoney(totalLimit));
    budgetSpent.textContent = budgetMoney(centsToMoney(totalSpent));
    budgetRemaining.textContent = budgetMoney(centsToMoney(totalRemaining));
    if (typeof lucide !== "undefined") lucide.createIcons();

}


/* save a budget */

budgetForm.addEventListener("submit", function(event) {

    event.preventDefault();

    const category = categoryInput.value;
    const limit = Number(limitInput.value);

    budgetMessage.textContent = "";

    if (category === "") {
        budgetMessage.textContent = "Please choose a category.";
        return;
    }

    if (!Number.isFinite(limit) || limit <= 0 ||
        !/^\d+(\.\d{1,2})?$/.test(limitInput.value)) {
        budgetMessage.textContent = "Please enter a limit greater than $0 with up to two decimals.";
        return;
    }

    const existingBudget = budgets.find(function(item) {
        return item.category === category;
    });

    if (existingBudget) {
        existingBudget.limit = centsToMoney(moneyToCents(limit));
    } else {
        budgets.push({
            id: makeRecordId(budgets),
            category: category,
            limit: centsToMoney(moneyToCents(limit))
        });
    }

    saveBudgets(selectedMonth, budgets);

    categoryInput.value = "";
    limitInput.value = "";

    showBudgets();
    budgetEditor.close();

});


showBudgets();

// Refresh totals without closing an editor or resetting the selected month.
document.addEventListener('flow-transaction-view-refresh', () => {
    transactions = loadTransactions(); budgets = loadBudgets(selectedMonth); showBudgets();
});

document.addEventListener('flow-transaction-updated', () => { transactions=loadTransactions(); budgets=loadBudgets(selectedMonth); showBudgets(); });
