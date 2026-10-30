const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const file = path.join(__dirname, "..", "supabase", "functions", "plaid", "index.ts");
const source = fs.readFileSync(file, "utf8").replace(/^import .*;\n/, "");


function makeServer(options = {}) {
    let handler;
    const calls = [];
    const saved = [];
    const rpcCalls = [];
    const deletedUsers = [];
    const updates = [];
    const connection = {
        id: "connection-1", user_id: "user-1", item_id: "item-1",
        access_token: "access-secret-test", cursor: null,
        environment: options.connectionEnvironment || "sandbox",
        recovery_required: options.recoveryRequired || false, history_complete: options.historyComplete || false,
        reconnect_required: options.reconnectRequired || false
    };
    let connections = options.noConnections ? []
        : [connection, ...(options.extraConnections || [])];
    const needsReconnect = options.needsReconnect;
    const environment = {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_ANON_KEY: "publishable-test",
        SUPABASE_SERVICE_ROLE_KEY: "service-test",
        PLAID_CLIENT_ID: "client-test",
        PLAID_SANDBOX_SECRET: "sandbox-secret-test",
        PLAID_PRODUCTION_SECRET: "production-secret-test",
        PLAID_PILOT_USER_ID: "user-1",
        PLAID_PILOT_ENABLED: options.pilotEnabled ? "true" : "false",
        PLAID_RECOVERY_ENABLED: options.recoveryEnabled ? "true" : "false"
    };

    const context = {
        Response: Response,
        Deno: {
            env: { get: key => environment[key] },
            serve: fn => { handler = fn; }
        },
        createClient: function(_url, key) {
            if (key === "publishable-test") {
                return {
                    auth: {
                        getUser: async token => ({
                            data: { user: token === "valid-token" ? { id: "user-1" }
                                : token === "other-token" ? { id: "user-2" } : null },
                            error: null
                        })
                    }
                };
            }

            return {
                auth: { admin: { deleteUser: async id => {
                    deletedUsers.push(id);
                    return { error: options.deleteUserError || null };
                } } },
                from: function(table) {
                    const filters = {};
                    let deleting = false;
                    let limit = Infinity;
                    const query = {
                        select: () => query,
                        order: () => query,
                        limit: value => { limit = value; return query; },
                        delete: () => { deleting = true; return query; },
                        update: values => { updates.push({ table, values, filters }); return query; },
                        eq: (field, value) => {
                            filters[field] = value;
                            return query;
                        },
                        maybeSingle: async () => ({
                            data: table === "plaid_connections"
                                ? connections.find(row => Object.entries(filters).every(
                                    ([field, value]) => row[field] === value
                                )) || null : null,
                            error: null
                        }),
                        insert: async row => {
                            saved.push(row);
                            return { error: null };
                        },
                        then: resolve => {
                            if (deleting && table === "plaid_connections") {
                                if (options.deleteRowError) {
                                    return resolve({ error: options.deleteRowError });
                                }
                                connections = connections.filter(row =>
                                    !Object.entries(filters).every(
                                        ([field, value]) => row[field] === value
                                    )
                                );
                                return resolve({ error: null });
                            }

                            return resolve({
                                data: table === "plaid_transactions"
                                    ? [{ data: { transaction_id: "txn-1" } }]
                                    : table === "plaid_connections"
                                        ? connections.filter(row => Object.entries(filters).every(
                                            ([field, value]) => row[field] === value
                                        )).slice(0, limit) : [],
                                error: null
                            });
                        }
                    };
                    return query;
                },
                rpc: async (name, values) => {
                    rpcCalls.push({ name, ...values });
                    if(name==='read_plaid_snapshot') return {data:options.snapshotMissing?null:{complete:true,count:options.snapshotCount??(options.snapshotRows||[{transaction_id:'txn-1',account_id:'cash',date:'2026-10-30',amount:1}]).length,transactions:options.snapshotRows||[{transaction_id:'txn-1',account_id:'cash',date:'2026-10-30',amount:1}]},error:options.snapshotError||null};
                    return { data: name === "disconnect_plaid_connection"
                        ? { revision: 2, data: { transactions: [] } } : null,
                    error: options.rpcError || null };
                }
            };
        },
        fetch: async function(url, requestOptions) {
            const body = JSON.parse(requestOptions.body);
            calls.push({ url, body });
            const exchange = url.endsWith("/item/public_token/exchange");
            const itemGet = url.endsWith("/item/get");
            const sync = url.endsWith("/transactions/sync");
            const remove = url.endsWith("/item/remove");

            if (remove && options.removeErrorCode) {
                return {
                    ok: false,
                    json: async () => ({
                        error_code: options.removeErrorCode,
                        error_message: "Could not remove Item"
                    })
                };
            }

            if (sync && body.cursor === "cursor-1" &&
                context.mutateOnce && !context.mutated) {
                context.mutated = true;
                return {
                    ok: false,
                    json: async () => ({
                        error_code: "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION",
                        error_message: "Transactions changed during pagination."
                    })
                };
            }

            return {
                ok: true,
                json: async () => {
                    if (url.endsWith("/accounts/get")) return {accounts: options.accounts || []};
                    if (exchange) {
                        return { item_id: "item-1", access_token: "access-secret-test" };
                    }
                    if (itemGet) {
                        return { item: { error: needsReconnect
                            ? { error_code: "ITEM_LOGIN_REQUIRED" } : null }, status:options.itemStatus };
                    }
                    if (sync && !body.cursor) {
                        return {
                            added: [{
                                transaction_id: "txn-1", account_id: "account-1",
                                amount: 4.25, date: "2026-10-16", name: "Coffee"
                            }],
                            modified: [], removed: [],
                            next_cursor: "cursor-1", has_more: true
                        };
                    }
                    if (sync) {
                        return {
                            added: [], modified: [],
                            removed: [{ transaction_id: "old-txn" }],
                            next_cursor: "cursor-2", has_more: false, transactions_update_status: options.historyComplete ? "HISTORICAL_UPDATE_COMPLETE" : "INITIAL_UPDATE_COMPLETE"
                        };
                    }
                    return { link_token: "link-test" };
                }
            };
        }
    };

    context.mutateOnce = options.mutateOnce;

    vm.runInNewContext(source, context);

    async function request(action, token = "valid-token") {
        const response = await handler(new Request("https://example.test/plaid", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify(action)
        }));

        return { status: response.status, body: await response.json() };
    }

    return { request, calls, saved, rpcCalls, deletedUsers, updates };
}


