<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Business as Code

**Concept**: Define and manage the entire operational cashflow of a business through version-controlled scripts and infrastructure.

**Strategy**: Use DIY Accounting Ltd as the first customer, proving every capability we build by running our own business on it. Then expose these capabilities to customers - first as manual filing tools, eventually as a fully integrated digital business ecosystem.

---

## Vision

Just as Infrastructure as Code (IaC) replaced manual server provisioning, Business as Code extends this principle to financial operations:

```
Traditional                          Business as Code
───────────────────────────────────────────────────────────────
Manual bank login                    scripts/bank-reconcile.sh
Spreadsheet invoicing                Stripe API + Lambda webhooks
Copy-paste to accountant             Automated financial reports
Check AWS console for costs          CloudWatch cost dashboards
Manual account creation              scripts/aws-org-create-account.sh
```

---

## Architecture

```
                                    ┌─────────────────────────┐
                                    │      This Repository    │
                                    │                         │
                                    │  ┌───────────────────┐  │
                                    │  │ scripts/          │  │
                                    │  │ ├── stripe-*      │  │
                                    │  │ ├── bank-*        │  │
                                    │  │ ├── aws-org-*     │  │
                                    │  │ └── reconcile-*   │  │
                                    │  └───────────────────┘  │
                                    │                         │
                                    │  ┌───────────────────┐  │
                                    │  │ infra/            │  │
                                    │  │ └── BillingStack  │  │
                                    │  └───────────────────┘  │
                                    └────────────┬────────────┘
                                                 │
                     ┌───────────────────────────┼───────────────────────────┐
                     │                           │                           │
                     ▼                           ▼                           ▼
           ┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
           │     Stripe      │         │   Business Bank │         │      AWS        │
           │                 │         │  (Wise/Mercury) │         │  Organizations  │
           │ Products:       │         │                 │         │                 │
           │ - Guest Pass    │ payout  │ GBP Account     │ debit   │ submit-prod     │
           │ - Test Bundle   │────────▶│                 │────────▶│ submit-ci       │
           │ - Standard Sub  │         │ Transactions    │         │ submit-backup   │
           │                 │         │ via API         │         │                 │
           │ Webhooks ──────────────────────────────────────────▶ Lambda handlers  │
           └─────────────────┘         └─────────────────┘         └─────────────────┘
```

---

## Money Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CUSTOMER PAYMENT                                │
│                                                                              │
│   Customer ──▶ Stripe Checkout ──▶ Subscription Created                     │
│                      │                    │                                  │
│                      ▼                    ▼                                  │
│               Payment Intent        Webhook: customer.subscription.created  │
│                      │                    │                                  │
│                      ▼                    ▼                                  │
│               Charge Succeeded      Lambda: billingWebhookPost               │
│                      │                    │                                  │
│                      ▼                    ▼                                  │
│               Stripe Balance        DynamoDB: bundles table updated          │
│                                     (user now has access)                    │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                              STRIPE → BANK                                   │
│                                                                              │
│   Stripe Balance ──▶ Scheduled Payout (weekly) ──▶ Bank Account (GBP)       │
│                                                          │                   │
│                                                          ▼                   │
│                                              Bank API: GET /transactions     │
│                                                          │                   │
│                                                          ▼                   │
│                                              scripts/bank-reconcile.sh       │
│                                              (match Stripe payouts)          │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                              BANK → AWS                                      │
│                                                                              │
│   Bank Account ──▶ Direct Debit ──▶ AWS Consolidated Billing                │
│                                              │                               │
│                                              ▼                               │
│                                    Cost Explorer API                         │
│                                              │                               │
│                                              ▼                               │
│                                    scripts/aws-cost-report.sh                │
│                                    (daily cost tracking)                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Scriptable Components

### Stripe (Billing In)

