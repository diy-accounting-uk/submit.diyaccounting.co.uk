<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# DIY Accounting Submit - FAQ & Support System Implementation Plan

## Overview

Add a FAQ/Help system to https://submit.diyaccounting.co.uk with:
1. A new `/help` page with searchable FAQs
2. Fuzzy-matching search that filters FAQs as user types
3. Support ticket submission via GitHub Issues (two paths: direct link or authenticated Lambda)

The site is a static SPA hosted on S3/CloudFront, using Cognito for auth and raw ES modules (no framework). FAQs are loaded from a TOML file at build time and indexed client-side.

---

## Part 1: FAQ Data Structure

### File: `web/public/help/faqs.toml`

```toml
# FAQ entries for DIY Accounting Submit
# Categories: connection, submission, bundles, receipts, vat-basics, errors

[[faq]]
id = "hmrc-connect-fail"
category = "connection"
question = "Why won't my app connect to HMRC?"
answer = """
The most common causes are:
1. **Pop-up blocker** — HMRC authentication opens in a new window. Allow pop-ups for submit.diyaccounting.co.uk
2. **Browser cookies** — HMRC requires cookies. Ensure third-party cookies aren't blocked for tax.service.gov.uk
3. **Session expired** — If you've been on the page a while, refresh and try again
4. **HMRC service down** — Check https://www.gov.uk/government/collections/hm-revenue-and-customs-service-availability-and-issues for outages
"""
keywords = ["connect", "hmrc", "login", "authorise", "authorize", "popup", "blocked", "won't connect", "can't connect", "failed"]
priority = 1

[[faq]]
id = "sandbox-vs-production"
category = "connection"
question = "The sandbox works but production doesn't — what's wrong?"
answer = """
Sandbox and production use different HMRC environments with separate credentials:
- **Sandbox** uses test credentials (any VAT registration number works)
- **Production** requires your real HMRC Government Gateway login

If sandbox works but production doesn't:
1. Ensure you're using your actual Government Gateway credentials (not test ones)
2. Check your VAT registration number is registered for MTD VAT with HMRC
3. You may need to re-authorise if your HMRC permissions changed
"""
keywords = ["sandbox", "production", "test", "live", "real", "works in sandbox", "doesn't work"]
priority = 2

[[faq]]
id = "what-is-bundle"
category = "bundles"
question = "What is a bundle?"
answer = """
A bundle is a saved configuration for a VAT submission. It stores:
- Your VAT registration number
- Whether to use sandbox or production HMRC
- Your HMRC authorisation

You can have multiple bundles if you submit VAT for multiple businesses. Each bundle is independent — authorising one doesn't affect others.
"""
keywords = ["bundle", "what is", "bundles", "configuration", "setup", "vrn"]
priority = 3

[[faq]]
id = "wrong-vrn"
category = "bundles"
question = "I added the wrong VAT registration number — how do I fix it?"
answer = """
You cannot edit a bundle's VAT registration number after creation. Instead:
1. Go to **View and edit your bundles**
2. Click **Remove All Bundles** or remove the incorrect one
3. Click **Add Bundle** and enter the correct VAT registration number

Your submission history (receipts) is stored separately and won't be lost.
"""
keywords = ["wrong vrn", "incorrect vrn", "change vrn", "edit bundle", "fix vrn", "mistake", "VAT registration number"]
priority = 4

[[faq]]
id = "multiple-businesses"
category = "bundles"
question = "Can I submit VAT for multiple businesses?"
answer = """
Yes. Create a separate bundle for each VAT registration:
1. Click **Add Bundle**
2. Enter the VAT registration number for the business
3. Authorise with HMRC using that business's Government Gateway

Each bundle maintains its own HMRC connection. Switch between them from the home screen.
"""
keywords = ["multiple", "businesses", "companies", "more than one", "several", "different vrn", "VAT registration number"]
priority = 5

[[faq]]
id = "obligations-not-showing"
category = "submission"
question = "My VAT obligations aren't showing"
answer = """
If no obligations appear:
1. **Date range** — Expand the date range in the search. Obligations only show for periods HMRC expects a return
2. **Already submitted** — Fulfilled obligations don't show by default. Change status filter to 'F' (Fulfilled) or 'A' (All)
3. **New registration** — HMRC may take 24-48 hours to create your first obligation after MTD registration
4. **Wrong VAT registration number** — Check you're using the correct bundle
"""
keywords = ["obligations", "not showing", "no obligations", "empty", "can't see", "missing", "periods"]
priority = 6

[[faq]]
id = "period-key-meaning"
category = "submission"
question = "What does the period key like '24A1' mean?"
answer = """
The period key identifies your VAT period:
- First two digits = year (24 = 2024)
- Letter = quarter (A=Q1 Jan-Mar, B=Q2 Apr-Jun, C=Q3 Jul-Sep, D=Q4 Oct-Dec)
- Last digit = month within quarter (1, 2, or 3)

Examples:
- **24A1** = January 2024
- **24B3** = June 2024
- **24C2** = August 2024

Annual/non-standard periods use different formats. Check your HMRC obligation for the exact key.
"""
keywords = ["period key", "period", "24a1", "what does", "mean", "quarter", "month"]
priority = 7

[[faq]]
id = "box-numbers"
category = "vat-basics"
question = "What goes in each VAT return box (1-9)?"
answer = """
| Box | Description |
|-----|-------------|
| 1 | VAT due on sales and other outputs |
| 2 | VAT due on acquisitions from EU (usually 0 post-Brexit) |
| 3 | Total VAT due (Box 1 + Box 2) — calculated automatically |
| 4 | VAT reclaimed on purchases and other inputs |
| 5 | Net VAT to pay or reclaim (Box 3 - Box 4) — calculated automatically |
| 6 | Total value of sales excluding VAT |
| 7 | Total value of purchases excluding VAT |
| 8 | Total value of supplies to EU (usually 0 post-Brexit) |
| 9 | Total value of acquisitions from EU (usually 0 post-Brexit) |

Boxes 3 and 5 are calculated — you only enter 1, 2, 4, 6, 7, 8, 9.
"""
keywords = ["box", "boxes", "box 1", "box 2", "box 3", "box 4", "box 5", "box 6", "box 7", "box 8", "box 9", "what goes", "which box", "vat return"]
priority = 8

[[faq]]
id = "figures-dont-match"
category = "submission"
question = "My figures don't match my spreadsheet"
answer = """
Common causes of mismatches:
1. **Rounding** — HMRC accepts figures to 2 decimal places. Check your spreadsheet rounds correctly
2. **Box 3 and 5** — These are calculated (3 = 1+2, 5 = 3-4). Don't enter them manually
3. **VAT vs Net** — Boxes 1-5 are VAT amounts. Boxes 6-9 are net values excluding VAT
4. **Period mismatch** — Ensure your spreadsheet covers exactly the same dates as the obligation
"""
keywords = ["figures", "don't match", "doesn't match", "wrong", "different", "spreadsheet", "mismatch", "numbers"]
priority = 9

[[faq]]
id = "submitted-wrong-figures"
category = "submission"
question = "I submitted the wrong figures — what do I do?"
answer = """
**You cannot amend a submitted VAT return through this app.**

To correct errors:
- **Small errors (under £10,000 or 1% of box 6, max £50,000)** — Adjust in your next VAT return
- **Larger errors** — Submit an error correction form to HMRC (VAT652) or write to them

See HMRC guidance: https://www.gov.uk/vat-corrections

Keep your receipt from DIY Accounting Submit as a record of what was submitted.
"""
keywords = ["wrong figures", "mistake", "error", "submitted wrong", "amend", "correct", "change", "fix submission"]
priority = 10

[[faq]]
id = "where-is-receipt"
category = "receipts"
question = "Where's my submission receipt?"
answer = """
After successful submission:
1. A receipt appears immediately — **save or print this**
2. Click **View previously submitted receipts** from the home screen
3. Receipts are stored locally in your browser

**Important:** Receipts are stored in browser local storage. If you clear browser data or use a different device, historical receipts won't appear. Always save/print receipts after submission.
"""
keywords = ["receipt", "receipts", "where", "find", "confirmation", "proof", "submitted"]
priority = 11

[[faq]]
id = "hmrc-not-received"
category = "receipts"
question = "HMRC says they haven't received it but your app says success"
answer = """
If DIY Accounting Submit showed a success message with a bundle reference, HMRC received it. Discrepancies usually mean:

1. **Timing** — HMRC's portal can take a few hours to update. Check again later
2. **Wrong period** — You may have submitted for a different period than you're checking
3. **Different VAT registration number** — Ensure you're checking the same business in HMRC's portal

Your receipt includes the HMRC bundle reference (format: `1234567890`). Quote this to HMRC if needed.
"""
keywords = ["hmrc", "not received", "haven't received", "didn't get", "missing submission", "success but"]
priority = 12

[[faq]]
id = "flat-rate-scheme"
category = "vat-basics"
question = "I'm on the Flat Rate Scheme — can I use this app?"
answer = """
Yes. The Flat Rate Scheme changes how you calculate VAT, not how you submit it.

When using DIY Accounting Submit with Flat Rate:
- Box 1 = Your flat rate VAT (turnover × your flat rate %)
- Box 6 = Your gross turnover including VAT
- Boxes 2, 4, 7, 8, 9 are typically 0 (check HMRC guidance for exceptions)

Calculate your figures using your flat rate, then submit as normal.
"""
keywords = ["flat rate", "flat rate scheme", "frs", "simplified"]
priority = 13

[[faq]]
id = "annual-accounting"
category = "vat-basics"
question = "I'm on Annual Accounting — how does this work?"
answer = """
Annual Accounting means you submit one VAT return per year instead of quarterly.

In DIY Accounting Submit:
1. You'll see one obligation covering your annual period
2. The period key will reflect your year-end month
3. Submit as normal — the process is identical to quarterly returns

Your interim payments to HMRC are separate from your return submission.
"""
keywords = ["annual", "annual accounting", "yearly", "once a year"]
priority = 14

[[faq]]
id = "first-time-mtd"
category = "connection"
question = "I've never submitted digitally before — where do I start?"
answer = """
First-time MTD setup:
1. **Sign up for MTD** — Register at https://www.gov.uk/vat-record-keeping/sign-up-for-making-tax-digital-for-vat if you haven't
2. **Wait 24-48 hours** — HMRC needs time to activate your MTD access
3. **Create a bundle** — Click Add Bundle and enter your 9-digit VAT registration number
4. **Authorise** — You'll be redirected to HMRC to grant permission
5. **Check obligations** — See what periods HMRC expects returns for
6. **Submit** — Enter your figures and submit

Keep your Government Gateway login details handy.
"""
keywords = ["first time", "never", "new", "start", "begin", "how do i", "getting started", "setup"]
priority = 15

[[faq]]
id = "authorisation-expired"
category = "connection"
question = "My HMRC authorisation has expired"
answer = """
HMRC authorisations expire after 18 months or if you revoke access.

To re-authorise:
1. Go to **View and edit your bundles**
2. You'll see a prompt to re-authorise, or remove and recreate the bundle
3. Follow the HMRC login flow to grant fresh permission

You can also check/revoke authorisations at https://www.tax.service.gov.uk/agent-services-account (even for non-agents).
"""
keywords = ["expired", "authorisation", "authorization", "renew", "re-authorise", "token", "18 months"]
priority = 16

[[faq]]
id = "error-invalid-vrn"
category = "errors"
question = "Error: Invalid VAT registration number"
answer = """
This means the VAT registration number format is wrong:
- VAT registration number must be exactly 9 digits
- No spaces, letters, or GB prefix
- Example: `123456789` not `GB123456789` or `123 456 789`

If your VAT registration number is correct but still rejected:
- Check the business is registered for MTD VAT (not just VAT)
- New registrations can take 24-48 hours to propagate
"""
keywords = ["invalid vrn", "vrn error", "wrong format", "9 digits", "gb", "VAT registration number"]
priority = 17

[[faq]]
id = "error-duplicate-submission"
category = "errors"
question = "Error: Duplicate submission"
answer = """
HMRC rejected the submission because a return for this period already exists.

This happens if:
- You already submitted for this period (check your receipts)
- Someone else submitted for this VAT registration number (e.g., an accountant)

Check the period status in **VAT Obligations** — it should show as Fulfilled with a received date.
"""
keywords = ["duplicate", "already submitted", "exists", "period already"]
priority = 18

[[faq]]
id = "error-obligation-not-found"
category = "errors"
question = "Error: Obligation not found for this period"
answer = """
You're trying to submit for a period HMRC isn't expecting a return for.

Check:
1. The period matches an Open obligation exactly
2. You haven't already submitted for this period
3. The VAT registration number is correct

Use **VAT Obligations** to see which periods are open.
"""
keywords = ["obligation not found", "period not found", "no obligation", "can't submit"]
priority = 19

[[faq]]
id = "clear-browser-data"
category = "errors"
question = "Something's not working — should I clear my browser data?"
answer = """
Clearing browser data can help with some issues but **will delete your saved receipts**.

Before clearing:
1. Go to **View previously submitted receipts**
2. Save/print any receipts you need

Safer alternatives:
- Try a private/incognito window first
- Try a different browser
- Just clear cookies for submit.diyaccounting.co.uk specifically

If issues persist after clearing data, contact support.
"""
keywords = ["clear", "browser", "cache", "cookies", "not working", "stuck", "frozen", "reset"]
priority = 20
```

