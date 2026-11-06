// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const sendMock = vi.fn();
vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: class {
    send(command) {
      return sendMock(command);
    }
  },
  InvokeModelCommand: class {
    constructor(input) {
      this.input = input;
      this.kind = "invoke";
    }
  },
  ApplyGuardrailCommand: class {
    constructor(input) {
      this.input = input;
      this.kind = "guardrail";
    }
  },
}));

const launchMock = vi.fn();
vi.mock("playwright", () => ({ chromium: { launchPersistentContext: (...args) => launchMock(...args) } }));

import { runNightly, unpackBundle, withJpegConverter, encryptBytes, decryptBytes } from "../../../scripts/dashboard-review-nightly.mjs";

const REPO = path.resolve(import.meta.dirname, "../../..");
const PASS = "transit-pass-for-the-test";
const DAY_ONE = Date.parse("2026-11-05T09:00:00.000Z");
const DAY_TWO = Date.parse("2026-11-06T09:00:00.000Z");

const FIXED = [
  /^render ok tabs=\d+ images=\d+$/,
  /^judge ok batches=\d+ rejected=\d+$/,
  /^judge request-bytes-max=\d+$/,
  /^bundle ok$/,
  /^write ok findings=\d+ rejected=\d+ images=\d+$/,
  /^(snapshot-missing|render-timeout tab=\w+|image-load-failed|answer-too-large|refused-write|config-missing|bundle-invalid)$/,
  /^(bedrock-error|error) [A-Za-z0-9]+$/,
];

let sandbox;
let env;

function snapshot(revenue = 100, generatedAt = "2026-11-05T08:30:00.000Z") {
  return {
    generatedAt,
    environment: "prod",
    failedObservationCount: 0,
    objectives: [
      {
        id: "conversion-to-paid",
        observations: [{ id: "revenue-gbp", unit: "gbp", last30: { value: revenue }, last90: { value: revenue } }],
      },
    ],
  };
}

function dom(extra = {}) {
  return {
    tabs: ["main", "ops"],
    panels: [
      { id: "chartsPanel", tabs: ["main"], hidden: false, openOn: ["main"] },
      { id: "table-uptime", tabs: ["ops"], hidden: false, openOn: ["ops"] },
    ],
    rows: [],
    captures: [],
    freshness: { meta: "", age: "", ageShown: false, source: "" },
    unansweredApis: [],
    requestOrigins: [],
    abortedOrigins: [],
    ...extra,
  };
}

const SCREENSHOTS = [
  { tabId: "main", panelId: "chartsPanel", kind: "panel", captureId: null, png: Buffer.from("png-main-1") },
  { tabId: "ops", panelId: "table-uptime", kind: "panel", captureId: null, png: Buffer.from("png-ops-1") },
];

function deps(overrides = {}) {
  let now = DAY_ONE;
  return {
    readReviewData: async () => ({ snapshot: snapshot(), consoleIndex: null, images: new Map(), heldPasses: [] }),
    renderDashboard: async () => ({ dom: dom(), screenshots: SCREENSHOTS }),
    withJpegConverter: async (callback) => callback(async (png) => Buffer.concat([Buffer.from("jpeg:"), png])),
    now: () => now,
    setNow: (value) => {
      now = value;
    },
    ...overrides,
  };
}

function imageCountOf(command) {
  const body = JSON.parse(command.input.body);
  return body.messages[0].content.filter((block) => block.type === "image").length;
}

function tabOf(command) {
  const text = JSON.parse(command.input.body).messages[0].content[0].text;
  return JSON.parse(text.replace(/<\/?panel-metadata>/g, "")).tabId;
}

function modelAnswer(command, { findings = [], rows = [], extra = {} } = {}) {
  const count = imageCountOf(command);
  return {
    tabId: tabOf(command),
    injectionSuspected: false,
    images: Array.from({ length: count }, (_, index) => ({ image: index + 1, verdict: findings.length ? "finding" : "ok" })),
    findings,
    proposedRows: rows,
    ...extra,
  };
}

const MOVEMENT_FINDING = {
  image: 1,
  list: "observation",
  tag: "movement",
  finding: "Revenue fell",
  evidence: "gross 12 to 8",
  change: "Review ads",
};
const ROW = { image: 1, prefix: "MKT", title: "Review the ads", action: "Check spend against revenue." };

function serveModel({ answerFor = (command) => modelAnswer(command), guardrail = { action: "NONE", outputs: [] } } = {}) {
  sendMock.mockImplementation(async (command) => {
    if (command.kind === "guardrail") return guardrail;
    const answer = answerFor(command);
    const text = typeof answer === "string" ? answer : JSON.stringify(answer);
    return {
      body: Buffer.from(JSON.stringify({ content: [{ type: "text", text }], usage: { input_tokens: 100, output_tokens: 20 } })),
    };
  });
}

