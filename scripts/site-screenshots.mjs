// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DEV-47 Capture a screenshot of every site page
// - **Use when:** a design pass or visual review needs every page under web/public at phone and desktop width, light and dark, with the console errors each page logs.
// - **Does:** site-screenshots.mjs finds every .html page under web/public except tests/ and docs/. It starts the simulator lane when none answers, and stops what it started. It signs in once through the mock OAuth form. It opens each page at 1280 and 390 pixels, in light and dark colour schemes. It takes a full-page PNG as the page loads, and a second PNG after it submits an empty form when the page has a submit button. A page that redirects an anonymous visitor to sign-in is captured again, signed in. It writes index.json with page, width, theme, state, file and console errors.
// - **Run:** `npm run site:screenshots`; `node scripts/site-screenshots.mjs --only <part-of-page-path> --out <dir>`
// - **Entry:** `scripts/site-screenshots.mjs:main`
// - **Files:** scripts/site-screenshots.mjs, package.json
// - **Keywords:** site screenshots, page screenshots, whole-site design pass, console errors, dark mode, responsive, phone width, empty form, index.json
// - **Related:** DEV-14, DEV-46
// @end-capability

// scripts/site-screenshots.mjs
//
// Full-page screenshots of every page under web/public/ (except tests/ and docs/) at two widths
// and two colour schemes, against the simulator lane. Each page is captured as it loads, and
// again after submitting its empty form when it has a submit button. A page that redirects an
// anonymous visitor to sign-in is captured again after the mock sign-in. Output goes to
// target/site-screenshots/<page>/<width>-<theme>[-<state>].png with an index.json that lists
// every file and any console error the page logged.
//
// --signed-in captures every selected page after the mock sign-in, not only the ones that redirect.
//
// --scene <name>[,<name>] captures only the named signed-in scenes (see SCENES) and writes
// <out>/<name>/<width>-<theme>.png, in place of the page sweep. A scene answers one API call with a
// fixed, realistic body, for a state no seeded simulator account reaches.
//
// Usage: node scripts/site-screenshots.mjs [--base-url <url>] [--out <dir>] [--only <substring>[,<substring>]] [--signed-in] [--scene <name>[,<name>]]

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PUBLIC_DIR = "web/public";
const EXCLUDED_TOP_DIRS = new Set(["tests", "docs"]);
const WIDTHS = [1280, 390];
const THEMES = ["light", "dark"];
const SIGN_IN_USER = "site-screenshots";
const START_TIMEOUT_MS = 90000;

export function discoverPages(publicDir = PUBLIC_DIR) {
  const pages = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const relative = path.relative(publicDir, full).split(path.sep).join("/");
      if (entry.isDirectory()) {
        if (!EXCLUDED_TOP_DIRS.has(relative)) walk(full);
      } else if (entry.name.endsWith(".html")) {
        pages.push(relative);
      }
    }
  };
  walk(publicDir);
  return pages.sort();
}

export function screenshotName(width, theme, state) {
  return `${width}-${theme}${state ? `-${state}` : ""}.png`;
}

const GENERATED_PASSES_BODY = {
  passes: [
    {
      code: "maple-river-quiet-harbour",
      passTypeId: "digital-pass",
      bundleId: "resident-vat",
      validFrom: "2026-08-01T00:00:00.000Z",
      validUntil: "2027-08-01T00:00:00.000Z",
      maxUses: 25,
      useCount: 14,
      heldForReview: false,
      createdAt: "2026-08-01T09:30:00.000Z",
      notes: "Bookkeepers' meet-up",
      revokedAt: null,
      figures: {
        uses: 14,
        newAccounts: 11,
        filed: 6,
        subscribers: 4,
        paidCharges: 3,
        fewerThanThree: false,
        lastUsed: "2026-10-28T16:05:00.000Z",
      },
    },
    {
      code: "amber-field-tall-lantern",
      passTypeId: "physical-pass",
      bundleId: "resident-vat",
      validFrom: "2026-09-10T00:00:00.000Z",
      validUntil: null,
      maxUses: 50,
      useCount: 7,
      heldForReview: false,
      createdAt: "2026-09-10T11:00:00.000Z",
      notes: "Market stall flyers",
      revokedAt: null,
      figures: {
        uses: 7,
        newAccounts: 5,
        filed: 2,
        subscribers: 1,
        paidCharges: 1,
        fewerThanThree: false,
        lastUsed: "2026-10-25T10:40:00.000Z",
      },
    },
  ],
  count: 2,
  totals: {
    passes: 2,
    countedPasses: 2,
    uses: 21,
    newAccounts: 16,
    filed: 8,
    subscribers: 5,
    paidCharges: 4,
    fewerThanThree: false,
    lastUsed: "2026-10-28T16:05:00.000Z",
  },
};

