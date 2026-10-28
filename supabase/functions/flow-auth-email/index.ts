import { Webhook } from "npm:standardwebhooks@1.0.0";

// Private pilot only: Resend's free test sender can email its account owner.
// No database privileges, bank data, login links, or token hashes are needed.
const MAX_BODY_BYTES = 64 * 1024;

function reply(status: number, message?: string): Response {
    return new Response(JSON.stringify(message
        ? { error: { http_code: status, message } } : {}), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            ...(status === 405 ? { Allow: "POST" } : {})
        }
    });
}

async function readPayload(request: Request): Promise<string> {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Missing body");
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    let body = "";
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > MAX_BODY_BYTES) {
                await reader.cancel();
                throw new Error("Body too large");
            }
            body += decoder.decode(chunk.value, { stream: true });
        }
        return body + decoder.decode();
    } finally {
        reader.releaseLock();
    }
}

Deno.serve(async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return reply(405, "Method not allowed.");

    const apiKey = Deno.env.get("RESEND_API_KEY")?.trim();
    const secret = Deno.env.get("SEND_EMAIL_HOOK_SECRET")?.trim().replace(/^v1,/, "");
    const pilotId = Deno.env.get("PLAID_PILOT_USER_ID")?.trim();
    // A replacement project has no user ID until its first code sign-in.
    // The exact private recipient can bootstrap that account; this never enables bank linking.
    const signInEmail = Deno.env.get("FLOW_SIGN_IN_EMAIL")?.trim().toLowerCase();
    const allowedEmail = signInEmail && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(signInEmail)
        ? signInEmail : null;
    if (!apiKey || !secret || (!pilotId && !allowedEmail)) {
        return reply(503, "Email sign-in is temporarily unavailable.");
    }

    let verifier: Webhook;
    try {
        verifier = new Webhook(secret);
    } catch {
        return reply(503, "Email sign-in is temporarily unavailable.");
    }

    let payload;
    try {
        const raw = await readPayload(request);
        // Verifies the exact body, signature, and five-minute timestamp window.
        payload = verifier.verify(raw, Object.fromEntries(request.headers));
    } catch {
        return reply(401, "Invalid email request.");
    }

    const user = payload?.user;
    const emailData = payload?.email_data;
    const email = user?.email;
    const token = emailData?.token;
    const eventId = request.headers.get("webhook-id");
    if (!user?.id || (pilotId && user.id !== pilotId) ||
        (allowedEmail && (typeof email !== "string" || email.toLowerCase() !== allowedEmail)) ||
        typeof email !== "string" || email.length > 254 ||
        !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email) ||
        !["magiclink", "signup"].includes(emailData?.email_action_type) ||
        typeof token !== "string" || !/^\d{6,10}$/.test(token) ||
        !eventId || !/^[A-Za-z0-9_.:-]{1,180}$/.test(eventId)) {
        return reply(403, "This email request is not supported by the private pilot.");
    }

    try {
        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                // A Supabase retry must not send the same code email twice.
                "Idempotency-Key": `flow-signin/${eventId}`
            },
            signal: AbortSignal.timeout(3500),
            body: JSON.stringify({
                from: "Flow <onboarding@resend.dev>",
                to: [email],
                subject: "Your Flow sign-in code",
                text: `Your Flow sign-in code is ${token}.\n\nReturn to Flow and enter this code. Use it once, and never share it. If you didn't request it, ignore this email.`,
                html: `<h2>Flow sign-in code</h2><p>Return to Flow and enter this code:</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px">${token}</p><p>Use it once, and never share it. If you didn't request it, ignore this email.</p>`
            })
        });
        // Never return or log provider responses: they may contain private data.
        await response.body?.cancel();
        if (!response.ok) return reply(502, "We couldn't send your code. Please try again shortly.");
        return reply(200);
    } catch {
        return reply(502, "We couldn't send your code. Please try again shortly.");
    }
});
