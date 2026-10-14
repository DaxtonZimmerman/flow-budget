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

const editId = new URLSearchParams(window.location.search).get("edit");


/* set today's date */

const today = new Date();

const year = today.getFullYear();
const month = String(today.getMonth() + 1).padStart(2, "0");
const day = String(today.getDate()).padStart(2, "0");

dateInput.value = `${year}-${month}-${day}`;


/* fill the form when editing */

if (editId !== null) {

    document.title = "Edit Transaction | Flow";
    formTitle.textContent = "Edit transaction";
    formDescription.textContent = "Update this income or expense.";
    formBackLink.href = "transactions.html";
    formBackLink.textContent = "Back to transactions";
    saveButton.textContent = "Save changes";


    const savedTransactions = localStorage.getItem("transactions");
    const transactions = JSON.parse(savedTransactions) || [];

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
        categoryInput.value = transaction.category;
        amountInput.value = Math.abs(transaction.amount);
        dateInput.value = transaction.date || "";
        notesInput.value = transaction.notes || "";

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


    if (amount <= 0 || Number.isNaN(amount)) {
        showError("Please enter an amount greater than $0.");
        return;
    }


    if (date === "") {
        showError("Please choose a date.");
        return;
    }


    let finalAmount = amount;

    if (type === "Expense") {
        finalAmount = -amount;
    }


    const savedTransactions = localStorage.getItem("transactions");

    let transactions = JSON.parse(savedTransactions) || [];


    if (editId !== null) {

        const transactionIndex = transactions.findIndex(function(item) {
            return String(item.id) === editId;
        });

        if (transactionIndex === -1) {
            showError("Transaction not found. Return to transactions and try again.");
            return;
        }

        transactions[transactionIndex] = {
            id: transactions[transactionIndex].id,
            type: type,
            name: name,
            category: category,
            amount: finalAmount,
            date: date,
            notes: notes
        };

    } else {

        const newTransaction = {
            id: Date.now(),
            type: type,
            name: name,
            category: category,
            amount: finalAmount,
            date: date,
            notes: notes
        };

        transactions.push(newTransaction);

    }


    localStorage.setItem(
        "transactions",
        JSON.stringify(transactions)
    );


    window.location.href = editId !== null ? "transactions.html" : "index.html";

});


function showError(message) {

    formMessage.textContent = message;

}