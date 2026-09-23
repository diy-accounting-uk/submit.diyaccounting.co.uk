<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: Companies House accounts filing (FRS 105 micro-entity, XML Gateway) and its three next filings

> Backlog row 34b. The REST filings stay as they are in `../developers/submit/archive/PLAN_COMPANIES_HOUSE_REST_FILING.md`; that
> API does not carry accounts.

## Goal and the two halves

File a micro-entity's annual accounts at Companies House as iXBRL inside a GovTalk XML envelope,
through the XML Gateway. FRS 105 first.

**B34.6a, no credentials.** Everything in this plan except a real gateway call: the generator, the
envelope builder, the status parser, the simulator route, the Lambdas, the page, the unit tests and
the simulator-lane behaviour suite. Companies House publishes the specification, the schemas, worked
example envelopes and a free XBRL validator, so the whole build can be verified offline.

**B34.6b, sandbox proof.** One accepted test submission against the gateway's test service. It needs
a test presenter id and authentication code, which Companies House emails on request
(`xml@companieshouse.gov.uk`, board item O16, chase 2026-09-21). Those reach the build as
`COMPANIES_HOUSE_PRESENTER_ID` and `COMPANIES_HOUSE_PRESENTER_CODE` on the GitHub `ci` environment,
never in the repo. The live presenter account already exists (E0000052288).

### Sources

All public, no login:

- Gateway TIS 5.3 and accounts TIS 5.9 (ODT), linked from
  <https://www.gov.uk/government/publications/technical-interface-specifications-for-companies-house-software>
- Schemas and worked examples: <http://xmlgw.companieshouse.gov.uk/SchemaStatus>, including
  `examples/Accounts.xml`, `examples/GetSubmissionStatus_request.xml` and its `_response`, and
  `v1-0/schema/forms/FormSubmission-v2-11.xsd`, `GetSubmissionStatus-v2-9.xsd`, `Egov_ch-v2-0.xsd`
- Error codes: <http://xmlgw.companieshouse.gov.uk/errors.shtml>
- Companies House XBRL validator: <https://test-validator.companieshouse.gov.uk/xbrl_validate>
- FRC taxonomies: <https://www.frc.org.uk/library/standards-codes-policy/accounting-and-reporting/frc-taxonomies/current-uk-and-irish-digital-reporting-taxonomies/>

On request only: the test presenter id and code, and the package reference Companies House issues
after it reviews the test submissions.

## What the user enters

The company lookup already in this repo fills in the company number, the registered name and the
accounting reference dates. The user cannot edit the name or number; a mismatch is rejected.

The user types the rest:

- Company authentication code, 6 to 8 characters. Not stored. It goes into the envelope and into
  the iXBRL, and is dropped from memory after the call.
- Period start and end dates.
- Balance sheet, current year and prior year: fixed assets, current assets, creditors falling due
  within one year, creditors falling due after more than one year, called up share capital, profit
  and loss account, capital and reserves.
- Average number of employees during the period.
- The name of the director approving the balance sheet, and the date of approval.
- Four tick-box statements, which the page renders as fixed wording (below).

The page derives net current assets, total assets less current liabilities and net assets, shows
them, and refuses to submit when capital and reserves does not equal net assets. Two years of
figures is the maximum the accounts TIS allows.

## The iXBRL generator

Hand-built templating. The output is one XHTML file, so a string template with escaping beats any
library, and `fast-xml-parser` (already a dependency) parses it back for the tests.

Entry point, referenced from `link:schemaRef`:
`https://xbrl.frc.org.uk/FRS-102/2026-01-01/FRS-102-2026-01-01.xsd`. The accounts TIS is explicit
that FRS 105 micro-entity accounts use the FRS 102 entry point. Pin the year in one constant. The
first line must be exactly `<?xml version="1.0"?>` with no leading whitespace.

Concepts the accounts TIS names, all mandatory for the current period:

`UKCompaniesHouseRegisteredNumber`, `EntityCurrentLegalOrRegisteredName`, `BalanceSheetDate`,
`DateAuthorisationFinancialStatementsForIssue`, `DirectorSigningFinancialStatements`,
`EntityDormantTruefalse`, `StartDateForPeriodCoveredByReport`, `EndDateForPeriodCoveredByReport`,
`EntityTradingStatus`, `AccountsStatusAuditedOrUnaudited`, `AccountsTypeFullOrAbbreviated`,
`AccountingStandardsApplied`.

`AccountingStandardsApplied` carries the `Micro-entities` member of `AccountingStandardsDimension`.
That is what identifies the filing as micro-entity. A dimension at its default value must not be
reported, so a trading company reports `EntityTradingStatus` with no dimension.

The four statements audit-exempt micro-entity accounts must carry, with the phrase checks Companies
House runs (case-insensitive, wording is otherwise free):

| Statement | Concept | Must contain |
|---|---|---|
| Section 477 exemption | `StatementThatCompanyEntitledToExemptionFromAuditUnderSection477CompaniesAct2006RelatingToSmallCompanies` | "exempt" or "exemption", and "section 477 of the Companies Act 2006" |
| Audit not required by members | `StatementThatMembersHaveNotRequiredCompanyToObtainAnAudit` | "members have not required the company to obtain an audit" |
| Directors' responsibilities | `StatementThatDirectorsAcknowledgeTheirResponsibilitiesUnderCompaniesAct` | "directors acknowledge" |
| Micro-entity provisions | `StatementThatAccountsHaveBeenPreparedInAccordanceWithProvisionsSmallCompaniesRegime` | "prepared", "in accordance with", "provisions", "micro" |

The balance sheet's numeric concepts are not listed by name in the TIS. Resolve each one from the
downloaded FRS 102 entry point before writing the template, and record the resolved names in a
single map in the generator. The generator asserts every concept it emits exists in that entry
point, so a wrong guess fails a test rather than a filing.

Contexts: one duration per period (`y2026`, `y2025`) and one instant per balance sheet date
(`e2026`, `e2025`). The entity identifier is the company number under the Companies House scheme.
Units: one `GBP` unit with `iso4217:GBP`, one pure unit for the employee count. Monetary facts carry
`decimals="0"` and the sign convention the taxonomy's balance attribute sets.

`npm test` checks that the document parses as XML, that the first line is exact, that every
mandatory concept is present with a context, that each statement passes its phrase check, that every
emitted concept exists in a checked-in copy of the entry point's element list, and that the balance
sheet adds up. `npm run validate:accounts-ixbrl` posts a generated file to Companies House's
validator and prints the result; it reaches the network, so it runs on demand only. Arelle with the
FRC taxonomy is the fuller offline check, and needs Python plus a taxonomy download, so it is a
later step.

