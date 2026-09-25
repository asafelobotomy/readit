import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Where Chrome-family browsers write DevToolsActivePort when remote debugging
 * is on. Chrome's chrome://inspect "remote debugging" toggle serves only the
 * browser WebSocket (no /json/version), so the ws path must come from here.
 */
const PORT_FILE_CANDIDATES = [
  ".config/google-chrome/DevToolsActivePort",
  ".config/google-chrome-beta/DevToolsActivePort",
  ".config/chromium/DevToolsActivePort",
  ".config/BraveSoftware/Brave-Browser/DevToolsActivePort",
  "Library/Application Support/Google/Chrome/DevToolsActivePort",
];

/** `{ port, wsPath }` from a DevToolsActivePort file, or null. */
export function readDevToolsActivePort(file) {
  try {
    const [port, wsPath] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
    if (!/^\d+$/.test(port ?? "") || !wsPath?.startsWith("/devtools/browser/")) {
      return null;
    }
    return { port: Number(port), wsPath };
  } catch {
    return null;
  }
}

function portFiles() {
  const explicit = (process.env.READIT_CDP_PORT_FILE || "").trim();
  if (explicit) return [path.resolve(explicit)];
  return PORT_FILE_CANDIDATES.map((rel) => path.join(os.homedir(), rel));
}

/** ws endpoint for a running browser, optionally only the one on `port`. */
export function wsEndpointFromPortFile(port) {
  for (const file of portFiles()) {
    const hit = readDevToolsActivePort(file);
    if (!hit || (port && hit.port !== port)) continue;
    return `ws://127.0.0.1:${hit.port}${hit.wsPath}`;
  }
  return null;
}

/**
 * Connect puppeteer to READIT_CDP, which may be:
 *   - `ws://…/devtools/browser/<id>`  used as-is
 *   - `chrome` / `auto`                  read DevToolsActivePort
 *   - `http://127.0.0.1:<port>`          /json/version, falling back to the
 *                                        DevToolsActivePort for that port
 */
export async function connectCdp(puppeteer, spec, extra = {}) {
  const raw = String(spec || "").trim().replace(/\/$/, "");
  const opts = { defaultViewport: null, protocolTimeout: 120_000, ...extra };

  if (raw.startsWith("ws://") || raw.startsWith("wss://")) {
    return puppeteer.connect({ ...opts, browserWSEndpoint: raw });
  }
  if (raw === "chrome" || raw === "auto") {
    const ws = wsEndpointFromPortFile();
    if (!ws) {
      throw new Error(
        "No DevToolsActivePort found — enable remote debugging in chrome://inspect " +
          "or set READIT_CDP_PORT_FILE",
      );
    }
    return puppeteer.connect({ ...opts, browserWSEndpoint: ws });
  }
  try {
    return await puppeteer.connect({ ...opts, browserURL: raw });
  } catch (err) {
    const port = Number(new URL(raw).port);
    const ws = port ? wsEndpointFromPortFile(port) : null;
    if (!ws) throw err;
    return puppeteer.connect({ ...opts, browserWSEndpoint: ws });
  }
}
