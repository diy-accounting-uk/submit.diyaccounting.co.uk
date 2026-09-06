# Cost instrumentation across the six AWS accounts

## Requirement (verbatim, backlog B43a)

> org-wide cost allocation tags activated and a standard tag set applied by CDK (the per-stack tags
> exist; make them allocation-active), CUR 2.0 / Data Exports to S3 with Athena over it, AWS Budgets
> with alerts and Cost Anomaly Detection per account, Cost Explorer granularity settings. The
> instrumentation half of #43 — do first so the review reads real data.

Every mutating AWS call in this plan needs the operator's approval before it runs.

## Current state

Read on 2026-08-31 with live SSO across all six profiles.

**Cost allocation tags: 59 keys known to billing, none active.** Cost Explorer cannot split spend by
any tag today. The 59 include the ones the CDK emits (`Application`, `Environment`, `Stack`, …), four
AWS-generated keys, and 30 `aws-cdk:cr-owned:*` keys that carry no meaning.

**Budgets: none, in any of the six accounts.** No spend alert exists anywhere.

**Cost anomaly detection: no monitors, no subscriptions.** Checked in the management account, which
is where an org-wide monitor would live.

**Data exports: none.** A legacy CUR named `diy-aws-resource-usage` exists in the management account,
writing daily to `s3://diyaccounting-archive/aws-usage` in eu-west-1. That bucket no longer exists.
Its last delivery status is `ERROR_NO_BUCKET`, timestamped 2026-08-30. It has been producing nothing
for some time.

**Cost categories: none.**

**Cost Explorer:** hourly and resource-level granularity are console settings with no API. Their state
is unread. Cost Explorer itself is being charged ($0.07 in August), so the API is in use.

### The bill it has to measure

Unblended USD by account, including tax:

| month | management | gateway | spreadsheets | submit-ci | submit-prod | submit-backup | total |
|---|---|---|---|---|---|---|---|
| 2026-03 | 15.79 | 0.39 | 2.12 | 23.79 | 105.91 | 0.00 | 148.01 |
| 2026-04 | 13.30 | 0.41 | 2.91 | 13.20 | 101.04 | 0.00 | 130.87 |
| 2026-05 | 13.30 | 0.41 | 1.69 | 14.67 | 86.88 | 0.00 | 116.94 |
| 2026-06 | 13.30 | 0.39 | 0.05 | 12.29 | 78.47 | 0.00 | 104.49 |
| 2026-07 | 24.14 | 0.42 | 1.16 | 12.23 | 63.32 | 0.00 | 101.27 |
| 2026-08 | 11.45 | 0.69 | 55.26 | 52.22 | 111.15 | 0.15 | 230.92 |

August more than doubled. Three things moved at once:

- Bedrock (Claude Opus 5) in the spreadsheets account, $41.50, of which $45.89 landed on a single
  day, 2026-08-28. Nothing before 2026-08-24.
- CloudWatch in submit-prod, $14.84 to $28.87.
- CloudFront and Cognito appeared in submit-ci at $9.91 and $8.40, from near zero.

The management account's largest line is a CDK bootstrap ECR repository in us-east-1
(`cdk-hnb659fds-container-assets-887764105431-us-east-1`), at $7 to $8.60 a month. It is the only ECR
repository that account holds. That belongs to #43, not here, but it shows why `ManagedBy` needs to be
one of the active tag keys: bootstrap resources carry no application tags, so they only show up as
untagged spend.

### What the CDK emits

Sibling repos tag every stack they own. `root.diyaccounting.co.uk` has ApexStack and RootDnsStack,
`www.diyaccounting.co.uk` has GatewayStack, `spreadsheets.diyaccounting.co.uk` has SpreadsheetsStack
and HoldingStack. All five carry `Application`, `CostCenter`, `Owner`, `Stack`, `ManagedBy` and
`BillingPurpose`; only ApexStack and the spreadsheets pair carry `Environment`.

This repo tagged 14 of its 23 stacks. The nine that carried no tags at all were AccountStack,
AuthStack, BillingStack, DataStack, EcrStack, HmrcStack, IdentityStack, ObservabilityStack and
ObservabilityUE1Stack. Those nine hold Cognito, CloudWatch, CloudTrail, DynamoDB and ECR, which is
most of the bill. Commit `012b6291` in this branch moves the seven uniform tags to the CDK app and
derives `Stack` from each stack's class name, so all 23 now carry the set.

## Design

### CUR 2.0 in the management account, one export for the whole org

The management account is the payer, so its export already covers all six accounts in one table. A
per-account export would give six tables to join and would still miss consolidated discounts and tax.

The bucket goes in the management account, in eu-west-2, alongside the rest of the estate. Athena
reads it from the same region.

