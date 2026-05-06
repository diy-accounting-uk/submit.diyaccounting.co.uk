# NEW_REPOSITORY.md — migration record

> This repository was migrated from `antonycc/submit.diyaccounting.co.uk` to `support-at-diyaccounting/submit.diyaccounting.co.uk` on **2026-05-06** after the suspension of `antonycc`.

## What happened

- The personal account `antonycc` was first org-flagged on 2026-05-03 and fully suspended on 2026-05-06.
- A new GitHub Pro account `support-at-diyaccounting` was created and authenticated.
- Cross-repo migration plan: see `PLAN_GITHUB_MIGRATION.md` and `PLAN_FLAGGED.md` in the parent workspace (`/Users/antony/projects/diy-accounting-limited/`).
- This repo is the **most complex** of the migrated repos — it deploys to two AWS accounts (submit-ci 367191799875 and submit-prod 972912397388), uses GitHub Environments (`ci` and `prod`), integrates HMRC MTD, Stripe, Cognito, DynamoDB, Lambda, and runs ~25 workflows.

## How this repo was created in the new home

```bash
gh repo create support-at-diyaccounting/submit.diyaccounting.co.uk \
  --public \
  --description "VAT submission app — Lambda, DynamoDB, Cognito, HMRC MTD API"

git -C submit.diyaccounting.co.uk remote add newhome \
  git@github.com:support-at-diyaccounting/submit.diyaccounting.co.uk.git
git -C submit.diyaccounting.co.uk push newhome --all
git -C submit.diyaccounting.co.uk push newhome --tags
```

## What was migrated

- **13 branches**: `main`, `claude/billing-webhook-phase2`, `claude/billing-webhook-phase3`, `claude/billing-webhook-to-env`, `claude/fix-last-known-good-skip`, `claude/issue-plans`, `claude/resident-vat-rollout`, `claude/stack-drift-workflow`, `claude/synthetic-test-fixes`, `dependabot/npm_and_yarn/...`, `feedback`, `hmrcproduction`, `permissions`.
- **4 tags**: `v0.0.2-1`, `v0.1.0`, `v0.1.1`, `v1.0.0`.
- **All repository content** including CDK Java (12 stacks), Lambda code, web assets, HMRC integration, Stripe integration, simulator.

## Code rewrites in this branch

This branch (`claude/migrate-to-support-at-diyaccounting`) updates stale `antonycc` references. The most important change is in **`infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java:132`** — the `githubRepo()` default property, which constructs the OIDC trust-policy `sub` claim:

```java
default String githubRepo() {
    return "support-at-diyaccounting/submit.diyaccounting.co.uk";  // was "antonycc/submit.diyaccounting.co.uk"
}
```

CDK reads this to build the OIDC `WebIdentityPrincipal` trust on the GitHub Actions roles.

Other replacement rules applied:

| Old reference | New reference |
|---|---|
| `antonycc/submit.diyaccounting.co.uk` | `support-at-diyaccounting/submit.diyaccounting.co.uk` |
| `antonycc/root.diyaccounting.co.uk` | `support-at-diyaccounting/root.diyaccounting.co.uk` |
| `antonycc/www.diyaccounting.co.uk` | `support-at-diyaccounting/www.diyaccounting.co.uk` |
| `antonycc/diy-accounting` | `support-at-diyaccounting/spreadsheets.diyaccounting.co.uk` |
| `@antonycc/web-submit-diyaccounting-co-uk` (npm scope) | `@support-at-diyaccounting/web-submit-diyaccounting-co-uk` |
| `antonycc/battery-pack` (hypothetical future repo) | `support-at-diyaccounting/battery-pack` |

Files affected (~30):
- 12 CDK stack files in `infra/main/java/co/uk/diyaccounting/submit/stacks/` — tags + the `AccountStack.githubRepo()` default
- `package.json`, `pom.xml`, `CLAUDE.md`
- Active runbooks/reports: `AWS_ARCHITECTURE.md`, `RUNBOOK_INFORMATION_SECURITY.md`, `REPORT_SECURITY_REVIEW.md`, `REPORT_REPOSITORY_CONTENTS.md`, `REPORT_INCIDENT_BUNDLES.md`, `PLAN_CAMPAIGN_AND_REFERRALS.md`, `_developers/PLAN_HUMAN_TEST.md`, `_developers/SETUP.md`, `_developers/hmrc/HMRC_MTD_API_APPROVAL_SUBMISSION.md`, `plans/PLAN_ISSUES_DELIVERY.md`, `plans/QUESTIONS.md`
- Active scripts: `scripts/aws-accounts/bootstrap-account.sh`
- Web content: `web/public/{accessibility.html, faqs.toml, help.html, terms.html, lib/support-api.js, widgets/view-source-link.js}`

