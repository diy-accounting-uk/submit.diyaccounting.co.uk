<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: HMRC Assist

HMRC Assist returns up to five feedback messages on a draft return before it is filed. It is live for Income Tax (the Self Assessment Assist (MTD) API, sandbox and production) and arrives for VAT in April 2027 (the VAT Assist (MTD) API, listed on the Developer Hub without documentation on 2026-10-03, early adopters in production from January 2027). This plan takes HMRC Assist over from `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_ENGAGEMENT.md` item 24 and designs the integration from what HMRC has published: the Income Tax API's specification, the VAT service guide's rules, the June 2026 slides and the three emails.

Status: HA1, HA2, HA3, HA3a and HA6's privacy notice are on main (PR #469, prod-2304157). Open: HA4's sandbox run, HA5, HA6's receipts page, HA7, HA8.

## Operator assertions (verbatim)

> Create the reply email for me

> the deck links to the Developer Hub APIs, crawl them and find the APIs and feed all this in to a new PLAN_HMRC_ASSIST.md which takes over those elements from PLAN_ENGAGEMENT.md. Design as much as we can from what you have in the APIs, emails, and web searches for developer experiences and feed this into PLAN_HMRC_ASSIST.md then update the email we'll send to HMRC. Then pull all of PLAN_HMRC_ASSIST.md onto the board in NEXT.md

## What HMRC has published

### The emails

| Date | From | What it said |
| --- | --- | --- |
| 2026-01-08 | Software Developer Support Team | Announcement: HMRC Assist, live in the Income Tax beta, is being extended to VAT for April 2027; a survey open until 20 January 2026 (not answered) |
| 2026-05-07 | Software Developer Support Team | Overview sessions on 22 and 28 May 2026; early testing and continued engagement through `hmrcassist@hmrc.gov.uk` |
| 2026-06-30 | SDSTeam@hmrc.gov.uk | The session slides (kept at `../private.diyaccounting.co.uk/hmrc/vat/hmrc-assist/`, not for publication); further consultation and early testing through `hmrcassist@hmrc.gov.uk` |

### The slides (Overview v2.0, June 2026)

- Rules-based, using HMRC's data; no AI and no human review of drafts. Two JSON endpoints, a feedback request and a feedback presented receipt; the API is optional, free, and both endpoints are required once integrated. The same OAuth scope as the VAT (MTD) suite. Fraud prevention headers on the feedback request.
- Called after the open obligation is retrieved and before the return is submitted; repeatable within a period.
- A message carries a heading (HMRC Feedback), a title (the action), a body, a GOV.UK URL and a path to the return field for the software's use; at most five per request, in a pre-set order.
- The three illustrative messages: box 4 high against box 7 ("Review the VAT on purchases (input tax)"), box 1 low against box 6 for the sector ("Review the VAT on sales (output tax)"), box 6 lower than expected with online platform sales ("Review the online sales (outputs)"); each ends "If the figures are correct, you do not need to change anything." and links to GOV.UK.
- Milestones: sandbox with simulated scenarios and Developer Hub content testing July 2026; early adopters' development window and a product implementation guide August to December; API deployment ready and the software choices page updated December; live testing, GOV.UK and YouTube explainers and developer sessions January to March 2027; go-live April 2027. Production for early adopters from January 2027.
- 79 end users and 22 software providers took part in design; all research participants saw value.

### The VAT (MTD) end-to-end service guide, "HMRC Assist for VAT"

<https://developer.service.hmrc.gov.uk/guides/vat-mtd-end-to-end-service-guide/documentation/hmrc-assist-for-vat.html>, read 2026-10-03. The rules the build follows, in the guide's words:

