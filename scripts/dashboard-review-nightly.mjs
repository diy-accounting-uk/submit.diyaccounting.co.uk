#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-192 Judge the operator dashboard each night and write the report
// - **Use when:** the nightly dashboard review must read the page as a person would, judge it with a model that has no tools, and hand a checked report to the private repository.
// - **Does:** dashboard-review-nightly.mjs has two modes. `review` reads the snapshot, console images and held passes, renders the page, runs the code checks, asks the judge model about each tab (one request for each batch of at most 20 images), screens each accepted answer with the guardrail, and writes one encrypted bundle to the job output. `write` decrypts the bundle, checks each answer again, reads the figures block of the last nightly report, and writes the report and the kept JPEGs under the private repository path. It prints fixed lines only.
// - **Run:** `node scripts/dashboard-review-nightly.mjs review` and `node scripts/dashboard-review-nightly.mjs write --bundle <file> --private <dir>`
// - **Entry:** `scripts/dashboard-review-nightly.mjs:runNightly`
// - **Files:** scripts/dashboard-review-nightly.mjs, scripts/dashboard-review-answer.mjs, scripts/dashboard-review-report.mjs, scripts/dashboard-review-request.mjs, scripts/dashboard-review-render.mjs, scripts/dashboard-review-checks.mjs, scripts/dashboard-review-criteria.mjs, prompts/dashboard-review.md
// - **Keywords:** nightly dashboard review, judge, bedrock, guardrail, bundle, encrypted output, dashboard report
// - **Related:** OPS-191, DEV-55
// @end-capability

/* global Image, document */

// scripts/dashboard-review-nightly.mjs
//
// usage:
//   node scripts/dashboard-review-nightly.mjs review [--public <dir>] [--alarms <file>] [--skill <file>] [--prompt <file>]
//   node scripts/dashboard-review-nightly.mjs write --bundle <file> --private <dir> [--skill <file>]
//
// env (review): TRANSIT_PASS, REVIEW_MODEL_ID, GUARDRAIL_ID, GUARDRAIL_VERSION, GITHUB_OUTPUT, LIVE_SET (optional),
//   RUNNER_TEMP (optional), ANALYTICS_LAKE_BUCKET_NAME, ENVIRONMENT_NAME, PASSES_DYNAMODB_TABLE_NAME, AWS credentials and region.
// env (write): TRANSIT_PASS.
//
// stdout holds fixed lines only: no figure, name or model text. A failure prints one code and exits 1.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { figuresBlockSchema } from "../app/lib/dashboardReviewSchema.js";
import { readCriteria } from "./dashboard-review-criteria.mjs";
import { buildBatches, buildRequest, fillPrompt } from "./dashboard-review-request.mjs";
import { snapshotAnswer } from "./dashboard-review-data.mjs";
import { runCodeChecks } from "./dashboard-review-checks.mjs";
import { answerFindings, checkTabAnswer, joinFields, replaceFields, splitFields, textFields } from "./dashboard-review-answer.mjs";
import { figuresFromSnapshot, parseFiguresBlock, renderReport } from "./dashboard-review-report.mjs";

export const BUNDLE_MAX_CHARS = 900_000;
// Linux refuses one environment value over 128 KiB, so the bundle crosses jobs in parts.
export const BUNDLE_PART_CHARS = 120_000;
export const BUNDLE_PART_COUNT = 8;
export const JPEG_MAX_COUNT = 12;
export const JPEG_MAX_BYTES = 50_000;
const JPEG_ATTEMPTS = [
  { scale: 1, quality: 0.7 },
  { scale: 1, quality: 0.5 },
  { scale: 0.75, quality: 0.5 },
  { scale: 0.5, quality: 0.5 },
];
const REPORT_DIR = path.join("operator", "dashboard-reviews");
const ID = /^[A-Za-z0-9_.-]{1,120}$/;
const DECOMPRESSED_MAX = 40_000_000;

const FIXED_LINES = [
  /^render ok tabs=\d+ images=\d+$/,
  /^judge ok batches=\d+ rejected=\d+$/,
  /^judge request-bytes-max=\d+$/,
  /^bundle ok$/,
  /^write ok findings=\d+ rejected=\d+ images=\d+$/,
  /^(snapshot-missing|render-timeout tab=[A-Za-z0-9_-]{1,40}|image-load-failed|answer-too-large|refused-write|config-missing|bundle-invalid)$/,
  /^(bedrock-error|error) [A-Za-z0-9]{1,60}$/,
];

