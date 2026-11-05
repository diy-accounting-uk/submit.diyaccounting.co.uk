// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability MCP-22 Read the machine for HMRC fraud prevention headers
// - **Use when:** a stdio MCP call to an HMRC route needs the device data of HMRC's desktop connection method, or a new device header must be added.
// - **Does:** desktopClientHeaders in mcp/lib/client-headers.js reads the machine that runs the stdio MCP server: a persistent device id, local IP addresses and their timestamp, MAC addresses, the operating system user, the timezone, the operating system and device model, and the screens. callSubmitApi sends the result on every route behind the custom authoriser, and app/lib/buildFraudHeaders.js passes it to HMRC under DESKTOP_APP_VIA_SERVER. The process has no window, so it sends no Gov-Client-Window-Size. The hosted Lambda passes its own headers instead.
// - **Run:** no command; see Does and Entry
// - **Entry:** `mcp/lib/client-headers.js:desktopClientHeaders`
// - **Files:** mcp/lib/client-headers.js, mcp/test/client-headers.test.js
// - **Keywords:** fraud prevention headers, desktop app via server, device id, mac addresses, local ips, gov-client-screens, stdio mcp
// - **Related:** HMRC-25, MCP-07
// @end-capability

// client-headers.js -- what the stdio MCP server tells Submit about the machine it runs on, so
// that Submit can send HMRC the DESKTOP_APP_VIA_SERVER headers. HMRC asks for values collected
// immediately before each request, so the addresses and their timestamp are read per call. The
// device model and the screens take a child process each, so they are read once per process. A
// value this machine cannot give is left out, and Submit's send check counts the missing header.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces, release, type, userInfo } from "node:os";
import { join } from "node:path";

