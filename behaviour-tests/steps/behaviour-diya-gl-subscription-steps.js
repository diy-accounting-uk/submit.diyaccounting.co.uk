// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/steps/behaviour-diya-gl-subscription-steps.js
//
// Steps for the DIYA-GL subscription behaviour case: signing in against the DIYA-GL app client
// through the Cognito hosted UI directly (no DIYA-GL page exists yet to drive the sign-in from,
// unlike books.behaviour.test.js's main-client login), and calling the billing checkout, billing
// portal and books routes with the token that flow produces.
//
// The checkout, portal and books calls below run as plain Node fetches, not page.evaluate calls
// from inside the browser. books.behaviour.test.js drives its calls from the browser deliberately,
// to prove CORS on the books routes' own CloudFront behaviour; the billing routes carry no such
// behaviour, so a cross-origin browser fetch would fail Chrome's CORS preflight on a detail this
// test isn't checking. Only the interactive hosted-UI sign-in and the real Stripe Checkout page
// need a browser.

import { test } from "@playwright/test";
import { fillInHostedUINativeAuth, submitHostedUINativeAuth, handleTotpChallenge } from "./behaviour-login-steps.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-diya-gl-subscription-steps";

/**
 * Signs in through the Cognito hosted UI on the DIYA-GL app client, navigating straight to the
 * authorize endpoint (there is no DIYA-GL page yet with its own login button), completing the
 * native email/password form and any TOTP challenge, then exchanging the returned authorization
 * code for tokens against Cognito's token endpoint. Returns the id token.
 */
export async function signInWithDiyaGlHostedUi(
  page,
  { cognitoBaseUri, booksClientId, redirectUri, testAuthUsername, testAuthPassword },
  screenshotPath = defaultScreenshotPath,
) {
  return await test.step("Sign in through the Cognito hosted UI on the DIYA-GL app client", async () => {
    const authorizeUrl =
      `${cognitoBaseUri.replace(/\/$/, "")}/oauth2/authorize` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(booksClientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent("openid profile email")}` +
      `&state=diya-gl-subscription-behaviour`;

    await page.goto(authorizeUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await fillInHostedUINativeAuth(page, testAuthUsername, testAuthPassword, screenshotPath);
    await submitHostedUINativeAuth(page, screenshotPath);

    const totpSecret = process.env.TEST_AUTH_TOTP_SECRET;
    if (totpSecret) {
      await handleTotpChallenge(page, totpSecret, screenshotPath);
    }

    await page.waitForURL((url) => url.toString().startsWith(redirectUri), { timeout: 30_000 });
    const callbackUrl = new URL(page.url());
    const code = callbackUrl.searchParams.get("code");
    if (!code) {
      throw new Error(`No authorization code on the DIYA-GL hosted UI callback: ${page.url()}`);
    }

    const tokenResponse = await fetch(`${cognitoBaseUri.replace(/\/$/, "")}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: booksClientId,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tokens = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokens.id_token) {
      throw new Error(`DIYA-GL token exchange failed: ${tokenResponse.status} ${JSON.stringify(tokens)}`);
    }
    return { idToken: tokens.id_token };
  });
}

/** POST {apiBase}/billing/checkout with a DIYA-GL token. */
export async function postDiyaGlCheckout({ apiBase, idToken, bundleId, returnTo }) {
  const response = await fetch(`${apiBase}/billing/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ bundleId, returnTo }),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

/** GET {apiBase}/billing/portal with a DIYA-GL token. */
export async function getDiyaGlBillingPortal({ apiBase, idToken, returnTo }) {
  const response = await fetch(`${apiBase}/billing/portal?returnTo=${encodeURIComponent(returnTo)}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

/** PUT {apiBase}/books/{bookId} with a DIYA-GL token and the fixture zip. */
export async function putDiyaGlBook({ apiBase, idToken, bookId, zipBase64 }) {
  const response = await fetch(`${apiBase}/books/${bookId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      title: "DIYA-GL Subscription Behaviour Probe",
      product: "ltd",
      periodCoveredStart: "2025-04-01",
      periodCoveredEnd: "2026-03-31",
      provenance: { formatVersion: "1", engineVersion: "1.0.0", taxDataHash: null, templateHash: null, reconciledCommit: null },
      zipBase64,
    }),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body, etag: response.headers.get("ETag") };
}

/** GET {apiBase}/books/{bookId}/versions/latest with a DIYA-GL token. */
export async function getDiyaGlBookLatest({ apiBase, idToken, bookId }) {
  const response = await fetch(`${apiBase}/books/${bookId}/versions/latest`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}
