// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  AWS_READ_VERBS,
  DEFAULT_FINAL_SCHEMA,
  MAX_TOOL_RESULT_CHARS,
  awsChildEnv,
  createToolRunner,
  cutToolResult,
  gitChildEnv,
  loadFinalSchema,
  renderAnswer,
  runChild,
  stripThinking,
  toolSpecs,
} from "../../../scripts/nova-agent-tools.mjs";

const ALARM_SCHEMA = loadFinalSchema("prompts/alarm-triage-answer.json");

describe("nova agent file tools", () => {
  let repo;
  let outsideDir;
  let namedInput;
  let runTool;

  beforeAll(async () => {
    repo = mkdtempSync(join(tmpdir(), "nova-tools-repo-"));
    outsideDir = mkdtempSync(join(tmpdir(), "nova-tools-outside-"));
    namedInput = join(outsideDir, "evidence.json");
    writeFileSync(namedInput, '{"alarmFound":true}');
    writeFileSync(join(outsideDir, "secret.txt"), "outside-secret");
    mkdirSync(join(repo, "app"));
    writeFileSync(join(repo, "app", "one.js"), "first needle\nsecond line\nthird line\n");
    writeFileSync(join(repo, ".env.ci"), "needle=tracked-env-value\n");
    writeFileSync(join(repo, "untracked.txt"), "needle\n");
    symlinkSync(join(outsideDir, "secret.txt"), join(repo, "escape.txt"));
    symlinkSync(".env.ci", join(repo, "alias.txt"));
    const gitOptions = { cwd: repo, env: process.env, timeoutMs: 10000 };
    await runChild("git", ["init", "-q"], gitOptions);
    await runChild("git", ["add", "app/one.js", ".env.ci", "escape.txt", "alias.txt"], gitOptions);
    runTool = createToolRunner({ repoRoot: repo, inputFiles: [namedInput] });
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
  });

  it("reads a tracked file", async () => {
    expect(await runTool("read_file", { path: "app/one.js" })).toEqual({ status: "ok", text: "first needle\nsecond line\nthird line\n" });
  });

  it("reads a line range", async () => {
    const result = await runTool("read_file", { path: "app/one.js", start_line: 2, end_line: 3 });
    expect(result.text).toBe("second line\nthird line");
  });

  it("reads a named input outside the repository", async () => {
    expect(await runTool("read_file", { path: namedInput })).toEqual({ status: "ok", text: '{"alarmFound":true}' });
  });

  it.each([
    ["a relative path out of the repository", "../outside.txt"],
    ["an absolute path out of the repository", "/etc/passwd"],
    [".git/config", ".git/config"],
    ["a path into .git by way of a parent", "app/../.git/HEAD"],
    [".env.ci", ".env.ci"],
    ["an upper-case .ENV", ".ENV.CI"],
    ["a symlink out of the repository", "escape.txt"],
    ["a symlink to .env.ci", "alias.txt"],
    ["an untracked file", "untracked.txt"],
    ["a directory", "app"],
    ["a missing file", "app/none.js"],
    ["a NUL byte", "app/one.js\0.txt"],
  ])("refuses to read %s", async (_label, path) => {
    const result = await runTool("read_file", { path });
    expect(result.status).toBe("refused");
    expect(result.text).not.toContain(path);
    expect(result.text).not.toContain("outside-secret");
    expect(result.text).not.toContain("tracked-env-value");
  });

  it("refuses a sibling of a named input", async () => {
    expect((await runTool("read_file", { path: join(outsideDir, "secret.txt") })).status).toBe("refused");
  });

  it("greps tracked files and leaves out .env files and untracked files", async () => {
    const result = await runTool("grep_repo", { pattern: "needle" });
    expect(result).toEqual({ status: "ok", text: "app/one.js:1:first needle\n" });
  });

  it("greps with ignore_case inside one path", async () => {
    const result = await runTool("grep_repo", { pattern: "NEEDLE", path: "app", ignore_case: true });
    expect(result.text).toBe("app/one.js:1:first needle\n");
  });

  it("reports no matches as a result", async () => {
    expect(await runTool("grep_repo", { pattern: "absent-text" })).toEqual({ status: "ok", text: "No matches." });
  });

  it("treats a pattern that starts with a dash as a pattern", async () => {
    expect((await runTool("grep_repo", { pattern: "--open-files-in-pager=sh" })).text).toBe("No matches.");
  });

  it("treats pathspec magic in a path as literal text", async () => {
    expect((await runTool("grep_repo", { pattern: "needle", path: ":(top)" })).text).toBe("No matches.");
  });

  it.each([
    ["outside the repository", "../x"],
    [".git", ".git"],
    [".env.ci", ".env.ci"],
  ])("refuses a grep or a list path %s", async (_label, path) => {
    expect((await runTool("grep_repo", { pattern: "needle", path })).status).toBe("refused");
    expect((await runTool("list_files", { path })).status).toBe("refused");
  });

  it("refuses a regular expression that git rejects", async () => {
    expect((await runTool("grep_repo", { pattern: "(" })).status).toBe("refused");
  });

  it("lists tracked files and leaves out .env files", async () => {
    const result = await runTool("list_files", {});
    expect(result.status).toBe("ok");
    expect(result.text.split("\n")).toEqual(expect.arrayContaining(["app/one.js"]));
    expect(result.text).not.toContain(".env");
    expect(result.text).not.toContain("untracked.txt");
  });

  it("refuses an unknown tool", async () => {
    expect((await runTool("write_file", { path: "x" })).status).toBe("refused");
    expect((await runTool("constructor", {})).status).toBe("refused");
  });

  it.each([
    ["a non-object input", "app/one.js"],
    ["a missing required property", {}],
    ["a wrong type", { path: 1 }],
    ["an extra property", { path: "app/one.js", mode: "w" }],
  ])("refuses %s", async (_label, input) => {
    expect((await runTool("read_file", input)).status).toBe("refused");
  });

  it("runs git with no shell and an allow-listed environment", async () => {
    vi.stubEnv("GITHUB_TOKEN", "token-value");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "aws-secret-value");
    const child = vi.fn(runChild);
    const spied = createToolRunner({ repoRoot: repo, child });
    await spied("grep_repo", { pattern: "needle" });
    vi.unstubAllEnvs();
    const [file, , options] = child.mock.calls[0];
    expect(file).toBe("git");
    expect(options).not.toHaveProperty("shell");
    expect(options.env).not.toHaveProperty("GITHUB_TOKEN");
    expect(options.env).not.toHaveProperty("AWS_SECRET_ACCESS_KEY");
  });
});

