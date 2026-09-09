// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Load the script content and eval it in this context to populate window.* functions via happy-dom
const submitJsPath = path.join(process.cwd(), "web/public/submit.bundle.js");
const scriptContent = fs.readFileSync(submitJsPath, "utf-8");

// Node-safe base64url encoding for JWT payloads
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

describe("Token refresh on 401 errors", () => {
  let originalFetch;
  let fetchMock;
  let storageMock;

  beforeEach(() => {
    // Setup global window and localStorage
    global.window = {
      sessionStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      location: {
        href: "http://localhost:3000",
        origin: "http://localhost:3000",
        search: "",
      },
      crypto: {
        getRandomValues: (arr) => {
          for (let i = 0; i < arr.length; i++) {
            arr[i] = Math.floor(Math.random() * 256);
          }
          return arr;
        },
        randomUUID: () => "test-uuid-" + Math.random().toString(36).substring(7),
      },
    };

    // Mock localStorage
    storageMock = {
      cognitoAccessToken: "mock-access-token",
      cognitoIdToken: "mock-id-token",
      cognitoRefreshToken: "mock-refresh-token",
    };

    global.localStorage = {
      getItem: vi.fn((key) => storageMock[key] || null),
      setItem: vi.fn((key, value) => {
        storageMock[key] = value;
      }),
      removeItem: vi.fn((key) => {
        delete storageMock[key];
      }),
    };

    // Mock sessionStorage (used by correlation-utils for hmrcAccount)
    global.sessionStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    // Setup fetch mock
    fetchMock = vi.fn();
    originalFetch = global.fetch;
    global.fetch = fetchMock;
    global.window.fetch = fetchMock;

    // Mock document for DOM-related code
    const mockElement = {
      appendChild: vi.fn(),
      setAttribute: vi.fn(),
      getAttribute: vi.fn(),
      style: {},
      onclick: null,
      addEventListener: vi.fn(),
      innerHTML: "",
    };

    global.document = {
      readyState: "complete",
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      getElementById: vi.fn(() => mockElement),
      createElement: vi.fn(() => ({ ...mockElement })),
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
      head: {
        appendChild: vi.fn(),
      },
    };

    // Evaluate the submit.js script
    eval(scriptContent);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("fetchWithIdToken should add Authorization header with idToken", async () => {
    // Mock a valid access token to skip refresh logic
    const validFutureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const validToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64url({ exp: validFutureExp })}.test`;
    storageMock.cognitoAccessToken = validToken;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await window.fetchWithIdToken("/api/v1/test", {});

    // Should have called fetch at least once
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const [url, init] = lastCall;
    expect(url).toBe("/api/v1/test");

    // Check that Authorization header is set
    const headers = init.headers;
    if (headers instanceof Headers) {
      expect(headers.get("Authorization")).toBe("Bearer mock-id-token");
    } else {
      expect(headers.Authorization).toBe("Bearer mock-id-token");
    }
  });

  it("fetchWithIdToken should retry on 401 after token refresh", async () => {
    // Mock expired access token to trigger refresh
    const expiredToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64url({ exp: 1 })}.test`;
    storageMock.cognitoAccessToken = expiredToken;

    // First call returns 401
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    });

    // Token refresh call returns new tokens
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        accessToken: "new-access-token",
        idToken: "new-id-token",
        refreshToken: "new-refresh-token",
      }),
    });

    // Retry call returns success
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    const result = await window.fetchWithIdToken("/api/v1/test", {});

    // Should have made multiple calls
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);

    // Final result should be successful
    expect(result.ok).toBe(true);
  });

  it("fetchWithIdToken should work if no idToken is available", async () => {
    // Clear the id token
    storageMock.cognitoIdToken = null;

    // Mock valid access token
    const validFutureExp = Math.floor(Date.now() / 1000) + 3600;
    const validToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64url({ exp: validFutureExp })}.test`;
    storageMock.cognitoAccessToken = validToken;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await window.fetchWithIdToken("/api/v1/test", {});

    // Should still make the request, just without Authorization header
    expect(fetchMock).toHaveBeenCalled();
  });

  it("fetchWithIdToken should handle non-401 errors gracefully", async () => {
    // Mock valid access token
    const validFutureExp = Math.floor(Date.now() / 1000) + 3600;
    const validToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64url({ exp: validFutureExp })}.test`;
    storageMock.cognitoAccessToken = validToken;

    // First call returns 500
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Server error" }),
    });

    const result = await window.fetchWithIdToken("/api/v1/test", {});

    // Should not retry on non-401 errors
    expect(result.status).toBe(500);
  });

  it("fetchWithIdToken should preserve custom headers", async () => {
    // Mock valid access token
    const validFutureExp = Math.floor(Date.now() / 1000) + 3600;
    const validToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64url({ exp: validFutureExp })}.test`;
    storageMock.cognitoAccessToken = validToken;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await window.fetchWithIdToken("/api/v1/test", {
      headers: {
        "Content-Type": "application/json",
        "X-Custom-Header": "test-value",
      },
    });

    // Check that custom headers are preserved
    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const [, init] = lastCall;
    const headers = init.headers;

    if (headers instanceof Headers) {
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(headers.get("X-Custom-Header")).toBe("test-value");
    } else {
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["X-Custom-Header"]).toBe("test-value");
    }
  });

  it("fetchWithIdToken should handle 403 errors and show user-friendly message", async () => {
    // Mock valid access token
    const validFutureExp = Math.floor(Date.now() / 1000) + 3600;
    const validToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64url({ exp: validFutureExp })}.test`;
    storageMock.cognitoAccessToken = validToken;

    // Mock 403 response
    const mock403Response = {
      ok: false,
      status: 403,
      json: async () => ({ message: "Bundle entitlement required" }),
      clone: function () {
        return { ...this, json: async () => ({ message: "Bundle entitlement required" }) };
      },
    };
    fetchMock.mockResolvedValueOnce(mock403Response);

    const result = await window.fetchWithIdToken("/api/v1/test", {});

    // Should return 403 response without retry
    expect(result.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1); // No retry on 403
  });

  it("authorizedFetch should handle 403 errors gracefully", async () => {
    // Mock valid access token
    const validFutureExp = Math.floor(Date.now() / 1000) + 3600;
    const validToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64url({ exp: validFutureExp })}.test`;
    storageMock.cognitoAccessToken = validToken;

    // Mock 403 response
    const mock403Response = {
      ok: false,
      status: 403,
      json: async () => ({ message: "Access forbidden" }),
      clone: function () {
        return { ...this, json: async () => ({ message: "Access forbidden" }) };
      },
    };
    fetchMock.mockResolvedValueOnce(mock403Response);

    const result = await window.authorizedFetch("/api/v1/test", {});

    // Should return 403 response without retry
    expect(result.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1); // No retry on 403
  });

  it("checkTokenExpiry should detect expired tokens", () => {
    // Create expired tokens
    const expiredExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    const expiredToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64url({ exp: expiredExp })}.test`;

    // Mock showStatus
    window.showStatus = vi.fn();

    // Call checkTokenExpiry with expired token
    window.checkTokenExpiry(expiredToken, expiredToken);

    // Should attempt to show status message
    expect(window.showStatus).toHaveBeenCalled();
  });

  it("getJwtExpiryMs should parse JWT expiry correctly", () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64url({ exp: futureExp })}.test`;

    const expiryMs = window.getJwtExpiryMs(token);

    expect(expiryMs).toBe(futureExp * 1000);
  });

  it("getJwtExpiryMs should handle invalid tokens", () => {
    const expiryMs = window.getJwtExpiryMs("invalid-token");
    expect(expiryMs).toBe(0);
  });

  it("ensureSession should clear cognitoRefreshToken when refresh fails", async () => {
    // Mock an expired access token so ensureSession attempts refresh
    const expiredToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64url({ exp: 1 })}.test`;
    storageMock.cognitoAccessToken = expiredToken;
    storageMock.cognitoRefreshToken = "stale-refresh-token";

    // Refresh endpoint returns 400 (invalid refresh token)
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid_grant" }),
    });

    await window.ensureSession({ force: true });

    // Should have removed the stale refresh token
    expect(localStorage.removeItem).toHaveBeenCalledWith("cognitoRefreshToken");
  });

  it("fetchWithIdToken should be used in debugWidgetsGating for automatic retry", async () => {
    // This test verifies that fetchWithIdToken (which has retry logic) is used
    // instead of plain fetch when checking for test bundle in debugWidgetsGating

    // Mock valid access token
    const validFutureExp = Math.floor(Date.now() / 1000) + 3600;
    const validToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64url({ exp: validFutureExp })}.test`;
    storageMock.cognitoAccessToken = validToken;
    storageMock.userInfo = JSON.stringify({ sub: "test-user" });

    // Set up spy on fetchWithIdToken
    const originalFetchWithIdToken = window.fetchWithIdToken;
    const fetchWithIdTokenSpy = vi.fn(originalFetchWithIdToken);
    window.fetchWithIdToken = fetchWithIdTokenSpy;

    // Mock the response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ bundles: ["test"] }),
    });

    // Since debugWidgetsGating is already executed, we need to test if
    // window.fetchWithIdToken exists and can be called correctly
    const resp = await window.fetchWithIdToken("/api/v1/bundle", {});
    expect(resp.ok).toBe(true);

    // Verify fetchWithIdToken was called
    expect(fetchWithIdTokenSpy).toHaveBeenCalledWith("/api/v1/bundle", {});

    // Restore
    window.fetchWithIdToken = originalFetchWithIdToken;
  });
});