function capture() {
  const lines = [];
  return { lines, write: (text) => lines.push(text) };
}

function reviewArgs() {
  return [
    "review",
    "--public",
    path.join(REPO, "web/public"),
    "--alarms",
    path.join(sandbox, "alarms.json"),
    "--skill",
    path.join(REPO, ".claude/skills/dashboard-review/SKILL.md"),
    "--prompt",
    path.join(REPO, "prompts/dashboard-review.md"),
  ];
}

async function review(overrides = {}) {
  const out = capture();
  const dependencies = deps(overrides);
  const code = await runNightly({ argv: reviewArgs(), env, stdout: out, deps: dependencies });
  return { code, out: out.lines.join(""), lines: out.lines.map((line) => line.trimEnd()), dependencies };
}

function bundleOf() {
  const output = fs.readFileSync(env.GITHUB_OUTPUT, "utf8");
  return /^bundle=(.+)$/m.exec(output)[1];
}

async function write(bundle, privateDir, pass = PASS) {
  const bundleFile = path.join(sandbox, "bundle.txt");
  fs.writeFileSync(bundleFile, bundle);
  const out = capture();
  const code = await runNightly({
    argv: [
      "write",
      "--bundle",
      bundleFile,
      "--private",
      privateDir,
      "--skill",
      path.join(REPO, ".claude/skills/dashboard-review/SKILL.md"),
    ],
    env: { TRANSIT_PASS: pass },
    stdout: out,
  });
  return { code, lines: out.lines.map((line) => line.trimEnd()) };
}

