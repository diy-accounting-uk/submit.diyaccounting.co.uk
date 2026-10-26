<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN_SITE_DESIGN: the whole-site design pass

## The ask

> "Whole-site design pass: screenshots of every page, then the review, the shared layer, the HMRC pages, the root, account and error pages, the Companies House pages"

This plan is the review (DS2). It feeds DS3 (the shared layer), DS4 (HMRC pages), DS5 (root, account and error pages) and DS6 (Companies House pages).

- **Input**: DS1's 432 screenshots of 75 pages. Every evidence path below is relative to `target/site-screenshots/`. The layout is `<page>/<width>-<theme>[-<state>].png`.
- **Method**: the `ui-ux-pro-max` skill for the review, with its guideline ids in brackets. The `frontend-design` skill for the direction. Contrast ratios are WCAG 2.2 relative luminance.
- **Shared code**: `web/public/submit.css` (2,382 lines) and `web/public/widgets/page-chrome.js` (header icons, auth row, main nav, footer variants).
- **CT600**: `companies-house/fileCompanyTaxReturn.html` uses the same `.form-container` and `.btn` components as the other Companies House pages, so CT5 builds its redesign on these tokens and DS6 applies them to the rest.
- **HS1**: the submission-record house style adopts DS2's tokens when both land.

## 1. Site-wide findings, ranked by pages touched

### 1.1 The tokens in `submit.css` do not govern the stylesheet (75 pages)

- 40 custom properties sit beside 171 raw hex values. `#2c5aa0` is written out 26 times next to its own token [color-semantic].
- Three blues do one job: `#2c5aa0` (brand), `#007acc` (`.action-button`, `.spinner`) and `#005ea5` (focus).
- Status messages exist twice: `.status-success` and friends (line ~1230), then `.status-message.success` and friends (line ~1612). `.spinner` is also defined twice.
- Success green `#28a745` used as text is 3.13:1 on white and fails AA. It carries the "Fulfilled" status and the "granted" entitlement [color-accessible-pairs, color-not-only].
- Font sizes and spacing are `em`, so they compound inside nested elements [font-scale].
- Evidence: `index.html/1280-light.png`, `about.html/1280-light.png` (old obligations table with green "Fulfilled").

### 1.2 Typography has no scale and no single case rule (75 pages)

- The face is Arial. In references such as `XAIS12345678910` and `QQ 12 34 56 C` the I, l and 1 are hard to tell apart [font-pairing].
- The sizes run 0.85em to 2.2em in nine near-equal steps. Hint text is 0.9em, about 14px [readable-font-size].
- The `h1` carries a text shadow. Headings mix Title Case ("Signed Out", "Not Found", "Generate a Digital Pass", "Token Usage", "File Company Tax Return", "Operator Dashboard", "Have a Pass?") with sentence case on most pages [consistency].
- Figures are proportional, so money columns do not line up [number-tabular].
- Evidence: `auth/signed-out.html/1280-light.png`, `companies-house/fileCompanyTaxReturn.html/1280-light.png`, `hmrc/itsa/selfEmploymentPeriod.html/1280-light.png`.

### 1.3 There is no dark mode (75 pages)

- `submit.css` has no `prefers-color-scheme` rule. Every dark PNG equals its light PNG [dark-mode-pairing, color-dark-mode].
- 30 pages carry an inline `<style>` block (21 root pages, `operator/dashboard`, `passes/generate-physical`, 5 under `hmrc/`, 2 under `companies-house/`). Their colours move onto tokens before dark mode can reach them; nine of them paint the purple gradient (1.13).
- Evidence: `index.html/1280-dark.png` against `index.html/1280-light.png`.

### 1.4 The footer has four variants and unstyled links (73 pages)

- `full`: tests, api, privacy, terms, accessibility, Cookie choices. `activity` (every HMRC and Companies House page): tests and api only, so privacy, terms and cookie choices are missing where a customer files [consistent-help, navigation-consistency].
- Callback and edge 404 pages show "privacy" only. The error pages show "About Privacy Terms Help" in a different case.
- "tests" and "api" are developer links in front of customers.
- "Source" and "PolyForm Internal Use License" use the browser default blue `#0000ee`. So do many content links (calendar and rates sources, "Search Companies House", "Return to home page") [color-semantic].
- Evidence: `hmrc/vat/submitVat.html/1280-light.png`, `errors/404.html/1280-light.png`, `companies-house/filingCallback.html/1280-light.png`, `index.html/1280-light.png`.

### 1.5 The cookie banner covers the page's own action (73 pages)

- A fixed grey bar (`#ddd`) across the full width. At 390 it is 130px tall and sits over the primary button of short forms [focus-not-obscured, fixed-element-offset].
- Its "Decline" button is dark grey, styled as a second primary.
- Evidence: `hmrc/itsa/annualSubmission.html/390-light.png`, `hmrc/itsa/taxCalculation.html/390-light.png`, `auth/login.html/390-light.png`.

### 1.6 The header and navigation take the first screen (71 pages)

- The perspective spreadsheet grid, a centred `h1`, a subtitle and seven boxed nav buttons fill the top 245px at 1280. At 390 the nav wraps to three rows and the content starts at 410px of 844 [content-priority].
- The active nav item is shown by weight alone, inside the same box [nav-state-active].
- The nav has no Companies House, Income Tax or Help entry. "HMRC Tax Rates and Allowances" is the widest item [nav-hierarchy].
- Coverage varies: `policybee.html` has a 4-link static nav, and the error and callback pages have no nav [navigation-consistency].
- The `Log in` box changes to "Home" on the login page.
- Evidence: `index.html/390-light.png`, `policybee.html/1280-light.png`, `auth/login.html/1280-light.png`.

### 1.7 Buttons blur primary, secondary and disabled (about 45 pages)

- Every card ends in a full-width 56px brand button, including twelve on the Income Tax dashboard [primary-action].
- Grey `#6c757d` is the disabled colour and also the colour of live actions: "Log in to subscribe", "Generate Pass", "Choose a file", "Read the Guide", "Decline". Live actions read as disabled [state-clarity, disabled-states].
- `.action-button`, `.secondary-button` and `.cancel-button` use raw colours and 4px or 8px padding, which gives targets under 44px [touch-target-size].
- Labels mix case: "Go to obligations" and "Go to File a Quarterly Update"; "Return to Home" and "Return home".
- Evidence: `bundles.html/1280-light.png`, `hmrc/itsa/dashboard.html/1280-light.png`, `passes/generate-digital.html/1280-light.png`.

### 1.8 Form controls fail contrast and focus (37 pages)

- Text input borders are `#ddd` on white, 1.36:1, against the 3:1 needed for a field boundary (WCAG 1.4.11) [color-contrast].
- `input[type="text"]:focus` sets `outline: none` and changes only the border colour. It overrides the 3px focus outline set for all elements [focus-states, focus-appearance].
- Selects are browser default, 30px tall beside 44px text inputs [touch-friendly-input].
- Date inputs are full width on some pages and 140px on others.
- Placeholders hold values ("123456789", "e.g., 00000001") that read as already filled and repeat the hint [input-labels, input-helper-text].
- Two hints are stacked under one label on the property forms.
- The declaration checkbox on Submit VAT sits on its own line above its text.
- Evidence: `hmrc/vat/submitVat.html/1280-light.png`, `hmrc/vat/vatObligations.html/1280-light.png`, `hmrc/itsa/ukPropertyPeriod.html/1280-light.png`.

### 1.9 Signed-out visitors meet full forms or a red dead end (37 pages)

