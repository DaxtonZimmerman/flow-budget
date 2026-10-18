const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const context = vm.createContext({ Date });

for (const file of ["money-data.js", "review-data.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context);
}

function run(code) {
    return vm.runInContext(code, context);
}

test("category rules match exact normalized name and transaction type", () => {
    context.rules = [{ id: "one", name: "coffee shop", type: "Expense", category: "Food" }];
    assert.equal(run('findCategoryRule({ name: "  COFFEE  SHOP ", type: "Expense" }, rules).category'), "Food");
    assert.equal(run('findCategoryRule({ name: "Coffee Shop", type: "Income" }, rules)'), undefined);
    assert.equal(run('findCategoryRule({ name: "Coffee Shop West", type: "Expense" }, rules)'), undefined);
});

test("only unresolved CSV items or missing dates enter the inbox", () => {
    assert.equal(run('needsTransactionReview({ source: "csv", category: "Other", date: "2026-10-01" })'), true);
    assert.equal(run('needsTransactionReview({ source: "csv", category: "Other", date: "2026-10-01", reviewStatus: "reviewed" })'), false);
    assert.equal(run('needsTransactionReview({ category: "Food", date: "" })'), true);
    assert.equal(run('needsTransactionReview({ category: "Other", date: "2026-10-01" })'), false);
});

test("monthly suggestions need two recent similar payments about a month apart", () => {
    context.items = [
        { name: "Rent", amount: -1000, date: "2026-09-01" },
        { name: " RENT ", amount: -1002, date: "2026-10-01" },
        { name: "Groceries", amount: -100, date: "2026-09-02" },
        { name: "Groceries", amount: -103, date: "2026-09-08" }
    ];
    const suggestions = run('recurringSuggestions(items, [], "2026-10-16")');
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].name, " RENT ");
    assert.equal(suggestions[0].nextDate, "2026-11-01");
    context.decisions = [{ key: suggestions[0].key, status: "dismissed" }];
    assert.equal(run('recurringSuggestions(items, decisions, "2026-10-16").length'), 0);
});

test("monthly dates clamp at month end", () => {
    assert.equal(run('nextMonthlyDate("2026-01-31")'), "2026-02-28");
    assert.equal(run('nextMonthlyDate("2024-01-31")'), "2024-02-29");
});

test("quick review groups matching bank names and puts possible transfers first", () => {
    context.items = [
        { id: "1", source: "bank", name: "Store", amount: -5, date: "2026-10-01", reviewStatus: "needs-review" },
        { id: "2", source: "bank", name: " STORE ", amount: -7, date: "2026-10-02", reviewStatus: "needs-review" },
        { id: "3", source: "bank", name: "Home transfer to savings", amount: -10, date: "2026-10-03", reviewStatus: "needs-review" },
        { id: "4", source: "bank", name: "Store", amount: 5, date: "2026-10-04", reviewStatus: "needs-review" }
    ];
    assert.equal(run("reviewGroups(items)[0].likelyTransfer"), true);
    assert.equal(run("reviewGroups(items)[1].count"), 2);
    assert.equal(run("reviewGroups(items).length"), 3);
});

test("quick review changes bank type in a batch and excludes transfers from totals", () => {
    context.items = [
        { id: "1", source: "bank", name: "Transfer", amount: -100, date: "2026-10-01", type: "Expense", reviewStatus: "needs-review" },
        { id: "2", source: "bank", name: "Transfer", amount: -50, date: "2026-10-02", type: "Expense", reviewStatus: "needs-review" }
    ];
    assert.equal(run('applyReviewChoice(items, items, "Transfer", "")'), 2);
    assert.equal(run('items.every(item => item.type === "Transfer" && item.typeOverride && item.reviewStatus === "reviewed")'), true);
    assert.equal(run('getMoneyTotals(items, "2026-10").spending'), 0);
});

test("remembering transfers creates scoped rules and does not touch reviewed or CSV entries", () => {
    context.transferRules = [];
    context.transferItems = [
        { id: "t1", source: "bank", accountId: "checking", name: "Move to savings", amount: -50, date: "2026-10-01", type: "Expense", category: "Food", reviewStatus: "needs-review" },
        { id: "t2", source: "bank", accountId: "savings", name: "Move to savings", amount: -20, date: "2026-10-02", type: "Expense", reviewStatus: "needs-review" },
        { id: "t3", source: "bank", accountId: "checking", name: "Move to savings", amount: 50, date: "2026-10-02", type: "Income", reviewStatus: "needs-review" },
        { id: "t4", source: "bank", accountId: "checking", name: "Move to savings", amount: -30, date: "2026-10-03", type: "Expense", reviewStatus: "reviewed" },
        { id: "t5", source: "csv", name: "Move to savings", amount: -10, date: "2026-10-04", type: "Expense", reviewStatus: "needs-review" }
    ];
    run('rememberTransferChoices(transferItems, [transferItems[0]], transferRules)');
    assert.equal(run('transferRules.length'), 1);
    assert.equal(run('transferRules[0].type'), "Expense");
    assert.equal(run('transferRules[0].bankType'), "Transfer");
    assert.equal(run('transferItems[0].type'), "Transfer");
    assert.equal(run('transferItems[0].category'), "Food");
    assert.equal(run('transferItems[1].type'), "Expense");
    assert.equal(run('transferItems[2].type'), "Income");
    assert.equal(run('transferItems[3].type'), "Expense");
    assert.equal(run('transferItems[4].type'), "Expense");
    run('rememberTransferChoices(transferItems, [transferItems[0]], transferRules)');
    assert.equal(run('transferRules.length'), 1, "repeated remembers reuse the rule");
    assert.equal(run('findCategoryRule({ name: "Move to savings", type: "Expense" }, transferRules)'), undefined);
    assert.equal(run('canRememberTransfers([{ source: "bank", name: "Move", amount: -1 }])'), false);
});

test("removing a remembered transfer only undoes entries still linked to that choice", () => {
    context.undoItems = [
        { id: "auto", source: "bank", name: "Move", amount: -10, type: "Transfer", typeOverride: true, bankTypeRuleId: "rule", category: "Other", reviewStatus: "reviewed" },
        { id: "manual", source: "bank", name: "Move", amount: -20, type: "Transfer", typeOverride: true, category: "Other", reviewStatus: "reviewed" }
    ];
    run('forgetTransferChoice(undoItems, { id: "rule" })');
    assert.equal(run('undoItems[0].type'), "Expense");
    assert.equal(run('undoItems[0].reviewStatus'), "needs-review");
    assert.equal(run('undoItems[0].bankTypeRuleId'), undefined);
    assert.equal(run('undoItems[0].amount'), -10);
    assert.equal(run('undoItems[1].type'), "Transfer");
    assert.equal(run('undoItems[1].reviewStatus'), "reviewed");
});
