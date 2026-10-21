/* The existing email sign-in, with a same-app option for Home Screen installations. */
(function () {
    const form = document.querySelector('#login-form'), message = document.querySelector('#login-message');
    const linkForm = document.querySelector('#login-link-form'), submit = form.querySelector('button');
    const client = getFlowClient();
    const root = new URL(FlowAuth.root);
    if (!client) { message.textContent = 'Connect to the internet, then reload to sign in.'; submit.disabled = true; }
    if (new URLSearchParams(location.search).get('reason') === 'offline') message.textContent = 'Connect to the internet to sign in again. Your saved data is kept on this device.';
    form.addEventListener('submit', async event => {
        event.preventDefault(); if (!client || !form.reportValidity()) return;
        submit.disabled = true; message.textContent = 'Sending your sign-in link…';
        try {
            sessionStorage.setItem('flow_sign_in_continue', '1');
            const result = await client.auth.signInWithOtp({ email: form.elements.email.value.trim(), options: { emailRedirectTo: new URL('account.html', root).href } });
            if (result.error) throw result.error;
            message.textContent = 'Check your email for your Flow sign-in link.';
            document.querySelector('#login-sent').hidden = false;
            if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) document.querySelector('#same-app-sign-in').open = true;
        } catch (_) { message.textContent = 'Could not send your link. Check your connection, or wait a minute before trying again.'; }
        finally { submit.disabled = false; }
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
            await FlowAuth.recheck();
        } catch (_) { control.value = ''; message.textContent = 'That link could not be used. Request a fresh Flow email and copy its sign-in button’s link here.'; }
        finally { button.disabled = false; }
    });
})();
