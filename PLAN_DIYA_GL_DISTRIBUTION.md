<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: diya-gl distribution

**Status**: DIST1 to DIST13 are in section 3. GLX1 is tracked in section 6, not on `NEXT.md`.

## Operator request (verbatim, 2026-11-22)

> "I want to be able to distribute the books file and for it to be easy for users to work with them in the following ways: AI chat assistant using mcp, ci runtime capable of installing packages from common package managers, an engineer prefering containers, a dev happy to npm -g, someone who needs to click an icon in windows or a mac that would start a local server and open a browser tab at a url opening to a local diy-web."

"The books file" is a diya-gl book: `book.toml` and `lines.jsonl`, or the same book as a diya-gl zip or one JSON file. "diy-web" is diya-gl web, the pages at https://diya-gl.co.uk/ (source `web/diya-gl.co.uk/public/` in the spreadsheets repository).

## Rules of this plan

- One engine. Every channel ships the npm tarball that `publish-diya-gl.yml` packs and publishes. A channel that wraps it proves that its copy has the same `dist.integrity` as `npm view @diy-accounting-uk/diya-gl@<version> dist.integrity`.
- The tasks stay in this plan. This plan adds no row to `NEXT.md`.
- Paths without a repository prefix are in `../spreadsheets.diyaccounting.co.uk/`. Read Submit's `.claude/skills/orient-spreadsheets/SKILL.md` before any spreadsheets task.
- The spreadsheets gate is `npm test` (the router `scripts/test-scope.mjs`). Name nothing narrower.

## 1. Current state

Checked on 2026-11-22 at spreadsheets `a02d3449a` and with the published `@diy-accounting-uk/diya-gl` 1.2.98.

### 1.1 The package

`diya-gl/package.json` is `@diy-accounting-uk/diya-gl`, Apache-2.0, Node 24 or later, 4.3 MB unpacked. `diya-gl/scripts/prepack.mjs` copies the engine closure, `app/data` and the two v2 schemas into `dist/`. The package holds no web pages and no workbook templates.

| Command | What it does | Entry under `app/bin/` |
| --- | --- | --- |
| `diya-gl recalc` | Writes `report.json` from a book or a workbook | `report.js` |
| `diya-gl read-workbook` | Workbook, package zip, diya-gl zip or JSON to a book | `export.js` |
| `diya-gl write-workbook` | A book to the Excel package | `write-workbook.js` |
| `diya-gl link` | Prints a `https://diya-gl.co.uk/<product>.html#book=` link | `link.js` |
| `diya-gl new-book` | An empty book for a new business | `new-book.js` |
| `diya-gl roll-forward` | Next year's book; exits 1 when an opening figure disagrees | `roll-forward.js` |
| `diya-gl view` | Serves the pages on 127.0.0.1 and opens the book | `view.js` |
| `diya-gl mcp` | The stdio MCP server, twelve tools (`TOOLS` in `app/lib/mcp/diya-gl-tools.js`) | `diya-gl-mcp.js` |

Each command is also its own bin (`diya-gl-recalc`, ..., `diya-gl-mcp`). `diya-gl/bin/diya-gl.js` dispatches the subcommands. `diya-gl/bin/run-dist-bin.js` starts each entry as a child process of `process.execPath`.

### 1.2 Release

`.github/workflows/publish-diya-gl.yml` runs after each green prod deploy from `main` (called by `deploy.yml`). It:

1. Packs the tarball and runs every bin from it (`diya-gl/smoke.sh`).
2. Publishes to npm with provenance.
3. Sends `diya-gl-published` to `diy-accounting-uk/homebrew-diya-gl`.
4. Builds `diya-gl/Dockerfile` from the packed tarball, runs `diya-gl/image-smoke.sh`, and pushes `ghcr.io/diy-accounting-uk/diya-gl:<version>` and `:latest`.
5. Tags `diya-gl-v<version>`, records the release, and rolls the patch version on `main`.

It makes no GitHub Release, so there is no place for binary assets.

### 1.3 By audience

| Audience | Today | Command the user runs |
| --- | --- | --- |
| AI chat, local | `diya-gl mcp` over stdio, hand-written JSON-RPC (`app/lib/mcp/server.js`, `jsonrpc-stdio.js`) | `claude mcp add diya-gl -- npx -y @diy-accounting-uk/diya-gl@1.2.98 mcp` (proved on 2026-11-22: ten tools listed) |
| AI chat, hosted | Submit's connector: `list_books`, `open_book` on DIYA cloud books (`mcp/lib/hosted-tools.js`) | `claude mcp add --transport http diya-submit https://submit.diyaccounting.co.uk/mcp` |
| CI | npm, the GHCR image, the Homebrew formula | `npx -y @diy-accounting-uk/diya-gl@<v> recalc ...` |
| Containers | `ghcr.io/diy-accounting-uk/diya-gl`, `node:24-alpine`, entrypoint `diya-gl` | `docker run --rm -v "$PWD":/data ghcr.io/diy-accounting-uk/diya-gl:latest recalc ...` |
| npm -g | The package | `npm install -g @diy-accounting-uk/diya-gl` |
| Homebrew | `Formula/diya-gl.rb` in the tap, built from the npm tarball, `depends_on "node"` | `brew install diy-accounting-uk/diya-gl/diya-gl` |
| Desktop, file | One single-file HTML runner per product (`scripts/build-runner.mjs`), on https://diya-gl.co.uk/runners/, about 3.4 MB each | Download, then double-click the `.html` file |
| Desktop, server | `diya-gl view <book>` | A terminal command; no icon |

