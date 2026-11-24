// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/settings.page.js
// The settings page: preview features, kept on the account when the person is signed in and in this
// browser session always; operator features, for an operator, kept in this browser session; and
// pass generation, kept on the account.

import {
  isPreviewOn,
  setPreviewOn,
  isOperatorFeaturesOn,
  setOperatorFeaturesOn,
  fetchBundleResponse,
  updateAccountSetting,
  ACCOUNT_SETTING_DEFAULTS,
} from "./lib/services/viewer-settings.js";

function byId(id) {
  return document.getElementById(id);
}

function showSaveFailure(error) {
  console.error("settings: could not save", error);
  if (window.showStatus) window.showStatus("The setting was not saved. Try again.", "error");
}

async function init() {
  const previewSwitch = byId("previewFeaturesSwitch");
  const operatorSwitch = byId("operatorFeaturesSwitch");
  const passSwitch = byId("passGenerationSwitch");

  previewSwitch.checked = isPreviewOn();

  let response = null;
  // Signed in, the choice is kept on the account and in the session; signed out, in the session only.
  previewSwitch.addEventListener("change", async () => {
    const wanted = previewSwitch.checked;
    setPreviewOn(wanted);
    if (!response) return;
    previewSwitch.disabled = true;
    try {
      const stored = (await updateAccountSetting("previewFeatures", wanted)).previewFeatures;
      previewSwitch.checked = stored;
      setPreviewOn(stored);
    } catch (error) {
      previewSwitch.checked = !wanted;
      setPreviewOn(!wanted);
      showSaveFailure(error);
    } finally {
      previewSwitch.disabled = false;
    }
  });

  operatorSwitch.checked = isOperatorFeaturesOn();
  operatorSwitch.addEventListener("change", () => setOperatorFeaturesOn(operatorSwitch.checked));

  passSwitch.checked = ACCOUNT_SETTING_DEFAULTS.passGeneration;
  passSwitch.disabled = true;
  response = await fetchBundleResponse();
  // fetchBundleResponse answers null for a visitor who is not signed in too, who sees the sign-in panel.
  let signedIn;
  try {
    signedIn = Boolean(localStorage.getItem("cognitoIdToken"));
  } catch {
    signedIn = false;
  }
  if (!response && signedIn && window.showStatus) {
    window.showStatus(
      window.siteText(
        "settings.read-failed",
        "Your account settings could not be read, so they cannot be changed now. Reload the page to try again.",
      ),
      "error",
    );
  }
  if (response) {
    const storedPreview = response.settings?.previewFeatures ?? ACCOUNT_SETTING_DEFAULTS.previewFeatures;
    previewSwitch.checked = storedPreview;
    setPreviewOn(storedPreview);
    passSwitch.checked = response.settings?.passGeneration ?? ACCOUNT_SETTING_DEFAULTS.passGeneration;
    passSwitch.disabled = false;
    byId("operatorFeaturesRow").hidden = !(response.bundles ?? []).some((bundle) => bundle.bundleId === "operator" && bundle.allocated);
  }
  passSwitch.addEventListener("change", async () => {
    const wanted = passSwitch.checked;
    passSwitch.disabled = true;
    try {
      passSwitch.checked = (await updateAccountSetting("passGeneration", wanted)).passGeneration;
    } catch (error) {
      passSwitch.checked = !wanted;
      showSaveFailure(error);
    } finally {
      passSwitch.disabled = false;
    }
  });
}

init();
