# ITSA sandbox spike

One read-only Income Tax call through our own OAuth application and our own fraud prevention
headers. This is the gate for the ITSA build.

Result: HTTP 200 with a business list. Our sandbox application, the `read:self-assessment` scope,
our registered redirect and our `Gov-*` headers were all accepted with no change to the
application registration.

## Route taken

Route (b), a standalone harness, because Docker was not running on the machine and the proxy
variant needs it for the OAuth2 container and dynalite.

`scripts/itsa-sandbox-spike.js` drives the same authorisation code flow the proxy variant drives:

- Playwright opens `{HMRC_SANDBOX_BASE_URI}/oauth/authorize` with our sandbox client id, our
  registered redirect uri and `scope=read:self-assessment`.
- It signs in as the sandbox test user and grants authority.
- The redirect uri is a page the app serves, and the app is not running here, so the harness reads
  the code off the redirect request itself.
- The token exchange calls `prepareTokenExchangeRequest` from `app/functions/hmrc/hmrcTokenPost.js`,
  so the body and the secret lookup are the app's own.
- The API call builds its headers with `buildFraudHeaders` from `app/lib/buildFraudHeaders.js` and
  `buildHmrcHeaders` from `app/services/hmrcApi.js`.

Run it with `scripts/proxy-secrets.sh node scripts/itsa-sandbox-spike.js`. The client secret comes
from Secrets Manager, never from the repo.

The authorisation pages, in order:

```
/oauth/start -> /oauth/whatYouWillNeed -> /api-test-login/sign-in -> /oauth/grantscope -> redirect uri
```

## The request

Sandbox test user with both MTD VAT and MTD Income Tax enrolments. The NINO is masked below to its
last two characters.

```
GET https://test-api.service.hmrc.gov.uk/individuals/business/details/*******8A/list

Content-Type: application/json
Accept: application/vnd.hmrc.2.0+json
Authorization: Bearer <token>
x-request-id: 6e80bdfe-5f6b-4723-ae5e-e25940c667d3
x-correlationid: 21046ffe-fbd5-432b-91f5-24df8683faf5
Gov-Client-Public-IP: 88.97.27.180
Gov-Client-Public-Port: 51234
Gov-Client-Device-ID: 50ea2fe0-ce68-4654-9fff-18b2d9e6bfc3
Gov-Client-User-IDs: cognito=spike-4ac44b16-c846-466e-b735-d5b9a4113b38
Gov-Client-Connection-Method: WEB_APP_VIA_SERVER
Gov-Client-Browser-JS-User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) itsa-sandbox-spike
Gov-Client-Public-IP-Timestamp: 2026-09-05T16:25:15.214Z
Gov-Client-Screens: width=1512&height=982&colour-depth=30&scaling-factor=2
Gov-Client-Timezone: UTC+00:00
Gov-Client-Window-Size: width=1512&height=857
Gov-Vendor-Public-IP: 88.97.27.180
Gov-Vendor-Forwarded: by=88.97.27.180&for=88.97.27.180
Gov-Vendor-License-IDs: diyaccounting=46523ed2...a9b703
Gov-Vendor-Product-Name: web-submit-diyaccounting-co-uk
Gov-Vendor-Version: web-submit-diyaccounting-co-uk=1.0.0
```

No `Gov-Test-Scenario` header was sent. The default call succeeded, so the scenario fallbacks were
never needed.

## The response

```
HTTP/1.1 200 OK
content-type: application/json
x-correlationid: 54d9c91a-e3b6-4823-ad99-56d5345b2857
x-envoy-upstream-service-time: 33
cache-control: no-cache,no-store,max-age=0
via: 1.1 ...cloudfront.net (CloudFront)

{
  "listOfBusinesses": [
    {
      "typeOfBusiness": "self-employment",
      "businessId": "XBIS12345678901",
      "tradingType": "Plastering",
      "tradingName": "Company X"
    }
  ]
}
```

The token exchange returned `200` with `scope=read:self-assessment`, `token_type=bearer` and
`expires_in=14400`.