| Script | Purpose |
|--------|---------|
| `stripe-setup-products.sh` | Create/update products and prices |
| `stripe-setup-webhooks.sh` | Configure webhook endpoints |
| `stripe-list-subscriptions.sh` | Export active subscriptions |
| `stripe-revenue-report.sh` | MRR, churn, LTV calculations |

**Lambda handlers:**
- `billingWebhookPost.js` - Process Stripe webhook events
- `billingPortalGet.js` - Generate customer portal links

### Bank (Treasury)

| Script | Purpose |
|--------|---------|
| `bank-balance.sh` | Current account balance |
| `bank-transactions.sh` | List recent transactions |
| `bank-reconcile.sh` | Match Stripe payouts to bank credits |
| `bank-runway.sh` | Calculate months of runway |

**Candidate banks with APIs:**
- **Wise Business** - Excellent API, multi-currency, UK-based
- **Mercury** - US-focused but good API
- **Revolut Business** - Good API, UK-based
- **Starling Bank** - Open Banking compliant

### AWS (Costs Out)

| Script | Purpose |
|--------|---------|
| `aws-org-create-account.sh` | Create new account in organization |
| `aws-org-list-accounts.sh` | List all accounts and status |
| `aws-cost-report.sh` | Daily/monthly cost breakdown |
| `aws-cost-anomaly.sh` | Alert on unexpected cost spikes |
| `aws-budget-setup.sh` | Configure budget alerts |

### Reconciliation (Connecting the Dots)

| Script | Purpose |
|--------|---------|
| `reconcile-daily.sh` | Match all flows, flag discrepancies |
| `reconcile-report.sh` | Generate financial summary |
| `reconcile-tax-prep.sh` | Export data for accountant |

---

## Data Model

### Financial Events (DynamoDB)

```
financial-events table
├── PK: EVENT#{eventId}
├── SK: {timestamp}
├── eventType: stripe_payment | stripe_payout | bank_credit | bank_debit | aws_charge
├── amount: 4999  (pence/cents)
├── currency: GBP
├── externalId: pi_xxx | po_xxx | txn_xxx
├── reconciled: true | false
├── reconciledWith: [eventId, eventId]
└── metadata: {...}
```

### Monthly Summary (S3)

```
s3://submit-financial-reports/
├── 2026/
│   ├── 01/
│   │   ├── revenue.json      # Stripe MRR, new, churned
│   │   ├── costs.json        # AWS breakdown by service
│   │   ├── bank.json         # Opening/closing balance, transactions
│   │   ├── reconciliation.json
│   │   └── summary.json      # P&L summary
│   ├── 02/
│   └── ...
```

---

## Security Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Secrets Manager                                 │
│                                                                     │
│  stripe/api_key/live        ◄── Stripe live API key                │
│  stripe/api_key/test        ◄── Stripe test API key                │
│  stripe/webhook_secret      ◄── Webhook signature verification     │
│  bank/api_key               ◄── Bank API credentials               │
│  bank/api_secret            ◄── Bank API secret                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

