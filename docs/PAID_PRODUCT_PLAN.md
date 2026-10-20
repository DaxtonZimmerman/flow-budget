# Flow: plan for a product people choose to pay for

Prepared 19 October 2026. Planning baseline: `main` at `db3e1f9`.

Status: proposed build and validation plan. This document does not authorize publication, provider upgrades, billing, new bank connections, or changes to anyone's financial records. Work in small, reviewable increments; obtain the owner's approval before each new commit/publication under the existing preference.

## 1. The product we are building

**Flow helps a beginner understand what they can spend until payday, what is already spoken for, and what needs a decision. It keeps the routine work small.**

Our proposed first customer is an individual in the US, using USD, with a reasonably predictable paycheck and a few everyday accounts. They want help deciding what to spend now, and find maintaining a detailed budget tiring. This audience is a hypothesis to test with people beyond the owner.

The reason to subscribe should be repeated practical value: a clear decision before a purchase, fewer overlooked commitments, less sorting, and visible progress toward a goal. A polished interface supports that value. We have not yet established that customers will pay for Flow.

### The intended everyday experience

1. Open Home and see a dated estimate, its bank-data freshness, and the most important change since the last visit.
2. See the next bills and money reserved for essentials, without opening several reports.
3. Try a purchase amount and understand the effect on the current plan.
4. Answer a small number of meaningful questions; ordinary transactions organize themselves.
5. On payday, confirm money actually received and carry the plan forward.

### An explainable answer

Illustrative example, not anyone's financial data:

| Part of the plan | Amount |
| --- | ---: |
| Selected available cash, with a known source/date | $500 |
| Unpaid bills before payday | −$200 |
| Essentials still reserved | −$120 |
| Chosen cushion | −$50 |
| Estimated flexible money until payday | **$130** |

The interface must explain that the $120 for essentials remains part of the plan, so a beginner does not mistake $130 for the total groceries-and-everything budget. Unknown balances, missing bills, pending activity, or unsupported account setups must affect the explanation and readiness of the estimate. Expected future pay is never presented as money already available.

## 2. What the competitive research suggests

Official product pages were checked on 19 October 2026. The feature observations below come from those pages; the lessons for Flow are our interpretation. Vendor claims and testimonials are not proof that Flow has demand.

