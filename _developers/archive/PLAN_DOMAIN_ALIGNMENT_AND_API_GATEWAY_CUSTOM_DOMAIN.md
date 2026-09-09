<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Plan: API Gateway Custom Domain + Domain Convention Alignment + Fraud Prevention Fix

**Status: COMPLETE** — All items deployed to CI and prod as of 8 February 2026.

## Context

HMRC rejected our fraud prevention headers because `Gov-Client-Public-Port` was missing. To get the client's source port, we need CloudFront to forward the `CloudFront-Viewer-Address` header to API Gateway. The only CDK option is `OriginRequestHeaderBehavior.all("CloudFront-Viewer-Address")`, which forwards ALL viewer headers including `Host`. API Gateway rejects requests where the forwarded `Host` header doesn't match a configured custom domain, returning 403. This broke 10/17 CI behaviour tests.

The fix: configure API Gateway custom domains matching the `Host` headers CloudFront forwards. Concurrently, align submit's domain naming with gateway/spreadsheets conventions.

## Domain Naming: Current vs Proposed

| Purpose | Current | Proposed | Status |
|---------|---------|----------|--------|
| CI env apex | `ci.submit.diyaccounting.co.uk` | `ci-submit.diyaccounting.co.uk` | Done |
| Prod env apex | `submit.diyaccounting.co.uk` | `prod-submit.diyaccounting.co.uk` + `submit.diyaccounting.co.uk` | Done |
| CI deployment | `ci-rootdns.submit.diyaccounting.co.uk` | unchanged | Done |
| Prod deployment | `prod-a1b2c3d.submit.diyaccounting.co.uk` | unchanged | Done |
| CI holding | `ci-holding.submit.diyaccounting.co.uk` | `ci-holding.diyaccounting.co.uk` | Done |
| Prod holding | `prod-holding.submit.diyaccounting.co.uk` | `prod-holding.diyaccounting.co.uk` | Done |
| Cognito (CI) | `ci-auth.submit.diyaccounting.co.uk` | `ci-auth.diyaccounting.co.uk` | Done |
| Cognito (prod) | `prod-auth.submit.diyaccounting.co.uk` | `prod-auth.diyaccounting.co.uk` | Done |
| Simulator (CI) | `ci-simulator.submit.diyaccounting.co.uk` | `ci-simulator.diyaccounting.co.uk` | Done |
| Simulator (prod) | `prod-simulator.submit.diyaccounting.co.uk` | `prod-simulator.diyaccounting.co.uk` | Done |

## Prerequisites (Manual — before any code deploy)

### P1. us-east-1 ACM certificates (3 total) — Done

**Keep existing cert `d340de40`** for EdgeStack + ApexStack. It already has the 6 SANs needed:
- `submit.diyaccounting.co.uk`, `*.submit.diyaccounting.co.uk`
- `ci-submit.diyaccounting.co.uk`, `prod-submit.diyaccounting.co.uk`
- `ci-holding.diyaccounting.co.uk`, `prod-holding.diyaccounting.co.uk`

No change to `certificateArn` in `cdk-application/cdk.json` or `cdk-environment/cdk.json`. Done.

**Create new auth cert** (us-east-1) for IdentityStack/Cognito custom domain:
- `ci-auth.diyaccounting.co.uk`
- `prod-auth.diyaccounting.co.uk`

Done: arn:aws:acm:us-east-1:887764105431:certificate/8750ac93-48f8-47fc-9702-8707d3b7398a

Add authCertificateArn to cdk-environment/cdk.json. Done.

**Create new simulator cert** (us-east-1) for SimulatorStack:
- `ci-simulator.diyaccounting.co.uk`
- `prod-simulator.diyaccounting.co.uk`

Done: arn:aws:acm:us-east-1:887764105431:certificate/5b8afa59-8e91-4335-9196-f4043c1870b3

Add simulatorCertificateArn to cdk-environment/cdk.json. Done.

### P2. eu-west-2 ACM certificate — Done

Cert `1f9c9a57-5834-41d3-822d-4aae7e32d633` already covers:
- `submit.diyaccounting.co.uk`, `*.submit.diyaccounting.co.uk`
- `ci-submit.diyaccounting.co.uk`, `prod-submit.diyaccounting.co.uk`

`regionalCertificateArn` in `cdk-application/cdk.json` already updated. Done.

### P3. Register new callback URLs in HMRC Developer Hub — Done

### P4. Register new redirect URIs in Google Cloud Console — Done

Google OAuth redirects to the Cognito domain. Since `cognitoDomainName` changed from `ci-auth.submit.diyaccounting.co.uk` to `ci-auth.diyaccounting.co.uk`, added:
- `https://ci-auth.diyaccounting.co.uk/oauth2/idpresponse`
- `https://prod-auth.diyaccounting.co.uk/oauth2/idpresponse`

