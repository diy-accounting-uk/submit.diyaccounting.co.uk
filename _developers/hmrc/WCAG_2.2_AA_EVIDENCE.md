# WCAG 2.2 AA Evidence — Manual Review of the Six New Criteria

**Date**: 3 September 2026
**Scope**: the 25 pages listed in `scripts/text-spacing-test.js`, the same set covered by the pa11y, axe, Lighthouse and text-spacing scans.
**Method**: automated measurement via a new Playwright script (`scripts/wcag22-manual-review.js`) for the two criteria that are checkable by measuring the rendered page, plus manual review of markup and the login flow for the other four. Pages were served statically from `web/public` on a local ephemeral port and driven with Chromium via Playwright — not the shared dev ports, and no behaviour-test harness.

This document covers only the six criteria WCAG 2.2 added over 2.1: 2.4.11, 2.5.7, 2.5.8, 3.2.6, 3.3.7, 3.3.8. The wider WCAG 2.1 AA checklist is `hmrc_questionnaire_2_WCAG_2.1_AA_diy_accounting_limited_v2.md`.

## 2.4.11 Focus Not Obscured (Minimum)

**Method**: for each page, at 1280px and 375px, load fresh (no stored consent choice, so the cookie-consent banner shows), then press Tab repeatedly. At each step, take the focused element's bounding box centre and compare `document.elementFromPoint` against the focused element; if they differ, walk up the covering element's ancestors for a `position: fixed` or `sticky` box.

**Finding**: the cookie-consent banner (`#consent-banner`, appended by `submit.js`, `position: fixed; bottom: 0`) sits over the last few tab stops — usually the footer's `privacy`/`terms`/`accessibility` links — because it's the last element in the DOM and the page has no more room to scroll it out of the way. First run: 34 of 726 tab stops obscured, across 12 of the 25 pages.

**Fix** (`web/public/submit.css`): a `body:has(#consent-banner)::after` generated block reserves 140px of real scrollable space below the footer, and `html:has(#consent-banner) { scroll-padding-bottom: 140px }` keeps the browser's focus-driven scroll from landing right at the banner's edge. Plain `padding-bottom` on `body` or `margin-bottom` on `footer` were tried first and don't work here — `body` has a fixed `height: 100%` for the sticky-footer layout, so trailing padding/margin on it (or on its last flow child) gets absorbed into the already-overflowing content instead of reserving space; only a genuine rendered box does. See commit for the full CSS and the reasoning in its comment.

| Viewport | Before | After |
|----------|--------|-------|
| 1280px | 17/363 obscured | 0/363 |
| 375px | 17/363 obscured | 1/363 |

The one remaining case (`privacy.html` at 375px) is a false positive from the script's own measurement, not a real defect — see the note below.

**Method note — multi-line inline links**: "Google's Privacy Policy" and "Google Analytics Data Safeguards" in `privacy.html` are adjacent inline links inside one sentence, each wrapping across two lines at 375px. `getBoundingClientRect()` returns the union box of both line fragments, so the two links' union boxes overlap even though neither is actually covered — confirmed with `getClientRects()` (both links: 2 line fragments each, correctly laid out one after the other) and the covering element's computed `position` is `static`, not `fixed`/`sticky`, so no overlay is involved. No fix needed.

**Screenshot**: `target/wcag22-screenshots/index-footer-focus-vs-banner.png` — the `accessibility` footer link focused on `/`, entirely clear of the banner. `target/wcag22-screenshots/submitVat-date-inputs.png` shows the same page with the banner visible alongside the enlarged date inputs (see 2.5.8 below).

## 2.5.7 Dragging Movements

**Method**: searched `web/public` (excluding `web/public-simulator` and `web/public/tests`) for drag/swipe/slider implementations — `draggable`, `dragstart`, `dragover`, `ondrag`, `sortable`, `touchmove`, `swipe`, `type="range"`.

**Finding**: no matches. The site has no drag-operable control anywhere — no sliders, sortable lists, drag-and-drop, or swipe gestures. All interaction is via standard form controls, buttons, and links.

**Result**: not applicable. No fix needed.

## 2.5.8 Target Size (Minimum)

**Method**: for every page at 1280px and 375px, measure every `a[href], button, input, select, textarea, [role="button"], [tabindex]` element's rendered box. A target passes if it's at least 24×24 CSS px, or sits inline within a run of sentence text (inline-text exception), or has at least 24px clearance to every other target (spacing exception).

**Finding**: 14 of 760 measured targets failed on first run, all genuine:

| Page | Element | Size before | Cause |
|------|---------|-------------|-------|
| `hmrc/vat/submitVat.html` | `#periodStart`, `#periodEnd` | 123.3×21.3 | `input[type="date"]` had no CSS rule at all — browser default sizing |
| `hmrc/vat/viewVatReturn.html` | `#periodStart`, `#periodEnd` | 123.3×21.3 | same |
| `hmrc/vat/vatObligations.html` | `#fromDate` (375px only) | 123.3×21.3 | same |
| `accessibility.html` | 4 results-table links, 1 "Test Results Dashboard" list link | ~17px tall | each link is the sole content of its `<td>`/`<li>`, so line-height alone (~17px) is all it gets — no surrounding sentence text for the inline exception, and neighbouring rows/paragraphs sit closer than 24px |

