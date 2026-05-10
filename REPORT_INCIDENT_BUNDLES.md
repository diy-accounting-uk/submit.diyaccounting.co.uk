# REPORT_INCIDENT_BUNDLES

Production `bundleGet` Lambda was denied `dynamodb:UpdateItem` on `prod-env-bundles`, breaking lazy token refresh and kicking authenticated users back to the Bundles page when they tried to start an activity.

- Reported: 2026-04-21 21:36:35 UTC
- Environment: submit-prod (972912397388) eu-west-2
- Fix branch: `permissions`
- Incident root cause: CDK IAM grant mismatch introduced 2026-02-01 and not caught by unit, system, or synthetic tests.

## 1. What is causing these errors

`app/functions/account/bundleGet.js` performs a lazy token refresh when an allocated bundle's `tokenResetAt` has elapsed. Lines 164–178:

```js
for (const bundle of userBundles) {
  if (bundle.tokenResetAt && bundle.tokenResetAt <= now && bundle.tokensGranted !== undefined) {
    const catBundle = (catalog.bundles || []).find((b) => b.id === bundle.bundleId);
    if (catBundle?.tokenRefreshInterval) {
      const { resetTokens } = await import("../../data/dynamoDbBundleRepository.js");
      const nextReset = addDurationSimple(new Date(), catBundle.tokenRefreshInterval);
      const tokensGranted = catBundle.tokensGranted ?? bundle.tokensGranted;
      await resetTokens(userId, bundle.bundleId, tokensGranted, nextReset.toISOString());
      ...
    }
  }
}
```

`resetTokens` in `app/data/dynamoDbBundleRepository.js:205-232` issues a DynamoDB `UpdateCommand` (`dynamodb:UpdateItem`) against the bundles table.

The CDK grant on `infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java:250` was `grantReadData`, which does not include `UpdateItem`:

```java
bundlesTable.grantReadData(this.bundleGetLambda);      // ← pre-fix, read-only
```

So the call site needs write access that the IAM role never had. The AWS SDK raised `AccessDeniedException`, which bundleGet re-threw and the handler turned into HTTP 500.

## 2. What is broken

