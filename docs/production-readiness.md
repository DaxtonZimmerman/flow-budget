# Flow real-bank readiness

Flow is currently a public **Sandbox-only** test. This document is a launch gate, not permission to connect real bank accounts. Keep `PLAID_SANDBOX_SECRET` and the Sandbox API host in the deployed function until every real-bank gate below is complete.

## Verified so far

- The published site signs in with Supabase. Two separate test users saw separate data.
- Plaid Sandbox Link connected First Platypus Bank, and Flow imported 55 test transactions without duplication on a second sync.
- The separate `plaid-webhook` function is deployed with gateway JWT verification off; the signed-in `plaid` function still requires a JWT. A new Sandbox Item delivered two accepted POST requests from Plaid, and removing that temporary Item returned the original account to 55 transactions. These requests establish signed delivery, but a live `SYNC_UPDATES_AVAILABLE` transaction change has not yet been confirmed end to end.
- The direct browser account-deletion RPC was removed. The server path revokes Plaid Items before deleting an account. Automated tests cover success, failure, and user isolation. Deleting a real account was intentionally not tested.
- RLS is enabled on `flow_data`, and the deployed insert, read, and update policies each require `auth.uid() = user_id`. `plaid_connections` and `plaid_transactions` have RLS enabled with no browser policies. A previous unauthenticated read check returned 401 for all three tables. On 2026-10-17, Supabase Security Advisor showed 0 errors and 1 warning; a publicly executable `rls_auto_enable()` helper was restricted and verified inaccessible to `anon` and `authenticated`. The remaining warning is leaked-password protection disabled; Flow currently uses email links rather than passwords.
- The browser Supabase SDK and icon script are pinned to verified versions with integrity hashes. The Plaid Link script remains Plaid-hosted. A Content Security Policy and independent browser/security review are still open.
- Plaid Dashboard showed **Free trial 0/10**, but the Transactions product was unchecked in Easton Barlow's Plaid team and onboarding steps were incomplete. Easton needs to select Transactions and finish the required account steps before a real Item is attempted.

## Engineering gates before one real-bank pilot

1. Connect a separate First Platypus Bank Sandbox Item using Plaid's `user_transactions_dynamic` test user, then trigger `/transactions/refresh` from the server. Confirm the resulting signed `SYNC_UPDATES_AVAILABLE` webhook changes the private transaction snapshot and the browser displays the new transactions. Disconnect that test Item afterward. Automated checks already cover an invalid signature, an expired signature, a Plaid outage, and a database failure. Confirm the same failure behavior against the deployed function before a real pilot. Do not print access tokens or transaction bodies in logs.
2. Test an unhealthy Sandbox Item through Link update mode. Verify that Flow tells the user to reconnect, resumes sync afterward, and that disconnect calls `/item/remove`. Also test a failed account deletion with a disposable Sandbox user.
3. Add handling for Plaid Item warnings such as `PENDING_DISCONNECT` and `PENDING_EXPIRATION`, and complete the mobile OAuth return flow. Register the production redirect URI in Plaid before enabling real banks. A desktop-only pilot can be scoped separately, but unsupported mobile flows must be clearly excluded.
4. Pin or self-host third-party browser scripts, add a reviewed Content Security Policy, and review the browser's offline financial-data copy and sign-out behavior. Confirm no secret or access token appears in browser files, backups, responses, or logs. Have an independent security reviewer check the server functions, RLS, data deletion, and cross-user access.
5. Set up monitoring for failed webhook deliveries, function errors, failed syncs, and sign-in mail delivery. Configure reliable email delivery, recovery/backups, and abuse protection in Supabase. Verify restore and incident response with test data.

## Plaid and product gates

1. The adult Plaid account owner confirms the Trial is active for **Transactions**, completes the Launch Center application/company details and security questionnaire, and checks access for intended OAuth banks. Review the plan's 10-Item cumulative limit and any pricing before moving to a paid plan. Do not paste Plaid secrets into the repository or browser.
2. Publish a truthful privacy notice and support contact, covering the bank data Flow receives, Supabase storage, browser offline copy, retention, export, disconnect, deletion, and Plaid's role. The owner chose **no public email yet**, so keep personal email off the site and treat a public contact channel as unresolved before inviting real users. Obtain a legal/privacy review. Collect only the Plaid products and data Flow uses.
3. Prepare a separate production configuration with the Production API host and secret, a production webhook, and an approved HTTPS OAuth redirect. Keep Sandbox and Production credentials and Items separate. Verify the production function cannot be called as an anonymous user and its secrets remain server-side.
4. Test one consenting real bank connection privately. Confirm Link, account selection, initial and later transactions, webhook delivery, reconnect, disconnect, and deletion. Never use another person's bank credentials or ask users to enter credentials in Flow.
5. Only after the pilot and review, decide whether to open registration broadly. The GitHub Pages site is public even while Plaid remains in Sandbox.

Official references: [Plaid Launch Center checklist](https://plaid.com/docs/launch-checklist/), [Transactions webhooks](https://plaid.com/docs/transactions/webhooks/), [webhook verification](https://plaid.com/docs/api/webhooks/webhook-verification/), [Trial pricing and limits](https://plaid.com/docs/account/billing/), [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod).
