// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/billing/billingReturnUrl.js
//
// A DIYA-GL subscriber has to come back to the spreadsheets page they left, not to Submit's own
// bundles.html. Both the checkout and portal handlers accept an optional returnTo and check its
// origin against BILLING_RETURN_URL_ORIGINS, the comma-separated allow-list BooksStack builds for
// BOOKS_ALLOWED_ORIGINS plus this deployment's own origin. An origin that isn't on the list is
// ignored: the caller falls back to its own default URL, so a bad returnTo never 400s and never
// redirects off-site.

/**
 * Resolves a caller-supplied returnTo against BILLING_RETURN_URL_ORIGINS, returning it unchanged
 * when its origin is allowed, or null when it's absent, malformed or not allowed.
 *
 * @param {string | undefined | null} returnTo
 * @returns {string | null}
 */
export function resolveAllowedReturnTo(returnTo) {
  if (!returnTo || typeof returnTo !== "string") return null;

  let origin;
  try {
    origin = new URL(returnTo).origin;
  } catch {
    return null;
  }

  const allowedOrigins = (process.env.BILLING_RETURN_URL_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return allowedOrigins.includes(origin) ? returnTo : null;
}
