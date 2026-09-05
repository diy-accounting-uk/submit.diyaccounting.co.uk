// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// web/public/widgets/simulator-journeys.js
// Guided journey automation for simulator iframe - like Playwright running in the browser
// Supports both same-origin (direct DOM) and cross-origin (postMessage bridge) modes.

/**
 * SimulatorJourney class - automates click-through demos inside the simulator iframe
 */
export class SimulatorJourney {
  constructor(iframe, statusEl) {
    this.iframe = iframe;
    this.statusEl = statusEl;
    this.currentStep = 0;
    this.totalSteps = 0;
    this.paused = false;
    this.aborted = false;
    this.crossOrigin = false;
    this._pendingResponses = new Map();
    this._messageHandler = null;

    // Try to access iframe document (may fail for cross-origin)
    try {
      this.doc = iframe.contentDocument || iframe.contentWindow.document;
    } catch {
      console.warn("Cross-origin iframe detected. Using postMessage bridge.");
      this.doc = null;
      this.crossOrigin = true;
      this._setupMessageListener();
    }
  }

  /**
   * Set up listener for postMessage responses from the iframe bridge
   */
  _setupMessageListener() {
    this._messageHandler = (event) => {
      const msg = event.data;
      if (!msg || msg.type !== "simulator-response") return;
      const resolve = this._pendingResponses.get(msg.id);
      if (resolve) {
        this._pendingResponses.delete(msg.id);
        resolve(msg);
      }
    };
    window.addEventListener("message", this._messageHandler);
  }

  /**
   * Send a command to the iframe bridge via postMessage and wait for response
   */
  _sendCommand(command) {
    return new Promise((resolve) => {
      // eslint-disable-next-line sonarjs/pseudo-random
      const id = Math.random().toString(36).substring(2);
      this._pendingResponses.set(id, resolve);
      this.iframe.contentWindow.postMessage({ type: "simulator-command", id, ...command }, "*");
      // Timeout after 10s (fill with typewriter can take a while)
      setTimeout(() => {
        if (this._pendingResponses.has(id)) {
          this._pendingResponses.delete(id);
          resolve({ success: false, error: "timeout" });
        }
      }, 10000);
    });
  }

  /**
   * Clean up message listener
   */
  destroy() {
    if (this._messageHandler) {
      window.removeEventListener("message", this._messageHandler);
      this._messageHandler = null;
    }
    this._pendingResponses.clear();
  }

  /**
   * Get the iframe document, handling cross-origin restrictions
   */
  getDocument() {
    if (this.crossOrigin) return null;
    try {
      return this.iframe.contentDocument || this.iframe.contentWindow.document;
    } catch {
      return null;
    }
  }

  /**
   * Find an element by CSS selector matching text content
   */
  findByText(selector, text) {
    const doc = this.getDocument();
    if (!doc) return null;
    for (const el of doc.querySelectorAll(selector)) {
      if (el.textContent.trim().includes(text)) return el;
    }
    return null;
  }

  /**
   * Check if an element matching text exists (works cross-origin)
   */
  async findByTextExists(selector, text) {
    if (this.crossOrigin) {
      const result = await this._sendCommand({ command: "findByText", selector, text });
      return result.found || false;
    }
    return this.findByText(selector, text) !== null;
  }

  /**
   * Highlight an element in the iframe
   */
  async highlight(selector) {
    if (this.crossOrigin) {
      await this._sendCommand({ command: "highlight", selector });
      return null; // No direct element reference in cross-origin mode
    }

    const doc = this.getDocument();
    if (!doc) return null;

    const el = doc.querySelector(selector);
    if (!el) {
      console.warn(`Element not found: ${selector}`);
      return null;
    }

    el.classList.add("simulator-highlight");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    return el;
  }

  /**
   * Remove highlight from an element
   */
  unhighlight(selector) {
    if (this.crossOrigin) {
      this._sendCommand({ command: "unhighlight", selector });
      return;
    }

    const doc = this.getDocument();
    if (!doc) return;

    const el = doc.querySelector(selector);
    if (el) {
      el.classList.remove("simulator-highlight");
    }
  }

  /**
   * Click an element with visual feedback
   */
  async click(selector, description) {
    this.updateStatus(description);

    if (this.crossOrigin) {
      await this._sendCommand({ command: "highlight", selector });
      await this.wait(800);
      await this._sendCommand({ command: "click", selector });
    } else {
      const el = await this.highlight(selector);
      await this.wait(800);

      if (el) {
        el.click();
        el.classList.remove("simulator-highlight");
      }
    }

    await this.waitForLoad();
  }

