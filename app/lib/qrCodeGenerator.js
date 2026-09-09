// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/qrCodeGenerator.js
// Generate QR codes for pass invitation codes.
//
// Creates QR codes containing pass URLs that can be scanned to quickly
// access the bundle redemption page.

import QRCode from "qrcode";

/**
 * Generate a QR code for a pass as a data URL (base64 PNG image).
 *
 * @param {Object} params
 * @param {string} params.code - The pass code (e.g., "tiger-happy-mountain-silver")
 * @param {string} params.url - The full URL to the pass redemption page
 * @param {Object} [params.options] - QRCode generation options
 * @param {number} [params.options.width=300] - Width in pixels
 * @param {number} [params.options.margin=4] - Margin in modules
 * @param {string} [params.options.errorCorrectionLevel='M'] - Error correction level (L, M, Q, H)
 * @returns {Promise<string>} Data URL containing the QR code image
 */
export async function generatePassQrCode({ code, url, options = {} }) {
  if (!code) {
    throw new Error("Pass code is required");
  }
  if (!url) {
    throw new Error("Pass URL is required");
  }

  const qrOptions = {
    width: options.width || 300,
    margin: options.margin || 4,
    errorCorrectionLevel: options.errorCorrectionLevel || "M",
    type: "image/png",
  };

  try {
    const dataUrl = await QRCode.toDataURL(url, qrOptions);
    return dataUrl;
  } catch (error) {
    throw new Error(`Failed to generate QR code for pass ${code}: ${error.message}`);
  }
}

/**
 * Generate a QR code for a pass as a Buffer (raw PNG data).
 *
 * @param {Object} params
 * @param {string} params.code - The pass code
 * @param {string} params.url - The full URL to the pass redemption page
 * @param {Object} [params.options] - QRCode generation options
 * @returns {Promise<Buffer>} Buffer containing PNG image data
 */
export async function generatePassQrCodeBuffer({ code, url, options = {} }) {
  if (!code) {
    throw new Error("Pass code is required");
  }
  if (!url) {
    throw new Error("Pass URL is required");
  }

  const qrOptions = {
    width: options.width || 300,
    margin: options.margin || 4,
    errorCorrectionLevel: options.errorCorrectionLevel || "M",
  };

  try {
    const buffer = await QRCode.toBuffer(url, qrOptions);
    return buffer;
  } catch (error) {
    throw new Error(`Failed to generate QR code buffer for pass ${code}: ${error.message}`);
  }
}

/**
 * Escape a string for safe inclusion in SVG text elements.
 *
 * @param {string} str - Raw string
 * @returns {string} XML-escaped string
 */
function escapeXml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/**
 * Generate an annotated QR code as an SVG string.
 *
 * The output is a self-contained SVG that includes the QR code and
 * text annotations showing the pass code, URL, bundle, max uses,
 * validity, and optional email restriction.
 *
 * @param {Object} params
 * @param {string} params.code - The pass code (e.g., "tiger-happy-mountain-silver")
 * @param {string} params.url - The full URL to the pass redemption page
 * @param {string} [params.bundleName] - Human-readable bundle name
 * @param {number} [params.maxUses] - Maximum number of uses
 * @param {string} [params.email] - Restricted email address
 * @param {string} [params.validUntil] - Validity expiry (ISO date string or "unlimited")
 * @param {Object} [params.options] - QRCode generation options
 * @returns {Promise<string>} SVG string
 */
export async function generateAnnotatedPassQrCodeSvg({ code, url, bundleName, maxUses, email, validUntil, options = {} }) {
  if (!code) {
    throw new Error("Pass code is required");
  }
  if (!url) {
    throw new Error("Pass URL is required");
  }

  const qrSize = options.width || 200;
  const errorCorrectionLevel = options.errorCorrectionLevel || "M";

  // Generate the QR code as an SVG fragment
  const qrSvg = await QRCode.toString(url, {
    type: "svg",
    width: qrSize,
    margin: 2,
    errorCorrectionLevel,
  });

  // Extract the inner content of the QR SVG (everything inside <svg>...</svg>)
  const innerMatch = qrSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  const qrInner = innerMatch ? innerMatch[1] : qrSvg;

  // Extract viewBox from the QR SVG to preserve coordinate system
  const viewBoxMatch = qrSvg.match(/viewBox="([^"]*)"/);
  const qrViewBox = viewBoxMatch ? viewBoxMatch[1] : `0 0 ${qrSize} ${qrSize}`;

  // Build annotation lines
  const lines = [];
  lines.push({ label: "Pass code", value: code });
  if (bundleName) lines.push({ label: "Bundle", value: bundleName });
  if (maxUses !== undefined) lines.push({ label: "Max uses", value: String(maxUses) });
  if (validUntil) lines.push({ label: "Valid until", value: validUntil });
  if (email) lines.push({ label: "Email", value: email });
  lines.push({ label: "URL", value: url });

  const fontSize = 12;
  const lineHeight = 18;
  const textStartY = qrSize + 20;
  const totalHeight = textStartY + lines.length * lineHeight + 10;
  // Estimate width needed for longest annotation line (~7.2px per character in monospace 12pt)
  const charWidth = 7.2;
  const longestLine = Math.max(...lines.map((l) => `${l.label}: ${l.value}`.length));
  const textWidth = 10 + longestLine * charWidth + 10; // 10px left margin + text + 10px right margin
  const totalWidth = Math.max(qrSize, 400, Math.ceil(textWidth));

  // Centre the QR code horizontally
  const qrOffsetX = Math.max(0, (totalWidth - qrSize) / 2);

  let textElements = "";
  lines.forEach((line, i) => {
    const y = textStartY + i * lineHeight;
    textElements +=
      `  <text x="10" y="${y}" font-family="monospace" font-size="${fontSize}" fill="#333">` +
      `<tspan font-weight="bold">${escapeXml(line.label)}:</tspan> ${escapeXml(line.value)}</text>\n`;
  });

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">\n` +
    `  <rect width="${totalWidth}" height="${totalHeight}" fill="white"/>\n` +
    `  <svg x="${qrOffsetX}" y="0" width="${qrSize}" height="${qrSize}" viewBox="${qrViewBox}">\n` +
    `    ${qrInner}\n` +
    `  </svg>\n` +
    textElements +
    `</svg>`;

  return svg;
}

/**
 * Build pass details object with metadata for display.
 *
 * @param {Object} pass - Pass record from passService
 * @param {string} passUrl - Full URL to the pass redemption page
 * @param {string} [email] - Email if pass is restricted
 * @returns {Object} Pass details with formatted metadata
 */
export function buildPassDetails(pass, passUrl, email) {
  const details = {
    code: pass.code,
    url: passUrl,
    bundleId: pass.bundleId,
    passTypeId: pass.passTypeId,
    maxUses: pass.maxUses,
    usesRemaining: pass.maxUses - pass.useCount,
    validFrom: pass.validFrom,
    validUntil: pass.validUntil || "unlimited",
    createdAt: pass.createdAt,
  };

  if (email) {
    details.restrictedToEmail = email;
  }

  if (pass.notes) {
    details.notes = pass.notes;
  }

  return details;
}
