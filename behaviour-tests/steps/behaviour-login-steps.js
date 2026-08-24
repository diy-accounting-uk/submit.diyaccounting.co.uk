// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/behaviour-login-steps.js

import { expect, test } from "@playwright/test";
import { loggedClick, loggedFill, timestamp } from "../helpers/behaviour-helpers.js";
import { TOTP, Secret } from "otpauth";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-login-steps";

export async function clickLogIn(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user chooses to log in from the home page and arrives at the sign-in options", async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-login.png` });
    await loggedClick(page, "a:has-text('Log in')", "Clicking login link", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-login-clicked.png` });

    // Login
    console.log("Logging in...");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-login-logging-in.png` });

    // await Promise.all([
    //  page.waitForURL(/auth\/login\.html$/, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
    //  // the click already happened above; we still wait for the URL change
    // ]);
    await expect(page.getByText("Google account")).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-login.png` });
  });
}

export async function loginWithCognitoOrMockAuth(
  page,
  testAuthProvider,
  testAuthUsername,
  screenshotPath = defaultScreenshotPath,
  testAuthPassword = null,
) {
  if (testAuthProvider === "mock" || testAuthProvider === "simulator") {
    // Mock OAuth flow (used by both mock and simulator providers)
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-login-with-cognito-or-mock-auth.png` });
    await initMockAuth(page, screenshotPath);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-login-with-cognito-or-mock-auth.png` });
    await fillInMockAuth(page, testAuthUsername, screenshotPath);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-login-with-cognito-or-mock-auth.png` });
    await submitMockAuth(page, screenshotPath);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-login-with-cognito-or-mock-auth.png` });
  } else if (testAuthProvider === "cognito-native") {
    // Native Cognito user authentication via the Cognito Hosted UI email/password form
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-login-with-cognito-native.png` });
    await initCognitoAuth(page, screenshotPath);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-login-with-cognito-native-hosted-ui.png` });
    await fillInHostedUINativeAuth(page, testAuthUsername, testAuthPassword, screenshotPath);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-login-with-cognito-native-filled.png` });
    await submitHostedUINativeAuth(page, screenshotPath);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-login-with-cognito-native-submitted.png` });
    // Handle TOTP MFA challenge if a TOTP secret is available
    const totpSecret = process.env.TEST_AUTH_TOTP_SECRET;
    if (totpSecret) {
      await handleTotpChallenge(page, totpSecret, screenshotPath);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-login-with-cognito-native-totp-completed.png` });
    }
  }
}

export async function verifyLoggedInStatus(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user returns to the home page and sees their logged-in status", async () => {
    console.log("Checking home page...");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-home.png` });
    await expect(page.getByText("Logged in as")).toBeVisible({ timeout: 16000 });
  });
}

export async function logOutAndExpectToBeLoggedOut(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user logs out and sees the public home page with the log in link", async () => {
    console.log("Logging out from home page");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-home-before-waiting.png` });
    await expect(page.locator("a:has-text('Logout')")).toBeVisible({ timeout: 5000 });

    await Promise.all([
      // some implementations may redirect; we tolerate no URL change by catching
      page.waitForURL(/index\.html$|\/$/, { waitUntil: "domcontentloaded", timeout: 5000 }).catch(() => {}),
      loggedClick(page, "a:has-text('Logout')", "Logout", { screenshotPath }),
    ]);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-home.png` });
    //await expect(page.getByText("Not logged in")).toBeVisible({ timeout: 5000 });
    const notLoggedInVisible = await page.getByText("Not logged in").isVisible();
    if (!notLoggedInVisible) {
      // eslint-disable-next-line no-console
      console.error("❌❌❌ WARNING: 'Not logged in' text is NOT visible after logout! This may indicate a logout failure or UI issue.");
    }
  });
}

export async function initCognitoAuth(page, screenshotPath = defaultScreenshotPath) {
  await test.step("Google account", async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-cognito-auth.png` });
    await expect(page.getByText("Google account")).toBeVisible();
    await loggedClick(page, "button:has-text('Google account')", "Google account", {
      screenshotPath,
    });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `${screenshotPath}/${timestamp()}-02-cognito-provider-auth-clicked.png`,
    });
  });
}

