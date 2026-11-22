// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/loggedPath.test.js

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, test, expect, vi, afterEach } from "vitest";
import { loggedPathOf, eventWithLoggedPath, loggedQueryOf } from "@app/lib/loggedPath.js";
import { extractRequest, http200OkResponse, http404NotFoundResponse } from "@app/lib/httpResponseHelper.js";

function filesUnder(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : path.endsWith(".js") ? [path] : [];
  });
}

// Every route of the local server whose path carries a parameter, as its handler registers it.
const PARAMETER_ROUTES = [
  ...new Set(
    filesUnder("app/functions").flatMap((file) =>
      Array.from(
        readFileSync(file, "utf8").matchAll(
          /(?:registerLambdaRoute\(app, "|app\.)(get|post|put|delete|head)"?,? ?\(?"(\/api\/[^"]*:[^"]*)"/g,
        ),
        ([, method, path]) => `${method.toUpperCase()} ${path}`,
      ),
    ),
  ),
].sort();

// A value for a parameter that no other part of the request holds, shaped as the parameter's own ids are.
const VALUE_OF = {
  companyNumber: "SC123456",
  clientId: "client-7q2m",
  transactionId: "174052-912358-801533",
  submissionNumber: "SUB0048213",
  correlationId: "corr-5d1f-77aa",
  id: "id-9k4x-21",
  bookId: "book-3v8n",
  kind: "kind-q4z",
  report: "report-r7t",
};

function requestOf(route) {
  const [method, expressPath] = route.split(" ");
  const names = Array.from(expressPath.matchAll(/:([A-Za-z]+)/g), ([, name]) => name);
  const pathParameters = Object.fromEntries(names.map((name) => [name, VALUE_OF[name] ?? `${name}-value-8j3`]));
  const path = expressPath.replace(/:([A-Za-z]+)/g, (unused, name) => encodeURIComponent(pathParameters[name]));
  const pattern = expressPath.replace(/:([A-Za-z]+)/g, "{$1}");
  return { method, path, pattern, pathParameters };
}

// The event the local server builds, and the one API Gateway sends with the route's pattern.
function eventsOf({ method, path, pattern, pathParameters }) {
  const headers = { "host": "submit.example.com", "x-request-id": "req-1" };
  return {
    "local server": { path, requestContext: { http: { method, path } }, pathParameters, headers, queryStringParameters: {} },
    "API Gateway": {
      routeKey: `${method} ${pattern}`,
      rawPath: path,
      rawQueryString: "",
      requestContext: { http: { method, path }, routeKey: `${method} ${pattern}` },
      pathParameters,
      headers,
    },
  };
}

function capturedLines(run) {
  const lines = [];
  const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
  try {
    run();
  } finally {
    write.mockRestore();
  }
  return lines.join("");
}

afterEach(() => vi.restoreAllMocks());

describe("the path a log line prints", () => {
  test("finds the routes with an id in their path", () => {
    expect(PARAMETER_ROUTES.length).toBeGreaterThanOrEqual(40);
    expect(PARAMETER_ROUTES).toEqual(
      expect.arrayContaining([
        "PUT /api/v1/due-list/businesses/:id",
        "GET /api/v1/companies-house/company/:companyNumber",
        "GET /api/v1/practice/clients/:clientId",
        "GET /api/v1/companies-house/accounts/:submissionNumber",
        "HEAD /api/v1/bundle/:id",
      ]),
    );
  });

  describe.each(PARAMETER_ROUTES)("%s", (route) => {
    const request = requestOf(route);

    test.each(Object.entries(eventsOf(request)))("holds no parameter value in any log line of a request from the %s", (unused, event) => {
      const logged = capturedLines(() => {
        const { request: url } = extractRequest(event);
        http200OkResponse({ request: url, data: {} });
        http404NotFoundResponse({ request: url, message: "Not found" });
      });

      expect(loggedPathOf(event)).toBe(request.pattern);
      expect(logged).toContain(request.pattern);
      for (const value of Object.values(request.pathParameters)) {
        expect(logged).not.toContain(value);
        expect(logged).not.toContain(encodeURIComponent(value));
      }
    });
  });

  describe("a request with a query", () => {
    const RECEIPT_NAME = "2026-11-22T10:15:00.000Z-123456789012";
    const query = { name: RECEIPT_NAME, period: "18A2" };
    const events = {
      "local server": {
        path: "/api/v1/hmrc/receipt",
        requestContext: { http: { method: "GET", path: "/api/v1/hmrc/receipt" } },
        headers: { "host": "submit.example.com", "x-request-id": "req-2" },
        queryStringParameters: query,
        rawQueryString: `name=${encodeURIComponent(RECEIPT_NAME)}&period=18A2`,
      },
      "API Gateway": {
        routeKey: "GET /api/v1/hmrc/receipt",
        rawPath: "/api/v1/hmrc/receipt",
        rawQueryString: `name=${encodeURIComponent(RECEIPT_NAME)}&period=18A2`,
        requestContext: { http: { method: "GET", path: "/api/v1/hmrc/receipt" } },
        headers: { "host": "submit.example.com", "x-request-id": "req-2" },
        queryStringParameters: query,
      },
    };

    test.each(Object.entries(events))("logs each query parameter's name and never its value, from the %s", (unused, event) => {
      const logged = capturedLines(() => {
        const { request } = extractRequest(event);
        http200OkResponse({ request, data: {} });
      });

      expect(logged).toContain("/api/v1/hmrc/receipt?name={name}&period={period}");
      for (const value of [RECEIPT_NAME, encodeURIComponent(RECEIPT_NAME), "123456789012", "18A2"]) expect(logged).not.toContain(value);
    });

    test("keeps the request id, the status and the message of the response line", () => {
      const logged = capturedLines(() => {
        const { request } = extractRequest(events["API Gateway"]);
        http200OkResponse({ request, data: {} });
      });
      const line = logged
        .split("\n")
        .filter(Boolean)
        .map((text) => JSON.parse(text))
        .find((entry) => entry.message === "Responding to request with response");

      expect(line).toMatchObject({ level: 30, statusCode: 200, requestId: "req-2", path: "/api/v1/hmrc/receipt" });
    });
  });

  test("a query is logged as its names, once a name", () => {
    expect(loggedQueryOf(new URLSearchParams("a=1&b=2&a=3"))).toBe("?a={a}&b={b}");
    expect(loggedQueryOf({ from: "2026-01-01" })).toBe("?from={from}");
    expect(loggedQueryOf("")).toBe("");
    expect(loggedQueryOf(undefined)).toBe("");
  });

  test("names a value that is percent-encoded in the path, and one that spans segments", () => {
    expect(loggedPathOf({ path: "/api/v1/x/a%20b/y", pathParameters: { name: "a b" }, requestContext: { http: { method: "GET" } } })).toBe(
      "/api/v1/x/{name}/y",
    );
    expect(loggedPathOf({ path: "/files/one/two/three", pathParameters: { proxy: "two/three" } })).toBe("/files/one/{proxy}");
  });

  test("leaves a path with no parameters as it is", () => {
    expect(loggedPathOf({ path: "/api/v1/bundle", pathParameters: {} })).toBe("/api/v1/bundle");
    expect(loggedPathOf({ rawPath: "/api/v1/bundle" })).toBe("/api/v1/bundle");
  });

  test("names the parameters of an event and keeps its other fields", () => {
    const described = eventWithLoggedPath({
      rawPath: "/api/v1/practice/clients/client-7q2m",
      routeKey: "GET /api/v1/practice/clients/{clientId}",
      requestContext: { http: { method: "GET", path: "/api/v1/practice/clients/client-7q2m" }, requestId: "r1" },
      pathParameters: { clientId: "client-7q2m" },
      headers: { host: "h" },
    });

    expect(described).toMatchObject({
      rawPath: "/api/v1/practice/clients/{clientId}",
      requestContext: { http: { method: "GET", path: "/api/v1/practice/clients/{clientId}" }, requestId: "r1" },
      pathParameters: { clientId: "{clientId}" },
      headers: { host: "h" },
    });
  });

  test("keeps the fields the alarms read in the response line: message, level, statusCode and requestId", () => {
    const event = eventsOf(requestOf("GET /api/v1/practice/clients/:clientId"))["API Gateway"];
    const logged = capturedLines(() => {
      const { request } = extractRequest(event);
      http404NotFoundResponse({ request, message: "Not found" });
    });
    const line = logged
      .split("\n")
      .filter(Boolean)
      .map((text) => JSON.parse(text))
      .find((entry) => entry.message === "Responding to request with response");

    expect(line).toMatchObject({ level: 40, statusCode: 404, requestId: "req-1", path: "/api/v1/practice/clients/{clientId}" });
  });
});