---

## Part 2: FAQ Page UI

### File: `src/pages/help.html`

Create a new page accessible from the hamburger menu. Design should match existing site style (blue headers, white cards, clean layout).

```html
<!-- Template structure -->
<div class="help-page">
  <h1>Help & FAQs</h1>
  <p class="subtitle">Find answers to common questions about DIY Accounting Submit</p>

  <!-- Search box -->
  <div class="faq-search-container">
    <input
      type="text"
      id="faq-search"
      placeholder="Search FAQs... e.g. 'wrong figures' or 'can't connect'"
      autocomplete="off"
    >
    <span class="search-hint" id="search-hint">Showing top FAQs</span>
  </div>

  <!-- FAQ list -->
  <div class="faq-list" id="faq-list">
    <!-- Dynamically populated -->
  </div>

  <!-- Support section -->
  <div class="support-section">
    <h2>Still need help?</h2>
    <p>If you can't find an answer above, you can:</p>
    <div class="support-options">
      <a href="https://github.com/[REPO]/issues/new?template=support.md"
         target="_blank"
         rel="noopener"
         class="support-button secondary">
        Open a GitHub Issue
      </a>
      <button id="open-support-form" class="support-button primary">
        Submit a Support Request
      </button>
    </div>
  </div>

  <!-- Support form modal -->
  <div class="modal" id="support-modal" hidden>
    <div class="modal-content">
      <h3>Submit a Support Request</h3>
      <form id="support-form">
        <label for="support-subject">Subject</label>
        <input type="text" id="support-subject" required maxlength="100">

        <label for="support-description">Description</label>
        <textarea id="support-description" required maxlength="2000" rows="6"
          placeholder="Describe your issue. Include any error messages you see."></textarea>

        <label for="support-category">Category</label>
        <select id="support-category" required>
          <option value="">Select a category</option>
          <option value="connection">Connection / HMRC Login</option>
          <option value="submission">VAT Submission</option>
          <option value="bundles">Bundles</option>
          <option value="receipts">Receipts</option>
          <option value="other">Other</option>
        </select>

        <div class="form-actions">
          <button type="button" id="cancel-support" class="secondary">Cancel</button>
          <button type="submit" class="primary">Submit</button>
        </div>
      </form>
    </div>
  </div>
</div>
```

