// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/submitCss.js
// The text of web/public/submit.css with each @import replaced by the file it names, for a test
// that serves the stylesheet to a page from memory, where the browser has no server for the
// imported files.

import fs from "fs";
import path from "path";

const PUBLIC_DIR = path.join(process.cwd(), "web/public");

export function readSubmitCss() {
  const entry = fs.readFileSync(path.join(PUBLIC_DIR, "submit.css"), "utf-8");
  return entry.replace(/@import url\("([^"]+)"\);/g, (_match, file) => fs.readFileSync(path.join(PUBLIC_DIR, file), "utf-8"));
}