- `GET /api/v1/bundle` returns HTTP 500 for any authenticated user whose allocated bundle has at least one `tokenRefreshInterval`-enabled catalogue entry and whose `tokenResetAt` has elapsed.
- Lazy token refresh never lands, so `tokensConsumed` is not zeroed — the user stays at the last balance (typically 0 once they've spent through the period) even after the refresh window passes.
- Client-side cascade:
  - `web/public/widgets/entitlement-status.js` falls back to empty `bundlesCache` (`entitlement-status.js:95-99`), so the page reports `Activity: requires <bundle>` even for holders.
  - `web/public/hmrc/vat/submitVat.html:991` renders `No tokens remaining. View Bundles` and links to `/bundles.html`.
  - Any widget calling `/api/v1/bundle` (auth-status, prefetch-bundle-head) degrades similarly.
- New bundle allocations (`POST /api/v1/bundle`) and deletions (`DELETE /api/v1/bundle`) keep working — their Lambdas have `grantReadWriteData`. Only the read path is broken.

## 3. Does this cause "add a bundle → kicked back to bundles when I try to use an activity"?

**Yes, with high confidence.** The observed trace is:

1. User POSTs to `/api/v1/bundle` — succeeds (bundlePost has the right grant).
2. Bundle lands with a future `tokenResetAt`. First activity attempt works.
3. Time passes; `tokenResetAt` elapses.
4. Next page load of the activity fetches `/api/v1/bundle` → Lambda tries lazy refresh → UpdateItem denied → HTTP 500.
5. Front-end sees empty/failed response → entitlement check fails → activity page shows "No tokens remaining" and links back to /bundles.html → user perceives a redirect.

CloudWatch correlation for the reported session (traceparent `b61b6821628c3be4d123768331afec2d`): first GET /api/v1/bundle at 21:32:54 UTC, IAM denial at 21:32:56, 74 denials across 21:00–22:59.

## 4. How long has this been going on

Code was deployed by commit `a2478c1f` (`feat: implement pass validation API, token tracking, and bundle capacity enforcement`) on 2026-02-01 02:19:38 +0100 — **~80 days** before the reported incident on 2026-04-21.

The grant itself (`grantReadData`) dates from commit `748b6222` on 2025-11-08, when `bundleGet.js` only performed a Query. The grant was correct at that time; it became wrong when commit `a2478c1f` added the `resetTokens` UpdateItem path without updating `AccountStack.java`.

**CloudWatch can confirm only the last 3 days** because the Lambda log group (`/aws/lambda/prod-800652d-app-bundle-get`) has a 3-day retention. In that window we see 74 denials concentrated in two hours:

| Hour (UTC) | Denials |
|---|---|
| 2026-04-21 21:00–21:59 | 52 |
| 2026-04-21 22:00–22:59 | 22 |

We cannot prove from logs how many occurrences happened between 2026-02-01 and 2026-04-19. The commit date is the strongest bound.

## 5. Real users impacted

Within the retained CloudWatch window (3 days): **one user**.

- `b662…` (full `b662b284-7011-70a8-5113-c1626038c6d6`) — 74 denials. This matches the userId in the originally reported log line. Client details from the request headers: Chrome 147 on macOS, CloudFront viewer `178.231.181.188`.

Outside the 3-day window: unknown. Possible that other users were affected silently during Feb/Mar/early April 2026 — their log entries are gone. `POST`/`DELETE` on the bundles API kept working for those users, so nothing would have surfaced in error rates from those Lambdas; only the lazy-refresh GET path was broken and it degrades to a spurious "redirect to bundles" experience rather than a loud error.

UserId is obfuscated to `b662…` above per instruction. No email, name, or IP is reproduced in this report.

## 6. Why the synthetic tests did not fail (https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/actions/runs/24794955567)

`.github/workflows/synthetic-test.yml` schedules a single hard-coded test suite per hour:

- Cron: `57 * * * *`
- Default suite (`params.normalise`, workflow.yml:151, pre-fix): `submitVatBehaviour`
- Environment resolved to `prod` on main branch

The `submitVatBehaviour` test calls `ensureBundlePresent(page, "Day Guest", ..., { testPass: true })` in `behaviour-tests/submitVat.behaviour.test.js:330-332`. That path allocates a **fresh** `Day Guest` bundle every run. Fresh bundles have `tokenResetAt` in the future, so the `tokenResetAt <= now` branch in `bundleGet.js:167` never fires, the `resetTokens` UpdateItem is never called, and the IAM mismatch stays invisible to the scheduled test.

`bundleBehaviour` existed as a manual test-suite input (still does) but the cron could not be parameterised to run it.

Verified: the referenced run (24794955567) shows all jobs green — `behaviour test submitVatBehaviour-prod` passed in 6m10s.

## 7. When the bug was introduced

Commit `a2478c1f`, author Antony at Polycode, 2026-02-01 02:19:38 +0100 — `feat: implement pass validation API, token tracking, and bundle capacity enforcement`.

That commit added:
- The lazy-refresh `for (const bundle of userBundles) { ... resetTokens(...) }` block in `bundleGet.js`.
- The `resetTokens` and `resetTokensByHashedSub` UpdateItem exporters in `dynamoDbBundleRepository.js`.
- Nothing in `AccountStack.java` to bump the grant.

`git blame` output for the resetTokens call site and the grant confirms this split:

```
a2478c1fe  bundleGet.js:167-178   Antony at Polycode 2026-02-01
748b6222a  AccountStack.java:250  Copilot            2025-11-08
```

## 8. How to detect this in tests in the future

Three layers of regression guard were added in this PR:

- **CDK synth-time assertion** — `infra/test/java/co/uk/diyaccounting/submit/SubmitApplicationCdkResourceTest.java` iterates the AccountStack's synthesized IAM policies and requires at least one policy attached to the `bundleGet` role to grant `dynamodb:UpdateItem` on the bundles table. Reverting `AccountStack.java:250` back to `grantReadData` now fails `./mvnw clean verify`.
- **Unit test covering the `tokenResetAt <= now` branch** — `app/unit-tests/functions/bundleGet.handler.test.js` now has a case `issues UpdateItem on bundles table when tokenResetAt has elapsed` that seeds the Query mock with an expired `invited-guest` bundle and asserts a `MockUpdateCommand` was dispatched to the bundles table. Removing the `resetTokens` call without removing the downstream dependency surfaces here.
- **Behaviour test against real AWS IAM** — new `behaviour-tests/tokenRefresh.behaviour.test.js` (and `tokenRefreshBehaviour` Playwright project + npm scripts for proxy/simulator/ci/prod) allocates `invited-guest`, directly expires `tokenResetAt` via `UpdateCommand`, then calls `GET /api/v1/bundle`. Asserts 200 and tokens reset. This would have 500'd pre-fix on ci/prod.
- **Scheduled workflow matrix** — `.github/workflows/synthetic-test.yml` now runs a matrix of suites on `schedule` events. `params.normalise` emits `behaviour-test-suites-json=["submitVatBehaviour","tokenRefreshBehaviour"]` for scheduled runs; `workflow_dispatch`/`workflow_call` keeps the single-suite behaviour. Adding more suites is a one-line edit.

Recommended follow-ups outside this PR:

- Increase retention on production Lambda log groups from 3 days to at least 30. The current retention prevents any credible historical analysis of incidents like this.
- Extend the CDK assertion to other Lambdas with known write requirements (pass management, subscription lifecycle) once a cleanup backlog is scheduled.

## 9. The fix applied now

One-line CDK change on `permissions` branch:

```diff
- bundlesTable.grantReadData(this.bundleGetLambda);
+ bundlesTable.grantReadWriteData(this.bundleGetLambda);
```

`bundleCapacityTable.grantReadData(this.bundleGetLambda)` is unchanged (bundleGet only reads capacity).

This matches the pattern already used for `bundlePost` (AccountStack.java:332-334) and `bundleDelete` (AccountStack.java:439-440). Deployment happens via the standard `deploy.yml` pipeline when the PR merges — CloudFormation amends the inline policy on the bundleGet role; no schema or code-path change.

Verification after deploy:

- CloudWatch Insights on `/aws/lambda/prod-800652d-app-bundle-get`, last 15 minutes:
  ```
  fields @timestamp, userId
  | filter message = "Error retrieving user bundles"
  | stats count() as n
  ```
  Expect 0.
- Manual reproduction with the reporting user: log in, visit an activity on a refreshed bundle — expect tokens shown and no redirect to /bundles.html.
- Run `synthetic-test.yml` manually with `tokenRefreshBehaviour` against `ci` to confirm the new guard passes. Next scheduled cron fires both suites automatically.

## Appendix A — CloudWatch Insights queries used

Log group: `/aws/lambda/prod-800652d-app-bundle-get` in `submit-prod` eu-west-2.

```
# Error occurrences (3-day window)
fields @timestamp, userId, error
| filter message = "Error retrieving user bundles"
| sort @timestamp asc

# Distinct impacted users
fields userId
| filter message = "Error retrieving user bundles"
| stats count() as n by userId
| sort n desc

# Hourly histogram
fields @timestamp
| filter message = "Error retrieving user bundles"
| stats count() as n by bin(1h)

# Traceparent correlation
fields @timestamp, level, source, message, error, userId, requestId
| filter traceparent = "00-b61b6821628c3be4d123768331afec2d-c2b90ac1ca1239e1-01"
| sort @timestamp asc
```