Access Patterns:
- Lambda functions: Read-only access to relevant secrets
- Reconciliation scripts: Read-only access (no payment initiation)
- Payment scripts: Require MFA + approval workflow
```

---

## What Stays Manual

| Task | Why | Frequency |
|------|-----|-----------|
| Bank account opening | KYC/AML verification | Once |
| AWS payment method setup | Card/bank verification | Once |
| Stripe account activation | Identity verification | Once |

### What We Can Automate (Because That's What This Repo Does)

| Task | How | Notes |
|------|-----|-------|
| VAT returns to HMRC | **This repository** | We literally built this - eat our own dog food |
| Companies House filings | Companies House API | Annual accounts, confirmation statements |
| Corporation Tax | HMRC CT API | Same MTD patterns as VAT |

The entire point of DIY Accounting Submit is automating tax filings. The business that runs this software should be the first customer of its own product.

---

## Metrics Dashboard

CloudWatch dashboard showing:

```
┌─────────────────────────────────────────────────────────────────────┐
│  DIY Accounting Submit - Financial Operations                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │ MRR         │  │ AWS Costs   │  │ Margin      │  │ Runway     │ │
│  │ £2,450      │  │ £180/mo     │  │ 92.7%       │  │ 14 months  │ │
│  │ ▲ 12%       │  │ ▼ 3%        │  │ ▲ 0.5%      │  │ ▲ 2 months │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │
│                                                                     │
│  Revenue by Product          │  Costs by Service                   │
│  ┌────────────────────────┐  │  ┌────────────────────────┐         │
│  │ ████████████ Standard  │  │  │ ████████ Lambda        │         │
│  │ ████ Test Bundle       │  │  │ ████ CloudFront        │         │
│  │ ██ Guest Passes        │  │  │ ███ DynamoDB           │         │
│  └────────────────────────┘  │  │ █ API Gateway          │         │
│                              │  └────────────────────────┘         │
│                                                                     │
│  Reconciliation Status: ✅ All matched (last run: 2h ago)          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: VAT Returns (NOW - DONE)
- MTD VAT submission to HMRC ✅
- Obligation tracking ✅
- Receipt storage ✅

### Phase 2: Business as Code (NEXT)
- Stripe billing integration (products, subscriptions, webhooks)
- Bank account API integration (Wise/Mercury)
- AWS Organizations account scripting
- Automated cashflow tracking
- Cost visibility and anomaly detection
- **Goal**: Run DIY Accounting Ltd entirely through scripts in this repo

### Phase 3: Filing Suite
- Corporation Tax (CT600) via HMRC MTD CT API
- Companies House annual accounts
- Companies House confirmation statement
- PAYE/Payroll (if employees)
- **Goal**: All UK business compliance from one platform

### Phase 4: Integrated Platform
- Banking integration for customers
- Invoicing
- Expense tracking
- Reconciliation
- **Goal**: Expose our internal tools to customers

### Phase 5: Business Marketplace
- App/integration marketplace
- Partner ecosystem
- **Goal**: "Run your business" platform

---

---

## The Bigger Picture: Business Operating System

### Evolution Path

```
Phase 1: Single Tool (NOW)              Phase 2: Business as Code
┌─────────────────────────┐             ┌─────────────────────────┐
│   VAT Returns → HMRC    │             │   VAT Returns → HMRC    │
│                         │             │   + Stripe billing      │
│   (submit.diyaccounting)│     ──▶     │   + Bank account API    │
└─────────────────────────┘             │   + AWS account scripts │
                                        │   + Automated cashflow  │
                                        │                         │
                                        │   (run our own business │
                                        │    as code first)       │
                                        └─────────────────────────┘
                                                    │
                                                    ▼
Phase 3: Filing Suite                   Phase 4: Integrated Platform
┌─────────────────────────┐             ┌─────────────────────────┐
│   All HMRC filings:     │             │   All Filings +         │
│   - VAT Returns         │     ──▶     │   Banking Integration   │
│   - Corp Tax (CT600)    │             │   Invoicing             │
│   - PAYE/Payroll        │             │   Expense Tracking      │
│                         │             │   Reconciliation        │
│   Companies House:      │             │                         │
│   - Annual Accounts     │             │   (expose to customers) │
│   - Confirmation Stmt   │             └─────────────────────────┘
└─────────────────────────┘                         │
                                                    ▼
                                        Phase 5: Business Marketplace
                                        ┌─────────────────────────┐
                                        │   Full Business OS      │
                                        │                         │
                                        │   App Marketplace:      │
                                        │   - E-commerce          │
                                        │   - Inventory           │
                                        │   - CRM                 │
                                        │   - Marketing           │
                                        │   - Banking             │
                                        │   - Compliance          │
                                        │   - Payroll             │
                                        │                         │
                                        │   One login. One bill.  │
                                        │   Run your business.    │
                                        └─────────────────────────┘
```

### VAT Registration: Eating Our Own Dog Food

