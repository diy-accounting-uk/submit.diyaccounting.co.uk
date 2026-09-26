// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/account/sessionBeaconPost.js

import { createLogger } from "../../lib/logger.js";
import { extractRequest, http200OkResponse, getHeader } from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { classifyVisitor } from "../../lib/visitorClassifier.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/account/sessionBeaconPost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/session/beacon", ingestHandler);
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  const { request } = extractRequest(event);
  const headers = event.headers || {};
  const userAgent = getHeader(headers, "user-agent") || "";
  const country = getHeader(headers, "cloudfront-viewer-country") || "unknown";

  const visitorType = classifyVisitor(userAgent);

  // Filter crawlers — no event published
  if (visitorType === "crawler") {
    logger.info({ message: "Crawler session beacon ignored", userAgent: userAgent.substring(0, 100) });
    return http200OkResponse({ request, headers: { "Content-Type": "application/json" }, data: { ok: true } });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}") || {};
  } catch {
    // ignore parse errors
  }

  const page = body.page || "/";

  const actorByVisitorType = { "ai-agent": "ai-agent", "synthetic": "synthetic" };

  await publishActivityEvent({
    event: "new-session",
    summary: `New session: ${visitorType} from ${country}`,
    actor: actorByVisitorType[visitorType] || "visitor",
    flow: "user-journey",
    detail: {
      visitorType,
      country,
      page,
      userAgent: userAgent.substring(0, 100),
    },
  });

  return http200OkResponse({ request, headers: { "Content-Type": "application/json" }, data: { ok: true } });
}
