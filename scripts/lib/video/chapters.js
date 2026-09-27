// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/video/chapters.js
//
// YouTube chapter lines built from a capture's own timeline.json, so a video's description
// always lists the chapters the recording actually shows, never a hand-typed list that drifts
// the next time a scene is added, removed or reordered. Pure (no fs) — the CLI wrapper,
// scripts/video-chapters.mjs, reads the timeline and the scene script and prints the result.

function formatTimestamp(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

// One chapter per scene the video actually shows, in the order it shows them: the scene's
// earliest on-camera step and its chapter label. A scene entirely off-camera (site-video-
// capture's offCamera) never reaches the encoded video, so it gets no chapter either — a
// fastForward scene still does, since it stays on camera, only sped through. YouTube requires
// the first chapter to start at 0:00 and at least three chapters ten seconds apart; the first
// requirement is met by forcing the earliest chapter's own time to zero, since the timeline's
// first on-camera step always starts within a few milliseconds of the recording's own start.
export function buildChapters(timelineSteps, scenes) {
  const chapterById = new Map(scenes.map((scene) => [scene.id, scene.chapter]));
  const firstStartMsById = new Map();
  for (const step of timelineSteps) {
    if (step.offCamera) continue;
    if (!chapterById.has(step.sceneId)) continue;
    const seenStartMs = firstStartMsById.get(step.sceneId);
    if (seenStartMs === undefined || step.startMs < seenStartMs) {
      firstStartMsById.set(step.sceneId, step.startMs);
    }
  }
  const scenesShown = scenes.filter((scene) => firstStartMsById.has(scene.id));
  return scenesShown.map((scene, index) => ({
    startMs: index === 0 ? 0 : firstStartMsById.get(scene.id),
    label: scene.chapter,
  }));
}

export function formatChapterLines(chapters) {
  return chapters.map((chapter) => `${formatTimestamp(chapter.startMs)} ${chapter.label}`).join("\n");
}