| Product | Relevant product observation | Lesson for Flow |
| --- | --- | --- |
| [YNAB](https://www.ynab.com/pricing) | A defined method, goals, debt planning, bank imports, and guided learning. Listed at $109/year or $14.99/month, USD before applicable tax. | Teach a small, repeatable money routine and explain the next action. |
| [Monarch](https://www.monarch.com/pricing) | Budgeting, tracking, planning, and a broader Plus offering. Its FAQ lists the base subscription at $99.99/year or $14.99/month. | A complete experience matters, but Flow's initial customer does not need every financial dashboard. |
| [Copilot](https://www.copilot.money/) | Automatic organization, recurring charges, rollovers, and a test drive before connecting an account. Listed at $95/year or $13/month. | Let beginners experience the product before asking for bank access; make routine review pleasant. |
| [Quicken Simplifi](https://support.simplifi.quicken.com/en/articles/4212702-understanding-your-spending-plan) | A monthly spending plan combines income, bills, goals, and planned spending. Recurring-linked payments avoid a second planned-spending count. Its documented model excludes existing balances. | Make commitments understandable and avoid double counting. Flow needs its own balance-based payday model. |
| [PocketGuard](https://pocketguard.com/) | Leftover money, spending forecasts, rules, recurring charges, and goals. | A spendable-money headline already exists in this market. Flow must earn preference through ease, clarity, and reliability. |
| [Rocket Money](https://help.rocketmoney.com/en/articles/2677184-premium-membership-features) | Subscription detection/cancellation assistance and advanced transaction tools are part of its premium offering. | Show a concrete action or result from insights. Detection alone is less helpful than a clear next step. |
| [Lunch Money](https://lunchmoney.app/features/transactions) | Transaction splitting and grouping, flexible editing, and rules. | Make exceptions easy without forcing everyone to use advanced controls. |

**Our proposed distinction:** a particularly simple payday routine, understandable automation, and a short path from opening the app to making a decision. This must be tested against customers' current alternatives, including a bank app or spreadsheet. Do not claim the payday concept itself is unique.

## 3. The foundation already exists

This is a source and release-history audit, not a new production security certification or proof of reliability across banks. The baseline release recorded 148 automated checks plus synthetic browser testing.

| Area | Current state | Remaining work |
| --- | --- | --- |
| App interface | Built: shared responsive navigation, phone tabs, focused dialogs, installation metadata. | Accessibility/performance audit; consistent details and recovery states; true offline app loading. |
| Setup and payday plan | Built: resumable setup, selected cash accounts/manual balance, payday, bills, essentials, cushion, breakdown. | Observe beginners; improve sparse-data suggestions and uncertainty; validate a complete pay cycle. |
| Accounts and data | Built: email sign-in, private cloud/device copies, conflict handling, export, account deletion path. | Broader lifecycle tests, device privacy review, operational recovery, support. |
| Bank feeds | Built for the private pilot: server-held tokens, signed webhooks, incremental imports, automatic checks, reconnect/disconnect. | Bank coverage, account lifecycle and failure validation; explain upstream delays; commercial access/cost review. |
| Organization | Built: supported bank categories, remembered rules, quick review, individual edits, manual/CSV entry. | Custom categories, splits, reimbursement workflow, stronger rule management and previews. |
| Bills and payday routine | Built: recurring suggestions, confirmed schedules, payment matching, payday check-in. | Variable bills, annual reserves, useful reminders, better explanations of changed obligations. |
| Transfers | Built: known cash-account matching within one bank, confirmation and undo. | Validate edge cases; explicit policies for cross-bank movements and card payments. |
| Commercial product | No paid customer validation or subscription system established. | Customer research, support/contact, policies, operations, provider budget, pricing and payments. |

The current cash calculation deliberately keeps reserves conservative when it cannot prove spending is reflected in a dated balance. That can require a manual balance confirmation. Retrieval time is not necessarily the bank's balance time. Credit-card planning remains incomplete; available credit is never cash.

Older repository documents contain historical Sandbox-only status, old Trial counts, and completed features still shown as future work. This plan and the current implementation sections in [the beginner experience plan](BEGINNER_EXPERIENCE_PLAN.md) are the product baseline. Re-audit live operational settings before any wider release; do not treat old checkmarks or old usage counts as current evidence.

## 4. The build sequence

Customer interviews and operating-readiness work start alongside the product increments. Finish and review one implementation increment before beginning another. The sequence is based on dependencies, not calendar promises.

| Order | Increment | Customer benefit | Finish condition |
| --- | --- | --- | --- |
| 0 | Observe beginners and document current friction | We solve a problem people actually have. | Target users attempt setup and a spending decision; findings change the backlog. |
| 1 | Money accuracy, freshness, and reconciliation | The main answer is understandable and dependable within its stated limits. | Supported money cases reconcile; uncertain data has a useful recovery path. |
| 2 | Beginner setup and a working demo | First useful plan without a history-cleanup chore. | Most observed beginners finish and explain it without developer help. |
| 3 | Automatic organization with easy exceptions | Less sorting, simple corrections. | Splits, custom categories, refunds, and rule changes preserve original bank facts and user choices. |
| 4 | Purchase preview and “what changed” | Help at the moment of a spending decision. | Every result traces to the same money model; previews do not change real records. |
| 5 | Better bills, goals, and annual expenses | Fewer surprises and a reason to keep planning. | Reserves persist correctly and are counted once through payments and rollover. |
| 6 | Complete credit-card treatment | Everyday card spending fits the cash plan. | Purchases, repayment reserves, debt, refunds, and payments reconcile without duplicate spending. |
| 7 | Short check-ins and useful reminders | A small routine keeps the plan useful. | Relevant, optional alerts and check-ins work without noise or privacy surprises. |
| 8 | App quality and reliable recovery | Feels dependable on a phone and across devices. | Accessible, responsive, recoverable journeys pass on supported devices and bank failures. |
| 9 | External beta across real pay cycles | Validate usefulness outside the owner's own workflow. | Cohort meets the provisional outcome gates below and known money issues are fixed. |
| 10 | Subscription launch with sustainable costs | A service customers can understand and keep using. | Payment/recovery/support gates pass and real customers choose to pay. |

Credit-card work can move earlier if discovery shows it prevents the first cohort from using Flow. Do not offer a complete spending estimate to an unsupported card setup just to maintain this order.

### 0. Discover what beginners need

- Interview 5–8 people who resemble the proposed first customer. Ask about their most recent spending decision, current tools, abandoned budgets, and what they already pay for.
- Observe them using the existing setup and review flow with synthetic data. Do not teach every step before measuring difficulty.
- Ask them to explain the main number, find an upcoming bill, correct one Venmo payment, and recover from an old balance.
- Record task success, confusion, assistance, decision time, and their own explanation of the value. A compliment or “I would pay” is weaker evidence than ongoing use and an actual purchase later.
- Create an issue list ordered by money risk and customer friction. Compare Flow with the person's current alternative rather than relying entirely on competitor feature lists.

**Deliverable:** short findings report, tested audience assumption, and an updated next-increment brief. Owner arranges consenting participants; this plan does not authorize messaging anyone.

### 1. Money accuracy and a useful explanation

This is the first engineering increment. Audit and strengthen the existing engine rather than building a second calculator.

- Show a clear breakdown for selected cash, commitments, essentials, cushion, and flexible money. Distinguish bank availability, balance date, latest check, and unsaved/offline work.
- Introduce an explanation of changes tied to supported evidence: a new bill, changed reserve, confirmed balance, or new activity. When independent snapshots cannot be reconciled, say so instead of inventing an exact explanation.
- Add a guided “Check my plan” path: selected accounts → balance/date → bills paid or still due → money kept aside. Keep manual confirmation available, dated, and clearly user supplied.
- Resolve manual/cash spending not yet reflected by a bank, pending versus posted activity, partial refunds, returned payments, and movements involving excluded savings. Never subtract the same purchase from both an already-adjusted balance and an extra adjustment.
- Preserve original imported amounts and identities. Retain provenance for classifications, reserves, confirmations, matches, and later corrections.
- Document boundaries: today's date, same-day payday/bill order, due dates, month ends, timezone changes, and missing account metadata.

**Acceptance:** representative synthetic scenarios cover all supported balance/transaction states; a pay-cycle comparison explains discrepancies; uncertainty cannot silently become a confident positive estimate. Existing transactions, notes, rules, backups, and device conflicts still behave correctly. Update misleading historical product documentation during this audit.

### 2. A beginner reaches value quickly

- Add a clearly labeled interactive demo with synthetic records. It must be isolated from real accounts and reset safely.
- Improve the existing setup instead of adding another tutorial: goal, money, next payday, coming bills, essentials/cushion, explained result. Let the person resume and revisit decisions.
- Use history to suggest amounts only when sufficient evidence exists. Show the basis, let users edit, and offer a simple starter choice when history is sparse. No invented ideal budget or silent lowering of essentials to make a result look positive.
- Handle a long bank import without blocking the entire journey. Explain that another check cannot force the bank to report today's transfer.
- Separate essential money decisions from optional old categories. Hundreds of old records must never become compulsory onboarding.
- Put brief help where the question appears, plus a small searchable help area and a restart/resume path in Account.

**Acceptance:** at least 4 of the first 5 observed target beginners complete required decisions without developer rescue and can explain the result. Aim for under five minutes of decisions, excluding external bank login/import delays. Record failures instead of hiding them in averages.

### 3. Automation people can correct

- Add custom categories with sensible defaults, archive/merge behavior, and safe migration of existing rules and limits. Subcategories remain optional.
- Add splits for mixed payments, such as one store purchase spanning food and household supplies. Child allocations must sum exactly to the original amount; totals never count the parent and children twice.
- Add links for partial/full refunds and reimbursements, including expenses that cross pay periods. Do not count an expected reimbursement as available cash before receipt.
- Improve rule management: visible scope and priority, a preview of affected entries, edit/pause/delete, and undo. One individually corrected Venmo payment must remain an exception to a broad rule.
- Preserve high-confidence categorization and ask only about uncertain purpose. Separate questions that affect the money plan from optional category neatness.
- Preview bulk changes and bank/CSV duplicate resolution. Similar date/amount alone must not silently delete two real purchases.

**Acceptance:** exceptions survive sync, imports, rule changes, and another device's newer edits. Review time and correction rates fall together. A transfer confirmation still requires evidence of ownership; it cannot be inferred from a merchant word alone.

### 4. Useful help before a purchase

- Add “Can I spend this?” as a focused sheet: amount, planned date, category if relevant, and a clear preview of remaining flexible money and any shortfall.
- Explain when a purchase uses an existing essentials reserve versus new discretionary money, so it is not deducted twice. Do not automatically spend or release the cushion.
- Show a short timeline of confirmed obligations through payday. Add a separately labeled scenario for the next pay period only after the current model is validated.
- Offer an optional per-day guide for remaining flexible money. It is an arithmetic planning aid, not a new bank balance or a guarantee. A shortfall stays visible.
- Add a concise “Since your last visit” explanation only when supported by saved snapshots and known events.

**Acceptance:** the preview uses the shared money engine and its readiness rules, never creates a real transaction, and cannot change a bill or reserve without a separate explicit save. Unknown balances and late bank data remain visible in scenarios.

### 5. Bills, goals, and non-monthly costs

- Extend confirmed bill schedules to variable amounts, changed dates, partial payments, skipped instances, annual renewals, and a user-confirmed end date.
- Show subscription price changes and approaching renewals when the available records support them. Provide an action such as opening the merchant's cancellation guidance; do not claim cancellation was performed or money saved without evidence.
- Add simple goals: target amount, optional date, existing designated money, and a proposed contribution per payday. Start with an emergency cushion and annual expenses.
- Support reserved funds rolling across pay periods. Distinguish money earmarked within a spending account from money already held in excluded savings.
- Let users adjust competing goals when the plan is short. Proposals require approval; no automatic movement of money or unannounced spending cuts.
- Keep bills, goals, essentials, and optional category limits coordinated so one dollar has one active reservation.

**Acceptance:** a goal contribution, payment, refund, transfer, or rollover does not create cash or reserve it twice. Dismissing a suggestion leaves bank records intact. Users understand which money exists and which contribution is merely planned.

### 6. Complete the everyday credit-card model

- Clearly separate credit available, card debt, purchases, cash reserved for repayment, and payments already sent.
- Count a purchase as spending once. A matched checking-to-card payment reduces cash/debt but does not create another purchase.
- Handle pre-existing debt, minimum versus full-statement payment choices, interest/fees, pending purchases, partial payments, refunds, and cards whose other side is not connected.
- Explain how reserved repayment money affects flexible cash, including a payment that crosses a payday boundary.
- Add explicit confirmation and recovery for ambiguous repayments and mismatched posting dates. Extend cross-bank cash transfer matching separately using the same ownership safeguards.

**Acceptance:** supported cases reconcile across the card, cash account, reservations, and pay-cycle changes. Until then, a cash-only beta must say so and screen out unsupported use cases. Broad consumer marketing should wait for tested card support; a full debt-payoff optimizer can come later.

### 7. A small routine worth returning to

- Build a short weekly check-in on top of the existing payday check-in: what changed, bills approaching, uncertain activity, and progress toward goals.
- Add opt-in reminders for a bill, a payday confirmation, a bank needing reconnection, and a meaningful plan shortfall. Start in-app; add push/email only after channel support, permission, cost, and delivery are tested.
- Respect quiet hours, frequency limits, dismiss/snooze choices, and previously completed actions. Do not nag people to perfect old categories.
- Keep sensitive amounts and merchant details off notification previews by default. Let people choose how much appears.
- Use a simple factual summary of useful activity. Do not invent a savings figure, streak penalty, or financial-health score to create engagement.

**Acceptance:** a normal week takes roughly two minutes of decisions for the target use case, excluding a genuine exceptional problem. This is a test target, not permission to hide important questions.

### 8. Make the app feel finished

- Maintain Home, Activity, Plan, Review, and Account. Add depth through focused sheets; avoid a new navigation destination for every feature.
- Retain Flow's evergreen, sage, warm-white identity. Standardize spacing, type, status language, buttons, empty/loading/error states, focus, and saving feedback.
- Audit keyboard and screen-reader journeys, contrast, zoom, reduced motion, touch targets, long text, and narrow screens. Meaning must not depend on color alone.
- Add safe offline app-shell loading and an explicit offline/queued state. Existing on-device data is not proof that the app itself loads without a network.
- Review caching and device storage: do not indiscriminately cache authentication or bank responses; define sign-out cleanup, session/device controls, and behavior on a shared/lost device.
- Preserve unsaved work and navigation state. Test cross-device conflicts, reconnects, interrupted saves, restore, and late background updates while a form is open.
- Measure loading and interaction times on an ordinary phone with realistic history. Address the actual bottlenecks instead of rewriting the app by default.

**Acceptance:** supported desktop/phone/browser journeys work without clipped controls, lost edits, inaccessible dialogs, misleading online status, or unexplained recovery failures. A native app-store wrapper is a later distribution decision, not the definition of a complete app.

## 5. The service behind the app

Start this work while improving the product. It must be ready before inviting a paid wider audience.

### Trust, ownership, and support

- Decide who operates Flow and owns its provider, merchant, support, and domain accounts. Review access and recovery ownership before expanding beyond the private pilot.
- Provide a public support channel chosen by the owner; do not publish a personal email by assumption. Add helpful issue reporting and a bank-delay/status guide.
- Prepare truthful privacy, retention, deletion, subscription, cancellation, and refund information; obtain appropriate review before launch. Explain cloud/device copies and bank-provider access in plain language.
- Recommend an ad-free subscription model without selling transaction data. Adopt and enforce that policy before making it a public promise.
- Keep export, disconnect, deletion, cancellation, and help accessible even if a subscription lapses. Explain separate subscription cancellation and account deletion actions.

### Reliability and security

- Arrange an independent review of sign-in, user isolation, server functions, token handling, deletion, browser storage, and dependencies before a public paid launch. Automated checks alone do not replace this review.
- Test the bank lifecycle: link, initial/import delay, later updates, pending replacement, changed/removed records, account selection changes, expired access, reconnect, disconnect, duplicate connection, and failed deletion.
- Validate multiple institutions and supported account types before advertising coverage. Expand the single-user/single-Item pilot restriction deliberately with per-user limits and cost controls.
- Add privacy-conscious monitoring for failed webhooks/imports, stale connections, errors, mail delivery, and outages. Logs and support diagnostics must avoid tokens and raw transaction bodies.
- Establish separate development/test data, reviewed releases, safe schema migrations, rollback, incident response, dependency updates, and an actionable status/help route.
- Schedule protected server backups and prove a restore with test data. Include the records needed to restore bank connections and authentication, not only the visible Flow JSON export; handle secrets separately and securely.
- Set restore and incident-response targets the operator can actually meet, then test them. Do not advertise an uptime or recovery guarantee without evidence and capacity.

Supabase documents managed daily backups for paid plans and recommends off-site database exports for Free projects. A free recovery approach requires setup and a tested restore; device exports alone are insufficient for the whole service. No paid plan is selected by this roadmap. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups).

### Measurement without collecting everyone's finances

- Record minimal product events: setup completed, plan viewed, correction made, check-in completed, preview used, reconnect needed, cancellation reason.
- Measure duration/counts and optional survey answers; avoid sending balances, bank names, transaction descriptions, notes, or amounts into general analytics.
- Explain analytics and respect choices. Use consented, redacted examples for support and research.
- Pair usage with interviews. Opening the app often does not by itself show that it helps.

## 6. How we establish that it is worth paying for

These are provisional small-cohort decision gates, not industry benchmarks or proof of broad market demand. There are two release gates: service readiness before charging a small, informed paid-beta cohort; then observed usage, payment, and renewal evidence before expanding the paid launch.

| Question | Proposed initial evidence |
| --- | --- |
| Can someone start? | At least 4 of 5 observed target beginners complete the required setup without developer rescue. Record external bank delays separately. |
| Do they understand it? | At least 4 of 5 explain the headline, essentials reserve, payday boundary, and freshness correctly in their own words. |
| Does it remain accurate? | Supported synthetic cases pass; real-cycle comparisons have no unresolved critical money discrepancy, duplicate cash/spending, or silent data loss. |
| Is routine work small? | Measure a typical weekly decision session; aim for about two minutes and fewer corrections without hiding money-critical issues. |
| Do they return for value? | At least 3 of 5 activated participants use it unprompted for a concrete money decision during each of two complete pay cycles. Report weekly, biweekly, and monthly users separately. |
| Will they pay? | After the service is ready and pricing is disclosed, at least 3 independent target customers actually subscribe; observe a monthly renewal, cancellation reasons, and support burden. Friends' encouragement is not sufficient. |
| Can the service support them? | Reconnect, restore, deletion, cancellation, monitoring, and support have been exercised, with a named operator and affordable costs. |

Use demo/manual-data sessions for discovery first. Recruit real-bank beta participants only after the relevant access, privacy, operational, and budget gates are ready. Check actual remaining Trial capacity instead of assuming the owner's historic count remains valid. A small pilot gives directional evidence; expansion requires another cohort and continued monitoring.

If people understand Flow but do not return, improve recurring value. If they return but will not pay, investigate the audience, alternatives, and price. If costs exceed receipts, change the model before expanding. Adding more features is not the automatic answer to every failure.

## 7. Pricing and the cost constraint

**Recommendation to test:** one complete solo subscription, initially around **$7/month or $60/year**, with a synthetic demo and a clearly explained trial. These are price hypotheses, not approved prices, a profitability claim, or permission to start charging. Test a range and choose the offer only after reviewing costs and actual willingness to pay. Avoid lifetime bank-sync promises and an elaborate tier system at the beginning.

At $60/year, average gross subscription revenue is $5 per subscriber per month before taxes where applicable, payment fees, refunds, and operating costs. Annual cash receipts are not twelve months of profit on day one.

Build a cost sheet from actual provider terms:

| Cost | What we need to establish |
| --- | --- |
| Bank connectivity | Price per active Item/product, expected Items per customer, minimums, new-link/reconnect behavior, and any separately billed requests. |
| Hosting/database/authentication | Production capacity, email delivery, protected backups, restore needs, rate limits, and usage growth. |
| Payments | Processor terms, fixed/percentage fees, refunds, disputes, taxes, and failed-payment handling. |
| Service delivery | Monitoring, support time, security/operational review, and incident workload. |
| Acquisition | How much it costs to recruit a customer who stays; start with consented interviews and a small organic pilot. |

Monthly contribution per customer = net subscription receipts − bank/data costs − variable infrastructure/support costs. Fixed overhead still has to be funded. Estimate both ordinary usage and expensive multi-bank/support-heavy cases; do not assume unlimited connections can be included profitably.

Plaid's Trial has **10 lifetime Production Items**; removing one does not free a slot. An Item is a bank connection and may contain several accounts. Transactions uses recurring per-Item billing on paid arrangements; actual rates need the team's Dashboard or quote. This is a testing allowance, not a free public bank-sync business model. [Plaid billing documentation](https://plaid.com/docs/account/billing/), [Plaid pricing models](https://support.plaid.com/hc/en-us/articles/16194632655895-How-much-does-Plaid-cost-and-what-are-the-pricing-models).

**The owner's current no-spend constraint remains in effect.** Product improvements, synthetic demos, research planning, and existing-capacity tests can proceed within available limits. A wider bank-connected commercial launch waits for an explicitly approved sustainable operating budget. A manual/CSV-only offering is a separate proposition to test, not a quiet substitute for advertised automatic banks.

## 8. Build subscriptions only when the service is ready

- A clear feature/coverage page and demo show the actual product, supported countries/accounts, bank-data delays, plan price, trial end, and limits.
- A pricing test and a small waitlist use truthful claims and minimal data collection. No invented user counts, savings claims, scarcity, or unsupported bank coverage.
- Hosted checkout and account billing use a deliberately chosen processor. Entitlements are validated on the server, and payment webhooks are authenticated and idempotent.
- Test trial expiry, renewal, duplicate/out-of-order events, failed payments, a grace period, cancellation, refund, and subscription restoration across devices.
- Show monthly versus annual charges plainly, renewal timing, receipts, and easy self-service cancellation. A price change requires a clear communication policy.
- Define what happens to bank sync/costs after cancellation or expiry, while preserving export, disconnect, deletion, and account help. Do not silently erase a customer's history or hold data hostage.
- Launch to a capped cohort, monitor costs and failure/support rates, then expand in deliberate steps. Native-store billing and app-store releases remain separate work.

## 9. First paid release versus later expansion

### First paid solo offering

- A tested, explainable payday estimate and useful freshness/recovery states.
- A short setup, demo, dependable imports, conservative automation, and easy individual corrections.
- Purchase previews; confirmed bills, goals, and annual reserves that use the same money model.
- Supported everyday card use before marketing broadly to credit-card users; narrower cash-only paid beta only if clearly scoped and validated.
- Small check-ins, understandable changes, and optional useful reminders.
- Finished phone/desktop journeys, sign-in/sync, restore, security review, public help/contact, and fair subscription management.
- Affordable operating costs and repeat-use evidence before paid beta; actual payment and renewal evidence before expanding the paid launch.

### Later, when customer evidence supports them

- Couples/household sharing, joint accounts, and permissions.
- Rich variable-income planning, multiple earners, longer forecasts, and scenario comparisons.
- Deeper debt payoff tools, investment/net-worth tracking, multiple currencies/countries.
- Receipt capture, advanced search/reports, integrations, and an optional conversational assistant.
- Native app stores, widgets, wearable experiences, referrals, and partnerships.

Do not turn every later idea into a launch requirement. Maintain a backlog tied to observed problems, with the benefit, evidence, dependency, operating cost, and completion test written before implementation.

## 10. How we work through this

For each increment:

1. Write a short brief: the user problem, existing behavior, exact change, exclusions, and observable finish condition.
2. Review a working screen/prototype when the interaction changes materially. Use the actual design system and representative synthetic states.
3. Implement a small coherent change, preserving original bank facts, explicit user corrections, older backups, and cloud/device behavior.
4. Run meaningful tests for the risks introduced and check supported phone/desktop/accessibility journeys. Document limitations honestly.
5. Show the owner the result, test evidence, remaining limits, and the next increment. Ask before a new commit/publication under the standing preference.
6. After approval, verify the deployment and observe the customer outcome before moving on.

### The next concrete increment

**Start with “Understand and verify my payday money.”** Audit the current calculation and freshness states, specify a guided reconciliation flow, and test its language with beginners. Produce a short findings list and reviewable screens before changing the engine. This turns the existing headline into a stronger foundation for purchase previews, goals, cards, and paid trust.

No application code, live financial records, provider settings, subscriptions, or deployment is changed by this plan.

## Implementation update — 19 October 2026

The owner requested implementation of steps 1–8 after this planning document. Those tools are now built locally for review; [PRODUCT_TOOLS_RELEASE.md](PRODUCT_TOOLS_RELEASE.md) records behavior, tests, limits, and the required migration-before-publication order. The final statement above described the planning-only change, before implementation began. Real financial records and live settings have not been changed by this local build. Customer research, real-cycle validation, public service readiness, costs, pricing validation, and subscriptions remain separate pending work.

### Release approval — 19 October 2026

The owner approved committing and publishing the steps 1–8 build and applying its compatibility guard. Supabase reported success applying the guard before frontend publication. The earlier pending-review statements record the preparation stage. Remaining customer and operational validation gates are unchanged.
