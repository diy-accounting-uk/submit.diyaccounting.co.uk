<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Report: Old Site Product Catalogue and Content Distribution

**Date**: February 2026
**Purpose**: Document how the current `diy-accounting` and `www.diyaccounting.co.uk` repositories work together to build a product catalogue and distribute content, for reference when migrating to `spreadsheets.diyaccounting.co.uk`.

---

## 1. Architecture Overview

The old site is a **three-repository, Docker-based system** that builds a fully static website from dynamic content:

```
diy-accounting/                     www.diyaccounting.co.uk/
(product source)                    (website distribution)

Year folders with Excel files       docker-compose.yml
  ↓ build.sh                          ↓ pulls 3 Docker images
Zip packages + catalogue.csv        Local cluster on ports 8080/8090/8100
  ↓ Docker image                       ↓ create-mirror-from-cluster.sh
ghcr.io/antonycc/diy-accounting     Static mirror/ directory
                                       ↓ aws s3 sync
                                    S3 + CloudFront
                                       ↓
                                    https://www.diyaccounting.co.uk
```

A third component, **mdcms** (markdown CMS), provides article content and product metadata via a REST API, also packaged as a Docker image.

---

## 2. The `diy-accounting` Repository (Product Source)

### Directory Structure

Product source files are organized by accounting year:

```
diy-accounting/
+-- GB Accounts 2019-20/
|   +-- Basic Sole Trader/
|   |   +-- 2020-04-05 (Apr20)/
|   |       +-- Excel 2003/     → .xls workbooks + PDF guides
|   |       +-- Excel 2007/     → .xlsx workbooks + PDF guides
|   +-- Company/
|   |   +-- 2020-2021 (Any)/    → generates monthly variants
|   +-- Self Employed/
|   +-- Payslip/
|   +-- Taxi Driver/
|   +-- ...
+-- GB Accounts 2024-25/
+-- GB Accounts 2025-26/
+-- IE Accounts 2007-2009/       → Ireland (legacy, not actively maintained)
+-- build.sh                     → master build script
+-- build-zip.sh                 → per-product zip builder
+-- build/                       → output: ~181 zip files + metadata
+-- docs/                        → PDF/DOCX user guides
```

### Build Process (`build.sh`)

1. Clears previous `build/` output
2. Iterates through year directories (2019-20 onwards)
3. Calls `build-zip.sh` for each product directory
4. Generates `catalogue.csv` with columns: `Package, Platform, Status, Legacy`
5. Creates `index.html` (links to all zips) and `index.txt` (filename list)

### Zip Generation (`build-zip.sh`)

- Takes a product directory as input
- Skips directories containing `DO NOT USE - WORK IN PROGRESS.txt`
- **Company "Any" handling**: When a product directory is named `(Any)`, generates monthly variants for the current year (Apr through Feb)
- Zips contents excluding `.git` and `.sh` files
- Output naming: `GB Accounts {Product} {Date} ({MonthYear}) {Format}.zip`

### Examples of Generated Zips

```
GB Accounts Basic Sole Trader 2025-04-05 (Apr25) Excel 2007.zip
GB Accounts Company 2025-03-31 (Mar25) Excel 2007.zip
GB Accounts Self Employed 2025-04-05 (Apr25) Excel 2003.zip
GB Accounts Payslip 05 Employees 2025-04-05 (Apr25) Excel 2007.zip
GB Accounts Taxi Driver 2025-04-05 (Apr25) Excel 2007.zip
```

### `catalogue.csv` Format

```csv
Package,Platform,Status,Legacy
GB Accounts Basic Sole Trader 2025-04-05 (Apr25),Excel 2007,released,unused
GB Accounts Company 2025-03-31 (Mar25),Excel 2007,released,unused
GB Accounts Self Employed 2025-04-05 (Apr25),Excel 2003,released,unused
```

### Docker Image

Published as `ghcr.io/antonycc/diy-accounting:main`. Contains:
- All zip packages in `/zips/`
- `catalogue.csv` in `/zips/`
- Served by nginx on port 8100

---

## 3. The mdcms Component (Content API)

A markdown-based CMS that provides product definitions, articles, and features as a JSON REST API. Published as `ghcr.io/antonycc/diy-accounting-mdcms:main`.

### Content Types

