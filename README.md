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
