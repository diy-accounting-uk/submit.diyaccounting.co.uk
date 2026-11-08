---
name: key-rotation
description: Run a full key rotation with the operator present. Rolls every key in secrets-rotation.toml, the email hash secret, the Companies House presenter id and the local TLS certificate, in dependency order, ci before prod. The session does the machine steps and talks the operator through each console step, one action at a time with its URL. Each AWS, GitHub and vendor write waits for the operator's go. Ends with rotation-check and a record in the private repository. Invoke when the operator says "rotate the keys", "full rotation", "key rotation", "roll the secrets", or when a rotation-check issue lists due keys.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability OPS-184 Run a full key rotation with the operator
- **Use when:** every key in the rotation set must roll, or a rotation-check issue lists due keys, and the operator is present for the console steps.
- **Does:** key-rotation runs the keys of secrets-rotation.toml, plus email-hash-secret, the Companies House presenter id and the local TLS certificate, in the order of the security runbook section 3.3. Per key it gives the operator one console action at a time, runs rotate-secret.yml, salt-rotate.yml, email-hash-rotate.yml, mcp-blob-key-rotate.yml or local-tls-renew.yml after the operator's go, proves the new value, retires the old one, and reads back the rotated-at tag or the GitHub secret date. It ends with rotation-check.yml, a PR for secrets-rotation.toml and a record in the private repository.
- **Run:** `/key-rotation`
- **Entry:** `.claude/skills/key-rotation/SKILL.md`
- **Files:** .claude/skills/key-rotation/SKILL.md, secrets-rotation.toml, .github/workflows/rotate-secret.yml, scripts/rotate-secret-plan.js, scripts/put-secret-with-rotation-tag.sh, .github/workflows/rotation-check.yml
- **Keywords:** key rotation, full rotation, roll secrets, rotate keys, rotation set, rotated-at, vendor console, operator walk-through
- **Related:** OPS-165, OPS-166, OPS-169, OPS-170, OPS-171, OPS-43, OPS-45
@end-capability -->

# key-rotation

**SSO check.** Before the first AWS call, and before any request that the operator log in, run
`aws --profile diya-submit-ci sts get-caller-identity` and `aws --profile diya-submit-prod sts
get-caller-identity` in the same turn. Ask for `aws sso login --sso-session diyaccounting` only when
one fails, and name the profile and the error. Never ask for a login from memory.

The authority for the order and for each key's procedure is
`../private.diyaccounting.co.uk/security/RUNBOOK_INFORMATION_SECURITY.md` sections 3 and 4. This
skill applies it to the current code. Where they differ, this skill holds the commands that work.

## Rules

- Never put a key value in the chat, a commit, a workflow input, an issue or a log. A value moves
  by file or by pipe into `gh secret set`. The Actions logs are public.
- Each step has a mark: `machine` (the session runs it), `operator` (a person does it), or
  `machine after go` (the session runs it after the operator says go for that key).
- The session must not run these: an AWS write outside a workflow, `gh secret set`,
  `gh secret delete`, `gh variable set`, a ruleset or Actions-settings write, a Cognito or Step
  Functions invocation. Print each one in its own fenced block with the `!` prefix. Print one at a
  time. Wait for the operator's result before the next step.
- Each AWS, GitHub or vendor write needs the operator's go in this run. A go covers one key.
- A vendor console step: before you give a label, confirm the current page. Read the vendor's API
  state first, then search the vendor's documentation on the web. Give only the labels you
  confirmed. Give only the entry URL in this skill. Google console URLs carry `authuser=1`.
- Roll ci before prod for each key that has both.
- Never run a DynamoDB Scan on a prod customer table. `salt-rotate.yml` is the one approved
  exception, inside the workflow.
- If a proof fails, stop that key. Do not retire the old value. Tell the operator. Go on with the
  next key that does not depend on it (see the order).
- To wait for a workflow, read the run id with
  `gh run list --workflow <file> --limit 1 --json databaseId,status,createdAt`. Then run
  `gh run watch <id> --exit-status` in the foreground with a timeout.

## Common steps

The sections below use these names.

