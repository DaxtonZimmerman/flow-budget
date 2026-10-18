if (typeof lucide !== "undefined") lucide.createIcons();

let transactions = loadTransactions();
let categoryRules = loadCategoryRules();
let recurringItems = loadRecurringItems();

const reviewMessage = document.querySelector("#review-message");
const inbox = document.querySelector("#review-inbox");
const suggestionsList = document.querySelector("#recurring-suggestions");
const decisionsList = document.querySelector("#recurring-confirmed");
const rulesList = document.querySelector("#category-rules");
const quickReviewBanner = document.querySelector("#quick-review-banner");
const quickReviewDialog = document.querySelector("#quick-review-dialog");
const quickReviewGroups = document.querySelector("#quick-review-groups");
const quickReviewMessage = document.querySelector("#quick-review-message");
const categories = ["Salary", "Income", "Food", "Transport", "Entertainment", "Shopping", "Bills", "Other"];
let quickReviewLimit = 12;


function typeChoices(transaction) {
    return transaction.amount < 0 ? ["Expense", "Transfer"]
        : ["Income", "Refund", "Transfer"];
}


function makeTypeSelect(transaction, suggestedTransfer = false) {
    const select = document.createElement("select");
    for (const type of typeChoices(transaction)) select.add(new Option(type, type));
    select.value = suggestedTransfer ? "Transfer" : transaction.type;
    return select;
}


function todayString() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}


function makeText(tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
}


function makeButton(text, className, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", action);
    return button;
}


/* save all changed lists together */

function saveReviewData(changes) {
    const previous = {};

    for (const key of Object.keys(changes)) {
        previous[key] = localStorage.getItem(key);
    }

    try {
        for (const key of Object.keys(changes)) {
            localStorage.setItem(key, JSON.stringify(changes[key]));
        }
    } catch (error) {
        for (const key of Object.keys(previous)) {
            if (previous[key] === null) localStorage.removeItem(key);
            else localStorage.setItem(key, previous[key]);
        }
        reviewMessage.textContent = "Flow could not save this choice. Check browser storage and try again.";
        transactions = loadTransactions();
        categoryRules = loadCategoryRules();
        recurringItems = loadRecurringItems();
        return false;
    }

    if (typeof flowDataChanged === "function") flowDataChanged();
    return true;
}