class NightlyError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function exceptionName(error) {
  return /^[A-Za-z0-9]{1,60}$/.test(String(error && error.name)) ? error.name : "Error";
}

function codeOf(error) {
  if (error instanceof NightlyError) return error.code;
  const message = String(error && error.message);
  if (/^(refused-write|image-load-failed|render-timeout tab=[A-Za-z0-9_-]{1,40})$/.test(message)) return message;
  return `error ${exceptionName(error)}`;
}

function makeOut(write) {
  return (line) => {
    if (!FIXED_LINES.some((shape) => shape.test(line))) throw new Error("a line outside the fixed list");
    write(`${line}\n`);
  };
}

// ---- the bundle between the two modes -------------------------------------------------------

function deriveKey(pass, salt) {
  return crypto.pbkdf2Sync(pass, salt, 100_000, 32, "sha256");
}

/** AES-256-GCM under a key from the pass; returns one base64 line. */
export function encryptBytes(bytes, pass) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(pass, salt), iv);
  const body = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([Buffer.from("DR1"), salt, iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decryptBytes(text, pass) {
  const raw = Buffer.from(String(text).trim(), "base64");
  if (raw.length < 3 + 16 + 12 + 16 || raw.subarray(0, 3).toString() !== "DR1") throw new NightlyError("bundle-invalid");
  const salt = raw.subarray(3, 19);
  const iv = raw.subarray(19, 31);
  const tag = raw.subarray(31, 47);
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(pass, salt), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(raw.subarray(47)), decipher.final()]);
  } catch {
    throw new NightlyError("bundle-invalid");
  }
}

const bundleSchema = z
  .object({
    v: z.literal(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    liveSet: z.string().max(80),
    generatedAt: z.string().max(40),
    modelId: z.string().max(120),
    notes: z.array(z.string().max(300)).max(5),
    tabs: z.array(
      z.object({ tabId: z.string().regex(ID), panels: z.array(z.string().regex(ID)), imageCount: z.number().int().min(0) }).strict(),
    ),
    codeFindings: z
      .array(
        z
          .object({
            check: z.number(),
            tab: z.string().regex(ID),
            panel: z.string().max(200),
            tag: z.string().regex(ID),
            list: z.enum(["improvement", "observation"]),
            finding: z.string().max(1000),
            evidence: z.string().max(1000),
            change: z.string().max(1000),
            source: z.literal("code"),
          })
          .strict(),
      )
      .max(1000),
    batches: z.array(
      z
        .object({
          tabId: z.string().regex(ID),
          panelIds: z.array(z.string().regex(ID)).min(1).max(20),
          text: z.string().max(60_000).nullable(),
          issues: z.array(z.object({ path: z.string().max(200), code: z.string().max(80) }).strict()).nullable(),
          masked: z.boolean(),
        })
        .strict(),
    ),
    figures: figuresBlockSchema,
    jpegs: z
      .array(
        z
          .object({
            file: z.string().regex(/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,200}\.jpg$/),
            tab: z.string().regex(ID),
            panel: z.string().regex(ID),
            length: z.number().int().min(1).max(JPEG_MAX_BYTES),
          })
          .strict(),
      )
      .max(JPEG_MAX_COUNT),
    tokens: z.object({ input: z.number().int().min(0), output: z.number().int().min(0) }).strict(),
  })
  .strict();

/** The bundle as `bundle-<n>=` output lines, one for each part, an empty part included. */
export function bundleOutputLines(bundle) {
  let lines = "";
  for (let part = 0; part < BUNDLE_PART_COUNT; part += 1) {
    lines += `bundle-${part}=${bundle.slice(part * BUNDLE_PART_CHARS, (part + 1) * BUNDLE_PART_CHARS)}\n`;
  }
  return lines;
}

