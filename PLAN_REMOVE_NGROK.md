# Remove ngrok from the proxy test path

> Plan only. No code changes until the operator says go.

## Requirement

Backlog row 44, verbatim:

> Replace ngrok in the proxy test path: `start-proxy.sh`, `stripe-setup.js`, the Stripe webhook
> route and `test.yml` all assume an ngrok tunnel with an account token, a paid external
> dependency and a recurring source of stuck local runs. Swap for cloudflared or an
> unauthenticated tunnel, or route webhooks at the simulator so no tunnel is needed.

## The plan in one paragraph

A public A record `local.submit.diyaccounting.co.uk` points at `127.0.0.1`. Every machine that
resolves that name reaches its own loopback. A Let's Encrypt certificate for the same name is
issued over DNS-01, which validates by writing a TXT record in our own zone and never contacts the
A record. The local Express server terminates TLS with that certificate, so the browser sees a
valid `https://` origin on a hostname HMRC, Cognito and Google can all have registered. Stripe
webhooks arrive through `stripe listen`, an outbound connection that replays genuine signed
events. No account, no token, no tunnel, no shared connection to collide over.

## Where ngrok is assumed today

| Site | What it assumes |
|---|---|
| `app/bin/ngrok.js` | Starts the tunnel through `@ngrok/ngrok` with `authtoken_from_env: true`. Reads `NGROK_DOMAIN`, else derives the domain from `DIY_SUBMIT_BASE_URL`. |
| `behaviour-tests/helpers/behaviour-helpers.js:154` | `runLocalSslProxy()` imports `startNgrok` and runs it when `TEST_PROXY=run`. Called from every behaviour test's `beforeAll`. |
| All 17 behaviour tests | Read `TEST_PROXY` (all 17); 14 also hold an `ngrokProcess` handle. Each picks `testUrl = baseUrl` (the tunnel) instead of `http://127.0.0.1:3000/` when the proxy is running. |
| `behaviour-tests/steps/behaviour-steps.js:17` | Sends an `ngrok-skip-browser-warning` extra HTTP header on every page load. |
| `.env.proxy:4,12,18-19` and `.env.proxyRunning:4,12` | `DIY_SUBMIT_BASE_URL=https://wanted-finally-anteater.ngrok-free.app/` at line 12 of both, an ngrok description comment at line 4 of both, and two TODO comments at `.env.proxy:18-19`. `.env.proxy` also sets `TEST_PROXY=run`; `.env.proxyRunning` expects a tunnel already up. |
| `.env.simulator:4`, `scripts/start-simulator.sh:6` | Comments describing the simulator as the way to run without ngrok. |
| `scripts/start-proxy.sh:36` | Starts `npm run proxy -- 3000` as a background job alongside dynalite, mock-oauth2 and the server. |
| `package.json:172` | `"proxy": "npx dotenv -e .env.proxy -- node app/bin/ngrok.js"`. |
| `package.json:285` and `package-lock.json` | `@ngrok/ngrok` as a devDependency. |
| `scripts/stripe-setup.js:145-148` | Registers a Stripe webhook endpoint at the hardcoded `https://wanted-finally-anteater.ngrok-free.app/api/v1/billing/webhook`. |
| `scripts/stripe-trigger-lifecycle.sh:15` | Comment gives the ngrok URL as the example webhook endpoint. |
| `package.json:191-241` and `.pa11yci.proxy.json` | `axe`, `lighthouse`, `text-spacing-test.js`, the ZAP baseline, pa11y and the compliance report all hardcode the ngrok hostname. 107 hostname occurrences in `package.json`, 27 URLs in `.pa11yci.proxy.json`. |
| `web/public/auth/login.html:172-177` | Loads the mock auth addon only when the hostname is localhost, 127.0.0.1 or contains `ngrok`. |
| `.github/workflows/test.yml:22,41,47,524,1086,1123` | `NGROK_AUTHTOKEN` declared as a `workflow_call` secret (47) and passed to the one proxy job (1123). Two input descriptions say "uses ngrok and Docker" (22, 41) and two comments name ngrok (524, 1086). |
| `.github/workflows/deploy.yml:59,299` | Forwards `secrets.NGROK_AUTHTOKEN` into `test.yml` (299); input description says "uses ngrok and Docker" (59). |
| `app/unit-tests/bin/ngrok.test.js` | Unit test over `extractDomainFromUrl` and `startNgrok`. |
| `app/bin/server.js:77,96,135`, `app/lib/httpServerToLambdaAdaptor.js:24` | Comments only. Both files already handle the no-tunnel case. |
| `_developers/SETUP.md` (prerequisites, steps 3-7, and the "Run the website locally" section at lines 177-217); `GITHUB_SETUP.md:82,155` | Tell a new developer to get an ngrok authtoken and reserve a subdomain; list `NGROK_AUTHTOKEN` as a GitHub secret. |
| `RUNBOOK_INFORMATION_SECURITY.md:195` | `NGROK_AUTHTOKEN` row in the secrets inventory table. |
| `CLAUDE.md`, `REPORT_REPOSITORY_CONTENTS.md`, `PASSES.md:322`, `BACKLOG.md`, `.github/copilot-instructions.md:154,215,277`, `.github/agents/behavior-test-master.agent.md:14`, `prompts/behavior-test-master.md:10` | Describe the proxy environment as an ngrok environment. |
| `_developers/archive/` (9 files, including `NGROK_ALTERNATIVES.md`, `HMRC_PRODUCTION_APPROVAL_PLAN.md`, `QUESTIONNAIRE_EVIDENCE_TRACEABILITY.md`) | Records of completed work that quote the ngrok hostname as evidence. The operator settled (2026-08-31) that these stay as written; the grep gate excludes the directory. `NGROK_ALTERNATIVES.md` alone is deleted, superseded by this plan. |
| `repository-contents.txt`, `web/public/tests/test-report-web-test-local.json` | Generated files carrying the hostname from an old run. |

