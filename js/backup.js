var flowStorage = typeof flowStorage !== 'undefined' ? flowStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
const downloadBackup = document.querySelector("#download-backup");
const restoreBackup = document.querySelector("#restore-backup");
const backupFile = document.querySelector("#backup-file");
const backupMessage = document.querySelector("#backup-message");


/* download backup */

downloadBackup.addEventListener("click", function() {

    const backup = {
        version: 1,
        clientSchemaVersion: 2,
        demo: typeof flowDemoMode !== 'undefined' && flowDemoMode,
        transactions: loadTransactions(),
        budgets: JSON.parse(flowStorage.getItem("budgets")) || [],
        budgetsByMonth: JSON.parse(flowStorage.getItem("budgetsByMonth")) || {},
        categoryRules: JSON.parse(flowStorage.getItem("categoryRules")) || [],
        recurringItems: JSON.parse(flowStorage.getItem("recurringItems")) || [],
        bankAccounts: JSON.parse(flowStorage.getItem("bankAccounts") || "[]"),
        flowPlanning: typeof loadFlowPlanning === "function" ? loadFlowPlanning() : null
    };

    const file = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json"
    });
    const fileUrl = URL.createObjectURL(file);
    const link = document.createElement("a");

    link.href = fileUrl;
    link.download = typeof flowDemoMode !== 'undefined' && flowDemoMode ? "flow-demo-backup.json" : "flow-backup.json";
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
    if (backup?.demo && !(typeof flowDemoMode !== 'undefined' && flowDemoMode)) return false;
    if (backup?.clientSchemaVersion !== undefined && ![1, 2].includes(backup.clientSchemaVersion)) return false;

    if (!backup || backup.version !== 1 ||
        !Array.isArray(backup.transactions) ||
        !validBudgets(backup.budgets) ||
        !backup.budgetsByMonth ||
        typeof backup.budgetsByMonth !== "object" ||
        Array.isArray(backup.budgetsByMonth)) {
        return false;
    }

    for (const transaction of backup.transactions) {
        if (typeof validFlowTransactionExtras === 'function' && !validFlowTransactionExtras(transaction)) return false;
        if (typeof validTransferFields === "function" && !validTransferFields(transaction)) return false;
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

    if (backup.categoryRules !== undefined &&
        (!Array.isArray(backup.categoryRules) || backup.categoryRules.some(rule =>
            !rule || typeof rule.id !== "string" ||
            typeof rule.name !== "string" ||
            typeof rule.category !== "string" ||
            !["Income", "Expense"].includes(rule.type) ||
            (rule.bankType !== undefined && (rule.bankType !== "Transfer" ||
                typeof rule.accountId !== "string" || !rule.accountId))))) {
        return false;
    }

    if (backup.recurringItems !== undefined &&
        (!Array.isArray(backup.recurringItems) || backup.recurringItems.some(item =>
            !item || typeof item.id !== "string" ||
            typeof item.key !== "string" ||
            typeof item.name !== "string" ||
            !["confirmed", "dismissed"].includes(item.status) ||
            (item.status === "confirmed" &&
                (!Number.isFinite(item.amount) ||
                    !["Income", "Expense"].includes(item.type)))))) {
        return false;
    }

    if (backup.flowPlanning != null && (typeof validFlowPlanning !== "function" || !validFlowPlanning(backup.flowPlanning))) return false;
    if (backup.bankAccounts !== undefined && (typeof validBankAccounts !== "function" || !validBankAccounts(backup.bankAccounts))) return false;
    return true;

}


/* restore backup */

restoreBackup.addEventListener("click", async function() {

    const restoreOwner = flowStorage.getItem('flow_user_id');
    const restoreBase = typeof getFlowSnapshot === 'function' ? JSON.stringify(getFlowSnapshot()) : null;
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

    if (backup?.demo && !(typeof flowDemoMode !== 'undefined' && flowDemoMode)) { backupMessage.textContent = 'This is a sample-workspace backup. It cannot replace your real Flow data.'; return; }

    if (!validBackup(backup)) {
        backupMessage.textContent = "That file is not a valid Flow backup.";
        return;
    }

    const shouldRestore = window.confirm(
        "Restore this backup? It will replace transactions, budgets, category rules, monthly choices, account snapshots, and your payday plan saved in this browser."
    );

    if (!shouldRestore) {
        return;
    }

    if (restoreOwner !== flowStorage.getItem('flow_user_id') || restoreBase !== null && restoreBase !== JSON.stringify(getFlowSnapshot())) {
        backupMessage.textContent = 'Your account or saved data changed while reading the file. Reopen restore before replacing anything.';
        return;
    }
    addMissingIds(backup.transactions);
    addMissingIds(backup.budgets);

    for (const month in backup.budgetsByMonth) {
        addMissingIds(backup.budgetsByMonth[month]);
    }

    const oldTransactions = flowStorage.getItem("transactions");
    const oldBudgets = flowStorage.getItem("budgets");
    const oldMonths = flowStorage.getItem("budgetsByMonth");
    const oldRules = flowStorage.getItem("categoryRules");
    const oldRecurring = flowStorage.getItem("recurringItems");
    const oldAccounts = flowStorage.getItem("bankAccounts");
    const oldPlanning = flowStorage.getItem("flowPlanning");

    try {
        flowStorage.setItem("transactions", JSON.stringify(backup.transactions));
        flowStorage.setItem("budgets", JSON.stringify(backup.budgets));
        flowStorage.setItem("budgetsByMonth", JSON.stringify(backup.budgetsByMonth));
        flowStorage.setItem("categoryRules", JSON.stringify(backup.categoryRules || []));
        flowStorage.setItem("recurringItems", JSON.stringify(backup.recurringItems || []));
        flowStorage.setItem("bankAccounts", JSON.stringify(backup.bankAccounts || []));
        if (backup.flowPlanning) flowStorage.setItem("flowPlanning", JSON.stringify(backup.flowPlanning));
        else flowStorage.removeItem("flowPlanning");
        if (typeof flowDataChanged === "function") flowDataChanged();
    } catch (error) {
        if (oldTransactions === null) flowStorage.removeItem("transactions");
        else flowStorage.setItem("transactions", oldTransactions);

        if (oldBudgets === null) flowStorage.removeItem("budgets");
        else flowStorage.setItem("budgets", oldBudgets);

        if (oldMonths === null) flowStorage.removeItem("budgetsByMonth");
        else flowStorage.setItem("budgetsByMonth", oldMonths);

        if (oldRules === null) flowStorage.removeItem("categoryRules");
        else flowStorage.setItem("categoryRules", oldRules);

        if (oldRecurring === null) flowStorage.removeItem("recurringItems");
        else flowStorage.setItem("recurringItems", oldRecurring);

        if (oldAccounts === null) flowStorage.removeItem("bankAccounts");
        else flowStorage.setItem("bankAccounts", oldAccounts);
        if (oldPlanning === null) flowStorage.removeItem("flowPlanning");
        else flowStorage.setItem("flowPlanning", oldPlanning);

        backupMessage.textContent = "Could not restore this backup. Your saved data is unchanged.";
        return;
    }

    flowStorage.removeItem('flowLastEstimate');
    window.location.reload();

});
