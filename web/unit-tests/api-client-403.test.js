// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/api-client-403.test.js
// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from "vitest";
import { showFailure } from "../public/lib/utils/dom-utils.js";
import { handle403Error } from "../public/lib/services/api-client.js";

const shown = () => document.querySelector(".status-message-content")?.textContent ?? "";

describe("handle403Error", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="statusMessagesContainer"></div>';
    window.showFailure = showFailure;
  });

  it("reads an HTML 403 as the site's firewall blocking the request, with its reference", async () => {
    await handle403Error(
      new Response("<html><body><h1>403 ERROR</h1>Request blocked.</body></html>", {
        status: 403,
        headers: { "content-type": "text/html", "x-amz-cf-id": "cf-ref-123" },
      }),
    );

    expect(shown()).toContain("Request blocked");
    expect(shown()).toContain("The site's firewall blocked this request. Reference: cf-ref-123.");
    expect(shown()).not.toMatch(/bundle/i);
  });

  it("reads a 403 whose body is not JSON as a firewall block when it carries no reference", async () => {
    await handle403Error(new Response("Forbidden", { status: 403 }));

    expect(shown()).toContain("The site's firewall blocked this request.");
    expect(shown()).not.toContain("Reference");
  });

  it("still reads a JSON 403 without a code as a missing bundle", async () => {
    await handle403Error(
      new Response(JSON.stringify({ message: "Forbidden - missing required bundle" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );

    expect(shown()).toContain("You cannot use this yet");
    expect(shown()).toContain("Your account has no bundle that allows this.");
    expect(shown()).not.toContain("firewall");
  });
});
