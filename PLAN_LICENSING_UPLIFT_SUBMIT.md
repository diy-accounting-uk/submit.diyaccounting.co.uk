<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: the licensing uplift, Submit's share

Status: written 2026-09-09 by the spreadsheets session from the spreadsheets repository's licensing uplift plan, since archived at `../spreadsheets.diyaccounting.co.uk/_developers/archive/PLAN_LICENSING_UPLIFT.md` and split into `PLAN_DIYACCOUNTING_BRAND.md` (the brand source, the trade mark filings, the diyaccounting.com question) and `PLAN_DIYA_GL_LAUNCH.md` (the domain registrations, the HMRC licence note). This file carries only what lands in this repository. Blocked on busy: every row here waits for the operator's word, as the operator paused work in this repository on 2026-09-09.

**Feed updates back.** The spreadsheets board (`../spreadsheets.diyaccounting.co.uk/NEXT.md`) carries this repository's share as one row, LU-8a, and its plan's rows LU-18 (the Submit lines), H-LU-9 and LU-15 name this repository. When a row here starts, lands or changes shape, append a block to `~/.claude/inboxes/spreadsheets.md` (the inbox protocol in `~/.claude/inboxes/README.md`) saying which row and what changed, so the spreadsheets session updates its board and its plan. A change to the model or a decision is made in the spreadsheets plan first, never here.

## User assertions (verbatim, from the plan of record)

- "The spreadsheets are the original work ... This should be protected within the extend of AGPL and I want a general uplift on licensing and copywright before I increase exposure."
- "do I have to invite contibutions, I don't really want them. The source is viewable (open) but otherwise restricted."
- "I would like anyone to be able to download spreadsheets or use the hosted solution, but I don't want to someone to distribute the spreadsheets themselves or run my websites on their own brand."
- "so it's ok if the public hostname prod remains diyaccounting.co.uk so hosting unmodified would mean either being under my dns or violating my making a change but running localhost is fine."
- "My goal here is to maximse DIY Accounting Submit users, which then has paid tiers ..."

## The model, as it applies here

Submit is the hosted product, so it takes the third layer: the PolyForm Internal Use License 1.0.0 plus one additional grant permitting an accountant or bookkeeper to use the service to prepare accounts for their clients. Anyone may use the hosted service; nobody may host it, or a modified copy under another name; running on localhost is permitted use. No contributions are accepted. The DIYA-GL engine this repository imports (`@diy-accounting-uk/diya-gl`, 1.1.0 and later) is Apache-2.0 and needs no change here.

Constants, identical to the other repositories:

- Copyright line: `Copyright (C) 2006-2026 DIY Accounting Limited`. "DIY Accounting Ltd", "2025-2026" and the bare "2026" spans go.
- SPDX identifier: `LicenseRef-PolyForm-Internal-Use-1.0.0`; `package.json` says `SEE LICENSE IN LICENSE`.
- The company name is written "DIY Accounting Limited" in footers, JSON-LD, headers and manifests; bare "DIY Accounting" survives only as the brand in titles and `og:site_name`.
- Words for the company's own work: "free to use, source available, open specification". Never "open source"; "open source" stays only where it describes someone else's thing (MCP on `mcp.html`).
- ™ after DIY Accounting Submit, DIY Accounting Spreadsheets and DIYA-GL on first mention on a page; ® never, until registered.

Texts to copy, all on `../spreadsheets.diyaccounting.co.uk` main since 2026-09-09: `LICENSE` (the canonical PolyForm text with the "Additional Grant" section; copy it byte for byte, the grant included), `LICENSING.md` (the shape of the directory-to-layer map and the third-party section), `NOTICE`, `TRADEMARKS.md`, `SECURITY.md`, the footer wording in `web/spreadsheets.diyaccounting.co.uk/public/index.html`, and `app/test/licence-headers.test.js` (the header gate to twin). The header forms per format are in that test.

## What the audit found here (2026-09-08, re-checked the same day)