## Why a public URL is needed today

Two independent needs, and they have different answers.

**Leg 1: the HMRC OAuth redirect.** In `submitFormVat()` the browser is sent to HMRC's hosted
grant page on `test-api.service.hmrc.gov.uk`, and HMRC redirects it back to
`${DIY_SUBMIT_BASE_URL}activities/submitVatCallback.html` (`app/functions/hmrc/hmrcTokenPost.js:138`).
That URI has to match one registered against the HMRC sandbox application
(`HMRC_CLIENT_ID=uqMHA6RsDGGa7h8EG2VqfqAmv4tV`). The redirect targets the local browser, not the
local server, so nothing has to reach the machine from the internet. The tunnel is here only to
make the app answer on a hostname HMRC already knows.

This leg is why the base URL has to be stable, and it is why every proxy behaviour test drives the
browser through the tunnel rather than through `127.0.0.1`.

**Leg 2: the Stripe webhook.** This one is genuinely inbound. Stripe's servers POST to
`/api/v1/billing/webhook` (`app/functions/billing/billingWebhookPost.js:20`), the handler verifies
the HMAC against `STRIPE_TEST_WEBHOOK_SECRET`, and the payment behaviour test waits on
`waitForBundleWebhookActivation` for the bundle row to gain a `stripeSubscriptionId`. Only real
Stripe traffic satisfies that.

Nothing else reaches the machine from outside. Mock OAuth2 login, dynalite and the HMRC API calls
are all outbound or local. `Gov-Client-Public-IP` looks like a third need but is not:
`app/bin/server.js:101` already injects a synthetic `X-Forwarded-For` of `203.0.113.1` and a
`CloudFront-Viewer-Address` when the headers are absent, so `buildFraudHeaders.js` produces a
full header set without a proxy in front.

## Which variants depend on the tunnel

- `-proxy` (`.env.proxy`, `TEST_PROXY=run`): tunnel up, browser drives the public URL.
- `-proxyRunning` (`.env.proxyRunning`): same URL, tunnel assumed already running.
- `-simulator` (`.env.simulator`, `TEST_PROXY=off`, `DIY_SUBMIT_BASE_URL=http://localhost:3000/`):
  no tunnel. Test URL falls through to `http://127.0.0.1:3000/`.
- `-ci` and `-prod`: no tunnel. They hit a deployed CloudFront distribution.

Only `-proxy` and `-proxyRunning` need ngrok.

The payment leg splits further. `.env.proxy` sets `STRIPE_PRICE_ID_RESIDENT_PRO` and
`STRIPE_TEST_PRICE_ID_RESIDENT_PRO`, so the guard at `app/bin/server.js:210` does not register
`mockBilling.js` and the proxy run uses real Stripe. `.env.simulator` leaves both blank, so the
simulator run gets the local auto-completing checkout instead.

## How CI uses the tunnel

One job: `behaviour-test-proxy-submit-vat` in `test.yml:1088`. It is gated on
`runProxyBehaviourTests == 'true'`, which normalises to `'false'` at `test.yml:171` when no input
is given, so it runs only when someone opts in through `workflow_dispatch`. It gets
`NGROK_AUTHTOKEN` from the GitHub environment and runs `npm run test:submitVatBehaviour-proxy`.

The job needs only leg 1: `submitVat.behaviour.test.js` runs with `TEST_BUNDLE_MOCK=true` and
never touches Stripe. CI never runs the proxy payment test; `behaviour-test-simulator-payment`
covers payment in CI, and real Stripe webhook coverage lives in the `-ci` variant against the
deployed environment.

Both the local and CI runs share the ngrok reserved domain, so a local run and a CI run at the
same time fight over one connection. That is the stuck-run failure mode: `startNgrok` blocks or
the tunnel dies mid-run, `checkIfServerIsRunning` keeps polling, and the run hangs until someone
runs `pkill -f ngrok`.

