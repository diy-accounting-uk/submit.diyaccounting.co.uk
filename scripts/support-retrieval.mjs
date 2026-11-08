#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/support-retrieval.mjs
//
// Picks the page snippets that the support triage request carries. Titan embeds each snippet of
// faqs.toml, help.html and guide.html and the ticket summary from the handling input. Cosine
// similarity picks the nearest snippets. Each one goes to its own file, and a list file names the
// files, one path on each line. A failed embedding call fails the run; no other page text takes
// its place.
//
// usage: support-retrieval.mjs --handling-input <file> --out-dir <dir> --list-file <file> [--root <dir>] [--count <n>]
//
// Reads AWS_REGION.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { buildSnippets, renderSnippet } from "./support-snippets.mjs";

export const EMBEDDING_MODEL_ID = "amazon.titan-embed-text-v2:0";
export const SNIPPET_COUNT = 3;
const EMBED_MAX_CHARS = 8000;

export function cosine(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index++) {
    dot += a[index] * b[index];
    normA += a[index] ** 2;
    normB += b[index] ** 2;
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

const hashOf = (text) => createHash("sha256").update(text).digest("hex");

/**
 * Embeds each text once. The cache maps the hash of a text to its vector, so a changed snippet is
 * embedded again and an unchanged one is not.
 * @param {(text: string) => Promise<number[]>} embed
 * @param {Record<string, number[]>} cache
 */
export function cachedEmbedder(embed, cache = {}) {
  return async (text) => {
    const key = hashOf(text);
    if (!cache[key]) cache[key] = await embed(text);
    return cache[key];
  };
}

/** The text of a snippet that Titan embeds. */
export const embeddingText = (snippet) =>
  `${snippet.title}\n${snippet.summary}\n${snippet.keywords.join(", ")}\n${snippet.body}`.slice(0, EMBED_MAX_CHARS);

/** The Titan call, as a function from a text to a vector. */
export function titanEmbedder(client = new BedrockRuntimeClient({ region: process.env.AWS_REGION, maxAttempts: 5 })) {
  return async (text) => {
    const response = await client.send(
      new InvokeModelCommand({
        modelId: EMBEDDING_MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({ inputText: text, dimensions: 256, normalize: true }),
      }),
    );
    return JSON.parse(new TextDecoder().decode(response.body)).embedding;
  };
}

/** The snippets nearest to the question, best first; a tie goes to the lower id. */
export function nearestSnippets({ snippets, questionVector, snippetVectors, count }) {
  return snippets
    .map((snippet) => ({ snippet, score: cosine(questionVector, snippetVectors.get(snippet.id)) }))
    .sort((a, b) => b.score - a.score || a.snippet.id.localeCompare(b.snippet.id))
    .slice(0, count)
    .map((entry) => entry.snippet);
}

/** Writes one file for each snippet into a directory and returns the paths. */
export function writeSnippetFiles(snippets, dir) {
  mkdirSync(dir, { recursive: true });
  return snippets.map((snippet) => {
    const path = join(dir, `${snippet.id}.md`);
    writeFileSync(path, renderSnippet(snippet));
    return path;
  });
}

/**
 * The files of the snippets nearest to a ticket summary.
 * @param {object} options
 * @param {string} options.summary the ticket summary from the handling input
 * @param {Array} options.snippets
 * @param {(text: string) => Promise<number[]>} options.embed
 * @param {string} options.dir
 * @param {number} [options.count]
 */
export async function selectSnippetFiles({ summary, snippets, embed, dir, count = SNIPPET_COUNT }) {
  if (typeof summary !== "string" || summary.trim() === "") throw new Error("the handling input has no summary to embed");
  const snippetVectors = new Map();
  for (const snippet of snippets) snippetVectors.set(snippet.id, await embed(embeddingText(snippet)));
  const questionVector = await embed(summary);
  return writeSnippetFiles(nearestSnippets({ snippets, questionVector, snippetVectors, count }), dir);
}

async function main() {
  const { values } = parseArgs({
    options: {
      "handling-input": { type: "string" },
      "out-dir": { type: "string" },
      "list-file": { type: "string" },
      "root": { type: "string", default: "." },
      "count": { type: "string", default: String(SNIPPET_COUNT) },
    },
  });
  if (!values["handling-input"] || !values["out-dir"] || !values["list-file"]) {
    console.error("usage: support-retrieval.mjs --handling-input <file> --out-dir <dir> --list-file <file> [--root <dir>] [--count <n>]");
    process.exit(2);
  }
  const handlingInput = JSON.parse(readFileSync(values["handling-input"], "utf8"));
  const paths = await selectSnippetFiles({
    summary: handlingInput.summary,
    snippets: buildSnippets({ root: values.root }),
    embed: titanEmbedder(),
    dir: values["out-dir"],
    count: Number(values.count),
  });
  writeFileSync(values["list-file"], `${paths.join("\n")}\n`);
  console.log(`support-retrieval: ${paths.length} snippets written`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