### Styling notes (match existing site)

- Primary blue: `#2b579a` (from existing buttons)
- Background: `#f5f5f5`
- Card background: white with subtle shadow
- Font: system font stack (already in use)
- FAQ items: collapsible accordion style, one open at a time
- Search box: full width, prominent, same border radius as existing inputs

---

## Part 3: FAQ Search Logic

### File: `src/js/faq-search.js`

Implement fuzzy matching using a lightweight approach (no external dependencies).

```javascript
/**
 * FAQ Search Module
 *
 * Features:
 * - Loads FAQs from pre-parsed TOML (converted to JSON at build time)
 * - Fuzzy matching using bigram similarity + keyword boost
 * - Debounced input for snappy feel
 * - Shows top 5-7 by priority when no search term
 * - Filters to matching results as user types
 */

export class FAQSearch {
  constructor(faqs, options = {}) {
    this.faqs = faqs;
    this.defaultCount = options.defaultCount || 7;
    this.maxResults = options.maxResults || 15;
    this.minScore = options.minScore || 0.2;

    // Pre-compute bigrams for all FAQ questions + keywords
    this.faqIndex = this.buildIndex(faqs);
  }

  buildIndex(faqs) {
    return faqs.map(faq => ({
      ...faq,
      questionBigrams: this.getBigrams(faq.question.toLowerCase()),
      keywordSet: new Set(faq.keywords.map(k => k.toLowerCase())),
      allText: [
        faq.question,
        ...faq.keywords,
        faq.category
      ].join(' ').toLowerCase()
    }));
  }

  getBigrams(str) {
    const clean = str.replace(/[^a-z0-9\s]/g, '').trim();
    const bigrams = new Set();
    for (let i = 0; i < clean.length - 1; i++) {
      bigrams.add(clean.slice(i, i + 2));
    }
    return bigrams;
  }

  bigramSimilarity(set1, set2) {
    if (set1.size === 0 || set2.size === 0) return 0;
    let intersection = 0;
    for (const bigram of set1) {
      if (set2.has(bigram)) intersection++;
    }
    return (2 * intersection) / (set1.size + set2.size);
  }

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

    const scored = this.faqIndex.map(faq => {
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
      .filter(s => s.score >= this.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxResults)
      .map(s => s.faq);
  }
}

// Debounce helper
export function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}
```

