<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Plan: UI Cleanup and Global Developer Mode Toggle

## Goal

Clean up the UI by removing redundant navigation buttons and simplifying the per-form developer options into a single global mechanism.

## Key Behavior

**Test bundle controls:**
1. Developer icon visibility (no test bundle = no icon)
2. Sandbox activities on home page (normal bundle rules - NOT hidden by developer toggle)

**Developer icon click toggles:**
1. Header dev info visibility + terminal styling (traceparent, x-request-id, entitlement status)
2. Footer dev links visibility + terminal styling (tests, api)
3. Form developer sections (`#developerSection`)

---

## Changes

### 1. Remove redundant navigation buttons

The main nav bar (Activities, Receipts, Bundles) and the home/info icons already provide navigation. Remove duplicate buttons.

#### 1.1 `web/public/guide/index.html`

Remove the navigation container at the bottom (lines 260-264):
```html
<div class="navigation-container" style="text-align: center; margin-top: 2em">
  <button type="button" class="btn" onclick="window.location.href = '../index.html'">Return to Home</button>
  <button type="button" class="btn" onclick="window.location.href = '../help/index.html'" ...>View FAQs</button>
</div>
```

#### 1.2 `web/public/account/bundles.html`

Remove the "Back to Home" button (lines 65-69):
```html
<button type="button" class="btn" onclick="window.location.href = '../index.html'" ...>Back to Home</button>
```

Remove the "Remove All Bundles" button (lines 73-80):
```html
<button type="button" class="btn" id="removeAllBtn" ...>Remove All Bundles</button>
```

Also remove the associated JavaScript that handles the "Remove All Bundles" click and confirmation dialog.

---

### 2. Global developer options toggle (wrench icon)

#### 2.1 Add toggle to the header nav

Add a wrench icon button in the `header-left` section, after the info icon. **Only shown if user has test bundle.**

**Behaviour:**
- Only appears if user has the "test" bundle
- Reads `sessionStorage.getItem('showDeveloperOptions')` on page load
- When clicked, toggles the sessionStorage flag and updates visibility of dev elements
- **Off state (default):** Grey wrench — dev info hidden
- **On state:** Orange wrench with glow — dev info shown with terminal styling

**Implementation:** `web/public/developer-mode.js` that:
1. Checks if user has test bundle via API
2. Only injects toggle icon if user has test bundle
3. Reads/writes `sessionStorage.showDeveloperOptions`
4. Toggles visibility of header/footer dev elements
5. Dispatches `developer-mode-changed` event for form developer sections
6. Adds/removes `developer-mode` class on `<body>` for terminal CSS styling

#### 2.2 The wrench icon

