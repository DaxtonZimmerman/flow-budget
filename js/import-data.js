/* read a csv file */

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    text = text.replace(/^\uFEFF/, "");

    for (let i = 0; i < text.length; i++) {
        const character = text[i];

        if (character === '"') {
            if (quoted && text[i + 1] === '"') {
                cell += '"';
                i++;
            } else if (quoted || cell === "") {
                quoted = !quoted;
            } else {
                throw new Error("This CSV has a misplaced quote.");
            }
        } else if (character === "," && !quoted) {
            row.push(cell.trim());
            cell = "";
        } else if ((character === "\n" || character === "\r") && !quoted) {
            if (character === "\r" && text[i + 1] === "\n") i++;
            row.push(cell.trim());
            if (row.some(value => value !== "")) rows.push(row);
            row = [];
            cell = "";
        } else {
            cell += character;
        }
    }

    if (quoted) throw new Error("This CSV has an unfinished quoted value.");
    row.push(cell.trim());
    if (row.some(value => value !== "")) rows.push(row);

    if (rows.length < 2) throw new Error("Choose a CSV with a header and at least one transaction.");

    const width = rows[0].length;
    if (rows.some(item => item.length !== width)) {
        throw new Error("Some CSV rows have a different number of columns. Check the file and try again.");
    }

    return { headers: rows[0], rows: rows.slice(1) };
}


function importDate(value, format) {
    const parts = String(value).trim().match(/^(\d{1,4})[\/-](\d{1,2})[\/-](\d{1,4})$/);
    if (!parts) return "";

    let year, month, day;
    if (format === "iso") {
        [year, month, day] = parts.slice(1).map(Number);
        if (parts[1].length !== 4) return "";
    } else {
        const [first, second, last] = parts.slice(1).map(Number);
        if (parts[3].length !== 4) return "";
        year = last;
        month = format === "dmy" ? second : first;
        day = format === "dmy" ? first : second;
    }

    const date = new Date(year, month - 1, day);
    if (year < 1900 || date.getFullYear() !== year ||
        date.getMonth() !== month - 1 || date.getDate() !== day) return "";

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}


function importCents(value) {
    let text = String(value).trim();
    if (!text) return null;

    const negative = /^\$?-/.test(text) || /^\(.*\)$/.test(text);
    text = text.replace(/[()$,+\s-]/g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;

    const [whole, fraction = ""] = text.split(".");
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    if (!Number.isSafeInteger(cents) || cents === 0) return null;
    return negative ? -cents : cents;
}


function importKey(transaction) {
    return `${transaction.date}|${transaction.name.trim().toLowerCase().replace(/\s+/g, " ")}|${moneyToCents(transaction.amount)}`;
}


function buildImportRows(csv, columns, dateFormat, amountStyle, savedTransactions, rules = []) {
    const existing = new Set(savedTransactions.map(importKey));
    const seen = new Set();

    return csv.rows.map(function(row, index) {
        const date = importDate(row[columns.date], dateFormat);
        const name = (row[columns.name] || "").trim();
        let cents = null;

        if (amountStyle === "separate") {
            const debitText = row[columns.debit] || "";
            const creditText = row[columns.credit] || "";
            const debit = debitText.trim() ? importCents(debitText) : 0;
            const credit = creditText.trim() ? importCents(creditText) : 0;
            if (debit !== null && credit !== null &&
                ((debit === 0) !== (credit === 0))) {
                cents = credit ? Math.abs(credit) : -Math.abs(debit);
            }
        } else {
            cents = importCents(row[columns.amount]);
            if (cents !== null && amountStyle === "positive-expense") cents = -Math.abs(cents);
        }

        if (!date || !name || cents === null) {
            return { line: index + 2, error: "Check date, description, or amount" };
        }

        const category = columns.category !== "" ? (row[columns.category] || "").trim() : "";
        const transaction = {
            type: cents > 0 ? "Income" : "Expense",
            name: name,
            category: category || (cents > 0 ? "Income" : "Other"),
            amount: centsToMoney(cents),
            date: date,
            notes: "",
            source: "csv"
        };
        const rule = !category && typeof findCategoryRule === "function"
            ? findCategoryRule(transaction, rules)
            : null;

        if (rule) {
            transaction.category = rule.category;
            transaction.categoryRuleId = rule.id;
            transaction.categoryReason = `Rule for ${rule.label || rule.name}`;
        } else if (category) {
            transaction.categoryReason = "From your CSV";
        } else {
            transaction.reviewStatus = "needs-review";
        }

        const key = importKey(transaction);
        transaction.importKey = key;
        const duplicate = existing.has(key) || seen.has(key);
        seen.add(key);

        return { line: index + 2, transaction: transaction, duplicate: duplicate };
    });
}
