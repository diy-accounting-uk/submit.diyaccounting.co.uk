<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# DIY Accounting Submit - Next Steps

This project allows UK businesses to submit tax returns to HMRC under the Making Tax Digital (MTD) framework. It simplifies interactions through HMRC’s official APIs, providing streamlined VAT submissions initially via a straightforward web interface.

---

## 🛂 HMRC Approval & Onboarding

### HMRC Approval Checklist:

* Register at [HMRC Developer Hub](https://developer.service.hmrc.gov.uk)
* Sandbox tests (VAT obligations & return submissions)
* Implement fraud prevention headers
* Email [SDSTeam@hmrc.gov.uk](mailto:SDSTeam@hmrc.gov.uk) after successful sandbox testing
* Complete HMRC questionnaires
* Accept Terms of Use

### HMRC OAuth Flow:

* User redirected to HMRC consent
* HMRC returns authorization code
* Exchange authorization code for access token

---

### 1. Developer Registration

* **Create an account** on the [HMRC Developer Hub](https://developer.service.hmrc.gov.uk) and sign in ([developer.service.hmrc.gov.uk][1]).
* **Register your application**:

    * Choose sandbox or production environment.
    * Subscribe to relevant MTD APIs (e.g., VAT, Income Tax) ([Infor Documentation][2], [Microsoft Learn][3]).
    * HMRC provides a **Client ID** and **Secret**.

---

### 2. Sandbox Setup

* In sandbox mode, you can **create test users** via the "Create Test User" API. You can choose between individual, organisation, or agent test users. Each includes credentials like user ID, password, VAT, SA‑UTR, etc. ([developer.service.hmrc.gov.uk][4]).
* These test users act as HMRC-registered customers in the sandbox environment.

---

### 3. Configure Redirect URIs and Scopes

* Add one or more **redirect URIs** in the Developer Hub configuration so HMRC knows where to return users after OAuth login ([Infor Documentation][2]).
* Set OAuth scopes, such as `read:vat` and `write:vat`, to control API access ([Microsoft Learn][3]).

---

### 4. Obtain Authorization Code (OAuth 2.0)

* The app redirects the user (or test user) to HMRC’s OAuth authorization endpoint with the chosen scopes.
* The user logs in with their HMRC credentials (Government Gateway account or test user) and **grants consent**.
* HMRC returns an **authorization code** to the redirect URI ([Microsoft Learn][3]).

---

### 5. Exchange Code for Tokens

* Your backend exchanges the authorization code for an **access token** (and optionally a refresh token). The service enforces secure TLS 1.2 connections.
* These tokens are used to authenticate subsequent calls to HMRC’s MTD APIs.

---

### 6. API Subscription and Access

* Once tokens are obtained, your application can access endpoints like:

    * `/organisations/vat/{vrn}/obligations` to fetch VAT periods
    * `POST /organisations/vat/{vrn}/returns` to submit returns
      ([Microsoft Learn][3]).
* For production use, apps must go through HMRC’s **production approval** and meet requirements like fraud headers, STS, and logging ([developer.service.hmrc.gov.uk][5]).

---

### 7. Agent Onboarding (for Tax Agents)

* Agents require an **Agent Services Account (ASA)** in addition to a GOV.UK account ([Clear Books Support][6]).
* They use the **Agent Authorisation API** to authorise for clients ([developer.service.hmrc.gov.uk][1]).

---

### 8. Production Approval

* HMRC enforces compliance through monitoring and safeguards to ensure:

    * Secure data handling
    * Streamlined customer journeys
    * Fraud prevention mechanisms
      ([developer.service.hmrc.gov.uk][5], [docs.data-community.publishing.service.gov.uk][7], [GOV.UK][8]).

---

### 🗺️ Summary Flowchart

1. Developer registers app → gets credentials
2. Create sandbox test user (optional)
3. Configure scopes & redirect URI
4. Redirect user → HMRC login → consent
5. Receive authorization code → exchange tokens
6. Use token to call MTD APIs
7. (Agent case) Use Agent Auth API
8. Ensure production readiness & HMRC approval

---

[1]: https://developer.service.hmrc.gov.uk/api-documentation/docs/api?utm_source=chatgpt.com "API Documentation - HMRC Developer Hub - GOV.UK"
[2]: https://docs.infor.com/csdis/2022.x/en-us/useradminlib_csd_cloud/saolh/mrz1553526224446.html?utm_source=chatgpt.com "Setting up VAT HMRC digital reporting - Infor Documentation Central"
[3]: https://learn.microsoft.com/en-us/dynamics365/finance/localizations/united-kingdom/emea-gbr-mtd-vat-integration-sandbox?utm_source=chatgpt.com "Test interoperation with the MTD VAT sandbox | Dynamics 365"
[4]: https://developer.service.hmrc.gov.uk/api-test-user?utm_source=chatgpt.com "Create test user - HMRC Developer Hub - GOV.UK"
[5]: https://developer.service.hmrc.gov.uk/guides/vat-mtd-end-to-end-service-guide/?utm_source=chatgpt.com "VAT (MTD) end-to-end service guide"
[6]: https://support.clearbooks.co.uk/support/solutions/articles/33000232533-mtd-onboarding-for-partners?utm_source=chatgpt.com "MTD onboarding for Partners - VAT - Clear Books Support"
[7]: https://docs.data-community.publishing.service.gov.uk/get-started/onboard-data-labs/?utm_source=chatgpt.com "New starter onboarding - Data Services"
[8]: https://www.gov.uk/government/consultations/better-use-of-new-and-improved-third-party-data/better-use-of-new-and-improved-third-party-data-to-make-it-easier-to-pay-tax-right-first-time?utm_source=chatgpt.com "Better use of new and improved third-party data to make it ... - GOV.UK"

---

# 📅 HMRC Onboarding

Here’s a detailed look at HMRC’s **production approval** process for MTD (Making Tax Digital), especially for VAT — covering criteria, requirements, testing, and final sign‑off:

---

## 🛡️ 1. Objectives & Minimum Standards

HMRC’s approval focuses on two key goals:

* Ensuring a **streamlined, end‑to‑end experience** for businesses.
* Protecting customer data and guarding against fraud ([developer.service.hmrc.gov.uk][1]).

To qualify for production credentials, **at minimum your software must**:

1. Send all **required fraud prevention headers**.
2. Support **retrieving VAT obligations** via the API.
3. Perform **VAT return submission** over the appropriate endpoint ([developer.service.hmrc.gov.uk][1]).

Optional—but highly recommended—features include:

* Retrieving customer information.
* Viewing past returns, liabilities, payments, and penalties.
* Handling amendments and appeals ([Microsoft Learn][2], [developer.service.hmrc.gov.uk][1]).

---

## 🔐 2. Fraud Prevention Headers

Your application must include full fraud‑prevention headers in every API call. HMRC uses a **Test Fraud Prevention Headers API** to validate their accuracy before granting approval ([developer.service.hmrc.gov.uk][3]).

---

## 🧪 3. Testing Requirements (Sandbox Phase)

Before production, complete these sandbox tests:

1. **Create a test-user** of type “organisation” via the HMRC test-user API.
2. **Retrieve VAT obligations** to confirm you handle obligation data.
3. **Submit a VAT return** for the open obligation period.
4. Optionally, test additional endpoints if your product uses them ([developer.service.hmrc.gov.uk][3]).

Your software must also:

* Gracefully handle errors and rate limits.
* Clearly instruct users (e.g., advising them to log in with correct credentials).
* Avoid unnecessary or excessive API calls ([developer.service.hmrc.gov.uk][3]).

---

## 📤 4. Requesting Production Credentials

Once sandbox testing is complete:

* Email **[SDSTeam@hmrc.gov.uk](mailto:SDSTeam@hmrc.gov.uk)** within **two weeks** of finishing your tests, so they can review log entries.
* Expect a ten-working-day turnaround ([developer.service.hmrc.gov.uk][3]).
* You’ll be asked to complete **two questionnaires** about your fraud-prevention implementation and API testing ([developer.service.hmrc.gov.uk][3]).

Importantly, sign **HMRC’s Terms of Use** before production credentials can be issued ([developer.service.hmrc.gov.uk][3]).

---

## ✅ 5. Post‑Approval Steps

After approval:

1. **Obtain production credentials** (Client ID/secret).
2. Make a **live VAT return submission** using actual VRNs; HMRC will verify this live submission before you can be listed as MTD‑approved ([developer.service.hmrc.gov.uk][3]).
3. Once confirmed, you can appear on GOV.UK’s official list of HMRC-approved software.

---

## 🧭 Summary of Approval Process

1. **Build** key features: fraud headers, obligation fetch, return submission.
2. **Test thoroughly** in sandbox with required endpoints.
3. **Engage HMRC**:

    * Email SDSTeam with test logs.
    * Fill out questionnaires.
    * Accept Terms of Use.
4. **Receive production credentials**.
5. **Submit live return** for official verification.
6. **Get listed** on HMRC’s approved software register.

---

[1]: https://developer.service.hmrc.gov.uk/guides/vat-mtd-end-to-end-service-guide?utm_source=chatgpt.com "VAT (MTD) end-to-end service guide"
[2]: https://learn.microsoft.com/en-us/dynamics365/finance/localizations/united-kingdom/emea-gbr-mtd-vat-integration-authorization?utm_source=chatgpt.com "Authorize your Finance environment to interoperate with HMRC's ..."
[3]: https://developer.service.hmrc.gov.uk/guides/vat-mtd-end-to-end-service-guide/?utm_source=chatgpt.com "VAT (MTD) end-to-end service guide"

---
