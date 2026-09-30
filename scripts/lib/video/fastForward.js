// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/video/fastForward.js
//
// Whether a step runs at zero pacing. A scene marked fastForward sends every step of it through
// fast; a single step marked fastForward does the same for that step alone, so a repeated stretch
// inside a scene that otherwise plays at full pace (the HMRC authorisation in the middle of an
// Income Tax walkthrough) does not need a scene of its own. A --scene run also fast-forwards every
// scene it did not select.

export function isFastForward(scene, step, selectedSceneIds) {
  if (scene.fastForward === true) return true;
  if (step.fastForward === true) return true;
  return selectedSceneIds ? !selectedSceneIds.has(scene.id) : false;
}
