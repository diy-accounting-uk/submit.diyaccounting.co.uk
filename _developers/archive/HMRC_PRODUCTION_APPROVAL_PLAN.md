<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# HMRC Production Approval Plan

**Goal**: Obtain HMRC production credentials as quickly as possible
**Blocking Requirements**: Penetration testing, WCAG accessibility audit

---

## Quick Reference

```bash
# Run all compliance checks locally
npm run accessibility          # WCAG Level AA audit
npm run penetration            # Security vulnerability scan

# Generate reports
npm run accessibility:report   # HTML report in web/public/tests/accessibility/
npm run penetration:report     # HTML report in web/public/tests/penetration/
```

---

## Phase 1: Compliance Scanning Setup

### 1.1 Accessibility Testing (WCAG Level AA)

**Tools (npm save-dev)**:
- `pa11y` - Command-line accessibility testing
- `pa11y-ci` - CI-friendly multi-page testing
- `@axe-core/cli` - Deque axe accessibility engine
- `lighthouse` - Google Lighthouse (includes accessibility)

**npm scripts to add**:
```json
{
  "accessibility": "pa11y-ci --config .pa11yci.json",
  "accessibility:report": "pa11y-ci --config .pa11yci.json --reporter html > web/public/tests/accessibility/report.html",
  "accessibility:lighthouse": "lighthouse https://wanted-finally-anteater.ngrok-free.app --output html --output-path web/public/tests/accessibility/lighthouse.html --chrome-flags='--headless'",
  "accessibility:axe-proxy-report": "axe https://wanted-finally-anteater.ngrok-free.app --save web/public/tests/accessibility/axe-results.json"
}
```

**Configuration file** (`.pa11yci.json`):
```json
{
  "defaults": {
    "standard": "WCAG2AA",
    "timeout": 30000,
    "wait": 2000,
    "chromeLaunchConfig": {
      "args": ["--no-sandbox"]
    }
  },
  "urls": [
    "https://wanted-finally-anteater.ngrok-free.app/",
    "https://wanted-finally-anteater.ngrok-free.app/index.html",
    "https://wanted-finally-anteater.ngrok-free.app/privacy.html",
    "https://wanted-finally-anteater.ngrok-free.app/terms.html",
    "https://wanted-finally-anteater.ngrok-free.app/about.html",
    "https://wanted-finally-anteater.ngrok-free.app/auth/login.html",
    "https://wanted-finally-anteater.ngrok-free.app/account/bundles.html",
    "https://wanted-finally-anteater.ngrok-free.app/hmrc/vat/submitVat.html",
    "https://wanted-finally-anteater.ngrok-free.app/hmrc/vat/vatObligations.html",
    "https://wanted-finally-anteater.ngrok-free.app/hmrc/vat/viewVatReturn.html",
    "https://wanted-finally-anteater.ngrok-free.app/hmrc/receipt/receipts.html",
    "https://wanted-finally-anteater.ngrok-free.app/guide/index.html"
  ]
}
```

### 1.2 Penetration Testing

**Static Analysis (npm save-dev)**:
- `eslint-plugin-security` - Already installed, security-focused linting
- `npm-audit` - Built into npm, checks dependencies
- `snyk` - Vulnerability scanning (optional, requires account)
- `retire` - Detect known vulnerable JS libraries

**Dynamic Analysis (Docker-based)**:
- `zaproxy/zap-stable` - OWASP ZAP for active scanning

**npm scripts to add**:
```json
{
  "penetration": "npm audit --audit-level=moderate && npm run penetration:static",
  "penetration:static": "eslint --config eslint.security.config.js . --format stylish | tee web/public/tests/penetration/eslint-security.txt || true",
  "penetration:deps": "npm audit --json > web/public/tests/penetration/npm-audit.json || true",
  "penetration:retire": "retire --path . --outputformat json --outputpath web/public/tests/penetration/retire.json || true",
  "penetration:zap": "docker run --rm -v $(pwd)/web/public/tests/penetration:/zap/wrk:rw -t zaproxy/zap-stable zap-baseline.py -t ${DIY_SUBMIT_BASE_URL:-https://wanted-finally-anteater.ngrok-free.app} -r zap-report.html -J zap-report.json",
  "penetration:report": "npm run penetration:deps && npm run penetration:static && npm run penetration:retire && echo 'Reports in web/public/tests/penetration/'"
}
```

