<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# DIY Accounting - Gateway & Brand Architecture Plan

**Version**: 1.1 | **Date**: February 2026 | **Status**: Draft

---

## 1. Vision & Brand Architecture

### Hub-and-Spoke Model

`diyaccounting.co.uk` serves as the corporate gateway, routing visitors to distinct product sites. Each spoke is an independent web application with its own deployment pipeline, AWS account, and domain.

```
                    diyaccounting.co.uk
                     (corporate gateway)
                            |
            +---------------+---------------+
            |               |               |
   submit.diy...co.uk  spreadsheets.diy...co.uk  /about.html
      (MTD VAT)       (Excel bookkeeping)     (company info)
```

### Three Products

| Product | Domain | Description |
|---------|--------|-------------|
| DIY Accounting Submit | submit.diyaccounting.co.uk | Submit UK VAT returns to HMRC under Making Tax Digital (MTD) |
| DIY Accounting Spreadsheets | spreadsheets.diyaccounting.co.uk | Excel bookkeeping and accounting software for UK small businesses |
| DIY Accounting Limited | diyaccounting.co.uk/about.html | Corporate identity, directors, company history, contact |

### Gateway Page Design (Option B: Buttons + Company Summary)

The gateway is a minimal landing page with three large stacked rounded buttons plus a company summary block. No JavaScript required; pure static HTML/CSS.

**Button 1**: "DIY Accounting Submit" with subtitle "Submit UK VAT returns to HMRC under Making Tax Digital (MTD)" linking to `https://submit.diyaccounting.co.uk`

**Button 2**: "DIY Accounting Spreadsheets" with subtitle "Excel bookkeeping and accounting software for UK small businesses" linking to `https://spreadsheets.diyaccounting.co.uk`

**Button 3**: "DIY Accounting Limited" linking to `about.html` on the gateway site itself

### Footer

Reuses the submit.diyaccounting.co.uk footer pattern (three-column: left links, centre copyright, right container). Links to privacy, terms, and accessibility pages point to the submit site (`https://submit.diyaccounting.co.uk/privacy.html`, etc.) rather than duplicated copies. The footer-left strips app-specific links (tests, api, view source) and keeps: privacy, terms, accessibility.

### Design System

The gateway uses a subset of `submit.css`, stripped of application chrome (no auth section, no form controls, no spinner, no simulator styles). Only the design tokens (CSS custom properties), base reset, typography, footer, and button styles are needed.

Key design tokens from submit.css:
- Primary brand colour: `#2c5aa0`
- Hero gradient: `#667eea` to `#764ba2` (purple, used on about.html)
- Font: Arial, sans-serif
- Max-width: 800px
- Responsive breakpoint: 600px
- WCAG 2.1 AA focus styling

---

## 2. DNS & Certificate Architecture

### Current State (Route53 Zone Snapshot)

Root account (887764105431) hosts the Route53 zone `diyaccounting.co.uk` with approximately 87 records. Key records:

| Record | Type | Target | Purpose |
|--------|------|--------|---------|
| `diyaccounting.co.uk` | A alias | d2nnnfnriqw5mg.cloudfront.net | Old www site |
| `www.diyaccounting.co.uk` | A alias | d2nnnfnriqw5mg.cloudfront.net | Old www site |
| `submit.diyaccounting.co.uk` | A/AAAA alias | prod-e0870bc.submit... → d33kywjjsltxgq.cloudfront.net | Production submit |
| `ci.submit.diyaccounting.co.uk` | A/AAAA alias | ci-compy.submit... (current branch alias) | CI submit latest |
| `ci-compy.submit.diyaccounting.co.uk` | A/AAAA alias | d1pkkfptj3ad67.cloudfront.net | CI branch deployment |
| `ci-auth.submit.diyaccounting.co.uk` | A/AAAA alias | d2d1eszdvffqf1.cloudfront.net | CI Cognito custom domain |
| `prod-auth.submit.diyaccounting.co.uk` | A/AAAA alias | d2esl3swpbay67.cloudfront.net | Prod Cognito custom domain |
| `ci-*.submit.diyaccounting.co.uk` | A/AAAA alias | Various CloudFront distributions | ~15 CI branch deployments |
| `prod-*.submit.diyaccounting.co.uk` | A/AAAA alias | Various CloudFront distributions | ~12 prod version deployments |
| MX | MX | aspmx.l.google.com (+ 4 alternates) | Google Workspace email |
| `diyaccounting.co.uk` | TXT | SPF: include:_spf.google.com include:amazonses.com | Email authentication |
| `google._domainkey.diyaccounting.co.uk` | TXT | DKIM RSA key | Google email signing |
| `webmail.diyaccounting.co.uk` | CNAME | ghs.google.com | Google Workspace webmail |
| `_87ff9...submit.diyaccounting.co.uk` | CNAME | ACM validation | Wildcard cert DNS validation |
| `_3b169...auth.submit.diyaccounting.co.uk` | CNAME | ACM validation | Auth cert DNS validation |

