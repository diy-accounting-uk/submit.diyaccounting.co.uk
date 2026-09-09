<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Fraud Prevention Headers Validation Feedback - Fix Documentation

**Status**: FIXED
**Date**: 2026-01-07

## Problem

The test report for "Fraud Prevention Headers Validation (HMRC: VAT Return POST)" (`fraudPreventionHeadersVat-behaviour-test`) was not including content from `GET /test/fraud-prevention-headers/vat-mtd/validation-feedback` when tests ran in CI environments.

## Root Cause

The `GET /test/fraud-prevention-headers/vat-mtd/validation-feedback` request is made **directly from the test executor to HMRC**, not through the Lambda functions. This means:

| Environment | DynamoDB Access | Request Storage |
|-------------|-----------------|-----------------|
| Local (proxy) | Yes - dynalite | Stored via `putHmrcApiRequest()` |
| CI (GitHub Actions) | No | NOT stored - test executor can't access DynamoDB |

The request bypasses the Lambda functions entirely because `checkFraudPreventionHeadersFeedback()` calls `getFraudPreventionHeadersFeedback()` from `app/services/hmrcApi.js` directly, which makes an HTTP request from the test executor process.

## Solution

Modified the code to capture and return the validation feedback result, then write it to the `hmrc-api-requests.jsonl` file regardless of DynamoDB availability.

### Files Changed

| File | Changes |
|------|---------|
| `behaviour-tests/steps/behaviour-hmrc-vat-steps.js` | `fetchFraudPreventionHeadersFeedback()` now returns the captured result |
| `behaviour-tests/helpers/behaviour-helpers.js` | `checkFraudPreventionHeadersFeedback()` now returns the result |
| `behaviour-tests/postVatReturnFraudPreventionHeaders.behaviour.test.js` | Captures result and writes to `hmrc-api-requests.jsonl` |

### Code Flow (After Fix)

```
checkFraudPreventionHeadersFeedback()
    │
    ├── Calls fetchFraudPreventionHeadersFeedback()
    │       │
    │       ├── Calls getFraudPreventionHeadersFeedback() (direct HTTP to HMRC)
    │       │
    │       └── Returns { ok, status, feedback }
    │
    └── Returns result to test
            │
            ├── Added to testContext.validationFeedback
            │
            └── Written to hmrc-api-requests.jsonl (with source: "test-executor-direct")
```

### Key Changes

1. **`fetchFraudPreventionHeadersFeedback()`** - Modified to return `capturedResult`:
   ```javascript
   let capturedResult = null;
   await test.step(..., async () => {
     capturedResult = result;
   });
   return capturedResult;
   ```

2. **`checkFraudPreventionHeadersFeedback()`** - Modified to return result:
   ```javascript
   const result = await fetchFraudPreventionHeadersFeedback(...);
   return result;
   ```

3. **Test file** - Captures and writes to file:
   ```javascript
   const validationFeedbackResult = await checkFraudPreventionHeadersFeedback(...);

   // Add to testContext
   validationFeedback: validationFeedbackResult ? {...} : null,

   // Write to hmrc-api-requests.jsonl
   if (validationFeedbackResult) {
     fs.appendFileSync(hmrcApiRequestsFile, JSON.stringify(validationFeedbackRecord) + "\n");
   }
   ```

## Verification

After deploying these changes:

1. Run the fraud prevention headers test in CI
2. Check the test report at `https://submit.diyaccounting.co.uk/tests/test-report-template.html?test=web-test`
3. The validation feedback should now appear in the HMRC API requests section
4. Look for records with `"source": "test-executor-direct"` to identify feedback captured this way

## Notes

- Records captured directly from the test executor are marked with `"source": "test-executor-direct"`
- Records captured via Lambda/DynamoDB don't have this field (or have a different source)
- Both paths now result in the validation feedback being available in the test report
