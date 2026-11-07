#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/bedrock-error-line.mjs
//
// Turns the stderr of a failed `aws bedrock-runtime converse` call into one log line. The line
// names the exception. For a ValidationException it adds the service's own message, so a rejected
// request can be diagnosed from the log. The message is the text after "operation:" on the
// error line, cut to printable ASCII and 300 characters. No other stderr text is printed.
//
// usage: bedrock-error-line.mjs <stderr-file>

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const MESSAGE_MAX_CHARS = 300;

/** The log line for the stderr text of a failed converse call; empty when it names no exception. */
export function bedrockErrorLine(stderr) {
  const name = /[A-Za-z]+Exception/.exec(stderr)?.[0] ?? "";
  if (name !== "ValidationException") return name;
  const message = /^.*\(ValidationException\).*?operation:\s*(.*)$/m.exec(stderr)?.[1] ?? "";
  const clean = message
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MESSAGE_MAX_CHARS);
  return clean ? `${name}: ${clean}` : name;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) {
    console.error("usage: bedrock-error-line.mjs <stderr-file>");
    process.exit(2);
  }
  console.log(bedrockErrorLine(readFileSync(process.argv[2], "utf8")));
}
