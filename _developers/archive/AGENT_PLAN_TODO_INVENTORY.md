<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# TODO/FIXME Inventory and Delivery Packages

**Generated:** 2026-01-08
**Last Updated:** 2026-01-08
**Total TODO/FIXME Markers:** 29 explicit markers
**Additional Cleanup Opportunities:** 8 items identified
**Total Actionable Items:** 37

## Executive Summary

This document catalogs all TODO and FIXME markers in the repository, plus additional cleanup opportunities identified during code review. Items are organized into themed delivery packages suitable for AI agent execution. Each package is sized to be completable in a single PR and ordered by impact and complexity.

### Verification

**Search Command Used:**
```bash
grep -r -n -E '//\s*TODO|//\s*FIXME|#\s*TODO|#\s*FIXME|<!--\s*TODO|<!--\s*FIXME' \
  --include="*.js" --include="*.java" --include="*.html" --include="*.yml" --include="*.yaml" \
  . 2>/dev/null | grep -v node_modules | grep -v target | grep -v '.git/' | \
  grep -v 'test-report' | grep -v '.github/agents' | grep -v 'prompts/' | grep -v 'eslint.config.js'
```

**Counts:**
- Code files (JS, Java, HTML, YAML): 25 TODO markers
- Markdown documentation files: 4 TODO markers
- **Total explicit TODOs: 29 markers**

However, during the inventory process, one additional item was identified that represents the same TODO context:
- Item 29 "### TODO for approval" is a section header representing the same work as items 27-28

**Adjusted count: 29 unique TODO markers, represented as 30 items in the table for granularity**

**Additional cleanup opportunities identified:**
- 5 functions marked with `eslint-disable-next-line no-unused-vars`
- 3 blocks of commented-out code
- **Total additional items: 8**

**Grand Total: 37 actionable items**

## Complete TODO Inventory

### Explicit TODO/FIXME Markers (Items 1-29)

These are actual TODO or FIXME comments found in the codebase.

