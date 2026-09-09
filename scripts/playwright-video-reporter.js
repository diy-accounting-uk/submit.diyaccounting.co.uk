// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/playwright-video-reporter.js
// A minimal Playwright custom reporter that copies the first recorded video of a run
// to a stable path for backward compatibility with existing tooling.
//
// Behavior:
// - For any test that produced a video attachment located under
//   target/behaviour-test-results/<test-slug>/video.webm, copy that file to
//   target/behaviour-test-results/video.webm so that downstream scripts can
//   reference a consistent path.
// - Does nothing for other projects (e.g., browser-tests), keeping their output intact.
// - Safe to run across all projects; it quietly skips when no video is present.

import fs from "node:fs";
import path from "node:path";

/** @implements {import('@playwright/test/reporter').Reporter} */
class StableVideoReporter {
  constructor(options = {}) {
    this.hasCopiedBehaviourVideo = false;
    this.verbose = Boolean(options.verbose);
  }

  /**
   * @param {import('@playwright/test/reporter').TestCase} test
   * @param {import('@playwright/test/reporter').TestResult} result
   */
  onTestEnd(test, result) {
    // If we already copied one video for behaviour-tests, skip further work
    if (this.hasCopiedBehaviourVideo) return;

    const tryCopy = (videoFilePath) => {
      const attPath = path.resolve(videoFilePath);
      // Determine whether this test belongs to behaviour-tests using either
      // its file location or the artifact path fallback.
      const isBehaviourByFile = Boolean(test?.location?.file && test.location.file.includes(`${path.sep}behaviour-tests${path.sep}`));
      const isBehaviourByPath = attPath.includes(`${path.sep}target${path.sep}behaviour-test-results${path.sep}`);
      const isBehaviour = isBehaviourByFile || isBehaviourByPath;
      if (!isBehaviour) return false;
      try {
        const stableDir = path.resolve("target/behaviour-test-results");
        const stablePath = path.join(stableDir, "video.webm");
        fs.mkdirSync(stableDir, { recursive: true });
        fs.copyFileSync(attPath, stablePath);
        this.hasCopiedBehaviourVideo = true;
        if (this.verbose) {
          console.log(`[playwright-video-reporter] Copied behaviour video to ${stablePath}`);
        }
        return true;
      } catch (e) {
        console.warn("[playwright-video-reporter] Failed to copy behaviour video:", e?.message || e);
        return false;
      }
    };

    // Prefer standard video attachment if present
    const videoAtt = (result.attachments || []).find((a) => a && a.path && (a.name === "video" || a.contentType === "video/webm"));
    if (videoAtt && videoAtt.path) {
      if (tryCopy(videoAtt.path)) return;
    }

    // Fallback: scan the test's output dir for any .webm files
    const anyAtt = (result.attachments || []).find((a) => a && a.path);
    if (anyAtt && anyAtt.path) {
      const dir = path.dirname(path.resolve(anyAtt.path));
      try {
        const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".webm"));
        if (files.length > 0) {
          tryCopy(path.join(dir, files[0]));
        }
      } catch (e) {
        // ignore directory read errors
      }
    }
  }

  // Avoid printing to stdio so default reporters (list/html) still show up nicely
  printsToStdio() {
    return false;
  }
}

export default StableVideoReporter;