function showInbox() {
    inbox.replaceChildren();
    const items = transactions.filter(needsTransactionReview);
    document.querySelector("#review-count").textContent =
        `${items.length} item${items.length === 1 ? "" : "s"}`;
    document.querySelector("#review-empty").hidden = items.length > 0;

    for (const transaction of items) {
        const row = document.createElement("div");
        row.className = "review-row";
        const info = document.createElement("div");
        info.appendChild(makeText("strong", transaction.name));
        info.appendChild(makeText("span", `${transaction.type || (transaction.amount > 0 ? "Income" : "Expense")} · $${Math.abs(transaction.amount).toFixed(2)} · ${transaction.date || "Date needed"}`));
        row.appendChild(info);

        const controls = document.createElement("div");
        controls.className = "review-controls";

        const dateLabel = makeText("label", "Date");
        const dateInput = document.createElement("input");
        dateInput.type = "date";
        dateInput.value = transaction.date || "";
        dateLabel.appendChild(dateInput);

        const categoryLabel = makeText("label", "Category");
        const categorySelect = document.createElement("select");
        const choices = transaction.category && !categories.includes(transaction.category)
            ? [...categories, transaction.category] : categories;

        for (const category of choices) {
            const option = document.createElement("option");
            option.value = category;
            option.textContent = category;
            categorySelect.appendChild(option);
        }
        categorySelect.value = transaction.category || "Other";
        categoryLabel.appendChild(categorySelect);

        let typeSelect = null;
        if (transaction.source === "bank") {
            const typeLabel = makeText("label", "Type");
            typeSelect = makeTypeSelect(transaction);
            typeLabel.appendChild(typeSelect);
            controls.appendChild(typeLabel);
        }

        const save = function(remember) {
            if (!dateInput.value) {
                reviewMessage.textContent = `Choose a date for ${transaction.name} first.`;
                dateInput.focus();
                return;
            }

            const category = categorySelect.value;
            const type = typeSelect ? typeSelect.value
                : transaction.amount > 0 ? "Income" : "Expense";
            if (remember && type !== (transaction.amount > 0 ? "Income" : "Expense")) {
                reviewMessage.textContent = "Save this transfer or refund once; category rules do not change transaction types.";
                return;
            }
            const name = normalizedName(transaction.name);
            let rule = null;

            if (remember) {
                rule = findCategoryRule({ name: transaction.name, type: type }, categoryRules);
                if (rule) rule.category = category;
                else {
                    rule = { id: makeRecordId(categoryRules), name: name,
                        label: transaction.name, type: type, category: category };
                    categoryRules.push(rule);
                }

                for (const item of transactions) {
                    if (item.categoryRuleId === rule.id ||
                        ((item.source === "csv" || item.source === "bank") &&
                            item.reviewStatus !== "reviewed" &&
                            normalizedName(item.name) === name &&
                            (item.amount > 0 ? "Income" : "Expense") === type &&
                            item.type === type)) {
                        item.category = category;
                        item.categoryReason = `Rule for ${rule.label || rule.name}`;
                        item.categoryRuleId = rule.id;
                        if (item.date) item.reviewStatus = "reviewed";
                    }
                }
            }

            transaction.date = dateInput.value;
            if (typeSelect) {
                transaction.type = type;
                transaction.typeOverride = type !==
                    (transaction.amount > 0 ? "Income" : "Expense");
            }
            transaction.category = category;
            transaction.categoryReason = remember
                ? `Rule for ${rule.label || rule.name}` : "Chosen by you";
            transaction.categoryRuleId = remember ? rule.id : undefined;
            transaction.reviewStatus = "reviewed";

            const changes = { transactions: transactions };
            if (remember) changes.categoryRules = categoryRules;
            if (!saveReviewData(changes)) {
                showReview();
                return;
            }

            reviewMessage.textContent = remember
                ? `Saved ${transaction.name}. Future matches will use ${category}.`
                : `Saved ${transaction.name}.`;
            showReview();
        };

        controls.appendChild(dateLabel);
        controls.appendChild(categoryLabel);
        controls.appendChild(makeButton("Save", "back-button", () => save(false)));
        controls.appendChild(makeButton("Save and remember", "save-button", () => save(true)));
        row.appendChild(controls);
        inbox.appendChild(row);
    }
}


