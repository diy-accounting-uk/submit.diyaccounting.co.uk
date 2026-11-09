// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-10 Redeem a pass
// - **Use when:** a code must be redeemed to grant its bundle, including a pass link with a ?pass= parameter. The pass page web/public/pass.html is where a person redeems.
// - **Does:** The passPost.js ingestHandler redeems a code via passService.redeemPass, then grants the pass's bundle through bundlePost.js's grantBundle, skipping the capacity cap. A bundle marked on-pass-on-subscription reports valid but not yet redeemed, requiring a Stripe subscription first. web/public/pass.html with web/public/pass.page.js shows what a ?pass= link gives and posts here when the person presses Redeem pass; bundles.html forwards a ?pass= link to it. web/public/widgets/pass-redeemer.js auto-redeems a ?pass= query parameter on any page that includes it.
// - **Run:** `POST /api/v1/pass`
// - **Entry:** `app/functions/account/passPost.js:ingestHandler`; `app/services/passService.js:redeemPass`
// - **Files:** app/functions/account/passPost.js, web/public/pass.html, web/public/pass.page.js, app/unit-tests/functions/passPost.test.js, app/system-tests/passRedemption.system.test.js, behaviour-tests/passRedemption.behaviour.test.js, web/browser-tests/passRedeemer.browser.test.js, web/public/widgets/pass-redeemer.js, app/services/passService.js, app/unit-tests/services/passService.test.js, app/unit-tests/services/passServiceEmailHashRotation.test.js, app/unit-tests/services/passServiceEmailHashSecret.test.js, app/lib/passphrase.js, app/unit-tests/lib/passphrase.test.js, app/lib/emailHash.js, app/unit-tests/lib/emailHash.test.js, app/data/dynamoDbPassRepository.js, infra/main/resources/analytics/views/v_pass_redemptions_daily.sql, PASSES.md, submit.passes.toml
// - **Keywords:** pass, redeem pass, redeemPass, pass link, on-pass-on-subscription, passphrase, email hash
// - **Related:** BILL-01, BILL-06, BILL-08
// @end-capability

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
import {
  checkPass,
  claimReferral,
  getPassRecord,
  getRedemption,
  recordRedemption,
  redeemPass,
  releaseReferral,
} from "../../services/passService.js";
import { getUserBundles } from "../../data/dynamoDbBundleRepository.js";
import { buildAcquisitionMap } from "../../lib/acquisition.js";
import { hashSub, initializeSalt } from "../../services/subHasher.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { requestCustomerEmail } from "../../lib/customerEmailRequest.js";

const logger = createLogger({ source: "app/functions/account/passPost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/pass", ingestHandler);
}
/* v8 ignore stop */

async function publishRefusal({ reason, code, passTypeId, userSub }) {
  await publishActivityEvent({
    event: "pass-redeem-refused",
    summary: "Pass redemption refused: " + reason,
    userSub,
    detail: { reason, code, passTypeId },
  });
}

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
        await publishRefusal({ reason: "own_pass", code, passTypeId: storedPass.passTypeId, userSub: userId });
        return http403ForbiddenResponse({
          request,
          headers: responseHeaders,
          message: "You cannot redeem a pass you generated.",
          error: { reason: "own_pass" },
        });
      }
      if (await getRedemption(code, hashedSub)) {
        await publishRefusal({ reason: "already_redeemed", code, passTypeId: storedPass.passTypeId, userSub: userId });
        return http409ConflictResponse({
          request,
          headers: responseHeaders,
          message: "This account has already redeemed this pass.",
          error: { reason: "already_redeemed" },
        });
      }
    }

    // An account that pays for the bundle keeps its subscription link: a grant would replace the
    // bundle item that carries it. The refusal comes before any use or referral claim is counted.
    const heldBundle = storedPass ? (await getUserBundles(userId)).find((bundle) => bundle?.bundleId === storedPass.bundleId) : undefined;
    if (heldBundle?.stripeSubscriptionId) {
      await publishRefusal({ reason: "already_held", code, passTypeId: storedPass.passTypeId, userSub: userId });
      return http409ConflictResponse({
        request,
        headers: responseHeaders,
        message: `This account already holds the bundle '${storedPass.bundleId}' with a subscription.`,
        error: { reason: "already_held" },
      });
    }

    if (isReferral) {
      // A pass that cannot be redeemed takes no claim, so redeemPass below gives its own refusal.
      const { valid: redeemable } = await checkPass(code, userEmail);
      if (redeemable) {
        referralClaimed = await claimReferral(hashedSub, code);
        if (!referralClaimed) {
          await publishRefusal({ reason: "referral_already_used", code, passTypeId: storedPass.passTypeId, userSub: userId });
          return http409ConflictResponse({
            request,
            headers: responseHeaders,
            message: "This account has already redeemed a referral pass.",
            error: { reason: "referral_already_used" },
          });
        }
      }
    }

    const result = await redeemPass(code, userEmail);

    if (!result.valid) {
      if (referralClaimed) await releaseReferral(hashedSub);
      await publishRefusal({
        reason: result.reason,
        code,
        passTypeId: result.pass?.passTypeId ?? storedPass?.passTypeId,
        userSub: userId,
      });
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
    const landingAcquisition = buildAcquisitionMap(requestBody.acquisition);
    const acquisition = isReferral ? { ...landingAcquisition, ref: code } : landingAcquisition;
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
      userEmail,
      detail: { bundleId: result?.bundleId, passTypeId: result.pass?.passTypeId, code },
    });
    await requestCustomerEmail({
      kind: "pass-redeemed",
      userSub: userId,
      synthetic: Boolean(result.pass?.testPass),
      data: { bundleId: result.bundleId, passTypeId: result.pass?.passTypeId, expiry: grantResult.expiry || null },
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
