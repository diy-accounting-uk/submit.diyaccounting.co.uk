// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/ctClientScope.js
// The client scope of the three Company Tax Return routes: a practice filing the CT600 for a client
// as its agent. Agent filing is part of the practice journey, so a client-scoped request is refused
// unless the catalogue's `practice` activity is listed in the environment.

import { enforceBundles } from "./bundleManagement.js";
import { loadCatalogFromRoot, isActivityListedInEnvironment } from "./productCatalog.js";
import { http403ForbiddenResponse } from "../lib/httpResponseHelper.js";
import { http403ForbiddenFromBundleEnforcement } from "./companiesHouseApi.js";

const PRACTICE_ACTIVITY_ID = "practice";

function practiceListedInEnvironment() {
  const activity = loadCatalogFromRoot().activities?.find((candidate) => candidate.id === PRACTICE_ACTIVITY_ID);
  return isActivityListedInEnvironment(activity, process.env.ENVIRONMENT_NAME);
}

/**
 * Enforce the bundles of a Company Tax Return route, with the client scope when the request has
 * one. A client request needs the practice licence, a live client row of this practice, and the
 * `practice` activity listed in this environment.
 *
 * @param {object} event - the Lambda event
 * @param {object} request - the parsed request, for the response
 * @param {string} [clientId]
 * @returns {Promise<{userSub: string, client: object|null}|{refusal: object}>}
 */
export async function enforceCtBundles(event, request, clientId) {
  if (clientId && !practiceListedInEnvironment()) {
    return {
      refusal: http403ForbiddenResponse({
        request,
        message: "Forbidden: filing for a client is not available in this environment",
        error: { code: "CLIENT_SCOPE_ENVIRONMENT_RESTRICTED", clientId },
      }),
    };
  }
  try {
    const { userSub, client } = await enforceBundles(event, { clientId });
    return { userSub, client };
  } catch (error) {
    return { refusal: http403ForbiddenFromBundleEnforcement(error, request) };
  }
}

/**
 * The message for HMRC's error 1046 on a client filing, or undefined for any other errors.
 * @param {{number: string|undefined}[]} errors
 * @returns {string|undefined}
 */
export function clientAuthorisationMessage(errors) {
  if (!errors.some((error) => error.number === "1046")) return undefined;
  return "HMRC did not accept these Government Gateway credentials for this company. Use the practice's own agent user ID with Corporation Tax enrolled. Check that the company has authorised the practice for Corporation Tax, by form 64-8 or online. A new authorisation can take up to 72 hours to reach HMRC's systems.";
}