**Fix**:
- `web/public/submit.css`: added `input[type="date"]` to the existing `input[type="text"], input[type="number"]` rule (which the date inputs weren't covered by) plus `min-height: 24px`.
- `web/public/accessibility.html`: `table td a, li > a:only-child { display: inline-block; padding: 4px 2px; }` — gives a standalone link its own 24px+ box directly rather than relying on the spacing exception.

**Result after fix**: 760/760 pass at both viewports. `node scripts/text-spacing-test.js` re-run after the CSS change: still 25/25 pages pass (WCAG 1.4.12 unaffected).

**Screenshot**: `target/wcag22-screenshots/submitVat-date-inputs.png` shows the enlarged date inputs (40.5px tall, was 21.3px).

## 3.2.6 Consistent Help

**Method**: checked whether a help mechanism recurs across pages and, if so, whether it's in the same relative position each time.

**Finding**: the header's "About & Help" info-icon link (`class="info-link"`, links to `about.html`, which itself links to `help.html`) appears on all 25 pages, always as the second item in `.header-left`, immediately after the home icon — the header markup is templated identically across every page. `help.html` additionally carries a "Submit a Support Request" form and a GitHub issue link. The six `errors/*.html` pages that error out of the normal flow also carry an explicit `Help` text link in their content, in addition to the consistent icon.

**Result**: pass — the recurring help mechanism (the info icon) is in the same relative order everywhere it appears. No fix needed.

## 3.3.7 Redundant Entry

**Method**: reviewed every form across the 25 pages for information a user might be asked to re-enter within one process, and for `autocomplete` settings that would help or block the browser's own value-remembering.

**Finding**: `hmrc/vat/submitVat.html`, `hmrc/vat/vatObligations.html`, and `hmrc/vat/viewVatReturn.html` are three independent, single-step tools (not steps of one wizard), each asking for the same VAT registration number. Nothing is asked twice *within* any one of them, so strict 3.3.7 (redundant entry within a single process) isn't triggered. But `submitVat.html`'s VRN and period-date fields had `autocomplete="off"`, while the same fields on the other two pages didn't — an inconsistency that actively blocked the browser's own previously-typed-value suggestions on the page where getting the VRN right matters most, for no stated reason (unlike the Box 1–9 return figures further down the same form, which change every submission and are correctly left `autocomplete="off"`).

**Fix**: removed `autocomplete="off"` from `#vatNumber`, `#periodStart`, `#periodEnd` in `web/public/hmrc/vat/submitVat.html`, bringing it in line with its sibling pages and letting the browser offer previously-entered values.

The pass-redemption passphrase (`bundles.html`) and the FAQ search box (`help.html`) keep `autocomplete="off"` — a one-time invitation code and a transient search query are not "previously provided information" a user would want re-suggested.

## 3.3.8 Accessible Authentication (Minimum)

**Method**: traced the login flow and searched `web/public` for any password/authentication input this repository renders itself.

**Finding**: login is entirely delegated to hosted providers outside this repository's markup:
- `auth/login.html` redirects to the AWS Cognito Hosted UI, which in turn offers Google federation (`accounts.google.com`) or, when enabled for test lanes, native Cognito username/password plus optional TOTP.
- In dev/proxy environments only, `auth/login-mock-addon.js` adds a second button that redirects to a local `mock-oauth2-server` (returns an empty script in production).

This repository contains no custom password field, no CAPTCHA, and no other cognitive-function-test-based authentication step anywhere in `web/public`. The actual credential-entry forms (username/password, TOTP code) render on `accounts.google.com` and the Cognito Hosted UI domain, both outside this repo.

**What's ours vs. Cognito's / Google's**:
- **Ours**: the redirect buttons themselves — plain links/buttons, not authentication inputs, already covered by the general keyboard/focus/target-size checks above.
- **Cognito's**: whether its native username/password and TOTP fields permit paste (the standard way a code/password field satisfies 3.3.8's "a mechanism is available to assist the user" exception) is an AWS Hosted UI implementation detail, not visible or fixable from this repository's source.
- **Google's**: Google's own sign-in flow (password manager support, passkeys/WebAuthn as a non-cognitive-test alternative) is Google's implementation, also outside this repo.

**Result**: pass by absence — nothing in this repository's own code requires a cognitive function test for authentication. No fix applicable here.

## Commands run

```
node scripts/static-server.mjs web/public          # ephemeral-port static server, not the shared dev ports
node scripts/wcag22-manual-review.js --url http://127.0.0.1:PORT --output target/wcag22-manual-review.json
node scripts/text-spacing-test.js --url http://127.0.0.1:PORT   # re-run after every CSS change; 25/25 throughout
npx pa11y-ci --config <urls rewritten to localhost> --reporter cli   # 27/27 URLs, 0 errors, after the fix
npx lighthouse http://127.0.0.1:PORT/ --only-categories=accessibility   # 1.0
```

`npx axe` (the CLI used for the committed `axe-wcag22-results.json`) fails on this machine with a chromedriver/Chrome version mismatch unrelated to these changes; pa11y, Lighthouse and the Playwright-driven scripts above (which exercise the same rendered pages) all confirm no regression.