/** @param {object} meta the bundle's JSON part, with `jpegs` entries lacking `length` @param {{ bytes: Buffer }[]} jpegs */
export function packBundle(meta, jpegs, pass) {
  const json = Buffer.from(
    JSON.stringify({ ...meta, jpegs: meta.jpegs.map((entry, index) => ({ ...entry, length: jpegs[index].bytes.length })) }),
  );
  const header = Buffer.alloc(4);
  header.writeUInt32BE(json.length);
  return encryptBytes(zlib.gzipSync(Buffer.concat([header, json, ...jpegs.map((jpeg) => jpeg.bytes)])), pass);
}

export function unpackBundle(text, pass) {
  let raw;
  try {
    raw = zlib.gunzipSync(decryptBytes(text, pass), { maxOutputLength: DECOMPRESSED_MAX });
  } catch (error) {
    throw error instanceof NightlyError ? error : new NightlyError("bundle-invalid");
  }
  if (raw.length < 4) throw new NightlyError("bundle-invalid");
  const jsonLength = raw.readUInt32BE(0);
  let meta;
  try {
    meta = bundleSchema.parse(JSON.parse(raw.subarray(4, 4 + jsonLength).toString("utf8")));
  } catch {
    throw new NightlyError("bundle-invalid");
  }
  let at = 4 + jsonLength;
  const jpegs = meta.jpegs.map((entry) => {
    const bytes = raw.subarray(at, at + entry.length);
    at += entry.length;
    if (bytes.length !== entry.length) throw new NightlyError("bundle-invalid");
    return { ...entry, bytes };
  });
  return { meta, jpegs };
}

// ---- default dependencies, loaded only when used --------------------------------------------

async function bedrockClient() {
  const { BedrockRuntimeClient } = await import("@aws-sdk/client-bedrock-runtime");
  return new BedrockRuntimeClient({});
}

async function sendToBedrock(build) {
  const sdk = await import("@aws-sdk/client-bedrock-runtime");
  const client = await bedrockClient();
  try {
    return await client.send(build(sdk));
  } catch (error) {
    throw new NightlyError(`bedrock-error ${exceptionName(error)}`);
  }
}

async function defaultInvokeModel({ modelId, body }) {
  const response = await sendToBedrock((sdk) => new sdk.ConverseCommand({ modelId, ...body }));
  const blocks = response && response.output && response.output.message && response.output.message.content;
  const text = (Array.isArray(blocks) ? blocks : [])
    .filter((block) => block && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
  const usage = (response && response.usage) || {};
  return { text, inputTokens: Number(usage.inputTokens) || 0, outputTokens: Number(usage.outputTokens) || 0 };
}

async function defaultApplyGuardrail({ id, version, text }) {
  const response = await sendToBedrock(
    (sdk) =>
      new sdk.ApplyGuardrailCommand({
        guardrailIdentifier: id,
        guardrailVersion: version,
        source: "OUTPUT",
        content: [{ text: { text } }],
      }),
  );
  const intervened = response.action === "GUARDRAIL_INTERVENED";
  const output = Array.isArray(response.outputs) && response.outputs[0] ? response.outputs[0].text : undefined;
  return { intervened, text: intervened ? String(output ?? "") : text };
}

/**
 * Opens one Chromium profile in a temporary folder and passes `convert(png)` to the callback. The
 * folder is removed when the callback ends or throws. `convert` returns a JPEG of at most
 * JPEG_MAX_BYTES, or null when no attempt fits.
 */
export async function withJpegConverter(callback) {
  const { chromium } = await import("playwright");
  const profileDir = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), "review-"));
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, { viewport: { width: 400, height: 300 } });
    const page = context.pages()[0] || (await context.newPage());
    const convert = async (png) => {
      for (const attempt of JPEG_ATTEMPTS) {
        const encoded = await page.evaluate(
          async ({ data, scale, quality }) => {
            const image = new Image();
            image.src = `data:image/png;base64,${data}`;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const drawing = canvas.getContext("2d");
            drawing.fillStyle = "#ffffff";
            drawing.fillRect(0, 0, canvas.width, canvas.height);
            drawing.drawImage(image, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL("image/jpeg", quality).split(",")[1];
          },
          { data: png.toString("base64"), ...attempt },
        );
        const bytes = Buffer.from(encoded, "base64");
        if (bytes.length <= JPEG_MAX_BYTES) return bytes;
      }
      return null;
    };
    return await callback(convert);
  } finally {
    if (context) await context.close().catch(() => {});
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

async function defaultReadReviewData() {
  return (await import("./dashboard-review-data.mjs")).readReviewData();
}

async function defaultRenderDashboard(input) {
  return (await import("./dashboard-review-render.mjs")).renderDashboard(input);
}

const defaultDeps = {
  readReviewData: defaultReadReviewData,
  renderDashboard: defaultRenderDashboard,
  invokeModel: defaultInvokeModel,
  applyGuardrail: defaultApplyGuardrail,
  withJpegConverter,
  now: () => Date.now(),
};

// ---- review mode ----------------------------------------------------------------------------

function required(env, names) {
  for (const name of names) if (!env[name]) throw new NightlyError("config-missing");
}

function readAlarms(file) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new NightlyError("config-missing");
  }
  if (!Array.isArray(parsed)) throw new NightlyError("config-missing");
  return parsed
    .filter((entry) => entry && Number.isInteger(entry.number) && typeof entry.title === "string")
    .map((entry) => ({ number: entry.number, title: entry.title }));
}

