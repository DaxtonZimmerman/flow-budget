const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "bank-data.js"), "utf8");
const context = vm.createContext({});
vm.runInContext(source, context);
const applyBankChanges = vm.runInContext("applyBankChanges", context);
const mergeBankSnapshot = vm.runInContext("mergeBankSnapshot", context);

function bankItem(id, amount, extra = {}) {
    return {
        transaction_id: id,
        name: "Coffee Shop",
        amount: amount,
        date: "2026-10-16",
        pending: false,
        ...extra
    };
}

test("repeating the same bank update does not duplicate a transaction", () => {
    const first = applyBankChanges([], "checking-1", {
        added: [bankItem("txn-1", 4.25)]
    });
    const second = applyBankChanges(first.transactions, "checking-1", {
        added: [bankItem("txn-1", 4.25)]
    });

    assert.equal(first.addedCount, 1);
    assert.equal(second.addedCount, 0);
    assert.equal(second.transactions.length, 1);
    assert.equal(second.transactions[0].amount, -4.25);
    assert.equal(second.transactions[0].source, "bank");
    assert.equal(second.transactions[0].reviewStatus, "needs-review");
});

test("a posted charge replaces its pending version and keeps the chosen category", () => {
    const pending = applyBankChanges([], "checking-1", {
        added: [bankItem("pending-1", 4.25, { pending: true })]
    }).transactions;
    pending[0].category = "Food";
    pending[0].notes = "Breakfast";
    pending[0].reviewStatus = "reviewed";

    const posted = applyBankChanges(pending, "checking-1", {
        added: [bankItem("posted-1", 4.25, {
            pending_transaction_id: "pending-1"
        })],
        removed: [{ transaction_id: "pending-1" }]
    });

    assert.equal(posted.transactions.length, 1);
    assert.equal(posted.transactions[0].status, "posted");
    assert.equal(posted.transactions[0].category, "Food");
    assert.equal(posted.transactions[0].notes, "Breakfast");
    assert.equal(posted.transactions[0].reviewStatus, "reviewed");
    assert.equal(posted.removedCount, 1);
});

test("a posted charge also replaces pending when Plaid sends the removal later", () => {
    const pending = applyBankChanges([], "checking-1", {
        added: [bankItem("pending-1", 4.25, { pending: true })]
    }).transactions;

    const posted = applyBankChanges(pending, "checking-1", {
        added: [bankItem("posted-1", 4.25, {
            pending_transaction_id: "pending-1"
        })]
    });

    assert.equal(posted.transactions.length, 1);
    assert.equal(posted.transactions[0].bankTransactionId, "posted-1");
});

test("bank changes leave manual entries and other accounts alone", () => {
    const manual = { id: "manual-1", name: "Coffee Shop", amount: -4.25 };
    const otherAccount = {
        id: "bank-other-txn-1", source: "bank", accountId: "other",
        bankTransactionId: "txn-1", amount: -4.25
    };
    const changed = applyBankChanges([manual, otherAccount], "checking-1", {
        added: [bankItem("txn-1", 4.25)],
        removed: [{ transaction_id: "txn-1" }]
    });

    assert.equal(changed.transactions.length, 3);
    assert.equal(changed.transactions[0], manual);
    assert.equal(changed.transactions[1], otherAccount);
});

test("changed bank amounts keep personal edits and removed charges disappear", () => {
    const first = applyBankChanges([], "checking-1", {
        added: [bankItem("txn-1", 4.25)]
    }).transactions;
    first[0].category = "Food";

    const changed = applyBankChanges(first, "checking-1", {
        modified: [bankItem("txn-1", 5.25)]
    });
    assert.equal(changed.transactions[0].amount, -5.25);
    assert.equal(changed.transactions[0].category, "Food");

    const removed = applyBankChanges(changed.transactions, "checking-1", {
        removed: [{ transaction_id: "txn-1" }]
    });
    assert.equal(removed.transactions.length, 0);
    assert.equal(removed.removedCount, 1);
});

test("repeating a bank snapshot keeps IDs, edits, and row order", () => {
    const manual = { id: "manual-1", name: "Cash", amount: -2 };
    const first = mergeBankSnapshot([manual], "connection-1", [
        bankItem("txn-1", 4.25, { account_id: "checking-1" })
    ]);
    first[1].category = "Food";
    first[1].notes = "Breakfast";

    const second = mergeBankSnapshot(first, "connection-1", [
        bankItem("txn-1", 5.25, { account_id: "checking-1" })
    ]);
    const third = mergeBankSnapshot(second, "connection-1", [
        bankItem("txn-1", 5.25, { account_id: "checking-1" })
    ]);

    assert.equal(second.length, 2);
    assert.equal(second[0], manual);
    assert.equal(second[1].id, first[1].id);
    assert.equal(second[1].amount, -5.25);
    assert.equal(second[1].category, "Food");
    assert.equal(second[1].notes, "Breakfast");
    assert.equal(JSON.stringify(second), JSON.stringify(third));
});

test("a chosen refund or transfer survives sync without changing the bank amount", () => {
    const credit = mergeBankSnapshot([], "connection-1", [
        bankItem("refund-1", -12.5, { account_id: "checking-1" })
    ]);
    credit[0].type = "Refund";
    credit[0].typeOverride = true;
    credit[0].category = "Food";

    const refreshed = mergeBankSnapshot(credit, "connection-1", [
        bankItem("refund-1", -10, { account_id: "checking-1" })
    ]);
    assert.equal(refreshed[0].type, "Refund");
    assert.equal(refreshed[0].amount, 10);
    assert.equal(refreshed[0].category, "Food");

    refreshed[0].type = "Transfer";
    refreshed[0].typeOverride = true;
    const transfer = mergeBankSnapshot(refreshed, "connection-1", [
        bankItem("refund-1", 10, { account_id: "checking-1" })
    ]);
    assert.equal(transfer[0].type, "Transfer");
    assert.equal(transfer[0].amount, -10);
});

test("a refund label clears if Plaid changes a credit into a debit", () => {
    const credit = mergeBankSnapshot([], "connection-1", [
        bankItem("correction-1", -5, { account_id: "checking-1" })
    ]);
    credit[0].type = "Refund";
    credit[0].typeOverride = true;

    const corrected = mergeBankSnapshot(credit, "connection-1", [
        bankItem("correction-1", 5, { account_id: "checking-1" })
    ]);
    assert.equal(corrected[0].type, "Expense");
    assert.equal(corrected[0].typeOverride, false);
});


test("a posted snapshot replaces pending and leaves other banks alone", () => {
    const pending = mergeBankSnapshot([], "connection-1", [
        bankItem("pending-1", 4.25, {
            account_id: "checking-1", pending: true
        })
    ]);
    pending[0].category = "Food";
    const otherBank = {
        id: "other-1", source: "bank", bankConnectionId: "connection-2",
        bankTransactionId: "other-txn", amount: -3
    };

    const posted = mergeBankSnapshot([...pending, otherBank], "connection-1", [
        bankItem("posted-1", 4.25, {
            account_id: "checking-1", pending_transaction_id: "pending-1"
        })
    ]);

    assert.equal(posted.length, 2);
    assert.equal(posted[0], otherBank);
    assert.equal(posted[1].bankTransactionId, "posted-1");
    assert.equal(posted[1].category, "Food");
    assert.equal(posted[1].status, "posted");

    const removed = mergeBankSnapshot(posted, "connection-1", []);
    assert.equal(removed.length, 1);
    assert.equal(removed[0], otherBank);
});
