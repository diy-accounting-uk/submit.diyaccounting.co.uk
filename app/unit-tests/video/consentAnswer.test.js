// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/consentAnswer.test.js

import fs from "fs";
import path from "path";
import { describe, test, expect } from "vitest";
import { consentAnswerFor } from "../../../scripts/lib/video/consentAnswer.js";

const videosDir = path.resolve("videos");
const submitSiteScripts = fs
  .readdirSync(videosDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => ({ name, script: JSON.parse(fs.readFileSync(path.join(videosDir, name), "utf8")) }))
  .filter(({ script }) => Array.isArray(script.scenes) && !script.localApp);

describe("the consent answer a capture stores", () => {
  test("a submit-site script with no answer declines", () => {
    expect(consentAnswerFor({ scenes: [] })).toBe("declined");
  });

  test("a script's own answer stands", () => {
    expect(consentAnswerFor({ consentAnswer: "granted" })).toBe("granted");
  });

  test("a localApp script with no answer stores none", () => {
    expect(consentAnswerFor({ localApp: { command: "x", url: "http://localhost:1", readyPattern: "x" } })).toBeNull();
  });

  test.each(submitSiteScripts.map(({ name, script }) => [name, script]))("%s answers consent before its first frame", (name, script) => {
    expect(consentAnswerFor(script)).not.toBeNull();
  });
});
