<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: Companies House confirmation statement (CS01) through the XML Gateway

## User assertions (verbatim)

> Create a PLAN_*.md doc for this [filing a confirmation statement by API] ... have a Fable 5.1
> sub-agent design it to fit in with our existing offerings and split into tasks

## Starting facts, checked

| # | Starting fact | Verdict | Source |
|---|---|---|---|
| 1 | The REST API Filing service supports registered office, registered email and insolvency filings only | Correct. It lists Transactions, Registered Office Address, Insolvency and Registered Email Address; nothing else. Submit files the first two on prod (`web/public/submit.catalogue.toml` lines 404 to 421 carry `prod`) | <https://developer-specs.company-information.service.gov.uk/manipulate-company-data-api-filing/guides/overview> |
| 2 | The XML Gateway has `ConfirmationStatement-v1-3.xsd`, live since 2024-03-05 | Listed live (released 25/05/2023, live 05/03/2024), and it is the wrong schema for a filing today. Since 18 November 2025 the confirmation statement is `ConfirmationAndVerificationStatement-v1-0.xsd` (live 18/11/2025), and both the envelope `Class` and the `FormIdentifier` are `ConfirmationAndVerificationStatement`; a `Class` of `ConfirmationStatement` failed at launch. v1-3 has no verification block and no path for a director's personal code. Whether v1-3 still routes at all is an open question below | <https://xmlgw.companieshouse.gov.uk/SchemaStatus>; <https://xmlforum.companieshouse.gov.uk/t/launch-most-working-but-some-not-others-have-been-successful/1851>; <https://xmlforum.companieshouse.gov.uk/t/forthcoming-xml-schema-changes/1723> |
| 3 | Submit already sends GovTalk submissions for iXBRL accounts; live presenter E0000052288, test presenter 66666727000; 000004 unanswered with error 9999 | Correct | `PLAN_COMPANIES_HOUSE_ACCOUNTS_FILING.md` lines 19 to 23; `NEXT.md` O34d, B34.6c; `../DRAFT_EMAIL_XMLGW_000004.md` |
| 4 | A CS01 carries a £50 fee charged to the presenter's credit account | Fee correct: £50 online, £50 software, £110 paper, since 1 February 2026 (was £34). Charged once per 12-month payment period, with the first statement in the period. Mechanism correct in principle, wrong for this presenter today: the fee is collected through a Companies House credit account, a separate application from the presenter account. E0000052288 was issued on 2026-09-05 by the "apply to file with Companies House using software" service, which covers accounts and documents with no fee. No credit account exists. Gateway errors 5003 "Account Unknown" and 5006/9984 "insufficient funds" are the failure shapes | <https://www.gov.uk/government/publications/companies-house-fees/companies-house-fees> (updated 2 July 2026); <https://www.gov.uk/guidance/apply-to-file-with-companies-house-using-software>; <https://www.gov.uk/government/publications/apply-for-a-companies-house-credit-account>; TIS 5.3 §2.4.4 and §3.1.1; the acceptance email of 2026-09-05 17:03 in the antony@ mailbox; <https://xmlgw.companieshouse.gov.uk/errors.shtml> |
| 5 | Identity verification applies to directors and PSCs; a director's personal code blocks the 5 October 2026 statement | Correct. The schema carries one `VerificationStatement/Director/Person` per director with name, full date of birth, the 11-character `CompaniesHousePersonalCode`, the `INDIVIDUAL_VERIFIED` statement and an optional `NameMismatchReason`. A PSC's code goes separately: the PSC web service or `PSCVerificationStatement-v1-0.xsd` (VS01), within 14 days starting the day after the statement date for a director-PSC | `ConfirmationAndVerificationStatement-v1-0.xsd`; `baseTypes-v3-7.xsd` `VerificationPersonType`, `VerificationDetailsType`; <https://www.gov.uk/guidance/when-you-need-to-verify-your-identity-for-companies-house>; <https://www.gov.uk/guidance/provide-psc-verification>; `../NEXT_OPERATOR_RUNBOOK.md` task B |

Two more facts the sources turned up:

- The standard test service (test presenter, `GatewayTest` 1) did not accept the 18 November 2025 schemas when they were released. Companies House's instruction on 2025-11-04: use the live presenter credentials, `PackageReference` 0012, `GatewayTest` 1, against `https://xmlgw-sandpit-staging.companieshouse.gov.uk/v1-0/xmlgw/Gateway`. Whether that still holds is open question Q1. Source: <https://xmlforum.companieshouse.gov.uk/t/shareholding-in-cs01-changes-fatal-9999-duplicate-shareholdingid-error/1832>.
- The ECCTA "presenter measures" (a presenter must be identity-verified or an ACSP) are postponed to no earlier than November 2026. A horizon for the presenter account, not a blocker for this plan. Source: <https://xmlforum.companieshouse.gov.uk/t/implementation-timeline-for-presenter-measures-update/1907>.