## Decisions

**The name.** `local.submit.diyaccounting.co.uk`. A flat record in the apex zone, matching the
existing `ci-billing.submit.diyaccounting.co.uk` precedent.

**Where the record lands.** All DNS for the business sits in one public zone,
`diyaccounting.co.uk`, id `Z0315522208PWZSSBI9AL`, in the management account 887764105431. There
is no delegated `submit.` zone. Every stack in both repos imports that zone with
`HostedZone.fromHostedZoneAttributes` and a literal id, never `fromLookup`.

The record belongs in the root repo's `RootDnsStack`
(`root.diyaccounting.co.uk/infra/main/java/co/uk/diyaccounting/root/stacks/RootDnsStack.java`,
stack id `root-RootDnsStack`), wired from `RootEnvironment.java:117-134` with a default in
`cdk-root/cdk.json`. That stack runs in the account that owns the zone, so it writes the record
directly with no assumed role. It already holds the fixed, environment-independent records for
`www` and `spreadsheets`, and `RootDnsStack.java:171-180` already uses a multi-label relative name
(`ci-holding.spreadsheets`), so `local.submit` needs no new naming machinery.

A submit-repo stack is the wrong home. `SubmitSharedNames.java:440-462` derives every submit FQDN
from `envName` and `deploymentName`, so `local.` has no owner there, and a per-deployment stack
would destroy and recreate a developer-machine record on every CI run.

One gap for whoever implements it. `Route53AliasUpsert`
(`root.diyaccounting.co.uk/infra/main/java/co/uk/diyaccounting/root/utils/Route53AliasUpsert.java:46-60`)
only ever writes an `AliasTarget`. A literal `127.0.0.1` needs a sibling method that puts
`"ResourceRecords": [{"Value": "127.0.0.1"}]` and a `"TTL"` in the record set instead. Write the
sibling rather than reaching for the L2 `route53.ARecord`, because the UPSERT custom resource is
what makes these records survive a record created by hand. Write the A record only. Do not copy
the helper's paired A-and-AAAA shape.

**Certificate issuance.** certbot with the route53 DNS-01 plugin, run on the developer machine:

```bash
certbot certonly --dns-route53 \
  -d local.submit.diyaccounting.co.uk \
  --config-dir "$HOME/.local/share/diyaccounting-local-tls/config" \
  --work-dir   "$HOME/.local/share/diyaccounting-local-tls/work" \
  --logs-dir   "$HOME/.local/share/diyaccounting-local-tls/logs" \
  --non-interactive --agree-tos -m antony@polycode.co.uk
```

Install certbot and the plugin with `pipx install certbot` then
`pipx inject certbot certbot-dns-route53`.

**Certificate home.** Outside the repo, under `$HOME/.local/share/diyaccounting-local-tls/`. The
live paths are:

- `$HOME/.local/share/diyaccounting-local-tls/config/live/local.submit.diyaccounting.co.uk/fullchain.pem`
- `$HOME/.local/share/diyaccounting-local-tls/config/live/local.submit.diyaccounting.co.uk/privkey.pem`

Outside the tree beats a gitignored `.certs/` directory: a private key that never enters a git
working copy cannot be committed by accident, and it survives `mvnw clean` and worktree removal.
Nothing new goes in `.gitignore`.

**Credentials for issuance.** `certbot-dns-route53` needs `route53:ListHostedZones` and
`route53:GetChange` on `*`, plus `route53:ChangeResourceRecordSets` on
`arn:aws:route53:::hostedzone/Z0315522208PWZSSBI9AL`. Route53 cannot scope
`ChangeResourceRecordSets` below the zone, so one zone is the tightest grant available.

The existing `root-route53-record-delegate` role (`RootDnsStack.java:215-230`) grants
`ChangeResourceRecordSets` and `GetHostedZone` on that zone but not `ListHostedZones` or
`GetChange`, so certbot cannot use it. Add a dedicated `root-certbot-dns01` role in `RootDnsStack`
with exactly those three actions, trusted by the operator's SSO identity, and a matching
`certbot-local` profile in `~/.aws/config` with `role_arn` and `source_profile = management`.
`.github/workflows/request-holding-cert.yml:85,118` is the existing precedent in this repo for
scripted validation-record writes against the same zone.

**Renewal.** Let's Encrypt certificates last 90 days and certbot renews inside the last 30.
`certbot renew` with the same three directory flags is a no-op until then, so run it weekly from a
launchd agent on the operator's machine. Wrap issue and renew as `npm run cert:issue` and
`npm run cert:renew` so the flags live in one place.

Renewal has to publish the new certificate to AWS as well as to disk, because CI reads it from
there. Attach a `--deploy-hook` that runs only when a renewal actually happened:

```bash
certbot renew --deploy-hook scripts/local-tls-publish.sh
```

