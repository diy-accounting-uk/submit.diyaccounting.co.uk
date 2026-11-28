// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/itsaLossesAndClaims.browser.test.js
// Browser tests for the ITSA losses-and-claims and tax-liability-adjustments pages

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  serveMoneyInput,
  serveFormErrors,
  serveCarriedIdentifiers,
  serveHmrcFieldTableAssets,
  serveSiteStyles,
  screenshotPath,
  serveItsaPageScripts,
  serveHmrcWrite,
} from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function readPage(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8");
}

async function loadPage(page, html, url) {
  await page.route("**/*.js", async (route) => {
    const request = route.request();
    if (request.resourceType() === "script") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    } else {
      await route.continue();
    }
  });
  await serveItsaPageScripts(page);

  await serveMoneyInput(page);
  await serveFormErrors(page);
  await serveCarriedIdentifiers(page);
  await serveHmrcWrite(page);

  const modifiedHtml = html.replace("<head>", `<head><base href="${new URL(".", url)}">`).replace(
    "<body>",
    `<body><script>
window.showStatus = window.showStatus || function(){};
window.hideStatus = window.hideStatus || function(){};
window.showLoading = window.showLoading || function(){};
window.hideLoading = window.hideLoading || function(){};
window.generateRandomState = window.generateRandomState || function(){ return "test-state"; };
window.getGovClientHeaders = window.getGovClientHeaders || function(){ return Promise.resolve({}); };
window.authorizedFetch = window.authorizedFetch || function(){ return Promise.resolve({ ok: true, json: function(){ return Promise.resolve({}); }}); };
</script>`,
  );

  await page.setContent(modifiedHtml, { url, waitUntil: "domcontentloaded" });
  await delay(200);
}

// loadPage()'s synthetic setContent document throws a SecurityError the moment a later
// page.evaluate() reads sessionStorage (see itsaAccessibility.browser.test.js's loadItsaPage
// for the same issue on dashboard.html) - route+goto gives the page a real origin instead.
async function loadPageAtRealOrigin(page, html, url) {
  await page.route("**/*.js", async (route) => {
    const request = route.request();
    if (request.resourceType() === "script") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    } else {
      await route.continue();
    }
  });
  await serveItsaPageScripts(page);

  await serveMoneyInput(page);
  await serveFormErrors(page);
  await serveCarriedIdentifiers(page);
  await serveHmrcWrite(page);

  const modifiedHtml = html.replace(
    "<body>",
    `<body><script>
window.showStatus = window.showStatus || function(){};
window.hideStatus = window.hideStatus || function(){};
window.showLoading = window.showLoading || function(){};
window.hideLoading = window.hideLoading || function(){};
window.generateRandomState = window.generateRandomState || function(){ return "test-state"; };
window.getGovClientHeaders = window.getGovClientHeaders || function(){ return Promise.resolve({}); };
window.authorizedFetch = window.authorizedFetch || function(){ return Promise.resolve({ ok: true, json: function(){ return Promise.resolve({}); }}); };
</script>`,
  );

  await page.route(url, async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: modifiedHtml });
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await delay(200);
}

