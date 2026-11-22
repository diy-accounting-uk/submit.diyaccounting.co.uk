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
 * An Express route path in the route pattern form API Gateway's routeKey holds: /a/:id -> /a/{id}.
 * @param {string} routePath
 * @returns {string}
 */
export function routePatternOf(routePath) {
  return String(routePath).replace(/:(\w+)\+?\??/g, "{$1}");
}

/**
 * The route pattern of a request with its path parameters named: API Gateway's routeKey, which the
 * local server sets from the route too. With none, each segment whose position holds a path
 * parameter's value is named, from the left; a value that appears again later, or that equals a
 * fixed segment before it, is named only once, where the parameters' order puts it.
 * @param {object} event - An API Gateway HTTP API event, or the one the local server builds
 * @returns {string} The path to log; "" when the event has none
 */
export function loggedPathOf(event) {
  const routePath = /^[A-Z]+ (\/\S*)$/.exec(event?.routeKey ?? "")?.[1];
  if (routePath) return routePath;
  const path = event?.rawPath || event?.path || event?.requestContext?.http?.path || "";
  const parameters = Object.entries(event?.pathParameters ?? {}).filter(([, value]) => typeof value === "string" && value !== "");
  if (parameters.length === 0) return path;
  // Express lists a route's parameters in the order they come in the path, so each is looked for
  // after the one before it; the last value is matched from the right, as it ends the path.
  const segments = path.split("/");
  let from = 1;
  for (const [index, [name, value]] of parameters.entries()) {
    const width = value.split("/").length;
    const matches = (start) =>
      segments
        .slice(start, start + width)
        .map(decodedOrRaw)
        .join("/") === value;
    let start = -1;
    if (index === parameters.length - 1) {
      for (let candidate = segments.length - width; candidate >= from && start < 0; candidate -= 1)
        if (matches(candidate)) start = candidate;
    } else {
      for (let candidate = from; candidate + width <= segments.length && start < 0; candidate += 1)
        if (matches(candidate)) start = candidate;
    }
    if (start < 0) continue;
    segments.splice(start, width, `{${name}}`);
    from = start + 1;
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
  ["propertyId", /^P[0-9A-Z]{14}$/],
  ["uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i],
  // An Assist report's correlation id: a long hex token, which follows the report id.
  ["correlationId", /^[0-9a-f]{32,}$/i],
];

// An HMRC UUID is an Assist report's, or an Income Tax submission's, calculation's or property's: the API's
// segments before it say which.
const UUID_NAME_AFTER = [
  ["acknowledge", "reportId"],
  ["period", "submissionId"],
  ["calculations", "calculationId"],
  ["adjustable-summary", "calculationId"],
  ["assist", "calculationId"],
  ["details", "propertyId"],
];

function nameOfUuid(earlierSegments) {
  return UUID_NAME_AFTER.find(([segment]) => earlierSegments.includes(segment))?.[1] ?? "id";
}

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
      const byForm = OUTBOUND_ID_FORMS.find(([, form]) => form.test(decodedOrRaw(segment)))?.[0];
      const name = OUTBOUND_ID_AFTER[segments[index - 1]] ?? (byForm === "uuid" ? nameOfUuid(segments.slice(0, index)) : byForm);
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
