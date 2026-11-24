<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN_AGENT_CREDENTIALS: the session makes its own short-lived credentials; the SSO token is the exception

## Operator assertions (verbatim)

> Also I notice that we often hit a AWS SSO token need for a restart and I am considering adding the same solution we have for the cloud sessions where a ci job gets them their temporary principle of leaste privilage AWS keys to do what is needed, you would have at least the cloud sessions privilage and what ever we stop on. Please create a task to propose a permission set to fit the aws role in the previous sentence ideally you could always get what you need ondemand and you can use github actions workflows for deployment. The new normal would be that you can self-generate temporary credentials to run these workflows, and you would ask for permission to use the AWS SSO token like you would working outside trusted directories. As part of this also change the various guidance to prefer using submit.diy APIs (ideal) or web pages rather than AWS commands and add a directory for operator public keys where the private key holder can generate API tokens and authenticat with the website enough to read the operator dashboard and you can board tasks to improve observability where you need it instead of AWS access which will improve the dashboard with permenant value. - this seems like a whole plan, so make it so and propose options if there are decisions to make.

(operator, 2026-11-24)

## Status

defined 2026-11-24; decisions D1 to D4 open (section 4).

## 1. The goal

A session reads the state of Submit in this order, and reaches for the next only when the one before cannot answer:

1. A Submit API or page (the operator dashboard, `/api/v1/operator/snapshot` and the other operator routes), with an operator API token.
2. A GitHub Actions workflow: deploys, destroys, proofs and reports run as workflows, which assume their own roles through OIDC.
3. Short-lived AWS credentials the session makes for itself: a workflow assumes a least-privilege role and hands back the credentials encrypted to the session's own key, as `cloud-credentials.yml` does for the cloud workers.
4. The operator's AWS SSO token, only after the operator says yes in the chat, as for a command outside the trusted directories.

Each AWS read that a session needs and that step 1 cannot answer becomes a board row that adds it to the dashboard or an operator API. The dashboard gains the value, and the next session needs no AWS access for it.

## 2. What exists

| Part | Where | What it gives |
|---|---|---|
| Cloud worker credentials | `.github/workflows/cloud-credentials.yml`; `createCloudWorkerRole` in `infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java` (line 643) | OIDC on `main` assumes `submit-ci-cloud-worker-role` for one hour (ci only: `polly:SynthesizeSpeech` and `GetSecretValue` on the proxy secrets); the credentials go back as an age file encrypted to the worker's SSH key |
| SSH signature check | `app/lib/sshSignature.js` (`verifySshSignature`), used by the collab relay (`app/functions/collab/collabRelay.js`) | verifies an `ssh-keygen -Y sign` signature in a Lambda |
| Operator gate | `app/lib/operators.js` (the operator email list in Secrets Manager); the operator bundle entitlement in `app/functions/analytics/operatorSnapshotGet.js` | a signed-in Cognito user on the list reads `/api/v1/operator/snapshot` |
| API auth | `app/functions/auth/customAuthorizer.js` (line 183: `X-Authorization: Bearer <token>`) | Cognito tokens only |
| AWS-first guidance | `CLAUDE.md` (7 lines of `aws` commands), 13 skills with `aws --profile`, `scripts/sso-check.sh` in every skill's opening | tells a session to read AWS first |

## 3. Tasks

