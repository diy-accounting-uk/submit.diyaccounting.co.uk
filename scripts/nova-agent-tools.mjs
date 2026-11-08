// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/nova-agent-tools.mjs
//
// The fixed tools of scripts/nova-agent.mjs, and the submit_answer contract. The model sends
// each tool input, and a log line or a file that the model read can steer that input, so every
// guard here assumes a hostile caller. Each child runs with execFile and an allow-listed
// environment. A refusal text never repeats the input.

import { execFile } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const MAX_TOOL_RESULT_CHARS = 30000;
export const SUBMIT_ANSWER = "submit_answer";
export const DEFAULT_TOOLS = ["read_file", "grep_repo", "list_files", "aws_read"];

const CHILD_TIMEOUT_MS = 60000;
const CHILD_MAX_BUFFER_BYTES = 1024 * 1024;
const MAX_READ_BYTES = 5 * 1024 * 1024;
const SECRET_PATHSPEC = ":(exclude,glob,icase)**/.env*";
const AWS_REGIONS = ["eu-west-2", "us-east-1"];
const AWS_COMMON_FLAGS = ["--region", "--query"];
const AWS_PAGING_FLAGS = ["--max-items", "--starting-token"];
const AWS_CREDENTIAL_ENV = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "AWS_PROFILE",
];

// The aws parser accepts a unique prefix of a flag, so `--prof` reaches `--profile`. An allow
// list of whole flags closes that route, and also --cli-input-json and --endpoint-url.
export const AWS_READ_VERBS = {
  "logs describe-log-groups": ["--log-group-name-prefix", "--log-group-name-pattern", "--limit", ...AWS_PAGING_FLAGS],
  "logs filter-log-events": [
    "--log-group-name",
    "--log-group-identifier",
    "--log-stream-names",
    "--log-stream-name-prefix",
    "--start-time",
    "--end-time",
    "--filter-pattern",
    "--limit",
    ...AWS_PAGING_FLAGS,
  ],
  "logs start-query": [
    "--log-group-name",
    "--log-group-names",
    "--log-group-identifiers",
    "--start-time",
    "--end-time",
    "--query-string",
    "--limit",
  ],
  "logs get-query-results": ["--query-id"],
  "xray get-trace-summaries": ["--start-time", "--end-time", "--time-range-type", "--filter-expression", "--sampling", ...AWS_PAGING_FLAGS],
  "xray batch-get-traces": ["--trace-ids", ...AWS_PAGING_FLAGS],
  "cloudwatch describe-alarms": ["--alarm-names", "--alarm-name-prefix", "--alarm-types", "--state-value", ...AWS_PAGING_FLAGS],
  "cloudwatch describe-alarm-history": [
    "--alarm-name",
    "--history-item-type",
    "--start-date",
    "--end-date",
    "--alarm-types",
    "--scan-by",
    ...AWS_PAGING_FLAGS,
  ],
};

// Nova accepts only type, properties and required at the top level of a tool schema.
const TOOL_SPECS = {
  read_file: {
    description: "Read lines of a file that git tracks in this repository, or of a file that the prompt names.",
    properties: {
      path: { type: "string", description: "The path, relative to the repository root." },
      start_line: { type: "integer", description: "The first line to read, from 1." },
      end_line: { type: "integer", description: "The last line to read." },
    },
    required: ["path"],
  },
  grep_repo: {
    description: "Search the files that git tracks with an extended regular expression. Returns path:line:text.",
    properties: {
      pattern: { type: "string", description: "The extended regular expression." },
      path: { type: "string", description: "A file or directory to search in, relative to the repository root." },
      ignore_case: { type: "boolean", description: "True ignores case." },
    },
    required: ["pattern"],
  },
  list_files: {
    description: "List the files that git tracks.",
    properties: {
      path: { type: "string", description: "A file or directory to list, relative to the repository root." },
    },
    required: [],
  },
  aws_read: {
    description: "Run one read-only aws command with the credentials of this run. Results come back as JSON.",
    properties: {
      command: { type: "string", enum: Object.keys(AWS_READ_VERBS), description: "The aws service and operation." },
      args: {
        type: "array",
        items: { type: "string" },
        description: 'The arguments, one per item, such as ["--log-group-name", "/aws/x"].',
      },
    },
    required: ["command"],
  },
};

export const DEFAULT_FINAL_SCHEMA = {
  description: "Submit the final answer. This ends the run.",
  properties: { answer: { type: "string", description: "The final answer as GitHub-flavoured Markdown." } },
  required: ["answer"],
  render: [{ property: "answer" }],
};

