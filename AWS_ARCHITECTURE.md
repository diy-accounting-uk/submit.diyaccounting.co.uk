# DIY Accounting Submit - AWS Architecture

**Version**: 3.1
**Date**: February 2026
**Status**: Production

---

## Executive Summary

DIY Accounting Submit is a serverless web application enabling UK businesses to submit VAT returns directly to HMRC via the Making Tax Digital (MTD) API. The architecture leverages AWS services for scalability, security, and cost-efficiency.

**Key Characteristics:**
- Fully serverless (no EC2 instances)
- Multi-account AWS Organization (6 accounts) for security isolation
- Infrastructure as Code (AWS CDK in Java)
- CI/CD via GitHub Actions with OIDC authentication

---

## 1. Multi-Account Structure

### 1.1 Account Overview

```
AWS Organization Root (887764105431) ── Management
├── gateway ─────────── Workloads OU
├── spreadsheets ────── Workloads OU
├── submit-ci ──────────── Workloads OU
├── submit-prod ─────────── Workloads OU
├── submit-backup ─────── Backup OU
```

887764105431 is the **management account** and contains only: AWS Organizations, IAM Identity Center, Route53 zone (`diyaccounting.co.uk`), consolidated billing, root DNS stack, and holding page. No application workloads.

### 1.2 Account Responsibilities

| Account | ID | Purpose | Repository | Contains |
|---------|-----|---------|------------|----------|
| **management** | 887764105431 | Organization administration | `support-at-diyaccounting/root.diyaccounting.co.uk` | IAM Identity Center, Organizations, Route53, consolidated billing, root DNS, holding page |
| **gateway** | 283165661847 | Gateway static site | `support-at-diyaccounting/www.diyaccounting.co.uk` | CloudFront, S3, CloudFront Functions (redirects) |
| **spreadsheets** | 064390746177 | Spreadsheets static site | `support-at-diyaccounting/spreadsheets.diyaccounting.co.uk` | CloudFront, S3, package hosting |
| **submit-ci** | 367191799875 | Submit CI/CD testing | `support-at-diyaccounting/submit.diyaccounting.co.uk` | Full submit stack with test data, HMRC sandbox |
| **submit-prod** | 972912397388 | Submit production | `support-at-diyaccounting/submit.diyaccounting.co.uk` | Full submit stack with live data, HMRC production |
| **submit-backup** | 914216784828 | Backup isolation | — | Cross-account backup vault (planned) |

### 1.3 Why This Topology

**Why 6 accounts (not 1, 3, or 5)?**

| Question | Answer |
|----------|--------|
| Why not single account? | CI can interfere with prod, backups not isolated (ransomware risk), IAM clutter, unclear cost attribution |
| Why not 3 (management + ci + prod)? | No backup isolation, gateway/spreadsheets mixed with submit |
| Why separate gateway and spreadsheets? | Each service deploys independently; separate repos post-separation |
| Why dedicated backup account? | Critical for ransomware protection — compromised prod cannot delete backups |
| Why dedicated management? | AWS best practice; no workloads in management. Proves IaC repeatability. |
| Why not Control Tower? | Too complex for single developer; easy to add later |

**AWS Well-Architected Alignment:**

| Pillar | Score | Key Implementation |
|--------|-------|--------------------|
| Security | 7/7 | Account isolation, centralized SSO, backup separation |
| Operational Excellence | 4/4 | IaC (CDK), automated CI/CD, clear ownership |
| Reliability | 5/5 | Account-level fault isolation, cross-account backup |
| Cost Optimization | 4/4 | Consolidated billing, per-account visibility |
| Performance | 2/2 | Consistent architecture, per-account metrics |
| Sustainability | 2/2 | eu-west-2 (low-carbon), on-demand CI |

### 1.4 Security Rationale

Account boundaries provide the strongest isolation AWS offers:

- **CI cannot affect prod** — separate accounts, separate IAM, separate service limits
- **Compromised prod cannot delete backups** — backup vault in different account with separate credentials
- **Gateway/spreadsheets isolation** — static sites cannot access submit data
- **Management account is clean** — minimal attack surface, no application code

