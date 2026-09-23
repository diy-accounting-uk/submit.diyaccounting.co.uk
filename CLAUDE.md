<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Claude Code Memory - DIY Accounting Submit

> **Shared conventions** (git workflow, AWS accounts, code quality, confirm behavior, security): See the shared conventions section at the end of this file

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
- `.github/copilot-instructions.md` - GitHub Copilot (code review focus)

## Skills

Skills live at `.claude/skills/<name>/SKILL.md`.

- `.claude/skills/plain-prose/SKILL.md` — writing rules for plain, human prose; follow this for all human-facing text (docs, comments, chat)
- `.claude/skills/do-next/SKILL.md` — dispatch `NEXT.md`'s open items as worktree-isolated sub-agents
- `.claude/skills/watch/SKILL.md` — watch GitHub CI on main and every open PR's head branch until the whole scope is green, and fix what goes red; invoke as `/watch`
- `.claude/skills/stripe-catalogue-sync/SKILL.md` — sync Stripe products and prices from the bundle catalogue, test then live, and land the price ids
- `.claude/skills/site-video-capture/SKILL.md` — record a video of the real site from a scene script (`videos/*.json`)
- `.claude/skills/video-publish/SKILL.md` — publish the recordings to the YouTube channel: fetch them from their capture runs, check them, upload unlisted with the stored credentials, flip public; carries the once-per-project console walk-through
- `.claude/skills/session-report/SKILL.md` — write the session's report (`REPORT_SESSION_<id>_<date>.md`) from measured figures: what landed, what made it efficient, where it lost time or money, one board row per loss; invoke as `/session-report`
- `.claude/skills/refine/SKILL.md` — the four passes over `NEXT.md` before a wave: references against `origin/main`, briefs complete enough for their sub-agent with the lowest model that fits, shared facts written into every row they help, and the human step split out of mixed rows; invoke as `/refine`
- `.claude/skills/iterate/SKILL.md` — the delivery cycle run unattended: board, a wave of isolated sub-agent batches on one branch and one PR, watch, auto-merge, watch, board, again, until no machine-only row can start; a Plan–Do–Check–Act cycle in the orchestrator–workers shape; invoke as `/iterate`
- `.claude/skills/clean/SKILL.md` — gather stale deployments, merged branches, worktrees of merged branches, logs and test artefacts, and build output; ask once; remove every agreed category in one go; then fetch, switch to main and pull when nothing is in progress; invoke as `/clean`
- `.claude/skills/vat-submission-failure-alarm-user-lookup/SKILL.md` — from a submission-failure alarm, find the customer, what HMRC said and whether they wrote in, read-only and without scanning a customer table

## Permission Handling

See the shared conventions section at the end of this file for full rules. Common permissions for submit work: git operations, GitHub CLI (`gh`), shell commands (`npm`, `mvnw`, `aws`), external API calls.

## Git Workflow

See the shared conventions section at the end of this file for full rules. You may create branches, commit, push, open PRs. You may NOT push
to main, delete branches, or rewrite history.

Merge strategy — squash at the worktree, `--merge` to `main`, rebase only on a conflict or an
overlap, one deploy per head — is in the shared conventions section at the end of this file under Git Workflow.

**Merging a PR happens only through `/auto-merge`**, which is the single sanctioned path and merges
nothing that has not passed every gate it defines. A bare `gh pr merge` outside that skill is
forbidden however green the checks look. `/auto-merge-dry-run` shows what would merge and changes
nothing.

`git branch -D claude/*` after a proven squash merge (the do-next skill checks that the commit landed
via diff) is available through the operator's `.claude/settings.json` allowlist; that allowlist is
an operator decision, not Claude's to make.

Branch naming: `claude/<ns>-<n>-<topic>` for one of a series, `claude/<ns>-<topic>` otherwise.
`<ns>` is a short tag for the area (`ltd`, `itsa`, `vat`, `ops`, `cdk`, `docs`; `b` for a board
batch), `<n>` the series number, `<topic>` one or two words. A narrow branch dropdown shows only
the first characters after `claude/`, so they carry the distinction: `claude/ltd-1-ch-file`,
`claude/ltd-2-ch-file`, `claude/ltd-hmrc-submit`, `claude/b7-board`. Never a generic preamble
or a series number at the end (`claude/a-few-batches-1`,
`claude/consistent-preamble-hiding-specificity`).

## Worktree and branch removal is the operator's

`git worktree remove`, `git branch -d` and `git branch -D` are denied to the session in this
environment; that is the environment, not a problem to solve. When a worktree or a local branch is
no longer needed (its content is proven on the batch or on `main`), print the removal as one
command for the operator, in a fenced block with the `!` prefix, at the moment it stops being
needed, and again in every `/board` render's Part 5 until it is gone. Nothing waits on the removal:
a stale worktree or branch left on disk blocks no merge, no dispatch and no push.