function imageEntries(tab, screenshots, consoleIndex) {
  return screenshots
    .filter((shot) => shot.tabId === tab)
    .map((shot) => {
      const entry = { panelId: shot.panelId, kind: shot.kind, mediaType: "image/png", data: shot.png };
      if (shot.captureId) {
        entry.captureId = shot.captureId;
        const item = consoleIndex && consoleIndex.items && consoleIndex.items[shot.captureId];
        if (item && item.capturedAt) entry.capturedAt = item.capturedAt;
      }
      return entry;
    });
}

async function judgeBatch({ batch, system, tags, env, deps }) {
  const request = buildRequest({ system, batch });
  const answer = await deps.invokeModel({ modelId: env.REVIEW_MODEL_ID, body: request });
  const record = {
    tabId: batch.tabId,
    panelIds: batch.images.map((image) => image.panelId),
    text: null,
    issues: null,
    masked: false,
  };
  const tokens = { input: answer.inputTokens, output: answer.outputTokens, bytes: JSON.stringify(request).length };
  const checked = checkTabAnswer({ text: answer.text, batch, tags });
  if (!checked.ok) return { record: { ...record, issues: checked.issues }, tokens };
  let value = checked.value;
  const fields = textFields(value);
  if (fields.length > 0) {
    const screened = await deps.applyGuardrail({ id: env.GUARDRAIL_ID, version: env.GUARDRAIL_VERSION, text: joinFields(fields) });
    if (screened.intervened) {
      const parts = splitFields(screened.text, fields.length);
      const replaced = parts ? checkTabAnswer({ text: JSON.stringify(replaceFields(value, parts)), batch, tags }) : null;
      if (!replaced || !replaced.ok) return { record: { ...record, issues: [{ path: "answer", code: "guardrail_blocked" }] }, tokens };
      value = replaced.value;
      record.masked = true;
    }
  }
  return { record: { ...record, text: JSON.stringify(value) }, value, tokens };
}

function keptImageCandidates({ codeFindings, modelFindings, screenshots }) {
  const wanted = [];
  const seen = new Set();
  for (const finding of [...codeFindings, ...modelFindings]) {
    const key = `${finding.tab}/${finding.panel}`;
    if (seen.has(key)) continue;
    const shot = screenshots.find((entry) => entry.tabId === finding.tab && entry.panelId === finding.panel);
    if (!shot) continue;
    seen.add(key);
    wanted.push(shot);
  }
  return wanted;
}

function jpegFileName(tabId, panelId) {
  return `${tabId}--${panelId}.jpg`.replace(/[^A-Za-z0-9_.-]/g, "_");
}