| Type | Count | URL Pattern | Purpose |
|------|-------|-------------|---------|
| Products | ~20 | `/content/products/{Name}` | Product definitions with features |
| Articles | ~123 | `/content/articles/{Name}` | Accounting topic articles |
| Features | ~29 | `/content/features/{Name}` | Product feature descriptions |
| Product-for-period | Many | `/content/product-for-period/{Product}/{Period}` | Period-specific product metadata |
| Feature-for-product | Many | `/content/feature-for-product/{Feature}/{Product}` | Feature-product relationship data |
| Page config | 1 | `/content/page` | Global site configuration |
| Page with articles | 1 | `/content/page-with-articles` | Landing page with article index |

### Product Data Model

Each product JSON includes:
- Title, description, short title, keywords
- `featureNames` array (controls which features display for this product)
- `catalogueName` (maps to zip filename prefix, e.g. "Basic Sole Trader")
- Asset references (image paths like `/assets/{filename}`)
- Schema.org structured data hints

### Content Index

`/content/index.txt` lists all markdown source files:
```
BasicSoleTraderProduct.md
SelfEmployedProduct.md
CompanyAccountsProduct.md
ProfitAndLossFeature.md
VatReturnsFeature.md
AccountingForVatArticle.md
...
```

File naming convention determines content type:
- `*Product.md` → product
- `*Feature.md` → feature
- `*Article.md` → article

---

## 4. The `www.diyaccounting.co.uk` Repository (Website Distribution)

### Docker Compose Services

```yaml
services:
  catalogue:    # Port 8100 — nginx serving diy-accounting zips
  content:      # Port 8090 — mdcms serving content JSON API
  app:          # Port 8080 — Spring Boot webapp + http-proxy
```

### Static Site Generation (`create-mirror-from-cluster.sh`)

This is the critical script that turns the running Docker cluster into a static website:

1. **Fetch content index** from `http://localhost:8090/content/index.txt`
2. **Fetch catalogue index** from `http://localhost:8100/zips/catalogue.csv`
3. **Parse content index** to build URL list:
   - Articles → `content/articles/{kebab-case-name}`
   - Features → `content/features/{kebab-case-name}`
   - Products → `content/products/{kebab-case-name}`
4. **Parse catalogue** to build period URLs:
   - Extract product names and period dates from zip filenames
   - Build `content/product-for-period/{Product}/{Period}` URLs
5. **Build feature-product cross-references**:
   - For each product, get its features from the product JSON
   - Build `content/feature-for-product/{Feature}/{Product}` URLs
6. **Fetch all URLs** via `wget` and save as static JSON files in `mirror/content/`
7. **Post-process** to rewrite `http://localhost:8080/assets/` → `/assets/` in all JSON responses
8. **Validate**: Check for HTTP errors, exit with code 1 if any 404s found

### Mirror Directory Structure

```
mirror/
+-- zips/                              # 238 zip files (all product distributions)
|   +-- catalogue.csv                  # Package metadata
+-- content/
|   +-- page                           # JSON: global site config (PayPal, branding, nav)
|   +-- page-with-articles             # JSON: homepage config with article index
|   +-- products/                      # JSON: ~20 product definitions
|   |   +-- Basic-Sole-Trader
|   |   +-- Self-Employed
|   |   +-- Company
|   |   +-- Taxi-Driver
|   |   +-- Payslip-05
|   |   +-- Payslip-10
|   |   +-- Business-Insurance
|   |   +-- [dashed-name variants for legacy URL support]
|   +-- articles/                      # JSON: ~123 articles
|   +-- features/                      # JSON: ~29 feature descriptions
|   +-- product-for-period/            # JSON: period-specific product data
|   |   +-- Basic-Sole-Trader/
|   |   |   +-- 2025-04-05-(Apr25)
|   |   |   +-- 2024-04-05-(Apr24)
|   |   +-- Company/
|   |       +-- 2025-03-31-(Mar25)
|   |       +-- 2025-04-30-(Apr25)
|   |       +-- ... (one per month for "Any" products)
|   +-- feature-for-product/           # JSON: feature-product relationships
|       +-- Profit-And-Loss/
|       |   +-- Basic-Sole-Trader
|       +-- Vat-Returns/
|           +-- Self-Employed
|           +-- Company
+-- assets/                            # 2700+ images (screenshots, diagrams)
+-- styles/                            # CSS files
|   +-- label/
|       +-- style.css                  # Main stylesheet
|       +-- bg.png                     # 11x11px gridded background tile
|       +-- logo.png                   # DIY/Accounting teal logo
+-- home.html                          # Static HTML pages
+-- products.html
+-- product.html
+-- feature.html
+-- get.html                           # Download/checkout flow
+-- download.html
+-- donatepaypal.html
+-- sitemap.xml
```

