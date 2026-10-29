// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/settings.page.js
// The settings page: two switches kept in this browser session (preview features, and for an
// operator the operator features) and one kept on the account (pass generation).

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
  previewSwitch.addEventListener("change", () => setPreviewOn(previewSwitch.checked));

  operatorSwitch.checked = isOperatorFeaturesOn();
  operatorSwitch.addEventListener("change", () => setOperatorFeaturesOn(operatorSwitch.checked));

  passSwitch.checked = ACCOUNT_SETTING_DEFAULTS.passGeneration;
  passSwitch.disabled = true;
  const response = await fetchBundleResponse();
  if (response) {
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
