// Shared helpers for the Reddit replay (record → replay).
//
// Everything Reddit-derived stays under ~/.cache/readit/reddit-replay/ and is
// never committed: it is Reddit's own markup and code and, before scrubbing,
// the recording account's data.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const ROOT = process.env.READIT_REPLAY_DIR
  ? path.resolve(process.env.READIT_REPLAY_DIR)
  : path.join(os.homedir(), ".cache/readit/reddit-replay");

/** Reddit's own hosts: the app, its static files, its media and its APIs. */
export function isRedditHost(hostname) {
  return /(^|\.)(reddit\.com|redditstatic\.com|redd\.it|redditmedia\.com|reddituploads\.com)$/.test(
    hostname,
  );
}

export function isRedditUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && isRedditHost(u.hostname);
  } catch {
    return false;
  }
}

/** Posts' and users' pictures and videos: drawn as placeholders, never stored. */
export function isMediaUrl(url, type = "") {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (/^(v|i|preview|external-preview|i\.preview)\.redd\.it$/.test(u.hostname)) return true;
  if (/(^|\.)(redditmedia\.com|reddituploads\.com)$/.test(u.hostname)) return true;
  const t = type.toLowerCase();
  if (t === "media") return true;
  // Reddit's own UI images (icons, snoos, avatars' frames) on redditstatic stay real.
  if (t === "image" && !/(^|\.)redditstatic\.com$/.test(u.hostname)) return true;
  return false;
}

/**
 * Reddit's public script and style bundles: identical for every visitor, so
 * they are stored as served (never rewritten by the scrubber).
 */
export function isPublicStaticAsset(url, type = "") {
  try {
    const u = new URL(url);
    return (
      u.hostname === "www.redditstatic.com" &&
      (/^(script|stylesheet|font)$/i.test(type) || /\.(js|css|woff2?)$/i.test(u.pathname))
    );
  } catch {
    return false;
  }
}

/** Telemetry and ads: answered empty on replay, never recorded. */
export function isTelemetryUrl(url) {
  try {
    const u = new URL(url);
    return (
      /^(w3-reporting|events|error-tracking|alb)\.reddit\.com$/.test(u.hostname) ||
      /^\/(svc\/shreddit\/)?(events|perfMetrics|v1\/events)/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

/** Reddit's service worker would cache and answer behind the replay's back. */
export function isServiceWorkerScript(url) {
  try {
    return /(^|\/)(sw|service-?worker)[\w.-]*\.js$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 1)}\n`);
}

/** `--flag` → true, `--key=value` → "value", other words under `_`. */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (const a of argv) {
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const s = a.slice(2);
    const i = s.indexOf("=");
    if (i < 0) out[s] = true;
    else out[s.slice(0, i)] = s.slice(i + 1);
  }
  return out;
}

/** Recording sets are named by their start time; the newest clean one is the default. */
export const SET_NAME = /^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d$/;

export function stampNow() {
  return new Date().toISOString().slice(0, 19).replace(/:/g, "-");
}

export function newestSet() {
  if (!fs.existsSync(ROOT)) return null;
  const sets = fs
    .readdirSync(ROOT)
    .filter((d) => SET_NAME.test(d) && readJson(path.join(ROOT, d, "set.json"))?.leaks === 0)
    .sort();
  return sets.length ? path.join(ROOT, sets[sets.length - 1]) : null;
}

/** A recording set by name or path; the newest clean one when none is named. */
export function resolveSet(spec) {
  if (!spec || spec === "1" || spec === "true" || spec === "latest") return newestSet();
  if (fs.existsSync(spec)) return path.resolve(spec);
  const named = path.join(ROOT, spec);
  return fs.existsSync(named) ? named : null;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A deterministic fake of the same shape: digits → digits, letters → letters
 * (case kept), everything else and the length unchanged. Same input, same
 * output, so a value scrubbed in HTML still matches the one in JSON.
 */
export function fakeShape(value, salt = "readit-replay") {
  const s = String(value);
  const d = crypto.createHash("sha256").update(salt + s).digest();
  let i = 0;
  return s.replace(/[A-Za-z]|\d/g, (m) => {
    const b = d[i++ % 32];
    if (/\d/.test(m)) return String(b % 10);
    const c = "abcdefghijklmnopqrstuvwxyz"[b % 26];
    return m === m.toUpperCase() ? c.toUpperCase() : c;
  });
}

export function sha1(text) {
  return crypto.createHash("sha1").update(text).digest("hex");
}

export function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
