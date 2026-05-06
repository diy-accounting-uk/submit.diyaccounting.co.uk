# Campaign Passes, Referral System & Commission Plan

> **Source**: Sections 6 & 7 of `_developers/backlog/PLAN_PASSES_V2-PART-2.md`
> **GitHub Issue**: [#560](https://github.com/support-at-diyaccounting/submit.diyaccounting.co.uk/issues/560)
> **Prerequisite**: Pass infrastructure (Phases 1-5) is complete and deployed
> **Prerequisite**: `PLAN_RESIDENT_VAT_ROLLOUT.md` is complete — resident-vat is the primary subscription

## Current State (post-resident-vat rollout)

The bundle landscape has changed since this plan was drafted:

| Bundle | Price | Visibility | Allocation | Status |
|--------|-------|-----------|------------|--------|
| `day-guest` | Free | Public (`enable = "always"`) | `on-request` (capped at 100) | Live — click to add |
| `resident-vat` | £0.99/mo | Public (`enable = "always"`) | `on-subscription` | Live — Subscribe button visible to all |
| `resident-pro` | £9.99/mo | Hidden (`hidden = true`) | `on-pass-on-subscription` | Live — pass-gated, not publicly promoted |
| `resident-pro-comp` | Free | Hidden | `on-email-match` | Live — admin-issued to beta testers |

**Key change**: Users no longer need a pass to see or subscribe to `resident-vat`. The primary
user journey is: sign up → see Subscribe button → Stripe checkout → done. Passes are now
primarily for: (a) day-guest capacity overflow, (b) campaign referrals, (c) admin-issued access.

## What Already Exists

| Component | Status | File |
|-----------|--------|------|
| Pass creation, validation, redemption (5 Lambdas) | Complete | `app/functions/account/pass*.js` |
| Token enforcement service | Complete | `app/services/tokenEnforcement.js` — exports `consumeTokenForActivity()` |
| DynamoDB passes table with `issuedBy-index` GSI | Complete | `DataStack.java` — GSI PK: `issuedBy`, SK: `createdAt` |
| User-issued passes (`passGeneratePost.js`) | Complete | Sets `issuedBy: hashedSub` on pass record, consumes tokens via `consumeTokenForActivity()` |
| `campaign-pass` type in `submit.passes.toml` | Exists but **needs value updates** (see below) |
| Bundle capacity management (`cap` on day-guest) | Complete | `bundles.html` + `bundleCapacity` table |
| Email hashing with secret versioning | Complete | `subHasher.js` |
| QR code generation | Complete | `web/public/passes/generate-digital.html`, `generate-physical.html` |
| Multi-price Stripe checkout | Complete | `billingCheckoutPost.js` — resolves `STRIPE_[TEST_]PRICE_ID_{BUNDLE}` by bundleId |
| Env-level billing webhook | Complete | `BillingWebhookStack` — always available for subscription lifecycle events |

**What does NOT exist yet (this plan's scope):**

- [ ] Campaign pass issuance endpoint with free-pass allowance and monthly reset
- [ ] Referral tracking (who referred whom)
- [ ] Progressive referral rewards (tokens on redemption, on VAT submission, on subscription)
- [ ] Ambassador tier system (Starter/Silver/Gold)
- [ ] Campaign UI section on bundles.html
- [ ] `referred-index` GSI on bundles table

---

## 1. Data Model Changes

### 1.1 Referral Records

Store referrals in the existing **bundles table** using a new item type.

```
Table: {env}-env-bundles
PK: referral#{referrerHashedSub}
SK: referred#{referredHashedSub}

Fields:
  referrerHashedSub     String   Who issued the campaign pass
  referredHashedSub     String   Who redeemed it
  passCode              String   The campaign pass code that linked them
  redeemedAt            String   ISO8601 — when the pass was redeemed
  firstVatSubmissionAt  String   ISO8601 — when referred user first submitted VAT (null until it happens)
  subscribedAt          String   ISO8601 — when referred user subscribed (null until it happens)
  rewardsGranted        Map      { redemption: bool, vatSubmission: bool, subscription: bool }
  createdAt             String   ISO8601
```

**Why the bundles table?** It already has `hashedSub` PK pattern and Lambda IAM permissions.

### 1.2 New GSI: `referred-index`

```
GSI Name: referred-index
PK: referredHashedSub
Projection: ALL
```

Purpose: Look up "who referred this user?" when referred user submits VAT or subscribes.

**CDK change**: Add GSI to bundles table in `DataStack.java` (same pattern as `issuedBy-index` on passes table).

### 1.3 Ambassador Tier Tracking

Additional fields on the user's token-bearing bundle record:

```
campaignPassesIssuedThisMonth   Number   Resets monthly (lazy-eval, same pattern as token refresh)
campaignPassesResetAt           String   ISO8601 — next monthly reset
totalReferralRedemptions        Number   Lifetime count (drives tier progression)
referralCreditsEarned           Number   Free months earned (cap: 12)
referralCreditsApplied          Number   Free months already used
```

Tier calculated at read time:

| Tier | Threshold | Free passes/month |
|------|-----------|-------------------|
| Starter | 0 | 3 |
| Silver | 5 redemptions | 5 |
| Gold | 15 redemptions | 8 |

### 1.4 Campaign Pass Type Update

Current `submit.passes.toml` values need updating:

```toml
# Current (wrong):
id = "campaign-pass"
bundleId = "day-guest"
defaultValidityPeriod = "P7D"
defaultMaxUses = 1000
tokenCostToIssue = 25

# Target:
id = "campaign-pass"
bundleId = "invited-guest"          # Full month of access (not day-guest)
defaultValidityPeriod = "P3D"       # 3-day redemption window (urgency)
defaultMaxUses = 1                  # Single use per pass
tokenCostToIssue = 3                # Cost after free allowance exhausted
```

---

## 2. API Endpoints

### 2.1 Issue Campaign Pass — `POST /api/v1/pass/campaign`

New file: `app/functions/account/passCampaignPost.js`

Follow the pattern of `passGeneratePost.js` which already:
- Authenticates user via JWT
- Resolves hashedSub
- Checks token-bearing bundle
- Calls `consumeTokenForActivity()`
- Sets `issuedBy: hashedSub` on pass record
- Returns pass code, URL, QR data

**Additional logic for campaign passes:**
1. Check `campaignPassesIssuedThisMonth` (lazy-reset if past `campaignPassesResetAt`)
2. Compute free allowance from ambassador tier
3. If free passes remaining: create pass, increment counter, no token charge
4. If free passes exhausted: consume 3 tokens, then create pass
5. Return campaign-specific metadata (freePassesRemaining, ambassadorTier)

### 2.2 Get Referral Dashboard — `GET /api/v1/referrals`

New file: `app/functions/account/referralsGet.js`

Query `PK = referral#{hashedSub}` from bundles table, compute tier, return stats.

### 2.3 Referral Reward Triggers (modifications to existing files)

**On pass redemption** — `passPost.js`:
- After granting bundle, check if `pass.issuedBy` is set
- If yes: write referral record, credit referrer with 2 tokens

**On first VAT submission** — `hmrcVatReturnPost.js`:
- Query `referred-index` GSI for current user
- If referral exists and `firstVatSubmissionAt` is null: credit referrer with 5 tokens

**On subscription purchase** — `billingWebhookPost.js` (env-level `BillingWebhookStack`):
- In `handleCheckoutComplete`, query `referred-index` for subscribing user
- If referral exists and `subscribedAt` is null: increment referrer's `referralCreditsEarned`

---

## 3. UI Changes

### 3.1 Campaign Section on `bundles.html`

Add "Issue an Invitation" section below existing pass section. Visible to users with a
token-bearing bundle (resident-vat, resident-pro, resident-pro-comp).

### 3.2 Post-Submission Prompt

After successful VAT submission, show "Share an Invitation" link to `bundles.html#issue-invitation`.

### 3.3 Referral Dashboard

Ambassador tier progress, reward history, recent referrals. Can be a section in bundles.html
or a separate page.

---

## 4. Abuse Controls

| Control | Implementation |
|---------|----------------|
| No self-referral | `passPost.js`: reject if `pass.issuedBy === redeemerHashedSub` |
| One referrer per account | `referred-index` query: reject if referred user already has a referral record |
| Free pass monthly limit | Lazy-reset counter on bundle record; tier-based cap (3/5/8) |
| Paid pass daily limit | Count passes created today by user; cap at 5 paid passes/day |
| Reward idempotency | `rewardsGranted` map prevents double-crediting |

---

## 5. Test Approach

### 5.1 Unit Tests

| Test | File | What it verifies |
|------|------|-----------------|
| Campaign pass issuance (free) | `passCampaignPost.test.js` | Free allowance tracking, monthly reset, pass creation |
| Campaign pass issuance (paid) | `passCampaignPost.test.js` | Token consumption when free allowance exhausted |
| Referral record creation | `passPost.test.js` | Referral written on pass redemption when `issuedBy` set |
| Referral dashboard | `referralsGet.test.js` | Tier calculation, stats aggregation |
| Self-referral rejection | `passPost.test.js` | Cannot redeem own campaign pass |
| VAT submission reward | `hmrcVatReturnPost.test.js` | Referrer credited on first VAT submission |
| Subscription reward | `billingWebhookPost.test.js` | Referrer credited on subscription purchase |

### 5.2 Behaviour Tests

| Test | Scope | Environment |
|------|-------|-------------|
| Issue campaign pass, share code, redeem as different user, verify referral | E2E campaign flow | Simulator |
| Verify free allowance exhaustion → token charge kicks in | Campaign economics | Simulator |
| Verify referral dashboard shows correct stats | UI verification | Simulator |

### 5.3 Test Gaps to Address

- Need a **two-user test** for referral flow (issuer and redeemer are different users)
- Need to verify `referred-index` GSI query works for reward triggers
- Need to test monthly reset of campaign pass allowance

---

## 6. Execution Plan (Single Session)

### Block 1: Infrastructure (no external dependencies)

1. Update `campaign-pass` values in `submit.passes.toml`
2. Add `referred-index` GSI to bundles table in `DataStack.java`
3. Add `passCampaignPost` Lambda to CDK (`AccountStack.java`)
4. Add `referralsGet` Lambda to CDK (`AccountStack.java`)
5. Add route entries to `SubmitSharedNames.java`
6. `./mvnw clean verify` — confirm CDK synthesis

### Block 2: Backend (campaign pass + referral tracking)

7. Create `app/functions/account/passCampaignPost.js` — issue campaign pass
8. Create `app/functions/account/referralsGet.js` — referral dashboard
9. Create `app/data/dynamoDbReferralRepository.js` — referral CRUD
10. Modify `app/functions/account/passPost.js` — write referral record on redemption
11. Add unit tests for all new/modified functions
12. `npm test` — confirm all tests pass

### Block 3: Reward triggers (modifications to existing Lambdas)

13. Modify `hmrcVatReturnPost.js` — credit referrer on first VAT submission
14. Modify `billingWebhookPost.js` — credit referrer on subscription
15. Add unit tests for reward triggers
16. `npm test` — confirm all tests pass

### Block 4: Frontend

17. Add "Issue an Invitation" section to `bundles.html`
18. Add referral dashboard section to `bundles.html`
19. Add post-submission prompt to VAT receipt display

### Block 5: Behaviour tests + deploy

20. Add campaign behaviour test (simulator)
21. Run `npm run test:paymentBehaviour-simulator` (verify no regression)
22. Commit, push, verify CI pipeline

**PAUSE POINT**: User reviews and runs stripe-related changes if any.

---

## 7. Commission Programme (Phase C — future, out of scope for this session)

Commission via Stripe Connect or account credit. Deferred until referral-attributed subscription
revenue exceeds ~£40/month. See `_developers/backlog/PLAN_PASSES_V2-PART-2.md` for full details.

---

*Updated: 2026-03-25 (post-resident-vat rollout)*
