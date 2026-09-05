# Bundle capacity reconciliation without a table scan

`app/functions/account/bundleCapacityReconcile.js` scans `{env}-env-bundles` every hour. The
security detector `{env}-env-dynamodb-customer-table-scan` fires on any Scan of a customer table,
so the job trips its own alarm once an hour. The detector is right. The job needs a different way
to count.

This plan adds a sparse global secondary index on the bundles table and turns the scan into a
query per capped bundle.

## Evidence

CloudTrail for prod on 2026-09-05 shows the reconcile Lambda as one of the Scan principals:

```
2026-09-05T18:28:15Z prod-env-bundles  .../prod-13704ea-app-bundle-capacity-reconcile
2026-09-05T19:28:14Z prod-env-bundles  .../prod-13704ea-app-bundle-capacity-reconcile
2026-09-05T20:35:33Z prod-env-bundles  .../prod-cea27f8-app-bundle-capacity-reconcile
2026-09-05T21:35:33Z prod-env-bundles  .../prod-cea27f8-app-bundle-capacity-reconcile
```

The alarm goes OK to ALARM and back within five minutes each time. Two other principals also scan
customer tables. They are covered under "Other scan sources" below and are out of scope here.

## Table facts

`prod-env-bundles`, eu-west-2, account 972912397388, read 2026-09-05:

| Fact | Value |
|---|---|
| Item count | 676 (approximate, DynamoDB refreshes it every ~6 hours) |
| Size | 228,960 bytes |
| Key schema | `hashedSub` (HASH, S), `bundleId` (RANGE, S) |
| Attribute definitions | `hashedSub` S, `bundleId` S |
| Global secondary indexes | none |
| Billing mode | PAY_PER_REQUEST |
| Stream | enabled, NEW_AND_OLD_IMAGES |
| TTL | enabled on `ttl` |

`ci-env-bundles` holds 525 items and also has no index. `prod-env-bundle-capacity` holds 1 item.

The catalogue has one capped bundle. `day-guest` carries `cap = 100` and `timeout = "P1D"` in
`web/public/submit.catalogue.toml`. The `Submit/BundleCapacity` `BundleActiveAllocations` metric
for `day-guest` sat between 1 and 5 over 4 and 5 September. So the reconcile reads 676 items an
hour to produce a number under 10.

## The decision: a sparse GSI keyed on bundleId and expiry

Add `bundleId-expiry-index` to the bundles table.

| Property | Value |
|---|---|
| Partition key | `bundleId` (S) |
| Sort key | `expiry` (S) |
| Projection | `KEYS_ONLY` |

The reconcile then runs one query per capped bundle:

```
IndexName: "bundleId-expiry-index"
KeyConditionExpression: "bundleId = :bid AND expiry > :now"
Select: "COUNT"
```

`expiry` is written by `putBundle` as `new Date(bundle.expiry).toISOString()`, so every value is a
fixed-width UTC ISO 8601 string. Lexicographic order matches chronological order, and `>` on the
sort key gives the same set the current scan filter gives.

The index is sparse by construction. DynamoDB only indexes an item that carries both key
attributes. A bundle item with no `expiry` never enters the index, which is what we want: the
current scan filter `expiry > :now` already excludes those. The migration bookkeeping items
(`hashedSub = "system#migrations"`) carry no `expiry` either, so they stay out.

### Why this and not a counter maintained by the write paths

A counter already exists. `app/data/dynamoDbCapacityRepository.js` holds `incrementCounter` and
`decrementCounter`, and `bundlePost.js` calls them to reserve and release a cap slot atomically.
That counter is the enforcement fast path and it stays. What it cannot do is notice an expiry.

- **Expiry runs no code.** A `day-guest` allocation expires one day after grant. `ttl` is set to
  one month after `expiry`, so the TTL delete fires about a month late and, when it does, runs no
  application code. Nothing decrements the counter at the moment a bundle stops counting. That gap
  is the whole reason the reconcile exists.
- **A counter-only design still needs a sweep.** To decrement on expiry you need something that
  walks the expired allocations on a timer. That is a query, so you end up building the index
  anyway and keeping a second source of truth as well.
- **The stream does not help.** The table streams NEW_AND_OLD_IMAGES, but a REMOVE event arrives at
  TTL time, a month after the allocation stopped being active.
- **Backfill.** A counter design needs its starting value, and the only way to compute it today is
  a scan. That means a migration script that scans the customer table once, which trips the very
  alarm we are fixing. A GSI needs no backfill script at all. DynamoDB populates a new index
  itself.