All ci-*/prod-* submit records are created by the submit CDK stacks (via `Route53AliasUpsert.java`) running in the root account.

### Current Certificate

Single wildcard ACM public cert covers all submit subdomains:

**ACM cost note**: All ACM public certificates are free regardless of wildcard or SAN count. When accounts split, each account creates its own free wildcard cert. There is no cost impact.

### Cross-Account CloudFront Alias (Key Technical Detail)

Route53 A/AAAA alias records can point to CloudFront distributions in different AWS accounts. This is fully supported with no IAM cross-account trust needed at DNS resolution time (resolution happens at the DNS level, not via API calls).

Requirements:
- The CloudFront distribution must list the domain as an alternate domain name (CNAME)
- The distribution must have an ACM cert covering that domain (in the same account as the distribution)
- The alias target uses the fixed CloudFront hosted zone ID `Z2FDTNDATAQYW2` (hardcoded in `Route53AliasUpsert.java:25`)
- Console dropdown won't show cross-account distributions; must specify domain name directly in IaC
- No `EvaluateTargetHealth` support for CloudFront alias (same-account or cross-account)

### Option 1 (Phase 1-3): Centralised DNS

All records remain in the root account's Route53 zone. A new `deploy-root.yml` workflow manages gateway DNS records using `Route53AliasUpsert` pattern.

**Phase 1 root zone additions:**
```
ci-gateway.diyaccounting.co.uk      A/AAAA alias → gateway account CloudFront
prod-gateway.diyaccounting.co.uk    A/AAAA alias → gateway account CloudFront
_xxx.ci-gateway.diyaccounting.co.uk CNAME → ACM validation (gateway cert)
_xxx.prod-gateway...                CNAME → ACM validation (gateway cert)
```

### Option 3 (Phase 4+): Delegated Subdomains

The root zone shrinks to approximately 20 stable records. NS delegations are created for product subdomains. Each delegated account manages its own DNS records, ACM validation, and CloudFront alias records independently.

| Subdomain | Delegated To | Hosted Zone Cost | Self-Managing |
|-----------|-------------|-----------------|---------------|
| `submit.diyaccounting.co.uk` | submit-prod account | $0.50/month | CI gets scoped cross-account role for ci-* records only |
| `spreadsheets.diyaccounting.co.uk` | spreadsheets account | $0.50/month | Fully self-managing |

Gateway domains (`diyaccounting.co.uk`, `www.diyaccounting.co.uk`, `ci-gateway.diyaccounting.co.uk`, `prod-gateway.diyaccounting.co.uk`) stay in the root zone because they are at the root level - there is nothing to delegate.

### Option 1 vs Option 3 Comparison

| Criteria | Option 1 (Centralised) | Option 3 (Delegated) |
|----------|----------------------|---------------------|
| Root zone size | 87+ records, grows with branches | ~20 records, stable |
| Hosted zone cost | $0.50/month (1 zone) | $1.50/month (3 zones) |
| ACM cert cost | Free | Free |
| Account self-containment | No - DNS depends on root | Yes - each account manages own subdomain |
| deploy-root.yml scope | Large, grows with CI branches | Small, stable (NS delegations + apex records) |
| Submit deployment coupling | Tight - submit CDK creates records in root zone | Loose - submit CDK creates records in own zone |
| Moving submit to own account | Update 60+ records in root zone | Add 1 NS delegation (4 values), done |
| Bootstrapping new account | Account + deploy-root.yml adds DNS records | Account + create hosted zone + deploy-root.yml adds NS delegation |
| Backup/recovery | Must backup entire zone | Each account backs up own zone; root is trivially recreatable |

**Decision**: Start with Option 1 (phases 1-3, both options are identical for gateway). Transition to Option 3 when spreadsheets account is created (Phase 2 - first delegation) and when submit splits (Phase 4 - second delegation). The root zone naturally shrinks over time.

### Submit Subdomain Split (Phase 4 Detail)

Submit CI and prod will be in **different AWS accounts** sharing the `submit.diyaccounting.co.uk` subdomain:

- `ci-*.submit.diyaccounting.co.uk` → submit-ci account CloudFront distributions
- `ci-auth.submit.diyaccounting.co.uk` → submit-ci account Cognito
- `prod-*.submit.diyaccounting.co.uk` → submit-prod account CloudFront distributions
- `prod-auth.submit.diyaccounting.co.uk` → submit-prod account Cognito
- `submit.diyaccounting.co.uk` → submit-prod account (production apex)

