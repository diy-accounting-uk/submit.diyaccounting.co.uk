<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# DIY Accounting Spreadsheets - Repository & Site Plan

**Version**: 1.1 | **Date**: February 2026 | **Status**: Phase 1 In Progress

---

## 1. Vision

`spreadsheets.diyaccounting.co.uk` is the product site for DIY Accounting's Excel bookkeeping spreadsheets. It replaces the legacy `www.diyaccounting.co.uk` as the primary way customers browse, select, and download spreadsheet packages.

The site follows the gateway site's minimal design philosophy: static HTML/CSS, no build toolchain, accessible, fast-loading. It adds just enough interactivity (product selection, PayPal donate, download) to serve its purpose.

### What This Site Does

1. **Browse** the product catalogue (Basic Sole Trader, Self Employed, Company Accounts, Taxi Driver, Payslips)
2. **Select** a product and accounting period (year-end date)
3. **Donate** optionally via PayPal before downloading
4. **Download** the zip package containing Excel workbooks and user guides
5. **Read** a knowledge base of 120 accounting articles (migrated from the old www site)

### What This Site Does Not Do

- No user accounts or authentication
- No shopping cart or payment processing (donations are voluntary)
- No server-side logic (all static, with downloads served from a catalogue container or S3)
- No build step for the site itself (plain HTML/CSS like the gateway)

---

## 2. Repository Structure

### Phase 1: Within the Submit Repository (Current)

Phase 1 lives entirely inside the existing `submit.diyaccounting.co.uk` repository, following the same pattern as GatewayStack:

```
submit.diyaccounting.co.uk/              # Existing repository
+-- .github/
|   +-- workflows/
|   |   +-- deploy-spreadsheets.yml      # Deploy spreadsheets site to S3/CloudFront
|   |   +-- deploy.yml                   # Existing submit deployment
|   |   +-- deploy-gateway.yml           # Existing gateway deployment
|   |   +-- deploy-root.yml             # Root DNS (includes spreadsheets records)
|   |   +-- ...
+-- infra/
|   +-- main/java/.../stacks/
|       +-- SpreadsheetsStack.java       # S3 + CloudFront (modelled on GatewayStack)
|       +-- RootDnsStack.java            # Route53 aliases (includes spreadsheets)
|       +-- GatewayStack.java            # Existing
|       +-- ...
+-- cdk-spreadsheets/
|   +-- cdk.json                         # CDK context for spreadsheets stack
+-- scripts/
|   +-- generate-knowledge-base-toml.cjs # Generates knowledge-base.toml from old site articles
+-- web/
|   +-- spreadsheets.diyaccounting.co.uk/
|   |   +-- public/
|   |       +-- index.html               # Homepage: product catalogue with screenshots
|   |       +-- download.html            # Period selection + donate/download
|   |       +-- donate.html              # PayPal donation interstitial
|   |       +-- knowledge-base.html      # Article index (search + browse)
|   |       +-- knowledge-base.toml      # Article metadata and content (120 articles)
|   |       +-- spreadsheets.css         # Stylesheet (teal palette from old site)
|   |       +-- favicon.ico              # Favicon from old site
|   |       +-- favicon.svg              # Modern SVG favicon (spreadsheet grid icon)
|   |       +-- images/
|   |       |   +-- spreadsheets/        # 22 product screenshots
|   |       +-- articles/                # 120 markdown article files
|   |       +-- lib/
|   |           +-- toml-parser.js       # TOML parser for knowledge base
|   |           +-- knowledge-base-page.js # Knowledge base page logic
|   |           +-- kb-search.js         # Knowledge base search
|   +-- www.diyaccounting.co.uk/
|   |   +-- public/                      # Gateway site (with env-aware links to spreadsheets)
|   +-- public/                          # Existing submit site content
+-- ...existing submit directories...
```

### Phase 2: Separate Repository