### 1.4 Gaps

**AI chat.**

- `diya-gl` has no `mcpName` and no `server.json`, so it is not in the official MCP Registry. Submit's `diya-submit` is (`mcp/server.json`, `.github/workflows/publish-mcp-registry.yml`).
- There is no `.mcpb` bundle. A Claude Desktop user without Node has no one-click install.
- `extract_book` reads any file that `readBookSource` reads (workbook, package zip, diya-gl zip, JSON). Its description names only the workbook and the package zip. It refuses a book directory.
- `save_workbook` returns the file as base64. A local client cannot ask it to write the file to disk.
- The server starts with no book. A user cannot start it on one book.
- Submit's `web/public/mcp.html` says the diya-gl server has "Four tools" (line 195). It has twelve. Capability SS-06 also says four.

**CI.**

- `recalc` exits 1 only on an input error. No command exits non-zero when a book fails its schema or a book check.
- No page shows a pinned CI example (GitHub Actions, GitLab CI).
- A runner with no Node and no Docker has no download.

**Containers.**

- The GHCR image is one architecture. The `latest` manifest is a single `manifest.v2`, not an index, so it is `linux/amd64` only. An Apple silicon or Arm host runs it under emulation.
- The image runs as root, so files it writes into a mounted directory belong to root.
- `view` binds 127.0.0.1 only, so it cannot serve from inside a container.
- The image has no `io.modelcontextprotocol.server.name` label, so the registry cannot list it.
- The image carries no SBOM and no build attestation.

**npm -g.** The route works. `view` fetches the pages from https://diya-gl.co.uk on first use, so the first run needs the network.

**Desktop.**

- There is no icon. `view` needs a terminal and a book argument; with no book it prints its usage and exits.
- `view` picks a free port each start. The origin changes each time, so the browser autosave (IndexedDB) does not carry over between starts. A Google or Cognito sign-in cannot register a changing origin.
- The runners open from disk with no server. A `file://` page has no stable origin and no sign-in, and each product is a separate file.
- Nothing is signed for macOS or Windows.

### 1.5 Platform facts that set the design

Checked against vendor documentation on 2026-11-22.

| Fact | Source |
| --- | --- |
| Node single executable applications are "Stability 1.1, active development". `node --build-sea` exists from 25.5.0. `mainFormat: "module"` takes an ES module entry. `assets` embeds files, read with `node:sea` `getAsset`. CI tests Windows, macOS arm64 and Linux (not Alpine). macOS x64 is not tested. | https://nodejs.org/api/single-executable-applications.html |
| An unsigned app that a browser downloaded does not open on current macOS. The user goes to System Settings, Privacy & Security, "Open Anyway", and types the login password. | https://support.apple.com/en-gb/guide/mac-help/mh40616/mac |
| A Developer ID certificate and notarization need the Apple Developer Program, USD 99 a year, charged in pounds at enrolment. | https://developer.apple.com/programs/ |
| Homebrew disables casks in `homebrew/cask` that fail its Gatekeeper checks (from September 2026). `--no-quarantine` is removed. | https://brew.sh/2025/11/12/homebrew-5.0.0, https://docs.brew.sh/Acceptable-Casks |
| An unsigned Windows download shows "Windows protected your PC". The user clicks "More info", then "Run anyway". An enterprise policy can stop it. EV certificates no longer skip the warning. A signed file shows the publisher name and builds reputation over time. | https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation |
| Smart App Control, when on, blocks an unsigned executable. It has no per-app override. | Same page; https://support.microsoft.com/en-us/topic/what-is-smart-app-control-285ea03d-fa88-4d56-882e-6698afdb7003 |
| Microsoft Artifact Signing (formerly Trusted Signing): Basic is USD 9.99 a month, needs a paid Azure subscription, and takes organisations in the United Kingdom. Identity validation takes 1 to 30 business days. | https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart, https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation |
| Microsoft Store: an app from the Store shows no SmartScreen warning, because Microsoft signs it. Company developer accounts have no fee from May 2026. | https://blogs.windows.com/windowsdeveloper/2026/05/07/publish-to-microsoft-store-as-a-company-now-with-free-registration-and-faster-onboarding/ |
| MCP Registry package types: `npm` (needs `mcpName` in `package.json`), `oci` (needs the `io.modelcontextprotocol.server.name` label; `ghcr.io` is allowed), `mcpb` (a GitHub release asset with `fileSha256`; the URL contains "mcp"). | https://github.com/modelcontextprotocol/registry/tree/main/docs |
| The Claude directory takes no new `.mcpb` listings. A `.mcpb` file still installs into Claude Desktop with a double-click. A local server reaches the directory inside a plugin. | https://claude.com/docs/connectors/building/mcpb |

## 2. Design

### 2.1 One engine, one release

`publish-diya-gl.yml` stays the only release. It gains a GitHub Release named `diya-gl-v<version>` on the tag it already makes. Every artifact below attaches to that release with a `SHA256SUMS` file and a GitHub build attestation (`actions/attest-build-provenance`). Each wrapper carries the packed tarball unchanged and proves its integrity against npm.

| Artifact | Built from | Where |
| --- | --- | --- |
| npm package | `diya-gl/` | npm |
| Container image, `linux/amd64` and `linux/arm64` | The tarball | GHCR |
| Pages snapshot `diya-gl-web-<version>.zip` | `web/diya-gl.co.uk/public/` after `build:diya-gl-bundle` | Release asset |
| MCP bundle `diya-gl-mcp-<version>.mcpb` | The tarball | Release asset; MCP Registry |
| Desktop apps and CLI binaries | Node SEA launcher + the tarball + the pages snapshot | Release assets; later the Store and a cask |
| Homebrew formula | The npm tarball | The tap |

