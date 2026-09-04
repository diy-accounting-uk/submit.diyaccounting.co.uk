// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/lib/video/captions.js
//
// WebVTT and transcript generation — see design section 6.4. The transcript is the SC 1.2.1 text
// alternative for a silent video, so it is generated from the same step record the video was
// built from and stays true after a rerun; it is never hand-edited.
//
// The formatting functions are pure (no fs). writeVtt/writeTranscript/writeTimeline are thin fs
// wrappers around them, kept at the bottom so the pure half can be unit tested without a
// filesystem.

import fs from "fs";

export function formatVttTimestamp(ms) {
  const totalMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  const pad = (n, width) => String(n).padStart(width, "0");
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(millis, 3)}`;
}

// Greedy word-wrap at maxCharsPerLine. Throws if the wrapped text needs more than maxLines —
// the repo rule is throw, don't skip, and a silently truncated caption is a viewer reading a
// sentence that stops mid-thought.
export function wrapCaptionLines(text, maxCharsPerLine, maxLines) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  if (lines.length === 0) lines.push("");
  if (lines.length > maxLines) {
    throw new Error(
      `caption "${text}" wraps to ${lines.length} lines at ${maxCharsPerLine} chars/line, more than maxLines=${maxLines}`,
    );
  }
  return lines;
}

export function buildVttCue(index, startMs, endMs, lines) {
  return `${index}\n${formatVttTimestamp(startMs)} --> ${formatVttTimestamp(endMs)}\n${lines.join("\n")}\n`;
}

// captionEvents: [{ startMs, endMs, text, maxCharsPerLine, maxLines }], in start order.
export function buildVtt(captionEvents) {
  const cues = captionEvents.map((event, i) =>
    buildVttCue(i + 1, event.startMs, event.endMs, wrapCaptionLines(event.text, event.maxCharsPerLine, event.maxLines)),
  );
  return `WEBVTT\n\n${cues.join("\n")}`;
}

// sceneRecords: [{ id, chapter, entries: [{ caption, description, note }] }]. `description` is
// a plain-language account of the step's action ("clicks the Bundles link"); `note` is the
// script author's own note (never shown on screen). Every caption that appears in the video
// appears here too, which is what section 10.2 checks.
export function buildTranscript({ title, description, sceneRecords }) {
  const lines = [`# ${title}`, "", description, ""];
  for (const scene of sceneRecords) {
    lines.push(`## ${scene.chapter}`, "");
    for (const entry of scene.entries) {
      if (entry.caption) lines.push(`- Caption: ${entry.caption}`);
      if (entry.description) lines.push(`- ${entry.description}`);
      if (entry.note) lines.push(`- Note: ${entry.note}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function writeVtt(path, captionEvents) {
  fs.writeFileSync(path, buildVtt(captionEvents));
}

export function writeTranscript(path, transcriptInput) {
  fs.writeFileSync(path, buildTranscript(transcriptInput));
}

export function writeTimeline(path, timelineSteps) {
  fs.writeFileSync(path, JSON.stringify({ steps: timelineSteps }, null, 2));
}
