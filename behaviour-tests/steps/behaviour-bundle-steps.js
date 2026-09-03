// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/behaviour-bundle-steps.js

import { expect, test } from "@playwright/test";
import { loggedClick, timestamp } from "../helpers/behaviour-helpers.js";
import { getStripeClient } from "@app/lib/stripeClient.js";
import { loadCatalogFromRoot } from "@app/services/productCatalog.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-bundle-steps";

const catalogue = loadCatalogFromRoot();

// Resolves a bundle's catalogue id from its display name by looking it up in the catalogue,
// so a display-name change (e.g. "Day Guest" -> "Day pass") never breaks the id used for API
// calls. Falls back to a lowercased, hyphenated form of the name for bundles the catalogue
// doesn't define (e.g. the test-only "Test" bundle).
function resolveBundleId(bundleName) {
  const catalogBundle = catalogue.bundles?.find((b) => b.name === bundleName);
  return catalogBundle ? catalogBundle.id : bundleName.toLowerCase().replace(/\s+/g, "-");
}

export async function goToBundlesPage(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user navigates to Bundles via main navigation", async () => {
    // Go to bundles via main navigation
    console.log("Navigating to Bundles via main navigation...");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-goto-bundles-page-nav.png` });
    await expect(page.locator("nav.main-nav a:has-text('Bundles')")).toBeVisible({ timeout: 10000 });
    await Promise.all([
      page.waitForURL(/bundles\.html/, { waitUntil: "domcontentloaded", timeout: 30000 }),
      loggedClick(page, "nav.main-nav a:has-text('Bundles')", "Clicking Bundles in main navigation", { screenshotPath }),
    ]);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-goto-bundles-page-nav.png` });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-goto-bundles-page.png` });
  });
}

export async function clearBundles(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user clears any existing bundles via API call", async () => {
    // Remove all bundles via API call (idempotent operation)
    console.log("Removing all bundles via API...");
    await page.screenshot({
      path: `${screenshotPath}/${timestamp()}-01-removing-all-bundles.png`,
    });

    // Check if any allocated bundles exist — via catalogue "Added ✓" buttons OR current bundles "Remove" buttons
    const addedButtons = page.locator("button:has-text('Added ✓')");
    const removeButtons = page.locator("button[data-remove-bundle-id]");
    const addedCount = await addedButtons.count().catch(() => 0);
    const removeCount = await removeButtons.count().catch(() => 0);
    if (addedCount === 0 && removeCount === 0) {
      console.log("No 'Added ✓' or 'Remove' buttons found, bundles already cleared.");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-clear-bundles-skipping.png` });
      return;
    }

    // Call the API to remove all bundles
    console.log("Calling DELETE /api/v1/bundle with removeAll: true...");
    const result = await page.evaluate(async () => {
      const idToken = localStorage.getItem("cognitoIdToken");
      if (!idToken) {
        return { ok: false, error: "No auth token" };
      }
      try {
        const response = await fetch("/api/v1/bundle", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`,
          },
          body: JSON.stringify({ removeAll: true }),
        });
        return { ok: response.ok, status: response.status };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });

    console.log(`API remove all bundles result: ${JSON.stringify(result)}`);
    await page.screenshot({
      path: `${screenshotPath}/${timestamp()}-03-removing-all-bundles-api-called.png`,
    });

    // Reload the page to reflect the changes
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-page-reloaded.png` });

    // Verify bundles are cleared by checking the API response (no allocated bundles)
    const tries = 10;
    for (let i = 0; i < tries; i++) {
      const apiCheck = await page.evaluate(async () => {
        const idToken = localStorage.getItem("cognitoIdToken");
        if (!idToken) return { allocated: 0 };
        try {
          const response = await fetch("/api/v1/bundle", {
            headers: { Authorization: `Bearer ${idToken}` },
          });
          const data = await response.json();
          const allocated = (data.bundles || []).filter((b) => b.allocated).length;
          return { allocated };
        } catch {
          return { allocated: -1 };
        }
      });

      if (apiCheck.allocated === 0) {
        console.log(`[polling for removal]: API confirms no allocated bundles.`);
        break;
      }
      console.log(`[polling for removal]: ${apiCheck.allocated} bundles still allocated, waiting 1000ms (${i + 1}/${tries})`);
      await page.waitForTimeout(1000);
      if (i === tries - 1) {
        // Reload once more on final attempt
        await page.reload();
        await page.waitForLoadState("networkidle");
      }
    }

    // Also verify no "Added ✓" buttons remain on the page
    await page.reload();
    await page.waitForLoadState("networkidle");
    const remainingAdded = await page
      .locator("button:has-text('Added ✓')")
      .count()
      .catch(() => 0);
    console.log(`[clear-bundles]: Remaining 'Added ✓' buttons after clear: ${remainingAdded}`);
    await page.screenshot({
      path: `${screenshotPath}/${timestamp()}-07-removed-all-bundles.png`,
    });
  });
}

