// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/behaviour-hmrc-steps.js

import { expect, test } from "@playwright/test";
import { loggedFill, timestamp, loggedClick } from "../helpers/behaviour-helpers.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-hmrc-steps";

export async function acceptCookiesHmrc(page, screenshotPath = defaultScreenshotPath) {
  await test.step("Accept additional cookies and hide banner if presented", async () => {
    // Accept cookies if the banner is present
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-accept-cookies.png` });
    const acceptCookiesButton = page.getByRole("button", { name: "Accept additional cookies" });
    if (await acceptCookiesButton.isVisible()) {
      console.log("[USER INTERACTION] Clicking: Accept additional cookies button - Accepting cookies");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-accepting-cookies.png` });
      await loggedClick(page, acceptCookiesButton, "Accept additional cookies");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-accepted-cookies.png` });
    }
    // Hide the cookies message if it's still visible
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-accept-cookies-hide.png` });
    const hideCookiesButton = page.getByRole("button", { name: "Hide cookies message" });
    if (await hideCookiesButton.isVisible()) {
      console.log("[USER INTERACTION] Clicking: Hide cookies message button - Hiding cookies message");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-accept-cookies-hide-clicking.png` });
      await loggedClick(page, hideCookiesButton, "Hide cookies message");
      await page.screenshot({
        path: `${screenshotPath}/${timestamp()}-06-hid-cookies-message.png`,
      });
    }
  });
}

export async function goToHmrcAuth(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user continues and is offered to sign in to the HMRC online service", async () => {
    //  Submit the permission form and expect the sign in option to be visible
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-submit-permission-wait.png` });
    await page.waitForTimeout(100);

    // If the screen has the text "invalid_request" anywhere, then fail the step immediately
    const pageContent = await page.content();
    if (pageContent.includes("invalid_request")) {
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-submit-permission-sign-in.png` });
      throw new Error("HMRC authorization page returned an invalid_request error");
    }

    console.log(`[USER INTERACTION] Clicking: Continue button - Continuing with HMRC permission`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-submit-permission.png` });
    await loggedClick(page, page.getByRole("button", { name: "Continue" }), "Continue");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-submit-permission-sign-in.png` });
    await expect(page.getByRole("button", { name: "Sign in to the HMRC online service" })).toContainText(
      "Sign in to the HMRC online service",
    );
  });
}

export async function initHmrcAuth(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user chooses to sign in to HMRC and sees the credential fields", async () => {
    // Submit the sign in and expect the credentials form to be visible
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-init-hmrc-auth.png` });
    console.log(`[USER INTERACTION] Clicking: Sign in to HMRC button - Starting HMRC authentication`);
    await loggedClick(page, page.getByRole("button", { name: "Sign in to the HMRC online service" }), "Sign in to the HMRC online service");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-init-hmrc-auth.png` });
    await expect(page.locator("#userId")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
  });
}

export async function fillInHmrcAuth(page, hmrcTestUsername, hmrcTestPassword, screenshotPath = defaultScreenshotPath) {
  await test.step("The user provides HMRC credentials", async () => {
    // Fill in credentials and submit expecting this to initiate the HMRC sign in process
    await loggedFill(page, "#userId", hmrcTestUsername, "Entering HMRC user ID");
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-fill-in-hmrc-auth.png` });
    await loggedFill(page, "#password", hmrcTestPassword, "Entering HMRC password");
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-fill-in-hmrc-auth.png` });
  });
}

export async function submitHmrcAuth(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user submits HMRC credentials, expecting to be prompted to grant permission", async () => {
    console.log(`[USER INTERACTION] Clicking: Sign in button - Submitting HMRC credentials`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-submit-hmrc-auth.png` });
    await loggedClick(page, page.getByRole("button", { name: "Sign in" }), "Sign in");
    // The click starts a navigation; a screenshot taken while the page is being torn down fails
    // with "Unable to capture screenshot", so wait for the next document first.
    await page.waitForLoadState("domcontentloaded");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-submit-hmrc-auth-clicked.png` });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-submit-hmrc-auth.png` });
    await expect(page.locator("#givePermission")).toBeVisible();
  });
}

