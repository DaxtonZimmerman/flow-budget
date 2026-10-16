const downloadBackup = document.querySelector("#download-backup");
const restoreBackup = document.querySelector("#restore-backup");
const backupFile = document.querySelector("#backup-file");
const backupMessage = document.querySelector("#backup-message");


/* download backup */

downloadBackup.addEventListener("click", function() {

    const backup = {
        version: 1,
        transactions: loadTransactions(),
        budgets: JSON.parse(localStorage.getItem("budgets")) || [],
        budgetsByMonth: JSON.parse(localStorage.getItem("budgetsByMonth")) || {}
    };

    const file = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json"
    });
    const fileUrl = URL.createObjectURL(file);
    const link = document.createElement("a");

    link.href = fileUrl;
    link.download = "flow-backup.json";
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(function() {
        URL.revokeObjectURL(fileUrl);
    }, 1000);

    backupMessage.textContent = "Backup downloaded.";

});


/* check backup file */

function validBudgets(budgets) {

    if (!Array.isArray(budgets)) {
        return false;
    }

    for (const budget of budgets) {
        if (!budget || typeof budget.category !== "string" ||
            !Number.isFinite(budget.limit) || budget.limit <= 0) {
            return false;
        }
    }

    return true;

}


function validBackup(backup) {

    if (!backup || backup.version !== 1 ||
        !Array.isArray(backup.transactions) ||
        !validBudgets(backup.budgets) ||
        !backup.budgetsByMonth ||
        typeof backup.budgetsByMonth !== "object" ||
        Array.isArray(backup.budgetsByMonth)) {
        return false;
    }

    for (const transaction of backup.transactions) {
        if (!transaction || typeof transaction.name !== "string" ||
            typeof transaction.category !== "string" ||
            !Number.isFinite(transaction.amount) ||
            (transaction.date && typeof transaction.date !== "string") ||
            (transaction.notes && typeof transaction.notes !== "string")) {
            return false;
        }
    }

    for (const month in backup.budgetsByMonth) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
            !validBudgets(backup.budgetsByMonth[month])) {
            return false;
        }
    }

    return true;

}


/* restore backup */

restoreBackup.addEventListener("click", async function() {

    const file = backupFile.files[0];
    backupMessage.textContent = "";

    if (!file) {
        backupMessage.textContent = "Choose a backup file first.";
        return;
    }

    let backup;

    try {
        backup = JSON.parse(await file.text());
    } catch (error) {
        backupMessage.textContent = "That file is not a valid backup.";
        return;
    }

    if (!validBackup(backup)) {
        backupMessage.textContent = "That file is not a valid Flow backup.";
        return;
    }

    const shouldRestore = window.confirm(
        "Restore this backup? It will replace all transactions and budgets saved in this browser."
    );

    if (!shouldRestore) {
        return;
    }

    addMissingIds(backup.transactions);
    addMissingIds(backup.budgets);

    for (const month in backup.budgetsByMonth) {
        addMissingIds(backup.budgetsByMonth[month]);
    }

    const oldTransactions = localStorage.getItem("transactions");
    const oldBudgets = localStorage.getItem("budgets");
    const oldMonths = localStorage.getItem("budgetsByMonth");

    try {
        localStorage.setItem("transactions", JSON.stringify(backup.transactions));
        localStorage.setItem("budgets", JSON.stringify(backup.budgets));
        localStorage.setItem("budgetsByMonth", JSON.stringify(backup.budgetsByMonth));
    } catch (error) {
        if (oldTransactions === null) localStorage.removeItem("transactions");
        else localStorage.setItem("transactions", oldTransactions);

        if (oldBudgets === null) localStorage.removeItem("budgets");
        else localStorage.setItem("budgets", oldBudgets);

        if (oldMonths === null) localStorage.removeItem("budgetsByMonth");
        else localStorage.setItem("budgetsByMonth", oldMonths);

        backupMessage.textContent = "Could not restore this backup. Your saved data is unchanged.";
        return;
    }

    window.location.reload();

});
