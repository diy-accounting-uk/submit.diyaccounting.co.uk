// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { handler } from "@app/functions/edge/errorPageHandler.js";
import {
  buildCloudFrontOriginResponseEvent,
  build404Event,
  build500Event,
  buildApiErrorEvent,
} from "@app/test-helpers/cloudFrontEventBuilders.js";

describe("errorPageHandler", () => {
  describe("passes through non-error responses", () => {
    test("200 OK response passes through unchanged", async () => {
      const event = buildCloudFrontOriginResponseEvent({
        uri: "/index.html",
        status: "200",
      });

      const result = await handler(event);

      expect(result.status).toBe("200");
      expect(result.body).toBe(""); // Original body unchanged
    });

    test("301 redirect passes through unchanged", async () => {
      const event = buildCloudFrontOriginResponseEvent({
        uri: "/old-page",
        status: "301",
        statusDescription: "Moved Permanently",
      });

      const result = await handler(event);

      expect(result.status).toBe("301");
    });

    test("304 not modified passes through unchanged", async () => {
      const event = buildCloudFrontOriginResponseEvent({
        uri: "/cached-page.html",
        status: "304",
        statusDescription: "Not Modified",
      });

      const result = await handler(event);

      expect(result.status).toBe("304");
    });
  });

  describe("handles static file errors with custom page", () => {
    test("404 for HTML page returns custom error page", async () => {
      const event = build404Event("/missing-page.html");

      const result = await handler(event);

      expect(result.status).toBe("404"); // Status preserved
      expect(result.body).toContain("<!DOCTYPE html>");
      expect(result.body).toContain("Page not found");
      expect(result.body).toContain("The address may be wrong");
      expect(result.body).not.toContain("/missing-page.html");
      expect(result.headers["content-type"][0].value).toBe("text/html; charset=UTF-8");
    });

    test("500 server error returns custom error page", async () => {
      const event = build500Event("/some-page.html");

      const result = await handler(event);

      expect(result.status).toBe("500"); // Status preserved
      expect(result.body).toContain("Something went wrong");
      expect(result.body).toContain("The problem is on our side");
      expect(result.body).toContain('id="retryBtn"');
    });

    test("403 forbidden returns custom error page", async () => {
      const event = buildCloudFrontOriginResponseEvent({
        uri: "/protected.html",
        status: "403",
        statusDescription: "Forbidden",
      });

      const result = await handler(event);

      expect(result.status).toBe("403");
      expect(result.body).toContain("You cannot open this page");
      expect(result.body).toContain("Sign in with an account that has access");
      expect(result.body).not.toContain('id="retryBtn"');
    });

    test("502 bad gateway returns custom error page", async () => {
      const event = buildCloudFrontOriginResponseEvent({
        uri: "/page.html",
        status: "502",
        statusDescription: "Bad Gateway",
      });

      const result = await handler(event);

      expect(result.status).toBe("502");
      expect(result.body).toContain("The service is not answering");
    });

    test("503 service unavailable returns custom error page", async () => {
      const event = buildCloudFrontOriginResponseEvent({
        uri: "/page.html",
        status: "503",
        statusDescription: "Service Unavailable",
      });

      const result = await handler(event);

      expect(result.status).toBe("503");
      expect(result.body).toContain("The service is busy");
    });

    test("504 gateway timeout returns custom error page", async () => {
      const event = buildCloudFrontOriginResponseEvent({
        uri: "/page.html",
        status: "504",
        statusDescription: "Gateway Timeout",
      });

      const result = await handler(event);

      expect(result.status).toBe("504");
      expect(result.body).toContain("The request took too long");
      expect(result.body).toContain("check your receipts");
    });

    test("unknown 4xx error returns generic error page", async () => {
      const event = buildCloudFrontOriginResponseEvent({
        uri: "/page.html",
        status: "418",
        statusDescription: "I'm a teapot",
      });

      const result = await handler(event);

      expect(result.status).toBe("418");
      expect(result.body).toContain("We could not complete your request");
    });
  });

  describe("excludes API routes", () => {
    test("API 404 passes through with original JSON body", async () => {
      const event = buildApiErrorEvent("404");
      const originalBody = event.Records[0].cf.response.body;

      const result = await handler(event);

      expect(result.status).toBe("404");
      expect(result.body).toBe(originalBody); // JSON body unchanged
      expect(result.headers["content-type"][0].value).toBe("application/json");
    });

    test("API 500 passes through unchanged", async () => {
      const event = buildApiErrorEvent("500");

      const result = await handler(event);

      expect(result.status).toBe("500");
      expect(result.body).not.toContain("<!DOCTYPE html>");
    });

    test("/api/v1/bundle 404 is not modified", async () => {
      const event = buildCloudFrontOriginResponseEvent({
        uri: "/api/v1/bundle",
        status: "404",
        body: '{"error":"Not found"}',
        headers: {
          "content-type": [{ key: "Content-Type", value: "application/json" }],
        },
      });

      const result = await handler(event);

      expect(result.body).toBe('{"error":"Not found"}');
    });

    test("/api/v1/hmrc/token 401 is not modified", async () => {
      const event = buildCloudFrontOriginResponseEvent({
        uri: "/api/v1/hmrc/token",
        status: "401",
        body: '{"message":"Unauthorized"}',
        headers: {
          "content-type": [{ key: "Content-Type", value: "application/json" }],
        },
      });

      const result = await handler(event);

      expect(result.body).toBe('{"message":"Unauthorized"}');
      expect(result.status).toBe("401");
    });
  });

  describe("error page content", () => {
    test("links the brand and the home page", async () => {
      const event = build404Event();
      const result = await handler(event);

      expect(result.body).toContain('<a href="/">DIY Accounting Submit</a>');
      expect(result.body).toContain('id="returnHomeBtn"');
      expect(result.body).toContain("Go to the home page");
    });

    test("has no raw URL line or old home button", async () => {
      const event = build404Event();
      const result = await handler(event);

      expect(result.body).not.toContain("Requested URL");
      expect(result.body).not.toContain("Return to Home");
    });

    test("uses light and dark colour values", async () => {
      const event = build404Event();
      const result = await handler(event);

      expect(result.body).toContain("--c-ink: #1b2a41");
      expect(result.body).toContain("prefers-color-scheme: dark");
    });

    test("includes footer with links", async () => {
      const event = build404Event();
      const result = await handler(event);

      expect(result.body).toContain("/privacy.html");
      expect(result.body).toContain("/terms.html");
      expect(result.body).toContain("DIY Accounting Limited");
    });

    test("does not reflect the requested URI", async () => {
      const event = build404Event("/<script>alert(1)</script>");
      const result = await handler(event);

      expect(result.body).not.toContain("<script>alert(1)");
      expect(result.body).not.toContain("alert(1)");
    });

    test("removes content-length header", async () => {
      const event = build404Event();
      event.Records[0].cf.response.headers["content-length"] = [{ key: "Content-Length", value: "123" }];

      const result = await handler(event);

      expect(result.headers["content-length"]).toBeUndefined();
    });
  });
});
