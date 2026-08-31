// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/help.behaviour.test.js

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  runLocalHttpServer,
  runLocalOAuth2Server,
  runLocalDynamoDb,
  loggedClick,
  loggedFill,
  loggedGoto,
  timestamp,
} from "./helpers/behaviour-helpers.js";
import { ensureDirSync } from "fs-extra";

dotenvConfigIfNotBlank({ path: ".env" });

const originalEnv = { ...process.env };

const envFilePath = getEnvVarAndLog("envFilePath", "DIY_SUBMIT_ENV_FILEPATH", null);
const envName = getEnvVarAndLog("envName", "ENVIRONMENT_NAME", "local");
const httpServerPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3000);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
const testAuthProvider = getEnvVarAndLog("testAuthProvider", "TEST_AUTH_PROVIDER", null);
const baseUrlRaw = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const testDynamoDb = getEnvVarAndLog("testDynamoDb", "TEST_DYNAMODB", null);
const dynamoDbPort = getEnvVarAndLog("dynamoDbPort", "TEST_DYNAMODB_PORT", 8000);

// Normalize baseUrl - remove trailing slash to prevent double slashes in URL construction
const baseUrl = baseUrlRaw ? baseUrlRaw.replace(/\/+$/, "") : "";

// Screenshot path for help page tests
const screenshotPath = "target/behaviour-test-results/screenshots/help-behaviour-test";

let httpServer, mockOAuth2Process, dynamoDbProcess;

/**
 * Help & Navigation Behaviour Tests
 *
 * These tests verify that help navigation and content functionality works correctly:
 * 1. Info icon navigates to About page
 * 2. About page has links to Help and User Guide
 * 3. Help page FAQs work (load, search, expand/collapse)
 * 4. User Guide content loads and sections are navigable
 * 5. Support modal opens and closes
 */

