// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { generatePassQrCode, generatePassQrCodeBuffer, buildPassDetails } from "@app/lib/qrCodeGenerator.js";
import fs from "fs";
import path from "path";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("QR Code Generation System Test", () => {
  const mockPass = {
    code: "tiger-happy-mountain-silver",
    bundleId: "day-guest",
    passTypeId: "day-guest-test-pass",
    maxUses: 1,
    useCount: 0,
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2026-01-08T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("should generate QR code for a pass code", async () => {
    // Generate QR code
    const url = `https://submit.diyaccounting.co.uk/bundles.html?pass=${mockPass.code}`;
    const qrCode = await generatePassQrCode({ code: mockPass.code, url });

    // Verify QR code is valid data URL
    expect(qrCode).toMatch(/^data:image\/png;base64,/);
    expect(qrCode.length).toBeGreaterThan(100);
  });

  it("should generate QR code buffer and save to file", async () => {
    // Generate QR code buffer
    const url = `https://submit.diyaccounting.co.uk/bundles.html?pass=${mockPass.code}`;
    const buffer = await generatePassQrCodeBuffer({ code: mockPass.code, url });

    // Verify buffer is valid
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(100);

    // Save to temporary file to verify it's a valid PNG
    const tmpDir = path.join(process.cwd(), "target");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const tmpFile = path.join(tmpDir, `qr-test-${mockPass.code}.png`);
    fs.writeFileSync(tmpFile, buffer);

    // Verify file was created and has PNG signature
    expect(fs.existsSync(tmpFile)).toBe(true);
    const savedBuffer = fs.readFileSync(tmpFile);
    expect(savedBuffer[0]).toBe(0x89);
    expect(savedBuffer[1]).toBe(0x50); // 'P'
    expect(savedBuffer[2]).toBe(0x4e); // 'N'
    expect(savedBuffer[3]).toBe(0x47); // 'G'

    // Clean up
    fs.unlinkSync(tmpFile);
  });

  it("should build complete pass details", () => {
    const passWithDetails = {
      ...mockPass,
      notes: "System test pass",
    };

    const url = `https://prod.submit.diyaccounting.co.uk/bundles.html?pass=${passWithDetails.code}`;
    const details = buildPassDetails(passWithDetails, url, "test@example.com");

    // Verify all details are present
    expect(details.code).toBe(passWithDetails.code);
    expect(details.url).toBe(url);
    expect(details.bundleId).toBe("day-guest");
    expect(details.passTypeId).toBe("day-guest-test-pass");
    expect(details.maxUses).toBe(1);
    expect(details.usesRemaining).toBe(1);
    expect(details.restrictedToEmail).toBe("test@example.com");
    expect(details.notes).toBe("System test pass");
    expect(details.validFrom).toBeTruthy();
    expect(details.validUntil).toBeTruthy();
  });
});