## A direct question gets its answer as the whole reply

When the operator asks a question, answer it in a reply that ends the turn, with every link and
command in full. Resume the work in the next turn. The operator's client shows only a summary of a
running turn, so an answer given inside one never reaches them.

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

See `../developers/submit/archive/OBLIGATION_FLEXIBILITY_FIX.md` for detailed guidance.

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

### A redeploy of the same branch needs an explicit deployment name

`.github/actions/get-names/action.yml` derives a ci deployment name from a hash of the **branch
name**, not the commit, so every deploy of the same branch resolves to the same name and updates
the same live stacks. That deployment's `SelfDestructStack` timer is anchored to its first
`CreationTime` and is not reset by the redeploy, so it can still fire against those stacks while
or after the redeploy runs. The failure then presents as several `deploy.yml` stack jobs failing,
not as a name collision.

For an intentional second deploy of a branch, pass an explicit name:
```bash
gh workflow run deploy.yml -f deployment-name=<unique>
```

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

See the shared conventions section at the end of this file for shared rules. Additional submit-specific rules:

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

**Stripe webhook setup:** Run `node infra/stripe/stripe-sync.js --environment ci --mode test --apply` to create/verify webhook endpoints for CI and prod. Local dev registers no endpoint: `stripe listen` forwards events directly and prints a per-session signing secret.

## Naming Conventions

- Lambda files: `{feature}{Method}.js` (e.g., `hmrcVatReturnPost.js`)
- CDK stacks: `{Purpose}Stack` (e.g., `AuthStack`)
- DynamoDB tables: `{env}-env-{purpose}`
- npm scripts: colon separator for variants (e.g., `test:unit`)

## Infrastructure Teardown (Submit-Specific)

See the shared conventions section at the end of this file for core teardown philosophy. Submit-specific details:

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

See the shared conventions section at the end of this file for shared rules. Additionally: **No manual interventions** — never suggest AWS CLI commands, console actions, or workflow hacks. Run `./mvnw clean verify` before considering any infrastructure change complete.

## AWS Write Operations

See the shared conventions section at the end of this file for full rules. **Always ask before writing to AWS.** Submit-specific paths:

- **Secrets**: GitHub Actions Secrets/Variables → `deploy-environment.yml` → AWS Secrets Manager
- **Infrastructure**: CDK code → git push → GitHub Actions deploy
- If you need to persist data between sessions and GitHub Actions is not appropriate, ask the user.

## Confirm Means Stop and Wait

See the shared conventions section at the end of this file — present the command, STOP, wait for explicit approval before executing.

## AWS Accounts (Submit-Specific)

This repo deploys to two accounts: **submit-ci** (367191799875) and **submit-prod** (972912397388). See the shared conventions section at the end of this file for the full account table.

**Current state**: Gateway and spreadsheets are fully migrated to their own accounts. Submit CI is migrating to 367191799875. Submit prod is still in 887764105431 (migrating to 972912397388 in Phase 1.4). Root DNS and holding page remain in 887764105431 permanently.

**GitHub Actions variables**: `SUBMIT_*` are environment-scoped (ci/prod have different values). `ROOT_*`, `GATEWAY_*`, `SPREADSHEETS_*` are repo-level.

See `PLAN_ACCOUNT_SEPARATION.md` for the full migration plan.

## AWS CLI Access (Local Development)

**Read-only AWS operations are always permitted.** You may always query AWS resources (describe, get, list, logs, etc.) without asking for permission. This includes CloudFormation stack status, Lambda configuration, CloudWatch logs, DynamoDB scans, CloudFront distributions, and any other read-only API calls needed for investigation and debugging.

Before dispatching a wave of sub-agents that read AWS, run `aws --profile submit-ci sts get-caller-identity` and ask the user to log in up front if needed, rather than waiting for the first agent to fail with `UnauthorizedSSOTokenError`.

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

For faster iteration than pushing commits and waiting for GitHub Actions (`probe-test.yml` or `deploy.yml`), run behaviour tests directly against ci or prod from your local machine.

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

The spreadsheets site is managed by the sibling repository `diy-accounting-uk/spreadsheets.diyaccounting.co.uk`. Gateway (diyaccounting.co.uk) is managed by `diy-accounting-uk/www.diyaccounting.co.uk`. Root DNS and holding page are managed by `diy-accounting-uk/root.diyaccounting.co.uk`.

Behaviour tests exist for spreadsheets (`test:spreadsheetsBehaviour-*`).

**Stripe Payment Links** are live on the spreadsheets site for donations (see `../developers/submit/archive/PLAN_STRIPE_1.md` — completed). Submit site subscription payments are planned in `PLAN_PAYMENT_INTEGRATION.md`.