export async function ensureBundlePresent(
  page,
  bundleName = "Test",
  screenshotPath = defaultScreenshotPath,
  { isHidden = false, testPass = false } = {},
) {
  await test.step(`Ensure ${bundleName} bundle is present (idempotent)`, async () => {
    const bundleId = resolveBundleId(bundleName);
    console.log(`Ensuring ${bundleName} bundle is present (hidden=${isHidden}, testPass=${testPass})...`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-ensure-bundle.png` });

    // For hidden bundles, check "Your Current Bundles" section (data-remove-bundle-id buttons)
    // For visible bundles, check catalogue section ("Added ✓" buttons)
    if (isHidden) {
      // Hidden bundle: check if already in current bundles section
      const removeLocator = page.locator(`button[data-remove-bundle-id="${bundleId}"]`);
      if (await removeLocator.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`${bundleName} bundle already present in current bundles, skipping.`);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-ensure-bundle-skipping.png` });
        return;
      }
      // Hidden bundle not present — grant via pass API
      console.log(`Hidden bundle ${bundleName} not in current bundles, granting via pass API...`);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-ensure-bundle-adding.png` });
      await ensureBundleViaPassApi(page, bundleId, screenshotPath, { testPass });
      // Verify it now appears in current bundles
      await expect(removeLocator).toBeVisible({ timeout: 32000 });
      console.log(`${bundleName} bundle now present in current bundles.`);
      return;
    }

    // Non-hidden bundle: existing logic
    let addedLocator = page.getByRole("button", { name: `Added ✓ ${bundleName}` });
    if (!(await addedLocator.isVisible({ timeout: 1000 }))) {
      const tries = 5;
      for (let i = 0; i < tries; i++) {
        console.log(
          `[polling to ensure present]: "Added ✓ ${bundleName}" button not visible, waiting 1000ms and trying again (${i + 1}/${tries})`,
        );
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-ensure-bundle-waiting.png` });
        await page.waitForTimeout(1000);
        addedLocator = page.getByRole("button", { name: `Added ✓ ${bundleName}` });
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-ensure-bundle-waited.png` });
        if (await addedLocator.isVisible({ timeout: 1000 })) {
          console.log(`[polling to ensure present]: ${bundleName} bundle present.`);
          break;
        } else {
          console.log(`[polling to ensure present]: ${bundleName} bundle still not present.`);
        }
      }
    } else {
      console.log(`[polling to ensure present]: ${bundleName} bundle already present.`);
    }
    // Check if the "Request" button exists (it won't for on-pass bundles).
    const requestBtnLocator = page.getByRole("button", { name: `Request ${bundleName}`, exact: false });
    const isRequestVisible = await requestBtnLocator
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    const isRequestEnabled =
      isRequestVisible &&
      !(await requestBtnLocator
        .first()
        .isDisabled()
        .catch(() => true));

    if (testPass) {
      // testPass requested: always use pass API to ensure sandbox qualifier is set
      console.log(`testPass=true for ${bundleName}, using pass API for sandbox-qualified grant...`);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-ensure-bundle-adding.png` });
      await ensureBundleViaPassApi(page, bundleId, screenshotPath, { testPass });
    } else if (isRequestEnabled) {
      // Requestable and enabled bundles: skip if already present
      if (await addedLocator.isVisible({ timeout: 32000 })) {
        console.log(`${bundleName} bundle already present, skipping request.`);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-ensure-bundle-skipping.png` });
        return;
      }
      console.log(`${bundleName} bundle not present, requesting via UI...`);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-ensure-bundle-adding.png` });
      await requestBundle(page, bundleName, screenshotPath);
    } else {
      // On-pass bundles (visible but disabled) or not visible: re-grant via pass API to ensure fresh tokens
      console.log(`"Request ${bundleName}" button not enabled (on-pass bundle), using pass API for fresh grant...`);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-ensure-bundle-adding.png` });
      await ensureBundleViaPassApi(page, bundleId, screenshotPath, { testPass });
    }
  });
}

export async function removeBundle(page, bundleName = "Test", screenshotPath = defaultScreenshotPath) {
  await test.step(`Remove ${bundleName} bundle via UI`, async () => {
    console.log(`Removing ${bundleName} bundle...`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-remove-bundle.png` });

    // Look for the remove button in the current bundles section
    const bundleId = resolveBundleId(bundleName);
    const removeLocator = page.locator(`button[data-remove-bundle-id="${bundleId}"]`);
    if (await removeLocator.isVisible({ timeout: 3000 }).catch(() => false)) {
      await removeLocator.click();
      console.log(`Clicked remove button for ${bundleName}`);
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-remove-bundle-clicked.png` });
    } else {
      // Fallback: remove via API
      console.log(`Remove button for ${bundleName} not found in UI, removing via API...`);
      const result = await page.evaluate(async (bid) => {
        const idToken = localStorage.getItem("cognitoIdToken");
        if (!idToken) return { ok: false, error: "No auth token" };
        try {
          const response = await fetch(`/api/v1/bundle/${bid}`, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${idToken}`,
            },
          });
          return { ok: response.ok, status: response.status };
        } catch (err) {
          return { ok: false, error: err.message };
        }
      }, bundleId);
      console.log(`API remove ${bundleName} result: ${JSON.stringify(result)}`);
      await page.reload();
      await page.waitForLoadState("networkidle");
    }

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-remove-bundle-done.png` });

    // Verify the bundle is removed: "Added ✓ <bundle>" should no longer be visible
    await expect(page.getByRole("button", { name: `Added ✓ ${bundleName}` })).not.toBeVisible({ timeout: 16000 });
    console.log(`${bundleName} bundle removed successfully`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-remove-bundle-confirmed.png` });
  });
}

