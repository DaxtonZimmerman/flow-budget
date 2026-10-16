const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const context = vm.createContext({ Date, Set });

for (const file of ["money-data.js", "import-data.js"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8");
    vm.runInContext(source, context);
}

function run(code) {
    return vm.runInContext(code, context);
}

test("quoted commas, escaped quotes, and Windows line endings stay in the right columns", () => {
    const csv = run('parseCsv("\\uFEFFDate,Description,Amount\\r\\n2026-10-01,\\\"Cafe, Inc.\\\",-12.30\\r\\n2026-10-02,\\\"Joe\\\"\\\"s Shop\\\",8.00\\r\\n")');
    assert.equal(csv.rows.length, 2);
    assert.equal(csv.rows[0][1], "Cafe, Inc.");
    assert.equal(csv.rows[1][1], 'Joe"s Shop');
});

test("dates and amounts reject malformed or impossible values", () => {
    assert.equal(run('importDate("02/29/2024", "mdy")'), "2024-02-29");
    assert.equal(run('importDate("31/12/2025", "dmy")'), "2025-12-31");
    assert.equal(run('importDate("02/29/2025", "mdy")'), "");
    assert.equal(run('importCents("($1,234.56)")'), -123456);
    assert.equal(run('importCents("-$12.30")'), -1230);
    assert.equal(run('importCents("12.345")'), null);
    assert.equal(run('importCents("0.00")'), null);
});

test("preview flags saved and repeated transactions before import", () => {
    context.csv = run('parseCsv("Date,Description,Amount\\n10/01/2026,Coffee,-4.50\\n10/01/2026,Coffee,-4.50\\n10/02/2026,Paycheck,500.00")');
    context.saved = [{ date: "2026-10-01", name: "Coffee", amount: -4.5 }];
    const rows = run('buildImportRows(csv, { date: 0, name: 1, category: "", amount: 2 }, "mdy", "signed", saved)');
    assert.equal(rows[0].duplicate, true);
    assert.equal(rows[1].duplicate, true);
    assert.equal(rows[2].duplicate, false);
    assert.equal(rows[2].transaction.amount, 500);
    assert.equal(rows[2].transaction.category, "Income");
});

test("separate debit and credit columns, positive expenses, and invalid rows", () => {
    context.csv = run('parseCsv("Date,Name,Debit,Credit\\n2026-10-01,Groceries,42.10,\\n2026-10-02,Pay,,1000.00\\n2026-10-03,Broken,25.00,10.00")');
    const rows = run('buildImportRows(csv, { date: 0, name: 1, category: "", debit: 2, credit: 3 }, "iso", "separate", [])');
    assert.equal(rows[0].transaction.amount, -42.1);
    assert.equal(rows[1].transaction.amount, 1000);
    assert.ok(rows[2].error);

    context.csv = run('parseCsv("Date,Name,Amount\\n2026-10-04,Gas,50.00")');
    const positive = run('buildImportRows(csv, { date: 0, name: 1, category: "", amount: 2 }, "iso", "positive-expense", [])');
    assert.equal(positive[0].transaction.amount, -50);
});
