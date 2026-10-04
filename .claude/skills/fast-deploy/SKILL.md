---
name: fast-deploy
description: Put a candidate fix live on a ci deployment in minutes, from the local tree, before pushing it through the full pipeline. Invoke when a test.yml or deploy.yml run on ci has failed and confidence that the fix will take is anything short of high; prod only on the operator's direct instruction.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# fast-deploy

A full push costs a ci deploy (35 to 45 minutes) and a redeploy for every wrong guess. Fast
deploy puts the local tree onto a ci set directly, proves the fix there, and only then pushes,
so the pipeline runs once on a fix already seen working.

## When it applies

A `test.yml` or `deploy.yml` run on ci has failed, and confidence that the fix will take is
below high. High confidence needs all of these:

1. The root cause is named, with the file and line.
2. The failure is reproduced locally (simulator or proxy variant, or the unit test below).
3. A test covers the failing scenario, and it failed on the code before the fix and passes
   after.
4. The failed run's logs match the root-cause theory and match the local logs before the fix.

Missing any one, fast deploy first. A failure that only shows against HMRC's or Companies
House's sandbox is iterated against the local proxy variant first (`npm run start:proxy`,
`npx dotenv -e .env.proxy -- ...`); fast deploy is for what only a deployed set shows
(CloudFront, API Gateway, Lambda runtime, IAM at run time).

## Authority

- **ci**: the operator authorised these writes when this skill's trigger applies
  (2026-09-27). Target the set the failing branch deployed (its slot in
  `aws --profile diya-submit-ci ssm get-parameters-by-path --path /submit/ci/slots`), never the live
  ci apex another branch is testing on, unless the apex is that set.
- **prod**: only when the operator says so in the current conversation, naming prod. Never
  inferred from a ci success.

## Before the first fast deploy: hold the PR

Mark the PR a draft so `/auto-merge` cannot merge a head whose checks predate the fix:

```bash
gh pr ready <n> --undo
```

## The paths

| Change | Command | Time |
|---|---|---|
| Lambda code and web assets | `AWS_PROFILE=diya-submit-ci npm run deploy:app-ci -- --deployment <ci-setN>` | 3 to 5 min |
| Web assets only | `AWS_PROFILE=diya-submit-ci npm run deploy:app-ci -- --deployment <ci-setN> --skip-docker --skip-lambdas` | 1 to 2 min |
| Lambda code only | `AWS_PROFILE=diya-submit-ci npm run deploy:app-ci -- --deployment <ci-setN> --skip-web` | 3 min |
| One CDK stack (IAM, env vars, routes, a new Lambda, a table) | `gh workflow run deploy-cdk-stack.yml --ref <branch> -f stackName=<ci-setN>-app-<Stack> -f environment-name=ci -f deployment-name=<ci-setN>` | 5 to 15 min |
| prod, on instruction | `AWS_PROFILE=diya-submit-prod npm run deploy:app-prod -- --deployment <prod-set>` | 3 to 5 min |

`scripts/deploy-app.js` builds the ARM64 Lambda image and pushes it to ECR in eu-west-2 and
us-east-1, updates every function and its `pc` alias, syncs `web/public` with the generated
`submit.env`, and invalidates CloudFront. It resolves the ECR account from the active
credentials.

`deploy-app.js` does not change infrastructure: IAM, Lambda environment variables, API Gateway
routes, CloudFront behaviours, tables and anything under `infra/` need the single-stack
dispatch, whose `cdk deploy` runs with the lookups (`.github/actions/lookup-resources`) a local
`cdk deploy` would have to reproduce by hand.

## Prove it

Run the failed suite against that set, not the whole pyramid:

```bash
gh workflow run probe-test.yml -f environment-name=ci -f deployment-name=<ci-setN> -f behaviour-test-suite=<suite>
```

or locally with the set's URL and the lane credentials (`npm run test:enableCognitoNative`,
then `npm run test:<suite>Behaviour-ci`). Read the logs against the root-cause theory. Iterate
fix, fast deploy, prove, until the four high-confidence conditions hold.

## Hand back to the pipeline

1. Commit the fix with the failing-then-passing test, push the branch. The new head needs a
   fresh `test.yml` and `deploy.yml`, green, before any merge.
2. `gh pr ready <n>` once that run starts.
3. The fast deploy left CloudFormation drift on the set; the branch's next full deploy
   reconciles it. A set that will not be redeployed before its self-destruct needs nothing.

## Not for

A failure already at high confidence: push the fix. A change nobody has reproduced: reproduce it
first; a fast deploy of a guess is a slower guess.