**Resolution**: submit-prod account owns the `submit.diyaccounting.co.uk` hosted zone. submit-ci account gets a scoped cross-account IAM role (`submit-ci-dns-role`) that can only create/update records with `ci-` prefix. This limits blast radius if the CI account is compromised. Each account creates its own `*.submit.diyaccounting.co.uk` ACM wildcard cert (free).

---

## 3. AWS Account Structure

Extends the existing multi-account structure from `PLAN_AWS_ACCOUNTS.md`:

```
AWS Organization Root
+-- submit-management (Organization Admin)
    +-- submit-backup ---------- Backup OU
    +-- submit-ci -------------- Workloads OU  (CI submit deployments)
    +-- submit-prod (887764105431) -- Workloads OU  (prod submit + root DNS for now)
    +-- gateway ---------------- Workloads OU [NEW - Phase 1]
    +-- spreadsheets ----------- Workloads OU [NEW - Phase 2]
```

### Gateway Account Resources

| Resource | Region | Purpose |
|----------|--------|---------|
| S3 bucket | eu-west-2 | Static site origin |
| CloudFront distribution | Global (us-east-1) | CDN |
| ACM certificate | us-east-1 | TLS (pre-created during bootstrap, referenced by ARN) |

**Not in this account**: No Route53 hosted zone (DNS managed in root account via deploy-root.yml). No Lambda, no DynamoDB, no API Gateway, no Cognito. This is a minimal static-site-serving account.

### Account Reference Table (Extended)

| Account | ID | Email | OU | Purpose |
|---------|-----|-------|-----|---------|
| submit-management | TBD | aws-management@diyaccounting.co.uk | Root | Org admin |
| submit-prod | 887764105431 | (existing) | Workloads | Production submit + root DNS (for now) |
| submit-ci | TBD | aws-ci@diyaccounting.co.uk | Workloads | CI submit deployments |
| submit-backup | TBD | aws-backup@diyaccounting.co.uk | Backup | DR |
| gateway | TBD | aws-gateway@diyaccounting.co.uk | Workloads | Gateway static site |
| spreadsheets | TBD | aws-spreadsheets@diyaccounting.co.uk | Workloads | Spreadsheets product |

### Ideal End State

- **Root account**: Billing, AWS Organizations, Route53 zone (small, stable ~20 records), manual operations only
- **All other accounts**: Fully scripted (CDK/GitHub Actions), backed up cross-account (except backup itself), infrastructure under source control, secrets in Secrets Manager (referenced by ARN in source)
- **deploy-root.yml**: Only workflow that touches root account, manages NS delegations and apex/gateway DNS records

---

## 4. Phased Implementation

### Phase 1: Gateway Deployment (CURRENT FOCUS)

| Step | Description | Details |
|------|-------------|---------|
| 1.1 | Create gateway AWS account | Under the organization, in Workloads OU |
| 1.2 | Bootstrap CDK in gateway account | `cdk bootstrap aws://GATEWAY_ACCOUNT/eu-west-2` and `us-east-1` |
| 1.3 | Create OIDC provider + GitHub Actions role | Same pattern as submit-prod: `submit-github-actions-role` trusting GitHub OIDC |
| 1.4 | Create deployment role | `submit-deployment-role` in gateway account, trusted by actions role |
| 1.5 | Create ACM cert (manual, one-time) | Request cert in gateway account us-east-1 for `ci-gateway.diyaccounting.co.uk` and `prod-gateway.diyaccounting.co.uk`. Add DNS validation CNAMEs to root account Route53 zone. Wait for validation. Record ARN in `cdk-gateway/cdk.json`. |
| 1.6 | Build CDK entry point | `GatewayEnvironment.java` (new CDK app in this repo, see Section 6) |
| 1.7 | Build static site content | `web/www.diyaccounting.co.uk/public/` (see Section 7) |
| 1.8 | Build `deploy-gateway.yml` | GitHub Actions workflow for gateway account deployments |
| 1.9 | Build initial `deploy-root.yml` | Manages DNS alias records in root account (see Section 5) |
| 1.10 | Deploy and validate | Verify at `https://ci-gateway.diyaccounting.co.uk` |

**ACM cert approach**: The cert is created manually during account bootstrapping (step 1.5), matching the existing submit pattern where the cert is pre-created and referenced by ARN via `Certificate.fromCertificateArn()`. This avoids the cross-account DNS validation problem: CDK's `DnsValidatedCertificate` would try to create validation records in Route53, but the zone is in a different account. Manual creation is a one-time operation and aligns with the root account being the place for manual operations.

### Phase 2: Spreadsheets Repository & Account

