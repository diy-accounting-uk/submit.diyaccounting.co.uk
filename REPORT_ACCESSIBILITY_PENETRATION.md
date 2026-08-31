# Compliance Report

**Application**: DIY Accounting Submit
**Version**: 1.0.0
**Target URL**: https://local.submit.diyaccounting.co.uk:3443
**Generated**: 2026-08-31T19:03:16.465Z
**Overall Status**: ❌ FAIL

**Source Files**:
```
  ✅ web/public/tests/penetration/npm-audit.json
  ✅ web/public/tests/penetration/eslint-security.txt
  ✅ web/public/tests/penetration/retire.json
  ✅ web/public/tests/penetration/zap-report.json
  ✅ web/public/tests/accessibility/pa11y-report.txt
  ✅ web/public/tests/accessibility/axe-results.json
  ✅ web/public/tests/accessibility/axe-wcag22-results.json
  ✅ web/public/tests/accessibility/lighthouse-results.json
  ✅ web/public/tests/accessibility/text-spacing-results.json
```

---

## Summary

| Check | Status | Summary |
|-------|--------|---------|
| npm audit (prod) | ✅ | 0 critical, 0 high, 0 moderate |
| ESLint Security | ✅ | 0 errors, 0 warnings |
| retire.js | ✅ | 0 high, 0 medium, 0 low |
| OWASP ZAP | ✅ | 0 high, 8 medium, 8 low |
| Pa11y (WCAG AA) | ✅ | 27/27 pages passed |
| axe-core | ✅ | 0 violations, 901 passes |
| axe-core (WCAG 2.2) | ✅ | 0 violations, 543 passes |
| Lighthouse | ✅ | A11y: 100%, Perf: 83%, BP: 100% |
| Text Spacing (1.4.12) | ❌ | 0/25 pages passed |

---

## 1. Security Checks

### 1.1 npm audit (Production Dependency Vulnerabilities)

Scanned with `--omit=dev` — only production dependencies affect compliance status.

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Moderate | 0 |
| Low | 0 |
| **Total** | **0** |

**Status**: ✅ No critical/high vulnerabilities in production dependencies

#### Development Dependencies (Informational — does not affect compliance)

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 4 |
| Moderate | 0 |
| Low | 0 |
| **Total** | **4** |

### 1.2 ESLint Security Analysis

| Metric | Count |
|--------|-------|
| Errors | 0 |
| Warnings | 0 |

**Status**: ✅ No security errors

### 1.3 retire.js (Known Vulnerabilities)

| Severity | Count |
|----------|-------|
| High | 0 |
| Medium | 0 |
| Low | 0 |

**Status**: ✅ No high severity vulnerabilities

### 1.4 OWASP ZAP (Dynamic Security Scan)

| Risk Level | Count |
|------------|-------|
| High | 0 |
| Medium | 8 |
| Low | 8 |
| Informational | 49 |

**Status**: ✅ No high risk vulnerabilities

#### Alerts

| Alert | Risk | Count |
|-------|------|-------|
| Cross-Domain Misconfiguration | Medium (Medium) | 1 |
| Information Disclosure - JWT in Browser localStorage | Medium (High) | 2 |
| Sub Resource Integrity Attribute Missing | Medium (High) | 5 |
| Cross-Domain JavaScript Source File Inclusion | Low (Medium) | 5 |
| Information Disclosure - Sensitive Information in Browser localStorage | Low (Medium) | 1 |
| Timestamp Disclosure - Unix | Low (Low) | 2 |
| Information Disclosure - Information in Browser localStorage | Informational (High) | 6 |
| Information Disclosure - Information in Browser sessionStorage | Informational (High) | 14 |
| Information Disclosure - Suspicious Comments | Informational (Medium) | 11 |
| Modern Web Application | Informational (Medium) | 5 |
| Re-examine Cache-control Directives | Informational (Low) | 5 |
| Storable but Non-Cacheable Content | Informational (Medium) | 5 |
| User Controllable HTML Element Attribute (Potential XSS) | Informational (Low) | 3 |

#### Accepted Risks (Suppressed)

| Alert | Risk | Reason |
|-------|------|--------|
| CSP: script-src unsafe-inline | Medium (High) | Required for inline event handlers and dynamic script loading. Mitigated by strict CSP directives and input validation. Documented in privacy policy. |
| CSP: style-src unsafe-inline | Medium (High) | Required for dynamic styling and third-party components. Mitigated by strict CSP directives. Documented in privacy policy. |

---

## 2. Accessibility Checks

### 2.1 Pa11y (WCAG 2.1 Level AA)