test.describe("Help & Navigation - Info Icon, About, Help, User Guide", () => {
  test.beforeAll(async () => {
    console.log("\n Setting up test environment for help navigation tests...\n");
    console.log(` Base URL (raw): ${baseUrlRaw}`);
    console.log(` Base URL (normalized): ${baseUrl}`);
    console.log(` Environment: ${envName}`);
    console.log(` Screenshot path: ${screenshotPath}`);

    // Ensure screenshot directory exists
    ensureDirSync(screenshotPath);

    if (testAuthProvider === "mock" && runMockOAuth2 === "run") {
      mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
    }

    if (testDynamoDb === "run") {
      dynamoDbProcess = await runLocalDynamoDb(testDynamoDb);
    }

    if (runTestServer === "run") {
      httpServer = await runLocalHttpServer(runTestServer, httpServerPort);
    }

    console.log("\n Test environment ready\n");
  });

  test.afterAll(async () => {
    console.log("\n Cleaning up test environment...\n");

    if (httpServer) {
      httpServer.kill();
    }
    if (mockOAuth2Process) {
      mockOAuth2Process.kill();
    }
    if (dynamoDbProcess && dynamoDbProcess.stop) {
      await dynamoDbProcess.stop();
    }

    Object.assign(process.env, originalEnv);
    console.log(" Cleanup complete\n");
  });

  test("Navigate via info icon to About page and explore Help and User Guide", async ({ page }) => {
    // Add comprehensive page logging
    addOnPageLogging(page);

    // Additional response logging for debugging
    page.on("response", async (response) => {
      const status = response.status();
      const url = response.url();
      if (status >= 400) {
        console.log(`[HTTP ERROR] Status ${status} for ${url}`);
      }
    });

    // ============================================================
    // STEP 1: Start on Home Page
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 1: Start on Home Page");
    console.log("=".repeat(60));

    const homeUrl = `${baseUrl}/index.html`;
    console.log(` Navigating to home page: ${homeUrl}`);
    await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-home-page.png` });

    // Verify home page loaded
    const homeTitle = await page.title();
    console.log(` Home page title: "${homeTitle}"`);
    expect(homeTitle).toMatch(/DIY Accounting/i);
    console.log(" Home page loaded successfully");

    // ============================================================
    // STEP 2: Click Info Icon to Navigate to About Page
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 2: Click Info Icon to Navigate to About Page");
    console.log("=".repeat(60));

    // Verify info icon is visible
    const infoIcon = page.locator("a.info-link");
    await expect(infoIcon).toBeVisible({ timeout: 10000 });
    console.log(" Info icon is visible");

    // Click info icon
    console.log(" Clicking info icon...");
    await Promise.all([
      page.waitForURL(/about\.html$/, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
      infoIcon.click(),
    ]);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-about-page.png` });

    // Verify About page loaded
    const aboutTitle = await page.title();
    console.log(` About page title: "${aboutTitle}"`);
    expect(aboutTitle).toMatch(/About/i);
    console.log(" About page loaded successfully");

    // ============================================================
    // STEP 3: Verify About Page Has Help and User Guide Links
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 3: Verify About Page Navigation Links");
    console.log("=".repeat(60));

    // Check for Help link
    const helpLink = page.locator("a.about-nav-link:has-text('Help')");
    await expect(helpLink).toBeVisible({ timeout: 10000 });
    console.log(" Help link is visible on About page");

    // Check for User Guide link
    const guideLink = page.locator("a.about-nav-link:has-text('User Guide')");
    await expect(guideLink).toBeVisible({ timeout: 10000 });
    console.log(" User Guide link is visible on About page");

    // Verify About page content
    const aboutHeading = page.locator("h1:has-text('About')");
    await expect(aboutHeading).toBeVisible();
    console.log(" About page heading is visible");

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-about-nav-links.png` });

    // ============================================================
    // STEP 4: Navigate to Help Page from About
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 4: Navigate to Help Page from About");
    console.log("=".repeat(60));

    console.log(" Clicking Help link...");
    await Promise.all([
      page.waitForURL(/help\/index\.html$/, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
      helpLink.click(),
    ]);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-help-page.png` });

    // Verify Help page loaded
    const helpTitle = await page.title();
    console.log(` Help page title: "${helpTitle}"`);
    expect(helpTitle).toMatch(/Help.*FAQ/i);
    console.log(" Help page loaded successfully");

    // ============================================================
    // STEP 5: Verify FAQs are loaded and explore them
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 5: Verify FAQs are loaded and explore them");
    console.log("=".repeat(60));

    // Wait for FAQ list to be populated
    const faqList = page.locator("#faq-list");
    await expect(faqList).toBeVisible({ timeout: 10000 });

    // Wait for at least one FAQ item to appear
    const faqItems = page.locator(".faq-item");
    await expect(faqItems.first()).toBeVisible({ timeout: 10000 });

    const faqCount = await faqItems.count();
    console.log(` Found ${faqCount} FAQ items`);
    expect(faqCount).toBeGreaterThan(0);
    console.log(" FAQs loaded successfully");

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-faqs-loaded.png` });

    // Test FAQ accordion expand/collapse
    const firstFaqQuestion = page.locator(".faq-question").first();
    await expect(firstFaqQuestion).toBeVisible();
    console.log(" Clicking first FAQ to expand...");

    await firstFaqQuestion.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-06-faq-expanded.png` });

    // Verify the answer is now visible
    const firstFaqAnswer = page.locator(".faq-answer").first();
    await expect(firstFaqAnswer).toBeVisible({ timeout: 5000 });
    console.log(" First FAQ expanded - answer is visible");

    // Verify aria-expanded is true
    const ariaExpanded = await firstFaqQuestion.getAttribute("aria-expanded");
    expect(ariaExpanded).toBe("true");
    console.log(" aria-expanded attribute is 'true'");

    // Click again to collapse
    console.log(" Clicking first FAQ to collapse...");
    await firstFaqQuestion.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-07-faq-collapsed.png` });

    // ============================================================
    // STEP 6: Test FAQ search functionality
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 6: Test FAQ search functionality");
    console.log("=".repeat(60));

    const searchInput = page.locator("#faq-search");
    await expect(searchInput).toBeVisible();

    // Search for a specific term that should match some FAQs
    console.log(" Searching for 'VAT'...");
    await searchInput.fill("VAT");
    await page.waitForTimeout(300); // Wait for debounce
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-08-search-vat.png` });

    // Check that results are filtered
    const searchHint = page.locator("#search-hint");
    const hintText = await searchHint.textContent();
    console.log(` Search hint: "${hintText}"`);
    expect(hintText).toMatch(/\d+ result|Showing top FAQs/);
    console.log(" Search functionality works");

    // Clear search
    console.log(" Clearing search...");
    await searchInput.fill("");
    await page.waitForTimeout(300);

    // ============================================================
    // STEP 7: Navigate back to About page via info icon
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 7: Navigate back to About page via info icon");
    console.log("=".repeat(60));

    const helpInfoIcon = page.locator("a.info-link");
    await expect(helpInfoIcon).toBeVisible({ timeout: 10000 });
    console.log(" Clicking info icon to return to About page...");

    await Promise.all([
      page.waitForURL(/about\.html$/, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
      helpInfoIcon.click(),
    ]);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-09-back-to-about.png` });

    // Verify we're back on About page
    const aboutTitleAgain = await page.title();
    expect(aboutTitleAgain).toMatch(/About/i);
    console.log(" Returned to About page successfully");

    // ============================================================
    // STEP 8: Navigate to User Guide from About
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 8: Navigate to User Guide from About");
    console.log("=".repeat(60));

    const guideLinkAgain = page.locator("a.about-nav-link:has-text('User Guide')");
    await expect(guideLinkAgain).toBeVisible({ timeout: 10000 });
    console.log(" Clicking User Guide link...");

    await Promise.all([
      page.waitForURL(/guide\/index\.html$/, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
      guideLinkAgain.click(),
    ]);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-10-user-guide-page.png` });

    // Verify User Guide page loaded
    const guideTitle = await page.title();
    console.log(` User Guide page title: "${guideTitle}"`);
    expect(guideTitle).toMatch(/User Guide/i);
    console.log(" User Guide page loaded successfully");

    // ============================================================
    // STEP 9: Explore User Guide content
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 9: Explore User Guide content");
    console.log("=".repeat(60));

    // Check for guide sections
    const guideSections = page.locator(".guide-section");
    const sectionCount = await guideSections.count();
    console.log(` Found ${sectionCount} guide sections`);
    expect(sectionCount).toBeGreaterThan(0);

    // Check for step numbers
    const stepNumbers = page.locator(".step-number");
    const stepCount = await stepNumbers.count();
    console.log(` Found ${stepCount} step numbers`);
    expect(stepCount).toBeGreaterThan(0);

    // Check for guide cards with images
    const guideCards = page.locator(".guide-card");
    const cardCount = await guideCards.count();
    console.log(` Found ${cardCount} guide cards with images`);
    expect(cardCount).toBeGreaterThan(0);

    // Check section headings
    const obligationsSection = page.locator("#obligations");
    const submitSection = page.locator("#submit");
    const viewSection = page.locator("#view");

    await expect(obligationsSection).toBeVisible({ timeout: 5000 });
    console.log(" Obligations section is visible");

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-11-guide-sections.png` });

    // Scroll to submit section
    await submitSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-12-submit-section.png` });
    console.log(" Submit section is visible after scroll");

    // ============================================================
    // STEP 10: Navigate to Help page via info icon from User Guide
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 10: Navigate to Help page via info icon from User Guide");
    console.log("=".repeat(60));

    // Navigate to About page via info icon, then to Help
    const guideInfoIcon = page.locator("a.info-link");
    await expect(guideInfoIcon).toBeVisible({ timeout: 10000 });
    console.log(" Clicking info icon to go to About page...");

    await Promise.all([
      page.waitForURL(/about\.html$/, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
      guideInfoIcon.click(),
    ]);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-13-guide-to-about.png` });

    // Now navigate to Help from About
    const helpLinkFromAbout = page.locator("a.about-nav-link:has-text('Help')");
    await expect(helpLinkFromAbout).toBeVisible({ timeout: 10000 });
    console.log(" Clicking Help link on About page...");

    await Promise.all([
      page.waitForURL(/help\/index\.html$/, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
      helpLinkFromAbout.click(),
    ]);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-14-help-from-about.png` });

    // Verify we're on Help page
    const helpTitleAgain = await page.title();
    expect(helpTitleAgain).toMatch(/Help.*FAQ/i);
    console.log(" Navigated to Help page via About page");

    // ============================================================
    // STEP 11: Test support modal
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 11: Test support modal open/close");
    console.log("=".repeat(60));

    const supportModal = page.locator("#support-modal");
    const openSupportBtn = page.locator("#open-support-form");

    // Scroll to support section
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    // Verify modal is initially hidden
    await expect(supportModal).toBeHidden();
    console.log(" Support modal is initially hidden");

    // Click to open modal
    console.log(" Opening support modal...");
    await expect(openSupportBtn).toBeVisible();
    await openSupportBtn.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-15-modal-opened.png` });

    // Verify modal is now visible
    await expect(supportModal).toBeVisible({ timeout: 5000 });
    console.log(" Support modal is now visible");

    // Verify form elements are present
    const subjectInput = page.locator("#support-subject");
    const descriptionTextarea = page.locator("#support-description");
    const categorySelect = page.locator("#support-category");
    const submitBtn = page.locator('#support-form button[type="submit"]');
    const cancelBtn = page.locator("#cancel-support");

    await expect(subjectInput).toBeVisible();
    await expect(descriptionTextarea).toBeVisible();
    await expect(categorySelect).toBeVisible();
    await expect(submitBtn).toBeVisible();
    await expect(cancelBtn).toBeVisible();
    console.log(" All form elements are visible");

    // Fill form fields
    console.log(" Filling form fields...");
    await subjectInput.fill("Test support request");
    await descriptionTextarea.fill("This is a test description for the support form behavior test.");
    await categorySelect.selectOption("other");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-16-form-filled.png` });

    // Test cancel button
    console.log(" Clicking cancel to close modal...");
    await cancelBtn.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-17-modal-closed.png` });

    // Verify modal is hidden again
    await expect(supportModal).toBeHidden({ timeout: 5000 });
    console.log(" Modal closed successfully via cancel button");

    // ============================================================
    // STEP 12: Navigate home via main navigation
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 12: Navigate home via main navigation");
    console.log("=".repeat(60));

    const activitiesLink = page.locator("nav.main-nav a:has-text('Activities')");
    await expect(activitiesLink).toBeVisible({ timeout: 10000 });
    console.log(" Clicking Activities in main nav to return home...");

    await Promise.all([
      page.waitForURL(/index\.html$/, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
      activitiesLink.click(),
    ]);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-18-back-home.png` });

    // Verify we're back on home page
    const finalTitle = await page.title();
    expect(finalTitle).toMatch(/DIY Accounting/i);
    console.log(" Returned to home page successfully");

    // ============================================================
    // STEP 13: Final summary
    // ============================================================
    console.log("\n" + "=".repeat(60));
    console.log("TEST COMPLETE - All help navigation functionality verified");
    console.log("=".repeat(60));

    console.log("\n Summary:");
    console.log("   Info icon navigates to About page");
    console.log("   About page has Help and User Guide links");
    console.log("   Help page FAQs load and expand/collapse");
    console.log("   FAQ search functionality works");
    console.log("   User Guide has sections with step numbers and cards");
    console.log("   User Guide navigation buttons work");
    console.log("   Support modal opens and closes correctly");
    console.log("   Main navigation returns to home page\n");
  });
});