| # | Task | Follows | Needs | Model | Size |
|---|---|---|---|---|---|
| AC1 | Inventory: every AWS call the sessions make, classed by the step of section 1 that can answer it | nothing | machine-only | Sonnet | ~1 file |
| AC2 | The permission set: the coordinator role(s), as a proposal the operator approves | AC1, D1, D2 | machine-ask | Opus | ~1 file |
| AC3 | `coordinator-credentials.yml` and the ci coordinator role in `IdentityStack.java` | AC2 approved | machine-only | Sonnet | ~6 files |
| AC4 | The prod role and its path (by D2) | AC2 approved | machine-only | Sonnet | ~4 files |
| AC5 | `scripts/aws-session.sh`: dispatch, decrypt, write a named profile that expires with the session | AC3 | machine-only | Sonnet | ~3 files |
| AC6 | Operator public keys: the directory, its deploy, and the token route | D3, D4 | machine-only | Opus then Sonnet | ~10 files |
| AC7 | The operator routes accept the operator token for reads; `scripts/operator-api.mjs` signs and calls them | AC6 | machine-only | Sonnet | ~6 files |
| AC8 | Guidance: `CLAUDE.md`, the skills and memory read in section 1's order; the SSO token asks first | AC5, AC7 | machine-only | Sonnet | ~20 files |
| AC9 | The ask rule for the SSO profiles in `.claude/settings.json` | AC8 | human-driven | operator | 1 file |
| AC10 | Observability rows: one board row per AWS read from AC1 that no API or page answers | AC1, AC7 | machine-only | Sonnet | 0 files (rows) |

### AC1. Inventory

