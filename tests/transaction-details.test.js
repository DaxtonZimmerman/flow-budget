const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const context = vm.createContext({ Date });
for (const file of ["money-data.js", "review-data.js", "bank-data.js", "transaction-details-data.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context);
}
const run = source => vm.runInContext(source, context);
const payment = overrides => ({ id: "venmo-1", bankTransactionId: "bank-1", source: "bank",
    accountId: "checking", name: "Venmo", amount: -25, date: "2026-10-14", type: "Expense",
    category: "Other", categoryRuleId: "venmo-rule", status: "posted", notes: "",
    reviewStatus: "reviewed", ...overrides });
const values = overrides => ({ type: "Expense", category: "Food", date: "2026-10-14", notes: "Dinner", ...overrides });

test("one Venmo payment gets its own category and note without changing the others or its bank facts", () => {
    context.items = [payment(), payment({ id: "venmo-2", bankTransactionId: "bank-2", amount: -40 })];
    context.choice = values();
    context.result = run("transactionWithDetails(items[0], choice, { ...items[0] })");
    assert.equal(context.result.category, "Food");
    assert.equal(context.result.notes, "Dinner");
    assert.equal(context.result.categoryRuleId, undefined);
    for (const key of ["id", "bankTransactionId", "amount", "date", "accountId", "status", "source"]) {
        assert.equal(context.result[key], context.items[0][key]);
    }
    assert.equal(context.items[0].category, "Other", "the helper does not mutate its input");
    assert.equal(context.items[1].category, "Other");
});

test("an individual category choice survives the next bank update despite a broad remembered category", () => {
    context.item = payment();
    context.choice = values();
    context.edited = run("transactionWithDetails(item, choice, { ...item })");
    context.rules = [{ id: "venmo-rule", name: "venmo", type: "Expense", category: "Other" }];
    context.incoming = [{ transaction_id: "bank-1", account_id: "checking", name: "Venmo",
        amount: 25, date: "2026-10-14", pending: false }];
    context.merged = run("applyBankChanges([edited], 'checking', { modified: incoming }, rules).transactions");
    assert.equal(context.merged[0].category, "Food");
    assert.equal(context.merged[0].notes, "Dinner");
    assert.equal(context.rules.length, 1);
    assert.equal(context.rules[0].category, "Other");
});

test("individual type corrections respect signed bank amounts and detach a transfer rule only when changed", () => {
    context.item = payment({ type: "Transfer", bankTypeRuleId: "transfer-rule", typeOverride: true });
    context.choice = values({ type: "Transfer" });
    assert.equal(run("transactionWithDetails(item, choice, { ...item }).bankTypeRuleId"), "transfer-rule");
    context.choice = values();
    assert.equal(run("transactionWithDetails(item, choice, { ...item }).bankTypeRuleId"), undefined);
    assert.equal(run("transactionWithDetails(item, choice, { ...item }).typeOverride"), false);
    for (const type of ["Income", "Refund"]) {
        context.choice = values({ type });
        assert.throws(() => run("transactionWithDetails(item, choice, { ...item })"), /matches/);
    }
    context.item = payment({ amount: 20, type: "Income" });
    context.choice = values({ type: "Refund" });
    assert.equal(run("transactionWithDetails(item, choice, { ...item }).type"), "Refund");
});

test("stale or deleted payments cannot overwrite bank or device changes", () => {
    context.opened = payment();
    context.choice = values();
    for (const update of [{ amount: -30 }, { date: "2026-10-15" }, { notes: "Changed elsewhere" },
        { category: "Shopping" }, { status: "pending" }, { accountId: "other-account" }]) {
        context.current = payment(update);
        assert.throws(() => run("transactionWithDetails(current, choice, opened)"), /changed while/);
    }
    context.current = undefined;
    assert.throws(() => run("transactionWithDetails(current, choice, opened)"), /no longer available/);
});

test("bank dates remain authoritative while missing manual dates can be repaired", () => {
    context.item = payment();
    context.choice = values({ date: "2026-11-01" });
    assert.equal(run("transactionWithDetails(item, choice, { ...item }).date"), "2026-10-14");
    context.item = payment({ source: "csv", date: "" });
    context.choice = values({ date: "2026-02-30" });
    assert.throws(() => run("transactionWithDetails(item, choice, { ...item })"), /valid date/);
    context.choice = values({ date: "2026-02-28" });
    assert.equal(run("transactionWithDetails(item, choice, { ...item }).date"), "2026-02-28");
});

test("expanded groups include reviewed payments but keep other names, sources, and directions separate", () => {
    context.items = [payment(), payment({ id: "newer", date: "2026-10-16", reviewStatus: "needs-review" }),
        payment({ id: "income", amount: 25 }), payment({ id: "manual", source: "manual" }),
        payment({ id: "different", name: "Venmo Store" })];
    const ids = run("transactionsForReviewGroup(items, { items: [items[0]] }).map(item => item.id)");
    assert.deepEqual(Array.from(ids), ["newer", "venmo-1"]);
});
