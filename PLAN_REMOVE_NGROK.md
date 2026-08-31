# Remove ngrok from the proxy test path

> Plan only. No code changes until the operator says go.

## Requirement

Backlog row 44, verbatim:

> Replace ngrok in the proxy test path: `start-proxy.sh`, `stripe-setup.js`, the Stripe webhook
> route and `test.yml` all assume an ngrok tunnel with an account token, a paid external
> dependency and a recurring source of stuck local runs. Swap for cloudflared or an
> unauthenticated tunnel, or route webhooks at the simulator so no tunnel is needed.

## Where ngrok is assumed today

| File | What it assumes |
|---|---|
| `app/bin/ngrok.js` | Starts the tunnel through `@ngrok/ngrok` with `authtoken_from_env: true`. Reads `NGROK_DOMAIN`, else derives the domain from `DIY_SUBMIT_BASE_URL`. |
| `behaviour-tests/helpers/behaviour-helpers.js:154` | `runLocalSslProxy()` imports `startNgrok` and runs it when `TEST_PROXY=run`. Called from every behaviour test's `beforeAll`. |
| All 17 behaviour tests | Read `TEST_PROXY`, hold an `ngrokProcess` handle, and pick `testUrl = baseUrl` (the tunnel) instead of `http://127.0.0.1:3000/` when the proxy is running. |
| `.env.proxy:12` and `.env.proxyRunning:12` | `DIY_SUBMIT_BASE_URL=https://wanted-finally-anteater.ngrok-free.app/`. `.env.proxy` also sets `TEST_PROXY=run`; `.env.proxyRunning` expects a tunnel already up. |
| `scripts/start-proxy.sh:36` | Starts `npm run proxy -- 3000` as a background job alongside dynalite, mock-oauth2 and the server. |
| `package.json:172` | `"proxy": "npx dotenv -e .env.proxy -- node app/bin/ngrok.js"`. |
| `package.json:285` | `@ngrok/ngrok` as a devDependency. |
| `scripts/stripe-setup.js:146` | Registers a Stripe webhook endpoint at the hardcoded `https://wanted-finally-anteater.ngrok-free.app/api/v1/billing/webhook`. |
| `scripts/stripe-trigger-lifecycle.sh:15` | Comment gives the ngrok URL as the example webhook endpoint. |
| `package.json` accessibility and penetration scripts | `axe`, `lighthouse`, `text-spacing-test.js`, ZAP baseline and `.pa11yci.proxy.json` all hardcode the ngrok hostname (about 30 URLs across `package.json:191-241` and 26 entries in `.pa11yci.proxy.json`). |
| `web/public/auth/login.html:172-177` | Loads the mock auth addon only when the hostname is localhost, 127.0.0.1 or contains `ngrok`. |
| `.github/workflows/test.yml` | `NGROK_AUTHTOKEN` declared as a `workflow_call` secret (line 47) and passed to the one proxy job (line 1123). |
| `.github/workflows/deploy.yml:299` | Forwards `secrets.NGROK_AUTHTOKEN` into `test.yml`. |
| `app/unit-tests/bin/ngrok.test.js` | Unit test over `extractDomainFromUrl` and `startNgrok`. |
| `_developers/SETUP.md` steps 1, 3, 4, 5, 6 and `GITHUB_SETUP.md:155` | Tell a new developer to get an ngrok authtoken and reserve a subdomain. |
| `app/bin/server.js:96`, `app/lib/httpServerToLambdaAdaptor.js:24` | Comments only. Both already handle the no-tunnel case. |

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
`app/bin/server.js:99` already injects a synthetic `X-Forwarded-For` of `203.0.113.1` and a
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

One job: `behaviour-test-proxy-submit-vat` in `test.yml` (line 1088). It is gated on
`runProxyBehaviourTests == 'true'`, which defaults to `'false'` in both `test.yml` and
`deploy.yml`, so it runs only when someone opts in. It gets `NGROK_AUTHTOKEN` from the GitHub
environment and runs `npm run test:submitVatBehaviour-proxy`.

