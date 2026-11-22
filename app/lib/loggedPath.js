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
 * The query of a request or a URL as a log line may print it: each parameter's name with {name} in
 * place of its value, once a name, in the order the names first come.
 * @param {URLSearchParams|Record<string, unknown>|string|null|undefined} query
 * @returns {string} "?status={status}&from={from}", or "" when there is no parameter
 */
export function loggedQueryOf(query) {
  let names;
  if (query instanceof URLSearchParams) names = [...query.keys()];
  else if (typeof query === "string") names = [...new URLSearchParams(query).keys()];
  else names = Object.keys(query ?? {});
  const unique = [...new Set(names)];
  const pairs = unique.map((name) => `${encodeURIComponent(name)}={${name}}`);
  return pairs.length ? "?" + pairs.join("&") : "";
}

// The path segments of an outbound URL that hold an id, by the segment before them.
const OUTBOUND_ID_AFTER = {
  "company": "companyNumber",
  "transactions": "transactionId",
  "filing-history": "transactionId",
  "document": "documentId",
  "agents": "arn",
  "invitations": "invitationId",
  "returns": "periodKey",
};

// HMRC paths put a National Insurance number, a business id or a calculation id after segments
// that vary from one API to the next, so these ids are also named by their form, wherever they sit.
const OUTBOUND_ID_FORMS = [
  ["vrn", /^\d{9}$/],
  ["nino", /^[A-Z]{2}\d{6}[A-D]$/i],
  ["businessId", /^X[A-Z0-9]IS\d{11}$/i],
  ["id", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i],
];

/**
 * An outbound URL as a log line may print it: its origin, its path with each id named by the
 * segment before it (/company/{companyNumber}/filing-history/{transactionId}), and its query's
 * names with no values.
 * @param {string|URL} url
 * @returns {string}
 */
export function loggedUrlOf(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return "[unparsable URL]";
  }
  return `${parsed.origin}${loggedOutboundPathOf(parsed.pathname)}${loggedQueryOf(parsed.searchParams)}`;
}

/**
 * The path of an outbound request as a log line may print it, with no query and each id named: by
 * the segment before it, or for HMRC's ids by their form.
 * @param {string} path - for example /company/SC123456/officers
 * @returns {string}
 */
export function loggedOutboundPathOf(path) {
  const segments = String(path).split("?")[0].split("/");
  return segments
    .map((segment, index) => {
      if (segment === "") return segment;
      const name = OUTBOUND_ID_AFTER[segments[index - 1]] ?? OUTBOUND_ID_FORMS.find(([, form]) => form.test(decodedOrRaw(segment)))?.[0];
      return name ? `{${name}}` : segment;
    })
    .join("/");
}

/**
 * An event as a log line may print it: its path fields carry the route pattern, its path
 * parameters and query parameters carry their names in place of their values.
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
  for (const field of ["queryStringParameters", "multiValueQueryStringParameters"]) {
    if (described[field] && typeof described[field] === "object") {
      described[field] = Object.fromEntries(Object.keys(described[field]).map((name) => [name, `{${name}}`]));
    }
  }
  if (typeof described.rawQueryString === "string") described.rawQueryString = loggedQueryOf(described.rawQueryString).slice(1);
  return described;
}
