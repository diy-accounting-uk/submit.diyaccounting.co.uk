<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Runbook: DIYA-GL bucket cutover (B71.S3e, PLAN_DIYA_GL_NAMING.md's copy sequence)

Moves the DIYA-GL book storage from `{prefix}-books-{account}` to `{prefix}-diya-gl-{account}`
without data loss, in ci then prod. Both buckets already exist and are both in the AWS Backup
selection (PR #180). The code that points the four DIYA-GL Lambdas at the new bucket is commit
`cd2436cb` on this branch — merge and deploy it before step 2 of either environment below.

Run unattended, no per-step approval: the operator's decision recorded in
`PLAN_DIYA_GL_NAMING.md`. The sequence is the safety mechanism — step 4 must copy nothing before
the cutover is believed correct, and step 6 (the deletion) waits on both step 4 (verified read) and
step 5 (confirmed recovery point), not on either alone. Do not reorder or skip a step.

Every command below takes `--profile submit-ci` or `--profile submit-prod`. If a command fails with
`UnauthorizedSSOTokenError` or similar, run `aws sso login --sso-session diyaccounting` and retry —
do not substitute a different credential path.

## Starting numbers (measured 2026-09-12)

| Environment | Old bucket | Objects | Total size | New bucket | Objects | Total size |
|---|---|---|---|---|---|---|
| ci | `ci-env-books-367191799875` | 6 | 5,256 B | `ci-env-diya-gl-367191799875` | 0 | 0 B |
| prod | `prod-env-books-972912397388` | 16 | 146,299 B | `prod-env-diya-gl-972912397388` | 0 | 0 B |

Both bucket ARNs are already in each environment's backup selection (confirmed by
`get-backup-selection`, step 0 below) — that part of the original sequence's step 1 needs no further
action.

| Environment | Backup vault | Backup role ARN |
|---|---|---|
| ci | `ci-env-primary-vault` | `arn:aws:iam::367191799875:role/ci-env-backup-role` |
| prod | `prod-env-primary-vault` | `arn:aws:iam::972912397388:role/prod-env-backup-role` |

## Step 0 — confirm the backup selection (read-only, either order, either environment first)

```bash
aws --profile submit-ci backup get-backup-selection \
  --backup-plan-id bdb22a07-caac-4685-882a-f4b549b649a5 \
  --selection-id c269e056-ed09-4b2c-9f9d-22f42e184873 \
  --query 'BackupSelection.Resources'
```

```bash
aws --profile submit-prod backup get-backup-selection \
  --backup-plan-id 87482c30-d65a-43b1-bcf8-d3b799a67d2f \
  --selection-id 29ce1212-41ed-4ecc-8925-e6d8a5c66321 \
  --query 'BackupSelection.Resources'
```

Pass: each list contains both `arn:aws:s3:::<prefix>-books-<account>` and
`arn:aws:s3:::<prefix>-diya-gl-<account>` for that environment.

## Environment order

Run the full sequence (steps 1-6) for ci first. Once ci's step 6 gate has passed, repeat the whole
sequence for prod. Do not start prod's step 1 before ci's cutover deploy (step 2) has been proven by
ci's own steps 4-5 — ci is the rehearsal for prod's real customer data.

---

## CI

### Step 1 — sync the old bucket to the new

```bash
aws --profile submit-ci s3 sync s3://ci-env-books-367191799875 s3://ci-env-diya-gl-367191799875
```

Pass: the command lists each object it copies (`copy: s3://ci-env-books-.../<key> to
s3://ci-env-diya-gl-.../<key>`) and exits 0. This is expected to copy all 6 objects on the first
run.

### Step 2 — cut the DIYA-GL Lambdas over and deploy

Merge the PR containing commit `cd2436cb` (or this branch) to trigger `deploy.yml` for ci — the
standard path, `CDK code → git push → GitHub Actions deploy`, no direct AWS write. Watch the run to
completion:

```bash
gh run list --branch main --workflow deploy.yml --limit 5
gh run watch <run-id>
```

Pass: the workflow run for ci completes successfully. This deploy takes tens of minutes; the app
keeps writing to the **old** bucket for the whole window, which is why step 3 exists.

Optional functional smoke test once the deploy is green (uses a synthetic test user, not customer
data):

```bash
export AWS_PROFILE=submit-ci
npm run test:enableCognitoNative
TEST_AUTH_USERNAME='synthetic-local@test.diyaccounting.co.uk' TEST_AUTH_PASSWORD='<printed by enable script>' npm run test:diyaGlBehaviour-ci
npm run test:disableCognitoNative
```

Pass: the behaviour run's save, list, version read and delete all succeed.

### Step 3 — re-sync until it copies nothing

```bash
until aws --profile submit-ci s3 sync s3://ci-env-books-367191799875 s3://ci-env-diya-gl-367191799875 \
  | tee /tmp/ci-diya-gl-resync.log | grep -q .; do :; done
```

This loop re-runs the sync and stops the first time a run produces no output. Do not run it once
and move on — between step 1 and the moment step 2's deploy finished, the app was still writing to
the old bucket, and only a sync that copies nothing proves that window is closed.

Pass: the last line printed is nothing (the loop exits because `grep -q .` found no output to
match) — no `copy:` lines in `/tmp/ci-diya-gl-resync.log` for that final run.

### Step 4 — verify a read

Object counts match:

```bash
aws --profile submit-ci s3api list-objects-v2 --bucket ci-env-books-367191799875 --query 'length(Contents)'
aws --profile submit-ci s3api list-objects-v2 --bucket ci-env-diya-gl-367191799875 --query 'length(Contents)'
```

Pass: both numbers are equal.

A sampled object reads back byte-identical from the new bucket:

```bash
SAMPLE_KEY=$(aws --profile submit-ci s3api list-objects-v2 --bucket ci-env-books-367191799875 --query 'Contents[0].Key' --output text)
aws --profile submit-ci s3api get-object --bucket ci-env-books-367191799875 --key "$SAMPLE_KEY" /tmp/ci-old-sample
aws --profile submit-ci s3api get-object --bucket ci-env-diya-gl-367191799875 --key "$SAMPLE_KEY" /tmp/ci-new-sample
cmp /tmp/ci-old-sample /tmp/ci-new-sample && echo "IDENTICAL"
```

Pass: `cmp` prints nothing and exits 0, so `IDENTICAL` prints. `cmp` reports a byte offset and
exits non-zero on any difference.

### Step 5 — confirm an on-demand backup recovery point

```bash
JOB_ID=$(aws --profile submit-ci backup start-backup-job \
  --backup-vault-name ci-env-primary-vault \
  --resource-arn arn:aws:s3:::ci-env-diya-gl-367191799875 \
  --iam-role-arn arn:aws:iam::367191799875:role/ci-env-backup-role \
  --query 'BackupJobId' --output text)
echo "$JOB_ID"
```

Poll until it finishes:

```bash
until [ "$(aws --profile submit-ci backup describe-backup-job --backup-job-id "$JOB_ID" --query 'State' --output text)" = "COMPLETED" ]; do sleep 30; done
```

Confirm the recovery point:

```bash
RECOVERY_POINT_ARN=$(aws --profile submit-ci backup describe-backup-job --backup-job-id "$JOB_ID" --query 'RecoveryPointArn' --output text)
aws --profile submit-ci backup describe-recovery-point \
  --backup-vault-name ci-env-primary-vault \
  --recovery-point-arn "$RECOVERY_POINT_ARN" \
  --query 'Status'
```

Pass: `"COMPLETED"`.

### Step 6 — remove the old bucket

Both gates must have passed before this step: step 4's verified read, and step 5's confirmed
recovery point. Neither alone is enough.

This repository never deletes an S3 bucket with a raw AWS CLI call — `DataStack.java` manages the
bucket, and `removalPolicy(DESTROY)` with `autoDeleteObjects(true)` is already set on it. The
deletion is a code change and a deploy, not an `aws s3` command:

1. Remove the `booksBucket` construct and its `BooksBucketName` output from `DataStack.java`.
2. Remove `booksBucketArn`/the old ARN from `BackupStack.java`'s critical-resources selection.
3. Remove `booksBucketName` from `SubmitSharedNames.java`.
4. Deploy the ci environment stacks (same path as step 2: CDK code → git push → GitHub Actions
   deploy).

Verify the deletion:

```bash
aws --profile submit-ci s3api head-bucket --bucket ci-env-books-367191799875
```

Pass: the command errors `Not Found` / `404` — the bucket no longer exists. Also drop the
`${DEPLOYMENT}-app-BooksStack` lines from `destroy-ci.yml` and `stack-drift.yml` once no set of that
name remains, per `PLAN_DIYA_GL_NAMING.md`'s original step 6.

---

## Prod

Same six steps, prod resources. Do not start until ci's step 6 has passed.

### Step 1 — sync the old bucket to the new

```bash
aws --profile submit-prod s3 sync s3://prod-env-books-972912397388 s3://prod-env-diya-gl-972912397388
```

Pass: lists each of the (at least) 16 objects it copies and exits 0.

### Step 2 — cut the DIYA-GL Lambdas over and deploy

Deploy to prod through the same pipeline (main branch push triggers `deploy.yml` against prod, or
dispatch it with `environment-name: prod`):

```bash
gh workflow run deploy.yml -f environment-name=prod
gh run list --workflow deploy.yml --limit 5
gh run watch <run-id>
```

Pass: the prod workflow run completes successfully.

Optional functional smoke test once green:

```bash
export AWS_PROFILE=submit-prod
npm run test:enableCognitoNative -- prod
TEST_AUTH_USERNAME='<printed by enable script>' TEST_AUTH_PASSWORD='<printed by enable script>' npm run test:diyaGlBehaviour-prod
npm run test:disableCognitoNative
```

### Step 3 — re-sync until it copies nothing

```bash
until aws --profile submit-prod s3 sync s3://prod-env-books-972912397388 s3://prod-env-diya-gl-972912397388 \
  | tee /tmp/prod-diya-gl-resync.log | grep -q .; do :; done
```

Pass: same as ci's step 3 — the final run's log has no `copy:` lines.

### Step 4 — verify a read

```bash
aws --profile submit-prod s3api list-objects-v2 --bucket prod-env-books-972912397388 --query 'length(Contents)'
aws --profile submit-prod s3api list-objects-v2 --bucket prod-env-diya-gl-972912397388 --query 'length(Contents)'
```

Pass: both numbers are equal.

```bash
SAMPLE_KEY=$(aws --profile submit-prod s3api list-objects-v2 --bucket prod-env-books-972912397388 --query 'Contents[0].Key' --output text)
aws --profile submit-prod s3api get-object --bucket prod-env-books-972912397388 --key "$SAMPLE_KEY" /tmp/prod-old-sample
aws --profile submit-prod s3api get-object --bucket prod-env-diya-gl-972912397388 --key "$SAMPLE_KEY" /tmp/prod-new-sample
cmp /tmp/prod-old-sample /tmp/prod-new-sample && echo "IDENTICAL"
```

Pass: `cmp` prints nothing, `IDENTICAL` prints.

### Step 5 — confirm an on-demand backup recovery point

```bash
JOB_ID=$(aws --profile submit-prod backup start-backup-job \
  --backup-vault-name prod-env-primary-vault \
  --resource-arn arn:aws:s3:::prod-env-diya-gl-972912397388 \
  --iam-role-arn arn:aws:iam::972912397388:role/prod-env-backup-role \
  --query 'BackupJobId' --output text)
echo "$JOB_ID"
```

```bash
until [ "$(aws --profile submit-prod backup describe-backup-job --backup-job-id "$JOB_ID" --query 'State' --output text)" = "COMPLETED" ]; do sleep 30; done
```

```bash
RECOVERY_POINT_ARN=$(aws --profile submit-prod backup describe-backup-job --backup-job-id "$JOB_ID" --query 'RecoveryPointArn' --output text)
aws --profile submit-prod backup describe-recovery-point \
  --backup-vault-name prod-env-primary-vault \
  --recovery-point-arn "$RECOVERY_POINT_ARN" \
  --query 'Status'
```

Pass: `"COMPLETED"`.

### Step 6 — remove the old bucket

Both gates required: step 4's verified read and step 5's confirmed recovery point, for prod.

The same code change from ci's step 6 (removing `booksBucket` from `DataStack.java`, its ARN from
`BackupStack.java`, and `booksBucketName` from `SubmitSharedNames.java`) applies to both
environments at once — one deploy to prod after the ci deploy, not a second code change.

```bash
aws --profile submit-prod s3api head-bucket --bucket prod-env-books-972912397388
```

Pass: `Not Found` / `404`. Then drop the remaining `${DEPLOYMENT}-app-BooksStack` line from
`destroy-prod.yml`.
