# Flow build roadmap

Updated 19 October 2026. Previous published baseline: `main` at `db3e1f9`. Steps 1–8 are implemented in this release. The owner approved publication and the compatibility guard on 19 October 2026.

## Product direction

Help a beginner understand what they can spend until payday, what is spoken for, and what needs a decision, with little routine upkeep.

The detailed current plan is [Flow: plan for a product people choose to pay for](docs/PAID_PRODUCT_PLAN.md). It includes the existing feature audit, seven-app research, build specifications, acceptance criteria, customer validation, operating costs, and paid-launch requirements.

## Already built

- Responsive app shell, phone navigation, and installation metadata.
- Sign-in, private cloud/device copies, conflict handling, export, and an account deletion path.
- Private bank pilot, incremental imports, signed webhooks, automatic checks, reconnect/disconnect, and cash-account transfer matching.
- Supported bank categories, remembered rules, grouped review, individual payment edits, and manual/CSV import.
- Resumable setup, selected cash balances, payday estimates, confirmed bills, essentials/cushion reserves, and a payday check-in.

This release adds reconciliation, an isolated demo, custom categories, splits, reimbursement links, rule editing, purchase previews, change explanations, goals, variable bills, card repayment reserves, weekly check-ins, optional in-app reminders, and an offline app shell. See [the release review](docs/PRODUCT_TOOLS_RELEASE.md) for behavior, deployment order, tests, and limits.

Built does not mean validated for every customer, account type, institution, or failure. Card planning still needs real pay-cycle validation, and broader commercial readiness remains incomplete. The prior roadmap's Sandbox-only status and old Trial counts are historical.

## Work order

| Order | Increment | Finish condition |
| --- | --- | --- |
| 0 | Observe target beginners | Concrete findings about setup, understanding, and current alternatives. |
| 1 | Money accuracy, freshness, and reconciliation | Supported cases reconcile; the headline and uncertainty are understandable. |
| 2 | Better setup and an isolated demo | First useful plan without compulsory historical categorization. |
| 3 | Automation and exceptions | Custom categories, splits, reimbursements, and clear rule management preserve bank facts and corrections. |
| 4 | Purchase preview and change explanations | A useful spending decision uses the shared money model without changing real records. |
| 5 | Bills, goals, and annual expenses | Reservations remain understandable and counted once across pay cycles. |
| 6 | Everyday credit cards | Purchases, repayment reserves, debt, payments, and refunds reconcile. |
| 7 | Brief check-ins and useful reminders | Small routine effort; optional relevant notifications. |
| 8 | App quality and recovery | Accessible, responsive, recoverable supported journeys. |
| 9 | External beta through pay cycles | Repeat use, money accuracy, and a manageable support workload. |
| 10 | Sustainable subscription launch | Real willingness to pay, support/operational readiness, and verified costs. |

Customer research and operational readiness start alongside product work. Credit-card work moves earlier if needed for the initial cohort. Broad public bank connections and paid services require separate approval; the owner's no-spend constraint remains active.

## Release and next increment

**Use the working steps 1–8 build:** review its isolated demo, money breakdown, purchase preview, Plan tools, and Account recovery settings. The owner approved publication and the database compatibility guard; Supabase reported success applying the guard before frontend publication. Building the features did not use or alter real financial records.

After release review, observe target beginners and complete private pay-cycle comparisons. Steps 0 and 9, independent security/operational review, support ownership, commercial costs, and subscription work remain open. Automated tests do not complete those gates.

Work one increment at a time. Review the finished result and meaningful test evidence; ask before each new commit/publication under the owner's standing preference.

## Supporting records

- [Detailed paid product plan](docs/PAID_PRODUCT_PLAN.md) — current product direction and proposed gates.
- [Beginner experience plan](docs/BEGINNER_EXPERIENCE_PLAN.md) — historical design brief and dated implementation records.
- [Design research](docs/DESIGN_RESEARCH.md) — earlier interface comparison.
- [Production readiness](docs/production-readiness.md) — earlier pilot checklist; settings and counts require a fresh audit before a wider release.