| Step | Description |
|------|-------------|
| 2.1 | Create new repository: `spreadsheets.diyaccounting.co.uk` |
| 2.2 | Create new AWS account under organization |
| 2.3 | Product catalog sourced from `../diy-accounting` (Docker image `ghcr.io/antonycc/diy-accounting:main`, serves zip packages via `/zips/` endpoint, current products: Basic Sole Trader, Company Accounts, Self Employed, Payslip, Taxi Driver) |
| 2.4 | PayPal donation flow adapted from `../www.diyaccounting.co.uk` (PayPal Donate SDK, hosted button ID `XTEQ73HM52QQW`, supports donate-then-download and skip-donation paths) |
| 2.5 | `deploy-root.yml` adds NS delegation for `spreadsheets.diyaccounting.co.uk` (first use of Option 3 delegation) |
| 2.6 | Spreadsheets account fully self-managing (own Route53 zone at $0.50/month, own ACM cert, own CloudFront) |

### Phase 3: Domain Switchover

| Step | Description |
|------|-------------|
| 3.1 | Update gateway ACM cert to include `diyaccounting.co.uk` and `www.diyaccounting.co.uk` (or create new cert with all SANs) |
| 3.2 | Update gateway CloudFront alternate domain names to include `diyaccounting.co.uk` and `www.diyaccounting.co.uk` |
| 3.3 | `deploy-root.yml` updates `diyaccounting.co.uk` A/AAAA alias to gateway account CloudFront (replacing `d2nnnfnriqw5mg.cloudfront.net`) |
| 3.4 | `deploy-root.yml` updates `www.diyaccounting.co.uk` A/AAAA alias to gateway account CloudFront |
| 3.5 | Gateway CloudFront Function handles redirects for known old www.diyaccounting.co.uk URLs |
| 3.6 | Old www CloudFront distribution (`d2nnnfnriqw5mg.cloudfront.net`) decommissioned |

### Phase 4: Submit Account Separation (Future)

| Step | Description |
|------|-------------|
| 4.1 | Create submit-ci account |
| 4.2 | Create submit-prod account (or repurpose existing 887764105431 after moving root concerns out) |
| 4.3 | Each account creates own `*.submit.diyaccounting.co.uk` ACM wildcard cert (free) |
| 4.4 | Create `submit.diyaccounting.co.uk` hosted zone in submit-prod account |
| 4.5 | `deploy-root.yml` adds NS delegation for `submit.diyaccounting.co.uk` → submit-prod hosted zone |
| 4.6 | submit-ci gets scoped cross-account DNS role in submit-prod (`submit-ci-dns-role`, can only manage `ci-*` prefixed records) |
| 4.7 | Cognito custom domains (`ci-auth.submit.diyaccounting.co.uk`, `prod-auth.submit.diyaccounting.co.uk`) covered by respective account wildcard certs |
| 4.8 | Remove old submit DNS records from root zone (replaced by NS delegation) |

---

## 5. deploy-root.yml Design

**Purpose**: Manage all resources that must live in the root AWS account (Route53 zone records, ACM validation CNAMEs). This workflow is the single point of control for root account infrastructure and grows incrementally across phases.

**Trigger**: Manual dispatch only. Runs infrequently - only when DNS/cert records need updating.

**Scope grows over time**:

| Phase | Records Managed |
|-------|----------------|
| Phase 1 | Gateway A/AAAA alias records (ci-gateway, prod-gateway) + ACM validation CNAMEs for gateway cert |
| Phase 2 | + NS delegation for `spreadsheets.diyaccounting.co.uk` (4 NS values) |
| Phase 3 | + Update apex/www alias records (diyaccounting.co.uk and www → gateway CloudFront) + new ACM validation CNAMEs |
| Phase 4 | + NS delegation for `submit.diyaccounting.co.uk` (4 NS values) |

**Implementation**: CDK stack (`RootDnsStack`) for consistency with the rest of the repo. Uses `AwsCustomResource` with `Route53AliasUpsert.upsertAliasToCloudFront()` pattern already proven in production. Requires CDK bootstrap in root account (us-east-1).

**Authentication**: Uses existing OIDC provider and roles in root account (same `submit-github-actions-role` and `submit-deployment-role` already configured for `deploy-environment.yml`).

```yaml
# deploy-root.yml (sketch)
name: deploy root DNS
on:
  workflow_dispatch:
    inputs:
      ci-gateway-cloudfront-domain:
        description: 'CloudFront domain for ci-gateway (e.g. d1234abcdef.cloudfront.net)'
        required: true
      prod-gateway-cloudfront-domain:
        description: 'CloudFront domain for prod-gateway'
        required: false
env:
  ACTIONS_ROLE_ARN: 'arn:aws:iam::887764105431:role/submit-github-actions-role'
  DEPLOY_ROLE_ARN:  'arn:aws:iam::887764105431:role/submit-deployment-role'
  AWS_REGION: 'us-east-1'
jobs:
  deploy-root-dns:
    # ... OIDC auth, CDK deploy RootDnsStack with context params
```

---

## 6. CDK Architecture (in this repo)

