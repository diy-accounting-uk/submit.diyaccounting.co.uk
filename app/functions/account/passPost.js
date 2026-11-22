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
  countRedemptions,
  getPassRecord,
  recordRedemption,
  redeemPass,
  releaseReferral,
  usesPerAccountOf,
} from "../../services/passService.js";
import { getUserBundles } from "../../data/dynamoDbBundleRepository.js";
import { buildAcquisitionMap } from "../../lib/acquisition.js";
import { hashSub, initializeSalt } from "../../services/subHasher.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { requestCustomerEmail } from "../../lib/customerEmailRequest.js";
import { corsOriginHeaders } from "../../lib/corsOrigins.js";
import { parseIsoDurationToDate } from "../../lib/dateUtils.js";
import { isOperatorEmail } from "../../lib/operators.js";
import { passMayGrantBundle, passGrantsOnlyToOperators } from "../../services/passGrantRule.js";

const logger = createLogger({ source: "app/functions/account/passPost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/pass", ingestHandler);
}
/* v8 ignore stop */

// The bundles a pass grants: a campaign pass's grants, or the one bundle of any other pass.
function passGrants(pass) {
  return pass.grants ?? [{ bundleId: pass.bundleId }];
}

// A count of tokens to compare: unlimited is more than any number, and a bundle without tokens holds none.
function comparableTokens(tokens) {
  if (tokens === "unlimited") return Infinity;
  return typeof tokens === "number" ? tokens : 0;
}

// When a grant would end, as a time to compare (no end is later than any date), and the tokens it
// would hold: the pass's own duration and tokens where it sets them, else the catalogue's.
function newGrantTerms(grant, catalogBundle, now) {
  const duration = grant.duration ?? catalogBundle?.timeout;
  const end = duration ? parseIsoDurationToDate(now, duration).getTime() : Infinity;
  const tokens = grant.tokens !== undefined ? grant.tokens : catalogBundle?.tokensGranted;
  return { end, tokens: comparableTokens(tokens) };
}

// When a held bundle ends and the tokens it has left.
function heldTerms(bundle) {
  const end = bundle.expiry ? new Date(bundle.expiry).getTime() : Infinity;
  const tokens = comparableTokens(bundle.tokensGranted) - (Number(bundle.tokensConsumed) || 0);
  return { end, tokens };
}

/**
 * The first of a pass's grants that would leave the account worse off: a bundle the account holds
 * that ends later than the grant would, or that has as late an end or later and more tokens left.
 * A redemption replaces each held bundle it grants, so one such grant refuses the whole redemption.
 */
export function worseGrant(grants, userBundles, catalog, now = new Date()) {
  return grants.find((grant) => {
    const held = userBundles.find((bundle) => bundle?.bundleId === grant.bundleId);
    if (!held) return false;
    const heldNow = heldTerms(held);
    if (heldNow.end <= now.getTime()) return false;
    const next = newGrantTerms(
      grant,
      (catalog.bundles || []).find((b) => b.id === grant.bundleId),
      now,
    );
    return heldNow.end > next.end || (heldNow.end >= next.end && heldNow.tokens > next.tokens);
  });
}

/**
 * The first of a pass's grants that the pass may not give this account: a bundle a pass may not
 * grant, or the operator bundle to an account whose email is not an operator's.
 */
