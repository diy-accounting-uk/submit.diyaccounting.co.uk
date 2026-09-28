<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: marketing strategy, from barely noticed to paying subscribers

## Operator assertions (verbatim, 2026-09-28)

> Please create a new PLAN_*.md doc to consider a marketing strategy. Incorporare the various
> tracking we have now in Google Analytics and Google Ads, and our colatoral (submit, diya-gl, and
> spreadsheets sites), extend REPORT_CAPABILITIES.md and the related skill to also include
> /Users/antony/projects/diy-accounting-limited/spreadsheets.diyaccounting.co.uk and the run the
> /capabilities skill and factor that into the marketing strategy. Web search on what we can do
> with YouTube and LinkedIn and web search to discover influencer's apetite for a referal fee (for
> conversions to paid) and also a more casual referal fee scheme a bit like
> https://www.policybee.co.uk/affiliates. Gather all we have with on sub-agent pass, then start a
> fresh sub-agent and have fable 5.1 do a further pass to create a sound strategy getting us from
> barely noticed to seeing real subscriver traffic (subscribers to the paid submit product not
> youtube subscribers).

Clarification (operator, 2026-09-28), on the referral scheme:

> This is not what I meant. I mean that I want you to evaluate diya submit offering a referral
> code so marketeers will push links to us

> PolicyBee is an example of a way of working. We'll keep that as a revenue source (aprox 1 per
> year) but it's not part of our own marketing to drive paid subscribers.

> For the marketing strategy, also look for people we can integrate with (e.g. open banking) who
> would then give us a back link for diya-gl.

> Regarding “Build or buy: in-house on the existing campaign-pass spec, or a platform such as
> Rewardful, FirstPromoter, Tolt or PartnerStack, costed at our size.” I want full programmatic
> control which favours “build” but I’ll consider platforms that are suitable for automation via
> claude code and real time APIs. Offloading referral payments and a referer dashboard to an
> external organisation is desirable because I want to limit personal effort dealing with
> referrers and shift the payee management liabilities to another organisation.

The goal is paid Submit subscribers. YouTube subscribers, followers and visits count only as
steps towards that.

## Strategy

One metric decides every channel: paid `resident` or `resident-pro` subscribers it produced, per
pound and per operator hour. Nothing measures that today, so the first work is the rails that
carry a visitor's source through sign-up to the Stripe charge. Then the channels, in the order
below, each with a target and a stop rule. The ranking rests on three measured facts: the only
buyers so far bought in a VAT deadline week and filed within the hour; the spreadsheets site has
the largest audience on our domains and sends almost nobody to Submit; and at the measured
purchase rate a paid click has to cost under £0.36 to pay back, which leaves cheap search as the
only paid channel until the rate itself moves.

Sources: `../marketing/RESEARCH_2026-09-28.md` (the dossier, §-references below are to it),
`REPORT_PRICE_UPDATE_REVIEW.md` (breakeven), `REPORT_CAPABILITIES.md` (capability ids),
`../developers/submit/backlog/PLAN_CAMPAIGN_AND_REFERRALS.md` (the referral spec),
`PLAN_DIYA_GL_LAUNCH.md` §3 to §5, `_developers/MARKETING_GUIDANCE.md` (HMRC wording, ASA).

### 1. Where we are, in numbers

Trailing 30 days to 2026-09-28 unless stated. "Consented" means the 13% of sessions that accept
the GA4 banner; every GA4 figure is a floor.

| Fact | Value | Source |
| --- | --- | --- |
| Breakeven | 31 annual `resident` subscribers (19 to 188 across cost bases) against £98/month fixed cost | price review §1 |
| Breakeven at September's AWS run-rate | 141 subscribers ($403 billed against a $65 target) | dossier §2 |
| Lifetime contribution, `resident` annual | £127 (£96 to £191); `resident-pro` annual £652 | price review §3c |
| Session-to-purchase | 0.28%, n = 2, 90% interval 0.05% to 0.9%, measured at 99p | price review §3a |
| Breakeven cost per session | £0.36; per paid subscriber £127 | price review §4 |
| Human sessions, Submit | 900 to 1,250 a month (GB proxy; true count unknown) | price review §1 |
| Sessions needed for 31 in 12 months | about 1,060 a month at 0.28%, 3 acquisitions a month | price review §3d |
| Real charges | 4 `resident-vat` charges (under £4); 9 donations (£195); 0 `resident` or `resident-pro` at the new prices | dossier §1, §2 |
| Submit funnel, consented | 100 sessions, 11 logins, 2 checkouts, 2 purchases | dossier §2 |
| Sign-up to first filing | 115 accounts, 3 filed; those who file do so within the hour | dossier §2 |
| Spreadsheets stream, consented | 929 sessions, 118 downloads, 105 books loaded, 6 cloud sign-ins, 3 cloud saves | dossier §2 |
| Spreadsheets to Submit | 2 sessions in 20 days | price review §3a |
| Traffic by channel, consented | Unassigned 154, Direct 96, Referral 50, Organic Search 28, Cross-network 17, Paid 2 | dossier §2 |
| Google Ads, 28 days | 18,094 impressions, 181 clicks, £10.82, £0.06 CPC, 0 conversions | dossier §2 |
| YouTube | 8+ public walkthroughs, 4 staged, 7 in flight; channel analytics unread; description links untagged | dossier §4 |
| Social | none | dossier §4 |
| Support corpus | 43 threads in 6 months; 10 article topics identified; nothing published | dossier §4 |
| HMRC VAT finder | listed among about 466; the "free version" flag is missing | dossier §5e |
| HMRC Income Tax finder | absent; ITSA is sandbox-only until recognition (NEXT.md O11) | dossier §5e |
| MTD Income Tax population | 864,000 mandated from 6 April 2026; about 2.9 million by 2028 | dossier §5e |
| VAT population | 2.29 million live traders | dossier §5e |

Unknown, and treated as unknown below: which channel produced any real sale; the true human
session count; renewal or churn for any bundle; the £39 purchase rate (the price experiment
`exp-2026-09-resident-price` opened 2026-09-22 and has no reading); YouTube's own analytics; the
outbound PolicyBee placement's clicks; any named creator's appetite for a fee.

The consequence for ranking. Traffic and purchase rate multiply. Doubling the rate is worth the
same as doubling traffic, and the rate work is on pages we own. The £0.36 ceiling means paid
acquisition cannot carry the plan at today's rate; owned channels and the two HMRC-driven demand
waves (the monthly VAT deadline and the Income Tax quarters) can.

### 2. Measurement first

Every channel below is judged on one view: paid subscribers by acquisition source. Build these
before spending an hour on any channel.

