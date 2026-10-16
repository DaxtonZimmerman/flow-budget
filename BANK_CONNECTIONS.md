# Bank connections for Flow

Easton's Plaid team now has an active free Trial with 0 of 10 live Items used. Flow will test in Sandbox before using a live Item.

Flow will start with US personal bank accounts and Plaid. Manual entry and CSV import stay available when a bank is unsupported or a connection needs attention.

## Why Plaid first

Plaid lists more than 10,000 US and Canadian institutions and supports Transactions and Balance in its current free Trial plan. The Trial is limited to 10 live Items across the entire Plaid team (one Item is one bank login, which can include several accounts). Removing an Item does not restore a trial slot. The Trial works for building and a small internal test, not for a public launch. Plaid's Pay as You Go plan has no stated minimum or user cap, but Transactions is a monthly subscription for every connected Item, even when no API calls are made. Balance checks and forced transaction refreshes may add per-request charges. Plaid does not publish standard paid rates in its docs; we must check the rates shown during a Production application before setting a price for Flow.

Teller publishes a $0.30 monthly Transactions price per production enrollment and has a free developer environment with up to 100 real-data enrollments. Its real-data API requires a client certificate on every request. Flow already uses Supabase for sign-in and storage; Supabase Edge Functions are the intended server path for bank calls, making Plaid the simpler first integration. We can reconsider Teller if Plaid's quote or bank coverage fails our beta test.

Stripe Financial Connections is another serious option: it publishes $0.30 per institution per account holder per month for Transactions and offers a standalone bank-linking session. Its initial transaction pull is 180 days and new transactions are made available daily. Flow is proceeding with Plaid for its deeper history and incremental update flow; compare the actual Plaid quote with Stripe before a paid public launch.

Sources: [Plaid coverage](https://plaid.com/docs/institutions/), [Plaid plans](https://plaid.com/pricing/), [Plaid billing](https://plaid.com/docs/account/billing/), [Teller pricing](https://teller.io/), [Teller environments](https://teller.io/docs/guides/environments), [Teller authentication](https://teller.io/docs/api/authentication), [Stripe Financial Connections](https://stripe.com/financial-connections).

## What the connection needs

1. A signed-in person asks Flow to connect a bank. A server function creates a short-lived Plaid Link token.
2. Plaid Link returns a temporary public token. The server exchanges it for an access token. No Plaid secret or long-lived access token goes into browser code, browser storage, or a Flow backup.
3. The server saves the connection for the signed-in user and calls `/transactions/sync` from its saved cursor. The cursor and transaction changes are saved together so a failed sync can be repeated safely.
4. New and changed transactions match by bank account and Plaid transaction ID. Removed transactions are removed. A posted charge can replace its pending version while keeping the user's category and notes.
5. Flow shows the last successful update, connection errors, and a reconnect action. CSV import remains available.

Plaid documents the [Link token flow](https://plaid.com/docs/link/web/), [incremental transaction sync](https://plaid.com/docs/transactions/sync-migration/), and [pending to posted changes](https://plaid.com/docs/transactions/transactions-data/).

`js/bank-data.js` contains the transaction merge logic and tests. The Account page now connects, syncs, and disconnects Sandbox banks. `supabase/functions/plaid/index.ts` creates Link tokens, exchanges temporary public tokens, and calls `/transactions/sync`. The cursor and every page of changes are saved together by `supabase/plaid-setup.sql`. Flow keeps user edits to categories and notes, removes transactions Plaid removed, and does not count pending charges in totals. All Plaid calls currently go to Sandbox, so this code cannot use a live trial Item.

The private tables and `plaid` Edge Function are deployed to Supabase. The server-only table grants in `supabase/plaid-setup.sql` are applied, and a signed-in bank-list request returned 200. `PLAID_CLIENT_ID` and `PLAID_SANDBOX_SECRET` are present in Edge Function Secrets. The Sandbox secret must never go into browser files, Git, screenshots, or chat.

The first live Sandbox Link attempt found a mismatched Client ID and Sandbox secret. After correcting the pair, First Platypus Bank connected and the first sync loaded Plaid sample transactions. The Transactions page showed 55 entries after that sync. A second live sync left the Transactions count at 55, confirming that a repeated Sandbox sync did not add duplicate rows. Automatic updates, reconnect states, and real bank tests remain before inviting other people. A paid-rate review and Production access are required before public launch.
