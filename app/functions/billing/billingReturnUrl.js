// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/billing/billingReturnUrl.js
//
// A DIYA-GL subscriber has to come back to the spreadsheets page they left, not to Submit's own
// bundles.html. Both the checkout and portal handlers accept an optional returnTo and check its
// origin against BILLING_RETURN_URL_ORIGINS, the comma-separated allow-list BooksStack builds for
// BOOKS_ALLOWED_ORIGINS plus this deployment's own origin. An origin that isn't on the list is
// ignored: the caller falls back to its own default URL, so a bad returnTo never 400s and never
// redirects off-site.

/**
 * Resolves a caller-supplied returnTo against BILLING_RETURN_URL_ORIGINS, reconstructing the URL
 * from the allowed origin (never the request origin) plus the pathname and search from the request.
 * Returns null when returnTo is absent, malformed, or its origin is not allowed.
 *
 * @param {string | undefined | null} returnTo
 * @returns {string | null}
 */
export function resolveAllowedReturnTo(returnTo) {
  if (!returnTo || typeof returnTo !== "string") return null;

  let parsed;
  try {
    parsed = new URL(returnTo);
  } catch {
    return null;
  }

  const requestOrigin = parsed.origin;
  const allowedOrigins = (process.env.BILLING_RETURN_URL_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  // Find the allowed origin that matches the request's origin
  const allowedOrigin = allowedOrigins.find((o) => o === requestOrigin);
  if (!allowedOrigin) return null;

  // Reconstruct from the allowed origin (not the request origin) plus request path/search/hash
  return new URL(parsed.pathname + parsed.search + parsed.hash, allowedOrigin).toString();
}