### File Structure

```
infra/main/java/co/uk/diyaccounting/submit/
+-- SubmitApplication.java          (existing - submit app stacks)
+-- SubmitEnvironment.java          (existing - submit env stacks)
+-- GatewayEnvironment.java         [NEW - gateway env stacks]
+-- RootEnvironment.java            [NEW - root account DNS management]
+-- stacks/
|   +-- ApexStack.java              (existing - pattern to reuse)
|   +-- GatewayStack.java           [NEW - S3 + CloudFront for gateway]
|   +-- RootDnsStack.java           [NEW - Route53 records in root account]
+-- utils/
    +-- Route53AliasUpsert.java     (existing - reuse for DNS records)
```

### GatewayEnvironment.java

Deploys to the gateway account. Modelled after `SubmitEnvironment.java` but stripped down:

- Single stack: `GatewayStack`
- No observability, data, backup, identity, or simulator stacks
- Reads `cdk-gateway/cdk.json` for context (certificateArn, envName, hostedZoneName)
- Deployed by `deploy-gateway.yml`

### GatewayStack.java

Reuses the `ApexStack` pattern:

| Resource | Configuration |
|----------|--------------|
| S3 bucket | `{env}-gateway-origin`, BLOCK_ALL, S3_MANAGED encryption, DESTROY removal |
| OAC | S3OriginAccessControl, SIGV4_ALWAYS signing |
| CloudFront distribution | S3 origin with OAC, HTTPS redirect, security headers, `defaultRootObject: index.html` |
| ACM certificate | **Pre-created, referenced by ARN** via `Certificate.fromCertificateArn()` (NOT DnsValidatedCertificate - see Section 4 step 1.5) |
| BucketDeployment | From `web/www.diyaccounting.co.uk/public/` |
| CloudFront access logging | CloudWatch Logs delivery (same pattern as ApexStack) |

**Key differences from ApexStack**:
- No Route53 records (those live in root account, managed by RootDnsStack)
- No Lambda function URL integration
- Simpler CSP (no RUM endpoint, no API connections, no Cognito domain)
- Cert referenced by ARN, not created by CDK (cross-account zone problem)

### RootEnvironment.java

Deploys to the root account (887764105431). Manages Route53 records in the `diyaccounting.co.uk` hosted zone.

### RootDnsStack.java

Uses `Route53AliasUpsert.upsertAliasToCloudFront()` to create alias records. CloudFront distribution domain names are passed as CDK context parameters (manually provided via `deploy-root.yml` workflow dispatch inputs after `deploy-gateway.yml` outputs them).

**Phase 1 records:**

| Record | Type | Target |
|--------|------|--------|
| `ci-gateway.diyaccounting.co.uk` | A/AAAA alias | Gateway account CloudFront domain |
| `prod-gateway.diyaccounting.co.uk` | A/AAAA alias | Gateway account CloudFront domain |

### CDK Application Directories

| Directory | Entry Point | Deploys To | Workflow |
|-----------|-------------|------------|----------|
| `cdk-environment/` | `SubmitEnvironment.java` | Root account (submit env stacks) | `deploy-environment.yml` |
| `cdk-application/` | `SubmitApplication.java` | Root account (submit app stacks) | `deploy-environment.yml` |
| `cdk-gateway/` | `GatewayEnvironment.java` | Gateway account | `deploy-gateway.yml` [NEW] |
| `cdk-root/` | `RootEnvironment.java` | Root account (DNS records) | `deploy-root.yml` [NEW] |

---

## 7. Static Site Content Structure

```
web/www.diyaccounting.co.uk/
+-- public/
    +-- index.html              (gateway portal - 3 buttons + company summary)
    +-- about.html              (corporate identity page)
    +-- .well-known/
    |   +-- security.txt
    +-- robots.txt
    +-- sitemap.xml
    +-- gateway.css             (subset of submit.css)
    +-- favicon.ico
    +-- favicon.svg
    +-- favicon-32.png
    +-- favicon-16.png
    +-- apple-touch-icon.png
```

No JavaScript is needed. The gateway is pure static HTML/CSS.

### gateway.css

Extracted subset of `submit.css` (2,112 lines → ~200-300 lines) containing:

- CSS custom properties (design tokens: brand colours, typography, spacing, shadows, radii)
- Reset and base styles (`*`, `html`, `body`)
- Typography headings (`h1`, `h2`, `p`)
- Skip link for accessibility (`.skip-link`)
- Link and focus styles (WCAG 2.1 AA compliant, focus colour `#005ea5`)
- Footer styles (`.footer-content`, `.footer-left`, `.footer-center`, `.footer-right`)
- Button/card styles for the three stacked buttons
- Responsive media queries for mobile (600px breakpoint)

