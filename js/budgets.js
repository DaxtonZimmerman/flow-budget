lucide.createIcons();


const savedTransactions = localStorage.getItem("transactions");
const transactions = JSON.parse(savedTransactions) || [];

let budgets = loadBudgets();

const budgetForm = document.querySelector("#budget-form");
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

    budgetList.replaceChildren();
    emptyBudgets.hidden = budgets.length > 0;

    let totalLimit = 0;
    let totalSpent = 0;
    let totalRemaining = 0;


    for (const budget of budgets) {

        const spent = getBudgetSpending(budget.category, transactions);
        const remaining = Math.max(0, budget.limit - spent);
        const percentage = (spent / budget.limit) * 100;

        totalLimit += budget.limit;
        totalSpent += spent;
        totalRemaining += remaining;


        const row = document.createElement("div");
        row.classList.add("budget-detail-row");

        const info = document.createElement("div");
        info.classList.add("budget-info");

        const name = document.createElement("strong");
        name.textContent = budget.category;

        const amounts = document.createElement("span");
        amounts.textContent =
            `$${spent.toFixed(2)} spent of $${budget.limit.toFixed(2)}`;

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

            localStorage.setItem("budgets", JSON.stringify(budgets));
            showBudgets();

        });

        actions.appendChild(editButton);
        actions.appendChild(deleteButton);

        row.appendChild(info);
        row.appendChild(progress);
        row.appendChild(actions);

        budgetList.appendChild(row);

    }


    budgetTotal.textContent = `$${totalLimit.toFixed(2)}`;
    budgetSpent.textContent = `$${totalSpent.toFixed(2)}`;
    budgetRemaining.textContent = `$${totalRemaining.toFixed(2)}`;

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

    if (!Number.isFinite(limit) || limit <= 0) {
        budgetMessage.textContent = "Please enter a limit greater than $0.";
        return;
    }

    const existingBudget = budgets.find(function(item) {
        return item.category === category;
    });

    if (existingBudget) {
        existingBudget.limit = limit;
    } else {
        budgets.push({ category: category, limit: limit });
    }

    localStorage.setItem("budgets", JSON.stringify(budgets));

    categoryInput.value = "";
    limitInput.value = "";

    showBudgets();

});


showBudgets();