**Security ESLint config** (`eslint.security.config.js`):
```javascript
import security from "eslint-plugin-security";
import globals from "globals";

export default [
  {
    plugins: { security },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      ...security.configs.recommended.rules,
      "security/detect-eval-with-expression": "error",
      "security/detect-unsafe-regex": "error",
      // Additional security rules configured
    },
  },
  {
    ignores: ["node_modules/", "target/", "cdk.out/", "*.min.js", "web/public/tests/"],
  },
];
```

---

## Phase 2: Run Initial Scans

### 2.1 Local Testing (With ngrok)

```bash
# Start local server with ngrok tunnel
npm start

# In another terminal, run accessibility tests
npm run accessibility
npm run accessibility:lighthouse

# Run penetration (static analysis)
npm run penetration:report
```

Note: `npm start` launches the local server with an ngrok tunnel. The accessibility tests use the ngrok URL configured in `.pa11yci.json`.

### 2.2 Production Testing (After Deployment)

```bash
# Against production
DIY_SUBMIT_BASE_URL=https://submit.diyaccounting.co.uk npm run penetration:zap
pa11y-ci --config .pa11yci.prod.json
```

---

## Phase 3: Fix Issues

### Expected Accessibility Issues
- Missing alt text on images
- Insufficient color contrast
- Missing form labels
- Missing skip links
- Focus order issues

### Expected Security Issues
- Dependency vulnerabilities (fix with `npm audit fix`)
- Hardcoded values flagged as potential secrets
- eval() usage (unlikely but check)

### Issue Tracking
Create GitHub issues for each finding, tagged:
- `accessibility` - WCAG violations
- `security` - Penetration test findings

---

## Phase 4: GitHub Actions Integration

### Weekly Compliance Workflow (`.github/workflows/compliance.yml`):

The workflow runs individual compliance checks in parallel, then generates a combined report.

**Parallel Accessibility Jobs:**

| Job | Script | Purpose |
|-----|--------|---------|
| `accessibility-pa11y` | `accessibility:pa11y-<env>` | WCAG 2.1 Level AA multi-page testing |
| `accessibility-axe` | `accessibility:axe-<env>` | axe-core WCAG 2.1 AA |
| `accessibility-axe-wcag22` | `accessibility:axe-wcag22-<env>` | axe-core WCAG 2.2 AA |
| `accessibility-lighthouse` | `accessibility:lighthouse-<env>` | Google Lighthouse accessibility |

**Parallel Penetration Jobs:**

| Job | Script | Purpose |
|-----|--------|---------|
| `penetration-eslint` | `penetration:eslint` | ESLint security plugin |
| `penetration-audit` | `penetration:audit` | npm dependency vulnerabilities |
| `penetration-retire` | `penetration:retire` | Known vulnerable JS libraries |
| `penetration-zap` | `penetration:zap-<env>` | OWASP ZAP baseline scan |

**Final Report Job (runs after all above complete):**

| Job | Script | Purpose |
|-----|--------|---------|
| `compliance-report` | `compliance:<env>-report-md` | Generate combined REPORT_ACCESSIBILITY_PENETRATION.md |

**Triggers:**
- Weekly on Monday at 6am UTC (scheduled)
- Manual via workflow_dispatch
- Called from other workflows via workflow_call

**Environment Detection:**
- Reads last-known-good deployment from SSM Parameter Store
- Uses `get-names` action to compute environment URLs (ci or prod)

---

## Phase 5: HMRC Submission

### Pre-Submission Checklist

- [ ] Accessibility scan shows 0 WCAG Level AA violations
- [ ] npm audit shows 0 high/critical vulnerabilities
- [ ] ZAP baseline scan shows 0 high-risk findings
- [ ] Company details in HMRC submission document
- [ ] Privacy policy URL accessible
- [ ] Terms of use URL accessible

### Submission Evidence Package

Collect in `target/hmrc-submission/`:
1. `accessibility-report.html` - Pa11y/Lighthouse report
2. `zap-report.html` - OWASP ZAP baseline scan
3. `npm-audit.json` - Dependency audit
4. `test-report-web-test-local.json` - Functional test evidence
5. Screenshots from `web/public/tests/`

