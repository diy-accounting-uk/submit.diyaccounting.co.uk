<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: Companies House filing

Replaces the separate accounts-filing, confirmation-statement and filing-coverage plans this
repository used to carry.

## User assertions

> Create a PLAN_\*.md doc for this [filing a confirmation statement by API] ... have a Fable 5.1
> sub-agent design it to fit in with our existing offerings and split into tasks

> create a separate PLAN_\*.md with a list of all the companies house APIs and or XML gateways that
> we could reasonably cover (no tasks on the board for that one, it's an interesting one stop shop
> opening up scheduled filings)

> instead of asking [the XML team how many tests authorisation needs], define our own assumed
> Companies House test criteria, build to them, exercise them continuously, and submit the
> evidence (operator, 2026-09-26)

> own filings now, customers later ... November 2027 is more than a year away (operator,
> 2026-09-26)

## Scope

The goal of this plan is for DIY Accounting Limited to file its own confirmation statement and
PSC verification statements through Submit, under its own credit-account presenter. On prod these
activities are open to operators only, gated the way the operator dashboard is (CS-11b). This
also lets the operator automate the company's own Companies House admin.

Customer filing returns when HMRC and Companies House filing both run end to end without the
operator. Filing for customers under our presenter makes us an ACSP once Companies House requires
it; that work and the customer-facing confirmation statement listing live in
`PLAN_COMPANIES_HOUSE_ACSP.md`.

**Open decision for the operator: accounts filing.** B34c lists micro-entity accounts for
`resident` customers on prod under our presenter. Either keep that (customers file accounts under
our presenter now; accounts carry no fee, so no credit account use), or make accounts operator-only
on prod like the confirmation statement. B34c and O34c keep their current scope until the operator
chooses.

## Where each filing stands

| Filing | API and credentials | Sandbox (test service) | Live (prod) | Finance |
|---|---|---|---|---|
| Company lookup | REST API key, no presenter | n/a | live | free |
| Registered office change | REST, OAuth as the company's user, no presenter | proven | live, proven on DIY Accounting Limited | free |
| Registered email change | REST, OAuth as the company's user, no presenter | proven | live, proven on DIY Accounting Limited | free |
| Micro-entity accounts | XML Gateway, presenter id + code, package reference | test presenter 66666727000: 000004 acknowledged 2026-09-13; status lookups fail until Companies House IT fixes the test account (B34.6c) | the credit-account presenter: authenticates on the live gateway since 2026-09-26; needs live clearance and the live package reference (O34c), then B34c | no Companies House fee; customer pays `resident-ltd` 99p a month (listed on ci only) |
| Confirmation statement | XML Gateway, as above | test presenter 66666727000: endpoint and schemas confirmed 2026-09-26; not run (CS-A2) | the credit-account presenter: needs the test harness (CS-A2), its scheduled runs (CS-A3), software authorisation (CS-A4), then CS-11b, operator-only | £50 Companies House fee debited from the credit account behind the credit-account presenter; the operator's own filings skip the Stripe charge (operator fee mode, CS-11a); the customer price (£61.35, Stripe test price) stays on ci |
| PSC verification statement (VS01) | XML Gateway, as above | test presenter 66666727000: CS-13b | the credit-account presenter: after CS-13a and CS-13b, operator-only | Companies House fee to check |

**Presenters**

| Presenter | Environment | Issued | Status |
|---|---|---|---|
| Test presenter 66666727000 | Test service | 2026-09-11 | Status lookups broken; Companies House IT is fixing it (B34.6c) |
| E0000052288 | Live | 2026-09-05 | Not used for filing; holds no credit account |
| The credit-account presenter | Live | 2026-09-25, with the credit account, £500 limit | Authenticates on the live gateway since 2026-09-26. Its id, code and the account number are in `../NEXT_OPERATOR_RUNBOOK.md` task A, which this repository does not carry — never write the presenter id, the account number or any code into this file |

Test package reference: 0012. The live reference comes with O34c (accounts) and CS-A4 (confirmation
statement).

## Dependency graph

