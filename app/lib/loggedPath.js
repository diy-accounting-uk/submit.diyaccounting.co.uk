// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/loggedPath.js
// The path of a request as a log line may print it: the route's pattern, with each path parameter
// named in braces in place of its value, so an id of a business, a person, a company, a submission
// or a receipt in the path never reaches the logs.

function decodedOrRaw(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * The route pattern of a request with its path parameters named: API Gateway's routeKey when it has
 * one, else the path with each path parameter's value replaced by {name}.
 * @param {object} event - An API Gateway HTTP API event, or the one the local server builds
 * @returns {string} The path to log; "" when the event has none
 */
export function loggedPathOf(event) {
  const routePath = /^[A-Z]+ (\/\S*)$/.exec(event?.routeKey ?? "")?.[1];
  if (routePath) return routePath;
  const path = event?.rawPath || event?.path || event?.requestContext?.http?.path || "";
  const parameters = Object.entries(event?.pathParameters ?? {}).filter(([, value]) => typeof value === "string" && value !== "");
  if (parameters.length === 0) return path;
  // A greedy parameter ({proxy+}) spans segments, so the longest values are named first.
  parameters.sort(([, a], [, b]) => b.length - a.length);
  let segments = path.split("/");
  for (const [name, value] of parameters) {
    const valueSegments = value.split("/");
    for (let start = 0; start + valueSegments.length <= segments.length; start += 1) {
      const window = segments.slice(start, start + valueSegments.length).map(decodedOrRaw);
      if (window.every((segment, index) => segment === valueSegments[index])) {
        segments = [...segments.slice(0, start), `{${name}}`, ...segments.slice(start + valueSegments.length)];
      }
    }
  }
  return segments.join("/");
}

/**
 * An event as a log line may print it: its path fields carry the route pattern and its path
 * parameters carry their names in place of their values.
 * @param {object} event
 * @returns {object}
 */
export function eventWithLoggedPath(event) {
  if (!event || typeof event !== "object") return event;
  const loggedPath = loggedPathOf(event);
  const described = { ...event };
  for (const field of ["rawPath", "path"]) if (typeof described[field] === "string") described[field] = loggedPath;
  if (described.requestContext?.http?.path) {
    described.requestContext = { ...described.requestContext, http: { ...described.requestContext.http, path: loggedPath } };
  }
  if (described.pathParameters && typeof described.pathParameters === "object") {
    described.pathParameters = Object.fromEntries(Object.keys(described.pathParameters).map((name) => [name, `{${name}}`]));
  }
  return described;
}
