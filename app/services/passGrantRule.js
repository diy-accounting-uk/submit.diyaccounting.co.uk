// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/passGrantRule.js
// Which catalogue bundles a pass may grant, and the one bundle that a pass grants only to an
// operator. Pass creation, redemption and the grant itself all read these two rules.

const PASS_GRANTABLE_ENABLES = ["on-pass", "always"];

export const OPERATOR_BUNDLE_ID = "operator";

/**
 * Whether a pass may grant a catalogue bundle: its enable is on-pass or always, and its allocation
 * is not automatic.
 * @param {Object|undefined} bundle - the catalogue bundle
 * @returns {boolean}
 */
export function passMayGrantBundle(bundle) {
  return Boolean(bundle) && PASS_GRANTABLE_ENABLES.includes(bundle.enable) && bundle.allocation !== "automatic";
}

/**
 * Whether a pass grants a bundle only to an account whose email is an operator's: the operator
 * bundle. A pass that grants it must be restricted to an operator's email.
 * @param {string} bundleId
 * @returns {boolean}
 */
export function passGrantsOnlyToOperators(bundleId) {
  return bundleId === OPERATOR_BUNDLE_ID;
}