function listFiles(dir) {
  return fs
    .readdirSync(dir, { recursive: true })
    .map(String)
    .filter((name) => fs.statSync(path.join(dir, name)).isFile())
    .sort();
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "nightly-test-"));
  fs.writeFileSync(path.join(sandbox, "alarms.json"), "[]");
  fs.writeFileSync(path.join(sandbox, "out.txt"), "");
  env = {
    TRANSIT_PASS: PASS,
    REVIEW_MODEL_ID: "eu.anthropic.claude-sonnet-5-5",
    GUARDRAIL_ID: "gr-id",
    GUARDRAIL_VERSION: "3",
    GITHUB_OUTPUT: path.join(sandbox, "out.txt"),
    LIVE_SET: "ci-set1",
    RUNNER_TEMP: sandbox,
  };
  sendMock.mockReset();
  launchMock.mockReset();
  serveModel();
});

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe("dashboard review nightly, review mode", () => {
  test("stdout holds only the fixed lines, and no model text or figure", async () => {
    serveModel({ answerFor: (command) => modelAnswer(command, { findings: [MOVEMENT_FINDING], rows: [ROW] }) });
    const { code, lines, out } = await review();
    expect(code).toBe(0);
    for (const line of lines) expect(FIXED.some((shape) => shape.test(line))).toBe(true);
    expect(lines.slice(0, 2)).toEqual(["render ok tabs=2 images=2", "judge ok batches=2 rejected=0"]);
    expect(lines.at(-1)).toBe("bundle ok");
    expect(out).not.toMatch(/Revenue|gross|Review ads|100/);
    expect(fs.readFileSync(env.GITHUB_OUTPUT, "utf8")).toMatch(/tokens-in=200\ntokens-out=40\n/);
  });

  test("each request has no tools, no sampling parameter and the configured model", async () => {
    await review();
    const calls = sendMock.mock.calls.map(([command]) => command).filter((command) => command.kind === "invoke");
    expect(calls).toHaveLength(2);
    for (const command of calls) {
      const body = JSON.parse(command.input.body);
      expect(command.input.modelId).toBe("eu.anthropic.claude-sonnet-5-5");
      expect(Object.keys(body)).not.toContain("tools");
      expect(Object.keys(body)).not.toContain("temperature");
      expect(body.messages.at(-1).role).toBe("user");
    }
  });

  test("a Bedrock error prints its exception name only", async () => {
    const error = new Error("secret message 12345 with a figure");
    error.name = "ThrottlingException";
    sendMock.mockRejectedValue(error);
    const { code, lines, out } = await review();
    expect(code).toBe(1);
    expect(lines.at(-1)).toBe("bedrock-error ThrottlingException");
    expect(out).not.toMatch(/secret|12345|figure/);
    expect(fs.readFileSync(env.GITHUB_OUTPUT, "utf8")).toBe("");
  });

  test("an exception name that is not a plain word prints as Error", async () => {
    const error = new Error("x");
    error.name = "Bad Name! ../";
    sendMock.mockRejectedValue(error);
    expect((await review()).lines.at(-1)).toBe("bedrock-error Error");
  });

  test("a failure from the render prints its fixed code and not its message", async () => {
    const refused = await review({ renderDashboard: async () => Promise.reject(new Error("refused-write")) });
    expect(refused.lines).toEqual(["refused-write"]);
    const other = await review({ renderDashboard: async () => Promise.reject(new TypeError("page text 99 with a name")) });
    expect(other.lines).toEqual(["error TypeError"]);
    const timeout = await review({ renderDashboard: async () => Promise.reject(new Error("render-timeout tab=main")) });
    expect(timeout.lines).toEqual(["render-timeout tab=main"]);
  });

  test("no snapshot fails with snapshot-missing before any model call", async () => {
    const { lines } = await review({
      readReviewData: async () => ({ snapshot: null, consoleIndex: null, images: new Map(), heldPasses: [] }),
    });
    expect(lines).toEqual(["snapshot-missing"]);
    expect(sendMock).not.toHaveBeenCalled();
  });

  test("a missing environment value fails with config-missing", async () => {
    delete env.TRANSIT_PASS;
    expect((await review()).lines).toEqual(["config-missing"]);
  });

  test("a bundle over the cap fails with answer-too-large and writes no output", async () => {
    const findings = Array.from(
      { length: 1500 },
      (_, index) => `/api/${index}/${Buffer.from(crypto.getRandomValues(new Uint8Array(900))).toString("base64")}`,
    );
    const { lines } = await review({ renderDashboard: async () => ({ dom: dom({ unansweredApis: findings }), screenshots: SCREENSHOTS }) });
    expect(lines.at(-1)).toBe("answer-too-large");
    expect(fs.readFileSync(env.GITHUB_OUTPUT, "utf8")).toBe("");
  });

  test("a rejected answer keeps no model word in the bundle", async () => {
    serveModel({
      answerFor: (command) => (tabOf(command) === "main" ? `ZEBRAWORD ${JSON.stringify(modelAnswer(command))}` : modelAnswer(command)),
    });
    const { lines } = await review();
    expect(lines[1]).toBe("judge ok batches=2 rejected=1");
    const { meta } = unpackBundle(bundleOf(), PASS);
    expect(JSON.stringify(meta)).not.toMatch(/zebra/i);
    expect(meta.batches[0]).toMatchObject({ tabId: "main", text: null, issues: [{ path: "answer", code: "not_one_json_object" }] });
  });

  test("the guardrail's text replaces the fields and the batch is marked masked", async () => {
    serveModel({
      answerFor: (command) => modelAnswer(command, { findings: [MOVEMENT_FINDING] }),
      guardrail: { action: "GUARDRAIL_INTERVENED", outputs: [{ text: "{NAME} fell\nmasked evidence\nmasked change" }] },
    });
    await review();
    const { meta } = unpackBundle(bundleOf(), PASS);
    expect(meta.batches[0].masked).toBe(true);
    expect(JSON.parse(meta.batches[0].text).findings[0].finding).toBe("{NAME} fell");
    const guardrailCall = sendMock.mock.calls.map(([command]) => command).find((command) => command.kind === "guardrail");
    expect(guardrailCall.input).toMatchObject({ guardrailIdentifier: "gr-id", guardrailVersion: "3", source: "OUTPUT" });
  });

  test("a guardrail block that does not split back drops the answer", async () => {
    serveModel({
      answerFor: (command) => modelAnswer(command, { findings: [MOVEMENT_FINDING] }),
      guardrail: { action: "GUARDRAIL_INTERVENED", outputs: [{ text: "Sorry, blocked." }] },
    });
    await review();
    const { meta } = unpackBundle(bundleOf(), PASS);
    expect(meta.batches[0]).toMatchObject({ text: null, issues: [{ path: "answer", code: "guardrail_blocked" }] });
  });

  test("only the images that a finding cites are kept, at most 12", async () => {
    const many = Array.from({ length: 15 }, (_, index) => ({
      tabId: "main",
      panelId: `panel${index}`,
      kind: "panel",
      captureId: null,
      png: Buffer.from(`p${index}`),
    }));
    serveModel({
      answerFor: (command) =>
        modelAnswer(command, {
          findings: Array.from({ length: 12 }, (_, index) => ({
            image: index + 1,
            list: "improvement",
            tag: "gap",
            finding: `Gap ${index}`,
            evidence: "seen",
            change: "Add it",
          })),
        }),
    });
    await review({ renderDashboard: async () => ({ dom: dom({ tabs: ["main"] }), screenshots: many }) });
    const { jpegs } = unpackBundle(bundleOf(), PASS);
    expect(jpegs.map((jpeg) => jpeg.file)).toEqual(Array.from({ length: 12 }, (_, index) => `main--panel${index}.jpg`));

    fs.writeFileSync(env.GITHUB_OUTPUT, "");
    serveModel({ answerFor: (command) => modelAnswer(command) });
    await review({ renderDashboard: async () => ({ dom: dom({ tabs: ["main"] }), screenshots: many }) });
    expect(unpackBundle(bundleOf(), PASS).jpegs).toHaveLength(0);
  });

  test("a refused held passes read puts a note in the bundle", async () => {
    await review({ readReviewData: async () => ({ snapshot: snapshot(), consoleIndex: null, images: new Map(), heldPasses: null }) });
    expect(unpackBundle(bundleOf(), PASS).meta.notes[0]).toMatch(/held passes panel was left out/);
  });
});

