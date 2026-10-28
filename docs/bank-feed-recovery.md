# Replacement bank feed recovery

This release prepares a new connection on Flow Recovery. It does not transfer the original Item's trapped token, remove the original Plaid Item, or change its webhook. The original database and support ticket remain separate recovery work.

## Release order

1. Review the frontend, bank function and additive migration together. Obtain the owner's approval before committing/publishing or changing the live server.
2. Apply `supabase/2026-10-28-staged-bank-recovery.sql` on the replacement project only. It adds staging flags and owner-readable recovery copies. It does not modify financial rows or provider credentials.
3. Deploy `supabase/functions/plaid/index.ts` to the existing `plaid` function. Keep its user-JWT check enabled. The existing signed webhooks and email hook do not need a deployment.
4. On the replacement project, privately set `PLAID_PILOT_USER_ID` to the newly verified user for the existing pilot email, `PLAID_RECOVERY_ENABLED=true`, and `PLAID_PILOT_ENABLED=true`. Never reuse the old project's user UUID. Keep the pilot limited to this exact verified user; keep existing credentials and the Free plan.
5. Publish the matching frontend. `flowBankRecoveryPaused=false` resumes checks, but an empty recovery server preserves old account snapshots and a staged connection cannot auto-import.
6. Verify the live release and the authenticated connection response before inviting the owner to connect. The owner handles Mountain America login, terms and the new data-sharing consent. A new Item uses another Trial slot.

## Owner's steps

Account → Bank connections → Restore bank updates opens Transactions-only Plaid Link. The new connection stays staged after login. Choose Review bank recovery. Flow waits for historical import completion; it uses standard cached/sync requests and no paid Refresh product.

Match each saved account to a different new account. Exact unique names, types, subtypes and currencies are suggested, but a review checkbox is required. Preview switch shows old imports, new entries, clearly matched choices, unaffected records, and any old entries that will be available only in the recovery copy. The bank may supply less history than requested.

Switching replaces only bank-imported entries belonging to the selected old feed. Manual/CSV entries and other feeds keep their facts. Only a unique account/date/name/signed-amount/status match carries personal edits over. Repeated identical payments are never guessed. Planning references and confirmed transfer links migrate where the matched records allow it; broken reimbursement links are flagged for review.

Before switching, Flow saves a protected local copy. A service-only database function then locks the staged connection and saved workspace, checks owner, historical readiness, cursor and revision, saves a durable recovery copy, writes the reviewed workspace, and activates the feed in one transaction. A stale or repeated confirmation fails without changing the workspace.

Copies can be downloaded in Account → Backup & restore. They are intended for inspection/recovery; do not blindly restore an old feed over a newly active feed. After switching, verify account selections, balances, notes/categories, transaction counts, and a subsequent incremental sync. Do not report real bank syncing restored until these checks succeed.

## Validation

`npm test` includes deterministic matching tests, server endpoint tests, background-sync/account-cache staging guards, and a real PostgreSQL migration/RLS test via PGlite. Browser testing uses synthetic accounts and transactions only. The class demo can be presented independently of bank availability.

If preparation or publishing fails, keep the pilot disabled and preserve both the existing workspace and original Item. Do not clear data, reinstall Flow, delete connections, repeat token searches, restart the broken database, or add paid services as a shortcut.
