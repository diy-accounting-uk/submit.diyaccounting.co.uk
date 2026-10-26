// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/web/publishWebTestLocal.test.js

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const scriptPath = path.join(process.cwd(), "scripts/publish-web-test-local.sh");

describe("scripts/publish-web-test-local.sh", () => {
  let workDir;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-web-test-"));
    fs.mkdirSync(path.join(workDir, "src/screenshots/helpers"), { recursive: true });
    fs.mkdirSync(path.join(workDir, "web/public/tests"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  function publish(report) {
    fs.writeFileSync(path.join(workDir, "src/test-report-web-test.json"), JSON.stringify(report));
    execFileSync("bash", [scriptPath, "src/test-report-web-test.json", "web-test"], { cwd: workDir, stdio: "pipe" });
    return JSON.parse(fs.readFileSync(path.join(workDir, "web/public/tests/test-report-web-test.json"), "utf-8"));
  }

  test("publishes screenshots named by a path and the video, and the report names only published files", () => {
    const shot = "screenshots/helpers/2026-10-26_15-43-49-646508587-01-goto.png";
    fs.writeFileSync(path.join(workDir, "src", shot), "png");
    fs.writeFileSync(path.join(workDir, "src/video.webm"), "webm");

    const published = publish({ testName: "web-test", artifacts: { screenshots: [shot], videos: ["video.webm"], figures: null } });

    const publishedDir = path.join(workDir, "web/public/tests/behaviour-test-results/web-test");
    expect(published.artifacts.screenshots).toEqual(["screenshots-helpers-01-goto.png"]);
    expect(published.artifacts.videos).toEqual(["video.webm"]);
    for (const name of [...published.artifacts.screenshots, ...published.artifacts.videos]) {
      expect(fs.existsSync(path.join(publishedDir, name))).toBe(true);
    }
  });

  test("drops a screenshot and a video that cannot be found from the report", () => {
    const present = "screenshots/helpers/2026-10-26_15-43-49-646508587-01-goto.png";
    fs.writeFileSync(path.join(workDir, "src", present), "png");

    const published = publish({
      testName: "web-test",
      artifacts: {
        screenshots: [present, "screenshots/helpers/2026-10-26_15-43-50-000000000-02-gone.png"],
        videos: ["video.webm"],
        figures: null,
      },
    });

    expect(published.artifacts.screenshots).toEqual(["screenshots-helpers-01-goto.png"]);
    expect(published.artifacts.videos).toEqual([]);
  });
});
