/* shared money data */

function moneyToCents(amount) {
    return Math.round(Number(amount) * 100);
}


function centsToMoney(cents) {
    return cents / 100;
}


function makeRecordId(records) {
    let id;

    do {
        id = typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `flow-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    } while (records.some(function(record) {
        return String(record.id) === id;
    }));

    return id;
}


function addMissingIds(records) {
    const seenIds = new Set();
    let changed = false;

    for (const record of records) {
        const id = record.id === undefined || record.id === null
            ? ""
            : String(record.id);

        if (!id || seenIds.has(id)) {
            record.id = makeRecordId(records);
            changed = true;
        }

        seenIds.add(String(record.id));
    }

    return changed;
}


function loadTransactions() {
    const transactions = JSON.parse(localStorage.getItem("transactions")) || [];

    if (addMissingIds(transactions)) {
        localStorage.setItem("transactions", JSON.stringify(transactions));
    }

    return transactions;
}


function getMoneyTotals(transactions, month) {
    let incomeCents = 0;
    let spendingCents = 0;
    const seenIds = new Set();

    for (const transaction of transactions) {
        if (month && (!transaction.date || transaction.date.slice(0, 7) !== month)) {
            continue;
        }

        if (transaction.status === "pending" || transaction.type === "Transfer") {
            continue;
        }

        if (transaction.id !== undefined && transaction.id !== null) {
            const id = String(transaction.id);

            if (seenIds.has(id)) {
                continue;
            }

            seenIds.add(id);
        }

        const amountCents = moneyToCents(transaction.amount);

        if (!Number.isFinite(amountCents)) {
            continue;
        }

        if (transaction.type === "Refund") {
            spendingCents -= amountCents;
        } else if (amountCents > 0) {
            incomeCents += amountCents;
        } else {
            spendingCents += Math.abs(amountCents);
        }
    }

    return {
        income: centsToMoney(incomeCents),
        spending: centsToMoney(spendingCents),
        net: centsToMoney(incomeCents - spendingCents)
    };
}


function getSpendingBreakdown(transactions, month, daysInMonth) {
    const weeklyCents = Array(Math.ceil(daysInMonth / 7)).fill(0);
    const categoryCents = {};
    const seenIds = new Set();

    for (const transaction of transactions) {
        if (!transaction.date || transaction.date.slice(0, 7) !== month ||
            transaction.status === "pending" || transaction.type === "Transfer") {
            continue;
        }

        const id = String(transaction.id);

        if (transaction.id !== undefined && seenIds.has(id)) {
            continue;
        }

        seenIds.add(id);

        let spentCents = 0;

        if (transaction.type === "Refund") {
            spentCents = -moneyToCents(transaction.amount);
        } else if (transaction.amount < 0) {
            spentCents = Math.abs(moneyToCents(transaction.amount));
        }

        if (spentCents === 0) {
            continue;
        }

        const category = transaction.category || "Other";
        categoryCents[category] = (categoryCents[category] || 0) + spentCents;

        const day = Number(transaction.date.slice(8, 10));

        if (day >= 1 && day <= daysInMonth) {
            const week = Math.floor((day - 1) / 7);
            weeklyCents[week] += spentCents;
        }
    }

    const categorySpending = {};

    for (const category in categoryCents) {
        categorySpending[category] = centsToMoney(categoryCents[category]);
    }

    return {
        weeklySpending: weeklyCents.map(centsToMoney),
        categorySpending: categorySpending
    };
}
