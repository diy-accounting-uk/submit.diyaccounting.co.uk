# PLAN: Issue #651 — Dark mode / high contrast mode

> Source issue: https://github.com/antonycc/submit.diyaccounting.co.uk/issues/651
> Original body: (empty)
> Existing plans: none found.
> Related: WCAG 2.1 AA questionnaire in `_developers/archive/Questionnaire-2-WCAG-2.1-AA-COMPLETED-*.xlsx` — high contrast is partially covered by WCAG 1.4.6 (Enhanced).

## Elaboration

Two related but distinct features:

1. **Dark mode** — follow the user's OS preference (`prefers-color-scheme: dark`). Implementation cost is low because `web/public/submit.css` already centralises colour through CSS custom properties (`--color-brand-primary`, `--text-primary`, etc. — recon found ~30 tokens). The work is to (a) define dark-theme values for each token in a `@media (prefers-color-scheme: dark) { :root { ... } }` block or a `[data-theme="dark"]` attribute, (b) eyeball every page for hard-coded `#fff`/`#000` that bypasses the tokens, and (c) test that charts/screenshots/iframes (Stripe Checkout) still look acceptable.

2. **High-contrast mode** — a stricter variant aimed at low-vision users (WCAG AAA 7:1 contrast). Typically implemented as a toggle in the site header rather than auto-detected, or detected via `forced-colors: active` (Windows High Contrast Mode). Less common than dark mode but valuable for accessibility compliance and for DIY Accounting's demographic (older small-business owners). Minimum impl: add a `[data-theme="high-contrast"]` variant alongside dark, plus a toggle in the header.

Both variants need to persist user preference across page loads — use `localStorage.setItem("theme", ...)` with a three-way toggle (auto / light / dark / high-contrast) in the header.

## Likely source files to change

- `web/public/submit.css` — add `@media (prefers-color-scheme: dark)` block and `[data-theme="high-contrast"]` selectors; convert any hard-coded colours to tokens.
- New `web/public/widgets/theme-toggle.js` — small widget that reads/writes `localStorage.theme`, applies `data-theme` on `<html>`, and renders a sun/moon/contrast toggle.
- Every HTML in `web/public/` — add the script tag for `theme-toggle.js` (or just put it in the existing shared snippet set).
- `web/public/index.html` and the other landing HTML — insert the toggle in the header (next to auth-status).
- `app/functions/edge/` edge Lambda (if one exists for CSP/headers) — add `Content-Security-Policy` headers compatible with the inline style trick `<html data-theme="...">` sets.
- `web/public/auth/signed-out.html` etc. — check they respect the theme.

## Likely tests to change/add

- New `web/browser-tests/theme.test.js` — load a page, call `matchMedia('(prefers-color-scheme: dark)').matches`, assert `:root` CSS variables resolve to dark values.
- Playwright theme behaviour test — toggle the theme widget, assert `html[data-theme]` attribute changes and a representative element's computed `background-color` updates.
- Pa11y run in dark and high-contrast themes: add entries to `.pa11yci.*.json`.
- Add axe-core contrast checks to the accessibility test in the compliance workflow.

## Likely docs to change

- `accessibility.html` — document dark mode + high-contrast toggle.
- `guide.html` / `help.html` — "Appearance" section.
- `_developers/archive/Questionnaire-2-WCAG-2.1-AA-COMPLETED-*.xlsx` — update section 1.4.6 / 1.4.11 with new evidence.

## Acceptance criteria

1. Visiting any page in `web/public/` with a user whose OS is set to dark renders the site with the dark palette; light palette for light OS.
2. A visible header widget offers four options: Auto (default), Light, Dark, High contrast. Selection persists across page loads via `localStorage`.
3. All text on all pages meets WCAG 2.1 AA contrast (4.5:1 body, 3:1 large) in both light and dark themes; AAA (7:1 body) in high-contrast theme.
4. Stripe Customer Portal iframe and any third-party widgets degrade gracefully (keep their own theme, but framed by our header/footer in the selected theme).
5. No hard-coded colours remain in `web/public/*.html` or `submit.css`; all colours are CSS custom properties.
6. Pa11y axe run passes with no new violations.

## Implementation approach

**Recommended — tokens + auto detection + toggle, in that order.**

1. **Audit** — grep `web/public/` for hex colour literals (`#[0-9a-f]{3,6}`) and `rgb(` outside of `:root` and replace with tokens.
2. **Define dark palette** — in `submit.css`, add `@media (prefers-color-scheme: dark) { :root { --color-...: ...; } }`. Use a tool (e.g. Leonardo, Material Design token generator) to pick contrast-checked dark values.
3. **Add the toggle widget** — `web/public/widgets/theme-toggle.js` reads `localStorage.theme`, sets `data-theme` on `<html>`, renders a dropdown in the header.
4. **High-contrast variant** — one additional palette; reuse tokens.
5. **Tests** — new browser/Playwright tests + pa11y config additions.
6. **Documentation** — update accessibility page.

### Alternative A — dark mode only (defer high-contrast)
Ship the 80% case now, log a follow-up issue for high-contrast. Smaller PR, faster to land. Recommended split if we want to deliver incrementally.

### Alternative B — use Windows `forced-colors` only for high-contrast
Rely on `@media (forced-colors: active)` CSS and don't build our own toggle. Works out-of-the-box on Windows but does nothing for users on macOS/Linux who want a high-contrast mode. Weak on coverage.

## Questions (for QUESTIONS.md)

- Q651.1: Scope — deliver dark mode only first (Alt A), or both together?
- Q651.2: Is the toggle OK to appear in the header, or should it live in the footer/account menu? (Header is more discoverable; account menu is cleaner.)
- Q651.3: Any brand-approved dark palette already defined, or do we pick one from scratch?

## Good fit for Copilot?

Yes for the token audit + palette application + test scaffolding (mechanical). A human should pick the dark palette and validate contrast ratios.