DIY Accounting Ltd could voluntarily register for VAT even below the £90k threshold:

**Why register voluntarily?**
| Benefit | Impact |
|---------|--------|
| Reclaim VAT on costs | AWS, software, equipment - real money back (~20% of costs) |
| B2B customers don't mind | They reclaim it anyway |
| Use our own product | File real VAT returns, not test data |
| Look established | VAT number signals legitimacy |
| Prove the system works | Nothing like production data to find bugs |

**The catch**: Once registered, you **must** charge VAT (20%) on taxable supplies. No "registered but charge 0%" option exists. The only zero VAT returns would be if:
- Revenue = £0 (no sales that quarter)
- All sales are zero-rated (books, exports) - not applicable to SaaS
- All sales are B2B reverse charge to EU/overseas - partially applicable

**Recommendation**: Register when we have paying customers. Use real VAT returns to validate the product. B2B SaaS customers expect VAT anyway.

### PayPal Donations and VAT Reality

The existing diyaccounting.co.uk site uses a **true donation model**: spreadsheets are freely downloadable, and users can optionally donate via PayPal (they can even cancel the donation and still download).

**HMRC's test**: Is there a "supply for consideration"?

| Model | Supply | Consideration | VAT Status |
|-------|--------|---------------|------------|
| Pay → Download (gated) | Yes | Yes | Taxable supply |
| Download free, optional tip | Yes | No (gift) | **Outside scope** |

The current model is the second - the spreadsheet is supplied regardless of payment. The donation is genuinely voluntary with no obligation. This is similar to busking, open source tipjars, or "pay what you want including £0".

**VAT implications:**

- **Current donations**: Outside VAT scope - not taxable even if VAT registered
- **Future Submit subscriptions**: Would be taxable supplies (pay → access)
- **Registering for VAT**: Would only affect new revenue streams, not the donation model

**Two revenue streams, two treatments:**

```
diyaccounting.co.uk (spreadsheets)     submit.diyaccounting.co.uk (SaaS)
┌─────────────────────────────┐        ┌─────────────────────────────┐
│ Free download               │        │ Paid subscription           │
│ Optional donation           │        │ Access gated by payment     │
│                             │        │                             │
│ Outside VAT scope           │        │ Taxable supply              │
│ (no change if registered)   │        │ (must charge VAT if reg'd)  │
└─────────────────────────────┘        └─────────────────────────────┘
```

**Recommended path**: When Submit launches with paid subscriptions, register for VAT to:
- Charge VAT on Submit subscriptions (B2B customers expect this)
- Reclaim VAT on AWS/software costs
- Keep spreadsheet donations as-is (still outside scope)
- File real VAT returns using our own product

### VAT Registration Plan: Customer Zero

**Objective**: Register DIY Accounting Ltd for VAT voluntarily to use our own MTD VAT filing product with real data.

#### Pre-Registration Checklist

| Step | Action | Status |
|------|--------|--------|
| 1 | Consult accountant (see draft below) | ⬜ Pending |
| 2 | Confirm business details (company number, registered address, SIC codes) | ⬜ Pending |
| 3 | Decide effective date (recommend: 1st of next month for clean quarters) | ⬜ Pending |
| 4 | Review current revenue streams for VAT treatment | ⬜ Pending |
| 5 | Set up VAT record keeping | ⬜ Pending |

#### Registration Process

1. **Register online**: https://www.gov.uk/register-for-vat
2. **Information needed**:
   - Company registration number
   - Business bank account details
   - Estimated taxable turnover for next 12 months
   - Reason for voluntary registration
3. **Timeline**: Usually 5-10 working days to receive VAT number
4. **Choose accounting scheme**: Standard VAT accounting (not Flat Rate - we want to reclaim)

#### Post-Registration Compliance