export async function grantPermissionHmrcAuth(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user grants permission to HMRC and returns to the application", async () => {
    //  Submit the give permission form
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-give-permission-hmrc-auth.png` });
    // Click triggers redirect back to app - wait for navigation to complete
    await Promise.all([page.waitForURL(/.*/, { timeout: 30000 }), loggedClick(page, "#givePermission", "Give permission")]);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-give-permission-redirected.png` });
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-give-permission-hmrc-auth.png` });
  });
}

/**
 * Walk a second HMRC consent if the click just before this landed on one.
 *
 * The catalogue grants each ITSA page only the scopes its own activity needs
 * (web/public/submit.catalogue.toml), so a read-only page like Business Details carries a token
 * that a write page (Annual Submission, Losses and Claims, a quarterly update, Final
 * Declaration) finds insufficient on its first submit. The app then clears that token and
 * redirects to HMRC for a wider grant - the same full walk the suite already made once for the
 * read-only page, requiring credentials again because this is a new authorization request, not a
 * refresh of the old one. A page that already holds a sufficient token makes no such redirect, so
 * this is a no-op then.
 *
 * The redirect to HMRC's sandbox is a real, variable-length round trip (seen anywhere from a few
 * seconds to tens of seconds against the live sandbox), so the entry check waits for the browser
 * to actually leave the app's origin rather than testing an HMRC element for instant visibility -
 * an instant check races the redirect and reads "not there yet" as "not needed". Once off the
 * app's origin, HMRC's own pages can arrive in any order depending on whether the sandbox still
 * holds a signed-in session (straight to consent, or straight to the permission grant, skipping
 * sign-in entirely) - each step re-detects whichever page is now showing instead of assuming a
 * fixed sequence.
 */
export async function completeHmrcReauthIfPresented(page, hmrcTestUsername, hmrcTestPassword, screenshotPath = defaultScreenshotPath) {
  await test.step("If the last click needed a wider HMRC grant, walk through it again", async () => {
    const appOrigin = new URL(page.url()).origin;
    const leftAppOrigin = await page
      .waitForURL((url) => url.origin !== appOrigin, { timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (!leftAppOrigin) {
      return;
    }

    const maxSteps = 10;
    for (let step = 0; step < maxSteps; step += 1) {
      // A redirect click lands on a chain of HTTP redirects, so the url settles before the dom
      // does; wait for the network to go quiet before reading what's on the page.
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
      if (new URL(page.url()).origin === appOrigin) {
        return;
      }
      await acceptCookiesHmrc(page, screenshotPath);

      if (
        await page
          .locator("#userId")
          .isVisible()
          .catch(() => false)
      ) {
        await fillInHmrcAuth(page, hmrcTestUsername, hmrcTestPassword, screenshotPath);
        await submitHmrcAuth(page, screenshotPath);
      } else if (
        await page
          .locator("#givePermission")
          .isVisible()
          .catch(() => false)
      ) {
        await grantPermissionHmrcAuth(page, screenshotPath);
      } else if (
        await page
          .getByRole("button", { name: "Sign in to the HMRC online service" })
          .isVisible()
          .catch(() => false)
      ) {
        await initHmrcAuth(page, screenshotPath);
      } else if (
        await page
          .getByRole("button", { name: "Continue" })
          .isVisible()
          .catch(() => false)
      ) {
        await goToHmrcAuth(page, screenshotPath);
      }
      // None recognised: still mid-redirect. Loop back to the networkidle wait rather than
      // sleeping a fixed duration - the next settle is the pacing.
    }

    if (new URL(page.url()).origin === appOrigin) {
      return;
    }
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-00-reauth-stuck.png` });
    throw new Error(`completeHmrcReauthIfPresented: did not return from HMRC within ${maxSteps} steps (stuck at ${page.url()})`);
  });
}