## Fraud header check

The same header set was sent to `GET /test/fraud-prevention-headers/validate` first. Spec version
3.3 came back with `POTENTIALLY_INVALID_HEADERS` and one warning:

- `gov-client-multi-factor` missing. The sandbox test user signs in with a user id and a password,
  so there is no second factor to report. Live users sign in through Cognito with TOTP and the
  browser supplies this header.

No errors. `Gov-Vendor-License-IDs` needs the user's bundle ids and an initialised hash salt, both
of which the real handlers have; the harness supplies a throwaway salt of its own so the header
appears.

One difference from production: the harness runs the browser and the API call on one laptop, so
`Gov-Client-Public-IP` and `Gov-Vendor-Public-IP` hold the same address. In production the Lambda's
outbound IP differs from the end user's. HMRC accepted the read anyway, but a write endpoint is
where that rule bites, so do not read this as clearance for submissions from one host.

## Which assumptions held

From `_developers/backlog/self-employed-api-operations.md`:

- **Our sandbox application can reach the Income Tax APIs.** Held. Business Details v2.0 answered
  our existing client id with no extra registration.
- **`read:self-assessment` is the scope for reads.** Held. The authorize call requested it, HMRC
  granted exactly it, and the API accepted a token carrying only that scope.
- **The same base URI and fraud prevention headers as the VAT calls.** Held. `buildFraudHeaders`
  needed no ITSA-specific change and HMRC's own validator found no errors in what it produces.
- **The catalogue already carries the ITSA activity.** Held. `submit.catalogue.toml` has the
  `self-employed` activity with `hmrcScopesRequired = ["write:self-assessment",
  "read:self-assessment"]` on the `resident-itsa` bundle.

What did not hold:

- **The plan assumes the OAuth flow needs work to request self-assessment scopes.** It does not.
  Neither `web/public/lib/auth-url-builder.js` nor `app/functions/hmrc/hmrcTokenPost.js` restricts
  the scope string. The page passes whatever `hmrc-scope-check.js` reads from the catalogue, and the
  token handler returns HMRC's granted scope unchanged. Unit tests now pin both.
- **The plan's endpoint paths are wrong.** It names
  `/income-tax/self-employment/{nino}/{businessId}/annual-summaries/{taxYear}`. Self Employment
  Business v5.0 in `_developers/reference/` uses
  `/individuals/business/self-employment/{nino}/{businessId}/annual/{taxYear}`. Take every path
  from the OpenAPI specs, not from the plan.
- **The plan assumes a `businessId` is known.** It is not. Business Details v2.0 is what supplies
  it, and every self-employment endpoint needs it in the path.
- **`DIY_SUBMIT_SELF_ASSESS_BASE_URI` is not needed.** ITSA sits on the same host as VAT, so
  `HMRC_BASE_URI` and `HMRC_SANDBOX_BASE_URI` cover it.

## First endpoint item for the ITSA build

Build `hmrcItsaBusinessDetailsGet.js` for `GET /individuals/business/details/{nino}/list`, shaped
like `app/functions/hmrc/hmrcVatObligationGet.js`, and mount it at
`/api/v1/hmrc/itsa/business/details` behind the `self-employed` activity.

It comes first because it is the only read that needs nothing but a NINO, and every other ITSA
endpoint needs the `businessId` it returns. It also has a documented `NOT_FOUND` scenario, so the
error path is testable without a second test user.

Two things the handler needs that the VAT handlers do not:

- `Accept: application/vnd.hmrc.2.0+json`. `buildHmrcHeaders` hardcodes `1.0`, so the version
  becomes a parameter.
- A NINO on the request. VAT identifies the user by VRN, and nothing in the app carries a NINO yet.

The sandbox `Gov-Test-Scenario` values for this endpoint are `PROPERTY`, `FOREIGN_PROPERTY`,
`BUSINESS_AND_PROPERTY`, `UNSPECIFIED`, `NOT_FOUND` and `STATEFUL`, with the default returning a
self-employment business.
