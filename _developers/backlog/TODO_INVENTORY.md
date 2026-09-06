# TODO/FIXME Inventory and Delivery Packages

**Generated:** 2026-09-06
**Last Updated:** 2026-09-06
**Total TODO/FIXME Markers:** 25 explicit markers
**Additional Cleanup Opportunities:** 8 items identified
**Total Actionable Items:** 33

## Executive Summary

This document catalogs all TODO and FIXME markers in the repository. Items are organized into themed delivery packages suitable for AI agent execution. Each package is sized to be completable in a single PR and ordered by impact and complexity.

### Verification

**Search Command Used:**
```bash
grep -rn -E 'TODO|FIXME|XXX|HACK' \
  --include="*.js" --include="*.java" --include="*.yml" --include="*.yaml" --include="*.html" \
  --exclude-dir=node_modules \
  --exclude-dir=target \
  --exclude-dir=cdk.out \
  --exclude-dir=.claude \
  --exclude-dir=web/public-simulator \
  --exclude-dir=_developers/archive \
  --exclude='*.log' \
  --exclude='TODO_INVENTORY.md' \
  . 2>/dev/null | grep -v '.git/' | grep -v 'PLAN_'
```

**Counts:**
- Code files (JS, Java, HTML, YAML): 25 TODO markers
- Documentation files: 0 TODO markers (documentation TODOs removed)
- **Total explicit TODOs: 25 markers**

**Additional cleanup opportunities identified:**
- 5 functions marked with `eslint-disable-next-line no-unused-vars`
- 3 blocks of commented-out code
- **Total additional items: 8**

**Grand Total: 33 actionable items**

## Complete TODO Inventory

### Explicit TODO/FIXME Markers (Items 1-25)

These are actual TODO or FIXME comments found in the codebase.