## What a confirmation statement is, in the terms the build needs

- One a year, made up to a review date at most 12 months after the last; 14 days to file after the review date. A company may file more than one in a payment period; only the first in the 12-month payment period carries the fee. Two statements cannot share a review date. Source: TIS 5.3 §2.4.2 "Annual Return/Confirmation statement"; <https://www.gov.uk/guidance/confirmation-statement-guidance>.
- The statement itself can change SIC codes, the statement of capital, shareholders, the trading-on-market declaration and the PSC exemption statements. Officer, PSC and registered office changes go on their own forms first. Source: TIS 5.3 §2.4.2.
- Optional data sets are supplied in full when, and only when, they changed since the last confirmation. Source: the schema's own annotation. Reject 11686 ("you must provide … name of each shareholder …") was raised against a filing that did carry shareholders; that thread has no answer, so open question Q2 covers it.
- Since 18 November 2025 the statement also carries the verification statement for every director, and the lawful purpose statement (schema-optional, rejected when absent at launch, so the page always sends it).

DIY Accounting Limited 06846849: last CS01 25 October 2025, next made up to 21 September 2026, due 5 October 2026 (`NEXT.md` OCS). Three directors, all three PSCs.

## What exists to reuse

| Concern | Reuse | Where |
|---|---|---|
| GovTalk header and envelope, MD5 presenter hashing, `GatewayTest` | `buildHeaderXml`, `buildEnvelopeXml`, `hashPresenterCredential` | `app/services/companiesHouseXmlGateway.js` lines 91 to 148 |
| `FormSubmission` body shape (`FormHeader`, `DateSigned`, `Form`) | `buildAccountsSubmission`; generalise into `buildFormSubmission` | same file, lines 152 to 202 |
| Status poll request and response parsing (`Status`, `Reject`, `GovTalkErrors`) | `buildStatusRequest`, `parseGatewayResponse` | same file, lines 204 to 280 |
| Submission numbers, unique per presenter across every form | `allocateSubmissionNumber`, counter key line 24 | same file, lines 282 to 309 |
| Presenter secrets, redaction, endpoint, POST | `resolvePresenterCredentials`, `redactPresenterCredentials`, `getXmlGatewayUri`, `postToGateway` | same file, lines 63 to 89, 311 to 352 |
| Submit Lambda pattern: `enforceBundles`, validate, allocate, `putAsyncRequest` pending, post, `GovTalkErrors` to 500, 201 with submission number, activity events | `companiesHouseAccountsPost.js` | `app/functions/companies-house/companiesHouseAccountsPost.js` lines 213 to 347 |
| Poll Lambda pattern: async record short-circuit, `REJECT` to failed, `ACCEPT` to receipt and completed | `companiesHouseAccountsGet.js` | `app/functions/companies-house/companiesHouseAccountsGet.js` lines 57 to 152 |
| Company profile with `sicCodes`, `confirmationStatementNextDue`, `confirmationStatementNextMadeUpTo` | `getCompanyProfile` | `app/functions/companies-house/companiesHouseCompanyGet.js` lines 92 to 113 |
| Public data API client, company number check, 429 handling | `companiesHouseHttpGet`, `isValidCompanyNumber`, `httpResponseFromCompaniesHouseResponse` | `app/services/companiesHouseApi.js` lines 70, 94, 131 |
| Async requests and receipts | `putAsyncRequest`, `getAsyncRequest`, `putReceipt` | `app/data/dynamoDbAsyncRequestRepository.js` lines 21, 112; `app/data/dynamoDbReceiptRepository.js` line 23 |
| Simulator gateway: class dispatch, credentials, error envelopes | `apiEndpoint` dispatch on `Class` | `app/http-simulator/routes/companies-house-xmlgw.js` lines 107 to 231; `app/http-simulator/scenarios/accounts-filing.js`; mounted at `app/http-simulator/server.js` line 38 |
| Simulator public data: company profile and search | `routes/companies-house.js` lines 37 to 81; `scenarios/companies.js` `getCompany` line 97 | `app/http-simulator/` |
| Page skeleton: head block, RUM placeholders, `companyView` to `resultView` flow, `pollUntilSettled` | `fileMicroEntityAccounts.html` | `web/public/companies-house/fileMicroEntityAccounts.html` lines 1 to 40, 242 to 430 |
| Browser service for the lookup | `getCompanyProfile`, `normaliseCompanyNumber` | `web/public/lib/services/companies-house-service.js` lines 15, 66 |
| Catalogue activity shape, single-line `paths` | `file-micro-entity-accounts` | `web/public/submit.catalogue.toml` lines 423 to 431 |
| MCP transport with 202 polling; accounts tools; tool registration with zod schemas | `callSubmitApi`, `previewMicroEntityAccounts`, `submitMicroEntityAccounts`, `pollAccountsSubmission` | `mcp/lib/submit-tools.js` lines 93, 240 to 289; `mcp/lib/server.js` lines 49 to 75, 201 to 228; `mcp/test/submit-tools.test.js` |
| CDK: accounts Lambdas, env helpers, presenter secret grants, health alarm | `accountsFilingLambdaEnv`, `accountsGatewayTestFlag`, `withPresenterSecretArns`, `grantCompaniesHousePresenterSecretsAccess`, `Lambda.stackHealthAlarm` | `infra/main/java/co/uk/diyaccounting/submit/stacks/CompaniesHouseStack.java` lines 669 to 775, 913 to 955 |
| CDK names, props, test | `SubmitSharedNames.java` lines 1002 to 1017 and 3958 to 4002; `SubmitApplication.java` lines 218 to 225; `CompaniesHouseStackTest.java` line 167 (Lambda count 13); `DataStack.java` line 796 (async table) | `infra/` |
| Presenter secrets to Secrets Manager | steps at lines 260 to 287 | `.github/workflows/deploy-environment.yml` |
| Console-as-code and the assert script | `infra/companies-house/companies-house.toml` (`presenter_id`, `presenter_code` per environment); `infra/companies-house/companies-house-assert.js` | `infra/companies-house/` |
| Unit-test fixtures and the published examples | `fixtures/companies-house-xmlgw/` (`FormSubmission-v2-11.xsd`, `GetSubmissionStatus-v2-9.xsd`, `Egov_ch-v2-0.xsd`, request and response examples) | `app/unit-tests/services/companiesHouseXmlGateway.test.js` lines 61 to 70 |
| Behaviour suite and steps | `fileMicroEntityAccounts.behaviour.test.js`; `behaviour-companies-house-accounts-steps.js` (11 exported steps) | `behaviour-tests/companiesHouse/`, `behaviour-tests/steps/`; `package.json` lines 301 to 304; `playwright.config.js` line 318 |
| API docs and analytics | `web/public/docs/api/openapi.json` lines 768, 840, 2253; `infra/main/resources/analytics/views/v_submissions_by_activity_daily.sql` lines 14 to 18 | |

