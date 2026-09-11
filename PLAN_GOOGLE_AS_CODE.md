<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: Google Cloud and GA4 as code

Status: open, design only. No code written.

Everything the operator does by hand in the Google consoles moves into files in this repo, applied
by one workflow. The target is no console visit for a routine change, and no generated id copied
between browser tabs.

## User assertions (verbatim)

> Infrastructure as code for Google Cloud and GA4, the way CDK covers AWS: pick the tool
> (Terraform's `google` provider with the GA4 Admin API through a provider or a thin script layer,
> Pulumi's Google Cloud SDK, or Google's Config Connector), then move everything the operator now
> does by hand in the Google consoles into it: the `diyaccounting-ga4` project's APIs, IAM and
> billing budget, the service account and its key rotation into Secrets Manager, OAuth consent
> screen and clients (YouTube upload, any sign-in), the GA4 properties, streams and BigQuery links
> (`scripts/ga4-property-sync.js` and `analytics/google-roles.toml` become inputs or go away), and
> the YouTube channel's upload credentials. Applied from a workflow like `google-roles.yml`.

> Autonomy. Every Google change today is the operator copying generated ids between console tabs;
> that is error-prone and the operator does not want to do any of it.

## The recommendation

Extend the declarative layer this repo already has. TOML files describe the wanted state, Node
scripts read live Google state through the REST APIs, diff, and apply the difference. One workflow
runs them all, plan on a pull request, apply on a push to main.

Do not adopt Terraform, Pulumi or Config Connector.