| # | Rail | What it does | Extends |
| --- | --- | --- | --- |
| M1 | Landing-page capture | `analytics.js` reads `utm_*`, `gclid` and `ref` from the landing URL and keeps them for the session (first touch wins). The session beacon carries them, so Athena sees the source without consent. | DATA-24, SITE-04, DATA-27 |
| M2 | Cross-site carry | The spreadsheets and diya-gl pages do the same and append the stored source to every link into Submit, so a visitor who arrives from a spreadsheets placement keeps that source. | SS-31, SS-21, SS-26 |
| M3 | Source on the account | At first sign-in the client posts the stored source; the account's bundle record gains an `acquisition` map (source, medium, campaign, ref code, gclid, landed-at). Attribution then needs no session join and no cookie. | account API, `dynamoDbBundleRepository` |
| M4 | Real money, by bundle | Stripe charges carry `bundle_id` and live/test mode; subscriptions carry an actor so probe rows drop out. Price review suggestions 4a, 4b and 5. | DATA-28, DATA-09 |
| M5 | The one view | `v_paid_subscribers_by_channel`: live Stripe charges on `resident` and `resident-pro`, joined by hashed sub to the acquisition map, by month and source. Plus the renewal view fixed to read `subscription-renewed`, so churn by channel follows. | DATA-28 |
| M6 | Ads conversion import | A nightly job uploads each live charge with a stored `gclid` as an offline conversion. Ads then counts 100% of purchases instead of the 13% GA4 consents. | DATA-32, DATA-22 |
| M7 | Video links | `videos/publish.json` gains a tagged link per video; the uploader writes it into the description and re-syncs the published ones. Nightly pull of YouTube Analytics (views, traffic sources, retention) into the lake. | OPS-93, DEV-41, DATA-46 |
| M8 | Cost and hours | `marketing.toml`: one row per channel per month, cash spent and operator hours. The dashboard divides paid subscribers by both. | DATA-26, SITE-21 |
| M9 | Human denominator | The visitor-kind view returns human sessions, so per-channel purchase rates have a denominator. | DATA-23, DATA-27 |
| M10 | Search Console | Nightly pull of impressions, clicks and queries per page, for the content channel. | DATA-06 sibling |

M1 to M5 gate everything. M6 gates any Ads spend above £1/day. M7 gates new videos. M8 is the
operator's ten minutes a month. Each channel launch is a row in `experiments.toml` (SITE-21).

### 3. Channels, ranked

Ranked by expected paid subscribers per pound and per operator hour. Targets are cumulative paid
`resident` or `resident-pro` subscribers attributed to the channel by M5; dates are the tax
calendar in §4. Where a figure is an assumption it says so.

| Rank | Channel | Cash | Operator hours | Target | By |
| --- | --- | --- | --- | --- | --- |
| 1 | Own properties: spreadsheets funnel, Submit's pages | £0 | 2 to review copy | 8 | 7 May 2027 |
| 2 | HMRC listings and bookkeeper word of mouth | £0 | 2 emails, 1 article review | 6 (2 `resident-pro`) | 7 May 2027 |
| 3 | Search and the support corpus | £0 | 5 to check tax content | 4 | 7 Aug 2027 |
| 4 | YouTube | £0 | 0 | 3 | 7 Aug 2027 |
| 5 | Submit's referral scheme, casual tier | £10 per sale, platform £60 to £75 a month | 1 a month | 5 | 7 May 2027 |
| 6 | LinkedIn, founder-led | £0 | 1 a week | 2 | 7 Aug 2027 |
| 7 | Google Ads, Search | £30 to £90 a month | 0 | 2 | 7 May 2027 |
| 8 | Submit's referral scheme, creator tier | £15 per sale, flat fees capped £300 | 3 per deal | 3 | 7 Nov 2027 |
| 9 | Integration partners and backlinks for diya-gl | £0 | 2 for applications | 2 | 7 Aug 2027 |

Sum at 7 May 2027: about 20; at 7 Aug 2027: about 33, past the breakeven of 31. The sum assumes the 0.28%
rate holds at £39. If the price experiment reads under 0.15%, rank 1's conversion work moves
ahead of everything and the paid rows pause.

#### 3.1 Own properties: the spreadsheets funnel and Submit's own pages

Why it fits. The spreadsheets site has the largest measured audience on our domains (929
consented sessions, 118 downloads, 105 books loaded a month) and the highest intent: these
visitors keep their own books and a third of them start a donation. Two of them a month reach
Submit. Donors paid £195 in a month against under £4 of subscriptions; the audience pays, and it
is offered the wrong product. On Submit, the price review measured that each extra ten logins a
month is worth 360 to 720 new sessions, and 11% of bundle-page sessions start checkout.

First steps.

1. On the BST and SE book pages, a "File this VAT return with HMRC" action on the VAT view, going
   to Submit's VAT page with the book's figures and a tagged link (M2).
2. After a local save, once per session, the cloud offer: "Keep this book online and on your
   phone, £39 a year", opening the existing cloud sign-in (SS-27).
3. The download page and every knowledge-base article footer carry the same two lines: file it,
   or keep it online.
4. The donate page offers `resident` beside the £45 donation (open question Q1).
5. Submit's home page leads with the deadline: "VAT return due 7 November" from the visitor's
   date; the login page states the three steps to a filed return.

Cost. £0. About 8 files across the two repositories.

Leading indicator. Sessions arriving at Submit with source `spreadsheets` or `diya-gl` a month;
cloud sign-ins a month. Today 2 in 20 days and 6 a month.

Target. 1 paid subscriber a month from 7 November 2026; 8 by 7 May 2027. The freemium benchmark
(2% to 5% of active free users, launch plan §3) says 105 consented book loads a month, if the
true count is five to eight times that, supports 16 to 40 a year; that is an assumption until M9
gives the denominator.

Stop rule. None for the channel. Each placement is removed when its click-through reads under
0.5% over three months.

#### 3.2 HMRC listings and bookkeeper word of mouth

Why it fits. Everyone mandated for MTD is sent to HMRC's software finder. It is the one place
where 864,000 people this year, and 2.9 million by 2028, look for exactly this product, and it
costs nothing. Submit's VAT listing lacks the "free version" flag that the target buyer filters
on. The Income Tax finder listing follows recognition (O11), and it is the entry point for the
whole Income Tax wave.

First steps.

1. Email HMRC's SDST asking for the "There is a free version of this software" flag on the VAT
   listing, citing the `day-guest` bundle.
2. Send the recognition email (O11, already on the board) and, when SDST answers, the production
   credentials request; then the Income Tax finder entry with the free flag from day one.
3. A "for bookkeepers and small practices" article on Submit: `resident-pro` at £199 a year, one
   sign-in for a client list, the passes to give clients. The ambassador tiers of the referral spec
   (3, 5 and 8 free passes a month) are built for this reader.
