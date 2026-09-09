<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Generate Pass Activities — Digital & Physical Passes

> **Related**: `_developers/backlog/PLAN_PASSES_V2-PART-2.md` Phase 6 (Campaign system)
> **Catalogue**: `web/public/submit.catalogue.toml`
> **Pass types**: `submit.passes.toml`

## Overview

Two new activities allow entitled users to generate shareable passes:

| Activity | Pass Type | Time Limit | Use Limit | Token Cost | Medium |
|----------|-----------|-----------|-----------|------------|--------|
| `generate-pass-digital` | `digital-pass` | 7 days | 100 | 10 | URLs, QR codes, social media |
| `generate-pass-physical` | `physical-pass` | Unlimited | 10 | 10 | T-shirts, mugs, stickers |

Both activities are available to holders of `test`, `resident-pro-comp`, and `resident-pro` bundles.

## Design Philosophy

```
Passes:
- Digital media - limited by time, unlimited capacity.
  Encourages short campaigns in a time we can plan for.
- Physical media - limited usages, unlimited time.
  Encourages continued display with value for the holder and discourages sharing.
```

### Digital Pass
A digital pass is a URL or QR code shared via email, social media, or messaging. The 7-day validity window creates urgency ("Get free VAT submission — link expires in 7 days") while 100 uses allows broad distribution. The short time window means campaign impact is measurable and bounded.

### Physical Pass
A physical pass is printed on merchandise — a t-shirt, mug, or sticker. The unlimited time means the merchandise retains value indefinitely ("This QR code still works"). The 10-use limit means the holder benefits from exclusivity and has an incentive to display the item rather than share the code widely. Each scan is valuable.

## Physical Media Design

### Front (Visible Side)

Four words from the passphrase, stacked vertically in large bold text:

```
tiger
happy
mountain
silver
```

- Font: Clean sans-serif (e.g., Inter, Helvetica Neue)
- No DIY Accounting branding on front — the brand appears only in the URL host within the QR code
- Minimal, striking design — the four mysterious words create curiosity

### Back (QR Code Side)

- QR code encoding `https://submit.diyaccounting.co.uk/bundles.html?pass=tiger-happy-mountain-silver`
- Error correction level **H** (30%) for physical media durability (scratches, folds, wash cycles)
- Small text below QR: the passphrase for manual entry
- SVG format for vector-quality printing at any size

### Product Types

| Product | Front | Back | Notes |
|---------|-------|------|-------|
| **T-shirt** | 4 words on chest | QR code on upper back | Standard DTG print area |
| **Mug (right-handed)** | 4 words (left side, facing holder) | QR code (right side, facing others) | QR visible when drinking |
| **Mug (left-handed)** | 4 words (right side, facing holder) | QR code (left side, facing others) | Mirror placement for lefties |
| **Sticker** | 4 words | QR code (reverse side or below) | Die-cut or rectangular |

### Print-on-Demand Fulfillment

MVP: Download SVG design files and upload to a print-on-demand service.

**Recommended services** (no API integration needed for MVP):

