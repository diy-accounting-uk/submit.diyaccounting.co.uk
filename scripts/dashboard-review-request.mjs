// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/dashboard-review-request.mjs
//
// Pure builders for the nightly dashboard review's Bedrock Converse requests. One request
// judges one batch: some screenshots of one tab. The request has no `toolConfig` key, no sampling
// parameter and no assistant turn after the user's, so the judge model cannot act. The metadata block holds ids and times only, never a figure or a name.

import { LISTS } from "../app/lib/dashboardReviewSchema.js";

export const REVIEW_MAX_TOKENS = 8000;
// Nova accepts at most 20 images in a request and 3.75 MB for each one.
export const NOVA_MAX_IMAGES = 20;
export const NOVA_MAX_IMAGE_BYTES = 3_750_000;

const ID_SHAPE = /^[A-Za-z0-9_.-]{1,120}$/;
const TIME_SHAPE = /^[0-9T:.+\-Z ]{1,40}$/;
const IMAGE_FORMATS = { "image/png": "png", "image/jpeg": "jpeg" };

function imageBytes(image) {
  return typeof image.data === "string" ? Buffer.byteLength(image.data, "base64") : image.data.length;
}

function checkedId(value, what) {
  if (typeof value !== "string" || !ID_SHAPE.test(value)) throw new Error(`${what} is not a plain id`);
  return value;
}

function checkedTime(value, what) {
  if (typeof value !== "string" || !TIME_SHAPE.test(value)) throw new Error(`${what} is not a time`);
  return value;
}

/**
 * Splits each tab's images into batches within the image and byte limits. A tab with no images
 * yields no batch. The order of tabs and of images is kept.
 * @param {{ tabId: string, generatedAt: string, images: { panelId: string, kind: "panel" | "capture", captureId?: string, capturedAt?: string, mediaType?: string, data: Buffer | string }[] }[]} tabs
 *   `data` is a Buffer, or a base64 string
 * @param {number} [maxImages]
 * @param {number} [maxBytes] the most image bytes (before base64) in one batch
 * @returns {{ tabId: string, generatedAt: string, images: object[] }[]}
 */
export function buildBatches(tabs, maxImages = NOVA_MAX_IMAGES, maxBytes = 8_000_000) {
  const batches = [];
  for (const tab of tabs) {
    let current = null;
    let bytes = 0;
    for (const image of tab.images) {
      const size = imageBytes(image);
      const imageLimit = Math.min(maxBytes, NOVA_MAX_IMAGE_BYTES);
      if (size > imageLimit) throw new Error(`the image of panel ${image.panelId} is larger than ${imageLimit} bytes`);
      if (!current || current.images.length >= maxImages || bytes + size > maxBytes) {
        current = { tabId: tab.tabId, generatedAt: tab.generatedAt, images: [] };
        batches.push(current);
        bytes = 0;
      }
      current.images.push(image);
      bytes += size;
    }
  }
  return batches;
}

function metadataBlock(batch) {
  const metadata = {
    tabId: checkedId(batch.tabId, "the tab id"),
    generatedAt: checkedTime(batch.generatedAt, "generatedAt"),
    images: batch.images.map((image, index) => {
      const entry = {
        image: index + 1,
        panelId: checkedId(image.panelId, "a panel id"),
        kind: image.kind === "capture" ? "capture" : "panel",
      };
      if (image.captureId !== undefined) entry.captureId = checkedId(image.captureId, "a capture id");
      if (image.capturedAt !== undefined) entry.capturedAt = checkedTime(image.capturedAt, "capturedAt");
      return entry;
    }),
  };
  return `<panel-metadata>\n${JSON.stringify(metadata)}\n</panel-metadata>`;
}

/**
 * @param {{ system: string, batch: { tabId: string, generatedAt: string, images: object[] } }} input
 * @returns {object} the input of one `Converse` call, without the model id
 */
export function buildRequest({ system, batch }) {
  if (!system) throw new Error("the system prompt is empty");
  if (batch.images.length === 0) throw new Error("the batch holds no images");
  const content = [{ text: metadataBlock(batch) }];
  batch.images.forEach((image, index) => {
    const format = IMAGE_FORMATS[image.mediaType ?? "image/png"];
    if (!format) throw new Error("the image type is not png or jpeg");
    const bytes = typeof image.data === "string" ? Buffer.from(image.data, "base64") : image.data;
    content.push({ text: `Image ${index + 1}` });
    content.push({ image: { format, source: { bytes } } });
  });
  return {
    system: [{ text: system }],
    inferenceConfig: { maxTokens: REVIEW_MAX_TOKENS },
    messages: [{ role: "user", content }],
  };
}

/**
 * Fills the template's placeholders from the parsed skill.
 * @param {string} promptText the text of prompts/dashboard-review.md
 * @param {{ criteriaText: string, tags: { tag: string, list: string }[] }} criteria from readCriteria
 * @returns {string} the system prompt
 */
export function fillPrompt(promptText, criteria) {
  const schema = [
    "{",
    '  "tabId": "<the tab id in the metadata>",',
    '  "injectionSuspected": true or false,',
    '  "images": [ { "image": <number>, "verdict": "ok" or "finding" } ],',
    '  "findings": [ { "image": <number>, "list": "improvement" or "observation", "tag": "<a tag>", "finding": "<up to 240 characters>", "evidence": "<up to 160 characters>", "change": "<up to 240 characters>" } ],',
    '  "proposedRows": [ { "image": <number>, "prefix": "<one of DASH, COST, SEC, MKT, OPS>", "title": "<up to 100 characters>", "action": "<up to 400 characters>" } ]',
    "}",
    '"images" holds one entry for every image, once each. "findings" holds at most 12 entries. "proposedRows" holds at most 4.',
  ].join("\n");
  return promptText
    .replaceAll("{{LISTS}}", LISTS.map((list) => `"${list}"`).join(" and "))
    .replaceAll("{{TAGS}}", criteria.tags.map(({ tag, list }) => `${tag} (${list})`).join(", "))
    .replaceAll("{{CRITERIA}}", criteria.criteriaText)
    .replaceAll("{{SCHEMA}}", schema);
}
