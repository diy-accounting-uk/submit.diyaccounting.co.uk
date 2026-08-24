# PLAN: Issue #8 (pre-migration #735) — "Packed" mobile UI

> Source issue: https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/issues/8
> Original body: screenshot only (641×781 PNG); title "Can get slightly 'Packed' on mobile UI".
> Existing plans: none mobile-specific; overlaps with #5 (manage subscription button) and #4 (home button) in the broader "mobile UX audit" theme.

## Elaboration

On narrow viewports (the screenshot is 641×781, which suggests a tablet-portrait or device-emulator breakpoint), elements crowd each other — likely the header nav (home, bundles, activities, login), the token-balance widget, the entitlement-status widget, and the main content competing for horizontal space. Without more context the exact cause is one of:

1. **Header nav** — the brand + 3–5 nav links wrap onto two lines and push the main content down.
2. **Token balance widget** (`web/public/widgets/auth-status.js` lines 254-256 show token display refresh) — sits next to user status and overlaps on ≤640px.
3. **Current bundles grid** on `/bundles.html` — cards stack but the buttons inside each card overflow.
4. **Tables on hmrc/vat/ pages** — VAT obligation tables are wide with 6+ columns.

The fix is a targeted media-query audit and selective hide/collapse pattern on ≤640px, not a full responsive redesign.

## Likely source files to change

- `web/public/submit.css` — audit existing `@media (max-width: 768px)` and `@media (max-width: 480px)` rules. Add a mid-breakpoint at 640px if missing.
- `web/public/*.html` — likely no structural change; prefer CSS-only fix.
- `web/public/widgets/auth-status.js` — if the widget injects inline styles on small screens, adjust.
- Reference screenshot: save to `_developers/screenshots/issue-735-packed-mobile.png`.

## Likely tests to change/add

- New `web/browser-tests/mobileLayout.test.js` — for each public page, render at 375, 414, 640, 768, 1024 widths and assert the header/footer/main sections occupy reasonable space (no horizontal overflow, no elements with `getBoundingClientRect().right > innerWidth`).
- Add a visual-snapshot step to Playwright at mobile widths (requires adding `toHaveScreenshot` or `expect(page).toHaveScreenshot()` with a tolerance).
- Extend pa11y config (`.pa11yci.*.json`) with mobile viewport entries.

## Likely docs to change

- `accessibility.html` if it documents mobile support.
- `_developers/backlog/IMPLEMENTATION_PLAN_PRODUCTION_HARDENING.md` — add mobile layout audit.

## Acceptance criteria

1. On viewports 320, 375, 390, 414, 640 px wide, no page in `web/public/` exhibits:
   - Horizontal scroll.
   - Text overlapping (e.g. token count touching user name).
   - Clipped tap targets (<44×44 px).
2. Main nav either fits on one line (with truncated labels if needed) or collapses into a hamburger menu below 640px.
3. Entitlement status + token balance widgets stack below the user chip on ≤480px rather than sitting beside it.
4. Browser-test snapshot suite green; pa11y green at all widths.
5. Lighthouse mobile performance ≥ existing baseline.

## Implementation approach

**Recommended — progressive audit.**

1. Take fresh screenshots at 320/375/390/414/640 px for every top-level page in `web/public/` (script-driven via Playwright).
2. For each overflow/overlap observed, add a targeted CSS rule under the appropriate `@media` block.
3. Prefer `flex-wrap: wrap` + `min-width: 0` over `display: none` to keep content accessible.
4. Consider a hamburger menu (detail panel) for the main nav below 640px if 4+ items don't fit — reuses existing CSS tokens.
5. Land the browser-test snapshot suite as the regression guard.

### Alternative A — container queries
Replace `@media (max-width)` with `@container` queries on a `main` wrapper. Modern, but CSS container queries need Safari 16+ / iOS 16+ which is broadly available. Big refactor.

### Alternative B — adopt an existing framework's grid
E.g. add Pico.css or Tailwind just for mobile breakpoints. Heavier dependency for a focused UI fix; discouraged unless we're planning a larger redesign.

## Questions (for QUESTIONS.md)

- Q8.1: Which page does the screenshot show? (Looks like `/bundles.html` from the shapes, but hard to tell.) Please confirm so the audit starts there.
- Q8.2: Is a hamburger menu acceptable for the nav below 640px, or do you want all links always visible?

## Good fit for Copilot?

Partial. Diagnosing from a screenshot needs human visual judgment. Copilot can mechanise: the screenshot script, the browser-test snapshot scaffolding, and implementing the CSS fix after a human classifies the root cause.
