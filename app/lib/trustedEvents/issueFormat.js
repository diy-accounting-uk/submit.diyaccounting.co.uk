// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/trustedEvents/issueFormat.js
//
// The text of a trusted-event issue and its comments. Code writes every line, in a fixed order,
// because the source check parses the body and hashes it.

import { createHash } from "node:crypto";
import { appendAutomationDisclosure } from "../gitHubHelpers.js";

export const SOURCES = ["aws.health", "aws.acm", "route53domains", "companies-house", "aws.budgets", "aws.ce"];

const BODY_HEADING = "## Trusted event";
const TITLE_LIMIT = 120;
const LINE_PATTERN = /^\*\*([^*]+):\*\* ?(.*)$/;

export function singleLine(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Every [name, value] pair of the fact's block, from Source to the last source line, in body
 * order. A fact carries the pairs of its own source in `lines`.
 */
export function fullLines(fact, context) {
  return [
    ["Source", fact.source],
    ["Key", fact.key],
    ["Version", fact.version],
    ["Account", `${fact.account || context.account} (${context.env})`],
    ["Region", fact.region],
    ["Observed", context.observed],
    ["Source id", context.sourceId],
    ...fact.lines,
  ].map(([name, value]) => [name, singleLine(value)]);
}

export function buildTitle(fact, context) {
  const subject = fact.scopeInTitle ? `${fact.subject} (${fact.region}, ${context.env})` : fact.subject;
  return `[EVENT] ${fact.source}: ${singleLine(subject)}`.slice(0, TITLE_LIMIT);
}

export function buildBody(fact, context) {
  const pairs = fullLines(fact, context);
  const parts = [BODY_HEADING, ...pairs.map(([name, value]) => `**${name}:** ${value}`)];
  let text = parts.join("\n");
  if (fact.description) {
    text += `\n\n\`\`\`text\n${fact.description.replaceAll("```", "'''")}\n\`\`\``;
  }
  text += `\n\nVerify: \`gh workflow run trusted-event-verify.yml -f environment=${context.env} -f issue-number=<n>\``;
  return appendAutomationDisclosure(text);
}

export function buildComment(fact, context) {
  return buildBody(fact, context);
}

/**
 * Reads the block back from an issue body. Returns null when the heading or a required line is
 * missing, or when the source is not one of the six.
 */
export function parseBody(body) {
  const text = String(body ?? "");
  const start = text.indexOf(BODY_HEADING);
  if (start < 0) return null;
  const lines = [];
  for (const line of text
    .slice(start + BODY_HEADING.length)
    .split("\n")
    .slice(1)) {
    const match = LINE_PATTERN.exec(line);
    if (!match) break;
    lines.push([match[1], match[2].trim()]);
  }
  const valueOf = (name) => lines.find(([lineName]) => lineName === name)?.[1];
  const source = valueOf("Source");
  const key = valueOf("Key");
  const version = valueOf("Version");
  if (!source || !key || !version || !SOURCES.includes(source)) return null;
  return { source, key, version, lines };
}

export function factHash(source, key, version, lines) {
  return createHash("sha256")
    .update(JSON.stringify([source, key, version, lines]))
    .digest("hex");
}

export function hashOfParsed(parsed) {
  return factHash(parsed.source, parsed.key, parsed.version, parsed.lines);
}

export function lineValue(parsed, name) {
  return parsed.lines.find(([lineName]) => lineName === name)?.[1];
}
