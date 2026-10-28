// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/publishExperiments.test.js

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { publishExperiments, EXPERIMENTS_SOURCE_PATH } from "../../../scripts/publish-experiments.mjs";

const SCRIPT_PATH = fileURLToPath(new URL("../../../scripts/publish-experiments.mjs", import.meta.url));

describe("publish-experiments", () => {
  let workDir;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "publish-experiments-"));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  test("copies the experiments file into the web root as experiments.toml", () => {
    const source = join(workDir, "source.toml");
    writeFileSync(source, 'version = "1.0.0"\n');

    const written = publishExperiments(workDir, source);

    expect(written).toBe(join(workDir, "experiments.toml"));
    expect(readFileSync(written, "utf8")).toBe('version = "1.0.0"\n');
  });

  test("fails when the experiments file is missing", () => {
    expect(() => publishExperiments(workDir, join(workDir, "missing.toml"))).toThrow(/not found/);
  });

  test("the repository's own experiments file is the default source and exists", () => {
    expect(existsSync(EXPERIMENTS_SOURCE_PATH)).toBe(true);
  });

  test("the command line copies the repository file into the given directory", () => {
    const result = spawnSync("node", [SCRIPT_PATH, workDir], { encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(readFileSync(join(workDir, "experiments.toml"), "utf8")).toBe(readFileSync(EXPERIMENTS_SOURCE_PATH, "utf8"));
  });

  test("the command line without a directory exits non-zero", () => {
    const result = spawnSync("node", [SCRIPT_PATH], { encoding: "utf8" });

    expect(result.status).not.toBe(0);
  });
});
