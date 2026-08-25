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
| Stripe credentials (4 secrets per env) | see **Stripe credentials — the four dimensions** below | same |
| `TELEGRAM_BOT_TOKEN` | from your local `.env` — same value both envs | same |
| `NGROK_AUTHTOKEN` | from your local `.env` — same value both envs | same |

`GITHUB_TOKEN` is automatic; do not set it.

## Stripe credentials — the four dimensions

Stripe credentials are the trickiest part of GitHub setup. There are **four orthogonal dimensions** to keep straight:

| Dimension | Values | Where it lives |
|---|---|---|
| **GitHub branch** | `main` vs anything else | Controlled by which workflow trigger fires |
| **AWS environment** | `ci` vs `prod` (different AWS accounts) | GitHub Environment + environment-scoped secrets |
| **Stripe mode** | test (sandbox) vs live | A toggle inside the Stripe dashboard — each mode has its own API keys, webhook endpoints, and signing secrets |
| **Resource type** | API key vs webhook signing secret | API keys authenticate outbound calls Lambda → Stripe; signing secrets verify inbound webhook payloads |

Branch determines which AWS env the workflow deploys to:

| Branch | AWS env | AWS account | Webhook URL Stripe delivers to |
|---|---|---|---|
| `main` | prod | 972912397388 | `prod-billing.submit.diyaccounting.co.uk` |
| anything else | ci | 367191799875 | `ci-billing.submit.diyaccounting.co.uk` |

Both `ci` and `prod` environments hold credentials for **both** Stripe modes. Behaviour tests against either env always exercise Stripe test mode; real customer traffic in prod exercises live mode.

### GitHub Environment secrets → AWS Secrets Manager paths

`deploy-environment.yml` (lines 194–237) copies these four GitHub Environment secrets to AWS Secrets Manager on every deploy:

| GitHub Env secret | Stripe mode | Resource | AWS Secrets Manager path (`{env}` = `ci` or `prod`) |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | live | API key (`sk_live_…`) | `{env}/submit/stripe/secret_key` |
| `STRIPE_TEST_SECRET_KEY` | test (sandbox) | API key (`sk_test_…`) | `{env}/submit/stripe/test_secret_key` |
| `STRIPE_WEBHOOK_SECRET` | live | Signing secret (`whsec_…`) | `{env}/submit/stripe/webhook_secret` |
| `STRIPE_TEST_WEBHOOK_SECRET` | test (sandbox) | Signing secret (`whsec_…`) | `{env}/submit/stripe/test_webhook_secret` |

These are *environment-scoped* GitHub secrets — set them inside the GitHub Environment (`ci` or `prod`), not at repo level. The `prod` Environment's `STRIPE_WEBHOOK_SECRET` is unrelated to the `ci` Environment's `STRIPE_WEBHOOK_SECRET`.

### Full 4-D map — which secret matters for which test

| Branch | AWS env / account | Stripe mode | Endpoint Stripe delivers to | GitHub Env → secret name | AWS Secrets Manager path |
|---|---|---|---|---|---|
| non-main | ci / 367191799875 | **test (sandbox)** | `ci-billing.submit.diyaccounting.co.uk` | `ci` → `STRIPE_TEST_WEBHOOK_SECRET` | `ci/submit/stripe/test_webhook_secret` |
| non-main | ci / 367191799875 | live | `ci-billing.submit.diyaccounting.co.uk` | `ci` → `STRIPE_WEBHOOK_SECRET` | `ci/submit/stripe/webhook_secret` |
| `main` | prod / 972912397388 | test (sandbox) | `prod-billing.submit.diyaccounting.co.uk` | `prod` → `STRIPE_TEST_WEBHOOK_SECRET` | `prod/submit/stripe/test_webhook_secret` |
| `main` | prod / 972912397388 | live | `prod-billing.submit.diyaccounting.co.uk` | `prod` → `STRIPE_WEBHOOK_SECRET` | `prod/submit/stripe/webhook_secret` |

