// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/helpers/figures-helper.js

import fs from "node:fs";
import path from "node:path";
import { createLogger } from "@app/lib/logger.js";

const logger = createLogger({ source: "behaviour-tests/helpers/figures-helper.js" });

/**
 * Select key screenshots from a screenshots directory
 * @param {string} screenshotDir - Directory containing screenshots
 * @param {Array<string>} patterns - Array of regex patterns to match screenshot names
 * @param {number} maxCount - Maximum number of screenshots to select (default: 5)
 * @returns {Array<string>} Array of selected screenshot filenames
 */
export function selectKeyScreenshots(screenshotDir, patterns, maxCount = 5) {
  if (!fs.existsSync(screenshotDir)) {
    logger.warn(`Screenshot directory not found: ${screenshotDir}`);
    return [];
  }

  const allScreenshots = fs
    .readdirSync(screenshotDir)
    .filter((file) => file.endsWith(".png"))
    .sort();

  const selected = [];
  const regexPatterns = patterns.map((p) => new RegExp(p, "i"));

  // Try to match each pattern
  for (const pattern of regexPatterns) {
    const match = allScreenshots.find((file) => pattern.test(file) && !selected.includes(file));
    if (match) {
      selected.push(match);
      if (selected.length >= maxCount) break;
    }
  }

  // If we don't have enough, add more based on specific keywords
  if (selected.length < maxCount) {
    const fallbackKeywords = ["submit", "complete", "result", "success", "confirm", "receipt"];
    for (const keyword of fallbackKeywords) {
      if (selected.length >= maxCount) break;
      // Use find() to get first match for this keyword instead of filtering all
      const match = allScreenshots.find((file) => file.toLowerCase().includes(keyword) && !selected.includes(file));
      if (match) {
        selected.push(match);
      }
    }
  }

  // If still not enough, add the first and last screenshots
  if (selected.length < maxCount) {
    if (allScreenshots.length > 0 && !selected.includes(allScreenshots[0])) {
      selected.unshift(allScreenshots[0]);
    }
    if (allScreenshots.length > 1 && !selected.includes(allScreenshots[allScreenshots.length - 1])) {
      selected.push(allScreenshots[allScreenshots.length - 1]);
    }
  }

  return selected.slice(0, maxCount);
}

/**
 * Copy selected screenshots to the output directory
 * @param {string} sourceDir - Source directory containing screenshots
 * @param {string} targetDir - Target directory to copy screenshots to
 * @param {Array<string>} filenames - Array of screenshot filenames to copy
 * @returns {Array<string>} Array of copied filenames
 */
export function copyScreenshots(sourceDir, targetDir, filenames) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const copied = [];
  for (const filename of filenames) {
    const sourcePath = path.join(sourceDir, filename);
    const targetPath = path.join(targetDir, filename);

    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, targetPath);
      copied.push(filename);
      logger.info(`Copied screenshot: ${filename}`);
    } else {
      logger.warn(`Screenshot not found: ${sourcePath}`);
    }
  }

  return copied;
}

/**
 * Generate figures.json describing key screenshots
 * @param {Array<string>} filenames - Array of screenshot filenames
 * @param {Object} descriptions - Object mapping filename patterns to descriptions
 * @returns {Array<Object>} Array of figure objects
 */
export function generateFiguresMetadata(filenames, descriptions) {
  return filenames.map((filename, index) => {
    // Try to match filename against description patterns
    let description = "Screenshot captured during test execution";

    for (const [pattern, desc] of Object.entries(descriptions)) {
      if (new RegExp(pattern, "i").test(filename)) {
        description = desc;
        break;
      }
    }

    return {
      filename,
      order: index + 1,
      description,
      caption: generateCaption(filename),
    };
  });
}

/**
 * Generate a human-readable caption from a screenshot filename
 * @param {string} filename - Screenshot filename
 * @returns {string} Human-readable caption
 */
function generateCaption(filename) {
  // Remove timestamp and file extension
  const nameWithoutExt = filename.replace(/\.png$/i, "");
  const parts = nameWithoutExt.split("-");

  // Remove timestamp (first part) and numbering (second part if numeric)
  if (parts.length > 2) {
    parts.shift(); // Remove timestamp
    if (/^\d{2}$/.test(parts[0])) {
      parts.shift(); // Remove numbering like "01", "02"
    }
  }

  // Join remaining parts and capitalize
  const caption = parts
    .join(" ")
    .split(/[\s_-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  return caption || "Test screenshot";
}

/**
 * Write figures.json to the output directory
 * @param {string} outputDir - Directory to write figures.json to
 * @param {Array<Object>} figures - Array of figure metadata objects
 */
export function writeFiguresJson(outputDir, figures) {
  const figuresPath = path.join(outputDir, "figures.json");
  fs.writeFileSync(figuresPath, JSON.stringify(figures, null, 2), "utf-8");
  logger.info(`Wrote figures.json with ${figures.length} entries to ${figuresPath}`);
}