**Excluded**: Auth section, form controls, input styles, spinner, receipt styles, simulator styles, developer controls, FAQ/collapsible styles, modal/lightbox styles, data tables, activity card styles, spreadsheet grid effect.

---

## 8. Companies Act 2006 Compliance (about.html)

### Required Information

The Companies Act 2006 (ss 82-85) and Electronic Commerce Regulations 2002 require the following on business websites:

| Item | Value |
|------|-------|
| Company name | DIY Accounting Limited |
| Registered number | 06846849 |
| Place of registration | England and Wales |
| Registered address | 37 Sutherland Avenue, Leeds, LS8 1BY |
| VAT number | (if VAT-registered) |

### about.html Content

The `about.html` page is self-contained (not a redirect to submit's `diy-accounting-limited.html`). Content is sourced from the existing page on submit but maintained independently at "era timescale" - updated when company details change (new directors, address change), not with every product update.

| Section | Content |
|---------|---------|
| Company overview | DIY Accounting Limited managed by the family of founder Terry Cartwright since January 2010 |
| Directors | Antony Cartwright, Jane Grundy, Samantha Cartwright |
| Founder history | Terry Cartwright (ACMA, ACIS) - qualified 1971, founded DIY Accounting 2006, passed away December 2009 |
| Children/management | Antony, Jane, Samantha, Lindsey, Daniel |
| Companies House link | https://find-and-update.company-information.service.gov.uk/company/06846849 |
| Contact phone | 0845 0756015 (UK) / +44 845 075 6015 (International) |
| Address | 37 Sutherland Avenue, Leeds, LS8 1BY, United Kingdom |
| Company status | Active, Private limited Company, incorporated 13 March 2009 |
| SIC code | 47910 - Retail sale via mail order houses or via Internet |
| Schema.org JSON-LD | Organization markup (see below) |

### Schema.org JSON-LD Markup

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "DIY Accounting Limited",
  "url": "https://diyaccounting.co.uk",
  "logo": "https://submit.diyaccounting.co.uk/images/company/diyaccounting-label-logo-white-bk.png",
  "foundingDate": "2006",
  "founder": {
    "@type": "Person",
    "name": "Terry Cartwright"
  },
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "37 Sutherland Avenue",
    "addressLocality": "Leeds",
    "postalCode": "LS8 1BY",
    "addressCountry": "GB"
  },
  "telephone": "+448450756015",
  "sameAs": [
    "https://find-and-update.company-information.service.gov.uk/company/06846849"
  ],
  "subOrganization": [
    {
      "@type": "WebApplication",
      "name": "DIY Accounting Submit",
      "url": "https://submit.diyaccounting.co.uk",
      "description": "Submit UK VAT returns to HMRC under Making Tax Digital (MTD)"
    },
    {
      "@type": "SoftwareApplication",
      "name": "DIY Accounting Spreadsheets",
      "url": "https://spreadsheets.diyaccounting.co.uk",
      "description": "Excel bookkeeping and accounting software for UK small businesses"
    }
  ]
}
```

---

## 9. Account Provisioning Scripts

New scripts for creating and bootstrapping AWS accounts. The gateway account is the first test of this pattern, which will be reused for spreadsheets and future accounts.

```
scripts/
+-- aws-create-gateway-account.sh      [NEW]
+-- aws-bootstrap-gateway-account.sh   [NEW]
+-- aws-assume-gateway-role.sh         [NEW]
+-- aws-assume-submit-deployment-role.sh   (existing, unchanged)
+-- aws-assume-user-provisioning-role.sh   (existing, unchanged)
+-- aws-unset-iam-session.sh               (existing, unchanged)
```

### aws-create-gateway-account.sh

Creates the gateway account under the organization and moves it to the Workloads OU:

```bash
# Creates account
aws organizations create-account \
  --account-name "gateway" \
  --email "aws-gateway@diyaccounting.co.uk" \
  --iam-user-access-to-billing ALLOW

# Wait for account creation, then move to Workloads OU
# Record account ID in PLAN_AWS_ACCOUNTS.md and cdk-gateway/cdk.json
```

### aws-bootstrap-gateway-account.sh

Performs initial setup in the gateway account (assumes role into the new account first):

1. CDK bootstrap (`cdk bootstrap aws://GATEWAY_ACCOUNT/eu-west-2` and `us-east-1`)
2. Create GitHub OIDC provider (trusting `token.actions.githubusercontent.com`)
3. Create `submit-github-actions-role` (trusted by GitHub OIDC for `antonycc/submit.diyaccounting.co.uk` repo)
4. Create `submit-deployment-role` (trusted by `submit-github-actions-role`)
5. **Create ACM cert** in us-east-1 for `ci-gateway.diyaccounting.co.uk` and `prod-gateway.diyaccounting.co.uk`
6. Output the DNS validation CNAMEs (to be added to root account Route53 zone manually)
7. Wait for cert validation
8. Output the cert ARN (to be recorded in `cdk-gateway/cdk.json`)

