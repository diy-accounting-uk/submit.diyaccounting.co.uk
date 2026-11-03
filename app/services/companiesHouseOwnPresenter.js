// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseOwnPresenter.js
// Reads a customer's own Companies House presenter id and presenter authentication code from one
// request, so that request presents to the XML Gateway under the customer's presenter and
// Companies House charges its fee to the credit account behind it. The pair lives only in the
// request that carries it: the caller passes it straight to the envelope builders, and nothing
// here or in a caller writes it to a log, an async request record, a receipt or an event. The body
// carries it on filing-data and submit (`ownPresenter: { id, code }`); the status poll is a GET
// and carries it in two headers.

import { getHeader } from "../lib/httpResponseHelper.js";

export const OWN_PRESENTER_ID_HEADER = "X-Presenter-Id";
export const OWN_PRESENTER_CODE_HEADER = "X-Presenter-Code";

const MAX_PRESENTER_CREDENTIAL_LENGTH = 32;
// Letters, digits and the few punctuation marks a Companies House authentication code can carry.
const PRESENTER_CREDENTIAL_PATTERN = /^[A-Za-z0-9._@#$%^*()+=!?-]+$/;

function checkCredential(value, label, errorMessages) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    errorMessages.push(`Missing ${label} - your own presenter needs both the presenter id and the presenter authentication code`);
    return undefined;
  }
  if (trimmed.length > MAX_PRESENTER_CREDENTIAL_LENGTH || !PRESENTER_CREDENTIAL_PATTERN.test(trimmed)) {
    errorMessages.push(`Invalid ${label} - at most ${MAX_PRESENTER_CREDENTIAL_LENGTH} letters, digits or common punctuation, no spaces`);
    return undefined;
  }
  return trimmed;
}

function validatedPair(id, code, errorMessages) {
  const presenterId = checkCredential(id, "presenter id", errorMessages);
  const presenterCode = checkCredential(code, "presenter authentication code", errorMessages);
  return presenterId && presenterCode ? { presenterId, presenterCode } : undefined;
}

/**
 * The customer's own presenter from a parsed request body, or undefined when the body names none.
 * A body that names one with a part missing or malformed adds to errorMessages.
 * @param {object|undefined} parsedBody
 * @param {string[]} errorMessages
 * @returns {{presenterId: string, presenterCode: string}|undefined}
 */
export function readOwnPresenterFromBody(parsedBody, errorMessages) {
  const ownPresenter = parsedBody?.ownPresenter;
  if (ownPresenter === undefined || ownPresenter === null) return undefined;
  if (typeof ownPresenter !== "object" || Array.isArray(ownPresenter)) {
    errorMessages.push("ownPresenter must be an object with an id and a code");
    return undefined;
  }
  return validatedPair(ownPresenter.id, ownPresenter.code, errorMessages);
}

/**
 * The customer's own presenter from the request headers, or undefined when neither header is sent.
 * @param {object|undefined} headers
 * @param {string[]} errorMessages
 * @returns {{presenterId: string, presenterCode: string}|undefined}
 */
export function readOwnPresenterFromHeaders(headers, errorMessages) {
  const id = getHeader(headers, OWN_PRESENTER_ID_HEADER);
  const code = getHeader(headers, OWN_PRESENTER_CODE_HEADER);
  if (id === null && code === null) return undefined;
  return validatedPair(id, code, errorMessages);
}
