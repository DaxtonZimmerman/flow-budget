# Flow real-bank readiness

Flow is currently a public **Sandbox-only** test. This document is a launch gate, not permission to connect real bank accounts. Keep `PLAID_SANDBOX_SECRET` and the Sandbox API host in the deployed function until every real-bank gate below is complete.

## Verified so far

- The published site signs in with Supabase. Two separate test users saw separate data.
- Plaid Sandbox Link connected First Platypus Bank, and Flow imported 55 test transactions without duplication on a second sync.
- The direct browser account-deletion RPC was removed. The server path revokes Plaid Items before deleting an account. Automated tests cover success, failure, and user isolation. Deleting a real account was intentionally not tested.
- RLS is enabled on `flow_data`; `plaid_connections` and `plaid_transactions` grant access only to the server role. A previous unauthenticated read check returned 401 for all three tables. Run Supabase Security Advisor and review the deployed policies again before a real pilot.
- The Plaid Dashboard screenshot showed **Free trial 0/10**. Verify the exact Trial and product status with the Dashboard owner before using a slot.

## Engineering gates before one real-bank pilot

1. Deploy `plaid-webhook` with JWT verification disabled **only for that function**. Deploy the updated `plaid` function afterward. Fire a signed Sandbox `SYNC_UPDATES_AVAILABLE` webhook for a newly linked test Item; verify that its private transactions update and the browser picks up the new snapshot. Test an invalid signature, an expired signature, a Plaid outage, and a database failure. Do not print access tokens or transaction bodies in logs.
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
