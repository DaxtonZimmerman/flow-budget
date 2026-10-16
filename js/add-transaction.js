const transactionForm = document.querySelector("#transaction-form");

const typeInput = document.querySelector("#transaction-type");
const nameInput = document.querySelector("#transaction-name");
const categoryInput = document.querySelector("#transaction-category");
const amountInput = document.querySelector("#transaction-amount");
const dateInput = document.querySelector("#transaction-date");
const notesInput = document.querySelector("#transaction-notes");

const formMessage = document.querySelector("#form-message");
const formTitle = document.querySelector("#form-title");
const formDescription = document.querySelector("#form-description");
const formBackLink = document.querySelector("#form-back-link");
const saveButton = document.querySelector("#save-transaction-button");
const categorySuggestion = document.querySelector("#category-suggestion");
const rememberCategory = document.querySelector("#remember-category");
let suggestedRule = null;


/* fill a category when a saved rule matches */

function suggestCategory() {
    if (categoryInput.value && !suggestedRule) return;

    const rule = findCategoryRule({
        name: nameInput.value,
        type: typeInput.value
    }, loadCategoryRules());

    if (rule && [...categoryInput.options].some(option => option.value === rule.category)) {
        categoryInput.value = rule.category;
        categorySuggestion.textContent = `Suggested from your rule for ${rule.label || rule.name}. You can change it.`;
        suggestedRule = rule;
    } else if (suggestedRule) {
        categoryInput.value = "";
        categorySuggestion.textContent = "";
        suggestedRule = null;
    }
}

nameInput.addEventListener("blur", suggestCategory);
typeInput.addEventListener("change", suggestCategory);
categoryInput.addEventListener("change", function() {
    suggestedRule = null;
    categorySuggestion.textContent = "";
});

const pageParameters = new URLSearchParams(window.location.search);
const editId = pageParameters.get("edit");
const monthFromPage = pageParameters.get("month");
const selectedMonth = monthFromPage && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthFromPage)
    ? monthFromPage
    : "";
const fromPage = pageParameters.get("from");

let returnPage = "index.html";
let returnLabel = "Back to dashboard";

if (fromPage === "budgets") {
    returnPage = "budgets.html";
    returnLabel = "Back to budgets";
}

if (fromPage === "transactions" || editId !== null) {
    returnPage = "transactions.html";
    returnLabel = "Back to transactions";
}

if (selectedMonth) {
    returnPage += `?month=${selectedMonth}`;

    for (const link of document.querySelectorAll('.nav-link[href$=".html"]')) {
        link.href += `?month=${selectedMonth}`;
    }
}

formBackLink.href = returnPage;
formBackLink.textContent = returnLabel;


/* set the starting date */

const today = new Date();

const year = today.getFullYear();
const month = String(today.getMonth() + 1).padStart(2, "0");
const day = String(today.getDate()).padStart(2, "0");

const currentMonth = `${year}-${month}`;

dateInput.value = selectedMonth && selectedMonth !== currentMonth
    ? `${selectedMonth}-01`
    : `${currentMonth}-${day}`;


/* fill the form when editing */

if (editId !== null) {

    document.title = "Edit Transaction | Flow";
    formTitle.textContent = "Edit transaction";
    formDescription.textContent = "Update this income or expense.";
    saveButton.textContent = "Save changes";


    const transactions = loadTransactions();

    const transaction = transactions.find(function(item) {
        return String(item.id) === editId;
    });


    if (!transaction) {

        showError("Transaction not found. Return to transactions and try again.");
        saveButton.disabled = true;

    } else {

        typeInput.value = transaction.type ||
            (transaction.amount > 0 ? "Income" : "Expense");
        nameInput.value = transaction.name;
        if (transaction.category &&
            ![...categoryInput.options].some(option => option.value === transaction.category)) {
            categoryInput.add(new Option(transaction.category, transaction.category));
        }
        categoryInput.value = transaction.category;
        amountInput.value = Math.abs(transaction.amount);
        dateInput.value = transaction.date || "";
        notesInput.value = transaction.notes || "";

        if (transaction.source === "bank") {
            formDescription.textContent =
                "This came from your bank. You can change its category and notes.";
            typeInput.disabled = true;
            nameInput.disabled = true;
            amountInput.disabled = true;
            dateInput.disabled = true;
        }

    }

}


/* save transaction */

