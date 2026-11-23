// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/gatewayFormSchema.js
// Validates a Companies House XML gateway form body against its schema in
// fixtures/companies-house-xmlgw, with libxml2 built to WebAssembly, so the check needs no xmllint
// binary. A form schema lives in the gateway's forms/ folder and includes the base types from the
// folder above, so each file is loaded under the path its schemaLocation names. The simulator
// refuses a body the schema refuses, as the gateway does; the builders' unit tests use the same check.

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateXML } from "xmllint-wasm";

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "companies-house-xmlgw");

let preloaded;

// The base schemas and vocabularies every form schema includes, read once.
function preloadedSchemas() {
  if (!preloaded) {
    const files = readdirSync(SCHEMA_DIR).filter((name) => name.endsWith(".xsd"));
    const vocabularies = readdirSync(join(SCHEMA_DIR, "vocabularies")).filter((name) => name.endsWith(".xsd"));
    preloaded = [
      ...files.map((name) => ({ fileName: name, contents: readFileSync(join(SCHEMA_DIR, name), "utf8") })),
      ...vocabularies.map((name) => ({
        fileName: `vocabularies/${name}`,
        contents: readFileSync(join(SCHEMA_DIR, "vocabularies", name), "utf8"),
      })),
    ];
  }
  return preloaded;
}

/**
 * The schema errors of a form body, or [] when it is valid.
 * @param {string} formXml - the form's root element
 * @param {string} schemaFile - the form's schema in fixtures/companies-house-xmlgw, such as "PSCCessation-v1-2.xsd"
 * @returns {Promise<string[]>}
 */
export async function gatewayFormSchemaErrors(formXml, schemaFile) {
  const result = await validateXML({
    xml: [{ fileName: "form.xml", contents: formXml }],
    schema: [{ fileName: `forms/${schemaFile}`, contents: readFileSync(join(SCHEMA_DIR, schemaFile), "utf8") }],
    preload: preloadedSchemas(),
  });
  return result.valid ? [] : result.errors.map((error) => error.message);
}

/**
 * The form's root element as the envelope carries it, or null when the envelope holds none.
 * @param {string} envelopeXml
 * @param {string} formIdentifier - the root element's name, such as "PSCCessation"
 * @returns {string|null}
 */
export function formElementXml(envelopeXml, formIdentifier) {
  const match = String(envelopeXml).match(new RegExp(`<${formIdentifier}[\\s>][\\s\\S]*</${formIdentifier}>`));
  return match ? match[0] : null;
}
