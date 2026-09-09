<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Phased Rollout Plan: Frontend Refactoring and Cleanup

This document outlines a phased approach to rolling out changes from the `copilot/refactor-js-code-structure` branch which attempted comprehensive refactoring that proved difficult to debug. This plan breaks the work into testable, low-risk phases.

## Overview of Original Branch Changes

### copilot/refactor-js-code-structure branch
- Similar frontend JS modularization
- Test bundler script (`scripts/bundle-for-tests.js`)
- ES module conversion for HTML pages
- Refactoring summary documentation

## Guiding Principles

1. **One concern per phase** - Each phase addresses a single area
2. **Local testability** - Every phase must pass `npm test` before proceeding
3. **No coupled changes** - Backend and frontend changes are separate phases
4. **Rollback-friendly** - Each phase can be reverted independently

---

## Phase 1: Test Infrastructure Preparation

**Goal**: Prepare test infrastructure to support ES modules without breaking existing tests.

**Changes**:
1. Create `scripts/bundle-for-tests.js` (from copilot branch)
2. Update `package.json` to add `prebundle` scripts
3. Add `web/public/submit.bundle.js` to `.gitignore`

**Files to create/modify**:
```
scripts/bundle-for-tests.js          (new)
package.json                         (add bundle scripts)
.gitignore                           (add submit.bundle.js)
```

**Test command**:
```bash
npm test
```

**Success criteria**:
- All unit tests pass
- Bundle script generates `web/public/submit.bundle.js`
- No functional changes to the application

**Rollback**: Remove scripts and revert package.json

---

## Phase 2: Extract Utility Modules (Utils Layer)

**Goal**: Extract pure utility functions into separate modules.

**Changes**:
1. Create `web/public/lib/utils/` directory structure
2. Extract JWT utilities: `jwt-utils.js`
3. Extract crypto utilities: `crypto-utils.js`
4. Extract storage utilities: `storage-utils.js`
5. Extract DOM utilities: `dom-utils.js`
6. Extract correlation utilities: `correlation-utils.js`
7. Update `submit.js` to import from utils and re-export on `window`
8. Update bundle script to include new modules

**Files to create**:
```
web/public/lib/utils/jwt-utils.js
web/public/lib/utils/crypto-utils.js
web/public/lib/utils/storage-utils.js
web/public/lib/utils/dom-utils.js
web/public/lib/utils/correlation-utils.js
```

**Files to modify**:
```
web/public/submit.js                 (import utils, export on window)
scripts/bundle-for-tests.js          (include new modules)
```

**Test commands**:
```bash
npm test
npm run test:submitVatBehaviour-proxy > target/behaviour.txt 2>&1
grep -i -n -E 'fail|error' target/behaviour.txt
```

**Success criteria**:
- All unit tests pass
- Behaviour tests pass
- `submit.js` is smaller but functionally identical
- All `window.*` exports still work

**Rollback**: Delete lib/utils/ directory, revert submit.js

---

## Phase 3: Extract Service Modules (Services Layer)

**Goal**: Extract business logic into service modules.

**Changes**:
1. Create `web/public/lib/services/` directory
2. Extract auth service: `auth-service.js`
3. Extract API client: `api-client.js`
4. Update `submit.js` to import from services and re-export on `window`
5. Update bundle script

**Files to create**:
```
web/public/lib/services/auth-service.js
web/public/lib/services/api-client.js
```

**Files to modify**:
```
web/public/submit.js                 (import services, export on window)
scripts/bundle-for-tests.js          (include new modules)
```

**Test commands**:
```bash
npm test
npm run test:submitVatBehaviour-proxy > target/behaviour.txt 2>&1
grep -i -n -E 'fail|error' target/behaviour.txt
```

**Success criteria**:
- All tests pass
- Token refresh still works
- 401/403 handling still works
- Async polling still works

**Rollback**: Delete lib/services/ directory, revert submit.js

---

## Phase 4: Additional Service Modules (Optional)

**Goal**: Extract HMRC and catalog functionality into dedicated services.

**Changes**:
1. Create `hmrc-service.js` for HMRC-specific functions
2. Create `catalog-service.js` for bundle/activity functions
3. Update imports in submit.js

**Files to create**:
```
web/public/lib/services/hmrc-service.js
web/public/lib/services/catalog-service.js
```

**Test commands**:
```bash
npm test
npm run test:submitVatBehaviour-proxy > target/behaviour.txt 2>&1
```

**Success criteria**:
- VAT submission still works
- HMRC auth flow still works
- Bundle checking still works

**Rollback**: Delete new service files, revert submit.js

---

## Phase 5: Convert HTML to ES Modules

**Goal**: Update HTML files to load submit.js as an ES module.

**Changes**:
1. Change `<script src="./submit.js">` to `<script type="module" src="./submit.js">`
2. Update all HTML files in `web/public/`

**Files to modify**:
```
web/public/index.html
web/public/about.html
web/public/auth/login.html
web/public/auth/loginWithCognitoCallback.html
web/public/auth/loginWithMockCallback.html
web/public/hmrc/vat/submitVat.html
web/public/hmrc/vat/vatObligations.html
web/public/hmrc/vat/viewVatReturn.html
web/public/account/bundles.html
web/public/activities/submitVatCallback.html
... (all HTML files)
```

**Test commands**:
```bash
npm test
npm run test:browser
npm run test:submitVatBehaviour-proxy > target/behaviour.txt 2>&1
```

**Success criteria**:
- All pages load correctly in browser
- No console errors about module loading
- All interactive features work

**Rollback**: Revert HTML files to use regular script tags

---

## Recommended Execution Order

```
Phase 1 (Test Infrastructure) ─────────────────────────┐
                                                       │
Phase 2 (Utils Layer) ─────────────────────────────────┤
                                                       │
Phase 3 (Services Layer) ──────────────────────────────┤
                                                       │
Phase 4 (Additional Services) [Optional] ──────────────┤
                                                       │
Phase 5 (ES Modules in HTML) ──────────────────────────┤
                                                       │
```

## Per-Phase Checklist

For each phase:

- [ ] Create branch: `git checkout -b claude/phase-N-description`
- [ ] Make changes
- [ ] Run `npm test` - all pass
- [ ] Run `./mvnw clean verify` - all pass
- [ ] Run behaviour tests - all pass
- [ ] Commit with descriptive message
- [ ] Push and create PR
- [ ] Review diff carefully
- [ ] Merge only after tests pass in CI

## Quick Reference: Key Files

| Category | Files |
|----------|-------|
| Frontend entry | `web/public/submit.js` |
| Utils layer | `web/public/lib/utils/*.js` |
| Services layer | `web/public/lib/services/*.js` |
| Test bundler | `scripts/bundle-for-tests.js` |
| HTML pages | `web/public/**/*.html` |

## Troubleshooting Common Issues

### Tests fail after extracting modules
- Check that all functions are exported on `window`
- Verify bundle script includes new modules
- Check import paths use `.js` extension

### ES module loading fails in browser
- Ensure MIME type is correct for .js files
- Check for circular import dependencies
- Verify script tags have `type="module"`

### Behaviour tests timeout
- Check async polling is working
- Verify token refresh logic
- Look for missing `await` statements

### Lambda functions fail
- Check header names are case-correct
- Verify context is being set properly
- Check for missing requestId generation

---

## Notes

- Both original branches have comprehensive changes that are largely compatible
- The `copilot/refactor-js-code-structure` branch has better test bundling
- This plan cherry-picks the best of both approaches
- Phases 4 and 7 are optional and can be skipped for faster rollout
