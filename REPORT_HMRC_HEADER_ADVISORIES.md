<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# REPORT — HMRC fraud prevention header advisories

Written 2026-09-12 by a Cowork session, for O28. Rewritten the same evening once the operator
captured the Developer Hub pages; the first draft's central theory was wrong and is corrected in
section 6.

Sources: seven Developer Hub screenshots in `hmrc-header-advisories/`, the five HMRC monthly status
emails in the gyb mail mirror, the GitHub Actions run history via the public REST API, `git log`,
and the header code on `main`.

Application ID `1968fa0a-7fd8-47b5-9fbc-c09f7f0b20fd`. Specification version 3.3, updated
27 January 2025. Environment: Production. API group: VAT. **Last production API request:
9 September 2026.**

---

## 1. The answer

**One header, every month: `Gov-Client-Multi-Factor` is missing on the requests where the user
signed in with a single factor.** Every other header HMRC checks is Correct in every month, with no
exceptions.

HMRC's own wording on the advisory:

> Header missing. This may be correct for single factor authentication, for example username and
> password. If this is the case, you must contact us explaining why you cannot submit this header.

No code is broken. The header is genuinely uncollectable when a customer signs in with a Cognito
username and password and no second factor. HMRC rejected that explanation when it was put to them,
so the answer is now to make a second factor mandatory — see section 7.

## 2. The full series, from the Hub

The "Your headers" page carries a month selector with historic months. The whole period is
recoverable, including August.

| Month | VAT requests | Multi-Factor missing | % of requests | Every other header | Email verdict |
|---|---|---|---|---|---|
| April 2026 | 18 | 11 | 61% | Correct | advisories |
| May 2026 | 16 | 2 | 13% | Correct | advisories |
| June 2026 | 0 | — | — | — | no requests |
| July 2026 | 9 | 0 | 0% | Correct | correct |
| August 2026 | 21 | 18 | 86% | Correct | advisories |
| September to the 9th | 11 | 4 | 36% | Correct | (due ~1 Oct) |

Seventy-five production VAT requests in six months. The advisory is the only finding in the whole
period.

## 3. Why the monthly verdicts moved

July was "correct" because all nine of its requests came from sign-ins that carried a second
factor. Nothing was fixed and nothing regressed: the header set has been identical since February.
What changes month to month is **which customers submitted and how they signed in**.

That also disposes of the volume reading. April had twice July's traffic and 61% missing; May had
nearly twice July's traffic and only 13%. The rate tracks the users, not the request count.

HMRC's guidance is worth holding onto here: "Correct" means only "we have not found any issues this
month", explicitly not that the application is compliant.
https://developer.service.hmrc.gov.uk/guides/fraud-prevention/getting-it-right/

## 4. The CI cross-reference

Run counts from the public Actions API; commits by committer date across all refs.

| Month | HMRC requests | deploy runs | test runs | trigger mix | commits |
|---|---|---|---|---|---|
| Apr 2026 | 18 | 0 | 0 | — | 14 |
| May 2026 | 16 | 34 | 37 | 25 schedule, 7 push, 2 dispatch | 13 |
| Jun 2026 | **0** | 30 | 30 | **30 schedule, all 30 failed** | 0 |
| Jul 2026 | 9 | 13 | 13 | 13 schedule, 12 failed | 0 |
| Aug 2026 | 21 | 103 | 129 | mixed | 494 |
| Sep 2026 | 11 to the 9th | 224 | 247 | mixed | 1773 |

**CI generates no production HMRC traffic, and this is now proven twice over.** June ran 30
scheduled deploys and 30 scheduled test runs; HMRC recorded zero production requests that month.
April ran no CI at all and produced 18. The two series are unrelated, and the pause in scheduled
runs from mid-July had no effect on the header percentages.

The production traffic HMRC measures is real customers submitting VAT returns. Nothing else reaches
the production application.

## 5. Why the header is present on some requests and not others

The mechanism is already built and documented in `REPORT_MFA_IMPLEMENTATION.md` (2026-02-27).
`Gov-Client-Multi-Factor` is written to `sessionStorage.mfaMetadata` by the inline script in
`web/public/auth/loginWithCognitoCallback.html`, and read back by
`web/public/lib/services/hmrc-service.js`. Three paths set it:

| Sign-in | Detection | Header |
|---|---|---|
| Google federated | `identities` claim plus `auth_time` | `type=OTHER` |
| Cognito native with TOTP enrolled | `custom:mfa_method=TOTP`, injected by the Pre Token Generation Lambda | `type=TOTP` |
| Cognito native, password only | nothing to detect | **absent — this is the advisory** |

Cognito does not populate `amr` for native TOTP, which is why the Pre Token Generation trigger
exists (`app/functions/auth/preTokenGeneration/index.js`, `IdentityStack.java:193`).

