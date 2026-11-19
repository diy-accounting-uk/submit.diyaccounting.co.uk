// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const script = path.join(process.cwd(), "scripts/sso-check.sh");

let home;
let awsDir;
let stubBin;

function run(args, { awsExitCode } = {}) {
  const pathEntries = awsExitCode === undefined ? [] : [stubBin(awsExitCode)];
  const env = {
    ...process.env,
    HOME: home,
    AWS_CONFIG_DIR: awsDir,
    AWS_CONFIG_FILE: path.join(home, "no-config"),
    AWS_SHARED_CREDENTIALS_FILE: path.join(home, "no-credentials"),
    AWS_EC2_METADATA_DISABLED: "true",
    PATH: [...pathEntries, process.env.PATH].join(path.delimiter),
  };
  return spawnSync("bash", [script, ...args], { env, encoding: "utf8", timeout: 60_000 });
}

beforeAll(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "sso-check-"));
  awsDir = path.join(home, "aws");
  fs.mkdirSync(path.join(awsDir, "sso", "cache"), { recursive: true });
  fs.writeFileSync(
    path.join(awsDir, "config"),
    [
      "[profile diya-submit-ci]",
      "sso_session = diyaccounting",
      "sso_account_id = 111111111111",
      "",
      "[sso-session diyaccounting]",
      "sso_start_url = https://example.awsapps.com/start",
      "",
      "[profile legacy]",
      "sso_start_url = https://legacy.awsapps.com/start",
      "",
    ].join("\n"),
  );
  const cache = (name, body) => fs.writeFileSync(path.join(awsDir, "sso", "cache", name), body);
  cache(
    "session.json",
    JSON.stringify({ startUrl: "https://example.awsapps.com/start", sessionName: "diyaccounting", expiresAt: "2026-11-19T03:26:00Z" }),
  );
  cache("older.json", JSON.stringify({ startUrl: "https://example.awsapps.com/start", expiresAt: "2026-11-18T03:26:00Z" }));
  cache("legacy.json", JSON.stringify({ startUrl: "https://legacy.awsapps.com/start", expiresAt: "2026-11-10T00:00:00Z" }));
  cache("broken.json", "not json");
  stubBin = (exitCode) => {
    const dir = path.join(home, `bin-${exitCode}`);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, "aws"), `#!/bin/sh\nexit ${exitCode}\n`, { mode: 0o755 });
    }
    return dir;
  };
});

afterAll(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

describe("sso-check.sh --expires-at", () => {
  it("reads the latest expiresAt of the cache files that match the profile's sso_session", () => {
    const result = run(["--expires-at", "diya-submit-ci"]);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("2026-11-19T03:26:00Z");
  });

  it("matches a profile with its own sso_start_url and no sso_session by the start URL", () => {
    expect(run(["--expires-at", "legacy"]).stdout.trim()).toBe("2026-11-10T00:00:00Z");
  });

  it("prints nothing for a profile with no matching cache file", () => {
    const result = run(["--expires-at", "unknown"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("refuses --expires-at without exactly one profile", () => {
    expect(run(["--expires-at"]).status).toBe(2);
  });
});

describe("sso-check.sh profile lines", () => {
  it("says CLI cache only, with the token's expiresAt, when the CLI answers and the SDK does not", () => {
    const result = run(["diya-submit-ci"], { awsExitCode: 0 });
    expect(result.stdout.trim()).toBe("diya-submit-ci: CLI cache only (SSO token expired at 2026-11-19T03:26:00Z)");
    expect(result.status).toBe(1);
  });

  it("says expired when neither the CLI nor the SDK answers, one line per profile", () => {
    const result = run(["diya-submit-ci", "unknown"], { awsExitCode: 255 });
    expect(result.stdout.trim().split("\n")).toEqual([
      "diya-submit-ci: expired (SSO token expired at 2026-11-19T03:26:00Z)",
      "unknown: expired (SSO token expired at an unknown time (no SSO cache file for this profile))",
    ]);
    expect(result.status).toBe(1);
  });
});
