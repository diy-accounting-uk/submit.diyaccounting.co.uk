// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-37 Record the source of an account at its sign-in
// - **Use when:** an account that landed from a tagged link must have its source recorded, whether or not it ever requests a bundle.
// - **Does:** submit.js posts the stored attribution.landing on the first page after a sign-in, keepalive, until the route answers with success. accountAcquisitionPost.js cleans the fields, drops the click ids, stores the account's first landing on its settings item and publishes one account-acquisition activity event for it. The answer's firstRecord says whether the post is that first record, and submit.js fires the GA4 sign_up event only then.
// - **Run:** `POST /api/v1/account/acquisition`
// - **Entry:** `app/functions/account/accountAcquisitionPost.js:ingestHandler`; `web/public/submit.js:recordAccountAcquisitionAfterSignIn`
// - **Files:** app/functions/account/accountAcquisitionPost.js, app/unit-tests/functions/accountAcquisitionPost.test.js, web/public/submit.js, web/public/auth/loginWithCognitoCallback.page.js, web/browser-tests/loginCallbackAcquisition.browser.test.js, app/lib/acquisition.js
// - **Keywords:** acquisition, landing, utm, attribution, sign_up, first sign-in, account source, activity event
// - **Related:** SITE-04
// @end-capability

// app/functions/account/accountAcquisitionPost.js
//
// Authenticated: records where an account came from at its sign-in, whether or not it ever requests
// a bundle. web/public/submit.js posts the stored landing, keepalive, on the first page after a
// sign-in. The landing fields are cleaned by buildRecordableAttributionMap and published as one
// account-acquisition activity event, once for an account: the first landing posted is stored on
// the account's settings item, and a later landing publishes nothing. The answer's firstRecord says
// whether this post is that first record. Click ids (gclid, msclkid) are left out of the event.

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  extractUserFromAuthorizerContext,
  http200OkResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { resolveAppClient } from "../../lib/appClientResolver.js";
import { initializeSalt } from "../../services/subHasher.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { buildRecordableAttributionMap } from "../../lib/acquisition.js";
import { corsOriginHeaders } from "../../lib/corsOrigins.js";
import { validateEnv } from "../../lib/env.js";
import { getFirstAccountSource, recordFirstAccountSource } from "../../data/dynamoDbBundleRepository.js";

const logger = createLogger({ source: "app/functions/account/accountAcquisitionPost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/account/acquisition", ingestHandler);
}
/* v8 ignore stop */

const CLICK_ID_FIELDS = ["gclid", "msclkid"];
const LANDING_FIELDS = ["utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm", "ref", "landedAt"];

function recordableLanding(body) {
  const acquisition = buildRecordableAttributionMap(body);
  if (!acquisition) return undefined;
  for (const field of CLICK_ID_FIELDS) delete acquisition[field];
  return Object.keys(acquisition).length > 0 ? acquisition : undefined;
}

// The page sends a landing again when it never saw the answer to its first post, so the same
// landing as the stored one is still the account's first record.
function isSameLanding(stored, landing) {
  return LANDING_FIELDS.every((field) => stored[field] === landing[field]);
}

export async function ingestHandler(event) {
  validateEnv(["BUNDLE_DYNAMODB_TABLE_NAME"]);
  const { request } = extractRequest(event);
  const headers = { "Content-Type": "application/json", ...corsOriginHeaders(event?.headers) };

  const user = extractUserFromAuthorizerContext(event);
  if (!user) {
    return http401UnauthorizedResponse({ request, headers, message: "Authentication required" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}") || {};
  } catch {
    return http400BadRequestResponse({ request, headers, message: "Invalid JSON in request body" });
  }

  const acquisition = recordableLanding(body);
  if (!acquisition) {
    return http400BadRequestResponse({ request, headers, message: "No landing fields to record" });
  }

  try {
    await initializeSalt();

    const recordedBefore = await getFirstAccountSource(user.sub);
    if (recordedBefore) {
      return http200OkResponse({ request, headers, data: { ok: true, firstRecord: isSameLanding(recordedBefore, acquisition) } });
    }

    const appClient = await resolveAppClient(user.appClientId);

    // No explicit actor, for the reason activityStartedPost.js gives: the access token carries no email.
    const { published } = await publishActivityEvent({
      event: "account-acquisition",
      summary: `Account acquisition: ${acquisition.utmSource || acquisition.ref || "untagged"}`,
      userSub: user.sub,
      appClient,
      detail: acquisition,
    });
    // Unpublished on a deployment with a bus means the event is lost: nothing is stored, so the
    // page's next post records it. With no bus (local) there is no event to lose.
    if (!published && process.env.ACTIVITY_BUS_NAME) {
      return http500ServerErrorResponse({ request, headers, message: "The account's source was not recorded" });
    }

    const firstSource = await recordFirstAccountSource(user.sub, acquisition);
    logger.info({ message: "Account acquisition event published", fields: Object.keys(acquisition) });

    return http200OkResponse({ request, headers, data: { ok: true, firstRecord: isSameLanding(firstSource, acquisition) } });
  } catch (error) {
    logger.error({ message: "Could not record the account's source", error: error.message });
    return http500ServerErrorResponse({ request, headers, message: "The account's source was not recorded" });
  }
}
