#!/usr/bin/env node
/**
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 *
 * One-off script: fetch the FRS 102 entry point the Companies House accounts TIS points micro-
 * entity filings at, and the schema modules it pulls in, then write out the flat list of element
 * names the iXBRL generator (app/services/microEntityAccountsIxbrl.js) checks every concept it
 * emits against.
 *
 * Usage:
 *   node scripts/generate-frc-taxonomy-concepts.js
 *
 * Writes fixtures/frc-taxonomy/frs-102-2026-concepts.json. Run again whenever the entry point
 * moves to a later FRC taxonomy year.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ENTRY_POINT_URL = "https://xbrl.frc.org.uk/FRS-102/2026-01-01/FRS-102-2026-01-01.xsd";

// The entry point imports frc-core, which in turn imports these. Fetched directly here rather
// than by following <import> elements generically, because the closure is small, fixed, and
// known in advance.
const MODULE_URLS = {
  bus: "https://xbrl.frc.org.uk/cd/2026-01-01/business/bus-2026-01-01.xsd",
  core: "https://xbrl.frc.org.uk/fr/2026-01-01/core/frc-core-2026-01-01.xsd",
  direp: "https://xbrl.frc.org.uk/reports/2026-01-01/direp/direp-2026-01-01.xsd",
};

const OUTPUT_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "frc-taxonomy", "frs-102-2026-concepts.json");

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetching ${url} failed with status ${response.status}`);
  }
  return response.text();
}

function extractElementNames(schemaXml) {
  const names = [];
  const elementPattern = /<(?:[a-zA-Z0-9]+:)?element\b[^>]*\bname="([^"]+)"/g;
  let match;
  while ((match = elementPattern.exec(schemaXml)) !== null) {
    names.push(match[1]);
  }
  return names;
}

function extractTargetNamespace(schemaXml) {
  const match = schemaXml.match(/targetNamespace="([^"]+)"/);
  if (!match) {
    throw new Error("No targetNamespace found in schema");
  }
  return match[1];
}

async function main() {
  console.log(`Fetching entry point: ${ENTRY_POINT_URL}`);
  await fetchText(ENTRY_POINT_URL);

  const namespaces = {};
  const concepts = [];

  for (const [prefix, url] of Object.entries(MODULE_URLS)) {
    console.log(`Fetching ${prefix}: ${url}`);
    const schemaXml = await fetchText(url);
    namespaces[prefix] = extractTargetNamespace(schemaXml);
    const names = extractElementNames(schemaXml);
    console.log(`  ${names.length} elements`);
    for (const name of names) {
      concepts.push(`${prefix}:${name}`);
    }
  }

  const output = {
    entryPoint: ENTRY_POINT_URL,
    namespaces,
    concepts: Array.from(new Set(concepts)).sort(),
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`Wrote ${output.concepts.length} concepts to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
