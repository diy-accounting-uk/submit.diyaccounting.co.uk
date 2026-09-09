// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Ephemeral-port static file server for web/public, used only to drive
// local accessibility scans (pa11y/axe/lighthouse/text-spacing/playwright)
// against real markup without touching the shared dev ports.

import express from "express";

const root = process.argv[2];
if (!root) {
  console.error("Usage: node scripts/static-server.mjs <root-dir>");
  process.exit(1);
}

const app = express();
app.use(express.static(root, { extensions: ["html"] }));
const server = app.listen(0, "127.0.0.1", () => {
  console.log(`LISTENING_ON:${server.address().port}`);
});
