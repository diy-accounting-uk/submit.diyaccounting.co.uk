<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Production RUM and CSP Bug Fixes

**Created**: 15 February 2026
**Status**: In progress
**Branch**: `qaprep`

---

## Bug 1: RUM POST 400 Bad Request

**Symptom**: OPTIONS preflight to `https://dataplane.rum.eu-west-2.amazonaws.com/appmonitors/d5225846-...` returns 200 OK, but the actual POST returns 400 Bad Request.

**Root Cause**: The RUM app monitor's `domainList` in `ObservabilityStack.java` doesn't include `publicDomainName` (`submit.diyaccounting.co.uk`). It only has:
- `deploymentDomainName` → `prod-main.submit.diyaccounting.co.uk`
- `envDomainName` → `prod-submit.diyaccounting.co.uk`
- `hostedZoneName` → `diyaccounting.co.uk`

CloudWatch RUM validates the `Origin` header against the allowed domain list. Since `submit.diyaccounting.co.uk` is NOT in the list, the POST is rejected.

**Fix**: Add `publicDomainName` to the domain list in `ObservabilityStack.java`.

| Step | Description | Status |
|------|-------------|--------|
| 1.1 | Add `publicDomainName` to RUM domain list in ObservabilityStack.java | Done |
| 1.2 | `./mvnw clean verify` — CDK builds | Done |
| 1.3 | `npm test` — unit/system tests pass (850 passed) | Done |
| 1.4 | Commit and push | |
| 1.5 | Monitor deployment | |
| 1.6 | Verify RUM POST returns 200 on prod | |

---

## Bug 2: CSP Inline Script Violation

**Symptom**:
```
VM522:13 Executing inline script violates the following Content Security Policy directive 'script-src 'nonce-ywbDf4Q_2fkzshTLsdgn6g' 'unsafe-inline''.
Note that 'unsafe-inline' is ignored if either a hash or nonce value is present in the source list.
injectedFunction @ VM522:13
```

**Analysis**: The deployed CSP header has `script-src 'self' 'unsafe-inline' ...` with NO nonce. The nonce `ywbDf4Q_2fkzshTLsdgn6g` is NOT from our server headers or HTML meta tags. The `VM522:13` / `injectedFunction` pattern typically indicates a browser extension injecting its own CSP sandbox. Need to verify this isn't from the RUM client itself or any other server-side component.

| Step | Description | Status |
|------|-------------|--------|
| 2.1 | Investigate whether cwr.js (RUM client) injects meta CSP tags | Done — No |
| 2.2 | Check deployed CSP headers vs error | Done — see finding |
| 2.3 | Test with clean browser profile (no extensions) | User to verify |
| 2.4 | If confirmed our code: fix the CSP | N/A |

**Finding**: The deployed CSP header is `script-src 'self' 'unsafe-inline' https://client.rum.us-east-1.amazonaws.com ...` — no nonce. The error references `'nonce-ywbDf4Q_2fkzshTLsdgn6g'` which is a different CSP entirely. The `VM522:13` / `injectedFunction` pattern is characteristic of a browser extension injecting scripts. Our CSP correctly allows `unsafe-inline` for the RUM IIFE loader. Recommend testing with a clean browser profile (Incognito/no extensions) to confirm.

---
