# App shell and Home review

Stage C of the approved app redesign, prepared 20 October 2026. Implemented locally for review; not committed or published.

## This stage

- Four consistent navigation destinations: Home, Activity, Plan, and Bills. Account and banks open from the profile control on every app page.
- Home leads with the existing payday estimate and a relevant purchase or recovery action, followed by the payday path, at most one next task, supported highlights, and three recent payments.
- Highlights advance only on request and use saved spending, goal, check-in, or comparison data. Missing information never becomes an invented statistic.
- Manual balance confirmation and bank balance timestamps are distinct. Missing bank dates and checks affecting the estimate remain visible.
- Existing purchase previews, reconciliation, goals, payment details, setup, account, backup, and review flows remain reachable. New sheets replace the current Home sheet rather than stacking.
- Bills has a working destination backed by the current bill tracker and editor. Its complete dedicated redesign is stage E.
- Month-filter navigation retains the existing Home and Plan link hooks. Old Account, Review, and category-limit URLs remain available.
- Phone navigation, Account sheets, safe-area spacing, focus return, reduced motion, and versioned offline assets are included.

## Validation

- 184 automated data and presentation checks pass.
- Existing browser regression passes: isolated sample data, unchanged purchase results, goals, categories, splits, reconciliation, check-ins, preferences, stale-save rejection, and all app pages at 1440, 390, and 320 pixels.
- Warm legacy-cache upgrade passes: versioned assets, isolated sample data, no missing public files, and offline Home.
- Offline and keyboard regression passes: reopen, navigation, edit persistence, queued owner changes, no private/auth response caching, recovery, focus trapping, and Escape.
- Manual phone and desktop review uses only the isolated demo. No real bank credentials or account records are used.

The demo's existing estimate remains $265. A $120 Food preview uses $100 of its existing reserve and leaves $245 flexible, with no recorded purchase.

## Next

Stage D: apply the approved Activity layout and one-payment Quick check deck. Then Plan/Bills, guided setup, and final release review follow the saved redesign plan.

No server or database deployment is part of this stage. Publishing remains subject to the user's standing request to review new commits first.
