# Your Flow build roadmap

Updated October 16, 2026. Use this checklist to turn Flow into a budgeting app people would want to pay for. Work through one section at a time. Test it, review what changed, and decide when to commit before moving on.

## The promise

Build Flow so you can open it and know three things right away: what is available to spend, what is coming up, and what needs attention. Aim for most transactions to arrive and sort themselves. When Flow is unsure, it should ask one clear question and remember your answer.

Start with US personal budgets, one person per account, and a web app that works beautifully on phones and desktops. Decide whether to support other countries or shared households before adding bank connections.

## What you can learn from other apps

| App | Strong idea to learn from | How you can use it in Flow |
| --- | --- | --- |
| [YNAB](https://www.ynab.com/features) | Clear budgeting method, goals, bank import, and sync across devices. | Keep the clarity, with less setup and routine maintenance. |
| [Monarch](https://partners.monarchmoney.com/pricing) | Connected accounts, flexible budgets, subscription tracking, and household collaboration. | Put today's decisions ahead of deeper reports. |
| [Copilot](https://help.copilot.money/en/articles/6045480-dashboard-tab-overview) | Polished transaction review, recurring items, and an actionable dashboard. | Make automation easy to understand and correct. |
| [Quicken Simplifi](https://www.quicken.com/products/simplifi/) | Spending plans based on income, bills, and savings, plus projected cash flow. | Show how every available-to-spend number was calculated. |
| [Rocket Money](https://help.rocketmoney.com/en/articles/2677184-premium-membership-features) | Finds subscriptions and gives users concrete ways to save. | Make recurring charges visible without burying the budget. |

Use these as examples to learn from. Ask real users whether Flow is easier and more useful before deciding what to charge.

## Design direction

Give Flow the feel of a thoughtful money journal: warm paper background, dark ink, restrained green and amber signals, strong typography, crisp dividers, and charts with clear labels. Use space and hierarchy instead of a wall of identical cards. Avoid glowing gradients, glass effects, decorative AI imagery, and unexplained scores.

On phones, use a short bottom navigation, comfortable tap targets, and readable transaction rows. On desktop, use the extra room for context and comparison rather than stretching mobile cards. Explain what is included in every important number.

## Build sections

### 1. Daily view and responsive design

- [x] Write down the three questions your Dashboard must answer: what can I spend, what is coming up, and what needs my attention?
- [x] Correct or rename today's "safe to spend" figure until it includes real balances and upcoming obligations.
- [x] Choose Flow's colors, type, spacing, and button styles. Apply them to Dashboard, Transactions, Budgets, and the transaction form.
- [x] Make navigation and layouts work on phones, tablets, and desktops. Check keyboard navigation and text contrast.
- [x] Write helpful messages for empty screens and new users. Do not show fake financial data.

You're done when you can use every current feature on a phone without sideways scrolling and explain the Dashboard's main number. Check phone and desktop layouts in a real browser. Commit idea: `Build Flow's mobile-first daily view`.

The main number now shows unspent budget limits and says clearly that it is not cash available. Actual spendable money and upcoming bills still depend on accounts and planning in Sections 2, 3, and 7.

### 2. Trustworthy money model

- [x] Write down how Flow stores accounts, transactions, transfers, refunds, pending charges, budgets, and recurring items.
- [x] Put money calculations in small shared functions. Test totals, months, transfers, refunds, and rounding.
- [x] Give every current record a stable ID and update existing saved data safely.
- [x] Check that your current backup files still restore correctly.

You're done when a transaction cannot silently count twice and your old Flow data still loads. Commit idea: `Make Flow's money calculations reliable`.

### 3. Accounts and cross-device storage

- [ ] Choose an online database and sign-in method you can understand and maintain.
- [ ] Save each person's data privately. Show a preview before moving their existing browser data online.
- [ ] Make changes sync between phone and desktop. Show clear messages when offline or when saving fails.
- [ ] Add data export and account deletion. Review security before inviting real users.

You're done when you can sign in on another device and see the same data without duplicates or lost changes. Commit idea: `Add secure accounts and data sync`.

### 4. Fast setup and file import

- [ ] Give new users two clear ways to start: enter transactions or import a bank file.
- [ ] Add CSV import with a preview of dates, amounts, and matched columns.
- [ ] Check for duplicates and show exactly what will be saved before importing.
- [ ] Keep manual entry quick for cash purchases and corrections.

You're done when you can import a real statement and check the results in minutes. Commit idea: `Add guided setup and transaction import`.

### 5. Automation and review

- [ ] Add simple rules so Flow remembers how you categorize a store or payment.
- [ ] Find likely recurring bills and income, and let users confirm them.
- [ ] Make a small inbox for transactions that need attention.
- [ ] Show why Flow picked a category, and make mistakes easy to undo.

You're done when repeated transactions sort themselves and you can fix exceptions in a few taps. Commit idea: `Automate transaction sorting and review`.

### 6. Bank connections

- [ ] Compare bank connection providers for the countries you plan to support, including coverage and cost.
- [ ] Connect accounts through your server. Keep secret keys and long-lived tokens out of browser code.
- [ ] Handle new, changed, removed, pending, and posted transactions without duplicates.
- [ ] Show when each account last updated, how to reconnect it, and how to import a file if syncing fails.

You're done when test accounts stay accurate through reconnects and several sync cycles. Show when data was last updated. Commit idea: `Add reliable bank transaction sync`.

### 7. Planning that answers real questions

- [ ] Calculate what is available to spend from balances, expected income, bills, goals, and planned category spending.
- [ ] Show upcoming bills, subscriptions, and a simple timeline of expected money in and out.
- [ ] Add alerts for low remaining funds, unusually large charges, and upcoming payments.
- [ ] Explain each forecast and let users correct its assumptions.

You're done when you can answer "Can I afford this before payday?" and see how Flow reached the answer. Commit idea: `Add clear cash-flow planning`.

### 8. Private beta and paid launch

- [ ] Invite a small group to try Flow with real data. Ask what was confusing, what they trusted, and whether they kept using it.
- [ ] Fix the problems they find before adding more features.
- [ ] Explain privacy, support, and account deletion in plain language.
- [ ] Choose a price based on what users value and what bank connections cost. Then add subscriptions.
- [ ] Test accessibility, browsers, phones, backups, security, and payments before launch.

You're done when your beta users can rely on Flow for a full budgeting cycle and tell you why they would pay. Commit idea: `Prepare Flow for paid launch`.

## How to work through the plan

- Keep your code readable enough that you can explain it. Use simple names and short lowercase comments.
- Finish a working section before starting the next one.
- Test money calculations and changes to saved data with realistic examples.
- Keep manual entry and file import available even after bank sync.
- Show where financial data came from and when it last updated.
- Before each commit, review what changed, what passed testing, and what you will build next.