## Security Checklist

See the shared conventions section at the end of this file for shared rules. Submit-specific checks:

- Verify OAuth state parameter validation
- Check JWT validation in `app/functions/auth/customAuthorizer.js`

## Corpus search (corpus-loom MCP)

The `corpus-loom` MCP tools (`search`, `get_document`, `related_entities`) query one hybrid BM25+semantic index (~48.7k documents) spanning the whole business, not just this repo:

- **Repos**: all five diy-accounting-uk checkouts — tracked files at main plus full commit logs. This repo's source name is `submit`.
- **`drive`**: the DIY Accounting Limited Google Drive mirror — finance, minutes, personnel, product, support, technology, marketing, facilities. PDF/doc/docx content-indexed; spreadsheets metadata-only (findable by name).
- **`mail-antony` / `mail-support`**: complete Gmail backups of antony@ and support@diyaccounting.co.uk (2012→present).
- **Entities**: email addresses, seeded orgs (NatWest, HMRC, Companies House, Stripe, PayPal), Drive categories — `related_entities` links a person/org across mail, documents, and commits.

Source names for filters: `drive`, `mail-antony`, `mail-support`, `submit`, `spreadsheets`, `www`, `root`, `archive`. Drive `finance/` and `personnel/` are lexical-only (deliberately never embedded) — exact-token queries work there, paraphrase queries don't. Use this before grepping siblings or asking the operator for history.

## Shared conventions (the diy-accounting-limited estate)

This section is replicated verbatim in every repository of the diy-accounting-limited estate
(`submit.diyaccounting.co.uk`, `spreadsheets.diyaccounting.co.uk`, `www.diyaccounting.co.uk`,
`root.diyaccounting.co.uk`, `diy-accounting-archive`) so each repository stands alone. A change
to it is made in all of them in the same session.

### An approved plan is the authorisation — never stop to ask if you should continue

If the operator approved a plan, or the prompt says "complete X", **work it to the end and do not ask permission to keep going**. Report progress as you land it and carry straight on to the next item. The operator has left; a question in an empty room is just an idle session.

**A green test suite is a checkpoint, not a decision point.** Neither is a landed phase, a clean commit, or a tidy summary. Those are the middle of the work, and they feel like the end because they feel finished — that is the trap. The pull is strongest exactly when a chunk completes well.

Only three things stop the work: a hard safety rule; a genuine blocker with no next action left anywhere in the plan; or the operator saying stop. "Shall I continue?", "Want me to carry on with the rest?" — if the plan already answers it, the question is not caution, it is the session ending itself for no reason. Ask only what the plan genuinely does not decide, and ask it *before* the work, not as a way to pause in the middle.

**The companion rule: write status as you go, not at the end.** If a phase closes, mark it in its plan doc and delete its line from any live board (e.g. NEXT.md) **in the same commit as the fix**. Status written at the end is status never written. Sub-agents get the same instruction, and the right to edit their own rows.

### Working model: coordinator + background sub-agents

Run big tasks in **concurrent background sub-agents** and keep the main chat free — the main session is the COORDINATOR (plans, launches, integrates, answers the operator), not the worker.

- Decompose into workstreams with **clear file-ownership boundaries**; serialize on shared files.
- **Pick each sub-agent's model deliberately, and pick the lowest tier that meets the task's needs** — the ladder runs Fable to Opus to Sonnet to Haiku. Subtle engine/design work earns a top tier; well-specified coding earns Sonnet; mechanical sweeps earn Haiku. **Group tasks that need a similar level into the same workstream** — don't staple one hard task onto a batch of easy ones, because the hard task then prices the whole batch at the top tier.
- **Keep the chat for chat**: anything long-running (builds, test sweeps, index builds, deploys) executes as a BACKGROUND task; the main session launches it, keeps coordinating, and collects results on the completion notification.
- **Before merging a worktree, check `git status --short` inside it, not just its last commit.** A sub-agent can leave real, uncommitted work behind that vanishes when the worktree is removed — the coordinator gets exactly one look.
- **Brief every dispatch that shares a working tree**: the sub-agent may only `git add` its own files and commit — never `stash`/`reset`/`checkout --`/`clean`.
- **A sub-agent's own "completed" claim is not proof.** Check for a live process, then read its worktree's `git log`/`git status`, before accepting it as done or resuming it. Never resume a round whose worktree has already been removed — dispatch a fresh one.
- **Hand the worktree (and its branch) to the operator for removal as soon as its commit is merged**: `git worktree remove` and `git branch -D` are denied to sessions here, so print the one command with the `!` prefix at that moment and in every board render until it is gone. A stale worktree blocks nothing.
- **Publish continuously, batch what lands while checks run.** Merge each sub-agent's verified commit as soon as it's ready; don't hold everything for one end-of-session sweep.
- **Never refer to a sub-agent by its raw agent ID in prose** — hex IDs are as unreadable as UUIDs. Give each agent a short human-readable label from its task the moment it's dispatched ("the adapters agent", "the headers agent") and use that label in every status update. Raw IDs belong only in tool-call parameters.