test.describe("ITSA Losses and Claims - Form", () => {
  let html;

  test.beforeAll(async () => {
    html = readPage("web/public/hmrc/itsa/lossesAndClaims.html");
  });

  test("displays the load form and the load button", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/lossesAndClaims.html");

    await expect(page.locator("#itsaLossesLoadForm")).toBeVisible();
    await expect(page.locator("#nino")).toBeVisible();
    await expect(page.locator("#businessId")).toBeVisible();
    await expect(page.locator("#loadBtn")).toBeVisible();
    await expect(page.locator("#lossesEditForm")).toBeHidden();
  });

  // #typeOfBusiness lives on the load form, so it must be selected while that form is still
  // visible - hiding it first leaves the element with no visible ancestor, and Playwright's
  // selectOption() then waits out the full test timeout for an element that can never become
  // actionable again.
  async function showEditForm(page) {
    await page.evaluate(() => {
      document.getElementById("loadCriteriaForm").style.display = "none";
      document.getElementById("lossesEditForm").style.display = "block";
      // Mirrors what populateEditForm() does on a real load - a form shown any other way
      // (as this test harness does) starts in the same state a real load would leave it in.
      updateCarryBackVisibility();
    });
  }

  test("shows the carry-back section for a self-employment business", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/lossesAndClaims.html");

    await page.locator("#typeOfBusiness").selectOption("self-employment");
    await showEditForm(page);
    await expect(page.locator("#carryBackSection")).toBeVisible();
  });

  test("hides the carry-back section for a UK property business", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/lossesAndClaims.html");

    await page.locator("#typeOfBusiness").selectOption("uk-property");
    await showEditForm(page);
    await expect(page.locator("#carryBackSection")).toBeHidden();
  });

  test("hides the carry-back section for a foreign property business", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/lossesAndClaims.html");

    await page.locator("#typeOfBusiness").selectOption("foreign-property");
    await showEditForm(page);
    await expect(page.locator("#carryBackSection")).toBeHidden();
  });

  test("states which claim is about to be made before the customer saves", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/lossesAndClaims.html");
    await showEditForm(page);

    await expect(page.locator("#claimSummary")).toHaveText("No claim is entered yet.");

    await page.locator("#currentYearLosses").fill("1000");
    await page.locator("#currentYearLosses").dispatchEvent("input");
    await expect(page.locator("#claimSummary")).toContainText("carry the loss forward");
  });

  test("shows the preference order only when both a sideways and a carry-back claim are entered", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/lossesAndClaims.html");
    await showEditForm(page);

    await expect(page.locator("#preferenceOrderSection")).toBeHidden();

    await page.locator("#currentYearGeneralIncome").fill("500");
    await page.locator("#currentYearGeneralIncome").dispatchEvent("input");
    await expect(page.locator("#preferenceOrderSection")).toBeHidden();

    await page.locator("#previousYearGeneralIncome").fill("200");
    await page.locator("#previousYearGeneralIncome").dispatchEvent("input");
    await expect(page.locator("#preferenceOrderSection")).toBeVisible();
  });

  // Load needs a wider HMRC scope than Business Details granted, so ticking this checkbox
  // and clicking Load can be followed by HMRC's own reauthorisation redirect, which reloads
  // the page and resets the checkbox to unchecked (plain DOM state, not sessionStorage) -
  // the reload is simulated directly since sessionStorage, unlike that DOM state, survives it.
  test("keeps the suspend-temporal-validations tick across a reauth reload", async ({ page }) => {
    await loadPageAtRealOrigin(page, html, "http://localhost:3000/hmrc/itsa/lossesAndClaims.html");

    await page.evaluate(() => {
      document.getElementById("suspendTemporalValidations").checked = true;
      window.persistSuspendTemporalValidations();
    });

    // HMRC's reauthorisation redirect reloads the page from scratch, resetting the checkbox
    // to its default unchecked DOM state - simulated directly here, since sessionStorage
    // (unlike that DOM state) survives the round trip.
    await page.evaluate(() => {
      document.getElementById("suspendTemporalValidations").checked = false;
    });
    await expect(page.locator("#suspendTemporalValidations")).not.toBeChecked();

    await page.evaluate(() => window.restoreSuspendTemporalValidations());

    await expect(page.locator("#suspendTemporalValidations")).toBeChecked();
  });

  test("does not tick suspend-temporal-validations back on when it was never ticked", async ({ page }) => {
    await loadPageAtRealOrigin(page, html, "http://localhost:3000/hmrc/itsa/lossesAndClaims.html");

    await page.evaluate(() => window.persistSuspendTemporalValidations());
    await page.evaluate(() => window.restoreSuspendTemporalValidations());

    await expect(page.locator("#suspendTemporalValidations")).not.toBeChecked();
  });
});