describe("dashboard review nightly, the bundle", () => {
  test("a wrong pass, a cut bundle and text that is not a bundle all fail as bundle-invalid", async () => {
    await review();
    const bundle = bundleOf();
    expect(() => unpackBundle(bundle, "another pass")).toThrow("bundle-invalid");
    expect(() => unpackBundle(bundle.slice(0, 200), PASS)).toThrow("bundle-invalid");
    expect(() => unpackBundle("not a bundle", PASS)).toThrow("bundle-invalid");
    const privateDir = path.join(sandbox, "private");
    expect((await write(bundle, privateDir, "another pass")).lines).toEqual(["bundle-invalid"]);
    expect(fs.existsSync(privateDir)).toBe(false);
  });

  test("the bundle is not readable as plain text", async () => {
    serveModel({ answerFor: (command) => modelAnswer(command, { findings: [MOVEMENT_FINDING], rows: [ROW] }) });
    await review();
    const raw = Buffer.from(bundleOf(), "base64").toString("latin1");
    expect(raw).not.toMatch(/Revenue|conversion-to-paid|chartsPanel/);
  });

  test("the cipher refuses another pass and returns the bytes for the right one", () => {
    const bytes = Buffer.from("x");
    expect(() => decryptBytes(encryptBytes(bytes, PASS), "other")).toThrow("bundle-invalid");
    expect(decryptBytes(encryptBytes(bytes, PASS), PASS).equals(bytes)).toBe(true);
  });
});

