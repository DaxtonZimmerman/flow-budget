const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function setupCloud() {
    const saved = new Map();
    const status = { textContent: "" };
    let cloud = null;
    let reloads = 0;
    const network = { onLine: true };
    const client = {
        auth: { getUser: async () => ({ data: { user: { id: "person-1" } }, error: null }) },
        from: () => ({
            select: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: cloud, error: null }) })
            })
        }),
        rpc: async (name, args) => {
            if (name !== "save_flow_data") throw new Error("Wrong function");
            const currentRevision = cloud ? cloud.revision : 0;

            if (args.expected_revision !== currentRevision) {
                return { error: new Error("Conflict") };
            }

            cloud = { revision: currentRevision + 1, data: args.new_data };
            return { data: cloud.revision, error: null };
        }
    };
    const context = vm.createContext({
        localStorage: {
            getItem: key => saved.has(key) ? saved.get(key) : null,
            setItem: (key, value) => saved.set(key, value),
            removeItem: key => saved.delete(key)
        },
        flowCloudUrl: "https://example.supabase.co",
        flowCloudKey: "public-key",
        supabase: { createClient: () => client },
        navigator: network,
        document: {
            body: {},
            querySelector: selector => selector === "#flow-sync-status" ? status : null,
            addEventListener: () => {}
        },
        window: { addEventListener: () => {}, location: { reload: () => { reloads++; } } },
        setTimeout
    });
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "cloud-sync.js"), "utf8");
    vm.runInContext(source, context);

    return {
        saved,
        status,
        run: code => vm.runInContext(code, context),
        setCloud: value => { cloud = value; },
        setOnline: value => { network.onLine = value; },
        getCloud: () => cloud,
        getReloads: () => reloads
    };
}

test("local changes sync, then another device's revision is pulled", async () => {
    const app = setupCloud();
    app.saved.set("flow_user_id", "person-1");
    app.saved.set("flow_revision", "0");
    app.saved.set("transactions", JSON.stringify([{ id: "one", amount: -3 }]));
    app.saved.set("flow_pending", "1");

    await app.run("flowSync()");
    assert.equal(app.getCloud().revision, 1);
    assert.equal(app.saved.has("flow_pending"), false);

    app.setCloud({
        revision: 2,
        data: { transactions: [{ id: "two", amount: -5 }], budgets: [], budgetsByMonth: {} }
    });
    await app.run("flowSync()");
    assert.equal(JSON.parse(app.saved.get("transactions"))[0].id, "two");
    assert.equal(app.getReloads(), 1);
});

test("offline edits stay on this device until syncing is possible", async () => {
    const app = setupCloud();
    app.saved.set("flow_user_id", "person-1");
    app.saved.set("flow_revision", "0");
    app.saved.set("transactions", JSON.stringify([{ id: "offline" }]));
    app.saved.set("flow_pending", "1");
    app.setOnline(false);

    await app.run("flowSync()");
    assert.equal(app.getCloud(), null);
    assert.equal(app.saved.get("flow_pending"), "1");
    assert.match(app.status.textContent, /offline/i);

    app.setOnline(true);
    await app.run("flowSync()");
    assert.equal(app.getCloud().data.transactions[0].id, "offline");
    assert.equal(app.saved.has("flow_pending"), false);
});

test("conflicting device changes keep the local copy and show a warning", async () => {
    const app = setupCloud();
    app.saved.set("flow_user_id", "person-1");
    app.saved.set("flow_revision", "1");
    app.saved.set("flow_pending", "1");
    app.saved.set("transactions", JSON.stringify([{ id: "local" }]));
    app.setCloud({
        revision: 2,
        data: { transactions: [{ id: "remote" }], budgets: [], budgetsByMonth: {} }
    });

    await app.run("flowSync()");
    assert.equal(JSON.parse(app.saved.get("transactions"))[0].id, "local");
    assert.equal(app.getCloud().data.transactions[0].id, "remote");
    assert.equal(app.saved.get("flow_pending"), "1");
    assert.match(app.status.textContent, /two devices/i);
});
