<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Plan: Stabilize `leanbuild` Branch and Merge to `main`

**Created**: 15 February 2026
**Status**: Pipeline monitoring — 3 workflows deploying
**Branch**: `leanbuild`
**Goal**: Get all CI green, fix any broken tests, merge to `main`

---

## What Changed (5 commits on `leanbuild` vs `main`)

### Commit 1: `985b1611` — Move ECR to environment level (INFRASTRUCTURE)
**Risk: HIGH** — Major infrastructure refactor

- **Created `EcrStack.java`** (environment-level) to replace per-deployment `DevStack.java`
- **Deleted `DevStack.java`** entirely
- ECR repos renamed: `{deployment}-app-ecr` → `{env}-env-ecr` (both eu-west-2 and us-east-1)
- `SubmitSharedNames.java`: ECR naming now uses `envResourceNamePrefix`
- `SubmitApplication.java`: Removed DevStack fields and instantiation
- `SubmitEnvironment.java`: Added EcrStack instantiation for both regions
- `deploy-environment.yml`: Added `deploy-ecr` and `deploy-ecr-ue1` jobs
- `deploy.yml`: Removed `deploy-dev` and `deploy-dev-ue1` jobs, updated push-images ECR repo names
- `destroy.yml`: Removed DevStack from cleanup
- `selfDestruct.js` + tests: Removed `DEV_STACK_NAME` env var

**What could break:**
- ECR repos must exist (from deploy-environment) before push-images runs in deploy.yml
- Old DevStack deletion could fail if ECR repo has images and removal policy doesn't handle it
- Lambda functions referencing old ECR ARN strings
- First deploy ordering: environment stacks MUST complete before application deploy pushes images

### Commit 2: `7f5619b2` — Lean app deployment script (NEW FEATURE)
**Risk: MEDIUM**

- New `scripts/deploy-app.js` (576 lines) — direct Lambda + S3 deploy without CDK
- New workflow `.github/workflows/deploy-app.yml` (780 lines)
- New npm scripts: `deploy:app-ci`, `deploy:app-prod`
- Updates to `CLAUDE.md` documenting the lean deploy workflow
- `.env.ci` updated with deployment config

**What could break:**
- New workflow file syntax errors
- deploy-app.js untested against real AWS (first real run)
- ECR repo name references must match new `{env}-env-ecr` naming

### Commit 3: `aa0b9c73` — Stripe redirect URL fix (BUG FIX)
**Risk: LOW**

- `billingCheckoutPost.js`: Changed `DIY_SUBMIT_BASE_URL` resolution to use canonical public URL instead of deployment-specific URL
- Stripe now redirects to `submit.diyaccounting.co.uk` (prod) or `ci-submit...` (CI) instead of `prod-3ce3e14.submit...`

**What could break:**
- Unlikely — straightforward URL fix

### Commit 4: `bf422163` — Stripe price ID + remove localStorage viewer (MIXED)
**Risk: MEDIUM**

- `.env.ci` updated with Stripe price ID
- Removed `web/public/widgets/localstorage-viewer.js` (138 lines deleted)
- Removed `<script>` tags for localstorage-viewer from **all HTML files** (14+ files)
- `web/public/developer-mode.js`: Major rework (86 lines removed, new sandbox auto-detect logic added)
  - `developer-mode.js` now sets `sessionStorage.hmrcAccount = "sandbox"` based on bundle qualifiers
  - Removed old localStorage viewer injection code
- `web/public/usage.html`: Enhanced with 84+ lines of new usage display code
- `web/public/auth/signed-out.html`: Layout changes
- `web/public/submit.js`: 2 lines removed
- `web/public/widgets/auth-status.js`: 10 lines changed
- `web/public/lib/utils/correlation-utils.js`: Minor change
- `behaviour-tests/helpers/gotoWithRetries.js`: Added 7 lines
- `app/lib/activityAlert.js`: 10 lines changed (Telegram alerting)
- `app/functions/ops/activityTelegramForwarder.js`: 11 lines changed
- Multiple new/updated unit tests for activityAlert and Telegram forwarder

**What could break:**
- Removing localstorage-viewer from all HTML pages — if any page relied on it for functionality (unlikely, was debug tool)
- developer-mode.js sandbox auto-detect — race condition if bundles API call hasn't completed when page needs sandbox state
- Behaviour tests that rely on hmrcAccount sessionStorage being set — now depends on async `userHasSandboxBundle()` completing

### Commit 5: `fd751d6d` — Stripe price ID + sandbox auto-detect in checkout (LATEST)
**Risk: MEDIUM**

- `billingCheckoutPost.js`: Now calls `getUserBundles()` to auto-detect sandbox mode from bundle qualifiers instead of requiring explicit `sandbox: true` in request body
- `bundles.html`: Still sends `sandbox: true` from sessionStorage as a fallback
- `behaviour-bundle-steps.js`: Removed explicit `sandbox` parameter from checkout API call (server-side auto-detects)
- `behaviour-hmrc-vat-steps.js`: 4 separate locations now `waitForFunction()` on `sessionStorage.hmrcAccount === "sandbox"` instead of setting it directly
- New unit test for sandbox auto-detection via bundle qualifiers
- System test mock for `getUserBundles`