### 1.5 Console Access

IAM Identity Center provides single sign-on across all accounts:

- One SSO portal URL (`https://d-9c67480c02.awsapps.com/start/`)
- One set of credentials with MFA
- Click to access any account with assigned permission set
- AWS CLI SSO profiles for programmatic access

See `_developers/aws-multi-account/IAM_IDENTITY_CENTER.md` for setup details.

---

## 2. Application Architecture

### 2.1 High-Level Overview

```mermaid
graph TB
    subgraph users["Users"]
        browser["Web Browser"]
    end

    subgraph edge["Edge Layer"]
        cf["CloudFront CDN"]
        waf["WAF"]
    end

    subgraph api["API Layer"]
        apigw["API Gateway"]
        auth["Custom Authorizer<br/>Lambda"]
    end

    subgraph compute["Compute Layer"]
        vatGet["VAT Obligations<br/>Lambda"]
        vatPost["VAT Submit<br/>Lambda"]
        vatView["VAT View<br/>Lambda"]
        tokenMgr["Token Manager<br/>Lambda"]
    end

    subgraph data["Data Layer"]
        dynamo["DynamoDB"]
        secrets["Secrets Manager"]
    end

    subgraph external["External Services"]
        hmrc["HMRC MTD API"]
        cognito["Cognito<br/>User Pools"]
    end

    browser --> cf
    cf --> waf
    waf --> apigw
    apigw --> auth
    auth --> cognito
    apigw --> vatGet
    apigw --> vatPost
    apigw --> vatView
    vatGet --> dynamo
    vatPost --> dynamo
    vatGet --> hmrc
    vatPost --> hmrc
    tokenMgr --> secrets
    tokenMgr --> hmrc

    style cf fill:#ff9800
    style apigw fill:#7b1fa2,color:#fff
    style dynamo fill:#2196f3,color:#fff
    style hmrc fill:#00695c,color:#fff
```

### 2.2 Request Flow

```mermaid
sequenceDiagram
    participant U as User Browser
    participant CF as CloudFront
    participant AG as API Gateway
    participant AU as Authorizer
    participant L as Lambda
    participant DB as DynamoDB
    participant H as HMRC API

    U->>CF: GET /api/vat/obligations
    CF->>AG: Forward Request
    AG->>AU: Validate JWT
    AU->>AG: Allow/Deny
    AG->>L: Invoke Function
    L->>DB: Get User Tokens
    L->>H: Fetch Obligations
    H->>L: Return Data
    L->>AG: JSON Response
    AG->>CF: Response
    CF->>U: Display Obligations
```

---

## 3. Service Components

### 3.1 Edge Layer

| Service | Purpose | Configuration |
|---------|---------|---------------|
| Route 53 | DNS management | `diyaccounting.co.uk` zone in management account (887764105431) |
| CloudFront | Content delivery | Origin: S3 + API Gateway |
| WAF | Web firewall | Rate limiting, SQL injection protection |
| Lambda@Edge | Security headers | CSP, HSTS, X-Frame-Options |
| ACM | SSL/TLS | Per-account certificates, DNS validation via management Route53 |