### 2.2 The local server for the desktop

`diya-gl view` becomes the desktop server. The desktop app and the `shortcut` command both start it the same way:

- With no book, it opens `/` (the start page). With a book, it opens the book as it does today.
- `--pages <dir|zip>` serves a local pages snapshot. Without it, the server fetches from https://diya-gl.co.uk and caches, as today.
- `--port` keeps its free-port default for the CLI. The desktop start passes one fixed port, set in one constant. A fixed port gives a stable origin, so the autosave carries over and a sign-in origin can be registered.
- `GET /_local/ping` answers `{ name: "diya-gl", version }`. A second start that finds its own server on the fixed port opens a new tab there and exits.
- `POST /_local/stop` stops the server. It needs the token the server prints at start. `--idle-exit <minutes>` stops the server after that time with no request.
- The server refuses a request whose `Host` header is not `127.0.0.1:<port>` or `localhost:<port>`. This stops DNS rebinding.
- `--host <address>` binds another address, for a container. The server prints a warning when the address is not a loopback address.

The pages do not change. Which stores and sign-ins the pages offer on a local origin belongs to GLX1.

### 2.3 The icon, two routes

**Route A, free: `diya-gl shortcut`.** A user who installed the CLI (npm, Homebrew or a CLI binary) runs `diya-gl shortcut` once. It writes an icon that starts `diya-gl view` on the fixed port:

- macOS: `~/Applications/DIYA-GL.app`, a small bundle with a script that runs the installed `diya-gl`.
- Windows: a Start menu and a desktop shortcut (`.lnk`) to the installed Node and `diya-gl`.
- Linux: `~/.local/share/applications/diya-gl.desktop`.

These files are made on the user's machine. They carry no download quarantine and no Mark of the Web, so Gatekeeper and SmartScreen do not assess them. Node itself is signed by its publisher. `diya-gl shortcut --remove` removes them.

**Route B, a download: the desktop app.** A user with no terminal downloads one file:

- macOS (Apple silicon): `DIYA-GL.app` in a `.dmg`. The app is a Node SEA launcher that holds the tarball and the pages snapshot as assets. It is an agent app (`LSUIElement`), so it shows no Dock icon. The page shows the stop control from `/_local/`.
- Windows (x64 and arm64): `DIYA-GL.exe`, a SEA launcher with the Windows GUI subsystem, so no console window opens. It ships unsigned in a `.zip` (Q2). DIST11 adds a Store MSIX.

At first start the launcher writes the tarball and the snapshot into a folder per version (`~/Library/Application Support/diya-gl/<version>` or `%LOCALAPPDATA%\diya-gl\<version>`). Then it loads `dist/app/bin/view.js` from there in the same process. `run-dist-bin.js` starts entries with `process.execPath`, which is the launcher in a SEA, so the launcher also takes a first argument that names a file inside its folder and loads that file. Every CLI command then works from the same binary, so Linux x64 and arm64 get CLI binaries from the same build for CI.

**What a user sees without a signature.**

| Platform | Unsigned download | Signed |
| --- | --- | --- |
| macOS | "Not Opened". The user opens System Settings, Privacy & Security, clicks "Open Anyway" and types the password, once | Opens; Developer ID and notarization |
| Windows | "Windows protected your PC", "More info", "Run anyway". Smart App Control blocks it with no override | Publisher name shown; warnings stop as reputation builds; a Store install shows none |

Route A costs nothing and needs one terminal command. Route B ships unsigned first (Q1, Q2), with the unsigned steps in the table above. DIST10 adds the signatures.

Intel Macs use Route A until the SEA build covers macOS x64.

### 2.4 AI chat

- **Registry.** `diya-gl/server.json` names `io.github.diy-accounting-uk/diya-gl` with three packages: `npm` (stdio, argument `mcp`), `oci` (the GHCR image, `docker run -i --rm`, argument `mcp`) and `mcpb`. `mcpName` goes into `diya-gl/package.json`. A workflow in the spreadsheets repository validates and publishes it, copied from Submit's `publish-mcp-registry.yml`.
- **One-click.** The `.mcpb` bundle holds the tarball installed under `server/`, a `manifest.json` with Node as the server type, and one user setting: the books folder. Claude Desktop runs it with its own Node.
- **Tools.** `diya-gl mcp --book <path>` starts with a book loaded. `--write-dir <dir>` names where `save_workbook` may write. `extract_book` reads a book directory too, and its description names every format it reads. `save_workbook` takes an optional `outputPath` inside the write directory and refuses to overwrite unless `overwrite` is true.
- **Hosted.** A client that takes only a remote server uses Submit's hosted connector. This plan changes nothing in it.

Config lines that the docs give, one per client type:

```
claude mcp add diya-gl -- npx -y @diy-accounting-uk/diya-gl@<version> mcp
docker run -i --rm -v "$PWD":/data ghcr.io/diy-accounting-uk/diya-gl:<version> mcp --write-dir /data
```

```json
{ "mcpServers": { "diya-gl": { "command": "npx", "args": ["-y", "@diy-accounting-uk/diya-gl@<version>", "mcp"] } } }
```

### 2.5 CI

