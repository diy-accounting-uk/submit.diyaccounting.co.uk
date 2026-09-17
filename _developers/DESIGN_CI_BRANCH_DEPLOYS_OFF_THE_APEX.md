<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# ci branch deploys prove their own set and leave the apex alone

## 1. The goal

A ci branch deploy proves its own set on its own host, `https://<deployment>.submit.diyaccounting.co.uk`,
and writes nothing shared while its probes run. The ci apex `ci-submit.diyaccounting.co.uk` stops
being a step in the deploy and becomes a pointer that follows the last-known-good set *after* that
set's probes have passed, moved by a separate serialised workflow. `main`'s deploy (environment
`prod`) keeps promote-then-probe-then-roll-back on the prod apex unchanged. Two branch deploys can
then run at the same time without either seeing the other's origin, and the rollback path that
wrote incident #290 has nothing left to roll back on ci.

The one thing a deployment host cannot do today is complete a sign-in: Cognito, HMRC and Companies
House each hold an exact list of redirect URIs, and none of them lists a branch set's host. That
list is the whole design problem; §2 picks how it is filled.

## 2. What changes, per layer

Measured on 2026-09-17: each ci set already carries its own CloudFront alias and its own API
Gateway custom domain (`ci-claud0bad`, `ci-claud0f3a`, `ci-claud5f84`, `ci-claud86af` all standing),
and `https://<set>.submit.diyaccounting.co.uk/` and its `/api/v1/cognito/token` both answer 200. The
host works; only the sign-in does not.

| Layer | File | Today | After |
|---|---|---|---|
| Deployment name | `.github/actions/get-names/action.yml` (ci branch: `ci-${CLEANED:0:5}${REF_HASH}`) | one name per branch, unbounded | one of N fixed slot names, claimed per ref |
| Public host | `SubmitSharedNames.java:1179-1202` (`publicDomainName = envDomainName` for non-prod) | ci Lambdas and `submit.env` carry the apex | non-prod `publicDomainName = deploymentDomainName` |
| Probe base URL | `probe-test.yml:494,543` (`needs.names.outputs.public-url`) | the ci apex | the set's own host, by the line above |
| API check | `deploy.yml:1935` (`verify-api` uses `apex-url`) | the ci apex | `public-url` |
| OpenAPI server | `deploy.yml:1733` (`DIY_SUBMIT_APEX_URL`) | the ci apex | `public-url` |
| Cognito URLs | `IdentityStack.java:463,474` | apex and public only | apex plus every slot host |
| Apex promotion | `deploy.yml:1768` `set-origins` | every ci deploy, before probes | prod only; ci promoted after proof by `promote-ci-apex.yml` |
| Apex rollback | `deploy.yml:2961` `rollback-origins` | fires on any ci or prod probe failure | prod only |
| Local ci runs | `.env.ci:12` | `https://ci-submit.diyaccounting.co.uk/` | unchanged: the apex still points at a proven set |

### The redirect-URI options

| | How the host gets registered | Cost | Verdict |
|---|---|---|---|
| (a) Per-deploy registration | the app deploy calls `UpdateUserPoolClient` on `ci-env-IdentityStack`'s client, adding its host; the self-destruct Lambda and `destroy-ci.yml` remove it | a cross-stack write from an app stack to an env resource (custom resource or workflow step, plus `cognito-idp:UpdateUserPoolClient` on the deploy role), a read-modify-write race between two concurrent deploys on one client, and a leak every time a removal is missed | loses: it registers with Cognito only, and 22 of the ~30 ci probe suites also need HMRC or Companies House, which have no registration API available to us |
| **(b) A fixed slot pool** | N permanent hosts, `ci-set1` … `ci-setN`, registered once with all three providers; the deploy claims a free slot | one operator registration per slot per provider, a claim record per slot, and a cap of N concurrent branch deploys | **chosen**: the only shape whose host list is small, fixed and knowable in advance, which is what a manual registration at HMRC and Companies House requires |
| (c) An app client per deployment | the app deploy creates its own Cognito client; the page reads its id from `submit.env` | a Cognito client per set to create and delete, and `toggle-cognito-native-auth.js` and the DIYA-GL client lookup both gain a per-set case | loses: a new client id does not change which *host* HMRC and Companies House accept, so it solves the smaller half of the problem and adds a resource to reap |
| (d) Sign in off the deployment host | the probes mint tokens directly (Cognito `InitiateAuth`, an HMRC token from the test-user generator) instead of driving the browser through the provider | no registration anywhere | loses: the hosted-UI journey and the HMRC grant screen are what `authBehaviour`, `tokenEnforcementBehaviour`, `submitVatBehaviour` and the ITSA suites assert; removing them removes the probe's subject |

