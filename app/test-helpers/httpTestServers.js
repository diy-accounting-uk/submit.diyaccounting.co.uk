// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/test-helpers/httpTestServers.js

import http from "http";
import https from "https";
import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";

/**
 * Create an HTTP server that returns 500 until `setShouldFail(false)` is called.
 */
export function createFailingServer() {
  let shouldFail = true;
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (shouldFail) {
      res.statusCode = 500;
      res.end(JSON.stringify({ success: false }));
    } else {
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true }));
    }
  });
  return {
    async listen(port = 0) {
      await new Promise((resolve) => server.listen(port, resolve));
      return server.address().port;
    },
    setShouldFail(val) {
      shouldFail = val;
    },
    close() {
      return server.close();
    },
  };
}

/**
 * Create an HTTP server that issues a 302 redirect for '/redirect'.
 * Any other path returns 200 OK.
 */
export function createRedirectServer() {
  const server = http.createServer((req, res) => {
    if (req.url === "/redirect") {
      res.statusCode = 302;
      res.setHeader("Location", "/final");
      res.end();
    } else {
      res.statusCode = 200;
      res.setHeader("content-type", "text/plain");
      res.end("OK");
    }
  });
  return {
    async listen(port = 0) {
      await new Promise((resolve) => server.listen(port, resolve));
      return server.address().port;
    },
    close() {
      return server.close();
    },
  };
}

/**
 * Create an HTTPS server with a self‑signed certificate.
 * It echoes request headers and JSON body back to the caller.
 */
export function createHttpsEchoServer() {
  // Create a temporary directory for cert files
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proxy-cert-"));
  const keyPath = path.join(tmpDir, "key.pem");
  const certPath = path.join(tmpDir, "cert.pem");

  // Generate self‑signed cert with openssl (must be installed)
  // The command follows the typical pattern:contentReference[oaicite:2]{index=2}.
  execSync(`openssl req -newkey rsa:2048 -nodes -keyout ${keyPath} -x509 -days 1 -out ${certPath} -subj "/CN=localhost"`);

  const key = fs.readFileSync(keyPath);
  const cert = fs.readFileSync(certPath);

  const server = https.createServer({ key, cert }, (req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", () => {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      const response = {
        receivedHeaders: req.headers,
        receivedBody: body ? JSON.parse(body) : null,
      };
      res.end(JSON.stringify(response));
    });
  });

  return {
    async listen(port = 0) {
      await new Promise((resolve) => server.listen(port, resolve));
      return server.address().port;
    },
    close() {
      return server.close();
    },
  };
}