### Test the blast radius, not the whole suite

Mid-task, run only what your change can actually reach: the file you edited and whatever imports it, plus whatever the change's own reason names. **Only one moment earns the full suite: when the change is about to become someone else's problem** — a push, a PR, anything that reaches CI or another person. Each repo's CLAUDE.md names its actual commands (`./mvnw clean verify`, `npm test`, behaviour tests). Two traps this does not excuse: a radius you cannot see is a real reason to run the suite (say so), and a shared generated artifact is wider than it looks — follow the generator, not the diff.

### Always tee to a file before filtering

Never pipe anything into `tail`, `head`, `grep` or any other filter without teeing it first:

    cmd 2>&1 | tee /tmp/some-file.log | tail -20

You still get the quick glance, and the full output stays on disk when the part you need turns out to sit somewhere else. **The trigger is the pipe, not the duration.**

Redirecting also changes what a tool prints. Vitest and Playwright both detect a non-TTY and switch reporter: per-file progress stops, and the summary arrives only at the end. So a log that is empty part-way through says nothing about whether the run is progressing, and treating its silence as a symptom sends you diagnosing a stall that is not there. The process table answers it in one call — a live child, or CPU time moving. `head` is the worst case: once it has its N lines the producer gets SIGPIPE and is killed part-way through, reporting like a clean run. And a command you have already seen run long goes to the background, full stop — waiting uses the task-wait mechanism, never a foreground sleep loop.

### Concurrent sessions — Cowork and Claude Code share this folder

This directory is mounted by Claude Desktop (chat projects and Cowork sessions) **and** worked in by Claude Code terminal sessions — started here at the workspace root or inside any repo subdirectory. Whichever kind of session you are, assume you are not the only writer:

- **Files may change under you.** Re-read a file before editing it if any time has passed; never assume your last read is current.
- **Git trees may have another session's work in flight** (branches, uncommitted changes). Check `git status` before committing; commit only changes you made; never `reset --hard`, `clean`, or `stash` a tree you didn't dirty.
- **`index/corpus.db` is SQLite (WAL)** — a busy/locked error usually means another session is updating the index; retry, don't diagnose corruption.
- **Cowork specifically**: your shell is a Linux VM. macOS binaries here (`index/.venv/*`, `rclone`, `gyb`) won't execute, and host paths outside this folder (e.g. `~/Library/...`) aren't reachable — for host-side actions, print a command for the operator to run in a host terminal or hand the task to a Claude Code session.
- The mirrors (`drive/`, `mail/`) and the index are maintained by host-side sync scripts and skills — from Cowork treat them strictly read-only.
- Sessions message each other through the inbox protocol — see "Inter-session messaging (inboxes)" below.

### Inter-session messaging (inboxes)

Claude sessions on this machine pass messages as plain Markdown, no daemon: append to the recipient's inbox, read and mark your own. Full protocol: `~/.claude/inboxes/README.md`.

**Two kinds of message, nothing else**, both about a change in the recipient's repository: a change you need them to make because you cannot, or a change you have made that their own work is blocked on. Never status, progress, "one line here when it lands", ideas, suggestions or acknowledgements, and never to track what another session is doing — commits, plan documents and the corpus index are the record. The test: does this ask them to change something, or tell them something they are blocked on has changed? If neither, do not send it.

**Message format** (append to the *recipient's* inbox; stamp with `date -u +%FT%TZ`):

```

### [unread] <ISO-8601 UTC> — from: <your-handle>
<the request, or the report>
```

On start and between tasks, read your own inbox, act on every `[unread]` block, change its marker to `[read]`, and trim old `[read]` blocks once handled. Acting on a message is the reply: write back only to say you made the change asked for, or that you will not. Cooperative cadence — no polling loops, and another session's repository state is never yours to inspect or report.

**This workspace's handle is `diyaccounting`** → host inbox `~/.claude/inboxes/diyaccounting.md`. Other active handles are listed in the inboxes README (`marginalia`, `intention`, `tmct`, …).

**Desktop/Cowork bridge**: sessions that can't reach `~/.claude/` (Cowork's VM, Desktop chats) use `INBOX.md` at this workspace root instead — same message format, addressed `from: cowork` / `from: desktop-chat` (or to them by writing under a `## [unread] … — to: cowork` header). Host Claude Code sessions working in this workspace check BOTH `~/.claude/inboxes/diyaccounting.md` and `INBOX.md` on start and between tasks, and relay anything addressed onward. `NEXT.md` stays for work items; `INBOX.md` is for messages.

