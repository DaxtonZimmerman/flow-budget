const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function setupCloud(editing = false) {
    const saved = new Map();
    const status = { textContent: "" };
    let cloud = null;
    let reloads = 0;
    const events = [];
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
            querySelector: selector => selector === "#flow-sync-status" ? status
                : editing && selector.includes("#transaction-details-dialog[open]") ? {} : null,
            addEventListener: () => {},
            dispatchEvent: event => events.push(event.type)
        },
        window: { addEventListener: () => {}, location: { reload: () => { reloads++; } } },
        setTimeout,
        Event
    });
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "cloud-sync.js"), "utf8");
    vm.runInContext(source, context);

    return {
        saved,
        client,
        status,
        events,
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
    assert.equal(app.getReloads(), 0);
    assert.ok(app.events.includes('flow-transaction-view-refresh'));
});

test("a newer cloud copy updates storage without closing an open transaction popup", async () => {
    const app = setupCloud(true);
    app.saved.set("flow_user_id", "person-1");
    app.saved.set("flow_revision", "0");
    app.setCloud({ revision: 1, data: {
        transactions: [{ id: "updated", amount: -5 }], budgets: [], budgetsByMonth: {}
    } });
    await app.run("flowSync()");
    assert.equal(JSON.parse(app.saved.get("transactions"))[0].id, "updated");
    assert.equal(app.saved.get("flow_revision"), "1");
    assert.equal(app.getReloads(), 0);
    assert.ok(app.events.includes("flow-transaction-data-updated"));
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

test("category rules and monthly choices travel with the cloud copy", async () => {
    const app = setupCloud();
    app.saved.set("flow_user_id", "person-1");
    app.saved.set("flow_revision", "0");
    app.saved.set("flow_pending", "1");
    app.saved.set("categoryRules", JSON.stringify([{ id: "rule-1", name: "rent", type: "Expense", category: "Bills" },
        { id: "transfer-rule", name: "move", type: "Expense", category: "Other", bankType: "Transfer", accountId: "checking" }]));
    app.saved.set("recurringItems", JSON.stringify([{ id: "monthly-1", key: "Expense|rent", status: "confirmed" }]));

    await app.run("flowSync()");
    assert.equal(app.getCloud().data.categoryRules[0].category, "Bills");
    assert.equal(app.getCloud().data.categoryRules[1].bankType, "Transfer");
    assert.equal(app.getCloud().data.categoryRules[1].accountId, "checking");
    assert.equal(app.getCloud().data.recurringItems[0].status, "confirmed");

    app.setCloud({ revision: 2, data: {
        transactions: [], budgets: [], budgetsByMonth: {},
        categoryRules: [{ id: "rule-2", name: "pay", type: "Income", category: "Salary" }],
        recurringItems: []
    } });
    await app.run("flowSync()");
    assert.equal(JSON.parse(app.saved.get("categoryRules"))[0].name, "pay");
    assert.equal(JSON.parse(app.saved.get("recurringItems")).length, 0);
});


test('incoming data keeps an open editor intact and refreshes once it is safe',async()=>{
 const app=setupCloud(true);app.saved.set('flow_user_id','person-1');app.saved.set('flow_revision','0');app.setCloud({revision:1,data:{transactions:[{id:'bank-transfer',amount:-10}]}});
 await app.run('flowSync()');assert.ok(app.events.includes('flow-transaction-data-updated'));assert.equal(app.events.includes('flow-transaction-view-refresh'),false);assert.equal(app.getReloads(),0);
 app.run('document.querySelector = () => null; flushFlowDataViews()');assert.equal(app.events.filter(e=>e==='flow-transaction-view-refresh').length,1);app.run('flushFlowDataViews()');assert.equal(app.events.filter(e=>e==='flow-transaction-view-refresh').length,1);
});

test('pending changes from an older client cannot overwrite an expanded workspace without review',async()=>{
 const app=setupCloud();app.saved.set('flow_user_id','person-1');app.saved.set('flow_revision','2');app.saved.set('flow_pending','1');
 app.saved.set('transactions',JSON.stringify([{id:'local-without-split'}]));
 app.setCloud({revision:2,data:{clientSchemaVersion:2,transactions:[{id:'cloud-with-split',allocations:[{id:'part',cents:100,category:'Food'}]}]}});
 await app.run('flowSync()');assert.match(app.status.textContent,/older Flow version/);assert.equal(app.getCloud().revision,2);assert.equal(app.saved.get('flow_pending'),'1');
 app.saved.set('flow_pending_client','2');await app.run('flowSync()');assert.equal(app.getCloud().revision,3);assert.equal(app.getCloud().data.clientSchemaVersion,2);
});
test('late cloud fetches and saves cannot repopulate another signed-in account',async()=>{
 const app=setupCloud();app.saved.set('flow_user_id','person-1');app.saved.set('flow_revision','0');app.setCloud({revision:1,data:{transactions:[{id:'private-old-owner'}]}});
 const work=app.run('flowSync()');app.saved.set('flow_user_id','person-2');await work;assert.equal(app.saved.has('transactions'),false);assert.equal(app.saved.get('flow_revision'),'0');
 const saved=setupCloud();saved.saved.set('flow_user_id','person-1');saved.saved.set('flow_revision','0');saved.saved.set('flow_pending','1');
 let release,started;const gate=new Promise(resolve=>release=resolve),called=new Promise(resolve=>started=resolve),rpc=saved.client.rpc;
 saved.client.rpc=async(...args)=>{started();await gate;return rpc(...args);};
 const saving=saved.run('flowSync()');await called;saved.saved.set('flow_user_id','person-2');saved.saved.set('flow_revision','50');saved.saved.set('transactions','[{"id":"new-owner"}]');release();await saving;
 assert.equal(saved.saved.get('flow_revision'),'50');assert.equal(JSON.parse(saved.saved.get('transactions'))[0].id,'new-owner');
});