Simple wrench SVG that works well at small sizes:
- Off: Grey (#888)
- On: Orange (#e67e22) with subtle glow

---

### 3. Test bundle activities follow normal bundle rules

#### 3.1 `web/public/index.html` (Activities page)

The activities list is built dynamically from `submit.catalogue.toml`. Activities associated with the `test` bundle (identified by `bundles = ["test"]`) follow normal bundle access rules - they appear if the user has the test bundle, regardless of developer mode.

Test-bundle activities:
- `submit-vat-sandbox` — "Submit VAT (HMRC Sandbox)"
- `vat-obligations-sandbox` — "VAT Obligations (HMRC Sandbox)"
- `view-vat-return-sandbox` — "View VAT Return (HMRC Sandbox)"

These buttons look and behave exactly like regular activity buttons - no special badge or styling.

#### 3.2 `web/public/account/bundles.html` (Bundles page)

The "Test" bundle card/row is visible on the bundles page. Users can request the test bundle to access sandbox activities.

---

### 4. Replace per-form developer options with global flag

#### 4.1 `web/public/hmrc/vat/submitVat.html`

- Remove the "Show Developer Options" toggle button (`#toggleDeveloperMode`, lines 363-365)
- Remove the toggle JavaScript (lines 1057-1078)
- Instead, on page load check `sessionStorage.getItem('showDeveloperOptions')`:
  - If set: show `#developerSection` (`display: block`)
  - If not set: keep hidden (`display: none`)
- The developer section content (test scenarios, fraud prevention checkbox) stays — it's just controlled by the global flag now

#### 4.2 `web/public/hmrc/vat/viewVatReturn.html`

Same pattern:
- Remove toggle button (lines 152-154)
- Remove toggle JavaScript (lines 257-267)
- Read `sessionStorage.showDeveloperOptions` on page load to show/hide `#developerSection`

#### 4.3 `web/public/hmrc/vat/vatObligations.html`

Same pattern:
- Remove toggle button (lines 175-177)
- Remove toggle JavaScript (lines 291-302)
- Read `sessionStorage.showDeveloperOptions` on page load to show/hide `#developerSection`

---

### 5. Update behaviour tests

#### 5.1 `behaviour-tests/steps/behaviour-steps.js` — `goToHomePage()`

Currently clicks "Back to Home" button on bundles page. Replace with nav bar click:
```javascript
// Old: await loggedClick(page, "button:has-text('Back to Home')", ...);
// New: click the Activities link in the main nav bar
await loggedClick(page, "nav.main-nav a:has-text('Activities')", "Activities nav link", { screenshotPath });
```

Or click the home icon:
```javascript
await loggedClick(page, ".home-link", "Home icon", { screenshotPath });
```

#### 5.2 `behaviour-tests/steps/behaviour-bundle-steps.js` — `clearBundles()`

Currently clicks "Remove All Bundles" button with confirmation dialog. Since the button is being removed entirely, this needs to call the bundle API directly to clean up:
```javascript
// Call the API to remove all bundles instead of clicking a UI button
await page.evaluate(async () => {
  const response = await fetch('/api/v1/bundle', { method: 'DELETE' });
  return response.ok;
});
```

Or navigate to bundles and remove them individually via the API.

#### 5.3 `behaviour-tests/help.behaviour.test.js`

Currently tests the "Return to Home" and "View FAQs" buttons at the bottom of the guide page (lines 389-413). Since these buttons are removed, this test section needs to:
- Remove assertions about those buttons
- Use nav bar links to navigate instead (if the test was testing navigation, test the nav bar)

#### 5.4 Tests that use developer options on forms

Tests that need developer options (sandbox test scenarios) must click the global developer mode toggle on the home page **before** navigating to the form. The flow becomes:

1. Navigate to home page
2. Click the "man digging" icon to enable developer mode
3. Select the sandbox activity (now visible because developer mode is on)
4. The form's developer section is automatically visible (reads sessionStorage)

Currently, tests click "Show Developer Options" on each form individually. These clicks should be removed and replaced with a single toggle at the start of the test flow.

---

### 6. Files Summary

| File | Action | Description |
|------|--------|-------------|
| `web/public/guide/index.html` | Modify | Remove "Return to Home" and "View FAQs" buttons |
| `web/public/account/bundles.html` | Modify | Remove "Back to Home" and "Remove All Bundles" buttons + JS |
| `web/public/developer-mode.js` | Create | Global developer mode toggle (shared across pages) |
| `web/public/index.html` | Modify | Add developer-mode.js, filter test-bundle activities |
| `web/public/account/bundles.html` | Modify | Add developer-mode.js, filter test bundle |
| `web/public/hmrc/vat/submitVat.html` | Modify | Remove per-form toggle, read sessionStorage |
| `web/public/hmrc/vat/viewVatReturn.html` | Modify | Remove per-form toggle, read sessionStorage |
| `web/public/hmrc/vat/vatObligations.html` | Modify | Remove per-form toggle, read sessionStorage |
| `behaviour-tests/steps/behaviour-steps.js` | Modify | `goToHomePage()` uses nav instead of button |
| `behaviour-tests/steps/behaviour-bundle-steps.js` | Modify | `clearBundles()` uses API instead of button |
| `behaviour-tests/help.behaviour.test.js` | Modify | Remove guide button assertions |
| Various behaviour tests | Modify | Click global dev toggle instead of per-form toggle |

---

### 7. Detailed Implementation Notes (from codebase exploration)

#### 7.1 Guide page (`web/public/guide/index.html`)
- Lines 259-264: `<div class="navigation-container">` contains both buttons
- Remove the entire `<div class="navigation-container">...</div>` block

#### 7.2 Bundles page (`web/public/account/bundles.html`)
- Lines 62-70: "Back to Home" button (grey, `onclick` navigation)
- Lines 72-81: "Remove All Bundles" button (`id="removeAllBtn"`, red)
- Lines 442-450: Click handler delegates to `removeAllBundles()` when `e.target.id === "removeAllBtn"`
- Lines 501-548: `removeAllBundles()` function — sends `DELETE /api/v1/bundle` with `{ removeAll: true }`
- Remove both buttons, the `removeAllBundles()` function, and its click handler branch

#### 7.3 Home page header (`web/public/index.html`)
- Lines 37-48: `header-left` contains home icon (38-42) and info icon (43-47)
- The developer mode toggle icon goes after the info icon, inside `header-left`
- Lines 57-61: `main-nav` with Activities, Receipts, Bundles links

#### 7.4 Activity rendering (`web/public/index.html`)
- Line 280: Fetches `/submit.catalogue.toml`
- Line 287: Parses TOML, line 288: gets user bundles
- Lines 300-354: Display rule processing — activities with `display: "on-entitlement"` (default) only show if user has the bundle
- No special test-bundle filtering exists — test activities are treated generically
- To hide test-bundle activities: add a check at ~line 303 that skips activities where ALL required bundles are `"test"` unless `sessionStorage.showDeveloperOptions` is set

#### 7.5 Per-form developer options — Detailed breakdown

**`submitVat.html`:**
- Toggle button (lines 363-365): `<div class="developer-controls"><button type="button" id="toggleDeveloperMode" class="developer-button">Show Developer Options</button></div>`
- Toggle JS (lines 1057-1077): addEventListener on `toggleBtn`, toggles `devSection.style.display`, updates button text, also handles `#sandboxObligationsOption` visibility
- Dev section (lines 329-358): `<div id="developerSection" style="display: none">` — contains `#testScenario` select (10 options), `#runFraudPreventionHeaderValidation` checkbox, `#sandboxObligationsOption` checkbox (conditionally shown)
- Other references: line 692 reads `testScenario`, line 693 reads `runFraudPreventionHeaderValidation`, line 694 reads `allowSandboxObligations`
- **Keep**: The dev section HTML and the form value reads. **Remove**: The toggle button HTML and toggle JS. **Add**: On page load, `if (sessionStorage.getItem('showDeveloperOptions')) developerSection.style.display = 'block';`
- **Special**: The `sandboxObligationsOption` conditional visibility logic (lines 1067-1074) also needs to move to page-load logic — show it when in sandbox mode AND developer mode is on

**`viewVatReturn.html`:**
- Toggle button (lines 152-154): Same `developer-controls` div pattern
- Toggle JS (lines 257-267): Simple toggle — `devSection.style.display` and button text
- Dev section (lines 128-147): `<div id="developerSection" style="display: none">` — contains `#testScenario` select (7 options), `#runFraudPreventionHeaderValidation` checkbox
- Other references: line 439 reads `testScenario`, line 440 reads `runFraudPreventionHeaderValidation`
- **Keep**: Dev section HTML and form value reads. **Remove**: Toggle button HTML and toggle JS. **Add**: sessionStorage check on page load.

**`vatObligations.html`:**
- Toggle button (lines 175-177): Same pattern
- Toggle JS (lines 291-301): Simple toggle
- Dev section (lines 122-170): `<div id="developerSection" style="display: none">` — contains `#testScenario` select (36 options for obligation scenarios), `#runFraudPreventionHeaderValidation` checkbox
- Other references: line 428 reads `testScenario`, line 429 reads `runFraudPreventionHeaderValidation`
- **Keep**: Dev section HTML and form value reads. **Remove**: Toggle button HTML and toggle JS. **Add**: sessionStorage check on page load.

#### 7.6 Behaviour test references — What needs updating

**`behaviour-tests/steps/behaviour-steps.js` — `goToHomePage()` (lines 30-43):**
- Line 33: `await expect(page.getByText("Back to Home")).toBeVisible();`
- Line 37: `loggedClick(page, "button:has-text('Back to Home')", "Back to Home", ...)`
- **Replace with**: Click the home icon `.home-link` or nav bar `Activities` link. Use `await loggedClick(page, ".home-link", "Home icon", { screenshotPath })` and wait for `index.html` URL.

**`behaviour-tests/steps/behaviour-bundle-steps.js` — `clearBundles()` (lines 27-83):**
- Lines 35-56: Polling loop waiting for `#removeAllBtn` to be visible, with fallback checking if "Request Test" is visible (bundles already cleared)
- Lines 74-82: Click `#removeAllBtn` with `page.once("dialog", dialog => dialog.accept())` for confirmation
- **Replace with**: Direct API call via `page.evaluate()`:
  ```javascript
  await page.evaluate(async () => {
    const response = await fetch('/api/v1/bundle', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeAll: true })
    });
    return response.ok;
  });
  ```
  The "Request Test" fallback (already cleared) check should remain.

**`behaviour-tests/help.behaviour.test.js` — Guide navigation test (lines 389-413):**
- Lines 389-392: Asserts "Return to Home" button visible
- Lines 394-397: Asserts "View FAQs" button visible
- Lines 401-413: Clicks "View FAQs", waits for navigation to help page
- **Replace with**: Navigate via nav bar. Test that the nav bar "Activities" link navigates to home, and use a direct URL or nav link to get to help page. Remove the scroll-to-bottom + button assertions entirely.

**`behaviour-tests/steps/behaviour-hmrc-vat-steps.js` — 4 functions with developer options clicks:**

1. `fillInVat()` (lines 140-152): Checks for "Show Developer Options"/"Hide Developer Options" visibility, clicks to show if needed
2. `fillInVat9Box()` (lines 296-308): Same pattern
3. `fillInObligations()` (lines 611-614): Simpler — always clicks "Show Developer Options"
4. `fillInViewVat()` (lines 997-1000): Same simple pattern

- **Replace all 4**: Remove the "Show Developer Options" click blocks entirely. The developer section is now automatically visible when `sessionStorage.showDeveloperOptions` is set (which the global toggle sets before navigation). The test flow becomes:
  1. On home page, click developer mode toggle icon
  2. Navigate to sandbox activity
  3. Developer section is auto-visible — just fill in the fields directly

#### 7.7 Pages that need `developer-mode.js` script tag

There are 25 HTML pages with the `header-left` structure (no shared template — each has its own header copy). The `developer-mode.js` script injects the toggle icon into `.header-left` dynamically.

**Pages to add `<script src="[path]/developer-mode.js"></script>`:**

Only pages where developer mode is **functionally relevant** need the script:

| Page | Relative path to script | Why needed |
|------|------------------------|------------|
| `index.html` | `developer-mode.js` | Filters test-bundle activities |
| `account/bundles.html` | `../developer-mode.js` | (Future: hide test bundle card) |
| `hmrc/vat/submitVat.html` | `../../developer-mode.js` | Shows/hides `#developerSection` |
| `hmrc/vat/viewVatReturn.html` | `../../developer-mode.js` | Shows/hides `#developerSection` |
| `hmrc/vat/vatObligations.html` | `../../developer-mode.js` | Shows/hides `#developerSection` |

The remaining 20 pages (about, privacy, terms, login, callbacks, error pages, guide, help, receipts, test index) don't need the toggle — they have no developer-mode-sensitive content. Adding the script to them would show the toggle icon but it wouldn't do anything useful. **Decision: only add to the 5 pages listed above.** The toggle state persists in sessionStorage across pages regardless of which page set it.

#### 7.8 `developer-mode.js` implementation design

```javascript
// web/public/developer-mode.js
(function() {
  const KEY = 'showDeveloperOptions';

  // Read current state
  const isEnabled = () => sessionStorage.getItem(KEY) === 'true';

  // Apply state to body class and icon
  function applyState() {
    const enabled = isEnabled();
    document.body.classList.toggle('developer-mode', enabled);
    const icon = document.querySelector('.developer-mode-toggle');
    if (icon) {
      icon.style.transform = enabled ? 'scaleX(-1)' : '';
      icon.querySelector('svg path').style.fill = enabled ? '#e67e22' : '#666';
    }
    // Dispatch event for page-specific handlers
    window.dispatchEvent(new CustomEvent('developer-mode-changed', { detail: { enabled } }));
  }

  // Inject toggle icon into header-left
  function injectToggle() {
    const headerLeft = document.querySelector('.header-left');
    if (!headerLeft) return;

    const toggle = document.createElement('a');
    toggle.href = '#';
    toggle.title = 'Toggle Developer Mode';
    toggle.className = 'developer-mode-toggle';
    toggle.innerHTML = '<svg class="developer-icon" viewBox="0 0 24 24" aria-hidden="true"><!-- construction worker SVG path --></svg>';
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      sessionStorage.setItem(KEY, isEnabled() ? '' : 'true');
      applyState();
    });

    headerLeft.appendChild(toggle);
    applyState();
  }

  // Run on DOMContentLoaded or immediately if already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectToggle);
  } else {
    injectToggle();
  }
})();
```

Pages react to developer mode by listening:
```javascript
// In index.html — re-render activities when toggled
window.addEventListener('developer-mode-changed', () => renderActivities());

// In submitVat.html / viewVatReturn.html / vatObligations.html — show/hide dev section
window.addEventListener('developer-mode-changed', (e) => {
  document.getElementById('developerSection').style.display = e.detail.enabled ? 'block' : 'none';
});
```

And on page load (before/without toggle interaction):
```javascript
// Check sessionStorage on load
if (sessionStorage.getItem('showDeveloperOptions') === 'true') {
  document.getElementById('developerSection').style.display = 'block';
}
```

#### 7.9 PublishStack.java — CloudFront invalidation

`developer-mode.js` is a new file in the web root. It will be deployed to S3 automatically (it's inside `web/public/`). The CloudFront distribution paths list (lines 227-255) uses specific path patterns. Since `developer-mode.js` is at the root level, add `/developer-mode.js` to the `distributionPaths` list in `PublishStack.java`.

---

### 8. Execution Order

1. **Create `web/public/developer-mode.js`** — the shared toggle script
2. **Modify `web/public/guide/index.html`** — remove navigation container (lines 259-264)
3. **Modify `web/public/account/bundles.html`** — remove buttons + JS, add developer-mode.js script tag
4. **Modify `web/public/index.html`** — add developer-mode.js script tag, add test-bundle activity filtering, add event listener for re-render
5. **Modify `web/public/hmrc/vat/submitVat.html`** — remove toggle button + JS, add developer-mode.js script tag, add sessionStorage check + event listener
6. **Modify `web/public/hmrc/vat/viewVatReturn.html`** — same pattern
7. **Modify `web/public/hmrc/vat/vatObligations.html`** — same pattern
8. **Modify `infra/.../PublishStack.java`** — add `/developer-mode.js` to distributionPaths
9. **Modify `behaviour-tests/steps/behaviour-steps.js`** — `goToHomePage()` uses home icon
10. **Modify `behaviour-tests/steps/behaviour-bundle-steps.js`** — `clearBundles()` uses API
11. **Modify `behaviour-tests/help.behaviour.test.js`** — remove guide button assertions
12. **Modify `behaviour-tests/steps/behaviour-hmrc-vat-steps.js`** — remove per-form developer option clicks

---

### 9. Verification

```bash
# Unit tests
npm test

# Browser tests (if applicable)
npm run test:browser

# Local behaviour tests
npm run test:submitVatBehaviour-proxy

# CDK build (PublishStack changes)
./mvnw clean verify
```

After deployment:
- Visit `submit.diyaccounting.co.uk` — should not show sandbox activities
- Click the "man digging" icon — sandbox activities appear
- Navigate to a sandbox form — developer section is automatically visible
- Toggle off — sandbox activities disappear, forms hide developer section
