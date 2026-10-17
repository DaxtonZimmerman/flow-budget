import { createClient } from "npm:@supabase/supabase-js@2";

const jsonHeaders = { "Content-Type": "application/json" };
const encoder = new TextEncoder();

function reply(status: number, message: string) {
    return new Response(JSON.stringify({ message }), { status, headers: jsonHeaders });
}

function base64url(value: string) {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/")
        .padEnd(Math.ceil(value.length / 4) * 4, "=");
    return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

function decodePart(value: string) {
    return JSON.parse(new TextDecoder().decode(base64url(value)));
}

function equalHex(expected: string, actual: string) {
    if (!/^[0-9a-f]{64}$/i.test(expected) || !/^[0-9a-f]{64}$/i.test(actual)) return false;
    const left = expected.toLowerCase();
    const right = actual.toLowerCase();
    let different = 0;
    for (let index = 0; index < left.length; index++) {
        different |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return different === 0;
}

function plaidCredentials() {
    const clientId = Deno.env.get("PLAID_CLIENT_ID");
    const secret = Deno.env.get("PLAID_SANDBOX_SECRET");
    if (!clientId || !secret) throw new Error("Plaid Sandbox keys are not set.");
    return { client_id: clientId, secret };
}

async function plaidRequest(path: string, data: Record<string, unknown>) {
    const response = await fetch(`https://sandbox.plaid.com${path}`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ ...plaidCredentials(), ...data })
    });
    const result = await response.json();
    if (!response.ok) {
        const error = new Error(result.error_message || "Plaid request failed.");
        Object.assign(error, { code: result.error_code });
        throw error;
    }
    return result;
}

async function verifyWebhook(jwt: string | null, rawBody: string) {
    if (!jwt || jwt.length > 4096) return false;
    const parts = jwt.split(".");
    if (parts.length !== 3) return false;

    try {
        const header = decodePart(parts[0]);
        if (header.alg !== "ES256" || typeof header.kid !== "string" ||
            !/^[a-zA-Z0-9_-]{1,200}$/.test(header.kid)) return false;

        let result;
        try {
            result = await plaidRequest("/webhook_verification_key/get", {
                key_id: header.kid
            });
        } catch (_error) {
            // A temporary Plaid outage should be retried, not discarded as a bad signature.
            return null;
        }
        const jwk = result.key;
        if (jwk?.kid !== header.kid || jwk?.kty !== "EC" ||
            jwk?.crv !== "P-256" || jwk?.alg !== "ES256" ||
            (jwk.expired_at != null && jwk.expired_at <= Date.now() / 1000)) return false;

        const key = await crypto.subtle.importKey("jwk", jwk, {
            name: "ECDSA", namedCurve: "P-256"
        }, false, ["verify"]);
        const signature = base64url(parts[2]);
        if (signature.length !== 64) return false;
        const signed = await crypto.subtle.verify({
            name: "ECDSA", hash: "SHA-256"
        }, key, signature, encoder.encode(`${parts[0]}.${parts[1]}`));
        if (!signed) return false;

        const payload = decodePart(parts[1]);
        const now = Math.floor(Date.now() / 1000);
        if (!Number.isInteger(payload.iat) || payload.iat < now - 300 ||
            payload.iat > now + 60) return false;

        const hash = new Uint8Array(await crypto.subtle.digest(
            "SHA-256", encoder.encode(rawBody)
        ));
        const digest = Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
        return equalHex(payload.request_body_sha256, digest);
    } catch (_error) {
        return false;
    }
}

function keepTransaction(item: Record<string, unknown>) {
    return {
        transaction_id: item.transaction_id,
        account_id: item.account_id,
        amount: item.amount,
        date: item.date,
        name: item.name,
        merchant_name: item.merchant_name,
        pending: item.pending,
        pending_transaction_id: item.pending_transaction_id
    };
}

async function getPlaidChanges(connection: { access_token: string; cursor: string | null }) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const changes: {
            added: unknown[]; modified: unknown[]; removed: unknown[];
        } = { added: [], modified: [], removed: [] };
        let cursor = connection.cursor;

        try {
            for (let pageCount = 0; pageCount < 30; pageCount++) {
                const page = await plaidRequest("/transactions/sync", {
                    access_token: connection.access_token,
                    cursor: cursor || "",
                    count: 500
                });
                changes.added.push(...page.added.map(keepTransaction));
                changes.modified.push(...page.modified.map(keepTransaction));
                changes.removed.push(...page.removed);
                cursor = page.next_cursor;
                if (!page.has_more) return { ...changes, cursor };
            }
            throw new Error("Too many bank updates.");
        } catch (error) {
            if ((error as { code?: string }).code !==
                "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" || attempt === 2) throw error;
        }
    }
    throw new Error("Bank updates could not be read.");
}

Deno.serve(async request => {
    if (request.method !== "POST") return reply(405, "Use POST.");
    const rawBody = await request.text();
    if (encoder.encode(rawBody).length > 128_000) return reply(413, "Payload too large.");
    const verified = await verifyWebhook(request.headers.get("Plaid-Verification"), rawBody);
    if (verified === null) return reply(503, "Verification is temporarily unavailable.");
    if (!verified) {
        return reply(401, "Invalid webhook signature.");
    }

    let event;
    try {
        event = JSON.parse(rawBody);
    } catch (_error) {
        return reply(400, "Invalid webhook body.");
    }
    if (event.webhook_type !== "TRANSACTIONS" ||
        event.webhook_code !== "SYNC_UPDATES_AVAILABLE" ||
        typeof event.item_id !== "string") return reply(200, "Ignored.");

    const projectUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
        JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default;
    if (!projectUrl || !serviceKey) return reply(503, "Server configuration is incomplete.");
    const database = createClient(projectUrl, serviceKey);

    try {
        const { data: connection, error } = await database.from("plaid_connections")
            .select("id,access_token,cursor")
            .eq("item_id", event.item_id)
            .maybeSingle();
        if (error) throw error;
        if (!connection) return reply(200, "Ignored.");

        const changes = await getPlaidChanges(connection);
        const saved = await database.rpc("save_plaid_sync", {
            connection_id: connection.id,
            expected_cursor: connection.cursor,
            next_cursor: changes.cursor,
            added: changes.added,
            modified: changes.modified,
            removed: changes.removed
        });
        if (saved.error) throw saved.error;
        return reply(200, "Synced.");
    } catch (error) {
        console.error("Could not process Plaid transaction webhook:", error);
        return reply(503, "Could not sync yet.");
    }
});