When Phase 2 creates the standalone `spreadsheets.diyaccounting.co.uk` repository, the structure expands to include package syncing, catalogue automation, and its own deployment scripts:

```
spreadsheets.diyaccounting.co.uk/        # New repository
+-- .github/
|   +-- workflows/
|   |   +-- deploy.yml                   # Deploy static site to S3/CloudFront
|   |   +-- synthetic-test.yml           # Basic smoke tests
|   +-- actions/
|       +-- get-names/action.yml         # Copied from submit (simplified)
+-- infra/
|   +-- main/java/.../stacks/
|       +-- SpreadsheetsStack.java       # S3 + CloudFront (migrated from submit repo)
+-- cdk-spreadsheets/
|   +-- cdk.json                         # CDK context (certificateArn, hostedZoneId, etc.)
+-- web/
|   +-- public/
|       +-- index.html                   # Homepage: product catalogue with screenshots
|       +-- download.html                # Period selection + donate/download
|       +-- donate.html                  # PayPal donation interstitial
|       +-- knowledge-base.html          # Article index (search + browse)
|       +-- knowledge-base.toml          # Article metadata and content
|       +-- spreadsheets.css             # Stylesheet (teal palette)
|       +-- images/
|       |   +-- spreadsheets/            # Product screenshots
|       +-- articles/                    # 120 markdown article files
|       +-- lib/                         # JS for knowledge base
|       +-- catalogue.json               # Product metadata (generated from diy-accounting)
|       +-- favicon.ico, favicon.svg, etc.
|       +-- robots.txt
|       +-- sitemap.xml
|       +-- .well-known/security.txt
+-- scripts/
|   +-- generate-catalogue.sh            # Build catalogue.json from diy-accounting packages
|   +-- generate-knowledge-base-toml.cjs # Build knowledge-base.toml from old site articles
|   +-- sync-packages-to-s3.sh           # Sync zip packages from diy-accounting to S3
|   +-- aws-assume-spreadsheets-role.sh
+-- pom.xml                              # CDK build (minimal, single module)
+-- package.json                          # npm scripts for deploy, test
+-- .env.ci
+-- .env.prod
```

---

## 3. Design

### Design Principles

- **Gateway-like simplicity**: Same minimal aesthetic as `diyaccounting.co.uk` gateway
- **Old-site branding**: Teal colour palette (`#2d9c9c` primary, `#183e3e` dark, `#29c0c0` hover) and gridded background from the original `www.diyaccounting.co.uk`
- **No framework**: Plain HTML, CSS, minimal vanilla JS (inline in HTML)
- **Accessible**: WCAG 2.1 AA, skip links, focus states, semantic HTML
- **Mobile-first**: 600px responsive breakpoint (same as gateway)

### Stylesheet: `spreadsheets.css`

Based on `gateway.css`, extended with the teal brand palette (670 lines):