| Manager | Fit | Decision |
| --- | --- | --- |
| npm (`npx -y pkg@version`) | Every hosted runner has Node; pinned by version; provenance on npm | Primary |
| Container | Pinned by digest; no Node needed; works in any CI that runs containers | Second; multi-arch |
| Homebrew | macOS runners; slow on Linux | Keep; no new work |
| CLI binary from the release | A runner with no Node and no Docker; `curl` and `sha256sum` | From the desktop build, Linux x64 and arm64 |
| PyPI or apt wrapper | A wheel or a `.deb` would ship Node inside another ecosystem; an apt repository needs hosting and a signing key | Not planned; the CLI binary covers the same runners |

A new `diya-gl check <book>` gives CI an exit code: 0 when the book passes its schema and every book check, 1 when one fails, 2 on an input error. `--json` writes the results to stdout. It reports what `validateBook`, `validateLines` and the book checks find. GLS17 later adds rules to those validators, and `check` reports them with no change.

### 2.6 Containers

- Base `node:24-alpine`, the tarball installed globally, as today. `USER node`, `WORKDIR /data`.
- `linux/amd64` and `linux/arm64`, built with `docker buildx` and pushed as one index. Each architecture runs `image-smoke.sh`.
- Labels: the OCI labels of today plus `io.modelcontextprotocol.server.name`.
- SBOM and provenance attestations on push.
- The pages snapshot inside the image at `/opt/diya-gl-web` (Q3, answered 2026-11-23), so `view --pages` works offline.
- How the book is mounted:

```
docker run --rm -v "$PWD":/data ghcr.io/diy-accounting-uk/diya-gl:<version> check /data/my-book
docker run --rm -p 127.0.0.1:4747:4747 -v "$PWD":/data ghcr.io/diy-accounting-uk/diya-gl:<version> view /data/my-book --host 0.0.0.0 --port 4747 --no-open
```

The port in the second line is an example. DIST1 sets the constant.

### 2.7 How this plan relates to other work

| Work | Relation |
| --- | --- |
| GLX1 (section 6) | GLX1 designs the pages, the account and the storage. This plan delivers the same pages to a local origin and changes none of them. GLX1 decides which stores and sign-ins the pages offer on `http://127.0.0.1:<fixed port>`; DIST1 makes the origin fixed so that choice is possible. Download links on diya-gl.co.uk wait for GLX1's design. |
| `PLAN_AMENDED_ACCOUNTS.md` section 11, AA26 | `buildBookFromRegister` lands in the engine. Every channel carries it on the next release with no task here. |
| AA27 | Adds the package download to the pages. The desktop app gets it with the next pages snapshot. Offline use needs the templates in the snapshot (Q3 bundles them). |
| `PLAN_DIYA_GL_STANDARDS.md` GLS4, GLS17 | GLS4 adds an MCP tool; every MCP channel carries it. GLS17 adds rejecting rules; `diya-gl check` reports them. |
| `PLAN_ORGANIC_SEARCH.md` | Its Claude directory rows cover Submit's plugin. Q4 decides whether a local diya-gl server joins a plugin. |

## 3. Tasks

### 3.1 Task table

| Task | One line | Repository | Model | Size |
| --- | --- | --- | --- | --- |
| DIST1 | `view` as the desktop server | spreadsheets | Sonnet | ~4 files |
| DIST2 | GitHub Release and the pages snapshot | spreadsheets | Sonnet | ~4 files |
| DIST3 | `diya-gl shortcut` (Route A) | spreadsheets | Sonnet | ~7 files |
| DIST4 | `diya-gl check` and the CI docs | spreadsheets | Sonnet | ~6 files |
| DIST5 | Multi-arch, non-root, attested image | spreadsheets | Sonnet | ~5 files |
| DIST6 | MCP server: `--book`, `--write-dir`, file output | spreadsheets | Sonnet | ~5 files |
| DIST7 | diya-gl in the MCP Registry | spreadsheets | Sonnet | ~5 files |
| DIST8 | The `.mcpb` bundle | spreadsheets | Sonnet | ~5 files |
| DIST9 | SEA desktop apps and CLI binaries, unsigned | spreadsheets | Opus | ~7 files |
| DIST10 | Sign the macOS and Windows apps | spreadsheets | Sonnet | ~4 files |
| DIST11 | Windows Store MSIX | spreadsheets | Sonnet | ~4 files |
| DIST12 | Homebrew cask for the signed app | homebrew-diya-gl | Sonnet | ~3 files |
| DIST13 | Docs: Submit's MCP page and the capability entries | submit, spreadsheets | Sonnet | ~5 files |

### 3.2 Order

| Task | Follows |
| --- | --- |
| DIST1, DIST4, DIST6 | Nothing |
| DIST2 | Nothing |
| DIST3 | DIST1, DIST4 (both edit `diya-gl/bin/diya-gl.js` and `diya-gl/package.json`) |
| DIST5 | DIST1, DIST2 (the snapshot the image bundles) |
| DIST7 | DIST5, then one npm release that carries `mcpName` |
| DIST8 | DIST2, DIST6, DIST7 |
| DIST9 | DIST1, DIST2 |
| DIST10 | DIST9, the operator's go on the signing costs |
| DIST11 | DIST10 |
| DIST12 | DIST10 |
| DIST13 | DIST3, DIST4, DIST6, DIST7, DIST8 |

Every task edits a section of `diya-gl/README.md`. Merge the tasks in order on one batch branch.

### 3.3 Briefs

#### DIST1. `view` as the desktop server

