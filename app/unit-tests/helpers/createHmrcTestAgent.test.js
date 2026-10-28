// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmrcTestAgent } from "../../../behaviour-tests/helpers/behaviour-helpers.js";

function jsonResponse(status, body) {
  return { ok: status < 400, status, statusText: String(status), json: async () => body };
}

describe("createHmrcTestAgent", () => {
  const originalFetch = globalThis.fetch;
  let calls;

  beforeEach(() => {
    calls = [];
    process.env.HMRC_SANDBOX_BASE_URI = "http://hmrc.test";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.HMRC_SANDBOX_BASE_URI;
  });

  test("creates an agent-services test user at the agents endpoint and returns its ARN", async () => {
    globalThis.fetch = vi.fn(async (url, init) => {
      calls.push({ url, body: init.body });
      if (String(url).endsWith("/oauth/token")) return jsonResponse(200, { access_token: "app-token" });
      return jsonResponse(201, { userId: "agent-user", password: "agent-pass", agentServicesAccountNumber: "TARN1234567" });
    });

    const agent = await createHmrcTestAgent("client-id", "client-secret");

    const create = calls.find((call) => String(call.url).includes("/create-test-user/"));
    expect(create.url).toBe("http://hmrc.test/create-test-user/agents");
    expect(JSON.parse(create.body)).toEqual({ serviceNames: ["agent-services"] });
    expect(agent).toMatchObject({ userId: "agent-user", password: "agent-pass", arn: "TARN1234567" });
  });

  test("fails when HMRC answers no agent services account number", async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).endsWith("/oauth/token")) return jsonResponse(200, { access_token: "app-token" });
      return jsonResponse(201, { userId: "agent-user", password: "agent-pass" });
    });

    await expect(createHmrcTestAgent("client-id", "client-secret")).rejects.toThrow("agentServicesAccountNumber");
  });
});
