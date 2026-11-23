// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/localServerLoggedPath.test.js

import { describe, test, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerLambdaRoute } from "@app/lib/httpServerToLambdaAdaptor.js";
import { loggedPathOf, routePatternOf } from "@app/lib/loggedPath.js";

function appRecording(path) {
  const app = express();
  const events = [];
  registerLambdaRoute(app, "get", path, async (event) => {
    events.push(event);
    return { statusCode: 200, headers: {}, body: "{}" };
  });
  return { app, events };
}

describe("the path the local server logs", () => {
  test("a route path becomes the pattern API Gateway's routeKey holds", () => {
    expect(routePatternOf("/api/v1/practice/clients/:clientId/books/:bookId/move")).toBe(
      "/api/v1/practice/clients/{clientId}/books/{bookId}/move",
    );
    expect(routePatternOf("/api/v1/bundle")).toBe("/api/v1/bundle");
  });

  test.each([
    ["a value equal to a fixed segment", "/api/:name/receipt", "/api/api/receipt", "/api/{name}/receipt"],
    ["a value equal to a fixed segment before it", "/api/v1/x/:name", "/api/v1/x/api", "/api/v1/x/{name}"],
    ["two parameters with the same value", "/api/v1/x/:a/y/:b", "/api/v1/x/abc/y/abc", "/api/v1/x/{a}/y/{b}"],
    ["a value equal to a later fixed segment", "/api/v1/:name/v1", "/api/v1/v1/v1", "/api/v1/{name}/v1"],
  ])("names each parameter by its place in the route, with %s", async (unused, route, path, pattern) => {
    const { app, events } = appRecording(route);

    await request(app).get(path);

    expect(events[0].routeKey).toBe(`GET ${pattern}`);
    expect(loggedPathOf(events[0])).toBe(pattern);
  });

  test.each([
    [{ path: "/api/api/receipt", pathParameters: { name: "api" } }, "/api/{name}/receipt"],
    [{ path: "/api/v1/x/abc/y/abc", pathParameters: { a: "abc", b: "abc" } }, "/api/v1/x/{a}/y/{b}"],
    [{ path: "/api/v1/hmrc/receipt/api", pathParameters: { name: "api" } }, "/api/v1/hmrc/receipt/{name}"],
    [{ path: "/files/one/two/three", pathParameters: { proxy: "two/three" } }, "/files/one/{proxy}"],
  ])("an event with no routeKey names each parameter once, by position: %j", (event, pattern) => {
    expect(loggedPathOf(event)).toBe(pattern);
  });

  test("the request line logs the route's pattern and the query's names, never a value", async () => {
    vi.resetModules();
    process.env.ENVIRONMENT_NAME = "test";
    const lines = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => lines.push(String(chunk)) > 0);
    try {
      const { app } = await import("@app/bin/server.js");
      await request(app).get("/api/v1/practice/clients/client-7q2m?vrn=176493528&from=2026-01-01");
      await request(app).get("/api/v1/nowhere/SC123456?q=Jane");
      await request(app).get("/cy/companies-house/company/SC000001/officers/oFfIcEr9Id");
      await request(app).get("/receipts/NI765432C-2026A1.html");
    } finally {
      write.mockRestore();
    }
    const requestLines = lines
      .join("")
      .split("\n")
      .filter((line) => line.includes("HTTP GET"));

    expect(requestLines.join("\n")).toContain("HTTP GET /api/v1/practice/clients/{clientId}?vrn={vrn}&from={from}");
    expect(requestLines.join("\n")).toContain("HTTP GET /api/{unmatched}?q={q}");
    expect(requestLines.join("\n")).toContain("HTTP GET /cy/companies-house/company/{companyView} 200");
    expect(requestLines.join("\n")).toContain("HTTP GET /{unmatched} 404");
    for (const value of ["client-7q2m", "176493528", "2026-01-01", "SC123456", "Jane", "SC000001", "oFfIcEr9Id", "NI765432C"])
      expect(requestLines.join("\n")).not.toContain(value);
  }, 30000);
});
