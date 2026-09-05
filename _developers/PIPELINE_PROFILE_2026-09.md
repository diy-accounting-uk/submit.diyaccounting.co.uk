# Deploy Pipeline Profile, 2026-09-02

Two runs of `.github/workflows/deploy.yml`, fetched via:

```
gh api repos/diy-accounting-uk/submit.diyaccounting.co.uk/actions/runs/33648185839/jobs --paginate --slurp
gh api repos/diy-accounting-uk/submit.diyaccounting.co.uk/actions/runs/33644482805/jobs --paginate --slurp
gh api repos/diy-accounting-uk/submit.diyaccounting.co.uk/actions/runs/<id>
```

Raw JSON teed to `target/run-33648185839-prod-jobs.json`, `target/run-33644482805-ci-jobs.json`,
and the matching `-meta.json` files. The prod run (push to main) ran 144 jobs across 61m16s; the
ci run (workflow_dispatch) ran 143 jobs across 23m19s. Both counts are inflated by reusable
workflow calls — `test.yml`, `deploy-cdk-stack.yml` (called 5 times), and `synthetic-test.yml`
(called 16 times, once per `web-test-*` job) each expand into 3-6 sub-jobs of their own. Tables
below group those sub-jobs back under the top-level job name that calls them, matching the names
and `needs:` graph in `deploy.yml` — confirmed against the file with `js-yaml` rather than by eye.

## Job DAG (from `deploy.yml`)

push-images/push-images-us-east-1 → deploy-auth/deploy-hmrc/deploy-account/deploy-billing (parallel)
→ deploy-api → deploy-edge → deploy-publish (and deploy-ops, which nothing downstream needs) →
set-origins → enable-native-auth → verify-api → the 16 `web-test-*` jobs (parallel) →
disable-native-auth → set-last-known-good-deployment → destroy-previous.

## Prod run (33648185839, push to main, 61m16s)

| Job | Start (m) | End (m) | Duration (m) |
|---|---|---|---|
| (queue, before `params` starts) | 0.0 | 13.7 | 13.7 |
| params | 13.7 | 13.8 | 0.1 |
| names | 13.9 | 14.1 | 0.2 |
| skip-deploy-check | 13.9 | 13.9 | 0.1 |
| docker-build | 14.0 | 15.3 | 1.4 |
| delegate to test workflow (29 sub-jobs) | 14.1 | 19.4 | 5.3 |
| push-images | 15.4 | 16.6 | 1.2 |
| push-images-us-east-1 | 15.4 | 16.4 | 1.0 |
| deploy-auth | 16.6 | 21.0 | 4.4 |
| deploy-hmrc | 16.6 | 21.9 | 5.3 |
| deploy-account | 16.6 | 21.1 | 4.4 |
| deploy-billing | 16.6 | 19.5 | 2.9 |
| deploy-api | 22.0 | 24.8 | 2.8 |
| deploy-edge | 24.8 | 30.3 | 5.5 |
| deploy-publish | 30.4 | 33.5 | 3.1 |
| deploy-ops (not on critical path) | 30.4 | 34.1 | 3.7 |
| set-origins | 33.5 | 38.2 | 4.7 |
| enable-native-auth | 33.5 | 33.9 | 0.4 |
| verify-api | 38.3 | 38.5 | 0.2 |
| 16 web-test-* jobs (parallel, slowest = submitVatBehaviour) | 38.6 | 44.2 | 5.7 |
| disable-native-auth | 44.3 | 44.7 | 0.4 |
| set-last-known-good-deployment | 44.8 | 45.0 | 0.2 |
| destroy-previous | 45.0 | 61.2 | 16.2 |

## CI run (33644482805, workflow_dispatch, 23m19s)

