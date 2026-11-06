// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/dashboardReviewSchema.js
//
// The shape of what the nightly dashboard review's judge may say about one tab. The judge reads
// screenshots that outside text can reach (affiliate names, page paths, log lines in console
// images). Code parses its answer with these schemas before the report sees it; an answer that
// does not fit is rejected and its text is dropped. `.strict()` rejects every key not listed.
// Every message is a fixed string, so a rejection never echoes the model's words.

import { z } from "zod";

export const FINDINGS_MAX = 12;
export const PROPOSED_ROWS_MAX = 4;
export const PROPOSED_ROW_PREFIXES = ["DASH", "COST", "SEC", "MKT", "OPS"];
export const LISTS = ["improvement", "observation"];

// Shapes that can carry data out or steer a reader: a link, an address, markup, a Markdown link or
// image, a code span, a line break, an issuer hash, and the shape of a pass code.
const FORBIDDEN_SHAPES = [/:\/\//, /www\./i, /\w@\w/, /[<>[\]`]/, /[\r\n]/, /[0-9a-f]{12,}/i, /\b[a-z]+(?:-[a-z]+){3}\b/];

/**
 * A string that holds none of the forbidden shapes.
 * @param {number} max the longest allowed length
 */
export function safeText(max) {
  return z
    .string()
    .min(1)
    .max(max)
    .refine((text) => !FORBIDDEN_SHAPES.some((shape) => shape.test(text)), {
      message: "the text holds a link, address, markup, hash or pass code shape",
    });
}

/**
 * @param {object} options
 * @param {string} options.tabId the one tab this answer is about
 * @param {number} options.imageCount how many images the request holds
 * @param {{ tag: string, list: "improvement" | "observation" }[]} options.tags the skill's tag table
 */
export function tabAnswerSchema({ tabId, imageCount, tags }) {
  if (!Number.isInteger(imageCount) || imageCount < 1) throw new Error("imageCount must be a positive integer");
  if (!Array.isArray(tags) || tags.length === 0) throw new Error("tags must hold the skill's tag table");
  const listByTag = new Map(tags.map(({ tag, list }) => [tag, list]));
  const image = z.number().int().min(1).max(imageCount);
  return z
    .object({
      tabId: z.literal(tabId),
      injectionSuspected: z.boolean(),
      images: z.array(z.object({ image, verdict: z.enum(["ok", "finding"]) }).strict()).length(imageCount),
      findings: z
        .array(
          z
            .object({
              image,
              list: z.enum(LISTS),
              tag: z.enum([...listByTag.keys()]),
              finding: safeText(240),
              evidence: safeText(160),
              change: safeText(240),
            })
            .strict(),
        )
        .max(FINDINGS_MAX),
      proposedRows: z
        .array(
          z
            .object({
              image,
              prefix: z.enum(PROPOSED_ROW_PREFIXES),
              title: safeText(100),
              action: safeText(400),
            })
            .strict(),
        )
        .max(PROPOSED_ROWS_MAX),
    })
    .strict()
    .superRefine((answer, ctx) => {
      const seen = new Set();
      answer.images.forEach((entry, index) => {
        if (seen.has(entry.image)) {
          ctx.addIssue({ code: "custom", path: ["images", index, "image"], message: "an image appears twice" });
        }
        seen.add(entry.image);
      });
      answer.findings.forEach((finding, index) => {
        if (listByTag.get(finding.tag) !== finding.list) {
          ctx.addIssue({ code: "custom", path: ["findings", index, "list"], message: "the tag belongs in the other list" });
        }
      });
      answer.proposedRows.forEach((row, index) => {
        const hasObservation = answer.findings.some((f) => f.image === row.image && f.list === "observation");
        if (!hasObservation) {
          ctx.addIssue({ code: "custom", path: ["proposedRows", index, "image"], message: "the image has no observation finding" });
        }
      });
    });
}

/** The figures block at the end of a report: figure names to numbers, nothing else. */
export const figuresBlockSchema = z.record(z.string().regex(/^[A-Za-z0-9._-]{1,80}$/), z.number().finite());
