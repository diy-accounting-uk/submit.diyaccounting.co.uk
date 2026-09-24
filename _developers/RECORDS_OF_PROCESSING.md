<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Records of Processing — Practice Licence Client List

Processed for the practice licence (bundle `resident-pro`, `../../developers/submit/archive/PLAN_PRICE_UPDATE.md:(d)`): a practice (accountant or small firm) subscribes and holds a client list. Clients are individuals and companies the practice has a business relationship with and an agent authorisation for; they have no direct relationship with DIY Accounting Limited.

## Activity 1: Client Roster

| Aspect | Details |
|---|---|
| **Data fields** | Display name, VAT registration number, National Insurance number, Unique Taxpayer Reference, company number; generated client ID (ULID); createdAt and archivedAt timestamps. |
| **Data subjects** | Clients of a practice (individuals and companies). |
| **Purpose** | Enable a practice to store and manage its client roster; support filing on behalf of clients. |
| **Lawful basis** | Contract performance. The practice contracts with DIY Accounting to process the client list; DIY Accounting acts as processor for the roster and controller for its own subscriber records. The practice consents to this processing in their subscription agreement (`../../developers/submit/archive/PLAN_PRICE_UPDATE.md:103-110`). The individual client's separate consent is to the practice, not to this system. |
| **Controller and processor** | Practice subscriber is the individual controlling this data. DIY Accounting Limited acts as processor for roster storage and retrieval, controller for its own logs and audit records. |
| **Storage** | DynamoDB table `{env}-env-practice-clients` (region eu-west-2). Partition key: `hashedSub` (practice subscriber identifier). Sort key: `clientId`. No secondary indexes read `clientId` alone. Point-in-time recovery (PITR) enabled by default. `infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java:873-879`. |
| **Access** | Practice subscriber via authenticated API (`app/functions/practice/*`). DIY Accounting operators for debugging and support (AWS IAM). |
| **Retention** | Client row archived by setting `archivedAt` timestamp; archived rows excluded from active listings but persisted in storage. No rows deleted. `app/functions/practice/practiceClientDelete.js:19,60`. |
| **Transfers** | None. AWS eu-west-2 (London) region only. `web/public/privacy.html:557-577`. |
| **Subject access (SAR)** | Practice subscriber can export their own client roster via their account export route. DIY Accounting operators can retrieve client rows for a specific practice via DynamoDB scan. |
| **Erasure** | Archived clients remain in storage for filing receipt retention purposes. No deletion on request; data subjects' erasure rights are met by archival (exclusion from active use) and notification that filing receipts are retained for HMRC's 7-year requirement (`web/public/privacy.html:531`). |
| **Rectification** | Practice subscriber updates identifiers via API (`app/functions/practice/practiceClientUpdate.js`). Corrections are written to the same row; no version history maintained. |
| **Evidence** | `app/data/dynamoDbPracticeClientRepository.js:70-86` (data fields); `../../developers/submit/archive/PLAN_PRICE_UPDATE.md:103-177` (processing purpose, data subject category); `infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java:873-879` (storage and PITR). |

## Activity 2: HMRC Agent Authorisation State

