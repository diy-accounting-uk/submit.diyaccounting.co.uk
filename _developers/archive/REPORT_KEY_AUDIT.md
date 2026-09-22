<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Key audit: every long-lived credential, where it lives, who can read it, when it last rotated

Scope: every credential this company holds, across the six AWS accounts, the four GitHub repos,
Google Cloud, and this machine. No value read. Dates and rotation status only.

## 1. Credential inventory

| Name | Kind | Lives in | Readable by | Last rotated | Expiry | Rotation path | Exposure surface |
|---|---|---|---|---|---|---|---|
| Google sign-in OAuth client secret | OAuth client secret | GitHub secret `GOOGLE_CLIENT_SECRET` (ci, prod envs) -> AWS `{env}/submit/google/client_secret` (submit-ci, submit-prod) | `ci-*-app-*`/`ci-env-*` and `prod-*-app-*`/`prod-env-*` Lambda roles (Cognito identity provider config); GitHub Actions deploy job; SSO admins | RUNBOOK Sec3.3 claims 2026-01-24; `secrets-rotation.toml` leaves it blank (see gap 1) | none (Google console secret, no forced expiry) | code: `deploy-environment.yml` create-secrets job, manual console step for the new value | GitHub secret, two AWS Secrets Manager entries |
| HMRC production client secret | OAuth client secret | GitHub secret `HMRC_CLIENT_SECRET` (ci, prod) -> AWS `{env}/submit/hmrc/client_secret` | same Lambda role pattern; HMRC OAuth token exchange | RUNBOOK Sec3.3 claims 2025-07-24 (overdue by this table); toml blank (gap 1) | none stated | code: `deploy-environment.yml`; manual regenerate at HMRC Developer Hub | GitHub secret, two AWS secrets |
| HMRC sandbox client secret | OAuth client secret | GitHub secret `HMRC_SANDBOX_CLIENT_SECRET` (ci, prod) -> AWS `{env}/submit/hmrc/sandbox_client_secret` | same pattern | RUNBOOK Sec3.3 claims 2026-01-24; toml blank (gap 1) | none stated | code: `deploy-environment.yml`; manual at HMRC Developer Hub | GitHub secret, two AWS secrets |
| Companies House API key | API key | GitHub secret `COMPANIES_HOUSE_API_KEY` (ci: set 2026-09-05, prod: set 2026-09-06) -> AWS `{env}/submit/companies-house/api_key` | Lambda roles; GitHub Actions | none dated | none stated | code: `deploy-environment.yml` | GitHub secret, two AWS secrets |
| Companies House OAuth client secret | OAuth client secret | GitHub secret `COMPANIES_HOUSE_CLIENT_SECRET` (ci: set 2026-09-06, prod: set 2026-09-06) -> AWS `{env}/submit/companies-house/client_secret` | Lambda roles; GitHub Actions | none dated | none stated | code: `deploy-environment.yml`, skips silently if unset | GitHub secret, two AWS secrets |
| Companies House XML Gateway presenter ID | API credential (identifier) | GitHub secret `COMPANIES_HOUSE_PRESENTER_ID` (ci only, set 2026-09-12) -> AWS `ci/submit/companies-house/presenter_id` | Lambda roles; GitHub Actions | none dated | none stated | manual: emailed by Companies House | GitHub secret, one AWS secret (ci only) |
| Companies House XML Gateway presenter code | API credential | GitHub secret `COMPANIES_HOUSE_PRESENTER_CODE` (ci only, set 2026-09-12) -> AWS `ci/submit/companies-house/presenter_code` | Lambda roles; GitHub Actions | none dated | none stated | manual: emailed by Companies House | GitHub secret, one AWS secret (ci only) |
| Stripe live secret key | API key | GitHub secret `STRIPE_SECRET_KEY` (ci, prod: set 2026-05-13) -> AWS `{env}/submit/stripe/secret_key` | Lambda roles; GitHub Actions | none dated | none stated | code: `deploy-environment.yml`; manual at Stripe dashboard | GitHub secret, two AWS secrets |
| Stripe test secret key | API key | GitHub secret `STRIPE_TEST_SECRET_KEY` (ci, prod: set 2026-05-13) -> AWS `{env}/submit/stripe/test_secret_key` | Lambda roles; GitHub Actions; `scripts/proxy-secrets.sh` (local dev) | none dated | none stated | code: `deploy-environment.yml` | GitHub secret, two AWS secrets, local dev shell env when `proxy-secrets.sh` runs |
| Stripe live webhook secret | Webhook secret | GitHub secret `STRIPE_WEBHOOK_SECRET` (ci, prod: set 2026-05-13) -> AWS `{env}/submit/stripe/webhook_secret` | Billing webhook Lambda; GitHub Actions | none dated | none stated | code: `deploy-environment.yml`, skips if unset | GitHub secret, two AWS secrets |
| Stripe test webhook secret | Webhook secret | GitHub secret `STRIPE_TEST_WEBHOOK_SECRET` (ci, prod: set 2026-05-13) -> AWS `{env}/submit/stripe/test_webhook_secret` | Billing webhook Lambda; GitHub Actions | none dated | none stated | code: `deploy-environment.yml`, skips if unset | GitHub secret, two AWS secrets |
| GA4 analytics service-account key | Service-account key | Google Cloud project `diyaccounting-ga4`, service account `ga4-report-pull@...`; two live keys (created 2026-09-16T22:30 and 22:31); mirrored to AWS `ci/submit/ga4/service_account` and `prod/submit/ga4/service_account` | `ga4ReportPull.js`, `ga4EventExportPull.js` Lambdas; `google-key-rotate.yml` | 2026-09-16 (per `secrets-rotation.toml` and the two key-creation timestamps) | key itself has no expiry field (`9999-12-31`); rotated on a 90-day `max_age_days` policy | code: `.github/workflows/google-key-rotate.yml` monthly cron (`23 5 1 * *`), federated via OIDC, no GitHub secret round-trip | Two AWS secrets; was in public CI logs for five days until 2026-09-16 (O48, now remediated) |
| Telegram bot token (`@diyaccounting_bot`) | Bot token | GitHub secret `TELEGRAM_BOT_TOKEN` (ci, prod: set 2026-05-07) -> AWS `{env}/submit/telegram/bot_token` | Lambda activity-alert functions; GitHub Actions | none dated | none (Telegram tokens don't expire) | code: `deploy-environment.yml`; manual via BotFather to regenerate | GitHub secret, two AWS secrets |
| GitHub issue-bot token | PAT / bot token | GitHub repo secret `ISSUE_BOT_TOKEN` (set 2026-09-15) -> AWS `{env}/submit/github/issue_bot_token` | `agentic-lib-*.yml` workflows; Lambda functions that file issues; GitHub Actions | 2026-09-15 (`secrets-rotation.toml`; GH secret set date matches) | not visible from CLI (token itself, not queryable for expiry) | code: `deploy-environment.yml`, skips if unset; manual regenerate on GitHub | GitHub repo secret (shared by both environments), two AWS secrets |
| GitHub support-bot token | PAT / bot token | GitHub repo secret `SUPPORT_BOT_TOKEN` (set 2026-09-15) -> AWS `{env}/submit/github/support_bot_token` | support-issue workflows; GitHub Actions | 2026-09-15 (toml and GH date agree) | not visible from CLI | code: `deploy-environment.yml`, skips if unset; manual regenerate | GitHub repo secret, two AWS secrets |
| User-sub-hash salt | Signing/hash key (HMAC salt registry) | AWS `{env}/submit/user-sub-hash-salt` (submit-ci, submit-prod); physical 8-word passphrase card in a fire safe; KMS-encrypted copy in DynamoDB `system#config` | All Lambdas reading DynamoDB by `hashedSub`; resource policy scopes reads to `{env}-env-*`/`{env}-*-app-*` roles, the deployment role, and SSO admins | auto-created on first deploy; migration 003 rotated v1->v2 passphrase (date not recorded here) | none | code: `scripts/migrations/runner.js` (003-rotate-salt-to-passphrase); manual via `manage-secrets.yml` `restore-salt` for recovery | Two AWS secrets, one DynamoDB item, one physical card |
| Email-hash secret | Signing/hash key (HMAC) | AWS `{env}/submit/email-hash-secret` (submit-ci: changed 2026-09-12, submit-prod: changed 2026-09-12) | `passService.js` handlers via `EmailHashSecretHelper.java`-granted role | 2026-09-12 (`LastChangedDate`, only data point available) | none | manual only -- created by hand (`generate-pass.js` comment: "found absent until one was created"); no code path (gap 2) | Two AWS secrets |
| Local dev TLS certificate | TLS certificate | AWS `ci/submit/local-tls/certificate` (submit-ci only) | proxy behaviour tests; local `certbot renew --deploy-hook` | 2026-08-31 (`LastChangedDate`) | per Let's Encrypt cert lifetime (~90 days) | code: `certbot renew` deploy hook | One AWS secret, ci account only |
| YouTube OAuth client (desktop app) | OAuth client secret | AWS `prod/submit/youtube/oauth_client` (changed 2026-09-07) | `scripts/youtube-upload.js`; the operator (console walk-through, `videos/PUBLISH.md`) | 2026-09-07 (`LastChangedDate`) | none stated | manual only, no rotation script | One AWS secret, prod account only |
| YouTube OAuth refresh token | OAuth refresh token | AWS `prod/submit/youtube/refresh_token` (changed 2026-09-07) | `scripts/youtube-upload.js` | 2026-09-07 | Google refresh tokens don't expire unless revoked or unused 6 months | manual re-consent flow, no script | One AWS secret, prod account only |
| Behaviour-test TOTP seeds (per lane) | TOTP secret | AWS `{env}/submit/test/<lane>/totp-secret` -- 11 lanes in submit-ci, 10 in submit-prod, all changed 2026-09-17 (today) | `enableCognitoNative`/behaviour-test scripts; GitHub Actions test jobs | 2026-09-17, rotated every run | none | code: `npm run test:enableCognitoNative` rotates password + TOTP device per run | AWS secrets only, synthetic test users |
| `TEST_COMPANIES_HOUSE_TOTP_SECRET` | TOTP secret | Referenced in `probe-test.yml` and `deploy.yml` on the ci environment; **not found** in `gh secret list` for repo, ci or prod | Companies House behaviour-test lane | unknown -- secret does not exist (gap 3) | -- | -- | not applicable -- secret is missing |
| `AGENT_TOKEN` | PAT | GitHub repo secret (set 2026-09-12) | `agentic-lib-code.yml` and related workflows | 2026-09-12 | not visible from CLI | manual GitHub regenerate | GitHub repo secret |
| `AUTO_MERGE_TOKEN` | PAT | GitHub repo secret (set 2026-09-12) | `agentic-lib-pr.yml`, `/auto-merge` skill | 2026-09-12 | not visible from CLI | manual GitHub regenerate | GitHub repo secret |
| `PERSONAL_ACCESS_TOKEN` | PAT | GitHub repo secret (set 2026-05-07) | workflow automation | RUNBOOK Sec3.4: 2026-01-17 (predates the GH-reported set date, so the value was updated since) | not visible from CLI | manual, "rotate quarterly recommended" (no enforcement) | GitHub repo secret |
| `RELEASE_PAT` | PAT | GitHub repo secret (set 2026-09-16) | release-creation workflows | 2026-09-16 | not visible from CLI | manual, "rotate quarterly recommended" | GitHub repo secret |
| Orphaned `prod/submit/*` secrets in the ci account | OAuth client secret / API key / bot token / signing key (9 secrets: google client_secret, hmrc client_secret, hmrc sandbox_client_secret, stripe secret_key, stripe test_secret_key, stripe webhook_secret, stripe test_webhook_secret, telegram bot_token, user-sub-hash-salt) | AWS account 367191799875 (submit-ci), named `prod/submit/...`, ARNs confirmed distinct from the real prod copies in 972912397388 | Any principal the ci account's resource policies allow | 2026-02-21 (`LastChangedDate`, untouched since) | none | none -- no workflow writes to these names in the ci account (gap 4) | Live values sitting in the wrong account, unrotated for 7 months |
| Customer-managed KMS keys | KMS key | `ci-env-backup`, `ci-env-salt-encryption` (submit-ci, created 2026-02-19); `prod-env-backup`, `prod-env-salt-encryption` (submit-prod, created 2026-02-21); `submit-cross-account-backup` (submit-backup, created 2026-08-26) | Backup/restore Lambdas, DynamoDB salt-recovery path, cross-account backup vault | automatic annual rotation, all 5 report `KeyRotationEnabled: true` | n/a (AWS-managed rotation) | automatic | Account-scoped, no cross-account grant beyond the intended backup vault |
| AWS-managed default KMS keys | KMS key | `aws/s3`, `aws/lambda`, `aws/acm`, `aws/secretsmanager` -- one set each in submit-ci and submit-prod; `aws/s3` in submit-backup | Whichever service defaults to them when no CMK is specified | automatic annual rotation (AWS default) | n/a | automatic | Standard AWS default-key exposure, nothing repo-specific |
| GA4 project federation config | Federation config (not a secret value) | `infra/google/gcp/credentials/aws-ci.json`, `infra/google/gcp/credentials/aws-prod.json` -- tracked in git, last changed 2026-09-16 | Anyone with read access to the repository (public) | 2026-09-16 (created alongside the O48 remediation) | n/a | code: `scripts/gcp-identity-sync.js` | Public repository -- see gap 5 (content not verified) |
| Plaintext-named secret variables in tracked `.env.*` files | Local/test credential file | `.env.simulator`, `.env.test` (non-ARN `HMRC_CLIENT_SECRET`, `HMRC_SANDBOX_CLIENT_SECRET`, `COMPANIES_HOUSE_API_KEY`, `COMPANIES_HOUSE_CLIENT_SECRET`, `EMAIL_HASH_SECRET`, `USER_SUB_HASH_SALT`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_TEST_WEBHOOK_SECRET`); `.env.proxy`/`.env.proxyRunning` carry `USER_SUB_HASH_SALT`/`EMAIL_HASH_SECRET` the same way -- all tracked in git, all in the public repository | Anyone with read access to the repository | tracked since repo history (not dated per-file here) | n/a | none -- values are typed directly into the file, not sourced from a script | Public repository -- see gap 6 (values not read, not verified as mock-only) |
| Gmail-backup (gyb) service-account key | Service-account key | Google Cloud project `gyb-project-j7e-1uj-8n2`, one live key created 2026-08-23; **deleted 2026-09-18** (key `580fba0b…`), it was a by-product of gyb's project setup and nothing read it: `mail/pull.sh` runs gyb on per-mailbox user OAuth tokens (`/usr/local/etc/gyb/<mailbox>.cfg`), the Drive mirror on rclone's own OAuth client | Nothing; the key file was `/usr/local/etc/gyb/oauth2service.json` | 2026-08-23 (key creation date, no evidence of any later rotation) | `9999-12-31` (no expiry set) | none -- outside `google/*.toml`'s scope (gap 7) | Local machine, workspace mail-sync tooling |
| GitHub CLI session tokens (`gho_...`) | PAT (OAuth device token) | macOS keychain, `gh auth status`: accounts `antonycc` (active, scopes `admin:org, admin:public_key, delete:packages, gist, read:packages, repo`), `Antony-at-Polycode`, `antony-at-westfield`, `support-at-diyaccounting` | This machine only | not shown by `gh auth status` | GitHub OAuth device tokens don't show expiry via this command | manual `gh auth login`/`gh auth refresh` | Local machine (macOS keychain) |
| SSH keys | SSH key | `~/.ssh/id_antony_polycode_mbp_2025` (created 2025-01-16); a second key fingerprint (`antonyccartwright@gmail.com`) loaded in the agent, file not located in this audit's scope | Git push over SSH (`git-push-auth.md` memory note) | 2025-01-16 (file mtime for the named key) | none | manual regenerate | Local machine only |
| AWS SSO cached session tokens | IAM SSO session credential | `~/.aws/sso/cache/*.json`, most recent refreshed 2026-09-17 | Whoever is signed into this machine's SSO session (`aws sso login --sso-session diyaccounting`) | refreshed same-day, ~8-12h lifetime per session | ~8-12 hours | automatic re-login via `aws sso login` | Local machine only |
| gcloud user OAuth credentials | OAuth credential | `~/.config/gcloud/` -- active account `antony@diyaccounting.co.uk`, secondary `antony@polycode.co.uk`; `application_default_credentials.json` (last modified 2026-08-19) | This machine only | 2026-08-19 (ADC file mtime) | Google user OAuth tokens refresh automatically while in use | manual `gcloud auth login` / `gcloud auth application-default login` | Local machine only |
| Root `.env` (Telegram, Google, Cognito secrets) | Password/token collection | `.env` at the repo root (gitignored, `.gitignore:124`); does not exist in this worktree | Whoever has this machine and the file | not checked (file absent here) | n/a | manual, values sourced from AWS Secrets Manager or typed by hand per submit `CLAUDE.md` | Local machine only, explicitly excluded from git |
| AWS IAM users / long-lived access keys | IAM access key | None found | -- | -- | -- | -- | Zero across all six accounts (submit-ci, submit-prod, management, gateway, spreadsheets, submit-backup) -- every one queried empty |

Companies House XML Gateway presenter id/code: `secrets-rotation.toml`'s header comment says
these are "GitHub secrets not yet set in either environment." `gh secret list --env ci` shows
both set since 2026-09-12. The comment is stale for ci; prod still has neither.

## 2. GitHub secret to AWS secret flow (`deploy-environment.yml`, `create-secrets` job)

| GitHub secret | AWS Secrets Manager path | Skips silently if unset? |
|---|---|---|
| `GOOGLE_CLIENT_SECRET` | `{env}/submit/google/client_secret` | No |
| `HMRC_CLIENT_SECRET` | `{env}/submit/hmrc/client_secret` | No |
| `HMRC_SANDBOX_CLIENT_SECRET` | `{env}/submit/hmrc/sandbox_client_secret` | No |
| `COMPANIES_HOUSE_API_KEY` | `{env}/submit/companies-house/api_key` | No |
| `COMPANIES_HOUSE_CLIENT_SECRET` | `{env}/submit/companies-house/client_secret` | Yes |
| `COMPANIES_HOUSE_PRESENTER_ID` | `{env}/submit/companies-house/presenter_id` | Yes |
| `COMPANIES_HOUSE_PRESENTER_CODE` | `{env}/submit/companies-house/presenter_code` | Yes |
| `STRIPE_SECRET_KEY` | `{env}/submit/stripe/secret_key` | No |
| `STRIPE_TEST_SECRET_KEY` | `{env}/submit/stripe/test_secret_key` | No |
| `STRIPE_WEBHOOK_SECRET` | `{env}/submit/stripe/webhook_secret` | Yes |
| `STRIPE_TEST_WEBHOOK_SECRET` | `{env}/submit/stripe/test_webhook_secret` | Yes |
| `GA4_SERVICE_ACCOUNT_JSON` | `{env}/submit/ga4/service_account` | Yes (superseded -- `google-key-rotate.yml` now writes this secret directly over OIDC; the GitHub secret itself is no longer set in ci or prod) |
| `TELEGRAM_BOT_TOKEN` | `{env}/submit/telegram/bot_token` | No |
| `ISSUE_BOT_TOKEN` | `{env}/submit/github/issue_bot_token` | Yes |
| `SUPPORT_BOT_TOKEN` | `{env}/submit/github/support_bot_token` | Yes |
| (generated, not a GitHub secret) | `{env}/submit/user-sub-hash-salt` -- created with `openssl rand` on first deploy if absent | n/a |

## 3. Gaps

1. `secrets-rotation.toml` (the newer, authoritative record per its own header) leaves
   `last_rotated` blank for `google/client_secret`, `hmrc/client_secret` and
   `hmrc/sandbox_client_secret`. `RUNBOOK_INFORMATION_SECURITY.md` Sec3.3 asserts specific dates
   for the same three (2026-01-24, 2025-07-24, 2026-01-24) and calls the HMRC one overdue. The
   two documents disagree; the true last-rotation date for these three is unknown.
2. `email-hash-secret` has no rotation code path -- created by hand once, no script writes it.
3. `TEST_COMPANIES_HOUSE_TOTP_SECRET` is read by `probe-test.yml` and `deploy.yml` on the ci
   environment but is absent from every `gh secret list` this audit ran (repo, ci, prod).
4. Nine `prod/submit/*` secrets sit in the submit-ci account (367191799875), unchanged since
   2026-02-21, distinct ARNs from the real prod copies in submit-prod (972912397388) -- an
   orphaned duplicate set with no rotation and no code path writing to it.
5. `infra/google/gcp/credentials/aws-ci.json` and `aws-prod.json` are tracked in the public repository;
   this audit could not read their content (blocked as credential materialization) to confirm
   they hold only federation config and no secret material.
6. `.env.simulator` and `.env.test` (and `.env.proxy`/`.env.proxyRunning`) carry plaintext-named
   variables (`HMRC_CLIENT_SECRET`, `HMRC_SANDBOX_CLIENT_SECRET`, `COMPANIES_HOUSE_API_KEY`,
   `COMPANIES_HOUSE_CLIENT_SECRET`, `EMAIL_HASH_SECRET`, `USER_SUB_HASH_SALT`,
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_TEST_WEBHOOK_SECRET`) and are tracked
   in the public repository. This audit did not read the values; whether they hold only mock
   data was not confirmed.
7. The gyb (Gmail backup) service-account key in project `gyb-project-j7e-1uj-8n2` sits outside
   every plan file (`google/*.toml` covers only `diyaccounting-ga4`) -- no rotation schedule, no
   `secrets-rotation.toml` entry.
8. `RUNBOOK_INFORMATION_SECURITY.md` Sec3.4 names `SUPPORT_ISSUE_PAT` and `TEST_HMRC_PASSWORD`;
   neither exists as a GitHub secret today, and neither name appears in any current workflow --
   the table is stale (the real names are `ISSUE_BOT_TOKEN`/`SUPPORT_BOT_TOKEN`; HMRC sandbox
   test users are minted live per run, not from a stored password).
9. No repo-level PAT (`AGENT_TOKEN`, `AUTO_MERGE_TOKEN`, `PERSONAL_ACCESS_TOKEN`, `RELEASE_PAT`,
   `ISSUE_BOT_TOKEN`, `SUPPORT_BOT_TOKEN`) shows an expiry from `gh secret list` -- GitHub does
   not report PAT expiry to a secret's holder, only to the PAT's own creator via
   `gh api /user` on the token-owning account, which this audit did not have reason to query
   for a token it doesn't own.
10. No long-lived IAM access key and no wildcard `secretsmanager:GetSecretValue` customer-managed
    IAM policy were found in submit-ci or submit-prod. Inline policies on the ~450 (ci) and ~280
    (prod) IAM roles were not individually opened -- out of proportion for this audit's read list.

## 4. What could not be read

- `infra/google/gcp/credentials/aws-ci.json` / `aws-prod.json` content -- blocked by the harness as
  credential materialization; only file dates were obtainable (`git log`).
- Inline policy documents on individual IAM roles in submit-ci (455 roles) and submit-prod (280
  roles) -- only customer-managed (Local scope) policies were scanned for a wildcard
  `secretsmanager:GetSecretValue` grant; none found.
- PAT expiry/scopes for `AGENT_TOKEN`, `AUTO_MERGE_TOKEN`, `PERSONAL_ACCESS_TOKEN`, `RELEASE_PAT`,
  `ISSUE_BOT_TOKEN`, `SUPPORT_BOT_TOKEN` -- GitHub's `gh secret list` gives only a set date, not
  the underlying PAT's scopes or expiry.
- The gyb service-account key's local file location on this machine -- not found within a
  three-level search from the home directory.
- SSH private key file behind the second agent-loaded fingerprint
  (`antonyccartwright@gmail.com`) -- not located.
- The exact rotation date for the salt's v1->v2 migration (003-rotate-salt-to-passphrase) -- no
  date recorded in any file this audit read.

## 5. Rows for NEXT.md

- **B53.x** -- Reconcile `secrets-rotation.toml` vs `RUNBOOK_INFORMATION_SECURITY.md` Sec3.3 on
  Google/HMRC/HMRC-sandbox rotation dates; keep one source. Owner: operator. Model: sonnet. Size: S.
- **B53.x** -- Delete the nine orphaned `prod/submit/*` secrets from the submit-ci account
  (367191799875) once confirmed unused. Owner: operator (AWS write). Model: sonnet. Size: S.
- **B53.x** -- Add a code path (script or workflow) for rotating `email-hash-secret`, matching
  the salt's pattern. Owner: agent. Model: sonnet. Size: M.
- **B53.x** -- Set `TEST_COMPANIES_HOUSE_TOTP_SECRET` on the ci (and prod, if needed) GitHub
  environment, or remove the dead reference from `probe-test.yml`/`deploy.yml`. Owner: operator.
  Model: haiku. Size: S.
- **B53.x** -- Decide whether Companies House presenter_id/presenter_code should exist in prod;
  update `secrets-rotation.toml`'s stale "not yet set in either environment" comment either way.
  Owner: operator. Model: haiku. Size: S.
- **B53.x** -- Confirm `.env.simulator`/`.env.test`/`.env.proxy` plaintext-named secret variables
  hold only mock values, given they are tracked in the public repository. Owner: operator.
  Model: sonnet. Size: S.
- **B53.x** -- Bring the gyb-project GCP service-account key under a rotation plan (or fold it
  into `google/*.toml` if it belongs to this org's Google estate). Owner: operator. Model: sonnet.
  Size: M.
- **B53.x** -- Update `RUNBOOK_INFORMATION_SECURITY.md` Sec3.4: replace `SUPPORT_ISSUE_PAT` with
  the real `ISSUE_BOT_TOKEN`/`SUPPORT_BOT_TOKEN` names, drop `TEST_HMRC_PASSWORD`. Owner: agent.
  Model: haiku. Size: S.
