<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# GITHUB_SETUP.md: what a fresh GitHub org needs

The GitHub-side configuration `diy-accounting-uk/submit.diyaccounting.co.uk` depends on. Names only; no value appears here. The live state is declared in `infra/github/github.toml`. Compare it with `node infra/github/github-sync.js` (plan only) and write it back with `--apply` using a token that can administer the repository.

## Accounts

| Environment | AWS account | SSO profile |
|---|---|---|
| `ci` | 367191799875 | `submit-ci` |
| `prod` | 972912397388 | `submit-prod` |

Root DNS lives in 887764105431 (`management`). Every AWS account needs a GitHub OIDC provider and two roles, both created by `scripts/aws-accounts/bootstrap-account.sh --account-id <id> --account-name <name> --profile <profile>`:

- `<account-name>-github-actions-role`: trusts GitHub OIDC for `repo:<org>/submit.diyaccounting.co.uk:*`. Workflows assume it first.
- `<account-name>-deployment-role`: trusts the actions role. Workflows chain into it for CDK and AWS calls.

The trust repository comes from `githubRepo()` in `AccountStack.java` (default `diy-accounting-uk/submit.diyaccounting.co.uk`). Change it there when the org changes, then deploy `IdentityStack`. The OIDC subject claim uses the default template (`repo:<org>/<repo>` prefix).

## Repository settings

Recreate with `node infra/github/github-sync.js --apply`.

- Visibility public. Pages off. Default branch `main`.
- Merge commit, squash and rebase all allowed. Auto-merge on. Delete branch on merge on.
- Secret scanning, push protection and non-provider patterns on. Dependabot security fixes off. `.github/dependabot.yml` sets monthly version updates for `github-actions`, `npm` and `maven`.
- `.github/CODEOWNERS`: `* @antonycc`.

### Actions permissions

- Allowed actions: selected. GitHub-owned and verified creators allowed. SHA pinning required.
- Extra patterns allowed: `aws-actions/configure-aws-credentials@*`, `docker/setup-buildx-action@*`, `docker/setup-qemu-action@*`, `astral-sh/setup-uv@*`, `softprops/action-gh-release@*`, `google-github-actions/auth@*`.
- Default `GITHUB_TOKEN` permission: read. Workflows may not approve pull requests.

### Ruleset `main` (id 16057564)

- Target: default branch. Enforcement: active.
- Rules: block deletion, block non-fast-forward, require status checks (not strict).
- Required checks: `Check commit signatures` (`verify-commit-signatures.yml`), `npm test` and `maven test` (`test.yml`), `eslint`, `CodeQL` (`codeql.yml`), `content scan` (`content-scan.yml`, integration id 15368).
- Bypass: repository role Admin (id 5), always.

## Environments

None has protection rules or a branch policy.

| Environment | Used by |
|---|---|
| `ci` | deploys and tests of every non-`main` branch and the apex |
| `prod` | deploys from `main`, scheduled probes, security, support and remedy agents, `google-apply.yml`, `sbom.yml`, `youtube-check.yml`, `infra-apply.yml` |
| `copilot` | `copilot-setup-steps.yml`; holds no variables or secrets |

Most workflows take the environment from an input or a computed `github-environment` output, so `ci` and `prod` are both selected by name.

## Variables

### Organisation level (`diy-accounting-uk`, all repositories)

| Variable | Read by |
|---|---|
| `ROOT_ACTIONS_ROLE_ARN` | `deploy.yml`, `destroy-ci.yml`, `destroy-prod.yml`, `promote-ci-apex.yml`, `set-origins.yml` |
| `ROOT_DEPLOY_ROLE_ARN` | same five workflows |
| `ROOT_HOSTED_ZONE_ID` | `deploy.yml`, `promote-ci-apex.yml`, `request-holding-cert.yml` |

Recreate: role ARNs with `aws --profile management iam get-role --role-name root-github-actions-role --query Role.Arn --output text` (and `root-deployment-role`); zone id with `aws --profile management route53 list-hosted-zones-by-name --dns-name diyaccounting.co.uk --query 'HostedZones[0].Id' --output text` with `/hostedzone/` removed. The org also holds `GATEWAY_*` and `SPREADSHEETS_*` role ARNs for the sibling repositories.

### Repository level

| Variable | Read by |
|---|---|
| `AGENT_APP_ID` | `alarm-triage.yml`, `alarm-remedy-close.yml`, `security-review.yml`, `support-triage.yml` |
| `OPS_APP_ID` | `deploy-environment.yml`, `deploy-cdk-stack.yml` |
| `OPS_APP_INSTALLATION_ID` | same two workflows |
| `AGENT_APP_INSTALLATION_ID` | no workflow |
| `AWS_CERTIFICATE_ARN` | no workflow |
| `AWS_HOSTED_ZONE_NAME` | no workflow |
| `SUBMIT_GOOGLE_AUTH_MODE` | no workflow (repository copy) |

