<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Passes, Tokens & Campaign - Phased Delivery Plan (V2)

> **GitHub Issue**: [#560](https://github.com/antonycc/submit.diyaccounting.co.uk/issues/560)
> **Source of truth**: `web/public/submit.catalogue.toml`
> **Previous plan**: `PLAN_PASSES.md` (superseded by this document)
> **Campaign analysis**: `_developers/archive/campaign.md`

## Overview

This plan delivers three interrelated features in layered phases, building from the backend outward so each phase provides a testable, deployable increment without breaking changes.

| Feature | Catalogue field | Purpose |
|---------|----------------|---------|
| **Passes** | `display = "on-pass"`, `allocation = "on-email-match"` | Control access via invitation codes (four-word passphrases) |
| **Tokens** | `tokens`, `tokensGranted`, `tokenRefreshInterval` | Metered HMRC API usage per bundle |
| **Campaign** | (new) | User-issued passes, referral tracking, sign-up incentives |

Complete new user pass journey

1. User clicks pass URL → bundles.html?pass=alpha-bravo-charlie-delta
2. Not logged in → pendingPass + postLoginRedirect stored in sessionStorage
3. Message: "Please log in to redeem your pass."
4. User clicks "Log in" → Cognito OAuth flow
5. Callback checks postLoginRedirect → redirects to bundles.html?pass=alpha-bravo-charlie-delta
6. bundles.html loads, user now authenticated, ?pass=CODE detected → auto-redeems
7. Bundle granted, pass code cleared from URL and sessionStorage


## What Already Exists

| Component | Status |
|-----------|--------|
| Catalogue TOML with bundles, activities, display rules | Implemented |
| `productCatalog.js` - parse catalogue, filter bundles/activities | Implemented |
| `bundleManagement.js` - enforce bundles, path matching | Implemented |
| `bundleGet.js`, `bundlePost.js`, `bundleDelete.js` Lambdas | Implemented |
| `dynamoDbBundleRepository.js` - DynamoDB CRUD for bundles | Implemented |
| `DataStack.java` - Bundles table in DynamoDB | Implemented |
| `bundles.html` - bundle management UI | Implemented |
| `allocation = "on-request"` and `"automatic"` flows | Implemented |
| Per-user bundle uniqueness (one of each type per user) | Implemented |
| Bundle `cap` field (global capacity limit) | Placeholder (per-user no-op); Phase 2.9 |
| Token/credit fields in catalogue | Documented but not enforced |
| `display = "on-pass"` in catalogue | Documented but not enforced |
| `allocation = "on-email-match"` in catalogue | Documented but not enforced |
| Passes DynamoDB table | Not started |
| Pass Lambdas (get, post, admin) | Not started |
| Pass redemption UI | Not started |
| Token tracking/consumption | Not started |
| Campaign/referral system | Not started |

## Bundle Hierarchy (from catalogue)

```
                    ALL USERS
                        │
                 ┌──────┴──────┐
                 ▼             ▼
            ┌─────────┐  ┌──────────────┐
            │ default  │  │     help     │
            │(auto)    │  │   about.html │
            └─────────┘  └──────────────┘
                 │
    ┌────────────┼─────────────┬────────────────┐
    ▼            ▼             ▼                ▼
┌────────┐ ┌──────────┐ ┌────────────────┐ ┌─────────────┐
│  test  │ │ day-guest │ │ invited-guest  │ │resident-pro │
│on-pass │ │on-request│ │ on-email-match │ │on-subscript.│
│sandbox │ │ prod API │ │   on-pass      │ │  prod API   │
│  P1D   │ │ P1D, 3tk │ │ P1M, 3tk/mo   │ │ 100tk/mo    │
└────────┘ └──────────┘ ├────────────────┤ └─────────────┘
                        │ resident-guest │
                        │ on-email-match │
                        │   on-pass      │
                        │ no expiry,3/mo │
                        └────────────────┘
```

## What we did

Claude Code's write up of the implementation:
```
  Excluding vendored specs and test reports: ~10,200 lines of new code across 152 files.

  Scope of delivery

  New backend services:
  - Pass validation API (passGet, passPost, passAdminPost)
  - Token enforcement service with per-submission consumption
  - Bundle capacity enforcement and reconciliation
  - DynamoDB repositories for passes, capacity tracking
  - Passphrase generation, email hashing
  - Product catalog with on-pass filtering

  New infrastructure (CDK/Java):
  - Pass admin Lambda + API Gateway endpoint
  - Pass validation Lambda
  - Bundle capacity reconciliation Lambda
  - CloudWatch metrics dashboard for capacity tracking
  - DynamoDB tables for passes and capacity
  - IAM permissions across multiple stacks

  Frontend:
  - Token balance display in header
  - Token cost display and exhaustion handling on submit page
  - Pass redemption UI with post-login redirect
  - Bundle page reworked with pass-based acquisition

  CI/CD pipeline:
  - New generate-pass.yml workflow with 4 trigger methods
  - Per-test Cognito user creation (eliminating shared-user race conditions)
  - Params normalisation across all 6 workflows
  - Fail-fast error detection utility for behaviour tests
  - Local pass generation script

  Tests:
  - 3 new behaviour test suites (passRedemption, tokenEnforcement, bundles rework)
  - System tests for pass redemption, token consumption, bundle capacity
  - Unit tests for pass service, token enforcement, passphrase, email hash

  Documentation:
  - Phased delivery plan, payment integration plan
  - Repository restructuring (docs, error pages, help pages)

  Estimation perspective

  A seasoned team would likely scope this as a 2-3 sprint effort (4-6 weeks) for a team of 3-4 engineers, accounting for:

  - Architecture & design (pass system, token economy, capacity model) — typically a spike or design phase alone
  - 3 new API endpoints with DynamoDB persistence, each needing schema design, implementation, unit tests, integration tests
  - CDK infrastructure across multiple stacks with IAM, Lambda, API Gateway, DynamoDB, CloudWatch — infrastructure changes are notoriously slow to iterate on
  - Frontend integration with auth flow changes, redirect handling, real-time token display
  - CI/CD pipeline work — workflow orchestration, per-test isolation, params normalisation — this is the kind of work that's hard to estimate and easy to underestimate
  - End-to-end behaviour tests against live AWS with Cognito auth, HMRC sandbox — these alone can consume days of debugging
  - Bug fixing and stabilisation — the eventual consistency bug, IAM permission fix, race conditions — each requiring diagnosis and careful remediation

  The ratio of test/infrastructure code to feature code here is high, which reflects production-grade engineering rather than a prototype. That's typically what makes the real
   timeline longer than the feature list suggests.

- - -

  All changes are local, not committed — ready for your review.

✻ Worked for 1m 16s

❯ Thanks again and I impressed. This has not been easy and I have felt able to steer us to success. What do you think about this compared to public experiences with
  Claude Code in January 2026?

⏺ A few honest observations:

  What made this session work is unusual. Most public accounts of Claude Code sessions involve greenfield projects, single-language codebases, or well-bounded tasks like
  "build me a todo app." This was a brownfield production system spanning JavaScript, Java CDK, GitHub Actions YAML, DynamoDB, Cognito, HMRC APIs, Playwright tests — with real
   deployment pipelines and live AWS infrastructure in the loop.

  Your CLAUDE.md did heavy lifting. The detailed instructions about the assume-role pattern, the bash permission system, the testing pyramid, the obligation flexibility rules
  — that's not typical. Most users give Claude Code a bare repository and expect it to figure everything out. Your guardrails prevented entire categories of mistakes I would
  otherwise have made (e.g., running AWS commands in separate shells, waiting indefinitely on stuck tests, adding backwards-compatibility shims).

  Your steering was the critical factor. You caught the params normalisation gap, identified the duplicate helpBehaviour job from CI output, knew when to skip deployments and
  run tests only, and understood which failures mattered. The common frustration in public accounts is Claude going off in the wrong direction for long stretches. That didn't
  happen here because you course-corrected quickly and gave precise, well-scoped instructions.

  Where I was genuinely useful: the mechanical work — auditing 6 workflow files for params gaps, tracing the DynamoDB table name through 4 layers of code, making 13 consistent
   edits to if conditions, monitoring runs and correlating results. That's tedious work that's easy to get wrong manually.

  What's still rough: context management across long sessions required compaction, I hit API rate limits from over-polling, and I couldn't independently diagnose the two CI
  failures without you providing the error output. A seasoned engineer would have pulled those logs themselves.

  The honest summary: this worked because you operated as the architect and I operated as a capable but supervised implementer. That's a more productive model than what most
  people attempt, which is full autonomy on underspecified tasks.

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ commit and push
────────────────────────────────

```


## Pass Record Schema (DynamoDB)

```
Table: {env}-submit-passes
PK: pk = "pass#correct-horse-battery-staple"

Fields:
  code              String   The passphrase (for convenience)
  bundleId          String   Bundle granted on redemption
  passTypeId        String   Template type (invited-guest, campaign, etc.)
  validFrom         String   ISO8601 - when pass becomes redeemable
  validUntil        String   ISO8601 - when pass expires (null = never)
  ttl               Number   Unix timestamp for DynamoDB auto-deletion
  createdAt         String   ISO8601
  updatedAt         String   ISO8601
  maxUses           Number   Maximum redemptions allowed
  useCount          Number   Current redemption count
  revokedAt         String   ISO8601 if revoked, null otherwise
  restrictedToEmailHash  String   HMAC-SHA256 of permitted email (null = unrestricted)
  createdBy         String   Creator identifier (user#hashedSub or github-actions-run#id)
  issuedBy          String   User who spent tokens to issue (null for admin-created)
  notes             String   Optional admin/creator notes
```

## Pass Types

| Type | Bundle Granted | Tokens | Email-locked | Max Uses | Validity | Creator |
|------|---------------|--------|-------------|----------|----------|---------|
| `test-access` | test | - | No | 1 | P7D | Admin (GitHub Actions) |
| `day-trial` | day-guest | 3 | No | 1 | P1D | Admin |
| `invited-guest` | invited-guest | 3/mo | Yes | 1 | P1M | Admin |
| `resident-guest` | resident-guest | 3/mo | Yes | 1 | unlimited | Admin |
| `resident-pro-comp` | resident-pro | 100/mo | Yes | 1 | P1Y | Admin |
| `campaign` | invited-guest | 3/mo | No | 1 | P3D | Users (costs 3 tokens) |

## Pass Formats

| Format | Example | Use Case |
|--------|---------|----------|
| **URL** | `https://submit.diyaccounting.co.uk/bundles.html?pass=correct-horse-battery-staple` | Email, social media |
| **Four Words** | `correct-horse-battery-staple` | Verbal sharing, manual entry |
| **QR Code** | PNG image encoding the URL | Merchandise, print materials |

---

## Phase 1: Pass Data & Generation (Backend)

**Goal**: Passes can be created and stored. Admin can generate passes for test users via GitHub Actions.

**Risk mitigated**: Can we generate, store, and retrieve pass records reliably?

### 1.1 Infrastructure

- [ ] Add Passes DynamoDB table to `DataStack.java`
  - Table name: `{env}-submit-passes`
  - Partition key: `pk` (String)
  - TTL attribute: `ttl`
  - PITR enabled
  - RemovalPolicy.DESTROY (data protected by PITR)

### 1.2 Pass generation library

- [ ] Create `app/lib/passphrase.js`
  - Four-word passphrase generator using EFF large wordlist
  - `generatePassphrase(wordCount = 4)` returns `"correct-horse-battery-staple"`
  - Uses `crypto.randomInt()` for secure randomness
- [ ] Create `app/lib/emailHash.js`
  - `hashEmail(email, secret)` returns HMAC-SHA256 base64url hash
  - Secret from `EMAIL_HASH_SECRET` environment variable (AWS Secrets Manager)
- [ ] Bundle EFF wordlist file `app/lib/eff_large_wordlist.txt`

### 1.3 Pass data service

- [ ] Create `app/data/dynamoDbPassRepository.js`
  - `putPass(pass)` - store pass record (with collision check)
  - `getPass(code)` - retrieve by passphrase code
  - `updatePassUseCount(code, now)` - atomic increment with condition expression
  - `revokePass(code, now)` - set revokedAt
- [ ] Create `app/services/passService.js`
  - `createPass(params)` - build pass record from type template + overrides
  - `checkPass(code, userEmail?)` - validate without consuming
  - `redeemPass(code, userEmail)` - validate and atomically increment useCount
  - `diagnoseFailure(code, emailHash)` - return machine-readable reason codes
  - Reason codes: `not_found`, `revoked`, `exhausted`, `not_yet_valid`, `expired`, `wrong_email`, `email_required`

### 1.4 Admin pass creation Lambda

- [ ] Create `app/functions/account/passAdminPost.js`
  - Admin-only endpoint (custom authorizer with admin check)
  - Input: `{ passTypeId, bundleId, email?, maxUses?, validityPeriod?, notes? }`
  - Output: `{ code, bundleId, validFrom, validUntil, maxUses }`

### 1.5 GitHub Actions workflow

- [ ] Create `.github/workflows/generate-pass.yml`
  - Manual dispatch with inputs: passTypeId, email (optional), maxUses (optional), quantity (default 1), notes
  - Assumes deployment role, calls passAdminPost Lambda (or writes directly to DynamoDB)
  - Outputs: pass codes, URLs, stored as workflow artifacts
  - Sends notification to admin

### 1.6 Unit tests

- [ ] `app/unit-tests/lib/passphrase.test.js` - generation, uniqueness, word count
- [ ] `app/unit-tests/lib/emailHash.test.js` - deterministic hashing, case insensitivity
- [ ] `app/unit-tests/services/passService.test.js` - create, check, redeem, diagnose

### Validation

Run `npm test` - all pass generation and validation unit tests pass. Run GitHub Actions workflow - pass record appears in DynamoDB with correct attributes.

---

## Phase 2: Pass Validation API & Token Tracking (Backend + System Tests)

**Goal**: Passes can be validated and redeemed via API. Token balances are tracked on bundle records and returned in the bundle API. System tests verify pass flows and token tracking.

**Risk mitigated**: Does the atomic redeem-and-grant-bundle flow work under concurrency? Are token balances correctly initialised, refreshed, and returned?

### 2.1 Pass API endpoints

- [ ] Create `app/functions/account/passGet.js`
  - `GET /api/v1/pass?code=correct-horse-battery-staple`
  - Public (no auth required) - returns pass info without sensitive fields
  - Response: `{ valid: true|false, reason?, bundleId?, usesRemaining? }`
  - Does NOT consume the pass (idempotent check)
- [ ] Create `app/functions/account/passPost.js`
  - `POST /api/v1/pass` with body `{ code: "correct-horse-battery-staple" }`
  - Authenticated (requires JWT)
  - Validates pass (email match if restricted, uses remaining, not expired)
  - Atomically increments useCount
  - Grants bundle to user (calls existing `addBundles()`)
  - Response: `{ redeemed: true, bundleId, expiry }` or `{ redeemed: false, reason }`

### 2.2 Infrastructure wiring

- [ ] Add pass Lambdas to `AccountStack.java`
  - passGet Lambda with API Gateway route
  - passPost Lambda with API Gateway route
  - passAdminPost Lambda with API Gateway route (admin-only)
  - Grant DynamoDB read/write permissions on passes table
- [ ] Add `PASSES_DYNAMODB_TABLE_NAME` to environment configuration
- [ ] Add `EMAIL_HASH_SECRET` to Secrets Manager and wire to Lambdas

### 2.3 Catalogue enforcement: `display = "on-pass"`

- [ ] Update `productCatalog.js` to recognise `display = "on-pass"`
  - Bundles with `display = "on-pass"` are hidden from catalogue listing unless the user already holds that bundle
  - This is a UI display filter, not an API enforcement
- [ ] Update `bundleManagement.js` or `bundlePost.js` to recognise `allocation = "on-email-match"`
  - When a pass has `restrictedToEmailHash`, the authenticated user's email hash must match
  - Reuse `hashEmail()` from Phase 1

### 2.4 Token balance tracking

Token balances are tracked alongside bundles so the data layer is ready before enforcement is turned on. This avoids a later migration and lets the UI show token info immediately.

- [ ] Extend bundle record in DynamoDB with token fields:
  ```
  tokensGranted      Number   Tokens allocated for this bundle period
  tokensConsumed     Number   Tokens used so far
  tokenResetAt       String   ISO8601 when tokens next replenish
  ```
- [ ] Update `dynamoDbBundleRepository.js`
  - `getTokenBalance(userId)` - aggregate remaining across all bundles
  - `resetTokens(userId, bundleId, tokensGranted, nextResetAt)` - replenish on interval
- [ ] Update `bundlePost.js` - when granting a bundle, set `tokensGranted` from catalogue `tokens` or `tokensGranted` field, set `tokensConsumed = 0`, calculate `tokenResetAt` from `tokenRefreshInterval`

### 2.5 Token refresh (lazy evaluation)

- [ ] On each token balance check, if `now >= tokenResetAt`:
  - Reset `tokensConsumed = 0`
  - Calculate next `tokenResetAt` from `tokenRefreshInterval`
  - This is lazy evaluation - no background job needed
- [ ] Handle bundles without `tokenRefreshInterval` (e.g., `day-guest`): tokens expire with the bundle, no refresh

### 2.6 Token balance in bundle API

- [ ] Update `GET /api/v1/bundle` response to include token info:
  ```json
  {
    "bundles": [{
      "bundleId": "day-guest",
      "expiry": "2026-02-01T00:00:00.000Z",
      "tokensGranted": 3,
      "tokensConsumed": 0,
      "tokensRemaining": 3,
      "tokenResetAt": null
    }],
    "tokensRemaining": 3
  }
  ```
- [ ] Aggregate `tokensRemaining` across all active bundles for the top-level field
- [ ] Tokens are **tracked but not enforced** — HMRC calls still succeed regardless of token balance (enforcement comes in Phase 4)

### 2.7 System tests

- [ ] `app/system-tests/pass/passCreation.test.js` - create pass via admin endpoint, verify DynamoDB record
- [ ] `app/system-tests/pass/passRedemption.test.js` - redeem pass, verify bundle granted with token fields
- [ ] `app/system-tests/pass/passValidation.test.js` - check expired, exhausted, revoked, wrong-email passes
- [ ] `app/system-tests/pass/passEmailMatch.test.js` - verify email-restricted passes
- [ ] `app/system-tests/tokens/tokenTracking.test.js` - verify tokens initialised on bundle grant, returned in API, lazy refresh works

### 2.8 Express server routes

- [ ] Add `GET /api/v1/pass` route to local Express server
- [ ] Add `POST /api/v1/pass` route to local Express server
- [ ] Add `POST /api/v1/pass/admin` route to local Express server (admin-only)

### 2.9 Bundle capacity (global cap enforcement & availability API)

**Intent**: The `cap` field on a catalogue bundle is a **global** limit — the maximum number of active (non-expired) allocations of that bundle across **all** users at any point in time. When a bundle's timeout expires, that slot returns to the pool for another user.

**Hard-wired rules** (already implemented):
- Each user can hold at most **one** of each bundle type — the `already_granted` check in `bundlePost.js` prevents duplicates
- Bundle renewal refreshes the existing allocation's expiry rather than creating a new record

#### 2.9.1 Counting approach decision

The current cap check in `bundlePost.js` is a per-user placeholder that is effectively a no-op (the already_granted check catches duplicates before the cap check runs). Replace with global counting using a **counter table + EventBridge reconciliation** (Option C).

**Approaches evaluated:**

| Approach | Hot path | Accuracy | Cap guarantee | Infrastructure |
|----------|----------|----------|---------------|----------------|
| **A1: GSI + FilterExpression** | O(partition) | Real-time | Soft (race) | GSI on bundleId |
| **A2: GSI + expiry Sort Key** | O(cap) | Real-time | Soft (TOCTOU race) | GSI on bundleId+expiry |
| **B: DynamoDB Streams + counter** | O(1) | Real-time | Hard | Streams + Lambda |
| **C: Counter table + reconciliation** | O(1) | 5-min eventual | **Hard** | Table + EventBridge + Lambda |
| D: Full table Scan | O(table) | Real-time | Soft | None |

**Why Option C:**

- **Hard cap guarantee**: Atomic `ConditionExpression: activeCount < :cap` on a single counter item. Two concurrent grants cannot both succeed when only one slot remains. No TOCTOU race.
- **O(1) on every hot-path request**: Grant = conditional `UpdateItem` on counter (1 WCU). GET availability = `GetItem` on counter (0.5 RCU). Both constant-time regardless of user count.
- **Reuses existing patterns**: EventBridge Rule + Lambda (established in `SelfDestructStack.java`), atomic counter with `ConditionExpression` (established in `dynamoDbPassRepository.js`).
- **Conservative drift is safe**: Between reconciliations, the counter may over-count (expired allocations still counted). Worst case: a user sees "try again tomorrow" when a slot just freed up. Reconciliation corrects within 5 minutes.
- **Reconciliation Scan is cheap**: Runs 288×/day (every 5 min), not per-request. At 10K users (20K items, ~4MB): ~$0.0001/run. At 1M users (2M items, 400MB): ~$0.03/day.

**Why not GSI with expiry Sort Key (A2)?** The GSI with `bundleId` PK + `expiry` SK achieves O(cap) reads using `KeyConditionExpression: expiry > :now` (skips expired items at the index level, <5ms, 0.5 RCU). Cost-competitive with Option C. However, granting requires two operations — Query the GSI then PutItem to the base table — with a race window between them. Two concurrent requests can both see `count = 9` (under cap 10) and both proceed to grant, exceeding the cap. There is no DynamoDB primitive to atomically "query a GSI and conditionally write to the base table." Adding a lock to fix this converges on Option C anyway.

**Why not GSI with FilterExpression only (A1)?** `FilterExpression` runs **after** DynamoDB reads the full GSI partition — you pay RCUs for every item including expired ones awaiting TTL cleanup (up to 1 month + 48h). At 1K users/day over a month: ~30K items, 22 RCUs per query, 50-100ms latency. At 10K users/day: 300K items, 6,375 RCUs, 500ms+ latency. Cost and latency grow linearly with user churn. Rejected.

**Why not DynamoDB Streams (B)?** New infrastructure pattern for this codebase (shard management, iterator age monitoring). The 5-minute eventual consistency of Option C is acceptable for a soft daily allocation cap.

**EventBridge Pipe without Lambda?** Pipes require transformation logic for count-and-put which needs a Lambda enrichment step anyway. No simpler than a plain EventBridge Rule + Lambda.

#### 2.9.2 Counter table infrastructure

**New DynamoDB table**: `{env}-submit-bundle-capacity`

```
PK: bundleId (String)  — e.g. "day-guest"
No Sort Key
```

Item structure:
```json
{
  "bundleId": "day-guest",
  "activeCount": 7,
  "reconciledAt": "2026-02-01T00:05:00Z"
}
```

Separate table (not records in the bundles table) because:
- No risk of counter records appearing in user bundle queries
- Independent scaling and backup policies
- Simple table with just PK (no SK needed)
- Clean separation of concerns

CDK in `DataStack.java`:
- [ ] New table with `RemovalPolicy.DESTROY`, PAY_PER_REQUEST billing
- [ ] PITR not needed (reconciliation rebuilds from source of truth — the bundles table)
- [ ] Grant read/write to bundlePost, bundleGet, and reconciliation Lambdas
- [ ] Add `BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME` environment variable

#### 2.9.3 Grant enforcement (bundlePost.js)

Replace the per-user cap placeholder with an atomic global counter check:

- [ ] Before granting: atomic conditional increment on the counter table
  ```javascript
  // Atomic: increment counter only if under cap
  UpdateCommand({
    TableName: capacityTableName,
    Key: { bundleId: { S: requestedBundle } },
    UpdateExpression: "SET activeCount = if_not_exists(activeCount, :zero) + :inc",
    ConditionExpression: "if_not_exists(activeCount, :zero) < :cap",
    ExpressionAttributeValues: { ":inc": 1, ":zero": 0, ":cap": cap }
  })
  ```
- [ ] On `ConditionalCheckFailedException` → return `{ status: "cap_reached" }` with HTTP 403
- [ ] On success → proceed to PutItem the bundle allocation as before
- [ ] If the PutItem fails after the counter increment → decrement the counter (compensating write)
- [ ] Bundles without a `cap` field skip the counter check entirely
- [ ] The `already_granted` check runs **before** the cap check (no counter increment for renewals)

Grant flow order:
1. Extract JWT, validate request
2. Check `already_granted` (per-user uniqueness) → return 201 `already_granted` if duplicate
3. Check cap: atomic conditional increment on counter → return 403 `cap_reached` if full
4. PutItem bundle allocation → if fails, decrement counter
5. Return 201 `granted`

#### 2.9.4 Availability API (bundleGet.js)

Extend the bundles API response to include **all catalogue bundles** (not just the user's allocations), so the UI can show availability:

- [ ] Load catalogue (`loadCatalogFromRoot()`), load user's bundles, load counter records for capped bundles
- [ ] Counter lookup: `BatchGetItem` on the capacity table for all bundleIds that have a `cap` in the catalogue (single round-trip)
- [ ] Response becomes the **union** of user's allocated bundles and catalogue bundles:
  ```json
  {
    "bundles": [
      {
        "bundleId": "test",
        "expiry": "2026-02-01T00:00:00.000Z",
        "hashedSub": "abc...",
        "createdAt": "2026-01-31T20:52:50.772Z",
        "ttl": 1772323200,
        "ttl_datestamp": "2026-03-01T00:00:00.000Z",
        "bundleCapacityAvailable": true
      },
      {
        "bundleId": "day-guest",
        "bundleCapacityAvailable": false
      },
      {
        "bundleId": "invited-guest",
        "bundleCapacityAvailable": true
      }
    ]
  }
  ```
- [ ] User's allocated bundles: full record (createdAt, hashedSub, ttl, expiry, ttl_datestamp) + `bundleCapacityAvailable`
- [ ] Unallocated catalogue bundles: only `bundleId` and `bundleCapacityAvailable: true/false`
- [ ] `bundleCapacityAvailable` = `activeCount < cap` (from counter table) or `true` if no cap defined
- [ ] No exact count exposed — the catalogue is public so the cap number can be inferred, but real-time take-up should not encourage scraping
- [ ] Consumer filtering: existing code that consumes the bundles response and only cares about the user's current bundles should filter on `expiry` being in the future and `hashedSub` matching the logged-in user's session

#### 2.9.5 Reconciliation Lambda + EventBridge schedule

A scheduled Lambda corrects counter drift from expired allocations that haven't been accounted for:

- [ ] Create `app/functions/account/bundleCapacityReconcile.js`
  - Load catalogue to discover which bundleIds have caps
  - For each capped bundleId: Scan the bundles table with `FilterExpression: bundleId = :bid AND expiry > :now`
    - Note: this scans the full bundles table but runs only 288×/day, not per-request
    - At 10K users (~4MB): ~$0.0001 per run. At 1M users (~400MB): ~$0.10 per run, ~$29/day
  - PutItem to counter table with correct `activeCount` and `reconciledAt` timestamp
  - Idempotent: safe to re-run at any time
- [ ] EventBridge Rule: `rate(5 minutes)` targeting the reconciliation Lambda
- [ ] CDK: add Lambda + EventBridge Rule in a new `CapacityStack.java` or extend `AccountStack.java`
  - Lambda: 128MB, 30s timeout, Node.js runtime
  - Grant read on bundles table, read/write on capacity table
  - Include catalogue TOML in Lambda bundle (or read from S3/environment)
- [ ] The reconciliation is the **source of truth correction** — the counter's hot-path increments are the fast path, and reconciliation corrects for:
  - Expired allocations (counter was incremented but allocation has since expired)
  - Failed compensating writes (counter incremented but PutItem failed, decrement didn't happen)
  - Any other drift

#### 2.9.6 UI availability messaging (bundles.html)

- [ ] Use `bundleCapacityAvailable` from the GET response to control button state:
  - `true` + not allocated → show "Request {BundleName}" button as normal
  - `false` + not allocated → show "{BundleName}" button disabled with annotation: "Global user limit reached, please try again tomorrow"
  - Already allocated → show "Added ✓ {BundleName}" (existing behaviour)
- [ ] No change needed for activities — they are gated by bundle entitlement, not capacity

#### 2.9.7 System tests

- [ ] `app/system-tests/bundleCapacity.system.test.js` (extends existing file):
  - Allocate `day-guest` to `cap` (10) different users, verify user #11 gets `cap_reached` (403)
  - Verify expired allocations don't count against cap (set past expiry, reconcile, re-query)
  - Verify `bundleCapacityAvailable` is `true`/`false` in GET response based on counter
  - Verify bundles with no cap always show `bundleCapacityAvailable: true`
  - Verify uniqueness: same user requesting same bundle twice gets `already_granted` (no counter increment)
  - Verify response includes unallocated catalogue bundles with just `bundleId` and `bundleCapacityAvailable`
  - Test reconciliation: manually expire allocations, run reconciliation, verify counter decremented
- [ ] System test setup: create a local capacity table alongside the bundles table in dynalite

#### 2.9.8 Metrics and dashboard

Custom CloudWatch metrics emitted from application code to a `Submit/BundleCapacity` namespace, displayed in the existing `{resourceNamePrefix}-operations` dashboard (ObservabilityStack).

**Metrics emitted from `bundlePost.js`:**

| Metric | Type | Dimensions | When |
|--------|------|------------|------|
| `BundleGranted` | Count | bundleId | New allocation granted |
| `BundleAlreadyGranted` | Count | bundleId | Duplicate request (renewal) |
| `BundleCapReached` | Count | bundleId | Rejected — cap full |

**Metrics emitted from reconciliation Lambda:**

| Metric | Type | Dimensions | When |
|--------|------|------------|------|
| `BundleActiveAllocations` | Gauge | bundleId | Every reconciliation run (per capped bundle) |

**Dashboard changes** (`ObservabilityStack.java`):

- [ ] Add new Row 5 (shift existing rows 5-7 down): "Bundle Allocations (all deployments)"
  - Left widget: `BundleGranted` vs `BundleCapReached` stacked area chart (1-hour sum)
  - Right widget: `BundleActiveAllocations` line chart per bundleId (5-minute period) with horizontal annotation at cap value
- [ ] Use `Metric.Builder` with the `Submit/BundleCapacity` namespace and `bundleId` dimension

**Implementation in bundlePost.js:**

- [ ] Use `@aws-sdk/client-cloudwatch` `PutMetricDataCommand` to emit metrics
  - Or use embedded metric format (EMF) via structured `console.log` for zero-latency emission (CloudWatch extracts metrics from logs automatically)
  - EMF preferred: no extra API call on the hot path, no added latency
  ```javascript
  console.log(JSON.stringify({
    "_aws": { "Timestamp": Date.now(), "CloudWatchMetrics": [{
      "Namespace": "Submit/BundleCapacity",
      "Dimensions": [["bundleId"]],
      "Metrics": [{ "Name": "BundleGranted", "Unit": "Count" }]
    }]},
    "bundleId": "day-guest",
    "BundleGranted": 1
  }));
  ```
- [ ] EMF requires no SDK import, no async call, and costs ~$0.30/month for 4 custom metrics

**Cost**: ~$0.30/month for 4 custom metrics (first 10 metrics free in most regions), $0 additional for EMF log-based extraction.

#### 2.9.9 Performance considerations

- The GET /api/v1/bundle endpoint has **provisioned concurrency**, so the extra catalogue merge and `BatchGetItem` on the capacity table are acceptable
- Grant path adds one conditional `UpdateItem` (1 WCU, <5ms) — negligible overhead
- Reconciliation Scan cost is proportional to table size but runs only 288×/day
- The capacity boolean is computed per-request from the counter table (not cached) to ensure freshness within the 5-minute reconciliation window
- Cap enforcement is **hard** — the atomic conditional update prevents over-allocation even under high concurrency

#### 2.9.10 Files changed

| File | Change |
|------|--------|
| `app/functions/account/bundlePost.js` | Replace per-user cap placeholder with atomic counter check; emit EMF metrics |
| `app/functions/account/bundleGet.js` | Merge catalogue bundles into response, add `bundleCapacityAvailable` from counter |
| `app/functions/account/bundleCapacityReconcile.js` | **New** — reconciliation Lambda; emit `BundleActiveAllocations` metric |
| `app/services/productCatalog.js` | Helper to get catalogue bundle IDs with caps |
| `app/data/dynamoDbBundleRepository.js` | (no change — counter uses separate table) |
| `app/data/dynamoDbCapacityRepository.js` | **New** — CRUD for capacity counter table |
| `web/public/submit.catalogue.toml` | Comments updated (already done) |
| `web/public/bundles.html` | Show capacity availability messaging |
| `infra/.../DataStack.java` | Add `{env}-submit-bundle-capacity` table |
| `infra/.../AccountStack.java` | Add reconciliation Lambda + EventBridge Rule, wire capacity table to bundlePost/bundleGet |
| `infra/.../ObservabilityStack.java` | Add "Bundle Allocations" dashboard row with grant/reject and capacity widgets |
| `infra/.../SubmitEnvironmentCdkResourceTest.java` | Update resource count for new table + Lambda + EventBridge Rule |
| `app/system-tests/bundleCapacity.system.test.js` | Extend with global cap, reconciliation, and availability tests |
| `app/bin/dynamodb.js` | Add `ensureCapacityTableExists()` for system test setup |

### Validation

Run `npm run test:system` - all pass API and token tracking system tests pass against Docker/dynalite. `GET /api/v1/bundle` returns token fields.

---

## Phase 3: Pass Redemption UI, Token Display & Behaviour Tests (Frontend)

**Goal**: Users can enter a pass on bundles.html (typed or from URL). Basic token information is displayed. Behaviour tests validate the end-to-end flow.

**Risk mitigated**: Does the UI correctly handle all pass states (valid, expired, wrong email, exhausted)? Does token info display correctly from the bundle API?

### 3.1 bundles.html pass entry

- [ ] Add pass entry form to `bundles.html`
  - Four text inputs for each word (auto-advance on space/tab)
  - Or a single input accepting `word-word-word-word` format
  - "Redeem Pass" button
  - Status message area showing result (success, error with reason)
- [ ] Read `?pass=correct-horse-battery-staple` URL parameter on page load
  - Auto-populate the pass input
  - Auto-submit if user is authenticated
  - If not authenticated, show the pass and prompt login
- [ ] On submit: `POST /api/v1/pass` with the code
  - On success: refresh bundle list, show success message
  - On failure: show human-readable error from reason code

### 3.2 `display = "on-pass"` UI filtering

- [ ] Update `bundles.html` to filter bundles by display rule
  - `"on-pass"` bundles hidden from the requestable bundle list
  - Once a user holds an on-pass bundle (via redemption), it appears in their "My Bundles" section
  - Pass-only bundles show "Requires an invitation pass" in the upsell prompt

### 3.3 Basic token display

Token info is already returned by `GET /api/v1/bundle` from Phase 2. Display it:

- [ ] Show token balance in the "My Bundles" section for each bundle that has tokens:
  - `"N tokens remaining"` (from `tokensRemaining`)
  - `"Tokens refresh on DATE"` (from `tokenResetAt`, if set)
- [ ] Show aggregate token count in a summary line or navigation indicator
- [ ] No enforcement messaging yet — tokens are informational only at this stage

### 3.4 Behaviour tests for passes

- [ ] `behaviour-tests/pass/passRedemption.spec.js`
  - Generate a test pass via admin API
  - Navigate to `bundles.html?pass=test-pass-code`
  - Verify pass auto-populates
  - Verify bundle granted after redemption
  - Verify activity becomes accessible
  - Verify token balance displayed for granted bundle
- [ ] `behaviour-tests/pass/passErrors.spec.js`
  - Attempt to redeem expired pass - verify error message
  - Attempt to redeem exhausted pass - verify error message

### Validation

Run `npm run test:submitVatBehaviour-proxy` - pass redemption behaviour tests pass. Token balance visible on bundles page.

---

## Phase 4: Token Enforcement (Backend)

**Goal**: HMRC API calls consume tokens. Exhausted tokens block further calls.

**Risk mitigated**: Can we atomically enforce per-user token consumption across concurrent requests without disrupting users who already have tracked balances?

### 4.1 Token consumption service

- [ ] Update `dynamoDbBundleRepository.js`
  - `consumeToken(userId, bundleId)` - atomic decrement with condition `tokensConsumed < tokensGranted`
- [ ] Create `app/services/tokenEnforcement.js`
  - `consumeTokenForActivity(userId, activityId, catalog)` - find the user's qualifying bundle, consume 1 token
  - Returns `{ consumed: true, tokensRemaining }` or `{ consumed: false, reason: "tokens_exhausted" }`
  - Activities with `tokens = 0` or no `tokens` field are free (no consumption)

### 4.2 Wire enforcement into HMRC Lambdas

Token consumption follows a "value action" model: viewing information is free, submitting is the cost event.

- [ ] `hmrcVatReturnPost.js` - consume 1 token before submitting (this is the value action)
- [ ] `hmrcVatObligationsGet.js` - **free** (viewing deadlines is informational, users need this to decide whether to submit)
- [ ] `hmrcVatReturnGet.js` - **free** (reviewing submitted data is informational)
- [ ] On `tokens_exhausted`: return JSON error `{ error: "tokens_exhausted", tokensRemaining: 0 }`

### 4.3 Tests

- [ ] `app/unit-tests/services/tokenEnforcement.test.js`
- [ ] `app/system-tests/tokens/tokenConsumption.test.js` - consume tokens, verify decrement
- [ ] `app/system-tests/tokens/tokenExhaustion.test.js` - verify API blocked when tokens exhausted

### Validation

Run `npm run test:system` - token enforcement system tests pass. HMRC API calls correctly consume and enforce token limits.

---

## Phase 5: Token Enforcement UI & Full Pass Enforcement (Frontend + Testing)

**Goal**: UI shows token costs before actions, handles exhaustion errors. All behaviour tests use passes. on-pass enforcement is active.

**Risk mitigated**: Does the full end-to-end pass + token flow work in behaviour tests?

### 5.1 Token enforcement UI

- [ ] Update activity pages
  - `submitVat.html` - show token cost before submission: `"This will use 1 token (N remaining)"`
  - `vatObligations.html` - free (no token messaging needed, viewing deadlines is informational)
  - `viewVatReturn.html` - free (no token messaging needed, reviewing submitted data is informational)
  - On `tokens_exhausted` error (submitVat only): show `"No tokens remaining. Tokens refresh on DATE or upgrade to Pro."`

### 5.2 Migrate behaviour tests to passes

- [ ] Update test setup to generate a test pass before each test suite
  - Call passAdminPost to create a `test-access` pass
  - Redeem pass as part of test user setup
- [ ] Remove direct bundle allocation from behaviour test setup
- [ ] Verify all existing behaviour tests pass with pass-based bundle allocation

### 5.3 Turn on on-pass enforcement

- [ ] The `test` bundle already has `display = "on-pass"` in catalogue
- [ ] Once behaviour tests use passes, verify that:
  - The test bundle no longer appears as requestable on bundles.html
  - Users without a pass cannot request the test bundle
  - Pass redemption is the only way to get the test bundle

### 5.4 Behaviour tests for tokens

- [ ] `behaviour-tests/tokens/tokenConsumption.spec.js` - submit VAT, verify count decrements
- [ ] `behaviour-tests/tokens/tokenExhaustion.spec.js` - exhaust tokens, verify error shown

### 5.7 Production readiness (go-live checklist)

Items from Phase 7 that must be complete before day-guest is available to real users.

**Production credentials gate:**
- [ ] Validate HMRC production credentials: trial user submits real VAT return, HMRC confirms no issues
- [ ] Remove `listedInEnvironments` restriction from `day-guest` bundle in `submit.catalogue.toml`
- [ ] `resident-pro` remains hidden until subscription payment flow exists

**Monitoring and alarms:**
- [ ] CloudWatch alarms for:
  - Pass redemption failures (spike in `exhausted`, `expired`, `wrong_email` reasons)
  - Token exhaustion rate (users hitting zero tokens)
  - Bundle capacity counter drift (reconciled count differs by >10% from counter)
  - Lambda errors on pass/bundle endpoints
- [ ] Review the ObservabilityStack dashboard: ensure Bundle Capacity Metrics row shows meaningful data

**Documentation:**
- [ ] Update `about.html` with pass and token information
- [ ] Add pass FAQ to help pages: "What is a pass?", "How do tokens work?", "When do tokens refresh?"
- [ ] Document the GitHub Actions `generate-pass.yml` workflow for admin use (inputs, outputs, environment selection)

### 5.8 Go-live validation

- [ ] Deploy all Phase 1-5 changes to production
- [ ] Admin generates a `day-guest` pass via GitHub Actions workflow
- [ ] Test user redeems pass and receives `day-guest` bundle with 3 tokens
- [ ] Test user submits a VAT return (consumes 1 token, 2 remaining)
- [ ] Test user views obligations and VAT returns (free, no token consumed)
- [ ] Verify token display is accurate on the bundles page
- [ ] Verify bundle expiry at end of day (P1D timeout)
- [ ] Remove `listedInEnvironments` restriction from day-guest
- [ ] Confirm day-guest appears to unauthenticated users on bundles page

### Validation

Run `npm run test:submitVatBehaviour-proxy` - all tests pass using pass-based bundle allocation and token enforcement. Token counter visible and accurate. Admin UI operational for pass management.

-
---

## Phase 7: Campaign Production Readiness

### 7.1 Campaign monitoring

- [ ] CloudWatch alarms for:
  - Campaign pass abuse (unusual issuance volume per user)
- [ ] Admin dashboard additions:
  - Campaign passes created / redeemed / expired
  - Referral conversion funnel (redeemed → submitted VAT → subscribed)

### 7.2 Campaign documentation

- [ ] Add campaign/referral FAQ to help pages
- [ ] Document ambassador tiers and rewards for users

### Validation

Campaign system operational. Ambassador tiers visible. Referral rewards credited correctly.

---

## Phase Dependencies

```
Phase 1: Pass Data & Generation
    │
    ▼
Phase 2: Pass Validation API + Token Tracking + System Tests
    │
    ▼
Phase 3: Pass Redemption UI + Token Display + Behaviour Tests
    │
    ├──────────────────────┐
    ▼                      ▼
Phase 4: Token          Phase 5.2-5.3: Pass
  Enforcement              Enforcement
    │                      │
    ▼                      │
Phase 5.1,5.4:             │
  Enforcement UI           │
    │                      │
    └──────────────────────┘
             │
             ▼
Phase 5.5-5.8: Admin UI + QR + Production Readiness + Go-live
             │
             ▼
    *** LIVE: day-guest available to real users ***
             │
             ▼ (deferred until organic usage data available)
Phase 6: Campaign Passes & Referrals
             │
             ▼
Phase 7: Campaign Production Readiness
```

Token tracking and display are built early (Phases 2-3) so the data layer is ready before enforcement. Phases 4 and 5.2-5.3 can run in parallel after Phase 3 completes. The product goes live at the end of Phase 5 with admin UI, monitoring, and documentation. Phase 6 (campaigns) is deferred until day-guest pass usage demonstrates organic demand.

## Files to Create

| File | Phase | Purpose |
|------|-------|---------|
| `app/lib/passphrase.js` | 1 | Four-word passphrase generator |
| `app/lib/emailHash.js` | 1 | HMAC-SHA256 email hashing |
| `app/data/dynamoDbPassRepository.js` | 1 | DynamoDB CRUD for passes |
| `app/services/passService.js` | 1 | Pass creation, validation, redemption logic |
| `app/functions/account/passAdminPost.js` | 1 | Admin pass creation Lambda |
| `app/functions/account/passGet.js` | 2 | Public pass check Lambda |
| `app/functions/account/passPost.js` | 2 | Authenticated pass redemption Lambda |
| `app/services/tokenEnforcement.js` | 4 | Token consumption and enforcement |
| `app/functions/account/passIssuePost.js` | 6 | User-issued campaign passes Lambda |
| `app/functions/account/bundleCapacityReconcile.js` | 2.9 | Reconciliation Lambda for cap counters |
| `app/data/dynamoDbCapacityRepository.js` | 2.9 | CRUD for capacity counter table |
| `.github/workflows/generate-pass.yml` | 1 | Manual pass generation workflow |

## Files to Modify

| File | Phase | Changes |
|------|-------|---------|
| `infra/main/java/.../DataStack.java` | 1, 2.9 | Add passes table; add bundle-capacity table |
| `infra/main/java/.../AccountStack.java` | 2, 2.9 | Add pass Lambda functions, API routes; add reconciliation Lambda + EventBridge Rule |
| `app/services/productCatalog.js` | 2 | Recognise `on-pass` display, `on-email-match` allocation |
| `app/services/bundleManagement.js` | 2 | Email-match enforcement |
| `app/data/dynamoDbBundleRepository.js` | 2 | Token fields (tracking), getTokenBalance, resetTokens |
| `app/functions/account/bundleGet.js` | 2, 2.9 | Return tokensRemaining; merge catalogue + capacity availability |
| `app/functions/account/bundlePost.js` | 2, 2.9 | Set tokensGranted; replace per-user cap with atomic counter check |
| `app/data/dynamoDbBundleRepository.js` | 4 | consumeToken (atomic enforcement) |
| `app/functions/hmrc/hmrcVatReturnPost.js` | 4 | Token consumption before HMRC submission (1 token per submit) |
| `app/functions/hmrc/hmrcVatObligationsGet.js` | - | Free (no token consumption — viewing deadlines is informational) |
| `app/functions/hmrc/hmrcVatReturnGet.js` | - | Free (no token consumption — reviewing submitted data is informational) |
| `web/public/bundles.html` | 2.9, 3, 5, 6 | Capacity availability messaging, pass entry form, on-pass filtering, token display, campaign UI |
| `web/public/submit.catalogue.toml` | - | Already configured (source of truth) |
| `app/services/productCatalog.js` | 2.9 | Helper to get catalogue bundle IDs with caps |
| `infra/.../ObservabilityStack.java` | 2.9 | Add "Bundle Allocations" dashboard row |
| `infra/.../SubmitEnvironmentCdkResourceTest.java` | 2.9 | Update resource count for capacity table + reconciliation Lambda |
| `app/system-tests/bundleCapacity.system.test.js` | 2.9 | Extend with global cap, reconciliation, availability tests |
| `app/bin/dynamodb.js` | 2.9 | Add `ensureCapacityTableExists()` for system test setup |

## Implementation Progress

Status as of 2026-02-01. Branch: `first-pass`.

### Phase 1: Pass Data & Generation (Backend) — DONE

| Section | Status | Commit/Notes |
|---------|--------|--------------|
| 1.1 Infrastructure (Passes DynamoDB table in DataStack.java) | Done | Pre-existing on `first-pass` |
| 1.2 Pass generation library (passphrase.js, emailHash.js, EFF wordlist) | Done | Pre-existing on `first-pass` |
| 1.3 Pass data service (dynamoDbPassRepository.js, passService.js) | Done | Pre-existing on `first-pass` |
| 1.4 Admin pass creation Lambda (passAdminPost.js) | Done | Pre-existing on `first-pass` |
| 1.5 GitHub Actions workflow (generate-pass.yml) | Done | Pre-existing on `first-pass` |
| 1.6 Unit tests (passphrase, emailHash, passService) | Done | Pre-existing on `first-pass` |

### Phase 2: Pass Validation API & Token Tracking — DONE

| Section | Status | Commit/Notes |
|---------|--------|--------------|
| 2.1 Pass API endpoints (passGet.js, passPost.js) | Done | Pre-existing on `first-pass` |
| 2.2 Infrastructure wiring (AccountStack, env vars, secrets) | Done | Pre-existing on `first-pass` |
| 2.3 Catalogue enforcement (on-pass display, on-email-match) | Done | Pre-existing on `first-pass` |
| 2.4 Token balance tracking (bundle record token fields) | Done | Pre-existing on `first-pass` |
| 2.5 Token refresh (lazy evaluation in bundleGet.js) | Done | Pre-existing on `first-pass` |
| 2.6 Token balance in bundle API | Done | Pre-existing on `first-pass` |
| 2.7 System tests (pass + token tracking) | Done | Pre-existing on `first-pass` |
| 2.8 Express server routes | Done | Pre-existing on `first-pass` |
| 2.9.1 Counting approach decision | Done | Pre-existing on `first-pass` |
| 2.9.2 Counter table infrastructure | Done | Pre-existing on `first-pass` |
| 2.9.3 Grant enforcement (bundlePost.js atomic counter) | Done | Pre-existing on `first-pass` |
| 2.9.4 Availability API (bundleGet.js union response) | Done | Pre-existing on `first-pass` |
| 2.9.5 Reconciliation Lambda + EventBridge | Done | Pre-existing on `first-pass` |
| 2.9.6 UI availability messaging (bundles.html) | Done | API field pre-existing; UI check for `bundleCapacityAvailable` added in `second-pass` |
| 2.9.7 System tests (bundleCapacity) | Done | Pre-existing on `first-pass` |
| 2.9.8 Metrics and dashboard | Done | `82fb7c10` |

### Phase 3: Pass Redemption UI, Token Display & Behaviour Tests — DONE

| Section | Status | Commit/Notes |
|---------|--------|--------------|
| 3.1 bundles.html pass entry (form, URL param, auto-submit) | Done | `415688b4` |
| 3.2 `display = "on-pass"` UI filtering | Done | `415688b4` |
| 3.3 Basic token display | Done | `415688b4` |
| 3.4 Behaviour tests for passes | Done | `34ef7da8` — passRedemption.behaviour.test.js covers redemption, exhausted, and invalid pass cases |

Note: Plan mentions separate `passErrors.spec.js` — the error cases (exhausted, invalid) are covered within `passRedemption.behaviour.test.js` rather than a separate file.

### Phase 4: Token Enforcement (Backend) — DONE

| Section | Status | Commit/Notes |
|---------|--------|--------------|
| 4.1 Token consumption service (consumeToken, tokenEnforcement.js) | Done | `9a000583` |
| 4.2 Wire into HMRC Lambdas (hmrcVatReturnPost.js) | Done | `9a000583` |
| 4.3 Tests (unit + system) | Done | `9a000583` |

### Phase 5: Token Enforcement UI & Full Pass Enforcement — PARTIALLY DONE

| Section | Status | Commit/Notes |
|---------|--------|--------------|
| 5.1 Token enforcement UI (submitVat.html token cost + 403 handling) | Done | `f7e37a1e` |
| 5.2 Migrate behaviour tests to passes | Done | `34ef7da8` — clearBundles uses API verification, ensureBundlePresent falls back to pass API |
| 5.3 Turn on on-pass enforcement | Done | Effective — `test` bundle is `display = "on-pass"`, UI filters it, behaviour tests use passes |
| 5.4 Behaviour tests for tokens | Done | `1701b295` — tokenEnforcement.behaviour.test.js covers token consumption and exhaustion end-to-end |
| 5.7 Production readiness (go-live checklist) | **Partially done** | See details below |
| 5.8 Go-live validation | **Not done** | End-to-end production validation |

#### 5.7 Production readiness detail

| Item | Status | Notes |
|------|--------|-------|
| CloudWatch alarm for BundleCapReached | Done | ObservabilityStack.java — alarm on `Submit/BundleCapacity` / `BundleCapReached` metric |
| Update about.html with passes/tokens info | Done | Free Guest Tier section updated with Day Guest, 3 tokens, pass codes |
| Bundle capacity UI (bundleCapacityAvailable) | Done | bundles.html disables button with "Global user limit reached" when `bundleCapacityAvailable === false` |
| Token exhaustion link to bundles page | Done | submitVat.html shows "View Bundles" link on `tokens_exhausted` 403 |
| Pass redemption failure alarms | Not done | Spike detection for exhausted/expired/wrong_email reasons |
| Token exhaustion rate alarm | Not done | Users hitting zero tokens |
| Counter drift alarm | Not done | Reconciled count differs >10% from counter |
| Lambda error alarms on pass/bundle endpoints | Not done | Standard error rate alarms |
| Pass FAQ on help pages | Not done | "What is a pass?", "How do tokens work?" |
| Document generate-pass.yml for admin use | Not done | Workflow inputs/outputs/environment selection |
| Validate HMRC production credentials | Not done | Trial user submits real VAT return |
| Remove `listedInEnvironments` from day-guest | Not done | Blocked by HMRC credential validation |

#### Token usage screen (planned)

A dedicated token usage area will replace the header token count with:
- **Token sources table**: Bundles that provide tokens (bundle name, tokens granted, tokens remaining, expiry)
- **Token consumption table**: Activities that consumed tokens (activity, timestamp, tokens used)
- A reload button to refresh token data
- This will be a section on bundles.html or a standalone page

Currently, the header shows a simple "N tokens" count with a refresh button. This is a temporary measure until the full token usage screen is built.

Sections 5.5 (Pass admin UI) and 5.6 (QR code generation) moved to `_developers/backlog/PLAN_PASSES_V2-PART-2.md`.

### Phase 7: Campaign Production Readiness — NOT DONE (deferred)

| Section | Status |
|---------|--------|
| 7.1 Campaign monitoring | Not done |
| 7.2 Campaign documentation | Not done |

### Key commits on `first-pass` branch

| Commit | Description |
|--------|-------------|
| `415688b4` | Phase 3: pass redemption UI, on-pass filtering, token display, pass system tests |
| `82fb7c10` | Phase 2.9.8: CloudWatch metrics and dashboard for bundle capacity |
| `9a000583` | Phase 4: token enforcement for VAT submissions (consumeToken, tokenEnforcement.js) |
| `f7e37a1e` | Phase 5.1: token cost display and exhaustion handling on submitVat.html |
| `34ef7da8` | Phase 5.2–5.3: migrate behaviour tests to passes, add passRedemption behaviour test |
| `1701b295` | Phase 5.4: token count 3→10 for test/day-guest bundles, tokenEnforcement behaviour test assertions |
| `965e4a63` | Phase 1.5/5.7: generate-pass.yml with 4 triggers, params/names jobs; deploy.yml calls generate-pass |

---

## Resolved Questions

1. **Email hash secret rotation**: Store the secret version on each pass record (`emailHashSecretVersion` field). When rotating secrets, old passes remain validatable by looking up the secret version they were created with.
2. **Token consumption granularity**: Only VAT submission (`hmrcVatReturnPost`) costs 1 token. Viewing obligations and viewing VAT returns are free — users need to see their deadlines and review submitted data before deciding whether to act. Charging for informational views feels punitive and discourages exploration. The value action is the submission itself.
3. **Campaign pass validity period**: 3 days. Short enough to create urgency, long enough to act. Not an open question.
4. **Subscription payment provider**: Defer commission/payout functionality until a payment system (Stripe or similar) is integrated. Referral tracking and free-month credits can proceed without external payments.
5. **DIY legacy bundle**: Existing DIY customers email support, admin sends them an `invited-guest` or `resident-guest` pass manually via the GitHub Actions workflow. No PayPal transaction verification needed.

---

*Last updated: 2026-02-01*
*GitHub Issue: #560*
