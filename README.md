# Flow budget

Flow is a browser budgeting app. It works on one device before you connect an account.

## Run it locally

From this folder, run `python3 -m http.server 8000`, then open `http://localhost:8000` in a browser. Use a local server for email sign-in links; opening an HTML file directly will not work for account redirects.

## Connect Supabase

1. The Flow Supabase Free project is connected in [cloud-config.js](js/cloud-config.js). This file contains only its public project URL and publishable key. Never paste the database password, secret key, or service-role key into browser files.
2. [setup.sql](supabase/setup.sql) has been run in the project SQL Editor. It creates the private data table, owner-only access rules, save function, and account deletion function.
3. Authentication → URL Configuration allows `http://localhost:8000/account.html` and `http://127.0.0.1:5500/account.html`. The first is the current Site URL. Add the published Flow account URL and update the Site URL when Flow is deployed.
4. Open Flow’s Account page, send yourself a sign-in link, and choose whether to keep this device’s data or the cloud data. Download a backup first if both have information you need.

The app saves edits on this device first. It syncs when online and checks again when you return to the tab. If two devices edit the same copy before syncing, Flow keeps both versions and asks you to choose on the Account page.

Run the checks with `node --test tests/*.test.js`.

## Prepare a test website

Flow's HTML, CSS, and browser JavaScript can be hosted as a static website. Run `node scripts/build-site.mjs` to make a `dist/` folder with only those public app files. The Supabase project URL and publishable key in `js/cloud-config.js` are designed for browser use. Database passwords, Plaid secrets, and service-role keys must stay in Supabase Secrets.

`.github/workflows/pages.yml` is a manual GitHub Pages publish action. It does not run on a push. After reviewing and committing this setup:

1. In the GitHub repository, open **Settings → Pages** and choose **GitHub Actions** as the source.
2. In Supabase **Authentication → URL Configuration**, add the exact published `account.html` URL as an allowed redirect. Keep the local development URL allowed. Set the Site URL to the published account URL when you are ready to use it as Flow's main sign-in destination.
3. In GitHub **Actions → Publish Flow website**, select **Run workflow** on `main`. Its result shows the real website URL.
4. Open the published Account page, send a new sign-in link, and check a sync from another device. Use only Plaid Sandbox test banks while the server still targets Sandbox.

A GitHub Pages site is public. Signed-in Flow data remains in the owner's browser and private Supabase table, but anyone can visit the app and create an account unless signups are restricted separately. The first site is for a small test, not a paid public launch. Live bank connections, a reconnect test, background updates, and a security review remain before that launch.

## Import a bank CSV

Open Transactions → Import CSV. Choose a bank export, match its date, description, and amount columns, then review every row before saving. Flow supports one signed amount column, positive spending amounts, or separate debit and credit columns. Dates can be year-month-day, month/day/year, or day/month/year. An optional category column keeps the bank's labels; otherwise spending goes to Other and income goes to Income.

Flow skips exact matches by date, description, and amount. If two separate charges happen to match, use “Include anyway” in the preview. Rows with missing or invalid values must be fixed in the CSV before importing. The original file is not stored; imported transactions are saved in the same browser and account copy as manual transactions.

## Review and category rules

Open Transactions → Review to see imported transactions without a category and older transactions without a date. Choose a category and date, then save it once or save and remember. A remembered rule matches the exact transaction name and income/expense type on later imports or manual entries. Transactions show whether a category came from the CSV, your choice, or a rule. Removing a rule also undoes categories that rule assigned automatically.

Flow suggests a monthly item when the two most recent payments with the same name have similar amounts about a month apart. You confirm or dismiss each suggestion. Confirmed items are tracking notes only; they do not add transactions or change totals. Rules and monthly choices are included in browser backups and account sync.