describe("dashboard review nightly, write mode", () => {
  test("writes the report and the kept images under the private path and nowhere else", async () => {
    serveModel({ answerFor: (command) => modelAnswer(command, { findings: [MOVEMENT_FINDING], rows: [ROW] }) });
    await review();
    fs.mkdirSync(path.join(sandbox, "private"));
    fs.writeFileSync(path.join(sandbox, "private", "keep.md"), "kept");
    fs.mkdirSync(path.join(sandbox, "elsewhere"));
    fs.writeFileSync(path.join(sandbox, "elsewhere", "other.txt"), "other");
    const before = listFiles(sandbox).filter((name) => !name.startsWith("private"));
    const result = await write(bundleOf(), path.join(sandbox, "private"));
    expect(result.code).toBe(0);
    expect(result.lines).toEqual(["write ok findings=2 rejected=0 images=2"]);
    const after = listFiles(sandbox);
    expect(after.filter((name) => !name.startsWith("private"))).toEqual([...before, "bundle.txt"].sort());
    expect(after.filter((name) => name.startsWith("private"))).toEqual([
      "private/keep.md",
      "private/operator/dashboard-reviews/2026-11-05-nightly/main--chartsPanel.jpg",
      "private/operator/dashboard-reviews/2026-11-05-nightly/ops--table-uptime.jpg",
      "private/operator/dashboard-reviews/REPORT_DASHBOARD_REVIEW_2026-11-05-nightly.md",
    ]);
    const report = fs.readFileSync(
      path.join(sandbox, "private/operator/dashboard-reviews/REPORT_DASHBOARD_REVIEW_2026-11-05-nightly.md"),
      "utf8",
    );
    expect(report).toContain("Revenue fell");
    expect(report).toContain("![chartsPanel](2026-11-05-nightly/main--chartsPanel.jpg)");
    expect(report).toContain("live set ci-set1");
  });

  test("the next night reads the last figures block and judges a movement", async () => {
    const privateDir = path.join(sandbox, "private");
    await review();
    await write(bundleOf(), privateDir);
    fs.writeFileSync(env.GITHUB_OUTPUT, "");
    const next = deps({
      readReviewData: async () => ({
        snapshot: snapshot(150, "2026-11-06T08:30:00.000Z"),
        consoleIndex: null,
        images: new Map(),
        heldPasses: [],
      }),
    });
    next.setNow(DAY_TWO);
    const out = capture();
    await runNightly({ argv: reviewArgs(), env, stdout: out, deps: next });
    const result = await write(bundleOf(), privateDir);
    expect(result.lines[0]).toMatch(/^write ok findings=1 /);
    const report = fs.readFileSync(
      path.join(privateDir, "operator/dashboard-reviews/REPORT_DASHBOARD_REVIEW_2026-11-06-nightly.md"),
      "utf8",
    );
    expect(report).toContain("| Revenue, gross | 150 | 100 | +50% |");
    expect(report).toContain("**MKTn. Revenue, gross moved.**");
  });

  test("the first night says it has no earlier figures", async () => {
    await review();
    await write(bundleOf(), path.join(sandbox, "private"));
    const report = fs.readFileSync(
      path.join(sandbox, "private/operator/dashboard-reviews/REPORT_DASHBOARD_REVIEW_2026-11-05-nightly.md"),
      "utf8",
    );
    expect(report).toContain("no movement is judged this run");
  });

  test("a rejected answer is rejected again in write mode and the report names the schema issue", async () => {
    serveModel({ answerFor: (command) => `ZEBRAWORD ${JSON.stringify(modelAnswer(command))}` });
    await review();
    const result = await write(bundleOf(), path.join(sandbox, "private"));
    expect(result.lines[0]).toBe("write ok findings=0 rejected=2 images=0");
    const report = fs.readFileSync(
      path.join(sandbox, "private/operator/dashboard-reviews/REPORT_DASHBOARD_REVIEW_2026-11-05-nightly.md"),
      "utf8",
    );
    expect(report).toContain("Schema issues: answer not_one_json_object.");
    expect(report).not.toMatch(/zebra/i);
  });
});

describe("dashboard review nightly, the browser profile folder", () => {
  function fakeBrowser({ failAt } = {}) {
    const dirs = [];
    launchMock.mockImplementation(async (dir) => {
      dirs.push(dir);
      fs.writeFileSync(path.join(dir, "Cookies"), "profile data");
      return {
        pages: () => [
          {
            evaluate: async () => (failAt === "evaluate" ? Promise.reject(new Error("page text")) : Buffer.from("tiny").toString("base64")),
          },
        ],
        newPage: async () => ({}),
        close: async () => {},
      };
    });
    return dirs;
  }

  test("is removed after a successful conversion", async () => {
    const dirs = fakeBrowser();
    const kept = await withJpegConverter(async (convert) => convert(Buffer.from("png")));
    expect(kept.toString()).toBe("tiny");
    expect(dirs).toHaveLength(1);
    expect(dirs[0].startsWith(os.tmpdir()) || dirs[0].startsWith(env.RUNNER_TEMP)).toBe(true);
    expect(fs.existsSync(dirs[0])).toBe(false);
  });

  test("is removed when the conversion fails", async () => {
    const dirs = fakeBrowser({ failAt: "evaluate" });
    await expect(withJpegConverter(async (convert) => convert(Buffer.from("png")))).rejects.toThrow();
    expect(fs.existsSync(dirs[0])).toBe(false);
  });

  test("is removed when the browser does not start", async () => {
    let seen;
    launchMock.mockImplementation(async (dir) => {
      seen = dir;
      fs.writeFileSync(path.join(dir, "Lock"), "x");
      throw new Error("no browser");
    });
    await expect(withJpegConverter(async () => null)).rejects.toThrow("no browser");
    expect(fs.existsSync(seen)).toBe(false);
  });

  test("a run with the real converter leaves no review folder behind in the runner's temp folder", async () => {
    fakeBrowser();
    serveModel({ answerFor: (command) => modelAnswer(command, { findings: [MOVEMENT_FINDING] }) });
    const dependencies = deps();
    delete dependencies.withJpegConverter;
    const out = capture();
    process.env.RUNNER_TEMP = sandbox;
    try {
      expect(await runNightly({ argv: reviewArgs(), env, stdout: out, deps: dependencies })).toBe(0);
    } finally {
      delete process.env.RUNNER_TEMP;
    }
    expect(fs.readdirSync(sandbox).filter((name) => name.startsWith("review-"))).toEqual([]);
  });
});