function showQuickReview() {
    const groups = reviewGroups(transactions);
    const remaining = transactions.filter(needsTransactionReview).length;
    const likelyTransfers = groups.filter(group => group.likelyTransfer);
    quickReviewBanner.hidden = remaining === 0;
    document.querySelector("#quick-review-summary").textContent =
        `${remaining} transactions need a decision. ${likelyTransfers.length} name groups look like transfers; confirm those first.`;
    quickReviewGroups.replaceChildren();

    for (const group of groups.slice(0, quickReviewLimit)) {
        const row = document.createElement("div");
        row.className = "review-row quick-review-group";
        const info = document.createElement("div");
        info.appendChild(makeText("strong", group.name));
        info.appendChild(makeText("span", `${group.count} transaction${group.count === 1 ? "" : "s"} · ${group.items[0].amount < 0 ? "Money out" : "Money in"}`));
        if (group.likelyTransfer) {
            info.appendChild(makeText("small", "Looks like a transfer. Choose Transfer only if this money moved between accounts you own."));
        }
        row.appendChild(info);

        const controls = document.createElement("div");
        controls.className = "review-controls";
        let typeSelect = null;
        if (group.items[0].source === "bank") {
            const typeLabel = makeText("label", "Type");
            typeSelect = makeTypeSelect(group.items[0], group.likelyTransfer);
            typeLabel.appendChild(typeSelect);
            controls.appendChild(typeLabel);
        }

        const categoryLabel = makeText("label", "Category");
        const categorySelect = document.createElement("select");
        categorySelect.add(new Option("Keep current", ""));
        for (const category of categories) categorySelect.add(new Option(category, category));
        categoryLabel.appendChild(categorySelect);
        controls.appendChild(categoryLabel);
        const rememberLabel = makeText("label", "Remember");
        rememberLabel.className = "quick-review-remember";
        const rememberInput = document.createElement("input");
        rememberInput.type = "checkbox";
        rememberLabel.prepend(rememberInput);
        controls.appendChild(rememberLabel);
        controls.appendChild(makeButton(`Apply to ${group.count}`, "save-button", function() {
            const type = typeSelect ? typeSelect.value : group.items[0].type;
            const inferredType = group.items[0].amount < 0 ? "Expense" : "Income";
            if (rememberInput.checked && (!categorySelect.value || type !== inferredType)) {
                quickReviewMessage.textContent =
                    "To remember a category, choose one and keep the normal income or expense type. Transfers are chosen per transaction.";
                return;
            }
            const before = JSON.stringify(transactions);
            const count = applyReviewChoice(transactions, group.items,
                type, categorySelect.value);
            const changes = { transactions: transactions };
            if (rememberInput.checked) {
                const name = normalizedName(group.name);
                let rule = findCategoryRule({ name: group.name, type: type }, categoryRules);
                if (rule) rule.category = categorySelect.value;
                else {
                    rule = { id: makeRecordId(categoryRules), name: name,
                        label: group.name, type: type, category: categorySelect.value };
                    categoryRules.push(rule);
                }
                for (const item of group.items) {
                    item.categoryRuleId = rule.id;
                    item.categoryReason = `Rule for ${rule.label || rule.name}`;
                }
                changes.categoryRules = categoryRules;
            }
            if (!saveReviewData(changes)) {
                transactions = JSON.parse(before);
                return showReview();
            }
            quickReviewMessage.textContent = `Updated ${count} ${group.name} transaction${count === 1 ? "" : "s"}.`;
            showReview();
        }));
        row.appendChild(controls);
        quickReviewGroups.appendChild(row);
    }

    if (groups.length > quickReviewLimit) {
        quickReviewGroups.appendChild(makeButton(`Show more groups (${groups.length - quickReviewLimit} left)`,
            "back-button quick-review-more", function() {
                quickReviewLimit += 12;
                showQuickReview();
            }));
    }
    document.querySelector("#accept-review-defaults").disabled =
        !groups.some(group => !group.likelyTransfer);
}


