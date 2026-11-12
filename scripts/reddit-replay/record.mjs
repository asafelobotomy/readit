// Record New Reddit from your own browser for offline smoke runs.
//
//   READIT_CDP=chrome npm run replay:record [-- --pages=home,thread]
//
// Attaches over CDP to a Chromium you already run (the same READIT_CDP values
// the smoke suites take), opens its own tab, visits the pages in pages.mjs
// read-only (load, scroll the feed, rest), and closes that tab. It never
// clicks, types, votes or joins.
//
// What's kept: Reddit's HTML, scripts, styles, fonts and API answers, in
// ~/.cache/readit/reddit-replay/<stamp>/. What isn't: cookies, request and
// response headers (only content type and redirect targets), and media
// (post images and videos replay as placeholders). Your username, user id
// and any sign-in value in a body are replaced at record time, and the leak
// check fails the run if any of them (or any reddit.com cookie value)
// survives anywhere in the set.
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { connectCdp } from "../smoke-cdp.mjs";
import {
  ROOT,
  ensureDir,
  isMediaUrl,
  isPublicStaticAsset,
  isRedditUrl,
  isTelemetryUrl,
  parseArgs,
  sha1,
  sleep,
  stampNow,
  writeJson,
} from "./lib.mjs";
import { PAGES, PICKERS } from "./pages.mjs";
import { createScrubber, findLeaks, isTextType } from "./scrub.mjs";

const args = parseArgs();
const ORIGIN = "https://www.reddit.com";
const cdpSpec = (process.env.READIT_CDP || "chrome").trim();
const only = args.pages ? new Set(String(args.pages).split(",")) : null;
const pages = PAGES.filter((p) => !only || only.has(p.slug));
const setDir = ensureDir(path.join(ROOT, stampNow()));
const bodiesDir = ensureDir(path.join(setDir, "bodies"));

const browser = await connectCdp(puppeteer, cdpSpec);
const tab = await browser.newPage();
let exitCode = 0;

/** Stop on Reddit's bot check: a person has to answer it, in their own browser. */
async function assertNotChallenged() {
  const title = await tab.title().catch(() => "");
  if (/prove your humanity|blocked|whoa there/i.test(title)) {
    throw new Error(
      `Reddit is showing a check ("${title}"). Open reddit.com in that browser, ` +
        "answer it yourself, then run the recording again.",
    );
  }
}

