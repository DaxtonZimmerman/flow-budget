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
    let failedKey = null;
    const events = [];
    const network = { onLine: true };
    const client = {
        auth: { getUser: async () => ({ data: { user: { id: "person-1", email:"pilot@example.test", email_confirmed_at:"2026-01-01T00:00:00Z" } }, error: null }) },
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
            setItem: (key, value) => { if (key === failedKey) throw new Error("Synthetic storage full"); saved.set(key, value); },
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
        getReloads: () => reloads,
        failStorageAt: key => { failedKey = key; }
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

test("overlapping device edits open the saved account automatically and protect earlier work", async () => {
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
    assert.equal(JSON.parse(app.saved.get("transactions"))[0].id, "remote");
    assert.equal(app.getCloud().data.transactions[0].id, "remote");
    assert.equal(app.saved.has("flow_pending"), false);
    assert.equal(app.saved.get("flow_revision"), "2");
    assert.equal(app.run("getFlowRecoveryCopies(\"person-1\")[0].data.transactions[0].id"), "local");
    assert.match(app.status.textContent, /earlier edits/i);
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

test('older pending edits are protected while the current account opens without a data choice',async()=>{
 const app=setupCloud();app.saved.set('flow_user_id','person-1');app.saved.set('flow_revision','2');app.saved.set('flow_pending','1');
 app.saved.set('transactions',JSON.stringify([{id:'local-without-split'}]));
 app.setCloud({revision:2,data:{clientSchemaVersion:2,transactions:[{id:'cloud-with-split',allocations:[{id:'part',cents:100,category:'Food'}]}]}});
 await app.run('flowSync()');assert.equal(app.getCloud().revision,2);assert.equal(app.saved.has('flow_pending'),false);
 assert.equal(JSON.parse(app.saved.get('transactions'))[0].id,'cloud-with-split');assert.equal(app.run('getFlowRecoveryCopies(\"person-1\")[0].data.transactions[0].id'),'local-without-split');
 app.saved.set('flow_pending','1');app.saved.set('flow_pending_client','2');await app.run('flowSync()');assert.equal(app.getCloud().revision,3);assert.equal(app.getCloud().data.clientSchemaVersion,2);
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

test('a new sign-in opens the saved account and never uploads the previous owner’s data', async () => {
    const app = setupCloud();
    app.saved.set('flow_user_id', 'previous-owner');
    app.saved.set('transactions', '[{"id":"previous-private"}]');
    app.saved.set('flow_pending', '1');
    app.setCloud({ revision:7, data:{ transactions:[{id:'signed-in-account'}] } });
    await app.run('connectFlowAccount({id:"person-1"})');
    assert.equal(app.saved.get('flow_user_id'), 'person-1');
    assert.equal(app.saved.get('flow_revision'), '7');
    assert.equal(JSON.parse(app.saved.get('transactions'))[0].id, 'signed-in-account');
    assert.equal(app.getCloud().revision, 7);
    assert.equal(app.run('getFlowRecoveryCopies("person-1").length'), 0);
    assert.equal(app.run('getFlowRecoveryCopies("previous-owner").length'), 0);
    app.saved.set('flow_user_id', 'previous-owner');
    assert.equal(app.run('getFlowRecoveryCopies("previous-owner")[0].data.transactions[0].id'), 'previous-private');
});

test('a new empty account starts empty while unlinked earlier work remains protected', async () => {
    const app = setupCloud();
    app.saved.set('transactions', '[{"id":"unlinked-work"}]');
    await app.run('connectFlowAccount({id:"person-1"})');
    assert.equal(app.getCloud(), null);
    assert.equal(app.saved.get('flow_user_id'), 'person-1');
    assert.equal(app.saved.get('transactions'), '[]');
    assert.equal(JSON.parse(app.saved.get('flow_recovery_v1:unlinked'))[0].data.transactions[0].id, 'unlinked-work');
    assert.equal(app.run('getFlowRecoveryCopies("person-1").length'), 0);
});

test('a storage failure cannot discard unsynced work to make the account look synced', async () => {
    const app = setupCloud();
    app.saved.set('flow_user_id', 'person-1'); app.saved.set('flow_revision', '1'); app.saved.set('flow_pending', '1');
    app.saved.set('transactions', '[{"id":"offline-edit"}]');
    app.setCloud({revision:2,data:{transactions:[{id:'account'}]}});
    app.failStorageAt('flow_recovery_v1:person-1');
    await app.run('flowSync()');
    assert.equal(app.saved.get('transactions'), '[{"id":"offline-edit"}]');
    assert.equal(app.saved.get('flow_revision'), '1'); assert.equal(app.saved.get('flow_pending'), '1');
    assert.equal(app.getCloud().revision, 2); assert.match(app.status.textContent, /still saved here/);
});

test('workspace metadata failure rolls back data while its recovery copy stays available', async () => {
    const app = setupCloud();
    app.saved.set('flow_user_id', 'person-1'); app.saved.set('flow_revision', '1'); app.saved.set('flow_pending', '1');
    app.saved.set('transactions', '[{"id":"keep-me"}]');
    app.setCloud({revision:2,data:{transactions:[{id:'account'}]}});
    app.failStorageAt('flow_revision'); await app.run('flowSync()');
    assert.equal(app.saved.get('transactions'), '[{"id":"keep-me"}]'); assert.equal(app.saved.get('flow_revision'), '1');
    assert.equal(app.saved.get('flow_pending'), '1');
    assert.equal(app.run('getFlowRecoveryCopies("person-1")[0].data.transactions[0].id'), 'keep-me');
});

test('a save race catches up automatically and keeps the rejected edit for recovery', async () => {
    const app = setupCloud();
    app.saved.set('flow_user_id', 'person-1'); app.saved.set('flow_revision', '1'); app.saved.set('flow_pending', '1');
    app.saved.set('transactions', '[{"id":"in-flight-edit"}]');
    app.setCloud({revision:1,data:{transactions:[]}});
    let saves = 0;
    app.client.rpc = async () => {
        saves++; app.setCloud({revision:2,data:{transactions:[{id:'concurrent-update'}]}});
        return {error:{message:'Flow data changed on another device'}};
    };
    await app.run('flowSync()');
    assert.equal(saves,1); assert.equal(app.saved.get('flow_revision'),'2');
    assert.equal(JSON.parse(app.saved.get('transactions'))[0].id,'concurrent-update');
    assert.equal(app.run('getFlowRecoveryCopies("person-1")[0].data.transactions[0].id'), 'in-flight-edit');
});

test('edits made during a cloud fetch are included in the protected recovery copy', async () => {
    const app = setupCloud();
    app.saved.set('flow_user_id','person-1');app.saved.set('flow_revision','1');app.saved.set('flow_pending','1');
    app.saved.set('transactions','[{"id":"first-edit"}]');
    let resolve,started;const waiting=new Promise(r=>resolve=r),called=new Promise(r=>started=r);
    app.client.from=()=>({select:()=>({eq:()=>({maybeSingle:async()=>{started();await waiting;return {data:{revision:2,data:{transactions:[{id:'account'}]}},error:null};}})})});
    const syncing=app.run('flowSync()');await called;
    app.saved.set('transactions','[{"id":"newest-offline-edit"}]');resolve();await syncing;
    assert.equal(app.run('getFlowRecoveryCopies("person-1")[0].data.transactions[0].id'),'newest-offline-edit');
});

test('sign-in does not replace a workspace that changed while its account was loading', async () => {
    const app=setupCloud();app.saved.set('flow_user_id','previous-owner');app.saved.set('transactions','[{"id":"original"}]');
    let resolve,started;const waiting=new Promise(r=>resolve=r),called=new Promise(r=>started=r);
    app.client.from=()=>({select:()=>({eq:()=>({maybeSingle:async()=>{started();await waiting;return {data:{revision:2,data:{transactions:[{id:'account'}]}},error:null};}})})});
    const opening=app.run('connectFlowAccount({id:"person-1"})');await called;
    app.saved.set('transactions','[{"id":"changed-while-loading"}]');resolve();
    await assert.rejects(opening,/changed while opening/i);
    assert.equal(app.saved.get('flow_user_id'),'previous-owner');assert.equal(app.saved.get('transactions'),'[{"id":"changed-while-loading"}]');
});

test('a changed sign-in cannot activate an earlier user’s response', async () => {
    const app=setupCloud();app.saved.set('transactions','[{"id":"local"}]');
    app.setCloud({revision:2,data:{transactions:[{id:'private-account'}]}});
    app.client.auth.getUser=async()=>({data:{user:{id:'someone-else'}},error:null});
    await assert.rejects(app.run('connectFlowAccount({id:"person-1"})'),/sign in again/i);
    assert.equal(app.saved.get('transactions'),'[{"id":"local"}]');assert.equal(app.saved.has('flow_user_id'),false);
});

test('an account reset does not resurrect deleted records from an older device', async () => {
    const app=setupCloud();app.saved.set('flow_user_id','person-1');app.saved.set('flow_revision','8');
    app.saved.set('transactions','[{"id":"old-deleted-record"}]');
    await app.run('flowSync()');
    assert.equal(app.getCloud(),null);assert.equal(app.saved.get('transactions'),'[]');
    assert.equal(app.run('getFlowRecoveryCopies("person-1")[0].data.transactions[0].id'),'old-deleted-record');
});

test('unsupported newer accounts stay untouched and do not replace pending edits', async () => {
    const app=setupCloud();app.saved.set('flow_user_id','person-1');app.saved.set('flow_revision','1');app.saved.set('flow_pending','1');
    app.saved.set('transactions','[{"id":"local"}]');app.setCloud({revision:2,data:{clientSchemaVersion:99,transactions:[{id:'new-schema'}]}});
    await app.run('flowSync()');assert.equal(app.saved.get('transactions'),'[{"id":"local"}]');
    assert.equal(app.saved.get('flow_pending'),'1');assert.equal(app.getCloud().revision,2);
});

test('recovery deduplicates identical work and is hidden without the matching verified sign-in', async () => {
    const app=setupCloud();app.saved.set('flow_user_id','person-1');app.saved.set('flow_revision','1');app.saved.set('flow_pending','1');
    app.saved.set('transactions','[{"id":"offline"}]');app.setCloud({revision:2,data:{transactions:[{id:'account'}]}});
    await app.run('flowSync()');
    app.saved.set('flow_revision','1');app.saved.set('flow_pending','1');app.saved.set('transactions','[{"id":"offline"}]');
    await app.run('flowSync()');assert.equal(app.run('getFlowRecoveryCopies("person-1").length'),1);
    app.run('window.FlowAuth={authorized:false,user:{id:"person-1"}}');
    assert.equal(app.run('getFlowRecoveryCopies("person-1").length'),0);
    app.run('window.FlowAuth={authorized:true,user:{id:"someone-else"}}');
    assert.equal(app.run('getFlowRecoveryCopies("person-1").length'),0);
});

function recoveryApp(identity = true) {
    const app = setupCloud();
    app.run('var flowRecoverySourceProject="abcdefghijklmnopqrst"');
    app.saved.set('flow_user_id', 'original-owner');
    app.saved.set('flow_verified_user', 'original-owner');
    app.saved.set('flow_revision', '51');
    app.saved.set('transactions', '[{"id":"original-payment","notes":"keep my note"}]');
    if (identity) app.saved.set('sb-abcdefghijklmnopqrst-auth-token', JSON.stringify({
        access_token:'old-private-token-never-upload', refresh_token:'old-refresh-never-upload',
        user:{id:'original-owner',email:'Pilot@example.test',email_confirmed_at:'2026-01-01T00:00:00Z'}
    }));
    return app;
}

test('server replacement protects local work before new authentication changes its owner marker', async () => {
    const app = recoveryApp();
    await app.run('prepareFlowServerRecovery()');
    app.saved.set('flow_verified_user','person-1');
    await app.run('connectFlowAccount({id:"person-1"})');
    assert.equal(app.saved.get('flow_user_id'),'person-1');
    assert.equal(app.saved.get('flow_revision'),'1');
    assert.equal(app.getCloud().data.transactions[0].id,'original-payment');
    assert.equal(app.getCloud().data.transactions[0].notes,'keep my note');
    assert.doesNotMatch(JSON.stringify(app.getCloud()),/old-private-token|old-refresh/);
    assert.equal(JSON.parse(app.saved.get('flow_recovery_v1:original-owner'))[0].data.transactions[0].id,'original-payment');
    assert.equal(app.run('getFlowRecoveryCopies("person-1")[0].data.transactions[0].id'),'original-payment');
    assert.equal(JSON.parse(app.saved.get('flow_server_recovery_v1')).destination,'person-1');
    assert.ok(app.saved.has('sb-abcdefghijklmnopqrst-auth-token'));
    await app.run('prepareFlowServerRecovery(); connectFlowAccount({id:"person-1"})');
    assert.equal(app.getCloud().revision,1,'Reopening must not upload the original snapshot again');
});

test('an existing destination workspace wins while the original saved work remains recoverable', async () => {
    const app = recoveryApp();
    await app.run('prepareFlowServerRecovery()');
    app.setCloud({revision:7,data:{transactions:[{id:'newer-workspace'}]}});
    await app.run('connectFlowAccount({id:"person-1"})');
    assert.equal(app.getCloud().revision,7);
    assert.equal(JSON.parse(app.saved.get('transactions'))[0].id,'newer-workspace');
    assert.equal(app.run('getFlowRecoveryCopies("person-1")[0].data.transactions[0].id'),'original-payment');
});

test('missing, unverified, or different prior identity cannot upload or replace a saved workspace', async () => {
    for (const kind of ['missing','unverified','different-owner','different-email','unconfirmed-new']) {
        const app = recoveryApp(kind !== 'missing');
        if (kind === 'unverified') app.saved.set('flow_verified_user','someone-else');
        if (kind === 'different-owner') app.saved.set('sb-abcdefghijklmnopqrst-auth-token',JSON.stringify({user:{id:'someone-else',email:'pilot@example.test',email_confirmed_at:'yes'}}));
        if (kind === 'different-email') app.client.auth.getUser=async()=>({data:{user:{id:'person-1',email:'another@example.test',email_confirmed_at:'yes'}}});
        if (kind === 'unconfirmed-new') app.client.auth.getUser=async()=>({data:{user:{id:'person-1',email:'pilot@example.test'}}});
        await app.run('prepareFlowServerRecovery()');
        await assert.rejects(app.run('connectFlowAccount({id:"person-1"})'),e=>e.code==='FLOW_RECOVERY_REQUIRED');
        assert.equal(app.getCloud(),null);
        assert.equal(app.saved.get('flow_user_id'),'original-owner');
        assert.equal(JSON.parse(app.saved.get('transactions'))[0].id,'original-payment');
    }
});

test('a desktop with an unverified old identity opens the account already recovered on another device without uploading or exposing earlier work', async () => {
    for (const identity of [false, true]) {
        const app = recoveryApp(identity);
        if (identity) app.client.auth.getUser=async()=>({data:{user:{id:'person-1',email:'another@example.test',email_confirmed_at:'yes'}}});
        await app.run('prepareFlowServerRecovery()');
        app.setCloud({revision:12,data:{clientSchemaVersion:2,transactions:[{id:'recovered-on-phone'}],bankAccounts:[]}});
        await app.run('connectFlowAccount({id:"person-1"})');
        assert.equal(app.saved.get('flow_user_id'),'person-1');
        assert.equal(app.saved.get('flow_revision'),'12');
        assert.equal(JSON.parse(app.saved.get('transactions'))[0].id,'recovered-on-phone');
        assert.equal(app.getCloud().revision,12,'The old device must not write to the saved account');
        assert.equal(app.run('getFlowRecoveryCopies("person-1").length'),0,'Unverified old data must stay hidden from the new sign-in');
        assert.equal(JSON.parse(app.saved.get('flow_recovery_v1:original-owner'))[0].data.transactions[0].id,'original-payment');
        assert.equal(JSON.parse(app.saved.get('flow_server_recovery_v1')).destination,undefined);
    }
});

test('storage failure protects the original workspace and prevents replacement uploads', async () => {
    const app = recoveryApp();
    app.failStorageAt('flow_recovery_v1:original-owner');
    await assert.rejects(app.run('prepareFlowServerRecovery()'),/storage full/i);
    assert.equal(app.getCloud(),null);
    assert.equal(app.saved.get('flow_user_id'),'original-owner');
    assert.equal(JSON.parse(app.saved.get('transactions'))[0].id,'original-payment');
});

test('recovery cannot overwrite a concurrently created destination or disclose original work to another sign-in', async () => {
    const app = recoveryApp();
    await app.run('prepareFlowServerRecovery()');
    const rpc=app.client.rpc;
    app.client.rpc=async(...args)=>{app.setCloud({revision:1,data:{transactions:[{id:'another-device'}]}});return rpc(...args);};
    await assert.rejects(app.run('connectFlowAccount({id:"person-1"})'),/Conflict/);
    assert.equal(JSON.parse(app.saved.get('transactions'))[0].id,'original-payment');
    assert.equal(app.getCloud().data.transactions[0].id,'another-device');
    app.client.rpc=rpc;
    await app.run('connectFlowAccount({id:"person-1"})');
    app.saved.set('flow_user_id','someone-else');
    assert.equal(app.run('getFlowRecoveryCopies("person-1").length'),0);
    assert.equal(app.run('getFlowRecoveryCopies("someone-else").length'),0);
});
