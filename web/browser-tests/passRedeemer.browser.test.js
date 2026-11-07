// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/passRedeemer.browser.test.js
//
// A pass link pointed at an activity page forwards to pass.html with the page as `next`.
// The widget never posts and never writes sessionStorage, so a link from another site cannot
// redeem a pass for a signed-in person.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("Pass Redeemer widget on an activity page", () => {
  let passRedeemerJsContent;

  test.beforeAll(async () => {
    passRedeemerJsContent = fs.readFileSync(path.join(process.cwd(), "web/public/widgets/pass-redeemer.js"), "utf-8");
  });

  const activityPageHtml = `<!doctype html>
<html lang="en">
  <head><base href="http://localhost:3000/" /></head>
  <body>
    <main id="mainContent"><h1>Activity page</h1></main>
    <script src="widgets/pass-redeemer.js"></script>
  </body>
</html>`;

  async function setup(page, { signedIn }) {
    if (signedIn) {
      await page.addInitScript(() => {
        try {
          localStorage.setItem("cognitoIdToken", "mock-id-token");
        } catch {}
      });
    }
    // Records every sessionStorage write, including one that a later page load would hide.
    await page.addInitScript(() => {
      const writes = [];
      window.__storageWrites = writes;
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (this === window.sessionStorage) writes.push(key);
        return original.call(this, key, value);
      };
    });
    const posts = [];
    page.on("request", (request) => {
      if (request.method() === "POST") posts.push(request.url());
    });
    await page.route("**/activity.html*", (route) => route.fulfill({ status: 200, contentType: "text/html", body: activityPageHtml }));
    await page.route("**/widgets/pass-redeemer.js", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: passRedeemerJsContent }),
    );
    await page.route("**/pass.html*", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Pass page</h1>" }));
    return posts;
  }

  for (const signedIn of [true, false]) {
    const who = signedIn ? "signed in" : "signed out";

    test(`${who}: forwards to the pass page with the page as next, and posts and stores nothing`, async ({ page }) => {
      const posts = await setup(page, { signedIn });
      await page.goto("http://localhost:3000/activity.html?pass=Word-Word-Word-Word", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL("http://localhost:3000/pass.html?pass=word-word-word-word&next=%2Factivity.html");
      expect(posts).toEqual([]);
      expect(await page.evaluate(() => window.__storageWrites)).toEqual([]);
      expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
    });

    test(`${who}: other query parameters stay in next and the pass parameter does not`, async ({ page }) => {
      const posts = await setup(page, { signedIn });
      await page.goto("http://localhost:3000/activity.html?vrn=123456789&pass=word-word-word-word&period=18A1", {
        waitUntil: "domcontentloaded",
      });
      await expect(page).toHaveURL(
        "http://localhost:3000/pass.html?pass=word-word-word-word&next=" + encodeURIComponent("/activity.html?vrn=123456789&period=18A1"),
      );
      expect(posts).toEqual([]);
      expect(await page.evaluate(() => window.__storageWrites)).toEqual([]);
    });

    test(`${who}: no pass parameter does nothing`, async ({ page }) => {
      const posts = await setup(page, { signedIn });
      await page.goto("http://localhost:3000/activity.html?vrn=123456789", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);
      await expect(page).toHaveURL("http://localhost:3000/activity.html?vrn=123456789");
      expect(posts).toEqual([]);
      expect(await page.evaluate(() => window.__storageWrites)).toEqual([]);
    });
  }
});
