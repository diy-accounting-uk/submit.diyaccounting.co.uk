// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { jsonErrorHandler } from "../../lib/jsonErrorHandler.js";
import { dotenvConfigIfNotBlank } from "../../lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("jsonErrorHandler", () => {
  let app;
  let server;

  beforeEach(() => {
    app = express();
    // Disable x-powered-by header to match server.js
    app.disable("x-powered-by");
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("should respond with JSON 500 when a sync route throws", async () => {
    // Route that throws synchronously
    app.get("/api/sync-throw", () => {
      throw new Error("Sync error from handler");
    });

    // Register error middleware
    app.use(jsonErrorHandler);

    server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(`http://127.0.0.1:${port}/api/sync-throw`);
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = await response.json();
    expect(body).toHaveProperty("message", "Internal server error");
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("message", "Sync error from handler");
    expect(body.error).toHaveProperty("name");
  });

  it("should respond with JSON 500 when an async route rejects", async () => {
    // Route that returns a rejected promise
    app.get("/api/async-reject", async () => {
      throw new Error("Async error from handler");
    });

    // Register error middleware
    app.use(jsonErrorHandler);

    server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(`http://127.0.0.1:${port}/api/async-reject`);
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = await response.json();
    expect(body).toHaveProperty("message", "Internal server error");
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("message", "Async error from handler");
  });

  it("should include correlation headers in response", async () => {
    app.get("/api/throw-with-headers", () => {
      throw new Error("Test error");
    });

    app.use(jsonErrorHandler);

    server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(`http://127.0.0.1:${port}/api/throw-with-headers`);
    expect(response.status).toBe(500);

    // Check for correlation headers
    expect(response.headers.has("x-request-id")).toBe(true);
    expect(response.headers.has("x-correlationid")).toBe(true);
    expect(response.headers.get("content-type")).toContain("application/json");

    // Correlation ID should default to request ID if not explicitly set
    const requestId = response.headers.get("x-request-id");
    const correlationId = response.headers.get("x-correlationid");
    expect(requestId).toBeTruthy();
    expect(correlationId).toBeTruthy();
  });

  it("should include Access-Control-Expose-Headers", async () => {
    app.get("/api/expose-headers", () => {
      throw new Error("Test error");
    });

    app.use(jsonErrorHandler);

    server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(`http://127.0.0.1:${port}/api/expose-headers`);
    expect(response.status).toBe(500);

    const exposeHeaders = response.headers.get("Access-Control-Expose-Headers");
    expect(exposeHeaders).toContain("x-request-id");
    expect(exposeHeaders).toContain("x-correlationid");
  });

  it("should pass to next middleware if headers already sent", (done) => {
    const nextHandler = (err) => {
      // When headers are already sent, error middleware passes to next
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe("Late error");
      done();
    };

    app.get("/api/headers-sent", (req, res, next) => {
      // Send headers first
      res.status(200);
      res.send("OK");
      // Then throw an error (headers already sent)
      next(new Error("Late error"));
    });

    // Register custom error handler to check if error passed through
    app.use((err, req, res, next) => {
      if (res.headersSent) {
        // Headers were sent, middleware passed to next
        return nextHandler(err);
      }
      jsonErrorHandler(err, req, res, next);
    });

    server = app.listen(0);
  });

  it("should handle errors with complex error objects", async () => {
    class CustomError extends Error {
      constructor(message, code) {
        super(message);
        this.name = "CustomError";
        this.code = code;
      }
    }

    app.get("/api/custom-error", () => {
      throw new CustomError("Custom validation error", 422);
    });

    app.use(jsonErrorHandler);

    server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(`http://127.0.0.1:${port}/api/custom-error`);
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.error.name).toBe("CustomError");
    expect(body.error.message).toBe("Custom validation error");
  });

  it("should handle errors in Express 5 with async handlers", async () => {
    // Test that Express 5 forwards rejected promises to error middleware
    app.get("/api/promise-reject", async (req, res) => {
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(new Error("Delayed promise rejection"));
        }, 10);
      });
      res.json({ ok: true });
    });

    app.use(jsonErrorHandler);

    server = app.listen(0);
    const port = server.address().port;

    const response = await fetch(`http://127.0.0.1:${port}/api/promise-reject`);
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body).toHaveProperty("message", "Internal server error");
    expect(body.error.message).toBe("Delayed promise rejection");
  });
});