## Code Changes

### C1. `SubmitSharedNames.java` — Domain name construction — Done

### C2. `.github/actions/get-names/action.yml` — Apex + holding domain computation — Done

### C3. `ApiStack.java` — Add API Gateway custom domain — Done

Also added cleanup Lambda for external API Gateway custom domain mappings on stack deletion (PR #677).

### C4. `SubmitApplication.java` — Wire regionalCertificateArn to ApiStack — Done

### C5. `EdgeStack.java` — No change needed — Done

The `all("CloudFront-Viewer-Address")` ORP stays. The 403 is fixed by API GW custom domains.

### C6. `SubmitEnvironment.java` — Wire separate auth/simulator cert ARNs — Done

### C7. `cdk-environment/cdk.json` — Add auth/simulator cert ARNs — Done

### C8. `.github/actions/set-origins/action.yml` — Add API GW custom domain transfer — Done

Also added:
- Retry logic with exponential backoff for both create and delete API GW domain operations (PR #679)
- Route53 DNS upsert for `prod-apex-alias` (`submit.diyaccounting.co.uk`) (PR #678)

### C9. `deploy.yml` — Pass new parameters to set-origins — Done

### C10. `.env.ci` and `.env.prod` — Update base URLs — Done

### C11. IdentityStack — Cognito domain change (destructive) — Done

### C12. Prod additional alias — `submit.diyaccounting.co.uk` — Done

## Deployment Sequence — Complete

1. **Manual**: Create auth + simulator certs in us-east-1 (P1), register Google callbacks (P4) — Done
2. **Manual**: Update `authCertificateArn` and `simulatorCertificateArn` in `cdk-environment/cdk.json` — Done
3. **Code**: All code changes (C1-C12) merged to main — Done
4. **Local test**: `npm test` + `./mvnw clean verify` — Done
5. **Push**: deploy.yml completed successfully on main — Done (7 Feb 2026)
   - deploy-environment ran -> IdentityStack got new Cognito domain + callback URLs
   - App stacks deployed -> ApiStack created deployment-level API GW custom domain
   - set-origins -> Moved apex CloudFront alias + created apex API GW custom domain
   - Behaviour tests passed against `ci-submit.diyaccounting.co.uk`
   - Synthetic tests passed against prod
6. **Validate**: All behaviour tests pass — Done
7. **Prod cutover** (8 Feb 2026):
   - Manually removed CNAMEs from old S3-based CloudFront distribution (E3VBOLA04TMMN0)
   - deploy-root.yml: `diyaccounting.co.uk` and `www.diyaccounting.co.uk` now served by prod-gateway (E18ZQRDYBD8UCA)
   - deploy-holding (last-known-good): `submit.diyaccounting.co.uk` DNS and API GW custom domain fixed
   - Fixed stale DNS record for `submit.diyaccounting.co.uk` (was pointing to destroyed `prod-711172e` deployment)

## Testing & Verification — Complete

- `npm test` — Unit tests pass
- `./mvnw clean verify` — CDK compiles, synth produces valid templates
- After CI deploy: `curl -I https://ci-submit.diyaccounting.co.uk/` returns 200
- After CI deploy: All behaviour tests pass (especially auth-dependent ones)
- Fraud prevention headers include `Gov-Client-Public-Port` in DynamoDB receipts
- `postVatReturnFraudPreventionHeadersBehaviour-prod` synthetic test passes
- `diyaccounting.co.uk` and `www.diyaccounting.co.uk` resolve to prod-gateway CloudFront
- `submit.diyaccounting.co.uk` resolves to current prod submit deployment

## Files Modified Summary

| File | Change | Status |
|------|--------|--------|
| `infra/.../SubmitSharedNames.java` | envDomainName, cognitoDomainName, holdingDomainName, simulatorDomainName | Done |
| `infra/.../stacks/ApiStack.java` | Add regionalCertificateArn prop, custom domain + ApiMapping + cleanup Lambda | Done |
| `infra/.../SubmitApplication.java` | Add regionalCertificateArn prop, wire to ApiStack | Done |
| `infra/.../SubmitEnvironment.java` | Add authCertificateArn/simulatorCertificateArn, wire to stacks | Done |
| `.github/actions/get-names/action.yml` | apex-domain + holding-domain construction | Done |
| `.github/actions/set-origins/action.yml` | Add API GW custom domain management + Route53 prod alias + retry logic | Done |
| `.github/workflows/deploy.yml` | Pass API GW ID + cert ARN to set-origins | Done |
| `.env.ci` | DIY_SUBMIT_BASE_URL | Done |
| `.env.prod` | DIY_SUBMIT_BASE_URL | Done |
| `cdk-environment/cdk.json` | Add authCertificateArn + simulatorCertificateArn | Done |
