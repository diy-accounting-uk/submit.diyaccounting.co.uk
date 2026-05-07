# GITHUB_SETUP.md — what a fresh GitHub repo needs

This document captures the GitHub-side configuration this repo depends on. If you're setting it up in a new GitHub account or org, this is the checklist.

## What this repo deploys

The VAT submission application. CDK (Java) deploys Lambdas, DynamoDB, Cognito, API Gateway, CloudFront and S3 to two AWS accounts:

| Environment | AWS Account ID | Profile |
|---|---|---|
| `ci` | 367191799875 | `submit-ci` |
| `prod` | 972912397388 | `submit-prod` |

Live site: https://submit.diyaccounting.co.uk

## AWS-side prerequisites

Each AWS account needs a GitHub OIDC provider and two IAM roles:

| Role | Trusted by | Purpose |
|---|---|---|
| `submit-ci-github-actions-role` (in 367191799875) | GitHub OIDC | Workflow entry — allowed `sub` claim `repo:<org>/submit.diyaccounting.co.uk:*` |
| `submit-ci-deployment-role` (in 367191799875) | `submit-ci-github-actions-role` | CDK deploy role; assumed via STS chain |
| `submit-prod-github-actions-role` (in 972912397388) | GitHub OIDC | Same pattern, prod |
| `submit-prod-deployment-role` (in 972912397388) | `submit-prod-github-actions-role` | Same pattern, prod |

`scripts/aws-accounts/bootstrap-account.sh` creates these roles. Re-run it for each account if the account is fresh, or update existing trust policies via `aws iam update-assume-role-policy` if the org name on the GitHub side changes.

The OIDC `sub` claim format is `repo:<github-org-or-user>/submit.diyaccounting.co.uk:*`. The CDK source of truth is `infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java:132` (`githubRepo()` default). Keep them aligned: a `cdk deploy` of `IdentityStack` re-applies the trust based on the value in that file.

## GitHub Environments

Two environments must exist — **Settings → Environments**:

- `ci`
- `prod`

Both are referenced from workflow `environment:` declarations. Each has its own scoped variables (below). Add required-reviewer protection on `prod` if you want manual approval before production deploys.

## GitHub Actions Variables

### Environment-scoped (set on both `ci` and `prod` environments)

Different values per environment.

| Variable | `ci` value source | `prod` value source |
|---|---|---|
| `SUBMIT_ACCOUNT_ID` | `367191799875` | `972912397388` |
| `SUBMIT_ACTIONS_ROLE_ARN` | `aws --profile submit-ci iam get-role --role-name submit-ci-github-actions-role --query Role.Arn --output text` | `aws --profile submit-prod iam get-role --role-name submit-prod-github-actions-role --query Role.Arn --output text` |
| `SUBMIT_DEPLOY_ROLE_ARN` | submit-ci-deployment-role ARN, same lookup pattern | submit-prod-deployment-role ARN |
| `SUBMIT_CERTIFICATE_ARN` | `aws --profile submit-ci acm list-certificates --region us-east-1 --query "CertificateSummaryList[?DomainName=='*.submit.diyaccounting.co.uk'].CertificateArn" --output text` | same in `submit-prod` profile |
| `SUBMIT_REGIONAL_CERTIFICATE_ARN` | same lookup, `--region eu-west-2` | same lookup, `--region eu-west-2`, `submit-prod` profile |

### Repo-level (shared)

| Variable | Value source |
|---|---|
| `ROOT_ACTIONS_ROLE_ARN` | `aws --profile management iam get-role --role-name root-github-actions-role --query Role.Arn --output text` |
| `ROOT_DEPLOY_ROLE_ARN` | `aws --profile management iam get-role --role-name root-deployment-role --query Role.Arn --output text` |
| `ROOT_HOSTED_ZONE_ID` | `aws --profile management route53 list-hosted-zones-by-name --dns-name diyaccounting.co.uk --query 'HostedZones[0].Id' --output text` (strip `/hostedzone/`) |
| `AWS_HOSTED_ZONE_NAME` | `diyaccounting.co.uk` |
| `AWS_CERTIFICATE_ARN` | the CI submit cert ARN (used only by `_developers/archive/generate-issue.yml`) |

## GitHub Actions Secrets

### Repo-level (workflows without `environment:`)