API keys follow the same pattern (`STRIPE_SECRET_KEY` / `STRIPE_TEST_SECRET_KEY`) into `{env}/submit/stripe/[test_]secret_key`.

The behaviour test `paymentBehaviour-ci` exercises **row 1** — the test-mode webhook signing secret at `ci/submit/stripe/test_webhook_secret`, derived from `STRIPE_TEST_WEBHOOK_SECRET` in the GitHub `ci` Environment.

### Lambda secret resolution

`app/functions/billing/billingWebhookPost.js:39–82` reads `STRIPE_TEST_WEBHOOK_SECRET_ARN` first, then falls back to `STRIPE_WEBHOOK_SECRET_ARN`. Each ARN is exposed to the Lambda as an env var by CDK (`BillingWebhookStack.java`). The Lambda fetches and caches the secret value for 5 minutes — pickup after rotation is near-immediate, no Lambda redeploy needed.

### Price IDs (related, but not secrets)

Price IDs are committed in `.env.ci` and `.env.prod`:

- `STRIPE_PRICE_ID_*` — live mode price IDs
- `STRIPE_TEST_PRICE_ID_*` — test mode price IDs

Both files have entries for `RESIDENT_PRO` and `RESIDENT_VAT` bundles. `.env.ci` reuses test price IDs for both modes (CI isn't customer-facing). `.env.prod` keeps live and test IDs distinct.

### Webhook endpoint registration

The endpoints themselves are registered in the Stripe dashboard. `scripts/stripe-setup.js` is idempotent — it creates the endpoint if missing and prints the signing secret to paste into the matching GitHub Environment secret. Endpoints registered:

| Stripe mode | Endpoint registered |
|---|---|
| test (sandbox) | `https://ci-billing.submit.diyaccounting.co.uk/api/v1/billing/webhook` |
| test (sandbox) | `https://prod-billing.submit.diyaccounting.co.uk/api/v1/billing/webhook` |
| live | `https://prod-billing.submit.diyaccounting.co.uk/api/v1/billing/webhook` |

Live mode also registers an ngrok endpoint for local dev (`https://*.ngrok-free.app/api/v1/billing/webhook` — value rotates with the developer's ngrok tunnel).

Run with the correct Stripe mode key:

```bash
STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.js   # registers test-mode endpoints
STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.js   # registers live-mode endpoints
```

### Rotation procedure

When Stripe rotates a signing secret (deliberately, or by re-running `stripe-setup.js`), or when migrating to a new Stripe account:

1. **Identify which secret is stale** using the 4-D map above — branch, AWS env, Stripe mode, resource.
2. **Get the new `whsec_…`** from Stripe dashboard → Developers → Webhooks → endpoint → Reveal signing secret. **Be in the correct Stripe mode** (sandbox toggle on for test mode).
3. **Update the GitHub Environment secret** (`STRIPE_TEST_WEBHOOK_SECRET` or `STRIPE_WEBHOOK_SECRET` in the `ci` or `prod` environment). This is the truth source — every future deploy will copy this value into AWS Secrets Manager.
4. **Update AWS Secrets Manager directly** so the live Lambda picks it up without waiting for the next deploy:
   ```bash
   aws --profile submit-ci secretsmanager put-secret-value \
     --secret-id ci/submit/stripe/test_webhook_secret \
     --secret-string 'whsec_...'
   ```
   The Lambda's 5-minute cache means pickup is near-immediate.

Skipping step 3 makes the fix temporary — the next `deploy-environment.yml` run overwrites AWS with whatever's in the GitHub Environment secret.

### Common failure mode

`paymentBehaviour-ci` fails with `Webhook activation timeout: bundle … was not granted by webhook within 45000ms` → tail `/aws/lambda/ci-env-billing-webhook` for `Webhook signature verification failed`. If present, the stored test-mode webhook signing secret doesn't match what Stripe is signing with. Run the rotation procedure for **row 1** of the 4-D map.

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