| # | File | Lines | TODO Description | Impact | Files Likely to Change |
|---|------|-------|------------------|--------|------------------------|
| 1 | `web/public/submit.js` | 1396-1410 | Re-integrate RUM (bootstrapRumConfigFromStorage) | Medium - Observability feature | `web/public/submit.js`, HTML files |
| 2 | `web/public/hmrc/vat/viewVatReturn.html` | 564 | Clarify if OAuth flow branches are the same | Low - Code clarity | `web/public/hmrc/vat/viewVatReturn.html` |
| 3 | `web/public/activities/submitVatCallback.html` | 2 | Move file to `/hmrc/callback.html` | Small - File reorganization | File rename, update references in tests, docs |
| 4 | `scripts/delete-user-data.js` | 150 | Implement anonymization for receipts | Medium - Privacy/GDPR compliance | `scripts/delete-user-data.js`, potentially receipt storage logic |
| 5 | `.github/workflows/deploy.yml` | 1006 | Derive httpApiUrl from shared names | Small - Infrastructure consistency | `.github/workflows/deploy.yml`, `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java` |
| 6 | `.github/workflows/deploy.yml` | 1532 | Rollback on test failure | Medium - Deployment reliability | `.github/workflows/deploy.yml`, parameter store integration |
| 7 | `.github/workflows/deploy-environment.yml` | 159 | Switch to deploy-cdk-stack.yml | Small - Workflow consistency | `.github/workflows/deploy-environment.yml`, `.github/workflows/deploy-cdk-stack.yml` |
| 8 | `app/unit-tests/functions/bundlePost.handler.test.js` | 109 | Fix HEAD request handling in extractRequest | Medium - Test correctness | `app/helpers/extractRequest.js`, `app/functions/bundlePost.js`, test file |
| 9 | `app/functions/hmrc/hmrcVatReturnPost.js` | 61 | Remove alternate paths compatibility code | Small - Technical debt | `app/functions/hmrc/hmrcVatReturnPost.js`, caller code |
| 10 | `app/bin/server.js` | 119 | Make strict env validation always on | Small - Configuration hardening | `app/bin/server.js` |
| 11 | `behaviour-tests/submitVat.behaviour.test.js` | 330 | Support non-sandbox production testing | Medium - Test coverage | `behaviour-tests/submitVat.behaviour.test.js`, test helpers |
| 12 | `behaviour-tests/submitVat.behaviour.test.js` | 572 | Response code count assertions | Small - Test completeness | `behaviour-tests/submitVat.behaviour.test.js` |
| 13 | `behaviour-tests/submitVat.behaviour.test.js` | 602 | Response code count assertions | Small - Test completeness | `behaviour-tests/submitVat.behaviour.test.js` |
| 14 | `behaviour-tests/getVatObligations.behaviour.test.js` | 304 | Support non-sandbox production testing | Medium - Test coverage | `behaviour-tests/getVatObligations.behaviour.test.js`, test helpers |
| 15 | `behaviour-tests/getVatObligations.behaviour.test.js` | 759 | Capture exception failures in DynamoDB | Small - Test assertions | `behaviour-tests/getVatObligations.behaviour.test.js` |
| 16 | `behaviour-tests/getVatObligations.behaviour.test.js` | 760 | Capture exception failures in DynamoDB | Small - Test assertions | `behaviour-tests/getVatObligations.behaviour.test.js` |
| 17 | `behaviour-tests/postVatReturn.behaviour.test.js` | 488 | Deeper inspection of expected responses | Small - Test completeness | `behaviour-tests/postVatReturn.behaviour.test.js` |
| 18 | `behaviour-tests/bundles.behaviour.test.js` | 201 | Support non-sandbox production testing | Medium - Test coverage | `behaviour-tests/bundles.behaviour.test.js`, test helpers |
| 19 | `behaviour-tests/getVatReturn.behaviour.test.js` | 282 | Fix failing SUBMIT_HMRC_API_HTTP_500 test | Medium - Test reliability | `behaviour-tests/getVatReturn.behaviour.test.js`, async handling |
| 20 | `behaviour-tests/getVatReturn.behaviour.test.js` | 304 | Fix failing timeout/slow scenario tests | Medium - Test reliability | `behaviour-tests/getVatReturn.behaviour.test.js`, async handling |
| 21 | `behaviour-tests/getVatReturn.behaviour.test.js` | 447 | Deeper inspection of expected responses | Small - Test completeness | `behaviour-tests/getVatReturn.behaviour.test.js` |
| 22 | `infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java` | 90 | Remove BUNDLE_DYNAMODB_TABLE_NAME from customAuthorizerLambdaEnv | Small - Infrastructure cleanup | `infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java` |
| 23 | `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java` | 74 | Move async table names to LambdaNames | Medium - Infrastructure refactoring | `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java`, `LambdaNames.java` |
| 24 | `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java` | 142 | Replace individual attributes with LambdaNames instances | Large - Infrastructure refactoring | `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java`, all stack files |
| 25 | `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java` | 290 | Use deploymentDomainName consistently | Small - Naming consistency | `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java` |
| 26 | `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java` | 426 | Remove bundlePost reference wrappers | Small - Infrastructure cleanup | `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java`, stack files |
| 27 | `_developers/MTD_DIY_ACCOUNTING_SUBMIT.md` | 22 | Document VRN used for testing | Small - Documentation | `_developers/MTD_DIY_ACCOUNTING_SUBMIT.md` |
| 28 | `_developers/MTD_DIY_ACCOUNTING_SUBMIT.md` | 23 | Export CloudWatch or local debug logs | Medium - Documentation/Evidence | `_developers/MTD_DIY_ACCOUNTING_SUBMIT.md`, possibly export scripts |
| 29 | `_developers/MTD_DIY_ACCOUNTING_SUBMIT.md` | 125 | Complete TODO for approval section | Medium - Documentation/Compliance | `_developers/MTD_DIY_ACCOUNTING_SUBMIT.md` |
| 30 | `HMRC_MTD_APPROVAL_PLAN.md` | 405 | Implement Gov-Client-Multi-Factor header | Medium - HMRC compliance | `web/public/submit.js`, HMRC function files, Cognito integration |

### Additional Cleanup Opportunities (Items 31-37)

These items were identified during code review as cleanup opportunities, though they don't have explicit TODO markers.

| # | File | Lines | Description | Impact | Files Likely to Change |
|---|------|-------|-------------|--------|------------------------|
| 31 | `web/public/submit.js` | 4 | `checkAuthStatus` marked with `eslint-disable-next-line no-unused-vars` | Low - May be called from HTML | `web/public/submit.js`, HTML files |
| 32 | `web/public/submit.js` | 1130 | `getGovClientHeaders` marked with `eslint-disable-next-line no-unused-vars` | Low - Verify actual usage | `web/public/submit.js` |
| 33 | `web/public/submit.js` | 1281 | `loadScript` marked with `eslint-disable-next-line no-unused-vars` | Low - Utility for future use or remove | `web/public/submit.js` |
| 34 | `web/public/submit.js` | 1351 | `sha256Hex` marked with `eslint-disable-next-line no-unused-vars` | Low - Utility for future use or remove | `web/public/submit.js` |
| 35 | `behaviour-tests/getVatReturn.behaviour.test.js` | 288-322 | Large block of commented out expensive test code | Low - Technical debt | `behaviour-tests/getVatReturn.behaviour.test.js` |
| 36 | `app/services/asyncApiServices.js` | 48-50 | Commented out DynamoDB put with explanation | Low - Code clarity | `app/services/asyncApiServices.js` |
| 37 | `app/services/asyncApiServices.js` | 107-110 | Commented out error handling code | Low - Code clarity | `app/services/asyncApiServices.js` |

