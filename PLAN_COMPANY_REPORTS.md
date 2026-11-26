<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: company reports from the Companies House record

A signed-in reader opens a company on the lookup and reads six plain reports built from the company's own public filings. Each report states figures, dates and changes, names the filing each one comes from, and defines each figure in one sentence. No report gives an opinion. Submit reads Companies House as a good citizen: inside the published rate limit, with a cache for each kind of answer, one request at a time for a company, and a stop on a 429. Facts checked 2026-11-22.

**Status**: reviewed in three rounds; decisions answered by the operator on 2026-11-22. The open tasks (CR4 to CR9, CR14 and OCR1) are tracked in section 6.3, not on `NEXT.md`; CR13's draft is written (`../private.diyaccounting.co.uk/companies-house/correspondence/DRAFT_DATA_LICENCE_QUESTION.md`, 2026-11-22); CR10 to CR12 are not built until a report needs them (section 8). Briefs are section 6.2.

## Operator assertions (verbatim)

> Design plain reports on a company from its Companies House record. Design a set of reports that a lay reader can use to see how a company is doing from its own filings, stating figures and changes with no opinion: for example the filing history and its timeliness (accounts and confirmation statements made on time or late); changes in officers and persons with significant control over time; share capital and shareholdings and their changes (allotments, transfers, a sole shareholder); charges registered and satisfied; the registered office and name history; and from the filed accounts, the main figures year on year (net assets, cash, debtors, creditors, turnover and profit where the accounts type states them), each with its source filing and a plain definition.

