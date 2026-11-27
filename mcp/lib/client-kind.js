// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// client-kind.js -- the kind of assistant an MCP client is, from the name it gives in
// initialize's params.clientInfo.name. The kind is a product name, not personal data.

export const UNKNOWN_CLIENT = "unknown";

// Checked in order: the first kind with a word in the name wins.
const KIND_WORDS = [
  ["chatgpt", ["openai", "chatgpt"]],
  ["claude", ["claude", "anthropic"]],
  ["gemini", ["gemini", "google"]],
  ["copilot", ["copilot", "microsoft"]],
];

/**
 * The client kind for a clientInfo.name: chatgpt, claude, gemini, copilot, other for any other
 * name, or unknown when the client gave no name.
 * @param {unknown} name
 * @returns {"chatgpt"|"claude"|"gemini"|"copilot"|"other"|"unknown"}
 */
export function clientKindOf(name) {
  if (typeof name !== "string" || name.trim() === "") return UNKNOWN_CLIENT;
  const lower = name.toLowerCase();
  for (const [kind, words] of KIND_WORDS) {
    if (words.some((word) => lower.includes(word))) return kind;
  }
  return "other";
}

export const CLIENT_NAME_LOG_LENGTH = 64;

/**
 * The client's own name as the session log records it: printable ASCII only, each other character
 * shown as "?", cut to CLIENT_NAME_LOG_LENGTH characters, or null when the client gave no name. A
 * client chooses its name, so the log never takes it whole.
 * @param {unknown} name
 * @returns {string|null}
 */
export function clientNameForLog(name) {
  if (typeof name !== "string" || name.trim() === "") return null;
  return name.slice(0, CLIENT_NAME_LOG_LENGTH).replace(/[^\x20-\x7e]/g, "?");
}