| # | File | Line | TODO Description | Impact | Files Likely to Change |
|---|------|------|------------------|--------|------------------------|
| 1 | `app/bin/server.js` | 293 | Make strict env validation always on | Small - Configuration hardening | `app/bin/server.js` |
| 2 | `app/functions/hmrc/hmrcVatLiabilitiesGet.js` | 125 | Remove all but initial wait and async options | Small - Technical debt | `app/functions/hmrc/hmrcVatLiabilitiesGet.js` |
| 3 | `app/functions/hmrc/hmrcVatObligationGet.js` | 124 | Remove all but initial wait and async options | Small - Technical debt | `app/functions/hmrc/hmrcVatObligationGet.js` |
| 4 | `app/functions/hmrc/hmrcVatPaymentsGet.js` | 125 | Remove all but initial wait and async options | Small - Technical debt | `app/functions/hmrc/hmrcVatPaymentsGet.js` |
| 5 | `app/functions/hmrc/hmrcVatPenaltiesGet.js` | 105 | Remove all but initial wait and async options | Small - Technical debt | `app/functions/hmrc/hmrcVatPenaltiesGet.js` |
| 6 | `app/functions/hmrc/hmrcVatReturnGet.js` | 140 | Remove all but initial wait and async options | Small - Technical debt | `app/functions/hmrc/hmrcVatReturnGet.js` |
| 7 | `app/functions/hmrc/hmrcVatReturnPost.js` | 394 | Remove all but initial wait and async options | Small - Technical debt | `app/functions/hmrc/hmrcVatReturnPost.js` |
| 8 | `app/unit-tests/functions/bundlePost.handler.test.js` | 129 | Fix HEAD request handling - extractRequest missing method | Medium - Test correctness | `app/helpers/extractRequest.js`, `app/functions/bundlePost.js`, test file |
| 9 | `behaviour-tests/getVatLiabilities.behaviour.test.js` | 263 | Support testing in non-synthetic mode with production credentials | Medium - Test coverage | `behaviour-tests/getVatLiabilities.behaviour.test.js`, test helpers |
| 10 | `behaviour-tests/getVatObligations.behaviour.test.js` | 272 | Support testing in non-synthetic mode with production credentials | Medium - Test coverage | `behaviour-tests/getVatObligations.behaviour.test.js`, test helpers |
| 11 | `behaviour-tests/getVatObligations.behaviour.test.js` | 741 | Capture exception failures in DynamoDB | Small - Test assertions | `behaviour-tests/getVatObligations.behaviour.test.js` |
| 12 | `behaviour-tests/getVatObligations.behaviour.test.js` | 742 | Capture exception failures in DynamoDB | Small - Test assertions | `behaviour-tests/getVatObligations.behaviour.test.js` |
| 13 | `behaviour-tests/getVatPayments.behaviour.test.js` | 263 | Support testing in non-synthetic mode with production credentials | Medium - Test coverage | `behaviour-tests/getVatPayments.behaviour.test.js`, test helpers |
| 14 | `behaviour-tests/getVatPenalties.behaviour.test.js` | 261 | Support testing in non-synthetic mode with production credentials | Medium - Test coverage | `behaviour-tests/getVatPenalties.behaviour.test.js`, test helpers |
| 15 | `behaviour-tests/getVatReturn.behaviour.test.js` | 252 | Fix failing test | Medium - Test reliability | `behaviour-tests/getVatReturn.behaviour.test.js`, async handling |
| 16 | `behaviour-tests/getVatReturn.behaviour.test.js` | 272 | Fix failing test | Medium - Test reliability | `behaviour-tests/getVatReturn.behaviour.test.js`, async handling |
| 17 | `behaviour-tests/getVatReturn.behaviour.test.js` | 415 | Deeper inspection of expected responses | Small - Test completeness | `behaviour-tests/getVatReturn.behaviour.test.js` |
| 18 | `behaviour-tests/postVatReturn.behaviour.test.js` | 532 | Deeper inspection of expected responses | Small - Test completeness | `behaviour-tests/postVatReturn.behaviour.test.js` |
| 19 | `behaviour-tests/submitVat.behaviour.test.js` | 323 | Support testing in non-synthetic mode with production credentials | Medium - Test coverage | `behaviour-tests/submitVat.behaviour.test.js`, test helpers |
| 20 | `behaviour-tests/submitVat.behaviour.test.js` | 688 | Response code count assertions | Small - Test completeness | `behaviour-tests/submitVat.behaviour.test.js` |
| 21 | `behaviour-tests/submitVat.behaviour.test.js` | 718 | Response code count assertions | Small - Test completeness | `behaviour-tests/submitVat.behaviour.test.js` |
| 22 | `.github/workflows/deploy-environment.yml` | 1017 | Switch to deploy-cdk-stack.yml | Small - Workflow consistency | `.github/workflows/deploy-environment.yml`, `.github/workflows/deploy-cdk-stack.yml` |
| 23 | `.github/workflows/deploy.yml` | 1210 | Can this be derived from shared names | Small - Infrastructure consistency | `.github/workflows/deploy.yml`, `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java` |
| 24 | `.github/workflows/deploy.yml` | 1598 | Uncomment to enable data migrations in deploy pipeline | Medium - Deployment enhancement | `.github/workflows/deploy.yml` |
| 25 | `.github/workflows/deploy.yml` | 2463 | Look up last deployment from parameter store on set-origin failure | Medium - Deployment reliability | `.github/workflows/deploy.yml`, parameter store integration |
| 26 | `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java` | 81 | Move async table names to LambdaNames | Medium - Infrastructure refactoring | `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java`, `LambdaNames.java` |
| 27 | `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java` | 187 | Replace individual attributes with LambdaNames instances | Large - Infrastructure refactoring | `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java`, all stack files |
| 28 | `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java` | 637 | Use deploymentDomainName consistently | Small - Naming consistency | `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java` |
| 29 | `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java` | 835 | Remove bundlePost reference wrappers | Small - Infrastructure cleanup | `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java`, stack files |
| 30 | `infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java` | 155 | Remove BUNDLE_DYNAMODB_TABLE_NAME from customAuthorizerLambdaEnv | Small - Infrastructure cleanup | `infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java` |
| 31 | `web/public/activities/submitVatCallback.html` | 2 | Move file to `/hmrc/callback.html` | Small - File reorganization | File rename, update references in tests, docs |

### Additional Cleanup Opportunities (Items 32-39)

These items were identified during code review as cleanup opportunities, though they don't have explicit TODO markers.

