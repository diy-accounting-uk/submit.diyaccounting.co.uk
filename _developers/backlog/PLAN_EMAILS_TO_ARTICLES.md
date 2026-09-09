<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Plan: Support Emails to Knowledge Base Articles

## Overview

Convert ~5,000 support email threads from the DIY Accounting Gmail support account into knowledge base article candidates. Uses Google Takeout for export, MBOX parsing, and a two-pass LLM pipeline (Haiku triage → Sonnet extraction) to strip personal data and structure reusable accounting knowledge.

## Prerequisites

- Google Takeout export of the support Gmail account (MBOX format)
- Anthropic API key for Claude Haiku and Sonnet calls
- Node.js 20+ (already in repo)

## Pipeline Steps

### Step 1: Google Takeout Export

1. Go to takeout.google.com with the support account
2. Select only Gmail, choose MBOX format
3. Download the export (estimated 500MB–2GB for 5,000 threads with attachments)
4. Place the `.mbox` file at `data/support-emails/All mail Including Spam and Trash.mbox` (gitignored)

### Step 2: Parse MBOX → JSON Threads

Script: `scripts/email-to-articles/parse-mbox.cjs`

- Parse MBOX using `mailparser` npm package
- Group messages into threads via `In-Reply-To` / `References` headers
- Extract per message: subject, date, from (to be stripped later), plain-text body
- Pre-filter: skip threads with <50 chars of non-automated content, skip auto-replies (X-Autoreply header), skip bounces (MAILER-DAEMON)
- Output: `data/support-emails/threads.json` — array of thread objects

### Step 3: Triage with Claude Haiku (cheap/fast)

Script: `scripts/email-to-articles/triage-threads.cjs`

- Read `threads.json`
- For each thread, send to Claude Haiku:
  - Prompt: "Is this support conversation about accounting, bookkeeping, tax, VAT, payroll, or company accounts that contains reusable knowledge for a UK small business? Reply with JSON: {useful: true/false, reason: string, suggestedCategory: string}"
- Rate limit: batch of 10 concurrent, respect API limits
- Output: `data/support-emails/triage-results.json` — thread ID + useful flag + reason + category
- Expected yield: ~500–800 useful threads from 5,000

Cost estimate: ~$0.50 for 5,000 threads at Haiku pricing.

### Step 4: Extract Articles with Claude Sonnet (quality)

Script: `scripts/email-to-articles/extract-articles.cjs`

- Read triage results, filter to useful=true threads
- For each useful thread, send to Claude Sonnet with instructions:
  1. Remove ALL personal data: names, email addresses, company names, account references, order numbers, IP addresses, phone numbers
  2. Extract the core question being asked
  3. Extract the authoritative answer
  4. Structure as a knowledge base article with: title, category, summary (for meta description), body (HTML paragraphs)
  5. Note any verifiable factual claims that should get citation references
  6. Assign category from: bookkeeping, vat, mtd, tax, payroll, company, sole-trader, expenses, general
- Output: `data/support-emails/article-candidates/` — one JSON file per candidate with full structured content
- Also output: `data/support-emails/candidates-catalogue.toml` — summary catalogue for review

Cost estimate: ~$5–10 for ~700 threads at Sonnet pricing.

### Step 5: Human Review

Option A (simple): Browse `article-candidates/*.json` files, delete rejected ones, edit as needed.

Option B (nicer): Generate a review HTML page at `data/support-emails/review.html` that lists all candidates with:
- Title, category, summary preview
- Full body expandable
- Approve/reject checkboxes
- Export approved list as JSON

### Step 6: Publish Approved Articles

Script: `scripts/email-to-articles/generate-html.cjs`

- Read approved candidate JSON files
- Generate article HTML using the existing article page template (matching `articles/*.html` pattern)
- Update `knowledge-base.toml` with new article entries
- Update `sitemap.xml` with new article URLs
- Run `/project:add-references` on each new article to add citations

### Step 7: Deploy

- Commit new articles
- Push to trigger deployment
- New articles automatically included via `articles/*` CloudFront invalidation path

## File Structure

```
data/
  support-emails/                    # ALL gitignored
    All mail Including Spam and Trash.mbox
    threads.json
    triage-results.json
    article-candidates/
      candidate-001.json
      candidate-002.json
      ...
    candidates-catalogue.toml
    review.html

scripts/
  email-to-articles/
    parse-mbox.cjs                   # Step 2
    triage-threads.cjs               # Step 3
    extract-articles.cjs             # Step 4
    generate-review.cjs              # Step 5 Option B
    generate-html.cjs                # Step 6
    README.md                        # Usage instructions
```

## .gitignore Addition

```
data/support-emails/
```

## Dependencies to Add

```
npm install --save-dev mailparser
```

The Anthropic SDK (`@anthropic-ai/sdk`) would need to be added if not already present, or use direct `fetch` calls to the API.

## Cost Summary

| Step | Model | Approx cost |
|------|-------|-------------|
| Triage (5,000 threads) | Haiku | ~$0.50 |
| Extract (~700 threads) | Sonnet | ~$5–10 |
| **Total** | | **~$10** |

## Deduplication with Existing Articles

Before publishing, cross-reference candidate titles/topics against existing 124 articles in `knowledge-base.toml`. Where a candidate covers the same topic as an existing article:
- If the email thread adds new information → merge into existing article
- If it's essentially the same content → discard the candidate
- If it's a distinct angle on the same topic → keep as a separate article with cross-links

## Status

- [ ] Google Takeout export downloaded
- [ ] parse-mbox.cjs written
- [ ] triage-threads.cjs written
- [ ] extract-articles.cjs written
- [ ] Triage pass complete
- [ ] Extraction pass complete
- [ ] Human review complete
- [ ] Articles published
