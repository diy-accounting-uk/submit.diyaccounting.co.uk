// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The GA4 service-account key is a multi-line JSON document. GitHub masks a registered secret as
// one exact string, so a step env or a step output holding that JSON is printed line by line,
// private key included, in the job log of a public repository. The scripts read the key from
// Secrets Manager through the job's AWS credentials and hold it in memory, so no workflow may
// carry it in an env block or a step output.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS_DIR = resolve(__dirname, "..", "..", ".github", "workflows");

function workflows() {
  return readdirSync(WORKFLOWS_DIR)
    .filter((name) => name.endsWith(".yml"))
    .map((name) => ({ name, text: readFileSync(resolve(WORKFLOWS_DIR, name), "utf-8") }));
}

describe("the GA4 service-account key never enters a workflow env block or step output", () => {
  it("no workflow puts the key JSON into a step output", () => {
    for (const { name, text } of workflows()) {
      expect(text.includes("credentials-json<<"), `${name} writes the key JSON to a step output`).toBe(false);
      expect(text.includes("steps.resolve.outputs.credentials-json"), `${name} reads the key JSON from a step output`).toBe(false);
    }
  });

  it("GA4_SERVICE_ACCOUNT_JSON appears only as the GitHub secret the environment deploy stores", () => {
    for (const { name, text } of workflows()) {
      for (const line of text.split("\n")) {
        if (!line.includes("GA4_SERVICE_ACCOUNT_JSON")) continue;
        const stripped = line.trim();
        if (stripped.startsWith("#") || stripped.startsWith("- name:") || stripped.startsWith("echo ")) continue;
        expect(line.includes("secrets.GA4_SERVICE_ACCOUNT_JSON"), `${name}: ${stripped}`).toBe(true);
      }
    }
  });

  it("google-apply.yml passes the secret's ARN at workflow level and no step env", () => {
    const text = readFileSync(resolve(WORKFLOWS_DIR, "google-apply.yml"), "utf-8");
    expect(text).toMatch(/^\s\sGA4_SERVICE_ACCOUNT_ARN: "arn:aws:secretsmanager:/m);
    expect(text).not.toMatch(/GA4_SERVICE_ACCOUNT_JSON/);
  });
});
