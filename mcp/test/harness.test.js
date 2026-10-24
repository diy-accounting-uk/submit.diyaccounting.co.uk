// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSession } from "../lib/book-tools.js";
import { callHarnessTool, listHarnessTools } from "../lib/harness.js";

function sessionWithBearer() {
  return createSession({ credentials: { accessToken: async () => "bearer", idToken: async () => null } });
}

describe("harness tool calls", () => {
  beforeEach(() => {
    process.env.DIYA_SUBMIT_BASE_URL = "http://harness.test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DIYA_SUBMIT_BASE_URL;
  });

  it("lists the server's tools by name", async () => {
    const { serverName, tools } = await listHarnessTools(sessionWithBearer());
    expect(serverName).toBe("diya-submit");
    expect(tools.map((tool) => tool.name)).toContain("list_vat_obligations");
  });

  it("calls list_vat_obligations through the MCP client and parses the answer", async () => {
    const fetchStub = vi.fn(async () => new Response(JSON.stringify({ obligations: [{ status: "O" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchStub);
    const answer = await callHarnessTool(sessionWithBearer(), "list_vat_obligations", {
      vrn: "111222333",
      status: "O",
      hmrcAccessToken: "token",
    });
    expect(answer).toEqual({ ok: true, result: { obligations: [{ status: "O" }] } });
    expect(String(fetchStub.mock.calls[0][0])).toContain("/api/v1/hmrc/vat/obligation?vrn=111222333");
  });

  it("reports a tool failure as not ok with its message", async () => {
    const answer = await callHarnessTool(sessionWithBearer(), "list_vat_obligations", { vrn: "111222333" });
    expect(answer.ok).toBe(false);
    expect(String(answer.result)).toContain("hmrcAccessToken");
  });
});