export const SCENES = {
  "bundles-my-generated-passes": {
    page: "bundles.html",
    apiRoute: { url: "**/api/v1/pass/my-passes*", body: GENERATED_PASSES_BODY },
    waitFor: "#generatedPassesList .pass-figures",
    clip: "#myGeneratedPasses",
  },
};

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.SITE_SCREENSHOTS_BASE_URL || null,
    out: "target/site-screenshots",
    only: null,
    signedIn: false,
    scene: null,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base-url") args.baseUrl = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--only") args.only = argv[++i];
    else if (argv[i] === "--signed-in") args.signedIn = true;
    else if (argv[i] === "--scene") args.scene = argv[++i];
  }
  return args;
}

async function answers(baseUrl) {
  try {
    const response = await fetch(new URL("/index.html", baseUrl), { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

// Starts `npm run start:simulator` in its own process group and reads the site URL from the
// server's own "Listening at" line. stop() signals the whole group so dynalite and the HTTP
// simulator go down with it.
export async function startSimulator() {
  console.log("Starting the simulator lane (npm run start:simulator)...");
  const child = spawn("npm", ["run", "start:simulator"], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`simulator did not report a URL in ${START_TIMEOUT_MS}ms:\n${output.slice(-2000)}`)),
      START_TIMEOUT_MS,
    );
    const onData = (chunk) => {
      output += chunk.toString();
      const match = output.match(/Listening at (http:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`simulator exited before it was ready (code ${code}):\n${output.slice(-2000)}`));
    });
  });
  return {
    url,
    stop: () => {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    },
  };
}

// The simulator lane builds its OAuth redirect from DIY_SUBMIT_BASE_URL in .env.simulator, while
// the server listens on an ephemeral port. Pages open on that configured origin, and the browser
// maps that origin to the port the server bound, so the server sees the host it expects and its
// content security policy holds.
export function configuredOrigin() {
  const text = fs.readFileSync(".env.simulator", "utf8");
  const match = text.match(/^DIY_SUBMIT_BASE_URL=(\S+)/m);
  return new URL(match ? match[1] : "http://localhost:3000/").origin;
}