| Aspect | Details |
|---|---|
| **Data fields** | Service (`MTD-VAT`, `MTD-IT`), invitation ID from HMRC, status (`pending`, `accepted`, `rejected`, `expired`, `authorised`, `unauthorised`), checkedAt timestamp (when status was last verified against HMRC). No client credential or agent ARN stored. |
| **Data subjects** | Clients of a practice (individuals and companies who have signed up for a practice to act as agent). |
| **Purpose** | Track HMRC agent authorisation state per client per service; determine whether the practice can file on the client's behalf. |
| **Lawful basis** | Contract performance. The practice contracts with DIY Accounting to check and store authorisation state; DIY Accounting processes this state on demand to enable filings. |
| **Controller and processor** | Practice subscriber controls whether invitations are issued. DIY Accounting Limited acts as processor, reading HMRC's invitation API and caching state; HMRC (as data controller for tax relationships) owns the authorisation relationship. |
| **Storage** | Nested within the client row in DynamoDB table `{env}-env-practice-clients` (region eu-west-2). Authorisations stored as a map keyed by service. `app/data/dynamoDbPracticeClientRepository.js:247-280` (setClientAuthorisation). |
| **Access** | Practice subscriber can check client authorisation status via `/api/v1/practice/clients/{clientId}/authorisations/{service}` GET endpoint (`app/functions/practice/practiceClientAuthorisationGet.js:103-124`). DIY Accounting operators for debugging. |
| **Retention** | Persists with the client row; archived clients retain their authorisation state in storage but no invitations are issued or checked for archived clients. Checked On Demand: status is refreshed from HMRC's API on each GET request, then cached with a checkedAt timestamp. |
| **Transfers** | Invitations issued via HMRC Agent Authorisation API (outside UK GDPR scope as HMRC is the data controller). Query responses cached locally in eu-west-2 only. No other cross-border transfers. |
| **Subject access (SAR)** | Practice subscriber can retrieve authorisation state for any of their clients via GET endpoint. |
| **Erasure** | Archived clients' authorisation state persists (meets retention for filing receipts). Active clients' authorisation can be revoked by the practice via API; revocation sets status to withdrawn. HMRC's own system holds the canonical state; DIY Accounting's cache is secondary. |
| **Rectification** | Status cannot be directly updated; it is read-only, reflecting HMRC's API response. Client can accept or reject the invitation via HMRC's own Government Gateway interface; DIY Accounting polls that state. |
| **Evidence** | `app/functions/practice/practiceClientAuthorisationInvitePost.js:108-125` (invitation flow); `app/functions/practice/practiceClientAuthorisationGet.js:103-124` (status check and caching); `../../developers/submit/archive/PLAN_PRICE_UPDATE.md:173-176` (stored attributes); `app/data/dynamoDbPracticeClientRepository.js:247-280` (storage method). |

## Activity 3: Filing Receipts Per Client

| Aspect | Details |
|---|---|
| **Data fields** | Filing receipt from HMRC (JSON returned by MTD API: receipt ID, correlation ID, timestamp); associated `clientId` and practice `sub`; timestamp of receipt; time-to-live (TTL) set to 7 years in the future. |
| **Data subjects** | Clients of a practice (individuals and companies whose VAT/tax filings generated receipts). |
| **Purpose** | Record HMRC receipts for each filing on behalf of a client; provide proof of submission to the practice; meet HMRC's 7-year record-keeping requirement. |
| **Lawful basis** | Legal obligation (tax record-keeping requirement, HMRC's expectations under VAT Act 1994, Corporation Tax Act 2009). Contract performance (practice needs proof of filing). |
| **Controller and processor** | HMRC (as data controller for tax records) requires retention. DIY Accounting Limited acts as processor, storing receipts on behalf of the practice and the regulatory requirement. |
| **Storage** | DynamoDB table `{env}-env-receipts` (region eu-west-2). Partition key: `hashedSub` (practice subscriber). Sort key: `receiptId`. Attribute `clientId` added to identify which client the receipt belongs to (`../../developers/submit/archive/PLAN_PRICE_UPDATE.md:(d)`, "The data model"). Time-to-live (TTL): computed 7 years from receipt date (`app/data/dynamoDbReceiptRepository.js:46-49`). DynamoDB TTL enabled on the table (`infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java:101-111`). Point-in-time recovery (PITR) enabled (35-day window). |
| **Access** | Practice subscriber retrieves receipts for their filings via API (`app/functions/filingReceipts*`). DIY Accounting operators for debugging and support. |
| **Retention** | 7 years from filing date, auto-expired via DynamoDB TTL after that period. Before expiry, receipts may be exported as part of account export. Archived clients' receipts are retained for the full 7-year term. |
| **Transfers** | None outside AWS eu-west-2. Receipts from HMRC's API are received and cached locally; no onward transfers. |
| **Subject access (SAR)** | Practice subscriber can export their receipt history via account export route. Individual clients cannot access receipts directly (they are practice's records); they may request them from the practice or from DIY Accounting as the practice's processor. |
| **Erasure** | Receipts cannot be deleted on request before the 7-year legal requirement expires; data subjects are notified that receipts are retained for tax record-keeping (`web/public/privacy.html:531`). After 7 years, DynamoDB TTL auto-expires them. |
| **Rectification** | Receipts are immutable; they are records of what HMRC confirmed. Filing errors are corrected by filing amendments; amended receipts are stored separately. |
| **Evidence** | `app/data/dynamoDbReceiptRepository.js:46-49` (TTL computation); `infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java:101-111` (TTL enabled on table, PITR configured); `../../developers/submit/archive/PLAN_PRICE_UPDATE.md:(d)` ("The data model", clientId attribute); `ICO_CHECKLIST.md` Retention section (7-year requirement); `web/public/privacy.html:531` (user notification of 7-year retention). |
