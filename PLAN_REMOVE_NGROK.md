# Remove ngrok from the proxy test path

> Design options. No code changes yet.

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
| `package.json` accessibility and penetration scripts | `axe`, `lighthouse`, `text-spacing-test.js`, ZAP baseline and `.pa11yci.proxy.json` all hardcode the ngrok hostname (about 30 URLs). |
| `.github/workflows/test.yml` | `NGROK_AUTHTOKEN` declared as a `workflow_call` secret (line 47) and passed to the one proxy job (line 1123). |
| `.github/workflows/deploy.yml:299` | Forwards `secrets.NGROK_AUTHTOKEN` into `test.yml`. |
| `app/unit-tests/bin/ngrok.test.js` | Unit test over `extractDomainFromUrl` and `startNgrok`. |
| `_developers/SETUP.md` steps 3 to 6, `GITHUB_SETUP.md:155` | Tell a new developer to get an ngrok authtoken and reserve a subdomain. |
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

## Options

### Option A: named Cloudflare tunnel on a delegated subdomain

Run `cloudflared` against a named tunnel bound to a hostname the company controls, for example
`proxy.diyaccounting.co.uk`. Stable URL, so both legs keep working exactly as now.

- **Files:** `app/bin/ngrok.js` becomes `app/bin/tunnel.js` wrapping the `cloudflared` binary;
  `behaviour-helpers.js:154`; the base URL in `.env.proxy` and `.env.proxyRunning`; the hardcoded
  host in `stripe-setup.js` and the roughly 30 accessibility and penetration URLs; `start-proxy.sh`;
  `package.json` scripts and the `@ngrok/ngrok` devDependency; `test.yml` and `deploy.yml` secrets;
  `SETUP.md`.
- **Secrets and dependencies:** `NGROK_AUTHTOKEN` goes. A Cloudflare account and a tunnel
  credential file arrive, so a GitHub secret is still needed for CI, and `cloudflared` has to be
  installed locally and in the workflow. Named tunnels need the zone in Cloudflare, so a subdomain
  has to be delegated from Route53 by NS record.
- **Stuck runs:** same shape as today. One named hostname is still one connection, so concurrent
  local and CI runs still collide.
- **CI:** swap the secret, add a `cloudflared` install step.
- **Coverage:** unchanged.
- **Effort:** M. Most of it is DNS delegation and the URL sweep.

### Option B: cloudflared quick tunnel (unauthenticated, random URL per run)

`cloudflared tunnel --url http://localhost:3000` needs no account and no token, and prints a fresh
`*.trycloudflare.com` URL each run.

The random URL breaks leg 1 outright. The HMRC sandbox application holds a fixed list of redirect
URIs and does not accept wildcards, so a URL that changes every run cannot be pre-registered, and
`submitFormVat()` fails at the HMRC grant page.

For leg 2 it works but costs churn. `stripe-setup.js` would stop being the place the proxy webhook
is registered. The payment test would have to create a `webhookEndpoint` against the run's URL,
read `webhook.secret` from the create response, pass it to the server as
`STRIPE_TEST_WEBHOOK_SECRET`, and delete the endpoint in `afterAll`. Stripe caps webhook endpoints
per account, so a crashed run that skips cleanup leaves litter that someone has to sweep.

- **Effort:** S for the webhook leg alone, but it does not solve the leg that actually blocks CI.
- **Verdict:** not viable on its own. Listed because it is the obvious reading of the backlog row.

### Option C: localhost front door plus `stripe listen`

Split the problem and answer each leg separately.

*Leg 1.* Register `http://localhost:3000/activities/submitVatCallback.html` (and the Cognito and
mock callbacks) as redirect URIs on the HMRC sandbox application, then set
`DIY_SUBMIT_BASE_URL=http://localhost:3000/` and `TEST_PROXY=off` in `.env.proxy`. The existing
`runProxy !== "run"` branch in every behaviour test already routes the browser to
`http://127.0.0.1:3000/`, so no test logic changes. `.env.proxy` then differs from `.env.simulator`
only in what it points at: real HMRC sandbox and real Stripe instead of the local HTTP simulator.

*Leg 2.* Replace the inbound tunnel with the Stripe CLI:
`stripe listen --forward-to http://localhost:3000/api/v1/billing/webhook`. The CLI holds an
outbound connection to Stripe and replays events locally, so nothing has to reach the machine. It
prints a per-session signing secret on startup.

