const transactionForm = document.querySelector("#transaction-form");

const typeInput = document.querySelector("#transaction-type");
const nameInput = document.querySelector("#transaction-name");
const categoryInput = document.querySelector("#transaction-category");
const amountInput = document.querySelector("#transaction-amount");
const dateInput = document.querySelector("#transaction-date");
const notesInput = document.querySelector("#transaction-notes");

const formMessage = document.querySelector("#form-message");


/* set today's date */

const today = new Date();

const year = today.getFullYear();
const month = String(today.getMonth() + 1).padStart(2, "0");
const day = String(today.getDate()).padStart(2, "0");

dateInput.value = `${year}-${month}-${day}`;


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


    const newTransaction = {
        id: Date.now(),
        type: type,
        name: name,
        category: category,
        amount: finalAmount,
        date: date,
        notes: notes
    };


    const savedTransactions = localStorage.getItem("transactions");

    let transactions = JSON.parse(savedTransactions) || [];


    transactions.push(newTransaction);


    localStorage.setItem(
        "transactions",
        JSON.stringify(transactions)
    );


    window.location.href = "index.html";

});


function showError(message) {

    formMessage.textContent = message;

}