// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/bundles.subscription.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { servePageScripts } from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("Bundles page subscription UI", () => {
  let bundlesHtmlContent;

  test.beforeAll(async () => {
    bundlesHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/bundles.html"), "utf-8");
  });

  function setupPage(page) {
    page.on("console", (msg) => {
      // eslint-disable-next-line no-console
      console.log(`[PAGE_CONSOLE:${msg.type()}]`, msg.text());
    });
    page.on("pageerror", (err) => {
      // eslint-disable-next-line no-console
      console.log("[PAGE_ERROR]", err?.message || String(err));
    });
  }

  async function setupRoutes(page, { bundles = [], passValidation = null, loggedIn = true } = {}) {
    await page.addInitScript(
      ({ loggedIn: li, passValidation: pv }) => {
        window.showStatus = window.showStatus || (() => {});
        window.checkAuthStatus = window.checkAuthStatus || (() => {});
        window.toggleMenu = window.toggleMenu || (() => {});
        if (li) {
          try {
            localStorage.setItem("cognitoIdToken", "mock-id-token");
          } catch {}
        }
        if (pv) {
          try {
            sessionStorage.setItem("passValidation", JSON.stringify(pv));
          } catch {}
        }
      },
      { loggedIn, passValidation },
    );

    // Serve the modified bundles.html via route so page.goto establishes a proper HTTP origin
    // (page.setContent creates an opaque origin where sessionStorage/localStorage are inaccessible)
    const modifiedHtml = bundlesHtmlContent
      .replace("<head>", '<head><base href="http://localhost:3000/">')
      .replace(
        "<body>",
        `<body><script>\nwindow.showStatus = window.showStatus || function(){};\nwindow.checkAuthStatus = window.checkAuthStatus || function(){};\nwindow.toggleMenu = window.toggleMenu || function(){};\n</script>`,
      );
    await page.route("**/bundles.html", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: modifiedHtml });
    });

    await page.route("**/*.js", async (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      const url = request.url();
      if (resourceType === "script" && !url.includes("toml-parser.js")) {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else if (url.includes("toml-parser.js")) {
        const tomlParserPath = path.join(process.cwd(), "web/public/lib/toml-parser.js");
        const tomlParserContent = fs.readFileSync(tomlParserPath, "utf-8");
        await route.fulfill({ status: 200, contentType: "application/javascript", body: tomlParserContent });
      } else {
        await route.continue();
      }
    });
    await servePageScripts(page);

    await page.route("**/submit.catalogue.toml", async (route) => {
      const tomlBody = `
[[bundles]]
id = "day-guest"
name = "Day Guest"
enable = "on-pass"
allocation = "on-request"
tokensGranted = 3

[[bundles]]
id = "resident-pro"
name = "Resident Pro"
enable = "on-pass"
hidden = false
allocation = "on-pass-on-subscription"
tokensGranted = 100
`;
      await route.fulfill({ status: 200, contentType: "text/x-toml", body: tomlBody });
    });

    await page.route("**/submit.environment-name.txt", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/plain", body: "test\n" });
    });

    await page.route("**/api/v1/bundle", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ bundles }),
      });
    });
  }

  async function loadPage(page) {
    await page.goto("http://localhost:3000/bundles.html", { waitUntil: "domcontentloaded" });
    await delay(400);
  }

  test("shows Subscribe button for on-pass-on-subscription bundle with valid pass", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, {
      passValidation: { code: "test-code", bundleId: "resident-pro", valid: true },
      bundles: [],
    });
    await loadPage(page);

    // resident-pro should have Subscribe button
    const subscribeBtn = page.locator('button[data-subscribe="true"]');
    await expect(subscribeBtn).toHaveCount(1);
    await expect(subscribeBtn).toContainText("Subscribe");
    await expect(subscribeBtn).toContainText("9.99");
  });

  test("shows Manage Subscription button when user has active subscription", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, {
      passValidation: { code: "test-code", bundleId: "resident-pro", valid: true },
      bundles: [
        {
          bundleId: "resident-pro",
          allocated: true,
          stripeSubscriptionId: "sub_test_123",
          stripeCustomerId: "cus_test_456",
        },
      ],
    });
    await loadPage(page);

    // Manage Subscription appears in both the catalogue card and Your Current Bundles section
    const manageBtns = page.locator('button[data-manage-subscription="true"]');
    await expect(manageBtns).toHaveCount(2);
    // Verify catalogue card button
    const catalogueBtn = page.locator('#catalogBundles button[data-manage-subscription="true"]');
    await expect(catalogueBtn).toHaveCount(1);
    await expect(catalogueBtn).toContainText("Manage Subscription");
  });

  test("shows Pass required for on-pass-on-subscription bundle without valid pass", async ({ page }) => {
    setupPage(page);
    await setupRoutes(page, { bundles: [] });
    await loadPage(page);

    // resident-pro should show Pass required since no pass validation
    // Both day-guest and resident-pro show "Pass required" (both have enable="on-pass")
    const passRequiredBtn = page.locator('button[data-bundle-id="resident-pro"][data-disabled-reason="on-pass"]');
    await expect(passRequiredBtn).toHaveCount(1);
    await expect(passRequiredBtn).toContainText("Pass required");
  });
});

