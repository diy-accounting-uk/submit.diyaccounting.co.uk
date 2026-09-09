<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# CloudFront Fraud Prevention Headers Fix

**Date**: 2026-01-07
**Issue**: HMRC fraud prevention headers missing in CI environment test reports
**Status**: Fixed

## Important Clarification for AI Agents

**The HMRC fraud prevention headers issue is NOT about CloudFront forwarding headers from browser to API Gateway.**

The fraud prevention headers must be present in requests that **Lambda functions make TO HMRC MTD APIs**, not in requests from browser to CloudFront. The headers are:
1. **Collected by the browser** (`submit.js:getGovClientHeaders()`)
2. **Sent to the app's API** (`/api/v1/hmrc/*` endpoints)
3. **Forwarded through CloudFront** to API Gateway and Lambda
4. **Combined with server-derived headers** by `buildFraudHeaders.js`
5. **Included in outbound requests** from Lambda TO HMRC MTD APIs
6. **Stored in DynamoDB** with the HMRC API request/response for audit

## Header Flow (Correct Understanding)

```
[Browser]
    │
    ├─► Collects Gov-Client-* headers (screen size, timezone, device ID, etc.)
    │   via submit.js:getGovClientHeaders()
    │
    ▼
[CloudFront] ──► [API Gateway] ──► [Lambda]
    │                                   │
    │ Forwards browser headers          │
    │ (including Gov-Client-*)          │
    │                                   ▼
    │                          buildFraudHeaders.js combines:
    │                          - Browser-collected headers (Gov-Client-Screens, etc.)
    │                          - Server-derived headers (Gov-Client-Public-IP from x-forwarded-for)
    │                          - Static headers (Gov-Vendor-Product-Name, etc.)
    │                                   │
    │                                   ▼
    │                          [HMRC MTD API]
    │                          Request includes all fraud prevention headers
    │                                   │
    │                                   ▼
    │                          [DynamoDB]
    │                          Stores request/response including headers
    │                          for audit and test verification
```

## Problem Description

When tests ran against the CI environment (AWS), the test reports showed HMRC API requests were missing the fraud prevention headers that were present when running locally. The test report at `web/public/tests/test-report-template.html?test=web-test` showed requests without the expected `Gov-Client-*` headers.

## Root Cause

The CloudFront EdgeStack was using a custom `OriginRequestPolicy` that only forwarded 10 specific headers using `allowList()`. This approach had two problems:

1. **Missing Authorization header**: `allowList()` stripped the Authorization header needed for API authentication
2. **Missing cookies**: `cookieBehavior.none()` stripped cookies needed for session management

The fix was to use `denyList("Host")` which forwards ALL headers except Host (which CloudFront must set to the origin domain).

## Solution

Updated `EdgeStack.java` to use a policy that forwards all viewer headers:

```java
OriginRequestPolicy fraudPreventionHeadersPolicy = OriginRequestPolicy.Builder.create(
        this, props.resourceNamePrefix() + "-FraudPreventionORP")
    .originRequestPolicyName(props.resourceNamePrefix() + "-fraud-prevention-orp")
    .comment("Origin request policy that forwards HMRC fraud prevention headers (Gov-Client-*) to API Gateway")
    // Forward ALL viewer headers EXCEPT Host (which CloudFront sets to origin domain)
    .headerBehavior(OriginRequestHeaderBehavior.denyList("Host"))
    .queryStringBehavior(OriginRequestQueryStringBehavior.all())
    // Forward all cookies for authentication
    .cookieBehavior(OriginRequestCookieBehavior.all())
    .build();
```

## Why This Works

- `denyList("Host")` forwards ALL viewer headers (including Authorization and Gov-Client-*) except Host
- Host header must be excluded so CloudFront sets it to the origin's domain (required by API Gateway)
- All cookies are forwarded to support authentication flows
- Browser-collected fraud prevention headers reach Lambda where they're combined with server-derived headers

## Files Changed

- `infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java`

## Verification

After deployment, verify the fix by:

1. Running behaviour tests against CI environment:
   ```bash
   npm run test:submitVatBehaviour-ci
   ```

2. Checking test report at:
   ```
   https://submit.diyaccounting.co.uk/tests/test-report-template.html?test=web-test
   ```

3. Verifying that HMRC API requests in the report include Gov-Client-* headers in the `httpRequest.headers` field

## Key Files for HMRC Fraud Prevention Headers

| File | Purpose |
|------|---------|
| `web/public/submit.js` | `getGovClientHeaders()` - Collects browser-side headers |
| `app/lib/buildFraudHeaders.js` | `buildFraudHeaders()` - Combines browser + server headers |
| `app/functions/hmrc/*.js` | Lambda handlers that call HMRC APIs with fraud headers |
| `behaviour-tests/helpers/dynamodb-assertions.js` | `assertFraudPreventionHeaders()` - Test assertions |

## References

- HMRC Fraud Prevention Specification: https://developer.service.hmrc.gov.uk/guides/fraud-prevention/
- CloudFront Origin Request Policies: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-origin-requests.html
