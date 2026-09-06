# CDK TypeScript spike (backlog 33a)

One leaf stack, rewritten in TypeScript and diffed against the Java synth, to price backlog row
33 (a full Java-to-TypeScript CDK rewrite, nineteen stack classes) before committing to it.

## Stack chosen: CrossAccountBackupVaultStack

`infra/main/java/co/uk/diyaccounting/submit/stacks/CrossAccountBackupVaultStack.java` (149
lines), deployed by the `cdk-backup` app (`SubmitBackupAccount.java`).

Why this one over `SelfDestructStack` (the other candidate named in the task): it is the
smallest stack in the codebase that uses nothing but plain `aws-cdk-lib` L1/L2 constructs (a KMS
`Key` and a `BackupVault`, plus IAM policy statements). It has no inbound cross-stack reference —
nothing imports into it — and exactly one outbound one: its sibling `BackupAccountAccessStack`
takes the KMS key's ARN by value, which turns into a single `Fn::Export` in the template.
`SelfDestructStack` is similar in size but pulls in the app's custom `Lambda`/`LambdaProps`
construct (ECR image lookup, provisioned-concurrency alias, log group, X-Ray, alarms) and the
`SubmitSharedNames`/`SubmitStackProps` shared-props object every deployment stack carries.
Picking it would have made the spike answer two questions at once — CDK-language fidelity, and
whether the shared construct library ports cleanly — and blurred which one any difference came
from. `CrossAccountBackupVaultStack` isolates the first question.

## Reproducing the synth and diff

Java side (matches `setup-backup-account.yml`'s own invocation — going through the CDK CLI
matters, see "What the CLI adds" below):

```bash
./mvnw --errors clean verify -DskipTests -P cdk-backup
cd cdk-backup
CDK_DEFAULT_ACCOUNT=<backup-account-id> CDK_DEFAULT_REGION=eu-west-2 \
  npx cdk synth backup-CrossAccountBackupVaultStack
```