// The real Bundles page from disk, signed in, with the billing routes answered here. checkout and
// portal answer the two billing routes; a hold keeps a route's answer back until the test opens it.
test.describe("Bundles page trips to Stripe", () => {
  const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
  const SCREENSHOT_DIR = path.join(process.cwd(), "target/roll13");
  const CONTENT_TYPES = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".toml": "text/x-toml",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
  };
  const base64Url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const ID_TOKEN = `${base64Url({ alg: "none" })}.${base64Url({ sub: "user1", email: "reader@example.com", exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;

  function hold() {
    let arrive;
    let open;
    const arrived = new Promise((resolve) => (arrive = resolve));
    const opened = new Promise((resolve) => (open = resolve));
    return { arrived, open, pass: () => (arrive(), opened) };
  }

  async function openBundles(page, pagePath, { bundles = [], checkout, portal, holds = {}, requests = [] } = {}) {
    await page.emulateMedia({ colorScheme: "light" });
    await page.addInitScript((token) => {
      localStorage.setItem("consent.analytics", "declined");
      localStorage.setItem("cognitoIdToken", token);
      localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email: "reader@example.com" }));
      // Each stage goes into session storage too, so the record outlives the trip to Stripe's page.
      new MutationObserver((changes) => {
        for (const change of changes) {
          for (const node of change.addedNodes) {
            if (node.nodeType !== 1 || !node.matches('.status-message[data-request-id="submission-stage"]')) continue;
            const stages = JSON.parse(sessionStorage.getItem("test.stages") || "[]");
            stages.push(node.querySelector(".status-message-content").textContent);
            sessionStorage.setItem("test.stages", JSON.stringify(stages));
          }
        }
      }).observe(document, { childList: true, subtree: true });
    }, ID_TOKEN);
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (url.pathname === "/api/v1/billing/checkout") {
        requests.push({
          path: url.pathname,
          method: request.method(),
          body: JSON.parse(request.postData() || "{}"),
          language: request.headers()["x-site-language"],
        });
        await holds.checkout?.pass();
        return route.fulfill(
          checkout ?? {
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ checkoutUrl: "http://localhost:3000/stripe-stub.html" }),
          },
        );
      }
      if (url.pathname === "/api/v1/billing/portal") {
        requests.push({ path: url.pathname, method: request.method() });
        await holds.portal?.pass();
        return route.fulfill(
          portal ?? {
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ portalUrl: "http://localhost:3000/stripe-stub.html" }),
          },
        );
      }
      if (url.pathname === "/stripe-stub.html")
        return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Stripe</title>" });
      if (url.pathname === "/api/v1/bundle") return json({ bundles, tokensRemaining: 10 });
      if (url.pathname === "/api/v1/affiliate/application") return json({ state: "none" });
      if (url.pathname === "/api/v1/pass/my-passes") return json({ passes: [] });
      if (url.pathname.startsWith("/api/")) return json({});
      const filePath = path.join(PUBLIC_ROOT, decodeURIComponent(url.pathname));
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return route.fulfill({
          status: 200,
          contentType: CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
          body: fs.readFileSync(filePath),
        });
      }
      return route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    });
    await page.goto(`http://localhost:3000/${pagePath}`, { waitUntil: "load" });
    await expect(page.locator("button[data-bundle-id]").first()).toBeVisible();
  }

  async function shoot(page, name) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-${page.viewportSize().width}.png`) });
  }

  const stage = (page) =>
    page.locator('#statusMessagesContainer .status-message[data-request-id="submission-stage"] .status-message-content');
  const recordedStages = async (page) => JSON.parse((await page.evaluate(() => sessionStorage.getItem("test.stages"))) || "[]");
  const SUBSCRIBED = [{ bundleId: "resident-vat", allocated: true, stripeSubscriptionId: "sub_test_1", stripeCustomerId: "cus_test_1" }];

  for (const [language, pagePath, words] of [
    [
      "English",
      "bundles.html",
      {
        askingCheckout: "Asking Stripe for a checkout...",
        goingCheckout: "Taking you to Stripe to pay...",
        askingPortal: "Asking Stripe for your subscription page...",
        goingPortal: "Taking you to your subscription page at Stripe...",
        sentCheckout: "Nothing was charged. Stripe did not open a checkout.",
        sentPortal: "Stripe did not open your subscription page.",
        after: "Your bundles have not changed.",
        noSubscription: "Your account has no subscription paid through Stripe, so there is no subscription page to open.",
      },
    ],
    [
      "Welsh",
      "cy/bundles.html",
      {
        askingCheckout: "Yn gofyn i Stripe am dudalen dalu...",
        goingCheckout: "Yn mynd â chi i Stripe i dalu...",
        askingPortal: "Yn gofyn i Stripe am eich tudalen danysgrifio...",
        goingPortal: "Yn mynd â chi i’ch tudalen danysgrifio yn Stripe...",
        sentCheckout: "Ni chodwyd tâl. Ni agorodd Stripe dudalen dalu.",
        sentPortal: "Ni agorodd Stripe eich tudalen danysgrifio.",
        after: "Nid yw eich Bundles wedi newid.",
        noSubscription: "Nid oes gan eich cyfrif danysgrifiad a delir drwy Stripe, felly nid oes tudalen danysgrifio i’w hagor.",
      },
    ],
  ]) {
    const suffix = language === "Welsh" ? "-cy" : "";
    for (const width of [1280, 390]) {
      test(`Subscribe says it is asking Stripe, then that it is taking the reader to Stripe, one stage at a time, in ${language} at ${width}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        const holds = { checkout: hold() };
        const requests = [];
        await openBundles(page, pagePath, { holds, requests });
        const subscribe = page.locator('button[data-subscribe][data-bundle-id="resident-vat"]').first();
        await subscribe.click();
        await holds.checkout.arrived;
        await expect(stage(page)).toHaveText([words.askingCheckout]);
        await expect(subscribe).toBeDisabled();
        await shoot(page, `bundle-asking${suffix}`);
        holds.checkout.open();
        await page.waitForURL("**/stripe-stub.html");
        expect((await recordedStages(page)).slice(-2)).toEqual([words.askingCheckout, words.goingCheckout]);
        expect(requests[0]).toMatchObject({ method: "POST", body: { bundleId: "resident-vat" } });
        expect(requests[0].language).toBe(language === "Welsh" ? "cy" : undefined);
      });

      test(`a checkout Stripe could not open shows the failure panel and gives Subscribe back, in ${language} at ${width}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await openBundles(page, pagePath, {
          checkout: {
            status: 500,
            contentType: "application/json",
            headers: { "x-request-id": "6f1c2a9e-7b3d-4e2a-9c61-2d8f0b5e7a13" },
            body: JSON.stringify({ message: "Failed to create checkout session" }),
          },
        });
        const subscribe = page.locator('button[data-subscribe][data-bundle-id="resident-vat"]').first();
        await subscribe.click();
        const panel = page.locator("#statusMessagesContainer + #failureDetail");
        await expect(panel).toHaveAttribute("data-kind", "submit-fault");
        await expect(stage(page)).toHaveCount(0);
        await expect(panel.locator("[data-part=sent]")).toHaveText(words.sentCheckout);
        await expect(panel.locator("[data-part=answers]")).toHaveText(words.after);
        await expect(panel.locator("[data-part=next]")).toContainText("6f1c2a9e-7b3d-4e2a-9c61-2d8f0b5e7a13");
        await expect(subscribe).toBeEnabled();
        await page.mouse.move(0, 0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await shoot(page, `bundle-failed${suffix}`);
      });
    }

    test(`Manage Subscription says it is asking Stripe for the subscription page, then goes there, in ${language}`, async ({ page }) => {
      const holds = { portal: hold() };
      const requests = [];
      await openBundles(page, pagePath, { bundles: SUBSCRIBED, holds, requests });
      await page.locator('#catalogBundles button[data-manage-subscription="true"]').click();
      await holds.portal.arrived;
      await expect(stage(page)).toHaveText([words.askingPortal]);
      await shoot(page, `portal-asking${suffix}`);
      holds.portal.open();
      await page.waitForURL("**/stripe-stub.html");
      expect((await recordedStages(page)).slice(-2)).toEqual([words.askingPortal, words.goingPortal]);
      expect(requests).toEqual([{ path: "/api/v1/billing/portal", method: "GET" }]);
    });

    test(`a subscription page Stripe has none for shows the failure panel with a link to the bundles, in ${language}`, async ({ page }) => {
      await openBundles(page, pagePath, {
        bundles: [{ bundleId: "resident-vat", allocated: true, stripeSubscriptionId: "sub_test_1" }],
        portal: { status: 404, contentType: "application/json", body: JSON.stringify({ message: "No active subscription found" }) },
      });
      const manage = page.locator('#catalogBundles button[data-manage-subscription="true"]');
      await manage.click();
      const panel = page.locator("#statusMessagesContainer + #failureDetail");
      await expect(panel).toHaveAttribute("data-kind", "your-credentials");
      await expect(panel.locator("[data-part=sent]")).toHaveText(words.sentPortal);
      await expect(panel.locator("[data-part=kind]")).toHaveText(words.noSubscription);
      await expect(panel.locator("[data-part=next] a")).toHaveAttribute("href", "/bundles.html");
      await expect(manage).toBeEnabled();
      await page.mouse.move(0, 0);
      await shoot(page, `portal-failed${suffix}`);
    });
  }
});