**Note:** Items 31-34 are functions marked as unused but may actually be used. Verification needed before removal.

**Updated Total: 37 items**

---

## Delivery Packages

Packages are organized thematically and ordered by: (1) cleanup first, (2) smallest/highest impact, (3) to largest/lowest impact.

### Package 0: Cleanup and Technical Debt Removal

**Theme:** Remove unused functions, commented-out code, and redundant markers
**Size:** Small (2-3 files)
**Testing:** Unit tests
**Estimated Effort:** 1-2 hours
**Priority:** High (reduces noise for future work)

| TODO # | Description |
|--------|-------------|
| 31 | Verify and remove or properly use `checkAuthStatus` (check HTML usage first) |
| 32 | Verify usage of `getGovClientHeaders` and remove eslint-disable if used |
| 33 | Remove `loadScript` if unused or document future use |
| 34 | Remove `sha256Hex` if unused or document future use |
| 35 | Remove commented-out expensive test code in getVatReturn.behaviour.test.js |
| 36 | Clean up commented DynamoDB put with clear documentation |
| 37 | Remove or clarify commented error handling code |

**Acceptance Criteria:**
- No eslint-disable-next-line no-unused-vars comments remain unless justified
- All commented-out code blocks are removed or converted to active code with tests
- Code is cleaner and easier to navigate

---

### Package 1: Simple Infrastructure Cleanup

**Theme:** Remove temporary compatibility code and clean up infrastructure references
**Size:** Small (3-4 files)
**Testing:** Unit + System tests, CDK build
**Estimated Effort:** 2-3 hours
**Priority:** High (low risk, improves maintainability)

| TODO # | Description |
|--------|-------------|
| 9 | Remove alternate paths compatibility code in hmrcVatReturnPost.js |
| 10 | Make strict env validation always on in server.js |
| 22 | Remove BUNDLE_DYNAMODB_TABLE_NAME from customAuthorizerLambdaEnv |
| 25 | Use deploymentDomainName consistently in SubmitSharedNames.java |
| 26 | Remove bundlePost reference wrappers in SubmitSharedNames.java |

**Acceptance Criteria:**
- Compatibility code removed, callers updated to use new API
- Strict validation always enabled, no optional bypass
- Infrastructure code is cleaner with consistent naming
- All tests pass (npm test, ./mvnw clean verify)

---

### Package 2: Test Assertions and Completeness

**Theme:** Add missing test assertions and response validations
**Size:** Small (4 files)
**Testing:** Behaviour tests
**Estimated Effort:** 2-4 hours
**Priority:** High (improves test reliability)

| TODO # | Description |
|--------|-------------|
| 12 | Add response code count assertions in submitVat.behaviour.test.js:572 |
| 13 | Add response code count assertions in submitVat.behaviour.test.js:602 |
| 15 | Capture exception failures in DynamoDB (getVatObligations:759) |
| 16 | Capture exception failures in DynamoDB (getVatObligations:760) |
| 17 | Add deeper inspection of expected responses in postVatReturn.behaviour.test.js |
| 21 | Add deeper inspection of expected responses in getVatReturn.behaviour.test.js |

**Acceptance Criteria:**
- All response codes are properly counted and asserted
- Exception scenarios are captured in DynamoDB and verified
- Test assertions provide clear failure messages
- npm run test:allBehaviour passes

---

### Package 3: File Organization and Minor Refactoring

**Theme:** Reorganize files and clarify code structure
**Size:** Small (3-4 files)
**Testing:** Browser + Behaviour tests
**Estimated Effort:** 2-3 hours
**Priority:** Medium (improves organization)

| TODO # | Description |
|--------|-------------|
| 2 | Clarify if OAuth flow branches are the same in viewVatReturn.html |
| 3 | Move submitVatCallback.html to /hmrc/callback.html |
| 7 | Switch deploy-environment.yml to use deploy-cdk-stack.yml |

**Acceptance Criteria:**
- OAuth flow logic is clear and potentially consolidated
- File is moved to correct location, all references updated
- Workflow uses consistent reusable workflow pattern
- All tests pass including behaviour tests

---

### Package 4: Workflow and Deployment Improvements

**Theme:** Improve CI/CD workflows and deployment reliability
**Size:** Medium (2 files)
**Testing:** Manual workflow testing
**Estimated Effort:** 3-4 hours
**Priority:** Medium (improves deployment safety)

| TODO # | Description |
|--------|-------------|
| 5 | Derive httpApiUrl from shared names instead of parsing JSON |
| 6 | Implement rollback on test failure in deploy workflow |

