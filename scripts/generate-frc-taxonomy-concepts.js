#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability CH-13 Map the FRC iXBRL taxonomy and validate accounts
// - **Use when:** the FRS 102/105 taxonomy fixture needs refreshing, or a generated iXBRL document needs checking against Companies House's validator.
// - **Does:** generate-frc-taxonomy-concepts.js fetches the FRS 102 entry-point schema from the FRC taxonomy site and writes the flat concept-name list to fixtures/frc-taxonomy/frs-102-2026-concepts.json. loadFrcTaxonomyConcepts loads and caches that list for the iXBRL generator to check every emitted concept against. validate-accounts-ixbrl.js posts a generated micro-entity iXBRL document to Companies House's public XBRL test validator over the network.
// - **Run:** `node scripts/generate-frc-taxonomy-concepts.js`; `npm run validate:accounts-ixbrl`; `node scripts/validate-accounts-ixbrl.js <path-to-ixbrl-file>`
// - **Entry:** `scripts/generate-frc-taxonomy-concepts.js:main`; `scripts/validate-accounts-ixbrl.js:main`; `app/services/accountsIxbrlCommon.js:loadFrcTaxonomyConcepts`
// - **Files:** scripts/generate-frc-taxonomy-concepts.js, scripts/validate-accounts-ixbrl.js
// - **Keywords:** frc taxonomy, frs 102, frs 105, ixbrl, concepts fixture, xbrl validator, companies house, taxonomy schema
// - **Related:** CH-08, CH-07
// @end-capability

/**
 *
 * One-off script: fetch the FRS 102 entry point the Companies House accounts TIS points micro-
 * entity filings at, and the schema modules it pulls in, then write out the flat list of element
 * names the iXBRL generator (app/services/accountsIxbrlCommon.js) checks every concept it
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
  accrep: "https://xbrl.frc.org.uk/reports/2026-01-01/accrep/accrep-2026-01-01.xsd",
  curr: "https://xbrl.frc.org.uk/cd/2026-01-01/currencies/currencies-2026-01-01.xsd",
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
