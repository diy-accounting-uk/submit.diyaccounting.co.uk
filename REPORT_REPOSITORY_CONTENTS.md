# DIY Accounting Submit - Repository Documentation

**Generated:** 2026-02-22

This document provides a high-level overview of the `submit.diyaccounting.co.uk` repository. For detailed reference, consult the source files directly.

## Table of Contents

1. [Repository Overview](#repository-overview)
2. [Environment Configuration](#environment-configuration)
3. [Build and Test Commands](#build-and-test-commands)
4. [AWS Deployment Architecture](#aws-deployment-architecture)
5. [Local Development](#local-development)
6. [Directory Structure](#directory-structure)

## Repository Overview

**DIY Accounting Submit** is a full-stack serverless application for submitting UK VAT returns via HMRC's Making Tax Digital (MTD) APIs.

### Technology Stack

| Component | Technology |
|-----------|------------|
| **Frontend** | Static HTML/CSS/JavaScript served via CloudFront + S3 |
| **Backend** | Node.js (Express for local dev, AWS Lambda for production) |
| **Infrastructure** | AWS CDK v2 (Java) |
| **Testing** | Vitest (unit/system), Playwright (browser/behaviour) |
| **Authentication** | AWS Cognito + Google IdP (production), Mock OAuth2 (local) |
| **Storage** | DynamoDB (bundles, passes, receipts, capacity counters, API requests), S3 (receipts backup) |
| **API Integration** | HMRC MTD VAT API (test and production) |
| **Local Dev Proxy** | ngrok (exposes localhost for OAuth callbacks) |

### Key Features

- **VAT Submissions**: Submit VAT returns to HMRC via MTD API
- **VAT Obligations**: Retrieve and display VAT obligations
- **Receipt Storage**: Store and retrieve HMRC submission receipts
- **Bundle/Entitlement System**: User subscription management with catalogue-driven bundles
- **Passes**: Four-word passphrase invitation codes that unlock the bundles that need one; other bundles are self-service or admin-granted
- **Token Enforcement**: Metered HMRC API usage per bundle (1 token per VAT submission)
- **Bundle Capacity**: Global cap enforcement with atomic counters and EventBridge reconciliation
- **Simulator Mode**: Fully self-contained local development with mocked OAuth2 and HMRC APIs
- **Multi-Environment**: Supports simulator, local proxy, CI, and production deployments
- **OAuth Integration**: Google/Cognito for production, mock OAuth2 for local testing

## Environment Configuration

The repository uses multiple environment files. See the actual files for complete configuration:

| Environment | File | Purpose |
|-------------|------|---------|
| **test** | `.env.test` | Unit/system tests with mocked services |
| **simulator** | `.env.simulator` | Local dev with HTTP simulator (lightweight, no Docker, no external config needed) |
| **proxy** | `.env.proxy` | Local dev with ngrok, Docker OAuth2, dynalite (requires HMRC sandbox credentials) |
| **proxyRunning** | `.env.proxyRunning` | Connect to already-running local services |
| **ci** | `.env.ci` | CI with real AWS (`ci.submit.diyaccounting.co.uk`) |
| **prod** | `.env.prod` | Production (`submit.diyaccounting.co.uk`) |

**Note:** Simulator mode works out of the box with no `.env` file - it uses built-in defaults for all mocked services. Proxy mode requires configuration for ngrok and HMRC sandbox credentials.

### Key Environment Variables

Core variables defined in all environment files:

- `ENVIRONMENT_NAME` / `DEPLOYMENT_NAME` - Environment identifiers
- `DIY_SUBMIT_BASE_URL` - Application base URL
- `HMRC_BASE_URI` / `HMRC_SANDBOX_BASE_URI` - HMRC API endpoints
- `HMRC_CLIENT_ID` / `HMRC_SANDBOX_CLIENT_ID` - HMRC OAuth credentials
- `COGNITO_USER_POOL_ID` / `COGNITO_CLIENT_ID` - AWS Cognito configuration
- `*_DYNAMODB_TABLE_NAME` - DynamoDB table names (bundles, passes, capacity, receipts, API requests)

**Read the `.env.*` files directly for complete variable listings.**

### Secrets Management

| Environment | Secret Storage |
|-------------|----------------|
| Local | `.env` files (not committed), shell environment |
| AWS (CI/Prod) | AWS Secrets Manager |

**Critical Secrets** (stored in Secrets Manager):
- `{env}/submit/hmrc/client_secret` - HMRC production OAuth
- `{env}/submit/hmrc/sandbox_client_secret` - HMRC sandbox OAuth
- `{env}/submit/user-sub-hash-salt` - HMAC-SHA256 salt for user ID hashing
- `{env}/submit/email-hash-secret` - HMAC-SHA256 secret for email hashing (pass restrictions)

See `_developers/archive/SALTED_HASH_IMPLEMENTATION.md` and `_developers/archive/SALT_SECRET_RECOVERY.md` for implementation details.

## Build and Test Commands

### Quick Reference

```bash
# Core test suite (~4s, no config needed)
npm test

# Java CDK build (~45s)
./mvnw clean verify

# Local E2E tests - simulator mode (no config needed)
npm run test:submitVatBehaviour-simulator

# Local E2E tests - proxy mode (gold standard, requires .env.proxy)
npm run test:submitVatBehaviour-proxy
```

**Read `package.json` for complete script listings.**

### Four-Tier Testing Pyramid

| Tier | Location | Command | Focus |
|------|----------|---------|-------|
| Unit | `app/unit-tests/`, `web/unit-tests/` | `npm run test:unit` | Business logic |
| System | `app/system-tests/` | `npm run test:system` | Docker integration |
| Browser | `web/browser-tests/` | `npm run test:browser` | UI components |
| Behaviour | `behaviour-tests/` | `npm run test:submitVatBehaviour-simulator` | E2E journeys (fast, local) |
| Behaviour | `behaviour-tests/` | `npm run test:submitVatBehaviour-proxy` | E2E journeys (gold standard) |

### Behaviour Test Suites

| Test File | Focus |
|-----------|-------|
| `submitVat.behaviour.test.js` | VAT submission end-to-end flow |
| `postVatReturn.behaviour.test.js` | VAT return posting |
| `getVatReturn.behaviour.test.js` | View submitted VAT returns |
| `getVatObligations.behaviour.test.js` | VAT obligations retrieval |
| `vatValidation.behaviour.test.js` | VAT form validation |
| `vatSchemes.behaviour.test.js` | VAT scheme types |
| `postVatReturnFraudPreventionHeaders.behaviour.test.js` | HMRC fraud prevention headers |
| `auth.behaviour.test.js` | Authentication flows |
| `bundles.behaviour.test.js` | Bundle management |
| `passRedemption.behaviour.test.js` | Pass redemption and errors |
| `tokenEnforcement.behaviour.test.js` | Token consumption and exhaustion |
| `help.behaviour.test.js` | Help page functionality |
| `compliance.behaviour.test.js` | Compliance checks |
| `simulator.behaviour.test.js` | Simulator mode |
| `generatePassActivity.behaviour.test.js` | Pass generation activity |
| `payment.behaviour.test.js` | Stripe payment flow |
| `captureDemo.behaviour.test.js` | Demo video capture |

### Maven Commands

| Command | Purpose |
|---------|---------|
| `./mvnw clean verify` | Full build: compile, test, package CDK JARs |
| `./mvnw clean test` | Run tests only |
| `./mvnw spotless:check` | Verify code formatting |
| `./mvnw spotless:apply` | Auto-format code |

**Output Artifacts**:
- `target/submit-application.jar` - CDK entry point for application stacks
- `target/submit-environment.jar` - CDK entry point for environment stacks
- `web/public/docs/api/openapi.yaml` - Generated API documentation

**Read `pom.xml` for complete Maven configuration.**

## AWS Deployment Architecture

### High-Level Architecture

```
Internet (Users)
       |
       v
   Route 53 (DNS)
       |
       v
   CloudFront (CDN) ----------------+
       |                            |
   +---+---+                        |
   |       |                        |
   v       v                        |
  S3    HTTP API Gateway            |
(Static)    |                       |
            v                       v
      Lambda Functions ------> HMRC MTD API
            |
    +-------+-------+-------+
    v       v       v       v
Cognito  DynamoDB  Secrets  EventBridge
                   Manager  (Reconciliation)
```

### Lambda Execution Models

| Model | Pattern | Use Case |
|-------|---------|----------|
| **Synchronous** (`ApiLambda`) | Request -> Lambda -> Response | Fast operations (token exchange, bundle get) |
| **Asynchronous** (`AsyncApiLambda`) | Request -> 202 -> SQS -> Worker -> Poll | Long-running ops (HMRC VAT submission) |

**Async Flow**: Ingest Lambda -> SQS Queue -> Worker Lambda -> DynamoDB (result) -> Client polls

### CDK Stacks

#### Environment Stacks (Long-Lived)

Created once per environment by `deploy-environment.yml`:

| Stack | Resources |
|-------|-----------|
| ObservabilityStack | CloudWatch Log Groups, RUM, Alarms, Dashboard |
| ObservabilityUE1Stack | CloudWatch resources in us-east-1 (for CloudFront) |
| DataStack | DynamoDB tables (Bundles, Passes, BundleCapacity, Receipts, HMRC API Requests) |
| EcrStack | ECR repositories (eu-west-2 and us-east-1) |
| ActivityStack | Activity/subscription management |
| HoldingStack | S3 bucket and CloudFront for the holding page |
| SimulatorStack | S3 bucket and CloudFront for simulator site |
| IdentityStack | Cognito user pool |
| BackupStack | Cross-account backup configuration |

#### Application Stacks (Per-Deployment)

Created per deployment by `deploy.yml`:

| Stack | Resources |
|-------|-----------|
| SelfDestructStack | Auto-destroy (non-prod) |
| AuthStack | Auth Lambda functions (customAuthorizer, cognitoTokenPost) |
| HmrcStack | HMRC API Lambda functions (obligations, returns, receipts, tokens) |
| AccountStack | Bundle, pass, and capacity Lambdas + EventBridge reconciliation |
| BillingStack | Stripe payment integration Lambdas |
| ApiStack | HTTP API Gateway |
| EdgeStack | Production CloudFront |
| PublishStack | S3 static file deployment |
| OpsStack | CloudWatch dashboard |

**Note:** Gateway and spreadsheets stacks have been moved to their own repositories (`diy-accounting-uk/www.diyaccounting.co.uk` and `diy-accounting-uk/spreadsheets.diyaccounting.co.uk` respectively).

**Read the CDK stack files in `infra/main/java/co/uk/diyaccounting/submit/stacks/` for details.**

### GitHub Actions Workflows

| Workflow | Purpose | Trigger |
|----------|---------|---------|
| `deploy.yml` | Build, test, deploy application | Push, schedule, manual |
| `deploy-environment.yml` | Deploy shared infrastructure | Push to env files, manual |
| `deploy-cdk-stack.yml` | Deploy individual CDK stack (reusable) | workflow_call |
| `deploy-app.yml` | Lean app deployment (Lambda + S3 without CDK) | Manual only |
| `test.yml` | Run all tests (reusable) | Push, schedule, workflow_call |
| `synthetic-test.yml` | Run synthetic monitoring tests | Schedule, manual |
| `generate-pass.yml` | Generate invitation passes | Schedule (9am UTC), push, manual, workflow_call |
| `destroy-ci.yml` | Tear down CI deployments | Manual only |
| `destroy-prod.yml` | Tear down prod deployments | Manual only |
| `publish.yml` | Publish static assets | Manual only |
| `set-origins.yml` | Update DNS/CloudFront | Manual only |
| `manage-secrets.yml` | Backup/restore salt secrets | Manual only |
| `verify-backups.yml` | Verify cross-account backups | Schedule, manual |
| `setup-backup-account.yml` | Configure backup AWS account | Manual only |
| `run-migrations.yml` | Run data migrations | Manual only |
| `create-hmrc-test-user.yml` | Create HMRC sandbox test user | Manual only |
| `cleanup-test-users.yml` | Clean up Cognito test users | Manual only |
| `delete-user-data.yml` | Delete user data (GDPR) | Manual only |
| `delete-user-data-by-email.yml` | Delete user data by email (GDPR) | Manual only |
| `compliance.yml` | Run compliance checks (Pa11y, axe, Lighthouse, ZAP) | Push, manual |
| `security-review.yml` | Security scanning | Push, manual |
| `codeql.yml` | CodeQL security analysis | Push, schedule |
| `copilot-agent.yml` | GitHub Copilot agent workflow | workflow_dispatch |
| `copilot-setup-steps.yml` | Copilot setup (reusable) | workflow_call |

**Note:** Gateway and spreadsheets deployment workflows have been moved to their own repositories. This repo only deploys the submit application to submit-ci (367191799875) and submit-prod (972912397388).

#### Custom Actions

| Action | Purpose |
|--------|---------|
| `get-names` | Resolve deployment/environment names from branch and context |
| `lookup-resources` | Look up CloudFormation outputs and AWS resource details |
| `set-origins` | Update CloudFront origins and Route53 DNS records |

**Read `.github/workflows/*.yml` for complete workflow definitions.**

## Local Development

### Quick Start (Ubuntu/Debian)

Set up a development environment from scratch:

```bash
# Install Node.js 22+ (using NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Java 21+ (for CDK builds)
sudo apt-get install -y openjdk-21-jdk

# Clone and install
git clone https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk.git
cd submit.diyaccounting.co.uk
npm install

# Run unit tests (no configuration needed)
npm test

# Start in simulator mode (no .env file, Docker, or external services needed)
npm start
# Open http://localhost:3000 in your browser

# Run behaviour tests in simulator mode
npm run test:submitVatBehaviour-simulator
```

The simulator mode requires no external configuration - it mocks OAuth2 and HMRC APIs locally.

### Local Development Stack

**Simulator Mode** (lightweight, no Docker, no external services):
```
Developer Machine
    |
    +-- Express Server (localhost:3000) --> Lambda handlers
    |
    +-- HTTP Simulator (localhost:9000) --> Mock OAuth2 + HMRC API
    |
    +-- Dynalite (localhost:9001) --> Local DynamoDB
```

**Proxy Mode** (full stack with Docker and ngrok for real HMRC sandbox):
```
Developer Machine
    |
    +-- Express Server (localhost:3000) --> Lambda handlers
    |
    +-- ngrok (tunnel) --> Public HTTPS URL for OAuth callbacks
    |
    +-- Mock OAuth2 (Docker, localhost:8080) --> Simulates Cognito
    |
    +-- Dynalite (dynamic port) --> Local DynamoDB
```

### Starting Local Services

```bash
# Simulator mode (recommended for development - no config needed)
npm start                    # or npm run start:simulator

# Proxy mode (for testing with real HMRC sandbox)
npm run start:proxy          # Requires .env.proxy, ngrok, Docker

# Individual services (advanced):
npm run data    # Local DynamoDB
npm run auth    # Mock OAuth2 (Docker)
npm run proxy   # ngrok tunnel
npm run server  # Express server
```

### Behaviour Tests

```bash
# Simulator mode (no external dependencies, fastest)
npm run test:submitVatBehaviour-simulator

# Proxy mode (gold standard, uses ngrok and Docker)
npm run test:submitVatBehaviour-proxy    # Requires .env.proxy configuration

# Against deployed environments (requires AWS credentials)
npm run test:submitVatBehaviour-ci
npm run test:submitVatBehaviour-prod
```

The proxy mode tests are the gold standard for CI validation as they use real OAuth flows via ngrok. Simulator mode tests are faster and require no external setup, making them ideal for rapid development iteration.

### Local vs AWS Comparison

| Aspect | Local (Express) | AWS (Lambda) |
|--------|----------------|--------------|
| Entry Point | `app/bin/server.js` | Lambda handler exports |
| Static Files | Express static | S3 + CloudFront |
| Authentication | Mock OAuth2 | AWS Cognito |
| Database | Dynalite (in-memory) | DynamoDB |
| Secrets | `.env` file | Secrets Manager |

**Read `app/bin/server.js` and `app/lib/httpServerToLambdaAdaptor.js` for implementation details.**

## Directory Structure

### Top-Level Overview

| Directory | Purpose |
|-----------|---------|
| `.github/` | GitHub Actions workflows and custom actions |
| `.claude/` | Claude Code configuration (rules, settings) |
| `app/` | Backend Node.js Lambda functions and libraries |
| `behaviour-tests/` | End-to-end Playwright behaviour tests |
| `cdk-application/` | CDK configuration for application stacks |
| `cdk-environment/` | CDK configuration for environment stacks |
| `infra/` | Java/CDK infrastructure code |
| `scripts/` | Utility scripts for development and deployment |
| `web/` | Frontend HTML/CSS/JavaScript and tests |
| `_developers/` | Developer documentation |

**Removed directories** (now in their own repositories): `cdk-gateway/`, `cdk-spreadsheets/`, `cdk-root/`, `root-zone/`, `web/www.diyaccounting.co.uk/`, `web/spreadsheets.diyaccounting.co.uk/`.

### Backend Structure (`app/`)

| Path | Purpose |
|------|---------|
| `bin/` | Entry point scripts (server.js, simulator-server.js, ngrok.js, dynamodb.js, main.js, provision-user.mjs) |
| `data/` | DynamoDB repository implementations |
| `functions/auth/` | Authentication Lambdas (customAuthorizer, cognitoTokenPost) |
| `functions/hmrc/` | HMRC API Lambdas (obligations, returns, receipts, token exchange) |
| `functions/account/` | Account Lambdas (bundle CRUD, pass CRUD, capacity reconciliation) |
| `functions/support/` | Support Lambdas (supportTicketPost) |
| `functions/infra/` | Infrastructure Lambdas (selfDestruct) |
| `functions/edge/` | CloudFront edge Lambdas (errorPageHandler) |
| `functions/non-lambda-mocks/` | Mock handlers for local dev (mockTokenPost, mockAuthUrlGet) |
| `http-simulator/` | HTTP simulator for local OAuth2 and HMRC API mocking |
| `lib/` | Shared libraries (logger, JWT, HTTP helpers, passphrase, emailHash, env, envSchema, dynamoDbClient, dataMasking, hmrcValidation, obligationFormatter, buildFraudHeaders, dateUtils, qrCodeGenerator, vatReturnTypes) |
| `services/` | Business logic (hmrcApi, bundleManagement, passService, tokenEnforcement, productCatalog, subHasher) |
| `test-helpers/` | Test utilities (mock helpers, event builders, DynamoDB mocks) |
| `unit-tests/` | Vitest unit tests |
| `system-tests/` | Vitest integration tests |

#### Lambda Functions

| Lambda | Path | Purpose |
|--------|------|---------|
| customAuthorizer | `functions/auth/customAuthorizer.js` | JWT validation |
| cognitoTokenPost | `functions/auth/cognitoTokenPost.js` | Token exchange |
| hmrcTokenPost | `functions/hmrc/hmrcTokenPost.js` | HMRC OAuth token exchange |
| hmrcVatObligationGet | `functions/hmrc/hmrcVatObligationGet.js` | Get VAT obligations |
| hmrcVatReturnGet | `functions/hmrc/hmrcVatReturnGet.js` | View VAT return |
| hmrcVatReturnPost | `functions/hmrc/hmrcVatReturnPost.js` | Submit VAT return (with token enforcement) |
| hmrcReceiptGet | `functions/hmrc/hmrcReceiptGet.js` | Get HMRC receipts |
| bundleGet | `functions/account/bundleGet.js` | Get user bundles + catalogue availability |
| bundlePost | `functions/account/bundlePost.js` | Grant bundle (with capacity enforcement) |
| bundleDelete | `functions/account/bundleDelete.js` | Remove bundle |
| passGet | `functions/account/passGet.js` | Check pass validity (public, no auth) |
| passPost | `functions/account/passPost.js` | Redeem pass (authenticated) |
| passAdminPost | `functions/account/passAdminPost.js` | Create pass (admin only) |
| interestPost | `functions/account/interestPost.js` | Register user interest |
| bundleCapacityReconcile | `functions/account/bundleCapacityReconcile.js` | Reconcile capacity counters (EventBridge) |
| supportTicketPost | `functions/support/supportTicketPost.js` | Submit support ticket |
| selfDestruct | `functions/infra/selfDestruct.js` | Non-prod stack cleanup |
| errorPageHandler | `functions/edge/errorPageHandler.js` | CloudFront custom error pages |
| errorPageHtml | `functions/edge/errorPageHtml.js` | Error page HTML generation |

#### Data Repositories

| Repository | Purpose |
|------------|---------|
| `dynamoDbBundleRepository.js` | Bundle CRUD + token tracking |
| `dynamoDbPassRepository.js` | Pass CRUD + atomic use count |
| `dynamoDbCapacityRepository.js` | Capacity counter CRUD |
| `dynamoDbReceiptRepository.js` | HMRC receipt storage |
| `dynamoDbHmrcApiRequestRepository.js` | HMRC API audit log |
| `dynamoDbAsyncRequestRepository.js` | Async request state |

#### Services

| Service | Purpose |
|---------|---------|
| `hmrcApi.js` | HMRC MTD API client |
| `bundleManagement.js` | Bundle enforcement and path matching |
| `productCatalog.js` | Parse catalogue TOML, filter bundles/activities |
| `passService.js` | Pass creation, validation, redemption logic |
| `tokenEnforcement.js` | Token consumption for HMRC submissions |
| `subHasher.js` | HMAC-SHA256 user ID hashing |
| `asyncApiServices.js` | Async request orchestration |

#### HTTP Simulator (`app/http-simulator/`)

Lightweight mock server for local development:

| Path | Purpose |
|------|---------|
| `server.js` | Express server entry point |
| `index.js` | Route registration |
| `state/store.js` | In-memory state management |
| `routes/hmrc-oauth.js` | Mock HMRC OAuth flow |
| `routes/local-oauth.js` | Mock local Cognito OAuth |
| `routes/vat-obligations.js` | Mock VAT obligations API |
| `routes/vat-returns.js` | Mock VAT returns API |
| `routes/fraud-headers.js` | Mock fraud prevention headers |
| `routes/test-user.js` | Test user creation |
| `routes/openapi.js` | Simulator OpenAPI spec |
| `scenarios/obligations.js` | Obligation response scenarios |
| `scenarios/returns.js` | Return response scenarios |
| `scenarios/vat-schemes.js` | VAT scheme scenarios |

### Frontend Structure (`web/`)

| Path | Purpose |
|------|---------|
| `public/` | Static website files served by S3/CloudFront |
| `public-simulator/` | Simulator variant (copy of public with simulator-specific overrides) |
| `holding/` | Holding page (maintenance mode) |
| `unit-tests/` | Vitest frontend unit tests |
| `browser-tests/` | Playwright browser tests |

#### Public Pages (`web/public/`)

| Page | Purpose |
|------|---------|
| `index.html` | Main activities page |
| `about.html` | About page with feature overview |
| `bundles.html` | Bundle management + pass redemption UI |
| `guide.html` | User guide |
| `help.html` | Help and FAQ page |
| `simulator.html` | Simulator mode landing page |
| `mcp.html` | MCP server information |
| `privacy.html` | Privacy policy |
| `terms.html` | Terms of service |
| `accessibility.html` | Accessibility statement |
| `policybee.html` | PolicyBee insurance verification |
| `diy-accounting-spreadsheets.html` | Cross-link to spreadsheets site |
| `diy-accounting-limited.html` | DIY Accounting Limited company info |
| `spreadsheets.html` | Spreadsheets integration page |
| `auth/login.html` | Login page (Cognito redirect) |
| `auth/loginWithCognitoCallback.html` | Cognito OAuth callback |
| `auth/loginWithMockCallback.html` | Mock OAuth callback (dev) |
| `hmrc/vat/submitVat.html` | VAT return submission form |
| `hmrc/vat/vatObligations.html` | VAT obligations display |
| `hmrc/vat/viewVatReturn.html` | View submitted VAT return |
| `hmrc/receipt/receipts.html` | HMRC receipt history |
| `activities/submitVatCallback.html` | HMRC OAuth callback for VAT |
| `errors/*.html` | Custom error pages (403, 404, 500, 502, 503, 504) |

#### Frontend Libraries (`web/public/lib/`)

| Path | Purpose |
|------|---------|
| `analytics.js` | Google Analytics integration |
| `env-loader.js` | Environment configuration loader |
| `feature-flags.js` | Feature flags |
| `services/api-client.js` | Base API client with auth headers |
| `services/auth-service.js` | Authentication service |
| `services/catalog-service.js` | Product catalogue service |
| `services/hmrc-service.js` | HMRC API service |
| `utils/crypto-utils.js` | Crypto utilities |
| `utils/jwt-utils.js` | JWT parsing |
| `utils/correlation-utils.js` | Request correlation |
| `utils/storage-utils.js` | localStorage helpers |
| `utils/dom-utils.js` | DOM manipulation helpers |
| `utils/obligation-utils.js` | VAT obligation formatting |
| `bundle-cache.js` | IndexedDB bundle cache (5-min TTL) |
| `auth-url-builder.js` | OAuth URL construction |
| `toml-parser.js` | TOML file parser |
| `request-cache.js` | Request caching |
| `test-data-generator.js` | Test data generation |
| `help-page.js` | Help page logic |
| `faq-search.js` | FAQ search functionality |
| `support-api.js` | Support ticket API |

#### Frontend Widgets (`web/public/widgets/`)

| Widget | Purpose |
|--------|---------|
| `auth-status.js` | Login/logout status display |
| `entitlement-status.js` | Bundle entitlement indicator |
| `status-messages.js` | Toast/status message display |
| `loading-spinner.js` | Loading indicator |
| `simulator-bridge.js` | Simulator mode bridge |
| `simulator-journeys.js` | Simulator predefined journeys |
| `localstorage-viewer.js` | Developer localStorage inspector |
| `view-source-link.js` | View source link for developers |
| `error-page.js` | Custom error page handler |

#### Prefetch Scripts (`web/public/prefetch/`)

Head-injected scripts for early API prefetching:

| Script | Purpose |
|--------|---------|
| `prefetch-bundle-head.js` | Prefetch bundle data |
| `prefetch-catalog-head.js` | Prefetch product catalogue |
| `prefetch-cognito-authurl-head.js` | Prefetch Cognito auth URL |
| `prefetch-cognito-token-head.js` | Prefetch Cognito token |
| `prefetch-hmrc-authurl-head.js` | Prefetch HMRC auth URL |
| `prefetch-hmrc-token-head.js` | Prefetch HMRC token |
| `prefetch-hmrc-vat-obligation-head.js` | Prefetch VAT obligations |
| `prefetch-hmrc-vat-return-head.js` | Prefetch VAT return submission |
| `prefetch-hmrc-vat-return-get-head.js` | Prefetch VAT return view |
| `prefetch-hmrc-receipt-head.js` | Prefetch receipts |
| `prefetch-hmrc-receipt-name-head.js` | Prefetch receipt names |
| `prefetch-mock-authurl-head.js` | Prefetch mock auth URL (dev) |
| `prefetch-mock-token-head.js` | Prefetch mock token (dev) |

### Infrastructure Structure (`infra/`)

| Path | Purpose |
|------|---------|
| `main/java/.../stacks/` | CDK stack definitions |
| `main/java/.../constructs/` | Reusable CDK constructs (Lambda, ApiLambda, AsyncApiLambda, EdgeLambdaConstruct) |
| `main/java/.../utils/` | Utility classes (Kind, KindCdk, ResourceNameUtils, S3, etc.) |
| `main/java/.../swagger/` | OpenAPI generator |
| `test/` | JUnit tests for CDK code |
| `aws-accounts/` | Multi-account setup scripts (OIDC, backups, CDK bootstrap) |

#### CDK Constructs

| Construct | Purpose |
|-----------|---------|
| `Lambda` | Base Lambda construct |
| `ApiLambda` | Synchronous API Lambda with API Gateway integration |
| `AsyncApiLambda` | Asynchronous API Lambda with SQS worker pattern |
| `EdgeLambdaConstruct` | CloudFront Lambda@Edge function |

### Configuration Files

| File | Purpose |
|------|---------|
| `submit.catalogue.toml` | Product catalogue (bundles, activities, display rules, tokens) |
| `submit.passes.toml` | Pass type definitions (templates for generating passes) |
| `google-analytics.toml` | GA4 configuration |
| `faqs.toml` | FAQ content for help page |
| `submit.features.toml` | Feature flags configuration |
| `playwright.config.js` | Playwright test configuration |
| `vitest.config.js` | Vitest test configuration |
| `eslint.config.js` | ESLint configuration |
| `eslint.security.config.js` | Security-focused ESLint rules |
| `.pa11yci.*.json` | Pa11y accessibility test configuration per environment |
| `.zap-rules.tsv` | OWASP ZAP scanning rules |
| `.retireignore.json` | Retire.js ignore list |
| `mock-oauth2-config.json` | Mock OAuth2 server configuration |

### Scripts (`scripts/`)

| Script | Purpose |
|--------|---------|
| `build-simulator.js` | Build simulator site from public site |
| `build-sitemaps.cjs` | Build XML sitemaps |
| `simulator-lambda-server.mjs` | Lambda server for simulator |
| `start-simulator.sh` | Start simulator mode |
| `start-proxy.sh` | Start proxy mode |
| `deploy-app.js` | Lean app deployment (Lambda + S3 without CDK) |
| `generate-test-reports.js` | Generate test report pages |
| `generate-compliance-report.js` | Generate compliance markdown report |
| `generate-pass.js` | Generate invitation passes |
| `generate-pass-with-qr.js` | Generate pass with QR code |
| `inject-dynamodb-into-test-report.js` | Add DynamoDB state to test reports |
| `text-spacing-test.js` | WCAG 1.4.12 text spacing tests |
| `capture-demo-videos.js` | Capture demo videos for documentation |
| `create-hmrc-test-user.js` | Create HMRC sandbox test user |
| `create-cognito-test-user.js` | Create Cognito test user |
| `delete-cognito-test-user.js` | Delete Cognito test user |
| `enable-cognito-native-test.js` | Enable email/password login for testing |
| `disable-cognito-native-test.js` | Disable email/password login |
| `toggle-cognito-native-auth.js` | Toggle Cognito native auth provider |
| `cleanup-test-users.js` | Clean up Cognito test users |
| `bundle-for-tests.js` | Grant test bundles |
| `stripe-setup.js` | Create/verify Stripe webhook endpoints |
| `export-user-data.js` | Export user data (GDPR) |
| `delete-user-data.js` | Delete user data (GDPR) |
| `export-dynamodb-for-test-users.js` | Export DynamoDB for test users |
| `provision-user.sh` | Provision user account |
| `publish-web-test-local.sh` | Publish local web test results |
| `aws-assume-submit-deployment-role.sh` | Assume AWS deployment role |
| `aws-assume-user-provisioning-role.sh` | Assume user provisioning role |
| `aws-unset-iam-session.sh` | Clear AWS session |
| `add-spdx-headers.js` | Add SPDX license headers |
| `validate-workflows.sh` | Validate GitHub Actions YAML |
| `backup-salts.sh` | Backup hash salt secrets |
| `restore-dynamodb-pitr.sh` | Restore DynamoDB from PITR |
| `setup-s3-replication.sh` | Configure S3 replication |
| `dr-restore-from-backup-account.sh` | Disaster recovery restore |
| `playwright-video-reporter.js` | Playwright video test reporter |
| `add-bundle.sh` | Add bundle to user account |
| `clean-drawio.cjs` | Clean draw.io diagram files |
| `create-favicon.sh` | Generate favicon variants |
| `list-domains.sh` | List DNS domain configuration |
| `update.sh` | Update dependencies and tools |
| `update-java.sh` | Update Java dependencies |

**Removed scripts** (now in their own repositories): `build-packages.cjs`, `build-gateway-redirects.cjs`, `generate-knowledge-base-toml.cjs`, `stripe-spreadsheets-setup.js`.

## DynamoDB Schema

### Core Tables

| Table | Purpose | Key Schema |
|-------|---------|------------|
| `{env}-submit-bundles` | User entitlements and token tracking | `hashedSub` (PK), `product` (SK) |
| `{env}-submit-passes` | Invitation pass records | `pk` (PK) = `pass#word-word-word-word` |
| `{env}-submit-bundle-capacity` | Global capacity counters | `bundleId` (PK) |
| `{env}-submit-receipts` | HMRC submission receipts | `hashedSub` (PK), `receiptId` (SK) |
| `{env}-submit-hmrc-api-requests` | HMRC API audit log | `id` (PK), `timestamp` (SK) |

### Bundle Record Fields

```
hashedSub         String   HMAC-SHA256 of user ID
product           String   Bundle ID (e.g. "day-guest")
bundleId          String   Bundle ID
expiry            String   ISO8601 expiry date
createdAt         String   ISO8601 creation date
ttl               Number   DynamoDB auto-deletion timestamp
tokensGranted     Number   Tokens allocated for this bundle period
tokensConsumed    Number   Tokens used so far
tokenResetAt      String   ISO8601 next token refresh (null = no refresh)
```

### Pass Record Fields

```
pk                String   "pass#word-word-word-word"
code              String   The passphrase
bundleId          String   Bundle granted on redemption
passTypeId        String   Template type from submit.passes.toml
validFrom         String   ISO8601
validUntil        String   ISO8601 (null = never)
ttl               Number   DynamoDB auto-deletion
maxUses           Number   Maximum redemptions
useCount          Number   Current redemption count
restrictedToEmailHash  String   HMAC-SHA256 of permitted email (null = any)
createdBy         String   Creator identifier
notes             String   Optional notes
```

### Capacity Counter Fields

```
bundleId          String   Bundle ID (e.g. "day-guest")
activeCount       Number   Current active allocations
reconciledAt      String   ISO8601 last reconciliation
```

### Async Request Tables

Each async operation has its own request state table:
- `submit-bundle-post-async-requests`
- `submit-bundle-delete-async-requests`
- `submit-hmrc-vat-return-post-async-requests`
- `submit-hmrc-vat-return-get-async-requests`
- `submit-hmrc-vat-obligation-get-async-requests`

**Schema**: `userId` (PK), `requestId` (SK), `status`, `data`, `ttl`

## Security Architecture

### Authentication Flow

1. User navigates to application
2. Frontend checks for JWT in localStorage
3. If no JWT, redirect to Cognito OAuth
4. User authenticates (Google IdP or username/password)
5. Cognito redirects with auth code
6. Frontend exchanges code for JWT
7. JWT stored in localStorage
8. API requests include JWT in Authorization header
9. Custom authorizer Lambda validates JWT

### Key Security Measures

- All traffic over HTTPS (ACM certificates)
- Secrets in AWS Secrets Manager (never in code)
- User IDs hashed with HMAC-SHA256 before storage
- Email addresses hashed for pass restrictions (never stored in plaintext)
- IAM least-privilege roles
- CORS properly configured
- JWT validation on all protected routes
- Token enforcement on HMRC submissions
- Atomic capacity counters prevent over-allocation

### Compliance Testing

| Tool | Purpose |
|------|---------|
| Pa11y | WCAG 2.1 AA accessibility |
| axe-core | WCAG 2.2 AA accessibility |
| Lighthouse | Performance and accessibility |
| Text spacing test | WCAG 1.4.12 compliance |
| OWASP ZAP | Penetration testing |
| ESLint security | Static security analysis |
| npm audit | Dependency vulnerability scanning |
| retire.js | Known vulnerable library detection |
| CodeQL | GitHub code security analysis |

---

## Additional Documentation

For specific topics, see:

| Document | Location |
|----------|----------|
| Developer setup | `_developers/SETUP.md` |
| AWS architecture | `AWS_ARCHITECTURE.md` |
| AWS account migration history | `AWS_ACCOUNT_MIGRATION.md` |
| AWS costs | `AWS_COSTS.md` |
| Payment lifecycle plan | `PLAN_PAYMENT_LIFECYCLE.md` |
| Backup strategy | `_developers/backlog/PLAN_BACKUP_STRATEGY.md` |
| Security detection uplift | `_developers/backlog/PLAN_SECURITY_DETECTION_UPLIFT.md` |
| Site map | `_developers/SITE_MAP.md` |
| MFA implementation | `_developers/MFA_IMPLEMENTATION_SUMMARY.md` |
| Marketing guidance | `_developers/MARKETING_GUIDANCE.md` |
| Information security runbook | `RUNBOOK_INFORMATION_SECURITY.md` |
| Accessibility/penetration report | `REPORT_ACCESSIBILITY_PENETRATION.md` |
| Security review report | `REPORT_SECURITY_REVIEW.md` |
| HMRC fraud prevention | `hmrc-fraud-prevention.md` |
| HMRC MTD approval submission | `_developers/hmrc/HMRC_MTD_API_APPROVAL_SUBMISSION.md` |
| Salted hash implementation | `_developers/archive/SALTED_HASH_IMPLEMENTATION.md` |
| Salt secret recovery | `_developers/archive/SALT_SECRET_RECOVERY.md` |
| CloudFront fix history | `_developers/archive/CLOUDFRONT_FRAUD_HEADERS_FIX.md` |
| Obligation flexibility | `_developers/archive/OBLIGATION_FLEXIBILITY_FIX.md` |
| Test report generation | `scripts/generate-test-reports.js` |
| API documentation | `web/public/docs/api/openapi.yaml` |
| Account separation (completed) | `_developers/archive/PLAN_ACCOUNT_SEPARATION.md` |

**For detailed implementation, always refer to the source files directly.**
