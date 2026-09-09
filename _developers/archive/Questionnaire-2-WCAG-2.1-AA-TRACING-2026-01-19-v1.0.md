<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Questionnaire 2: WCAG 2.1 AA - Evidence Tracing

**Developer**: DIY Accounting Limited
**Product Name**: DIY Accounting Submit
**Completed by**: Antony Cartwright
**Date**: 19 January 2026
**Version**: 1.0

This document traces each WCAG criterion response to its evidence source.

---

## Summary

| Metric | Value |
|--------|-------|
| Total Criteria | 49 |
| Supports | 40 |
| Partially Supports | 0 |
| Does Not Support | 0 |
| Not Applicable | 9 |

---

## Compliance Levels Key

- **Supports**: The functionality of the product has at least one method that meets the criterion without known defects
- **Partially Supports**: Some functionality of the product does not meet the criterion
- **Does Not Support**: The majority of product functionality does not meet the criterion
- **Not Applicable**: The criterion is not relevant to the product

---

## WCAG 2.1 Level A and AA Criteria

| Criterion | Compliance | Remarks | Evidence Source |
|-----------|------------|---------|-----------------|
| 1.1.1 | Supports | All images have alt text. Pa11y: 0 errors. | web/public/tests/accessibility/pa11y-report.txt |
| 1.2.1 | Not Applicable | No audio-only or video-only content in application. | Manual review |
| 1.2.2 | Not Applicable | No synchronized media content. | Manual review |
| 1.2.3 | Not Applicable | No prerecorded video content. | Manual review |
| 1.2.4 | Not Applicable | No live audio content. | Manual review |
| 1.2.5 | Not Applicable | No prerecorded video content. | Manual review |
| 1.3.1 | Supports | Semantic HTML used throughout. axe-core: 0 structure violations. | web/public/tests/accessibility/axe-results.json |
| 1.3.2 | Supports | Content follows logical reading order. | web/public/tests/accessibility/axe-results.json |
| 1.3.3 | Supports | Instructions use text, not just visual cues. | Manual review |
| 1.3.4 | Supports | Content works in both portrait and landscape. | Manual testing |
| 1.3.5 | Supports | Form inputs have appropriate autocomplete attributes. | web/public/tests/accessibility/axe-results.json |
| 1.4.1 | Supports | Color not used as sole indicator. Form errors use text. | Manual review |
| 1.4.2 | Not Applicable | No auto-playing audio. | Manual review |
| 1.4.3 | Supports | Text contrast ratio meets 4.5:1 minimum. axe-core: 0 color-contrast violations. | web/public/tests/accessibility/axe-results.json |
| 1.4.4 | Supports | Text resizable to 200% without loss of functionality. | Manual testing |
| 1.4.5 | Supports | Text used instead of images of text throughout. | web/public/tests/accessibility/axe-results.json |
| 1.4.10 | Supports | Responsive design, content reflows at 320px width. | web/public/tests/accessibility/pa11y-report.txt |
| 1.4.11 | Supports | UI components have 3:1 contrast ratio. | web/public/tests/accessibility/axe-results.json |
| 1.4.12 | Supports | CSS supports text spacing adjustments. | Manual testing |
| 1.4.13 | Supports | Hover/focus content dismissible, hoverable, persistent. | Manual testing |
| 2.1.1 | Supports | All functionality keyboard accessible. Pa11y: 0 keyboard errors. | web/public/tests/accessibility/pa11y-report.txt |
| 2.1.2 | Supports | No keyboard traps. axe-core: 0 focus-trap violations. | web/public/tests/accessibility/axe-results.json |
| 2.1.4 | Supports | No single-character keyboard shortcuts implemented. | Manual review |
| 2.2.1 | Supports | Session timeout warnings provided with extension option. | Manual review |
| 2.2.2 | Not Applicable | No auto-updating or moving content. | Manual review |
| 2.3.1 | Supports | No flashing content. | Manual review |
| 2.4.1 | Supports | Skip-to-content links implemented. | Manual review |
| 2.4.2 | Supports | All pages have descriptive titles. axe-core: 0 document-title violations. | web/public/tests/accessibility/axe-results.json |
| 2.4.3 | Supports | Focus order preserves meaning. axe-core: 0 tabindex violations. | web/public/tests/accessibility/axe-results.json |
| 2.4.4 | Supports | Link purposes clear from context. axe-core: 0 link-name violations. | web/public/tests/accessibility/axe-results.json |
| 2.4.5 | Supports | Multiple navigation methods: menu, site map, search. | Manual review |
| 2.4.6 | Supports | Headings and labels are descriptive. axe-core: 0 heading violations. | web/public/tests/accessibility/axe-results.json |
| 2.4.7 | Supports | Focus indicators visible. Pa11y: 0 focus-indicator errors. | web/public/tests/accessibility/pa11y-report.txt |
| 2.5.1 | Not Applicable | No multipoint gestures required. | Manual review |
| 2.5.2 | Supports | Standard form controls, up-event execution. | Manual review |
| 2.5.3 | Supports | Accessible names match visible labels. | web/public/tests/accessibility/axe-results.json |
| 2.5.4 | Not Applicable | No motion-activated functionality. | Manual review |
| 3.1.1 | Supports | Page language declared (en-GB). axe-core: 0 html-has-lang violations. | web/public/tests/accessibility/axe-results.json |
| 3.1.2 | Supports | All content in English, no mixed languages. | Manual review |
| 3.2.1 | Supports | Focus does not trigger context changes. | Manual review |
| 3.2.2 | Supports | Form submission requires explicit user action. | Manual review |
| 3.2.3 | Supports | Consistent navigation across all pages. | Manual review |
| 3.2.4 | Supports | Components identified consistently. | Manual review |
| 3.3.1 | Supports | Errors clearly identified with text descriptions. | Manual review |
| 3.3.2 | Supports | All form inputs have labels. axe-core: 0 label violations. | web/public/tests/accessibility/axe-results.json |
| 3.3.3 | Supports | Error suggestions provided where applicable. | Manual review |
| 3.3.4 | Supports | VAT submission requires confirmation before final submit. | behaviour-tests/submitVat.behaviour.test.js |
| 4.1.1 | Supports | Valid HTML markup. axe-core: 0 parse violations. | web/public/tests/accessibility/axe-results.json |
| 4.1.2 | Supports | UI components have accessible names/roles. axe-core: 0 aria violations. | web/public/tests/accessibility/axe-results.json |

---

## Evidence Files Referenced

| File | Description |
|------|-------------|
| web/public/tests/accessibility/pa11y-report.txt | Pa11y WCAG 2.1 AA automated scan results (16/16 pages pass) |
| web/public/tests/accessibility/axe-results.json | axe-core WCAG 2.1 detailed rule results |
| web/public/tests/accessibility/axe-wcag22-results.json | axe-core WCAG 2.2 rule results |
| Manual review | Manual testing performed for criteria not covered by automated tools |
| Manual testing | Interactive testing with keyboard, screen readers, zoom |

---

## Testing Tools Used

| Tool | Version | Standard |
|------|---------|----------|
| Pa11y | Latest | WCAG 2.1 AA |
| axe-core | 4.11.1 | WCAG 2.1 AA, WCAG 2.2 AA |
| Manual Testing | N/A | Keyboard, VoiceOver, Zoom |

---

**End of Questionnaire 2 Tracing Document**
