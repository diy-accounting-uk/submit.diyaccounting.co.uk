# Claude Code Memory - DIY Accounting Submit

> **Shared conventions** (git workflow, AWS accounts, code quality, confirm behavior, security): See `../CLAUDE.md`

## Context Survival (CRITICAL — read this first after every compaction)

**After compaction or at session start:**
1. Read all `PLAN_*.md` files in the project root — these are the active goals
2. Run `TaskList` to see tracked tasks with status
3. Do NOT start new work without checking these first

**During work:**
- When the user gives a new requirement, add it to the relevant `PLAN_*.md` or create a new one
- Track all user goals as Tasks with status (pending → in_progress → completed)
- Update `PLAN_*.md` with progress before context gets large

**When compacting, preserve:**
- ALL user requests and their current status (not started / in progress / done)
- Current task goals and blocking issues
- Which `PLAN_*.md` files are active
- What test is currently being run and what the last result was

**PLAN file pattern:**
- Active plans live at project root: `PLAN_<DESCRIPTION>.md`
- Each plan has user assertions verbatim at the top (non-negotiable requirements)
- Plans track problems, fixes applied, and verification criteria
- If no plan file exists for the current work, create one before starting
- Never nest plans in subdirectories — always project root

**Anti-patterns to avoid:**
- Do NOT drift to side issues when a plan file defines the priority
- Do NOT silently fail and move on (e.g., card filling fails → throw, don't skip)
- Do NOT overfit to the simulator — always verify against proxy/CI with real services
- Do NOT ask obvious questions (which URL, which branch) — read the plan file

## NEXT.md holds open work only (CRITICAL)

`NEXT.md` is the list of what remains to do. It never records what is done, what was decided
against, what was removed, or how something got fixed. When a task closes, delete its entry in
the same commit; when part of a task closes, delete that part and leave the remainder. Never
write "done", "fixed in #N", "proven", "removed", "if wanted", or a reference to a branch,
deployment, file or setting that no longer exists. Completed work lives in `git log` and the
PR record; the operator does not want to read it again here. Narrative that explains an open
item is fine when it changes what the next session does; narrative that explains history is
not.

**Why:** the operator asked twice on 2026-08-30 for completed and "won't do" content to be
stripped after sessions kept accreting status notes and "tidy up X if wanted" lines.

## Quick Reference

**Primary documentation**: See `REPORT_REPOSITORY_CONTENTS.md` for complete architecture, npm scripts, AWS stacks, and directory structure.

**Other AI assistants in this repo**:
- `.junie/guidelines.md` - Junie (testing & iteration focus)
- `.github/copilot-instructions.md` - GitHub Copilot (code review focus)

## Skills

Skills live at `.claude/skills/<name>/SKILL.md`, each with a root symlink (`SKILL_<NAME>.md`) for
convenience — gitignored, recreate with `ln -s` if missing.

- `.claude/skills/plain-prose/SKILL.md` — writing rules for plain, human prose; follow this for all human-facing text (docs, comments, chat)
- `.claude/skills/do-next/SKILL.md` — dispatch `NEXT.md`'s open items as worktree-isolated sub-agents
- `.claude/skills/stripe-catalogue-sync/SKILL.md` — sync Stripe products and prices from the bundle catalogue, test then live, and land the price ids
- `.claude/skills/site-video-capture/SKILL.md` — record a video of the real site from a scene script (`videos/*.json`)

## Permission Handling

See `../CLAUDE.md` for full rules. Common permissions for submit work: git operations, GitHub CLI (`gh`), shell commands (`npm`, `mvnw`, `aws`), external API calls.

## Git Workflow

See `../CLAUDE.md` for full rules. Branch naming: `claude/<short-description>`. You may create branches, commit, push, open PRs. You may NOT merge PRs, push to main, delete branches, or rewrite history.

## Test Commands

Run in sequence to verify code works:
```bash
npm test                              # Unit + system tests (~4s)
./mvnw clean verify                   # Java CDK build
npm run test:submitVatBehaviour-proxy # E2E behaviour tests
```

Behaviour tests automatically tee output to `<projectName>.log` in the project root (e.g. `submitVatBehaviour.log`, `paymentBehaviour.log`). No manual piping needed.

Find failures:
```bash
grep -i -n -A 20 -E 'fail|error' submitVatBehaviour.log
```

## Active Test Monitoring (CRITICAL)

**You MUST actively monitor running tests, not sit waiting for an exit code.**

Behaviour tests (`npm run test:*Behaviour-*`) take approximately 2-3 minutes. Output is automatically teed to `<projectName>.log` in the project root. If a test appears stuck:

1. **Tail the log file** to see progress:
   ```bash
   tail -f paymentBehaviour.log  # or submitVatBehaviour.log, etc.
   ```

2. **Kill stuck processes** if no progress for 60+ seconds:
   ```bash
   pkill -f "playwright|server.js"
   ```

3. **Never wait indefinitely** - if a test hasn't produced output in 2 minutes, it's stuck.

**Signs a test is stuck:**
- No new output for 60+ seconds
- "Waiting for..." messages that don't resolve
- Test running longer than 5 minutes total

## HMRC Obligation Flexibility (CRITICAL)

**YOU CANNOT RELY UPON SPECIFIC OBLIGATIONS COMING BACK.**

- HMRC obligations are unpredictable
- Period keys are opaque and cannot be calculated
- Different environments return different obligations
- Tests MUST NOT be overfit to specific responses
- Simulator should NOT encourage hardcoding specific dates/periods

See `_developers/archive/OBLIGATION_FLEXIBILITY_FIX.md` for detailed guidance.

## Target Directory Access

The `./target` directory is always accessible - you do not need to ask about accessing it. This directory contains:
- Build artifacts from Maven CDK builds
- Browser test results and screenshots
- Playwright reports and traces

Behaviour test logs are in the project root (e.g. `submitVatBehaviour.log`, `paymentBehaviour.log`) — automatically created by the npm scripts via `tee`.

Use `./target` freely for build artifacts, results, and debugging. Do not ask for permission to access files in `./target`.

## Bash Command Construction (Permission System)

The permission system matches from the **start of the command string**. When you chain commands with `;` or `&&`, only the first command's pattern is matched.

**Do NOT** construct compound commands like:
```bash
# Bad - permission matches "pkill" not "npm run"
pkill -f "playwright"; sleep 2; npm run test:foo > target/output.txt 2>&1
```

**Instead**, run commands separately:
```bash
# Step 1: Clean up
pkill -f "playwright|server.js"

# Step 2: Wait
sleep 2

# Step 3: Run test (output is automatically teed to <projectName>.log)
npm run test:submitVatBehaviour-proxy
```

Behaviour test npm scripts already include `2>&1 | tee <projectName>.log`, so no manual output capture is needed.

## Deployment & Infrastructure Workflow

**Hybrid Orchestration Approach**: You can autonomously handle the commit/push/monitor cycle for infrastructure deployments.

### Permissions
At the start of each session where deployment work is needed, request permission to:
- Use GitHub CLI (`gh`) commands for: push, workflow monitoring, and log retrieval
- Commit and push to feature branches (following Git Workflow rules above)
- Monitor GitHub Actions workflows until completion

### Deployment Cycle (Steps 3.1-3.4)

When implementing features that require infrastructure validation:

1. **Local validation first** (3.1):
   ```bash
   npm test
   ./mvnw clean verify
   npm run test:submitVatBehaviour-proxy
   ```
   Ensure all tests pass locally before pushing.

2. **Commit and push** (3.2):
   ```bash
   git add [files]
   git commit -m "descriptive message"
   git push origin claude/<branch-name>
   ```
   This triggers feature branch deployment via GitHub Actions.

3. **Monitor deployment** (3.3):
   ```bash
   # Watch workflow status
   gh run list --branch claude/<branch-name> --limit 5

   # Get specific workflow run details
   gh run view <run-id>

   # Stream logs for active run
   gh run watch <run-id>

   # Download logs for completed run if needed
   gh run view <run-id> --log
   ```

   **Wait for deployment completion**: Poll every 30-60 seconds until workflow completes.

   **Interpret failures**: Analyze GitHub Actions logs for:
   - CloudFormation stack errors (stuck/failed states)
   - Lambda deployment issues
   - Resource creation timeouts
   - IAM permission problems

   If deployment fails, diagnose from logs and iterate back to step 1.

4. **Validate against AWS deployment** (3.4):
   ```bash
   # Run Playwright tests against CI environment
   npm run test:submitVatBehaviour-ci
   ```

   If tests fail against AWS but passed locally, investigate environment-specific issues:
   - Check AWS-specific configuration in GitHub Actions logs
   - Compare `.env.proxy` vs `.env.ci` settings
   - Look for infrastructure state issues in deployment logs

### Iteration Strategy

- **Success path**: Local tests pass → Push → Deployment succeeds → AWS tests pass → Done
- **Failure at deployment**: Analyze logs → Fix infrastructure code → Back to step 1
- **Failure at AWS tests**: Compare local vs AWS behavior → Fix environment-specific issues → Back to step 1

### Key Principles

- All deployment validation is available through GitHub Actions - no direct AWS console access needed
- Deployment feedback loop is slower than local testing - expect 2-5 minute wait times
- Always capture and analyze full logs when debugging infrastructure issues
- Infrastructure errors are often in CloudFormation events or Lambda initialization logs

### Lean App Deployment (No CDK)

For rapid iteration on `./app` code or `./web/public` assets without full CDK deploy (~15-25 min), use the lean deploy script which directly updates Lambda images and S3 assets (~3-5 min):

```bash
# Assume role first
. ./scripts/aws-assume-submit-deployment-role.sh

# Full lean deploy to last-known-good CI deployment
npm run deploy:app-ci

# Deploy to a specific deployment
npm run deploy:app-ci -- --deployment ci-leanbuild

# Only update web assets (skip Docker build + Lambda updates)
npm run deploy:app-ci -- --skip-docker --skip-lambdas

# Only update Lambda code (skip web assets + CloudFront invalidation)
npm run deploy:app-ci -- --skip-web

# Production
npm run deploy:app-prod
```

**What it does** (5 steps):
1. Resolves deployment name (from `--deployment`, `DEPLOYMENT_NAME` env var, or SSM)
2. Builds ARM64 Docker image and pushes to ECR (eu-west-2 + us-east-1)
3. Updates all Lambda functions (update code, publish version, update `pc` alias)
4. Syncs web assets to S3 (with RUM injection, submit.env generation)
5. Invalidates CloudFront (same 43 paths as PublishStack)

**Verify after lean deploy:**
```bash
npm run test:submitVatBehaviour-ci
```

**Important**: Lean deploy creates CloudFormation drift (intentional). The next full `deploy.yml` run reconciles all state via CDK.

## Simulator Website (CRITICAL)

**Never edit files in `web/public-simulator/` directly.** This directory is an automated export/build of the main site in `web/public/`. All changes must be made in `web/public/` and the simulator version will be regenerated from it. Editing the simulator files directly will result in changes being overwritten on the next build.

## Code Quality Rules

See `../CLAUDE.md` for shared rules. Additional submit-specific rules:

- **No "legacy" support code** — code that accepts parameters and ignores them is toxic. If a parameter isn't used, remove it.
- **No backwards-compatible aliases** — when renaming a function/export, update ALL callers in this repository. All code in this repo can be refactored together.
- **No server-side fallbacks to favor tests** — don't add `|| process.env.X` fallbacks in production code to work around test setup issues.
- Only run `npm run linting-fix && npm run formatting-fix` when specifically asked

## API Error Handling (CRITICAL)

**API endpoints (`/api/*`) must ALWAYS return JSON responses, NEVER HTML.**

- CloudFront custom error responses apply GLOBALLY to all origins (S3 AND API Gateway)
- Do NOT configure CloudFront `.errorResponses()` - it breaks API JSON error handling
- When debugging "Unexpected token '<'" JSON parse errors, check CloudFront error config
- Test error cases (404, 500) against deployed AWS, not just local Express server
- Lambda functions must return proper JSON error responses via `httpResponseHelper.js`
- Express server routes and API Gateway routes MUST match exactly (path params vs query params)

## Four-Tier Testing Pyramid

| Tier | Location | Command | Focus |
|------|----------|---------|-------|
| Unit | `app/unit-tests/`, `web/unit-tests/` | `npm run test:unit` | Business logic |
| System | `app/system-tests/` | `npm run test:system` | Docker integration |
| Browser | `web/browser-tests/` | `npm run test:browser` | UI components |
| Behaviour | `behaviour-tests/` | `npm run test:submitVatBehaviour-proxy` | E2E journeys |

## Environments

| Environment | File | Purpose |
|-------------|------|---------|
| test | `.env.test` | Unit/system tests (mocked) |
| simulator | `.env.simulator` | Local dev with HTTP simulator (no Docker, no external config) |
| proxy | `.env.proxy` | Local dev (native HTTPS on `local.submit.diyaccounting.co.uk`, Docker OAuth2, dynalite) |
| ci | `.env.ci` | CI with real AWS |
| prod | `.env.prod` | Production |

**Secrets in `.env` (gitignored):** The root `.env` file contains real API keys and secrets (Telegram, Google, Cognito). HMRC and Stripe secrets for the proxy variant come from AWS Secrets Manager via `scripts/proxy-secrets.sh`, not from `.env`. Environment-specific `.env.*` files reference price IDs and ARNs but NOT secret keys — those come from `.env` (local) or AWS Secrets Manager (deployed). When CI and prod need different webhook secrets, each resolves its own from Secrets Manager ARNs.

**Stripe webhook setup:** Run `STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.js` to create/verify webhook endpoints for CI and prod. Local dev registers no endpoint: `stripe listen` forwards events directly and prints a per-session signing secret.

## Naming Conventions

- Lambda files: `{feature}{Method}.js` (e.g., `hmrcVatReturnPost.js`)
- CDK stacks: `{Purpose}Stack` (e.g., `AuthStack`)
- DynamoDB tables: `{env}-env-{purpose}`
- npm scripts: colon separator for variants (e.g., `test:unit`)

## Infrastructure Teardown (Submit-Specific)

See `../CLAUDE.md` for core teardown philosophy. Submit-specific details:

### RemovalPolicy Guidelines

**Use `DESTROY` for everything except:**
- Lambda Versions with provisioned concurrency (RETAIN prevents CloudFormation deadlocks — AWS bug workaround, not data protection)

**Customer data protection strategy:**
- DynamoDB: PITR enabled (35-day recovery window)
- Backups: Cross-account copying (planned)
- HMRC receipts: 7-year TTL with PITR backup

### Stack Architecture for Teardown

- **App stacks** (per-deployment): Fully teardown-able, no persistent state
- **Env stacks** (per-environment): Teardown-able except customer data tables which have PITR backups
- **Logs**: Operational logs in env stacks (not app stacks) to allow app teardown without losing debugging info

### Idempotent Deployments

When CloudFormation references resources that might not exist (e.g., log groups deleted externally):
- Use `AwsCustomResource` with `ignoreErrorCodesMatching` to create resources idempotently before they're referenced
- Never assume CloudFormation state matches AWS reality
- See `ObservabilityStack.java` CloudTrail LogGroup pattern for example

## Before Making Infrastructure Changes

See `../CLAUDE.md` for shared rules. Additionally: **No manual interventions** — never suggest AWS CLI commands, console actions, or workflow hacks. Run `./mvnw clean verify` before considering any infrastructure change complete.

## AWS Write Operations

See `../CLAUDE.md` for full rules. **Always ask before writing to AWS.** Submit-specific paths:

- **Secrets**: GitHub Actions Secrets/Variables → `deploy-environment.yml` → AWS Secrets Manager
- **Infrastructure**: CDK code → git push → GitHub Actions deploy
- If you need to persist data between sessions and GitHub Actions is not appropriate, ask the user.

## Confirm Means Stop and Wait

See `../CLAUDE.md` — present the command, STOP, wait for explicit approval before executing.

## AWS Accounts (Submit-Specific)

This repo deploys to two accounts: **submit-ci** (367191799875) and **submit-prod** (972912397388). See `../CLAUDE.md` for the full account table.

**Current state**: Gateway and spreadsheets are fully migrated to their own accounts. Submit CI is migrating to 367191799875. Submit prod is still in 887764105431 (migrating to 972912397388 in Phase 1.4). Root DNS and holding page remain in 887764105431 permanently.

**GitHub Actions variables**: `SUBMIT_*` are environment-scoped (ci/prod have different values). `ROOT_*`, `GATEWAY_*`, `SPREADSHEETS_*` are repo-level.

See `PLAN_ACCOUNT_SEPARATION.md` for the full migration plan.

## AWS CLI Access (Local Development)

**Read-only AWS operations are always permitted.** You may always query AWS resources (describe, get, list, logs, etc.) without asking for permission. This includes CloudFormation stack status, Lambda configuration, CloudWatch logs, DynamoDB scans, CloudFront distributions, and any other read-only API calls needed for investigation and debugging.

Use SSO profiles to access any account. Login once, then use `--profile` on each command:

```bash
aws sso login --sso-session diyaccounting
aws --profile submit-ci cloudformation describe-stacks --stack-name ci-env-IdentityStack
aws --profile submit-prod dynamodb scan --table-name prod-env-bundles
aws --profile management route53 list-hosted-zones
```

**SSO profiles** (configured in `~/.aws/config`):

| Profile | Account | Purpose |
|---------|---------|---------|
| `management` | 887764105431 | Route53, Organizations, IAM Identity Center |
| `gateway` | 283165661847 | Gateway static site |
| `spreadsheets` | 064390746177 | Spreadsheets static site |
| `submit-ci` | 367191799875 | Submit CI deployments |
| `submit-prod` | 972912397388 | Submit prod deployments |
| `submit-backup` | 914216784828 | Cross-account backup vault |

SSO credentials last ~8-12 hours across all profiles. When an AWS command fails with an expired token or `UnauthorizedSSOTokenError`, ask the user to run `aws sso login --sso-session diyaccounting` to refresh the session, then retry.

**For scripts that need AWS env vars** (e.g., Cognito test scripts), export the profile:
```bash
export AWS_PROFILE=submit-ci
npm run test:enableCognitoNative
```

**Legacy assume-role scripts** (still work for submit-prod in 887764105431):
- `scripts/aws-assume-submit-deployment-role.sh` — sources env vars into the current shell
- When using these, combine with the aws command in a single Bash call (env vars don't persist between calls)

**Stack naming patterns:**
- Environment stacks: `{env}-env-{StackName}` (e.g., `ci-env-IdentityStack`, `prod-env-DataStack`)
- Application stacks: `{deployment}-app-{StackName}` (e.g., `ci-cleanlogin-app-AuthStack`)

See `PLAN_ACCOUNT_SEPARATION.md` for multi-account architecture and role structure.

## Running Behaviour Tests Against Deployed Environments (Fast Turnaround)

For faster iteration than pushing commits and waiting for GitHub Actions (`synthetic-test.yml` or `deploy.yml`), run behaviour tests directly against ci or prod from your local machine.

### Prerequisites

- AWS CLI installed and configured with SSO profiles (see AWS CLI Access above)
- Logged in: `aws sso login --sso-session diyaccounting`

### Workflow

**1. Set the AWS profile for the target environment:**
```bash
export AWS_PROFILE=submit-ci    # or submit-prod
```

**2. Enable Cognito native auth and refresh the test user:**
```bash
# For ci environment (default)
npm run test:enableCognitoNative

# For prod environment
npm run test:enableCognitoNative -- prod
```
This script:
- Adds `COGNITO` to the Hosted UI's SupportedIdentityProviders (enables email/password login)
- Creates the `local` lane's durable test user if it is missing, then rotates its password and TOTP device
- Saves credentials to `cognito-native-test-credentials.json` (in project root)
- Prints the export commands and test command to run

**3. Run behaviour tests:**
```bash
# Use the credentials printed by the enable script
TEST_AUTH_USERNAME='synthetic-local@test.diyaccounting.co.uk' TEST_AUTH_PASSWORD='TestXxx!Aa1' npm run test:submitVatBehaviour-ci

# Or for prod
TEST_AUTH_USERNAME='...' TEST_AUTH_PASSWORD='...' npm run test:submitVatBehaviour-prod
```

Available behaviour test variants: `-ci` and `-prod` (see package.json for full list).

**4. Clean up - disable Cognito native auth:**
```bash
npm run test:disableCognitoNative
```
This script:
- Reads the saved credentials from `cognito-native-test-credentials.json`
- Removes `COGNITO` from SupportedIdentityProviders (restores federated-only login)
- Deletes the credentials file

The test user stays. Cognito bills monthly active users, so every automated lane keeps one
durable user (`synthetic-<lane>@test.diyaccounting.co.uk`) and rotates its password and TOTP
device per run instead of creating and deleting a user each time.

### Important Notes

- **Always clean up** after testing - the credentials file acts as a lock, and native auth stays on until you run the disable script
- If the enable script says credentials already exist, run `npm run test:disableCognitoNative` first
- The scripts are idempotent: enabling when already enabled or disabling when already disabled is a no-op
- For auth-specific tests, use `npm run test:authBehaviour-ci` or `npm run test:authBehaviour-prod`

## Multi-Site Deployments

This repository also deploys the spreadsheets sibling site via a dedicated workflow:

| Site | Workflow | Source |
|------|----------|--------|
| spreadsheets.diyaccounting.co.uk | `deploy-spreadsheets.yml` | `web/spreadsheets.diyaccounting.co.uk/` |

Gateway (diyaccounting.co.uk) is managed by `diy-accounting-uk/www.diyaccounting.co.uk`. Root DNS and holding page are managed by `diy-accounting-uk/root.diyaccounting.co.uk`.

Behaviour tests exist for spreadsheets (`test:spreadsheetsBehaviour-*`).

**Stripe Payment Links** are live on the spreadsheets site for donations (see `_developers/archive/PLAN_STRIPE_1.md` — completed). Submit site subscription payments are planned in `PLAN_PAYMENT_INTEGRATION.md`.

## Security Checklist

See `../CLAUDE.md` for shared rules. Submit-specific checks:

- Verify OAuth state parameter validation
- Check JWT validation in `app/functions/auth/customAuthorizer.js`

## Corpus search (corpus-loom MCP)

The `corpus-loom` MCP tools (`search`, `get_document`, `related_entities`) query one hybrid BM25+semantic index (~48.7k documents) spanning the whole business, not just this repo:

- **Repos**: all five diy-accounting-uk checkouts — tracked files at main plus full commit logs. This repo's source name is `submit`.
- **`drive`**: the DIY Accounting Limited Google Drive mirror — finance, minutes, personnel, product, support, technology, marketing, facilities. PDF/doc/docx content-indexed; spreadsheets metadata-only (findable by name).
- **`mail-antony` / `mail-support`**: complete Gmail backups of antony@ and support@diyaccounting.co.uk (2012→present).
- **Entities**: email addresses, seeded orgs (NatWest, HMRC, Companies House, Stripe, PayPal), Drive categories — `related_entities` links a person/org across mail, documents, and commits.

Source names for filters: `drive`, `mail-antony`, `mail-support`, `submit`, `spreadsheets`, `www`, `root`, `archive`. Drive `finance/` and `personnel/` are lexical-only (deliberately never embedded) — exact-token queries work there, paraphrase queries don't. Use this before grepping siblings or asking the operator for history.
