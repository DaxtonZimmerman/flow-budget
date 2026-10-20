# Steps 1–8: product tools release review

Release prepared 19 October 2026 against the previous published baseline `db3e1f9`. **The owner approved committing, publishing, and applying the compatibility guard on 19 October 2026.** Supabase reported success applying that guard before frontend publication. Feature development and tests used disposable synthetic data, without changing real financial records. No paid service, additional Plaid product, or new bank connection is introduced.

## What is ready to review

| Step | Working behavior | Where to try it |
| --- | --- | --- |
| 1. Understand the money | Four-step money check: selected cash, balance source/coverage, bills already paid or partially paid, reviewed breakdown. Dates distinguish a bank balance from a recent retrieval. Unreflected purchases can be deducted explicitly and need checking when the balance changes. | Home → Check my plan; Plan → Payments & organization. |
| 2. Start easily | Existing resumable setup stays focused on the next payday, without compulsory history cleanup. Suggestions need enough observed history and explain their basis; the app never invents a cushion. A working sample workspace has isolated session storage and no authenticated client. | Home → Try the demo; `/demo/index.html`. |
| 3. Organize with exceptions | Custom categories can be added, renamed, archived, or merged after an affected-record preview. Split an individual payment using exact cents. Link a received reimbursement to an expense; a mixed deposit keeps its remaining income. Pause/edit remembered choices and undo rule changes while preserving newer individual corrections. | Plan → Custom categories / Remembered choices; Activity → a payment → Payment tools. |
| 4. Make a spending decision | Amount, category, and date preview use the same payday engine. Relevant essentials cover their portion; the cushion remains reserved. Known changes to the same ready payday estimate are explained on Home. Previews create no transaction or commitment. | Home → Can I spend this? / changes section. |
| 5. Plan commitments | Goals distinguish money inside the selected spending balance from savings outside it. A goal can fund one bill without reserving it twice. Variable ceilings, end dates, one-occurrence amounts/skips, and confirmed partial payments support changing bills. Reflected payments consume a linked fund once. | Plan → Goals & annual costs; bill editor; Adjust a bill or record a partial payment. |
| 6. Handle everyday cards | Configure an imported card as full confirmed debt, a fixed repayment, or outside the plan. New purchases reserve repayment money; eligible funded purchases use essentials once. Pending refunds do not release money. Explicit matching links both sides of a posted card payment with undo, while retaining original bank facts. Cash-side coverage must be checked before releasing the reserve. | Plan → Credit cards; Match card payments. |
| 7. Keep a short routine | Weekly check-in summarizes posted activity, changed commitments, and remaining questions. Optional in-app reminders cover payday, bills, stale money, shortfall, and the weekly check. They can be snoozed and turned off. | Home → Weekly check-in; Account → reminder settings. |
| 8. Return and recover | Public app files load offline after preparation; device edits persist and signed-in changes queue. Updates require an explicit action and do not reload an open form. Keyboard focus stays in the active dialog; Escape, close buttons, skip link, reduced motion, narrow screens, help search, export/restore, and stale-edit protection are included. | Account → Help / backups; reload an already-prepared app offline. |

The interface preserves Flow's current identity and five-tab structure. Advanced tools sit inside focused sheets or Plan/Account sections rather than adding required onboarding steps.

## Money and data limits

- USD cash and explicitly configured imported credit cards are the supported model. Credit limits, future pay, and historical income-minus-spending are never current cash.
- A balance fetched now may still be cached at the bank. The app asks for dated coverage or a manual confirmation when it cannot establish what is reflected. Missing/changed facts block a complete estimate rather than inventing certainty.
- Full/fixed card starting amounts require the user's confirmation. Start-day and pending purchases can conservatively retain essentials until confirmed. This is repayment planning, not interest calculation, a debt amortization tool, or bank payment execution.
- Bill/goal reserves are virtual set-asides, not transfers. A linked fund is consumed by a confirmed reflected bill payment, once. One goal may fund a bill; external savings remain outside the spending pool.
- A reimbursement link uses actual posted positive funds, caps recovery against the remaining expense, and preserves any income remainder. Splits and payment links do not alter imported amounts, dates, or identifiers. Changed bank amounts invalidate stale split allocations and return them to review.
- Reminders run inside Flow when it is open. No email, SMS, background push, or paid notification service is installed. No analytics service or telemetry endpoint is added.
- The demo is session-only and clearly labeled. It does not read a signed-in workspace; its exports are marked and rejected by real-workspace restore. Exiting the demo returns to the normal app.
- Offline caching is an explicit allowlist of public HTML, scripts, styles, icons, and demo files. Bank/API responses, Authorization requests, sign-in tokens/codes, and arbitrary URLs are not cached. Device financial data still uses the existing browser storage; this is not encrypted-vault functionality. Cloud authentication/bank updates need a connection.
- Backup files contain personal budget data and should remain private. A Flow JSON export is not a backup of server-side Plaid tokens or the entire Supabase service. The existing free recovery tradeoff remains.
- Remembered-choice undo is available in the current editing session and avoids replacing newer corrections. It is not an unlimited durable audit history.

