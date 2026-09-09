// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/test-helpers/eventBuilders.test.js
// Unit tests for test helper functions

import { describe, test, expect } from "vitest";
import {
  base64UrlEncode,
  makeIdToken,
  buildAuthorizerContext,
  buildLambdaEvent,
  buildEventWithToken,
  buildGovClientHeaders,
  buildHmrcEvent,
  buildHeadEvent,
} from "@app/test-helpers/eventBuilders.js";

describe("eventBuilders helpers", () => {
  describe("base64UrlEncode", () => {
    test("encodes object to base64 URL-safe string", () => {
      const obj = { test: "value" };
      const encoded = base64UrlEncode(obj);

      expect(typeof encoded).toBe("string");
      expect(encoded).not.toContain("=");
      expect(encoded).not.toContain("+");
      expect(encoded).not.toContain("/");
    });

    test("can be decoded back to original object", () => {
      const obj = { test: "value", number: 123 };
      const encoded = base64UrlEncode(obj);
      const decoded = JSON.parse(Buffer.from(encoded, "base64").toString());

      expect(decoded).toEqual(obj);
    });
  });

  describe("makeIdToken", () => {
    test("creates a JWT-like token with three parts", () => {
      const token = makeIdToken();
      const parts = token.split(".");

      expect(parts.length).toBe(3);
    });

    test("includes subject in payload", () => {
      const token = makeIdToken("test-user");
      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());

      expect(payload.sub).toBe("test-user");
    });

    test("includes email derived from subject", () => {
      const token = makeIdToken("test-user");
      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());

      expect(payload.email).toBe("test-user@example.com");
    });

    test("includes extra fields when provided", () => {
      const token = makeIdToken("user", { custom: "field" });
      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());

      expect(payload.custom).toBe("field");
    });
  });

  describe("buildAuthorizerContext", () => {
    test("creates authorizer context with default values", () => {
      const context = buildAuthorizerContext();

      expect(context).toHaveProperty("authorizer");
      expect(context.authorizer.lambda.sub).toBe("test-sub");
    });

    test("uses provided sub, username, and email", () => {
      const context = buildAuthorizerContext("my-sub", "my-user", "my-email");

      expect(context.authorizer.lambda.sub).toBe("my-sub");
      expect(context.authorizer.lambda["cognito:username"]).toBe("my-user");
      expect(context.authorizer.lambda.email).toBe("my-email");
    });
  });

  describe("buildLambdaEvent", () => {
    test("creates Lambda event with default values", () => {
      const event = buildLambdaEvent();

      expect(event).toHaveProperty("requestContext");
      expect(event).toHaveProperty("headers");
      expect(event.requestContext.requestId).toBe("test-request-id");
    });

    test("includes provided method and path", () => {
      const event = buildLambdaEvent({ method: "GET", path: "/test" });

      expect(event.requestContext.http.method).toBe("GET");
      expect(event.requestContext.http.path).toBe("/test");
    });

    test("serializes body as JSON when object provided", () => {
      const event = buildLambdaEvent({ body: { key: "value" } });

      expect(typeof event.body).toBe("string");
      expect(JSON.parse(event.body)).toEqual({ key: "value" });
    });

    test("includes query and path parameters", () => {
      const event = buildLambdaEvent({
        queryStringParameters: { q: "search" },
        pathParameters: { id: "123" },
      });

      expect(event.queryStringParameters).toEqual({ q: "search" });
      expect(event.pathParameters).toEqual({ id: "123" });
    });
  });

  describe("buildEventWithToken", () => {
    test("includes Authorization header with Bearer token", () => {
      const token = "test-token";
      const event = buildEventWithToken(token);

      expect(event.headers.Authorization).toBe("Bearer test-token");
    });

    test("includes body when provided", () => {
      const event = buildEventWithToken("token", { data: "value" });

      expect(JSON.parse(event.body)).toEqual({ data: "value" });
    });
  });

  describe("buildGovClientHeaders", () => {
    test("returns object with all Gov-Client headers", () => {
      const headers = buildGovClientHeaders();

      expect(headers).toHaveProperty("Gov-Client-Browser-JS-User-Agent");
      expect(headers).toHaveProperty("Gov-Client-Device-ID");
      expect(headers).toHaveProperty("Gov-Vendor-Forwarded");
    });

    test("all header values are non-empty strings", () => {
      const headers = buildGovClientHeaders();

      Object.values(headers).forEach((value) => {
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
      });
    });
  });

  describe("buildHmrcEvent", () => {
    test("includes Gov-Client headers by default", () => {
      const event = buildHmrcEvent();

      expect(event.headers).toHaveProperty("Gov-Client-Browser-JS-User-Agent");
      expect(event.headers).toHaveProperty("Gov-Vendor-Forwarded");
    });

    test("merges additional headers with Gov-Client headers", () => {
      const event = buildHmrcEvent({
        headers: { "Custom-Header": "value" },
      });

      expect(event.headers["Custom-Header"]).toBe("value");
      expect(event.headers).toHaveProperty("Gov-Client-Device-ID");
    });
  });

  describe("buildHeadEvent", () => {
    test("creates event with HEAD method", () => {
      const event = buildHeadEvent();

      expect(event.requestContext.http.method).toBe("HEAD");
    });

    test("accepts additional options", () => {
      const event = buildHeadEvent({ path: "/custom" });

      expect(event.requestContext.http.method).toBe("HEAD");
      expect(event.requestContext.http.path).toBe("/custom");
    });
  });
});