### Email to SDSTeam@hmrc.gov.uk

```
Subject: Production Credentials Request - DIY Accounting Submit

Application: DIY Accounting Submit
URL: https://submit.diyaccounting.co.uk
Developer Hub App ID: [YOUR_APP_ID]

We have completed sandbox testing and security/accessibility audits.
Please find attached:
- Functional test evidence (fraud prevention headers validated)
- WCAG Level AA accessibility audit (0 violations)
- Security penetration test report (OWASP ZAP baseline)
- Dependency vulnerability audit (npm audit)

Company: DIY Accounting Limited
Company Number: 06846849
Responsible Individual: [NAME]
Contact: admin@diyaccounting.co.uk

We are ready to proceed with production credential issuance.
```

---

## Two-Lane Testing Strategy

### Lane 1: Static/Local (Fast, Pre-commit)
| Tool | What It Tests | When |
|------|---------------|------|
| `eslint-plugin-security` | Code patterns | Every commit |
| `npm audit` | Dependencies | Every build |
| `retire` | Known vulnerable libs | Every build |
| `pa11y` (via ngrok) | Accessibility | Pre-merge |

### Lane 2: Production (Thorough, Daily)
| Tool | What It Tests | When |
|------|---------------|------|
| OWASP ZAP | Active vulnerability scan | Daily |
| Lighthouse CI | Performance + accessibility | Daily |
| Pa11y CI | Multi-page accessibility | Daily |

---

## Timeline

| Day | Activity |
|-----|----------|
| 1 | Install tools, configure scripts, run initial scans |
| 2-3 | Fix critical accessibility issues |
| 2-3 | Fix critical security issues |
| 4 | Set up GitHub Actions workflows |
| 5 | Final scan, prepare submission package |
| 5 | Email HMRC SDSTeam |

---

## npm Packages to Install

```bash
npm install --save-dev \
  pa11y \
  pa11y-ci \
  @axe-core/cli \
  retire \
  lighthouse
```

Note: `eslint-plugin-security` is already installed.

---

## Files to Create

1. `.pa11yci.json` - Accessibility test configuration
2. `.pa11yci.prod.json` - Production URLs for accessibility
3. `eslint.security.config.js` - Security-focused ESLint rules (flat config format)
4. `.zap-rules.tsv` - ZAP rule configuration
5. `.github/workflows/compliance.yml` - Daily compliance workflow
6. `.github/workflows/scan-production.yml` - Production scan workflow

---

## Success Criteria

1. **Accessibility**: Zero WCAG Level AA errors on all public pages
2. **Penetration**: Zero high/critical findings in ZAP baseline
3. **Dependencies**: Zero high/critical vulnerabilities in npm audit
4. **Automated**: Daily scans running in GitHub Actions
5. **Documented**: All reports archived and available

---

**Document Version**: 1.2
**Created**: 12 January 2026
**Updated**: 13 January 2026

---

## HMRC Development Practices Compliance

Per https://developer.service.hmrc.gov.uk/api-documentation/docs/development-practices:

| Practice | Requirement | Our Status |
|----------|-------------|------------|
| Single application | One production app per organisation | Compliant |
| No certificate pinning | Use global root CA keystore | Compliant (AWS handles) |
| No static IPs | Configure proxy, not firewall | Compliant |
| No OAuth automation | Don't automate OAuth web flow | Compliant |
| Server-side API calls | No CORS/browser-direct calls | Compliant |
| Weekly sandbox testing | Test for breaking changes | Automated in CI |

## HMRC Error Handling Requirements

Per https://developer.service.hmrc.gov.uk/api-documentation/docs/reference-guide:

| Status | Code | Our Handling |
|--------|------|--------------|
| 401 | INVALID_CREDENTIALS | Prompt re-authorization |
| 403 | FORBIDDEN | Display permission error |
| 404 | MATCHING_RESOURCE_NOT_FOUND | Display "not found" |
| 429 | MESSAGE_THROTTLED_OUT | Retry with backoff (SQS) |
| 500 | INTERNAL_SERVER_ERROR | Display error, log details |
| 503 | SERVER_ERROR | Retry with backoff |
| 504 | GATEWAY_TIMEOUT | Retry with backoff |

**Rate limit**: 3 requests/second (implemented via SQS async processing)