---

## 5. How Products Are Linked Together

### Product → Feature Linking

Each product defines a `featureNames` array that references feature entities:

```
BasicSoleTraderProduct
  featureNames: [ProfitAndLoss, SalesSpreadsheet, PurchaseSpreadsheet,
                 SelfAssessment, SelfEmployedTax]

SelfEmployedProduct
  featureNames: [SESalesSpreadsheet, SalesInvoice, SEPurchaseSpreadsheet,
                 SECashandBank, SEVATReturn, SEProfitandLoss,
                 SelfAssessment, Payslips, SETaxReturn]

CompanyAccountsProduct
  featureNames: [CompanySalesSpreadsheet, CompanyPurchaseSpreadsheet,
                 CashandBank, TaxandAssets, VatReturns, CompanyFinalAccounts,
                 YearEndAccounts, CompanyProfitandLoss, SalesInvoice, Payslips]
```

Features are shared across products (e.g. Payslips appears in both SelfEmployed and CompanyAccounts), creating a cross-reference web.

### Product → Period Linking

Periods are derived from the zip filenames in `catalogue.csv`:
- **Tax-year products** (BasicSoleTrader, SelfEmployed, TaxiDriver, Payslip): One period per year (Apr)
- **Company products**: Monthly periods for current year (generated from "Any" directory)

The `product-for-period` API endpoint provides period-specific metadata for the download flow.

### Navigation Flow

```
Homepage (home.html)
  ├─→ Featured products carousel → Product detail
  └─→ "View all products" → Products listing (products.html)
        ├─→ Sidebar: all products listed → Product detail (product.html?product=X)
        |     ├─→ Feature sections → Feature detail (feature.html?feature=F&product=X)
        |     |     └─→ "Available in" → Other products with same feature
        |     └─→ "Download" → Download flow (get.html?product=X)
        |           ├─→ Step 1: Select product (if not pre-selected)
        |           ├─→ Step 2: Select period (get.html?product=X&period=Y)
        |           └─→ PayPal donate → Download zip
        └─→ Comparison matrix (image map) → Products/features
```

### Client-Side Template System

The old site uses **Handlebars.js** for client-side rendering:

1. HTML pages contain Handlebars templates (elements with IDs ending in `Jst`)
2. JavaScript fetches JSON from `/content/` endpoints via `$.getJSON()`
3. `gbWebApp.applyTemplateForElementsThatEndWith('Jst', context)` renders templates
4. Handlebars helpers (`{{#when}}`, `{{#if}}`) enable conditional logic

This means the HTML pages are static shells that load data dynamically — the same pattern the new spreadsheets site follows, but with inline JS and TOML instead of jQuery and a REST API.

### URL Patterns

| Page | URL Pattern | Query Parameters |
|------|-------------|-----------------|
| Homepage | `home.html` | — |
| Product listing | `products.html` | — |
| Product detail | `product.html` | `?product=ProductName` |
| Feature detail | `feature.html` | `?feature=FeatureName` or `?feature=F&product=P` |
| Download step 1 | `get.html` | `?product=ProductName` (optional) |
| Download step 2 | `get.html` | `?product=P&period=YearEnding` |
| PayPal donate | `donatepaypal.html` | `?product=...&period=...&paypalHostedButtonType=...` |

---

## 6. Product Naming Conventions

Products have multiple name variants for legacy URL compatibility:

| Full Name | CMS Name | Catalogue Name | URL Slug |
|-----------|----------|---------------|----------|
| Basic Sole Trader | BasicSoleTraderProduct | BasicSoleTrader | Basic-Sole-Trader |
| Self Employed | SelfEmployedProduct | SelfEmployed | Self-Employed |
| Company Accounts | CompanyAccountsProduct | Company | Company |
| Taxi Driver (Cabsmart) | TaxiDriverProduct | TaxiDriver | Taxi-Driver |
| Payslips (5 employees) | PayslipProduct | Payslip05 | Payslip-05 |
| Payslips (10 employees) | PayslipProduct | Payslip10 | Payslip-10 |
| Business Insurance | BusinessInsuranceProduct | — | Business-Insurance |

The CMS supports multiple name variants per product for backward compatibility with historical URLs.

---

## 7. Content Distribution Pipeline (End-to-End)

### Step 1: Build products (`diy-accounting`)