- All 25 HMRC form pages and 7 Companies House pages show the whole form to a signed-out visitor, with no sign-in prompt. The self-employment period form has about 40 money fields [empty-states, progressive-disclosure].
- Where a message exists it is red error text ("Please log in to view your receipts.") with no link [error-recovery, color-not-only]. On the pass pages it is unstyled text with a close cross.
- Evidence: `hmrc/receipt/receipts.html/1280-light.png`, `practice.html/1280-light.png`, `passes/generate-digital.html/1280-light.png`, `hmrc/itsa/selfEmploymentPeriod.html/390-light.png`.

### 1.10 Validation is the browser bubble (33 form pages)

- An empty submit shows the browser's "Please fill out this field." bubble. There is no error summary and no inline message [error-summary, error-placement, aria-live-errors].
- `submit.css` has `.error-summary` and `.input--error`, and no page under `hmrc/` or `companies-house/` uses them [focus-management].
- Evidence: `hmrc/vat/submitVat.html/1280-light-empty-submit.png`, `hmrc/vat/vatLiabilities.html/1280-light-empty-submit.png`, `companies-house/fileConfirmationStatement.html/390-light-empty-submit.png`.

### 1.11 The page title sits in two places (22 pages)

- On about 22 pages the `h1` is "DIY Accounting Submit" and the page's name is in the subtitle (index, bundles, practice, receipts, usage, passes, Submit VAT, login, filing callbacks, five error pages). On the rest the `h1` is the page name [heading-hierarchy].
- Submit VAT then stacks two equal headings in the card: "VAT return submission" and "Fill from your books".
- Evidence: `hmrc/vat/submitVat.html/1280-light.png`, `hmrc/vat/viewVatReturn.html/1280-light.png`.

### 1.12 Content widths differ (about 15 pages)

- Most cards span 256 to 1024px. About, MCP, DIY Accounting Limited, PolicyBee, the video pages and the spreadsheets pages inset to 272 to 1008px. The operator dashboard spans the full 1280px [container-width].
- Prose lines on the legal pages run to about 110 characters [line-length].
- Evidence: `operator/dashboard.html/1280-light.png`, `diy-accounting-limited.html/1280-light.png`, `privacy.html/1280-light.png`.

### 1.13 Nine pages carry a purple gradient (9 pages)

- `about`, `guide`, `help` and the six `videos*` pages paint `linear-gradient(135deg, #667eea, #764ba2)` from an inline `<style>`. The ui-ux-pro-max design-system query lists "AI purple/pink gradients" as an anti-pattern for this product [consistency, style-match].
- On help, "Showing top FAQs" is grey on purple, about 1.1:1. The "Bundles" link is default blue on purple, 2.57:1 [color-contrast].
- Evidence: `help.html/1280-light.png`, `guide.html/1280-light.png`, `videos.html/1280-light.png`.

### 1.14 Media is broken or out of date (10 pages)

- Video thumbnails render as black boxes with a broken-image icon on seven pages. The CSP's `img-src` blocks `i.ytimg.com` (`consoleErrors` in `index.json`) [image-dimension].
- `about.html` shows old screens: 2017 periods, the old form, a "SANDBOX MODE" strip.
- The spreadsheets pages show Windows XP era Excel captures at low resolution.
- Evidence: `videos-hmrc-vat.html/1280-light.png`, `about.html/1280-light.png`, `spreadsheets.html/1280-light.png`.

### 1.15 Tables (6 pages seen)

- The MTD calendar puts its caption under the header row. Its quote box flattens the table into one run-on line [data-table].
- The rates tables use default-blue source links and repeat the section heading ("VAT" over "VAT").
- The operator Visitors table is cut at 390 ("Last 7 d") with no scroll cue [horizontal-scroll].
- `.results-table` uses zebra rows, hover rows and raw greys. Signed-in result tables are not in DS1 (section 6).
- Evidence: `mtd-calendar.html/1280-light.png`, `rates.html/1280-light.png`, `operator/dashboard.html/390-light.png`.

### 1.16 Glyphs stand in for icons (5 pages)

- `£ ✓ ⚙ ♿` on about, `✓` lists on PolicyBee and the spreadsheets pages, `★` on index, `⚠️` and `✅` inside about's screenshots [no-emoji-icons, icon-style-consistent].
- Evidence: `about.html/1280-light.png`, `policybee.html/1280-light.png`.

### 1.17 Narrow-width breaks (4 pages)

- `mcp.html` at 390 renders 744px wide because a code block does not wrap or scroll [horizontal-scroll, long-token-wrapping].
- The login Google button wraps with its logo mid-sentence.
- The help search placeholder is cut off.
- Evidence: `mcp.html/390-light.png`, `auth/login.html/390-light.png`, `help.html/390-light.png`.

### 1.18 Reserved space stays empty (3 pages)

- Bundles keeps about 250px of blank card above "Have a Pass?". The operator dashboard keeps about 1,300px of blank page when the snapshot fails. Index opens its card with 60px of empty padding [whitespace-balance, content-jumping].
- Evidence: `bundles.html/1280-light.png`, `operator/dashboard.html/1280-light.png`.

## 2. The direction

### 2.1 The idea

The subject is a sole trader or company director filing a statutory return from their own books. DIY Accounting's material is the spreadsheet ledger. The pages stay quiet, plain and legible. The one memorable element is the ledger: ruled lines, box numbers in a gutter, and figures right-aligned in tabular numerals, so a VAT return on screen reads like the nine boxes on paper.

- **Colour**: paper white surfaces on a cool canvas, navy ink text, the existing brand blue for links and the primary action, ruled lines at 3:1 for every field boundary.
- **Type**: one family for text, with tabular figures for money.
- **Layout**: left-aligned content in one 48rem column. The header becomes one band: brand left, account right, nav below it as plain text links with an underline for the current page.
- **Principles**: one primary action per view; status shown by colour plus a word or icon; no decoration that does not carry information.

Rejected, one line each:

- Swiss navy `#0f172a` and sky `#0369a1` (the ui-ux-pro-max design-system result): drops the brand blue the spreadsheets site shares.
- Legal-services navy and gold (`--domain color`): the gold reads as a premium sales page.
- The purple gradient: off-brand, and its text fails contrast.
- Lexend with Source Sans 3 (`--domain typography`, "Corporate Trust"): two families where one does the job.
- Arial: I, l and 1 collide in HMRC references.
- Fonts from the Google CDN: a third-party request before consent, and a CSP change.
- One radius on everything: radius here marks the kind of thing (control, card, ledger cell).
- The current blue focus ring: it disappears on brand-blue buttons.

### 2.2 The tokens

DS3 adds these to `web/public/submit.css` and replaces the existing `--color-*`, `--font-size-*`, `--spacing-*` and `--radius-*` tokens. It updates every caller, with no aliases.

