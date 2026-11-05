// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkFraudPreventionHeaderRules } from "../../app/lib/fraudPreventionHeaderRules.js";
import {
  desktopClientHeaders,
  deviceId,
  localIpsHeader,
  macAddressesHeader,
  MCP_VENDOR_VERSION,
  parseMacDisplays,
  parseWindowsDisplays,
  parseXdpyinfoDisplays,
  screensHeader,
  timezoneHeader,
  userAgentHeader,
} from "../lib/client-headers.js";

/* eslint-disable sonarjs/no-hardcoded-ip */
const INTERFACES = {
  lo0: [{ address: "127.0.0.1", mac: "00:00:00:00:00:00", internal: true }],
  en0: [
    { address: "192.168.1.5", mac: "aa:bb:cc:dd:ee:ff", internal: false },
    { address: "fe80::1", mac: "aa:bb:cc:dd:ee:ff", internal: false },
  ],
  utun0: [{ address: "fd00::2", mac: "00:00:00:00:00:00", internal: false }],
};

/* eslint-enable sonarjs/no-hardcoded-ip */

const MACHINE = {
  device: { osFamily: "macOS", osVersion: "15.1", manufacturer: "Apple", model: "MacBookPro16,1" },
  displays: [{ width: 1792, height: 1120, scalingFactor: 2, colourDepth: 30 }],
};

describe("client-headers", () => {
  let configDir;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), "client-headers-"));
    process.env.DIYA_SUBMIT_CONFIG_DIR = configDir;
  });

  afterEach(() => {
    delete process.env.DIYA_SUBMIT_CONFIG_DIR;
    rmSync(configDir, { recursive: true, force: true });
  });

  it("keeps one device id across calls and makes a new one when the file goes", () => {
    const first = deviceId();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(deviceId()).toBe(first);
    expect(readFileSync(join(configDir, "device-id"), "utf8")).toBe(first);
    rmSync(join(configDir, "device-id"));
    expect(deviceId()).not.toBe(first);
  });

  it("replaces a device id file that holds no UUID", () => {
    writeFileSync(join(configDir, "device-id"), "not-a-uuid");
    expect(deviceId()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("lists external addresses, percent-encoded, without loopback", () => {
    expect(localIpsHeader(INTERFACES)).toBe("192.168.1.5,fe80%3A%3A1,fd00%3A%3A2");
    expect(localIpsHeader({ lo0: INTERFACES.lo0 })).toBeNull();
  });

  it("lists each real MAC address once, percent-encoded", () => {
    expect(macAddressesHeader(INTERFACES)).toBe("aa%3Abb%3Acc%3Add%3Aee%3Aff");
    expect(macAddressesHeader({ lo0: INTERFACES.lo0 })).toBeNull();
  });

  it("writes the timezone in HMRC's form on both sides of UTC", () => {
    expect(timezoneHeader(0)).toBe("UTC+00:00");
    expect(timezoneHeader(-330)).toBe("UTC+05:30");
    expect(timezoneHeader(75)).toBe("UTC-01:15");
  });

  it("leaves out a device pair with no value", () => {
    expect(userAgentHeader({ osFamily: "Linux", osVersion: "6.8.0", manufacturer: null, model: "" })).toBe(
      "os-family=Linux&os-version=6.8.0",
    );
  });

  it("reads macOS displays in points with the pixel ratio as the scale", () => {
    const profile = JSON.stringify({
      SPDisplaysDataType: [
        { _name: "no displays" },
        {
          spdisplays_ndrvs: [
            { _spdisplays_pixels: "3584 x 2240", _spdisplays_resolution: "1792 x 1120 @ 59.00Hz", spdisplays_depth: "CGSThirtyBitColor" },
            { _spdisplays_pixels: "3840 x 2160" },
          ],
        },
      ],
    });
    expect(parseMacDisplays(profile)).toEqual(MACHINE.displays);
    expect(parseMacDisplays(null)).toEqual([]);
  });

  it("reads xdpyinfo screens", () => {
    const text = "screen #0:\n  dimensions:    1920x1080 pixels (508x285 millimeters)\n  depth of root window:    24 planes\n";
    expect(parseXdpyinfoDisplays(text)).toEqual([{ width: 1920, height: 1080, scalingFactor: 1, colourDepth: 24 }]);
    expect(parseXdpyinfoDisplays(null)).toEqual([]);
  });

  it("reads one or several Windows video controllers and skips one with no display", () => {
    const one = { CurrentHorizontalResolution: 2560, CurrentVerticalResolution: 1440, CurrentBitsPerPixel: 32 };
    const expected = [{ width: 2560, height: 1440, scalingFactor: 1, colourDepth: 32 }];
    expect(parseWindowsDisplays(JSON.stringify(one))).toEqual(expected);
    expect(parseWindowsDisplays(JSON.stringify([one, { CurrentHorizontalResolution: null }]))).toEqual(expected);
  });

  it("answers null for the screens of a machine with none", () => {
    expect(screensHeader([])).toBeNull();
  });

  it("builds headers that pass HMRC's format rules for the desktop method", async () => {
    const headers = await desktopClientHeaders(MACHINE);
    const withServerVersion = { ...headers, "Gov-Vendor-Version": `submit=1.0.0&${headers["Gov-Vendor-Version"]}` };

    expect(headers["Gov-Vendor-Version"]).toBe(MCP_VENDOR_VERSION);
    expect(headers["Gov-Client-User-IDs"]).toMatch(/^os=.+/);
    expect(headers["Gov-Client-Local-IPs-Timestamp"]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(checkFraudPreventionHeaderRules(withServerVersion, "DESKTOP_APP_VIA_SERVER")).toEqual([]);
  });

  it("leaves a header with no value out of the answer", async () => {
    const headers = await desktopClientHeaders({ ...MACHINE, displays: [] });
    expect(headers).not.toHaveProperty("Gov-Client-Screens");
  });
});