test.describe("ITSA Tax Liability Adjustments - Form", () => {
  let html;

  test.beforeAll(async () => {
    html = readPage("web/public/hmrc/itsa/taxLiabilityAdjustments.html");
  });

  test("displays the load form and the load button", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/taxLiabilityAdjustments.html");

    await expect(page.locator("#itsaAdjustmentsLoadForm")).toBeVisible();
    await expect(page.locator("#nino")).toBeVisible();
    await expect(page.locator("#taxYear")).toBeVisible();
    await expect(page.locator("#loadBtn")).toBeVisible();
    await expect(page.locator("#adjustmentsEditForm")).toBeHidden();
  });

  test("shows the earlier year figure as not yet retrieved before the button is used", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/taxLiabilityAdjustments.html");

    await expect(page.locator("#earlierYearFigure")).toHaveText("Not yet retrieved");
  });

  test("uppercases the NINO as the user types", async ({ page }) => {
    await loadPage(page, html, "http://localhost:3000/hmrc/itsa/taxLiabilityAdjustments.html");

    await page.locator("#nino").fill("ab123456c");
    await expect(page.locator("#nino")).toHaveValue("AB123456C");
  });

  test("offers a calculation test scenario in developer mode and sends it with that year's calculation", async ({ page }) => {
    await serveSiteStyles(page);
    await page.addInitScript(() => sessionStorage.setItem("showDeveloperOptions", "true"));
    await loadPageAtRealOrigin(page, html, "http://localhost:3000/hmrc/itsa/taxLiabilityAdjustments.html");
    await serveHmrcFieldTableAssets(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.setViewportSize({ width: 1280, height: 900 });

    const select = page.locator("#calculationTestScenario");
    await expect(select).toBeVisible();
    await expect(select.locator("option")).toHaveText([
      "Default (a UK self-employment example)",
      "UK self-employment with Gift Aid",
      "Scottish self-employment with dividends",
    ]);
    await select.selectOption("UK_SE_GIFTAID_EXAMPLE");
    await page.locator("#developerSection").screenshot({ path: screenshotPath("taxLiabilityAdjustments-developer") });

    const sentScenario = await page.evaluate(async () => {
      let received;
      window.triggerCalculation = async (details, token, headers, validate, testScenario) => {
        received = testScenario;
        return { calculation: { taxCalculation: { totalIncomeTaxAndNicsDue: 1700 } } };
      };
      document.getElementById("adjustmentsEditForm").style.display = "block";
      await window.showEarlierYearFigure();
      return received;
    });
    expect(sentScenario).toBe("UK_SE_GIFTAID_EXAMPLE");
    await expect(page.locator("#earlierYearFigure")).toHaveText("£1,700.00");
  });

  test("sends no calculation test scenario when the default is left selected", async ({ page }) => {
    await loadPageAtRealOrigin(page, html, "http://localhost:3000/hmrc/itsa/taxLiabilityAdjustments.html");
    await serveHmrcFieldTableAssets(page);
    await page.reload({ waitUntil: "domcontentloaded" });

    const sentScenario = await page.evaluate(async () => {
      let received = "unset";
      window.triggerCalculation = async (details, token, headers, validate, testScenario) => {
        received = testScenario;
        return { calculation: { taxCalculation: {} } };
      };
      await window.showEarlierYearFigure();
      return received;
    });
    expect(sentScenario).toBeNull();
    await expect(page.locator("#earlierYearFigure")).toHaveText("—");
  });
});

// HMRC's answer to a refused write, as the server passes it on: the page makes it an Error.
function hmrcRefusal(code, message) {
  return {
    status: 400,
    body: { message: "HMRC rejected the request", error: { hmrcResponseCode: 400, responseBody: { code, message } } },
  };
}

async function signedInToHmrc(page) {
  await page.addInitScript(() => sessionStorage.setItem("hmrcGrantId", "grant-1"));
}

