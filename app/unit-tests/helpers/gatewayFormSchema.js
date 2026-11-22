// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Validates a Companies House XML gateway form body against its checked-in schema, with libxml2
// built to WebAssembly, so the check needs no xmllint binary. A form schema lives in the gateway's
// forms/ folder and includes the base types from the folder above, so each file is loaded under the
// path its schemaLocation names.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateXML } from "xmllint-wasm";

const SCHEMA_DIR = join(process.cwd(), "fixtures", "companies-house-xmlgw");

function preloaded() {
  const files = readdirSync(SCHEMA_DIR).filter((name) => name.endsWith(".xsd"));
  const vocabularies = readdirSync(join(SCHEMA_DIR, "vocabularies")).filter((name) => name.endsWith(".xsd"));
  return [
    ...files.map((name) => ({ fileName: name, contents: readFileSync(join(SCHEMA_DIR, name), "utf8") })),
    ...vocabularies.map((name) => ({
      fileName: `vocabularies/${name}`,
      contents: readFileSync(join(SCHEMA_DIR, "vocabularies", name), "utf8"),
    })),
  ];
}

/**
 * The schema errors of a form body, or [] when it is valid.
 * @param {string} formXml - the form's root element, as its builder writes it
 * @param {string} schemaFile - the form's schema in fixtures/companies-house-xmlgw, such as "PSCCessation-v1-2.xsd"
 * @returns {Promise<string[]>}
 */
export async function gatewayFormSchemaErrors(formXml, schemaFile) {
  const result = await validateXML({
    xml: [{ fileName: "form.xml", contents: formXml }],
    schema: [{ fileName: `forms/${schemaFile}`, contents: readFileSync(join(SCHEMA_DIR, schemaFile), "utf8") }],
    preload: preloaded(),
  });
  return result.valid ? [] : result.errors.map((error) => error.message);
}