Two consequences. First, CI's ngrok usage is one opt-in job, so the CI blast radius of any change
is small. Second, that job needs only leg 1: `submitVat.behaviour.test.js` runs with
`TEST_BUNDLE_MOCK=true` and never touches Stripe. CI never runs the proxy payment test at all;
`behaviour-test-simulator-payment` covers payment in CI, and real Stripe webhook coverage lives in
the `-ci` variant against the deployed environment.

Both the local and CI runs share the ngrok reserved domain, so a local run and a CI run at the
same time fight over one connection. That is the stuck-run failure mode: `startNgrok` blocks or
the tunnel dies mid-run, `checkIfServerIsRunning` keeps polling, and the run hangs until someone
runs `pkill -f ngrok`.

## The chosen path: DNS to localhost with a real certificate, plus `stripe listen`

Keep a stable public hostname, drop the tunnel under it.

A public A record `local.submit.diyaccounting.co.uk` points at `127.0.0.1`. Every machine that
resolves that name reaches its own loopback. A Let's Encrypt certificate for the same name is
issued over DNS-01, which validates by writing a TXT record in our own zone and never contacts the
A record. The local Express server terminates TLS with that certificate, so the browser sees a
valid `https://` origin on a hostname HMRC, Cognito and Google can all have registered. Stripe
webhooks arrive through `stripe listen`, an outbound connection that replays genuine signed
events.

What this buys over the tunnel:

- No account, no token, no paid dependency. Issuance uses our own Route53 zone.
- No shared connection, so a local run and a CI run never collide. Each resolves the name to its
  own loopback.
- The front door stays HTTPS with a valid certificate, so the accessibility and penetration runs
  keep testing what they test today. HSTS and secure-cookie findings do not change.
- Nothing listens on the public internet. The name resolves to loopback everywhere, so there is
  no exposed surface to secure.

### Decisions settled

**The name.** `local.submit.diyaccounting.co.uk`. It is a flat record in the apex zone, matching
the existing `ci-billing.submit.diyaccounting.co.uk` precedent, and it reads as what it is.

**Where the record lands.** All DNS for the business sits in one public zone,
`diyaccounting.co.uk`, id `Z0315522208PWZSSBI9AL`, in the management account 887764105431. There
is no delegated `submit.` zone. Every stack in both repos imports that zone with
`HostedZone.fromHostedZoneAttributes` and a literal id, never `fromLookup`.

The record belongs in the root repo's `RootDnsStack`
(`root.diyaccounting.co.uk/infra/main/java/co/uk/diyaccounting/root/stacks/RootDnsStack.java`,
stack id `root-RootDnsStack`), wired from `RootEnvironment.java:117-134` with a default in
`cdk-root/cdk.json`. That stack runs in the account that owns the zone, so it writes the record
directly with no assumed role. It already holds the fixed, environment-independent records for
`www` and `spreadsheets`, and `RootDnsStack.java:171-180` already uses a multi-label relative
name (`ci-holding.spreadsheets`), so `local.submit` needs no new naming machinery.

A submit-repo stack is the wrong home. `SubmitSharedNames.java:440-462` derives every submit FQDN
from `envName` and `deploymentName`, so `local.` has no natural owner there, and a per-deployment
stack would destroy and recreate a developer-machine record on every CI run.

One gap for whoever implements it. `Route53AliasUpsert` only ever writes an `AliasTarget`
(`Route53AliasUpsert.java:47-55`). A literal `127.0.0.1` needs a sibling method that puts
`"ResourceRecords": [{"Value": "127.0.0.1"}]` and a `"TTL"` in the record set instead. Write the
sibling rather than reaching for the L2 `route53.ARecord`, because the UPSERT custom resource is
what makes these records survive a record created by hand. Write the A record only. Do not copy
the helper's paired A-and-AAAA shape.

Fallback if the CDK route stalls: a direct
`aws --profile management route53 change-resource-record-sets` UPSERT. **NEEDS-APPROVAL** as a
direct AWS write, and it leaves the zone drifted from code, so treat it as temporary.

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

**Certificate home.** Outside the repo, under
`$HOME/.local/share/diyaccounting-local-tls/`. The live paths are:

- `$HOME/.local/share/diyaccounting-local-tls/config/live/local.submit.diyaccounting.co.uk/fullchain.pem`
- `$HOME/.local/share/diyaccounting-local-tls/config/live/local.submit.diyaccounting.co.uk/privkey.pem`

Outside the tree beats a gitignored `.certs/` directory: a private key that never enters a git
working copy cannot be committed by accident, and it survives `mvnw clean` and worktree removal.
Nothing new goes in `.gitignore`.

**Credentials for issuance.** `certbot-dns-route53` needs `route53:ListHostedZones` and
`route53:GetChange` on `*`, plus `route53:ChangeResourceRecordSets` on
`arn:aws:route53:::hostedzone/Z0315522208PWZSSBI9AL`. Route53 cannot scope
`ChangeResourceRecordSets` below the zone, so one zone is the tightest grant available.

The existing `root-route53-record-delegate` role
(`RootDnsStack.java:215-230`) grants `ChangeResourceRecordSets` and `GetHostedZone` on that zone
but not `ListHostedZones` or `GetChange`, so certbot cannot use it. Add a dedicated role, say
`root-certbot-dns01`, in `RootDnsStack` with exactly those three actions, trusted by the
operator's SSO identity, and a matching `certbot-local` profile in `~/.aws/config` with `role_arn`
and `source_profile = management`. **NEEDS-APPROVAL**, because it is an IAM write.

For the first issuance, before that role exists, run certbot with `AWS_PROFILE=management`.
**NEEDS-APPROVAL**, because certbot writes and deletes a TXT record in the production zone.

`.github/workflows/request-holding-cert.yml:85,118` is the existing precedent in this repo for
scripted validation-record writes against the same zone.

**Renewal.** Let's Encrypt certificates last 90 days and certbot renews inside the last 30.
`certbot renew` with the same three directory flags is a no-op until then, so run it weekly. Wrap
both commands as `npm run cert:issue` and `npm run cert:renew` so the flags live in one place, and
drive the renewal from a launchd agent on the operator's machine. Nothing needs restarting after a
renewal: the server reads the certificate when the harness spawns it, and behaviour runs are
short.

**Local HTTPS.** Serve TLS natively from `app/bin/server.js`, gated on env vars. Add an
`https.createServer(options, app)` branch beside the existing `app.listen` at line 291: when
`TEST_SERVER_TLS=run`, read `TEST_SERVER_TLS_CERT` and `TEST_SERVER_TLS_KEY` and listen on
`TEST_SERVER_HTTPS_PORT`; otherwise listen on `TEST_SERVER_HTTP_PORT` as now. Throw at startup if
`TEST_SERVER_TLS=run` and either file is missing or unreadable, rather than falling back to HTTP
and failing later at the first navigation.

Native TLS beats a separate local TLS proxy in front. The harness already spawns and kills one
server process. A second process is the same shape as the thing being deleted: another thing that
can hang, leak and need `pkill`. `runLocalSslProxy()` at
`behaviour-tests/helpers/behaviour-helpers.js:154` disappears rather than getting a new body.

**Port.** 3443, because binding 443 needs root on macOS. So
`DIY_SUBMIT_BASE_URL=https://local.submit.diyaccounting.co.uk:3443/`, and every registered
redirect URI carries the port. Open question to settle in step 4, before anything is deleted:
whether the HMRC Developer Hub, Cognito and Google all accept a redirect URI with an explicit
port. If one refuses, add a `pfctl` redirect from 443 to 3443 on loopback and register the
portless URL instead.

**Path of the certificate on each machine.** The absolute paths contain `$HOME`, so they go in the
gitignored root `.env`, not in the committed `.env.proxy`. `.env.proxy` carries only
`TEST_SERVER_TLS=run` and `TEST_SERVER_HTTPS_PORT=3443`. This matches the existing split, where
`.env` holds the machine-local values and `.env.*` hold the shared ones.

