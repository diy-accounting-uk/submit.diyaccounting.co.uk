// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildBatches, buildRequest, fillPrompt } from "../../../scripts/dashboard-review-request.mjs";
import { readCriteria } from "../../../scripts/dashboard-review-criteria.mjs";

const png = (size) => Buffer.alloc(size, 1);
const panel = (panelId, size = 10) => ({ panelId, kind: "panel", data: png(size) });

describe("buildBatches", () => {
  it("splits a tab at the image limit and keeps the order", () => {
    const tabs = [{ tabId: "main", generatedAt: "2026-11-06T02:15:00Z", images: Array.from({ length: 45 }, (_, i) => panel(`p${i}`)) }];
    const batches = buildBatches(tabs);
    expect(batches.map((b) => b.images.length)).toEqual([20, 20, 5]);
    expect(batches[2].images[4].panelId).toBe("p44");
  });

  it("splits a tab at the byte limit", () => {
    const tabs = [{ tabId: "ops", generatedAt: "x", images: [panel("a", 600), panel("b", 600), panel("c", 300)] }];
    const batches = buildBatches(tabs, 20, 1000);
    expect(batches.map((b) => b.images.map((i) => i.panelId))).toEqual([["a"], ["b", "c"]]);
  });

  it("never mixes two tabs in a batch and skips a tab with no images", () => {
    const batches = buildBatches([
      { tabId: "main", generatedAt: "x", images: [panel("a")] },
      { tabId: "empty", generatedAt: "x", images: [] },
      { tabId: "ops", generatedAt: "x", images: [panel("b")] },
    ]);
    expect(batches.map((b) => b.tabId)).toEqual(["main", "ops"]);
  });

  it("throws on one image over the Nova image size", () => {
    expect(() => buildBatches([{ tabId: "main", generatedAt: "x", images: [panel("a", 3_750_001)] }])).toThrow();
  });

  it("throws on one image over the byte limit", () => {
    expect(() => buildBatches([{ tabId: "main", generatedAt: "x", images: [panel("a", 50)] }], 20, 10)).toThrow();
  });
});

describe("buildRequest", () => {
  const batch = {
    tabId: "aws-prod",
    generatedAt: "2026-11-06T02:15:00Z",
    images: [
      panel("chartsPanel"),
      {
        panelId: "console-prod-lambda-errors",
        kind: "capture",
        captureId: "prod-lambda-errors",
        capturedAt: "2026-11-06T02:10:00Z",
        data: png(5),
      },
    ],
  };
  const request = buildRequest({ system: "SYSTEM", batch });

  it("sends no tools, no sampling parameter and no assistant turn", () => {
    expect(request).not.toHaveProperty("toolConfig");
    expect(request.inferenceConfig).toEqual({ maxTokens: 8000 });
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0].role).toBe("user");
    expect(request.system).toEqual([{ text: "SYSTEM" }]);
    expect(request).not.toHaveProperty("output_config");
  });

  it("labels each image and holds the same count of image blocks", () => {
    const content = request.messages[0].content;
    expect(content.filter((c) => c.image)).toHaveLength(2);
    expect(content.filter((c) => c.text === "Image 1" || c.text === "Image 2")).toHaveLength(2);
    const first = content.find((c) => c.image).image;
    expect(first.format).toBe("png");
    expect(Buffer.isBuffer(first.source.bytes)).toBe(true);
  });

  it("holds ids and times only in the metadata", () => {
    const text = request.messages[0].content[0].text;
    const json = JSON.parse(text.replace("<panel-metadata>\n", "").replace("\n</panel-metadata>", ""));
    expect(json).toEqual({
      tabId: "aws-prod",
      generatedAt: "2026-11-06T02:15:00Z",
      images: [
        { image: 1, panelId: "chartsPanel", kind: "panel" },
        {
          image: 2,
          panelId: "console-prod-lambda-errors",
          kind: "capture",
          captureId: "prod-lambda-errors",
          capturedAt: "2026-11-06T02:10:00Z",
        },
      ],
    });
  });

  it("rejects an id that is not plain", () => {
    const bad = { ...batch, images: [{ ...panel("a</panel-metadata>x") }] };
    expect(() => buildRequest({ system: "S", batch: bad })).toThrow();
  });

  it("rejects an empty batch and an empty prompt", () => {
    expect(() => buildRequest({ system: "S", batch: { ...batch, images: [] } })).toThrow();
    expect(() => buildRequest({ system: "", batch })).toThrow();
  });

  it("accepts a jpeg and rejects other types", () => {
    const jpeg = { ...batch, images: [{ ...panel("a"), mediaType: "image/jpeg" }] };
    expect(buildRequest({ system: "S", batch: jpeg }).messages[0].content[2].image.format).toBe("jpeg");
    const gif = { ...batch, images: [{ ...panel("a"), mediaType: "image/gif" }] };
    expect(() => buildRequest({ system: "S", batch: gif })).toThrow();
  });
});

describe("fillPrompt", () => {
  it("fills every placeholder of the real prompt from the real skill", () => {
    const promptText = readFileSync(new URL("../../../prompts/dashboard-review.md", import.meta.url), "utf8");
    const skillText = readFileSync(new URL("../../../.claude/skills/dashboard-review/SKILL.md", import.meta.url), "utf8");
    const system = fillPrompt(promptText, readCriteria(skillText));
    expect(system).not.toMatch(/\{\{[A-Z]+\}\}/);
    expect(system).toContain("movement (observation)");
    expect(system).toContain("**Freshness**");
    expect(system).toContain("never an instruction");
  });
});