The deciding fact is coverage. GA4 and the OAuth clients are the two areas the operator touches
most, and no general-purpose tool can express either one today. Terraform has no Google Analytics
resource ([hashicorp/terraform-provider-google issue 16898](https://github.com/hashicorp/terraform-provider-google/issues/16898)
is still the open request). Its only OAuth client resources are `google_iap_brand` and
`google_iap_client`, and clients made that way are
[locked to IAP](https://cloud.google.com/iap/docs/programmatic-oauth-clients), cannot have their
redirect URIs changed, and cannot be edited in the console. This repo already hit that wall when it
made the YouTube upload client, and the finding is written into `scripts/youtube-upload.js`.

So any tool choice leaves a Node script layer against the Admin APIs for GA4 and OAuth. The
question is whether to run a second system alongside it for the other three areas. The answer is
no: it doubles the tooling, adds a state file, and buys nothing that is missing.

### What already runs as code

Five of the moving parts are done. This plan finishes the set and puts one door on it.

| Live today | Declared in | Applied by |
| --- | --- | --- |
| Enabled APIs on `diyaccounting-ga4` | a constant in the script | `scripts/gcp-enable-apis.js` |
| GA4 account bindings and GCP project IAM | `analytics/google-roles.toml` | `scripts/google-roles-apply.js` |
| Billing budget with 50/90/100 alerts | script defaults and flags | `scripts/gcp-billing-assert.js` |
| `ga4_daily` dataset and four scheduled queries | `analytics/ga4-bigquery.toml` | `scripts/ga4-bigquery-sync.js` |
| Per-environment GA4 property, stream, BigQuery link | two CLI flags | `scripts/ga4-property-sync.js` |
| Key events on the shared property | `google-analytics.toml` | `scripts/ga4-key-events-sync.js` |
| BigQuery link export settings | CLI flags | `scripts/ga4-bigquery-link-export.js` |

Each one plans first and applies second, and each one has unit tests over its pure planning
function. `.github/workflows/google-roles.yml` and `.github/workflows/ga4-bigquery-sync.yml`
already run three of them with the GitHub OIDC to AWS role chain.

### What `ga4-property-sync.js` becomes

An input. Its `buildPlan` function is good and stays. Its CLI goes: an environment and a hostname
passed as flags means a person decides when to run it and what to type, which is the habit this
plan removes. The property set moves into a file, and the script becomes one step in the workflow.
It merges with `ga4-key-events-sync.js` and `ga4-bigquery-link-export.js` into a single
`scripts/ga4-sync.js` over a single file, because all three walk the same account and the same
properties.

The `.claude/skills/ga4-property-sync/SKILL.md` procedure goes with it. A skill that tells a person
to fetch a secret, dry run, show the operator, and then run for real is the manual process wearing
a costume.

### The rejected options

**Terraform with the `google` provider.** No GA4 resources at all, so properties, data streams, key
events and BigQuery links stay in Node either way. OAuth clients only through the IAP resources,
which produce clients this repo cannot use. It covers the API enablement, project IAM, billing
budget, BigQuery dataset and scheduled queries, all of which already work. It needs a state backend
this repo does not have, and `google_service_account_key` writes private key material into that
state. Net effect: a rewrite of working code, a new state file to protect, two systems to keep
alive, and the two hardest areas still uncovered.

**Pulumi with the Google Cloud SDK.** Its Google resources are generated from the same upstream API
surface as Terraform's, so the coverage gaps are identical. It adds a state backend and an SDK to
learn. Nothing in the scope gets easier, so there is nothing to pay for the cost with.

**Config Connector.** The reconciler runs as a controller in a GKE cluster or a Config Controller
instance. That is a standing bill and a Kubernetes surface for a business that runs no Kubernetes.
Its CRDs track Google Cloud resources only, so GA4 and the OAuth clients are outside it. It loses
on every axis here.

### Judged against what matters

| | Our layer | Terraform | Pulumi | Config Connector |
| --- | --- | --- | --- | --- |
| Project APIs, IAM, budget | works today | yes | yes | yes |
| Service account and credentials | yes | key material lands in state | same | yes |
| OAuth consent screen and clients | assert only | IAP-locked only | IAP-locked only | no |
| GA4 properties, streams, links | works today | no | no | no |
| YouTube upload credentials | assert only | no | no | no |
| State lives | in Google; read every run | a backend to create and guard | a backend or Pulumi's service | cluster etcd |
| Auth from Actions without a long-lived key | workload identity federation | same | same | same |
| New tooling to learn and keep alive | none | HCL, provider, backend | SDK, backend | Kubernetes, CRDs |

## Where each area lands

One directory holds the wanted state. `analytics/bigquery/*.sql` stays where it is; the query text
is long enough to want its own files.

```
google/
  project.toml     APIs to enable, project IAM, the billing budget
  identity.toml    service accounts, workload identity pools and providers, key rotation
  analytics.toml   the GA4 account, its properties, streams, key events, links, export settings
  bigquery.toml    the ga4_daily dataset and its scheduled queries
  oauth.toml       the consent screen fields and the OAuth clients we own
  youtube.toml     the channel, its quota project and its credential secrets
```

One workflow, `.github/workflows/google-apply.yml`, replaces `google-roles.yml` and
`ga4-bigquery-sync.yml`. It keeps their shape: `environment: prod`, GitHub OIDC into the AWS
actions role, chained into the deployment role, then one step per script. A pull request that
touches `google/**`, `analytics/bigquery/**` or any of the scripts runs every step in plan mode and
writes the plans into the step summary. A push to main applies. Steps run in dependency order: APIs,
then identity, then IAM, then analytics, then BigQuery, then the OAuth and YouTube assertions.

| Scope area | Declared in | Applied by |
| --- | --- | --- |
| Project APIs, IAM, billing budget | `google/project.toml` | `gcp-enable-apis.js`, `google-roles-apply.js`, `gcp-billing-assert.js` |
| Service account and its credentials | `google/identity.toml` | `gcp-identity-sync.js`, `gcp-key-rotate.js` |
| OAuth consent screen and clients | `google/oauth.toml` | `google-oauth-assert.js` |
| GA4 properties, streams, links | `google/analytics.toml` | `ga4-sync.js` |
| YouTube upload credentials | `google/youtube.toml` | `youtube-upload.js --check` |

### GA4, concretely

`google/analytics.toml` merges what `google-analytics.toml` records with what
`ga4-property-sync.js` takes as flags:

```toml
[account]
id = "1035014"
display_name = "DIY Accounting"

[[property]]
id = "523400333"
display_name = "DIY Accounting"
time_zone = "Europe/London"
currency = "GBP"
key_events = { subscribe = "purchase", submit = "submit_vat_return", donate = "purchase", download = "runner_download" }

  [[property.stream]]
  name = "Submit"
  uri = "https://submit.diyaccounting.co.uk"
  measurement_id = "G-T81V5NL5MB"
  enhanced_measurement = true

  [property.bigquery_link]
  project = "diyaccounting-ga4"
  location = "europe-west2"
  daily_export = true
  streaming_export = false

[[property]]
display_name = "DIY Accounting Submit (ci)"
github_environment = "ci"
  [[property.stream]]
  name = "ci"
  uri = "https://ci-submit.diyaccounting.co.uk"
  measurement_id = "G-DV0SDVEZWC"
```

`ga4-sync.js` finds each property by display name, creates what is missing, sets the key events,
sets enhanced measurement settings, creates or updates the BigQuery link, and writes
`SUBMIT_GA4_MEASUREMENT_ID` onto the named GitHub Environment. Where the file records a
`measurement_id` or `id` that differs from live, it fails rather than guessing. It never writes back
into the file, so the workflow never commits.

The Analytics Admin API covers accounts, properties, data streams, key events, BigQuery links,
access bindings, custom dimensions, and enhanced measurement settings, which is everything above.

### Credentials, concretely

Today a long-lived service account key sits in AWS Secrets Manager as
`ci/submit/ga4/service_account` and `prod/submit/ga4/service_account`. GitHub holds no long-lived
secret already: the workflow authenticates to AWS with OIDC and reads the key from there. Google
holds a key that nobody can date, which is why `secrets-rotation.toml` carries a `ga4/service_account`
row with an empty `last_rotated`.

Workload identity federation removes the key in both directions.

**From GitHub Actions.** A workload identity pool with a provider for
`token.actions.githubusercontent.com`, an attribute condition pinning
`assertion.repository == "diy-accounting-uk/submit.diyaccounting.co.uk"`, and
`roles/iam.workloadIdentityUser` on the service account for that principal set. The workflow then
uses `google-github-actions/auth@v2` and keeps the AWS chain only for the steps that read or write
Secrets Manager and GitHub variables.

**From the Lambdas.** Google's workload identity federation accepts AWS as an external identity
provider, so `ga4ReportPull.js` and `ga4EventExportPull.js` can present their Lambda execution role
instead of a key. The provider is type `aws` with account `972912397388`, and an attribute condition
on the assumed-role ARN. The Lambda then loads a credential configuration file that holds no secret,
generated by `gcloud iam workload-identity-pools create-cred-config` and committed. One thing to
prove with a spike before committing to it: `google-auth-library`'s AWS external-account client
looks for credentials the way an EC2 instance offers them, and Lambda offers them as environment
variables. If the default retrieval does not work there, the library takes a custom
`AwsSecurityCredentialsSupplier`, which reads those variables in a few lines.

When both sides are federated, the key is deleted, both secrets are deleted, and the
`ga4/service_account` row leaves `secrets-rotation.toml`. Until then, rotation itself becomes code:
`scripts/gcp-key-rotate.js` reads a `max_age_days` from `google/identity.toml`, creates a new key,
writes it to both secrets through `scripts/put-secret-with-rotation-tag.sh`, and deletes keys older
than the limit on the next run. That closes the operator's rotation task even if the federation work
never lands.

### OAuth, concretely

Two clients exist: the sign-in client behind the Cognito Google identity provider, and the Desktop
app client that uploads to YouTube. Creating a client and reading its secret is the residue, and
section "What stays manual" covers it. What the file and the script do is stop drift.

`google/oauth.toml` records, for each client, its id, purpose, application type, authorised redirect
URIs, the scopes it needs, and which AWS secret holds its secret. `scripts/google-oauth-assert.js`
then checks:

- the project's brand through `iap.googleapis.com/v1/projects/{number}/brands`: application title,
  support email, and whether it is internal or public
- that the client id recorded for sign-in matches the one configured on the Cognito identity
  provider in each environment
- that the client id recorded for YouTube matches the one in `prod/submit/youtube/oauth_client`
- that the token minted from the stored refresh token carries the scopes the file declares

It fails the workflow on a mismatch. That turns a silent console edit into a red build.

## Migrating from what is live

There is no import step and no state to seed. Every script here lists live Google state and diffs
against the file, so a resource that already exists is found and left alone. That property is the
main practical reason to keep this shape, and it is what makes the migration a read before it is a
write.

The one real hazard is a name mismatch producing a duplicate. `ga4-property-sync.js` already warns
about this: it matches a property by exact display name, so a property renamed in the GA4 UI is not
found and a second one gets proposed. Guard it by running the inventory first and reading the plan.

These are live and must survive untouched:

- GA4 property `523400333` and its three streams: gateway `G-C76HK806F1`, spreadsheets
  `G-X4ZPD99X2K`, submit `G-T81V5NL5MB`
- the per-environment ci property behind `SUBMIT_GA4_MEASUREMENT_ID=G-DV0SDVEZWC`
- the shared property's BigQuery link and its `analytics_523400333` export dataset
- the `ga4_daily` dataset and its four scheduled queries
- the billing budget the operator made by hand, which `gcp-billing-assert.js` already reuses rather
  than duplicating
- the service account `ga4-report-pull@diyaccounting-ga4.iam.gserviceaccount.com` and its live key,
  until the federation work replaces it

The trashed property `395628828` stays out of `google/analytics.toml`, and the property matcher
keeps skipping entries that carry a `deleteTime`.

The first apply of each area is gated: run the workflow in plan mode, read the step summary, and
only then push. Every existing resource should read as "already exists" before an apply runs.

## Work items

Each item is small enough to land on its own. Items 1 and 2 are prerequisites for the rest; after
those, 3 to 6 and 12 to 14 can go in parallel.

**1. Read-only inventory of everything Google — done.** `scripts/google-inventory.js` reads enabled
services on `diyaccounting-ga4`, the project IAM policy, the billing account's budgets, the GA4
accounts, properties (including trashed), data streams, key events and BigQuery links, the service
account's keys with their creation dates, the IAP brand, and the BigQuery datasets and data transfer
configs, through `scripts/lib/googleAuth.js`. Run with `npm run google:inventory`. Unrun so far: no
Google credentials were available in the session that wrote it. First real run should name property
`523400333`, the ci property, `ga4_daily` and four transfer configs.

**2. One flag convention across the Google scripts — done.** All five scripts plan by default and
only write with `--apply`.

**3. Create `google/` and move the three existing files — done for the files this repo's Google
agent owns.** `google/project.toml`, `google/bigquery.toml` and `google/analytics.toml` exist and
every reader this agent owns points at them. Five readers outside that ownership still name the old
paths: `web/public/lib/analytics.js`, `app/functions/analytics/ga4DailyPull.js`,
`infra/main/java/co/uk/diyaccounting/submit/stacks/IngestionStack.java`,
`.../stacks/analytics/Ga4DailyTables.java`, and the row in `REPORT_REPOSITORY_CONTENTS.md`.

**4. Fold the API list and the budget into `google/project.toml` — done.** Add an `[apis] services = [...]`
array carrying the eight services now hardcoded in `gcp-enable-apis.js`, and a `[budget]` table with
`display_name`, `amount`, `currency` and `thresholds = [0.5, 0.9, 1.0]` carrying the defaults now in
`gcp-billing-assert.js`. Both scripts read the file; the CLI flags for these values go. Keep the
`--project`, `--stray-project` flags. Extend the two test files with a parse case.

**5. One workflow — done for the five scripts that exist.** `.github/workflows/google-apply.yml`
runs inventory, enable-apis, roles-apply, billing-assert and bigquery-sync, plan on pull request and
apply on push to main, replacing `google-roles.yml` and `ga4-bigquery-sync.yml`. The ga4-sync,
oauth-assert and youtube-check steps join it as items 7, 12 and 13 land.

**6. `google/analytics.toml` in the shape above.** Carry across account `1035014`, property
`523400333` with its three streams and its `[key_events]`, and the ci property with
`github_environment = "ci"` and `G-DV0SDVEZWC`. Leave `[old_property]` and `[legacy]` where they are
as a record; they are not applied. Add prod's property entry only once item 7 can create it.

**7. `scripts/ga4-sync.js`.** Fold `ga4-property-sync.js`, `ga4-key-events-sync.js` and
`ga4-bigquery-link-export.js` into one script over `google/analytics.toml`. Keep
`ga4-property-sync.js`'s `buildPlan`, `extractBigQueryLinks` and the `deleteTime` skip. Keep
`ga4-key-events-sync.js`'s shared-event handling, which marks one GA4 event once when two labels map
to it. Add enhanced measurement settings through
`v1alpha properties.dataStreams.updateEnhancedMeasurementSettings`. Fail on a recorded id that does
not match live. Delete the three old scripts, their four test files, the two `ga4:` npm scripts, and
`.claude/skills/ga4-property-sync/SKILL.md` with its root symlink. Port the tests to
`app/unit-tests/scripts/ga4Sync.test.js`.

**8. Workload identity pool and GitHub provider.** Add `google/identity.toml` declaring the service
account, the pool, and one provider per external issuer. Add `scripts/gcp-identity-sync.js` against
`iam.googleapis.com/v1 projects/{p}/locations/global/workloadIdentityPools` and its `providers`
subresource, plus the `iam.workloadIdentityUser` binding on the service account. Plan and apply like
the others, with a unit-tested pure planner. Add the step to `google-apply.yml`.

**9. Actions authenticate with federation.** Add `google-github-actions/auth@v2` to
`google-apply.yml` using the pool from item 8, and drop the "Resolve GA4 service account key" step
from the steps that only talk to Google. Keep the AWS chain for `ga4-sync.js` (it writes GitHub
variables) and any step reading Secrets Manager. Verify by running the workflow in plan mode and
confirming every step still reads live state.

**10. Key rotation as code.** Add `scripts/gcp-key-rotate.js` reading
`[service_account.key_rotation] max_age_days` from `google/identity.toml`. It creates a key, writes
it to `ci/submit/ga4/service_account` and `prod/submit/ga4/service_account` through
`scripts/put-secret-with-rotation-tag.sh`, and on the following run deletes keys past the age limit.
Run it from a scheduled workflow, monthly. Fill the `ga4/service_account` row's `last_rotated` in
`secrets-rotation.toml` from the first run.

**11. Lambdas authenticate with federation.** Add an `aws` provider to the pool for account
`972912397388`, conditioned on the Lambda execution role. Generate the credential configuration with
`gcloud iam workload-identity-pools create-cred-config` and commit it. Change
`app/functions/analytics/ga4EventExportPull.js` and `ga4ReportPull.js` to build their clients from
external account credentials. Spike the Node client in a real Lambda first; if its default AWS
credential retrieval misses Lambda's environment variables, pass an `AwsSecurityCredentialsSupplier`
that reads them. When the Lambdas work, delete the service account key, delete both secrets, remove
the `ga4/service_account` row from `secrets-rotation.toml`, and delete `scripts/gcp-key-rotate.js`
and its scheduled workflow.

**12. `google/oauth.toml` and `scripts/google-oauth-assert.js`.** Record both clients as described
above. Assert the brand through the IAP brands endpoint, the sign-in client id against each
environment's Cognito identity provider, the YouTube client id against
`prod/submit/youtube/oauth_client`, and the granted scopes against the file. Fail on any mismatch.
Add the step to `google-apply.yml`.

**13. `google/youtube.toml` and a credential check on a schedule.** Record the channel handle, the
channel id, the quota project (`diyaccounting-ga4`), and the two secret names. Point
`scripts/youtube-upload.js` at the file for its `CLIENT_SECRET_NAME`, `REFRESH_TOKEN_SECRET_NAME` and
`DEFAULT_QUOTA_PROJECT` constants. Add a weekly scheduled job running `--check` and failing when the
stored refresh token no longer resolves to the declared channel.

**14. Record the design in the repository contents report.** Add the `google/` directory and
`google-apply.yml` to `REPORT_REPOSITORY_CONTENTS.md`, and remove the rows for the files and
workflows deleted by items 3, 5 and 7.

## What stays manual

**Creating an OAuth client, and reading its secret.** Google publishes no general API for the
clients on the Google Auth Platform. The only programmatic route is IAP's brands and
`identityAwareProxyClients`, and those clients are locked to IAP, reject redirect URI changes, and
cannot be edited in the console. A brand created through that API also starts internal and
unreviewed, so making it public means a console visit and a verification submission that can take
weeks.

Size of the residue: two clients exist, and neither changes. A new client is one console visit plus
one `node scripts/youtube-upload.js --store-client <path>` run, which writes the downloaded JSON
straight into Secrets Manager with no id typed by hand. Item 12 makes any hand edit to an existing
client fail the build.

What would close it: a public API for Google Auth Platform clients. Two things to check when this
work starts, because both moved recently. `gcloud iam oauth-clients` exists today but manages
workforce identity federation clients, so confirm whether its scope has widened. And the Google Auth
Platform console section was rebuilt recently, which often precedes an API surface.

**The first YouTube consent.** A refresh token comes from a person approving scopes in a browser.
`scripts/youtube-upload.js` already reduces that to once per credential and stores the result in
Secrets Manager. What would close it: domain-wide delegation, where a service account acts as a
Workspace user without a browser. That depends on whether the channel's owning account is a
Workspace user under `diyaccounting.co.uk` and whether the YouTube Data API is delegable for it.
Check the owning account first; the rest follows from the answer.

**GA4 cross-domain measurement.** The Analytics Admin API exposes data streams and their enhanced
measurement settings, but not the configured domains list behind "Configure tag settings". That list
is what `PLAN_ONE_STOP_DASHBOARD.md` row D3 needs for one session across the apex, spreadsheets and
submit. Until an API appears, the domains are set once in the GA4 UI, and the linker domains in
`web/public/lib/analytics.js` remain the code-side record, kept in step by the existing test in
`web/unit-tests/analytics.test.js`. Worth rechecking the v1alpha resource list each time this area
is touched; the Admin API gains resources steadily.

**Opening a Google Ads account.** Out of this plan's scope and named in
`PLAN_ONE_STOP_DASHBOARD.md` as an operator step.
