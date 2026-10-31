// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/account/passPost.js

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http403ForbiddenResponse,
  http409ConflictResponse,
  http500ServerErrorResponse,
  parseRequestBody,
} from "../../lib/httpResponseHelper.js";
import { decodeJwtToken } from "../../lib/jwtHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { claimReferral, getPassRecord, recordRedemption, redeemPass, releaseReferral } from "../../services/passService.js";
import { hashSub, initializeSalt } from "../../services/subHasher.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/account/passPost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/pass", ingestHandler);
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["PASSES_DYNAMODB_TABLE_NAME", "BUNDLE_DYNAMODB_TABLE_NAME"]);

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

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

  const userId = decodedToken.sub;
  const userEmail = decodedToken.email;

  const requestBody = parseRequestBody(event);
  if (!requestBody || !requestBody.code) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: "Missing required field: code",
    });
  }

  const { code } = requestBody;

  const hashedSub = hashSub(userId);
  let referralClaimed = false;

  try {
    // A pass an account generated for others is a referral link: its issuer cannot redeem it,
    // and an account redeems one referral link, ever.
    const storedPass = await getPassRecord(code);
    const isReferral = Boolean(storedPass?.issuedBy);
    if (isReferral) {
      if (storedPass.issuedBy === hashedSub) {
        return http403ForbiddenResponse({
          request,
          headers: responseHeaders,
          message: "You cannot redeem a pass you generated.",
          error: { reason: "own_pass" },
        });
      }
      referralClaimed = await claimReferral(hashedSub, code);
      if (!referralClaimed) {
        return http409ConflictResponse({
          request,
          headers: responseHeaders,
          message: "This account has already redeemed a referral pass.",
          error: { reason: "referral_already_used" },
        });
      }
    }

    const result = await redeemPass(code, userEmail);

    if (!result.valid) {
      if (referralClaimed) await releaseReferral(hashedSub);
      return http200OkResponse({
        request,
        headers: responseHeaders,
        data: { redeemed: false, reason: result.reason },
      });
    }

    // Check if this bundle requires a subscription (on-pass-on-subscription allocation)
    const { loadCatalogFromRoot } = await import("../../services/productCatalog.js");
    const catalog = loadCatalogFromRoot();
    const catBundle = (catalog.bundles || []).find((b) => b.id === result.bundleId);

    if (catBundle?.allocation === "on-pass-on-subscription") {
      if (referralClaimed) await releaseReferral(hashedSub);
      const testPass = result.pass?.testPass || false;
      return http200OkResponse({
        request,
        headers: responseHeaders,
        data: { redeemed: false, valid: true, bundleId: result.bundleId, requiresSubscription: true, testPass },
      });
    }

    // Pass is valid — grant the bundle to the user
    const { grantBundle } = await import("./bundlePost.js");
    const grantQualifiers = result.pass?.testPass ? { synthetic: true } : undefined;
    const acquisition = isReferral ? { ref: code } : undefined;
    const grantResult = await grantBundle(userId, { bundleId: result.bundleId, qualifiers: {}, acquisition }, decodedToken, null, {
      skipCapCheck: true,
      grantQualifiers,
      viaPass: true,
    });

    if (isReferral) {
      await recordRedemption({ code, hashedSub, issuedBy: storedPass.issuedBy, passTypeId: result.pass.passTypeId });
    }

    logger.info({ message: "Pass redeemed and bundle granted", code, bundleId: result.bundleId, userId });
    await publishActivityEvent({
      event: "pass-redeemed",
      summary: "Pass redeemed: " + (result?.bundleId || "unknown"),
      userSub: userId,
      detail: { bundleId: result?.bundleId, passTypeId: result.pass?.passTypeId, code },
    });

    const testPass = result.pass?.testPass || false;
    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: {
        redeemed: true,
        bundleId: result.bundleId,
        expiry: grantResult.expiry || null,
        grantStatus: grantResult.status,
        testPass,
      },
    });
  } catch (error) {
    if (referralClaimed) {
      try {
        await releaseReferral(hashedSub);
      } catch (releaseError) {
        logger.error({ message: "Could not release the referral claim", error: releaseError.message });
      }
    }
    logger.error({ message: "Error redeeming pass", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: responseHeaders,
      message: "Failed to redeem pass",
      error: { detail: error.message },
    });
  }
}
