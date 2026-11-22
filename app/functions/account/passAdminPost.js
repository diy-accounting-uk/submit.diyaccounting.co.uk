// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-07 Admin-issue a pass
// - **Use when:** an operator or admin must create a pass of any catalogue type with no token charge.
// - **Does:** The passAdminPost.js ingestHandler creates a pass directly via passService.createPass for an operator or a synthetic test user (test users: five bundles, always test passes). It accepts caller-supplied validity, max uses, email restriction (operators only) and notes, with no token charge.
// - **Run:** `POST /api/v1/pass/admin`
// - **Entry:** `app/functions/account/passAdminPost.js:ingestHandler`
// - **Files:** app/functions/account/passAdminPost.js
// - **Keywords:** pass, admin pass, issue pass, operator, createPass, no charge
// - **Related:** BILL-06, BILL-11
// @end-capability

// app/functions/account/passAdminPost.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  getHeader,
  http200OkResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http403ForbiddenResponse,
  http500ServerErrorResponse,
  parseRequestBody,
} from "../../lib/httpResponseHelper.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { isOperatorEmail } from "../../lib/operators.js";
import { isSyntheticTestUserEmail } from "../../lib/syntheticTestUser.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { createPass } from "../../services/passService.js";
import { publishActivityEvent, classifyActor, maskEmail } from "../../lib/activityAlert.js";
import { requestCustomerEmail } from "../../lib/customerEmailRequest.js";
import { loadPassTypesFromRoot, getPassTypeById, loadCatalogFromRoot } from "../../services/productCatalog.js";
import { corsOriginHeaders } from "../../lib/corsOrigins.js";
import { parseIsoDurationToDate } from "../../lib/dateUtils.js";
import { passMayGrantBundle, passGrantsOnlyToOperators } from "../../services/passGrantRule.js";

const logger = createLogger({ source: "app/functions/account/passAdminPost.js" });

const ISO_DURATION = /^P(?=\d)(?:\d+Y)?(?:\d+M)?(?:\d+D)?$/;
const LONGEST_DURATION = "P100Y";

// The reason a duration of a grant cannot be stored, or null: an ISO duration of years, months and
// days that ends on a valid date at most 100 years from now.
function durationProblem(field, value) {
  if (!ISO_DURATION.test(String(value))) return `${field} '${value}' is not an ISO duration`;
  const now = new Date();
  const end = parseIsoDurationToDate(now, String(value));
  if (Number.isNaN(end.getTime())) return `${field} '${value}' does not end on a valid date`;
  if (end > parseIsoDurationToDate(now, LONGEST_DURATION)) return `${field} '${value}' is longer than 100 years`;
  return null;
}

/**
 * The reason a campaign pass's terms cannot be stored, or null when they can. Each grant names a
 * catalogue bundle that is not sold by subscription (such a bundle is granted through a hidden comp
 * bundle that includes it), an optional ISO duration of years, months and days of at most 100
 * years, optional tokens (a positive whole number or "unlimited") and a refresh interval, bounded
 * as the duration is, only beside tokens.
 *
 * @param {{grants: Object[], usesPerAccount?: number}} terms
 * @param {Object} catalog
 * @returns {string|null}
 */
export function campaignTermsProblem({ grants, usesPerAccount }, catalog) {
  if (!Array.isArray(grants) || grants.length === 0) return "grants must list at least one bundle";
  for (const grant of grants) {
    const bundle = catalog.bundles?.find((b) => b.id === grant?.bundleId);
    if (!bundle) return `Bundle '${grant?.bundleId}' is not in the catalogue`;
    if (bundle.allocation === "on-subscription") {
      const comp = catalog.bundles.find((b) => b.hidden && Array.isArray(b.includes) && b.includes.includes(bundle.id));
      const instead = comp ? "'" + comp.id + "'" : "a comp bundle";
      return `Bundle '${bundle.id}' is sold by subscription: grant ${instead} instead`;
    }
    if (!passMayGrantBundle(bundle)) return `Bundle '${bundle.id}' cannot be granted by a pass`;
    if (grant.duration !== undefined) {
      const problem = durationProblem("duration", grant.duration);
      if (problem) return problem;
    }
    if (grant.tokens !== undefined && grant.tokens !== "unlimited" && !(Number.isInteger(grant.tokens) && grant.tokens > 0)) {
      return 'tokens must be a positive whole number or "unlimited"';
    }
    if (grant.tokenRefreshInterval !== undefined) {
      if (grant.tokens === undefined) return "tokenRefreshInterval needs tokens";
      const problem = durationProblem("tokenRefreshInterval", grant.tokenRefreshInterval);
      if (problem) return problem;
    }
  }
  if (usesPerAccount !== undefined && !(Number.isInteger(usesPerAccount) && usesPerAccount > 0))
    return "usesPerAccount must be a positive whole number";
  return null;
}

