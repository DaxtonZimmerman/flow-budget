const transactionForm = document.querySelector("#transaction-form");

transactionForm.addEventListener("submit", function(event) {

    event.preventDefault();


    const type = document.querySelector("#transaction-type").value;
    const name = document.querySelector("#transaction-name").value;
    const category = document.querySelector("#transaction-category").value;
    const amount = Number(document.querySelector("#transaction-amount").value);
    const date = document.querySelector("#transaction-date").value;
    const notes = document.querySelector("#transaction-notes").value;


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