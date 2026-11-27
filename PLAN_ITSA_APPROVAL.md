<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: ITSA production approval, the software finder listing and the Income Tax account view

The build is done and proven in the sandbox; its plan is archived at
`../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_ITSA_PHASE_2.md`. This plan
carries what stands between that build and real customers: HMRC's production access for Income
Tax (MTD), the software finder listing, the Income Tax ad group, and the unhide rows that put the
forms on prod. It also carries the Income Tax account view from HMRC's Self Assessment Accounts
API (ISA1 to ISA8, OISA1).

Status (2026-11-26): IA5 to IA10 and UH1 to UH3 are open, and each waits on HMRC's early-2027
update on 2027-28 production access. ISA1 to ISA5, ISA7 and OISA1 can start now; ISA6 follows
`PLAN_VAT_PAYMENTS.md` PAY4 and ISA8 follows ISA7. The ISA pages reach prod with UH3. `NEXT.md`
carries none of these rows.

## Operator assertions (verbatim)

> refresh and then extend PLAN_ITSA_APPROVAL.md to include 'the account balance, charges and
> transactions, payments and their allocation, coding-out details' from Self Assessment Accounts
> (MTD) 4.0.

(operator, 2026-11-26.)

> Please list all the ITSA tasks hanging off O11

> Create a new plan doc for all these: [the seven items below] as well as O11 called
> PLAN_ITSA_APPROVAL.md and move items out of PLAN_ITSA_PHASE_2.md and NEXT.md and BACKLOG.md that
> hang off O11 as well as O11 into PLAN_ITSA_APPROVAL.md. Include that email in
> PLAN_ITSA_APPROVAL.md and your appraisal of it.

The seven items as listed on 2026-10-03, before HMRC's letter was read:

> 1. O11, the send. `../private.diyaccounting.co.uk/hmrc/itsa/DRAFT_EMAIL_ITSA_RECOGNITION.md` to
>    SDSTeam@hmrc.gov.uk from antony@diyaccounting.co.uk, inside HMRC's 14-day window, which closes
>    2026-10-09. The evidence for each claim is in
>    `../private.diyaccounting.co.uk/hmrc/itsa/evidence/README.md`.
> 2. The production-credentials email, when SDST answers:
>    `../private.diyaccounting.co.uk/hmrc/itsa/DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md`, same
>    folder. One application covers recognition and production credentials.
> 3. The Production Approvals Checklist, when SDST sends it: a session fills it from
>    `../private.diyaccounting.co.uk/hmrc/itsa/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md` (plan T10),
>    and you return it.
> 4. The software finder listing, asked for in the same exchange: product name, what it supports,
>    pricing, accessibility position, to HMRC's software vendor team (plan step 6).
> 5. B10 closes (BACKLOG 10, ITSA phase 1) on the send; nothing is left to build.
> 6. BACKLOG 11 closes on recognition and production credentials.
> 7. The Income Tax ad group, after recognition: a session adds it to `infra/google/ads/ads.toml`'s
>    "Search: MTD VAT" campaign (keywords and copy in the parent of 8816f93c, PR #414) and applies
>    with `npm run ads:sync -- --apply` on your yes.

Earlier assertions this plan inherits from `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_ITSA_PHASE_2.md`:

> ITSA build, phase 2: annual summaries, final declaration, then the ITSA recognition
> application and finder listing.

> **Parked by operator decision 2026-09-05**: build against the test APIs and have something
> running before making the case; the two emails to HMRC then go out together.

## HMRC's letter of 30 September 2026

Received at antony@diyaccounting.co.uk on 2026-09-30 16:35 from the Software Developer Support
Team (noreply@developer.tax.service.gov.uk), subject "MTD ITSA APIs – Update on Production Access
Arrangements". The body, with the mail client's chrome and the standing footer removed:

> Dear Antony Cartwright,
>
> On 10 August 2026, HMRC announced a temporary pause on new production access applications. HMRC
> has now completed its review of production access arrangements for MTD ITSA software products.
>
> **Review decisions**
>
> HMRC will not accept any new production access requests for software products supporting
> 2026-27, except:
>
> - production access requests submitted before the closure took effect on 10 August; and
> - requests for production access to support 2026-27 end-of-year obligations where production
>   access has already been granted for quarterly obligations for the same software product.
>
> Applications that remain within scope of the current arrangements will continue to be assessed
> against HMRC's existing production access readiness criteria (see below). Applications that do
> not meet those criteria or are not supported by the required evidence will be refused.
>
> **Looking Ahead**
>
> Following completion of the review of current production access arrangements, HMRC is now
> developing the future processes, criteria and operational arrangements for MTD ITSA production
> access. This work is intended to establish a sustainable model that supports a high-quality,
> secure and resilient software ecosystem.
>
> This update reflects HMRC's current position. Decisions are still required regarding future
> production access and onboarding arrangements. HMRC will provide an update once this work has
> concluded and the necessary governance decisions have been taken.
>
> HMRC expects to provide information by early 2027, including:
>
> - timing for 2027-28 production access applications for existing software developers seeking
>   production access for their software to support 2027-28 obligations and for new software
>   developers seeking production access for their software;
> - the production access criteria and readiness requirements that will apply;
> - the application and onboarding process; and
> - any supporting guidance and key milestones to be aware of.
>
> Thank you for your continued engagement with the MTD ITSA programme.
>
> Kind regards,
>
> Louise Tarpy
> Head of External Software Integration
>
> ---
>
> **Making Tax Digital for ITSA - Getting ready for Production Access**
>
> Our SLA assumes applications are 'ready' when the request for production access is made;
> however, a significant proportion of applications received are failing to meet the MTD ITSA
> readiness criteria, leading to delays, rework, and increased processing times.
>
> Before requesting production access, you must ensure your software is fully built, tested, and
> complies with:
>
> - MTD ITSA end-to-end service guide requirements
> - MTD Minimum Functional Standards (MFS)
> - Process for being granted Production access
> - Developer Hub Terms of Use (ToU)
>
> HMRC is unable to support applications into production that do not meet these standards.
> Failure to ensure your software meets these standards, before submitting your request, may
> result in delays or refusal of your application.
>
> **Defining 'ready'**
>
> To be granted production access, your software must:
>
> - Be built in line with MTD end-to-end service guide requirements, delivering the required
>   behaviours and embedding all relevant APIs as part of a complete end-to-end user journey.
> - Meet Minimum Functional Standards for your product's scope, supporting relevant income types,
>   accounting methods and submission types, and correctly handling obligations and business
>   details.
> - Meet digital record-keeping requirements; submissions and amendments must be derived from
>   digital records only (no manual entry).
> - Adhere to HMRC's Terms of Use, meeting ToU expectations, including acceptable use, data
>   handling, user consent, and accurate representation of your product and its capabilities.
> - Be fully tested and ready for real users; all relevant endpoints and complete user journeys
>   should be tested, including error handling for both success and failure scenarios. Note:
>   testing logs are automatically deleted after 30 days; you therefore need to ensure that you
>   have tested recently, prior to requesting production access.
> - Handle data securely and support portability; appropriate security controls must be in place
>   across data handling, user authorisation, development practices and incident management,
>   ensuring the protection of customer data and the integrity of HMRC services. Users must be
>   able to access and export their records.
> - Submit all required Fraud Prevention Headers; fraud prevention headers must be included and
>   compliance evidenced, for all relevant API calls - see Fraud Prevention Header guidance.
> - Provide a clear and stable customer experience, with data correctly displayed, errors surfaced
>   clearly, limitations explained and appropriate disclaimers shown.
> - Use of AI tools: Where AI tools are used in development, supporting materials and
>   communications, developers must apply appropriate assurance. Any AI-assisted outputs must be
>   reviewed, tested and validated to ensure they are accurate and compliant with HMRC
>   requirements. Developers remain fully accountable for their software and must be able to
>   evidence assurance applied; unverified or generic outputs will be rejected.
>
> Software Developer Support Team
> HMRC CDIO EPS | Enterprise Integration Services

## Appraisal

**Neither exception admits us, so no 2026-27 application can succeed.**

- Exception 1 needs a request lodged before 10 August 2026. The mail mirror of both mailboxes,
  read through 2026-10-03, holds no ITSA production access request from us; the recognition and
  production-credentials emails are unsent drafts in `../private.diyaccounting.co.uk/hmrc/itsa/`.
  The 10 August announcement itself is absent from both mailboxes, so we were not on the ITSA
  developer list it went to.
- Exception 2 needs quarterly access already granted for the product. Our production credentials
  cover VAT (MTD) only.
- A 2026-27 application sent now is refused by the letter's own terms, and the refusal sits on
  the record HMRC reads in 2027.

**What the letter opens.**

- The 2027-28 round. HMRC names "existing software developers" as a group it will brief by early
  2027 on timing, criteria and process. We are one through the VAT credentials.
- HMRC keeps sandbox testing logs for 30 days. The eight ITSA suites run against ci on demand,
  so IA5 meets the recency requirement with one dispatch in the month the application goes.
- Readiness, line by line against the letter: end-to-end journey (quarterly update to final
  declaration, both income types), minimum functional standards (all nine APIs, D9), digital
  records (the DIYA-GL import is the source, no manual entry path), terms of use, tested
  journeys with error handling (the eight suites and the three sandbox years of 2026-09-25),
  export (the receipts and the book download), fraud prevention headers (validator clean on the
  ci deployment), customer experience (disclaimers and limits on the calculation and declaration
  pages). The AI-assurance line asks the application to say how AI-assisted output was
  reviewed and tested. This repository's record answers it (every change behind a PR with CI
  gates, the sandbox transcripts, the evidence pack with a check per claim), in row 14 of the
  checklist.

## HMRC production access for Income Tax, as of 2026-11-26

- **Held**: production credentials for VAT (MTD) only, on the production application CMQAA-531.
  No Income Tax API has production access.
- **Our note**: antony@diyaccounting.co.uk wrote to `SDSTeam@hmrc.gov.uk` on 2026-10-03 (text in
  `../private.diyaccounting.co.uk/hmrc/itsa/DRAFT_EMAIL_ITSA_2027_NOTE.md`). It asked to be in
  the 2027-28 notifications, and whether a readiness review or the Production Approvals Checklist
  can be lodged before the window opens.
- **SDST's answer**: Nathan Watson replied on 2026-10-05 and asked us to set up email preferences
  in the Developer Hub (`mail/antony@diyaccounting.co.uk/2026/10/5/1a10c449f358f10e.eml`). The
  operator set them up (2026-11-06). The question about an early readiness review has no answer.
- **Since then**: Developer Hub notices reach antony@diyaccounting.co.uk (the latest on
  2026-11-25). None is about 2027-28 production access.
- **The Developer Hub**: the Self Assessment Accounts API page (updated 2026-11-25) still says
  that HMRC no longer accepts production requests for new 2026-27 quarterly update products.
- **Recognition and the software finder**: neither is applied for. Both wait on HMRC's update.

**What waits.** The recognition application, the production-credentials email, the checklist,
the finder listing and the Income Tax ad group all wait on HMRC's early-2027 update. The ad group
must not run before recognition, because the product could not deliver what it advertised.

## Board

The rows below are this plan's open work, in board order.

