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
| itsaBusinessDetails, itsaObligations, itsaSelfEmploymentPeriod, itsaUkPropertyPeriod | filled form, results, error | on |
| itsaAnnualSubmission, itsaUkPropertyAnnualSubmission, itsaLossesAndClaims, itsaFinalDeclaration | filled edits, loaded, saved, calculation, declaration, filed record | on |
| companyTaxReturn | review, preview, accepted, rejected | on |
| companiesHouse | search results, company profile | on |
| changeRegisteredEmail, changeRegisteredOffice | current address, filled form, statements, eligibility accepted and rejected, filing accepted, validation error | on |
| companiesHouse/fileConfirmationStatement | company looked up, register read, review form, blocked personal codes, preview, fee paid, submitted, accepted, rejected | on |
| companiesHouse/fileMicroEntityAccounts | company looked up, filled form, preview, submitted, accepted, rejected, customer copy | on |
| auth, bundles, tokenRefresh | home, bundles page, bundle added and removed, receipts page | on |
| compliance, help | home, privacy, terms, about, accessibility, help, FAQ, user guide, contact modal | on |
| passRedemption, generatePassActivity | pass created, code entered, validation, bundle granted, reuse and invalid rejected, generated and verified passes, physical pass pages | on |
| payment, tokenEnforcement | day guest granted, tokens exhausted, activities disabled, bundles after exhaustion, resident granted, subscription management, usage pages | on |
| diyaGlSubscription | the diya-gl page after checkout | on |

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
| itsaBusinessDetails, itsaObligations, itsaSelfEmploymentPeriod, itsaUkPropertyPeriod | HMRC error | four stacked messages: "Retrieving…", "Still processing…", "Failed to retrieve business details." and "Failed to retrieve business details: HMRC request failed" | a result does not remove the progress messages; the poll error repeats the page error | `showStatus` clears progress messages on success or error and replaces an error that a fuller error repeats | RV4 |
| itsaBusinessDetails, itsaObligations | results | an empty bordered card above the results table | the form container stays after both of its buttons hide | the container hides with the controls and returns with the search form | RV4 |
| itsaSelfEmploymentPeriod, itsaUkPropertyPeriod | filed result | "Show form" and "Cancel request" above "Quarterly update filed" | form container stays after the update is filed | the form container hides when the result shows | RV4 |
| itsaAnnualSubmission, itsaUkPropertyAnnualSubmission, itsaFinalDeclaration | saved and filed record | section heading at the top of the note column, its text a screen below beside the lower part of the sheet | the sheet spans two grid rows, so the taller sheet stretches the heading row | a third `1fr` row takes the slack | RV4 |
| itsaAnnualSubmission, itsaUkPropertyAnnualSubmission, itsaLossesAndClaims, itsaFinalDeclaration | loaded, saved, calculation, filed | no screenshot at the step; the step asserts that the result container is visible | visibility asserted, the page never looked at | a `readerView` screenshot at each of the nine steps | RV4 |
| itsaBusinessDetails, itsaObligations, itsaSelfEmploymentPeriod, itsaUkPropertyPeriod | filled form, results, error scenario | form and result shots taken without the check; the error scenarios returned before any shot after the result | content asserted, layout never checked | `readerView: true` on the filled and result shots; a scenario shot added | RV4 |
| companiesHouse/fileConfirmationStatement | preview | the confirmation statement XML (`<ConfirmationAndVerificationStatement xmlns=…`) printed in `#previewXml` for every user | developer-only block shown with developer mode off, and no readable preview | summary list of company, date, statements, directors and changes; the XML is a developer-only section | RV2 |
| companiesHouse/fileConfirmationStatement | preview | the statement date as `2025-09-21` | stored date shown as stored | open | |
| companiesHouse/fileMicroEntityAccounts | filing rejected | the rejection line sits flush under the "Companies House rejected the accounts" box with no gap | no spacing between the result box and `#rejections` | open | |
| companiesHouse/fileMicroEntityAccounts | filing accepted | "See your copy of this filing" link sits tight under the result box | no spacing under the result box | open | |
| changeRegisteredEmail, changeRegisteredOffice, companiesHouse, companyTaxReturn, fileMicroEntityAccounts | result, review and error steps | nothing: the check passes on every step turned on | none | steps turned on | RV2 |
| auth, bundles, compliance, generatePassActivity, help, passRedemption, payment, practiceLicence, tokenEnforcement, tokenRefresh | home, bundles, usage, pass and legal pages | nothing: the check passes on every step turned on | none | steps turned on | RV5 |
| diyaGlStorage, mcpHosted | sign-in pages | nothing: the pages are the sign-in and home steps already on; the rest of each suite calls the API | none | the shared sign-in steps | RV5 |
