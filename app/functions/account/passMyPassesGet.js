// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-09 List a user's issued passes
// - **Use when:** a page must show up to 50 passes a caller has issued.
// - **Does:** The passMyPassesGet.js ingestHandler returns up to 50 passes the caller's hashed sub issued. It reads them via dynamoDbPassRepository.getPassesByIssuer and maps them to a public-safe shape. Each pass carries the figures item passFiguresPublish.js wrote for it, read by key, and the response carries a totals object; a count that could identify a person is null below three new accounts.
// - **Run:** `GET /api/v1/pass/my-passes`
// - **Entry:** `app/functions/account/passMyPassesGet.js:ingestHandler`
// - **Files:** app/functions/account/passMyPassesGet.js, app/unit-tests/functions/passMyPassesGet.test.js, app/unit-tests/functions/passMyPassesGetFigures.test.js, app/unit-tests/data/dynamoDbPassRepository.getPassesByIssuer.test.js
// - **Keywords:** pass, my passes, issued passes, list passes, getPassesByIssuer
// - **Related:** BILL-06, BILL-07
// @end-capability

// app/functions/account/passMyPassesGet.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import { extractRequest, http200OkResponse, http403ForbiddenResponse, http500ServerErrorResponse } from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import { getPassFigures, getPassesByIssuer } from "../../data/dynamoDbPassRepository.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";

// A count of new accounts, filers, subscribers or charges below this could point at one person,
// so the response withholds those counts and says so.
export const FIGURES_DISCLOSURE_MINIMUM = 3;

const logger = createLogger({ source: "app/functions/account/passMyPassesGet.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/pass/my-passes", ingestHandler);
}
/* v8 ignore stop */

/**
 * The figures one pass shows its issuer. Uses is the live use count of the pass; the other
 * counts come from the nightly figures item and are null when they fall under the minimum.
 */
export function toPassFigures(pass, stored) {
  const newAccounts = stored?.newAccounts ?? 0;
  const fewerThanThree = newAccounts < FIGURES_DISCLOSURE_MINIMUM;
  return {
    uses: pass.useCount || 0,
    newAccounts: fewerThanThree ? null : newAccounts,
    filed: fewerThanThree ? null : (stored?.filed ?? 0),
    subscribers: fewerThanThree ? null : (stored?.subscribers ?? 0),
    paidCharges: fewerThanThree ? null : (stored?.paidCharges ?? 0),
    fewerThanThree,
    lastUsed: stored?.lastUsed ?? null,
    computedAt: stored?.computedAt ?? null,
  };
}

/**
 * The totals row over every returned pass. The new-account total decides whether the counts show,
 * the same rule as one pass.
 */
export function toPassTotals(passes, storedByCode) {
  const sum = (field) => passes.reduce((total, pass) => total + (storedByCode.get(pass.code)?.[field] ?? 0), 0);
  const newAccounts = sum("newAccounts");
  const fewerThanThree = newAccounts < FIGURES_DISCLOSURE_MINIMUM;
  const lastUsed = passes.map((pass) => storedByCode.get(pass.code)?.lastUsed).filter(Boolean).sort().pop() ?? null;
  return {
    passes: passes.length,
    uses: passes.reduce((total, pass) => total + (pass.useCount || 0), 0),
    newAccounts: fewerThanThree ? null : newAccounts,
    filed: fewerThanThree ? null : sum("filed"),
    subscribers: fewerThanThree ? null : sum("subscribers"),
    paidCharges: fewerThanThree ? null : sum("paidCharges"),
    fewerThanThree,
    lastUsed,
  };
}

export async function ingestHandler(event) {
  validateEnv(["PASSES_DYNAMODB_TABLE_NAME"]);

  await initializeSalt();

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  // Authenticate
  let decodedToken;
  try {
    decodedToken = decodeJwtToken(event.headers);
  } catch {
    return http403ForbiddenResponse({ request, headers: responseHeaders, message: "Authentication required" });
  }

  const userSub = decodedToken.sub;
  const hashedSub = hashSub(userSub);

  // Parse query params
  const queryParams = event.queryStringParameters || {};
  const limit = Math.min(parseInt(queryParams.limit || "20", 10), 50);

  logger.info({ message: "Listing user passes", hashedSub, limit });

  try {
    const result = await getPassesByIssuer(hashedSub, { limit });

    const storedByCode = await getPassFigures(result.items.map((pass) => pass.code));

    // Map passes to safe public-facing format
    const passes = result.items.map((pass) => ({
      code: pass.code,
      passTypeId: pass.passTypeId,
      bundleId: pass.bundleId,
      validFrom: pass.validFrom,
      validUntil: pass.validUntil || null,
      maxUses: pass.maxUses ?? null,
      useCount: pass.useCount,
      heldForReview: pass.reviewLimit !== undefined && pass.useCount >= pass.reviewLimit,
      createdAt: pass.createdAt,
      notes: pass.notes || null,
      revokedAt: pass.revokedAt || null,
      figures: toPassFigures(pass, storedByCode.get(pass.code)),
    }));

    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: {
        passes,
        count: passes.length,
        totals: toPassTotals(result.items, storedByCode),
      },
    });
  } catch (error) {
    logger.error({ message: "Error listing user passes", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to list passes",
      error: { detail: error.message },
    });
  }
}
