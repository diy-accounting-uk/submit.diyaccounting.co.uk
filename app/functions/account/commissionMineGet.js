// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-57 Show a referrer the caller's own commission totals
// - **Use when:** a referrer must see what the referrals earned, held, payable and paid.
// - **Does:** The commissionMineGet.js ingestHandler sums the caller's own commission lines by state. Held lines group by release day, so each held total has a release date. Payable lines include the negative lines that reverse a paid line. Reversed lines count nowhere. The response holds totals in pence and no line, invoice, customer or plan.
// - **Run:** `GET /api/v1/commission/mine`
// - **Entry:** `app/functions/account/commissionMineGet.js:ingestHandler`
// - **Files:** app/functions/account/commissionMineGet.js, app/data/dynamoDbCommissionRepository.js, app/unit-tests/functions/commissionMineGet.test.js
// - **Keywords:** commission, earnings, held, payable, paid, referrer, my earnings
// - **Related:** BILL-46, BILL-09
// @end-capability

// app/functions/account/commissionMineGet.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import { extractRequest, http200OkResponse, http403ForbiddenResponse, http500ServerErrorResponse } from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import { queryLinesByReferrer } from "../../data/dynamoDbCommissionRepository.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";

const logger = createLogger({ source: "app/functions/account/commissionMineGet.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/commission/mine", ingestHandler);
}
/* v8 ignore stop */

/**
 * The totals a referrer sees. Held pence group by the day they release; payable and paid are
 * single totals. A reversed line counts nowhere.
 */
export function toCommissionTotals(lines) {
  const heldByDay = new Map();
  let payablePence = 0;
  let paidPence = 0;
  for (const line of lines) {
    if (line.state === "held") {
      const releaseDate = String(line.releaseAt).slice(0, 10);
      heldByDay.set(releaseDate, (heldByDay.get(releaseDate) || 0) + line.amountPence);
    } else if (line.state === "payable") {
      payablePence += line.amountPence;
    } else if (line.state === "paid") {
      paidPence += line.amountPence;
    }
  }
  const releases = [...heldByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([releaseDate, amountPence]) => ({ releaseDate, amountPence }));
  return {
    held: { totalPence: releases.reduce((total, release) => total + release.amountPence, 0), releases },
    payable: { totalPence: payablePence },
    paid: { totalPence: paidPence },
  };
}

export async function ingestHandler(event) {
  validateEnv(["COMMISSIONS_DYNAMODB_TABLE_NAME"]);

  await initializeSalt();

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  let decodedToken;
  try {
    decodedToken = decodeJwtToken(event.headers);
  } catch {
    return http403ForbiddenResponse({ request, headers: responseHeaders, message: "Authentication required" });
  }

  const referrerHash = hashSub(decodedToken.sub);

  try {
    const lines = await queryLinesByReferrer(referrerHash);
    logger.info({ message: "Commission totals read", referrerHash, lineCount: lines.length });
    return http200OkResponse({ request, headers: responseHeaders, data: { currency: "gbp", ...toCommissionTotals(lines) } });
  } catch (error) {
    logger.error({ message: "Error reading commission totals", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to read commission totals",
      error: { detail: error.message },
    });
  }
}
