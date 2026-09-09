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

### 5.5 Pass admin UI (essential only)

Needed to operate passes at any scale — an admin must be able to view, create, and revoke passes without the GitHub Actions workflow.

- [ ] Create `web/public/admin/passes.html`
    - Pass list view: table of passes sorted by createdAt, filterable by status (active/expired/revoked)
    - Pass detail view: click a row to see code, type, bundle, validity, usage, creation metadata
    - Revoke button: single-click revocation with confirmation dialog
    - Create pass form: passTypeId, bundleId, email (optional), maxUses, validityPeriod, notes
    - Calls `POST /api/v1/pass/admin` and `GET /api/v1/pass/admin/list` endpoints
- [ ] Create `app/functions/account/passAdminListGet.js` — paginated pass listing for admin UI
- [ ] Wire admin UI route in Express server and API Gateway
- [ ] Admin authentication: reuse existing JWT auth, add admin role check (e.g. specific email or Cognito group)

### 5.6 QR code generation for admin passes

The GitHub Actions workflow and admin UI should produce a QR code alongside the four-word passphrase.

- [ ] Add QR code generation library (e.g. `qrcode` npm package, small footprint)
- [ ] Generate QR code PNG encoding the pass URL on pass creation
- [ ] GitHub Actions workflow: attach QR code image as workflow artifact
- [ ] Admin UI: display QR code inline with download button

---

## Phase 6: Campaign Passes & Referral System (Backend + Frontend)

**Deferred** until day-guest passes are being used regularly and organic growth data is available. Campaign mechanics are the growth engine, but they require a proven base product first.

**Goal**: Subscribed users can issue short-lived passes to recruit new users. Referrals are tracked. Successful referrals earn rewards.

**Risk mitigated**: Can we create a self-sustaining growth loop where campaigners are incentivised to recruit while the cost is bounded?

### Design

The campaign system turns passes into a commodity that subscribed users spend tokens to create and share. This creates a growth flywheel:

```
Campaigner subscribes (resident-pro, 100 tokens/month)
        │
        ▼
Issues campaign pass (3 free/month included, then 3 tokens each)
        │
        ▼
Pass grants invited-guest bundle (1 month, 3 tokens/month)
but must be redeemed within 3 days (urgency)
        │
        ▼
Shares pass via URL, QR code, social media, word-of-mouth
        │
        ▼
Recipient redeems pass → referrer gets 2 tokens back immediately
        │
        ▼
Recipient submits first VAT return → referrer gets 5 tokens
        │
        ▼
Recipient subscribes (resident-pro) → referrer gets 1 free month
```

### Economics & Value Proposition

| Item | Value | Notes |
|------|-------|-------|
| Pro subscription | ~£129/year | £10.75/month |
| Campaign pass gift value | ~£10.75 | Full month of invited-guest access |
| Campaign pass cost (after 3 free) | 3 tokens | ~£1.08 worth |
| Day pass comparison | ~£0.36 | Too small to drive engagement |

**Key insight**: The recipient gets a **full month** of access (£10.75 value) but must redeem within 3 days. The urgency drives redemption; the generous value drives conversion. This is substantially more compelling than a 1-day/£0.36 gift.

**Pass scarcity**: Pro users get 3 free campaign passes per month as part of their subscription. Additional passes cost 3 tokens each. This makes passes feel valuable ("I'm giving you one of my 3 monthly invites") rather than cheap.

**Progressive referrer rewards**:
- **Immediate**: 2 tokens back when pass is redeemed (not just created)
- **Engagement**: +5 tokens when recipient submits first VAT return
- **Conversion**: +1 free month when recipient subscribes
- **Commission**: 20% of first year (~£25) after 3 conversions (see §6.4)

This layered reward structure provides gratification at every stage of the funnel, not just at final conversion.

### Ambassador Tiers

High-volume referrers unlock better rates through a visible progression system:

| Tier | Threshold | Perk |
|------|-----------|------|
| **Starter** | 0 redemptions | 3 free passes/month |
| **Silver** | 5 redemptions | 5 free passes/month |
| **Gold** | 15 redemptions | 8 free passes/month, 20% more tokens per pass |

Tier progress is shown in the UI: "You've had 3 passes redeemed. 2 more to unlock Silver (5 free passes/month)."

### Target Segments

The flywheel spins faster with the right referrers:

| Segment | Why | Volume | Strategy |
|---------|-----|--------|----------|
| **Accountants** | Trusted recommendation, multiple clients | 1 accountant → 10-50 clients | Dedicated `accountant-partner` pass type, bulk issuance |
| **Bookkeeping communities** | Peer recommendation | Moderate | Community passes via forum/group leaders |
| **Small business forums** | Organic discovery | Low but genuine | Campaign passes from enthusiastic users |
| **Social media** | Broad reach | Variable | Standard campaign passes |

An accountant with 50 clients is worth more than 50 individual social media posts. Consider a future `accountant-partner` pass type with higher maxUses and longer validity.

### Product Stickiness Considerations

VAT submission is quarterly (4x/year) — low engagement. To keep the flywheel spinning:

**A. Expand touchpoints** (future phases):
- VAT obligations reminders (monthly touchpoint)
- MTD record keeping (weekly touchpoint)
- Bank feed integration (daily touchpoint)

**B. Make the quarterly moment delightful**:
- "Your VAT return took 47 seconds. The average accountant charges £150 for this."
- Celebration UI after successful submission
- Year-on-year comparisons and savings tracking

**C. Measure the right metric**: Track VAT submissions per referred user, not just pass redemptions. A referral that doesn't submit is a vanity metric.

### Alternative: Affiliate Track (Deferred)

If organic referral velocity is too low, a separate affiliate model could complement campaigns:
- Anyone signs up as an affiliate (free, no subscription needed)
- Affiliates get unique tracking codes
- Affiliates earn 20% of first-year subscription per conversion
- No token cost — they're marketing partners, not users

This separates "users who love the product" from "marketers who want commission". Deferred until referral data shows whether organic growth is sufficient.

### 6.1 Campaign pass issuance (Backend)

- [ ] Create `app/functions/account/passIssuePost.js`
  - Authenticated endpoint (any user with a token-bearing bundle)
  - Input: `{ notes? }` (pass type is always `campaign`)
  - Check free passes remaining this month (3/month for Starter, more for Silver/Gold)
  - If free passes exhausted: validate caller has >= 10 tokens, consume 10 tokens
  - Creates a campaign pass:
    - `passTypeId = "campaign"`
    - `bundleId = "invited-guest"`
    - `maxUses = 1`
    - `validUntil = now + P3D` (3-day redemption window)
    - `issuedBy = callerHashedSub`
  - Returns: `{ code, url, validUntil, tokensRemaining, freePassesRemaining }`
- [ ] Track monthly pass issuance per user (counter with monthly reset, same lazy-eval pattern as token refresh)
- [ ] Add API Gateway route: `POST /api/v1/pass/issue`
- [ ] Add Express server route for local development
- [ ] Wire Lambda in `AccountStack.java`

### 6.2 Referral tracking & progressive rewards (Backend)

- [ ] Add `issuedBy` field to pass record (set when a user issues a campaign pass)
- [ ] On pass redemption, if `issuedBy` is set:
  - Record referral: `{ referrerId: issuedBy, referredUserId: redeemer, passCode, redeemedAt }`
  - Store in bundles table or a dedicated referral GSI
  - **Immediate reward**: Credit referrer with 2 tokens (small gratification for sharing)
- [ ] On referred user's first VAT return submission:
  - **Engagement reward**: Credit referrer with 5 tokens
  - This confirms the referral created real value (someone actually used the product)
