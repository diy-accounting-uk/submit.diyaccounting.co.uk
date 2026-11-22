// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-37 Record the source of an account at its sign-in
// - **Use when:** an account that landed from a tagged link must have its source recorded, whether or not it ever requests a bundle.
// - **Does:** loginWithCognitoCallback.page.js posts the stored attribution.landing once per landing after a sign-in, keepalive and never awaited, and fires the GA4 sign_up event. accountAcquisitionPost.js cleans the fields with buildAcquisitionMap, drops the click ids, and publishes one account-acquisition activity event.
// - **Run:** `POST /api/v1/account/acquisition`
// - **Entry:** `app/functions/account/accountAcquisitionPost.js:ingestHandler`; `web/public/auth/loginWithCognitoCallback.page.js`
// - **Files:** app/functions/account/accountAcquisitionPost.js, app/unit-tests/functions/accountAcquisitionPost.test.js, web/public/auth/loginWithCognitoCallback.page.js, web/browser-tests/loginCallbackAcquisition.browser.test.js, app/lib/acquisition.js
// - **Keywords:** acquisition, landing, utm, attribution, sign_up, first sign-in, account source, activity event
// - **Related:** SITE-04
// @end-capability

// app/functions/account/accountAcquisitionPost.js
//
// Authenticated: records where an account came from at its sign-in, whether or not it ever requests
// a bundle. web/public/auth/loginWithCognitoCallback.page.js posts the stored landing once, keepalive,
// after a sign-in. The landing fields are cleaned by buildAcquisitionMap and published as one
// account-acquisition activity event; the campaign view takes the earliest event per account, so a
// repeat post does no harm. Click ids (gclid, msclkid) are left out of the event.

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  extractUserFromAuthorizerContext,
  http200OkResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { resolveAppClient } from "../../lib/appClientResolver.js";
import { initializeSalt } from "../../services/subHasher.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { buildAcquisitionMap } from "../../lib/acquisition.js";
import { corsOriginHeaders } from "../../lib/corsOrigins.js";

const logger = createLogger({ source: "app/functions/account/accountAcquisitionPost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/account/acquisition", ingestHandler);
}
/* v8 ignore stop */

const CLICK_ID_FIELDS = ["gclid", "msclkid"];

function landingWithoutClickIds(body) {
  const acquisition = buildAcquisitionMap(body);
  if (!acquisition) return undefined;
  for (const field of CLICK_ID_FIELDS) delete acquisition[field];
  return Object.keys(acquisition).length > 0 ? acquisition : undefined;
}

export async function ingestHandler(event) {
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

  const acquisition = landingWithoutClickIds(body);
  if (!acquisition) {
    return http400BadRequestResponse({ request, headers, message: "No landing fields to record" });
  }

  await initializeSalt();
  const appClient = await resolveAppClient(user.appClientId);

  // No explicit actor, for the reason activityStartedPost.js gives: the access token carries no email.
  await publishActivityEvent({
    event: "account-acquisition",
    summary: `Account acquisition: ${acquisition.utmSource || acquisition.ref || "untagged"}`,
    userSub: user.sub,
    appClient,
    detail: acquisition,
  });

  logger.info({ message: "Account acquisition event published", fields: Object.keys(acquisition) });

  return http200OkResponse({ request, headers, data: { ok: true } });
}