import { credentialsDir } from "./auth.js";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const MCP_VENDOR_VERSION = `diya-submit-mcp=${encodeURIComponent(version)}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY_MAC = "00:00:00:00:00:00";
const CHILD_TIMEOUT_MS = 5000;
const OS_FAMILIES = { darwin: "macOS", win32: "Windows", linux: "Linux" };
const MAC_COLOUR_DEPTHS = { CGSEightBitColor: 8, CGSSixteenBitColor: 16, CGSThirtyBitColor: 30, CGSThirtytwoBitColor: 32 };

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8", timeout: CHILD_TIMEOUT_MS, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function readTrimmed(path) {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/**
 * The device id, generated once and kept in the same directory as the credentials. HMRC asks for
 * an identifier that stays on the device and does not expire. A deleted file gives a new id.
 * @returns {string}
 */
export function deviceId() {
  const path = join(credentialsDir(), "device-id");
  const stored = existsSync(path) ? readFileSync(path, "utf8").trim() : "";
  if (UUID.test(stored)) return stored;
  const created = randomUUID();
  mkdirSync(credentialsDir(), { recursive: true, mode: 0o700 });
  writeFileSync(path, created, { mode: 0o600 });
  return created;
}

function externalInterfaces(interfaces) {
  return Object.values(interfaces)
    .flat()
    .filter((entry) => !entry.internal);
}

/**
 * The Gov-Client-Local-IPs value. Answers null when the machine has no external interface.
 * @param {Object} interfaces - the shape of os.networkInterfaces()
 * @returns {string|null}
 */
export function localIpsHeader(interfaces) {
  const addresses = [...new Set(externalInterfaces(interfaces).map((entry) => entry.address))];
  return addresses.length > 0 ? addresses.map(encodeURIComponent).join(",") : null;
}

/**
 * The Gov-Client-MAC-Addresses value. Answers null when no interface has a MAC address.
 * @param {Object} interfaces - the shape of os.networkInterfaces()
 * @returns {string|null}
 */
export function macAddressesHeader(interfaces) {
  const addresses = [...new Set(externalInterfaces(interfaces).map((entry) => entry.mac))].filter((mac) => mac && mac !== EMPTY_MAC);
  return addresses.length > 0 ? addresses.map(encodeURIComponent).join(",") : null;
}

/**
 * The Gov-Client-Timezone value for a getTimezoneOffset() result, which counts minutes behind UTC.
 * @param {number} offsetMinutes
 * @returns {string}
 */
export function timezoneHeader(offsetMinutes) {
  const ahead = -offsetMinutes;
  const absolute = Math.abs(ahead);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `UTC${ahead < 0 ? "-" : "+"}${hours}:${minutes}`;
}

/**
 * The Gov-Client-User-Agent value. HMRC allows a pair with no value to be left out.
 * @param {{osFamily?: string|null, osVersion?: string|null, manufacturer?: string|null, model?: string|null}} device
 * @returns {string}
 */
export function userAgentHeader({ osFamily, osVersion, manufacturer, model }) {
  return Object.entries({ "os-family": osFamily, "os-version": osVersion, "device-manufacturer": manufacturer, "device-model": model })
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
}

function readDevice() {
  const device = { osFamily: OS_FAMILIES[process.platform] ?? type(), osVersion: release() };
  if (process.platform === "darwin") {
    return {
      ...device,
      osVersion: run("sw_vers", ["-productVersion"]) ?? release(),
      manufacturer: "Apple",
      model: run("sysctl", ["-n", "hw.model"]),
    };
  }
  if (process.platform === "linux") {
    return { ...device, manufacturer: readTrimmed("/sys/class/dmi/id/sys_vendor"), model: readTrimmed("/sys/class/dmi/id/product_name") };
  }
  if (process.platform === "win32") {
    const system = parseJson(
      run("powershell", [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model | ConvertTo-Json",
      ]),
    );
    return { ...device, manufacturer: system?.Manufacturer, model: system?.Model };
  }
  return device;
}

function firstNumberPair(text) {
  const match = /^(\d+) x (\d+)/.exec(text ?? "");
  return match ? [Number(match[1]), Number(match[2])] : null;
}

/**
 * The screens in `system_profiler SPDisplaysDataType -json` output. Width and height are in points
 * and the scaling factor is pixels per point, the same terms a browser reports.
 * @param {string|null} text
 * @returns {Array<{width: number, height: number, scalingFactor: number, colourDepth: number}>}
 */
export function parseMacDisplays(text) {
  const displays = (parseJson(text)?.SPDisplaysDataType ?? []).flatMap((card) => card.spdisplays_ndrvs ?? []);
  return displays.flatMap((display) => {
    const points = firstNumberPair(display._spdisplays_resolution);
    const pixels = firstNumberPair(display._spdisplays_pixels);
    const colourDepth = MAC_COLOUR_DEPTHS[display.spdisplays_depth];
    if (!points || !pixels || !colourDepth) return [];
    return [{ width: points[0], height: points[1], scalingFactor: pixels[0] / points[0], colourDepth }];
  });
}

/**
 * The screens in `xdpyinfo` output. X reports physical pixels, so the scaling factor is 1.
 * @param {string|null} text
 * @returns {Array<{width: number, height: number, scalingFactor: number, colourDepth: number}>}
 */
export function parseXdpyinfoDisplays(text) {
  const sizes = [...(text ?? "").matchAll(/dimensions:\s+(\d+)x(\d+) pixels/g)];
  const depths = [...(text ?? "").matchAll(/depth of root window:\s+(\d+) planes/g)];
  return sizes.flatMap((size, index) =>
    depths[index] ? [{ width: Number(size[1]), height: Number(size[2]), scalingFactor: 1, colourDepth: Number(depths[index][1]) }] : [],
  );
}

/**
 * The screens in the JSON of Win32_VideoController. Windows reports physical pixels here, so the
 * scaling factor is 1. ConvertTo-Json answers an object for one controller and a list for several.
 * @param {string|null} text
 * @returns {Array<{width: number, height: number, scalingFactor: number, colourDepth: number}>}
 */
export function parseWindowsDisplays(text) {
  const parsed = parseJson(text);
  const controllers = [parsed].flat().filter(Boolean);
  return controllers
    .filter(
      (controller) => controller.CurrentHorizontalResolution && controller.CurrentVerticalResolution && controller.CurrentBitsPerPixel,
    )
    .map((controller) => ({
      width: controller.CurrentHorizontalResolution,
      height: controller.CurrentVerticalResolution,
      scalingFactor: 1,
      colourDepth: controller.CurrentBitsPerPixel,
    }));
}

function readDisplays() {
  if (process.platform === "darwin") return parseMacDisplays(run("system_profiler", ["SPDisplaysDataType", "-json"]));
  if (process.platform === "linux") return parseXdpyinfoDisplays(run("xdpyinfo", []));
  if (process.platform === "win32") {
    const query =
      "Get-CimInstance Win32_VideoController | Select-Object CurrentHorizontalResolution,CurrentVerticalResolution,CurrentBitsPerPixel | ConvertTo-Json";
    return parseWindowsDisplays(run("powershell", ["-NoProfile", "-Command", query]));
  }
  return [];
}

/**
 * The Gov-Client-Screens value. Answers null when the machine reports no screen.
 * @param {Array<{width: number, height: number, scalingFactor: number, colourDepth: number}>} displays
 * @returns {string|null}
 */
export function screensHeader(displays) {
  if (displays.length === 0) return null;
  return displays
    .map(
      ({ width, height, scalingFactor, colourDepth }) =>
        `width=${width}&height=${height}&scaling-factor=${scalingFactor}&colour-depth=${colourDepth}`,
    )
    .join(",");
}

let machine = null;

function readMachineOnce() {
  machine ??= { device: readDevice(), displays: readDisplays() };
  return machine;
}

/**
 * The headers a call to an HMRC route carries from the stdio server. A header with no value is
 * left out of the answer.
 * @param {{device: Object, displays: Array}} [machineFacts] - read from this machine when omitted
 * @returns {Promise<Object>}
 */
export async function desktopClientHeaders({ device, displays } = readMachineOnce()) {
  const interfaces = networkInterfaces();
  const headers = {
    "Gov-Client-Device-ID": deviceId(),
    "Gov-Client-Local-IPs": localIpsHeader(interfaces),
    "Gov-Client-Local-IPs-Timestamp": new Date().toISOString(),
    "Gov-Client-MAC-Addresses": macAddressesHeader(interfaces),
    "Gov-Client-Screens": screensHeader(displays),
    "Gov-Client-Timezone": timezoneHeader(new Date().getTimezoneOffset()),
    "Gov-Client-User-Agent": userAgentHeader(device),
    "Gov-Client-User-IDs": `os=${encodeURIComponent(userInfo().username)}`,
    "Gov-Vendor-Version": MCP_VENDOR_VERSION,
  };
  return Object.fromEntries(Object.entries(headers).filter(([, value]) => value));
}