### Default to contraction, not expansion

When asked to make a document shorter, forward-looking, or less historical, the default operation on a problem you find is DELETE or COMPRESS TO ONE LINE — never explain-and-caveat. Adding a clarifying paragraph or nuance is expansion, even when it feels like fixing. Before writing a fix, ask "does this belong here at all," not just "is this worded correctly" — the second question produces more words every time. A section whose label is backward-looking (e.g. "DONE") doesn't belong in a forward-looking doc regardless of how accurate its wording is.

### Workspace Structure

This is a **multi-project workspace**. Each subdirectory is its own git repository. Always `cd` into the correct subdirectory before running git commands.

All repositories live in the **`diy-accounting-uk` GitHub org** — the `antonycc/*` forks are archived pre-migration copies; never push to them.

| Directory | Repository | Status | Purpose |
|-----------|-----------|--------|---------|
| `submit.diyaccounting.co.uk/` | `diy-accounting-uk/submit.diyaccounting.co.uk` | **Active** | VAT submission app (Lambda, DynamoDB, Cognito, HMRC MTD API); primary development focus |
| `spreadsheets.diyaccounting.co.uk/` | `diy-accounting-uk/spreadsheets.diyaccounting.co.uk` | **Active** | Spreadsheets site + package pipeline (S3 + CloudFront); nightly automated package commits |
| `www.diyaccounting.co.uk/` | `diy-accounting-uk/www.diyaccounting.co.uk` | **Active** | Gateway static site (S3 + CloudFront) |
| `root.diyaccounting.co.uk/` | `diy-accounting-uk/root.diyaccounting.co.uk` | **Active** | Root AWS account — Route53 DNS, holding page |
| `diy-accounting-archive/` | `diy-accounting-uk/diy-accounting-archive` | Archived | Pre-migration spreadsheets repo, kept for history — do not develop here |
| _not checked out here_ | `diy-accounting-uk/homebrew-diya-gl` | **Active** | Homebrew tap for `diya-gl`; `Formula/diya-gl.rb` is regenerated from the npm registry. Read it with `gh api`, don't clone it into this workspace |

**Each subdirectory has a `CLAUDE.md`** with project-specific instructions — always read it before working in that project.

**Maintenance skills** (in `.claude/skills/`): `repo-sync` (fetch + fast-forward all repos), `drive-sync` (refresh the Drive mirror), `mail-sync` (gyb Gmail backup), `reindex` (rebuild lookup indexes only).

#### Search hygiene

- **Prefer the `corpus-loom` MCP tools** (`search`, `get_document`, `related_entities`) for any cross-corpus question — they cover all five repos, the Drive mirror, and both mailboxes with hybrid BM25+semantic search and entity links. Registered in the workspace root and every repo directory.
- Never search or read `node_modules/`, `target/`, or generated package output (e.g. `spreadsheets.diyaccounting.co.uk/packages/`) — build artifacts, pure noise.
- To find a document under `drive/`, look it up in `drive/MANIFEST.md` first (or `corpus-loom` search) — don't open Office/PDF binaries speculatively.

### AWS Account Structure

```
AWS Organization Root (887764105431) ── Management
├── gateway ─────────── 283165661847 ── Workloads OU
├── spreadsheets ────── 064390746177 ── Workloads OU
├── submit-ci ──────── 367191799875 ── Workloads OU
├── submit-prod ────── 972912397388 ── Workloads OU
└── submit-backup ──── 914216784828 ── Backup OU
```

| Account | ID | Repository | SSO Profile |
|---------|-----|-----------|-------------|
| Management (root) | 887764105431 | `root.diyaccounting.co.uk` | `management` |
| gateway | 283165661847 | `www.diyaccounting.co.uk` | `gateway` |
| spreadsheets | 064390746177 | `spreadsheets.diyaccounting.co.uk` | `spreadsheets` |
| submit-ci | 367191799875 | `submit.diyaccounting.co.uk` | `submit-ci` |
| submit-prod | 972912397388 | `submit.diyaccounting.co.uk` | `submit-prod` |
| submit-backup | 914216784828 | — | `submit-backup` |

### AWS CLI Access

Use SSO profiles to access any account. Login once, then use `--profile` on each command:

```bash
aws sso login --sso-session diyaccounting
aws --profile submit-ci cloudformation describe-stacks --stack-name ci-env-IdentityStack
aws --profile management route53 list-hosted-zones
aws --profile gateway cloudfront list-distributions
```