4. Wording stays inside `_developers/MARKETING_GUIDANCE.md`: "HMRC recognised", never
   "approved".

Cost. £0. Two operator emails, one article review.

Leading indicator. Sessions with referrer `tax.service.gov.uk` a month (the Referral channel
reads 50 today with no source; M1 gives the source).

Target. 4 `resident` and 2 `resident-pro` by 7 May 2027; each `resident-pro` is worth five
`resident`. If recognition lands before 7 February 2027, the Income Tax finder alone should
produce 5 in the quarter that follows.

Stop rule. None; a listing has no running cost. The practice article is rewritten, not removed,
if it reads under 20 sessions a month after three months.

#### 3.3 Search and the support corpus

Why it fits. Organic Search brings the most new users after Direct (16 of 28 sessions new, 16%
engaged). The spreadsheets domain has fifteen years of search standing. Forty-three support
threads in six months settle into ten article topics nobody else can write, because they are our
customers' questions. Deadline queries recur every month.

First steps.

1. Two deadline pages on Submit: the VAT return calendar (the 7th of every month, by stagger) and
   the MTD Income Tax quarters (7 August, 7 November, 7 February, 7 May, final declaration 31
   January), each with the filing action and the free tier.
2. The ten articles from `SUPPORT_MAIL_ANALYSIS_2026-09.md` on the spreadsheets knowledge base
   (BACKLOG 23, first slice), each ending in the two lines from 3.1. Machine-drafted; the
   operator checks the tax content.
3. Search Console into the lake (M10), so each page's impressions and clicks are read monthly.
4. Sitemaps regenerated (SS-25); Submit's sitemap gains the new pages.

Cost. £0. About 16 files. Five operator hours of review over two months.

Leading indicator. Organic sessions landing on the new pages a month; Search Console impressions
for "vat return deadline", "mtd income tax software", "free mtd vat software".

Target. 100 organic sessions a month on the new pages by 7 February 2027 (consented count 28
today across everything); 4 paid subscribers by 7 August 2027.

Stop rule. Stop writing new articles when a quarter's batch produces no page with over 20
organic sessions a month. Existing pages stay.

#### 3.4 YouTube

Why it fits. The recording and publishing pipeline exists (DEV-40, DEV-41); a new walkthrough
costs machine time. Eight are public. The research says multi-format channels (Shorts plus
long-form) grow three times faster in year one and 74% of Shorts views come from non-subscribers,
so Shorts are the discovery arm and the walkthroughs the proof. Cross-network sessions, where
YouTube appears, already show the best engagement of any channel (4 of 17). Finance content
carries the highest RPM, which matters only if the channel grows; the money is the sign-up.

First steps.

1. M7: every description link tagged with `utm_source=youtube&utm_campaign=<video>`; a pinned
   comment with the same link; the published descriptions re-synced.
2. Deadline-timed titles for the existing recordings: "File your VAT return before 7 November",
   "Your first MTD Income Tax quarterly update, due 7 November 2026 (sandbox)". One re-title a
   week, no re-recording.
3. Shorts: a cut under 60 seconds per journey from the existing captures, 9:16, uploaded as a
   Short with the same tagged link. The vertical framing of a desktop UI is the design question;
   a zoomed pan across the scene's focus region is the first attempt.
4. Cadence from the research: 2 Shorts a week, one walkthrough every 2 to 3 weeks, tied to the
   VID rows already on the board. Comment replies stay behind BACKLOG 78's gate.
5. The YouTube Analytics pull (M7) reads retention; a walkthrough under 50% at 60 seconds gets a
   shorter cut.

Cost. £0. About 8 files. YouTube's daily upload limit (OYT1) sets the pace until advanced features
clear.

Leading indicator. Sessions with source `youtube` a month; views per video; retention at 60
seconds.

Target. 30 tagged sessions a month by 7 February 2027; 3 paid subscribers by 7 August 2027.

Stop rule. After six months and 20 videos, under 30 tagged sessions a month: no new tutorials,
release videos only. The channel stays as the proof library the site plays (OPS-94).

#### 3.5 Submit's own referral scheme

The scheme. Submit issues a referral code to anyone who will send people to it, and pays a fee
when a referred visitor becomes a paid subscriber. PolicyBee's affiliates page is the model for
the way of working: a short application, a trackable link, a flat bounty per sale, the merchant
handles the customer, the affiliate does nothing after the click. Our own placement on their
scheme stays as it is, about one sale a year, and is not part of this plan.

Why it fits. The referral spec (`PLAN_CAMPAIGN_AND_REFERRALS.md`) is written and unbuilt
(BACKLOG 15) and its data model, `referral#` items with a `referred-index`, carries a code as well
as a pass. Stripe checkout and the billing webhook exist. The buyers we want, sole traders and
landlords, are reached by bookkeepers, forum owners and small creators we cannot reach directly,
and a fee paid only on a paid subscription costs nothing until it works. A £10 bounty is 8% of the
£127 lifetime value; a breakeven paid click costs £127 per subscriber.

Two tiers.

| Tier | Who | How they join | Terms |
| --- | --- | --- | --- |
| Casual | Anyone with a UK audience of sole traders, landlords or small companies: bookkeepers, accountants, forum owners, bloggers, existing customers | Sign-up on the platform's hosted page, the operator approves; existing customers get a code from the bundles page with their campaign passes | The standard fee below; the customer-to-customer variant pays in the spec's credits (tokens, free months) instead of cash |
| Creator | YouTubers, newsletter writers and podcasters with a measured audience in the niche | Invited (3.8) | The creator fee below, a `resident-pro-comp` bundle to make content with, negotiated flat fee only inside the £300 cap |

The fee, three shapes against the £39 price (kept £38.22 a year; lifetime contribution £127 at
30% churn; breakeven contribution £3.17 a month):

| Shape | Casual | Creator | Cost as share of lifetime value | Months of contribution to repay | For | Against |
| --- | --- | --- | --- | --- | --- | --- |
| Flat bounty on the first paid year | £10 per `resident`, £40 per `resident-pro` | £15 and £60 | 8% (12%) | 3.2 (4.7) | One payment, one commission line, the shape PolicyBee pays; the referrer knows the number | Pays the same for a customer who churns at month 13 |
| Percent of the first year | 25%: £9.75 and £49.75 | 40%: £15.60 and £79.60 | 8% (12%) | 3.1 (4.9) | Scales with `resident-pro` | Monthly buyers pay £1 a charge for a year; twelve statement lines per customer |
| Recurring share | 20% of every charge: £7.64 a year, about £25 over a lifetime | 25%: about £32 | 20% (25%) | 2.4 a year, every year | Rewards referrers for customers who stay | Lifetime liability, a statement for ever, and the share of a £3.17 monthly contribution leaves £2.54 |

