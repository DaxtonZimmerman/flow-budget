var flowStorage = typeof flowStorage !== 'undefined' ? flowStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
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
    const transactions = JSON.parse(flowStorage.getItem("transactions")) || [];

    if (addMissingIds(transactions)) {
        flowStorage.setItem("transactions", JSON.stringify(transactions));

        if (typeof flowDataChanged === "function") {
            flowDataChanged();
        }
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

        if (typeof flowReportingAmounts === 'function') {
            const totals = flowReportingAmounts(transaction);
            incomeCents += totals.incomeCents; spendingCents += totals.spendingCents;
        } else if (transaction.type === "Refund") {
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
    const categoryCents = Object.create(null);
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

        const parts = typeof flowTransactionParts === 'function' ? flowTransactionParts(transaction) : [{ category: transaction.category || 'Other', cents: Math.abs(spentCents) }];
        for (const part of parts) {
            if (part.income) continue;
            categoryCents[part.category] = (categoryCents[part.category] || 0) + (transaction.type === 'Refund' ? -1 : 1) * part.cents;
        }
        if (typeof flowReportingAmounts === 'function') spentCents = flowReportingAmounts(transaction).spendingCents;

        const day = Number(transaction.date.slice(8, 10));

        if (day >= 1 && day <= daysInMonth) {
            const week = Math.floor((day - 1) / 7);
            weeklyCents[week] += spentCents;
        }
    }

    const categorySpending = Object.create(null);

    for (const category in categoryCents) {
        categorySpending[category] = centsToMoney(categoryCents[category]);
    }

    return {
        weeklySpending: weeklyCents.map(centsToMoney),
        categorySpending: categorySpending
    };
}
