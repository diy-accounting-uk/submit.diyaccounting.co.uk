// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 * FAQ Search Module
 *
 * Features:
 * - Loads FAQs from pre-parsed JSON (converted from TOML at build time)
 * - Fuzzy matching using bigram similarity + keyword boost
 * - Debounced input for snappy feel
 * - Shows top 7 by priority when no search term
 * - Filters to matching results as user types
 */

/**
 * FAQ Search class for fuzzy matching FAQ entries
 */
export class FAQSearch {
  /**
   * @param {Array} faqs - Array of FAQ objects
   * @param {Object} options - Search options
   * @param {number} options.defaultCount - Number of FAQs to show when no search (default: 7)
   * @param {number} options.maxResults - Maximum results to return (default: 15)
   * @param {number} options.minScore - Minimum score threshold (default: 0.2)
   */
  constructor(faqs, options = {}) {
    this.faqs = faqs;
    this.defaultCount = options.defaultCount || 7;
    this.maxResults = options.maxResults || 15;
    this.minScore = options.minScore || 0.2;

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
   * @returns {Array} Matching FAQ entries sorted by relevance
   */
  search(query) {
    const trimmed = query.trim().toLowerCase();

    // No query = return top by priority
    if (!trimmed) {
      return this.faqs
        .slice()
        .sort((a, b) => a.priority - b.priority)
        .slice(0, this.defaultCount);
    }

    const queryBigrams = this.getBigrams(trimmed);
    const queryWords = trimmed.split(/\s+/);

    const scored = this.faqIndex.map((faq) => {
      // Bigram similarity to question
      let score = this.bigramSimilarity(queryBigrams, faq.questionBigrams);

      // Keyword exact match boost (significant)
      for (const word of queryWords) {
        if (faq.keywordSet.has(word)) {
          score += 0.4;
        }
        // Partial keyword match
        for (const keyword of faq.keywordSet) {
          if (keyword.includes(word) || word.includes(keyword)) {
            score += 0.15;
          }
        }
      }

      // Substring match in full text
      if (faq.allText.includes(trimmed)) {
        score += 0.3;
      }

      // Small priority boost for high-priority items
      score += (20 - faq.priority) * 0.01;

      return { faq, score };
    });

    return scored
      .filter((s) => s.score >= this.minScore)
      .sort((a, b) => b.score - a.score)
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