```mermaid
flowchart LR
    CHIT[Companies House IT: test presenter repair] --> B346c[B34.6c]
    B346c --> O34c
    B346c --> B34c
    O34c --> B34c
    CSA2[CS-A2 harness] --> CSA3[CS-A3 scheduled runs]
    CSA3 --> CSA4[CS-A4 evidence to the XML team]
    CSA4 --> CS11b[CS-11b]
    CSA2 --> CS13b[CS-13b]
    CS13a[CS-13a] --> CS13b
    CS11a[CS-11a] --> CS11b
    Design[design row: not yet written] --> Row34e[34e]
    Design --> Row34f[34f]
    Design --> Row34g[34g]
```

- B34.6c: blocked by Companies House IT repairing the test presenter account (no row; external)
- O34c: blocked by B34.6c
- B34c: blocked by B34.6c and O34c
- CS-A2: blocked by nothing (the criteria below are defined)
- CS-A3: blocked by CS-A2
- CS-A4: blocked by CS-A3 (a scheduled run inside the last 14 days)
- CS-11a: blocked by nothing (the fee-mode CDK wiring)
- CS-11b: blocked by CS-A4 and CS-11a
- CS-13a: blocked by nothing (its fixture landed with CS-1, closed)
- CS-13b: blocked by CS-13a and CS-A2
- 34e, 34f, 34g: blocked by a design row that still needs writing. BACKLOG.md cites "NEXT.md
  B34.8" as the row that designs them; that label is closed against unrelated work (lifting the
  company-lookup page to prod) and is not on `NEXT.md`, so the design row does not exist yet.

## Operator dates

The PSC verification window for DIY Accounting Limited's own director-PSCs runs 22 September to
5 October 2026. The confirmation statement for the 2026-09-21 review date went by WebFiling on
2026-09-24 (submission 119-158484, accepted). Submit cannot file the PSC codes in time, so they go
through the Companies House PSC web service by 5 October 2026.

## Gateway envelope and authentication

One endpoint for every form and every poll:
`https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway`. POST, `Content-Type: text/xml`, UTF-8.
The test service is the same URL with `<GatewayTest>1</GatewayTest>` and the test presenter's
credentials. The test service accepts the confirmation and PSC verification statement schemas
live since 18 November 2025 (Q1 below).

`GovTalkMessage` (`http://www.govtalk.gov.uk/CM/envelope`, `EnvelopeVersion` 1.0):
`Header/MessageDetails` carries `Class` (`Accounts`, `ConfirmationAndVerificationStatement`,
`GetSubmissionStatus`, …), `Qualifier` `request`, and a `TransactionID` that is unique and
increasing (epoch milliseconds). `Header/SenderDetails/IDAuthentication` carries `SenderID`, the
lowercase MD5 of the presenter id, and `Authentication` with `Method` `clear` and `Value`, the
lowercase MD5 of the presenter authentication code — hash first, then lowercase; the wrong order
returns error 502.

`SubmissionNumber` is 6 characters, unique per presenter across every form (one shared counter,
allocated from an atomic DynamoDB counter, rendered base36 and zero-padded). A `GovTalkErrors`
block means the submission never reached Companies House (`RaisedBy`, `Number`, `Type` of `fatal`,
`business` or `warning`, `Text`, `Location`); otherwise the answer is an acknowledgement carrying
`GatewayTimestamp` and `PollInterval`.

Poll with `Class` `GetSubmissionStatus`. The answer is `Body/SubmissionStatus/Status` with
`StatusCode` (`ACCEPT`, `REJECT`, `PENDING`, `PARKED`) and, on a reject, `Rejections/Reject`
entries of `RejectCode`, `Description` and `InstanceNumber`. Companies House keeps a result for 90
days, then answers "No Transaction Found". Error codes seen or documented: 502 authorisation
failure; 5003 "Account Unknown"; 5006/9984 insufficient funds on the credit account; 9999 generic
failure, including "No presenter ID supplied" (the symptom on submission 000004 today).

Persistence follows one pattern for every form: `putAsyncRequest` records the submission number as
pending, the poll route moves it to completed or failed, and an accepted filing writes a receipt
with `putReceipt`. The company authentication code and any personal verification code are typed on
the page, sent on the one call that needs them, and never stored.

## Accounts filing (FRS 105 micro-entity)

