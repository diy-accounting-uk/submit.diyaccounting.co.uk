// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Generated from app/lib/passMedia.js by scripts/generate-submission-record.mjs. Edit the source and run
// npm run generate:submission-record.

// The two SVG faces of a physical pass: the front, with the pass words stacked, and the back,
// with the QR code and the pass code below it. This module imports nothing, so the generate
// page in a browser and the customer email worker under Node build the same files. The browser
// copy, web/public/lib/pass-media.js, is written from this file by
// scripts/generate-submission-record.mjs.

function escapeXml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/**
 * The front of a physical pass: the words stacked vertically.
 * @param {string[]} words - the words of the pass code
 * @returns {string} SVG document
 */
export function generateFrontSvg(words) {
  const fontSize = 36;
  const lineHeight = 48;
  const padding = 30;
  const width = 300;
  const height = padding * 2 + words.length * lineHeight;

  let textElements = "";
  words.forEach((word, i) => {
    const y = padding + (i + 1) * lineHeight - 10;
    textElements += `  <text x="${width / 2}" y="${y}" text-anchor="middle" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="#1a1a2e">${escapeXml(word)}</text>\n`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="white"/>
${textElements}</svg>`;
}

/**
 * The back of a physical pass: the QR code with the pass code below it.
 * @param {string} qrSvgContent - the QR code as an SVG document
 * @param {string} code - the pass code
 * @returns {string} SVG document
 */
export function generateBackSvg(qrSvgContent, code) {
  const qrSize = 200;
  const totalWidth = 300;
  const textY = qrSize + 30;
  const totalHeight = textY + 30;
  const qrOffsetX = (totalWidth - qrSize) / 2;

  // Extract inner content of QR SVG
  const innerMatch = qrSvgContent.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  const qrInner = innerMatch ? innerMatch[1] : qrSvgContent;
  const viewBoxMatch = qrSvgContent.match(/viewBox="([^"]*)"/);
  const qrViewBox = viewBoxMatch ? viewBoxMatch[1] : `0 0 ${qrSize} ${qrSize}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">
  <rect width="${totalWidth}" height="${totalHeight}" fill="white"/>
  <svg x="${qrOffsetX}" y="0" width="${qrSize}" height="${qrSize}" viewBox="${qrViewBox}">
    ${qrInner}
  </svg>
  <text x="${totalWidth / 2}" y="${textY}" text-anchor="middle" font-family="monospace" font-size="11" fill="#555">${escapeXml(code)}</text>
</svg>`;
}
