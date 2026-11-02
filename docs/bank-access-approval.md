# Bank access approval

Other signed-in users request access in Profile → Bank connections. The existing pilot owner reviews email addresses there and approves or declines each person. Pending requests refresh every minute while the screen is open and on returning to it. Connected requests stay in the owner's list. This release does not add push or email request alerts.

The server checks approval before both Link-token creation and public-token exchange. An approved connection is saved and its approval consumed atomically under a row lock. Cancelled, declined, or used approvals cannot create another feed; existing feeds can still sync and reconnect. The owner remains the server-configured `PLAID_PILOT_USER_ID`; browser input cannot choose the administrator. The existing `PLAID_PILOT_ENABLED` switch must also be on. Nobody else can query the request table or RPCs directly.

Deploy the additive `supabase/2026-11-01-bank-access-approval.sql` migration, update the existing `plaid` function with JWT verification unchanged, then publish the frontend. No credentials, provider hooks, bank records, plan, or ownership settings change. No real bank connection is created by deployment or by approval.

Email sign-in remains restricted to the existing private pilot by `flow-auth-email`. Enabling login for other testers requires a separate supported email-sending setup; approving bank access does not bypass sign-in or make the app public. Plaid Trial limits still apply.
