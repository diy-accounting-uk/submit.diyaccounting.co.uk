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
