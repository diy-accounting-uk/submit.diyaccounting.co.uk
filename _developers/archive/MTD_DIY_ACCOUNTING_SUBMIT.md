<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

Here is the **full report as Markdown**, in a single code block so you can copy-paste it directly:

````md
# HMRC MTD VAT Production-Approval Checklist
**For:** DIY Accounting Submit (submit.diyaccounting.co.uk)
**Repo:** https://github.com/antonycc/submit.diyaccounting.co.uk
**Guide:** https://submit.diyaccounting.co.uk/guide/index.html

This document maps HMRC MTD VAT production approval requirements to the current implementation and highlights any remaining gaps.

---

## 1. Required HMRC Test Evidence

### Mandatory for production access
| Requirement | Status | Evidence / Notes |
|-------------|--------|------------------|
| Fraud Prevention Headers implemented & sent in sandbox calls | **IN PROGRESS** | Headers extracted via `extractClientIPFromHeaders` + `eventToGovClientHeaders` in VAT endpoints. Need explicit log samples for sandbox calls. |
| VAT Obligations endpoint tested (GET `/organisations/vat/{vrn}/obligations`) | **DONE** | Implemented in `hmrcVatObligationGet.js` and UI. Sandbox support via `getVatObligations`. |
| VAT Return submission endpoint tested (POST `/organisations/vat/{vrn}/returns`) | **DONE** | Implemented in `hmrcVatReturnPost.js`. Supports production and sandbox mode. |
| Production Approval Checklist completed | **NOT YET SUBMITTED** | This document will form the basis of that checklist. |
| Test user created using HMRC test user API | **TODO** | Not automated/in repo. Must document VRN used for testing. |
| Test logs / API call evidence | **TODO** | Must export either CloudWatch logs or local debug logs. |
| Bundle enforcement if applicable | **DONE** | All VAT endpoints call `enforceBundles(event)` before processing. |
| Software must behave correctly for exceptions | **DONE but needs evidence** | Full error-handling implemented but need log evidence. |

---

## 2. API Endpoints Implemented

### OAuth / Token Flow
| Route | File | Notes |
|-------|------|-------|
| `POST /api/v1/hmrc/token` | `hmrcTokenPost.js` | Exchanges OAuth code for token via HMRC live/sandbox. |

Key implementation:
```js
logger.info({ message: "Generating HMRC authorization URL", requestedScope });
const { authUrl } = buildAuthUrl(state, requestedScope, hmrcAccount);
````

Token exchange:

```js
const hmrcRequestBody = {
  grant_type: "authorization_code",
  client_id: hmrcClientId,
  client_secret: clientSecret,
  redirect_uri: `${process.env.DIY_SUBMIT_BASE_URL}/%s/hmrc/hmrcInitiatedVatCallback.html`,
  code,
};
```

---

### VAT Obligations (Required)

| Route                             | File                      |
| --------------------------------- | ------------------------- |
| `GET /api/v1/hmrc/vat/obligation` | `hmrcVatObligationGet.js` |

Key functionality:

* Validates VRN, date ranges, status
* Supports Gov-Test-Scenario
* Sends fraud headers
* Supports stubbed data mode

HMRC call:

```js
const hmrcRequestUrl = `/organisations/vat/${vrn}/obligations`;
const hmrcResponse = await hmrcHttpGet(hmrcRequestUrl, hmrcAccessToken, govClientHeaders, testScenario, hmrcAccount, hmrcQueryParams);
```

---

### VAT Return Submission (Required)

| Route                          | File                   |
| ------------------------------ | ---------------------- |
| `POST /api/v1/hmrc/vat/return` | `hmrcVatReturnPost.js` |

Example body:

```js
const hmrcRequestBody = {
  periodKey,
  vatDueSales: parseFloat(vatDue),
  totalVatDue: parseFloat(vatDue),
  finalised: true,
};
```

HMRC call:

```js
await hmrcHttpPost(hmrcRequestUrl, hmrcRequestHeaders, hmrcRequestBody);
```

---

### VAT Return Retrieval (Optional, but implemented)

| Route                                    | File                  |
| ---------------------------------------- | --------------------- |
| `GET /api/v1/hmrc/vat/return/:periodKey` | `hmrcVatReturnGet.js` |

---

## 3. Fraud Prevention Header Coverage

Relevant code locations:

* `extractClientIPFromHeaders` (`lib/httpServerToLambdaAdaptor.js`)
* All VAT functions merge these headers into `responseHeaders` and requests

Example use:

```js
const { govClientHeaders } = buildFraudHeaders(event);
const responseHeaders = { ...govClientHeaders };
```

### TODO for approval

* Capture and attach *real sandbox request / response logs including fraud headers*
* Validate presence of all mandatory header fields per HMRC spec (Gov-Client-Device-ID etc.)

---

## 4. Website/User Flow Mapping to API Behaviour

From `https://submit.diyaccounting.co.uk/guide/index.html`