  /**
   * Click an element matched by text content with visual feedback
   */
  async clickByText(selector, text, description) {
    this.updateStatus(description);

    if (this.crossOrigin) {
      await this._sendCommand({ command: "highlightByText", selector, text });
      await this.wait(800);
      await this._sendCommand({ command: "clickByText", selector, text });
    } else {
      const el = this.findByText(selector, text);

      if (el) {
        el.classList.add("simulator-highlight");
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        await this.wait(800);
        el.click();
        el.classList.remove("simulator-highlight");
      } else {
        console.warn(`Element not found by text: ${selector} containing "${text}"`);
        await this.wait(800);
      }
    }

    await this.waitForLoad();
  }

  /**
   * Fill a form field with typewriter effect (or direct set for date/number inputs)
   */
  async fill(selector, value, description) {
    this.updateStatus(description);

    if (this.crossOrigin) {
      await this._sendCommand({ command: "highlight", selector });
      await this.wait(500);
      await this._sendCommand({ command: "fill", selector, value });
      return;
    }

    const el = await this.highlight(selector);
    await this.wait(500);

    if (el) {
      el.focus();

      // Date and number inputs don't support character-by-character entry;
      // set value directly and dispatch change event
      if (el.type === "date" || el.type === "number" || el.type === "datetime-local") {
        el.value = String(value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        el.value = "";
        // Typewriter effect for text inputs
        for (const char of String(value)) {
          if (this.aborted) throw new Error("Journey aborted");
          while (this.paused) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }

          el.value += char;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms per character
        }
      }

      el.classList.remove("simulator-highlight");
    }
  }

  /**
   * Select an option from a dropdown
   */
  async select(selector, value, description) {
    this.updateStatus(description);

    if (this.crossOrigin) {
      await this._sendCommand({ command: "highlight", selector });
      await this.wait(500);
      await this._sendCommand({ command: "select", selector, value });
      await this.wait(300);
      return;
    }

    const el = await this.highlight(selector);
    await this.wait(500);

    if (el) {
      el.value = value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.classList.remove("simulator-highlight");
    }

    await this.wait(300);
  }

  /**
   * Query an element's state (works cross-origin)
   */
  async query(selector) {
    if (this.crossOrigin) {
      return await this._sendCommand({ command: "query", selector });
    }
    const doc = this.getDocument();
    const el = doc ? doc.querySelector(selector) : null;
    return {
      found: !!el,
      disabled: el ? !!el.disabled : false,
      checked: el ? !!el.checked : false,
      value: el ? el.value : undefined,
      textContent: el ? (el.textContent || "").trim().substring(0, 200) : undefined,
    };
  }

  /**
   * Set a checkbox to checked (works cross-origin)
   */
  async check(selector) {
    if (this.crossOrigin) {
      await this._sendCommand({ command: "check", selector });
      return;
    }
    const doc = this.getDocument();
    if (doc) {
      const el = doc.querySelector(selector);
      if (el) el.checked = true;
    }
  }