## Design

### The journey

Page `web/public/companies-house/fileConfirmationStatement.html`, built from `fileMicroEntityAccounts.html`. Five views.

1. **Which company.** Company number, lookup through `getCompanyProfile`. Shows name, status, `confirmationStatementNextMadeUpTo`, `confirmationStatementNextDue`, the SIC codes, the registered office. Two new public-data reads fill the rest: officers (`GET /company/{n}/officers`) and PSCs (`GET /company/{n}/persons-with-significant-control`). Each current director shows with `identity_verification_details` when the register has it, so an unverified director is visible before anything secret is typed. Refuses a company whose `company_status` is not `active` or whose `type` is not `ltd` (private company limited by shares, `CompanyCategory` `BYSHR`); other categories are a later widening.
2. **Authentication code and register data.** The customer types the company authentication code. The page calls `POST /api/v1/companies-house/company/{n}/filing-data` with it. The Lambda sends `CompanyDataRequest` (CompanyData-v3-6, `Class` `CompanyDataRequest`) and `PaymentPeriodsRequest` (PaymentPeriods-v1-0) to the gateway, both synchronous and free, and answers with: `MadeUpDate`, `NextDueDate`, SIC codes, `RegisteredEmailAddress`, officers with full `DOB`, PSCs, `StatementOfCapital`, `Shareholdings`, `TradingOnMarket`, `DTR5Applies`, the PSC exemption flags, and whether the payment period is paid. The TIS calls this "the data required for a company to submit a confirmation statement" (§2.3). The code stays in the page's memory for the session and is sent again on submit; the server never stores it, the rule `companiesHouseAccountsPost.js` already follows. The gateway read is the form's source because the public data API carries no shareholders, no registered email, and month-year dates of birth only.
3. **Review and change.** One block per data set, pre-filled, each with an "unchanged" state:
   - Review date: default `next_made_up_to`; must not be in the future; must be after the last statement.
   - SIC codes: up to four, from the register; edit list.
   - Statement of capital and shareholdings: the register's set; edit as a list of holdings (share class, number held, holder name or amalgamated name, optional address), transfers per holding (date, number). Sent in full when any holding changed (Q2 decides whether always).
   - Registered email: shown; editable (sent only when changed).
   - Trading on market and DTR5: fixed `false` for a private company; shown as a statement.
   - Lawful purpose statement: tick box, required.
   - Verification statement: one row per current director from the register, name and date of birth pre-filled from `CompanyDataRequest`; the customer types each director's 11-character personal code and picks a name mismatch reason if the register name differs from the verified name. A row left blank blocks submit with the message that the director must verify first (<https://www.gov.uk/guidance/verify-your-identity-for-companies-house>). Codes are sent on submit only and never stored.
   - The fee line: "£50 charged to the Companies House credit account" or "no fee: this payment period is paid", from `PaymentPeriodsRequest`.
