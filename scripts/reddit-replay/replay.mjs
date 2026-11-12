// Serve a recorded Reddit session to a Playwright browser at the real
// addresses, so readit's content scripts match exactly as they do live.
//
//   import { attachReplay } from "./reddit-replay/replay.mjs";
//   const replay = await attachReplay(context);   // newest clean recording
//   ...
//   replay.report();
//
// Reddit requests are answered from the recording (exact address first, then
// the same path with the most similar query, repeats in recorded order).
// Post media becomes sized placeholders, telemetry gets an empty 204, and
// every other host is refused, so nothing leaves the machine.
import fs from "node:fs";
import path from "node:path";
import {
  isMediaUrl,
  isRedditUrl,
  isServiceWorkerScript,
  isTelemetryUrl,
  readJson,
  resolveSet,
  sha1,
} from "./lib.mjs";

/** Index a recording set: method + URL → entries, method + host + path → entries. */
export function loadRecording(setDir) {
  const log = readJson(path.join(setDir, "log.json"), []);
  const byUrl = new Map();
  const byPath = new Map();
  const push = (map, key, e) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  };
  for (const e of log) {
    if (!e.body && !e.location) continue;
    push(byUrl, `${e.method} ${e.url}`, e);
    const u = new URL(e.url);
    push(byPath, `${e.method} ${u.host}${u.pathname}`, e);
  }
  return { log, byUrl, byPath, dir: setDir };
}

function querySimilarity(a, b) {
  const qa = new URL(a).searchParams;
  const qb = new URL(b).searchParams;
  let score = 0;
  for (const [k, v] of qa) if (qb.has(k)) score += qb.get(k) === v ? 3 : 1;
  return score;
}

/**
 * The recorded answer for a request, or null. POSTs (GraphQL) match on their
 * body when the recording has one with the same body.
 */
export function answerFor(rec, method, url, postData, cursor) {
  const key = `${method} ${url}`;
  let list = rec.byUrl.get(key);
  if (list?.length && postData) {
    const pk = sha1(postData);
    const same = list.filter((e) => e.postKey === pk);
    if (same.length) list = same;
  }
  if (list?.length) {
    const n = cursor.get(key) || 0;
    cursor.set(key, n + 1);
    return { hit: list[Math.min(n, list.length - 1)], exact: true };
  }
  const u = new URL(url);
  const same = rec.byPath.get(`${method} ${u.host}${u.pathname}`);
  if (!same?.length) return null;
  let best = same[0];
  let bestScore = -1;
  for (const e of same) {
    const s = querySimilarity(url, e.url);
    if (s > bestScore) {
      best = e;
      bestScore = s;
    }
  }
  return { hit: best, exact: false };
}

function placeholderSvg(url) {
  const label = new URL(url).hostname.split(".")[0];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#8a8f94"/><text x="320" y="186" font-family="sans-serif" font-size="22" fill="#e9ecef" text-anchor="middle">replay · ${label}</text></svg>`;
}

const NOT_RECORDED_HTML = (url) =>
  `<!doctype html><meta charset="utf-8"><title>Not recorded</title><body style="font:16px sans-serif;padding:2rem"><h1>Not in this recording</h1><p>${url.replace(/[<&>"]/g, "")}</p><p>Add the page to scripts/reddit-replay/pages.mjs and record again.</p>`;

/** True when this smoke run should use a recording (READIT_REPLAY set). */
export function replayRequested() {
  const v = (process.env.READIT_REPLAY || "").trim();
  return !!v && v !== "0" && v !== "false";
}

/**
 * The smoke suites' hook: a suite's own browser profile, kept apart for replay
 * runs so a service worker a live run registered can't answer behind the
 * replay's back.
 */
export function replayProfile(dir) {
  return replayRequested() ? `${dir}-replay` : dir;
}

/**
 * Extra Chromium flags for a replay run: every request goes to a proxy that
 * doesn't exist. Routed requests are answered before that, so the replay is
 * unaffected — but anything that ever slips past the route handler fails
 * instead of reaching the live site.
 */
export function replayLaunchArgs() {
  return replayRequested()
    ? ["--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=<-loopback>"]
    : [];
}

/** Attach the replay to a suite's Playwright context when READIT_REPLAY is set; null otherwise. */
export async function maybeAttachReplay(context) {
  if (!replayRequested()) return null;
  try {
    return await attachReplay(context);
  } catch (err) {
    console.error(String(err?.message || err));
    await context.close().catch(() => {});
    process.exit(2);
  }
}