### 3.2 API Layer

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/vat/obligations` | GET | Fetch VAT obligations from HMRC |
| `/api/vat/return` | POST | Submit VAT return to HMRC |
| `/api/vat/return` | GET | View submitted returns |
| `/api/auth/token` | POST | Exchange Cognito token |
| `/api/account/bundles` | GET | User subscription info |
| `/api/billing/*` | Various | Stripe payment integration |

### 3.3 Compute Layer (Lambda Functions)

| Function | Purpose | Trigger | Memory |
|----------|---------|---------|--------|
| `customAuthorizer` | JWT validation | API Gateway | 256 MB (PC) |
| `hmrcVatObligationsGet` | Fetch VAT obligations | API Gateway (async) | 1024 MB |
| `hmrcVatReturnPost` | Submit VAT return | API Gateway (async) | 256 MB (PC) |
| `hmrcVatReturnGet` | View submitted returns | API Gateway (async) | 1024 MB |
| `hmrcTokenRefresh` | OAuth token refresh | EventBridge (scheduled) | 1024 MB |
| `accountBundlesGet` | User subscription info | API Gateway | 256 MB (PC) |
| `cognitoTokenPost` | Cognito token exchange | API Gateway | 256 MB (PC) |
| `securityHeaders` | Add security headers | CloudFront (Lambda@Edge) | 128 MB |

PC = Provisioned Concurrency (always warm). See `AWS_COSTS.md` for memory sizing rationale.

### 3.4 Data Layer

| Table | Purpose | Backup |
|-------|---------|--------|
| `submit-bundles` | User subscriptions + salt backup | PITR + cross-account |
| `submit-receipts` | HMRC submission receipts (7-year TTL) | PITR + cross-account |
| `submit-hmrc-api-requests` | HMRC API audit log | PITR |
| `async-requests` (5 tables) | Async request correlation (1-hour TTL) | None (ephemeral) |

**Salt architecture**: The user sub hash salt is stored as a multi-version JSON registry in Secrets Manager. Each DynamoDB item includes a `saltVersion` field. A KMS key encrypts a backup copy of the salt stored as a `system#config` item in the bundles table (recovery Path 3). During account separation, this KMS key must be accessible for cross-account salt restoration.

---

## 4. Security Architecture

### 4.1 Authentication Flow

```mermaid
sequenceDiagram
    participant U as User
    participant A as App
    participant C as Cognito
    participant H as HMRC OAuth

    U->>A: Click "Connect to HMRC"
    A->>H: Redirect to HMRC Login
    U->>H: Enter Credentials
    H->>A: Authorization Code
    A->>H: Exchange for Tokens
    H->>A: Access + Refresh Tokens
    A->>C: Create/Update User Session
    C->>A: JWT Token
    A->>U: Logged In
```

### 4.2 IAM Role Chain (GitHub Actions)

Each workload account has its own OIDC provider and role chain:

```
GitHub Actions OIDC Token
  → token.actions.githubusercontent.com (OIDC Provider in target account)
    → github-actions-role (AssumeRoleWithWebIdentity)
      → deployment-role (AssumeRole, used by CDK)
        → CloudFormation (deploys stacks)
```

Each account's OIDC trust is scoped to its own repository:

| Account | OIDC Trust |
|---------|-----------|
| management (887764105431) | `repo:support-at-diyaccounting/root.diyaccounting.co.uk:*` |
| gateway (283165661847) | `repo:support-at-diyaccounting/www.diyaccounting.co.uk:*` |
| spreadsheets (064390746177) | `repo:support-at-diyaccounting/spreadsheets.diyaccounting.co.uk:*` |
| submit-ci (367191799875) | `repo:support-at-diyaccounting/submit.diyaccounting.co.uk:*` |
| submit-prod (972912397388) | `repo:support-at-diyaccounting/submit.diyaccounting.co.uk:*` |

### 4.3 Network Security

| Control | Implementation |
|---------|----------------|
| **Encryption in Transit** | TLS 1.2+ enforced everywhere |
| **Encryption at Rest** | DynamoDB encryption, S3 SSE |
| **WAF Rules** | Rate limiting, SQL injection, XSS protection |
| **Security Headers** | CSP, HSTS, X-Content-Type-Options |
| **API Authentication** | JWT tokens via Cognito |
| **Secrets** | AWS Secrets Manager (no hardcoded credentials) |

---

## 5. Backup & Disaster Recovery

### 5.1 Backup Architecture

**Current state**: Local backup vaults in each submit account with PITR on data tables. Cross-account backup shipping to submit-backup (914216784828) is planned — see `AWS_CROSS_ACCOUNT_BACKUPS.md`.

```
submit-prod (972912397388)     submit-backup (914216784828)
  DynamoDB tables ──────────→  Cross-account vault (planned)
  (PITR + daily backup)        (90-day retention)

submit-ci (367191799875)       submit-backup (914216784828)
  DynamoDB tables ──────────→  Cross-account vault (planned)
  (PITR + daily backup)
```

### 5.2 Recovery Objectives

| Metric | Target | Implementation |
|--------|--------|----------------|
| **RPO** (Recovery Point Objective) | < 24 hours | Daily backups + PITR |
| **RTO** (Recovery Time Objective) | < 4 hours | Automated restore scripts |
| **Backup Retention** | 90 days | Cross-account vault |

### 5.3 Disaster Recovery Strategy

IaC repeatability is proven by the account separation itself (Phase 1.4): submit-prod is deployed fresh to a new account from code + backups + salt. This validates that total account loss is recoverable.

---

## 6. CI/CD Pipeline

### 6.1 Deployment Flow

```mermaid
graph LR
    subgraph dev["Development"]
        code["Code Change"]
        pr["Pull Request"]
    end

    subgraph ci["CI Pipeline"]
        test["Unit Tests"]
        lint["Linting"]
        build["CDK Synth"]
    end

    subgraph deploy_ci["Deploy to CI"]
        ci_stack["submit-ci Account"]
        e2e["E2E Tests"]
    end

    subgraph deploy_prod["Deploy to Prod"]
        approval["Merge to main"]
        prod_stack["submit-prod Account"]
    end

    code --> pr
    pr --> test
    test --> lint
    lint --> build
    build --> ci_stack
    ci_stack --> e2e
    e2e --> approval
    approval --> prod_stack

    style ci_stack fill:#fff3e0
    style prod_stack fill:#c8e6c9
```

### 6.2 Environment Mapping

| Git Branch | Target Account | Environment |
|------------|----------------|-------------|
| `feature/*`, `claude/*` | submit-ci | Development/Testing |
| `main` | submit-prod | Production |

### 6.3 Multi-Site Deployments

Each site is deployed from its own repository:

| Site | Repository | Workflow | Target Account |
|------|-----------|----------|----------------|
| submit.diyaccounting.co.uk | `support-at-diyaccounting/submit.diyaccounting.co.uk` | `deploy.yml` | submit-ci (367191799875) / submit-prod (972912397388) |
| diyaccounting.co.uk (gateway) | `support-at-diyaccounting/www.diyaccounting.co.uk` | `deploy.yml` | gateway (283165661847) |
| spreadsheets.diyaccounting.co.uk | `support-at-diyaccounting/spreadsheets.diyaccounting.co.uk` | `deploy.yml` | spreadsheets (064390746177) |
| Root DNS + holding page | `support-at-diyaccounting/root.diyaccounting.co.uk` | `deploy.yml` | management (887764105431) |

---

## 7. Monitoring & Observability

### 7.1 Key Metrics

| Metric | Threshold | Action |
|--------|-----------|--------|
| Lambda Errors | > 5% | Alert |
| API Latency (p99) | > 3s | Alert |
| DynamoDB Throttling | Any | Alert |
| 4xx Error Rate | > 10% | Alert |
| 5xx Error Rate | > 1% | Alert + Page |

### 7.2 Synthetics

2 canary checks run every 51 minutes (health check + API check). See `AWS_COSTS.md` for interval rationale.

---

## 8. Cost

See **`AWS_COSTS.md`** for detailed cost analysis including:
- Multi-account consolidated billing and free tier implications
- Per-service cost breakdown with actuals
- Per-user marginal cost scaling
- Optimization strategies and projections

---

## 9. Compliance

| Requirement | Implementation |
|-------------|----------------|
| **GDPR** | Data in eu-west-2, encryption, audit logs, PII only in submit-prod |
| **HMRC MTD** | Fraud prevention headers, secure token storage |
| **WCAG 2.2 AA** | Accessible UI, tested with axe-core |
| **OWASP Top 10** | WAF rules, security headers, input validation |

All API calls logged to CloudWatch with timestamp, user identity (masked), action, resource, and source IP (anonymized).

---

## 10. Infrastructure as Code

### 10.1 CDK Applications

This repository contains the submit application CDK:

| CDK App | Directory | Purpose |
|---------|-----------|---------|
| Application | `cdk-application/` | Per-deployment submit stacks (Auth, HMRC, Account, Billing, Api, Edge, etc.) |
| Environment | `cdk-environment/` | Per-environment shared stacks (Identity, Data, Observability) |

Gateway and spreadsheets CDK stacks are in their own repositories:

| CDK App | Repository | Purpose |
|---------|-----------|---------|
| Gateway | `support-at-diyaccounting/www.diyaccounting.co.uk` | S3 + CloudFront + CloudFront Function redirects |
| Spreadsheets | `support-at-diyaccounting/spreadsheets.diyaccounting.co.uk` | S3 + CloudFront + package hosting |
| Root DNS | `support-at-diyaccounting/root.diyaccounting.co.uk` | Route53 alias records + holding page |

### 10.2 Stack Naming

- Environment stacks: `{env}-env-{StackName}` (e.g., `ci-env-IdentityStack`, `prod-env-DataStack`)
- Application stacks: `{deployment}-app-{StackName}` (e.g., `ci-cleanlogin-app-AuthStack`)

---

## Appendix A: AWS Service Inventory

| Service | Region | Account (ID) | Purpose |
|---------|--------|---------|---------|
| Organizations | Global | management (887764105431) | Account management |
| IAM Identity Center | eu-west-2 | management (887764105431) | SSO |
| Route 53 | Global | management (887764105431) | DNS for all sites |
| CloudFront | Global | gateway (283165661847) | Gateway CDN |
| CloudFront | Global | spreadsheets (064390746177) | Spreadsheets CDN |
| CloudFront | Global | submit-prod (972912397388) / submit-ci (367191799875) | Submit CDN + holding page |
| ACM | us-east-1 | Each workload account | SSL certificates (DNS validated via management Route53) |
| WAF | us-east-1 | submit-prod (972912397388) / submit-ci (367191799875) | Web firewall |
| API Gateway | eu-west-2 | submit-prod (972912397388) / submit-ci (367191799875) | HTTP API v2 |
| Lambda | eu-west-2, us-east-1 | submit-prod (972912397388) / submit-ci (367191799875) | Compute (ARM64) |
| DynamoDB | eu-west-2 | submit-prod (972912397388) / submit-ci (367191799875) | Database (on-demand) |
| Cognito | eu-west-2 | submit-prod (972912397388) / submit-ci (367191799875) | Authentication |
| Secrets Manager | eu-west-2 | submit-prod (972912397388) / submit-ci (367191799875) | Credentials |
| S3 | eu-west-2 | Each workload account | Static assets + CDK assets |
| CloudWatch | eu-west-2 | Each workload account | Monitoring, alarms, RUM, synthetics |
| AWS Backup | eu-west-2 | submit-prod (972912397388) | Local vault (cross-account planned) |
| ECR | eu-west-2, us-east-1 | submit-prod (972912397388) / submit-ci (367191799875) | Docker images |
| CloudTrail | eu-west-2 | submit-prod (972912397388) / submit-ci (367191799875) | API audit logging |

---

## Appendix B: Network Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│               Route 53 — management (887764105431)                          │
│                    *.diyaccounting.co.uk                                    │
└─────────────────────────────────────────────────────────────────────────────┘
           │                    │                        │
           ▼                    ▼                        ▼
  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────────┐
  │ gateway      │    │ spreadsheets     │    │ submit-prod          │
  │ 283165661847 │    │ 064390746177     │    │ 972912397388         │
  │ CloudFront   │    │ CloudFront       │    │ CloudFront + WAF     │
  │   ↓          │    │   ↓              │    │   ↓            ↓     │
  │ S3 (static)  │    │ S3 (static +     │    │ S3 (static) API GW  │
  │              │    │    packages)      │    │              ↓      │
  └──────────────┘    └──────────────────┘    │         Authorizer   │
                                              │              ↓      │
                                              │         Lambda fns   │
                                              │          ↓      ↓   │
                                              │      DynamoDB  HMRC │
                                              └──────────────────────┘
```

---

*Document updated: February 2026*
*Architecture version: 3.1 (Multi-Account, Multi-Repo — 6 accounts, 4 repositories)*