export async function verifyBundleApiResponse(page, screenshotPath = defaultScreenshotPath) {
  return await test.step("Verify bundle API response structure", async () => {
    const apiResponse = await page.evaluate(async () => {
      const idToken = localStorage.getItem("cognitoIdToken");
      if (!idToken) return { error: "No auth token" };
      try {
        const response = await fetch("/api/v1/bundle", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        return await response.json();
      } catch (err) {
        return { error: err.message };
      }
    });
    console.log(`Bundle API response: ${JSON.stringify(apiResponse)}`);
    return apiResponse;
  });
}

export async function ensureBundleViaPassApi(page, bundleId, screenshotPath = defaultScreenshotPath, { testPass = false } = {}) {
  return await test.step(`Ensure ${bundleId} bundle via pass API`, async () => {
    console.log(`Creating and redeeming pass for bundle ${bundleId} (testPass=${testPass})...`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pass-01-creating.png` });

    // Step 1: Create a pass via admin API (no auth required)
    const createResult = await page.evaluate(
      async ({ bid, isTestPass }) => {
        try {
          const passBody = {
            passTypeId: bid,
            bundleId: bid,
            validityPeriod: "P1D",
            maxUses: 1,
            createdBy: "behaviour-test",
          };
          if (isTestPass) passBody.testPass = true;
          const response = await fetch("/api/v1/pass/admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(passBody),
          });
          const body = await response.json();
          return { ok: response.ok, code: body?.data?.code || body?.code, body };
        } catch (err) {
          return { ok: false, error: err.message };
        }
      },
      { bid: bundleId, isTestPass: testPass },
    );

    console.log(`Pass creation result: ${JSON.stringify(createResult)}`);
    if (!createResult.ok || !createResult.code) {
      throw new Error(`Failed to create pass for ${bundleId}: ${JSON.stringify(createResult)}`);
    }

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pass-02-created.png` });

    // Step 2: Redeem the pass (authenticated)
    const redeemResult = await page.evaluate(async (code) => {
      const idToken = localStorage.getItem("cognitoIdToken");
      if (!idToken) return { ok: false, error: "No auth token" };
      try {
        const response = await fetch("/api/v1/pass", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`,
          },
          body: JSON.stringify({ code }),
        });
        return await response.json();
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }, createResult.code);

    console.log(`Pass redemption result: ${JSON.stringify(redeemResult)}`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pass-03-redeemed.png` });

    // Step 3: If bundle requires subscription, grant directly via bundle API
    // This bypasses Stripe for tests that need the bundle but aren't testing payment
    const data = redeemResult?.data || redeemResult;
    if (data?.requiresSubscription) {
      const isSandbox = data?.testPass || testPass;
      console.log(`Bundle ${bundleId} requires subscription — granting directly via bundle API for test setup (sandbox=${isSandbox})`);
      const grantResult = await page.evaluate(
        async ({ bid, sandbox }) => {
          const idToken = localStorage.getItem("cognitoIdToken");
          if (!idToken) return { ok: false, error: "No auth token" };
          try {
            const qualifiers = sandbox ? { sandbox: true } : {};
            const response = await fetch("/api/v1/bundle", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}`,
                "x-initial-request": "true",
              },
              body: JSON.stringify({ bundleId: bid, qualifiers }),
            });
            const body = await response.json();
            return { ok: response.ok, status: response.status, ...body };
          } catch (err) {
            return { ok: false, error: err.message };
          }
        },
        { bid: bundleId, sandbox: isSandbox },
      );
      console.log(`Direct bundle grant result: ${JSON.stringify(grantResult)}`);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pass-03b-direct-grant.png` });

      // 202 means async — poll until the bundle appears as allocated
      if (grantResult.status === 202 || !grantResult.message?.includes("already allocated")) {
        const maxPolls = 10;
        for (let i = 0; i < maxPolls; i++) {
          await page.waitForTimeout(1000);
          const allocated = await page.evaluate(async (bid) => {
            const idToken = localStorage.getItem("cognitoIdToken");
            if (!idToken) return false;
            const resp = await fetch("/api/v1/bundle", { headers: { Authorization: `Bearer ${idToken}` } });
            const d = await resp.json();
            return (d.bundles || []).some((b) => b.bundleId === bid && b.allocated);
          }, bundleId);
          if (allocated) {
            console.log(`[polling for grant]: Bundle ${bundleId} now allocated (poll ${i + 1}/${maxPolls})`);
            break;
          }
          console.log(`[polling for grant]: Bundle ${bundleId} not yet allocated, waiting... (${i + 1}/${maxPolls})`);
        }
      }
    }

    // Clear bundle cache so fetchUserBundles hits the API fresh after reload
    await page.evaluate(async () => {
      try {
        const uij = localStorage.getItem("userInfo");
        const uid = uij && JSON.parse(uij)?.sub;
        if (uid && window.bundleCache) await window.bundleCache.clearBundles(uid);
      } catch {}
    });

    // Reload page to reflect bundle changes
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-pass-04-reloaded.png` });

    return redeemResult;
  });
}

/**
 * Ensure a bundle is granted via the full checkout flow (pass → checkout → bundle grant).
 * In simulator: checkout auto-completes (mock billing endpoints).
 * In proxy/ci/prod: navigates to real Stripe test checkout and fills in test card.
 */
export async function ensureBundleViaCheckout(
  page,
  bundleId,
  screenshotPath = defaultScreenshotPath,
  { testPass = false, skipPass = false } = {},
) {
  return await test.step(`Ensure ${bundleId} bundle via checkout flow`, async () => {
    console.log(`Starting checkout for bundle ${bundleId} (testPass=${testPass}, skipPass=${skipPass})...`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-checkout-01-starting.png` });

    if (!skipPass) {
      // Step 1: Create a pass via admin API
      const createResult = await page.evaluate(
        async ({ bid, isTestPass }) => {
          try {
            const passBody = {
              passTypeId: bid,
              bundleId: bid,
              validityPeriod: "P1D",
              maxUses: 1,
              createdBy: "behaviour-test",
            };
            if (isTestPass) passBody.testPass = true;
            const response = await fetch("/api/v1/pass/admin", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(passBody),
            });
            const body = await response.json();
            return { ok: response.ok, code: body?.data?.code || body?.code, body };
          } catch (err) {
            return { ok: false, error: err.message };
          }
        },
        { bid: bundleId, isTestPass: testPass },
      );

      console.log(`Pass creation result: ${JSON.stringify(createResult)}`);
      if (!createResult.ok || !createResult.code) {
        throw new Error(`Failed to create pass for ${bundleId}: ${JSON.stringify(createResult)}`);
      }

      // Step 2: Redeem pass (expects requiresSubscription response)
      const redeemResult = await page.evaluate(async (code) => {
        const idToken = localStorage.getItem("cognitoIdToken");
        if (!idToken) return { ok: false, error: "No auth token" };
        try {
          const response = await fetch("/api/v1/pass", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${idToken}`,
            },
            body: JSON.stringify({ code }),
          });
          return await response.json();
        } catch (err) {
          return { ok: false, error: err.message };
        }
      }, createResult.code);

      const data = redeemResult?.data || redeemResult;
      console.log(`Pass redemption result: ${JSON.stringify(data)}`);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-checkout-02-pass-redeemed.png` });
    } // end if (!skipPass)

    // Step 3: Call checkout session API
    // Server auto-detects sandbox mode from bundle qualifiers (no explicit sandbox flag needed)
    const checkoutResult = await page.evaluate(
      async ({ bid }) => {
        const idToken = localStorage.getItem("cognitoIdToken");
        if (!idToken) return { ok: false, error: "No auth token" };
        try {
          const response = await fetch("/api/v1/billing/checkout-session", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${idToken}`,
            },
            body: JSON.stringify({ bundleId: bid }),
          });
          const body = await response.json();
          // Handle both response formats: mock returns { data: { checkoutUrl } }, real API returns { checkoutUrl }
          const checkoutUrl = body?.data?.checkoutUrl || body?.checkoutUrl;
          return { ok: response.ok, checkoutUrl, body };
        } catch (err) {
          return { ok: false, error: err.message };
        }
      },
      { bid: bundleId },
    );

    console.log(`Checkout session result: ${JSON.stringify(checkoutResult)}`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-checkout-03-session-created.png` });

    if (!checkoutResult.ok || !checkoutResult.checkoutUrl) {
      throw new Error(`Failed to create checkout session: ${JSON.stringify(checkoutResult)}`);
    }

    // Step 4: Navigate to checkout URL
    const checkoutUrl = checkoutResult.checkoutUrl;
    const isSimulatorCheckout = checkoutUrl.includes("simulator/checkout");
    const isStripeCheckout = checkoutUrl.includes("checkout.stripe.com");
    console.log(`Checkout URL: ${checkoutUrl} (simulator=${isSimulatorCheckout}, stripe=${isStripeCheckout})`);

    await page.goto(checkoutUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

    if (isSimulatorCheckout) {
      // Simulator: auto-completes — server grants bundle and redirects to bundles.html?checkout=success.
      // Wait for the success message rather than the URL, because bundles.html clears the
      // ?checkout=success param via history.replaceState before Playwright can observe it.
      console.log("Simulator checkout: auto-completing...");
      await page.waitForSelector("text=Subscription activated", { timeout: 15_000 });
      console.log("Simulator checkout completed successfully");
    } else if (isStripeCheckout) {
      // Real Stripe test checkout: fill in test card details.
      // Stripe Checkout hosted page is a JS SPA with an accordion UI for payment methods.
      // Card inputs are NOT rendered until the "Card" accordion item is clicked/expanded.
      // After expansion, card/expiry/CVC/name appear as direct <input> elements on the page.
      console.log("Stripe test checkout: waiting for Stripe form to render...");

      // Wait for the submit button (proves the SPA has loaded).
      const submitButton = page.locator('[data-testid="hosted-payment-submit-button"], button[type="submit"]');
      await submitButton.first().waitFor({ state: "visible", timeout: 60_000 });
      console.log("Stripe checkout form rendered (submit button visible)");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-checkout-04-stripe-loaded.png` });

      let filledFields = [];

      // Skip email — Stripe's Link feature intercepts the email input and opens
      // an auth overlay that blocks Playwright. Email is not required for test payments.

      // Wait for Stripe SPA to fully initialize (submit button visible is not enough —
      // the accordion, Link overlay, and payment methods need time to finish rendering).
      await page.waitForTimeout(3000);

      // Click the "Card" payment method to expand the accordion and reveal card inputs.
      // Use force:true because Stripe overlays (Link, express checkout) can obscure the radio.
      const cardRadio = page.locator("#payment-method-accordion-item-title-card");
      if (await cardRadio.isVisible({ timeout: 5000 }).catch(() => false)) {
        await cardRadio.click({ force: true });
        console.log("Clicked Card payment method accordion");
      } else {
        // Try clicking by label text as fallback
        const cardLabel = page.locator("text=Card").first();
        if (await cardLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
          await cardLabel.click({ force: true });
          console.log("Clicked Card label text");
        } else {
          console.log("Card radio/label not found — card fields may already be visible");
        }
      }

      // Wait for card number input to appear (proves accordion expanded)
      const cardNumberInput = page.locator('#cardNumber, input[name="cardNumber"], input[autocomplete="cc-number"]');
      await cardNumberInput.first().waitFor({ state: "visible", timeout: 15_000 });
      console.log("Card number input visible");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-checkout-04b-card-accordion-expanded.png` });

      // Fill card number — use pressSequentially to simulate real typing (Stripe's JS
      // listens for input/keydown events; fill() dispatches 'input' but not keystrokes,
      // which may cause Stripe to ignore the value in headless CI environments).
      await cardNumberInput.first().click({ force: true });
      await cardNumberInput.first().fill("");
      await cardNumberInput.first().pressSequentially("4242424242424242", { delay: 50 });
      filledFields.push("card");
      console.log("Card number filled (pressSequentially)");

      // Fill expiry — Tab from card number to move naturally between fields
      const expiryInput = page.locator('#cardExpiry, input[name="cardExpiry"], input[autocomplete="cc-exp"]');
      if (
        await expiryInput
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ) {
        await expiryInput.first().click({ force: true });
        await expiryInput.first().fill("");
        await expiryInput.first().pressSequentially("1230", { delay: 50 });
        filledFields.push("expiry");
        console.log("Expiry filled (pressSequentially)");
      }

      // Fill CVC
      const cvcInput = page.locator('#cardCvc, input[name="cardCvc"], input[autocomplete="cc-csc"]');
      if (
        await cvcInput
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ) {
        await cvcInput.first().click({ force: true });
        await cvcInput.first().fill("");
        await cvcInput.first().pressSequentially("123", { delay: 50 });
        filledFields.push("cvc");
        console.log("CVC filled (pressSequentially)");
      }

      // Fill cardholder name
      const nameInput = page.locator('#billingName, input[name="billingName"], input[autocomplete="cc-name"]');
      if (
        await nameInput
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ) {
        await nameInput.first().click({ force: true });
        await nameInput.first().fill("");
        await nameInput.first().pressSequentially("Test User", { delay: 30 });
        filledFields.push("name");
        console.log("Cardholder name filled (pressSequentially)");
      }

      // Select country — Stripe defaults to "United States" which requires ZIP code.
      // Change to "United Kingdom" (appropriate for a UK accounting service) which requires
      // a postal code. The country dropdown is a <select> element.
      const countrySelect = page.locator('#billingCountry, select[name="billingCountry"], select[autocomplete="billing country"]');
      if (
        await countrySelect
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ) {
        await countrySelect.first().selectOption("GB");
        filledFields.push("country");
        console.log("Country set to GB (United Kingdom)");
        await page.waitForTimeout(500); // Let Stripe update the postal code field
      }

      // Fill postal code / ZIP — this field is REQUIRED by Stripe for most countries.
      // Without it, form validation silently prevents submission (the root cause of CI failures).
      const postalInput = page.locator(
        '#billingPostalCode, input[name="billingPostalCode"], input[autocomplete="billing postal-code"], input[autocomplete="postal-code"]',
      );
      if (
        await postalInput
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ) {
        await postalInput.first().click({ force: true });
        await postalInput.first().fill("");
        await postalInput.first().pressSequentially("SW1A 1AA", { delay: 30 });
        filledFields.push("postal");
        console.log("Postal code filled (pressSequentially)");
      } else {
        console.log("Postal code input not found — may not be required for selected country");
      }

      console.log(`Stripe checkout: filled fields: [${filledFields.join(", ")}]`);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-checkout-05-stripe-filled.png` });

      if (!filledFields.includes("card")) {
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-checkout-05-CARD-NOT-FILLED.png`, fullPage: true });
        throw new Error("Stripe card number could not be filled — check diagnostic screenshots.");
      }

      // Wait for Stripe SPA to process field inputs before submitting
      await page.waitForTimeout(3000);

      // Click submit button. Use force:true because Stripe overlays (Link, express checkout,
      // AmazonPay) can intercept clicks. The root cause of prior CI failures was the missing
      // country/postal code fields above — with those filled, form validation passes and the
      // click actually triggers payment processing.
      console.log("Stripe checkout: clicking submit button...");
      await submitButton.first().click({ force: true, timeout: 10_000 });
      console.log("Stripe checkout: submit button clicked, waiting for processing...");

      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-checkout-05b-after-submit.png`, fullPage: true });

      // Check for Stripe error messages before waiting for redirect
      const stripeError = page.locator('.StripeError, [data-testid="error-message"], .p-FieldError');
      if (await stripeError.isVisible({ timeout: 5000 }).catch(() => false)) {
        const errorText = await stripeError.textContent().catch(() => "unknown");
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-checkout-05c-stripe-error.png`, fullPage: true });
        throw new Error(`Stripe payment error: ${errorText}`);
      }

      // Wait for redirect back to bundles page
      await page.waitForURL(/bundles\.html/, { timeout: 120_000 });
      console.log("Stripe checkout completed — redirected to bundles page");
    } else {
      // Unknown checkout URL — wait for redirect back to bundles page
      console.log(`Unknown checkout URL type, waiting for bundles redirect...`);
      await page.waitForURL(/bundles\.html/, { timeout: 60_000 });
    }

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-checkout-06-completed.png` });

    // Clear bundle cache and wait for bundle to appear
    await page.evaluate(async () => {
      try {
        const uij = localStorage.getItem("userInfo");
        const uid = uij && JSON.parse(uij)?.sub;
        if (uid && window.bundleCache) await window.bundleCache.clearBundles(uid);
      } catch {}
    });

    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-checkout-07-bundle-granted.png` });

    return { checkoutCompleted: true, checkoutUrl, isStripeCheckout, isSimulatorCheckout };
  });
}

