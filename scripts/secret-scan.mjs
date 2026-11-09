#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/secret-scan.mjs
//
// Scans the workspace repositories for committed and uncommitted secrets with gitleaks and
// trufflehog. It never verifies a value with a vendor, and it never prints, logs or writes a
// value: records are reduced to rule, place, entropy and fingerprint before anything else reads
// them. The report goes to one path inside the private repository, and the script refuses any
// other path.
//
// Usage: node scripts/secret-scan.mjs --workspace <dir> --report <path> [--classes <json>]
//        [--repos a,b] [--skip-trufflehog] [--trufflehog-minutes <n>] [--reuse <scratch>] [--scratch <dir>]

import { spawn, execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  applyClasses,
  applyRefs,
  assertReportPath,
  dropIgnored,
  parseIgnoreFile,
  renderReport,
  shapeGitleaks,
  shapeTrufflehogLine,
} from "./lib/secret-scan-report.mjs";

const run = promisify(execFile);

export const WORKSPACE_REPOSITORIES = [
  "submit.diyaccounting.co.uk",
  "spreadsheets.diyaccounting.co.uk",
  "www.diyaccounting.co.uk",
  "root.diyaccounting.co.uk",
  "diy-accounting-archive",
  "private.diyaccounting.co.uk",
];

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function parseArgs(argv) {
  const options = {
    workspace: null,
    report: null,
    classes: null,
    repos: WORKSPACE_REPOSITORIES,
    skipTrufflehog: false,
    scratch: null,
    trufflehogMinutes: 0,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--workspace") options.workspace = argv[++index];
    else if (flag === "--report") options.report = argv[++index];
    else if (flag === "--classes") options.classes = argv[++index];
    else if (flag === "--repos") options.repos = argv[++index].split(",");
    else if (flag === "--scratch") options.scratch = argv[++index];
    else if (flag === "--trufflehog-minutes") options.trufflehogMinutes = Number(argv[++index]);
    else if (flag === "--reuse") options.reuse = argv[++index];
    else if (flag === "--skip-trufflehog") options.skipTrufflehog = true;
    else throw new Error(`unknown argument ${flag}`);
  }
  if (!options.workspace || !options.report) throw new Error("--workspace and --report are required");
  return options;
}

function spawnToLines(command, args, onLine, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
    const lines = createInterface({ input: child.stdout });
    lines.on("line", onLine);
    // trufflehog ignores SIGTERM on a large history, so a timeout stops it with SIGKILL.
    const timer = timeoutMs ? setTimeout(() => child.kill("SIGKILL"), timeoutMs) : null;
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      resolvePromise(signal ? "timed out" : code);
    });
  });
}

async function runGitleaks(args, scratch) {
  const reportFile = join(scratch, `gitleaks-${process.hrtime.bigint()}.json`);
  const code = await new Promise((resolvePromise, reject) => {
    const child = spawn(
      "gitleaks",
      [...args, "--redact", "--no-banner", "--report-format", "json", "--report-path", reportFile, "--exit-code", "0"],
      { stdio: "ignore" },
    );
    child.on("error", reject);
    child.on("close", resolvePromise);
  });
  if (code !== 0) throw new Error(`gitleaks exited ${code}`);
  const records = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, "utf8") || "[]") : [];
  rmSync(reportFile, { force: true });
  return records;
}

async function git(repoPath, args) {
  const { stdout } = await run("git", ["-C", repoPath, ...args], { maxBuffer: 256 * 1024 * 1024 });
  return stdout;
}

export async function refsContaining(repoPath, commits) {
  const wanted = new Set(commits);
  const map = new Map();
  if (wanted.size === 0) return map;
  const refs = (await git(repoPath, ["for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes", "refs/tags"]))
    .split("\n")
    .filter((ref) => ref && !ref.endsWith("/HEAD"));
  for (const ref of refs) {
    const short = ref.replace(/^refs\/(heads|remotes|tags)\//, (_, kind) => (kind === "remotes" ? "" : kind === "tags" ? "tag:" : ""));
    const label = ref.startsWith("refs/remotes/") ? `origin/${ref.replace(/^refs\/remotes\/[^/]+\//, "")}` : short;
    const hashes = (await git(repoPath, ["rev-list", ref])).split("\n");
    for (const hash of hashes) {
      if (!wanted.has(hash)) continue;
      if (!map.has(hash)) map.set(hash, []);
      map.get(hash).push(label);
    }
  }
  for (const [hash, labels] of map) map.set(hash, [...new Set(labels)].sort().slice(0, 6));
  return map;
}

async function refCount(repoPath) {
  return (await git(repoPath, ["for-each-ref", "refs/heads", "refs/remotes"])).split("\n").filter((line) => line && !line.includes("/HEAD"))
    .length;
}

async function worktrees(repoPath) {
  const out = await git(repoPath, ["worktree", "list", "--porcelain"]);
  return out
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length))
    .filter((path) => existsSync(path));
}

