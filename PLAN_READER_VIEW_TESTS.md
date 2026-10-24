<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: behaviour tests see what the reader sees

## The ask

Behaviour tests see what the reader sees: a behaviour test asserts content, text in the DOM, a status, a stored record, and never what a person sees on the screen. Build one shared check that fails a step when the visible page shows markup as text, undefined/null/NaN, a developer field with developer mode off, horizontal overflow, or an unstyled control; prove it on the CT600 page.

## The blind spot

A step asserts that text is in the DOM (`textContent` of `#previewIxbrl`), that a status shows, or that a record is stored. A page can pass all of that and still print source code, a run of digits or a broken layout to the person.

## The check

`assertReaderView(page, options)` in `behaviour-tests/helpers/behaviour-helpers.js`. `takeScreenshot(page, { path, readerView: true })` runs it before the capture; `readerView: { ignoreSelectors: [...] }` skips subtrees. `findReaderViewDefects` returns the list without throwing. Each step opts in; no suite runs it by default.

| Rule | Fails when the visible page shows |
|------|-----------------------------------|
| markup-as-text | `<?xml`, `xmlns`, `ix:`, `<html` or a tag as text |
| json-as-text | a JSON object as text |
| stack-trace-as-text | a line starting `    at fn (` |
| placeholder-value-as-text | `undefined`, `null`, `NaN`, `[object Object]` |
| developer-content-visible | `.developer-only-section` or `.developer-field` while `body.developer-mode` is off |
| horizontal-overflow | `scrollWidth` above `clientWidth` on the page |
| element-wider-than-container | an element outside its non-scrolling parent's box |
| unstyled-control | a form control under half the median width of the controls in its form |

Only visible text nodes count (computed display, visibility, opacity, box size). Textarea and input values are skipped. Fixture tests: `web/browser-tests/readerView.browser.test.js`.

## Steps wired

| Suite | Step | Status |
|-------|------|--------|
| companyTaxReturn | `previewCompanyTaxReturn` screenshot | on |
| getVatLiabilities, getVatObligations, getVatPayments, getVatPenalties, getVatReturn | filled form, results, error | on |
| postVatReturn, postVatReturnFraudPreventionHeaders, submitVat, vatSchemes | filled 9-box form, error, receipt, receipts list and detail | on |
| vatValidation | the three validation shots | on |
| hmrcAssist | connected, boxes filled, assist messages | on |

Next: the accounts preview steps, then each step of each journey.

## Findings

| Test | Step | What a reader sees | Defect | Fix | Commit |
|------|------|--------------------|--------|-----|--------|
| companyTaxReturn | preview | the iXBRL source starting `<?xml` printed in `#previewIxbrl` for every user | developer-only block shown with developer mode off | CT1 | |
| Companies House accounts | preview | contexts as text at the top, figures as a run of digits at the foot (rejected by the XML team 2026-10-23) | rendered accounts not styled as a document | AX | |
| getVatLiabilities, getVatObligations, getVatPayments, getVatPenalties, getVatReturn | fill-in with developer mode on | the test-scenario select 246px wide under 704px text inputs | select unstyled in the developer section | select fills the form width on the six VAT pages | RV3 |
| getVatReturn, submitVat | fill-in | period start and end date inputs 141px wide beside full-width fields | flex children shrink to content | each date field takes `flex: 1 1 12em` | RV3 |
| postVatReturn | submission error | status line prints `Body: {"message":"An unexpected error occurred","hmrcRes…` | thrown message carried the raw response body | `hmrc-service.js` throws `Failed … (HTTP n). <message>`; the full response goes to the console | RV3 |
| submitVat | receipt detail | processing date printed as `2026-10-23T09:27:15.096Z` | stored timestamp shown as stored | receipts page formats it as a long date and time | RV3 |
| submitVat | receipt detail | the value column headed "Amount" over text values (`DD`, a name, a date) | shared field table has one fixed header | open | |
| submitVat | submission result | "Submitting…" and "Still processing…" stay above "VAT return processed" | earlier progress messages not removed on success | open | |
| submitVat | receipts page | footer text offset to the right of the page centre | open | open | |