export async function getTokensRemaining(page, bundleId) {
  return page.evaluate(async (bid) => {
    const idToken = localStorage.getItem("cognitoIdToken");
    if (!idToken) return null;
    const response = await fetch("/api/v1/bundle", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const data = await response.json();
    const bundle = (data.bundles || []).find((b) => b.bundleId === bid && b.allocated);
    return bundle?.tokensRemaining ?? null;
  }, bundleId);
}

export async function verifySubscriptionManagement(page, bundleName, screenshotPath) {
  // Verify "Manage Subscription" button is visible for a bundle with an active subscription.
  // The button appears in two places: the catalogue section and the current bundles section.
  // We check for either occurrence via the data-manage-subscription attribute.
  const manageBtn = page.locator(`button[data-manage-subscription="true"]`);
  await expect(manageBtn.first()).toBeVisible({ timeout: 10_000 });
  console.log(`"Manage Subscription" button visible for ${bundleName}`);

  if (screenshotPath) {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-manage-subscription-visible.png` });
  }

  // Verify clicking it calls the billing portal API and gets a portal URL
  // (We intercept the navigation to avoid leaving the test page)
  const portalResponse = await page.evaluate(async () => {
    const idToken = localStorage.getItem("cognitoIdToken");
    if (!idToken) return { error: "No auth token" };
    const response = await fetch("/api/v1/billing/portal", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const data = await response.json();
    return { status: response.status, portalUrl: data.portalUrl || null, error: data.message || null };
  });

  console.log(`Billing portal API response: status=${portalResponse.status}, hasUrl=${!!portalResponse.portalUrl}`);

  if (portalResponse.status !== 200 || !portalResponse.portalUrl) {
    throw new Error(`Billing portal API failed: status=${portalResponse.status}, error=${portalResponse.error}`);
  }

  return { manageButtonVisible: true, portalUrl: portalResponse.portalUrl };
}

export async function requestBundleViaApi(page, bundleId) {
  return await page.evaluate(async (bid) => {
    const idToken = localStorage.getItem("cognitoIdToken");
    if (!idToken) return { error: "No auth token" };
    try {
      const response = await fetch("/api/v1/bundle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify({ bundleId: bid, qualifiers: {} }),
      });
      const body = await response.json();
      return { statusCode: response.status, ...body };
    } catch (err) {
      return { error: err.message };
    }
  }, bundleId);
}

/**
 * Navigate to the usage page (/usage.html) from the current page.
 * Uses the current page origin to avoid 127.0.0.1 vs localhost mismatch.
 */
export async function goToUsagePage(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user navigates to the Token Usage page", async () => {
    console.log("Navigating to usage.html...");
    const currentOrigin = new URL(page.url()).origin;
    await page.goto(`${currentOrigin}/usage.html`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-usage-page-loaded.png` });
    console.log("Usage page loaded.");
  });
}

