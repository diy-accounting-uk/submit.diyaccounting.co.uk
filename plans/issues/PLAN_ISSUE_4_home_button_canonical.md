# PLAN: Issue #4 (pre-migration #745) — Home button should be without `index.html`

> Source issue: https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/issues/4
> Original body: (empty)
> Existing plans: none specific; related to navigation consistency.

## Elaboration

Every page in `web/public/*.html` uses a main nav with a "Home" link that currently targets `index.html` (recon found `href="index.html"` at `index.html:68` and similar `../index.html` references on nested pages). The canonical URL for the home page is `https://submit.diyaccounting.co.uk/` — the explicit `index.html` is a CloudFront/S3 convenience, not the public URL.

Two problems:

1. **Breadcrumbs show `/index.html`** in the address bar when users click Home, rather than the clean root `/`. This makes screenshots and shared links look amateur and can produce duplicate URL pairs in analytics (`/` vs `/index.html`).
2. **SEO — canonical handling** — Google treats `https://submit.diyaccounting.co.uk/` and `https://submit.diyaccounting.co.uk/index.html` as distinct URLs unless a `<link rel="canonical">` is set. `index.html` does set one (check: `<link rel="canonical" href="https://submit.diyaccounting.co.uk/" />`) but the in-site nav should not be driving users to the non-canonical form.

Scope: change every "Home" link across the site to `/` (root) from top-level pages, and to the site root (`/`, not `../index.html`) from nested pages. Same for the brand/logo link if it does the same thing.

## Likely source files to change

- All of `web/public/**/*.html` — every file with the main nav. Recon showed at least: `index.html`, `bundles.html`, `about.html`, `guide.html`, `help.html`, `usage.html`, `mcp.html`, `privacy.html`, `terms.html`, `accessibility.html`, `passes/generate-digital.html`, `passes/generate-physical.html`, `hmrc/vat/*.html`, `hmrc/receipt/receipts.html`, `auth/*.html`.
- `web/public/widgets/auth-status.js:215-216` — on sign-out, it currently navigates to `index.html` via a path-prefix trick. Replace with `/`.
- Any template or snippet for the nav if one exists (there isn't one; each page duplicates the nav).
- `web/public-simulator/` is a *generated* mirror of `web/public/` (per `CLAUDE.md`). Do not hand-edit — the build step regenerates it.

## Likely tests to change/add

- New Playwright behaviour assertion (added to `submitVat.behaviour.test.js` or a new `navigation.behaviour.test.js`): from any page, clicking the Home link in the main nav lands on exactly the URL `baseUrl + '/'` (no `/index.html` suffix).
- `web/browser-tests/` unit/page test for the nav widget if one exists: assert the href is `/`, not `index.html`.
- Accessibility scan (`.pa11yci.*.json`) — no change expected; this is a URL hygiene fix.
- Add a lightweight regression check to the compliance workflow: `grep -r 'href="index.html"' web/public/` should return 0 results (or only intentional ones).

## Likely docs to change

- `_developers/SITE_MAP.md` — if it lists URL patterns, align with `/` as canonical.
- `REPORT_REPOSITORY_CONTENTS.md` — update if it documents the nav.

## Acceptance criteria

1. From any page on the deployed site, clicking Home produces a URL in the address bar that ends with `/` and nothing else (no `/index.html`, no query string).
2. From auth/sign-out flows, post-logout redirects go to `/`, not `/index.html`.
3. No HTML file under `web/public/` contains `href="index.html"` or `href="../index.html"` for the main nav or brand/logo link.
4. The Playwright regression asserts (1) for the home page's own Home link.
5. Lighthouse score for the home page does not regress.

## Implementation approach

**Recommended — blanket search/replace with a grep guard.**

1. Search `href="index.html"` and `href="../index.html"` and similar `../../index.html` across `web/public/**` and replace with an absolute `/` (or a root-relative `"/"`). Absolute `/` is the cleanest because it works identically from any page depth.
2. For the brand/logo link (`<a class="brand-logo">` or similar), also set to `/`.
3. Update `auth-status.js:215-216` sign-out redirect to use `/` instead of the pathPrefix + `index.html` trick.
4. Add a grep-based pre-commit or CI check to prevent regressions.
5. Rebuild the simulator mirror (`web/public-simulator/`) via whatever build step produces it.

### Alternative A — introduce a single nav partial
Extract the nav into a shared include that all pages source. Solves this and prevents future nav drift. Larger change; should be a separate refactor issue.

### Alternative B — CloudFront 301 `/index.html` → `/`
Keep the HTML as-is but 301-redirect requests for `/index.html` to `/`. Reduces the blast radius but doesn't fix the amateur-looking address bar while the user is clicking within the site.

## Questions (for QUESTIONS.md)

- Q4.1: Should the redirect in `auth-status.js` include the environment path-prefix on the simulator (`/sim/`), i.e. `/sim/` vs `/`? Current code switches on `window.location.pathname.startsWith("/sim/")`. I'll preserve that behaviour unless you want the simulator to go to `/` too.
- Q4.2: Is now a good time to extract the nav into a shared partial (Alternative A)? It would simplify this issue and several others (#6, #5).

## Good fit for Copilot?

Yes — bounded, pattern-based, low-risk. Ideal Copilot task: "replace every `href="index.html"` / `href="../index.html"` etc. in `web/public/` with `href="/"`, update `auth-status.js:215-216`, add a grep check to CI, write a Playwright assertion."
