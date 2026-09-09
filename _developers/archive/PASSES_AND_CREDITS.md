<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Passes and Credits System

> **Purpose**: This document captures all decisions for GitHub Issue #560 - "Generate an invitation to add a bundle (conditions may apply)". It serves as a context save-point for implementation across sessions.

TODO:
* 3 Uses for a pass we want people to share seems a bit mean, let's see what's optimal.
* Add a reward for when someone uses the pass you shared.
* Add cash back to the pass issuer if the guest converts and pays for pro (such passes would have a higher limit)


## Terminology

| Term | Definition |
|------|------------|
| **Pass** | An invitation code that grants bundle access. Formats: URL, three-little-words, QR code |
| **Credit** | A single HMRC API submission attempt (Lambda→HMRC outbound call, retries included) |
| **Bundle** | A collection of credits with allocation rules and expiry |

## Credit Allocations

| Bundle | Credits | Expiry | Notes |
|--------|---------|--------|-------|
| **Guest** | 3 | Midnight (local time) | For first-time/casual users. Capped at 0 during closed beta |
| **Pro** | 100 | Calendar month end | For subscribers. ~3 submissions/day covers daily use + queries |
| **Test** | 100 | 24 hours (P1D) | Matches Pro for realistic sandbox testing |
| **Bookkeeper** | Unlimited | Calendar month | Future tier for users who max out Pro |

### Credit Consumption Rules
- 1 credit = 1 HMRC API outbound attempt initiated
- Retries within the same request are included (no additional credit)
- All HMRC API calls consume credits equally (submit VAT, view obligations, view return)

## Pass Types

| Pass Type | Target Audience | Credits | Expiry | Restrictions |
|-----------|-----------------|---------|--------|--------------|
| **Invited Guest** | Promotional (t-shirt, event) | 3 | Midnight | Limited uses (default: 3) |
| **Resident Guest** | Existing DIY customers | 3/day | Never | Email-locked, bypasses daily cap |
| **Resident Pro** | Beta testers, partners | 100/month | Never | Email-locked |
| **Staff** | Internal testing | 100 | 24h | Email-locked, sandbox only |

### Pass Formats

1. **URL**: `https://submit.diyaccounting.co.uk/pass/{code}`
2. **Three Little Words**: Human-memorable codes (e.g., "tiger-happy-mountain")
3. **QR Code**: Encodes the URL, printable on merchandise

## Catalogue Changes Required

### Current State (`web/public/submit.catalogue.toml`)

```toml
[[bundles]]
id = "guest"
allocation = "on-request"
cap = 10           # ← Change to 3
timeout = "P1D"    # ← Change to midnight expiry logic
```

### Target State

```toml
[[bundles]]
id = "guest"
name = "Guest"
allocation = "on-request"
credits = 3
expiryType = "midnight"  # New field
listedInEnvironments = ["local", "test", "proxy", "proxyRunning", "ci"]

[[bundles]]
id = "pro"               # Renamed from "business"
name = "Pro"
allocation = "subscription"
credits = 100
expiryType = "calendar-month"
subscriptionTier = "pro"

[[bundles]]
id = "test"
name = "Test"
allocation = "on-request"
credits = 100            # Match Pro
timeout = "P1D"

# New: Pass-grantable bundles (not listed in catalogue UI)
[[bundles]]
id = "invited-guest"
name = "Invited Guest"
allocation = "pass"
credits = 3
expiryType = "midnight"
listedInEnvironments = []  # Hidden from catalogue

[[bundles]]
id = "resident-guest"
name = "Resident Guest"
allocation = "pass"
credits = 3
expiryType = "midnight"
qualifiers = { emailLocked = true, bypassesCap = true }
listedInEnvironments = []

[[bundles]]
id = "resident-pro"
name = "Resident Pro"
allocation = "pass"
credits = 100
expiryType = "calendar-month"
qualifiers = { emailLocked = true }
listedInEnvironments = []

[[bundles]]
id = "staff"
name = "Staff"
allocation = "pass"
credits = 100
expiryType = "P1D"
qualifiers = { emailLocked = true, sandboxOnly = true }
listedInEnvironments = []
```

## Infrastructure Design

### New DynamoDB Table: Passes

| Attribute | Type | Purpose |
|-----------|------|---------|
| `passCode` (PK) | String | The pass code (three-little-words or UUID) |
| `passType` | String | invited-guest, resident-guest, resident-pro, staff |
| `bundleId` | String | Bundle to grant when redeemed |
| `createdAt` | String | ISO timestamp |
| `createdBy` | String | GitHub Actions run ID or admin email |
| `usagesRemaining` | Number | Decrements on use (null = unlimited) |
| `emailRestriction` | String | If set, only this email can redeem |
| `expiresAt` | String | When the pass itself expires (not the granted bundle) |
| `ttl` | Number | DynamoDB TTL for cleanup |

### New Lambda Functions

| Function | Purpose |
|----------|---------|
| `passGet.js` | Validate pass code, return pass details (public) |
| `passPost.js` | Redeem pass code, grant bundle (authenticated) |
| `passAdminPost.js` | Generate new passes (admin/GitHub Actions only) |

### GitHub Actions Workflow

**Trigger**: Manual dispatch with inputs
- `passType`: invited-guest | resident-guest | resident-pro | staff
- `usages`: Number (default: 3, optional for resident types)
- `email`: Email restriction (optional for invited-guest)
- `quantity`: How many passes to generate (default: 1)