- Availability: "for the current period, which has an open return obligation", "when all the data that is required for the VAT return has been entered", "before the VAT return is submitted".
- "The software must then send through a confirmation once the messages have been displayed to the end user." Both endpoints, "Request HMRC Assist feedback for VAT" and "Acknowledge HMRC Assist feedback for VAT", must be used.
- "allow customers to submit their VAT return, irrespective of any HMRC Assist submission feedback"; "if HMRC Assist is in use, enforce a temporary pause after requesting HMRC Assist feedback until the feedback is returned, before it allows the customer to submit their return".
- Recommended: messaging during the pause; send the presentation receipt automatically once all feedback is displayed; "do not link HMRC Assist to the button that submits VAT returns"; disable it for any period with a filed return, using the obligations endpoint; privacy notices cover the pre-submission draft data.
- Messages "must not be modified by your software and must be displayed verbatim"; priority order preserved, "the initial message (item 1) must be displayed first because it specifies that the messages originate from HMRC"; at most five; no limit on requests before submission; re-request automatically when the draft changes; the same message is re-issued while it applies; English and Welsh versions, either may be shown.
- "HMRC Assist does not guarantee that a customer's VAT return is accurate, even if they do not receive any feedback messages."

### The Self Assessment Assist (MTD) API, version 1.0 (beta), the only Assist specification published

<https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/self-assessment-assist/1.0>; OpenAPI at <https://github.com/hmrc/self-assessment-assist> under `resources/public/api/conf/1.0/`; last updated 2026-08-11. Sandbox `https://test-api.service.hmrc.gov.uk`, production `https://api.service.hmrc.gov.uk`.

| Endpoint | Scope | Responses |
| --- | --- | --- |
| `POST /individuals/self-assessment/assist/reports/{nino}/{taxYear}/{calculationId}` "Produce a HMRC Self Assessment Assist Report" | `read:self-assessment-assist` | 200 report; 204 no messages; 400 `FORMAT_NINO`, `FORMAT_CALC_ID`, `FORMAT_TAX_YEAR`, `RULE_TAX_YEAR_RANGE_INVALID`; 401 `INVALID_CREDENTIALS`; 403 `CLIENT_OR_AGENT_NOT_AUTHORISED`; 404 `MATCHING_CALCULATION_ID_NOT_FOUND`, `MATCHING_RESOURCE_NOT_FOUND` |
| `POST /individuals/self-assessment/assist/reports/acknowledge/{nino}/{reportId}/{correlationId}` "Acknowledge a HMRC Self Assessment Assist Report" | `write:self-assessment-assist` | 204; 400 `FORMAT_NINO`, `FORMAT_REPORT_ID`; 401; 403 `CLIENT_OR_AGENT_NOT_AUTHORISED`, `CORRELATION_ID_NOT_AUTHORISED`; 404 `MATCHING_RESOURCE_NOT_FOUND` |

Headers: `Accept: application/vnd.hmrc.1.0+json`, `Authorization: Bearer` (user-restricted, authorization code flow), the fraud prevention headers ("You are required by law to submit header data for this API"), `X-CorrelationId` returned on every response.

The 200 body: `reportId` (UUID), `messages[]` each with `title`, `body`, `action`, `links[]` of `{title, url}`, `path` (required: `title`, `body`, `path`; the path is "The HTTP path to guidance provided by HMRC", in the Income Tax case the submission resource the message is about), `nino`, `taxYear`, `calculationId`, `correlationId` (a 64-hex string). The request has no body: the report is produced from what HMRC already holds for the calculation.

Sandbox test data is keyed on the calculation id: any valid id returns a 200 with placeholder messages; `620490b4-06e3-4fef-a555-6fd0877dc7ca` returns 204; `640490b4-06e3-4fef-a555-6fd0877dc7ca` returns 404 `MATCHING_CALCULATION_ID_NOT_FOUND`. HMRC's stub service is <https://github.com/hmrc/self-assessment-assist-stubs>.

### The VAT Assist (MTD) API

Listed on <https://developer.service.hmrc.gov.uk/api-documentation/docs/api> on 2026-10-03 as "VAT Assist (MTD) 1.0, A service that identifies potential inaccuracies in returns before submission", with no documentation page (the link is absent; `/api-documentation/docs/api/service/vat-assist/1.0` answers 404) and no GitHub repository under `hmrc/` yet. The service guide names it "the VAT Assist (MTD) API (available from April 2027)" and its two endpoints by title. The slides say the request carries the draft VAT return data, the period, the tax id and the fraud headers, and the receipt carries the tax id, the report id and the correlation id.

### Press

