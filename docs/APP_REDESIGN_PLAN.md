# Flow app redesign plan

Prepared 20 October 2026. Source baseline: `68a437f` and the existing Flow interface. Status: interactive mockups approved. App shell and Home (stage C) are implemented locally for review; the remaining screen stages and publication are pending. See [stage C review](APP_SHELL_HOME_REVIEW.md).

## 1. The experience we are designing

A beginner opens Flow, understands the money available through their next payday, and takes one clear next action. Most visits should be short. Detail should be easy to reach when it helps a decision.

The overhaul covers navigation, visual hierarchy, layout, wording, setup, review, sheets, and purposeful motion. The existing payday engine, original bank facts, private pilot limits, backups, and user choices remain the foundation. A different layout must show the same supported money result.

**Recommended direction:** a compact, tactile Flow with four main tabs, a recognizable payday path, short guided tasks, and details that open where they are needed.

## 2. Rocket Money research: evidence and interpretation

Research used Rocket Money's official help guides, its public product imagery, and the publisher's App Store previews. No private Rocket Money account was created or connected. Screens shown in marketing assets are illustrative; one budgeting image itself displays September 2024. These observations do not establish the exact layout of every current app version or prove a usability outcome.

| Observed pattern | Source | Proposed use in Flow |
| --- | --- | --- |
| Budget setup is divided into income, bills, and category-budget steps, with transaction evidence available behind estimates. | [Creating a Budget](https://help.rocketmoney.com/en/articles/2649810-creating-a-budget) | One concrete question per setup screen; suggestions are editable and their basis is available on demand. |
| Recurring bills have Upcoming, All, and Calendar views; selecting a bill leads to its details. | [Bill views](https://help.rocketmoney.com/en/articles/3117398-where-can-i-view-my-subscriptions-and-bills), [Managing bills](https://help.rocketmoney.com/en/articles/2185531-managing-your-bills-and-subscriptions) | A dedicated Bills destination with date context and tappable rows, instead of several bill sections inside Plan. |
| Category Review presents ten recent payments as individual cards, using swipes to confirm or change a category. | [Transaction Category Review](https://help.rocketmoney.com/en/articles/13778317-transaction-category-review) | A short review deck with explicit buttons, optional swipes, progress, skip, and undo. Grouped changes remain available for genuinely matching payments. |
| Transaction splitting starts from an individual payment. | [How to split transactions](https://help.rocketmoney.com/en/articles/4363893-how-to-split-transactions) | Category, note, split, and reimbursement controls stay attached to the payment being edited. |
| Payday View already calculates a spending figure through the next paycheck. Its documented setup depends on detected payroll and a qualifying checking account. | [Enabling Payday View](https://help.rocketmoney.com/en/articles/6235627-enabling-payday-view) | Flow's distinction will be the clarity and ease of its routine, including manual confirmation and transparent set-asides. The payday concept itself is not unique to Flow. |
| The official budget image gives the main spending figure priority, then shows smaller bill/earnings summaries and compact category rows. Current App Store previews include a dedicated Recurring screen with date context. | [Budget product page](https://www.rocketmoney.com/feature/create-a-budget), [Publisher previews](https://apps.apple.com/us/app/rocket-money-bills-budgets/id1130616675) | A strong numeric hierarchy and compact lists. Flow keeps its own forest/sage identity, payday path, and interaction design. |

The proposed Flow choices below are our design judgments, to validate with beginners. They are not claims that Rocket Money implements those exact choices.

## 3. What is making Flow feel busy today

The current source shows several features accumulating on the same screen:

- Home has a large introductory heading, the payday panel, upcoming bills, a separate money-explanation/tools block, attention cards, recent transactions, and category spending. Some explanations repeat.
- Plan repeats the payday total, then shows payday editing, upcoming bills, bill management, bill suggestions, essentials, cushion, spending accounts, goals, cards, and organization tools.
- Review and Account are permanent navigation destinations even though many visits need neither. Bills are buried within Plan.
- Repeated generic labels such as Edit, Manage, Check, and Open require users to infer what happens next.
- New tools have focused dialogs, but their entry points compete with other buttons. Some tasks can open another dialog over an existing one.

The redesign should organize these existing capabilities into a smaller number of visible decisions, with a reliable route to every deeper tool.

## 4. The new map of the app

### Four main destinations

| Tab | Main question | Primary content/action |
| --- | --- | --- |
| Home | What can I spend before payday? | Payday amount, source/status, one next step, purchase preview. |
| Activity | What happened to my money? | Searchable transactions, compact filters, individual details and corrections. |
| Plan | What am I keeping money for? | Essentials, cushion, goals, card repayment money, optional category limits. |
| Bills | What is coming out, and when? | Upcoming bills, dates/calendar, confirmed schedules, payment checks and suggestions. |

A consistently visible profile control opens **Account & banks**: sign-in, connected banks, sync details, preferences, help, exports/restore, and privacy actions. Its accessible name is explicit. A bank connection problem is also surfaced on Home.

Review becomes **Quick check**, entered from Home when relevant and from Activity's Needs review filter. Previously categorized payments remain editable. Account and Review URLs remain usable through a visible page or route into the new location.

On phones, the same four labeled tabs stay fixed above the safe area. On desktop, a compact sidebar uses the same names and order. Desktop can place the selected detail beside a list; phone opens that detail as a sheet or dedicated task screen.

### Clear routes for current tools

| Existing capability | New entry point |
| --- | --- |
| Purchase preview | Home → Can I spend this? |
| Money reconciliation/unreflected purchases | Home status → Check available money; Plan → Money source/details |
| Payday date and rollover | Home payday date; contextual Start new plan action when due |
| Bills, variable amounts, paid parts, skips | Bills → select a bill → relevant action |
| Goals and annual funds | Plan → Goals → select/add a goal |
| Credit-card reserve and repayment matching | Plan → Cards → select a card |
| Custom categories and remembered choices | Activity → Organize; linked from payment detail |
| Optional monthly limits | Plan → Essentials → Monthly category limits |
| Weekly check-in | Home next-step area when due; Account → Routines for manual access |
| Cloud/device backups, bank connections, sign-out/deletion | Account & banks |

## 5. Home: a clear answer and next action

### Screen order

1. Compact Flow header with Account & banks access.
2. A visible money-critical notice when one exists: stale/unknown balance, reconnect, missing card plan, overdue planning horizon, or shortfall.
3. Main amount: **Estimated left until payday**, with the actual date and a compact source/status control.
4. **Can I spend this?** as the main everyday button. If the estimate cannot be completed, the main button becomes the specific recovery action instead.
5. The Flow payday path: **Today → next bill/date → Payday**. It shows timing; it does not imply a bank transfer or a precise predicted balance. An All bills link reaches the complete list.
6. At most one next-step block, such as Check a bill, Review 3 payments, or Start your new plan. Additional tasks remain reachable through See all tasks.
7. One secondary carousel for supported summaries, then up to three recent transactions and See activity.

The main amount, next payday, important uncertainty, and recovery action are always visible without swiping a carousel. If information is unavailable, the interface says what is needed instead of displaying a confident-looking placeholder.

The carousel may show Spending this week, Goal progress, and What changed, only when the existing data supports the summary. Empty states get a useful action. Financial comparisons use real saved periods and explain their dates; no invented savings or trend claims.

Routine success such as Saved or a completed check becomes quiet status. Detailed breakdowns, account timestamps, and longer explanations open from the relevant amount/status control.

## 6. Activity: obvious rows and quick corrections

- A search field, a compact period control, and All / Spending / Income / Transfers / Needs review filters.
- Transactions grouped by date. Merchant/name, category, account when useful, pending state, and signed amount are readable at a glance.
- The whole row opens its details and has a clear affordance. The category chip can offer a direct category picker; these remain distinct keyboard controls.
- Detail begins with amount, merchant, date, account, status, and category. Notes, split, reimbursement link, and type correction follow as relevant actions.
- An explicit Add transaction button opens the manual form. Import and category/rule organization sit in a labeled menu.
- Selecting a payment preserves the list's filters, scroll position, and return focus. On desktop it can use a side panel; on a phone it uses the shared detail sheet.
- Venmo and similar names stay individually editable. A category correction does not automatically create a rule. Remember for future matches is a separate choice with an affected-record preview.

## 7. Plan: money with a purpose

A short summary shows how money is divided. Supporting detail uses three internal sections: **Essentials**, **Goals**, and **Cards**.

### Essentials

Show remaining amounts for everyday needs and the chosen cushion. Tap an item to edit it. Optional monthly category limits are clearly separate from funded set-asides and do not become a second cash reserve. Spending-account/source settings remain reachable through a labeled link.

### Goals

A compact horizontal set of goal cards shows progress, target/date, and Add to goal. Add goal remains visible when there are no goals. A View all goals list provides an equally useful alternative to swiping. A goal's detail explains whether its money is inside the selected spending pool or outside it, and whether it funds a bill.

### Cards

Each imported card shows the repayment money reserved and its chosen policy. Tapping it opens repayment settings, confirmation status, and matched payments. A required missing confirmation is visible in the Plan summary and Home status. It cannot disappear onto an unselected carousel slide.

**Flow's visual identity:** the payday path and simple money pockets connect this screen to Home. Pockets are virtual plan set-asides, with one clear explanation in detail; no interface implies Flow moved money between bank accounts.

## 8. Bills: a dedicated upcoming view

- Upcoming / All controls and a calendar toggle.
- A compact date strip or calendar, with a chronological list as the default working view. The full bill list remains available without swiping dates.
- Due today/soon and overdue checks remain easy to find. Each row shows name, amount, due date, and meaningful status such as Upcoming, Payment found, or Needs a check.
- Tap a bill for its amount/schedule and payment details. Relevant actions include Confirm payment, Record paid part, Change this occurrence, and Edit schedule.
- Suggested subscriptions/bills appear as a clearly labeled set awaiting confirmation. They become commitments only when the user accepts them.
- One clear Add bill button. Skipping a reserve is explicitly different from confirming a payment or canceling a subscription.

The default home preview is brief; the Bills tab owns the complete calendar and management experience.

## 9. Carousels, guided screens, and popups

Use these interaction types for specific jobs:

| Interaction | Where it belongs | Required controls |
| --- | --- | --- |
| Guided screen sequence | Initial setup, payday check-in, checking available money | Visible steps, Back, Continue, saved progress, clear finish action. |
| One-card review deck | A short set of current review decisions | Looks right, Change, Not sure, Undo, progress, Done for now; optional swipe equivalents. |
| Summary carousel | Noncritical Home summaries and Plan goal cards | Visible next-card hint, named page controls/count, keyboard support, View all. |
| Bottom sheet on phone | Purchase preview, category picker, bill/goal/transaction detail | Clear title, Close/Back, one relevant primary action, accessible focus and scrolling. |
| Side panel or focused dialog on desktop | Same short detail/edit tasks | Consistent controls and preserved list context. |
| Full task screen | Longer setup/reconciliation or complex splits | Stable back navigation, validation, explicit save/finish, recoverable drafts. |
| Confirmation popup | A consequential batch/type/delete action | Concrete impact, affected count where applicable, Cancel and specific confirmation verb. |

Carousels advance when the user chooses. Swipes always have button alternatives. Important actions and uncertainties are never available only on a later slide. No auto-opening review deck on every visit, no simultaneous dialog stack, and no surprise page reload during editing. A reusable sheet changes its content or navigates to a task screen instead of opening a second modal above itself.

[W3C's carousel guidance](https://www.w3.org/WAI/tutorials/carousels/) emphasizes keyboard access, understandable changes/focus, and user control, and notes discoverability concerns. Flow's proposed manual behavior follows those needs.

### Quick check details

Start with decisions affecting the money estimate, then offer optional categorization separately. The user can choose a short current batch and stop anytime. A visible count describes this batch rather than turning all historical Other transactions into a compulsory chore.

Repeated-name grouping stays available with dates, amounts, and View payments. Mixed-purpose names get an obvious Review separately choice. Confirming one Venmo payment never categorizes all Venmo payments by default. Transfer ownership and card repayments keep their existing explicit checks. Applied group operations show their scope and offer supported undo.

## 10. A setup guide that does useful work

Group the current setup choices into four understandable stages:

1. **Your spending money** — select included cash accounts or enter a confirmed amount; demo remains accessible.
2. **Your next payday** — confirm the date and schedule; manual entry remains available.
3. **Bills before then** — confirm likely bills or add known obligations; historical categorization can wait.
4. **Keep some aside** — essentials, cushion, optional goal, then a simple breakdown and finish.

An imported card that needs a repayment decision gets a clearly named conditional step and updated progress count before a complete estimate. Each stage preserves the underlying existing choices and can resume after leaving the app. A returning user reaches current data and relevant changes directly.

The short first-use explanation lives beside the action it explains. Optional help remains available later.

## 11. Visual system and obvious clicks

- Preserve Flow's wordmark and green identity. Use a clean ivory canvas, forest ink, and restrained mint/sage selection surfaces. Amber marks a useful caution; color is always paired with text/icon meaning.
- Make the payday amount the dominant element. Use crisp interface typography, readable figures, and compact functional headings. Retain the wordmark's character without using large editorial slogans throughout the app.
- Use consistent list rows, small purposeful surfaces, predictable spacing, and fewer bordered boxes. Remove repeated eyebrow headings and duplicate explanations.
- Make button hierarchy consistent: one main action, quieter secondary actions, and specific verb labels such as Add bill, Change category, Edit goal, and Review payment.
- Use chevrons for row navigation, explicit button styling for actions, and clear selected-tab states. Essential actions work without hover.
- Aim for at least 44px touch targets, 16px editable phone inputs, readable contrast, and layouts down to 320px. Test enlarged text and the software keyboard.
- Motion explains movement: a sheet opens from the task, a review card advances, and a number changes only after a real input/data change. Short transitions respect reduced-motion preferences. Do not animate numbers in a way that suggests a balance changed when it did not.
- Keep offline, saving/conflict, stale-data, and bank-delay states useful and compact. Details remain available; uncertainty affecting the estimate stays visible.

## 12. Copy and information cleanup

| Current pattern | Proposed wording/location |
| --- | --- |
| Large introductory slogan on each view | Short screen title; the amount or task leads. |
| Repeated explanation of essentials | One concise label plus the amount's breakdown. |
| Long account freshness paragraph on Home | Compact accurate status; tap for timestamps and source. |
| Several Manage/Edit links | Specific action or a visibly tappable named row. |
| Bills before payday plus separate bill-management sections | Brief Home preview and one dedicated Bills view. |
| Permanent large review inbox | Contextual Quick check, with optional history filters. |
| Large block of organization tools on Plan | Activity → Organize, with links from relevant details. |
| Repeated Saved text blocks | Quiet saved status; expanded guidance on failure/conflict. |

Use “Estimated left until payday” as the main label. A shortfall, unverified balance, pending item, or excluded account is explained plainly. “Checked for updates” is distinct from the bank's balance date; a recent check never implies a newly reported transaction or a live bank balance.

## 13. Build order and reviewable deliverables

| Stage | Deliverable | Completion check |
| --- | --- | --- |
| A. Screen map and design direction | This plan, source notes, content inventory, and main navigation decision. | Every existing capability has a clear destination. |
| B. Clickable mockups | All four tabs, Account, setup, review deck, purchase/category/bill/goal/transaction sheets; phone and desktop; synthetic ready/empty/error states. | Every visible action works as a prototype or is explicitly identified as proposed. Review before application implementation. |
| C. App shell and Home | Shared navigation, page hierarchy, obvious controls, Home amount/status/path and one carousel. | Main amount and recovery remain discoverable; deeper tools are reachable. |
| D. Activity and review | Compact transaction list, consistent detail sheet, short review deck, grouping/individual choice. | Venmo can vary; personal corrections and original bank facts survive. |
| E. Plan and Bills | Focused Plan sections, goal cards/list, dedicated bill dates/list/details. | Reserves are counted exactly as before; each payment/goal/card task works. |
| F. Guided tasks and polish | Setup/payday/check-in navigation, shared sheets, drafts/back behavior, motion, accessibility, empty/stale/offline/error states. | Users can leave/return without losing confirmed choices or edits. |
| G. Verification and release review | Data parity, desktop/phone/keyboard checks, warm-cache/offline checks, and owner walkthrough. | Review concrete results before a new commit/publication under the standing preference. |

Implementation should reuse the existing shared money/data functions. Most changes belong in the shell, view rendering, CSS, navigation, and presentation controllers. Add state for UI preferences only when necessary. Any change to stored money decisions, cloud compatibility, or the financial calculation is a separately specified change with its own tests.

Avoid a framework migration as a prerequisite. Stable deep links, browser Back behavior, scroll/focus restoration, and reliable cached updates should work with the current static hosting and existing app structure.

## 14. How we decide it is easier

These are proposed tests and targets, not results already measured:

- In an observed beginner test, at least 4 of 5 users identify what the main amount means and the next payday without explanation.
- At least 4 of 5 find a transaction, change a single Venmo category, locate a bill, and explain the purchase preview without developer help.
- Common tasks begin within two taps from a relevant main tab; account recovery/export remains findable from the persistent profile control.
- Routine current review is time-boxed and easy to stop. Measure its duration and correction count; do not hide a money-critical issue to hit a time target.
- Ready, stale, incomplete, negative, pending, disconnected, manual, and card-plan states show accurate language and useful actions.
- Existing 178 automated checks remain the baseline; add behavior tests for the new navigation/sheet/deck paths and any actual data risk. Test visual layouts at 320/390/768/1440 widths, enlarged text, keyboard/screen-reader navigation, and reduced motion.
- Verify demo isolation, warm browser caches, service-worker updates, offline edits, conflict/restore paths, and old deep links. No blank buttons, accidental bulk changes, nested focus traps, or lost drafts.
- Compare each supported money fixture before/after the presentation overhaul. Equal inputs must produce equal results unless a separately reviewed calculation fix explicitly changes them.

**Next deliverable:** clickable mockups showing the complete proposed flow, starting with Home, the four-tab shell, and the purchase-preview sheet. Use synthetic money and the approved Flow capabilities so the review demonstrates a buildable interface.
