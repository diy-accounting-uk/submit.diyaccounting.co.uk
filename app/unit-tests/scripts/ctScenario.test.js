// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readScenario, runScenario, REFUSED_EXIT_CODE } from "../../../scripts/lib/ctScenario.js";
import { runScenarioCommand } from "../../../scripts/lib/ctScenarioCommand.js";

const SMALL = "fixtures/ct-scenarios/marginal-relief-small.json";
const MICRO = "fixtures/ct-scenarios/micro-entity-loss.json";
const TPVS_SUCCESS = readFileSync("fixtures/hmrc-transaction-engine/tpvs-ct600-success-response.xml", "utf8");
const TPVS_SCHEMA_ERROR = readFileSync("fixtures/hmrc-transaction-engine/tpvs-ct600-schema-error-response.xml", "utf8");
const UTR = "8596148860";
const ETS = { senderId: "ets-sender", password: "ets-secret-password", vendorId: "9873" };

let directory;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "ct-scenario-"));
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

function scenarioFile(change) {
  const scenario = JSON.parse(readFileSync(SMALL, "utf8"));
  const changed = change(scenario) ?? scenario;
  const file = join(directory, "scenario.json");
  writeFileSync(file, JSON.stringify(changed));
  return file;
}

describe("readScenario", () => {
  it("reads the made-up fixtures", () => {
    expect(readScenario(SMALL).name).toBe("marginal-relief-small");
    expect(readScenario(MICRO)).toMatchObject({ name: "micro-entity-loss", sender: "company" });
  });

  it("refuses a name that cannot name a folder", () => {
    const file = scenarioFile((scenario) => ({ ...scenario, name: "../escape" }));
    expect(() => readScenario(file)).toThrow(/lower-case letters, digits and hyphens/);
  });

  it("refuses a request that carries the UTR or Gateway credentials", () => {
    const file = scenarioFile((scenario) => ({ ...scenario, request: { ...scenario.request, utr: UTR, gatewayPassword: "x" } }));
    expect(() => readScenario(file)).toThrow(/must not hold utr, gatewayPassword/);
  });

  it("needs a practice name for an agent scenario", () => {
    const file = scenarioFile((scenario) => ({ ...scenario, sender: "agent" }));
    expect(() => readScenario(file)).toThrow(/request.agent.practiceName/);
  });

  it("names a file that is not JSON", () => {
    const file = join(directory, "bad.json");
    writeFileSync(file, "{not json");
    expect(() => readScenario(file)).toThrow(/cannot be read as JSON/);
  });
});

describe("runScenario against TPVS", () => {
  it("writes the request, the response and an accepted result", async () => {
    const posts = [];
    const { exitCode, result } = await runScenario({
      scenario: readScenario(SMALL),
      outDirectory: directory,
      utr: UTR,
      post: async (url, xml) => {
        posts.push({ url, xml });
        return { status: 200, data: TPVS_SUCCESS };
      },
    });
    expect(exitCode).toBe(0);
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("https://www.tpvs.hmrc.gov.uk/HMRC/CT600");
    expect(readdirSync(join(directory, "marginal-relief-small")).sort()).toEqual(["request.xml", "response.xml", "result.json"]);
    const saved = JSON.parse(readFileSync(join(directory, "marginal-relief-small", "result.json"), "utf8"));
    expect(saved).toMatchObject({ scenario: "marginal-relief-small", service: "tpvs", outcome: "accepted", httpStatus: 200 });
    expect(saved.irmark).toMatch(/^[A-Z2-7]{32}$/);
    expect(saved.boxes["3"]).toBe("***");
    expect(saved.boxes["440"]).toBe(22750);
    expect(result.errors).toEqual([]);
  });

  it("records HMRC's errors in a rejected result and exits 1", async () => {
    const { exitCode, result } = await runScenario({
      scenario: readScenario(MICRO),
      outDirectory: directory,
      utr: UTR,
      post: async () => ({ status: 200, data: TPVS_SCHEMA_ERROR }),
    });
    expect(exitCode).toBe(1);
    expect(result.outcome).toBe("rejected");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(readdirSync(join(directory, "micro-entity-loss"))).not.toContain("refused.json");
  });

  it("records a non-200 answer as rejected", async () => {
    const { exitCode, result } = await runScenario({
      scenario: readScenario(SMALL),
      outDirectory: directory,
      utr: UTR,
      post: async () => ({ status: 403, data: "Access Denied" }),
    });
    expect(exitCode).toBe(1);
    expect(result.errors[0].text).toBe("TPVS answered HTTP 403");
  });
});