## The GovTalk envelope

One endpoint for submit and poll:
`https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway`. POST, `Content-Type: text/xml`, UTF-8.
The test service uses the same URL with `<GatewayTest>1</GatewayTest>` in the header and the test
presenter credentials.

Root `GovTalkMessage` in namespace `http://www.govtalk.gov.uk/CM/envelope`, `EnvelopeVersion` `1.0`.
`Header/MessageDetails` carries `Class` (`Accounts` to submit, `GetSubmissionStatus` to poll),
`Qualifier` `request`, and a `TransactionID` that is unique and increasing; use epoch milliseconds.
`Header/SenderDetails/IDAuthentication` carries `SenderID`, the lowercase MD5 of the presenter id,
and `Authentication` with `Method` `clear` and `Value`, the lowercase MD5 of the presenter
authentication code. Hash first, then lowercase. That order the wrong way round returns error 502,
authorisation failure. `GovTalkDetails/Keys` is empty on the way out.

`Body/FormSubmission` sits in namespace `http://xmlgw.companieshouse.gov.uk/Header` against
`FormSubmission-v2-11.xsd`, with `FormHeader` (`CompanyNumber`, `CompanyName`,
`CompanyAuthenticationCode`, `PackageReference`, `FormIdentifier` = `Accounts`, `SubmissionNumber`),
a bare `DateSigned` directly after `FormHeader` (the current schema carries no `Authority` wrapper;
the sandbox's test service rejects one outright), an empty `Form`, and `Document` holding `Data`
(the base64 iXBRL), `Date`, `Filename`, `ContentType` = `application/xml`, `Category` = `ACCOUNTS`.

`SubmissionNumber` is exactly 6 characters, ours to allocate, unique per presenter forever. Reusing
one is rejected. Allocate it from an atomic counter item in the async requests table and render it
base36, zero padded. `PackageReference` is blank until Companies House issues one; any value works
on the test service. A base64 data element caps at 1.2 million characters.

The gateway answers synchronously. A `GovTalkDetails/GovTalkErrors` block means the submission never
reached Companies House: each `Error` carries `RaisedBy`, `Number`, `Type` (`fatal`, `business` or
`warning`), `Text` and `Location`. Anything else is an acknowledgement carrying `GatewayTimestamp`,
the legal receipt time, and `PollInterval`.

Then poll. `Class` = `GetSubmissionStatus`, body `GetSubmissionStatus` in namespace
`http://xmlgw.companieshouse.gov.uk` with `PresenterID` and `SubmissionNumber`. The answer is
`Body/SubmissionStatus/Status` with `StatusCode` (`ACCEPT`, `REJECT`, `PENDING`, `PARKED`),
`SubmissionNumber`, `CompanyNumber` and, on a reject, `Rejections/Reject` entries of `RejectCode`,
`Description` and `InstanceNumber`. Polling one submission number needs no `GetStatusAck`. Companies
House keeps a result for 90 days, then answers "No Transaction Found".

Persistence follows the HMRC async pattern in the repo. `putAsyncRequest` records the submission
number as the request id with status `pending`, and the poll route updates it to `completed` or
`failed`. An accepted filing writes a receipt with `putReceipt`, so it lands on the existing
receipts page. The iXBRL itself is not stored.

## The simulator route

New file `app/http-simulator/routes/companies-house-xmlgw.js`, mounted at `/v1-0/xmlgw/Gateway`,
with state in `app/http-simulator/scenarios/accounts-filing.js`. It parses the posted envelope with
`fast-xml-parser`, checks the elements the published schemas require, and answers a `GovTalkErrors`
block with `Number` 502 and `Type` `fatal` for an unknown `SenderID` or `Value`, the matching
published code for a missing element or a `SubmissionNumber` that is not 6 characters or has been
used before, and otherwise an acknowledgement with `Qualifier` `acknowledgement`, a
`GatewayTimestamp` and a `PollInterval` of 1.

The first poll for a submission number answers `PENDING`, later polls answer `ACCEPT`. A
`Gov-Test-Scenario` request header overrides that, the way the HMRC routes do:
`ACCOUNTS_REJECTED` returns a reject with a `RejectCode`, `AUTH_FAILURE` returns error 502,
`SCHEMA_FAILURE` returns a parser error, `PENDING_FOREVER` never leaves pending. The real gateway
ignores headers it does not know, so the same code path runs against both.

## The page and the activity

`web/public/companies-house/fileMicroEntityAccounts.html`, built from `changeRegisteredOffice.html`:
same head block, RUM placeholders, header widgets, `#mainContent` and `#statusMessagesContainer`.

Catalogue entry in `web/public/submit.catalogue.toml`:

```
[[activities]]
id = "file-micro-entity-accounts"
name = "File Micro-entity Accounts (Companies House)"
display = "on-entitlement"
bundles = ["default"]
metered = false
paths = ["companies-house/fileMicroEntityAccounts.html", "^/api/v1/companies-house/accounts.*"]
environments = ["local", "test", "simulator", "proxy", "ci"]
```

No `prod`, so the activity stays off production until B34.6b passes and the operator lifts the gate.
The bundle is unchanged. The in-browser TOML parser is line-based, so `paths` stays on one line.

The page previews the rendered accounts before submitting. After an acknowledgement it shows the
submission number and the receipt timestamp, then polls until `ACCEPT` or `REJECT` and lists any
reject codes and descriptions.

Behaviour suite `behaviour-tests/fileMicroEntityAccounts.behaviour.test.js`, run in the simulator
lane through `npm run test:fileMicroEntityAccountsBehaviour-simulator`. It signs in, fills the
balance sheet, previews, submits, sees pending, then sees accepted. A second case sets
`ACCOUNTS_REJECTED` and asserts the reject reason reaches the page.

## FRS 102 section 1A small-company accounts

Unaudited full accounts in the small company format, with a directors' report and a profit and
loss account. The accounts TIS 5.9 lists the category as "Audit exempt full accounts" and, under
"FRS unaudited full (small company format) accounts", requires four statements to the balance
sheet: the section 477 statement, the audit not required by members statement, the directors
responsibility statement and the small companies regime statement. Its full-accounts rules add
"These accounts must contain a Directors Report and a Profit and loss account (if trading)", the
report identified by `DateSigningDirectorsReport` and `DirectorSigningDirectorsReport`, the P&L by
`ProfitLoss`. Section 1A and FRS 105 share the FRS 102 entry point.

### Entry point and concepts

Same `FRS_102_ENTRY_POINT`. `AccountingStandardsApplied` carries the `bus:SmallEntities` member of
`bus:AccountingStandardsDimension` in place of `Micro-entities`. `bus:ApplicableLegislation` is
reported twice on `bus:ApplicableLegislationDimension`, once with
`bus:SmallCompaniesRegimeForAccounts` and once with `bus:SmallCompaniesRegimeForDirectorsReport`,
each in its own context in the shape `buildDimensionedContext` builds. `AccountsType` stays
`FullAccounts`.

New `CONCEPTS` entries in `app/services/microEntityAccountsIxbrl.js`. Every name is in
`fixtures/frc-taxonomy/frs-102-2026-concepts.json`.

| Key | Concept |
|---|---|
| `applicableLegislation` | `bus:ApplicableLegislation` |
| `statementSmallCompaniesRegime` | `direp:StatementThatAccountsHaveBeenPreparedInAccordanceWithProvisionsSmallCompaniesRegime` |
| `statementDirectorsReportSmallCompaniesRegime` | `direp:StatementThatDirectorsReportHasBeenPreparedInAccordanceWithProvisionsSmallCompaniesRegime` |
| `directorSigningDirectorsReport` | `direp:DirectorSigningDirectorsReport` |
| `dateSigningDirectorsReport` | `direp:DateSigningDirectorsReport` |
| `descriptionPrincipalActivities` | `bus:DescriptionPrincipalActivities` |
| `nameEntityOfficer` | `bus:NameEntityOfficer` |
| `turnoverRevenue` | `core:TurnoverRevenue` |
| `costSales` | `core:CostSales` |
| `grossProfitLoss` | `core:GrossProfitLoss` |
| `administrativeExpenses` | `core:AdministrativeExpenses` |
| `otherOperatingIncome` | `core:OtherOperatingIncome` |
| `operatingProfitLoss` | `core:OperatingProfitLoss` |
| `otherInterestReceivableSimilarIncomeFinanceIncome` | `core:OtherInterestReceivableSimilarIncomeFinanceIncome` |
| `interestPayableSimilarChargesFinanceCosts` | `core:InterestPayableSimilarChargesFinanceCosts` |
| `profitLossOnOrdinaryActivitiesBeforeTax` | `core:ProfitLossOnOrdinaryActivitiesBeforeTax` |
| `taxTaxCreditOnProfitOrLossOnOrdinaryActivities` | `core:TaxTaxCreditOnProfitOrLossOnOrdinaryActivities` |
| `profitLoss` | `core:ProfitLoss` |
| `provisionsForLiabilitiesBalanceSheetSubtotal` | `core:ProvisionsForLiabilitiesBalanceSheetSubtotal` |
| `statementComplianceWithApplicableReportingFramework` | `core:StatementComplianceWithApplicableReportingFramework` |
| `revenueRecognitionPolicy` | `core:RevenueRecognitionPolicy` |
| `propertyPlantEquipmentPolicy` | `core:PropertyPlantEquipmentPolicy` |

New `MEMBERS`: `bus:SmallEntities`, `bus:SmallCompaniesRegimeForAccounts`,
`bus:SmallCompaniesRegimeForDirectorsReport`, `bus:Director1` to `bus:Director40`. New
`DIMENSIONS`: `bus:ApplicableLegislationDimension`, `bus:EntityOfficersDimension`.

Searched the fixture and absent: `Section1A`, `Section415`, `Section414`, `ProfitLossForPeriod`,
`Small-entities`, a bare `DirectorsReport` element. The regime is identified by the
`SmallEntities` member alone. The fixture holds names only, so the FRC label behind
`SmallEntities` is unverified until the validator run below.

`statementSmallCompaniesRegime` names the same element as `statementMicroEntityProvisions`. The
TIS lists two statements against that one element and the phrase check tells them apart: "prepared
in accordance with", "provisions" and "small companies" for this one. `STATEMENT_TEXT` gets "These
accounts have been prepared in accordance with the provisions applicable to companies subject to
the small companies regime." The directors' report statement reads "This report has been prepared
in accordance with the provisions applicable to companies entitled to the small companies
exemption." The TIS runs no phrase check on it.

The directors' report is one block: `descriptionPrincipalActivities` as text; one
`nameEntityOfficer` fact per director, each in a duration context carrying
`bus:EntityOfficersDimension` = `bus:DirectorN` (N from 1 in the order entered, at most 40);
`directorSigningDirectorsReport` as a zero-length fact with the signing director's name in prose,
the way `directorSigningFinancialStatements` is done; `dateSigningDirectorsReport` in the current
instant context; the directors' report regime statement.

The profit and loss account is format 1, eleven lines, every fact in a duration context (`y2026`,
and `y2025` when prior figures are entered). `buildContexts` gains a prior duration context, which
needs `priorPeriodStart` in the input. `assembleProfitAndLossFacts` derives gross profit, operating
profit, profit before tax and `ProfitLoss`, and throws when the entered profit for the year differs
from the derived one, the way `assembleBalanceSheetFacts` does for capital and reserves.

The balance sheet keeps the seven micro-entity lines and adds provisions for liabilities, default
0, subtracted in net assets. The notes carry the compliance statement, fixed as "These financial
statements have been prepared in accordance with Section 1A of FRS 102 The Financial Reporting
Standard applicable in the UK and Republic of Ireland", and two policy texts the user can edit,
seeded with one-sentence defaults.

New file `app/services/smallCompanyAccountsIxbrl.js` exports `buildSmallCompanyAccounts(input)`
and imports `CONCEPTS`, `MEMBERS`, `DIMENSIONS`, `buildContexts`, `buildDimensionedContext`,
`renderStatement`, `renderFixedFact`, `renderMonetaryFact` and `NAMESPACES` from
`microEntityAccountsIxbrl.js`; export those that are not exported yet. Its unit test mirrors
`microEntityAccountsIxbrl.test.js` and adds: every P&L concept present in both years, `ProfitLoss`
present, both directors' report elements present, one `NameEntityOfficer` per director each with a
distinct member, the regime statement phrase check, no emitted concept missing from the fixture.

### The envelope

Nothing changes in `buildAccountsSubmission`. `FormIdentifier` stays `Accounts`, `Category` stays
`ACCOUNTS`, `Filename` stays `Accounts.xml`. The TIS derives the accounts category from the iXBRL.

### The page and the activity

`web/public/companies-house/fileSmallCompanyAccounts.html`, built from
`fileMicroEntityAccounts.html`: same company lookup, same two balance sheet fieldsets, then:

- `priorPeriodStart` beside the prior year figures.
- `currentProvisions` and `priorProvisions`, default 0.
- Profit and loss fieldset, both years, prefixed `current`/`prior`: `Turnover`, `CostOfSales`,
  `AdministrativeExpenses`, `OtherOperatingIncome`, `InterestReceivable`, `InterestPayable`, `Tax`,
  `ProfitForTheYear`. The page derives and shows gross profit, operating profit and profit before
  tax, and refuses to submit when the entered profit for the year does not match.
- Directors' report fieldset: `principalActivities` (textarea), `directorName1` upward with an
  "Add director" button (at most 40), `directorsReportSignedBy`, `directorsReportDateSigned`.
- Accounting policies fieldset: `turnoverPolicy` and `tangibleFixedAssetsPolicy` textareas, seeded.
- Five statement tick boxes: the three shared with the micro-entity page,
  `statementSmallCompaniesRegime`, `statementDirectorsReportSmallCompaniesRegime`.

The request body gains `regime: "small-company"` and the fields above.
`extractAndValidateAccountsParameters` in `companiesHouseAccountsPost.js` branches on `regime`
(`micro-entity` when absent), validates the section 1A fields, and the preview and submit Lambdas
call `buildSmallCompanyAccounts`. The API paths are unchanged.

Catalogue entry, in the shape of `file-micro-entity-accounts`:

```
[[activities]]
id = "file-small-company-accounts"
name = "File Small Company Accounts (Companies House)"
display = "on-entitlement"
bundles = ["resident-ltd", "resident-pro"]
tokenCost = 1
metered = true
paths = ["companies-house/fileSmallCompanyAccounts.html", "^/api/v1/companies-house/accounts.*"]
environments = ["local", "test", "simulator", "proxy", "ci"]
```

Behaviour suite `behaviour-tests/companiesHouse/fileSmallCompanyAccounts.behaviour.test.js` with
npm scripts in the shape of `test:fileMicroEntityAccountsBehaviour-*`. Two cases: accepted end to
end; `SMALL_COMPANY_STATEMENT_MISSING` reaches the page as a gateway error.

Filleted accounts (section 444, no P&L or directors' report on the register) are a later switch on
this page: member `bus:FilletedAccounts` and
`direp:StatementThatDirectorsHaveElectedNotToDeliverProfitLossAccountUnderSection4445ACompaniesAct2006`,
both in the fixture. The format 1 sub-headings (stocks, debtors, cash) are a later widening of the
balance sheet fieldset.

### Simulator scenarios

One real check and two header cases. The real check: `handleAccounts` in
`routes/companies-house-xmlgw.js` base64-decodes `Data`, parses it with `parseXmlDocument`, and
passes the `AccountingStandardsDimension` member, the `EntityDormantTruefalse` value and the set of
`ix:nonNumeric` names to `submitAccounts` as `conceptsPresent`. `scenarios/accounts-filing.js`
holds the TIS statement table per category and answers a `business` error naming the first missing
concept (`RaisedBy` `CompaniesHouse`, `Text` `<concept> is missing`) in the `schemaFailureError`
shape. The gateway parses the iXBRL synchronously and answers the same way.

Header cases, a string compared in `submitAccounts` as the existing ones are:

| `Gov-Test-Scenario` | Answer |
|---|---|
| `SMALL_COMPANY_STATEMENT_MISSING` | `business` error, `Text` `StatementThatAccountsHaveBeenPreparedInAccordanceWithProvisionsSmallCompaniesRegime is missing` |
| `SMALL_COMPANY_PROFIT_LOSS_MISSING` | `business` error, `Text` `ProfitLoss is missing` |

Tests added to `app/unit-tests/http-simulator/scenarios/accounts-filing.test.js` and
`routes/companies-house-xmlgw.test.js`: a micro-entity document passes the table, a small-company
document without `ProfitLoss` fails it, each header case.

### Sandbox proof

The B34.6b shape. `npm run validate:accounts-ixbrl -- --regime small-company` posts a generated
document to <https://test-validator.companieshouse.gov.uk/xbrl_validate>; its answer goes into the
PR. Then one accepted small-company submission against the test service with the ci presenter
credentials and `GatewayTest` 1; the `SubmissionNumber` and `GatewayTimestamp` go into the PR.

Effort: 5 days for one Sonnet agent. 4 new files (generator, its test, page, behaviour suite),
10 changed (`microEntityAccountsIxbrl.js`, `companiesHouseAccountsPost.js`,
`companiesHouseAccountsPreviewPost.js`, `accounts-filing.js` and its test,
`companies-house-xmlgw.js` and its test, `submit.catalogue.toml`, `package.json`,
`scripts/validate-accounts-ixbrl.js`).

## Dormant company accounts

The accounts TIS 5.9, "FRS unaudited dormant accounts": "Dormant accounts (identified by
EntityDormantTruefalse) must contain the necessary statements to the Balance sheet: Section 480
exemption statement, Audit not required by members statement, Directors responsibility statement,
Small companies regime statement OR Prepared in accordance with micro-entity provisions statement."
Its "Additional rules governing Dormant Accounts (DCA accounts)": only companies limited by shares
that have never traded, where the only transaction is the issue of subscriber shares; not a
subsidiary or holding company; "any paid element should be shown as Cash at Bank and in hand, any
unpaid element shown as Called up share capital not paid"; the first year's accounts include a
note detailing the allocation of shares; a company that acted as agent states so in the notes.

### Entry point and concepts

Same entry point, same micro-entity regime (`Micro-entities` member, micro-entity provisions
statement), so a dormant filing is the micro-entity filing with `dormant: true`, which the
generator's input already carries and `EntityDormantTruefalse` already renders. `EntityTradingStatus`
leaves its default: it is reported in a context carrying `bus:EntityTradingStatusDimension` =
`bus:EntityHasNeverTraded`. The section 480 statement takes the place of the section 477 statement.

New `CONCEPTS` entries, every name in the fixture:

| Key | Concept |
|---|---|
| `statementAuditExemptionSection480` | `direp:StatementThatCompanyEntitledToExemptionFromAuditUnderSection480CompaniesAct2006RelatingToDormantCompanies` |
| `calledUpShareCapitalNotPaid` | `core:CalledUpShareCapitalNotPaid` |
| `cashBankOnHand` | `core:CashBankOnHand` |
| `companyHasActedAsAnAgentDuringPeriodTruefalse` | `direp:CompanyHasActedAsAnAgentDuringPeriodTruefalse` |
| `descriptionShareType` | `bus:DescriptionShareType` |
| `numberSharesAllotted` | `core:NumberSharesAllotted` |
| `parValueShare` | `core:ParValueShare` |
| `nominalValueAllottedShareCapital` | `core:NominalValueAllottedShareCapital` |

New `MEMBERS`: `bus:EntityHasNeverTraded`. New `DIMENSIONS`: `bus:EntityTradingStatusDimension`.

Searched the fixture: `Dormant` hits three names, `bus:EntityDormantTruefalse`, the statement
above, and `bus:DormantAccountsShouldOnlyBeFiledIfNoSignificantAccountingTransactionHasTakenPlaceDuringAccountingPeriodGuidance`
(a guidance item, never emitted). `Section480` hits the statement alone. There is no dormant
balance sheet or DCA form element; the balance sheet is the micro-entity one.

Phrase check for the section 480 statement: "exempt" or "exemption", and "section 480 of the
Companies Act 2006". `STATEMENT_TEXT` gets "For the year ending {periodEnd} the company was
entitled to exemption from audit under section 480 of the Companies Act 2006 relating to dormant
companies." `STATEMENT_KEYS` becomes a function of `dormant`: section 480 in, section 477 out.

Balance sheet in dormant mode: `calledUpShareCapitalNotPaid` (unpaid subscriber shares, the top
line, instant context), `cashBankOnHand` (paid shares, and the only current asset, so
`CurrentAssets` equals it), fixed assets 0, both creditors 0, profit and loss account 0, capital and
reserves equal to called up share capital. Net assets add the unpaid share capital. The share
allocation note is four facts in the current duration context: `descriptionShareType` (text),
`numberSharesAllotted` (`pure` unit), `parValueShare` and `nominalValueAllottedShareCapital`
(`GBP`). `companyHasActedAsAnAgentDuringPeriodTruefalse` is emitted always, `true` or `false`.
Average employees is fixed at 0.

Unit tests added to `microEntityAccountsIxbrl.test.js`: dormant output carries the section 480
statement and no section 477 statement, `EntityDormantTruefalse` is `true`, the trading status
context carries the `EntityHasNeverTraded` member, the share note facts are present, the balance
sheet adds up with unpaid share capital, no emitted concept missing from the fixture.

### The envelope

Nothing changes. Dormant accounts are `FormIdentifier` `Accounts`, `Category` `ACCOUNTS`, the same
as trading accounts. Companies House reads the dormant flag from the iXBRL.

### The page and the activity

`fileMicroEntityAccounts.html` gains a `dormant` tick box, "The company was dormant for the whole
period", above the balance sheet. Ticked, the page:

- hides fixed assets, both creditors lines and the profit and loss account for both years and
  sends 0 for each;
- shows `currentCalledUpShareCapitalNotPaid` and `currentCashAtBank` (and the `prior` pair),
  derives current assets as the cash figure and capital and reserves as called up share capital,
  and refuses to submit when called up share capital does not equal unpaid plus paid;
- shows the share note fields `shareClassDescription`, `sharesAllotted`, `shareNominalValue`;
- shows `actedAsAgent` (tick box);
- fixes `averageEmployees` at 0;
- swaps the first statement's wording to section 480 and its input id to
  `statementSection480Exemption`.

The request body carries `dormant: true`, `shareNote: { description, numberAllotted, nominalValue }`
and `actedAsAgent`. `extractAndValidateAccountsParameters` validates them when `dormant` is set and
passes `dormant` to the generator. The activity and catalogue entry are unchanged; dormant
accounts are the micro-entity activity.

The behaviour suite gains a third case: tick dormant, enter subscriber shares only, submit, see
accepted.

### Simulator scenarios

The real check in `submitAccounts` (above) gains the dormant row: `EntityDormantTruefalse` `true`
requires the section 480 statement, the members statement, the directors statement, and either the
regime statement or both directors' report elements. A dormant document carrying the section 477
statement in place of section 480 is answered with `business` error `Text`
`StatementThatCompanyEntitledToExemptionFromAuditUnderSection480CompaniesAct2006RelatingToDormantCompanies is missing`.

Header cases:

| `Gov-Test-Scenario` | Where | Answer |
|---|---|---|
| `DORMANT_SECTION_480_MISSING` | `submitAccounts` | `business` error, `Text` as above |
| `DORMANT_SUBSIDIARY_REJECTED` | `pollStatus` | `REJECT`, `RejectCode` `2`, `Description` `Dormant company accounts cannot be filed by a subsidiary or holding company` |

Tests added to `accounts-filing.test.js`: the dormant table row, both header cases.

### Sandbox proof

The B34.6b shape. `npm run validate:accounts-ixbrl -- --dormant` first, answer into the PR. Then
one accepted dormant submission against the test service with the ci presenter credentials and
`GatewayTest` 1; `SubmissionNumber` and `GatewayTimestamp` into the PR.

Effort: 2 days for one Sonnet agent. 0 new files, 8 changed (`microEntityAccountsIxbrl.js` and its
test, `companiesHouseAccountsPost.js`, `fileMicroEntityAccounts.html`,
`fileMicroEntityAccounts.behaviour.test.js`, `accounts-filing.js` and its test,
`scripts/validate-accounts-ixbrl.js`).

## CT600 to HMRC carrying the same accounts

A company tax return is the CT600 in XML plus iXBRL accounts and iXBRL computations, sent through
the HMRC Transaction Engine in a GovTalk envelope. The accounts file is the one this plan already
builds for Companies House, regenerated from the same input, so one balance sheet serves both
filings.

Sources fetched: the gov.uk collection "Corporation Tax online: support for software developers"
(<https://www.gov.uk/government/collections/corporation-tax-online-support-for-software-developers>);
"How to use the test service" 1.4a (ODT); "CT600 V3 (2026) Artefacts V1.994"
(`HMRC-CT-2014-v1-994.zip`: `CT-2014-v1-994.xsd`, `envelope-v2-0-HMRC.xsd`); "Corporation Tax
online service validation rules" 1.17a (ODT);
"Joint filing common validation checks" 4.4a (ODT); "Transaction Engine: Document Submission
Protocol" 2.0 (PDF). The collection page
<https://www.gov.uk/government/collections/transaction-engine-support-for-software-developers>
returned 404; the DSP PDF was reached from its own publication page.

Unverified, from those fetches: the CT computational taxonomy 2025 entry point URL (the
"Taxonomies accepted by HMRC" page lists the taxonomy without its URL in the fetched text); the
IRmark algorithm (the IRmark technical pack was not fetched; the validation rules say the IRmark is
mandatory with `@Type` `generic`, error 2021 for a mismatch and 2022 when missing); whether HMRC
accepts an FRS 102 entry-point document carrying the `Micro-entities` member (the FRC 2026 suite is
listed as accepted; the TPVS run below settles it).

### The return

Schema `CT-2014-v1-994.xsd`, version 1.994, namespace `http://www.govtalk.gov.uk/taxation/CT/5`
(the namespace for accounting periods starting on or after 1 April 2015). Save it and
`envelope-v2-0-HMRC.xsd` under `fixtures/hmrc-ct/`. The body is `IRenvelope` holding `IRheader` and
`CompanyTaxReturn ReturnType="new"`:

- `IRheader`: `Keys/Key Type="UTR"`, `PeriodEnd`, `IRmark Type="generic"`, `Sender` = `Company`.
- `CompanyInformation`: `CompanyName`, `RegistrationNumber` (the company number; rule 1606 requires
  it to equal `UKCompaniesHouseRegisteredNumber` in the accounts), `Reference` (the UTR),
  `CompanyType` (integer 0 to 11; 0 for a company none of the special types describe),
  `PeriodCovered/From` and `To`.
- `ReturnInfoSummary`: `Accounts/ThisPeriodAccounts` `yes`, `Computations/ThisPeriodComputations`
  `yes`.
- `Turnover/Total`.
- `CompanyTaxCalculation`: `Income/Trading/Profits`, `Income/Trading/NetProfits`,
  `ProfitsBeforeOtherDeductions`, `ChargesAndReliefs/ProfitsBeforeDonationsAndGroupRelief`,
  `ChargeableProfits`, `CorporationTaxChargeable/FinancialYearOne/Year` and `Details/Profit`,
  `TaxRate`, `Tax` (and `FinancialYearTwo` when the period straddles 1 April),
  `CorporationTax`, `NetCorporationTaxChargeable`, `CalculationOfTaxOutstandingOrOverpaid/
  NetCorporationTaxLiability`, `TaxChargeable`, `TaxPayable`.
- `Declaration`: `AcceptDeclaration` `yes`, `Name`, `Status`.
- `AttachedFiles/XBRLsubmission`: `Computation/Instance/EncodedInlineXBRLDocument` then
  `Accounts/Instance/EncodedInlineXBRLDocument`, each base64, each with `Filename`.

Rule 1604: accounts iXBRL or PDF, computations iXBRL only. Rule 1607: the computation's
`TaxReference` equals `Reference` and its `EndOfPeriodCoveredByReturn` equals `PeriodCovered/To`.
Rule 3304 (live only): a second original return for the same period is refused; an amendment
carries `ReturnType="amended"`. A period of account longer than twelve months needs two returns;
the page refuses it, and the split is a later step.

New file `app/services/ct600Return.js`: `buildCompanyTaxReturn(input)` returns the `IRenvelope`
XML without the IRmark, `computeCorporationTax({ chargeableProfits, periodStart, periodEnd,
associatedCompanies })` returns the financial-year split, rates and tax (small profits rate,
main rate and marginal relief by financial year, rates in one table keyed by year), and
`insertIrMark(xml, irMark)` fills the `IRmark` element. Tests parse the output with
`fast-xml-parser`, check that every element the saved XSD marks `minOccurs="1"` on the path to the
attachments is present in schema order, and check the tax table against HMRC's published rates for
FY2023 to FY2026.

### The computations

Second iXBRL document, against the HMRC CT computational taxonomy 2025. Its entry point URL is
unverified; take it from the "Taxonomies accepted by HMRC" HTML detail page or the
`ct-computations-format-version-1.1.pdf` on the XBRL specifications page, pin it in one constant
in the new generator, and produce `fixtures/hmrc-ct-comp/ct-comp-2025-concepts.json` with
`scripts/generate-frc-taxonomy-concepts.js` pointed at it. Rule 1607 names two concepts,
`TaxReference` and `EndOfPeriodCoveredByReturn`; the rest of the computation names (company name,
period start, turnover, profit before tax, disallowable expenses, capital allowances, adjusted
trading profit, chargeable profits, tax) are resolved from the downloaded entry point and recorded
in one map, the rule this plan already applies to the balance sheet. None is in
`frs-102-2026-concepts.json`, which lists the FRC taxonomy.

New file `app/services/ctComputationsIxbrl.js`: `buildCtComputations(input)` in the shape of
`buildMicroEntityAccounts`, one duration context, `GBP` and `pure` units, and the same first-line
and fixture-membership tests.

### Accounts additions

The joint filing checks (rule 3312, FRS 2022 to 2026 taxonomies) require two items Companies
House does not: `bus:LegalFormEntity` and `bus:DescriptionPrincipalActivities`. Both are in the
fixture, as are `bus:LegalFormEntityDimension` and the member `bus:PrivateLimitedCompanyLtd`. Add
`legalFormEntity` to `CONCEPTS` (`descriptionPrincipalActivities` arrives with section 1A) and emit
both for every regime: `LegalFormEntity` in a context carrying `LegalFormEntityDimension` =
`PrivateLimitedCompanyLtd`, `DescriptionPrincipalActivities` as text from a new `principalActivities`
input that the micro-entity page gains as one text field. Companies House accepts extra facts, so
one document serves both. Rule 3316: every context whose identifier scheme is
`http://www.companieshouse.gov.uk/` carries the company number, which `buildContexts` already does.

### The envelope

A second transport beside the Companies House one; `companiesHouseXmlGateway.js` is unchanged.
New file `app/services/hmrcTransactionEngine.js`:

- `buildSubmissionRequest({ senderId, password, utr, vendorId, productName, productVersion, irEnvelopeXml, gatewayTest })`:
  `GovTalkMessage` in `http://www.govtalk.gov.uk/CM/envelope`, `EnvelopeVersion` `2.0`,
  `Class` `HMRC-CT-CT600`, `Qualifier` `request`, `Function` `submit`, `TransactionID`
  (hex, at most 32 characters), empty `CorrelationID`, `Transformation` `XML`, `GatewayTest` `1`
  against the External Test Service and absent live; `SenderDetails/IDAuthentication` with
  `SenderID` (the Government Gateway user ID), `Method` `clear`, `Role` `principal`, `Value` (the
  password, clear text: the DSP says so); `GovTalkDetails/Keys/Key Type="UTR"`;
  `ChannelRouting/Channel` with `URI` (the 4-digit vendor ID), `Product`, `Version`; the
  `IRenvelope` in `Body`.
- `buildPollRequest({ correlationId, gatewayTest })`: `Qualifier` `poll`, `Function` `submit`,
  the `CorrelationID` from the acknowledgement.
- `buildDeleteRequest({ correlationId, gatewayTest })`: `Qualifier` `request`, `Function`
  `delete`. The DSP requires it after a response is read.
- `computeIrMark(irEnvelopeXml)`: SHA-1 over the canonicalised `Body` content with the `IRmark`
  element removed, base64; the IRmark technical pack is the source and its worked example is the
  unit test's fixture. Fetch that pack before building this function.
- `parseTransactionEngineResponse(xml)`: `qualifier` (`acknowledgement`, `response`, `error`),
  `correlationId`, `pollInterval` (from `ResponseEndPoint@PollInterval`), `responseEndPoint`,
  `errors` (`GovTalkErrors/Error`: `RaisedBy`, `Number`, `Type`, `Text`, `Location`), and the
  success body's `IRmarkReceipt`, `Message` and `AcceptedTime`.
- `postToTransactionEngine(xml, url)`: `fetchTextWithTimeout`, `Content-Type` `text/xml`,
  `DEFAULT_TIMEOUTS.LONG`.

Endpoints: live `https://transaction-engine.tax.service.gov.uk/submission`; External Test Service
`https://test-transaction-engine.tax.service.gov.uk/submission` and `/poll`; the poll URL is the
`ResponseEndPoint` the acknowledgement returns. TPVS
`https://www.tpvs.hmrc.gov.uk/HMRC/CT600` validates the body alone, without credentials. Test in
live: `Class` `HMRC-CT-CT600-TIL`. Environment variables `HMRC_TRANSACTION_ENGINE_URI` (the
simulator sets its own), `HMRC_CT_VENDOR_ID`, `HMRC_CT_GATEWAY_TEST`. The customer's Government
Gateway credentials are entered on the page and dropped after the call, the way the company
authentication code is.

Flow: submit, acknowledgement with `CorrelationID` and `PollInterval`, poll after that interval,
acknowledgement again or `response` or `error`, then delete. Persistence follows the accounts
filing: `putAsyncRequest` with the `CorrelationID` as the request id, `pending` until the response
lands, a receipt on success carrying `IRmarkReceipt` and `AcceptedTime`. Transaction Engine errors
1002 and 1046 are authentication failures.

### The page and the activity

`web/public/hmrc/ct/fileCorporationTaxReturn.html`, built from `fileMicroEntityAccounts.html`'s
head block, widgets and view layout. It opens from a "File the CT600 with these accounts" button
that the Companies House result view shows after `ACCEPT`; that button puts the accounts request
body in `sessionStorage` under `accountsFilingInput` and the CT page reads it, shows the company,
period and balance sheet summary, and fills `principalActivities` from it. Without the stored
input, the page shows the micro-entity fieldsets copied from that page and takes the accounts
fields itself.

Fields: `utr` (10 digits), `governmentGatewayUserId`, `governmentGatewayPassword`, `companyType`
(default 0), `turnover`, `profitBeforeTax` (from the P&L when the accounts are section 1A; entered
when micro-entity), `disallowableExpenses`, `capitalAllowances`, `associatedCompanies` (default 0),
`declarationName`, `declarationStatus` (default `Director`). The page derives adjusted trading
profit, chargeable profits, the financial-year split and the tax, shows them, and refuses to
submit a period of account longer than twelve months.

Lambdas in `app/functions/hmrc/`: `hmrcCorporationTaxReturnPreviewPost.js`
(`POST /api/v1/hmrc/ct/return/preview`, returns the CT600 XML, the computations iXBRL and the
accounts iXBRL, never reaches the Transaction Engine), `hmrcCorporationTaxReturnPost.js`
(`POST /api/v1/hmrc/ct/return`, builds the three documents, computes the IRmark, submits, records
the async request), `hmrcCorporationTaxReturnGet.js` (`GET /api/v1/hmrc/ct/return/{correlationId}`,
polls, deletes on response, writes the receipt). Request body: `{ accounts: <the accounts request
body>, ct600: { ...fields above } }`. All three `enforceBundles` first, `jwtAuthorizer = true`,
`customAuthorizer = false`, JSON always. CDK: three Lambdas in `HmrcStack.java`, their fields in
`SubmitSharedNames.java`, props `hmrcTransactionEngineUri`, `hmrcCtVendorId`, `hmrcCtGatewayTest`
read in `SubmitApplication.java` with `envOr`, each Lambda in `Lambda.stackHealthAlarm` with a
`cfnOutput`, and a new `HmrcStackTest.java` in the shape of `CompaniesHouseStackTest.java`.

Catalogue entry:

```
[[activities]]
id = "file-corporation-tax-return"
name = "File Company Tax Return CT600 (HMRC)"
display = "on-entitlement"
bundles = ["resident-ltd", "resident-pro"]
tokenCost = 1
metered = true
paths = ["hmrc/ct/fileCorporationTaxReturn.html", "^/api/v1/hmrc/ct/.*"]
environments = ["local", "test", "simulator", "proxy", "ci"]
```

No `hmrcScopesRequired`; the Transaction Engine authenticates with Government Gateway credentials.

Behaviour suite `behaviour-tests/hmrc/fileCorporationTaxReturn.behaviour.test.js`: file
micro-entity accounts, click through to the CT600, enter the tax fields, submit, see pending, see
accepted with the IRmark receipt. A second case sets `CT600_IRMARK_REJECTED` and asserts the error
text reaches the page.

### Simulator scenarios

New route `app/http-simulator/routes/hmrc-transaction-engine.js`, mounted at `/submission` and
`/poll`, state in a new `app/http-simulator/scenarios/ct600-filing.js` in the shape of
`accounts-filing.js`, exporting `submitReturn`, `pollReturn`, `deleteReturn` and
`resetCt600Filings`. The route parses the envelope, answers `error` with `GovTalkErrors` `Number`
1046 `Type` `fatal` for a `SenderID` other than the simulator's fixed `SIMULATOR_GATEWAY_USER_ID`
/ `SIMULATOR_GATEWAY_PASSWORD`, checks the `IRmark` against its own `computeIrMark` and answers
2021 on a mismatch and 2022 when absent, decodes both attachments and applies rules 1606 (company
number match) and 1607 (UTR and period end match), and otherwise answers `acknowledgement` with a
fresh hex `CorrelationID` and `PollInterval` 1. The first poll answers `acknowledgement`, later
polls `response` with a `SuccessResponse` body. A delete answers a delete response and forgets the
`CorrelationID`; a poll after that answers error 2000.

Header cases, in the `accounts-filing.js` form:

| `Gov-Test-Scenario` | Where | Answer |
|---|---|---|
| `AUTH_FAILURE` | `submitReturn` | `error`, `Number` 1046, `Text` `Authentication Failure` |
| `CT600_IRMARK_REJECTED` | `submitReturn` | `error`, `Number` 2021, `Text` `The supplied IRmark is incorrect.` |
| `CT600_ACCOUNTS_CRN_MISMATCH` | `pollReturn` | `error`, `Number` 1606, `Text` `The UKCompaniesHouseRegisteredNumber in the accounts must match the RegistrationNumber in the CT600` |
| `CT600_MANDATORY_ITEM_MISSING` | `pollReturn` | `error`, `Number` 3312, `Text` `Legal form of entity (uk-bus:LegalFormEntity) is missing. Location: Accounts` |
| `CT600_ORIGINAL_ALREADY_RECEIVED` | `pollReturn` | `error`, `Number` 3304, `Text` `Original return already received for this period.` |
| `PENDING_FOREVER` | `pollReturn` | `acknowledgement` on every poll |

Tests in `app/unit-tests/http-simulator/scenarios/ct600-filing.test.js` and
`routes/hmrc-transaction-engine.test.js`: acknowledgement, each error, acknowledgement then
response, delete then 2000, each header case.

### Sandbox proof

Three steps, each pasted into the PR. First TPVS: `npm run validate:ct600 -- --tpvs` posts the
`IRenvelope` with both attachments to `https://www.tpvs.hmrc.gov.uk/HMRC/CT600` and prints the
answer; no credentials. Second, the operator registers with the Software Developers Support Team
(<https://www.gov.uk/government/organisations/hm-revenue-customs/contact/software-developers-support-team>)
for a 4-digit vendor ID and External Test Service credentials, which reach the build as
`HMRC_CT_VENDOR_ID`, `HMRC_CT_TEST_SENDER_ID` and `HMRC_CT_TEST_SENDER_VALUE` on the GitHub `ci`
environment; a test-lane flag lets the ci page use them in place of typed credentials. Third, one
`response` from `https://test-transaction-engine.tax.service.gov.uk/submission` with `GatewayTest`
1 carrying an `IRmarkReceipt`. HMRC recognition (the listing of the product on gov.uk) is a later
step the SDST describes.

Effort: 10 days for one Sonnet agent, after the accounts additions above. 23 new files (three
services and their three tests, the computations fixture and the two schema fixtures, the page,
three Lambdas and their three tests, the route and its test, the scenario module and its test, the
behaviour suite, `scripts/validate-ct600.js`, `HmrcStackTest.java`), 10 changed
(`microEntityAccountsIxbrl.js`, `fileMicroEntityAccounts.html`, `companiesHouseAccountsPost.js`,
`app/bin/server.js`, `app/http-simulator/server.js`, `HmrcStack.java`, `SubmitSharedNames.java`,
`SubmitApplication.java`, `submit.catalogue.toml`, `package.json`).

## Build brief for Sonnet

Order matters. The simulator route and the generator land first, so everything after them has
something to run against.

**1. Simulator (`app/http-simulator/`).** `scenarios/accounts-filing.js` holds the submission map,
the scenario table and the used-submission-number set, exporting `submitAccounts`, `pollStatus` and
`resetAccountsFilings`. `routes/companies-house-xmlgw.js` exports `apiEndpoint(app)` and mounts
`POST /v1-0/xmlgw/Gateway`. Register it in `app/http-simulator/server.js`. Save
`FormSubmission-v2-11.xsd`, `GetSubmissionStatus-v2-9.xsd`, `Egov_ch-v2-0.xsd` and `Accounts.xml`
under `fixtures/companies-house-xmlgw/`. Tests in `app/unit-tests/http-simulator/`: acknowledgement,
each error case, pending then accept, each scenario header.

**2. Generator (`app/services/microEntityAccountsIxbrl.js`).** `buildMicroEntityAccounts(input)`
returns the XHTML string. Helpers `buildContexts`, `formatMonetary`, `renderStatement`. Checked-in
concept list at `fixtures/frc-taxonomy/frs-102-2026-concepts.json`, produced by a one-off script
that reads the entry point. Tests in `app/unit-tests/services/microEntityAccountsIxbrl.test.js`
covering the mandatory concepts, the four statements, the exact first line, the dimension defaults
rule, and that no emitted concept is missing from the list. Add `scripts/validate-accounts-ixbrl.js`
and the `validate:accounts-ixbrl` npm script.

**3. Envelope (`app/services/companiesHouseXmlGateway.js`).** `hashPresenterCredential(value)`,
`buildAccountsSubmission({...})`, `buildStatusRequest({...})`, `parseGatewayResponse(xml)`,
`allocateSubmissionNumber()`, `postToGateway(xml)` using `fetchJsonWithTimeout`'s text sibling and
`DEFAULT_TIMEOUTS.LONG`. `resolvePresenterCredentials()` caches the Secrets Manager value across
warm starts, matching `companiesHouseFilingApi.resolveClientSecret`. Tests build an envelope and
diff it against the published example, and parse both example responses.

**4. Lambdas (`app/functions/companies-house/`).** `companiesHouseAccountsPreviewPost.js`
(`POST /api/v1/companies-house/accounts/preview`, returns the iXBRL, never calls the gateway),
`companiesHouseAccountsPost.js` (`POST /api/v1/companies-house/accounts`, generates, submits,
records the async request, publishes `companies-house-accounts-submitted`),
`companiesHouseAccountsGet.js` (`GET /api/v1/companies-house/accounts/{submissionNumber}`, polls,
updates the async request, writes a receipt on accept). All three: `enforceBundles` first,
`jwtAuthorizer = true`, `customAuthorizer = false`, JSON always. Register them in
`app/bin/server.js`. One unit test file each, in the shape of the existing companies-house tests.

**5. CDK.** Add the three Lambdas to `CompaniesHouseStack.java` and their fields to
`SubmitSharedNames.java`. New props `companiesHouseXmlGatewayUri`, `companiesHousePresenterIdArn`,
`companiesHousePresenterCodeArn`, read in `SubmitApplication.java` with `envOr`. Only the two filing
Lambdas get `secretsmanager:GetSecretValue` on the presenter secrets. Add all three to
`Lambda.stackHealthAlarm` and give each a `cfnOutput`. Extend `CompaniesHouseStackTest.java`: the
Lambda count, the presenter secret grant, that the preview Lambda cannot read it, and the blank-ARN
case. Run `./mvnw clean verify`.

**6. Page, catalogue, behaviour suite.** As described above, plus npm scripts for the new suite in
the shape of the existing `-simulator` entries.

**Verification.** `npm test`, `./mvnw clean verify`, then
`npm run test:fileMicroEntityAccountsBehaviour-simulator`. Then run
`npm run validate:accounts-ixbrl` by hand and paste the validator's answer into the PR.

Size: about 14 new files and 8 changed, roughly 2,600 lines including tests and fixtures.
