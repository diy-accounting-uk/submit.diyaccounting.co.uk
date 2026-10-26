// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/video/stepStill.js
//
// The card-free still of a captioned step. The recorder writes one beside the recording at the
// moment a step's headline card comes down, with the card hidden by a style that applies to the
// screenshot only, so the page is exactly as the step left it. The walkthrough cutter reads these
// stills in preference to sampling the recording, which has no card-free moment when the next
// step's card follows at once.

import fs from "fs";
import path from "path";

export const HEADLINE_CARD_ATTRIBUTE = "data-svc-headline";
const HIDE_HEADLINE_CARD = `[${HEADLINE_CARD_ATTRIBUTE}] { visibility: hidden !important; }`;

/** The file name of a step's card-free still, inside the recording's stills directory. */
export function stepStillName(sceneId, stepIndex) {
  return `step-${sceneId}-${stepIndex}.png`;
}

/** Writes the page as it stands now, with the headline card hidden, as the step's still. */
export async function writeCardFreeStill(page, stillsDir, sceneId, stepIndex) {
  fs.mkdirSync(stillsDir, { recursive: true });
  await page.screenshot({ path: path.join(stillsDir, stepStillName(sceneId, stepIndex)), style: HIDE_HEADLINE_CARD });
}

/**
 * The still to cut a walkthrough frame from, or null when the recording has none for it.
 * A frame of one step uses that step's still. A frame of a whole scene uses the still of the
 * last step of the scene that has one, because the frame shows the page as the scene left it.
 *
 * @param {string} stillsDir the recording's stills directory
 * @param {{scene: string, step?: number}} item a walkthrough plan item
 * @param {number} sceneStepCount how many steps the scene has
 * @param {(file: string) => boolean} [exists]
 */
export function findStepStill(stillsDir, item, sceneStepCount, exists = fs.existsSync) {
  const indexes = item.step === undefined ? Array.from({ length: sceneStepCount }, (_, i) => sceneStepCount - 1 - i) : [item.step];
  for (const index of indexes) {
    const candidate = path.join(stillsDir, stepStillName(item.scene, index));
    if (exists(candidate)) return candidate;
  }
  return null;
}
