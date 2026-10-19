/* category rules and recurring suggestions */

function normalizedName(name) {
    return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}


function loadCategoryRules() {
    return JSON.parse(localStorage.getItem("categoryRules")) || [];
}


function loadRecurringItems() {
    return JSON.parse(localStorage.getItem("recurringItems")) || [];
}


function findCategoryRule(transaction, rules) {
    return rules.find(function(rule) {
        return !rule.bankType && rule.name === normalizedName(transaction.name) &&
            rule.type === transaction.type;
    });
}


function needsTransactionReview(transaction) {
    if (!transaction.date) return true;
    if (transaction.reviewStatus === "reviewed") return false;

    return transaction.reviewStatus === "needs-review" ||
        (transaction.source === "csv" && transaction.category === "Other");
}


function reviewGroups(transactions) {
    const groups = new Map();

    for (const transaction of transactions) {
        if (!needsTransactionReview(transaction) || !transaction.date) continue;
        const direction = transaction.amount < 0 ? "out" : "in";
        const key = `${transaction.source || "manual"}|${direction}|${normalizedName(transaction.name)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(transaction);
    }

    return [...groups.entries()].map(function([key, items]) {
        const first = items[0];
        return {
            key: key,
            name: first.name,
            count: items.length,
            items: items,
            likelyTransfer: items.every(item => item.source === "bank") &&
                /\btransfer\b/i.test(first.name)
        };
    }).sort(function(first, second) {
        return Number(second.likelyTransfer) - Number(first.likelyTransfer) ||
            second.count - first.count || first.name.localeCompare(second.name);
    });
}


function applyReviewChoice(transactions, selected, type, category) {
    const ids = new Set(selected.map(item => String(item.id)));
    let count = 0;

    for (const transaction of transactions) {
        if (!ids.has(String(transaction.id)) || !needsTransactionReview(transaction) ||
            !transaction.date) continue;

        if (transaction.source === "bank") {
            transaction.type = type;
            transaction.bankTypeRuleId = undefined;
            transaction.typeOverride = type !== (transaction.amount < 0 ? "Expense" : "Income");
        } else if (type !== "Transfer" && type !== "Refund") {
            transaction.type = type;
        }

        if (category) {
            transaction.category = category;
            transaction.categoryReason = "Chosen by you";
            transaction.categoryRuleId = undefined;
        }

        transaction.reviewStatus = "reviewed";
        delete transaction.transferMatchIssue;
        count++;
    }

    return count;
}


/* Transfer rules stay inside one bank account and one money direction. */

function canRememberTransfers(items) {
    return items.length > 0 && items.every(item => item.source === "bank" &&
        typeof item.accountId === "string" && item.accountId.length > 0 &&
        normalizedName(item.name) && Number.isFinite(item.amount) && item.amount !== 0);
}


function rememberTransferChoices(transactions, selected, rules) {
    if (!canRememberTransfers(selected)) {
        throw new Error("Sync this bank first so Flow can remember its account details.");
    }
    const selectedIds = new Set(selected.map(item => String(item.id)));
    const savedRules = [];
    for (const item of selected) {
        const name = normalizedName(item.name);
        const direction = item.amount < 0 ? "Expense" : "Income";
        let rule = rules.find(candidate => candidate.bankType === "Transfer" &&
            candidate.name === name && candidate.type === direction &&
            candidate.accountId === item.accountId);
        if (!rule) {
            rule = { id: makeRecordId(rules), name: name, label: item.name,
                type: direction, category: "Other", bankType: "Transfer",
                accountId: item.accountId };
            rules.push(rule);
        }
        if (!savedRules.includes(rule)) savedRules.push(rule);
    }
    for (const item of transactions) {
        const selectedNow = selectedIds.has(String(item.id));
        if (item.source !== "bank" || (!selectedNow &&
            (!needsTransactionReview(item) || (item.typeOverride && !item.bankTypeRuleId)))) continue;
        const rule = savedRules.find(candidate => candidate.name === normalizedName(item.name) &&
            candidate.accountId === item.accountId &&
            candidate.type === (item.amount < 0 ? "Expense" : "Income"));
        if (!rule) continue;
        item.type = "Transfer";
        delete item.transferMatchIssue;
        item.typeOverride = true;
        item.bankTypeRuleId = rule.id;
        if (item.date) item.reviewStatus = "reviewed";
    }
    return savedRules;
}


function forgetTransferChoice(transactions, rule) {
    for (const item of transactions) {
        if (item.source !== "bank" || item.bankTypeRuleId !== rule.id) continue;
        item.type = item.amount < 0 ? "Expense" : "Income";
        item.typeOverride = false;
        item.bankTypeRuleId = undefined;
        item.reviewStatus = "needs-review";
    }
}


function nextMonthlyDate(date) {
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));
    const day = Number(date.slice(8, 10));
    const lastDay = new Date(year, month + 1, 0).getDate();
    const nextDay = Math.min(day, lastDay);
    const next = new Date(year, month, nextDay);

    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}


function recurringSuggestions(transactions, decisions, today) {
    const groups = {};

    for (const transaction of transactions) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(transaction.date || "") ||
            !transaction.name || !Number.isFinite(transaction.amount) ||
            moneyToCents(transaction.amount) === 0 ||
            transaction.type === "Transfer" || transaction.type === "Refund" ||
            transaction.status === "pending") {
            continue;
        }

        const dateTime = Date.parse(`${transaction.date}T00:00:00Z`);
        if (!Number.isFinite(dateTime) ||
            new Date(dateTime).toISOString().slice(0, 10) !== transaction.date) continue;

        const type = transaction.amount > 0 ? "Income" : "Expense";
        const key = `${type}|${normalizedName(transaction.name)}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(transaction);
    }

    const suggestions = [];
    const todayTime = Date.parse(`${today}T00:00:00Z`);

    for (const key of Object.keys(groups)) {
        if (decisions.some(item => item.key === key)) continue;

        const entries = groups[key].sort((first, second) => first.date.localeCompare(second.date));
        if (entries.length < 2) continue;

        const latest = entries[entries.length - 1];
        const previous = entries[entries.length - 2];
        const gap = (Date.parse(`${latest.date}T00:00:00Z`) -
            Date.parse(`${previous.date}T00:00:00Z`)) / 86400000;
        const age = (todayTime - Date.parse(`${latest.date}T00:00:00Z`)) / 86400000;
        const difference = Math.abs(moneyToCents(latest.amount) - moneyToCents(previous.amount));
        const allowedDifference = Math.max(500, Math.round(Math.abs(moneyToCents(latest.amount)) * 0.1));

        if (gap < 25 || gap > 35 || age < 0 || age > 45 ||
            difference > allowedDifference) continue;

        let nextDate = nextMonthlyDate(latest.date);
        while (nextDate < today) nextDate = nextMonthlyDate(nextDate);

        suggestions.push({
            key: key,
            name: latest.name,
            type: latest.amount > 0 ? "Income" : "Expense",
            amount: latest.amount,
            category: latest.category,
            lastDate: latest.date,
            nextDate: nextDate,
            frequency: "monthly"
        });
    }

    return suggestions.sort((first, second) => first.nextDate.localeCompare(second.nextDate));
}