```css
:root {
  /* colour, ratios on --c-paper */
  --c-canvas: #f6f7f9;
  --c-paper: #ffffff;
  --c-ink: #1b2a41;          /* 14.4:1 */
  --c-ink-muted: #4a5568;    /* 7.5:1, hints and captions */
  --c-rule: #8a94a6;         /* 3.06:1, field and table boundaries */
  --c-rule-subtle: #dfe3ea;  /* dividers that carry no meaning */
  --c-brand: #2c5aa0;        /* 6.8:1, links, primary button */
  --c-brand-strong: #1f4680; /* hover and active; white on it 9.4:1 */
  --c-brand-tint: #e8f0fa;
  --c-ok: #1e6e34;    --c-ok-tint: #e8f4ec;    /* 5.6:1 on tint */
  --c-error: #b42318; --c-error-tint: #fdecea; /* 5.8:1 on tint */
  --c-warn: #7a4a00;  --c-warn-tint: #fff4d6;  /* 6.8:1 on tint */
  --c-info: #1d4f91;  --c-info-tint: #e8f0fa;  /* 7.1:1 on tint */
  --c-focus: #ffdd00;  --c-focus-ink: #0b0c0c;

  /* type */
  --font-text: "Atkinson Hyperlegible", system-ui, sans-serif;
  --font-figures: var(--font-text);
  --step--1: 0.875rem;  /* captions only, never body */
  --step-0: 1rem;
  --step-1: 1.125rem;
  --step-2: 1.375rem;
  --step-3: 1.75rem;
  --step-4: 2.25rem;
  --leading-text: 1.5;
  --leading-head: 1.2;
  --measure: 68ch;

  /* space, 4px base */
  --space-1: 0.25rem; --space-2: 0.5rem; --space-3: 0.75rem; --space-4: 1rem;
  --space-5: 1.5rem;  --space-6: 2rem;   --space-7: 3rem;    --space-8: 4rem;

  /* shape and size */
  --radius-control: 4px;
  --radius-card: 8px;
  --radius-cell: 0;
  --control-height: 2.75rem;
  --content-max: 48rem;

  /* focus: yellow halo with an ink ring, visible on paper, canvas and brand */
  --focus-ring: 0 0 0 3px var(--c-focus), 0 0 0 5px var(--c-focus-ink);
}

@media (prefers-color-scheme: dark) {
  :root {
    --c-canvas: #10161f;
    --c-paper: #17202b;
    --c-ink: #e6ebf2;        /* 13.7:1 */
    --c-ink-muted: #a9b4c4;  /* 7.8:1 */
    --c-rule: #6b778a;       /* 3.6:1 */
    --c-rule-subtle: #263241;
    --c-brand: #8fb4ec;      /* 7.8:1; button text is --c-paper */
    --c-brand-strong: #b5cdf3;
    --c-brand-tint: #1e2c40;
    --c-ok: #6fcf8f;    --c-ok-tint: #15291d;
    --c-error: #ff8a7a; --c-error-tint: #331a17;
    --c-warn: #f2c14e;  --c-warn-tint: #2e2510;
    --c-info: #8fb4ec;  --c-info-tint: #1e2c40;
  }
}
```

The reasons, one line each:

- **Colour**: the brand blue stays for continuity; ink, muted and rule are set by contrast [color-semantic, color-accessible-pairs]. The rule colour is the lightest grey that passes 3:1.
- **Status**: each status has a text colour and a tint, and always carries a word or icon [color-not-only, contrast-feedback].
- **Type**: Atkinson Hyperlegible is the ui-ux-pro-max "Accessibility First" pairing for government and inclusive services. It is self-hosted under `web/public/fonts/` with `font-display: swap` [font-loading]. DS3 checks its tabular-figure feature. If the feature is missing, `--font-figures` points at Atkinson Hyperlegible Mono.
- **Scale**: `rem` steps of about 1.25 that do not compound; body never below 1rem [font-scale, readable-font-size].
- **Space**: a 4px base, from the ui-ux-pro-max standard density [spacing-scale].
- **Radius**: 4px on controls, 8px on cards, square ledger cells [effects-match-style].
- **Focus**: a two-tone ring passes 3:1 against white, canvas and brand blue (yellow on brand is 5.1:1) [focus-appearance].
- **Dark**: tonal, not inverted. Every pair is checked again in dark [color-dark-mode].

### 2.3 The components DS3 builds on the tokens

- **Header**: one band with the brand mark left and the account row right. The nav sits below as text links, with the current page underlined and `aria-current="page"`. At 390 the nav scrolls sideways in one row or folds into a "Menu" disclosure. Content starts within the top 200px. The perspective grid becomes a flat 2px ruled band.
- **Page title**: the `h1` is always the page name. The brand lives in the header band only.
- **Footer**: one variant for every page. Privacy, terms, accessibility, cookie choices, help and source, in that order, in sentence case. The developer links move to the about page.
- **Links**: `--c-brand`, underlined, with a distinct visited colour in content and no visited colour in navigation.
- **Buttons**: primary (brand fill), secondary (paper fill, brand rule), quiet (text). Destructive uses `--c-error`. Disabled uses 0.5 opacity with `aria-disabled`. Minimum height `--control-height`. Sentence-case labels that name the action.
- **Form controls**: every text, number, date and select control has `--control-height`, a `--c-rule` border and `--focus-ring` on `:focus-visible`. Placeholders hold no example values. Hints use `--c-ink-muted` and `--step-0`. The checkbox and its label sit on one row.
- **Money field (the ledger cell)**: the box number or `£` in a left gutter, the figure right-aligned in `--font-figures`, square corners, the rule colour for the cell edges.
- **Validation**: an error summary at the top, focused on a failed submit and linking to each field. An inline message under each field, linked with `aria-describedby`. The forms use `novalidate` so the site's messages replace the browser bubble.
- **Messages**: one `.message` component with `--ok`, `--error`, `--warn` and `--info` modifiers, an icon and a title. It replaces both `.status-*` rule sets and the duplicate spinner.
- **Signed-out panel**: one component that says what the page does, what sign-in gives, and holds a "Log in" button. It replaces the form for signed-out visitors on HMRC and Companies House pages.
- **Tables**: rule-coloured lines, no zebra, a caption above, tabular figures right-aligned, a scroll container with a visible edge shadow at narrow width.
- **Cookie banner**: a bottom sheet on `--c-paper` with one primary (Accept) and one secondary (Decline). `scroll-padding-bottom` keeps the focused control clear of it.
- **Icons**: one inline SVG set (24px, 2px stroke) for home, help, external link, status and download, with `aria-hidden` beside visible text.
- **Motion**: none beyond the 150ms colour change on hover and focus, and none under `prefers-reduced-motion`.

## 3. Per-page findings

Root pages:

- `index.html`: seven locked activities repeat "Login and add bundle to access" under each; one line above the list says it once; card opens with 60px blank. `index.html/1280-light.png`
- `about.html`: purple gradient; old screenshots; glyph icons; three CTAs, two grey. `about.html/1280-light.png`
- `accessibility.html`: inline `<style>`; long lines; h3 runs into the next list with no space. `accessibility.html/1280-light.png`
- `bundles.html`: 250px blank gap; live subscribe buttons grey; teal description colour off-palette; "Have a Pass?" Title Case. `bundles.html/1280-light.png`
- `diy-accounting-limited.html`: inset width; WordArt logo image beside a modern logo; contact block outside the card. `diy-accounting-limited.html/1280-light.png`
- `diy-accounting-spreadsheets.html`: low-resolution XP-era captures dominate the page. `diy-accounting-spreadsheets.html/1280-light.png`
- `guide.html`: purple intro card; "coming soon - sandbox example" tags in grey on every Income Tax row. `guide.html/1280-light.png`
- `help.html`: purple panel; 1.1:1 "Showing top FAQs"; placeholder cut at 390; category chips in two styles. `help.html/390-light.png`
- `images/favicon/IMPLEMENTATION.html`: renders as a blank white page; a developer note published at a public URL. `images/favicon/IMPLEMENTATION.html/1280-light.png`
- `mcp.html`: 744px wide at 390; code blocks need wrap or scroll. `mcp.html/390-light.png`
- `mtd-calendar.html`: caption under header row; run-on quote of the table; default-blue source links. `mtd-calendar.html/1280-light.png`
- `policybee.html`: 4-link static nav; partner logo link shows a stray underline; glyph ticks. `policybee.html/1280-light.png`
- `practice.html`: signed-out note in error red; ARN placeholder holds an example. `practice.html/1280-light.png`
- `privacy.html`: 15,779px tall at 390 with no contents list. `privacy.html/390-light.png`
- `rates.html`: duplicate section and table headings; default-blue source links; tabular figures needed. `rates.html/1280-light.png`
- `simulator.html`: broken video thumbnails; 8 console errors. `simulator.html/1280-light.png`
- `spreadsheets.html`: as the DIY spreadsheets page; product names as Title Case headings. `spreadsheets.html/1280-light.png`
- `terms.html`: long lines; numbered h2 with no contents list. `terms.html/1280-light.png`
- `usage.html`: Title Case headings; "Refresh" as the primary action on an empty signed-out page. `usage.html/1280-light.png`
- `videos.html`: purple gradient; contents list repeated after each video; broken thumbnails. `videos.html/1280-light.png`
- `videos-account.html`: broken thumbnails, 22 console errors. `videos-account.html/1280-light.png`
- `videos-accounting.html`: broken thumbnails. `videos-accounting.html/1280-light.png`
- `videos-ch.html`: broken thumbnails; full site contents list on a Companies House page. `videos-ch.html/1280-light.png`
- `videos-hmrc-itsa.html`: broken thumbnails; "(coming soon - sandbox example)" in every title. `videos-hmrc-itsa.html/1280-light.png`
- `videos-hmrc-vat.html`: broken thumbnails. `videos-hmrc-vat.html/1280-light.png`

Account, error and support pages:

- `auth/login.html`: "Login" as a verb; Google logo mid-sentence; header shows "Home" in the login box. `auth/login.html/390-light.png`
- `auth/loginWithCognitoCallback.html`: `h1` "Login with Google via Cognito callback"; "Welcome / Return home." `auth/loginWithCognitoCallback.html/1280-light.png`
- `auth/loginWithMockCallback.html`: `h1` "Login with mock callback". `auth/loginWithMockCallback.html/1280-light.png`
- `auth/signed-out.html`: no stylesheet chrome, no header or footer, default-blue link. `auth/signed-out.html/1280-light.png`
- `errors/403.html`: cause and next step missing; "Requested URL" shows the raw URL. `errors/403.html/1280-light.png`
- `errors/404.html`: as 403; footer in its own case. `errors/404.html/390-light.png`
- `errors/404-error-distribution.html`: `h1` "(Distribution)"; empty card above the button. `errors/404-error-distribution.html/1280-light.png`
- `errors/404-error-origin.html`: `h1` "(Origin)"; empty card. `errors/404-error-origin.html/1280-light.png`
- `errors/500.html`, `502.html`, `503.html`, `504.html`: status codes and HTTP terms as the message; no retry action [error-recovery, timeout-feedback]. `errors/504.html/1280-light.png`
- `passes/generate-digital.html`: signed-out note unstyled; live button grey. `passes/generate-digital.html/1280-light.png`
- `passes/generate-physical.html`: radios centred under a left label; grey button. `passes/generate-physical.html/1280-light.png`
- `activities/submitVatCallback.html`: no nav; "authorization" here and "authorisation" on the Companies House callback. `activities/submitVatCallback.html/1280-light.png`
- `operator/dashboard.html`: full-width layout; 1,300px blank on failure; plain failure text; table cut at 390. `operator/dashboard.html/1280-light.png`

HMRC pages (`web/public/hmrc/`):

- `vat/submitVat.html`: two stacked headings; placeholder `123456789`; detached declaration checkbox; browser bubble on empty submit. `hmrc/vat/submitVat.html/1280-light-empty-submit.png`
- `vat/viewVatReturn.html`: narrow date inputs; placeholder value. `hmrc/vat/viewVatReturn.html/1280-light.png`
- `vat/vatObligations.html`: full-width dates; 30px select. `hmrc/vat/vatObligations.html/1280-light.png`
- `vat/vatLiabilities.html`: browser bubble. `hmrc/vat/vatLiabilities.html/1280-light-empty-submit.png`
- `vat/vatPayments.html`: as liabilities. `hmrc/vat/vatPayments.html/1280-light.png`
- `vat/vatPenalties.html`: intro line jammed against the label. `hmrc/vat/vatPenalties.html/1280-light.png`
- `receipt/receipts.html`: red signed-out dead end. `hmrc/receipt/receipts.html/1280-light.png`
- `itsa/dashboard.html`: twelve equal primary buttons; mixed button case; numbered steps fit (a real sequence). `hmrc/itsa/dashboard.html/1280-light.png`
- `itsa/businessDetails.html`: form for a signed-out visitor. `hmrc/itsa/businessDetails.html/1280-light.png`
- `itsa/obligations.html`: `h1` "ITSA obligations" uses the acronym. `hmrc/itsa/obligations.html/1280-light.png`
- `itsa/selfEmploymentPeriod.html`: about 40 money fields in one column; "Disallowable expenses" heading in a different style; needs grouped, collapsible sections. `hmrc/itsa/selfEmploymentPeriod.html/390-light.png`
- `itsa/selfEmploymentPeriodAmend.html`: "Period ID" typed by hand [redundant-entry]. `hmrc/itsa/selfEmploymentPeriodAmend.html/1280-light.png`
- `itsa/selfEmploymentPeriodView.html`: "Period ID" here, "Submission ID" on property. `hmrc/itsa/selfEmploymentPeriodView.html/1280-light.png`
- `itsa/selfEmploymentPeriods.html`: NINO hint shorter than on other pages. `hmrc/itsa/selfEmploymentPeriods.html/1280-light.png`
- `itsa/annualSubmission.html`: Business ID typed by hand; 30px select. `hmrc/itsa/annualSubmission.html/390-light.png`
- `itsa/adjustments.html`: "Trigger" in heading and button. `hmrc/itsa/adjustments.html/1280-light.png`
- `itsa/lossesAndClaims.html`: two native selects of different widths. `hmrc/itsa/lossesAndClaims.html/1280-light.png`
- `itsa/taxLiabilityAdjustments.html`: intro line jammed against the label. `hmrc/itsa/taxLiabilityAdjustments.html/1280-light.png`
- `itsa/taxCalculation.html`: banner covers the button at 390. `hmrc/itsa/taxCalculation.html/390-light.png`
- `itsa/finalDeclaration.html`: Calculation ID typed by hand. `hmrc/itsa/finalDeclaration.html/1280-light.png`
- `itsa/ukPropertyPeriod.html`: two stacked hints; zeros prefilled. `hmrc/itsa/ukPropertyPeriod.html/1280-light.png`
- `itsa/ukPropertyPeriodAmend.html`: "Submission ID" typed by hand. `hmrc/itsa/ukPropertyPeriodAmend.html/1280-light.png`
- `itsa/ukPropertyPeriodView.html`: as amend. `hmrc/itsa/ukPropertyPeriodView.html/1280-light.png`
- `itsa/ukPropertyPeriods.html`: as self-employment periods. `hmrc/itsa/ukPropertyPeriods.html/1280-light.png`
- `itsa/ukPropertyAdjustments.html`: as adjustments. `hmrc/itsa/ukPropertyAdjustments.html/1280-light.png`
- `itsa/ukPropertyAnnualSubmission.html`: as annual submission. `hmrc/itsa/ukPropertyAnnualSubmission.html/1280-light.png`