- Design tokens: `#2d9c9c` primary, `#247d7d` dark, `#29c0c0` light, Arial sans-serif, 800px max-width
- Gridded background: CSS linear-gradient grid lines at 11px intervals (replicating old site's `bg.png`)
- Top navigation bar: Products, Knowledge Base, Donate (with `nav-current` highlighting)
- Product card styles: white cards, 8px radius, subtle shadow, feature checklists
- Feature list checkmarks: green tick `\2713` before each feature
- Download/donate button styles: outlined brand-colour buttons
- Lightbox for product screenshots (inline `<script>`, no library)
- Knowledge base styles (inline in `knowledge-base.html`)

### Familiar Elements From Old Site

These elements bridge the gap for existing customers:

1. **Teal colour scheme** - the original `#2d9c9c` teal from `www.diyaccounting.co.uk`
2. **Gridded background** - CSS grid pattern replicating the old site's 11px repeating `bg.png` tile
3. **Product grid comparison image** (`diyaccounting-spreadsheets-product-grid.png`) - feature comparison table
4. **Product screenshots** - 22 Excel spreadsheet screenshots (profit & loss, VAT returns, payslips, etc.)
5. **PayPal Donate button** - same hosted button ID `XTEQ73HM52QQW`, same PayPal Donate SDK flow
6. **"Download without donating" link** - the existing skip-donation path
7. **Product descriptions** - the ACMA-designed accounting language that customers expect
8. **MPL 2.0 license notice** - on download page, with link to GitHub source
9. **Favicon** - original ICO from old site plus modern SVG (spreadsheet grid icon in teal)

### Page Designs

#### `index.html` - Product Catalogue

- **Top nav**: Products (current), Knowledge Base, Donate
- **Header**: "DIY Accounting Spreadsheets" h1, subtitle "Excel bookkeeping and accounting software for UK small businesses"
- **Intro section**: White card with overview text
- **Product grid image**: Feature comparison table (clickable, lightbox)
- **Product cards**: One card per product with name, description, feature checklist, screenshot, download link
- **Gallery section**: Additional screenshots
- **Footer**: Links to privacy/terms/accessibility on submit site, copyright

#### `download.html` - Period Selection & Download

- **Top nav**: Products, Knowledge Base, Donate
- Product/period/format dropdowns (populated from inline JavaScript data)
- "Download" button → `donate.html` with params
- "Download without donating" direct link to zip
- License notice (MPL 2.0)

#### `donate.html` - PayPal Donation

- **Top nav**: Products, Knowledge Base, Donate (current)
- Thank you message, PayPal Donate SDK button
- "Skip and download" fallback link
- Minimal page, focused on the donation action

#### `knowledge-base.html` - Article Knowledge Base

- **Top nav**: Products, Knowledge Base (current), Donate
- Full-text search across 120 articles
- Collapsible article list grouped alphabetically
- Articles loaded from `knowledge-base.toml` and rendered client-side
- Individual articles stored as markdown in `articles/` directory

---

## 4. Product Catalogue

### Source: `../diy-accounting`

The `diy-accounting` repository builds zip packages. The `build.sh` script generates zips from year-based directories and produces `catalogue.csv` with package metadata. Packages are served via Docker nginx at `/zips/`.

### Public Products (shown on site)

| Product | Internal Name | Year-end Pattern | Formats |
|---------|--------------|-----------------|---------|
| Basic Sole Trader | BasicSoleTrader | Apr (tax year) | Excel 2003, 2007 |
| Self Employed | SelfEmployed | Apr (tax year) | Excel 2003, 2007 |
| Company Accounts | Company | Any month (company year-end) | Excel 2003, 2007 |
| Taxi Driver (Cabsmart) | TaxiDriver | Apr (tax year) | Excel 2003, 2007 |
| Payslips (5 employees) | Payslip05 | Apr (tax year) | Excel 2003, 2007 |
| Payslips (10 employees) | Payslip10 | Apr (tax year) | Excel 2003, 2007 |

### Filtered Products (not shown on public site)

- Employee Expenses, Invoice Generator, SE Extra, Business Insurance

### Current Implementation (Phase 1)

Product and period data is currently managed as inline JavaScript in `download.html`. There is no separate `catalogue.json` file yet. Catalogue automation (generating from `diy-accounting` package data) is planned for Phase 2.

### Download URLs

Downloads are served from the diy-accounting Docker container (`ghcr.io/antonycc/diy-accounting:main`) at `/zips/{filename}`. In Phase 1, the download links point out to the existing diy-accounting Docker container or GitHub releases. In Phase 2, zips are synced to S3 for direct CloudFront delivery from the spreadsheets site's own infrastructure.

---

## 5. PayPal Donation Flow

Adapted from `www.diyaccounting.co.uk/donatepaypal.html`:

1. User selects product and period on `download.html`
2. Clicks "Download" → navigates to `donate.html?product=X&period=Y`
3. `donate.html` renders PayPal Donate SDK button:
   ```html
   <script src="https://www.paypalobjects.com/donate/sdk/donate-sdk.js"></script>
   <script>
     PayPal.Donation.Button({
       env: 'production',
       hosted_button_id: 'XTEQ73HM52QQW',
       onComplete: function() {
         window.location = '/zips/' + filename;
       }
     }).render('#paypal-donate-button');
   </script>
   ```
4. On donation completion: redirect to zip download
5. "Download without donating" link always visible, links directly to zip

---

## 6. Infrastructure (CDK)

### SpreadsheetsStack

Modelled on `GatewayStack.java` -- minimal static site hosting:

| Resource | Configuration |
|----------|--------------|
| S3 bucket | `{env}-spreadsheets-origin`, BLOCK_ALL, S3_MANAGED, DESTROY |
| OAC | S3OriginAccessControl, SIGV4_ALWAYS |
| CloudFront | S3 origin, HTTPS redirect, security headers, `defaultRootObject: index.html` |
| ACM certificate | Referenced by ARN (must be in us-east-1 for CloudFront) |
| BucketDeployment | From `web/spreadsheets.diyaccounting.co.uk/public/` with invalidation paths |
| Access logging | CloudWatch Logs delivery (distribution → log group → JSON format) |
| CSP | `default-src 'self'; script-src 'self' https://www.paypalobjects.com; ...` (PayPal SDK) |

Invalidation paths: `/index.html`, `/download.html`, `/donate.html`, `/knowledge-base.html`, `/knowledge-base.toml`, `/spreadsheets.css`, `/favicon.svg`, `/favicon.ico`

### Phase 1: Deployed Within Submit's AWS Account (Current)

SpreadsheetsStack deploys alongside GatewayStack in the existing submit-prod AWS account (887764105431):

- **CDK app**: `cdk-spreadsheets/cdk.json` in the submit repo, using the same CDK patterns and build toolchain
- **Entry point**: `SpreadsheetsEnvironment.java` (mirrors `GatewayEnvironment.java`)
- **Region**: us-east-1 (CloudFront requirement)
- **Workflow**: `deploy-spreadsheets.yml` follows the same pattern as `deploy-gateway.yml`
- **ACM certificate**: `arn:aws:acm:us-east-1:887764105431:certificate/95653acb-d279-4e87-911a-9dad45f34732`
- **DNS**: Route53 alias records in root account zone (managed by `RootDnsStack` via `deploy-root.yml`)
- **Deployment role**: Reuses `submit-deployment-role` in the submit-prod account
- **Compliance**: Pa11y and axe-core configs updated to include `{env}-spreadsheets.diyaccounting.co.uk` URLs
- **No new AWS account** -- everything runs in the same account as submit and gateway

### Phase 2: Own AWS Account & Self-Hosting

When Phase 2 creates the standalone repository, infrastructure moves to its own AWS account:

- **New AWS account** under the organization in Workloads OU:
  - Account name: `spreadsheets`
  - Email: `aws-spreadsheets@diyaccounting.co.uk`
  - Resources: S3, CloudFront, Route53 hosted zone, ACM cert
  - No Lambda, DynamoDB, API Gateway, or Cognito

- **DNS (Route53 zone delegation)**:
  - Root account Route53 zone gets NS delegation: `spreadsheets.diyaccounting.co.uk` -> spreadsheets account hosted zone
  - Spreadsheets account creates own Route53 hosted zone ($0.50/month)
  - Spreadsheets account creates own ACM wildcard cert (free, self-validated in own zone)
  - Fully self-managing: no dependency on root account for DNS records

- **CDK bootstrap**: OIDC provider, deployment role, CDK toolkit stack -- all in the new account
- **SpreadsheetsStack migrated**: Same Java class, different `cdk.json` context pointing to the new account's resources

---

## 7. Content Migration (Articles / Knowledge Base)

The old `www.diyaccounting.co.uk` has 120+ articles covering accounting topics. These were served as HTML rendered from markdown via a CMS (mdcms) in the old architecture.

### Migration Strategy

**Completed in Phase 1.** 120 articles have been migrated as markdown files in `articles/` and indexed via `knowledge-base.toml`, browsable on `knowledge-base.html` with full-text search.

The migration was done using `scripts/generate-knowledge-base-toml.cjs`, which processes the old site's article content into a structured TOML index. Individual article markdown files are stored in `articles/` and loaded client-side by `lib/knowledge-base-page.js`.

### Article Format

Markdown files in `articles/`:
```
articles/
+-- accounting-and-basis-periods-self-employed-business.md
+-- accounting-for-profit-with-marginal-costing.md
+-- accounting-for-v-a-t-with-making-tax-digital.md
+-- ... (120 files total)
```

The `knowledge-base.toml` file contains metadata for all articles (title, slug, summary). The `knowledge-base.html` page provides search and browsable access using three client-side JS modules in `lib/`.

### Submit Site Cutdown

Once the spreadsheets site is live:

- `submit.diyaccounting.co.uk/spreadsheets.html` becomes a brief overview with a prominent link: "Visit spreadsheets.diyaccounting.co.uk for the full product range and downloads"
- `submit.diyaccounting.co.uk/diy-accounting-spreadsheets.html` similarly cut down
- Product screenshots and detailed descriptions move to the spreadsheets site
- Submit retains a minimal "Spreadsheets" nav link pointing to the external site

---

## 8. Phased Delivery

### Phase 1: Design & Technology Proof (in Submit Repo)

Everything needed to see the design working and get the technology right. The spreadsheets site is deployed as a new stack within the existing `submit.diyaccounting.co.uk` repository, following the same pattern as GatewayStack.

| Step | Description | Status |
|------|-------------|--------|
| 1.1 | Create `SpreadsheetsStack.java` in submit's `infra/` (copy GatewayStack, adapt) | Done |
| 1.2 | Create `cdk-spreadsheets/cdk.json` in submit repo | Done |
| 1.3 | Create `web/spreadsheets.diyaccounting.co.uk/public/` content directory | Done |
| 1.4 | Build `index.html` -- product catalogue page with screenshots and lightbox | Done |
| 1.5 | Build `spreadsheets.css` (teal palette from old site, gridded background) | Done |
| 1.6 | Copy product screenshots to `images/spreadsheets/` (22 images) | Done |
| 1.7 | Build `download.html` -- product/period/format selection page | Done |
| 1.8 | Build `donate.html` -- PayPal donation interstitial | Done |
| 1.9 | Build `knowledge-base.html` -- 120-article knowledge base with search | Done |
| 1.10 | Build `deploy-spreadsheets.yml` workflow (modelled on `deploy-gateway.yml`) | Done |
| 1.11 | Add spreadsheets to `RootDnsStack` and `deploy-root.yml` | Done |
| 1.12 | Add spreadsheets to compliance scan configs (pa11y, axe) | Done |
| 1.13 | Add environment-aware links from gateway to spreadsheets and submit | Done |
| 1.14 | Create ACM certificate and DNS validation records | Done |
| 1.15 | Deploy to CI within submit's account | In progress |
| 1.16 | Deploy to prod, set up DNS record in root account zone | Pending |

**Downloads**: In Phase 1, download links point out to the existing diy-accounting Docker container endpoint or GitHub releases. No zip packages are hosted on the spreadsheets site itself.

**What Phase 1 proves**: The static site design works, the CloudFront/S3 hosting pattern is sound, the PayPal donation flow functions, the product catalogue is navigable, and the knowledge base provides article access. All without creating a new AWS account or repository.

### Phase 2: Own Repository, Account & Package Hosting

When it is worth the overhead of a separate repository -- probably when bringing the downloadable packages over (syncing zips to S3, catalogue automation). This phase creates the standalone `spreadsheets.diyaccounting.co.uk` repository with its own AWS account and self-hosted infrastructure.

| Step | Description |
|------|-------------|
| 2.1 | Create repository `spreadsheets.diyaccounting.co.uk` |
| 2.2 | Migrate SpreadsheetsStack, web content, and workflow from submit repo |
| 2.3 | Create spreadsheets AWS account in Workloads OU |
| 2.4 | Bootstrap CDK, OIDC provider, deployment role in new account |
| 2.5 | Create ACM cert for `spreadsheets.diyaccounting.co.uk` in new account |
| 2.6 | Create Route53 hosted zone in spreadsheets account |
| 2.7 | `deploy-root.yml` adds NS delegation from root zone to spreadsheets zone |
| 2.8 | Deploy SpreadsheetsStack to spreadsheets account |
| 2.9 | Build `scripts/generate-catalogue.sh` to auto-generate `catalogue.json` from diy-accounting packages |
| 2.10 | Build `scripts/sync-packages-to-s3.sh` to sync zip packages to S3 |
| 2.11 | Sync zip packages to S3 for direct CloudFront download |
| 2.12 | Update download links to point to self-hosted S3/CloudFront zips |
| 2.13 | Remove SpreadsheetsStack and spreadsheets content from submit repo |

### Phase 3: Polish & SEO

| Step | Description |
|------|-------------|
| 3.1 | Set up redirects from old www URLs via gateway CloudFront Function |
| 3.2 | Cut down submit spreadsheet pages to link to the spreadsheets site |
| 3.3 | Add robots.txt and sitemap.xml |
| 3.4 | SEO redirect mapping from old www.diyaccounting.co.uk URLs |

---

## 9. Differences From Submit Repository (Phase 2 Onwards)

When Phase 2 creates the standalone repository, the spreadsheets repo is a drastically cut-down version of submit:

| Aspect | Submit | Spreadsheets |
|--------|--------|-------------|
| CDK stacks | 12+ (Auth, API, Edge, HmrcStack, etc.) | 1 (SpreadsheetsStack) |
| Lambda functions | 20+ | 0 |
| DynamoDB tables | 5+ | 0 |
| API Gateway | Yes | No |
| Cognito | Yes | No |
| Docker images | Yes (Lambda containers) | No |
| Java modules | 3 (infra, app, web) | 1 (infra only) |
| npm packages | 50+ | Minimal (CDK CLI, dotenv) |
| Test tiers | 4 (unit, system, browser, behaviour) | 1 (smoke tests only) |
| JavaScript | Complex SPA-like app | Minimal vanilla JS + knowledge base |
| CSS | 2,112 lines (submit.css) | ~670 lines (spreadsheets.css) |
| Workflows | 6+ | 2 (deploy + smoke test) |
| Environment stacks | Observability, Data, Backup, Identity, Simulator | None (single stack) |

---

## 10. Open Items

| Item | Status | Notes |
|------|--------|-------|
| Download source in Phase 1 | TBD | GitHub releases, Docker container endpoint, or pre-synced S3? |
| Catalogue automation | Phase 2 | Generate `catalogue.json` from `diy-accounting` build output (`catalogue.csv` / `packages.txt`) |
| SEO redirect mapping | Phase 3 | Map old www.diyaccounting.co.uk URLs to new spreadsheets site paths |
| Ireland products | Deferred | IE Accounts (2007-2009) available but likely not worth featuring |
| Payslip 20 variant | TBD | Only 05 and 10 in packages.txt; check if 20-employee version exists |
| Product images from old site | Partial | 22 screenshots copied; old site has 2700+ images in `/assets/` |
| Google Analytics | TBD | Whether to add analytics (UA-1035014-1 from old site, or new GA4 property) |
| robots.txt / sitemap.xml | Phase 3 | Not yet created |
| security.txt | Phase 3 | Not yet created |

---

*Updated: February 2026*