/**
 * Verify the Token Sources table on the usage page contains the expected bundles.
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {Array<{bundleId: string, tokensGranted?: number, tokensRemainingAtLeast?: number, tokensRemainingAtMost?: number}>} expectedBundles
 *   Each entry should have a bundleId (e.g. "resident-pro") and optional approximate token counts.
 * @param {string} screenshotPath - Screenshot directory path
 */
export async function verifyTokenSources(page, expectedBundles, screenshotPath = defaultScreenshotPath) {
  await test.step("Verify Token Sources table on usage page", async () => {
    console.log(`Verifying Token Sources table for ${expectedBundles.length} expected bundle(s)...`);

    const sourcesBody = page.locator("#tokenSourcesBody");
    await expect(sourcesBody).toBeVisible({ timeout: 10_000 });

    // Wait for the table to contain actual bundle data rows (not "Loading..." or "No token bundles found")
    // A real data row has 4 separate <td> cells; placeholder rows use a single <td colspan="4">
    const dataRow = sourcesBody.locator("tr").filter({ has: page.locator("td:nth-child(2)") });
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await expect(dataRow).not.toHaveCount(0, { timeout: 10_000 });
        break;
      } catch {
        if (attempt < maxRetries) {
          console.log(`Token Sources table not populated (attempt ${attempt}/${maxRetries}), clicking Refresh...`);
          const refreshBtn = page.locator("#refreshUsageBtn");
          if (await refreshBtn.isVisible()) {
            await refreshBtn.click();
            await page.waitForTimeout(2000);
          }
        } else {
          // Log table content for debugging before failing
          const bodyHtml = await sourcesBody.innerHTML().catch(() => "(could not read)");
          console.log(`Token Sources table HTML after ${maxRetries} attempts: ${bodyHtml}`);
          throw new Error(`Token Sources table did not load bundle data after ${maxRetries} attempts`);
        }
      }
    }

    const rows = sourcesBody.locator("tr");
    const rowCount = await rows.count();
    console.log(`Token Sources table has ${rowCount} row(s).`);

    for (const expected of expectedBundles) {
      console.log(`  Checking for bundle: ${expected.bundleId}`);

      // Find the row containing the bundle ID text
      const bundleRow = sourcesBody.locator(`tr:has(td:text-is("${expected.bundleId}"))`);
      const bundleRowCount = await bundleRow.count();
      console.log(`  Found ${bundleRowCount} row(s) matching bundleId "${expected.bundleId}".`);
      expect(bundleRowCount, `Expected at least one row for bundle "${expected.bundleId}" in Token Sources table`).toBeGreaterThanOrEqual(
        1,
      );

      // Get the cells from the first matching row
      const cells = bundleRow.first().locator("td");
      const cellCount = await cells.count();
      expect(cellCount, `Expected 4 cells in Token Sources row for "${expected.bundleId}"`).toBe(4);

      const bundleName = (await cells.nth(0).textContent()).trim();
      const tokensGranted = parseInt((await cells.nth(1).textContent()).trim(), 10);
      const tokensRemaining = parseInt((await cells.nth(2).textContent()).trim(), 10);
      const expiryInfo = (await cells.nth(3).textContent()).trim();

      console.log(`  Bundle: ${bundleName}, Granted: ${tokensGranted}, Remaining: ${tokensRemaining}, Expiry: ${expiryInfo}`);

      expect(bundleName).toBe(expected.bundleId);

      if (expected.tokensGranted !== undefined) {
        expect(tokensGranted, `Expected tokensGranted=${expected.tokensGranted} for "${expected.bundleId}"`).toBe(expected.tokensGranted);
      }

      if (expected.tokensRemainingAtLeast !== undefined) {
        expect(
          tokensRemaining,
          `Expected tokensRemaining >= ${expected.tokensRemainingAtLeast} for "${expected.bundleId}"`,
        ).toBeGreaterThanOrEqual(expected.tokensRemainingAtLeast);
      }

      if (expected.tokensRemainingAtMost !== undefined) {
        expect(
          tokensRemaining,
          `Expected tokensRemaining <= ${expected.tokensRemainingAtMost} for "${expected.bundleId}"`,
        ).toBeLessThanOrEqual(expected.tokensRemainingAtMost);
      }
    }

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-usage-token-sources-verified.png` });
    console.log("Token Sources table verification complete.");
  });
}

/**
 * Verify the Token Consumption table on the usage page contains the expected activity entries.
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {Array<{activity: string, minCount?: number, tokensUsed?: number}>} expectedActivities
 *   Each entry should have an activity name (e.g. "submit-vat") and optional minimum count of matching rows.
 * @param {string} screenshotPath - Screenshot directory path
 */
export async function verifyTokenConsumption(page, expectedActivities, screenshotPath = defaultScreenshotPath) {
  await test.step("Verify Token Consumption table on usage page", async () => {
    console.log(`Verifying Token Consumption table for ${expectedActivities.length} expected activity type(s)...`);

    const consumptionBody = page.locator("#tokenConsumptionBody");
    await expect(consumptionBody).toBeVisible({ timeout: 10_000 });

    const rows = consumptionBody.locator("tr");
    const rowCount = await rows.count();
    console.log(`Token Consumption table has ${rowCount} row(s).`);

    // Check if the table is showing "No token consumption recorded." placeholder
    if (rowCount === 1) {
      const firstRowText = (await rows.first().textContent()).trim();
      if (firstRowText.includes("No token consumption recorded")) {
        console.log("  Token Consumption table shows 'No token consumption recorded.'");
        // If we expected activities, this is a failure
        for (const expected of expectedActivities) {
          if ((expected.minCount || 1) > 0) {
            expect(false, `Expected at least ${expected.minCount || 1} "${expected.activity}" entries but table is empty`).toBe(true);
          }
        }
        return;
      }
    }

    for (const expected of expectedActivities) {
      const minCount = expected.minCount !== undefined ? expected.minCount : 1;
      console.log(`  Checking for activity: "${expected.activity}" (minCount=${minCount})`);

      // Find rows where the first cell (Activity column) contains the expected activity text
      const activityRows = consumptionBody.locator(`tr:has(td:nth-child(1):text-is("${expected.activity}"))`);
      const matchCount = await activityRows.count();
      console.log(`  Found ${matchCount} row(s) matching activity "${expected.activity}".`);
      expect(matchCount, `Expected at least ${minCount} "${expected.activity}" entries in Token Consumption table`).toBeGreaterThanOrEqual(
        minCount,
      );

      // If tokensUsed is specified, verify it in the matching rows
      if (expected.tokensUsed !== undefined) {
        for (let i = 0; i < matchCount; i++) {
          const cells = activityRows.nth(i).locator("td");
          const tokensUsedText = (await cells.nth(2).textContent()).trim();
          const tokensUsed = parseInt(tokensUsedText, 10);
          console.log(`    Row ${i}: tokensUsed=${tokensUsed}`);
          expect(tokensUsed, `Expected tokensUsed=${expected.tokensUsed} for "${expected.activity}" row ${i}`).toBe(expected.tokensUsed);
        }
      }
    }

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-usage-token-consumption-verified.png` });
    console.log("Token Consumption table verification complete.");
  });
}

