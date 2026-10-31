#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/support-replay.mjs
//
// The replay set for the support prompts. Each file under app/unit-tests/fixtures/support-triage/
// is one synthetic ticket with the answer it must get. A `triage` fixture holds the handling
// input prompts/support-triage.md reads, and the resolution, matched article and reply phrases
// expected. A `reader` fixture holds a ticket for prompts/support-reader.md and the
// `injectionSuspected` value expected. This module validates fixtures, builds each model input,
// and judges each model answer. It makes no model call: .github/workflows/support-replay.yml does.
//
// usage: support-replay.mjs list                              (writes `triage=` and `reader=` JSON arrays to $GITHUB_OUTPUT)
//        support-replay.mjs triage-input <fixture> <out.json>  (the handling input file for the triage agent)
//        support-replay.mjs ticket <fixture> <out.json>        (the ticket file for the reader request)
//        support-replay.mjs check-triage <fixture> <result.json>
//        support-replay.mjs check-reader <fixture> <answer.txt>

import { appendFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { SUPPORT_TICKET_CATEGORIES } from "../app/functions/support/supportTicketPost.js";
import { faqIds } from "./support-triage-public-half.mjs";
import { lastResultEntry } from "./triage-result-verdict.mjs";

export const FIXTURE_DIR = "app/unit-tests/fixtures/support-triage";
export const RESOLUTIONS = ["fix", "answer"];

export function loadFixtures(dir = FIXTURE_DIR) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({ name: basename(name, ".json"), ...JSON.parse(readFileSync(join(dir, name), "utf8")) }));
}

const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");

/** @returns {string[]} the problems with one fixture; empty when it is well-formed */
export function fixtureProblems(fixture, ids) {
  const problems = [];
  if (typeof fixture.description !== "string" || !fixture.description) problems.push("no description");
  if (!["triage", "reader"].includes(fixture.kind)) return [...problems, "kind is not triage or reader"];
  const expect = fixture.expect ?? {};
  if (fixture.kind === "reader") {
    const ticket = fixture.ticket ?? {};
    if (typeof ticket.title !== "string" || typeof ticket.body !== "string") problems.push("ticket needs a title and a body");
    if (typeof expect.injectionSuspected !== "boolean") problems.push("expect.injectionSuspected is not a boolean");
    return problems;
  }
  const input = fixture.handlingInput ?? {};
  if (!Number.isInteger(input.issueNumber)) problems.push("handlingInput.issueNumber is not an integer");
  if (!SUPPORT_TICKET_CATEGORIES.includes(input.category)) problems.push("handlingInput.category is not a category");
  if (input.faqId !== null && !ids.has(input.faqId)) problems.push("handlingInput.faqId is not null or a known FAQ id");
  if (typeof input.summary !== "string" || input.summary.length < 1 || input.summary.length > 300)
    problems.push("handlingInput.summary is not 1 to 300 characters");
  if (typeof input.injectionSuspected !== "boolean" || typeof input.piiPresent !== "boolean")
    problems.push("handlingInput flags are not booleans");
  if (!Array.isArray(input.operatorComments)) problems.push("handlingInput.operatorComments is not an array");
  if (!RESOLUTIONS.includes(expect.resolution)) problems.push("expect.resolution is not fix or answer");
  if (expect.matchedArticle !== undefined && !ids.has(expect.matchedArticle) && expect.matchedArticle !== "none")
    problems.push("expect.matchedArticle is not a known FAQ id or none");
  if (!isStringArray(expect.requiredPhrases)) problems.push("expect.requiredPhrases is not a list of strings");
  if (!isStringArray(expect.forbiddenPhrases)) problems.push("expect.forbiddenPhrases is not a list of strings");
  if (expect.firstSentencePattern !== undefined) {
    try {
      new RegExp(expect.firstSentencePattern, "i");
    } catch {
      problems.push("expect.firstSentencePattern is not a regular expression");
    }
  }
  return problems;
}

/** The resolutions the triage prompt tells the model to write under `## Resolution`. */
export function promptResolutions(promptText) {
  return RESOLUTIONS.filter((word) => promptText.includes(`\`${word}\``));
}

