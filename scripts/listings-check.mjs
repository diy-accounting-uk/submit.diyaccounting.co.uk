#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/listings-check.mjs
//
// Usage: node scripts/listings-check.mjs [--issue-body <file>]
// Exits 1 and prints each problem when the register disagrees with the catalogue. With
// --issue-body it also writes the problems to that file as an issue body.

import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { listingProblems, readListings } from "./listings-register.mjs";

export function main(argv = process.argv.slice(2), register = readListings()) {
  const bodyIndex = argv.indexOf("--issue-body");
  const bodyFile = bodyIndex >= 0 ? argv[bodyIndex + 1] : null;
  const problems = listingProblems(register);
  if (problems.length === 0) {
    console.log(`The listing register is sound: ${register.listings.length} listings, ${register.products.length} products.`);
    return 0;
  }
  for (const problem of problems) console.error(problem);
  if (bodyFile) {
    const lines = problems.map((problem) => `- ${problem}`).join("\n");
    fs.writeFileSync(
      bodyFile,
      `The monthly listings check found ${problems.length} problem${problems.length === 1 ? "" : "s"} in the listing register (web/marketing/marketing.toml):\n\n${lines}\n\nEdit the register or the copy pack, run \`npm run marketing:build\`, and update the listing at each place.\n`,
    );
  }
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
