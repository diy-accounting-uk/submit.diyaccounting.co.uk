// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/account/sessionBeaconPost.js

import { createLogger } from "../../lib/logger.js";
import { extractRequest, http200OkResponse, getHeader } from "../../lib/httpResponseHelper.js";
import { buildHttpResponseFromLambdaResult, buildLambdaEventFromHttpRequest } from "../../lib/httpServerToLambdaAdaptor.js";
import { classifyVisitor } from "../../lib/visitorClassifier.js";
import { publishActivityEvent, classifyActor, maskEmail } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/account/sessionBeaconPost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  app.post("/api/session/beacon", async (httpRequest, httpResponse) => {
    const lambdaEvent = buildLambdaEventFromHttpRequest(httpRequest);
    const lambdaResult = await ingestHandler(lambdaEvent);
    return buildHttpResponseFromLambdaResult(lambdaResult, httpResponse);
  });
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

  if (body.event === "logout") {
    // Logout is classified from the account that is leaving, the way login is, so a session
    // reads as one pair of events from the same actor.
    const email = typeof body.email === "string" ? body.email : "";
    const provider = typeof body.provider === "string" ? body.provider : "";
    const providerLabel = provider ? ` via ${provider}` : "";
    const emailLabel = email ? `: ${maskEmail(email)}` : "";
    await publishActivityEvent({
      event: "logout",
      summary: `Logout${providerLabel}${emailLabel}`,
      actor: classifyActor(email),
      flow: "user-journey",
      detail: { country },
    });
    return http200OkResponse({ request, headers: { "Content-Type": "application/json" }, data: { ok: true } });
  }

  const page = body.page || "/";

  await publishActivityEvent({
    event: "new-session",
    summary: `New session: ${visitorType} from ${country}`,
    actor: visitorType === "ai-agent" ? "ai-agent" : "visitor",
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
