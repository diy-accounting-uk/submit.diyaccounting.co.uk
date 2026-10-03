<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: ITSA production approval and the software finder listing

The build is done and proven in the sandbox (`PLAN_ITSA_PHASE_2.md`). This plan carries what
stands between that build and real customers: HMRC's production access for Income Tax (MTD), the
software finder listing, and the three things that follow the approval. It took these items from
`PLAN_ITSA_PHASE_2.md` (the recognition track and T10), `NEXT.md` (O11, B10) and `BACKLOG.md`
(rows 10 and 11) on 2026-10-03.

## Operator assertions (verbatim)

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

Earlier assertions this plan inherits from `PLAN_ITSA_PHASE_2.md`:

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
  the record HMRC reads in 2027. The 2026-10-09 date that drove O11 (the sandbox log window) no
  longer drives anything.

**What the letter opens.**

- The 2027-28 round. HMRC names "existing software developers" as a group it will brief by early
  2027 on timing, criteria and process. We are one through the VAT credentials.
- HMRC now states the sandbox log retention as 30 days (our evidence pack said 14). The eight
  ITSA suites run against ci on demand, so the recency requirement is met by one dispatch in the
  week the application goes.
- Readiness, line by line against the letter: end-to-end journey (quarterly update to final
  declaration, both income types), minimum functional standards (all nine APIs, D9), digital
  records (the DIYA-GL import is the source, no manual entry path), terms of use, tested
  journeys with error handling (the eight suites and the three sandbox years of 2026-09-25),
  export (the receipts and the book download), fraud prevention headers (validator clean on the
  ci deployment), customer experience (disclaimers and limits on the calculation and declaration
  pages). The AI-assurance line is new: the application must say how AI-assisted output was
  reviewed and tested. This repository's record answers it (every change behind a PR with CI
  gates, the sandbox transcripts, the evidence pack with a check per claim), and the checklist
  gains a row for it.

**What is worth doing now, before HMRC's 2027 update.**

1. A one-paragraph note to SDST, in place of the application (sent 2026-10-03): the product is built and
   sandbox-tested end to end for self-employment and UK property, include
   antony@diyaccounting.co.uk in the 2027-28 notifications, and is a readiness review accepted in
   advance. No attachments.
2. Subscribe to the ITSA notices in the Developer Hub's email preferences, so the next
   announcement arrives.
3. Correct the 14-day figure to 30 days in the evidence pack and the two drafts, and add the AI
   assurance row to the checklist.
4. Decide whether the spreadsheets site points sole traders at a recognised bridging product for
   2026-27. VitalTax wrote on 2022-07-12 that they saw interest in integrating DIY Accounting with
   VitalTax for MTD Income Tax, and announced MTD for Income Tax in their product on 2025-11-18
   (both in the mail mirror). A commercial decision, the operator's.

**Sent 2026-10-03.** The note to SDST went from antony@diyaccounting.co.uk (text as sent in `../private.diyaccounting.co.uk/hmrc/itsa/DRAFT_EMAIL_ITSA_2027_NOTE.md`); it also points HMRC at the published ITSA sandbox recordings as evidence of the working product. SDST's reply, if any, rewrites the blocked rows below.

**What waits.** The recognition application, the production-credentials email, the checklist,
the finder listing and the Income Tax ad group all wait on HMRC's early-2027 update. The ad group
must not run before recognition, because the product could not deliver what it advertised.

## Board

The rows below are this plan's open work, in board order. `NEXT.md` carries none of them; this
section is their board.

### Ready

- [ ] **IA2. Developer Hub email preferences.** The operator signs in to the Developer Hub and
  turns on the Income Tax (MTD) notices under Email preferences, so the 2027 update arrives.
  **Owner**: Operator. **Model**: none. **Size**: 0 files.
- [ ] **IA3. The evidence pack's figures.** 14 days becomes 30 days in
  `../private.diyaccounting.co.uk/hmrc/itsa/evidence/README.md` ("Before sending") and in the
  "Before sending" line of both drafts; `ITSA_PRODUCTION_APPROVALS_CHECKLIST.md` gains an "AI
  assurance" row answered from this repository's record (PR gates, sandbox transcripts, the
  evidence pack's check per claim). **Owner**: Claude Code. **Model**: Haiku. **Size**: 4 files
  (private).
- [ ] **IA4. The 2026-27 bridge.** A decision between named alternatives: (a) a note on the
  spreadsheets site pointing sole traders at a recognised bridging product for 2026-27, VitalTax
  the candidate from the 2022 thread; (b) no note, Submit's Income Tax pages stay sandbox-only
  until 2027-28. Write the answer here; (a) becomes a spreadsheets row. **Owner**: Operator.
  **Model**: none. **Size**: 0 files.

