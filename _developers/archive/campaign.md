<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

Below is a pragmatic pricing and referral structure aligned with the UK VAT SaaS market, HMRC MTD tooling norms, and your stated constraints.

---

## Monthly subscription price (Business tier)

**Recommended price: £12.99 per VAT registration per month (ex VAT)**

**Rationale**

* Competing UK MTD VAT tools cluster at:

    * £5–£8: feature-thin, high-volume incumbents
    * £10–£15: serious compliance tools for micro-businesses
    * £20+: accountants / multi-entity / bundled bookkeeping
* £12.99 positions you as:

    * Clearly paid (not “toy” pricing)
    * Affordable for sole traders and micro-limited companies
    * High enough to fund support, HMRC change churn, and infra
* Psychologically acceptable as “~£150/year to stay compliant”.

**Annual option (recommended)**

* **£129/year (2 months free)**
* Increases cash-flow stability and pairs well with referral logic.

---

## Guest (free) access validation

Your proposal is sound **if tightly constrained**.

**Strong points**

* Reduces compliance anxiety for first-time filers
* Avoids full lock-out (important for trust in tax software)
* Daily reset avoids abuse without heavy enforcement logic

**Hard requirements**

* Cap by **successful HMRC submissions**, not UI actions
* Enforce **per VRN + per Cognito identity**
* Display a visible counter and reset time (“resets at 02:00 UK”)
* Guest submissions should:

    * Be rate-limited
    * Exclude amendments
    * Exclude advanced diagnostics / history

If guest users can *repeatedly* submit real VAT returns for free, you will be exploited. Keep it to **1–2 successful submissions per rolling 24h**.

---

## Referral campaign: structure & validation

### 1. Referral reward: free subscription months

**Mechanic**

* Referrer gets **1 free Business month per successful referral**
* Credited **after the referred user submits their first VAT return**
* Cap at **12 months accrued**

**Why this works**

* Rewards real value creation, not sign-ups
* Encourages referrers to onboard properly
* Caps long-term liability

**Important**

* Credits should apply **after any paid period**, not stack immediately if the referrer is already paid (avoids refund logic).

---

### 2. Commission for long-term conversion

You are right to delay commission. Immediate payouts are a mistake.

#### Recommended commission

* **20% of the first year’s net subscription value**

    * At £129/year → **£25.80 per converted user**

This is competitive with:

* SaaS affiliate norms (15–30%)
* Accountant referral arrangements (often 20–40%, but with volume)

#### Payment condition (N)

**Recommended N: 3**

**Rule**

* Commission is payable **once the referrer has at least 3 referred users**
  who have each:

    * Paid for a full year
    * Not refunded or cancelled
* Commission applies **only to the first year per referred user**

**Why N = 3**

* Filters low-effort / self-referrals
* Reduces admin overhead
* Creates a meaningful incentive without encouraging spam

---

## Abuse & edge-case controls (non-optional)

You should explicitly implement:

* No self-referrals (same person, company, VRN, payment method)
* One referrer per account, immutable after signup
* Commission paid **monthly or quarterly**, not immediately
* Payouts only via:

    * Account credit by default
    * Cash payout above a minimum threshold (e.g. £50)

---

## Overall assessment

**This is a solid, commercially sane launch structure.**

* Pricing is credible and defensible
* Free tier lowers friction without destroying value
* Referral scheme rewards real adoption, not noise
* Commission timing protects you from churn and fraud

If you later add accountant-centric features, you can introduce a **separate partner tier** with higher commission and multi-client tooling. Do not conflate that with this initial referral scheme.

If you want, next steps could include:

* A concise pricing page copy
* Referral T&Cs wording (important for payouts)
* A stress-test model (CAC vs referral cost vs churn)