So the monthly percentage is simply the share of that month's submissions made by customers who
signed in with a Cognito username and password and had not enrolled a TOTP. Nothing is broken.

Everything else in `buildFraudHeaders.js` and the browser collector is confirmed working in
production by HMRC's own checks, including the three the first draft suspected:

| Header | First draft's suspicion | HMRC's verdict |
|---|---|---|
| `Gov-Vendor-Public-IP` | cold-start detection had no timeout or retry until 2026-09-06/07 | Correct in every month, including April and May |
| `Gov-Vendor-License-IDs` | dropped when the user holds no bundle | Correct in every month |
| `Gov-Client-Public-Port` | might be lost if CloudFront-Viewer-Address were not forwarded | Correct; `EdgeStack.java` forwards it |

## 6. Correction to the first draft

The first draft named `Gov-Client-Device-ID` as the most likely cause, on the grounds that
`hmrc-service.js:174` calls `crypto.randomUUID()` per request with no persistence, against a spec
requiring a UUID "persistently stored on the device" that "should not expire".

**HMRC reports `Gov-Client-Device-ID` as Correct in every month.** Their check validates the
header's presence and format, not whether the value persists across a device's requests. The code
still deviates from the written spec and it is still worth fixing — a device identifier that never
repeats carries none of the information the header exists to carry — but it is **not** the advisory,
it is not urgent, and no scan of our own data is needed to establish any of this.

The first draft also said the August detail was probably unrecoverable because HMRC no longer send
detailed reports. The emails carry no detail, which is true, but the Hub keeps historic months and
August was retrieved in full.

## 7. The decision: mandate MFA

Two routes existed. **Telling HMRC the header is uncollectable has been tried and HMRC pushed
back**, so it is closed. The remaining route is to make a second factor mandatory, so that every
authenticated session can supply the header.

Record HMRC's actual wording in section 10 when it is to hand — it decides whether they want the
change made by a date, and it is the only part of this report that rests on an unquoted source.

### What mandating MFA actually takes

Two changes, and **the first on its own will not clear the advisory**.

**7.1 Cognito.** `IdentityStack.java:184` currently sets `.mfa(Mfa.OPTIONAL)`. Required is a
one-word change, but not a small one in effect: every existing native-auth customer meets a TOTP
enrolment screen at their next sign-in. That is a support event for a customer base that did not ask
for it, and it needs the enrolment page to be good before it ships, not after. Federated Google
users are unaffected — they never use Cognito's own MFA and already report `type=OTHER`.

**7.2 Move the header off `sessionStorage`.** Today the value survives only as long as the browser
tab, because it is written once by the login callback page. A customer returning on a valid refresh
token without passing through that page has no `mfaMetadata`, sends no header, and produces the
advisory even with TOTP enrolled and MFA mandatory. The claim itself is in the token, and
`customAuthorizer.js` already hands `buildFraudHeaders.js` a flat context it reads `sub` from for
`Gov-Client-User-IDs`. Carrying `mfa_method` and the auth time through the same context, and
building `Gov-Client-Multi-Factor` server-side, makes the header independent of tab lifetime and of
the browser entirely.

7.2 is worth doing whether or not 7.1 ships, and it is the half that decides whether the number
actually reaches zero.

## 8. Actions

| # | Action | Owner |
|---|---|---|
| 1 | Record HMRC's pushback wording in section 10 | Operator |
| 2 | Build `Gov-Client-Multi-Factor` server-side from the token claim via the authorizer context, instead of reading `sessionStorage.mfaMetadata` (7.2) | Claude Code |
| 3 | Switch the user pool to `Mfa.REQUIRED` through CDK and the deploy workflow, after the TOTP enrolment path has been walked end to end as a new customer would meet it (7.1) | Claude Code, operator walks it first |
| 4 | Persist `Gov-Client-Device-ID` in a first-party cookie or `localStorage` — generate once, reuse, regenerate only if absent. Spec conformance, not an advisory fix, and not urgent | Claude Code |
| 5 | Capture the Hub's month page whenever a status email says "Improve", into `hmrc-header-advisories/`. It is the only record with any detail in it | Operator |
| 6 | `data/compliance/fraud-prevention-headers/` is empty — B22's launchd agent has never run. Either install it or drop the panel that reads it | Operator |

September is not finished. Eleven requests to the 9th, 4 missing, and no production request since.
The 1 October email will say "Improve" again regardless: nothing shipped this month can change
requests already made.

## 9. What made this answerable

The screenshots. The monthly emails carry one word and nothing else, and no amount of reading our
own code or CI history could have named the header — two of the three defects the code reading
found are, according to HMRC, not defects at all. The Hub's month selector is the only source with
the per-header counts, and it is available for historic months at any time.

## 10. HMRC's pushback

Not yet recorded. The operator reported that HMRC rejected the explain-it route; the wording has not
been captured here.
