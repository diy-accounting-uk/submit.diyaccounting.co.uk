<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Plan: Community Discussions on Spreadsheets Site

## Overview

Surface GitHub Discussions from `antonycc/diy-accounting` as a read-only community page
on `spreadsheets.diyaccounting.co.uk`. Users read discussions on the site; posting requires
clicking through to GitHub (GitHub account needed). Copilot provides first-response guidance.

When the spreadsheets site splits into its own repo at `antonycc/diy-accounting`, the
discussions will already be in place.

## Architecture

```
spreadsheets.diyaccounting.co.uk/community.html
  │
  ├── Client-side JS fetches GitHub REST API (no auth, CORS allowed)
  │   GET https://api.github.com/repos/antonycc/diy-accounting/discussions
  │   ?per_page=20&sort=updated&direction=desc
  │
  ├── Renders discussion cards: title, category, date, comment count, snippet
  │   Most recently updated at top (heuristic for "what most people want")
  │
  ├── "Read more →" links to github.com/antonycc/diy-accounting/discussions/N
  │   "Ask a question →" links to github.com/antonycc/diy-accounting/discussions/new
  │
  └── GitHub Copilot (native) responds to new discussions with prompt guidance
```

## Verified Facts

- Repo: `antonycc/diy-accounting` — public, `has_discussions: true`
- 49 existing discussions across 6 categories (Announcements, General, Ideas, Polls, Q&A, Show and tell)
- REST API: `GET /repos/antonycc/diy-accounting/discussions` returns 200 unauthenticated
- CORS: `access-control-allow-origin: *` — direct browser fetch works
- Rate limit: 60 requests/hour unauthenticated (fine for low-traffic site)
- Response includes: title, body, html_url, category, user, created_at, updated_at, comments count

## Implementation Steps

### Phase 1: Community Page on Spreadsheets Site

#### 1.1 Create `community.html`

New page in `web/spreadsheets.diyaccounting.co.uk/public/`:
- Nav bar with "Community" link
- Search/filter by category (dropdown matching GitHub categories)
- Discussion cards rendered by JS
- "Ask a question" button linking to GitHub new discussion URL
- "View all on GitHub" link

#### 1.2 Create `lib/community-page.js`

Client-side JS:
```javascript
// Fetch discussions from GitHub REST API
const REPO = 'antonycc/diy-accounting';
const API = `https://api.github.com/repos/${REPO}/discussions`;

async function loadDiscussions() {
  const response = await fetch(`${API}?per_page=20&sort=updated&direction=desc`);
  if (!response.ok) {
    showFallbackMessage(); // "Visit our discussions on GitHub"
    return;
  }
  const discussions = await response.json();
  renderDiscussions(discussions);
}
```

Each card shows:
- Category emoji + name (from API response)
- Title (linked to `html_url`)
- Relative date ("3 days ago", "2 months ago")
- Comment count
- First ~150 chars of body as snippet
- Author avatar + username

Sort: most recently updated first (API default with `sort=updated`).

#### 1.3 CSS additions to `spreadsheets.css`

Discussion card styles matching existing KB article card pattern:
- `.community-item` — card with border-left accent colour per category
- `.community-category` — small label with emoji
- `.community-meta` — date, author, comments in muted text
- `.community-snippet` — truncated body preview
- Category colour mapping (Q&A = green, General = blue, Ideas = amber, etc.)

#### 1.4 Add to navigation

Add "Community" link to `knowledge-base.html` browse strip and top nav on all pages.
Also add to `sitemap.xml` and CloudFront invalidation paths in `SpreadsheetsStack.java`.

### Phase 2: Copilot Response Guidance

#### 2.1 Configure Copilot in `antonycc/diy-accounting`

Create/update `.github/copilot-instructions.md` in the diy-accounting repo:

```markdown
# Copilot Instructions for DIY Accounting Discussions

You are a helpful assistant for DIY Accounting, a UK small business accounting
software provider. When responding to community discussions:

## Context
- DIY Accounting provides Excel-based bookkeeping spreadsheets for UK businesses
- Products: Sole Trader, Company, VAT, Payroll, Taxi packages
- All packages are Excel .xls/.xlsx files
- The knowledge base is at https://spreadsheets.diyaccounting.co.uk/knowledge-base.html

