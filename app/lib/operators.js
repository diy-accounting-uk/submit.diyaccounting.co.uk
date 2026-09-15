// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/operators.js
// The operator list -- one email per line in OPERATORS.txt at the repo root --
// grants the operator dashboard activity to a logged-in user whose email matches
// an entry, case-insensitively.

import fs from "node:fs";
import path from "node:path";
import { createLogger } from "./logger.js";

const logger = createLogger({ source: "app/lib/operators.js" });

let cachedOperators = null;

function readOperatorsFile() {
  const filePath = path.join(process.cwd(), "OPERATORS.txt");
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    if (error.code === "ENOENT") {
      logger.warn({ message: "OPERATORS.txt not found; no operator emails loaded", filePath });
      return [];
    }
    throw error;
  }
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 0);
}

// Cached per process: OPERATORS.txt is read once and does not change while the
// process is running.
export function loadOperators() {
  if (cachedOperators === null) {
    cachedOperators = readOperatorsFile();
  }
  return cachedOperators;
}

export function isOperatorEmail(email) {
  if (!email || typeof email !== "string") return false;
  return loadOperators().includes(email.trim().toLowerCase());
}

export function _clearOperatorsCache() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_clearOperatorsCache can only be used in test environment");
  }
  cachedOperators = null;
}