| Job | Start (m) | End (m) | Duration (m) |
|---|---|---|---|
| (queue, before `params` starts) | 0.0 | 0.1 | 0.1 |
| params | 0.1 | 0.2 | 0.1 |
| names | 0.3 | 0.8 | 0.5 |
| docker-build | 0.4 | 2.0 | 1.6 |
| delegate to test workflow (29 sub-jobs) | 0.8 | 6.2 | 5.4 |
| push-images | 2.0 | 3.4 | 1.4 |
| deploy-hmrc | 3.5 | 8.7 | 5.2 |
| deploy-account | 3.5 | 8.7 | 5.2 |
| deploy-auth | 3.5 | 8.1 | 4.6 |
| deploy-billing | 3.5 | 6.5 | 3.0 |
| deploy-api | 8.8 | 10.8 | 2.0 |
| deploy-edge | 10.8 | 13.4 | 2.6 |
| deploy-publish | 13.5 | 16.0 | 2.5 |
| deploy-ops (not on critical path) | 13.5 | 15.9 | 2.4 |
| set-origins | 16.0 | 16.8 | 0.8 |
| enable-native-auth | 16.0 | 16.4 | 0.4 |
| verify-api | 16.8 | 17.1 | 0.2 |
| 16 web-test-* jobs (parallel, slowest = submitVatBehaviour) | 17.1 | 22.5 | 5.3 |
| disable-native-auth | 22.5 | 23.0 | 0.4 |
| set-last-known-good-deployment | 23.0 | 23.2 | 0.2 |
| destroy-previous | 23.3 | 23.3 | 0.0 |

## Critical path per run

| Hop | Prod (m) | CI (m) |
|---|---|---|
| Queue before first job | 13.7 | 0.1 |
| params → names → docker-build → push-images | 2.9 | 3.3 |
| Longest of deploy-auth/hmrc/account/billing | 5.3 | 5.2 |
| deploy-api | 2.8 | 2.0 |
| deploy-edge | 5.5 | 2.6 |
| deploy-publish | 3.1 | 2.5 |
| set-origins | 4.7 | 0.8 |
| verify-api | 0.2 | 0.2 |
| Slowest web-test-* job | 5.7 | 5.3 |
| disable-native-auth → set-last-known-good-deployment | 0.6 | 0.6 |
| destroy-previous | 16.2 | 0.0 |
| **Total** | **61.2 (actual 61.3)** | **23.3 (actual 23.3)** |

## Idle gaps (queued time before a runner picked the job up)

