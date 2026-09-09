#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/generate-pass-with-qr.js
// Script to generate passes with QR codes for GitHub Actions workflow

import { createPass } from "../app/services/passService.js";
import { initializeEmailHashSecret } from "../app/lib/emailHash.js";
import { generatePassQrCodeBuffer, generateAnnotatedPassQrCodeSvg, buildPassDetails } from "../app/lib/qrCodeGenerator.js";
import fs from "fs";
import path from "path";

/**
 * Generate passes with QR codes for the generate-pass.yml workflow.
 *
 * Environment variables:
 * - PASS_TYPE: Pass type ID (e.g., "day-guest-test-pass")
 * - BUNDLE_ID: Bundle ID to grant
 * - MAX_USES: Maximum number of uses
 * - VALIDITY_PERIOD: ISO 8601 duration (e.g., "P7D")
 * - QUANTITY: Number of passes to generate
 * - EMAIL: Email restriction (optional)
 * - NOTES: Admin notes (optional)
 * - CREATED_BY: Creator identifier
 * - PASS_URL_HOST: Host for pass redemption URL
 * - TEST_PASS: If "true", sets testPass: true (routes to HMRC sandbox)
 */

async function main() {
  const passTypeId = process.env.PASS_TYPE;
  const bundleId = process.env.BUNDLE_ID;
  const maxUses = parseInt(process.env.MAX_USES || "1", 10);
  const validityPeriod = process.env.VALIDITY_PERIOD || undefined;
  const quantity = parseInt(process.env.QUANTITY || "1", 10);
  const email = process.env.EMAIL || undefined;
  const notes = process.env.NOTES || undefined;
  const createdBy = process.env.CREATED_BY || "manual";
  const passUrlHost = process.env.PASS_URL_HOST || "ci.submit.diyaccounting.co.uk";
  const testPass = process.env.TEST_PASS === "true";

  console.log(`Generating ${quantity} ${passTypeId} pass(es) with QR codes...`);
  console.log(`  Bundle: ${bundleId}`);
  console.log(`  Max uses: ${maxUses}`);
  console.log(`  Validity: ${validityPeriod || "unlimited"}`);
  console.log(`  Email: ${email || "unrestricted"}`);

  // Initialize email hash secret if email restriction is requested
  if (process.env.EMAIL_HASH_SECRET && email) {
    await initializeEmailHashSecret();
  }

  const results = [];
  const qrCodesDir = "qr-codes";

  // Create QR codes directory
  if (!fs.existsSync(qrCodesDir)) {
    fs.mkdirSync(qrCodesDir, { recursive: true });
  }

  // Generate passes
  for (let i = 0; i < quantity; i++) {
    console.log(`\nGenerating pass ${i + 1}/${quantity}...`);

    const pass = await createPass({
      passTypeId,
      bundleId,
      validityPeriod: validityPeriod || undefined,
      maxUses,
      restrictedToEmail: email || undefined,
      createdBy,
      notes: notes || undefined,
      ...(testPass ? { testPass: true } : {}),
    });

    const passUrl = `https://${passUrlHost}/bundles.html?pass=${pass.code}`;

    // Generate QR code PNG
    const qrBuffer = await generatePassQrCodeBuffer({
      code: pass.code,
      url: passUrl,
    });

    // Save QR code PNG to file
    const qrFileName = `qr-${pass.code}.png`;
    const qrFilePath = path.join(qrCodesDir, qrFileName);
    fs.writeFileSync(qrFilePath, qrBuffer);

    // Generate annotated SVG QR code
    const annotatedSvg = await generateAnnotatedPassQrCodeSvg({
      code: pass.code,
      url: passUrl,
      bundleName: bundleId,
      maxUses,
      email,
      validUntil: pass.validUntil || undefined,
    });

    // Save annotated SVG to file
    const svgFileName = `qr-${pass.code}-annotated.svg`;
    const svgFilePath = path.join(qrCodesDir, svgFileName);
    fs.writeFileSync(svgFilePath, annotatedSvg, "utf-8");

    // Build pass details
    const details = buildPassDetails(pass, passUrl, email);

    // Build base64 data URI for inline display in workflow summary
    const qrBase64 = qrBuffer.toString("base64");

    // Add QR code info to results
    results.push({
      ...details,
      qrCodeFile: qrFileName,
      qrCodeSvgFile: svgFileName,
      qrCodeBase64: `data:image/png;base64,${qrBase64}`,
    });

    // Print pass details with QR code in terminal
    console.log("---");
    console.log(`Code: ${pass.code}`);
    console.log(`URL: ${passUrl}`);
    console.log(`Bundle: ${pass.bundleId}`);
    console.log(`Valid from: ${pass.validFrom}`);
    console.log(`Valid until: ${pass.validUntil || "unlimited"}`);
    console.log(`Max uses: ${pass.maxUses}`);
    if (email) {
      console.log(`Restricted to: ${email}`);
    }
    if (notes) {
      console.log(`Notes: ${notes}`);
    }
  }

  // Write results to JSON
  fs.writeFileSync("passes-output.json", JSON.stringify(results, null, 2));

  console.log(`\n✓ Generated ${quantity} pass(es) successfully`);
  console.log(`✓ QR codes saved to ${qrCodesDir}/`);
  console.log("✓ Pass details saved to passes-output.json");
}

main().catch((error) => {
  console.error("Failed to generate passes:", error);
  process.exit(1);
});
