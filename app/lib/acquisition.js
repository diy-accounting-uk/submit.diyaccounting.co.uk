// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/acquisition.js

// Same field names session-beacon.js carries to the activity event, shared by the bundle grant,
// the checkout request and the Stripe webhook so every record of an account's source agrees.
export const ACQUISITION_KEYS = ["utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm", "gclid", "ref", "landedAt"];

const MAX_ACQUISITION_VALUE_LENGTH = 200;
const STRIPE_METADATA_PREFIX = "acq_";

// Picks only the known attribution fields out of whatever a client sent, trimmed and capped, so an
// unrelated or malformed body never reaches a stored record. Returns undefined when none are
// present, so the caller leaves the attribute unset rather than writing an empty map.
export function buildAcquisitionMap(source) {
  if (!source || typeof source !== "object") return undefined;
  const acquisition = {};
  for (const key of ACQUISITION_KEYS) {
    const value = source[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim().slice(0, MAX_ACQUISITION_VALUE_LENGTH);
    if (trimmed) acquisition[key] = trimmed;
  }
  return Object.keys(acquisition).length > 0 ? acquisition : undefined;
}

// A record is tagged when it names a source beyond the bare landing time.
export function isTaggedAcquisition(acquisition) {
  return Boolean(acquisition) && Object.keys(acquisition).some((key) => key !== "landedAt");
}

export function acquisitionToStripeMetadata(acquisition) {
  const metadata = {};
  for (const [key, value] of Object.entries(acquisition || {})) {
    metadata[`${STRIPE_METADATA_PREFIX}${key}`] = value;
  }
  return metadata;
}

export function acquisitionFromStripeMetadata(metadata) {
  const source = {};
  for (const key of ACQUISITION_KEYS) {
    source[key] = metadata?.[`${STRIPE_METADATA_PREFIX}${key}`];
  }
  return buildAcquisitionMap(source);
}
