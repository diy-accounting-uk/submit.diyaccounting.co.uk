// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/quarantineReaderSchema.js
//
// The shape of what a quarantine reader may say. The reader is a model call with no tools that
// reads untrusted text (an alarm analysis) and answers with one JSON object.
// Code parses that object with these schemas before anything else sees it; an answer that does
// not fit is rejected and its text is dropped. `.strict()` rejects every key not listed, so an
// injected "labels" or "command" key cannot ride along.

import { z } from "zod";

export const SUMMARY_MAX_LENGTH = 300;

const summary = z
  .string()
  .min(1)
  .max(SUMMARY_MAX_LENGTH)
  .refine((text) => !/https?:\/\//i.test(text), { message: "a summary holds no URL" });

/**
 * @param {Set<string>} remedyFamilies the `family` values in app/data/alarm-remedies.json
 */
export function alarmReaderSchema(remedyFamilies) {
  return z
    .object({
      stillBroken: z.enum(["yes", "no", "unknown"]),
      remedyFamily: z
        .string()
        .refine((family) => remedyFamilies.has(family), { message: "not a known family" })
        .nullable(),
      summary,
      injectionSuspected: z.boolean(),
      piiPresent: z.boolean(),
    })
    .strict();
}