### aws-assume-gateway-role.sh

Local developer access to gateway account:

```bash
# Usage: . ./scripts/aws-assume-gateway-role.sh
ROLE_ARN="arn:aws:iam::GATEWAY_ACCOUNT_ID:role/submit-deployment-role"
# ... STS assume-role, export AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN
```

---

## 10. Neighbouring Repository Context

For reference when working on phases 2-3:

### diy-accounting (../diy-accounting)

- **Purpose**: Open-source Excel spreadsheets (MPL 2.0)
- **Products**: Basic Sole Trader, Company Accounts, Self Employed, Payslip, Taxi Driver (plus Business Insurance, Employee Expenses, Invoice Generator, SE Extra filtered from public web)
- **Build**: `build.sh` → creates zip packages in `build/` directory (503 MB total)
- **Distribution**: Docker image `ghcr.io/antonycc/diy-accounting:main` serving `/zips/` endpoint via nginx
- **Catalogue**: `packages.txt` lists available downloads
- **GitHub funding**: PayPal button `XTEQ73HM52QQW` via `.github/FUNDING.yml`
- **Active**: 50 commits, monthly year-end releases (up to July 2026)

### www.diyaccounting.co.uk (../www.diyaccounting.co.uk)

- **Purpose**: Legacy static mirror of original Java Spring app
- **Size**: 749 MB mirrored content
- **Architecture**: Three Docker containers (content MDCMS, catalogue from diy-accounting, web app) + nginx proxy → wget crawl → static S3 site
- **Infrastructure**: Terraform/Terragrunt modules for S3 + CloudFront + Route53 (stage and live environments)
- **PayPal flow**: Donate SDK integration, supports `hosted_button_id` and `business` account modes, donate-then-download and skip-donation paths
- **Status**: Infrastructure ready but S3 sync not automated in CI/CD. 45 commits, last July 2025.
- **Key pages**: home, products, product detail, download, donate (donatepaypal.html), about, contact, articles, support, history
- **Current CloudFront**: `d2nnnfnriqw5mg.cloudfront.net` (will be replaced by gateway in Phase 3)

---

## 11. Open Items / Future Considerations

| Item | Status | Notes |
|------|--------|-------|
| Spreadsheets tagline | **Confirmed** | "Excel bookkeeping and accounting software for UK small businesses" |
| Old www redirect mapping (Phase 3) | TBD | List of specific URLs from old www.diyaccounting.co.uk that need 301 redirects. Gateway CloudFront Function will handle individual redirects. Can tolerate many individual redirects. |
| DMARC/BIMI email authentication | Future | Enhancement for email deliverability and brand protection. Already have SPF and DKIM. |
| `.well-known/security.txt` contact | TBD | Security contact email/URL to be determined |
| about.html content depth | **Decided** | Self-contained page at "era timescale". Not a redirect to submit's page. |
| Gateway account ID | Pending | Will be populated after account creation (Step 1.1) |
| Spreadsheets account ID | Pending | Will be populated after Phase 2 |
| Cost estimate for gateway | Estimated | S3 + CloudFront for static site: ~$1-5/month. Hosted zone $0 (no zone in gateway account). |
| Whether gateway needs WAF | TBD | Static site with no user input may not need WAF. |
| Shared favicons strategy | TBD | Whether gateway, submit, and spreadsheets share identical favicons or have distinct variants |
| Old www.diyaccounting.co.uk new site | Phase 2-3 | Will be rebuilt as a new site with product structure embedded in spreadsheets.diyaccounting.co.uk, not a simple redirect. Large amount of content to organise. |
| Friendly note for spreadsheet customers | Phase 2 | Gateway or spreadsheets site should include a friendly note (perhaps with a picture of existing spreadsheets) to help existing customers find their way |
| DNS zone future | Phase 4+ | Consider whether to keep zone in root account permanently or move it. Root account is correct place for now. Certs may also stay in root for apex domain. |

---

*Generated: February 2026*

---

