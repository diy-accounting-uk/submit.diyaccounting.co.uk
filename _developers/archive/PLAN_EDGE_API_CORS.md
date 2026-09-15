<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN_EDGE_API_CORS

`EdgeStack.java`'s `webResponseHeadersPolicy` stamps `access-control-allow-origin: *` with
`override(true)` on the whole `/api/v1/*` CloudFront behaviour. That means CloudFront overwrites
whatever CORS header API Gateway or the Lambda underneath already sent, on every route except
`/api/v1/books/*` (which opts out to keep its own allow list — see `diyaGlCors.js`). This finds
what depends on the wildcard, and lands the fix.

- Reviewed: 2026-09-10
- Method: read the CDK source and every browser caller across this repo and the sibling
  `spreadsheets.diyaccounting.co.uk` checkout. No live traffic sample — see "What was skipped".

## What actually calls `/api/v1/*` from a browser

- **The main site's own pages** (bundle, session beacon, HMRC and Companies House routes) fetch
  same-origin, relative paths. Same-origin requests never carry or need a CORS header.
- **`web/public/lib/support-api.js`** can call `/api/v1/support/ticket` cross-origin, but only if
  `window.config.apiBaseUrl` or `data-api-url` is set. Neither is set anywhere in this repo, and
  no page includes the script. It is dead code today, not a live caller.
- **The simulator** (`<env>-simulator.<zone>`) runs its own Lambda with its own Function URL CORS
  config. It never reaches this CloudFront distribution's `/api/v1/*` behaviour.
- **`spreadsheets.diyaccounting.co.uk`'s `books/cloud.js`**, loaded on
  `https://spreadsheets.diyaccounting.co.uk` (prod), `https://ci-spreadsheets.diyaccounting.co.uk`,
  and `http://localhost:3000` (dev), calls `config.apiBase + path` where `apiBase` is
  `https://submit.diyaccounting.co.uk/api/v1`. Most of its calls are `/books...`, already excluded
  from the wildcard. Two calls are not: `/billing/checkout` and `/billing/portal`. Both send
  `Authorization: Bearer <idToken>`, no cookies, no `credentials: 'include'`.

So there is exactly one real cross-origin caller of a non-books `/api/v1/*` route: the DIYA-GL
billing checkout and portal calls from the spreadsheets origins.

## The allow list already exists, one layer down

`ApiStack.java`'s `HttpApi` sets `corsPreflight` with `allowOrigins(diyaGlAllowedOrigins)`, built
from the same comma-separated list `SubmitApplication.java` computes as `booksAllowedOrigins`
(prod: `spreadsheets.diyaccounting.co.uk`, `ci-spreadsheets.diyaccounting.co.uk`; other envs: the
CI spreadsheets host plus `localhost:3000`). That comment block says this was added for B76 to
give the JWT authoriser's own 401 a CORS header — and it applies to the whole shared `HttpApi`,
main routes included, not just books.

HTTP API v2's native CORS answers preflight `OPTIONS` and stamps the matched origin (or nothing,
for an origin not on the list) on the real response too. That is already the correct, working
answer for billing/checkout and billing/portal: it echoes `spreadsheets.diyaccounting.co.uk` when
that is the caller, and nothing for anyone else. CloudFront's `override(true)` wildcard then
throws that away and writes `*` over it on the way out.

## The options

1. **Keep the wildcard, deliberately, and say so in the code.** Costs nothing to implement, but
   leaves the API Gateway allow list pointless — it computes the right answer and CloudFront
   discards it. No caller found needs the wildcard specifically; bearer-token auth means it does
   not enable a credential-theft path today, but it does mean any origin that ever gets hold of a
   token (a compromised browser extension, an XSS bug somewhere unrelated) can read
   `/api/v1/*` responses in that browser, not just the DIYA-GL bearer-restricted subset.
2. **Replace the wildcard with the same allow list the storage routes use, applied to all of
   `/api/v1/*`.** One mechanism (the `HttpApi`'s own `corsPreflight`) decides CORS for every route
   under the shared API; CloudFront just stops overwriting it. No behaviour change for
   billing/checkout or billing/portal, since the origin they call from is already on the list that
   decides the header today, one layer down.
3. **Split it: wildcard for genuinely public reads, allow list for the rest.** No route under
   `/api/v1/*` was found that is read cross-origin from an arbitrary, unknown origin — everything
   is either same-origin or the known DIYA-GL/billing caller. This option adds a second mechanism
   to cover a case that does not exist yet.

## Recommendation: option 2

Stop overriding CORS at CloudFront for `/api/v1/*`, the same way `/api/v1/books/*` already does,
and let the `HttpApi`'s existing allow list answer for the whole shared API. That closes the
wildcard for every route except the one that already has (and needs) an allow-listed
cross-origin caller, with no behaviour change for it.

**What would change this:** a future route under `/api/v1/*` that a browser must call from an
origin outside `booksAllowedOrigins` — a public, unauthenticated read meant for arbitrary sites,
say. None exists today. If one is added, it needs its own explicit CORS decision (a wider allow
list, or a wildcard scoped to that one path), not a blanket reversion of this change.

## What was implemented

`EdgeStack.java`'s `/api/v1/*` behaviour now uses the same response-headers policy as
`/api/v1/books/*` (no `corsBehavior` at all — CloudFront passes through whatever the origin sent).
The two behaviours share one `ResponseHeadersPolicy`; `webResponseHeadersPolicy` (with its
wildcard CORS) still covers the static site's own default behaviour, `/tests/*`, and `/docs/*`,
none of which were in scope here.

`SubmitApplicationCdkResourceTest` pins the `/api/v1/*` behaviour's response-headers policy to the
same policy id as `/api/v1/books/*`, and asserts neither carries a CORS override, so a future edit
can't reintroduce the wildcard without the test failing.

## What was skipped

- No live CloudFront/API Gateway response was captured for this review — the AWS SSO session had
  expired. The recommendation rests on reading the CDK source and every caller's code, not on an
  observed header.
- No search of `www.diyaccounting.co.uk` or `root.diyaccounting.co.uk` for a caller — neither site
  has ever referenced `submit.diyaccounting.co.uk` in this workspace's checkouts.
