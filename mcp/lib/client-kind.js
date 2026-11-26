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
