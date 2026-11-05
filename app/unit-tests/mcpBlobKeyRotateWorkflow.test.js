// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/mcpBlobKeyRotateWorkflow.test.js

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";

const workflow = load(readFileSync(".github/workflows/mcp-blob-key-rotate.yml", "utf8"));
const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);

describe("mcp-blob-key-rotate workflow", () => {
  it("fails a step when the rotation script fails behind a tee", () => {
    const piped = steps.filter((step) => /mcp-blob-key-rotate\.js[^\n]*\|\s*tee/.test(step.run ?? ""));
    expect(piped.length).toBe(2);
    for (const step of piped) expect(step.run, step.name).toMatch(/set -[a-z]*o pipefail/);
  });
});