1,415 tracked files. The root `LICENSE` is a twenty-line AGPL paraphrase with an "additional terms" clause; GitHub returns `NOASSERTION`. Under the six original extensions 88 files lack a header (49 js, 2 mjs, 1 cjs, 26 sh, 10 toml); under the full comment-capable set about 356 more (54 html, 234 md, 31 yml, 17 xml, 6 svg, 2 css, one properties, one Dockerfile). Identifiers today: `AGPL-3.0-only` 694, `AGPL-3.0-or-later` 28 (16 workflows, 5 scripts, 7 battery-pack files, one plan), `MIT` 1 (`battery-pack.sh`), `Apache-2.0` 1 (inside a committed Lighthouse report). `_developers/backlog/battery-pack/` has an MIT `LICENSE`, badge and `"license": "MIT"`; `_developers/backlog/metric-son/` carries `@license MIT`. The public commitment is the strongest of the six repositories: `terms.html` clause 11 (lines 272-275) says the Service is AGPL-3.0 open source, clause 21 (431-437) invites contributions, line 158 mentions open source licences; `accessibility.html:349-353` repeats the claim; `README.md` lines 14, 34, 118 and 123 say open source and AGPL; `package.json` says `AGPL-3.0`; `hmrc-fraud-prevention.md:3` and `_developers/MARKETING_GUIDANCE.md:83,130,193` say it too. `web/public-simulator/` is gitignored build output of `scripts/build-simulator.js`, so the deployed simulator copy is stale (`accessibility.html` dated January 2026) and the deploy must run the build. The OpenAPI document has no `info.license`, `info.contact` or `termsOfService` (`OpenApiGenerator.java:89-109`). The `Dockerfile` has no labels; the Lambda image goes to private ECR. `web/public/lib/qrcode.min.js` is node-qrcode with its MIT notice stripped. The 29 `.sql` files were not counted. Line numbers are as of the audit; grep before editing.

| Extension | Files | Header today | Layer | Notes |
| --- | --- | --- | --- | --- |
| java | 119 | 119 | PolyForm | `OpenApiGenerator.java` also gains `info.license` |
| js | 591 | 542 | PolyForm | `qrcode.min.js` keeps its MIT notice, restored |
| mjs, cjs, ts | 13 | 10 | PolyForm | |
| sh | 50 | 24 | PolyForm | |
| yml, yaml | 57 | 17 | PolyForm | 16 workflows read `-or-later` today |
| toml | 11 | 1 | PolyForm | |
| html | 61 | 7 | PolyForm | the Lighthouse, Playwright and ZAP reports under `web/public/tests/` are third-party output: excluded, NOTICE line |
| md | 237 | 3 | PolyForm | HMRC material under `_developers/hmrc-references/` excluded |
| xml, xsd, plist, drawio | 26 | 0 | PolyForm | `pom.xml`, `log4j2` get headers; the xsd are Companies House schemas (NOTICE); drawio is tool output, excluded |
| css, svg | 8 | 0 | PolyForm | |
| sql | 29 | not counted | PolyForm | `--` comments |
| properties, Dockerfile, plantuml | 3 | 0 | PolyForm | the Dockerfile also gains OCI labels |
| json | 47 | — | PolyForm | `package.json` via `license`; the rest through `LICENSING.md` |
| png, jpg, ico, webm, gif | 85 | — | PolyForm | `g-logo.png` and `policybee-logo.png` are partner marks, NOTICE |
| pdf, xlsx, docx, csv, tsv, txt, eml, mhtml | 56 | — | PolyForm | the mhtml are saved third-party pages; `LICENSING.md` |

## Rows

One PR for the code rows, opened from a worktree on a `claude/lic-<topic>` branch; the operator merges. Sonnet throughout, Opus for the terms wording in S2. Each row's landing is reported to the spreadsheets inbox.

