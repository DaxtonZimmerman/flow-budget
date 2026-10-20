# Flow budget

Flow is a browser budgeting app. It works on one device before you connect an account.

## Run it locally

From this folder, run `python3 -m http.server 8000`, then open `http://localhost:8000` in a browser. Use a local server for email sign-in links; opening an HTML file directly will not work for account redirects.

## Connect Supabase

1. The Flow Supabase Free project is connected in [cloud-config.js](js/cloud-config.js). This file contains only its public project URL and publishable key. Never paste the database password, secret key, or service-role key into browser files.
2. [setup.sql](supabase/setup.sql) has been run in the project SQL Editor. It creates the private data table, owner-only access rules, and save function. Account deletion runs in the server-only Plaid function so bank access is revoked first.
3. Authentication → URL Configuration allows the local account URLs and the [published account page](https://daxtonzimmerman.github.io/flow-budget/account.html). The published account page is the Site URL.
4. Open Flow’s Account page, send yourself a sign-in link, and choose whether to keep this device’s data or the cloud data. Download a backup first if both have information you need.

The app saves edits on this device first. It syncs when online and checks again when you return to the tab. If two devices edit the same copy before syncing, Flow keeps both versions and asks you to choose on the Account page.

Run the checks with `node --test tests/*.test.js`.

## Product tools

This release implements steps 1–8 of the product roadmap. They add a guided money check, sample-data demo, custom categories, splits, reimbursement links, remembered-choice editing, purchase previews, goals, variable bills, card repayment planning, weekly check-ins, optional in-app reminders, and offline loading. [Release review](docs/PRODUCT_TOOLS_RELEASE.md) describes the supported cases and remaining validation.

For a preview without using your account, run the local server and open `/demo/index.html`. The demo uses separate session-only sample data, never creates an authenticated cloud client, and marks its exports so they cannot be restored into a real workspace. The non-demo local app uses the project's public cloud configuration; use the demo for synthetic exploration.

Before publishing this version, apply [the client data-version guard](supabase/2026-10-19-client-data-version.sql) to Supabase. It prevents an old browser tab from overwriting a newer plan's fields. The approved migration was applied successfully on 19 October 2026 before this frontend release. Keep this order for new installations.

## Prepare a test website

Flow's HTML, CSS, and browser JavaScript can be hosted as a static website. Run `node scripts/build-site.mjs` to make a `dist/` folder with only those public app files. The Supabase project URL and publishable key in `js/cloud-config.js` are designed for browser use. Database passwords, Plaid secrets, and service-role keys must stay in Supabase Secrets.

`.github/workflows/pages.yml` publishes on a push to `main` or a manual run. A push to `main` is a live release: review the changes and complete required migrations first.

1. In the GitHub repository, open **Settings → Pages** and choose **GitHub Actions** as the source.
2. In Supabase **Authentication → URL Configuration**, add the exact published `account.html` URL as an allowed redirect. Keep the local development URL allowed. Set the Site URL to the published account URL when you are ready to use it as Flow's main sign-in destination.
3. After approval, publish by pushing the reviewed `main` change or selecting **Run workflow** in **Actions → Publish Flow website**. Its result shows the real website URL.
4. Open the published Account page, send a new sign-in link, and check a sync from another device. Use only Plaid Sandbox test banks while the server still targets Sandbox.

A GitHub Pages site is public. Signed-in Flow data remains in the owner's browser and private Supabase table, but anyone can visit the app and create an account unless signups are restricted separately. A restricted private bank pilot exists; broader real-bank signups and a paid public launch remain pending. See [production readiness](docs/production-readiness.md) for the remaining gates. This build does not expand provider access or select a paid service.

## Plaid Sandbox webhook

The `plaid` function now includes a signed webhook URL when creating a new Plaid Link token. Deploy [plaid-webhook](supabase/functions/plaid-webhook/index.ts) as a separate Supabase Edge Function before deploying this `plaid` update. Only the webhook function has JWT verification disabled in [config.toml](supabase/config.toml); it verifies Plaid's `Plaid-Verification` signature, timestamp, and exact request body before reading or writing bank data. If deploying in the Supabase Dashboard instead of the CLI, turn off JWT verification in the **plaid-webhook function settings** manually; `config.toml` is not applied by pasting code into the Dashboard. Keep JWT verification enabled for the existing `plaid` function.

New Sandbox Items receive the webhook URL at Link creation. Existing Items need `/item/webhook/update` or a fresh Sandbox connection to test notifications. The webhook updates the private bank transaction table. When the user next opens Flow, the browser pulls any newer server snapshot into its local and cloud copies. An unprocessed webhook is retried by Plaid if the server returns a temporary error. See [production readiness](docs/production-readiness.md) before connecting real accounts.

## Import a bank CSV

Open Transactions → Import CSV. Choose a bank export, match its date, description, and amount columns, then review every row before saving. Flow supports one signed amount column, positive spending amounts, or separate debit and credit columns. Dates can be year-month-day, month/day/year, or day/month/year. An optional category column keeps the bank's labels; otherwise spending goes to Other and income goes to Income.

Flow skips exact matches by date, description, and amount. If two separate charges happen to match, use “Include anyway” in the preview. Rows with missing or invalid values must be fixed in the CSV before importing. The original file is not stored; imported transactions are saved in the same browser and account copy as manual transactions.

## Review and category rules

Open Transactions → Review to see imported transactions without a category and older transactions without a date. A quick review popup opens on the first visit when a large bank import needs attention. It groups matching names and suggests, but never automatically marks, names containing “transfer.” Confirm a transfer only when the money moved between accounts you own; transfers stay out of income and spending totals. Choose a category once for a group, optionally remember it for future matches, or keep current categories for the remaining non-transfer groups. Individual bank rows also offer a Type menu, so a transfer does not require a trip to the Edit page.

A remembered category rule matches the exact transaction name and income/expense type on later bank syncs, imports, or manual entries. Scoped bank-transfer rules also require the same account and money direction. Transactions show whether a category came from the CSV, your choice, or a rule. Remembered choices can be paused or edited with an affected-record preview; undo preserves later individual corrections.

Flow suggests recurring bills from repeated supported cash-account payments. You confirm or dismiss each suggestion. Confirming a bill creates a planning obligation, without creating a transaction. Clear posted payment matches release its reserve when the balance coverage or funded card plan supports it; uncertain matches ask for confirmation. Rules and bill choices are included in browser backups and account sync.

## App interface

Flow uses five tabs: Home, Activity, Plan, Review, and Account. Phones use a fixed bottom navigation bar. Home explains the estimated flexible money through payday and keeps essentials/cushion separate. Future income and credit limits are never today's cash. Category limits are optional and remain distinct from bank balances. Focused dialogs handle decisions and show relevant detail. Backup and restore are under Account.

The local build includes an installable app shell and a service worker that caches only an explicit list of public app files. It does not cache API responses, bank responses, authenticated requests, or sign-in URLs. Device data remains available offline; cloud and bank sync need a connection. Updates require an explicit action and wait for open forms to close. See [interface research](docs/DESIGN_RESEARCH.md) and [release validation](docs/PRODUCT_TOOLS_RELEASE.md).

Quick review can remember confirmed bank transfers. These rules require an exact normalized name, the same bank account, and the same money direction; they do not change amounts or override individually reviewed choices. They sync and back up with existing rules. Remove a transfer rule under Review → Remembered choices to return its linked entries to review.

Open any transaction from Activity or recent activity to change its category and notes for that payment only. Quick review groups include a View transactions section with dates and amounts, so repeated names such as Venmo can use different categories. Previously reviewed entries remain editable in Activity. The one-payment editor creates no remembered rule and preserves bank amounts and dates. It reads the latest saved data and asks you to reopen an entry if it changed while the editor was open.