try {
  // 1. Who is signed in — read before capture starts, so it is never recorded.
  await tab.goto(`${ORIGIN}/api/me.json`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await assertNotChallenged();
  // Anything but JSON (a check page, an error) means we don't know who is
  // signed in — and an unknown account can't be scrubbed, so stop rather
  // than guess "signed out".
  let me;
  try {
    me = JSON.parse(await tab.evaluate(() => document.body?.innerText || ""));
  } catch {
    throw new Error(
      "Couldn't read who is signed in (/api/me.json didn't answer with JSON). " +
        "Open reddit.com in that browser, check it loads normally, then run again.",
    );
  }
  const identity = me?.data?.name ? { name: me.data.name, id: me.data.id } : {};
  const scrub = createScrubber(identity);
  const cdp = await tab.createCDPSession();
  const { cookies } = await cdp.send("Network.getCookies", { urls: [`${ORIGIN}/`] });
  const cookieValues = cookies.map((c) => c.value); // in memory only: leak-check needles
  console.log(identity.name ? "Recording signed in (account scrubbed)" : "Recording signed out");

  // 2. Capture.
  await cdp.send("Network.enable", { maxPostDataSize: 65_536 });
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.setBypassServiceWorker", { bypass: true });
  const requests = new Map();
  const log = [];
  const pending = new Set();
  let currentSlug = "boot";
  let skipped = { media: 0, telemetry: 0, other: 0 };

  const keep = (url) => isRedditUrl(url) && !url.includes("/api/me.json");

  cdp.on("Network.requestWillBeSent", (e) => {
    if (e.redirectResponse && keep(e.redirectResponse.url)) {
      log.push({
        page: currentSlug,
        method: e.request.method,
        url: scrub.text(e.redirectResponse.url),
        status: e.redirectResponse.status,
        location: scrub.text(e.request.url),
        type: (e.type || "").toLowerCase(),
      });
    }
    requests.set(e.requestId, {
      url: e.request.url,
      method: e.request.method,
      postData: e.request.postData || null,
      type: (e.type || "").toLowerCase(),
      page: currentSlug,
    });
  });
  cdp.on("Network.responseReceived", (e) => {
    const r = requests.get(e.requestId);
    if (!r) return;
    r.status = e.response.status;
    r.ct = e.response.mimeType || "";
    r.type = (e.type || r.type || "").toLowerCase();
  });
  cdp.on("Network.loadingFinished", (e) => {
    const r = requests.get(e.requestId);
    requests.delete(e.requestId);
    if (!r || r.status == null || !keep(r.url)) return;
    if (isMediaUrl(r.url, r.type)) return void (skipped.media += 1);
    if (isTelemetryUrl(r.url)) return void (skipped.telemetry += 1);
    const job = cdp
      .send("Network.getResponseBody", { requestId: e.requestId })
      .then(({ body, base64Encoded }) => {
        const url = scrub.text(r.url);
        const text = isTextType(r.ct, r.type);
        let data = base64Encoded ? Buffer.from(body, "base64") : Buffer.from(body, "utf8");
        // Reddit's public bundles are the same file for everyone and hold no
        // account data; rewriting them would only corrupt their code (e.g. a
        // `loid="${…}"` template). They are still leak-checked below.
        if (text && !isPublicStaticAsset(r.url, r.type)) {
          data = Buffer.from(scrub.text(data.toString("utf8")), "utf8");
        }
        const post = r.postData ? scrub.text(r.postData) : null;
        const file = `${sha1(`${r.method} ${url} ${post || ""} ${log.length}`)}${text ? ".txt" : ".bin"}`;
        fs.writeFileSync(path.join(bodiesDir, file), data);
        log.push({
          page: r.page,
          method: r.method,
          url,
          status: r.status,
          ct: r.ct,
          type: r.type,
          body: file,
          text,
          postKey: post ? sha1(post) : null,
        });
      })
      .catch(() => void (skipped.other += 1)); // redirects / evicted bodies have none
    pending.add(job);
    job.finally(() => pending.delete(job));
  });

  const settle = async () => {
    await tab.waitForNetworkIdle({ idleTime: 1500, timeout: 15_000 }).catch(() => {});
  };
  // Reddit's invisible JS check can reload the page right after it loads,
  // which detaches the frame mid-call: settle and try once more.
  const inPage = async (fn) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await tab.evaluate(fn);
      } catch (err) {
        if (attempt >= 2 || !/detached|context was destroyed|navigat/i.test(String(err?.message))) throw err;
        await settle();
      }
    }
  };

  // 3. Visit each page.
  // Links each picker chose, per page: picks[slug][picker] = url.
  const picks = {};
  const wanted = new Set(pages.filter((p) => p.pick).map((p) => p.pick));
  // A picker page expands to one visit per picked link (`count`, default 1).
  const visits = [];
  const visited = [];
  for (const p of pages) visits.push(p);
  for (let vi = 0; vi < visits.length; vi++) {
    const p = visits[vi];
    currentSlug = p.slug;
    let target = p.path ? ORIGIN + p.path : p.url || null;
    if (p.pick && !p.url) {
      const links = (picks[p.from]?.[p.pick] || []).slice(0, p.count || 1);
      if (!links.length) {
        console.warn(`skip ${p.slug}: ${p.pick} found no link on ${p.from}`);
        continue;
      }
      target = links[0];
      visits.splice(vi + 1, 0, ...links.slice(1).map((url, i) => ({ ...p, slug: `${p.slug}-${i + 2}`, url })));
    }
    console.log(`page ${p.slug}: ${new URL(target).pathname}`);
    visited.push(p.slug);
    await tab.goto(target, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await assertNotChallenged();
    await settle();
    picks[p.slug] = {};
    for (const name of wanted) {
      picks[p.slug][name] = await inPage(PICKERS[name]).catch(() => null);
    }
    for (let i = 0; i < (p.scrolls || 0); i++) {
      await inPage(() => window.scrollBy(0, window.innerHeight * 2));
      await settle();
    }
    await sleep(4000 + Math.random() * 4000); // gentle on Reddit between pages
  }
  await Promise.allSettled([...pending]);

  // 4. Leak check: every stored text body and every recorded address.
  const needles = scrub.needles(cookieValues);
  const leaks = [];
  for (const e of log) {
    const hits = findLeaks(`${e.url} ${e.location || ""}`, needles);
    if (e.body && e.text) Object.assign(hits, findLeaks(fs.readFileSync(path.join(bodiesDir, e.body), "utf8"), needles));
    if (Object.keys(hits).length) leaks.push({ body: e.body || null, page: e.page, hits });
  }
  writeJson(path.join(setDir, "log.json"), log);
  const version = await browser.version().catch(() => "");
  writeJson(path.join(setDir, "set.json"), {
    at: new Date().toISOString(),
    browser: version,
    signedIn: !!identity.name,
    pages: visited,
    responses: log.length,
    skipped,
    scrubbedSecrets: scrub.secrets.size,
    leaks: leaks.length,
    leakFiles: leaks,
  });
  const mb = log
    .filter((e) => e.body)
    .reduce((n, e) => n + fs.statSync(path.join(bodiesDir, e.body)).size, 0) / 1e6;
  console.log(
    `Recorded ${log.length} responses (${mb.toFixed(1)} MB) from ${visited.length} pages; ` +
      `skipped ${skipped.media} media, ${skipped.telemetry} telemetry. → ${setDir}`,
  );
  if (leaks.length) {
    exitCode = 1;
    console.error(
      `LEAK CHECK FAILED: ${leaks.length} files still hold account or sign-in data ` +
        `(kinds: ${[...new Set(leaks.flatMap((l) => Object.keys(l.hits)))].join(", ")}). ` +
        "The set is kept for diagnosis but replay will not use it.",
    );
  } else {
    console.log("Leak check passed.");
  }
} catch (err) {
  exitCode = 1;
  console.error(String(err?.message || err));
} finally {
  await tab.close().catch(() => {});
  browser.disconnect();
}
process.exit(exitCode);
