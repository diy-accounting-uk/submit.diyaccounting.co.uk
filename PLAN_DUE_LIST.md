<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: the due list

A signed-in user sees one list of every filing and payment that their businesses owe, from every source, sorted by due date. Each row says where it came from and when that source was last read. The user can get an email before each due date and when a watched company files, and can subscribe to the list in a calendar. A new user enters a company number, or signs in to HMRC, and sees at once what is due and what Submit can file. Facts checked 2026-11-22.

**Status**: reviewed in three rounds; decisions answered by the operator on 2026-11-22. 13 machine tasks (DUE2 to DUE14) and 1 human task (ODUE2), all boarded on `NEXT.md`. Briefs are section 9.

## Operator assertions (verbatim)

From the board row that asked for this plan, operator, 2026-11-22:

> The list aggregates sources and is agnostic of them: one row per filing due, sorted by due date with the soonest first and a marker line between overdue and due; filters by business (each company and sole trader the account files for, and each watched company of WL1), by source (Companies House, HMRC, and any other source the plan finds, for example the ICO data protection fee), and by type (taxes, accounts, people, shareholders). For each filing type (VAT returns, Income Tax quarterly updates and the final declaration, the CT600 and its payment date, accounts, the confirmation statement, PSC and officer changes, and any other the plan finds), the plan answers: the source and its interface; whether it can be read headless (Companies House public data with our API key) or only with the user present (HMRC obligations read with the user's HMRC grant; check what HMRC's terms and the fraud prevention headers allow for a call with no user present, and whether a refresh token may be used for one); how often to read it and what each read costs (calls, rate limits, money); what can be computed instead of read (a CT600 due date from the accounting period); how the row shows when its source was last read; and when and how it warns that the row is stale. The plan also covers: (a) alerts: an email before each due date and when a watched company files something (Companies House's streaming API, or the filing history read on a schedule), what each costs in calls, the account setting that turns each on, and the line the privacy policy (`web/public/privacy.html`, whose service emails today are subscription details, receipts and pass links) needs for reminders; Companies House already lets anyone follow a company and get free email alerts when it files, so the plan states what ours adds; (b) a calendar feed: the due list as an `.ics` subscription for Google, Outlook and Apple calendars, with a secret per-account address that the account can reset, and what it holds (no personal data beyond the filing and the business name); (c) payment dates beside filing dates (VAT, Corporation Tax, Self Assessment); (d) a first-use path: one page where a new user enters a company number, or signs in to HMRC, and sees at once what is due and what Submit can file, with the next step for each. It names the bundle that sees the list, the storage (none of an HMRC answer beyond what the page shows unless the plan justifies it), the page, and one task per source and per shared part with its brief, model and size. Builds on WL1, CL4 (filings due on the company drill-down) and the obligations pages that exist for VAT and Income Tax.

## Goals

1. One list of every filing and payment due for the account's businesses, soonest first, with a marker line between overdue and due, and filters by business, source and type.
2. Every row names its source and the time that source was last read, and warns when that read is stale.
3. An email before each due date, and an email when a watched company files, each turned on by its own account setting.
4. A calendar feed of the list at a secret address that the account can reset.
5. Payment dates beside filing dates for VAT, Corporation Tax and Self Assessment.
6. A first-use path: a company number or an HMRC sign-in shows what is due and what Submit can file, with the next step for each.

## Rules of this plan

- **The list is agnostic of its sources.** Every source writes the same row shape (section 5.1). The page, the emails and the feed read rows only, never a source.
- **Every date is read, computed from a sourced rule, or entered by the user, and the row says which.** A computed date names its rule; each rule is a fact in `.claude/skills/tax-sources/sources` with its gov.uk quote.
- **Companies House is read headless; HMRC is read only with the user present** (decision D1, section 8). The scheduled jobs call Companies House and never call HMRC.
- **No row holds an HMRC identifier or amount.** A row holds the business name, the filing type, the period dates, the due date, the source and the read time. It holds no VRN, NINO, period key or money figure.
- **No job scans a customer table.** Each scheduled job reads the table's one global secondary index with a Query.
- **The due list adds no filing.** It links to the forms that exist. A row whose filing Submit does not offer in the environment links to the government service instead.

## 1. Where it stands

### 1.1 HMRC reads that exist

| Read | Lambda | HMRC path | Page |
| --- | --- | --- | --- |
| VAT obligations | `app/functions/hmrc/hmrcVatObligationGet.js` | `/organisations/vat/${vrn}/obligations` (line 449) | `web/public/hmrc/vat/vatObligations.html` |
| VAT liabilities (payment due) | `app/functions/hmrc/hmrcVatLiabilitiesGet.js` | `/organisations/vat/${vrn}/liabilities` (line 418) | `web/public/hmrc/vat/vatLiabilities.page.js` (`liability.due`, line 354) |
| Income Tax quarterly obligations | `app/functions/hmrc/hmrcItsaObligationsGet.js` | `/obligations/details/${nino}/income-and-expenditure` (line 465) | `web/public/hmrc/itsa/obligations.html` |
| Income Tax final declaration obligation | `app/functions/hmrc/hmrcItsaCrystallisationObligationsGet.js` | `/obligations/details/${nino}/crystallisation` (line 427) | the Income Tax dashboard |

- `formatObligationForDisplay` in `app/lib/obligationFormatter.js` (lines 31 to 48) gives `dueDate`, `status` (`O` open, `F` fulfilled) and `receivedDate`, and hides the period key.
- The VAT obligations route defaults `from` to 1 January of this year and `to` to today when the caller sends neither (`hmrcVatObligationGet.js` lines 83 to 89).
- The activity `vat-obligations` is in the bundles `day-guest`, `week-guest`, `invited-guest`, `resident-vat` and `resident-guest`, on every environment (`web/public/submit.catalogue.toml` lines 360 to 368). `day-guest` is free and self-service.
- The activity `self-employed-read` (Income Tax reads) is in `resident-pro` only and lists no `prod` (catalogue lines 447 to 456).
- The page keeps the VRN and the NINO in `sessionStorage` only (`web/public/lib/carried-identifiers.js` lines 20 to 30). The server keeps them only on a practice's client rows (`createClient` in `app/data/dynamoDbPracticeClientRepository.js` line 101).

### 1.2 The HMRC grant

- A browser HMRC sign-in writes a grant item that `POST /api/v1/hmrc/token` (`app/functions/hmrc/hmrcTokenPost.js`) seals with AES-256-GCM. The grant id rides in `sessionStorage` (`hmrcGrantId`, `vatObligations.page.js` line 66).
- A granted item lives 24 hours (`GRANTED_LIFETIME = { hours: 24 }`, `app/data/dynamoDbHmrcGrantRepository.js` line 17).
- `app/lib/mcpHmrcGrantAccess.js` refreshes the access token when it is within 30 minutes of expiry (`REFRESH_MARGIN_SECONDS = 1800`, line 20), one caller at a time.
- The MCP tools reach the same grant through `hmrcGrantFor` in `mcp/lib/submit-tools.js` (line 167).
- `buildFraudHeaders` in `app/lib/buildFraudHeaders.js` sends `WEB_APP_VIA_SERVER` for the browser, `DESKTOP_APP_VIA_SERVER` for the stdio MCP and `OTHER_VIA_SERVER` for the hosted MCP (lines 127 and 133). No code sends `BATCH_PROCESS_DIRECT`.

### 1.3 Companies House reads that exist

- `getCompanyProfile` in `app/functions/companies-house/companiesHouseCompanyGet.js` (line 134) answers `accountsNextDue`, `accountsNextPeriodEnd`, `confirmationStatementNextDue` and `confirmationStatementNextMadeUpTo` (lines 153 to 156). It is on `company-lookup`, bundle `default`, on prod (catalogue lines 520 to 528).
- `GET /api/v1/public/company-deadlines` (`companiesHousePublicDeadlinesGet.js`) answers the same dates with no sign-in. CloudFront keeps a found answer ten minutes (`FOUND_CACHE_SECONDS = 600`, line 41; `publicDeadlinesCachePolicy` in `EdgeStack.java` line 755). `web/public/company-filing-deadlines.html` uses it.
- `httpResponseFromCompaniesHouseResponse` in `app/services/companiesHouseApi.js` turns a 429 into the lookup's own rate-limit answer (line 147).
- CL1 adds the filing history route, and AA29 adds the accounts dates to the profile route. WL1 adds the watch list as an account setting, capped at about 50 company numbers.

### 1.4 Account settings, emails and the privacy page

- Settings are booleans with a default (`ACCOUNT_SETTING_DEFAULTS = { passGeneration: true }`, `app/lib/accountSettings.js` line 7). They live in one item of the bundles table (`ACCOUNT_SETTINGS_ITEM_ID = "#account-settings"`, `app/data/dynamoDbBundleRepository.js` line 34), read by `getAccountSettings` (line 576). `PUT /api/v1/account/settings` writes them (`accountSettingsPut.js`).
- `buildCustomerEmail` in `app/lib/customerEmailTemplates.js` (line 269) has four kinds: `subscription-started`, `submission-receipt`, `pass-generated`, `pass-redeemed`. `requestCustomerEmail` (`app/lib/customerEmailRequest.js`) puts the request on the activity bus. The worker finds the address from the raw sub with Cognito `ListUsers` (`findAddress`, `app/functions/email/customerEmailSend.js` line 34).
- `web/public/privacy.html` lists service emails as "the details of a subscription, a copy of a filing receipt, and the link and QR code of a pass" (lines 487 to 489) and the lawful-basis row "Service emails (subscription, receipt copy, pass)" (line 929).

### 1.5 Sourced dates that exist

`scripts/build-mtd-calendar.mjs` holds `QUARTERLY_FACT` (line 78), `FINAL_DECLARATION_FACT` (line 92) and `COMPANY_YEARLY_FACTS` (line 98), each tied to a source file:

| Fact id | Rule |
| --- | --- |
| `vat-return-due-date` | one calendar month and 7 days after the period ends |
| `itsa-quarterly-update-deadlines` | 7 August, 7 November, 7 February, 7 May |
| `itsa-final-declaration-deadline` | 31 January after the tax year |
| `ch-accounts-9-months` | 9 months after the financial year ends |
| `ch-confirmation-statement-12-months` | at least one every 12 months |
| `ct600-12-months` | 12 months after the accounting period |
| `ct-payment-9-months-1-day` | 9 months and 1 day after the accounting period |
| `ch-identity-verification-2025-11` | the personal code goes on the next confirmation statement |

No source file holds the Self Assessment payment dates, the 14-day rule for officer and PSC changes, the VAT payment rule or the ICO fee.

### 1.6 Patterns to reuse

- Scheduled Lambdas: `bundleCapacityReconcile` (hourly) and `commissionRelease` (daily) in `infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java` (lines 1947 and 1996).
- Tables: `ensureTable` in `DataStack.java` (for example `practiceClientsTable`, line 1173). A table keyed by a hashed sub joins `scripts/salt-rotation-tables.json`, which `SaltRotationTablesTest.java` checks.
- Retention: `app/lib/recordRetention.js`.
- Server code imports shared browser modules from `web/public/lib` (for example `app/services/productCatalog.js` line 18).

## 2. Outside facts

| Fact | Source |
| --- | --- |
| HMRC access token lasts 4 hours; "After 18 months, refresh tokens stop working"; "You can only use a `refresh_token` once" | https://developer.service.hmrc.gov.uk/api-documentation/docs/authorisation/user-restricted-endpoints |
| HMRC connection method "Batch process direct": "You must only select batch process direct as a connection method when your users do not initiate an action" | https://developer.service.hmrc.gov.uk/guides/fraud-prevention/connection-method/ |
| HMRC: "Our standard limit is 3 requests per second per application"; over it, HTTP 429 | https://developer.service.hmrc.gov.uk/api-documentation/docs/reference-guide |
| HMRC terms: "You must encrypt access tokens and personally identifiable data when it is stored and in transit." The terms say nothing on calls with no user present, polling or caching | https://developer.service.hmrc.gov.uk/api-documentation/docs/terms-of-use |
| Companies House: "You can make up to 600 requests within a 5 minute period"; it may ban applications that regularly exceed the limit; a higher limit is by request | https://developer.company-information.service.gov.uk/developer-guidelines |
| Companies House profile fields: `accounts.next_accounts.{due_on, overdue, period_start_on, period_end_on}`, `accounts.accounting_reference_date`, `confirmation_statement.{next_due, next_made_up_to, overdue, last_made_up_to}` | https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/resources/companyprofile |
| Companies House streaming API: streams for company information, filing history, officers, PSC, charges, insolvency and others; "A maximum of two concurrent connections per-account"; resume by timepoint; 416 when the timepoint is too old | https://developer-specs.company-information.service.gov.uk/streaming-api/guides/overview |
| Companies House Follow: "a free service from Companies House which sends you email alerts of company transactions" | https://www.gov.uk/government/news/follow-companies-for-free |
| Companies House email reminders: tell you when accounts and confirmation statements are due; free; up to 4 people per company; needs a WebFiling account per company | https://www.gov.uk/guidance/register-for-email-reminders-from-companies-house |
| Officer and PSC changes: "You must tell Companies House within 14 days" | https://www.gov.uk/running-a-limited-company/company-changes-you-must-report |
| VAT: "make sure your payment reaches HMRC on or before the deadline", the same date as the return | https://www.gov.uk/vat-returns/deadlines |
| Self Assessment: payments on account "due by midnight on 31 January and 31 July"; balancing payment "by midnight on 31 January the following year" | https://www.gov.uk/understand-self-assessment-bill/payments-on-account |
| Outlook subscribed calendar: "This update can take more than 24 hours, although updates should happen approximately every 3 hours" (personal) or every 6 hours (work or school) | https://support.microsoft.com/en-us/office/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web-cff1429c-5af6-41ec-a5b4-74f2c278e98c |
| Google Calendar "From URL" needs a public address | https://support.google.com/calendar/answer/37100 |
| ICO register of fee payers: searchable; shows "the date registered and the registration expiry"; downloadable as a dataset | https://ico.org.uk/about-the-ico/what-we-do/register-of-fee-payers/ |
| ICO fee: tier 1 £52, tier 2 £78, tier 3 £3,763, £5 off by Direct Debit, from 17 February 2025 | https://www.gov.uk/government/consultations/data-protection-fee-regime-proposed-changes/outcome/data-protection-fee-regime-government-response |
| SES: $0.10 per 1,000 outbound emails | https://aws.amazon.com/ses/pricing/ |
| Fargate (US East): about $0.03238 per vCPU-hour and $0.00356 per GB-hour on ARM | https://aws.amazon.com/fargate/pricing/ |

Costs in pounds use $1 = £0.79.

### 2.1 Not confirmed

| # | Fact | The question that settles it |
| --- | --- | --- |
| N1 | Whether HMRC allows a stored refresh token to read obligations on a schedule with no user present | Ask HMRC SDST: "May software use a stored refresh token to read VAT and Income Tax obligations on a schedule, with no user present, sending `Gov-Client-Connection-Method: BATCH_PROCESS_DIRECT`, and does our production approval cover that connection method?" |
| N2 | Whether HMRC's VAT obligations answer holds an obligation whose period ends after `to` | A sandbox call with `to` = today and an open quarter that ends next month (DUE6 runs it). |
| N3 | How often Google Calendar refreshes a URL subscription (community reports say 12 to 24 hours) | No Google page states it. The feed works at any interval, so the plan does not depend on it. |
| N4 | Apple Calendar's auto-refresh choices | Apple's page `icl1022` did not state them. The plan does not depend on it. |
| N5 | The ICO dataset's format, size, update frequency and licence | Download it once and read it (DUE12 brief). |
| N6 | Whether HMRC offers software a Corporation Tax obligations read | Search the HMRC API catalogue for a Corporation Tax obligations API. Until one is found, the CT600 and payment rows are computed. |
| N7 | Fargate and Lambda prices in eu-west-2, and the daily exchange rate | The AWS pricing pages per region. The figures here are US East and an assumed rate. |
| N8 | How long before a due date Companies House's own reminder emails go | The reminders page does not say. Section 6.1 does not depend on it. |

## 3. Each filing type

Headless means the read can run with no user present. Cost is per business per read.

### 3.1 Companies House accounts

- **Source and interface.** The company profile (`accounts.next_accounts.due_on`, `period_end_on`, `overdue`), through `getCompanyProfile`.
- **Headless.** Yes, with our API key.
- **How often and cost.** One call a day per company, in the scheduled refresh (DUE5), and one call when the user opens the list (the page uses the same route). The API is free. 1,000 companies cost 1,000 calls a day, 0.6% of the 172,800 a day that 600 per 5 minutes allows.
- **Computed instead.** The due date can be computed (9 months after the period end; 21 months after incorporation for the first accounts), but the profile states it, and it includes extensions. Read it.
- **Last read.** "Read from Companies House at 07:10 today."
- **Stale.** A row not read for 3 days shows "Not read from Companies House for N days" and the job's failure raises the existing alarm path (a metric, section 9 DUE5). A row past its due date is read again before it shows as overdue, and it uses `overdue` from the answer.

### 3.2 Confirmation statement

- **Source and interface.** The profile (`confirmation_statement.next_due`, `next_made_up_to`, `overdue`).
- **Headless, frequency, cost, last read, stale.** As 3.1, from the same call.
- **Computed instead.** No. The profile includes an early filing that moves the date.

### 3.3 Identity verification for directors and PSCs

No row. GOV.UK withdrew the transition page on 2026-11-18 ("The 12 month transition period ... has now passed"), and no current page ties a director's personal code to the next confirmation statement: a new director gives it with the appointment filing, and a new PSC within 14 days of being added. `identityVerificationRow` and its fact id are removed from `web/public/lib/due/due-rules.js` (the review of DUE2, 2026-11-22). DUE5 builds no identity verification row; the appointment and PSC forms carry the code.

### 3.4 CT600 and Corporation Tax payment

As built (2026-11-22): a period of account over 12 months splits into successive 12-month accounting periods and the rest (source `ct-accounting-period-12-months`), also over 24 months. A month added to the last day of a month lands on the last day of the later month. No GOV.UK page read states another CT600 date for a period of account over 18 months, so each return is due 12 months after the period of account ends.

- **Source and interface.** Computed. HMRC offers no obligations read for Corporation Tax that Submit uses (N6).
- **Inputs.** The accounting period from the profile: `next_accounts.period_start_on` and `period_end_on`.
- **Rules.** The return is due 12 months after the accounting period ends (`ct600-12-months`). The payment is due 9 months and 1 day after it ends (`ct-payment-9-months-1-day`). A period of account longer than 12 months splits into two accounting periods: the first 12 months, then the rest. Both returns are due 12 months after the period of account ends; each payment is 9 months and 1 day after its own accounting period.
- **Headless.** Yes, from the profile read.
- **Last read.** "Worked out from the accounts period that Companies House holds, read at <time>."
- **Stale.** As 3.1, because the input is the profile. The payment row says "for taxable profits up to £1.5 million", from the fact's own text.

### 3.5 VAT returns and VAT payments

- **Source and interface.** HMRC VAT obligations (open, `status = O`) for the return; HMRC VAT liabilities (`due`) for an amount already charged. Both through the existing routes, with the user's HMRC grant.
- **Headless.** No (decision D1). A grant lives 24 hours (section 1.2), so no stored grant reaches the next day. HMRC's spec allows `BATCH_PROCESS_DIRECT` "when your users do not initiate an action", but the use of a refresh token for it is N1.
- **How often and cost.** One obligations call and one liabilities call per VRN, each time the user opens the list with a live HMRC grant. HMRC is free. The limit is 3 requests a second for the whole application, so the page reads one VRN at a time.
- **Computed instead.** The payment date equals the return's due date (`vat-return-due-date`; the payment must reach HMRC by the same deadline). After a VAT return that Submit filed, an "expected" next return is computed: the next period of the same length, due one month and 7 days after it ends. It shows "Expected, not yet read from HMRC" until the next read replaces it. Period keys are never computed.
- **Last read.** "Read from HMRC on 3 November. Sign in to HMRC to read again."
- **Stale.** A VAT row is stale when its last read is more than 31 days old, or when its due date has passed since the last read and no Submit receipt closes it. A stale row shows the warning and a "Sign in to HMRC" button; the reminder email says when the row was last read.

### 3.6 Income Tax quarterly updates and the final declaration

- **Source and interface.** HMRC Income Tax obligations (`income-and-expenditure` and `crystallisation`), with the user's grant. The routes exist; the activity `self-employed-read` lists no `prod`.
- **Headless.** No (D1), as 3.5.
- **How often and cost.** Two calls per NINO per visit with a live grant. Free.
- **Computed instead.** For a sole trader that the user marks as "in Making Tax Digital for Income Tax", the four standard quarterly deadlines (`itsa-quarterly-update-deadlines`) and 31 January (`itsa-final-declaration-deadline`). The rows show "Standard update periods. HMRC's obligations show the periods that apply to you." A read replaces them.
- **Last read and stale.** As 3.5.

### 3.7 Self Assessment payments

- **Source.** Computed from fixed dates: payments on account by 31 January and 31 July, balancing payment by 31 January after the tax year (new source file `sa-payments-on-account`).
- **Headless.** Yes; no call.
- **Row.** For a sole trader on the list. The row says "Payments on account apply when your last bill was over the limit HMRC sets; your Self Assessment statement shows the amounts." No amount is shown.

### 3.8 Officer and PSC changes

- **Source.** Entered by the user. No source states that a change has happened before it is filed. The user records "a director joined or left" or "a PSC changed" with its date; the row is due 14 days later (new source files `ch-officer-changes-14-days`, `ch-psc-changes-14-days`).
- **Headless.** Yes; no call.
- **Closes.** When the user marks it filed. Submit has no officer change form, so the row links to Companies House's own service.
- **Stale.** Never; the user's date stands.

### 3.9 ICO data protection fee

- **Source.** Entered by the user: the registration expiry date from the ICO register or the ICO's renewal letter (source "Entered by you on <date>").
- **Headless.** Yes; no call.
- **Later source.** The ICO register is downloadable with each registration's expiry (section 2). When its format is known (N5), a weekly job can read the expiry by registration number. Until then the user's date stands.
- **Stale.** When the expiry date passes, the row asks the user for the next expiry date.

### 3.10 Summary

| Type | Filter type | Source | Headless | Calls per read |
| --- | --- | --- | --- | --- |
| Accounts | accounts | CH profile | yes | 1 (shared) |
| Confirmation statement | shareholders | CH profile | yes | shared |
| Identity verification | people | computed from CH | yes | 0 |
| CT600 | taxes | computed from CH | yes | 0 |
| CT payment | taxes | computed from CH | yes | 0 |
| VAT return | taxes | HMRC | no | 1 |
| VAT payment | taxes | HMRC and computed | no | 1 |
| Income Tax updates | taxes | HMRC or computed | no | 2 |
| Self Assessment payments | taxes | computed | yes | 0 |
| Officer or PSC change | people | entered by the user | yes | 0 |
| ICO fee | other | entered by the user | yes | 0 |

The confirmation statement is filed under "shareholders" because it confirms the shareholders and the PSC register.

## 4. The businesses on the list

The list covers these businesses, each a filter value:

- **Companies the user adds to the due list.** A company number, stored on the account (section 5).
- **Watched companies** from WL1's setting. They show the Companies House rows only.
- **VAT businesses.** The VRN stays in the browser, as today. The account stores a label that the user gives ("Acme VAT"), and the HMRC rows hang on that label.
- **Sole traders.** A label and the choice "in Making Tax Digital for Income Tax"; the NINO stays in the browser.
- **A practice's clients.** The practice adds each client company as a company business. A link from the practice's client rows to the due list has no task in this plan yet.

A business has an id in the account (`b_<ulid>`). Rows refer to it, so a label change moves no row.

## 5. Storage

### 5.1 The table

As built (DUE3, DUE4 and their review, 2026-11-22): a row with no period end (a payment on account, a final declaration) is keyed by its due date (`row#<businessId>#<type>#<dueDate>`). The rules' rows carry `kind` (for example "vat-return") and `type` "taxes"; the stored row's `type` is the filing type, so DUE5 and DUE7 map the rules' `kind` to the row's `type` when they store. `putRows` answers the keys it could not write after five tries. `closeRow` refuses a key that is not a row's. The list reads every salt version and merges. `putFeedToken` removes the lookup that it replaces.

One new env table, `{env}-env-due-list`, in `DataStack.java` with `ensureTable`: on demand, PITR on, `RemovalPolicy.DESTROY`, TTL attribute `ttl`.

The partition key is `hashedSub` and the sort key is `sk`. `scripts/salt-rotate.js` moves only tables whose partition key has the name `hashedSub` (it Queries `hashedSub = :hashedSub`), and `SaltRotationTablesTest.java` checks that name.

| Item | Key (`hashedSub`, `sk`) | Attributes |
| --- | --- | --- |
| Business | `<hashedSub>`, `business#<id>` | `kind` (company, watched, vat, sole-trader), `label`, `companyNumber` (companies only), `itsa` (sole traders), `hmrcReadAt` (set by the first HMRC rows write), `job` = `refresh` and `jobOn` (companies, watched companies and sole traders) |
| Row | `<hashedSub>`, `row#<businessId>#<type>#<periodEnd, or the date the user entered>` | `type`, `filterType`, `businessId`, `periodStart`, `periodEnd`, `dueDate`, `kind` (filing or payment), `source` (companies-house, hmrc, computed, user, ico), `rule` (fact id, computed rows), `readAt`, `status` (open, closed), `job` = `remind` and `jobOn` (open rows with a reminder to come), `ttl` |
| Feed | `feed#<sha256 of token>`, `feed` | `sub` (raw), `createdAt` |
| Feed pointer | `<hashedSub>`, `feed` | `tokenHash` |
| Watched filing | `<hashedSub>`, `seen#<companyNumber>` | `lastTransactionDate`, `lastTransactionId` |

- **One GSI**, `job-jobOn-index`: partition key `job`, sort key `jobOn` (a date), projection ALL. The refresh job Queries `job = refresh AND jobOn <= today`; the reminder job Queries `job = remind AND jobOn <= today`. A missed day is picked up on the next run. One index is used because `ensureGlobalSecondaryIndex` in `KindCdk.java` ignores `ResourceInUseException`, so a second index made while the first is still building can be skipped with no error.
- The reminder and alert jobs need the raw sub for `findAddress`. Any item that sets `job` holds `sub`. The sub is the account's identifier; it holds no customer content.
- A new row that matches a stored row in key, due date and source updates only the stored row's `readAt`. So a daily refresh keeps the row's `status`, `job` and `jobOn`: it does not reopen a row that the user closed, and does not reset its reminders. A row whose due date or source changes is written as a new open row.
- Closing a row sets `status: closed` and removes its `job` and `jobOn`, so the reminder job does not find it.
- `ttl` is 90 days after `dueDate`, so closed and old rows go without a sweep.
- The table joins `partitionTables` in `scripts/salt-rotation-tables.json` with `"sortKey": "sk"`. The feed items keep their own partition and are not moved; the lookup holds the raw sub and hashes it with the current salt.

### 5.2 What the table holds from HMRC, and why

An HMRC row holds the period start and end, the due date, the status and the read time. That is what the page shows. It holds no VRN, NINO, period key, amount or penalty. The row is kept so that the reminder email and the calendar feed can carry HMRC dates between sign-ins (goals 3 and 4); without it the HMRC rows would exist only while the page is open. This is decision D1.

## 6. Alerts

### 6.1 Due-date reminders

- **Setting.** `dueReminders`, a boolean, default `false`, in `ACCOUNT_SETTING_DEFAULTS`. It fits the existing boolean shape. The settings page and the due list page both show it.
- **When.** 14 days before and 2 days before each open row's due date, and the day after it becomes overdue. When a row is written as new, `putRows` sets `job = remind` and `jobOn` to the first of those dates that is today or later.
- **Job.** A daily Lambda at 06:00 UTC (an EventBridge rule cron runs in UTC) Queries the index for `job = remind` up to today, groups the rows by account, and sends one email per account whose setting is on, with every row it read for that account. For every row it reads, sent or not, it sets `jobOn` to the next reminder date after today, or removes `job` after the last reminder. So an account that turns reminders on later gets no old reminders.
- **Email kind.** `due-reminder` in `customerEmailTemplates.js`: subject "Due soon: 2 filings for Acme Ltd"; one line per row with the due date, the source and its last read; a "See the due list" button. A stale HMRC row says "We last read this from HMRC on <date>. Sign in to HMRC to check it."
- **Cost.** No call to any source; the rows are already stored. SES at $0.10 per 1,000 emails is £0.08 per 1,000. 1,000 accounts with 3 reminder days a month each cost about £0.24 a month. The Lambda cost is pence a month (N7).

### 6.2 A watched company files

- **Setting.** `watchAlerts`, a boolean, default `false`.
- **Read.** The filing history route that CL1 adds, page 1, newest first, once a day per watched company, in the same refresh job as section 3.1. A transaction newer than `seen#<companyNumber>` raises the alert. One company that two accounts watch is read once.
- **Cost.** One call per distinct watched company a day. With WL1's cap of 50 per account, 100 accounts that watch 50 each are at most 5,000 calls a day, 2.9% of the daily allowance. Free in money.
- **Email kind.** `watched-company-filed`: one email a day per account, listing each company, the filing description and date, and links to CL1's `/companies-house/company/<CRN>/filing-history`.
- **Read method.** The daily filing history read (D4). Alerts arrive up to a day after the filing.
- **What ours adds to Companies House Follow and its reminders.** Follow and the reminders are free, and each needs a Companies House account; the reminders also need a WebFiling account per company. Ours adds: one list across Companies House, HMRC and the other sources; one email for many companies; reminders for watched companies without their authentication code; the calendar feed; and the "File this" step beside each row.

### 6.3 The privacy policy lines

`web/public/privacy.html` gains (decision D3):

- In "Service emails" (line 487): "If you turn on reminders, we email you before a filing or payment on your due list is due. If you turn on watch alerts, we email you when a company you watch files something at Companies House. You can turn each off in Settings."
- A new item in the list of data we hold: "**Due list**: the businesses you add to it (a name, and a company number for a company), and for each filing its type, period, due date and when we last read it. We keep no VAT number, National Insurance number or amount. A row goes 90 days after its due date."
- A new item: "**Calendar feed**: if you make one, a secret address that shows your due list to anyone who has it. Reset it in the due list to stop the old address."
- In the lawful-basis table (line 929), the row becomes "Service emails (subscription, receipt copy, pass, reminders and watch alerts)", basis "Contract performance".

## 7. The calendar feed

- **Address.** `https://<site>/api/v1/public/due-calendar/<token>.ics`. The token is 32 random bytes in base64url. The table stores its SHA-256 only. `POST /api/v1/due-list/calendar-feed` makes a token, ends the old one, and answers the address once. `DELETE` ends it.
- **Route.** No authorizer, as the public deadlines route. The Lambda looks up the token hash, then Queries the account's open rows. It calls no source.
- **Cache.** CloudFront keeps an answer one hour, with a cache policy beside `publicDeadlinesCachePolicy`. A reset changes the address, so the cache serves nothing stale for the new one; the old address answers 404 within the hour.
- **Content.** `VCALENDAR` with `X-WR-CALNAME:Due list - DIY Accounting Submit`, `REFRESH-INTERVAL;VALUE=DURATION:PT6H` and `X-PUBLISHED-TTL:PT6H`. One all-day `VEVENT` per open row: `UID` `<rowkey hash>@submit.diyaccounting.co.uk` (stable, so a client updates the event), `SUMMARY` "Acme Ltd: Confirmation statement due", `DESCRIPTION` with the source and its last read and the due list address, `DTSTART;VALUE=DATE`. No VRN, NINO, amount, director name or address.
- **Subscribing.** The page shows the address with a copy button, a "Google Calendar" link (`https://calendar.google.com/calendar/r?cid=webcal://…`) and a `webcal://` link for Apple and Outlook. Outlook refreshes about every 3 hours (6 for a work account), per Microsoft's page.
- **Cost.** One DynamoDB Query per uncached request. Free in calls to any source.

## 8. Decisions

Operator, 2026-11-22.

| # | Decision | Design |
| --- | --- | --- |
| D1 | HMRC rows between sign-ins | Read with the user present; store the dates only, so emails and the feed carry them (section 5.2). |
| D2 | The bundle that sees the list | `default`: every signed-in account. The HMRC rows still need the read activity that exists (`vat-obligations` is in the free `day-guest`). |
| D3 | The privacy policy lines | Section 6.3 as written. |
| D4 | Watched-company alerts | The daily filing history read (section 6.2). It is free and up to a day late. |

## 9. Tasks

`DUE` tasks are a session's. `ODUE2` is the operator's.

### 9.1 The task table

| Label | Task | Waits on | Class | Model | Size |
| --- | --- | --- | --- | --- | --- |
| DUE2 | Due date rules and their sources | nothing | machine-only | Sonnet | ~8 files |
| DUE3 | The due list table | nothing | machine-only | Sonnet | ~8 files |
| DUE4 | The due list API and activity | DUE2, DUE3, WL1 | machine-only | Sonnet | ~16 files |
| DUE5 | Companies House rows and the daily refresh | DUE4, CL1 | machine-only | Sonnet | ~9 files |
| DUE6 | The due list page | DUE5, SY1 | machine-only | Sonnet | ~10 files |
| DUE7 | VAT rows from HMRC | DUE6 | machine-only | Sonnet | ~6 files |
| DUE8 | Income Tax rows from HMRC | DUE7 | machine-only | Sonnet | ~6 files |
| DUE9 | Rows the user enters: officer and PSC changes, the ICO fee | DUE8 | machine-only | Sonnet | ~9 files |
| DUE10 | Due-date reminder emails | DUE5 | machine-only | Sonnet | ~10 files |
| DUE11 | Watched-company alerts | DUE10, WL1, CL1 | machine-only | Sonnet | ~7 files |
| DUE12 | The calendar feed | DUE6 | machine-only | Sonnet | ~10 files |
| DUE13 | The first-use path, copy, guide and video | DUE9, DUE11, DUE12 | machine-only | Sonnet | ~10 files |
| ODUE2 | Try the due list on ci | DUE13 deployed to ci | human-driven | | |
| DUE14 | Launch on prod | ODUE2 | machine-only | Haiku | ~5 files |

DUE6 to DUE9 change the same page files, so they run in that order on one branch. DUE4 edits `web/public/submit.catalogue.toml` and the tests that list activities, so it lands after AA3, CL1, WL1 and CP1.

### 9.2 Briefs

Each brief stands alone. Line numbers drift, so each names its anchor text. Every brief has the same gates: `npm run bundle` first in a worktree; `npx eslint` and `npx prettier --check` on each changed file; Welsh strings in `i18n/cy.toml` beside the English, then `npm run build:welsh`; a new module carries an `@capability` header and `npm run capabilities:generate`; `./mvnw clean verify` when a stack changes, with the stack's resource total against CloudFormation's 500 named in the pull request.

#### DUE2. Due date rules and their sources

- **Goal.** One module computes every computed date in section 3, each from a sourced fact.
- **Sources.** Add to `.claude/skills/tax-sources/sources`, each with its URL, title, retrieved date and verbatim quote: `sa-payments-on-account.json` (https://www.gov.uk/understand-self-assessment-bill/payments-on-account), `ch-officer-changes-14-days.json` and `ch-psc-changes-14-days.json` (https://www.gov.uk/running-a-limited-company/company-changes-you-must-report), `vat-payment-same-deadline.json` (https://www.gov.uk/vat-returns/deadlines, the sentence "You must submit your return and make sure your payment reaches HMRC on or before the deadline"). Run `node scripts/verify-tax-sources.mjs <name>` for each.
- **Module.** `web/public/lib/due/due-rules.js`, a plain ES module that the browser and `app/` both import. Functions: `ct600Rows({periodStart, periodEnd})` (splits a period of account over 12 months), `ctPaymentRows(...)`, `vatReturnDue(periodEnd)`, `expectedNextVatPeriod({start, end})`, `itsaStandardRows(taxYear)`, `saPaymentRows(taxYear)`, `changeDue(changeDate)`, `identityVerificationRow(confirmationStatementDue)`. Each row it returns carries `rule` (the fact id) and `source: "computed"`. Dates are ISO strings in UK dates; no time zone arithmetic beyond whole days.
- **Tests.** `web/unit-tests/dueRules.test.js`: a 12-month period; an 18-month period (two CT periods, two payments, both returns at 12 months after the end); month ends (31 May plus 9 months and 1 day is 1 March); leap years; each rule's fact id exists in the sources (`loadSources` from `scripts/tax-sources.mjs`).
- **Run.** `npx vitest run web/unit-tests/dueRules.test.js web/unit-tests/taxSources.test.js`.
- **Waits on**: nothing. **Class**: machine-only. **Repository**: submit. **Model**: Sonnet. **Size**: ~8 files.

#### DUE3. The due list table

- **Goal.** The table of section 5.1 exists in every environment, with its repository.
- **Stack.** Add `dueListTable` to `DataStack.java` with `ensureTable`, as `practiceClientsTable` is made: partition key `hashedSub`, sort key `sk`, on demand, PITR, `ensureTimeToLive` on `ttl`, and one `ensureGlobalSecondaryIndex` named `job-jobOn-index` (`job`, `jobOn`, `ALL`). Add its name to `sharedNames().data`. Add the table to `partitionTables` in `scripts/salt-rotation-tables.json` with `"sortKey": "sk"` and make `SaltRotationTablesTest.java` pass.
- **Repository.** `app/data/dynamoDbDueListRepository.js`: `putBusiness`, `deleteBusiness` (and its rows), `listBusinessesAndRows(userSub)` (one Query on `hashedSub`, trying `subHashCandidates`), `putRows(userSub, rows, replace)` (reads the account's stored rows; updates only `readAt` of a row that matches a stored row in key, due date and source; writes the other rows with `BatchWrite`, with `ttl` from `app/lib/recordRetention.js`; deletes the stored rows that `replace` selects and that the new set does not hold), `closeRow(userSub, sk)` (section 5.1), `queryJobsDue(job, date)` (the index, `jobOn <= date`), `putFeedToken`, `findFeedByTokenHash`.
- **Tests.** `app/unit-tests/data/dynamoDbDueListRepository.test.js` against the mocked client, as the other repository tests do, with the replace, an unchanged row that keeps its `status` and `jobOn`, and a close; the CDK resource counts in `infra/test/java`.
- **Run.** `npx vitest run app/unit-tests/data/dynamoDbDueListRepository.test.js`; `./mvnw clean verify`.
- **Waits on**: nothing. **Class**: machine-only. **Repository**: submit. **Model**: Sonnet. **Size**: ~8 files.

#### DUE4. The due list API and activity

- **Goal.** A signed-in account adds and removes businesses, reads its businesses and rows, and writes rows that its page read from HMRC.
- **Catalogue.** Add the activity `due-list` beside `company-watch-list`: `display = "on-entitlement"`, `bundles = ["default"]` (D2), `metered = false`, `environments = ["local", "test", "simulator", "proxy", "ci"]`, `paths = ["^/api/v1/due-list.*"]`. The page `due.html` stays out of `paths`, because it also serves a signed-out visitor (DUE6). Update `app/unit-tests/services/prodSurface.test.js`, `app/unit-tests/services/productCatalog.test.js`, `web/unit-tests/catalogue-names.test.js` and `web/unit-tests/catalog-paths.test.js`.
- **Routes.** `app/functions/account/dueListGet.js` (`GET /api/v1/due-list`), `dueListBusinessPut.js` (`PUT /api/v1/due-list/businesses/{id}`, `DELETE` on the same path), `dueListRowsPost.js` (`POST /api/v1/due-list/rows`). Each has its Express route in `app/bin/server.js` and its API Gateway route in `ApiRoutes.java`, with `enforceBundles`.
- **Limits.** At most 50 businesses an account (WL1's cap), 500 rows an account. A company number passes `isValidCompanyNumber`.
- **Row writes.** `POST /rows` takes rows of `source: "hmrc"` for one business. It replaces that business's HMRC rows and its computed rows of the same types, and sets `hmrcReadAt` on the business. It refuses a row with a field outside section 5.1, so no VRN, NINO, period key or amount can be stored. It sets `readAt` to the server time.
- **A VAT receipt closes its row.** The stored VAT receipt holds no period end, so `hmrcVatReturnPost.js` passes its `periodEnd` to a new `closeVatReturnRow(userSub, periodEnd)` after each of its two `recordFiledReceipt` calls. The SQS `payload` holds no `periodEnd` today, so add it there for the worker's call. Give the VAT return Lambdas in `HmrcStack.java` the due list table name and a write grant. It closes the account's open VAT return row with that period end when exactly one matches; with two or more (two VAT businesses on one stagger, and no business holds a VRN) it leaves them for the next HMRC read. A failure is logged and never fails the filing. Companies House rows close at the next refresh, when the profile moves on (DUE5).
- **Tests.** Unit tests of each route (limits, the field refusal, the 403 without the activity), of the VAT row close (one match, two matches), and a system test of add, write, read and delete against dynalite.
- **Run.** `npx vitest run app/unit-tests/functions/dueList*.test.js app/unit-tests/services`; `npm run test:system`.
- **Waits on**: DUE2, DUE3, WL1 (catalogue order). **Class**: machine-only. **Repository**: submit. **Model**: Sonnet. **Size**: ~16 files.

#### DUE5. Companies House rows and the daily refresh

- **Goal.** Each company business has its accounts, confirmation statement, identity verification, CT600 and CT payment rows, read from Companies House on the day it is added and every day after. Each sole trader has its Self Assessment payment rows, and its standard Income Tax rows when it is in Making Tax Digital for Income Tax, stored so that the emails and the feed carry them.
- **Profile.** `getCompanyProfile` answers `accountsNextPeriodStart` from AA29 (built by CL1). Add `accountsOverdue` (`next_accounts.overdue`) and `confirmationStatementOverdue` (`confirmation_statement.overdue`), with the name that SY1 gives the public route for the first.
- **Rows.** `app/services/dueListCompaniesHouse.js` turns one profile into rows with `due-rules.js`. Each write replaces the business's accounts, confirmation statement and identity verification rows, so a filed period's rows go when the profile moves to the next period. The CT600 and CT payment rows are written by key and never deleted by a refresh, because they stay due after the accounts are filed; an old period's rows stay until the user marks them done (DUE9) or their `ttl`. Adding a company business (DUE4's `PUT`) reads its profile at once.
- **Sole traders.** Adding or changing a sole trader writes `saPaymentRows` for the current and next tax year, and `itsaStandardRows` when `itsa` is set and `hmrcReadAt` is not. The business gets `job = refresh` with `jobOn` the next 6 April. The job writes them again on that date. These rows need no call.
- **Job.** `app/functions/account/dueListRefresh.js`, scheduled hourly in `AccountStack.java` as `bundleCapacityReconcileSchedule` is. It Queries the index for `job = refresh` up to today. It reads each distinct company number once, at most one call a second and at most 500 a run, writes the rows of every account that holds the company, and sets `jobOn` to tomorrow. It writes sole-trader rows with no call. A 429 stops the run; the next hour goes on. It emits a metric of companies read, 429s and failures. Grant the Lambda the index with `grantTableIndexActions` beside its table grant, because a table grant alone does not reach an index (`KindCdk.java`), and grant it the Companies House API key.
- **Simulator.** The simulator profile answers carry the new fields.
- **Tests.** Unit tests of the row building (an overdue company, a first-year company, an 18-month period, a profile that moved to the next period, with the old CT rows kept) and of the job (one read for a shared company, the 429 stop, the 500 cap, a sole trader with and without `hmrcReadAt`).
- **Run.** `npx vitest run app/unit-tests/services/dueListCompaniesHouse.test.js app/unit-tests/functions/dueListRefresh.test.js`; `./mvnw clean verify`.
- **Waits on**: DUE4, CL1. **Class**: machine-only. **Repository**: submit. **Model**: Sonnet. **Size**: ~9 files.

#### DUE6. The due list page

- **Goal.** `web/public/due.html` shows the list of goal 1, signed in and signed out.
- **List.** One row per open filing or payment, soonest first. Overdue rows come first, then a marker line "Due from today", then the rest. Each row: the business, the filing type, the period, the due date and days left (`deadlineLine` from `web/public/lib/company/deadline-rules.js`), the source and its last read, a stale warning per section 3, and the next step.
- **Filters.** Business (each business of section 4), source (Companies House, HMRC, worked out, entered by you, ICO), type (taxes, accounts, people, shareholders, other). The filters write to the address (`?business=`, `?source=`, `?type=`) so a filtered view is bookmarkable.
- **Next step.** Where the account holds the filing's activity in this environment, a "File this" button opens the form with the company filled in (CL1's `?companyNumber=`). Otherwise the row names the bundle that has it, or links to the government service when Submit does not offer the filing here.
- **Signed out.** The page takes a company number and reads `GET /api/v1/public/company-deadlines` (with SY1's `accountsNextPeriodStart`), then shows the accounts, confirmation statement, CT600 and CT payment rows computed in the browser, and "Sign in to keep this list, add VAT and Income Tax, and get reminders."
- **Business management.** Add a company (the lookup's `searchCompanies`), add a VAT business or a sole trader by label, rename, remove. Watched companies show with a link to WL1's page.
- **Tests.** `web/browser-tests/dueList.browser.test.js`: order and the marker line; each filter; a stale row; a signed-out lookup; the "File this" and bundle cases. A behaviour journey on the simulator lane: sign in, add a company, see its rows, open "File this" (`lockf -k /tmp/submit-simulator.lock`).
- **Visual definition of done.** A new page: `visual-review` on the passing run's screenshots.
- **Waits on**: DUE5, SY1. **Class**: machine-only. **Repository**: submit. **Model**: Sonnet. **Size**: ~10 files.

#### DUE7. VAT rows from HMRC

- **Goal.** With a live HMRC grant, the page reads each VAT business's open obligations and liabilities and stores their dates.
- **Read.** For each VAT business whose VRN is in `CarriedIdentifiers` (the page asks for it once a session), call `/api/v1/hmrc/vat/obligation?vrn=<VRN>&status=O&from=<today minus 365 days>&to=<today>` and `/api/v1/hmrc/vat/liability?vrn=<VRN>`, one VRN at a time. Settle N2 in the sandbox first; if HMRC leaves out a period that ends after `to`, send `to` as today plus 90 days within HMRC's range rule.
- **Rows.** A return row per open obligation, a payment row on the same date, and a payment row per liability with a `due` date. Post them to `POST /api/v1/due-list/rows`. After a VAT receipt from Submit, the expected next period (DUE2) shows until the next read.
- **No grant.** The rows stay as last read, with the stale rule of section 3.5 and a "Sign in to HMRC" button that starts the existing VAT sign-in and returns to the page.
- **Tests.** Browser tests with mocked routes: the rows; the no-grant state; that no VRN reaches the rows request. A behaviour journey against the HMRC sandbox on the proxy lane.
- **Waits on**: DUE6. **Class**: machine-only. **Repository**: submit. **Model**: Sonnet. **Size**: ~6 files.

#### DUE8. Income Tax rows from HMRC

- **Goal.** A sole trader in Making Tax Digital for Income Tax has its quarterly and final declaration rows.
- **Computed.** With no read, the page shows the standard rows that DUE5 stores.
- **Read.** Where the account holds `self-employed-read` and a live grant with `read:self-assessment`, read `/api/v1/hmrc/itsa/obligations` and `/api/v1/hmrc/itsa/obligations/crystallisation` for the NINO in `CarriedIdentifiers`, and post the rows, which replace the computed ones.
- **Prod.** `self-employed-read` lists no `prod`, so on prod the sole trader sees the computed rows and the Self Assessment payment rows only.
- **Tests.** Browser tests of the computed rows, the read rows and the replacement; a sandbox journey on the proxy lane.
- **Waits on**: DUE7. **Class**: machine-only. **Repository**: submit. **Model**: Sonnet. **Size**: ~6 files.

#### DUE9. Rows the user enters: officer and PSC changes, the ICO fee

- **Goal.** The user records a change of officer or PSC, or an ICO expiry date, and sees the row due.
- **Page.** On a company, "Record a change": a director or secretary joined or left, or a PSC changed, with its date; the row is due 14 days later (DUE2's `changeDue`) and links to Companies House's service. On any business, "Add the ICO fee": the expiry date; the row type is "other", source `ico`, text "Entered by you on <date>". Each of these rows, and each CT600 and CT payment row, has "Mark as done".
- **Route.** `app/functions/account/dueListUserRowPut.js`: `PUT /api/v1/due-list/user-rows/{rowId}` writes one row of `source` `user` or `ico`, or closes any row of the account for "Mark as done" (`closeRow`). `DELETE` on the same path removes a `user` or `ico` row. It refuses a field outside section 5.1 and any other source. Express route in `app/bin/server.js`, API Gateway route in `ApiRoutes.java`, with `enforceBundles`; the path is under `due-list`'s `^/api/v1/due-list.*`.
- **ICO register.** Download the register dataset once from https://ico.org.uk/about-the-ico/what-we-do/register-of-fee-payers/ and write its format, size, update frequency and licence into this plan's section 3.9 (N5). Build no reader in this task.
- **Tests.** Unit tests of the route (the field and source refusal, "Mark as done" on a user row and on a CT600 row); browser tests of each entry and its due date.
- **Waits on**: DUE8. **Class**: machine-only. **Repository**: submit. **Model**: Sonnet. **Size**: ~9 files.

#### DUE10. Due-date reminder emails

- **Goal.** An account with `dueReminders` on gets the emails of section 6.1.
- **Setting.** Add `dueReminders: false` to `ACCOUNT_SETTING_DEFAULTS` in `app/lib/accountSettings.js`, with a switch on `web/public/settings.html` and on the due list page.
- **Rows.** `putRows` in `dynamoDbDueListRepository.js`, which every row write uses, sets `job = remind`, `sub` and `jobOn` on each open row it writes as new to the first of these that is today or later: 14 days before, 2 days before, the day after the due date.
- **Job.** `app/functions/account/dueListReminders.js`, daily at 06:00 UTC in `AccountStack.java` as `commissionReleaseSchedule` is, with `grantTableIndexActions` for the index. Query the index for `job = remind` up to today; group by account; read each account's settings; call `requestCustomerEmail({ kind: "due-reminder", userSub, data })` once per account whose setting is on; for every row read, set its next `jobOn`, or remove `job` after the last reminder.
- **Template.** `due-reminder` in `buildCustomerEmail`, English and Welsh, in the house style of `renderEmail`. Add the kind to the type list in `customerEmailRequest.js` and to the render script of SITE-29.
- **Privacy.** Apply D3's lines of section 6.3 to `web/public/privacy.html` and its Welsh page in the same change.
- **Tests.** Unit tests of the template, the `jobOn` rule (a refresh after the day's reminder keeps the next `jobOn`) and the job (setting off sends nothing and still moves `jobOn`; one email per account); the email render check.
- **Waits on**: DUE5. **Class**: machine-only. **Repository**: submit. **Model**: Sonnet. **Size**: ~10 files.

#### DUE11. Watched-company alerts

- **Goal.** An account with `watchAlerts` on gets one email a day that lists what its watched companies filed (section 6.2).
- **Mirror.** In `app/functions/account/accountSettingsPut.js`, on each settings write, add a business of kind `watched` with `putBusiness` for each company on WL1's list that has none, with `job = refresh` and `jobOn` today, and delete those taken off the list, so the refresh job finds them. Turning on `watchAlerts` is a settings write, so a list made before this task lands is mirrored then. Give the settings Lambda in `AccountStack.java` the due list table name and a read and write grant.
- **Read.** In `dueListRefresh.js`, for watched companies, also read page 1 of the filing history through CL1's client function, once per distinct company. Compare with `seen#<companyNumber>` per account; a newer transaction queues an alert. The first read sets `seen` and sends nothing.
- **Email.** `watched-company-filed`, English and Welsh, links to `/companies-house/company/<CRN>/filing-history`.
- **Setting.** `watchAlerts: false` in `ACCOUNT_SETTING_DEFAULTS`, with its switches.
- **Tests.** Unit tests of the comparison, the first-read rule and the shared read.
- **Waits on**: DUE10, WL1, CL1. **Class**: machine-only. **Repository**: submit. **Model**: Sonnet. **Size**: ~7 files.

#### DUE12. The calendar feed

- **Goal.** The feed of section 7.
- **Routes.** `app/functions/account/dueListCalendarFeedPost.js` (`POST` and `DELETE /api/v1/due-list/calendar-feed`, on `due-list`) and `app/functions/account/dueListCalendarGet.js` (`GET /api/v1/public/due-calendar/{token}`, no authorizer, as `companiesHousePublicDeadlinesGet.js`). Express routes in `app/bin/server.js`.
- **Edge.** A cache policy of one hour for `/api/v1/public/due-calendar/*` in `EdgeStack.java`, beside `publicDeadlinesCachePolicy`. The answer is `text/calendar; charset=utf-8`; a 404 for an unknown token has no cache.
- **Builder.** `app/lib/dueListIcs.js`: lines folded at 75 octets, CRLF line ends, text escaped per RFC 5545, all-day events, stable UIDs.
- **Page.** On `due.html`: "Subscribe in a calendar", the address with copy, the Google and `webcal://` links, and "Reset the address" with a confirm.
- **Deletion.** The feed lookup item sits in its own partition (`feed#<token hash>`), so a deletion by hashed sub (`scripts/delete-user-data.js`, the salt rotation) does not reach it. The account's feed pointer holds the token hash: the deletion script reads the pointer and removes the lookup, with a test (found by DUE3).
- **Tests.** Unit tests of the builder (folding, escaping, no field outside section 7), the token hash lookup, the reset; a browser test of the panel. Parse the output with an iCalendar parser in the test. A test that an account's deletion leaves no feed lookup.
- **Waits on**: DUE6. **Class**: machine-only. **Repository**: submit. **Model**: Sonnet. **Size**: ~10 files.

#### DUE13. The first-use path, copy, guide and video

- **Goal.** A new user reaches the due list from the places they arrive, and the guide shows it.
- **Entry points.** A "See everything that is due" link from a result on `web/public/company-filing-deadlines.html`; an entry on `web/public/get-started.html` ("Enter a company number or sign in to HMRC to see what is due"); a home page card from the activity's `display`.
- **Copy.** An FAQ entry on what the due list reads and when; the `REPORT_CAPABILITIES.md` entries from the `@capability` headers.
- **Guide.** A journey in `web/public/lib/guide-journeys.js`; `npm run video:walkthrough`; a video uploaded unlisted (the `video-publish` skill).
- **Visual definition of done.** `visual-review` on the guide and site screenshots; `ui-ux-pro-max` on the guide screenshots of the journey.
- **Waits on**: DUE9, DUE11, DUE12. **Class**: machine-only. **Repository**: submit. **Model**: Sonnet. **Size**: ~10 files.

#### ODUE2. Try the due list on ci

- **Goal.** The operator uses the due list on ci with a real company number and the HMRC sandbox, turns on reminders and subscribes to the feed, and gives the go for prod.
- **Class**: human-driven. **Owner**: operator.

#### DUE14. Launch on prod

- **Goal.** `due-list` lists `prod`.
- **Change.** Add `"prod"` to the activity's `environments`; update `app/unit-tests/services/prodSurface.test.js`. Make the guide video public after the operator has watched it.
- **Run.** `npx vitest run app/unit-tests/services/prodSurface.test.js`.
- **Waits on**: ODUE2. **Class**: machine-only. **Repository**: submit. **Model**: Haiku. **Size**: ~5 files.
