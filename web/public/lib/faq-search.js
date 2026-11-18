// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-10 Serve general site pages
// - **Use when:** adding or changing a static informational page, or the FAQ/help search behind it.
// - **Does:** Static pages cover the homepage, about, accessibility, guide, help, privacy, terms and usage token history. faqs.toml holds the FAQ entries. faq-search.js does bigram fuzzy matching over them. help-page.js controls search, the accordion and the support-ticket modal.
// - **Run:** no command; see Does and Entry
// - **Entry:** `web/public/lib/faq-search.js:FAQSearch`; `web/public/lib/help-page.js:HelpPage`
// - **Files:** web/public/index.html, web/public/about.html, web/public/accessibility.html, web/public/guide.html, web/public/help.html, web/public/privacy.html, web/public/terms.html, web/public/usage.html, web/public/faqs.toml, web/public/lib/faq-search.js, web/public/lib/help-page.js, web/public/images/favicon/IMPLEMENTATION.html, behaviour-tests/help.behaviour.test.js, web/browser-tests/privacy-notice.browser.test.js, web/unit-tests/seo-validation.test.js
// - **Keywords:** static pages, faq search, help page, accessibility statement, privacy, terms, usage history, bigram matching
// - **Related:** SITE-05, SITE-19
// @end-capability

import { sortFaqsByCategory } from "./faq-markdown.js";

/**
 * FAQ Search Module
 *
 * Features:
 * - Loads FAQs from pre-parsed JSON (converted from TOML at build time)
 * - Fuzzy matching using bigram similarity + keyword boost
 * - Debounced input for snappy feel
 * - Lists every question by category when there is no search term
 * - Filters to matching results as user types
 */

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "can",
  "do",
  "does",
  "for",
  "how",
  "i",
  "if",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "the",
  "to",
  "what",
  "when",
  "where",
  "why",
  "with",
  "you",
  "your",
]);

/**
 * FAQ Search class for fuzzy matching FAQ entries
 */
export class FAQSearch {
  /**
   * @param {Array} faqs - Array of FAQ objects
   * @param {Object} options - Search options
   * @param {number} options.maxResults - Maximum results to return (default: 15)
   * @param {number} options.minScore - Minimum score threshold (default: 0.3)
   */
  constructor(faqs, options = {}) {
    this.faqs = faqs;
    this.maxResults = options.maxResults || 15;
    this.minScore = options.minScore || 0.3;

    // Pre-compute bigrams for all FAQ questions + keywords
    this.faqIndex = this.buildIndex(faqs);
  }

  /**
   * Build search index for all FAQs
   * @param {Array} faqs - Array of FAQ objects
   * @returns {Array} Indexed FAQ entries
   */
  buildIndex(faqs) {
    return faqs.map((faq) => ({
      ...faq,
      questionBigrams: this.getBigrams(faq.question.toLowerCase()),
      keywordSet: new Set((faq.keywords || []).map((k) => k.toLowerCase())),
      allText: [faq.question, ...(faq.keywords || []), faq.category].join(" ").toLowerCase(),
    }));
  }

  /**
   * Extract bigrams from a string
   * @param {string} str - Input string
   * @returns {Set} Set of bigrams
   */
  getBigrams(str) {
    const clean = str.replace(/[^a-z0-9\s]/g, "").trim();
    const bigrams = new Set();
    for (let i = 0; i < clean.length - 1; i++) {
      bigrams.add(clean.slice(i, i + 2));
    }
    return bigrams;
  }

  /**
   * Calculate Dice coefficient similarity between two bigram sets
   * @param {Set} set1 - First bigram set
   * @param {Set} set2 - Second bigram set
   * @returns {number} Similarity score (0-1)
   */
  bigramSimilarity(set1, set2) {
    if (set1.size === 0 || set2.size === 0) return 0;
    let intersection = 0;
    for (const bigram of set1) {
      if (set2.has(bigram)) intersection++;
    }
    return (2 * intersection) / (set1.size + set2.size);
  }

  /**
   * Search FAQs with fuzzy matching
   * @param {string} query - Search query
   * @returns {Array} Matching FAQ entries, best match first; the priority orders ties only
   */
  search(query) {
    const trimmed = query.trim().toLowerCase();

    // No query = every question, by category
    if (!trimmed) return sortFaqsByCategory(this.faqs);

    const queryBigrams = this.getBigrams(trimmed);
    const queryWords = trimmed.split(/[^a-z0-9']+/).filter((word) => word && !STOP_WORDS.has(word));
    if (queryWords.length === 0) return [];

    const scored = this.faqIndex.map((faq) => {
      const similarity = this.bigramSimilarity(queryBigrams, faq.questionBigrams);
      let score = similarity;
      let matchedWords = 0;

      for (const word of queryWords) {
        let matched = false;
        if (faq.keywordSet.has(word)) {
          score += 0.4;
          matched = true;
        }
        if (word.length >= 4) {
          for (const keyword of faq.keywordSet) {
            if (keyword.includes(word) || word.includes(keyword)) {
              score += 0.15;
              matched = true;
            }
          }
        }
        if (word.length >= 3 && faq.allText.includes(word)) matched = true;
        if (matched) matchedWords++;
      }

      if (faq.allText.includes(trimmed)) score += 0.3;

      // More than half of the words that carry meaning must match, or the query must nearly equal the question.
      const coverage = matchedWords / queryWords.length;
      const related = coverage > 0.5 || similarity >= 0.6;
      return { faq, score: score + coverage * 0.5, related };
    });

    return scored
      .filter((s) => s.related && s.score >= this.minScore)
      .sort((a, b) => b.score - a.score || a.faq.priority - b.faq.priority)
      .slice(0, this.maxResults)
      .map((s) => s.faq);
  }
}

/**
 * Debounce helper for search input
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.FAQSearch = FAQSearch;
  window.debounce = debounce;
}