### File: `src/js/help-page.js`

```javascript
/**
 * Help Page Controller
 *
 * Initialises FAQ search, handles accordion, manages support form modal
 */

import { FAQSearch, debounce } from './faq-search.js';
import { submitSupportTicket } from './support-api.js';
import faqData from '../faqs.json'; // Built from TOML

class HelpPage {
  constructor() {
    this.faqSearch = new FAQSearch(faqData.faq);
    this.openFaqId = null;

    this.searchInput = document.getElementById('faq-search');
    this.searchHint = document.getElementById('search-hint');
    this.faqList = document.getElementById('faq-list');
    this.supportModal = document.getElementById('support-modal');
    this.supportForm = document.getElementById('support-form');

    this.init();
  }

  init() {
    // Initial render
    this.render(this.faqSearch.search(''));

    // Search input handler
    const handleSearch = debounce((e) => {
      const query = e.target.value;
      const results = this.faqSearch.search(query);
      this.render(results);
      this.updateHint(query, results.length);
    }, 150);

    this.searchInput.addEventListener('input', handleSearch);

    // Support modal handlers
    document.getElementById('open-support-form').addEventListener('click', () => {
      this.openModal();
    });

    document.getElementById('cancel-support').addEventListener('click', () => {
      this.closeModal();
    });

    this.supportModal.addEventListener('click', (e) => {
      if (e.target === this.supportModal) this.closeModal();
    });

    // Support form submission
    this.supportForm.addEventListener('submit', (e) => this.handleSupportSubmit(e));
  }

  updateHint(query, count) {
    if (!query.trim()) {
      this.searchHint.textContent = 'Showing top FAQs';
    } else if (count === 0) {
      this.searchHint.textContent = 'No matching FAQs — try different keywords';
    } else {
      this.searchHint.textContent = `${count} result${count === 1 ? '' : 's'}`;
    }
  }

  render(faqs) {
    if (faqs.length === 0) {
      this.faqList.innerHTML = `
        <div class="no-results">
          <p>No FAQs match your search.</p>
          <p>Try different keywords, or <button class="link-button" id="clear-search">view all FAQs</button></p>
        </div>
      `;
      document.getElementById('clear-search')?.addEventListener('click', () => {
        this.searchInput.value = '';
        this.render(this.faqSearch.search(''));
        this.updateHint('', this.faqSearch.search('').length);
      });
      return;
    }

    this.faqList.innerHTML = faqs.map(faq => `
      <div class="faq-item" data-id="${faq.id}">
        <button class="faq-question" aria-expanded="false">
          <span class="faq-category-badge">${this.formatCategory(faq.category)}</span>
          ${this.escapeHtml(faq.question)}
          <svg class="faq-chevron" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        <div class="faq-answer" hidden>
          ${this.renderMarkdown(faq.answer)}
        </div>
      </div>
    `).join('');

    // Accordion click handlers
    this.faqList.querySelectorAll('.faq-question').forEach(btn => {
      btn.addEventListener('click', () => this.toggleFaq(btn));
    });
  }

  toggleFaq(button) {
    const item = button.closest('.faq-item');
    const id = item.dataset.id;
    const answer = item.querySelector('.faq-answer');
    const isOpen = button.getAttribute('aria-expanded') === 'true';

    // Close previously open item
    if (this.openFaqId && this.openFaqId !== id) {
      const prev = this.faqList.querySelector(`[data-id="${this.openFaqId}"]`);
      if (prev) {
        prev.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
        prev.querySelector('.faq-answer').hidden = true;
      }
    }

    // Toggle current
    button.setAttribute('aria-expanded', !isOpen);
    answer.hidden = isOpen;
    this.openFaqId = isOpen ? null : id;
  }

  formatCategory(cat) {
    const labels = {
      'connection': 'Connection',
      'submission': 'Submission',
      'bundles': 'Bundles',
      'receipts': 'Receipts',
      'vat-basics': 'VAT Basics',
      'errors': 'Errors'
    };
    return labels[cat] || cat;
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  renderMarkdown(text) {
    // Simple markdown: **bold**, links, tables, lists
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n- /g, '</li><li>')
      .replace(/<\/li><li>/, '<ul><li>')
      .replace(/<\/li>([^<])/g, '</li></ul>$1')
      .replace(/^\|(.+)\|$/gm, (match) => this.parseTableRow(match))
      .replace(/^(\d+)\. /gm, '</li><li>')
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  }

  parseTableRow(row) {
    const cells = row.split('|').filter(c => c.trim());
    if (cells.every(c => /^-+$/.test(c.trim()))) return ''; // Header separator
    const tag = this.tableStarted ? 'td' : 'th';
    this.tableStarted = true;
    return `<tr>${cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('')}</tr>`;
  }

  openModal() {
    this.supportModal.hidden = false;
    document.body.style.overflow = 'hidden';
    this.supportForm.querySelector('input').focus();
  }

  closeModal() {
    this.supportModal.hidden = true;
    document.body.style.overflow = '';
    this.supportForm.reset();
  }

  async handleSupportSubmit(e) {
    e.preventDefault();

    const subject = document.getElementById('support-subject').value;
    const description = document.getElementById('support-description').value;
    const category = document.getElementById('support-category').value;

    const submitBtn = this.supportForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
      await submitSupportTicket({ subject, description, category });
      this.closeModal();
      this.showNotification('Support request submitted successfully', 'success');
    } catch (err) {
      this.showNotification('Failed to submit request. Please try the GitHub link instead.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit';
    }
  }

  showNotification(message, type) {
    // Use existing notification system or create simple one
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.textContent = message;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 5000);
  }
}

// Initialise on page load
if (document.getElementById('faq-list')) {
  new HelpPage();
}
```