function showRecurring() {
    suggestionsList.replaceChildren();
    decisionsList.replaceChildren();
    const suggestions = recurringSuggestions(transactions, recurringItems, todayString());
    document.querySelector("#recurring-empty").hidden = suggestions.length > 0;

    for (const suggestion of suggestions) {
        const row = document.createElement("div");
        row.className = "review-row";
        const info = document.createElement("div");
        info.appendChild(makeText("strong", suggestion.name));
        info.appendChild(makeText("span", `${suggestion.type} · about $${Math.abs(suggestion.amount).toFixed(2)} monthly · last seen ${suggestion.lastDate}`));
        info.appendChild(makeText("small", `Suggested because the two latest matching payments were about a month apart. Next around ${suggestion.nextDate}.`));
        row.appendChild(info);

        const actions = document.createElement("div");
        actions.className = "review-actions";
        actions.appendChild(makeButton("Confirm monthly", "save-button", function() {
            recurringItems.push({ ...suggestion, id: makeRecordId(recurringItems), status: "confirmed" });
            if (!saveReviewData({ recurringItems: recurringItems })) return showReview();
            reviewMessage.textContent = `${suggestion.name} is now tracked as monthly.`;
            showReview();
        }));
        actions.appendChild(makeButton("Not monthly", "back-button", function() {
            recurringItems.push({ id: makeRecordId(recurringItems), key: suggestion.key,
                name: suggestion.name, status: "dismissed" });
            if (!saveReviewData({ recurringItems: recurringItems })) return showReview();
            reviewMessage.textContent = `${suggestion.name} will no longer be suggested.`;
            showReview();
        }));
        row.appendChild(actions);
        suggestionsList.appendChild(row);
    }

    document.querySelector("#confirmed-empty").hidden = recurringItems.length > 0;

    for (const item of recurringItems) {
        const row = document.createElement("div");
        row.className = "review-row";
        const info = document.createElement("div");
        info.appendChild(makeText("strong", item.name));
        const detail = item.status === "confirmed"
            ? `${item.type} · about $${Math.abs(item.amount).toFixed(2)} monthly · confirmed by you`
            : "Not tracking · you can reconsider";
        info.appendChild(makeText("span", detail));
        row.appendChild(info);

        const action = item.status === "confirmed" ? "Stop tracking" : "Reconsider";
        row.appendChild(makeButton(action, "back-button", function() {
            if (item.status === "confirmed") item.status = "dismissed";
            else recurringItems = recurringItems.filter(decision => decision.id !== item.id);
            if (!saveReviewData({ recurringItems: recurringItems })) return showReview();
            reviewMessage.textContent = `${item.name} updated.`;
            showReview();
        }));
        decisionsList.appendChild(row);
    }
}


function showRules() {
    rulesList.replaceChildren();
    document.querySelector("#rules-empty").hidden = categoryRules.length > 0;

    for (const rule of categoryRules) {
        const row = document.createElement("div");
        row.className = "review-row";
        const info = document.createElement("div");
        info.appendChild(makeText("strong", rule.label || rule.name));
        info.appendChild(makeText("span", `${rule.type} → ${rule.category} · exact name match`));
        row.appendChild(info);
        row.appendChild(makeButton("Remove rule and undo auto categories", "back-button", function() {
            categoryRules = categoryRules.filter(item => item.id !== rule.id);

            for (const transaction of transactions) {
                if (transaction.categoryRuleId !== rule.id) continue;
                transaction.category = transaction.amount > 0 ? "Income" : "Other";
                transaction.categoryReason = "";
                transaction.categoryRuleId = undefined;
                transaction.reviewStatus = "needs-review";
            }

            if (!saveReviewData({ categoryRules: categoryRules, transactions: transactions })) return showReview();
            reviewMessage.textContent = `Removed the rule for ${rule.name} and undid its automatic categories.`;
            showReview();
        }));
        rulesList.appendChild(row);
    }
}


function showReview() {
    showInbox();
    showQuickReview();
    showRecurring();
    showRules();
}

document.querySelector("#open-quick-review").addEventListener("click", function() {
    quickReviewDialog.showModal();
});
document.querySelector("#close-quick-review").addEventListener("click", function() {
    quickReviewDialog.close();
});
document.querySelector("#accept-review-defaults").addEventListener("click", function() {
    const selected = reviewGroups(transactions)
        .filter(group => !group.likelyTransfer)
        .flatMap(group => group.items);
    const before = JSON.stringify(transactions);
    let count = 0;
    for (const transaction of selected) {
        count += applyReviewChoice(transactions, [transaction], transaction.type, "");
    }
    if (!saveReviewData({ transactions: transactions })) {
        transactions = JSON.parse(before);
        return showReview();
    }
    quickReviewMessage.textContent = `Kept the current categories for ${count} transactions. Check the remaining possible transfers.`;
    showReview();
});

showReview();

const firstRunKey = `flow_quick_review_seen_${localStorage.getItem("flow_user_id") || "device"}`;
if (transactions.filter(item => item.source === "bank" && needsTransactionReview(item)).length >= 20 &&
    sessionStorage.getItem(firstRunKey) !== "1") {
    sessionStorage.setItem(firstRunKey, "1");
    quickReviewDialog.showModal();
}
