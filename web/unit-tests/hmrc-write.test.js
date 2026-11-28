// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/hmrc-write.test.js
// @vitest-environment happy-dom

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("../public/lib/services/api-client.js", () => ({
  authorizedFetch: vi.fn(),
}));

import { authorizedFetch } from "../public/lib/services/api-client.js";
import { showStatus, dismissStatus, narrateStage, endStage } from "../public/lib/utils/dom-utils.js";
import { fileWithHmrc, hmrcWritePollOptions, putSelfEmploymentAnnual } from "../public/lib/services/hmrc-service.js";

const WORDS = {
  sending: "Sending the annual submission to HMRC...",
  notSent: "HMRC has not got the annual submission.",
  answers: "Your figures are still in the form.",
};
const ANNUAL = { nino: "AA123456A", businessId: "XAIS12345678901", taxYear: "2025-26", adjustments: {}, allowances: {} };
const texts = () => Array.from(document.querySelectorAll(".status-message-content")).map((el) => el.textContent);

function jsonResponse(status, body, requestId) {
  return {
    ok: status < 400,
    status,
    statusText: "",
    headers: new Headers(requestId ? { "x-request-id": requestId } : {}),
    json: async () => body,
  };
}

describe("a write to HMRC through fileWithHmrc", () => {
  beforeEach(() => {
    authorizedFetch.mockReset();
    document.body.innerHTML = '<div id="statusMessagesContainer"></div>';
    window.showStatus = showStatus;
    window.dismissStatus = dismissStatus;
    window.narrateStage = narrateStage;
    window.endStage = endStage;
  });

  test("says the sending stage, polls with HMRC's waiting stage, and ends the stage with the answer", async () => {
    let stageWhileSending;
    authorizedFetch.mockImplementationOnce(async () => {
      stageWhileSending = texts();
      return jsonResponse(200, {});
    });

    await fileWithHmrc(WORDS, () => putSelfEmploymentAnnual(ANNUAL, "grant-1"));

    expect(stageWhileSending).toEqual(["Sending the annual submission to HMRC..."]);
    expect(authorizedFetch.mock.calls[0][1]).toMatchObject({
      method: "PUT",
      pollPendingMessage: "Waiting for HMRC's answer...",
      pollStage: true,
    });
    expect(texts()).toEqual([]);
    expect(document.getElementById("failureDetail")).toBeNull();
  });

  test("shows HMRC's rule in the failure panel, with what HMRC has not got and where the answers are, and throws on", async () => {
    const body = {
      message: "HMRC rejected the request",
      error: { hmrcResponseCode: 400, responseBody: { code: "RULE_ALLOWANCES_NOT_SUPPORTED", message: "Allowances not supported" } },
    };
    authorizedFetch.mockResolvedValueOnce(jsonResponse(400, body, "req-9"));

    await expect(fileWithHmrc(WORDS, () => putSelfEmploymentAnnual(ANNUAL, "grant-1"))).rejects.toMatchObject({ status: 400 });

    const panel = document.getElementById("failureDetail");
    expect(panel.dataset.kind).toBe("business-error");
    expect(panel.querySelector('[data-part="sent"]').textContent).toBe("HMRC has not got the annual submission.");
    expect(panel.querySelector('[data-part="answers"]').textContent).toBe("Your figures are still in the form.");
    expect(panel.querySelector('[data-part="errors"]').textContent).toBe("Allowances not supported (RULE_ALLOWANCES_NOT_SUPPORTED)");
    expect(texts()).toEqual([]);
  });

  test("a refused HMRC authorisation is the person's to renew, not a fault in Submit", async () => {
    authorizedFetch.mockResolvedValueOnce(jsonResponse(403, { reason: "hmrc_scope_insufficient", userMessage: "Authorise again." }));

    await expect(fileWithHmrc(WORDS, () => putSelfEmploymentAnnual(ANNUAL, "grant-1"))).rejects.toThrow("Authorise again.");

    expect(document.getElementById("failureDetail").dataset.kind).toBe("your-credentials");
  });

  test("a write outside fileWithHmrc polls as before", async () => {
    authorizedFetch.mockResolvedValueOnce(jsonResponse(200, {}));
    await putSelfEmploymentAnnual(ANNUAL, "grant-1");
    expect(authorizedFetch.mock.calls[0][1]).not.toHaveProperty("pollStage");
    expect(hmrcWritePollOptions()).toEqual({});
  });
});
