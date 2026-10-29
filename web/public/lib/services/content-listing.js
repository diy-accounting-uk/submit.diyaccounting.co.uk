// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Decides which content a page shows. An item that names a catalogue activity (a video's
// `catalogueActivity`, an FAQ's `activity`, an element's data-listed-activity) shows only where
// the catalogue lists that activity in the current environment, or preview features are on. An
// item that names none always shows.

import { fetchCurrentEnvironmentName, isActivityShown } from "./catalog-service.js";
import { fetchViewer } from "./viewer-settings.js";

/**
 * Build the listing check for the current environment from the deployed catalogue. When the
 * catalogue cannot be read, no item that names an activity is listed.
 * @returns {Promise<(activityId: string|undefined|null) => boolean>} True when an item that names the activity may show
 */
export async function fetchActivityListing() {
  try {
    const [response, environmentName, viewer] = await Promise.all([
      fetch("/submit.catalogue.toml"),
      fetchCurrentEnvironmentName(),
      fetchViewer(),
    ]);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const catalog = window.TOML.parse(await response.text());
    return (activityId) => {
      if (!activityId) return true;
      const activity = (catalog.activities ?? []).find((candidate) => candidate.id === activityId);
      return activity !== undefined && isActivityShown(activity, environmentName, viewer);
    };
  } catch (err) {
    console.warn("content-listing: could not read the catalogue", err);
    return (activityId) => !activityId;
  }
}