### Blocked on HMRC's early-2027 update

Each waits on HMRC publishing the 2027-28 timing, criteria and process. When that arrives, a
session re-reads the criteria against the Appraisal and rewrites these rows before the first
send.

- [ ] **IA5. The sandbox re-run.** Within 30 days before the application: dispatch the eight
  ITSA behaviour suites and the account suite (ISA7) against ci, and
  `scripts/itsa-sandbox-year.js` for 2023-24, 2025-26 and 2026-27
  (`_developers/hmrc/ITSA_PHASE_2_SANDBOX.md`, "The command"); record the run ids and the
  sandbox application id in the evidence README. **Owner**: Claude Code. **Model**: Haiku.
  **Size**: 1 file (private).
- [ ] **IA6. The recognition application.** The operator sends
  `../private.diyaccounting.co.uk/hmrc/itsa/DRAFT_EMAIL_ITSA_RECOGNITION.md` to
  `SDSTeam@hmrc.gov.uk` from antony@diyaccounting.co.uk, rewritten first for the 2027-28 process,
  with the evidence README's check per claim. The rewrite also corrects row "Testing in the last
  two weeks" of `../private.diyaccounting.co.uk/hmrc/itsa/hmrc_questionnaire_itsa_pass_diy_accounting_limited_v1.md`,
  which still gives HMRC's log window as 14 days (it is 30). The application's subscriptions
  include Self Assessment Accounts (MTD) 4.0, and the email names its reads (ISA8). **Owner**:
  Operator (send), Claude
  Code (the rewrite). **Model**: Sonnet. **Size**: 2 files (private).
- [ ] **IA7. The production-credentials email.** When SDST answers:
  `../private.diyaccounting.co.uk/hmrc/itsa/DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md`, same
  folder; one application covers recognition and production credentials. **Owner**: Operator.
  **Model**: none. **Size**: 0 files.
- [ ] **IA8. The Production Approvals Checklist.** When SDST sends it, a session fills it from
  `../private.diyaccounting.co.uk/hmrc/itsa/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md` and the
  operator returns it. **Owner**: Claude Code (fill), Operator (return). **Model**: Haiku.
  **Size**: 1 file (private).
- [ ] **IA9. The software finder listing.** Asked for in the same exchange, to
  `makingtaxdigital-softwarevendors@hmrc.gov.uk`: product name, what it supports (quarterly
  updates, loss claims and a final declaration for self-employment and UK property income),
  pricing, accessibility position. **Owner**: Operator. **Model**: none. **Size**: 0 files.
- [ ] **IA10. The Income Tax ad group.** After recognition: a session adds it to
  `infra/google/ads/ads.toml`'s "Search: MTD VAT" campaign (keywords and copy in the parent of
  8816f93c, PR #414) and applies with `npm run ads:sync -- --apply` on the operator's yes. The
  campaign is `PAUSED` in `ads.toml` (ADS5), so the ad group serves only when the operator also
  un-pauses the campaign. **Owner**: Claude Code. **Model**: Haiku. **Size**: 1 file.

### Unhide on prod

HIDE1 hid these from prod with an environment rule (the catalogue's `environments`, the page
guard in `web/public/widgets/entitlement-status.js`, `enforceBundles` on the practice handlers).
Unhiding one is that rule with `prod` added, and the availability table and dates on
`web/public/mtd-calendar.html` in the same change. The last precondition of each is the
operator's approval to enable it for live users on prod.

- [ ] **UH3. Income Tax forms.** The Income Tax activities it unhides include
  `self-employed-account` (ISA2) and `itsa-payment` (ISA6). The "HMRC Income Tax (MTD)" row of
  `AVAILABILITY` in `scripts/build-mtd-calendar.mjs` names the account and the payment in its
  note, and `web/public/privacy.html` gains the account view and the payment journey record.
  Preconditions: HMRC's recognition and production credentials for the ITSA APIs, Self
  Assessment Accounts among them (IA7); each activity in a bundle sold on prod; the operator's
  approval, asked when the other preconditions hold (operator, 2026-11-22: not given ahead).
  **Owner**: Claude Code (build), Operator (approval). **Model**: Sonnet. **Size**: ~5 files.
- [ ] **UH2. Income Tax and diya-gl storage in Resident Pro.** `prod` on the `self-employed*` and
  `diya-gl-storage` activities. Preconditions: UH3; the operator's approval, asked when the other preconditions hold
  (operator, 2026-11-22: not given ahead). Resident Pro is already listed on prod.
  **Owner**: Claude Code (build), Operator (approval). **Model**: Sonnet.
  **Size**: ~3 files.
- [ ] **UH1. Practice.** Preconditions: HMRC production credentials for the Agent
  Authorisation API on Submit's production application; HMRC's approval of agent use; practice
  sold in a bundle on prod (Resident Tax Agent: `prod` in its `listedInEnvironments` and on the `practice` activity); the operator's approval, asked when the other preconditions hold (operator, 2026-11-22: not given ahead). **Owner**: Claude Code
  (build), Operator (approval). **Model**: Sonnet. **Size**: ~3 files.

### Dependency graph

```
HMRC's early-2027 update ──► IA5 ──► IA6 ──► IA7 ──► IA8 ──► IA10
                                               └──► IA9
IA7 ──► UH3 ──► UH2 ──► UH1
```

Backlog row 11 (ITSA phase 2 and the recognition application) closes with IA7.

## The Income Tax account view (Self Assessment Accounts API 4.0)

A customer under MTD Income Tax sees their HMRC account in Submit: the balance, what is due and
when, the charges by tax year, the payments and how HMRC allocated them, and the coding-out
amounts. A practice sees the same for a client it is the main agent for. From the account, the
customer pays through the ways-to-pay panel of `PLAN_VAT_PAYMENTS.md`, with `taxRegime`
`SelfAssessment`.