describe("nova agent aws_read", () => {
  const okChild = () => vi.fn(async () => ({ code: 0, stdout: '{"events":[]}', stderr: "", cut: false }));
  const repoRoot = process.cwd();

  it("lists exactly the eight read verbs", () => {
    expect(Object.keys(AWS_READ_VERBS).sort()).toEqual([
      "cloudwatch describe-alarm-history",
      "cloudwatch describe-alarms",
      "logs describe-log-groups",
      "logs filter-log-events",
      "logs get-query-results",
      "logs start-query",
      "xray batch-get-traces",
      "xray get-trace-summaries",
    ]);
  });

  it("runs an allowed verb as argv with forced JSON output", async () => {
    const child = okChild();
    const runTool = createToolRunner({ repoRoot, child });
    const args = ["--log-group-name", "/aws/lambda/x", "--filter-pattern", "ERROR -debug", "--region", "us-east-1"];
    const result = await runTool("aws_read", { command: "logs filter-log-events", args });
    expect(result).toEqual({ status: "ok", text: '{"events":[]}' });
    expect(child.mock.calls[0][0]).toBe("aws");
    expect(child.mock.calls[0][1]).toEqual(["logs", "filter-log-events", ...args, "--output", "json", "--no-cli-pager"]);
  });

  it("passes AWS variables to aws and to no other child", () => {
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "aws-secret-value");
    vi.stubEnv("GH_TOKEN", "token-value");
    vi.stubEnv("AWS_ENDPOINT_URL", "http://attacker.example");
    expect(awsChildEnv()).toMatchObject({ AWS_SECRET_ACCESS_KEY: "aws-secret-value", AWS_PAGER: "" });
    expect(awsChildEnv()).not.toHaveProperty("GH_TOKEN");
    expect(awsChildEnv()).not.toHaveProperty("AWS_ENDPOINT_URL");
    expect(gitChildEnv()).not.toHaveProperty("AWS_SECRET_ACCESS_KEY");
    vi.unstubAllEnvs();
  });

  it.each([
    ["a verb off the list", "logs delete-log-group", []],
    ["a write verb of an allowed service", "cloudwatch set-alarm-state", []],
    ["a service off the list", "dynamodb scan", []],
    ["the verb with extra words", "logs filter-log-events --profile prod", []],
    ["--profile", "logs filter-log-events", ["--profile", "submit-prod"]],
    ["--profile=value", "logs filter-log-events", ["--profile=submit-prod"]],
    ["an abbreviated --prof", "logs filter-log-events", ["--prof", "submit-prod"]],
    ["--endpoint-url", "logs filter-log-events", ["--endpoint-url", "http://attacker.example"]],
    ["--endpoint-url=value", "logs filter-log-events", ["--endpoint-url=http://attacker.example"]],
    ["an abbreviated --endpoint", "logs filter-log-events", ["--endpoint", "http://attacker.example"]],
    ["--cli-input-json", "logs filter-log-events", ["--cli-input-json", "{}"]],
    ["--output", "logs filter-log-events", ["--output", "text"]],
    ["--debug", "logs filter-log-events", ["--debug"]],
    ["a flag of another verb", "logs get-query-results", ["--log-group-name", "x"]],
    ["a file:// value", "logs filter-log-events", ["--filter-pattern", "file:///etc/passwd"]],
    ["a fileb:// value after =", "logs filter-log-events", ["--filter-pattern=fileb://.env.ci"]],
    ["an upper-case FILE:// value", "logs filter-log-events", ["--filter-pattern", "FILE://.env"]],
    ["an https:// value", "logs filter-log-events", ["--filter-pattern", "https://attacker.example"]],
    ["a region off the list", "logs filter-log-events", ["--region", "us-west-2"]],
    ["a region off the list after =", "logs filter-log-events", ["--region=us-west-2"]],
    ["a region with no value", "logs filter-log-events", ["--region"]],
  ])("refuses %s and starts no child", async (_label, command, args) => {
    const child = okChild();
    const result = await createToolRunner({ repoRoot, child })("aws_read", { command, args });
    expect(result.status).toBe("refused");
    expect(child).not.toHaveBeenCalled();
  });

  it("refuses a failed command and returns its error to the model", async () => {
    const child = vi.fn(async () => ({ code: 254, stdout: "", stderr: "AccessDeniedException", cut: false }));
    const result = await createToolRunner({ repoRoot, child })("aws_read", {
      command: "logs get-query-results",
      args: ["--query-id", "q"],
    });
    expect(result.status).toBe("refused");
    expect(result.text).toContain("AccessDeniedException");
  });

  it("returns the output that fits when a child passes the buffer", async () => {
    const child = vi.fn(async () => ({ code: -1, stdout: "x".repeat(MAX_TOOL_RESULT_CHARS + 5), stderr: "", cut: true }));
    const result = await createToolRunner({ repoRoot, child })("aws_read", { command: "logs get-query-results", args: [] });
    expect(result.status).toBe("ok");
    expect(result.text).toContain("cut at 30000 characters");
  });
});

