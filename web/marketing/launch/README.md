<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Launch pack for the assistant connector

The text, images and recording for the day the connector reaches the first directory. A person posts each item. The text states what prod offers today: the hosted connector's six tools, and no filing through it.

## Files

| File | For |
| --- | --- |
| `product-hunt.md` | Product Hunt |
| `show-hn.md` | Hacker News, Show HN |
| `ai-directories.md` | There's An AI For That, Futurepedia, Toolify |
| `devto.md` | dev.to post, with front matter |
| `images/` | gallery and cover images |
| `videos/assistant-vat-handoff.json` (repository root) | scene script of the 77-second recording |

Product name, descriptions and price text come from the register's `submit` product in `web/marketing/marketing.toml`, read through `scripts/listings-register.mjs`. The price text is `£9.99/yr / £0.99/mo`, from `web/public/submit.catalogue.toml`.

## Limits, read on 2026-11-13

| Site | Field | Limit | Source |
| --- | --- | --- | --- |
| Product Hunt | name | 40 characters | https://help.producthunt.com/en/articles/17834537-4-build-your-product-page |
| Product Hunt | tagline | 60 characters | same page |
| Product Hunt | description | 500 characters | same page |
| Product Hunt | logo | 240x240 px, JPG, PNG or GIF, up to 2 MB | same page |
| Product Hunt | gallery | at least 1 image, 1270x760 px recommended; the page states no maximum count, file size or file type | same page |
| Hacker News | title | no length limit stated; must begin with "Show HN"; no upper case for emphasis, no exclamation marks, no site name | https://news.ycombinator.com/showhn.html and https://news.ycombinator.com/newsguidelines.html |
| Hacker News | text | no limit stated | same pages |
| There's An AI For That | all fields | the page states only a URL field and prices; no title, description or image limit | https://theresanaiforthat.com/get-featured/ |
| Futurepedia | all fields | unread: https://futurepedia.io/submit-tool refused the fetch | none |
| Toolify | all fields | unread: https://www.toolify.ai/submit refused the fetch | none |
| dev.to | title | no limit stated | https://dev.to/p/editor_guide |
| dev.to | tags | at most 4, comma separated | same page |
| dev.to | cover image | 1000x420 px recommended, set by URL in `cover_image` | same page |

Unread, and for the person who submits to read on each form: the Futurepedia and Toolify field limits and image sizes, and the There's An AI For That title, description and image limits. A third-party form quotes 1680x876 px for There's An AI For That images (https://tally.so/r/3xjQZy). It is not their page, so the pack does not use it. The directory texts use the register's 160 and 500 character lengths.

A web search summary gave 260 characters for the Product Hunt description. The help page says 500, and the pack follows the help page.

## Directory prices

Each of the three directories charges to list a tool. No submission happens until the operator decides to pay.

| Directory | Price | Source |
| --- | --- | --- |
| There's An AI For That | $49 for a listing; $437 with a newsletter mention | https://theresanaiforthat.com/get-featured/ |
| Futurepedia | $497 for a Verified listing | a search result for its submit page; the page itself was unread |
| Toolify | $99, listed within 48 hours | a search result for its submit page; the page itself was unread |

## Images

All are Playwright screenshots (Chromium, light scheme) at the stated size, made by `target/launch/shots.mjs` in the worktree. The script is not committed because `target/` is ignored.

| File | Size | Source |
| --- | --- | --- |
| `images/gallery-1-connector-page.png` | 1270x760 | https://submit.diyaccounting.co.uk/mcp.html on prod, 2026-11-13 |
| `images/gallery-2-home.png` | 1270x760 | https://submit.diyaccounting.co.uk/ on prod, 2026-11-13 |
| `images/gallery-3-form-and-receipt.png` | 1270x760 | frames of the ci recording of `assistant-vat-handoff` (capture run 43556372373), each cropped to 635x760 and placed side by side: the form with the declaration ticked and the lower boxes filled, and the receipt; the receipt is from HMRC's test service and the page says so |
| `images/devto-cover.png` | 1000x420 | https://submit.diyaccounting.co.uk/mcp.html on prod, 2026-11-13 |

The directories state no image size, so they use the three gallery images.

## The 77-second recording

`videos/assistant-vat-handoff.json` follows the walk in `behaviour-tests/mcpPrepareVatReturn.behaviour.test.js`. Sign-in, the day pass and the HMRC grant run off camera. The recording shows the connector page, the hand-off link that fills the VAT form, the declaration, the submit and the receipt from HMRC's test service. The link in the `handoff` scene carries the figures of the fixture book `mcp/test/fixtures/brickwork-pro-ltd-vat` for the quarter ending 2025-09-30. Record it on a ci deployment:

```bash
npm run video:record -- assistant-vat-handoff ci
```

The length is 77.4 seconds, measured on capture run 43556372373. Publish the video after `prepare_vat_return` is on prod, because it shows the hand-off.