```bash
cd diy-accounting && ./build.sh
```
- Processes year directories (2019-20 through 2025-26)
- Generates ~181 zip packages in `build/`
- Generates `catalogue.csv`, `index.html`, `index.txt`
- Publishes Docker image: `ghcr.io/antonycc/diy-accounting:main`

### Step 2: Build website (`www.diyaccounting.co.uk`)

```bash
cd www.diyaccounting.co.uk

# Pull Docker images and extract content
docker compose -f docker-compose-mount-content.yml up

# Start local cluster
docker compose up -d

# Generate static mirror
./create-mirror-from-cluster.sh
```

The mount-content step extracts:
- Zips from diy-accounting image → `mirror/zips/`
- Assets from mdcms image → `mirror/assets/`
- Webapp files from app image → `mirror/`

The cluster-crawl step generates:
- All JSON content files → `mirror/content/`
- Post-processes URLs from localhost to relative paths

### Step 3: Deploy to AWS

```bash
# Stage
aws s3 sync ./mirror s3://www.stage.diyaccounting.co.uk/

# Live
aws s3 sync ./mirror s3://www.live.diyaccounting.co.uk/
```

CloudFront distribution serves the S3 bucket with SSL.

### Step 4: CloudFront invalidation

Cache invalidation for updated files after S3 sync.

---

## 8. Key Technical Details

### Image Assets

- **2700+ images** in `mirror/assets/` (screenshots, diagrams, article illustrations)
- Referenced in JSON content as `/assets/{filename}`
- Original source: mdcms Docker image
- Most are product screenshots and article illustrations
- Some are reused across multiple products/features

### PayPal Integration

- **Hosted button ID**: `XTEQ73HM52QQW`
- **Donate SDK**: `https://www.paypalobjects.com/donate/sdk/donate-sdk.js`
- Configuration stored in `content/page` JSON (global site config)
- Download flow: product selection → period selection → PayPal donate → zip download

### Schema.org Structured Data

The old site uses extensive Schema.org microdata for SEO:
- `@type: Product` for each product
- `@type: Offer` for pricing/availability
- `@type: AggregateRating` for reviews
- `@type: Brand` for DIY Accounting

### Legacy Infrastructure

The old site deployment used:
- **Terragrunt** configuration in `environments/stage/` and `environments/live/`
- S3 buckets for stage and live environments
- CloudFront distributions with SSL certificates
- Multi-account AWS setup (account 887764105431)

---

## 9. Implications for the New Spreadsheets Site

### What's Already Migrated

| Old Site Component | New Site Equivalent | Status |
|---|---|---|
| Product listing (products.html) | index.html (product cards) | Done |
| Product screenshots | images/spreadsheets/ (22 images) | Done |
| Feature comparison grid | product-grid.png + feature checklists | Done |
| PayPal donate flow | donate.html | Done |
| Download/period selection | download.html | Done |
| 120+ articles | knowledge-base.html + articles/ | Done |
| Teal colour scheme | spreadsheets.css | Done |
| Gridded background (bg.png) | CSS linear-gradient grid | Done |
| Favicon | favicon.ico + favicon.svg | Done |

### What's Not Yet Migrated

| Old Site Component | Migration Path | Phase |
|---|---|---|
| Zip packages (238 files) | Sync to S3 or link to Docker/GitHub | Phase 2 |
| catalogue.json automation | Generate from catalogue.csv | Phase 2 |
| Product detail pages | Currently embedded in index.html cards | Future |
| Feature detail pages | Not planned (simplified into checklists) | Not planned |
| 2700+ asset images | Only 22 screenshots migrated | Selective |
| Schema.org structured data | Not yet added | Phase 3 |
| sitemap.xml | Not yet created | Phase 3 |
| SEO redirects from old URLs | Gateway CloudFront Function | Phase 3 |
| Image map comparison matrix | Static PNG with lightbox | Done (simplified) |
| jQuery/Handlebars templating | Replaced with vanilla JS + TOML | Done |

### Key Architectural Simplifications

1. **No REST API**: The old site fetched JSON from a running cluster. The new site uses inline JS data and TOML files.
2. **No Docker dependency**: The old site required three Docker services to build. The new site is plain static files.
3. **No Handlebars**: Client-side templating replaced with vanilla JS modules for the knowledge base and inline HTML for products.
4. **No feature-product cross-reference matrix**: The old site had a complex web of feature→product→period relationships. The new site uses simple product cards with feature checklists.
5. **Markdown articles**: Articles stored as markdown files in `articles/` instead of JSON from a CMS API, indexed via `knowledge-base.toml`.

---

*Generated: February 2026*