- [Printful](https://www.printful.com/) — T-shirts, mugs, stickers. UK fulfillment. No minimum order.
- [Printify](https://printify.com/) — Similar range. Marketplace of print providers.
- [Gooten](https://www.gooten.com/) — API-first, good for future automation.

**User flow**:
1. Generate physical pass → receive front SVG + back SVG
2. Download SVG files
3. Click "Order Print" → opens Printful/Printify product page
4. Upload SVG files to print designer
5. Order and pay directly on fulfillment platform

**Future enhancement**: Use Printful API (`POST /mockup-generator/create-task`) to generate product mockups in-app and deep-link into the order flow with pre-filled designs.

## API Design

### `POST /api/v1/pass/generate`

Authenticated. Requires bundle entitlement (`test`, `resident-pro-comp`, or `resident-pro`).

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
  "validFrom": "2026-02-04T00:00:00Z",
  "validUntil": "2026-02-11T00:00:00Z",
  "maxUses": 100,
  "tokensConsumed": 10,
  "tokensRemaining": 90
}
```

No images in the response — QR codes are generated client-side using the `qrcode` npm package (already a dependency) to produce SVG output. This avoids server-side image generation and serving.

### `GET /api/v1/pass/my-passes`

Authenticated. Returns passes where `issuedBy` matches the user's hashed sub.

**Query parameters**:
- `limit` (default: 20, max: 50) — page size
- `nextPageKey` (optional) — cursor for pagination

**Response**:
```json
{
  "passes": [
    {
      "code": "tiger-happy-mountain-silver",
      "passTypeId": "digital-pass",
      "bundleId": "day-guest",
      "validFrom": "2026-02-04T00:00:00Z",
      "validUntil": "2026-02-11T00:00:00Z",
      "maxUses": 100,
      "useCount": 3,
      "createdAt": "2026-02-04T12:00:00Z",
      "notes": "February campaign"
    }
  ],
  "nextPageKey": "base64-encoded-key-or-null"
}
```

**DynamoDB**: Requires a GSI on the passes table:
- Index name: `issuedBy-index`
- Partition key: `issuedBy` (String)
- Sort key: `createdAt` (String) — for chronological ordering
- Projection: ALL

## UI Design

### Bundles Page: "My Generated Passes" Section

Below the existing "Your Current Bundles" and pass redemption sections on `bundles.html`:

```
┌──────────────────────────────────────────┐
│  My Generated Passes                      │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ 🔗 tiger-happy-mountain-silver     │  │
│  │ Digital Pass • Expires Feb 11      │  │
│  │ 3 of 100 uses                      │  │
│  │ [Copy Link] [View QR]             │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ 🖨 coral-brave-garden-frost        │  │
│  │ Physical Pass • No expiry          │  │
│  │ 1 of 10 uses                       │  │
│  │ [Copy Link] [View QR]             │  │
│  │ [Download Front] [Download Back]   │  │
│  │ [Order T-shirt] [Order Mug]       │  │
│  └────────────────────────────────────┘  │
│                                          │
│  (scroll for more...)                    │
└──────────────────────────────────────────┘
```

- Infinite scroll using `IntersectionObserver` on a sentinel element
- Client-side QR code generation (SVG via `qrcode` library)
- Physical pass cards include download buttons for front/back SVG designs
- Fulfillment links open in new tab to Printful/Printify

### Generate Pages

`web/public/passes/generate-digital.html`:
- Brief description: "Create a shareable link that gives anyone free VAT submission access for 7 days"
- Token cost display: "This will use 10 of your N remaining tokens"
- Optional notes field
- "Generate Pass" button
- Result: QR code SVG (client-generated), pass code, copy-to-clipboard URL

`web/public/passes/generate-physical.html`:
- Brief description: "Create a pass for printing on merchandise"
- Product preview selector: T-shirt / Mug (Right) / Mug (Left) / Sticker
- Token cost display
- "Generate Pass" button
- Result: Front SVG preview, back SVG preview (QR code, client-generated), download buttons, fulfillment links

## Marketing Ideas with Shareable Assets

### Digital Pass Campaigns

1. **Social media urgency**: "Get free VAT submission — link expires in 7 days" with the QR code image. The countdown creates urgency; the generous value (free VAT submission) drives clicks.

2. **Seasonal VAT deadline campaigns**: Time digital passes to quarterly VAT deadlines. "VAT deadline in 2 weeks? Try free VAT submission" — pass expires before the next quarter.

3. **Community partnerships**: Bulk digital passes for bookkeeping forum moderators, small business groups, and networking communities. The moderator shares a pass that gives their community 7 days of access.

4. **Email drip campaigns**: Include a digital pass in the 3rd email of a nurture sequence. The time limit means recipients act now rather than bookmarking for later.

5. **Webinar/event follow-up**: "Thanks for attending! Here's a 7-day pass to try what we demonstrated" — sent immediately after an event while interest is high.

### Physical Pass Campaigns

6. **Conference swag**: T-shirts or mugs with pass QR codes given to conference attendees. The wearer becomes a walking advertisement; others scan the QR code.

7. **Accountant referral cards**: Physical pass printed as a business card. Accountants hand them to clients: "Scan this for free VAT submission." The 10-use limit means each card is valuable.

8. **Office merchandise**: Mugs in co-working spaces or accountancy firms. Left-handed and right-handed variants mean the QR code is always visible when someone drinks.

9. **QR code stickers**: Laptop stickers, office door stickers, or cash register stickers. Small, permanent, and scannable.

10. **Reward/loyalty items**: Physical passes as prizes in competitions, thank-you gifts, or loyalty rewards. The limited uses make them feel exclusive.

### Combined Digital + Physical Strategies

11. **Two-tier referral**: Give a digital pass for quick online sharing AND a physical pass for ongoing offline promotion. The digital pass drives immediate conversions; the physical pass provides a long tail.

12. **Accountant starter kit**: One physical pass (10 uses, for the office mug) + 3 digital passes (for email to specific clients). The accountant covers both walk-in and remote clients.

13. **Event booth**: Physical pass on the booth banner (people scan from a distance) + digital passes on flyers handed out. The booth QR has 10 uses — creates "limited availability" urgency at the event.

## Implementation Roadmap

### Phase A: Catalogue & Test Scaffolding (this PR)
- Add activities to `submit.catalogue.toml`
- Add pass types to `submit.passes.toml`
- Create `generatePassActivity.behaviour.test.js` (specification-as-tests)
- Create step helpers

### Phase B: Backend
- `POST /api/v1/pass/generate` Lambda (authenticated, entitlement-checked, token-consuming)
- `GET /api/v1/pass/my-passes` Lambda (paginated, GSI query)
- DynamoDB GSI on passes table (`issuedBy-index`)
- CDK infrastructure (AccountStack, DataStack)
- Unit + system tests

### Phase C: Frontend
- `passes/generate-digital.html` page
- `passes/generate-physical.html` page
- "My Generated Passes" section on `bundles.html` with infinite scroll
- Client-side QR code SVG generation
- Physical media front/back SVG composition (client-side)

### Phase D: Physical Media Fulfillment
- SVG design templates for front (4 words) and back (QR code)
- Print-ready SVG export (CMYK-safe colours, bleed margins)
- Fulfillment partner integration (Printful link-out initially, API later)
- Product mockup generation (Printful API, future)

## Files

### New Files
| File | Phase | Purpose |
|------|-------|---------|
| `PLAN_GENERATE_PASS_ACTIVITY.md` | A | This document |
| `behaviour-tests/generatePassActivity.behaviour.test.js` | A | E2E specification tests |
| `behaviour-tests/steps/behaviour-pass-generation-steps.js` | A | Reusable test steps |
| `app/functions/account/passGeneratePost.js` | B | User pass generation endpoint |
| `app/functions/account/passMyPassesGet.js` | B | List user's generated passes |
| `web/public/passes/generate-digital.html` | C | Digital pass generation page |
| `web/public/passes/generate-physical.html` | C | Physical pass generation page |

### Modified Files
| File | Phase | Changes |
|------|-------|---------|
| `web/public/submit.catalogue.toml` | A | Add two activity definitions |
| `submit.passes.toml` | A | Add two pass type definitions |
| `playwright.config.js` | A | Add test project |
| `package.json` | A | Add test scripts |
| `web/public/bundles.html` | C | Add "My Generated Passes" section |
| `app/data/dynamoDbPassRepository.js` | B | Add `getPassesByIssuer()` |
| `app/bin/server.js` | B | Register new endpoints |
| `infra/.../DataStack.java` | B | Add GSI to passes table |
| `infra/.../AccountStack.java` | B | Add Lambda functions |

---

*Last updated: 2026-02-04*
