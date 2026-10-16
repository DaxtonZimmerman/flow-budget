import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
};


function reply(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers });
}


function supabaseKey(name, oldName) {
    const value = Deno.env.get(name);

    if (value) {
        return JSON.parse(value).default;
    }

    return Deno.env.get(oldName);
}


async function plaidRequest(path, data) {
    const clientId = Deno.env.get("PLAID_CLIENT_ID");
    const secret = Deno.env.get("PLAID_SANDBOX_SECRET");

    if (!clientId || !secret) {
        throw new Error("Plaid Sandbox keys are not set.");
    }

    const response = await fetch(`https://sandbox.plaid.com${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, secret, ...data })
    });
    const result = await response.json();

    if (!response.ok) {
        const error = new Error(result.error_message || "Plaid could not complete the request.");
        error.code = result.error_code;
        throw error;
    }

    return result;
}


function keepTransaction(item) {
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


async function getPlaidChanges(connection) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const changes = { added: [], modified: [], removed: [] };
        let cursor = connection.cursor;
        let pageCount = 0;

        try {
            while (true) {
                pageCount++;

                if (pageCount > 30) {
                    throw new Error("Too many bank updates. Try again later.");
                }

                const page = await plaidRequest("/transactions/sync", {
                    access_token: connection.access_token,
                    cursor: cursor || "",
                    count: 500
                });

                changes.added.push(...page.added.map(keepTransaction));
                changes.modified.push(...page.modified.map(keepTransaction));
                changes.removed.push(...page.removed);
                cursor = page.next_cursor;

                if (!page.has_more) {
                    return { ...changes, cursor };
                }
            }
        } catch (error) {
            if (error.code !== "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" || attempt === 2) {
                throw error;
            }
        }
    }
}


Deno.serve(async function(request) {
    if (request.method === "OPTIONS") {
        return new Response(null, { headers });
    }

    if (request.method !== "POST") {
        return reply({ error: "Use POST." }, 405);
    }

    const projectUrl = Deno.env.get("SUPABASE_URL");
    const publishableKey = supabaseKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const serviceKey = supabaseKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");

    if (!projectUrl || !publishableKey || !serviceKey) {
        return reply({ error: "Server configuration is incomplete." }, 503);
    }

    if (!token) {
        return reply({ error: "Sign in first." }, 401);
    }

    const auth = createClient(projectUrl, publishableKey);
    let userData;
    let userError;

    try {
        const result = await auth.auth.getUser(token);
        userData = result.data;
        userError = result.error;
    } catch (error) {
        console.error("Could not check bank sign-in:", error);
        return reply({ error: "Could not check sign-in. Try again." }, 502);
    }

    if (userError || !userData.user) {
        return reply({ error: "Sign in first." }, 401);
    }

    const database = createClient(projectUrl, serviceKey);
    let body;

    try {
        body = await request.json();
    } catch (_error) {
        return reply({ error: "Invalid request." }, 400);
    }

    try {
        if (body.action === "create-link-token") {
            const result = await plaidRequest("/link/token/create", {
                client_name: "Flow",
                country_codes: ["US"],
                language: "en",
                products: ["transactions"],
                user: { client_user_id: userData.user.id }
            });

            return reply({ link_token: result.link_token });
        }

        if (body.action === "exchange-public-token") {
            if (typeof body.public_token !== "string" || !body.public_token.startsWith("public-")) {
                return reply({ error: "Invalid bank connection." }, 400);
            }

            const result = await plaidRequest("/item/public_token/exchange", {
                public_token: body.public_token
            });
            const { error } = await database.from("plaid_connections").insert({
                user_id: userData.user.id,
                item_id: result.item_id,
                access_token: result.access_token,
                institution_name: typeof body.institution_name === "string"
                    ? body.institution_name.slice(0, 100) : "Bank"
            });

            if (error) {
                return reply({ error: "Could not save the connection. Try again." }, 500);
            }

            return reply({ connected: true });
        }

        if (body.action === "connections") {
            const { data, error } = await database.from("plaid_connections")
                .select("id,institution_name,created_at,last_synced_at")
                .eq("user_id", userData.user.id)
                .order("created_at", { ascending: false });

            if (error) {
                console.error("Could not load bank connections:", error);
                return reply({ error: "Could not load bank connections." }, 500);
            }

            return reply({ connections: data });
        }

        if (body.action === "sync") {
            if (typeof body.connection_id !== "string") {
                return reply({ error: "Choose a bank connection." }, 400);
            }

            const { data: connection, error: connectionError } = await database
                .from("plaid_connections")
                .select("id,item_id,access_token,cursor")
                .eq("id", body.connection_id)
                .eq("user_id", userData.user.id)
                .maybeSingle();

            if (connectionError || !connection) {
                return reply({ error: "Bank connection not found." }, 404);
            }

            const changes = await getPlaidChanges(connection);
            const saved = await database.rpc("save_plaid_sync", {
                connection_id: connection.id,
                expected_cursor: connection.cursor,
                next_cursor: changes.cursor,
                added: changes.added,
                modified: changes.modified,
                removed: changes.removed
            });

            if (saved.error) {
                return reply({ error: "Bank data changed. Sync again." }, 409);
            }

            const { data: transactions, error: listError } = await database
                .from("plaid_transactions")
                .select("data")
                .eq("item_id", connection.item_id);

            if (listError) {
                return reply({ error: "Could not load bank transactions." }, 500);
            }

            return reply({
                transactions: transactions.map(function(row) { return row.data; }),
                last_synced_at: new Date().toISOString()
            });
        }

        if (body.action === "disconnect") {
            if (typeof body.connection_id !== "string") {
                return reply({ error: "Choose a bank connection." }, 400);
            }

            const { data: connection, error: connectionError } = await database
                .from("plaid_connections")
                .select("id,access_token")
                .eq("id", body.connection_id)
                .eq("user_id", userData.user.id)
                .maybeSingle();

            if (connectionError || !connection) {
                return reply({ error: "Bank connection not found." }, 404);
            }

            await plaidRequest("/item/remove", {
                access_token: connection.access_token
            });

            const { error } = await database.from("plaid_connections")
                .delete()
                .eq("id", connection.id)
                .eq("user_id", userData.user.id);

            if (error) {
                return reply({ error: "Bank disconnected, but cleanup failed." }, 500);
            }

            return reply({ disconnected: true });
        }

        return reply({ error: "Unknown action." }, 400);
    } catch (error) {
        return reply({ error: error.message || "Bank connection failed." }, 502);
    }
});