  /**
   * Wait with pause/abort support
   */
  async wait(ms) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (this.aborted) throw new Error("Journey aborted");
      while (this.paused && !this.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /**
   * Wait for page/navigation to complete
   */
  async waitForLoad() {
    await this.wait(1500);
  }

  /**
   * Update the status display
   */
  updateStatus(message) {
    this.currentStep++;
    if (this.statusEl) {
      this.statusEl.textContent = `Step ${this.currentStep} of ${this.totalSteps}: ${message}`;
    }
  }

  /**
   * Set the total number of steps for progress display
   */
  setTotalSteps(count) {
    this.totalSteps = count;
  }

  /**
   * Scroll to the bottom of the iframe document to show results
   */
  scrollToResults() {
    if (this.crossOrigin) {
      this._sendCommand({ command: "scrollToBottom" });
      return;
    }

    const doc = this.getDocument();
    if (!doc) return;
    const body = doc.body || doc.documentElement;
    if (body) {
      body.scrollTop = body.scrollHeight;
      doc.documentElement.scrollTop = doc.documentElement.scrollHeight;
    }
  }

  /**
   * Complete the journey
   */
  complete(message) {
    if (this.statusEl) {
      this.statusEl.textContent = message || "Journey complete!";
    }
  }
}

/**
 * Ensure the test bundle is available before proceeding with a journey.
 * Navigates to the bundles page, requests the test bundle if not already added,
 * then navigates back to the activities page.
 */
async function ensureTestBundle(journey) {
  // Navigate to bundles page via nav link
  await journey.clickByText("a", "Bundles", "Navigating to Bundles page...");

  // Wait for bundles page to load (fetches catalog and user bundles from API)
  await journey.wait(3000);

  // Check if test bundle button exists and whether it's already added
  const result = await journey.query('button[data-bundle-id="test"]');
  if (result.found && !result.disabled) {
    // Test bundle not yet added - click to request it
    await journey.click('button[data-bundle-id="test"]', "Requesting Test bundle...");
    // Wait for the bundle request to complete
    await journey.wait(2000);
  } else {
    // Bundle already added or button not found - log and continue
    journey.updateStatus("Test bundle already added");
    await journey.wait(500);
  }

  // Navigate back to activities page
  await journey.clickByText("a", "Activities", "Returning to Activities page...");

  // Wait for activities page to render dynamic buttons
  await journey.wait(2000);
}

/**
 * Journey: Submit VAT Return
 * Demonstrates the full VAT return submission flow
 */
export async function journeySubmitVat(journey) {
  journey.setTotalSteps(15);

  // Ensure test bundle is available for synthetic API access
  await ensureTestBundle(journey);

  // Navigate to Submit VAT Return page (activity buttons are dynamically rendered)
  await journey.clickByText("button", "Submit VAT", "Selecting Submit VAT Return activity (synthetic)...");

  // Wait for page to load
  await journey.wait(2000);

  // Fill VRN (submitVat uses #vatNumber, not #vrn)
  await journey.fill("#vatNumber", "123456789", "Entering VAT Registration Number...");

  // Fill period dates (must match an OPEN obligation from the simulator)
  await journey.fill("#periodStart", "2017-04-01", "Entering period start date...");
  await journey.fill("#periodEnd", "2017-06-30", "Entering period end date...");

  // Fill Box 1 - VAT due on sales
  await journey.fill("#vatDueSales", "1250.00", "Entering VAT due on sales (Box 1)...");

  // Fill Box 2 - VAT due on acquisitions
  await journey.fill("#vatDueAcquisitions", "0.00", "Entering VAT due on acquisitions (Box 2)...");

  // Fill Box 4 - VAT reclaimed
  await journey.fill("#vatReclaimedCurrPeriod", "350.00", "Entering VAT reclaimed (Box 4)...");

  // Fill Box 6 - Total sales ex VAT
  await journey.fill("#totalValueSalesExVAT", "6250", "Entering total sales excluding VAT (Box 6)...");

  // Fill Box 7 - Total purchases ex VAT
  await journey.fill("#totalValuePurchasesExVAT", "1750", "Entering total purchases excluding VAT (Box 7)...");

  // Fill Box 8 - Goods supplied to EU
  await journey.fill("#totalValueGoodsSuppliedExVAT", "0", "Entering goods supplied to EU (Box 8)...");

  // Fill Box 9 - Acquisitions from EU
  await journey.fill("#totalAcquisitionsExVAT", "0", "Entering acquisitions from EU (Box 9)...");

  // Check declaration
  await journey.check("#declaration");

  // Submit the return
  await journey.click("#submitBtn", "Submitting VAT return to HMRC...");

  // Wait for submission response
  await journey.wait(3000);

  // Scroll to show the receipt
  journey.scrollToResults();

  journey.complete("VAT return submitted successfully! Receipt is displayed above.");
}

/**
 * Journey: View VAT Obligations
 * Demonstrates viewing VAT obligations from HMRC
 */
export async function journeyViewObligations(journey) {
  journey.setTotalSteps(6);

  // Ensure test bundle is available for synthetic API access
  await ensureTestBundle(journey);

  // Navigate to Obligations page (activity buttons are dynamically rendered)
  await journey.clickByText("button", "Obligations", "Selecting View Obligations activity (synthetic)...");

  // Wait for page to load
  await journey.wait(2000);

  // Fill VRN
  await journey.fill("#vrn", "123456789", "Entering VAT Registration Number...");

  // Click retrieve button
  await journey.click("#retrieveBtn", "Fetching obligations from HMRC...");

  // Wait for results
  await journey.wait(2500);

  // Scroll down to show the results
  journey.scrollToResults();

  journey.complete("Obligations fetched! You can see which periods need VAT returns and their due dates.");
}

/**
 * Journey: View Submitted VAT Return
 * Demonstrates retrieving a previously submitted VAT return
 */
export async function journeyViewReturn(journey) {
  journey.setTotalSteps(8);

  // Ensure test bundle is available for synthetic API access
  await ensureTestBundle(journey);

  // Navigate to View Return page (activity buttons are dynamically rendered)
  await journey.clickByText("button", "View VAT Return", "Selecting View VAT Return activity (synthetic)...");

  // Wait for page to load
  await journey.wait(2000);

  // Fill VRN
  await journey.fill("#vrn", "123456789", "Entering VAT Registration Number...");

  // Fill period dates (viewVatReturn now uses date inputs, not periodKey dropdown)
  await journey.fill("#periodStart", "2017-01-01", "Entering period start date...");
  await journey.fill("#periodEnd", "2017-03-31", "Entering period end date...");

  // Click retrieve button
  await journey.click("#retrieveBtn", "Fetching VAT return from HMRC...");

  // Wait for results
  await journey.wait(2500);

  // Scroll to show the return details
  journey.scrollToResults();

  journey.complete("VAT return details retrieved! All 9 boxes are displayed as recorded by HMRC.");
}

// Export for use in simulator.html
export default {
  SimulatorJourney,
  journeySubmitVat,
  journeyViewObligations,
  journeyViewReturn,
};