---

## Part 4: Build Step — TOML to JSON

### Add to build process

Use a simple Node script or integrate into existing build:

```javascript
// scripts/build-faqs.js
import { parse } from 'smol-toml'; // or @iarna/toml
import { readFileSync, writeFileSync } from 'fs';

const toml = readFileSync('web/public/help/faqs.toml', 'utf-8');
const data = parse(toml);
writeFileSync('src/faqs.json', JSON.stringify(data, null, 2));
console.log(`Built ${data.faq.length} FAQs`);
```

Add to package.json scripts:
```json
{
  "scripts": {
    "build:faqs": "node scripts/build-faqs.js",
    "build": "npm run build:faqs && <existing build>"
  }
}
```

Dev dependency: `npm install --save-dev smol-toml`

---

## Part 5: Support Ticket Lambda

### Architecture

```
User (authenticated via Cognito)
    ↓
API Gateway (with Cognito authorizer)
    ↓
Lambda: create-support-issue
    ↓
GitHub API → Creates issue in repo
```

### CDK Stack Addition

Add to existing CDK stack (or create `lib/support-stack.ts`):

```typescript
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

interface SupportStackProps extends cdk.StackProps {
  userPool: cdk.aws_cognito.IUserPool;
  githubTokenSecretArn: string;
  githubRepo: string; // e.g. "owner/repo"
}

export class SupportStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: SupportStackProps) {
    super(scope, id, props);

    // Reference existing secret containing GitHub PAT
    const githubSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this, 'GitHubToken', props.githubTokenSecretArn
    );

    // Lambda to create GitHub issues
    const createIssueFn = new NodejsFunction(this, 'CreateSupportIssue', {
      entry: 'lambda/create-support-issue/index.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      environment: {
        GITHUB_SECRET_ARN: props.githubTokenSecretArn,
        GITHUB_REPO: props.githubRepo,
      },
    });

    // Grant Lambda access to read the secret
    githubSecret.grantRead(createIssueFn);

    // API Gateway with Cognito authorizer
    const api = new apigateway.RestApi(this, 'SupportApi', {
      restApiName: 'DIY Support API',
      defaultCorsPreflightOptions: {
        allowOrigins: ['https://submit.diyaccounting.co.uk'],
        allowMethods: ['POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'SupportAuthorizer', {
      cognitoUserPools: [props.userPool],
    });

    const supportResource = api.root.addResource('support');
    supportResource.addMethod('POST', new apigateway.LambdaIntegration(createIssueFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    new cdk.CfnOutput(this, 'SupportApiUrl', {
      value: api.url,
    });
  }
}
```

