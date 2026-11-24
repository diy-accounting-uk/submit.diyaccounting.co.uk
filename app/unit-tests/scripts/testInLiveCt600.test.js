// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { promptGatewayCredentials, promptHidden, testInLiveRefusals } from "../../../scripts/lib/testInLiveCt600.js";

const SCRIPT_PATH = fileURLToPath(new URL("../../../scripts/hmrc-tpvs-ct600.js", import.meta.url));
const COMPLETE = [
  "--til",
  "--book",
  "fixtures/diya-gl/precision-code-ltd",
  "--micro",
  "--utr",
  "1234567890",
  "--registered-office-line1",
  "1 High Street",
  "--registered-office-town",
  "Leeds",
  "--registered-office-postcode",
  "LS1 1AA",
];
const ENV = { HMRC_CT_VENDOR_ID: "9873" };

describe("testInLiveRefusals", () => {
  it("accepts a complete command line", () => {
    expect(testInLiveRefusals(COMPLETE, ENV)).toEqual([]);
  });

  it("refuses --til with --ets", () => {
    expect(testInLiveRefusals([...COMPLETE, "--ets"], ENV)).toEqual([
      "--til goes to HMRC's live service and --ets to the External Test Service; give one of them",
    ]);
  });

  it("refuses the options that make a fixture or a test message", () => {
    const refusals = testInLiveRefusals([...COMPLETE, "--tamper-irmark", "--scenario", "x.json", "--agent", "A Practice"], ENV);
    expect(refusals).toHaveLength(3);
    expect(refusals.join(" ")).toMatch(/--tamper-irmark.*--scenario.*--agent/);
  });

  it("names every option the company's own return needs", () => {
    expect(testInLiveRefusals(["--til", "--micro"], ENV)).toEqual([
      "--til needs --book, --utr, --registered-office-line1, --registered-office-town, --registered-office-postcode",
    ]);
  });

  it("refuses a malformed UTR and a missing vendor ID", () => {
    const args = COMPLETE.map((value) => (value === "1234567890" ? "123" : value));
    expect(testInLiveRefusals(args, {})).toEqual([
      "--utr must be the company's 10-digit UTR",
      "--til needs HMRC_CT_VENDOR_ID, the 4-digit vendor ID SDST issues",
    ]);
  });
});

function terminal() {
  const input = new PassThrough();
  input.isTTY = true;
  input.rawModes = [];
  input.setRawMode = (mode) => input.rawModes.push(mode);
  const output = new PassThrough();
  let written = "";
  output.on("data", (chunk) => (written += chunk));
  return { input, output, written: () => written };
}

describe("promptHidden", () => {
  it("reads a line in raw mode and writes only the question", async () => {
    const { input, output, written } = terminal();
    const answer = promptHidden("Password: ", { input, output });
    input.write("secrx\u007ft\r");
    expect(await answer).toBe("secrt");
    expect(written()).toBe("Password: \n");
    expect(input.rawModes).toEqual([true, false]);
  });

  it("rejects on Ctrl-C", async () => {
    const { input, output } = terminal();
    const answer = promptHidden("Password: ", { input, output });
    input.write("abc\u0003");
    await expect(answer).rejects.toThrow(/Cancelled at the prompt; nothing was sent/);
  });

  it("refuses an input that is not a terminal", async () => {
    await expect(promptHidden("Password: ", { input: new PassThrough(), output: new PassThrough() })).rejects.toThrow(/not one/);
  });
});

describe("promptGatewayCredentials", () => {
  it("asks for the user ID and the password and echoes neither", async () => {
    const { input, output, written } = terminal();
    const credentials = promptGatewayCredentials({ input, output });
    input.write("company-user\r");
    await new Promise((resolve) => setImmediate(resolve));
    input.write("company-password\r");
    expect(await credentials).toEqual({ senderId: "company-user", password: "company-password" });
    expect(written()).not.toMatch(/company-user|company-password/);
  });

  it("refuses an empty password", async () => {
    const { input, output } = terminal();
    const credentials = promptGatewayCredentials({ input, output });
    input.write("company-user\r");
    await new Promise((resolve) => setImmediate(resolve));
    input.write("\r");
    await expect(credentials).rejects.toThrow(/both needed/);
  });
});

describe("hmrc-tpvs-ct600.js --til", () => {
  const run = (args, env = ENV) =>
    spawnSync(process.execPath, [SCRIPT_PATH, ...args], { encoding: "utf8", env: { ...process.env, ...env }, input: "" });

  it("refuses --til with --ets and sends nothing", () => {
    const result = run([...COMPLETE, "--ets"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--ets to the External Test Service");
    expect(result.stderr).toContain("Nothing was sent to HMRC.");
  });

  it("stops before sending when the credentials cannot be typed at a terminal", () => {
    const result = run(COMPLETE);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("typed at a terminal");
    expect(result.stdout).toBe("");
  });
});