- **Correctness under concurrency.** The index is derived state maintained by DynamoDB, so
  concurrent grants cannot skew it. A hand-maintained counter drifts whenever a write path throws
  between the counter update and the item write. `bundlePost.js` already carries a compensating
  decrement for exactly that case, which shows the shape of the problem.

The GSI query is eventually consistent, so a grant from the last second may not appear. That is
fine. The counter, not the reconcile, enforces the cap in real time. The reconcile corrects drift
on an hourly cadence.

### Why not a truly sparse attribute written only for capped bundles

An alternative is to write a `cappedBundleId` attribute only when the catalogue caps the bundle,
and index on that. The index would then hold only `day-guest` items instead of every item with an
expiry.

Rejected. It couples written data to catalogue configuration. The day a bundle gains a `cap`, every
existing allocation of it lacks the attribute and needs a backfill, which means a scan of the
customer table. Indexing `bundleId` costs a little more storage and gets that day for free.

### Cost and blast radius

At 676 items and 224 KB, a KEYS_ONLY index costs a fraction of a cent a month in storage. Each
write to a bundle item that touches `bundleId` or `expiry` writes one extra index entry, billed on
demand. `PLAN_COST_OPTIMISATION.md` prices the hourly reconcile and its reads at $0.10 a month
today, and the query replaces a 224 KB table read with a read of one small partition.

`KEYS_ONLY` rather than `ALL` is deliberate. The index needs no attribute values, only a count.
KEYS_ONLY copies `hashedSub`, `bundleId` and `expiry` and nothing else, so no customer attribute is
duplicated into a second structure. The passes `issuedBy-index` uses ALL because that query returns
whole items. This one does not.

One horizon worth naming. Every live allocation of one capped bundle lands in one index partition.
At today's numbers that is nothing. If a capped bundle ever holds tens of thousands of live
allocations, that single partition becomes the constraint, and a bucketed partition key
(`bundleId#<shard>`) queried in parallel is the next step.

### A Query does not trip the detector

`SecurityDetectionStack.java` builds the metric filter as:

```
{ ($.eventSource = "dynamodb.amazonaws.com") && ($.eventName = "Scan") && (<table name clause>) }
```

It matches `eventName = "Scan"` only. A Query against a GSI logs `eventName = "Query"` with
`requestParameters.tableName` set to the base table and `indexName` set to the index. It matches
neither the Scan filter nor the GetItem volume filter, which matches `eventName = "GetItem"`. No
other detector in that stack matches on a DynamoDB event name. Confirmed by reading
`infra/main/java/co/uk/diyaccounting/submit/stacks/SecurityDetectionStack.java` lines 133, 168 and
219.

## Track 1: the index and the IAM grant

Owns these files. No app code changes.

- `infra/main/java/co/uk/diyaccounting/submit/utils/KindCdk.java`
- `infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java`
- `infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java`
- `infra/test/java/co/uk/diyaccounting/submit/stacks/DataStackTest.java`
- `infra/test/java/co/uk/diyaccounting/submit/SubmitEnvironmentCdkResourceTest.java`

### KindCdk.ensureGlobalSecondaryIndex takes a projection type

The helper hardcodes `Map.of("Projection", Map.of("ProjectionType", "ALL"))`. Add a
`projectionType` parameter as the last argument and use it in that map. Change the one existing
call site, the passes `issuedBy-index` in `DataStack.java`, to pass `"ALL"`.

Do not add an overload. The repo forbids compatibility shims, and passing `"ALL"` at the passes
call site produces a byte-identical `Create` string, so the synthesized template for passes does
not move.

Update the javadoc to document the new parameter.

### DataStack adds the index

Directly after the `ensureTimeToLive` call for the bundles table, and before `ensureTableStream`:

```java
// GSI for counting live allocations of a capped bundle without scanning the table.
// Sparse: an item with no expiry carries no index entry, which matches the count the
// capacity reconciliation needs. KEYS_ONLY because the query only ever asks for a count.
ensureGlobalSecondaryIndex(
        this,
        props.resourceNamePrefix() + "-BundlesBundleIdExpiryGSI",
        props.sharedNames().bundlesTableName,
        "bundleId-expiry-index",
        "bundleId",
        "expiry",
        "KEYS_ONLY");
infof("Ensured bundleId-expiry-index GSI on bundles table %s", props.sharedNames().bundlesTableName);
```