Read the session transcripts under `~/.claude/projects/-Users-antony-projects-diy-accounting-limited-submit-diyaccounting-co-uk/` and the private session reports (`../private.diyaccounting.co.uk/sessions/REPORT_SESSION_SUBMIT_*`) for every `aws` command and every AWS SDK call a script made, and each SSO stop. One table: the call, how often, the account, read or write, and the step of section 1 that can answer it. Known from 2026-11-24 alone: `cloudformation list-stacks` and `describe-stacks` (the board's deployments part), `ssm get-parameter` of `last-known-good-deployment`, `cloudwatch describe-alarms`, Athena on the lake (the TTL and DON1 checks), `dynamodb get-item` on a receipt by its key, `npm run test:enableCognitoNative` and `disableCognitoNative` (writes, ci and prod), the YouTube uploader's read of `prod/submit/youtube/*` in Secrets Manager. The table goes to `../private.diyaccounting.co.uk/engineering/submit/AGENT_AWS_INVENTORY.md`.

### AC2. The permission set

From AC1, one role per account the decisions allow, each written as the CDK policy statements it will become:

- **ci coordinator role** (the floor the operator set: the cloud worker role's two statements), plus the reads the board, `/refine` and the ci proofs take: `cloudformation:ListStacks`, `DescribeStacks` and `DescribeStackEvents` on `ci-*`; `ssm:GetParameter` on `/submit/ci/*`; `cloudwatch:DescribeAlarms`; `logs:FilterLogEvents` and `GetLogEvents` on `/aws/lambda/ci-*`; Athena on workgroup `ci-env-analytics` with its results bucket; the Cognito native toggle the proofs use (`cognito-idp:UpdateUserPoolClient` on the ci pool's client, `AdminSetUserPassword` and `AdminCreateUser` on the `synthetic-*` users only).
- **prod**, by D2.
- Every role: one hour, trust only `repo:diy-accounting-uk/submit.diyaccounting.co.uk:ref:refs/heads/main`, no `environment:` (as `cloud-credentials.yml`), an explicit deny on `dynamodb:Scan`, `Query` and `GetItem` of every customer table (the rule that no session scans a customer table becomes IAM), and no IAM, KMS key policy or CloudTrail writes.

The proposal is a section of this plan; the operator approves it before AC3.

### AC3. The ci path

`coordinator-credentials.yml`: `workflow_dispatch` on `main` with the coordinator's public key as input; assumes the ci coordinator role; encrypts the credentials file to that key with age; uploads it as an artifact that keeps one day. The role in `IdentityStack.java` beside `createCloudWorkerRole`, with its test in `infra/test/java`. The key is the coordinator key the relay uses already (`new-cloud-session.sh relay-key`), so no new key is made.

### AC5. The session's side

`scripts/aws-session.sh ci|prod`: dispatches the workflow, waits, downloads, decrypts in memory, and writes `[diya-submit-ci-session]` to a credentials file under the scratchpad with `expiration`, never into `~/.aws/credentials`. The skills then use `--profile diya-submit-ci-session`. Run again when it expires; a run takes about a minute (the cloud worker runs take 40 to 70 s).

### AC6. Operator public keys and the token

- A directory of operator public keys (D4), one `<handle>.pub` per key holder, read by the deploy into the stack (an SSM parameter or the Lambda's bundle).
- `POST /api/v1/operator/token`: the client sends its handle, a timestamp and an `ssh-keygen -Y sign -n submit-operator` signature of `token|<handle>|<ts>`; the Lambda checks the key is listed, the timestamp is within 5 minutes and the signature verifies (`verifySshSignature`); it answers a token signed by the API (D3) that expires in one hour and carries the scope `operator:read`.
- A key holder can use the token only for reads of operator data that the dashboard shows. It never returns a customer identifier; the snapshot already holds none.

### AC7. The operator routes take the token

`customAuthorizer.js` accepts the operator token for `GET /api/v1/operator/*` only, beside the Cognito token. `scripts/operator-api.mjs <path>` signs with the operator's key (the SSH agent, or a key file the operator names), gets a token, calls the route and prints JSON. Unit tests for the signature, the expiry, a key not listed, a write route refused.

### AC8. Guidance

`CLAUDE.md` ("AWS CLI Access", "Running Behaviour Tests Against Deployed Environments", the shared conventions' "AWS CLI Access"), the 13 skills that run `aws --profile`, `scripts/sso-check.sh`'s opening line in every skill, and the memories that name SSO: each says section 1's order. `sso-check.sh` becomes the check of step 3's profile, and the SSO line says "ask the operator first". The shared conventions change in every estate repository in the same session.

### AC9. The ask rule

An `ask` rule in `.claude/settings.json` for commands that name the SSO profiles (`aws --profile diya-*`, `AWS_PROFILE=diya-*`, `aws sso login`), so their use stops for the operator's yes. The session-made profile (`diya-submit-*-session`) stays outside the rule. A settings file is the operator's to change; the row gives the exact lines.

### AC10. Observability rows

For each AC1 entry that no API or page answers: a board row that adds it to the snapshot (an objective, a panel) or an operator API route. First candidates: the live deployments and last-known-good per environment (the board's Part 4), the alarm states, the receipt TTL check, the donor-pass redemptions.

## 4. Decisions

- **D1. How a laptop session gets AWS access.** (a) Session credentials for ci only; prod through workflows and the operator API. (b) Session credentials for ci and a read-only prod role. (c) No session credentials at all: every AWS read is a workflow that writes its answer to a job summary or artifact.
- **D2. The prod role, if D1 is (b).** (a) Read-only: CloudFormation, CloudWatch alarms and logs, SSM `/submit/prod/*`, Athena on the prod lake, with the customer-table deny. (b) As (a), plus the Cognito native toggle for the prod proofs. (c) No prod role; prod proofs move into workflows.
- **D3. The operator token.** (a) A JWT signed by a key in Secrets Manager, checked by `customAuthorizer.js`. (b) An opaque token stored hashed in DynamoDB with a TTL. (c) A Cognito token for a machine user that the key signature unlocks.
- **D4. Where the public keys live.** (a) `operator-keys/` in this repository (public keys are not secret; a change goes through a PR and the deploy). (b) The private repository, with a sync step that copies them into SSM. (c) Secrets Manager only, set by a workflow input.

## 5. Proof

- A fresh session with no SSO token renders `/board` in full: Part 4 from the operator API (AC10) or the ci session profile.
- A ci proof (`-ci` behaviour suite with the Cognito toggle) runs with the session profile.
- `scripts/operator-api.mjs /api/v1/operator/snapshot` returns the snapshot on prod with a token from a listed key; an unlisted key and an expired token get 401.
- A command that names an SSO profile stops for the operator's yes (AC9).
