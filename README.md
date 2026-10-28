# Flow.

Flow is an income and expenses app built with HTML, CSS, and vanilla JavaScript. It tracks transactions, shows income, spending and remaining balance, and helps plan what is available until payday.

- [Published app](https://daxtonzimmerman.github.io/flow-budget/)
- [Public sample-data demo — no sign-in needed](https://daxtonzimmerman.github.io/flow-budget/demo/index.html)
- [Source repository](https://github.com/DaxtonZimmerman/flow-budget)
- [Class submission and presentation guide](submission/CLASS_GUIDE.md)

The personal app requires an email code entered inside Flow. The public demo has a separate sample workspace; it never connects to a real bank or reads a signed-in account.

## Features

- Home displays total income, total expenses, remaining balance, and expenses by category.
- Add Transaction accepts income or expenses, category, amount, an editable date that defaults to today, and optional notes.
- Activity shows transaction dates, categories, signed amounts, and notes, with search, filters, editing and deletion.
- Plan supports monthly category limits, over-limit indicators, an until-payday plan, and editable spending suggestions.
- Bills supports recurring-bill planning and optional payment suggestions.
- Extra tools include savings goals, net worth, splits, reimbursement links, transfer review, CSV import, and recovery exports.
- Phone layouts use bottom navigation and focused sliding panels. The installable app shell updates automatically after current edits are safe.

**Current recovery status (October 28, 2026):** personal sign-in and saved budgeting data have moved to a working Supabase Free project. Bank updates are temporarily paused while a replacement connection is prepared. The class demo and manual budgeting features operate independently of bank reporting.

## Run locally

Use Node.js 22 or newer and Python 3:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
node scripts/build-site.mjs
python3 -m http.server 8000 --directory dist
```

Open <http://localhost:8000/demo/index.html> for the sample app. Use <http://localhost:8000/login.html> only for the configured private account; other email addresses are not enabled for the private pilot. Opening HTML files directly does not provide the required web origin for the installed app and cloud features.

There is no frontend framework or bundler runtime. The build versions assets, generates the isolated demo pages, and creates a public-file-only service worker cache. Its output is `dist/`.

## Code structure

| Responsibility | Main files |
| --- | --- |
| Transaction form and validation | `js/add-transaction.js` |
| Shared money calculations in cents | `js/money-data.js` |
| Home rendering and charts | `js/script.js`, `js/home-view.js` |
| History, editing and deletion | `js/transactions.js`, `js/transaction-details.js` |
| Category budgets | `js/budget-data.js`, `js/budgets.js` |
| Storage selection and demo isolation | `js/storage.js` |
| Saved account sync and protected recovery | `js/cloud-sync.js` |
| Sign-in and durable sessions | `js/auth-gate.js`, `js/auth-storage.js`, `js/login.js` |
| Planning and bills | `js/planning-data.js`, `js/bill-data.js`, `js/payday-app.js` |
| Bank integration | `js/bank-data.js`, `js/bank-auto-sync.js`, `supabase/functions/` |
| Responsive interface | `css/`, `js/mobile-app.js`, `js/app-shell.js` |

Browser scripts are separate reusable files loaded in dependency order with `defer`. Calculation functions are tested independently from page rendering. See [DATA_MODEL.md](DATA_MODEL.md) for financial rules and [BANK_CONNECTIONS.md](BANK_CONNECTIONS.md) for the integration.

## Storage, sync and reset

The personal app persists transactions, budgets and planning data in **Local Storage**. A verified account syncs an owner-scoped copy to Supabase. Edits save locally before syncing; normal offline changes retry automatically when connectivity returns. Conflicting edits retain a protected recovery copy.

The demo deliberately uses separately namespaced **sessionStorage**, so a class demonstration cannot modify personal data. Demo changes survive a page reload in the same tab and disappear when that tab's session ends.

- **Reset the demo:** click **Reset demo** at the top. This affects sample data only.
- **Back up personal data:** open Account → Your data / Backup & restore and download a backup.
- **Restore personal data:** use the app's Restore backup control and review its confirmation. Keep the original backup private.
- Do not clear browser storage or reinstall the app as a troubleshooting shortcut while recovery is in progress.

Income is positive; expenses are negative. Amounts are calculated in integer cents. Confirmed transfers do not inflate income or spending, and pending bank transactions stay separate from posted totals. The payday estimate is distinct from historical income minus expenses and never treats future pay or a credit limit as available cash.

## Testing and deployment

`npm test` runs the automated suite, including validation, totals, imports, transfers, owner isolation, protected recovery, and signed provider callbacks. Browser verification also covers the public demo's forms and phone layouts. The prepared bank recovery release passes 334 automated checks, including real PostgreSQL recovery and permission tests.

GitHub Actions runs the tests, builds `dist/`, and deploys GitHub Pages from `main`; see [pages.yml](.github/workflows/pages.yml). A push to `main` publishes the website, so review changes and apply any required database migrations first.

`js/cloud-config.js` contains only a public Supabase URL and publishable key. Database passwords, service-role keys, provider secrets, login codes, and real account backups do not belong in the repository. Row Level Security restricts saved workspaces to their owners; bank-token tables are server-only. Hosted database/function configuration is separate from the static website build.

The private bank pilot uses existing services on their Free/Trial plans. Public real-bank signups, payments, paid products and subscription-cancellation services are not enabled. [Production readiness](docs/production-readiness.md) records the broader release work.