### Lambda Implementation

#### File: `lambda/create-support-issue/index.ts`

```typescript
import { APIGatewayProxyHandler } from 'aws-lambda';
import { SecretsManager } from '@aws-sdk/client-secrets-manager';

const secretsManager = new SecretsManager({});

interface SupportRequest {
  subject: string;
  description: string;
  category: string;
}

interface GitHubIssueResponse {
  number: number;
  html_url: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': 'https://submit.diyaccounting.co.uk',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Content-Type': 'application/json',
  };

  try {
    // Parse and validate request
    if (!event.body) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing body' }) };
    }

    const { subject, description, category } = JSON.parse(event.body) as SupportRequest;

    if (!subject || !description || !category) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    // Get user info from Cognito claims
    const claims = event.requestContext.authorizer?.claims;
    const userEmail = claims?.email || 'unknown';
    const userId = claims?.sub || 'unknown';

    // Get GitHub token from Secrets Manager
    const secretResponse = await secretsManager.getSecretValue({
      SecretId: process.env.GITHUB_SECRET_ARN,
    });
    const githubToken = secretResponse.SecretString;

    // Create GitHub issue
    const issueBody = `
## Support Request

**Category:** ${category}
**User:** ${userEmail} (${userId})
**Submitted:** ${new Date().toISOString()}

