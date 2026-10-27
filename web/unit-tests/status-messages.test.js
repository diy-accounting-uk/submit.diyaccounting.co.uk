// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/status-messages.test.js
// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from "vitest";
import { showStatus } from "../public/lib/utils/dom-utils.js";

const texts = () => Array.from(document.querySelectorAll(".status-message-content")).map((el) => el.textContent);

describe("status messages", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="statusMessagesContainer"></div>';
  });

  it("keeps progress messages while the request runs", () => {
    showStatus("Retrieving business details...", "info");
    showStatus("Still processing...", "info");
    expect(texts()).toEqual(["Retrieving business details...", "Still processing..."]);
  });

  it("removes progress messages when the request ends in an error", () => {
    showStatus("Retrieving business details...", "info");
    showStatus("Still processing...", "info");
    showStatus("Failed to retrieve business details: HMRC request failed", "error");
    expect(texts()).toEqual(["Failed to retrieve business details: HMRC request failed"]);
  });

  it("removes progress messages when the request succeeds", () => {
    showStatus("Retrieving business details...", "info");
    showStatus("Business details retrieved.", "success");
    expect(texts()).toEqual(["Business details retrieved."]);
  });

  it("replaces a short error with the fuller error that repeats it", () => {
    showStatus("Failed to retrieve business details.", "error");
    showStatus("Failed to retrieve business details: HMRC request failed", "error");
    expect(texts()).toEqual(["Failed to retrieve business details: HMRC request failed"]);
  });

  it("keeps two different errors", () => {
    showStatus("Access token expired. Please re-authenticate.", "error");
    showStatus("Failed to retrieve business details: HMRC request failed", "error");
    expect(texts()).toHaveLength(2);
  });
});

describe("failure message", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="statusMessagesContainer"></div>';
  });

  it("shows one message with a title, a cause and a link, and no HTTP status", async () => {
    const { showFailure, requestError } = await import("../public/lib/utils/dom-utils.js");
    showStatus("Failed to retrieve VAT obligations.", "error");
    showFailure(requestError({ status: 500 }, { message: "HMRC request failed (HTTP 500)" }, "x"), "Could not retrieve VAT obligations");
    const messages = document.querySelectorAll(".status-message");
    expect(messages).toHaveLength(1);
    expect(messages[0].querySelector(".status-message-title").textContent).toBe("Could not retrieve VAT obligations");
    expect(messages[0].textContent).not.toMatch(/HTTP|500/);
    expect(messages[0].querySelector("a.status-message-next").getAttribute("href")).not.toBe("");
  });

  it("links a missing bundle to the bundles page", async () => {
    const { showFailure } = await import("../public/lib/utils/dom-utils.js");
    showFailure({ status: 403, code: "BUNDLE_ENTITLEMENT_REQUIRED", message: "Forbidden" }, "Could not retrieve VAT obligations");
    expect(document.querySelector("a.status-message-next").getAttribute("href")).toBe("/bundles.html");
  });
});