ISA1 to ISA5, ISA7 and OISA1 can start now; ISA6 follows PAY4. They build and prove on ci against
HMRC's sandbox, and the pages stay off prod until UH3 opens MTD Income Tax there.

### The facts the ISA rows rely on

- **The API.** Self Assessment Accounts (MTD) 4.0, beta, updated 2026-11-25:
  https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/self-assessment-accounts-api/4.0.
  The bundled OpenAPI file and an overview are in
  `../private.diyaccounting.co.uk/hmrc/developer/apis/self-assessment-accounts-api-4.0/`
  (`openapi.yaml`, `overview.md`).
- **Every call.** Base `HMRC_BASE_URI` or `HMRC_SANDBOX_BASE_URI` (picked by `getHmrcBaseUrl`,
  `app/services/hmrcApi.js` line 57), `Accept: application/vnd.hmrc.4.0+json` (a handler's
  `HMRC_API_VERSION = "4.0"`, passed to `buildHmrcHeaders`, line 255), the customer's HMRC token,
  and the fraud prevention headers (`buildFraudHeaders`), which the law requires for this API.
- **Scopes.** The reads need `read:self-assessment`. The `self-employed` activity already asks
  for it at HMRC sign-in (`web/public/submit.catalogue.toml` line 487), so no new scope is added.
- **The reads in scope.** All under `/accounts/self-assessment/{nino}`. The last column gives the
  sandbox `Gov-Test-Scenario` values ("default" is no header):

  | Read | Method and path | Sandbox scenarios |
  |---|---|---|
  | Balance and transactions | GET `/balance-and-transactions` | default, `NOT_FOUND` |
  | Payments and allocations | GET `/payments-and-allocations` | default, `NOT_FOUND` |
  | Charge history | GET `/charges/transactionId/{id}`, `/charges/chargeReference/{ref}` | default, `NOT_FOUND` |
  | Coding-out amounts | GET `/{taxYear}/collection/tax-code` | default with `source` latest, hmrcHeld or user; `NOT_FOUND` |
  | Coding-out status | GET `/{taxYear}/collection/tax-code/coding-out/status` | default, `BUSINESS_PARTNER_NOT_EXIST`, `ITSA_CONTRACT_OBJECT_NOT_EXIST` |
  | Penalties | GET `/penalties` | default, `NO_PENALTIES`, `LATE_SUBMISSION`, `LATE_PAYMENT`, and five more in `overview.md` |

  Balance and transactions takes `fromDate` and `toDate` (at most 732 days apart),
  `onlyOpenItems`, `docNumber`, `calculateAccruedInterest`, `customerPaymentInformation` and
  three more flags. Its `balanceDetails` gives `overdueAmount`, `payableAmount` with
  `payableDueDate`, `pendingChargeDueAmount` with `pendingChargeDueDate`, `totalBalance`,
  `amountCodedOut`, the credits (`availableCredit`, `allocatedCredit`, `unallocatedCredit`) and
  `firstPendingAmountRequested` (a refund the customer asked for). `documentDetails` lists each
  charge with its tax year, description, due date, original and outstanding amounts, interest and
  `isCodedOut`. Payments and allocations lists each payment with its `allocations` (charge
  reference, period, due date, amount, cleared amount).
- **The four coding-out writes** (create or amend, delete, opt out, opt in) are year-end actions
  of the final declaration journey. The account view reads only.
- **What HMRC's data covers.** Only the tax years since the customer joined MTD. Earlier years are
  in the customer's HMRC online services account, and the page says so (HMRC's readiness
  criterion "limitations explained").