`scripts/local-tls-publish.sh` puts both PEMs into one JSON secret value:

```bash
aws --profile submit-ci secretsmanager put-secret-value \
  --secret-id ci/submit/local-tls/certificate \
  --region eu-west-2 \
  --secret-string "$(jq -n \
     --rawfile c "$RENEWED_LINEAGE/fullchain.pem" \
     --rawfile k "$RENEWED_LINEAGE/privkey.pem" \
     '{fullchain:$c, privkey:$k}')"
```

Nothing local needs restarting after a renewal. The server reads the certificate when the harness
spawns it, and behaviour runs are short.

**Local HTTPS.** Serve TLS natively from `app/bin/server.js`, gated on env vars. Add an
`https.createServer(options, app)` branch beside the existing `app.listen` at line 291: when
`TEST_SERVER_TLS=run`, read `TEST_SERVER_TLS_CERT` and `TEST_SERVER_TLS_KEY` and listen on
`TEST_SERVER_HTTPS_PORT`; otherwise listen on `TEST_SERVER_HTTP_PORT` as now. Throw at startup if
`TEST_SERVER_TLS=run` and either file is missing or unreadable, rather than falling back to HTTP
and failing later at the first navigation.

Native TLS beats a separate local TLS proxy in front. The harness already spawns and kills one
server process, and a second process is another thing that can hang, leak and need `pkill`.
`runLocalSslProxy()` at `behaviour-tests/helpers/behaviour-helpers.js:154` disappears rather than
getting a new body.

**Port.** 3443, because binding 443 needs root on macOS. So
`DIY_SUBMIT_BASE_URL=https://local.submit.diyaccounting.co.uk:3443/`, and every registered
redirect URI carries the port. Step 4 confirms the HMRC Developer Hub accepts a redirect URI
with an explicit port, before anything is deleted. If it refuses, the settled fallback is a
`pfctl` redirect from 443 to 3443 on loopback and the portless URL registered instead. Cognito
and Google need no registration on the critical path (see the Cognito and Google decisions
below), so the hub is the only registrar to check.

**Certificate paths on each machine.** The absolute paths contain `$HOME`, so they go in the
gitignored root `.env`, not in the committed `.env.proxy`. `.env.proxy` carries only
`TEST_SERVER_TLS=run` and `TEST_SERVER_HTTPS_PORT=3443`. This matches the existing split, where
`.env` holds machine-local values and `.env.*` hold shared ones.

**`TEST_PROXY` goes away.** The `testUrl` expression at `submitVat.behaviour.test.js:192-195` and
its 16 siblings collapses to `baseUrl`. Every variant's `DIY_SUBMIT_BASE_URL` already names the
right front door, including `.env.simulator` at `http://localhost:3000/`, so the switch has
nothing left to choose between. Delete `runProxy`, the `ngrokProcess` handles (14 tests) and the
`runLocalSslProxy` calls from all 17 tests.

**Cognito.** `.env.proxy` leaves `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` and `COGNITO_BASE_URI`
blank and runs the mock OAuth2 server, so the proxy variant does not touch real Cognito today.
The callback registration is therefore off the critical path. When the operator wants the proxy
variant on real Cognito, add the URL to `buildCallbackUrls` and `buildLogoutUrls` in
`infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java:307-326`, for the ci
environment only, deployed as `ci-env-IdentityStack`. Prod's user pool client keeps no developer
callback.

**Google.** Cognito owns the `/oauth2/idpresponse` redirect URI that Google is registered against
(`IdentityStack.java:233-244`), so the Google console needs no change while local login goes
through the Cognito hosted UI or the mock provider. It becomes an operator console step only if a
direct browser-to-Google redirect is ever added to the local path.

**CI uses the real certificate.** The opt-in proxy job fetches the same Let's Encrypt certificate
and key from AWS Secrets Manager, so CI validates the chain exactly as a developer's browser does.
No `ignoreHTTPSErrors`, no self-signed material anywhere.

Storage: one JSON secret in submit-ci (367191799875), named `ci/submit/local-tls/certificate`,
holding `{"fullchain": "...", "privkey": "..."}`. ARN:

```
arn:aws:secretsmanager:eu-west-2:367191799875:secret:ci/submit/local-tls/certificate
```

Create it the same way as the other environment secrets, with the
`aws secretsmanager describe-secret || create-secret` pattern at `deploy-environment.yml:178-188`.
The renewal deploy-hook above keeps it current.

The proxy job has no AWS credentials today, so it gains the standard two-step OIDC chain used at
`test.yml:364-384`: `vars.SUBMIT_ACTIONS_ROLE_ARN` with `role-chaining: false`, then
`vars.SUBMIT_DEPLOY_ROLE_ARN` with `role-chaining: true`. `submit-ci-deployment-role` carries
`AdministratorAccess`, so the read works; a narrower read-only role scoped to this one secret is a
sensible follow-up if the operator wants the proxy job off the admin role.

