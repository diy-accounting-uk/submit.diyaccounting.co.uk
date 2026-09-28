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

> I'll get back to the questions later but I would like the goals to be getting to each of these
> as soon as possible without introducing extra cash: breakeven based on 100 GPB / month running
> costs (after campain costs), second income at 1000 paid subscribers per month, primary income at
> 20,000 paid subscribers per month. (Please adjust with normative business terms for these 3
> subscriber targets.)

> On this: ```8. What counts as a paid subscriber: resident/resident-pro only with resident-vat
> closed to new buyers, or resident-vat kept open and counted.``` - it's a mix, I'll keep
> resident-vat open for at least 6 months and I hope for more resident-pro when we launch ITSA.

> Just keep it donation only: ```1. Donate page: show resident beside the donation amounts, or
> keep it donation-only.```. "2. Affiliate fee:" - please advise on what would be attractive to
> marketeers. "3. When the referral platform account opens: at the first approved affiliate, or at
> the first paid conversion." - first approved affiliate. I'll take your advice, the 1 GBP has a
> conversion goal but I really jusrt want to get people onto the site to understand how they use
> it "4. Google Ads: Search alone at £1 a day, or Search and Performance Max.". "5. LinkedIn: you
> post as the founder, or a company page only." - company page only, I want to keep a low personal
> profile. Explain: "6. Creator budget: bounty only, or one post capped at £150.". Please advise:
> "7. Attribution window: 30/90 days, or 90/180.". Do a web search to see what's the usual
> pattern: "9. Bank feed: ask a regulatory adviser now, or wait until 50 paid subscribers.". "10.
> Referral platform: Dub Partners, Rewardful, Tolt, or in-house on Stripe Connect Express." - I
> favour "or in-house on Stripe Connect Express" but I'll take your advice.

> Agreed: "Q2 Affiliate fee, my advice: 30% of every payment the referred customer makes in their
> first 12 months.".

> "Q6 Creator budget, explained:" - Bounty only and I want to make this easier by having content
> ready for the "creator" e.g. recorded video, post text, whatever they would send time on that
> we can do we should to decrease creator friction and make it a near zero outlay for them.

> "Q7 Attribution window, my advice: 90 days from click to sign-up" - agreed.

> Good, let's look at Tide, Starling, Resolute, and if applicable PayPal and Stripe: "Q9... So the
> first step is to ask two aggregators for their partner terms and price"

("Resolute" is Revolut, Revolut Business.)

> Q11 subscriptions plus donations. Q12 100% until > 1000 subscribers, then drop to 50%. I’ll
> review this later: “Send the enquiry to Plaid and Yapily from your address (MK-36)”

The goal is paid Submit subscribers. YouTube subscribers, followers and visits count only as
steps towards that.

## Strategy

Three milestones, each an active paid base in a month (a subscriber whose subscription is live
that month, on any of `resident-vat`, `resident` or `resident-pro`; "paid subscribers per month"
is read as that base, not as monthly additions), reached as soon as the arithmetic allows with no
cash put in beyond what subscriptions have earned.

| Milestone | Standard term | Active paid | MRR | ARR | Net after Stripe | By |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| A | Operating break-even: net revenue covers £100 a month running costs plus that month's campaign spend | 35 (VAT mix); 21 (ITSA mix) | £105 | £1,270 | £101 a month | 7 Aug 2027 |
| B | Ramen profitability, a second income: net revenue pays one person about the UK median full-time wage (ONS, about £39,000 in 2025) | 1,000 | £4,910 | £58,900 | £4,790 a month, £57,500 a year | 31 Jan 2029 |
| C | About £1m ARR, a primary income: the figure UK investors and founders use for a business that pays its founder and a small team | 20,000 | £98,200 | £1.18m | £95,800 a month, £1.15m a year | 31 Jan 2032 |

Price mix behind every figure, per the operator's Q8 answer. Stripe UK 1.5% + 20p per charge.
`resident-vat` stays open to new buyers until at least 28 March 2027, then a review.

| Mix | When | `resident-vat` £0.99/month | `resident` £39/year | `resident-pro` £199/year | Gross a month per subscriber | Net a month per subscriber |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| VAT mix | until Income Tax filing is live in production (O11, then production credentials) | 40% | 55% | 5% | £3.01 | £2.88 |
| ITSA mix | after that launch | 15% | 70% | 15% | £4.91 | £4.79 |

Net a month by bundle: `resident-vat` £0.78, `resident` annual £3.19, `resident-pro` annual
£16.32. Break-even at £100 a month is 35 subscribers at the VAT mix, 21 at the ITSA mix, 32 if
every subscriber is `resident`, 129 if every one is `resident-vat`, 7 if every one is
`resident-pro`. A is stated at the VAT mix because Income Tax is not yet live; B and C at the
ITSA mix (at the VAT mix, B is £3,010 MRR and £36,100 ARR; C is £60,200 MRR and £723,000 ARR).

The spend rule (bootstrapped, no cash introduced; operator, Q11 and Q12). The pool is the previous
month's net subscription revenue plus net donations. Campaign spend in a month is capped at the
whole of the pool above £100 while the active paid base is 1,000 or under, and at half of it
after: cap = share × max(0, pool − £100), share = 100% until the base exceeds 1,000, then 50%. The
cap covers every fixed marketing cost: Google Ads budget above the floor, any platform fee, any
flat creator fee, any paid listing. Two things sit outside it: referral commissions, because they
are paid from the referred customer's own payments after the refund window and never in advance;
and the £1 a day Search floor the operator chose in Q4 (about £30 a month), because its purpose is
to watch how visitors use the site. Donations put the cap above zero from the first month: £195 in
the 30 days to 2026-09-28 across 9 charges (dossier §1, Athena `v_revenue_daily`), £190 after
Stripe fees, one month's reading, so the cap today is about £90 a month and every figure below
assumes donations hold at that level. Milestone A stays defined on subscription revenue alone:
net subscription revenue of £100 a month, with donations left to the spreadsheets site's own
costs.

| Active paid base (ITSA mix) | Pool a month | Share | Cap a month | Additions it buys at £30 each |
| ---: | ---: | ---: | ---: | ---: |
| today (under 10) | £190 donations + under £5 | 100% | about £90 | 3 |
| 35 (A) | £358 | 100% | £258 | 8 |
| 300 | £1,627 | 100% | £1,527 | 51 |
| 1,000 (B) | £4,980 | 100% to 1,000; 50% past it | £4,880, then £2,440 | 163, then 81 |
| 5,000 | £24,140 | 50% | £12,020 | 400 |

One metric decides every channel: paid subscribers it produced, per pound and per operator hour.
Nothing measures that today, so the first work is the rails that carry a visitor's source through
sign-up to the Stripe charge. Then the channels, in the order below, each with a target and a
stop rule. The ranking rests on three measured facts: the only buyers so far bought in a VAT
deadline week and filed within the hour; the spreadsheets site has the largest audience on our
domains and sends almost nobody to Submit; and at the measured purchase rate a paid click has to
cost under £0.36 to pay back, which leaves cheap search as the only paid channel until the rate
itself moves.

Sources: `../marketing/RESEARCH_2026-09-28.md` (the dossier, §-references below are to it),
`REPORT_PRICE_UPDATE_REVIEW.md` (breakeven), `REPORT_CAPABILITIES.md` (capability ids),
`../developers/submit/backlog/PLAN_CAMPAIGN_AND_REFERRALS.md` (the referral spec),
`PLAN_DIYA_GL_LAUNCH.md` §3 to §5, `_developers/MARKETING_GUIDANCE.md` (HMRC wording, ASA).

### 1. Where we are, in numbers

Trailing 30 days to 2026-09-28 unless stated. "Consented" means the 13% of sessions that accept
the GA4 banner; every GA4 figure is a floor.

| Fact | Value | Source |
| --- | --- | --- |
| Break-even | 35 active paid at the VAT mix, 21 at the ITSA mix, against £100 a month running cost; the price review's 31 assumed all `resident` at £98 | this plan; price review §1 |
| Break-even at September's AWS run-rate | 141 `resident` subscribers ($403 billed against a $65 target) | dossier §2 |
| Lifetime contribution | `resident` annual £127 (£96 to £191); `resident-pro` annual £652; `resident-vat` £19 | price review §3c |
| Session-to-purchase | 0.28%, n = 2, 90% interval 0.05% to 0.9%, measured at 99p | price review §3a |
| Breakeven cost per session | £0.36; per paid `resident` £127 | price review §4 |
| Human sessions, Submit | 900 to 1,250 a month (GB proxy; true count unknown) | price review §1 |
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
| M5 | The one view | `v_paid_subscribers_by_channel`: live Stripe charges on the three bundles, joined by hashed sub to the acquisition map, by month, source and bundle, with the active base, MRR and ARR at the actual mix. Plus the renewal view fixed to read `subscription-renewed`, so churn by channel follows. | DATA-28 |
| M6 | Ads conversion import | A nightly job uploads each live charge with a stored `gclid` as an offline conversion. Ads then counts 100% of purchases instead of the 13% GA4 consents. | DATA-32, DATA-22 |
| M7 | Video links | `videos/publish.json` gains a tagged link per video; the uploader writes it into the description and re-syncs the published ones. Nightly pull of YouTube Analytics (views, traffic sources, retention) into the lake. | OPS-93, DEV-41, DATA-46 |
| M8 | Cost, hours and the cap | `marketing.toml`: one row per channel per month, cash spent and operator hours. The dashboard divides paid subscribers by both and shows the spend cap from the previous month's pool (net subscriptions plus donations) beside the spend. | DATA-26, SITE-21 |
| M9 | Human denominator | The visitor-kind view returns human sessions, so per-channel purchase rates have a denominator. | DATA-23, DATA-27 |
| M10 | Search Console | Nightly pull of impressions, clicks and queries per page, for the content channel. | DATA-06 sibling |