---

${description}

---
*Submitted via DIY Accounting Submit support form*
    `.trim();

    const categoryLabels: Record<string, string> = {
      connection: 'connection',
      submission: 'submission',
      bundles: 'bundles',
      receipts: 'receipts',
      other: 'general',
    };

    const response = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_REPO}/issues`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: `[Support] ${subject}`,
          body: issueBody,
          labels: ['support', categoryLabels[category] || 'general'],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GitHub API error:', response.status, errorText);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: 'Failed to create issue' }),
      };
    }

    const issue: GitHubIssueResponse = await response.json();

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        issueNumber: issue.number,
        issueUrl: issue.html_url,
      }),
    };
  } catch (err) {
    console.error('Error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
```

### Client-side API Call

#### File: `src/js/support-api.js`

```javascript
/**
 * Support API client
 */

const SUPPORT_API_URL = 'https://[API_GATEWAY_URL]/support'; // Replace after deployment

export async function submitSupportTicket({ subject, description, category }) {
  // Get current Cognito session token
  const session = await getCurrentSession(); // Use your existing auth helper
  const token = session.getIdToken().getJwtToken();

  const response = await fetch(SUPPORT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token,
    },
    body: JSON.stringify({ subject, description, category }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to submit');
  }

  return response.json();
}
```

---

## Part 6: GitHub Setup

### Create Issue Template

File: `.github/ISSUE_TEMPLATE/support.md`

```markdown
---
name: Support Request
about: Get help with DIY Accounting Submit
title: '[Support] '
labels: support
assignees: ''
---

**Category**
<!-- connection / submission / bundles / receipts / other -->

**Description**
<!-- Describe your issue clearly -->

**Steps to reproduce (if applicable)**
1.
2.
3.

**Expected behaviour**


**Screenshots (if applicable)**


**Browser/Device**
<!-- e.g. Chrome 120 on Windows 11 -->
```

### Create Labels

Ensure these labels exist in the repo:
- `support` (for all support issues)
- `connection`
- `submission`
- `bundles`
- `receipts`
- `general`

### GitHub Personal Access Token

Create a fine-grained PAT with:
- Repository access: Only select the support repo
- Permissions: Issues (read/write)

Store in AWS Secrets Manager:
```bash
aws secretsmanager create-secret \
  --name diy-accounting/github-token \
  --secret-string "ghp_xxxxxxxxxxxx"
```

---

## Part 7: Navigation Integration

Add to hamburger menu (existing navigation):

```javascript
// In your menu configuration
{
  label: 'Help',
  href: '/help',
  icon: 'help-circle' // or appropriate icon
}
```

---

## Part 8: CSS Additions

Add to existing stylesheet or create `src/css/help.css`:

```css
/* FAQ Page Styles */

.help-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.help-page h1 {
  color: #2b579a;
  margin-bottom: 0.5rem;
}

.help-page .subtitle {
  color: #666;
  margin-bottom: 2rem;
}

/* Search */
.faq-search-container {
  margin-bottom: 1.5rem;
}

#faq-search {
  width: 100%;
  padding: 1rem;
  font-size: 1rem;
  border: 2px solid #ddd;
  border-radius: 8px;
  transition: border-color 0.2s;
}

#faq-search:focus {
  outline: none;
  border-color: #2b579a;
}