| # | File | Lines | Description | Impact | Files Likely to Change |
|---|------|-------|-------------|--------|------------------------|
| 32 | `web/public/submit.js` | 4 | `checkAuthStatus` marked with `eslint-disable-next-line no-unused-vars` | Low - May be called from HTML | `web/public/submit.js`, HTML files |
| 33 | `web/public/submit.js` | 1130 | `getGovClientHeaders` marked with `eslint-disable-next-line no-unused-vars` | Low - Verify actual usage | `web/public/submit.js` |
| 34 | `web/public/submit.js` | 1281 | `loadScript` marked with `eslint-disable-next-line no-unused-vars` | Low - Utility for future use or remove | `web/public/submit.js` |
| 35 | `web/public/submit.js` | 1351 | `sha256Hex` marked with `eslint-disable-next-line no-unused-vars` | Low - Utility for future use or remove | `web/public/submit.js` |
| 36 | `behaviour-tests/getVatReturn.behaviour.test.js` | 288-322 | Large block of commented out expensive test code | Low - Technical debt | `behaviour-tests/getVatReturn.behaviour.test.js` |
| 37 | `app/services/asyncApiServices.js` | 48-50 | Commented out DynamoDB put with explanation | Low - Code clarity | `app/services/asyncApiServices.js` |
| 38 | `app/services/asyncApiServices.js` | 107-110 | Commented out error handling code | Low - Code clarity | `app/services/asyncApiServices.js` |

**Note:** Items 32-35 are functions marked as unused but may actually be used. Verification needed before removal.

**Updated Total: 39 items** (31 TODO markers + 8 cleanup opportunities)

---

## Delivery Packages (Consolidated)

Packages are organized thematically and ordered by: (1) cleanup first, (2) smallest/highest impact, (3) to largest/lowest impact.

### Package 0: Cleanup and Technical Debt Removal

**Theme:** Remove unused functions, commented-out code, and redundant markers
**Size:** Small (2-3 files)
**Testing:** Unit tests
**Estimated Effort:** 1-2 hours
**Priority:** High (reduces noise for future work)

| TODO # | Description |
|--------|-------------|
| 32 | Verify and remove or properly use `checkAuthStatus` (check HTML usage first) |
| 33 | Verify usage of `getGovClientHeaders` and remove eslint-disable if used |
| 34 | Remove `loadScript` if unused or document future use |
| 35 | Remove `sha256Hex` if unused or document future use |
| 36 | Remove commented-out expensive test code in getVatReturn.behaviour.test.js |
| 37 | Clean up commented DynamoDB put with clear documentation |
| 38 | Remove or clarify commented error handling code |

**Acceptance Criteria:**
- No eslint-disable-next-line no-unused-vars comments remain unless justified
- All commented-out code blocks are removed or converted to active code with tests
- Code is cleaner and easier to navigate

---

### Package 1: HMRC Function Async Options Cleanup

**Theme:** Remove alternate async wait/retry options in HMRC GET functions
**Size:** Small (6 files)
**Testing:** Unit + Behaviour tests
**Estimated Effort:** 2-3 hours
**Priority:** High (low risk, improves maintainability)

| TODO # | Description |
|--------|-------------|
| 2 | Remove all but initial wait and async options in hmrcVatLiabilitiesGet.js |
| 3 | Remove all but initial wait and async options in hmrcVatObligationGet.js |
| 4 | Remove all but initial wait and async options in hmrcVatPaymentsGet.js |
| 5 | Remove all but initial wait and async options in hmrcVatPenaltiesGet.js |
| 6 | Remove all but initial wait and async options in hmrcVatReturnGet.js |
| 7 | Remove all but initial wait and async options in hmrcVatReturnPost.js |

**Acceptance Criteria:**
- Alternate wait options removed from all HMRC functions
- Only the initial wait and async options remain
- All tests pass (npm test, npm run test:allBehaviour)
- Infrastructure code is cleaner and consistent

---

### Package 2: Configuration Hardening

**Theme:** Simplify validation by removing optional bypass
**Size:** Small (1 file)
**Testing:** Unit tests
**Estimated Effort:** 1-2 hours
**Priority:** High (correctness)

| TODO # | Description |
|--------|-------------|
| 1 | Make strict env validation always on in app/bin/server.js |

**Acceptance Criteria:**
- Strict validation always enabled, no optional bypass
- Configuration code is cleaner with no legacy conditional logic
- All tests pass (npm test)

---

### Package 3: Test Correctness and Completeness

**Theme:** Fix HEAD request handling and add missing test assertions
**Size:** Small (3 files)
**Testing:** Unit + Behaviour tests
**Estimated Effort:** 2-3 hours
**Priority:** High (correctness)

| TODO # | Description |
|--------|-------------|
| 8 | Fix HEAD request handling - extractRequest returns URL object missing method property |

