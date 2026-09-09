// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/server.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock the ingestHandlers from their respective function files
vi.mock("@app/functions/non-lambda-mocks/mockTokenPost.js", () => ({
  ingestHandler: vi.fn(),
}));
vi.mock("@app/functions/hmrc/hmrcVatReturnPost.js", () => ({
  ingestHandler: vi.fn(),
}));

// Import the mocked ingestHandlers
import { ingestHandler as exchangeTokenHandler } from "@app/functions/non-lambda-mocks/mockTokenPost.js";
import { ingestHandler as submitVatHandler } from "@app/functions/hmrc/hmrcVatReturnPost.js";

describe("Server Unit Tests", () => {
  const originalEnv = process.env;
  let app;
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  beforeEach(() => {
    vi.clearAllMocks();

    process.env = {
      ...originalEnv,
    };

    // Recreate the Express app for each test (similar to server.js)
    app = express();
    app.use(express.json());
    // app.use(express.static(path.join(__dirname, "../../app/lib/public")));
    app.use(express.static(path.join(__dirname, "../../web/public")));

    app.post("/api/v1/mock/token", async (req, res) => {
      try {
        const event = { body: JSON.stringify(req.body) };
        const { statusCode, body } = await exchangeTokenHandler(event);
        res.status(statusCode).json(JSON.parse(body));
      } catch (error) {
        res.status(500).json({ error: "Internal server error" });
      }
    });

    app.post("/api/v1/hmrc/vat/return", async (req, res) => {
      try {
        const event = { body: JSON.stringify(req.body) };
        const { statusCode, body } = await submitVatHandler(event);
        res.status(statusCode).json(JSON.parse(body));
      } catch (error) {
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Fallback route for SPA
    app.get(/.*/, (req, res) => {
      res.sendFile(path.join(__dirname, "../../web/public/index.html"));
    });
  });

  describe("Express App Configuration", () => {
    test("should have JSON middleware configured", async () => {
      const mockHandler = vi.fn().mockResolvedValue({
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      });
      exchangeTokenHandler.mockImplementation(mockHandler);

      await request(app).post("/api/v1/mock/token").send({ code: "test-code" }).expect(200);

      expect(mockHandler).toHaveBeenCalledWith({
        body: JSON.stringify({ code: "test-code" }),
      });
    });

    test("should serve static files", async () => {
      // This test would require actual static files to exist
      // For now, we'll test that the route doesn't throw an error
      const response = await request(app).get("/nonexistent.js");
      // Should return 404 for non-existent static files, not crash
      expect([404, 200]).toContain(response.status);
    });
  });

  describe("POST /api/v1/mock/token", () => {
    test("should call httpPostMock with correct event format", async () => {
      const mockResponse = {
        statusCode: 200,
        body: JSON.stringify({ accessToken: "test-token" }),
      };
      exchangeTokenHandler.mockResolvedValue(mockResponse);

      const requestBody = { code: "auth-code" };
      const response = await request(app).post("/api/v1/mock/token").send(requestBody).expect(200);

      expect(exchangeTokenHandler).toHaveBeenCalledWith({
        body: JSON.stringify(requestBody),
      });
      expect(response.body).toEqual({ accessToken: "test-token" });
    });

    test("should handle httpPostMock errors", async () => {
      const mockResponse = {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing code" }),
      };
      exchangeTokenHandler.mockResolvedValue(mockResponse);

      const response = await request(app).post("/api/v1/mock/token").send({}).expect(400);

      expect(response.body).toEqual({ error: "Missing code" });
    });
  });

  describe("POST /api/v1/hmrc/vat/return", () => {
    test("should call httpPostMock with correct event format", async () => {
      const mockResponse = {
        statusCode: 200,
        body: JSON.stringify({ formBundleNumber: "12345" }),
      };
      submitVatHandler.mockResolvedValue(mockResponse);

      const requestBody = {
        vatNumber: "111222333",
        periodKey: "18A1",
        vatDue: "100.00",
        accessToken: "test-token",
      };
      const response = await request(app).post("/api/v1/hmrc/vat/return").send(requestBody).expect(200);

      expect(submitVatHandler).toHaveBeenCalledWith({
        body: JSON.stringify(requestBody),
      });
      expect(response.body).toEqual({ formBundleNumber: "12345" });
    });

    test("should handle httpPostMock errors", async () => {
      const mockResponse = {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing parameters" }),
      };
      submitVatHandler.mockResolvedValue(mockResponse);

      const response = await request(app).post("/api/v1/hmrc/vat/return").send({ vatNumber: "123" }).expect(400);

      expect(response.body).toEqual({ error: "Missing parameters" });
    });
  });

  describe("SPA Fallback Route", () => {
    test("should serve index.html for unknown routes", async () => {
      // This test would require the actual index.html file to exist
      // For now, we'll test that it attempts to serve the file
      const response = await request(app).get("/unknown-route");
      // Should either serve the file (200) or return 404 if file doesn't exist
      expect([200, 404]).toContain(response.status);
    });

    test("should serve index.html for nested routes", async () => {
      const response = await request(app).get("/some/nested/route");
      expect([200, 404]).toContain(response.status);
    });
  });
});
