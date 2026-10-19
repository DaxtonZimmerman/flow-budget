let flowReviewDraft = false;
window.hasFlowReviewDraft = () => flowReviewDraft;
for (const name of ['input', 'change']) document.addEventListener(name, event => {
    if (event.target.closest('.review-controls')) flowReviewDraft = true;
});
if (typeof lucide !== "undefined") lucide.createIcons();

let transactions = loadTransactions();
let categoryRules = loadCategoryRules();
let recurringItems = loadRecurringItems();
const reviewOwner = localStorage.getItem('flow_user_id');
function reviewStorageStamp() { return JSON.stringify(['transactions', 'categoryRules', 'recurringItems'].map(key => localStorage.getItem(key))); }
let reviewStorageBase = reviewStorageStamp();
function reloadReviewData() {
    transactions = loadTransactions(); categoryRules = loadCategoryRules(); recurringItems = loadRecurringItems();
    reviewStorageBase = reviewStorageStamp();
}

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
const quickReviewDrafts = new Map();
const expandedReviewGroups = new Set();

let reviewScope = new URLSearchParams(location.search).get('scope') === 'all' ? 'all' : 'new';
function inReviewScope(item) { return reviewScope === 'all' || !item.date || item.date >= currentReviewStart(); }
function scopedReviewItems() { return transactions.filter(inReviewScope); }
for (const tab of document.querySelectorAll('[data-review-scope]')) {
    tab.addEventListener('click', () => {
        reviewScope = tab.dataset.reviewScope;
        quickReviewLimit = 12; quickReviewDrafts.clear();
        const url = new URL(location.href);
        if (reviewScope === 'all') url.searchParams.set('scope', 'all'); else url.searchParams.delete('scope');
        history.replaceState(null, '', url); showReview();
    });
}



function typeChoices(transaction) {
    return transaction.amount < 0 ? ["Expense", "Transfer"]
        : ["Income", "Refund", "Transfer"];
}


function makeTypeSelect(transaction, suggestedTransfer = false) {
    const select = document.createElement("select");
    for (const type of typeChoices(transaction)) select.add(new Option(type, type));
    select.value = suggestedTransfer ? "Transfer" : transaction.type || (transaction.amount < 0 ? "Expense" : "Income");
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
    if (reviewOwner !== localStorage.getItem('flow_user_id') || reviewStorageBase !== reviewStorageStamp()) {
        const message = 'New activity or saved changes arrived. Your last choice was not applied. Check the refreshed list and try again.';
        reviewMessage.textContent = message; quickReviewMessage.textContent = message;
        reloadReviewData(); return false;
    }
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
        reloadReviewData();
        return false;
    }

    reviewStorageBase = reviewStorageStamp();
    if (typeof flowDataChanged === "function") flowDataChanged();
    return true;
}