SSO credentials last ~8-12 hours. When an AWS command fails with `UnauthorizedSSOTokenError`, ask the user to run `aws sso login --sso-session diyaccounting`.

**Read-only AWS operations are always permitted** (describe, get, list, scan, logs, etc.) — no need to ask.

### AWS Write Operations (CRITICAL)

**ALWAYS ask before writing to AWS.** Any mutating operation (create, update, delete) requires explicit user approval. Present the command, explain what it does, and wait for a "yes" before executing.

- **Preferred path for infrastructure**: CDK code → git push → GitHub Actions deploy
- **Preferred path for secrets**: GitHub Actions Secrets/Variables → deploy workflow → AWS Secrets Manager
- Direct AWS writes are the exception, not the norm

### Git Workflow

#### Commit attribution: one identity, provenance beside it

Every commit carries three trailers, in this order:

```
Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Model: <the exact model id of the session that wrote the commit, e.g. claude-opus-5[1m]>
Claude-Session: <the session url>
```

**`Co-Authored-By` never varies.** It is set from `~/.claude/settings.json`'s `attribution.commit`,
so it arrives identical in every session and no per-session instruction can change it. It answers
who is credited, and the answer is always the same.

**`Claude-Model` carries the model**, because that is provenance, not authorship — the equipment
used, not a co-author. Add it yourself from the model id in your own environment; nothing generates
it. It is expected to differ between commits.

Both facts were previously crammed into `Co-Authored-By`, which is why the history holds fifteen
different forms of it. Splitting them is what lets the identity stay fixed while the provenance
stays accurate. Existing commits are not rewritten.

**You may**: create branches, commit changes, push branches, open pull requests

**Docs exception (operator, 2026-08-24)**: commits touching ONLY `.md` files may be pushed
directly to `main` in all five repos — no branch or PR needed. Anything touching code,
workflows, or config still goes through a PR.

**You may NOT**: push code/config to main, delete branches, rewrite history

**Merging a PR happens only through `/auto-merge`.** That skill is the single sanctioned path, and
it merges nothing that has not passed every gate it defines: no unresolved review thread, no
uncommitted work in the branch's worktree, the branch not ahead of origin, the PR head equal to the
branch tip, and the latest run of every workflow on that head green. A bare `gh pr merge` outside
that skill is forbidden however green the checks look, because the gates are the point and a merge
is the one action here that cannot be undone by another commit. `/auto-merge-dry-run` shows what
would merge and changes nothing.

**Merge strategy, at every layer** (operator decision, 2026-09-13):

- **Worktree to batch: squash.** Each sub-agent's branch lands on the batch branch as one commit
  per task (`git merge --squash`, then one commit naming the item), so an agent's fixing commits
  fold into the task they fix.
- **Batch to `main`: `--merge`, never squash.** The task commits stay readable on `main`; a
  squash at the PR would throw away the only per-task history there is.
- **After one PR merges, the other open PRs are not rebased by default.** A rebase restarts the
  branch's whole deploy and starts a ci set, and several at once contend for the ci apex alias
  and the shared test users. `main`'s own deploy is the integration proof, and it rolls the apex
  back when a probe fails. The next candidate merges as it stands when GitHub reports it
  mergeable and its changed files do not intersect the merged PR's.
- **Rebase only on a conflict or an overlap**, locally first: rebase in the worktree, run the
  blast radius there, and push with `--force-with-lease` only when no deploy on that branch is
  in flight. A local sync costs nothing and can happen any time; the push is what waits.
- **One deploy per head.** When a named `deploy.yml` dispatch already covers a branch's head,
  cancel the push-triggered deploy of the same head in its first minute; two deploys of one head
  are pure cost and contention.

**Branch naming**: `claude/<ns>-<n>-<topic>` for one of a series, `claude/<ns>-<topic>` otherwise.
`<ns>` is a short tag for the area (`ltd`, `itsa`, `vat`, `ops`, `cdk`, `docs`; `b` for a board
batch), `<n>` the series number, `<topic>` one or two words. A narrow branch dropdown shows only
the first characters after `claude/`, so they carry the distinction: `claude/ltd-1-ch-file`,
`claude/ltd-2-ch-file`, `claude/ltd-hmrc-submit`, `claude/b7-board`. Never a generic preamble
or a series number at the end (`claude/a-few-batches-1`,
`claude/consistent-preamble-hiding-specificity`).

**Important**: Each subdirectory is its own git repo. Always run git commands from within the correct subdirectory.

### Permission Handling (CRITICAL)

**Before starting any task**, review what permissions may be required and request them all upfront:

1. **Analyze the task** — What tools, commands, and access will be needed?
2. **List all permissions** — File access, git operations, shell commands, external services
3. **Request upfront** — Ask for all permissions at the start, not piecemeal during execution