- **Files:** delete `app/bin/ngrok.js` and `app/unit-tests/bin/ngrok.test.js`; drop
  `runLocalSslProxy` from `behaviour-helpers.js` and its call sites in all 17 behaviour tests;
  add a `runStripeListen` helper that spawns the CLI, parses the `whsec_...` from its first lines,
  and hands it to the server spawn as `STRIPE_TEST_WEBHOOK_SECRET`; `.env.proxy` and
  `.env.proxyRunning`; `start-proxy.sh`; the `proxy` script and `@ngrok/ngrok` in `package.json`;
  the proxy webhook block in `stripe-setup.js`; the hardcoded URLs in the accessibility and
  penetration scripts and `.pa11yci.proxy.json`; `test.yml` and `deploy.yml`; `SETUP.md` and
  `GITHUB_SETUP.md`.
- **Ordering constraint:** `resolveWebhookSecret()` caches the first secret it reads, and the
  Express server runs as a child process spawned by the harness. So `stripe listen` has to start
  and yield its secret before `runLocalHttpServer()` spawns the server, not after.
- **Secrets and dependencies:** `NGROK_AUTHTOKEN` goes, from the developer's shell, from
  `SETUP.md`, and from both workflows. Nothing new for leg 1. Leg 2 needs the `stripe` CLI binary
  and a test-mode Stripe key, and the payment test already requires that key
  (`payment.behaviour.test.js:583`).
- **Stuck runs:** the whole class goes away for leg 1. No shared hostname, so concurrent local and
  CI runs stop colliding, and a failure is a local port bind rather than a hang on a remote
  handshake. Leg 2 becomes a child process the harness owns and can kill.
- **CI:** the proxy job loses its `NGROK_AUTHTOKEN` and needs no replacement, because
  `submitVatBehaviour` never touches Stripe. The `stripe listen` step is needed only if the proxy
  payment test is ever added to CI.
- **Coverage:** unchanged for HMRC. Real Stripe signature verification is preserved, because
  `stripe listen` forwards genuine signed payloads. What is lost is that the events arrive over the
  CLI's connection rather than a public HTTPS POST, so a CloudFront or API Gateway routing fault
  in front of the webhook would not show up. The `-ci` variant already covers that path.
- **Detail worth pricing in:** the accessibility and penetration scripts move to
  `http://127.0.0.1:3000`, and the ZAP baseline runs inside Docker, so it needs
  `host.docker.internal:3000`. Pa11y, axe and Lighthouse against plain HTTP will report the
  missing HSTS and secure-cookie findings that TLS termination used to hide.
- **Effort:** M. The behaviour-test sweep is mechanical, the HMRC hub registration is the gate.

### Option D: route the payment leg at the simulator

Leave the Stripe price IDs blank in `.env.proxy` so the guard at `app/bin/server.js:210` registers
`mockBilling.js`, and the proxy payment run gets the same auto-completing local checkout the
simulator run gets. `app/lib/stripeClient.js:50` already honours a `STRIPE_API_BASE_URL` override,
so a richer version could point the Stripe SDK at the local HTTP simulator and have it emit signed
webhook events.

- **Files:** two lines in `.env.proxy` for the cheap version. The richer version adds Stripe routes
  and a signing-secret scenario under `app/http-simulator/routes/`.
- **Secrets and dependencies:** no Stripe key needed locally at all.
- **Stuck runs:** removes the tunnel from the payment path only. Leg 1 still needs an answer, so
  this is a companion to A or C, never a whole solution.
- **CI:** no change, CI already runs payment in simulator mode.
- **Coverage:** this is the real cost. The proxy payment test exists to catch webhook signature
  failures against real Stripe payloads, and the test says so at
  `payment.behaviour.test.js:368`. Simulating it means no local run exercises real Stripe, and the
  only real-Stripe webhook coverage left is `test:paymentBehaviour-ci` against the deployed
  environment. That is a defensible trade if the operator accepts moving that check to CI.
- **Effort:** S for the cheap version, M for a Stripe-emitting simulator.

### Option E: other unauthenticated tunnels

