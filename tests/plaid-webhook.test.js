const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");
const { webcrypto } = require("node:crypto");

function sourceFor(environment) {
    const folder = environment === "production"
        ? "plaid-production-webhook" : "plaid-webhook";
    return stripTypeScriptTypes(fs.readFileSync(
        path.join(__dirname, "..", "supabase", "functions", folder, "index.ts"), "utf8"
    ).replace(/^import .*;\n/, ""));
}

async function makeServer(environment = "sandbox", connectionEnvironment = environment) {
    const keyPair = await webcrypto.subtle.generateKey({
        name: "ECDSA", namedCurve: "P-256"
    }, true, ["sign", "verify"]);
    const publicKey = await webcrypto.subtle.exportKey("jwk", keyPair.publicKey);
    Object.assign(publicKey, { kid: "key-1", alg: "ES256", expired_at: null });
    let handler;
    let connectionExists = true;
    let databaseError = false;
    let verificationUnavailable = false;
    const calls = [];
    const saved = [];
    const warningUpdates = [];
    const context = {
        Response, TextEncoder, TextDecoder, atob, crypto: webcrypto,
        console: { error: () => {} },
        Deno: {
            env: { get: key => ({
                SUPABASE_URL: "https://example.supabase.co",
                SUPABASE_SERVICE_ROLE_KEY: "service-test",
                PLAID_CLIENT_ID: "client-test",
                PLAID_SANDBOX_SECRET: "sandbox-test",
                PLAID_PRODUCTION_SECRET: "production-test"
            })[key] },
            serve: fn => { handler = fn; }
        },
        createClient: () => ({
            from: () => ({
                select() { return this; },
                update(values) { this.values = values; return this; },
                eq(field, value) {
                    if (field === "item_id") this.itemId = value;
                    if (field === "environment") this.environment = value;
                    return this;
                },
                then(resolve) {
                    warningUpdates.push({ itemId: this.itemId,
                        environment: this.environment, values: this.values });
                    return resolve({ error: databaseError ? new Error("retry") : null });
                },
                async maybeSingle() {
                    return { data: connectionExists && this.itemId === "item-1" &&
                        this.environment === connectionEnvironment
                        ? { id: "connection-1", access_token: "access-test", cursor: null }
                        : null, error: null };
                }
            }),
            rpc: async (_name, data) => {
                saved.push(data);
                return { error: databaseError ? new Error("retry") : null };
            }
        }),
        fetch: async (url, options) => {
            calls.push({ url, body: JSON.parse(options.body) });
            if (verificationUnavailable && url.endsWith("verification_key/get")) {
                throw new Error("Plaid unavailable");
            }
            return { ok: true, json: async () => url.endsWith("verification_key/get")
                ? { key: publicKey }
                : { added: [{ transaction_id: "txn-1", account_id: "account-1",
                    amount: 3, date: "2026-10-16", name: "Coffee" }],
                    modified: [], removed: [], next_cursor: "cursor-1", has_more: false }
            };
        }
    };
    vm.runInNewContext(sourceFor(environment), context);

    async function signedRequest(body, overrides = {}) {
        const raw = JSON.stringify(body);
        const digest = Buffer.from(await webcrypto.subtle.digest("SHA-256",
            new TextEncoder().encode(raw))).toString("hex");
        const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: "key-1" }))
            .toString("base64url");
        const payload = Buffer.from(JSON.stringify({
            iat: Math.floor(Date.now() / 1000) + (overrides.timeOffset || 0),
            request_body_sha256: digest
        })).toString("base64url");
        const signed = `${header}.${payload}`;
        const signature = Buffer.from(await webcrypto.subtle.sign({
            name: "ECDSA", hash: "SHA-256"
        }, keyPair.privateKey, new TextEncoder().encode(signed))).toString("base64url");
        const token = `${signed}.${signature}`;
        const response = await handler(new Request("https://example.test/webhook", {
            method: "POST",
            headers: { "Plaid-Verification": overrides.token || token },
            body: overrides.rawBody || raw
        }));
        return response.status;
    }

    return { signedRequest, calls, saved, warningUpdates,
        setConnectionExists: value => { connectionExists = value; },
        setDatabaseError: value => { databaseError = value; },
        setVerificationUnavailable: value => { verificationUnavailable = value; } };
}

