# Flow class handoff

## Links to submit

- Repository: https://github.com/DaxtonZimmerman/flow-budget
- Published app: https://daxtonzimmerman.github.io/flow-budget/
- Teacher/demo entry: https://daxtonzimmerman.github.io/flow-budget/demo/index.html
- README: https://github.com/DaxtonZimmerman/flow-budget/blob/main/README.md
- Git log: include the supplied `git-log.txt`, or export a fresh copy with `git log --date=iso-local --pretty=fuller --stat > git-log.txt`.

Use the demo in class. It needs no private login or real bank account, and all displayed money is sample data. Bank-feed recovery does not prevent demonstrating the required income/expense features.

## A short live demonstration

1. Open the public demo. Point out total income, total expenses, remaining balance, and the category chart in the recorded-activity section of Home.
2. Add an **Income** transaction: name `Class paycheck`, category Salary, amount `100`, today's default date, optional note `Presentation example`. Save it and show income increase by $100.
3. Add an **Expense**: name `Class lunch`, category Food, amount `12.34`, today's date. Show spending and the Food chart increase by $12.34.
4. Open Activity. Find the two entries and show their positive/negative amounts, categories, dates and notes.
5. Use the lunch transaction's menu to edit it. Change the amount to `10` and the note to `Packed part of my lunch`. Save and show totals update.
6. Delete only the two presentation entries. Show totals return to their starting values. Reload the page to show saved state within the demo tab.
7. If time permits, open Plan → category limits and set a Food limit below the current Food spending to show **Over limit**. Finish with **Reset demo**.

Before presenting, open the demo once on the actual computer and keep the tab available. Personal data should never be projected in class.

## JavaScript to explain

- `js/add-transaction.js`: the `submit` listener uses `event.preventDefault()`, reads form values, validates a positive finite amount with at most two decimal places, and creates or edits a transaction.
- `js/money-data.js`: `getMoneyTotals()` loops through transactions, calculates in cents, skips transfers and pending items, then returns income, spending and net.
- `js/transactions.js`: reads saved transactions, applies filters, renders rows, and wires edit/delete controls.
- `js/cloud-sync.js`: `getFlowSnapshot()` groups saved state; async functions use `await` for server calls. Owner checks prevent one account from receiving another account's data.
- `js/storage.js`: selects personal Local Storage or the isolated demo sessionStorage adapter.

The comments marked `IMPORTANT` in the JavaScript identify useful lines for the presentation. Explain the input → validation → storage → calculation → rendering flow rather than trying to narrate every advanced feature.

## Requirement mapping

| Requirement | Where to show it |
| --- | --- |
| Separate responsibilities | README code-structure table and separate `js/` files |
| Home: income, expenses, remaining balance | Home → Recorded activity |
| Add and History navigation | Home add button and Activity navigation |
| Type/category/amount/date/notes form | Add Transaction |
| Positive numeric amount validation | Form constraints and JavaScript validation |
| Persistent Local Storage | Personal app storage and cloud snapshot functions |
| Dynamic category chart | Home recorded-activity chart after adding an expense |
| History with signed amounts, dates, categories and notes | Activity and an opened transaction |
| Edit and delete | Transaction menu; totals recalculate after saving |
| Responsive presentation | Phone bottom navigation and desktop sidebar |
| Public deployment | GitHub Pages links above |
| Git history | Actual exported Git log; no dates or commits are fabricated |
| README setup/features/reset/deployment | README.md |

Budget over-limit indicators and recurring-bill planning are additional features. Dark mode is an optional stretch goal and is not implemented. Automated checks and browser tests provide evidence, not a guarantee that no undiscovered bug exists.

The daily-commit requirement should be judged from the actual log. Days without a commit remain visible; do not claim a perfect daily streak if the log does not show one.

## Verification for the prepared release

The release passes 334 automated checks. The public demo was also checked in the browser for adding an expense, editing its amount, reloading, deleting it, and returning totals and the chart to normal. The bank recovery workflow was exercised with synthetic data on phone and desktop layouts, with a downloaded recovery copy verified. Live bank syncing still requires the approved deployment and your own new bank connection; do not present it as restored until that connection has synced.