export async function verifyAlreadyGranted(page, bundleId, screenshotPath = defaultScreenshotPath) {
  return await test.step(`Verify ${bundleId} returns already_granted on re-request`, async () => {
    const result = await requestBundleViaApi(page, bundleId);
    console.log(`[already-granted]: ${bundleId} - status: ${result.status}, statusCode: ${result.statusCode}`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-already-granted-${bundleId}.png` });
    return result;
  });
}

export async function requestBundle(page, bundleName = "Test", screenshotPath = defaultScreenshotPath) {
  await test.step(`The user requests a ${bundleName} bundle and sees a confirmation message`, async () => {
    console.log(`Requesting ${bundleName} bundle...`);
    // Use substring matching for button text (may include token label like "(3 tokens)")
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-request-bundle.png` });
    let requestBtnLocator = page.locator(`button.service-btn:has-text("Request ${bundleName}")`);
    if (!(await requestBtnLocator.first().isVisible({ timeout: 1000 }))) {
      const tries = 5;
      for (let i = 0; i < tries; i++) {
        console.log(
          `[polling be ready to request]: "Request ${bundleName}" button not visible, waiting 1000ms and trying again (${i + 1}/${tries})`,
        );
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-request-bundle-waiting.png` });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-request-bundle-waited.png` });
        requestBtnLocator = page.locator(`button.service-btn:has-text("Request ${bundleName}")`);
        if (await requestBtnLocator.first().isVisible({ timeout: 1000 })) {
          console.log(`[polling be ready to request]: ${bundleName} bundle request button visible.`);
          break;
        } else {
          console.log(`[polling be ready to request]: ${bundleName} bundle request button still not visible.`);
        }
      }
    } else {
      console.log(`[polling be ready to request]: ${bundleName} bundle request button already visible.`);
    }

    // If the button is not visible, check if "Added ✓" is visible instead and if so, skip the request.
    if (!(await requestBtnLocator.first().isVisible({ timeout: 1000 }))) {
      const addedLocator = page.getByRole("button", { name: `Added ✓ ${bundleName}` });
      if (await addedLocator.isVisible({ timeout: 1000 })) {
        console.log(`${bundleName} bundle already present, skipping request.`);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-request-bundle-skipping.png` });
        return;
      } else {
        console.log(`${bundleName} bundle request button still not visible, assuming it's a different error.`);
      }
    }

    // Request the bundle (has-text does substring match, works with token labels)
    await loggedClick(page, `button:has-text('Request ${bundleName}')`, `Request ${bundleName}`, { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-request-bundle-clicked.png` });

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-06-ensure-bundle.png` });
    let addedLocator = page.getByRole("button", { name: `Added ✓ ${bundleName}` });
    if (!(await addedLocator.isVisible({ timeout: 1000 }))) {
      const tries = 20;
      for (let i = 0; i < tries; i++) {
        console.log(
          `[polling to ensure request completed]: "Added ✓ ${bundleName}" button not visible, waiting 1000ms and trying again (${i + 1}/${tries})`,
        );
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-07-ensure-bundle-waiting.png` });
        await page.waitForTimeout(1000);
        addedLocator = page.getByRole("button", { name: `Added ✓ ${bundleName}` });
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-08-ensure-bundle-waited.png` });
        if (await addedLocator.isVisible({ timeout: 1000 })) {
          console.log(`[polling to ensure request completed]: ${bundleName} bundle present.`);
          break;
        } else {
          console.log(`[polling to ensure request completed]: ${bundleName} bundle still not present.`);
        }
      }
    } else {
      console.log(`[polling to ensure request completed]: ${bundleName} bundle already present.`);
    }

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-09-request-bundle.png` });
    await expect(page.getByRole("button", { name: `Added ✓ ${bundleName}` })).toBeVisible({ timeout: 32000 });
  });
}

/**
 * Poll the bundle API until the bundle has stripeSubscriptionId set,
 * proving the checkout.session.completed webhook fired and wrote to DynamoDB.
 */
export async function waitForBundleWebhookActivation(
  page,
  bundleId,
  screenshotPath = defaultScreenshotPath,
  { timeoutMs = 30_000, pollIntervalMs = 2_000 } = {},
) {
  return await test.step(`Wait for webhook to activate ${bundleId} bundle`, async () => {
    console.log(`[webhook-activation]: Polling for stripeSubscriptionId on ${bundleId}...`);
    const startTime = Date.now();
    let pollCount = 0;

    while (Date.now() - startTime < timeoutMs) {
      pollCount++;
      const result = await page.evaluate(async (bid) => {
        const idToken = localStorage.getItem("cognitoIdToken");
        if (!idToken) return { error: "no auth token" };
        const response = await fetch("/api/v1/bundle", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await response.json();
        const bundle = (data.bundles || []).find((b) => b.bundleId === bid && b.allocated);
        if (!bundle) return { found: false };
        return {
          found: true,
          stripeSubscriptionId: bundle.stripeSubscriptionId || null,
          subscriptionStatus: bundle.subscriptionStatus || null,
          cancelAtPeriodEnd: bundle.cancelAtPeriodEnd ?? null,
          tokensRemaining: bundle.tokensRemaining ?? null,
        };
      }, bundleId);

      if (result.found && result.stripeSubscriptionId) {
        console.log(
          `[webhook-activation]: Bundle ${bundleId} activated by webhook after ${Date.now() - startTime}ms (${pollCount} polls). stripeSubscriptionId=${result.stripeSubscriptionId}, status=${result.subscriptionStatus}`,
        );
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-webhook-activation-confirmed.png` });
        return result;
      }

      console.log(
        `[webhook-activation]: Poll ${pollCount} - bundle ${bundleId}: found=${result.found}, stripeSubscriptionId=${result.stripeSubscriptionId}, elapsed=${Date.now() - startTime}ms`,
      );
      await page.waitForTimeout(pollIntervalMs);
    }

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-webhook-activation-TIMEOUT.png`, fullPage: true });
    throw new Error(
      `Webhook activation timeout: bundle '${bundleId}' was not granted by webhook within ${timeoutMs}ms. ` +
        `The checkout.session.completed webhook did not fire or failed. Check webhook secret configuration.`,
    );
  });
}

/**
 * Navigate to the Stripe billing portal by clicking the "Manage Subscription" button.
 * Returns { isSimulator: true } if the mock portal redirects straight back to bundles.html.
 */
export async function navigateToStripePortal(page, bundleId, screenshotPath = defaultScreenshotPath) {
  return await test.step(`Navigate to Stripe billing portal for ${bundleId}`, async () => {
    const manageBtn = page.locator('button[data-manage-subscription="true"]').first();
    await expect(manageBtn).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-portal-01-manage-btn-visible.png` });

    // The "Manage Subscription" button does: fetch(/api/v1/billing/portal) → window.location.href = portalUrl
    // The navigation is deferred (after async API call), so we must wait for the URL to LEAVE bundles.html.
    const beforeUrl = page.url();
    console.log(`Current URL before portal click: ${beforeUrl}`);

    // Click and wait for the URL to change away from the current page
    try {
      await Promise.all([page.waitForURL((url) => url.href !== beforeUrl, { timeout: 15_000 }), manageBtn.click({ force: true })]);
    } catch {
      // Navigation didn't happen within 15s — still on bundles.html. This is simulator behavior.
      console.log("Simulator detected: portal button did not navigate away from bundles.html");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-portal-02-simulator-detected.png` });
      return { isSimulator: true };
    }

    const currentUrl = page.url();
    console.log(`Navigated to: ${currentUrl}`);

    if (currentUrl.includes("billing.stripe.com")) {
      // Real Stripe portal
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(3000); // Wait for Stripe SPA to render
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-portal-02-stripe-loaded.png`, fullPage: true });
      return { isSimulator: false, portalUrl: currentUrl };
    }

    // Unexpected URL — might be a different portal implementation
    console.log(`Unexpected portal URL: ${currentUrl}`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-portal-02-unexpected-url.png` });
    return { isSimulator: false, portalUrl: currentUrl };
  });
}

/**
 * Within the Stripe billing portal, cancel the subscription and navigate back to bundles.html.
 * The return_url set by billingPortalGet.js is `${baseUrl}bundles.html`.
 */
export async function cancelSubscriptionViaPortal(page, returnUrl, screenshotPath = defaultScreenshotPath) {
  return await test.step("Cancel subscription via Stripe billing portal", async () => {
    console.log("Looking for 'Cancel plan' in Stripe portal...");

    // Stripe portal shows subscription with a "Cancel plan" link/button
    const cancelPlanLocator = page.locator(
      [
        'button:has-text("Cancel plan")',
        'a:has-text("Cancel plan")',
        'button:has-text("Cancel subscription")',
        'a:has-text("Cancel subscription")',
      ].join(", "),
    );

    await cancelPlanLocator.first().waitFor({ state: "visible", timeout: 15_000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-portal-03-cancel-btn-visible.png` });
    await cancelPlanLocator.first().click({ force: true });
    console.log("Clicked 'Cancel plan' in Stripe portal");

    await page.waitForTimeout(2000); // Wait for Stripe SPA transition
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-portal-04-cancel-confirmation.png`, fullPage: true });

    // Stripe shows a confirmation page with a second "Cancel plan" button.
    // Use a submit button or a distinct confirm button — avoid re-matching the same link.
    const confirmCancelLocator = page.locator(
      ['button[type="submit"]:has-text("Cancel")', 'button:has-text("Cancel plan")', 'button:has-text("Cancel subscription")'].join(", "),
    );

    if (
      await confirmCancelLocator
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)
    ) {
      await confirmCancelLocator.first().click({ force: true });
      console.log("Confirmed cancellation in Stripe portal");
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-portal-05-post-confirm.png`, fullPage: true });
    }

    // Verify cancellation succeeded: look for "Cancels" badge or "Don't cancel" button
    const cancellationConfirmed =
      (await page
        .locator("text=Cancels")
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)) ||
      (await page
        .locator('button:has-text("Don\'t cancel")')
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false));
    console.log(`Cancellation confirmed in portal UI: ${cancellationConfirmed}`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-portal-05b-cancellation-confirmed.png`, fullPage: true });

    // Navigate back to bundles.html. The Stripe portal "Return to" link is an SPA route
    // that often doesn't trigger a real page navigation when clicked. Use direct navigation.
    if (!page.url().includes("bundles.html")) {
      console.log(`Still on Stripe portal (${page.url()}), navigating back to bundles.html...`);
      await page.goto(returnUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForLoadState("networkidle");
    }

    console.log("Back on bundles.html after Stripe portal cancellation");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-portal-06-returned.png` });
    return { canceled: cancellationConfirmed };
  });
}