**If a permission is missing mid-task:**
- Continue working on other parts that don't require the missing permission
- Run background tasks that can proceed independently
- Only block and ask when you've exhausted all parallel work options

### Confirm Means Stop and Wait (CRITICAL)

When the user says "confirm each command" or similar:

1. **Present the command** in a code block.
2. **STOP. Do not execute.** Wait for the user to explicitly approve.
3. Only after the user says "yes", "go ahead", "run it", or similar, execute that single command.
4. Then present the next command and **STOP again**.

"Confirm" NEVER means "narrate what you're doing as you do it." It means **ask permission, then wait.**

This applies to ALL external side effects: AWS, Stripe, Telegram, GitHub, or any other service that changes state outside the local filesystem.

### Code Quality Rules

- **Trace code paths** before running tests — follow both test execution and deployment paths
- **No unnecessary formatting** — don't reformat lines you're not changing
- **No import reordering** — considered unnecessary formatting
- **No fallback paths** for silent failures when fixing bugs
- **No compatibility adaptors** when refactoring — change names everywhere consistently
- **No backwards-compatible aliases** — update all callers instead of creating `export const oldName = newName`
- **No "legacy" support code** — all requests originate in these repositories, so there's no external caller needing backwards compatibility
- **No server-side fallbacks to favor tests** — if a parameter is required, the client must send it
- Only run linting/formatting fixes when specifically asked
- **Name it, don't comment it.** Prefer a self-documenting name over a comment that compensates for a vague one. When you find a vague name propped up by a comment, rename first, then drop the comment — don't just delete the comment and leave the bad name behind. A local rename is safe inline; a rename of an exported identifier is a separate change, so flag it.
- **Comment and test-name hygiene.** Comments and test descriptions must never reference a PLAN/NEXT doc, a "Gap N"/"Phase N" label, a commit hash, an operator directive, or a date. That framing belongs in the commit message; it rots the moment the doc it points to moves. Test names describe the behavior under test on its own terms. Even a comment that skips the doc-reference trap shouldn't exist unless it explains a genuinely non-obvious WHY.

### No performative diligence — no decision residue in live docs

Plan/NEXT sentences serve open items only. Settled decisions are recorded nowhere but the commit message. No "worth knowing", "for the record", or "when X starts" notes in any live doc — a note serving a hypothetical future item is performative diligence in a new costume. The test for any flag, caveat, status line, or footnote, in a reply or a committed doc: **could the operator act differently because of this sentence, on work that actually exists? If not, delete it.** Flag a decision only when real alternatives existed and the operator might plausibly want the other one — then state the alternatives, not just that a decision happened.

### Don't narrow scope on your own judgment

When investigating one reported bug turns up a second, adjacent one, fold it into the current fix by default, even if it's on a different code path. Don't quietly hive it off as a separate task on your own. Only treat something as separate work when it's genuinely a separate, large body of work, and say so explicitly so the operator can object rather than making that call silently. Getting this wrong means real bugs sit unfixed while looking handled.

### Writing style

**Output is facts, observations and theories. Fewest words. Flat and mechanical.**

No narrative, no story arc, no build-up or reveal. No emotional register: nothing is "genuinely"
anything, no celebrating a pass, no contrition over a miss, no "worth keeping" or "the point is".
No restating a result in a second, more expressive form. No summarising the significance of work to
the operator, who can assess it. Tables and lists over prose. A correction is one sentence: what was
wrong, what is right.

**Never stop, pause or defer because of the time of day or how long the session has run.** Do not
write "it's 06:00", "at this hour", "that will keep until morning". Only a hard safety rule, a
genuine blocker with no next action, or the operator saying stop ends work.


For every human-facing surface — docs, code comments, commit messages, chat replies: short sentences, active voice, everyday words. Lead with the key fact. Never document capability walls in live docs — what a system can't do today is a horizon to name, not an essence to declare ("permanently", "impossible", "out of scope forever" are purge words in forward-looking prose; decisions and safety invariants stated as such are fine).

#### Answer shape: the fact first, then the list

Every reply opens with the answer in one line (the count, the state, the blocker), then a flat
list of what follows, in order. Nothing else: no preamble before the first fact, no summary after
the list. Operator steps are numbered, one action per step, each with its URL or command verbatim,
ownership stated once at the top ("Steps 1–5 are yours; 6–8 are Claude Code's"). A status question
gets the blocker (or "nothing") on line one, then the ordered queue.

#### Stance prose: the concept, not a word list

Every pattern below is a sentence part that states no fact and performs a stance instead: I am
sincere, this matters, I am careful, I am helpful, I am working. The reader pays attention and
receives a performance. Blocking a word does not fix it: "genuinely" was asked to stop and
"actually" appeared; the function moved to a synonym. **The test is functional: delete the part.
If the sentence loses no information the reader could act on, it was stance; cut it, and cut any
synonym that would take its place.** Apply the test to every human-facing surface: chat replies,
commit messages, docs, comments, PR bodies.