class ToolRefusal extends Error {}

function refuse(reason) {
  throw new ToolRefusal(reason);
}

function matchesType(value, spec) {
  if (spec.type === "array") return Array.isArray(value) && value.every((item) => typeof item === "string");
  if (spec.type === "integer") return Number.isInteger(value);
  return typeof value === spec.type;
}

/** @returns {string|null} why the input breaks the spec, or null when it fits */
export function schemaProblem(spec, input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return "the tool input is not an object";
  for (const name of spec.required) {
    if (input[name] === undefined) return `the tool input lacks the required property ${name}`;
  }
  for (const [name, value] of Object.entries(input)) {
    const propertySpec = Object.hasOwn(spec.properties, name) ? spec.properties[name] : null;
    if (!propertySpec) return "the tool input has a property that the tool does not define";
    if (!matchesType(value, propertySpec)) return `the tool input property ${name} has the wrong type`;
    if (propertySpec.enum && !propertySpec.enum.includes(value)) return `the tool input property ${name} is not on the allowed list`;
  }
  return null;
}

export function cutToolResult(text) {
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n[The result is cut at ${MAX_TOOL_RESULT_CHARS} characters.]`;
}

function toolSpecEntry(name, { description, properties, required }) {
  return { toolSpec: { name, description, inputSchema: { json: { type: "object", properties, required } } } };
}

/** The Converse toolConfig tools: the named read tools, then submit_answer. */
export function toolSpecs(toolNames, finalSchema) {
  const readTools = toolNames.map((name) => {
    if (!Object.hasOwn(TOOL_SPECS, name)) throw new Error("the tools setting names a tool that is not on the fixed list");
    return toolSpecEntry(name, TOOL_SPECS[name]);
  });
  return [...readTools, toolSpecEntry(SUBMIT_ANSWER, finalSchema)];
}

/**
 * Reads a final schema file and proves that its render list covers each property once. A render
 * entry with `hidden: true` names a property that the model fills and the runner never renders.
 */
export function loadFinalSchema(schemaPath) {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const entries = schema.render ?? [];
  const rendered = entries.map((entry) => entry.property).sort();
  const defined = Object.keys(schema.properties ?? {}).sort();
  if (typeof schema.description !== "string" || !Array.isArray(schema.required) || rendered.join() !== defined.join()) {
    throw new Error("the final schema needs a description, required, and one render entry for each property");
  }
  for (const entry of entries) {
    if (entry.lead === undefined) continue;
    const { from, true: whenTrue, false: whenFalse } = entry.lead;
    if (schema.properties?.[from]?.type !== "boolean") {
      throw new Error(`the lead of the render entry ${entry.property} names ${from}, which is not a boolean property`);
    }
    if (typeof whenTrue !== "string" || typeof whenFalse !== "string" || !entry.heading) {
      throw new Error(`the lead of the render entry ${entry.property} needs a heading and a true and a false sentence`);
    }
  }
  return schema;
}

function stripOuterFence(text) {
  const fenced = text.match(/^```[a-z]*\n([\s\S]*?)\n?```$/);
  return fenced ? fenced[1] : text;
}

function renderEntry(entry, value, input) {
  if (entry.fence) {
    const body = stripOuterFence(value);
    if (/^```/m.test(body)) refuse(`the property ${entry.property} holds a code fence line`);
    return `\`\`\`${entry.fence}\n${body}\n\`\`\``;
  }
  if (entry.prefix !== undefined) {
    if (value.includes("\n")) refuse(`the property ${entry.property} must be one line`);
    return `${entry.prefix}${value}`;
  }
  if (entry.lead) return `${entry.heading}\n\n${input[entry.lead.from] === true ? entry.lead.true : entry.lead.false} ${value}`;
  return entry.heading ? `${entry.heading}\n\n${value}` : value;
}

/**
 * Renders a submit_answer input with the headings that the schema names.
 * @returns {{status: "ok"|"refused", text: string}}
 */