- **Files**: `app/bin/view.js`, `app/lib/diya-gl-view-server.js`, `app/test/diya-gl-view.test.js`, `diya-gl/README.md`.
- **Do**: section 2.2, each bullet. A book argument becomes optional. Add `--pages <dir|zip>` (serve from it; a zip is read in memory with `jszip`, which the package already depends on), `--host`, `--idle-exit <minutes>`, `--desktop` (the fixed port constant, `--idle-exit` 480, and the second-start rule). Add `/_local/ping`, `/_local/stop` with the start token, and a `/_local/` page with a stop button. Check the `Host` header on every request. Keep the free-port default and every current behaviour without the new flags.
- **Tests**: a start with no book serves `/`; `--pages` serves a file from a directory and from a zip with no network; a second `--desktop` start finds the first and exits 0; `/_local/stop` without the token is 403; a request with `Host: evil.example` is 421; `--idle-exit` stops the server.
- **Gates**: `npm test`; `diya-gl/smoke.sh target/diya-gl-smoke`.

#### DIST2. GitHub Release and the pages snapshot

- **Files**: `scripts/build-diya-gl-web-snapshot.mjs`, `.github/workflows/publish-diya-gl.yml`, `app/test/diya-gl-web-snapshot.test.js`, `diya-gl/README.md`.
- **Do**: the script runs after `scripts/build-diya-gl-bundle.mjs` and zips `web/diya-gl.co.uk/public/` with a `snapshot.json` (version, commit, SHA-256 of each file). `assets/templates/` goes in (Q3). Leave out `sw.js`, because the view server answers it 404. In the workflow, create the GitHub Release `diya-gl-v<version>` on the tag step (`gh release create --verify-tag`), attach the snapshot, `SHA256SUMS` and an attestation. Keep the existing re-dispatch rule: each step keys on what the registry and the release already hold.
- **Tests**: the snapshot's version equals `diya-gl/package.json`; every file in `snapshot.json` is in the zip with its hash; DIST1's `--pages <zip>` serves `ltd.html` from it.
- **Gates**: `npm test`; a `workflow_dispatch` run of `publish-diya-gl.yml` on the batch branch is not allowed, because the workflow publishes. The PR's `test.yml` run builds the snapshot.

#### DIST3. `diya-gl shortcut` (Route A)

- **Files**: `app/bin/shortcut.js`, `app/lib/desktop-shortcut.js`, `diya-gl/bin/diya-gl-shortcut.js`, `diya-gl/bin/diya-gl.js`, `diya-gl/package.json` (`bin`), `app/test/desktop-shortcut.test.js`, `diya-gl/README.md`.
- **Do**: section 2.3, Route A. The icon runs the installed `diya-gl view --desktop`. Write the macOS bundle (`Info.plist` with `LSUIElement`, an `.icns` built from the DIYA-GL icon at pack time), the Windows `.lnk` through PowerShell `WScript.Shell`, and the Linux `.desktop` file. `--remove` deletes exactly what the command wrote. `diya-gl/scripts/engine-closure.mjs` must reach the new entry; run `diya-gl/scripts/prepack.mjs` to prove it.
- **Tests**: unit tests of the file contents for each platform; `--remove` leaves nothing; on this Mac with `HOME` set to a scratch folder, `plutil -lint` passes on the `Info.plist`.
- **Gates**: `npm test`; `diya-gl/smoke.sh target/diya-gl-smoke`.

#### DIST4. `diya-gl check` and the CI docs

- **Files**: `app/bin/check.js`, `diya-gl/bin/diya-gl-check.js`, `diya-gl/bin/diya-gl.js`, `diya-gl/package.json` (`bin`), `app/test/diya-gl-check.test.js`, `diya-gl/README.md`.
- **Do**: section 2.5. Take the same book sources as `link`. Exit codes 0, 1 and 2. `--json` prints `{ version, product, schema: { valid, errors }, checks: [...] }`. Add a README section "Use in CI" with a GitHub Actions job and a GitLab CI job, each pinned to a version, one with `npx`, one with the image by digest.
- **Tests**: every example under `examples/` exits 0; a book with one line made unbalanced or a schema field removed exits 1 and names it; a missing path exits 2.
- **Gates**: `npm test`; `diya-gl/smoke.sh target/diya-gl-smoke`.

#### DIST5. Multi-arch, non-root, attested image

- **Files**: `diya-gl/Dockerfile`, `diya-gl/image-smoke.sh`, `.github/workflows/publish-diya-gl.yml`, `.github/workflows/test.yml` (its image build near line 687), `diya-gl/README.md`.
- **Do**: section 2.6. Use `docker/setup-qemu-action`, `docker/setup-buildx-action` and `docker/build-push-action` pinned by commit, as the repository pins its other actions. Push one index for `linux/amd64,linux/arm64` with `provenance: mode=max` and `sbom: true`. Add `USER node`, `WORKDIR /data`, and the `io.modelcontextprotocol.server.name` label `io.github.diy-accounting-uk/diya-gl`. `image-smoke.sh` runs once per architecture (`--platform`) and also runs `view --host 0.0.0.0 --no-open` and fetches `/_local/ping` through a published port. Copy DIST2's pages snapshot to `/opt/diya-gl-web` (Q3: bundle). The image build in `.github/workflows/test.yml` is the `docker build` step at line 687, with `image-smoke.sh` after it.
- **Tests**: `image-smoke.sh` for both architectures; a file the image writes into a mounted directory belongs to the `--user` given.
- **Gates**: `npm test`; local `docker buildx build --platform linux/amd64,linux/arm64` with `--load` per platform and `image-smoke.sh` on each. No push.

#### DIST6. MCP server: `--book`, `--write-dir`, file output