This writes `cdk-submit-backup.out/backup-CrossAccountBackupVaultStack.template.json` at the
repo root (per `cdk-backup/cdk.json`'s own `output` setting), which is where the diff script
looks by default.

TypeScript side:

```bash
cd cdk-typescript
npm install
CDK_DEFAULT_ACCOUNT=<backup-account-id> CDK_DEFAULT_REGION=eu-west-2 npm run synth
```

Diff:

```bash
cd cdk-typescript
npm run diff
```

`scripts/diff-templates.js` strips the two things that differ between synths for reasons that
have nothing to do with the stack's own design — the CDK bootstrap-version `Parameter`/`Rule`
boilerplate, and the `AWS::CDK::Metadata` analytics resource plus inline `aws:cdk:path` metadata
— replaces any 64-character asset hash with a placeholder (this stack has no assets, but the
next stack in a row-33 rewrite might), sorts object keys, and unified-diffs what's left.

### What the CLI adds (a methodology trap)

Running the Java jar directly (`java -jar target/submit-backup.jar` with `CDK_OUTDIR`/
`CDK_CONTEXT_JSON` set by hand) produces a template with no `aws:cdk:path` metadata and no
`AWS::CDK::Metadata` resource at all. Running the same jar through `npx cdk synth` produces both.
The CDK CLI injects its own default context (path metadata, version-reporting) before invoking
the app; a direct jar invocation skips it. The deploy and setup workflows always go through the
CLI, so the CLI-driven synth is the one that matters for this comparison — a raw `java -jar` synth
would have understated how close the two really are, since the diff script normalises away this
category regardless of which route produced it. Anyone repeating this for another stack should
synth both sides through `cdk synth`, not by shelling out to the jar.

## The diff

One real difference remains after normalisation:

| Category | What | Explanation |
|---|---|---|
| Identical | Both `Resources` blocks (KMS `Key`, KMS `Alias`, `BackupVault`), all three logical IDs, both IAM policy documents, the KMS key policy's auto-added root-account statement, both resource tag sets, both `Outputs` (`CrossAccountVaultArn`, `CrossAccountVaultName`, `CrossAccountBackupKeyArn`) | — |
| Real, but explained by scope, not language | One `Outputs` entry — `ExportsOutputFnGetAttCrossAccountBackupKey5968652BArn7BA8327A`, an `Fn::Export` of the KMS key ARN — exists only in the Java synth | The Java app synthesises `CrossAccountBackupVaultStack` alongside its sibling `BackupAccountAccessStack`, which takes the key ARN as a cross-stack reference; CDK renders that as an export on the producing stack. This spike deliberately ports only the one leaf stack, so the export has nothing to be exported for. A full port that includes both stacks would reproduce this line exactly — nothing about it depends on which language wrote either stack. |

No cosmetic differences (whitespace, key ordering, JSON formatting) survive the normalisation
step by construction, since the script sorts keys and pretty-prints both sides identically before
comparing.

### What matched without extra effort, worth flagging for row 33

- **Logical IDs are language-independent.** `CrossAccountBackupKey5968652B`,
  `CrossAccountBackupKeyAliasE8EC8FEC`, `CrossAccountVault3448C6B8` are byte-identical between the
  two synths, with no manual override. CDK derives a resource's logical ID purely by hashing its
  construct-tree path string, so a TypeScript stack that uses the exact same stack id and
  construct ids as the Java one reproduces the same CloudFormation logical IDs automatically.
- **Tag propagation has a sharp edge.** The Java app applies cost-allocation tags with
  `Tags.of(app).add(...)`, an Aspect that CDK resolves at synth time into literal `Tags` /
  `BackupVaultTags` properties on every taggable resource. The natural-looking TypeScript
  equivalent, `stack.tags.setTag(...)`, does something different: it sets CloudFormation
  stack-level tags, which propagate to resources only at deploy time and never appear in the
  template at all. The first draft of the TypeScript stack used `stack.tags.setTag` and every
  resource's tags diffed away; the fix was `Tags.of(app).add(...)`, matching the Java call site
  exactly. Anyone porting the other eighteen stacks will hit this the same way if they don't know
  to look for it.

## Effort estimate for the remaining eighteen stacks

This stack (149 lines, plain L1/L2 constructs, no shared-construct dependency) took about half a
day once the `cdk-typescript` scaffold and diff tooling existed — most of that was building the
tooling, not writing the stack. That tooling now exists and is reusable.

The other eighteen stacks split into two very different bands:

- **A handful are similar in shape** — `EcrStack` (174 lines), `SimulatorStack` (259),
  `SecurityDetectionStack` (266), `SelfDestructStack` (266), `ScanDetectionStack` (293),
  `ObservabilityUE1Stack` (302), `BillingWebhookStack` (307) — plain-enough AWS service surface,
  maybe a day each once the shared-construct question below is settled.
- **Most of the fleet is large and coupled**: `ApiStack` (478), `CompaniesHouseStack` (706),
  `IdentityStack`/`HoldingStack`/`AuthStack` (mid-size but CloudFront- and Cognito-heavy),
  `AnalyticsStack` (901), `AccountStack` (939), `HmrcStack` (924), `ObservabilityStack` (1019),
  `EdgeStack` (1004). Each carries deep, easy-to-miss AWS service surface (CloudFront functions
  and behaviours, WAF rules, Cognito triggers, DynamoDB streams, Kinesis Firehose, Budgets) that
  needs the same line-by-line diff discipline this spike used, at several times the size.

The real bottleneck is not CDK-language fidelity — this spike shows a straight port reproduces
the template exactly, modulo the scope difference above. It is porting what nearly every one of
the nineteen stacks depends on and this spike deliberately avoided:

- The custom `Lambda`/`LambdaProps` construct (ECR image lookup, function creation, versioning,
  provisioned-concurrency alias, log group wiring, X-Ray, health alarms) that most application
  stacks build their Lambdas through. It needs one faithful TypeScript port, used everywhere,
  not eighteen separate reinventions.
- `SubmitSharedNames` and `SubmitStackProps` — the shared naming/props objects nearly every
  stack constructor takes. In Java these are `org.immutables`-generated builders; TypeScript has
  no direct analogue (plain interfaces and object literals cover the shape), but every one of the
  eighteen remaining `XxxStackProps.builder()...build()` call sites needs converting, and that
  mechanical bulk — not new CDK semantics — is where most of the time goes.

Order of magnitude: several weeks of focused work for all eighteen, dominated by that shared
construct/props port and the four or five largest stacks, not by translating CDK calls one at a
time.

## What a full migration needs

**A single source of truth for names shared with app code.** `SubmitSharedNames`/`LambdaNames`
compute the Lambda function names, table names, and environment variable names that
`app/functions/*.js` also expects by convention. A TypeScript rewrite that reimplements this
naming logic from scratch, rather than porting it once and using it everywhere the Java version
is used today, risks the two diverging — a resource CDK provisions under one name and a Lambda
that reads a different one from its environment is a runtime failure, not a synth-time one.

**Logical-ID stability is not this migration's path — row 33 already chose otherwise.** This
spike shows logical IDs match automatically when a TypeScript stack reuses the same stack id and
construct ids. That means an id-preserving, in-place language swap is possible in principle. But
row 33's decision (`BACKLOG.md`, cross-tier chain #2 -> #25 -> #33) is teardown-and-restore: tear
down ci and prod, redeploy on the TypeScript CDK, restore data from the cross-account vault. That
path does not need logical-ID stability at all — every resource is recreated regardless — so it
sidesteps a constraint (every construct id character-for-character identical, across nineteen
stacks and every resource in them) that would otherwise have to hold for the entire migration
rather than being a nice-to-have this one small stack happened to get for free.

## Files

- `cdk-typescript/` — the spike: `package.json` (`aws-cdk-lib` 2.266.0, `constructs` 10.8.1,
  pinned to the versions `pom.xml`'s `cdk.version` and the Java build's resolved `constructs` jar
  use), `lib/cross-account-backup-vault-stack.ts` (the ported stack), `bin/cross-account-backup-vault.ts`
  (the app entry), `scripts/diff-templates.js` (the normalising diff). Not wired into the root
  `package.json` or any workflow.
