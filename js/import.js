if (typeof lucide !== "undefined") lucide.createIcons();

const fileInput = document.querySelector("#import-file");
const mapSection = document.querySelector("#import-map");
const previewSection = document.querySelector("#import-preview");
const message = document.querySelector("#import-message");
const doneLink = document.querySelector("#import-done-link");
const amountStyleInput = document.querySelector("#import-amount-style");
const saveButton = document.querySelector("#save-import");
const columnNames = ["date", "name", "category", "amount", "debit", "credit"];
let csv = null;
let previewRows = [];


function showMessage(text) {
    message.textContent = text;
}


function guessColumn(headers, words) {
    return headers.findIndex(function(header) {
        return words.some(word => header.trim().toLowerCase().includes(word));
    });
}


function fillColumnSelects(headers) {
    const guesses = {
        date: ["date", "posted"],
        name: ["description", "merchant", "payee", "name", "memo"],
        category: ["category"],
        amount: ["amount", "total"],
        debit: ["debit", "withdrawal", "money out"],
        credit: ["credit", "deposit", "money in"]
    };

    for (const name of columnNames) {
        const select = document.querySelector(`#import-${name}`);
        select.replaceChildren();

        const empty = new Option(name === "category" ? "No category column" : "Choose a column", "");
        select.add(empty);

        headers.forEach(function(header, index) {
            select.add(new Option(header || `Column ${index + 1}`, String(index)));
        });

        const guess = guessColumn(headers, guesses[name]);
        if (guess >= 0) select.value = String(guess);
    }

    const debit = document.querySelector("#import-debit").value;
    const credit = document.querySelector("#import-credit").value;
    amountStyleInput.value = debit !== "" && credit !== "" ? "separate" : "signed";
    updateAmountFields();

    const firstDate = csv.rows[0][Number(document.querySelector("#import-date").value)] || "";
    document.querySelector("#import-date-format").value = /^\d{4}[\/-]/.test(firstDate) ? "iso" : "mdy";
}


function updateAmountFields() {
    const separate = amountStyleInput.value === "separate";
    document.querySelector("#import-amount-group").hidden = separate;
    document.querySelector("#import-debit-group").hidden = !separate;
    document.querySelector("#import-credit-group").hidden = !separate;
}


function getColumns() {
    const columns = {};

    for (const name of columnNames) {
        const value = document.querySelector(`#import-${name}`).value;
        columns[name] = value === "" ? "" : Number(value);
    }

    return columns;
}


function validColumns(columns) {
    const required = [columns.date, columns.name];

    if (amountStyleInput.value === "separate") {
        required.push(columns.debit, columns.credit);
    } else {
        required.push(columns.amount);
    }

    return !required.includes("") && new Set(required).size === required.length;
}


function formatAmount(amount) {
    return amount < 0
        ? `-$${Math.abs(amount).toFixed(2)}`
        : `$${amount.toFixed(2)}`;
}


function addCell(row, text) {
    const cell = document.createElement("td");
    cell.textContent = text;
    row.appendChild(cell);
}


function updateSummary() {
    const ready = previewRows.filter(item => item.transaction &&
        (!item.duplicate || item.includeDuplicate)).length;
    const duplicates = previewRows.filter(item => item.duplicate && !item.includeDuplicate).length;
    const errors = previewRows.filter(item => item.error).length;

    document.querySelector("#import-summary").textContent =
        `${ready} will save · ${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped · ${errors} row${errors === 1 ? "" : "s"} need fixing`;
    saveButton.textContent = `Import ${ready} transaction${ready === 1 ? "" : "s"}`;
    saveButton.disabled = ready === 0 || errors > 0;
}