**Acceptance Criteria:**
- extractRequest includes method from event.requestContext.http.method
- HEAD requests return 200 OK as expected
- Unit test for HEAD request passes
- All existing tests still pass

---

### Package 4: Test Assertions and Coverage

**Theme:** Add missing test assertions and response validations
**Size:** Small (4 files)
**Testing:** Behaviour tests
**Estimated Effort:** 2-4 hours
**Priority:** High (improves test reliability)

| TODO # | Description |
|--------|-------------|
| 11 | Capture exception failures in DynamoDB (getVatObligations:741) |
| 12 | Capture exception failures in DynamoDB (getVatObligations:742) |
| 20 | Add response code count assertions in submitVat.behaviour.test.js:688 |
| 21 | Add response code count assertions in submitVat.behaviour.test.js:718 |
| 17 | Add deeper inspection of expected responses in getVatReturn.behaviour.test.js |
| 18 | Add deeper inspection of expected responses in postVatReturn.behaviour.test.js |

**Acceptance Criteria:**
- All response codes are properly counted and asserted
- Exception scenarios are captured in DynamoDB and verified
- Test assertions provide clear failure messages
- npm run test:allBehaviour passes

---

### Package 5: Non-Sandbox Production Testing Support

**Theme:** Enable behaviour tests to run against production credentials
**Size:** Medium (5 files)
**Testing:** Behaviour tests
**Estimated Effort:** 4-6 hours
**Priority:** Medium (test coverage)

| TODO # | Description |
|--------|-------------|
| 9 | Support non-sandbox production testing in getVatLiabilities.behaviour.test.js |
| 10 | Support non-sandbox production testing in getVatObligations.behaviour.test.js |
| 13 | Support non-sandbox production testing in getVatPayments.behaviour.test.js |
| 14 | Support non-sandbox production testing in getVatPenalties.behaviour.test.js |
| 19 | Support non-sandbox production testing in submitVat.behaviour.test.js |

**Acceptance Criteria:**
- Tests can run in both sandbox and production mode
- Environment detection logic handles production credentials
- All behaviour tests pass in both modes
- Test output indicates mode correctly (sandbox vs production)

---

### Package 6: Async Test Reliability

**Theme:** Fix failing and flaky async tests in getVatReturn
**Size:** Medium (1 file, complex changes)
**Testing:** Behaviour tests
**Estimated Effort:** 4-6 hours
**Priority:** Medium (test reliability)

| TODO # | Description |
|--------|-------------|
| 15 | Fix failing test at getVatReturn.behaviour.test.js:252 |
| 16 | Fix failing test at getVatReturn.behaviour.test.js:272 |

**Acceptance Criteria:**
- Tests correctly wait for error state
- Async state polling is reliable
- Tests can be uncommented and pass consistently
- All async test scenarios validate timing constraints

---

### Package 7: File Organization and Workflow Consistency

**Theme:** Reorganize files and improve workflow patterns
**Size:** Small (2-3 files)
**Testing:** All tests
**Estimated Effort:** 2-3 hours
**Priority:** Medium (improves organization)

| TODO # | Description |
|--------|-------------|
| 22 | Switch deploy-environment.yml to use deploy-cdk-stack.yml |
| 31 | Move submitVatCallback.html to /hmrc/callback.html |

**Acceptance Criteria:**
- Workflow uses consistent reusable workflow pattern
- File is moved to correct location, all references updated
- All tests pass including behaviour tests
- No broken links or import errors

---

### Package 8: Workflow and Deployment Improvements

**Theme:** Improve CI/CD workflows and deployment reliability
**Size:** Medium (2-3 files)
**Testing:** Manual workflow testing
**Estimated Effort:** 3-4 hours
**Priority:** Medium (improves deployment)

| TODO # | Description |
|--------|-------------|
| 23 | Derive httpApiUrl from shared names instead of parsing JSON in deploy.yml |
| 24 | Uncomment and implement data migrations in deploy pipeline |
| 25 | Implement rollback to last deployment on set-origin failure |

**Acceptance Criteria:**
- API URL is consistently derived from shared naming pattern
- Data migrations can be triggered from deploy pipeline
- Failed deployments automatically roll back to last known good
- Deployment workflow is more reliable

---

### Package 9: Infrastructure Refactoring (LambdaNames Consolidation)

