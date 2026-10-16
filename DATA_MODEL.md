# Flow data model

Flow currently stores data in this browser. Amounts remain signed dollar numbers in saved files so existing Flow backups still work. Calculations convert each amount to whole cents before adding it.

## In the app today

- `transactions`: a list of `{ id, type, name, category, amount, date, notes }`. Income is positive and expenses are negative. Dates use `YYYY-MM-DD`. A missing date appears in all-time totals but no monthly total. Every record has a stable ID; old records receive one when loaded.
- `budgets`: legacy category limits, used as a starting point for months without their own saved budgets. Each budget has `{ id, category, limit }` after it is loaded.
- `budgetsByMonth`: monthly lists of budgets under `YYYY-MM` keys. Changing one month does not change another saved month.
- Backup version `1` includes those same three stores. Old version 1 files without IDs still restore; Flow adds IDs during restore.

## How totals work

- Income and expenses are added in cents, then displayed as dollars. Net is income minus expenses.
- A `Transfer` moves money between accounts and does not change income, expenses, or a category budget. The current form does not create transfers yet.
- A `Refund` is a positive amount that reduces spending in its category; it is not new income. The current form does not create refunds yet.
- A transaction with `status: "pending"` is excluded from posted totals until it is posted. The current form creates posted transactions without a status field.
- If the same record ID appears twice in a calculation, it is counted once. Existing saved records with colliding IDs receive separate IDs when loaded so neither record is lost.

## Records needed for later sections

- Accounts: `{ id, name, type, balance, currency }`. A transaction will reference `accountId`. Transfers will reference source and destination accounts so the two sides can be matched.
- Imported or bank transactions: keep a provider or file source ID as well as Flow's stable ID. Match on that source ID and account before saving updates so repeated imports do not create duplicates. Keep pending and posted state on the same record when the provider supplies a stable link.
- Recurring items: `{ id, name, amount, category, nextDate, frequency, confirmed }`. These are plans, not posted transactions, so forecasts can use them without adding them to actual totals.

Accounts, bank imports, recurring items, and their fields are planned here; Flow does not save or display them yet.