- **Set `<NAME>` `<env>`** (operator). The operator pastes the value at the prompt, or pipes a file:

  ```
  ! gh secret set <NAME> --env <env> --repo diy-accounting-uk/submit.diyaccounting.co.uk < <file>
  ```

  A repository secret has no `--env`.
- **Store `<suffix>` `<env>`** (machine after go). This writes the GitHub secret to
  `<env>/submit/<suffix>`, stamps `rotated-at`, and runs the vendor assert. For
  `google/client_secret` it also refreshes the Cognito identity provider.

  ```
  gh workflow run rotate-secret.yml -f secret=<suffix> -f environment-name=<env>
  ```

  A red assert step is a failed proof.
- **Spread** (machine). Wait 10 minutes. Each reader in `app/lib/cachedSecret.js` reads again after
  5 minutes, and at once after an authentication failure. No deploy is needed.
- **Read back** (machine). For an AWS secret, the tag must show today:

  ```
  aws --profile diya-submit-<env> secretsmanager describe-secret --secret-id <env>/submit/<suffix> --region eu-west-2 --query "Tags[?Key=='rotated-at'].Value|[0]" --output text
  ```

  For a GitHub secret, `gh secret list [--env <env>] --repo <repo>` must show today for the name.
- **Record** (machine). In the record worktree, set `last_rotated` to today on the entry in
  `secrets-rotation.toml`. If the entry has `expires_at = "2026-11-30"`, delete that line. That
  date is a placeholder for a key with no roll date. Add one line to the run log (see Close).

## 1. Preconditions

1. machine: `aws --profile diya-submit-prod sts get-caller-identity`, then the same with
   `diya-submit-ci`. If one fails, print this and wait:

   ```
   ! aws sso login --sso-session diyaccounting
   ```

2. machine: `node scripts/check-rotation.js --environment ci 2>&1 | tee <scratchpad>/rotation-ci.txt`,
   then the same for prod. Show the operator the lines.
3. machine: `gh run list --workflow deploy.yml --branch main --limit 3 --json status,conclusion,headSha`.
   The last run must be green. No `deploy.yml` or `deploy-environment.yml` run may be in flight.
4. machine: read the newest `../private.diyaccounting.co.uk/security/EXPOSURE_CHECK_*.md`. It must
   have no open finding. An open finding rolls first, by its own key section.
5. machine: `grep -n -B4 'expires_at = "2026-11-30"' secrets-rotation.toml`. These keys have no roll
   date. Take them first, after steps 2 and 3 of the order.
6. machine: make the record worktree:
   `git worktree add .claude/worktrees/key-rotation -b claude/ops-key-rotation origin/main`.
7. operator: confirm the time. No Companies House filing is in progress. No workflow that reads a
   PAT is running. Show the order table and wait for go.

## 2. Order

| Step | Keys | Section | Reason |
|---|---|---|---|
| 1 | preconditions | 1 | |
| 2 | Ops App, Agent App keys | 3.1 | alarms and support issues reach GitHub through them |
| 3 | Telegram bot token | 3.2 | short gap; alerts then serve the rest of the run |
| 4 | HMRC sandbox, Stripe test key, Stripe test webhooks | 3.3, 3.4, 3.5 | no customer risk; ci proofs need them |
| 5 | HMRC prod, Stripe live key and webhook, Google sign-in, Companies House, PayPal | 3.6 to 3.10 | live keys |
| 6 | Desktop OAuth client, then its three refresh tokens | 3.11, 3.12 | the tokens belong to the client |
| 7 | Support Gmail draft key, Microsoft Ads token, PAT, origin secret, local TLS | 3.13 to 3.18 | independent of each other |
| 8 | Email hash secret, then MCP blob key | 3.19, 3.20 | generated by us |
| 9 | Salt, only on the operator's word | 3.21 | it changes stored data |
| 10 | Close | 4 | |

A failed proof in step 2 stops the run, because later failures cannot raise an issue. A failed
Desktop client proof (3.11) stops 3.12.

Not in the run: the Drive Picker API key (runbook 3.4.18) rolls on abuse only.
`operator-emails` is personal data. It rolls on a staff change only: Set `OPERATOR_EMAILS`, then
`gh workflow run deploy-environment.yml -f environment-name=<env>`.

## 3. Keys

### 3.1 GitHub App private keys

