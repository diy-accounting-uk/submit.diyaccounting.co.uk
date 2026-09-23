<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Repository capabilities

Built 2026-09-23 from commit `5b8b79e9`. Look here before you add a script, workflow, Lambda, check, sync, report, alarm, page or skill: the repository probably does it already.

How to use this file:

1. Scan the Index below. Each line has an id, a name and a "use when" phrase.
2. Or search: `grep -n -i '<word>' REPORT_CAPABILITIES.md`, or look the word up in the Keywords section at the end.
3. Open the entry. **Run** gives the command. **Entry** gives the code to extend.
4. Use or extend the capability you find. Add a new mechanism only when no entry fits, and add its entry in the same commit.

Each entry has the same fields: Use when, Does, Run, Entry, Files, Keywords, Related. The `.claude/skills/capabilities/SKILL.md` skill says how to keep this file current.

## Index

<!-- generated:index -->
- **[Customer-facing site and accounts](#customer-facing-site-and-accounts-site)**
  - [Authentication and authorization](#authentication-and-authorization-site)
    - [SITE-01](#site-01-sign-customers-in-via-cognito) Sign customers in via Cognito: use when a page must start, complete or refresh a Cognito hosted-UI login.
    - [SITE-02](#site-02-verify-jwts-at-the-api-gateway) Verify JWTs at the API gateway: use when an API route needs the caller's Cognito access token checked, or their sub decoded.
  - [Account and engagement APIs](#account-and-engagement-apis-site)
    - [SITE-03](#site-03-capture-feedback-interest) Capture feedback interest: use when a signed-in user clicks the homepage join button to register feedback interest.
    - [SITE-04](#site-04-track-visits-via-session-beacon) Track visits via session beacon: use when the site needs to record a visit or logout as an activity event, filtered for crawlers.
    - [SITE-05](#site-05-submit-support-tickets) Submit support tickets: use when a visitor needs to open a support ticket as a GitHub issue from the site.
  - [Server and API plumbing](#server-and-api-plumbing-site)
    - [SITE-06](#site-06-adapt-lambda-handlers-to-express-routes) Adapt Lambda handlers to Express routes: use when a Lambda-style apiEndpoint handler needs to run behind the local Express dev server.
    - [SITE-07](#site-07-format-http-responses-and-errors) Format HTTP responses and errors: use when a Lambda function needs a standard JSON response, or Express needs a JSON error page.
    - [SITE-08](#site-08-bootstrap-the-app-server) Bootstrap the app server: use when running the site locally against a full Express server instead of deployed Lambdas.
    - [SITE-09](#site-09-track-and-poll-async-api-requests) Track and poll async API requests: use when an API call takes too long for a single Lambda response and the client must poll for a result.
  - [Site pages and content](#site-pages-and-content-site)
    - [SITE-10](#site-10-serve-general-site-pages) Serve general site pages: use when adding or changing a static informational page, or the FAQ/help search behind it.
    - [SITE-11](#site-11-promote-sibling-products-and-partners) Promote sibling products and partners: use when adding or changing a cross-sell page for a sibling product or an affiliate.
    - [SITE-12](#site-12-map-the-site-structure) Map the site structure: use when adding or moving a page and its place in the header, nav or footer needs checking.
  - [Frontend infrastructure](#frontend-infrastructure-site)
    - [SITE-13](#site-13-warm-backend-routes-via-prefetch-scripts) Warm backend routes via prefetch scripts: use when a page must pre-warm a Lambda or route before its own script needs the real response.
    - [SITE-14](#site-14-render-page-chrome-and-widgets) Render page chrome and widgets: use when a page needs the shared header, nav and footer, or a small shared UI widget.
    - [SITE-15](#site-15-show-and-persist-cookie-consent) Show and persist cookie consent: use when GA4 analytics consent must be gated behind a visible cookie-consent banner.
    - [SITE-16](#site-16-configure-the-frontend-via-toml-and-env-libraries) Configure the frontend via TOML and env libraries: use when a page needs runtime config, feature flags, or a cached GET with ETag revalidation.
    - [SITE-17](#site-17-trace-and-secure-client-requests) Trace and secure client requests: use when a fetch needs a W3C traceparent and request id stamped on it, or a random value for OAuth state.
    - [SITE-18](#site-18-bootstrap-the-frontend-module-bundle) Bootstrap the frontend module bundle: use when a new utils, services or widgets module needs wiring into the site's single entry point.
    - [SITE-19](#site-19-generate-qr-codes) Generate QR codes: use when a page must render a scannable QR code, such as a pass-generation page.
  - [Business documentation](#business-documentation-site)
    - [SITE-20](#site-20-document-business-governance-and-positioning) Document business governance and positioning: use when a question needs the licensing terms, trademark rules, product strategy or marketing rules.
    - [SITE-21](#site-21-log-growth-experiments) Log growth experiments: use when a growth experiment needs recording so the operator dashboard can annotate its metrics.
- **[HMRC filing](#hmrc-filing-hmrc)**
  - [VAT filing](#vat-filing-hmrc)
    - [HMRC-01](#hmrc-01-submit-a-vat-return) Submit a VAT return: use when a customer must file a 9-box or legacy VAT return with HMRC for a period.
    - [HMRC-02](#hmrc-02-retrieve-a-submitted-vat-return) Retrieve a submitted VAT return: use when a customer needs to view a VAT return already filed for a period key.
    - [HMRC-03](#hmrc-03-retrieve-vat-obligations) Retrieve VAT obligations: use when a session needs open or fulfilled VAT filing periods for a date range.
    - [HMRC-04](#hmrc-04-retrieve-vat-liabilities) Retrieve VAT liabilities: use when a customer needs the VAT amount owed or refunded over a date range.
    - [HMRC-05](#hmrc-05-retrieve-vat-payments) Retrieve VAT payments: use when a customer needs payments HMRC has recorded against the VAT account.
    - [HMRC-06](#hmrc-06-retrieve-vat-penalties) Retrieve VAT penalties: use when a customer needs penalties HMRC has applied to the VAT account.
    - [HMRC-07](#hmrc-07-build-and-validate-9-box-vat-return-data) Build and validate 9-box VAT return data: use when a VAT return body must be built, validated or calculated from box entries.
    - [HMRC-08](#hmrc-08-parse-vat-returns-from-a-bulk-csv-file) Parse VAT returns from a bulk CSV file: use when a CSV of VAT return figures from a spreadsheet package must become 9-box objects.
  - [ITSA business and obligations](#itsa-business-and-obligations-hmrc)
    - [HMRC-09](#hmrc-09-retrieve-itsa-business-details) Retrieve ITSA business details: use when a taxpayer's self-employment or UK property businesses must be listed by NINO.
    - [HMRC-10](#hmrc-10-retrieve-itsa-obligations) Retrieve ITSA obligations: use when quarterly, annual or final-declaration ITSA obligations must be listed for a business.
    - [HMRC-11](#hmrc-11-retrieve-itsa-status) Retrieve ITSA status: use when a taxpayer's Making Tax Digital enrolment for a tax year must be checked.
  - [ITSA periodic and annual submissions](#itsa-periodic-and-annual-submissions-hmrc)
    - [HMRC-12](#hmrc-12-submit-and-manage-self-employment-periodic-updates) Submit and manage self-employment periodic updates: use when quarterly or cumulative self-employment income and expense updates must be filed or read.
    - [HMRC-13](#hmrc-13-submit-and-manage-the-self-employment-annual-summary) Submit and manage the self-employment annual summary: use when the year-end self-employment allowances and adjustments summary must be read or filed.
    - [HMRC-14](#hmrc-14-submit-and-manage-uk-property-periodic-updates) Submit and manage UK property periodic updates: use when quarterly or cumulative UK property rental income and expense updates must be filed or read.
    - [HMRC-15](#hmrc-15-submit-and-manage-the-uk-property-annual-summary) Submit and manage the UK property annual summary: use when the year-end UK property annual summary must be read or filed.
  - [ITSA year-end processing](#itsa-year-end-processing-hmrc)
    - [HMRC-16](#hmrc-16-trigger-and-adjust-the-business-source-adjustable-summary) Trigger and adjust the Business Source Adjustable Summary: use when a year-end BSAS calculation must be triggered, read or adjusted for a business.
    - [HMRC-17](#hmrc-17-manage-itsa-losses-and-claims) Manage ITSA losses and claims: use when losses or relief claims must be read, submitted or deleted against HMRC.
    - [HMRC-18](#hmrc-18-manage-itsa-tax-liability-adjustments) Manage ITSA tax liability adjustments: use when a manual adjustment to a taxpayer's calculated tax liability must be read, submitted or deleted.
    - [HMRC-19](#hmrc-19-calculate-itsa-tax-liability) Calculate ITSA tax liability: use when HMRC's tax calculation for a tax year must be triggered or its result retrieved.
    - [HMRC-20](#hmrc-20-retrieve-itsa-crystallisation-obligations) Retrieve ITSA crystallisation obligations: use when the final-declaration obligation for a tax year must be checked before submission.
    - [HMRC-21](#hmrc-21-submit-the-itsa-final-declaration) Submit the ITSA final declaration: use when a taxpayer is ready to crystallise their ITSA liability for a tax year.
  - [Receipts and HMRC authentication](#receipts-and-hmrc-authentication-hmrc)
    - [HMRC-22](#hmrc-22-store-and-retrieve-hmrc-submission-receipts) Store and retrieve HMRC submission receipts: use when a customer's stored VAT or ITSA receipt must be listed or fetched.
    - [HMRC-23](#hmrc-23-exchange-an-hmrc-oauth-code-for-a-token) Exchange an HMRC OAuth code for a token: use when an OAuth authorisation code from HMRC must become an access token.
    - [HMRC-24](#hmrc-24-verify-hmrc-agent-authorisation-for-a-client) Verify HMRC agent authorisation for a client: use when a practice must check its access token carries a delegated client relationship.
  - [HMRC API plumbing](#hmrc-api-plumbing-hmrc)
    - [HMRC-25](#hmrc-25-build-hmrc-fraud-prevention-headers) Build HMRC fraud-prevention headers: use when a call to any HMRC API needs Gov-Client or Gov-Vendor fraud-prevention headers.
    - [HMRC-26](#hmrc-26-monitor-hmrc-fraud-prevention-header-compliance) Monitor HMRC fraud-prevention header compliance: use when HMRC's monthly fraud-prevention header feedback email must be checked or tracked.
    - [HMRC-27](#hmrc-27-validate-hmrc-identifiers-dates-and-amounts) Validate HMRC identifiers, dates and amounts: use when a VRN, NINO, UTR, period key, ISO date, tax year or amount must be validated.
    - [HMRC-28](#hmrc-28-format-and-match-hmrc-obligations) Format and match HMRC obligations: use when a raw HMRC obligation must be shown to a customer or matched to entered dates.
    - [HMRC-29](#hmrc-29-call-the-hmrc-api) Call the HMRC API: use when a Lambda or browser page must call an HMRC endpoint and classify the response.
    - [HMRC-30](#hmrc-30-persist-async-hmrc-api-request-state) Persist async HMRC API request state: use when a long-running HMRC API call needs its async request/poll state stored.
  - [HMRC infrastructure and test tooling](#hmrc-infrastructure-and-test-tooling-hmrc)
    - [HMRC-31](#hmrc-31-wire-hmrc-lambda-handlers-into-cdk-stacks) Wire HMRC Lambda handlers into CDK stacks: use when a new or changed HMRC Lambda needs its CDK function, props and log group declared.
    - [HMRC-32](#hmrc-32-register-and-verify-hmrc-developer-hub-application-config) Register and verify HMRC Developer Hub application config: use when the sandbox or production HMRC Developer Hub app's API subscriptions must be checked.
    - [HMRC-33](#hmrc-33-drive-hmrcs-sandbox-authorisation-flow-for-test-scripts) Drive HMRC's sandbox authorisation flow for test scripts: use when a test script needs a user-restricted HMRC sandbox authorisation code with no headless route.
    - [HMRC-34](#hmrc-34-file-a-full-itsa-tax-year-in-sandbox) File a full ITSA tax year in sandbox: use when a whole ITSA tax year must be filed end to end against HMRC's sandbox for one test user.
    - [HMRC-35](#hmrc-35-spike-test-the-itsa-sandbox-oauth-and-business-details-flow) Spike-test the ITSA sandbox OAuth and business-details flow: use when the sandbox registration, OAuth redirect and fraud-prevention headers need a standalone Business Details proof.
    - [HMRC-36](#hmrc-36-provide-itsa-behaviour-test-step-helpers) Provide ITSA behaviour-test step helpers: use when an ITSA behaviour-test spec needs a shared init, fill, submit or verify step.
    - [HMRC-37](#hmrc-37-plan-the-hmrc-mtd-vat-and-itsa-rollout) Plan the HMRC MTD VAT and ITSA rollout: use when the path to HMRC production approval or the ITSA phase 2 build needs a plan.
- **[Companies House filing](#companies-house-filing-ch)**
  - [OAuth and identity](#oauth-and-identity-ch)
    - [CH-01](#ch-01-exchange-a-companies-house-oauth-token) Exchange a Companies House OAuth token: use when a filing journey has an authorization code and needs an access token for the session.
    - [CH-02](#ch-02-verify-the-companies-house-oauth-app-configuration) Verify the Companies House OAuth app configuration: use when checking that a deployed environment's Companies House OAuth app and API key still authorise.
  - [Company search and profile](#company-search-and-profile-ch)
    - [CH-03](#ch-03-search-the-companies-house-register) Search the Companies House register: use when a user types a company name or number and needs matching results to pick from.
    - [CH-04](#ch-04-fetch-a-company-profile) Fetch a company profile: use when a filing journey has a company number and needs the company's registered details.
  - [Registered office and email](#registered-office-and-email-ch)
    - [CH-05](#ch-05-file-a-change-of-registered-office-address) File a change of registered office address: use when a company needs to change its registered office address on the public register.
    - [CH-06](#ch-06-file-a-change-of-registered-email-address) File a change of registered email address: use when a company needs to register or change its registered email address with Companies House.
  - [Micro-entity accounts filing](#micro-entity-accounts-filing-ch)
    - [CH-07](#ch-07-preview-micro-entity-accounts-before-filing) Preview micro-entity accounts before filing: use when a user needs to see the iXBRL accounts document before it reaches the XML Gateway.
    - [CH-08](#ch-08-file-micro-entity-accounts-to-companies-house) File micro-entity accounts to Companies House: use when a small company must submit its FRS 105 micro-entity accounts to the XML Gateway.
  - [Filing infrastructure](#filing-infrastructure-ch)
    - [CH-09](#ch-09-query-and-submit-document-transactions) Query and submit document transactions: use when a filing (office address, email address, accounts) needs a Companies House transaction created, read or updated.
    - [CH-10](#ch-10-fetch-http-with-a-timeout) Fetch HTTP with a timeout: use when any outbound Companies House API call needs a bounded wait instead of hanging.
    - [CH-11](#ch-11-parse-xml-safely) Parse XML safely: use when code must build or read XML Gateway GovTalk envelopes without XML injection risk.
  - [Test, validation and provisioning](#test-validation-and-provisioning-ch)
    - [CH-12](#ch-12-generate-synthetic-test-companies) Generate synthetic test companies: use when a test needs a real-shaped Companies House test company without a live entity.
    - [CH-13](#ch-13-map-the-frc-ixbrl-taxonomy-and-validate-accounts) Map the FRC iXBRL taxonomy and validate accounts: use when the FRS 102/105 taxonomy fixture needs refreshing, or a generated iXBRL document needs checking against Companies House's validator.
    - [CH-14](#ch-14-provision-the-companies-house-cdk-stack) Provision the Companies House CDK stack: use when adding, renaming or rewiring a Companies House Lambda function or its API Gateway route.
- **[Billing and entitlements](#billing-and-entitlements-bill)**
  - [Bundle grants and entitlements](#bundle-grants-and-entitlements-bill)
    - [BILL-01](#bill-01-grant-a-bundle-to-a-user) Grant a bundle to a user: use when a user must receive a catalogue bundle, by API or by an ops shortcut script.
    - [BILL-02](#bill-02-list-a-users-bundles-and-token-balance) List a user's bundles and token balance: use when a page or check must show a user's allocated and available bundles with remaining tokens.
    - [BILL-03](#bill-03-delete-a-bundle) Delete a bundle: use when one bundle must be removed from a user's allocation.
    - [BILL-04](#bill-04-enforce-bundle-entitlement-on-a-request) Enforce bundle entitlement on a request: use when an endpoint must reject a caller who lacks the bundle an activity requires.
    - [BILL-05](#bill-05-reconcile-bundle-capacity-counters) Reconcile bundle capacity counters: use when a capacity counter may have drifted from the true count of active allocations.
  - [Passes](#passes-bill)
    - [BILL-06](#bill-06-generate-a-token-charged-pass) Generate a token-charged pass: use when a signed-in user pays tokens to generate a digital or physical pass.
    - [BILL-07](#bill-07-admin-issue-a-pass) Admin-issue a pass: use when an operator or admin must create a pass of any catalogue type with no token charge.
    - [BILL-08](#bill-08-check-a-passs-validity) Check a pass's validity: use when a pass code must be checked before login, without consuming a use.
    - [BILL-09](#bill-09-list-a-users-issued-passes) List a user's issued passes: use when a page must show up to 50 passes a caller has issued.
    - [BILL-10](#bill-10-redeem-a-pass) Redeem a pass: use when a code must be redeemed to grant its bundle, including a pass link with a ?pass= parameter.
    - [BILL-11](#bill-11-generate-admin-passes-from-cli-or-workflow) Generate admin passes from CLI or workflow: use when an operator needs one or more passes with QR codes, or a scripted equivalent with no QR output.
  - [Practice clients and HMRC authorisation](#practice-clients-and-hmrc-authorisation-bill)
    - [BILL-12](#bill-12-invite-a-client-to-authorise-agent-access) Invite a client to authorise agent access: use when a practice must ask a client to authorise HMRC agent access for MTD-VAT or MTD-IT.
    - [BILL-13](#bill-13-check-a-clients-authorisation-status) Check a client's authorisation status: use when a page or job must know whether a client's HMRC agent authorisation is pending or granted.
    - [BILL-14](#bill-14-cancel-a-pending-client-authorisation-invite) Cancel a pending client authorisation invite: use when a practice's HMRC invitation to a client must be withdrawn before it is accepted.
    - [BILL-15](#bill-15-move-a-book-to-a-client) Move a book to a client: use when a practice must transfer one of its own diya-gl books to a named client's book set.
    - [BILL-16](#bill-16-manage-practice-clients) Manage practice clients: use when a practice's client roster must be created, read, archived or listed.
  - [diya-gl ledger books](#diya-gl-ledger-books-bill)
    - [BILL-17](#bill-17-upload-a-diya-gl-book) Upload a diya-gl book: use when a ledger package must be validated and stored as a versioned diya-gl book.
    - [BILL-18](#bill-18-delete-a-diya-gl-book) Delete a diya-gl book: use when a ledger book must be removed from S3 after authorisation and ownership checks.
    - [BILL-19](#bill-19-list-a-users-diya-gl-books) List a user's diya-gl books: use when a caller's own ledger books must be listed from S3.
    - [BILL-20](#bill-20-fetch-a-versioned-diya-gl-book) Fetch a versioned diya-gl book: use when a specific stored version of a ledger book must be retrieved.
    - [BILL-21](#bill-21-sweep-lapsed-diya-gl-books) Sweep lapsed diya-gl books: use when resident-tier books belonging to subscribers whose bundle lapsed past the grace period must be removed.
    - [BILL-22](#bill-22-check-diya-gl-retention-entitlement) Check diya-gl retention entitlement: use when code must decide whether a caller's books get resident or sandbox retention.
    - [BILL-23](#bill-23-store-diya-gl-books-in-s3) Store diya-gl books in S3: use when a diya-gl endpoint needs book or version keys, metadata read/write, listing, tagging or cross-client moves.
  - [Stripe billing](#stripe-billing-bill)
    - [BILL-24](#bill-24-create-a-stripe-checkout-session) Create a Stripe checkout session: use when a caller must pay for a subscription bundle by Stripe Checkout.
    - [BILL-25](#bill-25-retrieve-a-stripe-checkout-sessions-status) Retrieve a Stripe checkout session's status: use when a page after checkout must know whether a session id succeeded.
    - [BILL-26](#bill-26-open-the-stripe-customer-billing-portal) Open the Stripe customer billing portal: use when a subscriber must manage or cancel their subscription in the Stripe-hosted portal.
    - [BILL-27](#bill-27-recover-an-abandoned-checkout) Recover an abandoned checkout: use when checking whether checkout recovery is implemented; the endpoint returns 501 today.
    - [BILL-28](#bill-28-process-stripe-webhook-events) Process Stripe webhook events: use when Stripe delivers a checkout, invoice, subscription, refund or dispute event to grant, sync or flag a subscription.
    - [BILL-29](#bill-29-assert-the-paypal-donate-button-configuration) Assert the PayPal donate button configuration: use when the PayPal classic hosted donate button's live configuration must be checked, not a webhook.
    - [BILL-30](#bill-30-sync-the-stripe-productprice-catalogue) Sync the Stripe product/price catalogue: use when a bundle's price changes, or a new on-subscription bundle needs a Stripe product.
    - [BILL-31](#bill-31-configure-stripe-account-policies) Configure Stripe account policies: use when Stripe account-level payout and dispute policies must be set for a customer-first stance.
    - [BILL-32](#bill-32-provision-stripe-secrets) Provision Stripe secrets: use when Stripe API keys or webhook signing secrets must be created or updated in Secrets Manager.
  - [Tokens and catalogue](#tokens-and-catalogue-bill)
    - [BILL-33](#bill-33-enforce-and-consume-activity-tokens) Enforce and consume activity tokens: use when a token-costed activity must check balance before an HMRC call and charge only on success.
    - [BILL-34](#bill-34-prefetch-and-retry-a-cognito-token-refresh) Prefetch and retry a Cognito token refresh: use when a 401 must trigger an automatic Cognito token refresh and retry, or when the exchange must start early.
    - [BILL-35](#bill-35-load-and-query-the-productactivity-catalogue) Load and query the product/activity catalogue: use when code needs which bundles an activity requires, which activities a bundle unlocks, or Stripe prices for a bundle.
  - [CDK infrastructure](#cdk-infrastructure-bill)
    - [BILL-36](#bill-36-cdk-account-stack) CDK: account stack: use when tracing or changing the infrastructure behind bundle, pass, practice-client and capacity-reconcile endpoints.
    - [BILL-37](#bill-37-cdk-billing-app-stack) CDK: billing app stack: use when tracing or changing the per-deployment billing checkout, session, portal or recover Lambdas.
    - [BILL-38](#bill-38-cdk-billing-webhook-stack) CDK: billing webhook stack: use when tracing or changing the always-on webhook endpoint that must survive application stack teardown.
    - [BILL-39](#bill-39-cdk-diya-gl-stack) CDK: diya-gl stack: use when tracing or changing the infrastructure behind diya-gl endpoints or the lapse-sweep schedule.
  - [Migrations and shared utilities](#migrations-and-shared-utilities-bill)
    - [BILL-40](#bill-40-migrate-the-hashed-sub-salt) Migrate the hashed-sub salt: use when the salt used to hash user subs must be rotated to a new passphrase.
    - [BILL-41](#bill-41-backfill-the-stripe-test-mode-qualifier) Backfill the Stripe test-mode qualifier: use when bundles created by a Stripe subscription need their own stripeTestMode qualifier separated from sandbox.
    - [BILL-42](#bill-42-parse-iso-8601-durations-for-expiry) Parse ISO 8601 durations for expiry: use when a catalogue-declared duration must become an expiry date for a bundle grant, pass or token reset.
    - [BILL-43](#bill-43-build-the-frontend-test-bundle) Build the frontend test bundle: use when unit or browser tests need the frontend bundled before they run.
    - [BILL-44](#bill-44-document-the-price-update-project) Document the price-update project: use when researching why the pricing or bundle catalogue was changed the way it was.
- **[Operations and CI](#operations-and-ci-ops)**
  - [Deploy pipeline](#deploy-pipeline-ops)
    - [OPS-01](#ops-01-cancel-superseded-push-triggered-deploys) Cancel superseded push-triggered deploys: use when a workflow_dispatch redeploy might race a push-triggered deploy.yml run on the same commit.
    - [OPS-02](#ops-02-derive-environment-and-deployment-names-from-a-branch) Derive environment and deployment names from a branch: use when a workflow step needs the same environment, deployment name and domain URLs another step already computed.
    - [OPS-03](#ops-03-look-up-aws-resources-by-domain-convention) Look up AWS resources by domain convention: use when a workflow step needs a deployment's Cognito pool, API Gateway or CloudFront IDs without a stored ID.
    - [OPS-04](#ops-04-update-route53cloudfront-origins-for-a-domain) Update Route53/CloudFront origins for a domain: use when an apex or environment domain must move to a different origin, or fall back to the holding page.
    - [OPS-05](#ops-05-promote-a-ci-deployment-to-the-ci-apex) Promote a CI deployment to the CI apex: use when a ci deployment has passed its probes and the ci apex must point at it.
    - [OPS-06](#ops-06-run-the-full-deployment-pipeline) Run the full deployment pipeline: use when a change on main must reach production, or a named deployment must be redeployed by hand.
    - [OPS-07](#ops-07-lean-deploy-app-code-to-lambda-and-s3) Lean-deploy app code to Lambda and S3: use when a fast iteration deploy of app or web code is needed, without a full CDK deploy.
    - [OPS-08](#ops-08-deploy-a-single-cdk-stack-on-demand) Deploy a single CDK stack on demand: use when only one CDK stack needs deploying, without running the full pipeline.
    - [OPS-09](#ops-09-deploy-environment-stacks-and-populate-secrets) Deploy environment stacks and populate secrets: use when environment-level infrastructure or its secrets must be redeployed independently of an app deploy.
    - [OPS-131](#ops-131-serve-cloudfront-custom-error-pages) Serve CloudFront custom error pages: use when CloudFront returns an HTTP error and the visitor needs the right static error page instead of a raw status.
    - [OPS-132](#ops-132-enable-dynamodb-pitr-on-deploy) Enable DynamoDB PITR on deploy: use when a DynamoDB table needs point-in-time recovery turned on idempotently as part of a stack deploy.
    - [OPS-133](#ops-133-serve-the-root-domain-holding-page) Serve the root-domain holding page: use when a visitor lands on the bare diyaccounting.co.uk root domain and needs redirecting to the submit subdomain.
    - [OPS-134](#ops-134-monitor-github-actions-ci-from-the-cli) Monitor GitHub Actions CI from the CLI: use when main and every open PR's head branch need polling until CI is green, with each red and each PR's readiness reported once.
    - [OPS-135](#ops-135-look-up-domains-and-cloudfront-distributions) Look up domains and CloudFront distributions: use when the live ci-/prod- DNS records under submit need listing, or a CloudFront distribution ID needs finding for an origin.
    - [OPS-136](#ops-136-retrieve-cloudformation-stack-outputs) Retrieve CloudFormation stack outputs: use when a script or test needs a named stack's output values, such as a URL, table name or ARN.
    - [OPS-137](#ops-137-export-cognito-users-for-reporting-or-backup) Export Cognito users for reporting or backup: use when every user in a Cognito user pool needs exporting with their attributes to CSV or JSON.
  - [ci slot pool and sweep](#ci-slot-pool-and-sweep-ops)
    - [OPS-10](#ops-10-claim-release-and-track-a-ci-deployment-slot) Claim, release and track a CI deployment slot: use when a branch needs a registered ci host, or a slot must be freed or checked before a sweep.
    - [OPS-11](#ops-11-queue-ci-branch-deploys-in-creation-order) Queue CI branch deploys in creation order: use when a CI branch deploy must not race another deploy, destroy or video-capture run for the same slot.
    - [OPS-12](#ops-12-clean-up-expired-test-users) Clean up expired test users: use when a lane's test user has outlived its credential expiry window, or needs manual cleanup.
    - [OPS-13](#ops-13-auto-destroy-stale-ci-deployments) Auto-destroy stale CI deployments: use when a stale or finished ci deployment must be torn down, or a live one's self-destruct timer needs resetting.
    - [OPS-14](#ops-14-destroy-a-named-prod-deployment-on-demand) Destroy a named prod deployment on demand: use when a superseded prod deployment's stacks must be torn down by hand.
    - [OPS-15](#ops-15-serialize-lane-test-user-rotation-jobs) Serialize lane test-user rotation jobs: use when a new workflow job rotates a lane's durable test user, to avoid two jobs racing it.
    - [OPS-16](#ops-16-run-dynamodb-data-migrations) Run DynamoDB data migrations: use when a stored data shape must change across a deploy boundary, or a migration needs a manual re-run.
  - [Alarms, triage and probes](#alarms-triage-and-probes-ops)
    - [OPS-17](#ops-17-redact-and-gate-unattended-agent-output-before-publishing) Redact and gate unattended-agent output before publishing: use when an unattended agent's output must reach a public GitHub surface safely.
    - [OPS-18](#ops-18-run-alarm-and-support-triage) Run alarm and support triage: use when an [ALARM] or support issue needs an automated first-pass triage.
    - [OPS-19](#ops-19-kill-switch-to-stop-unattended-agent-workflows) Kill-switch to stop unattended agent workflows: use when an unattended agent path must be stopped immediately across an environment.
    - [OPS-20](#ops-20-enforce-daily-run-budgets-for-agent-paths) Enforce daily run budgets for agent paths: use when an unattended agent workflow needs a daily cap on how many results it posts.
    - [OPS-21](#ops-21-auto-close-resolved-alarm-issues) Auto-close resolved alarm issues: use when checking whether an open alarm issue should already have closed, or to run the close check by hand.
    - [OPS-22](#ops-22-verify-a-triage-draft-pr-stays-in-scope) Verify a triage draft-PR stays in scope: use when a triage agent's draft PR must be checked before it leaves draft state.
    - [OPS-23](#ops-23-raise-an-issue-from-a-probe-test-failure) Raise an issue from a probe-test failure: use when a prod probe-test failure needs an issue raised automatically for triage.
    - [OPS-24](#ops-24-gate-probes-on-the-main-apex-deploy) Gate probes on the main apex deploy: use when a probe test or other check must wait until the main apex deploy has finished moving.
    - [OPS-25](#ops-25-record-dora-and-probe-metrics) Record DORA and probe metrics: use when a deploy or probe workflow step must record a metrics row for the dashboard.
    - [OPS-26](#ops-26-run-the-automated-test-suite-in-ci) Run the automated test suite in CI: use when checking which test tiers run on every push and pull request.
    - [OPS-27](#ops-27-run-probe-tests-against-deployed-environments) Run probe tests against deployed environments: use when a deployed environment's behaviour must be confirmed after a deploy, outside the full deploy.yml pipeline.
    - [OPS-70](#ops-70-forward-operational-activity-events-to-telegram) Forward operational activity events to Telegram: use when an EventBridge activity event needs routing to the right Telegram group as formatted text.
    - [OPS-71](#ops-71-create-github-issues-from-cloudwatch-alarms) Create GitHub issues from CloudWatch alarms: use when a CloudWatch alarm fires and needs a tracked GitHub issue instead of a one-off notification.
    - [OPS-72](#ops-72-forward-bedrock-budget-alerts) Forward Bedrock budget alerts: use when an AWS Bedrock cost or token-limit alert must reach the operations channel.
    - [OPS-73](#ops-73-detect-404-scan-rate-attacks) Detect 404 scan-rate attacks: use when a single client IP is probing many paths and the 404 rate against one distribution needs watching.
    - [OPS-74](#ops-74-detect-waf-blocked-scan-attacks) Detect WAF-blocked scan attacks: use when requests the SensitivePathScan WAF rule blocked need to become an ops alert, or a block needs a false-positive check.
    - [OPS-75](#ops-75-run-nightly-security-lake-analysis) Run nightly Security Lake analysis: use when the previous day's AWS Security Lake data needs an automated threat and pattern review.
    - [OPS-76](#ops-76-gather-alarm-evidence-for-investigation) Gather alarm evidence for investigation: use when an operator investigating a firing alarm needs the right log groups, X-Ray filters and console links fast.
    - [OPS-77](#ops-77-silence-alarms-during-deployment-teardown) Silence alarms during deployment teardown: use when a deployment is being torn down and its alarms must not fire GitHub issues or Telegram alerts.
    - [OPS-78](#ops-78-verify-an-alarm-issues-claimed-transition) Verify an alarm issue's claimed transition: use when triage must confirm an alarm issue's stated window and transition really happened before acting on it.
    - [OPS-79](#ops-79-track-an-alarm-familys-daily-remedy-budget) Track an alarm family's daily remedy budget: use when auto-remediation for an alarm family must stop once its daily budget of remedies is spent.
    - [OPS-80](#ops-80-build-aws-console-deep-links-for-operators) Build AWS console deep links for operators: use when an alert or report needs a direct link into CloudWatch logs, alarms or X-Ray instead of a description.
  - [Security and compliance](#security-and-compliance-ops)
    - [OPS-28](#ops-28-enforce-commit-identity-allowlist) Enforce commit identity allowlist: use when a PR's commit authorship must be checked against the allowed identity list.
    - [OPS-29](#ops-29-verify-commit-signatures-on-pull-requests) Verify commit signatures on pull requests: use when a PR's commits must all carry a verified signature before merge.
    - [OPS-30](#ops-30-run-codeql-security-scanning) Run CodeQL security scanning: use when checking what CodeQL scans, or excluding a new non-production path from the scan.
    - [OPS-31](#ops-31-run-a-claude-security-review-on-push) Run a Claude security review on push: use when checking how pushed changes get an automated security review.
    - [OPS-32](#ops-32-detect-cloudformation-drift) Detect CloudFormation drift: use when checking whether deployed stacks have drifted from their CDK definition.
    - [OPS-33](#ops-33-enforce-workflow-to-workflow-permission-grants) Enforce workflow-to-workflow permission grants: use when a workflow calls another reusable workflow and its permission grants need checking before a run fails.
    - [OPS-34](#ops-34-validate-github-actions-workflow-files) Validate GitHub Actions workflow files: use when a workflow file's syntax or deployment-safety conventions need checking before a push.
    - [OPS-35](#ops-35-verify-third-party-console-configuration-against-declared-state) Verify third-party console configuration against declared state: use when a third-party console's live configuration must be checked against the declared infra/** state.
    - [OPS-36](#ops-36-configure-dependabot-dependency-updates) Configure Dependabot dependency updates: use when checking or changing which ecosystems Dependabot updates, or its schedule.
    - [OPS-37](#ops-37-check-https-certificate-expiry) Check HTTPS certificate expiry: use when checking whether a served domain's certificate is close to expiry.
    - [OPS-38](#ops-38-run-the-weekly-compliance-test-check) Run the weekly compliance-test check: use when a compliance commitment's status needs re-checking, or a new commitment needs adding to compliance.toml.
    - [OPS-39](#ops-39-generate-a-software-bill-of-materials) Generate a software bill of materials: use when a dependency inventory of the shipped application is needed.
  - [Data protection and privacy](#data-protection-and-privacy-ops)
    - [OPS-40](#ops-40-delete-a-customers-data-for-gdpr-erasure) Delete a customer's data for GDPR erasure: use when a customer has exercised their GDPR right to erasure.
    - [OPS-41](#ops-41-export-a-customers-gdpr-subject-access-data) Export a customer's GDPR subject-access data: use when a customer has made a GDPR subject-access request.
    - [OPS-42](#ops-42-guide-icogdpr-compliance) Guide ICO/GDPR compliance: use when checking this service's obligations against UK GDPR or ICO requirements.
    - [OPS-43](#ops-43-rotate-stored-email-address-hashes) Rotate stored email-address hashes: use when the email-hash encryption key must be rotated across all stored hashes.
    - [OPS-44](#ops-44-hash-and-rotate-the-subject-id-salt) Hash and rotate the subject-ID salt: use when the subject-ID salt needs backing up, restoring, or its resource policy reasserting.
    - [OPS-45](#ops-45-manage-aws-secrets-manager-entries-and-rotation-tags) Manage AWS Secrets Manager entries and rotation tags: use when a secret's value or rotation date needs checking, listing, backing up or restoring.
    - [OPS-46](#ops-46-query-and-persist-per-consumer-security-state-records) Query and persist per-consumer security-state records: use when a Lambda needs a short-TTL rate counter or mid-session geo record for security state.
    - [OPS-47](#ops-47-check-fraud-prevention-header-record-freshness) Check fraud-prevention header record freshness: use when checking whether this month's fraud-prevention-header compliance record has landed.
    - [OPS-48](#ops-48-verify-backup-health-daily) Verify backup health daily: use when checking whether daily backups and their cross-account copy completed.
    - [OPS-49](#ops-49-request-and-renew-the-holding-page-certificate) Request and renew the holding-page certificate: use when the holding-page domain needs a new or renewed ACM certificate.
    - [OPS-50](#ops-50-drill-and-test-pitr-database-restoration) Drill and test PITR database restoration: use when a PITR restore procedure must be drilled or tested against a real table.
  - [Video, publishing and accessibility](#video-publishing-and-accessibility-ops)
    - [OPS-51](#ops-51-publish-build-artifacts-and-documentation) Publish build artifacts and documentation: use when checking where build artifacts or generated documentation get published.
    - [OPS-52](#ops-52-auto-record-demo-videos-on-prod-deploy) Auto-record demo videos on prod deploy: use when a prod deploy changes a page and its demo video needs re-recording.
    - [OPS-53](#ops-53-verify-youtube-channel-consistency-weekly) Verify YouTube channel consistency weekly: use when checking whether the stored YouTube credentials or channel state have gone stale.
    - [OPS-88](#ops-88-orchestrate-demo-video-recording-journeys) Orchestrate demo-video recording journeys: use when a new or changed product journey needs a recorded demo video driven end to end by Playwright.
    - [OPS-89](#ops-89-overlay-pointer-and-caption-cues-on-video) Overlay pointer and caption cues on video: use when a recorded scene needs an on-screen pointer, trail, caption or timer overlay that survives page navigation.
    - [OPS-90](#ops-90-encode-captured-video-frames-and-captions) Encode captured video frames and captions: use when a recorded scene's raw frames need encoding to video and its captions need generating to match.
    - [OPS-91](#ops-91-validate-video-scene-scripts-and-timing) Validate video scene scripts and timing: use when a scene script needs schema validation, a recorded timeline needs acceptance checks, or only the affected scenes should re-record.
    - [OPS-92](#ops-92-redact-secrets-from-video-artefacts) Redact secrets from video artefacts: use when a recorded logged-in scene may have typed real credentials into captions, transcript or overlay logs.
    - [OPS-93](#ops-93-publish-demo-videos-to-youtube) Publish demo videos to YouTube: use when a recorded demo video is ready to upload to YouTube, unlisted or public, or its manifest needs syncing.
    - [OPS-94](#ops-94-play-demo-videos-on-the-public-site) Play demo videos on the public site: use when the public site needs a page listing the recorded product demos with working playback controls.
    - [OPS-95](#ops-95-generate-wcag-accessibility-compliance-rows) Generate WCAG accessibility compliance rows: use when WCAG manual and automated review results need turning into rows for the compliance dashboard.
    - [OPS-96](#ops-96-scan-pages-for-accessibility-violations) Scan pages for accessibility violations: use when a page set needs an axe-core accessibility scan or a WCAG 1.4.12 text-spacing check.
    - [OPS-97](#ops-97-compile-the-compliance-audit-report) Compile the compliance audit report: use when WCAG, fraud-header and VAT-logic test results need aggregating into one pass/fail compliance report.
  - [Agent workflows](#agent-workflows-ops)
    - [OPS-54](#ops-54-define-specialized-claude-code-sub-agent-personas) Define specialized Claude Code sub-agent personas: use when dispatching a sub-agent that needs one of these domains' conventions already loaded.
    - [OPS-55](#ops-55-configure-github-copilot-review-and-workspace-setup) Configure GitHub Copilot review and workspace setup: use when checking or changing what Copilot's review agent or coding-agent workspace knows about this repository.
    - [OPS-56](#ops-56-structure-github-issues-prs-and-funding-links) Structure GitHub issues, PRs and funding links: use when opening a support issue or PR needs the repository's standard structured template.
    - [OPS-57](#ops-57-dispatch-agentic-lib-board-backlog-and-pr-agents) Dispatch agentic-lib board, backlog and PR agents: use when the board, the NEXT.md backlog, or an issue-described change needs an agent dispatched from the shared agentic-lib library.
  - [Environment and accounts](#environment-and-accounts-ops)
    - [OPS-58](#ops-58-document-multi-account-aws-architecture) Document multi-account AWS architecture: use when checking why a resource lives in a particular AWS account, or which account a new resource belongs in.
    - [OPS-59](#ops-59-track-and-analyze-aws-spending) Track and analyze AWS spending: use when checking this repository's AWS cost-tracking approach or past spend.
    - [OPS-60](#ops-60-guide-github-repository-configuration) Guide GitHub repository configuration: use when setting up or checking a repository's branch protection, OIDC trust or webhook configuration.
    - [OPS-61](#ops-61-design-ci-branch-deploys-off-the-apex) Design CI branch deploys off the apex: use when checking the design rationale behind CI branch deploys, before changing that mechanism.
    - [OPS-62](#ops-62-report-accessibility-penetration-testing) Report accessibility penetration testing: use when checking past accessibility penetration test findings before a new test or fix.
    - [OPS-63](#ops-63-report-identity-audit-findings) Report identity audit findings: use when checking past findings on commit-identity or signing controls before changing them.
    - [OPS-64](#ops-64-runbook-information-security-operations) Runbook information-security operations: use when an information-security incident needs its runbook procedure, or all users need a cross-account logout hold.
    - [OPS-65](#ops-65-document-security-policy-and-disclosure) Document security policy and disclosure: use when someone needs to know how to report a vulnerability, or what the disclosure procedure commits to.
    - [OPS-66](#ops-66-create-an-hmrc-sandbox-test-user) Create an HMRC sandbox test user: use when a fresh HMRC MTD sandbox test user is needed for VAT or Income Tax testing.
    - [OPS-67](#ops-67-apply-google-cloud--ga4-infrastructure) Apply Google Cloud / GA4 infrastructure: use when Google Cloud or GA4 infrastructure must be planned or applied from its declared state.
    - [OPS-68](#ops-68-provision-and-assume-roles-for-test-user-provisioning) Provision and assume roles for test-user provisioning: use when a local or CI run needs a fresh Cognito test user and credentials.
    - [OPS-69](#ops-69-assume-and-clear-local-aws-deployment-credentials) Assume and clear local AWS deployment credentials: use when a local deploy or debug session needs submit-deployment-role credentials in the shell.
    - [OPS-98](#ops-98-bootstrap-the-cdk-toolkit-across-accounts) Bootstrap the CDK toolkit across accounts: use when a fresh AWS account, or every account, needs the CDK toolkit stack with cross-account trust relationships.
    - [OPS-99](#ops-99-bootstrap-the-aws-organization-structure) Bootstrap the AWS Organization structure: use when the AWS Organization's organizational units need verifying or creating after the organization itself exists.
    - [OPS-100](#ops-100-create-or-invite-aws-member-accounts) Create or invite AWS member accounts: use when a new member account must be created, invited, moved between OUs, or its status checked.
    - [OPS-101](#ops-101-set-up-github-oidc-deployment-roles) Set up GitHub OIDC deployment roles: use when a GitHub Actions deployment role and its OIDC identity provider need creating for an environment.
    - [OPS-102](#ops-102-verify-the-multi-account-aws-setup) Verify the multi-account AWS setup: use when the multi-account structure needs confirming complete: OIDC roles, backup roles and organizational units.
    - [OPS-103](#ops-103-bootstrap-a-new-aws-account-for-cdk) Bootstrap a new AWS account for CDK: use when a fresh AWS account needs its CDK bootstrap stacks, OIDC provider and deployment roles created.
  - [Shared runtime libraries](#shared-runtime-libraries-ops)
    - [OPS-81](#ops-81-mask-and-redact-sensitive-data-from-logs) Mask and redact sensitive data from logs: use when text or an object bound for a log line or shared output may carry PII or secret values.
    - [OPS-82](#ops-82-provide-a-shared-dynamodb-client) Provide a shared DynamoDB client: use when a Lambda or repository needs a DynamoDB document client instead of constructing its own AWS SDK client.
    - [OPS-83](#ops-83-emit-cloudwatch-emf-metrics) Emit CloudWatch EMF metrics: use when a Lambda needs to publish a custom CloudWatch metric without a separate PutMetricData API call.
    - [OPS-84](#ops-84-validate-required-environment-variables-at-startup) Validate required environment variables at startup: use when a Lambda should fail immediately on a missing environment variable instead of partway through a request.
    - [OPS-85](#ops-85-obtain-and-use-github-app-api-tokens) Obtain and use GitHub App API tokens: use when a script or Lambda must call the GitHub API and needs a short-lived App installation token.
    - [OPS-86](#ops-86-provide-structured-pii-redacting-logging) Provide structured PII-redacting logging: use when a Lambda or script needs structured JSON logging to CloudWatch with PII stripped before it is written.
    - [OPS-87](#ops-87-process-sqs-message-batches-in-lambda-workers) Process SQS message batches in Lambda workers: use when an SQS-triggered Lambda must handle each record's failure independently instead of failing the whole batch.
  - [Backup and disaster recovery](#backup-and-disaster-recovery-ops)
    - [OPS-104](#ops-104-set-up-cross-account-backup-iam-roles) Set up cross-account backup IAM roles: use when a backup vault and its cross-account permissions need creating so source accounts can back up into it.
    - [OPS-105](#ops-105-copy-production-data-to-backup-for-migration) Copy production data to backup for migration: use when production DynamoDB tables need copying into the backup account ahead of an account migration.
    - [OPS-106](#ops-106-replicate-secrets-across-aws-accounts) Replicate secrets across AWS accounts: use when Secrets Manager entries must be copied from one AWS account to another during a migration.
    - [OPS-107](#ops-107-list-production-secrets-manager-entries) List production Secrets Manager entries: use when an inventory of an account's Secrets Manager entries and KMS keys is needed before copying secrets.
    - [OPS-108](#ops-108-backfill-ttl-on-existing-dynamodb-records) Backfill TTL on existing DynamoDB records: use when DynamoDB items created before a table's TTL configuration need a time-to-live value set retroactively.
    - [OPS-109](#ops-109-disaster-recovery-restore-into-a-new-prod-account) Disaster-recovery restore into a new prod account: use when a full disaster-recovery drill needs a new prod AWS account restored from the backup account's vault.
    - [OPS-110](#ops-110-force-logout-all-users-during-a-security-incident) Force logout all users during a security incident: use when a security incident requires every user in an environment's Cognito pool signed out immediately.
  - [CDK infrastructure stacks](#cdk-infrastructure-stacks-ops)
    - [OPS-111](#ops-111-provision-cross-account-backup-vaults-and-plans) Provision cross-account backup vaults and plans: use when the primary account's backup plans, or the separate backup account's vault and restore roles, need synthesizing.
    - [OPS-112](#ops-112-provision-the-api-gateway-stack) Provision the API Gateway stack: use when the account's API Gateway with its Lambda integrations needs synthesizing or redeploying.
    - [OPS-113](#ops-113-provision-the-dynamodb-and-s3-data-stack) Provision the DynamoDB and S3 data stack: use when the application's DynamoDB tables and S3 buckets need synthesizing with encryption, PITR and TTL policies.
    - [OPS-114](#ops-114-provision-ecr-image-repositories) Provision ECR image repositories: use when the ECR repositories the Lambda Docker images push to need creating with lifecycle policies.
    - [OPS-115](#ops-115-provision-the-edgecloudfront-stack) Provision the Edge/CloudFront stack: use when CloudFront distributions, edge Lambdas or caching behaviours for the web app and API need synthesizing.
    - [OPS-116](#ops-116-provision-the-holding-page-stack) Provision the holding-page stack: use when the submit service's own holding page needs its own CloudFront distribution for a failover retarget.
    - [OPS-117](#ops-117-provision-the-observability-stack) Provision the Observability stack: use when an account's CloudTrail, GuardDuty, Security Hub, security SNS topic or shared dashboards need synthesizing.
    - [OPS-118](#ops-118-provision-the-observability-stack-in-us-east-1) Provision the Observability stack in us-east-1: use when a CloudWatch resource must live in us-east-1 for a global service such as CloudFront metrics or alarms.
    - [OPS-119](#ops-119-provision-the-ops-stack) Provision the Ops stack: use when the operational Lambdas, alert topic or health canary backing deployment sweeps need synthesizing.
    - [OPS-120](#ops-120-provision-the-publish-stack) Provision the Publish stack: use when the main website's S3 asset deployment and CloudFront invalidation need synthesizing.
    - [OPS-121](#ops-121-provision-the-security-baseline-stack) Provision the Security Baseline stack: use when an account needs its AWS Config recorder or its CIS AWS Foundations Benchmark subscription set up.
    - [OPS-122](#ops-122-provision-the-security-detection-stack) Provision the Security Detection stack: use when environment-level CloudWatch alarms for scan detection and data-theft detection need synthesizing.
  - [CDK shared constructs and naming](#cdk-shared-constructs-and-naming-ops)
    - [OPS-123](#ops-123-wire-cdk-application-entrypoints-per-account) Wire CDK application entrypoints per account: use when deciding which stacks synthesize for which account and environment combination.
    - [OPS-124](#ops-124-define-shared-lambda-cdk-constructs) Define shared Lambda CDK constructs: use when a new Lambda-backed stack needs the common function, alias and health-alarm wiring instead of rebuilding it.
    - [OPS-125](#ops-125-name-and-tag-cdk-resources-consistently) Name and tag CDK resources consistently: use when a stack needs an IAM-safe resource name derived from a deployment identifier, or consistent cost-allocation tags.
    - [OPS-126](#ops-126-provide-config-composition-helpers-for-cdk-code) Provide config-composition helpers for CDK code: use when Java CDK config code needs order-preserving maps or null-tolerant merges instead of double-brace hacks.
    - [OPS-127](#ops-127-upsert-route53-alias-records-via-custom-resource) Upsert Route53 alias records via custom resource: use when a Route53 alias record pointing at a CloudFront distribution needs an idempotent UPSERT that CDK's L2 constructs don't provide.
    - [OPS-128](#ops-128-generate-s3-lifecycle-rules-for-storage-tiering) Generate S3 lifecycle rules for storage tiering: use when an S3 bucket needs intelligent tiering or object expiration rules generated for its CloudFormation template.
    - [OPS-129](#ops-129-configure-lambdacdk-application-logging) Configure Lambda/CDK application logging: use when the Java CDK application's own log appenders, patterns or retention need changing, for main or test runs.
    - [OPS-130](#ops-130-track-runtime-and-dependency-lifecycle) Track runtime and dependency lifecycle: use when a Lambda or Synthetics runtime version, dependency, or certificate is approaching end-of-life and needs tracking.
- **[Analytics and finance](#analytics-and-finance-data)**
  - [Lake ingestion](#lake-ingestion-data)
    - [DATA-01](#data-01-publish-activity-events-to-the-bus) Publish activity events to the bus: use when a Lambda or route must record a business event for the analytics lake and Telegram alerts.
    - [DATA-02](#data-02-transform-activity-events-into-lake-rows) Transform activity events into lake rows: use when the activity-event Firehose stream must flatten EventBridge envelopes into lake rows.
    - [DATA-03](#data-03-transform-alarm-state-changes-into-lake-rows) Transform alarm state changes into lake rows: use when CloudWatch alarm state changes must be flattened into lake rows for the DORA/alarms views.
    - [DATA-04](#data-04-stream-dynamodb-table-changes-into-the-lake) Stream DynamoDB table changes into the lake: use when a DynamoDB table's inserts/updates/deletes must be redacted and streamed into the lake.
    - [DATA-05](#data-05-pull-ga4-daily-bigquery-aggregate-tables) Pull GA4 daily BigQuery aggregate tables: use when GA4's scheduled-query aggregate tables must land in the lake as daily NDJSON.
    - [DATA-06](#data-06-pull-ga4-reports-and-bigquery-event-export) Pull GA4 reports and BigQuery event export: use when the previous day's GA4 Data API reports or raw BigQuery event export must land in the lake.
    - [DATA-07](#data-07-pull-github-operator-effort-data) Pull GitHub operator-effort data: use when workflow runs, issue events or commits must be pulled into the lake for the operator-effort views.
    - [DATA-08](#data-08-copy-the-aws-focus-cost-export) Copy the AWS FOCUS cost export: use when the management account's FOCUS cost export must land in this account's lake for cost views.
    - [DATA-09](#data-09-reconcile-stripe-payments-into-the-lake) Reconcile Stripe payments into the lake: use when the previous day's Stripe balance transactions, charges or subscriptions must land in the lake.
  - [Lake infrastructure, quality and cost](#lake-infrastructure-quality-and-cost-data)
    - [DATA-10](#data-10-create-or-replace-athena-business-views) Create or replace Athena business views: use when a new or changed Athena view under infra/main/resources/analytics/views must deploy with the stack.
    - [DATA-11](#data-11-run-glue-data-quality-checks) Run Glue Data Quality checks: use when new lake partitions must be registered and a Glue Data Quality ruleset run must be started.
    - [DATA-12](#data-12-provision-the-analytics-lake-and-athena-workgroup) Provision the analytics lake and Athena workgroup: use when a new analytics construct needs the shared lake bucket, Glue database or Athena workgroup.
    - [DATA-13](#data-13-catalogue-cloudfront-access-logs-for-athena) Catalogue CloudFront access logs for Athena: use when CloudFront access logs must be queryable by Athena for the traffic views.
    - [DATA-14](#data-14-catalogue-compliance-findings-for-the-dashboard) Catalogue compliance findings for the dashboard: use when accessibility or fraud-header check output must be queryable for the compliance panel.
    - [DATA-15](#data-15-catalogue-workflow-probe-and-agent-run-data) Catalogue workflow, probe and agent run data: use when a new DORA, probe or agent-run view must read GitHub Actions data the dora-row action writes.
    - [DATA-16](#data-16-alert-on-cost-budget-and-anomaly-thresholds) Alert on cost budget and anomaly thresholds: use when a new environment needs a monthly cost budget alarm or, in prod, anomaly detection.
    - [DATA-17](#data-17-export-aws-billing-data-in-focus-format) Export AWS billing data in FOCUS format: use when the management account's billing export must be created or changed for downstream cost copy.
  - [Nightly publish and orchestration](#nightly-publish-and-orchestration-data)
    - [DATA-18](#data-18-publish-the-nightly-operator-dashboard-snapshot) Publish the nightly operator dashboard snapshot: use when the eight one-stop objectives must be precomputed so the dashboard route never queries Athena directly.
    - [DATA-19](#data-19-serve-the-operator-dashboard-snapshot-via-the-api) Serve the operator dashboard snapshot via the API: use when the operator dashboard page needs its snapshot data over HTTP.
    - [DATA-20](#data-20-publish-the-nightly-raw-export-for-indexing) Publish the nightly raw export for indexing: use when a dashboard figure must be readable as a plain file, for the corpus index.
    - [DATA-21](#data-21-publish-nightly-business-metrics-to-cloudwatch) Publish nightly business metrics to CloudWatch: use when a business figure (active users, submissions, revenue, HMRC failures, cost) needs a CloudWatch metric for the dashboard.
    - [DATA-22](#data-22-orchestrate-the-nightly-ingestion-workflow) Orchestrate the nightly ingestion workflow: use when a new ingestion job must join the nightly chain, or the chain's failure behaviour must be checked.
  - [Site-side analytics and RUM](#site-side-analytics-and-rum-data)
    - [DATA-23](#data-23-classify-visitor-kind-as-human-bot-or-synthetic) Classify visitor kind as human, bot or synthetic: use when a Lambda, RUM script or GA4 tag must agree on human, bot or synthetic.
    - [DATA-24](#data-24-load-ga4-analytics-on-site-pages) Load GA4 analytics on site pages: use when a site page must load gtag.js with the correct measurement id, consent state and cross-domain linking.
    - [DATA-25](#data-25-configure-and-gate-cloudwatch-rum) Configure and gate CloudWatch RUM: use when a page's RUM telemetry must read its app monitor config and respect consent.
    - [DATA-26](#data-26-render-the-operator-objectives-dashboard) Render the operator objectives dashboard: use when the operator-only dashboard page must show the eight one-stop objectives or the account's activity list.
  - [SQL views](#sql-views-data)
    - [DATA-27](#data-27-sql-views-activity-and-traffic) SQL views: activity and traffic: use when a question is about daily active users, HMRC auth/bundle activity, GA4 sessions, visitor kind or funnel steps.
    - [DATA-28](#data-28-sql-views-revenue-and-subscription) SQL views: revenue and subscription: use when a question is about Stripe revenue, subscription renewals/cancellations, purchase reconciliation or pass redemptions.
    - [DATA-29](#data-29-sql-views-submission-and-compliance) SQL views: submission and compliance: use when a question is about VAT/ITSA/Companies House completions, HMRC failures, signup funnels, repeat filers or accessibility.
    - [DATA-30](#data-30-sql-views-cost) SQL views: cost: use when a question is about AWS spend by service or tag, cost per submission, or the steady-state target.
    - [DATA-31](#data-31-sql-views-dora-and-operations) SQL views: DORA and operations: use when a question is about deploy success rate, agent workflow outcomes, probe pass rate, alarm activity or operator interventions.
  - [Google Ads administration](#google-ads-administration-data)
    - [DATA-32](#data-32-sync-the-google-ads-account) Sync the Google Ads account: use when ads.toml's declared tagging, goals, campaigns or bidding strategy must be applied to the live account.
    - [DATA-33](#data-33-read-the-google-ads-account-inventory) Read the Google Ads account inventory: use when a plan or report needs a read-only snapshot of the live Google Ads account before acting.
    - [DATA-34](#data-34-report-google-ads-campaign-performance) Report Google Ads campaign performance: use when a task asks how Google Ads campaigns, ad groups or keywords are performing over a date range.
    - [DATA-35](#data-35-forecast-google-ads-keyword-performance) Forecast Google Ads keyword performance: use when a task asks how many clicks or conversions a proposed keyword list and daily budget would deliver.
    - [DATA-36](#data-36-answer-google-ads-questions-from-live-data) Answer Google Ads questions from live data: use when asked how the Google Ads account is doing, what a budget would buy, or how to optimise spend.
  - [Google Cloud and GA4 administration](#google-cloud-and-ga4-administration-data)
    - [DATA-37](#data-37-federate-lambda-credentials-to-google-cloud) Federate Lambda credentials to Google Cloud: use when an analytics Lambda must call a Google Cloud or GA4 API without a stored service-account key.
    - [DATA-38](#data-38-sync-ga4-properties-streams-and-key-events) Sync GA4 properties, streams and key events: use when a GA4 property's streams, key events, enhanced measurement or BigQuery link must match analytics.toml.
    - [DATA-39](#data-39-sync-ga4-in-bigquery-scheduled-queries) Sync GA4-in-BigQuery scheduled queries: use when the ga4_daily BigQuery dataset's scheduled queries must match bigquery.toml.
    - [DATA-40](#data-40-enable-required-google-cloud-apis) Enable required Google Cloud APIs: use when a fresh GA4 project needs its required services enabled with no console click.
    - [DATA-41](#data-41-assert-gcp-billing-budget-and-stray-project) Assert GCP billing budget and stray project: use when the GA4 billing account's budget alert thresholds must be checked, or a stray auto-created project verified empty.
    - [DATA-42](#data-42-sync-gcp-workload-identity-and-org-policy) Sync GCP workload identity and org policy: use when a Lambda's federated access to Google Cloud must be granted, or an org policy must match identity.toml.
    - [DATA-43](#data-43-read-the-google-cloud-and-ga4-inventory) Read the Google Cloud and GA4 inventory: use when a toml file or a script's plan must be checked against the live Google Cloud/GA4 state before acting.
    - [DATA-44](#data-44-assert-google-oauth-client-configuration) Assert Google OAuth client configuration: use when the sign-in or YouTube OAuth client's live configuration must be checked against oauth.toml.
    - [DATA-45](#data-45-apply-ga4-and-gcp-iam-role-bindings) Apply GA4 and GCP IAM role bindings: use when a principal's GA4 Analytics Admin access or GCP Resource Manager IAM bindings must match project.toml.
    - [DATA-46](#data-46-configure-the-youtube-channel-as-code) Configure the YouTube channel as code: use when the channel scripts/youtube-upload.js targets needs declaring or checking without a recorded channel id.
    - [DATA-47](#data-47-authenticate-google-cloud-scripts-via-federated-credentials) Authenticate Google Cloud scripts via federated credentials: use when any infra/google script needs a Google Cloud client without a stored service-account key.
  - [Finance staging and reconciliation](#finance-staging-and-reconciliation-data)
    - [DATA-48](#data-48-stage-paypal-transactions-for-reconciliation) Stage PayPal transactions for reconciliation: use when one month's PayPal transactions must be pulled and staged for reconciliation.
    - [DATA-49](#data-49-stage-stripe-transactions-for-reconciliation) Stage Stripe transactions for reconciliation: use when one month's Stripe balance transactions and payouts must be pulled and staged for accounts reconciliation.
    - [DATA-50](#data-50-resolve-finance-staging-directory-paths) Resolve finance staging directory paths: use when a finance script must find the shared staging tree, or label a month by UK accounting year-end.
    - [DATA-51](#data-51-turn-staged-stripe-activity-into-diya-gl-lines) Turn staged Stripe activity into diya-gl lines: use when staged Stripe transactions or payouts must become validated diya-gl bookkeeping lines.
- **[MCP and tools](#mcp-and-tools-mcp)**
  - [Server and CLI](#server-and-cli-mcp)
    - [MCP-01](#mcp-01-expose-the-submission-mcp-server-and-tools) Expose the submission MCP server and tools: use when a session needs the submission MCP's tool set, over stdio or one call across every practice client.
    - [MCP-02](#mcp-02-authenticate-mcp-sessions-via-cognito) Authenticate MCP sessions via Cognito: use when the MCP's own tools (cloud book open/save) need a signed-in DIY Accounting Submit session.
  - [Book and derivation tools](#book-and-derivation-tools-mcp)
    - [MCP-03](#mcp-03-load-and-save-diya-gl-books-via-mcp) Load and save diya-gl books via MCP: use when an MCP session needs to open or save a diya-gl book, locally or in the cloud.
    - [MCP-04](#mcp-04-derive-micro-entity-accounts-figures-for-companies-house-filing) Derive micro-entity accounts figures for Companies House filing: use when a Company (ltd) book's FRS 105 balance-sheet lines are needed before a Companies House accounts filing.
    - [MCP-05](#mcp-05-derive-vat-figures-via-mcp-tools) Derive VAT figures via MCP tools: use when a VAT return's nine HMRC boxes must be computed from a loaded book before filing or review.
    - [MCP-06](#mcp-06-derive-itsa-quarterly-and-annual-submission-figures) Derive ITSA quarterly and annual submission figures: use when a self-employed book's quarterly update or annual submission figures are needed for HMRC's Self Employment Business API.
  - [Filing and practice tools](#filing-and-practice-tools-mcp)
    - [MCP-07](#mcp-07-file-vat-returns-and-accounts-via-api) File VAT returns and accounts via API: use when confirmed VAT or accounts figures must be filed, fetched or polled against the deployed API.
    - [MCP-08](#mcp-08-manage-practice-clients-and-hmrc-agent-authorisation) Manage practice clients and HMRC agent authorisation: use when a practice's client list must be read or grown, or an HMRC Agent Authorisation invitation sent or checked.
    - [MCP-09](#mcp-09-run-a-client-scoped-tool-across-every-practice-client) Run a client-scoped tool across every practice client: use when one submission or book tool must run once per client in a practice's list.
  - [Finance data import](#finance-data-import-mcp)
    - [MCP-10](#mcp-10-import-a-natwest-bank-statement-into-diya-gl-lines) Import a NatWest bank statement into diya-gl lines: use when a NatWest current-account CSV export must become validated diya-gl bank lines for a book.
    - [MCP-11](#mcp-11-seed-a-book-from-a-workbook-set) Seed a book from a workbook set: use when a finished trading year's Company package workbooks must seed a new book.toml for the following year.
    - [MCP-12](#mcp-12-read-invoices-from-the-local-mail-index) Read invoices from the local mail index: use when supplier invoice emails must become staged diya-gl purchases lines without a live Gmail call.
    - [MCP-13](#mcp-13-import-stripe-transaction-and-payout-lines) Import Stripe transaction and payout lines: use when staged Stripe balance transactions and payouts must become validated diya-gl sales, purchases and bank lines.
  - [Documentation and disclaimer](#documentation-and-disclaimer-mcp)
    - [MCP-14](#mcp-14-document-the-submission-mcps-plan-and-tool-reference) Document the submission MCP's plan and tool reference: use when starting work on the submission MCP: what is built, planned, and how to run it.
    - [MCP-15](#mcp-15-disclaim-an-mcp-server-on-the-marketing-site) Disclaim an MCP server on the marketing site: use when checking or editing the public claim that DIY Accounting Submit has no MCP server.
- **[Developer workflow](#developer-workflow-dev)**
  - [Simulator server & OAuth mocks](#simulator-server--oauth-mocks-dev)
    - [DEV-01](#dev-01-run-the-http-simulator-server) Run the HTTP simulator server: use when local or CI tests need HMRC, Companies House or Stripe endpoints without real calls.
    - [DEV-02](#dev-02-simulate-local-app-oauth) Simulate local app OAuth: use when the proxy variant needs a login flow without the Docker mock-oauth2-server.
    - [DEV-03](#dev-03-simulate-hmrc-oauth) Simulate HMRC OAuth: use when a test needs HMRC's sign-in and grant-permission flow without a real HMRC account.
    - [DEV-04](#dev-04-simulate-companies-house-identity-and-filing) Simulate Companies House identity and filing: use when a test needs Companies House sign-in, company lookup or accounts filing without the real API.
    - [DEV-05](#dev-05-simulate-hmrc-agent-authorisation-and-fraud-prevention-headers) Simulate HMRC Agent Authorisation and fraud-prevention headers: use when a test needs an agent-client invitation flow or must check Gov-Client/Gov-Vendor headers.
    - [DEV-06](#dev-06-simulate-hmrc-test-user-provisioning-and-api-docs) Simulate HMRC test-user provisioning and API docs: use when a test needs a fresh HMRC sandbox-style test user, or a session needs the simulator's own API docs.
    - [DEV-07](#dev-07-simulate-the-public-demos-billing-and-oauth) Simulate the public demo's billing and OAuth: use when the public demo app needs a mock OAuth authorize URL, a mock token exchange, or fake Stripe billing.
  - [Simulator tax APIs](#simulator-tax-apis-dev)
    - [DEV-08](#dev-08-simulate-hmrc-vat-mtd-api) Simulate HMRC VAT MTD API: use when a test needs VAT returns, obligations, liabilities, payments or penalties without a real HMRC call.
    - [DEV-09](#dev-09-simulate-hmrc-itsa-mtd-api) Simulate HMRC ITSA MTD API: use when a test needs Making Tax Digital for Income Tax Self Assessment endpoints without a real HMRC call.
  - [Public demo simulator deployment & practice UI](#public-demo-simulator-deployment--practice-ui-dev)
    - [DEV-10](#dev-10-deploy-the-public-demo-simulator) Deploy the public demo simulator: use when the public read-only demo of the app needs deploying or its static build regenerating.
    - [DEV-11](#dev-11-practice-the-vat-journey-in-the-browser-embedded-simulator) Practice the VAT journey in the browser-embedded simulator: use when a demo or onboarding page needs a scripted, no-live-HMRC-calls VAT submission walkthrough.
    - [DEV-12](#dev-12-prove-the-client-status-stack-and-fetchauth) Prove the client status-stack and fetch/auth: use when a change touches the status-stack state machine, core fetch/auth logic, or the simulator's iframe controls.
    - [DEV-13](#dev-13-generate-the-openapi-spec-from-cdk-route-definitions) Generate the OpenAPI spec from CDK route definitions: use when the API's OpenAPI document must reflect the real API Gateway routes without a hand-maintained list.
  - [Local dev environment & secrets](#local-dev-environment--secrets-dev)
    - [DEV-14](#dev-14-start-the-proxy-and-simulator-local-dev-environments) Start the proxy and simulator local dev environments: use when starting local development against native HTTPS with Docker, or a Docker-free simulator variant.
    - [DEV-15](#dev-15-fetch-and-publish-proxy-variant-secrets) Fetch and publish proxy-variant secrets: use when a local proxy-variant run needs HMRC/Stripe secrets, or a renewed local TLS certificate needs publishing.
    - [DEV-16](#dev-16-manage-the-durable-cognito-test-user-lifecycle) Manage the durable Cognito test-user lifecycle: use when a test lane needs a working Cognito login, native email/password auth toggled, or test users purged.
  - [Test fixtures, reports & DynamoDB export](#test-fixtures-reports--dynamodb-export-dev)
    - [DEV-17](#dev-17-export-and-embed-dynamodb-test-state-in-reports) Export and embed DynamoDB test state in reports: use when a behaviour or system test run's DynamoDB state needs exporting, reporting or publishing for review.
    - [DEV-18](#dev-18-provide-shared-unitsystem-test-fixtures) Provide shared unit/system-test fixtures: use when a unit or system test needs a Lambda event, ID token, fetch mock or DynamoDB double.
    - [DEV-19](#dev-19-provide-shared-behaviour-test-fixtures-and-steps) Provide shared behaviour-test fixtures and steps: use when a behaviour test needs a background process, a page-interaction step, a DynamoDB assertion or a GA4 query.
    - [DEV-20](#dev-20-check-spdx-licence-headers) Check SPDX licence headers: use when a new source file is added, or licence-header coverage across the repository needs checking or fixing.
    - [DEV-21](#dev-21-verify-module-wiring-and-repository-shape) Verify module wiring and repository shape: use when a module might not be reachable from the app's index, or NEXT.md's board-row structure needs checking.
  - [Build hygiene, toolchain & docs](#build-hygiene-toolchain--docs-dev)
    - [DEV-22](#dev-22-clean-and-update-local-build-state) Clean and update local build state: use when local build artefacts, node_modules or dependency versions are stale, or a commit's author needs checking.
    - [DEV-23](#dev-23-configure-the-test-and-lint-toolchains) Configure the test and lint toolchains: use when Vitest coverage thresholds, Playwright browser settings, or ESLint/security-lint rules need checking or changing.
    - [DEV-24](#dev-24-document-developer-setup-and-repository-conventions) Document developer setup and repository conventions: use when a new contributor needs the setup guide, or the architecture, git config or session record needs reading.
    - [DEV-25](#dev-25-maintain-the-specialist-agent-prompt-library) Maintain the specialist agent prompt library: use when a Claude session needs a reusable role prompt, or a one-off analysis prompt.
    - [DEV-26](#dev-26-enforce-claude-code-conventions-via-rules-and-hooks) Enforce Claude Code conventions via rules and hooks: use when a Claude session writes Lambda, CDK or test code, or pushes to main.
  - [Claude Code delivery-cycle skills](#claude-code-delivery-cycle-skills-dev)
    - [DEV-27](#dev-27-render-the-open-work-board) Render the open-work board: use when the operator asks for the board, the open items, or what is in flight.
    - [DEV-28](#dev-28-work-nextmd-as-dispatched-sub-agents) Work NEXT.md as dispatched sub-agents: use when the operator says do next, work the backlog, clear NEXT.md, or a landed batch leaves items still open.
    - [DEV-29](#dev-29-refine-nextmd-before-a-wave) Refine NEXT.md before a wave: use when the operator asks for a readiness, feasibility or context pass over the board, or says refine the board.
    - [DEV-30](#dev-30-run-the-delivery-cycle-unattended) Run the delivery cycle unattended: use when the operator says iterate, run the cycle, or keep going until the board is clear.
    - [DEV-31](#dev-31-watch-github-ci-to-green) Watch GitHub CI to green: use when the operator says watch the builds, keep it green, or hands over a branch to get through CI.
    - [DEV-32](#dev-32-merge-every-pr-that-is-ready) Merge every PR that is ready: use when the operator says auto-merge, merge what's ready, or asks for the repository's merge state.
    - [DEV-33](#dev-33-preview-what-auto-merge-would-do) Preview what auto-merge would do: use when the operator wants to see what would merge before anything does.
    - [DEV-34](#dev-34-clean-up-stale-deployments-and-branches) Clean up stale deployments and branches: use when the operator says clean, clean up, or tidy the repo.
    - [DEV-35](#dev-35-cool-down-an-overloaded-batch) Cool down an overloaded batch: use when the operator says cool down, or a batch is stacking problems faster than it lands them.
    - [DEV-36](#dev-36-resume-normal-work-from-cool-down) Resume normal work from cool-down: use when the operator lifts cool-down in their own words, such as carry on or resume.
    - [DEV-37](#dev-37-write-the-session-report) Write the session report: use when the operator asks for a session report, an account of the session, or how did this session do.
    - [DEV-38](#dev-38-write-plain-human-prose) Write plain, human prose: use when writing any human-facing text: docs, code comments, reports, runbooks, site copy or chat.
    - [DEV-39](#dev-39-sync-stripe-products-and-prices-from-the-catalogue) Sync Stripe products and prices from the catalogue: use when a bundle's price changes or a new on-subscription bundle needs a Stripe product.
    - [DEV-40](#dev-40-record-a-product-demo-video) Record a product demo video: use when asked to make, update or re-record a product demo or training video.
    - [DEV-41](#dev-41-publish-videos-to-the-youtube-channel) Publish videos to the YouTube channel: use when the operator asks to publish, re-publish or check the videos, or a recording is ready.
    - [DEV-42](#dev-42-look-up-a-vat-submission-failure-alarms-customer) Look up a VAT submission-failure alarm's customer: use when the operator asks who a submission-failure alarm was or whether the customer needs a reply.
    - [DEV-43](#dev-43-find-existing-tooling-before-building-any) Find existing tooling before building any: use when a task would add a script, workflow, Lambda, check, sync, report, alarm, page or skill
<!-- /generated:index -->

## Customer-facing site and accounts (SITE)

<!-- generated:area SITE -->
- [Authentication and authorization](#authentication-and-authorization-site): [SITE-01](#site-01-sign-customers-in-via-cognito) Sign customers in via Cognito · [SITE-02](#site-02-verify-jwts-at-the-api-gateway) Verify JWTs at the API gateway
- [Account and engagement APIs](#account-and-engagement-apis-site): [SITE-03](#site-03-capture-feedback-interest) Capture feedback interest · [SITE-04](#site-04-track-visits-via-session-beacon) Track visits via session beacon · [SITE-05](#site-05-submit-support-tickets) Submit support tickets
- [Server and API plumbing](#server-and-api-plumbing-site): [SITE-06](#site-06-adapt-lambda-handlers-to-express-routes) Adapt Lambda handlers to Express routes · [SITE-07](#site-07-format-http-responses-and-errors) Format HTTP responses and errors · [SITE-08](#site-08-bootstrap-the-app-server) Bootstrap the app server · [SITE-09](#site-09-track-and-poll-async-api-requests) Track and poll async API requests
- [Site pages and content](#site-pages-and-content-site): [SITE-10](#site-10-serve-general-site-pages) Serve general site pages · [SITE-11](#site-11-promote-sibling-products-and-partners) Promote sibling products and partners · [SITE-12](#site-12-map-the-site-structure) Map the site structure
- [Frontend infrastructure](#frontend-infrastructure-site): [SITE-13](#site-13-warm-backend-routes-via-prefetch-scripts) Warm backend routes via prefetch scripts · [SITE-14](#site-14-render-page-chrome-and-widgets) Render page chrome and widgets · [SITE-15](#site-15-show-and-persist-cookie-consent) Show and persist cookie consent · [SITE-16](#site-16-configure-the-frontend-via-toml-and-env-libraries) Configure the frontend via TOML and env libraries · [SITE-17](#site-17-trace-and-secure-client-requests) Trace and secure client requests · [SITE-18](#site-18-bootstrap-the-frontend-module-bundle) Bootstrap the frontend module bundle · [SITE-19](#site-19-generate-qr-codes) Generate QR codes
- [Business documentation](#business-documentation-site): [SITE-20](#site-20-document-business-governance-and-positioning) Document business governance and positioning · [SITE-21](#site-21-log-growth-experiments) Log growth experiments
<!-- /generated:area SITE -->

### Authentication and authorization (SITE)

<!-- generated:group authentication-and-authorization-site -->
- [SITE-01](#site-01-sign-customers-in-via-cognito) Sign customers in via Cognito
- [SITE-02](#site-02-verify-jwts-at-the-api-gateway) Verify JWTs at the API gateway
<!-- /generated:group authentication-and-authorization-site -->

#### SITE-01 Sign customers in via Cognito

- **Use when:** a page must start, complete or refresh a Cognito hosted-UI login.
- **Does:** auth-url-builder.js builds the Cognito hosted-UI authorization URL. login.html and the callback pages redirect and complete the exchange. cognitoTokenPost.js exchanges the code or refresh token for tokens. auth-service.js tracks token expiry and refreshes the session. auth-status.js renders logged-in state and sends a logout beacon.
- **Run:** `POST /api/v1/cognito/token`; `import { buildCognitoAuthUrl } from "web/public/lib/auth-url-builder.js"`
- **Entry:** `web/public/lib/auth-url-builder.js:buildCognitoAuthUrl`; `app/functions/auth/cognitoTokenPost.js:ingestHandler`; `web/public/lib/services/auth-service.js`
- **Files:** web/public/auth/login.html, web/public/auth/loginWithCognitoCallback.html, web/public/auth/loginWithMockCallback.html, web/public/auth/login-mock-addon.js, web/public/auth/signed-out.html, web/public/widgets/auth-status.js, web/public/lib/auth-url-builder.js, web/public/lib/services/auth-service.js, web/public/lib/utils/jwt-utils.js, app/functions/auth/cognitoTokenPost.js, app/functions/auth/preTokenGeneration/index.js, infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/IdentityStackTest.java, app/system-tests/cognitoAuth.system.test.js, app/unit-tests/functions/cognitoTokenPost.test.js, app/unit-tests/functions/preTokenGeneration.test.js, behaviour-tests/auth.behaviour.test.js, behaviour-tests/helpers/hosted-ui-navigation.js, behaviour-tests/steps/behaviour-login-steps.js, web/unit-tests/hosted-ui-navigation.test.js, web/unit-tests/auth-url-generation.test.js, web/unit-tests/auth-logout-beacon.test.js
- **Keywords:** cognito, login, logout, hosted ui, oauth, token refresh, auth-status, sign in, callback, mfa claim, user pool
- **Related:** SITE-02

#### SITE-02 Verify JWTs at the API gateway

- **Use when:** an API route needs the caller's Cognito access token checked, or their sub decoded.
- **Does:** customAuthorizer.js is an API Gateway HTTP API Lambda authorizer. It verifies the access token signature with aws-jwt-verify. It runs a mid-session country-change check and reads MFA context from the ID token. jwtHelper.js decodes a JWT payload without checking its signature for already-authorized Lambda functions.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/auth/customAuthorizer.js:ingestHandler`; `app/lib/jwtHelper.js:getUserSub`
- **Files:** app/functions/auth/customAuthorizer.js, app/lib/jwtHelper.js, infra/main/java/co/uk/diyaccounting/submit/stacks/AuthStack.java, app/system-tests/customAuthorizer.system.test.js, app/unit-tests/functions/customAuthorizer.test.js
- **Keywords:** jwt, authorizer, api gateway, access token, sub, mfa context, country change, aws-jwt-verify, signature verify
- **Related:** SITE-01

### Account and engagement APIs (SITE)

<!-- generated:group account-and-engagement-apis-site -->
- [SITE-03](#site-03-capture-feedback-interest) Capture feedback interest
- [SITE-04](#site-04-track-visits-via-session-beacon) Track visits via session beacon
- [SITE-05](#site-05-submit-support-tickets) Submit support tickets
<!-- /generated:group account-and-engagement-apis-site -->

#### SITE-03 Capture feedback interest

- **Use when:** a signed-in user clicks the homepage join button to register feedback interest.
- **Does:** interestPost.js publishes a feedback engagement notification to an SNS topic. It reads the email from the JWT authorizer context. It does not calculate or charge any interest.
- **Run:** `POST /api/v1/interest`
- **Entry:** `app/functions/account/interestPost.js:ingestHandler`
- **Files:** app/functions/account/interestPost.js, app/unit-tests/functions/interestPost.test.js
- **Keywords:** interest, feedback, engagement, sns, join button, homepage cta
- **Related:** SITE-04

#### SITE-04 Track visits via session beacon

- **Use when:** the site needs to record a visit or logout as an activity event, filtered for crawlers.
- **Does:** sessionBeaconPost.js classifies the visitor as human, crawler or AI agent from the user agent. It publishes a new-session or logout activity event and drops crawler traffic. session-beacon.js fires the session-start beacon once per browser session. auth-status.js sends the logout beacon.
- **Run:** `POST /api/v1/session/beacon`
- **Entry:** `app/functions/account/sessionBeaconPost.js:ingestHandler`; `web/public/lib/session-beacon.js`
- **Files:** app/functions/account/sessionBeaconPost.js, web/public/lib/session-beacon.js, app/unit-tests/functions/sessionBeaconPost.test.js
- **Keywords:** session beacon, visitor classification, crawler, ai agent, activity event, analytics event, logout beacon
- **Related:** SITE-01, SITE-03

#### SITE-05 Submit support tickets

- **Use when:** a visitor needs to open a support ticket as a GitHub issue from the site.
- **Does:** supportTicketPost.js opens a GitHub issue using a GitHub App installation token. It caps each IP to 3 submissions per minute via the DynamoDB security-state table. It marks the issue unverified since anyone can post to it. support-api.js is the browser counterpart that calls the endpoint or offers a direct GitHub link as a fallback.
- **Run:** `POST /api/v1/support/ticket`
- **Entry:** `app/functions/support/supportTicketPost.js:ingestHandler`; `web/public/lib/support-api.js`
- **Files:** app/functions/support/supportTicketPost.js, web/public/lib/support-api.js, app/unit-tests/functions/supportTicketPost.test.js, app/unit-tests/supportIssueFormCategories.test.js
- **Keywords:** support ticket, github issue, github app, rate limit, unverified issue, help page form
- **Related:** SITE-13

### Server and API plumbing (SITE)

<!-- generated:group server-and-api-plumbing-site -->
- [SITE-06](#site-06-adapt-lambda-handlers-to-express-routes) Adapt Lambda handlers to Express routes
- [SITE-07](#site-07-format-http-responses-and-errors) Format HTTP responses and errors
- [SITE-08](#site-08-bootstrap-the-app-server) Bootstrap the app server
- [SITE-09](#site-09-track-and-poll-async-api-requests) Track and poll async API requests
<!-- /generated:group server-and-api-plumbing-site -->

#### SITE-06 Adapt Lambda handlers to Express routes

- **Use when:** a Lambda-style apiEndpoint handler needs to run behind the local Express dev server.
- **Does:** httpServerToLambdaAdaptor.js converts an Express request into the same Lambda event shape API Gateway produces, including the decoded bearer JWT. It converts the Lambda-style result back into an Express response. registerLambdaRoute wires one route through it in one line.
- **Run:** `import { registerLambdaRoute } from "app/lib/httpServerToLambdaAdaptor.js"`
- **Entry:** `app/lib/httpServerToLambdaAdaptor.js:registerLambdaRoute`; `app/lib/httpServerToLambdaAdaptor.js:buildLambdaEventFromHttpRequest`
- **Files:** app/lib/httpServerToLambdaAdaptor.js, app/unit-tests/httpServerToLambdaAdaptor.test.js
- **Keywords:** express adaptor, lambda event, api gateway event shape, registerLambdaRoute, local server routing
- **Related:** SITE-07, SITE-08

#### SITE-07 Format HTTP responses and errors

- **Use when:** a Lambda function needs a standard JSON response, or Express needs a JSON error page.
- **Does:** httpResponseHelper.js builds the Lambda-style response objects, such as http200OkResponse and http400BadRequestResponse, with correlation headers merged in. jsonErrorHandler.js is the Express error-handling middleware that turns an uncaught throw into a JSON 500 response instead of an HTML error page.
- **Run:** `import { http200OkResponse } from "app/lib/httpResponseHelper.js"`
- **Entry:** `app/lib/httpResponseHelper.js:http200OkResponse`; `app/lib/jsonErrorHandler.js:jsonErrorHandler`
- **Files:** app/lib/httpResponseHelper.js, app/lib/jsonErrorHandler.js, app/unit-tests/lib/jsonErrorHandler.test.js
- **Keywords:** http response helper, json error, correlation headers, error middleware, status codes
- **Related:** SITE-06

#### SITE-08 Bootstrap the app server

- **Use when:** running the site locally against a full Express server instead of deployed Lambdas.
- **Does:** app/bin/server.js is the Express dev and local server. It registers every Lambda-style endpoint through the adaptor, serves HTTPS locally, sets the CSP header, serves the simulator build under /sim/, and wires mock OAuth and billing routes when real Cognito or Stripe are unavailable.
- **Run:** `npm run start`; `npm run start:simulator`
- **Entry:** `app/bin/server.js`
- **Files:** app/index.js, app/bin/server.js, app/bin/main.js, app/unit-tests/bin/server.test.js, app/unit-tests/main.test.js
- **Keywords:** express server, local dev server, https local, csp header, simulator build, mock oauth, mock billing
- **Related:** SITE-06

#### SITE-09 Track and poll async API requests

- **Use when:** an API call takes too long for a single Lambda response and the client must poll for a result.
- **Does:** dynamoDbAsyncRequestRepository.js stores async request state with a 1-hour TTL. asyncApiServices.js runs the processing and returns a 202 for a caller to poll. api-client.js attaches the Cognito token, retries once after a forced token refresh on a 401, and polls a 202 response with a backing-off delay until it resolves.
- **Run:** `import { initiateProcessing } from "app/services/asyncApiServices.js"`; `import { executeAsyncRequestPolling } from "web/public/lib/services/api-client.js"`
- **Entry:** `app/data/dynamoDbAsyncRequestRepository.js:putAsyncRequest`; `app/services/asyncApiServices.js:initiateProcessing`; `web/public/lib/services/api-client.js:executeAsyncRequestPolling`
- **Files:** app/data/dynamoDbAsyncRequestRepository.js, app/services/asyncApiServices.js, web/public/lib/services/api-client.js, app/unit-tests/data/dynamoDbAsyncRequestRepository.test.js, app/unit-tests/services/asyncApiServices.test.js, app/system-tests/asyncRequestPersistence.system.test.js, web/unit-tests/fetch-polling.test.js
- **Keywords:** async request, 202 accepted, polling, dynamodb ttl, queue processing, token refresh retry, 403 bundle message
- **Related:** SITE-06, SITE-07

### Site pages and content (SITE)

<!-- generated:group site-pages-and-content-site -->
- [SITE-10](#site-10-serve-general-site-pages) Serve general site pages
- [SITE-11](#site-11-promote-sibling-products-and-partners) Promote sibling products and partners
- [SITE-12](#site-12-map-the-site-structure) Map the site structure
<!-- /generated:group site-pages-and-content-site -->

#### SITE-10 Serve general site pages

- **Use when:** adding or changing a static informational page, or the FAQ/help search behind it.
- **Does:** Static pages cover the homepage, about, accessibility, guide, help, privacy, terms and usage token history. faqs.toml holds the FAQ entries. faq-search.js does bigram fuzzy matching over them. help-page.js controls search, the accordion and the support-ticket modal.
- **Run:** no command; see Does and Entry
- **Entry:** `web/public/lib/faq-search.js:FAQSearch`; `web/public/lib/help-page.js:HelpPage`
- **Files:** web/public/index.html, web/public/about.html, web/public/accessibility.html, web/public/guide.html, web/public/help.html, web/public/privacy.html, web/public/terms.html, web/public/usage.html, web/public/faqs.toml, web/public/lib/faq-search.js, web/public/lib/help-page.js, web/public/images/favicon/IMPLEMENTATION.html, behaviour-tests/help.behaviour.test.js, web/browser-tests/privacy-notice.browser.test.js, web/unit-tests/seo-validation.test.js
- **Keywords:** static pages, faq search, help page, accessibility statement, privacy, terms, usage history, bigram matching
- **Related:** SITE-05, SITE-19

#### SITE-11 Promote sibling products and partners

- **Use when:** adding or changing a cross-sell page for a sibling product or an affiliate.
- **Does:** Cross-sell pages sit outside the VAT-filing product. They cover the company background, the DIY Accounting Spreadsheets product, and a PolicyBee business-insurance affiliate page.
- **Run:** no command; see Does and Entry
- **Entry:** `web/public/diy-accounting-spreadsheets.html`; `web/public/policybee.html`
- **Files:** web/public/diy-accounting-limited.html, web/public/diy-accounting-spreadsheets.html, web/public/policybee.html, web/public/spreadsheets.html
- **Keywords:** cross-sell, spreadsheets product, policybee, affiliate, company background page
- **Related:** SITE-10

#### SITE-12 Map the site structure

- **Use when:** adding or moving a page and its place in the header, nav or footer needs checking.
- **Does:** SITE_MAP.md diagrams the page layout, including the header, main nav and footer, and where each page fits.
- **Run:** no command; see Does and Entry
- **Entry:** `_developers/SITE_MAP.md`
- **Files:** _developers/SITE_MAP.md
- **Keywords:** site map, page layout, navigation structure, header footer diagram
- **Related:** SITE-10, SITE-13

### Frontend infrastructure (SITE)

<!-- generated:group frontend-infrastructure-site -->
- [SITE-13](#site-13-warm-backend-routes-via-prefetch-scripts) Warm backend routes via prefetch scripts
- [SITE-14](#site-14-render-page-chrome-and-widgets) Render page chrome and widgets
- [SITE-15](#site-15-show-and-persist-cookie-consent) Show and persist cookie consent
- [SITE-16](#site-16-configure-the-frontend-via-toml-and-env-libraries) Configure the frontend via TOML and env libraries
- [SITE-17](#site-17-trace-and-secure-client-requests) Trace and secure client requests
- [SITE-18](#site-18-bootstrap-the-frontend-module-bundle) Bootstrap the frontend module bundle
- [SITE-19](#site-19-generate-qr-codes) Generate QR codes
<!-- /generated:group frontend-infrastructure-site -->

#### SITE-13 Warm backend routes via prefetch scripts

- **Use when:** a page must pre-warm a Lambda or route before its own script needs the real response.
- **Does:** Each prefetch-*-head.js script issues one HEAD request from the page's head element. It targets the catalog, HMRC receipt, HMRC receipt name, HMRC token or mock auth URL route. It does not fetch or cache the response body.
- **Run:** no command; see Does and Entry
- **Entry:** `web/public/prefetch/prefetch-catalog-head.js`
- **Files:** web/public/prefetch/prefetch-catalog-head.js, web/public/prefetch/prefetch-hmrc-receipt-head.js, web/public/prefetch/prefetch-hmrc-receipt-name-head.js, web/public/prefetch/prefetch-hmrc-token-head.js, web/public/prefetch/prefetch-mock-authurl-head.js
- **Keywords:** prefetch, head request, warm route, cold start, lambda warming
- **Related:** SITE-09

#### SITE-14 Render page chrome and widgets

- **Use when:** a page needs the shared header, nav and footer, or a small shared UI widget.
- **Does:** page-chrome.js builds the shared header, main nav and footer around each page's own static h1. It leaves a fallback link in place until it has run, so a script failure never strands the page. loading-spinner.js, status-messages.js and view-source-link.js are smaller widgets. dom-utils.js holds the underlying DOM helpers. developer-mode.js adds a header toggle visible only to users with a synthetic test bundle.
- **Run:** no command; see Does and Entry
- **Entry:** `web/public/widgets/page-chrome.js`; `web/public/lib/utils/dom-utils.js:showStatus`
- **Files:** web/public/widgets/page-chrome.js, web/public/widgets/loading-spinner.js, web/public/widgets/status-messages.js, web/public/widgets/view-source-link.js, web/public/lib/utils/dom-utils.js, web/public/developer-mode.js, web/browser-tests/navigation.browser.test.js, web/browser-tests/mobileLayout.browser.test.js
- **Keywords:** page chrome, header nav footer, loading spinner, status messages, developer mode, synthetic bundle toggle, dom helpers
- **Related:** SITE-12, SITE-17

#### SITE-15 Show and persist cookie consent

- **Use when:** GA4 analytics consent must be gated behind a visible cookie-consent banner.
- **Does:** A consent banner with id consent-banner shows on first visit and gates GA4's analytics_storage consent, denied by default. The visitor's accept or decline choice persists across page loads. lib/analytics.js implements the consent calls; the browser test in this capability drives the real static site end to end against it.
- **Run:** `npm run test:browser`
- **Entry:** `web/public/lib/analytics.js`
- **Files:** web/browser-tests/cookieConsent.browser.test.js
- **Keywords:** cookie consent, consent banner, ga4, analytics_storage, consent mode, privacy banner
- **Related:** SITE-10

#### SITE-16 Configure the frontend via TOML and env libraries

- **Use when:** a page needs runtime config, feature flags, or a cached GET with ETag revalidation.
- **Does:** env-loader.js fetches /submit.env at runtime and parses KEY=VALUE lines into window.envReady. feature-flags.js fetches and caches /submit.features.toml and exposes isFeatureEnabled. request-cache.js is an in-memory, promise-deduplicated GET cache with TTL and ETag revalidation. toml-parser.js is the parser both rely on. storage-utils.js wraps localStorage and sessionStorage access so a quota or privacy error never throws.
- **Run:** no command; see Does and Entry
- **Entry:** `web/public/lib/env-loader.js`; `web/public/lib/feature-flags.js:isFeatureEnabled`; `web/public/lib/request-cache.js:getJSON`
- **Files:** web/public/lib/env-loader.js, web/public/lib/feature-flags.js, web/public/lib/request-cache.js, web/public/lib/toml-parser.js, web/public/lib/utils/storage-utils.js, web/public/submit.features.toml
- **Keywords:** env loader, feature flags, toml parser, request cache, etag, localStorage wrapper, runtime config, submit.env
- **Related:** SITE-17

#### SITE-17 Trace and secure client requests

- **Use when:** a fetch needs a W3C traceparent and request id stamped on it, or a random value for OAuth state.
- **Does:** correlation-utils.js generates and stores a W3C traceparent and an x-request-id per session. It installs a window.fetch wrapper that stamps both onto same-origin requests. crypto-utils.js supplies the underlying random values, used both for that tracing and for the OAuth state parameter in the login flow.
- **Run:** no command; see Does and Entry
- **Entry:** `web/public/lib/utils/correlation-utils.js:installCorrelationInterceptor`; `web/public/lib/utils/crypto-utils.js:generateRandomState`
- **Files:** web/public/lib/utils/correlation-utils.js, web/public/lib/utils/crypto-utils.js
- **Keywords:** traceparent, x-request-id, correlation id, fetch wrapper, oauth state, random hex, sha256
- **Related:** SITE-01, SITE-16

#### SITE-18 Bootstrap the frontend module bundle

- **Use when:** a new utils, services or widgets module needs wiring into the site's single entry point.
- **Does:** submit.js is the site's single entry point. It imports every utils, services and widgets module and assigns them onto window for scripts that still call them as globals.
- **Run:** no command; see Does and Entry
- **Entry:** `web/public/submit.js`
- **Files:** web/public/submit.js, web/unit-tests/submit.helpers.test.js
- **Keywords:** entry point, module bundle, window globals, submit.js, bundling
- **Related:** SITE-14, SITE-16

#### SITE-19 Generate QR codes

- **Use when:** a page must render a scannable QR code, such as a pass-generation page.
- **Does:** qrcode.min.js is a vendored third-party QR-code renderer, MIT-licensed, from node-qrcode. Pass-generation pages outside this capability call it to render a scannable code.
- **Run:** no command; see Does and Entry
- **Entry:** `web/public/lib/qrcode.min.js`
- **Files:** web/public/lib/qrcode.min.js
- **Keywords:** qr code, node-qrcode, vendored library, pass generation, scannable code

### Business documentation (SITE)

<!-- generated:group business-documentation-site -->
- [SITE-20](#site-20-document-business-governance-and-positioning) Document business governance and positioning
- [SITE-21](#site-21-log-growth-experiments) Log growth experiments
<!-- /generated:group business-documentation-site -->

#### SITE-20 Document business governance and positioning

- **Use when:** a question needs the licensing terms, trademark rules, product strategy or marketing rules.
- **Does:** LICENSING.md sets out the PolyForm Internal Use License plus the hosted-service grant. TRADEMARKS.md covers trademark usage. STRATEGY.md covers product strategy. REPORT_COMPETITOR_ANALYSIS.md surveys the UK MTD market. MARKETING_GUIDANCE.md covers HMRC and advertising-standards marketing copy rules.
- **Run:** no command; see Does and Entry
- **Entry:** `LICENSING.md`; `STRATEGY.md`
- **Files:** LICENSING.md, TRADEMARKS.md, STRATEGY.md, REPORT_COMPETITOR_ANALYSIS.md, _developers/MARKETING_GUIDANCE.md
- **Keywords:** licensing, polyform, trademarks, strategy, competitor analysis, marketing guidance, hmrc marketing rules, advertising standards

#### SITE-21 Log growth experiments

- **Use when:** a growth experiment needs recording so the operator dashboard can annotate its metrics.
- **Does:** experiments.toml is a log of growth experiments. Each entry has an id, objective, hypothesis, lever, metric, start and end dates, and a result. It carries no API credentials or sync configuration.
- **Run:** no command; see Does and Entry
- **Entry:** `experiments.toml`
- **Files:** experiments.toml
- **Keywords:** growth experiments, experiment log, operator dashboard annotations, ab test log, hypothesis lever metric
- **Related:** SITE-20

## HMRC filing (HMRC)

<!-- generated:area HMRC -->
- [VAT filing](#vat-filing-hmrc): [HMRC-01](#hmrc-01-submit-a-vat-return) Submit a VAT return · [HMRC-02](#hmrc-02-retrieve-a-submitted-vat-return) Retrieve a submitted VAT return · [HMRC-03](#hmrc-03-retrieve-vat-obligations) Retrieve VAT obligations · [HMRC-04](#hmrc-04-retrieve-vat-liabilities) Retrieve VAT liabilities · [HMRC-05](#hmrc-05-retrieve-vat-payments) Retrieve VAT payments · [HMRC-06](#hmrc-06-retrieve-vat-penalties) Retrieve VAT penalties · [HMRC-07](#hmrc-07-build-and-validate-9-box-vat-return-data) Build and validate 9-box VAT return data · [HMRC-08](#hmrc-08-parse-vat-returns-from-a-bulk-csv-file) Parse VAT returns from a bulk CSV file
- [ITSA business and obligations](#itsa-business-and-obligations-hmrc): [HMRC-09](#hmrc-09-retrieve-itsa-business-details) Retrieve ITSA business details · [HMRC-10](#hmrc-10-retrieve-itsa-obligations) Retrieve ITSA obligations · [HMRC-11](#hmrc-11-retrieve-itsa-status) Retrieve ITSA status
- [ITSA periodic and annual submissions](#itsa-periodic-and-annual-submissions-hmrc): [HMRC-12](#hmrc-12-submit-and-manage-self-employment-periodic-updates) Submit and manage self-employment periodic updates · [HMRC-13](#hmrc-13-submit-and-manage-the-self-employment-annual-summary) Submit and manage the self-employment annual summary · [HMRC-14](#hmrc-14-submit-and-manage-uk-property-periodic-updates) Submit and manage UK property periodic updates · [HMRC-15](#hmrc-15-submit-and-manage-the-uk-property-annual-summary) Submit and manage the UK property annual summary
- [ITSA year-end processing](#itsa-year-end-processing-hmrc): [HMRC-16](#hmrc-16-trigger-and-adjust-the-business-source-adjustable-summary) Trigger and adjust the Business Source Adjustable Summary · [HMRC-17](#hmrc-17-manage-itsa-losses-and-claims) Manage ITSA losses and claims · [HMRC-18](#hmrc-18-manage-itsa-tax-liability-adjustments) Manage ITSA tax liability adjustments · [HMRC-19](#hmrc-19-calculate-itsa-tax-liability) Calculate ITSA tax liability · [HMRC-20](#hmrc-20-retrieve-itsa-crystallisation-obligations) Retrieve ITSA crystallisation obligations · [HMRC-21](#hmrc-21-submit-the-itsa-final-declaration) Submit the ITSA final declaration
- [Receipts and HMRC authentication](#receipts-and-hmrc-authentication-hmrc): [HMRC-22](#hmrc-22-store-and-retrieve-hmrc-submission-receipts) Store and retrieve HMRC submission receipts · [HMRC-23](#hmrc-23-exchange-an-hmrc-oauth-code-for-a-token) Exchange an HMRC OAuth code for a token · [HMRC-24](#hmrc-24-verify-hmrc-agent-authorisation-for-a-client) Verify HMRC agent authorisation for a client
- [HMRC API plumbing](#hmrc-api-plumbing-hmrc): [HMRC-25](#hmrc-25-build-hmrc-fraud-prevention-headers) Build HMRC fraud-prevention headers · [HMRC-26](#hmrc-26-monitor-hmrc-fraud-prevention-header-compliance) Monitor HMRC fraud-prevention header compliance · [HMRC-27](#hmrc-27-validate-hmrc-identifiers-dates-and-amounts) Validate HMRC identifiers, dates and amounts · [HMRC-28](#hmrc-28-format-and-match-hmrc-obligations) Format and match HMRC obligations · [HMRC-29](#hmrc-29-call-the-hmrc-api) Call the HMRC API · [HMRC-30](#hmrc-30-persist-async-hmrc-api-request-state) Persist async HMRC API request state
- [HMRC infrastructure and test tooling](#hmrc-infrastructure-and-test-tooling-hmrc): [HMRC-31](#hmrc-31-wire-hmrc-lambda-handlers-into-cdk-stacks) Wire HMRC Lambda handlers into CDK stacks · [HMRC-32](#hmrc-32-register-and-verify-hmrc-developer-hub-application-config) Register and verify HMRC Developer Hub application config · [HMRC-33](#hmrc-33-drive-hmrcs-sandbox-authorisation-flow-for-test-scripts) Drive HMRC's sandbox authorisation flow for test scripts · [HMRC-34](#hmrc-34-file-a-full-itsa-tax-year-in-sandbox) File a full ITSA tax year in sandbox · [HMRC-35](#hmrc-35-spike-test-the-itsa-sandbox-oauth-and-business-details-flow) Spike-test the ITSA sandbox OAuth and business-details flow · [HMRC-36](#hmrc-36-provide-itsa-behaviour-test-step-helpers) Provide ITSA behaviour-test step helpers · [HMRC-37](#hmrc-37-plan-the-hmrc-mtd-vat-and-itsa-rollout) Plan the HMRC MTD VAT and ITSA rollout
<!-- /generated:area HMRC -->

### VAT filing (HMRC)

<!-- generated:group vat-filing-hmrc -->
- [HMRC-01](#hmrc-01-submit-a-vat-return) Submit a VAT return
- [HMRC-02](#hmrc-02-retrieve-a-submitted-vat-return) Retrieve a submitted VAT return
- [HMRC-03](#hmrc-03-retrieve-vat-obligations) Retrieve VAT obligations
- [HMRC-04](#hmrc-04-retrieve-vat-liabilities) Retrieve VAT liabilities
- [HMRC-05](#hmrc-05-retrieve-vat-payments) Retrieve VAT payments
- [HMRC-06](#hmrc-06-retrieve-vat-penalties) Retrieve VAT penalties
- [HMRC-07](#hmrc-07-build-and-validate-9-box-vat-return-data) Build and validate 9-box VAT return data
- [HMRC-08](#hmrc-08-parse-vat-returns-from-a-bulk-csv-file) Parse VAT returns from a bulk CSV file
<!-- /generated:group vat-filing-hmrc -->

#### HMRC-01 Submit a VAT return

- **Use when:** a customer must file a 9-box or legacy VAT return with HMRC for a period.
- **Does:** hmrcVatReturnPost.js's ingestHandler resolves the HMRC period key and posts the return through the async SQS worker submitVat. It records a DynamoDB receipt, publishes activity events, and blocks resubmission of a filed period.
- **Run:** `POST /api/v1/hmrc/vat/return`
- **Entry:** `app/functions/hmrc/hmrcVatReturnPost.js:ingestHandler`; `app/functions/hmrc/hmrcVatReturnPost.js:submitVat`
- **Files:** app/functions/hmrc/hmrcVatReturnPost.js, app/unit-tests/functions/hmrcVatReturnPost.test.js, app/unit-tests/functions/hmrcVatReturnPost.activity.test.js, app/unit-tests/functions/hmrcVatReturnPost.worker.test.js, app/system-tests/hmrcVatJourney.system.test.js, app/system-tests/hmrcVatScenarios.system.test.js, app/system-tests/vatValidation.test.js, behaviour-tests/postVatReturn.behaviour.test.js, behaviour-tests/postVatReturnFraudPreventionHeaders.behaviour.test.js, behaviour-tests/vatSchemes.behaviour.test.js, behaviour-tests/vatValidation.behaviour.test.js, behaviour-tests/submitVat.behaviour.test.js, behaviour-tests/steps/behaviour-hmrc-vat-steps.js, web/public/hmrc/vat/submitVat.html, web/unit-tests/vatFlow.frontend.test.js, web/public/prefetch/prefetch-hmrc-vat-return-head.js
- **Keywords:** vat return, submit vat, mtd vat, 9-box, period key, vat obligations, submitvat worker, vat scheme, fraud prevention headers, receipt
- **Related:** HMRC-03, HMRC-07, HMRC-22, HMRC-25

#### HMRC-02 Retrieve a submitted VAT return

- **Use when:** a customer needs to view a VAT return already filed for a period key.
- **Does:** hmrcVatReturnGet.js's ingestHandler calls getVatReturn to read back a filed HMRC VAT return. viewVatReturn.html displays the result, including a status-clear case.
- **Run:** `GET /api/v1/hmrc/vat/return`
- **Entry:** `app/functions/hmrc/hmrcVatReturnGet.js:ingestHandler`; `app/functions/hmrc/hmrcVatReturnGet.js:getVatReturn`
- **Files:** app/functions/hmrc/hmrcVatReturnGet.js, app/unit-tests/functions/hmrcVatReturnGet.test.js, behaviour-tests/getVatReturn.behaviour.test.js, web/public/hmrc/vat/viewVatReturn.html, web/browser-tests/view-vat-return.browser.test.js, web/browser-tests/viewVatReturn.statusClear.browser.test.js, web/public/prefetch/prefetch-hmrc-vat-return-get-head.js
- **Keywords:** vat return, view vat return, period key, hmrc vat api, status clear, get vat return
- **Related:** HMRC-01, HMRC-03

#### HMRC-03 Retrieve VAT obligations

- **Use when:** a session needs open or fulfilled VAT filing periods for a date range.
- **Does:** hmrcVatObligationGet.js's getVatObligations lists VAT filing periods from HMRC. hmrcVatReturnPost.js also calls it to resolve a period key before filing.
- **Run:** `GET /api/v1/hmrc/vat/obligation`
- **Entry:** `app/functions/hmrc/hmrcVatObligationGet.js:ingestHandler`; `app/functions/hmrc/hmrcVatObligationGet.js:getVatObligations`
- **Files:** app/functions/hmrc/hmrcVatObligationGet.js, app/unit-tests/functions/hmrcVatObligationGet.test.js, app/system-tests/hmrcVatObligationJourney.system.test.js, behaviour-tests/getVatObligations.behaviour.test.js, web/public/hmrc/vat/vatObligations.html, web/browser-tests/vatObligations.error403.browser.test.js, web/public/prefetch/prefetch-hmrc-vat-obligation-head.js
- **Keywords:** vat obligations, filing periods, due dates, period key, hmrc token expired, 403
- **Related:** HMRC-01, HMRC-28

#### HMRC-04 Retrieve VAT liabilities

- **Use when:** a customer needs the VAT amount owed or refunded over a date range.
- **Does:** hmrcVatLiabilitiesGet.js's ingestHandler calls HMRC's VAT Liabilities API for the requested date range. vatLiabilities.html displays the returned figures.
- **Run:** `GET /api/v1/hmrc/vat/liability`
- **Entry:** `app/functions/hmrc/hmrcVatLiabilitiesGet.js:ingestHandler`; `app/functions/hmrc/hmrcVatLiabilitiesGet.js:getVatLiabilities`
- **Files:** app/functions/hmrc/hmrcVatLiabilitiesGet.js, app/unit-tests/functions/hmrcVatLiabilitiesGet.test.js, behaviour-tests/getVatLiabilities.behaviour.test.js, web/public/hmrc/vat/vatLiabilities.html
- **Keywords:** vat liabilities, amount owed, vat refund, date range, hmrc vat api
- **Related:** HMRC-05, HMRC-06

#### HMRC-05 Retrieve VAT payments

- **Use when:** a customer needs payments HMRC has recorded against the VAT account.
- **Does:** hmrcVatPaymentsGet.js's ingestHandler calls HMRC's VAT Payments API for a date range. vatPayments.html displays the recorded payments.
- **Run:** `GET /api/v1/hmrc/vat/payment`
- **Entry:** `app/functions/hmrc/hmrcVatPaymentsGet.js:ingestHandler`; `app/functions/hmrc/hmrcVatPaymentsGet.js:getVatPayments`
- **Files:** app/functions/hmrc/hmrcVatPaymentsGet.js, app/unit-tests/functions/hmrcVatPaymentsGet.test.js, behaviour-tests/getVatPayments.behaviour.test.js, web/public/hmrc/vat/vatPayments.html
- **Keywords:** vat payments, payment history, vat account, date range, hmrc vat api
- **Related:** HMRC-04, HMRC-06

#### HMRC-06 Retrieve VAT penalties

- **Use when:** a customer needs penalties HMRC has applied to the VAT account.
- **Does:** hmrcVatPenaltiesGet.js's ingestHandler calls HMRC's VAT Penalties API. vatPenalties.html displays the returned penalties.
- **Run:** `GET /api/v1/hmrc/vat/penalty`
- **Entry:** `app/functions/hmrc/hmrcVatPenaltiesGet.js:ingestHandler`; `app/functions/hmrc/hmrcVatPenaltiesGet.js:getVatPenalties`
- **Files:** app/functions/hmrc/hmrcVatPenaltiesGet.js, app/unit-tests/functions/hmrcVatPenaltiesGet.test.js, behaviour-tests/getVatPenalties.behaviour.test.js, web/public/hmrc/vat/vatPenalties.html
- **Keywords:** vat penalties, penalty points, vat account, hmrc vat api, late submission penalty
- **Related:** HMRC-04, HMRC-05

#### HMRC-07 Build and validate 9-box VAT return data

- **Use when:** a VAT return body must be built, validated or calculated from box entries.
- **Does:** vatReturnTypes.js holds the HMRC 9-box field configuration and calculates Box 3 and Box 5. It validates monetary and whole-number fields and builds the HMRC request body from 9-box or legacy input.
- **Run:** `import { buildVatReturnBody, validateVatReturnBody, calculateTotalVatDue, calculateNetVatDue } from "app/lib/vatReturnTypes.js"`
- **Entry:** `app/lib/vatReturnTypes.js:buildVatReturnBody`; `app/lib/vatReturnTypes.js:validateVatReturnBody`
- **Files:** app/lib/vatReturnTypes.js, app/unit-tests/lib/vatReturnTypes.test.js
- **Keywords:** 9-box, vat box config, box 3, box 5, vat validation, legacy vatdue, vat return body
- **Related:** HMRC-01, HMRC-27

#### HMRC-08 Parse VAT returns from a bulk CSV file

- **Use when:** a CSV of VAT return figures from a spreadsheet package must become 9-box objects.
- **Does:** vatReturnCsv.js's parseVatReturnCsv reads a CSV file against the CSV_VAT_RETURN_CONTRACT.md contract. It throws a VatReturnCsvError with a named reason for each rejected row.
- **Run:** `import { parseVatReturnCsv } from "app/lib/vatReturnCsv.js"`
- **Entry:** `app/lib/vatReturnCsv.js:parseVatReturnCsv`
- **Files:** app/lib/vatReturnCsv.js, app/unit-tests/lib/vatReturnCsv.test.js, _developers/CSV_VAT_RETURN_CONTRACT.md
- **Keywords:** csv import, bulk vat return, vat return csv, spreadsheets contract, vatreturncsverror, 9-box
- **Related:** HMRC-07

### ITSA business and obligations (HMRC)

<!-- generated:group itsa-business-and-obligations-hmrc -->
- [HMRC-09](#hmrc-09-retrieve-itsa-business-details) Retrieve ITSA business details
- [HMRC-10](#hmrc-10-retrieve-itsa-obligations) Retrieve ITSA obligations
- [HMRC-11](#hmrc-11-retrieve-itsa-status) Retrieve ITSA status
<!-- /generated:group itsa-business-and-obligations-hmrc -->

#### HMRC-09 Retrieve ITSA business details

- **Use when:** a taxpayer's self-employment or UK property businesses must be listed by NINO.
- **Does:** hmrcItsaBusinessDetailsGet.js's ingestHandler calls HMRC's Business Details API by NINO. dashboard.html runs this lookup to build a business picker for the ITSA journey.
- **Run:** `GET /api/v1/hmrc/itsa/business/details`
- **Entry:** `app/functions/hmrc/hmrcItsaBusinessDetailsGet.js:ingestHandler`; `app/functions/hmrc/hmrcItsaBusinessDetailsGet.js:getItsaBusinessDetails`
- **Files:** app/functions/hmrc/hmrcItsaBusinessDetailsGet.js, app/unit-tests/functions/hmrcItsaBusinessDetailsGet.test.js, web/public/hmrc/itsa/businessDetails.html, web/public/hmrc/itsa/dashboard.html, web/browser-tests/itsaDashboard.browser.test.js, web/browser-tests/businessDetails.browser.test.js, web/browser-tests/usageItsaYearCost.browser.test.js, behaviour-tests/itsaBusinessDetails.behaviour.test.js
- **Keywords:** itsa business details, nino, self-employment, uk property business, business picker, dashboard
- **Related:** HMRC-10, HMRC-11

#### HMRC-10 Retrieve ITSA obligations

- **Use when:** quarterly, annual or final-declaration ITSA obligations must be listed for a business.
- **Does:** hmrcItsaObligationsGet.js's ingestHandler calls HMRC's Obligations API for a business. obligations.html displays due dates and status.
- **Run:** `GET /api/v1/hmrc/itsa/obligations`
- **Entry:** `app/functions/hmrc/hmrcItsaObligationsGet.js:ingestHandler`; `app/functions/hmrc/hmrcItsaObligationsGet.js:getItsaObligations`
- **Files:** app/functions/hmrc/hmrcItsaObligationsGet.js, app/unit-tests/functions/hmrcItsaObligationsGet.test.js, web/public/hmrc/itsa/obligations.html, web/browser-tests/obligations.browser.test.js, behaviour-tests/itsaObligations.behaviour.test.js
- **Keywords:** itsa obligations, quarterly update, final declaration, due dates, mtd for itsa
- **Related:** HMRC-09, HMRC-20

#### HMRC-11 Retrieve ITSA status

- **Use when:** a taxpayer's Making Tax Digital enrolment for a tax year must be checked.
- **Does:** hmrcItsaStatusGet.js's ingestHandler calls HMRC's ITSA Status API for the given tax year. No page in this repository consumes the result yet.
- **Run:** `GET /api/v1/hmrc/itsa/status`
- **Entry:** `app/functions/hmrc/hmrcItsaStatusGet.js:ingestHandler`; `app/functions/hmrc/hmrcItsaStatusGet.js:getItsaStatus`
- **Files:** app/functions/hmrc/hmrcItsaStatusGet.js, app/unit-tests/functions/hmrcItsaStatusGet.test.js
- **Keywords:** itsa status, mtd enrolment, tax year, hmrc itsa status api, making tax digital
- **Related:** HMRC-09

### ITSA periodic and annual submissions (HMRC)

<!-- generated:group itsa-periodic-and-annual-submissions-hmrc -->
- [HMRC-12](#hmrc-12-submit-and-manage-self-employment-periodic-updates) Submit and manage self-employment periodic updates
- [HMRC-13](#hmrc-13-submit-and-manage-the-self-employment-annual-summary) Submit and manage the self-employment annual summary
- [HMRC-14](#hmrc-14-submit-and-manage-uk-property-periodic-updates) Submit and manage UK property periodic updates
- [HMRC-15](#hmrc-15-submit-and-manage-the-uk-property-annual-summary) Submit and manage the UK property annual summary
<!-- /generated:group itsa-periodic-and-annual-submissions-hmrc -->

#### HMRC-12 Submit and manage self-employment periodic updates

- **Use when:** quarterly or cumulative self-employment income and expense updates must be filed or read.
- **Does:** Four Lambdas create, read, amend and list self-employment periodic updates against HMRC's Self Employment Business API. itsaSubmissionModel.js picks dated-quarter or cumulative-total behaviour by tax year on the client.
- **Run:** `POST /api/v1/hmrc/itsa/self-employment/period`; `GET /api/v1/hmrc/itsa/self-employment/period`; `PUT /api/v1/hmrc/itsa/self-employment/period`; `GET /api/v1/hmrc/itsa/self-employment/periods`
- **Entry:** `app/functions/hmrc/hmrcItsaSelfEmploymentPeriodPost.js:ingestHandler`; `app/functions/hmrc/hmrcItsaSelfEmploymentPeriodPut.js:ingestHandler`; `web/public/lib/itsaSubmissionModel.js:resolveItsaSubmissionModel`
- **Files:** app/functions/hmrc/hmrcItsaSelfEmploymentPeriodPost.js, app/functions/hmrc/hmrcItsaSelfEmploymentPeriodGet.js, app/functions/hmrc/hmrcItsaSelfEmploymentPeriodPut.js, app/functions/hmrc/hmrcItsaSelfEmploymentPeriodsGet.js, app/unit-tests/functions/hmrcItsaSelfEmploymentPeriodPost.test.js, app/unit-tests/functions/hmrcItsaSelfEmploymentPeriodPost.activity.test.js, app/unit-tests/functions/hmrcItsaSelfEmploymentPeriodGet.test.js, app/unit-tests/functions/hmrcItsaSelfEmploymentPeriodPut.test.js, app/unit-tests/functions/hmrcItsaSelfEmploymentPeriodPut.activity.test.js, app/unit-tests/functions/hmrcItsaSelfEmploymentPeriodsGet.test.js, app/unit-tests/http-simulator/routes/itsa-self-employment-period.test.js, web/public/hmrc/itsa/selfEmploymentPeriod.html, web/public/hmrc/itsa/selfEmploymentPeriodAmend.html, web/public/hmrc/itsa/selfEmploymentPeriodView.html, web/public/hmrc/itsa/selfEmploymentPeriods.html, web/browser-tests/selfEmploymentPeriod.browser.test.js, web/browser-tests/itsaCumulativeModel.browser.test.js, behaviour-tests/itsaSelfEmploymentPeriod.behaviour.test.js, web/public/lib/itsaSubmissionModel.js
- **Keywords:** self-employment period, quarterly update, cumulative model, dated quarters, itsa periods, tax year 2025-26
- **Related:** HMRC-14, HMRC-27

#### HMRC-13 Submit and manage the self-employment annual summary

- **Use when:** the year-end self-employment allowances and adjustments summary must be read or filed.
- **Does:** hmrcItsaSelfEmploymentAnnualGet.js and hmrcItsaSelfEmploymentAnnualPut.js read and submit the annual summary to HMRC. annualSubmission.html edits it and can import figures from a prior year.
- **Run:** `GET /api/v1/hmrc/itsa/self-employment/annual`; `PUT /api/v1/hmrc/itsa/self-employment/annual`
- **Entry:** `app/functions/hmrc/hmrcItsaSelfEmploymentAnnualGet.js:ingestHandler`; `app/functions/hmrc/hmrcItsaSelfEmploymentAnnualPut.js:ingestHandler`
- **Files:** app/functions/hmrc/hmrcItsaSelfEmploymentAnnualGet.js, app/functions/hmrc/hmrcItsaSelfEmploymentAnnualPut.js, app/unit-tests/functions/hmrcItsaSelfEmploymentAnnualGet.test.js, app/unit-tests/functions/hmrcItsaSelfEmploymentAnnualPut.test.js, app/unit-tests/functions/hmrcItsaSelfEmploymentAnnualPut.activity.test.js, web/public/hmrc/itsa/annualSubmission.html, web/browser-tests/annualSubmission.browser.test.js, web/browser-tests/annualSubmission.import.browser.test.js, behaviour-tests/itsaAnnualSubmission.behaviour.test.js
- **Keywords:** annual summary, self-employment allowances, adjustments, year-end, itsa annual submission, import prior year
- **Related:** HMRC-12, HMRC-19

#### HMRC-14 Submit and manage UK property periodic updates

- **Use when:** quarterly or cumulative UK property rental income and expense updates must be filed or read.
- **Does:** Four Lambdas create, read, amend and list UK property periodic updates against HMRC's UK Property Business API. They share the dated/cumulative model split with the self-employment periods.
- **Run:** `POST /api/v1/hmrc/itsa/uk-property/period`; `GET /api/v1/hmrc/itsa/uk-property/period`; `PUT /api/v1/hmrc/itsa/uk-property/period`; `GET /api/v1/hmrc/itsa/uk-property/periods`
- **Entry:** `app/functions/hmrc/hmrcItsaUkPropertyPeriodPost.js:ingestHandler`; `app/functions/hmrc/hmrcItsaUkPropertyPeriodPut.js:ingestHandler`
- **Files:** app/functions/hmrc/hmrcItsaUkPropertyPeriodPost.js, app/functions/hmrc/hmrcItsaUkPropertyPeriodGet.js, app/functions/hmrc/hmrcItsaUkPropertyPeriodPut.js, app/functions/hmrc/hmrcItsaUkPropertyPeriodsGet.js, app/unit-tests/functions/hmrcItsaUkPropertyPeriodPost.test.js, app/unit-tests/functions/hmrcItsaUkPropertyPeriodPost.activity.test.js, app/unit-tests/functions/hmrcItsaUkPropertyPeriodGet.test.js, app/unit-tests/functions/hmrcItsaUkPropertyPeriodPut.test.js, app/unit-tests/functions/hmrcItsaUkPropertyPeriodPut.activity.test.js, app/unit-tests/functions/hmrcItsaUkPropertyPeriodsGet.test.js, web/public/hmrc/itsa/ukPropertyPeriod.html, web/public/hmrc/itsa/ukPropertyPeriodAmend.html, web/public/hmrc/itsa/ukPropertyPeriodView.html, web/public/hmrc/itsa/ukPropertyPeriods.html, behaviour-tests/itsaUkPropertyPeriod.behaviour.test.js
- **Keywords:** uk property period, rental income, cumulative model, dated quarters, itsa property, quarterly update
- **Related:** HMRC-12, HMRC-15

#### HMRC-15 Submit and manage the UK property annual summary

- **Use when:** the year-end UK property annual summary must be read or filed.
- **Does:** hmrcItsaUkPropertyAnnualGet.js and hmrcItsaUkPropertyAnnualPut.js read and submit the year-end UK property annual summary. ukPropertyAnnualSubmission.html loads and edits it.
- **Run:** `GET /api/v1/hmrc/itsa/uk-property/annual`; `PUT /api/v1/hmrc/itsa/uk-property/annual`
- **Entry:** `app/functions/hmrc/hmrcItsaUkPropertyAnnualGet.js:ingestHandler`; `app/functions/hmrc/hmrcItsaUkPropertyAnnualPut.js:ingestHandler`
- **Files:** app/functions/hmrc/hmrcItsaUkPropertyAnnualGet.js, app/functions/hmrc/hmrcItsaUkPropertyAnnualPut.js, app/unit-tests/functions/hmrcItsaUkPropertyAnnualGet.test.js, app/unit-tests/functions/hmrcItsaUkPropertyAnnualPut.test.js, app/unit-tests/functions/hmrcItsaUkPropertyAnnualPut.activity.test.js, web/public/hmrc/itsa/ukPropertyAnnualSubmission.html, behaviour-tests/itsaUkPropertyAnnualSubmission.behaviour.test.js
- **Keywords:** uk property annual, year-end summary, rental property, itsa annual submission, property income allowance
- **Related:** HMRC-13, HMRC-14

### ITSA year-end processing (HMRC)

<!-- generated:group itsa-year-end-processing-hmrc -->
- [HMRC-16](#hmrc-16-trigger-and-adjust-the-business-source-adjustable-summary) Trigger and adjust the Business Source Adjustable Summary
- [HMRC-17](#hmrc-17-manage-itsa-losses-and-claims) Manage ITSA losses and claims
- [HMRC-18](#hmrc-18-manage-itsa-tax-liability-adjustments) Manage ITSA tax liability adjustments
- [HMRC-19](#hmrc-19-calculate-itsa-tax-liability) Calculate ITSA tax liability
- [HMRC-20](#hmrc-20-retrieve-itsa-crystallisation-obligations) Retrieve ITSA crystallisation obligations
- [HMRC-21](#hmrc-21-submit-the-itsa-final-declaration) Submit the ITSA final declaration
<!-- /generated:group itsa-year-end-processing-hmrc -->

#### HMRC-16 Trigger and adjust the Business Source Adjustable Summary

- **Use when:** a year-end BSAS calculation must be triggered, read or adjusted for a business.
- **Does:** hmrcItsaBsasTriggerPost.js triggers HMRC's BSAS calculation for either income type. The get and adjust-post Lambdas per income type read HMRC's figures and submit an adjustment.
- **Run:** `POST /api/v1/hmrc/itsa/bsas/trigger`; `GET /api/v1/hmrc/itsa/bsas/self-employment`; `POST /api/v1/hmrc/itsa/bsas/self-employment/adjust`; `GET /api/v1/hmrc/itsa/bsas/uk-property`; `POST /api/v1/hmrc/itsa/bsas/uk-property/adjust`
- **Entry:** `app/functions/hmrc/hmrcItsaBsasTriggerPost.js:ingestHandler`; `app/functions/hmrc/hmrcItsaBsasSelfEmploymentAdjustPost.js:ingestHandler`; `app/functions/hmrc/hmrcItsaBsasUkPropertyAdjustPost.js:ingestHandler`
- **Files:** app/functions/hmrc/hmrcItsaBsasTriggerPost.js, app/functions/hmrc/hmrcItsaBsasSelfEmploymentGet.js, app/functions/hmrc/hmrcItsaBsasSelfEmploymentAdjustPost.js, app/functions/hmrc/hmrcItsaBsasUkPropertyGet.js, app/functions/hmrc/hmrcItsaBsasUkPropertyAdjustPost.js, app/unit-tests/functions/hmrcItsaBsasTriggerPost.test.js, app/unit-tests/functions/hmrcItsaBsasSelfEmploymentGet.test.js, app/unit-tests/functions/hmrcItsaBsasSelfEmploymentAdjustPost.test.js, app/unit-tests/functions/hmrcItsaBsasUkPropertyGet.test.js, app/unit-tests/functions/hmrcItsaBsasUkPropertyAdjustPost.test.js, web/public/hmrc/itsa/adjustments.html, web/public/hmrc/itsa/ukPropertyAdjustments.html, web/browser-tests/adjustments.browser.test.js
- **Keywords:** bsas, business source adjustable summary, typeofbusiness, adjustments, year-end calculation, self-employment bsas, uk property bsas
- **Related:** HMRC-19, HMRC-12, HMRC-14

#### HMRC-17 Manage ITSA losses and claims

- **Use when:** losses or relief claims must be read, submitted or deleted against HMRC.
- **Does:** hmrcItsaLossesAndClaimsGet/Put/Delete.js read, submit and delete losses and relief claims. lossesAndClaims.html loads existing entries and edits them.
- **Run:** `GET /api/v1/hmrc/itsa/losses-and-claims`; `PUT /api/v1/hmrc/itsa/losses-and-claims`; `DELETE /api/v1/hmrc/itsa/losses-and-claims`
- **Entry:** `app/functions/hmrc/hmrcItsaLossesAndClaimsGet.js:ingestHandler`; `app/functions/hmrc/hmrcItsaLossesAndClaimsPut.js:ingestHandler`; `app/functions/hmrc/hmrcItsaLossesAndClaimsDelete.js:ingestHandler`
- **Files:** app/functions/hmrc/hmrcItsaLossesAndClaimsGet.js, app/functions/hmrc/hmrcItsaLossesAndClaimsPut.js, app/functions/hmrc/hmrcItsaLossesAndClaimsDelete.js, app/unit-tests/functions/hmrcItsaLossesAndClaims.test.js, app/unit-tests/functions/hmrcItsaLossesAndClaimsPut.activity.test.js, app/unit-tests/functions/hmrcItsaLossesAndClaimsDelete.activity.test.js, web/public/hmrc/itsa/lossesAndClaims.html, web/browser-tests/itsaLossesAndClaims.browser.test.js, behaviour-tests/itsaLossesAndClaims.behaviour.test.js
- **Keywords:** losses and claims, relief claims, itsa losses, loss carry forward, sideways relief
- **Related:** HMRC-19, HMRC-18

#### HMRC-18 Manage ITSA tax liability adjustments

- **Use when:** a manual adjustment to a taxpayer's calculated tax liability must be read, submitted or deleted.
- **Does:** hmrcItsaTaxLiabilityAdjustmentsGet/Put/Delete.js read, submit and delete manual liability adjustments. taxLiabilityAdjustments.html is the form.
- **Run:** `GET /api/v1/hmrc/itsa/tax-liability-adjustments`; `PUT /api/v1/hmrc/itsa/tax-liability-adjustments`; `DELETE /api/v1/hmrc/itsa/tax-liability-adjustments`
- **Entry:** `app/functions/hmrc/hmrcItsaTaxLiabilityAdjustmentsGet.js:ingestHandler`; `app/functions/hmrc/hmrcItsaTaxLiabilityAdjustmentsPut.js:ingestHandler`; `app/functions/hmrc/hmrcItsaTaxLiabilityAdjustmentsDelete.js:ingestHandler`
- **Files:** app/functions/hmrc/hmrcItsaTaxLiabilityAdjustmentsGet.js, app/functions/hmrc/hmrcItsaTaxLiabilityAdjustmentsPut.js, app/functions/hmrc/hmrcItsaTaxLiabilityAdjustmentsDelete.js, app/unit-tests/functions/hmrcItsaTaxLiabilityAdjustments.test.js, app/unit-tests/functions/hmrcItsaTaxLiabilityAdjustmentsPut.activity.test.js, app/unit-tests/functions/hmrcItsaTaxLiabilityAdjustmentsDelete.activity.test.js, web/public/hmrc/itsa/taxLiabilityAdjustments.html
- **Keywords:** tax liability adjustments, manual adjustment, itsa calculation, tax liability, class 4 nic
- **Related:** HMRC-19, HMRC-17

#### HMRC-19 Calculate ITSA tax liability

- **Use when:** HMRC's tax calculation for a tax year must be triggered or its result retrieved.
- **Does:** hmrcItsaCalculationTriggerPost.js triggers HMRC's tax calculation for a tax year. hmrcItsaCalculationGet.js retrieves the result and taxCalculation.html shows income, relief and liability.
- **Run:** `POST /api/v1/hmrc/itsa/calculation/trigger`; `GET /api/v1/hmrc/itsa/calculation`
- **Entry:** `app/functions/hmrc/hmrcItsaCalculationTriggerPost.js:ingestHandler`; `app/functions/hmrc/hmrcItsaCalculationGet.js:ingestHandler`
- **Files:** app/functions/hmrc/hmrcItsaCalculationTriggerPost.js, app/functions/hmrc/hmrcItsaCalculationGet.js, app/unit-tests/functions/hmrcItsaCalculationTriggerPost.test.js, app/unit-tests/functions/hmrcItsaCalculationGet.test.js, web/public/hmrc/itsa/taxCalculation.html, web/browser-tests/taxCalculation.browser.test.js
- **Keywords:** itsa calculation, tax liability, tax year, income and relief, intent to crystallise
- **Related:** HMRC-16, HMRC-18, HMRC-20, HMRC-21

#### HMRC-20 Retrieve ITSA crystallisation obligations

- **Use when:** the final-declaration obligation for a tax year must be checked before submission.
- **Does:** hmrcItsaCrystallisationObligationsGet.js's ingestHandler calls HMRC's Obligations API filtered to the crystallisation obligation. No dedicated page consumes it; the OpenAPI spec documents it only.
- **Run:** `GET /api/v1/hmrc/itsa/obligations/crystallisation`
- **Entry:** `app/functions/hmrc/hmrcItsaCrystallisationObligationsGet.js:ingestHandler`
- **Files:** app/functions/hmrc/hmrcItsaCrystallisationObligationsGet.js, app/unit-tests/functions/hmrcItsaCrystallisationObligationsGet.test.js
- **Keywords:** crystallisation, final declaration obligation, itsa obligations, tax year, intent to crystallise
- **Related:** HMRC-10, HMRC-21

#### HMRC-21 Submit the ITSA final declaration

- **Use when:** a taxpayer is ready to crystallise their ITSA liability for a tax year.
- **Does:** hmrcItsaFinalDeclarationPost.js's ingestHandler submits the taxpayer's final declaration to HMRC. finalDeclaration.html carries the legal declaration checkboxes and confirmation.
- **Run:** `POST /api/v1/hmrc/itsa/final-declaration`
- **Entry:** `app/functions/hmrc/hmrcItsaFinalDeclarationPost.js:ingestHandler`
- **Files:** app/functions/hmrc/hmrcItsaFinalDeclarationPost.js, app/unit-tests/functions/hmrcItsaFinalDeclarationPost.test.js, app/unit-tests/functions/hmrcItsaFinalDeclarationPost.activity.test.js, web/public/hmrc/itsa/finalDeclaration.html, web/browser-tests/finalDeclaration.browser.test.js, behaviour-tests/itsaFinalDeclaration.behaviour.test.js
- **Keywords:** final declaration, crystallisation, itsa liability, tax year, legal declaration
- **Related:** HMRC-19, HMRC-20

### Receipts and HMRC authentication (HMRC)

<!-- generated:group receipts-and-hmrc-authentication-hmrc -->
- [HMRC-22](#hmrc-22-store-and-retrieve-hmrc-submission-receipts) Store and retrieve HMRC submission receipts
- [HMRC-23](#hmrc-23-exchange-an-hmrc-oauth-code-for-a-token) Exchange an HMRC OAuth code for a token
- [HMRC-24](#hmrc-24-verify-hmrc-agent-authorisation-for-a-client) Verify HMRC agent authorisation for a client
<!-- /generated:group receipts-and-hmrc-authentication-hmrc -->

#### HMRC-22 Store and retrieve HMRC submission receipts

- **Use when:** a customer's stored VAT or ITSA receipt must be listed or fetched.
- **Does:** hmrcReceiptGet.js's ingestHandler lists or fetches receipts by name or key. dynamoDbReceiptRepository.js's get, scan and put back it with DynamoDB; receipts.html is the customer page.
- **Run:** `GET /api/v1/hmrc/receipt`; `GET /api/v1/hmrc/receipt/:name`
- **Entry:** `app/functions/hmrc/hmrcReceiptGet.js:ingestHandler`; `app/data/dynamoDbReceiptRepository.js:getReceipt`; `app/data/dynamoDbReceiptRepository.js:putReceipt`
- **Files:** app/functions/hmrc/hmrcReceiptGet.js, app/unit-tests/functions/hmrcReceiptGet.test.js, app/data/dynamoDbReceiptRepository.js, app/unit-tests/data/dynamoDbReceiptRepository.test.js, app/system-tests/dynamoDbReceiptStore.system.test.js, web/public/hmrc/receipt/receipts.html, behaviour-tests/steps/behaviour-hmrc-receipts-steps.js
- **Keywords:** hmrc receipt, vat receipt, itsa receipt, dynamodb receipt, receipts page
- **Related:** HMRC-01, HMRC-21

#### HMRC-23 Exchange an HMRC OAuth code for a token

- **Use when:** an OAuth authorisation code from HMRC must become an access token.
- **Does:** hmrcTokenPost.js's ingestHandler calls prepareTokenExchangeRequest to build the token request, then buildTokenExchangeResponse executes it. It reads the application's client secret from Secrets Manager.
- **Run:** `POST /api/v1/hmrc/token`
- **Entry:** `app/functions/hmrc/hmrcTokenPost.js:ingestHandler`; `app/functions/hmrc/hmrcTokenPost.js:prepareTokenExchangeRequest`
- **Files:** app/functions/hmrc/hmrcTokenPost.js, app/unit-tests/functions/hmrcTokenPost.test.js, app/system-tests/hmrcAuth.system.test.js, web/public/activities/submitVatCallback.html, web/browser-tests/submitVatCallback.browser.test.js, web/public/lib/hmrc-scope-check.js, behaviour-tests/steps/behaviour-hmrc-steps.js
- **Keywords:** oauth, authorisation code, access token, hmrc token exchange, client secret, secrets manager
- **Related:** HMRC-33

#### HMRC-24 Verify HMRC agent authorisation for a client

- **Use when:** a practice must check its access token carries a delegated client relationship.
- **Does:** hmrcAgentAuthorisation.js calls HMRC's Agent Authorisation API to check a delegated relationship for a service such as MTD-VAT. A practice can then act for a client without storing the client's credentials.
- **Run:** `import { getRelationship, isClientAuthorisedForService } from "app/lib/hmrcAgentAuthorisation.js"`
- **Entry:** `app/lib/hmrcAgentAuthorisation.js:getRelationship`; `app/lib/hmrcAgentAuthorisation.js:isClientAuthorisedForService`
- **Files:** app/lib/hmrcAgentAuthorisation.js, app/unit-tests/lib/hmrcAgentAuthorisation.test.js
- **Keywords:** agent authorisation, delegated relationship, mtd-vat, practice client, agent services
- **Related:** HMRC-03, HMRC-01

### HMRC API plumbing (HMRC)

<!-- generated:group hmrc-api-plumbing-hmrc -->
- [HMRC-25](#hmrc-25-build-hmrc-fraud-prevention-headers) Build HMRC fraud-prevention headers
- [HMRC-26](#hmrc-26-monitor-hmrc-fraud-prevention-header-compliance) Monitor HMRC fraud-prevention header compliance
- [HMRC-27](#hmrc-27-validate-hmrc-identifiers-dates-and-amounts) Validate HMRC identifiers, dates and amounts
- [HMRC-28](#hmrc-28-format-and-match-hmrc-obligations) Format and match HMRC obligations
- [HMRC-29](#hmrc-29-call-the-hmrc-api) Call the HMRC API
- [HMRC-30](#hmrc-30-persist-async-hmrc-api-request-state) Persist async HMRC API request state
<!-- /generated:group hmrc-api-plumbing-hmrc -->

#### HMRC-25 Build HMRC fraud-prevention headers

- **Use when:** a call to any HMRC API needs Gov-Client or Gov-Vendor fraud-prevention headers.
- **Does:** buildFraudHeaders.js constructs the Gov-Client and Gov-Vendor headers HMRC's fraud-prevention spec requires. It detects the vendor's public IP via checkip.amazonaws.com and caches it per Lambda cold start.
- **Run:** `import { buildFraudHeaders } from "app/lib/buildFraudHeaders.js"`
- **Entry:** `app/lib/buildFraudHeaders.js:buildFraudHeaders`
- **Files:** app/lib/buildFraudHeaders.js, app/unit-tests/lib/buildFraudHeaders.test.js
- **Keywords:** fraud prevention headers, gov-client, gov-vendor, device id, vendor ip, checkip
- **Related:** HMRC-26, HMRC-29

#### HMRC-26 Monitor HMRC fraud-prevention header compliance

- **Use when:** HMRC's monthly fraud-prevention header feedback email must be checked or tracked.
- **Does:** fraudPreventionHeaderReport.js parses HMRC's monthly fraud-prevention header feedback email for a reported month. scripts/fraud-header-email-check.js reads that email on a laptop launchd schedule and alerts Telegram when a month needs review. scripts/compliance-fraud-headers-rows.js turns the resulting decision records into compliance-dashboard rows.
- **Run:** `node scripts/fraud-header-email-check.js`; `node scripts/compliance-fraud-headers-rows.js <checkedAt> [directory]`
- **Entry:** `app/lib/fraudPreventionHeaderReport.js:parseFraudPreventionHeaderReport`; `scripts/fraud-header-email-check.js:checkFraudPreventionHeaders`; `scripts/compliance-fraud-headers-rows.js:toRow`
- **Files:** app/lib/fraudPreventionHeaderReport.js, app/unit-tests/lib/fraudPreventionHeaderReport.test.js, scripts/fraud-header-email-check.js, app/unit-tests/scripts/fraudHeaderEmailCheck.test.js, scripts/compliance-fraud-headers-rows.js, app/unit-tests/scripts/complianceFraudHeadersRows.test.js, hmrc-fraud-prevention.md
- **Keywords:** fraud prevention compliance, monthly feedback email, launchd, telegram alert, compliance dashboard, gyb mail mirror
- **Related:** HMRC-25

#### HMRC-27 Validate HMRC identifiers, dates and amounts

- **Use when:** a VRN, NINO, UTR, period key, ISO date, tax year or amount must be validated.
- **Does:** hmrcValidation.js validates HMRC identifiers, dates, tax years and VAT monetary or whole amounts. It resolves the dated or cumulative ITSA submission model, masks IPs and device ids, and maps HMRC error codes.
- **Run:** `import { isValidVrn, isValidNino, resolveItsaSubmissionModel } from "app/lib/hmrcValidation.js"`
- **Entry:** `app/lib/hmrcValidation.js:isValidVrn`; `app/lib/hmrcValidation.js:resolveItsaSubmissionModel`; `app/lib/hmrcValidation.js:getHmrcErrorMessage`
- **Files:** app/lib/hmrcValidation.js, app/unit-tests/lib/hmrcValidation.test.js
- **Keywords:** vrn, nino, utr, period key, tax year, cumulative model, error code mapping, mask ip
- **Related:** HMRC-12, HMRC-07

#### HMRC-28 Format and match HMRC obligations

- **Use when:** a raw HMRC obligation must be shown to a customer or matched to entered dates.
- **Does:** obligationFormatter.js formats a raw HMRC obligation without exposing its period key. findObligationByDateRange matches an obligation to a customer's entered dates, and syntheticPeriodKeys derives keys for sandbox testing.
- **Run:** `import { formatObligationForDisplay, findObligationByDateRange } from "app/lib/obligationFormatter.js"`
- **Entry:** `app/lib/obligationFormatter.js:formatObligationForDisplay`; `app/lib/obligationFormatter.js:findObligationByDateRange`; `app/lib/obligationFormatter.js:syntheticPeriodKeys`
- **Files:** app/lib/obligationFormatter.js, app/unit-tests/lib/obligationFormatter.test.js
- **Keywords:** obligation formatting, period key hidden, date range match, synthetic period key, sandbox obligations
- **Related:** HMRC-03, HMRC-10

#### HMRC-29 Call the HMRC API

- **Use when:** a Lambda or browser page must call an HMRC endpoint and classify the response.
- **Does:** app/services/hmrcApi.js builds HMRC request headers and issues hmrcHttpGet, hmrcHttpPost, hmrcHttpPut and hmrcHttpDelete. It classifies HMRC error responses into the application's own 401, 403, 404 and 500 responses. hmrc-service.js is its browser counterpart, wrapping every HMRC endpoint behind one authorizedFetch-based client.
- **Run:** `import { hmrcHttpGet, hmrcHttpPost } from "app/services/hmrcApi.js"`; `import from "web/public/lib/services/hmrc-service.js"`
- **Entry:** `app/services/hmrcApi.js:hmrcHttpGet`; `app/services/hmrcApi.js:validateHmrcAccessToken`; `web/public/lib/services/hmrc-service.js`
- **Files:** app/services/hmrcApi.js, app/unit-tests/services/hmrcApi.test.js, web/public/lib/services/hmrc-service.js, web/unit-tests/hmrc-service.test.js
- **Keywords:** hmrc http client, error classification, access token validation, authorizedfetch, hmrc-service
- **Related:** HMRC-25, HMRC-30

#### HMRC-30 Persist async HMRC API request state

- **Use when:** a long-running HMRC API call needs its async request/poll state stored.
- **Does:** dynamoDbHmrcApiRequestRepository.js is the DynamoDB repository behind the async request/poll pattern. hmrcApi.js and the write-side Lambdas use it for long-running HMRC calls.
- **Run:** `import { putHmrcApiRequest } from "app/data/dynamoDbHmrcApiRequestRepository.js"`
- **Entry:** `app/data/dynamoDbHmrcApiRequestRepository.js:putHmrcApiRequest`
- **Files:** app/data/dynamoDbHmrcApiRequestRepository.js, app/unit-tests/data/dynamoDbHmrcApiRequestStore.test.js
- **Keywords:** async request state, poll pattern, dynamodb, hmrc api request, worker handler
- **Related:** HMRC-29

### HMRC infrastructure and test tooling (HMRC)

<!-- generated:group hmrc-infrastructure-and-test-tooling-hmrc -->
- [HMRC-31](#hmrc-31-wire-hmrc-lambda-handlers-into-cdk-stacks) Wire HMRC Lambda handlers into CDK stacks
- [HMRC-32](#hmrc-32-register-and-verify-hmrc-developer-hub-application-config) Register and verify HMRC Developer Hub application config
- [HMRC-33](#hmrc-33-drive-hmrcs-sandbox-authorisation-flow-for-test-scripts) Drive HMRC's sandbox authorisation flow for test scripts
- [HMRC-34](#hmrc-34-file-a-full-itsa-tax-year-in-sandbox) File a full ITSA tax year in sandbox
- [HMRC-35](#hmrc-35-spike-test-the-itsa-sandbox-oauth-and-business-details-flow) Spike-test the ITSA sandbox OAuth and business-details flow
- [HMRC-36](#hmrc-36-provide-itsa-behaviour-test-step-helpers) Provide ITSA behaviour-test step helpers
- [HMRC-37](#hmrc-37-plan-the-hmrc-mtd-vat-and-itsa-rollout) Plan the HMRC MTD VAT and ITSA rollout
<!-- /generated:group hmrc-infrastructure-and-test-tooling-hmrc -->

#### HMRC-31 Wire HMRC Lambda handlers into CDK stacks

- **Use when:** a new or changed HMRC Lambda needs its CDK function, props and log group declared.
- **Does:** HmrcStack.java declares the VAT endpoints, token exchange, receipts and most self-employment/BSAS/calculation/final-declaration ITSA Lambdas. HmrcItsaStack.java declares UK property, losses and claims, and tax liability adjustments Lambdas.
- **Run:** `./mvnw clean verify`
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/HmrcStack.java:HmrcStack`; `infra/main/java/co/uk/diyaccounting/submit/stacks/HmrcItsaStack.java:HmrcItsaStack`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/HmrcStack.java, infra/main/java/co/uk/diyaccounting/submit/stacks/HmrcItsaStack.java, app/unit-tests/hmrcFunctionsCdkRegistration.test.js
- **Keywords:** cdk stack, lambda wiring, hmrc stack, hmrc itsa stack, log group, java cdk
- **Related:** HMRC-01, HMRC-12

#### HMRC-32 Register and verify HMRC Developer Hub application config

- **Use when:** the sandbox or production HMRC Developer Hub app's API subscriptions must be checked.
- **Does:** hmrc.toml declares the sandbox and production HMRC Developer Hub applications as code: client ids, hosts, redirect URIs and API subscriptions. hmrc-assert.js probes each subscription and treats a 403 RESOURCE_FORBIDDEN as a build failure.
- **Run:** `node infra/hmrc/hmrc-assert.js --environment ci`; `node infra/hmrc/hmrc-assert.js --environment prod`
- **Entry:** `infra/hmrc/hmrc-assert.js:main`; `infra/hmrc/hmrc.toml`
- **Files:** infra/hmrc/hmrc.toml, infra/hmrc/hmrc-assert.js, app/unit-tests/scripts/hmrcAssert.test.js
- **Keywords:** hmrc developer hub, api subscriptions, client id, redirect uri, resource_forbidden, hmrc.toml
- **Related:** HMRC-33, HMRC-23

#### HMRC-33 Drive HMRC's sandbox authorisation flow for test scripts

- **Use when:** a test script needs a user-restricted HMRC sandbox authorisation code with no headless route.
- **Does:** hmrcAuthorizationCode.js's getAuthorizationCode drives HMRC's sandbox /oauth/authorize sign-in page with Playwright. It is shared by the ITSA sandbox scripts and the behaviour suites.
- **Run:** `import { getAuthorizationCode } from "scripts/lib/hmrcAuthorizationCode.js"`
- **Entry:** `scripts/lib/hmrcAuthorizationCode.js:getAuthorizationCode`
- **Files:** scripts/lib/hmrcAuthorizationCode.js
- **Keywords:** oauth authorize, sandbox authorisation, playwright, user-restricted api, authorisation code, headless
- **Related:** HMRC-23, HMRC-34, HMRC-35

#### HMRC-34 File a full ITSA tax year in sandbox

- **Use when:** a whole ITSA tax year must be filed end to end against HMRC's sandbox for one test user.
- **Does:** itsa-sandbox-year.js files an annual submission, a triggered and adjusted BSAS, a calculation and a final declaration for the self-employment business. It also files quarterly updates for both businesses and resets the sandbox's stateful test data via a checkpoint between runs.
- **Run:** `scripts/proxy-secrets.sh node scripts/itsa-sandbox-year.js`
- **Entry:** `scripts/itsa-sandbox-year.js:main`
- **Files:** scripts/itsa-sandbox-year.js, app/unit-tests/scripts/itsa-sandbox-year.test.js
- **Keywords:** itsa sandbox, full tax year, bsas, final declaration, checkpoint, test support api, dated quarters, cumulative model
- **Related:** HMRC-33, HMRC-35, HMRC-16, HMRC-21

#### HMRC-35 Spike-test the ITSA sandbox OAuth and business-details flow

- **Use when:** the sandbox registration, OAuth redirect and fraud-prevention headers need a standalone Business Details proof.
- **Does:** itsa-sandbox-spike.js drives the authorisation code flow, then calls the sandbox Business Details endpoint with buildFraudHeaders.js's headers. It is a standalone harness, not part of any test suite.
- **Run:** `scripts/proxy-secrets.sh node scripts/itsa-sandbox-spike.js`
- **Entry:** `scripts/itsa-sandbox-spike.js:main`
- **Files:** scripts/itsa-sandbox-spike.js
- **Keywords:** itsa sandbox spike, business details, oauth redirect, fraud prevention headers, read:self-assessment, standalone harness
- **Related:** HMRC-33, HMRC-34, HMRC-09

#### HMRC-36 Provide ITSA behaviour-test step helpers

- **Use when:** an ITSA behaviour-test spec needs a shared init, fill, submit or verify step.
- **Does:** behaviour-hmrc-itsa-steps.js exports 46 Playwright step helpers spanning business details, obligations, periods, annual summaries, calculation, final declaration and losses and claims. Eight ITSA behaviour test files share these helpers.
- **Run:** `npm run test:itsaBusinessDetailsBehaviour-proxy`; `npm run test:itsaObligationsBehaviour-proxy`; `npm run test:itsaSelfEmploymentPeriodBehaviour-proxy`; `npm run test:itsaAnnualSubmissionBehaviour-proxy`; `npm run test:itsaUkPropertyPeriodBehaviour-proxy`; `npm run test:itsaUkPropertyAnnualSubmissionBehaviour-proxy`; `npm run test:itsaLossesAndClaimsBehaviour-proxy`; `npm run test:itsaFinalDeclarationBehaviour-proxy`
- **Entry:** `behaviour-tests/steps/behaviour-hmrc-itsa-steps.js`
- **Files:** behaviour-tests/steps/behaviour-hmrc-itsa-steps.js
- **Keywords:** playwright steps, behaviour test helpers, itsa journeys, step definitions, init fill submit verify
- **Related:** HMRC-09, HMRC-12, HMRC-17, HMRC-21

#### HMRC-37 Plan the HMRC MTD VAT and ITSA rollout

- **Use when:** the path to HMRC production approval or the ITSA phase 2 build needs a plan.
- **Does:** mtd-vat-roadmap.agent.md defines a repository agent persona that audits VAT-submission readiness for HMRC production approval. PLAN_ITSA_PHASE_2.md is the operator-approved plan for the ITSA annual submission, BSAS, calculation and final-declaration build.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/agents/mtd-vat-roadmap.agent.md`; `PLAN_ITSA_PHASE_2.md`
- **Files:** .github/agents/mtd-vat-roadmap.agent.md, PLAN_ITSA_PHASE_2.md
- **Keywords:** hmrc production approval, mtd vat roadmap, agent persona, itsa phase 2 plan, gap analysis
- **Related:** HMRC-01, HMRC-21

## Companies House filing (CH)

<!-- generated:area CH -->
- [OAuth and identity](#oauth-and-identity-ch): [CH-01](#ch-01-exchange-a-companies-house-oauth-token) Exchange a Companies House OAuth token · [CH-02](#ch-02-verify-the-companies-house-oauth-app-configuration) Verify the Companies House OAuth app configuration
- [Company search and profile](#company-search-and-profile-ch): [CH-03](#ch-03-search-the-companies-house-register) Search the Companies House register · [CH-04](#ch-04-fetch-a-company-profile) Fetch a company profile
- [Registered office and email](#registered-office-and-email-ch): [CH-05](#ch-05-file-a-change-of-registered-office-address) File a change of registered office address · [CH-06](#ch-06-file-a-change-of-registered-email-address) File a change of registered email address
- [Micro-entity accounts filing](#micro-entity-accounts-filing-ch): [CH-07](#ch-07-preview-micro-entity-accounts-before-filing) Preview micro-entity accounts before filing · [CH-08](#ch-08-file-micro-entity-accounts-to-companies-house) File micro-entity accounts to Companies House
- [Filing infrastructure](#filing-infrastructure-ch): [CH-09](#ch-09-query-and-submit-document-transactions) Query and submit document transactions · [CH-10](#ch-10-fetch-http-with-a-timeout) Fetch HTTP with a timeout · [CH-11](#ch-11-parse-xml-safely) Parse XML safely
- [Test, validation and provisioning](#test-validation-and-provisioning-ch): [CH-12](#ch-12-generate-synthetic-test-companies) Generate synthetic test companies · [CH-13](#ch-13-map-the-frc-ixbrl-taxonomy-and-validate-accounts) Map the FRC iXBRL taxonomy and validate accounts · [CH-14](#ch-14-provision-the-companies-house-cdk-stack) Provision the Companies House CDK stack
<!-- /generated:area CH -->

### OAuth and identity (CH)

<!-- generated:group oauth-and-identity-ch -->
- [CH-01](#ch-01-exchange-a-companies-house-oauth-token) Exchange a Companies House OAuth token
- [CH-02](#ch-02-verify-the-companies-house-oauth-app-configuration) Verify the Companies House OAuth app configuration
<!-- /generated:group oauth-and-identity-ch -->

#### CH-01 Exchange a Companies House OAuth token

- **Use when:** a filing journey has an authorization code and needs an access token for the session.
- **Does:** companiesHouseTokenPost.js exchanges an OAuth authorization code for a Companies House access token. It returns the token, its expiry and its type. It does not store the token server side.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/companies-house/companiesHouseTokenPost.js:ingestHandler`; `web/public/companies-house/filingCallback.html`
- **Files:** app/functions/companies-house/companiesHouseTokenPost.js, app/unit-tests/functions/companiesHouseTokenPost.test.js, web/public/companies-house/filingCallback.html, web/browser-tests/filingCallback.browser.test.js
- **Keywords:** oauth, token exchange, authorization code, companies house, filing callback, session storage, access token, identity
- **Related:** CH-02, CH-09

#### CH-02 Verify the Companies House OAuth app configuration

- **Use when:** checking that a deployed environment's Companies House OAuth app and API key still authorise.
- **Does:** companies-house-assert.js reads companies-house.toml and calls the live Companies House identity and REST endpoints. It confirms the client id and redirect pair authorise without a 400. It confirms the REST API key answers a public-data call and the client id matches the deployed .env.
- **Run:** `node infra/companies-house/companies-house-assert.js --environment ci`; `node infra/companies-house/companies-house-assert.js --environment prod`
- **Entry:** `infra/companies-house/companies-house-assert.js:main`; `infra/companies-house/companies-house.toml`
- **Files:** infra/companies-house/companies-house.toml, infra/companies-house/companies-house-assert.js, app/unit-tests/scripts/companiesHouseAssert.test.js
- **Keywords:** companies house, oauth, assert, developer hub, client id, redirect uri, api key, identity-sandbox, infra-apply
- **Related:** CH-01

### Company search and profile (CH)

<!-- generated:group company-search-and-profile-ch -->
- [CH-03](#ch-03-search-the-companies-house-register) Search the Companies House register
- [CH-04](#ch-04-fetch-a-company-profile) Fetch a company profile
<!-- /generated:group company-search-and-profile-ch -->

#### CH-03 Search the Companies House register

- **Use when:** a user types a company name or number and needs matching results to pick from.
- **Does:** companiesHouseSearchGet.js searches Companies House for companies matching a query term. It validates pagination parameters and returns paginated JSON via companiesHouseHttpGet.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/companies-house/companiesHouseSearchGet.js:ingestHandler`
- **Files:** app/functions/companies-house/companiesHouseSearchGet.js, app/unit-tests/functions/companiesHouseSearchGet.test.js, web/public/companies-house/companySearch.html, web/public/lib/services/companies-house-service.js, web/browser-tests/companySearch.browser.test.js, behaviour-tests/companiesHouse.behaviour.test.js, behaviour-tests/steps/behaviour-companies-house-steps.js
- **Keywords:** companies house, search, typeahead, company search, register, pagination, GET /api/v1/companies-house/search
- **Related:** CH-04

#### CH-04 Fetch a company profile

- **Use when:** a filing journey has a company number and needs the company's registered details.
- **Does:** companiesHouseCompanyGet.js fetches a single company's details via getCompanyProfile. It enforces the caller's bundle entitlement and returns the profile as JSON.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/companies-house/companiesHouseCompanyGet.js:ingestHandler`; `app/functions/companies-house/companiesHouseCompanyGet.js:getCompanyProfile`
- **Files:** app/functions/companies-house/companiesHouseCompanyGet.js, app/unit-tests/functions/companiesHouseCompanyGet.test.js, app/services/companiesHouseApi.js
- **Keywords:** companies house, company profile, company number, bundle entitlement, GET /api/v1/companies-house/company
- **Related:** CH-03

### Registered office and email (CH)

<!-- generated:group registered-office-and-email-ch -->
- [CH-05](#ch-05-file-a-change-of-registered-office-address) File a change of registered office address
- [CH-06](#ch-06-file-a-change-of-registered-email-address) File a change of registered email address
<!-- /generated:group registered-office-and-email-ch -->

#### CH-05 File a change of registered office address

- **Use when:** a company needs to change its registered office address on the public register.
- **Does:** companiesHouseRegisteredOfficeAddressGet.js retrieves the current registered office address. companiesHouseRegisteredOfficeAddressPost.js validates a new address, builds the XML submission and files it via putRegisteredOfficeAddress.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/companies-house/companiesHouseRegisteredOfficeAddressGet.js:ingestHandler`; `app/functions/companies-house/companiesHouseRegisteredOfficeAddressPost.js:ingestHandler`
- **Files:** app/functions/companies-house/companiesHouseRegisteredOfficeAddressGet.js, app/functions/companies-house/companiesHouseRegisteredOfficeAddressPost.js, app/unit-tests/functions/companiesHouseRegisteredOfficeAddressGet.test.js, app/unit-tests/functions/companiesHouseRegisteredOfficeAddressPost.test.js, web/public/companies-house/changeRegisteredOffice.html, web/browser-tests/changeRegisteredOffice.browser.test.js, behaviour-tests/changeRegisteredOffice.behaviour.test.js
- **Keywords:** companies house, registered office, change of address, filing, transaction, XML submission
- **Related:** CH-06, CH-09

#### CH-06 File a change of registered email address

- **Use when:** a company needs to register or change its registered email address with Companies House.
- **Does:** companiesHouseRegisteredEmailEligibilityGet.js checks whether a company is eligible for email registration. companiesHouseRegisteredEmailAddressPost.js validates and files a new registered email address via putRegisteredEmailAddress.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/companies-house/companiesHouseRegisteredEmailEligibilityGet.js:ingestHandler`; `app/functions/companies-house/companiesHouseRegisteredEmailAddressPost.js:ingestHandler`
- **Files:** app/functions/companies-house/companiesHouseRegisteredEmailEligibilityGet.js, app/functions/companies-house/companiesHouseRegisteredEmailAddressPost.js, app/unit-tests/functions/companiesHouseRegisteredEmailEligibilityGet.test.js, app/unit-tests/functions/companiesHouseRegisteredEmailAddressPost.test.js, web/public/companies-house/changeRegisteredEmail.html, behaviour-tests/changeRegisteredEmail.behaviour.test.js, behaviour-tests/steps/behaviour-companies-house-accounts-steps.js
- **Keywords:** companies house, registered email, eligibility, change of email, filing, transaction
- **Related:** CH-05, CH-09

### Micro-entity accounts filing (CH)

<!-- generated:group micro-entity-accounts-filing-ch -->
- [CH-07](#ch-07-preview-micro-entity-accounts-before-filing) Preview micro-entity accounts before filing
- [CH-08](#ch-08-file-micro-entity-accounts-to-companies-house) File micro-entity accounts to Companies House
<!-- /generated:group micro-entity-accounts-filing-ch -->

#### CH-07 Preview micro-entity accounts before filing

- **Use when:** a user needs to see the iXBRL accounts document before it reaches the XML Gateway.
- **Does:** companiesHouseAccountsPreviewPost.js renders FRS 105 micro-entity iXBRL from the entered balance sheet, using buildMicroEntityAccounts. It never calls the Companies House XML Gateway.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/companies-house/companiesHouseAccountsPreviewPost.js:ingestHandler`
- **Files:** app/functions/companies-house/companiesHouseAccountsPreviewPost.js, app/unit-tests/functions/companiesHouseAccountsPreviewPost.test.js
- **Keywords:** companies house, micro-entity accounts, FRS 105, ixbrl, preview, balance sheet
- **Related:** CH-08, CH-13

#### CH-08 File micro-entity accounts to Companies House

- **Use when:** a small company must submit its FRS 105 micro-entity accounts to the XML Gateway.
- **Does:** companiesHouseAccountsPost.js builds the XML submission via buildAccountsSubmissionRequest, submits it via postToGateway, and stores the async request in DynamoDB. companiesHouseAccountsGet.js polls that stored request for the filing's status.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/companies-house/companiesHouseAccountsPost.js:ingestHandler`; `app/functions/companies-house/companiesHouseAccountsGet.js:ingestHandler`
- **Files:** app/functions/companies-house/companiesHouseAccountsPost.js, app/functions/companies-house/companiesHouseAccountsGet.js, app/unit-tests/functions/companiesHouseAccountsPost.test.js, app/unit-tests/functions/companiesHouseAccountsGet.test.js, app/services/microEntityAccountsIxbrl.js, app/unit-tests/services/microEntityAccountsIxbrl.test.js, app/services/companiesHouseXmlGateway.js, app/unit-tests/services/companiesHouseXmlGateway.test.js, web/public/companies-house/fileMicroEntityAccounts.html, web/public/lib/services/companies-house-filing-service.js, behaviour-tests/companiesHouse/fileMicroEntityAccounts.behaviour.test.js, behaviour-tests/steps/behaviour-companies-house-filing-steps.js, app/unit-tests/http-simulator/routes/companies-house-xmlgw.test.js, app/system-tests/companiesHouseFilingSimulator.system.test.js, app/system-tests/companiesHouseSimulator.system.test.js, PLAN_COMPANIES_HOUSE_ACCOUNTS_FILING.md
- **Keywords:** companies house, micro-entity accounts, ixbrl, xml gateway, govtalk, async request, dynamodb, filing, presenter credential
- **Related:** CH-07, CH-09, CH-11, CH-12, CH-13

### Filing infrastructure (CH)

<!-- generated:group filing-infrastructure-ch -->
- [CH-09](#ch-09-query-and-submit-document-transactions) Query and submit document transactions
- [CH-10](#ch-10-fetch-http-with-a-timeout) Fetch HTTP with a timeout
- [CH-11](#ch-11-parse-xml-safely) Parse XML safely
<!-- /generated:group filing-infrastructure-ch -->

#### CH-09 Query and submit document transactions

- **Use when:** a filing (office address, email address, accounts) needs a Companies House transaction created, read or updated.
- **Does:** companiesHouseTransactionGet.js, companiesHouseTransactionPost.js and companiesHouseTransactionPut.js each call companiesHouseFilingRequest with GET, POST or PUT. companiesHouseFilingApi.js resolves the filing and identity base URLs and the presenter client secret. It is a separate client from companiesHouseApi.js, which serves search and company-profile lookups.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/companies-house/companiesHouseTransactionGet.js:ingestHandler`; `app/functions/companies-house/companiesHouseTransactionPost.js:ingestHandler`; `app/services/companiesHouseFilingApi.js:companiesHouseFilingRequest`
- **Files:** app/functions/companies-house/companiesHouseTransactionGet.js, app/functions/companies-house/companiesHouseTransactionPost.js, app/functions/companies-house/companiesHouseTransactionPut.js, app/unit-tests/functions/companiesHouseTransactionGet.test.js, app/unit-tests/functions/companiesHouseTransactionPost.test.js, app/unit-tests/functions/companiesHouseTransactionPut.test.js, app/services/companiesHouseFilingApi.js, app/unit-tests/services/companiesHouseFilingApi.test.js
- **Keywords:** companies house, transaction, filing api, document submission, presenter secret, identity base url, filing base url
- **Related:** CH-05, CH-06, CH-08

#### CH-10 Fetch HTTP with a timeout

- **Use when:** any outbound Companies House API call needs a bounded wait instead of hanging.
- **Does:** httpFetch.js wraps the native fetch function with a configurable timeout. Every Companies House API, filing and XML Gateway service uses it for outbound calls.
- **Run:** no command; see Does and Entry
- **Entry:** `app/lib/httpFetch.js:fetchWithTimeout`; `app/lib/httpFetch.js:fetchJsonWithTimeout`
- **Files:** app/lib/httpFetch.js
- **Keywords:** fetch, timeout, http client, companies house, outbound call, abort
- **Related:** CH-11

#### CH-11 Parse XML safely

- **Use when:** code must build or read XML Gateway GovTalk envelopes without XML injection risk.
- **Does:** xmlDom.js wraps the xmldom library with guards against XXE and billion-laughs attacks. The XML Gateway client uses it to build and read GovTalk envelopes.
- **Run:** no command; see Does and Entry
- **Entry:** `app/lib/xmlDom.js:parseXmlDocument`
- **Files:** app/lib/xmlDom.js
- **Keywords:** xml, xxe, billion laughs, govtalk, xml gateway, xmldom, safe parsing
- **Related:** CH-08, CH-10

### Test, validation and provisioning (CH)

<!-- generated:group test-validation-and-provisioning-ch -->
- [CH-12](#ch-12-generate-synthetic-test-companies) Generate synthetic test companies
- [CH-13](#ch-13-map-the-frc-ixbrl-taxonomy-and-validate-accounts) Map the FRC iXBRL taxonomy and validate accounts
- [CH-14](#ch-14-provision-the-companies-house-cdk-stack) Provision the Companies House CDK stack
<!-- /generated:group test-validation-and-provisioning-ch -->

#### CH-12 Generate synthetic test companies

- **Use when:** a test needs a real-shaped Companies House test company without a live entity.
- **Does:** companies-house-test-company.js generates a synthetic test company with a company number, name and address. It is used against the http-simulator and in behaviour tests.
- **Run:** `node scripts/companies-house-test-company.js`; `node scripts/companies-house-test-company.js --delete <companyNumber> <authCode>`
- **Entry:** `scripts/companies-house-test-company.js:createTestCompany`; `scripts/companies-house-test-company.js:deleteTestCompany`
- **Files:** scripts/companies-house-test-company.js
- **Keywords:** companies house, test company, synthetic data, http-simulator, behaviour test, fixtures
- **Related:** CH-13

#### CH-13 Map the FRC iXBRL taxonomy and validate accounts

- **Use when:** the FRS 102/105 taxonomy fixture needs refreshing, or a generated iXBRL document needs checking against Companies House's validator.
- **Does:** generate-frc-taxonomy-concepts.js fetches the FRS 102 entry-point schema from the FRC taxonomy site and writes the flat concept-name list to fixtures/frc-taxonomy/frs-102-2026-concepts.json. loadFrcTaxonomyConcepts loads and caches that list for the iXBRL generator to check every emitted concept against. validate-accounts-ixbrl.js posts a generated micro-entity iXBRL document to Companies House's public XBRL test validator over the network.
- **Run:** `node scripts/generate-frc-taxonomy-concepts.js`; `npm run validate:accounts-ixbrl`; `node scripts/validate-accounts-ixbrl.js <path-to-ixbrl-file>`
- **Entry:** `scripts/generate-frc-taxonomy-concepts.js:main`; `scripts/validate-accounts-ixbrl.js:main`; `app/services/microEntityAccountsIxbrl.js:loadFrcTaxonomyConcepts`
- **Files:** scripts/generate-frc-taxonomy-concepts.js, scripts/validate-accounts-ixbrl.js
- **Keywords:** frc taxonomy, frs 102, frs 105, ixbrl, concepts fixture, xbrl validator, companies house, taxonomy schema
- **Related:** CH-08, CH-07

#### CH-14 Provision the Companies House CDK stack

- **Use when:** adding, renaming or rewiring a Companies House Lambda function or its API Gateway route.
- **Does:** CompaniesHouseStack.java creates all thirteen Companies House Lambda functions as ApiLambda origins. It wires each function's API Gateway route.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/CompaniesHouseStack.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/CompaniesHouseStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/CompaniesHouseStackTest.java
- **Keywords:** cdk, companies house, lambda, api gateway, infrastructure, stack, ApiLambda
- **Related:** CH-08, CH-09

## Billing and entitlements (BILL)

<!-- generated:area BILL -->
- [Bundle grants and entitlements](#bundle-grants-and-entitlements-bill): [BILL-01](#bill-01-grant-a-bundle-to-a-user) Grant a bundle to a user · [BILL-02](#bill-02-list-a-users-bundles-and-token-balance) List a user's bundles and token balance · [BILL-03](#bill-03-delete-a-bundle) Delete a bundle · [BILL-04](#bill-04-enforce-bundle-entitlement-on-a-request) Enforce bundle entitlement on a request · [BILL-05](#bill-05-reconcile-bundle-capacity-counters) Reconcile bundle capacity counters
- [Passes](#passes-bill): [BILL-06](#bill-06-generate-a-token-charged-pass) Generate a token-charged pass · [BILL-07](#bill-07-admin-issue-a-pass) Admin-issue a pass · [BILL-08](#bill-08-check-a-passs-validity) Check a pass's validity · [BILL-09](#bill-09-list-a-users-issued-passes) List a user's issued passes · [BILL-10](#bill-10-redeem-a-pass) Redeem a pass · [BILL-11](#bill-11-generate-admin-passes-from-cli-or-workflow) Generate admin passes from CLI or workflow
- [Practice clients and HMRC authorisation](#practice-clients-and-hmrc-authorisation-bill): [BILL-12](#bill-12-invite-a-client-to-authorise-agent-access) Invite a client to authorise agent access · [BILL-13](#bill-13-check-a-clients-authorisation-status) Check a client's authorisation status · [BILL-14](#bill-14-cancel-a-pending-client-authorisation-invite) Cancel a pending client authorisation invite · [BILL-15](#bill-15-move-a-book-to-a-client) Move a book to a client · [BILL-16](#bill-16-manage-practice-clients) Manage practice clients
- [diya-gl ledger books](#diya-gl-ledger-books-bill): [BILL-17](#bill-17-upload-a-diya-gl-book) Upload a diya-gl book · [BILL-18](#bill-18-delete-a-diya-gl-book) Delete a diya-gl book · [BILL-19](#bill-19-list-a-users-diya-gl-books) List a user's diya-gl books · [BILL-20](#bill-20-fetch-a-versioned-diya-gl-book) Fetch a versioned diya-gl book · [BILL-21](#bill-21-sweep-lapsed-diya-gl-books) Sweep lapsed diya-gl books · [BILL-22](#bill-22-check-diya-gl-retention-entitlement) Check diya-gl retention entitlement · [BILL-23](#bill-23-store-diya-gl-books-in-s3) Store diya-gl books in S3
- [Stripe billing](#stripe-billing-bill): [BILL-24](#bill-24-create-a-stripe-checkout-session) Create a Stripe checkout session · [BILL-25](#bill-25-retrieve-a-stripe-checkout-sessions-status) Retrieve a Stripe checkout session's status · [BILL-26](#bill-26-open-the-stripe-customer-billing-portal) Open the Stripe customer billing portal · [BILL-27](#bill-27-recover-an-abandoned-checkout) Recover an abandoned checkout · [BILL-28](#bill-28-process-stripe-webhook-events) Process Stripe webhook events · [BILL-29](#bill-29-assert-the-paypal-donate-button-configuration) Assert the PayPal donate button configuration · [BILL-30](#bill-30-sync-the-stripe-productprice-catalogue) Sync the Stripe product/price catalogue · [BILL-31](#bill-31-configure-stripe-account-policies) Configure Stripe account policies · [BILL-32](#bill-32-provision-stripe-secrets) Provision Stripe secrets
- [Tokens and catalogue](#tokens-and-catalogue-bill): [BILL-33](#bill-33-enforce-and-consume-activity-tokens) Enforce and consume activity tokens · [BILL-34](#bill-34-prefetch-and-retry-a-cognito-token-refresh) Prefetch and retry a Cognito token refresh · [BILL-35](#bill-35-load-and-query-the-productactivity-catalogue) Load and query the product/activity catalogue
- [CDK infrastructure](#cdk-infrastructure-bill): [BILL-36](#bill-36-cdk-account-stack) CDK: account stack · [BILL-37](#bill-37-cdk-billing-app-stack) CDK: billing app stack · [BILL-38](#bill-38-cdk-billing-webhook-stack) CDK: billing webhook stack · [BILL-39](#bill-39-cdk-diya-gl-stack) CDK: diya-gl stack
- [Migrations and shared utilities](#migrations-and-shared-utilities-bill): [BILL-40](#bill-40-migrate-the-hashed-sub-salt) Migrate the hashed-sub salt · [BILL-41](#bill-41-backfill-the-stripe-test-mode-qualifier) Backfill the Stripe test-mode qualifier · [BILL-42](#bill-42-parse-iso-8601-durations-for-expiry) Parse ISO 8601 durations for expiry · [BILL-43](#bill-43-build-the-frontend-test-bundle) Build the frontend test bundle · [BILL-44](#bill-44-document-the-price-update-project) Document the price-update project
<!-- /generated:area BILL -->

### Bundle grants and entitlements (BILL)

<!-- generated:group bundle-grants-and-entitlements-bill -->
- [BILL-01](#bill-01-grant-a-bundle-to-a-user) Grant a bundle to a user
- [BILL-02](#bill-02-list-a-users-bundles-and-token-balance) List a user's bundles and token balance
- [BILL-03](#bill-03-delete-a-bundle) Delete a bundle
- [BILL-04](#bill-04-enforce-bundle-entitlement-on-a-request) Enforce bundle entitlement on a request
- [BILL-05](#bill-05-reconcile-bundle-capacity-counters) Reconcile bundle capacity counters
<!-- /generated:group bundle-grants-and-entitlements-bill -->

#### BILL-01 Grant a bundle to a user

- **Use when:** a user must receive a catalogue bundle, by API or by an ops shortcut script.
- **Does:** The bundlePost.js ingestHandler checks the bundle against the catalogue qualifiers. It enforces the bundle capacity cap with an atomic DynamoDB counter, deletes any allocation, and writes the new bundle record. scripts/add-bundle.sh writes a bundle record directly to DynamoDB, bypassing the API.
- **Run:** `POST /api/v1/bundle`; `scripts/add-bundle.sh <hashed-sub> <bundle-id> [environment]`
- **Entry:** `app/functions/account/bundlePost.js:ingestHandler`; `app/functions/account/bundlePost.js:grantBundle`
- **Files:** app/functions/account/bundlePost.js, app/unit-tests/functions/bundlePost.handler.test.js, app/system-tests/bundlePost.system.test.js, app/system-tests/accountBundles.system.test.js, app/system-tests/bundleManagement.journeys.system.test.js, app/system-tests/dynamoDbBundleStore.system.test.js, app/data/dynamoDbBundleRepository.js, app/unit-tests/data/dynamoDbBundleRepository.putBundle.test.js, scripts/add-bundle.sh, behaviour-tests/bundles.behaviour.test.js, behaviour-tests/steps/behaviour-bundle-steps.js, web/browser-tests/bundles.filtering.browser.test.js, web/browser-tests/bundles.mobileSubscription.browser.test.js, web/browser-tests/bundles.restrictedPass.browser.test.js, web/browser-tests/bundles.subscription.browser.test.js, web/public/bundles.html, web/public/lib/bundle-cache.js, web/unit-tests/bundle-cache.test.js, web/public/prefetch/prefetch-bundle-head.js
- **Keywords:** bundle, grant, entitlement, subscription, capacity cap, allocation, add-bundle, grantBundle
- **Related:** BILL-02, BILL-03, BILL-04, BILL-05

#### BILL-02 List a user's bundles and token balance

- **Use when:** a page or check must show a user's allocated and available bundles with remaining tokens.
- **Does:** The bundleGet.js retrieveUserBundles function returns allocated bundles plus unallocated catalogue bundles. It refreshes any bundle whose token window elapsed. It folds in the operator bundle for listed operator emails and reports capacity.
- **Run:** `GET /api/v1/bundle`
- **Entry:** `app/functions/account/bundleGet.js:retrieveUserBundles`; `app/functions/account/bundleGet.js:ingestHandler`
- **Files:** app/functions/account/bundleGet.js, app/unit-tests/functions/bundleGet.handler.test.js, app/system-tests/bundleCapacity.system.test.js, app/data/dynamoDbCapacityRepository.js
- **Keywords:** bundle, list bundles, token balance, capacity, burst counter, operator bundle, retrieveUserBundles
- **Related:** BILL-01, BILL-05

#### BILL-03 Delete a bundle

- **Use when:** one bundle must be removed from a user's allocation.
- **Does:** The bundleDelete.js ingestHandler removes one bundle from a user's allocation. It calls bundleManagement.js's updateUserBundles over the same async path bundlePost.js uses.
- **Run:** `DELETE /api/v1/bundle`; `DELETE /api/v1/bundle/:id`
- **Entry:** `app/functions/account/bundleDelete.js:ingestHandler`; `app/functions/account/bundleDelete.js:deleteUserBundle`
- **Files:** app/functions/account/bundleDelete.js, app/unit-tests/functions/bundleDelete.handler.test.js
- **Keywords:** bundle, delete bundle, remove bundle, unassign, updateUserBundles
- **Related:** BILL-01, BILL-04

#### BILL-04 Enforce bundle entitlement on a request

- **Use when:** an endpoint must reject a caller who lacks the bundle an activity requires.
- **Does:** The bundleManagement.js enforceBundles function matches the request path against the catalogue's activities. It computes the required bundles and throws BundleEntitlementError or BundleAuthorizationError unless the caller holds one. A client-scoped request also requires the practice's own active resident-pro subscription; addBundles, removeBundles and updateUserBundles are the shared bundle-list mutators.
- **Run:** `import { enforceBundles, addBundles, removeBundles, updateUserBundles } from "app/services/bundleManagement.js"`
- **Entry:** `app/services/bundleManagement.js:enforceBundles`; `app/services/bundleManagement.js:updateUserBundles`
- **Files:** app/services/bundleManagement.js, app/unit-tests/services/bundleManagement.test.js, app/system-tests/bundleManagement.system.test.js, app/lib/operators.js, app/unit-tests/lib/operators.test.js
- **Keywords:** entitlement, enforce bundle, authorization, authorisation, operator match, resident-pro, BundleEntitlementError
- **Related:** BILL-01, BILL-03, BILL-35

#### BILL-05 Reconcile bundle capacity counters

- **Use when:** a capacity counter may have drifted from the true count of active allocations.
- **Does:** The bundleCapacityReconcile.js handler runs hourly on a schedule. It recounts active, non-expired allocations per capped bundle with countActiveAllocations. It overwrites the capacity counter table to correct drift.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/account/bundleCapacityReconcile.js:handler`
- **Files:** app/functions/account/bundleCapacityReconcile.js, app/unit-tests/functions/bundleCapacityReconcile.test.js, app/system-tests/bundleCapacityReconcile.system.test.js, app/unit-tests/data/dynamoDbBundleRepository.countActiveAllocations.test.js
- **Keywords:** reconcile, capacity counter, drift, scheduled lambda, countActiveAllocations, hourly
- **Related:** BILL-01, BILL-02

### Passes (BILL)

<!-- generated:group passes-bill -->
- [BILL-06](#bill-06-generate-a-token-charged-pass) Generate a token-charged pass
- [BILL-07](#bill-07-admin-issue-a-pass) Admin-issue a pass
- [BILL-08](#bill-08-check-a-passs-validity) Check a pass's validity
- [BILL-09](#bill-09-list-a-users-issued-passes) List a user's issued passes
- [BILL-10](#bill-10-redeem-a-pass) Redeem a pass
- [BILL-11](#bill-11-generate-admin-passes-from-cli-or-workflow) Generate admin passes from CLI or workflow
<!-- /generated:group passes-bill -->

#### BILL-06 Generate a token-charged pass

- **Use when:** a signed-in user pays tokens to generate a digital or physical pass.
- **Does:** The passGeneratePost.js ingestHandler charges the caller's tokens via tokenEnforcement.consumeTokenForActivity. It then creates a pass through passService.createPass. app/lib/qrCodeGenerator.js renders the pass's redemption URL as a QR code.
- **Run:** `POST /api/v1/pass/generate`
- **Entry:** `app/functions/account/passGeneratePost.js:ingestHandler`
- **Files:** app/functions/account/passGeneratePost.js, app/unit-tests/functions/passGeneratePost.test.js, web/public/passes/generate-digital.html, web/public/passes/generate-physical.html, behaviour-tests/generatePassActivity.behaviour.test.js, behaviour-tests/steps/behaviour-pass-generation-steps.js, app/lib/qrCodeGenerator.js, app/unit-tests/lib/qrCodeGenerator.test.js, docs/QR_CODE_GENERATION.md, app/system-tests/qrCodeGeneration.system.test.js
- **Keywords:** pass, generate pass, qr code, token charge, digital pass, physical pass, createPass
- **Related:** BILL-07, BILL-10, BILL-35

#### BILL-07 Admin-issue a pass

- **Use when:** an operator or admin must create a pass of any catalogue type with no token charge.
- **Does:** The passAdminPost.js ingestHandler creates a pass directly via passService.createPass. It accepts caller-supplied validity, max uses, email restriction and notes, with no token charge.
- **Run:** `POST /api/v1/pass/admin`
- **Entry:** `app/functions/account/passAdminPost.js:ingestHandler`
- **Files:** app/functions/account/passAdminPost.js
- **Keywords:** pass, admin pass, issue pass, operator, createPass, no charge
- **Related:** BILL-06, BILL-11

#### BILL-08 Check a pass's validity

- **Use when:** a pass code must be checked before login, without consuming a use.
- **Does:** The passGet.js ingestHandler calls passService.checkPass to report whether a code is valid. For an email-restricted pass with no email supplied, it reports valid but email-restricted, and does not increment the use count.
- **Run:** `GET /api/v1/pass`
- **Entry:** `app/functions/account/passGet.js:ingestHandler`
- **Files:** app/functions/account/passGet.js
- **Keywords:** pass, check pass, validity, pre-login, checkPass, email restricted
- **Related:** BILL-10

#### BILL-09 List a user's issued passes

- **Use when:** a page must show up to 50 passes a caller has issued.
- **Does:** The passMyPassesGet.js ingestHandler returns up to 50 passes the caller's hashed sub issued. It reads them via dynamoDbPassRepository.getPassesByIssuer and maps them to a public-safe shape.
- **Run:** `GET /api/v1/pass/my-passes`
- **Entry:** `app/functions/account/passMyPassesGet.js:ingestHandler`
- **Files:** app/functions/account/passMyPassesGet.js, app/unit-tests/functions/passMyPassesGet.test.js, app/unit-tests/data/dynamoDbPassRepository.getPassesByIssuer.test.js
- **Keywords:** pass, my passes, issued passes, list passes, getPassesByIssuer
- **Related:** BILL-06, BILL-07

#### BILL-10 Redeem a pass

- **Use when:** a code must be redeemed to grant its bundle, including a pass link with a ?pass= parameter.
- **Does:** The passPost.js ingestHandler redeems a code via passService.redeemPass, then grants the pass's bundle through bundlePost.js's grantBundle, skipping the capacity cap. A bundle marked on-pass-on-subscription reports valid but not yet redeemed, requiring a Stripe subscription first. web/public/widgets/pass-redeemer.js auto-redeems a ?pass= query parameter on any page that includes it.
- **Run:** `POST /api/v1/pass`
- **Entry:** `app/functions/account/passPost.js:ingestHandler`; `app/services/passService.js:redeemPass`
- **Files:** app/functions/account/passPost.js, app/unit-tests/functions/passPost.test.js, app/system-tests/passRedemption.system.test.js, behaviour-tests/passRedemption.behaviour.test.js, web/browser-tests/passRedeemer.browser.test.js, web/public/widgets/pass-redeemer.js, app/services/passService.js, app/unit-tests/services/passService.test.js, app/unit-tests/services/passServiceEmailHashRotation.test.js, app/unit-tests/services/passServiceEmailHashSecret.test.js, app/lib/passphrase.js, app/unit-tests/lib/passphrase.test.js, app/lib/emailHash.js, app/unit-tests/lib/emailHash.test.js, app/data/dynamoDbPassRepository.js, infra/main/resources/analytics/views/v_pass_redemptions_daily.sql, PASSES.md, submit.passes.toml
- **Keywords:** pass, redeem pass, redeemPass, pass link, on-pass-on-subscription, passphrase, email hash
- **Related:** BILL-01, BILL-06, BILL-08

#### BILL-11 Generate admin passes from CLI or workflow

- **Use when:** an operator needs one or more passes with QR codes, or a scripted equivalent with no QR output.
- **Does:** The generate-pass.yml workflow reads a pass type's defaults from submit.passes.toml and runs scripts/generate-pass-with-qr.js. That script creates passes with QR codes and can provision an HMRC sandbox or Cognito test user. scripts/generate-pass.js is the local CLI equivalent with no QR output.
- **Run:** `gh workflow run generate-pass.yml -f pass-type=<type> -f environment=<ci|prod>`; `node scripts/generate-pass.js <pass-type> <environment> [--email E] [--max-uses N] [--validity-period P7D] [--quantity N] [--notes T]`; `node scripts/generate-pass-with-qr.js`
- **Entry:** `.github/workflows/generate-pass.yml`; `scripts/generate-pass.js`; `scripts/generate-pass-with-qr.js`
- **Files:** .github/workflows/generate-pass.yml, scripts/generate-pass.js, scripts/generate-pass-with-qr.js
- **Keywords:** pass, generate pass, workflow_dispatch, qr code, cli, operator, hmrc sandbox user, cognito test user
- **Related:** BILL-06, BILL-07

### Practice clients and HMRC authorisation (BILL)

<!-- generated:group practice-clients-and-hmrc-authorisation-bill -->
- [BILL-12](#bill-12-invite-a-client-to-authorise-agent-access) Invite a client to authorise agent access
- [BILL-13](#bill-13-check-a-clients-authorisation-status) Check a client's authorisation status
- [BILL-14](#bill-14-cancel-a-pending-client-authorisation-invite) Cancel a pending client authorisation invite
- [BILL-15](#bill-15-move-a-book-to-a-client) Move a book to a client
- [BILL-16](#bill-16-manage-practice-clients) Manage practice clients
<!-- /generated:group practice-clients-and-hmrc-authorisation-bill -->

#### BILL-12 Invite a client to authorise agent access

- **Use when:** a practice must ask a client to authorise HMRC agent access for MTD-VAT or MTD-IT.
- **Does:** The practiceClientAuthorisationInvitePost.js ingestHandler creates an HMRC agent-authorisation invitation via hmrcAgentAuthorisation.createInvitation for one HMRC service. It stores the invitation id on the client record.
- **Run:** `POST /api/v1/practice/clients/:clientId/authorisation/invitations`
- **Entry:** `app/functions/practice/practiceClientAuthorisationInvitePost.js:ingestHandler`; `app/lib/hmrcAgentAuthorisation.js:createInvitation`
- **Files:** app/functions/practice/practiceClientAuthorisationInvitePost.js, app/unit-tests/functions/practiceClientAuthorisationInvitePost.test.js
- **Keywords:** practice, client, hmrc, agent authorisation, invitation, mtd-vat, mtd-it, createInvitation
- **Related:** BILL-13, BILL-14

#### BILL-13 Check a client's authorisation status

- **Use when:** a page or job must know whether a client's HMRC agent authorisation is pending or granted.
- **Does:** The practiceClientAuthorisationGet.js ingestHandler re-reads a pending invitation's status from HMRC. Once no invitation is pending, it checks HMRC's relationships endpoint for an existing authority. It caches the resulting status on the client record.
- **Run:** `GET /api/v1/practice/clients/:clientId/authorisation`
- **Entry:** `app/functions/practice/practiceClientAuthorisationGet.js:ingestHandler`
- **Files:** app/functions/practice/practiceClientAuthorisationGet.js, app/unit-tests/functions/practiceClientAuthorisationGet.test.js
- **Keywords:** practice, client, hmrc, authorisation status, relationships endpoint, cached status
- **Related:** BILL-12, BILL-14

#### BILL-14 Cancel a pending client authorisation invite

- **Use when:** a practice's HMRC invitation to a client must be withdrawn before it is accepted.
- **Does:** The practiceClientAuthorisationInviteDelete.js ingestHandler cancels a client's pending HMRC invitation. It never touches an already-accepted relationship, only an invitation still held on the client row.
- **Run:** `DELETE /api/v1/practice/clients/:clientId/authorisation/invitations`
- **Entry:** `app/functions/practice/practiceClientAuthorisationInviteDelete.js:ingestHandler`
- **Files:** app/functions/practice/practiceClientAuthorisationInviteDelete.js, app/unit-tests/functions/practiceClientAuthorisationInviteDelete.test.js
- **Keywords:** practice, client, hmrc, cancel invitation, withdraw invite, pending
- **Related:** BILL-12, BILL-13

#### BILL-15 Move a book to a client

- **Use when:** a practice must transfer one of its own diya-gl books to a named client's book set.
- **Does:** The practiceClientBookMovePost.js ingestHandler transfers a practice's own diya-gl book to a client's book set via s3DiyaGlRepository.moveBookToClient. It refuses a book already under a client or a destination that already exists.
- **Run:** `POST /api/v1/practice/clients/:clientId/books/:bookId/move`
- **Entry:** `app/functions/practice/practiceClientBookMovePost.js:ingestHandler`; `app/data/s3DiyaGlRepository.js:moveBookToClient`
- **Files:** app/functions/practice/practiceClientBookMovePost.js, app/unit-tests/functions/practiceClientBookMovePost.test.js
- **Keywords:** practice, client, diya-gl, move book, book ownership, moveBookToClient
- **Related:** BILL-16, BILL-23

#### BILL-16 Manage practice clients

- **Use when:** a practice's client roster must be created, read, archived or listed.
- **Does:** The practiceClientsPost.js, practiceClientGet.js, practiceClientDelete.js and practiceClientsListGet.js handlers create, read, archive-delete and list a practice's clients against dynamoDbPracticeClientRepository.js. web/public/practice.js renders the roster with HMRC authorisation status and invitation controls on practice.html.
- **Run:** `POST /api/v1/practice/clients`; `GET /api/v1/practice/clients/:clientId`; `DELETE /api/v1/practice/clients/:clientId`; `GET /api/v1/practice/clients`
- **Entry:** `app/functions/practice/practiceClientsPost.js:ingestHandler`; `app/functions/practice/practiceClientsListGet.js:ingestHandler`; `app/data/dynamoDbPracticeClientRepository.js:createClient`
- **Files:** app/functions/practice/practiceClientsPost.js, app/functions/practice/practiceClientGet.js, app/functions/practice/practiceClientDelete.js, app/functions/practice/practiceClientsListGet.js, app/unit-tests/functions/practiceClientsPost.test.js, app/unit-tests/functions/practiceClientGet.test.js, app/unit-tests/functions/practiceClientDelete.test.js, app/unit-tests/functions/practiceClientsListGet.test.js, app/data/dynamoDbPracticeClientRepository.js, app/unit-tests/data/dynamoDbPracticeClientRepository.test.js, web/public/practice.html, web/public/practice.js, web/browser-tests/practice.browser.test.js, behaviour-tests/practiceLicence.behaviour.test.js
- **Keywords:** practice, client roster, crud, archive client, list clients, practice.html
- **Related:** BILL-12, BILL-13, BILL-14, BILL-15

### diya-gl ledger books (BILL)

<!-- generated:group diya-gl-ledger-books-bill -->
- [BILL-17](#bill-17-upload-a-diya-gl-book) Upload a diya-gl book
- [BILL-18](#bill-18-delete-a-diya-gl-book) Delete a diya-gl book
- [BILL-19](#bill-19-list-a-users-diya-gl-books) List a user's diya-gl books
- [BILL-20](#bill-20-fetch-a-versioned-diya-gl-book) Fetch a versioned diya-gl book
- [BILL-21](#bill-21-sweep-lapsed-diya-gl-books) Sweep lapsed diya-gl books
- [BILL-22](#bill-22-check-diya-gl-retention-entitlement) Check diya-gl retention entitlement
- [BILL-23](#bill-23-store-diya-gl-books-in-s3) Store diya-gl books in S3
<!-- /generated:group diya-gl-ledger-books-bill -->

#### BILL-17 Upload a diya-gl book

- **Use when:** a ledger package must be validated and stored as a versioned diya-gl book.
- **Does:** The diyaGlPut.js ingestHandler validates a ledger package's product id and provenance fields. It uses zipMembers.js's isDiyaGlPackage to check the upload is a well-formed zip carrying the expected members. It checks the caller's retention entitlement, then writes the book and metadata to S3 with versioning.
- **Run:** `PUT /api/v1/diya-gl/books/:bookId`
- **Entry:** `app/functions/diyaGl/diyaGlPut.js:ingestHandler`; `app/lib/zipMembers.js:isDiyaGlPackage`
- **Files:** app/functions/diyaGl/diyaGlPut.js, app/unit-tests/functions/diyaGlPut.test.js, app/lib/zipMembers.js, app/unit-tests/lib/zipMembers.test.js, app/lib/diyaGlCors.js, app/unit-tests/functions/diyaGlCorsHeaders.test.js
- **Keywords:** diya-gl, ledger book, upload book, zip package, isDiyaGlPackage, versioning, retention
- **Related:** BILL-18, BILL-22, BILL-23

#### BILL-18 Delete a diya-gl book

- **Use when:** a ledger book must be removed from S3 after authorisation and ownership checks.
- **Does:** The diyaGlDelete.js ingestHandler deletes a ledger book from S3 via deleteBook, after authorisation and ownership checks.
- **Run:** `DELETE /api/v1/diya-gl/books/:bookId`
- **Entry:** `app/functions/diyaGl/diyaGlDelete.js:ingestHandler`; `app/data/s3DiyaGlRepository.js:deleteBook`
- **Files:** app/functions/diyaGl/diyaGlDelete.js, app/unit-tests/functions/diyaGlDelete.test.js
- **Keywords:** diya-gl, ledger book, delete book, deleteBook, ownership check
- **Related:** BILL-17, BILL-21

#### BILL-19 List a user's diya-gl books

- **Use when:** a caller's own ledger books must be listed from S3.
- **Does:** The diyaGlListGet.js ingestHandler lists the authenticated user's ledger books from S3, paginated.
- **Run:** `GET /api/v1/diya-gl/books`
- **Entry:** `app/functions/diyaGl/diyaGlListGet.js:ingestHandler`
- **Files:** app/functions/diyaGl/diyaGlListGet.js, app/unit-tests/functions/diyaGlListGet.test.js
- **Keywords:** diya-gl, ledger book, list books, pagination, s3 listing, user books
- **Related:** BILL-17, BILL-20

#### BILL-20 Fetch a versioned diya-gl book

- **Use when:** a specific stored version of a ledger book must be retrieved.
- **Does:** The diyaGlVersionGet.js ingestHandler retrieves a specific stored version of a ledger book from S3.
- **Run:** `GET /api/v1/diya-gl/books/:bookId/versions/:version`
- **Entry:** `app/functions/diyaGl/diyaGlVersionGet.js:ingestHandler`
- **Files:** app/functions/diyaGl/diyaGlVersionGet.js, app/unit-tests/functions/diyaGlVersionGet.test.js
- **Keywords:** diya-gl, ledger book, versioned fetch, book version, get version, s3 retrieval
- **Related:** BILL-17, BILL-19

#### BILL-21 Sweep lapsed diya-gl books

- **Use when:** resident-tier books belonging to subscribers whose bundle lapsed past the grace period must be removed.
- **Does:** The diyaGlLapseSweep.js handler runs daily and finds subscribers whose resident bundle lapsed past a grace period, with listLapsedBundleOwners. It then deletes their resident-tier books from S3. A sandbox-tier book is left to the bucket's own lifecycle rule.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/diyaGl/diyaGlLapseSweep.js:handler`; `app/data/dynamoDbBundleRepository.js:listLapsedBundleOwners`
- **Files:** app/functions/diyaGl/diyaGlLapseSweep.js, app/unit-tests/functions/diyaGlLapseSweep.test.js, behaviour-tests/diyaGlSubscription.behaviour.test.js, behaviour-tests/steps/behaviour-diya-gl-subscription-steps.js
- **Keywords:** diya-gl, lapse sweep, scheduled lambda, grace period, listLapsedBundleOwners, resident tier
- **Related:** BILL-18, BILL-22

#### BILL-22 Check diya-gl retention entitlement

- **Use when:** code must decide whether a caller's books get resident or sandbox retention.
- **Does:** The diyaGlEntitlement.js entitlementFor function decides retention tier. An active unexpired resident bundle gives resident retention for the caller's own books. A practice's active resident-pro subscription plus a matching client row gives resident retention for a client-scoped request.
- **Run:** `import { entitlementFor } from "app/services/diyaGlEntitlement.js"`
- **Entry:** `app/services/diyaGlEntitlement.js:entitlementFor`
- **Files:** app/services/diyaGlEntitlement.js, app/unit-tests/services/diyaGlEntitlement.test.js, behaviour-tests/diyaGlStorage.behaviour.test.js, app/system-tests/diyaGlStorage.system.test.js
- **Keywords:** diya-gl, retention, entitlement, resident tier, sandbox tier, resident-pro, entitlementFor
- **Related:** BILL-17, BILL-21

#### BILL-23 Store diya-gl books in S3

- **Use when:** a diya-gl endpoint needs book or version keys, metadata read/write, listing, tagging or cross-client moves.
- **Does:** The s3DiyaGlRepository.js module is the S3 repository behind every diya-gl endpoint. It computes book and version keys, and reads and writes metadata. It lists and tags books, applies visibility rules, and moves a book between clients.
- **Run:** `import { moveBookToClient, listBooks, deleteBook, putVersion, getVersion } from "app/data/s3DiyaGlRepository.js"`
- **Entry:** `app/data/s3DiyaGlRepository.js:moveBookToClient`; `app/data/s3DiyaGlRepository.js:listBooks`
- **Files:** app/data/s3DiyaGlRepository.js, app/unit-tests/data/s3DiyaGlRepository.test.js, _developers/RUNBOOK_DIYA_GL_BUCKET_CUTOVER.md
- **Keywords:** diya-gl, s3 repository, book keys, metadata, tagging, visibility, cross-client move
- **Related:** BILL-15, BILL-17, BILL-18, BILL-19, BILL-20

### Stripe billing (BILL)

<!-- generated:group stripe-billing-bill -->
- [BILL-24](#bill-24-create-a-stripe-checkout-session) Create a Stripe checkout session
- [BILL-25](#bill-25-retrieve-a-stripe-checkout-sessions-status) Retrieve a Stripe checkout session's status
- [BILL-26](#bill-26-open-the-stripe-customer-billing-portal) Open the Stripe customer billing portal
- [BILL-27](#bill-27-recover-an-abandoned-checkout) Recover an abandoned checkout
- [BILL-28](#bill-28-process-stripe-webhook-events) Process Stripe webhook events
- [BILL-29](#bill-29-assert-the-paypal-donate-button-configuration) Assert the PayPal donate button configuration
- [BILL-30](#bill-30-sync-the-stripe-productprice-catalogue) Sync the Stripe product/price catalogue
- [BILL-31](#bill-31-configure-stripe-account-policies) Configure Stripe account policies
- [BILL-32](#bill-32-provision-stripe-secrets) Provision Stripe secrets
<!-- /generated:group stripe-billing-bill -->

#### BILL-24 Create a Stripe checkout session

- **Use when:** a caller must pay for a subscription bundle by Stripe Checkout.
- **Does:** The billingCheckoutPost.js ingestHandler resolves the bundle and interval to a Stripe price id, then creates a Checkout session. The session carries the caller's hashed sub and bundle id as metadata, so billingWebhookPost.js can grant the bundle on payment. billingReturnUrl.js's resolveAllowedReturnTo validates the post-checkout return URL against an allow-list.
- **Run:** `POST /api/v1/billing/checkout`
- **Entry:** `app/functions/billing/billingCheckoutPost.js:ingestHandler`; `app/functions/billing/billingReturnUrl.js:resolveAllowedReturnTo`
- **Files:** app/functions/billing/billingCheckoutPost.js, app/unit-tests/functions/billingCheckoutPost.test.js, app/system-tests/billingCheckout.system.test.js, behaviour-tests/payment.behaviour.test.js, app/lib/stripeClient.js, app/test-support/stripeSimulator.js, app/functions/billing/billingReturnUrl.js
- **Keywords:** stripe, checkout, billing, subscription payment, price id, return url allow-list
- **Related:** BILL-25, BILL-26, BILL-28

#### BILL-25 Retrieve a Stripe checkout session's status

- **Use when:** a page after checkout must know whether a session id succeeded.
- **Does:** The billingCheckoutSessionGet.js ingestHandler retrieves a Checkout session by id. It tries the live Stripe client, then the test-mode client. A session id is only valid in the mode that created it.
- **Run:** `GET /api/v1/billing/checkout/:id`
- **Entry:** `app/functions/billing/billingCheckoutSessionGet.js:ingestHandler`
- **Files:** app/functions/billing/billingCheckoutSessionGet.js, app/unit-tests/functions/billingCheckoutSessionGet.test.js
- **Keywords:** stripe, checkout session, session status, live mode, test mode
- **Related:** BILL-24

#### BILL-26 Open the Stripe customer billing portal

- **Use when:** a subscriber must manage or cancel their subscription in the Stripe-hosted portal.
- **Does:** The billingPortalGet.js ingestHandler creates a Stripe billing-portal session for the caller's Stripe customer id, read from their stored bundle. It redirects to it, using the same allow-listed return URL as checkout.
- **Run:** `GET /api/v1/billing/portal`
- **Entry:** `app/functions/billing/billingPortalGet.js:ingestHandler`
- **Files:** app/functions/billing/billingPortalGet.js, app/unit-tests/functions/billingPortalGet.test.js
- **Keywords:** stripe, billing portal, manage subscription, customer portal, cancel subscription
- **Related:** BILL-24, BILL-28

#### BILL-27 Recover an abandoned checkout

- **Use when:** checking whether checkout recovery is implemented; the endpoint returns 501 today.
- **Does:** The billingRecoverPost.js ingestHandler always returns HTTP 501 Not implemented.
- **Run:** `POST /api/v1/billing/recover`
- **Entry:** `app/functions/billing/billingRecoverPost.js:ingestHandler`
- **Files:** app/functions/billing/billingRecoverPost.js
- **Keywords:** stripe, abandoned checkout, recover checkout, not implemented, 501
- **Related:** BILL-24

#### BILL-28 Process Stripe webhook events

- **Use when:** Stripe delivers a checkout, invoice, subscription, refund or dispute event to grant, sync or flag a subscription.
- **Does:** The billingWebhookPost.js ingestHandler verifies the Stripe signature with test and live secrets, then handles checkout, invoice, subscription and dispute events. It grants bundles, resets tokens, syncs status, marks past-due or cancelled, and auto-accepts disputes. Every other event type is logged and ignored.
- **Run:** `POST /api/v1/billing/webhook`; `gh workflow run stripe-cancel-subscription.yml -f subscription-id=<sub_xxx> -f mode=<at-period-end|immediate> -f environment-name=<ci|prod>`; `STRIPE_SECRET_KEY=sk_... node scripts/stripe-cancel-subscription.js <subscription_id> [options]`; `node scripts/stripe-trigger-lifecycle.sh`
- **Entry:** `app/functions/billing/billingWebhookPost.js:ingestHandler`
- **Files:** app/functions/billing/billingWebhookPost.js, app/unit-tests/functions/billingWebhookPost.test.js, app/data/dynamoDbSubscriptionRepository.js, app/system-tests/billingInfrastructure.system.test.js, .github/workflows/stripe-cancel-subscription.yml, scripts/stripe-cancel-subscription.js, scripts/stripe-trigger-lifecycle.sh
- **Keywords:** stripe, webhook, checkout.session.completed, invoice.paid, subscription updated, dispute, refund, cancel subscription
- **Related:** BILL-01, BILL-24, BILL-30

#### BILL-29 Assert the PayPal donate button configuration

- **Use when:** the PayPal classic hosted donate button's live configuration must be checked, not a webhook.
- **Does:** The paypal-assert.js script reads paypal.toml's classic hosted Donate button id. It checks that id by live HTTP request against the rendered spreadsheets.diyaccounting.co.uk donate page and PayPal's own donate link. No PayPal webhook handler exists in this repository; the button belongs to the spreadsheets site, not this app.
- **Run:** `node infra/paypal/paypal-assert.js`
- **Entry:** `infra/paypal/paypal-assert.js`
- **Files:** infra/paypal/paypal-assert.js, infra/paypal/paypal.toml, app/unit-tests/scripts/paypalAssert.test.js
- **Keywords:** paypal, donate button, assert configuration, declare and verify, no webhook
- **Related:** BILL-28

#### BILL-30 Sync the Stripe product/price catalogue

- **Use when:** a bundle's price changes, or a new on-subscription bundle needs a Stripe product.
- **Does:** The stripe-sync.js script plans changes by default. With --apply, it creates a Stripe product and price per on-subscription bundle, plus each webhook endpoint. Account API keys come from Secrets Manager, never an environment variable.
- **Run:** `node infra/stripe/stripe-sync.js --environment ci --mode test`; `node infra/stripe/stripe-sync.js --environment ci --mode test --apply`; `node infra/stripe/stripe-sync.js --environment prod --mode live --apply --products-only`; `node infra/stripe/stripe-sync.js --environment ci --mode test --apply --bundle <bundle-id>`; `/stripe-catalogue-sync`
- **Entry:** `infra/stripe/stripe-sync.js`; `infra/stripe/lib/stripeCatalogue.js:buildStripeProductsFromCatalog`
- **Files:** infra/stripe/stripe-sync.js, infra/stripe/lib/stripeCatalogue.js, infra/stripe/stripe.toml, app/unit-tests/scripts/stripeSync.test.js
- **Keywords:** stripe, catalogue sync, product, price, webhook endpoints, plan and apply, secrets manager
- **Related:** BILL-31, BILL-32, BILL-37

#### BILL-31 Configure Stripe account policies

- **Use when:** Stripe account-level payout and dispute policies must be set for a customer-first stance.
- **Does:** The stripe-configure-policies.js script sets Stripe account-level policies. It sets a weekly payout schedule with minimum delay, and the dispute auto-accept stance billingWebhookPost.js implements.
- **Run:** `STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-configure-policies.js --dry-run`; `STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-configure-policies.js --show-current`; `STRIPE_SECRET_KEY=sk_... node scripts/stripe-configure-policies.js`
- **Entry:** `scripts/stripe-configure-policies.js`
- **Files:** scripts/stripe-configure-policies.js
- **Keywords:** stripe, account policies, payout schedule, dispute auto-accept, no-quibble
- **Related:** BILL-28, BILL-30

#### BILL-32 Provision Stripe secrets

- **Use when:** Stripe API keys or webhook signing secrets must be created or updated in Secrets Manager.
- **Does:** The stripe-setup-secrets.sh script creates or updates Stripe API keys and webhook signing secrets in AWS Secrets Manager. It covers both the ci and prod environments.
- **Run:** `./scripts/stripe-setup-secrets.sh <env> <secret_key> <webhook_secret> <price_id>`
- **Entry:** `scripts/stripe-setup-secrets.sh`
- **Files:** scripts/stripe-setup-secrets.sh
- **Keywords:** stripe, secrets manager, api key, webhook signing secret, provision secrets
- **Related:** BILL-28, BILL-30

### Tokens and catalogue (BILL)

<!-- generated:group tokens-and-catalogue-bill -->
- [BILL-33](#bill-33-enforce-and-consume-activity-tokens) Enforce and consume activity tokens
- [BILL-34](#bill-34-prefetch-and-retry-a-cognito-token-refresh) Prefetch and retry a Cognito token refresh
- [BILL-35](#bill-35-load-and-query-the-productactivity-catalogue) Load and query the product/activity catalogue
<!-- /generated:group tokens-and-catalogue-bill -->

#### BILL-33 Enforce and consume activity tokens

- **Use when:** a token-costed activity must check balance before an HMRC call and charge only on success.
- **Does:** The tokenEnforcement.js module's hasTokensForActivity checks a qualifying bundle has enough tokens before the HMRC call. A rejected submission never costs a token, because chargeTokenOnSuccess and consumeTokenForActivity decrement the count only once HMRC confirms success. A bundle carrying the unlimited sentinel is exempt from counting.
- **Run:** `import { hasTokensForActivity, consumeTokenForActivity, chargeTokenOnSuccess } from "app/services/tokenEnforcement.js"`
- **Entry:** `app/services/tokenEnforcement.js:hasTokensForActivity`; `app/services/tokenEnforcement.js:consumeTokenForActivity`
- **Files:** app/services/tokenEnforcement.js, app/unit-tests/services/tokenEnforcement.test.js, app/unit-tests/services/tokenEnforcement.consumption.test.js, app/system-tests/tokenConsumption.system.test.js, behaviour-tests/tokenEnforcement.behaviour.test.js, web/public/widgets/submission-cost.js, web/browser-tests/submissionCost.browser.test.js, app/unit-tests/data/dynamoDbBundleRepository.tokenEvent.test.js
- **Keywords:** token, enforce tokens, consume token, unlimited sentinel, hasTokensForActivity, resident-pro licence
- **Related:** BILL-04, BILL-06, BILL-37

#### BILL-34 Prefetch and retry a Cognito token refresh

- **Use when:** a 401 must trigger an automatic Cognito token refresh and retry, or when the exchange must start early.
- **Does:** The frontend's fetchWithIdToken and ensureSession helpers call the refresh_token grant automatically on a 401 and retry the original request. prefetch-cognito-token-head.js and prefetch-mock-token-head.js start that exchange early in page load, for real and simulator variants.
- **Run:** no command; see Does and Entry
- **Entry:** `web/public/prefetch/prefetch-cognito-token-head.js`
- **Files:** web/unit-tests/token-refresh.test.js, behaviour-tests/tokenRefresh.behaviour.test.js, web/public/prefetch/prefetch-cognito-token-head.js, web/public/prefetch/prefetch-mock-token-head.js
- **Keywords:** cognito, token refresh, 401 retry, prefetch, fetchWithIdToken, ensureSession
- **Related:** BILL-33

#### BILL-35 Load and query the product/activity catalogue

- **Use when:** code needs which bundles an activity requires, which activities a bundle unlocks, or Stripe prices for a bundle.
- **Does:** The productCatalog.js module parses submit.catalogue.toml and answers which bundles an activity requires and which activities a bundle unlocks. It also reports per-environment listing restrictions, capped bundle ids, and Stripe prices by interval. catalog-service.js is the browser-side equivalent; entitlement-status.js reads both to show whether an activity is unlocked.
- **Run:** `import { loadCatalogFromRoot, bundlesForActivity, activitiesForBundle } from "app/services/productCatalog.js"`
- **Entry:** `app/services/productCatalog.js:loadCatalogFromRoot`; `app/services/productCatalog.js:bundlesForActivity`
- **Files:** app/services/productCatalog.js, app/unit-tests/services/productCatalog.test.js, app/system-tests/productCatalog.system.test.js, web/public/lib/services/catalog-service.js, web/unit-tests/catalog-service.test.js, web/unit-tests/catalog-paths.test.js, web/public/submit.catalogue.toml, web/public/widgets/entitlement-status.js, app/system-tests/helpers/catalogueValues.js
- **Keywords:** catalogue, product catalogue, activity, bundle mapping, capped bundle, stripe price by interval, entitlement status
- **Related:** BILL-01, BILL-04, BILL-30, BILL-33

### CDK infrastructure (BILL)

<!-- generated:group cdk-infrastructure-bill -->
- [BILL-36](#bill-36-cdk-account-stack) CDK: account stack
- [BILL-37](#bill-37-cdk-billing-app-stack) CDK: billing app stack
- [BILL-38](#bill-38-cdk-billing-webhook-stack) CDK: billing webhook stack
- [BILL-39](#bill-39-cdk-diya-gl-stack) CDK: diya-gl stack
<!-- /generated:group cdk-infrastructure-bill -->

#### BILL-36 CDK: account stack

- **Use when:** tracing or changing the infrastructure behind bundle, pass, practice-client and capacity-reconcile endpoints.
- **Does:** The AccountStack.java construct wires the Lambdas behind bundle get, post and delete. It also wires the pass endpoints, the practice-client endpoints, the operator snapshot, and the bundle-capacity-reconcile schedule. It builds their API Gateway routes and DynamoDB table grants.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/AccountStackTest.java
- **Keywords:** cdk, account stack, api gateway, dynamodb grants, lambda wiring
- **Related:** BILL-01, BILL-06, BILL-12, BILL-05

#### BILL-37 CDK: billing app stack

- **Use when:** tracing or changing the per-deployment billing checkout, session, portal or recover Lambdas.
- **Does:** The BillingStack.java construct wires the per-deployment billing Lambdas: checkout create, checkout-session get, portal get, and the recover stub. It grants each its Stripe secret and DynamoDB access.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/BillingStack.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/BillingStack.java
- **Keywords:** cdk, billing stack, checkout lambda, portal lambda, stripe secret grant
- **Related:** BILL-24, BILL-26, BILL-27, BILL-38

#### BILL-38 CDK: billing webhook stack

- **Use when:** tracing or changing the always-on webhook endpoint that must survive application stack teardown.
- **Does:** The BillingWebhookStack.java construct is a separate, environment-level stack that is never torn down. Stripe webhook deliveries succeed even while application stacks are destroyed. It runs the webhook Lambda behind its own API Gateway domain with zero provisioned concurrency, since Stripe retries cold starts.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/BillingWebhookStack.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/BillingWebhookStack.java
- **Keywords:** cdk, webhook stack, environment-level stack, never torn down, stripe retry, provisioned concurrency
- **Related:** BILL-28, BILL-37

#### BILL-39 CDK: diya-gl stack

- **Use when:** tracing or changing the infrastructure behind diya-gl endpoints or the lapse-sweep schedule.
- **Does:** The DiyaGlStack.java construct wires the diya-gl list, version, put and delete Lambdas. It also wires the practice client book-move Lambda and the lapse-sweep schedule. It grants their S3 bucket and DynamoDB access.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/DiyaGlStack.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/DiyaGlStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/DiyaGlStackTest.java
- **Keywords:** cdk, diya-gl stack, s3 bucket grant, lapse sweep schedule, book-move lambda
- **Related:** BILL-15, BILL-17, BILL-21, BILL-23

### Migrations and shared utilities (BILL)

<!-- generated:group migrations-and-shared-utilities-bill -->
- [BILL-40](#bill-40-migrate-the-hashed-sub-salt) Migrate the hashed-sub salt
- [BILL-41](#bill-41-backfill-the-stripe-test-mode-qualifier) Backfill the Stripe test-mode qualifier
- [BILL-42](#bill-42-parse-iso-8601-durations-for-expiry) Parse ISO 8601 durations for expiry
- [BILL-43](#bill-43-build-the-frontend-test-bundle) Build the frontend test bundle
- [BILL-44](#bill-44-document-the-price-update-project) Document the price-update project
<!-- /generated:group migrations-and-shared-utilities-bill -->

#### BILL-40 Migrate the hashed-sub salt

- **Use when:** the salt used to hash user subs must be rotated to a new passphrase.
- **Does:** The 003-rotate-salt-to-passphrase.js post-deploy migration generates a new 8-word passphrase salt. It re-keys every hashed-sub-keyed DynamoDB item from the old salt to the new one and updates the salt canary. The new passphrase is printed for the operator to record physically.
- **Run:** `ENVIRONMENT_NAME=<ci|prod> node scripts/migrations/runner.js --phase post-deploy`; `gh workflow run run-migrations.yml -f environment-name=<ci|prod> -f phase=post-deploy`
- **Entry:** `scripts/migrations/003-rotate-salt-to-passphrase.js`; `scripts/migrations/runner.js`
- **Files:** scripts/migrations/003-rotate-salt-to-passphrase.js
- **Keywords:** migration, salt rotation, hashed sub, passphrase salt, re-key, salt canary, post-deploy
- **Related:** BILL-41

#### BILL-41 Backfill the Stripe test-mode qualifier

- **Use when:** bundles created by a Stripe subscription need their own stripeTestMode qualifier separated from sandbox.
- **Does:** The 004-backfill-stripe-test-mode.js pre-deploy migration copies qualifiers.sandbox to a new qualifiers.stripeTestMode field. It applies this to every bundle a Stripe subscription created, is idempotent, and honours a MIGRATION_DRY_RUN flag.
- **Run:** `ENVIRONMENT_NAME=<ci|prod> node scripts/migrations/runner.js --phase pre-deploy`; `MIGRATION_DRY_RUN=true ENVIRONMENT_NAME=<ci|prod> node scripts/migrations/runner.js --phase pre-deploy`; `gh workflow run run-migrations.yml -f environment-name=<ci|prod> -f phase=pre-deploy`
- **Entry:** `scripts/migrations/004-backfill-stripe-test-mode.js`; `scripts/migrations/runner.js`
- **Files:** scripts/migrations/004-backfill-stripe-test-mode.js, app/unit-tests/migrations/004-backfill-stripe-test-mode.test.js
- **Keywords:** migration, stripe test mode, backfill, qualifier, sandbox, dry run, pre-deploy
- **Related:** BILL-40

#### BILL-42 Parse ISO 8601 durations for expiry

- **Use when:** a catalogue-declared duration must become an expiry date for a bundle grant, pass or token reset.
- **Does:** The dateUtils.js module provides parseIsoDurationToDate to compute an expiry date from a duration. Bundle grants, pass validity periods and token-reset windows all call it. It also provides TTL calculation for pass records and a per-minute bucket for the bundle-read burst detector.
- **Run:** `import { parseIsoDurationToDate, calculateTtl, nowMinute } from "app/lib/dateUtils.js"`
- **Entry:** `app/lib/dateUtils.js:parseIsoDurationToDate`
- **Files:** app/lib/dateUtils.js
- **Keywords:** iso 8601 duration, expiry, ttl, date utils, parseIsoDurationToDate, burst bucket
- **Related:** BILL-01, BILL-06, BILL-02

#### BILL-43 Build the frontend test bundle

- **Use when:** unit or browser tests need the frontend bundled before they run.
- **Does:** The bundle-for-tests.js script concatenates the frontend's ES modules into one submit.bundle.js file. Unit and browser tests load that file without a module bundler. This is unrelated to product or subscription bundles despite the shared name.
- **Run:** `npm run bundle`
- **Entry:** `scripts/bundle-for-tests.js`
- **Files:** scripts/bundle-for-tests.js
- **Keywords:** frontend bundle, submit.bundle.js, test bundle, concatenate modules, pretest

#### BILL-44 Document the price-update project

- **Use when:** researching why the pricing or bundle catalogue was changed the way it was.
- **Does:** PLAN_PRICE_UPDATE.md and REPORT_PRICE_UPDATE_REVIEW.md record the plan and review for the pricing update project. This area's billing and entitlement code implements that project's bundle-catalogue changes.
- **Run:** no command; see Does and Entry
- **Entry:** `PLAN_PRICE_UPDATE.md`; `REPORT_PRICE_UPDATE_REVIEW.md`
- **Files:** PLAN_PRICE_UPDATE.md, REPORT_PRICE_UPDATE_REVIEW.md
- **Keywords:** price update, plan, review, bundle catalogue, pricing project
- **Related:** BILL-35, BILL-30

## Operations and CI (OPS)

<!-- generated:area OPS -->
- [Deploy pipeline](#deploy-pipeline-ops): [OPS-01](#ops-01-cancel-superseded-push-triggered-deploys) Cancel superseded push-triggered deploys · [OPS-02](#ops-02-derive-environment-and-deployment-names-from-a-branch) Derive environment and deployment names from a branch · [OPS-03](#ops-03-look-up-aws-resources-by-domain-convention) Look up AWS resources by domain convention · [OPS-04](#ops-04-update-route53cloudfront-origins-for-a-domain) Update Route53/CloudFront origins for a domain · [OPS-05](#ops-05-promote-a-ci-deployment-to-the-ci-apex) Promote a CI deployment to the CI apex · [OPS-06](#ops-06-run-the-full-deployment-pipeline) Run the full deployment pipeline · [OPS-07](#ops-07-lean-deploy-app-code-to-lambda-and-s3) Lean-deploy app code to Lambda and S3 · [OPS-08](#ops-08-deploy-a-single-cdk-stack-on-demand) Deploy a single CDK stack on demand · [OPS-09](#ops-09-deploy-environment-stacks-and-populate-secrets) Deploy environment stacks and populate secrets · [OPS-131](#ops-131-serve-cloudfront-custom-error-pages) Serve CloudFront custom error pages · [OPS-132](#ops-132-enable-dynamodb-pitr-on-deploy) Enable DynamoDB PITR on deploy · [OPS-133](#ops-133-serve-the-root-domain-holding-page) Serve the root-domain holding page · [OPS-134](#ops-134-monitor-github-actions-ci-from-the-cli) Monitor GitHub Actions CI from the CLI · [OPS-135](#ops-135-look-up-domains-and-cloudfront-distributions) Look up domains and CloudFront distributions · [OPS-136](#ops-136-retrieve-cloudformation-stack-outputs) Retrieve CloudFormation stack outputs · [OPS-137](#ops-137-export-cognito-users-for-reporting-or-backup) Export Cognito users for reporting or backup
- [ci slot pool and sweep](#ci-slot-pool-and-sweep-ops): [OPS-10](#ops-10-claim-release-and-track-a-ci-deployment-slot) Claim, release and track a CI deployment slot · [OPS-11](#ops-11-queue-ci-branch-deploys-in-creation-order) Queue CI branch deploys in creation order · [OPS-12](#ops-12-clean-up-expired-test-users) Clean up expired test users · [OPS-13](#ops-13-auto-destroy-stale-ci-deployments) Auto-destroy stale CI deployments · [OPS-14](#ops-14-destroy-a-named-prod-deployment-on-demand) Destroy a named prod deployment on demand · [OPS-15](#ops-15-serialize-lane-test-user-rotation-jobs) Serialize lane test-user rotation jobs · [OPS-16](#ops-16-run-dynamodb-data-migrations) Run DynamoDB data migrations
- [Alarms, triage and probes](#alarms-triage-and-probes-ops): [OPS-17](#ops-17-redact-and-gate-unattended-agent-output-before-publishing) Redact and gate unattended-agent output before publishing · [OPS-18](#ops-18-run-alarm-and-support-triage) Run alarm and support triage · [OPS-19](#ops-19-kill-switch-to-stop-unattended-agent-workflows) Kill-switch to stop unattended agent workflows · [OPS-20](#ops-20-enforce-daily-run-budgets-for-agent-paths) Enforce daily run budgets for agent paths · [OPS-21](#ops-21-auto-close-resolved-alarm-issues) Auto-close resolved alarm issues · [OPS-22](#ops-22-verify-a-triage-draft-pr-stays-in-scope) Verify a triage draft-PR stays in scope · [OPS-23](#ops-23-raise-an-issue-from-a-probe-test-failure) Raise an issue from a probe-test failure · [OPS-24](#ops-24-gate-probes-on-the-main-apex-deploy) Gate probes on the main apex deploy · [OPS-25](#ops-25-record-dora-and-probe-metrics) Record DORA and probe metrics · [OPS-26](#ops-26-run-the-automated-test-suite-in-ci) Run the automated test suite in CI · [OPS-27](#ops-27-run-probe-tests-against-deployed-environments) Run probe tests against deployed environments · [OPS-70](#ops-70-forward-operational-activity-events-to-telegram) Forward operational activity events to Telegram · [OPS-71](#ops-71-create-github-issues-from-cloudwatch-alarms) Create GitHub issues from CloudWatch alarms · [OPS-72](#ops-72-forward-bedrock-budget-alerts) Forward Bedrock budget alerts · [OPS-73](#ops-73-detect-404-scan-rate-attacks) Detect 404 scan-rate attacks · [OPS-74](#ops-74-detect-waf-blocked-scan-attacks) Detect WAF-blocked scan attacks · [OPS-75](#ops-75-run-nightly-security-lake-analysis) Run nightly Security Lake analysis · [OPS-76](#ops-76-gather-alarm-evidence-for-investigation) Gather alarm evidence for investigation · [OPS-77](#ops-77-silence-alarms-during-deployment-teardown) Silence alarms during deployment teardown · [OPS-78](#ops-78-verify-an-alarm-issues-claimed-transition) Verify an alarm issue's claimed transition · [OPS-79](#ops-79-track-an-alarm-familys-daily-remedy-budget) Track an alarm family's daily remedy budget · [OPS-80](#ops-80-build-aws-console-deep-links-for-operators) Build AWS console deep links for operators
- [Security and compliance](#security-and-compliance-ops): [OPS-28](#ops-28-enforce-commit-identity-allowlist) Enforce commit identity allowlist · [OPS-29](#ops-29-verify-commit-signatures-on-pull-requests) Verify commit signatures on pull requests · [OPS-30](#ops-30-run-codeql-security-scanning) Run CodeQL security scanning · [OPS-31](#ops-31-run-a-claude-security-review-on-push) Run a Claude security review on push · [OPS-32](#ops-32-detect-cloudformation-drift) Detect CloudFormation drift · [OPS-33](#ops-33-enforce-workflow-to-workflow-permission-grants) Enforce workflow-to-workflow permission grants · [OPS-34](#ops-34-validate-github-actions-workflow-files) Validate GitHub Actions workflow files · [OPS-35](#ops-35-verify-third-party-console-configuration-against-declared-state) Verify third-party console configuration against declared state · [OPS-36](#ops-36-configure-dependabot-dependency-updates) Configure Dependabot dependency updates · [OPS-37](#ops-37-check-https-certificate-expiry) Check HTTPS certificate expiry · [OPS-38](#ops-38-run-the-weekly-compliance-test-check) Run the weekly compliance-test check · [OPS-39](#ops-39-generate-a-software-bill-of-materials) Generate a software bill of materials
- [Data protection and privacy](#data-protection-and-privacy-ops): [OPS-40](#ops-40-delete-a-customers-data-for-gdpr-erasure) Delete a customer's data for GDPR erasure · [OPS-41](#ops-41-export-a-customers-gdpr-subject-access-data) Export a customer's GDPR subject-access data · [OPS-42](#ops-42-guide-icogdpr-compliance) Guide ICO/GDPR compliance · [OPS-43](#ops-43-rotate-stored-email-address-hashes) Rotate stored email-address hashes · [OPS-44](#ops-44-hash-and-rotate-the-subject-id-salt) Hash and rotate the subject-ID salt · [OPS-45](#ops-45-manage-aws-secrets-manager-entries-and-rotation-tags) Manage AWS Secrets Manager entries and rotation tags · [OPS-46](#ops-46-query-and-persist-per-consumer-security-state-records) Query and persist per-consumer security-state records · [OPS-47](#ops-47-check-fraud-prevention-header-record-freshness) Check fraud-prevention header record freshness · [OPS-48](#ops-48-verify-backup-health-daily) Verify backup health daily · [OPS-49](#ops-49-request-and-renew-the-holding-page-certificate) Request and renew the holding-page certificate · [OPS-50](#ops-50-drill-and-test-pitr-database-restoration) Drill and test PITR database restoration
- [Video, publishing and accessibility](#video-publishing-and-accessibility-ops): [OPS-51](#ops-51-publish-build-artifacts-and-documentation) Publish build artifacts and documentation · [OPS-52](#ops-52-auto-record-demo-videos-on-prod-deploy) Auto-record demo videos on prod deploy · [OPS-53](#ops-53-verify-youtube-channel-consistency-weekly) Verify YouTube channel consistency weekly · [OPS-88](#ops-88-orchestrate-demo-video-recording-journeys) Orchestrate demo-video recording journeys · [OPS-89](#ops-89-overlay-pointer-and-caption-cues-on-video) Overlay pointer and caption cues on video · [OPS-90](#ops-90-encode-captured-video-frames-and-captions) Encode captured video frames and captions · [OPS-91](#ops-91-validate-video-scene-scripts-and-timing) Validate video scene scripts and timing · [OPS-92](#ops-92-redact-secrets-from-video-artefacts) Redact secrets from video artefacts · [OPS-93](#ops-93-publish-demo-videos-to-youtube) Publish demo videos to YouTube · [OPS-94](#ops-94-play-demo-videos-on-the-public-site) Play demo videos on the public site · [OPS-95](#ops-95-generate-wcag-accessibility-compliance-rows) Generate WCAG accessibility compliance rows · [OPS-96](#ops-96-scan-pages-for-accessibility-violations) Scan pages for accessibility violations · [OPS-97](#ops-97-compile-the-compliance-audit-report) Compile the compliance audit report
- [Agent workflows](#agent-workflows-ops): [OPS-54](#ops-54-define-specialized-claude-code-sub-agent-personas) Define specialized Claude Code sub-agent personas · [OPS-55](#ops-55-configure-github-copilot-review-and-workspace-setup) Configure GitHub Copilot review and workspace setup · [OPS-56](#ops-56-structure-github-issues-prs-and-funding-links) Structure GitHub issues, PRs and funding links · [OPS-57](#ops-57-dispatch-agentic-lib-board-backlog-and-pr-agents) Dispatch agentic-lib board, backlog and PR agents
- [Environment and accounts](#environment-and-accounts-ops): [OPS-58](#ops-58-document-multi-account-aws-architecture) Document multi-account AWS architecture · [OPS-59](#ops-59-track-and-analyze-aws-spending) Track and analyze AWS spending · [OPS-60](#ops-60-guide-github-repository-configuration) Guide GitHub repository configuration · [OPS-61](#ops-61-design-ci-branch-deploys-off-the-apex) Design CI branch deploys off the apex · [OPS-62](#ops-62-report-accessibility-penetration-testing) Report accessibility penetration testing · [OPS-63](#ops-63-report-identity-audit-findings) Report identity audit findings · [OPS-64](#ops-64-runbook-information-security-operations) Runbook information-security operations · [OPS-65](#ops-65-document-security-policy-and-disclosure) Document security policy and disclosure · [OPS-66](#ops-66-create-an-hmrc-sandbox-test-user) Create an HMRC sandbox test user · [OPS-67](#ops-67-apply-google-cloud--ga4-infrastructure) Apply Google Cloud / GA4 infrastructure · [OPS-68](#ops-68-provision-and-assume-roles-for-test-user-provisioning) Provision and assume roles for test-user provisioning · [OPS-69](#ops-69-assume-and-clear-local-aws-deployment-credentials) Assume and clear local AWS deployment credentials · [OPS-98](#ops-98-bootstrap-the-cdk-toolkit-across-accounts) Bootstrap the CDK toolkit across accounts · [OPS-99](#ops-99-bootstrap-the-aws-organization-structure) Bootstrap the AWS Organization structure · [OPS-100](#ops-100-create-or-invite-aws-member-accounts) Create or invite AWS member accounts · [OPS-101](#ops-101-set-up-github-oidc-deployment-roles) Set up GitHub OIDC deployment roles · [OPS-102](#ops-102-verify-the-multi-account-aws-setup) Verify the multi-account AWS setup · [OPS-103](#ops-103-bootstrap-a-new-aws-account-for-cdk) Bootstrap a new AWS account for CDK
- [Shared runtime libraries](#shared-runtime-libraries-ops): [OPS-81](#ops-81-mask-and-redact-sensitive-data-from-logs) Mask and redact sensitive data from logs · [OPS-82](#ops-82-provide-a-shared-dynamodb-client) Provide a shared DynamoDB client · [OPS-83](#ops-83-emit-cloudwatch-emf-metrics) Emit CloudWatch EMF metrics · [OPS-84](#ops-84-validate-required-environment-variables-at-startup) Validate required environment variables at startup · [OPS-85](#ops-85-obtain-and-use-github-app-api-tokens) Obtain and use GitHub App API tokens · [OPS-86](#ops-86-provide-structured-pii-redacting-logging) Provide structured PII-redacting logging · [OPS-87](#ops-87-process-sqs-message-batches-in-lambda-workers) Process SQS message batches in Lambda workers
- [Backup and disaster recovery](#backup-and-disaster-recovery-ops): [OPS-104](#ops-104-set-up-cross-account-backup-iam-roles) Set up cross-account backup IAM roles · [OPS-105](#ops-105-copy-production-data-to-backup-for-migration) Copy production data to backup for migration · [OPS-106](#ops-106-replicate-secrets-across-aws-accounts) Replicate secrets across AWS accounts · [OPS-107](#ops-107-list-production-secrets-manager-entries) List production Secrets Manager entries · [OPS-108](#ops-108-backfill-ttl-on-existing-dynamodb-records) Backfill TTL on existing DynamoDB records · [OPS-109](#ops-109-disaster-recovery-restore-into-a-new-prod-account) Disaster-recovery restore into a new prod account · [OPS-110](#ops-110-force-logout-all-users-during-a-security-incident) Force logout all users during a security incident
- [CDK infrastructure stacks](#cdk-infrastructure-stacks-ops): [OPS-111](#ops-111-provision-cross-account-backup-vaults-and-plans) Provision cross-account backup vaults and plans · [OPS-112](#ops-112-provision-the-api-gateway-stack) Provision the API Gateway stack · [OPS-113](#ops-113-provision-the-dynamodb-and-s3-data-stack) Provision the DynamoDB and S3 data stack · [OPS-114](#ops-114-provision-ecr-image-repositories) Provision ECR image repositories · [OPS-115](#ops-115-provision-the-edgecloudfront-stack) Provision the Edge/CloudFront stack · [OPS-116](#ops-116-provision-the-holding-page-stack) Provision the holding-page stack · [OPS-117](#ops-117-provision-the-observability-stack) Provision the Observability stack · [OPS-118](#ops-118-provision-the-observability-stack-in-us-east-1) Provision the Observability stack in us-east-1 · [OPS-119](#ops-119-provision-the-ops-stack) Provision the Ops stack · [OPS-120](#ops-120-provision-the-publish-stack) Provision the Publish stack · [OPS-121](#ops-121-provision-the-security-baseline-stack) Provision the Security Baseline stack · [OPS-122](#ops-122-provision-the-security-detection-stack) Provision the Security Detection stack
- [CDK shared constructs and naming](#cdk-shared-constructs-and-naming-ops): [OPS-123](#ops-123-wire-cdk-application-entrypoints-per-account) Wire CDK application entrypoints per account · [OPS-124](#ops-124-define-shared-lambda-cdk-constructs) Define shared Lambda CDK constructs · [OPS-125](#ops-125-name-and-tag-cdk-resources-consistently) Name and tag CDK resources consistently · [OPS-126](#ops-126-provide-config-composition-helpers-for-cdk-code) Provide config-composition helpers for CDK code · [OPS-127](#ops-127-upsert-route53-alias-records-via-custom-resource) Upsert Route53 alias records via custom resource · [OPS-128](#ops-128-generate-s3-lifecycle-rules-for-storage-tiering) Generate S3 lifecycle rules for storage tiering · [OPS-129](#ops-129-configure-lambdacdk-application-logging) Configure Lambda/CDK application logging · [OPS-130](#ops-130-track-runtime-and-dependency-lifecycle) Track runtime and dependency lifecycle
<!-- /generated:area OPS -->

### Deploy pipeline (OPS)

<!-- generated:group deploy-pipeline-ops -->
- [OPS-01](#ops-01-cancel-superseded-push-triggered-deploys) Cancel superseded push-triggered deploys
- [OPS-02](#ops-02-derive-environment-and-deployment-names-from-a-branch) Derive environment and deployment names from a branch
- [OPS-03](#ops-03-look-up-aws-resources-by-domain-convention) Look up AWS resources by domain convention
- [OPS-04](#ops-04-update-route53cloudfront-origins-for-a-domain) Update Route53/CloudFront origins for a domain
- [OPS-05](#ops-05-promote-a-ci-deployment-to-the-ci-apex) Promote a CI deployment to the CI apex
- [OPS-06](#ops-06-run-the-full-deployment-pipeline) Run the full deployment pipeline
- [OPS-07](#ops-07-lean-deploy-app-code-to-lambda-and-s3) Lean-deploy app code to Lambda and S3
- [OPS-08](#ops-08-deploy-a-single-cdk-stack-on-demand) Deploy a single CDK stack on demand
- [OPS-09](#ops-09-deploy-environment-stacks-and-populate-secrets) Deploy environment stacks and populate secrets
- [OPS-131](#ops-131-serve-cloudfront-custom-error-pages) Serve CloudFront custom error pages
- [OPS-132](#ops-132-enable-dynamodb-pitr-on-deploy) Enable DynamoDB PITR on deploy
- [OPS-133](#ops-133-serve-the-root-domain-holding-page) Serve the root-domain holding page
- [OPS-134](#ops-134-monitor-github-actions-ci-from-the-cli) Monitor GitHub Actions CI from the CLI
- [OPS-135](#ops-135-look-up-domains-and-cloudfront-distributions) Look up domains and CloudFront distributions
- [OPS-136](#ops-136-retrieve-cloudformation-stack-outputs) Retrieve CloudFormation stack outputs
- [OPS-137](#ops-137-export-cognito-users-for-reporting-or-backup) Export Cognito users for reporting or backup
<!-- /generated:group deploy-pipeline-ops -->

#### OPS-01 Cancel superseded push-triggered deploys

- **Use when:** a workflow_dispatch redeploy might race a push-triggered deploy.yml run on the same commit.
- **Does:** cancel-superseded-push-deploy.mjs finds a push-triggered deploy.yml run on the same commit that has not started a stack job. It cancels that run when a workflow_dispatch redeploy names an explicit deployment-name. The two runs then never deploy the same stacks in parallel.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/actions/cancel-superseded-push-deploy/cancel-superseded-push-deploy.mjs:main`; `.github/actions/cancel-superseded-push-deploy/cancel-superseded-push-deploy.mjs:cancelableSupersededRuns`
- **Files:** .github/actions/cancel-superseded-push-deploy/action.yml, .github/actions/cancel-superseded-push-deploy/cancel-superseded-push-deploy.mjs
- **Keywords:** cancel run, superseded deploy, push trigger, workflow_dispatch, same commit, deploy.yml, stack job, race
- **Related:** OPS-06

#### OPS-02 Derive environment and deployment names from a branch

- **Use when:** a workflow step needs the same environment, deployment name and domain URLs another step already computed.
- **Does:** get-names computes the environment name, ci or prod, from the branch or an explicit override. It computes the deployment name from a hash of the branch or an override. It computes the domain URLs that follow from those two names.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/actions/get-names/action.yml`
- **Files:** .github/actions/get-names/action.yml
- **Keywords:** environment name, deployment name, get-names, branch hash, domain url, ci or prod, naming convention
- **Related:** OPS-03, OPS-04

#### OPS-03 Look up AWS resources by domain convention

- **Use when:** a workflow step needs a deployment's Cognito pool, API Gateway or CloudFront IDs without a stored ID.
- **Does:** lookup-resources queries AWS for the Cognito User Pool, API Gateway and CloudFront resources of a deployment. It derives every resource from the deployment's deterministic domain name, for example ci-<subdomain>.<domain>. No caller needs to store a resource ID.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/actions/lookup-resources/action.yml`
- **Files:** .github/actions/lookup-resources/action.yml
- **Keywords:** lookup resources, cognito user pool, api gateway, cloudfront, domain convention, deterministic naming
- **Related:** OPS-02

#### OPS-04 Update Route53/CloudFront origins for a domain

- **Use when:** an apex or environment domain must move to a different origin, or fall back to the holding page.
- **Does:** set-origins.yml atomically updates the Route53 ALIAS records and CloudFront distribution aliases for a domain. It points the domain at a branch-based origin, the holding page, or the last-known-good deployment.
- **Run:** `gh workflow run set-origins.yml -f domain-source=<branch|holding|last-known-good> -f environment-name=<ci|prod>`
- **Entry:** `.github/workflows/set-origins.yml`; `.github/actions/set-origins/action.yml`
- **Files:** .github/actions/set-origins/action.yml, .github/workflows/set-origins.yml
- **Keywords:** set origins, route53, cloudfront alias, holding page, last-known-good, domain cutover
- **Related:** OPS-05

#### OPS-05 Promote a CI deployment to the CI apex

- **Use when:** a ci deployment has passed its probes and the ci apex must point at it.
- **Does:** promote-ci-apex.yml moves ci-submit.diyaccounting.co.uk to point at a named ci-setN deployment whose probes have passed. It moves CloudFront and the API Gateway custom domain in sequence, under a non-cancellable concurrency group. deploy.yml dispatches it automatically after probes pass; it is also safe to run by hand.
- **Run:** `gh workflow run promote-ci-apex.yml -f deployment-name=<ci-setN>`
- **Entry:** `.github/workflows/promote-ci-apex.yml`
- **Files:** .github/workflows/promote-ci-apex.yml
- **Keywords:** promote apex, ci apex, ci-set, cloudfront cutover, api gateway custom domain
- **Related:** OPS-04

#### OPS-06 Run the full deployment pipeline

- **Use when:** a change on main must reach production, or a named deployment must be redeployed by hand.
- **Does:** deploy.yml is the main pipeline, triggered by a push to main. It synths CDK, runs tests, deploys infrastructure and app code, then validates the result. Once validation passes it atomically moves the prod apex domain to the new deployment.
- **Run:** `git push origin main`; `gh workflow run deploy.yml -f deployment-name=<name>`
- **Entry:** `.github/workflows/deploy.yml`
- **Files:** .github/workflows/deploy.yml
- **Keywords:** deploy pipeline, prod apex, cdk synth, push to main, deployment-name, full deploy
- **Related:** OPS-04, OPS-09

#### OPS-07 Lean-deploy app code to Lambda and S3

- **Use when:** a fast iteration deploy of app or web code is needed, without a full CDK deploy.
- **Does:** deploy-app.js builds the ARM64 Docker image and pushes it to ECR. It updates every Lambda function's code, publishes a version and moves the pc alias. It syncs web assets to S3 with RUM injection and invalidates CloudFront, leaving CloudFormation drift the next full deploy reconciles.
- **Run:** `gh workflow run deploy-app.yml -f environment-name=<ci|prod> -f deployment-name=<name>`; `npm run deploy:app-ci`; `npm run deploy:app-prod`; `node scripts/deploy-app.js`
- **Entry:** `scripts/deploy-app.js:resolveDeployment`; `scripts/deploy-app.js:dockerBuildAndPush`
- **Files:** .github/workflows/deploy-app.yml, scripts/deploy-app.js
- **Keywords:** lean deploy, deploy-app, lambda update, s3 sync, cloudfront invalidation, rum injection, cloudformation drift
- **Related:** OPS-06

#### OPS-08 Deploy a single CDK stack on demand

- **Use when:** only one CDK stack needs deploying, without running the full pipeline.
- **Does:** deploy-cdk-stack.yml runs CDK synth and deploy for one named stack in a chosen environment. It skips the rest of the deployment pipeline.
- **Run:** `gh workflow run deploy-cdk-stack.yml -f stackName=<name> -f environment-name=<ci|prod>`
- **Entry:** `.github/workflows/deploy-cdk-stack.yml`
- **Files:** .github/workflows/deploy-cdk-stack.yml
- **Keywords:** single stack deploy, cdk synth, cdk deploy, manual stack deploy, stackName
- **Related:** OPS-09

#### OPS-09 Deploy environment stacks and populate secrets

- **Use when:** environment-level infrastructure or its secrets must be redeployed independently of an app deploy.
- **Does:** deploy-environment.yml synths and deploys the environment-level CDK stacks: ObservabilityStack, DataStack and the rest. Its create-secrets job writes the environment's GitHub Environment secret values into AWS Secrets Manager, tagged by put-secret-with-rotation-tag.sh.
- **Run:** `gh workflow run deploy-environment.yml -f environment-name=<ci|prod>`
- **Entry:** `.github/workflows/deploy-environment.yml`
- **Files:** .github/workflows/deploy-environment.yml, app/unit-tests/deployEnvironmentWorkflowPaths.test.js
- **Keywords:** deploy environment, environment stacks, create-secrets, observabilitystack, datastack
- **Related:** OPS-42

#### OPS-131 Serve CloudFront custom error pages

- **Use when:** CloudFront returns an HTTP error and the visitor needs the right static error page instead of a raw status.
- **Does:** errorPageHandler.js is the CloudFront@Edge viewer-request handler that renders the right static page for each HTTP error status, via errorPageHtml.js. The web/public/errors/*.html pages are the served output, and error-page.js is the web component that displays error-page detail in the app shell.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/edge/errorPageHandler.js:handler`
- **Files:** app/functions/edge/errorPageHandler.js, app/functions/edge/errorPageHtml.js, app/unit-tests/edge/errorPageHandler.test.js, web/public/errors/403.html, web/public/errors/404.html, web/public/errors/404-error-distribution.html, web/public/errors/404-error-origin.html, web/public/errors/500.html, web/public/errors/502.html, web/public/errors/503.html, web/public/errors/504.html, web/public/widgets/error-page.js
- **Keywords:** cloudfront edge, custom error page, 403, 404, 500, error handler, viewer request
- **Related:** OPS-115

#### OPS-132 Enable DynamoDB PITR on deploy

- **Use when:** a DynamoDB table needs point-in-time recovery turned on idempotently as part of a stack deploy.
- **Does:** ensurePitr.mjs is a CloudFormation custom resource that calls DescribeTable and UpdateContinuousBackups to turn on PITR for a table, idempotently, at deploy time.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/infra/ensurePitr.mjs:onEvent`; `app/functions/infra/ensurePitr.mjs:isComplete`
- **Files:** app/functions/infra/ensurePitr.mjs, app/unit-tests/functions/ensurePitr.test.js
- **Keywords:** pitr, point-in-time recovery, dynamodb backup, custom resource, continuous backups
- **Related:** OPS-113

#### OPS-133 Serve the root-domain holding page

- **Use when:** a visitor lands on the bare diyaccounting.co.uk root domain and needs redirecting to the submit subdomain.
- **Does:** A static HTML page is served at the diyaccounting.co.uk root domain and redirects visitors to the submit subdomain.
- **Run:** no command; see Does and Entry
- **Entry:** `web/holding/index.html`
- **Files:** web/holding/index.html
- **Keywords:** holding page, root domain, redirect, diyaccounting.co.uk
- **Related:** OPS-116

#### OPS-134 Monitor GitHub Actions CI from the CLI

- **Use when:** main and every open PR's head branch need polling until CI is green, with each red and each PR's readiness reported once.
- **Does:** watch-ci.sh polls the GitHub API to watch every CI workflow run on main and each open PR's head branch until it completes. It reports each red once, each PR's merge-readiness once per head, and one tally when the whole scope is terminal.
- **Run:** `./scripts/watch-ci.sh [state-dir]`
- **Entry:** `scripts/watch-ci.sh`
- **Files:** scripts/watch-ci.sh
- **Keywords:** watch ci, github actions, poll workflow, pr readiness, ci monitoring

#### OPS-135 Look up domains and CloudFront distributions

- **Use when:** the live ci-/prod- DNS records under submit need listing, or a CloudFront distribution ID needs finding for an origin.
- **Does:** list-domains.sh lists every ci- and prod- DNS record under the submit subdomain from Route53. lookup-cloudfront-distribution.sh prints the live CloudFront distribution ID serving an origin domain, preferring the EdgeStack stack output and falling back to the OriginFor tag, confirming every candidate against get-distribution since the tag index can lag a deletion.
- **Run:** `./scripts/list-domains.sh`; `./scripts/lookup-cloudfront-distribution.sh <origin-domain> [edge-stack-name]`
- **Entry:** `scripts/list-domains.sh`; `scripts/lookup-cloudfront-distribution.sh`
- **Files:** scripts/list-domains.sh, scripts/lookup-cloudfront-distribution.sh
- **Keywords:** list domains, route53 records, cloudfront distribution id, originfor tag, deployment lookup
- **Related:** OPS-115

#### OPS-136 Retrieve CloudFormation stack outputs

- **Use when:** a script or test needs a named stack's output values, such as a URL, table name or ARN.
- **Does:** stack-output.js queries a named CloudFormation stack and extracts its output values, such as URLs, table names and ARNs, for scripts and tests to consume.
- **Run:** `node scripts/stack-output.js <stack-name> <output-key>`
- **Entry:** `scripts/stack-output.js`
- **Files:** scripts/stack-output.js
- **Keywords:** stack output, cloudformation, output value, arn lookup, table name lookup

#### OPS-137 Export Cognito users for reporting or backup

- **Use when:** every user in a Cognito user pool needs exporting with their attributes to CSV or JSON.
- **Does:** export-cognito-users.sh lists every user in a Cognito user pool and exports their attributes, such as email, sub and status, to CSV or JSON.
- **Run:** `./scripts/export-cognito-users.sh <user-pool-id> [output-directory]`
- **Entry:** `scripts/export-cognito-users.sh`
- **Files:** scripts/export-cognito-users.sh
- **Keywords:** cognito export, user pool, csv export, json export, user attributes
- **Related:** OPS-110

### ci slot pool and sweep (OPS)

<!-- generated:group ci-slot-pool-and-sweep-ops -->
- [OPS-10](#ops-10-claim-release-and-track-a-ci-deployment-slot) Claim, release and track a CI deployment slot
- [OPS-11](#ops-11-queue-ci-branch-deploys-in-creation-order) Queue CI branch deploys in creation order
- [OPS-12](#ops-12-clean-up-expired-test-users) Clean up expired test users
- [OPS-13](#ops-13-auto-destroy-stale-ci-deployments) Auto-destroy stale CI deployments
- [OPS-14](#ops-14-destroy-a-named-prod-deployment-on-demand) Destroy a named prod deployment on demand
- [OPS-15](#ops-15-serialize-lane-test-user-rotation-jobs) Serialize lane test-user rotation jobs
- [OPS-16](#ops-16-run-dynamodb-data-migrations) Run DynamoDB data migrations
<!-- /generated:group ci-slot-pool-and-sweep-ops -->

#### OPS-10 Claim, release and track a CI deployment slot

- **Use when:** a branch needs a registered ci host, or a slot must be freed or checked before a sweep.
- **Does:** claim-ci-slot.mjs claims one of a fixed pool of ci-setN names, keyed by github.ref. release-ci-slot.mjs frees the slot when deploy.yml finishes, pass or fail. slot-claim-active.mjs and slot-for-ref.mjs let destroy-ci.yml check a slot before tearing it down.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/actions/claim-ci-slot/claim-ci-slot.mjs:main`; `.github/actions/claim-ci-slot/release-ci-slot.mjs:main`; `.github/actions/claim-ci-slot/slot-claim-active.mjs:main`
- **Files:** .github/actions/claim-ci-slot/action.yml, .github/actions/claim-ci-slot/claim-ci-slot.mjs, .github/actions/claim-ci-slot/release-ci-slot.mjs, .github/actions/claim-ci-slot/slot-claim-active.mjs, .github/actions/claim-ci-slot/slot-for-ref.mjs, app/unit-tests/actions/releaseCiSlot.test.js, app/unit-tests/actions/slotClaimActive.test.js, app/unit-tests/actions/slotForRef.test.js
- **Keywords:** ci slot, ci-set, slot pool, claim slot, release slot, hmrc-registered host, cognito-registered host
- **Related:** OPS-11, OPS-13

#### OPS-11 Queue CI branch deploys in creation order

- **Use when:** a CI branch deploy must not race another deploy, destroy or video-capture run for the same slot.
- **Does:** wait-for-ci-deploys.mjs polls the GitHub API for older, still-running deploy.yml, deploy-app.yml, destroy-ci.yml or video-capture.yml runs on non-main branches. It blocks until they finish, or, in its alternative mode, waits for any unfinished run resolved to the same environment.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/actions/wait-for-ci-deploys/wait-for-ci-deploys.mjs:main`
- **Files:** .github/actions/wait-for-ci-deploys/action.yml, .github/actions/wait-for-ci-deploys/wait-for-ci-deploys.mjs
- **Keywords:** queue deploys, wait for ci deploys, creation order, non-main branch, race condition, same slot
- **Related:** OPS-10, OPS-13

#### OPS-12 Clean up expired test users

- **Use when:** a lane's test user has outlived its credential expiry window, or needs manual cleanup.
- **Does:** cleanup-test-users.yml deletes or rotates Cognito test-user credentials once their lane's expiry window has passed. It runs daily on a schedule and also accepts a manual dispatch.
- **Run:** `gh workflow run cleanup-test-users.yml -f environment-name=<ci|prod>`
- **Entry:** `.github/workflows/cleanup-test-users.yml`
- **Files:** .github/workflows/cleanup-test-users.yml
- **Keywords:** cleanup test users, cognito test user, expiry window, synthetic user, lane user
- **Related:** OPS-16, OPS-67

#### OPS-13 Auto-destroy stale CI deployments

- **Use when:** a stale or finished ci deployment must be torn down, or a live one's self-destruct timer needs resetting.
- **Does:** SelfDestructStack schedules an EventBridge rule that invokes selfDestruct.js's ingestHandler. The handler deletes a CI deployment's stacks in dependency order and removes leftover S3 buckets and resources. destroy-ci.yml runs the sweep on a schedule, skipping any slot a deploy still holds.
- **Run:** `gh workflow run destroy-ci.yml -f deployment-name=<name> -f sweep-for-stacks=<true|false>`
- **Entry:** `app/functions/infra/selfDestruct.js:ingestHandler`
- **Files:** .github/workflows/destroy-ci.yml, .github/workflows/keepalive.yml, infra/main/java/co/uk/diyaccounting/submit/stacks/SelfDestructStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/SelfDestructStackTest.java, app/functions/infra/selfDestruct.js, app/system-tests/selfDestruct.system.test.js, app/unit-tests/functions/selfDestruct.test.js
- **Keywords:** self-destruct, teardown, destroy stale deployments, sweep, eventbridge, keepalive, creationtime
- **Related:** OPS-10, OPS-14

#### OPS-14 Destroy a named prod deployment on demand

- **Use when:** a superseded prod deployment's stacks must be torn down by hand.
- **Does:** destroy-prod.yml tears down a named prod deployment's stacks once its data can be disposed of.
- **Run:** `gh workflow run destroy-prod.yml -f deployment-name=<name>`
- **Entry:** `.github/workflows/destroy-prod.yml`
- **Files:** .github/workflows/destroy-prod.yml
- **Keywords:** destroy prod, teardown prod deployment, manual destroy, prod stacks, destroy-prod.yml, tear down deployment
- **Related:** OPS-13

#### OPS-15 Serialize lane test-user rotation jobs

- **Use when:** a new workflow job rotates a lane's durable test user, to avoid two jobs racing it.
- **Does:** laneUserWorkflowConcurrency.test.js parses every workflow file. It checks that each job calling ensure-cognito-test-user.js declares a job-level concurrency group for its environment and lane, without cancel-in-progress. Two such jobs racing the same user would otherwise leave one mid-test with its bundle purged out from under it.
- **Run:** `npx vitest --run app/unit-tests/laneUserWorkflowConcurrency.test.js`
- **Entry:** `app/unit-tests/laneUserWorkflowConcurrency.test.js`
- **Files:** app/unit-tests/laneUserWorkflowConcurrency.test.js
- **Keywords:** lane user, concurrency group, cognito test user, ensure-cognito-test-user, race condition, behaviour test lane
- **Related:** OPS-12

#### OPS-16 Run DynamoDB data migrations

- **Use when:** a stored data shape must change across a deploy boundary, or a migration needs a manual re-run.
- **Does:** runner.js applies numbered migration scripts under scripts/migrations/. Each script exports an up() function and a phase, pre-deploy or post-deploy. Applied migrations are tracked in the bundles table; migrations 005 and 006 renamed qualifiers.sandbox to qualifiers.synthetic across a deploy boundary.
- **Run:** `gh workflow run run-migrations.yml -f environment-name=<ci|prod> -f phase=<all|pre-deploy|post-deploy> -f dry-run=<true|false>`
- **Entry:** `scripts/migrations/runner.js:runMigrations`
- **Files:** scripts/migrations/runner.js, scripts/migrations/005-copy-sandbox-qualifier-to-synthetic.js, scripts/migrations/006-drop-sandbox-qualifier.js, app/unit-tests/migrations/005-copy-sandbox-qualifier-to-synthetic.test.js, app/unit-tests/migrations/006-drop-sandbox-qualifier.test.js, app/unit-tests/migrations/runner.test.js, .github/workflows/run-migrations.yml
- **Keywords:** data migration, migration runner, pre-deploy, post-deploy, bundles table, dry run, schema change
- **Related:** OPS-09

### Alarms, triage and probes (OPS)

<!-- generated:group alarms-triage-and-probes-ops -->
- [OPS-17](#ops-17-redact-and-gate-unattended-agent-output-before-publishing) Redact and gate unattended-agent output before publishing
- [OPS-18](#ops-18-run-alarm-and-support-triage) Run alarm and support triage
- [OPS-19](#ops-19-kill-switch-to-stop-unattended-agent-workflows) Kill-switch to stop unattended agent workflows
- [OPS-20](#ops-20-enforce-daily-run-budgets-for-agent-paths) Enforce daily run budgets for agent paths
- [OPS-21](#ops-21-auto-close-resolved-alarm-issues) Auto-close resolved alarm issues
- [OPS-22](#ops-22-verify-a-triage-draft-pr-stays-in-scope) Verify a triage draft-PR stays in scope
- [OPS-23](#ops-23-raise-an-issue-from-a-probe-test-failure) Raise an issue from a probe-test failure
- [OPS-24](#ops-24-gate-probes-on-the-main-apex-deploy) Gate probes on the main apex deploy
- [OPS-25](#ops-25-record-dora-and-probe-metrics) Record DORA and probe metrics
- [OPS-26](#ops-26-run-the-automated-test-suite-in-ci) Run the automated test suite in CI
- [OPS-27](#ops-27-run-probe-tests-against-deployed-environments) Run probe tests against deployed environments
- [OPS-70](#ops-70-forward-operational-activity-events-to-telegram) Forward operational activity events to Telegram
- [OPS-71](#ops-71-create-github-issues-from-cloudwatch-alarms) Create GitHub issues from CloudWatch alarms
- [OPS-72](#ops-72-forward-bedrock-budget-alerts) Forward Bedrock budget alerts
- [OPS-73](#ops-73-detect-404-scan-rate-attacks) Detect 404 scan-rate attacks
- [OPS-74](#ops-74-detect-waf-blocked-scan-attacks) Detect WAF-blocked scan attacks
- [OPS-75](#ops-75-run-nightly-security-lake-analysis) Run nightly Security Lake analysis
- [OPS-76](#ops-76-gather-alarm-evidence-for-investigation) Gather alarm evidence for investigation
- [OPS-77](#ops-77-silence-alarms-during-deployment-teardown) Silence alarms during deployment teardown
- [OPS-78](#ops-78-verify-an-alarm-issues-claimed-transition) Verify an alarm issue's claimed transition
- [OPS-79](#ops-79-track-an-alarm-familys-daily-remedy-budget) Track an alarm family's daily remedy budget
- [OPS-80](#ops-80-build-aws-console-deep-links-for-operators) Build AWS console deep links for operators
<!-- /generated:group alarms-triage-and-probes-ops -->

#### OPS-17 Redact and gate unattended-agent output before publishing

- **Use when:** an unattended agent's output must reach a public GitHub surface safely.
- **Does:** publish-filter runs redact-triage-output.mjs's DENY_PATTERNS and redact function, plus AWS Bedrock guardrails, over an unattended agent's text. It blocks anything that fails before the text reaches a GitHub issue or PR comment. extractFinalAssistantText and maxTurnsNote pull the reportable text out of the agent's --output-format json transcript.
- **Run:** no command; see Does and Entry
- **Entry:** `scripts/redact-triage-output.mjs:redact`; `.github/actions/publish-filter/action.yml`
- **Files:** .github/actions/publish-filter/action.yml, scripts/redact-triage-output.mjs, app/unit-tests/scripts/redactTriageOutput.test.js
- **Keywords:** redact, publish filter, guardrail, bedrock, deny patterns, agent output, unattended agent
- **Related:** OPS-18

#### OPS-18 Run alarm and support triage

- **Use when:** an [ALARM] or support issue needs an automated first-pass triage.
- **Does:** run-triage-agent executes claude -p against Bedrock, Haiku with Sonnet escalation for complex cases. It writes the JSON result to a file without failing the job on the model's verdict. alarm-triage.yml dispatches it from an [ALARM] issue and support-triage.yml from a support issue.
- **Run:** `gh workflow run alarm-triage.yml`; `gh workflow run support-triage.yml`
- **Entry:** `.github/actions/run-triage-agent/action.yml`
- **Files:** .github/actions/run-triage-agent/action.yml, .github/workflows/alarm-triage.yml, .github/workflows/support-triage.yml, app/unit-tests/supportTriageWorkflow.test.js
- **Keywords:** triage agent, alarm triage, support triage, claude -p, bedrock, haiku, sonnet escalation
- **Related:** OPS-17, OPS-19, OPS-20, OPS-23

#### OPS-19 Kill-switch to stop unattended agent workflows

- **Use when:** an unattended agent path must be stopped immediately across an environment.
- **Does:** agent-kill-switch.yml sets the /submit/<env>/agents/kill-switch SSM parameter. The composite action reads that parameter and fails the calling job when it is set. This halts every unattended agent path, alarm-triage and support-triage, in that environment.
- **Run:** `gh workflow run agent-kill-switch.yml -f state=<on|off> -f environment-name=<ci|prod>`
- **Entry:** `.github/actions/agent-kill-switch/action.yml`
- **Files:** .github/actions/agent-kill-switch/action.yml, .github/workflows/agent-kill-switch.yml
- **Keywords:** kill switch, stop agents, ssm parameter, unattended agent, halt triage
- **Related:** OPS-18

#### OPS-20 Enforce daily run budgets for agent paths

- **Use when:** an unattended agent workflow needs a daily cap on how many results it posts.
- **Does:** agent-run-budget counts successful runs of a named workflow, job and step in the last 24 hours. It reports an over-budget status and count, shared by every unattended agent path so this counting logic exists once.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/actions/agent-run-budget/action.yml`
- **Files:** .github/actions/agent-run-budget/action.yml
- **Keywords:** run budget, daily cap, over budget, agent path, rate limit agent
- **Related:** OPS-18

#### OPS-21 Auto-close resolved alarm issues

- **Use when:** checking whether an open alarm issue should already have closed, or to run the close check by hand.
- **Does:** close-alarm-issue-when-ok.mjs checks whether an [ALARM] issue's CloudWatch alarm has returned to OK. alarm-remedy-close.yml runs it on a schedule over every open alarm issue and closes the issue when the alarm is OK.
- **Run:** no command; see Does and Entry
- **Entry:** `scripts/close-alarm-issue-when-ok.mjs:decideClosure`; `scripts/close-alarm-issue-when-ok.mjs:loadRemedyRow`
- **Files:** .github/workflows/alarm-remedy-close.yml, scripts/close-alarm-issue-when-ok.mjs, app/unit-tests/scripts/closeAlarmIssueWhenOk.test.js
- **Keywords:** auto-close, alarm issue, cloudwatch alarm ok, remedy row, alarm family
- **Related:** OPS-25

#### OPS-22 Verify a triage draft-PR stays in scope

- **Use when:** a triage agent's draft PR must be checked before it leaves draft state.
- **Does:** verify-draft-pr-scope.mjs decides whether a triage-generated draft PR may be marked ready for review. Every changed file must be one of the alarm family's own remedy row paths. It fails closed on an empty diff, an unknown family, or a family whose remedy is not draft-pr.
- **Run:** no command; see Does and Entry
- **Entry:** `scripts/verify-draft-pr-scope.mjs:evaluate`; `scripts/verify-draft-pr-scope.mjs:touchesOnlyAllowedPaths`
- **Files:** scripts/verify-draft-pr-scope.mjs, app/unit-tests/scripts/verifyDraftPrScope.test.js
- **Keywords:** draft pr scope, remedy row, alarm family, fail closed, triage-generated pr
- **Related:** OPS-19, OPS-25

#### OPS-23 Raise an issue from a probe-test failure

- **Use when:** a prod probe-test failure needs an issue raised automatically for triage.
- **Does:** probe-failure-issue.yml opens a [PROBE] issue carrying the failure detail, when the main deploy's probe tests fail.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/workflows/probe-failure-issue.yml`
- **Files:** .github/workflows/probe-failure-issue.yml
- **Keywords:** probe failure, probe issue, raise issue, deploy validation failure, probe-failure-issue.yml
- **Related:** OPS-27

#### OPS-24 Gate probes on the main apex deploy

- **Use when:** a probe test or other check must wait until the main apex deploy has finished moving.
- **Does:** wait-for-main-deploy.mjs polls for deploy.yml runs in progress or queued on main, for up to 40 minutes. It reports whether one is still gating, so probe tests never navigate against an apex that is mid-move.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/actions/wait-for-main-deploy/wait-for-main-deploy.mjs:runStillGatesProbes`; `.github/actions/wait-for-main-deploy/wait-for-main-deploy.mjs:decidePollOutcome`
- **Files:** .github/actions/wait-for-main-deploy/action.yml, .github/actions/wait-for-main-deploy/wait-for-main-deploy.mjs, app/unit-tests/actions/waitForMainDeploy.test.js
- **Keywords:** gate probes, wait for main deploy, apex mid-move, main deploy in progress, poll deploy status
- **Related:** OPS-27

#### OPS-25 Record DORA and probe metrics

- **Use when:** a deploy or probe workflow step must record a metrics row for the dashboard.
- **Does:** dora-row writes one JSON row to the S3 analytics bucket per deploy or probe run. The row feeds the DORA and probe panels on the one-stop dashboard.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/actions/dora-row/action.yml`
- **Files:** .github/actions/dora-row/action.yml
- **Keywords:** dora metrics, probe metrics, analytics lake, one-stop dashboard, deploy metrics row
- **Related:** OPS-26, OPS-27

#### OPS-26 Run the automated test suite in CI

- **Use when:** checking which test tiers run on every push and pull request.
- **Does:** test.yml runs the unit, system, browser and behaviour test tiers, triggered on every push and pull request.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/workflows/test.yml`
- **Files:** .github/workflows/test.yml
- **Keywords:** test suite, unit tests, system tests, browser tests, behaviour tests, push and pr trigger
- **Related:** OPS-33

#### OPS-27 Run probe tests against deployed environments

- **Use when:** a deployed environment's behaviour must be confirmed after a deploy, outside the full deploy.yml pipeline.
- **Does:** probe-test.yml runs end-to-end probe tests against a live ci or prod deployment. It confirms the deployment is working after a deploy, or on demand.
- **Run:** `gh workflow run probe-test.yml -f environment-name=<ci|prod>`
- **Entry:** `.github/workflows/probe-test.yml`
- **Files:** .github/workflows/probe-test.yml
- **Keywords:** probe test, end-to-end, deployed environment, post-deploy validation, smoke test
- **Related:** OPS-24, OPS-26

#### OPS-70 Forward operational activity events to Telegram

- **Use when:** an EventBridge activity event needs routing to the right Telegram group as formatted text.
- **Does:** activityTelegramForwarder.js is the EventBridge target Lambda for operational activity events. It resolves chat routing per event type and formats the message. handler(event) posts it to the Telegram Bot API. It runs on the activity EventBridge trigger, not on demand.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/ops/activityTelegramForwarder.js:handler`
- **Files:** app/functions/ops/activityTelegramForwarder.js, app/unit-tests/functions/activityTelegramForwarder.test.js
- **Keywords:** telegram, activity events, eventbridge, ops notifications, chat routing, alerts, forwarder
- **Related:** OPS-72

#### OPS-71 Create GitHub issues from CloudWatch alarms

- **Use when:** a CloudWatch alarm fires and needs a tracked GitHub issue instead of a one-off notification.
- **Does:** alarmToGithubIssue.js is the EventBridge target Lambda for aws.cloudwatch Alarm State Change events. It opens one [ALARM] GitHub issue per alarm family, keyed by alarmName.js with the deployment slug removed, or comments on the existing issue. dynamoDbAlarmIssueLockRepository.js claims each transition with a conditional put so two deployments never both raise an issue.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/ops/alarmToGithubIssue.js:handler`; `app/lib/alarmName.js:alarmFamilyKey`; `app/data/dynamoDbAlarmIssueLockRepository.js:claimAlarmStateChange`
- **Files:** app/functions/ops/alarmToGithubIssue.js, app/unit-tests/functions/alarmToGithubIssue.test.js, app/data/dynamoDbAlarmIssueLockRepository.js, app/lib/alarmName.js, app/unit-tests/lib/alarmName.test.js
- **Keywords:** cloudwatch alarm, github issue, alarm family, alarm state change, dedupe, lock, alert routing, [ALARM]
- **Related:** OPS-76, OPS-78, OPS-79

#### OPS-72 Forward Bedrock budget alerts

- **Use when:** an AWS Bedrock cost or token-limit alert must reach the operations channel.
- **Does:** bedrockBudgetAlertForward.js relays AWS Bedrock cost and token-limit SNS alerts to the operations Telegram channel. parseBudgetSnsRecord extracts the alert fields and summarizeBudgetAlert formats the summary.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/ops/bedrockBudgetAlertForward.js:handler`
- **Files:** app/functions/ops/bedrockBudgetAlertForward.js, app/unit-tests/functions/bedrockBudgetAlertForward.test.js
- **Keywords:** bedrock, budget alert, cost alert, token limit, sns, telegram, ops channel
- **Related:** OPS-70

#### OPS-73 Detect 404 scan-rate attacks

- **Use when:** a single client IP is probing many paths and the 404 rate against one distribution needs watching.
- **Does:** scanRate404Detect.js runs every five minutes over the cloudfront_requests Glue table of CloudFront access logs. It flags a client IP that raises more than a configured 404 threshold in a minute against one distribution. ScanDetectionStack owns the Lambda and its EventBridge schedule, and creates no VPC Flow Logs.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/security/scanRate404Detect.js:handler`
- **Files:** app/functions/security/scanRate404Detect.js, app/unit-tests/functions/scanRate404Detect.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/ScanDetectionStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/ScanDetectionStackTest.java
- **Keywords:** 404 scan, scan rate, cloudfront logs, glue athena, security detection, brute force, distribution
- **Related:** OPS-74, OPS-75

#### OPS-74 Detect WAF-blocked scan attacks

- **Use when:** requests the SensitivePathScan WAF rule blocked need to become an ops alert, or a block needs a false-positive check.
- **Does:** wafScanDetect.js subscribes to the WAF access-log group's blocks-only CloudWatch Logs subscription filter, wired in EdgeStack. Each invocation decodes a gzipped log batch and turns every SensitivePathScan block into an ops Telegram alert. verify-waf-false-positives.sh audits CloudFront access logs for requests WAF blocked and flags likely false positives.
- **Run:** `./scripts/verify-waf-false-positives.sh`
- **Entry:** `app/functions/security/wafScanDetect.js:handler`; `scripts/verify-waf-false-positives.sh`
- **Files:** app/functions/security/wafScanDetect.js, app/unit-tests/functions/wafScanDetect.test.js, scripts/verify-waf-false-positives.sh
- **Keywords:** waf, sensitivepathscan, blocked requests, subscription filter, false positive, scan detection, cloudfront waf
- **Related:** OPS-73

#### OPS-75 Run nightly Security Lake analysis

- **Use when:** the previous day's AWS Security Lake data needs an automated threat and pattern review.
- **Does:** securityLakeNightly.js analyzes the previous day's AWS Security Lake data for threats and suspicious patterns. SecurityLakeStack and SecurityLakeTables provision the Security Lake sources and the Glue and Athena tables it reads.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/security/securityLakeNightly.js:handler`
- **Files:** app/functions/security/securityLakeNightly.js, app/unit-tests/functions/security/securityLakeNightly.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/security/SecurityLakeStack.java, infra/main/java/co/uk/diyaccounting/submit/stacks/security/SecurityLakeTables.java, infra/test/java/co/uk/diyaccounting/submit/stacks/security/SecurityLakeStackTest.java
- **Keywords:** security lake, nightly analysis, guardduty, security hub findings, threat detection, glue athena
- **Related:** OPS-73, OPS-74

#### OPS-76 Gather alarm evidence for investigation

- **Use when:** an operator investigating a firing alarm needs the right log groups, X-Ray filters and console links fast.
- **Does:** alarmEvidence.js maps a CloudWatch alarm to the log groups, X-Ray filters, DynamoDB tables and console links an operator needs, via an ordered rule list with unconditional fallbacks so every alarm resolves to something. alarmWindow.js derives the absolute time window for those queries, floored at five minutes and capped at one hour to cover log delivery lag. resolve-alarm-evidence.mjs runs this mapping from the command line.
- **Run:** `node scripts/resolve-alarm-evidence.mjs --alarm-name <name> --region <region> --from-alarm`; `node scripts/resolve-alarm-evidence.mjs --alarm-name <name> --deployment <deployment> --namespace <namespace> --metric-name <metric> --dimensions '<json>' --start <iso> --end <iso> --region <region>`
- **Entry:** `app/lib/alarmEvidence.js:resolveAlarmEvidence`; `app/lib/alarmWindow.js:resolveAlarmWindow`; `scripts/resolve-alarm-evidence.mjs`
- **Files:** app/lib/alarmEvidence.js, app/unit-tests/lib/alarmEvidence.test.js, app/lib/alarmWindow.js, app/unit-tests/lib/alarmWindow.test.js, scripts/resolve-alarm-evidence.mjs, app/unit-tests/scripts/resolveAlarmEvidence.test.js
- **Keywords:** alarm evidence, log groups, x-ray, console links, investigation, triage, time window
- **Related:** OPS-71, OPS-80

#### OPS-77 Silence alarms during deployment teardown

- **Use when:** a deployment is being torn down and its alarms must not fire GitHub issues or Telegram alerts.
- **Does:** alarmSilence.js reads an SSM parameter a deployment's teardown writes before it deletes anything. The alarm-to-GitHub-issue and Telegram-forwarder routers drop any ALARM state change for a silenced deployment. silence-deployment-alarms.mjs is the CLI that arms and clears the silence around a deployment window.
- **Run:** `node scripts/silence-deployment-alarms.mjs --env <env> --deployment <deployment>`
- **Entry:** `app/lib/alarmSilence.js:silenceDeployment`; `scripts/silence-deployment-alarms.mjs`
- **Files:** app/lib/alarmSilence.js, app/unit-tests/lib/alarmSilence.test.js, scripts/silence-deployment-alarms.mjs
- **Keywords:** alarm silence, teardown, ssm parameter, deployment window, suppress alerts, destroy workflow
- **Related:** OPS-71, OPS-70

#### OPS-78 Verify an alarm issue's claimed transition

- **Use when:** triage must confirm an alarm issue's stated window and transition really happened before acting on it.
- **Does:** verify-alarm-origin.mjs re-reads cloudwatch describe-alarm-history to confirm the named alarm transitioned to ALARM inside the window the issue body claims. It fails closed: a missing name, an unparseable window, an AWS error, or no matching transition all return verified false. alarm-triage.yml exits non-zero on an unverified result.
- **Run:** `node scripts/verify-alarm-origin.mjs --alarm-name <name> --window "<window text>" --region <region>`
- **Entry:** `scripts/verify-alarm-origin.mjs`
- **Files:** scripts/verify-alarm-origin.mjs, app/unit-tests/scripts/verifyAlarmOrigin.test.js
- **Keywords:** alarm history, verify transition, fail closed, triage workflow, describe-alarm-history, proof
- **Related:** OPS-71, OPS-79

#### OPS-79 Track an alarm family's daily remedy budget

- **Use when:** auto-remediation for an alarm family must stop once its daily budget of remedies is spent.
- **Does:** remedy-budget-remaining.mjs counts how many remedy:* labels an alarm family already had applied today against its declared budgetPerDay. alarm-triage.yml stops auto-remediating, such as dispatching a workflow or marking a draft PR ready, once a family's daily budget is spent. It fails closed toward giving budget back, never toward denying it.
- **Run:** `node scripts/remedy-budget-remaining.mjs --family <family> --budget <n> --repo <owner/name>`
- **Entry:** `scripts/remedy-budget-remaining.mjs`
- **Files:** scripts/remedy-budget-remaining.mjs, app/unit-tests/scripts/remedyBudgetRemaining.test.js, app/unit-tests/data/alarmRemedies.test.js
- **Keywords:** remedy budget, auto-remediate, daily budget, alarm family, triage workflow, rate limit
- **Related:** OPS-71, OPS-78

#### OPS-80 Build AWS console deep links for operators

- **Use when:** an alert or report needs a direct link into CloudWatch logs, alarms or X-Ray instead of a description.
- **Does:** consoleLinks.js generates direct URLs into the AWS console for CloudWatch logs, alarms, dashboards, Athena and X-Ray traces. An operator investigating an alert jumps straight to the relevant resource.
- **Run:** no command; see Does and Entry
- **Entry:** `app/lib/consoleLinks.js:buildAlarmConsoleLink`; `app/lib/consoleLinks.js:buildLogsInsightsLink`
- **Files:** app/lib/consoleLinks.js, app/unit-tests/lib/consoleLinks.test.js
- **Keywords:** console links, cloudwatch console, x-ray console, deep link, operator tooling, athena link
- **Related:** OPS-76

### Security and compliance (OPS)

<!-- generated:group security-and-compliance-ops -->
- [OPS-28](#ops-28-enforce-commit-identity-allowlist) Enforce commit identity allowlist
- [OPS-29](#ops-29-verify-commit-signatures-on-pull-requests) Verify commit signatures on pull requests
- [OPS-30](#ops-30-run-codeql-security-scanning) Run CodeQL security scanning
- [OPS-31](#ops-31-run-a-claude-security-review-on-push) Run a Claude security review on push
- [OPS-32](#ops-32-detect-cloudformation-drift) Detect CloudFormation drift
- [OPS-33](#ops-33-enforce-workflow-to-workflow-permission-grants) Enforce workflow-to-workflow permission grants
- [OPS-34](#ops-34-validate-github-actions-workflow-files) Validate GitHub Actions workflow files
- [OPS-35](#ops-35-verify-third-party-console-configuration-against-declared-state) Verify third-party console configuration against declared state
- [OPS-36](#ops-36-configure-dependabot-dependency-updates) Configure Dependabot dependency updates
- [OPS-37](#ops-37-check-https-certificate-expiry) Check HTTPS certificate expiry
- [OPS-38](#ops-38-run-the-weekly-compliance-test-check) Run the weekly compliance-test check
- [OPS-39](#ops-39-generate-a-software-bill-of-materials) Generate a software bill of materials
<!-- /generated:group security-and-compliance-ops -->

#### OPS-28 Enforce commit identity allowlist

- **Use when:** a PR's commit authorship must be checked against the allowed identity list.
- **Does:** identity-guard.yml checks, on every PR, that all commit authors' email addresses appear in allowed-commit-identities.yml. It rejects commits from unrecognised identities.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/workflows/identity-guard.yml`
- **Files:** .github/allowed-commit-identities.yml, .github/workflows/identity-guard.yml
- **Keywords:** identity guard, commit identity, allowlist, author email, unrecognised identity
- **Related:** OPS-29

#### OPS-29 Verify commit signatures on pull requests

- **Use when:** a PR's commits must all carry a verified signature before merge.
- **Does:** verify-commit-signatures.yml reads each commit's commit.verification field from the GitHub API. It fails the PR, as a required status check, if any commit is unsigned.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/workflows/verify-commit-signatures.yml`
- **Files:** .github/workflows/verify-commit-signatures.yml
- **Keywords:** commit signatures, required status check, gpg signing, unsigned commit, verification field
- **Related:** OPS-28

#### OPS-30 Run CodeQL security scanning

- **Use when:** checking what CodeQL scans, or excluding a new non-production path from the scan.
- **Does:** codeql.yml runs CodeQL against main on its schedule. codeql-config.yml excludes test code, mock infrastructure and other non-production files from the scan.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/workflows/codeql.yml`
- **Files:** .github/codeql/codeql-config.yml, .github/workflows/codeql.yml
- **Keywords:** codeql, static analysis, security scan, scheduled scan, exclude paths
- **Related:** OPS-36

#### OPS-31 Run a Claude security review on push

- **Use when:** checking how pushed changes get an automated security review.
- **Does:** security-review.yml triggers a Claude session that reviews changed code for security issues on push.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/workflows/security-review.yml`
- **Files:** .github/workflows/security-review.yml
- **Keywords:** security review, claude review, push trigger, automated code review, security-review.yml
- **Related:** OPS-31

#### OPS-32 Detect CloudFormation drift

- **Use when:** checking whether deployed stacks have drifted from their CDK definition.
- **Does:** stack-drift.yml runs CloudFormation drift detection across the deployed stacks, on a schedule. It surfaces manual changes made outside CDK.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/workflows/stack-drift.yml`
- **Files:** .github/workflows/stack-drift.yml
- **Keywords:** cloudformation drift, drift detection, manual change, outside cdk, scheduled check
- **Related:** OPS-08

#### OPS-33 Enforce workflow-to-workflow permission grants

- **Use when:** a workflow calls another reusable workflow and its permission grants need checking before a run fails.
- **Does:** check-workflow-permissions.mjs re-derives GitHub's own reusable-workflow permission check with a line-based reader, not a YAML parser. It verifies every permissions scope a called workflow's jobs use was granted by the caller. It catches what actionlint does not, and what otherwise only fails at run start with no per-job log.
- **Run:** `node scripts/check-workflow-permissions.mjs`
- **Entry:** `scripts/check-workflow-permissions.mjs:findViolations`; `scripts/check-workflow-permissions.mjs:parseWorkflow`
- **Files:** scripts/check-workflow-permissions.mjs, app/unit-tests/scripts/checkWorkflowPermissions.test.js
- **Keywords:** workflow permissions, reusable workflow, permission grant, actionlint gap, called workflow
- **Related:** OPS-33

#### OPS-34 Validate GitHub Actions workflow files

- **Use when:** a workflow file's syntax or deployment-safety conventions need checking before a push.
- **Does:** validate-workflows.sh parses every .github/workflows/*.yml file. It checks syntax, required environment variables and deployment-safety conventions.
- **Run:** `npm run lint:workflows`; `./scripts/validate-workflows.sh`
- **Entry:** `scripts/validate-workflows.sh`
- **Files:** scripts/validate-workflows.sh
- **Keywords:** validate workflows, workflow lint, yaml syntax, deployment safety conventions, required env vars
- **Related:** OPS-32

#### OPS-35 Verify third-party console configuration against declared state

- **Use when:** a third-party console's live configuration must be checked against the declared infra/** state.
- **Does:** infra-apply.yml runs one read-only check per provider: Companies House, HMRC, Stripe, PayPal and Telegram. Each check asserts live state against the file that provider's infra/** directory declares. Its github-sync step plans this repository's own GitHub settings from infra/github/github.toml, applied only by a person holding ADMIN_TOKEN.
- **Run:** `gh workflow run infra-apply.yml`
- **Entry:** `infra/github/github-sync.js:parseConfig`; `infra/telegram/telegram-assert.js:assertBot`
- **Files:** .github/workflows/infra-apply.yml, infra/github/github-sync.js, infra/github/github.toml, infra/telegram/telegram-assert.js, infra/telegram/telegram.toml, app/unit-tests/scripts/telegramAssert.test.js, app/unit-tests/scripts/githubSync.test.js
- **Keywords:** third-party console, infra-apply, companies house, hmrc, stripe, paypal, telegram, github settings, declared state
- **Related:** OPS-42

#### OPS-36 Configure Dependabot dependency updates

- **Use when:** checking or changing which ecosystems Dependabot updates, or its schedule.
- **Does:** dependabot.yml declares which package managers, schedules and grouping strategy Dependabot uses. It raises dependency-update pull requests from that configuration.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/dependabot.yml`
- **Files:** .github/dependabot.yml
- **Keywords:** dependabot, dependency updates, package manager, grouping strategy, scheduled pr

#### OPS-37 Check HTTPS certificate expiry

- **Use when:** checking whether a served domain's certificate is close to expiry.
- **Does:** certificate-check.yml checks ACM and Let's Encrypt certificates for the domains this repository serves, on a schedule. It alerts before a certificate expires.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/workflows/certificate-check.yml`
- **Files:** .github/workflows/certificate-check.yml
- **Keywords:** certificate expiry, acm, lets encrypt, https certificate, scheduled alert, tls cert check
- **Related:** OPS-45

#### OPS-38 Run the weekly compliance-test check

- **Use when:** a compliance commitment's status needs re-checking, or a new commitment needs adding to compliance.toml.
- **Does:** compliance.yml runs on a Monday schedule, and on demand, against a chosen environment. It is driven by the standing commitments in compliance.toml, each with an owner and a due date. generate-compliance-report.js turns the accessibility and penetration test output into that report.
- **Run:** `gh workflow run compliance.yml -f environment-name=<ci|prod>`; `npm run compliance:ci-report-md`; `npm run compliance:prod-report-md`
- **Entry:** `scripts/generate-compliance-report.js:parseNpmAudit`; `scripts/generate-compliance-report.js:parsePa11yReport`
- **Files:** .github/workflows/compliance.yml, compliance.toml, scripts/generate-compliance-report.js
- **Keywords:** compliance check, compliance.toml, weekly schedule, compliance panel, accessibility report, penetration report
- **Related:** OPS-61

#### OPS-39 Generate a software bill of materials

- **Use when:** a dependency inventory of the shipped application is needed.
- **Does:** sbom.yml generates a software bill of materials for the application and publishes it.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/workflows/sbom.yml`
- **Files:** .github/workflows/sbom.yml
- **Keywords:** sbom, bill of materials, dependency inventory, supply chain, software composition
- **Related:** OPS-51

### Data protection and privacy (OPS)

<!-- generated:group data-protection-and-privacy-ops -->
- [OPS-40](#ops-40-delete-a-customers-data-for-gdpr-erasure) Delete a customer's data for GDPR erasure
- [OPS-41](#ops-41-export-a-customers-gdpr-subject-access-data) Export a customer's GDPR subject-access data
- [OPS-42](#ops-42-guide-icogdpr-compliance) Guide ICO/GDPR compliance
- [OPS-43](#ops-43-rotate-stored-email-address-hashes) Rotate stored email-address hashes
- [OPS-44](#ops-44-hash-and-rotate-the-subject-id-salt) Hash and rotate the subject-ID salt
- [OPS-45](#ops-45-manage-aws-secrets-manager-entries-and-rotation-tags) Manage AWS Secrets Manager entries and rotation tags
- [OPS-46](#ops-46-query-and-persist-per-consumer-security-state-records) Query and persist per-consumer security-state records
- [OPS-47](#ops-47-check-fraud-prevention-header-record-freshness) Check fraud-prevention header record freshness
- [OPS-48](#ops-48-verify-backup-health-daily) Verify backup health daily
- [OPS-49](#ops-49-request-and-renew-the-holding-page-certificate) Request and renew the holding-page certificate
- [OPS-50](#ops-50-drill-and-test-pitr-database-restoration) Drill and test PITR database restoration
<!-- /generated:group data-protection-and-privacy-ops -->

#### OPS-40 Delete a customer's data for GDPR erasure

- **Use when:** a customer has exercised their GDPR right to erasure.
- **Does:** delete-user-data.js deletes a customer's DynamoDB records, OAuth tokens and audit logs, via the DynamoDB API and Secrets Manager. delete-user-data-by-email.yml resolves an email to its hashed subject through an Athena lookup first; delete-user-data.yml deletes directly by hashed subject. confirm=false runs a dry run.
- **Run:** `gh workflow run delete-user-data-by-email.yml -f email=<email> -f environment-name=<ci|prod> -f confirm=<true|false>`; `gh workflow run delete-user-data.yml -f hashed-sub=<hash> -f environment-name=<ci|prod> -f confirm=<true|false>`
- **Entry:** `scripts/delete-user-data.js:main`
- **Files:** .github/workflows/delete-user-data-by-email.yml, .github/workflows/delete-user-data.yml, scripts/delete-user-data.js
- **Keywords:** gdpr erasure, delete user data, right to be forgotten, hashed sub, athena lookup, dry run
- **Related:** OPS-41, OPS-49

#### OPS-41 Export a customer's GDPR subject-access data

- **Use when:** a customer has made a GDPR subject-access request.
- **Does:** export-user-data.js compiles a customer's personal data into one subject-access package. It reads DynamoDB records, S3 receipts, Athena-queried activity and email records.
- **Run:** `gh workflow run export-user-data.yml -f email=<email> -f environment-name=<ci|prod> -f confirm=<true|false>`
- **Entry:** `scripts/export-user-data.js:main`
- **Files:** .github/workflows/export-user-data.yml, scripts/export-user-data.js
- **Keywords:** gdpr subject access, export user data, sar, data export, personal data package
- **Related:** OPS-40, OPS-49

#### OPS-42 Guide ICO/GDPR compliance

- **Use when:** checking this service's obligations against UK GDPR or ICO requirements.
- **Does:** ICO_CHECKLIST.md is a checklist against UK GDPR and ICO requirements for this service.
- **Run:** no command; see Does and Entry
- **Entry:** `_developers/ICO_CHECKLIST.md`
- **Files:** _developers/ICO_CHECKLIST.md
- **Keywords:** ico checklist, uk gdpr, data protection, regulatory checklist, ico compliance
- **Related:** OPS-40, OPS-41

#### OPS-43 Rotate stored email-address hashes

- **Use when:** the email-hash encryption key must be rotated across all stored hashes.
- **Does:** email-hash-rotate.js decrypts every stored email hash in DynamoDB with the old encryption key. It re-encrypts each one with a new key through a batch scan and update. EmailHashSecretHelper is the CDK-side Secrets-Manager-backed encrypt and decrypt helper it calls.
- **Run:** `gh workflow run email-hash-rotate.yml -f apply=<true|false>`
- **Entry:** `scripts/email-hash-rotate.js:main`; `infra/main/java/co/uk/diyaccounting/submit/utils/EmailHashSecretHelper.java`
- **Files:** .github/workflows/email-hash-rotate.yml, scripts/email-hash-rotate.js, infra/main/java/co/uk/diyaccounting/submit/utils/EmailHashSecretHelper.java
- **Keywords:** email hash rotation, encryption key rotation, emailhashsecrethelper, batch scan update, email-hash-rotate.js
- **Related:** OPS-45, OPS-46

#### OPS-44 Hash and rotate the subject-ID salt

- **Use when:** the subject-ID salt needs backing up, restoring, or its resource policy reasserting.
- **Does:** subHasher.js computes salted HMAC hashes of Cognito subject IDs for analytics and fraud-header anonymisation, backed by SubHashSaltHelper. put-salt-secret-resource-policy.sh reasserts the salt secret's resource policy on every environment deploy. This runs before any per-deployment Lambda role exists; backup-salts.sh and restore-salt.sh export and re-apply the salt for disaster recovery.
- **Run:** `./scripts/backup-salts.sh`; `./scripts/aws-accounts/restore-salt.sh --source-profile <profile> --target-profile <profile> [--env <env>]`; `gh workflow run manage-secrets.yml -f action=backup-salt -f environment-name=<ci|prod>`
- **Entry:** `app/services/subHasher.js:hashSub`; `infra/main/java/co/uk/diyaccounting/submit/utils/SubHashSaltHelper.java`
- **Files:** app/services/subHasher.js, app/unit-tests/services/subHasher.test.js, infra/main/java/co/uk/diyaccounting/submit/utils/SubHashSaltHelper.java, scripts/put-salt-secret-resource-policy.sh, scripts/backup-salts.sh, scripts/aws-accounts/restore-salt.sh, scripts/migrations/001-convert-salt-to-registry.js, scripts/migrations/002-backfill-salt-version-v1.js
- **Keywords:** subject id salt, subhasher, salt rotation, resource policy, backup salt, restore salt, hmac hash
- **Related:** OPS-44, OPS-16

#### OPS-45 Manage AWS Secrets Manager entries and rotation tags

- **Use when:** a secret's value or rotation date needs checking, listing, backing up or restoring.
- **Does:** manage-secrets.yml lists, checks, backs up and restores secrets for an environment, including the user-sub-hash salt. put-secret-with-rotation-tag.sh writes or updates a secret and stamps a rotated-at tag only when the value changes. Otherwise every environment deploy would rewrite every secret's rotation tag regardless of change.
- **Run:** `gh workflow run manage-secrets.yml -f action=<list|check|check-salt|check-rotation|backup-salt|restore-salt> -f environment-name=<ci|prod>`
- **Entry:** `scripts/put-secret-with-rotation-tag.sh`
- **Files:** .github/workflows/manage-secrets.yml, scripts/put-secret-with-rotation-tag.sh, secrets-rotation.toml
- **Keywords:** secrets manager, rotation tag, manage-secrets workflow, rotated-at, salt secret
- **Related:** OPS-43, OPS-10

#### OPS-46 Query and persist per-consumer security-state records

- **Use when:** a Lambda needs a short-TTL rate counter or mid-session geo record for security state.
- **Does:** dynamoDbSecurityStateRepository.js is the repository for the {env}-env-security-state table's three short-TTL item shapes. rate# holds bundle-endpoint burst counters and supportticket# holds rate limiting. geo# holds mid-session country state used by the data-theft detection Lambdas.
- **Run:** no command; see Does and Entry
- **Entry:** `app/data/dynamoDbSecurityStateRepository.js:incrementRateCounter`; `app/data/dynamoDbSecurityStateRepository.js:getSessionGeo`; `app/data/dynamoDbSecurityStateRepository.js:putSessionGeo`
- **Files:** app/data/dynamoDbSecurityStateRepository.js, app/unit-tests/data/dynamoDbSecurityStateRepository.test.js
- **Keywords:** security state, rate counter, geo state, data-theft detection, short ttl, burst counter
- **Related:** OPS-44

#### OPS-47 Check fraud-prevention header record freshness

- **Use when:** checking whether this month's fraud-prevention-header compliance record has landed.
- **Does:** fraud-header-check.yml checks that the current month's HMRC fraud-prevention-header compliance record has landed on the branch. A laptop-only launchd agent writes that record from the private mail mirror. GitHub Actions cannot reach that mirror, so this workflow turns a silent local failure into a red CI run.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/workflows/fraud-header-check.yml`
- **Files:** .github/workflows/fraud-header-check.yml
- **Keywords:** fraud prevention header, hmrc compliance record, launchd agent, monthly record, silent local failure
- **Related:** OPS-40

#### OPS-48 Verify backup health daily

- **Use when:** checking whether daily backups and their cross-account copy completed.
- **Does:** verify-backups.yml checks PITR status, the local backup vault, and backup and copy job outcomes, daily. It includes the cross-account copy to the backup account.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/workflows/verify-backups.yml`
- **Files:** .github/workflows/verify-backups.yml
- **Keywords:** backup health, pitr status, backup vault, cross-account copy, daily check
- **Related:** OPS-50

#### OPS-49 Request and renew the holding-page certificate

- **Use when:** the holding-page domain needs a new or renewed ACM certificate.
- **Does:** request-holding-cert.yml requests an ACM certificate for the holding-page domain, or renews the existing one.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/workflows/request-holding-cert.yml`
- **Files:** .github/workflows/request-holding-cert.yml
- **Keywords:** holding page certificate, acm certificate, certificate renewal, request-holding-cert.yml, holding page domain
- **Related:** OPS-30

#### OPS-50 Drill and test PITR database restoration

- **Use when:** a PITR restore procedure must be drilled or tested against a real table.
- **Does:** restore-dynamodb-pitr.sh restores a DynamoDB table to a point in time, or to a target table. restore-drill.yml runs the drill on a schedule to prove the procedure still works. restore-test.yml runs a restore from PITR or the cross-account backup on demand.
- **Run:** `gh workflow run restore-drill.yml`; `gh workflow run restore-test.yml -f table-name=<table>`; `./scripts/restore-dynamodb-pitr.sh <table-name> <restore-datetime> [target-table-name]`
- **Entry:** `scripts/restore-dynamodb-pitr.sh`
- **Files:** .github/workflows/restore-drill.yml, .github/workflows/restore-test.yml, scripts/restore-dynamodb-pitr.sh, _developers/RESTORE_DRILL.md
- **Keywords:** pitr restore, restore drill, point in time recovery, dynamodb restore, cross-account backup
- **Related:** OPS-49

### Video, publishing and accessibility (OPS)

<!-- generated:group video-publishing-and-accessibility-ops -->
- [OPS-51](#ops-51-publish-build-artifacts-and-documentation) Publish build artifacts and documentation
- [OPS-52](#ops-52-auto-record-demo-videos-on-prod-deploy) Auto-record demo videos on prod deploy
- [OPS-53](#ops-53-verify-youtube-channel-consistency-weekly) Verify YouTube channel consistency weekly
- [OPS-88](#ops-88-orchestrate-demo-video-recording-journeys) Orchestrate demo-video recording journeys
- [OPS-89](#ops-89-overlay-pointer-and-caption-cues-on-video) Overlay pointer and caption cues on video
- [OPS-90](#ops-90-encode-captured-video-frames-and-captions) Encode captured video frames and captions
- [OPS-91](#ops-91-validate-video-scene-scripts-and-timing) Validate video scene scripts and timing
- [OPS-92](#ops-92-redact-secrets-from-video-artefacts) Redact secrets from video artefacts
- [OPS-93](#ops-93-publish-demo-videos-to-youtube) Publish demo videos to YouTube
- [OPS-94](#ops-94-play-demo-videos-on-the-public-site) Play demo videos on the public site
- [OPS-95](#ops-95-generate-wcag-accessibility-compliance-rows) Generate WCAG accessibility compliance rows
- [OPS-96](#ops-96-scan-pages-for-accessibility-violations) Scan pages for accessibility violations
- [OPS-97](#ops-97-compile-the-compliance-audit-report) Compile the compliance audit report
<!-- /generated:group video-publishing-and-accessibility-ops -->

#### OPS-51 Publish build artifacts and documentation

- **Use when:** checking where build artifacts or generated documentation get published.
- **Does:** publish.yml publishes build artifacts, npm packages and Docker images, and generated documentation, to their destinations.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/workflows/publish.yml`
- **Files:** .github/workflows/publish.yml
- **Keywords:** publish artifacts, npm package, docker image, generated documentation, publish.yml

#### OPS-52 Auto-record demo videos on prod deploy

- **Use when:** a prod deploy changes a page and its demo video needs re-recording.
- **Does:** video-capture-on-deploy.yml runs after deploy.yml. It dispatches video-capture.yml to re-record the scene videos for whichever pages changed. video-capture.yml records one scene script from videos/*.json against a running deployment, using site-video-capture.js.
- **Run:** no command; see Does and Entry
- **Entry:** `scripts/site-video-capture.js`
- **Files:** .github/workflows/video-capture-on-deploy.yml, .github/workflows/video-capture.yml
- **Keywords:** video capture, demo video, scene script, post-deploy recording, site-video-capture

#### OPS-53 Verify YouTube channel consistency weekly

- **Use when:** checking whether the stored YouTube credentials or channel state have gone stale.
- **Does:** youtube-check.yml checks weekly that the stored YouTube refresh token and channel state are still valid. It runs as github-actions[bot].
- **Run:** no command; see Does and Entry
- **Entry:** `.github/workflows/youtube-check.yml`
- **Files:** .github/workflows/youtube-check.yml
- **Keywords:** youtube check, refresh token, channel state, weekly verification, youtube-check.yml

#### OPS-88 Orchestrate demo-video recording journeys

- **Use when:** a new or changed product journey needs a recorded demo video driven end to end by Playwright.
- **Does:** capture-demo-videos.js and site-video-capture.js drive Playwright through a scene script (videos/*.json) end to end. journey.js stands up the local services and mints the HMRC sandbox test user a logged-in scene needs. behaviourSteps.js bridges into the same step functions the behaviour tests use, via appAliasHook.js's @app/* resolution. actions.js dispatches each scene step to a Playwright locator, waitPhase.js brackets the real network wait, pacing.js computes the pause and wait-compression timing, and values.js resolves placeholders such as VAT number, NINO and dates.
- **Run:** `node scripts/site-video-capture.js --script videos/<name>.json`; `npx dotenv -e .env.simulator -- node scripts/capture-demo-videos.js`; `npm run video:tour-proxy`; `npm run video:view-obligations-ci`; `npm run video:submit-return-prod`; `npm run video:itsa-business-details-ci`
- **Entry:** `scripts/site-video-capture.js`; `scripts/capture-demo-videos.js`; `scripts/lib/video/journey.js`
- **Files:** scripts/capture-demo-videos.js, scripts/site-video-capture.js, scripts/lib/video/capture.js, scripts/lib/video/journey.js, scripts/lib/video/behaviourSteps.js, scripts/lib/video/appAliasHook.js, scripts/lib/video/actions.js, scripts/lib/video/waitPhase.js, scripts/lib/video/pacing.js, scripts/lib/video/values.js, app/unit-tests/video/journey.test.js, app/unit-tests/video/pacing.test.js, app/unit-tests/video/waitPhase.test.js, app/unit-tests/video/values.test.js, behaviour-tests/captureDemo.behaviour.test.js
- **Keywords:** video capture, playwright, scene script, demo video, journey, hmrc sandbox test user, recording
- **Related:** OPS-89, OPS-90, OPS-91, OPS-92

#### OPS-89 Overlay pointer and caption cues on video

- **Use when:** a recorded scene needs an on-screen pointer, trail, caption or timer overlay that survives page navigation.
- **Does:** overlay-runtime.js is a self-contained in-page script, with no imports and no bundler, installed via page.addInitScript so the pointer, trail, caption and timer overlay survives every navigation in the tour. overlay.js is the Node-side wrapper that reads it as text and installs it.
- **Run:** no command; see Does and Entry
- **Entry:** `scripts/lib/video/overlay.js`; `scripts/lib/video/overlay-runtime.js`
- **Files:** scripts/lib/video/overlay.js, scripts/lib/video/overlay-runtime.js
- **Keywords:** overlay, pointer cue, caption overlay, timer pill, in-page script, addinitscript
- **Related:** OPS-88

#### OPS-90 Encode captured video frames and captions

- **Use when:** a recorded scene's raw frames need encoding to video and its captions need generating to match.
- **Does:** encode.js builds the ffmpeg concat-demuxer manifest from the frame ledger capture.js writes, and shells out to ffmpeg, via ffmpeg-static, to produce constant-fps H.264 output. captions.js generates the WebVTT and transcript from the same step record, so the SC 1.2.1 text alternative always matches the built video. playwright-video-reporter.js copies a Playwright test's recorded video to a stable path for downstream tooling.
- **Run:** no command; see Does and Entry
- **Entry:** `scripts/lib/video/encode.js`; `scripts/lib/video/captions.js`; `scripts/playwright-video-reporter.js`
- **Files:** scripts/lib/video/encode.js, scripts/lib/video/captions.js, app/unit-tests/video/encode.test.js, app/unit-tests/video/captions.test.js, scripts/playwright-video-reporter.js
- **Keywords:** ffmpeg, video encode, webvtt, transcript, captions, sc 1.2.1, concat demuxer
- **Related:** OPS-88, OPS-91

#### OPS-91 Validate video scene scripts and timing

- **Use when:** a scene script needs schema validation, a recorded timeline needs acceptance checks, or only the affected scenes should re-record.
- **Does:** scriptSchema.js is a hand-rolled validator for a scene script against videos/scene-script.schema.json, throwing on a bad path rather than skipping it. checks.js runs the acceptance checks, such as timing match and typing cadence, against a recorded timeline. check-video-timings.js runs those checks from the command line. video-scenes-to-record.mjs diffs git to find which scene files changed, and video-scripts-for-changed-files.mjs finds which scene scripts reference a given set of changed code files.
- **Run:** `node scripts/check-video-timings.js <timeline.json>`; `node scripts/video-scenes-to-record.mjs --publish videos/publish.json --recorded <recorded-file>`; `node scripts/video-scripts-for-changed-files.mjs --environment <env>`
- **Entry:** `scripts/lib/video/scriptSchema.js`; `scripts/lib/video/checks.js`; `scripts/check-video-timings.js`
- **Files:** scripts/lib/video/scriptSchema.js, scripts/lib/video/checks.js, scripts/check-video-timings.js, scripts/video-scenes-to-record.mjs, scripts/video-scripts-for-changed-files.mjs, app/unit-tests/video/scriptSchema.test.js, app/unit-tests/video/checks.test.js, app/unit-tests/video/scenesToRecord.test.js, app/unit-tests/scripts/videoScriptsForChangedFiles.test.js, app/unit-tests/videoScenePages.test.js
- **Keywords:** scene script validation, schema, timing checks, typing cadence, changed files, scenes to record
- **Related:** OPS-88, OPS-92

#### OPS-92 Redact secrets from video artefacts

- **Use when:** a recorded logged-in scene may have typed real credentials into captions, transcript or overlay logs.
- **Does:** secrets.js scans every text artefact a recording produces, including captions, the .vtt file, transcript, timeline and overlay event log, for the real credentials a logged-in scene typed. A hit is a hard failure, not a post-hoc redaction, so none of it reaches the shipped video.
- **Run:** no command; see Does and Entry
- **Entry:** `scripts/lib/video/secrets.js`
- **Files:** scripts/lib/video/secrets.js, app/unit-tests/video/secrets.test.js
- **Keywords:** secret scan, video artefacts, credential leak, hard failure, captions, transcript
- **Related:** OPS-88, OPS-90

#### OPS-93 Publish demo videos to YouTube

- **Use when:** a recorded demo video is ready to upload to YouTube, unlisted or public, or its manifest needs syncing.
- **Does:** youtube-upload.js uploads a local video file to YouTube, unlisted or public. It reads title, description, tags and caption file per video from videos/publish.json, documented in videos/PUBLISH.md, and uses selectPendingUploads to skip videos already published. copy-videos-manifest.js keeps the video manifest in sync between source and destination directories.
- **Run:** `npm run video:publish`; `npm run video:publish -- --public`; `npm run video:publish -- --check`; `npm run videos:manifest`
- **Entry:** `scripts/youtube-upload.js`; `scripts/copy-videos-manifest.js`
- **Files:** scripts/youtube-upload.js, app/unit-tests/scripts/youtubeUpload.test.js, scripts/copy-videos-manifest.js, videos/PUBLISH.md, web/unit-tests/videos-manifest.test.js
- **Keywords:** youtube upload, publish video, unlisted, public video, publish.json, video manifest
- **Related:** OPS-88, OPS-94

#### OPS-94 Play demo videos on the public site

- **Use when:** the public site needs a page listing the recorded product demos with working playback controls.
- **Does:** videos.html is the public page listing the recorded product demos. The browser test proves the playback controls: play, pause, fullscreen and captions.
- **Run:** `npm run test:browser`
- **Entry:** `web/public/videos.html`
- **Files:** web/public/videos.html, web/browser-tests/videos.browser.test.js
- **Keywords:** videos page, public site, playback controls, captions, fullscreen, product demos
- **Related:** OPS-93

#### OPS-95 Generate WCAG accessibility compliance rows

- **Use when:** WCAG manual and automated review results need turning into rows for the compliance dashboard.
- **Does:** compliance-accessibility-rows.js parses WCAG 2.2 manual review results into rows for the board and compliance dashboard. wcag22-manual-review.js compiles the manual testing results: keyboard navigation, screen reader and contrast checks.
- **Run:** `node scripts/compliance-accessibility-rows.js <environment> <checkedAt> [--pa11y path] [--axe path] [--axe-wcag22 path]`; `node scripts/wcag22-manual-review.js --url <url> [--output FILE]`
- **Entry:** `scripts/compliance-accessibility-rows.js`; `scripts/wcag22-manual-review.js`
- **Files:** scripts/compliance-accessibility-rows.js, app/unit-tests/scripts/complianceAccessibilityRows.test.js, scripts/wcag22-manual-review.js
- **Keywords:** wcag 2.2, manual review, compliance rows, dora row, keyboard nav, screen reader, contrast
- **Related:** OPS-96, OPS-97

#### OPS-96 Scan pages for accessibility violations

- **Use when:** a page set needs an axe-core accessibility scan or a WCAG 1.4.12 text-spacing check.
- **Does:** axe-quickscan.mjs injects axe-core into Playwright-driven pages from the CDN allowlist and runs it, working around a broken local npx axe CLI. text-spacing-test.js checks WCAG 1.4.12 text-spacing compliance, such as line height and letter and word spacing, across the same page set.
- **Run:** `node scripts/axe-quickscan.mjs <baseUrl> <tags>`; `npm run accessibility:text-spacing-proxy`; `npm run accessibility:text-spacing-ci`; `npm run accessibility:text-spacing-prod`; `npm run accessibility:axe-ci`; `npm run accessibility:axe-wcag22-ci-report`
- **Entry:** `scripts/axe-quickscan.mjs`; `scripts/text-spacing-test.js`
- **Files:** scripts/axe-quickscan.mjs, scripts/text-spacing-test.js
- **Keywords:** axe-core, accessibility scan, wcag 1.4.12, text spacing, playwright, cdn allowlist
- **Related:** OPS-95, OPS-97

#### OPS-97 Compile the compliance audit report

- **Use when:** WCAG, fraud-header and VAT-logic test results need aggregating into one pass/fail compliance report.
- **Does:** generate-compliance-report.js aggregates WCAG, fraud-header and VAT-logic test results into one pass/fail compliance report with evidence links. The behaviour test proves the HMRC MTD privacy-and-terms compliance journey.
- **Run:** `node scripts/generate-compliance-report.js --target <url> [--output FILE]`; `npm run compliance:proxy-report-md`; `npm run compliance:ci-report-md`; `npm run compliance:prod-report-md`; `npm run test:complianceBehaviour-proxy`
- **Entry:** `scripts/generate-compliance-report.js`
- **Files:** scripts/generate-compliance-report.js, behaviour-tests/compliance.behaviour.test.js
- **Keywords:** compliance report, wcag, fraud headers, vat logic, evidence links, hmrc mtd journey
- **Related:** OPS-95, OPS-96

### Agent workflows (OPS)

<!-- generated:group agent-workflows-ops -->
- [OPS-54](#ops-54-define-specialized-claude-code-sub-agent-personas) Define specialized Claude Code sub-agent personas
- [OPS-55](#ops-55-configure-github-copilot-review-and-workspace-setup) Configure GitHub Copilot review and workspace setup
- [OPS-56](#ops-56-structure-github-issues-prs-and-funding-links) Structure GitHub issues, PRs and funding links
- [OPS-57](#ops-57-dispatch-agentic-lib-board-backlog-and-pr-agents) Dispatch agentic-lib board, backlog and PR agents
<!-- /generated:group agent-workflows-ops -->

#### OPS-54 Define specialized Claude Code sub-agent personas

- **Use when:** dispatching a sub-agent that needs one of these domains' conventions already loaded.
- **Does:** Eight .agent.md personas each scope a sub-agent to one area of this repository. Areas include AWS CDK Java, Playwright testing, refactoring, Stripe, HMRC MTD API, security, and TODO discovery. A dispatched agent inherits the right domain knowledge without re-deriving it.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/agents/aws-cdk-java-specialist.agent.md`
- **Files:** .github/agents/aws-cdk-java-specialist.agent.md, .github/agents/behavior-test-master.agent.md, .github/agents/clean-code-guardian.agent.md, .github/agents/entitlement-subscription-specialist.agent.md, .github/agents/hmrc-api-expert.agent.md, .github/agents/security-hardener.agent.md, .github/agents/summarize-repository.agent.md, .github/agents/todo-inator.agent.md
- **Keywords:** sub-agent persona, agent.md, domain-scoped agent, cdk java specialist, behaviour test master
- **Related:** OPS-56

#### OPS-55 Configure GitHub Copilot review and workspace setup

- **Use when:** checking or changing what Copilot's review agent or coding-agent workspace knows about this repository.
- **Does:** copilot-instructions.md steers Copilot's PR review agent toward this repository's architecture and npm scripts. copilot-setup-steps.yml runs the equivalent setup steps for a Copilot coding-agent workspace.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/copilot-instructions.md`
- **Files:** .github/copilot-instructions.md, .github/workflows/copilot-setup-steps.yml
- **Keywords:** copilot instructions, copilot review, copilot workspace setup, coding agent, github copilot

#### OPS-56 Structure GitHub issues, PRs and funding links

- **Use when:** opening a support issue or PR needs the repository's standard structured template.
- **Does:** The support issue template collects a structured category and an origin:human label for routing. The PR template captures origin, human or agent or machine or external, a summary, and issue-closing checkboxes. FUNDING.yml lists the GitHub Sponsors and PayPal donation links shown on the repository sidebar.
- **Run:** no command; see Does and Entry
- **Entry:** `.github/ISSUE_TEMPLATE/support.yml`; `.github/PULL_REQUEST_TEMPLATE.md`
- **Files:** .github/FUNDING.yml, .github/ISSUE_TEMPLATE/support.yml, .github/PULL_REQUEST_TEMPLATE.md
- **Keywords:** issue template, pr template, funding links, origin label, support category

#### OPS-57 Dispatch agentic-lib board, backlog and PR agents

- **Use when:** the board, the NEXT.md backlog, or an issue-described change needs an agent dispatched from the shared agentic-lib library.
- **Does:** agentic-lib-board.yml renders the /board open-work board, with optional write-back to NEXT.md. agentic-lib-code.yml runs /do-next over NEXT.md under a time budget. agentic-lib-pr.yml runs an agent that implements a change described in an issue or PR.
- **Run:** `gh workflow run agentic-lib-board.yml`; `gh workflow run agentic-lib-code.yml`; `gh workflow run agentic-lib-pr.yml`
- **Entry:** `.github/workflows/agentic-lib-board.yml`; `.github/workflows/agentic-lib-code.yml`; `.github/workflows/agentic-lib-pr.yml`
- **Files:** .github/workflows/agentic-lib-board.yml, .github/workflows/agentic-lib-code.yml, .github/workflows/agentic-lib-pr.yml
- **Keywords:** agentic-lib, board agent, do-next agent, pr agent, next.md, time budget
- **Related:** OPS-54

### Environment and accounts (OPS)

<!-- generated:group environment-and-accounts-ops -->
- [OPS-58](#ops-58-document-multi-account-aws-architecture) Document multi-account AWS architecture
- [OPS-59](#ops-59-track-and-analyze-aws-spending) Track and analyze AWS spending
- [OPS-60](#ops-60-guide-github-repository-configuration) Guide GitHub repository configuration
- [OPS-61](#ops-61-design-ci-branch-deploys-off-the-apex) Design CI branch deploys off the apex
- [OPS-62](#ops-62-report-accessibility-penetration-testing) Report accessibility penetration testing
- [OPS-63](#ops-63-report-identity-audit-findings) Report identity audit findings
- [OPS-64](#ops-64-runbook-information-security-operations) Runbook information-security operations
- [OPS-65](#ops-65-document-security-policy-and-disclosure) Document security policy and disclosure
- [OPS-66](#ops-66-create-an-hmrc-sandbox-test-user) Create an HMRC sandbox test user
- [OPS-67](#ops-67-apply-google-cloud--ga4-infrastructure) Apply Google Cloud / GA4 infrastructure
- [OPS-68](#ops-68-provision-and-assume-roles-for-test-user-provisioning) Provision and assume roles for test-user provisioning
- [OPS-69](#ops-69-assume-and-clear-local-aws-deployment-credentials) Assume and clear local AWS deployment credentials
- [OPS-98](#ops-98-bootstrap-the-cdk-toolkit-across-accounts) Bootstrap the CDK toolkit across accounts
- [OPS-99](#ops-99-bootstrap-the-aws-organization-structure) Bootstrap the AWS Organization structure
- [OPS-100](#ops-100-create-or-invite-aws-member-accounts) Create or invite AWS member accounts
- [OPS-101](#ops-101-set-up-github-oidc-deployment-roles) Set up GitHub OIDC deployment roles
- [OPS-102](#ops-102-verify-the-multi-account-aws-setup) Verify the multi-account AWS setup
- [OPS-103](#ops-103-bootstrap-a-new-aws-account-for-cdk) Bootstrap a new AWS account for CDK
<!-- /generated:group environment-and-accounts-ops -->

#### OPS-58 Document multi-account AWS architecture

- **Use when:** checking why a resource lives in a particular AWS account, or which account a new resource belongs in.
- **Does:** AWS_ARCHITECTURE.md describes the six-account structure: management, gateway, spreadsheets, submit-ci, submit-prod and submit-backup. It documents the security and isolation rationale behind the split.
- **Run:** no command; see Does and Entry
- **Entry:** `AWS_ARCHITECTURE.md`
- **Files:** AWS_ARCHITECTURE.md
- **Keywords:** aws architecture, multi-account, account isolation, submit-ci, submit-prod
- **Related:** OPS-59

#### OPS-59 Track and analyze AWS spending

- **Use when:** checking this repository's AWS cost-tracking approach or past spend.
- **Does:** AWS_COSTS.md documents cost-tracking methodology, monthly spend and cost-optimisation strategies.
- **Run:** no command; see Does and Entry
- **Entry:** `AWS_COSTS.md`
- **Files:** AWS_COSTS.md
- **Keywords:** aws costs, cost tracking, monthly spend, cost optimisation, aws_costs.md
- **Related:** OPS-58

#### OPS-60 Guide GitHub repository configuration

- **Use when:** setting up or checking a repository's branch protection, OIDC trust or webhook configuration.
- **Does:** GITHUB_SETUP.md gives setup instructions for branch protection, OIDC trust, required status checks and webhooks.
- **Run:** no command; see Does and Entry
- **Entry:** `GITHUB_SETUP.md`
- **Files:** GITHUB_SETUP.md
- **Keywords:** github setup, branch protection, oidc trust, required status checks, webhooks
- **Related:** OPS-42

#### OPS-61 Design CI branch deploys off the apex

- **Use when:** checking the design rationale behind CI branch deploys, before changing that mechanism.
- **Does:** DESIGN_CI_BRANCH_DEPLOYS_OFF_THE_APEX.md is the architecture document for deploying feature branches to CI hosts without touching the prod apex.
- **Run:** no command; see Does and Entry
- **Entry:** `_developers/DESIGN_CI_BRANCH_DEPLOYS_OFF_THE_APEX.md`
- **Files:** _developers/DESIGN_CI_BRANCH_DEPLOYS_OFF_THE_APEX.md
- **Keywords:** ci branch deploys, design document, apex isolation, feature branch hosts, architecture rationale
- **Related:** OPS-10, OPS-11

#### OPS-62 Report accessibility penetration testing

- **Use when:** checking past accessibility penetration test findings before a new test or fix.
- **Does:** REPORT_ACCESSIBILITY_PENETRATION.md holds the findings from an accessibility penetration test of the deployed site.
- **Run:** no command; see Does and Entry
- **Entry:** `REPORT_ACCESSIBILITY_PENETRATION.md`
- **Files:** REPORT_ACCESSIBILITY_PENETRATION.md
- **Keywords:** accessibility test, penetration test, findings report, deployed site audit, wcag
- **Related:** OPS-36

#### OPS-63 Report identity audit findings

- **Use when:** checking past findings on commit-identity or signing controls before changing them.
- **Does:** REPORT_IDENTITY_AUDIT.md holds the findings from an audit of the repository's commit-identity and signing controls.
- **Run:** no command; see Does and Entry
- **Entry:** `REPORT_IDENTITY_AUDIT.md`
- **Files:** REPORT_IDENTITY_AUDIT.md
- **Keywords:** identity audit, commit identity controls, signing controls, audit findings, report_identity_audit.md
- **Related:** OPS-28, OPS-29

#### OPS-64 Runbook information-security operations

- **Use when:** an information-security incident needs its runbook procedure, or all users need a cross-account logout hold.
- **Does:** RUNBOOK_INFORMATION_SECURITY.md is the operational runbook for information-security incidents and controls. force-logout-all-users.sh implements the cross-account user hold in its section 6.6.
- **Run:** no command; see Does and Entry
- **Entry:** `scripts/force-logout-all-users.sh`
- **Files:** RUNBOOK_INFORMATION_SECURITY.md, scripts/force-logout-all-users.sh
- **Keywords:** infosec runbook, incident response, force logout, cross-account hold, section 6.6, runbook_information_security.md
- **Related:** OPS-62

#### OPS-65 Document security policy and disclosure

- **Use when:** someone needs to know how to report a vulnerability, or what the disclosure procedure commits to.
- **Does:** SECURITY.md states the security policy and vulnerability-disclosure procedure for the repository.
- **Run:** no command; see Does and Entry
- **Entry:** `SECURITY.md`
- **Files:** SECURITY.md
- **Keywords:** security policy, vulnerability disclosure, responsible disclosure, security.md, report a vulnerability
- **Related:** OPS-63

#### OPS-66 Create an HMRC sandbox test user

- **Use when:** a fresh HMRC MTD sandbox test user is needed for VAT or Income Tax testing.
- **Does:** create-hmrc-test-user.yml calls HMRC's sandbox create-test-user API to mint a fresh MTD test user.
- **Run:** `gh workflow run create-hmrc-test-user.yml -f service-names=<mtd-vat|mtd-income-tax|mtd-vat,mtd-income-tax>`
- **Entry:** `.github/workflows/create-hmrc-test-user.yml`
- **Files:** .github/workflows/create-hmrc-test-user.yml
- **Keywords:** hmrc sandbox, mtd test user, create-test-user api, mtd-vat, mtd-income-tax
- **Related:** OPS-67

#### OPS-67 Apply Google Cloud / GA4 infrastructure

- **Use when:** Google Cloud or GA4 infrastructure must be planned or applied from its declared state.
- **Does:** google-apply.yml runs the infra/google/** scripts in dependency order. The order is API enablement, workload identity, IAM roles, billing, GA4, the GA4-in-BigQuery dataset, then the OAuth client check. It plans on a pull request and applies on a push to main or a manual dispatch with apply true.
- **Run:** `gh workflow run google-apply.yml -f apply=<true|false>`
- **Entry:** `.github/workflows/google-apply.yml`
- **Files:** .github/workflows/google-apply.yml
- **Keywords:** google cloud apply, ga4 infrastructure, workload identity, bigquery dataset, oauth client check
- **Related:** OPS-42

#### OPS-68 Provision and assume roles for test-user provisioning

- **Use when:** a local or CI run needs a fresh Cognito test user and credentials.
- **Does:** provision-user.mjs creates a Cognito test user with generated credentials for local or CI use. provision-user.sh wraps it and generates TEST_AUTH_USERNAME and TEST_AUTH_PASSWORD, after aws-assume-user-provisioning-role.sh assumes the external user-provisioning role.
- **Run:** `. ./scripts/aws-assume-user-provisioning-role.sh`; `./scripts/provision-user.sh`; `node app/bin/provision-user.mjs <table-name> [username] [password]`
- **Entry:** `app/bin/provision-user.mjs`
- **Files:** app/bin/provision-user.mjs, app/system-tests/provisionUser.system.test.js, scripts/provision-user.sh, scripts/aws-assume-user-provisioning-role.sh
- **Keywords:** provision test user, cognito test user, user provisioning role, test_auth_username, test_auth_password
- **Related:** OPS-16, OPS-66

#### OPS-69 Assume and clear local AWS deployment credentials

- **Use when:** a local deploy or debug session needs submit-deployment-role credentials in the shell.
- **Does:** aws-assume-submit-deployment-role.sh assumes the submit-deployment-role into the current shell's AWS_* variables, for local deploy or debug work. aws-unset-iam-session.sh clears them again afterwards.
- **Run:** `. ./scripts/aws-assume-submit-deployment-role.sh`; `./scripts/aws-unset-iam-session.sh`
- **Entry:** `scripts/aws-assume-submit-deployment-role.sh`
- **Files:** scripts/aws-assume-submit-deployment-role.sh, scripts/aws-unset-iam-session.sh
- **Keywords:** assume role, submit-deployment-role, local aws credentials, unset iam session, aws sts assume-role
- **Related:** OPS-07

#### OPS-98 Bootstrap the CDK toolkit across accounts

- **Use when:** a fresh AWS account, or every account, needs the CDK toolkit stack with cross-account trust relationships.
- **Does:** bootstrap-cdk.sh bootstraps the CDK toolkit stack in one account, or every account when given all, with cross-account trust relationships to a nominated trust account.
- **Run:** `./bootstrap-cdk.sh <account-id> [trust-account-id]`; `./bootstrap-cdk.sh all`
- **Entry:** `infra/aws-accounts/bootstrap-cdk.sh`
- **Files:** infra/aws-accounts/bootstrap-cdk.sh
- **Keywords:** cdk bootstrap, toolkit stack, cross-account trust, aws account setup
- **Related:** OPS-99, OPS-103

#### OPS-99 Bootstrap the AWS Organization structure

- **Use when:** the AWS Organization's organizational units need verifying or creating after the organization itself exists.
- **Does:** bootstrap-organization.sh verifies the AWS Organization's structure, creates organizational units, and documents the current state. It assumes the organization itself was already created in the console.
- **Run:** `./bootstrap-organization.sh`
- **Entry:** `infra/aws-accounts/bootstrap-organization.sh`
- **Files:** infra/aws-accounts/bootstrap-organization.sh
- **Keywords:** aws organization, organizational units, ou setup, account structure
- **Related:** OPS-100

#### OPS-100 Create or invite AWS member accounts

- **Use when:** a new member account must be created, invited, moved between OUs, or its status checked.
- **Does:** create-member-account.sh creates or invites a member account into the organization, moves it between OUs, and reports status, via create, invite, move and status subcommands.
- **Run:** `./create-member-account.sh create <account-name> <email> <ou-name>`; `./create-member-account.sh invite <account-id>`; `./create-member-account.sh move <account-id> <ou-name>`; `./create-member-account.sh status`
- **Entry:** `infra/aws-accounts/create-member-account.sh`
- **Files:** infra/aws-accounts/create-member-account.sh
- **Keywords:** member account, invite account, move ou, organization account, account status
- **Related:** OPS-99

#### OPS-101 Set up GitHub OIDC deployment roles

- **Use when:** a GitHub Actions deployment role and its OIDC identity provider need creating for an environment.
- **Does:** setup-oidc-roles.sh creates the OIDC identity provider and the GitHub Actions deployment role for one environment and account pair.
- **Run:** `./setup-oidc-roles.sh <environment-name> <account-id>`
- **Entry:** `infra/aws-accounts/setup-oidc-roles.sh`
- **Files:** infra/aws-accounts/setup-oidc-roles.sh
- **Keywords:** oidc, github actions role, deployment role, identity provider, account setup
- **Related:** OPS-102

#### OPS-102 Verify the multi-account AWS setup

- **Use when:** the multi-account structure needs confirming complete: OIDC roles, backup roles and organizational units.
- **Does:** verify-setup.sh runs a battery of checks confirming the multi-account structure, including OIDC roles, backup roles and organization units, is complete and functional.
- **Run:** `./verify-setup.sh [--verbose]`
- **Entry:** `infra/aws-accounts/verify-setup.sh`
- **Files:** infra/aws-accounts/verify-setup.sh
- **Keywords:** verify setup, multi-account check, oidc roles, backup roles, organization check
- **Related:** OPS-101, OPS-104

#### OPS-103 Bootstrap a new AWS account for CDK

- **Use when:** a fresh AWS account needs its CDK bootstrap stacks, OIDC provider and deployment roles created.
- **Does:** bootstrap-account.sh bootstraps a new AWS account for CDK deployments and GitHub Actions OIDC. It creates the CDK bootstrap stacks, the OIDC provider, the github-actions-role and the deployment-role.
- **Run:** `./scripts/aws-accounts/bootstrap-account.sh --account-id <id> --account-name <name> --profile <profile>`
- **Entry:** `scripts/aws-accounts/bootstrap-account.sh`
- **Files:** scripts/aws-accounts/bootstrap-account.sh
- **Keywords:** bootstrap account, cdk prerequisites, oidc provider, deployment role, new account
- **Related:** OPS-98

### Shared runtime libraries (OPS)

<!-- generated:group shared-runtime-libraries-ops -->
- [OPS-81](#ops-81-mask-and-redact-sensitive-data-from-logs) Mask and redact sensitive data from logs
- [OPS-82](#ops-82-provide-a-shared-dynamodb-client) Provide a shared DynamoDB client
- [OPS-83](#ops-83-emit-cloudwatch-emf-metrics) Emit CloudWatch EMF metrics
- [OPS-84](#ops-84-validate-required-environment-variables-at-startup) Validate required environment variables at startup
- [OPS-85](#ops-85-obtain-and-use-github-app-api-tokens) Obtain and use GitHub App API tokens
- [OPS-86](#ops-86-provide-structured-pii-redacting-logging) Provide structured PII-redacting logging
- [OPS-87](#ops-87-process-sqs-message-batches-in-lambda-workers) Process SQS message batches in Lambda workers
<!-- /generated:group shared-runtime-libraries-ops -->

#### OPS-81 Mask and redact sensitive data from logs

- **Use when:** text or an object bound for a log line or shared output may carry PII or secret values.
- **Does:** dataMasking.js redacts PII and secret values from log output and other text before it is written or shared. maskSensitiveData walks an object field by field, and maskHttpData masks HTTP request and response bodies and headers.
- **Run:** no command; see Does and Entry
- **Entry:** `app/lib/dataMasking.js:maskSensitiveData`; `app/lib/dataMasking.js:maskHttpData`
- **Files:** app/lib/dataMasking.js, app/unit-tests/lib/dataMasking.test.js
- **Keywords:** pii redaction, data masking, secrets in logs, sensitive fields, log hygiene
- **Related:** OPS-86

#### OPS-82 Provide a shared DynamoDB client

- **Use when:** a Lambda or repository needs a DynamoDB document client instead of constructing its own AWS SDK client.
- **Does:** dynamoDbClient.js centralizes AWS SDK DynamoDB client construction, configuration and resource-name resolution. getDynamoDbDocClient returns the shared client and getResourceName resolves a table name from its environment variable.
- **Run:** no command; see Does and Entry
- **Entry:** `app/lib/dynamoDbClient.js:getDynamoDbDocClient`; `app/lib/dynamoDbClient.js:getResourceName`
- **Files:** app/lib/dynamoDbClient.js
- **Keywords:** dynamodb client, aws sdk, shared client, resource name, document client

#### OPS-83 Emit CloudWatch EMF metrics

- **Use when:** a Lambda needs to publish a custom CloudWatch metric without a separate PutMetricData API call.
- **Does:** emfMetrics.js formats and writes structured metrics in Embedded Metric Format. CloudWatch extracts the metrics from the Lambda's own log lines, so emitMetric needs no separate PutMetricData call.
- **Run:** no command; see Does and Entry
- **Entry:** `app/lib/emfMetrics.js:emitMetric`
- **Files:** app/lib/emfMetrics.js, app/unit-tests/lib/emfMetrics.test.js
- **Keywords:** emf, embedded metric format, cloudwatch metrics, putmetricdata, structured logging
- **Related:** OPS-86

#### OPS-84 Validate required environment variables at startup

- **Use when:** a Lambda should fail immediately on a missing environment variable instead of partway through a request.
- **Does:** env.js checks that the environment variables a Lambda needs are set before it starts handling events. validateEnv throws at startup rather than letting the Lambda fail partway through a request.
- **Run:** no command; see Does and Entry
- **Entry:** `app/lib/env.js:validateEnv`
- **Files:** app/lib/env.js
- **Keywords:** environment variables, fail fast, lambda startup, config validation, required vars

#### OPS-85 Obtain and use GitHub App API tokens

- **Use when:** a script or Lambda must call the GitHub API and needs a short-lived App installation token.
- **Does:** githubAppToken.js mints short-lived GitHub App installation tokens for API access. gitHubHelpers.js provides higher-level helpers built on top of them, such as creating issues, comments and releases.
- **Run:** no command; see Does and Entry
- **Entry:** `app/lib/githubAppToken.js:getInstallationAccessToken`; `app/lib/gitHubHelpers.js:appendAutomationDisclosure`
- **Files:** app/lib/githubAppToken.js, app/lib/gitHubHelpers.js, app/unit-tests/lib/gitHubHelpers.test.js, app/unit-tests/lib/githubAppToken.test.js
- **Keywords:** github app token, installation token, github api, issues and comments, releases, github helpers
- **Related:** OPS-71

#### OPS-86 Provide structured PII-redacting logging

- **Use when:** a Lambda or script needs structured JSON logging to CloudWatch with PII stripped before it is written.
- **Does:** logger.js creates a Pino logger that writes structured JSON to CloudWatch. createLogger redacts PII fields before a line is emitted, proved by loggerPiiRedaction.test.js.
- **Run:** no command; see Does and Entry
- **Entry:** `app/lib/logger.js:createLogger`; `app/lib/logger.js:sanitiseData`
- **Files:** app/lib/logger.js, app/unit-tests/lib/loggerPiiRedaction.test.js
- **Keywords:** pino logger, structured logging, pii redaction, cloudwatch logs, safe logger
- **Related:** OPS-81

#### OPS-87 Process SQS message batches in Lambda workers

- **Use when:** an SQS-triggered Lambda must handle each record's failure independently instead of failing the whole batch.
- **Does:** sqsWorkerHelper.js orchestrates a Lambda's SQS-triggered batch processing. processSqsRecords handles per-record errors so one bad message does not fail the whole batch.
- **Run:** no command; see Does and Entry
- **Entry:** `app/lib/sqsWorkerHelper.js:processSqsRecords`; `app/lib/sqsWorkerHelper.js:isRetryableError`
- **Files:** app/lib/sqsWorkerHelper.js
- **Keywords:** sqs, batch processing, partial batch failure, lambda worker, retryable error

### Backup and disaster recovery (OPS)

<!-- generated:group backup-and-disaster-recovery-ops -->
- [OPS-104](#ops-104-set-up-cross-account-backup-iam-roles) Set up cross-account backup IAM roles
- [OPS-105](#ops-105-copy-production-data-to-backup-for-migration) Copy production data to backup for migration
- [OPS-106](#ops-106-replicate-secrets-across-aws-accounts) Replicate secrets across AWS accounts
- [OPS-107](#ops-107-list-production-secrets-manager-entries) List production Secrets Manager entries
- [OPS-108](#ops-108-backfill-ttl-on-existing-dynamodb-records) Backfill TTL on existing DynamoDB records
- [OPS-109](#ops-109-disaster-recovery-restore-into-a-new-prod-account) Disaster-recovery restore into a new prod account
- [OPS-110](#ops-110-force-logout-all-users-during-a-security-incident) Force logout all users during a security incident
<!-- /generated:group backup-and-disaster-recovery-ops -->

#### OPS-104 Set up cross-account backup IAM roles

- **Use when:** a backup vault and its cross-account permissions need creating so source accounts can back up into it.
- **Does:** setup-backup-roles.sh creates the backup vault in the backup account and configures the cross-account IAM permissions that let source accounts back up into it.
- **Run:** `./setup-backup-roles.sh <backup-account-id> <source-account-ids...>`
- **Entry:** `infra/aws-accounts/setup-backup-roles.sh`
- **Files:** infra/aws-accounts/setup-backup-roles.sh
- **Keywords:** backup vault, cross-account iam, backup roles, source accounts
- **Related:** OPS-111, OPS-109

#### OPS-105 Copy production data to backup for migration

- **Use when:** production DynamoDB tables need copying into the backup account ahead of an account migration.
- **Does:** backup-prod-for-migration.sh creates on-demand DynamoDB backups and exports salt metadata for account migration, as part of the account-separation plan's preparation step.
- **Run:** `./scripts/aws-accounts/backup-prod-for-migration.sh --profile <profile> [--env <environment>]`
- **Entry:** `scripts/aws-accounts/backup-prod-for-migration.sh`
- **Files:** scripts/aws-accounts/backup-prod-for-migration.sh
- **Keywords:** backup migration, dynamodb backup, salt metadata, account separation, on-demand backup
- **Related:** OPS-106, OPS-108

#### OPS-106 Replicate secrets across AWS accounts

- **Use when:** Secrets Manager entries must be copied from one AWS account to another during a migration.
- **Does:** copy-secrets-to-account.sh copies Secrets Manager secrets from one AWS account to another. It runs as a dry run by default and copies only when given --execute.
- **Run:** `./scripts/aws-accounts/copy-secrets-to-account.sh --source-profile <profile> --target-profile <profile> [--env <env>] [--execute]`
- **Entry:** `scripts/aws-accounts/copy-secrets-to-account.sh`
- **Files:** scripts/aws-accounts/copy-secrets-to-account.sh
- **Keywords:** copy secrets, secrets manager, account migration, dry run, cross-account secrets
- **Related:** OPS-107

#### OPS-107 List production Secrets Manager entries

- **Use when:** an inventory of an account's Secrets Manager entries and KMS keys is needed before copying secrets.
- **Does:** list-prod-secrets.sh lists all Secrets Manager secrets and KMS keys and aliases in the current account. It never prints secret values; its output feeds copy-secrets-to-account.sh.
- **Run:** `./scripts/aws-accounts/list-prod-secrets.sh --profile <profile> [--env <environment>]`
- **Entry:** `scripts/aws-accounts/list-prod-secrets.sh`
- **Files:** scripts/aws-accounts/list-prod-secrets.sh
- **Keywords:** list secrets, secrets manager inventory, kms keys, account migration
- **Related:** OPS-106

#### OPS-108 Backfill TTL on existing DynamoDB records

- **Use when:** DynamoDB items created before a table's TTL configuration need a time-to-live value set retroactively.
- **Does:** set-ttl-on-existing-records.sh sets the time-to-live attribute on DynamoDB items, such as HMRC receipts or old logs, that predate the table's TTL configuration, so they age out automatically.
- **Run:** `./scripts/aws-accounts/set-ttl-on-existing-records.sh --profile <profile> --table <table> --ttl-days <n> [--dry-run]`
- **Entry:** `scripts/aws-accounts/set-ttl-on-existing-records.sh`
- **Files:** scripts/aws-accounts/set-ttl-on-existing-records.sh
- **Keywords:** ttl backfill, dynamodb ttl, hmrc receipts, old logs, expire records

#### OPS-109 Disaster-recovery restore into a new prod account

- **Use when:** a full disaster-recovery drill needs a new prod AWS account restored from the backup account's vault.
- **Does:** dr-restore-from-backup-account.sh restores a new prod AWS account from the backup account's vault as a full disaster-recovery drill. restore-tables-from-backup.sh copies DynamoDB table data cross-account by scan and batch-write-item, since AWS Backup's cross-account copy needs a vault setup this repository has not built yet.
- **Run:** `./scripts/dr-restore-from-backup-account.sh <new-account-id> <backup-account-id> [restore-point] [region]`; `./scripts/aws-accounts/restore-tables-from-backup.sh --source-profile <profile> --target-profile <profile> [--env <env>] [--dry-run]`
- **Entry:** `scripts/dr-restore-from-backup-account.sh`; `scripts/aws-accounts/restore-tables-from-backup.sh`
- **Files:** scripts/dr-restore-from-backup-account.sh, scripts/aws-accounts/restore-tables-from-backup.sh
- **Keywords:** disaster recovery, dr drill, restore prod, backup vault, cross-account restore, scan and batch-write
- **Related:** OPS-104, OPS-105

#### OPS-110 Force logout all users during a security incident

- **Use when:** a security incident requires every user in an environment's Cognito pool signed out immediately.
- **Does:** force-logout-all-users.sh calls Cognito's admin global-sign-out for every user in an environment's user pool, as part of the cross-account hold in RUNBOOK_INFORMATION_SECURITY.md section 6.6. Refresh tokens die immediately; an already-issued access token can stay valid up to an hour.
- **Run:** `./scripts/force-logout-all-users.sh <env>`
- **Entry:** `scripts/force-logout-all-users.sh`
- **Files:** scripts/force-logout-all-users.sh
- **Keywords:** force logout, global sign-out, cognito, security incident, access token, refresh token

### CDK infrastructure stacks (OPS)

<!-- generated:group cdk-infrastructure-stacks-ops -->
- [OPS-111](#ops-111-provision-cross-account-backup-vaults-and-plans) Provision cross-account backup vaults and plans
- [OPS-112](#ops-112-provision-the-api-gateway-stack) Provision the API Gateway stack
- [OPS-113](#ops-113-provision-the-dynamodb-and-s3-data-stack) Provision the DynamoDB and S3 data stack
- [OPS-114](#ops-114-provision-ecr-image-repositories) Provision ECR image repositories
- [OPS-115](#ops-115-provision-the-edgecloudfront-stack) Provision the Edge/CloudFront stack
- [OPS-116](#ops-116-provision-the-holding-page-stack) Provision the holding-page stack
- [OPS-117](#ops-117-provision-the-observability-stack) Provision the Observability stack
- [OPS-118](#ops-118-provision-the-observability-stack-in-us-east-1) Provision the Observability stack in us-east-1
- [OPS-119](#ops-119-provision-the-ops-stack) Provision the Ops stack
- [OPS-120](#ops-120-provision-the-publish-stack) Provision the Publish stack
- [OPS-121](#ops-121-provision-the-security-baseline-stack) Provision the Security Baseline stack
- [OPS-122](#ops-122-provision-the-security-detection-stack) Provision the Security Detection stack
<!-- /generated:group cdk-infrastructure-stacks-ops -->

#### OPS-111 Provision cross-account backup vaults and plans

- **Use when:** the primary account's backup plans, or the separate backup account's vault and restore roles, need synthesizing.
- **Does:** BackupStack creates the AWS Backup vaults, backup plans and SNS notifications in the primary account. CrossAccountBackupVaultStack creates the vault in the separate backup account and grants it restore permissions. BackupAccountAccessStack creates the cross-account IAM roles the backup account uses to restore into the primary account. SubmitBackupAccount is the CDK app entrypoint that synthesizes the backup-account stacks.
- **Run:** `gh workflow run setup-backup-account.yml`; `./setup-s3-replication.sh`
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/BackupStack.java`; `infra/main/java/co/uk/diyaccounting/submit/stacks/CrossAccountBackupVaultStack.java`; `infra/main/java/co/uk/diyaccounting/submit/SubmitBackupAccount.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/BackupStack.java, infra/main/java/co/uk/diyaccounting/submit/stacks/CrossAccountBackupVaultStack.java, infra/main/java/co/uk/diyaccounting/submit/stacks/BackupAccountAccessStack.java, infra/test/java/co/uk/diyaccounting/submit/BackupStackCdkResourceTest.java, infra/main/java/co/uk/diyaccounting/submit/SubmitBackupAccount.java, infra/test/java/co/uk/diyaccounting/submit/SubmitBackupAccountCdkResourceTest.java, .github/workflows/setup-backup-account.yml, scripts/setup-s3-replication.sh, cdk-typescript/scripts/diff-templates.mjs
- **Keywords:** backup vault, backup plan, cross-account backup, restore permissions, sns notification, backup account
- **Related:** OPS-104, OPS-109

#### OPS-112 Provision the API Gateway stack

- **Use when:** the account's API Gateway with its Lambda integrations needs synthesizing or redeploying.
- **Does:** ApiStack creates the API Gateway with Lambda integrations for the account, VAT, HMRC and billing endpoints.
- **Run:** `npm run cdk:synth-environment`; `npm run cdk:synth-application`
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/ApiStack.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/ApiStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/ApiStackTest.java
- **Keywords:** api gateway, lambda integration, vat endpoints, hmrc endpoints, billing endpoints, cdk stack
- **Related:** OPS-113, OPS-117

#### OPS-113 Provision the DynamoDB and S3 data stack

- **Use when:** the application's DynamoDB tables and S3 buckets need synthesizing with encryption, PITR and TTL policies.
- **Does:** DataStack creates the application's DynamoDB tables, such as bundles, passes, clients and operators, and S3 buckets with encryption, PITR and TTL policies.
- **Run:** `npm run cdk:synth-environment`
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/DataStackTest.java
- **Keywords:** dynamodb tables, s3 buckets, pitr, ttl policy, encryption, data stack
- **Related:** OPS-112

#### OPS-114 Provision ECR image repositories

- **Use when:** the ECR repositories the Lambda Docker images push to need creating with lifecycle policies.
- **Does:** EcrStack creates the ECR repositories and image lifecycle policies the Lambda Docker images are pushed to.
- **Run:** `npm run cdk:synth-environment`
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/EcrStack.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/EcrStack.java
- **Keywords:** ecr repository, docker image, lifecycle policy, lambda image

#### OPS-115 Provision the Edge/CloudFront stack

- **Use when:** CloudFront distributions, edge Lambdas or caching behaviours for the web app and API need synthesizing.
- **Does:** EdgeStack creates the CloudFront distributions, edge Lambdas, including the wafScanDetect subscription to the WAF log group, caching policies and custom behaviors for the web app and API.
- **Run:** `npm run cdk:synth-environment`
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java
- **Keywords:** cloudfront, edge lambda, caching policy, waf log subscription, edge stack
- **Related:** OPS-74, OPS-131

#### OPS-116 Provision the holding-page stack

- **Use when:** the submit service's own holding page needs its own CloudFront distribution for a failover retarget.
- **Does:** HoldingStack serves the submit service's holding page from its own CloudFront distribution. It is tagged OriginFor=<holding fqdn> so a failover can retarget the live aliases onto it.
- **Run:** `npm run cdk:synth-environment`
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/HoldingStack.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/HoldingStack.java
- **Keywords:** holding page stack, failover, cloudfront distribution, originfor tag
- **Related:** OPS-133

#### OPS-117 Provision the Observability stack

- **Use when:** an account's CloudTrail, GuardDuty, Security Hub, security SNS topic or shared dashboards need synthesizing.
- **Does:** ObservabilityStack creates the account's CloudTrail with DynamoDB data events, the account-singleton GuardDuty detector and Security Hub, the SNS topic security findings route through, and the CloudWatch dashboards, alarms and log groups other stacks attach to.
- **Run:** `npm run cdk:synth-environment`
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/ObservabilityStack.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/ObservabilityStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/ObservabilityStackTest.java, infra/test/java/co/uk/diyaccounting/submit/MetricFilterLogGroupCdkResourceTest.java
- **Keywords:** observability stack, cloudtrail, guardduty, security hub, sns findings topic, dashboards
- **Related:** OPS-118, OPS-121, OPS-122

#### OPS-118 Provision the Observability stack in us-east-1

- **Use when:** a CloudWatch resource must live in us-east-1 for a global service such as CloudFront metrics or alarms.
- **Does:** ObservabilityUE1Stack creates the CloudWatch resources that must live in us-east-1 for global services, such as CloudFront metrics and alarms.
- **Run:** `npm run cdk:synth-environment`
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/ObservabilityUE1Stack.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/ObservabilityUE1Stack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/ObservabilityUE1StackTest.java
- **Keywords:** us-east-1, cloudfront metrics, global service alarms, observability
- **Related:** OPS-117

#### OPS-119 Provision the Ops stack

- **Use when:** the operational Lambdas, alert topic or health canary backing deployment sweeps need synthesizing.
- **Does:** OpsStack creates the operational Lambdas and the SNS alert topic and health canary backing deployment sweeps, user-management and health-check tasks.
- **Run:** `npm run cdk:synth-environment`
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/OpsStack.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/OpsStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/OpsStackTest.java
- **Keywords:** ops stack, health canary, alert topic, deployment sweep, user management lambda

#### OPS-120 Provision the Publish stack

- **Use when:** the main website's S3 asset deployment and CloudFront invalidation need synthesizing.
- **Does:** PublishStack creates the S3 bucket deployment and CloudFront invalidation for the main website's web assets. It imports the CloudFront distribution by attributes rather than owning it.
- **Run:** `npm run cdk:synth-application`
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/PublishStack.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/PublishStack.java
- **Keywords:** publish stack, s3 deployment, cloudfront invalidation, web assets
- **Related:** OPS-115

#### OPS-121 Provision the Security Baseline stack

- **Use when:** an account needs its AWS Config recorder or its CIS AWS Foundations Benchmark subscription set up.
- **Does:** SecurityBaselineStack is an account-singleton compliance baseline. It creates the AWS Config configuration recorder Security Hub's standards subscriptions need, and subscribes the account to the CIS AWS Foundations Benchmark v5.0.0 standard, replacing v1.2.0. It depends on Security Hub already existing from ObservabilityStack, and synthesizes only when securityServicesEnabled is true.
- **Run:** `npm run cdk:synth-environment`
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/SecurityBaselineStack.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/SecurityBaselineStack.java
- **Keywords:** security baseline, aws config recorder, cis benchmark, security hub standards
- **Related:** OPS-117, OPS-122

#### OPS-122 Provision the Security Detection stack

- **Use when:** environment-level CloudWatch alarms for scan detection and data-theft detection need synthesizing.
- **Does:** SecurityDetectionStack creates environment-level CloudWatch alarms for scan detection and data-theft detection, built on the CloudTrail DynamoDB data events ObservabilityStack already collects. It imports, rather than creates, that stack's CloudTrail log group and security-findings SNS topic by naming convention, so it deploys and destroys independently.
- **Run:** `npm run cdk:synth-environment`
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/SecurityDetectionStack.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/SecurityDetectionStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/SecurityDetectionStackTest.java
- **Keywords:** security detection stack, scan detection alarm, data theft alarm, cloudtrail data events
- **Related:** OPS-117, OPS-121, OPS-73

### CDK shared constructs and naming (OPS)

<!-- generated:group cdk-shared-constructs-and-naming-ops -->
- [OPS-123](#ops-123-wire-cdk-application-entrypoints-per-account) Wire CDK application entrypoints per account
- [OPS-124](#ops-124-define-shared-lambda-cdk-constructs) Define shared Lambda CDK constructs
- [OPS-125](#ops-125-name-and-tag-cdk-resources-consistently) Name and tag CDK resources consistently
- [OPS-126](#ops-126-provide-config-composition-helpers-for-cdk-code) Provide config-composition helpers for CDK code
- [OPS-127](#ops-127-upsert-route53-alias-records-via-custom-resource) Upsert Route53 alias records via custom resource
- [OPS-128](#ops-128-generate-s3-lifecycle-rules-for-storage-tiering) Generate S3 lifecycle rules for storage tiering
- [OPS-129](#ops-129-configure-lambdacdk-application-logging) Configure Lambda/CDK application logging
- [OPS-130](#ops-130-track-runtime-and-dependency-lifecycle) Track runtime and dependency lifecycle
<!-- /generated:group cdk-shared-constructs-and-naming-ops -->

#### OPS-123 Wire CDK application entrypoints per account

- **Use when:** deciding which stacks synthesize for which account and environment combination.
- **Does:** SubmitApplication and SubmitEnvironment are the CDK app entrypoints that decide which stacks synthesize for which account and environment combination, against the shared SubmitStackProps contract every stack implements: env name, deployment name, resource prefix, CloudTrail flag and shared names.
- **Run:** `npm run cdk:synth-environment`; `npm run cdk:synth-application`
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/SubmitApplication.java`; `infra/main/java/co/uk/diyaccounting/submit/SubmitEnvironment.java`; `infra/main/java/co/uk/diyaccounting/submit/stacks/SubmitStackProps.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/SubmitApplication.java, infra/main/java/co/uk/diyaccounting/submit/SubmitEnvironment.java, infra/main/java/co/uk/diyaccounting/submit/stacks/SubmitStackProps.java, infra/test/java/co/uk/diyaccounting/submit/SubmitApplicationCdkResourceTest.java, infra/test/java/co/uk/diyaccounting/submit/SubmitEnvironmentCdkResourceTest.java, infra/test/java/co/uk/diyaccounting/submit/SubmitEnvironmentUE1CdkResourceTest.java
- **Keywords:** cdk entrypoint, stack wiring, submitstackprops, per-account synthesis, environment app
- **Related:** OPS-112, OPS-113

#### OPS-124 Define shared Lambda CDK constructs

- **Use when:** a new Lambda-backed stack needs the common function, alias and health-alarm wiring instead of rebuilding it.
- **Does:** Lambda and LambdaProps, with their AbstractLambdaProps and AbstractApiLambdaProps base, wrap the common CDK wiring every Lambda-backed stack reuses: function, alias and health alarm. ApiLambda and AsyncApiLambda specialize it for synchronous and async API integrations, and EdgeLambdaConstruct specializes it for CloudFront@Edge functions.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/constructs/Lambda.java`; `infra/main/java/co/uk/diyaccounting/submit/constructs/ApiLambda.java`; `infra/main/java/co/uk/diyaccounting/submit/constructs/EdgeLambdaConstruct.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/constructs/AbstractApiLambdaProps.java, infra/main/java/co/uk/diyaccounting/submit/constructs/AbstractLambdaProps.java, infra/main/java/co/uk/diyaccounting/submit/constructs/ApiLambda.java, infra/main/java/co/uk/diyaccounting/submit/constructs/ApiLambdaProps.java, infra/main/java/co/uk/diyaccounting/submit/constructs/AsyncApiLambda.java, infra/main/java/co/uk/diyaccounting/submit/constructs/AsyncApiLambdaProps.java, infra/main/java/co/uk/diyaccounting/submit/constructs/EdgeLambdaConstruct.java, infra/main/java/co/uk/diyaccounting/submit/constructs/EdgeLambdaProps.java, infra/main/java/co/uk/diyaccounting/submit/constructs/Lambda.java, infra/main/java/co/uk/diyaccounting/submit/constructs/LambdaProps.java
- **Keywords:** cdk lambda construct, health alarm, api lambda, edge lambda, shared construct
- **Related:** OPS-123

#### OPS-125 Name and tag CDK resources consistently

- **Use when:** a stack needs an IAM-safe resource name derived from a deployment identifier, or consistent cost-allocation tags.
- **Does:** SubmitSharedNames, LambdaNames and ResourceNameUtils derive consistent, IAM-safe, max 64 character, AWS resource names from a domain and deployment identifier. CostAllocationTags applies cost-allocation tags across every stack. RetentionDaysConverter maps an integer day count onto the CloudWatch Logs RetentionDays enum.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/utils/ResourceNameUtils.java`; `infra/main/java/co/uk/diyaccounting/submit/CostAllocationTags.java`; `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/CostAllocationTags.java, infra/main/java/co/uk/diyaccounting/submit/LambdaNameProps.java, infra/main/java/co/uk/diyaccounting/submit/LambdaNames.java, infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java, infra/main/java/co/uk/diyaccounting/submit/utils/ResourceNameUtils.java, infra/test/java/co/uk/diyaccounting/submit/utils/ResourceNameUtilsTest.java, infra/main/java/co/uk/diyaccounting/submit/utils/RetentionDaysConverter.java, infra/test/java/co/uk/diyaccounting/submit/utils/RetentionDaysConverterTest.java
- **Keywords:** resource naming, cost allocation tags, iam-safe name, retention days, lambda names
- **Related:** OPS-124

#### OPS-126 Provide config-composition helpers for CDK code

- **Use when:** Java CDK config code needs order-preserving maps or null-tolerant merges instead of double-brace hacks.
- **Does:** Kind is a set of tiny, static, null-tolerant helpers, such as order-preserving maps and explicit merge, that make Java CDK config code read like JS or Node config, documented in KIND.md. KindCdk builds on it for CDK-specific concerns: environment setup, CloudFormation outputs and AwsCustomResource provider management. PopulatedMap extends HashMap to throw on any blank key or value.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/utils/Kind.java`; `infra/main/java/co/uk/diyaccounting/submit/utils/KindCdk.java`; `infra/main/java/co/uk/diyaccounting/submit/utils/PopulatedMap.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/utils/Kind.java, infra/main/java/co/uk/diyaccounting/submit/utils/KindCdk.java, infra/main/java/co/uk/diyaccounting/submit/utils/KIND.md, infra/main/java/co/uk/diyaccounting/submit/utils/PopulatedMap.java, infra/test/java/co/uk/diyaccounting/submit/utils/KindTest.java, infra/test/java/co/uk/diyaccounting/submit/utils/KindCdkTest.java
- **Keywords:** kind helpers, config composition, cdk config, null-tolerant map, populatedmap
- **Related:** OPS-127

#### OPS-127 Upsert Route53 alias records via custom resource

- **Use when:** a Route53 alias record pointing at a CloudFront distribution needs an idempotent UPSERT that CDK's L2 constructs don't provide.
- **Does:** Route53AliasUpsert provides an idempotent UPSERT of a Route53 alias record pointing at a CloudFront distribution. It is implemented as an AwsCustomResource, since CDK's L2 constructs expose no such operation.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/utils/Route53AliasUpsert.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/utils/Route53AliasUpsert.java
- **Keywords:** route53 alias, upsert record, awscustomresource, cloudfront alias
- **Related:** OPS-126

#### OPS-128 Generate S3 lifecycle rules for storage tiering

- **Use when:** an S3 bucket needs intelligent tiering or object expiration rules generated for its CloudFormation template.
- **Does:** S3 generates CloudFormation S3 LifecycleRule configurations for intelligent tiering, moving objects to Infrequent Access after 30 days and Glacier after 90, and for object expiration.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/utils/S3.java`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/utils/S3.java, infra/test/java/co/uk/diyaccounting/submit/utils/S3Test.java
- **Keywords:** s3 lifecycle, storage tiering, intelligent tiering, glacier, object expiration
- **Related:** OPS-113

#### OPS-129 Configure Lambda/CDK application logging

- **Use when:** the Java CDK application's own log appenders, patterns or retention need changing, for main or test runs.
- **Does:** Log4j2 YAML configuration defines the log appenders, patterns and retention for the Java CDK application's own logging, separately for main and test resources.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/resources/log4j2.yml`
- **Files:** infra/main/resources/log4j2.yml, infra/test/resources/log4j2.yml
- **Keywords:** log4j2, cdk application logging, log appenders, log retention

#### OPS-130 Track runtime and dependency lifecycle

- **Use when:** a Lambda or Synthetics runtime version, dependency, or certificate is approaching end-of-life and needs tracking.
- **Does:** lifecycle.toml tracks Lambda and Synthetics runtime versions, dependencies and certificates approaching end-of-life, recording the action taken against each.
- **Run:** no command; see Does and Entry
- **Entry:** `lifecycle.toml`
- **Files:** lifecycle.toml
- **Keywords:** runtime lifecycle, end of life, dependency tracking, certificate expiry, synthetics runtime

## Analytics and finance (DATA)

<!-- generated:area DATA -->
- [Lake ingestion](#lake-ingestion-data): [DATA-01](#data-01-publish-activity-events-to-the-bus) Publish activity events to the bus · [DATA-02](#data-02-transform-activity-events-into-lake-rows) Transform activity events into lake rows · [DATA-03](#data-03-transform-alarm-state-changes-into-lake-rows) Transform alarm state changes into lake rows · [DATA-04](#data-04-stream-dynamodb-table-changes-into-the-lake) Stream DynamoDB table changes into the lake · [DATA-05](#data-05-pull-ga4-daily-bigquery-aggregate-tables) Pull GA4 daily BigQuery aggregate tables · [DATA-06](#data-06-pull-ga4-reports-and-bigquery-event-export) Pull GA4 reports and BigQuery event export · [DATA-07](#data-07-pull-github-operator-effort-data) Pull GitHub operator-effort data · [DATA-08](#data-08-copy-the-aws-focus-cost-export) Copy the AWS FOCUS cost export · [DATA-09](#data-09-reconcile-stripe-payments-into-the-lake) Reconcile Stripe payments into the lake
- [Lake infrastructure, quality and cost](#lake-infrastructure-quality-and-cost-data): [DATA-10](#data-10-create-or-replace-athena-business-views) Create or replace Athena business views · [DATA-11](#data-11-run-glue-data-quality-checks) Run Glue Data Quality checks · [DATA-12](#data-12-provision-the-analytics-lake-and-athena-workgroup) Provision the analytics lake and Athena workgroup · [DATA-13](#data-13-catalogue-cloudfront-access-logs-for-athena) Catalogue CloudFront access logs for Athena · [DATA-14](#data-14-catalogue-compliance-findings-for-the-dashboard) Catalogue compliance findings for the dashboard · [DATA-15](#data-15-catalogue-workflow-probe-and-agent-run-data) Catalogue workflow, probe and agent run data · [DATA-16](#data-16-alert-on-cost-budget-and-anomaly-thresholds) Alert on cost budget and anomaly thresholds · [DATA-17](#data-17-export-aws-billing-data-in-focus-format) Export AWS billing data in FOCUS format
- [Nightly publish and orchestration](#nightly-publish-and-orchestration-data): [DATA-18](#data-18-publish-the-nightly-operator-dashboard-snapshot) Publish the nightly operator dashboard snapshot · [DATA-19](#data-19-serve-the-operator-dashboard-snapshot-via-the-api) Serve the operator dashboard snapshot via the API · [DATA-20](#data-20-publish-the-nightly-raw-export-for-indexing) Publish the nightly raw export for indexing · [DATA-21](#data-21-publish-nightly-business-metrics-to-cloudwatch) Publish nightly business metrics to CloudWatch · [DATA-22](#data-22-orchestrate-the-nightly-ingestion-workflow) Orchestrate the nightly ingestion workflow
- [Site-side analytics and RUM](#site-side-analytics-and-rum-data): [DATA-23](#data-23-classify-visitor-kind-as-human-bot-or-synthetic) Classify visitor kind as human, bot or synthetic · [DATA-24](#data-24-load-ga4-analytics-on-site-pages) Load GA4 analytics on site pages · [DATA-25](#data-25-configure-and-gate-cloudwatch-rum) Configure and gate CloudWatch RUM · [DATA-26](#data-26-render-the-operator-objectives-dashboard) Render the operator objectives dashboard
- [SQL views](#sql-views-data): [DATA-27](#data-27-sql-views-activity-and-traffic) SQL views: activity and traffic · [DATA-28](#data-28-sql-views-revenue-and-subscription) SQL views: revenue and subscription · [DATA-29](#data-29-sql-views-submission-and-compliance) SQL views: submission and compliance · [DATA-30](#data-30-sql-views-cost) SQL views: cost · [DATA-31](#data-31-sql-views-dora-and-operations) SQL views: DORA and operations
- [Google Ads administration](#google-ads-administration-data): [DATA-32](#data-32-sync-the-google-ads-account) Sync the Google Ads account · [DATA-33](#data-33-read-the-google-ads-account-inventory) Read the Google Ads account inventory · [DATA-34](#data-34-report-google-ads-campaign-performance) Report Google Ads campaign performance · [DATA-35](#data-35-forecast-google-ads-keyword-performance) Forecast Google Ads keyword performance · [DATA-36](#data-36-answer-google-ads-questions-from-live-data) Answer Google Ads questions from live data
- [Google Cloud and GA4 administration](#google-cloud-and-ga4-administration-data): [DATA-37](#data-37-federate-lambda-credentials-to-google-cloud) Federate Lambda credentials to Google Cloud · [DATA-38](#data-38-sync-ga4-properties-streams-and-key-events) Sync GA4 properties, streams and key events · [DATA-39](#data-39-sync-ga4-in-bigquery-scheduled-queries) Sync GA4-in-BigQuery scheduled queries · [DATA-40](#data-40-enable-required-google-cloud-apis) Enable required Google Cloud APIs · [DATA-41](#data-41-assert-gcp-billing-budget-and-stray-project) Assert GCP billing budget and stray project · [DATA-42](#data-42-sync-gcp-workload-identity-and-org-policy) Sync GCP workload identity and org policy · [DATA-43](#data-43-read-the-google-cloud-and-ga4-inventory) Read the Google Cloud and GA4 inventory · [DATA-44](#data-44-assert-google-oauth-client-configuration) Assert Google OAuth client configuration · [DATA-45](#data-45-apply-ga4-and-gcp-iam-role-bindings) Apply GA4 and GCP IAM role bindings · [DATA-46](#data-46-configure-the-youtube-channel-as-code) Configure the YouTube channel as code · [DATA-47](#data-47-authenticate-google-cloud-scripts-via-federated-credentials) Authenticate Google Cloud scripts via federated credentials
- [Finance staging and reconciliation](#finance-staging-and-reconciliation-data): [DATA-48](#data-48-stage-paypal-transactions-for-reconciliation) Stage PayPal transactions for reconciliation · [DATA-49](#data-49-stage-stripe-transactions-for-reconciliation) Stage Stripe transactions for reconciliation · [DATA-50](#data-50-resolve-finance-staging-directory-paths) Resolve finance staging directory paths · [DATA-51](#data-51-turn-staged-stripe-activity-into-diya-gl-lines) Turn staged Stripe activity into diya-gl lines
<!-- /generated:area DATA -->

### Lake ingestion (DATA)

<!-- generated:group lake-ingestion-data -->
- [DATA-01](#data-01-publish-activity-events-to-the-bus) Publish activity events to the bus
- [DATA-02](#data-02-transform-activity-events-into-lake-rows) Transform activity events into lake rows
- [DATA-03](#data-03-transform-alarm-state-changes-into-lake-rows) Transform alarm state changes into lake rows
- [DATA-04](#data-04-stream-dynamodb-table-changes-into-the-lake) Stream DynamoDB table changes into the lake
- [DATA-05](#data-05-pull-ga4-daily-bigquery-aggregate-tables) Pull GA4 daily BigQuery aggregate tables
- [DATA-06](#data-06-pull-ga4-reports-and-bigquery-event-export) Pull GA4 reports and BigQuery event export
- [DATA-07](#data-07-pull-github-operator-effort-data) Pull GitHub operator-effort data
- [DATA-08](#data-08-copy-the-aws-focus-cost-export) Copy the AWS FOCUS cost export
- [DATA-09](#data-09-reconcile-stripe-payments-into-the-lake) Reconcile Stripe payments into the lake
<!-- /generated:group lake-ingestion-data -->

#### DATA-01 Publish activity events to the bus

- **Use when:** a Lambda or route must record a business event for the analytics lake and Telegram alerts.
- **Does:** publishActivityEvent and publishActivityFailureEvent send structured events to the ACTIVITY_BUS_NAME EventBridge bus. Calls are fire-and-forget and never block the caller. ActivityStack.java provisions the bus and a rule that forwards every event to a Telegram-forwarding Lambda.
- **Run:** `import { publishActivityEvent, publishActivityFailureEvent } from "app/lib/activityAlert.js"`
- **Entry:** `app/lib/activityAlert.js:publishActivityEvent`; `app/lib/activityAlert.js:publishActivityFailureEvent`
- **Files:** app/lib/activityAlert.js, app/unit-tests/lib/activityAlert.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/ActivityStack.java
- **Keywords:** activity event, eventbridge, activity bus, telegram alert, fire and forget, business event, actor class, hashed sub
- **Related:** DATA-02

#### DATA-02 Transform activity events into lake rows

- **Use when:** the activity-event Firehose stream must flatten EventBridge envelopes into lake rows.
- **Does:** activityEventTransform.js is the Kinesis Firehose transformation Lambda for the activity-event delivery stream. Its handler flattens each envelope into one flat JSON row with event_id, event_ts, actor, flow and outcome. A record that fails to parse returns ProcessingFailed so Firehose routes it to the error prefix.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/analytics/activityEventTransform.js:handler`
- **Files:** app/functions/analytics/activityEventTransform.js, app/unit-tests/analytics/activityEventTransform.test.js
- **Keywords:** firehose transform, activity events, parquet, flatten envelope, openx deserializer, kinesis firehose, processingfailed
- **Related:** DATA-01

#### DATA-03 Transform alarm state changes into lake rows

- **Use when:** CloudWatch alarm state changes must be flattened into lake rows for the DORA/alarms views.
- **Does:** alarmStateChangeTransform.js is the Firehose transformation Lambda for the alarm-state-change delivery stream. Its handler flattens each CloudWatch Alarm State Change envelope into one row: name, family, slug, state, reason. AlarmStateChangeDelivery.java provisions the EventBridge rule, delivery stream and Glue table.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/analytics/alarmStateChangeTransform.js:handler`
- **Files:** app/functions/analytics/alarmStateChangeTransform.js, app/unit-tests/analytics/alarmStateChangeTransform.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/AlarmStateChangeDelivery.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/AlarmStateChangeDeliveryTest.java
- **Keywords:** alarm state change, cloudwatch alarm, firehose transform, alarm family, deployment slug, alarms view
- **Related:** DATA-32

#### DATA-04 Stream DynamoDB table changes into the lake

- **Use when:** a DynamoDB table's inserts/updates/deletes must be redacted and streamed into the lake.
- **Does:** dynamoStreamToFirehose.js serves four DynamoDB Streams event source mappings for receipts, bundles, subscriptions and passes. Its handler redacts each record through a per-table field whitelist and forwards it by Firehose PutRecordBatch. A record that fails to project or deliver returns a batchItemFailure by sequence number.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/analytics/dynamoStreamToFirehose.js:handler`
- **Files:** app/functions/analytics/dynamoStreamToFirehose.js, app/unit-tests/analytics/dynamoStreamToFirehose.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/TableChangeDelivery.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/TableChangeDeliveryTest.java
- **Keywords:** dynamodb streams, table change, firehose putrecordbatch, redaction, field whitelist, batchitemfailure, receipts, bundles, subscriptions, passes

#### DATA-05 Pull GA4 daily BigQuery aggregate tables

- **Use when:** GA4's scheduled-query aggregate tables must land in the lake as daily NDJSON.
- **Does:** ga4DailyPull.js copies one D-2 day of each of BigQuery's four one-stop-dashboard aggregate tables into the lake as gzipped NDJSON. Those tables are maintained by scheduled queries declared in bigquery.toml. Ga4DailyTables.java provisions the matching Glue tables with dt partition projection.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/analytics/ga4DailyPull.js:handler`
- **Files:** app/functions/analytics/ga4DailyPull.js, app/unit-tests/analytics/ga4DailyPull.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/Ga4DailyTables.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/Ga4DailyTablesTest.java
- **Keywords:** ga4 bigquery, one-stop dashboard, aggregate tables, sessions by host source, funnel steps, key events, downloads by product, dt partition
- **Related:** DATA-06, DATA-43

#### DATA-06 Pull GA4 reports and BigQuery event export

- **Use when:** the previous day's GA4 Data API reports or raw BigQuery event export must land in the lake.
- **Does:** ga4ReportPull.js pulls three GA4 Data API reports (traffic, pages, events) via BetaAnalyticsDataClient and writes gzipped NDJSON. ga4EventExportPull.js pulls one D-2 day of GA4's raw BigQuery event export, one row per event with a session id. Both authenticate through workload identity federation.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/analytics/ga4ReportPull.js:handler`; `app/functions/analytics/ga4EventExportPull.js:handler`
- **Files:** app/functions/analytics/ga4ReportPull.js, app/unit-tests/analytics/ga4ReportPull.test.js, app/functions/analytics/ga4EventExportPull.js, app/unit-tests/analytics/ga4EventExportPull.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/Ga4Tables.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/Ga4TablesTest.java, app/unit-tests/ga4BigQueryDatasetIdEnvFiles.test.js
- **Keywords:** ga4 data api, betaanalyticsdataclient, event export, session funnel, traffic report, pages report, workload identity federation
- **Related:** DATA-05, DATA-43

#### DATA-07 Pull GitHub operator-effort data

- **Use when:** workflow runs, issue events or commits must be pulled into the lake for the operator-effort views.
- **Does:** operatorEffortPull.js pulls one UTC day of data: GitHub Actions runs, repo-wide issue events and commits. It reads the REST API through a GitHub App installation token. It tags each commit has_claude_coauthor from its Co-Authored-By trailer, not author identity, and writes NDJSON under curated/operator/.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/analytics/operatorEffortPull.js:handler`
- **Files:** app/functions/analytics/operatorEffortPull.js, app/unit-tests/analytics/operatorEffortPull.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/OperatorEffortTables.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/OperatorEffortTablesTest.java
- **Keywords:** operator effort, github actions runs, issue events, commits, github app token, co-authored-by claude, operator interventions
- **Related:** DATA-33

#### DATA-08 Copy the AWS FOCUS cost export

- **Use when:** the management account's FOCUS cost export must land in this account's lake for cost views.
- **Does:** costFocusCopy/index.js is a standalone zip Lambda for the management account's cost export bucket. Its handler lists Parquet objects modified in the last 48 hours and cross-account CopyObjects them into curated/cost/focus/dt=<today>/. It runs independent of the nightly chain; CostFocusIngestion.java provisions it and its schedule, CostFocusTables.java the Glue table.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/analytics/costFocusCopy/index.js:handler`
- **Files:** app/functions/analytics/costFocusCopy/index.js, app/unit-tests/analytics/costFocusCopy.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/CostFocusIngestion.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/CostFocusIngestionTest.java, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/CostFocusTables.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/CostFocusTablesTest.java
- **Keywords:** focus cost export, cross-account copyobject, cost allocation tags, management account, eventbridge scheduler, curated cost
- **Related:** DATA-24, DATA-25, DATA-31

#### DATA-09 Reconcile Stripe payments into the lake

- **Use when:** the previous day's Stripe balance transactions, charges or subscriptions must land in the lake.
- **Does:** stripeReconcile.js pulls the previous day's Stripe balance transactions, charges and subscriptions. Its handler hashes customer ids with the shared salt, so no lake row carries a raw Stripe identifier. It writes gzipped NDJSON under curated/stripe/; StripeReconciliationTables.java provisions the three Glue tables behind the revenue views.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/analytics/stripeReconcile.js:handler`
- **Files:** app/functions/analytics/stripeReconcile.js, app/unit-tests/analytics/stripeReconcile.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/StripeReconciliationTables.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/StripeReconciliationTablesTest.java
- **Keywords:** stripe reconciliation, balance transactions, charges, subscriptions snapshot, customer id hashing, revenue view, curated stripe
- **Related:** DATA-40

### Lake infrastructure, quality and cost (DATA)

<!-- generated:group lake-infrastructure-quality-and-cost-data -->
- [DATA-10](#data-10-create-or-replace-athena-business-views) Create or replace Athena business views
- [DATA-11](#data-11-run-glue-data-quality-checks) Run Glue Data Quality checks
- [DATA-12](#data-12-provision-the-analytics-lake-and-athena-workgroup) Provision the analytics lake and Athena workgroup
- [DATA-13](#data-13-catalogue-cloudfront-access-logs-for-athena) Catalogue CloudFront access logs for Athena
- [DATA-14](#data-14-catalogue-compliance-findings-for-the-dashboard) Catalogue compliance findings for the dashboard
- [DATA-15](#data-15-catalogue-workflow-probe-and-agent-run-data) Catalogue workflow, probe and agent run data
- [DATA-16](#data-16-alert-on-cost-budget-and-anomaly-thresholds) Alert on cost budget and anomaly thresholds
- [DATA-17](#data-17-export-aws-billing-data-in-focus-format) Export AWS billing data in FOCUS format
<!-- /generated:group lake-infrastructure-quality-and-cost-data -->

#### DATA-10 Create or replace Athena business views

- **Use when:** a new or changed Athena view under infra/main/resources/analytics/views must deploy with the stack.
- **Does:** createView.mjs is a CDK custom-resource handler pair, onEvent and isComplete, that submits a view's CREATE OR REPLACE VIEW to Athena. It polls GetQueryExecution to a terminal state before CloudFormation reports success, so a bad view definition fails the stack. BusinessViews.java wires one Provider-backed CustomResource per SQL file for the operator-facing views.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/analytics/createView.mjs:onEvent`; `app/functions/analytics/createView.mjs:isComplete`
- **Files:** app/functions/analytics/createView.mjs, app/unit-tests/analytics/createView.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/BusinessViews.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/BusinessViewsTest.java
- **Keywords:** athena view, create or replace view, cdk custom resource, getqueryexecution, cfnnamedquery, business views
- **Related:** DATA-27, DATA-28, DATA-29, DATA-30, DATA-31

#### DATA-11 Run Glue Data Quality checks

- **Use when:** new lake partitions must be registered and a Glue Data Quality ruleset run must be started.
- **Does:** dataQualityRun.js registers missing S3 partitions in the Glue catalog before checks run. Its handler starts one Glue Data Quality ruleset run per configured target table, without waiting. Glue publishes its own pass/fail metric; DataQuality.java provisions the ruleset, alarm and runner Lambda.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/analytics/dataQualityRun.js:handler`
- **Files:** app/functions/analytics/dataQualityRun.js, app/unit-tests/analytics/dataQualityRun.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/DataQuality.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/DataQualityTest.java
- **Keywords:** glue data quality, ruleset evaluation, partition registration, failed rules metric, activity_events, alarm_state_changes, dora_runs
- **Related:** DATA-14

#### DATA-12 Provision the analytics lake and Athena workgroup

- **Use when:** a new analytics construct needs the shared lake bucket, Glue database or Athena workgroup.
- **Does:** AnalyticsStack.java is the environment-scoped stack that outlives any one deployment. It owns the activity-event delivery stream, the lake's S3 buckets and the Glue catalog database. It also owns the Athena workgroup every other analytics construct queries or writes into.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/AnalyticsStack.java:AnalyticsStack`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/AnalyticsStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/AnalyticsStackTest.java
- **Keywords:** analytics lake, glue database, athena workgroup, environment-scoped stack, lake bucket, s3 lake
- **Related:** DATA-13

#### DATA-13 Catalogue CloudFront access logs for Athena

- **Use when:** CloudFront access logs must be queryable by Athena for the traffic views.
- **Does:** CloudFrontAccessLogs.java is environment-scoped, unlike the per-deployment app stacks it serves. It holds the Glue table and lake-bucket policy that let Athena query the Parquet objects CloudWatch Logs v2 delivery writes. Each deployment's own EdgeStack creates the delivery subscription that points at this table.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/CloudFrontAccessLogs.java:CloudFrontAccessLogs`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/CloudFrontAccessLogs.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/CloudFrontAccessLogsTest.java
- **Keywords:** cloudfront access logs, cloudwatch logs v2 delivery, glue table, athena query, edgestack, traffic views

#### DATA-14 Catalogue compliance findings for the dashboard

- **Use when:** accessibility or fraud-header check output must be queryable for the compliance panel.
- **Does:** ComplianceTables.java provisions two Glue tables the compliance panel reads. compliance_accessibility holds one row per page per tool per WCAG standard from the compliance.yml pa11y/axe runs. compliance_fraud_headers holds one row per month from the fraud-header-email-check.js output; both tables come from a workflow step, not a Lambda.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/ComplianceTables.java:ComplianceTables`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/ComplianceTables.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/ComplianceTablesTest.java
- **Keywords:** compliance accessibility, compliance fraud headers, wcag standard, pa11y, axe, fraud header check, compliance panel
- **Related:** DATA-11

#### DATA-15 Catalogue workflow, probe and agent run data

- **Use when:** a new DORA, probe or agent-run view must read GitHub Actions data the dora-row action writes.
- **Does:** WorkflowRunTables.java provisions three Glue tables over data the dora-row composite action writes from GitHub Actions. dora_runs holds every deploy or destroy run; probe_runs holds every probe suite in probe-test.yml. agent_runs holds every unattended agent workflow run, each table with dt partition projection.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/WorkflowRunTables.java:WorkflowRunTables`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/WorkflowRunTables.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/WorkflowRunTablesTest.java
- **Keywords:** dora runs, probe runs, agent runs, dora-row action, dt partition projection, deploy destroy run, unattended agent workflow
- **Related:** DATA-32

#### DATA-16 Alert on cost budget and anomaly thresholds

- **Use when:** a new environment needs a monthly cost budget alarm or, in prod, anomaly detection.
- **Does:** CostBudgetsAndAnomalyMonitor.java provisions a monthly AWS Budget for the account. In prod only, it also provisions a Cost Anomaly Detection monitor. Both notify through SNS into the same Telegram-forwarder Lambda ActivityStack owns.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/CostBudgetsAndAnomalyMonitor.java:CostBudgetsAndAnomalyMonitor`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/CostBudgetsAndAnomalyMonitor.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/CostBudgetsAndAnomalyMonitorTest.java
- **Keywords:** aws budgets, cost anomaly detection, sns notification, telegram forwarder, monthly budget, cost alert
- **Related:** DATA-01, DATA-08, DATA-17

#### DATA-17 Export AWS billing data in FOCUS format

- **Use when:** the management account's billing export must be created or changed for downstream cost copy.
- **Does:** SubmitCostReporting.java is a fourth, standalone CDK app deployed into the management account. It runs under separate credentials from the environment and application apps. CostExportStack.java deploys the export bucket and the BCMDataExports::Export resource, in FOCUS 1.2 Parquet format.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/SubmitCostReporting.java:main`; `infra/main/java/co/uk/diyaccounting/submit/stacks/CostExportStack.java:CostExportStack`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/SubmitCostReporting.java, infra/test/java/co/uk/diyaccounting/submit/SubmitCostReportingTest.java, infra/main/java/co/uk/diyaccounting/submit/stacks/CostExportStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/CostExportStackTest.java
- **Keywords:** focus format, bcmdataexports, management account, standalone cdk app, cost export bucket, cost-copy role
- **Related:** DATA-08

### Nightly publish and orchestration (DATA)

<!-- generated:group nightly-publish-and-orchestration-data -->
- [DATA-18](#data-18-publish-the-nightly-operator-dashboard-snapshot) Publish the nightly operator dashboard snapshot
- [DATA-19](#data-19-serve-the-operator-dashboard-snapshot-via-the-api) Serve the operator dashboard snapshot via the API
- [DATA-20](#data-20-publish-the-nightly-raw-export-for-indexing) Publish the nightly raw export for indexing
- [DATA-21](#data-21-publish-nightly-business-metrics-to-cloudwatch) Publish nightly business metrics to CloudWatch
- [DATA-22](#data-22-orchestrate-the-nightly-ingestion-workflow) Orchestrate the nightly ingestion workflow
<!-- /generated:group nightly-publish-and-orchestration-data -->

#### DATA-18 Publish the nightly operator dashboard snapshot

- **Use when:** the eight one-stop objectives must be precomputed so the dashboard route never queries Athena directly.
- **Does:** operatorSnapshotPublish.js reads the analytics views behind the eight one-stop objectives. Its handler writes one JSON snapshot per environment, with trailing 30/90-day windows, value, trend and deep link, to s3://<lake>/snapshots/<env>/latest.json. OperatorSnapshotPublish.java provisions the Lambda and its own EventBridge rule inside AnalyticsStack.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/analytics/operatorSnapshotPublish.js:handler`
- **Files:** app/functions/analytics/operatorSnapshotPublish.js, app/unit-tests/analytics/operatorSnapshotPublish.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/OperatorSnapshotPublish.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/OperatorSnapshotPublishTest.java
- **Keywords:** operator snapshot, one-stop objectives, trailing window, trend, deep link, nightly publish, dashboard snapshot
- **Related:** DATA-19, DATA-24

#### DATA-19 Serve the operator dashboard snapshot via the API

- **Use when:** the operator dashboard page needs its snapshot data over HTTP.
- **Does:** operatorSnapshotGet.js is the GET /api/v1/operator/snapshot Lambda. Its ingestHandler enforces the operator bundle entitlement and reads snapshots/<env>/latest.json from the lake. It returns that snapshot, or 404 when the nightly job has not run yet.
- **Run:** `GET /api/v1/operator/snapshot`
- **Entry:** `app/functions/analytics/operatorSnapshotGet.js:ingestHandler`
- **Files:** app/functions/analytics/operatorSnapshotGet.js, app/unit-tests/analytics/operatorSnapshotGet.test.js
- **Keywords:** operator snapshot api, bundle entitlement, get snapshot, operator dashboard route, 404 not run
- **Related:** DATA-18, DATA-24

#### DATA-20 Publish the nightly raw export for indexing

- **Use when:** a dashboard figure must be readable as a plain file, for the corpus index.
- **Does:** rawExportPublish.js writes one CSV per Athena business view and one JSON per one-stop-dashboard objective to s3://<lake>/exports/<env>/<date>/. scripts/analytics-pull.sh does a one-way aws s3 sync --delete of that exports prefix down to the workspace's analytics/<env>/ tree. RawExport.java provisions the publishing Lambda.
- **Run:** `scripts/analytics-pull.sh`
- **Entry:** `app/functions/analytics/rawExportPublish.js:handler`
- **Files:** app/functions/analytics/rawExportPublish.js, app/unit-tests/analytics/rawExportPublish.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/RawExport.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/RawExportTest.java, scripts/analytics-pull.sh
- **Keywords:** raw export, csv per view, s3 sync, corpus index, analytics-pull, exports prefix, workspace mirror
- **Related:** DATA-18

#### DATA-21 Publish nightly business metrics to CloudWatch

- **Use when:** a business figure (active users, submissions, revenue, HMRC failures, cost) needs a CloudWatch metric for the dashboard.
- **Does:** analyticsMetricsPublish.js runs one Athena query per entry in METRIC_DEFINITIONS against the prior day's data. Its handler publishes each result as a CloudWatch custom metric, batched at 20, in the fixed Submit/Analytics namespace. A query failure throws and stops the run, rather than publish a false zero; AnalyticsDashboard.java provisions the Lambda and dashboard.
- **Run:** no command; see Does and Entry
- **Entry:** `app/functions/analytics/analyticsMetricsPublish.js:handler`
- **Files:** app/functions/analytics/analyticsMetricsPublish.js, app/unit-tests/analytics/analyticsMetricsPublish.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/AnalyticsDashboard.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/AnalyticsDashboardTest.java
- **Keywords:** cloudwatch custom metric, submit/analytics namespace, metric_definitions, putmetricdata, business metrics, cloudwatch dashboard
- **Related:** DATA-22

#### DATA-22 Orchestrate the nightly ingestion workflow

- **Use when:** a new ingestion job must join the nightly chain, or the chain's failure behaviour must be checked.
- **Does:** NightlyIngestionWorkflow.java builds a Step Functions state machine; IngestionStack.java owns its EventBridge Scheduler schedule and alarms. A Parallel branch runs five ingestion jobs, then data quality, metrics publish and raw export publish. There is no Catch: any failure stops the chain, not a false zero.
- **Run:** `scripts/verify-analytics-pipeline.sh`; `scripts/verify-ingestion-jobs.sh`
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/NightlyIngestionWorkflow.java:NightlyIngestionWorkflow`; `infra/main/java/co/uk/diyaccounting/submit/stacks/IngestionStack.java:IngestionStack`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/NightlyIngestionWorkflow.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/NightlyIngestionWorkflowTest.java, infra/main/java/co/uk/diyaccounting/submit/stacks/IngestionStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/IngestionStackTest.java, scripts/verify-ingestion-jobs.sh, scripts/verify-analytics-pipeline.sh
- **Keywords:** step functions, nightly ingestion, parallel branch, eventbridge scheduler, lambda errors alarm, verify pipeline, verify ingestion jobs
- **Related:** DATA-05, DATA-06, DATA-07, DATA-09, DATA-11, DATA-21

### Site-side analytics and RUM (DATA)

<!-- generated:group site-side-analytics-and-rum-data -->
- [DATA-23](#data-23-classify-visitor-kind-as-human-bot-or-synthetic) Classify visitor kind as human, bot or synthetic
- [DATA-24](#data-24-load-ga4-analytics-on-site-pages) Load GA4 analytics on site pages
- [DATA-25](#data-25-configure-and-gate-cloudwatch-rum) Configure and gate CloudWatch RUM
- [DATA-26](#data-26-render-the-operator-objectives-dashboard) Render the operator objectives dashboard
<!-- /generated:group site-side-analytics-and-rum-data -->

#### DATA-23 Classify visitor kind as human, bot or synthetic

- **Use when:** a Lambda, RUM script or GA4 tag must agree on human, bot or synthetic.
- **Does:** visitorClassifier.js classifies a User-Agent server-side as human, ai-agent or crawler. visitor-kind.js is the RUM client's browser-side equivalent, classifying a session as human, bot or synthetic. It reads the same user-agent substrings, plus the requestIdPrefix marker behaviour tests set, so RUM and GA4 agree.
- **Run:** `import { classifyVisitor } from "app/lib/visitorClassifier.js"`; `import { classifyVisitorKind } from "web/public/lib/utils/visitor-kind.js"`
- **Entry:** `app/lib/visitorClassifier.js:classifyVisitor`; `web/public/lib/utils/visitor-kind.js:classifyVisitorKind`
- **Files:** app/lib/visitorClassifier.js, app/unit-tests/lib/visitorClassifier.test.js, web/public/lib/utils/visitor-kind.js, web/unit-tests/visitor-kind.test.js, web/unit-tests/rum-visitor-kind.test.js
- **Keywords:** visitor kind, human bot synthetic, ai-agent crawler, user-agent classification, requestidprefix, rum ga4 agreement
- **Related:** DATA-24

#### DATA-24 Load GA4 analytics on site pages

- **Use when:** a site page must load gtag.js with the correct measurement id, consent state and cross-domain linking.
- **Does:** web/public/lib/analytics.js loads gtag.js with the environment's measurement id read from /submit.env. It defaults consent to denied and reapplies a returning visitor's saved localStorage consent. It links the three diyaccounting.co.uk hosts as one cross-domain session and sets a visitor_kind property.
- **Run:** no command; see Does and Entry
- **Entry:** `web/public/lib/analytics.js:startGa4`
- **Files:** web/public/lib/analytics.js, web/unit-tests/analytics.test.js
- **Keywords:** gtag.js, ga4 measurement id, consent denied default, cross-domain session, visitor_kind property, submit.env
- **Related:** DATA-23

#### DATA-25 Configure and gate CloudWatch RUM

- **Use when:** a page's RUM telemetry must read its app monitor config and respect consent.
- **Does:** The RUM client reads its app monitor id, region, identity pool and guest role from page meta tags. It sends telemetry only once consent.rum, or the legacy consent.analytics, is granted. rum-placeholders.system.test.js confirms the RUM_ placeholders exist in source HTML before deployment substitutes them.
- **Run:** no command; see Does and Entry
- **Entry:** `web/unit-tests/rum-config.test.js:`; `app/system-tests/rum-placeholders.system.test.js:`
- **Files:** web/unit-tests/rum-config.test.js, web/unit-tests/rum-consent.test.js, app/system-tests/rum-placeholders.system.test.js
- **Keywords:** cloudwatch rum, app monitor, guest role, consent.rum, rum placeholders, meta tag config
- **Related:** DATA-24

#### DATA-26 Render the operator objectives dashboard

- **Use when:** the operator-only dashboard page must show the eight one-stop objectives or the account's activity list.
- **Does:** web/public/operator/dashboard.html is the operator-only page, behind the operator bundle entitlement. It renders the eight one-stop objectives' trailing 30/90-day observations, trend and deep links from operatorSnapshotGet.js. It also lists the account's entitled bundles; PLAN_ONE_STOP_DASHBOARD.md is the plan it implements.
- **Run:** no command; see Does and Entry
- **Entry:** `web/public/operator/dashboard.html:`
- **Files:** web/public/operator/dashboard.html, web/browser-tests/operatorDashboard.browser.test.js, web/browser-tests/operatorDashboardActivity.browser.test.js, PLAN_ONE_STOP_DASHBOARD.md
- **Keywords:** operator dashboard page, one-stop objectives, operator bundle entitlement, activity list, trend deep link
- **Related:** DATA-19

### SQL views (DATA)

<!-- generated:group sql-views-data -->
- [DATA-27](#data-27-sql-views-activity-and-traffic) SQL views: activity and traffic
- [DATA-28](#data-28-sql-views-revenue-and-subscription) SQL views: revenue and subscription
- [DATA-29](#data-29-sql-views-submission-and-compliance) SQL views: submission and compliance
- [DATA-30](#data-30-sql-views-cost) SQL views: cost
- [DATA-31](#data-31-sql-views-dora-and-operations) SQL views: DORA and operations
<!-- /generated:group sql-views-data -->

#### DATA-27 SQL views: activity and traffic

- **Use when:** a question is about daily active users, HMRC auth/bundle activity, GA4 sessions, visitor kind or funnel steps.
- **Does:** Seven Athena views answer traffic and activity questions over activity_events_all. That view unions the JSON- and Parquet-era event tables into one queryable shape. They cover active users, HMRC activity, GA4 sessions by country and source, visitor kind, and GA4 funnels.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/resources/analytics/views/activity_events_all.sql:`
- **Files:** infra/main/resources/analytics/views/activity_events_all.sql, infra/main/resources/analytics/views/v_active_users_daily.sql, infra/main/resources/analytics/views/v_business_activity_daily.sql, infra/main/resources/analytics/views/v_traffic_by_country_daily.sql, infra/main/resources/analytics/views/v_traffic_sources_daily.sql, infra/main/resources/analytics/views/v_visitors_by_kind_daily.sql, infra/main/resources/analytics/views/v_ga4_funnel_daily.sql
- **Keywords:** active users daily, business activity, traffic by country, traffic sources, visitors by kind, ga4 funnel, activity_events_all
- **Related:** DATA-10, DATA-01, DATA-23

#### DATA-28 SQL views: revenue and subscription

- **Use when:** a question is about Stripe revenue, subscription renewals/cancellations, purchase reconciliation or pass redemptions.
- **Does:** Five Athena views answer money questions. They cover daily Stripe revenue by product, and subscription renewals and cancellations from the change log. They also cover a daily GA4/Stripe/activity-event purchase reconciliation, and passes issued versus redeemed.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/resources/analytics/views/v_revenue_daily.sql:`
- **Files:** infra/main/resources/analytics/views/v_revenue_daily.sql, infra/main/resources/analytics/views/v_subscription_renewals_daily.sql, infra/main/resources/analytics/views/v_subscription_cancellations_daily.sql, infra/main/resources/analytics/views/v_purchase_reconciliation_daily.sql, infra/main/resources/analytics/views/v_pass_redemptions_daily.sql
- **Keywords:** revenue daily, subscription renewals, subscription cancellations, purchase reconciliation, pass redemptions, stripe revenue
- **Related:** DATA-09, DATA-10

#### DATA-29 SQL views: submission and compliance

- **Use when:** a question is about VAT/ITSA/Companies House completions, HMRC failures, signup funnels, repeat filers or accessibility.
- **Does:** Seven Athena views cover VAT, ITSA and Companies House completions, by outcome and by activity. They also cover HMRC failures by class, and time to first submission for active or new customers. They cover quarter-on-quarter repeat filers, and the compliance headline of open accessibility and fraud-header findings.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/resources/analytics/views/v_submissions_daily.sql:`
- **Files:** infra/main/resources/analytics/views/v_submissions_daily.sql, infra/main/resources/analytics/views/v_submissions_by_activity_daily.sql, infra/main/resources/analytics/views/v_hmrc_failures_by_class.sql, infra/main/resources/analytics/views/v_login_to_submission_funnel.sql, infra/main/resources/analytics/views/v_signup_to_first_submission.sql, infra/main/resources/analytics/views/v_returning_submitters_quarterly.sql, infra/main/resources/analytics/views/v_compliance_status.sql
- **Keywords:** submissions daily, hmrc failures by class, login to submission funnel, signup to first submission, returning submitters, compliance status
- **Related:** DATA-04, DATA-14

#### DATA-30 SQL views: cost

- **Use when:** a question is about AWS spend by service or tag, cost per submission, or the steady-state target.
- **Does:** Three Athena views read the FOCUS cost export. They cover billed cost by AWS service, and by DeploymentName/Stack cost-allocation tags, each day. They also cover cost per completion, and monthly spend against a $64.77 steady-state target.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/resources/analytics/views/v_cost_daily.sql:`
- **Files:** infra/main/resources/analytics/views/v_cost_daily.sql, infra/main/resources/analytics/views/v_cost_per_submission_daily.sql, infra/main/resources/analytics/views/v_cost_vs_target_monthly.sql
- **Keywords:** cost daily, cost per submission, cost vs target, focus cost export, deployment name tag, steady-state target
- **Related:** DATA-08, DATA-17

#### DATA-31 SQL views: DORA and operations

- **Use when:** a question is about deploy success rate, agent workflow outcomes, probe pass rate, alarm activity or operator interventions.
- **Does:** Five Athena views cover deploy and destroy run counts, success rate and lead time. They cover agent workflow runs, and the share leading to a merged PR or closed issue. They cover probe pass rate and error budget, alarms by family, and operator interventions.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/resources/analytics/views/v_dora_runs_daily.sql:`
- **Files:** infra/main/resources/analytics/views/v_agent_runs_daily.sql, infra/main/resources/analytics/views/v_alarm_state_changes_daily.sql, infra/main/resources/analytics/views/v_availability_sli_daily.sql, infra/main/resources/analytics/views/v_dora_runs_daily.sql, infra/main/resources/analytics/views/v_operator_interventions_daily.sql
- **Keywords:** dora runs daily, agent runs daily, alarm state changes daily, availability sli, operator interventions, error budget, lead time
- **Related:** DATA-15, DATA-03, DATA-07

### Google Ads administration (DATA)

<!-- generated:group google-ads-administration-data -->
- [DATA-32](#data-32-sync-the-google-ads-account) Sync the Google Ads account
- [DATA-33](#data-33-read-the-google-ads-account-inventory) Read the Google Ads account inventory
- [DATA-34](#data-34-report-google-ads-campaign-performance) Report Google Ads campaign performance
- [DATA-35](#data-35-forecast-google-ads-keyword-performance) Forecast Google Ads keyword performance
- [DATA-36](#data-36-answer-google-ads-questions-from-live-data) Answer Google Ads questions from live data
<!-- /generated:group google-ads-administration-data -->

#### DATA-32 Sync the Google Ads account

- **Use when:** ads.toml's declared tagging, goals, campaigns or bidding strategy must be applied to the live account.
- **Does:** ads-sync.js diffs ads.toml's declared tagging, goals and campaign settings against the live Google Ads account. It applies the difference with --apply. A missing Search campaign is created outright; it never creates conversion actions, goals or Performance Max campaigns.
- **Run:** `npm run ads:sync`; `npm run ads:sync -- --apply`
- **Entry:** `infra/google/ads/ads-sync.js:main`; `infra/google/ads/ads-sync.js:planAds`
- **Files:** infra/google/ads/ads-sync.js, app/unit-tests/scripts/adsSync.test.js, infra/google/ads/ads.toml
- **Keywords:** google ads sync, campaign bidding, auto-tagging, conversion goal, search campaign create, ads.toml, plan apply
- **Related:** DATA-33, DATA-42

#### DATA-33 Read the Google Ads account inventory

- **Use when:** a plan or report needs a read-only snapshot of the live Google Ads account before acting.
- **Does:** ads-inventory.js is a read-only snapshot of the account named in ads.toml. It reads the customer record, conversion actions and goals, campaigns and asset groups. It also reads the GA4/Ads link, writing nothing; it is the shared layer ads-sync.js, ads-report.js and ads-forecast.js build on.
- **Run:** `npm run ads:inventory`
- **Entry:** `infra/google/ads/ads-inventory.js:main`
- **Files:** infra/google/ads/ads-inventory.js, app/unit-tests/scripts/adsInventory.test.js, _developers/ADS_MCP_EVALUATION.md
- **Keywords:** google ads inventory, read-only snapshot, conversion actions, asset groups, ga4 ads link, shared query layer
- **Related:** DATA-32, DATA-34, DATA-35

#### DATA-34 Report Google Ads campaign performance

- **Use when:** a task asks how Google Ads campaigns, ad groups or keywords are performing over a date range.
- **Does:** ads-report.js is a read-only performance report per campaign, ad group and keyword over a date range. It reports impressions, clicks, cost, average CPC, CTR, conversions and conversion value. The default range is 28 days ending yesterday.
- **Run:** `npm run ads:report`; `npm run ads:report -- --from 2026-08-26 --to 2026-09-22`; `npm run ads:report -- --from 2026-08-26 --to 2026-09-22 --json`
- **Entry:** `infra/google/ads/ads-report.js:main`
- **Files:** infra/google/ads/ads-report.js, app/unit-tests/scripts/adsReport.test.js
- **Keywords:** google ads report, cpc, ctr, conversions, conversion value, keyword performance, ad group performance
- **Related:** DATA-33, DATA-36

#### DATA-35 Forecast Google Ads keyword performance

- **Use when:** a task asks how many clicks or conversions a proposed keyword list and daily budget would deliver.
- **Does:** ads-forecast.js is a read-only keyword forecast for a given keyword list. It reports historical searches, competition and bid range, plus expected clicks and cost at a daily budget. It never creates or spends against a live campaign.
- **Run:** `npm run ads:forecast -- --keywords "vat filing software,mtd vat" --budget-gbp 50`; `npm run ads:forecast -- --keywords-file keywords.txt --budget-gbp 50`
- **Entry:** `infra/google/ads/ads-forecast.js:main`
- **Files:** infra/google/ads/ads-forecast.js, app/unit-tests/scripts/adsForecast.test.js
- **Keywords:** google ads forecast, keyword forecast, expected clicks, daily budget, maximize clicks bidding, developer_token_not_approved
- **Related:** DATA-33, DATA-34, DATA-36

#### DATA-36 Answer Google Ads questions from live data

- **Use when:** asked how the Google Ads account is doing, what a budget would buy, or how to optimise spend.
- **Does:** The ads-advisor skill answers Google Ads questions from live data and live code in infra/google/ads/, never a guessed number. It runs ads:report for performance, and ads:forecast for click estimates. It judges cost per session against the £0.36 break-even, and checks spend against the 20% reinvestment ceiling.
- **Run:** `/ads-advisor`
- **Entry:** `.claude/skills/ads-advisor/SKILL.md:`
- **Files:** .claude/skills/ads-advisor/SKILL.md
- **Keywords:** ads advisor skill, cost per session, break-even, reinvestment ceiling, bidding optimisation, budget forecast question
- **Related:** DATA-34, DATA-35, DATA-32

### Google Cloud and GA4 administration (DATA)

<!-- generated:group google-cloud-and-ga4-administration-data -->
- [DATA-37](#data-37-federate-lambda-credentials-to-google-cloud) Federate Lambda credentials to Google Cloud
- [DATA-38](#data-38-sync-ga4-properties-streams-and-key-events) Sync GA4 properties, streams and key events
- [DATA-39](#data-39-sync-ga4-in-bigquery-scheduled-queries) Sync GA4-in-BigQuery scheduled queries
- [DATA-40](#data-40-enable-required-google-cloud-apis) Enable required Google Cloud APIs
- [DATA-41](#data-41-assert-gcp-billing-budget-and-stray-project) Assert GCP billing budget and stray project
- [DATA-42](#data-42-sync-gcp-workload-identity-and-org-policy) Sync GCP workload identity and org policy
- [DATA-43](#data-43-read-the-google-cloud-and-ga4-inventory) Read the Google Cloud and GA4 inventory
- [DATA-44](#data-44-assert-google-oauth-client-configuration) Assert Google OAuth client configuration
- [DATA-45](#data-45-apply-ga4-and-gcp-iam-role-bindings) Apply GA4 and GCP IAM role bindings
- [DATA-46](#data-46-configure-the-youtube-channel-as-code) Configure the YouTube channel as code
- [DATA-47](#data-47-authenticate-google-cloud-scripts-via-federated-credentials) Authenticate Google Cloud scripts via federated credentials
<!-- /generated:group google-cloud-and-ga4-administration-data -->

#### DATA-37 Federate Lambda credentials to Google Cloud

- **Use when:** an analytics Lambda must call a Google Cloud or GA4 API without a stored service-account key.
- **Does:** googleWorkloadIdentity.js lets an analytics Lambda reach Google Cloud with no stored key. It builds a google-auth-library AwsClient whose AwsSecurityCredentialsSupplier reads the Lambda's own execution-role environment variables. That is presented to Google's STS, through the pool identity.toml declares, to impersonate the GA4 service account.
- **Run:** `import { buildGoogleAuthClient } from "app/lib/googleWorkloadIdentity.js"`
- **Entry:** `app/lib/googleWorkloadIdentity.js:`
- **Files:** app/lib/googleWorkloadIdentity.js, app/unit-tests/lib/googleWorkloadIdentity.test.js
- **Keywords:** workload identity federation, aws security credentials supplier, google sts, no stored key, ga4 service account, identity.toml
- **Related:** DATA-05, DATA-06, DATA-40

#### DATA-38 Sync GA4 properties, streams and key events

- **Use when:** a GA4 property's streams, key events, enhanced measurement or BigQuery link must match analytics.toml.
- **Does:** ga4-sync.js makes every GA4 property declared in analytics.toml match live state: the shared cross-site property plus one per-environment property. It finds or creates each property, its data streams, enhanced-measurement settings, key events and BigQuery link. It writes the chosen stream's measurement id onto the matching GitHub Environment's SUBMIT_GA4_MEASUREMENT_ID variable.
- **Run:** `npm run ga4:sync`; `npm run ga4:sync -- --apply`
- **Entry:** `infra/google/ga4/ga4-sync.js:main`
- **Files:** infra/google/ga4/ga4-sync.js, app/unit-tests/scripts/ga4Sync.test.js, infra/google/ga4/analytics.toml
- **Keywords:** ga4 property sync, data streams, key events, enhanced measurement, bigquery link, measurement id, github environment variable
- **Related:** DATA-39, DATA-05, DATA-06

#### DATA-39 Sync GA4-in-BigQuery scheduled queries

- **Use when:** the ga4_daily BigQuery dataset's scheduled queries must match bigquery.toml.
- **Does:** ga4-bigquery-sync.js makes the live ga4_daily BigQuery dataset and its Data Transfer scheduled queries match bigquery.toml. Each declared query becomes a scheduled_query transfer config writing one day of GA4's BigQuery events_* export. The destination table is write-truncated and partitioned.
- **Run:** `npm run ga4:bigquery-sync`; `npm run ga4:bigquery-sync -- --apply`
- **Entry:** `infra/google/ga4/ga4-bigquery-sync.js:main`
- **Files:** infra/google/ga4/ga4-bigquery-sync.js, app/unit-tests/scripts/ga4BigQuerySync.test.js, infra/google/gcp/bigquery.toml, infra/google/gcp/bigquery/downloads_by_product_daily.sql, infra/google/gcp/bigquery/funnel_steps_daily.sql, infra/google/gcp/bigquery/key_events_daily.sql, infra/google/gcp/bigquery/sessions_by_host_source_daily.sql
- **Keywords:** ga4 bigquery sync, scheduled query, data transfer, events_* export, write-truncated table, bigquery.toml
- **Related:** DATA-38, DATA-05

#### DATA-40 Enable required Google Cloud APIs

- **Use when:** a fresh GA4 project needs its required services enabled with no console click.
- **Does:** gcp-enable-apis.js idempotently enables every service listed in project.toml's apis.services table on the GA4 project. It runs first in google-apply.yml so a fresh project needs no manual step.
- **Run:** `node infra/google/gcp/gcp-enable-apis.js`; `node infra/google/gcp/gcp-enable-apis.js --apply`; `node infra/google/gcp/gcp-enable-apis.js --apply --project diyaccounting-ga4`
- **Entry:** `infra/google/gcp/gcp-enable-apis.js:main`
- **Files:** infra/google/gcp/gcp-enable-apis.js, app/unit-tests/scripts/gcpEnableApis.test.js
- **Keywords:** enable gcp apis, idempotent enable, project.toml services, fresh project bootstrap, google-apply workflow
- **Related:** DATA-41, DATA-43, DATA-44

#### DATA-41 Assert GCP billing budget and stray project

- **Use when:** the GA4 billing account's budget alert thresholds must be checked, or a stray auto-created project verified empty.
- **Does:** gcp-billing-assert.js finds or creates a budget on the billing account holding diyaccounting-ga4. It uses the alert thresholds in project.toml, reusing any existing hand-created budget rather than duplicating it. It also checks that the auto-created stray project valued-context-507200-m9 is empty before it is deleted.
- **Run:** `node infra/google/gcp/gcp-billing-assert.js`; `node infra/google/gcp/gcp-billing-assert.js --apply`
- **Entry:** `infra/google/gcp/gcp-billing-assert.js:main`
- **Files:** infra/google/gcp/gcp-billing-assert.js, app/unit-tests/scripts/gcp-billing-assert.test.js
- **Keywords:** gcp billing budget, alert thresholds, stray project, billing account, budget dedupe, project.toml
- **Related:** DATA-16, DATA-40

#### DATA-42 Sync GCP workload identity and org policy

- **Use when:** a Lambda's federated access to Google Cloud must be granted, or an org policy must match identity.toml.
- **Does:** gcp-identity-sync.js makes the workload identity pool, its providers, the service account's roles/iam.workloadIdentityUser bindings and every declared org policy match identity.toml. It diffs live IAM and Org Policy API state and applies the difference. --write-cred-configs writes the external-account credential configuration files googleWorkloadIdentity.js's Lambdas build at runtime.
- **Run:** `node infra/google/gcp/gcp-identity-sync.js`; `node infra/google/gcp/gcp-identity-sync.js --apply`; `node infra/google/gcp/gcp-identity-sync.js --apply --write-cred-configs`
- **Entry:** `infra/google/gcp/gcp-identity-sync.js:`
- **Files:** infra/google/gcp/gcp-identity-sync.js, app/unit-tests/scripts/gcpIdentitySync.test.js, infra/google/gcp/identity.toml
- **Keywords:** workload identity pool, org policy, iam workloadidentityuser, write-cred-configs, identity.toml, federated access
- **Related:** DATA-37, DATA-40

#### DATA-43 Read the Google Cloud and GA4 inventory

- **Use when:** a toml file or a script's plan must be checked against the live Google Cloud/GA4 state before acting.
- **Does:** google-inventory.js is a read-only snapshot of the GA4 project's enabled services, IAM policy and budgets. It reads every GA4 account and property, its streams, key events and BigQuery links. It also reads the service account's keys, the project's IAP brand, and BigQuery transfer configs.
- **Run:** `npm run google:inventory`
- **Entry:** `infra/google/gcp/google-inventory.js:main`
- **Files:** infra/google/gcp/google-inventory.js, app/unit-tests/scripts/googleInventory.test.js
- **Keywords:** google cloud inventory, ga4 inventory, iam policy snapshot, billing budgets, iap brand, bigquery datasets, read-only check
- **Related:** DATA-38, DATA-41

#### DATA-44 Assert Google OAuth client configuration

- **Use when:** the sign-in or YouTube OAuth client's live configuration must be checked against oauth.toml.
- **Does:** google-oauth-assert.js checks oauth.toml's two declared OAuth clients against everything a live API can confirm. It checks each client's Auth Platform brand, its id against Cognito or Secrets Manager, and token scopes. It never writes anything.
- **Run:** `node infra/google/gcp/google-oauth-assert.js`
- **Entry:** `infra/google/gcp/google-oauth-assert.js:main`
- **Files:** infra/google/gcp/google-oauth-assert.js, app/unit-tests/scripts/googleOauthAssert.test.js, infra/google/gcp/oauth.toml
- **Keywords:** oauth client assert, auth platform brand, cognito client id, youtube client secret, refresh token scopes, read-only, oauth.toml
- **Related:** DATA-46

#### DATA-45 Apply GA4 and GCP IAM role bindings

- **Use when:** a principal's GA4 Analytics Admin access or GCP Resource Manager IAM bindings must match project.toml.
- **Does:** google-roles-apply.js reads project.toml and lists live GA4 Analytics Admin and GCP IAM bindings for its named principals. It diffs and applies the difference. It only touches a binding the file names; removing an entry stops managing a grant, not revoking it.
- **Run:** `node infra/google/gcp/google-roles-apply.js`; `node infra/google/gcp/google-roles-apply.js --apply`
- **Entry:** `infra/google/gcp/google-roles-apply.js:`
- **Files:** infra/google/gcp/google-roles-apply.js, app/unit-tests/scripts/googleRolesApply.test.js, infra/google/gcp/project.toml
- **Keywords:** ga4 analytics admin access, gcp iam bindings, resource manager, project.toml principals, role diff apply
- **Related:** DATA-41, DATA-43

#### DATA-46 Configure the YouTube channel as code

- **Use when:** the channel scripts/youtube-upload.js targets needs declaring or checking without a recorded channel id.
- **Does:** youtube.toml declares the YouTube channel scripts/youtube-upload.js uploads to. The channel is resolved by handle through the YouTube Data API rather than a recorded channel id.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/google/gcp/youtube.toml:`
- **Files:** infra/google/gcp/youtube.toml
- **Keywords:** youtube channel config, youtube data api, channel handle, youtube-upload.js, channel as code
- **Related:** DATA-44

#### DATA-47 Authenticate Google Cloud scripts via federated credentials

- **Use when:** any infra/google script needs a Google Cloud client without a stored service-account key.
- **Does:** googleAuth.js is the shared helper every infra/google script builds a GoogleAuth client from. It asserts GOOGLE_APPLICATION_CREDENTIALS is set, left behind by google-github-actions/auth's OIDC exchange, and wraps it with the requested scopes. It needs no service-account key.
- **Run:** `import { getGoogleAuthClient } from "infra/google/lib/googleAuth.js"`
- **Entry:** `infra/google/lib/googleAuth.js:`
- **Files:** infra/google/lib/googleAuth.js, app/unit-tests/scripts/googleAuth.test.js
- **Keywords:** google auth helper, google_application_credentials, oidc exchange, no service account key, shared auth client
- **Related:** DATA-37

### Finance staging and reconciliation (DATA)

<!-- generated:group finance-staging-and-reconciliation-data -->
- [DATA-48](#data-48-stage-paypal-transactions-for-reconciliation) Stage PayPal transactions for reconciliation
- [DATA-49](#data-49-stage-stripe-transactions-for-reconciliation) Stage Stripe transactions for reconciliation
- [DATA-50](#data-50-resolve-finance-staging-directory-paths) Resolve finance staging directory paths
- [DATA-51](#data-51-turn-staged-stripe-activity-into-diya-gl-lines) Turn staged Stripe activity into diya-gl lines
<!-- /generated:group finance-staging-and-reconciliation-data -->

#### DATA-48 Stage PayPal transactions for reconciliation

- **Use when:** one month's PayPal transactions must be pulled and staged for reconciliation.
- **Does:** paypal-stage.js pulls one month's PayPal Transaction Search API results, as raw objects. It keeps transaction_status and writes results to the workspace's staging tree. It reads its OAuth client id and secret from Secrets Manager only, never an environment variable.
- **Run:** `AWS_PROFILE=submit-prod node scripts/finance/paypal-stage.js --month 2026-03`
- **Entry:** `scripts/finance/paypal-stage.js:`
- **Files:** scripts/finance/paypal-stage.js, app/unit-tests/scripts/finance/paypalStage.test.js
- **Keywords:** paypal transaction search, accounts staging, reconciliation, secrets manager oauth, transaction_status
- **Related:** DATA-49, DATA-50

#### DATA-49 Stage Stripe transactions for reconciliation

- **Use when:** one month's Stripe balance transactions and payouts must be pulled and staged for accounts reconciliation.
- **Does:** stripe-stage.js pulls one month's Stripe balance transactions and payouts. It keeps gross, fee and net separate, nothing netted, and writes them to the staging tree. It reads the live secret key from stripe.toml's Secrets Manager entry.
- **Run:** `AWS_PROFILE=submit-prod node scripts/finance/stripe-stage.js --month 2026-03`
- **Entry:** `scripts/finance/stripe-stage.js:`
- **Files:** scripts/finance/stripe-stage.js, app/unit-tests/scripts/finance/stripeStage.test.js
- **Keywords:** stripe balance transactions, stripe payouts, accounts staging, gross fee net, stripe.toml secret
- **Related:** DATA-48, DATA-50, DATA-51

#### DATA-50 Resolve finance staging directory paths

- **Use when:** a finance script must find the shared staging tree, or label a month by UK accounting year-end.
- **Does:** staging-paths.js resolves the shared ../staging/<year-end>/<source>/ path outside the repository. It uses git rev-parse --git-common-dir, so every worktree stages into the same tree. It labels a month by UK accounting year-end; paypal-stage.js and stripe-stage.js share it.
- **Run:** `import { resolveStagingPath } from "scripts/finance/lib/staging-paths.js"`
- **Entry:** `scripts/finance/lib/staging-paths.js:`
- **Files:** scripts/finance/lib/staging-paths.js, app/unit-tests/scripts/finance/stagingPaths.test.js
- **Keywords:** staging directory, accounting year-end, git-common-dir, shared worktree staging, finance staging path
- **Related:** DATA-48, DATA-49

#### DATA-51 Turn staged Stripe activity into diya-gl lines

- **Use when:** staged Stripe transactions or payouts must become validated diya-gl bookkeeping lines.
- **Does:** stripe-lines.js turns staged Stripe transactions into diya-gl lines, posting each charge's gross and fee separately. stripePayoutLines turns payouts into bank lines dated to arrival_date. reconcileStripeMonth checks that charges minus fees minus refunds equal payouts plus balance change.
- **Run:** `import { stripeLinesFromTransactions, stripePayoutLines, reconcileStripeMonth } from "mcp/lib/finance/stripe-lines.js"`
- **Entry:** `mcp/lib/finance/stripe-lines.js:stripeLinesFromTransactions`; `mcp/lib/finance/stripe-lines.js:stripePayoutLines`; `mcp/lib/finance/stripe-lines.js:reconcileStripeMonth`
- **Files:** mcp/lib/finance/stripe-lines.js, mcp/test/stripe-lines.test.js
- **Keywords:** diya-gl lines, stripe gross fee split, credit note, bank line, arrival_date, stripe reconciliation, validateLines
- **Related:** DATA-49

## MCP and tools (MCP)

<!-- generated:area MCP -->
- [Server and CLI](#server-and-cli-mcp): [MCP-01](#mcp-01-expose-the-submission-mcp-server-and-tools) Expose the submission MCP server and tools · [MCP-02](#mcp-02-authenticate-mcp-sessions-via-cognito) Authenticate MCP sessions via Cognito
- [Book and derivation tools](#book-and-derivation-tools-mcp): [MCP-03](#mcp-03-load-and-save-diya-gl-books-via-mcp) Load and save diya-gl books via MCP · [MCP-04](#mcp-04-derive-micro-entity-accounts-figures-for-companies-house-filing) Derive micro-entity accounts figures for Companies House filing · [MCP-05](#mcp-05-derive-vat-figures-via-mcp-tools) Derive VAT figures via MCP tools · [MCP-06](#mcp-06-derive-itsa-quarterly-and-annual-submission-figures) Derive ITSA quarterly and annual submission figures
- [Filing and practice tools](#filing-and-practice-tools-mcp): [MCP-07](#mcp-07-file-vat-returns-and-accounts-via-api) File VAT returns and accounts via API · [MCP-08](#mcp-08-manage-practice-clients-and-hmrc-agent-authorisation) Manage practice clients and HMRC agent authorisation · [MCP-09](#mcp-09-run-a-client-scoped-tool-across-every-practice-client) Run a client-scoped tool across every practice client
- [Finance data import](#finance-data-import-mcp): [MCP-10](#mcp-10-import-a-natwest-bank-statement-into-diya-gl-lines) Import a NatWest bank statement into diya-gl lines · [MCP-11](#mcp-11-seed-a-book-from-a-workbook-set) Seed a book from a workbook set · [MCP-12](#mcp-12-read-invoices-from-the-local-mail-index) Read invoices from the local mail index · [MCP-13](#mcp-13-import-stripe-transaction-and-payout-lines) Import Stripe transaction and payout lines
- [Documentation and disclaimer](#documentation-and-disclaimer-mcp): [MCP-14](#mcp-14-document-the-submission-mcps-plan-and-tool-reference) Document the submission MCP's plan and tool reference · [MCP-15](#mcp-15-disclaim-an-mcp-server-on-the-marketing-site) Disclaim an MCP server on the marketing site
<!-- /generated:area MCP -->

### Server and CLI (MCP)

<!-- generated:group server-and-cli-mcp -->
- [MCP-01](#mcp-01-expose-the-submission-mcp-server-and-tools) Expose the submission MCP server and tools
- [MCP-02](#mcp-02-authenticate-mcp-sessions-via-cognito) Authenticate MCP sessions via Cognito
<!-- /generated:group server-and-cli-mcp -->

#### MCP-01 Expose the submission MCP server and tools

- **Use when:** a session needs the submission MCP's tool set, over stdio or one call across every practice client.
- **Does:** createServer in mcp/lib/server.js builds an McpServer and registers every tool in its TOOLS table. mcp/bin/diya-submit-mcp.js connects that server to stdio, or runs one tool for every practice client with --all-clients.
- **Run:** `node mcp/bin/diya-submit-mcp.js`; `node mcp/bin/diya-submit-mcp.js --all-clients <tool> [--arg key=value ...]`; `npm --prefix mcp start`
- **Entry:** `mcp/lib/server.js:createServer`; `mcp/bin/diya-submit-mcp.js`
- **Files:** mcp/lib/server.js, mcp/bin/diya-submit-mcp.js, mcp/vitest.config.js
- **Keywords:** mcp server, mcp tools, stdio, model context protocol, diya-submit-mcp, all-clients, tool registry
- **Related:** MCP-02, MCP-09

#### MCP-02 Authenticate MCP sessions via Cognito

- **Use when:** the MCP's own tools (cloud book open/save) need a signed-in DIY Accounting Submit session.
- **Does:** signIn in mcp/lib/auth.js opens the Cognito hosted UI and catches the redirect on a loopback listener, ports 49152 to 49159. It exchanges the code at the token endpoint and caches the refresh and id tokens under ~/.config/diya-submit/credentials.json, mode 600. accessToken refreshes the cached id token silently once it nears expiry.
- **Run:** no command; see Does and Entry
- **Entry:** `mcp/lib/auth.js:signIn`; `mcp/lib/auth.js:accessToken`
- **Files:** mcp/lib/auth.js, mcp/test/auth.test.js
- **Keywords:** mcp auth, cognito, pkce, oauth, loopback, credentials.json, sign in, access token
- **Related:** MCP-01, MCP-03

### Book and derivation tools (MCP)

<!-- generated:group book-and-derivation-tools-mcp -->
- [MCP-03](#mcp-03-load-and-save-diya-gl-books-via-mcp) Load and save diya-gl books via MCP
- [MCP-04](#mcp-04-derive-micro-entity-accounts-figures-for-companies-house-filing) Derive micro-entity accounts figures for Companies House filing
- [MCP-05](#mcp-05-derive-vat-figures-via-mcp-tools) Derive VAT figures via MCP tools
- [MCP-06](#mcp-06-derive-itsa-quarterly-and-annual-submission-figures) Derive ITSA quarterly and annual submission figures
<!-- /generated:group book-and-derivation-tools-mcp -->

#### MCP-03 Load and save diya-gl books via MCP

- **Use when:** an MCP session needs to open or save a diya-gl book, locally or in the cloud.
- **Does:** The two open_book and save_book tools in mcp/lib/book-tools.js back this server's session. open_book reads a book.toml plus lines.jsonl directory, any file the engine reads, or a cloud book. save_book writes the session's book in one of five formats, locally or to the cloud.
- **Run:** no command; see Does and Entry
- **Entry:** `mcp/lib/book-tools.js:openBook`; `mcp/lib/book-tools.js:saveBook`; `mcp/lib/book-tools.js:createSession`
- **Files:** mcp/lib/book-tools.js, mcp/test/book-tools.test.js, mcp/test/fixtures/brickwork-pro-ltd-vat/book.toml, mcp/test/fixtures/precision-code-ltd-full/book.toml
- **Keywords:** open_book, save_book, diya-gl, book.toml, lines.jsonl, cloud book, mcp book tools, xlsx export
- **Related:** MCP-02, MCP-04, MCP-05, MCP-06

#### MCP-04 Derive micro-entity accounts figures for Companies House filing

- **Use when:** a Company (ltd) book's FRS 105 balance-sheet lines are needed before a Companies House accounts filing.
- **Does:** deriveMicroEntityAccounts in mcp/lib/accounts-tools.js reads the current year from the engine's published balance sheet, PubBalSht. It reads the prior year from the book's opening balance. It checks each sheet balances before rounding both years to whole pounds.
- **Run:** no command; see Does and Entry
- **Entry:** `mcp/lib/accounts-tools.js:deriveMicroEntityAccounts`
- **Files:** mcp/lib/accounts-tools.js, mcp/test/accounts-tools.test.js
- **Keywords:** derive_micro_entity_accounts, frs 105, balance sheet, companies house, micro-entity, pubbalsht, accounts filing
- **Related:** MCP-03, MCP-08

#### MCP-05 Derive VAT figures via MCP tools

- **Use when:** a VAT return's nine HMRC boxes must be computed from a loaded book before filing or review.
- **Does:** deriveVatReturn in mcp/lib/vat-tools.js reads the engine's Vatreturns.xlsx Vatinterface sheet for one obligation quarter. It cross-checks the sheet totals against the sales and purchases journal lines and throws on disagreement. It returns every line behind boxes 1, 4, 6 and 7.
- **Run:** no command; see Does and Entry
- **Entry:** `mcp/lib/vat-tools.js:deriveVatReturn`; `mcp/lib/vat-tools.js:interfaceRows`
- **Files:** mcp/lib/vat-tools.js, mcp/test/vat-tools.test.js
- **Keywords:** derive_vat_return, vat boxes, vatinterface, hmrc vat, vat return, reconcile, mtd vat
- **Related:** MCP-03, MCP-07

#### MCP-06 Derive ITSA quarterly and annual submission figures

- **Use when:** a self-employed book's quarterly update or annual submission figures are needed for HMRC's Self Employment Business API.
- **Does:** deriveItsaQuarterlyUpdate and deriveItsaAnnualSubmission in mcp/lib/itsa-tools.js call the diya-gl package's se-derivations module. registerItsaTools registers both against an MCP server and session. Each answer is restricted to the field set sa103-mtd-mapping.json allows for that tax year, omitting fields the book cannot source.
- **Run:** no command; see Does and Entry
- **Entry:** `mcp/lib/itsa-tools.js:deriveItsaQuarterlyUpdate`; `mcp/lib/itsa-tools.js:deriveItsaAnnualSubmission`; `mcp/lib/itsa-tools.js:registerItsaTools`
- **Files:** mcp/lib/itsa-tools.js, mcp/test/itsa-tools.test.js, mcp/test/fixtures/brickwork-pro-se-vat/book.toml
- **Keywords:** itsa, self employment business api, quarterly update, annual submission, se-derivations, sa103, mtd it
- **Related:** MCP-03

### Filing and practice tools (MCP)

<!-- generated:group filing-and-practice-tools-mcp -->
- [MCP-07](#mcp-07-file-vat-returns-and-accounts-via-api) File VAT returns and accounts via API
- [MCP-08](#mcp-08-manage-practice-clients-and-hmrc-agent-authorisation) Manage practice clients and HMRC agent authorisation
- [MCP-09](#mcp-09-run-a-client-scoped-tool-across-every-practice-client) Run a client-scoped tool across every practice client
<!-- /generated:group filing-and-practice-tools-mcp -->

#### MCP-07 File VAT returns and accounts via API

- **Use when:** confirmed VAT or accounts figures must be filed, fetched or polled against the deployed API.
- **Does:** callSubmitApi in mcp/lib/submit-tools.js is the shared HTTP layer behind list_vat_obligations, submit_vat_return, get_vat_receipt, preview_micro_entity_accounts, submit_micro_entity_accounts and poll_accounts_submission. It carries the session bearer token, the HMRC and custom-authoriser headers, and polls a 202 response to a terminal status.
- **Run:** no command; see Does and Entry
- **Entry:** `mcp/lib/submit-tools.js:callSubmitApi`; `mcp/lib/submit-tools.js:submitVatReturn`; `mcp/lib/submit-tools.js:submitMicroEntityAccounts`
- **Files:** mcp/lib/submit-tools.js, mcp/test/submit-tools.test.js
- **Keywords:** submit_vat_return, list_vat_obligations, get_vat_receipt, companies house accounts, callSubmitApi, 202 poll, hmrc access token
- **Related:** MCP-05, MCP-04, MCP-08

#### MCP-08 Manage practice clients and HMRC agent authorisation

- **Use when:** a practice's client list must be read or grown, or an HMRC Agent Authorisation invitation sent or checked.
- **Does:** mcp/lib/practice-tools.js implements listClients and addClient for the client list. inviteClient and clientAuthorisationStatus drive the HMRC Agent Authorisation flow, and moveBookToClient moves a book to a client's book set. All but moveBookToClient share submit-tools.js's callSubmitApi.
- **Run:** no command; see Does and Entry
- **Entry:** `mcp/lib/practice-tools.js:listClients`; `mcp/lib/practice-tools.js:inviteClient`; `mcp/lib/practice-tools.js:moveBookToClient`
- **Files:** mcp/lib/practice-tools.js, mcp/test/practice-tools.test.js
- **Keywords:** list_clients, add_client, invite_client, client_authorisation_status, move_book_to_client, agent authorisation, practice clients
- **Related:** MCP-07, MCP-09

#### MCP-09 Run a client-scoped tool across every practice client

- **Use when:** one submission or book tool must run once per client in a practice's list.
- **Does:** runForClients in mcp/lib/batch-tools.js runs one allow-listed, client-scoped tool for every client in the practice's list. It merges each client's id into the call arguments and records each client's result or error in its own row. It backs the run_for_clients tool and the CLI's --all-clients mode.
- **Run:** `node mcp/bin/diya-submit-mcp.js --all-clients <tool> [--arg key=value ...]`
- **Entry:** `mcp/lib/batch-tools.js:runForClients`
- **Files:** mcp/lib/batch-tools.js, mcp/test/batch-tools.test.js
- **Keywords:** run_for_clients, batch tools, all-clients, per-client loop, practice batch run
- **Related:** MCP-01, MCP-08

### Finance data import (MCP)

<!-- generated:group finance-data-import-mcp -->
- [MCP-10](#mcp-10-import-a-natwest-bank-statement-into-diya-gl-lines) Import a NatWest bank statement into diya-gl lines
- [MCP-11](#mcp-11-seed-a-book-from-a-workbook-set) Seed a book from a workbook set
- [MCP-12](#mcp-12-read-invoices-from-the-local-mail-index) Read invoices from the local mail index
- [MCP-13](#mcp-13-import-stripe-transaction-and-payout-lines) Import Stripe transaction and payout lines
<!-- /generated:group finance-data-import-mcp -->

#### MCP-10 Import a NatWest bank statement into diya-gl lines

- **Use when:** a NatWest current-account CSV export must become validated diya-gl bank lines for a book.
- **Does:** bankLinesFromCsv in mcp/lib/finance/bank-lines.js parses a NatWest CSV export into one validated line per transaction, with no filtering or netting. closingBalance reads the statement's closing balance. Direction is set in diya-gl:bankCode from the sign of the statement's Value column.
- **Run:** no command; see Does and Entry
- **Entry:** `mcp/lib/finance/bank-lines.js:bankLinesFromCsv`; `mcp/lib/finance/bank-lines.js:closingBalance`
- **Files:** mcp/lib/finance/bank-lines.js, mcp/test/bank-lines.test.js
- **Keywords:** natwest csv, bank statement import, diya-gl bank lines, bankcode, reconciliation, finance import
- **Related:** MCP-11, MCP-12

#### MCP-11 Seed a book from a workbook set

- **Use when:** a finished trading year's Company package workbooks must seed a new book.toml for the following year.
- **Does:** bookFromWorkbookSet in mcp/lib/finance/book-from-workbook.js reads a complete Company package through the diya-gl engine's own extractors. The package is Financialaccounts.xlsx, Fixedassets.xlsx, Companysecretary.xlsx and the Sales, Purchases and bank workbooks. It validates the result against the published v2 book schema.
- **Run:** no command; see Does and Entry
- **Entry:** `mcp/lib/finance/book-from-workbook.js:bookFromWorkbookSet`; `mcp/lib/finance/book-from-workbook.js:toToml`
- **Files:** mcp/lib/finance/book-from-workbook.js, mcp/test/book-from-workbook.test.js
- **Keywords:** book from workbook, seed book.toml, company package, workbook set, opening balances, fixed asset register, book schema
- **Related:** MCP-03, MCP-10

#### MCP-12 Read invoices from the local mail index

- **Use when:** supplier invoice emails must become staged diya-gl purchases lines without a live Gmail call.
- **Does:** invoiceLinesForPeriod in mcp/lib/finance/mail-invoices.js shells out to the corpus CLI, searching mail-antony for each supplier within a date range. It fetches each hit's extracted text and extracts a total amount and currency. Each recognisable hit becomes one purchases invoice line.
- **Run:** no command; see Does and Entry
- **Entry:** `mcp/lib/finance/mail-invoices.js:invoiceLinesForPeriod`; `mcp/lib/finance/mail-invoices.js:runCorpus`
- **Files:** mcp/lib/finance/mail-invoices.js, mcp/test/mail-invoices.test.js
- **Keywords:** supplier invoices, corpus cli, mail-antony, invoice import, purchases lines, mail index search
- **Related:** MCP-10, MCP-11

#### MCP-13 Import Stripe transaction and payout lines

- **Use when:** staged Stripe balance transactions and payouts must become validated diya-gl sales, purchases and bank lines.
- **Does:** stripeLinesFromTransactions in mcp/lib/finance/stripe-lines.js posts a charge's gross to sales, its fee to purchases, and refunds as credit notes. stripePayoutLines posts each payout as a bank line dated to its arrival date. reconcileStripeMonth checks a staged month's charges, fees, refunds and payouts balance.
- **Run:** no command; see Does and Entry
- **Entry:** `mcp/lib/finance/stripe-lines.js:stripeLinesFromTransactions`; `mcp/lib/finance/stripe-lines.js:stripePayoutLines`; `mcp/lib/finance/stripe-lines.js:reconcileStripeMonth`
- **Files:** mcp/lib/finance/stripe-lines.js, mcp/test/stripe-lines.test.js
- **Keywords:** stripe import, balance transactions, payouts, diya-gl lines, reconcile stripe, sales fee split
- **Related:** MCP-10, MCP-12

### Documentation and disclaimer (MCP)

<!-- generated:group documentation-and-disclaimer-mcp -->
- [MCP-14](#mcp-14-document-the-submission-mcps-plan-and-tool-reference) Document the submission MCP's plan and tool reference
- [MCP-15](#mcp-15-disclaim-an-mcp-server-on-the-marketing-site) Disclaim an MCP server on the marketing site
<!-- /generated:group documentation-and-disclaimer-mcp -->

#### MCP-14 Document the submission MCP's plan and tool reference

- **Use when:** starting work on the submission MCP: what is built, planned, and how to run it.
- **Does:** PLAN_SUBMISSION_MCP.md is the plan of record for the submission MCP: milestones, book-to-filing field mappings and open rows. mcp/README.md is the package's short reference: how to run it, test it, and its tools at time of writing.
- **Run:** `npm --prefix mcp install`; `npm --prefix mcp test`
- **Entry:** `PLAN_SUBMISSION_MCP.md`; `mcp/README.md`
- **Files:** PLAN_SUBMISSION_MCP.md, mcp/README.md
- **Keywords:** plan submission mcp, mcp readme, milestones, field mappings, plan of record
- **Related:** MCP-01

#### MCP-15 Disclaim an MCP server on the marketing site

- **Use when:** checking or editing the public claim that DIY Accounting Submit has no MCP server.
- **Does:** web/public/mcp.html is a static page on the public site that explains what MCP is in general terms. It states DIY Accounting Submit has no MCP server and points visitors elsewhere. It is not wired to the mcp/ package the other capabilities here describe.
- **Run:** no command; see Does and Entry
- **Entry:** `web/public/mcp.html`
- **Files:** web/public/mcp.html
- **Keywords:** mcp.html, marketing page, mcp disclaimer, public site, no mcp server claim

## Developer workflow (DEV)

<!-- generated:area DEV -->
- [Simulator server & OAuth mocks](#simulator-server--oauth-mocks-dev): [DEV-01](#dev-01-run-the-http-simulator-server) Run the HTTP simulator server · [DEV-02](#dev-02-simulate-local-app-oauth) Simulate local app OAuth · [DEV-03](#dev-03-simulate-hmrc-oauth) Simulate HMRC OAuth · [DEV-04](#dev-04-simulate-companies-house-identity-and-filing) Simulate Companies House identity and filing · [DEV-05](#dev-05-simulate-hmrc-agent-authorisation-and-fraud-prevention-headers) Simulate HMRC Agent Authorisation and fraud-prevention headers · [DEV-06](#dev-06-simulate-hmrc-test-user-provisioning-and-api-docs) Simulate HMRC test-user provisioning and API docs · [DEV-07](#dev-07-simulate-the-public-demos-billing-and-oauth) Simulate the public demo's billing and OAuth
- [Simulator tax APIs](#simulator-tax-apis-dev): [DEV-08](#dev-08-simulate-hmrc-vat-mtd-api) Simulate HMRC VAT MTD API · [DEV-09](#dev-09-simulate-hmrc-itsa-mtd-api) Simulate HMRC ITSA MTD API
- [Public demo simulator deployment & practice UI](#public-demo-simulator-deployment--practice-ui-dev): [DEV-10](#dev-10-deploy-the-public-demo-simulator) Deploy the public demo simulator · [DEV-11](#dev-11-practice-the-vat-journey-in-the-browser-embedded-simulator) Practice the VAT journey in the browser-embedded simulator · [DEV-12](#dev-12-prove-the-client-status-stack-and-fetchauth) Prove the client status-stack and fetch/auth · [DEV-13](#dev-13-generate-the-openapi-spec-from-cdk-route-definitions) Generate the OpenAPI spec from CDK route definitions
- [Local dev environment & secrets](#local-dev-environment--secrets-dev): [DEV-14](#dev-14-start-the-proxy-and-simulator-local-dev-environments) Start the proxy and simulator local dev environments · [DEV-15](#dev-15-fetch-and-publish-proxy-variant-secrets) Fetch and publish proxy-variant secrets · [DEV-16](#dev-16-manage-the-durable-cognito-test-user-lifecycle) Manage the durable Cognito test-user lifecycle
- [Test fixtures, reports & DynamoDB export](#test-fixtures-reports--dynamodb-export-dev): [DEV-17](#dev-17-export-and-embed-dynamodb-test-state-in-reports) Export and embed DynamoDB test state in reports · [DEV-18](#dev-18-provide-shared-unitsystem-test-fixtures) Provide shared unit/system-test fixtures · [DEV-19](#dev-19-provide-shared-behaviour-test-fixtures-and-steps) Provide shared behaviour-test fixtures and steps · [DEV-20](#dev-20-check-spdx-licence-headers) Check SPDX licence headers · [DEV-21](#dev-21-verify-module-wiring-and-repository-shape) Verify module wiring and repository shape
- [Build hygiene, toolchain & docs](#build-hygiene-toolchain--docs-dev): [DEV-22](#dev-22-clean-and-update-local-build-state) Clean and update local build state · [DEV-23](#dev-23-configure-the-test-and-lint-toolchains) Configure the test and lint toolchains · [DEV-24](#dev-24-document-developer-setup-and-repository-conventions) Document developer setup and repository conventions · [DEV-25](#dev-25-maintain-the-specialist-agent-prompt-library) Maintain the specialist agent prompt library · [DEV-26](#dev-26-enforce-claude-code-conventions-via-rules-and-hooks) Enforce Claude Code conventions via rules and hooks
- [Claude Code delivery-cycle skills](#claude-code-delivery-cycle-skills-dev): [DEV-27](#dev-27-render-the-open-work-board) Render the open-work board · [DEV-28](#dev-28-work-nextmd-as-dispatched-sub-agents) Work NEXT.md as dispatched sub-agents · [DEV-29](#dev-29-refine-nextmd-before-a-wave) Refine NEXT.md before a wave · [DEV-30](#dev-30-run-the-delivery-cycle-unattended) Run the delivery cycle unattended · [DEV-31](#dev-31-watch-github-ci-to-green) Watch GitHub CI to green · [DEV-32](#dev-32-merge-every-pr-that-is-ready) Merge every PR that is ready · [DEV-33](#dev-33-preview-what-auto-merge-would-do) Preview what auto-merge would do · [DEV-34](#dev-34-clean-up-stale-deployments-and-branches) Clean up stale deployments and branches · [DEV-35](#dev-35-cool-down-an-overloaded-batch) Cool down an overloaded batch · [DEV-36](#dev-36-resume-normal-work-from-cool-down) Resume normal work from cool-down · [DEV-37](#dev-37-write-the-session-report) Write the session report · [DEV-38](#dev-38-write-plain-human-prose) Write plain, human prose · [DEV-39](#dev-39-sync-stripe-products-and-prices-from-the-catalogue) Sync Stripe products and prices from the catalogue · [DEV-40](#dev-40-record-a-product-demo-video) Record a product demo video · [DEV-41](#dev-41-publish-videos-to-the-youtube-channel) Publish videos to the YouTube channel · [DEV-42](#dev-42-look-up-a-vat-submission-failure-alarms-customer) Look up a VAT submission-failure alarm's customer · [DEV-43](#dev-43-find-existing-tooling-before-building-any) Find existing tooling before building any
<!-- /generated:area DEV -->

### Simulator server & OAuth mocks (DEV)

<!-- generated:group simulator-server--oauth-mocks-dev -->
- [DEV-01](#dev-01-run-the-http-simulator-server) Run the HTTP simulator server
- [DEV-02](#dev-02-simulate-local-app-oauth) Simulate local app OAuth
- [DEV-03](#dev-03-simulate-hmrc-oauth) Simulate HMRC OAuth
- [DEV-04](#dev-04-simulate-companies-house-identity-and-filing) Simulate Companies House identity and filing
- [DEV-05](#dev-05-simulate-hmrc-agent-authorisation-and-fraud-prevention-headers) Simulate HMRC Agent Authorisation and fraud-prevention headers
- [DEV-06](#dev-06-simulate-hmrc-test-user-provisioning-and-api-docs) Simulate HMRC test-user provisioning and API docs
- [DEV-07](#dev-07-simulate-the-public-demos-billing-and-oauth) Simulate the public demo's billing and OAuth
<!-- /generated:group simulator-server--oauth-mocks-dev -->

#### DEV-01 Run the HTTP simulator server

- **Use when:** local or CI tests need HMRC, Companies House or Stripe endpoints without real calls.
- **Does:** startSimulator starts an Express app and registers every simulator route in a fixed order. createApp answers a health check at GET /health. A shared in-memory store holds submitted returns, authorization codes and tokens, and resets between tests.
- **Run:** `import { startSimulator } from "app/http-simulator/index.js"`; `node app/bin/simulator-server.js`
- **Entry:** `app/http-simulator/index.js:startSimulator`; `app/http-simulator/server.js:createApp`; `app/bin/simulator-server.js`
- **Files:** app/http-simulator/index.js, app/http-simulator/server.js, app/http-simulator/state/store.js, app/bin/simulator-server.js, app/system-tests/hmrcSimulator.system.test.js, app/system-tests/runLocalHttpServer.system.test.js, app/system-tests/runLocalOAuth2Server.system.test.js, app/system-tests/runLocalDynamoDb.system.test.js
- **Keywords:** http simulator, mock server, express, local server, in-memory store, fixtures, sandbox, system test
- **Related:** DEV-02, DEV-03, DEV-14

#### DEV-02 Simulate local app OAuth

- **Use when:** the proxy variant needs a login flow without the Docker mock-oauth2-server.
- **Does:** apiEndpoint registers an interactive login form at GET /oauth/authorize for client_id=debugger. POST /default/token issues unsigned JWTs. The route also serves a debugger page and an OpenID discovery document.
- **Run:** `import { apiEndpoint } from "app/http-simulator/routes/local-oauth.js"`
- **Entry:** `app/http-simulator/routes/local-oauth.js:apiEndpoint`
- **Files:** app/http-simulator/routes/local-oauth.js
- **Keywords:** oauth, local login, debugger client, unsigned jwt, openid discovery, mock-oauth2-server replacement
- **Related:** DEV-01, DEV-14

#### DEV-03 Simulate HMRC OAuth

- **Use when:** a test needs HMRC's sign-in and grant-permission flow without a real HMRC account.
- **Does:** apiEndpoint reproduces HMRC's four-step grant flow at GET and POST /oauth/authorize. The steps are the permission page, sign-in choice, credentials form and grant step. It also runs an auto-grant shortcut for tests and issues mock tokens at POST /oauth/token.
- **Run:** `import { apiEndpoint } from "app/http-simulator/routes/hmrc-oauth.js"`
- **Entry:** `app/http-simulator/routes/hmrc-oauth.js:apiEndpoint`
- **Files:** app/http-simulator/routes/hmrc-oauth.js
- **Keywords:** hmrc oauth, grant flow, mock token, authorization_code, refresh_token, client_credentials, sandbox login
- **Related:** DEV-01, DEV-08, DEV-09

#### DEV-04 Simulate Companies House identity and filing

- **Use when:** a test needs Companies House sign-in, company lookup or accounts filing without the real API.
- **Does:** apiEndpoint in companies-house-oauth.js answers the sign-in-and-permission screen at /oauth2/authorise and /oauth2/token. apiEndpoint in companies-house.js serves the API-key read endpoints and the OAuth-authorised transaction lifecycle. apiEndpoint in companies-house-xmlgw.js answers the XML Gateway's single POST /v1-0/xmlgw/Gateway endpoint for Accounts submissions and status polls.
- **Run:** `import { apiEndpoint } from "app/http-simulator/routes/companies-house-oauth.js"`; `import { apiEndpoint } from "app/http-simulator/routes/companies-house.js"`; `import { apiEndpoint } from "app/http-simulator/routes/companies-house-xmlgw.js"`
- **Entry:** `app/http-simulator/routes/companies-house-oauth.js:apiEndpoint`; `app/http-simulator/routes/companies-house.js:apiEndpoint`; `app/http-simulator/routes/companies-house-xmlgw.js:apiEndpoint`
- **Files:** app/http-simulator/routes/companies-house-oauth.js, app/http-simulator/routes/companies-house.js, app/http-simulator/routes/companies-house-xmlgw.js, app/http-simulator/scenarios/companies.js, app/http-simulator/scenarios/accounts-filing.js, app/http-simulator/scenarios/business-details.js, app/http-simulator/scenarios/filings.js, app/unit-tests/http-simulator/scenarios/accounts-filing.test.js
- **Keywords:** companies house, xml gateway, govtalk, accounts filing, registered office, registered email, transaction lifecycle, company search
- **Related:** DEV-01, DEV-03

#### DEV-05 Simulate HMRC Agent Authorisation and fraud-prevention headers

- **Use when:** a test needs an agent-client invitation flow or must check Gov-Client/Gov-Vendor headers.
- **Does:** apiEndpoint in agent-authorisation.js implements POST /agents/{arn}/invitations, GET and DELETE .../invitations/{id}, and GET /agents/{arn}/relationships, tracking invitation status in memory. apiEndpoint in fraud-headers.js answers GET /test/fraud-prevention-headers/validate, returning VALID, VALID_WITH_WARNINGS or INVALID.
- **Run:** `import { apiEndpoint } from "app/http-simulator/routes/agent-authorisation.js"`; `import { apiEndpoint } from "app/http-simulator/routes/fraud-headers.js"`
- **Entry:** `app/http-simulator/routes/agent-authorisation.js:apiEndpoint`; `app/http-simulator/routes/fraud-headers.js:apiEndpoint`
- **Files:** app/http-simulator/routes/agent-authorisation.js, app/http-simulator/routes/fraud-headers.js
- **Keywords:** agent authorisation, invitation, client relationship, fraud prevention headers, gov-client, gov-vendor, header validation
- **Related:** DEV-03

#### DEV-06 Simulate HMRC test-user provisioning and API docs

- **Use when:** a test needs a fresh HMRC sandbox-style test user, or a session needs the simulator's own API docs.
- **Does:** apiEndpoint in test-user.js answers POST /create-test-user/organisations with a random VRN, user ID, password and group identifier. It adds a NINO when the service is mtd-income-tax. apiEndpoint in openapi.js serves an index page, the raw OpenAPI specs, and a Swagger UI at /docs/{spec}.
- **Run:** `import { apiEndpoint } from "app/http-simulator/routes/test-user.js"`; `import { apiEndpoint } from "app/http-simulator/routes/openapi.js"`
- **Entry:** `app/http-simulator/routes/test-user.js:apiEndpoint`; `app/http-simulator/routes/openapi.js:apiEndpoint`
- **Files:** app/http-simulator/routes/test-user.js, app/http-simulator/routes/openapi.js
- **Keywords:** test user, create-test-user, vrn, nino, openapi spec, swagger ui, api docs
- **Related:** DEV-01, DEV-13

#### DEV-07 Simulate the public demo's billing and OAuth

- **Use when:** the public demo app needs a mock OAuth authorize URL, a mock token exchange, or fake Stripe billing.
- **Does:** mockAuthUrlGet.js builds a mock OAuth authorize URL at GET /api/v1/mock/authUrl. mockTokenPost.js proxies POST /api/v1/mock/token to the mock server's token endpoint to avoid browser CORS and PNA restrictions. mockBilling.js fakes Stripe checkout, checkout-session lookup and the billing portal, auto-granting a bundle when Stripe is unconfigured.
- **Run:** `import { apiEndpoint, ingestHandler } from "app/functions/non-lambda-mocks/mockAuthUrlGet.js"`; `import { apiEndpoint } from "app/functions/non-lambda-mocks/mockTokenPost.js"`; `import { apiEndpoint } from "app/functions/non-lambda-mocks/mockBilling.js"`
- **Entry:** `app/functions/non-lambda-mocks/mockAuthUrlGet.js:ingestHandler`; `app/functions/non-lambda-mocks/mockTokenPost.js:apiEndpoint`; `app/functions/non-lambda-mocks/mockBilling.js:apiEndpoint`
- **Files:** app/functions/non-lambda-mocks/mockAuthUrlGet.js, app/functions/non-lambda-mocks/mockTokenPost.js, app/functions/non-lambda-mocks/mockBilling.js
- **Keywords:** public demo, mock billing, mock stripe, mock oauth, cors, pna, bundle auto-grant, non-lambda mocks
- **Related:** DEV-10, DEV-11

### Simulator tax APIs (DEV)

<!-- generated:group simulator-tax-apis-dev -->
- [DEV-08](#dev-08-simulate-hmrc-vat-mtd-api) Simulate HMRC VAT MTD API
- [DEV-09](#dev-09-simulate-hmrc-itsa-mtd-api) Simulate HMRC ITSA MTD API
<!-- /generated:group simulator-tax-apis-dev -->

#### DEV-08 Simulate HMRC VAT MTD API

- **Use when:** a test needs VAT returns, obligations, liabilities, payments or penalties without a real HMRC call.
- **Does:** apiEndpoint in vat-returns.js handles POST and GET /organisations/vat/{vrn}/returns. It validates the 9-box body with validateVatReturnBody, then stores the return and returns a mock receipt. Companion route files answer VAT obligations, liabilities, payments and penalties, each keyed by the Gov-Test-Scenario header.
- **Run:** `import { apiEndpoint } from "app/http-simulator/routes/vat-returns.js"`; `import { apiEndpoint } from "app/http-simulator/routes/vat-obligations.js"`
- **Entry:** `app/http-simulator/routes/vat-returns.js:apiEndpoint`; `app/http-simulator/routes/vat-obligations.js:apiEndpoint`
- **Files:** app/http-simulator/routes/vat-returns.js, app/http-simulator/routes/vat-obligations.js, app/http-simulator/routes/vat-liabilities.js, app/http-simulator/routes/vat-payments.js, app/http-simulator/routes/vat-penalties.js, app/http-simulator/scenarios/returns.js, app/http-simulator/scenarios/obligations.js, app/http-simulator/scenarios/liabilities.js, app/http-simulator/scenarios/payments.js, app/http-simulator/scenarios/penalties.js, app/unit-tests/http-simulator/scenarios/liabilities.test.js, app/unit-tests/http-simulator/scenarios/obligations.test.js, app/unit-tests/http-simulator/scenarios/payments.test.js, app/unit-tests/http-simulator/scenarios/penalties.test.js
- **Keywords:** vat mtd, vat return, 9-box, gov-test-scenario, obligations, liabilities, payments, penalties, form bundle number, charge reference
- **Related:** DEV-01, DEV-03

#### DEV-09 Simulate HMRC ITSA MTD API

- **Use when:** a test needs Making Tax Digital for Income Tax Self Assessment endpoints without a real HMRC call.
- **Does:** Eighteen route files under app/http-simulator/routes/itsa-*.js answer the ITSA endpoints. They cover business details, obligations, self-employment and UK property periods, crystallisation, status, BSAS, calculations, losses, claims and tax-liability adjustments. Each has a matching scenario module, keyed by the Gov-Test-Scenario header, registered in server.js.
- **Run:** `import { apiEndpoint } from "app/http-simulator/routes/itsa-business-details.js"`
- **Entry:** `app/http-simulator/routes/itsa-business-details.js:apiEndpoint`; `app/http-simulator/server.js:createApp`
- **Files:** app/http-simulator/routes/itsa-business-details.js, app/http-simulator/routes/itsa-obligations.js, app/http-simulator/routes/itsa-self-employment-period.js, app/http-simulator/routes/itsa-self-employment-periods.js, app/http-simulator/routes/itsa-self-employment-period-detail.js, app/http-simulator/routes/itsa-self-employment-cumulative.js, app/http-simulator/routes/itsa-self-employment-annual.js, app/http-simulator/routes/itsa-uk-property-period.js, app/http-simulator/routes/itsa-uk-property-period-detail.js, app/http-simulator/routes/itsa-uk-property-cumulative.js, app/http-simulator/routes/itsa-uk-property-periods.js, app/http-simulator/routes/itsa-uk-property-annual.js, app/http-simulator/routes/itsa-crystallisation-obligations.js, app/http-simulator/routes/itsa-status.js, app/http-simulator/routes/itsa-bsas.js, app/http-simulator/routes/itsa-calculations.js, app/http-simulator/routes/itsa-losses-and-claims.js, app/http-simulator/routes/itsa-tax-liability-adjustments.js, app/http-simulator/scenarios/itsa-obligations.js, app/http-simulator/scenarios/itsa-self-employment-period.js, app/http-simulator/scenarios/itsa-self-employment-periods.js, app/http-simulator/scenarios/itsa-self-employment-period-detail.js, app/http-simulator/scenarios/itsa-self-employment-cumulative.js, app/http-simulator/scenarios/itsa-self-employment-annual.js, app/http-simulator/scenarios/itsa-uk-property-period.js, app/http-simulator/scenarios/itsa-uk-property-period-detail.js, app/http-simulator/scenarios/itsa-uk-property-cumulative.js, app/http-simulator/scenarios/itsa-uk-property-periods.js, app/http-simulator/scenarios/itsa-uk-property-annual.js, app/http-simulator/scenarios/itsa-crystallisation-obligations.js, app/http-simulator/scenarios/itsa-status.js, app/http-simulator/scenarios/itsa-bsas.js, app/http-simulator/scenarios/itsa-calculations.js, app/http-simulator/scenarios/itsa-losses-and-claims.js, app/http-simulator/scenarios/itsa-tax-liability-adjustments.js
- **Keywords:** itsa, making tax digital, self assessment, self-employment, uk property, bsas, crystallisation, losses and claims, tax liability adjustments
- **Related:** DEV-01, DEV-08

### Public demo simulator deployment & practice UI (DEV)

<!-- generated:group public-demo-simulator-deployment--practice-ui-dev -->
- [DEV-10](#dev-10-deploy-the-public-demo-simulator) Deploy the public demo simulator
- [DEV-11](#dev-11-practice-the-vat-journey-in-the-browser-embedded-simulator) Practice the VAT journey in the browser-embedded simulator
- [DEV-12](#dev-12-prove-the-client-status-stack-and-fetchauth) Prove the client status-stack and fetch/auth
- [DEV-13](#dev-13-generate-the-openapi-spec-from-cdk-route-definitions) Generate the OpenAPI spec from CDK route definitions
<!-- /generated:group public-demo-simulator-deployment--practice-ui-dev -->

#### DEV-10 Deploy the public demo simulator

- **Use when:** the public read-only demo of the app needs deploying or its static build regenerating.
- **Does:** SimulatorStack deploys the demo as a Lambda behind a Function URL and CloudFront, with no production secrets, at {env}-simulator.submit.diyaccounting.co.uk. build-simulator.js copies web/public to web/public-simulator, adding a demo banner, noindex tags and a storage-namespace proxy. simulator-lambda-server.mjs is the dependency-free Node server that serves the built files and mock HMRC endpoints in that deployment.
- **Run:** `node scripts/build-simulator.js`; `node scripts/simulator-lambda-server.mjs`
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/SimulatorStack.java:SimulatorStack`; `scripts/build-simulator.js:buildSimulator`; `scripts/simulator-lambda-server.mjs:handleRequest`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/SimulatorStack.java, scripts/build-simulator.js, scripts/simulator-lambda-server.mjs
- **Keywords:** public demo, simulator deployment, lambda function url, cloudfront, web/public-simulator, storage namespace, demo banner, noindex
- **Related:** DEV-01, DEV-11

#### DEV-11 Practice the VAT journey in the browser-embedded simulator

- **Use when:** a demo or onboarding page needs a scripted, no-live-HMRC-calls VAT submission walkthrough.
- **Does:** simulator.html is the standalone practice interface for the VAT submission flow. The SimulatorJourney class drives scripted click-through demos, using simulator-bridge.js to relay postMessage commands across the iframe boundary. test-data-generator.js generates placeholder VRNs, NINOs and period keys for these demos.
- **Run:** `import { SimulatorJourney, journeySubmitVat, journeyViewObligations } from "web/public/widgets/simulator-journeys.js"`
- **Entry:** `web/public/simulator.html`; `web/public/widgets/simulator-journeys.js:SimulatorJourney`; `web/public/widgets/simulator-bridge.js`
- **Files:** web/public/simulator.html, web/public/widgets/simulator-bridge.js, web/public/widgets/simulator-journeys.js, web/public/lib/test-data-generator.js, web/unit-tests/test-data-generator.test.js
- **Keywords:** simulator practice, vat journey, iframe bridge, postmessage, scripted demo, test data generator, click-through
- **Related:** DEV-10, DEV-12

#### DEV-12 Prove the client status-stack and fetch/auth

- **Use when:** a change touches the status-stack state machine, core fetch/auth logic, or the simulator's iframe controls.
- **Does:** Playwright component and DOM tests exercise the status-stack state machine and the core fetch and auth logic. They also cover the test-data-link page and the simulator's iframe and journey controls. ITSA business-details and VAT-obligations page tests live with HMRC filing, not here.
- **Run:** `npx playwright test web/browser-tests/chromium.client.status-stack.test.js`; `npx playwright test web/browser-tests/chromium.client.test.js`; `npm run test:submitVatBehaviour-proxy -- --grep simulator`
- **Entry:** `web/browser-tests/chromium.client.status-stack.test.js`; `web/browser-tests/chromium.client.test.js`; `behaviour-tests/simulator.behaviour.test.js`
- **Files:** web/browser-tests/chromium.client.status-stack.test.js, web/browser-tests/chromium.client.test.js, web/browser-tests/test-data-link.browser.test.js, behaviour-tests/simulator.behaviour.test.js
- **Keywords:** status stack, browser test, client fetch, auth logic, test-data-link, simulator behaviour test, playwright component test
- **Related:** DEV-11, DEV-25

#### DEV-13 Generate the OpenAPI spec from CDK route definitions

- **Use when:** the API's OpenAPI document must reflect the real API Gateway routes without a hand-maintained list.
- **Does:** OpenApiGenerator introspects SubmitSharedNames to discover API Gateway routes, methods and paths from the CDK code. It emits an OpenAPI 3.0.3 document from that introspection.
- **Run:** no command; see Does and Entry
- **Entry:** `infra/main/java/co/uk/diyaccounting/submit/swagger/OpenApiGenerator.java:OpenApiGenerator`
- **Files:** infra/main/java/co/uk/diyaccounting/submit/swagger/OpenApiGenerator.java, infra/main/java/co/uk/diyaccounting/submit/swagger/CHANGES.md, infra/test/java/co/uk/diyaccounting/submit/swagger/OpenApiGeneratorTest.java
- **Keywords:** openapi generator, api gateway routes, cdk introspection, swagger spec, openapi 3.0.3, SubmitSharedNames
- **Related:** DEV-06

### Local dev environment & secrets (DEV)

<!-- generated:group local-dev-environment--secrets-dev -->
- [DEV-14](#dev-14-start-the-proxy-and-simulator-local-dev-environments) Start the proxy and simulator local dev environments
- [DEV-15](#dev-15-fetch-and-publish-proxy-variant-secrets) Fetch and publish proxy-variant secrets
- [DEV-16](#dev-16-manage-the-durable-cognito-test-user-lifecycle) Manage the durable Cognito test-user lifecycle
<!-- /generated:group local-dev-environment--secrets-dev -->

#### DEV-14 Start the proxy and simulator local dev environments

- **Use when:** starting local development against native HTTPS with Docker, or a Docker-free simulator variant.
- **Does:** start-proxy.sh starts dynalite, the Docker mock-oauth2-server and the web server on local.submit.diyaccounting.co.uk, and tears them down on exit. start-simulator.sh builds the simulator static files, then starts dynalite and the HTTP simulator on ephemeral ports with no Docker dependency. startDynamoDB ensures every DynamoDB table exists, and pick-free-port.js resolves a free port for concurrent runs.
- **Run:** `npm run start:proxy`; `npm run start:simulator`; `node scripts/static-server.mjs <root-dir>`; `node scripts/pick-free-port.js VAR_NAME -- command args`
- **Entry:** `scripts/start-proxy.sh`; `scripts/start-simulator.sh`; `app/bin/dynamodb.js:startDynamoDB`
- **Files:** scripts/start-proxy.sh, scripts/start-simulator.sh, app/bin/dynamodb.js, scripts/static-server.mjs, scripts/pick-free-port.js
- **Keywords:** local dev, proxy variant, dynalite, mock-oauth2-server, dynamodb tables, ephemeral port, accessibility scan, pa11y, lighthouse
- **Related:** DEV-01, DEV-02, DEV-15

#### DEV-15 Fetch and publish proxy-variant secrets

- **Use when:** a local proxy-variant run needs HMRC/Stripe secrets, or a renewed local TLS certificate needs publishing.
- **Does:** proxy-secrets.sh checks the AWS SSO session, then fetches the proxy variant's HMRC and Stripe secrets from Secrets Manager. It execs a given command with those secrets set in its environment. local-tls-publish.sh is a certbot deploy-hook that publishes a renewed local TLS certificate to Secrets Manager for CI.
- **Run:** `scripts/proxy-secrets.sh npm run test:submitVatBehaviour-proxy`; `scripts/local-tls-publish.sh`
- **Entry:** `scripts/proxy-secrets.sh`; `scripts/local-tls-publish.sh`
- **Files:** scripts/proxy-secrets.sh, scripts/local-tls-publish.sh
- **Keywords:** proxy secrets, secrets manager, hmrc secrets, stripe secrets, local tls, certbot deploy hook, certificate publish
- **Related:** DEV-14

#### DEV-16 Manage the durable Cognito test-user lifecycle

- **Use when:** a test lane needs a working Cognito login, native email/password auth toggled, or test users purged.
- **Does:** ensure-cognito-test-user.js creates and rotates the password, TOTP device and DynamoDB data for one test lane's durable Cognito user. toggle-cognito-native-auth.js switches native email/password sign-in on or off, and enable-cognito-native-test.js and disable-cognito-native-test.js wrap that toggle for local runs. cleanup-test-users.js purges test users' DynamoDB data and deletes the Cognito users, and create-hmrc-test-user.js provisions an HMRC Sandbox test user.
- **Run:** `node scripts/ensure-cognito-test-user.js <environment-name> <test-lane>`; `node scripts/toggle-cognito-native-auth.js <enable|disable> <environment-name> [--client app|diya-gl|both]`; `npm run test:enableCognitoNative`; `npm run test:disableCognitoNative`; `node scripts/cleanup-test-users.js <environment-name> [--confirm] [--json]`; `node scripts/create-hmrc-test-user.js`; `npm run test:totpCode`
- **Entry:** `scripts/ensure-cognito-test-user.js`; `scripts/toggle-cognito-native-auth.js`; `scripts/enable-cognito-native-test.js`; `scripts/disable-cognito-native-test.js`; `scripts/cleanup-test-users.js`; `scripts/create-hmrc-test-user.js`; `scripts/totp-code.js`
- **Files:** scripts/ensure-cognito-test-user.js, scripts/toggle-cognito-native-auth.js, scripts/enable-cognito-native-test.js, scripts/disable-cognito-native-test.js, scripts/cleanup-test-users.js, scripts/create-hmrc-test-user.js, scripts/totp-code.js, app/unit-tests/scripts/create-hmrc-test-user.test.js, app/unit-tests/scripts/ensure-cognito-test-user.test.js, app/unit-tests/scripts/toggle-cognito-native-auth.test.js
- **Keywords:** cognito, test user, totp, mfa, native auth, hosted ui, synthetic user, hmrc sandbox test user, durable user, supportedidentityproviders
- **Related:** DEV-14

### Test fixtures, reports & DynamoDB export (DEV)

<!-- generated:group test-fixtures-reports--dynamodb-export-dev -->
- [DEV-17](#dev-17-export-and-embed-dynamodb-test-state-in-reports) Export and embed DynamoDB test state in reports
- [DEV-18](#dev-18-provide-shared-unitsystem-test-fixtures) Provide shared unit/system-test fixtures
- [DEV-19](#dev-19-provide-shared-behaviour-test-fixtures-and-steps) Provide shared behaviour-test fixtures and steps
- [DEV-20](#dev-20-check-spdx-licence-headers) Check SPDX licence headers
- [DEV-21](#dev-21-verify-module-wiring-and-repository-shape) Verify module wiring and repository shape
<!-- /generated:group test-fixtures-reports--dynamodb-export-dev -->

#### DEV-17 Export and embed DynamoDB test state in reports

- **Use when:** a behaviour or system test run's DynamoDB state needs exporting, reporting or publishing for review.
- **Does:** export-dynamodb-for-test-users.js and export-test-dynamodb.sh export bundles, receipts and HMRC API records to JSON, per user or per test environment. generate-test-reports.js reads a behaviour run's testContext.json and hmrc-api-requests.jsonl files and writes a test report plus a reports index. inject-dynamodb-into-test-report.js embeds that export into the report HTML, and publish-web-test-local.sh copies the report into web/public/tests/.
- **Run:** `node scripts/export-dynamodb-for-test-users.js <deployment-name> <user-sub> [user-sub2 ...]`; `scripts/export-test-dynamodb.sh <deployment-name>`; `npm run test-report -- --testName <name> [--testFile <path>] [--envFile <path>]`; `node scripts/inject-dynamodb-into-test-report.js`; `scripts/publish-web-test-local.sh <sourceReport> <targetTest>`
- **Entry:** `scripts/export-dynamodb-for-test-users.js`; `scripts/generate-test-reports.js`; `app/test-helpers/dynamodbExporter.js:exportDynamoDBDataForUsers`
- **Files:** scripts/export-dynamodb-for-test-users.js, scripts/export-test-dynamodb.sh, scripts/generate-test-reports.js, scripts/inject-dynamodb-into-test-report.js, scripts/publish-web-test-local.sh, app/test-helpers/dynamodbExporter.js, app/unit-tests/web/test-report-web-test-local.test.js, app/unit-tests/web/trackedTestReportsAuthorizationMasking.test.js
- **Keywords:** dynamodb export, test report, testcontext, hmrc-api-requests, audit trail, post-mortem, web-test-local, jsonl
- **Related:** DEV-16, DEV-19

#### DEV-18 Provide shared unit/system-test fixtures

- **Use when:** a unit or system test needs a Lambda event, ID token, fetch mock or DynamoDB double.
- **Does:** eventBuilders.js builds Lambda API Gateway events, ID tokens and authorizer contexts, and cloudFrontEventBuilders.js builds CloudFront origin-response, 404 and 500 events. mockHelpers.js sets up fetch mocks and canned HMRC responses, and dynamoDbMock.js and primableMockServer.js add further test-double infrastructure. govClientTestHeader.js supplies the Gov-Client-* header constants used across tests.
- **Run:** `import { ... } from "app/test-helpers/eventBuilders.js"`; `import { ... } from "app/test-helpers/mockHelpers.js"`; `import { startHmrcMockServer } from "app/test-helpers/primableMockServer.js"`
- **Entry:** `app/test-helpers/eventBuilders.js`; `app/test-helpers/mockHelpers.js`; `app/test-helpers/primableMockServer.js:startHmrcMockServer`
- **Files:** app/test-helpers/eventBuilders.js, app/test-helpers/cloudFrontEventBuilders.js, app/test-helpers/mockHelpers.js, app/test-helpers/dynamoDbMock.js, app/test-helpers/primableMockServer.js, app/unit-tests/lib/govClientTestHeader.js, app/unit-tests/test-helpers/eventBuilders.test.js, app/unit-tests/test-helpers/mockHelpers.test.js, app/unit-tests/helpers/waitForSuccessOrError.test.js
- **Keywords:** test helpers, event builders, fetch mock, dynamodb mock, mock server, gov-client header, cloudfront event, id token
- **Related:** DEV-19, DEV-21

#### DEV-19 Provide shared behaviour-test fixtures and steps

- **Use when:** a behaviour test needs a background process, a page-interaction step, a DynamoDB assertion or a GA4 query.
- **Does:** behaviour-helpers.js starts and manages the local DynamoDB, HTTP server and stripe listen background processes a behaviour run needs. dynamodb-assertions.js, dynamodb-export.js, figures-helper.js, fileHelper.js and ga4PurchaseQuery.js read exported DynamoDB tables, caption screenshots, manage marker files and query GA4 purchases. gotoWithRetries.js retries Playwright navigation past transient errors, and behaviour-steps.js wraps page interactions as named test.step blocks with screenshots.
- **Run:** `import { ... } from "behaviour-tests/helpers/behaviour-helpers.js"`; `import { ... } from "behaviour-tests/steps/behaviour-steps.js"`
- **Entry:** `behaviour-tests/helpers/behaviour-helpers.js`; `behaviour-tests/steps/behaviour-steps.js`
- **Files:** behaviour-tests/helpers/behaviour-helpers.js, behaviour-tests/helpers/dynamodb-assertions.js, behaviour-tests/helpers/dynamodb-export.js, behaviour-tests/helpers/figures-helper.js, behaviour-tests/helpers/fileHelper.js, behaviour-tests/helpers/ga4PurchaseQuery.js, behaviour-tests/helpers/gotoWithRetries.js, behaviour-tests/helpers/playwrightTestForCapture.js, behaviour-tests/helpers/playwrightTestWithout.js, behaviour-tests/helpers/serverHelper.js, behaviour-tests/helpers/waitForSuccessOrError.js, behaviour-tests/steps/behaviour-steps.js
- **Keywords:** behaviour test helpers, playwright fixtures, stripe listen, ga4 purchase query, bigquery, screenshot captions, retry navigation, test step
- **Related:** DEV-18, DEV-17

#### DEV-20 Check SPDX licence headers

- **Use when:** a new source file is added, or licence-header coverage across the repository needs checking or fixing.
- **Does:** licenceHeaders.test.js walks every comment-capable tracked file, excluding generated exports, generated test-report output and Crown-copyright or third-party material. It asserts each file carries the PolyForm Internal Use SPDX identifier and the company copyright line. add-spdx-headers.js adds the matching JS or Java header block to files that are missing one.
- **Run:** `npm run test:unit`; `node scripts/add-spdx-headers.js`
- **Entry:** `app/unit-tests/licenceHeaders.test.js`; `scripts/add-spdx-headers.js`
- **Files:** app/unit-tests/licenceHeaders.test.js, scripts/add-spdx-headers.js
- **Keywords:** spdx, licence header, copyright header, polyform internal use, header check, header injection

#### DEV-21 Verify module wiring and repository shape

- **Use when:** a module might not be reachable from the app's index, or NEXT.md's board-row structure needs checking.
- **Does:** module-index.test.js confirms every module the app exports is reachable from its index. nextShape.test.js checks that NEXT.md carries its five required headings, in order, each occurring exactly once.
- **Run:** `npx vitest run app/unit-tests/module-index.test.js`; `npx vitest run app/unit-tests/nextShape.test.js`
- **Entry:** `app/unit-tests/module-index.test.js`; `app/unit-tests/nextShape.test.js`
- **Files:** app/unit-tests/module-index.test.js, app/unit-tests/nextShape.test.js
- **Keywords:** module index, export wiring, next.md shape, board headings, repository structure check
- **Related:** DEV-26

### Build hygiene, toolchain & docs (DEV)

<!-- generated:group build-hygiene-toolchain--docs-dev -->
- [DEV-22](#dev-22-clean-and-update-local-build-state) Clean and update local build state
- [DEV-23](#dev-23-configure-the-test-and-lint-toolchains) Configure the test and lint toolchains
- [DEV-24](#dev-24-document-developer-setup-and-repository-conventions) Document developer setup and repository conventions
- [DEV-25](#dev-25-maintain-the-specialist-agent-prompt-library) Maintain the specialist agent prompt library
- [DEV-26](#dev-26-enforce-claude-code-conventions-via-rules-and-hooks) Enforce Claude Code conventions via rules and hooks
<!-- /generated:group build-hygiene-toolchain--docs-dev -->

#### DEV-22 Clean and update local build state

- **Use when:** local build artefacts, node_modules or dependency versions are stale, or a commit's author needs checking.
- **Does:** clean.sh removes build output, coverage, CDK synth output and node_modules, then rebuilds the Maven compile and reinstalls npm packages. deep-clean.sh runs clean.sh and then the full npm test suite, and clean-node.sh resets only the Node dependency state. update.sh and update-java.sh refresh npm and Maven dependencies, and check-commit-identities.sh checks a commit author's email against the allow-list.
- **Run:** `npm run clean`; `bash scripts/deep-clean.sh`; `bash scripts/clean-node.sh`; `bash scripts/update.sh`; `npm run update:java`; `bash scripts/check-commit-identities.sh <base-sha> <head-sha> [allowlist-file]`; `bash scripts/create-favicon.sh <path-to-image>`; `bash scripts/export-files.sh`
- **Entry:** `scripts/clean.sh`; `scripts/deep-clean.sh`; `scripts/clean-node.sh`; `scripts/update.sh`
- **Files:** scripts/clean.sh, scripts/deep-clean.sh, scripts/clean-node.sh, scripts/update.sh, scripts/update-java.sh, scripts/check-commit-identities.sh, scripts/create-favicon.sh, scripts/export-files.sh
- **Keywords:** clean build, deep clean, node_modules reset, dependency update, npm-check-updates, commit identity allowlist, favicon, repository contents
- **Related:** DEV-26

#### DEV-23 Configure the test and lint toolchains

- **Use when:** Vitest coverage thresholds, Playwright browser settings, or ESLint/security-lint rules need checking or changing.
- **Does:** vitest.config.js sets the Vitest environment, coverage thresholds and test-discovery patterns for app/unit-tests and web/unit-tests. playwright.config.js configures the browser and behaviour-test runs. eslint.config.js and eslint.security.config.js configure the repository's lint and security-lint rule sets.
- **Run:** `npm run test:unit`; `npm run test:browser`; `npm run linting`
- **Entry:** `vitest.config.js`; `playwright.config.js`; `eslint.config.js`
- **Files:** vitest.config.js, playwright.config.js, eslint.config.js, eslint.security.config.js
- **Keywords:** vitest config, playwright config, eslint config, coverage thresholds, test discovery, security lint
- **Related:** DEV-20, DEV-21

#### DEV-24 Document developer setup and repository conventions

- **Use when:** a new contributor needs the setup guide, or the architecture, git config or session record needs reading.
- **Does:** README.md describes the app, setup and key features, and CLAUDE.md carries the project's Claude Code conventions. _developers/SETUP.md is the local development setup guide, and NEXT.md is the live open-work board. BACKLOG.md holds future work, PLAN_REPOSITORY_AUTOMATION.md tracks the automation plan, and REPORT_*.md files are generated architecture and session reports.
- **Run:** no command; see Does and Entry
- **Entry:** `README.md`; `_developers/SETUP.md`; `NEXT.md`
- **Files:** README.md, CLAUDE.md, _developers/SETUP.md, NEXT.md, BACKLOG.md, PLAN_REPOSITORY_AUTOMATION.md, REPORT_REPOSITORY_CONTENTS.md, REPORT_GIT_CONFIG.md, REPORT_SESSION_uOKRjk_2026-09-22.md, REPORT_SESSION_yQdSoM_2026-09-23.md
- **Keywords:** readme, setup guide, developer onboarding, next.md, backlog, plan doc, session report, architecture report
- **Related:** DEV-27, DEV-40

#### DEV-25 Maintain the specialist agent prompt library

- **Use when:** a Claude session needs a reusable role prompt, or a one-off analysis prompt.
- **Does:** prompts/*.md are reusable prompt files for specialist AI agent roles and one-off analyses. They cover an AWS CDK specialist, a behaviour-test master, a clean-code guardian, an HMRC API expert and a security reviewer. Other prompts cover alarm and support triage, CI board and do-next variants, and test-coverage and FAQ-update tasks.
- **Run:** no command; see Does and Entry
- **Entry:** `prompts/aws-cdk-java-specialist.md`; `prompts/behavior-test-master.md`; `prompts/alarm-triage.md`
- **Files:** prompts/abstract-libraries.md, prompts/alarm-triage.md, prompts/auto-select.md, prompts/aws-cdk-java-specialist.md, prompts/behavior-test-master.md, prompts/board-ci.md, prompts/clean-code-guardian.md, prompts/create-new-prompt.md, prompts/do-next-ci.md, prompts/entitlement-subscription-specialist.md, prompts/expand-capabilities.md, prompts/hmrc-api-expert.md, prompts/improve-test-coverage.md, prompts/increase-consistency.md, prompts/prune-focus.md, prompts/security-review.md, prompts/support-triage.md, prompts/todo-inator.md, prompts/update-faqs-help-and-guide.md
- **Keywords:** prompt library, specialist agent, role prompt, alarm triage, support triage, security review prompt, board-ci, do-next-ci
- **Related:** DEV-32, DEV-33

#### DEV-26 Enforce Claude Code conventions via rules and hooks

- **Use when:** a Claude session writes Lambda, CDK or test code, or pushes to main.
- **Does:** lambda-functions.md, cdk-infrastructure.md and testing.md document the handler, stack and test-naming patterns Claude sessions follow. guard-main-push.sh is a PreToolUse hook that blocks a git push to main unless every file changed is Markdown or PR-reviewed. add-references.md is a slash command that adds inline citation references to spreadsheets-site articles, sourced from GOV.UK pages via references.toml.
- **Run:** `/add-references`
- **Entry:** `app/http-simulator/index.js:startSimulator`; `.claude/hooks/guard-main-push.sh`; `.claude/commands/add-references.md`
- **Files:** .claude/rules/lambda-functions.md, .claude/rules/cdk-infrastructure.md, .claude/rules/testing.md, .claude/hooks/guard-main-push.sh, .claude/commands/add-references.md
- **Keywords:** claude rules, pretooluse hook, guard main push, lambda naming, cdk naming, test naming, add-references command, citation references
- **Related:** DEV-27

### Claude Code delivery-cycle skills (DEV)

<!-- generated:group claude-code-delivery-cycle-skills-dev -->
- [DEV-27](#dev-27-render-the-open-work-board) Render the open-work board
- [DEV-28](#dev-28-work-nextmd-as-dispatched-sub-agents) Work NEXT.md as dispatched sub-agents
- [DEV-29](#dev-29-refine-nextmd-before-a-wave) Refine NEXT.md before a wave
- [DEV-30](#dev-30-run-the-delivery-cycle-unattended) Run the delivery cycle unattended
- [DEV-31](#dev-31-watch-github-ci-to-green) Watch GitHub CI to green
- [DEV-32](#dev-32-merge-every-pr-that-is-ready) Merge every PR that is ready
- [DEV-33](#dev-33-preview-what-auto-merge-would-do) Preview what auto-merge would do
- [DEV-34](#dev-34-clean-up-stale-deployments-and-branches) Clean up stale deployments and branches
- [DEV-35](#dev-35-cool-down-an-overloaded-batch) Cool down an overloaded batch
- [DEV-36](#dev-36-resume-normal-work-from-cool-down) Resume normal work from cool-down
- [DEV-37](#dev-37-write-the-session-report) Write the session report
- [DEV-38](#dev-38-write-plain-human-prose) Write plain, human prose
- [DEV-39](#dev-39-sync-stripe-products-and-prices-from-the-catalogue) Sync Stripe products and prices from the catalogue
- [DEV-40](#dev-40-record-a-product-demo-video) Record a product demo video
- [DEV-41](#dev-41-publish-videos-to-the-youtube-channel) Publish videos to the YouTube channel
- [DEV-42](#dev-42-look-up-a-vat-submission-failure-alarms-customer) Look up a VAT submission-failure alarm's customer
- [DEV-43](#dev-43-find-existing-tooling-before-building-any) Find existing tooling before building any
<!-- /generated:group claude-code-delivery-cycle-skills-dev -->

#### DEV-27 Render the open-work board

- **Use when:** the operator asks for the board, the open items, or what is in flight.
- **Does:** board renders a table for NEXT.md items and backlog tier 1, with tiers 2-5 as one-line lists. It also renders open alarm issues by family, live ci and prod deployments, and a branch audit. It reads NEXT.md and BACKLOG.md fresh every time, never from memory.
- **Run:** `/board`
- **Entry:** `.claude/skills/board/SKILL.md`
- **Files:** .claude/skills/board/SKILL.md
- **Keywords:** board, open work, next.md, backlog, alarm issues, ci deployments, branch audit, in flight
- **Related:** DEV-33, DEV-28

#### DEV-28 Work NEXT.md as dispatched sub-agents

- **Use when:** the operator says do next, work the backlog, clear NEXT.md, or a landed batch leaves items still open.
- **Does:** do-next works NEXT.md top to bottom as waves of concurrent worktree sub-agents. It lands them on one branch, pushes in batches, raises one PR, and hands over to watch. It is the coordinator: it plans, dispatches, merges and pushes, and does not write the code.
- **Run:** `/do-next`
- **Entry:** `.claude/skills/do-next/SKILL.md`
- **Files:** .claude/skills/do-next/SKILL.md
- **Keywords:** do-next, next.md, worktree sub-agents, batch branch, wave dispatch, coordinator model, backlog work
- **Related:** DEV-27, DEV-29, DEV-32

#### DEV-29 Refine NEXT.md before a wave

- **Use when:** the operator asks for a readiness, feasibility or context pass over the board, or says refine the board.
- **Does:** refine runs four passes over NEXT.md in the main context, with no sub-agents. It checks each reference against origin/main, and completes each brief for its sub-agent at the lowest model that fits. It shares facts across rows that need them, and splits any human step out of a mixed row.
- **Run:** `/refine`
- **Entry:** `.claude/skills/refine/SKILL.md`
- **Files:** .claude/skills/refine/SKILL.md
- **Keywords:** refine, next.md readiness, brief preparation, model selection, reference check, human step split
- **Related:** DEV-27, DEV-28

#### DEV-30 Run the delivery cycle unattended

- **Use when:** the operator says iterate, run the cycle, or keep going until the board is clear.
- **Does:** iterate runs the cycle board, do-next, watch, auto-merge, watch, board, again, until no machine-only row can start. It runs under loop in dynamic mode, self-pacing between rounds. It carries the SSO login window and the lessons of prior session reports.
- **Run:** `/iterate`
- **Entry:** `.claude/skills/iterate/SKILL.md`
- **Files:** .claude/skills/iterate/SKILL.md
- **Keywords:** iterate, delivery cycle, unattended loop, board do-next watch auto-merge, self-pacing, sso window
- **Related:** DEV-27, DEV-28, DEV-33, DEV-35

#### DEV-31 Watch GitHub CI to green

- **Use when:** the operator says watch the builds, keep it green, or hands over a branch to get through CI.
- **Does:** watch arms a background Monitor over this repository's GitHub CI, using persistent mode. It acts on what the monitor reports until the whole scope is green. It never uses a foreground poll loop, and ends on evidence, not on elapsed time.
- **Run:** `/watch`
- **Entry:** `.claude/skills/watch/SKILL.md`
- **Files:** .claude/skills/watch/SKILL.md
- **Keywords:** watch, github ci, monitor tool, background poll, green build, ci failure react
- **Related:** DEV-28, DEV-32, DEV-30

#### DEV-32 Merge every PR that is ready

- **Use when:** the operator says auto-merge, merge what's ready, or asks for the repository's merge state.
- **Does:** auto-merge catalogues worktrees, branches, uncommitted work, PRs and review threads, then renders the state. It merges every PR that passes all of its gates, then hands over to watch. It is the only sanctioned path by which a session merges a pull request here.
- **Run:** `/auto-merge`
- **Entry:** `.claude/skills/auto-merge/SKILL.md`
- **Files:** .claude/skills/auto-merge/SKILL.md
- **Keywords:** auto-merge, pr merge gate, review thread check, worktree catalogue, branch audit, merge state
- **Related:** DEV-33, DEV-31, DEV-30

#### DEV-33 Preview what auto-merge would do

- **Use when:** the operator wants to see what would merge before anything does.
- **Does:** auto-merge-dry-run reads the auto-merge skill and follows it in dry-run mode. It gathers everything, renders every table and reaches every verdict, but takes no action. It changes nothing on disk and merges no PR.
- **Run:** `/auto-merge-dry-run`
- **Entry:** `.claude/skills/auto-merge-dry-run/SKILL.md`
- **Files:** .claude/skills/auto-merge-dry-run/SKILL.md
- **Keywords:** auto-merge dry run, merge preview, no-op verdict, read-only merge check
- **Related:** DEV-32

#### DEV-34 Clean up stale deployments and branches

- **Use when:** the operator says clean, clean up, or tidy the repo.
- **Does:** clean gathers five categories of leftover state: stale deployments, merged branches, worktrees, logs, test artefacts and build output. It shows them together and removes every category the operator agrees to in one go. It then fetches, switches to main and pulls, once nothing is in progress.
- **Run:** `/clean`
- **Entry:** `.claude/skills/clean/SKILL.md`
- **Files:** .claude/skills/clean/SKILL.md
- **Keywords:** clean, stale deployment sweep, merged branch cleanup, worktree removal, build output cleanup, tidy repo
- **Related:** DEV-22

#### DEV-35 Cool down an overloaded batch

- **Use when:** the operator says cool down, or a batch is stacking problems faster than it lands them.
- **Does:** cool-down is a mode, not a one-shot pass, that stays on until the operator lifts it. It slows new work while settling what is in flight, driving PRs and workflows green one branch at a time. It also holds the revival notes that wake reads from.
- **Run:** `/cool-down`
- **Entry:** `.claude/skills/cool-down/SKILL.md`
- **Files:** .claude/skills/cool-down/SKILL.md
- **Keywords:** cool-down, slow the flow, settle in-flight work, overloaded batch, mode not one-shot, revival notes
- **Related:** DEV-36, DEV-30

#### DEV-36 Resume normal work from cool-down

- **Use when:** the operator lifts cool-down in their own words, such as carry on or resume.
- **Does:** wake reads the cool-down skill's Waking notes and follows them. Only the operator wakes a session; an idle hour or a green branch is not consent.
- **Run:** `/wake`
- **Entry:** `.claude/skills/wake/SKILL.md`
- **Files:** .claude/skills/wake/SKILL.md
- **Keywords:** wake, resume work, exit cool-down, operator consent, revival
- **Related:** DEV-35

#### DEV-37 Write the session report

- **Use when:** the operator asks for a session report, an account of the session, or how did this session do.
- **Does:** session-report writes REPORT_SESSION_<id>_<date>.md at the repo root. It records what the session landed, what made it efficient, where it lost time or money, and ranked improvements. Every figure comes from git, job minutes, agent token counts, deploy runs and the transcript, never from memory.
- **Run:** `/session-report`
- **Entry:** `.claude/skills/session-report/SKILL.md`
- **Files:** .claude/skills/session-report/SKILL.md
- **Keywords:** session report, measured figures, job minutes, token counts, loss ranking, report_session file
- **Related:** DEV-24

#### DEV-38 Write plain, human prose

- **Use when:** writing any human-facing text: docs, code comments, reports, runbooks, site copy or chat.
- **Does:** plain-prose holds this repo's standing style guide: base rules from the Plain English Campaign, plus the LLM-voice tells to cut. It applies to README.md, site pages, PLAN and REPORT documents, other skill docs, code comments and chat responses.
- **Run:** `/plain-prose`
- **Entry:** `.claude/skills/plain-prose/SKILL.md`
- **Files:** .claude/skills/plain-prose/SKILL.md
- **Keywords:** plain prose, writing style, plain english, llm voice tells, human-facing text, style guide
- **Related:** DEV-37, DEV-24

#### DEV-39 Sync Stripe products and prices from the catalogue

- **Use when:** a bundle's price changes or a new on-subscription bundle needs a Stripe product.
- **Does:** stripe-catalogue-sync reads web/public/submit.catalogue.toml and creates or finds the matching Stripe product and price for each subscription bundle. infra/stripe/stripe-sync.js plans by default and applies only on --apply. The skill runs test mode on one go and live mode on a separate go.
- **Run:** `/stripe-catalogue-sync`; `node infra/stripe/stripe-sync.js --environment ci --mode test --apply`
- **Entry:** `.claude/skills/stripe-catalogue-sync/SKILL.md`; `infra/stripe/stripe-sync.js`
- **Files:** .claude/skills/stripe-catalogue-sync/SKILL.md
- **Keywords:** stripe sync, bundle catalogue, price sync, product sync, subscription bundle, stripe-sync.js

#### DEV-40 Record a product demo video

- **Use when:** asked to make, update or re-record a product demo or training video.
- **Does:** site-video-capture drives a real browser through a scene script (videos/<name>.json) with Playwright. It draws a pointer, trail and captions with an in-page overlay, and captures the session with CDP screencast. It encodes a constant-60fps H.264 mp4 with ffmpeg, and writes a vtt, a transcript and per-scene stills.
- **Run:** `/site-video-capture`; `npm run video:tour-proxy`
- **Entry:** `.claude/skills/site-video-capture/SKILL.md`; `scripts/site-video-capture.js`
- **Files:** .claude/skills/site-video-capture/SKILL.md
- **Keywords:** video capture, scene script, playwright recording, cdp screencast, ffmpeg, demo video, training video
- **Related:** DEV-41

#### DEV-41 Publish videos to the YouTube channel

- **Use when:** the operator asks to publish, re-publish or check the videos, or a recording is ready.
- **Does:** video-publish takes recordings from video-capture.yml runs to the DIY Accounting Submit YouTube channel. It checks them, uploads unlisted with the stored credentials, and flips them public, driven by videos/publish.json and scripts/youtube-upload.js.
- **Run:** `/video-publish`; `npm run video:publish`
- **Entry:** `.claude/skills/video-publish/SKILL.md`; `scripts/youtube-upload.js`
- **Files:** .claude/skills/video-publish/SKILL.md
- **Keywords:** video publish, youtube upload, unlisted to public, publish.json, youtube-upload.js, channel
- **Related:** DEV-40

#### DEV-42 Look up a VAT submission-failure alarm's customer

- **Use when:** the operator asks who a submission-failure alarm was or whether the customer needs a reply.
- **Does:** vat-submission-failure-alarm-user-lookup finds the customer behind a failed VAT submission, what HMRC answered, and whether they wrote to support. Every AWS call is read-only through the submit-prod SSO profile. It runs only Query, never Scan, against customer tables keyed by hashedSub.
- **Run:** `/vat-submission-failure-alarm-user-lookup`
- **Entry:** `.claude/skills/vat-submission-failure-alarm-user-lookup/SKILL.md`
- **Files:** .claude/skills/vat-submission-failure-alarm-user-lookup/SKILL.md
- **Keywords:** alarm lookup, submission failure, hashedsub, customer lookup, support ticket lookup, read-only aws query
- **Related:** DEV-25

#### DEV-43 Find existing tooling before building any

- **Use when:** a task would add a script, workflow, Lambda, check, sync, report, alarm, page or skill
- **Does:** The capabilities skill reads REPORT_CAPABILITIES.md before any new mechanism is written. It finds the entry that does the job, or confirms that none fits. It also keeps the index current.
- **Run:** `/capabilities`; `npm run capabilities:index`
- **Entry:** `.claude/skills/capabilities/SKILL.md`; `scripts/capabilities-index.mjs:render`
- **Files:** .claude/skills/capabilities/SKILL.md, REPORT_CAPABILITIES.md, scripts/capabilities-index.mjs, app/unit-tests/capabilitiesIndex.test.js
- **Keywords:** capability, existing tooling, find command, index, reuse, duplicate mechanism, what does the repo do

## Keywords

<!-- generated:keywords -->
- 202 accepted: [SITE-09](#site-09-track-and-poll-async-api-requests)
- 202 poll: [MCP-07](#mcp-07-file-vat-returns-and-accounts-via-api)
- 401 retry: [BILL-34](#bill-34-prefetch-and-retry-a-cognito-token-refresh)
- 403: [HMRC-03](#hmrc-03-retrieve-vat-obligations), [OPS-131](#ops-131-serve-cloudfront-custom-error-pages)
- 403 bundle message: [SITE-09](#site-09-track-and-poll-async-api-requests)
- 404: [OPS-131](#ops-131-serve-cloudfront-custom-error-pages)
- 404 not run: [DATA-19](#data-19-serve-the-operator-dashboard-snapshot-via-the-api)
- 404 scan: [OPS-73](#ops-73-detect-404-scan-rate-attacks)
- 500: [OPS-131](#ops-131-serve-cloudfront-custom-error-pages)
- 501: [BILL-27](#bill-27-recover-an-abandoned-checkout)
- 9-box: [HMRC-01](#hmrc-01-submit-a-vat-return), [HMRC-07](#hmrc-07-build-and-validate-9-box-vat-return-data), [HMRC-08](#hmrc-08-parse-vat-returns-from-a-bulk-csv-file), [DEV-08](#dev-08-simulate-hmrc-vat-mtd-api)
- [alarm]: [OPS-71](#ops-71-create-github-issues-from-cloudwatch-alarms)
- ab test log: [SITE-21](#site-21-log-growth-experiments)
- abandoned checkout: [BILL-27](#bill-27-recover-an-abandoned-checkout)
- abort: [CH-10](#ch-10-fetch-http-with-a-timeout)
- access token: [SITE-02](#site-02-verify-jwts-at-the-api-gateway), [HMRC-23](#hmrc-23-exchange-an-hmrc-oauth-code-for-a-token), [CH-01](#ch-01-exchange-a-companies-house-oauth-token), [OPS-110](#ops-110-force-logout-all-users-during-a-security-incident), [MCP-02](#mcp-02-authenticate-mcp-sessions-via-cognito)
- access token validation: [HMRC-29](#hmrc-29-call-the-hmrc-api)
- accessibility report: [OPS-38](#ops-38-run-the-weekly-compliance-test-check)
- accessibility scan: [OPS-96](#ops-96-scan-pages-for-accessibility-violations), [DEV-14](#dev-14-start-the-proxy-and-simulator-local-dev-environments)
- accessibility statement: [SITE-10](#site-10-serve-general-site-pages)
- accessibility test: [OPS-62](#ops-62-report-accessibility-penetration-testing)
- account isolation: [OPS-58](#ops-58-document-multi-account-aws-architecture)
- account migration: [OPS-106](#ops-106-replicate-secrets-across-aws-accounts), [OPS-107](#ops-107-list-production-secrets-manager-entries)
- account policies: [BILL-31](#bill-31-configure-stripe-account-policies)
- account separation: [OPS-105](#ops-105-copy-production-data-to-backup-for-migration)
- account setup: [OPS-101](#ops-101-set-up-github-oidc-deployment-roles)
- account stack: [BILL-36](#bill-36-cdk-account-stack)
- account status: [OPS-100](#ops-100-create-or-invite-aws-member-accounts)
- account structure: [OPS-99](#ops-99-bootstrap-the-aws-organization-structure)
- accounting year-end: [DATA-50](#data-50-resolve-finance-staging-directory-paths)
- accounts filing: [MCP-04](#mcp-04-derive-micro-entity-accounts-figures-for-companies-house-filing), [DEV-04](#dev-04-simulate-companies-house-identity-and-filing)
- accounts staging: [DATA-48](#data-48-stage-paypal-transactions-for-reconciliation), [DATA-49](#data-49-stage-stripe-transactions-for-reconciliation)
- acm: [OPS-37](#ops-37-check-https-certificate-expiry)
- acm certificate: [OPS-49](#ops-49-request-and-renew-the-holding-page-certificate)
- actionlint gap: [OPS-33](#ops-33-enforce-workflow-to-workflow-permission-grants)
- active users daily: [DATA-27](#data-27-sql-views-activity-and-traffic)
- activity: [BILL-35](#bill-35-load-and-query-the-productactivity-catalogue)
- activity bus: [DATA-01](#data-01-publish-activity-events-to-the-bus)
- activity event: [SITE-04](#site-04-track-visits-via-session-beacon), [DATA-01](#data-01-publish-activity-events-to-the-bus)
- activity events: [OPS-70](#ops-70-forward-operational-activity-events-to-telegram), [DATA-02](#data-02-transform-activity-events-into-lake-rows)
- activity list: [DATA-26](#data-26-render-the-operator-objectives-dashboard)
- activity_events: [DATA-11](#data-11-run-glue-data-quality-checks)
- activity_events_all: [DATA-27](#data-27-sql-views-activity-and-traffic)
- actor class: [DATA-01](#data-01-publish-activity-events-to-the-bus)
- ad group performance: [DATA-34](#data-34-report-google-ads-campaign-performance)
- add-bundle: [BILL-01](#bill-01-grant-a-bundle-to-a-user)
- add-references command: [DEV-26](#dev-26-enforce-claude-code-conventions-via-rules-and-hooks)
- add_client: [MCP-08](#mcp-08-manage-practice-clients-and-hmrc-agent-authorisation)
- addinitscript: [OPS-89](#ops-89-overlay-pointer-and-caption-cues-on-video)
- adjustments: [HMRC-13](#hmrc-13-submit-and-manage-the-self-employment-annual-summary), [HMRC-16](#hmrc-16-trigger-and-adjust-the-business-source-adjustable-summary)
- admin pass: [BILL-07](#bill-07-admin-issue-a-pass)
- ads advisor skill: [DATA-36](#data-36-answer-google-ads-questions-from-live-data)
- ads.toml: [DATA-32](#data-32-sync-the-google-ads-account)
- advertising standards: [SITE-20](#site-20-document-business-governance-and-positioning)
- affiliate: [SITE-11](#site-11-promote-sibling-products-and-partners)
- agent authorisation: [HMRC-24](#hmrc-24-verify-hmrc-agent-authorisation-for-a-client), [BILL-12](#bill-12-invite-a-client-to-authorise-agent-access), [MCP-08](#mcp-08-manage-practice-clients-and-hmrc-agent-authorisation), [DEV-05](#dev-05-simulate-hmrc-agent-authorisation-and-fraud-prevention-headers)
- agent output: [OPS-17](#ops-17-redact-and-gate-unattended-agent-output-before-publishing)
- agent path: [OPS-20](#ops-20-enforce-daily-run-budgets-for-agent-paths)
- agent persona: [HMRC-37](#hmrc-37-plan-the-hmrc-mtd-vat-and-itsa-rollout)
- agent runs: [DATA-15](#data-15-catalogue-workflow-probe-and-agent-run-data)
- agent runs daily: [DATA-31](#data-31-sql-views-dora-and-operations)
- agent services: [HMRC-24](#hmrc-24-verify-hmrc-agent-authorisation-for-a-client)
- agent.md: [OPS-54](#ops-54-define-specialized-claude-code-sub-agent-personas)
- agentic-lib: [OPS-57](#ops-57-dispatch-agentic-lib-board-backlog-and-pr-agents)
- aggregate tables: [DATA-05](#data-05-pull-ga4-daily-bigquery-aggregate-tables)
- ai agent: [SITE-04](#site-04-track-visits-via-session-beacon)
- ai-agent crawler: [DATA-23](#data-23-classify-visitor-kind-as-human-bot-or-synthetic)
- alarm evidence: [OPS-76](#ops-76-gather-alarm-evidence-for-investigation)
- alarm family: [OPS-21](#ops-21-auto-close-resolved-alarm-issues), [OPS-22](#ops-22-verify-a-triage-draft-pr-stays-in-scope), [OPS-71](#ops-71-create-github-issues-from-cloudwatch-alarms), [OPS-79](#ops-79-track-an-alarm-familys-daily-remedy-budget), [DATA-03](#data-03-transform-alarm-state-changes-into-lake-rows)
- alarm history: [OPS-78](#ops-78-verify-an-alarm-issues-claimed-transition)
- alarm issue: [OPS-21](#ops-21-auto-close-resolved-alarm-issues)
- alarm issues: [DEV-27](#dev-27-render-the-open-work-board)
- alarm lookup: [DEV-42](#dev-42-look-up-a-vat-submission-failure-alarms-customer)
- alarm silence: [OPS-77](#ops-77-silence-alarms-during-deployment-teardown)
- alarm state change: [OPS-71](#ops-71-create-github-issues-from-cloudwatch-alarms), [DATA-03](#data-03-transform-alarm-state-changes-into-lake-rows)
- alarm state changes daily: [DATA-31](#data-31-sql-views-dora-and-operations)
- alarm triage: [OPS-18](#ops-18-run-alarm-and-support-triage), [DEV-25](#dev-25-maintain-the-specialist-agent-prompt-library)
- alarm_state_changes: [DATA-11](#data-11-run-glue-data-quality-checks)
- alarms view: [DATA-03](#data-03-transform-alarm-state-changes-into-lake-rows)
- alert routing: [OPS-71](#ops-71-create-github-issues-from-cloudwatch-alarms)
- alert thresholds: [DATA-41](#data-41-assert-gcp-billing-budget-and-stray-project)
- alert topic: [OPS-119](#ops-119-provision-the-ops-stack)
- alerts: [OPS-70](#ops-70-forward-operational-activity-events-to-telegram)
- all-clients: [MCP-01](#mcp-01-expose-the-submission-mcp-server-and-tools), [MCP-09](#mcp-09-run-a-client-scoped-tool-across-every-practice-client)
- allocation: [BILL-01](#bill-01-grant-a-bundle-to-a-user)
- allowlist: [OPS-28](#ops-28-enforce-commit-identity-allowlist)
- amount owed: [HMRC-04](#hmrc-04-retrieve-vat-liabilities)
- analytics event: [SITE-04](#site-04-track-visits-via-session-beacon)
- analytics lake: [OPS-25](#ops-25-record-dora-and-probe-metrics), [DATA-12](#data-12-provision-the-analytics-lake-and-athena-workgroup)
- analytics-pull: [DATA-20](#data-20-publish-the-nightly-raw-export-for-indexing)
- analytics_storage: [SITE-15](#site-15-show-and-persist-cookie-consent)
- annual submission: [MCP-06](#mcp-06-derive-itsa-quarterly-and-annual-submission-figures)
- annual summary: [HMRC-13](#hmrc-13-submit-and-manage-the-self-employment-annual-summary)
- apex isolation: [OPS-61](#ops-61-design-ci-branch-deploys-off-the-apex)
- apex mid-move: [OPS-24](#ops-24-gate-probes-on-the-main-apex-deploy)
- api docs: [DEV-06](#dev-06-simulate-hmrc-test-user-provisioning-and-api-docs)
- api gateway: [SITE-02](#site-02-verify-jwts-at-the-api-gateway), [CH-14](#ch-14-provision-the-companies-house-cdk-stack), [BILL-36](#bill-36-cdk-account-stack), [OPS-03](#ops-03-look-up-aws-resources-by-domain-convention), [OPS-112](#ops-112-provision-the-api-gateway-stack)
- api gateway custom domain: [OPS-05](#ops-05-promote-a-ci-deployment-to-the-ci-apex)
- api gateway event shape: [SITE-06](#site-06-adapt-lambda-handlers-to-express-routes)
- api gateway routes: [DEV-13](#dev-13-generate-the-openapi-spec-from-cdk-route-definitions)
- api key: [CH-02](#ch-02-verify-the-companies-house-oauth-app-configuration), [BILL-32](#bill-32-provision-stripe-secrets)
- api lambda: [OPS-124](#ops-124-define-shared-lambda-cdk-constructs)
- api subscriptions: [HMRC-32](#hmrc-32-register-and-verify-hmrc-developer-hub-application-config)
- apilambda: [CH-14](#ch-14-provision-the-companies-house-cdk-stack)
- app monitor: [DATA-25](#data-25-configure-and-gate-cloudwatch-rum)
- architecture rationale: [OPS-61](#ops-61-design-ci-branch-deploys-off-the-apex)
- architecture report: [DEV-24](#dev-24-document-developer-setup-and-repository-conventions)
- archive client: [BILL-16](#bill-16-manage-practice-clients)
- arn lookup: [OPS-136](#ops-136-retrieve-cloudformation-stack-outputs)
- arrival_date: [DATA-51](#data-51-turn-staged-stripe-activity-into-diya-gl-lines)
- assert: [CH-02](#ch-02-verify-the-companies-house-oauth-app-configuration)
- assert configuration: [BILL-29](#bill-29-assert-the-paypal-donate-button-configuration)
- asset groups: [DATA-33](#data-33-read-the-google-ads-account-inventory)
- assume role: [OPS-69](#ops-69-assume-and-clear-local-aws-deployment-credentials)
- async request: [SITE-09](#site-09-track-and-poll-async-api-requests), [CH-08](#ch-08-file-micro-entity-accounts-to-companies-house)
- async request state: [HMRC-30](#hmrc-30-persist-async-hmrc-api-request-state)
- athena link: [OPS-80](#ops-80-build-aws-console-deep-links-for-operators)
- athena lookup: [OPS-40](#ops-40-delete-a-customers-data-for-gdpr-erasure)
- athena query: [DATA-13](#data-13-catalogue-cloudfront-access-logs-for-athena)
- athena view: [DATA-10](#data-10-create-or-replace-athena-business-views)
- athena workgroup: [DATA-12](#data-12-provision-the-analytics-lake-and-athena-workgroup)
- audit findings: [OPS-63](#ops-63-report-identity-audit-findings)
- audit trail: [DEV-17](#dev-17-export-and-embed-dynamodb-test-state-in-reports)
- auth logic: [DEV-12](#dev-12-prove-the-client-status-stack-and-fetchauth)
- auth platform brand: [DATA-44](#data-44-assert-google-oauth-client-configuration)
- auth-status: [SITE-01](#site-01-sign-customers-in-via-cognito)
- author email: [OPS-28](#ops-28-enforce-commit-identity-allowlist)
- authorisation: [BILL-04](#bill-04-enforce-bundle-entitlement-on-a-request)
- authorisation code: [HMRC-23](#hmrc-23-exchange-an-hmrc-oauth-code-for-a-token), [HMRC-33](#hmrc-33-drive-hmrcs-sandbox-authorisation-flow-for-test-scripts)
- authorisation status: [BILL-13](#bill-13-check-a-clients-authorisation-status)
- authorization: [BILL-04](#bill-04-enforce-bundle-entitlement-on-a-request)
- authorization code: [CH-01](#ch-01-exchange-a-companies-house-oauth-token)
- authorization_code: [DEV-03](#dev-03-simulate-hmrc-oauth)
- authorizedfetch: [HMRC-29](#hmrc-29-call-the-hmrc-api)
- authorizer: [SITE-02](#site-02-verify-jwts-at-the-api-gateway)
- auto-close: [OPS-21](#ops-21-auto-close-resolved-alarm-issues)
- auto-merge: [DEV-32](#dev-32-merge-every-pr-that-is-ready)
- auto-merge dry run: [DEV-33](#dev-33-preview-what-auto-merge-would-do)
- auto-remediate: [OPS-79](#ops-79-track-an-alarm-familys-daily-remedy-budget)
- auto-tagging: [DATA-32](#data-32-sync-the-google-ads-account)
- automated code review: [OPS-31](#ops-31-run-a-claude-security-review-on-push)
- availability sli: [DATA-31](#data-31-sql-views-dora-and-operations)
- aws account setup: [OPS-98](#ops-98-bootstrap-the-cdk-toolkit-across-accounts)
- aws architecture: [OPS-58](#ops-58-document-multi-account-aws-architecture)
- aws budgets: [DATA-16](#data-16-alert-on-cost-budget-and-anomaly-thresholds)
- aws config recorder: [OPS-121](#ops-121-provision-the-security-baseline-stack)
- aws costs: [OPS-59](#ops-59-track-and-analyze-aws-spending)
- aws organization: [OPS-99](#ops-99-bootstrap-the-aws-organization-structure)
- aws sdk: [OPS-82](#ops-82-provide-a-shared-dynamodb-client)
- aws security credentials supplier: [DATA-37](#data-37-federate-lambda-credentials-to-google-cloud)
- aws sts assume-role: [OPS-69](#ops-69-assume-and-clear-local-aws-deployment-credentials)
- aws-jwt-verify: [SITE-02](#site-02-verify-jwts-at-the-api-gateway)
- aws_costs.md: [OPS-59](#ops-59-track-and-analyze-aws-spending)
- awscustomresource: [OPS-127](#ops-127-upsert-route53-alias-records-via-custom-resource)
- axe: [DATA-14](#data-14-catalogue-compliance-findings-for-the-dashboard)
- axe-core: [OPS-96](#ops-96-scan-pages-for-accessibility-violations)
- backfill: [BILL-41](#bill-41-backfill-the-stripe-test-mode-qualifier)
- background poll: [DEV-31](#dev-31-watch-github-ci-to-green)
- backlog: [DEV-24](#dev-24-document-developer-setup-and-repository-conventions), [DEV-27](#dev-27-render-the-open-work-board)
- backlog work: [DEV-28](#dev-28-work-nextmd-as-dispatched-sub-agents)
- backup account: [OPS-111](#ops-111-provision-cross-account-backup-vaults-and-plans)
- backup health: [OPS-48](#ops-48-verify-backup-health-daily)
- backup migration: [OPS-105](#ops-105-copy-production-data-to-backup-for-migration)
- backup plan: [OPS-111](#ops-111-provision-cross-account-backup-vaults-and-plans)
- backup roles: [OPS-102](#ops-102-verify-the-multi-account-aws-setup), [OPS-104](#ops-104-set-up-cross-account-backup-iam-roles)
- backup salt: [OPS-44](#ops-44-hash-and-rotate-the-subject-id-salt)
- backup vault: [OPS-48](#ops-48-verify-backup-health-daily), [OPS-104](#ops-104-set-up-cross-account-backup-iam-roles), [OPS-109](#ops-109-disaster-recovery-restore-into-a-new-prod-account), [OPS-111](#ops-111-provision-cross-account-backup-vaults-and-plans)
- balance sheet: [CH-07](#ch-07-preview-micro-entity-accounts-before-filing), [MCP-04](#mcp-04-derive-micro-entity-accounts-figures-for-companies-house-filing)
- balance transactions: [DATA-09](#data-09-reconcile-stripe-payments-into-the-lake), [MCP-13](#mcp-13-import-stripe-transaction-and-payout-lines)
- bank line: [DATA-51](#data-51-turn-staged-stripe-activity-into-diya-gl-lines)
- bank statement import: [MCP-10](#mcp-10-import-a-natwest-bank-statement-into-diya-gl-lines)
- bankcode: [MCP-10](#mcp-10-import-a-natwest-bank-statement-into-diya-gl-lines)
- batch branch: [DEV-28](#dev-28-work-nextmd-as-dispatched-sub-agents)
- batch processing: [OPS-87](#ops-87-process-sqs-message-batches-in-lambda-workers)
- batch scan update: [OPS-43](#ops-43-rotate-stored-email-address-hashes)
- batch tools: [MCP-09](#mcp-09-run-a-client-scoped-tool-across-every-practice-client)
- batchitemfailure: [DATA-04](#data-04-stream-dynamodb-table-changes-into-the-lake)
- bcmdataexports: [DATA-17](#data-17-export-aws-billing-data-in-focus-format)
- bedrock: [OPS-17](#ops-17-redact-and-gate-unattended-agent-output-before-publishing), [OPS-18](#ops-18-run-alarm-and-support-triage), [OPS-72](#ops-72-forward-bedrock-budget-alerts)
- behaviour test: [CH-12](#ch-12-generate-synthetic-test-companies)
- behaviour test helpers: [HMRC-36](#hmrc-36-provide-itsa-behaviour-test-step-helpers), [DEV-19](#dev-19-provide-shared-behaviour-test-fixtures-and-steps)
- behaviour test lane: [OPS-15](#ops-15-serialize-lane-test-user-rotation-jobs)
- behaviour test master: [OPS-54](#ops-54-define-specialized-claude-code-sub-agent-personas)
- behaviour tests: [OPS-26](#ops-26-run-the-automated-test-suite-in-ci)
- betaanalyticsdataclient: [DATA-06](#data-06-pull-ga4-reports-and-bigquery-event-export)
- bidding optimisation: [DATA-36](#data-36-answer-google-ads-questions-from-live-data)
- bigquery: [DEV-19](#dev-19-provide-shared-behaviour-test-fixtures-and-steps)
- bigquery dataset: [OPS-67](#ops-67-apply-google-cloud--ga4-infrastructure)
- bigquery datasets: [DATA-43](#data-43-read-the-google-cloud-and-ga4-inventory)
- bigquery link: [DATA-38](#data-38-sync-ga4-properties-streams-and-key-events)
- bigquery.toml: [DATA-39](#data-39-sync-ga4-in-bigquery-scheduled-queries)
- bigram matching: [SITE-10](#site-10-serve-general-site-pages)
- bill of materials: [OPS-39](#ops-39-generate-a-software-bill-of-materials)
- billing: [BILL-24](#bill-24-create-a-stripe-checkout-session)
- billing account: [DATA-41](#data-41-assert-gcp-billing-budget-and-stray-project)
- billing budgets: [DATA-43](#data-43-read-the-google-cloud-and-ga4-inventory)
- billing endpoints: [OPS-112](#ops-112-provision-the-api-gateway-stack)
- billing portal: [BILL-26](#bill-26-open-the-stripe-customer-billing-portal)
- billing stack: [BILL-37](#bill-37-cdk-billing-app-stack)
- billion laughs: [CH-11](#ch-11-parse-xml-safely)
- blocked requests: [OPS-74](#ops-74-detect-waf-blocked-scan-attacks)
- board: [DEV-27](#dev-27-render-the-open-work-board)
- board agent: [OPS-57](#ops-57-dispatch-agentic-lib-board-backlog-and-pr-agents)
- board do-next watch auto-merge: [DEV-30](#dev-30-run-the-delivery-cycle-unattended)
- board headings: [DEV-21](#dev-21-verify-module-wiring-and-repository-shape)
- board-ci: [DEV-25](#dev-25-maintain-the-specialist-agent-prompt-library)
- book from workbook: [MCP-11](#mcp-11-seed-a-book-from-a-workbook-set)
- book keys: [BILL-23](#bill-23-store-diya-gl-books-in-s3)
- book ownership: [BILL-15](#bill-15-move-a-book-to-a-client)
- book schema: [MCP-11](#mcp-11-seed-a-book-from-a-workbook-set)
- book version: [BILL-20](#bill-20-fetch-a-versioned-diya-gl-book)
- book-move lambda: [BILL-39](#bill-39-cdk-diya-gl-stack)
- book.toml: [MCP-03](#mcp-03-load-and-save-diya-gl-books-via-mcp)
- bootstrap account: [OPS-103](#ops-103-bootstrap-a-new-aws-account-for-cdk)
- box 3: [HMRC-07](#hmrc-07-build-and-validate-9-box-vat-return-data)
- box 5: [HMRC-07](#hmrc-07-build-and-validate-9-box-vat-return-data)
- branch audit: [DEV-27](#dev-27-render-the-open-work-board), [DEV-32](#dev-32-merge-every-pr-that-is-ready)
- branch hash: [OPS-02](#ops-02-derive-environment-and-deployment-names-from-a-branch)
- branch protection: [OPS-60](#ops-60-guide-github-repository-configuration)
- break-even: [DATA-36](#data-36-answer-google-ads-questions-from-live-data)
- brief preparation: [DEV-29](#dev-29-refine-nextmd-before-a-wave)
- browser test: [DEV-12](#dev-12-prove-the-client-status-stack-and-fetchauth)
- browser tests: [OPS-26](#ops-26-run-the-automated-test-suite-in-ci)
- brute force: [OPS-73](#ops-73-detect-404-scan-rate-attacks)
- bsas: [HMRC-16](#hmrc-16-trigger-and-adjust-the-business-source-adjustable-summary), [HMRC-34](#hmrc-34-file-a-full-itsa-tax-year-in-sandbox), [DEV-09](#dev-09-simulate-hmrc-itsa-mtd-api)
- budget alert: [OPS-72](#ops-72-forward-bedrock-budget-alerts)
- budget dedupe: [DATA-41](#data-41-assert-gcp-billing-budget-and-stray-project)
- budget forecast question: [DATA-36](#data-36-answer-google-ads-questions-from-live-data)
- build output cleanup: [DEV-34](#dev-34-clean-up-stale-deployments-and-branches)
- bulk vat return: [HMRC-08](#hmrc-08-parse-vat-returns-from-a-bulk-csv-file)
- bundle: [BILL-01](#bill-01-grant-a-bundle-to-a-user), [BILL-02](#bill-02-list-a-users-bundles-and-token-balance), [BILL-03](#bill-03-delete-a-bundle)
- bundle auto-grant: [DEV-07](#dev-07-simulate-the-public-demos-billing-and-oauth)
- bundle catalogue: [BILL-44](#bill-44-document-the-price-update-project), [DEV-39](#dev-39-sync-stripe-products-and-prices-from-the-catalogue)
- bundle entitlement: [CH-04](#ch-04-fetch-a-company-profile), [DATA-19](#data-19-serve-the-operator-dashboard-snapshot-via-the-api)
- bundle mapping: [BILL-35](#bill-35-load-and-query-the-productactivity-catalogue)
- bundleentitlementerror: [BILL-04](#bill-04-enforce-bundle-entitlement-on-a-request)
- bundles: [DATA-04](#data-04-stream-dynamodb-table-changes-into-the-lake)
- bundles table: [OPS-16](#ops-16-run-dynamodb-data-migrations)
- bundling: [SITE-18](#site-18-bootstrap-the-frontend-module-bundle)
- burst bucket: [BILL-42](#bill-42-parse-iso-8601-durations-for-expiry)
- burst counter: [BILL-02](#bill-02-list-a-users-bundles-and-token-balance), [OPS-46](#ops-46-query-and-persist-per-consumer-security-state-records)
- business activity: [DATA-27](#data-27-sql-views-activity-and-traffic)
- business details: [HMRC-35](#hmrc-35-spike-test-the-itsa-sandbox-oauth-and-business-details-flow)
- business event: [DATA-01](#data-01-publish-activity-events-to-the-bus)
- business metrics: [DATA-21](#data-21-publish-nightly-business-metrics-to-cloudwatch)
- business picker: [HMRC-09](#hmrc-09-retrieve-itsa-business-details)
- business source adjustable summary: [HMRC-16](#hmrc-16-trigger-and-adjust-the-business-source-adjustable-summary)
- business views: [DATA-10](#data-10-create-or-replace-athena-business-views)
- cached status: [BILL-13](#bill-13-check-a-clients-authorisation-status)
- caching policy: [OPS-115](#ops-115-provision-the-edgecloudfront-stack)
- callback: [SITE-01](#site-01-sign-customers-in-via-cognito)
- called workflow: [OPS-33](#ops-33-enforce-workflow-to-workflow-permission-grants)
- callsubmitapi: [MCP-07](#mcp-07-file-vat-returns-and-accounts-via-api)
- campaign bidding: [DATA-32](#data-32-sync-the-google-ads-account)
- cancel invitation: [BILL-14](#bill-14-cancel-a-pending-client-authorisation-invite)
- cancel run: [OPS-01](#ops-01-cancel-superseded-push-triggered-deploys)
- cancel subscription: [BILL-26](#bill-26-open-the-stripe-customer-billing-portal), [BILL-28](#bill-28-process-stripe-webhook-events)
- capability: [DEV-43](#dev-43-find-existing-tooling-before-building-any)
- capacity: [BILL-02](#bill-02-list-a-users-bundles-and-token-balance)
- capacity cap: [BILL-01](#bill-01-grant-a-bundle-to-a-user)
- capacity counter: [BILL-05](#bill-05-reconcile-bundle-capacity-counters)
- capped bundle: [BILL-35](#bill-35-load-and-query-the-productactivity-catalogue)
- caption overlay: [OPS-89](#ops-89-overlay-pointer-and-caption-cues-on-video)
- captions: [OPS-90](#ops-90-encode-captured-video-frames-and-captions), [OPS-92](#ops-92-redact-secrets-from-video-artefacts), [OPS-94](#ops-94-play-demo-videos-on-the-public-site)
- catalogue: [BILL-35](#bill-35-load-and-query-the-productactivity-catalogue)
- catalogue sync: [BILL-30](#bill-30-sync-the-stripe-productprice-catalogue)
- cdk: [CH-14](#ch-14-provision-the-companies-house-cdk-stack), [BILL-36](#bill-36-cdk-account-stack), [BILL-37](#bill-37-cdk-billing-app-stack), [BILL-38](#bill-38-cdk-billing-webhook-stack), [BILL-39](#bill-39-cdk-diya-gl-stack)
- cdk application logging: [OPS-129](#ops-129-configure-lambdacdk-application-logging)
- cdk bootstrap: [OPS-98](#ops-98-bootstrap-the-cdk-toolkit-across-accounts)
- cdk config: [OPS-126](#ops-126-provide-config-composition-helpers-for-cdk-code)
- cdk custom resource: [DATA-10](#data-10-create-or-replace-athena-business-views)
- cdk deploy: [OPS-08](#ops-08-deploy-a-single-cdk-stack-on-demand)
- cdk entrypoint: [OPS-123](#ops-123-wire-cdk-application-entrypoints-per-account)
- cdk introspection: [DEV-13](#dev-13-generate-the-openapi-spec-from-cdk-route-definitions)
- cdk java specialist: [OPS-54](#ops-54-define-specialized-claude-code-sub-agent-personas)
- cdk lambda construct: [OPS-124](#ops-124-define-shared-lambda-cdk-constructs)
- cdk naming: [DEV-26](#dev-26-enforce-claude-code-conventions-via-rules-and-hooks)
- cdk prerequisites: [OPS-103](#ops-103-bootstrap-a-new-aws-account-for-cdk)
- cdk stack: [HMRC-31](#hmrc-31-wire-hmrc-lambda-handlers-into-cdk-stacks), [OPS-112](#ops-112-provision-the-api-gateway-stack)
- cdk synth: [OPS-06](#ops-06-run-the-full-deployment-pipeline), [OPS-08](#ops-08-deploy-a-single-cdk-stack-on-demand)
- cdn allowlist: [OPS-96](#ops-96-scan-pages-for-accessibility-violations)
- cdp screencast: [DEV-40](#dev-40-record-a-product-demo-video)
- certbot deploy hook: [DEV-15](#dev-15-fetch-and-publish-proxy-variant-secrets)
- certificate expiry: [OPS-37](#ops-37-check-https-certificate-expiry), [OPS-130](#ops-130-track-runtime-and-dependency-lifecycle)
- certificate publish: [DEV-15](#dev-15-fetch-and-publish-proxy-variant-secrets)
- certificate renewal: [OPS-49](#ops-49-request-and-renew-the-holding-page-certificate)
- cfnnamedquery: [DATA-10](#data-10-create-or-replace-athena-business-views)
- change of address: [CH-05](#ch-05-file-a-change-of-registered-office-address)
- change of email: [CH-06](#ch-06-file-a-change-of-registered-email-address)
- changed files: [OPS-91](#ops-91-validate-video-scene-scripts-and-timing)
- channel: [DEV-41](#dev-41-publish-videos-to-the-youtube-channel)
- channel as code: [DATA-46](#data-46-configure-the-youtube-channel-as-code)
- channel handle: [DATA-46](#data-46-configure-the-youtube-channel-as-code)
- channel state: [OPS-53](#ops-53-verify-youtube-channel-consistency-weekly)
- charge reference: [DEV-08](#dev-08-simulate-hmrc-vat-mtd-api)
- charges: [DATA-09](#data-09-reconcile-stripe-payments-into-the-lake)
- chat routing: [OPS-70](#ops-70-forward-operational-activity-events-to-telegram)
- check pass: [BILL-08](#bill-08-check-a-passs-validity)
- checkip: [HMRC-25](#hmrc-25-build-hmrc-fraud-prevention-headers)
- checkout: [BILL-24](#bill-24-create-a-stripe-checkout-session)
- checkout lambda: [BILL-37](#bill-37-cdk-billing-app-stack)
- checkout session: [BILL-25](#bill-25-retrieve-a-stripe-checkout-sessions-status)
- checkout.session.completed: [BILL-28](#bill-28-process-stripe-webhook-events)
- checkpass: [BILL-08](#bill-08-check-a-passs-validity)
- checkpoint: [HMRC-34](#hmrc-34-file-a-full-itsa-tax-year-in-sandbox)
- ci apex: [OPS-05](#ops-05-promote-a-ci-deployment-to-the-ci-apex)
- ci branch deploys: [OPS-61](#ops-61-design-ci-branch-deploys-off-the-apex)
- ci deployments: [DEV-27](#dev-27-render-the-open-work-board)
- ci failure react: [DEV-31](#dev-31-watch-github-ci-to-green)
- ci monitoring: [OPS-134](#ops-134-monitor-github-actions-ci-from-the-cli)
- ci or prod: [OPS-02](#ops-02-derive-environment-and-deployment-names-from-a-branch)
- ci slot: [OPS-10](#ops-10-claim-release-and-track-a-ci-deployment-slot)
- ci-set: [OPS-05](#ops-05-promote-a-ci-deployment-to-the-ci-apex), [OPS-10](#ops-10-claim-release-and-track-a-ci-deployment-slot)
- cis benchmark: [OPS-121](#ops-121-provision-the-security-baseline-stack)
- citation references: [DEV-26](#dev-26-enforce-claude-code-conventions-via-rules-and-hooks)
- claim slot: [OPS-10](#ops-10-claim-release-and-track-a-ci-deployment-slot)
- class 4 nic: [HMRC-18](#hmrc-18-manage-itsa-tax-liability-adjustments)
- claude -p: [OPS-18](#ops-18-run-alarm-and-support-triage)
- claude review: [OPS-31](#ops-31-run-a-claude-security-review-on-push)
- claude rules: [DEV-26](#dev-26-enforce-claude-code-conventions-via-rules-and-hooks)
- clean: [DEV-34](#dev-34-clean-up-stale-deployments-and-branches)
- clean build: [DEV-22](#dev-22-clean-and-update-local-build-state)
- cleanup test users: [OPS-12](#ops-12-clean-up-expired-test-users)
- cli: [BILL-11](#bill-11-generate-admin-passes-from-cli-or-workflow)
- click-through: [DEV-11](#dev-11-practice-the-vat-journey-in-the-browser-embedded-simulator)
- client: [BILL-12](#bill-12-invite-a-client-to-authorise-agent-access), [BILL-13](#bill-13-check-a-clients-authorisation-status), [BILL-14](#bill-14-cancel-a-pending-client-authorisation-invite), [BILL-15](#bill-15-move-a-book-to-a-client)
- client fetch: [DEV-12](#dev-12-prove-the-client-status-stack-and-fetchauth)
- client id: [HMRC-32](#hmrc-32-register-and-verify-hmrc-developer-hub-application-config), [CH-02](#ch-02-verify-the-companies-house-oauth-app-configuration)
- client relationship: [DEV-05](#dev-05-simulate-hmrc-agent-authorisation-and-fraud-prevention-headers)
- client roster: [BILL-16](#bill-16-manage-practice-clients)
- client secret: [HMRC-23](#hmrc-23-exchange-an-hmrc-oauth-code-for-a-token)
- client_authorisation_status: [MCP-08](#mcp-08-manage-practice-clients-and-hmrc-agent-authorisation)
- client_credentials: [DEV-03](#dev-03-simulate-hmrc-oauth)
- cloud book: [MCP-03](#mcp-03-load-and-save-diya-gl-books-via-mcp)
- cloudformation: [OPS-136](#ops-136-retrieve-cloudformation-stack-outputs)
- cloudformation drift: [OPS-07](#ops-07-lean-deploy-app-code-to-lambda-and-s3), [OPS-32](#ops-32-detect-cloudformation-drift)
- cloudfront: [OPS-03](#ops-03-look-up-aws-resources-by-domain-convention), [OPS-115](#ops-115-provision-the-edgecloudfront-stack), [DEV-10](#dev-10-deploy-the-public-demo-simulator)
- cloudfront access logs: [DATA-13](#data-13-catalogue-cloudfront-access-logs-for-athena)
- cloudfront alias: [OPS-04](#ops-04-update-route53cloudfront-origins-for-a-domain), [OPS-127](#ops-127-upsert-route53-alias-records-via-custom-resource)
- cloudfront cutover: [OPS-05](#ops-05-promote-a-ci-deployment-to-the-ci-apex)
- cloudfront distribution: [OPS-116](#ops-116-provision-the-holding-page-stack)
- cloudfront distribution id: [OPS-135](#ops-135-look-up-domains-and-cloudfront-distributions)
- cloudfront edge: [OPS-131](#ops-131-serve-cloudfront-custom-error-pages)
- cloudfront event: [DEV-18](#dev-18-provide-shared-unitsystem-test-fixtures)
- cloudfront invalidation: [OPS-07](#ops-07-lean-deploy-app-code-to-lambda-and-s3), [OPS-120](#ops-120-provision-the-publish-stack)
- cloudfront logs: [OPS-73](#ops-73-detect-404-scan-rate-attacks)
- cloudfront metrics: [OPS-118](#ops-118-provision-the-observability-stack-in-us-east-1)
- cloudfront waf: [OPS-74](#ops-74-detect-waf-blocked-scan-attacks)
- cloudtrail: [OPS-117](#ops-117-provision-the-observability-stack)
- cloudtrail data events: [OPS-122](#ops-122-provision-the-security-detection-stack)
- cloudwatch alarm: [OPS-71](#ops-71-create-github-issues-from-cloudwatch-alarms), [DATA-03](#data-03-transform-alarm-state-changes-into-lake-rows)
- cloudwatch alarm ok: [OPS-21](#ops-21-auto-close-resolved-alarm-issues)
- cloudwatch console: [OPS-80](#ops-80-build-aws-console-deep-links-for-operators)
- cloudwatch custom metric: [DATA-21](#data-21-publish-nightly-business-metrics-to-cloudwatch)
- cloudwatch dashboard: [DATA-21](#data-21-publish-nightly-business-metrics-to-cloudwatch)
- cloudwatch logs: [OPS-86](#ops-86-provide-structured-pii-redacting-logging)
- cloudwatch logs v2 delivery: [DATA-13](#data-13-catalogue-cloudfront-access-logs-for-athena)
- cloudwatch metrics: [OPS-83](#ops-83-emit-cloudwatch-emf-metrics)
- cloudwatch rum: [DATA-25](#data-25-configure-and-gate-cloudwatch-rum)
- co-authored-by claude: [DATA-07](#data-07-pull-github-operator-effort-data)
- codeql: [OPS-30](#ops-30-run-codeql-security-scanning)
- coding agent: [OPS-55](#ops-55-configure-github-copilot-review-and-workspace-setup)
- cognito: [SITE-01](#site-01-sign-customers-in-via-cognito), [BILL-34](#bill-34-prefetch-and-retry-a-cognito-token-refresh), [OPS-110](#ops-110-force-logout-all-users-during-a-security-incident), [MCP-02](#mcp-02-authenticate-mcp-sessions-via-cognito), [DEV-16](#dev-16-manage-the-durable-cognito-test-user-lifecycle)
- cognito client id: [DATA-44](#data-44-assert-google-oauth-client-configuration)
- cognito export: [OPS-137](#ops-137-export-cognito-users-for-reporting-or-backup)
- cognito test user: [BILL-11](#bill-11-generate-admin-passes-from-cli-or-workflow), [OPS-12](#ops-12-clean-up-expired-test-users), [OPS-15](#ops-15-serialize-lane-test-user-rotation-jobs), [OPS-68](#ops-68-provision-and-assume-roles-for-test-user-provisioning)
- cognito user pool: [OPS-03](#ops-03-look-up-aws-resources-by-domain-convention)
- cognito-registered host: [OPS-10](#ops-10-claim-release-and-track-a-ci-deployment-slot)
- cold start: [SITE-13](#site-13-warm-backend-routes-via-prefetch-scripts)
- commit identity: [OPS-28](#ops-28-enforce-commit-identity-allowlist)
- commit identity allowlist: [DEV-22](#dev-22-clean-and-update-local-build-state)
- commit identity controls: [OPS-63](#ops-63-report-identity-audit-findings)
- commit signatures: [OPS-29](#ops-29-verify-commit-signatures-on-pull-requests)
- commits: [DATA-07](#data-07-pull-github-operator-effort-data)
- companies house: [CH-01](#ch-01-exchange-a-companies-house-oauth-token), [CH-02](#ch-02-verify-the-companies-house-oauth-app-configuration), [CH-03](#ch-03-search-the-companies-house-register), [CH-04](#ch-04-fetch-a-company-profile), [CH-05](#ch-05-file-a-change-of-registered-office-address), [CH-06](#ch-06-file-a-change-of-registered-email-address), [CH-07](#ch-07-preview-micro-entity-accounts-before-filing), [CH-08](#ch-08-file-micro-entity-accounts-to-companies-house), [CH-09](#ch-09-query-and-submit-document-transactions), [CH-10](#ch-10-fetch-http-with-a-timeout), [CH-12](#ch-12-generate-synthetic-test-companies), [CH-13](#ch-13-map-the-frc-ixbrl-taxonomy-and-validate-accounts), [CH-14](#ch-14-provision-the-companies-house-cdk-stack), [OPS-35](#ops-35-verify-third-party-console-configuration-against-declared-state), [MCP-04](#mcp-04-derive-micro-entity-accounts-figures-for-companies-house-filing), [DEV-04](#dev-04-simulate-companies-house-identity-and-filing)
- companies house accounts: [MCP-07](#mcp-07-file-vat-returns-and-accounts-via-api)
- company background page: [SITE-11](#site-11-promote-sibling-products-and-partners)
- company number: [CH-04](#ch-04-fetch-a-company-profile)
- company package: [MCP-11](#mcp-11-seed-a-book-from-a-workbook-set)
- company profile: [CH-04](#ch-04-fetch-a-company-profile)
- company search: [CH-03](#ch-03-search-the-companies-house-register), [DEV-04](#dev-04-simulate-companies-house-identity-and-filing)
- competitor analysis: [SITE-20](#site-20-document-business-governance-and-positioning)
- compliance accessibility: [DATA-14](#data-14-catalogue-compliance-findings-for-the-dashboard)
- compliance check: [OPS-38](#ops-38-run-the-weekly-compliance-test-check)
- compliance dashboard: [HMRC-26](#hmrc-26-monitor-hmrc-fraud-prevention-header-compliance)
- compliance fraud headers: [DATA-14](#data-14-catalogue-compliance-findings-for-the-dashboard)
- compliance panel: [OPS-38](#ops-38-run-the-weekly-compliance-test-check), [DATA-14](#data-14-catalogue-compliance-findings-for-the-dashboard)
- compliance report: [OPS-97](#ops-97-compile-the-compliance-audit-report)
- compliance rows: [OPS-95](#ops-95-generate-wcag-accessibility-compliance-rows)
- compliance status: [DATA-29](#data-29-sql-views-submission-and-compliance)
- compliance.toml: [OPS-38](#ops-38-run-the-weekly-compliance-test-check)
- concat demuxer: [OPS-90](#ops-90-encode-captured-video-frames-and-captions)
- concatenate modules: [BILL-43](#bill-43-build-the-frontend-test-bundle)
- concepts fixture: [CH-13](#ch-13-map-the-frc-ixbrl-taxonomy-and-validate-accounts)
- concurrency group: [OPS-15](#ops-15-serialize-lane-test-user-rotation-jobs)
- config composition: [OPS-126](#ops-126-provide-config-composition-helpers-for-cdk-code)
- config validation: [OPS-84](#ops-84-validate-required-environment-variables-at-startup)
- consent banner: [SITE-15](#site-15-show-and-persist-cookie-consent)
- consent denied default: [DATA-24](#data-24-load-ga4-analytics-on-site-pages)
- consent mode: [SITE-15](#site-15-show-and-persist-cookie-consent)
- consent.rum: [DATA-25](#data-25-configure-and-gate-cloudwatch-rum)
- console links: [OPS-76](#ops-76-gather-alarm-evidence-for-investigation), [OPS-80](#ops-80-build-aws-console-deep-links-for-operators)
- consume token: [BILL-33](#bill-33-enforce-and-consume-activity-tokens)
- continuous backups: [OPS-132](#ops-132-enable-dynamodb-pitr-on-deploy)
- contrast: [OPS-95](#ops-95-generate-wcag-accessibility-compliance-rows)
- conversion actions: [DATA-33](#data-33-read-the-google-ads-account-inventory)
- conversion goal: [DATA-32](#data-32-sync-the-google-ads-account)
- conversion value: [DATA-34](#data-34-report-google-ads-campaign-performance)
- conversions: [DATA-34](#data-34-report-google-ads-campaign-performance)
- cookie consent: [SITE-15](#site-15-show-and-persist-cookie-consent)
- cool-down: [DEV-35](#dev-35-cool-down-an-overloaded-batch)
- coordinator model: [DEV-28](#dev-28-work-nextmd-as-dispatched-sub-agents)
- copilot instructions: [OPS-55](#ops-55-configure-github-copilot-review-and-workspace-setup)
- copilot review: [OPS-55](#ops-55-configure-github-copilot-review-and-workspace-setup)
- copilot workspace setup: [OPS-55](#ops-55-configure-github-copilot-review-and-workspace-setup)
- copy secrets: [OPS-106](#ops-106-replicate-secrets-across-aws-accounts)
- copyright header: [DEV-20](#dev-20-check-spdx-licence-headers)
- corpus cli: [MCP-12](#mcp-12-read-invoices-from-the-local-mail-index)
- corpus index: [DATA-20](#data-20-publish-the-nightly-raw-export-for-indexing)
- correlation headers: [SITE-07](#site-07-format-http-responses-and-errors)
- correlation id: [SITE-17](#site-17-trace-and-secure-client-requests)
- cors: [DEV-07](#dev-07-simulate-the-public-demos-billing-and-oauth)
- cost alert: [OPS-72](#ops-72-forward-bedrock-budget-alerts), [DATA-16](#data-16-alert-on-cost-budget-and-anomaly-thresholds)
- cost allocation tags: [OPS-125](#ops-125-name-and-tag-cdk-resources-consistently), [DATA-08](#data-08-copy-the-aws-focus-cost-export)
- cost anomaly detection: [DATA-16](#data-16-alert-on-cost-budget-and-anomaly-thresholds)
- cost daily: [DATA-30](#data-30-sql-views-cost)
- cost export bucket: [DATA-17](#data-17-export-aws-billing-data-in-focus-format)
- cost optimisation: [OPS-59](#ops-59-track-and-analyze-aws-spending)
- cost per session: [DATA-36](#data-36-answer-google-ads-questions-from-live-data)
- cost per submission: [DATA-30](#data-30-sql-views-cost)
- cost tracking: [OPS-59](#ops-59-track-and-analyze-aws-spending)
- cost vs target: [DATA-30](#data-30-sql-views-cost)
- cost-copy role: [DATA-17](#data-17-export-aws-billing-data-in-focus-format)
- countactiveallocations: [BILL-05](#bill-05-reconcile-bundle-capacity-counters)
- country change: [SITE-02](#site-02-verify-jwts-at-the-api-gateway)
- coverage thresholds: [DEV-23](#dev-23-configure-the-test-and-lint-toolchains)
- cpc: [DATA-34](#data-34-report-google-ads-campaign-performance)
- crawler: [SITE-04](#site-04-track-visits-via-session-beacon)
- create or replace view: [DATA-10](#data-10-create-or-replace-athena-business-views)
- create-secrets: [OPS-09](#ops-09-deploy-environment-stacks-and-populate-secrets)
- create-test-user: [DEV-06](#dev-06-simulate-hmrc-test-user-provisioning-and-api-docs)
- create-test-user api: [OPS-66](#ops-66-create-an-hmrc-sandbox-test-user)
- createinvitation: [BILL-12](#bill-12-invite-a-client-to-authorise-agent-access)
- createpass: [BILL-06](#bill-06-generate-a-token-charged-pass), [BILL-07](#bill-07-admin-issue-a-pass)
- creation order: [OPS-11](#ops-11-queue-ci-branch-deploys-in-creation-order)
- creationtime: [OPS-13](#ops-13-auto-destroy-stale-ci-deployments)
- credential leak: [OPS-92](#ops-92-redact-secrets-from-video-artefacts)
- credentials.json: [MCP-02](#mcp-02-authenticate-mcp-sessions-via-cognito)
- credit note: [DATA-51](#data-51-turn-staged-stripe-activity-into-diya-gl-lines)
- cross-account backup: [OPS-50](#ops-50-drill-and-test-pitr-database-restoration), [OPS-111](#ops-111-provision-cross-account-backup-vaults-and-plans)
- cross-account copy: [OPS-48](#ops-48-verify-backup-health-daily)
- cross-account copyobject: [DATA-08](#data-08-copy-the-aws-focus-cost-export)
- cross-account hold: [OPS-64](#ops-64-runbook-information-security-operations)
- cross-account iam: [OPS-104](#ops-104-set-up-cross-account-backup-iam-roles)
- cross-account restore: [OPS-109](#ops-109-disaster-recovery-restore-into-a-new-prod-account)
- cross-account secrets: [OPS-106](#ops-106-replicate-secrets-across-aws-accounts)
- cross-account trust: [OPS-98](#ops-98-bootstrap-the-cdk-toolkit-across-accounts)
- cross-client move: [BILL-23](#bill-23-store-diya-gl-books-in-s3)
- cross-domain session: [DATA-24](#data-24-load-ga4-analytics-on-site-pages)
- cross-sell: [SITE-11](#site-11-promote-sibling-products-and-partners)
- crud: [BILL-16](#bill-16-manage-practice-clients)
- crystallisation: [HMRC-20](#hmrc-20-retrieve-itsa-crystallisation-obligations), [HMRC-21](#hmrc-21-submit-the-itsa-final-declaration), [DEV-09](#dev-09-simulate-hmrc-itsa-mtd-api)
- csp header: [SITE-08](#site-08-bootstrap-the-app-server)
- csv export: [OPS-137](#ops-137-export-cognito-users-for-reporting-or-backup)
- csv import: [HMRC-08](#hmrc-08-parse-vat-returns-from-a-bulk-csv-file)
- csv per view: [DATA-20](#data-20-publish-the-nightly-raw-export-for-indexing)
- ctr: [DATA-34](#data-34-report-google-ads-campaign-performance)
- cumulative model: [HMRC-12](#hmrc-12-submit-and-manage-self-employment-periodic-updates), [HMRC-14](#hmrc-14-submit-and-manage-uk-property-periodic-updates), [HMRC-27](#hmrc-27-validate-hmrc-identifiers-dates-and-amounts), [HMRC-34](#hmrc-34-file-a-full-itsa-tax-year-in-sandbox)
- curated cost: [DATA-08](#data-08-copy-the-aws-focus-cost-export)
- curated stripe: [DATA-09](#data-09-reconcile-stripe-payments-into-the-lake)
- custom error page: [OPS-131](#ops-131-serve-cloudfront-custom-error-pages)
- custom resource: [OPS-132](#ops-132-enable-dynamodb-pitr-on-deploy)
- customer id hashing: [DATA-09](#data-09-reconcile-stripe-payments-into-the-lake)
- customer lookup: [DEV-42](#dev-42-look-up-a-vat-submission-failure-alarms-customer)
- customer portal: [BILL-26](#bill-26-open-the-stripe-customer-billing-portal)
- daily budget: [OPS-79](#ops-79-track-an-alarm-familys-daily-remedy-budget), [DATA-35](#data-35-forecast-google-ads-keyword-performance)
- daily cap: [OPS-20](#ops-20-enforce-daily-run-budgets-for-agent-paths)
- daily check: [OPS-48](#ops-48-verify-backup-health-daily)
- dashboard: [HMRC-09](#hmrc-09-retrieve-itsa-business-details)
- dashboard snapshot: [DATA-18](#data-18-publish-the-nightly-operator-dashboard-snapshot)
- dashboards: [OPS-117](#ops-117-provision-the-observability-stack)
- data export: [OPS-41](#ops-41-export-a-customers-gdpr-subject-access-data)
- data masking: [OPS-81](#ops-81-mask-and-redact-sensitive-data-from-logs)
- data migration: [OPS-16](#ops-16-run-dynamodb-data-migrations)
- data protection: [OPS-42](#ops-42-guide-icogdpr-compliance)
- data stack: [OPS-113](#ops-113-provision-the-dynamodb-and-s3-data-stack)
- data streams: [DATA-38](#data-38-sync-ga4-properties-streams-and-key-events)
- data theft alarm: [OPS-122](#ops-122-provision-the-security-detection-stack)
- data transfer: [DATA-39](#data-39-sync-ga4-in-bigquery-scheduled-queries)
- data-theft detection: [OPS-46](#ops-46-query-and-persist-per-consumer-security-state-records)
- datastack: [OPS-09](#ops-09-deploy-environment-stacks-and-populate-secrets)
- date range: [HMRC-04](#hmrc-04-retrieve-vat-liabilities), [HMRC-05](#hmrc-05-retrieve-vat-payments)
- date range match: [HMRC-28](#hmrc-28-format-and-match-hmrc-obligations)
- date utils: [BILL-42](#bill-42-parse-iso-8601-durations-for-expiry)
- dated quarters: [HMRC-12](#hmrc-12-submit-and-manage-self-employment-periodic-updates), [HMRC-14](#hmrc-14-submit-and-manage-uk-property-periodic-updates), [HMRC-34](#hmrc-34-file-a-full-itsa-tax-year-in-sandbox)
- debugger client: [DEV-02](#dev-02-simulate-local-app-oauth)
- declare and verify: [BILL-29](#bill-29-assert-the-paypal-donate-button-configuration)
- declared state: [OPS-35](#ops-35-verify-third-party-console-configuration-against-declared-state)
- dedupe: [OPS-71](#ops-71-create-github-issues-from-cloudwatch-alarms)
- deep clean: [DEV-22](#dev-22-clean-and-update-local-build-state)
- deep link: [OPS-80](#ops-80-build-aws-console-deep-links-for-operators), [DATA-18](#data-18-publish-the-nightly-operator-dashboard-snapshot)
- delegated relationship: [HMRC-24](#hmrc-24-verify-hmrc-agent-authorisation-for-a-client)
- delete book: [BILL-18](#bill-18-delete-a-diya-gl-book)
- delete bundle: [BILL-03](#bill-03-delete-a-bundle)
- delete user data: [OPS-40](#ops-40-delete-a-customers-data-for-gdpr-erasure)
- deletebook: [BILL-18](#bill-18-delete-a-diya-gl-book)
- delivery cycle: [DEV-30](#dev-30-run-the-delivery-cycle-unattended)
- demo banner: [DEV-10](#dev-10-deploy-the-public-demo-simulator)
- demo video: [OPS-52](#ops-52-auto-record-demo-videos-on-prod-deploy), [OPS-88](#ops-88-orchestrate-demo-video-recording-journeys), [DEV-40](#dev-40-record-a-product-demo-video)
- deny patterns: [OPS-17](#ops-17-redact-and-gate-unattended-agent-output-before-publishing)
- dependabot: [OPS-36](#ops-36-configure-dependabot-dependency-updates)
- dependency inventory: [OPS-39](#ops-39-generate-a-software-bill-of-materials)
- dependency tracking: [OPS-130](#ops-130-track-runtime-and-dependency-lifecycle)
- dependency update: [DEV-22](#dev-22-clean-and-update-local-build-state)
- dependency updates: [OPS-36](#ops-36-configure-dependabot-dependency-updates)
- deploy destroy run: [DATA-15](#data-15-catalogue-workflow-probe-and-agent-run-data)
- deploy environment: [OPS-09](#ops-09-deploy-environment-stacks-and-populate-secrets)
- deploy metrics row: [OPS-25](#ops-25-record-dora-and-probe-metrics)
- deploy pipeline: [OPS-06](#ops-06-run-the-full-deployment-pipeline)
- deploy validation failure: [OPS-23](#ops-23-raise-an-issue-from-a-probe-test-failure)
- deploy-app: [OPS-07](#ops-07-lean-deploy-app-code-to-lambda-and-s3)
- deploy.yml: [OPS-01](#ops-01-cancel-superseded-push-triggered-deploys)
- deployed environment: [OPS-27](#ops-27-run-probe-tests-against-deployed-environments)
- deployed site audit: [OPS-62](#ops-62-report-accessibility-penetration-testing)
- deployment lookup: [OPS-135](#ops-135-look-up-domains-and-cloudfront-distributions)
- deployment name: [OPS-02](#ops-02-derive-environment-and-deployment-names-from-a-branch)
- deployment name tag: [DATA-30](#data-30-sql-views-cost)
- deployment role: [OPS-101](#ops-101-set-up-github-oidc-deployment-roles), [OPS-103](#ops-103-bootstrap-a-new-aws-account-for-cdk)
- deployment safety conventions: [OPS-34](#ops-34-validate-github-actions-workflow-files)
- deployment slug: [DATA-03](#data-03-transform-alarm-state-changes-into-lake-rows)
- deployment sweep: [OPS-119](#ops-119-provision-the-ops-stack)
- deployment window: [OPS-77](#ops-77-silence-alarms-during-deployment-teardown)
- deployment-name: [OPS-06](#ops-06-run-the-full-deployment-pipeline)
- derive_micro_entity_accounts: [MCP-04](#mcp-04-derive-micro-entity-accounts-figures-for-companies-house-filing)
- derive_vat_return: [MCP-05](#mcp-05-derive-vat-figures-via-mcp-tools)
- describe-alarm-history: [OPS-78](#ops-78-verify-an-alarm-issues-claimed-transition)
- design document: [OPS-61](#ops-61-design-ci-branch-deploys-off-the-apex)
- destroy prod: [OPS-14](#ops-14-destroy-a-named-prod-deployment-on-demand)
- destroy stale deployments: [OPS-13](#ops-13-auto-destroy-stale-ci-deployments)
- destroy workflow: [OPS-77](#ops-77-silence-alarms-during-deployment-teardown)
- destroy-prod.yml: [OPS-14](#ops-14-destroy-a-named-prod-deployment-on-demand)
- deterministic naming: [OPS-03](#ops-03-look-up-aws-resources-by-domain-convention)
- developer hub: [CH-02](#ch-02-verify-the-companies-house-oauth-app-configuration)
- developer mode: [SITE-14](#site-14-render-page-chrome-and-widgets)
- developer onboarding: [DEV-24](#dev-24-document-developer-setup-and-repository-conventions)
- developer_token_not_approved: [DATA-35](#data-35-forecast-google-ads-keyword-performance)
- device id: [HMRC-25](#hmrc-25-build-hmrc-fraud-prevention-headers)
- digital pass: [BILL-06](#bill-06-generate-a-token-charged-pass)
- disaster recovery: [OPS-109](#ops-109-disaster-recovery-restore-into-a-new-prod-account)
- dispute: [BILL-28](#bill-28-process-stripe-webhook-events)
- dispute auto-accept: [BILL-31](#bill-31-configure-stripe-account-policies)
- distribution: [OPS-73](#ops-73-detect-404-scan-rate-attacks)
- diya-gl: [BILL-15](#bill-15-move-a-book-to-a-client), [BILL-17](#bill-17-upload-a-diya-gl-book), [BILL-18](#bill-18-delete-a-diya-gl-book), [BILL-19](#bill-19-list-a-users-diya-gl-books), [BILL-20](#bill-20-fetch-a-versioned-diya-gl-book), [BILL-21](#bill-21-sweep-lapsed-diya-gl-books), [BILL-22](#bill-22-check-diya-gl-retention-entitlement), [BILL-23](#bill-23-store-diya-gl-books-in-s3), [MCP-03](#mcp-03-load-and-save-diya-gl-books-via-mcp)
- diya-gl bank lines: [MCP-10](#mcp-10-import-a-natwest-bank-statement-into-diya-gl-lines)
- diya-gl lines: [DATA-51](#data-51-turn-staged-stripe-activity-into-diya-gl-lines), [MCP-13](#mcp-13-import-stripe-transaction-and-payout-lines)
- diya-gl stack: [BILL-39](#bill-39-cdk-diya-gl-stack)
- diya-submit-mcp: [MCP-01](#mcp-01-expose-the-submission-mcp-server-and-tools)
- diyaccounting.co.uk: [OPS-133](#ops-133-serve-the-root-domain-holding-page)
- do-next: [DEV-28](#dev-28-work-nextmd-as-dispatched-sub-agents)
- do-next agent: [OPS-57](#ops-57-dispatch-agentic-lib-board-backlog-and-pr-agents)
- do-next-ci: [DEV-25](#dev-25-maintain-the-specialist-agent-prompt-library)
- docker image: [OPS-51](#ops-51-publish-build-artifacts-and-documentation), [OPS-114](#ops-114-provision-ecr-image-repositories)
- document client: [OPS-82](#ops-82-provide-a-shared-dynamodb-client)
- document submission: [CH-09](#ch-09-query-and-submit-document-transactions)
- dom helpers: [SITE-14](#site-14-render-page-chrome-and-widgets)
- domain convention: [OPS-03](#ops-03-look-up-aws-resources-by-domain-convention)
- domain cutover: [OPS-04](#ops-04-update-route53cloudfront-origins-for-a-domain)
- domain url: [OPS-02](#ops-02-derive-environment-and-deployment-names-from-a-branch)
- domain-scoped agent: [OPS-54](#ops-54-define-specialized-claude-code-sub-agent-personas)
- donate button: [BILL-29](#bill-29-assert-the-paypal-donate-button-configuration)
- dora metrics: [OPS-25](#ops-25-record-dora-and-probe-metrics)
- dora row: [OPS-95](#ops-95-generate-wcag-accessibility-compliance-rows)
- dora runs: [DATA-15](#data-15-catalogue-workflow-probe-and-agent-run-data)
- dora runs daily: [DATA-31](#data-31-sql-views-dora-and-operations)
- dora-row action: [DATA-15](#data-15-catalogue-workflow-probe-and-agent-run-data)
- dora_runs: [DATA-11](#data-11-run-glue-data-quality-checks)
- downloads by product: [DATA-05](#data-05-pull-ga4-daily-bigquery-aggregate-tables)
- dr drill: [OPS-109](#ops-109-disaster-recovery-restore-into-a-new-prod-account)
- draft pr scope: [OPS-22](#ops-22-verify-a-triage-draft-pr-stays-in-scope)
- drift: [BILL-05](#bill-05-reconcile-bundle-capacity-counters)
- drift detection: [OPS-32](#ops-32-detect-cloudformation-drift)
- dry run: [BILL-41](#bill-41-backfill-the-stripe-test-mode-qualifier), [OPS-16](#ops-16-run-dynamodb-data-migrations), [OPS-40](#ops-40-delete-a-customers-data-for-gdpr-erasure), [OPS-106](#ops-106-replicate-secrets-across-aws-accounts)
- dt partition: [DATA-05](#data-05-pull-ga4-daily-bigquery-aggregate-tables)
- dt partition projection: [DATA-15](#data-15-catalogue-workflow-probe-and-agent-run-data)
- due dates: [HMRC-03](#hmrc-03-retrieve-vat-obligations), [HMRC-10](#hmrc-10-retrieve-itsa-obligations)
- duplicate mechanism: [DEV-43](#dev-43-find-existing-tooling-before-building-any)
- durable user: [DEV-16](#dev-16-manage-the-durable-cognito-test-user-lifecycle)
- dynalite: [DEV-14](#dev-14-start-the-proxy-and-simulator-local-dev-environments)
- dynamodb: [HMRC-30](#hmrc-30-persist-async-hmrc-api-request-state), [CH-08](#ch-08-file-micro-entity-accounts-to-companies-house)
- dynamodb backup: [OPS-132](#ops-132-enable-dynamodb-pitr-on-deploy), [OPS-105](#ops-105-copy-production-data-to-backup-for-migration)
- dynamodb client: [OPS-82](#ops-82-provide-a-shared-dynamodb-client)
- dynamodb export: [DEV-17](#dev-17-export-and-embed-dynamodb-test-state-in-reports)
- dynamodb grants: [BILL-36](#bill-36-cdk-account-stack)
- dynamodb mock: [DEV-18](#dev-18-provide-shared-unitsystem-test-fixtures)
- dynamodb receipt: [HMRC-22](#hmrc-22-store-and-retrieve-hmrc-submission-receipts)
- dynamodb restore: [OPS-50](#ops-50-drill-and-test-pitr-database-restoration)
- dynamodb streams: [DATA-04](#data-04-stream-dynamodb-table-changes-into-the-lake)
- dynamodb tables: [OPS-113](#ops-113-provision-the-dynamodb-and-s3-data-stack), [DEV-14](#dev-14-start-the-proxy-and-simulator-local-dev-environments)
- dynamodb ttl: [SITE-09](#site-09-track-and-poll-async-api-requests), [OPS-108](#ops-108-backfill-ttl-on-existing-dynamodb-records)
- ecr repository: [OPS-114](#ops-114-provision-ecr-image-repositories)
- edge lambda: [OPS-115](#ops-115-provision-the-edgecloudfront-stack), [OPS-124](#ops-124-define-shared-lambda-cdk-constructs)
- edge stack: [OPS-115](#ops-115-provision-the-edgecloudfront-stack)
- edgestack: [DATA-13](#data-13-catalogue-cloudfront-access-logs-for-athena)
- eligibility: [CH-06](#ch-06-file-a-change-of-registered-email-address)
- email hash: [BILL-10](#bill-10-redeem-a-pass)
- email hash rotation: [OPS-43](#ops-43-rotate-stored-email-address-hashes)
- email restricted: [BILL-08](#bill-08-check-a-passs-validity)
- email-hash-rotate.js: [OPS-43](#ops-43-rotate-stored-email-address-hashes)
- emailhashsecrethelper: [OPS-43](#ops-43-rotate-stored-email-address-hashes)
- embedded metric format: [OPS-83](#ops-83-emit-cloudwatch-emf-metrics)
- emf: [OPS-83](#ops-83-emit-cloudwatch-emf-metrics)
- enable gcp apis: [DATA-40](#data-40-enable-required-google-cloud-apis)
- encryption: [OPS-113](#ops-113-provision-the-dynamodb-and-s3-data-stack)
- encryption key rotation: [OPS-43](#ops-43-rotate-stored-email-address-hashes)
- end of life: [OPS-130](#ops-130-track-runtime-and-dependency-lifecycle)
- end-to-end: [OPS-27](#ops-27-run-probe-tests-against-deployed-environments)
- enforce bundle: [BILL-04](#bill-04-enforce-bundle-entitlement-on-a-request)
- enforce tokens: [BILL-33](#bill-33-enforce-and-consume-activity-tokens)
- engagement: [SITE-03](#site-03-capture-feedback-interest)
- enhanced measurement: [DATA-38](#data-38-sync-ga4-properties-streams-and-key-events)
- ensure-cognito-test-user: [OPS-15](#ops-15-serialize-lane-test-user-rotation-jobs)
- ensuresession: [BILL-34](#bill-34-prefetch-and-retry-a-cognito-token-refresh)
- entitlement: [BILL-01](#bill-01-grant-a-bundle-to-a-user), [BILL-04](#bill-04-enforce-bundle-entitlement-on-a-request), [BILL-22](#bill-22-check-diya-gl-retention-entitlement)
- entitlement status: [BILL-35](#bill-35-load-and-query-the-productactivity-catalogue)
- entitlementfor: [BILL-22](#bill-22-check-diya-gl-retention-entitlement)
- entry point: [SITE-18](#site-18-bootstrap-the-frontend-module-bundle)
- env loader: [SITE-16](#site-16-configure-the-frontend-via-toml-and-env-libraries)
- environment app: [OPS-123](#ops-123-wire-cdk-application-entrypoints-per-account)
- environment name: [OPS-02](#ops-02-derive-environment-and-deployment-names-from-a-branch)
- environment stacks: [OPS-09](#ops-09-deploy-environment-stacks-and-populate-secrets)
- environment variables: [OPS-84](#ops-84-validate-required-environment-variables-at-startup)
- environment-level stack: [BILL-38](#bill-38-cdk-billing-webhook-stack)
- environment-scoped stack: [DATA-12](#data-12-provision-the-analytics-lake-and-athena-workgroup)
- ephemeral port: [DEV-14](#dev-14-start-the-proxy-and-simulator-local-dev-environments)
- error budget: [DATA-31](#data-31-sql-views-dora-and-operations)
- error classification: [HMRC-29](#hmrc-29-call-the-hmrc-api)
- error code mapping: [HMRC-27](#hmrc-27-validate-hmrc-identifiers-dates-and-amounts)
- error handler: [OPS-131](#ops-131-serve-cloudfront-custom-error-pages)
- error middleware: [SITE-07](#site-07-format-http-responses-and-errors)
- eslint config: [DEV-23](#dev-23-configure-the-test-and-lint-toolchains)
- etag: [SITE-16](#site-16-configure-the-frontend-via-toml-and-env-libraries)
- event builders: [DEV-18](#dev-18-provide-shared-unitsystem-test-fixtures)
- event export: [DATA-06](#data-06-pull-ga4-reports-and-bigquery-event-export)
- eventbridge: [OPS-13](#ops-13-auto-destroy-stale-ci-deployments), [OPS-70](#ops-70-forward-operational-activity-events-to-telegram), [DATA-01](#data-01-publish-activity-events-to-the-bus)
- eventbridge scheduler: [DATA-08](#data-08-copy-the-aws-focus-cost-export), [DATA-22](#data-22-orchestrate-the-nightly-ingestion-workflow)
- events_* export: [DATA-39](#data-39-sync-ga4-in-bigquery-scheduled-queries)
- evidence links: [OPS-97](#ops-97-compile-the-compliance-audit-report)
- exclude paths: [OPS-30](#ops-30-run-codeql-security-scanning)
- existing tooling: [DEV-43](#dev-43-find-existing-tooling-before-building-any)
- exit cool-down: [DEV-36](#dev-36-resume-normal-work-from-cool-down)
- expected clicks: [DATA-35](#data-35-forecast-google-ads-keyword-performance)
- experiment log: [SITE-21](#site-21-log-growth-experiments)
- expire records: [OPS-108](#ops-108-backfill-ttl-on-existing-dynamodb-records)
- expiry: [BILL-42](#bill-42-parse-iso-8601-durations-for-expiry)
- expiry window: [OPS-12](#ops-12-clean-up-expired-test-users)
- export user data: [OPS-41](#ops-41-export-a-customers-gdpr-subject-access-data)
- export wiring: [DEV-21](#dev-21-verify-module-wiring-and-repository-shape)
- exports prefix: [DATA-20](#data-20-publish-the-nightly-raw-export-for-indexing)
- express: [DEV-01](#dev-01-run-the-http-simulator-server)
- express adaptor: [SITE-06](#site-06-adapt-lambda-handlers-to-express-routes)
- express server: [SITE-08](#site-08-bootstrap-the-app-server)
- fail closed: [OPS-22](#ops-22-verify-a-triage-draft-pr-stays-in-scope), [OPS-78](#ops-78-verify-an-alarm-issues-claimed-transition)
- fail fast: [OPS-84](#ops-84-validate-required-environment-variables-at-startup)
- failed rules metric: [DATA-11](#data-11-run-glue-data-quality-checks)
- failover: [OPS-116](#ops-116-provision-the-holding-page-stack)
- false positive: [OPS-74](#ops-74-detect-waf-blocked-scan-attacks)
- faq search: [SITE-10](#site-10-serve-general-site-pages)
- favicon: [DEV-22](#dev-22-clean-and-update-local-build-state)
- feature branch hosts: [OPS-61](#ops-61-design-ci-branch-deploys-off-the-apex)
- feature flags: [SITE-16](#site-16-configure-the-frontend-via-toml-and-env-libraries)
- federated access: [DATA-42](#data-42-sync-gcp-workload-identity-and-org-policy)
- feedback: [SITE-03](#site-03-capture-feedback-interest)
- fetch: [CH-10](#ch-10-fetch-http-with-a-timeout)
- fetch mock: [DEV-18](#dev-18-provide-shared-unitsystem-test-fixtures)
- fetch wrapper: [SITE-17](#site-17-trace-and-secure-client-requests)
- fetchwithidtoken: [BILL-34](#bill-34-prefetch-and-retry-a-cognito-token-refresh)
- ffmpeg: [OPS-90](#ops-90-encode-captured-video-frames-and-captions), [DEV-40](#dev-40-record-a-product-demo-video)
- field mappings: [MCP-14](#mcp-14-document-the-submission-mcps-plan-and-tool-reference)
- field whitelist: [DATA-04](#data-04-stream-dynamodb-table-changes-into-the-lake)
- filing: [CH-05](#ch-05-file-a-change-of-registered-office-address), [CH-06](#ch-06-file-a-change-of-registered-email-address), [CH-08](#ch-08-file-micro-entity-accounts-to-companies-house)
- filing api: [CH-09](#ch-09-query-and-submit-document-transactions)
- filing base url: [CH-09](#ch-09-query-and-submit-document-transactions)
- filing callback: [CH-01](#ch-01-exchange-a-companies-house-oauth-token)
- filing periods: [HMRC-03](#hmrc-03-retrieve-vat-obligations)
- final declaration: [HMRC-10](#hmrc-10-retrieve-itsa-obligations), [HMRC-21](#hmrc-21-submit-the-itsa-final-declaration), [HMRC-34](#hmrc-34-file-a-full-itsa-tax-year-in-sandbox)
- final declaration obligation: [HMRC-20](#hmrc-20-retrieve-itsa-crystallisation-obligations)
- finance import: [MCP-10](#mcp-10-import-a-natwest-bank-statement-into-diya-gl-lines)
- finance staging path: [DATA-50](#data-50-resolve-finance-staging-directory-paths)
- find command: [DEV-43](#dev-43-find-existing-tooling-before-building-any)
- findings report: [OPS-62](#ops-62-report-accessibility-penetration-testing)
- fire and forget: [DATA-01](#data-01-publish-activity-events-to-the-bus)
- firehose putrecordbatch: [DATA-04](#data-04-stream-dynamodb-table-changes-into-the-lake)
- firehose transform: [DATA-02](#data-02-transform-activity-events-into-lake-rows), [DATA-03](#data-03-transform-alarm-state-changes-into-lake-rows)
- fixed asset register: [MCP-11](#mcp-11-seed-a-book-from-a-workbook-set)
- fixtures: [CH-12](#ch-12-generate-synthetic-test-companies), [DEV-01](#dev-01-run-the-http-simulator-server)
- flatten envelope: [DATA-02](#data-02-transform-activity-events-into-lake-rows)
- focus cost export: [DATA-08](#data-08-copy-the-aws-focus-cost-export), [DATA-30](#data-30-sql-views-cost)
- focus format: [DATA-17](#data-17-export-aws-billing-data-in-focus-format)
- force logout: [OPS-64](#ops-64-runbook-information-security-operations), [OPS-110](#ops-110-force-logout-all-users-during-a-security-incident)
- form bundle number: [DEV-08](#dev-08-simulate-hmrc-vat-mtd-api)
- forwarder: [OPS-70](#ops-70-forward-operational-activity-events-to-telegram)
- fraud header check: [DATA-14](#data-14-catalogue-compliance-findings-for-the-dashboard)
- fraud headers: [OPS-97](#ops-97-compile-the-compliance-audit-report)
- fraud prevention compliance: [HMRC-26](#hmrc-26-monitor-hmrc-fraud-prevention-header-compliance)
- fraud prevention header: [OPS-47](#ops-47-check-fraud-prevention-header-record-freshness)
- fraud prevention headers: [HMRC-01](#hmrc-01-submit-a-vat-return), [HMRC-25](#hmrc-25-build-hmrc-fraud-prevention-headers), [HMRC-35](#hmrc-35-spike-test-the-itsa-sandbox-oauth-and-business-details-flow), [DEV-05](#dev-05-simulate-hmrc-agent-authorisation-and-fraud-prevention-headers)
- frc taxonomy: [CH-13](#ch-13-map-the-frc-ixbrl-taxonomy-and-validate-accounts)
- fresh project bootstrap: [DATA-40](#data-40-enable-required-google-cloud-apis)
- frontend bundle: [BILL-43](#bill-43-build-the-frontend-test-bundle)
- frs 102: [CH-13](#ch-13-map-the-frc-ixbrl-taxonomy-and-validate-accounts)
- frs 105: [CH-07](#ch-07-preview-micro-entity-accounts-before-filing), [CH-13](#ch-13-map-the-frc-ixbrl-taxonomy-and-validate-accounts), [MCP-04](#mcp-04-derive-micro-entity-accounts-figures-for-companies-house-filing)
- full deploy: [OPS-06](#ops-06-run-the-full-deployment-pipeline)
- full tax year: [HMRC-34](#hmrc-34-file-a-full-itsa-tax-year-in-sandbox)
- fullscreen: [OPS-94](#ops-94-play-demo-videos-on-the-public-site)
- funding links: [OPS-56](#ops-56-structure-github-issues-prs-and-funding-links)
- funnel steps: [DATA-05](#data-05-pull-ga4-daily-bigquery-aggregate-tables)
- ga4: [SITE-15](#site-15-show-and-persist-cookie-consent)
- ga4 ads link: [DATA-33](#data-33-read-the-google-ads-account-inventory)
- ga4 analytics admin access: [DATA-45](#data-45-apply-ga4-and-gcp-iam-role-bindings)
- ga4 bigquery: [DATA-05](#data-05-pull-ga4-daily-bigquery-aggregate-tables)
- ga4 bigquery sync: [DATA-39](#data-39-sync-ga4-in-bigquery-scheduled-queries)
- ga4 data api: [DATA-06](#data-06-pull-ga4-reports-and-bigquery-event-export)
- ga4 funnel: [DATA-27](#data-27-sql-views-activity-and-traffic)
- ga4 infrastructure: [OPS-67](#ops-67-apply-google-cloud--ga4-infrastructure)
- ga4 inventory: [DATA-43](#data-43-read-the-google-cloud-and-ga4-inventory)
- ga4 measurement id: [DATA-24](#data-24-load-ga4-analytics-on-site-pages)
- ga4 property sync: [DATA-38](#data-38-sync-ga4-properties-streams-and-key-events)
- ga4 purchase query: [DEV-19](#dev-19-provide-shared-behaviour-test-fixtures-and-steps)
- ga4 service account: [DATA-37](#data-37-federate-lambda-credentials-to-google-cloud)
- gap analysis: [HMRC-37](#hmrc-37-plan-the-hmrc-mtd-vat-and-itsa-rollout)
- gate probes: [OPS-24](#ops-24-gate-probes-on-the-main-apex-deploy)
- gcp billing budget: [DATA-41](#data-41-assert-gcp-billing-budget-and-stray-project)
- gcp iam bindings: [DATA-45](#data-45-apply-ga4-and-gcp-iam-role-bindings)
- gdpr erasure: [OPS-40](#ops-40-delete-a-customers-data-for-gdpr-erasure)
- gdpr subject access: [OPS-41](#ops-41-export-a-customers-gdpr-subject-access-data)
- generate pass: [BILL-06](#bill-06-generate-a-token-charged-pass), [BILL-11](#bill-11-generate-admin-passes-from-cli-or-workflow)
- generated documentation: [OPS-51](#ops-51-publish-build-artifacts-and-documentation)
- geo state: [OPS-46](#ops-46-query-and-persist-per-consumer-security-state-records)
- get /api/v1/companies-house/company: [CH-04](#ch-04-fetch-a-company-profile)
- get /api/v1/companies-house/search: [CH-03](#ch-03-search-the-companies-house-register)
- get snapshot: [DATA-19](#data-19-serve-the-operator-dashboard-snapshot-via-the-api)
- get vat return: [HMRC-02](#hmrc-02-retrieve-a-submitted-vat-return)
- get version: [BILL-20](#bill-20-fetch-a-versioned-diya-gl-book)
- get-names: [OPS-02](#ops-02-derive-environment-and-deployment-names-from-a-branch)
- get_vat_receipt: [MCP-07](#mcp-07-file-vat-returns-and-accounts-via-api)
- getpassesbyissuer: [BILL-09](#bill-09-list-a-users-issued-passes)
- getqueryexecution: [DATA-10](#data-10-create-or-replace-athena-business-views)
- git-common-dir: [DATA-50](#data-50-resolve-finance-staging-directory-paths)
- github actions: [OPS-134](#ops-134-monitor-github-actions-ci-from-the-cli)
- github actions role: [OPS-101](#ops-101-set-up-github-oidc-deployment-roles)
- github actions runs: [DATA-07](#data-07-pull-github-operator-effort-data)
- github api: [OPS-85](#ops-85-obtain-and-use-github-app-api-tokens)
- github app: [SITE-05](#site-05-submit-support-tickets)
- github app token: [OPS-85](#ops-85-obtain-and-use-github-app-api-tokens), [DATA-07](#data-07-pull-github-operator-effort-data)
- github ci: [DEV-31](#dev-31-watch-github-ci-to-green)
- github copilot: [OPS-55](#ops-55-configure-github-copilot-review-and-workspace-setup)
- github environment variable: [DATA-38](#data-38-sync-ga4-properties-streams-and-key-events)
- github helpers: [OPS-85](#ops-85-obtain-and-use-github-app-api-tokens)
- github issue: [SITE-05](#site-05-submit-support-tickets), [OPS-71](#ops-71-create-github-issues-from-cloudwatch-alarms)
- github settings: [OPS-35](#ops-35-verify-third-party-console-configuration-against-declared-state)
- github setup: [OPS-60](#ops-60-guide-github-repository-configuration)
- glacier: [OPS-128](#ops-128-generate-s3-lifecycle-rules-for-storage-tiering)
- global service alarms: [OPS-118](#ops-118-provision-the-observability-stack-in-us-east-1)
- global sign-out: [OPS-110](#ops-110-force-logout-all-users-during-a-security-incident)
- glue athena: [OPS-73](#ops-73-detect-404-scan-rate-attacks), [OPS-75](#ops-75-run-nightly-security-lake-analysis)
- glue data quality: [DATA-11](#data-11-run-glue-data-quality-checks)
- glue database: [DATA-12](#data-12-provision-the-analytics-lake-and-athena-workgroup)
- glue table: [DATA-13](#data-13-catalogue-cloudfront-access-logs-for-athena)
- google ads forecast: [DATA-35](#data-35-forecast-google-ads-keyword-performance)
- google ads inventory: [DATA-33](#data-33-read-the-google-ads-account-inventory)
- google ads report: [DATA-34](#data-34-report-google-ads-campaign-performance)
- google ads sync: [DATA-32](#data-32-sync-the-google-ads-account)
- google auth helper: [DATA-47](#data-47-authenticate-google-cloud-scripts-via-federated-credentials)
- google cloud apply: [OPS-67](#ops-67-apply-google-cloud--ga4-infrastructure)
- google cloud inventory: [DATA-43](#data-43-read-the-google-cloud-and-ga4-inventory)
- google sts: [DATA-37](#data-37-federate-lambda-credentials-to-google-cloud)
- google-apply workflow: [DATA-40](#data-40-enable-required-google-cloud-apis)
- google_application_credentials: [DATA-47](#data-47-authenticate-google-cloud-scripts-via-federated-credentials)
- gov-client: [HMRC-25](#hmrc-25-build-hmrc-fraud-prevention-headers), [DEV-05](#dev-05-simulate-hmrc-agent-authorisation-and-fraud-prevention-headers)
- gov-client header: [DEV-18](#dev-18-provide-shared-unitsystem-test-fixtures)
- gov-test-scenario: [DEV-08](#dev-08-simulate-hmrc-vat-mtd-api)
- gov-vendor: [HMRC-25](#hmrc-25-build-hmrc-fraud-prevention-headers), [DEV-05](#dev-05-simulate-hmrc-agent-authorisation-and-fraud-prevention-headers)
- govtalk: [CH-08](#ch-08-file-micro-entity-accounts-to-companies-house), [CH-11](#ch-11-parse-xml-safely), [DEV-04](#dev-04-simulate-companies-house-identity-and-filing)
- gpg signing: [OPS-29](#ops-29-verify-commit-signatures-on-pull-requests)
- grace period: [BILL-21](#bill-21-sweep-lapsed-diya-gl-books)
- grant: [BILL-01](#bill-01-grant-a-bundle-to-a-user)
- grant flow: [DEV-03](#dev-03-simulate-hmrc-oauth)
- grantbundle: [BILL-01](#bill-01-grant-a-bundle-to-a-user)
- green build: [DEV-31](#dev-31-watch-github-ci-to-green)
- gross fee net: [DATA-49](#data-49-stage-stripe-transactions-for-reconciliation)
- grouping strategy: [OPS-36](#ops-36-configure-dependabot-dependency-updates)
- growth experiments: [SITE-21](#site-21-log-growth-experiments)
- gtag.js: [DATA-24](#data-24-load-ga4-analytics-on-site-pages)
- guard main push: [DEV-26](#dev-26-enforce-claude-code-conventions-via-rules-and-hooks)
- guardduty: [OPS-75](#ops-75-run-nightly-security-lake-analysis), [OPS-117](#ops-117-provision-the-observability-stack)
- guardrail: [OPS-17](#ops-17-redact-and-gate-unattended-agent-output-before-publishing)
- guest role: [DATA-25](#data-25-configure-and-gate-cloudwatch-rum)
- gyb mail mirror: [HMRC-26](#hmrc-26-monitor-hmrc-fraud-prevention-header-compliance)
- haiku: [OPS-18](#ops-18-run-alarm-and-support-triage)
- halt triage: [OPS-19](#ops-19-kill-switch-to-stop-unattended-agent-workflows)
- hard failure: [OPS-92](#ops-92-redact-secrets-from-video-artefacts)
- hashed sub: [BILL-40](#bill-40-migrate-the-hashed-sub-salt), [OPS-40](#ops-40-delete-a-customers-data-for-gdpr-erasure), [DATA-01](#data-01-publish-activity-events-to-the-bus)
- hashedsub: [DEV-42](#dev-42-look-up-a-vat-submission-failure-alarms-customer)
- hastokensforactivity: [BILL-33](#bill-33-enforce-and-consume-activity-tokens)
- head request: [SITE-13](#site-13-warm-backend-routes-via-prefetch-scripts)
- header check: [DEV-20](#dev-20-check-spdx-licence-headers)
- header footer diagram: [SITE-12](#site-12-map-the-site-structure)
- header injection: [DEV-20](#dev-20-check-spdx-licence-headers)
- header nav footer: [SITE-14](#site-14-render-page-chrome-and-widgets)
- header validation: [DEV-05](#dev-05-simulate-hmrc-agent-authorisation-and-fraud-prevention-headers)
- headless: [HMRC-33](#hmrc-33-drive-hmrcs-sandbox-authorisation-flow-for-test-scripts)
- health alarm: [OPS-124](#ops-124-define-shared-lambda-cdk-constructs)
- health canary: [OPS-119](#ops-119-provision-the-ops-stack)
- help page: [SITE-10](#site-10-serve-general-site-pages)
- help page form: [SITE-05](#site-05-submit-support-tickets)
- hmac hash: [OPS-44](#ops-44-hash-and-rotate-the-subject-id-salt)
- hmrc: [BILL-12](#bill-12-invite-a-client-to-authorise-agent-access), [BILL-13](#bill-13-check-a-clients-authorisation-status), [BILL-14](#bill-14-cancel-a-pending-client-authorisation-invite), [OPS-35](#ops-35-verify-third-party-console-configuration-against-declared-state)
- hmrc access token: [MCP-07](#mcp-07-file-vat-returns-and-accounts-via-api)
- hmrc api request: [HMRC-30](#hmrc-30-persist-async-hmrc-api-request-state)
- hmrc compliance record: [OPS-47](#ops-47-check-fraud-prevention-header-record-freshness)
- hmrc developer hub: [HMRC-32](#hmrc-32-register-and-verify-hmrc-developer-hub-application-config)
- hmrc endpoints: [OPS-112](#ops-112-provision-the-api-gateway-stack)
- hmrc failures by class: [DATA-29](#data-29-sql-views-submission-and-compliance)
- hmrc http client: [HMRC-29](#hmrc-29-call-the-hmrc-api)
- hmrc itsa stack: [HMRC-31](#hmrc-31-wire-hmrc-lambda-handlers-into-cdk-stacks)
- hmrc itsa status api: [HMRC-11](#hmrc-11-retrieve-itsa-status)
- hmrc marketing rules: [SITE-20](#site-20-document-business-governance-and-positioning)
- hmrc mtd journey: [OPS-97](#ops-97-compile-the-compliance-audit-report)
- hmrc oauth: [DEV-03](#dev-03-simulate-hmrc-oauth)
- hmrc production approval: [HMRC-37](#hmrc-37-plan-the-hmrc-mtd-vat-and-itsa-rollout)
- hmrc receipt: [HMRC-22](#hmrc-22-store-and-retrieve-hmrc-submission-receipts)
- hmrc receipts: [OPS-108](#ops-108-backfill-ttl-on-existing-dynamodb-records)
- hmrc sandbox: [OPS-66](#ops-66-create-an-hmrc-sandbox-test-user)
- hmrc sandbox test user: [OPS-88](#ops-88-orchestrate-demo-video-recording-journeys), [DEV-16](#dev-16-manage-the-durable-cognito-test-user-lifecycle)
- hmrc sandbox user: [BILL-11](#bill-11-generate-admin-passes-from-cli-or-workflow)
- hmrc secrets: [DEV-15](#dev-15-fetch-and-publish-proxy-variant-secrets)
- hmrc stack: [HMRC-31](#hmrc-31-wire-hmrc-lambda-handlers-into-cdk-stacks)
- hmrc token exchange: [HMRC-23](#hmrc-23-exchange-an-hmrc-oauth-code-for-a-token)
- hmrc token expired: [HMRC-03](#hmrc-03-retrieve-vat-obligations)
- hmrc vat: [MCP-05](#mcp-05-derive-vat-figures-via-mcp-tools)
- hmrc vat api: [HMRC-02](#hmrc-02-retrieve-a-submitted-vat-return), [HMRC-04](#hmrc-04-retrieve-vat-liabilities), [HMRC-05](#hmrc-05-retrieve-vat-payments), [HMRC-06](#hmrc-06-retrieve-vat-penalties)
- hmrc-api-requests: [DEV-17](#dev-17-export-and-embed-dynamodb-test-state-in-reports)
- hmrc-registered host: [OPS-10](#ops-10-claim-release-and-track-a-ci-deployment-slot)
- hmrc-service: [HMRC-29](#hmrc-29-call-the-hmrc-api)
- hmrc.toml: [HMRC-32](#hmrc-32-register-and-verify-hmrc-developer-hub-application-config)
- holding page: [OPS-04](#ops-04-update-route53cloudfront-origins-for-a-domain), [OPS-133](#ops-133-serve-the-root-domain-holding-page)
- holding page certificate: [OPS-49](#ops-49-request-and-renew-the-holding-page-certificate)
- holding page domain: [OPS-49](#ops-49-request-and-renew-the-holding-page-certificate)
- holding page stack: [OPS-116](#ops-116-provision-the-holding-page-stack)
- homepage cta: [SITE-03](#site-03-capture-feedback-interest)
- hosted ui: [SITE-01](#site-01-sign-customers-in-via-cognito), [DEV-16](#dev-16-manage-the-durable-cognito-test-user-lifecycle)
- hourly: [BILL-05](#bill-05-reconcile-bundle-capacity-counters)
- http client: [CH-10](#ch-10-fetch-http-with-a-timeout)
- http response helper: [SITE-07](#site-07-format-http-responses-and-errors)
- http simulator: [DEV-01](#dev-01-run-the-http-simulator-server)
- http-simulator: [CH-12](#ch-12-generate-synthetic-test-companies)
- https certificate: [OPS-37](#ops-37-check-https-certificate-expiry)
- https local: [SITE-08](#site-08-bootstrap-the-app-server)
- human bot synthetic: [DATA-23](#data-23-classify-visitor-kind-as-human-bot-or-synthetic)
- human step split: [DEV-29](#dev-29-refine-nextmd-before-a-wave)
- human-facing text: [DEV-38](#dev-38-write-plain-human-prose)
- hypothesis lever metric: [SITE-21](#site-21-log-growth-experiments)
- iam policy snapshot: [DATA-43](#data-43-read-the-google-cloud-and-ga4-inventory)
- iam workloadidentityuser: [DATA-42](#data-42-sync-gcp-workload-identity-and-org-policy)
- iam-safe name: [OPS-125](#ops-125-name-and-tag-cdk-resources-consistently)
- iap brand: [DATA-43](#data-43-read-the-google-cloud-and-ga4-inventory)
- ico checklist: [OPS-42](#ops-42-guide-icogdpr-compliance)
- ico compliance: [OPS-42](#ops-42-guide-icogdpr-compliance)
- id token: [DEV-18](#dev-18-provide-shared-unitsystem-test-fixtures)
- idempotent enable: [DATA-40](#data-40-enable-required-google-cloud-apis)
- identity: [CH-01](#ch-01-exchange-a-companies-house-oauth-token)
- identity audit: [OPS-63](#ops-63-report-identity-audit-findings)
- identity base url: [CH-09](#ch-09-query-and-submit-document-transactions)
- identity guard: [OPS-28](#ops-28-enforce-commit-identity-allowlist)
- identity provider: [OPS-101](#ops-101-set-up-github-oidc-deployment-roles)
- identity-sandbox: [CH-02](#ch-02-verify-the-companies-house-oauth-app-configuration)
- identity.toml: [DATA-37](#data-37-federate-lambda-credentials-to-google-cloud), [DATA-42](#data-42-sync-gcp-workload-identity-and-org-policy)
- iframe bridge: [DEV-11](#dev-11-practice-the-vat-journey-in-the-browser-embedded-simulator)
- import prior year: [HMRC-13](#hmrc-13-submit-and-manage-the-self-employment-annual-summary)
- in flight: [DEV-27](#dev-27-render-the-open-work-board)
- in-memory store: [DEV-01](#dev-01-run-the-http-simulator-server)
- in-page script: [OPS-89](#ops-89-overlay-pointer-and-caption-cues-on-video)
- incident response: [OPS-64](#ops-64-runbook-information-security-operations)
- income and relief: [HMRC-19](#hmrc-19-calculate-itsa-tax-liability)
- index: [DEV-43](#dev-43-find-existing-tooling-before-building-any)
- infosec runbook: [OPS-64](#ops-64-runbook-information-security-operations)
- infra-apply: [CH-02](#ch-02-verify-the-companies-house-oauth-app-configuration), [OPS-35](#ops-35-verify-third-party-console-configuration-against-declared-state)
- infrastructure: [CH-14](#ch-14-provision-the-companies-house-cdk-stack)
- init fill submit verify: [HMRC-36](#hmrc-36-provide-itsa-behaviour-test-step-helpers)
- installation token: [OPS-85](#ops-85-obtain-and-use-github-app-api-tokens)
- intelligent tiering: [OPS-128](#ops-128-generate-s3-lifecycle-rules-for-storage-tiering)
- intent to crystallise: [HMRC-19](#hmrc-19-calculate-itsa-tax-liability), [HMRC-20](#hmrc-20-retrieve-itsa-crystallisation-obligations)
- interest: [SITE-03](#site-03-capture-feedback-interest)
- investigation: [OPS-76](#ops-76-gather-alarm-evidence-for-investigation)
- invitation: [BILL-12](#bill-12-invite-a-client-to-authorise-agent-access), [DEV-05](#dev-05-simulate-hmrc-agent-authorisation-and-fraud-prevention-headers)
- invite account: [OPS-100](#ops-100-create-or-invite-aws-member-accounts)
- invite_client: [MCP-08](#mcp-08-manage-practice-clients-and-hmrc-agent-authorisation)
- invoice import: [MCP-12](#mcp-12-read-invoices-from-the-local-mail-index)
- invoice.paid: [BILL-28](#bill-28-process-stripe-webhook-events)
- isdiyaglpackage: [BILL-17](#bill-17-upload-a-diya-gl-book)
- iso 8601 duration: [BILL-42](#bill-42-parse-iso-8601-durations-for-expiry)
- issue events: [DATA-07](#data-07-pull-github-operator-effort-data)
- issue pass: [BILL-07](#bill-07-admin-issue-a-pass)
- issue template: [OPS-56](#ops-56-structure-github-issues-prs-and-funding-links)
- issued passes: [BILL-09](#bill-09-list-a-users-issued-passes)
- issues and comments: [OPS-85](#ops-85-obtain-and-use-github-app-api-tokens)
- iterate: [DEV-30](#dev-30-run-the-delivery-cycle-unattended)
- itsa: [MCP-06](#mcp-06-derive-itsa-quarterly-and-annual-submission-figures), [DEV-09](#dev-09-simulate-hmrc-itsa-mtd-api)
- itsa annual submission: [HMRC-13](#hmrc-13-submit-and-manage-the-self-employment-annual-summary), [HMRC-15](#hmrc-15-submit-and-manage-the-uk-property-annual-summary)
- itsa business details: [HMRC-09](#hmrc-09-retrieve-itsa-business-details)
- itsa calculation: [HMRC-18](#hmrc-18-manage-itsa-tax-liability-adjustments), [HMRC-19](#hmrc-19-calculate-itsa-tax-liability)
- itsa journeys: [HMRC-36](#hmrc-36-provide-itsa-behaviour-test-step-helpers)
- itsa liability: [HMRC-21](#hmrc-21-submit-the-itsa-final-declaration)
- itsa losses: [HMRC-17](#hmrc-17-manage-itsa-losses-and-claims)
- itsa obligations: [HMRC-10](#hmrc-10-retrieve-itsa-obligations), [HMRC-20](#hmrc-20-retrieve-itsa-crystallisation-obligations)
- itsa periods: [HMRC-12](#hmrc-12-submit-and-manage-self-employment-periodic-updates)
- itsa phase 2 plan: [HMRC-37](#hmrc-37-plan-the-hmrc-mtd-vat-and-itsa-rollout)
- itsa property: [HMRC-14](#hmrc-14-submit-and-manage-uk-property-periodic-updates)
- itsa receipt: [HMRC-22](#hmrc-22-store-and-retrieve-hmrc-submission-receipts)
- itsa sandbox: [HMRC-34](#hmrc-34-file-a-full-itsa-tax-year-in-sandbox)
- itsa sandbox spike: [HMRC-35](#hmrc-35-spike-test-the-itsa-sandbox-oauth-and-business-details-flow)
- itsa status: [HMRC-11](#hmrc-11-retrieve-itsa-status)
- ixbrl: [CH-07](#ch-07-preview-micro-entity-accounts-before-filing), [CH-08](#ch-08-file-micro-entity-accounts-to-companies-house), [CH-13](#ch-13-map-the-frc-ixbrl-taxonomy-and-validate-accounts)
- java cdk: [HMRC-31](#hmrc-31-wire-hmrc-lambda-handlers-into-cdk-stacks)
- job minutes: [DEV-37](#dev-37-write-the-session-report)
- join button: [SITE-03](#site-03-capture-feedback-interest)
- journey: [OPS-88](#ops-88-orchestrate-demo-video-recording-journeys)
- json error: [SITE-07](#site-07-format-http-responses-and-errors)
- json export: [OPS-137](#ops-137-export-cognito-users-for-reporting-or-backup)
- jsonl: [DEV-17](#dev-17-export-and-embed-dynamodb-test-state-in-reports)
- jwt: [SITE-02](#site-02-verify-jwts-at-the-api-gateway)
- keepalive: [OPS-13](#ops-13-auto-destroy-stale-ci-deployments)
- key events: [DATA-05](#data-05-pull-ga4-daily-bigquery-aggregate-tables), [DATA-38](#data-38-sync-ga4-properties-streams-and-key-events)
- keyboard nav: [OPS-95](#ops-95-generate-wcag-accessibility-compliance-rows)
- keyword forecast: [DATA-35](#data-35-forecast-google-ads-keyword-performance)
- keyword performance: [DATA-34](#data-34-report-google-ads-campaign-performance)
- kill switch: [OPS-19](#ops-19-kill-switch-to-stop-unattended-agent-workflows)
- kind helpers: [OPS-126](#ops-126-provide-config-composition-helpers-for-cdk-code)
- kinesis firehose: [DATA-02](#data-02-transform-activity-events-into-lake-rows)
- kms keys: [OPS-107](#ops-107-list-production-secrets-manager-entries)
- lake bucket: [DATA-12](#data-12-provision-the-analytics-lake-and-athena-workgroup)
- lambda: [CH-14](#ch-14-provision-the-companies-house-cdk-stack)
- lambda errors alarm: [DATA-22](#data-22-orchestrate-the-nightly-ingestion-workflow)
- lambda event: [SITE-06](#site-06-adapt-lambda-handlers-to-express-routes)
- lambda function url: [DEV-10](#dev-10-deploy-the-public-demo-simulator)
- lambda image: [OPS-114](#ops-114-provision-ecr-image-repositories)
- lambda integration: [OPS-112](#ops-112-provision-the-api-gateway-stack)
- lambda names: [OPS-125](#ops-125-name-and-tag-cdk-resources-consistently)
- lambda naming: [DEV-26](#dev-26-enforce-claude-code-conventions-via-rules-and-hooks)
- lambda startup: [OPS-84](#ops-84-validate-required-environment-variables-at-startup)
- lambda update: [OPS-07](#ops-07-lean-deploy-app-code-to-lambda-and-s3)
- lambda warming: [SITE-13](#site-13-warm-backend-routes-via-prefetch-scripts)
- lambda wiring: [HMRC-31](#hmrc-31-wire-hmrc-lambda-handlers-into-cdk-stacks), [BILL-36](#bill-36-cdk-account-stack)
- lambda worker: [OPS-87](#ops-87-process-sqs-message-batches-in-lambda-workers)
- lane user: [OPS-12](#ops-12-clean-up-expired-test-users), [OPS-15](#ops-15-serialize-lane-test-user-rotation-jobs)
- lapse sweep: [BILL-21](#bill-21-sweep-lapsed-diya-gl-books)
- lapse sweep schedule: [BILL-39](#bill-39-cdk-diya-gl-stack)
- last-known-good: [OPS-04](#ops-04-update-route53cloudfront-origins-for-a-domain)
- late submission penalty: [HMRC-06](#hmrc-06-retrieve-vat-penalties)
- launchd: [HMRC-26](#hmrc-26-monitor-hmrc-fraud-prevention-header-compliance)
- launchd agent: [OPS-47](#ops-47-check-fraud-prevention-header-record-freshness)
- lead time: [DATA-31](#data-31-sql-views-dora-and-operations)
- lean deploy: [OPS-07](#ops-07-lean-deploy-app-code-to-lambda-and-s3)
- ledger book: [BILL-17](#bill-17-upload-a-diya-gl-book), [BILL-18](#bill-18-delete-a-diya-gl-book), [BILL-19](#bill-19-list-a-users-diya-gl-books), [BILL-20](#bill-20-fetch-a-versioned-diya-gl-book)
- legacy vatdue: [HMRC-07](#hmrc-07-build-and-validate-9-box-vat-return-data)
- legal declaration: [HMRC-21](#hmrc-21-submit-the-itsa-final-declaration)
- lets encrypt: [OPS-37](#ops-37-check-https-certificate-expiry)
- liabilities: [DEV-08](#dev-08-simulate-hmrc-vat-mtd-api)
- licence header: [DEV-20](#dev-20-check-spdx-licence-headers)
- licensing: [SITE-20](#site-20-document-business-governance-and-positioning)
- lifecycle policy: [OPS-114](#ops-114-provision-ecr-image-repositories)
- lighthouse: [DEV-14](#dev-14-start-the-proxy-and-simulator-local-dev-environments)
- lines.jsonl: [MCP-03](#mcp-03-load-and-save-diya-gl-books-via-mcp)
- list books: [BILL-19](#bill-19-list-a-users-diya-gl-books)
- list bundles: [BILL-02](#bill-02-list-a-users-bundles-and-token-balance)
- list clients: [BILL-16](#bill-16-manage-practice-clients)
- list domains: [OPS-135](#ops-135-look-up-domains-and-cloudfront-distributions)
- list passes: [BILL-09](#bill-09-list-a-users-issued-passes)
- list secrets: [OPS-107](#ops-107-list-production-secrets-manager-entries)
- list_clients: [MCP-08](#mcp-08-manage-practice-clients-and-hmrc-agent-authorisation)
- list_vat_obligations: [MCP-07](#mcp-07-file-vat-returns-and-accounts-via-api)
- listlapsedbundleowners: [BILL-21](#bill-21-sweep-lapsed-diya-gl-books)
- live mode: [BILL-25](#bill-25-retrieve-a-stripe-checkout-sessions-status)
- llm voice tells: [DEV-38](#dev-38-write-plain-human-prose)
- loading spinner: [SITE-14](#site-14-render-page-chrome-and-widgets)
- local aws credentials: [OPS-69](#ops-69-assume-and-clear-local-aws-deployment-credentials)
- local dev: [DEV-14](#dev-14-start-the-proxy-and-simulator-local-dev-environments)
- local dev server: [SITE-08](#site-08-bootstrap-the-app-server)
- local login: [DEV-02](#dev-02-simulate-local-app-oauth)
- local server: [DEV-01](#dev-01-run-the-http-simulator-server)
- local server routing: [SITE-06](#site-06-adapt-lambda-handlers-to-express-routes)
- local tls: [DEV-15](#dev-15-fetch-and-publish-proxy-variant-secrets)
- localstorage wrapper: [SITE-16](#site-16-configure-the-frontend-via-toml-and-env-libraries)
- lock: [OPS-71](#ops-71-create-github-issues-from-cloudwatch-alarms)
- log appenders: [OPS-129](#ops-129-configure-lambdacdk-application-logging)
- log group: [HMRC-31](#hmrc-31-wire-hmrc-lambda-handlers-into-cdk-stacks)
- log groups: [OPS-76](#ops-76-gather-alarm-evidence-for-investigation)
- log hygiene: [OPS-81](#ops-81-mask-and-redact-sensitive-data-from-logs)
- log retention: [OPS-129](#ops-129-configure-lambdacdk-application-logging)
- log4j2: [OPS-129](#ops-129-configure-lambdacdk-application-logging)
- login: [SITE-01](#site-01-sign-customers-in-via-cognito)
- login to submission funnel: [DATA-29](#data-29-sql-views-submission-and-compliance)
- logout: [SITE-01](#site-01-sign-customers-in-via-cognito)
- logout beacon: [SITE-04](#site-04-track-visits-via-session-beacon)
- lookup resources: [OPS-03](#ops-03-look-up-aws-resources-by-domain-convention)
- loopback: [MCP-02](#mcp-02-authenticate-mcp-sessions-via-cognito)
- loss carry forward: [HMRC-17](#hmrc-17-manage-itsa-losses-and-claims)
- loss ranking: [DEV-37](#dev-37-write-the-session-report)
- losses and claims: [HMRC-17](#hmrc-17-manage-itsa-losses-and-claims), [DEV-09](#dev-09-simulate-hmrc-itsa-mtd-api)
- mail index search: [MCP-12](#mcp-12-read-invoices-from-the-local-mail-index)
- mail-antony: [MCP-12](#mcp-12-read-invoices-from-the-local-mail-index)
- main deploy in progress: [OPS-24](#ops-24-gate-probes-on-the-main-apex-deploy)
- making tax digital: [HMRC-11](#hmrc-11-retrieve-itsa-status), [DEV-09](#dev-09-simulate-hmrc-itsa-mtd-api)
- manage subscription: [BILL-26](#bill-26-open-the-stripe-customer-billing-portal)
- manage-secrets workflow: [OPS-45](#ops-45-manage-aws-secrets-manager-entries-and-rotation-tags)
- management account: [DATA-08](#data-08-copy-the-aws-focus-cost-export), [DATA-17](#data-17-export-aws-billing-data-in-focus-format)
- manual adjustment: [HMRC-18](#hmrc-18-manage-itsa-tax-liability-adjustments)
- manual change: [OPS-32](#ops-32-detect-cloudformation-drift)
- manual destroy: [OPS-14](#ops-14-destroy-a-named-prod-deployment-on-demand)
- manual review: [OPS-95](#ops-95-generate-wcag-accessibility-compliance-rows)
- manual stack deploy: [OPS-08](#ops-08-deploy-a-single-cdk-stack-on-demand)
- marketing guidance: [SITE-20](#site-20-document-business-governance-and-positioning)
- marketing page: [MCP-15](#mcp-15-disclaim-an-mcp-server-on-the-marketing-site)
- mask ip: [HMRC-27](#hmrc-27-validate-hmrc-identifiers-dates-and-amounts)
- maximize clicks bidding: [DATA-35](#data-35-forecast-google-ads-keyword-performance)
- mcp auth: [MCP-02](#mcp-02-authenticate-mcp-sessions-via-cognito)
- mcp book tools: [MCP-03](#mcp-03-load-and-save-diya-gl-books-via-mcp)
- mcp disclaimer: [MCP-15](#mcp-15-disclaim-an-mcp-server-on-the-marketing-site)
- mcp readme: [MCP-14](#mcp-14-document-the-submission-mcps-plan-and-tool-reference)
- mcp server: [MCP-01](#mcp-01-expose-the-submission-mcp-server-and-tools)
- mcp tools: [MCP-01](#mcp-01-expose-the-submission-mcp-server-and-tools)
- mcp.html: [MCP-15](#mcp-15-disclaim-an-mcp-server-on-the-marketing-site)
- measured figures: [DEV-37](#dev-37-write-the-session-report)
- measurement id: [DATA-38](#data-38-sync-ga4-properties-streams-and-key-events)
- member account: [OPS-100](#ops-100-create-or-invite-aws-member-accounts)
- merge preview: [DEV-33](#dev-33-preview-what-auto-merge-would-do)
- merge state: [DEV-32](#dev-32-merge-every-pr-that-is-ready)
- merged branch cleanup: [DEV-34](#dev-34-clean-up-stale-deployments-and-branches)
- meta tag config: [DATA-25](#data-25-configure-and-gate-cloudwatch-rum)
- metadata: [BILL-23](#bill-23-store-diya-gl-books-in-s3)
- metric_definitions: [DATA-21](#data-21-publish-nightly-business-metrics-to-cloudwatch)
- mfa: [DEV-16](#dev-16-manage-the-durable-cognito-test-user-lifecycle)
- mfa claim: [SITE-01](#site-01-sign-customers-in-via-cognito)
- mfa context: [SITE-02](#site-02-verify-jwts-at-the-api-gateway)
- micro-entity: [MCP-04](#mcp-04-derive-micro-entity-accounts-figures-for-companies-house-filing)
- micro-entity accounts: [CH-07](#ch-07-preview-micro-entity-accounts-before-filing), [CH-08](#ch-08-file-micro-entity-accounts-to-companies-house)
- migration: [BILL-40](#bill-40-migrate-the-hashed-sub-salt), [BILL-41](#bill-41-backfill-the-stripe-test-mode-qualifier)
- migration runner: [OPS-16](#ops-16-run-dynamodb-data-migrations)
- milestones: [MCP-14](#mcp-14-document-the-submission-mcps-plan-and-tool-reference)
- mock billing: [SITE-08](#site-08-bootstrap-the-app-server), [DEV-07](#dev-07-simulate-the-public-demos-billing-and-oauth)
- mock oauth: [SITE-08](#site-08-bootstrap-the-app-server), [DEV-07](#dev-07-simulate-the-public-demos-billing-and-oauth)
- mock server: [DEV-01](#dev-01-run-the-http-simulator-server), [DEV-18](#dev-18-provide-shared-unitsystem-test-fixtures)
- mock stripe: [DEV-07](#dev-07-simulate-the-public-demos-billing-and-oauth)
- mock token: [DEV-03](#dev-03-simulate-hmrc-oauth)
- mock-oauth2-server: [DEV-14](#dev-14-start-the-proxy-and-simulator-local-dev-environments)
- mock-oauth2-server replacement: [DEV-02](#dev-02-simulate-local-app-oauth)
- mode not one-shot: [DEV-35](#dev-35-cool-down-an-overloaded-batch)
- model context protocol: [MCP-01](#mcp-01-expose-the-submission-mcp-server-and-tools)
- model selection: [DEV-29](#dev-29-refine-nextmd-before-a-wave)
- module bundle: [SITE-18](#site-18-bootstrap-the-frontend-module-bundle)
- module index: [DEV-21](#dev-21-verify-module-wiring-and-repository-shape)
- monitor tool: [DEV-31](#dev-31-watch-github-ci-to-green)
- monthly budget: [DATA-16](#data-16-alert-on-cost-budget-and-anomaly-thresholds)
- monthly feedback email: [HMRC-26](#hmrc-26-monitor-hmrc-fraud-prevention-header-compliance)
- monthly record: [OPS-47](#ops-47-check-fraud-prevention-header-record-freshness)
- monthly spend: [OPS-59](#ops-59-track-and-analyze-aws-spending)
- move book: [BILL-15](#bill-15-move-a-book-to-a-client)
- move ou: [OPS-100](#ops-100-create-or-invite-aws-member-accounts)
- move_book_to_client: [MCP-08](#mcp-08-manage-practice-clients-and-hmrc-agent-authorisation)
- movebooktoclient: [BILL-15](#bill-15-move-a-book-to-a-client)
- mtd enrolment: [HMRC-11](#hmrc-11-retrieve-itsa-status)
- mtd for itsa: [HMRC-10](#hmrc-10-retrieve-itsa-obligations)
- mtd it: [MCP-06](#mcp-06-derive-itsa-quarterly-and-annual-submission-figures)
- mtd test user: [OPS-66](#ops-66-create-an-hmrc-sandbox-test-user)
- mtd vat: [HMRC-01](#hmrc-01-submit-a-vat-return), [MCP-05](#mcp-05-derive-vat-figures-via-mcp-tools)
- mtd vat roadmap: [HMRC-37](#hmrc-37-plan-the-hmrc-mtd-vat-and-itsa-rollout)
- mtd-income-tax: [OPS-66](#ops-66-create-an-hmrc-sandbox-test-user)
- mtd-it: [BILL-12](#bill-12-invite-a-client-to-authorise-agent-access)
- mtd-vat: [HMRC-24](#hmrc-24-verify-hmrc-agent-authorisation-for-a-client), [BILL-12](#bill-12-invite-a-client-to-authorise-agent-access), [OPS-66](#ops-66-create-an-hmrc-sandbox-test-user)
- multi-account: [OPS-58](#ops-58-document-multi-account-aws-architecture)
- multi-account check: [OPS-102](#ops-102-verify-the-multi-account-aws-setup)
- my passes: [BILL-09](#bill-09-list-a-users-issued-passes)
- naming convention: [OPS-02](#ops-02-derive-environment-and-deployment-names-from-a-branch)
- native auth: [DEV-16](#dev-16-manage-the-durable-cognito-test-user-lifecycle)
- natwest csv: [MCP-10](#mcp-10-import-a-natwest-bank-statement-into-diya-gl-lines)
- navigation structure: [SITE-12](#site-12-map-the-site-structure)
- never torn down: [BILL-38](#bill-38-cdk-billing-webhook-stack)
- new account: [OPS-103](#ops-103-bootstrap-a-new-aws-account-for-cdk)
- next.md: [OPS-57](#ops-57-dispatch-agentic-lib-board-backlog-and-pr-agents), [DEV-24](#dev-24-document-developer-setup-and-repository-conventions), [DEV-27](#dev-27-render-the-open-work-board), [DEV-28](#dev-28-work-nextmd-as-dispatched-sub-agents)
- next.md readiness: [DEV-29](#dev-29-refine-nextmd-before-a-wave)
- next.md shape: [DEV-21](#dev-21-verify-module-wiring-and-repository-shape)
- nightly analysis: [OPS-75](#ops-75-run-nightly-security-lake-analysis)
- nightly ingestion: [DATA-22](#data-22-orchestrate-the-nightly-ingestion-workflow)
- nightly publish: [DATA-18](#data-18-publish-the-nightly-operator-dashboard-snapshot)
- nino: [HMRC-09](#hmrc-09-retrieve-itsa-business-details), [HMRC-27](#hmrc-27-validate-hmrc-identifiers-dates-and-amounts), [DEV-06](#dev-06-simulate-hmrc-test-user-provisioning-and-api-docs)
- no charge: [BILL-07](#bill-07-admin-issue-a-pass)
- no mcp server claim: [MCP-15](#mcp-15-disclaim-an-mcp-server-on-the-marketing-site)
- no service account key: [DATA-47](#data-47-authenticate-google-cloud-scripts-via-federated-credentials)
- no stored key: [DATA-37](#data-37-federate-lambda-credentials-to-google-cloud)
- no webhook: [BILL-29](#bill-29-assert-the-paypal-donate-button-configuration)
- no-op verdict: [DEV-33](#dev-33-preview-what-auto-merge-would-do)
- no-quibble: [BILL-31](#bill-31-configure-stripe-account-policies)
- node-qrcode: [SITE-19](#site-19-generate-qr-codes)
- node_modules reset: [DEV-22](#dev-22-clean-and-update-local-build-state)
- noindex: [DEV-10](#dev-10-deploy-the-public-demo-simulator)
- non-lambda mocks: [DEV-07](#dev-07-simulate-the-public-demos-billing-and-oauth)
- non-main branch: [OPS-11](#ops-11-queue-ci-branch-deploys-in-creation-order)
- not implemented: [BILL-27](#bill-27-recover-an-abandoned-checkout)
- npm package: [OPS-51](#ops-51-publish-build-artifacts-and-documentation)
- npm-check-updates: [DEV-22](#dev-22-clean-and-update-local-build-state)
- null-tolerant map: [OPS-126](#ops-126-provide-config-composition-helpers-for-cdk-code)
- oauth: [SITE-01](#site-01-sign-customers-in-via-cognito), [HMRC-23](#hmrc-23-exchange-an-hmrc-oauth-code-for-a-token), [CH-01](#ch-01-exchange-a-companies-house-oauth-token), [CH-02](#ch-02-verify-the-companies-house-oauth-app-configuration), [MCP-02](#mcp-02-authenticate-mcp-sessions-via-cognito), [DEV-02](#dev-02-simulate-local-app-oauth)
- oauth authorize: [HMRC-33](#hmrc-33-drive-hmrcs-sandbox-authorisation-flow-for-test-scripts)
- oauth client assert: [DATA-44](#data-44-assert-google-oauth-client-configuration)
- oauth client check: [OPS-67](#ops-67-apply-google-cloud--ga4-infrastructure)
- oauth redirect: [HMRC-35](#hmrc-35-spike-test-the-itsa-sandbox-oauth-and-business-details-flow)
- oauth state: [SITE-17](#site-17-trace-and-secure-client-requests)
- oauth.toml: [DATA-44](#data-44-assert-google-oauth-client-configuration)
- object expiration: [OPS-128](#ops-128-generate-s3-lifecycle-rules-for-storage-tiering)
- obligation formatting: [HMRC-28](#hmrc-28-format-and-match-hmrc-obligations)
- obligations: [DEV-08](#dev-08-simulate-hmrc-vat-mtd-api)
- observability: [OPS-118](#ops-118-provision-the-observability-stack-in-us-east-1)
- observability stack: [OPS-117](#ops-117-provision-the-observability-stack)
- observabilitystack: [OPS-09](#ops-09-deploy-environment-stacks-and-populate-secrets)
- oidc: [OPS-101](#ops-101-set-up-github-oidc-deployment-roles)
- oidc exchange: [DATA-47](#data-47-authenticate-google-cloud-scripts-via-federated-credentials)
- oidc provider: [OPS-103](#ops-103-bootstrap-a-new-aws-account-for-cdk)
- oidc roles: [OPS-102](#ops-102-verify-the-multi-account-aws-setup)
- oidc trust: [OPS-60](#ops-60-guide-github-repository-configuration)
- old logs: [OPS-108](#ops-108-backfill-ttl-on-existing-dynamodb-records)
- on-demand backup: [OPS-105](#ops-105-copy-production-data-to-backup-for-migration)
- on-pass-on-subscription: [BILL-10](#bill-10-redeem-a-pass)
- one-stop dashboard: [OPS-25](#ops-25-record-dora-and-probe-metrics), [DATA-05](#data-05-pull-ga4-daily-bigquery-aggregate-tables)
- one-stop objectives: [DATA-18](#data-18-publish-the-nightly-operator-dashboard-snapshot), [DATA-26](#data-26-render-the-operator-objectives-dashboard)
- open work: [DEV-27](#dev-27-render-the-open-work-board)
- open_book: [MCP-03](#mcp-03-load-and-save-diya-gl-books-via-mcp)
- openapi 3.0.3: [DEV-13](#dev-13-generate-the-openapi-spec-from-cdk-route-definitions)
- openapi generator: [DEV-13](#dev-13-generate-the-openapi-spec-from-cdk-route-definitions)
- openapi spec: [DEV-06](#dev-06-simulate-hmrc-test-user-provisioning-and-api-docs)
- openid discovery: [DEV-02](#dev-02-simulate-local-app-oauth)
- opening balances: [MCP-11](#mcp-11-seed-a-book-from-a-workbook-set)
- openx deserializer: [DATA-02](#data-02-transform-activity-events-into-lake-rows)
- operator: [BILL-07](#bill-07-admin-issue-a-pass), [BILL-11](#bill-11-generate-admin-passes-from-cli-or-workflow)
- operator bundle: [BILL-02](#bill-02-list-a-users-bundles-and-token-balance)
- operator bundle entitlement: [DATA-26](#data-26-render-the-operator-objectives-dashboard)
- operator consent: [DEV-36](#dev-36-resume-normal-work-from-cool-down)
- operator dashboard annotations: [SITE-21](#site-21-log-growth-experiments)
- operator dashboard page: [DATA-26](#data-26-render-the-operator-objectives-dashboard)
- operator dashboard route: [DATA-19](#data-19-serve-the-operator-dashboard-snapshot-via-the-api)
- operator effort: [DATA-07](#data-07-pull-github-operator-effort-data)
- operator interventions: [DATA-07](#data-07-pull-github-operator-effort-data), [DATA-31](#data-31-sql-views-dora-and-operations)
- operator match: [BILL-04](#bill-04-enforce-bundle-entitlement-on-a-request)
- operator snapshot: [DATA-18](#data-18-publish-the-nightly-operator-dashboard-snapshot)
- operator snapshot api: [DATA-19](#data-19-serve-the-operator-dashboard-snapshot-via-the-api)
- operator tooling: [OPS-80](#ops-80-build-aws-console-deep-links-for-operators)
- ops channel: [OPS-72](#ops-72-forward-bedrock-budget-alerts)
- ops notifications: [OPS-70](#ops-70-forward-operational-activity-events-to-telegram)
- ops stack: [OPS-119](#ops-119-provision-the-ops-stack)
- org policy: [DATA-42](#data-42-sync-gcp-workload-identity-and-org-policy)
- organization account: [OPS-100](#ops-100-create-or-invite-aws-member-accounts)
- organization check: [OPS-102](#ops-102-verify-the-multi-account-aws-setup)
- organizational units: [OPS-99](#ops-99-bootstrap-the-aws-organization-structure)
- origin label: [OPS-56](#ops-56-structure-github-issues-prs-and-funding-links)
- originfor tag: [OPS-135](#ops-135-look-up-domains-and-cloudfront-distributions), [OPS-116](#ops-116-provision-the-holding-page-stack)
- ou setup: [OPS-99](#ops-99-bootstrap-the-aws-organization-structure)
- outbound call: [CH-10](#ch-10-fetch-http-with-a-timeout)
- output value: [OPS-136](#ops-136-retrieve-cloudformation-stack-outputs)
- outside cdk: [OPS-32](#ops-32-detect-cloudformation-drift)
- over budget: [OPS-20](#ops-20-enforce-daily-run-budgets-for-agent-paths)
- overlay: [OPS-89](#ops-89-overlay-pointer-and-caption-cues-on-video)
- overloaded batch: [DEV-35](#dev-35-cool-down-an-overloaded-batch)
- ownership check: [BILL-18](#bill-18-delete-a-diya-gl-book)
- pa11y: [DATA-14](#data-14-catalogue-compliance-findings-for-the-dashboard), [DEV-14](#dev-14-start-the-proxy-and-simulator-local-dev-environments)
- package manager: [OPS-36](#ops-36-configure-dependabot-dependency-updates)
- page chrome: [SITE-14](#site-14-render-page-chrome-and-widgets)
- page layout: [SITE-12](#site-12-map-the-site-structure)
- pages report: [DATA-06](#data-06-pull-ga4-reports-and-bigquery-event-export)
- pagination: [CH-03](#ch-03-search-the-companies-house-register), [BILL-19](#bill-19-list-a-users-diya-gl-books)
- parallel branch: [DATA-22](#data-22-orchestrate-the-nightly-ingestion-workflow)
- parquet: [DATA-02](#data-02-transform-activity-events-into-lake-rows)
- parseisodurationtodate: [BILL-42](#bill-42-parse-iso-8601-durations-for-expiry)
- partial batch failure: [OPS-87](#ops-87-process-sqs-message-batches-in-lambda-workers)
- partition registration: [DATA-11](#data-11-run-glue-data-quality-checks)
- pass: [BILL-06](#bill-06-generate-a-token-charged-pass), [BILL-07](#bill-07-admin-issue-a-pass), [BILL-08](#bill-08-check-a-passs-validity), [BILL-09](#bill-09-list-a-users-issued-passes), [BILL-10](#bill-10-redeem-a-pass), [BILL-11](#bill-11-generate-admin-passes-from-cli-or-workflow)
- pass generation: [SITE-19](#site-19-generate-qr-codes)
- pass link: [BILL-10](#bill-10-redeem-a-pass)
- pass redemptions: [DATA-28](#data-28-sql-views-revenue-and-subscription)
- passes: [DATA-04](#data-04-stream-dynamodb-table-changes-into-the-lake)
- passphrase: [BILL-10](#bill-10-redeem-a-pass)
- passphrase salt: [BILL-40](#bill-40-migrate-the-hashed-sub-salt)
- payment history: [HMRC-05](#hmrc-05-retrieve-vat-payments)
- payments: [DEV-08](#dev-08-simulate-hmrc-vat-mtd-api)
- payout schedule: [BILL-31](#bill-31-configure-stripe-account-policies)
- payouts: [MCP-13](#mcp-13-import-stripe-transaction-and-payout-lines)
- paypal: [BILL-29](#bill-29-assert-the-paypal-donate-button-configuration), [OPS-35](#ops-35-verify-third-party-console-configuration-against-declared-state)
- paypal transaction search: [DATA-48](#data-48-stage-paypal-transactions-for-reconciliation)
- penalties: [DEV-08](#dev-08-simulate-hmrc-vat-mtd-api)
- penalty points: [HMRC-06](#hmrc-06-retrieve-vat-penalties)
- pending: [BILL-14](#bill-14-cancel-a-pending-client-authorisation-invite)
- penetration report: [OPS-38](#ops-38-run-the-weekly-compliance-test-check)
- penetration test: [OPS-62](#ops-62-report-accessibility-penetration-testing)
- per-account synthesis: [OPS-123](#ops-123-wire-cdk-application-entrypoints-per-account)
- per-client loop: [MCP-09](#mcp-09-run-a-client-scoped-tool-across-every-practice-client)
- period key: [HMRC-01](#hmrc-01-submit-a-vat-return), [HMRC-02](#hmrc-02-retrieve-a-submitted-vat-return), [HMRC-03](#hmrc-03-retrieve-vat-obligations), [HMRC-27](#hmrc-27-validate-hmrc-identifiers-dates-and-amounts)
- period key hidden: [HMRC-28](#hmrc-28-format-and-match-hmrc-obligations)
- permission grant: [OPS-33](#ops-33-enforce-workflow-to-workflow-permission-grants)
- personal data package: [OPS-41](#ops-41-export-a-customers-gdpr-subject-access-data)
- physical pass: [BILL-06](#bill-06-generate-a-token-charged-pass)
- pii redaction: [OPS-81](#ops-81-mask-and-redact-sensitive-data-from-logs), [OPS-86](#ops-86-provide-structured-pii-redacting-logging)
- pino logger: [OPS-86](#ops-86-provide-structured-pii-redacting-logging)
- pitr: [OPS-132](#ops-132-enable-dynamodb-pitr-on-deploy), [OPS-113](#ops-113-provision-the-dynamodb-and-s3-data-stack)
- pitr restore: [OPS-50](#ops-50-drill-and-test-pitr-database-restoration)
- pitr status: [OPS-48](#ops-48-verify-backup-health-daily)
- pkce: [MCP-02](#mcp-02-authenticate-mcp-sessions-via-cognito)
- plain english: [DEV-38](#dev-38-write-plain-human-prose)
- plain prose: [DEV-38](#dev-38-write-plain-human-prose)
- plan: [BILL-44](#bill-44-document-the-price-update-project)
- plan and apply: [BILL-30](#bill-30-sync-the-stripe-productprice-catalogue)
- plan apply: [DATA-32](#data-32-sync-the-google-ads-account)
- plan doc: [DEV-24](#dev-24-document-developer-setup-and-repository-conventions)
- plan of record: [MCP-14](#mcp-14-document-the-submission-mcps-plan-and-tool-reference)
- plan submission mcp: [MCP-14](#mcp-14-document-the-submission-mcps-plan-and-tool-reference)
- playback controls: [OPS-94](#ops-94-play-demo-videos-on-the-public-site)
- playwright: [HMRC-33](#hmrc-33-drive-hmrcs-sandbox-authorisation-flow-for-test-scripts), [OPS-88](#ops-88-orchestrate-demo-video-recording-journeys), [OPS-96](#ops-96-scan-pages-for-accessibility-violations)
- playwright component test: [DEV-12](#dev-12-prove-the-client-status-stack-and-fetchauth)
- playwright config: [DEV-23](#dev-23-configure-the-test-and-lint-toolchains)
- playwright fixtures: [DEV-19](#dev-19-provide-shared-behaviour-test-fixtures-and-steps)
- playwright recording: [DEV-40](#dev-40-record-a-product-demo-video)
- playwright steps: [HMRC-36](#hmrc-36-provide-itsa-behaviour-test-step-helpers)
- pna: [DEV-07](#dev-07-simulate-the-public-demos-billing-and-oauth)
- point in time recovery: [OPS-50](#ops-50-drill-and-test-pitr-database-restoration)
- point-in-time recovery: [OPS-132](#ops-132-enable-dynamodb-pitr-on-deploy)
- pointer cue: [OPS-89](#ops-89-overlay-pointer-and-caption-cues-on-video)
- policybee: [SITE-11](#site-11-promote-sibling-products-and-partners)
- poll deploy status: [OPS-24](#ops-24-gate-probes-on-the-main-apex-deploy)
- poll pattern: [HMRC-30](#hmrc-30-persist-async-hmrc-api-request-state)
- poll workflow: [OPS-134](#ops-134-monitor-github-actions-ci-from-the-cli)
- polling: [SITE-09](#site-09-track-and-poll-async-api-requests)
- polyform: [SITE-20](#site-20-document-business-governance-and-positioning)
- polyform internal use: [DEV-20](#dev-20-check-spdx-licence-headers)
- populatedmap: [OPS-126](#ops-126-provide-config-composition-helpers-for-cdk-code)
- portal lambda: [BILL-37](#bill-37-cdk-billing-app-stack)
- post-deploy: [BILL-40](#bill-40-migrate-the-hashed-sub-salt), [OPS-16](#ops-16-run-dynamodb-data-migrations)
- post-deploy recording: [OPS-52](#ops-52-auto-record-demo-videos-on-prod-deploy)
- post-deploy validation: [OPS-27](#ops-27-run-probe-tests-against-deployed-environments)
- post-mortem: [DEV-17](#dev-17-export-and-embed-dynamodb-test-state-in-reports)
- postmessage: [DEV-11](#dev-11-practice-the-vat-journey-in-the-browser-embedded-simulator)
- pr agent: [OPS-57](#ops-57-dispatch-agentic-lib-board-backlog-and-pr-agents)
- pr merge gate: [DEV-32](#dev-32-merge-every-pr-that-is-ready)
- pr readiness: [OPS-134](#ops-134-monitor-github-actions-ci-from-the-cli)
- pr template: [OPS-56](#ops-56-structure-github-issues-prs-and-funding-links)
- practice: [BILL-12](#bill-12-invite-a-client-to-authorise-agent-access), [BILL-13](#bill-13-check-a-clients-authorisation-status), [BILL-14](#bill-14-cancel-a-pending-client-authorisation-invite), [BILL-15](#bill-15-move-a-book-to-a-client), [BILL-16](#bill-16-manage-practice-clients)
- practice batch run: [MCP-09](#mcp-09-run-a-client-scoped-tool-across-every-practice-client)
- practice client: [HMRC-24](#hmrc-24-verify-hmrc-agent-authorisation-for-a-client)
- practice clients: [MCP-08](#mcp-08-manage-practice-clients-and-hmrc-agent-authorisation)
- practice.html: [BILL-16](#bill-16-manage-practice-clients)
- pre-deploy: [BILL-41](#bill-41-backfill-the-stripe-test-mode-qualifier), [OPS-16](#ops-16-run-dynamodb-data-migrations)
- pre-login: [BILL-08](#bill-08-check-a-passs-validity)
- prefetch: [SITE-13](#site-13-warm-backend-routes-via-prefetch-scripts), [BILL-34](#bill-34-prefetch-and-retry-a-cognito-token-refresh)
- presenter credential: [CH-08](#ch-08-file-micro-entity-accounts-to-companies-house)
- presenter secret: [CH-09](#ch-09-query-and-submit-document-transactions)
- pretest: [BILL-43](#bill-43-build-the-frontend-test-bundle)
- pretooluse hook: [DEV-26](#dev-26-enforce-claude-code-conventions-via-rules-and-hooks)
- preview: [CH-07](#ch-07-preview-micro-entity-accounts-before-filing)
- price: [BILL-30](#bill-30-sync-the-stripe-productprice-catalogue)
- price id: [BILL-24](#bill-24-create-a-stripe-checkout-session)
- price sync: [DEV-39](#dev-39-sync-stripe-products-and-prices-from-the-catalogue)
- price update: [BILL-44](#bill-44-document-the-price-update-project)
- pricing project: [BILL-44](#bill-44-document-the-price-update-project)
- privacy: [SITE-10](#site-10-serve-general-site-pages)
- privacy banner: [SITE-15](#site-15-show-and-persist-cookie-consent)
- probe failure: [OPS-23](#ops-23-raise-an-issue-from-a-probe-test-failure)
- probe issue: [OPS-23](#ops-23-raise-an-issue-from-a-probe-test-failure)
- probe metrics: [OPS-25](#ops-25-record-dora-and-probe-metrics)
- probe runs: [DATA-15](#data-15-catalogue-workflow-probe-and-agent-run-data)
- probe test: [OPS-27](#ops-27-run-probe-tests-against-deployed-environments)
- probe-failure-issue.yml: [OPS-23](#ops-23-raise-an-issue-from-a-probe-test-failure)
- processingfailed: [DATA-02](#data-02-transform-activity-events-into-lake-rows)
- prod apex: [OPS-06](#ops-06-run-the-full-deployment-pipeline)
- prod stacks: [OPS-14](#ops-14-destroy-a-named-prod-deployment-on-demand)
- product: [BILL-30](#bill-30-sync-the-stripe-productprice-catalogue)
- product catalogue: [BILL-35](#bill-35-load-and-query-the-productactivity-catalogue)
- product demos: [OPS-94](#ops-94-play-demo-videos-on-the-public-site)
- product sync: [DEV-39](#dev-39-sync-stripe-products-and-prices-from-the-catalogue)
- project.toml: [DATA-41](#data-41-assert-gcp-billing-budget-and-stray-project)
- project.toml principals: [DATA-45](#data-45-apply-ga4-and-gcp-iam-role-bindings)
- project.toml services: [DATA-40](#data-40-enable-required-google-cloud-apis)
- promote apex: [OPS-05](#ops-05-promote-a-ci-deployment-to-the-ci-apex)
- prompt library: [DEV-25](#dev-25-maintain-the-specialist-agent-prompt-library)
- proof: [OPS-78](#ops-78-verify-an-alarm-issues-claimed-transition)
- property income allowance: [HMRC-15](#hmrc-15-submit-and-manage-the-uk-property-annual-summary)
- provision secrets: [BILL-32](#bill-32-provision-stripe-secrets)
- provision test user: [OPS-68](#ops-68-provision-and-assume-roles-for-test-user-provisioning)
- provisioned concurrency: [BILL-38](#bill-38-cdk-billing-webhook-stack)
- proxy secrets: [DEV-15](#dev-15-fetch-and-publish-proxy-variant-secrets)
- proxy variant: [DEV-14](#dev-14-start-the-proxy-and-simulator-local-dev-environments)
- pubbalsht: [MCP-04](#mcp-04-derive-micro-entity-accounts-figures-for-companies-house-filing)
- public demo: [DEV-07](#dev-07-simulate-the-public-demos-billing-and-oauth), [DEV-10](#dev-10-deploy-the-public-demo-simulator)
- public site: [OPS-94](#ops-94-play-demo-videos-on-the-public-site), [MCP-15](#mcp-15-disclaim-an-mcp-server-on-the-marketing-site)
- public video: [OPS-93](#ops-93-publish-demo-videos-to-youtube)
- publish artifacts: [OPS-51](#ops-51-publish-build-artifacts-and-documentation)
- publish filter: [OPS-17](#ops-17-redact-and-gate-unattended-agent-output-before-publishing)
- publish stack: [OPS-120](#ops-120-provision-the-publish-stack)
- publish video: [OPS-93](#ops-93-publish-demo-videos-to-youtube)
- publish.json: [OPS-93](#ops-93-publish-demo-videos-to-youtube), [DEV-41](#dev-41-publish-videos-to-the-youtube-channel)
- publish.yml: [OPS-51](#ops-51-publish-build-artifacts-and-documentation)
- purchase reconciliation: [DATA-28](#data-28-sql-views-revenue-and-subscription)
- purchases lines: [MCP-12](#mcp-12-read-invoices-from-the-local-mail-index)
- push and pr trigger: [OPS-26](#ops-26-run-the-automated-test-suite-in-ci)
- push to main: [OPS-06](#ops-06-run-the-full-deployment-pipeline)
- push trigger: [OPS-01](#ops-01-cancel-superseded-push-triggered-deploys), [OPS-31](#ops-31-run-a-claude-security-review-on-push)
- putmetricdata: [OPS-83](#ops-83-emit-cloudwatch-emf-metrics), [DATA-21](#data-21-publish-nightly-business-metrics-to-cloudwatch)
- qr code: [SITE-19](#site-19-generate-qr-codes), [BILL-06](#bill-06-generate-a-token-charged-pass), [BILL-11](#bill-11-generate-admin-passes-from-cli-or-workflow)
- qualifier: [BILL-41](#bill-41-backfill-the-stripe-test-mode-qualifier)
- quarterly update: [HMRC-10](#hmrc-10-retrieve-itsa-obligations), [HMRC-12](#hmrc-12-submit-and-manage-self-employment-periodic-updates), [HMRC-14](#hmrc-14-submit-and-manage-uk-property-periodic-updates), [MCP-06](#mcp-06-derive-itsa-quarterly-and-annual-submission-figures)
- queue deploys: [OPS-11](#ops-11-queue-ci-branch-deploys-in-creation-order)
- queue processing: [SITE-09](#site-09-track-and-poll-async-api-requests)
- race: [OPS-01](#ops-01-cancel-superseded-push-triggered-deploys)
- race condition: [OPS-11](#ops-11-queue-ci-branch-deploys-in-creation-order), [OPS-15](#ops-15-serialize-lane-test-user-rotation-jobs)
- raise issue: [OPS-23](#ops-23-raise-an-issue-from-a-probe-test-failure)
- random hex: [SITE-17](#site-17-trace-and-secure-client-requests)
- rate counter: [OPS-46](#ops-46-query-and-persist-per-consumer-security-state-records)
- rate limit: [SITE-05](#site-05-submit-support-tickets), [OPS-79](#ops-79-track-an-alarm-familys-daily-remedy-budget)
- rate limit agent: [OPS-20](#ops-20-enforce-daily-run-budgets-for-agent-paths)
- raw export: [DATA-20](#data-20-publish-the-nightly-raw-export-for-indexing)
- re-key: [BILL-40](#bill-40-migrate-the-hashed-sub-salt)
- read-only: [DATA-44](#data-44-assert-google-oauth-client-configuration)
- read-only aws query: [DEV-42](#dev-42-look-up-a-vat-submission-failure-alarms-customer)
- read-only check: [DATA-43](#data-43-read-the-google-cloud-and-ga4-inventory)
- read-only merge check: [DEV-33](#dev-33-preview-what-auto-merge-would-do)
- read-only snapshot: [DATA-33](#data-33-read-the-google-ads-account-inventory)
- read:self-assessment: [HMRC-35](#hmrc-35-spike-test-the-itsa-sandbox-oauth-and-business-details-flow)
- readme: [DEV-24](#dev-24-document-developer-setup-and-repository-conventions)
- receipt: [HMRC-01](#hmrc-01-submit-a-vat-return)
- receipts: [DATA-04](#data-04-stream-dynamodb-table-changes-into-the-lake)
- receipts page: [HMRC-22](#hmrc-22-store-and-retrieve-hmrc-submission-receipts)
- reconcile: [BILL-05](#bill-05-reconcile-bundle-capacity-counters), [MCP-05](#mcp-05-derive-vat-figures-via-mcp-tools)
- reconcile stripe: [MCP-13](#mcp-13-import-stripe-transaction-and-payout-lines)
- reconciliation: [DATA-48](#data-48-stage-paypal-transactions-for-reconciliation), [MCP-10](#mcp-10-import-a-natwest-bank-statement-into-diya-gl-lines)
- recording: [OPS-88](#ops-88-orchestrate-demo-video-recording-journeys)
- recover checkout: [BILL-27](#bill-27-recover-an-abandoned-checkout)
- redact: [OPS-17](#ops-17-redact-and-gate-unattended-agent-output-before-publishing)
- redaction: [DATA-04](#data-04-stream-dynamodb-table-changes-into-the-lake)
- redeem pass: [BILL-10](#bill-10-redeem-a-pass)
- redeempass: [BILL-10](#bill-10-redeem-a-pass)
- redirect: [OPS-133](#ops-133-serve-the-root-domain-holding-page)
- redirect uri: [HMRC-32](#hmrc-32-register-and-verify-hmrc-developer-hub-application-config), [CH-02](#ch-02-verify-the-companies-house-oauth-app-configuration)
- reference check: [DEV-29](#dev-29-refine-nextmd-before-a-wave)
- refine: [DEV-29](#dev-29-refine-nextmd-before-a-wave)
- refresh token: [OPS-53](#ops-53-verify-youtube-channel-consistency-weekly), [OPS-110](#ops-110-force-logout-all-users-during-a-security-incident)
- refresh token scopes: [DATA-44](#data-44-assert-google-oauth-client-configuration)
- refresh_token: [DEV-03](#dev-03-simulate-hmrc-oauth)
- refund: [BILL-28](#bill-28-process-stripe-webhook-events)
- register: [CH-03](#ch-03-search-the-companies-house-register)
- registered email: [CH-06](#ch-06-file-a-change-of-registered-email-address), [DEV-04](#dev-04-simulate-companies-house-identity-and-filing)
- registered office: [CH-05](#ch-05-file-a-change-of-registered-office-address), [DEV-04](#dev-04-simulate-companies-house-identity-and-filing)
- registerlambdaroute: [SITE-06](#site-06-adapt-lambda-handlers-to-express-routes)
- regulatory checklist: [OPS-42](#ops-42-guide-icogdpr-compliance)
- reinvestment ceiling: [DATA-36](#data-36-answer-google-ads-questions-from-live-data)
- relationships endpoint: [BILL-13](#bill-13-check-a-clients-authorisation-status)
- release slot: [OPS-10](#ops-10-claim-release-and-track-a-ci-deployment-slot)
- releases: [OPS-85](#ops-85-obtain-and-use-github-app-api-tokens)
- relief claims: [HMRC-17](#hmrc-17-manage-itsa-losses-and-claims)
- remedy budget: [OPS-79](#ops-79-track-an-alarm-familys-daily-remedy-budget)
- remedy row: [OPS-21](#ops-21-auto-close-resolved-alarm-issues), [OPS-22](#ops-22-verify-a-triage-draft-pr-stays-in-scope)
- remove bundle: [BILL-03](#bill-03-delete-a-bundle)
- rental income: [HMRC-14](#hmrc-14-submit-and-manage-uk-property-periodic-updates)
- rental property: [HMRC-15](#hmrc-15-submit-and-manage-the-uk-property-annual-summary)
- report a vulnerability: [OPS-65](#ops-65-document-security-policy-and-disclosure)
- report_identity_audit.md: [OPS-63](#ops-63-report-identity-audit-findings)
- report_session file: [DEV-37](#dev-37-write-the-session-report)
- repository contents: [DEV-22](#dev-22-clean-and-update-local-build-state)
- repository structure check: [DEV-21](#dev-21-verify-module-wiring-and-repository-shape)
- request cache: [SITE-16](#site-16-configure-the-frontend-via-toml-and-env-libraries)
- request-holding-cert.yml: [OPS-49](#ops-49-request-and-renew-the-holding-page-certificate)
- requestidprefix: [DATA-23](#data-23-classify-visitor-kind-as-human-bot-or-synthetic)
- required env vars: [OPS-34](#ops-34-validate-github-actions-workflow-files)
- required status check: [OPS-29](#ops-29-verify-commit-signatures-on-pull-requests)
- required status checks: [OPS-60](#ops-60-guide-github-repository-configuration)
- required vars: [OPS-84](#ops-84-validate-required-environment-variables-at-startup)
- resident tier: [BILL-21](#bill-21-sweep-lapsed-diya-gl-books), [BILL-22](#bill-22-check-diya-gl-retention-entitlement)
- resident-pro: [BILL-04](#bill-04-enforce-bundle-entitlement-on-a-request), [BILL-22](#bill-22-check-diya-gl-retention-entitlement)
- resident-pro licence: [BILL-33](#bill-33-enforce-and-consume-activity-tokens)
- resource manager: [DATA-45](#data-45-apply-ga4-and-gcp-iam-role-bindings)
- resource name: [OPS-82](#ops-82-provide-a-shared-dynamodb-client)
- resource naming: [OPS-125](#ops-125-name-and-tag-cdk-resources-consistently)
- resource policy: [OPS-44](#ops-44-hash-and-rotate-the-subject-id-salt)
- resource_forbidden: [HMRC-32](#hmrc-32-register-and-verify-hmrc-developer-hub-application-config)
- responsible disclosure: [OPS-65](#ops-65-document-security-policy-and-disclosure)
- restore drill: [OPS-50](#ops-50-drill-and-test-pitr-database-restoration)
- restore permissions: [OPS-111](#ops-111-provision-cross-account-backup-vaults-and-plans)
- restore prod: [OPS-109](#ops-109-disaster-recovery-restore-into-a-new-prod-account)
- restore salt: [OPS-44](#ops-44-hash-and-rotate-the-subject-id-salt)
- resume work: [DEV-36](#dev-36-resume-normal-work-from-cool-down)
- retention: [BILL-17](#bill-17-upload-a-diya-gl-book), [BILL-22](#bill-22-check-diya-gl-retention-entitlement)
- retention days: [OPS-125](#ops-125-name-and-tag-cdk-resources-consistently)
- retrieveuserbundles: [BILL-02](#bill-02-list-a-users-bundles-and-token-balance)
- retry navigation: [DEV-19](#dev-19-provide-shared-behaviour-test-fixtures-and-steps)
- retryable error: [OPS-87](#ops-87-process-sqs-message-batches-in-lambda-workers)
- return url allow-list: [BILL-24](#bill-24-create-a-stripe-checkout-session)
- returning submitters: [DATA-29](#data-29-sql-views-submission-and-compliance)
- reusable workflow: [OPS-33](#ops-33-enforce-workflow-to-workflow-permission-grants)
- reuse: [DEV-43](#dev-43-find-existing-tooling-before-building-any)
- revenue daily: [DATA-28](#data-28-sql-views-revenue-and-subscription)
- revenue view: [DATA-09](#data-09-reconcile-stripe-payments-into-the-lake)
- review: [BILL-44](#bill-44-document-the-price-update-project)
- review thread check: [DEV-32](#dev-32-merge-every-pr-that-is-ready)
- revival: [DEV-36](#dev-36-resume-normal-work-from-cool-down)
- revival notes: [DEV-35](#dev-35-cool-down-an-overloaded-batch)
- right to be forgotten: [OPS-40](#ops-40-delete-a-customers-data-for-gdpr-erasure)
- role diff apply: [DATA-45](#data-45-apply-ga4-and-gcp-iam-role-bindings)
- role prompt: [DEV-25](#dev-25-maintain-the-specialist-agent-prompt-library)
- root domain: [OPS-133](#ops-133-serve-the-root-domain-holding-page)
- rotated-at: [OPS-45](#ops-45-manage-aws-secrets-manager-entries-and-rotation-tags)
- rotation tag: [OPS-45](#ops-45-manage-aws-secrets-manager-entries-and-rotation-tags)
- route53: [OPS-04](#ops-04-update-route53cloudfront-origins-for-a-domain)
- route53 alias: [OPS-127](#ops-127-upsert-route53-alias-records-via-custom-resource)
- route53 records: [OPS-135](#ops-135-look-up-domains-and-cloudfront-distributions)
- ruleset evaluation: [DATA-11](#data-11-run-glue-data-quality-checks)
- rum ga4 agreement: [DATA-23](#data-23-classify-visitor-kind-as-human-bot-or-synthetic)
- rum injection: [OPS-07](#ops-07-lean-deploy-app-code-to-lambda-and-s3)
- rum placeholders: [DATA-25](#data-25-configure-and-gate-cloudwatch-rum)
- run budget: [OPS-20](#ops-20-enforce-daily-run-budgets-for-agent-paths)
- run_for_clients: [MCP-09](#mcp-09-run-a-client-scoped-tool-across-every-practice-client)
- runbook_information_security.md: [OPS-64](#ops-64-runbook-information-security-operations)
- runtime config: [SITE-16](#site-16-configure-the-frontend-via-toml-and-env-libraries)
- runtime lifecycle: [OPS-130](#ops-130-track-runtime-and-dependency-lifecycle)
- s3 bucket grant: [BILL-39](#bill-39-cdk-diya-gl-stack)
- s3 buckets: [OPS-113](#ops-113-provision-the-dynamodb-and-s3-data-stack)
- s3 deployment: [OPS-120](#ops-120-provision-the-publish-stack)
- s3 lake: [DATA-12](#data-12-provision-the-analytics-lake-and-athena-workgroup)
- s3 lifecycle: [OPS-128](#ops-128-generate-s3-lifecycle-rules-for-storage-tiering)
- s3 listing: [BILL-19](#bill-19-list-a-users-diya-gl-books)
- s3 repository: [BILL-23](#bill-23-store-diya-gl-books-in-s3)
- s3 retrieval: [BILL-20](#bill-20-fetch-a-versioned-diya-gl-book)
- s3 sync: [OPS-07](#ops-07-lean-deploy-app-code-to-lambda-and-s3), [DATA-20](#data-20-publish-the-nightly-raw-export-for-indexing)
- sa103: [MCP-06](#mcp-06-derive-itsa-quarterly-and-annual-submission-figures)
- safe logger: [OPS-86](#ops-86-provide-structured-pii-redacting-logging)
- safe parsing: [CH-11](#ch-11-parse-xml-safely)
- sales fee split: [MCP-13](#mcp-13-import-stripe-transaction-and-payout-lines)
- salt canary: [BILL-40](#bill-40-migrate-the-hashed-sub-salt)
- salt metadata: [OPS-105](#ops-105-copy-production-data-to-backup-for-migration)
- salt rotation: [BILL-40](#bill-40-migrate-the-hashed-sub-salt), [OPS-44](#ops-44-hash-and-rotate-the-subject-id-salt)
- salt secret: [OPS-45](#ops-45-manage-aws-secrets-manager-entries-and-rotation-tags)
- same commit: [OPS-01](#ops-01-cancel-superseded-push-triggered-deploys)
- same slot: [OPS-11](#ops-11-queue-ci-branch-deploys-in-creation-order)
- sandbox: [BILL-41](#bill-41-backfill-the-stripe-test-mode-qualifier), [DEV-01](#dev-01-run-the-http-simulator-server)
- sandbox authorisation: [HMRC-33](#hmrc-33-drive-hmrcs-sandbox-authorisation-flow-for-test-scripts)
- sandbox login: [DEV-03](#dev-03-simulate-hmrc-oauth)
- sandbox obligations: [HMRC-28](#hmrc-28-format-and-match-hmrc-obligations)
- sandbox tier: [BILL-22](#bill-22-check-diya-gl-retention-entitlement)
- sar: [OPS-41](#ops-41-export-a-customers-gdpr-subject-access-data)
- save_book: [MCP-03](#mcp-03-load-and-save-diya-gl-books-via-mcp)
- sbom: [OPS-39](#ops-39-generate-a-software-bill-of-materials)
- sc 1.2.1: [OPS-90](#ops-90-encode-captured-video-frames-and-captions)
- scan and batch-write: [OPS-109](#ops-109-disaster-recovery-restore-into-a-new-prod-account)
- scan detection: [OPS-74](#ops-74-detect-waf-blocked-scan-attacks)
- scan detection alarm: [OPS-122](#ops-122-provision-the-security-detection-stack)
- scan rate: [OPS-73](#ops-73-detect-404-scan-rate-attacks)
- scannable code: [SITE-19](#site-19-generate-qr-codes)
- scene script: [OPS-52](#ops-52-auto-record-demo-videos-on-prod-deploy), [OPS-88](#ops-88-orchestrate-demo-video-recording-journeys), [DEV-40](#dev-40-record-a-product-demo-video)
- scene script validation: [OPS-91](#ops-91-validate-video-scene-scripts-and-timing)
- scenes to record: [OPS-91](#ops-91-validate-video-scene-scripts-and-timing)
- scheduled alert: [OPS-37](#ops-37-check-https-certificate-expiry)
- scheduled check: [OPS-32](#ops-32-detect-cloudformation-drift)
- scheduled lambda: [BILL-05](#bill-05-reconcile-bundle-capacity-counters), [BILL-21](#bill-21-sweep-lapsed-diya-gl-books)
- scheduled pr: [OPS-36](#ops-36-configure-dependabot-dependency-updates)
- scheduled query: [DATA-39](#data-39-sync-ga4-in-bigquery-scheduled-queries)
- scheduled scan: [OPS-30](#ops-30-run-codeql-security-scanning)
- schema: [OPS-91](#ops-91-validate-video-scene-scripts-and-timing)
- schema change: [OPS-16](#ops-16-run-dynamodb-data-migrations)
- screen reader: [OPS-95](#ops-95-generate-wcag-accessibility-compliance-rows)
- screenshot captions: [DEV-19](#dev-19-provide-shared-behaviour-test-fixtures-and-steps)
- scripted demo: [DEV-11](#dev-11-practice-the-vat-journey-in-the-browser-embedded-simulator)
- se-derivations: [MCP-06](#mcp-06-derive-itsa-quarterly-and-annual-submission-figures)
- search: [CH-03](#ch-03-search-the-companies-house-register)
- search campaign create: [DATA-32](#data-32-sync-the-google-ads-account)
- secret scan: [OPS-92](#ops-92-redact-secrets-from-video-artefacts)
- secrets in logs: [OPS-81](#ops-81-mask-and-redact-sensitive-data-from-logs)
- secrets manager: [HMRC-23](#hmrc-23-exchange-an-hmrc-oauth-code-for-a-token), [BILL-30](#bill-30-sync-the-stripe-productprice-catalogue), [BILL-32](#bill-32-provision-stripe-secrets), [OPS-45](#ops-45-manage-aws-secrets-manager-entries-and-rotation-tags), [OPS-106](#ops-106-replicate-secrets-across-aws-accounts), [DEV-15](#dev-15-fetch-and-publish-proxy-variant-secrets)
- secrets manager inventory: [OPS-107](#ops-107-list-production-secrets-manager-entries)
- secrets manager oauth: [DATA-48](#data-48-stage-paypal-transactions-for-reconciliation)
- section 6.6: [OPS-64](#ops-64-runbook-information-security-operations)
- security baseline: [OPS-121](#ops-121-provision-the-security-baseline-stack)
- security detection: [OPS-73](#ops-73-detect-404-scan-rate-attacks)
- security detection stack: [OPS-122](#ops-122-provision-the-security-detection-stack)
- security hub: [OPS-117](#ops-117-provision-the-observability-stack)
- security hub findings: [OPS-75](#ops-75-run-nightly-security-lake-analysis)
- security hub standards: [OPS-121](#ops-121-provision-the-security-baseline-stack)
- security incident: [OPS-110](#ops-110-force-logout-all-users-during-a-security-incident)
- security lake: [OPS-75](#ops-75-run-nightly-security-lake-analysis)
- security lint: [DEV-23](#dev-23-configure-the-test-and-lint-toolchains)
- security policy: [OPS-65](#ops-65-document-security-policy-and-disclosure)
- security review: [OPS-31](#ops-31-run-a-claude-security-review-on-push)
- security review prompt: [DEV-25](#dev-25-maintain-the-specialist-agent-prompt-library)
- security scan: [OPS-30](#ops-30-run-codeql-security-scanning)
- security state: [OPS-46](#ops-46-query-and-persist-per-consumer-security-state-records)
- security-review.yml: [OPS-31](#ops-31-run-a-claude-security-review-on-push)
- security.md: [OPS-65](#ops-65-document-security-policy-and-disclosure)
- seed book.toml: [MCP-11](#mcp-11-seed-a-book-from-a-workbook-set)
- self assessment: [DEV-09](#dev-09-simulate-hmrc-itsa-mtd-api)
- self employment business api: [MCP-06](#mcp-06-derive-itsa-quarterly-and-annual-submission-figures)
- self-destruct: [OPS-13](#ops-13-auto-destroy-stale-ci-deployments)
- self-employment: [HMRC-09](#hmrc-09-retrieve-itsa-business-details), [DEV-09](#dev-09-simulate-hmrc-itsa-mtd-api)
- self-employment allowances: [HMRC-13](#hmrc-13-submit-and-manage-the-self-employment-annual-summary)
- self-employment bsas: [HMRC-16](#hmrc-16-trigger-and-adjust-the-business-source-adjustable-summary)
- self-employment period: [HMRC-12](#hmrc-12-submit-and-manage-self-employment-periodic-updates)
- self-pacing: [DEV-30](#dev-30-run-the-delivery-cycle-unattended)
- sensitive fields: [OPS-81](#ops-81-mask-and-redact-sensitive-data-from-logs)
- sensitivepathscan: [OPS-74](#ops-74-detect-waf-blocked-scan-attacks)
- session beacon: [SITE-04](#site-04-track-visits-via-session-beacon)
- session funnel: [DATA-06](#data-06-pull-ga4-reports-and-bigquery-event-export)
- session report: [DEV-24](#dev-24-document-developer-setup-and-repository-conventions), [DEV-37](#dev-37-write-the-session-report)
- session status: [BILL-25](#bill-25-retrieve-a-stripe-checkout-sessions-status)
- session storage: [CH-01](#ch-01-exchange-a-companies-house-oauth-token)
- sessions by host source: [DATA-05](#data-05-pull-ga4-daily-bigquery-aggregate-tables)
- set origins: [OPS-04](#ops-04-update-route53cloudfront-origins-for-a-domain)
- settle in-flight work: [DEV-35](#dev-35-cool-down-an-overloaded-batch)
- setup guide: [DEV-24](#dev-24-document-developer-setup-and-repository-conventions)
- sha256: [SITE-17](#site-17-trace-and-secure-client-requests)
- shared auth client: [DATA-47](#data-47-authenticate-google-cloud-scripts-via-federated-credentials)
- shared client: [OPS-82](#ops-82-provide-a-shared-dynamodb-client)
- shared construct: [OPS-124](#ops-124-define-shared-lambda-cdk-constructs)
- shared query layer: [DATA-33](#data-33-read-the-google-ads-account-inventory)
- shared worktree staging: [DATA-50](#data-50-resolve-finance-staging-directory-paths)
- short ttl: [OPS-46](#ops-46-query-and-persist-per-consumer-security-state-records)
- sideways relief: [HMRC-17](#hmrc-17-manage-itsa-losses-and-claims)
- sign in: [SITE-01](#site-01-sign-customers-in-via-cognito), [MCP-02](#mcp-02-authenticate-mcp-sessions-via-cognito)
- signature verify: [SITE-02](#site-02-verify-jwts-at-the-api-gateway)
- signing controls: [OPS-63](#ops-63-report-identity-audit-findings)
- signup to first submission: [DATA-29](#data-29-sql-views-submission-and-compliance)
- silent local failure: [OPS-47](#ops-47-check-fraud-prevention-header-record-freshness)
- simulator behaviour test: [DEV-12](#dev-12-prove-the-client-status-stack-and-fetchauth)
- simulator build: [SITE-08](#site-08-bootstrap-the-app-server)
- simulator deployment: [DEV-10](#dev-10-deploy-the-public-demo-simulator)
- simulator practice: [DEV-11](#dev-11-practice-the-vat-journey-in-the-browser-embedded-simulator)
- single stack deploy: [OPS-08](#ops-08-deploy-a-single-cdk-stack-on-demand)
- site map: [SITE-12](#site-12-map-the-site-structure)
- site-video-capture: [OPS-52](#ops-52-auto-record-demo-videos-on-prod-deploy)
- slot pool: [OPS-10](#ops-10-claim-release-and-track-a-ci-deployment-slot)
- slow the flow: [DEV-35](#dev-35-cool-down-an-overloaded-batch)
- smoke test: [OPS-27](#ops-27-run-probe-tests-against-deployed-environments)
- sns: [SITE-03](#site-03-capture-feedback-interest), [OPS-72](#ops-72-forward-bedrock-budget-alerts)
- sns findings topic: [OPS-117](#ops-117-provision-the-observability-stack)
- sns notification: [OPS-111](#ops-111-provision-cross-account-backup-vaults-and-plans), [DATA-16](#data-16-alert-on-cost-budget-and-anomaly-thresholds)
- software composition: [OPS-39](#ops-39-generate-a-software-bill-of-materials)
- sonnet escalation: [OPS-18](#ops-18-run-alarm-and-support-triage)
- source accounts: [OPS-104](#ops-104-set-up-cross-account-backup-iam-roles)
- spdx: [DEV-20](#dev-20-check-spdx-licence-headers)
- specialist agent: [DEV-25](#dev-25-maintain-the-specialist-agent-prompt-library)
- spreadsheets contract: [HMRC-08](#hmrc-08-parse-vat-returns-from-a-bulk-csv-file)
- spreadsheets product: [SITE-11](#site-11-promote-sibling-products-and-partners)
- sqs: [OPS-87](#ops-87-process-sqs-message-batches-in-lambda-workers)
- ssm parameter: [OPS-19](#ops-19-kill-switch-to-stop-unattended-agent-workflows), [OPS-77](#ops-77-silence-alarms-during-deployment-teardown)
- sso window: [DEV-30](#dev-30-run-the-delivery-cycle-unattended)
- stack: [CH-14](#ch-14-provision-the-companies-house-cdk-stack)
- stack job: [OPS-01](#ops-01-cancel-superseded-push-triggered-deploys)
- stack output: [OPS-136](#ops-136-retrieve-cloudformation-stack-outputs)
- stack wiring: [OPS-123](#ops-123-wire-cdk-application-entrypoints-per-account)
- stackname: [OPS-08](#ops-08-deploy-a-single-cdk-stack-on-demand)
- staging directory: [DATA-50](#data-50-resolve-finance-staging-directory-paths)
- stale deployment sweep: [DEV-34](#dev-34-clean-up-stale-deployments-and-branches)
- standalone cdk app: [DATA-17](#data-17-export-aws-billing-data-in-focus-format)
- standalone harness: [HMRC-35](#hmrc-35-spike-test-the-itsa-sandbox-oauth-and-business-details-flow)
- static analysis: [OPS-30](#ops-30-run-codeql-security-scanning)
- static pages: [SITE-10](#site-10-serve-general-site-pages)
- status clear: [HMRC-02](#hmrc-02-retrieve-a-submitted-vat-return)
- status codes: [SITE-07](#site-07-format-http-responses-and-errors)
- status messages: [SITE-14](#site-14-render-page-chrome-and-widgets)
- status stack: [DEV-12](#dev-12-prove-the-client-status-stack-and-fetchauth)
- stdio: [MCP-01](#mcp-01-expose-the-submission-mcp-server-and-tools)
- steady-state target: [DATA-30](#data-30-sql-views-cost)
- step definitions: [HMRC-36](#hmrc-36-provide-itsa-behaviour-test-step-helpers)
- step functions: [DATA-22](#data-22-orchestrate-the-nightly-ingestion-workflow)
- stop agents: [OPS-19](#ops-19-kill-switch-to-stop-unattended-agent-workflows)
- storage namespace: [DEV-10](#dev-10-deploy-the-public-demo-simulator)
- storage tiering: [OPS-128](#ops-128-generate-s3-lifecycle-rules-for-storage-tiering)
- strategy: [SITE-20](#site-20-document-business-governance-and-positioning)
- stray project: [DATA-41](#data-41-assert-gcp-billing-budget-and-stray-project)
- stripe: [BILL-24](#bill-24-create-a-stripe-checkout-session), [BILL-25](#bill-25-retrieve-a-stripe-checkout-sessions-status), [BILL-26](#bill-26-open-the-stripe-customer-billing-portal), [BILL-27](#bill-27-recover-an-abandoned-checkout), [BILL-28](#bill-28-process-stripe-webhook-events), [BILL-30](#bill-30-sync-the-stripe-productprice-catalogue), [BILL-31](#bill-31-configure-stripe-account-policies), [BILL-32](#bill-32-provision-stripe-secrets), [OPS-35](#ops-35-verify-third-party-console-configuration-against-declared-state)
- stripe balance transactions: [DATA-49](#data-49-stage-stripe-transactions-for-reconciliation)
- stripe gross fee split: [DATA-51](#data-51-turn-staged-stripe-activity-into-diya-gl-lines)
- stripe import: [MCP-13](#mcp-13-import-stripe-transaction-and-payout-lines)
- stripe listen: [DEV-19](#dev-19-provide-shared-behaviour-test-fixtures-and-steps)
- stripe payouts: [DATA-49](#data-49-stage-stripe-transactions-for-reconciliation)
- stripe price by interval: [BILL-35](#bill-35-load-and-query-the-productactivity-catalogue)
- stripe reconciliation: [DATA-09](#data-09-reconcile-stripe-payments-into-the-lake), [DATA-51](#data-51-turn-staged-stripe-activity-into-diya-gl-lines)
- stripe retry: [BILL-38](#bill-38-cdk-billing-webhook-stack)
- stripe revenue: [DATA-28](#data-28-sql-views-revenue-and-subscription)
- stripe secret grant: [BILL-37](#bill-37-cdk-billing-app-stack)
- stripe secrets: [DEV-15](#dev-15-fetch-and-publish-proxy-variant-secrets)
- stripe sync: [DEV-39](#dev-39-sync-stripe-products-and-prices-from-the-catalogue)
- stripe test mode: [BILL-41](#bill-41-backfill-the-stripe-test-mode-qualifier)
- stripe-sync.js: [DEV-39](#dev-39-sync-stripe-products-and-prices-from-the-catalogue)
- stripe.toml secret: [DATA-49](#data-49-stage-stripe-transactions-for-reconciliation)
- structured logging: [OPS-83](#ops-83-emit-cloudwatch-emf-metrics), [OPS-86](#ops-86-provide-structured-pii-redacting-logging)
- style guide: [DEV-38](#dev-38-write-plain-human-prose)
- sub: [SITE-02](#site-02-verify-jwts-at-the-api-gateway)
- sub-agent persona: [OPS-54](#ops-54-define-specialized-claude-code-sub-agent-personas)
- subhasher: [OPS-44](#ops-44-hash-and-rotate-the-subject-id-salt)
- subject id salt: [OPS-44](#ops-44-hash-and-rotate-the-subject-id-salt)
- submission failure: [DEV-42](#dev-42-look-up-a-vat-submission-failure-alarms-customer)
- submissions daily: [DATA-29](#data-29-sql-views-submission-and-compliance)
- submit vat: [HMRC-01](#hmrc-01-submit-a-vat-return)
- submit-ci: [OPS-58](#ops-58-document-multi-account-aws-architecture)
- submit-deployment-role: [OPS-69](#ops-69-assume-and-clear-local-aws-deployment-credentials)
- submit-prod: [OPS-58](#ops-58-document-multi-account-aws-architecture)
- submit.bundle.js: [BILL-43](#bill-43-build-the-frontend-test-bundle)
- submit.env: [SITE-16](#site-16-configure-the-frontend-via-toml-and-env-libraries), [DATA-24](#data-24-load-ga4-analytics-on-site-pages)
- submit.js: [SITE-18](#site-18-bootstrap-the-frontend-module-bundle)
- submit/analytics namespace: [DATA-21](#data-21-publish-nightly-business-metrics-to-cloudwatch)
- submit_vat_return: [MCP-07](#mcp-07-file-vat-returns-and-accounts-via-api)
- submitsharednames: [DEV-13](#dev-13-generate-the-openapi-spec-from-cdk-route-definitions)
- submitstackprops: [OPS-123](#ops-123-wire-cdk-application-entrypoints-per-account)
- submitvat worker: [HMRC-01](#hmrc-01-submit-a-vat-return)
- subscription: [BILL-01](#bill-01-grant-a-bundle-to-a-user)
- subscription bundle: [DEV-39](#dev-39-sync-stripe-products-and-prices-from-the-catalogue)
- subscription cancellations: [DATA-28](#data-28-sql-views-revenue-and-subscription)
- subscription filter: [OPS-74](#ops-74-detect-waf-blocked-scan-attacks)
- subscription payment: [BILL-24](#bill-24-create-a-stripe-checkout-session)
- subscription renewals: [DATA-28](#data-28-sql-views-revenue-and-subscription)
- subscription updated: [BILL-28](#bill-28-process-stripe-webhook-events)
- subscriptions: [DATA-04](#data-04-stream-dynamodb-table-changes-into-the-lake)
- subscriptions snapshot: [DATA-09](#data-09-reconcile-stripe-payments-into-the-lake)
- superseded deploy: [OPS-01](#ops-01-cancel-superseded-push-triggered-deploys)
- supplier invoices: [MCP-12](#mcp-12-read-invoices-from-the-local-mail-index)
- supply chain: [OPS-39](#ops-39-generate-a-software-bill-of-materials)
- support category: [OPS-56](#ops-56-structure-github-issues-prs-and-funding-links)
- support ticket: [SITE-05](#site-05-submit-support-tickets)
- support ticket lookup: [DEV-42](#dev-42-look-up-a-vat-submission-failure-alarms-customer)
- support triage: [OPS-18](#ops-18-run-alarm-and-support-triage), [DEV-25](#dev-25-maintain-the-specialist-agent-prompt-library)
- supportedidentityproviders: [DEV-16](#dev-16-manage-the-durable-cognito-test-user-lifecycle)
- suppress alerts: [OPS-77](#ops-77-silence-alarms-during-deployment-teardown)
- swagger spec: [DEV-13](#dev-13-generate-the-openapi-spec-from-cdk-route-definitions)
- swagger ui: [DEV-06](#dev-06-simulate-hmrc-test-user-provisioning-and-api-docs)
- sweep: [OPS-13](#ops-13-auto-destroy-stale-ci-deployments)
- synthetic bundle toggle: [SITE-14](#site-14-render-page-chrome-and-widgets)
- synthetic data: [CH-12](#ch-12-generate-synthetic-test-companies)
- synthetic period key: [HMRC-28](#hmrc-28-format-and-match-hmrc-obligations)
- synthetic user: [OPS-12](#ops-12-clean-up-expired-test-users), [DEV-16](#dev-16-manage-the-durable-cognito-test-user-lifecycle)
- synthetics runtime: [OPS-130](#ops-130-track-runtime-and-dependency-lifecycle)
- system test: [DEV-01](#dev-01-run-the-http-simulator-server)
- system tests: [OPS-26](#ops-26-run-the-automated-test-suite-in-ci)
- table change: [DATA-04](#data-04-stream-dynamodb-table-changes-into-the-lake)
- table name lookup: [OPS-136](#ops-136-retrieve-cloudformation-stack-outputs)
- tagging: [BILL-23](#bill-23-store-diya-gl-books-in-s3)
- tax liability: [HMRC-18](#hmrc-18-manage-itsa-tax-liability-adjustments), [HMRC-19](#hmrc-19-calculate-itsa-tax-liability)
- tax liability adjustments: [HMRC-18](#hmrc-18-manage-itsa-tax-liability-adjustments), [DEV-09](#dev-09-simulate-hmrc-itsa-mtd-api)
- tax year: [HMRC-11](#hmrc-11-retrieve-itsa-status), [HMRC-19](#hmrc-19-calculate-itsa-tax-liability), [HMRC-20](#hmrc-20-retrieve-itsa-crystallisation-obligations), [HMRC-21](#hmrc-21-submit-the-itsa-final-declaration), [HMRC-27](#hmrc-27-validate-hmrc-identifiers-dates-and-amounts)
- tax year 2025-26: [HMRC-12](#hmrc-12-submit-and-manage-self-employment-periodic-updates)
- taxonomy schema: [CH-13](#ch-13-map-the-frc-ixbrl-taxonomy-and-validate-accounts)
- tear down deployment: [OPS-14](#ops-14-destroy-a-named-prod-deployment-on-demand)
- teardown: [OPS-13](#ops-13-auto-destroy-stale-ci-deployments), [OPS-77](#ops-77-silence-alarms-during-deployment-teardown)
- teardown prod deployment: [OPS-14](#ops-14-destroy-a-named-prod-deployment-on-demand)
- telegram: [OPS-70](#ops-70-forward-operational-activity-events-to-telegram), [OPS-72](#ops-72-forward-bedrock-budget-alerts), [OPS-35](#ops-35-verify-third-party-console-configuration-against-declared-state)
- telegram alert: [HMRC-26](#hmrc-26-monitor-hmrc-fraud-prevention-header-compliance), [DATA-01](#data-01-publish-activity-events-to-the-bus)
- telegram forwarder: [DATA-16](#data-16-alert-on-cost-budget-and-anomaly-thresholds)
- terms: [SITE-10](#site-10-serve-general-site-pages)
- test bundle: [BILL-43](#bill-43-build-the-frontend-test-bundle)
- test company: [CH-12](#ch-12-generate-synthetic-test-companies)
- test data generator: [DEV-11](#dev-11-practice-the-vat-journey-in-the-browser-embedded-simulator)
- test discovery: [DEV-23](#dev-23-configure-the-test-and-lint-toolchains)
- test helpers: [DEV-18](#dev-18-provide-shared-unitsystem-test-fixtures)
- test mode: [BILL-25](#bill-25-retrieve-a-stripe-checkout-sessions-status)
- test naming: [DEV-26](#dev-26-enforce-claude-code-conventions-via-rules-and-hooks)
- test report: [DEV-17](#dev-17-export-and-embed-dynamodb-test-state-in-reports)
- test step: [DEV-19](#dev-19-provide-shared-behaviour-test-fixtures-and-steps)
- test suite: [OPS-26](#ops-26-run-the-automated-test-suite-in-ci)
- test support api: [HMRC-34](#hmrc-34-file-a-full-itsa-tax-year-in-sandbox)
- test user: [DEV-06](#dev-06-simulate-hmrc-test-user-provisioning-and-api-docs), [DEV-16](#dev-16-manage-the-durable-cognito-test-user-lifecycle)
- test-data-link: [DEV-12](#dev-12-prove-the-client-status-stack-and-fetchauth)
- test_auth_password: [OPS-68](#ops-68-provision-and-assume-roles-for-test-user-provisioning)
- test_auth_username: [OPS-68](#ops-68-provision-and-assume-roles-for-test-user-provisioning)
- testcontext: [DEV-17](#dev-17-export-and-embed-dynamodb-test-state-in-reports)
- text spacing: [OPS-96](#ops-96-scan-pages-for-accessibility-violations)
- third-party console: [OPS-35](#ops-35-verify-third-party-console-configuration-against-declared-state)
- threat detection: [OPS-75](#ops-75-run-nightly-security-lake-analysis)
- tidy repo: [DEV-34](#dev-34-clean-up-stale-deployments-and-branches)
- time budget: [OPS-57](#ops-57-dispatch-agentic-lib-board-backlog-and-pr-agents)
- time window: [OPS-76](#ops-76-gather-alarm-evidence-for-investigation)
- timeout: [CH-10](#ch-10-fetch-http-with-a-timeout)
- timer pill: [OPS-89](#ops-89-overlay-pointer-and-caption-cues-on-video)
- timing checks: [OPS-91](#ops-91-validate-video-scene-scripts-and-timing)
- tls cert check: [OPS-37](#ops-37-check-https-certificate-expiry)
- token: [BILL-33](#bill-33-enforce-and-consume-activity-tokens)
- token balance: [BILL-02](#bill-02-list-a-users-bundles-and-token-balance)
- token charge: [BILL-06](#bill-06-generate-a-token-charged-pass)
- token counts: [DEV-37](#dev-37-write-the-session-report)
- token exchange: [CH-01](#ch-01-exchange-a-companies-house-oauth-token)
- token limit: [OPS-72](#ops-72-forward-bedrock-budget-alerts)
- token refresh: [SITE-01](#site-01-sign-customers-in-via-cognito), [BILL-34](#bill-34-prefetch-and-retry-a-cognito-token-refresh)
- token refresh retry: [SITE-09](#site-09-track-and-poll-async-api-requests)
- toml parser: [SITE-16](#site-16-configure-the-frontend-via-toml-and-env-libraries)
- tool registry: [MCP-01](#mcp-01-expose-the-submission-mcp-server-and-tools)
- toolkit stack: [OPS-98](#ops-98-bootstrap-the-cdk-toolkit-across-accounts)
- totp: [DEV-16](#dev-16-manage-the-durable-cognito-test-user-lifecycle)
- traceparent: [SITE-17](#site-17-trace-and-secure-client-requests)
- trademarks: [SITE-20](#site-20-document-business-governance-and-positioning)
- traffic by country: [DATA-27](#data-27-sql-views-activity-and-traffic)
- traffic report: [DATA-06](#data-06-pull-ga4-reports-and-bigquery-event-export)
- traffic sources: [DATA-27](#data-27-sql-views-activity-and-traffic)
- traffic views: [DATA-13](#data-13-catalogue-cloudfront-access-logs-for-athena)
- trailing window: [DATA-18](#data-18-publish-the-nightly-operator-dashboard-snapshot)
- training video: [DEV-40](#dev-40-record-a-product-demo-video)
- transaction: [CH-05](#ch-05-file-a-change-of-registered-office-address), [CH-06](#ch-06-file-a-change-of-registered-email-address), [CH-09](#ch-09-query-and-submit-document-transactions)
- transaction lifecycle: [DEV-04](#dev-04-simulate-companies-house-identity-and-filing)
- transaction_status: [DATA-48](#data-48-stage-paypal-transactions-for-reconciliation)
- transcript: [OPS-90](#ops-90-encode-captured-video-frames-and-captions), [OPS-92](#ops-92-redact-secrets-from-video-artefacts)
- trend: [DATA-18](#data-18-publish-the-nightly-operator-dashboard-snapshot)
- trend deep link: [DATA-26](#data-26-render-the-operator-objectives-dashboard)
- triage: [OPS-76](#ops-76-gather-alarm-evidence-for-investigation)
- triage agent: [OPS-18](#ops-18-run-alarm-and-support-triage)
- triage workflow: [OPS-78](#ops-78-verify-an-alarm-issues-claimed-transition), [OPS-79](#ops-79-track-an-alarm-familys-daily-remedy-budget)
- triage-generated pr: [OPS-22](#ops-22-verify-a-triage-draft-pr-stays-in-scope)
- ttl: [BILL-42](#bill-42-parse-iso-8601-durations-for-expiry)
- ttl backfill: [OPS-108](#ops-108-backfill-ttl-on-existing-dynamodb-records)
- ttl policy: [OPS-113](#ops-113-provision-the-dynamodb-and-s3-data-stack)
- typeahead: [CH-03](#ch-03-search-the-companies-house-register)
- typeofbusiness: [HMRC-16](#hmrc-16-trigger-and-adjust-the-business-source-adjustable-summary)
- typing cadence: [OPS-91](#ops-91-validate-video-scene-scripts-and-timing)
- uk gdpr: [OPS-42](#ops-42-guide-icogdpr-compliance)
- uk property: [DEV-09](#dev-09-simulate-hmrc-itsa-mtd-api)
- uk property annual: [HMRC-15](#hmrc-15-submit-and-manage-the-uk-property-annual-summary)
- uk property bsas: [HMRC-16](#hmrc-16-trigger-and-adjust-the-business-source-adjustable-summary)
- uk property business: [HMRC-09](#hmrc-09-retrieve-itsa-business-details)
- uk property period: [HMRC-14](#hmrc-14-submit-and-manage-uk-property-periodic-updates)
- unassign: [BILL-03](#bill-03-delete-a-bundle)
- unattended agent: [OPS-17](#ops-17-redact-and-gate-unattended-agent-output-before-publishing), [OPS-19](#ops-19-kill-switch-to-stop-unattended-agent-workflows)
- unattended agent workflow: [DATA-15](#data-15-catalogue-workflow-probe-and-agent-run-data)
- unattended loop: [DEV-30](#dev-30-run-the-delivery-cycle-unattended)
- unit tests: [OPS-26](#ops-26-run-the-automated-test-suite-in-ci)
- unlimited sentinel: [BILL-33](#bill-33-enforce-and-consume-activity-tokens)
- unlisted: [OPS-93](#ops-93-publish-demo-videos-to-youtube)
- unlisted to public: [DEV-41](#dev-41-publish-videos-to-the-youtube-channel)
- unrecognised identity: [OPS-28](#ops-28-enforce-commit-identity-allowlist)
- unset iam session: [OPS-69](#ops-69-assume-and-clear-local-aws-deployment-credentials)
- unsigned commit: [OPS-29](#ops-29-verify-commit-signatures-on-pull-requests)
- unsigned jwt: [DEV-02](#dev-02-simulate-local-app-oauth)
- unverified issue: [SITE-05](#site-05-submit-support-tickets)
- updateuserbundles: [BILL-03](#bill-03-delete-a-bundle)
- upload book: [BILL-17](#bill-17-upload-a-diya-gl-book)
- upsert record: [OPS-127](#ops-127-upsert-route53-alias-records-via-custom-resource)
- us-east-1: [OPS-118](#ops-118-provision-the-observability-stack-in-us-east-1)
- usage history: [SITE-10](#site-10-serve-general-site-pages)
- user attributes: [OPS-137](#ops-137-export-cognito-users-for-reporting-or-backup)
- user books: [BILL-19](#bill-19-list-a-users-diya-gl-books)
- user management lambda: [OPS-119](#ops-119-provision-the-ops-stack)
- user pool: [SITE-01](#site-01-sign-customers-in-via-cognito), [OPS-137](#ops-137-export-cognito-users-for-reporting-or-backup)
- user provisioning role: [OPS-68](#ops-68-provision-and-assume-roles-for-test-user-provisioning)
- user-agent classification: [DATA-23](#data-23-classify-visitor-kind-as-human-bot-or-synthetic)
- user-restricted api: [HMRC-33](#hmrc-33-drive-hmrcs-sandbox-authorisation-flow-for-test-scripts)
- utr: [HMRC-27](#hmrc-27-validate-hmrc-identifiers-dates-and-amounts)
- validate workflows: [OPS-34](#ops-34-validate-github-actions-workflow-files)
- validatelines: [DATA-51](#data-51-turn-staged-stripe-activity-into-diya-gl-lines)
- validity: [BILL-08](#bill-08-check-a-passs-validity)
- vat account: [HMRC-05](#hmrc-05-retrieve-vat-payments), [HMRC-06](#hmrc-06-retrieve-vat-penalties)
- vat box config: [HMRC-07](#hmrc-07-build-and-validate-9-box-vat-return-data)
- vat boxes: [MCP-05](#mcp-05-derive-vat-figures-via-mcp-tools)
- vat endpoints: [OPS-112](#ops-112-provision-the-api-gateway-stack)
- vat journey: [DEV-11](#dev-11-practice-the-vat-journey-in-the-browser-embedded-simulator)
- vat liabilities: [HMRC-04](#hmrc-04-retrieve-vat-liabilities)
- vat logic: [OPS-97](#ops-97-compile-the-compliance-audit-report)
- vat mtd: [DEV-08](#dev-08-simulate-hmrc-vat-mtd-api)
- vat obligations: [HMRC-01](#hmrc-01-submit-a-vat-return), [HMRC-03](#hmrc-03-retrieve-vat-obligations)
- vat payments: [HMRC-05](#hmrc-05-retrieve-vat-payments)
- vat penalties: [HMRC-06](#hmrc-06-retrieve-vat-penalties)
- vat receipt: [HMRC-22](#hmrc-22-store-and-retrieve-hmrc-submission-receipts)
- vat refund: [HMRC-04](#hmrc-04-retrieve-vat-liabilities)
- vat return: [HMRC-01](#hmrc-01-submit-a-vat-return), [HMRC-02](#hmrc-02-retrieve-a-submitted-vat-return), [MCP-05](#mcp-05-derive-vat-figures-via-mcp-tools), [DEV-08](#dev-08-simulate-hmrc-vat-mtd-api)
- vat return body: [HMRC-07](#hmrc-07-build-and-validate-9-box-vat-return-data)
- vat return csv: [HMRC-08](#hmrc-08-parse-vat-returns-from-a-bulk-csv-file)
- vat scheme: [HMRC-01](#hmrc-01-submit-a-vat-return)
- vat validation: [HMRC-07](#hmrc-07-build-and-validate-9-box-vat-return-data)
- vatinterface: [MCP-05](#mcp-05-derive-vat-figures-via-mcp-tools)
- vatreturncsverror: [HMRC-08](#hmrc-08-parse-vat-returns-from-a-bulk-csv-file)
- vendor ip: [HMRC-25](#hmrc-25-build-hmrc-fraud-prevention-headers)
- vendored library: [SITE-19](#site-19-generate-qr-codes)
- verification field: [OPS-29](#ops-29-verify-commit-signatures-on-pull-requests)
- verify ingestion jobs: [DATA-22](#data-22-orchestrate-the-nightly-ingestion-workflow)
- verify pipeline: [DATA-22](#data-22-orchestrate-the-nightly-ingestion-workflow)
- verify setup: [OPS-102](#ops-102-verify-the-multi-account-aws-setup)
- verify transition: [OPS-78](#ops-78-verify-an-alarm-issues-claimed-transition)
- versioned fetch: [BILL-20](#bill-20-fetch-a-versioned-diya-gl-book)
- versioning: [BILL-17](#bill-17-upload-a-diya-gl-book)
- video artefacts: [OPS-92](#ops-92-redact-secrets-from-video-artefacts)
- video capture: [OPS-52](#ops-52-auto-record-demo-videos-on-prod-deploy), [OPS-88](#ops-88-orchestrate-demo-video-recording-journeys), [DEV-40](#dev-40-record-a-product-demo-video)
- video encode: [OPS-90](#ops-90-encode-captured-video-frames-and-captions)
- video manifest: [OPS-93](#ops-93-publish-demo-videos-to-youtube)
- video publish: [DEV-41](#dev-41-publish-videos-to-the-youtube-channel)
- videos page: [OPS-94](#ops-94-play-demo-videos-on-the-public-site)
- view vat return: [HMRC-02](#hmrc-02-retrieve-a-submitted-vat-return)
- viewer request: [OPS-131](#ops-131-serve-cloudfront-custom-error-pages)
- visibility: [BILL-23](#bill-23-store-diya-gl-books-in-s3)
- visitor classification: [SITE-04](#site-04-track-visits-via-session-beacon)
- visitor kind: [DATA-23](#data-23-classify-visitor-kind-as-human-bot-or-synthetic)
- visitor_kind property: [DATA-24](#data-24-load-ga4-analytics-on-site-pages)
- visitors by kind: [DATA-27](#data-27-sql-views-activity-and-traffic)
- vitest config: [DEV-23](#dev-23-configure-the-test-and-lint-toolchains)
- vrn: [HMRC-27](#hmrc-27-validate-hmrc-identifiers-dates-and-amounts), [DEV-06](#dev-06-simulate-hmrc-test-user-provisioning-and-api-docs)
- vulnerability disclosure: [OPS-65](#ops-65-document-security-policy-and-disclosure)
- waf: [OPS-74](#ops-74-detect-waf-blocked-scan-attacks)
- waf log subscription: [OPS-115](#ops-115-provision-the-edgecloudfront-stack)
- wait for ci deploys: [OPS-11](#ops-11-queue-ci-branch-deploys-in-creation-order)
- wait for main deploy: [OPS-24](#ops-24-gate-probes-on-the-main-apex-deploy)
- wake: [DEV-36](#dev-36-resume-normal-work-from-cool-down)
- warm route: [SITE-13](#site-13-warm-backend-routes-via-prefetch-scripts)
- watch: [DEV-31](#dev-31-watch-github-ci-to-green)
- watch ci: [OPS-134](#ops-134-monitor-github-actions-ci-from-the-cli)
- wave dispatch: [DEV-28](#dev-28-work-nextmd-as-dispatched-sub-agents)
- wcag: [OPS-97](#ops-97-compile-the-compliance-audit-report), [OPS-62](#ops-62-report-accessibility-penetration-testing)
- wcag 1.4.12: [OPS-96](#ops-96-scan-pages-for-accessibility-violations)
- wcag 2.2: [OPS-95](#ops-95-generate-wcag-accessibility-compliance-rows)
- wcag standard: [DATA-14](#data-14-catalogue-compliance-findings-for-the-dashboard)
- web assets: [OPS-120](#ops-120-provision-the-publish-stack)
- web-test-local: [DEV-17](#dev-17-export-and-embed-dynamodb-test-state-in-reports)
- web/public-simulator: [DEV-10](#dev-10-deploy-the-public-demo-simulator)
- webhook: [BILL-28](#bill-28-process-stripe-webhook-events)
- webhook endpoints: [BILL-30](#bill-30-sync-the-stripe-productprice-catalogue)
- webhook signing secret: [BILL-32](#bill-32-provision-stripe-secrets)
- webhook stack: [BILL-38](#bill-38-cdk-billing-webhook-stack)
- webhooks: [OPS-60](#ops-60-guide-github-repository-configuration)
- webvtt: [OPS-90](#ops-90-encode-captured-video-frames-and-captions)
- weekly schedule: [OPS-38](#ops-38-run-the-weekly-compliance-test-check)
- weekly verification: [OPS-53](#ops-53-verify-youtube-channel-consistency-weekly)
- what does the repo do: [DEV-43](#dev-43-find-existing-tooling-before-building-any)
- window globals: [SITE-18](#site-18-bootstrap-the-frontend-module-bundle)
- withdraw invite: [BILL-14](#bill-14-cancel-a-pending-client-authorisation-invite)
- workbook set: [MCP-11](#mcp-11-seed-a-book-from-a-workbook-set)
- worker handler: [HMRC-30](#hmrc-30-persist-async-hmrc-api-request-state)
- workflow lint: [OPS-34](#ops-34-validate-github-actions-workflow-files)
- workflow permissions: [OPS-33](#ops-33-enforce-workflow-to-workflow-permission-grants)
- workflow_dispatch: [BILL-11](#bill-11-generate-admin-passes-from-cli-or-workflow), [OPS-01](#ops-01-cancel-superseded-push-triggered-deploys)
- workload identity: [OPS-67](#ops-67-apply-google-cloud--ga4-infrastructure)
- workload identity federation: [DATA-06](#data-06-pull-ga4-reports-and-bigquery-event-export), [DATA-37](#data-37-federate-lambda-credentials-to-google-cloud)
- workload identity pool: [DATA-42](#data-42-sync-gcp-workload-identity-and-org-policy)
- workspace mirror: [DATA-20](#data-20-publish-the-nightly-raw-export-for-indexing)
- worktree catalogue: [DEV-32](#dev-32-merge-every-pr-that-is-ready)
- worktree removal: [DEV-34](#dev-34-clean-up-stale-deployments-and-branches)
- worktree sub-agents: [DEV-28](#dev-28-work-nextmd-as-dispatched-sub-agents)
- write-cred-configs: [DATA-42](#data-42-sync-gcp-workload-identity-and-org-policy)
- write-truncated table: [DATA-39](#data-39-sync-ga4-in-bigquery-scheduled-queries)
- writing style: [DEV-38](#dev-38-write-plain-human-prose)
- x-ray: [OPS-76](#ops-76-gather-alarm-evidence-for-investigation)
- x-ray console: [OPS-80](#ops-80-build-aws-console-deep-links-for-operators)
- x-request-id: [SITE-17](#site-17-trace-and-secure-client-requests)
- xbrl validator: [CH-13](#ch-13-map-the-frc-ixbrl-taxonomy-and-validate-accounts)
- xlsx export: [MCP-03](#mcp-03-load-and-save-diya-gl-books-via-mcp)
- xml: [CH-11](#ch-11-parse-xml-safely)
- xml gateway: [CH-08](#ch-08-file-micro-entity-accounts-to-companies-house), [CH-11](#ch-11-parse-xml-safely), [DEV-04](#dev-04-simulate-companies-house-identity-and-filing)
- xml submission: [CH-05](#ch-05-file-a-change-of-registered-office-address)
- xmldom: [CH-11](#ch-11-parse-xml-safely)
- xxe: [CH-11](#ch-11-parse-xml-safely)
- yaml syntax: [OPS-34](#ops-34-validate-github-actions-workflow-files)
- year-end: [HMRC-13](#hmrc-13-submit-and-manage-the-self-employment-annual-summary)
- year-end calculation: [HMRC-16](#hmrc-16-trigger-and-adjust-the-business-source-adjustable-summary)
- year-end summary: [HMRC-15](#hmrc-15-submit-and-manage-the-uk-property-annual-summary)
- youtube channel config: [DATA-46](#data-46-configure-the-youtube-channel-as-code)
- youtube check: [OPS-53](#ops-53-verify-youtube-channel-consistency-weekly)
- youtube client secret: [DATA-44](#data-44-assert-google-oauth-client-configuration)
- youtube data api: [DATA-46](#data-46-configure-the-youtube-channel-as-code)
- youtube upload: [OPS-93](#ops-93-publish-demo-videos-to-youtube), [DEV-41](#dev-41-publish-videos-to-the-youtube-channel)
- youtube-check.yml: [OPS-53](#ops-53-verify-youtube-channel-consistency-weekly)
- youtube-upload.js: [DATA-46](#data-46-configure-the-youtube-channel-as-code), [DEV-41](#dev-41-publish-videos-to-the-youtube-channel)
- zip package: [BILL-17](#bill-17-upload-a-diya-gl-book)
<!-- /generated:keywords -->

## Method

The entries come from a per-file walk of the repository.

- **Files.** `git ls-files` filtered to `.js`, `.mjs`, `.java`, `.yml`, `.toml`, `.sh`, `.html`, `.sql` and `.md`, excluding `reference/`, `web/public/tests/`, `web/public/docs/`, `web/public-simulator/` and `_developers/hmrc/`: 1,295 files at the first build.
- **Walk.** 13 batches balanced by line count; one agent per batch wrote one JSON line per file (`{"file", "capabilities": [{"name", "outline"}]}`) to `target/capabilities/batch-NN.jsonl`.
- **Grouping.** One pass merged each Lambda with its test, CDK wiring, page and behaviour test into one capability, sorted them into the eight areas, and checked each outline against its source.
- **Fields.** One agent per area rewrote each capability into the fields above, grouped it, and checked every Run command against `package.json`, the workflow's `workflow_dispatch` inputs, or the script's own argument parsing.
- **Contents.** `npm run capabilities:index` writes the Index, the area and group contents and the Keywords from the entries. `app/unit-tests/capabilitiesIndex.test.js` fails when they are stale.

To keep the file current after changes, follow `.claude/skills/capabilities/SKILL.md`. For a full rebuild, repeat the walk, the grouping and the fields steps, then run `npm run capabilities:index`.