Companies House pages (`web/public/companies-house/`):

- `companySearch.html`: one field and a full-width button; results not in DS1. `companies-house/companySearch.html/1280-light.png`
- `changeRegisteredOffice.html`: no placeholder here, "e.g., 00000001" on three sibling pages. `companies-house/changeRegisteredOffice.html/1280-light.png`
- `changeRegisteredEmail.html`: browser bubble covers the button label. `companies-house/changeRegisteredEmail.html/1280-light-empty-submit.png`
- `fileConfirmationStatement.html`: browser bubble at 390. `companies-house/fileConfirmationStatement.html/390-light-empty-submit.png`
- `fileMicroEntityAccounts.html`: placeholder repeats the hint. `companies-house/fileMicroEntityAccounts.html/390-light.png`
- `fileSmallCompanyAccounts.html`: as micro-entity. `companies-house/fileSmallCompanyAccounts.html/1280-light.png`
- `fileCompanyTaxReturn.html`: `h1` in Title Case; CT5 owns the flow. `companies-house/fileCompanyTaxReturn.html/390-light.png`
- `filingCallback.html`: no nav; footer shows "privacy" only. `companies-house/filingCallback.html/1280-light.png`

## 4. The rows

### DS3: the shared layer

- **Files**: `web/public/submit.css`, `web/public/widgets/page-chrome.js`, `web/public/widgets/status-messages.js`, `web/public/widgets/loading-spinner.js`, the cookie banner in `web/public/submit.js`, new `web/public/fonts/` and an SVG icon sprite.
- **Work**: section 2.2 tokens with light and dark; every 2.3 component; findings 1.1 to 1.8, 1.10, 1.11 and 1.15 to 1.18 where the fix is shared. The `novalidate` switch and the error summary wiring go in a shared form helper the page rows call.
- **Pages to check**: all 75, through a DS1 re-run against the stored set.

#### DS3 result: before and after

Before is DS1's stored set (`target/site-screenshots/`, 432 PNGs). After is `node scripts/site-screenshots.mjs --out target/ds3-after` on the DS3 branch (436 PNGs, 76 pages).

| Check | Before | After |
|---|---|---|
| Dark PNG differs from light | 0 pairs | 154 of 218 pairs; the 64 equal pairs are the light-pinned pages below and `images/favicon/IMPLEMENTATION.html` |
| 390 PNG wider than 390 px | 2 | 0 |
| Content starts at 390 px (index, Submit VAT, ITSA obligations) | 410 px (index) | 230 px, of which the title and a two-line subtitle take 130 px |
| Footer variants | 4, right of centre | 1, left-aligned |
| Pages with console errors | 9 | 9, the same messages |

- **Light pin**: no page carries `<html data-theme="light">`; every page paints its colours from the tokens, so dark mode reaches all of them.
- **For the page rows**: the error summary and inline errors use `web/public/lib/form-errors.js`; a page adds `novalidate` to its form and calls it. The signed-out panel is `.signed-out-panel` (an `h2`, a paragraph and a `.btn` Log in link). Each page row moves its `h1` to the page name (1.11); the header band already shows the brand.
- **Contrast** (WCAG relative luminance): light ink 14.4, muted 7.5, rule 3.06, brand 6.8, white on brand 6.8, ok 5.6, error 5.8, warn 6.8, info 7.1 on their tints; dark ink 13.7, muted 7.8, rule 3.6, brand 7.8, ink on brand 8.6, ok 8.1, error 7.1, warn 9.0, info 6.7.

### DS4: the HMRC pages

- **Pages**: the 26 under `web/public/hmrc/`: 6 under `vat/`, `receipt/receipts.html` and 19 under `itsa/`. Section 3, HMRC list.
- **Work**: the signed-out panel; the error summary and inline errors; drop example placeholders; ledger cells for money fields; group the self-employment period form; pick-from-list for Business ID, Period ID, Submission ID and Calculation ID where an earlier step returned them; one name for "Period ID" and "Submission ID"; the `h1` rule; the inline `<style>` blocks on `itsa/dashboard`, `itsa/taxCalculation`, `itsa/finalDeclaration`, `vat/viewVatReturn` and `receipt/receipts` onto tokens.

#### DS4 result

Stage 1: the six VAT pages and `receipt/receipts`.

- **Shared**: `requireVatNumberAnd` in `lib/form-errors.js` (blank, then 9 numbers, plus other required ids); `.period-date-inputs`, `.next-steps`, `.box-definitions`, `.table-scroll`, `.receipt-panel` and the HMRC feedback block in `submit.css`, all on tokens.
- `submitVat`: `h1` "Submit VAT return", duplicate `h2` dropped, signed-out panel, `novalidate` with one summary for the VAT number, period dates, the boxes and the declaration, nine boxes in one ledger (hint in the row header), no placeholders, `.choice` for the declaration and developer options, receipt styles moved off inline.
- `viewVatReturn`: signed-out panel, summary errors, no placeholder, inline `<style>` moved to `submit.css`, period dates fill their halves.
- `vatObligations`, `vatLiabilities`, `vatPayments`, `vatPenalties`: signed-out panel, `novalidate` with the summary, `.choice` for the fraud-header option, sentence-case toggle labels.
- `receipts`: `h1` "Your receipts", signed-out panel in place of the red line, inline `<style>` and `data-theme="light"` dropped, `Submission ID` named beside `Period ID`.

Stage 2: the 19 `itsa/` pages.

- **Shared**: `.dashboard-steps`, `.field-group` (a folded section) and `.next-steps[hidden]` in `submit.css`; `.field-key` in `submission-record.css`; `carried-identifiers.js` carries `periodId`, `submissionId` and `calculationId`; `hmrc-field-table.js` result tables take an `action` column; `form-errors.js` opens a folded section that holds an error. One National Insurance number hint on every page.
- Every page: signed-out panel in place of the form, `.choice` for the options, no inline style apart from script-toggled `display`, user words ("Request" for the year-end summary and the calculation).
- `dashboard`: inline `<style>` and `data-theme="light"` dropped; twelve step links are secondary buttons in sentence case; the picked business sets the business ID for every later page.
- `businessDetails`: signed-out panel. `obligations`: `h1` "Income Tax obligations".
- `selfEmploymentPeriod`: 30 expense fields in two folded ledger sections (itemised open, disallowable shut, one hint each); period dates share a row; amount boxes 16rem wide.
- `selfEmploymentPeriods`, `ukPropertyPeriods`: each row has "Use this period", which carries the ID to the view and amend pages and shows links to them.
- `selfEmploymentPeriodView`, `selfEmploymentPeriodAmend`, `ukPropertyPeriodView`, `ukPropertyPeriodAmend`: the period or submission ID fills from the chosen period; the business ID hint says where it comes from.
- `taxCalculation` carries an intent-to-finalise calculation ID to `finalDeclaration`.
- `ukPropertyPeriod`: empty money fields, one hint each, dates share a row.
- `adjustments`, `ukPropertyAdjustments`, `finalDeclaration`: "Trigger" becomes "Request". `annualSubmission`, `ukPropertyAnnualSubmission`, `lossesAndClaims`, `taxLiabilityAdjustments`: `.choice` options, signed-out panel, amount boxes narrowed.
- **Remaining**: `Period ID` (self-employment) and `Submission ID` (property) stay two names, as `receipts` maps them; `annualSubmission` and `ukPropertyAnnualSubmission` read the business ID from the dashboard pick only.