function showInbox() {
    inbox.replaceChildren();
    const items = scopedReviewItems().filter(needsTransactionReview);
    document.querySelector("#review-count").textContent =
        `${items.length} item${items.length === 1 ? "" : "s"}`;
    document.querySelector("#review-empty").hidden = items.length > 0;

    for (const transaction of items) {
        const row = document.createElement("div");
        row.className = "review-row";
        const info = document.createElement("div");
        const openTransaction = makeButton(transaction.name, "transaction-open-button", () => FlowTransactionDetails.open(transaction.id));
        openTransaction.setAttribute("aria-label", `Open ${transaction.name} transaction`);
        info.appendChild(openTransaction);
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
            if (remember && type === "Refund") {
                reviewMessage.textContent = "Save this refund once. Remember is available for categories and confirmed transfers.";
                return;
            }
            const rememberTransfer = remember && type === "Transfer";
            if (rememberTransfer && !canRememberTransfers([transaction])) {
                reviewMessage.textContent = "Sync this bank first so Flow can remember its account details.";
                return;
            }
            const name = normalizedName(transaction.name);
            let rule = null;

            if (remember && !rememberTransfer) {
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
            transaction.categoryReason = remember && !rememberTransfer
                ? `Rule for ${rule.label || rule.name}` : "Chosen by you";
            transaction.categoryRuleId = remember && !rememberTransfer ? rule.id : undefined;
            transaction.bankTypeRuleId = undefined;
            transaction.reviewStatus = "reviewed";

            if (rememberTransfer) rememberTransferChoices(transactions, [transaction], categoryRules);
            const changes = { transactions: transactions };
            if (remember) changes.categoryRules = categoryRules;
            if (!saveReviewData(changes)) {
                showReview();
                return;
            }

            reviewMessage.textContent = rememberTransfer
                ? `Saved ${transaction.name}. Future entries with this exact name, bank account, and money direction will be transfers.`
                : remember ? `Saved ${transaction.name}. Future matches will use ${category}.`
                : `Saved ${transaction.name}.`;
            showReview();
        };

        controls.appendChild(dateLabel);
        controls.appendChild(categoryLabel);
        controls.appendChild(makeButton("Save", "back-button", () => save(false)));
        const rememberButton = makeButton("Save and remember", "save-button", () => save(true));
        controls.appendChild(rememberButton);
        if (typeSelect) {
            const updateTypeControls = () => {
                categorySelect.disabled = typeSelect.value === "Transfer";
                categoryLabel.firstChild.textContent = typeSelect.value === "Transfer" ? "Category · not needed" : "Category";
                rememberButton.disabled = typeSelect.value === "Refund";
                rememberButton.title = typeSelect.value === "Transfer"
                    ? "Remember transfers with this exact name, bank account, and money direction."
                    : typeSelect.value === "Refund" ? "Refunds are saved individually." : "Remember this category.";
            };
            typeSelect.addEventListener("change", updateTypeControls);
            updateTypeControls();
        }
        row.appendChild(controls);
        inbox.appendChild(row);
    }
}


