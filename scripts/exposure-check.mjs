#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/exposure-check.mjs
//
// Checks what the business exposes publicly for keys in the rotation set. It runs in one process:
// live values come from AWS Secrets Manager into memory, each public surface streams past them,
// and the only output is a key name, a location and a boolean. A value never reaches stdout, a
// log, a file or an argument. Error text from a parser can quote its input, so this file reports
// an error by its name or code only. Format matches use the patterns of content-scan.mjs.
//
// Reads only. HTTP surfaces get GET requests at a low rate. The report goes to one path inside the
// private repository, and the script refuses any other path.

import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createGunzip } from "node:zlib";
import { GetSecretValueCommand, ListSecretsCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

import { SECRET_PATTERNS, findHits, isAllowed, parseAllowList } from "./content-scan.mjs";
import {
  MIN_NEEDLE_LENGTH,
  NeedleSet,
  WEAK_NEEDLE_LENGTH,
  assessFormatMatch,
  digest,
  gunzipBounded,
  isGzip,
  isZip,
  looksBinary,
  needleVariants,
  readZipEntries,
  secretLeaves,
} from "./lib/exposure-matcher.mjs";

const run = promisify(execFile);

const ORG = "diy-accounting-uk";
const REGION = "eu-west-2";
const ENVIRONMENTS = [
  { env: "ci", profile: "diya-submit-ci" },
  { env: "prod", profile: "diya-submit-prod" },
];
const CHECKOUT_REPOSITORIES = [
  "submit.diyaccounting.co.uk",
  "spreadsheets.diyaccounting.co.uk",
  "www.diyaccounting.co.uk",
  "root.diyaccounting.co.uk",
  "diy-accounting-archive",
];
const API_ONLY_REPOSITORIES = ["homebrew-diya-gl"];
const SITES = [
  "https://submit.diyaccounting.co.uk",
  "https://ci-submit.diyaccounting.co.uk",
  "https://diyaccounting.co.uk",
  "https://spreadsheets.diyaccounting.co.uk",
  "https://diya-gl.co.uk",
  "https://ci.diya-gl.co.uk",
];
const SUBMIT_SITES = new Set(["https://submit.diyaccounting.co.uk", "https://ci-submit.diyaccounting.co.uk"]);
const API_ERROR_PATHS = ["/api/v1/bundle", "/api/v1/catalog", "/api/v1/hmrc/vat/obligation", "/api/v1/no-such-route"];
const MCP_PATHS = [
  "/mcp",
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/mcp",
  "/.well-known/oauth-authorization-server",
];
const NPM_PACKAGES = ["@diy-accounting-uk/diya-gl", "@diy-accounting-uk/diya-submit"];
const GITHUB_NPM_PACKAGES = ["web-submit-diyaccounting-co-uk"];
const CONTAINERS = ["diya-gl", "diya-submit-mcp"];
const SECRET_WORKFLOWS = ["manage-secrets.yml", "deploy-environment.yml", "generate-pass.yml", "email-hash-rotate.yml"];

// Values that are not keys, which the runbook keeps out of the rotation set.
const NOT_KEYS = /\/(operator-emails|family-affiliate-emails|paypal\/client_id)$/;
const HASH_KEYS = /\/(user-sub-hash-salt|email-hash-secret)$/;
const LANE_SEEDS = /\/submit\/test\//;

// Shapes that match much other text. A hit counts only as a total unless a live value agrees.
const LOOSE_PATTERNS = [
  { label: "private-key-header-only", re: /-----BEGIN[A-Z ]*PRIVATE KEY-----/g },
  { label: "hash-registry-shape", re: /\{\s*"current"\s*:\s*"v\d+"\s*,\s*"versions"\s*:\s*\{/g },
  { label: "salt-v2-shape", re: /(?<![a-z-])[a-z]{3,}(?:-[a-z]{3,}){7}(?![a-z-])/g },
  { label: "salt-v1-shape", re: /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{43}=(?![A-Za-z0-9+/=])/g },
];
// The bare header sits in many TLS libraries, so a private key counts only with a key body after it.
const PRIVATE_KEY_WITH_BODY = { label: "private-key-with-body", re: /-----BEGIN[A-Z ]*PRIVATE KEY-----(?:\\[rn]|\s)+[A-Za-z0-9+/]{40,}/g };
const FORMAT_PATTERNS = [...SECRET_PATTERNS.filter(({ label }) => label !== "private-key-block"), PRIVATE_KEY_WITH_BODY, ...LOOSE_PATTERNS];
const LOOSE_LABELS = new Set(LOOSE_PATTERNS.map(({ label }) => label));

// Public text that each surface holds. A canary count above zero proves that the matcher reached
// the text of that surface after any unzip or gunzip.
const CANARIES = ["DIY Accounting", "diyaccounting", "Post job cleanup", "Complete job"];

const MAX_FORMAT_SCAN_BYTES = 8 * 1024 * 1024;
const MAX_NESTING = 3;
const REPORT_INTERVAL_MS = 120000;
const API_GAP_MS = 350;
const SITE_GAP_MS = 300;
const MAX_PAGES_PER_SITE = 500;
const MAX_SITE_BODY_BYTES = 30 * 1024 * 1024;
const MIN_RATE_REMAINING = 800;
const SKIPPED_SITE_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|ico|mp4|webm|mov|pdf|zip|xlsx?|ods|woff2?|ttf|eot)(\?|$)/i;

function parseArgs(argv) {
  const options = {
    report: null,
    surfaces: ["git", "github", "logs", "sites", "mcp", "npm", "containers"],
    withHashKeys: false,
    noValues: false,
    logsPerWorkflow: 5,
    oldestPerWorkflow: 2,
    artifactBudgetMb: 6000,
    maxArtifactMb: 150,
    containerTags: 4,
    limit: 0,
    scratch: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--with-hash-keys") options.withHashKeys = true;
    else if (flag === "--no-values") options.noValues = true;
    else if (flag === "--report") options.report = argv[(index += 1)];
    else if (flag === "--scratch") options.scratch = argv[(index += 1)];
    else if (flag === "--surfaces") options.surfaces = argv[(index += 1)].split(",");
    else if (flag === "--logs-per-workflow") options.logsPerWorkflow = Number(argv[(index += 1)]);
    else if (flag === "--artifact-budget-mb") options.artifactBudgetMb = Number(argv[(index += 1)]);
    else if (flag === "--container-tags") options.containerTags = Number(argv[(index += 1)]);
    else if (flag === "--limit") options.limit = Number(argv[(index += 1)]);
    else throw new Error(`unknown option ${flag}`);
  }
  if (!options.report || !options.scratch) throw new Error("--report and --scratch are required");
  options.report = resolve(options.report);
  if (!options.report.includes("/private.diyaccounting.co.uk/")) throw new Error("--report must be inside private.diyaccounting.co.uk");
  return options;
}

function progress(message) {
  process.stderr.write(`${new Date().toISOString().slice(11, 19)} ${message}\n`);
}

function errorCode(error) {
  return String(error?.code ?? error?.status ?? error?.name ?? "error");
}

/** The stack without its first line, because the first line holds the message. */
function errorFrames(error) {
  return String(error?.stack ?? "")
    .split("\n")
    .slice(1, 4)
    .join(" ");
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

class Findings {
  constructor(runKey, allowList) {
    this.runKey = runKey;
    this.allowList = allowList;
    this.liveHits = new Map();
    this.formatHits = new Map();
    this.looseTotals = new Map();
    this.coverage = new Map();
    this.notes = [];
    this.reads = [];
    this.inventory = new Map();
    this.liveDigests = new Map();
    this.knownPublicDigests = new Set();
  }

  count(surface, field, amount = 1) {
    if (!this.coverage.has(surface)) this.coverage.set(surface, {});
    const row = this.coverage.get(surface);
    row[field] = (row[field] ?? 0) + amount;
  }

  note(text) {
    this.notes.push(text);
  }

  recordLive(needle, surface, location) {
    if (needle.canary) {
      this.count(surface, "canaryHits");
      return;
    }
    const id = `${needle.keys}|${needle.encoding}|${surface}|${location}`;
    const hit = this.liveHits.get(id);
    if (hit) hit.count += 1;
    else
      this.liveHits.set(id, {
        keys: needle.keys,
        stages: needle.stages,
        encoding: needle.encoding,
        weak: needle.weak,
        surface,
        location,
        count: 1,
      });
  }

  recordFormat(label, matchedText, surface, location) {
    if (LOOSE_LABELS.has(label)) {
      this.looseTotals.set(label, (this.looseTotals.get(label) ?? 0) + 1);
      if (!surface.startsWith("logs:") || !SECRET_WORKFLOWS.some((workflow) => location.startsWith(workflow))) return;
    }
    const matchDigest = digest(this.runKey, matchedText);
    const id = `${label}|${matchDigest}`;
    let hit = this.formatHits.get(id);
    if (!hit) {
      hit = {
        label,
        fingerprint: matchDigest.slice(0, 12),
        ...assessFormatMatch(matchedText),
        allowListed: isAllowed(matchedText, this.allowList),
        knownPublic: this.knownPublicDigests.has(matchDigest),
        liveKey: this.liveDigests.get(matchDigest) ?? null,
        surfaces: new Set(),
        locations: [],
        count: 0,
      };
      this.formatHits.set(id, hit);
    }
    hit.count += 1;
    hit.surfaces.add(surface);
    if (hit.locations.length < 4) hit.locations.push(`${surface}: ${location}`);
  }
}

class Scanner {
  constructor(needleSet, findings) {
    this.needleSet = needleSet;
    this.findings = findings;
  }

  formats(text, surface, location) {
    for (const { label, matchedText } of findHits(text, FORMAT_PATTERNS)) this.findings.recordFormat(label, matchedText, surface, location);
  }

  /** Scans bytes in memory, and any zip or gzip inside them. */
  bytes(buffer, surface, location, depth = 0) {
    this.findings.count(surface, "bytes", buffer.length);
    this.needleSet.scan(buffer, (needle) => this.findings.recordLive(needle, surface, location));
    if (buffer.length <= MAX_FORMAT_SCAN_BYTES && !looksBinary(buffer)) this.formats(buffer.toString("latin1"), surface, location);
    if (depth >= MAX_NESTING) return;
    if (isZip(buffer)) {
      for (const entry of readZipEntries(buffer)) {
        if (entry.data) this.bytes(entry.data, surface, `${location} > ${entry.name}`, depth + 1);
        else this.findings.count(surface, "entriesSkipped");
      }
    } else if (isGzip(buffer)) {
      try {
        this.bytes(gunzipBounded(buffer), surface, `${location} > gunzip`, depth + 1);
      } catch {
        this.findings.count(surface, "entriesSkipped");
      }
    }
  }

  text(value, surface, location) {
    if (typeof value === "string" && value.length > 0) this.bytes(Buffer.from(value, "utf8"), surface, location, MAX_NESTING);
  }

  /** Scans a stream that is too large to hold, with a carry so that a split match still counts. */
  async stream(readable, surface, location) {
    const write = this.needleSet.stream((needle) => this.findings.recordLive(needle, surface, location));
    let tail = "";
    for await (const chunk of readable) {
      this.findings.count(surface, "bytes", chunk.length);
      write(chunk);
      const text = tail + chunk.toString("latin1");
      this.formats(text, surface, location);
      tail = text.slice(-2048);
    }
  }
}

async function readLiveValues(options, findings, runKey) {
  const values = new Map();
  const addValue = (secretName, stage, secretString) => {
    for (const leaf of secretLeaves(secretString)) {
      if (!values.has(leaf)) values.set(leaf, { names: new Set(), stages: new Set() });
      values.get(leaf).names.add(secretName);
      values.get(leaf).stages.add(stage);
    }
  };
  for (const { env, profile } of ENVIRONMENTS) {
    const client = new SecretsManagerClient({ region: REGION, profile });
    let nextToken;
    const names = [];
    do {
      const page = await client.send(
        new ListSecretsCommand({ NextToken: nextToken, MaxResults: 100, Filters: [{ Key: "name", Values: [`${env}/submit/`] }] }),
      );
      names.push(...page.SecretList.map((secret) => secret.Name));
      nextToken = page.NextToken;
    } while (nextToken);
    for (const name of names) {
      if (NOT_KEYS.test(name)) continue;
      const hashKey = HASH_KEYS.test(name);
      if (hashKey && !options.withHashKeys) {
        findings.inventory.set(name, "not read: hash key, needs --with-hash-keys");
        continue;
      }
      const stages = hashKey || LANE_SEEDS.test(name) ? ["AWSCURRENT"] : ["AWSCURRENT", "AWSPREVIOUS"];
      for (const stage of stages) {
        try {
          const secret = await client.send(new GetSecretValueCommand({ SecretId: name, VersionStage: stage }));
          const text = secret.SecretString ?? Buffer.from(secret.SecretBinary ?? []).toString("latin1");
          addValue(name, stage, text);
          if (stage === "AWSCURRENT") findings.inventory.set(name, "read");
          if (hashKey) findings.reads.push({ name, profile, at: new Date().toISOString() });
        } catch (error) {
          if (stage === "AWSCURRENT") findings.inventory.set(name, `not read: ${errorCode(error)}`);
        }
      }
    }
  }
  const needles = [];
  for (const [value, { names, stages }] of values) {
    const keys = [...names].sort().join(", ");
    findings.liveDigests.set(digest(runKey, value), keys);
    for (const variant of needleVariants(value)) {
      needles.push({ ...variant, keys, stages: [...stages].join("+"), weak: value.length < WEAK_NEEDLE_LENGTH });
    }
  }
  findings.count("values", "distinctValues", values.size);
  findings.count("values", "needles", needles.length);
  return needles;
}

class GitHubClient {
  constructor(findings) {
    this.findings = findings;
    this.queue = Promise.resolve();
  }

  async start() {
    const { stdout } = await run("gh", ["auth", "token"]);
    this.token = stdout.trim();
  }

  headers() {
    return {
      "Authorization": `Bearer ${this.token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "diya-exposure-check",
    };
  }

  /** One request at a time, with a gap, so that the shared rate limit stays free for other work. */
  request(path) {
    const attempt = this.queue.then(async () => {
      await sleep(API_GAP_MS);
      const response = await fetch(path.startsWith("http") ? path : `https://api.github.com/${path}`, { headers: this.headers() });
      this.findings.count("github-api", "requests");
      const remaining = Number(response.headers.get("x-ratelimit-remaining") ?? MIN_RATE_REMAINING + 1);
      if (remaining < MIN_RATE_REMAINING) {
        const resetAt = Number(response.headers.get("x-ratelimit-reset")) * 1000;
        progress(`GitHub rate limit low (${remaining}); pausing to the reset`);
        await sleep(Math.max(resetAt - Date.now(), 0) + 5000);
      }
      return response;
    });
    this.queue = attempt.catch(() => undefined);
    return attempt;
  }

  async json(path) {
    const response = await this.request(path);
    if (!response.ok) {
      await response.arrayBuffer();
      const error = new Error("github");
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async bytes(path) {
    const response = await this.request(path);
    if (!response.ok) {
      await response.arrayBuffer();
      const error = new Error("github");
      error.status = response.status;
      throw error;
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async *pages(path, pick = (page) => page, maxPages = 100) {
    const separator = path.includes("?") ? "&" : "?";
    for (let page = 1; page <= maxPages; page += 1) {
      const items = pick(await this.json(`${path}${separator}per_page=100&page=${page}`));
      yield* items;
      if (items.length < 100) return;
    }
  }
}

function capped(items, limit) {
  return limit > 0 ? items.slice(0, limit) : items;
}

async function gitOutput(directory, args) {
  const { stdout } = await run("git", ["-C", directory, ...args], { maxBuffer: 1024 * 1024 * 1024 });
  return stdout;
}

/** A bare repository in scratch that borrows the sibling's objects and holds every public ref. */
async function publicRefsRepository(repository, siblingRoot, scratch) {
  const sibling = join(siblingRoot, repository);
  const bare = join(scratch, `${repository}.git`);
  if (!existsSync(bare)) {
    await run("git", ["init", "--quiet", "--bare", bare]);
    writeFileSync(join(bare, "objects/info/alternates"), `${join(sibling, ".git/objects")}\n`);
  }
  await gitOutput(bare, ["fetch", "--quiet", "--no-tags", `https://github.com/${ORG}/${repository}.git`, "+refs/*:refs/public/*"]);
  await gitOutput(bare, ["fetch", "--quiet", "--no-tags", sibling, "+refs/remotes/origin/*:refs/last-seen/*"]);
  return bare;
}

/** Streams every object of a list through `git cat-file --batch`, one whole object at a time. */
async function forEachObject(directory, objectIds, visit) {
  const child = spawn("git", ["-C", directory, "cat-file", "--batch"], { stdio: ["pipe", "pipe", "ignore"] });
  child.stdin.on("error", () => undefined);
  child.stdin.end(`${objectIds.join("\n")}\n`);
  let header = Buffer.alloc(0);
  let object = null;
  let trailingNewline = false;
  for await (const chunk of child.stdout) {
    let data = chunk;
    while (data.length > 0) {
      if (trailingNewline) {
        data = data.subarray(1);
        trailingNewline = false;
        continue;
      }
      if (object === null) {
        const newline = data.indexOf(10);
        if (newline < 0) {
          header = Buffer.concat([header, data]);
          break;
        }
        const [id, type, size] = Buffer.concat([header, data.subarray(0, newline)])
          .toString("latin1")
          .split(" ");
        header = Buffer.alloc(0);
        data = data.subarray(newline + 1);
        if (size === undefined) continue;
        object = { id, type, length: Number(size), filled: 0, body: type === "tree" ? null : Buffer.allocUnsafe(Number(size)) };
      }
      const take = Math.min(object.length - object.filled, data.length);
      if (object.body) data.copy(object.body, object.filled, 0, take);
      object.filled += take;
      data = data.subarray(take);
      if (object.filled === object.length) {
        if (object.body) visit(object);
        object = null;
        trailingNewline = true;
      }
    }
  }
}

async function scanGitRepository(repository, siblingRoot, options, scanner, findings) {
  const surface = `git:${repository}`;
  const bare = await publicRefsRepository(repository, siblingRoot, join(options.scratch, "public-refs"));
  const listing = await gitOutput(bare, ["rev-list", "--objects", "--all"]);
  const paths = new Map();
  for (const line of listing.split("\n")) {
    if (line.length >= 40) paths.set(line.slice(0, 40), line.slice(41));
  }
  const refCount = (await gitOutput(bare, ["for-each-ref", "--format=x"])).split("\n").length - 1;
  findings.count(surface, "refs", refCount);
  await forEachObject(bare, capped([...paths.keys()], options.limit), (object) => {
    findings.count(surface, `${object.type}s`);
    if (object.type === "blob") scanner.bytes(object.body, surface, `${paths.get(object.id)} blob ${object.id}`);
    else scanner.text(object.body.toString("latin1"), surface, `${object.type} ${object.id}`);
  });
  for (const hit of findings.liveHits.values()) {
    const blob = hit.surface === surface && hit.location.match(/ blob ([0-9a-f]{40})/);
    if (!blob) continue;
    const commits = (await gitOutput(bare, ["log", "--all", "--format=%h %cs", `--find-object=${blob[1]}`])).trim().split("\n");
    const inMain = (await gitOutput(bare, ["ls-tree", "-r", "refs/public/heads/main"]).catch(() => "")).includes(blob[1]);
    hit.detail = `first ${commits.at(-1)}; ${commits.length} commit(s); at main head: ${inMain}`;
  }
  progress(`${surface} finished`);
}

async function scanApiRepository(repository, gh, scanner, findings) {
  const surface = `git:${repository}`;
  for await (const commit of gh.pages(`repos/${ORG}/${repository}/commits`)) {
    const detail = await gh.json(`repos/${ORG}/${repository}/commits/${commit.sha}`);
    findings.count(surface, "commits");
    scanner.text(detail.commit.message, surface, `commit ${commit.sha}`);
    for (const file of detail.files ?? []) scanner.text(file.patch, surface, `${file.filename} commit ${commit.sha}`);
  }
  progress(`${surface} finished`);
}

async function allVariables(gh, repositories) {
  const variables = [];
  for await (const variable of gh.pages(`orgs/${ORG}/actions/variables`, (page) => page.variables)) {
    variables.push({ scope: `org ${ORG}`, ...variable });
  }
  for (const repository of repositories) {
    for await (const variable of gh.pages(`repos/${ORG}/${repository}/actions/variables`, (page) => page.variables)) {
      variables.push({ scope: repository, ...variable });
    }
    const { environments = [] } = await gh.json(`repos/${ORG}/${repository}/environments?per_page=100`);
    for (const { name } of environments) {
      const encoded = encodeURIComponent(name);
      for await (const variable of gh.pages(`repos/${ORG}/${repository}/environments/${encoded}/variables`, (page) => page.variables)) {
        variables.push({ scope: `${repository} env ${name}`, ...variable });
      }
    }
  }
  return variables;
}

async function scanGitHubRecords(repository, gh, scanner, findings, options) {
  const surface = `github-records:${repository}`;
  const base = `repos/${ORG}/${repository}`;
  for await (const issue of gh.pages(`${base}/issues?state=all`)) {
    findings.count(surface, "issuesAndPulls");
    scanner.text(`${issue.title}\n${issue.body ?? ""}`, surface, `issue ${issue.number}`);
  }
  for (const [path, label] of [
    ["issues/comments", "comment"],
    ["pulls/comments", "review comment"],
    ["comments", "commit comment"],
  ]) {
    for await (const comment of gh.pages(`${base}/${path}`)) {
      findings.count(surface, "comments");
      scanner.text(comment.body, surface, `${label} ${comment.id}`);
    }
  }
  for await (const release of gh.pages(`${base}/releases`)) {
    findings.count(surface, "releases");
    scanner.text(release.body, surface, `release ${release.tag_name}`);
    for (const asset of release.assets) {
      if (asset.size > options.maxArtifactMb * 1024 * 1024) {
        findings.count(surface, "assetsSkippedForSize");
        continue;
      }
      const response = await fetch(asset.browser_download_url);
      if (response.ok) {
        findings.count(surface, "assets");
        scanner.bytes(Buffer.from(await response.arrayBuffer()), surface, `release ${release.tag_name} asset ${asset.name}`);
      }
    }
  }
  progress(`${surface} finished`);
}

async function runsToScan(repository, gh, options, findings) {
  const base = `repos/${ORG}/${repository}/actions`;
  let retentionDays = 90;
  try {
    retentionDays = (await gh.json(`${base}/permissions/artifact-and-log-retention`)).days ?? retentionDays;
  } catch {
    findings.note(`${repository}: the retention setting was not readable; the check used 90 days`);
  }
  const oldestRetained = new Date(Date.now() - (retentionDays - 2) * 86400000).toISOString().slice(0, 10);
  const selected = new Map();
  for await (const workflow of gh.pages(`${base}/workflows`, (page) => page.workflows)) {
    const fileName = workflow.path.split("/").at(-1);
    const runsPath = `${base}/workflows/${workflow.id}/runs`;
    if (repository === CHECKOUT_REPOSITORIES[0] && SECRET_WORKFLOWS.includes(fileName)) {
      for await (const run of gh.pages(runsPath, (page) => page.workflow_runs, 10)) selected.set(run.id, { run, fileName, whole: true });
      continue;
    }
    const newest = await gh.json(`${runsPath}?per_page=${options.logsPerWorkflow}`);
    newest.workflow_runs.forEach((run) => selected.set(run.id, { run, fileName, whole: false }));
    if (options.oldestPerWorkflow === 0 || newest.total_count <= options.logsPerWorkflow) continue;
    const retainedPath = `${runsPath}?created=%3E%3D${oldestRetained}&per_page=${options.oldestPerWorkflow}`;
    const retained = await gh.json(retainedPath);
    if (retained.total_count > options.oldestPerWorkflow) {
      const lastPage = Math.min(Math.ceil(retained.total_count / options.oldestPerWorkflow), Math.floor(1000 / options.oldestPerWorkflow));
      const oldest = await gh.json(`${retainedPath}&page=${lastPage}`);
      oldest.workflow_runs.forEach((run) => selected.set(run.id, { run, fileName, whole: false }));
    }
  }
  findings.count(`logs:${repository}`, "retentionDays", retentionDays);
  return capped([...selected.values()], options.limit);
}

async function scanLogsAndArtifacts(repository, gh, scanner, findings, options, budget) {
  const surface = `logs:${repository}`;
  const base = `repos/${ORG}/${repository}/actions`;
  const total = (await gh.json(`${base}/runs?per_page=1`)).total_count;
  findings.count(surface, "runsListed", total);
  const runs = await runsToScan(repository, gh, options, findings);
  for (const { run, fileName, whole } of runs) {
    findings.count(surface, whole ? "runsWholeWorkflow" : "runsSampled");
    scanner.text(run.display_title, surface, `run ${run.id} title`);
    try {
      const archive = await gh.bytes(`${base}/runs/${run.id}/logs`);
      findings.count(surface, "logArchives");
      scanner.bytes(archive, surface, `${fileName} run ${run.id} (${run.created_at.slice(0, 10)})`);
    } catch (error) {
      findings.count(surface, `logsUnavailable${errorCode(error)}`);
    }
    if (whole && fileName === "deploy-environment.yml") continue;
    try {
      for await (const artifact of gh.pages(`${base}/runs/${run.id}/artifacts`, (page) => page.artifacts, 3)) {
        const artifactSurface = `artifacts:${repository}`;
        const sizeMb = artifact.size_in_bytes / 1024 / 1024;
        if (artifact.expired) findings.count(artifactSurface, "expired");
        else if (sizeMb > options.maxArtifactMb) findings.count(artifactSurface, "skippedForSize");
        else if (budget.mb < sizeMb) findings.count(artifactSurface, "skippedForBudget");
        else {
          budget.mb -= sizeMb;
          const archive = await gh.bytes(artifact.archive_download_url);
          findings.count(artifactSurface, "artifacts");
          scanner.bytes(archive, artifactSurface, `${fileName} run ${run.id} artifact ${artifact.name}`);
        }
      }
    } catch (error) {
      findings.count(`artifacts:${repository}`, `unavailable${errorCode(error)}`);
    }
  }
  progress(`${surface} finished`);
}

function linksIn(body, pageUrl) {
  const found = new Set();
  const patterns = [
    /(?:href|src)=["']([^"'#]+)/g,
    /sourceMappingURL=([^\s*"']+)/g,
    /from\s*["'](\.{0,2}\/[^"']+)["']/g,
    /["'`](\/[\w./-]+\.(?:m?js|json|map|css|html|env|toml|txt))["'`]/g,
    /<loc>([^<]+)<\/loc>/g,
    /^Sitemap:\s*(\S+)/gim,
  ];
  for (const pattern of patterns) {
    for (const match of body.matchAll(pattern)) {
      try {
        found.add(new URL(match[1], pageUrl).href.split("#")[0]);
      } catch {
        continue;
      }
    }
  }
  return found;
}

async function publicGet(url) {
  return fetch(url, { headers: { "User-Agent": "diya-exposure-check" }, redirect: "follow", signal: AbortSignal.timeout(30000) });
}

async function scanSite(site, scanner, findings, options) {
  const surface = `site:${new URL(site).host}`;
  const seeds = ["/", "/sitemap.xml", "/robots.txt", "/submit.env", "/submit.version", ...(SUBMIT_SITES.has(site) ? API_ERROR_PATHS : [])];
  const queue = seeds.map((path) => new URL(path, site).href);
  const seen = new Set(queue);
  const maxPages = options.limit > 0 ? options.limit : MAX_PAGES_PER_SITE;
  let fetched = 0;
  while (queue.length > 0 && fetched < maxPages) {
    const url = queue.shift();
    await sleep(SITE_GAP_MS);
    fetched += 1;
    try {
      const response = await publicGet(url);
      const size = Number(response.headers.get("content-length") ?? 0);
      if (size > MAX_SITE_BODY_BYTES) {
        await response.body?.cancel();
        findings.count(surface, "skippedForSize");
        continue;
      }
      const body = Buffer.from(await response.arrayBuffer());
      const path = new URL(url).pathname;
      findings.count(surface, `status${Math.floor(response.status / 100)}xx`);
      scanner.text(JSON.stringify([...response.headers]), surface, `${path} headers`);
      scanner.bytes(body, surface, path);
      if (!response.ok) continue;
      for (const link of linksIn(body.toString("latin1"), url)) {
        if (!seen.has(link) && new URL(link).origin === site && !SKIPPED_SITE_EXTENSIONS.test(link)) {
          seen.add(link);
          queue.push(link);
        }
      }
    } catch (error) {
      findings.count(surface, `failed${errorCode(error)}`);
    }
  }
  findings.count(surface, "urlsLeftInQueue", queue.length);
  progress(`${surface} finished`);
}

async function scanMcp(scanner, findings) {
  const surface = "mcp";
  for (const site of SUBMIT_SITES) {
    for (const path of MCP_PATHS) {
      await sleep(SITE_GAP_MS);
      try {
        const response = await publicGet(new URL(path, site).href);
        findings.count(surface, "responses");
        const location = `${new URL(site).host}${path}`;
        scanner.text(JSON.stringify([...response.headers]), surface, `${location} headers`);
        scanner.bytes(Buffer.from(await response.arrayBuffer()), surface, location);
      } catch (error) {
        findings.count(surface, `failed${errorCode(error)}`);
      }
    }
  }
  progress(`${surface} finished`);
}

async function scanNpm(gh, scanner, findings, options) {
  for (const name of NPM_PACKAGES) {
    const surface = `npm:${name}`;
    const response = await publicGet(`https://registry.npmjs.org/${name.replace("/", "%2f")}`);
    const packument = await response.json();
    scanner.text(JSON.stringify(packument), surface, "packument");
    for (const [version, manifest] of capped(Object.entries(packument.versions), options.limit)) {
      try {
        const tarball = await publicGet(manifest.dist.tarball);
        findings.count(surface, "versions");
        scanner.bytes(Buffer.from(await tarball.arrayBuffer()), surface, `${version} tarball`);
      } catch (error) {
        findings.count(surface, `failed${errorCode(error)}`);
      }
    }
  }
  for (const name of GITHUB_NPM_PACKAGES) {
    const surface = `github-npm:${name}`;
    try {
      const response = await fetch(`https://npm.pkg.github.com/@${ORG}%2f${name}`, { headers: { Authorization: `Bearer ${gh.token}` } });
      const packument = await response.json();
      scanner.text(JSON.stringify(packument), surface, "packument");
      for (const [version, manifest] of Object.entries(packument.versions ?? {})) {
        const tarball = await fetch(manifest.dist.tarball, { headers: { Authorization: `Bearer ${gh.token}` } });
        findings.count(surface, "versions");
        scanner.bytes(Buffer.from(await tarball.arrayBuffer()), surface, `${version} tarball`);
      }
    } catch (error) {
      findings.count(surface, `failed${errorCode(error)}`);
    }
  }
  progress("npm finished");
}

const MANIFEST_TYPES = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

async function scanContainer(name, gh, scanner, findings, options) {
  const surface = `container:${name}`;
  const repository = `${ORG}/${name}`;
  const tokenResponse = await publicGet(`https://ghcr.io/token?scope=repository:${repository}:pull`);
  const { token } = await tokenResponse.json();
  const registry = (path, accept) =>
    fetch(`https://ghcr.io/v2/${repository}/${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: accept } });
  const versions = [];
  for await (const version of gh.pages(`orgs/${ORG}/packages/container/${name}/versions`, (page) => page, 5)) versions.push(version);
  const tagged = versions.filter((version) => version.metadata?.container?.tags?.length > 0);
  const chosen = [...tagged.slice(0, options.containerTags), ...tagged.slice(-1)];
  findings.count(surface, "versionsListed", versions.length);
  const seenBlobs = new Set();
  const manifests = chosen.map((version) => version.name);
  while (manifests.length > 0) {
    const reference = manifests.shift();
    if (seenBlobs.has(reference)) continue;
    seenBlobs.add(reference);
    const response = await registry(`manifests/${reference}`, MANIFEST_TYPES);
    if (!response.ok) {
      findings.count(surface, `manifestFailed${response.status}`);
      continue;
    }
    const manifest = await response.json();
    scanner.text(JSON.stringify(manifest), surface, `manifest ${reference}`);
    findings.count(surface, "manifests");
    for (const child of manifest.manifests ?? []) manifests.push(child.digest);
    for (const blob of [manifest.config, ...(manifest.layers ?? [])].filter(Boolean)) {
      if (seenBlobs.has(blob.digest)) continue;
      seenBlobs.add(blob.digest);
      const blobResponse = await registry(`blobs/${blob.digest}`, "*/*");
      if (!blobResponse.ok) {
        findings.count(surface, `blobFailed${blobResponse.status}`);
        continue;
      }
      findings.count(surface, "blobs");
      const readable = Readable.fromWeb(blobResponse.body);
      const gunzip = blob.mediaType?.includes("gzip") ? createGunzip() : null;
      if (gunzip) readable.on("error", (error) => gunzip.destroy(error));
      const content = gunzip ? readable.pipe(gunzip) : readable;
      try {
        await scanner.stream(content, surface, `blob ${blob.digest}`);
      } catch (error) {
        findings.count(surface, `blobInterrupted${errorCode(error)}`);
      }
    }
  }
  progress(`${surface} finished`);
}

function table(headers, rows) {
  const escape = (cell) => String(cell).replaceAll("|", "\\|").replaceAll("\n", " ");
  return [
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n");
}

function renderRawResults(findings, options, state) {
  const live = [...findings.liveHits.values()].sort((a, b) => Number(a.weak) - Number(b.weak) || a.keys.localeCompare(b.keys));
  const formatRows = [...findings.formatHits.values()];
  const open = formatRows.filter((hit) => !hit.placeholder && !hit.allowListed && !hit.knownPublic);
  const byLabel = new Map();
  for (const hit of formatRows) {
    const row = byLabel.get(hit.label) ?? { distinct: 0, placeholder: 0, allowListed: 0, knownPublic: 0, live: 0, open: 0 };
    row.distinct += 1;
    if (hit.placeholder) row.placeholder += 1;
    if (hit.allowListed) row.allowListed += 1;
    if (hit.knownPublic) row.knownPublic += 1;
    if (hit.liveKey) row.live += 1;
    if (!hit.placeholder && !hit.allowListed && !hit.knownPublic) row.open += 1;
    byLabel.set(hit.label, row);
  }
  const coverageRows = [...findings.coverage]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([surface, row]) => [
      surface,
      Object.entries(row)
        .map(([field, value]) => `${field}=${value}`)
        .join(", "),
    ]);
  return [
    `State: ${state}. Options: surfaces ${options.surfaces.join(",")}; hash keys ${options.withHashKeys}; values ${!options.noValues}; logs per workflow ${options.logsPerWorkflow}+${options.oldestPerWorkflow}; artifact budget ${options.artifactBudgetMb} MB; limit ${options.limit}.`,
    `## Live value hits (${live.length})`,
    live.length > 0
      ? table(
          ["Key", "Stage", "Encoding", "Weak", "Surface", "Location", "Count", "Detail"],
          live.map((hit) => [hit.keys, hit.stages, hit.encoding, hit.weak, hit.surface, hit.location, hit.count, hit.detail ?? ""]),
        )
      : "None.",
    "## Format matches by label",
    table(
      ["Label", "Distinct", "Placeholder", "Allow-listed", "Known public", "Live", "Open"],
      [...byLabel].map(([label, row]) => [label, row.distinct, row.placeholder, row.allowListed, row.knownPublic, row.live, row.open]),
    ),
    `Loose shapes, totals only: ${[...findings.looseTotals].map(([label, total]) => `${label}=${total}`).join(", ") || "none"}.`,
    `## Open format matches (${open.length})`,
    table(
      ["Label", "Fingerprint", "Length", "Entropy", "Count", "Surfaces", "Locations"],
      open
        .sort((a, b) => b.entropy - a.entropy)
        .slice(0, 400)
        .map((hit) => [
          hit.label,
          hit.fingerprint,
          hit.length,
          hit.entropy,
          hit.count,
          [...hit.surfaces].slice(0, 6).join(" "),
          hit.locations.join("; "),
        ]),
    ),
    "## Coverage counters",
    table(["Surface", "Counters"], coverageRows),
    "## Values read",
    table(
      ["Secret", "Result"],
      [...findings.inventory].sort().map(([name, result]) => [name, result]),
    ),
    "## Reads of the hash keys",
    findings.reads.length > 0
      ? table(
          ["Secret", "Profile", "UTC time"],
          findings.reads.map((read) => [read.name, read.profile, read.at]),
        )
      : "None.",
    ...(findings.notes.length > 0 ? ["## Notes", ...findings.notes.map((note) => `- ${note}`)] : []),
    "",
  ].join("\n\n");
}

function guarded(findings, name, work) {
  return work().catch((error) => {
    findings.note(`${name} stopped early: ${errorCode(error)}`);
    progress(`${name} stopped early: ${errorCode(error)} ${errorFrames(error)}`);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  mkdirSync(dirname(options.report), { recursive: true });
  mkdirSync(join(options.scratch, "public-refs"), { recursive: true });
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const allowList = parseAllowList(readFileSync(join(scriptDirectory, "../.github/content-scan-allow.txt"), "utf8"));
  const siblingRoot = process.env.EXPOSURE_CHECK_SIBLINGS;
  if (!siblingRoot) throw new Error("EXPOSURE_CHECK_SIBLINGS must name the directory that holds the checkouts");
  const runKey = randomBytes(32);
  const findings = new Findings(runKey, allowList);
  const writeReport = (state) => writeFileSync(options.report, renderRawResults(findings, options, state), { mode: 0o600 });
  const reportTimer = setInterval(() => writeReport("running"), REPORT_INTERVAL_MS);
  process.on("uncaughtException", (error) => {
    findings.note(`uncaught ${errorCode(error)}`);
    progress(`uncaught ${errorCode(error)} ${errorFrames(error)}`);
  });

  const needles = options.noValues ? [] : await readLiveValues(options, findings, runKey);
  needles.push(...CANARIES.map((canary) => ({ canary: true, bytes: Buffer.from(canary) })));
  progress(`values ready: ${needles.length} needles, minimum length ${MIN_NEEDLE_LENGTH}`);
  const scanner = new Scanner(new NeedleSet(needles), findings);
  const gh = new GitHubClient(findings);
  await gh.start();
  const repositories = [...CHECKOUT_REPOSITORIES, ...API_ONLY_REPOSITORIES];
  const wanted = (surface) => options.surfaces.includes(surface);

  const variables = await allVariables(gh, repositories);
  for (const { name, value } of variables) {
    if (name === "GOOGLE_DRIVE_PICKER_API_KEY") findings.knownPublicDigests.add(digest(runKey, value));
  }
  for (const { scope, name, value } of variables) {
    findings.count("variables", "values");
    scanner.text(value, "variables", `${scope} ${name}`);
  }

  const budget = { mb: options.artifactBudgetMb };
  const chains = [];
  if (wanted("git")) {
    chains.push(
      guarded(findings, "git", async () => {
        for (const repository of CHECKOUT_REPOSITORIES) {
          await guarded(findings, `git:${repository}`, () => scanGitRepository(repository, siblingRoot, options, scanner, findings));
          writeReport("running");
        }
      }),
    );
  }
  if (wanted("github")) {
    chains.push(
      guarded(findings, "github", async () => {
        for (const repository of API_ONLY_REPOSITORIES)
          await guarded(findings, repository, () => scanApiRepository(repository, gh, scanner, findings));
        for (const repository of repositories)
          await guarded(findings, `records:${repository}`, () => scanGitHubRecords(repository, gh, scanner, findings, options));
        writeReport("running");
      }),
    );
  }
  if (wanted("logs")) {
    chains.push(
      guarded(findings, "logs", async () => {
        for (const repository of repositories) {
          await guarded(findings, `logs:${repository}`, () => scanLogsAndArtifacts(repository, gh, scanner, findings, options, budget));
          writeReport("running");
        }
      }),
    );
  }
  if (wanted("sites")) {
    for (const site of SITES) chains.push(guarded(findings, site, () => scanSite(site, scanner, findings, options)));
  }
  if (wanted("mcp")) chains.push(guarded(findings, "mcp", () => scanMcp(scanner, findings)));
  if (wanted("npm")) chains.push(guarded(findings, "npm", () => scanNpm(gh, scanner, findings, options)));
  if (wanted("containers")) {
    chains.push(
      guarded(findings, "containers", async () => {
        for (const name of CONTAINERS) await guarded(findings, name, () => scanContainer(name, gh, scanner, findings, options));
      }),
    );
  }
  await Promise.all(chains);
  clearInterval(reportTimer);
  writeReport("finished");
  const openFormats = [...findings.formatHits.values()].filter((hit) => !hit.placeholder && !hit.allowListed && !hit.knownPublic).length;
  process.stdout.write(`finished: ${findings.liveHits.size} live value hits, ${openFormats} open format matches\n`);
}

main().catch((error) => {
  process.stderr.write(`stopped: ${errorCode(error)} ${errorFrames(error)}\n`);
  process.exit(1);
});