## Guidelines
- Be helpful and concise
- Reference specific worksheets/cells when applicable
- For tax/legal questions, cite GOV.UK sources and note that professional advice
  should be sought for specific situations
- For product questions, refer to the relevant package and worksheet names
- For bug reports, acknowledge and suggest workarounds if possible
- Never give specific tax advice — always recommend consulting an accountant
  for individual circumstances
```

#### 2.2 Enable Copilot for Discussions

In the diy-accounting repo settings:
- Settings → Copilot → Enable "Copilot in GitHub" for discussions
- This allows Copilot to be @mentioned or auto-respond in discussions

### Phase 3: Graceful Degradation

#### 3.1 Rate limit handling

If GitHub API returns 403 (rate limited):
- Show cached discussions if available (localStorage with 5-min TTL)
- Fall back to "Visit our discussions on GitHub →" link
- Display a subtle note: "Showing cached results"

#### 3.2 API error handling

If GitHub API is down or returns errors:
- Show a friendly message with direct link to GitHub Discussions
- No broken page — the community section gracefully degrades to links

## File Changes

### New files
```
web/spreadsheets.diyaccounting.co.uk/public/community.html
web/spreadsheets.diyaccounting.co.uk/public/lib/community-page.js
```

### Modified files
```
web/spreadsheets.diyaccounting.co.uk/public/spreadsheets.css    — community card styles
web/spreadsheets.diyaccounting.co.uk/public/knowledge-base.html — add Community link
web/spreadsheets.diyaccounting.co.uk/public/sitemap.xml         — add community.html
web/spreadsheets.diyaccounting.co.uk/public/index.html          — add Community to nav
web/spreadsheets.diyaccounting.co.uk/public/download.html       — add Community to nav
web/spreadsheets.diyaccounting.co.uk/public/donate.html         — add Community to nav
web/spreadsheets.diyaccounting.co.uk/public/all-articles.html   — add Community to nav
web/spreadsheets.diyaccounting.co.uk/public/references.html     — add Community to nav
web/spreadsheets.diyaccounting.co.uk/public/sources.html        — add Community to nav
web/spreadsheets.diyaccounting.co.uk/public/recently-updated.html — add Community to nav
infra/.../SpreadsheetsStack.java                                — add /community.html to invalidation
```

### External (diy-accounting repo)
```
.github/copilot-instructions.md  — prompt guidance for Copilot responses
```

## CSP Consideration

The `connect-src` CSP directive in `SpreadsheetsStack.java` currently allows:
```
connect-src 'self' https://www.paypal.com https://www.google-analytics.com https://www.googletagmanager.com;
```

Need to add `https://api.github.com` to allow the client-side fetch.

## Rate Limiting Strategy

GitHub API unauthenticated: 60 requests/hour per IP.

For the spreadsheets site with low traffic, this is sufficient. Each page load = 1 request.
If traffic grows beyond 60 unique visitors/hour on the community page:
- Option A: Cache discussions in a TOML file at build time (GitHub Action fetches nightly)
- Option B: Add a GitHub token as a Lambda-proxied endpoint (5,000 requests/hour)
- Option C: Use the Atom feed as a fallback (no rate limit but needs XML parsing)

## Design Mockup

```
┌─────────────────────────────────────────────────┐
│ Products  Download  Knowledge Base  Community    │
├─────────────────────────────────────────────────┤
│                                                  │
│  Community Discussions                           │
│  Questions, ideas and help from DIY Accounting   │
│  users.                                          │
│                                                  │
│  [Ask a question on GitHub →]                    │
│                                                  │
│  Filter: [All categories ▼]                      │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │ 💬 General                     3 days ago   │ │
│  │ CT600 Submission                             │ │
│  │ I'm trying to submit my CT600 and...        │ │
│  │ 💬 4 comments              → Read more      │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │ 💬 General                     5 weeks ago  │ │
│  │ Employer pension contributions               │ │
│  │ How do I record employer pension...          │ │
│  │ 💬 1 comment               → Read more      │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │ 🙏 Q&A                        2 months ago  │ │
│  │ Document didn't download                     │ │
│  │ I paid via PayPal but the download...        │ │
│  │ 💬 1 comment  ✅ Answered  → Read more      │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  Showing 20 most recently active discussions     │
│  [View all discussions on GitHub →]              │
│                                                  │
└─────────────────────────────────────────────────┘
```
