#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/collabora-sheet-host.js
//
// Serves a downloadable spreadsheet package's workbook to Collabora Online (CODE, LibreOffice in
// the browser) so a scene script can record the real workbook being filled in. It:
//   1. fetches the package zip from the public spreadsheets site (or takes --file),
//   2. starts the collabora/code container and waits for its discovery document,
//   3. serves a minimal WOPI host: every page load opens a fresh, pristine copy under a new file id,
//      and saves Collabora sends back are written beside the workbook and never served again,
//   4. prints "collabora sheet host ready" once a browser can open the start page.
// The start page posts the WOPI form, so a Playwright goto("/") lands on the editor itself, with
// no iframe between the capture and the canvas. The container stops when this process does.
//
// Usage:
//   node scripts/collabora-sheet-host.js --package "GB Accounts Basic Sole Trader 2027-04-05 (Apr27) Excel 2007"
//   node scripts/collabora-sheet-host.js --file path/to/workbook.xlsx
// Options: --port 8099 (WOPI host and start page), --cool-port 9980, --image collabora/code:latest

import http from "http";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn, execFileSync } from "child_process";

const SPREADSHEETS_ZIPS = "https://spreadsheets.diyaccounting.co.uk/zips/";
const CONTAINER = "video-collabora";

function parseArgs(argv) {
  const args = { port: 8099, coolPort: 9980, image: "collabora/code:latest" };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i];
    if (argv[i] === "--package") args.packageName = next();
    else if (argv[i] === "--file") args.file = next();
    else if (argv[i] === "--port") args.port = Number(next());
    else if (argv[i] === "--cool-port") args.coolPort = Number(next());
    else if (argv[i] === "--image") args.image = next();
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (!args.packageName === !args.file) throw new Error("give exactly one of --package <name> or --file <xlsx>");
  return args;
}

async function workbookFromPackage(packageName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "collabora-sheet-"));
  const zipPath = path.join(dir, "package.zip");
  const url = SPREADSHEETS_ZIPS + encodeURIComponent(`${packageName}.zip`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} answered ${response.status}`);
  fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
  execFileSync("unzip", ["-q", "-o", zipPath, "-d", dir]);
  const xlsx = fs.readdirSync(dir, { recursive: true }).find((name) => String(name).endsWith(".xlsx"));
  if (!xlsx) throw new Error(`${url} holds no .xlsx`);
  return path.join(dir, String(xlsx));
}

// The container reaches this host by host.docker.internal: Docker Desktop defines it, and the
// --add-host mapping defines it on a Linux runner. aliasgroup1 is Collabora's allow-list of WOPI
// hosts. SYS_ADMIN lets it bind-mount each document's jail; without it every load copies the
// whole office tree and the first load can take over a minute.
function startContainer({ image, coolPort, port }) {
  try {
    execFileSync("docker", ["rm", "-f", CONTAINER], { stdio: "ignore" });
  } catch {
    // No container left from an earlier run.
  }
  const child = spawn(
    "docker",
    [
      "run",
      "--rm",
      "--name",
      CONTAINER,
      "-p",
      `${coolPort}:9980`,
      "--add-host=host.docker.internal:host-gateway",
      "--cap-add",
      "MKNOD",
      "--cap-add",
      "SYS_ADMIN",
      "-e",
      `aliasgroup1=http://host.docker.internal:${port}`,
      "-e",
      "extra_params=--o:ssl.enable=false --o:ssl.termination=false --o:user_interface.mode=classic",
      image,
    ],
    { stdio: "ignore" },
  );
  return child;
}

async function waitForDiscovery(coolUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${coolUrl}/hosting/discovery`);
      if (response.ok) return await response.text();
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`${coolUrl}/hosting/discovery did not answer within ${timeoutMs}ms`);
}

function editUrlFor(discovery, coolUrl) {
  const action = discovery.match(/<action[^>]*ext="xlsx"[^>]*name="edit"[^>]*urlsrc="([^"]+)"/);
  if (!action) throw new Error("Collabora discovery lists no xlsx edit action");
  return action[1].replace(/^https?:\/\/[^/]+/, coolUrl);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = args.file ? path.resolve(args.file) : await workbookFromPackage(args.packageName);
  const bytes = fs.readFileSync(file);
  const fileName = path.basename(file);
  const coolUrl = `http://localhost:${args.coolPort}`;
  const wopiBase = `http://host.docker.internal:${args.port}`;

  const container = startContainer(args);
  const stop = (code = 0) => {
    try {
      execFileSync("docker", ["rm", "-f", CONTAINER], { stdio: "ignore" });
    } catch {
      // Already gone.
    }
    process.exit(code);
  };
  process.on("SIGTERM", () => stop(0));
  process.on("SIGINT", () => stop(0));
  container.on("exit", (code) => {
    console.error(`collabora container exited (code ${code})`);
    process.exit(1);
  });

  const editUrl = editUrlFor(await waitForDiscovery(coolUrl, 180000), coolUrl);
  let loads = 0;

  http
    .createServer(async (req, res) => {
      const url = new URL(req.url, "http://host");
      if (/^\/wopi\/files\/\d+$/.test(url.pathname) && req.method === "GET") {
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            BaseFileName: fileName,
            Size: bytes.length,
            OwnerId: "video",
            UserId: "video",
            UserFriendlyName: "Sam Green",
            UserCanWrite: true,
            UserCanNotWriteRelative: true,
            Version: "1",
          }),
        );
        return;
      }
      if (/^\/wopi\/files\/\d+\/contents$/.test(url.pathname) && req.method === "GET") {
        res.end(bytes);
        return;
      }
      if (/^\/wopi\/files\/\d+\/contents$/.test(url.pathname) && req.method === "POST") {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        fs.writeFileSync(`${file}.saved.xlsx`, Buffer.concat(chunks));
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ LastModifiedTime: new Date().toISOString() }));
        return;
      }
      if (url.pathname === "/") {
        loads += 1;
        const wopiSrc = encodeURIComponent(`${wopiBase}/wopi/files/${loads}${Date.now()}`);
        res.setHeader("content-type", "text/html");
        res.end(
          `<!doctype html><meta charset="utf-8"><title>${fileName}</title>` +
            `<form id="open" method="post" action="${editUrl}WOPISrc=${wopiSrc}&lang=en-GB">` +
            `<input type="hidden" name="access_token" value="video"><input type="hidden" name="access_token_ttl" value="0">` +
            `<input type="hidden" name="ui_defaults" value="UIMode=classic;SpreadsheetSidebar=false"></form>` +
            `<script>document.getElementById("open").submit()</script>`,
        );
        return;
      }
      res.statusCode = 404;
      res.end();
    })
    .on("error", (error) => {
      console.error(error);
      stop(1);
    })
    .listen(args.port, () => console.log(`collabora sheet host ready on http://localhost:${args.port} serving ${fileName}`));
}

main().catch((error) => {
  console.error(error);
  try {
    execFileSync("docker", ["rm", "-f", CONTAINER], { stdio: "ignore" });
  } catch {
    // Never started.
  }
  process.exit(1);
});