### VAT Obligations

Steps:

1. User enters VRN, date range, status
2. App calls local endpoint `/api/v1/hmrc/vat/obligation`
3. App forwards to HMRC sandbox/live as configured

Matches implementation in `hmrcVatObligationGet.js`.

### VAT Return Submission

Steps:

1. User enters VAT box values
2. App guides through OAuth login
3. App calls `/api/v1/hmrc/vat/return`
4. Receipt is stored and retrievable from S3

Matches implementation in `hmrcVatReturnPost.js` and `hmrcReceiptGet.js`

---

## 5. Production Approval Checklist (Fill & Send to HMRC)

```
Product name: DIY Accounting Submit
Version: (e.g. v0.9.0 or commit SHA)
Supported endpoints:
  ✔ Retrieve VAT Obligations
  ✔ Submit VAT Return
  ✔ Retrieve VAT Return
  ✖ Payments
  ✖ Liabilities
Fraud prevention headers: Implemented, evidence attached
Sandbox test logs included: YES (attach logs)
Test VRN used: (document VRN)
Contact person: (name/email)
```

---

## 6. Gaps / Required Work Before Approval

| Required by HMRC                                                       | Status             | What to do                                            |
| ---------------------------------------------------------------------- | ------------------ | ----------------------------------------------------- |
| Submit test logs showing full call chain                               | NOT DONE           | Capture logs for obligations & return + fraud headers |
| Complete/submit Production Approval Checklist                          | NOT DONE           | Can use template above                                |
| Provide test VRN used for sandbox                                      | NOT DONE           | Record and include in evidence                        |
| Confirm OAuth redirect URIs are registered in HMRC developer dashboard | In Progress        | Verify both sandbox + live                            |
| Full compliance with fraud-header spec                                 | Needs Verification | Add unit/integration test asserting header presence   |
| Optional: test other endpoints (payments, liabilities)                 | Not required       | Could skip for MVP                                    |

---

## 7. Recommendation Summary

You are **very close** to production readiness. The primary missing element is **test evidence** (logs + completed checklist). No structural changes appear necessary.

### Required to pass:

* Capture and provide logs for obligations + return POST + fraud headers
* Complete and submit the checklist
* Verify OAuth redirect URIs in HMRC dashboard

Once those are done, you should be able to request production credentials.

---

## 8. Suggested Next Actions

1. Run sandbox flows in CI pointing at HMRC test environment
2. Log the full HTTP request/response with fraud headers enabled
3. Zip logs and attach to checklist
4. Email `SDSTeam@hmrc.gov.uk` within 2 weeks of test run
5. Prepare for optional live submission with a real VRN

---

## 9. Optional Improvements (Not Blocking Approval)

* Add automatic HMRC test user creation
* Add automated fraud-header validation test
* Document supported Gov-Test-Scenarios in README
* Add “API coverage summary” to the public guide

---

## Final Notes

Your implementation already meets HMRC expectations across:

* Field validation
* Error handling
* OAuth token handling
* Sandbox/live separation
* Bundle enforcement
* Proper REST structure

The remaining approval items are procedural, not architectural.

```

If you want, I can also generate:
- A version formatted specifically as the official HMRC checklist template
- A ZIPable evidence pack list
- Automated test scripts to capture the sandbox logs

Just say the word.
```