The job then reads the secret and pins the hostname to loopback:

```yaml
      - name: Resolve the local hostname to loopback
        run: echo "127.0.0.1 local.submit.diyaccounting.co.uk" | sudo tee -a /etc/hosts

      - name: Fetch the local TLS certificate
        run: |
          aws secretsmanager get-secret-value \
            --secret-id "$LOCAL_TLS_SECRET_ARN" --region "$AWS_REGION" \
            --query SecretString --output text > "$RUNNER_TEMP/local-tls.json"
          jq -r .fullchain "$RUNNER_TEMP/local-tls.json" > "$RUNNER_TEMP/local-tls.pem"
          jq -r .privkey   "$RUNNER_TEMP/local-tls.json" > "$RUNNER_TEMP/local-tls.key"
          chmod 600 "$RUNNER_TEMP/local-tls.key"
```

The `/etc/hosts` line makes resolution deterministic. Public DNS already answers `127.0.0.1`, but
some resolvers drop loopback answers as DNS rebinding, and a runner that hits one of those would
fail for a reason that has nothing to do with the change. Pinning it removes that whole class.

`NGROK_AUTHTOKEN` leaves and no GitHub secret replaces it.

### The `stripe listen` leg

Replace the inbound tunnel with the Stripe CLI:

```bash
stripe listen --forward-to https://local.submit.diyaccounting.co.uk:3443/api/v1/billing/webhook
```

The CLI holds an outbound connection to Stripe and replays events locally, so nothing reaches the
machine from outside. It prints a per-session `whsec_...` signing secret on startup. The
certificate is publicly valid, so the CLI verifies TLS normally and needs no `--skip-verify`.

**Ordering constraint.** `resolveWebhookSecret()` at
`app/functions/billing/billingWebhookPost.js:39` caches the first secret it reads, and the Express
server runs as a child process spawned by the harness. So `stripe listen` has to start and yield
its secret before `runLocalHttpServer()` spawns the server, not after. Add a `runStripeListen`
helper to `behaviour-helpers.js` that spawns the CLI, parses the `whsec_` from its first lines,
and passes it into the server spawn environment as `STRIPE_TEST_WEBHOOK_SECRET`.

**ZAP runs in Docker,** so `local.submit.diyaccounting.co.uk` inside the container resolves to the
container's own loopback. Add `--add-host local.submit.diyaccounting.co.uk:host-gateway` to the
`docker run` lines at `package.json:229,232`. Keeping the hostname means the certificate name
still matches, which switching the target to `host.docker.internal` would break.

**Coverage.** Real Stripe payloads and real signature verification are preserved, because
`stripe listen` forwards genuine signed events. What is not exercised is a public HTTPS POST
through CloudFront and API Gateway, so a routing fault in front of the webhook would not show up
locally. The `-ci` variant already covers that path.

## Ordered steps

Owner is `sub-agent` or `operator`. Every operator step is a STOP-AND-WAIT gate: the sub-agent
reaching it presents the exact action below, stops, and waits for the operator to confirm it is
done before continuing. Ordering: 1 and 2 can run in parallel; 3 needs 2; 4 needs nothing; 5
needs 3; 6 needs 3; 7 needs 4 and 6; 8 needs 6; 9-12 need 7 and 8 green; the step 11 dispatched
run needs 5.

Nothing gets deleted (steps 9-12) until steps 7 and 8 prove both legs work with the tunnel down.

