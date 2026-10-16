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
    const connection = {
        id: "connection-1", user_id: "user-1", item_id: "item-1",
        access_token: "access-secret-test", cursor: null
    };
    const environment = {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_ANON_KEY: "publishable-test",
        SUPABASE_SERVICE_ROLE_KEY: "service-test",
        PLAID_CLIENT_ID: "client-test",
        PLAID_SANDBOX_SECRET: "sandbox-secret-test"
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
                            data: { user: token === "valid-token" ? { id: "user-1" } : null },
                            error: null
                        })
                    }
                };
            }

            return {
                from: function(table) {
                    const filters = {};
                    const query = {
                        select: () => query,
                        eq: (field, value) => {
                            filters[field] = value;
                            return query;
                        },
                        maybeSingle: async () => ({
                            data: table === "plaid_connections" &&
                                filters.id === connection.id &&
                                filters.user_id === connection.user_id
                                ? connection : null,
                            error: null
                        }),
                        insert: async row => {
                            saved.push(row);
                            return { error: null };
                        },
                        then: resolve => resolve({
                            data: table === "plaid_transactions"
                                ? [{ data: { transaction_id: "txn-1" } }] : [],
                            error: null
                        })
                    };
                    return query;
                },
                rpc: async (_name, values) => {
                    rpcCalls.push(values);
                    return { error: null };
                }
            };
        },
        fetch: async function(url, options) {
            const body = JSON.parse(options.body);
            calls.push({ url, body });
            const exchange = url.endsWith("/item/public_token/exchange");
            const sync = url.endsWith("/transactions/sync");

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
                    if (exchange) {
                        return { item_id: "item-1", access_token: "access-secret-test" };
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
                            next_cursor: "cursor-2", has_more: false
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

    return { request, calls, saved, rpcCalls };
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
    assert.equal(server.calls[1].url, "https://sandbox.plaid.com/item/public_token/exchange");
    assert.equal(server.saved[0].access_token, "access-secret-test");
    assert.equal(server.saved[0].user_id, "user-1");
    assert.deepEqual(exchange.body, { connected: true });
    assert.equal(JSON.stringify(exchange.body).includes("access-secret-test"), false);
});


test("sync gathers every page before saving changes and cursor", async () => {
    const server = makeServer();
    const result = await server.request({
        action: "sync", connection_id: "connection-1"
    });

    assert.equal(result.status, 200);
    assert.equal(server.calls.length, 2);
    assert.equal(server.calls[0].body.cursor, "");
    assert.equal(server.calls[1].body.cursor, "cursor-1");
    assert.equal(server.rpcCalls.length, 1);
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
    assert.deepEqual(server.calls.map(call => call.body.cursor), [
        "", "cursor-1", "", "cursor-1"
    ]);
    assert.equal(server.rpcCalls.length, 1);
    assert.equal(server.rpcCalls[0].added.length, 1);
});
