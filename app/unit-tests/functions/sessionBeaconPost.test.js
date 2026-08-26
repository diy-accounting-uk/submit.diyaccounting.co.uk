// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/sessionBeaconPost.test.js

import { describe, it, expect, beforeEach, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

const mockPublishActivityEvent = vi.fn();
vi.mock("@app/lib/activityAlert.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, publishActivityEvent: (...args) => mockPublishActivityEvent(...args) };
});

import { ingestHandler } from "@app/functions/account/sessionBeaconPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function buildBeaconEvent(body, headers = {}) {
  return {
    requestContext: { requestId: "test-request-id", http: { method: "POST", path: "/api/session/beacon" } },
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "cloudfront-viewer-country": "GB",
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

describe("sessionBeaconPost ingestHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publishes a new-session event for a page beacon", async () => {
    const response = await ingestHandler(buildBeaconEvent({ page: "/index.html" }));

    expect(response.statusCode).toBe(200);
    expect(mockPublishActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "new-session", flow: "user-journey", actor: "visitor" }),
    );
  });

  it("publishes a logout event classified from the account that is leaving", async () => {
    const response = await ingestHandler(buildBeaconEvent({ event: "logout", email: "customer@gmail.com", provider: "Google" }));

    expect(response.statusCode).toBe(200);
    expect(mockPublishActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "logout",
        summary: "Logout via Google: c***@gmail.com",
        actor: "customer",
        flow: "user-journey",
      }),
    );
  });

  it("classifies a test account's logout the same way its login was classified", async () => {
    await ingestHandler(buildBeaconEvent({ event: "logout", email: "test-abc@test.diyaccounting.co.uk", provider: "" }));

    expect(mockPublishActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "logout", summary: "Logout: t***@test.diyaccounting.co.uk", actor: "test-user" }),
    );
  });

  it("ignores a beacon from a crawler", async () => {
    const response = await ingestHandler(buildBeaconEvent({ event: "logout", email: "customer@gmail.com" }, { "user-agent": "Googlebot/2.1" }));

    expect(response.statusCode).toBe(200);
    expect(mockPublishActivityEvent).not.toHaveBeenCalled();
  });
});