The helper builds `AttributeDefinitions` for both key attributes, so `expiry` (S) is declared for
you. `bundleId` is already a table key attribute, and redeclaring it in an UpdateTable call is
valid.

**Removal policy.** The helper registers `onCreate` and `onUpdate` and no `onDelete`, exactly as it
does for the passes index. Deleting the stack leaves the index alone and the table's own removal
policy governs teardown. The index stores no independent data, so this changes nothing about the
repo's DESTROY-plus-PITR position.

### AccountStack grants Query, keeps Scan for now

At the reconcile Lambda's grants, currently around line 859, add two lines. Leave the Scan grant in
place until track 2:

```java
bundlesTable.grant(this.bundleCapacityReconcileLambda, "dynamodb:Query");
grantTableIndexActions(bundlesTable, this.bundleCapacityReconcileLambda, "bundleId-expiry-index", "dynamodb:Query");
```

An imported table's ARN does not cover its indexes, so the index grant is a separate statement.
`grantTableIndexActions` is already imported in `AccountStack.java` and already used this way for
`passMyPassesGet`.

### Tests track 1 must pass

`./mvnw clean verify`, with these assertions added or changed.

1. **New test in `DataStackTest.java`**: `bundlesTableGetsBundleIdExpiryIndex`. Use the existing
   `createContaining` matcher and assert exactly one `Custom::AWS` resource whose `Create` string
   contains `updateTable`, the bundles table name, `bundleId-expiry-index`,
   `"AttributeName":"expiry"` and `"ProjectionType":"KEYS_ONLY"`.
2. **New test in `DataStackTest.java`**: `passesIssuedByIndexStaysProjectionAll`. Assert exactly one
   `Custom::AWS` whose `Create` contains the passes table name, `issuedBy-index` and
   `"ProjectionType":"ALL"`. This is the guard on the signature change.
3. **`SubmitEnvironmentCdkResourceTest.java`**: raise
   `Template.fromStack(env.dataStack).resourceCountIs("Custom::AWS", 54)` to 55, and change the
   comment line `// GSIs: passes issuedBy-index` to name both indexes.

Run the full Java build before pushing, because the resource count assertion is shared.

### Deploying track 1

`deploy-environment.yml` triggers on pushes touching `DataStack.java` and runs the `deploy-data`
job for `{env}-env-DataStack`. The `AccountStack.java` grant change deploys through `deploy.yml` in
the application pipeline. Both are additive and safe in either order.

After the prod environment deploy, confirm the index before starting track 2:

```bash
aws --profile submit-prod dynamodb describe-table --table-name prod-env-bundles \
  --region eu-west-2 \
  --query 'Table.GlobalSecondaryIndexes[].{name:IndexName,status:IndexStatus,backfilling:Backfilling,items:ItemCount}'
```

Wait for `status: ACTIVE` with `backfilling` absent or false. At 676 items this takes under a
minute. Do the same for `ci-env-bundles` with `--profile submit-ci`.

## Track 2: the reconcile rewrite

Starts after track 1 has merged and the index reads ACTIVE in ci and prod.

Owns these files.

