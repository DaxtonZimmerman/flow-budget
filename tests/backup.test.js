const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("a version 1 backup without IDs restores and gains stable IDs", async () => {
    const saved = new Map();
    const buttons = {};
    let reloaded = false;
    const backup = {
        version: 1,
        transactions: [{ name: "Groceries", category: "Food", amount: -12.34, date: "2026-10-01" }],
        budgets: [{ category: "Food", limit: 300 }],
        budgetsByMonth: { "2026-10": [{ category: "Food", limit: 250 }] }
    };
    const elements = {
        "#download-backup": { addEventListener: (event, fn) => { buttons.download = fn; } },
        "#restore-backup": { addEventListener: (event, fn) => { buttons.restore = fn; } },
        "#backup-file": { files: [{ text: async () => JSON.stringify(backup) }] },
        "#backup-message": { textContent: "" }
    };
    const context = vm.createContext({
        crypto: require("node:crypto"),
        localStorage: {
            getItem: key => saved.has(key) ? saved.get(key) : null,
            setItem: (key, value) => saved.set(key, value),
            removeItem: key => saved.delete(key)
        },
        document: { querySelector: selector => elements[selector] },
        window: { confirm: () => true, location: { reload: () => { reloaded = true; } } }
    });

    for (const file of ["money-data.js", "backup.js"]) {
        const source = fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8");
        vm.runInContext(source, context);
    }

    assert.equal(vm.runInContext("validBackup(" + JSON.stringify(backup) + ")", context), true);
    await buttons.restore();

    const transactions = JSON.parse(saved.get("transactions"));
    const budgets = JSON.parse(saved.get("budgets"));
    const monthlyBudgets = JSON.parse(saved.get("budgetsByMonth"));

    assert.equal(reloaded, true);
    assert.ok(transactions[0].id);
    assert.equal(transactions[0].amount, -12.34);
    assert.ok(budgets[0].id);
    assert.ok(monthlyBudgets["2026-10"][0].id);
});
