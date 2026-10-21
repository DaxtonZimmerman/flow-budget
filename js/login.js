/* The existing email sign-in, with a same-app option for Home Screen installations. */
(function () {
    const form = document.querySelector('#login-form'), message = document.querySelector('#login-message');
    const linkForm = document.querySelector('#login-link-form'), submit = form.querySelector('button');
    const client = getFlowClient();
    const root = new URL(FlowAuth.root);
    const sent = document.querySelector('#login-sent');
    let sending = false, lastIssue = 'none';
    function showLinkEntry() {
        sent.hidden = false;
        if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) document.querySelector('#same-app-sign-in').open = true;
    }
    function sendError(error) {
        const code = error?.code;
        if (code === 'over_email_send_rate_limit') {
            lastIssue = code;
            showLinkEntry();
            return 'Email sending is temporarily limited. If you have an unused Flow email, paste its link below. Otherwise, try later; repeated requests will not help.';
        }
        if (code === 'over_request_rate_limit' || code === 'over_email_rate_limit' || error?.status === 429) {
            lastIssue = 'request_limit'; showLinkEntry();
            return 'Too many sign-in requests. Wait before requesting another link. You can still paste an unused link from your latest Flow email below.';
        }
        if (code === 'email_address_not_authorized') {
            lastIssue = code;
            return 'This email address is not allowed by Flow’s current email provider. Try the address already used for your Flow account.';
        }
        if (code === 'email_address_invalid' || code === 'validation_failed') {
            lastIssue = 'invalid_email'; return 'Check that your email address is entered correctly.';
        }
        if (code === 'email_provider_disabled' || code === 'otp_disabled') {
            lastIssue = 'email_disabled'; return 'Email sign-in is currently unavailable. Flow’s email settings need attention.';
        }
        if (error?.name === 'AuthRetryableFetchError' || error?.status === 0 || !navigator.onLine) {
            lastIssue = 'connection'; return 'Flow could not reach the sign-in service. Check your connection, then try again.';
        }
        lastIssue = 'service';
        return 'The sign-in service could not send your email. Try later. Your saved budget has not been deleted.';
    }
    document.querySelector('#login-check-status').addEventListener('click', () => {
        document.querySelector('#login-status-details').textContent = FlowAuth.signInStatus() + ' | email: ' + lastIssue;
    });
    if (!client) { message.textContent = 'Connect to the internet, then reload to sign in.'; submit.disabled = true; }
    if (new URLSearchParams(location.search).get('reason') === 'offline') message.textContent = 'Connect to the internet to sign in again. Your saved data is kept on this device.';
    form.addEventListener('submit', async event => {
        event.preventDefault(); if (sending || !client || !form.reportValidity()) return;
        sending = true;
        submit.disabled = true; message.textContent = 'Sending your sign-in link…';
        try {
            sessionStorage.setItem('flow_sign_in_continue', '1');
            const result = await client.auth.signInWithOtp({ email: form.elements.email.value.trim(), options: { emailRedirectTo: new URL('account.html', root).href } });
            if (result.error) throw result.error;
            message.textContent = 'Check your email for your Flow sign-in link.';
            showLinkEntry();
        } catch (error) { message.textContent = sendError(error); }
        finally { sending = false; submit.disabled = false; }
    });
    linkForm.addEventListener('submit', async event => {
        event.preventDefault(); if (!client || !linkForm.reportValidity()) return;
        const control = linkForm.elements.link, button = linkForm.querySelector('button');
        button.disabled = true;
        try {
            const url = new URL(control.value.trim()), project = new URL(flowCloudUrl);
            const type = url.searchParams.get('type'), token = url.searchParams.get('token_hash') || url.searchParams.get('token');
            if (url.origin !== project.origin || url.pathname !== '/auth/v1/verify' || !['magiclink', 'signup', 'email'].includes(type) || !token) throw new Error('invalid');
            // Consume the original email link inside this app, without navigating to another browser.
            control.value = '';
            const result = await client.auth.verifyOtp({ token_hash: token, type: type });
            if (result.error) throw result.error;
            if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
            await FlowAuth.recheck();
        } catch (_) { control.value = ''; message.textContent = 'That link could not be used. Request a fresh Flow email and copy its sign-in button’s link here.'; }
        finally { button.disabled = false; }
    });
})();
