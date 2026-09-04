// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/lib/video/capture.js
//
// Frame capture — design section 2 and 6.1. The primary path owns a CDP screencast session
// directly rather than using Playwright's `recordVideo` (25fps, fixed; accumulating timestamp
// drift; VP8; no drawn cursor — see the design's section 1.5/2 for the open issues this avoids).
// A fixed-cadence `page.screenshot()` fallback sits behind the same start/stop/setCompression
// interface for a CI container where screencast frame delivery proves unreliable.
//
// Both capture modes write a frames/%06d.jpg ledger of { index, tMs } consumed by
// scripts/lib/video/encode.js's buildManifest.

import fs from "fs";
import path from "path";
import { frameFileName } from "./encode.js";

// Section 4.4: once a wait is compressing, keep only one frame in every `factor` — this thins
// the frame rate during a long backend wait instead of writing every frame, without touching the
// manifest maths (buildManifest reads whatever frames actually got written).
class CompressionGate {
  constructor() {
    this.active = false;
    this.factor = 1;
    this.counter = 0;
  }
  setActive(active, factor = 1) {
    this.active = active;
    this.factor = Math.max(1, factor);
    this.counter = 0;
  }
  shouldWrite() {
    if (!this.active) return true;
    this.counter += 1;
    return this.counter % this.factor === 0;
  }
}

export class CdpScreencastCapture {
  constructor({ page, framesDir, maxWidth = 1920, maxHeight = 1080, quality = 85 }) {
    this.page = page;
    this.framesDir = framesDir;
    this.maxWidth = maxWidth;
    this.maxHeight = maxHeight;
    this.quality = quality;
    this.frames = [];
    this.gate = new CompressionGate();
    this.writeIndex = 0;
    this.t0 = null;
    this.session = null;
  }

  setCompression(active, factor) {
    this.gate.setActive(active, factor);
  }

  async start() {
    fs.mkdirSync(this.framesDir, { recursive: true });
    this.session = await this.page.context().newCDPSession(this.page);
    this.t0 = performance.now();
    this.session.on("Page.screencastFrame", async ({ data, sessionId }) => {
      if (this.gate.shouldWrite()) {
        this.writeIndex += 1;
        const filePath = path.join(this.framesDir, frameFileName(this.writeIndex));
        fs.writeFileSync(filePath, Buffer.from(data, "base64"));
        this.frames.push({ index: this.writeIndex, tMs: performance.now() - this.t0 });
      }
      // The screencast stream stalls without the ack, whether or not this frame was written.
      await this.session.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
    await this.session.send("Page.startScreencast", {
      format: "jpeg",
      quality: this.quality,
      maxWidth: this.maxWidth,
      maxHeight: this.maxHeight,
    });
  }

  async stop() {
    if (this.session) {
      await this.session.send("Page.stopScreencast").catch(() => {});
    }
    return this.frames;
  }
}

// Fallback 1 from design section 2: a fixed-cadence page.screenshot() poll. Deterministic and
// dependency-free, at the cost of steppier pointer motion between frames.
export class ScreenshotCadenceCapture {
  constructor({ page, framesDir, fps = 25 }) {
    this.page = page;
    this.framesDir = framesDir;
    this.intervalMs = 1000 / fps;
    this.frames = [];
    this.gate = new CompressionGate();
    this.writeIndex = 0;
    this.t0 = null;
    this.timer = null;
    this.capturing = false;
  }

  setCompression(active, factor) {
    this.gate.setActive(active, factor);
  }

  async start() {
    fs.mkdirSync(this.framesDir, { recursive: true });
    this.t0 = performance.now();
    this.capturing = true;
    const tick = async () => {
      if (!this.capturing) return;
      if (this.gate.shouldWrite()) {
        this.writeIndex += 1;
        const filePath = path.join(this.framesDir, frameFileName(this.writeIndex));
        try {
          const buffer = await this.page.screenshot({ type: "jpeg", quality: 85 });
          fs.writeFileSync(filePath, buffer);
          this.frames.push({ index: this.writeIndex, tMs: performance.now() - this.t0 });
        } catch {
          // A screenshot mid-navigation can throw; skip this tick rather than abort capture.
        }
      } else {
        this.writeIndex += 1; // keeps frame numbering monotonic even when this tick is skipped
      }
      this.timer = setTimeout(tick, this.intervalMs);
    };
    this.timer = setTimeout(tick, this.intervalMs);
  }

  async stop() {
    this.capturing = false;
    if (this.timer) clearTimeout(this.timer);
    return this.frames;
  }
}

export function createCapture(mode, opts) {
  if (mode === "screenshot") return new ScreenshotCadenceCapture(opts);
  if (mode === "screencast") return new CdpScreencastCapture(opts);
  throw new Error(`createCapture: unknown mode "${mode}"`);
}
