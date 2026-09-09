// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 * Help Page Controller
 *
 * Initialises FAQ search, handles accordion, manages support form modal
 */

import { FAQSearch, debounce } from "./faq-search.js";
import { submitSupportTicket } from "./support-api.js";

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
      const faqData = window.TOML.parse(tomlText);
      this.faqSearch = new FAQSearch(faqData.faq);

      // Initial render
      this.render(this.faqSearch.search(""));
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

    this.faqList.innerHTML = faqs
      .map(
        (faq) => `
      <div class="faq-item" data-id="${faq.id}">
        <button class="faq-question" aria-expanded="false">
          <span class="faq-category-badge">${this.formatCategory(faq.category)}</span>
          <span class="faq-question-text">${this.escapeHtml(faq.question)}</span>
          <svg class="faq-chevron" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        <div class="faq-answer" hidden>
          ${this.renderMarkdown(faq.answer)}
        </div>
      </div>
    `,
      )
      .join("");

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
   * Format category label
   * @param {string} cat - Category ID
   * @returns {string} Human-readable category label
   */
  formatCategory(cat) {
    const labels = {
      "connection": "Connection",
      "submission": "Submission",
      "bundles": "Bundles",
      "receipts": "Receipts",
      "vat-basics": "VAT Basics",
      "errors": "Errors",
    };
    return labels[cat] || cat;
  }

  /**
   * Escape HTML special characters
   * @param {string} str - Input string
   * @returns {string} Escaped HTML string
   */
  escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Render simple markdown to HTML
   * @param {string} text - Markdown text
   * @returns {string} HTML string
   */
  renderMarkdown(text) {
    // Process text line by line for better control
    const lines = text.trim().split("\n");
    const result = [];
    let inList = false;
    let inTable = false;
    let tableRows = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for table row
      if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
        if (!inTable) {
          inTable = true;
          tableRows = [];
        }
        // Skip separator row
        if (!/^\|[-\s|]+\|$/.test(line.trim())) {
          tableRows.push(line);
        }
        continue;
      } else if (inTable) {
        // End of table
        result.push(this.renderTable(tableRows));
        inTable = false;
        tableRows = [];
      }

      // Check for numbered list
      if (/^\d+\.\s+/.test(line.trim())) {
        if (!inList) {
          inList = true;
          result.push("<ol>");
        }
        const content = line.trim().replace(/^\d+\.\s+/, "");
        result.push(`<li>${this.renderInline(content)}</li>`);
        continue;
      } else if (inList && line.trim() === "") {
        result.push("</ol>");
        inList = false;
      }

      // Check for unordered list
      if (line.trim().startsWith("- ")) {
        if (!inList) {
          inList = true;
          result.push("<ul>");
        }
        const content = line.trim().substring(2);
        result.push(`<li>${this.renderInline(content)}</li>`);
        continue;
      } else if (inList && !line.trim().startsWith("- ") && line.trim() !== "") {
        result.push("</ul>");
        inList = false;
      }

      // Empty line - paragraph break
      if (line.trim() === "") {
        continue;
      }

      // Regular paragraph
      if (!inList) {
        result.push(`<p>${this.renderInline(line.trim())}</p>`);
      }
    }

    // Close any open lists
    if (inList) {
      result.push("</ol>");
    }
    if (inTable) {
      result.push(this.renderTable(tableRows));
    }

    return result.join("\n");
  }

  /**
   * Render inline markdown (bold, links)
   * @param {string} text - Inline text
   * @returns {string} HTML string
   */
  renderInline(text) {
    // Bold text: **text**
    const result = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    // Markdown links: [text](url)
    // Process character by character to avoid regex backtracking issues
    let output = "";
    let i = 0;
    while (i < result.length) {
      if (result[i] === "[") {
        // Look for closing bracket
        const closeBracket = result.indexOf("]", i + 1);
        if (closeBracket !== -1 && result[closeBracket + 1] === "(") {
          // Look for closing parenthesis
          const closeParen = result.indexOf(")", closeBracket + 2);
          if (closeParen !== -1) {
            const linkText = result.slice(i + 1, closeBracket);
            const url = result.slice(closeBracket + 2, closeParen);
            output += `<a href="${url}" target="_blank" rel="noopener">${linkText}</a>`;
            i = closeParen + 1;
            continue;
          }
        }
      }
      output += result[i];
      i++;
    }
    return output;
  }

  /**
   * Render markdown table
   * @param {Array} rows - Array of table row strings
   * @returns {string} HTML table string
   */
  renderTable(rows) {
    if (rows.length === 0) return "";

    const parseRow = (row) => {
      return row
        .split("|")
        .filter((c) => c.trim())
        .map((c) => c.trim());
    };

    const headerCells = parseRow(rows[0]);
    const bodyRows = rows.slice(1);

    let html = '<table class="faq-table"><thead><tr>';
    html += headerCells.map((c) => `<th>${this.renderInline(c)}</th>`).join("");
    html += "</tr></thead><tbody>";

    for (const row of bodyRows) {
      const cells = parseRow(row);
      html += "<tr>";
      html += cells.map((c) => `<td>${this.renderInline(c)}</td>`).join("");
      html += "</tr>";
    }

    html += "</tbody></table>";
    return html;
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
        window.StatusMessages.showError("Failed to submit request. Please try the GitHub link instead.");
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