App and installation ids come from the GitHub App settings pages (the agent App for `AGENT_*`, `diya-ops` for `OPS_*`; installation id is the number at the end of the installation's settings URL).

### Environment level (`ci` and `prod`, different values)

| Variable | Read by |
|---|---|
| `SUBMIT_ACCOUNT_ID` | most AWS workflows |
| `SUBMIT_ACTIONS_ROLE_ARN` | every workflow that signs in to AWS |
| `SUBMIT_DEPLOY_ROLE_ARN` | every workflow that then deploys or reads |
| `SUBMIT_ALARM_TRIAGE_ROLE_ARN` | `alarm-triage.yml`, `alarm-remedy-close.yml`, `support-triage.yml`, `security-review.yml`, `agentic-lib-*.yml`, `deploy.yml`, `test.yml` |
| `SUBMIT_CERTIFICATE_ARN` | `deploy-environment.yml` |
| `SUBMIT_REGIONAL_CERTIFICATE_ARN` | `deploy-environment.yml`, `deploy.yml`, `promote-ci-apex.yml` |
| `SUBMIT_HOLDING_CERTIFICATE_ARN` | `deploy-environment.yml`, `deploy-cdk-stack.yml` |
| `COMPANIES_HOUSE_CLIENT_ID` | `deploy.yml`, `deploy-app.yml` |

Recreate: role ARNs with `aws --profile <profile> iam get-role --role-name <account-name>-github-actions-role --query Role.Arn --output text` (and `-deployment-role`, and the alarm-triage role); certificate ARNs with `aws --profile <profile> acm list-certificates --region us-east-1` (`--region eu-west-2` for the regional one) and the matching domain.

Also set:

- `ci` only: `SUBMIT_GA4_MEASUREMENT_ID` (`deploy.yml`, `deploy-app.yml`).
- `prod` only: `PAYPAL_CLIENT_ID` (`deploy-environment.yml`), `SUBMIT_GOOGLE_AUTH_MODE`.
- Read by `deploy-environment.yml`, environment level not yet set: `SUBMIT_COMPANY_BOOK_ID` (a v4 UUID) and `SUBMIT_COMPANY_BOOK_OWNER_PREFIX` (64 lowercase hex characters). `IngestionStack` builds the company-book resources only when both are present.
- Read by `probe-test.yml` and `video-capture.yml` on `ci`, not yet set: `TEST_COMPANIES_HOUSE_USER_ID`.

## Secrets

Values never leave GitHub. `deploy-environment.yml` copies the environment secrets below into AWS Secrets Manager at `{env}/submit/...` on every deploy, so the GitHub value is the source of truth. `secrets-rotation.toml` tracks rotation dates.

### Repository level

| Secret | Read by | How to obtain |
|---|---|---|
| `RELEASE_PAT` | `publish.yml` | PAT, `repo` scope, to push tags and release commits |
| `ADMIN_TOKEN` | `infra-apply.yml` | PAT with repository administration, to read settings |
| `AGENT_TOKEN` | `agentic-lib-board.yml`, `agentic-lib-code.yml` | PAT for the agent workflows |
| `AUTO_MERGE_TOKEN` | `agentic-lib-pr.yml` | PAT that can merge |
| `AGENT_APP_PRIVATE_KEY` | `alarm-triage.yml`, `alarm-remedy-close.yml`, `security-review.yml`, `support-triage.yml` | private key of the agent GitHub App |
| `OPS_APP_PRIVATE_KEY` | `deploy-environment.yml` (to `{env}/submit/github/ops_app_private_key`) | private key of the `diya-ops` GitHub App |
| `OPERATOR_EMAILS` | `deploy-environment.yml` (to `{env}/submit/operator-emails`) | the operator's addresses |

`GITHUB_TOKEN` is automatic.

### Environment level

| Secret | AWS Secrets Manager path | Envs |
|---|---|---|
| `GOOGLE_CLIENT_SECRET` | `{env}/submit/google/client_secret` | ci, prod |
| `HMRC_CLIENT_SECRET` | `{env}/submit/hmrc/client_secret` | ci, prod |
| `HMRC_SANDBOX_CLIENT_SECRET` | `{env}/submit/hmrc/sandbox_client_secret` | ci, prod |
| `COMPANIES_HOUSE_API_KEY` | `{env}/submit/companies-house/api_key` | ci, prod |
| `COMPANIES_HOUSE_CLIENT_SECRET` | `{env}/submit/companies-house/client_secret` | ci, prod |
| `COMPANIES_HOUSE_PRESENTER_ID` | `{env}/submit/companies-house/presenter_id` | ci |
| `COMPANIES_HOUSE_PRESENTER_CODE` | `{env}/submit/companies-house/presenter_code` | ci |
| `STRIPE_SECRET_KEY` | `{env}/submit/stripe/secret_key` | ci, prod |
| `STRIPE_TEST_SECRET_KEY` | `{env}/submit/stripe/test_secret_key` | ci, prod |
| `STRIPE_WEBHOOK_SECRET` | `{env}/submit/stripe/webhook_secret` | ci, prod |
| `STRIPE_TEST_WEBHOOK_SECRET` | `{env}/submit/stripe/test_webhook_secret` | ci, prod |
| `TELEGRAM_BOT_TOKEN` | `{env}/submit/telegram/bot_token` | ci, prod |
| `PAYPAL_CLIENT_SECRET` | `{env}/submit/paypal/client_secret` | prod |

Other consumers: `HMRC_SANDBOX_CLIENT_SECRET` is also read by `test.yml`, `probe-test.yml`, `generate-pass.yml`, `create-hmrc-test-user.yml`, `video-capture.yml` and `deploy-app.yml`.

Read on `ci`, not yet set: `COMPANIES_HOUSE_SANDBOX_API_KEY`, `TEST_COMPANIES_HOUSE_PASSWORD`, `TEST_COMPANIES_HOUSE_TOTP_SECRET` (`deploy.yml`, `probe-test.yml`, `video-capture.yml`, for the Companies House sandbox filing suites).

### Getting the values

- Google, HMRC, Companies House, PayPal and Telegram credentials come from each provider's console. `infra/companies-house`, `infra/hmrc`, `infra/paypal` and `infra/telegram` hold the declared console state; `infra-apply.yml` asserts it.
- Stripe keys come from the Stripe dashboard, one pair per mode. Register the webhook endpoints and their signing secrets with `node infra/stripe/stripe-sync.js --environment <ci|prod> --mode <test|live> --apply`. Local development registers no endpoint: `stripe listen` forwards events.
- To rotate a signing secret, set the new value in the GitHub environment secret first (the next deploy writes it to AWS), then optionally `aws --profile <profile> secretsmanager put-secret-value --secret-id {env}/submit/stripe/test_webhook_secret --secret-string 'whsec_...'` so the running Lambda picks it up within its five-minute cache.
- A `paymentBehaviour-ci` timeout waiting for the webhook, with `Webhook signature verification failed` in `/aws/lambda/ci-env-billing-webhook`, means the stored `ci/submit/stripe/test_webhook_secret` differs from what Stripe signs with. Rotate as above.

## Labels

Workflows apply these. Recreate with `gh label create`.

- `alarm`, `ops`, `support`, `general`, `other`, `incident`: issue families opened by `alarm-triage.yml`, `support-triage.yml` and the alarm Lambda.
- `origin:machine`, `origin:human`, `origin:attended-agent`, `origin:unattended-agent`, `origin:external`: who raised an item (the alarm and support Lambdas, `agentic-lib-code.yml`).
- `remedy:close-when-gone`, `remedy:dispatch`, `remedy:draft-pr`: alarm-family remedy mode (`alarm-triage.yml`, `alarm-remedy-close.yml`).
- `policy:question`: open operator policy question.
- `triage`: re-runs alarm triage on an issue.
- `agentic-lib`: hands an issue to `agentic-lib-code.yml`.
- `security-review`: issues opened by `security-review.yml`.
- `copilot-agent`, `in-progress`: agent and batch tracking.

## Sequence for a new org

1. Create the org and repository, push the code, set the org variables for `ROOT_*`.
2. Run `bootstrap-account.sh` for each AWS account, or update the existing trust policies with the new org and repository.
3. Create the `ci`, `prod` and `copilot` environments.
4. Set the variables and secrets above.
5. Create the two GitHub Apps (agent and `diya-ops`), install them on the repository, and set their ids and private keys.
6. Run `node infra/github/github-sync.js --apply` to write the repository settings, Actions allow-list and `main` ruleset.
7. Push a feature branch. `test.yml` passing proves OIDC.
8. Merge to `main`. `deploy.yml` runs against `submit-ci`.
9. Register the Stripe webhooks with `stripe-sync.js` once per environment and mode.

## Findings at last check

Variables and secrets that exist and no workflow reads: `AGENT_APP_INSTALLATION_ID`, `AWS_CERTIFICATE_ARN`, `AWS_HOSTED_ZONE_NAME`, `SUBMIT_GOOGLE_AUTH_MODE` (repository and `prod`).

Read by a workflow and not set: `SUBMIT_COMPANY_BOOK_ID`, `SUBMIT_COMPANY_BOOK_OWNER_PREFIX`, `TEST_COMPANIES_HOUSE_USER_ID`, `COMPANIES_HOUSE_SANDBOX_API_KEY`, `TEST_COMPANIES_HOUSE_PASSWORD`, `TEST_COMPANIES_HOUSE_TOTP_SECRET`.

Set live and absent from `infra/github/github.toml`: repository secret `OPERATOR_EMAILS`, `prod` variable `PAYPAL_CLIENT_ID`, `prod` secret `PAYPAL_CLIENT_SECRET`, required check `content scan`.
