// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Decides which content a page shows. An item that names a catalogue activity (a video's
// `catalogueActivity`, an FAQ's `activity`, an element's data-listed-activity) shows only where
// the catalogue lists that activity in the current environment. An item that names none always
// shows.

import { fetchCurrentEnvironmentName, isActivityListedInEnvironment } from "./catalog-service.js";

/**
 * Build the listing check for the current environment from the deployed catalogue. When the
 * catalogue cannot be read, no item that names an activity is listed.
 * @returns {Promise<(activityId: string|undefined|null) => boolean>} True when an item that names the activity may show
 */
export async function fetchActivityListing() {
  try {
    const [response, environmentName] = await Promise.all([fetch("/submit.catalogue.toml"), fetchCurrentEnvironmentName()]);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const catalog = window.TOML.parse(await response.text());
    return (activityId) => {
      if (!activityId) return true;
      const activity = (catalog.activities ?? []).find((candidate) => candidate.id === activityId);
      return activity !== undefined && isActivityListedInEnvironment(activity, environmentName);
    };
  } catch (err) {
    console.warn("content-listing: could not read the catalogue", err);
    return (activityId) => !activityId;
  }
}