| Requirement | How We'll Handle It |
|-------------|---------------------|
| Charge VAT on taxable supplies | Update Stripe pricing to VAT-inclusive or add VAT at checkout |
| Issue VAT invoices | Stripe receipts include VAT breakdown |
| Keep VAT records for 6 years | DynamoDB + S3 (already have this infrastructure) |
| Submit quarterly MTD returns | **Use DIY Accounting Submit** (eat our own dog food) |
| Pay VAT due | Direct Debit to HMRC |

#### Revenue Stream VAT Treatment

| Revenue Stream | VAT Treatment | Action Required |
|----------------|---------------|-----------------|
| Spreadsheet donations (diyaccounting.co.uk) | Outside scope | None - continue as-is |
| Submit subscriptions (future) | Standard rated (20%) | Configure Stripe with VAT |
| B2B sales to EU | Reverse charge | Customer accounts for VAT |
| B2C sales to EU | VAT OSS | Register for OSS if significant |
| Sales outside EU | Outside scope | No VAT |

#### VAT Quarters

Choosing effective date of **1st February 2026** would give quarters:
- Feb-Apr (return due 7 June)
- May-Jul (return due 7 September)
- Aug-Oct (return due 7 December)
- Nov-Jan (return due 7 March)

#### Expected First Returns

Early returns will likely show:
- **Output VAT**: £0 or minimal (no/few paying customers yet)
- **Input VAT**: Reclaimable VAT on AWS, software, domain costs
- **Net position**: Likely VAT refund initially

This is normal for startups and validates our product handles both payment and refund scenarios.

---

#### Draft Communication for Accountant

```
Subject: VAT Voluntary Registration - DIY Accounting Ltd

Hi [Accountant],

I'm planning to voluntarily register DIY Accounting Ltd for VAT and wanted
to run this by you before proceeding.

BACKGROUND
DIY Accounting Ltd develops "DIY Accounting Submit" - MTD-compatible software
for filing VAT returns directly to HMRC. We want to register for VAT so we
can use our own product with real filings ("eat our own dog food").

CURRENT REVENUE
- Spreadsheet packages via diyaccounting.co.uk: Users can download for free
  and optionally donate via PayPal. Payment is not required for download.
- No subscription revenue yet from the Submit product.

MY UNDERSTANDING OF VAT TREATMENT
1. Existing spreadsheet donations: Outside scope of VAT (no supply for
   consideration - download available regardless of payment)
2. Future Submit subscriptions: Standard rated at 20%
3. Business costs (AWS, software): Input VAT reclaimable

QUESTIONS FOR YOU
1. Do you agree the donation model is outside VAT scope?
2. Any concerns with voluntary registration while below threshold?
3. Recommended effective date? I was thinking 1st February 2026.
4. Any other considerations I should be aware of?

WHAT I PLAN TO DO
- Register online at gov.uk
- Use standard VAT accounting (not Flat Rate)
- File returns quarterly using our own Submit product
- Keep records in our existing cloud infrastructure

I expect early returns to show minimal/zero output VAT and some input VAT
to reclaim on hosting costs. This validates our product handles refund
scenarios as well as payments.

Please let me know your thoughts or if you'd like to discuss.

Thanks,
[Name]
```

---

### DIY Accounting Ltd as Customer Zero

Every capability we build, we use first:

| Capability | For Our Business | For Customers |
|------------|------------------|---------------|
| VAT filing | Submit our own VAT | ✅ Live now |
| Corp Tax | File our own CT600 | Roadmap |
| Companies House | Our annual accounts | Roadmap |
| Payroll | Our PAYE (if employees) | Roadmap |
| Banking | Our Wise/Mercury account | Roadmap |
| Invoicing | Bill our customers | Via Stripe |
| Product catalog | Our bundles/subscriptions | Roadmap |

**Principle**: If we wouldn't trust it for our own business, we don't ship it to customers.

### UK Business Compliance APIs