### DS5: root, account and error pages

- **Pages**: the 25 root pages (including `images/favicon/IMPLEMENTATION.html`), `auth/` (4), `errors/` (8), `passes/` (2), `activities/` (1), `operator/` (1). Section 3, root and account lists.
- **Work**: move the inline `<style>` blocks on these pages onto tokens and drop the gradient; fix the video thumbnails (self-hosted posters or a CSP change); replace the old screenshots on about and the spreadsheets pages; error pages with cause, next step and retry; the signed-out page in the site chrome; user words in the callback and error titles; the MCP code blocks; the operator layout.

#### DS5 result (root pages)

- **Shared**: tokens only in the page rules (about, guide, help, videos, legal, MCP, harness, PolicyBee, practice, home, bundles, usage, company and spreadsheets blocks moved into `submit.css`); one lightbox rule on the scrim tokens; disabled controls take a grey fill with dark text; `.table-scroll`, `.btn-danger`, `.check-list`, `.status-message` reused; the local server's `img-src` allows `https://i.ytimg.com`, as the deployed policy does.
- `about`: gradient, hero, glyph icons and the four old screenshots (with the lightbox) removed; `h1` "About"; features, benefits (a definition list) and one start block.
- `accessibility`, `privacy`, `terms`: inline `<style>` dropped; `h1` in sentence case; `.legal` measure of 68ch; privacy and terms carry a contents list over their sections; tables use `.data-table`.
- `bundles`: `h1` "Bundles"; every `style` attribute and script-set colour on classes (`bundle-note`, `bundle-row`, `pass-status`); "Subscribe" and "Request" buttons keep the brand fill, disabled ones grey; "Have a pass?" in sentence case; list reserve `min(40vh, 22rem)`; pass-list buttons on the shared small secondary style.
- `diy-accounting-limited`: WordArt logo removed; contact block in the same card as the sections; inline `<style>` onto the tokens.
- `diy-accounting-spreadsheets`, `spreadsheets`: old Excel captures, the lightbox and the page scripts removed; product cards, reviews and download on tokens; ticks drawn in CSS.
- `guide`: gradient intro replaced by a plain panel; journeys and steps on tokens; `h1` "User guide".
- `help`: gradient and inline `<style>` dropped; search placeholder "Search the questions".
- `index`: `h1` "Activities"; the login note appears once above the list; feedback banner and the two proof notes on classes; `hidden` replaces inline `display`.
- `mcp`: code blocks wrap inside the card at 390 px; `h1` "MCP server"; links on `.btn`.
- `mcp-harness`: inline `<style>` onto the tokens, frame on `--c-paper`.
- `mtd-calendar`, `rates`: generators no longer emit a `<style>`; rules in `submit.css`; captions sit above the table; `h1` "MTD calendar" and "Tax rates"; the VAT table caption no longer repeats its heading.
- `policybee`: standard header, nav and footer from `page-chrome.js`; ticks in CSS; logo and call to action on classes.
- `practice`: signed-out panel replaces the red line; `hidden` and classes replace the inline styles in the page and `practice.js`; ARN placeholder dropped; `h1` "Practice clients".
- `usage`: `.data-table` tables, `h1` "Token usage"; Refresh is secondary; Manage subscription is secondary.
- `videos`, `videos-*`: gradient and inline `<style>` dropped, section and contents rules in `submit.css`; the repeated per-video contents list is gone from the index.
- `images/favicon/IMPLEMENTATION`: a visible page in the site chrome that lists the icon files and link tags.
- `simulator`: unchanged, a redirect to `videos.html`.

#### DS5 result (account and error pages)

- **Shared**: `.auth-panel`, `.error-panel` and `.error-actions` on the shared card; `.pass-*` rules for the pass pages; the dashboard rules moved into `submit.css` on tokens; `--c-print` is the white that QR codes and merchandise designs print on.
- `auth/login`: `h1` "Sign in"; one "Sign in with your Google account" button with the logo first; the header link is hidden on this page.
- `auth/loginWithCognitoCallback`, `loginWithMockCallback`: `h1` "Signing you in"; one line and a home button; `hidden` replaces the inline spinner style.
- `auth/signed-out`: site header, nav and footer from `page-chrome.js`; "Sign in" and "Go to the home page" on `.btn`.
- `errors/403`, `404`, `404-error-distribution`, `404-error-origin`: `h1` in user words, one cause line, one next step, a home button; the raw requested URL is gone; header and footer from `page-chrome.js`, so the footer matches every other page.
- `errors/500`, `502`, `503`, `504`: cause and next step in user words, "Try again" (reloads the page) beside "Go to the home page"; `504` tells the reader to check receipts before sending a return again.
- `passes/generate-digital`, `generate-physical`: `h1` is the page name; inline styles and `data-theme="light"` dropped; radios left-aligned under their legend; the live button takes the brand fill; `Copy link`, `Copy code` and the download buttons take `.btn-small .btn-secondary`; notes on the warning and info tints.
- `activities/submitVatCallback`: `h1` "Connecting to HMRC"; "authorisation" in the page and its messages; one line and a home button.
- `operator/dashboard`: `data-theme="light"` and the inline `<style>` dropped; tables are `.data-table`; width bounded at 90rem; a failed load shows a `.status-error` message, releases the 2,900 to 4,600 px reservation and hides the visitors panel; the experiments panel hides when its file does not load; reservations re-measured with the stylesheet loaded (the browser test now serves `submit.css`).

### DS6: the Companies House pages

- **Pages**: the 8 under `web/public/companies-house/`, after CT5.
- **Work**: one company-number field pattern on all lookup pages; the error summary; the signed-out panel; the callback page in full chrome; the inline `<style>` blocks on `fileMicroEntityAccounts` and `changeRegisteredEmail` onto tokens; check CT5's result against the tokens.

#### DS6 result

- **Shared**: `.input--code` (company number and authentication code fields), `widgets/signed-out-panel.js` (an element marked `data-requires-sign-in` is replaced by the panel when `cognitoIdToken` is absent), `requireFormFields` and `requireChecked` in `lib/form-errors.js`, errors for a ledger cell placed in its row header, the main nav fits at 390 px (14 px links, 12 px gap) and scrolls below that.
- `companySearch`: signed-out panel, `novalidate` with the error summary, hint without example name.
- `changeRegisteredEmail`: company-number pattern, signed-out panel, summary and inline errors for the address and the statement, `.choice` checkbox, outcome panel on the result, inline `<style>` dropped.
- `changeRegisteredOffice`: as the email page, with required-field errors on the address form.
- `fileConfirmationStatement`: company-number pattern, signed-out panel, `form-section` blocks, `.choice` checkboxes, errors on the authentication code and the review form, outcome panel.
- `fileMicroEntityAccounts`: one balance-sheet ledger with this-year and prior-year columns (28 boxes in one table), sections, `.choice` checkboxes, a "Send to Companies House" step, summary errors, outcome panel, inline `<style>` and `data-theme="light"` dropped.
- `fileSmallCompanyAccounts`: nine single-column ledgers in place of 60 stacked fields, sections, `.choice` radios and checkboxes, send step, summary errors, outcome panel.
- `filingCallback`: header and footer from `page-chrome.js`, `h1` "Connecting to Companies House".
- `filings`: signed-out panel in place of the red line, `h1` "Your copy of a filing", inline `<style>` moved to `submit.css`.
- `mcpCodes`: `h1` "Companies House codes", code field on `.input--code`.
- **DS7**: `fileCompanyTaxReturn` takes the company-number pattern (`.input--code`, no placeholder, one hint, summary error on an empty submit through `requireFields`) and the signed-out panel. `filings` drops `data-theme="light"`: the customer copy's frame already reads the tokens, and the filed documents stay black on white paper, in dark mode too.
- **Remaining**: `mcpCodes` has no page chrome, because its link carries a sealed entry and no login.