**Acceptance Criteria:**
- API URL is consistently derived from shared naming pattern
- Failed deployments automatically roll back to last known good deployment
- Parameter store tracks last successful deployment
- Deployment workflow is more reliable

---

### Package 5: HEAD Request Fix

**Theme:** Fix HEAD request handling in bundle enforcement
**Size:** Small (3 files)
**Testing:** Unit tests
**Estimated Effort:** 2-3 hours
**Priority:** Medium (correctness)

| TODO # | Description |
|--------|-------------|
| 8 | Fix HEAD request handling - extractRequest doesn't return method property |

**Acceptance Criteria:**
- extractRequest includes method from event.requestContext.http.method
- HEAD requests return 200 OK as expected
- Unit test for HEAD request passes
- All existing tests still pass

---

### Package 6: Documentation Updates

**Theme:** Complete HMRC approval documentation
**Size:** Medium (2-3 files)
**Testing:** Manual review
**Estimated Effort:** 3-5 hours
**Priority:** Medium (required for production approval)

| TODO # | Description |
|--------|-------------|
| 27 | Document VRN used for testing in MTD_DIY_ACCOUNTING_SUBMIT.md |
| 28 | Export and document CloudWatch logs or local debug logs |
| 29 | Complete TODO for approval section with real evidence |

**Acceptance Criteria:**
- Test VRN is documented with creation method
- Sample logs exported showing fraud prevention headers
- Approval checklist is complete with evidence
- Documentation is ready for HMRC submission

---

### Package 7: Non-Sandbox Production Testing Support

**Theme:** Enable behaviour tests to run against production credentials
**Size:** Medium (4 files)
**Testing:** Behaviour tests
**Estimated Effort:** 4-6 hours
**Priority:** Medium (test coverage)

| TODO # | Description |
|--------|-------------|
| 11 | Support non-sandbox production testing in submitVat.behaviour.test.js |
| 14 | Support non-sandbox production testing in getVatObligations.behaviour.test.js |
| 18 | Support non-sandbox production testing in bundles.behaviour.test.js |

**Acceptance Criteria:**
- Tests can run in both sandbox and production mode
- Environment detection logic handles production credentials
- Guest bundle logic works correctly in non-sandbox mode
- All behaviour tests pass in both modes

---

## Summary Statistics

| Package | Theme | Size | TODOs | Priority | Effort (hours) |
|---------|-------|------|-------|----------|----------------|
| 0 | Cleanup | Small | 6 | High | 1-2 |
| 1 | Infrastructure Cleanup | Small | 5 | High | 2-3 |
| 2 | Test Assertions | Small | 6 | High | 2-4 |
| 3 | File Organization | Small | 3 | Medium | 2-3 |
| 4 | Workflow Improvements | Medium | 2 | Medium | 3-4 |
| 5 | HEAD Request Fix | Small | 1 | Medium | 2-3 |
| 6 | Documentation | Medium | 3 | Medium | 3-5 |
| 7 | Non-Sandbox Testing | Medium | 3 | Medium | 4-6 |

**Total: 37 TODOs across 13 packages**

---

## Notes for AI Agent Execution

### Package Sizing Philosophy

Each package is sized to be completable within a single PR by an AI agent similar to GitHub Copilot. Sizing considers:
- **Scope:** Number of files and LOC changed
- **Complexity:** Architectural understanding required
- **Testing:** Types and duration of tests needed
- **Risk:** Potential for breaking changes

### Testing Strategy per Package

- **Unit-only packages (0, 1, 5):** Run `npm run test:unit` (~4s)
- **System packages (9):** Run `npm test` (~10s)
- **CDK packages (1, 4, 12):** Run `./mvnw clean verify` (~2min)
- **Behaviour packages (2, 3, 7, 8):** Run `npm run test:allBehaviour` (~5-10min)
- **Full validation:** Run all three test suites in sequence

### Dependency Graph

```
Package 0 (Cleanup) → Can be done independently
Package 1 (Infra Cleanup) → Can be done independently
Package 2 (Test Assertions) → Can be done independently
Package 3 (File Org) → Can be done independently
Package 4 (Workflow) → Depends on Package 1 (shared names)
Package 5 (HEAD Fix) → Can be done independently
Package 6 (Docs) → Depends on Package 11 (MFA) for complete evidence
Package 7 (Non-Sandbox) → Can be done independently
```

### Recommended Execution Order

1. **Package 0** - Cleanup (reduces noise)
2. **Package 1** - Infrastructure Cleanup (enables Package 4)
3. **Package 2** - Test Assertions (improves test reliability)
4. **Package 5** - HEAD Request Fix (simple correctness fix)
5. **Package 3** - File Organization (simple refactor)
6. **Package 4** - Workflow Improvements (deployment safety)
7. **Package 7** - Non-Sandbox Testing (enables Package 8)

---

**End of Document**
