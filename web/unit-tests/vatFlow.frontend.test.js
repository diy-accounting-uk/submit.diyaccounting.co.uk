// web/unit-tests/vatFlow.frontend.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { Window } from "happy-dom";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

import { buildGovClientTestHeaders } from "@app/unit-tests/lib/govClientTestHeader.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Read the HTML file content
const htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/vat/submitVat.html"), "utf-8");

describe("VAT Flow Frontend JavaScript", () => {
  const originalEnv = process.env;

  let window;
  let document;
  let fetchMock;

  beforeEach(() => {
    vi.clearAllMocks();

    process.env = {
      ...originalEnv,
    };

    // Create a new DOM window for each test (v20+ requires enabling JS evaluation)
    try {
      window = new Window({
        settings: {
          enableJavaScriptEvaluation: true,
          // Avoid noisy console warning in CI about insecure JS env during tests
          suppressInsecureJavaScriptEnvironmentWarning: true,
        },
      });
    } catch (err) {
      // Fallback for Happy DOM v19 which doesn't support the setting
      if (String(err?.message || err).includes("Unknown browser setting")) {
        window = new Window();
      } else {
        throw err;
      }
    }
    document = window.document;

    // Set up global objects
    global.window = window;
    global.document = document;
    global.sessionStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    // Also add sessionStorage to window for script access
    Object.defineProperty(window, "sessionStorage", {
      value: global.sessionStorage,
      writable: true,
    });

    // Mock localStorage
    global.localStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    // Also add localStorage to window for script access
    Object.defineProperty(window, "localStorage", {
      value: global.localStorage,
      writable: true,
    });
    global.URLSearchParams = window.URLSearchParams;
    global.FormData = window.FormData;
    global.Event = window.Event;
    global.CustomEvent = window.CustomEvent;

    // Mock fetch
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    // Set a proper base URL for the document
    Object.defineProperty(window, "location", {
      value: {
        origin: "http://localhost:3000",
        pathname: "/",
        search: "",
        href: "http://localhost:3000/",
      },
      writable: true,
    });

    // Load the HTML content
    document.documentElement.innerHTML = htmlContent;

    // Load and execute the bundled submit.js (for tests, we use the pre-bundled version without ES module imports)
    // The bundle IIFE captures global window, so we need global.window set up before eval
    const submitJsContent = fs.readFileSync(path.join(process.cwd(), "web/public/submit.bundle.js"), "utf-8");
    eval(submitJsContent);

    // Load and execute loading-spinner.js
    const loadingSpinnerJsContent = fs.readFileSync(path.join(process.cwd(), "web/public/widgets/loading-spinner.js"), "utf-8");
    eval(loadingSpinnerJsContent);

    // Set up global references so inline scripts can find functions
    // These use getters so that when tests replace window.X, the global.X reflects the change
    Object.defineProperty(global, "showStatus", {
      get: () => window.showStatus,
      configurable: true,
    });
    Object.defineProperty(global, "hideStatus", {
      get: () => window.hideStatus,
      configurable: true,
    });
    Object.defineProperty(global, "showLoading", {
      get: () => window.showLoading,
      configurable: true,
    });
    Object.defineProperty(global, "hideLoading", {
      get: () => window.hideLoading,
      configurable: true,
    });
    Object.defineProperty(global, "generateRandomState", {
      get: () => window.generateRandomState,
      configurable: true,
    });
    Object.defineProperty(global, "submitVat", {
      get: () => window.submitVat,
      configurable: true,
    });
    Object.defineProperty(global, "getGovClientHeaders", {
      get: () => window.getGovClientHeaders,
      configurable: true,
    });
    Object.defineProperty(global, "authorizedFetch", {
      get: () => window.authorizedFetch,
      configurable: true,
    });
    Object.defineProperty(global, "fetchWithIdToken", {
      get: () => window.fetchWithIdToken,
      configurable: true,
    });
    Object.defineProperty(global, "fetchWithId", {
      get: () => window.fetchWithId,
      configurable: true,
    });
    Object.defineProperty(global, "checkAuthStatus", {
      get: () => window.checkAuthStatus,
      configurable: true,
    });
    Object.defineProperty(global, "ensureSession", {
      get: () => window.ensureSession,
      configurable: true,
    });

    // Execute the inline script content to define page-specific functions
    const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>/);
    if (scriptMatch) {
      const scriptContent = scriptMatch[1];
      eval(scriptContent);
    }
  });

  afterEach(async () => {
    if (window?.happyDOM?.close) {
      await window.happyDOM.close();
    } else if (typeof window?.close === "function") {
      // Fallback for older Happy DOM versions
      window.close();
    }
  });

  describe("Utility Functions", () => {
    // test("showStatus should display status message with correct class", () => {
    //   const statusMessagesContainer = document.getElementById("statusMessagesContainer");
    //   // Test info status
    //   window.showStatus("Test message", "info");
    //   const statusMessages = statusMessagesContainer.querySelectorAll(".status-message");
    //   expect(statusMessages.length).toBeGreaterThan(0);
    //   const firstMsg = statusMessages[0];
    //   const messageContent = firstMsg.querySelector(".status-message-content");
    //   const closeButton = firstMsg.querySelector(".status-close-button");
    //   expect(messageContent.textContent).toBe("Test message");
    //   expect(closeButton.textContent).toBe("×");
    //   expect(firstMsg.className).toBe("status-message status-info");
    // });

    // test("showStatus should display error status", () => {
    //   const statusMessagesContainer = document.getElementById("statusMessagesContainer");
    //   window.showStatus("Error message", "error");
    //   const statusMessages = statusMessagesContainer.querySelectorAll(".status-message");
    //   expect(statusMessages.length).toBeGreaterThan(0);
    //   const firstMsg = statusMessages[0];
    //   const messageContent = firstMsg.querySelector(".status-message-content");
    //   const closeButton = firstMsg.querySelector(".status-close-button");
    //   expect(messageContent.textContent).toBe("Error message");
    //   expect(closeButton.textContent).toBe("×");
    //   expect(firstMsg.className).toBe("status-message status-error");
    // });

    // test("hideStatus should hide status message", () => {
    //  const statusMessage = document.getElementById("statusMessage");

    //  window.hideStatus();
    //  expect(statusMessage.style.display).toBe("none");
    // });

    // test("showLoading should show spinner and disable button", () => {
    //   const loadingSpinner = document.getElementById("loadingSpinner");
    //   const submitBtn = document.getElementById("submitBtn");
    //
    //   window.showLoading();
    //   expect(loadingSpinner.style.display).toBe("block");
    //   expect(submitBtn.disabled).toBe(true);
    // });

    // test("hideLoading should hide spinner and enable button", () => {
    //   const loadingSpinner = document.getElementById("loadingSpinner");
    //   const submitBtn = document.getElementById("submitBtn");
    //
    //   window.hideLoading();
    //   expect(loadingSpinner.style.display).toBe("none");
    //   expect(submitBtn.disabled).toBe(false);
    // });

    test("generateRandomState should return a string", () => {
      const state = window.generateRandomState();
      expect(typeof state).toBe("string");
      expect(state.length).toBeGreaterThan(0);
    });

    // test("close button should remove status message when clicked", () => {
    //   const statusMessagesContainer = document.getElementById("statusMessagesContainer");
    //   window.showStatus("Test message", "info");
    //
    //   const statusMessages = statusMessagesContainer.querySelectorAll(".status-message");
    //   expect(statusMessages.length).toBe(1);
    //
    //   const closeButton = statusMessages[0].querySelector(".status-close-button");
    //   expect(closeButton).toBeTruthy();
    //
    //   // Click the close button
    //   closeButton.click();
    //
    //   // Message should be removed
    //   const remainingMessages = statusMessagesContainer.querySelectorAll(".status-message");
    //   expect(remainingMessages.length).toBe(0);
    // });

    // test("close button should work for multiple messages", () => {
    //   const statusMessagesContainer = document.getElementById("statusMessagesContainer");
    //   window.showStatus("Message 1", "info");
    //   window.showStatus("Message 2", "error");
    //   window.showStatus("Message 3", "success");
    //
    //   let statusMessages = statusMessagesContainer.querySelectorAll(".status-message");
    //   expect(statusMessages.length).toBe(3);
    //
    //   // Click close button on second message
    //   const secondMessageCloseButton = statusMessages[1].querySelector(".status-close-button");
    //   secondMessageCloseButton.click();
    //
    //   // Should have 2 messages remaining
    //   statusMessages = statusMessagesContainer.querySelectorAll(".status-message");
    //   expect(statusMessages.length).toBe(2);
    //
    //   // Verify the correct message was removed (second one)
    //   const messageContents = Array.from(statusMessages).map((msg) => msg.querySelector(".status-message-content").textContent);
    //   expect(messageContents).toEqual(["Message 1", "Message 3"]);
    // });

    test("removeStatusMessage should safely handle non-existent messages", () => {
      const statusMessagesContainer = document.getElementById("statusMessagesContainer");
      const fakeDiv = document.createElement("div");

      // Should not throw error when trying to remove non-existent message
      expect(() => window.removeStatusMessage(fakeDiv)).not.toThrow();
      expect(() => window.removeStatusMessage(null)).not.toThrow();
      expect(() => window.removeStatusMessage(undefined)).not.toThrow();
    });
  });

  describe("API Functions", () => {
    test("submitVat should make correct API call with period dates and 9-box data", async () => {
      const govHeaders = buildGovClientTestHeaders();

      const mockResponse = {
        formBundleNumber: "123456789012",
        chargeRefNumber: "XM002610011594",
        processingDate: "2023-01-01T12:00:00.000Z",
      };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // 9-box VAT data with period dates
      const vatData = {
        periodStart: "2017-04-01",
        periodEnd: "2017-06-30",
        vatDueSales: 1000.0,
        vatDueAcquisitions: 0,
        totalVatDue: 1000.0,
        vatReclaimedCurrPeriod: 0,
        netVatDue: 1000.0,
        totalValueSalesExVAT: 5000,
        totalValuePurchasesExVAT: 0,
        totalValueGoodsSuppliedExVAT: 0,
        totalAcquisitionsExVAT: 0,
        finalised: true,
      };

      const result = await window.submitVat("111222333", vatData, "test-token", govHeaders);

      // Verify the fetch was called
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/v1/hmrc/vat/return");
      expect(init.method).toBe("POST");

      // Parse and verify the body contains period dates and all 9-box fields
      const body = JSON.parse(init.body);
      expect(body.vatNumber).toBe("111222333");
      expect(body.periodStart).toBe("2017-04-01");
      expect(body.periodEnd).toBe("2017-06-30");
      expect(body.vatDueSales).toBe(1000.0);
      expect(body.vatDueAcquisitions).toBe(0);
      expect(body.totalVatDue).toBe(1000.0);
      expect(body.vatReclaimedCurrPeriod).toBe(0);
      expect(body.netVatDue).toBe(1000.0);
      expect(body.totalValueSalesExVAT).toBe(5000);
      expect(body.totalValuePurchasesExVAT).toBe(0);
      expect(body.totalValueGoodsSuppliedExVAT).toBe(0);
      expect(body.totalAcquisitionsExVAT).toBe(0);
      expect(body.finalised).toBe(true);
      expect(body.accessToken).toBe("test-token");

      // Verify headers - authorizedFetch converts to Headers object
      const headers = init.headers;
      expect(headers).toBeInstanceOf(Headers);
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(headers.get("Gov-Client-Browser-JS-User-Agent")).toBe(govHeaders["Gov-Client-Browser-JS-User-Agent"]);
      expect(headers.get("Gov-Client-Device-ID")).toBe(govHeaders["Gov-Client-Device-ID"]);
      expect(headers.get("Gov-Client-Public-IP")).toBe(govHeaders["Gov-Client-Public-IP"]);
      // X-Client-Request-Id is injected by fetchWithId
      expect(headers.get("X-Client-Request-Id")).toBeTruthy();

      expect(result).toEqual(mockResponse);
    });

    /*
    test("logReceipt should make correct API call", async () => {
      const mockResponse = { status: "receipt logged" };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await window.logReceipt("2023-01-01T12:00:00.000Z", "123456789012", "XM002610011594");

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/hmrc/receipt",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            // correlation headers injected by interceptor
            "traceparent": expect.any(String),
            "x-request-id": expect.any(String),
          }),
          body: JSON.stringify({
            processingDate: "2023-01-01T12:00:00.000Z",
            formBundleNumber: "123456789012",
            chargeRefNumber: "XM002610011594",
          }),
        }),
      );
      expect(result).toEqual(mockResponse);
    });
    */
  });

  describe("Form Validation", () => {
    // Helper function to fill 9-box form with default values
    function fill9BoxForm(overrides = {}) {
      const defaults = {
        vatDueSales: "1000.00",
        vatDueAcquisitions: "0.00",
        vatReclaimedCurrPeriod: "0.00",
        totalValueSalesExVAT: "5000",
        totalValuePurchasesExVAT: "0",
        totalValueGoodsSuppliedExVAT: "0",
        totalAcquisitionsExVAT: "0",
      };
      const values = { ...defaults, ...overrides };

      document.getElementById("vatDueSales").value = values.vatDueSales;
      document.getElementById("vatDueAcquisitions").value = values.vatDueAcquisitions;
      document.getElementById("vatReclaimedCurrPeriod").value = values.vatReclaimedCurrPeriod;
      document.getElementById("totalValueSalesExVAT").value = values.totalValueSalesExVAT;
      document.getElementById("totalValuePurchasesExVAT").value = values.totalValuePurchasesExVAT;
      document.getElementById("totalValueGoodsSuppliedExVAT").value = values.totalValueGoodsSuppliedExVAT;
      document.getElementById("totalAcquisitionsExVAT").value = values.totalAcquisitionsExVAT;
      // Trigger auto-calculation
      if (window.calculateTotalVatDue) {
        window.calculateTotalVatDue();
      }
    }

    test("form validation should reject empty VAT number", async () => {
      const vatNumberInput = document.getElementById("vatNumber");
      const periodStartInput = document.getElementById("periodStart");
      const periodEndInput = document.getElementById("periodEnd");
      const declarationCheckbox = document.getElementById("declaration");

      vatNumberInput.value = "";
      // Set period dates
      periodStartInput.value = "2017-04-01";
      periodEndInput.value = "2017-06-30";
      fill9BoxForm();
      declarationCheckbox.checked = true;

      window.showStatus = vi.fn();
      window.showLoading = vi.fn();

      const event = new window.Event("submit");
      event.preventDefault = vi.fn();

      await window.handleFormSubmission(event);

      expect(window.showStatus).toHaveBeenCalledWith("Please enter your VAT registration number.", "error");
    });

    test("form validation should reject invalid VAT number format", async () => {
      const vatNumberInput = document.getElementById("vatNumber");
      const periodStartInput = document.getElementById("periodStart");
      const periodEndInput = document.getElementById("periodEnd");
      const declarationCheckbox = document.getElementById("declaration");

      vatNumberInput.value = "12345678"; // Only 8 digits
      // Set period dates
      periodStartInput.value = "2017-04-01";
      periodEndInput.value = "2017-06-30";
      fill9BoxForm();
      declarationCheckbox.checked = true;

      window.showStatus = vi.fn();

      const event = new window.Event("submit");
      event.preventDefault = vi.fn();

      await window.handleFormSubmission(event);

      expect(window.showStatus).toHaveBeenCalledWith("VAT number must be exactly 9 digits.", "error");
    });

    test("form validation should reject unchecked declaration", async () => {
      const vatNumberInput = document.getElementById("vatNumber");
      const periodStartInput = document.getElementById("periodStart");
      const periodEndInput = document.getElementById("periodEnd");
      const declarationCheckbox = document.getElementById("declaration");

      vatNumberInput.value = "111222333";
      // Set period dates
      periodStartInput.value = "2017-04-01";
      periodEndInput.value = "2017-06-30";
      fill9BoxForm();
      declarationCheckbox.checked = false; // Declaration not checked

      window.showStatus = vi.fn();

      const event = new window.Event("submit");
      event.preventDefault = vi.fn();

      await window.handleFormSubmission(event);

      expect(window.showStatus).toHaveBeenCalledWith("You must confirm the declaration before submitting.", "error");
    });

    test("form validation should reject missing period dates", async () => {
      const vatNumberInput = document.getElementById("vatNumber");
      const periodStartInput = document.getElementById("periodStart");
      const periodEndInput = document.getElementById("periodEnd");
      const declarationCheckbox = document.getElementById("declaration");

      vatNumberInput.value = "111222333";
      // Leave period dates empty
      periodStartInput.value = "";
      periodEndInput.value = "";
      fill9BoxForm();
      declarationCheckbox.checked = true;

      window.showStatus = vi.fn();

      const event = new window.Event("submit");
      event.preventDefault = vi.fn();

      await window.handleFormSubmission(event);

      expect(window.showStatus).toHaveBeenCalledWith("Please enter your VAT period start and end dates.", "error");
    });
  });

  describe("Receipt Display", () => {
    test("displayReceipt should show receipt and hide form", () => {
      const response = {
        processingDate: "2023-01-01T12:00:00.000Z",
        formBundleNumber: "123456789012",
        chargeRefNumber: "XM002610011594",
      };

      const vatFormContainer = document.getElementById("vatForm");
      const receiptDisplay = document.getElementById("receiptDisplay");

      window.displayReceipt(response);

      expect(vatFormContainer.style.display).toBe("none");
      expect(receiptDisplay.style.display).toBe("block");
      expect(document.getElementById("formBundleNumber").textContent).toBe("123456789012");
      expect(document.getElementById("chargeRefNumber").textContent).toBe("XM002610011594");
    });
  });

  describe("Input Event Handlers", () => {
    test("VAT number input should only allow digits", () => {
      const vatNumberInput = document.getElementById("vatNumber");

      // Simulate input event with non-digit characters
      vatNumberInput.value = "abc123def456";
      const event = new window.Event("input");
      Object.defineProperty(event, "target", { value: vatNumberInput });

      // Trigger the input event handler
      vatNumberInput.dispatchEvent(event);

      // The event handler should remove non-digits
      expect(vatNumberInput.value).toBe("123456");
    });

    // Period key is now selected from a dropdown (not typed), so uppercase conversion test is removed
    // The dropdown value is stored in a hidden input, no user input transformation needed
  });
});