function showQuickReview() {
    const groups = reviewGroups(scopedReviewItems());
    const remaining = scopedReviewItems().filter(needsTransactionReview).length;
    const likelyTransfers = groups.filter(group => group.likelyTransfer);
    quickReviewBanner.hidden = remaining === 0;
    document.querySelector("#review-all-clear").hidden = remaining > 0;
    document.querySelector("#review-total-stat").textContent = remaining;
    document.querySelector("#review-group-stat").textContent = groups.length;
    document.querySelector("#review-rule-stat").textContent = categoryRules.length;
    document.querySelector("#individual-review-count").textContent = `${remaining} items`;
    document.dispatchEvent(new Event("flow-review-updated"));
    document.querySelector("#quick-review-summary").textContent =
        `${remaining} transactions need a decision. ${likelyTransfers.length} name groups look like transfers; confirm those first.`;
    quickReviewGroups.replaceChildren();

    for (const group of groups.slice(0, quickReviewLimit)) {
        const row = document.createElement("div");
        row.className = "review-row quick-review-group";
        row.dataset.groupKey = group.key;
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
        const draft = quickReviewDrafts.get(group.key);
        if (draft) {
            if (typeSelect && [...typeSelect.options].some(option => option.value === draft.type)) typeSelect.value = draft.type;
            categorySelect.value = draft.category;
            rememberInput.checked = draft.remember;
        }
        const keepDraft = () => quickReviewDrafts.set(group.key, {
            type: typeSelect ? typeSelect.value : group.items[0].type,
            category: categorySelect.value, remember: rememberInput.checked
        });
        categorySelect.addEventListener("change", keepDraft);
        rememberInput.addEventListener("change", keepDraft);
        typeSelect?.addEventListener("change", keepDraft);
        if (typeSelect) {
            const updateGroupControls = () => {
                const transfer = typeSelect.value === "Transfer";
                categorySelect.disabled = transfer;
                categoryLabel.firstChild.textContent = transfer ? "Category · not needed" : "Category";
                rememberInput.disabled = typeSelect.value === "Refund";
                rememberLabel.lastChild.textContent = transfer ? "Remember transfers" : "Remember category";
                rememberInput.title = transfer
                    ? "Use Transfer for future entries with this exact name, bank account, and money direction."
                    : typeSelect.value === "Refund" ? "Refunds are saved individually." : "Remember this category.";
                if (rememberInput.disabled) rememberInput.checked = false;
            };
            typeSelect.addEventListener("change", updateGroupControls);
            updateGroupControls();
        }
        controls.appendChild(makeButton(`Apply to ${group.count}`, "save-button", function() {
            const type = typeSelect ? typeSelect.value : group.items[0].type;
            const inferredType = group.items[0].amount < 0 ? "Expense" : "Income";
            const rememberTransfer = rememberInput.checked && type === "Transfer";
            if (rememberInput.checked && !rememberTransfer && (!categorySelect.value || type !== inferredType)) {
                quickReviewMessage.textContent = "Choose a category to remember. Refunds are saved individually.";
                return;
            }
            if (rememberTransfer && !canRememberTransfers(group.items)) {
                quickReviewMessage.textContent = "Sync this bank first so Flow can remember its account details.";
                return;
            }
            const count = applyReviewChoice(transactions, group.items,
                type, categorySelect.value);
            const changes = { transactions: transactions };
            if (rememberTransfer) {
                rememberTransferChoices(transactions, group.items, categoryRules);
                changes.categoryRules = categoryRules;
            } else if (rememberInput.checked) {
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
                return showReview();
            }
            quickReviewDrafts.delete(group.key);
            quickReviewMessage.textContent = rememberTransfer
                ? `Updated ${count} transactions. Future entries with this exact name, bank account, and money direction will be transfers.`
                : `Updated ${count} ${group.name} transaction${count === 1 ? "" : "s"}.`;
            showReview();
        }));
        row.appendChild(controls);
        const entries = transactionsForReviewGroup(transactions, group);
        const individual = document.createElement("details");
        individual.className = "quick-review-transactions";
        individual.open = expandedReviewGroups.has(group.key);
        const summary = document.createElement("summary");
        summary.appendChild(makeText("span", entries.length === 1 ? "View transaction" : `View ${entries.length} transactions`));
        summary.appendChild(makeText("span", "⌄"));
        summary.setAttribute("aria-label", `View ${group.name} transactions individually`);
        individual.appendChild(summary);
        const hint = makeText("p", "Different reasons for each payment? Choose a category for each one.");
        hint.className = "quick-review-individual-help";
        individual.appendChild(hint);
        const list = document.createElement("div");
        list.className = "quick-review-transaction-list";
        for (const entry of entries) {
            const item = makeButton("", "quick-review-transaction", () => FlowTransactionDetails.open(entry.id));
            const info = document.createElement("span");
            const date = entry.date ? new Date(`${entry.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Date needed";
            info.appendChild(makeText("strong", date));
            const category = entry.type === "Transfer" ? "Transfer" : entry.category || "Other";
            info.appendChild(makeText("small", `${category}${entry.notes ? ` · ${entry.notes}` : ""}`));
            item.appendChild(info);
            const amount = makeText("strong", `${entry.amount < 0 ? "−" : "+"}${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(entry.amount))}`);
            item.appendChild(amount);
            item.appendChild(makeText("span", "›"));
            item.setAttribute("aria-label", `Open ${entry.name}, ${date}, ${amount.textContent}`);
            list.appendChild(item);
        }
        individual.appendChild(list);
        individual.addEventListener("toggle", () => {
            if (individual.open) expandedReviewGroups.add(group.key);
            else expandedReviewGroups.delete(group.key);
        });
        row.appendChild(individual);
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
        info.appendChild(makeText("span", rule.bankType === "Transfer"
            ? `${rule.type === "Income" ? "Money in" : "Money out"} → Transfer · exact bank name and account match`
            : `${rule.type} → ${rule.category} · exact name match`));
        row.appendChild(info);
        row.appendChild(makeButton(rule.bankType === "Transfer" ? "Remove transfer rule" : "Remove rule and undo auto categories", "back-button", function() {
            categoryRules = categoryRules.filter(item => item.id !== rule.id);

            if (rule.bankType === "Transfer") forgetTransferChoice(transactions, rule);
            for (const transaction of transactions) {
                if (transaction.categoryRuleId !== rule.id) continue;
                transaction.category = transaction.amount > 0 ? "Income" : "Other";
                transaction.categoryReason = "";
                transaction.categoryRuleId = undefined;
                transaction.reviewStatus = "needs-review";
            }

            if (!saveReviewData({ categoryRules: categoryRules, transactions: transactions })) return showReview();
            reviewMessage.textContent = rule.bankType === "Transfer"
                ? `Removed the transfer rule for ${rule.label || rule.name}. Its entries are back in review.`
                : `Removed the rule for ${rule.name} and undid its automatic categories.`;
            showReview();
        }));
        rulesList.appendChild(row);
    }
}


function showReview() {
    flowReviewDraft = false;
    for (const tab of document.querySelectorAll('[data-review-scope]')) {
        const active = tab.dataset.reviewScope === reviewScope;
        tab.classList.toggle('active', active); tab.setAttribute('aria-pressed', String(active));
    }
    document.querySelector('#review-scope-help').textContent = reviewScope === 'all'
        ? 'Older history is optional. Sort it whenever you want, or open an individual payment in Activity.'
        : `Recent activity since ${currentReviewStart()}. Older history can wait; it does not block your payday setup.`;
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
    const selected = reviewGroups(scopedReviewItems())
        .filter(group => !group.likelyTransfer)
        .flatMap(group => group.items);
    let count = 0;
    for (const transaction of selected) {
        count += applyReviewChoice(transactions, [transaction], transaction.type, "");
    }
    if (!saveReviewData({ transactions: transactions })) {
        return showReview();
    }
    quickReviewMessage.textContent = `Kept the current categories for ${count} transactions. Check the remaining possible transfers.`;
    showReview();
});

showReview();

const firstRunKey = `flow_quick_review_seen_${localStorage.getItem("flow_user_id") || "device"}`;
if ((new URLSearchParams(location.search).get("quick") === "1" && scopedReviewItems().some(needsTransactionReview)) ||
    (scopedReviewItems().filter(item => item.source === "bank" && needsTransactionReview(item)).length >= 20 &&
    sessionStorage.getItem(firstRunKey) !== "1")) {
    sessionStorage.setItem(firstRunKey, "1");
    quickReviewDialog.showModal();
}

function refreshReviewedTransactions(event) {
    const currentOpenGroup = [...document.querySelectorAll(".quick-review-transactions[open]")].map(item => item.closest("[data-group-key]").dataset.groupKey);
    for (const key of currentOpenGroup) expandedReviewGroups.add(key);
    reloadReviewData();
    if (event.type === "flow-transaction-updated") {
        quickReviewMessage.textContent = "Saved this transaction. The other payments keep their categories.";
        reviewMessage.textContent = "Saved this transaction.";
    }
    showReview();
    if (event.type === "flow-transaction-updated" && quickReviewDialog.open) {
        const target = [...document.querySelectorAll(".quick-review-group")].find(item => currentOpenGroup.includes(item.dataset.groupKey));
        (target?.querySelector("summary") || document.querySelector("#close-quick-review")).focus({ preventScroll: true });
    }
}
document.addEventListener("flow-transaction-updated", refreshReviewedTransactions);
document.addEventListener("flow-transaction-view-refresh", refreshReviewedTransactions);

quickReviewDialog.addEventListener('close', () => {
    flowReviewDraft = false;
    if (typeof flushFlowDataViews === 'function') flushFlowDataViews();
});