- **Refunds.** A customer or agent claims a refund in HMRC online services ("Request a Self
  Assessment refund"). The page links there and shows `firstPendingAmountRequested`.
- **Agents.** A main agent can use every MTD Income Tax API. This API is not on the guide's list
  for supporting agents, so a supporting agent gets 403 `CLIENT_OR_AGENT_NOT_AUTHORISED` ("How to
  integrate", "Main and supporting agent access").
- **The UTR.** No response of this API carries the UTR. The Initiate payment API needs the
  10-digit UTR as `reference` for `SelfAssessment`
  (`../private.diyaccounting.co.uk/hmrc/developer/apis/initpay.yaml`), so the customer gives it.
- **The pattern to copy.** The ITSA read handlers are an ingest and worker pair with an async
  request table, as `app/functions/hmrc/hmrcItsaTaxLiabilityAdjustmentsGet.js` is (bundle check
  `enforceBundles`, fraud headers, `extractHmrcAccessTokenFromLambdaEvent`, `hmrcHttpGet`, the
  `hmrcAccount` header for the sandbox). The page model is `web/public/hmrc/vat/vatLiabilities.page.js`
  and `vatPayments.page.js` (the pending request through the HMRC sign-in, the `hmrcGrantId` in
  `sessionStorage` sent as `x-mcp-hmrc-grant`, the results tables), with the NINO carried by
  `window.CarriedIdentifiers` as `web/public/hmrc/itsa/obligations.page.js` does.
- **The stack.** `HmrcItsaStack` is at CloudFormation's 500-resource limit, and
  `HmrcItsaPropertyStack` holds the property Lambdas added after it. An async Lambda pair costs
  about nineteen resources, so the six reads (about 115 resources) go in a new stack,
  `HmrcItsaAccountsStack`. A new app stack is wired in the same files as `HmrcItsaPropertyStack`:
  `SubmitApplication.java`, `SubmitSharedNames.java`, `SelfDestructStack.java`,
  `.github/workflows/deploy-stacks.yml`, `.github/workflows/stack-drift.yml`,
  `scripts/delete-deployment-stacks.sh` and `app/unit-tests/scripts/deleteDeploymentStacks.test.js`.
  Each async request table is made in `DataStack.java` with its name in `DataNames.java`, as
  `hmrcItsaBsasForeignPropertyGetAsyncRequestsTableName` is (`DataStack.java` line 818).

### Production access for this API

- No Income Tax production access is held; CMQAA-531 has VAT only. This API therefore joins the
  2027-28 Income Tax application. It needs no separate request to SDST now: under the letter of
  30 September 2026, HMRC refuses a new 2026-27 request.
- The API is outside the minimum functionality standards. HMRC grants production access "to the
  requested APIs" after sandbox testing and the checklist. For an API outside the standards it
  tests only the endpoints for the data the software supports, and SDST is told which data items
  those are ("How to integrate", testing requirements).
- So the application changes in three places. IA6's step 1 adds "Self Assessment Accounts (MTD)
  4.0" to CMQAA-531 with the other Income Tax subscriptions. IA5's sandbox re-run includes the
  account suite (ISA7). IA8's checklist and IA6's email name the six reads and the data items the
  page shows (ISA8).
- The sandbox application (`uqMHA6RsDGGa7h8EG2VqfqAmv4tV`) must subscribe to the API before the
  sandbox proof. The API carries no restricted marking, so the Developer Hub subscription is
  self-service (OISA1).

### How the account view uses the ways-to-pay panel

`PLAN_VAT_PAYMENTS.md` builds the panel for VAT: PAY1 the Initiate payment client
(`app/services/hmrcPaymentClient.js`), PAY2 the routes and the journey store, PAY3 the widget
(`web/public/widgets/vat-ways-to-pay.js`) and the GOV.UK links (`web/public/lib/vat-payment-links.js`).
Its Follow-on section foresees the same panel for Income Tax with `taxRegime` `SelfAssessment` and
the UTR. ISA6 is that follow-on:

- The client and the widget take a regime. If PAY1 and PAY3 have landed with VAT built in, ISA6
  changes them to take `taxRegime` and `reference` and updates every caller in the same change.
  Built regime-neutral in PAY1 and PAY3, ISA6 adds only the Self Assessment parts.
- Self Assessment's parts: the reference is the UTR; the bank details and reference format come
  from GOV.UK's "Pay your Self Assessment tax bill" bank details page; the Direct Debit option
  links to HMRC's Self Assessment Direct Debit and budget payment plan pages; the help links are
  "Pay your Self Assessment tax bill" and "Through your tax code".
- On the account page the panel shows for the overdue amount and for the amount payable now,
  each with its due date. The status read-back shows on the account page after the return from
  HMRC's journey.
- The ownership check. PAY2 proves the customer's grant covers the VRN by a liabilities read.
  ISA6 proves the grant covers the NINO by a balance read with the customer's token. HMRC links
  no NINO to a UTR in any read Submit makes, so the panel shows the UTR the customer gave for
  them to confirm, and HMRC's journey shows it again.

### Tasks

| Id | Task | Who | Model | Size | Follows |
|---|---|---|---|---|---|
| ISA1 | The simulator routes for the account reads | Claude Code | Sonnet | ~4 files | none |
| ISA2 | The read handlers, routes and activity | Claude Code | Sonnet | ~22 files | ISA1 |
| ISA3 | The stack, the names and the async tables | Claude Code | Sonnet | ~14 files | ISA2 |
| ISA4 | The account page | Claude Code | Sonnet | ~7 files | ISA2 |
| ISA5 | The account page for a practice's client | Claude Code | Sonnet | ~4 files | ISA4 |
| ISA6 | The ways-to-pay panel for Self Assessment | Claude Code | Sonnet | ~12 files | ISA3, ISA4, PAY4 |
| ISA7 | The proofs on the simulator, the proxy and ci | Claude Code | Sonnet | ~4 files | ISA3, ISA4, OISA1 |
| ISA8 | The application evidence for the API | Claude Code | Haiku | 3 files (private) | ISA7 |
| OISA1 | The operator subscribes the sandbox application to the API | Operator | none | 0 files | none |

ISA1 to ISA4 share one batch: ISA2's handler names are the names ISA3 and ISA4 use.

- [ ] **ISA1. The simulator routes for the account reads.** A new route file
  `app/http-simulator/routes/itsa-accounts.js` and scenarios
  `app/http-simulator/scenarios/itsa-accounts.js`, registered with one import and one call in
  `app/http-simulator/server.js`, as `itsa-tax-liability-adjustments.js` is. The routes are the
  six reads of the table (and the older `GET /charges/{transactionId}`). Each answers with HMRC's
  own example from `openapi.yaml` and each listed `Gov-Test-Scenario`, with HMRC's error bodies:
  404 `NOT_FOUND`, 403 `CLIENT_OR_AGENT_NOT_AUTHORISED`, and 400 for a bad NINO, tax year, date
  or a range over 732 days. Penalties answer every scenario of the overview table. **Gates**:
  `npm run bundle` first in a worktree; `npx vitest run` on the simulator's tests; `npx eslint`
  and `npx prettier --check` on each changed file. **Owner**: Claude Code. **Model**: Sonnet.
  **Size**: ~4 files.
- [ ] **ISA2. The read handlers, routes and activity.** Six handlers in `app/functions/hmrc/`,
  each an ingest and worker pair copied from `hmrcItsaTaxLiabilityAdjustmentsGet.js` with
  `HMRC_API_VERSION = "4.0"`:

  | Handler | Submit route (GET) | HMRC read |
  |---|---|---|
  | `hmrcItsaAccountBalanceGet.js` | `/api/v1/hmrc/itsa/account/balance` | balance and transactions |
  | `hmrcItsaAccountPaymentsGet.js` | `/api/v1/hmrc/itsa/account/payments` | payments and allocations |
  | `hmrcItsaAccountChargeHistoryGet.js` | `/api/v1/hmrc/itsa/account/charge-history` | by `transactionId` or `chargeReference` |
  | `hmrcItsaCodingOutAmountsGet.js` | `/api/v1/hmrc/itsa/account/coding-out` | coding-out amounts, with `source` |
  | `hmrcItsaCodingOutStatusGet.js` | `/api/v1/hmrc/itsa/account/coding-out-status` | coding-out status |
  | `hmrcItsaPenaltiesGet.js` | `/api/v1/hmrc/itsa/account/penalties` | penalties |

  Each validates `nino` (`isValidNino`), `taxYear` where it applies (`isValidTaxYear`), the dates
  and the 732-day range, and passes HMRC's 403, 404 and 400 back through the `hmrcApi.js`
  responders. Express routes in `app/bin/server.js` (one import and one `apiEndpoint` call each).
  A new activity `self-employed-account` in `web/public/submit.catalogue.toml`: `bundles =
  ["resident-pro"]`, `tokenCost = 0`, `metered = true`, `paths = ["hmrc/itsa/account.html"]`,
  `hmrcScopesRequired = ["read:self-assessment"]`, `environments` without `prod`. The API calls
  are already gated by `self-employed`'s `^/api/v1/hmrc/itsa.*`. Unit tests per handler in
  `app/unit-tests/functions/`, as `hmrcItsaTaxLiabilityAdjustmentsGet.test.js` is. Update
  `app/unit-tests/services/productCatalog.test.js`, `app/unit-tests/services/prodSurface.test.js`,
  `web/unit-tests/catalogue-names.test.js`, `web/unit-tests/catalog-paths.test.js`, and the
  Welsh name in `i18n/cy.toml`. One `@capability` block covers the six handlers (the
  `capabilities` skill says how), and `npm run capabilities:generate` rebuilds
  `REPORT_CAPABILITIES.md`. **Gates**: `npm run bundle` first in a worktree;
  `npx vitest run` on the new tests; `npx eslint` and `npx prettier --check` on each changed
  file; `npm test` before the batch lands. **Owner**: Claude Code. **Model**: Sonnet. **Size**:
  ~22 files.
- [ ] **ISA3. The stack, the names and the async tables.** A new
  `infra/main/java/co/uk/diyaccounting/submit/stacks/HmrcItsaAccountsStack.java` with its names
  in `names/HmrcItsaAccountsNames.java`, copied from `HmrcItsaPropertyStack` and
  `HmrcItsaPropertyNames`: the six pairs, their queues, log groups, the fraud header check queue
  and the grouped health alarm. Wire it in the seven files the facts list. Six async request
  tables in `DataStack.java` and `DataNames.java`. The routes come from the stack's
  `lambdaFunctionProps`, as `HmrcItsaPropertyStack`'s do. Tests:
  `infra/test/java/co/uk/diyaccounting/submit/stacks/HmrcItsaAccountsStackTest.java` (new);
  `SubmitApplicationCdkResourceTest.java` gains the stack's `resourceCountIs("AWS::Lambda::Function",
  12)`, its alarm list and `assertApiRoute` for the six routes, and `apiStackTemplate` and
  `apiRoutesStackTemplate` stay under `assertResourceTotalUnder` 450;
  `HmrcEndpointSelectionCdkResourceTest.java` and `MetricFilterLogGroupCdkResourceTest.java` gain
  the stack; `SubmitEnvironmentCdkResourceTest.java`'s `Custom::AWS` 157 and `Custom::EnsurePitr`
  68 (lines 145 and 146) rise by what the six tables add. Name each new count in the report. The
  env deploy makes the tables before the app deploy reads them. **Gates**: `./mvnw clean verify`;
  `npx vitest run app/unit-tests/scripts/deleteDeploymentStacks.test.js`. **Owner**: Claude Code.
  **Model**: Sonnet. **Size**: ~14 files.
- [ ] **ISA4. The account page.** `web/public/hmrc/itsa/account.html` and `account.page.js`
  (new), on the model of `vatLiabilities.page.js`, linked from `web/public/hmrc/itsa/dashboard.html`
  as a "Your Income Tax account" step. It takes the NINO (carried) and a date range (default the
  current and last tax year), signs in to HMRC when no grant is held, and shows in this order:

  1. **Balance**: overdue, payable now with its due date, not yet due with its due date, the
     total, and the credit available. A refund asked for shows its amount, with a link to HMRC
     online services to claim one.
  2. **Charges by tax year**: each charge's description, due date, original and outstanding
     amounts, accruing interest, and "collected through your tax code" where `isCodedOut`. A
     charge opens its history (the charge-history route).
  3. **Payments and how HMRC allocated them**: each payment's date, amount and method, and under
     it each allocation's charge, period and amount.
  4. **Coding out**: `amountCodedOut`, and for a chosen previous tax year HMRC's and the
     customer's coding-out amounts and the opt-out status.
  5. **Penalties**: late submission and late payment penalties of the last 24 months.

  A line says the page covers only the years since the customer joined MTD, with a link to HMRC
  online services for earlier years. Every HMRC error shows its message in the page's error
  area; `NOT_FOUND` shows "HMRC holds no account data for this period". Welsh strings in
  `i18n/cy.toml`; `npm run build:welsh`. A browser test `web/browser-tests/itsaAccount.browser.test.js`
  with the routes stubbed: each section, each empty state, an HMRC 403, and the developer
  scenario picker sending `Gov-Test-Scenario`. This is a new page, so the visual definition of
  done in `CLAUDE.md` applies (the `visual-review` skill on the run's screenshots, the guide
  screenshots taken again). **Gates**: `npm run bundle` first in a worktree; `npx playwright
  test` on the new browser test; `npx eslint` and `npx prettier --check` on each changed file;
  `npm test` before the batch lands. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~7
  files.
- [ ] **ISA5. The account page for a practice's client.** On `web/public/practice.js`, a client
  whose `MTD-IT` authorisation is active gets a "View Income Tax account" link. The link opens
  `account.html` with the client's NINO and the practice's HMRC grant (`__hmrcGrantId`, sent as
  `x-mcp-hmrc-grant`). A 403 `CLIENT_OR_AGENT_NOT_AUTHORISED` shows "Only your client's main
  agent can see their HMRC account", because a supporting agent has no access to this API. A
  browser test for the link, a main agent's view and the supporting agent's 403. The link shows
  only where `practice` is listed, so prod gets it with UH1. **Gates**: as ISA4. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~4 files.
- [ ] **ISA6. The ways-to-pay panel for Self Assessment.** PAY1's client and PAY3's widget take
  `taxRegime` and `reference` (see "How the account view uses the ways-to-pay panel"). Two
  routes, `POST /api/v1/hmrc/itsa/payment` and `GET /api/v1/hmrc/itsa/payment/{clientJourneyId}`,
  in the stack ISA3 made, storing journeys in PAY2's journey table with the regime on each
  record. A new
  carried identifier `utr` (10 digits) in `web/public/lib/carried-identifiers.js`. A new activity
  `itsa-payment` (`metered = false`, `environments` without `prod`) whose Lambdas call
  `enforceBundles(event, { activityId: "itsa-payment" })`, with the four catalogue tests and the
  Welsh name. The panel shows on `account.html` for the overdue and the payable amounts. Browser
  tests for each payment state; the simulator's make-payment route (PAY1) answers
  `SelfAssessment`. **Gates**: as ISA2, and `./mvnw clean verify`. **Owner**: Claude Code.
  **Model**: Sonnet. **Size**: ~12 files.
- [ ] **ISA7. The proofs on the simulator, the proxy and ci.** A behaviour suite
  `behaviour-tests/itsaAccount.behaviour.test.js` with its Playwright project in
  `playwright.config.js` and the npm scripts `test:itsaAccountBehaviour` with `-simulator`,
  `-proxy`, `-ci` and `-prod` variants, as `getVatLiabilitiesBehaviour` has. It opens the
  account, reads each section and each sandbox scenario of the table, and pays from the account
  where ISA6 has landed. Run on the simulator (one suite at a time under `lockf -k
  /tmp/submit-simulator.lock`), then on the proxy against HMRC's sandbox (`scripts/proxy-secrets.sh`,
  or `.claude/skills/new-cloud-session/new-cloud-session.sh creds <codename>` on a cloud worker),
  then on ci. The suite joins the ITSA suites that IA5 runs. **Gates**: the behaviour suites
  named. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.
- [ ] **ISA8. The application evidence for the API.** In
  `../private.diyaccounting.co.uk/hmrc/itsa/`: `ITSA_PRODUCTION_APPROVALS_CHECKLIST.md` and
  `evidence/README.md` gain the API, its six reads, the data items the page shows and the ISA7
  run; `DRAFT_EMAIL_ITSA_RECOGNITION.md` lists the API among the requested ones and names the data
  items supported, as "How to integrate" asks for an API outside the standards. IA6 and IA8 send
  them. **Owner**: Claude Code. **Model**: Haiku. **Size**: 3 files (private).
- [ ] **OISA1. The operator subscribes the sandbox application to the API.** Steps 1 and 5 are
  Claude Code's; steps 2 to 4 are the operator's.

  1. Claude Code reads the Developer Hub's current page and button labels (Claude in Chrome, read
     only) and writes them into steps 3 and 4 before the operator is asked.
  2. Sign in at https://developer.service.hmrc.gov.uk/developer/applications.
  3. Open the sandbox application whose id is `uqMHA6RsDGGa7h8EG2VqfqAmv4tV`.
  4. Subscribe it to "Self Assessment Accounts (MTD)" version 4.0.
  5. Claude Code reads the subscription from the application's API list and records the date
     here.

### Dependency graph

```
ISA1 ──► ISA2 ──► ISA3 ──► ISA7 ──► ISA8 ──► IA6, IA8   (the application names the API)
           └────► ISA4 ──► ISA7
OISA1 ───────────────────► ISA7
ISA4 ──► ISA5                                            (on prod with UH1)
ISA3, ISA4, PLAN_VAT_PAYMENTS.md PAY4 ──► ISA6           (on prod with UH3)
ISA4                                                     (on prod with UH3)
```

## The application, as the phase-2 plan designed it

From `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_ITSA_PHASE_2.md`. The
2027-28 process may change the steps, and IA6's rewrite checks each against HMRC's update.

HMRC recognises three product shapes. Ours is a **full end-to-end product**, built in two
stages. The guide allows the stages to be approved one at a time, and we apply for both at once
(phase-2 decision D3), as one submission covering the whole journey from a quarterly update to a
filed return:

| Stage                       | APIs HMRC requires                                                                                                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-year (quarterly updates) | Business Details, Obligations, Self-Employment Business, Property Business, Individual Calculations                                                                                                            |
| End-of-year                 | Business Details, Self-Employment Business, Property Business, Business Source Adjustable Summary, Individual Losses, Individuals Tax Liability Adjustments, Obligations, Individual Calculations, Self Assessment Individual Details |

All nine have a build behind them (phase-2 decision D9), so the checklist answers each with a
working endpoint and a customer journey.

The steps, in order:

1. Register a production application on the Developer Hub, or add the ITSA API subscriptions to
   the existing one. Accept the terms of use.
2. Test every endpoint of every API in the minimum functionality standards, in the sandbox, with
   fraud prevention headers on every call. HMRC's specialist team reads the logs, so the testing
   has to be real traffic from the deployed application, not a local harness.
3. Send the sandbox application id used for testing to SDST, as soon as testing finishes, so
   they can find the calls in their logs.
4. Ask SDST for the Production Approvals Checklist, complete it, return it.
5. HMRC reviews the testing, the fraud header accuracy and the checklist, then grants production
   access or says what to fix.
6. Ask about the software finder listing at the same time. The gov.uk page that lists compatible
   software is HMRC's, and vendors get on it through the software vendor team, who want the
   product name, what it supports, its pricing and its accessibility position.

The evidence HMRC asks for, and where it exists:

| Evidence                          | Where                                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fraud prevention headers, validated | `_developers/hmrc/ITSA_SPIKE.md` records a clean validator run; the 2026-09-25 sandbox year ran with a real `Gov-Client-Multi-Factor` header (`VALID_HEADERS`, no warnings)                      |
| A completed developer checklist   | `../private.diyaccounting.co.uk/hmrc/questionnaires/hmrc_questionnaire_1_software_developer_checklist_diy_accounting_limited_v2.md`, from the VAT approval, with the ITSA pass in `../private.diyaccounting.co.uk/hmrc/itsa/hmrc_questionnaire_itsa_pass_diy_accounting_limited_v1.md` |
| WCAG 2.1 AA evidence              | `../private.diyaccounting.co.uk/hmrc/questionnaires/hmrc_questionnaire_2_WCAG_2.1_AA_diy_accounting_limited_v2.md` and `../private.diyaccounting.co.uk/hmrc/itsa/WCAG_2.2_AA_EVIDENCE.md`          |
| Endpoint test logs                | The behaviour suites, run against the ci deployment with the sandbox test user; the three sandbox years under `../private.diyaccounting.co.uk/hmrc/itsa/sandbox-runs/`                            |
| Every claim, with its check       | `../private.diyaccounting.co.uk/hmrc/itsa/evidence/README.md`                                                                                                                                      |

What a workflow can do: assemble the checklist answers from the repository, run the sandbox
endpoint sweep and produce the log, refresh the WCAG evidence, and draft both emails. What only
the operator can do: hold the Developer Hub account, accept the terms of use, press send on the
emails to SDST and to the software vendor team, and answer HMRC when they reply.

The two emails go out together, per the parked decision: the recognition application, and the
question about the production window for the tax year applied for. Addresses are
`SDSTeam@hmrc.gov.uk` and `makingtaxdigital-softwarevendors@hmrc.gov.uk`.

### The recognition pack (phase-2 track T10)

Owns `../private.diyaccounting.co.uk/hmrc/itsa/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md`, an ITSA
pass over the two questionnaires, and the two draft emails. One application covers both approval
stages, so the checklist answers for every API in both rows of the stage table in one pass.
Nothing in the checklist rests on a reviewer agreeing that a function is optional.

The two draft emails carry the same scope. The SDST email asks for approval of the whole
end-to-end journey rather than the in-year stage alone, names the sandbox application id, and
lists both income types the journey covers. The software vendor team email describes the product
as filing quarterly updates, loss claims and a final declaration for self-employment and UK
property income.

The pack is assembled (BSAS and UK property annual evidenced on all three sandbox years). IA6
is the edit it still takes.

## Backlog row this plan carries

### 11. ITSA phase 2 and the recognition application

ITSA build, phase 2: annual summaries, final declaration, then the ITSA recognition application
and finder listing. The build and the recognition pack are done; evidence for each claim is in
`../private.diyaccounting.co.uk/hmrc/itsa/evidence/README.md`. Remaining: IA5 to IA10 above. One
application covers recognition and production credentials. Closes with IA7.

**Source**: `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_ITSA_PHASE_2.md` T10. **Effort**: L. **Value**: Revenue. The recognition lead
time is HMRC's; being ready when the 2027-28 window opens is the only control we have over April
2027.

## Sources

- HMRC, "MTD ITSA APIs – Update on Production Access Arrangements", 2026-09-30, quoted above
  (`mail/antony@diyaccounting.co.uk/2026/9/30/1a0f2f5040783ccd.eml`); our reply of 2026-10-03
  (`…/2026/10/3/1a1017745227e438.eml`) and SDST's of 2026-10-05 (`…/2026/10/5/1a10c449f358f10e.eml`).
- Making Tax Digital for Income Tax end-to-end service guide, "How to integrate with HMRC APIs":
  <https://developer.service.hmrc.gov.uk/guides/income-tax-mtd-end-to-end-service-guide/documentation/how-to-integrate.html>
- `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_ITSA_PHASE_2.md` (the build, its decisions D3 and D9, and its verification list).
- `../private.diyaccounting.co.uk/hmrc/itsa/` (the checklist, the questionnaires, the drafts, the
  evidence pack and the sandbox runs).
- Self Assessment Accounts (MTD) 4.0, read 2026-11-26:
  <https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/self-assessment-accounts-api/4.0>;
  the copy in `../private.diyaccounting.co.uk/hmrc/developer/apis/self-assessment-accounts-api-4.0/`.
- The end-to-end service guide's pages "View customer Self Assessment account information" and
  "Make updates at the end of the tax year" (using tax codes to collect tax due), and "How to
  integrate" (testing requirements; main and supporting agent access), read 2026-11-26.