/** CDP mode drives your real browser: the replay can't (and mustn't) reroute it. */
export function refuseReplayOverCdp(cdpEndpoint) {
  if (replayRequested() && cdpEndpoint) {
    console.error("READIT_REPLAY works with the default Playwright browser, not READIT_CDP.");
    process.exit(2);
  }
}

/**
 * Route `context` (a Playwright BrowserContext) through a recording.
 * `set` is a set folder or name; the newest clean recording by default.
 */
export async function attachReplay(context, { set = process.env.READIT_REPLAY, quiet = false } = {}) {
  const setDir = resolveSet(set);
  if (!setDir) {
    throw new Error(
      "No clean Reddit recording found. Record one with: READIT_CDP=chrome npm run replay:record",
    );
  }
  const rec = loadRecording(setDir);
  const cursor = new Map();
  const misses = [];
  const served = { recorded: 0, approx: 0, placeholder: 0, telemetry: 0, blocked: 0, missed: 0 };

  await context.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (/^(chrome-extension|data|blob|about):/.test(url)) return route.continue();
    if (!isRedditUrl(url)) {
      served.blocked += 1;
      return route.abort("blockedbyclient");
    }
    if (isServiceWorkerScript(url)) {
      served.blocked += 1;
      return route.abort("blockedbyclient");
    }
    const type = req.resourceType();
    if (isTelemetryUrl(url)) {
      served.telemetry += 1;
      return route.fulfill({ status: 204, body: "" });
    }
    if (isMediaUrl(url, type)) {
      served.placeholder += 1;
      if (type === "media" || /\.(mp4|m3u8|mpd|webm)(\?|$)/i.test(url)) {
        return route.fulfill({ status: 404, body: "" });
      }
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: placeholderSvg(url) });
    }
    const ans = answerFor(rec, req.method(), url, req.postData(), cursor);
    if (!ans) {
      served.missed += 1;
      misses.push({ method: req.method(), type, url });
      if (type === "document") {
        return route.fulfill({ status: 404, contentType: "text/html; charset=utf-8", body: NOT_RECORDED_HTML(url) });
      }
      return route.fulfill({ status: 404, body: "" });
    }
    served[ans.exact ? "recorded" : "approx"] += 1;
    let e = ans.hit;
    if (e.location) {
      // Never answer with a real 3xx: Chromium sends the follow-up request
      // past the route handler, straight to the live site. A document moves
      // with a fresh navigation (which is routed); anything else gets the
      // end of the recorded redirect chain directly.
      if (type === "document") {
        const to = JSON.stringify(new URL(e.location, url).href).replace(/</g, "\\u003c");
        return route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: `<!doctype html><meta charset="utf-8"><script>location.replace(${to})</script>`,
        });
      }
      for (let hops = 0; e?.location && hops < 10; hops++) {
        e = answerFor(rec, req.method(), new URL(e.location, url).href, null, cursor)?.hit;
      }
      if (!e?.body) {
        served.missed += 1;
        misses.push({ method: req.method(), type, url });
        return route.fulfill({ status: 404, body: "" });
      }
    }
    return route.fulfill({
      status: e.status === 304 ? 200 : e.status,
      contentType: e.ct || undefined,
      body: fs.readFileSync(path.join(setDir, "bodies", e.body)),
    });
  });

  const meta = readJson(path.join(setDir, "set.json"), {});
  if (!quiet) {
    console.log(
      `Reddit replay: ${path.basename(setDir)} (${meta.responses ?? rec.log.length} responses, ` +
        `recorded ${meta.at?.slice(0, 10) || "?"}, ${meta.signedIn ? "signed in" : "signed out"})`,
    );
  }

  return {
    setDir,
    misses,
    served,
    /** Print what was served and what the recording couldn't answer. */
    report() {
      console.log(
        `Reddit replay served ${served.recorded} recorded + ${served.approx} near-match, ` +
          `${served.placeholder} placeholders, ${served.telemetry} telemetry; ` +
          `blocked ${served.blocked}; missed ${served.missed}.`,
      );
      const unique = [...new Map(misses.map((m) => [`${m.method} ${m.url}`, m])).values()];
      for (const m of unique.slice(0, 20)) console.log(`  miss ${m.type} ${m.method} ${m.url.slice(0, 160)}`);
      if (unique.length > 20) console.log(`  … and ${unique.length - 20} more`);
    },
  };
}