const event = {
    webhook_type: "TRANSACTIONS",
    webhook_code: "SYNC_UPDATES_AVAILABLE",
    item_id: "item-1"
};

test("signed transaction webhook fetches and saves changes", async () => {
    const server = await makeServer();
    assert.equal(await server.signedRequest(event), 200);
    assert.equal(server.calls[0].url,
        "https://sandbox.plaid.com/webhook_verification_key/get");
    assert.equal(server.calls[1].url,
        "https://sandbox.plaid.com/transactions/sync");
    assert.equal(server.saved[0].connection_id, "connection-1");
    assert.equal(server.saved[0].added[0].transaction_id, "txn-1");
});

test("production webhook verifies with production keys and only reads production Items", async () => {
    const server = await makeServer("production");
    assert.equal(await server.signedRequest(event), 200);
    assert.equal(server.calls[0].url,
        "https://production.plaid.com/webhook_verification_key/get");
    assert.equal(server.calls[0].body.secret, "production-test");
    assert.equal(server.calls[1].url, "https://production.plaid.com/transactions/sync");
    assert.equal(server.saved.length, 1);
});

test("production webhook ignores an Item stored as Sandbox", async () => {
    const server = await makeServer("production", "sandbox");
    assert.equal(await server.signedRequest(event), 200);
    assert.equal(server.saved.length, 0);
    assert.equal(server.calls.some(call => call.url.endsWith("/transactions/sync")), false);
});

test("signed Item warnings request reconnection and repair clears it", async () => {
    const server = await makeServer();
    const warning = { webhook_type: "ITEM", webhook_code: "PENDING_DISCONNECT",
        item_id: "item-1" };
    const repaired = { webhook_type: "ITEM", webhook_code: "LOGIN_REPAIRED",
        item_id: "item-1" };

    assert.equal(await server.signedRequest(warning), 200);
    assert.equal(await server.signedRequest(repaired), 200);
    assert.deepEqual(server.warningUpdates.map(update => update.values.reconnect_required),
        [true, false]);
    assert.equal(server.warningUpdates[0].itemId, "item-1");
    assert.equal(server.saved.length, 0);
});

test("a tampered Item warning cannot request reconnection", async () => {
    const server = await makeServer();
    const warning = { webhook_type: "ITEM", webhook_code: "PENDING_EXPIRATION",
        item_id: "item-1" };

    assert.equal(await server.signedRequest(warning, { rawBody: JSON.stringify({
        ...warning, item_id: "item-2"
    }) }), 401);
    assert.equal(server.warningUpdates.length, 0);
});

test("tampered and expired webhooks cannot touch bank data", async () => {
    const server = await makeServer();
    assert.equal(await server.signedRequest(event, {
        rawBody: JSON.stringify({ ...event, item_id: "item-2" })
    }), 401);
    assert.equal(await server.signedRequest(event, { timeOffset: -360 }), 401);
    assert.equal(await server.signedRequest(event, { token: "bad.token.value" }), 401);
    assert.equal(server.saved.length, 0);
    assert.equal(server.calls.some(call => call.url.endsWith("transactions/sync")), false);
});

test("unknown Item is ignored without syncing", async () => {
    const server = await makeServer();
    server.setConnectionExists(false);
    assert.equal(await server.signedRequest(event), 200);
    assert.equal(server.saved.length, 0);
});

test("database failure asks Plaid to retry", async () => {
    const server = await makeServer();
    server.setDatabaseError(true);
    assert.equal(await server.signedRequest(event), 503);
});

test("verification outage asks Plaid to retry", async () => {
    const server = await makeServer();
    server.setVerificationUnavailable(true);
    assert.equal(await server.signedRequest(event), 503);
    assert.equal(server.saved.length, 0);
});