export function renderAnswer(finalSchema, input) {
  const problem = schemaProblem(finalSchema, input);
  if (problem) return { status: "refused", text: problem };
  const broken = (finalSchema.rules ?? []).find(
    (rule) =>
      Object.entries(rule.when).every(([name, value]) => input[name] === value) &&
      !Object.entries(rule.require).every(([name, value]) => input[name] === value),
  );
  if (broken) return { status: "refused", text: broken.refusal };
  try {
    const parts = [];
    for (const entry of finalSchema.render) {
      if (entry.hidden === true) continue;
      const value = stripThinking(input[entry.property] ?? "");
      if (value.length > 0) parts.push(renderEntry(entry, value, input));
      else if (finalSchema.required.includes(entry.property)) refuse(`the required property ${entry.property} is empty`);
    }
    return { status: "ok", text: parts.join("\n\n") };
  } catch (error) {
    if (error instanceof ToolRefusal) return { status: "refused", text: error.message };
    throw error;
  }
}

export function stripThinking(text) {
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, "")
    .replace(/<thinking>[\s\S]*$/, "")
    .trim();
}

function pickEnv(names) {
  return Object.fromEntries(names.filter((name) => process.env[name] !== undefined).map((name) => [name, process.env[name]]));
}

// These lists replace the environment, so a GitHub token or a key in the step never reaches a
// child. The git settings keep any machine-wide configuration out of the run.
export function gitChildEnv() {
  return { ...pickEnv(["PATH", "LANG"]), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_OPTIONAL_LOCKS: "0" };
}

export function awsChildEnv() {
  return { ...pickEnv(["PATH", "HOME", "LANG", ...AWS_CREDENTIAL_ENV]), AWS_PAGER: "" };
}

/** @returns {Promise<{code: number, stdout: string, stderr: string, cut: boolean}>} */
export async function runChild(file, args, { cwd, env, timeoutMs }) {
  try {
    const options = { cwd, env, timeout: timeoutMs, maxBuffer: CHILD_MAX_BUFFER_BYTES, encoding: "utf8" };
    const { stdout, stderr } = await execFileAsync(file, args, options);
    return { code: 0, stdout, stderr, cut: false };
  } catch (error) {
    return {
      code: Number.isInteger(error.code) ? error.code : -1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      cut: error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
    };
  }
}

function hasBlockedComponent(relativePath) {
  return relativePath.split(/[\\/]/).some((part) => {
    const lower = part.toLowerCase();
    return lower === ".git" || lower.startsWith(".env");
  });
}

function isOutside(relativePath) {
  return relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath);
}

function repoRelative(repoRoot, requestedPath) {
  if (requestedPath.includes("\0")) refuse("the path is not valid");
  const relativePath = relative(repoRoot, resolve(repoRoot, requestedPath));
  if (isOutside(relativePath)) refuse("the path is outside the repository");
  if (hasBlockedComponent(relativePath)) refuse("the path is blocked");
  return relativePath;
}

function literalPathspec(repoRoot, requestedPath) {
  if (requestedPath === undefined) return [];
  const relativePath = repoRelative(repoRoot, requestedPath);
  return relativePath === "" ? [] : [`:(literal)${relativePath}`];
}

function selectLines(text, startLine, endLine) {
  if (startLine === undefined && endLine === undefined) return text;
  const lines = text.split("\n");
  return lines.slice(Math.max((startLine ?? 1) - 1, 0), endLine ?? lines.length).join("\n");
}

function readRegularFile(filePath) {
  let stats;
  try {
    stats = statSync(filePath);
  } catch {
    refuse("the file does not exist");
  }
  if (!stats.isFile()) refuse("the path is not a file");
  if (stats.size > MAX_READ_BYTES) refuse("the file is too large");
  return readFileSync(filePath, "utf8");
}

