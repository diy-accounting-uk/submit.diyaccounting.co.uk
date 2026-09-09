<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Plan: Fix Developer Tools for Test Passes

## Context

The recent pass reorganization removed the `test` bundle and `test-access` pass type. Test passes (e.g. `day-guest-test-pass`) now grant regular bundles (`day-guest`, `resident-pro`) with `qualifiers: { sandbox: true }` instead.

However, `developer-mode.js` still checks for `bundleId === "test"` to decide whether to show the wrench icon. Since no bundle has that ID anymore, the developer tools toggle never appears — even for users who redeemed a test pass.

**Fix**: Change `userHasTestBundle()` to check for any allocated bundle with `qualifiers.sandbox === true`.

---

## Step 1: Update `userHasTestBundle()` in `developer-mode.js`

**File**: `web/public/developer-mode.js`

### 1a. Change the bundle check (line 32)

Current code:
```javascript
return bundles.some((b) => (b?.bundleId || b) === "test" || String(b).startsWith("test|"));
```

New code:
```javascript
return bundles.some((b) => b?.qualifiers?.sandbox === true);
```

The GET /api/v1/bundle response returns allocated bundles with a `qualifiers` object. When a test pass (with `testPass: true`) is redeemed, the bundle is granted with `qualifiers: { sandbox: true }` (set in `passPost.js` line 87). This is the correct signal for developer mode access.

### 1b. Update comments (lines 6, 19, 187, 195, 579, 585, 588, 590)

Change references from "test bundle" to "sandbox bundle" throughout:
- Line 6: `// The toggle icon only appears if the user has the "test" bundle.` → `// The toggle icon only appears if the user has a sandbox-qualified bundle (from a test pass).`
- Line 19: `// Check if user has the test bundle` → `// Check if user has a sandbox-qualified bundle`
- Line 187: `// Inject toggle icon into header-left (only if user has test bundle)` → `// Inject toggle icon into header-left (only if user has a sandbox bundle)`
- Line 195: `// Only show icon if user has test bundle` → `// Only show icon if user has a sandbox bundle`
- Line 579: `// Re-check test bundle and inject/remove icon as needed` → `// Re-check sandbox bundle and inject/remove icon as needed`
- Line 585: comment stays structurally the same but update "test bundle" → "sandbox bundle"

### 1c. Rename function (optional but recommended)

Rename `userHasTestBundle` → `userHasSandboxBundle` throughout the file (3 occurrences: definition line 20, call line 196, call line 585). This avoids confusion since there's no "test" bundle anymore.

---

## Step 2: Update simulator version

**No action needed** — `web/public-simulator/` is auto-generated from `web/public/`.

---

## Verification

```bash
npm test          # Existing tests still pass (no unit tests for developer-mode.js)
```

### Manual verification (with `npm start`):
1. Start the simulator: `npm start`
2. Create a test pass: `curl -s -X POST http://localhost:3000/api/v1/pass/admin -H "Content-Type: application/json" -d '{"passTypeId":"day-guest-test-pass","bundleId":"day-guest","validityPeriod":"P1D","maxUses":1,"createdBy":"manual"}'`
3. Open bundles page with the returned pass code
4. Redeem the pass and request the Day Guest bundle
5. **Verify**: The wrench icon appears in the header
6. Click it to toggle developer mode on — green terminal overlay appears

### Behaviour test check:
The `enableDeveloperMode()` step in `behaviour-tests/steps/behaviour-steps.js` expects `.developer-mode-toggle` to be visible. This works because behaviour tests use test passes which grant bundles with `qualifiers: { sandbox: true }`, so the check will now correctly pass.

---

## Files to modify

| File | Changes |
|------|---------|
| `web/public/developer-mode.js` | Change `userHasTestBundle()` → `userHasSandboxBundle()`, check `qualifiers.sandbox === true` instead of `bundleId === "test"` |