4. **Preview.** `POST /api/v1/companies-house/confirmation-statement/preview` returns the rendered `ConfirmationAndVerificationStatement` body with personal codes masked; the page shows it, as the accounts page shows the iXBRL.
5. **Submit and result.** `POST /api/v1/companies-house/confirmation-statement` with the whole form and the codes. Then `GET /api/v1/companies-house/confirmation-statement/{submissionNumber}` until `ACCEPT` or `REJECT`, reject codes listed. On `ACCEPT` the page shows the PSC follow-up: each director-PSC's code is due through the PSC service within 14 days from the day after the review date (CS-13 makes that a Submit filing too).

A statement with no changes is: review date, `TradingOnMarket` false, `DTR5Applies` false, lawful purpose, `StateConfirmation`, the verification statement. With common changes: the same plus `SICCodes`, or `StatementOfCapital` plus every `Shareholdings` element.

### The XML body

`app/services/companiesHouseConfirmationStatementXml.js` exports `buildConfirmationStatementBody(input)` returning the `ConfirmationAndVerificationStatement` element in namespace `http://xmlgw.companieshouse.gov.uk`, elements in schema order:

| Element | Sent when | Source |
|---|---|---|
| `TradingOnMarket`, `DTR5Applies` | always, `false` | fixed for `BYSHR` |
| `PSCExemptAs…` (three) | never in this version | |
| `ReviewDate` | always | the form |
| `SICCodes/SICCode` (1 to 4) | when changed | the form |
| `StatementOfCapital/Capital` (`TotalAmountUnpaid`, `TotalNumberOfIssuedShares`, `ShareCurrency`, `TotalAggregateNominalValue`, `Shares` of `ShareClass`, `PrescribedParticulars`, `NumShares`, `AggregateNominalValue`) | when capital or holdings changed | the form; `PrescribedParticulars` from the register |
| `Shareholdings` (one per holding: `ShareClass`, `NumberHeld`, `Transfers`, `Shareholders/Name`) | when holdings changed (Q2) | the form; at most 5000 holdings, 200 transfers |
| `RegisteredEmailAddress` | when changed | the form |
| `AcceptLawfulPurposeStatement` | always, `true` | the tick box |
| `StateConfirmation` | always, `true` | fixed |
| `VerificationStatement/Director/Person` (`Title`, `Forename`, `OtherForenames`, `Surname`, `DOB`, `VerificationDetails/CompaniesHousePersonalCode`, `VerificationStatements/VerificationStatementForIndividual` = `INDIVIDUAL_VERIFIED`, `NameMismatchReason`) | always, one per current director | register names and dates; codes from the form |

The builder throws on a code that is not 11 characters, a future review date, more than four SIC codes, a holding with no share class, and a director row with no code. The unit test parses the output with `fast-xml-parser`, diffs it against the published `ConfirmationAndVerificationStatement.xml` and `ConfirmationStatementSICAndShareholderChange.xml` examples, and checks element order against the `xs:sequence` read from the checked-in XSD, so a reorder fails a test before it can fail a filing with error 604.

### The envelope and the submission number

`companiesHouseXmlGateway.js` gains `buildFormSubmission({ formIdentifier, formXml, document, ... })` carrying the `FormHeader`, `DateSigned` and either a `Form` body or a `Document`; `buildAccountsSubmission` becomes a call to it with `FormIdentifier` `Accounts` and the iXBRL document (its callers and tests are unchanged in shape). `buildConfirmationStatementSubmission` calls it with `FormIdentifier` and `Class` `ConfirmationAndVerificationStatement` and the body above inside `Form`. `buildCompanyDataRequest` and `buildPaymentPeriodsRequest` build the two read envelopes (`CompanyNumber`, `CompanyAuthenticationCode`, optional `MadeUpDate`, `CompanyType`); `parseCompanyDataResponse` and `parsePaymentPeriodsResponse` map the answers to plain objects, with tests over `CompanyDataResponse_v3-6.xml`.

The submission number is unique per presenter across every form, so the confirmation statement draws from the same counter `allocateSubmissionNumber` already increments. The counter's key name (`accounts-submission-number-counter`, line 24) stays, because renaming it would restart numbering and collide with numbers already used; the constant's name becomes `SUBMISSION_NUMBER_COUNTER_KEY` in place and the comment says it is presenter-wide.