## What was deliberately NOT rewritten

- `_developers/archive/*.md`, `_developers/backlog/*.md` — historical/draft records, would falsify audit trail.
- `plans/issues/PLAN_ISSUE_*.md` — point-in-time issue plans referencing the old URL as a record.
- `_developers/PLAN_HUMAN_TEST.pdf` — binary, source `.md` was updated.
- `cdk-application.out/`, `cdk-environment.out/`, `cdk-submit-*.out/` — build artifacts; regenerated on next `cdk synth`.
- `package-lock.json`, `target/` — regenerated.
- Test report files (`axe-*.json`, `tests/test-reports/`, `coverage/`, `html-report/`).
- `oidc-antonycc-com-prod-users` in `scripts/provision-user.sh` — this is a **DynamoDB table name** in the production AWS account, not a GitHub reference. Renaming it would require a data migration in AWS.
- `@antonycc` user mentions in plan files — historical issue-assignment references.

## What still needs setup before deploys work

### 1. AWS OIDC trust policy (BLOCKING for first deploy)

The IAM roles in **two AWS accounts** (367191799875 submit-ci and 972912397388 submit-prod) have `sub` claim trust pinned to `repo:antonycc/submit.diyaccounting.co.uk:*`. The CDK rewrite in this PR updates `AccountStack.githubRepo()` so a redeploy will fix this — but the redeploy must happen from local SSO since the new repo can't yet authenticate against AWS.

```bash
aws sso login --sso-session diyaccounting

# CI account first
./mvnw clean verify
cd cdk-environment && cdk deploy ci-env-IdentityStack --profile submit-ci

# Then prod account
cd ../cdk-environment && cdk deploy prod-env-IdentityStack --profile submit-prod
```

Verify the new trust policy:
```bash
aws --profile submit-ci iam get-role --role-name submit-github-actions-role \
  --query 'Role.AssumeRolePolicyDocument.Statement[].Condition'
# expect: "token.actions.githubusercontent.com:sub": "repo:support-at-diyaccounting/submit.diyaccounting.co.uk:*"
```

### 2. GitHub Environments (`ci` and `prod`)

Create both environments in **Settings → Environments**. Each has its own scoped variables.

### 3. GitHub Actions Variables — environment-scoped (set per environment)

| Variable | `ci` value (account 367191799875) | `prod` value (account 972912397388) |
|---|---|---|
| `SUBMIT_ACCOUNT_ID` | `367191799875` | `972912397388` |
| `SUBMIT_ACTIONS_ROLE_ARN` | `aws --profile submit-ci iam get-role --role-name submit-github-actions-role --query Role.Arn --output text` | `aws --profile submit-prod iam get-role --role-name submit-github-actions-role --query Role.Arn --output text` |
| `SUBMIT_DEPLOY_ROLE_ARN` | `aws --profile submit-ci iam get-role --role-name submit-deployment-role --query Role.Arn --output text` | `aws --profile submit-prod iam get-role --role-name submit-deployment-role --query Role.Arn --output text` |
| `SUBMIT_CERTIFICATE_ARN` | `arn:aws:acm:us-east-1:367191799875:certificate/40b0df57-78f4-4167-b457-775da3e13210` (already hardcoded in `cdk-environment/cdk.json`) | `arn:aws:acm:us-east-1:972912397388:certificate/e465ad23-baf8-4b5c-94a4-33f73a266ec6` (from `cdk-environment/cdk.json:27`) |
| `SUBMIT_REGIONAL_CERTIFICATE_ARN` | `arn:aws:acm:eu-west-2:367191799875:certificate/de2a24a1-6034-440c-b98f-a8b2942dc083` | `aws --profile submit-prod acm list-certificates --region eu-west-2 --query "CertificateSummaryList[?DomainName=='*.submit.diyaccounting.co.uk'].CertificateArn" --output text` |

Set via:
```bash
gh variable set SUBMIT_ACCOUNT_ID --env ci --body "367191799875" \
  --repo support-at-diyaccounting/submit.diyaccounting.co.uk
# ... repeat for each
```