test("a bank request needs a signed-in Flow user", async () => {
    const server = makeServer();
    const result = await server.request({ action: "create-link-token" }, "invalid-token");

    assert.equal(result.status, 401);
    assert.equal(server.calls.length, 0);
});


test("Plaid calls stay in Sandbox and never return the secret", async () => {
    const server = makeServer();
    const link = await server.request({ action: "create-link-token" });
    const exchange = await server.request({
        action: "exchange-public-token",
        public_token: "public-sandbox-test",
        institution_name: "Test Bank"
    });

    assert.equal(link.body.link_token, "link-test");
    assert.equal(server.calls[0].url, "https://sandbox.plaid.com/link/token/create");
    assert.equal(server.calls[0].body.user.client_user_id, "user-1");
    assert.equal(server.calls[0].body.webhook,
        "https://example.supabase.co/functions/v1/plaid-webhook");
    assert.equal(server.calls[1].url, "https://sandbox.plaid.com/item/public_token/exchange");
    assert.equal(server.saved[0].access_token, "access-secret-test");
    assert.equal(server.saved[0].user_id, "user-1");
    assert.deepEqual(exchange.body, { connected: true, recovery_required: false });
    assert.equal(JSON.stringify(exchange.body).includes("access-secret-test"), false);
});


test("only the named pilot user receives a production Link token", async () => {
    const server = makeServer({ pilotEnabled: true, noConnections: true });
    const pilot = await server.request({ action: "create-link-token" });
    const other = await server.request({ action: "create-link-token" }, "other-token");
    const exchange = await server.request({
        action: "exchange-public-token", public_token: "public-production-test"
    });

    assert.equal(pilot.status, 200);
    assert.equal(other.status, 200);
    assert.equal(server.calls[0].url, "https://production.plaid.com/link/token/create");
    assert.equal(server.calls[0].body.webhook,
        "https://example.supabase.co/functions/v1/plaid-production-webhook");
    assert.equal(server.calls[0].body.secret, "production-secret-test");
    assert.equal(server.calls[1].url, "https://sandbox.plaid.com/link/token/create");
    assert.equal(server.calls[2].url,
        "https://production.plaid.com/item/public_token/exchange");
    assert.equal(server.saved[0].environment, "production");
    assert.equal(JSON.stringify(exchange.body).includes("production-secret-test"), false);
});


