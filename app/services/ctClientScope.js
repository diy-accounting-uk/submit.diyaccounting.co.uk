// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/ctClientScope.js
// The client scope of the three Company Tax Return routes: a practice filing the CT600 for a client
// as its agent. Agent filing is part of the practice journey, so a client-scoped request is refused
// unless the catalogue's `practice` activity is listed in the environment. A return that carries a
// joint filing id is half of an accounts and tax return pair, and is refused unless the catalogue's
// `file-company-tax-return-with-accounts` activity is enabled in the environment and the caller's
// bundles include one of its bundles.

import { enforceBundles } from "./bundleManagement.js";
import { loadCatalogFromRoot, isActivityListedInEnvironment } from "./productCatalog.js";
import { previewRunsAgainstSandbox } from "../lib/previewFeatures.js";
import { http403ForbiddenResponse } from "../lib/httpResponseHelper.js";
import { http403ForbiddenFromBundleEnforcement } from "./companiesHouseApi.js";

const PRACTICE_ACTIVITY_ID = "practice";
const JOINT_FILING_ACTIVITY_ID = "file-company-tax-return-with-accounts";

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
 * @returns {Promise<{userSub: string, client: object|null, bundleIds: string[]}|{refusal: object}>}
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
    const { userSub, client, bundleIds } = await enforceBundles(event, { clientId });
    return { userSub, client, bundleIds };
  } catch (error) {
    return { refusal: http403ForbiddenFromBundleEnforcement(error, request) };
  }
}

/**
 * Refuse a request that carries a joint filing id when the joint filing activity is not enabled in
 * this environment, or the caller holds none of its bundles. A request without a joint filing id
 * is not refused here.
 *
 * @param {object} event - the Lambda event
 * @param {object} request - the parsed request, for the response
 * @param {boolean} carriesJointFilingId - the request body names a joint filing id
 * @param {string[]} heldBundleIds - the caller's bundles that matched the route, from enforceCtBundles
 * @returns {object|undefined} the 403 response, or undefined when the request may go on
 */
export function refuseJointFilingWhenNotEnabled(event, request, carriesJointFilingId, heldBundleIds) {
  if (!carriesJointFilingId) return undefined;
  const activity = loadCatalogFromRoot().activities?.find((candidate) => candidate.id === JOINT_FILING_ACTIVITY_ID);
  const environmentName = process.env.ENVIRONMENT_NAME;
  const enabled = isActivityListedInEnvironment(activity, environmentName) || previewRunsAgainstSandbox(event, request?.pathname);
  if (!activity || !enabled) {
    return http403ForbiddenResponse({
      request,
      message: "Forbidden: filing the accounts and the Company Tax Return together is not available in this environment",
      error: { code: "ACTIVITY_ENVIRONMENT_RESTRICTED", activityId: JOINT_FILING_ACTIVITY_ID, environmentName },
    });
  }
  const requiredBundleIds = activity.bundles ?? [];
  if (requiredBundleIds.length > 0 && !requiredBundleIds.some((id) => heldBundleIds?.includes(id))) {
    return http403ForbiddenResponse({
      request,
      message: `Forbidden: filing the accounts and the Company Tax Return together requires ${requiredBundleIds.join(" or ")} bundle`,
      error: { code: "BUNDLE_FORBIDDEN", activityId: JOINT_FILING_ACTIVITY_ID, requiredBundleIds },
    });
  }
  return undefined;
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