async function ungrantableGrant(grants, catalog, userEmail) {
  const userIsOperator = grants.some((grant) => passGrantsOnlyToOperators(grant.bundleId)) && (await isOperatorEmail(userEmail));
  return grants.find(
    (grant) =>
      !passMayGrantBundle((catalog.bundles || []).find((b) => b.id === grant.bundleId)) ||
      (passGrantsOnlyToOperators(grant.bundleId) && !userIsOperator),
  );
}

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
    const redemptionsSoFar = storedPass ? await countRedemptions(code, hashedSub) : 0;
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
      if (redemptionsSoFar > 0) {
        await publishRefusal({ reason: "already_redeemed", code, passTypeId: storedPass.passTypeId, userSub: userId });
        return http409ConflictResponse({
          request,
          headers: responseHeaders,
          message: "This account has already redeemed this pass.",
          error: { reason: "already_redeemed" },
        });
      }
    } else if (storedPass && redemptionsSoFar >= usesPerAccountOf(storedPass)) {
      // Every other pass allows each account its usesPerAccount redemptions, one when it names none.
      await publishRefusal({ reason: "account_limit_reached", code, passTypeId: storedPass.passTypeId, userSub: userId });
      return http409ConflictResponse({
        request,
        headers: responseHeaders,
        message: "This account has redeemed this pass as many times as the pass allows.",
        error: { reason: "account_limit_reached" },
      });
    }

    // An account that pays for a bundle keeps its subscription link: a grant would replace the
    // bundle item that carries it. The refusal comes before any use or referral claim is counted.
    const grants = storedPass ? passGrants(storedPass) : [];
    const userBundles = storedPass ? await getUserBundles(userId) : [];
    const subscribed = grants.find((grant) =>
      userBundles.some((bundle) => bundle?.bundleId === grant.bundleId && bundle.stripeSubscriptionId),
    );
    if (subscribed) {
      await publishRefusal({ reason: "already_held", code, passTypeId: storedPass.passTypeId, userSub: userId });
      return http409ConflictResponse({
        request,
        headers: responseHeaders,
        message: `This account already holds the bundle '${subscribed.bundleId}' with a subscription.`,
        error: { reason: "already_held" },
      });
    }

    // A pass grants only the bundles a pass may grant, and the operator bundle only to an operator.
    // The refusal comes before the pass's use is taken.
    const { loadCatalogFromRoot } = await import("../../services/productCatalog.js");
    const catalog = loadCatalogFromRoot();
    const ungrantable = await ungrantableGrant(grants, catalog, userEmail);
    if (ungrantable) {
      await publishRefusal({ reason: "not_grantable", code, passTypeId: storedPass.passTypeId, userSub: userId });
      return http403ForbiddenResponse({
        request,
        headers: responseHeaders,
        message: `This pass cannot grant the bundle '${ungrantable.bundleId}' to this account.`,
        error: { reason: "not_grantable", bundleId: ungrantable.bundleId },
      });
    }

    // A redemption never leaves the account worse off: a bundle it holds on terms at least as good
    // as the pass would give is kept, and the pass is not used.
    const worse = worseGrant(grants, userBundles, catalog);
    if (worse) {
      await publishRefusal({ reason: "already_held", code, passTypeId: storedPass.passTypeId, userSub: userId });
      return http409ConflictResponse({
        request,
        headers: responseHeaders,
        message: `This account already holds the bundle '${worse.bundleId}' on terms at least as good as this pass gives.`,
        error: { reason: "already_held", bundleId: worse.bundleId },
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

    // The account's redemption is counted before any bundle is granted, in a write that refuses past
    // the account's limit, so two redemptions at once by one account cannot both be granted.
    const recorded = await recordRedemption({
      code,
      hashedSub,
      issuedBy: storedPass?.issuedBy,
      passTypeId: result.pass.passTypeId,
      limit: isReferral ? 1 : usesPerAccountOf(storedPass),
    });
    if (recorded === null) {
      if (referralClaimed) await releaseReferral(hashedSub);
      await publishRefusal({ reason: "account_limit_reached", code, passTypeId: result.pass.passTypeId, userSub: userId });
      return http409ConflictResponse({
        request,
        headers: responseHeaders,
        message: "This account has redeemed this pass as many times as the pass allows.",
        error: { reason: "account_limit_reached" },
      });
    }

    // Pass is valid — grant each of its bundles to the user, with the pass's duration and tokens
    // where it sets them.
    const { grantBundle } = await import("./bundlePost.js");
    const grantQualifiers = result.pass?.testPass ? { synthetic: true } : undefined;
    const landingAcquisition = buildAcquisitionMap(requestBody.acquisition);
    const acquisition = isReferral ? { ...landingAcquisition, ref: code } : landingAcquisition;
    const granted = [];
    for (const grant of result.pass?.grants ?? [{ bundleId: result.bundleId }]) {
      const outcome = await grantBundle(userId, { bundleId: grant.bundleId, qualifiers: {}, acquisition }, decodedToken, null, {
        skipCapCheck: true,
        grantQualifiers,
        viaPass: true,
        duration: grant.duration,
        tokens: grant.tokens,
        tokenRefreshInterval: grant.tokenRefreshInterval,
      });
      granted.push({ bundleId: grant.bundleId, expiry: outcome.expiry || null, status: outcome.status });
    }
    const grantResult = granted[0];

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
      data: {
        bundleId: result.bundleId,
        passTypeId: result.pass?.passTypeId,
        expiry: grantResult.expiry,
        bundles: granted.map(({ bundleId, expiry }) => ({ bundleId, expiry })),
      },
    });

    const testPass = result.pass?.testPass || false;
    return http200OkResponse({
      request,
      headers: responseHeaders,
      data: {
        redeemed: true,
        bundleId: result.bundleId,
        expiry: grantResult.expiry,
        grantStatus: grantResult.status,
        bundles: granted.map(({ bundleId, expiry }) => ({ bundleId, expiry })),
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