describe("runScenario refused by the product", () => {
  it("writes refused.json with the field and message and posts nothing", async () => {
    const file = scenarioFile((scenario) => {
      scenario.request.figures.companyType = 6;
    });
    let posted = false;
    const { exitCode, result } = await runScenario({
      scenario: readScenario(file),
      outDirectory: directory,
      utr: UTR,
      post: async () => {
        posted = true;
        return { status: 200, data: "" };
      },
    });
    expect(exitCode).toBe(REFUSED_EXIT_CODE);
    expect(posted).toBe(false);
    expect(result.outcome).toBe("refused");
    const refused = JSON.parse(readFileSync(join(directory, "marginal-relief-small", "refused.json"), "utf8"));
    expect(refused.scenario).toBe("marginal-relief-small");
    expect(refused.message).toContain("Company type 6");
    expect(refused.field).toBeTruthy();
    expect(readdirSync(join(directory, "marginal-relief-small"))).toEqual(["refused.json"]);
  });

  it("refuses a request without a registered office instead of looking it up", async () => {
    const file = scenarioFile((scenario) => {
      delete scenario.request.registeredOffice;
    });
    const { exitCode, result } = await runScenario({ scenario: readScenario(file), outDirectory: directory, utr: UTR });
    expect(exitCode).toBe(REFUSED_EXIT_CODE);
    expect(result.message).toContain("registeredOffice");
  });
});

describe("runScenario against ETS", () => {
  it("masks the sender ID and password in every written file", async () => {
    const response = (qualifier) => TPVS_SUCCESS.replace(/<Qualifier>[^<]*<\/Qualifier>/, `<Qualifier>${qualifier}</Qualifier>`);
    const answers = [response("response"), response("response")];
    const { exitCode, result } = await runScenario({
      scenario: readScenario(SMALL),
      outDirectory: directory,
      utr: UTR,
      ets: ETS,
      post: async () => ({ status: 200, data: answers.shift() ?? response("response") }),
      wait: async () => {},
    });
    expect(exitCode).toBe(0);
    expect(result.service).toBe("ets");
    const folder = join(directory, "marginal-relief-small");
    const files = readdirSync(folder);
    expect(files).toContain("request.xml");
    expect(files).toContain("result.json");
    expect(files.filter((name) => name.startsWith("ets-")).length).toBeGreaterThan(0);
    for (const name of files) {
      const text = readFileSync(join(folder, name), "utf8");
      expect(text).not.toContain(ETS.senderId);
      expect(text).not.toContain(ETS.password);
    }
    expect(readFileSync(join(folder, "request.xml"), "utf8")).toContain("<SenderID>***</SenderID>");
    expect(readFileSync(join(folder, "result.json"), "utf8")).not.toContain(`"${UTR}"`);
  });
});

describe("runScenarioCommand", () => {
  it("prints the field and message of a refusal and returns the refused exit code", async () => {
    const file = scenarioFile((scenario) => {
      scenario.request.figures.companyType = 6;
    });
    const lines = [];
    const code = await runScenarioCommand({
      argv: ["node", "script", "--scenario", file, "--out", directory],
      env: {},
      log: (line) => lines.push(line),
    });
    expect(code).toBe(REFUSED_EXIT_CODE);
    expect(lines[0]).toMatch(/^marginal-relief-small: refused by the product at \S+: Company type 6/);
  });

  it("names the missing ETS variables", async () => {
    const lines = [];
    const code = await runScenarioCommand({
      argv: ["node", "script", "--scenario", SMALL, "--ets"],
      env: {},
      log: (line) => lines.push(line),
    });
    expect(code).toBe(1);
    expect(lines[0]).toContain("HMRC_CT_ETS_SENDER_ID");
  });

  it("reports an accepted run on one line with the IRmark", async () => {
    const lines = [];
    const code = await runScenarioCommand({
      argv: ["node", "script", "--scenario", SMALL, "--out", directory],
      env: {},
      run: async () => ({
        exitCode: 0,
        result: { scenario: "marginal-relief-small", service: "tpvs", outcome: "accepted", irmark: "ABC", errors: [] },
      }),
      log: (line) => lines.push(line),
    });
    expect(code).toBe(0);
    expect(lines[0]).toContain("accepted by TPVS; IRmark ABC");
  });
});