test.describe("ITSA year-end forms - field notes, stages and the failure panel", () => {
  const TLA_URL = "http://localhost:3000/hmrc/itsa/taxLiabilityAdjustments.html";
  const LOSSES_URL = "http://localhost:3000/hmrc/itsa/lossesAndClaims.html";

  test("each tax liability adjustment carries HMRC's meaning in a note that links to HMRC's description", async ({ page }) => {
    await loadPageAtRealOrigin(page, readPage("web/public/hmrc/itsa/taxLiabilityAdjustments.html"), TLA_URL);

    const note = page.locator("#class4-hint");
    await expect(note).toHaveText(
      "The decrease in Class 4 National Insurance from carrying a loss back. It is worked out from an earlier year's liability and taken off this year's total. HMRC's description of this field.",
    );
    await expect(note.locator("a")).toHaveAttribute(
      "href",
      "https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/individuals-tax-liability-adjustments-api/1.0",
    );
    await expect(page.locator("#class4")).toHaveAttribute("aria-describedby", "class4-hint class4-money-hint");
    await serveSiteStyles(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => (document.getElementById("adjustmentsEditForm").style.display = "block"));
    await expect(page.locator("#class4-hint")).toBeVisible();
    await page.locator("#adjustmentsEditForm").screenshot({ path: screenshotPath("taxLiabilityAdjustments-notes") });
  });

  test("each loss and claim carries HMRC's meaning in a note that links to HMRC's description", async ({ page }) => {
    await loadPageAtRealOrigin(page, readPage("web/public/hmrc/itsa/lossesAndClaims.html"), LOSSES_URL);

    await expect(page.locator("#terminalLosses-hint")).toContainText(
      "This year's trading loss carried back against the profits of the three years before, the latest year first.",
    );
    await expect(page.locator("#terminalLosses-hint a")).toHaveAttribute(
      "href",
      "https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/individual-losses-api/7.0",
    );
    for (const id of [
      "broughtForwardLosses",
      "currentYearLosses",
      "previousYearsLosses",
      "currentYearGeneralIncome",
      "previousYearGeneralIncome",
      "earlyYearLosses",
      "terminalLosses",
      "applyFirst",
    ]) {
      await expect(page.locator(`#${id}-hint a`), id).toHaveText("HMRC's description of this field");
    }
  });

  test("saving the adjustments says it is sending to HMRC, and a refusal shows the panel with HMRC's error and the figures kept", async ({
    page,
  }) => {
    await serveSiteStyles(page);
    await signedInToHmrc(page);
    await loadPageAtRealOrigin(page, readPage("web/public/hmrc/itsa/taxLiabilityAdjustments.html"), TLA_URL);
    await page.evaluate(
      (refusal) => {
        window.putTaxLiabilityAdjustments = () =>
          new Promise((resolve, reject) => {
            window.answerHmrc = () => reject(Object.assign(new Error("HMRC rejected the request"), refusal));
          });
        document.getElementById("loadCriteriaForm").style.display = "none";
        document.getElementById("adjustmentsEditForm").style.display = "block";
      },
      hmrcRefusal("RULE_TAX_YEAR_NOT_ENDED", "The tax year has not yet ended"),
    );
    await page.locator("#incomeTax").fill("420");

    await page.locator("#saveBtn").click();
    await expect(page.locator("#statusMessagesContainer")).toContainText("Sending the tax liability adjustments to HMRC...");
    await page.evaluate(() => window.answerHmrc());

    const panel = page.locator("#failureDetail");
    await expect(panel).toHaveAttribute("data-kind", "business-error");
    await expect(panel.locator('[data-part="sent"]')).toHaveText("HMRC has not got the tax liability adjustments.");
    await expect(panel.locator('[data-part="answers"]')).toHaveText("Your figures are still in the form.");
    await expect(panel.locator('[data-part="errors"]')).toHaveText("The tax year has not yet ended (RULE_TAX_YEAR_NOT_ENDED)");
    await expect(page.locator("#statusMessagesContainer")).not.toContainText("Sending the tax liability adjustments to HMRC...");
    await expect(page.locator("#incomeTax")).toHaveValue("420");
    await page.screenshot({ path: screenshotPath("taxLiabilityAdjustments-failure-panel"), fullPage: true });
  });

  test("asking HMRC for the earlier year's figure shows the panel when HMRC cannot calculate it", async ({ page }) => {
    await signedInToHmrc(page);
    await loadPageAtRealOrigin(page, readPage("web/public/hmrc/itsa/taxLiabilityAdjustments.html"), TLA_URL);
    await page.evaluate(() => {
      window.triggerCalculation = () =>
        Promise.reject(Object.assign(new Error("Request failed"), { status: 502, body: { error: { hmrcResponseCode: 503 } } }));
      document.getElementById("adjustmentsEditForm").style.display = "block";
    });

    await page.locator("#showEarlierYearBtn").click();

    await expect(page.locator("#earlierYearFigure")).toHaveText("Could not retrieve HMRC's calculation for that year.");
    await expect(page.locator('#failureDetail [data-part="sent"]')).toHaveText("HMRC has not calculated that year's figure.");
  });

  test("saving the losses and claims shows the panel with HMRC's error when HMRC refuses the claim", async ({ page }) => {
    await serveSiteStyles(page);
    await signedInToHmrc(page);
    await loadPageAtRealOrigin(page, readPage("web/public/hmrc/itsa/lossesAndClaims.html"), LOSSES_URL);
    await page.evaluate(
      (refusal) => {
        window.putLossesAndClaims = () => Promise.reject(Object.assign(new Error("HMRC rejected the request"), refusal));
        document.getElementById("loadCriteriaForm").style.display = "none";
        document.getElementById("lossesEditForm").style.display = "block";
      },
      hmrcRefusal("RULE_CARRY_BACK_CLAIM", "A carry back claim is not allowed for this business"),
    );
    await page.locator("#currentYearLosses").fill("1500");

    await page.locator("#saveBtn").click();

    const panel = page.locator("#failureDetail");
    await expect(panel.locator('[data-part="sent"]')).toHaveText("HMRC has not got the losses and claims.");
    await expect(panel.locator('[data-part="answers"]')).toHaveText("Your figures are still in the form.");
    await expect(panel.locator('[data-part="errors"]')).toHaveText(
      "A carry back claim is not allowed for this business (RULE_CARRY_BACK_CLAIM)",
    );
    await panel.screenshot({ path: screenshotPath("lossesAndClaims-failure-panel") });
  });
});