function validateAwsArgs(command, args) {
  const allowedFlags = [...AWS_READ_VERBS[command], ...AWS_COMMON_FLAGS];
  args.forEach((arg, index) => {
    const value = arg.includes("=") && arg.startsWith("-") ? arg.slice(arg.indexOf("=") + 1) : arg;
    if (/^(file|fileb|https?):\/\//i.test(value)) refuse("the aws argument loads a file or a URL");
    if (!arg.startsWith("-")) return;
    const flag = arg.split("=")[0];
    if (!allowedFlags.includes(flag)) refuse("the aws flag is not on the allowed list");
    if (flag === "--region" && !AWS_REGIONS.includes(arg.includes("=") ? value : args[index + 1]))
      refuse("the aws region is not on the allowed list");
  });
}

/**
 * Makes a `child` for createToolRunner that answers each `aws` call from frozen results and
 * sends every other program to runChild. A frozen entry is `{command, contains?, result}`:
 * `command` is the aws service and verb, such as "logs filter-log-events", `contains` is a
 * list of strings that must all appear in the call's arguments, and `result` is the text that
 * the call returns. The first entry that fits wins. A call that fits no entry returns no output.
 * @param {{command: string, contains?: string[], result: string}[]} frozen
 */
export function createReplayChild(frozen, realChild = runChild) {
  return async function replayChild(file, args, options) {
    if (file !== "aws") return realChild(file, args, options);
    const command = args.slice(0, 2).join(" ");
    const rest = args.slice(2).join(" ");
    const entry = frozen.find((item) => item.command === command && (item.contains ?? []).every((part) => rest.includes(part)));
    return { code: 0, stdout: entry ? entry.result : "", stderr: "", cut: false };
  };
}

/**
 * Makes the tool dispatcher for one run.
 * @param {{repoRoot: string, inputFiles?: string[], child?: typeof runChild}} options
 *   inputFiles are the paths outside git that read_file may open.
 * @returns {(name: string, input: object, limits?: {timeoutMs?: number}) => Promise<{status: "ok"|"refused", text: string}>}
 */
export function createToolRunner({ repoRoot, inputFiles = [], child = runChild }) {
  const root = realpathSync(repoRoot);
  const namedInputs = inputFiles.map((file) => resolve(root, file));

  const git = (args, timeoutMs) => child("git", args, { cwd: root, env: gitChildEnv(), timeoutMs });

  async function readTracked(requestedPath, timeoutMs) {
    const relativePath = repoRelative(root, requestedPath);
    let realPath;
    try {
      realPath = realpathSync(resolve(root, relativePath));
    } catch {
      refuse("the file does not exist");
    }
    const realRelative = relative(root, realPath);
    if (isOutside(realRelative) || hasBlockedComponent(realRelative)) refuse("the path is blocked");
    const tracked = await git(["ls-files", "--error-unmatch", "--", `:(literal)${relativePath}`], timeoutMs);
    if (tracked.code !== 0) refuse("git does not track the file");
    return readRegularFile(realPath);
  }

  const tools = {
    async read_file({ path, start_line: startLine, end_line: endLine }, timeoutMs) {
      if (path.includes("\0")) refuse("the path is not valid");
      const namedInput = namedInputs.includes(resolve(root, path));
      const text = namedInput ? readRegularFile(resolve(root, path)) : await readTracked(path, timeoutMs);
      return selectLines(text, startLine, endLine);
    },

    async grep_repo({ pattern, path, ignore_case: ignoreCase }, timeoutMs) {
      const pathspec = [...literalPathspec(root, path), SECRET_PATHSPEC];
      const caseFlag = ignoreCase ? ["-i"] : [];
      const result = await git(["grep", "-n", "-I", "-E", "--no-color", ...caseFlag, "-e", pattern, "--", ...pathspec], timeoutMs);
      if (result.code === 1 && result.stdout === "") return "No matches.";
      if (result.code !== 0 && !result.cut) refuse("git grep failed; check the regular expression");
      return result.stdout;
    },

    async list_files({ path }, timeoutMs) {
      const result = await git(["ls-files", "--", ...literalPathspec(root, path), SECRET_PATHSPEC], timeoutMs);
      if (result.code !== 0 && !result.cut) refuse("git ls-files failed");
      return result.stdout || "No files.";
    },

    async aws_read({ command, args = [] }, timeoutMs) {
      validateAwsArgs(command, args);
      const argv = [...command.split(" "), ...args, "--output", "json", "--no-cli-pager"];
      const result = await child("aws", argv, { cwd: root, env: awsChildEnv(), timeoutMs });
      if (result.code !== 0 && !result.cut) refuse(`aws failed with exit code ${result.code}: ${result.stderr}`);
      return result.stdout || "The command returned no output.";
    },
  };

  return async function runTool(name, input, { timeoutMs = CHILD_TIMEOUT_MS } = {}) {
    if (!Object.hasOwn(tools, name)) return { status: "refused", text: "The tool is not on the fixed list." };
    const problem = schemaProblem(TOOL_SPECS[name], input);
    if (problem) return { status: "refused", text: `Refused: ${problem}.` };
    try {
      const text = await tools[name](input, Math.min(timeoutMs, CHILD_TIMEOUT_MS));
      return { status: "ok", text: cutToolResult(text.length > 0 ? text : "The result is empty.") };
    } catch (error) {
      if (error instanceof ToolRefusal) return { status: "refused", text: cutToolResult(`Refused: ${error.message}.`) };
      return { status: "refused", text: "Refused: the tool failed." };
    }
  };
}