### Submission and status polling, shared with accounts

The poll logic in `companiesHouseAccountsGet.js` lines 92 to 152 moves to `app/services/companiesHouseSubmissionStatus.js` as `pollSubmission({ userSub, submissionNumber, govTestScenario, acceptedEvent, receiptKind })`; the accounts poll Lambda and the new `companiesHouseConfirmationStatementGet.js` both call it. Async requests use the existing table (`COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME`); the record carries `kind: "confirmation-statement"` so the receipts page can label it. The `PARKED` status (waiting on the presenter) is shown as such.

Activity events: `companies-house-confirmation-statement-submitted`, `-accepted`, `-failed`, added to `v_submissions_by_activity_daily.sql` as `ch-confirmation-statement`.

### The fee path

Companies House debits the credit account behind the presenter when the first statement of a payment period is accepted; nothing in the envelope carries payment. So the fee path is: (a) the credit account exists and is linked to E0000052288 (CS-H1); (b) `PaymentPeriodsRequest` tells the page whether this submission will be charged; (c) Submit recovers the fee from the customer by Stripe Checkout before submitting, at the Companies House fee plus the Stripe fee plus 20%: `(fee + Stripe fee) × 1.2`, £61.35 for the £50 fee at Stripe's standard UK card rate (1.5% + 20p). The price is a `[[activities.prices]]` row on the activity with `interval = "submission"` (CS-10a); charging for one submission is a general capability any activity can use (CS-10b); the journey takes the payment when the fee is due (CS-10c).

The first prod filing is the operator's own company, whose fee lands on DIY Accounting's own credit account, so the charge does not gate the proof. Until CS-10c lands, the submit route refuses a filing whose payment period is unpaid unless `COMPANIES_HOUSE_CS_FEE_MODE=operator` is set on the deployment, which is how the prod proof runs.

### Catalogue and bundle placement

```
[[activities]]
id = "file-confirmation-statement"
name = "File Confirmation Statement (Companies House)"
display = "on-entitlement"
bundles = ["resident", "resident-pro"]
tokenCost = 1
metered = true
paths = ["companies-house/fileConfirmationStatement.html", "^/api/v1/companies-house/confirmation-statement.*", "^/api/v1/companies-house/company/[^/]+/(officers|persons-with-significant-control|filing-data)$"]
environments = ["local", "test", "simulator", "proxy", "ci"]
```

`prod` joins the list in CS-11, the same gate BACKLOG 34c applies to the accounts activity. The `resident` description gains "confirmation statement" once the prod proof passes.

### The MCP tools

In `mcp/lib/submit-tools.js` and `mcp/lib/server.js`, in the shape of the accounts tools:

| Tool | Route | Takes |
|---|---|---|
| `get_confirmation_statement_data` | `POST /api/v1/companies-house/company/{n}/filing-data` | `companyNumber`, `companyAuthCode` |
| `preview_confirmation_statement` | `POST …/confirmation-statement/preview` | the form body |
| `submit_confirmation_statement` | `POST …/confirmation-statement` | the form body, `companyAuthCode`, `directorCodes` |
| `poll_confirmation_statement` | `GET …/confirmation-statement/{submissionNumber}` | `submissionNumber` |

The MCP takes the authentication code and personal codes on the one call that needs them, as `submit_micro_entity_accounts` does. A later unification of `poll_accounts_submission` and `poll_confirmation_statement` into one tool renames a published tool, so it is its own change.

### Tests

- Unit: the body builder over the published examples and the XSD sequence; the envelope builders against `ConfirmationAndVerificationStatement.xml`; the response parsers over `CompanyDataResponse_v3-6.xml` and a recorded `PaymentPeriods` answer; each Lambda in the shape of the accounts tests, with the gateway mocked.
- Simulator: `routes/companies-house-xmlgw.js` dispatches `CompanyDataRequest`, `PaymentPeriodsRequest` and `ConfirmationAndVerificationStatement`; `scenarios/confirmation-statement.js` answers `CompanyData` from a fixture company with two directors, two PSCs, one share class, and answers `PeriodPaid` false. `Gov-Test-Scenario` headers: `CS_SHAREHOLDERS_REQUIRED` (reject 11686), `CS_DUPLICATE_SHAREHOLDING` (fatal 9999), `CS_INSUFFICIENT_FUNDS` (5006), `CS_DIRECTOR_NOT_VERIFIED` (a business reject naming the director), `CS_PERIOD_PAID` (`PeriodPaid` true), plus the existing `AUTH_FAILURE`, `SCHEMA_FAILURE`, `PENDING_FOREVER`.
- Behaviour, simulator lane: `behaviour-tests/companiesHouse/fileConfirmationStatement.behaviour.test.js`; sign in, look up, enter the code, see the pre-filled register data, change a SIC code, preview, enter two personal codes, submit, see pending then accepted. Second case: `CS_SHAREHOLDERS_REQUIRED` reaches the page with the reject text.
- Sandbox proof (CS-9): one accepted no-change statement and one with a SIC change, on the endpoint CS-H2 names, with `SubmissionNumber`, `GatewayTimestamp` and the polled `StatusCode` in the PR. The ci lane's `COMPANIES_HOUSE_XMLGW_URI` may need to point at the sandpit staging host for the confirmation statement while accounts keep the test service; if so, `COMPANIES_HOUSE_XMLGW_CS_URI` overrides for the confirmation statement Lambdas only.
- Prod proof (CS-H6): DIY Accounting Limited 06846849. The 5 October statement is task B of the runbook by WebFiling unless every task below lands first. The proof then is a second, no-change statement in the same payment period, review date after 21 September 2026 and not in the future, which carries no fee. It moves the next review date to that date plus 12 months, an effect the operator accepts when giving the go. Both directors' personal codes are needed on it, so CS-H3 gates it either way.

