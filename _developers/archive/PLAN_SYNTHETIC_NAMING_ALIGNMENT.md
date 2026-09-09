<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Plan: Align Test/Sandbox/Live Naming Under "Synthetic"

## User Assertions (Non-Negotiable)

- Where there are over-the-wire calls to production systems with customer data, and both a live-data path and a test/sandbox/etc path are supplied, these should be unified under the name **"synthetic"**
- Developer options / developer mode naming in the UI should also be aligned
- Clean up all the inconsistent names: sandbox, test mode, live mode (inverted), developer mode, testPass

## Problem: Current Naming Zoo

The codebase uses **6 different names** for what is conceptually one boolean: "are we talking to real production services with real customer data, or synthetic/test services?"

| Current Name | Where Used | What It Controls |
|---|---|---|
| **`sandbox`** | HMRC env vars (`HMRC_SANDBOX_*`), bundle qualifier (`qualifiers.sandbox`), sessionStorage (`hmrcAccount=sandbox`), `HMRC_ACCOUNT=sandbox` env var, HTML elements (`sandboxObligationsOption`) | Routes to HMRC test-api.service.hmrc.gov.uk |
| **`test`** / **`testMode`** | Stripe client (`{ test: true }`), env vars (`STRIPE_TEST_*`), webhook processing (`isTestMode`), `sk_test_*` key prefix | Routes to Stripe test API |
| **`testPass`** | Pass records (`testPass: true`), passes TOML (`test = true`), pass type IDs (`*-test-pass`) | Seeds bundles with sandbox qualifier |
| **`developer mode`** / **`developerOptions`** | UI file (`developer-mode.js`), sessionStorage (`showDeveloperOptions`), CSS class (`developer-mode`), HTML sections (`developerSection`) | Shows/hides test tools in browser UI |
| **`synthetic`** | Actor classification (`classifyActor`), Telegram routing, CI workflow name (`synthetic-test.yml`) | Routes telemetry to test channels |
| **`livemode`** | Stripe API field on webhook events (`event.livemode`) | Stripe's own boolean (read-only from their API) |

### The Data Flow Today

```
submit.passes.toml:  test = true
       ↓
passService.js:      testPass: true  (on pass record)
       ↓
passPost.js:         qualifiers: { sandbox: true }  (on bundle record)
       ↓
developer-mode.js:   bundles.some(b => b.qualifiers?.sandbox === true)  →  show wrench icon
                     sessionStorage.setItem("hmrcAccount", "sandbox")
       ↓
billingCheckoutPost: isSandbox → getStripeClient({ test: isSandbox })
hmrcApi.js:          isSandbox → HMRC_SANDBOX_BASE_URI vs HMRC_BASE_URI
       ↓
billingWebhookPost:  isTestMode = parsed.livemode === false  →  resolveWebhookSecret({ test: isTestMode })
```

The qualifier name shifts from `test` → `testPass` → `sandbox` → `isSandbox` → `{ test: true }` → `isTestMode` as it crosses boundaries. This is confusing.

## Proposal: Align on "Synthetic"

### Why "Synthetic"?

1. It already exists in the codebase for actor classification and CI workflows
2. It's not overloaded — "test" means too many things (unit test, test environment, test mode, test pass)
3. It's neutral — "sandbox" is HMRC's word, "test" is Stripe's word; "synthetic" is ours
4. It communicates intent — synthetic transactions aren't real, they use vendor test/sandbox APIs
5. It's already the industry term for non-production monitoring ("synthetic monitoring")

### What "Synthetic" Means in This Context

> A **synthetic** interaction is one where the user's over-the-wire API calls go to vendor test/sandbox environments (HMRC test-api, Stripe test mode) rather than production APIs with real customer data.

### Rename Mapping

| Current | New | Notes |
|---|---|---|
| `qualifiers.sandbox` | `qualifiers.synthetic` | Bundle record qualifier — the single source of truth |
| `testPass` (on pass record) | `syntheticPass` | Pass record field |
| `test = true` (passes TOML) | `synthetic = true` | Pass type config |
| `*-test-pass` (pass type IDs) | `*-synthetic-pass` | Pass type naming |
| `isSandbox` (code variable) | `isSynthetic` | All JS code variables |
| `isSandboxMode()` (helper) | `isSyntheticMode()` | Behaviour test helper |
| `{ test: true }` (Stripe param) | `{ synthetic: true }` | stripeClient.js parameter |
| `isTestMode` (webhook) | `isSyntheticMode` | billingWebhookPost.js |
| `showDeveloperOptions` | `showSyntheticOptions` | sessionStorage key |
| `developer-mode` (CSS class) | `synthetic-mode` | Body class |
| `developer-mode-toggle` | `synthetic-mode-toggle` | CSS class |
| `developer-mode-changed` | `synthetic-mode-changed` | Custom event |
| `developerSection` | `syntheticSection` | HTML element ID |
| `developer-mode.js` | `synthetic-mode.js` | Filename |
| `Toggle Developer Mode` | `Toggle Synthetic Mode` | Tooltip text |
| `developer-mode-styles` | `synthetic-mode-styles` | Style element ID |
| `sandboxObligationsOption` | `syntheticObligationsOption` | HTML element ID |
| `allowSandboxObligations` | `allowSyntheticObligations` | Checkbox ID |
| `userHasSandboxBundle()` | `userHasSyntheticBundle()` | Function name |
| `hasSandboxBundle` | `hasSyntheticBundle` | Variable names |

