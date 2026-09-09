<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Plan: Add CloudFront Distribution + DNS to SimulatorStack

## Problem

The simulator iframe on `ci.submit.diyaccounting.co.uk/simulator.html` fails to load because:

1. **No DNS record**: `simulator.ci.submit.diyaccounting.co.uk` gives `ERR_NAME_NOT_RESOLVED`
2. **Wrong naming pattern**: The old pattern `simulator.{envDomain}` creates a two-level subdomain not covered by the `*.submit.diyaccounting.co.uk` wildcard ACM certificate
3. **No CloudFront distribution**: The SimulatorStack only creates a Lambda Function URL (raw AWS domain), with no custom domain routing

## Solution

Add a CloudFront distribution in front of the Lambda Function URL in `SimulatorStack`, with:
- Custom domain: `{env}-simulator.submit.diyaccounting.co.uk` (e.g., `ci-simulator.submit.diyaccounting.co.uk`)
- Existing wildcard ACM certificate (already in us-east-1): `arn:aws:acm:us-east-1:887764105431:certificate/b23cd904-...`
- Route53 A/AAAA alias records pointing to the CloudFront distribution
- Response headers allowing iframe embedding from the parent site

### Naming Convention (consistent with existing patterns)

| Service | Pattern | CI Example |
|---------|---------|------------|
| Auth (Cognito) | `{env}-auth.submit.diyaccounting.co.uk` | `ci-auth.submit.diyaccounting.co.uk` |
| Holding | `{env}-holding.submit.diyaccounting.co.uk` | `ci-holding.submit.diyaccounting.co.uk` |
| **Simulator** | `{env}-simulator.submit.diyaccounting.co.uk` | `ci-simulator.submit.diyaccounting.co.uk` |

All covered by `*.submit.diyaccounting.co.uk` wildcard cert.

## Architecture

```
Parent page (ci.submit.diyaccounting.co.uk)
  └─ simulator.html
       └─ <iframe src="https://ci-simulator.submit.diyaccounting.co.uk/">
              │
              ▼
         Route53 (ci-simulator.submit.diyaccounting.co.uk)
              │
              ▼
         CloudFront Distribution
         - Custom domain: ci-simulator.submit.diyaccounting.co.uk
         - ACM cert: *.submit.diyaccounting.co.uk (us-east-1)
         - frame-ancestors: parent site origins
              │
              ▼
         Lambda Function URL (eu-west-2)
         - simulator-server.js via Lambda Web Adapter
         - In-memory state, no secrets
```

## Cross-Origin Considerations

The simulator iframe is cross-origin (different subdomain from the parent page). This means:
- The iframe content **loads and is fully interactive** (user can click, type, navigate)
- The Watch journey automation **cannot access iframe DOM** (`contentDocument` returns null for cross-origin)
- The journey code handles this gracefully (logs warnings, continues, shows step progress visually)
- In local testing, `/sim/` same-origin path is used, so journeys fully interact with the iframe

This is acceptable: the deployed simulator is a visual demo where users interact directly. The Watch buttons serve as visual step-by-step guides. Full automation only works in local testing.

## Files to Modify

### 1. `SimulatorStack.java` - Add CloudFront + Route53

**New props needed**: `hostedZoneName`, `hostedZoneId`, `certificateArn`

**New resources**:
- `Certificate.fromCertificateArn()` - reference the existing wildcard cert
- `HttpOrigin` - Lambda Function URL as CloudFront origin
- `Distribution` - CloudFront distribution with custom domain
- `ResponseHeadersPolicy` - allow iframe embedding via `frame-ancestors`
- `Route53AliasUpsert.upsertAliasToCloudFront()` - DNS records

**CloudFront behavior config**:
- Cache: disabled (simulator is dynamic)
- Origin request: forward all viewer headers except Host
- Viewer protocol: redirect HTTP to HTTPS
- Allowed methods: GET, HEAD, POST, PUT, DELETE, OPTIONS, PATCH

### 2. `SubmitEnvironment.java` - Pass new props

Pass `hostedZoneName`, `hostedZoneId`, `certificateArn` to SimulatorStack builder.

### 3. Already completed (previous commits)

- `SubmitSharedNames.java` - `simulatorDomainName` field added
- `EdgeStack.java` - CSP `frame-src` updated to use `simulatorDomainName`
- `simulator.html` - Client-side URL computation updated
- `simulator-journeys.js` - `ensureTestBundle()` step added to all journeys

## Implementation Notes

- CloudFront distributions are global; the CDK stack can be in any region (eu-west-2 is fine)
- The ACM certificate is already in us-east-1 (CloudFront requirement) - loaded by ARN
- `Route53AliasUpsert` handles idempotent UPSERT of both A and AAAA records
- Lambda Function URL domain extracted via `Fn.select(2, Fn.split("/", functionUrl.getUrl()))`
- CORS on the Lambda Function URL is no longer needed for same-origin iframe requests through CloudFront, but keeping it doesn't hurt (other origins may embed the simulator)

## Verification

1. `./mvnw clean verify` - CDK synthesizes correctly
2. `npm test` - unit tests pass
3. `npm run test:simulatorBehaviour-simulator` - local simulator tests pass
4. Push to `simulator` branch, deploy to CI
5. Check `https://submit.diyaccounting.co.uk/simulator.html` - iframe loads from `ci-simulator.submit.diyaccounting.co.uk`
6. `npm run test:simulatorBehaviour-ci` - CI simulator tests pass (journey steps shown, iframe loads)