transactionForm.addEventListener("submit", function(event) {

    event.preventDefault();


    const type = typeInput.value;
    const name = nameInput.value.trim();
    const category = categoryInput.value;
    const amount = Number(amountInput.value);
    const date = dateInput.value;
    const notes = notesInput.value.trim();
    const matchedSuggestion = suggestedRule &&
        suggestedRule.name === normalizedName(name) &&
        suggestedRule.type === type && suggestedRule.category === category;
    const bankEdit = editId !== null && loadTransactions().some(function(item) {
        return String(item.id) === editId && item.source === "bank";
    });


    formMessage.textContent = "";


    if (type === "") {
        showError("Please choose a transaction type.");
        return;
    }


    if (name === "") {
        showError("Please enter a transaction name.");
        return;
    }


    if (category === "") {
        showError("Please choose a category.");
        return;
    }


    if (!bankEdit && (!Number.isFinite(amount) || amount <= 0 ||
        !/^\d+(\.\d{1,2})?$/.test(amountInput.value))) {
        showError("Please enter an amount greater than $0 with up to two decimals.");
        return;
    }


    if (date === "") {
        showError("Please choose a date.");
        return;
    }


    let finalAmount = centsToMoney(moneyToCents(amount));

    if (type === "Expense") {
        finalAmount = -finalAmount;
    }


    let transactions = loadTransactions();
    const rules = loadCategoryRules();
    let rememberedRule = null;

    if (rememberCategory.checked) {
        rememberedRule = findCategoryRule({ name: name, type: type }, rules);
        if (rememberedRule) {
            rememberedRule.category = category;
        } else {
            rememberedRule = {
                id: makeRecordId(rules),
                name: normalizedName(name),
                label: name,
                type: type,
                category: category
            };
            rules.push(rememberedRule);
        }

        for (const item of transactions) {
            if (item.categoryRuleId === rememberedRule.id) {
                item.category = category;
                item.categoryReason = `Rule for ${rememberedRule.label || rememberedRule.name}`;
            }
        }
    }


    if (editId !== null) {

        const transactionIndex = transactions.findIndex(function(item) {
            return String(item.id) === editId;
        });

        if (transactionIndex === -1) {
            showError("Transaction not found. Return to transactions and try again.");
            return;
        }

        const oldTransaction = transactions[transactionIndex];
        const sameCategory = oldTransaction.category === category &&
            oldTransaction.name === name && oldTransaction.type === type;

        transactions[transactionIndex] = oldTransaction.source === "bank"
            ? {
                ...oldTransaction,
                category: category,
                notes: notes,
                reviewStatus: "reviewed",
                categoryReason: sameCategory ? oldTransaction.categoryReason : "Chosen by you",
                categoryRuleId: sameCategory ? oldTransaction.categoryRuleId : undefined
            }
            : {
                ...oldTransaction,
                type: type,
                name: name,
                category: category,
                amount: finalAmount,
                date: date,
                notes: notes,
                reviewStatus: "reviewed",
                categoryReason: sameCategory ? oldTransaction.categoryReason : "Chosen by you",
                categoryRuleId: sameCategory ? oldTransaction.categoryRuleId : undefined
            };

    } else {

        const newTransaction = {
            id: makeRecordId(transactions),
            type: type,
            name: name,
            category: category,
            amount: finalAmount,
            date: date,
            notes: notes,
            categoryReason: matchedSuggestion
                ? `Rule for ${suggestedRule.label || suggestedRule.name}` : "Chosen by you",
            categoryRuleId: matchedSuggestion
                ? suggestedRule.id : undefined
        };

        transactions.push(newTransaction);

    }


    const oldTransactions = localStorage.getItem("transactions");
    const oldRules = localStorage.getItem("categoryRules");

    try {
        localStorage.setItem("transactions", JSON.stringify(transactions));
        if (rememberCategory.checked) {
            localStorage.setItem("categoryRules", JSON.stringify(rules));
        }
    } catch (error) {
        if (oldTransactions === null) localStorage.removeItem("transactions");
        else localStorage.setItem("transactions", oldTransactions);
        if (oldRules === null) localStorage.removeItem("categoryRules");
        else localStorage.setItem("categoryRules", oldRules);
        showError("Flow could not save. Check browser storage and try again.");
        return;
    }
    flowDataChanged();


    window.location.href = returnPage;

});


function showError(message) {

    formMessage.textContent = message;

}


if (typeof lucide !== "undefined") {
    lucide.createIcons();
}
