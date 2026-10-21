/* One sign-in flow: email, then a one-time code entered inside Flow. */
(function () {
    const form = document.querySelector('#login-form'), codeForm = document.querySelector('#login-code-form');
    const message = document.querySelector('#login-message'), submit = form.querySelector('button');
    const sent = document.querySelector('#login-sent'), resend = document.querySelector('#login-resend');
    const title = document.querySelector('#login-title'), description = document.querySelector('#login-description');
    const client = getFlowClient(), storage = typeof flowAuthStorage !== 'undefined' ? flowAuthStorage : localStorage;
    const pendingKey = 'flow-email-signin';
    let pending = null, sending = false, verifying = false, lastIssue = 'none';
    const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    function updateResend() {
        const seconds = pending ? Math.max(0, Math.ceil((pending.resendAt - Date.now()) / 1000)) : 0;
        resend.disabled = sending || verifying || seconds > 0;
        resend.textContent = seconds ? 'Resend in ' + seconds + 's' : 'Send a new code';
    }
    function showCode(focus = true) {
        form.hidden = true; sent.hidden = false;
        title.textContent = 'Check your email.'; description.textContent = 'Enter the code here to sign in.';
        document.querySelector('#login-email-summary').textContent = 'Code sent to ' + pending.email;
        updateResend();
        if (focus) codeForm.elements.code.focus();
    }
    function showEmail() {
        form.hidden = false; sent.hidden = true;
        title.textContent = 'Welcome to Flow.'; description.textContent = 'Enter your email to get a sign-in code.';
        codeForm.reset(); updateResend();
    }
    function sendError(error) {
        const code = error?.code;
        if (code === 'over_email_send_rate_limit') {
            lastIssue = code;
            return pending ? 'Email sending is temporarily limited. You can still enter the code already sent to your email.' : 'Email sending is temporarily limited. Please try later.';
        }
        if (code === 'over_request_rate_limit' || code === 'over_email_rate_limit' || error?.status === 429) {
            lastIssue = 'request_limit'; return 'Too many requests. Wait before requesting another code.';
        }
        if (code === 'email_address_not_authorized') {
            lastIssue = code; return 'Use the email address already connected to your Flow account. Other addresses are not available yet.';
        }
        if (code === 'email_address_invalid' || code === 'validation_failed') {
            lastIssue = 'invalid_email'; return 'Check that your email address is entered correctly.';
        }
        if (code === 'email_provider_disabled' || code === 'otp_disabled') {
            lastIssue = 'email_disabled'; return 'Email sign-in is currently unavailable. Please try later.';
        }
        if (error?.name === 'AuthRetryableFetchError' || error?.status === 0 || !navigator.onLine) {
            lastIssue = 'connection'; return 'Could not connect. Check your internet connection and try again.';
        }
        lastIssue = 'service'; return 'Could not send your code. Please try later.';
    }
    async function send(email) {
        if (sending || verifying || !client) return;
        if (pending?.email === email && pending.resendAt > Date.now()) { showCode(); return; }
        sending = true; submit.disabled = true; updateResend(); message.textContent = 'Sending your code…';
        try {
            const result = await client.auth.signInWithOtp({ email });
            if (result.error) throw result.error;
            const now = Date.now(); pending = { email, sentAt:now, resendAt:now + 60000 };
            // Save only the pending email and timing. The one-time code is never stored.
            try { await storage.setItem(pendingKey, JSON.stringify(pending)); } catch (_) {}
            try { sessionStorage.setItem('flow_sign_in_continue', '1'); } catch (_) {}
            codeForm.reset(); showCode(); message.textContent = '';
        } catch (error) { message.textContent = sendError(error); }
        finally { sending = false; submit.disabled = false; updateResend(); }
    }
    const restored = (async () => {
        submit.disabled = true;
        try {
            const value = JSON.parse(await storage.getItem(pendingKey));
            if (value && validEmail(value.email) && Number.isFinite(value.sentAt) && Number.isFinite(value.resendAt) &&
                value.sentAt <= Date.now() && Date.now() - value.sentAt < 3600000 && value.resendAt <= value.sentAt + 60000) {
                pending = value; form.elements.email.value = value.email; showCode(false);
            } else await storage.removeItem(pendingKey);
        } catch (_) { /* A pending request is optional; sign-in still works online. */ }
        finally { submit.disabled = !client; }
    })();
    if (!client) message.textContent = 'Connect to the internet, then reopen Flow to sign in.';
    form.addEventListener('submit', async event => {
        event.preventDefault(); await restored;
        if (!form.reportValidity()) return;
        await send(form.elements.email.value.trim());
    });
    resend.addEventListener('click', async () => { if (pending) await send(pending.email); });
    document.querySelector('#login-change-email').addEventListener('click', async () => {
        if (sending || verifying) return;
        pending = null; try { await storage.removeItem(pendingKey); } catch (_) {} message.textContent = ''; showEmail(); form.elements.email.focus();
    });
    codeForm.addEventListener('submit', async event => {
        event.preventDefault(); if (verifying || sending || !client || !pending || !codeForm.reportValidity()) return;
        const control = codeForm.elements.code, button = codeForm.querySelector('button');
        verifying = true; button.disabled = true; updateResend(); message.textContent = 'Signing you in…';
        const token = control.value.trim(); control.value = '';
        try {
            const result = await client.auth.verifyOtp({ email:pending.email, token, type:'email' });
            if (result.error) throw result.error;
            try { sessionStorage.setItem('flow_sign_in_continue', '1'); } catch (_) {}
            try { await storage.removeItem(pendingKey); } catch (_) {}
            if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
            await FlowAuth.recheck();
        } catch (error) {
            if (error?.code === 'otp_expired' || error?.status === 403 || error?.status === 400) {
                lastIssue = 'code_invalid'; message.textContent = 'That code is incorrect or expired. Use the newest code from your email, or request a new one.';
            } else { message.textContent = sendError(error); }
            control.focus();
        } finally { verifying = false; button.disabled = false; updateResend(); }
    });
    // Diagnostic information is available on request, outside the normal sign-in flow.
    document.querySelector('#login-diagnostics').hidden = new URLSearchParams(location.search).get('diagnostics') !== '1';
    document.querySelector('#login-check-status').addEventListener('click', () => {
        document.querySelector('#login-status-details').textContent = FlowAuth.signInStatus() + ' | email: ' + lastIssue;
    });
    setInterval(updateResend, 1000);
})();
