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
// With --cool-url, a Collabora server is already running (a GitHub Actions service container
// beside the capture job's own container) and no container starts here; --wopi-base is then the
// address that server reaches this host at.
//
// Usage:
//   node scripts/collabora-sheet-host.js --package "GB Accounts Basic Sole Trader 2027-04-05 (Apr27) Excel 2007"
//   node scripts/collabora-sheet-host.js --file path/to/workbook.xlsx
//   node scripts/collabora-sheet-host.js --package "..." --cool-url http://collabora:9980 --wopi-base "http://$(hostname):8099"
// Options: --port 8099 (WOPI host and start page), --cool-port 9980, --image <ref> (default: the pinned CODE 26.04.4.2 digest)

import http from "http";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { spawn, execFileSync } from "child_process";

const SPREADSHEETS_ZIPS = "https://spreadsheets.diyaccounting.co.uk/zips/";
const CONTAINER = "video-collabora";

function parseArgs(argv) {
  const args = {
    port: 8099,
    coolPort: 9980,
    image: "collabora/code@sha256:4e983196eb9878f339cc506c38c21f1cc3473bca3d6de883c5de08f9c0cc3a6c",
  };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i];
    if (argv[i] === "--package") args.packageName = next();
    else if (argv[i] === "--file") args.file = next();
    else if (argv[i] === "--port") args.port = Number(next());
    else if (argv[i] === "--cool-port") args.coolPort = Number(next());
    else if (argv[i] === "--image") args.image = next();
    else if (argv[i] === "--cool-url") args.coolUrl = next();
    else if (argv[i] === "--wopi-base") args.wopiBase = next();
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (!args.packageName === !args.file) throw new Error("give exactly one of --package <name> or --file <xlsx>");
  return args;
}

// The package zip holds one workbook. Reads it out with zlib so the capture container needs no
// unzip binary: the central directory gives each entry's name and local header offset.
function xlsxFromZip(zip) {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip file");
  let entry = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < zip.readUInt16LE(eocd + 10); i++) {
    const method = zip.readUInt16LE(entry + 10);
    const compressedSize = zip.readUInt32LE(entry + 20);
    const nameLength = zip.readUInt16LE(entry + 28);
    const name = zip.toString("utf8", entry + 46, entry + 46 + nameLength);
    const local = zip.readUInt32LE(entry + 42);
    if (name.endsWith(".xlsx")) {
      const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(dataStart, dataStart + compressedSize);
      return { name: path.basename(name), bytes: method === 8 ? zlib.inflateRawSync(data) : Buffer.from(data) };
    }
    entry += 46 + nameLength + zip.readUInt16LE(entry + 30) + zip.readUInt16LE(entry + 32);
  }
  throw new Error("the zip holds no .xlsx");
}

async function workbookFromPackage(packageName) {
  const url = SPREADSHEETS_ZIPS + encodeURIComponent(`${packageName}.zip`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} answered ${response.status}`);
  const { name, bytes } = xlsxFromZip(Buffer.from(await response.arrayBuffer()));
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "collabora-sheet-")), name);
  fs.writeFileSync(file, bytes);
  return file;
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
  const coolUrl = args.coolUrl || `http://localhost:${args.coolPort}`;
  const wopiBase = args.wopiBase || `http://host.docker.internal:${args.port}`;
  const ownsContainer = !args.coolUrl;

  const stop = (code = 0) => {
    if (ownsContainer) {
      try {
        execFileSync("docker", ["rm", "-f", CONTAINER], { stdio: "ignore" });
      } catch {
        // Already gone.
      }
    }
    process.exit(code);
  };
  process.on("SIGTERM", () => stop(0));
  process.on("SIGINT", () => stop(0));
  if (ownsContainer) {
    startContainer(args).on("exit", (code) => {
      console.error(`collabora container exited (code ${code})`);
      process.exit(1);
    });
  }

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
