// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, expect, it } from "vitest";

import { clientKindOf, UNKNOWN_CLIENT } from "../lib/client-kind.js";

describe("clientKindOf", () => {
  it.each([
    ["openai-mcp", "chatgpt"],
    ["ChatGPT", "chatgpt"],
    ["claude-ai", "claude"],
    ["Anthropic Desktop", "claude"],
    ["gemini-cli", "gemini"],
    ["Google AI Studio", "gemini"],
    ["GitHub Copilot", "copilot"],
    ["microsoft-agent", "copilot"],
    ["mcp-inspector", "other"],
  ])("folds %s to %s", (name, kind) => {
    expect(clientKindOf(name)).toBe(kind);
  });

  it("gives unknown for no name, an empty name or a name that is not text", () => {
    expect(clientKindOf(undefined)).toBe(UNKNOWN_CLIENT);
    expect(clientKindOf("  ")).toBe(UNKNOWN_CLIENT);
    expect(clientKindOf(42)).toBe(UNKNOWN_CLIENT);
    expect(UNKNOWN_CLIENT).toBe("unknown");
  });
});
