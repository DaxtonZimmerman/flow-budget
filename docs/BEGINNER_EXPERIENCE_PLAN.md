# Flow: beginner experience and payday planning

Prepared 18 October 2026. The plan below remains a roadmap; the implementation status section records what is ready in the approved design release.

## Approved design release: implementation status

The approved whole-app prototype has been implemented in the existing app, using saved user data rather than demo figures. Published on 19 October 2026 after owner approval. The website release is `f730ac7`; GitHub Pages deployment [passed](https://github.com/DaxtonZimmerman/flow-budget/actions/runs/39208482315). All three matching Edge Function updates (`plaid`, `plaid-webhook`, `plaid-production-webhook`) were deployed to the existing Supabase project. Each editor’s complete source was compared with the tested local file before deployment. The signed-in function retains gateway JWT verification; both webhooks retain their signature-verification configuration. Unsigned requests were rejected by all three endpoints. No database migration, secret change, paid product, new bank connection, or deletion was performed.

Implemented and tested:

- Home, Plan, Account, and six-step resumable setup in the approved shared design. Activity, imports, category limits, grouped review, and individual payment editing remain available.
- A versioned payday plan and dated account snapshots in cloud/device copies and backups. Old backups remain compatible. Sign-out/deletion clears the new local fields.
- An authenticated, owner-scoped `/accounts/get` action, using cached USD cash balances; no paid Balance or Refresh endpoint. Missing, unsupported, stale, partial, or reconnecting account data cannot silently become zero cash.
- Integer-cent estimates from selected available balances (or a same-day manually confirmed balance), unpaid scheduled bills, essential set-asides, and a cushion. Expected pay, credit limits, and optional category limits do not inflate or duplicate the estimate.
- Monthly due-date anchors, repeated bills through the horizon, overdue-bill checks, explicit paid-bill confirmation, and renewed essential reserves after an expired payday is confirmed.
- Conservative high-confidence category mapping for new bank activity. Generic mixed-purpose payment names remain in review. Explicit personal categories and saved rules retain precedence.
- Recent activity review by default; full history remains optional. Setup does not require historical category cleanup.
- 95 automated checks passed locally and in the release workflow. Synthetic browser checks covered full setup, arithmetic, bill confirmation, set-aside edits, account selection, stale-edit protection, partially entered setup reserves, existing category controls, review scope, and individual editing. Six screens checked at 1440, 1024, 768, 390, and 320 pixels. Published page and script bytes match the release; the live signed-out Home rendered without console errors.

Deliberate limits of this release:

- Bank balances remain cached. Retrieval time is not described as a fresh institution balance. Manual balances must be reconfirmed on a new day.
- Essential reserves are released only for dated, posted spending known to precede a selected account's dated balance. With no reliable balance timestamp they remain conservative. Same-day purchases can still be reserved.
- Bills are advanced only after the person confirms that payment is already reflected in their available balance. Automatic bill-to-payment matching is still future work.
- Credit accounts cannot be selected as spending cash. The user must include unpaid card repayments as bills; comprehensive card planning is future work.
- Payday suggestions, monthly bill patterns, and category confidence reduce routine work. Transfer pairing, variable-income forecasts, automatic bill matching, batch undo enhancements, and measured new-user/pay-cycle validation remain future roadmap items.
- Progress saves on each setup step, Back, and Save & close. Partially entered essential reserves are retained when leaving a step; unsaved typing warns before navigation.
- Automatic cached account balances and newly retained bank categories are included in the deployed functions. Missing or unavailable balances still support an explicitly confirmed manual amount. No database migration or secret change was needed. A signed-in user’s first real account refresh remains a private-pilot validation step; the release checks did not retrieve or change the owner’s financial records.

## Recurring-bill increment: published

Published on 19 October 2026 in `75c9035`; the website deployment [passed](https://github.com/DaxtonZimmerman/flow-budget/actions/runs/39309544970), and all 12 changed website files matched the release bytes on the public site.

- Plan and setup suggest recurring bills from repeated posted payments on the same USD cash account, with payment dates as evidence. Routine shopping and mixed-purpose payment services are excluded. Confirm, edit, dismiss, or restore a suggestion; nothing is reserved until confirmed.
- Confirmed bills can use an exact merchant/account source to recognize later payments. Weekly, fortnightly, monthly, quarterly, annual, and one-time schedules are supported, including month-end and leap-day anchors. A just-due suggested bill is not silently advanced to another cycle.
- A unique posted payment is treated as paid only when a fresh, dated bank balance can establish it is reflected, or the user explicitly confirms it against their available balance. Retrieval time alone, pending payments, and same-day payments do not establish that fact. Matching uses imported data and adds no bank API calls or paid products.
- Changed amounts, ambiguous matches, changed or removed saved payments, matching refunds, and passed due dates ask for a check. “Date passed” does not claim a payment was missed. A matched payment cannot satisfy two bills or also free an everyday spending reserve. Users can reject a match, undo their confirmation, reconsider a rejected payment, or update future bill amounts separately.
- Confirmations, dismissed suggestions, future amount changes, and earlier recognized payment references survive cloud/device copies and backups. Older plans remain readable. Matching never changes a bank transaction's amount, date, identity, or category. Existing bills and personal setup are not changed by installing this update.
- 115 automated checks pass. Synthetic browser checks cover discovery through payment confirmation, corrections, price changes, stale edits, the full existing setup/review flow, and desktop/phone layouts. No personal bank records were used for testing. A real pay-cycle comparison remains a private-pilot validation step.

Remaining limits: exact-name matching will need a check when a bank changes a merchant description; variable bills require an amount check; automatic recognition is limited to USD cash accounts. Credit-card bill discovery, transfer pairing, and push/email notifications are not part of this increment. Legacy monthly tracking notes remain separate from confirmed payday bills.

## Payday check-in increment: approved for publication

Prepared and approved by the owner for publication on 19 October 2026. This increment appears on the live site after a successful website deployment.

- When a completed plan reaches its end date, Home and Plan offer a three-step check-in: confirm the next payday, check available money, and review fresh essential set-asides and the cushion. A schedule suggests a future date, including anchored month ends. Irregular income requires a chosen planning date.
- The check-in never assumes a paycheck arrived or adds expected income. Bank balances retain their cache dates and freshness checks; a person can explicitly enter today's available amount instead. Stale entered balances are not prefilled as current money.
- Bills, matched payments, preferences, dismissed suggestions, and account selection carry forward. Unpaid older bills remain due and need attention. Usual essential amounts are offered for confirmation; they restart from today only when the new plan is saved. A shortfall remains visible.
- All three steps save together through the existing owner/conflict checks. Canceling leaves the saved plan intact; Back retains entered values. Changed balances, activity, another saved plan, another account, or a new calendar day require another check before saving. A completed check-in cannot run again while its new plan is active.
- A calendar-day check and return-to-app check expose the prompt without automatically resetting the plan. The completed check-in date and monthly anchor survive cloud/device copies and backups. This is an in-app workflow, not a push or email reminder; no server deployment or paid product is needed.
- 123 automated checks pass. Synthetic browser checks cover the three-step flow, cancel/Back, arithmetic, carried bills, stale data, concurrent changes, overdue bills, midnight, and desktop/phone layouts. Existing setup, category controls, grouped review, individual editing, and six-screen layout checks also pass. No personal plan or bank records were changed for testing.

## Product decision

The first version should answer **“What can I spend until payday?”** This priority was selected by the owner. Flow should import and organize routine activity, explain the answer, and ask short questions when the bank data cannot establish a payment's purpose.

Initial scope: one person, US dollars, the existing private bank pilot, selected spending accounts, and the existing free recovery approach. Keep the current Flow visual identity and working bank connection. New paid services require a separate decision. Broader public signup remains a separate release.

## Current foundation

Verified against the current repository, rather than inferred from screenshots:

- Bank transaction import, update handling, reconnect/disconnect, and cloud/device sync exist.
- Categories, monthly limits, exact-name rules, scoped transfer rules, grouped review, individual transaction editing, notes, CSV import, and backups exist.
- Transfers and pending transactions are treated separately in spending totals; refunds reduce spending.
- Individual categories survive later bank syncs. The current automated suite has 81 passing checks.
- The app has desktop navigation, phone tabs, installation metadata, and responsive dialogs.
- The account balance model, payday schedule, bill obligations, and spend-until-payday calculation are missing.
- Bank categories and their confidence are not retained in the browser transaction model. Most newly imported spending therefore starts in Other unless a saved rule matches.
- Existing recurring suggestions detect monthly patterns only. Confirming one currently creates a tracking note, rather than a forecast obligation.
- There is no resumable first-run setup. The existing roadmap predates several deployed changes and should not be used as the current completion audit.

## First-use journey

Target: roughly five minutes of user decisions, excluding bank login, bank processing, and any optional cleanup. Measure this with new users; it is a target, not a promise.

| Step | What the person sees | What Flow does | Completion condition |
| --- | --- | --- | --- |
| Welcome | “Let's plan your money until payday.” Start setup or explore a clearly labeled demo. | Explain the short process; offer resume for an unfinished setup. | The user knows what the app will help them decide. |
| Money | Connect a bank, use an existing connection, or enter a balance manually. Select which accounts pay everyday expenses. | Show account names, available balances, and freshness. Exclude savings by default; never count available credit as cash. | A supported spending balance is selected or entered. |
| Payday | “When do you get paid next?” Suggested date and cadence, or a custom plan end date. | Suggest regular deposits from history, then ask for confirmation. Support weekly, every two weeks, twice monthly, monthly, and irregular income. | A confirmed horizon exists. No regular payday is a valid choice. |
| Coming up | A short proposed list of bills due before that date. Confirm, edit, dismiss, or add missing bills. | Detect possible recurring charges, show evidence, and identify whether an instance already posted. Ask explicitly if important bills are missing. | Upcoming commitments have been reviewed, including a valid “none.” |
| Keep aside | Simple amounts for essentials such as groceries and transport, plus a chosen cushion or savings reserve. | Suggest amounts from sufficient recent history; label sparse-data suggestions. Detailed category budgets stay optional. | The user confirms the reserved amounts. |
| Your plan | Estimated money left until the selected date, plus “See how this is calculated.” | Show the inputs, dates, missing information, and the next useful action. | The person can explain the headline number without help. |

Every step saves progress locally and to the signed-in account using the existing conflict rules. Back navigation retains choices. Restarting setup edits planning choices and never deletes transactions. If the bank import is still running, setup remains resumable. Historical categorization is optional and never a prerequisite.

## Everyday experience

The default Home screen answers four questions in this order:

1. **What can I spend until payday?** One estimate with its end date and data freshness.
2. **What is coming up?** Bills due next, with dates and amounts.
3. **Do I need to do anything?** A small set of useful decisions, such as two new ambiguous payments or a bank needing reconnection.
4. **Where did it go?** Recent payments and a simple spending view; detailed reports remain available below or in Activity.

The navigation remains familiar: Home, Activity, Plan, Review, Account. Rename Overview to Home only as part of the finished experience, so navigation and help stay consistent. Plan holds payday settings, bills, essentials, optional category limits, and later goals. Review separates new questions from optional historical cleanup. Account holds bank health, sync, privacy, backup, and setup help.

Use the existing colors and typography. Prioritize readable amounts, comfortable taps, focused sheets, stable scroll position, immediate save feedback, and clear loading/error states. The first-run guide remains available from Account and from an unobtrusive incomplete-setup checklist.

## Automation policy

Use deterministic logic and the data already available through the bank integration first. No paid AI service or external sharing of transaction descriptions is needed for this version.

| Decision | Behavior |
| --- | --- |
| Category selected on a single payment | Highest priority. Preserve it on sync and when broader rules change. |
| Explicit remembered rule | Apply to its stated scope. Preview affected entries when creating/changing it. Provide an undo action. |
| Strong bank category | Map a supported, high-confidence bank category into Flow's categories automatically. Show its source in transaction details. Keep a conservative mapping and measure corrections. |
| Ambiguous bank category or payment purpose | Suggest a category and show one compact question when useful. Keep the payment counted even if its category remains Other. |
| Venmo, Zelle, Cash App, mixed-purpose sellers | Default to individual choices or suggestions. Never create a broad remembered category from one correction without a separate opt-in. A previously chosen broad rule remains visible and removable. |
| Transfers | Pair uniquely matching movements between known user-owned accounts when the evidence supports it. Ask about unmatched or person-to-person payments. The word “transfer” alone does not prove account ownership. |
| Bills and income | Detect patterns, then confirm schedule and amount once. Flag unexpected amount/date changes. Never silently increase a forecast's certainty. |
| Old history | Offer optional batch cleanup with a preview. Preserve reviewed choices, existing manual corrections, and the original bank facts. |

Rule and batch undo restores only the affected fields that still match that operation. It must preserve newer user edits and all imported bank amounts, dates, and identifiers. Low-confidence categorization should not create a large compulsory inbox. Separate questions affecting the payday estimate from optional category precision.

## Money calculation contract

The headline is an **estimate based on selected money and confirmed commitments**, with an expandable breakdown.

Starting point: supported cash available in selected spending accounts, with an explicit source, currency, retrieval time, and bank freshness information where supplied. Subtract unpaid commitments due before the planning horizon, reserved essentials, savings set-asides, the chosen cushion, and supported unreflected spending adjustments. Every deduction must have one clear purpose and be counted once.

Rules that must be resolved and tested before displaying the estimate:

- Historical income minus spending is never used as a bank balance.
- Cached available balances can already reflect pending activity. Do not subtract all pending charges again. Build and test the policy against the available/current balance source and its coverage.
- Do not reconstruct a precise fresh balance by assuming that a retrieval timestamp is the institution's balance timestamp. If the balance/transaction coverage cannot be reconciled, show the uncertainty or ask for a current manual balance.
- A bill linked to a posted payment stops being an unpaid obligation. Monthly budget limits and bill reserves cannot both reserve the same dollars.
- Treat savings excluded from the spending balance and savings reserved within that balance differently, so the same money is not removed twice.
- Transfers between included accounts do not create income or spending. Transfers to excluded accounts affect the available pool once.
- Credit limits are never cash. Credit-card purchases, reserved repayment money, existing debt, and scheduled payments need explicit treatment to avoid double counting. Until that treatment passes its tests, show a limited-support state instead of a complete estimate for unsupported card setups.
- Future payday income is outside the current spending window. Expected income does not increase today's spendable money before it is received in the initial version.
- Refunds/reimbursements restore an eligible category or reserve only once, after their status and relationship are established.
- Missing balances, currencies other than the supported currency, missing bill confirmations, stale data, or incomplete setup produce a clear incomplete/estimated state rather than a confident default.
- A negative result displays a shortfall. Do not hide it by silently clamping the number to zero.

Use currency-safe arithmetic and date-only scheduling, including month ends, leap days, missed payments, variable amounts, and payday changes. Treat “Synced now” separately from “Bank data as of…” when the underlying data may be cached.

## Build order and acceptance gates

| Phase | Deliverable | Gate before the next phase |
| --- | --- | --- |
| 1. Shared data foundation | Account metadata and balance snapshots; preserve bank categories/confidence; versioned onboarding, income schedules, obligations, reserves, and field provenance. Extend backups and cloud snapshots. | Existing data migrates without changing its values. Old backups restore. New settings sync. Missing data is explicit. Existing bank connection stays usable. |
| 2. Less manual sorting | Bank-category mapping, scoped rules, ambiguous-payment handling, review preview/undo, and a separate optional history queue. | Known transactions sort correctly; Venmo can vary; reviewed exceptions survive sync, rule edits, and batch actions; imports remain idempotent. |
| 3. Payday engine | Confirmed income/bill schedules, instance matching, essentials/cushion reserves, and the explainable estimate. | Calculation cases above pass, including pending/posted transitions, bills already paid, refunds, transfers, stale balances, and supported card repayment cases. |
| 4. Guided setup and Home | Resumable setup screens, new Home hierarchy, optional budgets, and guidance for the existing user as well as a new user. | A beginner reaches an explained plan without categorizing historical transactions; closing/reopening preserves progress. Phone and keyboard paths work. |
| 5. Routine use | Pay-cycle rollover, short weekly check-in, in-app bill reminders, useful review counts, recovery states, and install/return experience. | New paydays and changed bills update the plan predictably. Offline data is labeled. A reconnect does not reset the plan. |
| 6. Private pilot validation | Use the completed workflow through a full pay cycle, comparing the estimate and bill matches against known outcomes. | Discrepancies are explained and fixed; backup/restore, sync conflicts, accessibility, and bank lifecycle checks pass. New-user tasks meet the criteria below. |

Implementation follows this order; the setup screens can be sketched before Phase 1 to check language, but are wired to real data after the calculation contract is sound. Review each phase and ask before a new commit/publication under the owner's standing preference. Deployments changing live server code remain separately reviewable.

## Definition of a good first version

- A new user understands the headline in ten seconds without a tutorial explanation from the developer.
- A new user completes the required setup decisions in about five minutes, excluding bank processing; record actual results.
- Setup never requires categorizing old transactions or creating dozens of categories.
- Every estimate can be traced to its inputs, time window, and reservations.
- One Venmo payment can be Food and another Shopping; correcting either is easy.
- Routine sorting removes meaningful work. Track the percentage organized automatically and the correction rate separately; do not treat a high automation percentage as success if it hides mistakes.
- Measure the actual number of questions after a typical week and aim for a short session. Never hide a money-critical issue to satisfy a review-count target.
- Test with synthetic money cases first, then a private pay-cycle pilot, then fresh beginners when broader access and support are ready.

## Later, after this version works

Split payments, richer reimbursement matching, custom categories, sinking funds, multiple income streams, deeper credit-card planning, opt-in notifications, and household features. Add each only when it supports the main question without making setup harder. Paid bank refresh, paid enrichment, AI chat, investment tracking, and a public launch are separate cost/scope decisions.

## Research behind the choices

The repository already contains a 12-app interface comparison in `docs/DESIGN_RESEARCH.md`. This plan additionally checked the following primary sources on 18 October 2026:

- [Monarch budget setup](https://help.monarch.com/hc/en-us/articles/360048883631-Creating-Your-Budget-in-Monarch): guided budget walkthrough and flexible budgeting choices. Flow's proposed payday focus is its own product decision.
- [YNAB getting started](https://www.ynab.com/guide/the-ultimate-get-started-guide): guided learning and purposeful planning. Flow will use a smaller initial set of decisions.
- [Simplifi spending plan](https://support.simplifi.quicken.com/en/articles/4212702-understanding-your-spending-plan): income, bills, planned spending, and matching recurring activity without double counting. Its documented plan is monthly and does not use existing balances; Flow's cash-until-payday calculation must be implemented independently.
- [Copilot category rules](https://help.copilot.money/en/articles/13978302-bank-category-rules): preview matching transactions before applying a rule. This supports explicit rule scope and easy corrections.
- [Plaid Accounts API](https://plaid.com/docs/api/accounts/): `/accounts/get` is documented as free and returns cached account data; available balances can be absent and are not guaranteed to be real time. Verify actual team access and bank output during implementation. This does not imply that every Plaid product or unlimited bank connections are free.
- [Plaid Transactions API](https://plaid.com/docs/api/products/transactions/): category intent and confidence metadata can support conservative automatic categorization. Missing/ambiguous categories still need explicit handling.