`OPS_APP_PRIVATE_KEY` (repository secret; AWS copies `ci/submit/github/ops_app_private_key`,
`prod/submit/github/ops_app_private_key`). `AGENT_APP_PRIVATE_KEY` (repository secret only). Up to
25 keys work together. Do the Ops App, then the Agent App.

1. operator: open https://github.com/organizations/diy-accounting-uk/settings/apps and select the
   App (`diyaccounting-ops`, then `diyaccounting-agent`).
2. operator: generate a private key. The browser saves a `.pem` file.
3. operator: Set `OPS_APP_PRIVATE_KEY` (repository) from the file. For the Agent App the name is
   `AGENT_APP_PRIVATE_KEY`.
4. machine after go (Ops App only): Store `github/ops_app_private_key` ci, then prod.
5. machine (Ops App only): Spread.
6. machine: proof, Ops App. Read the next 03:20 UTC run of `/aws/lambda/<env>-env-security-lake-nightly`
   for no GitHub error. Retire waits for this read. Put it on the deferred list (Close, step 2).
7. machine after go: proof, Agent App. `gh workflow run support-mail-intake.yml -f dry-run=true`
   must be green.
8. operator: delete the old key on the App's page.
9. operator: delete the `.pem` file.
10. machine: Read back, then Record.

### 3.2 Telegram bot token

`TELEGRAM_BOT_TOKEN` (ci and prod environments; `<env>/submit/telegram/bot_token`). No overlap:
the old token ends when BotFather issues the new one.

1. operator: open https://t.me/BotFather. Send `/mybots`, select `@diyaccounting_bot`, and revoke
   the current token.
2. operator: Set `TELEGRAM_BOT_TOKEN` ci, then prod.
3. machine after go: Store `telegram/bot_token` ci, then prod. The assert step is the proof
   (`infra/telegram/telegram-assert.js`).
4. machine: Spread. The forwarder reads again on its first 401.
5. machine: Read back, then Record.

### 3.3 HMRC sandbox client secret

One sandbox application serves ci, prod and the local proxy. It fills `HMRC_SANDBOX_CLIENT_SECRET`
(ci, prod) and `HMRC_CLIENT_SECRET` (ci). Up to 5 secrets work together.

1. operator: open https://developer.service.hmrc.gov.uk/developer/applications, select the sandbox
   application, and generate a new client secret.
2. operator: Set `HMRC_SANDBOX_CLIENT_SECRET` ci, then `HMRC_CLIENT_SECRET` ci, then
   `HMRC_SANDBOX_CLIENT_SECRET` prod.
3. machine after go: Store `hmrc/sandbox_client_secret` ci, `hmrc/client_secret` ci, then
   `hmrc/sandbox_client_secret` prod. Each runs `infra/hmrc/hmrc-assert.js`.
4. machine: Spread.
5. machine after go: proof. Read the live ci deployment:
   `aws --profile diya-submit-ci ssm get-parameter --name /submit/ci/last-known-good-deployment --query Parameter.Value --output text`.
   Then run
   `gh workflow run probe-test.yml --ref main -f environment-name=ci -f deployment-name=<it> -f behaviour-test-suite=submitVatBehaviour`.
6. operator: delete the old secret on the Developer Hub.
7. machine: Read back the three secrets, then Record `hmrc/sandbox_client_secret` and
   `hmrc/client_secret`.

### 3.4 Stripe test secret key

One test key fills `STRIPE_TEST_SECRET_KEY` (ci, prod) and `STRIPE_SECRET_KEY` (ci). The old key
works for the expiry you choose, up to 7 days, and then ends by itself.

Warning: the test keys and test webhooks live in the sandbox "DIY Accounting Limited sandbox"
(`acct_1SyN31FdFHdRoTOj`), not in the main account's test mode. A key from the main account's test
mode passes the store's assert, but it holds no prices or webhooks, so ci checkout breaks.

1. operator: in the Stripe dashboard's account menu, switch to "DIY Accounting Limited sandbox".
   Open its API keys page, roll the secret key, and set the old key to expire in 7 days.
2. machine: before the operator pastes anything, check the new key's account. The operator
   copies the key, and the session reads only the account id behind it.