The stack that owns it is new: `CostReportingStack` in `root.diyaccounting.co.uk`, which is the repo
that already deploys to 887764105431. It creates the bucket, its policy, the
`AWS::BCMDataExports::Export`, a Glue database and an Athena workgroup. CDK 2.266.0 has L1 constructs
for all of these, so nothing here needs a console step.

**Alternative worth weighing.** Data Exports has no backfill. It starts collecting the day it is
created, so every day the root-repo change waits is a day the #43 review will not have. If the CDK
change will take more than a few days, create the export by CLI first and import it into the stack
later. The command is in step 4b.

### Standard tag set: activate five keys

| key | answers |
|---|---|
| `Application` | which site the spend belongs to |
| `Environment` | ci or prod |
| `DeploymentName` | which deployment, including the ephemeral `ci-*` ones |
| `Stack` | which stack |
| `ManagedBy` | whether CDK deployed it at all |

`ManagedBy` earns its place by exclusion. Spend with no `ManagedBy` tag is bootstrap, Route 53,
Amazon Registrar, tax, Bedrock and anything created by hand. That is the residue the review needs
named, and it is about 10% of the bill.

`CostCenter`, `Owner` and `Project` carry the same repo string as `Application` on every resource.
Activating them adds three identical columns.

**Alternative:** activate `CostCenter` as well if the review wants a column named the way the accounts
ledger names it. It costs nothing beyond a wider CUR.

Activation is not retroactive. Tags appear in Cost Explorer and the CUR from the activation date
onward, which is why step 1 comes before everything else.

### Budgets: one place, seven budgets, filtered by account

All seven live in the management account. Six filter to one linked account each; the seventh covers
the org. Budgets in the payer account see consolidated data, and one stack means one deploy and one
email confirmation.

**Alternative:** a budget per account, deployed by each account's own repo. That isolates blast radius
and matches the account-separation model, at the cost of touching four repos and confirming six
subscriptions. The submit-backup account has no repo of its own, so its budget would have to come from
`SubmitBackupAccount` in this repo.

Amounts are set above the Mar–Jul run rate and below an August-shaped month:

| budget | monthly USD | Mar–Jul average | August |
|---|---|---|---|
| management | 25 | 15.97 | 11.45 |
| gateway | 5 | 0.40 | 0.69 |
| spreadsheets | 15 | 1.59 | 55.26 |
| submit-ci | 30 | 15.24 | 52.22 |
| submit-prod | 120 | 87.12 | 111.15 |
| submit-backup | 5 | 0.00 | 0.15 |
| organisation total | 200 | 120.32 | 230.92 |

Each budget alerts twice: at 85% of actual spend, and when the forecast reaches 100%. Against these
numbers August fires four alerts and no month from March to July fires any.

Alerts go to `admin@diyaccounting.co.uk`, the org master email, as a direct Budgets email subscriber.
No SNS topic is needed. **Alternative:** `antony@polycode.co.uk`, if the admin mailbox is not read
daily.

### Anomaly detection: one org-level monitor

A single `DIMENSIONAL` monitor on `SERVICE` in the management account covers all six linked accounts.
Six per-account monitors would report the same anomalies six times and cannot see consolidated spend.

The subscription is daily, on absolute impact of $15 or more. The bill runs about $4 a day, so $15 is
a clear signal. The 2026-08-28 Bedrock day at $45.89 would have fired.

**Alternative:** a percentage threshold. On a bill this small a percentage fires on ordinary noise, so
absolute is the safer default.

### Cost categories: group the untagged residue

One cost category, `Workload`, in the management account, mapping each linked account to a name and
sweeping everything else into `Shared`. It gives Cost Explorer a grouping that works today, before
tagged data has accumulated, and it keeps working for the spend no tag will ever reach. It is a
`CfnCostCategory` in the same `CostReportingStack`.

### Cost Explorer granularity

Hourly granularity and resource-level data are both console settings in the management account's
Billing and Cost Management preferences. There is no API and no CloudFormation resource. Resource-level
data is charged at $0.01 per 1,000 usage records, which on this bill is cents. Both should be on, so
the review can see which Lambda and which log group, not just which service.

## Execution order

Steps 1 and 2 come first because tag activation is not retroactive and the broken CUR is writing
errors daily.

### 1. Activate the five cost allocation tag keys — NEEDS-APPROVAL

Account 887764105431, profile `management`.

```bash
aws --profile management ce update-cost-allocation-tags-status \
  --cost-allocation-tags-status \
    TagKey=Application,Status=Active \
    TagKey=Environment,Status=Active \
    TagKey=DeploymentName,Status=Active \
    TagKey=Stack,Status=Active \
    TagKey=ManagedBy,Status=Active
```

Verify with `aws --profile management ce list-cost-allocation-tags --status Active`.