### GJ2: the three new walkthroughs, reviewed

37 frames judged against the `visual-review` criteria: 6 pass, 31 fail, 0 fixed, 31 tabled. Frames are under `web/public/videos/<id>/`. The recordings are not in `target/videos/`, so no frame could be re-cut. Every fail needs a re-recording or a page fix.

Codes: **O** overlay hides page text (criterion 7). **C** crop cuts text or a control (3). **D** placeholder data (1). **E** most of the frame is empty (4). **A** caption does not match the frame, so the alt text is wrong (9). **B** bug (2).

| Frame | Verdict | Codes |
|---|---|---|
| file-small-company-accounts/company-lookup-0 | fail | O, E |
| file-small-company-accounts/company-lookup-2 | fail | O, E |
| file-small-company-accounts/company-lookup-3 | fail | O |
| file-small-company-accounts/company-lookup-5 | fail | O |
| file-small-company-accounts/accounts-form-0 | pass | |
| file-small-company-accounts/accounts-form-2 | fail | C, O |
| file-small-company-accounts/accounts-form-7 | fail | C, O |
| file-small-company-accounts/accounts-form-8 | fail | C, O |
| file-small-company-accounts/accounts-form-18 | fail | C, O |
| file-small-company-accounts/accounts-form-19 | fail | C, O |
| file-small-company-accounts/accounts-form-35 | fail | C, O |
| file-small-company-accounts/accounts-form-38 | fail | C, D, O |
| file-small-company-accounts/accounts-form-39 | fail | D, O |
| file-small-company-accounts/accounts-form-41 | fail | D |
| file-small-company-accounts/preview | fail | C, D |
| file-small-company-accounts/submit | fail | A, E |
| file-small-company-accounts/result-0 | fail | E, O |
| file-small-company-accounts/result-1 | fail | E, O |
| file-small-company-accounts/result-3 | fail | O |
| file-small-company-accounts/result-6 | fail | O |
| file-small-company-accounts/result-9 | fail | A, O |
| file-psc-verification-statement/company-lookup | pass | |
| file-psc-verification-statement/auth | pass | |
| file-psc-verification-statement/review | fail | A |
| file-psc-verification-statement/pay | fail | A |
| file-psc-verification-statement/submit | pass | |
| file-psc-verification-statement/psc-1 | fail | C |
| file-psc-verification-statement/psc-3 | fail | C, O |
| file-psc-verification-statement/psc-4 | fail | C |
| file-psc-verification-statement/psc-5 | fail | C |
| file-psc-verification-statement/psc-6 | fail | C, O |
| file-psc-verification-statement/psc-9 | fail | C, O |
| file-psc-verification-statement/record | fail | A, C, O |
| bundles/open | pass | |
| bundles/pass | fail | C |
| bundles/add | pass | |
| bundles/remove | fail | B, C |

By criterion: 7 (O) 21 frames, 3 (C) 17, 4 (E) 5, 1 (D) 4, 9 (A) 5, 2 (B) 1.

Tabled fails, one row each for the board:

- **GJ2-O (21 frames).** The headline card burned into the recording sits over page text: the `h1` on `company-lookup-0`, `result-0` and `result-3`; "Choose a file" on `company-lookup-3`; the "Amount (£)" header on `accounts-form-2` and `-8`; a field label on `accounts-form-18` and `-38`; "Date approved" on `accounts-form-39`; "Submission 000002 was ACCEPT" on `psc-6`; "All your receipts" on `psc-9` and `record`. Fix: place the card where it covers no page text, in `scripts/lib/video/` (the card) and `scripts/video-walkthrough.js` (the frame cut). Record the three videos again.
- **GJ2-C (17 frames).** The scroll position cuts a line or a control at the top edge: the date field on `accounts-form-2`, `-7` and `-8`; input boxes on `-18`, `-19`, `-35` and `-38`; "Filed 26 October 2026" on every `psc-*` frame and `record`; the top button on `bundles/pass`; the header on `bundles/remove`; the iframe text and the code field on `preview`. Fix: scroll each scene to a block boundary in `videos/file-small-company-accounts.json`, `videos/file-psc-verification-statement.json` and `videos/bundles.json`. Record again.
- **GJ2-D (4 frames).** The director is "Jo Director" in `accounts-form-38`, `-39`, `-41` and `preview`. Fix: use a person's name at `videos/file-small-company-accounts.json` lines 433 and 441. `videos/file-micro-entity-accounts.json` line 217 has the same name. Record again.
- **GJ2-E (5 frames).** `company-lookup-0` and `-2` show a form strip with the lower half empty. `submit`, `result-0` and `result-1` show one short card above an empty band. Fix: crop to the content in `scripts/video-walkthrough.js`.
- **GJ2-A (5 frames).** The alt text is `headline: caption` (`web/public/guide.page.js` line 130), so a caption that names a step the frame does not show gives a wrong alt text. `file-small-company-accounts/submit` shows the result, not the code field. `result-9` shows the copy, not the receipts list. `file-psc-verification-statement/review` shows no personal codes. `pay` shows the preview, not checkout. `record` shows the PSC form, not the copy. Fix: cut each frame from the moment its caption names, or change the caption in the scene script.
- **GJ2-B (1 frame).** `bundles/remove` shows `Bundle "day-guest" removed successfully.`, the internal id where the card reads "Day pass". `web/public/bundles.page.js` line 737 writes `bundleId`; write the bundle's display name. Record `bundles` again.

Systemic, on every frame with the page header, not counted above:

- **GJ2-S1.** The header reads "DIY Accounting ..." and the "Logged in as" line with the user's address cut short at the 1000px frame width. Page: `web/public/widgets/page-chrome.js`.
- **GJ2-S2.** Submission numbers read `000001`, `000002` and `000003` on every result and record frame. The sandbox issues them.

UX pass (`ui-ux-pro-max`: accessibility, forms and feedback, layout), over the guide that `web/public/guide.page.js` builds from the three walkthroughs:

- The steps run in journey order in all three, and each has a headline and a one-sentence caption.
- The PSC guide shows the filing fee (£61.35) at `review` only. The `pay` step has no frame of the checkout, so a reader without the video does not see the payment step. GJ2-A covers it.
- Each thumbnail has `aria-label` "View full size: <headline>" and the lightbox has a close label. The thumbnail alt text is the caption, which GJ2-A corrects for five frames.
- The frames are WebP at one size (1000 by 1080), so the guide reserves their space.

## 5. Done when

The repository's definition of done for anything a person sees (`CLAUDE.md`) applies to each row:

1. The tests pass, including a check of what the reader sees, not only what the DOM holds.
2. After the change (each DS row is a major visual change), the `visual-review` skill judges the passing run's screenshots as an LLM reviewer.
3. The guide screenshots (`npm run video:walkthrough`) and the site screenshots (DS1) are taken again. The videos that show a changed page are recorded again.
4. The `visual-review` skill judges the new screenshots, and the `ui-ux-pro-max` skill reviews the guide's screenshots for the journeys the change reaches.
5. Every fail is fixed in the change, or is a `NEXT.md` row with its screenshots.

On top of that, for this pass:

- Every pair in section 2.2 measures at the stated ratio in light and dark.
- No 390 screenshot is wider than 390px.
- The dark PNGs differ from the light PNGs.

## 6. Not in the DS1 screenshots

DS1 took every page signed out, so these states need a signed-in DS1 run before DS4 and DS6 judge them:

- result tables (obligations, liabilities, payments, penalties, period lists, tax calculation);
- the receipts list and a receipt;
- success and HMRC error messages after a submit;
- the token balance and entitlement text in the header;
- hover, pressed and keyboard focus states, which a still image does not show.

### SQ1: every walkthrough frame, judged

536 frames in 44 videos. 511 pass, 25 fail. Judged by script on criteria 3 (top edge), 4 (empty frame), 7 (headline card in the frame) and 10 (width: every site frame is 1000 wide, every localApp frame 1600); by eye on criteria 1, 2, 5, 6, 8 and 9 from a contact sheet of each video's thumbnails and full-size reads of three frames. The table has one row per video; a frame that passes is counted, a frame that fails is named with its criteria (O = card in the frame, C = line cut at the top edge, E = most of the frame empty, 1 = placeholder data).

Fails by cause: O 4 (`change-registered-office`), E 20 (the 18 listed below, and the "Adjustment submitted" frame of `itsa-uk-property-year` and `itsa-year-part`), 1 one (`itsa-in-year-estimate` in-year-estimate-3: the simulator's grant page).

Not re-cut, frames unchanged: `change-registered-email` (passes), `change-registered-office` (no recording on this machine).

| Video | Frames | Pass | Fails (frame, criteria) |
|---|---|---|---|
| accounting-diya-gl-profit | 24 | 24 | none |
| accounting-spreadsheet-profit | 13 | 2 | april-0 E; april-15 E; april-17 E; april-2 E; april-23 E; april-25 E; april-3 E; april-5 E; april-7 E; april-8 E; may E |
| bundles | 4 | 4 | none |
| change-registered-email (not re-cut) | 7 | 7 | none |
| change-registered-office (not re-cut) | 7 | 3 | company-lookup-0 O; company-lookup-2 O; company-lookup-3 O; company-lookup-5 O |
| company-lookup | 2 | 2 | none |
| file-company-tax-return-book | 18 | 18 | none |
| file-company-tax-return-typed | 19 | 19 | none |
| file-confirmation-statement | 2 | 2 | none |
| file-micro-entity-accounts | 16 | 16 | none |
| file-psc-verification-statement | 12 | 12 | none |
| file-small-company-accounts | 21 | 21 | none |
| generate-pass-digital | 4 | 4 | none |
| generate-pass-physical | 1 | 1 | none |
| hmrc-authorise | 2 | 0 | authorise E; results E |
| itsa-annual-from-book | 9 | 9 | none |
| itsa-business-details | 7 | 6 | results E |
| itsa-carry-back-adjustments | 9 | 9 | none |
| itsa-foreign-property-losses | 12 | 12 | none |
| itsa-in-year-estimate | 10 | 9 | in-year-estimate-3 1 |
| itsa-loss-claims | 12 | 12 | none |
| itsa-quarterly-from-books | 18 | 18 | none |
| itsa-quarterly-update | 26 | 26 | none |
| itsa-self-employment-amend | 17 | 17 | none |
| itsa-uk-property-year | 26 | 25 | adjustments-14 E |
| itsa-year | 54 | 54 | none |
| itsa-year-part | 39 | 38 | adjustments-15 E |
| mcp-cli | 8 | 8 | none |
| mcp-diya-gl | 7 | 7 | none |
| mcp-docker | 8 | 8 | none |
| mcp-hosted | 7 | 4 | connect-0 E; connect-1 E; connect-2 E |
| my-receipts | 4 | 4 | none |
| sign-in | 4 | 4 | none |
| submit-return | 20 | 20 | none |
| subscription-management | 3 | 3 | none |
| tokens | 5 | 5 | none |
| tour | 6 | 6 | none |
| vat-from-books | 16 | 16 | none |
| vat-hmrc-assist | 16 | 16 | none |
| view-liabilities | 7 | 7 | none |
| view-obligations | 7 | 6 | results E |
| view-payments | 7 | 7 | none |
| view-penalties | 6 | 6 | none |
| view-return | 14 | 14 | none |

Remaining fails, by fix:

| Fail | Frames | What a reader sees | Fix |
|---|---|---|---|
| O | `change-registered-office` company-lookup frames | As before the cutter change | Re-record, then `node scripts/video-walkthrough.js --id <id>` |
| C (not detected) | `file-psc-verification-statement` psc-1, psc-3 to psc-9 | The word "statement." from the receipt above the PSC section at the top edge | The PSC section sits at the foot of the page, so the page cannot scroll its top to the viewport top; needs the receipt collapsed or the section moved above it |
| 1 | `itsa-in-year-estimate` in-year-estimate-3 | The simulator's "Grant Authority" page for the click that goes to HMRC | Cut the frame from the page before the redirect, or record the authorise step off camera |
| E | 11 frames of `accounting-spreadsheet-profit`, `mcp-hosted/connect-0..2`, `hmrc-authorise/authorise,results`, `itsa-business-details/results`, `view-obligations/results`; `itsa-uk-property-year/adjustments-14` and `itsa-year-part/adjustments-15` ("Adjustment submitted" panel, lower 55% blank) | 70 to 80 percent blank rows: a spreadsheet grid with two rows filled, or a short form | localApp frames: crop to the filled area in the scene script's viewport; site frames: a result page shorter than the cut |
| 2 | `itsa-year`, `itsa-loss-claims` and other ITSA frames of a form load | "Loading ..." spinner and the "Synthetic mode - calls go to HMRC's sandbox API" banner in the frame | Step waits for the loaded state before the caption; banner is the synthetic account's, hide it with the script's `suppress` list |
| 5 | `accounting-diya-gl-profit`, `accounting-spreadsheet-profit` | Spreadsheet text under 8 px at the thumbnail size | Record the localApp scenes at a smaller viewport |
| 9 | `file-psc-verification-statement/record` | The caption names steps the frame does not show | Split the scene so one caption matches the frame |
| 4 | `file-psc-verification-statement` psc-3 to psc-6 | Four frames that look the same | One frame per distinct state |

#### ui-ux-pro-max over `guide.html` and `guide.page.js`

| # | Finding | Fix |
|---|---|---|
| 1 | The guide lists 44 collapsed journeys with no index, search or filter at the top; a reader must open each | A jump list of journey titles at the top of each group |
| 2 | Thumbnails carry no width and height, so the page shifts when each loads (the reserved ratio 480:518 differs from the new trimmed frame heights) | Write the image's pixel size into each `walkthrough` entry and set `width` and `height` on the `img` |
| 3 | A thumbnail is 480 px wide for a 1000 px frame: the page text is 7 px, unreadable without opening the lightbox | Crop the thumbnail to the area the step points at, or show the frame at 720 px |
| 4 | The alt text equals the visible caption under it, so a screen reader says each sentence twice | Alt text names what the frame shows in one short phrase; the caption stays visible |
| 5 | The lightbox close control is a `span` with a role; Tab is held on it, so a keyboard user cannot read the image's alt or move on except by closing | Use a `button` element and keep focus inside the dialog with a real trap |
| 6 | The lightbox has no previous and next control, so a reader opens, closes and opens for each step | Arrow keys and two buttons through the journey's frames |
| 7 | A step has no link of its own; only a journey has a hash | An id on each step and a copy-link control |