test("a test bank must be removed before the pilot can link a real bank", async () => {
    const server = makeServer({ pilotEnabled: true });
    const link = await server.request({ action: "create-link-token" });
    const exchange = await server.request({
        action: "exchange-public-token", public_token: "public-production-test"
    });

    assert.equal(link.status, 409);
    assert.equal(exchange.status, 409);
    assert.match(link.body.error, /disconnect the test bank/i);
    assert.equal(server.calls.length, 0);
});


test("a second production Item is blocked before using a Trial connection", async () => {
    const server = makeServer({ pilotEnabled: true, connectionEnvironment: "production" });
    const link = await server.request({ action: "create-link-token" });
    const exchange = await server.request({
        action: "exchange-public-token", public_token: "public-production-test"
    });

    assert.equal(link.status, 409);
    assert.equal(exchange.status, 409);
    assert.equal(server.calls.length, 0);
});


test("existing production Items continue using production after pilot creation is disabled", async () => {
    const server = makeServer({ connectionEnvironment: "production" });
    const result = await server.request({ action: "sync", connection_id: "connection-1" });

    assert.equal(result.status, 200);
    assert.equal(server.calls[0].url, "https://production.plaid.com/item/get");
    assert.equal(server.calls[1].url, "https://production.plaid.com/transactions/sync");
});


test("disconnect revokes an existing production Item in Production", async () => {
    const server = makeServer({ connectionEnvironment: "production" });
    const result = await server.request({ action: "disconnect", connection_id: "connection-1" });

    assert.equal(result.status, 200);
    assert.equal(server.calls[0].url, "https://production.plaid.com/item/remove");
    assert.equal(server.rpcCalls[0].name, "disconnect_plaid_connection");
    assert.equal(server.rpcCalls[0].owner_id, "user-1");
    assert.equal(result.body.revision, 2);
});


test("sync gathers every page before saving changes and cursor", async () => {
    const server = makeServer();
    const result = await server.request({
        action: "sync", connection_id: "connection-1"
    });

    assert.equal(result.status, 200);
    assert.equal(server.calls.length, 3);
    assert.equal(server.calls[0].url, "https://sandbox.plaid.com/item/get");
    assert.equal(server.calls[1].body.cursor, "");
    assert.equal(server.calls[2].body.cursor, "cursor-1");
    assert.equal(server.rpcCalls.filter(c=>c.name === "save_plaid_sync").length, 1);
    assert.equal(server.rpcCalls[0].next_cursor, "cursor-2");
    assert.equal(server.rpcCalls[0].added[0].transaction_id, "txn-1");
    assert.equal(server.rpcCalls[0].removed[0].transaction_id, "old-txn");
    assert.equal(result.body.transactions[0].transaction_id, "txn-1");
    assert.equal(JSON.stringify(result.body).includes("access-secret-test"), false);
});


test("sync cannot access another person's bank connection", async () => {
    const server = makeServer();
    const result = await server.request({
        action: "sync", connection_id: "someone-elses-connection"
    });

    assert.equal(result.status, 404);
    assert.equal(server.calls.length, 0);
    assert.equal(server.rpcCalls.length, 0);
});