| # | Step | Owner | Verify |
|---|---|---|---|
| 1 | Add the `local.submit.diyaccounting.co.uk` A record to `127.0.0.1` in the root repo's `RootDnsStack`, with a non-alias UPSERT sibling on `Route53AliasUpsert` (see the record-lands decision above). Open the PR; the operator merges and the root deploy workflow applies it. | sub-agent (root repo, CDK) | `dig +short local.submit.diyaccounting.co.uk` returns `127.0.0.1` |
| 2 | Add the `root-certbot-dns01` IAM role to `RootDnsStack` (three actions listed in the credentials decision above), PR alongside or after step 1. **Approved by the operator on 2026-08-31**, who accepted that Route53 cannot scope `ChangeResourceRecordSets` below zone level. No further permission needed to create it. The operator then adds the `certbot-local` profile to `~/.aws/config` with `role_arn` = the new role and `source_profile = management`. | sub-agent (root repo, CDK); operator adds the profile | `aws --profile certbot-local sts get-caller-identity` shows the `root-certbot-dns01` role |
| 3 | **STOP-AND-WAIT.** Operator installs certbot (`pipx install certbot`, `pipx inject certbot certbot-dns-route53`) and runs the certbot command above with `AWS_PROFILE=certbot-local`. The run writes and deletes a TXT record in the production zone. | operator | Both PEM files exist under `$HOME/.local/share/diyaccounting-local-tls/config/live/local.submit.diyaccounting.co.uk/` |
| 4 | **STOP-AND-WAIT.** Operator registers `https://local.submit.diyaccounting.co.uk:3443/activities/submitVatCallback.html` on the HMRC sandbox application (`HMRC_CLIENT_ID=uqMHA6RsDGGa7h8EG2VqfqAmv4tV`) in the Developer Hub, and confirms the hub accepted the explicit port. If the hub refuses the port, operator adds the `pfctl` 443-to-3443 loopback redirect and registers the portless URL, and the sub-agent drops `:3443` from every URL in later steps. | operator (console) | The sandbox application's redirect URI list shows the new URL |
| 5 | Sub-agent adds `scripts/local-tls-publish.sh` (contents above) to this repo. **STOP-AND-WAIT** for the rest: operator creates the `ci/submit/local-tls/certificate` secret in submit-ci by running the script once with `RENEWED_LINEAGE=$HOME/.local/share/diyaccounting-local-tls/config/live/local.submit.diyaccounting.co.uk` (using `create-secret` on first run, per the `deploy-environment.yml:178-188` pattern), wires `certbot renew --deploy-hook` and the weekly launchd agent on their machine. | sub-agent (script); operator (AWS write + launchd) | `aws --profile submit-ci secretsmanager get-secret-value --secret-id ci/submit/local-tls/certificate --region eu-west-2 --query SecretString --output text \| jq 'keys'` returns `["fullchain","privkey"]` |
| 6 | Add the TLS branch to `app/bin/server.js` (decision above). Add `TEST_SERVER_TLS=run` and `TEST_SERVER_HTTPS_PORT=3443` to `.env.proxy` and `.env.proxyRunning`; the operator adds the two absolute cert paths to the gitignored local `.env`. Point `DIY_SUBMIT_BASE_URL` at `https://local.submit.diyaccounting.co.uk:3443/` in `.env.proxy:12` and `.env.proxyRunning:12`, reword the ngrok description comments at line 4 of both, and drop the two TODO comments at `.env.proxy:18-19`. `.env.proxyRunning` stays: its `useExisting` switches for server, auth and dynamodb are its purpose, and they survive the tunnel. | sub-agent; operator (`.env` lines) | `npm start`, then `curl -sSI https://local.submit.diyaccounting.co.uk:3443/` succeeds with no `-k` |
| 7 | Prove leg 1 with the tunnel down: `pgrep -f ngrok` empty, then run the HMRC-side proxy tests. | sub-agent | `npm run test:submitVatBehaviour-proxy` and `npm run test:postVatReturnFraudPreventionHeadersBehaviour-proxy` green |
| 8 | Prove leg 2: add `runStripeListen` to `behaviour-helpers.js`, spawning before `runLocalHttpServer` (ordering constraint above). Drop the proxy webhook block from `scripts/stripe-setup.js:145-148` and fix the example URL in `scripts/stripe-trigger-lifecycle.sh:15`. | sub-agent | `npm run test:paymentBehaviour-proxy` green; the bundle row gains a real `stripeSubscriptionId` |
| 9 | Delete `app/bin/ngrok.js`, `app/unit-tests/bin/ngrok.test.js`, `runLocalSslProxy`, the `TEST_PROXY` reads (17 tests) and `ngrokProcess` handles (14 tests), the `proxy` npm script at `package.json:172`, the `@ngrok/ngrok` devDependency at `package.json:285`, the ngrok block in `scripts/start-proxy.sh:36`, the `ngrok-skip-browser-warning` header at `behaviour-tests/steps/behaviour-steps.js:17`, and the stale ngrok comments at `app/bin/server.js:77,96,135` and `app/lib/httpServerToLambdaAdaptor.js:24`. | sub-agent | `npm test`; `npm run test:submitVatBehaviour-proxy`; `npm run test:submitVatBehaviour-simulator` |
| 10 | Sweep the hostname out of `.pa11yci.proxy.json` (27 URLs) and `package.json:191-241` (107 occurrences), keeping `https://` and adding `--add-host local.submit.diyaccounting.co.uk:host-gateway` to the two ZAP lines at `package.json:229,232`. Update the hostname test at `web/public/auth/login.html:172-177` to match `local.submit.diyaccounting.co.uk` instead of `ngrok`. | sub-agent | The accessibility, ZAP, pa11y and compliance commands in the final gate |
| 11 | Remove `NGROK_AUTHTOKEN` from `test.yml:47,1123` and `deploy.yml:299`, and reword the "uses ngrok and Docker" input descriptions at `test.yml:22,41` and `deploy.yml:59` and the comments at `test.yml:524,1086`. Add the OIDC chain, the `/etc/hosts` line, the certificate fetch and the `TEST_SERVER_TLS*` env to the proxy job (yaml above). Operator deletes the `NGROK_AUTHTOKEN` GitHub secret from both environments. | sub-agent; operator (GitHub secret) | The dispatched proxy-job run below; a `deploy.yml` run on the branch goes green |
| 12 | Rewrite the prose sites: `_developers/SETUP.md` (prerequisites, steps 3-7, "Run the website locally"); `GITHUB_SETUP.md:82,155`; `RUNBOOK_INFORMATION_SECURITY.md:195`; `CLAUDE.md`; `REPORT_REPOSITORY_CONTENTS.md`; `PASSES.md:322`; `BACKLOG.md`; `.github/copilot-instructions.md:154,215,277`; `.github/agents/behavior-test-master.agent.md:14`; `prompts/behavior-test-master.md:10`; the comments at `.env.simulator:4` and `scripts/start-simulator.sh:6`. Delete `_developers/archive/NGROK_ALTERNATIVES.md`, which this plan supersedes; every other archive file stays as written. Regenerate `repository-contents.txt` with `./scripts/export-files.sh` and `web/public/tests/test-report-web-test-local.json` with `./scripts/publish-web-test-local.sh target/behaviour-test-results/test-report-submitVatBehaviour.json web-test-local` after the step 7 run. | sub-agent | Grep gate below; operator follows the rewritten SETUP.md end to end in a clean shell with `NGROK_AUTHTOKEN` unset |

