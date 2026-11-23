// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/accountsRouteDescriptions.test.js
// The published description of the accounts render route names every regime its builders render a
// revision for.

import { describe, test, expect } from "vitest";
import fs from "node:fs";

const spec = JSON.parse(fs.readFileSync("web/public/docs/api/openapi.json", "utf8"));
const renderDescription = spec.paths["/companies-house/accounts/render"].post.description;

describe("the accounts render route's published description", () => {
  for (const [regime, builder] of [
    ["micro-entity", "app/services/microEntityAccountsIxbrl.js"],
    ["small company", "app/services/smallCompanyAccountsIxbrl.js"],
  ]) {
    test(`names ${regime} revisions, which its builder renders with a revision page`, () => {
      expect(fs.readFileSync(builder, "utf8")).toContain("revisionPage({");
      expect(renderDescription).toMatch(new RegExp(`revision renders revised [a-z -]*${regime}`));
    });
  }
});