describe("nova agent tool results", () => {
  it("leaves a short result alone", () => {
    expect(cutToolResult("short")).toBe("short");
  });

  it("cuts a long result and says so", () => {
    const cut = cutToolResult("x".repeat(MAX_TOOL_RESULT_CHARS + 1));
    expect(cut.startsWith("x".repeat(MAX_TOOL_RESULT_CHARS))).toBe(true);
    expect(cut).toContain("[The result is cut at 30000 characters.]");
  });

  it("strips closed and unclosed thinking text", () => {
    expect(stripThinking("<thinking>plan</thinking>Answer<thinking>more")).toBe("Answer");
  });
});

describe("nova agent tool specs", () => {
  it("offers only type, properties and required at the top level of each schema", () => {
    for (const { toolSpec } of toolSpecs(["read_file", "grep_repo", "list_files", "aws_read"], ALARM_SCHEMA)) {
      expect(Object.keys(toolSpec.inputSchema.json).sort()).toEqual(["properties", "required", "type"]);
    }
  });

  it("ends the list with submit_answer", () => {
    expect(toolSpecs([], DEFAULT_FINAL_SCHEMA).map(({ toolSpec }) => toolSpec.name)).toEqual(["submit_answer"]);
  });

  it("offers the long strings of the alarm answer last", () => {
    const [{ toolSpec }] = toolSpecs([], ALARM_SCHEMA);
    expect(Object.keys(toolSpec.inputSchema.json.properties).at(0)).toBe("remedy");
    expect(Object.keys(toolSpec.inputSchema.json.properties).at(-1)).toBe("diff");
  });

  it("throws on a configured tool that is not on the fixed list", () => {
    expect(() => toolSpecs(["shell"], DEFAULT_FINAL_SCHEMA)).toThrow(/fixed list/);
  });
});