| # | Task | Precursors | Model | Files |
| --- | --- | --- | --- | --- |
| S1 | The licence files: `LICENSE` becomes the canonical PolyForm text with the additional grant, copied from the spreadsheets repository; `LICENSING.md` maps every top-level directory to the third layer, states the source offer and the copyright line, and carries the third-party section; `NOTICE` carries the company line and the third-party lines of S6; `package.json` `license` becomes `SEE LICENSE IN LICENSE` | the operator's word | Sonnet | `LICENSE`, `LICENSING.md`, `NOTICE`, `package.json` |
| S2 | The public statement: `terms.html` lines 158, 272-275 and 431-437 rewritten so the Service is free to use, source available, under the PolyForm Internal Use License with the grant for accountants, with the contribution invitation removed; `accessibility.html:349-353` the same; every page footer gains the licence line and a source link and reads `© 2006-2026 DIY Accounting Limited`; `README.md:14,34,118,123`, `hmrc-fraud-prevention.md:3` and `_developers/MARKETING_GUIDANCE.md:83,130,193` say the new words; the README gains "This repository does not accept contributions" and `SECURITY.md` and `TRADEMARKS.md` are added as copies of the spreadsheets files with this repository's scope; the HMRC approval documents (`_developers/hmrc/HMRC_MTD_API_APPROVAL_SUBMISSION.md:134,143,666,812`, `HMRC_PRODUCTION_CREDENTIALS_EMAIL.md:57`) are annotated, not rewritten, with the date the licence changed; ™ on the marks | S1 | Opus for the terms wording, Sonnet for the rest | `web/public/terms.html`, `web/public/accessibility.html`, every `web/public/**/*.html` footer, `README.md`, `hmrc-fraud-prevention.md`, `_developers/MARKETING_GUIDANCE.md`, `_developers/hmrc/*.md`, `SECURITY.md`, `TRADEMARKS.md` |
| S3 | Headers: every comment-capable file carries `SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0` and the copyright line in its format's comment style; the 28 `-or-later` headers, the battery-pack subtree's MIT `LICENSE`, badge and `package.json`, and metric-son's `@license MIT` become the PolyForm identifier; the 88 narrow-set and about 356 wide-set gaps filled; "Ltd" to "Limited"; a unit test, twinned from the spreadsheets `app/test/licence-headers.test.js` (single layer, no closure), walks `git ls-files` and fails on a missing, mismatched or old-name header, with the exclusions above listed in the test; runs in `npm test` | S1 | Haiku for the sweep, Sonnet for the test | every file in the table above |
| S4 | The OpenAPI document: `info.license` (name `PolyForm Internal Use License 1.0.0`, url the repository's `LICENSE`), `info.contact` and `termsOfService` (the terms page) in `createInfoSection()`; the generated `openapi.json` on ci carries them | S1 | Sonnet | `infra/.../OpenApiGenerator.java`, its test |
| S5 | The image: `org.opencontainers.image.licenses=LicenseRef-PolyForm-Internal-Use-1.0.0`, `vendor`, `title`, `source`, `documentation` and `url` labels on the `Dockerfile` | S1 | Sonnet | `Dockerfile` |
| S6 | Third-party lines in `NOTICE` and `LICENSING.md` (the Submit half of the plan of record's LU-18): `web/public/lib/qrcode.min.js` (node-qrcode, MIT; its notice restored at the top of the file); the Google "G" logo on `auth/login.html` (Google brand guidelines); the PolicyBee logo (used under the partner arrangement `?partner=35`, not licensed onward); the Lighthouse (Apache-2.0), Playwright and React (Apache-2.0, MIT) and OWASP ZAP reports under `web/public/tests/`; one Crown copyright and Open Government Licence v3.0 line for `web/public/docs/hmrc-form-field-standards/README.md`; the Companies House xsd schemas; the Apache Maven Wrapper; a runtime dependency table from `package.json` with each package's licence read from `node_modules/<name>/package.json` | S1 | Sonnet | `NOTICE`, `LICENSING.md`, `web/public/lib/qrcode.min.js` |
| S7 | The simulator: the deploy workflow runs `scripts/build-simulator.js` before it uploads `web/public-simulator/`, so the stale copy is replaced; verified by the simulator's `accessibility.html` date matching the live one after the next deploy | S2 | Sonnet | `.github/workflows/deploy.yml` (or wherever the simulator upload lives) |
| H-LU-9 | Tell HMRC's SDS team the licence changed, one paragraph (decision 9 in the plan of record: the MTD approval submission and the production-credentials email described the service as AGPL open source) | S2 on main | operator | email |
| LU-15 (Submit's share) | Urgency 3, after the brand package exists (the spreadsheets repository's `PLAN_DIYACCOUNTING_BRAND.md`): pin `@diy-accounting-uk/brand`, copy assets and tokens at build, import the tokens, delete the local logo, favicon and token copies; the footer, favicon and title conventions read from the words file | the brand package existing | Sonnet | `package.json`, build scripts, stylesheets, `web/public/` |

## Verification

- S1: `gh api /repos/diy-accounting-uk/submit.diyaccounting.co.uk --jq .license.spdx_id` answers `NOASSERTION` (GitHub's detector does not know PolyForm), and `LICENSE` is byte-identical to the spreadsheets file.
- S2: `terms.html` and `accessibility.html` on ci contain neither "AGPL" nor "open source"; a grep for "open source", "AGPL" and "Mozilla" across `web/public/`, `README.md`, `_developers/` returns only the annotated HMRC documents and `mcp.html`'s reference to MCP.
- S3: the header test passes in `npm test`; a grep for "DIY Accounting Ltd", "AGPL-3.0" and "2025-2026" returns nothing outside git history and the annotated HMRC documents.
- S4: `openapi.json` on ci has `info.license`, `info.contact` and `termsOfService`.
- S5: `docker inspect` on the built image shows the labels.
- S6: `qrcode.min.js` starts with its MIT notice; `NOTICE` names every item in the S6 list.
- S7: the simulator's `accessibility.html` date matches the live one after the deploy.

## Not in this plan

The engine (Apache-2.0), the spreadsheets and their packages, the sites, the trade mark filings and the brand repository itself are in the plan of record. Submit's `NEXT.md` carries its own product rows; this plan's rows join that board when the operator lifts the pause.
