// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { http200OkBinaryResponse, http403ForbiddenResponse } from "../lib/httpResponseHelper.js";

describe("http200OkBinaryResponse", () => {
  test("answers 200 with the bytes base64 encoded and the given content type", () => {
    const response = http200OkBinaryResponse({
      request: new URL("https://example.test/x"),
      contentType: "image/png",
      data: Buffer.from([137, 80, 78, 71]),
    });
    expect(response.statusCode).toBe(200);
    expect(response.isBase64Encoded).toBe(true);
    expect(response.headers["Content-Type"]).toBe("image/png");
    expect(Buffer.from(response.body, "base64")).toEqual(Buffer.from([137, 80, 78, 71]));
  });

  test("keeps the caller's headers beside the content type", () => {
    const response = http200OkBinaryResponse({
      contentType: "image/png",
      headers: { "Cache-Control": "private, no-store" },
      data: Buffer.from([1]),
    });
    expect(response.headers["Cache-Control"]).toBe("private, no-store");
    expect(response.headers["x-request-id"]).toBeTruthy();
  });
});

describe("JSON responses", () => {
  test("a response given no headers is typed as JSON", () => {
    const response = http403ForbiddenResponse({ request: new URL("https://example.test/x"), message: "Forbidden", error: {} });
    expect(response.headers["Content-Type"]).toBe("application/json");
  });

  test("a caller's content type stands", () => {
    const response = http403ForbiddenResponse({ headers: { "Content-Type": "application/problem+json" }, message: "Forbidden", error: {} });
    expect(response.headers["Content-Type"]).toBe("application/problem+json");
  });
});