async function uncommittedFiles(worktreePath) {
  const out = await git(worktreePath, ["status", "--porcelain", "-z", "--untracked-files=all"]);
  const entries = out.split("\0").filter(Boolean);
  const files = [];
  for (let index = 0; index < entries.length; index += 1) {
    const status = entries[index].slice(0, 2);
    const path = entries[index].slice(3);
    if (status[0] === "R" || status[0] === "C") index += 1;
    if (status.includes("D")) continue;
    files.push(path);
  }
  return files;
}

function stageFiles(worktreePath, files, destination) {
  let staged = 0;
  for (const file of files) {
    const source = join(worktreePath, file);
    try {
      const info = statSync(source);
      if (!info.isFile() || info.size > MAX_FILE_BYTES) continue;
      mkdirSync(dirname(join(destination, file)), { recursive: true });
      copyFileSync(source, join(destination, file));
      staged += 1;
    } catch {
      // A file that vanished between listing and copying has nothing to scan.
    }
  }
  return staged;
}

async function scanRepository(repository, workspace, scratch, skipTrufflehog, trufflehogMinutes) {
  const repoPath = join(workspace, repository);
  const ignored = existsSync(join(repoPath, ".gitleaksignore"))
    ? parseIgnoreFile(readFileSync(join(repoPath, ".gitleaksignore"), "utf8"))
    : new Set();
  const findings = [];
  const coverage = {
    repository,
    refs: await refCount(repoPath),
    worktrees: 0,
    uncommittedFiles: 0,
    history: "gitleaks git --all",
    trufflehog: skipTrufflehog ? "skipped" : "git, no verification",
  };

  const history = shapeGitleaks(await runGitleaks(["git", repoPath, "--log-opts=--all"], scratch), { repository, source: "history" });
  const refs = await refsContaining(repoPath, new Set(history.map((finding) => finding.commit).filter(Boolean)));
  findings.push(...applyRefs(history, refs));

  for (const worktreePath of await worktrees(repoPath)) {
    coverage.worktrees += 1;
    const files = await uncommittedFiles(worktreePath);
    if (files.length === 0) continue;
    const stage = mkdtempSync(join(scratch, "stage-"));
    coverage.uncommittedFiles += stageFiles(worktreePath, files, stage);
    findings.push(
      ...shapeGitleaks(await runGitleaks(["dir", stage], scratch), {
        repository,
        source: "uncommitted",
        worktree: worktreePath.replace(`${workspace}/`, ""),
        pathPrefix: `${stage}/`,
      }),
    );
    rmSync(stage, { recursive: true, force: true });
  }

  if (!skipTrufflehog) {
    const truffle = [];
    const code = await spawnToLines(
      "trufflehog",
      ["git", `file://${repoPath}`, "--no-verification", "--json", "--no-update"],
      (line) => {
        const finding = shapeTrufflehogLine(line, { repository });
        if (finding) truffle.push(finding);
      },
      trufflehogMinutes * 60 * 1000,
    );
    if (code === "timed out") coverage.trufflehog = `partial: stopped after ${trufflehogMinutes} minutes`;
    else if (code !== 0 && code !== 183) coverage.trufflehog = `exit ${code}`;
    const trufflefound = applyRefs(
      truffle,
      await refsContaining(repoPath, new Set(truffle.map((finding) => finding.commit).filter(Boolean))),
    );
    findings.push(...trufflefound);
  }
  return { findings: dropIgnored(findings, ignored), coverage };
}

function proposedIgnores(findings) {
  const map = new Map();
  for (const finding of findings) {
    if (finding.detector !== "gitleaks" || finding.source !== "history") continue;
    if (finding.class !== "test fixture" && finding.class !== "example" && finding.class !== "false positive") continue;
    if (!map.has(finding.repository)) map.set(finding.repository, []);
    map.get(finding.repository).push(finding.fingerprint);
  }
  return map;
}

export async function main(argv) {
  const options = parseArgs(argv);
  const reportPath = assertReportPath(options.report);
  const workspace = resolve(options.workspace);
  const scratch = options.scratch ? resolve(options.scratch) : mkdtempSync(join(tmpdir(), "secret-scan-"));
  mkdirSync(scratch, { recursive: true });
  const classes = options.classes ? JSON.parse(readFileSync(options.classes, "utf8")) : {};
  let all = [];
  let coverage = [];
  if (options.reuse) {
    ({ findings: all, coverage } = JSON.parse(readFileSync(join(resolve(options.reuse), "scan.json"), "utf8")));
  } else {
    for (const repository of options.repos) {
      const result = await scanRepository(repository, workspace, scratch, options.skipTrufflehog, options.trufflehogMinutes);
      all.push(...result.findings);
      coverage.push(result.coverage);
      console.log(`${repository}: ${result.findings.length} findings`);
    }
    writeFileSync(join(scratch, "scan.json"), JSON.stringify({ findings: all, coverage }, null, 1));
  }
  const classified = applyClasses(all, classes);
  const date = new Date().toISOString().slice(0, 10);
  writeFileSync(reportPath, renderReport({ date, findings: classified, coverage, proposedIgnores: proposedIgnores(classified) }));
  writeFileSync(join(scratch, "findings.json"), JSON.stringify(classified, null, 1));
  console.log(`report: ${reportPath}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`secret-scan failed: ${error.code ?? error.name}`);
    process.exit(1);
  });
}