### 4. GitHub Actions Variables — repo-level (shared)

| Variable | Value source |
|---|---|
| `ROOT_ACTIONS_ROLE_ARN` | `aws --profile management iam get-role --role-name root-github-actions-role --query Role.Arn --output text` |
| `ROOT_HOSTED_ZONE_ID` | `aws --profile management route53 list-hosted-zones-by-name --dns-name diyaccounting.co.uk --query 'HostedZones[0].Id' --output text` (strip `/hostedzone/` prefix; should be `Z0315522208PWZSSBI9AL` per `cdk-environment/cdk.json:19`) |

### 5. GitHub Actions Secrets

| Secret | Value source |
|---|---|
| `HMRC_SANDBOX_CLIENT_SECRET` | Already stored in **AWS Secrets Manager** at `arn:aws:secretsmanager:eu-west-2:367191799875:secret:ci/submit/hmrc/sandbox_client_secret` (CI) and `arn:aws:secretsmanager:eu-west-2:972912397388:secret:prod/submit/hmrc/sandbox_client_secret` (prod). Read with `aws --profile <profile> secretsmanager get-secret-value --secret-id <arn> --query SecretString --output text`. **Set as a GitHub repo secret** because workflows pass it to deploy-time HMRC validation steps. |
| `NGROK_AUTHTOKEN` | Used for proxy/preview environments. Find in your ngrok account dashboard or local `.env` (gitignored). |
| `RELEASE_PAT` | Personal access token with `repo` scope, used by `publish.yml` for releases. **Generate fresh** — the old token belonged to `antonycc` and is invalid. |
| `PERSONAL_ACCESS_TOKEN` | Used by `copilot-agent.yml`. Generate fresh under `support-at-diyaccounting`. |

`GITHUB_TOKEN` is automatic — don't set it.

Set via:
```bash
gh secret set HMRC_SANDBOX_CLIENT_SECRET \
  --repo support-at-diyaccounting/submit.diyaccounting.co.uk \
  --body "$(aws --profile submit-ci secretsmanager get-secret-value --secret-id ci/submit/hmrc/sandbox_client_secret --query SecretString --output text)"
```

### 6. Local `.env` (developer machines only)

The untracked `.env` at the repo root contains live developer secrets (Stripe live keys, ngrok auth, Telegram bot token, Google OAuth client secret). It is correctly listed in `.gitignore` and was never pushed to GitHub. **No rotation required from the migration itself.**

The tracked `.env.ci`, `.env.prod`, `.env.proxy`, `.env.proxyRunning`, `.env.simulator`, `.env.test` files are **config templates** — they reference values via `arn:aws:secretsmanager:...` and use placeholder/test data. Safe to keep tracked.

## Sequence to restore deploys

1. Merge this PR.
2. `aws sso login --sso-session diyaccounting`.
3. From local: deploy `cdk-environment` IdentityStack to **submit-ci** to update the OIDC trust.
4. Verify the new trust policy via `aws --profile submit-ci iam get-role --role-name submit-github-actions-role`.
5. Repeat for **submit-prod**.
6. Create the `ci` and `prod` GitHub Environments on the new repo.
7. Set environment-scoped variables (§3) and repo-level variables (§4).
8. Set repo secrets (§5).
9. Push a trivial commit; verify `test.yml` succeeds.
10. Merge to main; verify `deploy.yml` succeeds against `submit-ci`, then promote to prod (per existing flow).
11. After successful prod deploy, re-run `scripts/stripe-setup.js` to verify Stripe webhooks are registered against the new pipeline.

## How to obtain values

### Role ARNs
```bash
aws --profile <profile> iam list-roles \
  --query "Roles[?contains(RoleName, 'github-actions') || contains(RoleName, 'deployment')].[RoleName,Arn]" \
  --output table
```

### Certificate ARNs
```bash
aws --profile <profile> acm list-certificates --region us-east-1
aws --profile <profile> acm list-certificates --region eu-west-2
```

### Hosted Zone ID
```bash
aws --profile management route53 list-hosted-zones \
  --query "HostedZones[?Name=='diyaccounting.co.uk.'].Id" --output text
```

### AWS Secrets Manager values (for HMRC sandbox client secret)
```bash
aws --profile submit-ci secretsmanager list-secrets \
  --query "SecretList[].[Name,ARN]" --output table
aws --profile submit-ci secretsmanager get-secret-value \
  --secret-id <arn> --query SecretString --output text
```
