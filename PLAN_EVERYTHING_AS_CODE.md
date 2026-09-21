<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: everything as code

Status: open. Items 1-7 and 12-14 are shipped. Items 8-11 (the workload identity pool, GitHub
Actions and Lambda federation, and key rotation) remain. Items 15-24 widen the scope past Google to
Google Ads and every other third-party console the company relies on.

Everything the operator does by hand in a third-party console moves into files in this repo, applied
by one workflow per service. The target is no console visit for a routine change, and no generated id
copied between browser tabs. Google Cloud, GA4 and YouTube are most of the way there; Google Ads,
Companies House, HMRC, GitHub, Stripe, PayPal and Telegram are not.

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

> Please extend the scope of this PLAN_GOOGLE_AS_CODE.md (if it isn't already) to include the Google
> Ads account we just created, then rename that doc and all the references to it to
> PLAN_EVERYTHING_AS_CODE.md and we shall create infra/google/cgp infra/google/g4a infra/google/ad
> as well as infra/stripe and infra/paypal and anything else we rely upon with any configured
> compliexit to be defined as code.

Read as `infra/google/gcp`, `infra/google/ga4`, `infra/google/ads`, `infra/stripe`, `infra/paypal`,
and every other third-party service with configured complexity.

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
  identity.toml    service accounts, workload identity pools and providers, key rotation, org policies
  analytics.toml   the GA4 account, its properties, streams, key events, links, export settings
  bigquery.toml    the ga4_daily dataset and its scheduled queries
  oauth.toml       the consent screen fields and the OAuth clients we own
  youtube.toml     the channel, its quota project and its credential secrets
```

These six paths and their scripts move under `infra/google/` in item 15; the section "The `infra/`
layout" below carries the mapping.

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

### Google Ads, concretely

Opened 2026-09-17 under the organisation's manager account. GA4 property `523400333` is linked with
auto-tagging on, three key events are imported as conversion actions (`purchase`,
`submit_vat_return`, `runner_download`), Purchase and Sign-up are the account's default goals, and
one Performance Max campaign runs at £1.00 a day. `PLAN_ONE_STOP_DASHBOARD.md` row D17 is the
reinvestment loop that will move that budget; `NEXT.md` row B52n splits `donate` off `purchase`
first.

Access needs an access level on the Cloud project `diyaccounting-ga4`, granted on that project's
"Google Ads API Overview" page in the Cloud console. The Ads API reads the access level from the
Cloud project, not from a developer token header. The account is accessed through its own OAuth
client and refresh token: the Desktop-client credentials `scripts/youtube-upload.js` already holds,
consented separately for the adwords scope. Secrets Manager holds the refresh token; `infra/google/ads/ads.toml`
records the secret names, never the values.

| Wanted state | Read and applied through |
| --- | --- |
| Auto-tagging on the account | `Customer.auto_tagging_enabled` through `CustomerService` |
| Conversion actions imported from GA4 | `ConversionAction`, one per imported key event |
| The account's default goals | `CustomerConversionGoal`, plus `CampaignConversionGoal` where a campaign overrides them |
| The campaign | `Campaign` with `advertising_channel_type = PERFORMANCE_MAX` |
| Its daily budget | `CampaignBudget.amount_micros` |
| Its asset group | `AssetGroup`, `AssetGroupAsset`, `Asset` |
| On-off and geographic controls for an `experiments.toml` row | `Campaign.status`, `CampaignCriterion` |
| The GA4 side of the link | GA4 Admin API `properties.googleAdsLinks` |

The link has two owners: GA4 creates it, Ads imports through it. `ga4-sync.js` keeps
`properties.googleAdsLinks`; `ads-sync.js` keeps the Ads side and fails on a missing conversion
action rather than creating a second one beside it. Confirm every resource name against the API
version pinned when the work starts; the Ads API retires a version every few months.

**The reserve floor is a guard the loop reads before it raises `amount_micros`.** Below the floor the
loop leaves the budget alone and says so on the dashboard. The number is the company's
cash position, so it stays out of this public repository — recorded privately today, an SSM
parameter in submit-prod once the loop runs unattended. `ads.toml` records the parameter name and the
guard, never the value.

## The `infra/` layout

Today the Google declarations sit in `google/` and their scripts in `scripts/`, among a hundred
unrelated ones. Everything declarative moves under `infra/`, one directory per service, each holding
its TOML and the script that applies it. The Java CDK keeps `infra/main` and `infra/test` exactly as
they are.

| Today | Tomorrow |
| --- | --- |
| `google/project.toml` | `infra/google/gcp/project.toml` |
| `google/identity.toml` | `infra/google/gcp/identity.toml` |
| `google/bigquery.toml` | `infra/google/gcp/bigquery.toml` |
| `google/oauth.toml` | `infra/google/gcp/oauth.toml` |
| `google/youtube.toml` | `infra/google/gcp/youtube.toml` |
| `google/credentials/aws-{ci,prod}.json` | `infra/google/gcp/credentials/aws-{ci,prod}.json` |
| `analytics/bigquery/*.sql` | `infra/google/gcp/bigquery/*.sql` |
| `google/analytics.toml` | `infra/google/ga4/analytics.toml` |
| `scripts/gcp-enable-apis.js`, `gcp-billing-assert.js`, `gcp-identity-sync.js`, `gcp-key-rotate.js`, `google-roles-apply.js`, `google-oauth-assert.js`, `google-inventory.js` | `infra/google/gcp/` |
| `scripts/ga4-sync.js`, `ga4-bigquery-sync.js` | `infra/google/ga4/` |
| `scripts/lib/googleAuth.js` | `infra/google/lib/googleAuth.js` |
| — | `infra/google/ads/ads.toml`, `ads-inventory.js`, `ads-sync.js` |

YouTube's declaration stays with `gcp`: what it configures is the project's OAuth client and quota
project. `scripts/youtube-upload.js` is a publishing tool, so it stays in `scripts/` and reads the
moved file.

The convention does not change: TOML is the wanted state, a Node script lists live state, diffs and
plans by default, applies only with `--apply`, and has a unit-tested pure planner.
`google-apply.yml` keeps driving all three Google directories in one run, Ads last because it depends
on the GA4 link, with its path filters moved to `infra/google/**`.

The move is wider than the files themselves. `google/*.toml` paths are read by
`web/unit-tests/analytics.test.js`, `google/bigquery.toml`'s four `sql_file` entries and
`app/unit-tests/scripts/ga4BigQuerySync.test.js`, named by the three workflows and three npm scripts,
and quoted in comments in `app/lib/googleWorkloadIdentity.js`, `ga4DailyPull.js`,
`web/public/lib/analytics.js`, `IngestionStack.java` and `Ga4DailyTables.java`. One commit, so
nothing ever reads a path that has gone.

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

## Everything else with configured complexity

Taken from the repository: `secrets-rotation.toml`'s six consoles, the Stripe scripts and their
skill, the spreadsheets site's donation routes, the two developer hubs, GitHub's own settings and the
bot. The last two rows are records: they carry a date each, which `compliance.toml` already holds, so
there is nothing to apply.

| Service | Configured today | API to read and apply | Proposed path | Applied by |
| --- | --- | --- | --- | --- |
| Google Cloud, GA4, YouTube | `google/*.toml`, seven scripts | yes, except OAuth clients | `infra/google/gcp`, `infra/google/ga4` | `google-apply.yml` |
| Google Ads | the Ads console | yes, through an access level on the Cloud project | `infra/google/ads` | `google-apply.yml` |
| Companies House | two hub applications, `.env.{ci,prod}` client ids, four secrets, the XML Gateway presenter | none for the hub; the live endpoints answer | `infra/companies-house`, assert only | `infra-apply.yml` |
| HMRC | two hub applications, their API subscriptions, two secrets | none for the hub; a call proves a subscription | `infra/hmrc`, assert only | `infra-apply.yml` |
| GitHub | two hand-run scripts, `deploy-environment.yml`, the rest in the console | yes, the REST API covers every setting named below | `infra/github` | `infra-apply.yml` |
| Stripe, subscriptions | `submit.catalogue.toml` plus `scripts/stripe-setup.js` | yes | `infra/stripe` | `infra-apply.yml` |
| Stripe, donations | `donate-links.toml` plus a setup script, in the spreadsheets repository | yes | that repository's `infra/stripe` | its own workflow |
| PayPal | a hardcoded hosted-button id in the spreadsheets template | none for classic hosted buttons | `infra/paypal`, assert only | `infra-apply.yml` |
| Telegram | a token in Secrets Manager, chat ids in `.env.*` | read-back only (`getMe`, `getChat`) | `infra/telegram`, assert only | `infra-apply.yml` |
| ICO registration | `compliance.toml` row `ico-registration` | not configuration | record only | — |
| The company's own filings | `compliance.toml`, the dashboard's statutory calendar | not configuration | record only | — |

### Companies House

Two hub applications, one per environment: "DIY Accounting Submit - test" on the sandbox hosts for
ci, the live application for prod. Each carries a client id committed in `.env.ci` or `.env.prod`,
and a client secret and REST key in `{env}/submit/companies-house/*` written from GitHub Environment
secrets by `deploy-environment.yml`; the sandbox has a second REST key held only as the GitHub secret
`COMPANIES_HOUSE_SANDBOX_API_KEY`. The XML Gateway presenter id and code are GitHub Environment
secrets on ci, blank on prod, and outside `secrets-rotation.toml` because no AWS secret exists for
them yet. The package reference comes from `CompaniesHouseStack.java`.

The redirect URI carries the operational history. It is never stored:
`web/public/lib/auth-url-builder.js` rebuilds it from `DIY_SUBMIT_BASE_URL` as
`…/companies-house/filingCallback.html`, and the hub holds the registered copy. `NEXT.md` row O17 is
what that costs — the sandbox sign-in is reachable only through `/oauth2/authorise` with the "- test"
client and a registered host, and a branch deployment's host answers 400.

The only application-management surface the repo names is the hub's `manage-applications` web page,
so `infra/companies-house` is declare-and-verify. `companies-house.toml` records, per environment,
the application name, the client id, the three base URIs, every registered redirect URI, the secret
names, and the presenter identity's secret names. `companies-house-assert.js` proves what a live call
can prove: each client id and redirect pair gets an `/oauth2/authorise` request and must not answer
400, the REST key answers a public-data call, and the file's client ids match the deployed `.env`. No
streaming key appears in this repository; the first run records whether one exists.

Residue: creating an application, registering a redirect URI, requesting a presenter account. What
would close it: an applications API on the hub, which Companies House has not published.

### HMRC

Two applications again, sandbox and production, both client ids committed in the `.env` files, both
secrets in Secrets Manager from GitHub Environment secrets, and the redirect URI rebuilt at runtime
as `…/activities/submitVatCallback.html` rather than recorded.

The API subscriptions have no declaration. `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md` is the only
list — six APIs added to the sandbox application beside Business Details — and it states the
constraint: only the hub account holder can add a subscription. An unsubscribed call answers
`RESOURCE_FORBIDDEN`, which makes the state checkable even though it is not writable.

`infra/hmrc/hmrc.toml` records both applications, their base URIs, every subscribed API with its
version, the redirect URIs and the secret names. `hmrc-assert.js` takes a client-credentials token
per application and calls one cheap endpoint per declared subscription, failing on
`RESOURCE_FORBIDDEN`, so a subscription that disappears is a red build rather than a failed customer
submission. The fraud-prevention headers need nothing new: `buildFraudHeaders.js` builds them, the
Test Fraud Prevention Headers API validates them on every synthetic run, and
`scripts/fraud-header-email-check.js` reads HMRC's monthly report.

Residue: holding the hub account, adding a subscription, registering a redirect URI, accepting the
terms of use, the production-approval correspondence. What would close it: an api-platform management
API, which HMRC has not published.

### GitHub

Two settings are code today: `scripts/check-workflow-permissions.mjs` runs in `test.yml`, and
`deploy-environment.yml` copies each GitHub Environment secret into Secrets Manager. Everything else
sat in the console until `infra/github` and `github-sync.js` covered it: the Actions allow-list and
SHA pinning, the "main" ruleset's rules and bypass actors, the merge settings, Dependabot security
fixes, and the environments' variable and secret names.

Every one is in the REST API: `/repos/{owner}/{repo}/rulesets`, `/actions/permissions` and
`/actions/permissions/selected-actions`, the repository object's `delete_branch_on_merge`,
`/automated-security-fixes`, `/environments` and their variables, and `/orgs/{org}/installations`. So
`infra/github/github.toml` declares the rulesets and their rules, the required checks, the allow-list,
the environments and the *names* of their variables and secrets, and `github-sync.js` diffs and
applies. A secret's value never enters the file; the applier reports a name that is missing.

The residue is the two GitHub Apps of `NEXT.md` row O38: creating one is a browser flow, since the
manifest conversion endpoint still needs a person to complete a redirect, and installing it is a
console click. Once they exist the API reads them back, so the file can assert them. What would close
it: an app-creation API, which GitHub has not published.

### Stripe

Submit's subscriptions already have a declaration: `web/public/submit.catalogue.toml` carries five
bundles' `stripePriceAmount`, `stripeCurrency` and `stripeInterval`, `scripts/lib/stripeCatalogue.js`
turns them into wanted products, and `scripts/stripe-setup.js` finds or creates each product, its
recurring price and the two webhook endpoints with their nine events. Three things put it outside the
convention: it applies by default and plans only with `--dry-run`, the endpoint URLs are hardcoded in
the script, and the price ids it creates are printed for a person to paste into `.env.ci` and
`.env.prod` — the habit this plan exists to remove.

`infra/stripe` fixes all three: `stripe.toml` carries the endpoints, their event list and the secret
names; `stripe-sync.js` plans by default and applies with `--apply`; and the applier writes each new
price id where the deploy reads it, the way `ga4-sync.js` writes `SUBMIT_GA4_MEASUREMENT_ID`. A
webhook endpoint's signing secret is returned once, at creation, so the applier writes it straight
into Secrets Manager through `scripts/put-secret-with-rotation-tag.sh` instead of printing it.

The live/test split stays where `.claude/skills/stripe-catalogue-sync/SKILL.md` puts it: a separate
explicit go before a live apply, a decision the file does not override.

The spreadsheets site's donation Payment Links are the same shape in the other repository:
`donate-links.toml` holds four links per environment, a build step templates them into `donate.html`,
and `scripts/stripe-spreadsheets-setup.js` creates the product, the prices and the links and writes
them back into the TOML, with no dry run. That repository owns the fix; this plan owns the convention
it should match.

### PayPal

The whole configuration is one line: a classic hosted Donate button whose `hosted_button_id` is
hardcoded in the spreadsheets site's `donate.template.html`. No client id, no secret, no IPN
endpoint, no test mode, no ci/prod split, so nothing rotates and a build can verify nothing. The only
part already as code is the CSP allowance for `paypal.com` and `paypalobjects.com` in that
repository's `security-headers.json`.

PayPal's REST API has no resource for classic hosted buttons, and the NVP Button Manager that made
them is closed to new integrations. So `infra/paypal` is a declaration plus an assertion:
`paypal.toml` records the button id, the return URL and the page carrying the form, and
`paypal-assert.js` fails when the template drifts from the file or the donate URL stops resolving.
What would close the gap is moving donations onto PayPal's REST orders API, declarable and testable
in the sandbox — the decision `PLAN_ONE_STOP_DASHBOARD.md` row D2 waits on.

### Telegram

Send-only alerting: `app/functions/ops/activityTelegramForwarder.js` posts to `sendMessage` with a
token from `{env}/submit/telegram/bot_token`, and three chat ids per environment travel from
`.env.{ci,prod}` through `SubmitEnvironment.java` onto the Lambda. No webhook, no polling, no setup
script: the bot, the six groups and their chat ids were made by hand and live in
`RUNBOOK_INFORMATION_SECURITY.md`.

The Bot API reads back everything that drifts: `getMe` confirms the bot behind the token, `getChat`
confirms each chat id still resolves with the bot in it, `getWebhookInfo` confirms none is set.
`infra/telegram/telegram.toml` records the bot handle and the six groups with their chat ids and
environments, and `telegram-assert.js` fails on a mismatch, so a bot removed from a group is a red
build instead of an alarm that never arrives. The residue is creating a bot and adding it to a group,
both BotFather chat flows. What would close it: a bot-provisioning API, which Telegram has not
published.

## Work items

Each item is small enough to land on its own. Items 1 and 2 are prerequisites for the rest; after
those, 3 to 6 and 12 to 14 can go in parallel. Item 15 moves the tree and precedes everything after
it; 16 and 17 are the Ads work; 18 to 23 take one service each, ordered by what an undetected
console change costs.

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

**5. One workflow — done for the scripts that exist.** `.github/workflows/google-apply.yml` runs
inventory, enable-apis, roles-apply, billing-assert, ga4-sync and bigquery-sync, plan on pull
request and apply on push to main, replacing `google-roles.yml` and `ga4-bigquery-sync.yml`. The
oauth-assert and youtube-check steps join it as items 12 and 13 land.

**6. `google/analytics.toml` in the shape above — done.** Account `1035014`, property `523400333`
with its three streams and its `key_events`, and the ci property with `github_environment = "ci"`
and `G-DV0SDVEZWC`. `[old_property]` and `[legacy]` stay as a record; `scripts/ga4-sync.js` does not
read either. No prod property entry: nothing live to carry across for one yet.

**7. `scripts/ga4-sync.js` — done.** Folds `ga4-property-sync.js`, `ga4-key-events-sync.js` and
`ga4-bigquery-link-export.js` into one script over `google/analytics.toml`, keyed by iterating every
`[[property]]` entry rather than one `--environment`/`--hostname` pair per run. Carries across
`buildPlan`'s per-facet shape, `extractBigQueryLinks`'s lowercase-q fix, the `deleteTime` skip, and
key-event grouping so two labels sharing one GA4 event are marked once. Fails when a recorded `id` or
`measurement_id` doesn't match a live property or stream. Enhanced measurement settings go through
`v1alpha .../enhancedMeasurementSettings`, modelled as a `streamEnabled` field the real response shape
has not been checked against — confirm with a dry run before relying on that write. The three old
scripts, their four test files, the `ga4:bigquery-link-export` npm script (the only one of the two the
plan expected that existed) and `.claude/skills/ga4-property-sync/SKILL.md` are gone; tests live in
`app/unit-tests/scripts/ga4Sync.test.js`.

**8. Workload identity pool and GitHub provider — done.** Add `google/identity.toml` declaring the service
account, the pool, and one provider per external issuer. Add `scripts/gcp-identity-sync.js` against
`iam.googleapis.com/v1 projects/{p}/locations/global/workloadIdentityPools` and its `providers`
subresource, plus the `iam.workloadIdentityUser` binding on the service account. Plan and apply like
the others, with a unit-tested pure planner. Add the step to `google-apply.yml`.

**9. Actions authenticate with federation — done.** Add `google-github-actions/auth@v2` to
`google-apply.yml` using the pool from item 8, and drop the "Resolve GA4 service account key" step
from the steps that only talk to Google. Keep the AWS chain for `ga4-sync.js` (it writes GitHub
variables) and any step reading Secrets Manager. Verify by running the workflow in plan mode and
confirming every step still reads live state.

**10. Key rotation as code — not needed: item 11 removed the last key on 2026-09-18.** Add `scripts/gcp-key-rotate.js` reading
`[service_account.key_rotation] max_age_days` from `google/identity.toml`. It creates a key, writes
it to `ci/submit/ga4/service_account` and `prod/submit/ga4/service_account` through
`scripts/put-secret-with-rotation-tag.sh`, and on the following run deletes keys past the age limit.
Run it from a scheduled workflow, monthly. Fill the `ga4/service_account` row's `last_rotated` in
`secrets-rotation.toml` from the first run.

**11. Lambdas authenticate with federation — done; the two keys and both secrets were deleted on 2026-09-18.** Add an `aws` provider to the pool for account
`972912397388`, conditioned on the Lambda execution role. Each AWS provider maps `google.subject`
to the role name via `assertion.arn.extract('assumed-role/{role}/')`, because the full assumed-role
ARN exceeds Google's 127-byte limit for the longest of the three function names.
Generate the credential configuration with
`gcloud iam workload-identity-pools create-cred-config` and commit it. Change
`app/functions/analytics/ga4EventExportPull.js` and `ga4ReportPull.js` to build their clients from
external account credentials. Spike the Node client in a real Lambda first; if its default AWS
credential retrieval misses Lambda's environment variables, pass an `AwsSecurityCredentialsSupplier`
that reads them. When the Lambdas work, delete the service account key, delete both secrets, remove
the `ga4/service_account` row from `secrets-rotation.toml`, and delete `scripts/gcp-key-rotate.js`
and its scheduled workflow.

**12. `google/oauth.toml` and `scripts/google-oauth-assert.js` — done, narrower than drafted.**
Both clients are recorded. The brand check runs (project number read off the client id itself,
so nothing extra to record), and the sign-in client id is checked against each environment's live
Cognito identity provider (`{env}-env-IdentityStack`'s `UserPoolId` and `CognitoGoogleIdpId`
outputs). The YouTube client id and the granted-scopes check are wired but the file carries no
`id` for that client yet — nobody has read it back out of Secrets Manager into this file, and nothing
in this session could. `redirect_uris` and `application_type` stay a maintained record only: no
Google API reads a non-IAP client's own configuration back, the same wall the plan's own "what
stays manual" section already names for creating one. Added to `google-apply.yml`, after
bigquery-sync.

**13. `google/youtube.toml` and a credential check on a schedule — done.** No numeric channel id
recorded: the YouTube Data API resolves a channel from the signed-in account itself (`channels?
part=snippet&mine=true`, already what `--check` called), so the file records the handle
(`@DIYAccountingSubmit`) and `--check` compares it against the live `snippet.customUrl` instead of
needing an id nobody had looked up. `scripts/youtube-upload.js` reads `CLIENT_SECRET_NAME`,
`REFRESH_TOKEN_SECRET_NAME` and `DEFAULT_QUOTA_PROJECT` from the file.
`.github/workflows/youtube-check.yml` runs `--check` weekly (Monday 06:00 UTC) and on demand, and
fails the run when the resolved handle no longer matches.

**14. Record the design in the repository contents report — done.** `google/oauth.toml` and
`google/youtube.toml` joined the existing `google/*.toml` rows; `google-apply.yml` and
`youtube-check.yml` joined the workflow table. Nothing deleted by items 3, 5 or 7 had a row there
to remove.

**15. Move the declarations under `infra/`.** The table in "The `infra/` layout" is the whole
change: `git mv` each file, update every reader named in that section, and rename the path filters
in `google-apply.yml`, `google-key-rotate.yml` and `youtube-check.yml`. Nothing else changes, so the
proof is `npm test` plus one `google-apply.yml` plan run that still reads live state. One commit, so
no reader is ever pointing at a path that has gone. **Model**: Sonnet. **Size**: ~30 files.

**16. Read-only inventory of the Google Ads account.** `infra/google/ads/ads-inventory.js`, the
shape of `google-inventory.js`: authenticate with the Cloud project's access level and the client
account's refresh token, then read the account's auto-tagging setting and conversion tracking
settings, every `ConversionAction` with its type, status and origin, the `CustomerConversionGoal`
set, every campaign with its channel type, status, budget and asset groups, and the GA4 link as
GA4's Admin API reports it. Print, write nothing. Run it before anything else is declared, because
the file has to be written from what is live. **Model**: Sonnet. **Size**: ~3 files.

**17. `infra/google/ads/ads.toml` and `ads-sync.js`.** Declare the account, the three conversion
actions, the default goals, auto-tagging, the Performance Max campaign, its budget in micros and its
asset group, and the reserve-floor parameter name. `ads-sync.js` plans by default, applies with
`--apply`, fails on an expected conversion action that is missing rather than creating one, and
leaves the GA4 side to `ga4-sync.js`. Add the step to `google-apply.yml`, last. Blocked on item 16
and on B52n landing the separate `donate` event. **Model**: Sonnet. **Size**: ~4 files.

**18. `infra/companies-house`, and the one door for the rest.** `companies-house.toml` and
`companies-house-assert.js` as described above, plus `.github/workflows/infra-apply.yml` in
`google-apply.yml`'s shape: OIDC into AWS, one step per service, plan on a pull request touching
`infra/**`, apply on push to main. Items 19 to 23 each add a step. **Model**: Sonnet. **Size**: ~4
files.

**19. `infra/hmrc`.** `hmrc.toml` carrying both applications, their subscriptions with versions, the
redirect URIs and the secret names; `hmrc-assert.js` proving each subscription with one call per
declared API. Run it against the sandbox application in ci and the production one in prod.
**Model**: Sonnet. **Size**: ~4 files.

**20. `infra/github` — done.** `github.toml` declares the merge settings, the Actions allow-list and
SHA pinning, Dependabot security fixes, the "main" ruleset's rules and bypass actors, and the `ci`,
`prod` and `copilot` environments with their variable and secret names. `github-sync.js` reads live
state through `gh api`, plans by default, and applies with `--apply` through the same routes; a
declared secret or variable name missing live is a finding, never created. `scripts/github-actions-
permissions.sh` is gone, absorbed into the allow-list section. The apply step runs on the `infra-
apply.yml` `prod` leg with `GH_TOKEN: ${{ secrets.ADMIN_TOKEN }}`, since `GITHUB_TOKEN` cannot
administer a repository's own settings.

**21. `infra/stripe`.** Move `scripts/stripe-setup.js` in, invert its default so it plans without
`--apply`, move the two webhook endpoint URLs and the nine events into `stripe.toml`, and have it
write each new price id where the deploy reads it and each endpoint secret into Secrets Manager
through `put-secret-with-rotation-tag.sh`. `submit.catalogue.toml` stays the source of truth for
price, currency and interval. **Model**: Sonnet. **Size**: ~5 files.

**22. `infra/paypal`.** `paypal.toml` recording the button id, the return URL and the page that
carries the form; `paypal-assert.js` failing when the template drifts from the file or the donate URL
stops resolving. The template lives in the spreadsheets repository, so the assert reads it over the
live site rather than the sibling checkout. **Model**: Haiku. **Size**: ~3 files.

**23. `infra/telegram`.** `telegram.toml` recording the bot handle and the six groups with their chat
ids and environments; `telegram-assert.js` calling `getMe`, `getChat` per group and `getWebhookInfo`,
and failing on a bot removed from a group or a webhook that should not be there. Fills the
`telegram/bot_token` row's `last_rotated` when the operator next rotates it.
**Model**: Haiku. **Size**: ~3 files.

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

**The Google Ads residue.** Two things are. The payments profile: entering a card is a console visit,
and `BillingSetup` only links an existing payments account to a customer. The first OAuth consent
for the refresh token, the same browser approval the YouTube credential needs. What would close the
last is the domain-wide delegation named above; what would close the first is a Google billing API
for payments profiles.