| Secret | Purpose | How to obtain |
|---|---|---|
| `RELEASE_PAT` | Used by `publish.yml` to push tags / release commits | GitHub PAT, `repo` scope |
| `PERSONAL_ACCESS_TOKEN` | Used by `_developers/archive/generate-issue.yml` and `security-review.yml` | GitHub PAT, `repo` + appropriate scopes |

### Environment-scoped (set on both `ci` and `prod`)

| Secret | `ci` value source | `prod` value source |
|---|---|---|
| `HMRC_SANDBOX_CLIENT_SECRET` | `aws --profile submit-ci secretsmanager get-secret-value --secret-id ci/submit/hmrc/sandbox_client_secret --query SecretString --output text` | same pattern, `submit-prod`, `prod/submit/...` |
| `HMRC_CLIENT_SECRET` | sandbox stand-in or absent | `aws --profile submit-prod secretsmanager get-secret-value --secret-id prod/submit/hmrc/client_secret --query SecretString --output text` (production HMRC) |
| `GOOGLE_CLIENT_SECRET` | `aws --profile submit-ci secretsmanager get-secret-value --secret-id ci/submit/google/client_secret` | `aws --profile submit-prod secretsmanager get-secret-value --secret-id prod/submit/google/client_secret` |
| `STRIPE_SECRET_KEY`, `STRIPE_TEST_SECRET_KEY` | from your local `.env` (test key for both) | Stripe live key (`STRIPE_SECRET_KEY`) and test key for the test variant |
| `STRIPE_WEBHOOK_SECRET`, `STRIPE_TEST_WEBHOOK_SECRET` | from your local `.env` (test webhook secret) | Stripe live webhook signing secret |
| `TELEGRAM_BOT_TOKEN` | from your local `.env` — same value both envs | same |
| `NGROK_AUTHTOKEN` and `NGROK_AUTH_TOKEN` | from your local `.env` — workflows reference both names; set both to the same value | same |

`GITHUB_TOKEN` is automatic; do not set it.

## Stripe webhooks

`scripts/stripe-setup.js` registers webhook endpoints by environment URL (e.g. `ci-submit.diyaccounting.co.uk`), not by GitHub repo path. After a fresh deploy, run this script once per environment to wire up the webhooks against the live Stripe accounts. Webhook signing secrets (above) must be set first.

## Local `.env` files

The repo tracks `.env.ci`, `.env.prod`, `.env.proxy`, `.env.proxyRunning`, `.env.simulator`, `.env.test` — these are **config templates**: they reference live values via `arn:aws:secretsmanager:...` references and contain only public IDs and placeholders. Safe to keep public.

The untracked `.env` (gitignored, never committed) is the developer's local-dev config and contains live keys. Keep it on your machine only.

## Sequence to bring a new repo online

1. Create the repo on GitHub. Push code.
2. Bootstrap each AWS account (`scripts/aws-accounts/bootstrap-account.sh`) or update existing OIDC trust policies to include the new GitHub org/repo path.
3. Create `ci` and `prod` GitHub Environments.
4. Set environment-scoped variables and secrets per the tables above.
5. Set repo-level variables and secrets.
6. Push a trivial commit on a feature branch — `test.yml` should pass (proves OIDC).
7. Open a PR, merge to `main` — `deploy.yml` runs against `submit-ci`.
8. Manually dispatch promotion to `submit-prod` per the existing flow.
9. Run `scripts/stripe-setup.js` once per environment to register webhooks.

## How to obtain values quickly

```bash
# all role ARNs in an account
aws --profile <profile> iam list-roles \
  --query "Roles[?contains(RoleName, 'github-actions') || contains(RoleName, 'deployment')].[RoleName,Arn]" \
  --output table

# all certs
aws --profile <profile> acm list-certificates --region us-east-1
aws --profile <profile> acm list-certificates --region eu-west-2

# HMRC / Google secrets in AWS Secrets Manager
aws --profile <profile> secretsmanager list-secrets \
  --query "SecretList[].[Name,ARN]" --output table
aws --profile <profile> secretsmanager get-secret-value \
  --secret-id <arn> --query SecretString --output text

# Route53 zone ID
aws --profile management route53 list-hosted-zones \
  --query "HostedZones[?Name=='diyaccounting.co.uk.'].Id" --output text
```