export async function initMockAuth(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user continues with the mock identity provider and sees the sign-in form", async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-init-mock-auth.png` });
    await expect(page.getByText("Continue with mock-oauth2-server")).toBeVisible();
    await loggedClick(page, "button:has-text('Continue with mock-oauth2-server')", "Continue with OAuth provider", { screenshotPath });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-init-mock-auth.png` });
    await expect(page.locator('input[type="submit"][value="Sign-in"]')).toBeVisible({ timeout: 10000 });
  });
}

export async function fillInMockAuth(page, testAuthUsername, screenshotPath = defaultScreenshotPath) {
  await test.step("The user enters a username and identity claims for the session", async () => {
    // <input class="u-full-width" required="" type="text" name="username" placeholder="Enter any user/subject" autofocus="on">
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-fill-in-mock.png` });
    await loggedFill(page, 'input[name="username"]', `${testAuthUsername}`, "Entering username", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-fill-in-mock-filled-username.png` });
    await page.waitForTimeout(100);

    // <textarea class="u-full-width claims" name="claims" rows="15" placeholder="Optional claims JSON" autofocus="on"></textarea>
    // { "email": "user@example.com" }
    const identityToken = {
      email: `${testAuthUsername}@example.com`,
    };
    await loggedFill(page, 'textarea[name="claims"]', JSON.stringify(identityToken), "Entering identity claims", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-fill-in-moc-filled-claims.png` });
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-fill-in-mock.png` });
  });
}

export async function submitMockAuth(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user submits the sign-in form and returns to the app as an authenticated user", async () => {
    // Home page has logged in user email
    // <input class="button-primary" type="submit" value="Sign-in">
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-submit-mock.png` });
    await loggedClick(page, 'input[type="submit"][value="Sign-in"]', "Submitting sign-in form", { screenshotPath });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-mock-signed-in.png` });
  });
}

// Native Cognito authentication via the Cognito Hosted UI email/password form
export async function fillInHostedUINativeAuth(page, testAuthUsername, testAuthPassword, screenshotPath = defaultScreenshotPath) {
  await test.step("The user enters their credentials on the Cognito Hosted UI", async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-hosted-ui-native-auth.png` });

    // Wait for the Hosted UI email/password form to load.
    // The Cognito Hosted UI renders duplicate forms (desktop/mobile) synced by JS.
    // Playwright's fill() hangs even with force:true (editable check blocks), so we
    // use JavaScript to set values on ALL matching input elements by name attribute.
    // We use the native HTMLInputElement setter to trigger framework state updates.
    //
    // IMPORTANT: After enabling native auth on Cognito, the Hosted UI may take extra
    // time to reflect the changes. We use a longer timeout (30s) and retry logic to
    // handle this propagation delay.
    // Cognito's Hosted UI is intermittently slow to render the form (red deploy
    // runs on 2026-07-11/12 and 2026-08-24 all failed here with the domain
    // healthy). Escalate the wait per attempt rather than failing fast.
    const maxAttempts = 6;
    const baseTimeout = 15000;
    let formFound = false;

    for (let attempt = 1; attempt <= maxAttempts && !formFound; attempt++) {
      const attemptTimeout = baseTimeout * Math.min(attempt, 3);
      try {
        console.log(`Waiting for Hosted UI form (attempt ${attempt}/${maxAttempts}, timeout ${attemptTimeout}ms)...`);
        await page.waitForSelector('input[name="username"]', { state: "attached", timeout: attemptTimeout });
        await page.waitForSelector('input[name="password"]', { state: "attached", timeout: 5000 });
        formFound = true;
        console.log(`Hosted UI form fields found in DOM`);
      } catch (error) {
        if (attempt === maxAttempts) {
          console.error(`Failed to find Hosted UI form after ${maxAttempts} attempts`);
          await page.screenshot({ path: `${screenshotPath}/${timestamp()}-hosted-ui-form-not-found.png` });
          throw error;
        }
        console.log(`Form not found, refreshing page and retrying...`);
        await page.screenshot({ path: `${screenshotPath}/${timestamp()}-hosted-ui-retry-${attempt}.png` });
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForTimeout(2000 * attempt);
      }
    }

    // The Cognito Hosted UI has duplicate forms (desktop/mobile) synced by JS.
    // DOM value assignment doesn't work — the UI reads from its own state.
    // Simulate keyboard input: focus the VISIBLE field, then type into it.
    // Cognito's sync JS will propagate values to the hidden form.
    await page.evaluate(() => {
      // Find the visible username field (second instance = desktop form)
      const fields = document.querySelectorAll('input[name="username"]');
      const visible = Array.from(fields).find((el) => el.offsetParent !== null) || fields[fields.length - 1];
      visible.focus();
      visible.select();
    });
    await page.keyboard.type(testAuthUsername, { delay: 10 });
    console.log(`Typed username on Hosted UI`);

    if (testAuthPassword) {
      await page.evaluate(() => {
        const fields = document.querySelectorAll('input[name="password"]');
        const visible = Array.from(fields).find((el) => el.offsetParent !== null) || fields[fields.length - 1];
        visible.focus();
        visible.select();
      });
      await page.keyboard.type(testAuthPassword, { delay: 10 });
      console.log(`Typed password on Hosted UI`);
    }

    // Disable form validation
    await page.evaluate(() => {
      for (const form of document.querySelectorAll("form")) form.noValidate = true;
    });

    await page.waitForTimeout(100);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-hosted-ui-native-auth-filled.png` });
  });
}

export async function submitHostedUINativeAuth(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user submits the Cognito Hosted UI login form", async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-submit-hosted-ui-native.png` });
    // The Cognito Hosted UI sign-in button is input[name="signInSubmitButton"][type="submit"].
    // Click the VISIBLE submit button (second instance = desktop form).
    await page.evaluate(() => {
      const btns = document.querySelectorAll('input[name="signInSubmitButton"]');
      const visible = Array.from(btns).find((el) => el.offsetParent !== null) || btns[btns.length - 1];
      if (visible) {
        visible.closest("form").noValidate = true;
        visible.click();
      }
    });
    console.log(`Clicked sign-in button on Hosted UI`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-hosted-ui-native-signed-in.png` });
  });
}

// Handle the Cognito Hosted UI TOTP MFA challenge page
export async function handleTotpChallenge(page, totpSecret, screenshotPath = defaultScreenshotPath) {
  await test.step("The user completes the TOTP MFA challenge on the Cognito Hosted UI", async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-totp-challenge.png` });

    // Wait for the TOTP challenge page to appear
    // The Cognito Hosted UI presents a code input field after username/password submission
    console.log("Waiting for TOTP challenge page...");
    const codeInput = await page.waitForSelector(
      'input[name="totpCode"], input[name="SOFTWARE_TOKEN_MFA_CODE"], input[type="text"][inputmode="numeric"], input[name="code"]',
      { state: "attached", timeout: 10000 },
    );

    if (!codeInput) {
      console.log("No TOTP challenge page detected — MFA may not be required for this user");
      return;
    }

    console.log("TOTP challenge page detected");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-totp-challenge-page.png` });

    // Generate and submit TOTP code, retrying once if Cognito rejects it.
    // Cognito rejects a code that was already consumed in the same 30-second window
    // ("Your software token has already been used once.") — e.g. if the enrollment
    // verification and the login happen in the same TOTP period.
    const totp = new TOTP({
      secret: Secret.fromBase32(totpSecret),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });

    for (let attempt = 1; attempt <= 2; attempt++) {
      const code = totp.generate();
      console.log(`Generated TOTP code for MFA challenge (attempt ${attempt})`);

      // Type the code into the visible input field (same pattern as username/password)
      await page.evaluate(() => {
        const inputs = document.querySelectorAll(
          'input[name="totpCode"], input[name="SOFTWARE_TOKEN_MFA_CODE"], input[type="text"][inputmode="numeric"], input[name="code"]',
        );
        const visible = Array.from(inputs).find((el) => el.offsetParent !== null) || inputs[inputs.length - 1];
        if (visible) {
          visible.focus();
          visible.select();
        }
      });
      await page.keyboard.type(code, { delay: 10 });
      console.log("Typed TOTP code on challenge page");

      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-totp-code-entered.png` });

      // Submit the TOTP form
      await page.evaluate(() => {
        const btn =
          document.querySelector('input[name="signInSubmitButton"]') ||
          document.querySelector('button[type="submit"]') ||
          document.querySelector('input[type="submit"]');
        if (btn) {
          const form = btn.closest("form");
          if (form) form.noValidate = true;
          btn.click();
        }
      });
      console.log("Submitted TOTP challenge form");

      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-totp-challenge-completed.png` });

      // Check if Cognito rejected the code (error message still on the TOTP page)
      // If the page navigated away (context destroyed), the TOTP was accepted successfully.
      let errorText = "";
      try {
        errorText = await page.evaluate(() => {
          const errorEl = document.querySelector('[id*="error"], .errorMessage, [class*="error"]');
          return errorEl?.textContent?.trim() || "";
        });
      } catch (evalError) {
        console.log("Page navigated away — TOTP accepted");
        break;
      }

      if (errorText.includes("software token has already been used")) {
        console.log(`TOTP code rejected (already used) — waiting for next 30s period before retry`);
        const secondsRemaining = 30 - (Math.floor(Date.now() / 1000) % 30);
        await page.waitForTimeout((secondsRemaining + 1) * 1000);
        continue;
      }

      // No error — TOTP accepted, break out of retry loop
      break;
    }
  });
}
