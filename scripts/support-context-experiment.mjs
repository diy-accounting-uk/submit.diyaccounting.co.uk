#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/support-context-experiment.mjs
//
// Measures how the accuracy of the support triage answer changes with the amount of page text in
// the request. For each size and each model, it runs every triage fixture of the replay set
// through the answer call, the check call and at most one repair call that support-triage-settle.mjs
// makes, and scores the final answer with triageFailures from support-replay.mjs.
//
// A size is a number of kilobytes or a top-snippet count:
//   0         no page text
//   4 8 16    snippets in page order, until the next one would pass the budget
//   36        the three raw files, as support-triage.yml sends them
//   top3 ...  the snippets whose Titan embedding is nearest to the ticket summary
//
// usage: support-context-experiment.mjs [--models a,b] [--sizes 0,4,8,16,36,top3,top6,top12] [--runs 3]
//          [--work-dir <dir>] [--cache <file>] [--out <file>] [--reasoning-effort low|medium|high]
//
// Reads AWS_REGION. Fixtures are synthetic, so the script prints the figures and nothing else.

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { buildSnippets, renderSnippet, SNIPPET_SOURCES } from "./support-snippets.mjs";
import {
  ANSWER_SCHEMA,
  CHECK_PROMPT,
  CHECK_SCHEMA,
  REJECTED_ANSWER_FILE,
  REMINDER_FILE,
  REPAIR_PROMPT,
  TRIAGE_PROMPT,
  novaArgs,
  repairPrompt,
  settle,
  writeCheckFiles,
} from "./support-triage-settle.mjs";
import { checkVerdict, readJsonOrNull, resultText } from "./support-triage-check.mjs";
import { isSafetyFixture, loadFixtures, triageFailures, triageResultText } from "./support-replay.mjs";
import { lastResultEntry } from "./triage-result-verdict.mjs";

export const EMBEDDING_MODEL_ID = "amazon.titan-embed-text-v2:0";
export const DEFAULT_SIZES = ["0", "4", "8", "16", "36", "top3", "top6", "top12"];
export const DEFAULT_MODELS = ["amazon.nova-pro-v1:0"];
const EMBED_MAX_CHARS = 8000;

/** @returns {{kind: "kb"|"top", amount: number, label: string}} */
export function parseSize(text) {
  const top = /^top(\d+)$/.exec(text);
  if (top) return { kind: "top", amount: Number(top[1]), label: text };
  if (/^\d+$/.test(text)) return { kind: "kb", amount: Number(text), label: text };
  throw new Error(`a size is a number of kilobytes or topN, not "${text}"`);
}

