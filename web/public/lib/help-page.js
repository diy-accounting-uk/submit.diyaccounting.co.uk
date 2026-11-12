// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 * Help Page Controller
 *
 * Initialises FAQ search, handles accordion, manages support form modal
 */

import { FAQSearch, debounce } from "./faq-search.js";
import { submitSupportTicket } from "./support-api.js";
import { fetchActivityListing } from "./services/content-listing.js";
import { renderFaqItem } from "./faq-markdown.js";

/**
 * Help Page class managing the FAQ display and support form
 */
class HelpPage {
  constructor() {
    this.faqSearch = null;
    this.openFaqId = null;
    this.tableStarted = false;

    this.searchInput = document.getElementById("faq-search");
    this.searchHint = document.getElementById("search-hint");
    this.faqList = document.getElementById("faq-list");
    this.supportModal = document.getElementById("support-modal");
    this.supportForm = document.getElementById("support-form");

    this.init();
  }

  async init() {
    // Load FAQ data directly from TOML
    try {
      const response = await fetch("/faqs.toml");
      if (!response.ok) {
        throw new Error(`Failed to load FAQs: ${response.status}`);
      }
      const tomlText = await response.text();
      const isListed = await fetchActivityListing();
      const faqs = window.TOML.parse(tomlText).faq.filter((faq) => isListed(faq.activity));
      this.faqSearch = new FAQSearch(faqs);

      // Initial render; a #<faq-id> link shows that entry first and opens it
      const initial = this.faqSearch.search("");
      const linkedId = decodeURIComponent(window.location.hash.slice(1));
      const linked = faqs.find((faq) => faq.id === linkedId);
      this.render(linked ? [linked, ...initial.filter((faq) => faq.id !== linkedId)] : initial);
      if (linked) {
        const item = this.faqList.querySelector(`[data-id="${linked.id}"]`);
        if (item) {
          this.toggleFaq(item.querySelector(".faq-question"));
          item.scrollIntoView();
        }
      }
    } catch (error) {
      console.error("Error loading FAQs:", error);
      this.faqList.innerHTML = '<div class="no-results"><p>Unable to load FAQs. Please refresh the page.</p></div>';
      return;
    }

    // Search input handler
    const handleSearch = debounce((e) => {
      const query = e.target.value;
      const results = this.faqSearch.search(query);
      this.render(results);
      this.updateHint(query, results.length);
    }, 150);

    this.searchInput.addEventListener("input", handleSearch);

    // Support modal handlers
    const openSupportBtn = document.getElementById("open-support-form");
    if (openSupportBtn) {
      openSupportBtn.addEventListener("click", () => {
        this.openModal();
      });
    }

    const cancelSupportBtn = document.getElementById("cancel-support");
    if (cancelSupportBtn) {
      cancelSupportBtn.addEventListener("click", () => {
        this.closeModal();
      });
    }

    if (this.supportModal) {
      this.supportModal.addEventListener("click", (e) => {
        if (e.target === this.supportModal) this.closeModal();
      });
    }

    // Support form submission
    if (this.supportForm) {
      this.supportForm.addEventListener("submit", (e) => this.handleSupportSubmit(e));
    }

    // Handle keyboard navigation for modal
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.supportModal && !this.supportModal.hidden) {
        this.closeModal();
      }
    });
  }

  /**
   * Update the search hint text
   * @param {string} query - Current search query
   * @param {number} count - Number of results
   */
  updateHint(query, count) {
    if (!query.trim()) {
      this.searchHint.textContent = "Showing top FAQs";
    } else if (count === 0) {
      this.searchHint.textContent = "No matching FAQs - try different keywords";
    } else {
      this.searchHint.textContent = `${count} result${count === 1 ? "" : "s"}`;
    }
  }

  /**
   * Render FAQ list
   * @param {Array} faqs - Array of FAQ objects to display
   */
  render(faqs) {
    if (faqs.length === 0) {
      this.faqList.innerHTML = `
        <div class="no-results">
          <p>No FAQs match your search.</p>
          <p>Try different keywords, or <button class="link-button" id="clear-search">view all FAQs</button></p>
        </div>
      `;
      const clearBtn = document.getElementById("clear-search");
      if (clearBtn) {
        clearBtn.addEventListener("click", () => {
          this.searchInput.value = "";
          this.render(this.faqSearch.search(""));
          this.updateHint("", this.faqSearch.search("").length);
        });
      }
      return;
    }

    // eslint-disable-next-line no-unsanitized/property -- each FAQ's text goes through escapeFaqHtml; the id comes from the site's own faqs.toml
    this.faqList.innerHTML = faqs.map(renderFaqItem).join("");

    // Accordion click handlers
    this.faqList.querySelectorAll(".faq-question").forEach((btn) => {
      btn.addEventListener("click", () => this.toggleFaq(btn));
    });
  }

  /**
   * Toggle FAQ accordion item
   * @param {HTMLElement} button - The clicked question button
   */
  toggleFaq(button) {
    const item = button.closest(".faq-item");
    const id = item.dataset.id;
    const answer = item.querySelector(".faq-answer");
    const isOpen = button.getAttribute("aria-expanded") === "true";

    // Close previously open item
    if (this.openFaqId && this.openFaqId !== id) {
      const prev = this.faqList.querySelector(`[data-id="${this.openFaqId}"]`);
      if (prev) {
        prev.querySelector(".faq-question").setAttribute("aria-expanded", "false");
        prev.querySelector(".faq-answer").hidden = true;
      }
    }

    // Toggle current
    button.setAttribute("aria-expanded", !isOpen);
    answer.hidden = isOpen;
    this.openFaqId = isOpen ? null : id;
  }

  /**
   * Open support modal
   */
  openModal() {
    if (this.supportModal) {
      this.supportModal.hidden = false;
      document.body.style.overflow = "hidden";
      const firstInput = this.supportForm.querySelector("input");
      if (firstInput) firstInput.focus();
    }
  }

  /**
   * Close support modal
   */
  closeModal() {
    if (this.supportModal) {
      this.supportModal.hidden = true;
      document.body.style.overflow = "";
      if (this.supportForm) this.supportForm.reset();
    }
  }

  /**
   * Handle support form submission
   * @param {Event} e - Form submit event
   */
  async handleSupportSubmit(e) {
    e.preventDefault();

    const subject = document.getElementById("support-subject").value;
    const description = document.getElementById("support-description").value;
    const category = document.getElementById("support-category").value;

    const submitBtn = this.supportForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    try {
      await submitSupportTicket({ subject, description, category });
      this.closeModal();
      // Use existing status messages widget
      if (window.StatusMessages) {
        window.StatusMessages.showSuccess("Support request submitted successfully");
      }
    } catch (err) {
      console.error("Support submission error:", err);
      // Use existing status messages widget
      if (window.StatusMessages) {
        window.StatusMessages.showError("Failed to submit request. Please email support@diyaccounting.co.uk instead.");
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit";
    }
  }
}

// Initialise on page load
if (document.getElementById("faq-list")) {
  const helpPageInstance = new HelpPage();
  // Expose instance for debugging if needed
  window.helpPageInstance = helpPageInstance;
}
