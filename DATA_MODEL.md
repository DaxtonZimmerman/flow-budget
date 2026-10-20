# Flow data model

Flow stores a device copy in this browser. When an account is connected, Supabase stores a private cloud copy of the same data. Amounts remain signed dollar numbers in saved files so existing Flow backups still work. Calculations convert each amount to whole cents before adding it.

The cloud copy is one `flow_data` row per signed-in user with a revision number. Every save checks the expected revision. When two devices changed the same revision, Flow leaves both copies alone and asks the user which one to keep. The database only lets a signed-in user read or change their own row.

## Device and cloud stores

- `transactions`: a list of `{ id, type, name, category, amount, date, notes }`. Income is positive and expenses are negative. Dates use `YYYY-MM-DD`. A missing date appears in all-time totals but no monthly total. Every record has a stable ID; old records receive one when loaded. Imports can also have `source: "csv"`, `importKey`, `categoryReason`, `categoryRuleId`, and `reviewStatus`.
- `budgets`: legacy category limits, used as a starting point for months without their own saved budgets. Each budget has `{ id, category, limit }` after it is loaded.
- `budgetsByMonth`: monthly lists of budgets under `YYYY-MM` keys. Changing one month does not change another saved month.
- `categoryRules`: exact normalized name and transaction direction mapped to a category. Each rule has a stable ID. A bank-only transfer rule adds `bankType: "Transfer"` and `accountId`; its `type` remains the original `Income` or `Expense` direction for compatibility. Transfer rules apply only to the same bank account, exact normalized bank name, and money direction. They never change amounts, CSV rows, or individually reviewed choices. Rule-applied bank entries carry `bankTypeRuleId`; an explicit type edit detaches that marker, while removing a transfer rule returns only its linked entries to review.
- `recurringItems`: monthly suggestions that the user confirmed or dismissed. They do not count as posted transactions or change current totals.
- `bankAccounts`: owner-scoped cached account metadata, stable provider/account identity, currency, available/current balances in cents, retrieval time, and bank balance time when supplied. No access tokens are stored in these browser snapshots. Credit limits are not cash.
- `flowPlanning`: version-1 payday plan with resumable setup, selected cash accounts or a confirmed manual balance, next payday/frequency, bills and payment decisions, essentials, cushion, preferences, and optional `features` described below. Legacy plans without optional fields remain valid.
- Backup version `1` includes these stores. Old version-1 files without IDs or the newer stores still restore; Flow adds missing IDs. New snapshots/exports carry `clientSchemaVersion: 2`. A `demo: true` export cannot replace a real workspace.

## Product tools

These fields are implemented in the approved steps 1–8 release. They preserve existing stored values and add optional metadata.

- `flowPlanning.features.version: 1` contains custom `categories`, `goals`, unreflected-purchase `adjustments`, `cards`, `partialBills`, reminder snoozes, and the latest weekly `checkIn`. Each list has validated IDs/amounts/dates. Amounts are integer cents.
- A goal has target, current reserved amount, suggested contribution, optional due date, and location `inside`/`outside` selected spending cash. An inside goal may reference one `billId` and retain already-covered bill-payment amounts; the estimate counts the fund/bill union once and derives remaining funds without mutating input records.
- Card plans reference an imported account and full/fixed/outside policy, confirmed starting repayment reserve, confirmation/due dates, covered transaction identities, and optional reserve-period essentials confirmations. Pending replacement identities prevent reserving an already-covered pending purchase twice after it posts.
- `manualBalance.covered` contains transaction identity/financial-fingerprint proofs for posted activity explicitly checked against today's entered amount. An unreflected adjustment or partial bill references a balance key so changing that balance requires another check.
- Bills can include variable amount ceilings, end dates, and `occurrenceOverrides` with a date, amount, and skipped flag. Planning choices never create a bank transaction.
- A transaction can have exact-cent `allocations`, a received-money `relatedExpense` link, or reciprocal `cardPayment` metadata. Original bank amount/date/provider identity remain authoritative. Invalidated splits retain their prior metadata for repair and show `allocationIssue`/needs-review instead of applying stale allocations.
- Rules may be `paused`. Future matches stop; previously reviewed choices remain. Previewed rule edits update only still-owned choices, and session undo preserves newer individual corrections.
- Optional device-only `flowLastEstimate` compares known inputs within the same ready payday horizon. It is cleared on sign-out/deletion/restore and is not a bank reconciliation ledger.
- `/demo/` uses a sessionStorage adapter with a separate namespace. No authenticated Supabase client is created there. Offline caches hold only allowlisted public application files, never API/bank/auth responses.

Apply the [client-version migration](supabase/2026-10-19-client-data-version.sql) before frontend publication. Once a row has version-2 data, an old writer cannot downgrade it through the save function or a direct update. Revision checks and owner-only access remain in force. Older pending edits meeting a newer cloud copy pause for explicit Account recovery rather than being silently uploaded.

## How totals work

- Income and expenses are added in cents, then displayed as dollars. Net is income minus expenses.
- A `Transfer` moves money between accounts and does not change income, expenses, or a category budget. A bank transaction can be marked as a transfer; manual entry does not create one yet.
- A `Refund` is a positive amount that reduces spending in its category. For a linked partial reimbursement, only the linked portion reduces spending; any mixed-deposit remainder is income. A bank credit can be marked as a refund; the manual entry form does not create one yet.
- A transaction with `status: "pending"` is excluded from posted totals until it is posted. The current form creates posted transactions without a status field.
- If the same record ID appears twice in a calculation, it is counted once. Existing saved records with colliding IDs receive separate IDs when loaded so neither record is lost.

## Money estimate and bank identities

- Bank-connected transactions retain provider IDs, Flow IDs, account/connection IDs, status, and a pending replacement ID where supplied. Repeated snapshots merge by bank identity; personal corrections and valid split/payment metadata survive. Confirmed transfers can link source/destination facts without combining or changing their amounts. CSV imports use exact date/name/amount matching with an option to include legitimate repeats.
- The payday engine starts with selected available cash or a dated manual confirmation. It subtracts unpaid bills, remaining essentials, cushion, inside goals, card repayment reserves, and explicit unreflected purchases once. It never substitutes historical net income for cash or includes future pay/available credit.
- The shared engine powers Home, Plan, reconciliation, and purchase previews. Missing/stale/changed evidence blocks a complete estimate. Plan amounts and all deductions use integer cents.
- Confirmed recurring bills reserve obligations and can match later payments without creating transactions. Older `recurringItems` remain compatible tracking choices; they are separate from bill schedules.

See [release review](docs/PRODUCT_TOOLS_RELEASE.md) for supported cases, verification, and remaining external validation.
