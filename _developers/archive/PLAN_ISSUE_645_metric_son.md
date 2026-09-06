# PLAN: Issue #645 — metric-son

> Source issue: https://github.com/antonycc/submit.diyaccounting.co.uk/issues/645
> Original body: (empty)
> Existing plans:
> - `_developers/backlog/METRIC_SON_DESIGN.md` (251 lines — design)
> - `_developers/backlog/metric-son/DESIGN.md` (251 lines — may be the same)
> - `_developers/backlog/metric-son/README.md` (191 lines — usage)
> - `_developers/backlog/metric-son/metric-son.js` + `metric-son.browser.js` — prototype code
> - `_developers/backlog/metric-son/demo.html`
> - `_developers/backlog/metric-son/package.json`

## Elaboration

`metric-son` is a home-grown client-side telemetry library (working title — derived from "telemetry-son"/"metric-son"?) that appears to be a RUM/metrics library alternative to AWS CloudWatch RUM. Based on `DESIGN.md` in the backlog (251 lines), it's a custom lightweight metrics emitter shipping from the browser to a Lambda that forwards into CloudWatch Metrics. The files in `_developers/backlog/metric-son/` are a standalone package-style prototype.

Why build this instead of keeping CloudWatch RUM?
- CloudWatch RUM is expensive at DIY Accounting's volume and logs a lot of data you don't want.
- A purpose-built emitter can ship only the metrics that matter (VAT submission funnel, pass redemption funnel, payment cancellation reasons).
- Open-source it as a standalone package (the README + LICENSE pattern in `battery-pack/` suggests the same productisation approach — see #646).

## Likely source files to change

- Promote `_developers/backlog/metric-son/` → `packages/metric-son/` (follow the package pattern in the repo — `package.json` confirms `packages/` exists per recon).
- New `app/functions/ops/metricSonIngest.js` — API Gateway Lambda that receives beacon payloads (`POST /api/v1/metrics/beacon`), validates, fans out to CloudWatch Metrics via PutMetricData in batches of 1000, and to the activity EventBridge bus for alarmable patterns.
- `infra/main/java/.../stacks/OpsStack.java` — register the Lambda + API Gateway route.
- `web/public/widgets/metric-son-bootstrap.js` — new widget that loads the library and auto-instruments common events (pageview, auth flow milestones, API error count).
- `web/public/*.html` — include the bootstrap widget script.
- `web/public/submit.catalogue.toml` — no change (metric-son is orthogonal to activities).

## Likely tests to change/add

- Port the prototype's internal tests into Vitest under `packages/metric-son/tests/` (if they exist).
- Unit test for `metricSonIngest.js` — payload validation, rate-limiting, batch PutMetricData.
- Behaviour test: assert the beacon fires on VAT submission completion and produces a CloudWatch metric (sampled via `aws cloudwatch get-metric-data` in CI post-test).
- Privacy test: no PII in beacon payloads (assert fields in the type).

## Likely docs to change

- `_developers/backlog/METRIC_SON_DESIGN.md` → copy to `packages/metric-son/DESIGN.md` as the shipped design doc.
- `REPORT_REPOSITORY_CONTENTS.md` — note the new package.
- `PRIVACY_DUTIES.md` (in archive) — update: we send metrics but no PII.
- `privacy.html` — list metric-son under third-party-like telemetry (even though it's ours, be transparent).

## Acceptance criteria

1. `packages/metric-son/` builds cleanly, exports a browser module and a server module.
2. Loading the home page fires at least one beacon within 5 s after interaction; payload validated (no PII).
3. Metrics land in CloudWatch under a namespace like `submit-diyaccounting-co-uk/metric-son/*` with deployment-name dimension.
4. A CloudWatch alarm on "VAT submission drop-off rate" can be created from metric-son data.
5. metric-son can be imported and used from another repo (e.g. `www.diyaccounting.co.uk`) without modification.
6. Retains the "no PII" property under dynamic analysis (Playwright + intercept).

## Implementation approach

**Recommended — promote prototype, instrument two key funnels, iterate.**

1. Move `_developers/backlog/metric-son/` → `packages/metric-son/`.
2. Add the ingest Lambda + API route.
3. Instrument two high-value funnels first:
   - **VAT submission funnel**: landed on `/hmrc/vat/submitVat.html`, OAuth success, form filled, POST returned 200/4xx/5xx.
   - **Bundle/pass funnel**: landed on `/bundles.html`, pass redeemed, bundle visible.
4. Wire alarms on drop-off rate (day-over-day delta) and wire to #572 Slack alerts.
5. Extend to other funnels in follow-ups.

### Alternative A — just use CloudWatch RUM
Keep the existing RUM setup, skip metric-son. Zero code change but keeps vendor lock-in and cost.

### Alternative B — plausible.io or a hosted RUM vendor
Outsources the whole category but adds vendor surface and privacy review.

## Questions (for QUESTIONS.md)

- Q645.1: Promote into this repo's `packages/` or keep as a separate GitHub repo once ready? (Recommendation: `packages/` first, extract later if external users appear.)
- Q645.2: Which funnels are highest priority to instrument first?
- Q645.3: Do we retire CloudWatch RUM when metric-son covers equivalent data, or run both for comparison?

## Good fit for Copilot?

Yes for the ingest Lambda and the instrumentation wiring. The library itself should be reviewed by a human for payload/design choices.