Recommendation. Flat bounty, paid once, on the first annual charge or the third monthly charge
(so a monthly buyer has paid £11.19 kept before the fee). `resident-vat`, `day-guest`, refunds,
disputes and self-referrals pay nothing. The recurring shape exists in the spec as the
customer-to-customer credit (a free month per subscription, capped at 12) and stays there. Q2
holds the flat-versus-percent choice.

Attribution window. 30 days from click to sign-up; 90 days from sign-up to first charge (Xero
uses a 30-day cookie; PolicyBee pays after a month active). The code is stored on the account at
sign-up (M3), so after that no cookie is involved and the window is a date comparison. Q7.

End to end, code to Stripe charge.

| Step | What happens | Built by |
| --- | --- | --- |
| Issue | The affiliate signs up on the platform's hosted page; the operator approves; the platform's webhook creates an `affiliate#<code>` item in the bundles table (tier, fee, status, created) so our attribution knows the code. A signed-in customer's own code appears beside their campaign passes on `bundles.html`. A QR comes from the existing pass pages. | MK-22, MK-23, MK-38 |
| Link | `https://submit.diyaccounting.co.uk/?ref=<code>`; the same parameter works on the spreadsheets and diya-gl pages and is carried into Submit (M2) | MK-1, MK-2 |
| Capture | `analytics.js` stores the code at landing, first touch wins, 30-day expiry (M1) | MK-1 |
| Attribution at sign-up | First sign-in writes `acquisition.ref` on the bundle record, once; a `referral#<code>` / `referred#<hashedSub>` item follows (spec §1.1) | MK-3, MK-22 |
| Attribution at checkout | `billingCheckoutPost` puts the code, the platform's click id and the hashed sub in the Stripe checkout metadata, so the charge itself carries the referrer even if the account record is ever lost | MK-22, MK-40 |
| Conversion | `handleCheckoutComplete` sets `subscribedAt` on the referral item, credits the referrer (spec §2.3), and the charge lands in Athena with `bundle_id` and mode (M4) | MK-22, MK-4 |
| Count | `v_paid_subscribers_by_channel` by `ref` code (M5); the platform's commission webhooks land beside it for reconciliation | MK-5, MK-25 |
| Pay | The platform pays the affiliate from a balance we fund, with its own KYC and tax forms; we pay nobody by hand | MK-38, MK-39 |

Fraud and self-referral rules.

