// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// deployWorkflowImagePaths.test.js -- deploy.yml starts on a push only when the push touches a
// path in its `push.paths` list. The Dockerfile copies source into the Lambda image, so a COPY
// source that the list does not cover changes the image without starting a deploy. This test
// checks that every COPY source of the Dockerfile is covered, and that the DEPLOY_PATHSPECS
// variable (the same list as git pathspecs) matches `push.paths`.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import { minimatch } from "minimatch";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

function readWorkflow() {
  return loadYaml(readFileSync(resolve(ROOT, ".github/workflows/deploy.yml"), "utf8"));
}

function pushPaths() {
  return readWorkflow().on.push.paths;
}

function deployPathspecs() {
  const names = readWorkflow().jobs.names;
  return names.env.DEPLOY_PATHSPECS.split(/\s+/).filter(Boolean);
}

// COPY sources of the final image, excluding the multi-stage `--from=` copies. A source that
// ends in a directory name (no file extension in its last segment) is a directory.
function dockerfileCopySources() {
  const sources = [];
  for (const line of readFileSync(resolve(ROOT, "Dockerfile"), "utf8").split("\n")) {
    if (!line.startsWith("COPY ") || line.startsWith("COPY --from=")) continue;
    const parts = line.slice("COPY ".length).trim().split(/\s+/);
    sources.push(...parts.slice(0, -1));
  }
  return sources;
}

function isDirectory(source) {
  return !source.split("/").pop().includes(".");
}

describe("deploy.yml push paths cover the Lambda image inputs", () => {
  it("reads COPY sources from the Dockerfile", () => {
    expect(dockerfileCopySources()).toContain("app/lib");
    expect(dockerfileCopySources()).toContain("mcp/package.json");
  });

  it("covers every Dockerfile COPY source", () => {
    const globs = pushPaths();
    const uncovered = dockerfileCopySources().filter((source) => {
      const probe = isDirectory(source) ? `${source}/probe.js` : source;
      return !globs.some((glob) => minimatch(probe, glob, { dot: true }));
    });
    expect(uncovered, `Dockerfile COPY sources not covered by deploy.yml push.paths: ${uncovered.join(", ")}`).toEqual([]);
  });

  it("keeps DEPLOY_PATHSPECS identical to push.paths", () => {
    const specs = deployPathspecs().map((spec) => spec.replace(/^:\(glob\)/, ""));
    expect([...specs].sort()).toEqual([...pushPaths()].sort());
  });
});
