const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function bankEditor(transaction) {
    const saved = new Map([["transactions", JSON.stringify([transaction])]]);
    let submit;
    let syncs = 0;
    function field(value = "") {
        return { value, textContent: "", checked: false, options: [],
            addEventListener() {}, add(option) { this.options.push(option); },
            querySelector(selector) {
                const value = selector.match(/value="([^"]+)"/)[1];
                return this.options.find(option => option.value === value);
            }
        };
    }
    const elements = {};
    for (const id of ["transaction-form", "transaction-type", "transaction-name", "transaction-category",
        "transaction-amount", "transaction-date", "transaction-notes", "form-message", "form-title",
        "form-description", "form-back-link", "save-transaction-button", "category-suggestion", "remember-category"]) {
        elements[`#${id}`] = field();
    }
    elements["#transaction-form"].addEventListener = (_, fn) => { submit = fn; };
    elements["#transaction-type"].options = [{ value: "Income" }, { value: "Expense" }];
    elements["#transaction-category"].options = [{ value: "Other" }, { value: "Food" }, { value: "Income" }];
    const location = { search: `?edit=${transaction.id}`, href: "" };
    const context = vm.createContext({
        Date, URLSearchParams, Option: function(label, value) { this.textContent = label; this.value = value; },
        localStorage: { getItem: key => saved.get(key) || null,
            setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) },
        document: { querySelector: selector => elements[selector], querySelectorAll: () => [] },
        window: { location }, flowDataChanged: () => { syncs++; }
    });
    for (const file of ["money-data.js", "review-data.js", "add-transaction.js"]) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context);
    }
    return { elements, saved, location, syncs: () => syncs,
        save(type) { elements["#transaction-type"].value = type; submit({ preventDefault() {} }); } };
}

test("a bank debit can be changed back to Expense without changing its amount", () => {
    const editor = bankEditor({ id: "bank-one", source: "bank", name: "Move", type: "Transfer",
        amount: -75, category: "Other", date: "2026-10-01", typeOverride: true, bankTypeRuleId: "transfer-rule" });
    editor.save("Expense");
    const saved = JSON.parse(editor.saved.get("transactions"))[0];
    assert.equal(editor.elements["#form-message"].textContent, "");
    assert.equal(saved.type, "Expense");
    assert.equal(saved.amount, -75);
    assert.equal(saved.bankTypeRuleId, undefined);
    assert.equal(saved.typeOverride, false);
    assert.equal(editor.syncs(), 1);
    assert.equal(editor.location.href, "transactions.html");
});

test("a bank credit cannot be changed into an expense", () => {
    const original = { id: "bank-two", source: "bank", name: "Deposit", type: "Income",
        amount: 75, category: "Income", date: "2026-10-01" };
    const editor = bankEditor(original);
    editor.save("Expense");
    assert.match(editor.elements["#form-message"].textContent, /matches this bank transaction/);
    assert.deepEqual(JSON.parse(editor.saved.get("transactions"))[0], original);
    assert.equal(editor.syncs(), 0);
});

test("a bank credit can be saved as a refund and keeps its imported amount", () => {
    const editor = bankEditor({ id: "bank-three", source: "bank", name: "Store", type: "Income",
        amount: 25, category: "Food", date: "2026-10-01" });
    editor.save("Refund");
    const saved = JSON.parse(editor.saved.get("transactions"))[0];
    assert.equal(saved.type, "Refund");
    assert.equal(saved.amount, 25);
    assert.equal(saved.typeOverride, true);
});