function showPreview() {
    const columns = getColumns();
    if (!validColumns(columns)) {
        showMessage("Choose different columns for date, description, and amount.");
        previewSection.hidden = true;
        return;
    }

    const dateFormat = document.querySelector("#import-date-format").value;
    previewRows = buildImportRows(csv, columns, dateFormat,
        amountStyleInput.value, loadTransactions(), loadCategoryRules());

    const body = document.querySelector("#import-rows");
    body.replaceChildren();

    for (const item of previewRows) {
        const row = document.createElement("tr");
        addCell(row, String(item.line));

        if (item.error) {
            row.classList.add("import-row-error");
            const raw = csv.rows[item.line - 2];
            const columns = getColumns();
            addCell(row, raw[columns.date] || "");
            addCell(row, raw[columns.name] || "");
            addCell(row, columns.category === "" ? "" : raw[columns.category] || "");
            addCell(row, amountStyleInput.value === "separate"
                ? `${raw[columns.debit] || ""} / ${raw[columns.credit] || ""}`
                : raw[columns.amount] || "");
            addCell(row, "Check row");
        } else {
            const transaction = item.transaction;
            addCell(row, transaction.date);
            addCell(row, transaction.name);
            addCell(row, transaction.category);
            addCell(row, formatAmount(transaction.amount));
            if (item.duplicate) {
                const cell = document.createElement("td");
                const label = document.createElement("label");
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.setAttribute("aria-label", `Include duplicate CSV row ${item.line}`);
                checkbox.addEventListener("change", function() {
                    item.includeDuplicate = checkbox.checked;
                    updateSummary();
                });
                label.appendChild(checkbox);
                label.append(" Include anyway");
                cell.appendChild(label);
                row.appendChild(cell);
            } else {
                addCell(row, "Will save");
            }
            if (item.duplicate) {
                row.classList.add("import-row-duplicate");
            }
        }

        body.appendChild(row);
    }

    updateSummary();
    previewSection.hidden = false;
    doneLink.hidden = true;
    showMessage(previewRows.some(item => item.error)
        ? "Fix the marked rows in your CSV, then choose the file again."
        : "Review the rows below before importing.");
}


fileInput.addEventListener("change", async function() {
    csv = null;
    previewSection.hidden = true;
    mapSection.hidden = true;
    doneLink.hidden = true;
    showMessage("");

    const file = fileInput.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
        showMessage("Choose a .csv file exported from your bank.");
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showMessage("This file is over 5 MB. Export a smaller date range and try again.");
        return;
    }

    try {
        csv = parseCsv(await file.text());
        if (csv.rows.length > 10000) {
            showMessage("This file has over 10,000 rows. Export a smaller date range.");
            csv = null;
            return;
        }
        fillColumnSelects(csv.headers);
        mapSection.hidden = false;
        showMessage(`${csv.rows.length} rows found. Check the columns, then preview.`);
    } catch (error) {
        showMessage(error.message || "This file could not be read.");
    }
});

amountStyleInput.addEventListener("change", updateAmountFields);

for (const select of mapSection.querySelectorAll("select")) {
    select.addEventListener("change", function() {
        previewSection.hidden = true;
        showMessage("Column choices changed. Preview again before importing.");
    });
}

document.querySelector("#preview-import").addEventListener("click", showPreview);

saveButton.addEventListener("click", function() {
    if (!csv || previewSection.hidden || saveButton.disabled) return;

    const latest = buildImportRows(csv, getColumns(),
        document.querySelector("#import-date-format").value,
        amountStyleInput.value, loadTransactions(), loadCategoryRules());
    const previewMatches = latest.length === previewRows.length &&
        latest.every(function(item, index) {
            const old = previewRows[index];
            return !item.error && !old.error &&
                item.duplicate === old.duplicate &&
                importKey(item.transaction) === importKey(old.transaction) &&
                item.transaction.category === old.transaction.category &&
                item.transaction.categoryRuleId === old.transaction.categoryRuleId;
        });

    if (!previewMatches) {
        showPreview();
        showMessage("Saved data changed. Review the updated preview before importing.");
        return;
    }

    const transactions = loadTransactions();
    let importedCount = 0;
    for (let i = 0; i < latest.length; i++) {
        const item = latest[i];
        if (item.duplicate && !previewRows[i].includeDuplicate) continue;
        const transaction = item.transaction;
        transaction.id = makeRecordId(transactions);
        transactions.push(transaction);
        importedCount++;
    }

    try {
        localStorage.setItem("transactions", JSON.stringify(transactions));
    } catch (error) {
        showMessage("Flow could not save these transactions. Check browser storage and try again.");
        return;
    }

    if (typeof flowDataChanged === "function") flowDataChanged();
    previewSection.hidden = true;
    mapSection.hidden = true;
    fileInput.value = "";
    csv = null;
    doneLink.hidden = false;
    showMessage(`${importedCount} transaction${importedCount === 1 ? "" : "s"} imported. Find them in Activity, or open Review to sort them.`);
});
