// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/api-client-polling.test.js
// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { showStatus, dismissStatus } from "../public/lib/utils/dom-utils.js";
import { executeAsyncRequestPolling } from "../public/lib/services/api-client.js";

const texts = () => Array.from(document.querySelectorAll(".status-message-content")).map((el) => el.textContent);
const accepted = () => new Response(null, { status: 202, headers: { "x-request-id": "req-123" } });
const URL_PATH = "/api/v1/hmrc/itsa/calculation/trigger";

async function poll(finalResponse, init = {}) {
  globalThis.fetch = vi.fn().mockResolvedValueOnce(accepted()).mockResolvedValueOnce(finalResponse);
  const ending = executeAsyncRequestPolling(accepted(), URL_PATH, init, new Headers());
  await vi.advanceTimersByTimeAsync(1000);
  expect(texts()).toContain("Still processing...");
  await vi.advanceTimersByTimeAsync(2000);
  return ending;
}

describe("the polling client's Still processing message", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="statusMessagesContainer"></div>';
    window.showStatus = showStatus;
    window.dismissStatus = dismissStatus;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("goes when the request succeeds and the caller shows its own result", async () => {
    const res = await poll(new Response("{}", { status: 200 }));
    expect(res.status).toBe(200);
    expect(texts()).toEqual([]);
  });

  it("goes when the request fails and the caller shows its own error", async () => {
    const res = await poll(new Response("{}", { status: 400 }));
    expect(res.status).toBe(400);
    expect(texts()).toEqual([]);
  });

  it("gives way to the caller's success and error messages when it names them", async () => {
    await poll(new Response("{}", { status: 200 }), { pollSuccessMessage: "Calculation ready.", pollErrorMessage: "Calculation failed." });
    expect(texts()).toEqual(["Calculation ready."]);
    document.body.innerHTML = '<div id="statusMessagesContainer"></div>';
    await poll(new Response("{}", { status: 500 }), { pollSuccessMessage: "Calculation ready.", pollErrorMessage: "Calculation failed." });
    expect(texts()).toEqual(["Calculation failed."]);
  });

  it("goes when the request is stopped", async () => {
    const controller = new AbortController();
    globalThis.fetch = vi.fn().mockResolvedValue(accepted());
    const ending = executeAsyncRequestPolling(accepted(), URL_PATH, { signal: controller.signal }, new Headers());
    await vi.advanceTimersByTimeAsync(1000);
    expect(texts()).toContain("Still processing...");
    controller.abort();
    await expect(ending).rejects.toThrow("Aborted");
    expect(texts()).toEqual([]);
  });

  it("keeps the page's own progress message, which the caller replaces", async () => {
    showStatus("Calculating...", "info");
    await poll(new Response("{}", { status: 200 }));
    expect(texts()).toEqual(["Calculating..."]);
  });
});