### 2. Delete the broken legacy CUR — NEEDS-APPROVAL

Account 887764105431, profile `management`. It has written nothing since its bucket was removed.

```bash
aws --profile management cur delete-report-definition \
  --region us-east-1 \
  --report-name diy-aws-resource-usage
```

### 3. Turn on hourly and resource-level Cost Explorer data — operator console step

Account 887764105431, Billing and Cost Management, Cost Management Preferences. Tick "Hourly
granularity" and "Resource-level data". No CLI or CloudFormation exists for either.

### 4a. CDK: `CostReportingStack` in `root.diyaccounting.co.uk`

Deploys to 887764105431, eu-west-2. Contains:

- S3 bucket `diy-accounting-cost-reports-887764105431`, SSE-S3, public access blocked, lifecycle
  transition to Glacier Instant Retrieval at 180 days, `RemovalPolicy.DESTROY` with
  `autoDeleteObjects`.
- Bucket policy granting `billingreports.amazonaws.com` and `bcm-data-exports.amazonaws.com`
  `s3:PutObject` and `s3:GetBucketPolicy`, conditioned on `aws:SourceAccount` 887764105431.
- `CfnExport` (`AWS::BCMDataExports::Export`), CUR 2.0, table `COST_AND_USAGE_REPORT`, daily
  granularity, `INCLUDE_RESOURCES=TRUE`, Parquet format, overwrite refresh.
- Glue database `cost_and_usage` and an Athena workgroup writing results to a `athena-results/`
  prefix in the same bucket.
- `CfnCostCategory` named `Workload`, one rule per linked account, default value `Shared`.

Ships through the root repo's GitHub Actions deploy.

### 4b. Alternative to 4a's export only, if the CDK change will wait — NEEDS-APPROVAL

Account 887764105431, profile `management`. Creates the export against a bucket that must already
exist with the policy from 4a. Use this only to stop losing days; the stack still has to adopt it.

```bash
aws --profile management bcm-data-exports create-export \
  --region us-east-1 \
  --export '{
    "Name": "diy-accounting-cur2",
    "Description": "Org-wide CUR 2.0 for all six accounts",
    "DataQuery": {
      "QueryStatement": "SELECT * FROM COST_AND_USAGE_REPORT",
      "TableConfigurations": {
        "COST_AND_USAGE_REPORT": {
          "TIME_GRANULARITY": "DAILY",
          "INCLUDE_RESOURCES": "TRUE",
          "INCLUDE_MANUAL_DISCOUNT_COMPATIBILITY": "FALSE",
          "INCLUDE_SPLIT_COST_ALLOCATION_DATA": "FALSE"
        }
      }
    },
    "DestinationConfigurations": {
      "S3Destination": {
        "S3Bucket": "diy-accounting-cost-reports-887764105431",
        "S3Prefix": "cur2",
        "S3Region": "eu-west-2",
        "S3OutputConfigurations": {
          "OutputType": "CUSTOM",
          "Format": "PARQUET",
          "Compression": "PARQUET",
          "Overwrite": "OVERWRITE_REPORT"
        }
      }
    },
    "RefreshCadence": { "Frequency": "SYNCHRONOUS" }
  }'
```

### 5. CDK: budgets and anomaly detection in `root.diyaccounting.co.uk`

Same `CostReportingStack`, or a sibling `CostAlertingStack` if the operator wants the export and the
alerts to tear down separately. Contains:

- Seven `CfnBudget` resources, `COST` type, `MONTHLY`, amounts from the table above. Six carry a
  `LinkedAccount` cost filter; the seventh has none. Each has two notifications: `ACTUAL` at 85% and
  `FORECASTED` at 100%, both with an `EMAIL` subscriber of `admin@diyaccounting.co.uk`.
- One `CfnAnomalyMonitor`, `MonitorType: DIMENSIONAL`, `MonitorDimension: SERVICE`.
- One `CfnAnomalySubscription`, `Frequency: DAILY`, subscriber type `EMAIL`, with a threshold
  expression on `ANOMALY_TOTAL_IMPACT_ABSOLUTE` greater than or equal to 15.

The email subscriber sends a confirmation to `admin@diyaccounting.co.uk` on first deploy. It has to be
accepted before any alert arrives.

### 6. Deploy this repo's tagging change

Commit `012b6291` on this branch. It needs a `deploy-environment.yml` and a `deploy.yml` run against
ci and prod before tagged data starts accumulating for the submit accounts.

### 7. Confirm the instrumentation reads

About 24 hours after step 1, and again after the first CUR delivery:

```bash
aws --profile management ce get-cost-and-usage \
  --time-period Start=2026-09-01,End=2026-09-30 \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=TAG,Key=Stack
```

A non-empty grouping means the review in #43 can read real attribution. Until then it reads accounts
and services only.
