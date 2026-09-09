<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Stability Fixes Plan

**Created**: 17 February 2026
**Status**: All issues coded and validated locally (not yet pushed)
**Issues**: #709, #708, #688, plus Issue 4 (OIDC cleanup)

---

## Progress Summary

| Issue | Status | Validated |
|-------|--------|-----------|
| Issue 2: npm audit `--omit=dev` (#708) | **DONE** | Unit tests pass, compliance report verified |
| Issue 3: User data deletion workflows (#688) | **DONE** | Unit tests pass, workflows created |
| Issue 4: Remove old OIDC "Antonycc" references | **DONE** | Coded, not yet validated via CI |
| Issue 1: Generate Passes (#709) | **DONE** | All phases A-E complete; both behaviour tests pass (digital + physical) |

### Issue 4: Remove Old OIDC References (added mid-session)

Old `oidc.antonycc.com` / "Antonycc" references removed from 4 files:
- `web/public/auth/login.html` — 3 log/comment references changed
- `web/public/auth/loginWithCognitoCallback.html` — title and h1 changed
- `infra/main/java/.../AuthStack.java` — comment changed
- `app/bin/provision-user.mjs` — usage example comments changed

Carefully preserved `antonycc` GitHub username references (different context).

### Issue 1 Phase Progress

| Phase | Status | Details |
|-------|--------|---------|
| A: Backend + CDK | **DONE** | passGeneratePost.js, passMyPassesGet.js, CDK stacks, unit tests all pass |
| B: Digital pass page | **DONE** | `web/public/passes/generate-digital.html` created with QR generation |
| C: Physical pass page | **DONE** | `web/public/passes/generate-physical.html` created with product type selector |
| D: My Generated Passes | **DONE** | Section added to `bundles.html` with pagination |
| E: Behaviour tests | **DONE** | Both digital + physical pass tests pass (2 passed, 56.8s) |

### Bugs Found and Fixed During Validation

1. **Double-hashing bug** (passGeneratePost.js): Was passing `hashedSub` to `consumeTokenForActivity()` which hashes internally → no bundles found. Fixed: pass `userSub` instead.
2. **Token count bug** (consumeToken + tokenEnforcement): `consumeToken()` hardcoded count=1 regardless of activity's `tokenCost`. Digital pass test expected 90 remaining (100-10) but got 99 (100-1). Fixed: added `count` parameter to `consumeToken()`, and `consumeTokenForActivity()` now passes `tokenCost`.
3. **DynamoDB ConditionExpression** (consumeToken): Attempted arithmetic (`-`) in ConditionExpression which DynamoDB doesn't support. Reverted to original attribute comparison; pre-check in `consumeTokenForActivity` handles multi-token validation.
4. **Product type mismatch**: Behaviour test expected `data-product-type="tshirt"` but HTML had `"t-shirt"`. Fixed HTML.

---

## Issue 1: Generate Passes — Full Feature Implementation (#709)

**Label**: launch

**Problem**: The "Generate Digital Pass" and "Generate Physical Pass" activity buttons are defined in the catalogue (`submit.catalogue.toml`) and rendered dynamically on the home page for entitled users (`resident-pro`, `resident-pro-comp`). Clicking them navigates to `passes/generate-digital.html` and `passes/generate-physical.html` — pages that don't exist in S3, returning an `AccessDenied` XML error.

**Scope**: Surface the existing pass generation capability in the app UI. The backend service layer (`passService.js`), repository (`dynamoDbPassRepository.js`), passphrase generator, pass type definitions, and even behaviour test step helpers all already exist — the GitHub Actions workflow already does the full generate-with-QR flow. This is wiring up two HTML pages and one new Lambda endpoint to call existing code, plus a GSI for listing "my passes". Referral tracking, affiliate bonuses, ambassador tiers, and campaign passes are out of scope.

**Existing infrastructure** (already built):
- `app/services/passService.js` — `generatePassphrase()`, `buildPassRecord()`, `createPass()`, `checkPass()`, `redeemPass()`
- `app/lib/passphrase.js` — 1296-word curated wordlist, generates 4-word memorable passphrases
- `app/data/dynamoDbPassRepository.js` — `putPass()`, `getPass()`, `redeemPass()`, `revokePass()`
- `app/functions/account/passAdminPost.js` — Admin-only pass creation Lambda
- `submit.passes.toml` — Pass type definitions including `digital-pass` and `physical-pass`
- `web/public/submit.catalogue.toml` — Activity definitions (`generate-pass-digital`, `generate-pass-physical`)
- `.github/workflows/generate-pass.yml` — Admin pass generation via GitHub Actions with QR code artifacts
- `behaviour-tests/steps/behaviour-pass-generation-steps.js` — Pre-built test step helpers
- `qrcode` npm package already a project dependency (client-side SVG generation)

**Pass type definitions** (from `submit.passes.toml`):

| Pass Type | Bundle Granted | Validity | Max Uses | Token Cost |
|-----------|---------------|----------|----------|------------|
| `digital-pass` | `day-guest` | 7 days | 20 | 3 tokens |
| `physical-pass` | `day-guest` | Unlimited | 1 | 3 tokens |

**User requirements** (from issue #709):
- Generate the 4-word pass code with a copy-to-clipboard call to action for both the code and the URL variant
- PNG and SVG should be downloadable as a zip
- SVG variant displayed on the page (users will screenshot it)
- Digital pass: note it's short-lived, for sharing, limited activations
- Physical pass: note the long lifespan, limited daily use, suitability for hard copy, "merch coming soon"

**Design reference**: `_developers/backlog/PLAN_GENERATE_PASS_ACTIVITY.md` (full spec)

### Phase A: Backend — Pass Generation API

#### A1. `POST /api/v1/pass/generate` Lambda (`app/functions/account/passGeneratePost.js`)

Authenticated endpoint. Requires bundle entitlement and sufficient tokens.

**Flow**:
1. Verify user has an entitled bundle (`resident-pro`, `resident-pro-comp`, or `test`)
2. Read pass type definition from `submit.passes.toml` based on `passTypeId` in request body
3. Verify user has >= `tokenCostToIssue` tokens remaining
4. Consume tokens via `consumeToken()` (atomic DynamoDB operation)
5. Generate 4-word passphrase via `generatePassphrase(4)`
6. Create pass record via `createPass()` with `issuedBy = hashedSub`
7. Return pass code, URL, pass type details, and remaining token count

**Request**:
```json
{
  "passTypeId": "digital-pass",
  "notes": "February campaign"
}
```

**Response**:
```json
{
  "code": "tiger-happy-mountain-silver",
  "url": "https://submit.diyaccounting.co.uk/bundles.html?pass=tiger-happy-mountain-silver",
  "passTypeId": "digital-pass",
  "bundleId": "day-guest",
  "validFrom": "2026-02-17T00:00:00Z",
  "validUntil": "2026-02-24T00:00:00Z",
  "maxUses": 20,
  "tokensConsumed": 3,
  "tokensRemaining": 97
}
```

#### A2. `GET /api/v1/pass/my-passes` Lambda (`app/functions/account/passMyPassesGet.js`)

Authenticated endpoint. Lists passes issued by the current user.

**DynamoDB**: Requires a new GSI on the passes table:
- Index name: `issuedBy-index`
- Partition key: `issuedBy` (String — the issuer's hashedSub)
- Sort key: `createdAt` (String — ISO8601 for chronological ordering)
- Projection: ALL

**Query params**: `limit` (default 20, max 50), `nextPageKey` (pagination cursor)

#### A3. CDK infrastructure changes

- **`DataStack.java`**: Add `issuedBy-index` GSI to passes table
- **`AccountStack.java`**: Add `passGeneratePost` and `passMyPassesGet` Lambda functions, API Gateway routes
- **`server.js`**: Register new routes for local development

#### A4. Unit + system tests

- `app/unit-tests/functions/account/passGeneratePost.test.js` — entitlement check, token consumption, pass creation, error cases
- `app/unit-tests/functions/account/passMyPassesGet.test.js` — pagination, GSI query
- System test for full generate + list flow against dynalite

### Phase B: Frontend — Digital Pass Page

#### B1. `web/public/passes/generate-digital.html`

**Content**:
- Heading: "Generate a Digital Pass"
- Explanation: "Create a shareable link that gives anyone free VAT submission access for 7 days. This pass allows up to 20 uses — share it on social media, via email, or in messaging apps."
- Token cost display: "This will use 3 of your N remaining tokens"
- Optional notes field
- "Generate Pass" button (disabled if insufficient tokens)

**On generate success**:
- Display the 4-word passphrase in large text (e.g., `tiger-happy-mountain-silver`)
- Full URL with copy-to-clipboard button: `https://submit.diyaccounting.co.uk/bundles.html?pass=tiger-happy-mountain-silver`
- QR code SVG displayed inline (generated client-side via `qrcode` npm package)
- Download buttons: "Download QR Code (SVG)", "Download QR Code (PNG)"
- Note: "This pass expires in 7 days and can be used 20 times"

#### B2. QR code generation (client-side)

Use the `qrcode` package already in the project:
- Generate SVG from the pass URL
- Error correction level **M** for digital (less physical wear than printed)
- For PNG download, render SVG to canvas and export as PNG blob

### Phase C: Frontend — Physical Pass Page

#### C1. `web/public/passes/generate-physical.html`

**Content**:
- Heading: "Generate a Physical Pass"
- Explanation: "Create a pass for printing on merchandise — t-shirts, mugs, stickers. The QR code works forever with limited scans, making it perfect for a hard copy. Merch ordering coming soon."
- Token cost display
- Product type selector: T-shirt / Mug / Sticker (informational — affects SVG layout)
- "Generate Pass" button

**On generate success**:
- Display the 4-word passphrase stacked vertically in large bold text (front design preview)
- QR code SVG with passphrase text below (back design preview)
- Download as zip: front SVG + back SVG + back PNG
- Note: "This pass has no expiry date but is limited to 1 scan. Perfect for printed merchandise."
- Note: "Merch ordering coming soon — for now, download the designs and use your favourite print service"

#### C2. Physical media SVG templates

**Front SVG**: Four words stacked vertically in clean sans-serif (Inter/Helvetica Neue). No branding — the mysterious words create curiosity.

**Back SVG**: QR code (error correction level **H** for physical durability — scratches, folds, wash cycles) with small passphrase text below for manual entry.

#### C3. Zip download

Client-side zip creation using JSZip (add as dependency if needed, or use Blob-based approach):
- `front.svg` — word stack design
- `back.svg` — QR code design
- `back.png` — QR code raster

### Phase D: "My Generated Passes" section on `bundles.html`

Below existing bundle list and pass redemption sections:

- Heading: "My Generated Passes"
- List of passes issued by the current user (via `GET /api/v1/pass/my-passes`)
- Each card shows: passphrase, type (Digital/Physical), expiry (or "No expiry"), usage (`3 of 20 uses`), [Copy Link] [View QR] buttons
- Physical pass cards additionally show: [Download Front] [Download Back]
- Pagination via "Load more" button or scroll sentinel
- Empty state: "You haven't generated any passes yet. Generate one from the home page activities."

### Phase E: Behaviour tests

Use the pre-built step helpers in `behaviour-tests/steps/behaviour-pass-generation-steps.js`:

- `generatePassActivity.behaviour.test.js` — full E2E:
  1. Login as resident-pro user (via test pass)
  2. Navigate to home page → click "Generate Digital Pass"
  3. Generate a pass → verify code, URL, QR displayed
  4. Copy link → verify clipboard
  5. Navigate to bundles → verify pass appears in "My Generated Passes"
  6. Navigate to home page → click "Generate Physical Pass"
  7. Generate → verify front/back SVG previews, download buttons
  8. Verify token consumption (original balance minus 6)

### Files to Create

| File | Phase | Purpose |
|------|-------|---------|
| `app/functions/account/passGeneratePost.js` | A | User pass generation Lambda |
| `app/functions/account/passMyPassesGet.js` | A | List user's generated passes |
| `web/public/passes/generate-digital.html` | B | Digital pass generation page |
| `web/public/passes/generate-physical.html` | C | Physical pass generation page |
| `app/unit-tests/functions/account/passGeneratePost.test.js` | A | Unit tests |
| `app/unit-tests/functions/account/passMyPassesGet.test.js` | A | Unit tests |
| `behaviour-tests/generatePassActivity.behaviour.test.js` | E | E2E behaviour test |

### Files to Modify

| File | Phase | Changes |
|------|-------|---------|
| `app/data/dynamoDbPassRepository.js` | A | Add `getPassesByIssuer()` for GSI query |
| `app/bin/server.js` | A | Register `/api/v1/pass/generate` and `/api/v1/pass/my-passes` routes |
| `infra/.../DataStack.java` | A | Add `issuedBy-index` GSI to passes table |
| `infra/.../AccountStack.java` | A | Add Lambda functions and API Gateway routes |
| `web/public/bundles.html` | D | Add "My Generated Passes" section |
| `package.json` | E | Add test scripts for generatePassActivity |
| `playwright.config.js` | E | Add test project |

### Out of Scope

- Campaign passes (`campaign-pass` type) — deferred
- Referral tracking (`issuedBy` → referral reward) — deferred
- Affiliate/commission system — deferred
- Ambassador tiers — deferred
- Printful/Printify API integration — manual download for now
- Product mockup generation — deferred

---

## Issue 2: Only Scan Production Dependencies in npm-audit.json (#708)

**Problem**: The compliance suite's npm audit fails with 4 high-severity vulnerabilities, all in devDependencies. The entire vulnerability chain originates from `structured-data-testing-tool` (an SEO validation dev tool):

```
structured-data-testing-tool (devDependency)
  → web-auto-extractor
    → cheerio
      → lodash.pick (Prototype Pollution, GHSA-p6mc-m468-83gw, CVSS 7.4)
```

None of these packages ship to production. `lodash.pick` has `fixAvailable: false` — there is no upstream fix.

**Current audit commands** (in `package.json`):

| Script | Command | Purpose |
|--------|---------|---------|
| `penetration:audit` | `npm audit --audit-level=moderate` | Interactive check (all deps) |
| `penetration:audit-report` | `npm audit --json --audit-level=moderate > npm-audit.json` | JSON report for compliance |

**Current result**: 4 high, 0 critical, 0 moderate, 0 low. 1,022 total deps (192 prod, 831 dev, 74 optional). **All 4 are devDeps.**

**Compliance report threshold** (`scripts/generate-compliance-report.js`): Passes if `critical === 0 && high === 0`.

### Good Practice: Separate Compliance from Awareness

The compliance audit answers: "Is our deployed service vulnerable?" — only production dependencies matter.

A development awareness audit answers: "Are our build tools vulnerable?" — useful to know but not a compliance gate.

These should be two separate concerns:

1. **Compliance audit** (`--omit=dev`): Gates deployment. Must pass (0 high/critical in production deps).
2. **Awareness audit** (all deps): Informational. Logged for visibility but does not block deployment.

### Fix

#### 2.1 Update compliance audit scripts to `--omit=dev`

In `package.json`:

```diff
- "penetration:audit": "mkdir -p web/public/tests/penetration && npm audit --audit-level=moderate"
+ "penetration:audit": "mkdir -p web/public/tests/penetration && npm audit --audit-level=moderate --omit=dev"

- "penetration:audit-report": "mkdir -p web/public/tests/penetration && npm audit --json --audit-level=moderate 2>&1 > web/public/tests/penetration/npm-audit.json 2>&1 || true"
+ "penetration:audit-report": "mkdir -p web/public/tests/penetration && npm audit --json --audit-level=moderate --omit=dev 2>&1 > web/public/tests/penetration/npm-audit.json 2>&1 || true"
```

#### 2.2 Add a separate dev-deps awareness audit (optional, non-blocking)

```json
"penetration:audit-dev": "npm audit --audit-level=moderate || true"
"penetration:audit-dev-report": "mkdir -p web/public/tests/penetration && npm audit --json --audit-level=moderate 2>&1 > web/public/tests/penetration/npm-audit-dev.json 2>&1 || true"
```

This runs alongside but does not contribute to the compliance pass/fail status.

#### 2.3 Update compliance report generator

In `scripts/generate-compliance-report.js`, the npm audit section should:
- Read `npm-audit.json` (production only) for the compliance verdict
- Optionally read `npm-audit-dev.json` for an informational "Development Dependencies" section
- The compliance status is based solely on production deps

#### 2.4 Update compliance workflow

In `.github/workflows/compliance.yml`, the `penetration-audit` job should run the `--omit=dev` variant. Consider adding a separate non-blocking step for the full audit.

#### 2.5 Reduce noise from npm overrides

The existing `overrides` in `package.json` pin `nth-check` and `validator` within `structured-data-testing-tool`. With `--omit=dev`, these overrides become irrelevant to compliance but can remain for development hygiene.

### Validation

- `npm run penetration:audit` passes with 0 vulnerabilities (production deps only)
- `npm run compliance:proxy-report` shows green status for npm audit
- Full audit (`npm audit` without flags) still reports the 4 devDep issues for awareness
- Weekly compliance workflow passes

### Files to Modify

| File | Change |
|------|--------|
| `package.json` | Add `--omit=dev` to compliance audit scripts, add optional dev audit scripts |
| `scripts/generate-compliance-report.js` | Update to handle production-only audit results |
| `.github/workflows/compliance.yml` | Ensure audit job uses updated scripts |

---

## Issue 3: User Data Deletion Workflows (#688)

**Problem**: Cognito native test users (created by `enableCognitoNative` for behaviour tests) accumulate if cleanup fails or is skipped. More broadly, there's no GDPR-compliant user data deletion workflow for any user type.

**User requirement** (from issue #688):
> Delete cognito native users using a GitHub workflow. Take an environment name, use the same names/params we use everywhere. Delete cognito native user data (including HMRC request/responses) and any linked data and receipts, then when that's all done the cognito native users themselves should be deleted.

**User architecture requirement** (from conversation):
> There should be a reusable workflow that takes the user hashed sub and deletes all related data in a GDPR compliant way. Then a scheduled workflow scans Cognito for native auth users and calls it. Then another workflow `delete-user-data-by-email.yml` does the Cognito look-up for social providers then GDPR deletes.

### Current State

**Existing scripts**:
- `scripts/delete-user-data.js` — Takes deployment name + user sub, deletes from bundles + hmrc-api-requests (queries by scan, filters by `item.sub === hashedSub`). Retains receipts for 7-year legal requirement.
- `scripts/delete-cognito-test-user.js` — Deletes a single Cognito user by username
- `scripts/export-user-data.js` — DSAR export: scans tables, exports to JSON

**Issues with `delete-user-data.js`**:
- Uses full table scans (inefficient at scale — should query by `hashedSub` partition key)
- Filters by `item.sub` field (should be `item.hashedSub` — the partition key)
- Only covers 3 of 8 DynamoDB tables (missing: 5 async request tables)
- No multi-version salt support (should try all salt versions for data at old hashes)
- No subscription table cleanup
- Receipt anonymization not implemented (just logged as TODO)

**Test user naming pattern**: All Cognito native test users have email format `test-{timestamp}-{hex}@test.diyaccounting.co.uk`. They can be identified by:
1. Email domain `@test.diyaccounting.co.uk`, or
2. Cognito attribute `cognito:user_status = CONFIRMED` with no linked social identity

### Architecture: Three Workflows

```
┌─────────────────────────────────────┐
│  delete-user-data.yml (reusable)    │  ← Core: GDPR-compliant deletion by hashedSub
│  Inputs: deployment, hashedSub      │     Deletes from all 8 DynamoDB tables
│  NOT scheduled — called by others   │     Anonymizes HMRC receipts (7-year retention)
└─────────────┬───────────────────────┘
              │ called by
    ┌─────────┴──────────┐
    │                    │
    ▼                    ▼
┌────────────────┐  ┌──────────────────────────┐
│ cleanup-test-  │  │ delete-user-data-by-      │
│ users.yml      │  │ email.yml                 │
│                │  │                           │
│ SCHEDULED      │  │ MANUAL dispatch           │
│ (daily/weekly) │  │ Input: email, environment │
│                │  │                           │
│ 1. List all    │  │ 1. Look up user in        │
│    Cognito     │  │    Cognito by email       │
│    native      │  │    (any provider)         │
│    test users  │  │ 2. Get user sub           │
│ 2. For each:   │  │ 3. Compute hashedSub      │
│    compute     │  │ 4. Call delete-user-data   │
│    hashedSub   │  │ 5. Delete Cognito user    │
│    → call      │  │                           │
│    delete-     │  │ Use case: GDPR erasure    │
│    user-data   │  │ request from real user    │
│ 3. Delete      │  │ (Google/Apple/Microsoft)  │
│    Cognito     │  │                           │
│    users       │  └──────────────────────────┘
└────────────────┘
```

### Workflow 1: `delete-user-data.yml` (Reusable Core)

**Purpose**: GDPR-compliant deletion of all user data by hashedSub. This is the building block called by other workflows.

**Inputs**:
- `deployment-name` (string, required) — e.g., `prod-cbf0475`
- `hashed-sub` (string, required) — 64-char hex hash
- `environment-name` (string, required) — e.g., `ci`, `prod` (for Secrets Manager access)
- `anonymize-receipts` (boolean, default: true) — anonymize HMRC receipts instead of deleting

**What it deletes** (all 8 hashedSub-keyed tables):

| Table | Sort Key | Deletion Method | Notes |
|-------|----------|----------------|-------|
| `{deployment}-bundles` | `bundleId` | Delete items | Includes subscription records |
| `{deployment}-receipts` | `receiptId` | **Anonymize** (replace hashedSub with `DELETED`) | 7-year HMRC legal retention |
| `{deployment}-hmrc-api-requests` | `id` | Delete items | 90-day TTL handles stragglers |
| `{deployment}-bundle-post-async-requests` | `requestId` | Delete items | 1-hour TTL |
| `{deployment}-bundle-delete-async-requests` | `requestId` | Delete items | 1-hour TTL |
| `{deployment}-hmrc-vat-return-post-async-requests` | `requestId` | Delete items | 1-hour TTL |
| `{deployment}-hmrc-vat-return-get-async-requests` | `requestId` | Delete items | 1-hour TTL |
| `{deployment}-hmrc-vat-obligation-get-async-requests` | `requestId` | Delete items | 1-hour TTL |

**Implementation**: Rewrite `scripts/delete-user-data.js` to:
- Use **query** by `hashedSub` partition key (not full table scan)
- Delete from all 8 tables (not just 3)
- Support multi-version salt: try current hash, then fall back through previous versions
- Implement receipt anonymization: replace `hashedSub` with `DELETED`, strip any PII from receipt content, keep transaction metadata for legal compliance
- Accept `--hashed-sub` as direct input (skip salt computation when called by other workflows that already computed it)
- Dry-run by default, `--confirm` to execute
- Output structured JSON summary for workflow consumption

**GDPR compliance**:
- Data deletion is permanent and irreversible
- HMRC receipts anonymized (not deleted) per 7-year legal retention
- Audit log entry: who requested, when, what was deleted
- Export should be run first (`scripts/export-user-data.js`) if the user requested a DSAR

### Workflow 2: `cleanup-test-users.yml` (Scheduled)

**Purpose**: Automatically clean up Cognito native test users and their associated data.

**Schedule**: Daily at 04:00 UTC (low-traffic window)

**Also**: Manual dispatch with environment input

**Flow**:
1. Assume deployment role
2. Look up Cognito User Pool ID from CloudFormation (`{env}-env-IdentityStack`)
3. Look up deployment name from SSM (`/submit/{env}/last-known-good-deployment`)
4. Initialize salt from Secrets Manager
5. List all Cognito users: `aws cognito-idp list-users --filter "email ^= \"test-\""`
6. Filter to native test users: email matches `test-*@test.diyaccounting.co.uk`
7. For each test user:
   a. Extract `sub` attribute from Cognito user record
   b. Compute `hashedSub = hashSub(sub)` (using current salt version)
   c. Also compute hashes for previous salt versions (for data written before rotation)
   d. Call `delete-user-data.yml` (or invoke the script directly) with the hashedSub
   e. Delete the Cognito user via `AdminDeleteUserCommand`
8. Report summary to GitHub step summary: N users found, M deleted, items removed per table

**Safety**:
- Only targets users with email matching `test-*@test.diyaccounting.co.uk`
- Dry-run mode available (list users without deleting)
- Skip users created in the last hour (might be in-use by a running test)
- Idempotent: deleting an already-deleted user is a no-op

### Workflow 3: `delete-user-data-by-email.yml` (Manual GDPR Erasure)

**Purpose**: Handle GDPR "Right to Erasure" requests from real users (Google/Apple/Microsoft federated).

**Trigger**: Manual dispatch only (requires human authorization for GDPR requests)

**Inputs**:
- `email` (string, required) — the user's email address
- `environment-name` (choice: ci, prod) — target environment
- `confirm` (boolean, default: false) — safety gate

**Flow**:
1. Assume deployment role
2. Look up Cognito User Pool ID from CloudFormation
3. Look up deployment name from SSM
4. Search Cognito for user by email: `aws cognito-idp list-users --filter "email = \"user@example.com\""`
5. If not found → error (user doesn't exist)
6. Extract `sub` attribute from the Cognito user record
7. Initialize salt from Secrets Manager
8. Compute `hashedSub = hashSub(sub)` for current + all previous salt versions
9. **Export user data first** (GDPR requires providing data before deletion): run `export-user-data.js`, upload artifact
10. Call `delete-user-data.yml` (or script) with each hashedSub variant
11. Delete the Cognito user via `AdminDeleteUserCommand`
12. Log: user email, deletion timestamp, items affected — for GDPR compliance record
13. Upload deletion summary as workflow artifact (retained for 7 years for audit trail)

**Safety**:
- Manual dispatch only — no schedule
- `confirm` must be `true` to execute (dry-run by default)
- Exports user data before deletion
- Works for any identity provider (Google, Apple, Microsoft, native)
- The email filter in Cognito searches across all providers

### Script Improvements

The core script `scripts/delete-user-data.js` needs these improvements:

1. **Query instead of scan**: Use `QueryCommand` with `KeyConditionExpression: "hashedSub = :h"` instead of `ScanCommand` + client-side filter
2. **All 8 tables**: Add the 5 async request tables (currently only covers bundles, receipts, hmrc-api-requests)
3. **Composite key handling**: Async tables have `hashedSub` + `requestId` keys; need to query PK then delete each item by PK+SK
4. **Multi-version salt**: Accept either `--user-sub` (compute hash) or `--hashed-sub` (direct). When computing, try all salt versions.
5. **Receipt anonymization**: Replace `hashedSub` with `DELETED`, scrub PII fields from receipt content, preserve transaction metadata
6. **Structured output**: JSON summary suitable for workflow consumption and audit logging
7. **Subscription cleanup**: If user has a Stripe subscription, cancel it before deletion (or at minimum log the subscription ID for manual cancellation)

### Validation

- `cleanup-test-users.yml` runs on schedule and cleans up CI test users
- `delete-user-data-by-email.yml` successfully deletes a known test user in CI
- Data is removed from all 8 DynamoDB tables
- HMRC receipts are anonymized (not deleted)
- Cognito user is deleted last (after all data)
- Workflow artifacts contain deletion summary for audit trail

### Files to Create

| File | Purpose |
|------|---------|
| `.github/workflows/delete-user-data.yml` | Reusable workflow: GDPR deletion by hashedSub |
| `.github/workflows/cleanup-test-users.yml` | Scheduled: clean up Cognito native test users |
| `.github/workflows/delete-user-data-by-email.yml` | Manual: GDPR erasure by email lookup |
| `scripts/cleanup-test-users.js` | Batch scan + delete logic for test users |

### Files to Modify

| File | Changes |
|------|---------|
| `scripts/delete-user-data.js` | Query instead of scan, all 8 tables, multi-version salt, receipt anonymization, structured output |
| `scripts/export-user-data.js` | Add async request tables, multi-version salt support |

---

## Implementation Order

```
Issue 2 (npm audit --omit=dev) — smallest, 1-2 files, independent
    |
Issue 3 (user data deletion workflows) — medium, builds on existing scripts
    |
Issue 1 (pass generation feature) — largest, backend + frontend + CDK + tests
```

Issues 2 and 3 can be done in parallel. Issue 1 is the most involved and benefits from Issue 3 being done first (clean test environment).

---

*Created 17 February 2026. Tracks GitHub issues #709, #708, #688 assigned to @antonycc.*