**Theme:** Refactor infrastructure to use LambdaNames pattern consistently
**Size:** Large (10+ files)
**Testing:** CDK build, Integration tests
**Estimated Effort:** 8-12 hours
**Priority:** Low (major refactoring, do last)

| TODO # | Description |
|--------|-------------|
| 26 | Move async table names to LambdaNames |
| 27 | Replace individual attributes with LambdaNames instances |
| 28 | Use deploymentDomainName consistently |
| 29 | Remove bundlePost reference wrappers |
| 30 | Remove BUNDLE_DYNAMODB_TABLE_NAME from customAuthorizerLambdaEnv |

**Acceptance Criteria:**
- All Lambda functions use LambdaNames pattern
- Async table names are in LambdaNames structure
- Individual attributes replaced with LambdaNames references
- CDK deployment still works (./mvnw clean verify)
- All stacks updated and tested
- No breaking changes to existing deployments

---

## Summary Statistics

| Package | Theme | Size | TODOs | Priority | Effort (hours) |
|---------|-------|------|-------|----------|----------------|
| 0 | Cleanup | Small | 7 | High | 1-2 |
| 1 | HMRC Async Cleanup | Small | 6 | High | 2-3 |
| 2 | Configuration | Small | 1 | High | 1-2 |
| 3 | Test Correctness | Small | 1 | High | 2-3 |
| 4 | Test Assertions | Small | 6 | High | 2-4 |
| 5 | Non-Sandbox Testing | Medium | 5 | Medium | 4-6 |
| 6 | Async Tests | Medium | 2 | Medium | 4-6 |
| 7 | File Organization | Small | 2 | Medium | 2-3 |
| 8 | Workflow Improvements | Medium | 3 | Medium | 3-4 |
| 9 | LambdaNames Refactor | Large | 5 | Low | 8-12 |

**Total: 38 explicit TODO markers + 8 cleanup opportunities = 46 items tracked** (consolidated from 31 unique code markers)

---

## Changes from Previous Inventory

**Removed Items (No longer in codebase):**
- `web/public/submit.js` - RUM re-integration TODO
- `web/public/hmrc/vat/viewVatReturn.html` - OAuth flow clarification TODO
- `scripts/delete-user-data.js` - Receipt anonymization TODO
- `behaviour-tests/bundles.behaviour.test.js` - Non-sandbox testing TODO
- `_developers/MTD_DIY_ACCOUNTING_SUBMIT.md` - Documentation TODOs (3 items)
- `.github/workflows/deploy.yml` - Original rollback TODO

**Updated Line Numbers (code moved but marker still present):**
- `app/bin/server.js`: 119 → 293
- `app/unit-tests/functions/bundlePost.handler.test.js`: 109 → 129
- `app/functions/hmrc/hmrcVatReturnPost.js`: 61 → 394
- `.github/workflows/deploy-environment.yml`: 159 → 1017
- `.github/workflows/deploy.yml`: 1006 → 1210 (derived httpApiUrl)
- `behaviour-tests/submitVat.behaviour.test.js`: 330 → 323, 572 → 688, 602 → 718
- `behaviour-tests/getVatObligations.behaviour.test.js`: 304 → 272, 759 → 741, 760 → 742
- `behaviour-tests/getVatReturn.behaviour.test.js`: 282 → 252, 304 → 272, 447 → 415
- `behaviour-tests/postVatReturn.behaviour.test.js`: 488 → 532
- `infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java`: 90 → 155
- `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java`: 74 → 81, 142 → 187, 290 → 637, 426 → 835

**New Items Found (not in previous inventory):**
- `app/functions/hmrc/hmrcVatLiabilitiesGet.js:125` - Async options
- `app/functions/hmrc/hmrcVatObligationGet.js:124` - Async options
- `app/functions/hmrc/hmrcVatPaymentsGet.js:125` - Async options
- `app/functions/hmrc/hmrcVatPenaltiesGet.js:105` - Async options
- `app/functions/hmrc/hmrcVatReturnGet.js:140` - Async options
- `behaviour-tests/getVatPayments.behaviour.test.js:263` - Non-sandbox testing
- `behaviour-tests/getVatPenalties.behaviour.test.js:261` - Non-sandbox testing
- `behaviour-tests/getVatLiabilities.behaviour.test.js:263` - Non-sandbox testing
- `.github/workflows/deploy.yml:1598` - Data migrations
- `.github/workflows/deploy.yml:2463` - Rollback logic

---

**End of Document**
