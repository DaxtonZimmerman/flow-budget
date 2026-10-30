# Bill and budget reminders

The bell opens an inbox of current bill and budget reminders. Reading a reminder does not mark a bill paid or change money. Tomorrow hides that reminder through the current local day; it can return the following day if still relevant. Paid bills and budgets below their threshold disappear automatically.

## Rules

- Bills: show confirmed unpaid occurrences within three days. Push once in the coming-up stage and once on the due date. A payment awaiting confirmation appears in the inbox without another payment-demand push. Overdue bills remain in the inbox for seven days; no repeated overdue pushes.
- Budgets: posted spending reaches 80% or 100%. A monthly category limit takes precedence over a payday set-aside for the same category. Refunds and split categories follow the existing reporting rules. Transfers, pending payments, future transactions and duplicate records do not trigger budget pushes.
- Push: opt-in per device, delivered only between 9 AM and 8 PM in the subscribed device time zone. Hourly checks, at most one bill push and one budget push per local day. Stage and daily claims prevent overlapping jobs from repeating a notice. An ambiguous delivery failure is not automatically retried.
- Privacy: lock-screen text never includes names of bills, transaction details, balances or amounts. Push subscription destinations and encryption keys are stored in server-only tables with account-deletion cascades. Signed-in pilot checks protect subscription actions; the schedule uses a separate secret.
- Sign-out unsubscribes this device. Removing an expired push destination does not change bank access or budgeting data.

## Setup on the existing Free server

Do not publish or deploy without the owner's standing review approval.

1. Apply `supabase/2026-10-29-notifications.sql`. It creates two server-only tables and an atomic delivery-claim function. Browser database roles receive no access.
2. Generate a P-256 VAPID key pair using the standard Web Push library. Store only in Edge Function Secrets: `FLOW_PUSH_PUBLIC_KEY`, `FLOW_PUSH_PRIVATE_KEY`. Store a separate cryptographically random value of at least 32 characters as `FLOW_PUSH_SCHEDULE_SECRET`. Never commit or print private values. Keep this pair stable so installed subscriptions continue to work.
3. Build with `node scripts/build-site.mjs`. This also generates the server's calculation bundle from the same browser calculation sources. Deploy `flow-notifications` and `flow-notification-delivery` with their included shared files. Keep user JWT verification on for `flow-notifications`. The schedule endpoint verifies `x-flow-schedule-secret` itself and has JWT verification off, as recorded in `supabase/config.toml`.
4. In Supabase Vault, save `flow_push_schedule_secret` matching the function's schedule secret, and `flow_push_delivery_url` pointing to this project's `/functions/v1/flow-notification-delivery` endpoint. Apply `supabase/notification-schedule.sql`; it installs one hourly job and replaces only an existing job named `flow-reminders`.
5. Publish the reviewed frontend. In the installed iPhone Home Screen app, open the bell → Notification settings → Enable on this device. The permission prompt happens only from this tap. Send a test, close Flow, and verify delivery. Confirm quiet hours and a controlled scheduled delivery before calling closed-app reminders verified.

This is an app delivery schedule, unrelated to any Codex chat automation. No new bank connection, bank permission, paid refresh product, or additional email provider is used.

## Budget display repair

Home and Plan previously labeled only balance-confirmed reserve release as “used.” A purchase could therefore show $0 used when the bank omitted its balance timestamp. `flowEssentialActivity()` now reports recorded period spending independently, includes start-day and manual transactions, uses exact split/refund amounts, and shows pending use separately. The payday estimate still uses the existing conservative reserve-release rules. Changing a display count does not assert that an undated bank balance already contains a purchase.

## Verification

Automated checks cover the rule engine, browser/server calculation parity, inbox actions and account changes, owner and endpoint validation, duplicate and quiet-hour delivery, expired devices, server-only SQL permissions, worker privacy, safe notification navigation, sign-out cleanup, and recorded spending without balance timestamps.

Phone/desktop visual testing and a real installed-iPhone push test are separate checks. Neither is implied by automated test results.

The October 29 working preview passes 372 automated checks, Deno type checking for both Edge Functions, and a Deno encryption/VAPID request-construction check with temporary synthetic keys and no network delivery. Phone and desktop browser checks verified the bell inbox, bill/budget switches, read/snooze actions, correct budget links, background scroll lock, and recorded versus pending spending on Home and Plan. A real iPhone delivery test remains pending deployment and device opt-in.
