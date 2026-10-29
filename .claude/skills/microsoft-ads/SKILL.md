---
name: microsoft-ads
description: Answer Microsoft Advertising (Bing) questions — how the account is doing, what its keywords and budget would buy, how to change it — from live data.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# microsoft-ads

Answer questions about DIY Accounting Submit's Microsoft Advertising account G1202SF9 (account
ID 188495572): what is in it, how it performs, what its budget would buy, and what to change. It
is the twin of `ads-advisor`. Read live data from the account and live code from
`infra/microsoft/ads/`. Never quote a number the commands did not print.

## Sign-in

The account signs in with Google. `msads.js` exchanges the Google refresh token in
`prod/submit/microsoft-ads/google_refresh_token` for an access token, and sends it with the
developer token (`prod/submit/microsoft-ads/developer_token`) and the header
`IdentityProvider: Google`. Select the submit-prod profile first:

```bash
export AWS_PROFILE=diya-submit-prod
```

When a command says there is no refresh token, or Google refuses it, the operator runs the first
consent, once, at the browser:

```bash
npm run msads:consent
```

## Reading the account

```bash
npm run msads:whoami                 # user, customer id and account
npm run msads:inventory              # campaigns, budgets, bidding, ad groups, keywords, ads, targeting, spend
npm run msads:inventory -- --json    # the same as JSON
npm run msads:inventory -- --campaign-types "Search Audience"
```

The inventory covers Search campaigns unless `--campaign-types` names others. A line starting
`NOT READ:` marks a criterion type or list the API refused; say so rather than infer it is empty.

## Report

```bash
npm run msads:report                                          # the 28 days ending yesterday
npm run msads:report -- --from 2026-10-29 --to 2026-11-12 --json
```

Per campaign: impressions, clicks, CTR, average CPC, spend, conversions and revenue. The
break-even cost per session is the same as for Google Ads (see `ads-advisor`): quote spend per
click against it, and call zero conversions on a small spend a sample too small to judge.

## Forecast

Ad Insight traffic estimates for the account's own keywords, at each campaign's daily budget,
bids and location and language targeting:

```bash
npm run msads:forecast
npm run msads:forecast -- --keywords "vat return software,mtd vat" --max-cpc-gbp 2
npm run msads:forecast -- --keywords-file keywords.txt
```

`--keywords` and `--keywords-file` add exact-match phrases to the forecast beside the live
keywords. `--max-cpc-gbp` is the bid used where the campaign sets none (default 1.00). Every
estimate has a minimum and a maximum; quote both, with the match type and the bid assumed.

## Proposing a change

The scripts here read only. To propose a change, say which campaign, ad group, keyword, bid or
budget changes, from what to what, with the forecast or report figures behind it, and leave the
change to the operator in the Microsoft Advertising UI. A forecast row for a phrase the account
does not hold is a proposal to add it, not a result.
