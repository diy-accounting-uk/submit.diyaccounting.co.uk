<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# AGENT WIP: HMRC Format Validation Enhancement

## Task Summary
Enhance behavior tests to validate HMRC API response field formats per official HMRC MTD VAT API specifications.

## Current Status: COMPLETED - READY TO DELETE
All format validation has been added and tests pass. This file can be deleted after merge.

## Completed Items
1. **VAT Submission Receipt Validation** - `verifyVatSubmission()` now validates:
   - `formBundleNumber`: exactly 12 digits (`^\d{12}$`)
   - `chargeRefNumber`: 1-16 alphanumeric (may be empty for credits)
   - `processingDate`: valid recent date (not "Invalid Date", within 24 hours)

2. **View VAT Return Validation** - `verifyViewVatReturnResults()` now validates:
   - `periodKey`: 1-4 alphanumeric chars (may include #)
   - Monetary fields: proper GBP format
   - `Finalised` status: Yes/No

3. **VAT Obligations Validation** - `verifyVatObligationsResults()` now validates:
   - `periodKey`: 1-4 alphanumeric chars per HMRC spec
   - Date fields (start, end, due, received): parseable dates
   - Status: Open (O) or Fulfilled (F)

## Files Modified
- `behaviour-tests/steps/behaviour-hmrc-vat-steps.js` (lines 219-283, 404-494, 717-798)

## Reference Documents
- HMRC API Spec: `_developers/reference/hmrc-mtd-vat-api-1.0.yaml`
- Format patterns from HMRC spec:
  - `formBundleNumber`: pattern `^[0-9]{12}$`
  - `chargeRefNumber`: minLength 1, maxLength 16
  - `periodKey`: 4 alphanumeric, may include #

## Verification
- All unit/system tests pass: `npm test`
- Maven build succeeds: `./mvnw clean verify`

## Next Steps (if resuming)
- Run behavior tests against proxy/AWS to verify format validation in real scenarios

## Directories/Files Under Change
- `behaviour-tests/` - behavior test step definitions