test("a changed Plaid page restarts from the original cursor", async () => {
    const server = makeServer({ mutateOnce: true });
    const result = await server.request({
        action: "sync", connection_id: "connection-1"
    });

    assert.equal(result.status, 200);
    assert.deepEqual(server.calls.filter(call =>
        call.url.endsWith("/transactions/sync")
    ).map(call => call.body.cursor), [
        "", "cursor-1", "", "cursor-1"
    ]);
    assert.equal(server.rpcCalls.filter(c=>c.name === "save_plaid_sync").length, 1);
    assert.equal(server.rpcCalls[0].added.length, 1);
});


test("a reconnect token is only made for the owner's bank", async () => {
    const server = makeServer();
    const denied = await server.request({
        action: "reconnect", connection_id: "someone-elses-connection"
    });
    const allowed = await server.request({
        action: "reconnect", connection_id: "connection-1"
    });

    assert.equal(denied.status, 404);
    assert.equal(allowed.body.link_token, "link-test");
    assert.equal(server.calls.length, 1);
    assert.equal(server.calls[0].body.access_token, "access-secret-test");
    assert.equal(server.calls[0].body.products, undefined);
    assert.equal(JSON.stringify(allowed.body).includes("access-secret-test"), false);
});


test("a bank that needs repair is listed but not synced", async () => {
    const server = makeServer({ needsReconnect: true });
    const list = await server.request({ action: "connections" });
    const sync = await server.request({
        action: "sync", connection_id: "connection-1"
    });

    assert.equal(list.status, 200);
    assert.equal(list.body.connections[0].needs_reconnect, true);
    assert.equal(JSON.stringify(list.body).includes("access-secret-test"), false);
    assert.equal(sync.status, 409);
    assert.equal(sync.body.needs_reconnect, true);
    assert.equal(server.calls.some(call =>
        call.url.endsWith("/transactions/sync")
    ), false);
});


test("an advance warning offers reconnection and a successful repair clears it", async () => {
    const server = makeServer({ reconnectRequired: true });
    const list = await server.request({ action: "connections" });
    const denied = await server.request({
        action: "reconnect-complete", connection_id: "someone-elses-connection"
    });
    const repaired = await server.request({
        action: "reconnect-complete", connection_id: "connection-1"
    });

    assert.equal(list.body.connections[0].needs_reconnect, true);
    assert.equal(denied.status, 404);
    assert.equal(repaired.status, 200);
    assert.equal(server.updates[0].values.reconnect_required, false);
    assert.equal(server.updates[0].filters.user_id, "user-1");
});


test("account deletion removes the owner's Plaid Item before deleting the user", async () => {
    const server = makeServer();
    const result = await server.request({ action: "delete-account" });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { deleted: true });
    assert.equal(server.calls.length, 1);
    assert.equal(server.calls[0].url, "https://sandbox.plaid.com/item/remove");
    assert.equal(server.calls[0].body.access_token, "access-secret-test");
    assert.deepEqual(server.deletedUsers, ["user-1"]);
    assert.equal(JSON.stringify(result.body).includes("access-secret-test"), false);
});


test("account deletion cannot remove another user's bank", async () => {
    const server = makeServer();
    const result = await server.request({ action: "delete-account" }, "other-token");

    assert.equal(result.status, 200);
    assert.equal(server.calls.length, 0);
    assert.deepEqual(server.deletedUsers, ["user-2"]);
});


test("account deletion keeps the user when Plaid revocation fails", async () => {
    const server = makeServer({ removeErrorCode: "INTERNAL_SERVER_ERROR" });
    const result = await server.request({ action: "delete-account" });

    assert.equal(result.status, 502);
    assert.deepEqual(server.deletedUsers, []);
    assert.equal(JSON.stringify(result.body).includes("access-secret-test"), false);
});


test("account deletion can finish when Plaid Item was already removed", async () => {
    const server = makeServer({ removeErrorCode: "ITEM_NOT_FOUND" });
    const result = await server.request({ action: "delete-account" });

    assert.equal(result.status, 200);
    assert.deepEqual(server.deletedUsers, ["user-1"]);
});


