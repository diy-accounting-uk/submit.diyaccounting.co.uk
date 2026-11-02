<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: Companies House filing, approval and prod launch

The open work to launch Companies House filing on prod: the approval steps with Companies House and the launches that follow.
The dependency graph below shows the chain. `NEXT.md` carries each open row.

## User assertions

> Please pull these tasks out of the board (if present) and out of PLAN_COMPANIES_HOUSE.md and into a new PLAN_COMPANIES_HOUSE_APPROVAL.md: B34c (Accounts on prod: stack values, own filing, catalogue), CS-11b (Confirmation statement customer launch on prod) ... O34c, CS-A4, OCH1 ... O34g (operator, 2026-10-04)


> Create a PLAN_\*.md doc for this [filing a confirmation statement by API] ... have a Fable 5.1
> sub-agent design it to fit in with our existing offerings and split into tasks

> create a separate PLAN_\*.md with a list of all the companies house APIs and or XML gateways that
> we could reasonably cover (no tasks on the board for that one, it's an interesting one stop shop
> opening up scheduled filings)

> instead of asking [the XML team how many tests authorisation needs], define our own assumed
> Companies House test criteria, build to them, exercise them continuously, and submit the
> evidence (operator, 2026-09-26)

> Customers file now, under our presenter; ACSP registration itself waits (no sooner than
> November 2027, at least six months' notice) (operator, 2026-09-26)

## XML team verdict on the software testing (their email of 2026-10-23 10:15 UTC)

| Form | Verdict |
|---|---|
| Confirmation statement | Approved |
| PSC verification statement (VS01) | Approved |
| Micro-entity accounts | Failed: "missing significant data", and information in the header and footer that should not appear |

They review the accounts again after 4 new accounts test submissions, given with their submission numbers. Go-live asks (the live package references, the presenter's live clearance) wait until every test passes (operator, 2026-10-24).

## The live package (XML team, 2026-11-02 15:25)

After the 00005L, M, P and Q accounts retest (2026-10-28), the XML team offered a live package for every document type developed to date (2026-10-29), and the operator sent the six presenter details the same day. On 2026-11-02 they issued it (`../private.diyaccounting.co.uk/companies-house/correspondence/EMAIL_XMLGW_LIVE_PACKAGE_ISSUED.md`):

- The live package reference is 4326. It replaces 0012 in live submissions.
- `GatewayTest` is 0 in live.
- It covers the form types tested to date: micro-entity accounts, the confirmation statement and the PSC verification statement. A new form type is tested with the XML team first.
- No testing in the live service; the test account stays open.
- Test credentials do not work on the live service. Submit's live credentials are the credit-account presenter.
- First live filings often meet rejections the test service does not raise, because the live service runs more validation and business rules.

## Board

| Id | What | Files | Model | Blocked by |
|---|---|---|---|---|
| B34c | `CompaniesHouseStack.java` sets the prod gateway values (`GatewayTest` 0, package reference 4326); `prod` added to the activity's `environments` and `resident`'s listing | ~5 | Sonnet | — |
| CS-11b | Customer prod launch of the confirmation statement | ~7 | Sonnet | — |
| CS-P1 | Filing under a customer's own presenter | ~5 | Sonnet | CS-11b |
| DF2b | The joint accounts and CT600 filing on prod | ~2 | Sonnet | B34c, B34g |
| UH4 | Unhide the Companies House filing forms on prod | ~3 | Sonnet | B34c, CS-11b, each activity in a bundle sold on prod, the operator's approval |

### Open rows

- [ ] **B34c. Companies House accounts filing launched on prod.** `CompaniesHouseStack.java` sets the prod values (`COMPANIES_HOUSE_GATEWAY_TEST=false`, the live package reference) instead of leaving them unset; `prod` added to `file-micro-entity-accounts`' and `file-small-company-accounts`' `environments` and `resident`'s listing in `web/public/submit.catalogue.toml` (package 4326 covers both; operator, 2026-11-02), with the two activity pages and the accounts video no longer calling them a sandbox preview. The live reference 4326 is a constant beside the test one, and the live presenter secrets are on `prod` (2026-11-02). **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~5 files.

- [ ] **CS-11b. Confirmation statement's customer prod launch.** Submit's confirmation statement runs on the test service only; DIY Accounting Limited's 2026 statement (made up to 21 September, accepted 24 September) went through Companies House WebFiling. CS-11b takes the activity to prod. `file-confirmation-statement` already lists `bundles = ["resident", "resident-pro"]`, so no operator-only gate is needed — add `prod` to its `environments` (`web/public/submit.catalogue.toml` lines 449 to 457, `environments` at 457), and a live Stripe price alongside the existing one for the £61.35 fee. It runs on the prod gateway values (B34c) and the presenter secrets on `prod` (set 2026-11-02). Every statement sends the full shareholder list (operator, 2026-11-02): `fileConfirmationStatement.page.js` (line 540) sends `shareholdings` today only when they differ from the register, so a no-change statement leaves `Shareholdings` out; CS-11b sends them on every statement, with a unit case for a no-change statement. Then `compliance.toml` rows for the credit account and the authorisation. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~7 files.

- [ ] **UH4. Unhide the Companies House filing forms on prod.** HIDE1 hid them with an environment rule (the catalogue's `environments` and the page guard in `web/public/widgets/entitlement-status.js`); unhiding is that rule with `prod` added, and the availability table and dates on `web/public/mtd-calendar.html` in the same change. Preconditions: the prod gateway values (B34c) for confirmation statements, PSC verification statements and accounts; each activity in a bundle sold on prod; the operator's approval to enable it for live users. The CT600 form's unhide is `PLAN_HMRC_CT_APPROVAL.md` UH7. Unblocks ITSA_APPROVAL UH2.

- [ ] **CS-P1. Filing under a customer's own presenter.** A customer gives their own Companies House presenter id and authentication code instead of Submit's. Submit presents under their presenter, Companies House charges the £50 confirmation statement fee to the customer's own credit account, and Submit skips its £61.35 fee. This is outside ACSP (`../private.diyaccounting.co.uk/engineering/submit/backlog/PLAN_COMPANIES_HOUSE_ACSP.md`), because Submit neither pays nor engages Companies House. Build: the page option on `web/public/companies-house/fileConfirmationStatement.html` (credentials entered per filing, never stored, with the credit-account requirement explained); `PaymentPeriodsRequest` still decides whether a fee is due; the Stripe checkout skipped at the fee gate that CS-11a's company list skips (`feeWaivedCompanyNumbers` in `app/functions/companies-house/companiesHouseConfirmationStatementPost.js`); the simulator route and its tests. Micro-entity accounts carry no fee, so there the option changes only whose presenter shows on the filing. Blocked on CS-11b. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~5 files.

- [ ] **DF2b. The joint accounts and CT600 filing on prod.** `prod` on the joint filing's activity, both receipts under one entry. Blocked on B34c and `PLAN_HMRC_CT_APPROVAL.md` B34g. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files.

## Scope

DIY Accounting Limited files its own confirmation statement, PSC verification statements and
micro-entity accounts through Submit, under its own credit-account presenter. Customers get the
same filings on prod as soon as each is ready, under the same presenter. This is lawful until
Companies House requires ACSP registration for filing on behalf of others (no sooner than November
2027, at least six months' notice; `../private.diyaccounting.co.uk/engineering/submit/backlog/PLAN_COMPANIES_HOUSE_ACSP.md` covers that registration and the

## Where each filing stands

| Filing | API and credentials | Sandbox (test service) | Live (prod) | Finance |
|---|---|---|---|---|
| Company lookup | REST API key, no presenter | n/a | live | free |
| Registered office change | REST, OAuth as the company's user, no presenter | proven | live, proven on DIY Accounting Limited | free |
| Registered email change | REST, OAuth as the company's user, no presenter | proven | live, proven on DIY Accounting Limited | free |
| Micro-entity accounts | XML Gateway, presenter id + code, package reference | the first test presenter: 000004 acknowledged 2026-09-13, never polled to a terminal state; the replacement presenter (2026-10-10) proves it afresh | the credit-account presenter: authenticates on the live gateway since 2026-09-26; live package 4326 issued 2026-11-02; its secrets on `prod` since 2026-11-02; then B34c | no Companies House fee; customer pays `resident-ltd` 99p a month (listed on ci only) |
| Confirmation statement | XML Gateway, as above | the first test presenter: harness run 36295600451: every case passes the gateway at submit, every status poll answers 9999; the replacement presenter (2026-10-10): every case settles on its first poll, pinned | the credit-account presenter: live package 4326 issued 2026-11-02; its secrets on `prod` since 2026-11-02; then CS-11b | our presenter: customer pays £61.35 by Stripe, Companies House charges the £50 fee to the credit account behind the presenter; the operator's own filings skip the Stripe charge (the fee waiver for listed company numbers, CS-11a); own presenter (CS-P1): Companies House charges £50 to the customer's own credit account, no Submit fee |
| PSC verification statement (VS01) | XML Gateway, as above | the replacement test presenter: the VS01 cases in the harness | the credit-account presenter: after the VS01 sandbox proof | Companies House fee to check |

**Presenters**

| Presenter | Environment | Issued | Status |
|---|---|---|---|
| The first test presenter | Test service | 2026-09-11 | Withdrawn: its account "was not set up successfully" (XML team, 2026-09-25) |
| The replacement test presenter | Test service | 2026-10-10 | Issued by the XML team on the 000004 thread; id and code in `../private.diyaccounting.co.uk/companies-house/correspondence/EMAIL_XMLGW_REPLACEMENT_TEST_PRESENTER.md` |
| E0000000000 | Live | 2026-09-05 | Not used for filing; holds no credit account |
| The credit-account presenter | Live | 2026-09-25, with the credit account, £500 limit | Authenticates on the live gateway since 2026-09-26. Its id, code and the account number are in `../private.diyaccounting.co.uk/operator/NEXT_OPERATOR_RUNBOOK.md` task A, which this repository does not carry — never write the presenter id, the account number or any code into this file |

Test package reference: 0012. Live package reference: 4326 (issued 2026-11-02), covering accounts, the confirmation statement and the PSC verification statement.

## Dependency graph

```mermaid
flowchart LR
    B34c
    CS11b[CS-11b]
    CS11b --> CSP1[CS-P1]
    B34c --> DF2b
    B34g["PLAN_HMRC_CT_APPROVAL.md B34g"] --> DF2b
    B34c --> UH4
    CS11b --> UH4
    UH4 --> UH2["PLAN_ITSA_APPROVAL.md UH2"]
```

- B34c: ready; the live package reference (4326) and the live presenter secrets on `prod` (set 2026-11-02) are in place
- CS-11b: ready, on the same values
- CS-P1: blocked by CS-11b (it adds a second payment path to the journey CS-11b launches)
- DF2b: blocked by B34c and `PLAN_HMRC_CT_APPROVAL.md` B34g
- UH4: blocked by B34c, CS-11b and the operator's approval


## Open questions

| Id | Question | Owner |
|---|---|---|
| Q4 | Software authorisation for the form: Companies House publishes no test count or checklist. We built to assumed criteria and sent the evidence (the XML team approved the confirmation statement and the PSC verification statement on 2026-10-23); the XML team's live package of 2026-11-02 covers the confirmation statement, the PSC verification statement and the micro-entity accounts | CS-A4 |

## Horizons

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