Two things to watch while verifying, neither of them blocking:

- HMRC sandbox receives `Gov-Client-Public-IP: 203.0.113.1`, the synthetic value from
  `server.js:101`, where ngrok used to supply a real public IP. Nothing sits in front of the local
  server now, so the header stays synthetic. The fraud-prevention headers test is where that
  shows up.
- A second developer needs their own certificate for the same name, which needs Route53 change
  access on the zone. Today that is one person, so the `certbot-local` role covers it.

The ci-environment Cognito callback registration (the Cognito decision above) is not a step here:
the proxy variant runs on the mock OAuth2 server, and the decision paragraph holds the exact
change for whenever the operator asks for real Cognito locally.

## Coverage map

Every inventoried site, the step that removes or repoints it, and the check that proves it.

| Site | Step | Verification |
|---|---|---|
| `app/bin/ngrok.js` | 9 | `npm test`; grep gate |
| `app/unit-tests/bin/ngrok.test.js` | 9 | `npm test` passes with the file gone |
| `runLocalSslProxy` in `behaviour-helpers.js` | 9 | `npm run test:submitVatBehaviour-proxy` |
| `TEST_PROXY` (17 tests) and `ngrokProcess` (14 tests) | 9 | the four proxy runs below, plus `npm run test:submitVatBehaviour-simulator` |
| `ngrok-skip-browser-warning` header at `behaviour-steps.js:17` | 9 | grep gate |
| `.env.proxy` base URL, comments, `TEST_PROXY` | 6 | `npm run test:submitVatBehaviour-proxy` |
| `.env.proxyRunning` base URL and comment | 6 | `npm start`, then `npm run test:submitVatBehaviour-proxyRunning` |
| `.env.simulator:4` and `scripts/start-simulator.sh:6` comments | 12 | grep gate |
| `scripts/start-proxy.sh:36` | 9 | `npm start`, then `curl -sSI https://local.submit.diyaccounting.co.uk:3443/` succeeds with no `-k` |
| `package.json:172` proxy script | 9 | grep gate |
| `@ngrok/ngrok` in `package.json:285` and `package-lock.json` | 9 | `rm -rf node_modules && npm ci` clean; grep gate |
| `scripts/stripe-setup.js:145-148` | 8 | `node scripts/stripe-setup.js`, then `stripe webhookEndpoints list` shows no `*.ngrok-free.app` and the CI and prod endpoints untouched |
| `scripts/stripe-trigger-lifecycle.sh:15` | 8 | grep gate |
| `package.json:191-212` axe, lighthouse, text-spacing | 10 | `npm run accessibility:axe-proxy`, `accessibility:axe-wcag22-proxy`, `accessibility:lighthouse-proxy`, `accessibility:text-spacing-proxy` |
| `package.json:229,232` ZAP baseline | 10 | `npm run penetration:zap-proxy` reaches the site from the container |
| `package.json:241` compliance report | 10 | `npm run compliance:proxy-report-md` |
| `.pa11yci.proxy.json` 27 URLs | 10 | `npx pa11y-ci --config .pa11yci.proxy.json` |
| `web/public/auth/login.html:172-177` | 10 | `npm run test:authBehaviour-proxy`; the mock auth addon loads on the new hostname |
| `test.yml:22,41,47,524,1086,1123` | 11 | the dispatched proxy-job run below; grep gate |
| `deploy.yml:59,299` | 11 | a `deploy.yml` run on the implementation branch goes green; grep gate |
| `app/bin/server.js:77,96,135`, `httpServerToLambdaAdaptor.js:24` comments | 9 | grep gate |
| `_developers/SETUP.md`, `GITHUB_SETUP.md:82,155` | 12 | operator follows the rewritten SETUP.md end to end in a clean shell with `NGROK_AUTHTOKEN` unset |
| `RUNBOOK_INFORMATION_SECURITY.md:195` | 12 | grep gate |
| `CLAUDE.md`, `REPORT_REPOSITORY_CONTENTS.md`, `PASSES.md`, `BACKLOG.md`, copilot and agent prompt files | 12 | grep gate |
| `_developers/archive/` | 12 | `_developers/archive/NGROK_ALTERNATIVES.md` is gone; the other 8 files stay as written, outside the gate |
| `repository-contents.txt`, `web/public/tests/test-report-web-test-local.json` | 12 | regenerated, then grep gate |

