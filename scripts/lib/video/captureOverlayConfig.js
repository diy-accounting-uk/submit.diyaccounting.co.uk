// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/video/captureOverlayConfig.js
//
// What every document of a capture hides and rewrites, so a frame shows what a customer on
// production sees and no test equipment: the scene file's own `suppress` list, each navigation tab
// that production does not list, the test equipment a customer never sees, and the capture's
// sign-in address as the address of the register's director who files for the companies shown.

import { isActivityListedInEnvironment } from "../../../web/public/lib/services/catalog-service.js";
import { PEOPLE } from "../../../app/http-simulator/fixtures/register.js";

export const SHOWN_SIGN_IN_ADDRESS = PEOPLE.eleanorBramwell.email;

// Shown only to a user with a synthetic test bundle, as every capture user has. A scene may still
// click it off camera to turn developer mode on, so it is made invisible rather than removed.
export const TEST_EQUIPMENT_SELECTORS = [".developer-mode-toggle"];

/** One selector for each navigation tab whose activity the production catalogue does not list. */
export function unlistedNavTabSelectors(activities) {
  return (activities || [])
    .filter((activity) => !isActivityListedInEnvironment(activity, "prod"))
    .map((activity) => `.main-nav a[data-activity="${activity.id}"]`);
}

/**
 * @param {{suppress?: string[], chapterPosition?: string}} script - The scene script
 * @param {{activities?: object[]}} catalog - The parsed catalogue
 * @param {string|null} authUsername - The address the capture signs in with, or null for a script with no sign-in
 */
export function captureOverlayConfig(script, catalog, authUsername) {
  const config = {
    suppress: [...(script.suppress || []), ...unlistedNavTabSelectors(catalog?.activities)],
    conceal: TEST_EQUIPMENT_SELECTORS,
  };
  if (authUsername) config.replaceText = { from: authUsername, to: SHOWN_SIGN_IN_ADDRESS };
  if (script.chapterPosition) config.chapterPosition = script.chapterPosition;
  return config;
}
