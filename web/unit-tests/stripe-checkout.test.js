// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/stripe-checkout.test.js

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { Window } from "happy-dom";
import { goToStripe, startActivityCheckout } from "../public/lib/stripe-checkout.js";

function jsonAnswer(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

describe("the trip to a Stripe page", () => {
  let stages;
  let page;

  beforeEach(() => {
    stages = [];
    const dom = new Window({ url: "https://submit.example/companies-house/changeCompanyName.html" });
    dom.document.body.innerHTML = '<div id="statusMessagesContainer"></div>';
    page = {
      narrateStage: vi.fn((message) => stages.push(message)),
      endStage: vi.fn(() => stages.push("(end)")),
      fetchWithIdToken: vi.fn(),
      location: { href: "", origin: "https://submit.example", pathname: "/companies-house/changeCompanyName.html" },
    };
    vi.stubGlobal("window", page);
    vi.stubGlobal("document", dom.document);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("the activity checkout asks Stripe, then goes there, saying each stage, and keeps the resume record before it leaves", async () => {
    page.fetchWithIdToken.mockResolvedValue(jsonAnswer(200, { checkoutUrl: "https://checkout.stripe.test/c/1" }));
    const beforeRedirect = vi.fn(() => stages.push("(saved)"));
    const going = await startActivityCheckout({
      activityId: "ch-name-change",
      subjectKey: "01234567:x",
      priceKey: "same-day",
      beforeRedirect,
    });
    expect(going).toBe(true);
    expect(stages).toEqual(["Asking Stripe for a checkout...", "(saved)", "Taking you to Stripe to pay..."]);
    expect(page.location.href).toBe("https://checkout.stripe.test/c/1");
    const [path, init] = page.fetchWithIdToken.mock.calls[0];
    expect(path).toBe("/api/v1/billing/activity-checkout");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      activityId: "ch-name-change",
      subjectKey: "01234567:x",
      priceKey: "same-day",
      returnTo: "https://submit.example/companies-house/changeCompanyName.html",
    });
  });

  test("an activity checkout Stripe could not open ends the stage and shows the panel: nothing charged, nothing filed, Help and the reference", async () => {
    page.fetchWithIdToken.mockResolvedValue(
      jsonAnswer(500, { message: "Failed to create checkout session" }, { "x-request-id": "req-77" }),
    );
    const beforeRedirect = vi.fn();
    const going = await startActivityCheckout({ activityId: "confirmation-statement", subjectKey: "01234567:2026-11-01", beforeRedirect });
    expect(going).toBe(false);
    expect(beforeRedirect).not.toHaveBeenCalled();
    expect(stages).toEqual(["Asking Stripe for a checkout...", "(end)"]);
    const panel = document.getElementById("failureDetail");
    expect(panel.getAttribute("data-kind")).toBe("submit-fault");
    expect(panel.querySelector("[data-part=sent]").textContent).toBe("Nothing was charged. Stripe did not open a checkout.");
    expect(panel.querySelector("[data-part=answers]").textContent).toBe(
      "Nothing was filed with Companies House. The filing is sent after the fee is paid.",
    );
    expect(panel.querySelector("[data-part=next] a").getAttribute("href")).toBe("/help.html");
    expect(panel.querySelector("[data-part=next]").textContent).toContain("req-77");
    expect(document.querySelector("#statusMessagesContainer + #failureDetail")).not.toBeNull();
  });

  test("the subscription page asks with a GET and no body, and goes to the portal Stripe gives", async () => {
    page.fetchWithIdToken.mockResolvedValue(jsonAnswer(200, { portalUrl: "https://billing.stripe.test/p/1" }));
    expect(await goToStripe("subscriptionPage")).toBe(true);
    expect(stages).toEqual(["Asking Stripe for your subscription page...", "Taking you to your subscription page at Stripe..."]);
    const [path, init] = page.fetchWithIdToken.mock.calls[0];
    expect(path).toBe("/api/v1/billing/portal");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(page.location.href).toBe("https://billing.stripe.test/p/1");
  });

  test("the firewall's HTML page on the bundle checkout is a blocked request, with the firewall's reference", async () => {
    page.fetchWithIdToken.mockResolvedValue(
      new Response("<html>Request blocked</html>", { status: 403, headers: { "content-type": "text/html", "x-amz-cf-id": "cf-9" } }),
    );
    expect(await goToStripe("bundleCheckout", { body: { bundleId: "resident-pro" } })).toBe(false);
    const panel = document.getElementById("failureDetail");
    expect(panel.getAttribute("data-kind")).toBe("blocked");
    expect(panel.querySelector("[data-part=answers]").textContent).toBe("Your bundles have not changed.");
    expect(panel.querySelector("[data-part=next]").textContent).toContain("cf-9");
  });

  test("a request that never got an answer is a connection failure, and a newer failure replaces the panel", async () => {
    page.fetchWithIdToken.mockRejectedValue(new TypeError("Failed to fetch"));
    await goToStripe("subscriptionPage");
    page.fetchWithIdToken.mockResolvedValue(jsonAnswer(404, { message: "No active subscription found" }));
    await goToStripe("subscriptionPage");
    const panels = document.querySelectorAll("#failureDetail");
    expect(panels).toHaveLength(1);
    expect(panels[0].getAttribute("data-kind")).toBe("your-credentials");
    expect(panels[0].querySelector("[data-part=sent]").textContent).toBe("Stripe did not open your subscription page.");
    expect(panels[0].querySelector("[data-part=answers]").textContent).toBe("Your subscription and your bundles have not changed.");
  });

  test("an answer with no page to open is a failure, not a trip to nowhere", async () => {
    page.fetchWithIdToken.mockResolvedValue(jsonAnswer(200, {}));
    expect(await goToStripe("bundleCheckout", { body: { bundleId: "resident-pro" } })).toBe(false);
    expect(page.location.href).toBe("");
    expect(document.getElementById("failureDetail").getAttribute("data-kind")).toBe("submit-fault");
  });
});