> Being a good citizen of the Companies House API: read its published rate limit and terms of use and state them with their source; a cache for each kind of answer with its lifetime; one request at a time per company and a back-off on 429; bulk products in place of per-company calls where a report reads many companies; the streaming API for change where a report watches a company; the attribution and licence wording Companies House asks for (Open Government Licence); and no personal data kept beyond what the page shows (a director's date of birth is month and year only on the public record).

(Source: operator, 2026-11-21.)

## Goals

1. A lay reader sees, for one company, its filing record and timeliness, its officers and persons with significant control over time, its share capital, its charges and insolvency, its registered office and name history, and its main accounts figures year on year.
2. Every figure and date names its source filing and has a plain definition. The wording states facts only.
3. Submit stays inside Companies House's rate limit and terms, and keeps no personal data beyond what the page shows.
4. Each report has a bookmarkable address under CL1's drill-down, `/companies-house/company/<CRN>/reports/...`.

## Rules of this plan

- **A report states, never judges.** No word that rates the company: no "healthy", "strong", "weak", "risky", "good", "poor", "concern", "improved", "worsened". A change is a signed number and a percentage: "Net assets: £12,400 at 31 March 2025, £9,100 at 31 March 2024. Change: +£3,300 (+36%)." Each report task adds its page's words to one unit test that fails on any word in this list (`app/lib/companyReports/wording.js`, from CR3).
- **Every figure carries its source.** Each row links the filing it comes from: the filing history item, and for an accounts figure the filed document, with the made-up date and the date Companies House processed it.
- **A figure the filing does not state stays empty** and the row says why ("This company filed micro-entity accounts, which state no profit and loss account."). Nothing is computed that the filing does not state, except a difference between two stated figures and a count of dates.
- **One request at a time for a company, and a stop on a 429.** Section 3 holds the rules. Every task that calls Companies House goes through the CR2 layer.
- **The page shows only what a report needs.** A report drops a date of birth, a nationality, a country of residence, an occupation, an address of a person and an officer's former names. The cache holds the trimmed answer, never the raw one.
- **Only Submit calls Companies House**, with the API key the other lookups use (`COMPANIES_HOUSE_API_KEY_ARN`). The page calls Submit's routes.
- **Reuse, do not re-specify.** The filing history client, the Document API client (`COMPANIES_HOUSE_DOCUMENT_BASE_URI`), the filing history and document routes and their simulator scenarios are `PLAN_AMENDED_ACCOUNTS.md` AA23. The profile's accounts dates are AA29. Board row CL1 builds both, and the drill-down page and its addresses. This plan calls the AA23 client functions and reads the AA29 profile fields.

## 1. Where it stands

### 1.1 What Submit reads today

| Thing | Where | Evidence |
| --- | --- | --- |
| The REST client | `companiesHouseHttpGet(endpoint, queryParams)` | `app/services/companiesHouseApi.js:52` |
| One retry on a 401 (a rolled key) | the same function | `app/services/companiesHouseApi.js:70-75` |
| A 429 becomes Submit's own 429, with `Retry-After` | `httpResponseFromCompaniesHouseResponse` | `app/services/companiesHouseApi.js:147-155` |
| Each call writes an outbound call record | `sendJsonToCompaniesHouse`, `recordedFetch` | `app/services/companiesHouseSend.js:33-60` (capability OPS-164) |
| The profile, with no accounts history | `getCompanyProfile` | `app/functions/companies-house/companiesHouseCompanyGet.js:134-160` |
| Officers, first page only, with date of birth and nationality passed through | `mapOfficer`, the call with no `items_per_page` | `app/functions/companies-house/companiesHouseOfficersGet.js:45-56`, `:88` |
| Persons with significant control, first page only, with date of birth and nationality | `mapPsc` | `app/functions/companies-house/companiesHousePscGet.js:43-54`, `:86` |
| A public lookup with a CloudFront cache of 600 seconds and a WAF rule of 60 requests a five-minute window for each address | `FOUND_CACHE_SECONDS`, `PUBLIC_DEADLINES_CACHE_MAX_TTL_SECONDS`, `PUBLIC_DEADLINES_RATE_LIMIT_PER_FIVE_MINUTES` | `app/functions/companies-house/companiesHousePublicDeadlinesGet.js:41`; `infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java:134`, `:144`, `:755-767`, `:1673-1690` |
| The lookup page shows the profile only and a rate-limit message on a 429 | `renderCompanyProfile`, `showSearchError` | `web/public/companies-house/companySearch.page.js:90-101`, `:103-135` |
| The lookup activity, `default` bundle, every environment | `company-lookup` | `web/public/submit.catalogue.toml:521-528` |
| The iXBRL reader and the accounts mapping | `readIxbrl`, `mapIxbrlAccounts` from `@diy-accounting-uk/diya-gl` 1.2.99 | `app/unit-tests/services/ixbrlRoundTrip.test.js:9-10`, `:53`, `:103`; `app/services/companiesHouseLastAccounts.js:42` |
| The Accounts Data Product zip, read by the review script | `--adp-zip` | `scripts/companies-house-review.mjs:24`, `:688-690` |

- Submit has no server cache of Companies House answers today. The only cache is CloudFront's, on the public deadlines route.
- The officers and PSC routes read one page. A company with more officers than one page holds shows only the first page. The CR5 report pages through the list.
- `mapIxbrlAccounts` returns `balanceSheet.currentYear` and `priorYear` (net assets, cash at bank, debtors, creditors within and after one year), `profitAndLoss` (turnover, gross profit, operating profit, profit before tax, profit) or `null`, `averageEmployees`, `shareNote` (shares, nominal value, class), `regime`, `dormant` and `filleted` (`node_modules/@diy-accounting-uk/diya-gl/dist/app/lib/ixbrl-accounts.js:734-905`). It throws an `IxbrlError` when a balance sheet does not balance or a year is missing (`:808-829`). One filed document gives two years.

### 1.2 What Companies House publishes

| Fact | Source |
| --- | --- |
| "You can make up to 600 requests within a five-minute period." After that, every request gets `429 Too Many Requests` for the rest of the window. Applications that often exceed or try to bypass the limit may be banned without notice. A higher limit is on request. | https://developer-specs.company-information.service.gov.uk/guides/rateLimiting |
| Keep API keys out of code and the source tree; restrict a key by IP address or domain; regenerate keys; tolerate new and reordered JSON members. | https://developer-specs.company-information.service.gov.uk/guides/developerGuidelines |
| Endpoints: profile `GET /company/{n}`; filing history `GET /company/{n}/filing-history` (`category`, `items_per_page`, `start_index`) and `/{transaction_id}`; officers `GET /company/{n}/officers`; PSC `GET /company/{n}/persons-with-significant-control` and `/persons-with-significant-control-statements`; charges `GET /company/{n}/charges` and `/{charge_id}`; insolvency `GET /company/{n}/insolvency`. | https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/reference |
| A filing history item has `category` (`accounts`, `address`, `annual-return`, `capital`, `change-of-name`, `incorporation`, `liquidation`, `miscellaneous`, `mortgage`, `officers`, `resolution`), `date` ("Date the filing was processed"), `description`, `type`, `transaction_id`, `paper_filed`, `pages`, `links.document_metadata`. | https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/resources/filinghistorylist |
| The profile has `accounts.accounting_reference_date`, `accounts.last_accounts.period_end_on` and `type`, `accounts.next_accounts.due_on` and `overdue`, `confirmation_statement.last_made_up_to`, `next_due` and `overdue`, `previous_company_names` (name, `effective_from`, `ceased_on`), `links.charges`, `links.insolvency`, `date_of_cessation`, `registered_office_is_in_dispute`, `undeliverable_registered_office_address`. | https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/resources/companyprofile |
| An officer's `date_of_birth` holds `month` and `year` only. | https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/resources/officerlist |
| A charge has `status` (`outstanding`, `fully-satisfied`, `part-satisfied`, `satisfied`), `created_on`, `delivered_on`, `satisfied_on`, `classification`, `persons_entitled[].name`, `particulars` (with `contains_fixed_charge`, `contains_floating_charge`), `secured_details`; the list has `total_count`, `satisfied_count`, `part_satisfied_count`. | https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/resources/chargelist |
| Insolvency `cases[]` have a `type` (for example `creditors-voluntary-liquidation`, `in-administration`), `dates[]` with a type, and `practitioners[]` with name, address, role and dates. | https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/resources/companyinsolvency |
| Document API: `GET https://document-api.company-information.service.gov.uk/document/{id}` (metadata) and `/content` with an `Accept` header; 302 to the file; an unsupported type gives 406. | https://developer-specs.company-information.service.gov.uk/document-api/reference/document-location/fetch-a-document |
| Streaming API: `https://stream.companieshouse.gov.uk`; streams for company information, filing history, insolvency, charges, officers, PSC, PSC statements, exemptions and disqualified officers; a separate streaming key ("the REST API and streaming API keys are not interchangable"); at most two connections for each account; a `timepoint` to resume; on a 429 wait one minute, or Companies House blocks the client's IP address. | https://developer-specs.company-information.service.gov.uk/streaming-api/guides/overview, https://developer-specs.company-information.service.gov.uk/streaming-api/guides/authentication |
| Accounts Data Product: a free zip of electronically filed accounts in iXBRL, XBRL or zipped iXBRL, a new file each morning Tuesday to Saturday (for example `Accounts_Bulk_Data-2026-11-21.zip`, 84.7 MiB; `-2026-10-01.zip`, 597.6 MiB), each kept 60 days, then monthly files for the last year. "Data is only available for electronically filed accounts." "Provided free of charge and is not supported." | https://www.gov.uk/guidance/companies-house-data-products, https://download.companieshouse.gov.uk/en_accountsdata.html |
| Company Data Product: a free monthly CSV snapshot of live companies, out within 5 working days of the month end; `BasicCompanyDataAsOneFile-2026-11-01.zip`, 471 MB, or 7 parts of about 70 MB. | https://download.companieshouse.gov.uk/en_output.html |
| Companies House "impose[s] no rules or requirements on how the information on the public register is used." | https://www.gov.uk/guidance/companies-house-data-products |
| The register guidance page says "All content is available under the Open Government Licence v3.0, except where otherwise stated", and that the information "is not intended to be comprehensive". | https://www.gov.uk/guidance/search-the-companies-house-register |
| A 2014 freedom of information answer: "CH does not make public information, including the Free Data Product, available under the Open Government Licence (OGL)", and "CH places no restriction on how the information is used". | https://assets.publishing.service.gov.uk/media/5a7f6e7f40f0b6230268f75c/Disc_Log_362__Enquiry_regarding_Companies_House_Free_Company_Data_Product-ver0.2.pdf |
| The OGL's default attribution: "Contains public sector information licensed under the Open Government Licence v3.0." The OGL does not license personal data in the information. | https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/ |
| "For directors appointed after 10 October 2015, only the month and year from the date of birth will be publicly available." A director's name, nationality and month and year of birth are public; the usual residential address is not. "Most PSC information is available to the public, apart from their home address and full date of birth." | https://www.gov.uk/guidance/your-personal-information-on-the-public-record-at-companies-house |
| Private company accounts are due 21 months after incorporation for the first accounts, and 9 months after the financial year end after that. | https://www.gov.uk/prepare-file-annual-accounts-for-limited-company |
| A confirmation statement is filed at least once every 12 months, up to 14 days after the review period ends; it confirms the statement of capital and shareholder information when the company has shares. | https://www.gov.uk/guidance/confirmation-statement-guidance |

### 1.3 Not confirmed

Each item names the check that settles it. The task that needs the answer runs the check as its first step and never prints the key.

| # | Fact | Settles it | Task |
| --- | --- | --- | --- |
| N1 | Settled (CR2, read with ci's key on 2026-11-22): the filing history answers at most 100 items a page (`items_per_page` 101 or 150 answers 100). Officers answered 75 and 31 items in one page and echoed the larger page size; no company read has over 100 officers. Charges answer every item and carry no `items_per_page`. | — | CR2 |
| N2 | Settled (CR2): the Document API's metadata call, its content call (302) and the file fetch do not lower `X-Ratelimit-Remain`; each public data API call lowers it by one. The API answers `X-Ratelimit-Limit` 600 and `X-Ratelimit-Window` 5m. | — | CR2 |
| N3 | Whether the 600 limit is for each key or for each account (ci and prod hold different keys). | The forum, or the developer hub's application page. | CR2 |
| N4 | Settled (CR2): a capital filing carries `description_values` (SH01 and SH06: `{ date, capital: [{ currency, figure }] }`; SH03 none). A registered office change (AD01) carries `{ change_date, old_address, new_address }`; a SAIL address change (AD02) `{ old_address, new_address }`. | — | CR2 |
| N5 | Settled (CR2): a confirmation statement is category `confirmation-statement`, type CS01, description `confirmation-statement-with-updates` or `-with-no-updates`, with `description_values { made_up_date }`. | — | CR2 |
| N6 | The licence of register data, given the OGL line on GOV.UK and the 2014 answer above. | A question to Companies House (OCR1). | CR13 |
| N7 | The size and reach back of the monthly Accounts Data Product files (the monthly page answered "Service Unavailable" on 2026-11-22). | Read `https://download.companieshouse.gov.uk/en_monthlyaccountsdata.html` again. | CR10 |

## 2. The reports

All six reports sit under CL1's drill-down. `/companies-house/company/<CRN>/reports` lists them with one line each; each report has its own address below. CL1's CloudFront Function rule and Express rewrite serve every path under `/companies-house/company/`, so the reports need no new rule. The same addresses work under `/cy/`.

One route serves every report: `GET /api/v1/companies-house/company/{companyNumber}/reports/{report}` (CR2). Each report is a module in `app/lib/companyReports/<report>.js` that takes the CR2 fetch layer and returns the report's JSON. The page fetches only the report the reader opens.

The call counts below are for one company with an empty cache. "Pages" means one call per 100 items (N1). With a warm cache a report costs no call.

Every report that reads the filing history (2.1, 2.3, 2.5 and 2.6) reads all of it with no `category` filter, through the same cache entries, one for each page. Each module filters the items by `category` and `type` itself. So one read serves all four reports.

### 2.1 Filing record and timeliness (`/reports/filings`)

- **Shows.** One row for each accounts filing and each confirmation statement (or annual return): the made-up date, the date Companies House processed it, the days between the end of the period and that date, and Companies House's usual time limit for it. Above the rows: the next accounts and confirmation statement due dates and whether the profile marks either as overdue (`accounts.next_accounts.overdue`, `confirmation_statement.overdue`). A count line: "12 accounts filings; 2 processed after the usual time limit."
- **The usual time limit** is computed from GOV.UK's rules: first accounts 21 months after incorporation; later accounts 9 months after the period end for a private company; a confirmation statement 14 days after the end of the review period. A public company's limits: not in this plan's sources; a public company's rows show the days only.
- **Sources.** Profile; the filing history items of category `accounts`, the confirmation statement category (N5) and `annual-return`.
- **Calls.** 1 (profile) + pages of the filing history: about 2 for a ten-year-old company.
- **Does not show.** An extension of the filing deadline or a changed accounting reference date that moved the limit: the filing history shows a change of reference date (type `AA01`) and the report lists it beside the next accounts row, with the words "A change of accounting reference date can move the time limit." A penalty: penalties are not on the public record. The date Companies House received a filing: the API gives the date it processed it, so the report says "processed" and never "received".
- **Wording.** "Accounts made up to 31 March 2024. Processed by Companies House on 18 December 2024, 262 days after the period end. The usual time limit is 9 months (275 days)." A late row: "Processed 30 days after the usual time limit." Never "late", "on time" or "missed".
- **Definitions.** Made-up date: the last day of the period the filing covers. Processed: the date Companies House put the filing on the register. Usual time limit: the time GOV.UK gives a private company to file; a change of reference date or an extension can move it.

### 2.2 People over time (`/reports/people`)

- **Shows.** A timeline of appointments and resignations of officers (directors and secretaries), and of persons with significant control notified and ceased, newest first. Counts: current directors, directors appointed and resigned in each of the last five years, current persons with significant control. For each person with significant control, the natures of control in words ("holds more than 75% of the shares"). PSC statements (for example "no individual or entity with significant control") with their dates.
- **Sources.** Officers (all, with resigned); PSC; PSC statements.
- **Calls.** Pages of officers (usually 1) + pages of PSC (usually 1) + 1 PSC statements: about 3.
- **Does not show.** Date of birth, nationality, country of residence, occupation, addresses and former names: the page drops them although some are public, because no report needs them. A person's other appointments (`/officers/{id}/appointments`): one call for each person, and not in this plan's reports.
- **Wording.** "Jane Smith appointed director on 4 May 2019. Resigned on 30 June 2023." Never "left", "stepped down", "joined".
- **Definitions.** Officer: a director or company secretary on the register. Person with significant control: someone who owns or controls the company in one of the ways the law lists, for example more than 25% of the shares or votes. Notified: the date the company told Companies House.

### 2.3 Share capital (`/reports/capital`)

- **Shows.** The capital filings in date order: allotments (`SH01`), statements of capital with a confirmation statement, and other capital filings, each with its type and date, and the total capital figure and currency where the filing history states it (N4). From the last filed iXBRL accounts (`cachedAccountsFigures`), the number of shares and their nominal value (`shareNote`). Where one person with significant control holds 75% or more of the shares, the line "One person with significant control holds 75% or more of the shares", stated from the PSC answer.
- **Sources.** The filing history items of category `capital` and the confirmation statement category (the cache entry 2.1 reads); PSC (shared with 2.2); the figures of the last accounts filing (shared with 2.6).
- **Calls.** 0 extra when 2.1, 2.2 and 2.6 are warm; else about 5 (filing history pages, PSC, and 2 for the last accounts document).
- **Does not show.** The names of shareholders and each shareholding, and share transfers. The public data API holds no shareholder list; the list is in the confirmation statement documents (PDF), and Submit reads structured shareholdings only through the XML Gateway `CompanyDataRequest`, which needs the company authentication code (`PLAN_AMENDED_ACCOUNTS.md` section 1.10). Reading the shareholder list from the filed documents is a horizon: until a task designs it, the report links each confirmation statement document and says "The shareholder list is in this document."
- **Wording.** "Allotment of shares (SH01), processed 3 February 2022. Statement of capital: £100." Never "raised", "invested", "diluted".
- **Definitions.** Allotment: new shares issued by the company. Statement of capital: the number, class and value of the company's shares on a date. Nominal value: the face value of a share, which can differ from what it was sold for.

### 2.4 Charges and insolvency (`/reports/charges`)

- **Shows.** Counts of charges: outstanding, part satisfied, satisfied. One row for each charge: created, delivered, status, satisfied date, persons entitled, the classification, and whether it contains a fixed or floating charge. Insolvency: each case with its type in words, its dates, and the practitioners' names and roles.
- **Sources.** Charges list; insolvency, read only when the profile has `links.insolvency`.
- **Calls.** Pages of charges (usually 1, none when the profile has no `links.charges`) + 0 or 1 insolvency: 0 to 2.
- **Does not show.** The charge document and its free-text particulars and secured details (a link to the filing shows them). A practitioner's address.
- **Wording.** "Charge created 12 March 2018, delivered 20 March 2018. Persons entitled: Example Bank plc. Status: satisfied on 1 October 2024." Never "debt", "secured lender at risk", "in trouble".
- **Definitions.** Charge: security the company gives a lender over its assets, registered at Companies House. Satisfied: the company told Companies House that what the charge secures is paid or released. Fixed and floating charge: a charge over named assets, and a charge over assets that change, such as stock.

### 2.5 Registered office and name history (`/reports/history`)

- **Shows.** Each previous company name with the dates it applied (`previous_company_names`). Each change of registered office (type `AD01` and the `address` category) with its date, and the old and new addresses where the filing history states them (N4). Flags the profile sets: the registered office is in dispute; post cannot be delivered to it.
- **Sources.** Profile; the filing history items of category `address` and `change-of-name` (the cache entry 2.1 reads).
- **Calls.** 0 extra when 2.1 is warm; else 1 + pages.
- **Does not show.** An old address the filing history does not state: the row links the filing. Trading names: not on the register.
- **Wording.** "Name changed from Acme Widgets Ltd on 5 June 2021." "Registered office changed on 9 January 2023."
- **Definitions.** Registered office: the official address for letters from Companies House and the courts. Previous name: a name the company was registered under before.

### 2.6 Accounts figures year on year (`/reports/accounts`)

- **Shows.** A table with one column for each year end (up to six: five filings, and the prior year of the oldest) and one row for each figure: net assets, cash at bank, debtors, creditors due within one year, creditors due after one year, turnover, profit or loss for the year, and average number of employees. Each cell links the filing it came from. A last column states the change between the two latest years as a signed amount and a percentage. Above the table: the accounts type of each year.
- **Sources.** The filing history items of category `accounts` (the cache entry 2.1 reads); for each filing, the Document API metadata and content as `application/xhtml+xml` through AA23's client; `readIxbrl` and `mapIxbrlAccounts` with `expect.regime` `"any"` and `firstAccounts` set for the oldest accounts filing in the filing history. Each year's figure comes from the filing whose current year it is; the prior year of the oldest filing fills the oldest column.
- **Calls.** Pages of the filing history (shared) + 2 for each filing not yet in the figure cache: about 12 for a ten-year-old company cold (2 pages and five filings), 2 when one new filing lands, 0 warm.
- **Does not show.**
  - Accounts filed on paper (`paper_filed`, or no `application/xhtml+xml` in the metadata): the column says "Filed on paper; the figures are in the document" with a link.
  - Turnover and profit in micro-entity accounts and in filleted small company accounts, which do not deliver a profit and loss account (`hasProfitAndLoss` false or `filleted` true): the cell says "Not stated: this company filed micro-entity accounts, which do not include a profit and loss account."
  - A document that `mapIxbrlAccounts` refuses (an `IxbrlError`, for example a balance sheet that does not balance): the column says "Figures not read from this filing" with the error's own sentence and a link. Nothing is guessed.
  - Dormant accounts state the balance sheet only; the column says so.
- **Wording.** "Net assets £12,400 (31 March 2025), £9,100 (31 March 2024). Change +£3,300, +36%." A percentage is omitted when the earlier figure is zero.
- **Definitions.** Net assets: what the company owns less what it owes, from the balance sheet. Cash at bank: money in the bank and in hand on the year end. Debtors: money owed to the company. Creditors due within one year: money the company owes and must pay within a year. Creditors due after one year: money it owes and pays later. Turnover: the value of sales in the year. Profit or loss for the year: what is left after all costs and tax; a negative figure is a loss. Average employees: the average number of people employed in the year, as the accounts state it.

## 3. Being a good citizen of the Companies House API

### 3.1 The limit and the terms

As built (CR2 and its review, 2026-11-22): the cache layer counts the calls of one report view and stops at 20 (`LOOKUP_CALLS.report`), answering 429 with `callLimitReached` and the items read; a cached value over 300 KB is stored in parts, and over 1.8 MB it is refused with `tooLarge` (413) for the kind's lifetime. CR3's page shows a sentence for each of those two states. The stop after a Companies House 429 is the one shared item `chlookup#stopped` in the security state table (`app/services/companiesHouseLookupLimit.js`), not a `#stop` item in the cache table. Paging reads on while a page is full to its own size, so a list that answers 50 a page is read to its end.

- The limit is 600 requests in five minutes, and every request after that gets a 429 until the window ends (section 1.2). Submit's lookups, filings and the public deadlines route share the key with the reports.
- Companies House imposes no rules on how register data is used, warns that it is not comprehensive, and bans applications that often exceed the limit (section 1.2).
- The reports budget: a cold report costs at most 20 calls (2.6: 10 pages of filing history at `maxPages`, and 10 for five filings), about 12 for a ten-year-old company, and a warm one none. At most 15 cold report views of different companies in five minutes stay within half the limit (15 × 20 = 300).

### 3.2 The cache

One DynamoDB table, `{env}-env-companies-house-cache`, on demand, with TTL on `ttl` (CR2). The partition key is the company number. The sort key is the Companies House path with its query, `figures#<transaction id>` for the figures of one filing, or `figures-bulk#<period end>` for CR10's figures. The 429 stop is one item with the partition key `#stop` and the sort key `stop`. DynamoDB deletes an expired item up to 48 hours late, so the layer treats an item whose `ttl` is past as absent. `invalidateCompany` is a Query on the company's partition, then a delete of each item whose sort key does not start with `figures`; it needs no Scan. The value is the trimmed answer, never the raw answer. The layer holds one trim function for each kind of answer, so every report that reads one entry gets the same trimmed value.

| Answer | Lifetime | Reason |
| --- | --- | --- |
| Profile | 10 minutes | The same as the public route's CloudFront cache (`FOUND_CACHE_SECONDS`); due dates change when a filing is processed |
| Filing history | 10 minutes | A new filing shows within ten minutes |
| Officers, PSC, PSC statements | 1 hour | They change only by a filing, which the filing history shows first |
| Charges, insolvency | 1 hour | The same |
| Accounts figures of one filing, by transaction id, or by period end from CR10 | 400 days | A filed document does not change; an amended set is a new filing with a new id |
| A 404 (no such company) | 10 minutes | A new company can appear |
| Any other error | not cached | |
| The 429 stop | until `Retry-After`, or 5 minutes | Companies House answers 429 to the end of the window |

- The figure cache holds the mapped figures and the facts the page shows (period, type, transaction id). It never holds the document text, nor the `directors` and `signer` that `mapIxbrlAccounts` also returns (`ixbrl-accounts.js:897-898`).
- The answer always carries the time Submit read it from Companies House, and the page shows it: "Read from Companies House at 14:05 on 22 November 2026."

### 3.3 One request at a time, and the stop on a 429

- A report module calls the layer one call after another, with `await` in order and never in parallel. Concurrent readers of one company are rare, and the cache absorbs a repeat; this plan adds no lock across Lambda instances.
- On a 429 the layer writes one stop item in the cache table that lasts to `Retry-After` (or five minutes). While it lasts, every report reads the cache only and makes no Companies House call. A report that lacks a part answers what it has with `partial: true` and `retryAfterSeconds`, and the page shows the lookup's rate-limit message (`ch.search.rate-limited-seconds`).
- The layer emits a metric for each Companies House call and each 429, in the `Submit/Business` namespace beside `PublicCompanyDeadlinesCompaniesHouse429` (`companiesHousePublicDeadlinesGet.js:34`).

### 3.4 Bulk products and the streaming API

- **Bulk.** The six reports read one company, so they call the API. A report that reads many companies (WL1's watch list with figures, the due list) reads the Accounts Data Product in place of the Document API: a daily job takes the morning's zip, maps each file with `mapIxbrlAccounts`, and writes the figures into the cache table under `figures-bulk#<period end>` in the company's partition. A bulk file names the company number and the period end and no transaction id, so a report over many companies reads these entries by company number and period end; CR9 keeps its own entries by transaction id. CR10 is the design for a report that reads many companies; no report in this plan does (decision D4). The Company Data Product (monthly) is not needed by these reports, because the profile is one call and cached.
- **Streaming.** A report that watches a company (WL1, the due list's alerts) needs to know when the company changes. The streaming API's filing history stream, read with a streaming key, tells Submit when a watched company files; the consumer then deletes that company's cache entries so the next view reads fresh data. CR11 and CR12 are the design for a watching report; WL1 and the due list read the filing history on a schedule instead (decision D3). The lifetimes in 3.2 bound how stale a report can be, and the page shows when it was read.

### 3.5 Attribution

Every report page ends with one line, keyed `ch.reports.source`: "Source: the Companies House register, read at <time>. Companies House does not check the information companies send it." The wording of the licence line is decision D5: the source sentence stands without a licence statement until OCR1's answer, then carries that answer.

### 3.6 Personal data

- The layer's trim for each kind drops the fields named in the plan's rules before the cache write. A unit test of each module asserts that its cached value holds no `date_of_birth`, `nationality`, `country_of_residence`, `occupation`, `address` of a person or `former_names`, and CR9's test asserts that the figure cache holds no `directors` or `signer`.
- The cache holds names of officers, persons with significant control, persons entitled to a charge and practitioners, because the page shows them, for at most one hour.
- `web/public/privacy.html` gains one line (CR14): Submit keeps a copy of public Companies House records that a reader looks up for up to one hour, and the figures read from filed accounts for up to 400 days.

## 4. The shared fetch and cache layer

`app/services/companiesHouseCache.js` (CR2):

- `cachedCompaniesHouseGet(companyNumber, endpoint, queryParams, { kind })`: reads the cache, else calls `companiesHouseHttpGet`, trims with the trim of `kind`, writes the cache with the lifetime of `kind`, and returns `{ data, readAt, fromCache }`. Under the 429 stop it reads the cache only.
- `cachedCompaniesHouseGetAllPages(companyNumber, endpoint, queryParams, { kind, maxPages })`: pages with `start_index` and `items_per_page` (N1) up to `maxPages` (default 10), one page after another.
- `cachedAccountsFigures(companyNumber, filingItem, { firstAccounts })`: the figure cache by transaction id, filled through AA23's Document API client functions and `mapIxbrlAccounts` with `expect.regime` `"any"` and the `firstAccounts` the caller gives (CR9 adds the fill; CR2 adds the cache kind). The caller sets `firstAccounts` when the filing is the oldest accounts filing in the filing history, so one filing maps the same whichever report fills its entry. Under the 429 stop it reads the cache only, and a 429 from the Document API writes the stop.
- `invalidateCompany(companyNumber)`: queries the company's partition and deletes its entries except the figures (CR12 calls it).
- The route `GET /api/v1/companies-house/company/{companyNumber}/reports/{report}` is one Lambda, `app/functions/companies-house/companiesHouseCompanyReportGet.js`, with `enforceBundles` as the officers route does (`companiesHouseOfficersGet.js:66-71`). One Lambda for all six reports keeps the stack's resource count low (CL1 names the total against CloudFormation's 500).

## 5. Who sees the reports, and the pages

- **Activity.** A new activity `company-reports` beside `company-lookup` in `web/public/submit.catalogue.toml`: `bundles = ["default"]`, `display = "on-entitlement"`, `metered = false`, the paths `^/api/v1/companies-house/company/[^/]+/reports/[^/]+$` and the page. Its `environments` list every environment except `prod` until CR14 adds `prod`. The bundle is `default` (decision D1).
- **Page.** The reports are views of CL1's drill-down page (`companySearch.html` and its script, or the file CL1 names), at `/companies-house/company/<CRN>/reports` and `/reports/<filings|people|capital|charges|history|accounts>`. The page reads the path on load and uses `history.pushState`, as CL1 specifies. The reports index links from the profile view. Without the activity, the index names the bundle that has it.
- **Each view** shows the report's rows, the definitions under a "What these words mean" list, the read time, the source line, and the partial and rate-limit states.

## 6. Tasks

`CR` tasks are a session's. `OCR` tasks are the operator's. Every task's gates: `npm run bundle` first in a worktree; the unit tests it reaches; `npx eslint` and `npx prettier --check` on each changed file; `./mvnw clean verify` when a route or stack changes; a browser test of each changed page; the `companies-house` simulator behaviour journey on the simulator lane under `lockf -k /tmp/submit-simulator.lock`; Welsh strings in `i18n/cy.toml` with the English and `npm run build:welsh`; `visual-review` on each new view.

### 6.1 The task table

| Label | Task | Waits on | Class | Model | Size |
| --- | --- | --- | --- | --- | --- |
| CR4 | Filing record and timeliness | nothing | machine-only | Sonnet | ~6 files |
| CR5 | People over time | nothing | machine-only | Sonnet | ~6 files |
| CR6 | Share capital | CR4, CR5, CR9 | machine-only | Sonnet | ~5 files |
| CR7 | Charges and insolvency | nothing | machine-only | Sonnet | ~6 files |
| CR8 | Registered office and name history | CR4 | machine-only | Sonnet | ~5 files |
| CR9 | Accounts figures year on year | nothing | machine-only | Sonnet | ~9 files |
| OCR1 | Ask Companies House the licence question | nothing | human-driven | operator | 0 files |
| CR14 | Copy, privacy line, guide and launch on prod | CR4 to CR9 | machine-only | Sonnet | ~8 files |

CR4, CR5, CR7 and CR9 run in parallel (wave set bramble, wave 1); CR6 and CR8 follow in wave 2. They share `i18n/cy.toml`, the page script, `REPORT_MODULES`, `wording.js` and the simulator files as append-only registries, and the later one rebuilds the Welsh text. CR10 to CR12 (the Accounts Data Product, the streaming key and the stream that clears the cache) are briefed below and are not tasks until a report needs them (D3, D4).

### 6.2 Briefs

**What every report task builds on** (CR2 and CR3 are on `main`):

- **The module.** Each report is `app/lib/companyReports/<name>.js`, a function `(companyNumber) => Promise<object>` added to `REPORT_MODULES` in `app/functions/companies-house/companiesHouseCompanyReportGet.js` (line 34; the names are `REPORT_NAMES`, line 29). The route runs it under `withCompaniesHouseCallLimit(LOOKUP_CALLS.report)`, 20 calls (`app/services/companiesHouseLookupLimit.js` line 55), so a module past 20 calls gets a partial answer.
- **The reads.** `cachedCompaniesHouseGet` (line 278) and `cachedCompaniesHouseGetAllPages` (line 329) in `app/services/companiesHouseCache.js`, with a kind from `KINDS` (line 58): `profile`, `filingHistory`, `officers`, `psc`, `pscStatements`, `charges`, `insolvency`, `figures`. Each kind's trim decides which fields the cache keeps; a field a report needs and the trim drops is added to that trim in the same task.
- **The view.** `web/public/companies-house/companyReports.page.js` keeps `REPORTS()` (line 17) and the `REPORT_VIEWS` registry (line 170); each task adds its renderer to `REPORT_VIEWS[name]`. Browser test: `web/browser-tests/companyReports.browser.test.js`.
- **The wording.** `app/lib/companyReports/wording.js` has `BANNED_WORDS`, `REPORT_BANNED_WORDS` (filings, people, capital and charges exist; CR8 adds `history`, CR9 `accounts`) and the Welsh lists.
- **The simulator.** Routes in `app/http-simulator/routes/companies-house.js`; scenarios in `app/http-simulator/scenarios/companies.js` and `filing-history.js` (`getFilingHistory`, line 238). No charges, insolvency or PSC statements route exists yet.
- **The journey.** `npm run test:companiesHouseBehaviour-simulator`, one suite at a time under `lockf -k /tmp/submit-simulator.lock`.

#### CR2. The fetch and cache layer, the cache table and the report route

- **Goal.** Section 3 and section 4, built: one cache, one stop on a 429, one paging helper, one report route.
- **First step.** Through ci's key (`COMPANIES_HOUSE_API_KEY_ARN`, profile `diya-submit-ci`; never print the key), settle N1, N4 and N5: read the filing history, officers and charges of two real companies, one with more than 100 filings, one with a capital filing and an address change; record `items_per_page` behaviour, `description_values` and the confirmation statement category in this plan's section 1.3. Ask N2 and N3 in the pull request only if the headers do not settle them.
- **Files.** `app/services/companiesHouseCache.js` (new); `app/data/dynamoDbCompaniesHouseCacheRepository.js` (new, following the existing `app/data/dynamoDb*Repository.js` files); the table in `infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java` with its name in `infra/main/java/co/uk/diyaccounting/submit/names/DataNames.java` and TTL on `ttl` (as `-ReceiptsTTL` at `DataStack.java:187`), `RemovalPolicy.DESTROY`, no PITR (a cache); the Lambda `app/functions/companies-house/companiesHouseCompanyReportGet.js` with its name in `CompaniesHouseNames.java`, its function and route in `CompaniesHouseStack.java`, read and write on the table only; the Express route in `app/bin/server.js` beside `companiesHouseOfficersGetApiEndpoint` (line 436); the simulator lane uses a local table as the other tables do; the activity `company-reports` (section 5) and the four catalogue tests named in `NEXT.md`'s shared facts.
- **The route.** `{report}` must be one of the six names; an unknown name answers a JSON 404. CR2 registers an empty module map; each report task adds its module.
- **Metrics.** `CompanyReportsCompaniesHouseCall` and `CompanyReportsCompaniesHouse429` in `Submit/Business`.
- **Tests.** Unit tests of the layer: a miss calls once and writes the value trimmed by its kind; two calls of one entry from different reports get the same value; `invalidateCompany` deletes the company's entries and keeps its figures; a hit makes no call; an item whose `ttl` is past is a miss, and a past stop item stops nothing; lifetimes by kind; a 404 cached for 10 minutes; a 500 not cached; a 429 writes the stop and the next call reads the cache only; paging stops at `maxPages`; calls are in sequence (a fake client that fails on overlap). Unit tests of the route: bundle enforcement, an invalid number, an unknown report. `resourceCountIs` counts in `infra/test/java` rise; name the stack total against 500 in the pull request.
- **Waits on**: CL1 (routes agent: AA23's client), WL1 (catalogue order). **Class**: machine-only. **Model**: Sonnet. **Size**: ~16 files.

#### CR3. The reports views on the drill-down page

- **Goal.** The page shell that each report task fills: the `/reports` index and one view per report address, the read time, the source line (section 3.5), the definitions list, the partial and rate-limit states.
- **Files.** CL1's drill-down page and script; a new `web/public/companies-house/companyReports.page.js` for the report views (keeps `companySearch.page.js` small); `app/lib/companyReports/wording.js` with the list of banned words from the plan's rules and a unit test that each module's words pass; the Welsh strings; a browser test of the index and of one stub view.
- **Without the activity** the index names the bundle that has it.
- **Waits on**: CR2, CL1 (page agent). **Class**: machine-only. **Model**: Sonnet. **Size**: ~8 files.

#### CR4. Filing record and timeliness

- **Goal.** Report 2.1, at `/reports/filings`.
- **Files.** `app/lib/companyReports/filings.js` (the module and the time-limit rules from section 2.1, with GOV.UK's two URLs in a comment); its unit tests (first accounts, later accounts, a confirmation statement, an `AA01` in the history, a public company shows days only, a company with no filings); simulator data in `app/http-simulator/scenarios/companies.js` and `app/http-simulator/scenarios/filing-history.js` (a company with one filing past the usual limit); `REPORT_BANNED_WORDS.filings` exists; the view in `companyReports.page.js`; Welsh strings; the browser test.
- **Waits on**: nothing. **Class**: machine-only. **Model**: Sonnet. **Size**: ~6 files.

#### CR5. People over time

- **Goal.** Report 2.2, at `/reports/people`.
- **Files.** `app/lib/companyReports/people.js`; unit tests (pages of officers, resigned officers, a PSC ceased, a PSC statement, the dropped fields absent from the cached value); the simulator's officers and PSC answers gain a resigned officer, a second page and a statement (`app/http-simulator/routes/companies-house.js:104`, `:123`, `getOfficers` in `scenarios/companies.js` line 188, and a new `persons-with-significant-control-statements` route); the `officers`, `psc` and `pscStatements` trims already keep what the report shows; the view; Welsh strings, with each nature of control in words; the browser test.
- **Waits on**: nothing. **Class**: machine-only. **Model**: Sonnet. **Size**: ~6 files.

#### CR6. Share capital

- **Goal.** Report 2.3, at `/reports/capital`, using what CR2's first step recorded for N4.
- **Files.** `app/lib/companyReports/capital.js`, which calls the layer for the filing history and the PSC (the entries CR4 and CR5 also read) and calls `cachedAccountsFigures` (written by CR9, with `shareNote` in the `figures` trim) for the last accounts filing, with `firstAccounts` set by the rule in section 4; unit tests (an allotment with a capital figure, one without, a sole 75%-or-more PSC, no capital filings); simulator capital filings; the view, with the horizon sentence and the confirmation statement links; Welsh strings; the browser test.
- **Waits on**: CR4, CR5, CR9. **Class**: machine-only. **Model**: Sonnet. **Size**: ~5 files.

#### CR7. Charges and insolvency

- **Goal.** Report 2.4, at `/reports/charges`.
- **The profile's links.** The `profile` trim drops `links` and keeps `has_charges` and `has_insolvency_history`; read the charges only when `has_charges` is true and the insolvency only when `has_insolvency_history` is true. The `charges` and `insolvency` trims already drop the particulars' free text and the practitioners' addresses.
- **Files.** `app/lib/companyReports/charges.js`; unit tests (no charges, outstanding and satisfied charges, an insolvency case, the practitioner's address dropped); simulator routes for `/company/{n}/charges` and `/company/{n}/insolvency` with one company that has both; the view; Welsh strings for each status and case type; the browser test.
- **Waits on**: nothing. **Class**: machine-only. **Model**: Sonnet. **Size**: ~6 files.

#### CR8. Registered office and name history

- **Goal.** Report 2.5, at `/reports/history`.
- **The profile trim.** It keeps `previous_company_names` and drops `registered_office_is_in_dispute` and `undeliverable_registered_office_address`; add both to `KINDS.profile` in `app/services/companiesHouseCache.js` (CR9 edits the same file in wave 1, so CR8 starts from its version).
- **Files.** `app/lib/companyReports/history.js`; the two fields in the `profile` trim; unit tests (previous names, an address change with and without the old address, the dispute and undeliverable flags); simulator data; the view; Welsh strings; the browser test.
- **Waits on**: CR4. **Class**: machine-only. **Model**: Sonnet. **Size**: ~5 files.

#### CR9. Accounts figures year on year

- **Goal.** Report 2.6, at `/reports/accounts`, and the figure cache fill.
- **`cachedAccountsFigures` does not exist yet.** CR9 writes it in `app/services/companiesHouseCache.js` with `figuresSk` (line 178) and `KINDS.figures`. That trim keeps `transactionId`, `period`, `type`, `regime`, `balanceSheet`, `profitAndLoss`, `filleted` and `dormant`; add `averageEmployees` (this report) and `shareNote` (CR6), and never `directors` or `signer`.
- **The document.** Reuse `documentOfItem` (`app/services/companiesHouseFiledAccounts.js` line 132), `IXBRL_CONTENT_TYPE` and `MAX_DOCUMENT_RESPONSE_BYTES`, and `companiesHouseDocumentMetadata` and `companiesHouseDocumentContent` (`app/services/companiesHouseDocumentApi.js` lines 49 and 91). `readLastAccounts` (`app/services/companiesHouseLastAccounts.js` line 75) classes a set as mapped, paper, no-ixbrl, too-large or unreadable; follow those outcomes for each column. Submit's diya-gl is 1.2.99 (`package.json` line 412).
- **Files.** `app/lib/companyReports/accounts.js` and `cachedAccountsFigures`; unit tests on Submit's own fixtures (`app/test-helpers/accountsDocumentCases.js`) and on the real register documents in `app/unit-tests/fixtures/filed-accounts/` (`register-micro-entity-*.xhtml`, `register-small-company-filleted-*.xhtml`, with `expected.json`); cases: a paper filing, a micro-entity with no profit and loss, a filleted small company, a dormant company, an `IxbrlError`, first accounts, a zero earlier figure (no percentage), the figure cache holds no `directors` or `signer`, a 429 from the Document API writes the stop; the simulator serves two iXBRL filings and one PDF-only filing (`getDocumentMetadata` and `getDocumentContent` in `app/http-simulator/scenarios/filing-history.js`, lines 407 and 428); the view; Welsh strings; the browser test.
- **Waits on**: nothing. **Class**: machine-only. **Model**: Sonnet. **Size**: ~9 files.

#### CR10. Figures from the Accounts Data Product

- **Goal.** A daily job fills the figure cache from the Accounts Data Product, so a report over many companies reads no Document API call (section 3.4).
- **First step.** Settle N7.
- **Design.** An EventBridge schedule at 08:00 UK time Tuesday to Saturday starts a Lambda that streams the day's zip from `https://download.companieshouse.gov.uk/`, maps each iXBRL file with `mapIxbrlAccounts`, and writes the figures under `figures-bulk#<period end>` in the company's partition (section 3.2), trimmed by the figure kind's trim (no `directors` or `signer`; a unit test asserts it). Files the mapping refuses are counted, never guessed. The zip is not kept.
- **Cost.** About £1 a month (a daily Lambda run of up to 15 minutes at 3 GB, and DynamoDB writes for each new filing on the register); not measured. The run time against Lambda's 15-minute limit is measured on ci first; if a day's file does not fit, the task stops and reports.
- **Waits on**: a report that reads many companies (D4), CR9. **Class**: machine-ask. **Model**: Sonnet. **Size**: ~10 files.

#### CR11. A streaming API key

- **Goal.** A streaming key for ci and one for prod, in Secrets Manager through the GitHub secret path.
- **Steps (the operator's).** 1. Open https://developer.company-information.service.gov.uk/manage-applications and sign in. 2. Create an application of type Streaming API for each environment. 3. Set each key as a GitHub environment secret from a terminal, with the name CR12 gives (`gh secret set COMPANIES_HOUSE_STREAM_KEY --env ci`, then `--env prod`).
- **Waits on**: a watching report that needs the stream (D3). **Class**: human-driven. **Size**: 0 files.

#### CR12. The filing history stream clears the cache

- **Goal.** When a company that Submit holds in the cache files something, its cache entries go (section 3.4), so the next report reads fresh data.
- **Design.** A Lambda on an EventBridge schedule every 15 minutes opens `https://stream.companieshouse.gov.uk/filings` with the streaming key and the last stored `timepoint`, reads for up to 14 minutes, calls `invalidateCompany` for each event's company (a company with no entries costs one Query and no delete), stores the last `timepoint`, and closes. One connection at a time (the limit is two for each account). On a 429 it waits one minute before the next connection, as the guide says; on a 416 it starts from now and logs it. The secret path: `deploy-environment.yml` writes the GitHub secret to Secrets Manager, as for `COMPANIES_HOUSE_API_KEY_ARN`.
- **Cost.** About £5 a month for the Lambda (128 MB, held open 14 minutes, 96 runs a day), before the free tier; not measured.
- **Tests.** Unit tests of the event reader (a filing event calls `invalidateCompany` with its company number, a 429, a 416, the timepoint stored).
- **Waits on**: CR11, CR2. **Class**: machine-only. **Model**: Sonnet. **Size**: ~10 files.

#### OCR1. Ask Companies House the licence question

- **Goal.** The operator posts the draft `../private.diyaccounting.co.uk/companies-house/correspondence/DRAFT_DATA_LICENCE_QUESTION.md` on the developer forum, and pastes the answer into the same folder; a session then records it in section 1.3 and in the source line (D5).
- **Waits on**: nothing. **Class**: human-driven.

#### CR14. Copy, privacy line, guide and launch on prod

- **Goal.** The reports on prod, with their copy and proof.
- **Files.** `prod` on `company-reports`; the privacy line (section 3.6) in `web/public/privacy.html`; an FAQ entry; the capability entry in `REPORT_CAPABILITIES.md` (the `capabilities` skill); the guide screenshots (`npm run video:walkthrough`) for the reports journey; `visual-review` and `ui-ux-pro-max` on them.
- **Waits on**: CR4, CR5, CR6, CR7, CR8, CR9. **Class**: machine-only. **Model**: Sonnet. **Size**: ~8 files.

### 6.3 State of the open tasks

Source of each task: the operator, 2026-11-22. Owner is Claude Code, except OCR1 (Operator). Model, size and repository are in the table of section 6.1. "Waits on" lists the tasks not yet on `main`; the briefs' "Waits on" lines list every dependency.

| Label | Class | State | Waits on | Unblocks | Repository |
| --- | --- | --- | --- | --- | --- |
| CR4 | machine-only | ready | nothing | CR6, CR8, CR14 | submit |
| CR5 | machine-only | ready | nothing | CR6, CR14 | submit |
| CR7 | machine-only | ready | nothing | CR14 | submit |
| CR9 | machine-only | ready | nothing | CR6, CR14 | submit |
| CR6 | machine-only | blocked | CR4, CR5, CR9 | CR14 | submit |
| CR8 | machine-only | blocked | CR4 | CR14 | submit |
| CR14 | machine-only | blocked | CR4, CR5, CR6, CR7, CR8, CR9 | WDM7 (`PLAN_WATCH_DUE_CAMPAIGN.md`) | submit |
| OCR1 | human-driven | ready | nothing | the licence statement in the source line (D5) | none |

- OCR1: the draft is `../private.diyaccounting.co.uk/companies-house/correspondence/DRAFT_DATA_LICENCE_QUESTION.md`. The operator posts it on https://forum.companieshouse.gov.uk in the category "API Question", pastes the answer into a file in the same folder, and a session then records it in section 1.3 and in the reports' source line.
- CR4, CR5, CR7 and CR9 run in parallel and land one after the other (shared `i18n/cy.toml` and page script).

## 7. Costs

- Companies House: the public data API, the Document API, the streaming API and the bulk products are free (sections 1.2 and 3.4).
- The cache table: on demand, about £1 a month or less at 10,000 report views a month; not measured.
- CR10 would cost about £1 a month and CR12 about £5 a month, when a report needs them.

## 8. Decisions

Operator, 2026-11-22.

| # | Decision | Design |
| --- | --- | --- |
| D1 | Who sees the reports | The `default` bundle, every signed-in account, as the lookup. The cache bounds the calls. |
| D2 | Where answers are cached | The DynamoDB cache of trimmed answers (section 3.2). One cache serves every reader and keeps Submit inside the limit. |
| D3 | The streaming API | CR11 and CR12 wait until a report watches a company on demand; the six reports read one company, and the lifetimes in 3.2 bound their staleness. |
| D4 | The Accounts Data Product | CR10 waits until a report reads figures for many companies; no report in this plan does. |
| D5 | The source and licence line | The source sentence of section 3.5 without a licence statement until OCR1's answer, then that answer. |