**N = 4.** Four ci sets stand today and the self-destruct default is 4 hours (`deploy.yml:148`),
so four slots hold the current wave shape with no queueing. Adding a fifth is three operator
registrations and one line in each of two files.

### Slot claim and release

`/submit/ci/slots/<slot>` in SSM holds `{"ref": "<github.ref>", "runId": "<id>", "claimedAt": "<ISO>"}`.
A new action, `.github/actions/claim-ci-slot`, runs in `deploy.yml`'s `names` job before `get-names`
and emits the slot as the deployment name:

- a slot is free if its parameter is absent, or its `ref` equals this run's, or `claimedAt` is
  older than `selfDestructDelayHours + 1h`;
- same ref wins its own slot back, so a redeploy still lands on the same stacks and the
  anchor-to-`CreationTime` self-destruct guarantee (`deploy.yml:400-424`) is untouched;
- no free slot: poll every 60s for 30 minutes, then fail naming each slot's ref and `claimedAt`;
- release is a delete of the parameter, by `destroy-ci.yml` after its destroy job and by
  `selfDestruct.js` alongside the stack deletions (`app/functions/infra/selfDestruct.js:115-126`).

An explicit `deployment-name` dispatch bypasses the pool as it does today, and gets no slot; its
host is not registered, so its probes are the apex-only case in §3.

## 3. The third-party redirects

Measured against the live sandboxes on 2026-09-17 by calling each authorize endpoint with the ci
application's client id and two redirect URIs:

| Provider | Application | ci apex | a branch set's host |
|---|---|---|---|
| HMRC sandbox | `uqMHA6RsDGGa7h8EG2VqfqAmv4tV` (`.env.ci:44`) | 200, `auth_id` issued, lands on `test-www.tax.service.gov.uk/oauth/start` | 400 `{"error":"invalid_request","error_description":"redirect_uri is invalid"}` |
| Companies House sandbox | `e5be4a0d-cebf-4024-83a3-5497a0fec4b2` (`.env.ci:54`) | 200 | 400 |
| Cognito `ci-env-client` | `1icvbk6rntkji1oa9b0st6a5pt` in `eu-west-2_kJdPVHoTT` | registered (2 callback, 2 logout URLs) | absent |

The HMRC application already holds at least three exact URIs — the prod public host, the ci apex
and `https://local.submit.diyaccounting.co.uk:3443/...` all answer 200 — so it takes more than one
and the four slot hosts join that list. Neither provider offers a wildcard or an API we hold, so
each slot host is registered by hand, once, and then never again.

Suites that need a provider redirect: 20 use `behaviour-hmrc-vat-steps.js` or
`behaviour-hmrc-itsa-steps.js` (`submitVat`, `postVatReturn`, `getVat*`, `itsa*`, `vatSchemes`,
`vatValidation`, `tokenEnforcement`, `payment`); 2 use `behaviour-companies-house-filing-steps.js`
(`changeRegisteredOffice`, `changeRegisteredEmail`, both already behind
`runCompaniesHouseSandboxFiling` and blocked on O17). Every one of them runs on a slot host once
that host is registered — no suite is skipped and no suite is pinned to the apex. A deploy with an
explicit `deployment-name` outside the pool is the exception: `deploy.yml` fails the probe jobs fast
with "deployment `<name>` holds no ci slot, so its host is not a registered redirect; dispatch
without `deployment-name` to take a slot".

## 4. Self-destruct and destroy-ci

A slot's stacks come and go; its registrations do not. What each teardown path must clear:

| Path | Clears | Leaves standing |
|---|---|---|
| `SelfDestructStack` EventBridge → `selfDestruct.js` | the 12 `<slot>-app-*` stacks, the API Gateway mappings it already reaps (`selfDestruct.js:398-455`), **and the slot's SSM parameter** (new: `SLOT_PARAMETER_NAME` env plus `ssm:DeleteParameter` on the Lambda role in `SelfDestructStack.java`) | the slot's Cognito, HMRC and Companies House registrations, and the slot's Route53 record, which the next deploy of that slot recreates |
| `destroy-ci.yml` | the same stacks, plus the slot parameter in a new step after `destroy` | the same registrations |
| `promote-ci-apex.yml` | nothing | — |

`destroy-ci.yml`'s refusal (`:660-688`) keeps both of its guards: the last-known-good check, and the
live-distribution check that refuses a set still carrying the apex alias. Because the apex now moves
only after a set is proven, a set holding the apex is always the last-known-good one and the two
guards agree instead of racing. The slot name matches its `^ci-[a-zA-Z0-9-]+$` pattern unchanged.