## Open questions

| Id | Question | Owner | Where the answer goes |
|---|---|---|---|
| Q1 | Which endpoint and credentials test `ConfirmationAndVerificationStatement` today: the test service with 66666727000, or the sandpit staging host with the live presenter and `GatewayTest` 1? And what company data does `CompanyDataRequest` answer on test? | Operator, by email (CS-H2) | CS-9's brief; `COMPANIES_HOUSE_XMLGW_CS_URI` if needed |
| Q2 | Does a no-change statement pass without `Shareholdings`, or does reject 11686 ask for the full holder list on every statement from a private company? | CS-9 settles it with two submissions; CS-H2 asks in the same email | the body builder's "send when" rule |
| Q3 | Does the test service accept a statement whose director has no code, and what reject code names an unverified director? | CS-9 | simulator scenario `CS_DIRECTOR_NOT_VERIFIED` |
| Q4 | Software authorisation for the form type: how many CS01 tests, and whether the package reference issued for accounts covers it or a second one is issued | Operator (CS-H4) | `COMPANIES_HOUSE_PACKAGE_REFERENCE` on prod |

Cowork's `../REPORT_CH_IDENTITY_VERIFICATION.md` (2026-09-23) answers V1 to V6:

| Id | Answer | Slots into |
|---|---|---|
| V1 | An unverified director means the statement is rejected. Every current director needs a code or the page does not submit | View 3's blank-row rule; `CS_DIRECTOR_NOT_VERIFIED` |
| V2 | `Person` carries the register name; `NameMismatchReason` only when the verified name differs. `OtherForenames` is enforced: without it the reject is 12604 or "does not match any active director" | View 3's director rows; the builder |
| V3 | The company may pass its directors' codes to whoever files (Companies House, 24 August 2026); Submit takes them at filing time and stores none | The page's hint text |
| V4 | PSC codes cannot go in the statement. They go through the PSC web service or `PSCVerificationStatement-v1-0.xsd`, after the statement and inside the window that starts the day after the review date (22 September to 5 October 2026 for DIYA) | CS-13's scope and timing |
| V5 | DIYA has three directors, all PSCs, each with a middle name | CS-H3 |
| V6 | No ACSP for DIYA's own filing. Filing for clients needs ACSP from no earlier than November 2027; presenter measures from no earlier than November 2026. Whether Submit presenting a customer's filing under E0000052288 is filing for clients is open: CS-H2 asks | CS-H2; a horizon row |

**Schema choice.** Once every officer is verified, the next statement reverts to `ConfirmationStatement-v1-3.xsd`; resending the verification block gives reject 12682. The builder reads each officer's `identity_verification_details` from the public data API (`appointment_verification_end_on` = `9999-12-31` means verified) and picks `ConfirmationAndVerificationStatement-v1-0` while any director is unverified, `ConfirmationStatement-v1-3` otherwise. CS-1 saves both schemas.

## Tasks

Needs: `machine-only` (Claude Code alone), `machine-ask` (Claude Code drives, the operator authenticates or approves), `human-driven` (the operator does it). Size is files new plus changed.