/**
 * Poll for cancellation webhook effect on the bundle.
 * Does NOT throw on timeout — returns { timedOut: true } since webhook delivery is unpredictable.
 */
export async function waitForCancellationWebhook(
  page,
  bundleId,
  screenshotPath = defaultScreenshotPath,
  { timeoutMs = 30_000, pollIntervalMs = 2_000 } = {},
) {
  return await test.step(`Wait for cancellation webhook on ${bundleId}`, async () => {
    console.log(`[cancellation-webhook]: Polling for cancellation effect on ${bundleId}...`);
    const startTime = Date.now();
    let pollCount = 0;
    let lastState = null;

    while (Date.now() - startTime < timeoutMs) {
      pollCount++;
      const result = await page.evaluate(async (bid) => {
        const idToken = localStorage.getItem("cognitoIdToken");
        if (!idToken) return { error: "no auth token" };
        const response = await fetch("/api/v1/bundle", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await response.json();
        const bundle = (data.bundles || []).find((b) => b.bundleId === bid && b.allocated);
        if (!bundle) return { found: false };
        return {
          found: true,
          cancelAtPeriodEnd: bundle.cancelAtPeriodEnd ?? null,
          subscriptionStatus: bundle.subscriptionStatus || null,
        };
      }, bundleId);

      lastState = result;

      if (result.found && (result.cancelAtPeriodEnd === true || result.subscriptionStatus === "canceled")) {
        console.log(
          `[cancellation-webhook]: Cancellation confirmed after ${Date.now() - startTime}ms: cancelAtPeriodEnd=${result.cancelAtPeriodEnd}, status=${result.subscriptionStatus}`,
        );
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-cancellation-webhook-confirmed.png` });
        return { cancelAtPeriodEnd: result.cancelAtPeriodEnd, subscriptionStatus: result.subscriptionStatus };
      }

      console.log(
        `[cancellation-webhook]: Poll ${pollCount} - cancelAtPeriodEnd=${result.cancelAtPeriodEnd}, status=${result.subscriptionStatus}, elapsed=${Date.now() - startTime}ms`,
      );
      await page.waitForTimeout(pollIntervalMs);
    }

    console.warn(`[cancellation-webhook]: Timed out after ${timeoutMs}ms. Last state: ${JSON.stringify(lastState)}`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-cancellation-webhook-TIMEOUT.png`, fullPage: true });
    return { timedOut: true, lastState };
  });
}

/**
 * Verify webhook lifecycle by cancelling a subscription immediately via the Stripe API.
 *
 * This exercises the `customer.subscription.deleted` webhook handler, which is NOT triggered
 * by the portal cancellation (that only triggers `customer.subscription.updated` with
 * cancel_at_period_end=true). Immediate cancellation forces Stripe to fire the deletion
 * event synchronously, allowing us to verify the full lifecycle in the pipeline.
 *
 * Only runs when real Stripe is available (proxy/CI/prod). Skipped on simulator.
 *
 * @param {import('@playwright/test').Page} page - Playwright page for polling bundle API
 * @param {string} bundleId - The bundle ID to verify
 * @param {string} screenshotPath - Screenshot output directory
 * @param {object} options
 * @param {number} options.timeoutMs - Max time to wait for webhook (default 45s)
 * @returns {{ deleted: boolean, subscriptionStatus: string|null, timedOut: boolean }}
 */
export async function verifySubscriptionDeletionWebhook(
  page,
  bundleId,
  screenshotPath = defaultScreenshotPath,
  { timeoutMs = 45_000, pollIntervalMs = 2_000 } = {},
) {
  return await test.step(`Verify subscription.deleted webhook for ${bundleId}`, async () => {
    // First, get the current subscription ID from the bundle API
    const bundleState = await page.evaluate(async (bid) => {
      const idToken = localStorage.getItem("cognitoIdToken");
      if (!idToken) return { error: "no auth token" };
      const response = await fetch("/api/v1/bundle", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await response.json();
      const bundle = (data.bundles || []).find((b) => b.bundleId === bid && b.allocated);
      if (!bundle) return { found: false };
      return {
        found: true,
        stripeSubscriptionId: bundle.stripeSubscriptionId || null,
        subscriptionStatus: bundle.subscriptionStatus || null,
        cancelAtPeriodEnd: bundle.cancelAtPeriodEnd ?? null,
      };
    }, bundleId);

    if (!bundleState.found || !bundleState.stripeSubscriptionId) {
      console.log(`[deletion-webhook]: No active subscription found for ${bundleId}, skipping`);
      return { deleted: false, subscriptionStatus: null, timedOut: false, skipped: true };
    }

    const subscriptionId = bundleState.stripeSubscriptionId;
    console.log(`[deletion-webhook]: Cancelling subscription ${subscriptionId} immediately via Stripe API...`);

    // Cancel immediately via Stripe API — this triggers customer.subscription.deleted
    try {
      const stripe = await getStripeClient({ test: true });
      const canceled = await stripe.subscriptions.cancel(subscriptionId);
      console.log(`[deletion-webhook]: Stripe API returned status: ${canceled.status}`);
    } catch (stripeErr) {
      // Subscription may already be canceled (e.g., if period already ended)
      console.warn(`[deletion-webhook]: Stripe cancel returned error: ${stripeErr.message}`);
      if (stripeErr.code === "resource_missing") {
        console.log("[deletion-webhook]: Subscription already deleted in Stripe");
        return { deleted: true, subscriptionStatus: "canceled", timedOut: false };
      }
      throw stripeErr;
    }

    // Poll the bundle API until the webhook updates the status to "canceled"
    console.log(`[deletion-webhook]: Polling for subscriptionStatus=canceled on ${bundleId}...`);
    const startTime = Date.now();
    let pollCount = 0;

    while (Date.now() - startTime < timeoutMs) {
      pollCount++;
      const result = await page.evaluate(async (bid) => {
        const idToken = localStorage.getItem("cognitoIdToken");
        if (!idToken) return { error: "no auth token" };
        const response = await fetch("/api/v1/bundle", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await response.json();
        const bundle = (data.bundles || []).find((b) => b.bundleId === bid && b.allocated);
        if (!bundle) return { found: false };
        return {
          found: true,
          subscriptionStatus: bundle.subscriptionStatus || null,
          cancelAtPeriodEnd: bundle.cancelAtPeriodEnd ?? null,
        };
      }, bundleId);

      if (result.found && result.subscriptionStatus === "canceled") {
        console.log(
          `[deletion-webhook]: Subscription deletion confirmed after ${Date.now() - startTime}ms (${pollCount} polls). status=${result.subscriptionStatus}`,
        );
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-deletion-webhook-confirmed.png` });
        return { deleted: true, subscriptionStatus: result.subscriptionStatus, timedOut: false };
      }

      console.log(`[deletion-webhook]: Poll ${pollCount} - status=${result.subscriptionStatus}, elapsed=${Date.now() - startTime}ms`);
      await page.waitForTimeout(pollIntervalMs);
    }

    console.warn(`[deletion-webhook]: Timed out after ${timeoutMs}ms waiting for canceled status`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-deletion-webhook-TIMEOUT.png`, fullPage: true });
    return { deleted: false, subscriptionStatus: bundleState.subscriptionStatus, timedOut: true };
  });
}