Every hop past the first shows 0.0-0.1 minutes of queue time in both runs: once a job's `needs`
are satisfied, a runner picks it up within seconds. The one exception is the very start of the
prod run: **13.7 minutes elapse between the workflow triggering and the `params` job actually
starting** (CI shows 0.1 minutes for the same step). In the same window, four other workflows
fired from the identical push at 15:23:01-02 UTC: `deploy environment from main` (run 33648185681,
finished 15:36:41 — within seconds of when `deploy.yml`'s jobs finally started), plus a `CodeQL`
run, `test from main`, and `generate day-guest-test-pass pass for ci`. The timing correlation is
strong evidence the account's concurrent-job budget was saturated by that fan-out, not that
`deploy.yml` itself was slow to start.

## The three largest cuts available

1. **Decouple `destroy-previous` from `set-last-known-good-deployment`.** Prod: 16.2 of the 61.2
   critical-path minutes (26%) are `destroy-previous`, which per `deploy.yml`'s `needs:` only runs
   after the web-tests pass and the SSM parameter is written. Its own work (sweeping old stacks)
   only needs to know the current deployment's name, which `names` already provides — it does not
   need the tests to have passed. The profiled 6.8-minute saving assumes running destroy-previous in
   parallel with web-tests, but this is not safe: the SSM safety check would fail. The safe change
   (dropping `disable-native-auth` from `set-last-known-good-deployment`'s `needs:` list) saves
   only **20–30 seconds**. CI shows near-zero saving, since its `destroy-previous` step already
   completes in under a minute.

2. **Reduce push-triggered workflow fan-out.** The observed 13.7-minute queue gap at the start of
   the prod run coincides with four other workflows firing from the same push. Moving `CodeQL` and
   the day-guest test-pass generation off the `push` trigger (a schedule or a narrower path filter
   would do), or serialising `deploy-environment.yml` ahead of `deploy.yml` explicitly rather than
   letting both compete for runners, would free the deploy job's first runner sooner. **Up to 13.7
   minutes off the prod critical path**, though the actual saving on any given run depends on what
   else happens to fire on that push.

3. **Investigate whether `deploy-publish` needs the full `deploy-edge` completion.** The
   `deploy-edge → deploy-publish → set-origins` chain is 13.4 minutes serial in prod (5.5 + 3.1 +
   4.7) and 6.0 minutes in CI. `deploy-publish`'s own steps (`deploy.yml:1207-1420`) fetch RUM
   config from `ObservabilityStack` (an env-level stack, unrelated to `deploy-edge`) and compare a
   commit-hash file served from `needs.names.outputs.base-url` — the live CloudFront URL — before
   deploying `PublishStack`. Splitting the job to run prep steps in parallel would require an
   artifact hand-off, re-authenticating AWS twice, and keeping two jobs' outputs in sync. The
   profiled 3–5-minute saving assumes the whole chain is soft, but only 56–73 seconds of prep has
   no EdgeStack dependency, and splitting costs outweigh a **~1-minute saving** on the critical
   path. Recommend not doing this one.

## Cuts verified against the workflow source (2026-09-03)

### Cut 1 — destroy-previous

Source: `deploy.yml` and `.github/workflows/destroy-prod.yml` (lines 522–549). The `destroy-prod.yml` workflow independently re-reads the SSM parameter `/submit/prod/last-known-good-deployment` before destroying, and refuses if the target equals that value. Before `set-last-known-good-deployment` writes a new value to SSM, the parameter still holds the *previous* run's value — which is exactly the deployment `destroy-previous` wants to delete. The profiled 6.8-minute saving assumes starting destroy-previous in parallel with web-tests (which run before the SSM write). This is not safe: the job would fail with "Refusing to destroy: it is the last known good deployment."

What is safe: `set-last-known-good-deployment` has `disable-native-auth` in its `needs:` list, but never checks its result — only web-test and set-origins in the `if:` condition. Dropping that entry lets the SSM write start in parallel with the Cognito toggle, not after it. This saves ~20–30 seconds (disable-native-auth ran 23s before set-last-known-good-deployment could start on this run).

**Viable: No. Saving: 20–30 seconds, not 6.8 minutes.** The hardened ordering around set-origins/set-last-known-good-deployment/destroy-previous was stabilized 2026-09-01/02 after three live EdgeStack bugs. Recommend not re-opening this code for a sub-minute win.

### Cut 2 — sibling workflow fan-out

`deploy.yml` and `deploy-environment.yml` shared the identical concurrency group string `deploy-${{ github.ref_name }}`, which only serialized them against each other when triggered from the same branch — different branches deploying to ci at the same time still raced each other's shared ci apex, Cognito pool and ECR repo. Both workflows now key their own group on the target environment instead of the branch (`deploy.yml` uses `deploy-ci`/`deploy-prod`, `deploy-environment.yml` uses `deploy-environment-ci`/`deploy-environment-prod`), so every deploy to a given environment serializes against same-workflow runs from any branch. The two workflows no longer share a group, so this doesn't resolve whether they still need to serialize against each other — that decision is still open.

### Cut 3 — deploy-edge → deploy-publish

Source: `infra/main/java/.../SubmitApplication.java` (lines 409–410, 421–423). `PublishStack` reads CDK construct references directly off `EdgeStack.distribution.getDistributionId()` and `edgeStack.originBucket.getBucketName()` in its constructor. This forces a CloudFormation cross-stack `Fn::ImportValue` dependency: `deploy-publish`'s CDK deploy cannot succeed unless EdgeStack has already deployed with those exports.

The 56-second prep slice (checkout, npm, java, RUM lookup, hash compute) has no EdgeStack dependency and could theoretically run in parallel. But splitting requires an artifact hand-off (uploaded RUM-injected HTML, generated `submit.env`), re-authenticating AWS twice, and keeping two jobs' outputs in sync.

**Viable: No. Saving: ~1 minute at best, not 3–5 minutes.** The profiled 3–5-minute estimate assumed the whole deploy-edge → deploy-publish → set-origins chain was soft; only 56–73 seconds of prep is actually independent. Artifact drift and double-auth surface area outweigh a one-minute win.