test("account deletion revokes every Item before removing the user", async () => {
    const server = makeServer({ extraConnections: [{
        id: "connection-2", user_id: "user-1", item_id: "item-2",
        access_token: "access-secret-second", cursor: null
    }] });
    const result = await server.request({ action: "delete-account" });

    assert.equal(result.status, 200);
    assert.deepEqual(server.calls.map(call => call.body.access_token), [
        "access-secret-test", "access-secret-second"
    ]);
    assert.deepEqual(server.deletedUsers, ["user-1"]);
});


test("account deletion keeps the user if revoked Item cleanup fails", async () => {
    const server = makeServer({ deleteRowError: new Error("database unavailable") });
    const result = await server.request({ action: "delete-account" });

    assert.equal(result.status, 500);
    assert.deepEqual(server.deletedUsers, []);
});

test('cached account balances require authentication and ownership, stay in the connection environment, and omit secrets',async()=>{
 const server=makeServer({connectionEnvironment:'production',accounts:[{account_id:'cash',name:'Checking',type:'depository',subtype:'checking',mask:'1234',access_token:'never-send',balances:{available:null,current:42.5,iso_currency_code:'USD',limit:5000}}]});
 assert.equal((await server.request({action:'accounts',connection_id:'connection-1'},'invalid-token')).status,401);
 assert.equal((await server.request({action:'accounts',connection_id:'other-user-connection'})).status,404);
 assert.equal(server.calls.length,0);
 const result=await server.request({action:'accounts',connection_id:'connection-1'});
 assert.equal(result.status,200);assert.equal(result.body.accounts[0].balances.available,null);assert.equal(result.body.accounts[0].balances.current,42.5);
 assert.equal(result.body.balance_source,'cached');assert.ok(result.body.retrieved_at);
 const encoded=JSON.stringify(result.body);for(const privateValue of ['never-send','1234','production-secret-test','access-secret-test','5000'])assert.equal(encoded.includes(privateValue),false);
 assert.equal(server.calls.length,1);assert.equal(server.calls[0].url,'https://production.plaid.com/accounts/get');
});


test('connection checks return the bank feed date separately from Flow import dates without extra or paid requests',async()=>{
 const status={transactions:{last_successful_update:'2026-10-23T17:00:00Z',last_failed_update:'2026-10-22T17:00:00Z',access_token:'never-return'},investments:{last_successful_update:'2026-10-24T12:00:00Z'}};
 const server=makeServer({itemStatus:status}),result=await server.request({action:'connections'});
 assert.equal(result.status,200);assert.deepEqual(result.body.connections[0].transaction_status,{last_successful_update:'2026-10-23T17:00:00.000Z',last_failed_update:'2026-10-22T17:00:00.000Z'});
 assert.equal(server.calls.length,1);assert.ok(server.calls[0].url.endsWith('/item/get'));
 for(const value of ['never-return','access-secret-test','sandbox-secret-test','investments'])assert.equal(JSON.stringify(result.body).includes(value),false);
});
test('a successful import returns only the transaction timing observed before that import',async()=>{
 const server=makeServer({itemStatus:{transactions:{last_successful_update:'2026-10-23T17:00:00Z',last_failed_update:null}}}),result=await server.request({action:'sync',connection_id:'connection-1'});
 assert.equal(result.status,200);assert.equal(result.body.transaction_status.last_successful_update,'2026-10-23T17:00:00.000Z');assert.equal(result.body.transaction_status.last_failed_update,null);
 assert.equal(server.calls.filter(c=>c.url.endsWith('/item/get')).length,1);assert.equal(server.calls.some(c=>c.url.endsWith('/transactions/refresh')),false);
});
test('missing, malformed and future bank-feed dates stay unknown and are never replaced by now',async()=>{
 for(const itemStatus of [undefined,{transactions:{}},{transactions:{last_successful_update:'not-a-date',last_failed_update:'2035-01-01T00:00:00Z'}}]){
  const result=await makeServer({itemStatus}).request({action:'connections'});assert.deepEqual(result.body.connections[0].transaction_status,{last_successful_update:null,last_failed_update:null});
 }
});

