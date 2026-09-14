// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/ensure-cognito-test-user.test.js

import { describe, test, expect, vi, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

import { writeGithubOutputCredentials } from "../../../scripts/ensure-cognito-test-user.js";

describe("writeGithubOutputCredentials", () => {
  let outputPath;

  afterEach(() => {
    vi.restoreAllMocks();
    if (outputPath && fs.existsSync(outputPath)) fs.rmSync(outputPath);
    outputPath = undefined;
  });

  // GitHub does not mask a step's outputs by default: a caller that reads these values back
  // into an env: block (video-capture.yml, probe-test.yml, deploy-app.yml) prints them
  // unmasked wherever the block's values reach the log, unless the runner has already been
  // told to mask them.
  test("masks the password and TOTP secret before writing them to GITHUB_OUTPUT", () => {
    outputPath = path.join(os.tmpdir(), `ensure-cognito-test-user-${crypto.randomUUID()}.env`);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    writeGithubOutputCredentials("synthetic-lane@test.diyaccounting.co.uk", "TestPassword123#", "ABCDEFGHIJ", outputPath);

    expect(logSpy).toHaveBeenCalledWith("::add-mask::TestPassword123#");
    expect(logSpy).toHaveBeenCalledWith("::add-mask::ABCDEFGHIJ");

    const written = fs.readFileSync(outputPath, "utf8");
    expect(written).toContain("test-auth-username=synthetic-lane@test.diyaccounting.co.uk");
    expect(written).toContain("test-auth-password=TestPassword123#");
    expect(written).toContain("test-auth-totp-secret=ABCDEFGHIJ");
  });

  test("does nothing when no GITHUB_OUTPUT path is given", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const appendSpy = vi.spyOn(fs, "appendFileSync");

    writeGithubOutputCredentials("synthetic-lane@test.diyaccounting.co.uk", "TestPassword123#", "ABCDEFGHIJ", "");

    expect(logSpy).not.toHaveBeenCalled();
    expect(appendSpy).not.toHaveBeenCalled();
  });
});