M1 to M5 gate everything. M6 gates any Ads spend above the £1 a day floor, so the cap's first use (about £90 a month) waits on M6, due 7 November 2026. M7 gates new videos.
M8 is the operator's ten minutes a month. Each channel launch is a row in `experiments.toml`
(SITE-21).

### 3. Channels, ranked

Ranked by expected paid subscribers per pound and per operator hour. Targets are cumulative
active paid subscribers attributed to the channel by M5; dates are the tax calendar in §4. Where a
figure is an assumption it says so.

| Rank | Channel | Cash | Operator hours | Target | By |
| --- | --- | --- | --- | --- | --- |
| 1 | Own properties: spreadsheets funnel, Submit's pages | £0 | 2 to review copy | 12 | 7 Aug 2027 |
| 2 | HMRC listings and bookkeeper word of mouth | £0 | 2 emails, 1 article review | 6 (2 `resident-pro`) | 7 May 2027 |
| 3 | Search and the support corpus | £0 | 5 to check tax content | 4 | 7 Aug 2027 |
| 4 | YouTube | £0 | 0 | 3 | 7 Aug 2027 |
| 5 | Submit's referral scheme, casual tier | 30% commission from money received; Connect fees per payout | 1 a month | 5 | 7 May 2027 |
| 6 | Google Ads, Search | £30 a month floor, then the cap (about £90 a month today) | 0 | 3 | 7 May 2027 |
| 7 | Submit's referral scheme, creator tier | the same commission; £0 up front | 3 per creator | 3 | 7 Nov 2027 |
| 8 | Integration partners and backlinks for diya-gl | £0 | 2 for applications | 2 | 7 Aug 2027 |
| 9 | LinkedIn, company page | £0 | 1 a month | 1 | 7 Aug 2027 |

Channel targets sum to about 35 by 7 August 2027, milestone A at the VAT mix. The sum assumes
the 0.28% rate holds at £39. If the price experiment reads under 0.15%, rank 1's conversion work
moves ahead of everything and A moves to 7 November 2027.

#### 3.1 Own properties: the spreadsheets funnel and Submit's own pages

Why it fits. The spreadsheets site has the largest measured audience on our domains (929
consented sessions, 118 downloads, 105 books loaded a month) and the highest intent: these
visitors keep their own books and a third of them start a donation. Two of them a month reach
Submit. Donors paid £195 in a month against under £4 of subscriptions. On Submit, the price
review measured that each extra ten logins a month is worth 360 to 720 new sessions, and 11% of
bundle-page sessions start checkout.

First steps.

1. On the BST and SE book pages, a "File this VAT return with HMRC" action on the VAT view, going
   to Submit's VAT page with the book's figures and a tagged link (M2).
2. After a local save, once per session, the cloud offer: "Keep this book online and on your
   phone, £39 a year", opening the existing cloud sign-in (SS-27).
3. The download page and every knowledge-base article footer carry the same two lines: file it,
   or keep it online. The donate page stays donation-only (Q1).
4. Submit's home page leads with the deadline: "VAT return due 7 November" from the visitor's
   date; the login page states the three steps to a filed return.

Cost. £0. About 8 files across the two repositories.

Leading indicator. Sessions arriving at Submit with source `spreadsheets` or `diya-gl` a month;
cloud sign-ins a month. Today 2 in 20 days and 6 a month.

Target. 1 paid subscriber a month from 7 November 2026; 8 by 7 May 2027; 12 by 7 August 2027. The
freemium benchmark (2% to 5% of active free users, launch plan §3) says 105 consented book loads
a month, if the true count is five to eight times that, supports 16 to 40 a year; that is an
assumption until M9 gives the denominator.

Stop rule. None for the channel. Each placement is removed when its click-through reads under
0.5% over three months.

#### 3.2 HMRC listings and bookkeeper word of mouth

Why it fits. Everyone mandated for MTD is sent to HMRC's software finder. It is the one place
where 864,000 people this year, and 2.9 million by 2028, look for exactly this product, and it
costs nothing. Submit's VAT listing lacks the "free version" flag that the target buyer filters
on. The Income Tax finder listing follows recognition (O11), and it is the entry point for the
whole Income Tax wave and for the shift from the VAT mix to the ITSA mix.

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
carries the highest RPM, which matters only if the channel grows; the money is the sign-up. The
same cuts feed the affiliate content kit (3.8).

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

The scheme. Submit issues a referral code to anyone who will send people to it, and pays a
commission on what a referred customer pays. PolicyBee's affiliates page is the model for the way
of working: a short application, a trackable link, a fee per sale, the merchant handles the
customer, the affiliate does nothing after the click. Our own placement on their scheme stays as
it is, about one sale a year, and is not part of this plan.

Why it fits. The referral spec (`PLAN_CAMPAIGN_AND_REFERRALS.md`) is written and unbuilt
(BACKLOG 15) and its data model, `referral#` items with a `referred-index`, carries a code as well
as a pass. Stripe checkout and the billing webhook exist. The buyers we want, sole traders and
landlords, are reached by bookkeepers, forum owners and small creators we cannot reach directly.
A commission paid from money already received costs nothing until it works, which is what the
spend rule asks.

Two tiers.

| Tier | Who | How they join | Terms |
| --- | --- | --- | --- |
| Casual | Anyone with a UK audience of sole traders, landlords or small companies: bookkeepers, accountants, forum owners, bloggers, existing customers | "Join" on `affiliates.html` opens Stripe's hosted Express onboarding; the operator approves; existing customers get a code from the bundles page with their campaign passes | The commission below; the customer-to-customer variant pays in the spec's credits (tokens, free months) instead of cash; the content kit (3.8) |
| Creator | YouTubers, newsletter writers and podcasters with a measured audience in the niche | Invited (3.8) | The same commission, a `resident-pro-comp` bundle to make content with, the content kit; £0 up front (Q6) |

The fee (operator, Q2): 30% of every payment the referred customer makes in their first 12
months, paid from money received after the 30-day refund window.

| Bundle | Referred customer pays in 12 months | Commission | Share of first-year net | Share of lifetime contribution |
| --- | ---: | ---: | ---: | ---: |
| `resident` annual | £39.00 | £11.70 | 31% | 9% of £127 |
| `resident` monthly, kept 12 months | £47.88 | £14.36 | 32% | 15% of £93 |
| `resident-pro` annual | £199.00 | £59.70 | 30% | 9% of £652 |
| `resident-vat`, kept 12 months | £11.88 | £3.56 | 38% | 19% of £19 |

Why this shape is attractive to marketers. 20% recurring is the SaaS affiliate baseline, 25% to
30% is where programmes get attention, and a share of every payment beats a one-off bounty for a
subscription product because the referrer earns on the renewal too (track360, Rewardful and
LinkJolt 2026 benchmarks, sources below). The 12-month limit caps the liability at a known number
per customer. PolicyBee's flat "up to £40" is the casual-scheme comparison; our first-year
commission on `resident-pro` exceeds it and on `resident` sits at a third of it, in line with the
price. Self-referrals, refunds and disputes pay nothing. The recurring shape also exists in the
spec as the customer-to-customer credit (a free month per subscription, capped at 12) and stays
there for existing customers who prefer credit to cash.

Attribution window (operator, Q7): 90 days from click to sign-up; 180 days from sign-up to first
charge. Customers buy at VAT quarter and MTD Income Tax deadlines up to a quarter apart, so the
industry median 60-day cookie would drop real referrals; the window costs nothing unless a real
charge happens. The code is stored on the account at sign-up (M3), so after that no cookie is
involved and the window is a date comparison.

End to end, code to Stripe charge.

| Step | What happens | Built by |
| --- | --- | --- |
| Issue | The affiliate joins from `affiliates.html`: Stripe's hosted Express onboarding collects identity, bank details and the tax information Stripe requires; on completion an `affiliate#<code>` item is written to the bundles table (tier, connected account id, status, created) and the operator approves it. A signed-in customer's own code appears beside their campaign passes on `bundles.html`. A QR comes from the existing pass pages. | MK-22, MK-23, MK-38, MK-39 |
| Link | `https://submit.diyaccounting.co.uk/?ref=<code>`; the same parameter works on the spreadsheets and diya-gl pages and is carried into Submit (M2) | MK-1, MK-2 |
| Capture | `analytics.js` stores the code at landing, first touch wins, 90-day expiry (M1) | MK-1 |
| Attribution at sign-up | First sign-in writes `acquisition.ref` on the bundle record, once; a `referral#<code>` / `referred#<hashedSub>` item follows (spec §1.1) | MK-3, MK-22 |
| Attribution at checkout | `billingCheckoutPost` puts the code and the hashed sub in the Stripe checkout metadata, so the charge itself carries the referrer even if the account record is ever lost | MK-22 |
| Conversion | `handleCheckoutComplete` and `invoice.paid` set `subscribedAt` on the referral item and append each payment inside the 12 months to the commission ledger; the charge lands in Athena with `bundle_id` and mode (M4) | MK-22, MK-4 |
| Count | `v_paid_subscribers_by_channel` by `ref` code (M5); the commission ledger view lists what is due, what is held in the refund window, and what is paid | MK-5, MK-25 |
| Pay | A monthly run creates a Stripe transfer to each affiliate's connected account for commissions past the refund window, above the £20 minimum; Stripe pays out in GBP on its schedule and hosts the affiliate's Express payout dashboard | MK-25 |
| Stats | The affiliate's stats page on Submit: clicks, sign-ups, conversions, commission due, held and paid, from our own attribution data; the content kit downloads from here with the code filled in | MK-40, MK-46 |