A slot reclaimed by a different branch redeploys the same stack names over the previous branch's
stacks. Customer-facing tables are per-environment, not per-deployment, so nothing is carried
between branches by the reuse.

## 5. Migration

Each PR is buildable on its own and leaves ci working. P1 through P3 change nothing about where the
probes point; P4 moves them; P5 takes the apex out of the deploy path.

| PR | Change | Files | Proof |
|---|---|---|---|
| P1 | The slot pool: `claim-ci-slot` action, `names` job uses it, `destroy-ci.yml` and `selfDestruct.js` release it | `.github/actions/claim-ci-slot/{action.yml,claim-ci-slot.mjs}`, `.github/actions/get-names/action.yml`, `.github/workflows/deploy.yml`, `.github/workflows/destroy-ci.yml`, `app/functions/infra/selfDestruct.js`, `SelfDestructStack.java` — ~7 | a `deploy` run on the branch: `names` job logs `DEPLOYMENT_NAME=ci-set<N>`, `set origins` job aliases the apex to `ci-set<N>.submit.diyaccounting.co.uk`, and `aws --profile submit-ci ssm get-parameter --name /submit/ci/slots/ci-set<N>` reads back this run's id |
| P2 | Operator registration, no code: 4 HMRC redirect URIs (`https://ci-set<1-4>.submit.diyaccounting.co.uk/activities/submitVatCallback.html`) and 4 Companies House ones (`.../companies-house/filingCallback.html`) | 0 | the §3 curl against each sandbox authorize endpoint answers 200 for all four slot hosts |
| P3 | `IdentityStack` lists the slot hosts: `buildCallbackUrls`/`buildLogoutUrls` take an explicit list — prod: public + env; ci: env + every slot | `IdentityStack.java`, its snapshot test — ~2 | a `deploy-environment` run on `main`: `deploy identity` job green, then `describe-user-pool-client` on `1icvbk6rntkji1oa9b0st6a5pt` lists 10 callback and 10 logout URLs |
| P4 | The set's own host is its public host: non-prod `publicDomainName = deploymentDomainName`; `verify-api` and `DIY_SUBMIT_APEX_URL` take `public-url` | `SubmitSharedNames.java`, `.github/workflows/deploy.yml`, snapshot tests — ~4 | a `deploy` run on a branch: the `submitVatBehaviour-ci via probe test` job logs `DIY_SUBMIT_BASE_URL=https://ci-set<N>.submit.diyaccounting.co.uk/`, reaches the HMRC grant page and passes, while the apex still serves the previous set |
| P5 | The apex leaves the deploy: `set-origins` and `rollback-origins` gated to prod, a dispatch of the new `promote-ci-apex.yml` after `set-last-known-good-deployment`, and the `wait-for-main-deploy` calls in `probe-test.yml` dropped for ci | `.github/workflows/deploy.yml`, `.github/workflows/promote-ci-apex.yml` (new), `.github/workflows/probe-test.yml` — ~3 | a `deploy` run on a branch shows no `set origins` and no `roll back apex` job; the `promote-ci-apex` run it dispatches shows the apex on the proven set; two branch deploys overlapping both go green |

`promote-ci-apex.yml` takes a deployment name, runs the existing `set-origins` action, and carries
`concurrency: {group: promote-ci-apex, cancel-in-progress: false}` so two promotions never
interleave a CloudFront alias move. `deploy.yml` dispatches it with `gh workflow run` and does not
wait, so a superseded promotion being dropped at the group never reddens a deploy run.

**The last-known-good pointer afterwards.** `/submit/ci/last-known-good-deployment` keeps its
current writer (`set-last-known-good-deployment`, still gated on `web-test`) and its current
readers (`probe-test.yml`'s ci default, `destroy-ci.yml`'s refusal, `deploy.yml`'s skip-deploy
path). Its meaning tightens: it is the set whose probes passed on its own host, and the ci apex now
follows it one promotion behind the deploy instead of one ahead. Nothing reads the apex to decide
what is good.

## 6. Unknowns

- HMRC's cap on redirect URIs per Developer Hub application. Three are registered today and four
  more are wanted; if the cap is five, N drops or the sandbox application splits.
- Whether the Companies House "- test" application takes more than one redirect URI. O17 read one.
- Cognito's documented quota is 100 callback URLs per client; the pool needs 10 and this was not
  measured against the live client.
- Whether any per-deployment DynamoDB or S3 state survives a slot being reclaimed by a different
  branch. The customer tables are per-environment; the per-deployment async-request tables were not
  checked for rows a reused slot would inherit.
- Prod could not be read this session: `aws --profile submit-prod sts get-caller-identity` answered
  "Token has expired and refresh failed". Every prod statement here comes from the repository, not a
  live read.
