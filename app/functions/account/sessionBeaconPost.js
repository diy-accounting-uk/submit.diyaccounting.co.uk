// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/account/sessionBeaconPost.js

import { createLogger } from "../../lib/logger.js";
import { extractRequest, http200OkResponse, http400BadRequestResponse, getHeader } from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { classifyVisitor } from "../../lib/visitorClassifier.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/account/sessionBeaconPost.js" });

// Landing-attribution fields session-beacon.js carries from analytics.js's localStorage
// capture. The beacon is sent only after consent, and carries them when the browser still
// holds a valid stored landing.
const ATTRIBUTION_DETAIL_KEYS = ["utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm", "gclid", "ref", "landedAt"];

function extractAttribution(body) {
  const attribution = {};
  for (const key of ATTRIBUTION_DETAIL_KEYS) {
    const value = body[key];
    if (typeof value === "string" && value) attribution[key] = value;
  }
  return attribution;
}

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/session/beacon", ingestHandler);
}
/* v8 ignore stop */

const CONSENT_ANSWERS = ["accepted", "rejected"];
const CONSENT_SURFACES = ["dialog", "banner"];

// A consent answer is a count: it carries the answer, the surface it came from and the country,
// and nothing that identifies the visitor or the page.
async function publishConsentAnswer({ request, body, country, visitorType }) {
  const headers = { "Content-Type": "application/json" };
  if (!CONSENT_ANSWERS.includes(body.consentAnswer) || !CONSENT_SURFACES.includes(body.consentSurface)) {
    return http400BadRequestResponse({ request, headers, message: "Unknown consent answer or surface" });
  }
  await publishActivityEvent({
    event: "consent-answered",
    summary: `Consent ${body.consentAnswer} on the ${body.consentSurface}`,
    actor: visitorType === "synthetic" ? "synthetic" : "visitor",
    flow: "user-journey",
    detail: { answer: body.consentAnswer, surface: body.consentSurface, country },
  });
  return http200OkResponse({ request, headers, data: { ok: true } });
}

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

  if (body.consentAnswer !== undefined) {
    return publishConsentAnswer({ request, body, country, visitorType });
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
      ...extractAttribution(body),
    },
  });

  return http200OkResponse({ request, headers: { "Content-Type": "application/json" }, data: { ok: true } });
}