export function cosine(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index++) {
    dot += a[index] * b[index];
    normA += a[index] ** 2;
    normB += b[index] ** 2;
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

const hashOf = (text) => createHash("sha256").update(text).digest("hex");

/**
 * Embeds each text once. The cache maps the hash of a text to its vector, so a changed snippet is
 * embedded again and an unchanged one is not.
 * @param {(text: string) => Promise<number[]>} embed
 * @param {Record<string, number[]>} cache
 */
export function cachedEmbedder(embed, cache = {}) {
  return async (text) => {
    const key = hashOf(text);
    if (!cache[key]) cache[key] = await embed(text);
    return cache[key];
  };
}

/** The text of a snippet that Titan embeds. */
export const embeddingText = (snippet) =>
  `${snippet.title}\n${snippet.summary}\n${snippet.keywords.join(", ")}\n${snippet.body}`.slice(0, EMBED_MAX_CHARS);

/** The Titan call, as a function from a text to a vector. */
export function titanEmbedder(client = new BedrockRuntimeClient({ region: process.env.AWS_REGION, maxAttempts: 5 })) {
  return async (text) => {
    const response = await client.send(
      new InvokeModelCommand({
        modelId: EMBEDDING_MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({ inputText: text, dimensions: 256, normalize: true }),
      }),
    );
    return JSON.parse(new TextDecoder().decode(response.body)).embedding;
  };
}

/** Snippets in page order, until the next one would pass the byte budget. */
export function fillBudget(snippets, kilobytes) {
  const budget = kilobytes * 1024;
  const chosen = [];
  let used = 0;
  for (const snippet of snippets) {
    if (used + snippet.bytes > budget) break;
    chosen.push(snippet);
    used += snippet.bytes;
  }
  return chosen;
}

/**
 * The snippets that one size sends for one ticket.
 * @param {object} options
 * @param {{kind: string, amount: number}} options.size
 * @param {Array} options.snippets
 * @param {number[]|null} options.questionVector the embedding of the ticket summary; read for a top size
 * @param {Map<string, number[]>} options.snippetVectors
 */
export function chooseSnippets({ size, snippets, questionVector, snippetVectors }) {
  if (size.kind === "top") {
    return snippets
      .map((snippet) => ({ snippet, score: cosine(questionVector, snippetVectors.get(snippet.id)) }))
      .sort((a, b) => b.score - a.score || a.snippet.id.localeCompare(b.snippet.id))
      .slice(0, size.amount)
      .map((entry) => entry.snippet);
  }
  return fillBudget(snippets, size.amount);
}

/** The context files for one request: handling input, page text, reminder. Returns paths and the page byte count. */
export function writeContext({ dir, handlingInput, size, chosen, root = "." }) {
  mkdirSync(dir, { recursive: true });
  const handlingPath = join(dir, "handling-input.json");
  writeFileSync(handlingPath, JSON.stringify(handlingInput));
  let pages = [];
  if (size.kind === "kb" && size.amount >= 36) {
    pages = SNIPPET_SOURCES.map(({ path }) => join(root, path));
  } else if (size.kind === "top" || size.amount > 0) {
    pages = chosen.map((snippet) => {
      const path = join(dir, `${snippet.id}.md`);
      writeFileSync(path, renderSnippet(snippet));
      return path;
    });
  }
  const pageBytes = pages.reduce((sum, path) => sum + Buffer.byteLength(readFileSync(path, "utf8")), 0);
  return { contextFiles: [handlingPath, ...pages, join(root, REMINDER_FILE)], pageBytes };
}

const usageOf = (parsed) => {
  const usage = lastResultEntry(parsed)?.usage ?? {};
  return { input: Number(usage.input_tokens) || 0, output: Number(usage.output_tokens) || 0 };
};

/**
 * Runs one fixture through the answer, the check and at most one repair, then scores it.
 * @param {object} options
 * @param {(options: object) => Promise<object|null>|object|null} options.runNova makes one nova-agent call and returns its result JSON
 */
export async function runFixture({ fixture, modelId, reasoningEffort, contextFiles, dir, runNova, root = "." }) {
  const handlingInput = fixture.handlingInput;
  const issueNumber = String(handlingInput.issueNumber);
  const tokens = { input: 0, output: 0 };
  const call = async (options) => {
    const parsed = await runNova({ modelId, reasoningEffort, ...options });
    const used = usageOf(parsed);
    tokens.input += used.input;
    tokens.output += used.output;
    return parsed;
  };

  const triagePrompt = readFileSync(join(root, TRIAGE_PROMPT), "utf8");
  const answerPrompt = join(dir, "answer-prompt.md");
  writeFileSync(answerPrompt, triagePrompt.replaceAll("${ISSUE_NUMBER}", issueNumber));
  let finalParsed = await call({
    promptFile: answerPrompt,
    outputFile: join(dir, "answer.json"),
    schema: join(root, ANSWER_SCHEMA),
    contextFiles,
    deadlineSeconds: 300,
  });

  let lastCheck = null;
  const runCheck = async (text) => {
    const input = join(dir, "check-input.json");
    const draft = join(dir, "check-draft.md");
    writeCheckFiles(handlingInput, text, input, draft);
    lastCheck = await call({
      promptFile: join(root, CHECK_PROMPT),
      outputFile: join(dir, "check.json"),
      schema: join(root, CHECK_SCHEMA),
      contextFiles: [input, draft],
      deadlineSeconds: 120,
    });
    return checkVerdict(lastCheck);
  };
  const runRepair = async (rejection, rejectedText) => {
    const promptFile = join(dir, "repair-prompt.md");
    writeFileSync(REJECTED_ANSWER_FILE, `${rejectedText}\n`);
    writeFileSync(
      promptFile,
      repairPrompt(
        readFileSync(join(root, TRIAGE_PROMPT), "utf8"),
        readFileSync(join(root, REPAIR_PROMPT), "utf8"),
        rejection,
        issueNumber,
      ),
    );
    const parsed = await call({
      promptFile,
      outputFile: join(dir, "repair.json"),
      schema: join(root, ANSWER_SCHEMA),
      contextFiles: [...contextFiles.filter((path) => !path.endsWith(REMINDER_FILE)), REJECTED_ANSWER_FILE, join(root, REMINDER_FILE)],
      deadlineSeconds: 300,
    });
    const text = resultText(parsed);
    if (text.length > 0) finalParsed = parsed;
    return text;
  };

  // settle takes synchronous callbacks, so the calls are made ahead of it in the same order.
  const outcome = await settleAsync({ handlingInput, firstText: resultText(finalParsed), runCheck, runRepair });
  const failures = triageFailures(fixture, triageResultText(finalParsed), checkVerdict(lastCheck));
  return { name: fixture.name, passed: failures.length === 0, repaired: outcome.repaired, safety: isSafetyFixture(fixture.name), tokens };
}

/**
 * Runs settle with asynchronous check and repair calls. settle is synchronous, so each call is
 * replayed: a first pass records which calls it needs, the calls are awaited, and settle runs again
 * with their results until it needs no new call.
 */
export async function settleAsync({ handlingInput, firstText, runCheck, runRepair }) {
  const checks = [];
  const repairs = [];
  for (;;) {
    let checkIndex = 0;
    let repairIndex = 0;
    let missing = null;
    const outcome = settle({
      handlingInput,
      firstText,
      log: () => {},
      runCheck: (text) => {
        const result = checks[checkIndex++];
        if (!result) {
          missing = missing ?? { type: "check", text };
          return { verdict: "pass", reason: "" };
        }
        return result;
      },
      runRepair: (rejection, rejectedText) => {
        const result = repairs[repairIndex++];
        if (result === undefined) {
          missing = missing ?? { type: "repair", rejection, rejectedText };
          return "";
        }
        return result;
      },
    });
    if (!missing) return outcome;
    if (missing.type === "check") checks.push(await runCheck(missing.text));
    else repairs.push(await runRepair(missing.rejection, missing.rejectedText));
  }
}

/**
 * Runs the experiment and returns one row for each size and model.
 * @param {object} options
 * @param {Array} options.fixtures triage fixtures
 * @param {Array} options.snippets
 * @param {string[]} options.sizes
 * @param {string[]} options.models
 * @param {number} options.runs
 * @param {(text: string) => Promise<number[]>} options.embed
 * @param {(options: object) => Promise<object|null>|object|null} options.runNova
 * @param {() => number} [options.now] milliseconds
 */
export async function runExperiment({
  fixtures,
  snippets,
  sizes,
  models,
  runs,
  embed,
  runNova,
  workDir,
  reasoningEffort,
  root = ".",
  now = Date.now,
  log = console.log,
}) {
  const triage = fixtures.filter((fixture) => fixture.kind === "triage");
  const parsedSizes = sizes.map(parseSize);
  const snippetVectors = new Map();
  const questionVectors = new Map();
  if (parsedSizes.some((size) => size.kind === "top")) {
    for (const snippet of snippets) snippetVectors.set(snippet.id, await embed(embeddingText(snippet)));
    for (const fixture of triage) questionVectors.set(fixture.name, await embed(fixture.handlingInput.summary));
  }

  const rows = [];
  for (const modelId of models) {
    for (const size of parsedSizes) {
      const cell = {
        size: size.label,
        model: modelId,
        answers: 0,
        passed: 0,
        safetyTotal: 0,
        safetyPassed: 0,
        input: 0,
        output: 0,
        bytes: 0,
        ms: 0,
      };
      for (let run = 0; run < runs; run++) {
        for (const fixture of triage) {
          const dir = join(workDir, `${modelId.replace(/[^a-z0-9]+/gi, "_")}-${size.label}-${run}-${fixture.name}`);
          const chosen = chooseSnippets({ size, snippets, questionVector: questionVectors.get(fixture.name), snippetVectors });
          const { contextFiles, pageBytes } = writeContext({ dir, handlingInput: fixture.handlingInput, size, chosen, root });
          const started = now();
          const result = await runFixture({ fixture, modelId, reasoningEffort, contextFiles, dir, runNova, root });
          cell.ms += now() - started;
          cell.answers += 1;
          cell.bytes += pageBytes;
          cell.input += result.tokens.input;
          cell.output += result.tokens.output;
          if (result.passed) cell.passed += 1;
          if (result.safety) {
            cell.safetyTotal += 1;
            if (result.passed) cell.safetyPassed += 1;
          }
        }
      }
      const row = {
        size: cell.size,
        model: cell.model,
        answers: cell.answers,
        accuracy: cell.answers === 0 ? 0 : cell.passed / cell.answers,
        passed: cell.passed,
        safety: `${cell.safetyPassed}/${cell.safetyTotal}`,
        contextBytes: Math.round(cell.bytes / Math.max(cell.answers, 1)),
        inputTokens: Math.round(cell.input / Math.max(cell.answers, 1)),
        outputTokens: Math.round(cell.output / Math.max(cell.answers, 1)),
        seconds: Number((cell.ms / 1000 / Math.max(cell.answers, 1)).toFixed(1)),
      };
      rows.push(row);
      log(`support-context-experiment: ${row.model} size ${row.size} accuracy ${row.passed}/${row.answers}`);
    }
  }
  return rows;
}

/** The rows as a Markdown table. Tokens and seconds are the mean for one answer. */
export function renderTable(rows) {
  const lines = [
    "| Model | Size | Accuracy | Safety | Context bytes | Input tokens | Output tokens | Seconds |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.model} | ${row.size} | ${(row.accuracy * 100).toFixed(1)}% (${row.passed}/${row.answers}) | ${row.safety} | ${row.contextBytes} | ${row.inputTokens} | ${row.outputTokens} | ${row.seconds} |`,
    );
  }
  return lines.join("\n");
}