```
Updated account/DNS map with all of this factored in

  Phase 1 (now): Gateway deployment

  Root account (887764105431) - Route53 zone: diyaccounting.co.uk
  ├── diyaccounting.co.uk           A alias → d2nnnfnriqw5mg.cloudfront.net (old www, unchanged)
  ├── www.diyaccounting.co.uk       A alias → d2nnnfnriqw5mg.cloudfront.net (unchanged)
  ├── ci-gateway.diyaccounting.co.uk    A/AAAA alias → gateway account CF  [NEW via deploy-root.yml]
  ├── prod-gateway.diyaccounting.co.uk  A/AAAA alias → gateway account CF  [NEW via deploy-root.yml]
  ├── _xxx.ci-gateway...            CNAME → ACM validation [NEW via deploy-root.yml]
  ├── _xxx.prod-gateway...          CNAME → ACM validation [NEW via deploy-root.yml]
  ├── submit.diyaccounting.co.uk    A/AAAA alias → prod submit CF (unchanged)
  ├── *.submit.diyaccounting.co.uk  (all ci-*/prod-* records, unchanged)
  ├── MX, SPF, DKIM                 (email, unchanged)
  └── webmail CNAME                 (unchanged)

  Gateway account [NEW]
  ├── ACM: ci-gateway.diyaccounting.co.uk, prod-gateway.diyaccounting.co.uk
  ├── CloudFront: 2 distributions
  └── S3: 2 origins (ci + prod static sites)

  Phase 2: Spreadsheets account + delegation

  Root account zone: diyaccounting.co.uk
  ├── (all phase 1 records)
  ├── spreadsheets.diyaccounting.co.uk  NS → spreadsheets account  [NEW, Option 3 delegation]
  └── (submit records still here, unchanged)

  Spreadsheets account [NEW]
  ├── Route53 zone: spreadsheets.diyaccounting.co.uk ($0.50/mo)
  ├── ACM: spreadsheets.diyaccounting.co.uk (self-validated in own zone)
  ├── CloudFront + S3
  └── Fully self-managing

  Phase 3: Switch apex + www to gateway

  Root account zone: diyaccounting.co.uk
  ├── diyaccounting.co.uk           A/AAAA alias → gateway account CF  [UPDATED by deploy-root.yml]
  ├── www.diyaccounting.co.uk       A/AAAA alias → gateway account CF  [UPDATED by deploy-root.yml]
  ├── (gateway records from phase 1)
  ├── (spreadsheets delegation from phase 2)
  ├── (submit records still here)
  ├── (redirects for old www URLs handled by gateway CloudFront Function)
  └── (email records unchanged)

  Phase 4 (future): Submit splits to ci + prod accounts, delegation

  Root account zone: diyaccounting.co.uk (~20 records, stable)
  ├── diyaccounting.co.uk           A/AAAA alias → gateway CF
  ├── www.diyaccounting.co.uk       A/AAAA alias → gateway CF
  ├── ci-gateway, prod-gateway      A/AAAA alias → gateway CF
  ├── submit.diyaccounting.co.uk    NS → submit-prod account  [Option 3 delegation]
  ├── spreadsheets.diyaccounting.co.uk  NS → spreadsheets account
  ├── MX, SPF, DKIM, webmail        (email)
  └── ACM validation CNAMEs         (for gateway certs only)

  Submit-prod account
  ├── Route53 zone: submit.diyaccounting.co.uk ($0.50/mo)
  │   ├── submit.diyaccounting.co.uk       A/AAAA alias → prod CF
  │   ├── prod-auth.submit...              A/AAAA → Cognito CF
  │   ├── prod-*.submit...                 A/AAAA → prod version CFs
  │   ├── ci-*.submit...                   A/AAAA → ci account CFs [cross-account alias]
  │   ├── ci-auth.submit...                A/AAAA → ci Cognito CF  [cross-account alias]
  │   └── ACM validation CNAMEs            (for both prod and ci certs)
  ├── ACM: *.submit.diyaccounting.co.uk (prod cert)
  ├── CloudFront, Lambda, API GW, DynamoDB, Cognito
  └── IAM role: submit-ci-dns-role (scoped to ci-* record names only)

  Submit-ci account
  ├── NO hosted zone (uses submit-prod's via cross-account role)
  ├── ACM: *.submit.diyaccounting.co.uk (ci cert, validation via submit-prod zone)
  ├── CloudFront, Lambda, API GW, DynamoDB, Cognito (all CI)
  └── Assumes submit-ci-dns-role in submit-prod for DNS record management

  End state: Root account

  Root account (887764105431)
  ├── AWS Organizations (billing, SCPs)
  ├── Route53: diyaccounting.co.uk (small, stable zone)
  │   ├── Apex + www → gateway CF
  │   ├── NS delegations → product accounts
  │   ├── Email records (MX, SPF, DKIM)
  │   └── Gateway DNS records
  ├── deploy-root.yml: manages this zone + account bootstrapping
  ├── Manual operations only
  └── Nothing else

  Summary of what this adds to the plan

  1. Wildcard cert splits are free - each account creates its own *.submit.diyaccounting.co.uk ACM cert
  2. Submit delegation goes to submit-prod - CI gets a scoped cross-account DNS role for ci-* prefixed records
  3. Spreadsheets delegation is clean - single account, single zone, fully self-contained
  4. Gateway has no delegation - its domains are at the root level, always managed by deploy-root.yml
  5. Phase 4 is when the complexity lands - phases 1-3 are straightforward

```