`localtunnel` and similar give a random public URL with no account. They hit exactly the same
wall as Option B on leg 1, and they add a reliability problem rather than removing one: the free
shared servers drop connections and rate-limit, which is the failure mode the row is trying to
delete. `bore` and `frp` are self-hosted, which means running and paying for the relay, so they
land near Option A's cost without its stability. Not recommended.

## Recommendation

Take Option C, and hold Option A as the fallback for leg 1.

The reasoning is that leg 1 does not need a tunnel at all. The HMRC redirect targets the local
browser, and the only thing forcing a public hostname is which redirect URI is registered against
the sandbox application. Registering a localhost URI turns the whole proxy front door into
`http://127.0.0.1:3000`, which is the branch every behaviour test already has and the simulator
variant already exercises daily in CI. That deletes the token, the paid account, the shared-domain
collision, and the hardest failure mode in one move.

Leg 2 then costs one helper. `stripe listen` keeps real Stripe payloads and real signature
verification, so no coverage moves to CI, and the CLI is a child process the harness can kill.

Do it in this order, because step 1 is the gate:

1. Register `http://localhost:3000/activities/submitVatCallback.html` and the Cognito and mock
   callback paths on the HMRC sandbox application in the Developer Hub. Confirm the hub accepts a
   plain-HTTP localhost URI for a sandbox app. If it refuses, stop and switch leg 1 to Option A,
   because everything below assumes a localhost front door.
2. Point `.env.proxy` and `.env.proxyRunning` at `http://localhost:3000/` and set `TEST_PROXY=off`.
   Run `npm run test:submitVatBehaviour-proxy`. This proves leg 1 before any code is deleted.
3. Delete `app/bin/ngrok.js`, its unit test, `runLocalSslProxy`, the `TEST_PROXY` reads and
   `ngrokProcess` handles across the 17 behaviour tests, the `proxy` npm script, the
   `@ngrok/ngrok` devDependency, and the ngrok line in `start-proxy.sh`.
4. Add `runStripeListen` to `behaviour-helpers.js`, spawning before `runLocalHttpServer` so the
   parsed `whsec_` reaches the server's environment. Drop the proxy webhook block from
   `stripe-setup.js`, leaving the CI and prod endpoints.
5. Sweep the hardcoded hostname out of `.pa11yci.proxy.json` and the accessibility and penetration
   scripts, using `host.docker.internal:3000` for the ZAP container.
6. Remove `NGROK_AUTHTOKEN` from `test.yml` and `deploy.yml`, and rewrite steps 3 to 6 of
   `_developers/SETUP.md` and the ngrok line in `GITHUB_SETUP.md`.

Whether `.env.proxyRunning` survives is worth deciding in step 2. Its only distinction from
`.env.proxy` is that a tunnel is already up, which stops meaning anything once there is no tunnel.

Two things to watch while verifying, neither of them blocking:

- Real HMRC sandbox will now receive `Gov-Client-Public-IP: 203.0.113.1`, the synthetic value from
  `server.js:99`, where ngrok used to supply a real public IP. The fraud-prevention headers test
  is where that shows up.
- Pa11y, axe and Lighthouse over plain HTTP will surface transport-security findings that TLS
  termination previously masked.

## Verification criteria

The change is done when all of these pass with `NGROK_AUTHTOKEN` unset and no tunnel process
running:

```bash
npm test                                          # unit + system, incl. the deleted ngrok test
npm run test:submitVatBehaviour-proxy             # leg 1, real HMRC sandbox
npm run test:paymentBehaviour-proxy               # leg 2, real Stripe via stripe listen
npm run test:postVatReturnFraudPreventionHeadersBehaviour-proxy
npm run test:submitVatBehaviour-simulator         # simulator path unaffected
./mvnw clean verify                               # CDK build
```

Plus:

- `grep -ri ngrok` over the repo, excluding `node_modules/`, `target/` and
  `web/public-simulator/`, returns nothing outside `git log`.
- `test.yml` run with `runProxyBehaviourTests: true` goes green with no `NGROK_AUTHTOKEN` secret
  configured.
- `stripe webhookEndpoints list` shows no `*.ngrok-free.app` endpoint, and the CI and prod
  endpoints are untouched.
- The payment run's bundle row gains a real `stripeSubscriptionId` from a Stripe-signed event, so
  `waitForBundleWebhookActivation` passes on signature verification rather than a mock grant.