Built and live on ci: the iXBRL generator (`app/services/microEntityAccountsIxbrl.js`), the shared
envelope builder (`app/services/companiesHouseXmlGateway.js`), the simulator route, three Lambdas,
the page and its behaviour suite. The entry point is pinned to the FRS 102 2026-01-01 taxonomy (FRS
105 accounts use the FRS 102 entry point); `AccountingStandardsApplied` carries the `Micro-entities`
member; the four audit-exemption statements are checked by phrase; every emitted concept is checked
against `fixtures/frc-taxonomy/frs-102-2026-concepts.json`. `FormIdentifier` is `Accounts`,
`Category` `ACCOUNTS`, `Filename` `Accounts.xml`.

Open: the test presenter's status lookups answer 9999 until Companies House IT repairs the test
account (B34.6c); once they do, the live credit-account presenter needs clearing for live filing
and the live package reference (O34c), then one proof filing (B34c).

## Confirmation statement (CS01) and PSC verification (VS01)

Since 18 November 2025 the schema is `ConfirmationAndVerificationStatement-v1-0.xsd`, carrying the
directors' verification statement and the lawful-purpose statement; both the envelope `Class` and
the `FormIdentifier` are `ConfirmationAndVerificationStatement`. `ConfirmationStatement-v1-3.xsd` is
still listed live but carries no verification block. **Schema choice**: once every current officer
is verified, the next statement reverts to `ConfirmationStatement-v1-3.xsd` — resending the
verification block once it is no longer needed gives reject 12682. The builder reads each officer's
`identity_verification_details.appointment_verification_end_on` from the public data API
(`9999-12-31` means verified) and picks the schema accordingly.

**Journey** (`web/public/companies-house/fileConfirmationStatement.html`, five views): company
lookup; the authentication code, which unlocks two gateway reads (`CompanyDataRequest`,
`PaymentPeriodsRequest`) for the register data and the fee status; review and change (review date,
SIC codes, statement of capital and shareholdings, registered email, the lawful purpose tick box,
one verification row per current director); preview; submit and poll, then the PSC follow-up
prompt for each director-PSC.

**The XML body**, elements in schema order and sent only when named:

| Element | Sent when |
|---|---|
| `TradingOnMarket`, `DTR5Applies` | always, `false` (private company) |
| `ReviewDate` | always |
| `SICCodes/SICCode` | when changed |
| `StatementOfCapital`, `Shareholdings` | when capital or holdings changed (Q2 open) |
| `RegisteredEmailAddress` | when changed |
| `AcceptLawfulPurposeStatement`, `StateConfirmation` | always, `true` |
| `VerificationStatement/Director/Person` | always, one per current director, with `NameMismatchReason` only when the verified name differs |

**The fee.** £50 with the first statement of a 12-month payment period (£110 paper), since 1
February 2026, debited from the credit account behind the presenter — nothing in the envelope
carries payment; `PaymentPeriodsRequest` says whether this submission is due. On ci, Submit
recovers it from the customer by Stripe Checkout before submitting, at (Companies House fee +
Stripe fee) × 1.2: £61.35 for the £50 fee (Stripe test price). On prod the operator files in
operator fee mode, which skips the charge (CS-11a); the live customer price belongs to
`PLAN_COMPANIES_HOUSE_ACSP.md`.

