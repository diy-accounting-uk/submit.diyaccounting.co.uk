// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/helpers/fileHelper.js

import path from "node:path";
import fs from "node:fs";
import { hashSub, initializeSalt } from "@app/services/subHasher.js";

// Track if salt initialization has been attempted
let __saltInitialized = false;
let __saltAvailable = false;

/**
 * Try to initialize salt for hashing. This is best-effort for test diagnostics.
 * If salt is not available (no env var, no Secrets Manager access), we skip hashing.
 */
async function tryInitializeSalt() {
  if (__saltInitialized) return __saltAvailable;
  __saltInitialized = true;
  try {
    await initializeSalt();
    __saltAvailable = true;
    console.log("[fileHelper] Salt initialized successfully for test diagnostics");
  } catch (e) {
    __saltAvailable = false;
    console.log(`[fileHelper] Salt not available for test diagnostics (this is OK): ${e.message}`);
  }
  return __saltAvailable;
}

export function deleteUserSubTxt(outputDir) {
  // Delete ${outputDir}/userSub.txt
  const userSubPath = path.join(outputDir, "userSub.txt");
  try {
    if (fs.existsSync(userSubPath)) {
      fs.unlinkSync(userSubPath);
      console.log(`[beforeAll] Deleted existing userSub.txt at ${userSubPath}`);
    }
  } catch (e) {
    console.log(`[beforeAll] Error deleting userSub.txt at ${userSubPath}: ${e.message}`);
  }
}

export function deleteTraceparentTxt(outputDir) {
  // Delete ${outputDir}/traceparent.txt
  const traceparentPath = path.join(outputDir, "traceparent.txt");
  try {
    if (fs.existsSync(traceparentPath)) {
      fs.unlinkSync(traceparentPath);
      console.log(`[beforeAll] Deleted existing traceparent.txt at ${traceparentPath}`);
    }
  } catch (e) {
    console.log(`[beforeAll] Error deleting traceparent.txt at ${traceparentPath}: ${e.message}`);
  }
}

export function deleteHashedUserSubTxt(outputDir) {
  // Delete ${outputDir}/hashedUserSub.txt
  const hashedUserSubPath = path.join(outputDir, "hashedUserSub.txt");
  try {
    if (fs.existsSync(hashedUserSubPath)) {
      fs.unlinkSync(hashedUserSubPath);
      console.log(`[beforeAll] Deleted existing hashedUserSub.txt at ${hashedUserSubPath}`);
    }
  } catch (e) {
    console.log(`[beforeAll] Error deleting hashedUserSub.txt at ${hashedUserSubPath}: ${e.message}`);
  }
}

export function appendUserSubTxt(outputDir, testInfo, userSub) {
  // Write user sub
  try {
    // Only write if we have a valid userSub (not null, not empty, not string "null" or "undefined")
    const valueToWrite = userSub && userSub !== "null" && userSub !== "undefined" ? userSub : "";
    console.log(
      `[afterEach] Saving ${outputDir}/userSub.txt for test "${testInfo.title}": ${valueToWrite ? valueToWrite : "(empty - user may not have logged in)"}`,
    );
    fs.appendFileSync(path.join(outputDir, "userSub.txt"), valueToWrite, "utf-8");
  } catch (e) {
    console.log(`[afterEach] Error writing userSub.txt for test "${testInfo.title}": ${e.message}`);
  }
}

export function appendTraceparentTxt(outputDir, testInfo, observedTraceparent) {
  try {
    console.log(`Saving ${outputDir}/traceparent.txt for test "${testInfo.title}": ${observedTraceparent}`);
    fs.writeFileSync(path.join(outputDir, "traceparent.txt"), observedTraceparent || "", "utf-8");
  } catch (e) {
    console.log(`[test body] Error writing traceparent.txt: ${e.message}`);
  }
}

export async function appendHashedUserSubTxt(outputDir, testInfo, userSub) {
  // Write hashed user sub in parallel with userSub.txt
  try {
    const hasValidSub = userSub && userSub !== "null" && userSub !== "undefined";
    let valueToWrite = "";

    if (hasValidSub) {
      // Try to initialize salt (best-effort for diagnostics)
      const saltAvailable = await tryInitializeSalt();
      if (saltAvailable) {
        valueToWrite = hashSub(String(userSub));
      } else {
        console.log(`[afterEach] Skipping hash for hashedUserSub.txt (salt not available) for test "${testInfo.title}"`);
      }
    }

    console.log(
      `[afterEach] Saving ${outputDir}/hashedUserSub.txt for test "${testInfo.title}": ${valueToWrite ? valueToWrite : "(empty - user may not have logged in or salt not available)"}`,
    );
    fs.appendFileSync(path.join(outputDir, "hashedUserSub.txt"), valueToWrite, "utf-8");
  } catch (e) {
    console.log(`[afterEach] Error writing hashedUserSub.txt for test "${testInfo.title}": ${e.message}`);
  }
}

export async function extractUserSubFromLocalStorage(page, testInfo) {
  try {
    const userInfoStr = await page.evaluate(() => localStorage.getItem("userInfo"));
    if (userInfoStr) {
      console.log(`[test body] Found userInfo in localStorage for test "${testInfo.title}": ${userInfoStr}`);
      const userInfo = JSON.parse(userInfoStr);
      const userSub = userInfo?.sub || null;
      console.log(`[test body] Extracted userSub from localStorage for test "${testInfo.title}": ${userSub}`);
      return userSub;
    } else {
      console.log(`[test body] No userInfo found in localStorage for test "${testInfo.title}"`);
    }
  } catch (e) {
    console.log(`[test body] Error accessing localStorage: ${e.message}`);
  }
  return null;
}

export async function extractHmrcAccessTokenFromSessionStorage(page, testInfo) {
  try {
    const token = await page.evaluate(() => sessionStorage.getItem("hmrcAccessToken"));
    if (token) {
      console.log(`[test body] Found hmrcAccessToken in sessionStorage for test "${testInfo.title}"`);
      return token;
    } else {
      console.log(`[test body] No hmrcAccessToken found in sessionStorage for test "${testInfo.title}"`);
    }
  } catch (e) {
    console.log(`[test body] Error accessing sessionStorage: ${e.message}`);
  }
  return null;
}
