<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Investigation: Website Not Rendering After PR #511

## Key Clarification for AI Agents

**IMPORTANT**: The original PR #511 was based on a misunderstanding of the HMRC fraud prevention headers flow.

The fraud prevention headers are NOT primarily about CloudFront forwarding headers from browser to API Gateway. They are about:
1. **Lambda functions making requests TO HMRC MTD APIs** with fraud prevention headers
2. **DynamoDB storing the HMRC API requests/responses** including headers for audit and test verification
3. **Test reports displaying** whether headers were correctly included in outbound HMRC calls

See `CLOUDFRONT_FRAUD_HEADERS_FIX.md` for the correct header flow diagram and detailed explanation.

The CloudFront OriginRequestPolicy change WAS needed because browser-collected headers (like Gov-Client-Screens, Gov-Client-Timezone) must reach the Lambda so they can be included in the outbound HMRC request. But the PR's documentation incorrectly implied the issue was simpler than it actually is.

## Summary
The website at `ci.submit.diyaccounting.co.uk` stopped rendering after PR #511 "Forward HMRC fraud prevention headers through CloudFront to API Gateway" was merged.

## Root Cause
The custom `OriginRequestPolicy` created in PR #511 has two critical issues:

1. **Cookie stripping**: `cookieBehavior(OriginRequestCookieBehavior.none())` - NO cookies forwarded to API Gateway
2. **Header restriction**: `headerBehavior(OriginRequestHeaderBehavior.allowList(...))` only forwards 10 specific Gov-Client-* headers

The previous configuration used `OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER` which forwards:
- ALL viewer headers (including `Authorization`)
- ALL cookies
- ALL query strings

The new custom policy only forwards:
- 10 specific headers (Gov-Client-* fraud prevention headers)
- NO cookies
- ALL query strings

**This causes 401 Unauthorized errors** because the `Authorization` header is NOT in the allow list and is therefore stripped by CloudFront before reaching API Gateway.

## Evidence
From deployment logs (run 20791459067):
```
[BROWSER CONSOLE error]: Failed to load resource: the server responded with a status of 401 ()
```
This 401 error appears multiple times, indicating authentication failures.

## Possible Fixes (Ranked by Probability & Change Size)

### Fix 1: Change headerBehavior to forward all headers (RECOMMENDED)
**Probability: HIGH | Change Size: SMALL**

Change in `EdgeStack.java` line 349:
```java
// FROM:
.headerBehavior(OriginRequestHeaderBehavior.allowList(
    "Gov-Client-Browser-JS-User-Agent",
    ... 9 more headers
))

// TO:
.headerBehavior(OriginRequestHeaderBehavior.all())
```

And change line 364:
```java
// FROM:
.cookieBehavior(OriginRequestCookieBehavior.none())

// TO:
.cookieBehavior(OriginRequestCookieBehavior.all())
```

This will:
- Forward ALL viewer headers (including Authorization AND Gov-Client-* headers)
- Forward ALL cookies
- Maintain query string forwarding

### Fix 2: Revert to ALL_VIEWER_EXCEPT_HOST_HEADER
**Probability: HIGH | Change Size: MEDIUM**

Revert the API Gateway behavior back to using the original policy:
```java
.originRequestPolicy(OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER)
```

This fully reverts the PR #511 change and restores the working configuration.

**Downside**: May not solve the original HMRC fraud prevention headers issue if that was a real problem.

### Fix 3: Investigate if ALL_VIEWER_EXCEPT_HOST_HEADER actually forwards custom headers
**Probability: MEDIUM | Change Size: INVESTIGATION**

The PR #511 claimed that `ALL_VIEWER_EXCEPT_HOST_HEADER` doesn't forward custom Gov-Client-* headers. However, AWS documentation states it forwards ALL viewer headers.

This needs verification - the original problem might have been elsewhere (browser not sending headers, backend not parsing them, etc.)

## Technical Details

### Deployment Domains
- `ci.submit.diyaccounting.co.uk` - CI environment (main branch)
- `ci-saltedhas.submit.diyaccounting.co.uk` - saltedhash branch feature deployment
- `submit.diyaccounting.co.uk` - Production

### Affected File
`infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java`

Lines 344-365 (the custom OriginRequestPolicy creation)

### CloudFront Limits
- CloudFront OriginRequestPolicy allows maximum 10 headers in allowList
- Cannot add more headers without removing existing ones
- Using `all()` bypasses this limit

## Applied Fixes

### Fix 1 (commit 4cedecac) - Partial fix
Changed header and cookie behavior:
```java
// Changed from:
.headerBehavior(OriginRequestHeaderBehavior.allowList(...10 headers...))
.cookieBehavior(OriginRequestCookieBehavior.none())

// Changed to:
.headerBehavior(OriginRequestHeaderBehavior.all())
.cookieBehavior(OriginRequestCookieBehavior.all())
```

**Result**: Website loads but API calls return 403 Forbidden.

**Problem**: `all()` forwards ALL headers INCLUDING the Host header. When CloudFront forwards the viewer's Host header to API Gateway, API Gateway rejects the request because the Host doesn't match its expected domain.

### Fix 2 (pending) - Complete fix
Changed to exclude Host header:
```java
// Changed from:
.headerBehavior(OriginRequestHeaderBehavior.all())

// Changed to:
.headerBehavior(OriginRequestHeaderBehavior.denyList("Host"))
```

This ensures:
- ALL viewer headers EXCEPT Host are forwarded (Authorization, Gov-Client-*, etc.)
- Host header is set by CloudFront to the origin's domain (required by API Gateway)
- ALL cookies are forwarded (for authentication support)

## Deployment Status
- Fix 1 applied in commit: `4cedecac` (partial - caused 403 errors)
- Fix 2 applied: Changed to `denyList("Host")`
- Final deployment run: https://github.com/antonycc/submit.diyaccounting.co.uk/actions/runs/20798721281
- **Status: RESOLVED** - Website working at https://submit.diyaccounting.co.uk/

## Resolution Summary
1. ~~Apply Fix 1 - change to `headerBehavior.all()` and `cookieBehavior.all()`~~ DONE (caused 403)
2. ~~Apply Fix 2 - change to `headerBehavior.denyList("Host")`~~ DONE (resolved)
3. Website verified working with fraud prevention headers in test reports

## Files Changed in PR #511
- `infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java` - Added custom OriginRequestPolicy
- `CLOUDFRONT_FRAUD_HEADERS_FIX.md` - Documentation

## Timeline
- PR #511 merged: 2026-01-07
- Website stopped working: After merge
- Last successful saltedhash deployment: 2026-01-06T23:22:19Z (run 20765225552)
- First failing saltedhash deployment: 2026-01-07T11:17:58Z (run 20779703069)