// Each grant as the pass record keeps it: only the terms the operator set.
function grantRecord({ bundleId, duration, tokens, tokenRefreshInterval }) {
  return {
    bundleId,
    ...(duration !== undefined ? { duration } : {}),
    ...(tokens !== undefined ? { tokens } : {}),
    ...(tokenRefreshInterval !== undefined ? { tokenRefreshInterval } : {}),
  };
}

// Synthetic test users may create passes only for the bundles the automated lanes exercise.
const SYNTHETIC_ISSUABLE_BUNDLE_IDS = ["day-guest", "invited-guest", "resident-vat", "resident-ltd", "resident-pro", "resident-tax-agent"];

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/pass/admin", ingestHandler);
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  validateEnv(["PASSES_DYNAMODB_TABLE_NAME"]);

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", ...corsOriginHeaders(event?.headers) };

  let decodedToken;
  try {
    decodedToken = decodeJwtToken(event.headers);
  } catch (error) {
    return http401UnauthorizedResponse({
      request,
      headers: responseHeaders,
      message: "Authentication required",
      error: error.message,
    });
  }
  const callerEmail = decodedToken.email;
  const callerIsOperator = await isOperatorEmail(callerEmail);
  const callerIsSyntheticTestUser = isSyntheticTestUserEmail(callerEmail);
  if (!callerIsOperator && !callerIsSyntheticTestUser) {
    logger.warn({ message: "Pass creation refused, caller is not an operator or a synthetic test user" });
    return http403ForbiddenResponse({
      request,
      headers: responseHeaders,
      message: "Not permitted to create passes",
    });
  }

  const requestBody = parseRequestBody(event);
  if (event.body && !requestBody) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: "Invalid JSON in request body",
    });
  }

  const campaign = requestBody?.grants !== undefined || requestBody?.usesPerAccount !== undefined;
  if (!requestBody || !requestBody.passTypeId || (!requestBody.bundleId && !campaign)) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: "Missing required fields: passTypeId, bundleId",
    });
  }

  const catalog = loadCatalogFromRoot();
  if (campaign) {
    if (!callerIsOperator) {
      logger.warn({ message: "Campaign pass refused, caller is not an operator" });
      return http403ForbiddenResponse({ request, headers: responseHeaders, message: "Not permitted to create a campaign pass" });
    }
    if (requestBody.bundleId) {
      return http400BadRequestResponse({
        request,
        headers: responseHeaders,
        message: "A campaign pass names its bundles in grants, not bundleId",
      });
    }
    const problem = campaignTermsProblem(requestBody, catalog);
    if (problem) return http400BadRequestResponse({ request, headers: responseHeaders, message: problem });
  }

  if (!callerIsOperator && !SYNTHETIC_ISSUABLE_BUNDLE_IDS.includes(requestBody.bundleId)) {
    logger.warn({ message: "Pass creation refused, bundle is not issuable by a synthetic test user", bundleId: requestBody.bundleId });
    return http403ForbiddenResponse({
      request,
      headers: responseHeaders,
      message: "Not permitted to create a pass for this bundle",
    });
  }

  if (!campaign) {
    const bundle = catalog.bundles?.find((b) => b.id === requestBody.bundleId);
    if (!passMayGrantBundle(bundle)) {
      return http400BadRequestResponse({
        request,
        headers: responseHeaders,
        message: `Bundle '${requestBody.bundleId}' cannot be granted by a pass`,
      });
    }
  }

  // The operator bundle goes only to an operator: its pass must be restricted to an operator's email.
  const grantedBundleIds = campaign ? requestBody.grants.map((grant) => grant.bundleId) : [requestBody.bundleId];
  const operatorOnly = grantedBundleIds.find(passGrantsOnlyToOperators);
  if (operatorOnly && !(requestBody.restrictedToEmail && (await isOperatorEmail(requestBody.restrictedToEmail)))) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: `A pass for the bundle '${operatorOnly}' must be restricted to an operator's email`,
    });
  }

  const {
    passTypeId,
    testPass: explicitTestPass,
    validFrom,
    validUntil,
    validityPeriod,
    maxUses,
    restrictedToEmail,
    createdBy,
    notes,
    usesPerAccount,
  } = requestBody;
  const grants = campaign ? requestBody.grants.map(grantRecord) : undefined;
  const bundleId = campaign ? grants[0].bundleId : requestBody.bundleId;

  // Derive testPass from pass type definition if not explicitly provided
  let testPass = callerIsOperator ? explicitTestPass : true;
  if (testPass === undefined) {
    try {
      const passTypesConfig = loadPassTypesFromRoot();
      const passTypeDef = getPassTypeById(passTypesConfig, passTypeId);
      if (passTypeDef?.test) {
        testPass = true;
      }
    } catch (error) {
      logger.warn({ message: "Could not load pass types config, testPass not auto-derived", error: error.message });
    }
  }

  logger.info({ message: "Creating admin pass", passTypeId, bundleId, testPass: !!testPass });

  try {
    const pass = await createPass({
      passTypeId,
      bundleId,
      testPass,
      validFrom,
      validUntil,
      validityPeriod,
      maxUses,
      restrictedToEmail: callerIsOperator ? restrictedToEmail : undefined,
      createdBy: createdBy || "admin",
      notes,
      actor: classifyActor(callerEmail),
      usesPerAccount,
      grants,
    });

    logger.info({ message: "Admin pass created", passTypeId, bundleId });
    await publishActivityEvent({
      event: "pass-generated",
      summary: "Pass generated: " + bundleId,
      detail: { bundleId, passTypeId },
    });
    const welsh = getHeader(event.headers || {}, "X-Site-Language") === "cy";
    const summaryOf = (id) => {
      const bundle = catalog.bundles?.find((b) => b.id === id);
      return (welsh ? bundle?.passSummaryCy : bundle?.passSummary) ?? null;
    };
    const restrictedTo = callerIsOperator && restrictedToEmail ? maskEmail(restrictedToEmail) : null;
    await requestCustomerEmail({
      kind: "pass-generated",
      userSub: decodedToken.sub,
      synthetic: Boolean(pass.testPass),
      data: {
        code: pass.code,
        passTypeId: pass.passTypeId,
        bundleId: pass.bundleId,
        validUntil: pass.validUntil || null,
        maxUses: pass.maxUses ?? null,
        usesLeft: pass.maxUses === null || pass.maxUses === undefined ? null : pass.maxUses - (pass.useCount ?? 0),
        generatedBy: "operator",
        restrictedTo,
        passSummary: summaryOf(pass.bundleId),
        ...(pass.grants ? { grants: pass.grants.map((grant) => ({ ...grant, summary: summaryOf(grant.bundleId) })) } : {}),
        ...(welsh ? { language: "cy" } : {}),
      },
    });

    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: {
        code: pass.code,
        bundleId: pass.bundleId,
        passTypeId: pass.passTypeId,
        testPass: pass.testPass || false,
        validFrom: pass.validFrom,
        validUntil: pass.validUntil,
        maxUses: pass.maxUses,
        usesPerAccount: pass.usesPerAccount ?? 1,
        grants: pass.grants ?? null,
        restrictedToEmail: callerIsOperator && restrictedToEmail ? true : false,
      },
    });
  } catch (error) {
    logger.error({ message: "Error creating admin pass", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to create pass",
      error: { detail: error.message },
    });
  }
}