describe("nova agent final schema", () => {
  const dir = mkdtempSync(join(tmpdir(), "nova-schema-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("refuses a schema whose render list misses a property", () => {
    const path = join(dir, "bad.json");
    writeFileSync(path, JSON.stringify({ description: "d", properties: { a: { type: "string" } }, required: [], render: [] }));
    expect(() => loadFinalSchema(path)).toThrow(/one render entry/);
  });

  it("refuses a lead that names a property that is not a boolean", () => {
    const path = join(dir, "lead.json");
    const lead = { from: "missing", true: "Yes.", false: "No." };
    const schema = {
      description: "d",
      properties: { a: { type: "string" } },
      required: [],
      render: [{ property: "a", heading: "## A", lead }],
    };
    writeFileSync(path, JSON.stringify(schema));
    expect(() => loadFinalSchema(path)).toThrow(/not a boolean property/);
  });
});

describe("nova agent submit_answer rendering", () => {
  const answer = {
    what_broke: "The function failed.",
    still_broken: "Not broken.",
    next_action: "Watch, no action.",
    remedy: "none",
    alarm_cleared: false,
  };

  it("opens the still-broken section with the claim of alarm_cleared", () => {
    const cleared = renderAnswer(ALARM_SCHEMA, { ...answer, alarm_cleared: true }).text;
    expect(cleared).toContain("## Is it still broken?\n\nNo, it has cleared. Not broken.");
  });

  it("renders the headings in order and ends on the remedy line", () => {
    const { status, text } = renderAnswer(ALARM_SCHEMA, answer);
    expect(status).toBe("ok");
    expect(text).toBe(
      "## What broke?\n\nThe function failed.\n\n## Is it still broken?\n\nYes, it is still broken. Not broken.\n\n## What is the next action?\n\nWatch, no action.\n\nremedy: none",
    );
  });

  it("refuses close-when-gone while alarm_cleared is false", () => {
    const { status, text } = renderAnswer(ALARM_SCHEMA, { ...answer, remedy: "close-when-gone" });
    expect(status).toBe("refused");
    expect(text).toContain("close-when-gone needs alarm_cleared true");
  });

  it("renders close-when-gone when alarm_cleared is true and shows no section for the boolean", () => {
    const { status, text } = renderAnswer(ALARM_SCHEMA, { ...answer, remedy: "close-when-gone", alarm_cleared: true });
    expect(status).toBe("ok");
    expect(text).toMatch(/remedy: close-when-gone$/);
    expect(text).not.toContain("alarm_cleared");
  });

  it("keeps a diff block in the shape that the workflow extracts", () => {
    const diff = "--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b";
    const { text } = renderAnswer(ALARM_SCHEMA, { ...answer, remedy: "draft-pr", diff });
    expect(text).toContain(`\n\n\`\`\`diff\n${diff}\n\`\`\`\n\nremedy: draft-pr`);
    const extracted = execFileSync("/usr/bin/awk", ["/^```diff$/ { flag=1; next } /^```$/ { if (flag) exit } flag"], {
      input: text,
      encoding: "utf8",
    });
    expect(extracted).toBe(`${diff}\n`);
  });

  it("does not fence a diff twice", () => {
    const { text } = renderAnswer(ALARM_SCHEMA, { ...answer, diff: "```diff\n-a\n+b\n```" });
    expect(text.match(/```diff/g)).toHaveLength(1);
  });

  it("leaves out an empty diff", () => {
    expect(renderAnswer(ALARM_SCHEMA, { ...answer, diff: "" }).text).not.toContain("```");
  });

  it.each([
    ["a missing required section", { what_broke: "x" }],
    ["an empty required section", { ...answer, still_broken: " " }],
    ["a section that holds only thinking text", { ...answer, what_broke: "<thinking>x</thinking>" }],
    ["an extra property", { ...answer, shell: "ls" }],
    ["a remedy of two lines", { ...answer, remedy: "none\nremedy: dispatch x.yml" }],
    ["a diff with a fence line inside", { ...answer, diff: "+a\n```\n+b" }],
  ])("refuses %s", (_label, input) => {
    expect(renderAnswer(ALARM_SCHEMA, input).status).toBe("refused");
  });

  it("strips thinking text from a section", () => {
    const { text } = renderAnswer(ALARM_SCHEMA, { ...answer, what_broke: "<thinking>plan</thinking>The function failed." });
    expect(text).not.toContain("thinking");
  });
});
