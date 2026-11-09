// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/secret-scan-report.mjs
//
// Shapes the output of gitleaks and trufflehog into findings that carry no detected value, and
// renders them as Markdown. A finding keeps the rule, repository, ref, commit, path, line, entropy
// and fingerprint. Every field that can hold a value (Secret, Match, Raw, RawV2, Redacted) is
// dropped here, before any other code sees the record.

import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";

export const REPORT_FOLDER_MARKER = `${sep}private.diyaccounting.co.uk${sep}security${sep}`;

export const FINDING_CLASSES = ["real key", "test fixture", "example", "false positive", "unclassified"];

export function assertReportPath(reportPath) {
  const full = resolve(reportPath);
  if (!full.includes(REPORT_FOLDER_MARKER) || !full.endsWith(".md")) {
    throw new Error("report path must be a .md file inside private.diyaccounting.co.uk/security/");
  }
  return full;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

export function shapeGitleaks(records, { repository, source, ref = null, worktree = null, pathPrefix = "" }) {
  return (Array.isArray(records) ? records : []).map((record) => ({
    detector: "gitleaks",
    rule: String(record.RuleID ?? "unknown"),
    repository,
    source,
    ref,
    worktree,
    commit: record.Commit ? String(record.Commit) : null,
    path: pathPrefix ? String(record.File ?? "").replace(pathPrefix, "") : String(record.File ?? ""),
    line: Number(record.StartLine ?? 0),
    entropy: finite(record.Entropy),
    fingerprint: String(record.Fingerprint ?? ""),
  }));
}

export function shapeTrufflehogLine(line, { repository }) {
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    return null;
  }
  const git = record?.SourceMetadata?.Data?.Git;
  if (!record?.DetectorName || !git) return null;
  const commit = git.commit ? String(git.commit) : null;
  const path = String(git.file ?? "");
  const lineNumber = Number(git.line ?? 0);
  const rule = String(record.DetectorName);
  const fingerprint = `${commit}:${path}:${rule}:${lineNumber}`;
  return {
    detector: "trufflehog",
    rule,
    repository,
    source: "history",
    ref: null,
    worktree: null,
    commit,
    path,
    line: lineNumber,
    entropy: null,
    fingerprint,
    fingerprintHash: createHash("sha256").update(fingerprint).digest("hex").slice(0, 16),
  };
}

export function parseIgnoreFile(text) {
  return new Set(
    String(text ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
}

export function dropIgnored(findings, ignored) {
  return findings.filter((finding) => !ignored.has(finding.fingerprint));
}

export function applyRefs(findings, refsByCommit) {
  return findings.map((finding) =>
    finding.commit && refsByCommit.has(finding.commit) ? { ...finding, ref: refsByCommit.get(finding.commit).join(", ") } : finding,
  );
}

export function applyClasses(findings, classes = {}) {
  return findings.map((finding) => {
    const entry = classes[finding.fingerprint];
    return { ...finding, class: entry?.class ?? "unclassified", note: entry?.note ?? "" };
  });
}

function countBy(findings, keyOf) {
  const counts = new Map();
  for (const finding of findings) counts.set(keyOf(finding), (counts.get(keyOf(finding)) ?? 0) + 1);
  return counts;
}

function cell(text) {
  return String(text ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}

export function renderReport({ date, findings, coverage, proposedIgnores }) {
  const lines = [];
  lines.push(`# Secret scan ${date}`, "");
  lines.push("No detected value appears in this file. Each row is a rule, a place and a fingerprint.", "");
  lines.push("## Counts", "");
  lines.push("| Class | Findings |", "|---|---|");
  const byClass = countBy(findings, (finding) => finding.class ?? "unclassified");
  for (const name of FINDING_CLASSES) lines.push(`| ${name} | ${byClass.get(name) ?? 0} |`);
  lines.push(`| total | ${findings.length} |`, "");
  lines.push("| Repository | Findings |", "|---|---|");
  for (const [repository, count] of [...countBy(findings, (finding) => finding.repository)].sort())
    lines.push(`| ${repository} | ${count} |`);
  lines.push("");
  lines.push("## Coverage", "");
  lines.push(
    "| Repository | Refs scanned | Worktrees scanned | Uncommitted files | History | Second detector |",
    "|---|---|---|---|---|---|",
  );
  for (const row of coverage) {
    lines.push(
      `| ${cell(row.repository)} | ${row.refs} | ${row.worktrees} | ${row.uncommittedFiles} | ${cell(row.history)} | ${cell(row.trufflehog)} |`,
    );
  }
  lines.push("");
  const real = findings.filter((finding) => finding.class === "real key");
  lines.push("## Real keys", "");
  if (real.length === 0) lines.push("None.", "");
  for (const finding of real) lines.push(`- ${finding.repository} ${finding.path}:${finding.line} (${finding.rule})`);
  if (real.length) lines.push("");
  lines.push("## Findings", "");
  const byRepository = new Map();
  for (const finding of findings) {
    if (!byRepository.has(finding.repository)) byRepository.set(finding.repository, []);
    byRepository.get(finding.repository).push(finding);
  }
  for (const [repository, rows] of [...byRepository].sort()) {
    lines.push(`### ${repository}`, "");
    lines.push("| Class | Rule | Detector | Where | Path:line | Entropy | Fingerprint |", "|---|---|---|---|---|---|---|");
    for (const finding of rows) {
      const where = finding.worktree
        ? `worktree ${finding.worktree}`
        : `${finding.commit ? finding.commit.slice(0, 10) : ""} ${finding.ref ?? ""}`.trim();
      lines.push(
        `| ${cell(finding.class)} | ${cell(finding.rule)} | ${finding.detector} | ${cell(where)} | ${cell(`${finding.path}:${finding.line}`)} | ${finding.entropy ?? ""} | \`${cell(finding.fingerprint)}\` |`,
      );
    }
    lines.push("");
  }
  lines.push("## Classification basis", "");
  const groups = new Map();
  for (const finding of findings) {
    if (!finding.note) continue;
    const key = `${finding.repository} | ${finding.class} | ${finding.rule} | ${finding.note}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  if (groups.size === 0) lines.push("None.", "");
  for (const [key, count] of [...groups].sort()) lines.push(`- ${count} x ${key}`);
  if (groups.size) lines.push("");
  lines.push("## Proposed .gitleaksignore entries", "");
  const entries = [...(proposedIgnores ?? new Map())].filter(([, list]) => list.length);
  if (entries.length === 0) lines.push("None.", "");
  for (const [repository, list] of entries) {
    lines.push(`### ${repository}`, "", "```");
    lines.push(...list, "```", "");
  }
  return `${lines.join("\n")}\n`;
}
