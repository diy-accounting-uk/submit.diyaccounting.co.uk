# PLAN: Companies House accounts filing (FRS 105 micro-entity, XML Gateway)

> Backlog row 34b. The REST filings stay as they are in `PLAN_COMPANIES_HOUSE_REST_FILING.md`; that
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
`Authority` (`Designation` = `DIR`, `DateSigned`), an empty `Form`, and `Document` holding `Data`
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

## Horizons

FRS 102 section 1A small-company accounts are the same envelope with a wider tag set and a
directors' report. Dormant accounts (DCA) are a narrower case with its own rules in the accounts
TIS. Pairing with a CT600 to HMRC would let one balance sheet serve both filings, the combination
customers asked about when the joint filing service closed. None of the three is designed yet.

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
