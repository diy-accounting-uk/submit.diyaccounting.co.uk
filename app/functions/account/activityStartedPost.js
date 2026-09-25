// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/account/activityStartedPost.js
//
// Authenticated: the operator dashboard's started/completed table (operatorSnapshotPublish.js)
// needs a "started" count, and nothing records a click today (the pages send GA4 login,
// begin_checkout, purchase and submit_vat_return only). web/public/submit.js sends this,
// keepalive, when an element carrying data-activity-start="<id>" is clicked.

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
import { loadCatalogFromRoot } from "../../services/productCatalog.js";
import { publishActivityEvent, classifyActor } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/account/activityStartedPost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/activity/started", ingestHandler);
}
/* v8 ignore stop */

function isKnownActivityId(activityId) {
  const catalog = loadCatalogFromRoot();
  return (catalog.activities || []).some((activity) => activity.id === activityId);
}

export async function ingestHandler(event) {
  const { request } = extractRequest(event);
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  const user = extractUserFromAuthorizerContext(event);
  if (!user) {
    return http401UnauthorizedResponse({ request, headers, message: "Authentication required" });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}") || {};
  } catch {
    return http400BadRequestResponse({ request, headers, message: "Invalid JSON in request body" });
  }

  const activityId = body.activityId;
  if (!activityId || !isKnownActivityId(activityId)) {
    return http400BadRequestResponse({ request, headers, message: "Unknown activity id", error: { activityId } });
  }

  await initializeSalt();
  const appClient = await resolveAppClient(user.appClientId);

  await publishActivityEvent({
    event: "activity-started",
    summary: `Activity started: ${activityId}`,
    actor: classifyActor(user.email),
    userSub: user.sub,
    appClient,
    detail: { activityId },
  });

  logger.info({ message: "Activity started event published", activityId });

  return http200OkResponse({ request, headers, data: { ok: true } });
}
