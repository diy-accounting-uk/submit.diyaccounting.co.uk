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
import { fetchCatalogText, fetchCurrentEnvironmentName } from "./services/catalog-service.js";
import { renderFaqItem, renderFaqGroups } from "./faq-markdown.js";
import { bundlePriceList, fillBundlePrices } from "./bundle-listing.js";

// page-chrome.js gives the text in the reader's language; without it (in a unit test) the English stands.
const siteText = (id, english, values) =>
  window.siteText
    ? window.siteText(id, english, values)
    : english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));

// The Welsh copy of the page holds its questions and answers in Welsh in its own markup, and
// faqs.toml holds the English. Each entry keeps the id, category, keywords and priority of its
// English entry and takes the question, the category label and the answer the page shows.
function faqsWrittenOnPage(faqList, englishFaqs) {
  const englishById = new Map(englishFaqs.map((faq) => [faq.id, faq]));
  return [...faqList.querySelectorAll(".faq-item")]
    .filter((item) => englishById.has(item.dataset.id))
    .map((item) => ({
      ...englishById.get(item.dataset.id),
      question: item.querySelector(".faq-question-text").textContent.trim(),
      categoryLabel: item.querySelector(".faq-category-badge").textContent.trim(),
      answerHtml: item.querySelector(".faq-answer").innerHTML,
    }));
}

/**
 * The address of the signed-in visitor, or an empty string when nobody is signed in.
 * @returns {string}
 */
function signedInEmail() {
  try {
    return JSON.parse(localStorage.getItem("userInfo") || "{}").email || "";
  } catch {
    return "";
  }
}

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
      const priceList = bundlePriceList(window.TOML.parse(await fetchCatalogText()), await fetchCurrentEnvironmentName());
      const englishFaqs = window.TOML.parse(tomlText)
        .faq.filter((faq) => isListed(faq.activity))
        .map((faq) => fillBundlePrices(faq, priceList));
      const faqs = document.documentElement.lang === "cy" ? faqsWrittenOnPage(this.faqList, englishFaqs) : englishFaqs;
      this.faqSearch = new FAQSearch(faqs);

      // Initial render lists every question by category; a #<faq-id> link opens that entry
      const linkedId = decodeURIComponent(window.location.hash.slice(1));
      const linked = faqs.find((faq) => faq.id === linkedId);
      this.render(this.faqSearch.search(""), "");
      if (linked) {
        const item = this.faqList.querySelector(`[data-id="${linked.id}"]`);
        if (item) {
          this.toggleFaq(item.querySelector(".faq-question"));
          item.scrollIntoView();
        }
      }
    } catch (error) {
      console.error("Error loading FAQs:", error);
      const failure = document.createElement("p");
      failure.textContent = siteText("help.load-failed", "Unable to load FAQs. Please refresh the page.");
      const block = document.createElement("div");
      block.className = "no-results";
      block.append(failure);
      this.faqList.replaceChildren(block);
      return;
    }

    // Search input handler
    const handleSearch = debounce((e) => {
      const query = e.target.value;
      const results = this.faqSearch.search(query);
      this.render(results, query);
      this.updateHint(query, results.length);
    }, 150);

    this.searchInput.addEventListener("input", handleSearch);
    this.searchInput.dataset.searchReady = "true";

    this.showWelshMessagesLine();

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
   * A reader in Welsh sees, beside the ways to reach support, the language of our replies.
   */
  showWelshMessagesLine() {
    const options = document.querySelector(".support-section .support-options");
    if (!options || window.siteLanguage?.chrome() !== "cy") return;
    const [before, after] = siteText(
      "chrome.welsh-messages",
      "You can write to us in Welsh at {email}. We reply in English for now.",
    ).split("{email}");
    const link = document.createElement("a");
    link.href = "mailto:support@diyaccounting.co.uk";
    link.textContent = "support@diyaccounting.co.uk";
    const line = document.createElement("p");
    line.id = "welsh-messages-line";
    line.append(before, link, after ?? "");
    options.after(line);
  }

  /**
   * Update the search hint text
   * @param {string} query - Current search query
   * @param {number} count - Number of results
   */
  updateHint(query, count) {
    if (!query.trim()) {
      this.searchHint.textContent = siteText("help.hint-every-question", "Showing every question");
    } else if (count === 0) {
      this.searchHint.textContent = siteText("help.hint-no-match", "No questions match your search");
    } else if (count === 1) {
      this.searchHint.textContent = siteText("help.hint-one-result", "1 result");
    } else {
      this.searchHint.textContent = siteText("help.hint-results", "{count} results", { count });
    }
  }

  /**
   * Render FAQ list
   * @param {Array} faqs - Array of FAQ objects to display
   * @param {string} query - The search text; with none, the questions are grouped by category
   */
  render(faqs, query) {
    if (faqs.length === 0) {
      const paragraph = (...children) => {
        const element = document.createElement("p");
        element.append(...children);
        return element;
      };
      const button = (id, className, text) => {
        const element = document.createElement("button");
        element.type = "button";
        element.id = id;
        element.className = className;
        element.textContent = text;
        return element;
      };
      const block = document.createElement("div");
      block.className = "no-results";
      block.append(
        paragraph(siteText("help.no-match", "No questions match your search.")),
        paragraph(
          `${siteText("help.try-other-keywords", "Try different keywords, or")} `,
          button("clear-search", "link-button", siteText("help.list-every-question", "list every question")),
          ".",
        ),
        paragraph(button("no-results-support", "support-button primary", siteText("help.support-request", "Submit a support request"))),
      );
      this.faqList.replaceChildren(block);
      document.getElementById("clear-search").addEventListener("click", () => {
        this.searchInput.value = "";
        const all = this.faqSearch.search("");
        this.render(all, "");
        this.updateHint("", all.length);
      });
      document.getElementById("no-results-support").addEventListener("click", () => this.openModal());
      return;
    }

    // eslint-disable-next-line no-unsanitized/property -- each FAQ's text goes through escapeFaqHtml; the id comes from the site's own faqs.toml
    this.faqList.innerHTML = query.trim() ? faqs.map((faq) => renderFaqItem(faq)).join("") : renderFaqGroups(faqs);

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
      const emailInput = document.getElementById("support-email");
      if (emailInput && !emailInput.value) emailInput.value = signedInEmail();
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

    const email = document.getElementById("support-email").value.trim();
    const subject = document.getElementById("support-subject").value;
    const description = document.getElementById("support-description").value;
    const category = document.getElementById("support-category").value;

    const submitBtn = this.supportForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = siteText("help.submitting", "Submitting...");

    try {
      const result = await submitSupportTicket({ subject, description, category, email });
      if (!result.success) {
        if (window.StatusMessages) {
          window.StatusMessages.showError(
            siteText("help.also-email", "{error} You can also email support@diyaccounting.co.uk.", { error: result.error }),
          );
        }
        return;
      }
      this.closeModal();
      if (window.StatusMessages) {
        window.StatusMessages.showSuccess(
          siteText("help.request-received", "We have your request. We reply by email to {email}.", { email }),
        );
      }
    } catch (err) {
      console.error("Support submission error:", err);
      if (window.StatusMessages) {
        window.StatusMessages.showError(
          siteText("help.request-failed", "Failed to submit request. Please email support@diyaccounting.co.uk instead."),
        );
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = siteText("help.submit", "Submit");
    }
  }
}

// Initialise on page load
if (document.getElementById("faq-list")) {
  const helpPageInstance = new HelpPage();
  // Expose instance for debugging if needed
  window.helpPageInstance = helpPageInstance;
}