- **Files**: `app/bin/diya-gl-mcp.js`, `app/lib/mcp/server.js`, `app/lib/mcp/diya-gl-tools.js`, `app/test/diya-gl-mcp.test.js`, `diya-gl/README.md`.
- **Do**: section 2.4, the Tools bullet. `--book` loads through the same path as `extract_book`. `extract_book` takes a directory holding `book.toml` and `lines.jsonl`. `save_workbook` with `outputPath` writes the file and returns its path and size, not base64. A path outside `--write-dir` (default: the loaded book's folder, else the working directory) is refused by name. Correct the `extract_book` description and the method-table comments that list fewer tools.
- **Tests**: the server started with `--book examples/basic-taxi-driver` answers `report` with no `extract_book` call; `outputPath` outside the write directory is refused; an existing file is refused without `overwrite`.
- **Gates**: `npm test`; `diya-gl/smoke.sh target/diya-gl-smoke`.

#### DIST7. diya-gl in the MCP Registry

- **Files**: `diya-gl/package.json` (`mcpName`), `diya-gl/server.json`, `.github/workflows/publish-mcp-registry.yml` (new in the spreadsheets repository), `.github/workflows/publish-diya-gl.yml` (the version roll also rolls `server.json`), `app/test/diya-gl-server-json.test.js`.
- **Do**: section 2.4, the Registry bullet. Copy Submit's `.github/workflows/publish-mcp-registry.yml` and `mcp/test/server-json.test.js` (Submit repository) and keep their pinning and Sigstore check of `mcp-publisher`. The `npm` package entry passes the positional argument `mcp`; the `oci` entry gives `-i --rm` as runtime arguments and `mcp` as the package argument. The `mcpb` entry waits for DIST8. The apply dispatch runs only after an npm release that carries `mcpName`.
- **Tests**: `server.json` validates against the schema it names; its version equals `diya-gl/package.json`; `mcpName` equals its `name`.
- **Gates**: `npm test`; the push's `publish-mcp-registry.yml` validate run.

#### DIST8. The `.mcpb` bundle

- **Files**: `diya-gl/mcpb/manifest.json`, `scripts/build-mcpb.mjs`, `.github/workflows/publish-diya-gl.yml`, `diya-gl/server.json`, `app/test/diya-gl-mcpb.test.js`.
- **Do**: section 2.4, the One-click bullet. Read the current manifest specification at https://github.com/modelcontextprotocol/mcpb before you write the manifest, and use its current `manifest_version`. Install the packed tarball into `server/` with `npm install --omit=dev`. The entry point is that install's `bin/diya-gl-mcp.js`, with `--write-dir ${user_config.books_folder}`. Validate and pack with the `@anthropic-ai/mcpb` CLI pinned by version. Attach `diya-gl-mcp-<version>.mcpb` to the release, and add the `mcpb` package entry with its `fileSha256` to `server.json`.
- **Tests**: the built bundle unzips to a tree whose `server/node_modules/@diy-accounting-uk/diya-gl/package.json` version equals the release; the server inside it answers `tools/list` with the tools `TOOLS` lists (twelve today) over stdio.
- **Gates**: `npm test`; one local install into Claude Desktop on this Mac, with the result recorded in the PR body.

#### DIST9. SEA desktop apps and CLI binaries, unsigned

- **Files**: `diya-gl/launcher/launcher.mjs`, `diya-gl/launcher/sea-config.json`, `scripts/build-desktop.mjs`, `diya-gl/launcher/Info.plist`, `.github/workflows/publish-diya-gl.yml` (a matrix job), `app/test/desktop-launcher.test.js`, `diya-gl/README.md`.
- **Do**: section 2.3, Route B. Build with the Node LTS release that has `--build-sea` (25.5.0 or later; check the release schedule and use the current even-numbered LTS). Embed the packed tarball and the pages snapshot as SEA assets. First prove, in a spike committed as a test, that the launcher loads a file from its extracted folder with `import()`. If it cannot, ship the official Node binary beside the extracted package and make the launcher a script, and record the reason in the PR body. On Windows, set the PE subsystem to GUI before any signature. On macOS, ad-hoc sign (`codesign --sign -`) as the SEA documentation requires. Build on native runners: `macos-latest` (arm64), `windows-latest` (x64), `windows-11-arm`, `ubuntu-24.04`, `ubuntu-24.04-arm`. Attach the `.dmg`, the Windows `.zip` files, the Linux binaries, `SHA256SUMS` and attestations to the release. The apps are unsigned (Q1, Q2): `diya-gl/README.md` and the release notes give each platform's first-open steps from section 2.3's table.
- **Tests**: each built binary runs `--version`; each desktop build starts with `--no-open`, answers `/_local/ping` and serves `ltd.html` with the network blocked; the embedded tarball's integrity equals `npm view @diy-accounting-uk/diya-gl@<version> dist.integrity`.
- **Gates**: `npm test`; the matrix job on the PR in build-only mode (no release step on a branch).

#### DIST10. Sign the macOS and Windows apps

- **Files**: `scripts/build-desktop.mjs`, `diya-gl/launcher/entitlements.plist`, `.github/workflows/publish-diya-gl.yml`, `diya-gl/README.md`.
- **Blocked on**: the operator's go on the signing costs. The first release ships unsigned (Q1, Q2, answered 2026-11-23). The costs: the Apple Developer Program, USD 99 a year (about £79); Microsoft Artifact Signing, USD 9.99 a month (about £95 a year), or the Microsoft Store at £0 (DIST11).
- **Operator steps first**: enrol DIY Accounting Limited in the Apple Developer Program (D-U-N-S 211569182); make a Developer ID Application certificate and an App Store Connect API key for `notarytool`; for a direct Windows download, create the Artifact Signing account and the organisation identity validation (1 to 30 business days); store each as a GitHub secret. DIST10's sub-agent writes the step list with exact URLs before it starts.
- **Do**: macOS: sign with the hardened runtime and the entitlements Node needs (`com.apple.security.cs.allow-jit`, `com.apple.security.cs.allow-unsigned-executable-memory`), submit with `xcrun notarytool submit --wait`, then `xcrun stapler staple` the `.dmg`. Windows: sign each `.exe` with `azure/artifact-signing-action`, authenticated by GitHub OIDC with a federated credential.
- **Tests**: `spctl --assess --type execute` and `codesign --verify --deep --strict` pass on the app; `signtool verify /pa` passes on each `.exe`.
- **Gates**: `npm test`; the matrix job with signing on a dispatch from `main`.

#### DIST11. Windows Store MSIX

- **Files**: `diya-gl/launcher/AppxManifest.xml`, `scripts/build-msix.mjs`, `.github/workflows/publish-diya-gl.yml`, `diya-gl/README.md`.
- **Operator steps first**: register the company developer account in Partner Center and reserve the app name "DIYA-GL".
- **Do**: package the DIST9 Windows launcher as a full-trust MSIX with a Start menu tile, for x64 and arm64. Upload the first submission by hand and record the certification result in the PR body. The Store signs the package. A Store app is also installable with `winget install --source msstore`.
- **Tests**: `MakeAppx pack` succeeds and the Windows App Certification Kit passes on the runner.
- **Gates**: `npm test`; the workflow job on a dispatch.

#### DIST12. Homebrew cask for the signed app

- **Repository**: `diy-accounting-uk/homebrew-diya-gl`. Clone it into the session scratchpad, not into the workspace.
- **Files**: `Casks/diya-gl-desktop.rb`, `scripts/update-formula.sh`, `.github/workflows/update-formula.yml`.
- **Do**: a cask that installs the notarized `DIYA-GL.app` from the release `.dmg` with its SHA-256. The update script reads the release's `SHA256SUMS`. The workflow installs and audits the cask on `macos-latest`. Add a caveat to the formula that names `diya-gl shortcut`.
- **Tests**: `brew audit --cask` and `brew install --cask` in the workflow.
- **Gates**: the tap's `update-formula.yml` run on the PR.

#### DIST13. Docs: Submit's MCP page and the capability entries

- **Repository**: submit, and spreadsheets for its capability comments.
- **Files**: `web/public/mcp.html` (submit), `REPORT_CAPABILITIES.md` (submit, through the `capabilities` skill), the `@capability` blocks for SS-05, SS-06 and SS-20 at their source.
- **Do**: correct "Four tools" to the tools the server lists, and list them. Give the config lines of section 2.4, the `.mcpb` download and the registry name. Add entries for `check`, `shortcut`, the release assets and the desktop apps. Follow `.claude/skills/plain-prose/SKILL.md`.
- **Tests**: Submit's tests over `mcp.html` pass.
- **Gates**: `npm test` in each repository.

## 4. Horizons

- macOS x64 for the SEA build. Until it is tested there, Intel Macs use Route A.
- A file type of its own for a book (for example `.diyagl`), so a double-click on a book opens the desktop app. A macOS app receives an opened file as an Apple Event, which a SEA launcher does not read, so it needs a small native launcher. Q5.
- A Linux desktop download (AppImage or Flatpak). Route A covers Linux today.

## 5. Questions for the operator

**Q1. Sign and notarize the macOS app.**
Answered 2026-11-23: ship the app unsigned in the first release. Signing both apps is DIST10, which waits for the operator's go on the costs below.
Recommendation: yes. The Apple Developer Program for DIY Accounting Limited costs USD 99 a year, about £79 a year, charged in pounds at enrolment. Enrolment as an organisation uses the company's D-U-N-S number, 211569182. It buys a Developer ID certificate and notarization: the app opens with a double-click, and a Homebrew cask can carry it (DIST12).
Alternative A, £0: ship the app unsigned. Each user goes to System Settings, Privacy & Security, "Open Anyway", and types the password, once. No cask.
Alternative B, £0: no macOS download. Mac users use `diya-gl shortcut` (Route A) after a `brew` or `npm` install.

**Q2. How to ship the Windows app.**
Answered 2026-11-23: an unsigned `.zip` (Alternative B) in the first release. Microsoft signing (the Store or Artifact Signing) is DIST10 and DIST11.
Recommendation: the Microsoft Store first, £0. The company developer account has no fee from May 2026. The Store signs the MSIX, so the user sees no SmartScreen warning, and `winget` installs it. Certification of a launcher that opens the browser is not proven; DIST11 submits once and records the result.
Alternative A: Artifact Signing for a direct `.zip` download as well, USD 9.99 a month, about £8 a month or £95 a year, plus a pay-as-you-go Azure subscription with no fixed fee. It buys a signature with the company name for downloads outside the Store and for a Store refusal. Identity validation takes 1 to 30 business days.
Alternative B, £0: an unsigned `.zip`. The user clicks "More info", then "Run anyway". Smart App Control blocks it with no override.
Alternative C: a code signing certificate from a certificate authority. It needs a hardware or cloud key store and a quote; no price was checked for this plan.

**Q3. Bundle the pages and the templates in the desktop app and the image, or fetch them on first use.**
Answered 2026-11-23: the operator chose to bundle both (about 11 MB more per download), so the app works offline from the first start.
Recommendation: bundle both, £0. The app and the image work offline from the first start, and the pages match the engine version. It adds about 11 MB to each download (pages and engine 2 MB, assets with the templates 9 MB). The pages and templates are under PolyForm Internal Use; the npm package stays Apache-2.0 and unchanged.
Alternative, £0: bundle nothing. `view` fetches from https://diya-gl.co.uk on first use as today; the first start needs the network, and the version shown is the site's, not the engine's.

**Q4. A Claude plugin for the local diya-gl server.**
Recommendation: no plugin now, £0. The registry, the `.mcpb` file and `claude mcp add` cover the local server. Revisit after the Claude directory review of Submit's `diya-submit` plugin ends.
Alternative A, £0: add the diya-gl server to the `diya-submit` plugin (`plugins/diya-submit/.mcp.json` in Submit), so one install gives the hosted connector and local books. It changes what the directory reviews.
Alternative B, £0: a second plugin `diya-gl` in its own public repository.

**Q5. A file type for a book.**
Recommendation: not now, £0. The desktop app opens books from the page's own file dialog and by drag and drop. Decide after GLX1 sets the storage design.
Alternative, £0 in fees: a `.diyagl` extension (a diya-gl zip with its own name), registered by the Windows app and the macOS app, so a double-click on a book opens it. It changes the format specification and needs a native macOS launcher.

## 6. GLX1, moved from `NEXT.md`

GLX1 is tracked here, not on `NEXT.md`. It designs the accessible experience from diya-gl web; DIST1 to DIST13 deliver the same pages to other places.

| Label | Class | State | Blocked by | Unblocks | Repository |
| --- | --- | --- | --- | --- | --- |
| GLX1 | machine-ask | ready | nothing (rounds with the operator) | `PLAN_DIYA_GL_PRODUCT.md` and its tasks | submit (plan), spreadsheets (read) |

### GLX1. Design an accessible accounting experience from diya-gl web, then plan the product

Run the `frontend-design:frontend-design` and `ui-ux-pro-max` skills over https://diya-gl.co.uk/ (source: `web/diya-gl.co.uk/public/` in the spreadsheets repository; the Ltd, sole trader and taxi pages, the shell, autosave and the engine bundle) and design an accounting experience that feels approachable to a small business owner with no accounting training, for the regular operations they do: record income and spending, bank lines and reconciliation, VAT periods and the hand-off to Submit's VAT return, the year end and the accounts, and what is due next (the due list, `PLAN_DUE_LIST.md`). It works on a phone and on a desktop, keeps the book in the browser as diya-gl does today, and meets WCAG 2.2 AA. From any point in the book where Submit supports the step, the experience jumps into the applicable Submit form with the book's figures carried across (today the VAT return, micro-entity and small company accounts and the confirmation statement; Income Tax and the CT600 when their forms are on prod; the books card `web/public/widgets/books-import.js` already fills forms from a book, and the app's hand-off to Submit is `web/diya-gl.co.uk/public/submit-handoff.js`), and deep links to what is due or already filed for the business: Submit's receipts and filings pages, the VAT obligations page, CL1's company addresses (`/companies-house/company/<CRN>/...`) and the due list (DUE6, `PLAN_DUE_LIST.md`). The book travels in the link's fragment or a file, never through a server. Organise storage and the account, which the operator finds confusing as built: today a book can live in five places with different rules, the browser's IndexedDB autosave (`web/diya-gl.co.uk/public/autosave.js`, one working book, never leaves the browser), a downloaded file (zip, JSON or the spreadsheet package), Google Drive (`drive.js`, free, no Submit sign-in, the `drive.file` scope), the DIYA-GL account (`cloud.js`, Submit's Cognito pool and the `/api/v1/books` routes, the `diya-gl-storage` activity in `resident-pro`, sandbox only), and a book link's fragment. Design one account place that shows every book and each saved version across all of these stores together, with where each version lives, when it was saved and which is newest; and that states plainly what this user can do now, in storage (which stores are free, which need a sign-in, which need a bundle and which bundle) and in submission (which Submit filings their bundles allow, with the upsell for the rest), from Submit's own catalogue and the signed-in user's bundles. Sign-in is one: the Submit account. Review the design options the way the operator's earlier design reviews did: read the three artifacts with the Artifact tool's read action, https://claude.ai/artifact/AavzwfvwYhekZ5nftZWxfP, https://claude.ai/artifact/EBioLARrzjdK1kmWP3EbdV and https://claude.ai/artifact/PVght1ZtKa5ipBCfiULQhe (a sequence of option rounds, each narrowing the last; the three are among the operator's artifacts and show the format, and their subject is another project), and publish this review the same way as a private artifact: options for the main journeys at phone and desktop width, each judged against the same criteria, rounds until one direction is chosen with the operator. Output: the published review, then `PLAN_DIYA_GL_PRODUCT.md` at this root (the chosen direction, the journeys, the screens, what stays from today's app, what changes in the engine or the package, the link to Submit's filing, and one task per screen or shared part with its brief, model and size), then `/plan-review-loop` and `/refine` board its tasks. The rounds with the operator make it machine-ask. **Source**: operator, 2026-11-22. **Owner**: Claude Code (design, review, plan), Operator (chooses between options). **Model**: Opus. **Size**: 1 file plus the artifact. **Repository**: submit (plan), spreadsheets (read). **Class**: machine-ask. **State**: ready. **Blocked by**: nothing (rounds with the operator). **Unblocks**: `PLAN_DIYA_GL_PRODUCT.md` and its tasks.

