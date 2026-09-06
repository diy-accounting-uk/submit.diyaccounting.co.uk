# PLAN: Issue #655 — Multi-language support

> Source issue: https://github.com/antonycc/submit.diyaccounting.co.uk/issues/655
> Original body: (empty)
> Existing plans: none.

## Elaboration

Today the submit site is English-only with no i18n infrastructure (recon: single `localeCompare` call in `usage.html`, no translation loader, no `lang` switching). HMRC's MTD VAT is a UK-only obligation but the UK small-business population includes many native speakers of Welsh, Polish, Urdu, Punjabi, Bengali, and Gujarati (per ONS). A multilingual UI would:
- Widen market reach (Wales has a legal requirement for Welsh-language service parity in some contexts).
- Improve accessibility for users whose first language isn't English.
- Be a competitive differentiator vs FreeAgent/Sage for the underserved segments.

**Out of scope** for this issue: translating HMRC API responses or VAT forms themselves (those are HMRC's contract). **In scope**: translating the UI chrome (nav, buttons, form labels, error messages, copy on guide/about/help/privacy/terms).

## Likely source files to change

- New `web/public/lib/i18n.js` — tiny loader: reads `navigator.language` or an explicit override from localStorage/URL `?lang=cy`, loads `/i18n/{lang}.json`, exposes `window.t(key, vars)`.
- New `web/public/i18n/en.json`, `cy.json` (Welsh), `pl.json` (Polish), etc. — translation dictionaries.
- `web/public/*.html` — replace hard-coded strings with `data-i18n="nav.home"` attributes or inline `<span data-i18n="nav.home">Home</span>`; the loader replaces text at page load.
- Or (bigger change): move HTML content to a server-rendered template at the edge (Lambda@Edge) per locale — more complex, better SEO.
- `app/functions/edge/` — if we go server-rendered, add a Lambda@Edge that selects the template.
- Error messages returned from Lambdas — currently English-only; add an `Accept-Language` header aware response in `httpResponseHelper.js`.

## Likely tests to change/add

- Unit tests for `i18n.js`: fall back to English when a key is missing, honour `?lang=` override, persist to localStorage.
- Playwright behaviour test per locale: navigate with `?lang=cy`, assert the Home link reads "Cartref", etc.
- Accessibility test: `<html lang="cy">` attribute set correctly.
- Translation coverage CI check: script that fails if any key exists in `en.json` but is missing in other locales (or vice versa).

## Likely docs to change

- `guide.html`, `about.html`, `help.html` — write the English originals in a way amenable to translation (no inline links inside sentences; short clauses).
- New `CONTRIBUTING_I18N.md` — how to add a new language.
- `privacy.html` — mention that locale preference is stored in localStorage.

## Acceptance criteria

1. User can switch language via a header toggle (flag icons or language names) or `?lang=` URL param.
2. Supported languages in the first cut: English (base), Welsh (legal driver), Polish (demographic driver). Extend later.
3. HTML `lang` attribute set correctly per locale.
4. Language choice persists across page loads (localStorage).
5. All page chrome translated; unchecked keys fall back to English (and logged to metric-son / CloudWatch for completion tracking).
6. Lighthouse a11y and SEO scores unchanged or improved.
7. CI check prevents merging a PR that adds a new English string without adding equivalent keys to other locales (or explicitly deferring with a `// i18n:defer` marker).

## Implementation approach

**Recommended — client-side i18n first, server-side rendered locales later if SEO demands.**

1. Ship `i18n.js` + `en.json` as the baseline — no user-visible change.
2. Retrofit `web/public/index.html` as the pilot: every string gets a `data-i18n` attribute; add Welsh and Polish translations.
3. Add the header language toggle.
4. Extend to one page at a time (prioritise: bundles, submitVat, guide, about).
5. Once every page has `data-i18n`, consider a server-side rendered split if SEO analytics show value.

### Alternative A — adopt a library (i18next, formatjs)
Battle-tested, more features (pluralisation, date formatting). Adds ~30 KB JS. Recommended if we plan to ship >3 languages or need ICU message format.

### Alternative B — server-rendered per locale (Lambda@Edge)
Per-locale HTML served from the edge; zero JS overhead. Better SEO. Much more infrastructure work.

### Alternative C — machine translation for non-critical pages
Run English originals through a translation service (DeepL/Google) nightly to seed `.json` dictionaries; human review for legal-weight pages (privacy, terms) and UI chrome. Reduces the translation-author burden.

## Questions (for QUESTIONS.md)

- ~~Q655.1: Languages to support in the first cut?~~ — **answered 2026-04-22: EN, CY, PL, plus other UK-large-community languages.** Concretely, the target set is English (base), Welsh (cy), Polish (pl), plus the next four by UK speaker population per the 2021 Census: **Punjabi (pa), Urdu (ur), Bengali (bn), Gujarati (gu)**. Add Romanian (ro) if the small-business demographic signal supports it (TBC). Implementation: land EN+CY+PL first, add the RTL/complex-script languages (ur, bn) in a follow-up because they require a separate font-loading + bidi CSS pass.
- Q655.2: Accept a library dependency (i18next) or keep it dependency-free?
- Q655.3: Do we want server-rendered locales for SEO from day 1, or client-side first?
- Q655.4: Translation source — community volunteers, paid translators, or machine + review?
- Q655.5: Welsh — is legal parity actually required for a private SaaS? (Likely no, but worth confirming before scoping.)

## Good fit for Copilot?

Mixed. The scaffolding (i18n.js, the data-i18n retrofit, CI check) is Copilot-friendly. The translations themselves need human/native-speaker review.