.search-hint {
  display: block;
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: #666;
}

/* FAQ List */
.faq-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.faq-item {
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  overflow: hidden;
}

.faq-question {
  width: 100%;
  padding: 1rem;
  border: none;
  background: none;
  text-align: left;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.faq-question:hover {
  background: #f8f9fa;
}

.faq-category-badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  background: #e8f0fe;
  color: #2b579a;
  white-space: nowrap;
}

.faq-chevron {
  width: 20px;
  height: 20px;
  margin-left: auto;
  stroke: currentColor;
  stroke-width: 2;
  fill: none;
  transition: transform 0.2s;
}

.faq-question[aria-expanded="true"] .faq-chevron {
  transform: rotate(180deg);
}

.faq-answer {
  padding: 0 1rem 1rem;
  color: #333;
  line-height: 1.6;
}

.faq-answer p {
  margin: 0 0 1rem;
}

.faq-answer ul, .faq-answer ol {
  margin: 0 0 1rem;
  padding-left: 1.5rem;
}

.faq-answer table {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  font-size: 0.9rem;
}

.faq-answer th, .faq-answer td {
  padding: 0.5rem;
  border: 1px solid #ddd;
  text-align: left;
}

.faq-answer th {
  background: #f8f9fa;
  font-weight: 600;
}

/* Support Section */
.support-section {
  margin-top: 3rem;
  padding: 2rem;
  background: #f8f9fa;
  border-radius: 8px;
  text-align: center;
}

.support-section h2 {
  color: #2b579a;
  margin-bottom: 0.5rem;
}

.support-options {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-top: 1.5rem;
  flex-wrap: wrap;
}

.support-button {
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  border: 2px solid #2b579a;
  transition: all 0.2s;
}

.support-button.primary {
  background: #2b579a;
  color: white;
}

.support-button.primary:hover {
  background: #1e3f6f;
}

.support-button.secondary {
  background: white;
  color: #2b579a;
}

.support-button.secondary:hover {
  background: #e8f0fe;
}

/* Modal */
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-content h3 {
  color: #2b579a;
  margin-bottom: 1.5rem;
}

.modal-content label {
  display: block;
  font-weight: 500;
  margin-bottom: 0.5rem;
  margin-top: 1rem;
}

.modal-content input,
.modal-content textarea,
.modal-content select {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 1rem;
}

.modal-content textarea {
  resize: vertical;
}

.form-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
}

/* Notifications */
.notification {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  color: white;
  font-weight: 500;
  animation: slideIn 0.3s ease;
  z-index: 1001;
}

.notification.success {
  background: #22c55e;
}

.notification.error {
  background: #ef4444;
}

@keyframes slideIn {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* No results */
.no-results {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.link-button {
  background: none;
  border: none;
  color: #2b579a;
  text-decoration: underline;
  cursor: pointer;
  font-size: inherit;
}
```

---

## Summary Checklist

### Files to Create
- [ ] `web/public/help/faqs.toml` — FAQ content
- [ ] `src/pages/help.html` — Help page HTML
- [ ] `src/js/faq-search.js` — Search logic
- [ ] `src/js/help-page.js` — Page controller
- [ ] `src/js/support-api.js` — API client
- [ ] `src/css/help.css` — Styles
- [ ] `scripts/build-faqs.js` — TOML→JSON build step
- [ ] `lambda/create-support-issue/index.ts` — Lambda function
- [ ] CDK stack additions for Lambda + API Gateway
- [ ] `.github/ISSUE_TEMPLATE/support.md` — GitHub template

### Infrastructure
- [ ] Create GitHub PAT and store in Secrets Manager
- [ ] Create GitHub labels
- [ ] Deploy Lambda and API Gateway
- [ ] Update CORS on API Gateway with actual domain

### Integration
- [ ] Add Help link to navigation menu
- [ ] Update build script to include TOML→JSON step
- [ ] Test search with various queries
- [ ] Test support form submission
- [ ] Test direct GitHub link

---

## Notes for Claude Code

1. **Existing patterns**: Match the existing site's code style — vanilla JS with ES modules, no framework, existing CSS variables
2. **Auth integration**: The site already uses Cognito — reuse the existing session handling for the authenticated API call
3. **Build process**: Integrate TOML parsing into whatever build exists (may be simple file copy to S3)
4. **Error handling**: Be graceful — if the Lambda fails, the direct GitHub link is the fallback
5. **Mobile**: Ensure the modal and search work well on mobile (test at 375px width)
