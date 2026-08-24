# PLAN: Issue #3 (pre-migration #746) — Retire link tree

> Source issue: https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/issues/3
> Original body: `https://linktr.ee/diyaccounting`
> Existing plans: none found in `_developers/`
> Related: `www.diyaccounting.co.uk` and `diy-accounting` repos (sibling sites) may also reference the Linktree.

## Elaboration

DIY Accounting has an external Linktree (`linktr.ee/diyaccounting`) that predates the owned estate (submit, www, spreadsheets). Keeping it alive creates four problems:

1. **Drift** — links on Linktree fall out of sync with the real nav on `submit.diyaccounting.co.uk`, `diyaccounting.co.uk` and `spreadsheets.diyaccounting.co.uk`.
2. **SEO dilution** — social profiles linking to a third-party aggregator instead of `diyaccounting.co.uk` hand link equity to Linktree.
3. **Privacy** — Linktree sets its own cookies/analytics, so the ICO-registered consent banner on our own domain is bypassed by users who arrive via social → Linktree.
4. **Trust** — an accountancy site that relies on an external link aggregator looks amateurish next to HMRC-approved competitors.

The replacement is the existing home page(s). If we need a "one link for social" we own it: e.g. `diyaccounting.co.uk/links` (on the www gateway site) that redirects / landing-pages the same set of destinations.

## Likely source files to change

- **No submit repo code** is needed for the link itself — it's hosted on Linktree.
- In this repo, audit for the string `linktr.ee` (recon found no hits in `web/public/`, but worth re-checking before retirement):
  - `web/public/*.html`
  - `web/public/widgets/*.js`
  - `_developers/**` plans (historical references only — leave)
- **Social profile bios** (outside the repo): Twitter/X, LinkedIn, Instagram, Facebook, Mastodon, YouTube. Update each to point to `https://diyaccounting.co.uk/` directly, or to a new `/links` page on the www gateway.
- **Gateway repo** (`www.diyaccounting.co.uk`): consider adding `web/public/links.html` — simple static page listing: Submit, Spreadsheets, Guide, Privacy, Contact.

## Likely tests to change/add

- New Playwright test in `www.diyaccounting.co.uk` that loads `/links` (if we create it) and asserts each anchor resolves with 200.
- Optional SEO compliance test (part of the weekly workflow): fail if any page in the submit repo contains `linktr.ee`.

## Likely docs to change

- `README.md` of each of submit, www, spreadsheets — remove Linktree mentions.
- `MARKETING_GUIDANCE.md` in `_developers/` if it lists it.
- Any social media handover doc (ICO or internal).

## Acceptance criteria

1. `grep -r "linktr\.ee" .` inside each of the 4 active repos returns zero matches.
2. Public social profiles (Twitter/X, LinkedIn, etc.) no longer link to `linktr.ee/diyaccounting`.
3. If a `/links` gateway page is introduced, it returns 200 and every outbound link on it returns 200.
4. The Linktree account itself is either **deleted** or **redirected** (via a single link on the page pointing to `diyaccounting.co.uk`) — see Questions.

## Implementation approach

**Recommended — hard retire with 301.**
1. Add a canonical `links.html` to `www.diyaccounting.co.uk` (one list of our sites + policies) — small, owned, works without JS.
2. Edit the Linktree profile so every tile now points to `https://diyaccounting.co.uk/links` (not to submit/spreadsheets individually). This makes any stale shortened/shared links still work for a transition window.
3. Update every social profile bio to `https://diyaccounting.co.uk/links`.
4. After ~30 days (one traffic cycle), delete the Linktree account and rely on direct links.

### Alternative A — soft retire (keep Linktree, just align)
Update Linktree content once, pin it, do not delete. Pros: zero implementation. Cons: drift returns within months.

### Alternative B — replace with a branded one-pager on submit
Host `/links.html` on `submit.diyaccounting.co.uk` rather than the gateway. Cons: submit is the app; the gateway is the marketing surface.

## Questions (for QUESTIONS.md)

- Q3.1: Who controls the Linktree account credentials today? Needed to update / delete.
- Q3.2: Do we want a single `/links` page, or direct-to-home? (Recommendation: `/links` on the gateway.)
- Q3.3: Are there printed/physical assets (business cards, A5 flyers) that still print the `linktr.ee` URL? If yes, leave a redirect in place until those assets are exhausted.

## Good fit for Copilot?

Yes for the repo-side audit (grepping + README edits), but the actual retirement is a manual/business step (social bio updates + Linktree account). Assign the "audit + add gateway /links.html + remove stray references" chunk.