**`TEST_PROXY` goes away.** The `testUrl` expression at `submitVat.behaviour.test.js:193` and its
16 siblings collapses to `baseUrl`. Every variant's `DIY_SUBMIT_BASE_URL` already names the right
front door, including `.env.simulator` at `http://localhost:3000/`, so the switch has nothing left
to choose between. Delete `runProxy`, the `ngrokProcess` handles and the `runLocalSslProxy` calls
from all 17 tests.

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

**CI.** The opt-in proxy job stays, and it needs no secret at all. Its only TLS client is
Playwright, so the job generates a throwaway self-signed certificate for the same hostname at the
start of the run:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -subj "/CN=local.submit.diyaccounting.co.uk" \
  -addext "subjectAltName=DNS:local.submit.diyaccounting.co.uk" \
  -keyout "$RUNNER_TEMP/local-tls.key" -out "$RUNNER_TEMP/local-tls.pem"
```

Point the TLS env vars at those two files and set `ignoreHTTPSErrors: true` in the Playwright
`use` block at `playwright.config.js:184`, gated on a new `TEST_TLS_IGNORE_ERRORS` env var so
local runs keep verifying the real certificate. The runner resolves the hostname to 127.0.0.1
from public DNS exactly as a developer machine does. `NGROK_AUTHTOKEN` leaves with nothing taking
its place. The job still validates the OAuth journey, which is what it is for; it stops validating
the certificate, which the `-ci` variant covers against the deployed environment.

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

Step 4 is the gate. Nothing gets deleted until steps 1 to 6 prove the new front door works.

| # | Step | Owner |
|---|---|---|
| 1 | Add the `local.submit.diyaccounting.co.uk` A record to `127.0.0.1` in the root repo's `RootDnsStack`, with a non-alias UPSERT sibling on `Route53AliasUpsert`. PR, merge, deploy. Verify with `dig`. | root repo, CDK |
| 2 | Add the `root-certbot-dns01` IAM role to `RootDnsStack` and a `certbot-local` profile in `~/.aws/config`. **NEEDS-APPROVAL** (IAM write). | root repo, CDK + operator |
| 3 | Issue the certificate with the certbot command above. **NEEDS-APPROVAL** (TXT write in the production zone). Add `cert:issue` and `cert:renew` npm scripts and the launchd renewal agent. | operator |
| 4 | Register `https://local.submit.diyaccounting.co.uk:3443/activities/submitVatCallback.html` on the HMRC sandbox application in the Developer Hub. Confirm the hub accepts the explicit port. If it refuses, add the `pfctl` 443-to-3443 redirect and register the portless URL. | operator, console |
| 5 | Add the TLS branch to `app/bin/server.js`, the `TEST_SERVER_TLS*` vars to `.env.proxy` and the two absolute cert paths to the local `.env`. Point `DIY_SUBMIT_BASE_URL` at the new URL in `.env.proxy` and `.env.proxyRunning`. | this repo |
| 6 | Run `npm run test:submitVatBehaviour-proxy`, `npm run test:paymentBehaviour-proxy` and `npm run test:postVatReturnFraudPreventionHeadersBehaviour-proxy` green with the tunnel down. This proves both legs before any deletion. | this repo |
| 7 | Add `runStripeListen` to `behaviour-helpers.js`, spawning before `runLocalHttpServer`. Drop the proxy webhook block from `scripts/stripe-setup.js:146` and fix the example URL comment in `scripts/stripe-trigger-lifecycle.sh:15`. | this repo |
| 8 | Delete `app/bin/ngrok.js`, `app/unit-tests/bin/ngrok.test.js`, `runLocalSslProxy`, the `TEST_PROXY` reads and `ngrokProcess` handles across the 17 behaviour tests, the `proxy` npm script, the `@ngrok/ngrok` devDependency, and the ngrok block in `scripts/start-proxy.sh:36`. | this repo |
| 9 | Sweep the hostname out of `.pa11yci.proxy.json` and `package.json:191-241`, keeping `https://` and adding `--add-host` to the two ZAP lines. Update the hostname test at `web/public/auth/login.html:172-177`. | this repo |
| 10 | Remove `NGROK_AUTHTOKEN` from `test.yml:47`, `test.yml:1123` and `deploy.yml:299`. Add the self-signed certificate step and `TEST_TLS_IGNORE_ERRORS` to the proxy job, and the gated `ignoreHTTPSErrors` to `playwright.config.js:184`. | this repo |
| 11 | Rewrite `_developers/SETUP.md` steps 1, 3, 4, 5 and 6, the ngrok line in `GITHUB_SETUP.md:155`, the environments table and Stripe webhook line in `CLAUDE.md`, and `REPORT_REPOSITORY_CONTENTS.md`. | this repo |
| 12 | Decide whether `.env.proxyRunning` survives. Its only difference from `.env.proxy` was that a tunnel was already up. With no tunnel it duplicates `.env.proxy` apart from the `run` and `useExisting` switches for the server, auth and dynamodb. Keep it only if that workflow is still used. | operator |
| 13 | Add the local callback URL to `IdentityStack.buildCallbackUrls` and `buildLogoutUrls` for the ci environment. Only needed if the operator wants the proxy variant on real Cognito instead of the mock OAuth2 server. | this repo, CDK |

