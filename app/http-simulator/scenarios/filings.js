// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/filings.js
// Fixture state for the Companies House filing simulator: an in-memory transaction store keyed
// by transaction id, plus per-company registered office address and registered email eligibility
// answers. The registered offices come from fixtures/register.js, so the public register lookup and
// the filing fixture agree on the same company.

import { randomInt } from "crypto";
import { registerCompany, addressLine1 } from "../fixtures/register.js";

// Deliberately fails the transaction close with a 422 validation error naming the postcode, so
// the behaviour and system tests can exercise the validation-error rendering.
const VALIDATION_ERROR_COMPANY_NUMBER = "00000422";

// The registered email address filing changes an existing address; it does not set the first
// one. This company answers INVALID_NO_REGISTERED_EMAIL_ADDRESS_EXISTS on the eligibility check
// so the page's eligibility stop can be exercised.
export const NO_REGISTERED_EMAIL_COMPANY_NUMBER = "00000003";

const officeOf = (company) => ({
  etag: `simulator-etag-${company.number.toLowerCase()}`,
  premises: company.address.premises,
  address_line_1: addressLine1(company.address),
  address_line_2: "",
  locality: company.address.locality,
  region: "",
  postal_code: company.address.postalCode,
  country: company.address.country,
});

const registeredOfficeAddresses = new Map([
  ...["00000001", "SC000001", "00000004"].map((number) => [number, officeOf(registerCompany(number))]),
  [
    VALIDATION_ERROR_COMPANY_NUMBER,
    {
      etag: "simulator-etag-00000422",
      premises: "41",
      address_line_1: "41 Westgate",
      address_line_2: "",
      locality: "Grantham",
      region: "",
      postal_code: "NG31 6LF",
      country: "England",
    },
  ],
]);

const transactions = new Map();

export function getRegisteredOfficeAddress(companyNumber) {
  return registeredOfficeAddresses.get(companyNumber) || null;
}

export function getEligibilityStatusCode(companyNumber) {
  if (companyNumber === NO_REGISTERED_EMAIL_COMPANY_NUMBER) {
    return "INVALID_NO_REGISTERED_EMAIL_ADDRESS_EXISTS";
  }
  return "COMPANY_VALID_FOR_SERVICE";
}

// A transaction or submission id in the shape Companies House gives one: three groups of six digits.
function companiesHouseId() {
  return Array.from({ length: 3 }, () => String(randomInt(0, 1000000)).padStart(6, "0")).join("-");
}

export function openTransaction({ companyNumber, description, reference }) {
  const id = companiesHouseId();
  const transaction = {
    id,
    status: "open",
    company_number: companyNumber,
    company_name: null,
    description,
    reference,
    resources: {},
    filings: {},
    links: { self: `/transactions/${id}` },
  };
  transactions.set(id, transaction);
  return transaction;
}

export function getTransaction(transactionId) {
  return transactions.get(transactionId) || null;
}

export function hasResource(transactionId, resourceType) {
  const transaction = transactions.get(transactionId);
  return Boolean(transaction?.resources?.[resourceType]);
}

export function putResource(transactionId, resourceType, resource) {
  const transaction = transactions.get(transactionId);
  if (!transaction) return null;
  transaction.resources[resourceType] = resource;
  return resource;
}

// Closes a transaction, running it through the one validation rule the simulator models: the
// reserved company number always fails with a validation error naming the postcode. Returns
// `{ alreadyClosed: true }` when the transaction was already closed, `{ validationErrors }` when
// the reserved company number triggers the validation failure, or `{ transaction }` on success.
export function closeTransaction(transactionId) {
  const transaction = transactions.get(transactionId);
  if (!transaction) return null;

  if (transaction.status === "closed") {
    return { alreadyClosed: true };
  }

  if (transaction.company_number === VALIDATION_ERROR_COMPANY_NUMBER) {
    return {
      validationErrors: [
        {
          type: "ch:validation",
          error: "postal-code-invalid",
          location_type: "json-path",
          location: "$.postal_code",
          error_values: {},
        },
      ],
    };
  }

  transaction.status = "closed";
  transaction.closed_at = new Date().toISOString();
  const submissionId = companiesHouseId();
  transaction.filings = {
    [submissionId]: {
      type: Object.keys(transaction.resources)[0] || "unknown",
      description: transaction.description,
      status: "processing",
      reject_reasons: [],
      processed_at: null,
    },
  };
  return { transaction };
}

// A second GET on a closed transaction flips a "processing" filing to "accepted", so the polling
// path is exercised without a timer. Called after the response for the current GET has already
// been built, so the flip only shows up on the next call.
export function advanceProcessingFilings(transactionId) {
  const transaction = transactions.get(transactionId);
  if (!transaction?.filings) return;
  for (const filing of Object.values(transaction.filings)) {
    if (filing.status === "processing") {
      filing.status = "accepted";
      filing.processed_at = new Date().toISOString();
    }
  }
}
