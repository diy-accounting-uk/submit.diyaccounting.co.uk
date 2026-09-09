<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Plan: HMRC Fraud Prevention Header Fixes

**Status: COMPLETE** — All fixes deployed to CI and prod as of 8 February 2026. Awaiting HMRC re-review.

**Date**: 6 February 2026
**Triggered by**: HMRC FPH Team review response (4 February 2026)
**Goal**: Fix fraud prevention header issues to achieve HMRC production API approval

---

## HMRC Feedback Summary

HMRC reviewed headers from 10:11-10:12 UTC, 4 February 2026, across all three endpoints:
- `GET /organisations/vat/{vrn}/obligations`
- `POST /organisations/vat/{vrn}/returns`
- `GET /organisations/vat/{vrn}/returns/{periodKey}`

Three issues identified:

| # | Header | Issue | Severity | Status |
|---|--------|-------|----------|--------|
| 1 | Gov-Vendor-Public-IP & Gov-Client-Public-IP | Values must not be the same | Blocking | Done |
| 2 | Gov-Client-Public-Port | Must be provided (previous omission justification rejected) | Blocking | Done |
| 3 | Gov-Vendor-License-IDs | Omit the header (confirming our approach) | None | Done (no change needed) |

---

## Issue 1: Gov-Vendor-Public-IP = Gov-Client-Public-IP — Done

### Root Cause

In `app/lib/buildFraudHeaders.js:79`:
```javascript
const serverPublicIp = process.env.SERVER_PUBLIC_IP || publicClientIp;
```

`SERVER_PUBLIC_IP` is never set in CDK Lambda environment variables. The fallback uses
`publicClientIp` (the user's IP from `X-Forwarded-For`), making both headers identical.

### Fix — Implemented

1. **Removed the toxic fallback** `process.env.SERVER_PUBLIC_IP || publicClientIp`
2. **Detect Lambda's outbound IP at cold start** by calling `https://checkip.amazonaws.com`
3. **Cache the result** in a module-level variable (persists across warm invocations)
4. **Log a warning** if detection fails (header will be omitted, not falsified)

### Files Changed

- `app/lib/buildFraudHeaders.js` — IP detection + remove fallback
- `app/unit-tests/lib/buildFraudHeaders.test.js` — Updated tests

---

## Issue 2: Gov-Client-Public-Port — Done

### Solution: CloudFront-Viewer-Address Header

Approach 1 (`all("CloudFront-Viewer-Address")`) caused 403 errors from API Gateway because
it forwards the viewer's `Host` header. This was resolved by configuring API Gateway custom
domains (see PLAN_DOMAIN_ALIGNMENT_AND_API_GATEWAY_CUSTOM_DOMAIN.md).

### Implementation — Complete

**EdgeStack**: Origin Request Policy uses `OriginRequestHeaderBehavior.all("CloudFront-Viewer-Address")`
to forward all viewer headers plus the CloudFront-Viewer-Address header to API Gateway.

**buildFraudHeaders.js**: Extracts port from `CloudFront-Viewer-Address` header:
```javascript
const viewerAddress = getHeader("cloudfront-viewer-address");
if (viewerAddress) {
    const port = viewerAddress.split(":").pop();
    headers["Gov-Client-Public-Port"] = port;
}
```

### Files Changed

- `infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java` — ORP change
- `app/lib/buildFraudHeaders.js` — Extract port from CloudFront-Viewer-Address
- `behaviour-tests/helpers/dynamodb-assertions.js` — Documented as intentionally not supplied in proxy/simulator mode (no CloudFront in path)
- `hmrc-fraud-prevention.md` — Updated documentation

---

## Issue 3: Gov-Vendor-License-IDs (No Change) — Done

HMRC says: "Please omit the header in future submissions and we will take this into
consideration when validating."

This header is already intentionally not sent. No code change needed. HMRC is acknowledging
our open-source rationale.

---

## Flagged Fallbacks — Resolved

### Toxic fallback (REMOVED)
- `buildFraudHeaders.js:79`: `process.env.SERVER_PUBLIC_IP || publicClientIp`
  — Falsified Gov-Vendor-Public-IP by using client's IP as server IP

### Acceptable patterns (NOT toxic)
- `buildFraudHeaders.js:72`: `authorizer?.claims?.sub || authorizer?.sub || "anonymous"`
  — The custom authorizer rejects unauthenticated requests before this code runs.
    "anonymous" is a dead-code defensive pattern, not a production fallback. However,
    a warning log has been added for visibility.

### Browser-side patterns (NOT sent to HMRC)
- `hmrc-service.js:155`: `return "SERVER_DETECT"` — Browser IP detection fallback.
  This value is sent to the Express/Lambda server as `Gov-Client-Public-IP` but the server
  does NOT pass through `Gov-Client-Public-IP` from client headers. It independently
  extracts the IP from `X-Forwarded-For`. So "SERVER_DETECT" never reaches HMRC.

---

## HMRC Additional Requirements

HMRC also requires:
1. **Use the Test API** to confirm headers are valid after changes
2. **Submit using different hardware and users** to show headers vary correctly
3. **Use all endpoints** the application will use in production

These are testing/validation requirements, not code changes.

---

## Deployment & Validation Plan — Complete

1. Implement code changes — Done
2. Run `npm test` — unit tests pass — Done
3. Run `./mvnw clean verify` — CDK compiles — Done
4. Push to feature branch -> GitHub Actions deploys to CI — Done
5. Approach 1 (`all("CloudFront-Viewer-Address")`) caused 403 errors -> Implemented Approach 3 (API Gateway custom domain) — Done
6. Run behaviour tests against CI deployment — Done (all pass)
7. Validate fraud prevention headers via HMRC Test API — Done (`postVatReturnFraudPreventionHeadersBehaviour-prod` passes)
8. Test with multiple users/devices — Pending (for HMRC re-review submission)
9. Submit to HMRC for re-review — Pending