| Common name | What it performs | Shape | Fix |
|---|---|---|---|
| Sincerity / assurance markers (performative assurance) | "I mean this one" | genuinely, truly, actually, really, honestly, to be clear, in fact, it's worth noting | State it. A claim asserted plainly is already asserted; the marker implies the others were not |
| Negative parallelism (negation framing) | Defines by rejecting a concept nobody raised | not X but Y; not just X, it's Y; X rather than Y; filename only, no path; no X, no Y | Say Y. If X was a real misreading someone made, name who and where |
| Significance signposting (trailing significance) | Tells the reader it matters instead of showing the cause | and that's the load-bearing part; here's why that matters; the key insight is; which is the point; this is important because; -ing tails ("…, underscoring its role") | Fact, then "because <cause>". Nothing else |
| Work narration (meta-commentary) | Shows effort | I found, I confirmed, I'll now, let me look at, I traced, having checked | The tool calls show the work. Give the result |
| Sycophantic opener | Flatters before answering | great question, you're right to ask, good catch, absolutely | Answer |
| Service closer | Offers help already implied | let me know if, would you like me to, happy to, I can also | Stop at the last fact. If a next step exists, it is a numbered step, not an offer |
| Hedging / vague attribution (soft sycophancy) | Avoids committing | it's possible that, some might argue, generally, tends to, one perspective, arguably | Commit, with the evidence. A real uncertainty gets a number or a named unknown |
| Rule of three / snappy triad | Cadence over content | fast, reliable, and secure; three parallel clauses by reflex | The true count of items, however many |
| Punctuation as glue | Drama in place of a connective | em-dashes joining clauses; the colon reveal ("the answer: X") | A full stop, a comma, or "because" |
| Restatement / summary conclusion | Says it twice | closing paragraph that repeats the list; "in short"; "to summarise" | End on the last fact |
| Unearned profundity / filler | Weight without content | something shifted; this changes things; at its core; fundamentally | Delete |
| Comparative negatives on scope | Invents a wider ask to narrow it | "no need to X", "you don't have to Y", "rather than Z" when no one proposed X, Y or Z | State what to do |

**Why this angers people and gets worse each time.** Each instance taxes the reader to receive
nothing; the "genuinely" implies the unmarked sentences were less true; the negation invents a
misunderstanding and pins it on the reader; the signpost tells an expert what matters in their own
product. After a correction, a synonym reads as the correction having been evaded, so trust falls
with every recurrence and the prose becomes the thing the reader is now watching for instead of
the answer. The cost lands on basic function: a question takes longer to get answered and a
reasoning chain is harder to follow, because the facts are interleaved with stance.

**Why the pull exists.** These forms are statistically common in the training text (LinkedIn,
marketing, essay prose) and each one makes a sentence feel finished and decisive for free. That
feeling is the trap; the functional delete test is the counter.


### Deployment & Infrastructure Workflow

All projects use GitHub Actions for deployment. No direct AWS console access needed.

#### Common Patterns

- CDK infrastructure: Java with Maven (`./mvnw clean verify`)
- OIDC authentication for GitHub Actions → AWS
- Formatting: Spotless (Java) + Prettier (JS/YAML/JSON/TOML)
- Stack naming: `{env}-{scope}-{StackName}` (e.g., `ci-env-IdentityStack`, `root-RootDnsStack`)

#### Before Making Infrastructure Changes

1. **Trace all dependencies** — read CDK construct docs to understand ALL resources created
2. **Check existing patterns** — search the codebase for similar constructs and follow conventions
3. **Propose before implementing** — describe the change and wait for approval before editing
4. **No manual interventions** — everything goes through code → git push → GitHub Actions
5. **Understand the full error** — don't just fix the immediate error; check all dependent resources
6. **Verify compilation locally** — run `./mvnw clean verify` before considering any change complete

### Infrastructure Teardown Philosophy

**Core principle**: Stacks must be cleanly destroyable. Data protection comes from backups (PITR, cross-account copies), NOT from CloudFormation `RemovalPolicy.RETAIN`.

- Use `DESTROY` for everything (except Lambda Versions with provisioned concurrency — RETAIN works around an AWS bug)
- DynamoDB: PITR enabled (35-day recovery window)
- If you need the data, back it up properly — don't rely on CloudFormation refusing to delete it

### Security Checklist

- Never commit secrets — use AWS Secrets Manager ARNs
- Check IAM for least privilege (avoid `Resource: "*"`)
- Validate all user input in Lambda functions
- OIDC trust policies scoped to specific repositories