async function runReview({ options, env, deps, out }) {
  required(env, ["TRANSIT_PASS", "REVIEW_MODEL_ID", "GUARDRAIL_ID", "GUARDRAIL_VERSION", "GITHUB_OUTPUT"]);
  const criteria = readCriteria(fs.readFileSync(options.skill, "utf8"));
  const system = fillPrompt(fs.readFileSync(options.prompt, "utf8"), criteria);
  const alarms = readAlarms(options.alarms);

  const data = await deps.readReviewData();
  if (!data.snapshot) throw new NightlyError("snapshot-missing");
  const snapshot = snapshotAnswer(data);
  const { dom, screenshots } = await deps.renderDashboard({ publicDir: options.public, data });
  out(`render ok tabs=${dom.tabs.length} images=${screenshots.length}`);

  const codeFindings = runCodeChecks({ snapshot, dom, alarms, sectionMap: criteria.sectionMap, now: deps.now() });
  const tabInputs = dom.tabs.map((tabId) => ({
    tabId,
    generatedAt: snapshot.generatedAt,
    images: imageEntries(tabId, screenshots, data.consoleIndex),
  }));
  const batches = buildBatches(tabInputs);

  const records = [];
  const modelFindings = [];
  const tokens = { input: 0, output: 0 };
  let largest = 0;
  for (const batch of batches) {
    const judged = await judgeBatch({ batch, system, tags: criteria.tags, env, deps });
    records.push(judged.record);
    tokens.input += judged.tokens.input;
    tokens.output += judged.tokens.output;
    largest = Math.max(largest, judged.tokens.bytes);
    if (judged.value) modelFindings.push(...answerFindings({ value: judged.value, panelIds: judged.record.panelIds }).findings);
  }
  out(`judge ok batches=${batches.length} rejected=${records.filter((record) => record.issues).length}`);
  out(`judge request-bytes-max=${largest}`);

  const candidates = keptImageCandidates({ codeFindings, modelFindings, screenshots });
  const kept = await deps.withJpegConverter(async (convert) => {
    const found = [];
    for (const shot of candidates) {
      if (found.length >= JPEG_MAX_COUNT) break;
      const bytes = await convert(shot.png);
      if (bytes) found.push({ file: jpegFileName(shot.tabId, shot.panelId), tab: shot.tabId, panel: shot.panelId, bytes });
    }
    return found;
  });

  const liveSet = ID.test(env.LIVE_SET || "") ? env.LIVE_SET : "unknown";
  const meta = {
    v: 1,
    date: new Date(deps.now()).toISOString().slice(0, 10),
    liveSet,
    generatedAt: snapshot.generatedAt,
    modelId: env.REVIEW_MODEL_ID,
    notes: data.heldPasses === null ? ["The held passes panel was left out: the review role's read of the held passes was refused."] : [],
    tabs: dom.tabs.map((tabId) => ({
      tabId,
      panels: [
        ...new Set([
          ...dom.panels.filter((panel) => panel.openOn.includes(tabId)).map((panel) => panel.id),
          ...screenshots.filter((shot) => shot.tabId === tabId).map((shot) => shot.panelId),
        ]),
      ],
      imageCount: screenshots.filter((shot) => shot.tabId === tabId).length,
    })),
    codeFindings,
    batches: records,
    figures: figuresFromSnapshot(snapshot),
    jpegs: [],
    tokens,
  };
  let bundle;
  for (let keep = kept.length; keep >= 0; keep -= 1) {
    const chosen = kept.slice(0, keep);
    bundle = packBundle({ ...meta, jpegs: chosen.map(({ file, tab, panel }) => ({ file, tab, panel })) }, chosen, env.TRANSIT_PASS);
    if (bundle.length <= BUNDLE_MAX_CHARS) break;
    if (keep === 0) throw new NightlyError("answer-too-large");
  }
  fs.appendFileSync(env.GITHUB_OUTPUT, `${bundleOutputLines(bundle)}tokens-in=${tokens.input}\ntokens-out=${tokens.output}\n`);
  out("bundle ok");
}

// ---- write mode -----------------------------------------------------------------------------