- [ ] On subscription purchase (when referred user upgrades to resident-pro):
  - **Conversion reward**: Credit the referrer with 1 free month
  - Cap referral credits at 12 months per referrer
- [ ] Track cumulative redemptions per referrer for ambassador tier progression

### 6.3 Referral rewards (Backend)

- [ ] Implement subscription credit system
  - `referralCreditsEarned` field on user record
  - `referralCreditsApplied` field (tracks what's been used)
  - When processing subscription renewal, apply 1 credit before charging
  - Cap: `referralCreditsEarned <= 12`
- [ ] Referral reward trigger: credited after the referred user's first VAT return submission (not just sign-up)
  - This aligns with campaign.md recommendation to reward real value creation, not just sign-ups

### 6.4 Commission (deferred until payment integration)

Per `_developers/archive/campaign.md`, once there are enough referrals:
- 20% of first year's subscription value (e.g., ~£25 at £129/year)
- Payable only after referrer has >= 3 converted users
- Payable as account credit by default, cash payout above £50 threshold
- **Visible threshold**: "2 of your referrals have converted. 1 more to unlock the Ambassador Commission program (20% of future conversions)."
- This is deferred until subscription payments are implemented
- See "Alternative: Affiliate Track" in the Design section for a complementary model

### 6.5 Campaign pass UI (Frontend)

- [ ] Add "Issue Invitation" section to bundles.html (visible to users with token-bearing bundles)
  - Show free passes remaining: "2 of 3 free invitations remaining this month"
  - If free passes exhausted: "Additional invitations cost 10 tokens (N remaining)"
  - "Issue Pass" button
  - On success: display the pass URL, copy-to-clipboard button, share links
  - Show pass expiry: "Your guest gets a full month of access — they just need to redeem within 3 days"
- [ ] Add "My Issued Passes" section
  - List of passes the user has issued
  - Status: active, expired, redeemed
  - Who redeemed (if applicable, anonymised)
- [ ] Add "Referral Rewards" section
  - Number of successful referrals
  - Free months earned / applied / remaining
  - Ambassador tier progress: "3 passes redeemed — 2 more to Silver (5 free passes/month)"
- [ ] Post-submission delight messaging
  - "Your VAT return took 47 seconds. The average accountant charges £150 for this."
  - "Share a free invitation with someone who would find this useful"

### 6.6 QR code generation

- [ ] Add QR code generation for campaign passes
  - Generate QR code PNG encoding the pass URL
  - Display inline on the "Issue Invitation" result
  - Download button for sharing physically
- [ ] QR code generation for admin-created passes (GitHub Actions workflow output)

### 6.7 Abuse controls

- [ ] Free pass allowance: 3/month (Starter), 5/month (Silver), 8/month (Gold) — tracked with monthly reset
- [ ] Rate limit additional (paid) pass issuance: max 5 passes per user per day beyond free allowance
- [ ] No self-referral: pass issuer cannot redeem their own passes
- [ ] One referrer per account: first referral is immutable
- [ ] Campaign passes cannot be issued with email restriction (they must be shareable)
- [ ] Expired campaign passes are auto-deleted via DynamoDB TTL (validUntil + 30 days)
- [ ] Token rewards only for genuine referrals — tokens credited after confirmed actions (redemption, VAT submission), not pass creation

### 6.8 Tests

- [ ] `app/unit-tests/services/passService.test.js` - campaign pass creation, token deduction
- [ ] `app/system-tests/campaign/campaignPassIssuance.test.js` - issue pass, verify token deduction
- [ ] `app/system-tests/campaign/referralTracking.test.js` - issue, redeem, verify referral recorded
- [ ] `behaviour-tests/campaign/issuePass.spec.js` - UI flow for issuing and sharing passes

### 6.9 Accountant partner pass type

One accountant can drive 50 subscriptions — a higher-value channel than individual social media shares. This pass type enables bulk issuance with a longer redemption window.

```toml
[[passTypes]]
id = "accountant-partner"
bundleId = "invited-guest"
defaultValidityPeriod = "P3M"        # 3-month redemption window (vs 3 days for campaign)
defaultMaxUses = 50                   # Bulk issuance for client base
requiresEmailRestriction = false      # Shareable across clients
```

- [ ] Add `accountant-partner` to pass type registry in `passService.js`
- [ ] Admin-only issuance (via `passAdminPost` or a dedicated partner onboarding flow)
- [ ] Manual review before issuing: verify the accountant is legitimate (no self-serve)
- [ ] Track referrals back to the accountant's partner pass for commission attribution (§6.4)
- [ ] Partner-specific dashboard showing: passes issued, redemptions, client submissions, commission earned

### 6.10 Pass admin UI

**Essential** (needed to operate at any scale):

- [ ] Pass list view — search/filter by status (active, expired, revoked), passTypeId, bundleId, creator
- [ ] Pass detail view — code, type, bundle, validity, usage (useCount/maxUses), creation metadata
- [ ] Revoke pass — single-click revocation with confirmation
- [ ] Create pass form — mirrors `passAdminPost` API: passTypeId, bundleId, email (optional), maxUses, validityPeriod, notes

**Nice-to-have** (useful as volume grows):

- [ ] Bulk pass creation — CSV upload or quantity input for creating multiple passes at once
- [ ] Pass analytics — redemption rate, time-to-redemption, conversion funnel (redeemed → submitted VAT → subscribed)
- [ ] Export — CSV export of pass data for reporting
- [ ] Audit log — who created/revoked which passes and when

**Deferred** (only needed at significant scale):

- [ ] Partner management UI — onboard/offboard accountant partners, view their pass usage
- [ ] Automated partner pass provisioning — self-serve partner signup with verification workflow
- [ ] Real-time capacity dashboard — live view of bundle cap usage across all pass types

### Validation

A resident-pro user can issue a campaign pass, share the URL, another user redeems it and gets invited-guest access. Referral is tracked. After the referred user subscribes and submits a VAT return, the referrer receives a free month credit.

---

## Phase 7: Campaign Production Readiness

**Note**: Core production readiness (credentials, monitoring, documentation) has been pulled forward to §5.7-5.8 so the product can go live at end of Phase 5. This phase covers campaign-specific production concerns.

**Goal**: Campaign features live in production with campaign-specific monitoring.

### 7.1 Campaign monitoring

- [ ] CloudWatch alarms for:
  - Campaign pass abuse (unusual issuance volume per user)
  - Referral reward fraud (self-referral attempts, duplicate referrals)
- [ ] Admin dashboard additions:
  - Campaign passes created / redeemed / expired
  - Referral conversion funnel (redeemed → submitted VAT → subscribed)
  - Ambassador tier distribution

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

## Resolved Questions

1. **Email hash secret rotation**: Store the secret version on each pass record (`emailHashSecretVersion` field). When rotating secrets, old passes remain validatable by looking up the secret version they were created with.
2. **Token consumption granularity**: Only VAT submission (`hmrcVatReturnPost`) costs 1 token. Viewing obligations and viewing VAT returns are free — users need to see their deadlines and review submitted data before deciding whether to act. Charging for informational views feels punitive and discourages exploration. The value action is the submission itself.
3. **Campaign pass validity period**: 3 days. Short enough to create urgency, long enough to act. Not an open question.
4. **Subscription payment provider**: Defer commission/payout functionality until a payment system (Stripe or similar) is integrated. Referral tracking and free-month credits can proceed without external payments.
5. **DIY legacy bundle**: Existing DIY customers email support, admin sends them an `invited-guest` or `resident-guest` pass manually via the GitHub Actions workflow. No PayPal transaction verification needed.

---

*Last updated: 2026-02-01*
*GitHub Issue: #560*
