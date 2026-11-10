// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/pass.browser.test.js
// pass.html: every state and every refusal of a pass link, at phone and desktop width, the one
// click that redeems, the sign-in round trip, and the forward from bundles.html?pass=.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const SITE = "http://localhost:3000";
const WIDTHS = [375, 1280];
const CODE = "river-cloud-stone-lamp";

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".txt": "text/plain",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const VALID_PRO = { valid: true, bundleId: "resident-pro" };

// Serves the real site from disk. The API answers come from the options; every call is recorded.
async function serveRealSite(
  page,
  {
    signedIn = true,
    check = VALID_PRO,
    redeem = { redeemed: true, bundleId: "resident-pro", expiry: null },
    redeemStatus = 200,
    redeemFails = false,
    held = [],
    checkDelayMs = 0,
    redeemDelayMs = 0,
  } = {},
) {
  const calls = { check: 0, redeem: 0, bundle: 0 };
  await page.addInitScript((isSignedIn) => {
    try {
      if (isSignedIn) {
        localStorage.setItem("cognitoIdToken", "mock-id-token");
        localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email: "pat@example.com" }));
      }
    } catch {}
  }, signedIn);

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname === "/api/v1/pass" && method === "GET") {
      calls.check += 1;
      if (checkDelayMs) await new Promise((resolve) => setTimeout(resolve, checkDelayMs));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(check) });
      return;
    }
    if (url.pathname === "/api/v1/pass" && method === "POST") {
      calls.redeem += 1;
      if (redeemDelayMs) await new Promise((resolve) => setTimeout(resolve, redeemDelayMs));
      if (redeemFails) {
        await route.abort("failed");
        return;
      }
      await route.fulfill({ status: redeemStatus, contentType: "application/json", body: JSON.stringify(redeem) });
      return;
    }
    if (url.pathname === "/api/v1/bundle") {
      calls.bundle += 1;
      const bundles = held.map((bundleId) => ({ bundleId, allocated: true }));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bundles, tokensRemaining: 0 }) });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    const filePath = path.join(PUBLIC_ROOT, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      await route.fulfill({ status: 200, contentType: CONTENT_TYPES[ext] || "application/octet-stream", body: fs.readFileSync(filePath) });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
  return calls;
}