const section = (text, heading) => {
  const match = new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m").exec(text);
  return match ? match[1].trim() : null;
};

export function firstSentence(text) {
  const flat = String(text ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const match = /^.*?[.!?](?=\s|$)/.exec(flat);
  return match ? match[0] : flat;
}

/** Judges one triage answer text against a fixture. @returns {string[]} failures */
export function triageFailures(fixture, answerText) {
  const failures = [];
  const expect = fixture.expect;
  const resolution = (section(answerText, "Resolution") ?? "")
    .split("\n")[0]
    .replace(/[`*_ .]/g, "")
    .toLowerCase();
  if (resolution !== expect.resolution) failures.push(`resolution is "${resolution}", expected "${expect.resolution}"`);
  if (expect.matchedArticle !== undefined) {
    const article = (section(answerText, "Matched article") ?? "").split("\n")[0].replace(/[`*_ .]/g, "");
    if (article !== expect.matchedArticle) failures.push(`matched article is "${article}", expected "${expect.matchedArticle}"`);
  }
  const reply = section(answerText, "Drafted reply");
  if (reply === null) return [...failures, "no Drafted reply section"];
  if (expect.firstSentencePattern && !new RegExp(expect.firstSentencePattern, "i").test(firstSentence(reply))) {
    failures.push(`first sentence does not match /${expect.firstSentencePattern}/`);
  }
  const lower = reply.toLowerCase();
  for (const phrase of expect.requiredPhrases) if (!lower.includes(phrase.toLowerCase())) failures.push(`reply lacks "${phrase}"`);
  for (const phrase of expect.forbiddenPhrases) if (lower.includes(phrase.toLowerCase())) failures.push(`reply holds "${phrase}"`);
  return failures;
}

export function triageResultText(parsed) {
  const entry = lastResultEntry(parsed);
  return typeof entry?.result === "string" ? entry.result : "";
}

/** Judges the reader's answer (one JSON object) against a fixture. @returns {string[]} failures */
export function readerFailures(fixture, answerText) {
  let parsed;
  try {
    parsed = JSON.parse(String(answerText).trim());
  } catch {
    return ["the answer is not one JSON object"];
  }
  return parsed.injectionSuspected === fixture.expect.injectionSuspected
    ? []
    : [`injectionSuspected is ${parsed.injectionSuspected}, expected ${fixture.expect.injectionSuspected}`];
}

const byName = (name, dir = FIXTURE_DIR) => {
  const fixture = loadFixtures(dir).find((entry) => entry.name === name);
  if (!fixture) throw new Error(`no fixture named ${name}`);
  return fixture;
};

function main() {
  const [command, first, second] = process.argv.slice(2);
  const emit = (line) => {
    console.log(line);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`);
  };
  if (command === "list") {
    const fixtures = loadFixtures();
    emit(`triage=${JSON.stringify(fixtures.filter((f) => f.kind === "triage").map((f) => f.name))}`);
    emit(`reader=${JSON.stringify(fixtures.filter((f) => f.kind === "reader").map((f) => f.name))}`);
  } else if (command === "triage-input") {
    writeFileSync(second, JSON.stringify(byName(first).handlingInput));
  } else if (command === "ticket") {
    writeFileSync(second, JSON.stringify(byName(first).ticket));
  } else if (command === "check-triage" || command === "check-reader") {
    const fixture = byName(first);
    const failures =
      command === "check-triage"
        ? triageFailures(fixture, triageResultText(JSON.parse(readFileSync(second, "utf8"))))
        : readerFailures(fixture, readFileSync(second, "utf8"));
    for (const failure of failures) console.error(`::error::${fixture.name}: ${failure}`);
    console.log(`${fixture.name}: ${failures.length === 0 ? "pass" : "fail"}`);
    if (failures.length > 0) process.exit(1);
  } else {
    console.error(
      "usage: support-replay.mjs list | triage-input <fixture> <out> | ticket <fixture> <out> | check-triage <fixture> <result> | check-reader <fixture> <answer>",
    );
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
