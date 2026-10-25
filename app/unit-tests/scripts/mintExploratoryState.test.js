// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/mintExploratoryState.test.js

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseArguments,
  emptyStorageState,
  stateFilePaths,
  readCredentials,
  DEFAULT_OUT_DIR,
  DEFAULT_CREDENTIALS_FILE,
} from "../../../scripts/mint-exploratory-state.mjs";

describe("parseArguments", () => {
  test("defaults the output folder and the credentials file, with no base URL", () => {
    expect(parseArguments([])).toEqual({ baseUrl: null, outDir: DEFAULT_OUT_DIR, credentialsFile: DEFAULT_CREDENTIALS_FILE });
  });

  test("reads --base-url, --out and --credentials", () => {
    const options = parseArguments([
      "--base-url",
      "https://ci-set1.submit.diyaccounting.co.uk/",
      "--out",
      "/tmp/x",
      "--credentials",
      "c.json",
    ]);
    expect(options).toEqual({ baseUrl: "https://ci-set1.submit.diyaccounting.co.uk/", outDir: "/tmp/x", credentialsFile: "c.json" });
  });

  test("rejects an unknown flag", () => {
    expect(() => parseArguments(["--bogus", "1"])).toThrow(/Unknown argument --bogus/);
  });

  test("rejects a flag with no value", () => {
    expect(() => parseArguments(["--out"])).toThrow(/--out needs a value/);
    expect(() => parseArguments(["--out", "--base-url", "x"])).toThrow(/--out needs a value/);
  });
});

describe("state files", () => {
  test("the visitor state holds no cookies and no origins", () => {
    expect(emptyStorageState()).toEqual({ cookies: [], origins: [] });
  });

  test("both state files sit in the output folder under the names .mcp.json uses", () => {
    expect(stateFilePaths(".cache/playwright-mcp")).toEqual({
      signedIn: path.join(".cache/playwright-mcp", "ci-state.json"),
      visitor: path.join(".cache/playwright-mcp", "visitor-state.json"),
    });
  });
});

describe("readCredentials", () => {
  test("names the enable command when the file is missing", () => {
    expect(() => readCredentials("/nonexistent/credentials.json")).toThrow(/test:enableCognitoNative/);
  });

  test("returns the username, password and TOTP secret of the file", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mint-")), "credentials.json");
    fs.writeFileSync(file, JSON.stringify({ username: "u@example.test", password: "p", totpSecret: "ABC" }));
    expect(readCredentials(file)).toMatchObject({ username: "u@example.test", password: "p", totpSecret: "ABC" });
  });

  test("rejects a file with no password", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mint-")), "credentials.json");
    fs.writeFileSync(file, JSON.stringify({ username: "u@example.test" }));
    expect(() => readCredentials(file)).toThrow(/no username or password/);
  });
});
