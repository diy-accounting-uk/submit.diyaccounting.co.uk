// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Usage: node scripts/write-ixds-fixtures.mjs
// Writes the Inline XBRL document set fixtures under web/browser-tests/fixtures/ from ixdsTwoFileSets,
// which web/unit-tests/ixdsFixtures.test.js compares them with.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ixdsTwoFileSets } from "../app/test-helpers/accountsDocumentCases.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "browser-tests", "fixtures");

for (const [directory, files] of Object.entries(ixdsTwoFileSets())) {
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(FIXTURES, directory, name), content);
    console.log(`Wrote ${directory}/${name}`);
  }
}