3. operator: Set `STRIPE_TEST_SECRET_KEY` ci, `STRIPE_SECRET_KEY` ci, then
   `STRIPE_TEST_SECRET_KEY` prod, in the operator's own terminal.
3. machine after go: Store `stripe/test_secret_key` ci, `stripe/secret_key` ci, then
   `stripe/test_secret_key` prod. Each runs `infra/stripe/stripe-sync.js` as a plan.
4. machine after go: proof. Run `probe-test.yml` as in 3.3 step 5 with
   `-f behaviour-test-suite=paymentBehaviour`.
5. machine: Read back, then Record `stripe/test_secret_key`.

### 3.5 Stripe webhook signing secrets

`infra/stripe/stripe.toml` has three endpoints. ci test fills `STRIPE_TEST_WEBHOOK_SECRET` ci. prod
test fills `STRIPE_TEST_WEBHOOK_SECRET` prod. prod live fills `STRIPE_WEBHOOK_SECRET` prod (step 5
of the order, after 3.7). Both secrets sign each event for up to 24 hours.

Warning: finish steps 2 to 4 inside 24 hours. After that, a reader with the old secret refuses
events with a 400.

1. operator: open the webhooks page (for a test endpoint, in the sandbox "DIY Accounting Limited
   sandbox"), select the endpoint, roll its signing secret, and delay the old secret's expiry by 24 hours.
2. operator: Set the GitHub secret of that endpoint for its environment.
3. machine after go: Store `stripe/test_webhook_secret` (or `stripe/webhook_secret` for live) for
   that environment.
4. machine: Spread.
5. operator: resend one recent event from the endpoint's event deliveries. It must show a 200.
6. machine: Read back, then Record.

`ci/submit/stripe/webhook_secret` belongs to no endpoint. Do not roll it.

### 3.6 HMRC production client secret

`HMRC_CLIENT_SECRET` prod (`prod/submit/hmrc/client_secret`). Up to 5 secrets work together.

Warning: if you delete the old secret before the proof, customer token exchange fails.

1. operator: open https://developer.service.hmrc.gov.uk/developer/applications, select the
   production application, and generate a new client secret.
2. operator: Set `HMRC_CLIENT_SECRET` prod.
3. machine after go: Store `hmrc/client_secret` prod. The assert runs `hmrc-assert.js`.
4. machine: Spread.
5. machine: proof. Read `/aws/lambda/<prod deployment>-app-hmrc-token-post` (the deployment from
   `/submit/prod/last-known-good-deployment`) for one exchange after Spread and no
   `invalid_client`. Wait for a customer exchange if none has happened.
6. operator: delete the old secret on the Developer Hub.
7. machine: Read back, then Record.

### 3.7 Stripe live secret key, then the live webhook

`STRIPE_SECRET_KEY` prod (`prod/submit/stripe/secret_key`). Every call reads the key, so Store
spreads it.

1. operator: open https://dashboard.stripe.com/apikeys, roll the secret key, and set the old key
   to expire in 7 days.
2. operator: Set `STRIPE_SECRET_KEY` prod.
3. machine after go: Store `stripe/secret_key` prod. The assert runs
   `stripe-sync.js --environment prod --mode live` as a plan. That is the proof.
4. machine: Read back, then Record.
5. Roll the prod live webhook by 3.5.

### 3.8 Google sign-in client secret

`GOOGLE_CLIENT_SECRET` (ci, prod; `<env>/submit/google/client_secret`). Cognito holds a copy.
Store refreshes it.

1. operator: open https://console.cloud.google.com/auth/clients?authuser=1, select the sign-in
   client, add a secret, and copy it.
2. operator: Set `GOOGLE_CLIENT_SECRET` ci.
3. machine after go: Store `google/client_secret` ci.
4. machine after go: proof. `gh workflow run google-apply.yml -f apply=false`. Its
   `Run google-oauth-assert` step must pass.
5. operator: sign in with Google on https://ci-submit.diyaccounting.co.uk.
6. Repeat steps 2 to 5 for prod, on https://submit.diyaccounting.co.uk.
7. operator: disable the old secret on the client page.
8. operator: sign in with Google again on both sites. If it fails, enable the old secret again and
   stop this key.
9. operator: delete the old secret.
10. machine: Read back, then Record.

### 3.9 Companies House keys

One key of each type per application, so each roll has a gap. Choose a time with no filing.

| GitHub secret | Environments | Store suffix |
|---|---|---|
| `COMPANIES_HOUSE_API_KEY` | ci, prod | `companies-house/api_key` |
| `COMPANIES_HOUSE_CLIENT_SECRET` | ci, prod | `companies-house/client_secret` |
| `COMPANIES_HOUSE_SANDBOX_API_KEY` | ci | `companies-house/sandbox_api_key` |

For each row and environment:

1. operator: open https://developer.company-information.service.gov.uk/manage-applications,
   select the application, and create a new key.
2. operator: Set the GitHub secret.
3. machine after go: Store the suffix. The assert runs `companies-house-assert.js`. That is the
   proof.
4. machine: Spread.
5. operator: delete the old key.
6. machine: Read back, then Record.

Presenter id and code (`COMPANIES_HOUSE_PRESENTER_ID`, `COMPANIES_HOUSE_PRESENTER_CODE`; suffixes
`companies-house/presenter_id`, `companies-house/presenter_code`). Companies House issues them by
email. Roll them on exposure only: Set, then Store, then Spread. The proof is the Store's assert,
then `probe-test.yml` as in 3.3 step 5 with `-f behaviour-test-suite=companiesHouseBehaviour`.
Never file a live return to prove it.

Test sign-in (`TEST_COMPANIES_HOUSE_PASSWORD`, `TEST_COMPANIES_HOUSE_TOTP_SECRET`, ci environment,
GitHub only):

1. operator: change the password and the authenticator app in the Companies House test account.
   Confirm the page first, as the Rules say.
2. operator: Set both for ci.
3. machine after go: proof. Run `probe-test.yml` as in 3.3 step 5 with
   `-f behaviour-test-suite=changeRegisteredOfficeBehaviour -f runCompaniesHouseSandboxFiling=true`.
4. machine: Read back, then Record both entries.

### 3.10 PayPal client secret

`PAYPAL_CLIENT_SECRET` prod (`prod/submit/paypal/client_secret`). The app holds two secrets.

1. operator: open https://developer.paypal.com/dashboard/applications/live, select the app, and
   generate a second secret.
2. operator: Set `PAYPAL_CLIENT_SECRET` prod.
3. machine after go: Store `paypal/client_secret` prod. The assert runs `paypal-assert.js`. That
   is the proof.
4. operator: disable the old secret, then delete it.
5. machine: Read back, then Record.

### 3.11 Desktop OAuth client

`prod/submit/youtube/oauth_client`, AWS only. One client serves YouTube, Google Ads and Microsoft
Ads.

1. operator: open https://console.cloud.google.com/auth/clients?authuser=1&project=diyaccounting-ga4,
   select the Desktop client, add a secret, and download the client JSON.
2. operator: write it with its tag:

   ```
   ! AWS_PROFILE=diya-submit-prod scripts/put-secret-with-rotation-tag.sh prod/submit/youtube/oauth_client "$(cat <file>)"
   ```

3. machine after go: proof. `gh workflow run youtube-check.yml`,
   `gh workflow run google-apply.yml -f apply=false` (its Google Ads plan step), and
   `gh workflow run msads-apply.yml -f apply=false`. All must be green.
4. operator: disable the old secret.
5. machine after go: run the three proofs again. If one fails, the operator enables the old secret
   again and the run skips 3.12.
6. operator: delete the old secret and the JSON file.
7. machine: Read back, then Record.

### 3.12 Google refresh tokens

`prod/submit/youtube/refresh_token`, `prod/submit/google/ads/refresh_token`,
`prod/submit/microsoft-ads/google_refresh_token`. A new consent gives a second token, so the old
token works until the tool revokes it. For each of `youtube`, `ads`, `msads`:

1. operator: run the tool. It writes to AWS from this machine.

   ```
   ! AWS_PROFILE=diya-submit-prod node scripts/google-reconsent.js --token <youtube|ads|msads>
   ```

2. operator: approve the consent page as the account owner. The tool checks the new token,
   writes it, then revokes the old token.
3. machine after go: proof. `youtube` uses `youtube-check.yml`. `ads` uses
   `google-apply.yml -f apply=false`. `msads` uses `msads-apply.yml -f apply=false`.
4. machine: Read back, then Record.

### 3.13 Support Gmail draft key

`SUPPORT_GMAIL_DRAFT_KEY` (prod environment, GitHub only) is the key of `support-gmail-draft`.
Up to 10 keys work together. This step goes away when federation replaces this key. The read
account `support-gmail-read` holds no key, because the intake job federates and signs its
assertion through IAM Credentials.

For `support-gmail-draft` with `SUPPORT_GMAIL_DRAFT_KEY`:

1. machine after go: in the operator's gcloud session,
   `gcloud iam service-accounts keys create <scratchpad>/sa.json --iam-account=support-gmail-draft@diyaccounting-ga4.iam.gserviceaccount.com`.
2. operator: Set `SUPPORT_GMAIL_DRAFT_KEY` prod from `<scratchpad>/sa.json`.
3. machine after go: proof. The next `support-triage.yml` run that writes a draft.
4. machine after go: list the keys with `gcloud iam service-accounts keys list --iam-account=support-gmail-draft@diyaccounting-ga4.iam.gserviceaccount.com`.
   Delete the old one with `gcloud iam service-accounts keys delete <key-id> --iam-account=support-gmail-draft@diyaccounting-ga4.iam.gserviceaccount.com`.
5. machine: delete `<scratchpad>/sa.json`.
6. machine: Read back, then Record.

### 3.14 Microsoft Ads developer token

`prod/submit/microsoft-ads/developer_token`, AWS only. One token. No roll route is published.

1. operator: open https://ads.microsoft.com/cc/settings/devsettings and sign in as the account
   owner.
2. operator: request a new token if the page offers it. If not, skip this key. A roll then needs
   Microsoft support.
3. operator: write it with its tag:

   ```
   ! AWS_PROFILE=diya-submit-prod scripts/put-secret-with-rotation-tag.sh prod/submit/microsoft-ads/developer_token "$(cat <file>)"
   ```

4. machine after go: proof. `gh workflow run msads-apply.yml -f apply=false`.
5. machine: Read back, then Record.

### 3.15 Fine-grained PATs

Regenerate replaces the value at once. Each token is read when its workflow starts, so roll it with
none of its workflows running.

| Secret | Repository | Proof |
|---|---|---|
| `HOMEBREW_DISPATCH_TOKEN` | spreadsheets | the next `publish-diya-gl.yml` run in the spreadsheets repository |

For each row:

1. operator: open https://github.com/settings/personal-access-tokens, select the token, regenerate
   it, and set the expiry to 366 days.
2. operator: Set the repository secret. For `HOMEBREW_DISPATCH_TOKEN`, use
   `--repo diy-accounting-uk/spreadsheets.diyaccounting.co.uk`.
3. machine after go: the proof in the table.
4. machine: Read back. Record: set `last_rotated` to today and `expires_at` to the new expiry the
   operator reads on the token page.

### 3.17 Origin secret

`ORIGIN_VERIFY_SECRET` and `ORIGIN_VERIFY_SECRET_PREVIOUS` (ci, prod environments).
`deploy-environment.yml` writes `<env>/submit/origin/verify` as `{"current","previous"}` in
eu-west-2 and us-east-1. The API Lambdas accept both values. CloudFront sends the value that
EdgeStack read at its deploy. For ci, then prod:

1. operator: copy the current value to the previous one, without printing it:

   ```
   ! aws --profile diya-submit-<env> secretsmanager get-secret-value --secret-id <env>/submit/origin/verify --region eu-west-2 --query SecretString --output text | jq -r .current | gh secret set ORIGIN_VERIFY_SECRET_PREVIOUS --env <env> --repo diy-accounting-uk/submit.diyaccounting.co.uk
   ```

2. operator: set a new current value:

   ```
   ! openssl rand -hex 32 | gh secret set ORIGIN_VERIFY_SECRET --env <env> --repo diy-accounting-uk/submit.diyaccounting.co.uk
   ```

3. machine after go: `gh workflow run deploy-environment.yml -f environment-name=<env>`.
4. machine: Spread. The Lambdas read the secret every 5 minutes.
5. machine after go: deploy the live deployment's EdgeStack, from
   `/submit/<env>/last-known-good-deployment`:
   `gh workflow run deploy-cdk-stack.yml --ref main -f stackName=<deployment>-app-EdgeStack -f environment-name=<env> -f deployment-name=<deployment> -f force-stack-deployment=true`.
6. machine: proof. The `Submit/OriginVerify` metrics `OriginHeaderInvalid` and
   `OriginHeaderMissing` stay at 0 for 15 minutes after step 5.
7. operator: clear the previous value:

   ```
   ! gh secret delete ORIGIN_VERIFY_SECRET_PREVIOUS --env <env> --repo diy-accounting-uk/submit.diyaccounting.co.uk
   ```

8. machine after go: `gh workflow run deploy-environment.yml -f environment-name=<env>`.
9. machine: Read back, then Record.

### 3.18 Local TLS certificate

`ci/submit/local-tls/certificate` (Let's Encrypt, 90 days). `local-tls-renew.yml` renews it every
Sunday when fewer than 30 days remain. It cannot renew earlier.

1. machine: read the expiry. Only the date prints.

   ```
   aws --profile diya-submit-ci secretsmanager get-secret-value --secret-id ci/submit/local-tls/certificate --region eu-west-2 --query SecretString --output text | jq -r .fullchain | openssl x509 -noout -enddate
   ```

2. If 30 days or more remain, record the expiry in the run log and stop this key.
3. machine after go: `gh workflow run local-tls-renew.yml` (a dry run against the staging service).
4. machine after go: `gh workflow run local-tls-renew.yml -f dry-run=false`.
5. machine: proof. Run step 1 again. The date must be about 90 days ahead.

### 3.19 Email hash secret

`<env>/submit/email-hash-secret`, not in the register. Each pass stores its version, and earlier
versions stay, so no stored data changes. For ci, then prod:

1. machine after go: `gh workflow run email-hash-rotate.yml -f environment-name=<env>` and read the
   plan.
2. machine after go: `gh workflow run email-hash-rotate.yml -f environment-name=<env> -f apply=true`.
3. machine after go: proof, ci only. Run `probe-test.yml` as in 3.3 step 5 with
   `-f behaviour-test-suite=passRedemptionBehaviour`.
4. machine: Read back with suffix `email-hash-secret`. Add a line to the run log. There is no
   register entry.

### 3.20 MCP blob key

`<env>/submit/mcp/oauth-blob-key`. `app/lib/mcpBlobKey.js` reads it as a registry, so earlier
versions still open. For ci, then prod:

1. machine after go: `gh workflow run mcp-blob-key-rotate.yml -f environment-name=<env>` and read
   the plan.
2. machine after go: `gh workflow run mcp-blob-key-rotate.yml -f environment-name=<env> -f apply=true`.
3. operator, ci only: proof. Print these one at a time:

   ```
   ! AWS_PROFILE=diya-submit-ci npm run test:enableCognitoNative
   ```

   Then the session runs `npm run test:mcpHostedBehaviour-ci` with the credentials that the script
   prints. Then:

   ```
   ! AWS_PROFILE=diya-submit-ci npm run test:disableCognitoNative
   ```

4. machine: Read back, then Record.

### 3.21 User sub hash salt

`<env>/submit/user-sub-hash-salt` (two register entries, ci and prod). Stop before this key. Ask
the operator whether to rotate the salt. A full rotation is complete without it unless the salt is
exposed. On a yes, follow runbook 4.8:

Warning: do not run `rotate` on prod until a full rotation on ci passed, with the canary green and
a count per table before and after. A missed table loses its link to its users.

1. machine after go: `gh workflow run salt-rotate.yml -f environment-name=ci -f mode=plan`. Keep
   the counts.
2. machine after go: `gh workflow run salt-rotate.yml -f environment-name=ci -f mode=rotate`.
3. machine: proof. `gh workflow run manage-secrets.yml -f action=check-salt -f environment-name=ci`
   is green, and a new plan shows every count under the new version.
4. machine after go, the next day: `gh workflow run salt-rotate.yml -f environment-name=ci -f mode=sweep`.
5. Repeat steps 1 to 4 for prod. On prod, `rotate` and `sweep` fire
   `prod-env-dynamodb-customer-table-scan`. That alarm is expected.
6. operator: back up the salts, store the file in the password manager, then delete it:

   ```
   ! ./scripts/backup-salts.sh
   ```

7. operator: print a new physical card with the new passphrase and put it in the fire safe.
8. machine: Read back, then Record both entries.

## 4. Close

1. machine after go: `gh workflow run rotation-check.yml`. Both legs must be green. Read the run
   with `gh run view <id> --log` for any `FAIL` line.
2. machine: list the deferred steps (a retire that waits for a nightly run, a sweep that waits a
   day). Give each its time and its command. The next session runs them.
3. machine: in the record worktree, commit `secrets-rotation.toml` and open a PR. It merges by
   `/auto-merge`.
4. machine: write `../private.diyaccounting.co.uk/security/ROTATION_<YYYY-MM-DD>.md`. One row per
   key: name, environment, rolled or skipped or failed, proof, old value retired, read-back date.
   Add the deferred steps. Commit that file alone in the private repository.
5. machine: run `/exposure-check`.
6. machine: give the operator the runbook text that needs a change (dates in 2.1, console labels
   that changed). The session that owns the private runbook edits it.

## 5. Coverage

Every `[[secret]]` entry of `secrets-rotation.toml` has a row, plus three keys outside the register.

| Entry | Section | Mechanism |
|---|---|---|
| `google/client_secret` | 3.8 | rotate-secret.yml |
| `hmrc/client_secret` | 3.3 (ci), 3.6 (prod) | rotate-secret.yml |
| `hmrc/sandbox_client_secret` | 3.3 | rotate-secret.yml |
| `companies-house/api_key` | 3.9 | rotate-secret.yml |
| `companies-house/client_secret` | 3.9 | rotate-secret.yml |
| `origin/verify` | 3.17 | deploy-environment.yml, deploy-cdk-stack.yml |
| `stripe/secret_key` | 3.4 (ci), 3.7 (prod) | rotate-secret.yml |
| `stripe/test_secret_key` | 3.4 | rotate-secret.yml |
| `stripe/webhook_secret` | 3.5 | rotate-secret.yml |
| `stripe/test_webhook_secret` | 3.5 | rotate-secret.yml |
| `telegram/bot_token` | 3.2 | rotate-secret.yml |
| `github/ops_app_private_key` | 3.1 | rotate-secret.yml |
| `companies-house/presenter_code` | 3.9 | rotate-secret.yml, on exposure |
| `paypal/client_secret` | 3.10 | rotate-secret.yml |
| `AGENT_APP_PRIVATE_KEY` | 3.1 | gh secret set |
| `HOMEBREW_DISPATCH_TOKEN` | 3.15 | gh secret set |
| `operator-emails` | 2 | not rolled; staff change only |
| `user-sub-hash-salt` (ci) | 3.21 | salt-rotate.yml |
| `user-sub-hash-salt` (prod) | 3.21 | salt-rotate.yml |
| `mcp/oauth-blob-key` | 3.20 | mcp-blob-key-rotate.yml |
| `companies-house/sandbox_api_key` | 3.9 | rotate-secret.yml |
| `youtube/oauth_client` | 3.11 | put-secret-with-rotation-tag.sh, by the operator |
| `youtube/refresh_token` | 3.12 | google-reconsent.js |
| `google/ads/refresh_token` | 3.12 | google-reconsent.js |
| `microsoft-ads/google_refresh_token` | 3.12 | google-reconsent.js |
| `microsoft-ads/developer_token` | 3.14 | put-secret-with-rotation-tag.sh, by the operator |
| `SUPPORT_GMAIL_DRAFT_KEY` | 3.13 | gcloud, gh secret set |
| `TEST_COMPANIES_HOUSE_PASSWORD` | 3.9 | gh secret set |
| `TEST_COMPANIES_HOUSE_TOTP_SECRET` | 3.9 | gh secret set |
| `email-hash-secret` (not in register) | 3.19 | email-hash-rotate.yml |
| `companies-house/presenter_id` (not in register) | 3.9 | rotate-secret.yml, on exposure |
| `local-tls/certificate` (not in register) | 3.18 | local-tls-renew.yml |