- `app/data/dynamoDbBundleRepository.js`
- `app/functions/account/bundleCapacityReconcile.js`
- `app/bin/dynamodb.js`
- `app/unit-tests/data/dynamoDbBundleRepository.countActiveAllocations.test.js` (new)
- `app/unit-tests/functions/bundleCapacityReconcile.test.js` (new)
- `app/system-tests/bundleCapacityReconcile.system.test.js` (new)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java`
- `infra/test/java/co/uk/diyaccounting/submit/SubmitApplicationCdkResourceTest.java`

### The repository function

The handler currently builds DynamoDB commands itself, which is out of step with the rest of the
codebase. Move the query into the repository that owns the table.

Add to `app/data/dynamoDbBundleRepository.js`:

```js
export async function countActiveAllocations(bundleId, nowIso) {
  logger.info({ message: `countActiveAllocations [table: ${getTableName()}]`, bundleId });

  try {
    const { docClient, module } = await getDynamoDbDocClient();
    const tableName = getTableName();

    let count = 0;
    let lastEvaluatedKey;
    do {
      const response = await docClient.send(
        new module.QueryCommand({
          TableName: tableName,
          IndexName: "bundleId-expiry-index",
          KeyConditionExpression: "bundleId = :bundleId AND expiry > :now",
          ExpressionAttributeValues: { ":bundleId": bundleId, ":now": nowIso },
          Select: "COUNT",
          ExclusiveStartKey: lastEvaluatedKey,
        }),
      );
      count += response.Count || 0;
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    logger.info({ message: "Counted active allocations", bundleId, count });
    return count;
  } catch (error) {
    logger.error({ message: "Error counting active allocations", error: error.message, bundleId });
    throw error;
  }
}
```

Rules for this function:

- No fallback to `ScanCommand`. `getPassesByIssuer` in `app/data/dynamoDbPassRepository.js` has one,
  and it is the pattern this plan exists to remove. If the index is missing, throw.
- `Select: "COUNT"` returns `Count` and `ScannedCount` and no items. It is valid against a KEYS_ONLY
  index.
- The loop is needed. A COUNT query still pages at 1 MB of index data read.
- `nowIso` comes from the caller so every bundle in one run shares one timestamp.

### The handler

Rewrite `app/functions/account/bundleCapacityReconcile.js`:

1. `validateEnv(["BUNDLE_DYNAMODB_TABLE_NAME", "BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME"])`, unchanged.
2. `loadCatalogFromRoot()`. On failure, log and **throw**. It currently logs and returns, which
   hides a broken deployment behind a healthy invocation.
3. `getCappedBundleIds(catalog)`. Empty means nothing to do: log and return normally.
4. `const now = new Date().toISOString()` once, before the loop.
5. For each capped bundle id, call `countActiveAllocations(bundleId, now)`, then `putCounter`, then
   `emitActiveAllocationsMetric`. Catch per bundle, log the error, push it onto a `failures` array,
   and carry on to the next bundle so one bad bundle does not block the others.
6. After the loop, if `failures.length > 0`, throw an Error naming the failed bundle ids and the
   first error message. The invocation must fail so the Lambda error alarm sees it and EventBridge
   records the failure. Logging and returning is what the current code does, and it hides a stuck
   counter.
7. `publishActivityEvent` stays where it is, after the loop, so it only runs on a clean pass.

Delete the DynamoDB client import and the `ScanCommand` use. `getDynamoDbDocClient` is no longer
needed in this file.

Leave `emitActiveAllocationsMetric` as it is. It writes an EMF line to stdout and its empty catch is
honest about being best effort.

### Local DynamoDB gets the index

`app/bin/dynamodb.js`, `ensureBundleTableExists`: add `expiry` to `AttributeDefinitions` and a
`GlobalSecondaryIndexes` entry:

```js
AttributeDefinitions: [
  { AttributeName: "hashedSub", AttributeType: "S" },
  { AttributeName: "bundleId", AttributeType: "S" },
  { AttributeName: "expiry", AttributeType: "S" },
],
GlobalSecondaryIndexes: [
  {
    IndexName: "bundleId-expiry-index",
    KeySchema: [
      { AttributeName: "bundleId", KeyType: "HASH" },
      { AttributeName: "expiry", KeyType: "RANGE" },
    ],
    Projection: { ProjectionType: "KEYS_ONLY" },
  },
],
```

The function returns early when `DescribeTable` succeeds, so a table left over from an earlier local
run has no index. If a proxy session fails on a missing index, drop the local table and let it be
recreated.

### AccountStack loses the Scan grant

Delete this line and its comment:

```java
// Reconciliation counts live bundles, which is the one legitimate Scan in the system.
bundlesTable.grant(this.bundleCapacityReconcileLambda, "dynamodb:Scan");
```

The `dynamodb:Query` grants from track 1 stay. Replace the comment with one sentence saying the
reconcile counts through `bundleId-expiry-index`.

### Tests track 2 must pass

`npm test` and `./mvnw clean verify`.

**`app/unit-tests/data/dynamoDbBundleRepository.countActiveAllocations.test.js`** (new). Mock
`@app/lib/dynamoDbClient.js` so `getDynamoDbDocClient` returns a fake `docClient` and a `module`
whose `QueryCommand` and `ScanCommand` are spies.

1. Queries `bundleId-expiry-index` with `bundleId = :bundleId AND expiry > :now`, `Select: "COUNT"`,
   and the table name from `BUNDLE_DYNAMODB_TABLE_NAME`.
2. Returns the `Count` from a single-page response.
3. Sums `Count` across pages, following `LastEvaluatedKey`, and stops when it is absent.
4. Returns 0 when the response carries no `Count`.
5. Rethrows the underlying error and never constructs a `ScanCommand`. Assert the `ScanCommand` spy
   was not called.

**`app/unit-tests/functions/bundleCapacityReconcile.test.js`** (new). Mock
`@app/data/dynamoDbBundleRepository.js`, `@app/data/dynamoDbCapacityRepository.js`,
`@app/services/productCatalog.js` and `@app/lib/activityAlert.js`. Follow the module-mocking shape
in `app/unit-tests/functions/passMyPassesGet.test.js`.

1. Writes one counter per capped bundle, with the count the repository returned.
2. Two capped bundles produce two `putCounter` calls with the right bundle ids.
3. No capped bundles: no `countActiveAllocations` call, no `putCounter` call, no throw.
4. Catalogue load throws: the handler throws, and `putCounter` is never called.
5. One bundle's count throws: the other bundle's counter is still written, and the handler throws
   after the loop.
6. `putCounter` throws: the handler throws.
7. Every `countActiveAllocations` call in one invocation receives the same ISO timestamp.
8. A missing `BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME` makes the handler throw before any query.
9. `publishActivityEvent` runs on a clean pass and not after a failure.

**`app/system-tests/bundleCapacityReconcile.system.test.js`** (new). Start dynalite the way
`app/system-tests/bundleCapacity.system.test.js` does, create the bundles and capacity tables
through `app/bin/dynamodb.js`, then:

1. Put five `day-guest` bundles with expiries in the future and three with expiries in the past. Run
   the handler. Assert the capacity counter for `day-guest` reads 5.
2. Put a bundle item with no `expiry` attribute. Run the handler. Assert the count does not change,
   proving the index stays sparse.
3. Run the handler against an empty table. Assert the counter reads 0.

Keep this in its own file so it does not collide with the existing capacity system test.

**`infra/test/java/.../SubmitApplicationCdkResourceTest.java`**:

1. Remove `"bundle-capacity-reconcile"` from `rolesThatReadInBulk`, around line 122, and update the
   comment above it. Two functions keep bulk reads: `pass-my-passes-get` and `bundle-get`. After
   this change the test fails if anyone re-grants Scan to the reconcile role.
2. Add an assertion that the reconcile role holds `dynamodb:Query` on a resource whose value ends in
   `/index/bundleId-expiry-index`. Reuse the `policyAttachesToRoleMatching` helper already in that
   file.

## No backfill migration

DynamoDB populates a new global secondary index itself. There is nothing for `scripts/migrations/`
to do, and no run of `run-migrations.yml` is needed for this change.

This matters beyond convenience. Every existing migration that touches the bundles table (`002`,
`004`, `005`, `006`) scans it, and each of those scans trips the same alarm. A design that needed a
backfill would have to trip the detector once to fix the detector's complaint.

## Rollout order

1. Merge track 1. `deploy-environment.yml` creates the index in ci, then prod.
2. Confirm `IndexStatus: ACTIVE` in both accounts with the `describe-table` command above.
3. Merge track 2. `deploy.yml` ships the new reconcile image and drops the Scan grant.
4. Watch the first hourly reconcile run in ci, then in prod.

No wait step is added to `deploy-environment.yml`. The index and the reconcile land through separate
pipelines with an operator check between them, and if the reconcile ever did run against a
backfilling index it would throw, log, and succeed on the next hourly trigger.

## Verification

Run all of these against ci first, then prod, with the profile swapped.

**1. The alarm stays OK for a day.**

```bash
aws --profile submit-prod cloudwatch describe-alarm-history \
  --alarm-name prod-env-dynamodb-customer-table-scan \
  --history-item-type StateUpdate --max-records 20 --region eu-west-2 \
  --query 'AlarmHistoryItems[].{t:Timestamp,s:HistorySummary}'
```

Expect no `OK to ALARM` entry after the track 2 deploy time. Before the fix this shows a pair of
transitions every hour.

**2. The last reconcile scan predates the deploy.**

DynamoDB Scan is a data event, so `cloudtrail lookup-events` does not return it. Query the log group
directly. Convert the window start to epoch milliseconds first:

```bash
python3 -c "import datetime;print(int(datetime.datetime(2026,9,6,0,0,tzinfo=datetime.timezone.utc).timestamp()*1000))"

aws --profile submit-prod logs filter-log-events \
  --log-group-name /aws/cloudtrail/prod-env-cloud-trail --region eu-west-2 \
  --start-time <epoch-ms> \
  --filter-pattern '{ ($.eventSource = "dynamodb.amazonaws.com") && ($.eventName = "Scan") }'
```

Expect no event whose `userIdentity.arn` contains `app-bundle-capacity-reconcile`. Any event from
`submit-prod-deployment-role` is one of the other sources below, not this job.

**3. The count did not move.**

The reconcile logs `Reconciled bundle capacity` with `bundleId` and `activeCount`. Compare the first
few post-deploy values against the `BundleActiveAllocations` metric from before the switch:

```bash
aws --profile submit-prod cloudwatch get-metric-statistics \
  --namespace Submit/BundleCapacity --metric-name BundleActiveAllocations \
  --dimensions Name=bundleId,Value=day-guest \
  --start-time <before> --end-time <after> --period 3600 --statistics Maximum --region eu-west-2
```

A count that drops to 0 or jumps means some items are not in the index, most likely because their
`expiry` is stored as something other than an ISO string. This check is required, not optional. A
count that reads too high makes `BundleCapReachedAlarm` fire and blocks new grants, and a count that
reads too low lets the cap be exceeded.

**4. The query itself works.** Confirm the index is being read:

```bash
aws --profile submit-prod cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB --metric-name ConsumedReadCapacityUnits \
  --dimensions Name=TableName,Value=prod-env-bundles Name=GlobalSecondaryIndexName,Value=bundleId-expiry-index \
  --start-time <before> --end-time <after> --period 3600 --statistics Sum --region eu-west-2
```

## Other scan sources found

The same CloudTrail window shows two more principals scanning customer tables in prod. Neither is in
scope for this plan. They are recorded because the verification above will see them, and because
"the alarm stays OK for a day" only holds if nobody triggers them during that day.

**`submit-prod-deployment-role/GitHubActions`.** On 2026-09-05 this scanned `prod-env-bundles`,
`prod-env-receipts` and `prod-env-hmrc-api-requests`. Two things in the repo do it:

- `.github/workflows/restore-test.yml` scans the live source table with `--select COUNT` to compare
  against the restored copy, lines 166 to 168. It runs monthly on cron and on manual dispatch. A
  `describe-table` `ItemCount` read would answer the same question without a scan, at the cost of
  using an approximate figure that DynamoDB refreshes every six hours.
- `scripts/migrations/002`, `004`, `005` and `006` scan the bundles and receipts tables. These are
  one-off, operator-triggered, and a scan is the right tool for a whole-table rewrite.

**`app/data/dynamoDbPassRepository.js`.** `getPassesByIssuer` catches a failed index query and falls
back to a full scan of the passes table, lines 135 to 152. `prod-env-passes` does have
`issuedBy-index` ACTIVE, so the fallback is not firing today. It stays one config slip away from a
customer-table scan running on a user-facing request path.

## Sequencing summary

| Track | Model | Files | Gate |
|---|---|---|---|
| 1. Index and grant | Sonnet | `KindCdk.java`, `DataStack.java`, `AccountStack.java`, `DataStackTest.java`, `SubmitEnvironmentCdkResourceTest.java` | `./mvnw clean verify` |
| 2. Reconcile rewrite | Sonnet | `dynamoDbBundleRepository.js`, `bundleCapacityReconcile.js`, `app/bin/dynamodb.js`, three new test files, `AccountStack.java`, `SubmitApplicationCdkResourceTest.java` | `npm test` and `./mvnw clean verify` |

Both tracks touch `AccountStack.java`, so run them one after the other rather than at the same time.
Track 2 waits for the index to read ACTIVE in ci and prod.

## Open questions

**1. Do we fix the deployment-role scans as well?**

Three options.

- Leave them. Treat an ALARM whose CloudTrail principal is `submit-prod-deployment-role` as expected
  during a restore test or a migration run, and say so in the runbook.
- Change `restore-test.yml` to read the source table's `ItemCount` from `describe-table` instead of
  scanning it, and keep the scan on the throwaway restored copy. That removes the recurring monthly
  source and leaves migrations as the only deployment-role scan.
- Add the deployment role to an allow-list in the metric filter. This weakens the detector against a
  compromised deployment role, which is the principal with the most reach in the account.

The second option looks best and is small. It is a separate PR from this plan.

**2. Should the reconcile stay on an hourly schedule?**

The scan is why it is hourly. A query against one index partition costs a few read units, so a
15-minute schedule becomes affordable and tightens how fast an expired allocation returns its cap
slot. Against that, the live counter in `bundlePost.js` already handles grants and releases in real
time, so the reconcile only corrects expiry drift, and a `day-guest` allocation lives a full day.
Keeping the hourly `rate(1 hour)` is the no-change answer.
