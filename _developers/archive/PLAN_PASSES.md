<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Passes and Invitations Plan

> **GitHub Issue**: [#560](https://github.com/antonycc/submit.diyaccounting.co.uk/issues/560)
> **Related**: `_developers/backlog/PASSES_AND_CREDITS.md`

## Introduction

Users need access to production HMRC APIs, but we can't offer unlimited free access. This plan introduces **passes** - invitation codes that grant bundle access with optional restrictions (email-locked, limited uses, or both).

**Key goals**:
1. Control access during closed beta (Guest bundle disabled)
2. Reward existing DIY customers with permanent access
3. Enable promotional giveaways (t-shirts, events)
4. Support internal testing with Staff passes

## Bundle Hierarchy

```
                              ┌─────────────────────────────────────┐
                              │            ALL USERS                │
                              │                                     │
                              │  ┌───────────────────────────────┐  │
                              │  │         DEFAULT BUNDLE        │  │
                              │  │  - View receipts              │  │
                              │  │  - Manage bundles             │  │
                              │  │  (automatic, no credits)      │  │
                              │  └───────────────────────────────┘  │
                              └─────────────────────────────────────┘
                                               │
                 ┌─────────────────────────────┼─────────────────────────────┐
                 │                             │                             │
                 ▼                             ▼                             ▼
    ┌────────────────────┐       ┌────────────────────┐       ┌────────────────────┐
    │    TEST BUNDLE     │       │   GUEST BUNDLE     │       │    PRO BUNDLE      │
    │                    │       │                    │       │                    │
    │  Sandbox APIs      │       │  Production APIs   │       │  Production APIs   │
    │  100 credits/day   │       │  3 credits/month   │       │  100 credits/month │
    │  On-request        │       │  On-request        │       │  Subscription      │
    │                    │       │  (0 during beta)   │       │                    │
    └────────────────────┘       └────────────────────┘       └────────────────────┘
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            │                             │                             │
            ▼                             ▼                             ▼
   ┌─────────────────┐       ┌─────────────────────┐       ┌─────────────────┐
   │ INVITED GUEST   │       │  RESIDENT GUEST     │       │  RESIDENT PRO   │
   │                 │       │                     │       │                 │
   │ Via pass only   │       │  Via pass only      │       │  Via pass only  │
   │ 3 uses total    │       │  Email-locked       │       │  Email-locked   │
   │ Promotional     │       │  Bypasses cap       │       │  Free Pro tier  │
   │ (t-shirts etc)  │       │  (DIY customers)    │       │  (beta testers) │
   └─────────────────┘       └─────────────────────┘       └─────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │                           STAFF BUNDLE                                  │
   │                                                                         │
   │  Via pass only | Email-locked | Sandbox only | Internal testing         │
   └─────────────────────────────────────────────────────────────────────────┘
```

## Pass Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PASS GENERATION                                   │
│                                                                             │
│   GitHub Actions Workflow                                                   │
│   ─────────────────────────                                                 │
│   Inputs:                                                                   │
│     • passType: invited-guest | resident-guest | resident-pro | staff       │
│     • usages: 3 (default, optional)                                         │
│     • email: user@example.com (optional)                                    │
│     • quantity: 1 (default)                                                 │
│                                                                             │
│   Outputs:                                                                  │
│     • Pass codes (three-little-words)                                       │
│     • URLs: https://submit.diyaccounting.co.uk/pass/{code}                  │
│     • QR code images (PNG)                                                  │
│     • Email to admin (and optionally user)                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PASS STORAGE                                      │
│                                                                             │
│   DynamoDB: Passes Table                                                    │
│   ──────────────────────                                                    │
│   • passCode (PK): "tiger-happy-mountain"                                   │
│   • passType: "invited-guest"                                               │
│   • bundleId: "guest"                                                       │
│   • usagesRemaining: 3 (or null for unlimited)                              │
│   • emailRestriction: "user@example.com" (or null)                          │
│   • expiresAt: "2026-12-31T23:59:59Z" (pass expiry, not bundle)             │
│   • createdBy: "github-actions-run-12345"                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PASS REDEMPTION                                   │
│                                                                             │
│   User Journey:                                                             │
│   ─────────────                                                             │
│   1. User receives pass (URL, QR code, or three words)                      │
│   2. User visits /pass/{code} or enters code on Bundles page                │
│   3. If not logged in → redirect to login → return to pass page             │
│   4. Validate: email match (if restricted), usages remaining, not expired   │
│   5. Grant bundle to user's account                                         │
│   6. Decrement usagesRemaining (if applicable)                              │
│   7. Redirect to home page with success message                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Pass Types Summary

| Pass Type | Bundle Granted | Credits | Restrictions | Use Case |
|-----------|---------------|---------|--------------|----------|
| **Invited Guest** | guest | 3/month | Limited uses (default: 3) | T-shirts, events, promos |
| **Resident Guest** | guest | 3/month | Email-locked, bypasses cap | Existing DIY customers |
| **Resident Pro** | pro | 100/month | Email-locked | Beta testers, partners |
| **Staff** | test | 100/day | Email-locked, sandbox only | Internal testing |

## Pass Formats

| Format | Example | Use Case |
|--------|---------|----------|
| **URL** | `https://submit.diyaccounting.co.uk/pass/tiger-happy-mountain` | Email, web links |
| **Three Little Words** | `tiger-happy-mountain` | Verbal sharing, manual entry |
| **QR Code** | [PNG image] | Merchandise, print materials |

## What We Already Support

| Feature | Status | Notes |
|---------|--------|-------|
| Bundle catalogue (`submit.catalogue.toml`) | ✅ Exists | Has test, guest, business bundles |
| Bundle allocation types | ✅ Exists | `automatic`, `on-request`, `subscription` |
| Bundle timeout/expiry | ✅ Exists | ISO 8601 duration (P1D, P1M) |
| Bundle cap | ✅ Exists | Max concurrent users |
| Environment-specific listing | ✅ Exists | `listedInEnvironments` field |
| Display rules for activities | ✅ Exists | `never`, `on-entitlement`, `always-with-upsell`, `always`. `always-with-upsell` shows activity name to all users: not logged in → "Login and add bundle to access"; logged in without bundle → "Requires: Guest or Business"; logged in with bundle → active button |
| Bundles DynamoDB table | ✅ Exists | User bundle assignments |
| Bundle management UI | ✅ Exists | `/account/bundles.html` |
| Navigation to Bundles | ✅ Exists | Main nav bar link |
| `allocation = "pass"` type | ❌ Missing | New allocation type needed |
| Passes DynamoDB table | ❌ Missing | Store pass codes |
| Pass Lambda functions | ❌ Missing | `passGet`, `passPost`, `passAdminPost` |
| Pass redemption UI | ❌ Missing | `/pass/{code}` page |
| Three-little-words generation | ❌ Missing | Human-readable codes |
| QR code generation | ❌ Missing | For merchandise |
| GitHub Actions workflow | ❌ Missing | Generate passes |
| Credit consumption tracking | ❌ Missing | Track API usage per bundle |
| Midnight expiry logic | ❌ Missing | Reset at local midnight |

## Phased Delivery

Each phase tackles a specific technical risk before building on it.

### Phase 1: Hidden Bundles (Low Risk)

**Technical Risk**: Can we define bundles that don't appear in the catalogue UI?

**Deliverables**:
- [ ] Add `allocation = "pass"` type to catalogue schema
- [ ] Add hidden pass bundles to `submit.catalogue.toml`:
  - `invited-guest`
  - `resident-guest`
  - `resident-pro`
  - `staff`
- [ ] Update `productCatalog.js` to parse new allocation type
- [ ] Update Bundles UI to NOT show `allocation = "pass"` bundles
- [ ] Unit tests for hidden bundle filtering

**Validation**: Bundles page shows only requestable bundles, hidden bundles exist in catalogue.

---

### Phase 2: Passes Table & Generation (Medium Risk)

**Technical Risk**: Can we generate and store pass codes with restrictions?

**Deliverables**:
- [ ] Create Passes DynamoDB table in `DataStack.java`
- [ ] Implement three-little-words generation library
- [ ] Create `passAdminPost.js` Lambda (admin-only pass creation)
- [ ] Create GitHub Actions workflow `generate-pass.yml`:
  - Inputs: passType, usages, email, quantity
  - Outputs: pass codes artifact, URLs artifact
- [ ] Email notification to admin on pass generation

**Validation**: Run workflow, verify pass stored in DynamoDB, codes are human-readable.

---

### Phase 3: Pass Redemption (Medium Risk)

**Technical Risk**: Can users redeem passes with email/usage validation?

**Deliverables**:
- [ ] Create `passGet.js` Lambda (public, returns pass info)
- [ ] Create `passPost.js` Lambda (authenticated, redeems pass)
- [ ] Create `/pass/index.html` redemption page
- [ ] Handle URL routing for `/pass/{code}`
- [ ] Validation logic:
  - Email restriction check
  - Usages remaining check
  - Expiry check
- [ ] Decrement usages on successful redemption
- [ ] Redirect to home with success/error message

**Validation**: Generate pass, redeem as user, verify bundle granted.

---

### Phase 4: Credit Consumption (High Risk)

**Technical Risk**: Can we track and enforce per-bundle API usage limits?

**Deliverables**:
- [ ] Add `credits` field to bundle schema (replacing `cap`)
- [ ] Add credit tracking to bundle assignment record
- [ ] Implement credit consumption in HMRC API Lambdas
- [ ] Implement credit check before API call
- [ ] Return meaningful error when credits exhausted
- [ ] Update UI to show remaining credits

**Validation**: User with 3 credits can make 3 API calls, 4th fails with clear message.

---

### Phase 5: Expiry Logic (Medium Risk)

**Technical Risk**: Can we implement midnight and calendar-month expiry?

**Deliverables**:
- [ ] Add `expiryType` field: `duration`, `midnight`, `calendar-month`
- [ ] Implement midnight expiry (user's local timezone from fraud headers)
- [ ] Implement calendar-month expiry (1st of next month)
- [ ] Credit reset on expiry (not bundle removal)
- [ ] Background job or lazy evaluation for expiry

**Validation**: Guest bundle credits reset at midnight, Pro credits reset on 1st.

---

### Phase 6: QR Codes & Polish (Low Risk)

**Technical Risk**: Can we generate printable QR codes?

**Deliverables**:
- [ ] Add QR code generation to pass workflow
- [ ] QR code artifact output (PNG)
- [ ] Optional email to pass recipient
- [ ] Manual entry UI for three-little-words on Bundles page

**Validation**: QR code scans to correct URL, pass redeems successfully.

---

### Phase 7: Closed Beta Configuration (Low Risk)

**Technical Risk**: None - configuration only.

**Deliverables**:
- [ ] Set Guest bundle credits to 0 in production
- [ ] Verify pass-based access still works
- [ ] Document beta invite process

**Validation**: Anonymous users can't get Guest, pass holders can.

## Files to Create

| File | Purpose |
|------|---------|
| `app/functions/account/passGet.js` | Validate and return pass details |
| `app/functions/account/passPost.js` | Redeem pass, grant bundle |
| `app/functions/account/passAdminPost.js` | Generate new passes (admin) |
| `app/lib/threeWords.js` | Generate human-readable codes |
| `web/public/pass/index.html` | Pass redemption UI |
| `.github/workflows/generate-pass.yml` | Manual pass generation workflow |

## Files to Modify

| File | Changes |
|------|---------|
| `web/public/submit.catalogue.toml` | Add pass bundles, credits field |
| `app/services/productCatalog.js` | Parse new fields, filter pass bundles |
| `app/services/bundleManagement.js` | Credit tracking, expiry logic |
| `infra/main/java/.../DataStack.java` | Add Passes table |
| `infra/main/java/.../AccountStack.java` | Add pass Lambda functions |
| `web/public/account/bundles.html` | Hide pass bundles, add manual code entry |

## Open Questions

1. **DIY Legacy bundle**: How to verify PayPal transaction IDs? (Deferred)
2. **Credit rollover**: Do unused credits roll over? (Probably not)
3. **Pass sharing rewards**: Reward users when their pass is used? (Future)
4. **Merchandise integration**: Print-on-demand webhook for per-order passes? (Future)

---

*Last updated: 2026-01-26*
*GitHub Issue: #560*