Fraud and self-referral rules.

| Rule | Check |
| --- | --- |
| No self-referral | Reject when the code's owner hash equals the redeemer's hashed sub or hashed email; reject when the Stripe customer already exists |
| One referrer per account | `acquisition.ref` is written once; `referred-index` rejects a second referral item (spec §4) |
| New accounts only | A code on a returning sign-in is ignored |
| Money must clear | Commission only on a live-mode payment older than 30 days with no refund or dispute; a later refund inside the 12 months reverses the unpaid part |
| Volume cap | More than 5 conversions a day on one code holds that code's commissions for review |
| Disclosure breach | Code revoked; unpaid commissions forfeited |
| Privacy | No device fingerprinting and no IP matching; the rules above use data the account already holds |

Payout mechanics and thresholds. Stripe Connect Express: Stripe hosts onboarding and identity
checks, holds the payee's records, pays out in GBP to a UK bank account and gives each affiliate
its own payout dashboard, so payee management sits with Stripe. Cost about $2 per connected
account in a month it is paid plus 0.25% + 25¢ per payout, nothing otherwise ([Stripe Connect
pricing](https://stripe.com/connect/pricing)). We transfer commissions monthly, £20 minimum
carried forward, 30 days after each payment. Affiliates handle their own tax; the terms say so.
No cash leaves before the customer's money has arrived and cleared, which is the spend rule's
condition.

Disclosure under the ASA/CAP code. An affiliate's post that carries the link is an ad in its
entirety. The agreement requires the label upfront (#ad or #advert) before the engagement point:
before "read more", in the first three seconds of a video, in a podcast's introduction. Affiliates
use only the wording `_developers/MARKETING_GUIDANCE.md` permits ("HMRC recognised", never
"approved" or "endorsed"). The scheme page states the rules and the content kit carries the label
in every template; the CMA can fine for undisclosed placements since April 2025, so the rule is
enforced by revocation on the first breach.

Build or buy (operator, Q10: in-house on Stripe Connect Express). The criteria were full
programmatic control, and payouts, payee liability and the referrer dashboard offloaded. Each
candidate against five tests (web research, read 2026-09-28; sources at the end of this section).

| Platform | API and webhooks | Stripe attribution and clawback | Pays affiliates itself |
| --- | --- | --- | --- |
| Stripe Connect Express, in-house | Ours entirely | Ours (M1 to M5) | Stripe does identity, KYC and GBP payouts per connected account and hosts the payee's payout dashboard; the ledger and the stats page are ours |
| Dub Partners | API-first: partners, links, commissions, payouts, webhooks | Native Stripe; refunds handled server-side | Yes, through Stripe Express; W-9/W-8 collected; payout fee 3% to 5%, automatic at $100 |
| Rewardful | REST API from the Growth plan; Stripe webhooks drive commissions | Native; refund reverses the commission | Managed Payouts on every plan: one funded payment, Rewardful distributes, tax and identity by country; 3% fee |
| Tolt | API for Stripe, Paddle, Chargebee | Native Stripe | Auto-payouts on Growth and above by PayPal or Wise; 2% fee |
| FirstPromoter | API and webhooks | Native Stripe | No: payouts run from our own PayPal, Wise or Stripe account |
| PartnerStack | API | Native | Yes, with tax forms; 1.5% to 3.5% payout fee |
| Tapfiliate | API | Native | Through Trolley, a third party |
| PromoteKit | Limited | Native Stripe | No |
| Cello | Embedded widget, less API surface | Yes | Yes, user-referral focus |

| Platform | Hosted dashboard and sign-up | Cost at tens of affiliates, a handful of conversions a month | Verdict |
| --- | --- | --- | --- |
| Stripe Connect Express, in-house | Stripe hosts onboarding and the payout dashboard; we build the stats page (MK-40) | No monthly fee; about $2 per paid affiliate-month plus 0.25% + 25¢ per payout; about 15 files to build | Chosen: £0 until a payout, so the scheme opens at the first approved affiliate inside the spend rule |
| Dub Partners | Embedded components and a hosted partner portal | $75 to $90 a month plus the payout fee | Fallback if affiliates pass about 50 or the stats page becomes a burden |
| Rewardful | Branded portal and sign-up page | $99 a month (Growth, the first plan with the API) plus 3% | Second fallback |
| Tolt | Yes | $99 a month plus 2% | Third |
| FirstPromoter, PromoteKit | Yes, basic | $29 to $149 a month | Fail the offload test |
| PartnerStack | Yes | $500+ a month | Five times the running cost base |
| Tapfiliate, Cello | Yes | $89+; usage-based | Two vendors; wrong fit |

Timing (operator, Q3): the scheme opens at the first approved affiliate. With Connect Express
there is no fee before a payout, so this sits inside the spend rule at £0.

First steps.

1. M1, M3, M4, M5.
2. Spec blocks 1 to 3 with the `ref`-at-sign-up write, the checkout metadata and the commission
   ledger (MK-22); then blocks 4 and 5 for the customer-to-customer credits (MK-23).
3. Connect enabled on the Stripe account (MK-39); the onboarding flow and `referrals.toml`
   (MK-38); the monthly transfer run (MK-25); the stats page (MK-40).
4. `affiliates.html` on Submit: the tiers, the commission, the window, the rules, the disclosure
   clause, the Join button (MK-24).
5. The content kit (3.8, MK-45 to MK-48).
6. The first five casual affiliates invited by hand: bookkeepers who wrote to support in the last
   year, then the diya-gl npm and Homebrew users (SS-20) through the package README (MK-26).

Cost. 30% of the referred customer's first-year payments, from money received; Connect fees per
payout. Under one operator hour a month for approvals.

Leading indicator. Codes issued; sessions carrying a code; sign-ups with a referral item;
commissions accrued.

Target. 5 affiliates by 31 January 2027; 5 paid subscribers by 7 May 2027.

Stop rule. Ten approved affiliates and no paid subscriber in six months: close applications, keep
the customer-to-customer credits.

Sources (read 2026-09-28): [Stripe Connect pricing](https://stripe.com/connect/pricing), [Stripe
Connect Express accounts](https://docs.stripe.com/connect/express-accounts), [track360: SaaS
affiliate commission benchmarks 2026](https://track360.io/blog/saas-affiliate-commission-rates-benchmark-2026),
[Rewardful: affiliate commission explained](https://www.rewardful.com/articles/affiliate-commission-explained),
[Rewardful pricing](https://www.rewardful.com/pricing), [Rewardful Managed Payouts
FAQ](https://help.rewardful.com/en/articles/11930744-merchants-faq-managed-payouts), [Dub vs
Rewardful](https://dub.co/blog/dub-vs-rewardful), [Dub payouts](https://dub.co/help/article/receiving-payouts),
[Tolt pricing](https://tolt.com/pricing), [FirstPromoter: how to pay your
promoters](https://help.firstpromoter.com/en/articles/8971513-how-to-pay-your-promoters),
[PartnerStack payouts](https://partnerstack.com/payouts), [Tapfiliate automated
payouts](https://support.tapfiliate.com/en/articles/7190765-automated-affiliate-payouts),
[PromoteKit PayPal payouts](https://docs.promotekit.com/payouts/paypal-mass-payments), [PolicyBee
affiliates](https://www.policybee.co.uk/affiliates), [ASA/CAP: recognising ads on social
media](https://www.asa.org.uk/advice-online/recognising-ads-social-media.html).

#### 3.6 Google Ads, Search

Why it fits, and what is wrong. 181 clicks at £0.06 is cheap traffic, six times under the £0.36
ceiling. Zero conversions is consistent with 0.28% (0.5 expected). Two faults make the campaign
unjudgeable: Ads sees a conversion only from the 13% of sessions that consent, so bidding to
conversions learns from nothing; and Performance Max hides its keywords, so the clicks cannot be
read against intent. Both buyers so far bought in deadline week. The operator's aim for the £1 a
day (Q4) is visitors who show how the site is used.

Changes.

1. A Search campaign declared in `ads.toml` (DATA-32 creates a missing Search campaign outright):
   exact and phrase match on "submit vat return online free", "free mtd vat software", "mtd
   income tax software", "file vat return without accountant"; GB only. Bidding
   `maximize_clicks`; the conversion action stays recorded for measurement.
2. Performance Max paused (Q4).
3. Budget £1 a day, the floor, until M6 runs (7 November 2026). Then the cap decides: the nightly
   governor (MK-42) sets the daily budget from the previous month's pool, about £90 a month at
   today's donations, so about £3 a day concentrated on the 1st to the 7th of each month. Once M6
   has counted five conversions, bidding moves to target CPA £30.

Cost. £30 a month at the floor; about £120 a month from November 2026 (floor plus cap); then the
cap as it grows.

Leading indicator. Sessions from `google / cpc` and what they do on the site (pages, logins);
imported conversions a month once M6 runs; cost per imported conversion.

Target. 3 paid subscribers by 7 May 2027 at under £30 each; if the cap's £90 a month of clicks converts at the site's 0.28%, the channel adds about 4 a month and A comes forward to 7 May 2027.

Stop rule. Over a quarter with 500 or more clicks, cost per imported conversion above £60: back
to the floor. Under 0.15% click-to-purchase over the same window: back to the floor and the
hours to 3.1.

#### 3.7 Integration partners and backlinks for diya-gl

Why it fits. diya-gl already reads a NatWest statement CSV (MCP-10), Stripe balance transactions
and payouts (DATA-49, DATA-51) and PayPal transactions (DATA-48), ships an MCP server (SS-06) and
publishes to npm, GHCR and Homebrew (SS-20). Each platform a book can be filled from has a public
place that lists what works with it, and a listing there is a backlink to `diya-gl.co.uk` from a
domain that ranks, plus a stream of visitors who already keep books. Those visitors reach Submit
through the placements in 3.1. Web research read 2026-09-28; sources at the end of this section.

The regulatory line. Pulling a customer's bank transactions through open banking is an account
information service. The usual pattern for a small UK accounting app is to work through an
FCA-authorised aggregator as its agent or under its permissions, so the aggregator carries the
regulated activity: August runs as an agent of Plaid Financial Ltd, and Emma runs live on Yapily's
own AIS and PIS permissions. Larger products register as an AISP themselves, as FreeAgent did. Our
own registration costs an FCA application fee in the hundreds of pounds and six months to a year;
agent registration is quicker and the FCA application itself is free with both Plaid and Yapily,
but neither publishes a production price. Plaid confines EU/UK customers to a custom-quoted plan
gated behind its paid Scale tier and an annual minimum spend, so "no upfront cost" covers only the
FCA paperwork, not the platform access under it; Yapily's pricing is sales-led throughout. One
unverified third-party estimate puts a realistic production floor near £150 to £500 a month for
either, in line with this plan's earlier reading. GoCardless Bank Account Data, once the free
route, closed to new accounts in July 2025 — Firefly III and Actual Budget's own bank-sync docs
now point self-hosters at Enable Banking instead, but Enable Banking's free "restricted
production" covers only accounts the developer links to their own name, not customer accounts at
volume, and no agent or partner model surfaced for it. Finexer publishes a self-serve sandbox and
a discounted pre-revenue startup rate, but one of Finexer's own blog posts says its coverage
excludes Starling, Tide and Monzo Business while its own bank-coverage page lists all three — a
contradiction this research could not resolve, so Finexer stays the fallback, not a first ask. So
the first step (operator, Q9) is to ask two aggregators for their agent and partner terms and
price (MK-36); a regulatory adviser is engaged only if those terms leave diya-gl carrying the
regulated activity. Against a £100 a month cost base, a live bank feed waits for the cap to cover
it. Reading the CSV a bank already exports needs no permission and is what the free rung does
today.

Comparison, from the published pages and the first-hand or reported experience found (read
2026-09-28).

| Aggregator | UK coverage of Tide / Starling / Revolut Business | Agent model and regulated party | Price at our volume | Minimum and onboarding | Reported experience |
| --- | --- | --- | --- | --- | --- |
| Plaid | All three listed among its UK/EU institutions; no separate confirmation that the Business tiers specifically are production-tested | Agent of Plaid's own FCA AIS permission; Plaid carries the regulated activity; FCA review about two months, "much faster" in some cases | EU/UK: custom quote only, no self-serve tier; one blog's unverified estimate is $0.30–$1 per connected account a month | FCA agent application is free; access still requires Plaid's paid Scale plan with an annual minimum spend; Sandbox is free and unlimited | Capterra 4.3/5 (69 reviews); syncs reported to break on smaller banks; August is a live, accounting-adjacent firm running as a Plaid agent |
| Yapily | All three named among ~2,000 covered institutions; markets itself as the only vendor to have tested and fixed business-account connectivity | Agent under Yapily's own AIS and PIS permission as principal; UK-first | No published figures; one blog's unverified estimate is £200–£500 a month at entry production | Sales-led from first contact; no published minimum term or self-serve production tier | G2 4.2/5 (3 reviews, thin sample); Emma (11M+ UK open-banking users) reports 267% month-on-month transaction growth after integrating, though as a personal finance app, not a bookkeeping product |
| Finexer | Lists all three on its coverage page, but a separate Finexer blog post says coverage excludes Starling, Tide and Monzo Business — unresolved by this research | Finexer is FCA-authorised itself and advertises "agent licensing"; no detail found on how the regulated activity splits with an agent | Usage-based, tiered Startup/Standard/Enterprise; discounted pre-revenue startup rate; no published £ figures | No minimum stated; free sandbox, the only one of the four with self-serve production sign-up | No independent reviews found; nearly all available content is Finexer's own comparison blog, which was this plan's main prior source |
| TrueLayer | Reported strong UK/IE coverage; Stripe's UK Pay-by-Bank partner | TrueLayer is FCA-authorised (FRN 901096) and carries the regulated activity; partner programme is "talk to us" | No rate card; one blog's unverified historic estimate is £150–£300 a month at a starter tier | Sales-gated from the first contact; free Development/sandbox tier | No first-hand small-firm account found; repeatedly described as built for funded or larger teams |
| Enable Banking | Not independently confirmed for this research (coverage and pricing pages returned errors); described by indie-developer blogs as the default post-GoCardless option | No agent or partner model found; production access for customer accounts needs Enable Banking's own paid licence | Per connected account per month, quote-based; no published figures | Free tier is "Restricted Production" for accounts the developer links to their own name only, not customer accounts at volume | Praised in indie-developer blogs as GoCardless Bank Account Data's free-tier replacement, but only at that self-linked scale |

The institutions the operator named, and the two payment platforms diya-gl already reads.

| Institution | Aggregators for account information today | Direct route without an aggregator | Lists integrations and links back | diya-gl today, and the gap |
| --- | --- | --- | --- | --- |
| Starling (personal and business) | The UK aggregators list it: TrueLayer, Yapily, Plaid, Finexer, Moneyhub; GoCardless Bank Account Data for accounts opened before July 2025 | Yes. Starling's developer portal issues a customer a personal access token for their own account (`account:read`, `transaction:read`), scanned from the Starling app. Used by the customer on their own data it is the customer's own access; if we hold the token and pull on their behalf it becomes account information and the regulatory line applies. Partner integrations on Starling's partner API are vetted and need the same answer | Yes: the Business Marketplace, a public partner page per integration on starlingbank.com | CSV import (MK-33). Gap: the token route as an opt-in "connect your Starling account" on the DIYA-GL page, after Q9's terms |
| Tide (business only) | The same aggregators; Tide's own open banking API is for FCA-authorised TPPs, with a public sandbox any developer can use | No customer-token route; production API access needs FCA authorisation or an aggregator. Tide's accounting integrations (Xero, QuickBooks, Sage, FreeAgent, KashFlow, Crunch, ClearBooks) are bank-feed connections Tide built | Yes: Tide's accounting integrations pages name each product and link to it | CSV import (MK-33). Gap: a feed only through an aggregator |
| Revolut Business (and personal Revolut) | The same aggregators; Revolut's open banking API for TPPs | Yes for Business: the Business API on Grow, Scale and Enterprise plans, authorised by the customer's own certificate and access token, reads accounts and transactions. The customer's own access when they run it; account information if we hold the credentials | Yes: the Business Integrations hub lists apps with links; custom integrations through the Business API | CSV import (MK-33). Gap: a "connect Revolut Business" opt-in on the customer's own API certificate, after Q9's terms |
| PayPal | Not open banking; no aggregator needed | Yes: the Transaction Search API with the merchant's own app credentials; the customer's own access | Partner Directory needs Gold partner status | Read today for the company's own account (DATA-48). Gap: the same pull for a customer's PayPal account, with their credentials, from the DIYA-GL page |
| Stripe | Not open banking; no aggregator needed | Yes: the Stripe API with the account holder's own restricted key, or a Stripe App the customer installs; the customer's own access | Yes: App Marketplace and Partner Directory pages link out | Read today for the company's own account (DATA-49, DATA-51). Gap: the Stripe App (MK-35) that does it for any Stripe account |

The two aggregators to ask first stay Plaid and Yapily, on sharper grounds than before. Yapily:
UK-first, names Tide, Starling and Revolut among its covered institutions, onboards partners as
agents under its own AIS and PIS permissions as principal, and is the only one of the four to
claim it has tested and fixed business-account connectivity specifically — the exact gap for Tide,
Starling and Revolut Business. Its only production-scale reference found is Emma, a personal
finance app rather than a bookkeeping product, and its pricing is sales-led with no published
figure. Plaid: agent registration is free and the FCA review runs about two months against six
months to a year for direct authorisation, and August is a live, accounting-adjacent comparable
running as a Plaid agent — but EU/UK customers get no self-serve production tier, and the agent
route sits behind Plaid's paid Scale plan and an annual minimum spend, so the zero-cost claim
covers only the FCA paperwork. Finexer stays the fallback if both price above the cap: it is the
only one of the four with a published self-serve sandbox and a discounted pre-revenue startup
rate, but its own blog contradicts its own coverage page on whether Starling, Tide and Monzo
Business are supported, so a Finexer quote needs that resolved in writing before it counts as a
real option. TrueLayer stays out of the first ask, sales-led and built for funded or larger teams,
with no first-hand small-firm account found. Enable Banking, checked new for this pass, does not
fit: its free tier covers only accounts the developer links to their own name, and no agent or
partner model surfaced for serving customer accounts at diya-gl's scale. GoCardless Bank Account
Data, once free for up to 50 connected banks a month, closed to new accounts in July 2025 and is
not an option.

Enquiry text, from the operator's address (MK-36), one message to each:

> DIY Accounting Limited runs diya-gl (diya-gl.co.uk), a free bookkeeping engine for UK sole
> traders, landlords and small companies, with a paid cloud store at £39 a year. We want to let a
> signed-in customer connect their Tide, Starling or Revolut Business account so that their own
> transactions appear in their own book. We expect tens of connected accounts in the first year
> and a few hundred in the second. Please send: your partner or agent terms for a firm of our size,
> including whether we would act as your agent under your FCA permissions or you would carry the
> account information service; your price at that volume (per connected account, per data pull, or
> monthly minimum), and any paid platform tier or minimum spend required to hold agent or partner
> status, separate from any FCA application fee; confirmation that Tide, Starling and Revolut
> Business are production-tested for business accounts specifically, not just personal accounts,
> and their transaction history depth; how a customer's 90-day open banking re-consent works in
> your flow and what, if anything, breaks an unattended sync; and any minimum term.

Candidates, ranked by backlink value against effort, with the regulatory line applied.

| Rank | Partner | What the integration takes | Listing and link |
| --- | --- | --- | --- |
| 1 | MCP registries: official registry, Glama, PulseMCP, mcp.so, Smithery, awesome-mcp-servers | `server.json` for the existing diya-gl MCP server; one CLI publish, four web forms, one PR | All free; every one gives a public page linking to the project |
| 2 | Package registries: npm, GHCR, Homebrew, GitHub topics | Already published (SS-20); add topics, a README "works with" section and the site link | Free; npm and GitHub pages link back |
| 3 | Stripe Partner Ecosystem, Apps track | A Stripe App that exports a period's balance transactions as diya-gl lines, built on DATA-49 and DATA-51; app review; the programme raised its baseline in April 2026 | Free to join; App Marketplace page and Partner Directory entry, both linking out |
| 4 | Zapier public integration | A Zapier app over the cloud store API (SS-27, Submit's Cognito), triggers "book saved", actions "add line"; public integration required for the partner programme | Free; a public app page with a link, tiered by active users |
| 5 | Bank CSV imports: Tide, Starling, Revolut Business first, then Monzo and Wise | Extend MCP-10's parser per export format; a "works with" page per bank on diya-gl.co.uk | No partner link; our own pages rank for "import <bank> CSV" and are the evidence for ranks 6 and 7 |
| 6 | Starling Marketplace | An integration on Starling's partner API, vetted by Starling; a live account connection, so the regulatory line applies; the customer-token route is the first cut | Public partner page on starlingbank.com |
| 7 | Tide accounting integrations, Revolut Business integrations hub, then Wise Business App Marketplace and Monzo | Bank feeds through the bank's API or the aggregator MK-36 chooses; curated lists; the regulatory line applies | Public integration pages on each bank's domain |
| 8 | Open banking aggregators: TrueLayer, Yapily, Plaid, Moneyhub, Finexer | Supplier contracts, sales-led; a listing only as a customer case study | A backlink only with a case study |
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
and build the Stripe App in horizon A. Zapier after the cloud store API is stable. Send the two
aggregator enquiries now (MK-36); the Tide, Starling and Revolut Business feeds and their listings
wait on those terms and on the cap covering the aggregator's fee, which at £150 a month is a pool
of £250: about 21 active subscribers at the VAT mix, 13 at the ITSA mix, above today's donations. The Starling and Revolut customer-token routes can come
first if the terms say the customer's own token is the customer's own access.

First steps.

1. `server.json` and the registry publishes; README topics and "works with" section (MK-32).
2. Bank CSV parsers and the "works with" pages (MK-33).
3. Stripe partner application and the App (MK-34, MK-35).
4. The aggregator enquiries (MK-36); then the Tide, Starling and Revolut Business feeds and
   listings (MK-49) on the terms that come back.

Cost. £0 for ranks 1, 2, 5; Stripe and Zapier are machine time; banks carry the aggregator fee
or the agent registration, inside the cap.

Leading indicator. Referring domains to `diya-gl.co.uk` (Search Console, M10); sessions with
referrer from each listing.

Target. 8 listings live by 31 January 2027; 100 referred sessions a month by 7 May 2027; 2 paid
subscribers by 7 August 2027.

Stop rule. A listing has no running cost and stays. The Stripe App is not extended past its
first version if it reads under 20 installs in six months. No bank feed work starts before the
aggregator terms are in and the cap covers the fee.

Sources (read 2026-09-28): [Stripe Partner Ecosystem](https://docs.stripe.com/partners),
[Stripe App listing guidelines](https://docs.stripe.com/stripe-apps/listing-guidelines),
[Starling developers, partner](https://developer.starlingbank.com/partner), [Starling access
control and personal access tokens](https://developer.starlingbank.com/permissions), [Starling
Marketplace for businesses](https://www.starlingbank.com/business-account/marketplace-for-businesses/),
[Tide developer portal](https://developers.tide.co/perry/developer/welcome), [Tide: does Tide have an
API](https://www.tide.co/support/joining/partnerships/does-tide-have-an-api/), [Revolut Business
API](https://developer.revolut.com/docs/business/business-api), [Revolut Business
integrations](https://www.revolut.com/business/integrations/), [Yapily pricing
guide](https://blog.finexer.com/yapily-pricing/), [Finexer budget open
banking](https://blog.finexer.com/budget-friendly-open-banking-solutions/), [Wise: connecting your account
with accounting software](https://wise.com/help/articles/2960247/connecting-your-wise-account-with-accounting-software),
[Tide accounting integrations](https://www.tide.co/features/accounting-integrations/), [Monzo open
banking API](https://docs.monzo.com/open-banking/), [PayPal partner FAQs](https://www.paypal.com/uk/webapps/mpp/partner-programme/faqs),
[Plaid: FCA registration and the agency model](https://plaid.com/blog/fca-registration-and-how-plaid-can-help/),
[Plaid pricing and billing docs](https://plaid.com/docs/account/billing/),
[August: open banking, as an agent of Plaid](https://www.augustapp.com/dictionary/open-banking),
[FreeAgent: open banking registration from the FCA](https://www.freeagent.com/company/press-room/freeagent-secures-open-banking-registration-from-fca/),
[Finexer: open banking UK regulation](https://blog.finexer.com/open-banking-uk-regulation/),
[Finexer pricing](https://finexer.com/pricing), [Finexer bank coverage](https://finexer.com/openbanking/banks),
[Yapily: how to become an AISP](https://www.yapily.com/blog/how-to-become-an-aisp),
[Yapily pricing](https://www.yapily.com/pricing), [Yapily coverage](https://www.yapily.com/coverage),
[Yapily vs Plaid, business-account connectivity claim](https://www.yapily.com/blog/plaid-alternatives),
[Yapily case study: Emma](https://www.yapily.com/blog/open-banking-case-study-emma),
[Yapily: 90-day re-authentication changes](https://www.yapily.com/blog/90-day-reauthentication-changes),
[TrueLayer partnerships](https://truelayer.com/partnerships/),
[TrueLayer: the 90-day re-authentication rule](https://truelayer.com/blog/compliance-and-regulation/explaining-changes-to-the-90-day-rule-for-open-banking-access/),
[FCA application fees](https://www.fca.org.uk/firms/authorisation/apply/fees), [Open Banking Tracker: free open banking
APIs 2026](https://www.openbankingtracker.com/guides/free-open-banking-apis), [dev.to: cheapest open
banking APIs 2026](https://dev.to/johnfrandsen/the-cheapest-open-banking-apis-for-small-businesses-and-indie-builders-in-2026-5cab),
[dev.to: beyond TrueLayer, choosing an open banking API 2026](https://dev.to/johnfrandsen/beyond-truelayer-choosing-the-right-open-banking-api-for-european-projects-2026-5coa),
[dev.to: comparing European open banking API providers 2026](https://dev.to/johnfrandsen/comparing-european-open-banking-api-providers-in-2026-plaid-truelayer-tink-gocardless-125c)
(the last three dev.to pieces share one author who also builds a competing product, disclosed on
one of them), [Plaid reviews, Capterra](https://www.capterra.com/p/174384/Plaid/reviews/),
[Yapily reviews, G2](https://g2.com/products/yapily/reviews),
[GoCardless Bank Account Data setup note](https://actualbudget.org/docs/advanced/bank-sync/gocardless/),
[Firefly III: importing from GoCardless](https://docs.firefly-iii.org/tutorials/data-importer/gocardless/),
[dev.to: self-hosted bank aggregation after the Nordigen shutdown](https://dev.to/johnfrandsen/self-hosted-bank-account-aggregation-in-2026-after-the-nordigen-free-tier-shutdown-3mdo),
[Enable Banking pricing, G2](https://www.g2.com/products/enable-banking/pricing),
[Zapier partner program](https://docs.zapier.com/platform/publish/partner-program), [MCP registry](https://github.com/modelcontextprotocol/registry),
[awesome-mcp-registries](https://github.com/tuanone123/awesome-mcp-registries).

#### 3.8 The referral scheme's creator tier and the affiliate content kit

Why it fits. UK nano creators charge £20 to £150 a post, micro creators £250 to £2,000, with a
two to three times premium for finance; affiliate commissions run 10% to 30%. No UK sole-trader,
landlord or bookkeeping creator's appetite for our commission has been measured, and none has
been asked. The operator's answer (Q6) is bounty only: the Q2 commission, £0 up front, and the
creator's own time cut to near zero by ready-made content. That makes the offer a share of
revenue plus finished material, which is what a small creator with a niche audience can accept
without a fee.

The content kit. Generated from what exists (the site-video-capture recordings, `publish.json`,
the catalogue prices, the deadline calendar) and downloaded from the affiliate's stats page with
their code or link filled into every item. One set per audience (VAT filers; MTD Income Tax sole
traders and landlords; bookkeepers and small practices; limited companies) and per deadline (the
7th of each month for VAT; 7 August, 7 November, 7 February, 7 May and 31 January for Income Tax).

| Item | Source | Notes |
| --- | --- | --- |
| Short clips and Shorts (under 60 s) cut from the existing recordings, 16:9 and a 9:16 vertical cut | video-capture runs, OPS-90 | description template carries the affiliate's tracked link; an end-card slot for the affiliate's own card |
| Still images and screenshots | the capture runs' stills (BACKLOG 79) | per page and per journey |
| Post text for LinkedIn, X, Facebook, Instagram, TikTok; a blog paragraph | generated from `publish.json` descriptions and the fact sheet | the #ad label placed first, as the CAP code requires |
| An email or newsletter paragraph | same | with the link |
| One-page fact sheet: what it is, who it is for, price | `submit.catalogue.toml`, the guide | regenerated on a price change |
| Suggested titles and hashtags | per audience and deadline | #ad already placed |
| FAQ answers | `guide.html`, the support-corpus articles | the ten topics of 3.3 |

Each item carries the affiliate's code or link, filled in when downloaded from the stats page
(MK-40, MK-46). The kit regenerates when a video is re-recorded, a price changes or a deadline
passes (MK-48). The casual tier gets the same kit.

Terms. The Q2 commission, a `resident-pro-comp` bundle to make content with, the same code,
window, rules and disclosure clause. No flat fee.

First steps.

1. A shortlist of ten UK creators (audience size, platform, contact route) in the private
   workspace folder `../marketing/`, never in this repository (MK-29).
2. The kit generator and the first two audience sets, VAT filers and Income Tax sole traders
   (MK-45, MK-47).
3. Outreach with the creator terms and the kit once 3.5 has its third converting affiliate.

Cost. Commission from money received; machine time for the kit. Three operator hours per
creator.

Leading indicator. Replies to outreach; kit downloads per affiliate; sessions carrying each
creator's code.

Target. One creator by 7 May 2027; 3 paid subscribers by 7 November 2027.

Stop rule. A creator whose kit downloads produce under 20 code-carrying sessions in three months
is not chased.

#### 3.9 LinkedIn, company page

Why it fits, and its limit. The operator keeps a low personal profile (Q5), so the company page
carries LinkedIn alone. Company page organic reach fell 60% to 66% between 2024 and early 2026,
and personal profiles get about eight times a page's engagement, so the expected return is
small. LinkedIn Ads cost £50 to £150 a lead against a £127 lifetime value, so paid LinkedIn is
out at this price. The readers who matter there are bookkeepers and accountants (`resident-pro`).

First steps.

1. A DIY Accounting Limited company page: the product in one line, the tagged link, the videos.
2. One post per deadline cycle (the week before the 7th) and one per release, machine-drafted from
   a staged directory (BACKLOG 81's first slice) and posted by hand until BACKLOG 78's acceptance
   gate exists, then posted by the workflow.
3. The bookkeeper article (3.2) and the affiliate scheme page are the two posts that fit the
   audience.

Cost. £0. One operator hour a month.

Leading indicator. Sessions with source `linkedin` a month.

Target. 1 paid subscriber, `resident-pro`, by 7 August 2027.

Stop rule. Under 20 tagged sessions a month after six months: release posts only.

### 4. Three horizons, on the tax calendar

Fixed dates. VAT returns are due on the 7th of every month for one third of traders (one month
and seven days after the quarter end). MTD Income Tax quarterly updates for the first cohort are
due 7 November 2026, 7 February 2027, 7 May 2027 and 7 August 2027; the final declaration for
2026-27 is due 31 January 2028. The 2025-26 Self Assessment deadline is 31 January 2027. The
over-£30,000 cohort joins MTD Income Tax on 6 April 2027 and the over-£20,000 cohort on 6 April
2028. Every deadline week is a launch week.

Arithmetic, from the price review's formulas. Additions a month to reach N active subscribers in
T months at 2.5% monthly churn (30% a year): a = N × (1/T + 0.0125). Sessions a month = a ÷
purchase rate. The measured rate is 0.28% (n = 2, at 99p); 1% and 2% are what the conversion
work in 3.1 and a listing that sends buyers at a deadline would have to deliver.

| Horizon | Active paid | By | Additions a month | Sessions at 0.28% | at 1% | at 2% |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| A operating break-even | 35 | 7 Aug 2027 (10 months) | 4 | 1,410 | 390 | 200 |
| B ramen profitability | 1,000 | 31 Jan 2029 (18 months) | 68 | 24,300 | 6,800 | 3,400 |
| C about £1m ARR | 20,000 | 31 Jan 2032 (36 months) | 806 | 288,000 | 80,600 | 40,300 |
| Holding C | 20,000 | every month after | 500 | 179,000 | 50,000 | 25,000 |

Today: 900 to 1,250 sessions a month. A fits inside today's traffic if the rate holds at £39; B
needs five to twenty times today's traffic; C needs a population-scale channel.

The cap through the horizons (the table under the spend rule; ITSA mix, donations flat at £190
net): about £90 a month today; £258 at A; £1,527 at 300 subscribers, 51 additions at a £30 cost
per acquisition; £4,880 at 1,000, 163 additions, so the cap alone at £30 covers B's 68 a month
from about 400 subscribers; £2,440 once the base passes 1,000 and the share drops to 50%;
£12,020 at 5,000, 400 additions. C needs 806, so from B onward the cost per acquisition has to
fall under £15 or the unpaid channels carry the rest.

#### Horizon A: operating break-even, 35 active paid subscribers by 7 August 2027

Campaign spend is the £1 a day floor plus the cap, about £90 a month from donations, and the
cap's one use in this horizon is Google Ads Search above the floor from 7 November 2026 (3.6,
gated on M6). Every other channel is free: 3.1 (own properties), 3.2 (HMRC free-version flag, the
Income Tax finder if O11 lands), 3.3 (deadline pages, the ten articles), 3.4 (tagged, re-titled
videos, Shorts), 3.5 in full on Connect Express at £0 before a payout, 3.7 ranks 1, 2 and 5
(registries, bank CSV imports), 3.8's kit, 3.9's company page. Four additions a month at 0.28% is
1,410 sessions; the 3.1 conversion work is what makes A reachable inside the 900 to 1,250 the site
has, and £90 a month of Search clicks at £0.06 is another 1,500 sessions, about 4 additions a month
if they convert at the site's rate. If they do, A comes forward to 7 May 2027; the 7 Aug 2027 date
assumes they convert at half that. If Income Tax filing goes live in production inside this
horizon, A becomes 21 at the ITSA mix and the date moves forward again.

| Checkpoint | Date | Active paid | Leading indicators |
| --- | --- | ---: | --- |
| Rails live | 7 Nov 2026 | 2 | every paid subscriber has a source; first reading of the £39 purchase rate; 8 listings live |
| Content and referral | 31 Jan 2027 | 8 | 100 organic sessions a month on the new pages; 5 affiliates approved; 30 tagged YouTube sessions a month; the kit's first two sets live |
| Second Income Tax quarter | 7 May 2027 | 20 | `resident-vat` review due 28 March 2027 done; Stripe App submitted |
| A | 7 Aug 2027 (7 May 2027 if the Search clicks convert at 0.28%) | 35 | net subscription revenue £100 a month; the cap about £258 a month |

If the 7 November reading of the £39 rate is under 0.15%, every hour moves to 3.1 and A's date
moves to 7 November 2027.

#### Horizon B: ramen profitability, 1,000 active paid subscribers by 31 January 2029

What scales from 35 to 1,000. The Income Tax finder: 864,000 mandated people in the first cohort,
the over-£30,000 cohort from April 2027, first final declarations by 31 January 2028, the
over-£20,000 cohort from April 2028. The finder sends buyers at the deadline, which is the only
traffic that has converted so far, and it moves the mix from VAT to ITSA, which raises revenue
per subscriber from £2.88 to £4.79 net. Search content for the Income Tax queries the same
people type. The referral scheme with the kit, so bookkeepers and creators recruit themselves at
no cost until they earn. Google Ads Search as the cap grows: about £1,527 a month at 300
subscribers, 51 additions at £30 each; about £4,880 at 1,000, 163 additions, so from about 400
subscribers the cap alone funds B's 68 a month and money stops being B's constraint; the finder
listing and the purchase rate are. The
practice channel (`resident-pro`, the passes, the bookkeeper article) adds subscribers in fives
and lifts the mix.

Conditions. Production recognition for Income Tax (O11) and the finder listing before 31 January
2028; the purchase rate at 1% or better on finder and search traffic; the referral scheme live
with at least 25 affiliates.

| Checkpoint | Date | Active paid | Leading indicators |
| --- | --- | ---: | --- |
| Income Tax listed | 31 Jan 2028 | 100 | finder-referred sessions a month; purchase rate on them; Ads cost per acquisition under £30; mix moving toward ITSA |
| Third cohort's first quarter | 7 Aug 2028 | 400 | 6,800 sessions a month at 1%; affiliates over 25; `resident-pro` over 20 |
| B | 31 Jan 2029 | 1,000 | MRR £4,900; net £4,790 a month; support under 20 hours a month |

#### Horizon C: about £1m ARR, 20,000 active paid subscribers by 31 January 2032

What 20,000 means. The MTD Income Tax population reaches about 2.9 million by 2028 and VAT MTD
has 2.29 million live traders; 20,000 is 0.4% of the two together, and 806 additions a month is
0.2% of that population a year. HMRC's VAT finder lists about 466 products; an equal share of
2.29 million is 4,900 subscribers each, so C is four times an equal share of the VAT finder alone,
or a small share of the Income Tax finder, which lists far fewer products today. Holding 20,000 at
30% churn is 500 additions a month before growth. The support model in `PLAN_DIYA_GL_LAUNCH.md`
§4 (one operator hour per 50 subscribers a month) is 400 hours a month at C.

What carries it. The Income Tax and VAT finders as the organic base; the referral scheme with the
cap funding Ads and, if the operator later chooses, creator fees (at 5,000 subscribers the cap at
the 50% share is about £12,020 a month, 400 additions at £30 each; C needs 806, so the cost per
acquisition has to fall under £15 or the unpaid channels carry the rest); the practice channel at
scale, where one
practice brings a client list.

Open problems, each a horizon with no design yet in this plan:

| Problem | What it needs | Where it would be planned |
| --- | --- | --- |
| Product breadth | VAT, Income Tax and Companies House all recognised and filing in production; the agents API for practices; a bank feed once Q9 is answered | `PLAN_ITSA_PHASE_2.md`, `PLAN_DIYA_GL_LAUNCH.md` §5c |
| Price tiers for practices | A per-client price or a client-count tier above `resident-pro` at £199, so a 200-client practice pays for what it files | a pricing plan after `REPORT_PRICE_UPDATE_REVIEW.md` |
| The accountant channel | Practice-facing collateral, a partner tier in the referral scheme, and a presence where practices choose software (AccountingWEB, ICB and AAT member channels) | MK-44 |
| Support at 400 hours a month | Self-serve answers from the support corpus, machine-drafted replies behind an acceptance gate (BACKLOG 78), then hires funded from revenue | `PLAN_EMAILS_TO_ARTICLES`, `PLAN_REPOSITORY_AUTOMATION.md` |
| Trust at scale | The security and compliance evidence a 20,000-customer filing product is asked for (Cyber Essentials, ISO 27001) | `PLAN_ONE_STOP_DASHBOARD.md` compliance panel |
| Partnerships | Bank marketplaces (3.7 ranks 6 and 7) once the AIS answer allows; a white-label practice offer if a practice asks with a number attached (launch plan §5d) | `PLAN_DIYA_GL_LAUNCH.md` §5d |

| Checkpoint | Date | Active paid | Leading indicators |
| --- | --- | ---: | --- |
| Cap funds paid channels | 31 Jan 2030 | 5,000 | cost per acquisition under £15; practices over 200; support hours per 50 subscribers under 1 |
| Half way | 31 Jan 2031 | 10,000 | 40,000 sessions a month at 2%; finder share; churn under 25% a year |
| C | 31 Jan 2032 | 20,000 | ARR £1.18m at the ITSA mix; the open problems above each have a plan on `main` |

The dates in B and C are targets set by the arithmetic at 1% and 2%, not measurements. Each
checkpoint re-reads the rate, the mix and the cap and moves the next date.

### 5. Tasks

Proposed rows; the coordinator places them. Kind: machine-only, machine-ask (a machine row with
one operator decision or step inside it), human-driven. Model is the lowest that fits. MK-15 is
not used (Q1: donation-only).

| Id | Change | Kind | Files | Model |
| --- | --- | --- | --- | --- |
| MK-1 | M1: `analytics.js` captures `utm_*`, `gclid`, `ref` at landing; the session beacon carries them; `v_traffic_sources_daily` gains a source column (DATA-24, SITE-04, DATA-27) | machine-only | ~5 | Sonnet |
| MK-2 | M2: the spreadsheets and diya-gl `analytics.js` twin captures the same and appends the stored source to every link into Submit (SS-31, SS-21, SS-26) | machine-only | ~4 | Sonnet |
| MK-3 | M3: `acquisition` map on the bundle record, written from the client's stored source at first sign-in; unit tests | machine-only | ~5 | Sonnet |
| MK-4 | M4: `bundle_id` and live/test on Stripe charge rows; actor on subscription rows; probe exclusion in the cancellation view (DATA-28, DATA-09) | machine-only | ~5 | Sonnet |
| MK-5 | M5: `v_paid_subscribers_by_channel` with the three bundles, active base, MRR and ARR at the actual mix; renewal view reads `subscription-renewed` (DATA-28) | machine-only | ~3 | Sonnet |
| MK-6 | M8: dashboard panel, paid subscribers by channel with cost and hours per subscriber from `marketing.toml` (DATA-26, SITE-21) | machine-only | ~4 | Sonnet |
| MK-7 | M8: `marketing.toml` with one row per channel per month; the operator fills hours | machine-ask | 1 | Haiku |
| MK-8 | M6: nightly offline conversion upload to Google Ads from live charges with a stored `gclid` (DATA-32, DATA-22) | machine-only | ~4 | Opus |
| MK-9 | 3.6: Search campaign in `ads.toml` with the four keyword groups, `maximize_clicks`, £1/day; Performance Max paused; applied with `ads:sync -- --apply` on the operator's yes (DATA-32) | machine-ask | 2 | Sonnet |
| MK-10 | M7: `publish.json` link per video with UTM; `youtube-upload.js` writes and re-syncs descriptions; pinned comment (OPS-93, DEV-41) | machine-only | ~4 | Sonnet |
| MK-11 | M7: nightly YouTube Analytics pull into the lake; the OAuth client gains the analytics scope (operator consents once) (DATA-22, DATA-46) | machine-ask | ~4 | Sonnet |
| MK-12 | 3.4: Shorts cut under 60 s, 9:16, per journey from existing captures, uploaded as Shorts with the tagged link (OPS-90, OPS-93) | machine-only | ~4 | Opus |
| MK-13 | 3.4: deadline-timed titles and descriptions for the eight public videos, re-synced | machine-only | 1 | Haiku |
| MK-14 | 3.1 steps 1 to 3: "file with HMRC" on the BST/SE VAT view, post-save cloud offer, download page and article footer lines, all tagged (SS-26, SS-27, SS-21, SS-23) | machine-only | ~6 | Sonnet |
| MK-16 | 3.1 step 4: Submit home page deadline line from the visitor's date; login page states the three steps | machine-only | ~3 | Sonnet |
| MK-17 | 3.3 step 1: VAT deadline calendar page and MTD Income Tax quarters page on Submit, in the sitemap and the CloudFront invalidation list (SITE-10) | machine-only | ~5 | Sonnet |
| MK-18 | 3.3 step 2: the ten support-corpus articles on the spreadsheets knowledge base, drafted for the operator's tax-content check (SS-23, BACKLOG 23) | machine-ask | ~12 | Sonnet |
| MK-19 | M10: nightly Search Console pull into the lake; the property is verified once by the operator (DATA-06 sibling) | machine-ask | ~4 | Sonnet |
| MK-20 | 3.2 step 1: email HMRC's SDST for the "free version" flag on the VAT listing | human-driven | 0 | none |
| MK-21 | 3.2 step 3: the bookkeeper and small-practice article with the `resident-pro` offer and the passes | machine-only | 2 | Sonnet |
| MK-22 | 3.5: referral spec blocks 1 to 3 plus the `affiliate#<code>` item, the `ref`-at-sign-up write, the checkout metadata, and the commission ledger fed by `checkout.session.completed` and `invoice.paid` for 12 months (BACKLOG 15) | machine-only | ~10 | Sonnet |
| MK-23 | 3.5: referral spec blocks 4 and 5, campaign passes, ambassador tiers, the customer's own code beside the passes on `bundles.html`, behaviour test | machine-only | ~10 | Sonnet |
| MK-24 | 3.5: `affiliates.html` with the tiers, the 30% commission, the 90/180-day window, the rules, the disclosure clause and the Join button into Connect Express onboarding | machine-only | ~3 | Sonnet |
| MK-25 | 3.5: the monthly commission run: commissions past the 30-day window per code, above £20, as Stripe transfers to connected accounts; the ledger view (due, held, paid) in Athena (DATA-28) | machine-only | ~5 | Sonnet |
| MK-26 | 3.5 step 6: approve and invite the first five casual affiliates | human-driven | 0 | none |
| MK-27 | 3.9: create the LinkedIn company page with the product line, tagged link and videos | human-driven | 0 | none |
| MK-28 | 3.9: staged post templates for the company page, deadline cycle and releases, posted by hand until BACKLOG 78's gate exists (BACKLOG 81 first slice) | machine-only | ~3 | Haiku |
| MK-29 | 3.8: creator shortlist and terms sheet in the private `../marketing/` folder | machine-ask | 1 | Sonnet |
| MK-30 | M9: visitor-kind view returns human sessions (DATA-23, DATA-27) | machine-only | ~4 | Sonnet |
| MK-31 | `experiments.toml` row per channel launch, objective `conversion-to-paid` (SITE-21) | machine-only | 1 | Haiku |
| MK-32 | 3.7 ranks 1 and 2: `server.json` and publishes to the official MCP registry, Glama, PulseMCP, mcp.so and Smithery; awesome-mcp-servers PR; npm README "works with" section and GitHub topics (SS-06, SS-20) | machine-only | ~3 | Sonnet |
| MK-33 | 3.7 rank 5: CSV parsers for Tide, Starling and Revolut Business exports first, then Monzo and Wise, beside MCP-10's NatWest parser, with fixtures; one "works with" page per bank on diya-gl.co.uk, in the sitemap (SS-25) | machine-only | ~14 | Sonnet |
| MK-34 | 3.7 rank 3: Stripe Partner Ecosystem application, Apps track, from the live Stripe account | human-driven | 0 | none |
| MK-35 | 3.7 rank 3: a Stripe App exporting a period's balance transactions and payouts as diya-gl lines (DATA-49, DATA-51), submitted for App Marketplace review | machine-only | ~8 | Opus |
| MK-36 | 3.7: send the enquiry text in 3.7 to Plaid and Yapily from the operator's address (Finexer if either prices above the cap); record the terms, price and agent model in `PLAN_DIYA_GL_LAUNCH.md` §5d; a regulatory adviser only if the terms leave diya-gl carrying the regulated activity (Q9) | human-driven | 0 | none |
| MK-37 | 3.7 rank 4: Zapier public integration over the cloud store API, triggers and actions, submitted for listing (SS-27); blocked on the cloud store API being stable on prod | machine-ask | ~6 | Sonnet |
| MK-38 | 3.5: `referrals.toml` declaring the programme (tiers, the 30% rate, the 12-month term, the 90/180 window, the 30-day hold, the £20 minimum) read by the ledger and the transfer run; the Connect Express account-link onboarding flow (`/api/v1/affiliates`) that writes the `affiliate#<code>` item on completion (BILL-24 pattern) | machine-only | ~6 | Opus |
| MK-39 | 3.5: enable Connect on the live Stripe account, Express account type, GBP payouts; the platform settings the onboarding flow needs | human-driven | 0 | none |
| MK-40 | 3.5: the affiliate stats page on Submit (clicks, sign-ups, conversions, commission due, held and paid) from our own attribution data, signed in through the affiliate's code; links to Stripe's Express payout dashboard | machine-only | ~5 | Sonnet |
| MK-41 | The spend rule on the dashboard: previous month's pool (net subscriptions plus net donations), the share (100% to 1,000 active, then 50%), the cap, the floor, and actual campaign spend from `marketing.toml` and the Ads report (DATA-26, DATA-28, DATA-34) | machine-only | ~3 | Sonnet |
| MK-42 | 3.6: the nightly Ads budget governor: sets the Search campaign's daily budget from the cap and the floor, concentrated on the 1st to the 7th, through `ads-sync.js`; reads the floor from the `reserve_floor` parameter `ads.toml` already names (DATA-32) | machine-only | ~4 | Sonnet |
| MK-43 | The milestone panel: active paid base, MRR, ARR and the mix against A, B and C; the `resident-vat` review date 28 March 2027 shown until it passes (DATA-26, DATA-28) | machine-only | ~3 | Sonnet |
| MK-44 | Horizon C: a plan for the accountant and practice channel (per-client pricing above `resident-pro`, the partner tier of the referral scheme, the member channels) as `PLAN_PRACTICE_CHANNEL.md`, from the practice page, MCP-08 and MCP-09 | machine-ask | 1 | Opus |
| MK-45 | 3.8: the kit generator: a script that builds one content set from the capture recordings (clips under 60 s, 16:9 and 9:16), the stills, `publish.json`, the catalogue and the deadline calendar, into `target/kit/<audience>/<deadline>/`, with placeholders for the code and link (OPS-90, OPS-93) | machine-only | ~6 | Opus |
| MK-46 | 3.8: the per-affiliate download on the stats page: fills the placeholders with the affiliate's code and link and serves the set as a zip; a `kit_downloaded` event | machine-only | ~4 | Sonnet |
| MK-47 | 3.8: the content sets: post text for LinkedIn, X, Facebook, Instagram, TikTok and a blog paragraph, the email paragraph, the one-page fact sheet, titles and hashtags with the #ad label placed first, and FAQ answers, for the four audiences and each deadline, as templates the generator fills | machine-only | ~10 | Sonnet |
| MK-48 | 3.8: kit refresh: the generator re-runs when a video is re-recorded (video-capture.yml completes), the catalogue's price changes, or a deadline passes; a workflow on those triggers | machine-only | ~3 | Sonnet |
| MK-49 | 3.7 ranks 6 and 7: on the aggregator terms from MK-36, a "connect your bank" opt-in on the DIYA-GL page for Tide, Starling and Revolut Business (the aggregator's consent flow, or the customer's own Starling token or Revolut certificate where the terms allow), transactions into diya-gl bank lines through MCP-10's line builder; then the Starling Marketplace, Tide and Revolut integration listings; blocked on MK-36 and on the cap covering the fee (SS-27, MCP-10) | machine-ask | ~10 | Opus |

### 6. Open questions for the operator

| Q | Decision | Alternatives | Answer (2026-09-28) |
| --- | --- | --- | --- |
| Q1 | The donate page's offer | (a) `resident` at £39 a year shown beside the donation amounts; (b) donation-only | (b) donation-only |
| Q2 | Affiliate fee shape | (a) flat £10 per `resident`, £40 per `resident-pro`; (b) 25% of the first charge; (c) 30% of every payment in the first 12 months | (c) 30% of every payment the referred customer makes in their first 12 months, paid after the refund window from money received |
| Q3 | When the referral programme opens | (a) at the first approved affiliate; (b) at the first attributed paid conversion | (a) first approved affiliate; £0 until a payout on Connect Express |
| Q4 | Google Ads shape | (a) Performance Max paused, Search alone at £1/day; (b) both, £1/day each | (a) Search alone at £1 a day, bidding to maximise clicks; the conversion action stays recorded; Performance Max paused |
| Q5 | LinkedIn voice | (a) the founder's profile posts, company page as the record; (b) company page only | (b) company page only; the operator keeps a low personal profile |
| Q6 | Creator budget in year one | (a) bounty only: creators earn the Q2 commission when their link produces a paid subscription, £0 up front; (b) one flat-fee post by a small creator capped at £150, bought only after three affiliate conversions and paid from revenue under the spend rule | (a) bounty only, with the content kit so the creator's outlay is near zero |
| Q7 | Attribution window | (a) 30 days click to sign-up, 90 days sign-up to charge; (b) 90 and 180 | (b) 90 days click to sign-up, 180 days sign-up to first charge |
| Q8 | What counts as a paid subscriber for the targets | (a) `resident` and `resident-pro` only, `resident-vat` closed to new buyers; (b) all three counted, `resident-vat` kept open | (b) a mix of the three; `resident-vat` open until at least 28 March 2027, then a review; more `resident-pro` expected after the ITSA launch |
| Q9 | The account-information question for a bank feed | (a) one written enquiry to a regulatory adviser now; (b) hold every bank integration until 50 paid subscribers and ask then; (c) ask two aggregators for agent and partner terms first (MK-36), an adviser only if the terms leave diya-gl regulated | (c) ask two aggregators first, Plaid and Yapily, for Tide, Starling and Revolut Business, with PayPal and Stripe on their own APIs; the usual pattern: small UK accounting apps run as an agent of, or under the permissions of, an FCA-authorised aggregator (August under Plaid Financial Ltd); larger ones register as an AISP (FreeAgent) |
| Q10 | The referral platform | (a) Dub Partners; (b) Rewardful Growth; (c) Tolt Growth; (d) in-house on Stripe Connect Express | (d) in-house on Stripe Connect Express; Dub, then Rewardful, as the fallback past about 50 affiliates |
| Q11 | The spend pool | (a) net subscription revenue only; (b) net subscription revenue plus donations (£195 in the last 30 days), which opens the cap now | (b) subscriptions plus donations |
| Q12 | The cap's share of the pool above £100 | (a) 50%, half retained as margin; (b) 100%, every pound above running costs reinvested until B | (b) 100% until the active paid base exceeds 1,000, then 50%; the operator reviews later |