function inside(base, target) {
  const relative = path.relative(path.resolve(base), path.resolve(target));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function lastFigures(reportDir, date) {
  if (!fs.existsSync(reportDir)) return null;
  const names = fs
    .readdirSync(reportDir)
    .map((name) => ({ name, match: /^REPORT_DASHBOARD_REVIEW_(\d{4}-\d{2}-\d{2})-nightly\.md$/.exec(name) }))
    .filter((entry) => entry.match && entry.match[1] < date)
    .sort((a, b) => (a.match[1] < b.match[1] ? 1 : -1));
  return names.length === 0 ? null : parseFiguresBlock(fs.readFileSync(path.join(reportDir, names[0].name), "utf8"));
}

async function runWrite({ options, env, out }) {
  required(env, ["TRANSIT_PASS"]);
  if (!options.bundle || !options.private) throw new NightlyError("config-missing");
  const { meta, jpegs } = unpackBundle(fs.readFileSync(options.bundle, "utf8"), env.TRANSIT_PASS);
  const { tags } = readCriteria(fs.readFileSync(options.skill, "utf8"));

  const modelFindings = [];
  const modelRows = [];
  const rejectedTabs = [];
  const maskedTabs = [];
  const injectionTabs = [];
  for (const batch of meta.batches) {
    if (batch.masked && !maskedTabs.includes(batch.tabId)) maskedTabs.push(batch.tabId);
    const checked =
      batch.text === null
        ? { ok: false, issues: batch.issues || [{ path: "answer", code: "not_one_json_object" }] }
        : checkTabAnswer({ text: batch.text, batch: { tabId: batch.tabId, imageCount: batch.panelIds.length }, tags });
    if (!checked.ok) {
      rejectedTabs.push({ tabId: batch.tabId, issues: checked.issues });
      continue;
    }
    if (checked.value.injectionSuspected && !injectionTabs.includes(batch.tabId)) injectionTabs.push(batch.tabId);
    const found = answerFindings({ value: checked.value, panelIds: batch.panelIds });
    modelFindings.push(...found.findings);
    modelRows.push(...found.rows);
  }

  const reportDir = path.join(options.private, REPORT_DIR);
  const previous = lastFigures(reportDir, meta.date);
  const keptImages = Object.fromEntries(jpegs.map((jpeg) => [`${jpeg.tab}/${jpeg.panel}`, jpeg.file]));
  const { markdown, movements } = renderReport({
    date: meta.date,
    liveSet: meta.liveSet,
    generatedAt: meta.generatedAt,
    modelId: meta.modelId,
    tabs: meta.tabs,
    figures: meta.figures,
    previous,
    codeFindings: meta.codeFindings,
    modelFindings,
    modelRows,
    rejectedTabs,
    maskedTabs,
    injectionTabs,
    keptImages,
    notes: meta.notes,
  });

  const reportFile = path.join(reportDir, `REPORT_DASHBOARD_REVIEW_${meta.date}-nightly.md`);
  const imageDir = path.join(reportDir, `${meta.date}-nightly`);
  if (!inside(options.private, reportFile) || !inside(options.private, imageDir)) throw new NightlyError("config-missing");
  fs.mkdirSync(reportDir, { recursive: true });
  fs.rmSync(imageDir, { recursive: true, force: true });
  if (jpegs.length > 0) fs.mkdirSync(imageDir, { recursive: true });
  for (const jpeg of jpegs) fs.writeFileSync(path.join(imageDir, jpeg.file), jpeg.bytes);
  fs.writeFileSync(reportFile, markdown);
  out(
    `write ok findings=${meta.codeFindings.length + modelFindings.length + movements.length} rejected=${rejectedTabs.length} images=${jpegs.length}`,
  );
}

// ---- entry ----------------------------------------------------------------------------------

function parseOptions(argv) {
  const options = {
    public: "web/public",
    alarms: path.join(process.env.RUNNER_TEMP || os.tmpdir(), "alarms.json"),
    skill: ".claude/skills/dashboard-review/SKILL.md",
    prompt: "prompts/dashboard-review.md",
    bundle: undefined,
    private: undefined,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    if (!name.startsWith("--") || !(name.slice(2) in options) || argv[index + 1] === undefined) throw new NightlyError("config-missing");
    options[name.slice(2)] = argv[index + 1];
  }
  return options;
}

/**
 * @param {{ argv: string[], env: object, stdout?: { write: (text: string) => void }, deps?: object }} input
 *   argv is the mode and then its flags
 * @returns {Promise<number>} the exit code
 */
export async function runNightly({ argv, env, stdout = process.stdout, deps = {} }) {
  const out = makeOut((text) => stdout.write(text));
  const full = { ...defaultDeps, ...deps };
  try {
    const [mode, ...flags] = argv;
    const options = parseOptions(flags);
    if (mode === "review") await runReview({ options, env, deps: full, out });
    else if (mode === "write") await runWrite({ options, env, out });
    else throw new NightlyError("config-missing");
    return 0;
  } catch (error) {
    out(codeOf(error));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runNightly({ argv: process.argv.slice(2), env: process.env });
}