| Filing | Authority | API | Frequency |
|--------|-----------|-----|-----------|
| VAT Return | HMRC | MTD VAT API | Quarterly |
| Corporation Tax | HMRC | MTD CT API | Annual |
| Annual Accounts | Companies House | Accounts API | Annual |
| Confirmation Statement | Companies House | Filing API | Annual |
| PAYE/Payroll | HMRC | RTI API | Monthly |
| P11D Benefits | HMRC | PAYE API | Annual |
| PSA | HMRC | PAYE API | Annual |

### The Marketplace Vision

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DIY Business Marketplace                                │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Compliance  │  │  Commerce   │  │  Banking    │  │  Operations │        │
│  │             │  │             │  │             │  │             │        │
│  │ VAT Returns │  │ Product Cat │  │ Accounts    │  │ CRM         │        │
│  │ Corp Tax    │  │ Storefront  │  │ Payments    │  │ Inventory   │        │
│  │ Payroll     │  │ Invoicing   │  │ Reconcile   │  │ Scheduling  │        │
│  │ Co House    │  │ Checkout    │  │ Expenses    │  │ Projects    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│         │                │                │                │               │
│         └────────────────┴────────────────┴────────────────┘               │
│                                   │                                        │
│                                   ▼                                        │
│                    ┌──────────────────────────────┐                        │
│                    │     Unified Dashboard        │                        │
│                    │                              │                        │
│                    │  "How's my business doing?"  │                        │
│                    │                              │                        │
│                    │  Revenue: £X  Costs: £Y      │                        │
│                    │  Tax due: £Z  Next filing: N │                        │
│                    │  Runway: M months            │                        │
│                    └──────────────────────────────┘                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### AWS Marketplace Parallel

Just as AWS Marketplace lets you compose infrastructure:

```
AWS Marketplace                      DIY Business Marketplace
─────────────────────────────────────────────────────────────
EC2 + RDS + S3                       Compliance + Banking + Commerce
Pay per use                          Pay per use
One AWS bill                         One DIY bill
Integrated IAM                       Integrated identity
```

### Build vs Partner vs Integrate

| Capability | Strategy | Rationale |
|------------|----------|-----------|
| VAT/Tax filing | **Build** | Core competency |
| Companies House | **Build** | Same patterns as HMRC |
| Banking read | **Partner** (Wise/Mercury/Open Banking) | Regulated, APIs exist |
| Payments in | **Partner** (Stripe) | Best in class |
| E-commerce | **Integrate** (Shopify/WooCommerce) | Not core |
| CRM | **Integrate** (HubSpot/Pipedrive) | Not core |
| Inventory | **Partner or Build** | Depends on demand |

### Revenue Model Evolution

```
Phase 1 (NOW)        Phase 2              Phase 3              Phase 4-5
Per-filing           Subscription         Compliance Suite     Platform/Marketplace
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ VAT: £X/qtr  │     │ VAT: £Y/mo   │     │ All filings: │     │ Platform:    │
│ (pay per use)│ ──▶ │ (unlimited   │ ──▶ │ £Z/month     │ ──▶ │ % of GMV     │
│              │     │  submissions)│     │              │     │ + partner    │
│ Guest/Test   │     │              │     │ + banking    │     │   revenue    │
│ bundles      │     │ Predictable  │     │ + invoicing  │     │   share      │
└──────────────┘     │ MRR          │     │              │     │              │
                     └──────────────┘     │ Higher value │     │ App Store    │
                                          │ stickier     │     │ model        │
                                          └──────────────┘     └──────────────┘
```

---

## Related Documents

- `PLAN_AWS_ACCOUNTS.md` - Multi-account structure for cost isolation
- `PLAN_BACKUP_STRATEGY.md` - Data protection for financial records
- `PLAN_SIMULATOR.md` - Demo/onboarding experience
- (Future) `PLAN_BILLING.md` - Stripe integration
- (Future) `PLAN_COMPANIES_HOUSE.md` - Companies House API integration
- (Future) `PLAN_CORP_TAX.md` - MTD for Corporation Tax

---

*Document created: January 2026*
