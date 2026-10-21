const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { createHmac } = require("node:crypto");
const { stripTypeScriptTypes } = require("node:module");
const { Webhook } = require("standardwebhooks");

const secretBytes = Buffer.alloc(32, 71);
const source = stripTypeScriptTypes(fs.readFileSync(path.join(__dirname, "..",
    "supabase/functions/flow-auth-email/index.ts"), "utf8").replace(/^import .*;\n/, ""));
const event = {
    user: { id: "pilot-test", email: "pilot@example.test" },
    email_data: { token: "123456", token_hash: "private-hash-test",
        email_action_type: "magiclink", redirect_to: "https://example.test/private-link" }
};

function makeServer(overrides = {}) {
    const env = {
        RESEND_API_KEY: "re_test_not_real",
        SEND_EMAIL_HOOK_SECRET: `v1,whsec_${secretBytes.toString("base64")}`,
        PLAID_PILOT_USER_ID: "pilot-test",
        ...overrides
    };
    let handler;
    let providerStatus = 200;
    let providerThrows = false;
    const calls = [];
    const logs = [];
    vm.runInNewContext(source, {
        Webhook, Request, Response, TextDecoder, AbortSignal,
        console: { log: (...args) => logs.push(args), error: (...args) => logs.push(args) },
        Deno: { env: { get: name => env[name] }, serve: fn => { handler = fn; } },
        fetch: async (url, options) => {
            calls.push({ url, headers: options.headers, body: JSON.parse(options.body),
                signal: options.signal });
            if (providerThrows) throw new Error("private provider detail re_test_not_real");
            return new Response(JSON.stringify({ detail: "private provider detail" }),
                { status: providerStatus });
        }
    });
    async function send(payload = event, options = {}) {
        const timestamp = String(Math.floor(Date.now() / 1000) + (options.age || 0));
        const eventId = options.eventId || "msg_test-1";
        const signedBody = JSON.stringify(payload);
        // Independent fixture using the Standard Webhooks signing specification.
        const signature = createHmac("sha256", secretBytes)
            .update(`${eventId}.${timestamp}.${signedBody}`).digest("base64");
        const headers = options.noSignature ? {} : {
            "webhook-id": eventId,
            "webhook-timestamp": timestamp,
            "webhook-signature": `v1,${signature}`
        };
        return handler(new Request("https://example.test/flow-auth-email", {
            method: "POST", headers, body: options.body ?? signedBody
        }));
    }
    return { handler, send, calls, logs,
        setStatus: value => { providerStatus = value; },
        setThrows: value => { providerThrows = value; } };
}

test("verified private sign-in sends a code and no login link or hash", async () => {
    const server = makeServer();
    const response = await server.send();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {});
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(server.calls.length, 1);
    const call = server.calls[0];
    assert.equal(call.url, "https://api.resend.com/emails");
    assert.deepEqual(call.body.to, ["pilot@example.test"]);
    assert.equal(call.body.from, "Flow <onboarding@resend.dev>");
    assert.equal(call.body.subject, "Your Flow sign-in code");
    assert.match(call.body.text, /123456/);
    assert.match(call.body.html, />123456</);
    assert.doesNotMatch(JSON.stringify(call.body), /https?:|private-hash|redirect_to/);
    assert.equal(call.headers.Authorization, "Bearer re_test_not_real");
    assert.equal(call.signal.aborted, false);
    assert.deepEqual(server.logs, []);
});

test("unsigned, tampered, stale, and future hooks cannot send email", async () => {
    const server = makeServer();
    for (const options of [
        { noSignature: true }, { body: JSON.stringify({ ...event, attacker: true }) },
        { age: -600 }, { age: 600 }, { body: "not-json" }
    ]) {
        assert.equal((await server.send(event, options)).status, 401);
    }
    assert.equal(server.calls.length, 0);
});

test("another user, unsafe recipient, or unsupported email action is rejected", async () => {
    const server = makeServer();
    for (const payload of [
        { ...event, user: { ...event.user, id: "another-user" } },
        { ...event, user: { ...event.user, email: "pilot@example.test,attacker@example.test" } },
        { ...event, user: { ...event.user, email: "Display name <pilot@example.test>" } },
        { ...event, email_data: { ...event.email_data, email_action_type: "email_change" } },
        { ...event, email_data: { ...event.email_data, email_action_type: "recovery" } },
        {}, null
    ]) {
        assert.equal((await server.send(payload)).status, 403);
    }
    assert.equal(server.calls.length, 0);
});

test("codes accept six to ten digits, never markup or missing values", async () => {
    const server = makeServer();
    for (const token of ["12345", "12345678901", "<img src=x>", 123456, undefined]) {
        assert.equal((await server.send({ ...event,
            email_data: { ...event.email_data, token } })).status, 403);
    }
    for (const token of ["012345", "0123456789"]) {
        assert.equal((await server.send({ ...event,
            email_data: { ...event.email_data, token } })).status, 200);
    }
    assert.equal(server.calls.length, 2);
});

test("missing or invalid server configuration fails closed without revealing secrets", async () => {
    for (const overrides of [
        { RESEND_API_KEY: "" }, { SEND_EMAIL_HOOK_SECRET: "" },
        { PLAID_PILOT_USER_ID: "" }, { SEND_EMAIL_HOOK_SECRET: "invalid base64 key" }
    ]) {
        const server = makeServer(overrides);
        const response = await server.send();
        assert.equal(response.status, 503);
        assert.doesNotMatch(await response.text(), /re_test|whsec_|123456|private/);
        assert.equal(server.calls.length, 0);
    }
});

test("provider errors and connection failures do not leak credentials, codes, or provider bodies", async () => {
    const server = makeServer();
    for (const status of [403, 429, 500]) {
        server.setStatus(status);
        const response = await server.send();
        assert.equal(response.status, 502);
        assert.doesNotMatch(await response.text(), /re_test|123456|private provider/);
    }
    server.setThrows(true);
    const response = await server.send();
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /re_test|123456|private provider/);
    assert.deepEqual(server.logs, []);
});

test("retries reuse the delivery key and different events get different keys", async () => {
    const server = makeServer();
    await server.send();
    await server.send();
    await server.send(event, { eventId: "msg_test-2" });
    const keys = server.calls.map(call => call.headers["Idempotency-Key"]);
    assert.equal(keys[0], keys[1]);
    assert.notEqual(keys[0], keys[2]);
});

test("unsupported methods and oversized bodies cannot reach the provider", async () => {
    const server = makeServer();
    const response = await server.handler(new Request("https://example.test/flow-auth-email"));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "POST");
    assert.equal((await server.send(event, { body: "x".repeat(65537) })).status, 401);
    assert.equal(server.calls.length, 0);
});