Two things to watch while verifying, neither of them blocking:

- HMRC sandbox receives `Gov-Client-Public-IP: 203.0.113.1`, the synthetic value from
  `server.js:99`, where ngrok used to supply a real public IP. Nothing sits in front of the local
  server now, so the header stays synthetic. The fraud-prevention headers test is where that
  shows up.
- A second developer needs their own certificate for the same name, which needs Route53 change
  access on the zone. Today that is one person, so the `certbot-local` role covers it.

## Options considered

Kept short, for the record of why this path won.

- **Named Cloudflare tunnel on a delegated subdomain.** Works for both legs, but swaps one account
  and token for another, adds an NS delegation out of Route53, and keeps the shared-hostname
  collision that causes the stuck runs.
- **cloudflared quick tunnel.** Fresh random URL per run, and the HMRC sandbox application holds a
  fixed redirect URI list with no wildcards, so leg 1 cannot work.
- **Plain `http://localhost:3000` front door plus `stripe listen`.** No tunnel and no certificate,
  but the front door stops being HTTPS, which changes what the accessibility and ZAP runs see, and
  it depends on every provider accepting a plain-HTTP localhost redirect.
- **Route the payment leg at the simulator.** Removes real Stripe signature coverage from every
  local run and leaves it only in the `-ci` variant.
- **localtunnel, bore, frp.** Random URLs or a relay to run and pay for, so the same wall as the
  quick tunnel with worse reliability.

## Verification criteria

The change is done when all of these pass with `NGROK_AUTHTOKEN` unset and no tunnel process
running:

```bash
npm test                                          # unit + system, incl. the deleted ngrok test
npm run test:submitVatBehaviour-proxy             # leg 1, real HMRC sandbox over the real cert
npm run test:paymentBehaviour-proxy               # leg 2, real Stripe via stripe listen
npm run test:postVatReturnFraudPreventionHeadersBehaviour-proxy
npm run test:submitVatBehaviour-simulator         # simulator path unaffected
./mvnw clean verify                               # CDK build
```

Plus:

- `dig +short local.submit.diyaccounting.co.uk` returns `127.0.0.1`.
- `curl -sSI https://local.submit.diyaccounting.co.uk:3443/` succeeds with no `-k`, proving the
  certificate chain validates.
- `grep -ri ngrok` over the repo, excluding `node_modules/`, `target/` and
  `web/public-simulator/`, returns nothing outside `git log`.
- `test.yml` run with `runProxyBehaviourTests: true` goes green with no `NGROK_AUTHTOKEN` secret
  configured and no secret replacing it.
- `stripe webhookEndpoints list` shows no `*.ngrok-free.app` endpoint, and the CI and prod
  endpoints are untouched.
- The payment run's bundle row gains a real `stripeSubscriptionId` from a Stripe-signed event, so
  `waitForBundleWebhookActivation` passes on signature verification rather than a mock grant.
- `npm run accessibility:axe-proxy` and `npm run penetration:zap-proxy` report the same findings
  they report today, with no new transport-security entries.