test('a replacement Production connection is staged, requests history once, and cannot import before review',async()=>{
 const server=makeServer({noConnections:true,pilotEnabled:true,recoveryEnabled:true});
 assert.equal((await server.request({action:'create-link-token'})).status,200);
 assert.deepEqual(server.calls[0].body.transactions,{days_requested:730});
 assert.deepEqual(server.calls[0].body.products,['transactions']);
 const exchange=await server.request({action:'exchange-public-token',public_token:'public-test'});
 assert.equal(exchange.body.recovery_required,true);assert.equal(server.saved[0].recovery_required,true);
 const pending=makeServer({connectionEnvironment:'production',recoveryRequired:true});
 assert.equal((await pending.request({action:'sync',connection_id:'connection-1'})).status,409);
 assert.equal(pending.calls.length,0);assert.equal(pending.rpcCalls.length,0);
 assert.equal((await pending.request({action:'connections'})).body.connections[0].recovery_required,true);
});
test('recovery preview checks ownership, stages every page and exposes full-history readiness without secrets',async()=>{
 const server=makeServer({connectionEnvironment:'production',recoveryRequired:true,historyComplete:true});
 const preview=await server.request({action:'recovery-preview',connection_id:'connection-1'});
 assert.equal(preview.status,200);assert.equal(preview.body.history_complete,true);assert.equal(preview.body.cursor,'cursor-2');assert.equal(preview.body.recovery_required,true);
 assert.equal(server.rpcCalls[0].name,'save_plaid_sync');assert.equal(JSON.stringify(preview).includes('access-secret'),false);
 const denied=await server.request({action:'recovery-preview',connection_id:'connection-1'},'other-token');assert.equal(denied.status,404);
 assert.equal((await makeServer().request({action:'recovery-preview',connection_id:'connection-1'})).status,409);
 const partial=await makeServer({recoveryRequired:true}).request({action:'recovery-preview',connection_id:'connection-1'});assert.equal(partial.body.history_complete,false);
});
test('recovery completion requires a checked versioned snapshot and passes only the verified owner to its atomic RPC',async()=>{
 const server=makeServer({recoveryRequired:true});
 assert.equal((await server.request({action:'complete-recovery',connection_id:'connection-1'})).status,400);assert.equal(server.rpcCalls.length,0);
 const result=await server.request({action:'complete-recovery',connection_id:'connection-1',expected_revision:7,expected_cursor:'cursor-2',owner_id:'attacker',data:{clientSchemaVersion:2,transactions:[],bankAccounts:[]}});
 assert.equal(result.status,200);assert.equal(server.rpcCalls[0].owner_id,'user-1');assert.equal(server.rpcCalls[0].expected_revision,7);assert.equal(server.calls.length,0,'completion never creates, removes or rotates a Plaid Item');
 const stale=await makeServer({rpcError:new Error('stale')}).request({action:'complete-recovery',connection_id:'connection-1',expected_revision:7,expected_cursor:'cursor-2',data:{clientSchemaVersion:2,transactions:[],bankAccounts:[]}});assert.equal(stale.status,409);
});

test('sync returns a complete scalar snapshot beyond the REST row cap and fails closed on incomplete reads',async()=>{
 const rows=Array.from({length:1205},(_,i)=>({transaction_id:'t'+i,account_id:'cash',date:'2026-10-30',amount:1}));
 const server=makeServer({snapshotRows:rows}),r=await server.request({action:'sync',connection_id:'connection-1'});
 assert.equal(r.status,200);assert.equal(r.body.transaction_count,1205);assert.equal(r.body.snapshot_complete,true);assert.equal(r.body.transactions.length,1205);
 const call=server.rpcCalls.find(c=>c.name==='read_plaid_snapshot');assert.equal(call.p_owner,'user-1');assert.equal(call.p_connection,'connection-1');assert.equal(call.p_cursor,server.rpcCalls[0].next_cursor);
 for(const options of [{snapshotMissing:true},{snapshotCount:999},{snapshotError:new Error('read failed')}]){
  const broken=await makeServer(options).request({action:'sync',connection_id:'connection-1'});assert.equal(broken.status,503);assert.equal('transactions' in broken.body,false);
 }
});
