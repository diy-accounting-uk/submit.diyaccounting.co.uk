<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: Sign-in providers beyond Google

The sign-in page offers one route, a Google account. The paid search trial of 1 to 7 November
2026 sent 11 visitors to that page and none finished. This plan adds Microsoft sign-in, with
account linking, the fraud-prevention header value per provider, the privacy
notice, the key-rotation register and the measurement for the next campaign. It starts from
GitHub issue #14 "Other social providers (Apple, Microsoft)" and uses the archived fork plan
`plans/issues/PLAN_ISSUE_634_apple_microsoft_social.md` (antonycc fork, PR #764, 2026-04-22) as
input only.

## Operator assertions (verbatim)

> Adding Microsoft sign-in, and possibly Apple, gives them a way in.

Context given with it (operator, 2026-11-08): the paid search trial of 1 to 7 November sent 41
landings; 11 opened the sign-in page, which offers Google only, and 0 finished, against 34% of
other visitors. Microsoft Advertising traffic is mostly desktop and likely Microsoft-account
users. The next campaign lands on a campaign pass link (NEXT.md row ADS8b).

Earlier operator decisions this plan keeps:

- Federated-only sign-in. The Cognito native form is off outside test runs
  (`../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_COGNITO_HOSTED_UI_NATIVE_AUTH_TOGGLE.md`,
  `PLAN_DISABLE_COGNITO_SIGNUP.md`). Self sign-up is off (`selfSignUpEnabled(false)`).
- TOTP MFA is required for native users (commit 557219fb2, O28). Federated users carry no Cognito MFA.

## Decisions in one view

| Id | Decision | Recommendation |
| --- | --- | --- |
| D1 | Which Microsoft accounts | Personal accounts now, through the `consumers` tenant |
| D2 | Account linking across providers | Automatic, by verified email, in a Pre sign-up trigger |
| D3 | Email and password sign-in | Not now; read the campaign first |
| D5 | Entra app registrations | One registration, two redirect URIs (ci, prod) |
| D6 | Facebook and Amazon | Not built |
| D7 | The test lane's entry to the native form | `login.html?provider=COGNITO` |

The alternatives and the evidence are under "Operator decisions" below.

## Measured facts

Funnel, 1 to 7 November 2026, from the prod lake
(`../private.diyaccounting.co.uk/strategy/PLAN_PAID_GOOGLE_SEARCH.md` section 2):

| Measure | Google ads | Microsoft ads |
| --- | ---: | ---: |
| Landings from people | 23 | 18 |
| Opened `/auth/login.html` | 6 | 5 |
| Came back from Google sign-in | 0 | 0 |
| Device: mobile / desktop | 22 / 1 | 8 / 10 |
| Opened sign-in on desktop | 0 of 1 | 4 of 10 |

Other visitors in the same week: 13 of 38 who opened the sign-in page completed (34%); 30 of
those 38 used a desktop. In the September window, 76% of `session_start` rows and all 10 `login`
events were desktop. The sign-in happens on a desktop.

Market reach, UK, with sources:

| Provider | Reach figure | Source |
| --- | --- | --- |
| Microsoft | Sites and apps reach 87% of UK online adults | Ofcom Online Nation 2025 (May 2025 data) |
| Microsoft | Windows 61.8% of UK desktop web traffic, August 2026 | gs.statcounter.com, desktop OS, United Kingdom |
| Facebook | Facebook plus Messenger reach 93% of UK online adults | Ofcom Online Nation 2025 |
| Amazon | Sites and apps reach 90% of UK online adults; 15 million UK Prime members (2019) | Ofcom Online Nation 2025; Mintel via Retail Week, 2019 |
| Google | YouTube 94%, Google Search 82% of UK online adults | Ofcom Online Nation 2025 |

No current survey gives the share of UK adults who hold a Microsoft account. The OS share is
the proxy: a Windows PC prompts for a Microsoft account at setup.

Our customers (`web/public/about.html`): UK VAT-registered businesses that file to HMRC,
£0.99 a month or £9.99 a year, with a free pass first. The annual buyer of 6 November and 30 of
38 sign-in visitors used a desktop.

Cognito support and cost, from https://docs.aws.amazon.com/cognito/ (pages dated October 2026):

| Provider | Cognito path | Console registration | Our cost |
| --- | --- | --- | --- |
| Microsoft personal | OIDC provider, issuer `https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0` (the `consumers` tenant; the discovery document carries this literal issuer) | Entra app registration, "Personal accounts only", redirect URI `/oauth2/idpresponse` | £0 |
| Microsoft work or school | OIDC with the `common` tenant fails: its discovery issuer is `https://login.microsoftonline.com/{tenantid}/v2.0` and Cognito checks the token issuer against the configured one (re:Post QUfqQMEly_SLe8P9wad3A1Hw; no AWS fix found as of 2026-11) | Same registration | £0 |
| Facebook | Built-in `Facebook`: App ID, App secret, API version | Meta app in Live mode, Business Verification, Advanced Access for `email` | £0 |
| Amazon | Built-in `LoginWithAmazon`: client id, client secret | Security profile, allowed return URL | £0 |
| Email and password | Native Cognito user, TOTP required already; email one-time code needs our own SES sender | None | £0 (Plus plan already) |
| GOV.UK One Login | Not open: "Try GOV.UK One Login if you work on a central government service" (sign-in.service.gov.uk) | n/a | n/a |

Fraud prevention. HMRC's `Gov-Client-Multi-Factor` (web-app-via-server) takes `type` TOTP,
AUTH_CODE or OTHER, a `timestamp` and a `unique-reference`; "If you authenticate with username
and password only, you will not be able to collect a value." Our builder
(`app/lib/buildFraudHeaders.js` `buildServerMultiFactorHeader`) sends `type=OTHER` for any
federated sign-in and `type=TOTP` for a native TOTP user, with
`unique-reference = SHA-256(sub + ":" + type)` and the token's `auth_time`. Microsoft and Google do not require two-factor
authentication on personal accounts. Facebook and Amazon do not require it.

## Provider ranking

| Rank | Provider | Evidence in one line | Verdict |
| --- | --- | --- | --- |
| 1 | Microsoft (personal) | 10 of 18 Microsoft-ads landings and 4 of their 5 sign-in openers were desktop; Windows is 61.8% of UK desktop; £0; OIDC works on the `consumers` issuer | Build first |
| 3 | Email and password | Reaches everyone; TOTP gives the exact header value; reverses the federated-only decision; needs account recovery (now `AccountRecovery.NONE`) and self sign-up | Operator decision D3 |
| 4 | Facebook | 93% reach but Business Verification and app review before a non-role user can sign in; no `email_verified`; no MFA, so the header is omitted | Not now |
| 5 | Amazon | No UK figure since 2019; email unverified; no MFA | Not now |
| 6 | GOV.UK One Login | Central government services only | Not available |

## Code facts that shape the steps

- `IdentityStack.java` line 73: `identityProviders` is a `HashMap`. With two keys the order of
  `supportedIdentityProviders` on the three app clients is not stable, so the CloudFormation
  diff churns. Step 1 changes it to a `LinkedHashMap`.
- `IdentityStackTest.java` line 121 asserts `SupportedIdentityProviders` equals `["Google"]`.
- The Cognito domain is `<env>-auth.diyaccounting.co.uk` (`SubmitSharedNames` line 191). The
  provider return URL for every provider is `https://ci-auth.diyaccounting.co.uk/oauth2/idpresponse`
  and `https://prod-auth.diyaccounting.co.uk/oauth2/idpresponse`.
- `buildCognitoAuthUrl` (`web/public/lib/auth-url-builder.js`) sends no `identity_provider`.
  With one federated provider and no `COGNITO`, Cognito redirects straight to Google. With two
  providers and no parameter, Cognito shows its own chooser page. Each button must send
  `identity_provider=<name>` (`Google`, `Microsoft`, `COGNITO`), per the
  authorize endpoint reference.
- The ci test lane (`TEST_AUTH_PROVIDER=cognito-native`, `probe-test.yml` lines 373 to 400,
  `deploy.yml` lines 998 to 1011) clicks the "Google account" button and fills the hosted UI's
  native form (`behaviour-tests/steps/behaviour-login-steps.js` `initCognitoAuth`,
  `fillInHostedUINativeAuth`). Once the Google button sends `identity_provider=Google`, that
  lane lands on Google. Step 2 gives the lane its own entry (D7).
- `scripts/toggle-cognito-native-auth.js` adds `COGNITO` to the list it reads back, so a longer
  list needs no change there. The spreadsheets repository fetches that script by raw URL.
- `loginWithCognitoCallback.page.js` already reads `identities[0].providerName` for the GA4
  `login` event's `method`, for `localStorage.loginProvider`, and for the MFA inference.
  `signInActivityPublish.js` writes `detail.provider` on every lake `login` event. Nothing
  in these files is provider-specific.
- `v_sign_ins_daily.sql` groups by day, app client, event and actor. It has no provider column.
- Bundles, passes and every customer table key on `hashedSub` (`DataStack.java`). A second
  provider with a second Cognito profile is a second customer with no bundles.
  `AdminLinkProviderForUser` links a federated identity to an existing profile only before that
  identity's first sign-in; a federated profile that already exists must be deleted first.
- Secrets reach AWS through `deploy-env-secrets.yml` and `scripts/put-secret-with-rotation-tag.sh`.
  `rotate-secret.yml` offers a `choice` of secret names and runs
  `scripts/refresh-google-identity-provider.sh` for the Google one, because Cognito keeps its own
  copy of a provider secret. `deploy-environment.yml` has a `force-identity-refresh` input.
- `secrets-rotation.toml` lists `google/client_secret` with `expires_at = "2026-11-30"` and
  `max_age_days = 365`. An Entra client secret lives at most 24 months
  (learn.microsoft.com, how-to-add-credentials).
- `web/public/privacy.html` line 69 ("from Google OAuth sign-in"), line 364 ("sign in with Google
  OAuth"), `web/public/security.html` line 86, `web/public/about.html` line 114 and
  `web/public/auth/login.html` (the "Any Google account works" hint) name Google as the only route.
- NEXT.md row ADS8b writes "the Google sign-in requirement" into the pass page copy. When step 2
  lands, that copy names both providers. The ADS8b agent reads this plan.

## The sign-in page

One button per provider, in this order: Google, Microsoft. Each button is a `.btn.auth-btn`
with the provider's logo and the text "Sign in with your Google account" or "Sign in with your
Microsoft account". The hint under the buttons becomes one sentence: "Use the account you already have.
We receive your email address and name, and nothing else." Microsoft's brand rules ask for the
four-square logo on a "Sign in with Microsoft" button. The logos go to `web/public/images/` as
SVG.

`login.page.js` has one `loginWithProvider(identityProvider)` that clears storage, makes
state, nonce and the PKCE verifier, and calls
`buildCognitoAuthUrl(state, nonce, codeChallenge, { identityProvider })`. The query parameter
`?provider=COGNITO` on `login.html` selects the native form for the test lane; any value not in
the allow list (`Google`, `Microsoft`, `COGNITO`) is ignored. On prod,
`COGNITO` is not in `SupportedIdentityProviders` outside a test hold, and Cognito answers
`invalid_request`, so the parameter exposes nothing.

The callback page needs no provider branch. It gains one retry: when Cognito returns
`error_description` containing `Already found an entry for username`, the first sign-in after a
link in the Pre sign-up trigger, the page restarts the same provider's sign-in once
(sessionStorage flag `cognito_link_retry`), then shows the error if it repeats.

## Account linking (D2)

The Pre sign-up trigger (`app/functions/auth/preSignUp/index.js`, new) runs on
`PreSignUp_ExternalProvider`:

1. Read the provider name from `userName` (`Google_<id>`, `Microsoft_<id>`) and the email from `request.userAttributes.email`.
2. Trust the email only when the provider asserted it: Google with `email_verified` true;
   Microsoft `consumers`, whose `email` is the account's sign-in address. Otherwise return without linking.
3. `ListUsers` with filter `email = "<address>"`. Zero matches: return. Two or more: log and
   return, so an ambiguous address never links. One match: `AdminLinkProviderForUser` with
   destination `ProviderName=Cognito, ProviderAttributeValue=<existing username>` and source
   `ProviderName=<provider>, ProviderAttributeName=Cognito_Subject, ProviderAttributeValue=<id>`.
4. Set `response.autoVerifyEmail = true` for a trusted provider.

The linked person keeps the existing profile's `sub`, so `hashedSub`, bundles, passes and
`unique-reference` stay the same across providers. The `identities` claim then lists both
providers; `identities[0]` is the first linked, so `loginProvider` and the GA4 `method` read
the provider that signed in from the token's `identities` entry whose `dateCreated` is newest
or, simpler, from the `identity_provider` the page sent (kept in sessionStorage as
`cognito_identity_provider`). Step 4 uses the page's value.

IAM for the trigger: `cognito-idp:ListUsers` and `cognito-idp:AdminLinkProviderForUser` on
`arn:aws:cognito-idp:<region>:<account>:userpool/*`, the string pattern the Pre token trigger
uses to avoid the circular dependency.

Cognito limits: five linked identities per profile; the link must happen before the federated
identity's first sign-in (the trigger is that moment). The re:Post threads on this trigger
report the first attempt failing with "Already found an entry for username"; the callback retry
above handles it.

## Gov-Client-Multi-Factor per provider

| Provider | Value sent | Basis |
| --- | --- | --- |
| Google | `type=OTHER`, `auth_time`, `SHA-256(sub:OTHER)` | Current inference: federated sign-in |
| Microsoft personal | `type=OTHER`, same shape | Same inference; Microsoft does not require MFA on personal accounts |
| Native TOTP (test lane) | `type=TOTP` | `custom:mfa_method` from the Pre token trigger |
| Native email code | would be `type=AUTH_CODE` | Needs SES and the Essentials or Plus plan; not configured |
| Facebook, Amazon | none; the builder warns "HMRC REQUIRED HEADER MISSING" | No MFA enforced |

Nothing in the builder changes for Microsoft. Horizon: Cognito is rolling out
pass-through of an OIDC provider's `amr` claim ("Step-up authentication for federated users",
OIDC provider page). When that reaches our pool, Microsoft's `amr` (`pwd`, `mfa`) gives an exact
value for Microsoft sign-ins, and a password-only Microsoft sign-in omits the header as HMRC
asks.

## Privacy notice and public copy

`privacy.html`: "Cognito user profile: Email address, name, and unique user identifier (sub)
from the sign-in provider you choose (Google or Microsoft)"; the "Account data" bullet
names the two; the retention table row stays. The processors section names Microsoft Ireland
Operations Limited beside Google Ireland Limited, each as the sign-in provider only.
`security.html` line 86: "Sign-in uses Amazon Cognito, through your Google or Microsoft
account." `about.html` line 114: "Sign in with your Google or Microsoft account to get
started."

## Key-rotation register

`secrets-rotation.toml` gains:

```toml
[[secret]]
name = "microsoft/client_secret"
console = "Microsoft Entra admin center, App registrations, Certificates & secrets"
last_rotated = ""
expires_at = "<creation date plus 24 months>"
max_age_days = 365
```

It is an AWS-store secret written by `deploy-env-secrets.yml` from the GitHub Environment secret
`MICROSOFT_CLIENT_SECRET` into `<env>/submit/microsoft/client_secret`. `rotate-secret.yml` adds the name to its `choice` and
refreshes the Cognito provider after the write, through one script
`scripts/refresh-identity-provider.sh <env> <provider>` that replaces
`refresh-google-identity-provider.sh` (all callers updated; no alias). The Microsoft client id goes in `cdk-environment/cdk.json` and
`cdk-application/cdk.json` beside `googleClientId`. The private runbook
`../private.diyaccounting.co.uk/security/RUNBOOK_INFORMATION_SECURITY.md` section 3 gets one
row for the key in the same commit wave (private repository, its own commit).

## Measuring the next campaign

The lake already records provider on every `login` event (`detail.provider`). Step 7 adds a
`provider` column to `v_sign_ins_daily` and a sign-in row per provider to the funnel query of
`../private.diyaccounting.co.uk/strategy/PLAN_PAID_GOOGLE_SEARCH.md` section 2:

| Step | Google ads | Microsoft ads |
| --- | --- | --- |
| Opened `/auth/login.html` | n | n |
| Came back from sign-in: Google / Microsoft | n / n | n / n |
| Pass redeemed | n | n |

The paid cohort is the visitors whose landing carried `gclid` or `msclkid`, joined on the
visitor hash to their `login` event within the session. GA4 carries the same split as
`login` with `method` (already sent). The reading that decides D3: paid sign-in completion
against the 34% site rate, and the provider shares of the completions.

## Operator decisions

**D1. Which Microsoft accounts.** Alternatives: (a) personal accounts only, through the
`consumers` tenant, one OIDC provider named `Microsoft`; (b) personal accounts plus a named
list of work tenants, one OIDC provider per tenant, each with its own button or an email-domain
lookup; (c) wait for Cognito to accept the `common` issuer. Recommendation: (a). The campaign
traffic is consumer search on a home PC; a work tenant needs the tenant's admin to consent and
adds a provider per tenant. A sole trader with a Microsoft 365 Business account still has, or
can make, a personal account; the login page's hint says so.

**D2. Account linking.** Alternatives: (a) automatic by verified email in the Pre sign-up
trigger, as designed above; (b) no linking, one profile per provider, the person's bundles
split; (c) manual link by the operator on request with `admin-link-provider-for-user`.
Recommendation: (a). Cognito's own warning is that the linked providers must be ones the
application owner trusts; Google and Microsoft `consumers` are.
Existing Google customers who try Microsoft with the same address keep their bundles; with (b)
they would see an empty account and write to support.

**D3. Email and password.** Alternatives: (a) not now; (b) open native sign-up with TOTP
required, email recovery on (`AccountRecovery.EMAIL_ONLY`), the native form on by default;
(c) decide after the first campaign with two providers. Recommendation: (a), re-read as (c)
after the campaign. It reverses the 2026 federated-only decision, needs a recovery path that
the pool now refuses, and gives Cognito Threat Protection a password surface to defend. The
header value would be exact (`TOTP`), which is the one gain.

**D5. One Entra registration or two.** Alternatives: (a) one registration with both
`/oauth2/idpresponse` URIs and one secret set into both environments; (b) one registration per
environment. Recommendation: (a), the Google pattern (`googleClientId` is one value in both
`cdk.json` files). A rotation then rolls ci and prod from one console action.

**D6. Facebook and Amazon.** Not built. Both leave the HMRC header empty and both carry an
unverified email. Reconsider on evidence from the campaign's device and referrer split.

**D7. Test lane entry.** Alternatives: (a) `login.html?provider=COGNITO`, read by the page from
an allow list; (b) the behaviour helper builds the hosted-UI URL itself and skips the page.
Recommendation: (a). The lane still exercises the page's own scripts and PKCE, and the
parameter is inert on prod.

## Build plan

Steps marked
**operator** are a person's. Every machine step runs `npm test` and `./mvnw clean verify`
before its push. Proof on ci means a `deploy-environment.yml` run for `ci` (IdentityStack is
in its path filter), the branch's `deploy.yml`, and a sign-in on `ci-set1` or the ci apex.

Board rows on `NEXT.md`, by step:

| Step | Rows |
| --- | --- |
| Decisions D1 to D7 | OSGN-D |
| 0 | OSGN0 |
| 1 | SGN1a (build), SGN1b (live on ci and prod, with SGN2b and SGN6) |
| 2 | SGN2a (provider parameter, test lane), SGN2b (Microsoft button, copy) |
| 3 | OSGN3 |
| 4 | SGN4 (build), OSGN4 (proof) |
| 5 | SGN5 |
| 6 | SGN6 |
| 7 | SGN7 |

### Step 0 (operator). Entra app registration

- Sign in at https://entra.microsoft.com with the company Microsoft account. Create the tenant
  if the account has none (the quickstart's "Default Directory").
- Entra ID, App registrations, New registration. Name "DIY Accounting Submit". Supported
  account types: "Personal accounts only". Platform Web, redirect URIs
  `https://ci-auth.diyaccounting.co.uk/oauth2/idpresponse` and
  `https://prod-auth.diyaccounting.co.uk/oauth2/idpresponse`. Register.
- Record the Application (client) ID.
- Certificates & secrets, New client secret, expiry 24 months. Copy the value once.
- Set the secret in your terminal, ci then prod:
  ```
  gh secret set MICROSOFT_CLIENT_SECRET --env ci --repo diy-accounting-uk/submit.diyaccounting.co.uk
  gh secret set MICROSOFT_CLIENT_SECRET --env prod --repo diy-accounting-uk/submit.diyaccounting.co.uk
  ```
- Give the session the client id and the secret's expiry date for step 1.

### Step 1. Microsoft provider in the identity stack

- **Model**: Sonnet.
- **Files (about 11)**: `IdentityStack.java` (`UserPoolIdentityProviderOidc` named `Microsoft`,
  issuer `https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0`, scopes
  `openid profile email`, `attributeRequestMethod GET`, mapping `email`, `given_name`,
  `family_name`; `LinkedHashMap`; props `microsoftClientId`, `microsoftClientSecretArn`),
  `SubmitEnvironment.java`, `cdk-environment/cdk.json`, `cdk-application/cdk.json`, `.env.ci`,
  `.env.prod`, `.env.proxy` (`MICROSOFT_CLIENT_SECRET_ARN`), `deploy-env-secrets.yml`,
  `secrets-rotation.toml`, `IdentityStackTest.java`, `SubmitEnvironmentCdkResourceTest.java`.
- **Tests**: `IdentityStackTest` asserts `SupportedIdentityProviders` equals
  `["Google", "Microsoft"]` on all three clients and the OIDC provider's issuer and scopes.
  `./mvnw clean verify`.
- **Proof**: `deploy-environment.yml` for ci; `aws --profile diya-submit-ci cognito-idp
  describe-identity-provider --user-pool-id <id> --provider-name Microsoft`. Then
  `https://ci-auth.diyaccounting.co.uk/oauth2/authorize?identity_provider=Microsoft&...` with
  the ci client id reaches `login.live.com`.

### Step 2. Sign-in page with two providers, and the test lane

- **Model**: Sonnet.
- **Files (about 16)**: `web/public/auth/login.html`, `login.page.js`,
  `web/public/lib/auth-url-builder.js`, `web/public/css/sign-in.css`,
  `web/public/images/microsoft-logo.svg`, `web/public/auth/loginWithCognitoCallback.page.js`
  (`cognito_identity_provider` in sessionStorage, the link retry), `web/public/about.html`,
  `web/public/security.html`, `web/unit-tests/auth-url-generation.test.js`,
  `web/unit-tests/login-google-account-note.test.js` (renamed to the hint it now tests),
  `web/browser-tests/pkceSignIn.browser.test.js`, `web/browser-tests/signInLink.browser.test.js`,
  `behaviour-tests/steps/behaviour-login-steps.js` (`initCognitoAuth` opens
  `/auth/login.html?provider=COGNITO` when `TEST_AUTH_PROVIDER` is `cognito-native`),
  `behaviour-tests/helpers/hosted-ui-navigation.js`, `web/unit-tests/hosted-ui-navigation.test.js`,
  `REPORT_CAPABILITIES.md` (SITE-01 files).
- **Tests**: unit tests for `buildCognitoAuthUrl` with and without `identityProvider` and for the
  allow list; browser tests see two enabled buttons; `npm run test:authBehaviour-proxy`.
- **Proof**: the branch's `deploy.yml` on ci with the native lane green; then
  `test:authBehaviour-ci`. Visual definition of done: `visual-review` on the login page
  screenshots, guide screenshots retaken (`npm run video:walkthrough`).

### Step 3 (operator). First Microsoft sign-in on ci

- Open `https://ci-set1.submit.diyaccounting.co.uk/auth/login.html` (or the apex), choose
  "Sign in with your Microsoft account", sign in with a personal Microsoft account, and reach
  the home page signed in.
- The session reads the lake: one `login` event with `detail.provider = "Microsoft"`, and the
  Telegram line "Signed in via Microsoft".

### Step 4. Account linking

- **Model**: Opus. The trust rule and the retry are the subtle parts.
- **Files (about 9)**: `app/functions/auth/preSignUp/index.js` and `package.json` (new),
  `app/unit-tests/functions/preSignUp.test.js` (new), `IdentityStack.java` (trigger, log group
  through `ensureLogGroupWithDependency`, IAM), `IdentityStackTest.java`,
  `web/public/auth/loginWithCognitoCallback.page.js` (the retry, if step 2 did not land it),
  `web/browser-tests/pkceSignIn.browser.test.js`, `REPORT_CAPABILITIES.md` (SITE-01),
  `web/public/privacy.html` (one sentence: one account per email address across providers).
- **Tests**: unit tests with the SDK mocked for zero, one and two matches, each provider's
  trust rule, the relay address, and the `autoVerifyEmail` response. `./mvnw clean verify`.
- **Proof**: on ci, the operator signs in with Google, signs out, signs in with Microsoft on the
  same address. The lake shows two `login` events with one `hashed_sub`; the bundles page shows
  the same bundles. `describe-identity-provider` unchanged; `admin-get-user` on the profile
  shows two entries in `identities`.

### Step 5. Rotation register, refresh script and runbook

- **Model**: Sonnet.
- **Files (about 7)**: `scripts/refresh-identity-provider.sh` (replaces
  `refresh-google-identity-provider.sh`; one case per provider for `provider-details`),
  `.github/workflows/rotate-secret.yml` (choice `microsoft/client_secret`; the refresh step
  takes the provider), `.github/workflows/deploy-environment.yml` (`force-identity-refresh`
  calls the new script for every provider), `.claude/skills/key-rotation/SKILL.md` (a
  Microsoft section: console, set, roll, prove, retire), `secrets-rotation.toml` (if step 1
  did not land it), `REPORT_CAPABILITIES.md` (OPS-166, OPS-184),
  `app/unit-tests/functions/security/securityLakeNightly.test.js` (one row more in `buildRotationRows`).
- **Tests**: `npm test`; a dry `rotate-secret.yml` dispatch on ci with the current value proves
  the refresh step.
- **Proof**: `rotation-check.yml` lists `microsoft/client_secret` with its days to expiry.

### Step 6. Privacy notice and public copy

- **Model**: Haiku.
- **Files (about 4)**: `web/public/privacy.html`, `web/public/security.html` (if step 2 did not
  land it), `web/public/about.html` (same), `web/browser-tests/privacy-notice.browser.test.js` (the
  test that holds the privacy wording checks).
- **Tests**: `npm run test:unit`. Copy change: step 1 of the definition of done only.
- **Proof**: the ci page reads as written.

### Step 7. Measurement: sign-ins by provider

- **Model**: Sonnet.
- **Files (about 6)**: `infra/main/resources/analytics/views/v_sign_ins_daily.sql` (`provider`
  from `json_extract_scalar(detail_json, '$.provider')`), `BusinessViewsTest.java`,
  `app/functions/analytics/operatorSnapshotPublish.js` and `analyticsMetricsPublish.js` and their tests (provider split on the
  sign-ins panel), `web/public/operator/dashboard.html` if the panel's columns are in markup,
  `../private.diyaccounting.co.uk/strategy/PLAN_PAID_GOOGLE_SEARCH.md` (the funnel query gains
  the provider row; private repository, its own commit).
- **Tests**: `./mvnw clean verify`; the snapshot section test.
- **Proof**: after the ci deploy and 15 minutes, an Athena query on `v_sign_ins_daily` in
  `ci-env-analytics` returns the step 3 sign-in under `provider = 'Microsoft'`.

### Order and dependencies

- Step 0 before 1. Steps 1 and 2 can run beside each other on the batch branch; step 2's ci
  proof needs step 1 deployed. Step 3 after 2. Steps 4, 5, 6 and 7 after 2, beside each other
  with distinct files (step 5 owns `secrets-rotation.toml` and the workflows; step 6 owns the
  copy files; step 4 owns the callback page).
- When step 2 merges, the ADS8b pass page copy reads "sign in with your Google or Microsoft
  account".

## Not in this plan

- Apple sign-in: picked up when there is budget and Microsoft sign-in is stable (operator,
  2026-11-09).
- Work or school Microsoft accounts (D1). Open problem: Cognito's exact issuer check against
  Entra's per-tenant issuer. Candidate routes when wanted: one OIDC provider per named tenant;
  SAML federation per tenant; Cognito's own change if it ships. Until then a work-account user
  signs in with a personal Microsoft account or Google.
- Facebook, Amazon (D6). GOV.UK One Login until GDS opens it beyond central government.
- Sign-out at the provider (Microsoft `end_session_endpoint`). Signing out of Submit clears our
  tokens, as it does for Google today.