| Metric | Value |
|--------|-------|
| Pages Tested | 27 |
| Pages Passed | 27 |
| Pages Failed | 0 |

**Status**: ✅ All pages comply with WCAG AA

#### Page Results

| Page | Errors |
|------|--------|
| / | 0 |
| /index.html | 0 |
| /privacy.html | 0 |
| /terms.html | 0 |
| /about.html | 0 |
| /accessibility.html | 0 |
| /auth/login.html | 0 |
| /bundles.html | 0 |
| /usage.html | 0 |
| /hmrc/vat/submitVat.html | 0 |
| /hmrc/vat/vatObligations.html | 0 |
| /hmrc/vat/viewVatReturn.html | 0 |
| /hmrc/receipt/receipts.html | 0 |
| /guide.html | 0 |
| /help.html | 0 |
| /mcp.html | 0 |
| /diy-accounting-spreadsheets.html | 0 |
| /diy-accounting-limited.html | 0 |
| /spreadsheets.html | 0 |
| /errors/404-error-distribution.html | 0 |
| /errors/404-error-origin.html | 0 |
| /errors/403.html | 0 |
| /errors/404.html | 0 |
| /errors/500.html | 0 |
| /errors/502.html | 0 |
| /errors/503.html | 0 |
| /errors/504.html | 0 |

### 2.2 axe-core (Automated Accessibility)

| Metric | Count |
|--------|-------|
| Violations | 0 |
| Passes | 901 |
| Incomplete | 27 |

**Status**: ✅ No accessibility violations


### 2.3 axe-core (WCAG 2.2 Level AA)

| Metric | Count |
|--------|-------|
| Violations | 0 |
| Passes | 543 |
| Incomplete | 27 |

**Status**: ✅ No WCAG 2.2 violations


### 2.4 Lighthouse

| Category | Score |
|----------|-------|
| Accessibility | 100% |
| Performance | 83% |
| Best Practices | 100% |
| SEO | 100% |

**Status**: ✅ Accessibility score meets threshold (90%+)

### 2.5 Text Spacing (WCAG 1.4.12)

| Metric | Value |
|--------|-------|
| Pages Tested | 25 |
| Pages Passed | 0 |
| Pages Failed | 25 |
| Errors | 0 |

**Status**: ❌ Some pages have text spacing issues

**Test Parameters** (WCAG 1.4.12 minimum values):
- Line height: 1.5 times font size
- Letter spacing: 0.12 times font size
- Word spacing: 0.16 times font size
- Paragraph spacing: 2 times font size

#### Pages with Clipped Content

| Page | Clipped Elements |
|------|------------------|
| / | 1 |
| /about.html | 1 |
| /privacy.html | 1 |
| /terms.html | 1 |
| /accessibility.html | 1 |
| /auth/login.html | 1 |
| /bundles.html | 1 |
| /hmrc/vat/submitVat.html | 1 |
| /hmrc/vat/vatObligations.html | 1 |
| /hmrc/vat/viewVatReturn.html | 1 |
| /hmrc/receipt/receipts.html | 1 |
| /guide.html | 1 |
| /help.html | 1 |
| /mcp.html | 1 |
| /diy-accounting-spreadsheets.html | 1 |
| /diy-accounting-limited.html | 1 |
| /spreadsheets.html | 1 |
| /errors/404-error-distribution.html | 1 |
| /errors/404-error-origin.html | 1 |
| /errors/403.html | 1 |
| /errors/404.html | 1 |
| /errors/500.html | 1 |
| /errors/502.html | 1 |
| /errors/503.html | 1 |
| /errors/504.html | 1 |

---

## 3. Report Files

| Report | Path | Status |
|--------|------|--------|
| npm audit | web/public/tests/penetration/npm-audit.json | ✅ Found |
| ESLint Security | web/public/tests/penetration/eslint-security.txt | ✅ Found |
| retire.js | web/public/tests/penetration/retire.json | ✅ Found |
| OWASP ZAP | web/public/tests/penetration/zap-report.json | ✅ Found |
| Pa11y | web/public/tests/accessibility/pa11y-report.txt | ✅ Found |
| axe-core | web/public/tests/accessibility/axe-results.json | ✅ Found |
| axe-core (WCAG 2.2) | web/public/tests/accessibility/axe-wcag22-results.json | ✅ Found |
| Lighthouse | web/public/tests/accessibility/lighthouse-results.json | ✅ Found |
| Text Spacing | web/public/tests/accessibility/text-spacing-results.json | ✅ Found |

---

*Generated by `node scripts/generate-compliance-report.js --target https://local.submit.diyaccounting.co.uk:3443`*