### Blocked on HMRC's early-2027 update

Each waits on HMRC publishing the 2027-28 timing, criteria and process. When that arrives, a
session re-reads the criteria against the Appraisal and rewrites these rows before the first
send.

- [ ] **IA5. The sandbox re-run.** Within 30 days before the application: dispatch the eight
  ITSA behaviour suites against ci and `scripts/itsa-sandbox-year.js` for 2023-24, 2025-26 and
  2026-27 (`_developers/hmrc/ITSA_PHASE_2_SANDBOX.md`, "The command"); record the run ids and the
  sandbox application id in the evidence README. **Owner**: Claude Code. **Model**: Haiku.
  **Size**: 1 file (private).
- [ ] **IA6. The recognition application.** The operator sends
  `../private.diyaccounting.co.uk/hmrc/itsa/DRAFT_EMAIL_ITSA_RECOGNITION.md` to
  `SDSTeam@hmrc.gov.uk` from antony@diyaccounting.co.uk, rewritten first for the 2027-28 process,
  with the evidence README's check per claim. **Owner**: Operator (send), Claude Code (the
  rewrite). **Model**: Sonnet. **Size**: 1 file (private).
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
  8816f93c, PR #414) and applies with `npm run ads:sync -- --apply` on the operator's yes.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: 1 file.

### Dependency graph

```
IA2 ──► HMRC's early-2027 update ──► IA5 ──► IA6 ──► IA7 ──► IA8 ──► IA10
                                               └──► IA9
IA3 ──► IA6
IA4 (independent; (a) opens a spreadsheets row)
```

Backlog row 10 (ITSA phase 1) is closed: its build is on main and proven, and the send it
waited on is IA6. Backlog row 11 (ITSA phase 2 and the recognition application) closes with IA7.

## The application, as the phase-2 plan designed it

Moved from `PLAN_ITSA_PHASE_2.md` on 2026-10-03; the 2027-28 process may change the steps, and
IA6's rewrite checks each against HMRC's update.

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

The pack is assembled and on main (BSAS and UK property annual evidenced on all three sandbox
years, 328b44d3a). IA3 and IA6 are the edits it still takes.

## Backlog rows this plan carries

Moved from `BACKLOG.md` Tier 2 on 2026-10-03; their tier and value stay as written here.

### 10. ITSA phase 1 sandbox integration

ITSA build, phase 1: sandbox integration with the self-employment quarterly update APIs. On main
and proven: the sandbox year ran clean on 2023-24, 2025-26 and 2026-27 on 2026-09-25 with a valid
`Gov-Client-Multi-Factor` header, and the eight ITSA suites run in CI. The hand-rolled
`hmrcApi.js` client stays, and a quarterly update costs one token like a VAT return; the mandate
dates and thresholds are in `_developers/hmrc/ITSA_SPIKE.md`. Closed: nothing is left to build;
the send it waited on is IA6.

**Source**: Issues #16, #20; `../private.diyaccounting.co.uk/strategy/STRATEGY.md`;
`PLAN_ITSA_PHASE_2.md`. **Effort**: L. **Value**: Revenue. The strategic bet. Voluntary sign-up is
open now and HMRC auto-enrolment starts September 2026.

### 11. ITSA phase 2 and the recognition application

ITSA build, phase 2: annual summaries, final declaration, then the ITSA recognition application
and finder listing. The build and the recognition pack are on main; evidence for each claim is in
`../private.diyaccounting.co.uk/hmrc/itsa/evidence/README.md`. Remaining: IA1 to IA10 above. One
application covers recognition and production credentials. Closes with IA7.

**Source**: `PLAN_ITSA_PHASE_2.md` T10. **Effort**: L. **Value**: Revenue. The recognition lead
time is HMRC's; being ready when the 2027-28 window opens is the only control we have over April
2027.

## Sources

- HMRC, "MTD ITSA APIs – Update on Production Access Arrangements", 2026-09-30, quoted above.
- Making Tax Digital for Income Tax end-to-end service guide, "How to integrate with HMRC APIs":
  <https://developer.service.hmrc.gov.uk/guides/income-tax-mtd-end-to-end-service-guide/documentation/how-to-integrate.html>
- `PLAN_ITSA_PHASE_2.md` (the build, its decisions D3 and D9, and its verification list).
- `../private.diyaccounting.co.uk/hmrc/itsa/` (the checklist, the questionnaires, the drafts, the
  evidence pack and the sandbox runs).
- Mail mirror: VitalTax, 2022-07-12 (`mail/antony@diyaccounting.co.uk/2022/7/12/181f1ff873a650bf.eml`)
  and 2025-11-18 (`mail/antony@diyaccounting.co.uk/2025/11/18/19a9721cb06eacce.eml`).