async function open(page, width, query = `?pass=${CODE}`) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${SITE}/pass.html${query}`, { waitUntil: "domcontentloaded" });
}

async function shot(page, state, width) {
  await page.screenshot({ path: `target/screenshots/pass-${state}-${width}.png`, fullPage: true });
}

async function expectNoSideScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

const heading = (page) => page.locator("#passHeading");

for (const width of WIDTHS) {
  test.describe(`pass.html at ${width}px`, () => {
    test("checking: the heading shows while the pass is checked", async ({ page }) => {
      await serveRealSite(page, { checkDelayMs: 1500 });
      await open(page, width);
      await expect(heading(page)).toHaveText("Checking your pass");
      await expect(page.locator("#passRedeemBtn")).toBeHidden();
      await shot(page, "checking", width);
    });

    test("no pass in the link: shows the passphrase box and the Redeem pass button", async ({ page }) => {
      await serveRealSite(page);
      await open(page, width, "");
      await expect(heading(page)).toHaveText("Enter your pass");
      await expect(page.locator("#passInput")).toBeVisible();
      await expect(page.getByRole("button", { name: "Redeem pass" })).toBeVisible();
      await shot(page, "entry", width);
    });

    test("the passphrase box opens the pass page for the typed code", async ({ page }) => {
      await serveRealSite(page);
      await open(page, width, "");
      await page.locator("#passInput").fill("  River-Cloud-Stone-Lamp ");
      await page.getByRole("button", { name: "Redeem pass" }).click();
      await expect(heading(page)).toHaveText("You have a pass for Resident Pro");
    });

    test("signed in, valid: names the bundle, what it gives, its tokens and the signed-in email", async ({ page }) => {
      const calls = await serveRealSite(page);
      await open(page, width);
      await expect(heading(page)).toHaveText("You have a pass for Resident Pro");
      await expect(heading(page)).toBeFocused();
      const message = page.locator("#passMessage");
      await expect(message).toContainText("This pass adds Resident Pro to your DIY Accounting Submit account.");
      await expect(message).toContainText(
        "With it you can submit VAT returns to HMRC, file accounts with Companies House, and make pass links for other people.",
      );
      await expect(message).toContainText("It comes with 100 tokens. A VAT return uses 1 token.");
      await expect(page.locator("#passAfterAction")).toHaveText("You are signed in as pat@example.com.");
      await expect(page.getByRole("button", { name: "Redeem pass" })).toBeEnabled();
      expect(calls.redeem).toBe(0);
      await expectNoSideScroll(page);
      await shot(page, "valid-signed-in", width);
    });

    test("signed out, valid: the same button, and one sentence that says sign-in comes next", async ({ page }) => {
      await serveRealSite(page, { signedIn: false });
      await open(page, width);
      await expect(heading(page)).toHaveText("You have a pass for Resident Pro");
      await expect(page.getByRole("button", { name: "Redeem pass" })).toBeVisible();
      await expect(page.locator("#passAfterAction")).toHaveText(
        "You sign in with a Google or Microsoft account next. When you come back, Resident Pro is on your account.",
      );
      await shot(page, "valid-signed-out", width);
    });

    test("signed out, a week pass leads with the offer: free VAT filing for 7 days, no card", async ({ page }) => {
      await serveRealSite(page, { signedIn: false, check: { valid: true, bundleId: "week-guest" } });
      await open(page, width);
      await expect(heading(page)).toHaveText("You have a pass for Week pass");
      await expect(page.locator("#passMessage")).toContainText("Free VAT filing for 7 days. No card needed.");
      await expect(page.locator("#passAfterAction")).toContainText("You sign in with a Google or Microsoft account next.");
      await expectNoSideScroll(page);
      await shot(page, "week-pass-signed-out", width);
    });

    test("signed out, an email-restricted pass adds the sentence about the invited address", async ({ page }) => {
      await serveRealSite(page, { signedIn: false, check: { ...VALID_PRO, emailRestricted: true } });
      await open(page, width);
      await expect(page.locator("#passAfterAction")).toContainText(
        "Use the Google or Microsoft account for the email address that this pass was sent to.",
      );
      await shot(page, "valid-restricted", width);
    });

    test("a pass for a timed bundle names how long it lasts", async ({ page }) => {
      await serveRealSite(page, { check: { valid: true, bundleId: "week-guest" } });
      await open(page, width);
      await expect(heading(page)).toHaveText("You have a pass for Week pass");
      await expect(page.locator("#passMessage")).toContainText("It comes with 3 tokens.");
      await expect(page.locator("#passMessage")).toContainText("It lasts 7 days.");
    });

    test("adding: the button is disabled and the heading names the bundle", async ({ page }) => {
      await serveRealSite(page, { redeemDelayMs: 1500 });
      await open(page, width);
      await page.getByRole("button", { name: "Redeem pass" }).click();
      await expect(heading(page)).toHaveText("Adding Resident Pro");
      await expect(heading(page)).toBeFocused();
      await expect(page.getByRole("button", { name: "Redeem pass" })).toBeDisabled();
      await shot(page, "adding", width);
    });

    test("signed in: one click redeems and shows Pass redeemed, the bundle card and one sentence", async ({ page }) => {
      const calls = await serveRealSite(page);
      await open(page, width);
      await page.getByRole("button", { name: "Redeem pass" }).click();

      await expect(heading(page)).toHaveText("Pass redeemed");
      await expect(heading(page)).toBeFocused();
      await expect(page.locator("#passBundle .bundle-row-name")).toHaveText("Resident Pro");
      await expect(page.locator("#passBundle .bundle-note")).toHaveText("100 tokens allocated · no end date");
      await expect(page.locator("#passMessage")).toHaveText(
        "Your pass added Resident Pro. You can now submit VAT returns to HMRC, file accounts with Companies House, and make pass links for other people. You have 100 tokens. There is no end date.",
      );
      await expect(page.getByRole("link", { name: "Go to your activities" })).toBeVisible();
      await expect(page.getByRole("link", { name: "See your bundles" })).toHaveAttribute("href", "bundles.html");
      expect(calls.redeem).toBe(1);
      await expectNoSideScroll(page);
      await shot(page, "redeemed", width);
    });

    test("a bundle with an end date says when it ends", async ({ page }) => {
      await serveRealSite(page, {
        check: { valid: true, bundleId: "week-guest" },
        redeem: { redeemed: true, bundleId: "week-guest", expiry: "2026-11-12T00:00:00.000Z" },
      });
      await open(page, width);
      await page.getByRole("button", { name: "Redeem pass" }).click();
      await expect(page.locator("#passMessage")).toContainText("It ends on 12 November 2026.");
      await expect(page.locator("#passBundle .bundle-note")).toContainText("ends on 12 November 2026");
      await shot(page, "redeemed-dated", width);
    });

    test("Go to your activities leads to the home page", async ({ page }) => {
      await serveRealSite(page);
      await open(page, width);
      await page.getByRole("button", { name: "Redeem pass" }).click();
      await page.getByRole("link", { name: "Go to your activities" }).click();
      await expect(page).toHaveURL(`${SITE}/`);
    });

    test("an account that holds the bundle posts nothing and says so", async ({ page }) => {
      const calls = await serveRealSite(page, { held: ["resident-pro"] });
      await open(page, width);
      await page.getByRole("button", { name: "Redeem pass" }).click();
      await expect(heading(page)).toHaveText("You already have this bundle");
      await expect(page.locator("#passMessage")).toHaveText(
        "Your account already has Resident Pro. This pass is still unused, so you can give it to someone else.",
      );
      expect(calls.redeem).toBe(0);
      await shot(page, "already-held", width);
    });

    const GET_REFUSALS = [
      ["not_found", "We cannot find this pass. Check that the link is complete, or ask the sender for a new one."],
      ["expired", "This pass has ended. Ask the sender for a new one."],
      ["exhausted", "This pass has been used. Ask the sender for a new one."],
      ["revoked", "This pass has been cancelled. Ask the sender for a new one."],
      ["not_yet_valid", "This pass does not start yet. Open the link again later."],
      ["held_for_review", "This pass is paused while we check it. Open the link again tomorrow."],
    ];
    for (const [reason, sentence] of GET_REFUSALS) {
      test(`the check answers ${reason}: one sentence and a way on`, async ({ page }) => {
        await serveRealSite(page, { check: { valid: false, reason } });
        await open(page, width);
        await expect(heading(page)).toHaveText("This pass did not work");
        await expect(heading(page)).toBeFocused();
        await expect(page.getByRole("alert")).toHaveText(sentence);
        await expect(page.getByRole("link", { name: "Go to your activities" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Redeem pass" })).toBeHidden();
        if (reason === "expired") await shot(page, "error-expired", width);
        if (reason === "not_found") await shot(page, "error-not-found", width);
      });
    }

    const POST_REFUSALS = [
      ["own_pass", 403, "You made this pass. Send the link to someone else to use."],
      ["referral_already_used", 409, "Your account has already used a pass link from someone. An account uses one."],
      ["already_redeemed", 409, "Your account has already used this pass."],
      ["exhausted", 200, "This pass has been used. Ask the sender for a new one."],
    ];
    for (const [reason, status, sentence] of POST_REFUSALS) {
      test(`the redemption answers ${reason}: one sentence and a way on`, async ({ page }) => {
        await serveRealSite(page, { redeem: { redeemed: false, reason }, redeemStatus: status });
        await open(page, width);
        await page.getByRole("button", { name: "Redeem pass" }).click();
        await expect(heading(page)).toHaveText("This pass did not work");
        await expect(page.getByRole("alert")).toHaveText(sentence);
        await expect(page.getByRole("link", { name: "Go to your activities" })).toBeVisible();
      });
    }

    test("a wrong email names the signed-in address and offers sign out", async ({ page }) => {
      await serveRealSite(page, { redeem: { redeemed: false, reason: "wrong_email" } });
      await open(page, width);
      await page.getByRole("button", { name: "Redeem pass" }).click();
      await expect(page.getByRole("alert")).toHaveText("This pass is for a different email address. You are signed in as pat@example.com.");
      await expect(page.getByRole("button", { name: "Sign out and use another account" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign out and use another account" })).not.toHaveAttribute("data-activity-start");
      await shot(page, "error-wrong-email", width);
    });

    test("the server answering already_held shows the already holds state", async ({ page }) => {
      await serveRealSite(page, { redeem: { redeemed: false, reason: "already_held" }, redeemStatus: 409 });
      await open(page, width);
      await page.getByRole("button", { name: "Redeem pass" }).click();
      await expect(heading(page)).toHaveText("You already have this bundle");
    });

    test("a pass that is used up, for an account that holds the bundle, shows Pass redeemed", async ({ page }) => {
      let posted = false;
      await serveRealSite(page, { redeem: { redeemed: false, reason: "exhausted" } });
      await page.route("**/api/v1/pass", async (route) => {
        if (route.request().method() === "POST") posted = true;
        await route.fallback();
      });
      await page.route("**/api/v1/bundle", async (route) => {
        const bundles = posted ? [{ bundleId: "resident-pro", allocated: true }] : [];
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bundles }) });
      });
      await open(page, width);
      await page.getByRole("button", { name: "Redeem pass" }).click();
      await expect(heading(page)).toHaveText("Pass redeemed");
    });

    test("a network failure offers Try again", async ({ page }) => {
      await serveRealSite(page, { redeemFails: true });
      await open(page, width);
      await page.getByRole("button", { name: "Redeem pass" }).click();
      await expect(page.getByRole("alert")).toHaveText("We could not reach DIY Accounting Submit. Check your connection and try again.");
      await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Try again" })).not.toHaveAttribute("data-activity-start");
      await shot(page, "error-network", width);
    });
  });
}

test.describe("pass.html sign-in round trip", () => {
  test("signed out: Redeem pass stores the return page and the code, then goes to sign-in", async ({ page }) => {
    const calls = await serveRealSite(page, { signedIn: false });
    await open(page, 375);
    await page.getByRole("button", { name: "Redeem pass" }).click();
    await expect(page).toHaveURL(/\/auth\/login\.html/);
    const stored = await page.evaluate(() => ({
      redirect: sessionStorage.getItem("postLoginRedirect"),
      flag: sessionStorage.getItem("passAddOnReturn"),
    }));
    expect(stored).toEqual({ redirect: `/pass.html?pass=${CODE}`, flag: CODE });
    expect(calls.redeem).toBe(0);
  });

  test("return from sign-in with the flag redeems once and clears the flag, with no second click", async ({ page }) => {
    const calls = await serveRealSite(page);
    await page.addInitScript((code) => {
      if (!sessionStorage.getItem("seeded")) {
        sessionStorage.setItem("seeded", "1");
        sessionStorage.setItem("passAddOnReturn", code);
      }
    }, CODE);
    await open(page, 375);
    await expect(heading(page)).toHaveText("Pass redeemed");
    expect(calls.redeem).toBe(1);
    expect(await page.evaluate(() => sessionStorage.getItem("passAddOnReturn"))).toBeNull();
    await shot(page, "redeemed-after-sign-in", 375);
  });

  test("return from sign-in with the flag for another code does not post", async ({ page }) => {
    const calls = await serveRealSite(page);
    await page.addInitScript(() => sessionStorage.setItem("passAddOnReturn", "some-other-pass-code"));
    await open(page, 375);
    await expect(heading(page)).toHaveText("You have a pass for Resident Pro");
    expect(calls.redeem).toBe(0);
  });

  test("signed in with no flag: the page never posts on load", async ({ page }) => {
    const calls = await serveRealSite(page);
    await open(page, 375);
    await expect(heading(page)).toHaveText("You have a pass for Resident Pro");
    await page.waitForTimeout(500);
    expect(calls.redeem).toBe(0);
  });

  test("signed out with the flag: the page never posts", async ({ page }) => {
    const calls = await serveRealSite(page, { signedIn: false });
    await page.addInitScript((code) => sessionStorage.setItem("passAddOnReturn", code), CODE);
    await open(page, 375);
    await expect(heading(page)).toHaveText("You have a pass for Resident Pro");
    expect(calls.redeem).toBe(0);
  });

  test("a reload after success shows Pass redeemed and makes no call", async ({ page }) => {
    const calls = await serveRealSite(page);
    await open(page, 375);
    await page.getByRole("button", { name: "Redeem pass" }).click();
    await expect(heading(page)).toHaveText("Pass redeemed");
    const before = { ...calls };

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(heading(page)).toHaveText("Pass redeemed");
    expect(calls.check).toBe(before.check);
    expect(calls.redeem).toBe(before.redeem);
  });
});

test.describe("pass.html with a next page from an activity page", () => {
  const NEXT = "/vat-obligations.html?vrn=123456789";
  const link = (next) => `?pass=${CODE}&next=${encodeURIComponent(next)}`;

  test("a path on this site becomes Continue, and Go to your activities stays a link", async ({ page }) => {
    const calls = await serveRealSite(page);
    await open(page, 375, link(NEXT));
    await expect(page).toHaveURL(`${SITE}/pass.html${link(NEXT)}`);
    await page.getByRole("button", { name: "Redeem pass" }).click();
    await expect(heading(page)).toHaveText("Pass redeemed");
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to your activities" })).toBeVisible();
    expect(calls.redeem).toBe(1);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(`${SITE}${NEXT}`);
  });

  test("the page does not leave on its own", async ({ page }) => {
    await serveRealSite(page);
    await open(page, 375, link(NEXT));
    await page.getByRole("button", { name: "Redeem pass" }).click();
    await expect(heading(page)).toHaveText("Pass redeemed");
    await page.waitForTimeout(500);
    expect(new URL(page.url()).pathname).toBe("/pass.html");
  });

  const REFUSED = [
    ["another host", "https://evil.example/x"],
    ["a protocol-relative address", "//evil.example/x"],
    ["a javascript address", "javascript:alert(1)"],
    ["a path with a backslash", "/\\evil.example"],
    ["a relative path", "vat-obligations.html"],
  ];
  for (const [label, next] of REFUSED) {
    test(`next to ${label} is ignored`, async ({ page }) => {
      await serveRealSite(page);
      await open(page, 375, link(next));
      await page.getByRole("button", { name: "Redeem pass" }).click();
      await expect(heading(page)).toHaveText("Pass redeemed");
      await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Go to your activities" })).toBeVisible();
    });
  }

  test("next survives the sign-in round trip in the stored return address", async ({ page }) => {
    await serveRealSite(page, { signedIn: false });
    await open(page, 375, link(NEXT));
    await page.getByRole("button", { name: "Redeem pass" }).click();
    await expect(page).toHaveURL(/\/auth\/login\.html/);
    const stored = await page.evaluate(() => sessionStorage.getItem("postLoginRedirect"));
    expect(stored).toBe(`/pass.html${link(NEXT)}`);
    expect(new URLSearchParams(stored.split("?")[1]).get("next")).toBe(NEXT);
  });

  test("the sign-out from a wrong email returns to the same pass link, signed out", async ({ page }) => {
    await serveRealSite(page, { redeem: { redeemed: false, reason: "wrong_email" } });
    // The page seeds a signed-in person on every load; after the sign-out the seed must not apply.
    await page.addInitScript(() => {
      if (localStorage.getItem("testSignedOut")) {
        localStorage.removeItem("cognitoIdToken");
        localStorage.removeItem("userInfo");
      }
    });
    // The Cognito logout endpoint sends the browser on to the logout_uri it was given.
    await page.route("**/test-cognito/logout*", (route) => {
      const back = new URL(route.request().url()).searchParams.get("logout_uri");
      return route.fulfill({ status: 200, contentType: "text/html", body: `<script>location.replace(${JSON.stringify(back)})</script>` });
    });
    await open(page, 375, link(NEXT));
    await page.getByRole("button", { name: "Redeem pass" }).click();
    await page.evaluate(() => localStorage.setItem("testSignedOut", "1"));
    await page.getByRole("button", { name: "Sign out and use another account" }).click();
    await expect(page).toHaveURL(`${SITE}/pass.html${link(NEXT)}`);
    await expect(heading(page)).toHaveText("You have a pass for Resident Pro");
    await expect(page.getByRole("button", { name: "Redeem pass" })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("cognitoIdToken"))).toBeNull();
    expect(await page.evaluate(() => sessionStorage.getItem("passReturnAfterSignOut"))).toBeNull();
  });

  test("signed-out.html with nothing stored stays put", async ({ page }) => {
    await serveRealSite(page, { signedIn: false });
    await page.goto(`${SITE}/auth/signed-out.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    expect(new URL(page.url()).pathname).toBe("/auth/signed-out.html");
  });
});