**Verification answers** (Cowork's `../REPORT_CH_IDENTITY_VERIFICATION.md`, 2026-09-23):

| Id | Answer |
|---|---|
| V1 | An unverified director blocks the statement; every current director needs a code before the page submits |
| V2 | `Person` carries the register name; `NameMismatchReason` only when the verified name differs. `OtherForenames` is enforced |
| V3 | The company may pass its directors' codes to whoever files; Submit takes them at filing time and stores none |
| V4 | PSC codes cannot go in the statement — they go through the PSC web service or `PSCVerificationStatement-v1-0.xsd`, after the statement, inside the window starting the day after the review date |
| V5 | DIYA has three directors, all PSCs, each with a middle name |
| V6 | No ACSP is needed for DIYA's own filing, which is this plan's scope. Filing for customers under our presenter needs ACSP registration once Companies House requires it, no earlier than November 2027; `PLAN_COMPANIES_HOUSE_ACSP.md` carries the rule, its sources and the own-presenter alternative |

**Open questions**

| Id | Question | Owner |
|---|---|---|
| Q1 | Where to test: answered by probe on 2026-09-26. The test service `https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway` with `GatewayTest` 1 and the test presenter accepts `ConfirmationAndVerificationStatement-v1-0` and `PSCVerificationStatement-v1-0` (its `/SchemaStatus`) and answers `CompanyDataRequest` for 00001350, 04549236, 06060501, 03950344, 04615520, 01966794; the live presenter is refused there; the sandpit staging host with the live presenter validates schemas only | CS-A2 |
| Q2 | Does a no-change statement pass without `Shareholdings`, or must every statement from a private company carry the full holder list? | CS-A2 |
| Q3 | Does the test service accept a statement whose director has no code, and what reject code names an unverified director? | CS-A2 |
| Q4 | Software authorisation for the form: Companies House publishes no test count or checklist. We build to the assumed criteria below and send the evidence (CS-A4); whether the live package reference from O34c covers this form is answered by the XML team's reply | CS-A4 |

## Software authorisation: assumed criteria

Companies House publishes one criterion: "Testing is complete when Companies House is confident
that the development, relevant to the form types being tested, meets our strict criteria"
([GOV.UK, read first](https://www.gov.uk/government/publications/technical-interface-specifications-for-companies-house-software/important-information-for-software-developers-read-first)).
The same page asks developers to tell Companies House when test submissions are made, to use a
unique submission number for each, and to use test data that closely resembles real life. A
Companies House moderator describes the process as: submit test files, "which will then be
reviewed by our team. Once we are satisfied with the quality of your test submissions, we will
issue live package credentials"
([developer forum, 2025-07-29](https://forum.companieshouse.gov.uk/t/what-is-the-application-and-approval-process-for-becoming-a-companies-house-software-filing-partner/11903)).

Nothing public gives a test count, a per-form checklist, a per-form package reference rule, or how
long Companies House keeps test submissions. The XML forum threads on testing send developers to
`xml@companieshouse.gov.uk` or a staff member's email for the details. So we assume criteria, by
analogy with HMRC's MTD approvals (VAT granted; ITSA pack in `_developers/hmrc/`), build to them,
and send the evidence.

| # | Criterion | Why we assume it | How we evidence it |
|---|---|---|---|
| 1 | Every variant we offer filed on the test service and polled to a terminal state | GOV.UK "relevant to the form types being tested"; HMRC's ITSA standards table wants a sandbox proof per endpoint | Harness case list (CS-A2): each case's submission number, `StatusCode` and reject codes |
| 2 | Test data resembles real life, on the published test companies | GOV.UK read-first page; forum "Confirmation Statement Testing" lists the six test companies | The case fixtures, one per variant, on 00001350 to 01966794 |
| 3 | Unique submission number and increasing transaction id on every envelope | GOV.UK read-first page | The atomic counter (`allocateSubmissionNumber`); the evidence log shows no repeats |
| 4 | Envelope right: `Class` equals `FormIdentifier`, lowercase MD5 credentials, `Method` clear, package reference 0012, `GatewayTest` 1 | GOV.UK read-first page; the 2025-11-18 launch failures were `Class` and `FormIdentifier` mismatches (forum "Launch - most working") | Unit tests over the builders; the redacted request in each case's exchange |
| 5 | Schema chosen by officer verification state (`ConfirmationAndVerificationStatement-v1-0` or `ConfirmationStatement-v1-3`) | Resending the verification block gives reject 12682 | One case per schema where test data allows; unit tests of the chooser |
| 6 | Error paths handled and shown to the user in plain words: `GovTalkErrors`, reject codes, 502, 5003, 5006 and 9984, 9999 | HMRC questionnaire 1 Q12 (error testing, "beneficial"); forum threads show 9999 and 502 as the common failures | Negative harness cases (blank director code, wrong company authentication code); simulator pins; unit tests of the message map |
| 7 | Polling honours `PollInterval`, handles `PENDING` and `PARKED`, stops at `ACCEPT` or `REJECT` | Gateway interface; submissions stuck at pending in December 2025 (forum "Filing issue resolved") | The poll timings in the evidence log |
| 8 | Testing is recent when reviewed | HMRC questionnaire 1 Q11 (tests in the last 14 days, logs kept 14 days); Companies House publishes no retention period | A scheduled run at least weekly (CS-A3); the pack cites a run inside 14 days |
| 9 | Credentials and codes never logged or stored | HMRC data protection section; this plan's rule that authentication and personal codes are typed, sent once and never stored | `redactPresenterCredentials` tests; only redacted exchanges in artefacts |
| 10 | Declarations shown before submit (lawful purpose, the statement of confirmation) | HMRC questionnaire 1 Q10 (legal declaration); the schema requires both as `true` | Browser test of `fileConfirmationStatement.html`; a screenshot in the pack |
| 11 | Filing page meets WCAG 2.1 AA | HMRC questionnaire 2; Companies House publishes no such test | `scripts/axe-quickscan.mjs` over the filing page, 0 violations |
| 12 | The fee is known before submit | `PaymentPeriodsRequest`; HMRC ITSA standard 12 (cost shown before sending) | A `PaymentPeriodsRequest` case; the review view's fee line |
| 13 | Each submission traceable to a signed-in user, company and time | HMRC fraud prevention headers; Companies House has no such envelope field | The async request record per submission (`putAsyncRequest`), named in the pack |
| 14 | A written summary sent with the submission numbers | GOV.UK "tell us when you've made test submissions"; HMRC's questionnaires | The CS-A4 pack: product, forms, case table, run link, contact |

The PSC verification statement joins rows 1 to 9 once CS-13a lands (CS-13b).

## Horizons

**PSC verification statement (VS01).** CS-13 splits into the build and the sandbox proof. CS-13a:
`buildPscVerificationStatementSubmission` over `PSCVerificationStatement-v1-0.xsd` (its fixture
landed with CS-1), a submit and poll Lambda pair through the shared `pollSubmission`, a simulator
class, tests, and a result-view section on the confirmation statement page for each director-PSC —
machine-only, nothing blocks it. CS-13b: its cases in the CS-A2 harness, run by CS-A3, blocked
by CS-13a and CS-A2.

**FRS 102 section 1A small-company accounts (34e), dormant company accounts (34f), and CT600
pairing (34g)** all reuse the FRS 102 entry point and the accounts envelope this plan's Accounts
section already builds. FRS 102 1A adds the small-companies-regime statements, a directors' report
and a profit and loss account. Dormant accounts are the micro-entity filing with a dormant flag, a
section 480 statement in place of section 477, and a share-allocation note. CT600 pairing sends the
same balance sheet's accounts iXBRL, plus a computations iXBRL, to HMRC's Transaction Engine
alongside the CT600 return, so one balance sheet serves both filings. None of the three has a
design row yet — see the dependency graph.

**The wider Companies House catalogue.** Beyond the filings above, Companies House exposes: the
Public Data API (register reads, no auth beyond an API key); the Streaming API (register changes as
they happen); the Document API (filed document content); the XML Gateway's other input-side reads
(`MembersRegisterDataRequest`, `ChargeSearch`, `GetDocument`, `EReminders`); and XML Gateway forms
for officer appointment, resignation and change, PSC notification and change, accounting reference
date change, name change, share allotment, charge registration, and incorporation. Every recurring
deadline (accounts due, confirmation statement due, a director's or PSC's verification code due,
the CT600) sits on the company's public profile with no authentication code, so a reminder or a
filing queue can be built from the company number alone once a filing exists to act on it. The
order this plan grows into, by deadline served: accounts, the confirmation statement with the
verification statement, the PSC verification statement, then the 14-day event forms that keep the
register consistent before each confirmation statement, then share allotments and accounting
reference date changes.

## Tasks

| Id | What | Files | Model | Blocked by | Class |
|---|---|---|---|---|---|
| B34.6c | Poll test submission 000004 once Companies House IT confirms the test presenter account works; pin the returned `StatusCode` as a case in `companiesHouseAccountsGet.test.js` | ~1 | Sonnet | Companies House IT | Blocked |
| O34c | Ask the XML team to clear the credit-account presenter for live accounts filing and issue the live package reference; set the live presenter id, code and package reference on GitHub's `prod` environment | 0 | none | B34.6c | Blocked |
| B34c | `CompaniesHouseStack.java` sets the prod gateway values; one accounts filing on the prod lane for the operator's own company, polled to a terminal state; `prod` added to the activity's `environments` and `resident`'s listing | ~5 | Sonnet | B34.6c, O34c | Blocked |
| CS-A2 | Test-service harness: every statement variant and error path as a case, starting with a `CompanyDataRequest`, a no-change statement, a SIC change, one with `Shareholdings` and one with a blank director code; each polled to a terminal state, an evidence log, simulator pins, the reject-code message map; settles Q2 and Q3 | ~7 | Sonnet | nothing | Machine-only |
| CS-A3 | `companies-house-test-service.yml`: the harness weekly and on dispatch, redacted exchanges and the evidence log as run artefacts | ~2 | Sonnet | CS-A2 | Blocked |
| CS-A4 | Claude Code assembles the evidence pack from a CS-A3 run inside 14 days; the operator sends it to `xml@companieshouse.gov.uk` and asks for the live package reference for the confirmation statement | 0 | Sonnet | CS-A3 | Blocked |
| CS-13a | Build the PSC verification statement: XML builder, submit and poll Lambdas, simulator class, tests, result-view section | ~8 | Sonnet | nothing | Machine-only |
| CS-13b | The PSC verification statement's cases in the CS-A2 harness, run by CS-A3 | ~2 | Sonnet | CS-13a, CS-A2 | Blocked |
| CS-11a | `COMPANIES_HOUSE_CS_FEE_MODE` as a `CompaniesHouseStack.java` prop, set to `operator` only where the environment config names it, so operator mode is reachable when deployed | ~2 | Haiku | none | Machine-only |
| CS-11b | Operator-only on prod: an activity field that replaces `bundles` with `["operator"]` in named environments, `prod` on the confirmation statement activity, prod gateway values and the live package reference, the operator-mode proof filing, `compliance.toml` rows | ~7 | Sonnet | CS-A4, CS-11a | Blocked |

## Sources

- [Important information for software developers - read first (GOV.UK)](https://www.gov.uk/government/publications/technical-interface-specifications-for-companies-house-software/important-information-for-software-developers-read-first)
- [Apply to file with Companies House using software (GOV.UK)](https://www.gov.uk/guidance/apply-to-file-with-companies-house-using-software)
- [What is the application and approval process for becoming a Companies House software filing partner? (developer forum)](https://forum.companieshouse.gov.uk/t/what-is-the-application-and-approval-process-for-becoming-a-companies-house-software-filing-partner/11903)
- [Release of 18th November IDV schema test platform (XML forum)](https://xmlforum.companieshouse.gov.uk/t/release-of-18th-november-idv-schema-test-platform/1818)
- [Confirmation Statement Testing (XML forum)](https://xmlforum.companieshouse.gov.uk/t/confirmation-statement-testing/70)
- [How to test confirmation submissions (XML forum)](https://xmlforum.companieshouse.gov.uk/t/how-to-test-confirmation-submissions/641)
- [Initial steps for testing over the XML Gateway (XML forum)](https://xmlforum.companieshouse.gov.uk/t/initial-steps-for-testing-over-the-xml-gateway/98)
- [Steps to test and create new company via XML filing before going live (XML forum)](https://xmlforum.companieshouse.gov.uk/t/steps-to-test-and-create-new-company-via-xml-filing-before-going-live/700)
- [Authorisation Failure 502 with test credentials (XML forum)](https://xmlforum.companieshouse.gov.uk/t/authorisation-failure-502-with-test-credentials-need-test-efiling-presenter-account-for-accounts-filing/1933)
- [Launch - most working but some not (XML forum)](https://xmlforum.companieshouse.gov.uk/t/launch-most-working-but-some-not-others-have-been-successful/1851)
- [Important update: filing issue resolved (XML forum)](https://xmlforum.companieshouse.gov.uk/t/important-update-filing-issue-resolved/1882)
- [Live filing via XML from 30th June (XML forum)](https://xmlforum.companieshouse.gov.uk/t/live-filing-via-xml-from-30th-june/190)
