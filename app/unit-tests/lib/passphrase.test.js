// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { generatePassphrase, getWordlistSize } from "../../lib/passphrase.js";

describe("passphrase", () => {
  it("should generate a 4-word passphrase by default", () => {
    const passphrase = generatePassphrase();
    const words = passphrase.split("-");
    expect(words).toHaveLength(4);
  });

  it("should generate a passphrase with the specified number of words", () => {
    const passphrase = generatePassphrase(3);
    const words = passphrase.split("-");
    expect(words).toHaveLength(3);
  });

  it("should generate a single-word passphrase", () => {
    const passphrase = generatePassphrase(1);
    expect(passphrase).not.toContain("-");
    expect(passphrase.length).toBeGreaterThan(0);
  });

  it("should generate different passphrases on successive calls", () => {
    const passphrases = new Set();
    for (let i = 0; i < 20; i++) {
      passphrases.add(generatePassphrase());
    }
    // With 4 words from 1000+ words, collisions in 20 attempts are extremely unlikely
    expect(passphrases.size).toBeGreaterThan(15);
  });

  it("should only contain lowercase letters and hyphens", () => {
    for (let i = 0; i < 10; i++) {
      const passphrase = generatePassphrase();
      expect(passphrase).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it("should have a wordlist with sufficient size for entropy", () => {
    const size = getWordlistSize();
    // Need at least 1000 words for reasonable entropy with 4-word passphrases
    expect(size).toBeGreaterThanOrEqual(1000);
  });
});