/** The nova-agent call, as a function from options to the parsed result file. */
export function novaCall(options) {
  try {
    execFileSync(process.execPath, novaArgs(options), { stdio: "ignore" });
  } catch {
    // nova-agent.mjs writes a result file for a failed run, and the caller judges that file.
  }
  return readJsonOrNull(options.outputFile);
}

async function main() {
  const { values } = parseArgs({
    options: {
      "models": { type: "string", default: DEFAULT_MODELS.join(",") },
      "sizes": { type: "string", default: DEFAULT_SIZES.join(",") },
      "runs": { type: "string", default: "3" },
      "work-dir": { type: "string" },
      "cache": { type: "string" },
      "out": { type: "string" },
      "reasoning-effort": { type: "string" },
    },
  });
  const workDir = values["work-dir"] ?? mkdtempSync(join(tmpdir(), "support-context-"));
  mkdirSync(workDir, { recursive: true });
  const cachePath = values.cache ?? join(workDir, "embeddings.json");
  const cache = readJsonOrNull(cachePath) ?? {};
  const embed = cachedEmbedder(titanEmbedder(), cache);
  const rows = await runExperiment({
    fixtures: loadFixtures(),
    snippets: buildSnippets(),
    sizes: values.sizes.split(",").filter(Boolean),
    models: values.models.split(",").filter(Boolean),
    runs: Number(values.runs),
    embed,
    runNova: novaCall,
    workDir,
    reasoningEffort: values["reasoning-effort"],
  });
  writeFileSync(cachePath, JSON.stringify(cache));
  if (values.out) writeFileSync(values.out, `${JSON.stringify(rows, null, 2)}\n`);
  console.log(renderTable(rows));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