### What Does NOT Change

These are **vendor vocabulary** that we must keep because they come from external APIs or are standard env var names for those vendors:

| Keep As-Is | Why |
|---|---|
| `HMRC_SANDBOX_BASE_URI` | HMRC calls their test environment "sandbox" — this is their vocabulary |
| `HMRC_SANDBOX_CLIENT_ID` | Same — HMRC env var naming |
| `HMRC_SANDBOX_CLIENT_SECRET_ARN` | Same |
| `HMRC_ACCOUNT=sandbox` | Value sent to HMRC API selection — their term |
| `hmrcSandboxBaseUri()` (CDK) | Maps directly to HMRC's sandbox concept |
| `STRIPE_TEST_SECRET_KEY` | Stripe calls their mode "test" — their vocabulary |
| `STRIPE_TEST_PRICE_ID` | Same |
| `STRIPE_TEST_WEBHOOK_SECRET` | Same |
| `stripeTestSecretKeyArn()` (CDK) | Maps directly to Stripe's test concept |
| `sk_test_*` / `sk_live_*` | Stripe key prefixes — their format |
| `event.livemode` | Stripe API response field — read-only |
| `Gov-Test-Scenario` | HMRC header name — their specification |
| `synthetic-test.yml` | Workflow name — already correct! |
| `classifyActor → "synthetic"` | Actor classification — already correct! |

### The Boundary Rule

**Our code uses "synthetic". Vendor interfaces use vendor terms.**

The translation happens at the boundary:
```
Our code:  isSynthetic = true
  → HMRC:   uses HMRC_SANDBOX_* env vars
  → Stripe: uses STRIPE_TEST_* env vars, sk_test_* keys
```

The `stripeClient.js` and `hmrcApi.js` files are the boundary — they accept `{ synthetic: true }` from our code and internally map to the vendor's test/sandbox APIs.

## Implementation Phases

### Phase 1: Data Model (Bundle + Pass Records)

**Risk: Data migration required for existing bundles**

1. **Pass types in `submit.passes.toml`**:
   - Rename `test = true` to `synthetic = true`
   - Rename pass type IDs: `day-guest-test-pass` → `day-guest-synthetic-pass`, `resident-pro-test-pass` → `resident-pro-synthetic-pass`

2. **Pass records in `passService.js`**:
   - Rename `testPass` field to `syntheticPass` in `buildPassRecord()`
   - Update all references in `passPost.js`, `passGet.js`

3. **Bundle qualifier**:
   - Change `qualifiers: { sandbox: true }` to `qualifiers: { synthetic: true }`
   - In `passPost.js`: `const grantQualifiers = result.pass?.syntheticPass ? { synthetic: true } : undefined`
   - In `billingWebhookPost.js`: `qualifiers: { synthetic: test }`

4. **Migration**: Existing bundle records in DynamoDB have `qualifiers.sandbox`. Options:
   - **Option A (recommended)**: Read-time compat — check for both `qualifiers.synthetic` and `qualifiers.sandbox` during a transition period, write only `synthetic` going forward. Remove compat after all bundles have expired/rotated.
   - **Option B**: Run a one-time DynamoDB migration script to update existing records.

### Phase 2: Backend Code Variables

1. **`hmrcApi.js`**: Internal variable `isSandbox` → `isSynthetic` (but still reads `HMRC_SANDBOX_*` env vars)
2. **`stripeClient.js`**: Parameter `{ test }` → `{ synthetic }` throughout
3. **`billingCheckoutPost.js`**: `isSandbox` → `isSynthetic`, `sandboxSource` → `syntheticSource`
4. **`billingPortalGet.js`**: `isSandbox` → `isSynthetic`
5. **`billingWebhookPost.js`**: `isTestMode` → `isSyntheticMode`, parameter `{ test }` → `{ synthetic }`
6. **`behaviour-helpers.js`**: `isSandboxMode()` → `isSyntheticMode()`

### Phase 3: Frontend (UI + Developer Options)

1. **Rename `developer-mode.js` → `synthetic-mode.js`**
2. **Update all CSS classes, IDs, events** per the rename mapping above
3. **Update tooltip**: "Toggle Developer Mode" → "Toggle Synthetic Mode"
4. **Update CSS `::after` content**: `"developer"` → `"synthetic"`
5. **Update all HTML pages** that reference `developerSection`, `sandboxObligationsOption`, `allowSandboxObligations`
6. **Update `<script>` tags** in HTML that load `developer-mode.js`
7. **Update behaviour test steps** in `behaviour-hmrc-vat-steps.js` that set `showDeveloperOptions` and wait for `developerSection`

