// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The Companies House forms this site files through the XML gateway, one row per filing kind: the
// kind its filing state and receipt carry, the route segment it files under, the words its receipt
// and its events use, and, for a form whose filing route is the shared one in
// app/services/companiesHouseFormFiling.js, its gateway form identifier, its schema in
// fixtures/companies-house-xmlgw and its catalogue activity. A plain ES module, so the browser and
// app/ both read it.

export const COMPANIES_HOUSE_FORMS = {
  "accounts": {
    routeSegment: "accounts",
    receiptTitle: "Annual accounts",
    receiptTitleCy: "Cyfrifon blynyddol",
    acceptedEvent: "companies-house-accounts-accepted",
    acceptedSummary: "Companies House micro-entity accounts accepted",
  },
  "confirmation-statement": {
    routeSegment: "confirmation-statement",
    receiptTitle: "Confirmation statement",
    receiptTitleCy: "Datganiad cadarnhau",
    acceptedEvent: "companies-house-confirmation-statement-accepted",
    acceptedSummary: "Companies House confirmation statement accepted",
  },
  "psc-verification-statement": {
    routeSegment: "psc-verification-statement",
    receiptTitle: "PSC verification statement",
    receiptTitleCy: "Datganiad gwirio PRhA",
    acceptedEvent: "companies-house-psc-verification-statement-accepted",
    acceptedSummary: "Companies House PSC verification statement accepted",
    formIdentifier: "PSCVerificationStatement",
    schema: "PSCVerificationStatement-v1-0.xsd",
    activityId: "file-psc-verification-statement",
    label: "PSC verification statement",
  },
  "psc-cessation": {
    routeSegment: "psc-cessation",
    receiptTitle: "PSC cessation",
    receiptTitleCy: "Peidio â bod yn PRhA",
    acceptedEvent: "companies-house-psc-cessation-accepted",
    acceptedSummary: "Companies House PSC cessation accepted",
    formIdentifier: "PSCCessation",
    schema: "PSCCessation-v1-2.xsd",
    activityId: "cease-psc",
    label: "PSC cessation",
    sharedPoll: true,
  },
  "psc-change-details": {
    routeSegment: "psc-change-details",
    receiptTitle: "PSC change of details",
    receiptTitleCy: "Newid manylion PRhA",
    acceptedEvent: "companies-house-psc-change-details-accepted",
    acceptedSummary: "Companies House PSC change of details accepted",
    formIdentifier: "PSCChangeDetails",
    schema: "PSCChangeDetails-v1-2.xsd",
    activityId: "change-psc-details",
    label: "PSC change of details",
    sharedPoll: true,
  },
  "accounting-reference-date": {
    routeSegment: "accounting-reference-date",
    receiptTitle: "Change of accounting reference date",
    receiptTitleCy: "Newid dyddiad cyfeirnod cyfrifyddu",
    acceptedEvent: "companies-house-accounting-reference-date-accepted",
    acceptedSummary: "Companies House change of accounting reference date accepted",
    formIdentifier: "ChangeAccountingReferenceDate",
    schema: "ChangeAccountingReferenceDate-v2-7.xsd",
    activityId: "change-accounting-reference-date",
    label: "change of accounting reference date",
    sharedPoll: true,
  },
};

/** The filing kinds, as the filing state and the receipts carry them. */
export const COMPANIES_HOUSE_FORM_KINDS = Object.keys(COMPANIES_HOUSE_FORMS);

/** The path a form files under. */
export function companiesHouseFormPath(kind) {
  return `/api/v1/companies-house/${COMPANIES_HOUSE_FORMS[kind].routeSegment}`;
}

/** The shared path a form whose row says sharedPoll is polled under, for one submission. */
export function companiesHouseFormPollPath(kind, submissionNumber) {
  return `/api/v1/companies-house/forms/${kind}/${submissionNumber}`;
}

/** The receipt title of each kind in a language, "en" or "cy". */
export function companiesHouseReceiptTitles(language) {
  return Object.fromEntries(
    Object.entries(COMPANIES_HOUSE_FORMS).map(([kind, form]) => [kind, language === "cy" ? form.receiptTitleCy : form.receiptTitle]),
  );
}
