# Flow interface research

Researched 18 October 2026. This is a design synthesis from official product pages and help documentation, not a claim that each app has been independently usability tested.

| App and primary source | Useful pattern | Flow's interpretation |
| --- | --- | --- |
| [Copilot](https://help.copilot.money/en/articles/6045480-dashboard-tab-overview) | A dashboard connects spending, categories, and transactions to review. | A focused monthly spending panel, a short next-step area, and recent activity. |
| [Monarch](https://help.monarch.com/hc/en-us/articles/32125337244052-Using-Flex-Budgeting) | High-level budgeting helps people understand a plan without inspecting every category. | A clear plan summary and progress ring, then category detail. Flow retains its own category-limit model. |
| [YNAB](https://support.ynab.com/how-to-use-targets-rk5kkI9ks) | Targets make category progress actionable. | Plain-language category limits and remaining amounts, with editing in a focused dialog. |
| [Quicken Simplifi](https://www.quicken.com/features/manage-your-budget) | A monthly spending plan puts attention on what remains. | Remaining category limits stay visible, with an explicit explanation of what the figure represents. |
| [Rocket Money](https://www.rocketmoney.com/feature/create-a-budget) | Category tracking and historical patterns support budget setup. | Spending breakdown and category cards close to the plan. |
| [PocketGuard](https://pocketguard.com/) | A quick financial overview reduces the amount a user has to interpret. | One monthly spending headline, with income and income after spending beside it. |
| [Goodbudget](https://goodbudget.com/what-you-get/) | Giving money a purpose is more understandable than simply logging it. | A dedicated Plan tab and friendly first-category empty state. |
| [Lunch Money](https://lunchmoney.app/) | Transaction organization and budgeting belong in a coherent workspace. | A compact Activity screen with fast type filters, search, and optional detail. |
| [PocketSmith](https://www.pocketsmith.com/features/) | Time and category context help explain the data. | One explicit selected month and a weekly spending chart. |
| [Spendee](https://help.spendee.com/article/131-budget-my-money) | Budget progress and reaching limits are meaningful states. | Each category card clearly says Within limit or Over limit and shows its remaining amount. |
| [Emma](https://help.emma-app.com/en/category/analytics-155lckn/) | Spending, income, and budget history need clear time context. | Overview income and net now use the same selected month as spending, with monthly labels. |
| [Actual Budget](https://actualbudget.org/docs/getting-started/tracking-budget/) | Tracking and planning can coexist without forcing one budgeting method. | Keep Flow's existing transaction model, category limits, import, and bank sync. |

## Flow's own design

Evergreen, soft sage, warm white, a compact italic wordmark, a simple flow mark, restrained line icons, and spacious numeric typography. The interface uses five consistent destinations: Overview, Activity, Plan, Review, Account. Desktop uses a permanent sidebar; phones use a five-tab bottom bar.

Review emphasizes repeated-name groups and explicit choices. Likely transfers still need confirmation. Transfer selections disable the irrelevant category control. Secondary rule and recurring-payment sections are disclosures, so they do not compete with the primary task.

Settings, backups, and restore live in Account. Search is available throughout the app, including a keyboard shortcut. A manifest and app icons support opening Flow in its own installed window. The interface does not imply that an unspent category limit is a bank balance or a guaranteed safe-to-spend amount.

## Scope

This change presents existing Flow features. It does not add forecasting, AI categorization, automatic money movement, paid services, additional bank products, or financial promises from other apps. No real bank transactions are used in the local visual preview. Visual checks use synthetic data in a separate local browser context.

## Validation

All 65 existing data, sync, import, backup, and Plaid checks pass. Browser checks use an isolated local context with synthetic data, with all external APIs blocked. All seven screens were checked at 1440, 1024, 768, 390, and 320 pixels. Tested search, type filtering, budget creation and editing, grouped transfer confirmation, install help, backup access, and empty states. No page overflow or JavaScript errors in the final layout run.

Install instructions were checked against [Chrome Help](https://support.google.com/chrome/answer/9658361) and [Apple’s iPhone web-app guide](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios). The manifest enables an installed window; this change does not add an offline cache.