### Phase 4: npm Scripts + Workflow References

1. **`package.json`**: Rename `*-sandbox` npm scripts to `*-synthetic` (e.g., `test:submitVatBehaviour-proxy-sandbox` → `test:submitVatBehaviour-proxy-synthetic`)
2. **Docs/comments**: Update references in PASSES.md, CLAUDE.md, REPORT_REPOSITORY_CONTENTS.md, developer docs

## File Impact Analysis

### High-Traffic Files (Careful Review)

| File | Changes |
|---|---|
| `submit.passes.toml` | `test = true` → `synthetic = true`, type IDs |
| `app/services/passService.js` | `testPass` → `syntheticPass` |
| `app/functions/account/passPost.js` | `testPass` → `syntheticPass`, `sandbox` → `synthetic` in qualifiers |
| `app/functions/billing/billingCheckoutPost.js` | `isSandbox` → `isSynthetic`, all related vars |
| `app/functions/billing/billingPortalGet.js` | `isSandbox` → `isSynthetic` |
| `app/functions/billing/billingWebhookPost.js` | `isTestMode` → `isSyntheticMode`, `{ test }` → `{ synthetic }` |
| `app/lib/stripeClient.js` | `{ test }` → `{ synthetic }`, cache var names |
| `app/services/hmrcApi.js` | `isSandbox` → `isSynthetic` (internal only) |
| `web/public/developer-mode.js` → `synthetic-mode.js` | Full rename of file + all internals |
| `web/public/hmrc/vat/submitVat.html` | Element IDs |
| `web/public/hmrc/vat/vatObligations.html` | Element IDs |
| `web/public/hmrc/vat/viewVatReturn.html` | Element IDs |

### Test Files

| File | Changes |
|---|---|
| `behaviour-tests/helpers/behaviour-helpers.js` | `isSandboxMode` → `isSyntheticMode` |
| `behaviour-tests/steps/behaviour-hmrc-vat-steps.js` | sessionStorage key, element ID waits |
| All `*.test.js` files referencing `testPass`, `sandbox`, `isSandbox` | Variable names |
| `app/bin/simulator-server.js` | `testPass` → `syntheticPass` |

### Infrastructure (CDK Java)

No CDK changes needed — the env var names (`HMRC_SANDBOX_*`, `STRIPE_TEST_*`) stay as-is because they're vendor vocabulary.

### Documentation

| File | Changes |
|---|---|
| `PASSES.md` | Terminology throughout |
| `CLAUDE.md` | Memory references |
| `REPORT_REPOSITORY_CONTENTS.md` | Widget/file descriptions |
| `_developers/archive/*.md` | Historical docs (low priority, optional) |

## Migration Strategy for Bundle Data

### Read-Time Compatibility (Recommended)

Add a small helper used wherever we check the qualifier:

```javascript
// app/lib/bundleQualifiers.js
export function isSyntheticBundle(bundle) {
  return bundle?.qualifiers?.synthetic === true || bundle?.qualifiers?.sandbox === true;
}
```

Use this in:
- `developer-mode.js` (frontend equivalent)
- `billingCheckoutPost.js`
- `billingPortalGet.js`

Write path always writes `{ synthetic: true }`. Old records with `{ sandbox: true }` are read correctly until they expire. No migration script needed.

### Timeline

Bundles have TTLs and expire. Once all pre-change bundles have expired (typically within 30 days for day-guest, 1 year max for resident-pro), the `sandbox` compat check can be removed.

## Verification Criteria

1. All unit tests pass with new naming
2. All behaviour tests pass (proxy + simulator)
3. `./mvnw clean verify` passes (CDK builds)
4. Existing bundles with `qualifiers.sandbox` still work (read-time compat)
5. New bundles are created with `qualifiers.synthetic`
6. Developer tools UI still shows/hides correctly (now called "Synthetic Mode")
7. Stripe test/live routing still works correctly
8. HMRC sandbox/production routing still works correctly
9. Telegram routing still routes synthetic actors to test channel
10. npm scripts work with new names (old names removed)

## Open Questions

1. **Should the wrench icon tooltip say "Synthetic Mode" or "Synthetic Tools"?** — "Synthetic Mode" aligns with the CSS class name.
2. **Should we keep `HMRC_ACCOUNT=sandbox` as the env var value or change to `HMRC_ACCOUNT=synthetic`?** — Since this maps directly to HMRC's concept, keeping `sandbox` as the *value* while our internal variable is `isSynthetic` preserves the vendor boundary rule. The env var name `HMRC_ACCOUNT` and value `sandbox` are at the vendor boundary.
3. **Archive docs** — Should we update `_developers/archive/*.md` files or leave them as historical records? Recommend leaving them as-is since they're archived.

## Estimated Scope

- ~30 source files to modify
- ~10 test files to update
- 1 file rename (`developer-mode.js` → `synthetic-mode.js`)
- 0 CDK infrastructure changes
- 0 data migrations (read-time compat handles it)
- ~5 npm script renames in package.json
