// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/companiesHouseGrantAccess.js
// Opens a Companies House grant inside Submit. The sealed access token stays in the mcp-sessions
// table; this module checks the grant belongs to the signed-in user, opens the seal and hands the
// token to the Lambda that calls Companies House. The grant has no refresh: it expires with its
// access token.

import { createLogger } from "./logger.js";
import { getHeader, extractBearerTokenFromAuthHeaderInLambdaEvent } from "./httpResponseHelper.js";
import { initializeSalt, hashSub } from "../services/subHasher.js";
import { getCompaniesHouseGrant } from "../data/dynamoDbCompaniesHouseGrantRepository.js";
import { openFor, COMPANIES_HOUSE_GRANT_PURPOSE } from "./codesSeal.js";

const logger = createLogger({ source: "app/lib/companiesHouseGrantAccess.js" });

export const COMPANIES_HOUSE_GRANT_HEADER = "x-companies-house-grant";
export const GRANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const COMPANY_IN_SCOPE_PATTERN = /\/company\/([A-Z0-9]{8})\//;

/**
 * The company a Companies House scope string names.
 * @param {string|undefined} scope
 * @returns {string|null} the company number, or null when the scope names none
 */
export function companyNumberFromScope(scope) {
  if (typeof scope !== "string") return null;
  return scope.match(COMPANY_IN_SCOPE_PATTERN)?.[1] ?? null;
}

/**
 * The id of the grant a request names: the x-companies-house-grant header, otherwise an
 * Authorization bearer value shaped like a grant id. A raw Companies House token is not shaped
 * like one.
 * @param {Object} event - the Lambda event
 * @returns {string|null}
 */
export function companiesHouseGrantIdFromEvent(event) {
  const headerValue = getHeader(event.headers, COMPANIES_HOUSE_GRANT_HEADER);
  if (headerValue) return headerValue;
  const authHeader = getHeader(event.headers, "authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const bearer = authHeader.split(" ")[1];
  return GRANT_ID_PATTERN.test(bearer ?? "") ? bearer : null;
}

/**
 * The state of one grant for the signed-in user, with its access token when usable.
 * @param {string} grantId
 * @param {string} userSub - the signed-in user's sub; the grant must belong to it
 * @returns {Promise<{status: "missing"|"forbidden"}
 *   | {status: "granted", accessToken: string, companyNumber: string|null, scope: string|null, accessExpiresAt: number}>}
 */
export async function openCompaniesHouseGrantFor(grantId, userSub) {
  await initializeSalt();
  const grant = await getCompaniesHouseGrant(grantId);
  if (!grant) return { status: "missing" };
  if (grant.hashedSub !== hashSub(userSub)) return { status: "forbidden" };
  const { accessToken } = await openFor(COMPANIES_HOUSE_GRANT_PURPOSE, grant.sealed, grantId);
  return {
    status: "granted",
    accessToken,
    companyNumber: grant.companyNumber,
    scope: grant.scope,
    accessExpiresAt: grant.accessExpiresAt,
  };
}

/**
 * The Companies House access token a request carries, with the company its grant is bound to.
 * A request that names a grant gets the grant's token; the grant must belong to the signed-in
 * user. Any other bearer value is a raw token and passes unchanged, with no company.
 * @param {Object} event - the Lambda event
 * @param {string} userSub - the signed-in user's sub
 * @returns {Promise<{accessToken: string, companyNumber: string|null}|null>} null when the request
 *   carries no token, or names a grant that does not open
 */
export async function companiesHouseAccessFromEvent(event, userSub) {
  const grantId = companiesHouseGrantIdFromEvent(event);
  if (grantId) {
    if (!userSub || !GRANT_ID_PATTERN.test(grantId)) return null;
    const grant = await openCompaniesHouseGrantFor(grantId, userSub);
    if (grant.status !== "granted") {
      logger.warn({ message: "Companies House grant not usable", grantId, status: grant.status });
      return null;
    }
    return { accessToken: grant.accessToken, companyNumber: grant.companyNumber };
  }
  const rawToken = extractBearerTokenFromAuthHeaderInLambdaEvent(event);
  return rawToken ? { accessToken: rawToken, companyNumber: null } : null;
}
