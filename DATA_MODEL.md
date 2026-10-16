# Flow data model

Flow stores a device copy in this browser. When an account is connected, Supabase stores a private cloud copy of the same data. Amounts remain signed dollar numbers in saved files so existing Flow backups still work. Calculations convert each amount to whole cents before adding it.

The cloud copy is one `flow_data` row per signed-in user with a revision number. Every save checks the expected revision. When two devices changed the same revision, Flow leaves both copies alone and asks the user which one to keep. The database only lets a signed-in user read or change their own row.

## In the app today

- `transactions`: a list of `{ id, type, name, category, amount, date, notes }`. Income is positive and expenses are negative. Dates use `YYYY-MM-DD`. A missing date appears in all-time totals but no monthly total. Every record has a stable ID; old records receive one when loaded. Imports can also have `source: "csv"`, `importKey`, `categoryReason`, `categoryRuleId`, and `reviewStatus`.
- `budgets`: legacy category limits, used as a starting point for months without their own saved budgets. Each budget has `{ id, category, limit }` after it is loaded.
- `budgetsByMonth`: monthly lists of budgets under `YYYY-MM` keys. Changing one month does not change another saved month.
- `categoryRules`: exact normalized name and transaction type mapped to a category. Each rule has a stable ID. Rules only auto-sort a transaction when its imported category is blank, or suggest a category on the manual form.
- `recurringItems`: monthly suggestions that the user confirmed or dismissed. They do not count as posted transactions or change current totals.
- Backup version `1` includes all five stores. Old version 1 files without IDs or the newer stores still restore; Flow adds IDs during restore.

## How totals work

- Income and expenses are added in cents, then displayed as dollars. Net is income minus expenses.
- A `Transfer` moves money between accounts and does not change income, expenses, or a category budget. The current form does not create transfers yet.
- A `Refund` is a positive amount that reduces spending in its category; it is not new income. The current form does not create refunds yet.
- A transaction with `status: "pending"` is excluded from posted totals until it is posted. The current form creates posted transactions without a status field.
- If the same record ID appears twice in a calculation, it is counted once. Existing saved records with colliding IDs receive separate IDs when loaded so neither record is lost.

## Records needed for later sections

- Accounts: `{ id, name, type, balance, currency }`. A transaction will reference `accountId`. Transfers will reference source and destination accounts so the two sides can be matched.
- Bank-connected transactions: keep a provider source ID as well as Flow's stable ID. Match on that source ID and account before saving updates so repeated syncs do not create duplicates. Keep pending and posted state on the same record when the provider supplies a stable link. CSV imports currently use an exact date, name, and amount match and let the user include legitimate repeats.
- Recurring plans can later use confirmed items as a starting point for forecasts. Confirmation alone never adds a posted transaction.

Account balances, bank connections, and forecasts are planned; Flow does not save or display them yet.