**What could break:**
- `billingCheckoutPost.js` now makes an extra DynamoDB call (`getUserBundles`) — could fail if table/permissions not set up
- Race condition in behaviour tests: `waitForFunction` with 10s timeout on sessionStorage being set by async developer-mode.js
- If `developer-mode.js` sandbox auto-detect fails silently, tests will timeout waiting for sessionStorage

---

## Workflow Results (Feb 15, 02:11 UTC push)

### 1. `test` workflow — Run ID: `22028051373` — **SUCCESS**
All 28 jobs passed including CDK synth (both CI and prod), unit tests, system tests, and all simulator behaviour tests.

### 2. `deploy environment` workflow — Run ID: `22028051387` — **SUCCESS**
All 30 jobs passed. EcrStack created successfully in both eu-west-2 and us-east-1. This was the first deployment of the new environment-level ECR stacks.

### 3. `deploy` workflow — Run ID: `22028051402` — **SUCCESS** (after re-run)
- All 161 jobs passed (141 success, 19 skipped, 1 re-run)
- **SelfDestructStack** initially failed (stack in `DELETE_IN_PROGRESS` from previous deployment's self-destruct timer) — re-run succeeded after deletion completed
- All CDK stacks deployed: Auth, Account, HMRC, Billing, API, Ops, Edge, Publish, SelfDestruct
- Push-images succeeded with new `ci-env-ecr` repo name (ECR migration confirmed)
- All CI synthetic tests passed: auth, payment, submitVat, tokenEnforcement, getVatObligations, postVatReturn, vatSchemes, bundles, compliance, passRedemption, gateway, spreadsheets, simulator, help, generatePassActivity, vatValidation, postVatReturnFraudPreventionHeaders

### Previous Run (baseline): `22026545416` — **SUCCESS** (29 min, completed ~00:37 UTC)
All jobs succeeded. This was the last successful deploy from leanbuild.

---

## Risk Matrix

| Risk | Likelihood | Impact | Commits | Mitigation |
|------|-----------|--------|---------|------------|
| ECR repo naming mismatch | Medium | HIGH — blocks all Lambda deploys | 985b1611 | Check push-images job uses `{env}-env-ecr` |
| EcrStack first deploy fails | Low | HIGH — blocks ECR repo creation | 985b1611 | Check deploy-environment logs for CloudFormation errors |
| Old DevStack orphaned resources | Low | Medium — manual cleanup needed | 985b1611 | DevStack has DESTROY removal policy |
| Sandbox auto-detect race condition | Medium | Medium — behaviour tests timeout | fd751d6d, bf422163 | 10s timeout in waitForFunction should be enough |
| getUserBundles DynamoDB call fails | Low | Medium — checkout broken | fd751d6d | Lambda has DynamoDB permissions already |
| Simulator tests fail (no real bundles DB) | Medium | Low — simulator uses mocks | fd751d6d | System test already mocks getUserBundles |
| deploy-app.yml workflow syntax | Low | None for main pipeline | 7f5619b2 | New workflow, only runs on workflow_dispatch |

---

## Monitoring Checklist

### Phase 1: Test + Environment Deploy — DONE
- [x] `test` workflow completes — all unit/system/CDK synth pass
- [x] `deploy environment` completes — EcrStack created successfully in both regions
- [x] ECR repos exist: `ci-env-ecr` (eu-west-2) and `ci-env-ecr-us-east-1` (us-east-1)
- [x] Simulator behaviour tests pass (sandbox auto-detect changes)

### Phase 2: Main Deploy — DONE
- [x] `deploy` workflow starts (unblocked by test + environment)
- [x] `push-images` succeeds — Docker image pushed to new ECR repo name
- [x] CDK deploy succeeds — no DevStack reference errors
- [x] Lambda functions deploy with correct image URIs
- [x] Web assets deployed (localstorage-viewer removed, developer-mode.js updated)
- [x] CloudFront invalidation completes
- [x] SelfDestructStack re-run after DELETE_IN_PROGRESS timing race — succeeded

### Phase 3: Synthetic Tests (post-deploy) — DONE
- [x] `submitVatBehaviour-ci` passes — sandbox HMRC via auto-detected bundle qualifiers
- [x] `paymentBehaviour-ci` passes — Stripe checkout with correct price ID
- [x] `tokenEnforcementBehaviour-ci` passes
- [x] `authBehaviour-ci` passes
- [x] All other synthetic tests pass (17 suites total, all green)

### Phase 4: Merge Readiness
- [x] All 3 workflows green
- [x] No regressions from previous successful deploy
- [x] ECR migration clean (old DevStack resources handled)
- [ ] Commit storage allowlist improvement (description + remove legacy authState key)
- [ ] PR to main

---

## Rollback Strategy

If the deploy fails:
1. **ECR naming issue**: Quick fix — update `SubmitSharedNames.java` ECR name references
2. **DevStack deletion fails**: May need `RemovalPolicy` adjustment or manual cleanup
3. **Sandbox auto-detect breaks tests**: Revert to explicit `sandbox: true` in request body (commits fd751d6d + bf422163)
4. **Nuclear option**: Revert to main (last known good state) and cherry-pick individual fixes

---

*Auto-refreshing: Check `gh run list --branch leanbuild --limit 5` for latest status*