Public Technology, 2026-09-18, "HMRC preps algorithm to provide firms with 'incisive feedback' on potential VAT-return errors": a rule-based model comparing the draft against data held within the HMRC estate; nearly 500 VAT products, about 40 free; "available to all third-party software"; messages are short, plain English, and voluntary.

## Where it sits in Submit

The VAT return form `web/public/hmrc/vat/submitVat.html` holds the nine boxes (`#vatDueSales` first, line 102), the obligation picker (`web/public/lib/vat-period-choice.js`, which fills `#periodKey` from the open obligations and knows whether the chosen period is open), and the submit button (`#submitBtn`, line 346). HMRC Assist goes between the picker and the button: a "Check this return with HMRC Assist" control that is enabled when an open obligation is chosen and the nine boxes validate, a pause while the request runs, the messages, the receipt sent when the last message has been shown, and the submit button untouched throughout except during the pause.

The server already has everything the request needs: the bearer token from the HMRC sign-in (`extractHmrcAccessTokenFromLambdaEvent`), the fraud prevention headers (`app/lib/buildFraudHeaders.js`, validated on every VAT call), the entitlement check (`enforceBundles` against the `submit-vat` activity), the receipts store (`app/data/dynamoDbReceiptRepository.js` `putReceipt`), and the async Lambda pattern every VAT call uses (`AsyncApiLambda` in `HmrcStack.java`, names in `SubmitSharedNames.java`, routes registered by each function's `apiEndpoint`). The Income Tax journey holds the calculation id at `web/public/hmrc/itsa/taxCalculation.html` line 237 and hands it to `finalDeclaration.html` at line 244; the Income Tax report belongs between those two.

## Decisions

1. **Build the VAT integration now against an assumed contract, in one place.** The VAT Assist (MTD) API has no specification yet. The handlers and the simulator use the Income Tax API's shape with VAT keys, and every assumed path and body lives in one module, `app/lib/hmrcAssistApi.js`, so the real specification replaces one file. Assumed: `POST /organisations/vat/{vrn}/assist/reports` with a JSON body `{ periodKey, vatDueSales, vatDueAcquisitions, totalVatDue, vatReclaimedCurrPeriod, netVatDue, totalValueSalesExVAT, totalValuePurchasesExVAT, totalValueGoodsSuppliedExVAT, totalAcquisitionsExVAT }` (the VAT (MTD) return body without `finalised`) answering 200 `{ reportId, messages[], vrn, periodKey, correlationId }` or 204; `POST /organisations/vat/{vrn}/assist/reports/acknowledge/{reportId}/{correlationId}` answering 204; scopes `read:vat` and `write:vat` (the FAQ says the same scope as the VAT (MTD) suite). The messages' shape is the Income Tax one: `title`, `body`, `action`, `links[]`, `path`, with the slides' heading added as the first message's provenance.
2. **The Income Tax integration is built against the real API first.** The Self Assessment Assist (MTD) API is in the sandbox today with published scenarios, and HMRC reads sandbox logs. Building it proves the handlers, the widget, the receipt and the pause against a real HMRC service a year before the VAT one exists, and the VAT build is the same code with a different contract module. It cannot reach customers before the 2027-28 production round (`PLAN_ITSA_APPROVAL.md`), which does not matter for the proof.
3. **Advisory, never gating.** The submit button is never disabled by HMRC Assist except during the pause between request and response. A failed or unavailable Assist call leaves the form exactly as it was, with a one-line notice. The receipt is sent automatically when the last message has been rendered, not on submit, and is retried until it answers 204; a submission that happens before the receipt is answered still goes through, with the receipt sent after. This is the service guide's rule and the slides' "presented receipt is sent back automatically once the feedback is displayed in full".
4. **Verbatim, ordered, attributed.** Messages render exactly as received, in the order received, the first one first, at most five, each link's whole sentence as the link text, with the heading "HMRC feedback" over the list and no paraphrase anywhere. The `path` is not shown; it maps to the box it names and that box is highlighted. English is shown; the Welsh version is kept in the receipt.
5. **The report is a receipt.** The report (`reportId`, `correlationId`, the messages, the draft figures it was about, the time shown and the time acknowledged) is stored in the receipts table as kind `vat-assist-report` under the same user hash as the return it preceded, with the seven-year TTL the submission receipts carry, and the submission receipt names the last `reportId` it followed. The receipts page lists it under the return. The report costs no token: it is part of preparing the return, and the catalogue row stays `submit-vat` with one token for the submission.
6. **Re-request on change, disable for filed periods.** Editing any box after a report clears the messages and re-enables the check; the picker's obligation status decides availability, and a period whose obligation is fulfilled gets no control. No automatic request without the customer pressing the control, because a request sends the draft to HMRC and the privacy page says when that happens.
7. **The pre-submission data is in the privacy notice.** `web/public/privacy.html` says that pressing the check sends the draft return to HMRC for feedback before filing, what HMRC returns, and that the report is kept with the return's receipt.
8. **Simulator first, then the sandbox.** The HTTP simulator carries both APIs with HMRC's scenario values, the three illustrative messages as canned content, and `Gov-Test-Scenario` variants for 204, 403 and 404, so the behaviour suite and the videos run without HMRC. The Income Tax build then runs against the real sandbox with the published calculation ids; the VAT build runs against the sandbox the week HMRC lists the API.

9. **The VAT control is off prod until the published contract.** A `vat-assist-check` activity in `web/public/submit.catalogue.toml` carries `environments = ["local", "test", "simulator", "proxy", "ci"]`; `submitVat.html` mounts the widget only when that activity is listed in the current environment (`isActivityListedInEnvironment` against `/submit.environment-name.txt`, unreadable counting as not listed), and the two VAT Assist Lambdas answer 404 outside the list. HA8 adds `prod` to that one array. The Income Tax half is already off prod through the `self-employed` activities' `environments`. Operator decision, 2026-10-03: a mocked or unapproved integration must not touch the live VAT submission journey.

10. **The early adopter email goes after the Income Tax sandbox run.** HMRC reads sandbox logs, so HA4's sandbox step runs on the proxy lane first and the draft gains one sentence with the run date; nothing else in the build changes what HMRC can answer. Operator decision, 2026-10-03.

## The contract module

`app/lib/hmrcAssistApi.js` exports, for each of `vat` and `itsa`: the report URL builder, the acknowledge URL builder, the request body builder (VAT only), the response normaliser to one shape `{ reportId, correlationId, messages: [{ title, body, action, links, path }] }`, and the scope list. Unit tests pin the paths and the `Accept` version the way the VAT handlers' tests do. When HMRC publishes the VAT specification, HA8 changes this file and its tests, and nothing else.

## Tasks

| Id | What | Files (estimate) | Size | Model | Depends on |
| --- | --- | --- | --- | --- | --- |
| HA1 | The simulator: `routes/vat-assist.js`, `routes/itsa-assist.js`, `scenarios/assist.js` (the three illustrative messages with VAT box paths; the Income Tax placeholders; 204 `NO_MESSAGES`, 403 `CORRELATION_ID_NOT_AUTHORISED` on a wrong correlation id, 404 on the not-found calculation id; the sandbox's two fixed Income Tax ids honoured), registered in `app/http-simulator/server.js`; system tests | `app/http-simulator/routes/vat-assist.js`, `routes/itsa-assist.js`, `scenarios/assist.js`, `server.js`, a system test | ~5 | Sonnet | — |
| HA2 | The contract module and the four handlers: `app/lib/hmrcAssistApi.js`; `hmrcVatAssistReportPost.js`, `hmrcVatAssistAcknowledgePost.js`, `hmrcItsaAssistReportPost.js`, `hmrcItsaAssistAcknowledgePost.js` after `hmrcVatObligationGet.js` (validation, `enforceBundles`, fraud headers, `hmrcHttpPost`, the receipt put of kind `vat-assist-report` or `itsa-assist-report`, activity events); routes `/api/v1/hmrc/vat/assist/report`, `/api/v1/hmrc/vat/assist/acknowledge`, `/api/v1/hmrc/itsa/assist/report`, `/api/v1/hmrc/itsa/assist/acknowledge`; the spine (`SubmitSharedNames.java`, `HmrcStack.java`, `DataStack.java` async tables, `server.js`, `cdk.json`, the `.env.*` files, `DataStackTest.java`, `SubmitEnvironmentCdkResourceTest.java` counts) | ~16 | Sonnet | HA1 |
| HA3 | The widget `web/public/widgets/hmrc-assist-messages.js` on `submitVat.html`: the control, the pause, the verbatim ordered list with links and box highlighting, the automatic receipt with retry, re-request on edit, disabled for fulfilled obligations, the no-feedback and unavailable states; browser tests with the simulator's scenarios | `web/public/widgets/hmrc-assist-messages.js`, `web/public/hmrc/vat/submitVat.html`, `web/public/lib/vat-period-choice.js` (exposes the chosen obligation's status), `web/browser-tests/hmrcAssist.browser.test.js`, styles | ~5 | Sonnet | HA2 |
| HA3a | The environment gate: the `vat-assist-check` activity, the page's mount condition, the 404 in the two VAT handlers, browser and unit cases for `prod` | `submit.catalogue.toml`, `submitVat.html`, `app/lib/hmrcAssistHandler.js`, the two VAT handlers' tests, `hmrcAssist.browser.test.js` | ~6 | Sonnet | HA3 |
| HA4 | The Income Tax journey: the same widget on `taxCalculation.html` after the retrieve, keyed on `nino`, `taxYear`, `calculationId`; the acknowledge before the final declaration; scopes `read:self-assessment-assist` and `write:self-assessment-assist` added to the `self-employed-calculation` and year-end activities' `hmrcScopesRequired` in `web/public/submit.catalogue.toml` (a re-consent for existing sandbox users); proof against the real sandbox with the three calculation ids in `scripts/itsa-sandbox-year.js`'s run, transcripts to `../private.diyaccounting.co.uk/hmrc/itsa/sandbox-runs/` | `taxCalculation.html`, `finalDeclaration.html`, `submit.catalogue.toml`, `scripts/itsa-sandbox-year.js`, a behaviour step | ~6 | Sonnet | HA3 |
| HA5 | The behaviour suite `hmrcAssistBehaviour` on the simulator lane: VAT messages shown in order and acknowledged, then the return submitted and both receipts present; the 204 path; the unavailable path with the submit still allowed; a fulfilled period with no control; the Income Tax path; added to the CI test matrix | `behaviour-tests/hmrcAssist.behaviour.test.js`, `behaviour-tests/steps/behaviour-hmrc-assist-steps.js`, `package.json`, `.github/workflows/test.yml` | ~4 | Sonnet | HA3, HA4 |
| HA6 | The privacy notice and the receipts page: the pre-submission draft sent on the customer's action, what comes back, where it is kept; the receipts page lists the report under its return | `web/public/privacy.html`, `web/public/hmrc/receipt/receipts.html` | ~2 | Haiku | HA2 for the receipts page; the privacy text now |
| HA7 | The video scene: the VAT return checked with HMRC Assist on the simulator, added to `videos/` and `web/public/videos/publish.json` through `site-video-capture` and `video-publish` | `videos/vat-hmrc-assist.json`, `web/public/videos/publish.json` | ~2 | Sonnet | HA5 |
| HA8 | The real VAT contract: when HMRC publishes the VAT Assist (MTD) specification and the sandbox lists it, subscribe the Developer Hub application, rewrite `hmrcAssistApi.js`'s VAT half and its tests and the simulator's VAT routes to the published paths, bodies and scenarios, run HA5 against the sandbox, and record the run for the early adopter proof | `app/lib/hmrcAssistApi.js`, its test, `routes/vat-assist.js`, `scenarios/assist.js` | ~4 | Sonnet | HMRC publishing the API; O24's reply |

Order: HA1, HA2 and HA6's privacy text in the first wave (HA1 and HA2 share the simulator contract, so one agent runs HA1 then HA2); HA3 and HA4 next, one agent, VAT then Income Tax; HA5, then HA7. HA8 waits on HMRC.

### Dependency graph

```
HA1 ──► HA2 ──► HA3 ──► HA3a ──► HA4 ──► HA5 ──► HA7
                                  │
                                  └──► HA4's sandbox run ──► O24 (the email)
         │               
         └──► HA6 (receipts page; the privacy text is independent)
O24 reply ──► HMRC publishes the VAT Assist (MTD) API ──► HA8
```

## The reply to HMRC

`../private.diyaccounting.co.uk/hmrc/vat/hmrc-assist/DRAFT_EMAIL_HMRC_ASSIST_VAT.md`, to `hmrcassist@hmrc.gov.uk`, sent by the operator (`NEXT.md` O24). It asks for early adoption and puts the questions this design could not settle:

1. When the VAT Assist (MTD) API's documentation and sandbox will appear on the Developer Hub, since the listing has no page yet, and whether the product implementation guide is available to early adopters now.
2. Whether the feedback request carries the draft return in its body (the nine boxes and the period key) or a reference to data HMRC holds, as the Income Tax API does with a calculation id.
3. The shape of a VAT message's `path`: which identifiers name a return box, so the software can highlight the field.
4. Whether the receipt must be answered before the return may be submitted, or only sent once the messages are displayed, when a customer submits during the receipt call.
5. Whether the sandbox scenarios will be keyed on `Gov-Test-Scenario` or on fixed identifiers as the Income Tax sandbox is, and whether the five-message cap and the Welsh versions apply in the sandbox.
6. Whether an agent's request differs from a business's in any header or path.

## Verification

- A unit test per handler pins the HMRC URL it builds, the `Accept` version, the scopes and the error mapping, and the VAT contract test fails loudly when `hmrcAssistApi.js`'s VAT half is still the assumed one and a `HMRC_ASSIST_VAT_CONTRACT=published` flag is set, so HA8 cannot be forgotten.
- The simulator answers every scenario in this document with HMRC's own codes and messages; the three illustrative VAT messages render verbatim, in order, with their links as whole-sentence anchors and the named box highlighted.
- The submit button is enabled before the check, disabled only between request and response, and enabled after a 200, a 204, a 4xx and a network failure alike; a browser test asserts each.
- The receipt is sent once per report, after the last message is in the viewport, and retried on failure; a second report after an edit gets its own receipt; both receipts and the submission receipt are in the receipts table under one user hash, and the receipts page lists them under the return.
- A fulfilled obligation shows no control; "another period" with free dates shows no control.
- The Income Tax run against the real sandbox produces a 200 with messages, a 204 on `620490b4-06e3-4fef-a555-6fd0877dc7ca`, a 404 on `640490b4-06e3-4fef-a555-6fd0877dc7ca`, and a 204 acknowledge, with the fraud prevention validator clean, transcripts kept.
- `npm run test:unit`, `npm run test:system`, `npm run test:browser`, `./mvnw clean verify` and `npm run test:hmrcAssistBehaviour-simulator` pass; the resource counts in `infra/test/java` carry the four new async Lambdas and their tables.
- No message text, path or ordering is altered anywhere between HMRC's response and the screen.

## Sources

- HMRC emails of 2026-01-08, 2026-05-07 and 2026-06-30 (the mail mirror; the slides in `../private.diyaccounting.co.uk/hmrc/vat/hmrc-assist/`).
- VAT (MTD) end-to-end service guide, "HMRC Assist for VAT": <https://developer.service.hmrc.gov.uk/guides/vat-mtd-end-to-end-service-guide/documentation/hmrc-assist-for-vat.html>.
- Self Assessment Assist (MTD) API 1.0: <https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/self-assessment-assist/1.0>; <https://github.com/hmrc/self-assessment-assist>; <https://github.com/hmrc/self-assessment-assist-stubs>; changelog <https://github.com/hmrc/income-tax-mtd-changelog>.
- The Developer Hub API list: <https://developer.service.hmrc.gov.uk/api-documentation/docs/api> ("VAT Assist (MTD)" listed without a page, 2026-10-03).
- Public Technology, 2026-09-18: <https://www.publictechnology.net/2026/09/18/economics-and-finance/hmrc-preps-algorithm-to-provide-firms-with-incisive-feedback-on-potential-vat-return-errors/>.
- Fraud prevention headers: <https://developer.service.hmrc.gov.uk/guides/fraud-prevention/>; this repository's `app/lib/buildFraudHeaders.js`.