**Outputs**:
- Pass codes (text file artifact)
- QR code images (PNG artifacts)
- URL list (text file artifact)
- Email notification to admin

## Closed Beta Configuration

During closed beta (live without production credentials):

```toml
[[bundles]]
id = "guest"
allocation = "on-request"
credits = 0  # Effectively disabled
```

This prevents anonymous guest access while allowing pass-holders to still get access.

## Marketing Strategy

### Philosophy: Organic, Merch-Driven Growth

**Core insight**: Rather than running social media accounts, let users share the valuable content (the pass itself) via merchandise. People photograph interesting t-shirts and mugs; each photo is organic marketing.

### Merchandise Strategy

| Item | Pass Type | Distribution |
|------|-----------|--------------|
| T-shirts | Invited Guest (3 uses) | Available to buy (print-on-demand) |
| Mugs | Invited Guest (3 uses) | Available to buy (print-on-demand) |
| Stickers | Invited Guest (1 use) | Free at events, conferences |

**Pro Subscriber Perks**:
- Free merch item on signup (t-shirt or mug, their choice)
- Each item has unique QR code = unique pass
- Creates walking billboards who have skin in the game

### Fulfilment Model

Use print-on-demand service (Printful, Printify, or similar):
- No inventory management
- No shipping logistics
- Margin on merch sales (bonus, not core revenue)
- QR codes generated per-order via webhook integration

### Marketing Timeline (Relative to Features)

| Phase | Trigger | Marketing Action |
|-------|---------|------------------|
| **Closed Beta** | Production HMRC credentials approved | Invite-only passes to existing DIY customers |
| **Soft Launch** | Guest tier enabled (3 credits) | Enable merch store, announce to mailing list |
| **Public Launch** | Referral system live (#TBD) | PR push, ProductHunt, Hacker News |
| **Growth** | 100+ paying Pro users | Case studies, accountant partnerships |

### "No Social Media" Approach

**What we DON'T do**:
- Run Twitter/X, LinkedIn, Instagram accounts
- Post daily content
- Engage in social media marketing

**What we DO**:
- SEO-optimized landing pages
- Email list for existing DIY Accounting customers
- GitHub presence (open issues, transparency)
- Let merch create organic social sharing
- Respond to mentions (reactive, not proactive)

### Why This Works for VAT Software

1. **Low-frequency product**: Users interact quarterly, not daily
2. **Word-of-mouth matters**: Small business owners trust peers
3. **Novelty factor**: "My VAT software gave me a free t-shirt" is shareable
4. **Authenticity**: Not trying to be a "brand personality"

## Implementation Phases

### Phase 1: Catalogue & Credits Foundation
- [ ] Update `submit.catalogue.toml` with new credit fields
- [ ] Rename "Business" to "Pro" everywhere
- [ ] Implement midnight expiry logic
- [ ] Update guest cap from 10 to 3
- [ ] Add credit consumption tracking

### Phase 2: Pass Infrastructure
- [ ] Create Passes DynamoDB table
- [ ] Implement `passGet.js`, `passPost.js`
- [ ] Create pass redemption UI flow
- [ ] Implement three-little-words generation

### Phase 3: Pass Generation
- [ ] Create `passAdminPost.js` Lambda
- [ ] Build GitHub Actions workflow for pass generation
- [ ] Implement QR code generation
- [ ] Email notification system

### Phase 4: Merch Integration
- [ ] Set up print-on-demand account
- [ ] Create merch designs with QR placeholder
- [ ] Webhook integration for per-order pass generation
- [ ] Pro subscriber free merch flow

## Key Files to Modify

| File | Changes |
|------|---------|
| `web/public/submit.catalogue.toml` | New bundle definitions, credit fields |
| `app/services/bundleManagement.js` | Credit consumption tracking, midnight expiry |
| `app/services/productCatalog.js` | Parse new TOML fields |
| `infra/main/java/.../DataStack.java` | Add Passes table |
| `infra/main/java/.../AccountStack.java` | Add pass Lambda functions |
| `app/functions/account/passGet.js` | New file |
| `app/functions/account/passPost.js` | New file |
| `app/functions/account/passAdminPost.js` | New file |
| `.github/workflows/generate-pass.yml` | New workflow |

## Research Sources

### Successful Pass/Invitation Models

| Example | Lesson |
|---------|--------|
| **Bluesky** | Invite codes created $300+ secondary market value; 800K signups day 1 after opening |
| **ClassPass** | Credit-based model with 62% free→paid activation; credits vary by demand |
| **Friend.tech** | Invite-only + real-time dynamics = 100K users in weeks |

### SaaS Pricing Trends (2025-2026)

- Credit-based pricing up 126% YoY among top SaaS
- Hybrid models (base subscription + usage caps) most successful
- Seat-based pricing resilient due to predictability

### Pricing Psychology (from backlog docs)

- £5.99: Incidental purchase threshold
- £12.99: "Serious but painless" (recommended)
- VAT software needs to clear "serious software" bar to build trust

## Open Questions

1. **DIY Legacy**: How to verify PayPal transaction IDs from 2025? (commented out in catalogue)
2. **Bookkeeper tier**: Pricing and credit limits for unlimited tier?
3. **Referral integration**: How do passes interact with referral rewards?
4. **Credit rollover**: Do unused Pro credits roll over? (Probably not)

---

*Last updated: 2026-01-17*
*GitHub Issue: #560*
*Branch: `claude/passes-and-credits` (to be created)*
