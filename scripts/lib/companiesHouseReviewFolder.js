// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/companiesHouseReviewFolder.js
// Reads a finished review folder back into the review objects the page and the walkthrough take,
// without building a document, posting to the validator or calling gh. The findings rows are read
// as written, so a Look row a person filled in stays filled in, and a folder written before a
// criterion existed shows the rows it has.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { reconcile } from "./companiesHouseReviewReconcile.js";
import { fixtureLineOf, gatewayState } from "./companiesHouseReviewPage.js";

export function parseFindings(markdown) {
  const sections = [];
  for (const line of markdown.split("\n")) {
    const heading = line.match(/^## (\S+): (.*)$/);
    if (heading) {
      sections.push({ directory: heading[1], title: heading[2].trim(), caseName: "", rows: [] });
      continue;
    }
    const current = sections[sections.length - 1];
    if (!current) continue;
    const caseName = line.match(/^Fixture case `([^`]+)`/);
    if (caseName) current.caseName = caseName[1];
    if (line.startsWith("| ") && !line.startsWith("| Criterion") && !line.startsWith("|---")) {
      const cells = line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim());
      if (cells.length >= 4) {
        const [criterion, result, evidence, path] = cells;
        current.rows.push({
          criterion,
          result,
          evidence,
          file: path.startsWith(`${current.directory}/`) ? path.slice(current.directory.length + 1) : path,
        });
      }
    }
  }
  return sections;
}

const readText = (path) => (existsSync(path) ? readFileSync(path, "utf8") : null);

export function readReviewFolder(outDir, fixtureText) {
  const sections = parseFindings(readFileSync(join(outDir, "findings.md"), "utf8"));
  return sections.map((section) => {
    const caseDir = join(outDir, section.directory);
    const input = JSON.parse(readFileSync(join(caseDir, "source", "case-input.json"), "utf8"));
    const facts = JSON.parse(readFileSync(join(caseDir, "facts.json"), "utf8"));
    const visibleText = readFileSync(join(caseDir, "visible-text.txt"), "utf8");
    const validatorText = readText(join(caseDir, "validator.txt")) ?? "";
    const verdict =
      validatorText.match(/RESULT: (valid|not valid|could not determine[^\n]*)/)?.[1] ??
      (validatorText.trim() === "skipped" ? "skipped" : "no result");
    const referenceDir = join(caseDir, "reference");
    const exampleRaw = existsSync(referenceDir)
      ? (readdirSync(referenceDir).find((name) => /^Prod.*\.html$/.test(name)) ?? "none")
      : "none";
    const submissionNumber = readText(join(caseDir, "submission.txt"))?.match(/Submission number: (\S+)/)?.[1] ?? "unknown";
    const submitResponse = readText(join(caseDir, "source", "submit-response.xml"));
    return {
      directory: section.directory,
      title: section.title,
      caseName: section.caseName,
      input,
      fixtureLine: fixtureLineOf(fixtureText, input.name),
      submissionNumber,
      rows: section.rows,
      reconciliation: reconcile(input, { facts, visibleText }),
      validator: { verdict, output: validatorText },
      visibleText,
      gateway:
        submitResponse === null
          ? gatewayState(null, null)
          : gatewayState(submitResponse, readText(join(caseDir, "source", "last-poll-response.xml"))),
      exampleRaw,
      exampleCompany: exampleRaw.split("_")[2] ?? "unknown",
    };
  });
}