### The opt-in CI job needs its own dispatched run

`behaviour-test-proxy-submit-vat` never runs on a normal push, because `runProxyBehaviourTests`
normalises to `false` at `test.yml:171`. A green branch build therefore proves nothing about it.
Before the work is called done, remove `NGROK_AUTHTOKEN` from the GitHub environment and dispatch
the workflow explicitly on the implementation branch:

```bash
gh workflow run test.yml --ref claude/<branch> -f runProxyBehaviourTests=true
gh run watch "$(gh run list --workflow test.yml --branch claude/<branch> --limit 1 --json databaseId --jq '.[0].databaseId')"
```

The `behaviour-test-proxy-submit-vat` job has to go green with no ngrok secret configured. Check
its log for the certificate fetch and the `/etc/hosts` line, and confirm the run never asks for
`NGROK_AUTHTOKEN`.

## Excluded options

- **Named Cloudflare tunnel on a delegated subdomain.** Swaps one account and token for another and
  keeps the shared-hostname collision.
- **cloudflared quick tunnel.** Fresh random URL per run, and the HMRC sandbox holds a fixed
  redirect URI list with no wildcards.
- **Plain `http://localhost:3000` front door.** Drops the front door off HTTPS, changing what the
  accessibility and ZAP runs see.
- **Route the payment leg at the simulator.** Removes real Stripe signature coverage from every
  local run.
- **localtunnel, bore, frp.** Random URLs or a self-hosted relay to run and pay for.

## Final test gate

Run all of it on the implementation branch, with `NGROK_AUTHTOKEN` unset in the shell and removed
from the GitHub environment, and `pgrep -f ngrok` returning nothing.

**a) The named checks.**

```bash
npm test                                          # unit + system, incl. the deleted ngrok test
npm run test:submitVatBehaviour-proxy             # leg 1, real HMRC sandbox over the real cert
npm run test:paymentBehaviour-proxy               # leg 2, real Stripe via stripe listen
npm run test:postVatReturnFraudPreventionHeadersBehaviour-proxy
npm run test:authBehaviour-proxy                  # the login.html hostname test
npm run test:submitVatBehaviour-simulator         # simulator path unaffected
npm run test:submitVatBehaviour-proxyRunning      # with `npm start` already up in another shell
npm run accessibility:axe-proxy
npm run accessibility:axe-wcag22-proxy
npm run accessibility:lighthouse-proxy
npm run accessibility:text-spacing-proxy
npm run penetration:zap-proxy
npm run compliance:proxy-report-md
npx pa11y-ci --config .pa11yci.proxy.json
./mvnw clean verify                               # CDK build
```

Plus the environment checks:

- `dig +short local.submit.diyaccounting.co.uk` returns `127.0.0.1`.
- `curl -sSI https://local.submit.diyaccounting.co.uk:3443/` succeeds with no `-k`.
- `rm -rf node_modules && npm ci` installs clean.
- `stripe webhookEndpoints list` shows no `*.ngrok-free.app` endpoint, with the CI and prod
  endpoints untouched.
- The payment run's bundle row gains a real `stripeSubscriptionId` from a Stripe-signed event, so
  `waitForBundleWebhookActivation` passes on signature verification rather than a mock grant.
- The accessibility and penetration runs report the same findings they report today, with no new
  transport-security entries.
- `gh workflow run test.yml -f runProxyBehaviourTests=true` on the branch goes green, as above.
- A `deploy.yml` run on the branch goes green.

**b) The grep gate.** This exact command returns nothing:

```bash
grep -ri ngrok . \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=target \
  --exclude-dir=public-simulator --exclude-dir=archive \
  --exclude=NEXT.md --exclude=PLAN_REMOVE_NGROK.md
```

`--exclude-dir` matches directory basenames, so `public-simulator` covers
`web/public-simulator` and `archive` covers `_developers/archive` (and `plans/archive`, which is
also archived record). The archive exclusion is settled. The operator chose (2026-08-31) to keep
the ngrok mentions in `_developers/archive/` as written, because they are dated evidence,
including the HMRC questionnaire traceability table. Only `NGROK_ALTERNATIVES.md` is deleted, in
step 12.
