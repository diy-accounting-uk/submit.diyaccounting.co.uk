// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { afterEach, describe, expect, test, vi } from "vitest";
import { performTokenExchange } from "../lib/httpResponseHelper.js";

const CODE = "fake-authorisation-code";
const SECRET = "fake-client-value";

function captured(stream) {
  const writes = [];
  vi.spyOn(stream, "write").mockImplementation((chunk) => writes.push(String(chunk)) > 0);
  return writes;
}

describe("performTokenExchange logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("logs the names of the body's fields and none of their values, and writes no sensitive data notice", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ access_token: "issued-token", expires_in: 3600 }), { status: 200 })),
    );
    const stdout = captured(process.stdout);
    const stderr = captured(process.stderr);

    await performTokenExchange("https://auth.example.test/oauth2/token", {
      grant_type: "authorization_code",
      code: CODE,
      redirect_uri: "https://submit.example.test/callback",
      client_id: "client-123",
      client_secret: SECRET,
    });
    vi.restoreAllMocks();

    const logged = [...stdout, ...stderr].join("");
    expect(logged).not.toContain("SENSITIVE DATA DETECTED");
    expect(logged).not.toContain(CODE);
    expect(logged).not.toContain(SECRET);
    const request = stdout
      .map((line) => JSON.parse(line))
      .find((line) => line.msg?.startsWith?.("Request to POST") || line.message?.startsWith?.("Request to POST"));
    expect(request.bodyFields).toEqual(["grant_type", "code", "redirect_uri", "client_id", "client_secret"]);
    expect(request).not.toHaveProperty("body");
  });

  test("logs the field names of a refresh token exchange without the refresh token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ access_token: "issued-token" }), { status: 200 })),
    );
    const stdout = captured(process.stdout);
    const stderr = captured(process.stderr);

    await performTokenExchange("https://auth.example.test/oauth2/token", {
      grant_type: "refresh_token",
      refresh_token: "refresh-77aa",
      client_id: "client-123",
    });
    vi.restoreAllMocks();

    const logged = [...stdout, ...stderr].join("");
    expect(logged).not.toContain("refresh-77aa");
    expect(logged).not.toContain("SENSITIVE DATA DETECTED");
  });
});