| Rule | Check |
| --- | --- |
| No self-referral | Reject when the code's owner hash equals the redeemer's hashed sub or hashed email; reject when the Stripe customer already exists |
| One referrer per account | `acquisition.ref` is written once; `referred-index` rejects a second referral item (spec §4) |
| New accounts only | A code on a returning sign-in is ignored |
| Money must clear | Commission only on a live-mode charge; a refund or dispute inside 30 days reverses it (the platform's clawback) |
| Volume cap | More than 5 conversions a day on one code holds that code's commissions for review |
| Disclosure breach | Code revoked; unpaid commissions forfeited |
| Privacy | No device fingerprinting and no IP matching; the rules above use data the account already holds |

Payout mechanics and thresholds. The platform pays monthly from a balance we top up, after a
30-day hold, at a minimum the platform sets (Dub pays at $100 automatically; Rewardful and Tolt
let the merchant set it). UK affiliates paid in GBP by bank transfer through the platform's payout
rail. Affiliates handle their own tax; the platform collects the identity and tax information its
rail needs. We fund one invoice a month and touch no payee record.

Disclosure under the ASA/CAP code. An affiliate's post that carries the link is an ad in its
entirety. The agreement requires the label upfront (#ad or #advert) before the engagement point:
before "read more", in the first three seconds of a video, in a podcast's introduction. Affiliates
use only the wording `_developers/MARKETING_GUIDANCE.md` permits ("HMRC recognised", never
"approved" or "endorsed"). The scheme page states the rules; the CMA can fine for undisclosed
placements since April 2025, so the rule is enforced by revocation on the first breach.

Build or buy. The operator's criteria: full programmatic control, which favours build; payouts,
payee liability and the referrer dashboard offloaded to another organisation, which favours a
platform. Each candidate against five tests (web research, read 2026-09-28; sources at the end of
this section).

| Platform | API and webhooks | Stripe attribution and clawback | Pays affiliates itself |
| --- | --- | --- | --- |
| Rewardful | REST API from the Growth plan; Stripe webhooks drive commissions | Native: reads Stripe customers, invoices, refunds; refund reverses the commission | Managed Payouts on every plan: we fund one payment, Rewardful distributes, collects tax and identity by country; 3% fee |
| Dub Partners | API-first: partners, links, commissions, payouts, webhooks; server-side conversion tracking | Native Stripe integration; refunds handled server-side | Yes, through Stripe Express (PayPal where Stripe is absent); W-9/W-8 collected; payout fee 3% to 5% by plan, automatic at $100 |
| Tolt | API for Stripe, Paddle, Chargebee; webhook support not published | Native Stripe | Auto-payouts on Growth and above: Tolt invoices us and pays affiliates by PayPal or Wise; 2% fee |
| FirstPromoter | API and webhooks | Native Stripe | No: payouts run from our own PayPal, Wise or Stripe account, one click; it generates W-9, W-8BEN and EU invoices |
| PartnerStack | API | Native | Yes, with tax forms; 1.5% to 3.5% payout fee | 
| Tapfiliate | API | Native | Through Trolley, a third party; its own payouts announced for 2026 |
| PromoteKit | Limited | Native Stripe | No: PayPal or Wise from our account |
| Cello | Embedded widget, less API surface | Yes | Yes, user-referral focus | 
| Stripe Connect Express, in-house | Ours entirely | Ours (M1 to M5) | Stripe does identity and KYC for each connected account and pays in GBP; the ledger, dashboard, statements and any tax reporting stay with us |

| Platform | Hosted dashboard and sign-up | Cost at tens of affiliates, a handful of conversions a month | UK and GDPR |
| --- | --- | --- | --- |
| Rewardful | Yes, branded portal and sign-up page | $99 a month (Growth, the first plan with the API) plus 3% of payouts; about £75 a month | EU and UK merchants common; GBP payouts through the managed rail |
| Dub Partners | Embedded components and a hosted partner portal | $75 to $90 a month plus the payout fee; about £60 to £70 | Stripe Express supports UK payees in GBP |
| Tolt | Yes | $99 a month (Growth, for auto-payouts) plus 2%; about £75 | PayPal and Wise pay GBP |
| FirstPromoter | Yes | $49 to $149 a month; payouts stay our liability | Fine, but fails the offload test |
| PartnerStack | Yes | $500+ a month, sales-led | Five times the fixed cost base |
| Tapfiliate | Yes | $89+ a month plus Trolley | Fine, two vendors |
| PromoteKit | Basic | about $29 a month | Fails the offload test |
| Cello | Yes | Usage-based, sales-led | Built for in-product user referral, not marketers |
| Stripe Connect Express, in-house | We build it | No platform fee; Connect per-account and per-payout fees only; the build is about 15 files and the dashboard is ours to keep running | Stripe holds the KYC; the payee relationship stays ours |

Recommendation. Hybrid. Our code, capture, attribution at sign-up and at checkout (M1, M3, the
checkout metadata) stay in this repository, because they are the plan's measurement layer and
they give the control the operator wants. The commission ledger, affiliate sign-up page,
dashboard, payouts, KYC and tax forms go to a platform driven only through its API, with the
programme's terms declared in `referrals.toml` and applied by a sync script on the `ads-sync.js`
pattern (DATA-32), so nothing needs a console. Dub Partners is the first candidate: API-first,
Stripe Express as the payout rail, embedded and hosted dashboards, about £60 to £70 a month.
Rewardful Growth is the fallback: the most mature managed payout, API from £75 a month. Tolt Growth
is the third. FirstPromoter, PromoteKit and a Connect build fail the offload test; PartnerStack
fails on price; Cello fails on fit. Q10 holds the choice.

Two ledgers. Ours (M5) is authoritative for measurement and for the stop rules; the platform's is
authoritative for payment. The platform's commission webhooks land in the lake and a
reconciliation view lists any code where the two disagree.

Timing. The platform account opens when the first affiliate is approved (phase 1), because the
hosted sign-up page is the recruitment surface and the operator's stated aim is to deal with no
referrer by hand. Until then the scheme is closed to applications and the cost is £0.

First steps.

1. M1, M3, M4, M5.
2. Spec blocks 1 to 3 with the `ref`-at-sign-up write and the checkout metadata (MK-22); then
   blocks 4 and 5 for the customer-to-customer credits (MK-23).
3. The platform account (MK-39), `referrals.toml` and its sync (MK-38), the webhook ingest and
   reconciliation view (MK-25).
4. `affiliates.html` on Submit: the tiers, the fee, the window, the rules, the disclosure clause,
   and the link to the platform's sign-up page (MK-24).
5. The first five casual affiliates invited by hand: bookkeepers who wrote to support in the last
   year, then the diya-gl npm and Homebrew users (SS-20) through the package README (MK-26).

Cost. £60 to £75 a month for the platform once the first affiliate is approved, plus 2% to 5% of
payouts, plus £10 or £40 per paid conversion. Under one operator hour a month: approvals and one
top-up.

Leading indicator. Codes issued; sessions carrying a code; sign-ups with a referral item;
commissions created.

Target. 5 affiliates by 31 January 2027; 5 paid subscribers by 7 May 2027.

Stop rule. Ten approved affiliates and no paid subscriber in six months: close applications,
cancel the platform, keep the customer-to-customer credits in-house.

Sources (read 2026-09-28): [Rewardful pricing](https://www.rewardful.com/pricing), [Rewardful
Managed Payouts FAQ](https://help.rewardful.com/en/articles/11930744-merchants-faq-managed-payouts),
[Dub vs Rewardful](https://dub.co/blog/dub-vs-rewardful), [Dub payouts](https://dub.co/help/article/receiving-payouts),
[Tolt pricing](https://tolt.com/pricing), [Tolt payments](https://tolt.com/platform/payments),
[FirstPromoter: how to pay your promoters](https://help.firstpromoter.com/en/articles/8971513-how-to-pay-your-promoters),
[PartnerStack payouts](https://partnerstack.com/payouts), [Tapfiliate automated payouts](https://support.tapfiliate.com/en/articles/7190765-automated-affiliate-payouts),
[PromoteKit PayPal payouts](https://docs.promotekit.com/payouts/paypal-mass-payments), [Stripe Connect
Express accounts](https://docs.stripe.com/connect/express-accounts), [PolicyBee affiliates](https://www.policybee.co.uk/affiliates),
[ASA/CAP: recognising ads on social media](https://www.asa.org.uk/advice-online/recognising-ads-social-media.html).

#### 3.6 LinkedIn, founder-led

Why it fits. Personal profiles get about eight times a company page's engagement; company page
reach fell 60% to 66% in two years. LinkedIn Ads cost £50 to £150 a lead against a £127 lifetime
value, so paid LinkedIn is out at this price. The readers who matter there are bookkeepers and
accountants (`resident-pro`) and the tech community the diya-gl launch plan (§5b) wants to reach
with "15 KB for a year of accounts".

First steps.

1. The operator's profile states the product in one line and links to Submit with a tagged link.
2. A company page exists for the entity record only; no spend.
3. One post per deadline cycle (the week before the 7th) and one per release. Machine-drafted from
   a staged directory (BACKLOG 81's first slice), posted by hand, so BACKLOG 78's review gate is
   the operator's own read.
4. The diya-gl Show HN post from the launch plan goes out the same week as its LinkedIn post.

Cost. £0. One operator hour a week.

Leading indicator. Sessions with source `linkedin` a month.

Target. 2 paid subscribers, one of them `resident-pro`, by 7 August 2027.

Stop rule. Under 20 tagged sessions a month after three months: release posts only.

#### 3.7 Google Ads, Search

Why it fits, and what is wrong. 181 clicks at £0.06 is cheap traffic, six times under the £0.36
ceiling. Zero conversions is consistent with 0.28% (0.5 expected). Two faults make the campaign
unjudgeable: Ads sees a conversion only from the 13% of sessions that consent, so bidding to
conversions learns from nothing; and Performance Max hides its keywords, so the clicks cannot be
read against intent. Both buyers so far bought in deadline week.

Changes.

1. M6 first, so every purchase reaches Ads.
2. A Search campaign declared in `ads.toml` (DATA-32 creates a missing Search campaign outright):
   exact and phrase match on "submit vat return online free", "free mtd vat software", "mtd
   income tax software", "file vat return without accountant"; GB only. Bidding
   `maximize_clicks` until M6 has counted five conversions, then target CPA £30.
3. Performance Max paused (Q4).
4. Budget £1 a day; £3 a day from the 1st to the 7th of each month once the first imported
   conversion exists.

Cost. £30 to £90 a month.

Leading indicator. Imported conversions a month; cost per imported conversion; clicks by
keyword.

Target. 2 paid subscribers by 7 May 2027 at under £30 each.

Stop rule. Over a quarter with 500 or more clicks, cost per imported conversion above £60:
pause. Under 0.15% click-to-purchase over the same window: pause and return to 3.1.
#### 3.8 The referral scheme's creator tier

Why it fits, later. UK nano creators charge £20 to £150 a post, micro creators £250 to £2,000,
with a two to three times premium for finance; affiliate commissions run 10% to 30%. No UK
sole-trader, landlord or bookkeeping creator's appetite for our fee has been measured, and none
has been asked. A flat fee before a measured conversion rate on the casual tier is a bet with no
odds, so the creator tier opens once three casual affiliates have each converted a subscriber.

Terms. The creator fee from 3.5 (£15 per `resident`, £60 per `resident-pro`), a
`resident-pro-comp` bundle to make the content with, the same code, window, rules and disclosure
clause. One paid nano post as a test, capped at £150, inside a £300 first-year cap on flat fees
(Q6).

First steps.

1. A shortlist of ten UK creators (audience size, platform, contact route) in the private
   workspace folder `../marketing/`, never in this repository (MK-29).
2. Outreach with the creator terms once 3.5 has its third converting affiliate.

Cost. Bounty; £300 cap on flat fees in the first year. Three operator hours per deal.

Leading indicator. Replies to outreach; sessions carrying each creator's code.

Target. One deal by 7 May 2027; 3 paid subscribers by 7 November 2027.

Stop rule. A paid post that produces under 20 code-carrying sessions is the last paid post.
#### 3.9 Integration partners and backlinks for diya-gl

Why it fits. diya-gl already reads a NatWest statement CSV (MCP-10), Stripe balance transactions
and payouts (DATA-49, DATA-51) and PayPal transactions (DATA-48), ships an MCP server (SS-06) and
publishes to npm, GHCR and Homebrew (SS-20). Each platform a book can be filled from has a public
place that lists what works with it, and a listing there is a backlink to `diya-gl.co.uk` from a
domain that ranks, plus a stream of visitors who already keep books. Those visitors reach Submit
through the placements in 3.1. Web research read 2026-09-28; sources at the end of this section.

The regulatory line. Pulling a customer's bank transactions through open banking is an account
information service. The routes are: our own FCA registration (application fee in the hundreds of
pounds, six to nine months), an agent of a licensed aggregator (Plaid and Moneyhub offer this;
Plaid charges nothing upfront and the FCA reviews an agent in about two months), or an
aggregator's licence with sales-led pricing (TrueLayer and Yapily publish no price; the realistic
production floor is £150 to £500 a month). GoCardless Bank Account Data, the former free tier,
closed to new sign-ups in July 2025. Enable Banking's free restricted production covers only
accounts the developer links personally. Against a £98 a month cost base, a live bank feed waits
until subscribers pay for it; whether a tool that writes only the signed-in user's own
transactions into their own book falls outside AIS is a question for a regulatory adviser, and the
answer decides which of the routes below open. Reading the CSV a bank already exports needs no
permission and is what the free rung does today.

Candidates, ranked by backlink value against effort, with the regulatory line applied.

| Rank | Partner | What the integration takes | Listing and link |
| --- | --- | --- | --- |
| 1 | MCP registries: official registry, Glama, PulseMCP, mcp.so, Smithery, awesome-mcp-servers | `server.json` for the existing diya-gl MCP server; one CLI publish, four web forms, one PR | All free; every one gives a public page linking to the project |
| 2 | Package registries: npm, GHCR, Homebrew, GitHub topics | Already published (SS-20); add topics, a README "works with" section and the site link | Free; npm and GitHub pages link back |
| 3 | Stripe Partner Ecosystem, Apps track | A Stripe App that exports a period's balance transactions as diya-gl lines, built on DATA-49 and DATA-51; app review; the programme raised its baseline in April 2026 | Free to join; App Marketplace page and Partner Directory entry, both linking out |
| 4 | Zapier public integration | A Zapier app over the cloud store API (SS-27, Submit's Cognito), triggers "book saved", actions "add line"; public integration required for the partner programme | Free; a public app page with a link, tiered by active users |
| 5 | Bank CSV imports: Starling, Monzo, Tide, Revolut Business, Wise | Extend MCP-10's parser per export format; a "works with" page per bank on diya-gl.co.uk | No partner link; our own pages rank for "import <bank> CSV" and are the evidence for ranks 6 and 7 |
| 6 | Starling Marketplace | An integration on Starling's partner API, vetted by Starling; a live account connection, so the regulatory line applies | Public partner page on starlingbank.com |
| 7 | Revolut Business integrations hub, Wise Business App Marketplace, Tide accounting integrations, Monzo | Bank feeds through the bank's API or an aggregator; curated lists; the regulatory line applies | Public integration pages on each bank's domain |
| 8 | Open banking aggregators: TrueLayer, Yapily, Plaid, Moneyhub, Token | Supplier contracts, sales-led; a listing only as a customer case study | A backlink only with a case study |
| 9 | Receipt capture and invoicing: Dext, Hubdoc, AutoEntry | Being a destination platform in their integration list; they push to accounting software over an API we do not yet expose | Public integration pages; audience is accountants |
| 10 | PayPal Partner Directory | Gold partner status | Out of reach at this scale |

SEO and referral value. Ranks 1 and 2 give many links from developer domains and a small stream
of technical visitors, the audience the diya-gl launch plan (§5b) already targets. Rank 3 is the
one high-authority commercial listing reachable without a regulated feed, and its visitors are
UK online sellers who file VAT. Rank 4 adds a well-ranked app page. Ranks 6 and 7 are the
bank-customer audiences that fit `resident` best and carry the regulatory cost. The value to
Submit is the 3.1 funnel: a diya-gl visitor who loads a book sees the filing action and the cloud
offer.

Recommendation. Do ranks 1, 2 and 5 now (£0, machine-only). Apply to the Stripe Partner Ecosystem
and build the Stripe App in phase 2. Zapier after the cloud store API is stable. Open the
regulatory question with one written enquiry (Q9); Starling and the other banks wait on its
answer and on 50 paid subscribers, the point at which £150 a month of aggregator fee is under a
tenth of revenue.

First steps.

1. `server.json` and the registry publishes; README topics and "works with" section (MK-32).
2. Bank CSV parsers and the "works with" pages (MK-33).
3. Stripe partner application and the App (MK-34, MK-35).
4. The AIS enquiry (MK-36).

Cost. £0 for ranks 1, 2, 5; Stripe and Zapier are machine time; banks carry the aggregator fee
or the agent registration.

Leading indicator. Referring domains to `diya-gl.co.uk` (Search Console, M10); sessions with
referrer from each listing.

Target. 8 listings live by 31 January 2027; 100 referred sessions a month by 7 May 2027; 2 paid
subscribers by 7 August 2027.

Stop rule. A listing has no running cost and stays. The Stripe App is not extended past its
first version if it reads under 20 installs in six months. No bank feed work starts before Q9 is
answered and 50 paid subscribers exist.

Sources (read 2026-09-28): [Stripe Partner Ecosystem](https://docs.stripe.com/partners),
[Stripe App listing guidelines](https://docs.stripe.com/stripe-apps/listing-guidelines),
[Starling developers, partner](https://developer.starlingbank.com/partner), [Starling Marketplace for
businesses](https://www.starlingbank.com/business-account/marketplace-for-businesses/), [Revolut
Business integrations](https://www.revolut.com/business/integrations/), [Wise: connecting your account
with accounting software](https://wise.com/help/articles/2960247/connecting-your-wise-account-with-accounting-software),
[Tide accounting integrations](https://www.tide.co/features/accounting-integrations/), [Monzo open
banking API](https://docs.monzo.com/open-banking/), [PayPal partner FAQs](https://www.paypal.com/uk/webapps/mpp/partner-programme/faqs),
[Plaid: FCA registration and the agency model](https://plaid.com/blog/fca-registration-and-how-plaid-can-help/),
[Yapily: how to become an AISP](https://www.yapily.com/blog/how-to-become-an-aisp), [FCA application
fees](https://www.fca.org.uk/firms/authorisation/apply/fees), [Open Banking Tracker: free open banking
APIs 2026](https://www.openbankingtracker.com/guides/free-open-banking-apis), [dev.to: cheapest open
banking APIs 2026](https://dev.to/johnfrandsen/the-cheapest-open-banking-apis-for-small-businesses-and-indie-builders-in-2026-5cab),
[GoCardless Bank Account Data setup note](https://actualbudget.org/docs/advanced/bank-sync/gocardless/),
[Zapier partner program](https://docs.zapier.com/platform/publish/partner-program), [MCP registry](https://github.com/modelcontextprotocol/registry),
[awesome-mcp-registries](https://github.com/tuanone123/awesome-mcp-registries).

### 4. Timeline, on the tax calendar

Fixed dates. VAT returns are due on the 7th of every month for one third of traders (one month
and seven days after the quarter end). MTD Income Tax quarterly updates for the first cohort are
due 7 November 2026, 7 February 2027, 7 May 2027 and 7 August 2027; the final declaration for
2026-27 is due 31 January 2028. The 2025-26 Self Assessment deadline is 31 January 2027, and the
over-£30,000 cohort joins MTD Income Tax on 6 April 2027. Every deadline week is a launch week.

| Phase | Window | Ships | Milestone (cumulative paid `resident`/`resident-pro`) |
| --- | --- | --- | --- |
| 0 Rails | now to 7 Nov 2026 | M1 to M8; HMRC free-flag email; tagged video links; spreadsheets placements (3.1 steps 1 to 3); deadline home page; MCP and package listings | 2, each with a known source. First reading of the £39 purchase rate |
| 1 Content and referral | 7 Nov 2026 to 31 Jan 2027 | Deadline pages; first five articles; referral spec blocks 1 to 3; `affiliates.html` and first five affiliates; LinkedIn profile and first posts; Search campaign at £1/day with M6; bank CSV imports and "works with" pages | 8; 5 affiliates approved; organic 100 sessions a month on new pages; 8 listings live |
| 2 The Income Tax wave | 1 Feb to 7 May 2027 | Remaining articles; campaign passes and bundles UI; Shorts; Ads £3/day in deadline weeks; Income Tax finder listing if recognised; creator outreach if 3.5 converted; Stripe App | 20 |
| 3 Breakeven | 7 May to 7 Aug 2027 | Channel review against every stop rule; the survivors get the hours; Zapier app | 31 |
| 4 Hold and grow | 7 Aug to 7 Nov 2027 | Creator deal; second content batch; `resident-pro` push to practices before the 31 January 2028 final declaration; bank feed route if Q9 and 50 subscribers allow | 50 |

Reaching 31 by 7 August 2027 needs 3 acquisitions a month from November 2026 at 30% annual
churn. If phase 1 closes under 5, the phase 2 review moves every hour to 3.1 and 3.2 and pauses
3.6 to 3.8.

### 5. Tasks

Proposed rows; the coordinator places them. Kind: machine-only, machine-ask (a machine row with
one operator decision or step inside it), human-driven. Model is the lowest that fits.

| Id | Change | Kind | Files | Model |
| --- | --- | --- | --- | --- |
| MK-1 | M1: `analytics.js` captures `utm_*`, `gclid`, `ref` at landing; the session beacon carries them; `v_traffic_sources_daily` gains a source column (DATA-24, SITE-04, DATA-27) | machine-only | ~5 | Sonnet |
| MK-2 | M2: the spreadsheets and diya-gl `analytics.js` twin captures the same and appends the stored source to every link into Submit (SS-31, SS-21, SS-26) | machine-only | ~4 | Sonnet |
| MK-3 | M3: `acquisition` map on the bundle record, written from the client's stored source at first sign-in; unit tests | machine-only | ~5 | Sonnet |
| MK-4 | M4: `bundle_id` and live/test on Stripe charge rows; actor on subscription rows; probe exclusion in the cancellation view (DATA-28, DATA-09) | machine-only | ~5 | Sonnet |
| MK-5 | M5: `v_paid_subscribers_by_channel`; renewal view reads `subscription-renewed` (DATA-28) | machine-only | ~3 | Sonnet |
| MK-6 | M8: dashboard panel, paid subscribers by channel with cost and hours per subscriber from `marketing.toml` (DATA-26, SITE-21) | machine-only | ~4 | Sonnet |
| MK-7 | M8: `marketing.toml` with one row per channel per month; the operator fills hours | machine-ask | 1 | Haiku |
| MK-8 | M6: nightly offline conversion upload to Google Ads from live charges with a stored `gclid` (DATA-32, DATA-22) | machine-only | ~4 | Opus |
| MK-9 | 3.7: Search campaign in `ads.toml` with the four keyword groups, `maximize_clicks`, £1/day; Performance Max paused; applied with `ads:sync -- --apply` on the operator's yes (DATA-32) | machine-ask | 2 | Sonnet |
| MK-10 | M7: `publish.json` link per video with UTM; `youtube-upload.js` writes and re-syncs descriptions; pinned comment (OPS-93, DEV-41) | machine-only | ~4 | Sonnet |
| MK-11 | M7: nightly YouTube Analytics pull into the lake; the OAuth client gains the analytics scope (operator consents once) (DATA-22, DATA-46) | machine-ask | ~4 | Sonnet |
| MK-12 | 3.4: Shorts cut under 60 s, 9:16, per journey from existing captures, uploaded as Shorts with the tagged link (OPS-90, OPS-93) | machine-only | ~4 | Opus |
| MK-13 | 3.4: deadline-timed titles and descriptions for the eight public videos, re-synced | machine-only | 1 | Haiku |
| MK-14 | 3.1 steps 1 to 3: "file with HMRC" on the BST/SE VAT view, post-save cloud offer, download page and article footer lines, all tagged (SS-26, SS-27, SS-21, SS-23) | machine-only | ~6 | Sonnet |
| MK-15 | 3.1 step 4: `resident` beside the donation on the donate page (SS-22); blocked on Q1 | machine-ask | 2 | Sonnet |
| MK-16 | 3.1 step 5: Submit home page deadline line from the visitor's date; login page states the three steps | machine-only | ~3 | Sonnet |
| MK-17 | 3.3 step 1: VAT deadline calendar page and MTD Income Tax quarters page on Submit, in the sitemap and the CloudFront invalidation list (SITE-10) | machine-only | ~5 | Sonnet |
| MK-18 | 3.3 step 2: the ten support-corpus articles on the spreadsheets knowledge base, drafted for the operator's tax-content check (SS-23, BACKLOG 23) | machine-ask | ~12 | Sonnet |
| MK-19 | M10: nightly Search Console pull into the lake; the property is verified once by the operator (DATA-06 sibling) | machine-ask | ~4 | Sonnet |
| MK-20 | 3.2 step 1: email HMRC's SDST for the "free version" flag on the VAT listing | human-driven | 0 | none |
| MK-21 | 3.2 step 3: the bookkeeper and small-practice article with the `resident-pro` offer and the passes | machine-only | 2 | Sonnet |
| MK-22 | 3.5: referral spec blocks 1 to 3 plus the `affiliate#<code>` item, the `ref`-at-sign-up write, the checkout metadata and the conversion write in the billing webhook (BACKLOG 15) | machine-only | ~9 | Sonnet |
| MK-23 | 3.5: referral spec blocks 4 and 5, campaign passes, ambassador tiers, the customer's own code beside the passes on `bundles.html`, behaviour test | machine-only | ~10 | Sonnet |
| MK-24 | 3.5: `affiliates.html` with the tiers, fee, window, rules, disclosure clause and the link to the platform's sign-up page; terms fixed by Q2, Q7, Q10 | machine-ask | ~3 | Sonnet |
| MK-25 | 3.5: platform commission webhooks ingested into the lake; reconciliation view against `v_paid_subscribers_by_channel` per code (DATA-22, DATA-28) | machine-only | ~4 | Sonnet |
| MK-26 | 3.5 step 5: approve and invite the first five casual affiliates | human-driven | 0 | none |
| MK-27 | 3.6: LinkedIn profile line, company page, first post | human-driven | 0 | none |
| MK-28 | 3.6: staged post templates for the deadline cycle and releases, posted by hand (BACKLOG 81 first slice) | machine-only | ~3 | Haiku |
| MK-29 | 3.8: creator shortlist and terms sheet in the private `../marketing/` folder | machine-ask | 1 | Sonnet |
| MK-30 | M9: visitor-kind view returns human sessions (DATA-23, DATA-27) | machine-only | ~4 | Sonnet |
| MK-31 | `experiments.toml` row per channel launch, objective `conversion-to-paid` (SITE-21) | machine-only | 1 | Haiku |
| MK-32 | 3.9 ranks 1 and 2: `server.json` and publishes to the official MCP registry, Glama, PulseMCP, mcp.so and Smithery; awesome-mcp-servers PR; npm README "works with" section and GitHub topics (SS-06, SS-20) | machine-only | ~3 | Sonnet |
| MK-33 | 3.9 rank 5: CSV parsers for Starling, Monzo, Tide, Revolut Business and Wise exports beside MCP-10's NatWest parser, with fixtures; one "works with" page per bank on diya-gl.co.uk, in the sitemap (SS-25) | machine-only | ~14 | Sonnet |
| MK-34 | 3.9 rank 3: Stripe Partner Ecosystem application, Apps track, from the live Stripe account | human-driven | 0 | none |
| MK-35 | 3.9 rank 3: a Stripe App exporting a period's balance transactions and payouts as diya-gl lines (DATA-49, DATA-51), submitted for App Marketplace review | machine-only | ~8 | Opus |
| MK-36 | 3.9: one written enquiry on whether writing a signed-in user's own transactions into their own book is an account information service; the answer recorded in `PLAN_DIYA_GL_LAUNCH.md` §5d | human-driven | 0 | none |
| MK-37 | 3.9 rank 4: Zapier public integration over the cloud store API, triggers and actions, submitted for listing (SS-27); blocked on the cloud store API being stable on prod | machine-ask | ~6 | Sonnet |
| MK-38 | 3.5: `referrals.toml` declaring the programme (tiers, fees, window, hold, minimum payout) and `referrals-sync.js` applying it through the platform's API on the `ads-sync.js` pattern, with the platform's secrets in Secrets Manager (DATA-32 pattern) | machine-only | ~5 | Opus |
| MK-39 | 3.5: open the platform account (Q10), authorise its Stripe connection, fund the first balance | human-driven | 0 | none |
| MK-40 | 3.5: pass the platform's click id through sign-up and `billingCheckoutPost` (`client_reference_id` and metadata) so the platform and our `acquisition.ref` attribute the same charge | machine-only | ~4 | Sonnet |

### 6. Open questions for the operator

| Q | Decision | Alternatives |
| --- | --- | --- |
| Q1 | The donate page's offer | (a) `resident` at £39 a year shown beside the donation amounts; (b) donation-only, `resident` offered on the book pages alone |
| Q2 | Affiliate fee shape | (a) flat £10 per `resident`, £40 per `resident-pro`; (b) 25% of the first charge (£9.75 and £49.75) |
| Q3 | Affiliate payout before £40 a month | (a) manual bank transfer from a monthly statement; (b) Stripe Connect from the start |
| Q4 | Google Ads shape | (a) Performance Max paused, Search alone at £1/day; (b) both, £1/day each |
| Q5 | LinkedIn voice | (a) the founder's profile posts, company page as the record; (b) company page only |
| Q6 | Creator test budget in year one | (a) bounty only, £0 flat; (b) one nano post capped at £150 after three affiliate conversions |
| Q7 | Attribution window | (a) 30 days click to sign-up, 90 days sign-up to charge; (b) 90 and 180 |
| Q8 | What counts as a paid subscriber for the targets | (a) `resident` and `resident-pro` only, `resident-vat` closed to new buyers so deadline-week VAT filers buy `resident`; (b) `resident-vat` counted at its £19 lifetime value and kept open |
| Q9 | The account-information question for a bank feed | (a) one written enquiry to a regulatory adviser now (MK-36), banks wait on the answer; (b) hold every bank integration until 50 paid subscribers and ask then |
| Q10 | The referral platform | (a) Dub Partners, about £60 to £70 a month, API-first, Stripe Express payouts; (b) Rewardful Growth, about £75 a month plus 3% of payouts, Managed Payouts; (c) Tolt Growth, about £75 a month plus 2%; (d) in-house on Stripe Connect Express, no platform fee, payouts and the dashboard stay ours |
