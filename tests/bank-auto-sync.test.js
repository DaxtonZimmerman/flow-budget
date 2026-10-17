const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");


function makeApp(needsReconnect = false, editing = false) {
    const saved = new Map([["flow_user_id", "person-1"]]);
    const session = new Map();
    const actions = [];
    const messages = [];
    let reloads = 0;
    let cloudSaves = 0;
    let transactions = [];
    let serverSyncedAt = null;

    const context = vm.createContext({
        localStorage: {
            getItem: key => saved.get(key) || null,
            setItem: (key, value) => saved.set(key, value)
        },
        sessionStorage: {
            getItem: key => session.get(key) || null,
            setItem: (key, value) => session.set(key, value)
        },
        navigator: { onLine: true },
        getFlowClient: () => ({
            auth: { getUser: async () => ({
                data: { user: { id: "person-1" } }, error: null
            }) },
            functions: { invoke: async (_name, request) => {
                actions.push(request.body.action);

                if (request.body.action === "connections") {
                    return { data: { connections: [{
                        id: "bank-1", needs_reconnect: needsReconnect,
                        last_synced_at: serverSyncedAt
                    }] }, error: null };
                }

                return { data: {
                    transactions: [{
                        transaction_id: "transaction-1", account_id: "account-1",
                        amount: 12.5, date: "2026-10-16", name: "Test Market",
                        pending: false
                    }],
                    last_synced_at: new Date().toISOString()
                }, error: null };
            } }
        }),
        getFlowSnapshot: () => ({
            transactions: JSON.parse(saved.get("transactions") || "[]")
        }),
        flowDataChanged: async () => { cloudSaves++; },
        showFlowStatus: message => messages.push(message),
        document: {
            addEventListener: () => {},
            dispatchEvent: () => {},
            querySelector: () => editing ? {} : null
        },
        window: { location: { reload: () => { reloads++; } } },
        Event
    });

    for (const file of ["bank-data.js", "bank-auto-sync.js"]) {
        const source = fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8");
        vm.runInContext(source, context);
    }

    return {
        run: () => vm.runInContext("updateBanksAutomatically()", context),
        actions,
        messages,
        getTransactions: () => JSON.parse(saved.get("transactions") || "[]"),
        getCloudSaves: () => cloudSaves,
        getReloads: () => reloads,
        setServerSyncedAt: value => { serverSyncedAt = value; }
    };
}


test("opening Flow updates a stale bank once and keeps the result", async () => {
    const app = makeApp();

    await app.run();
    await app.run();

    assert.deepEqual(app.actions, ["connections", "sync", "connections"]);
    assert.equal(app.getTransactions().length, 1);
    assert.equal(app.getTransactions()[0].name, "Test Market");
    assert.equal(app.getCloudSaves(), 1);
    assert.equal(app.getReloads(), 1);
});


test("a bank needing repair is shown without trying to sync it", async () => {
    const app = makeApp(true);

    await app.run();

    assert.deepEqual(app.actions, ["connections"]);
    assert.equal(app.getTransactions().length, 0);
    assert.match(app.messages[0], /reconnect/i);
});


test("a bank update keeps an open form on screen", async () => {
    const app = makeApp(false, true);

    await app.run();

    assert.equal(app.getTransactions().length, 1);
    assert.equal(app.getCloudSaves(), 1);
    assert.equal(app.getReloads(), 0);
});


test("a newer webhook snapshot is pulled despite the normal poll delay", async () => {
    const app = makeApp();
    await app.run();
    app.setServerSyncedAt(new Date(Date.now() + 10_000).toISOString());

    await app.run();

    assert.deepEqual(app.actions, ["connections", "sync", "connections", "sync"]);
});