| Id | Title | Changes | Files | Size | Model | Depends on | Needs |
|---|---|---|---|---|---|---|---|
| CS-1 | Fixtures | Save `ConfirmationAndVerificationStatement-v1-0.xsd`, `ConfirmationStatement-v1-3.xsd`, `baseTypes-v3-7.xsd`, `PSCBaseTypes-v1-4.xsd`, `CompanyData-v3-6.xsd`, `PaymentPeriods-v1-0.xsd`, `PSCVerificationStatement-v1-0.xsd`, the three `ConfirmationStatement*.xml` and `ConfirmationAndVerificationStatement.xml` examples, `CompanyDataResponse_v3-6.xml` and `CompanyDataRequest_v3-3.xml` under `fixtures/companies-house-xmlgw/`, from `xmlgw.companieshouse.gov.uk/v1-0/schema/` and `/examples/` | `fixtures/companies-house-xmlgw/*` | 12 | Haiku | none | machine-only |
| CS-2 | Envelopes and the body builder | `buildFormSubmission`, `buildConfirmationStatementSubmission`, `buildCompanyDataRequest`, `buildPaymentPeriodsRequest`, `parseCompanyDataResponse`, `parsePaymentPeriodsResponse` in `companiesHouseXmlGateway.js`; new `companiesHouseConfirmationStatementXml.js` with the XSD-order check; tests | `app/services/companiesHouseXmlGateway.js`, `app/unit-tests/services/companiesHouseXmlGateway.test.js`, `app/services/companiesHouseConfirmationStatementXml.js`, `app/unit-tests/services/companiesHouseConfirmationStatementXml.test.js` | 4 | Sonnet | CS-1 | machine-only |
| CS-3 | Simulator | Dispatch the three new classes; `scenarios/confirmation-statement.js` with the fixture company and the scenario table; tests | `app/http-simulator/routes/companies-house-xmlgw.js`, `app/http-simulator/scenarios/confirmation-statement.js`, `app/unit-tests/http-simulator/routes/companies-house-xmlgw.test.js`, `app/unit-tests/http-simulator/scenarios/confirmation-statement.test.js` | 4 | Sonnet | CS-2 | machine-only |
| CS-4 | Lambdas | `companiesHouseOfficersGet.js`, `companiesHousePscGet.js` (public data proxies), `companiesHouseFilingDataPost.js`, `companiesHouseConfirmationStatementPreviewPost.js`, `companiesHouseConfirmationStatementPost.js`, `companiesHouseConfirmationStatementGet.js`; extract `pollSubmission` to `app/services/companiesHouseSubmissionStatus.js` and point the accounts poll at it; register in `app/bin/server.js`; simulator public-data routes for officers and PSCs; one test each | 6 Lambdas, 6 tests, 1 service, `companiesHouseAccountsGet.js`, `app/bin/server.js`, `app/http-simulator/routes/companies-house.js`, `app/http-simulator/scenarios/companies.js` | 17 | Sonnet | CS-2, CS-3 | machine-only |
| CS-5 | CDK | Six Lambdas in `CompaniesHouseStack.java` (the four gateway ones with presenter secret grants, the two proxies with the API key), names in `SubmitSharedNames.java`, `COMPANIES_HOUSE_XMLGW_CS_URI` and `COMPANIES_HOUSE_CS_FEE_MODE` props, health alarm list, stack test count 13 to 19 and the grant assertions; `./mvnw clean verify` | `CompaniesHouseStack.java`, `SubmitSharedNames.java`, `SubmitApplication.java`, `CompaniesHouseStackTest.java`, `cdk.json` | 5 | Sonnet | CS-4 | machine-only |
| CS-6 | Page, catalogue, API docs | `fileConfirmationStatement.html`; `companies-house-service.js` gains `getOfficers`, `getPscs`; new `companies-house-confirmation-service.js` for the four routes; the catalogue activity; `openapi.json` paths | `web/public/companies-house/fileConfirmationStatement.html`, `web/public/lib/services/companies-house-service.js`, `web/public/lib/services/companies-house-confirmation-service.js`, `web/public/submit.catalogue.toml`, `web/public/docs/api/openapi.json` | 5 | Sonnet | CS-4 | machine-only |
| CS-7 | Behaviour suite | The suite, its steps, the npm scripts (`test:fileConfirmationStatementBehaviour-*`), the Playwright project | `behaviour-tests/companiesHouse/fileConfirmationStatement.behaviour.test.js`, `behaviour-tests/steps/behaviour-companies-house-confirmation-steps.js`, `package.json`, `playwright.config.js` | 4 | Sonnet | CS-6 | machine-only |
| CS-8 | MCP tools | The four tools, their registration, a test over a recorded response | `mcp/lib/submit-tools.js`, `mcp/lib/server.js`, `mcp/test/submit-tools.test.js`, `mcp/test/fixtures/submit/confirmation-statement-data.response.json` | 4 | Sonnet | CS-4 | machine-only |
| CS-9 | Sandbox proof | On the endpoint CS-H2 names: `CompanyDataRequest` for the company the XML team names, one no-change statement, one with a SIC change, one with `Shareholdings`, one with a blank director code; poll each to a terminal state; pin the answers in the simulator scenarios and the tests; `SubmissionNumber` and `GatewayTimestamp` into the PR; settle Q2 and Q3 | `scenarios/confirmation-statement.js` and its test, `.env.ci` | 3 | Sonnet | CS-5, CS-7, CS-H1, CS-H2 | machine-ask |
| CS-10a | Per-submission price | `[[activities.prices]]` on `file-confirmation-statement`, `interval = "submission"`, £61.35; parsed in `productCatalog.js`; a one-off Stripe price from `stripe-sync.js` | `submit.catalogue.toml`, `productCatalog.js` and its test, `stripeCatalogue.js`, `stripe-sync.js` | 6 | Sonnet | none | machine-only |
| CS-10b | Charging for one submission | Checkout in `payment` mode for an activity price, the webhook records the paid charge, `activityCharges.js` checks and marks it used | billing route, `billingWebhookPost.js`, `activityCharges.js`, `server.js`, CDK, tests | 10 | Sonnet | CS-10a | machine-only |
| CS-10c | The charge in the journey | Pay and submit when the fee is due; the submit route refuses an unpaid fee-due filing (402) | `fileConfirmationStatement.html`, `companiesHouseConfirmationStatementPost.js`, tests | 6 | Sonnet | CS-10b | machine-only |
| CS-11 | Prod launch | `prod` on the activity, the `resident` description, prod values for the gateway URI, presenter ARNs and package reference (BACKLOG 34c steps 3 and 4 cover the shared ones), `compliance.toml` rows for the credit account and the CS01 authorisation, the analytics view rows | `submit.catalogue.toml`, `.env.prod`, `companies-house.toml`, `compliance.toml`, `v_submissions_by_activity_daily.sql` | 5 | Haiku | CS-9, CS-H4, CS-H6 | machine-only |
| CS-12 | Verification answers folded in | Apply V1 to V4 from Cowork's report: the blank-row rule, the mismatch-reason hint, the code-handling hint, the PSC follow-up text | `fileConfirmationStatement.html`, `companiesHouseConfirmationStatementXml.js` and its test | 3 | Sonnet | Cowork's report, CS-6 | machine-only |
| CS-13 | PSC verification statement (VS01) | `buildPscVerificationStatementSubmission` over `PSCVerificationStatement-v1-0.xsd`, one Lambda pair (submit, poll through `pollSubmission`), a section on the result view for each director-PSC within the 14 days, simulator class, tests | `companiesHouseXmlGateway.js`, 2 Lambdas, 2 tests, `fileConfirmationStatement.html`, simulator route and scenario | ~8 | Sonnet | CS-9, V4 | machine-only |
| CS-H1 | Credit account | Complete the Companies House credit account application form, send it to `chdfinance@companieshouse.gov.uk`, ask for it to be linked to presenter E0000052288. The account opened on 2026-09-25 under a new presenter ID; reply asking for the link to E0000052288 (`../DRAFT_EMAIL_CH_CREDIT_ACCOUNT_LINK.md`). Identifiers in `../NEXT_OPERATOR_RUNBOOK.md` task A | none in the repository | 0 | none | none | human-driven |
| CS-H2 | Email the XML team | On the `xml@companieshouse.gov.uk` thread, after O34d's message: Q1 (endpoint and credentials for the 18 November 2025 schemas; test company data for `CompanyDataRequest`), Q2 (shareholders on a no-change statement), Q4 (authorisation tests and the package reference for `ConfirmationAndVerificationStatement`), and whether Submit presenting a customer's filing under E0000052288 counts as filing on behalf of clients (ACSP). Paste the answers into CS-9's row | `../DRAFT_EMAIL_XMLGW_CS01.md` (the draft is Claude Code's, the send is the operator's) | 1 | Haiku for the draft | none | human-driven |
| CS-H3 | Personal codes | All three directors' 11-character codes, their register dates of birth and full names with middle names, from runbook task B; held by the operator, typed on the page at filing time, never stored | none | 0 | none | none | human-driven |
| CS-H4 | Software authorisation for CS01 | The XML team's tests of the CS-9 submissions and the package reference covering the confirmation statement, the exchange BACKLOG 34c step 2 describes | none | 0 | none | CS-9 | human-driven |
| CS-H6 | The prod filing go | Give the go for the second statement of the 2026-27 payment period through Submit for 06846849 (or the 5 October one if CS-9 and CS-H4 land first), knowing it moves the next review date; the page is driven by the operator with the codes | none | 0 | none | CS-11's values, CS-H3, CS-H4 | human-driven |

Order: CS-1, CS-2, CS-3 in one wave; CS-4 then CS-5, CS-6, CS-8 in one wave; CS-7; CS-9 when CS-H1 and CS-H2 have answered; CS-10a, then CS-10b, then CS-10c; CS-11 after CS-9 and CS-H4; CS-12 when the report lands; CS-13 after CS-9. CS-H1 and CS-H2 can start now.