export async function signIn(browser, { pageOrigin }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${pageOrigin}/auth/login.html`, { waitUntil: "domcontentloaded" });
  await page.getByText("Continue with mock-oauth2-server").click();
  await page.locator('input[type="submit"][value="Sign-in"]').waitFor({ timeout: 15000 });
  await page.fill('input[name="username"]', SIGN_IN_USER);
  await page.fill('textarea[name="claims"]', JSON.stringify({ email: `synthetic-${SIGN_IN_USER}@test.diyaccounting.co.uk` }));
  await page.click('input[type="submit"][value="Sign-in"]');
  await page.waitForLoadState("networkidle");
  await page.goto(`${pageOrigin}/index.html`, { waitUntil: "load" });
  await page.getByText("Logged in as").waitFor({ timeout: 20000 });
  const state = await context.storageState();
  await context.close();
  return state;
}

const SUBMIT_SELECTOR = 'button[type="submit"], input[type="submit"], form button:not([type])';

async function capturePage(browser, { pageOrigin, outDir, page: pagePath, storageState, signedIn, width, theme, entries, redirected }) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    colorScheme: theme,
    ...(storageState ? { storageState } : {}),
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("consent.rum", "declined");
      localStorage.setItem("consent.analytics", "declined");
    } catch {
      // storage is blocked: the banner shows and the capture goes on
    }
  });
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: theme });
  let errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

  const shoot = async (state) => {
    const file = path.join(outDir, pagePath, screenshotName(width, theme, state));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, fullPage: true });
    entries.push({
      page: pagePath,
      width,
      theme,
      state: state || "default",
      signedIn,
      file: path.relative(outDir, file),
      finalPath: new URL(page.url()).pathname,
      consoleErrors: errors,
    });
    errors = [];
  };

  const target = `${pageOrigin}/${pagePath}`;
  try {
    await page.goto(target, { waitUntil: "load", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    const finalPath = new URL(page.url()).pathname;
    if (!signedIn && !pagePath.startsWith("auth/") && finalPath.startsWith("/auth/")) {
      redirected.add(pagePath);
    }
    await shoot(null);

    const submit = page.locator(SUBMIT_SELECTOR).locator("visible=true").first();
    if ((await submit.count()) > 0) {
      await submit.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(600);
      await shoot("empty-submit");
    }
  } catch (error) {
    errors.push(`capture failed: ${error.message}`);
    entries.push({ page: pagePath, width, theme, state: "capture-failed", signedIn, file: null, finalPath: null, consoleErrors: errors });
  }
  await context.close();
}

async function captureScene(browser, { pageOrigin, outDir, name, scene, storageState, width, theme }) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, storageState });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("consent.rum", "declined");
      localStorage.setItem("consent.analytics", "declined");
    } catch {
      // storage is blocked: the banner shows and the capture goes on
    }
  });
  const page = await context.newPage();
  await page.route(scene.apiRoute.url, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(scene.apiRoute.body) }),
  );
  await page.goto(`${pageOrigin}/${scene.page}`, { waitUntil: "load", timeout: 30000 });
  await page.locator(scene.waitFor).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  const file = path.join(outDir, name, screenshotName(width, theme, null));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.locator(scene.clip).screenshot({ path: file });
  await context.close();
  return file;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.out);
  let pages = discoverPages();
  if (args.only) pages = pages.filter((p) => args.only.split(",").some((part) => p.includes(part)));

  let simulator = null;
  let browser = null;
  try {
    if (!args.baseUrl || !(await answers(args.baseUrl))) {
      simulator = await startSimulator();
      args.baseUrl = simulator.url;
    }
    console.log(`Capturing ${pages.length} pages from ${args.baseUrl}`);
    if (!args.scene) fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    const pageOrigin = configuredOrigin();
    const mapped = new URL(args.baseUrl);
    browser = await chromium.launch({ args: [`--host-resolver-rules=MAP ${new URL(pageOrigin).host} ${mapped.host}`] });

    const storageState = await signIn(browser, { pageOrigin });
    if (args.scene) {
      for (const name of args.scene.split(",")) {
        const scene = SCENES[name];
        if (!scene) throw new Error(`unknown scene ${name}; known: ${Object.keys(SCENES).join(", ")}`);
        for (const width of WIDTHS) {
          console.log(
            `Scene ${name}: ${await captureScene(browser, { pageOrigin, outDir, name, scene, storageState, width, theme: "light" })}`,
          );
        }
      }
      return;
    }
    const entries = [];
    const redirected = new Set();
    for (const width of WIDTHS) {
      for (const theme of THEMES) {
        for (const page of pages) {
          await capturePage(browser, { pageOrigin, outDir, page, storageState: null, signedIn: false, width, theme, entries, redirected });
        }
      }
    }

    if (args.signedIn) for (const page of pages) redirected.add(page);
    if (redirected.size > 0) {
      for (const width of WIDTHS) {
        for (const theme of THEMES) {
          for (const page of [...redirected].sort()) {
            // Replace the sign-in redirect captures with the page itself.
            for (let i = entries.length - 1; i >= 0; i--) {
              const e = entries[i];
              if (e.page === page && e.width === width && e.theme === theme && !e.signedIn) {
                if (e.file) fs.rmSync(path.join(outDir, e.file), { force: true });
                entries.splice(i, 1);
              }
            }
            await capturePage(browser, {
              pageOrigin,
              outDir,
              page,
              storageState,
              signedIn: true,
              width,
              theme,
              entries,
              redirected: new Set(),
            });
          }
        }
      }
    }

    fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(entries, null, 2));
    const withFile = entries.filter((e) => e.file).length;
    const pagesWithErrors = new Set(entries.filter((e) => e.consoleErrors.length > 0).map((e) => e.page));
    console.log(`Wrote ${withFile} screenshots for ${pages.length} pages to ${outDir}`);
    console.log(`Pages with console errors: ${pagesWithErrors.size}`);
    for (const p of [...pagesWithErrors].sort()) console.log(`  ${p}`);
  } finally {
    if (browser) await browser.close();
    if (simulator) simulator.stop();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