test.describe("bundles.html with a pass in the link", () => {
  test("forwards to pass.html with the query, and Back does not loop", async ({ page }) => {
    await serveRealSite(page);
    await page.goto(`${SITE}/about.html`, { waitUntil: "domcontentloaded" });
    await page.goto(`${SITE}/bundles.html?pass=${CODE}`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(`${SITE}/pass.html?pass=${CODE}`);
    await expect(heading(page)).toHaveText("You have a pass for Resident Pro");

    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(`${SITE}/about.html`);
  });

  test("the Have a pass form opens pass.html with the typed code", async ({ page }) => {
    await serveRealSite(page);
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`${SITE}/bundles.html`, { waitUntil: "domcontentloaded" });
    await page.locator("#passInput").fill(CODE);
    await page.getByRole("button", { name: "Redeem pass" }).click();
    await expect(page).toHaveURL(`${SITE}/pass.html?pass=${CODE}`);
  });

  test("sign-out clears the add-on-return flag and the stored pass results", async ({ page }) => {
    await serveRealSite(page);
    await open(page, 375);
    await page.getByRole("button", { name: "Redeem pass" }).click();
    await expect(heading(page)).toHaveText("Pass redeemed");
    await page.evaluate(() => sessionStorage.setItem("passAddOnReturn", "x"));
    await page.evaluate(() => {
      window.envReady = Promise.resolve({});
    });
    await page.evaluate(() => window.logout().catch(() => {}));
    await page.waitForTimeout(300);
    const left = await page.evaluate(() => ({
      flag: sessionStorage.getItem("passAddOnReturn"),
      results: sessionStorage.getItem("passResults"),
    }));
    expect(left).toEqual({ flag: null, results: null });
  });
});
