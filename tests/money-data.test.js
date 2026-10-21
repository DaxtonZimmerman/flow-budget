const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const files = ["money-data.js", "budget-data.js"];
const saved = new Map();
const localStorage = {
    getItem: key => saved.has(key) ? saved.get(key) : null,
    setItem: (key, value) => saved.set(key, value)
};
const context = vm.createContext({ localStorage, crypto: require("node:crypto") });

for (const file of files) {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8");
    vm.runInContext(source, context);
}

function run(code) {
    return vm.runInContext(code, context);
}

test("money totals use cents across months and skip repeated IDs", () => {
    const transactions = [
        { id: "a", amount: 0.1, date: "2026-10-01", type: "Income" },
        { id: "b", amount: 0.2, date: "2026-10-02", type: "Income" },
        { id: "c", amount: -0.3, date: "2026-10-03", type: "Expense" },
        { id: "c", amount: -0.3, date: "2026-10-03", type: "Expense" },
        { id: "d", amount: -1.25, date: "2026-09-10", type: "Expense" }
    ];
    context.sample = transactions;

    assert.deepEqual(JSON.parse(JSON.stringify(run('getMoneyTotals(sample, "2026-10")'))), {
        income: 0.3, spending: 0.3, net: 0
    });
    assert.equal(run("getMoneyTotals(sample).net"), -1.25);
});

// IMPORTANT: Unit test. Known inputs verify that a $20 expense minus a $5 refund produces $15 spending, excluding transfers/pending charges.
test("transfers and pending charges do not count; refunds lower spending", () => {
    context.sample = [
        { id: "a", type: "Expense", amount: -20, category: "Food", date: "2026-10-01" },
        { id: "b", type: "Refund", amount: 5, category: "Food", date: "2026-10-02" },
        { id: "c", type: "Transfer", amount: -100, category: "Food", date: "2026-10-03" },
        { id: "d", type: "Expense", amount: -9, status: "pending", category: "Food", date: "2026-10-04" },
        { id: "e", type: "Income", amount: 10, date: "2026-10-05" }
    ];

    assert.equal(run('getMoneyTotals(sample, "2026-10").spending'), 15);
    assert.equal(run('getMoneyTotals(sample, "2026-10").income'), 10);
    assert.equal(run('getBudgetSpending("Food", sample, "2026-10")'), 15);
    assert.equal(run('getSpendingBreakdown(sample, "2026-10", 31).categorySpending.Food'), 15);
});

test("reviewed bank refunds reduce a category budget and transfers stay out", () => {
    context.sample = [
        { id: "charge", source: "bank", type: "Expense", amount: -25,
            category: "Food", date: "2026-10-01", status: "posted" },
        { id: "refund", source: "bank", type: "Refund", amount: 7,
            category: "Food", date: "2026-10-02", status: "posted" },
        { id: "transfer", source: "bank", type: "Transfer", amount: -100,
            category: "Food", date: "2026-10-03", status: "posted" }
    ];

    assert.equal(run('getMoneyTotals(sample, "2026-10").income'), 0);
    assert.equal(run('getMoneyTotals(sample, "2026-10").spending'), 18);
    assert.equal(run('getBudgetSpending("Food", sample, "2026-10")'), 18);
});

test("a posted version counts when a pending version has the same ID", () => {
    context.sample = [
        { id: "bank-1", amount: -8, status: "pending", date: "2026-10-01" },
        { id: "bank-1", amount: -8.25, status: "posted", date: "2026-10-02" }
    ];

    assert.equal(run('getMoneyTotals(sample, "2026-10").spending'), 8.25);
});

test("old records receive unique IDs and keep their original fields", () => {
    saved.clear();
    saved.set("transactions", JSON.stringify([
        { name: "Old", amount: -3, category: "Food" },
        { id: 7, name: "First", amount: 4 },
        { id: 7, name: "Second", amount: 5 }
    ]));

    const transactions = JSON.parse(JSON.stringify(run("loadTransactions()")));
    assert.equal(new Set(transactions.map(item => String(item.id))).size, 3);
    assert.deepEqual(transactions.map(item => item.name), ["Old", "First", "Second"]);
    assert.deepEqual(transactions, JSON.parse(saved.get("transactions")));
    assert.equal(run("loadTransactions()[1].id"), 7);
});

test("legacy budgets gain IDs without losing limits", () => {
    saved.clear();
    saved.set("budgets", JSON.stringify([{ category: "Food", limit: 100 }]));
    const budget = JSON.parse(JSON.stringify(run('loadBudgets("2026-10")[0]')));

    assert.ok(budget.id);
    assert.equal(budget.limit, 100);
    assert.equal(JSON.parse(saved.get("budgets"))[0].id, budget.id);
});