## Verification completed locally

- **178 automated checks pass**: existing behavior plus exact split/refund math, money coverage, sparse-history suggestions, goal/bill union and consumption, variable/partial bills, full/fixed card reserves, pending replacement, card payment matching, paused rules, reminders, versioned sync, and backup compatibility.
- **38 JavaScript files parse.** Static build succeeds and excludes tests, server code, SQL, documentation, and environment files.
- Isolated desktop and 390px/320px Chrome checks pass for demo isolation, previews, goals, custom categories, split editing, reconciliation, weekly check-in, preferences, help, stale-save guards, navigation, and horizontal overflow.
- A separate synthetic financial workflow passes for variable/one-off/partial bills, a linked goal, card configuration/purchase/repayment/reconfirmation, correction-preserving rule editing and undo, demo-export rejection, and a full backup restore.
- Real service-worker tests pass for installation, offline reload/navigation/edit persistence, queued owner edits, recovery status, keyboard dialog focus/Escape, and exclusion of private/auth request URLs from caches.
- A disposable PostgreSQL instance verifies the compatibility migration twice, legacy-to-new upgrade, rejection of old RPC and direct writes after upgrade, valid new saves, stale-revision conflicts, owner isolation, and anonymous denial.

Commands:

```sh
node --test tests/*.test.js
node scripts/build-site.mjs
python3 -m http.server 4329 --bind 127.0.0.1
```

In another terminal, using installed Playwright/Chromium (or `FLOW_PLAYWRIGHT_PATH` and `FLOW_CHROME_PATH` overrides):

```sh
FLOW_TEST_URL=http://127.0.0.1:4329/ node scripts/browser-product.cjs
FLOW_TEST_URL=http://127.0.0.1:4329/ node scripts/browser-financial-tools.cjs
node scripts/browser-offline.cjs
```

The database test uses `@electric-sql/pglite` 0.5.10, installed temporarily for validation; it is not a shipped dependency. Set `FLOW_PGLITE_PATH` to its installed module location if necessary, then run `node scripts/test-data-version.cjs`. Browser tests block external traffic and use separate profiles; they never sign in to a real account. Screenshot output goes to `/private/tmp`.

## Deployment order and applied guard

1. Review this build and save a private current Flow export. Check that no unexpected local changes have appeared before committing. A push to `main` automatically publishes via GitHub Actions, so do not push yet.
2. Apply [2026-10-19-client-data-version.sql](../supabase/2026-10-19-client-data-version.sql) in Supabase before publishing the frontend. Its trigger prevents old clients from replacing a version-2 workspace with a snapshot missing the new details. The migration is additive/idempotent, leaves existing data unchanged, and preserves owner access rules and revision conflict checks. The approved migration was applied successfully to the existing Flow project on 19 October 2026 before publication.
3. Commit/push the approved frontend, tests, documentation, and generated assets. No Edge Function deployment or new secret is required for this batch.
4. Close/reload older Flow tabs. If unmarked older pending edits meet a version-2 cloud copy, the new app pauses and asks the user to download/resolve the copies through Account; it does not silently upgrade and upload potentially degraded edits.
5. Verify the published demo first, then an owner's reviewed plan and backup roundtrip without deleting or reconnecting the existing bank. Confirm offline return and explicit app update behavior. Recheck all data before using a spending estimate for a real decision.

For rollback, keep the database guard and retained version-2 data. Do not remove the guard or let an older writer save a newer workspace; roll forward with a compatible fix. Older unupgraded rows remain readable/writable under the existing schema rules. No live recovery exercise has been performed in this build.

## Still needed before a paid wider release

This implements steps 1–8; it does not prove demand or complete every acceptance gate. Observe fresh beginners, compare estimates and bill/card behavior through complete private pay cycles, and check other institutions/account lifecycles deliberately. Safari/Firefox/mobile-install behavior, assistive-technology review, representative large-history performance, independent security review, protected server recovery, monitoring, public support/policies, ownership, and commercial provider costs need separate validation. No new users have been invited and no subscription system has been enabled.

Use the proposed evidence gates in [the product plan](PAID_PRODUCT_PLAN.md) to decide what improves next. The owner's no-spend constraint and commit/publication review preference remain in effect.
