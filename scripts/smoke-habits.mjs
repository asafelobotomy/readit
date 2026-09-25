/**
 * Live smoke for the 0.3.0 “classic habits” features on New Reddit:
 * sticky comment sort, open in new tab, All · Global.
 *
 * Runs against a browser you already use (your logged-in profile), so it:
 *   - works in its own tabs and closes only those
 *   - backs up readit's settings first and always restores them
 *   - never votes, joins or changes Reddit account settings
 *
 *   READIT_CDP=chrome npm run smoke:habits      (chrome://inspect remote debugging)
 *   READIT_CDP=http://127.0.0.1:9222 npm run smoke:habits
 *   READIT_SKIP_RELOAD=1 skips reloading the unpacked extension first.
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectCdp } from "./smoke-cdp.mjs";
import { evidenceDir, repoRelative } from "./smoke-paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = evidenceDir(root, "habits");
fs.mkdirSync(outDir, { recursive: true });
// Your real settings (usernotes, tags…) — always in the git-ignored folder,
// even when READIT_EVIDENCE_DIR points results at committed docs.
const backupFile = path.join(root, ".smoke-evidence", "habits-settings-backup.json");
fs.mkdirSync(path.dirname(backupFile), { recursive: true });

const SUB = "AskReddit";
const SUB_URL = `https://www.reddit.com/r/${SUB}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function record(id, status, detail = "") {
  results.push({ id, status, detail });
  const mark = status === "pass" ? "PASS" : status === "fail" ? "FAIL" : "SKIP";
  console.log(`[${mark}] ${id}${detail ? " — " + detail : ""}`);
}

async function waitFor(page, fn, arg, timeout = 8000) {
  try {
    await page.waitForFunction(fn, { timeout, polling: 150 }, arg);
    return true;
  } catch {
    return false;
  }
}

async function resolveExtensionId(browser) {
  const page = await browser.newPage();
  try {
    await page.goto("chrome://extensions", { waitUntil: "domcontentloaded" });
    await sleep(800);
    return await page.evaluate(() => {
      const list = document
        .querySelector("extensions-manager")
        ?.shadowRoot?.querySelector("extensions-item-list")?.shadowRoot;
      for (const item of list?.querySelectorAll("extensions-item") || []) {
        const name = item.shadowRoot?.querySelector("#name")?.textContent?.trim();
        if (name?.toLowerCase() === "readit") return item.id;
      }
      return "";
    });
  } finally {
    await page.close().catch(() => {});
  }
}

async function reloadExtension(browser, id) {
  const page = await browser.newPage();
  try {
    await page.goto(`chrome://extensions/?id=${id}`, { waitUntil: "domcontentloaded" });
    await sleep(700);
    const clicked = await page.evaluate((extId) => {
      const mgr = document.querySelector("extensions-manager")?.shadowRoot;
      const item = mgr
        ?.querySelector("extensions-item-list")
        ?.shadowRoot?.querySelector(`extensions-item#${CSS.escape(extId)}`);
      const btn =
        item?.shadowRoot?.querySelector("#dev-reload-button") ||
        mgr?.querySelector("extensions-detail-view")?.shadowRoot?.querySelector("#dev-reload-button");
      if (btn instanceof HTMLElement) {
        btn.click();
        return true;
      }
      return false;
    }, id);
    await sleep(1500);
    return clicked;
  } finally {
    await page.close().catch(() => {});
  }
}

/** Read / write readit's stored settings through an extension page. */
function settingsStore(extPage) {
  return {
    get: () =>
      extPage.evaluate(async () => (await chrome.storage.local.get("readitSettings")).readitSettings),
    set: (value) =>
      extPage.evaluate(async (v) => chrome.storage.local.set({ readitSettings: v }), value),
  };
}

async function patchSettings(store, patch) {
  const current = await store.get();
  await store.set(patch(structuredClone(current)));
  await sleep(900); // content scripts re-apply on the storage change
}

const browser = await connectCdp(puppeteer, process.env.READIT_CDP || "chrome");
/** Tabs that were already open — the only ones cleanup must never touch. */
const preexisting = new Set(browser.targets().filter((t) => t.type() === "page"));
const opened = [];
const newPage = async () => {
  const p = await browser.newPage();
  opened.push(p);
  return p;
};

let store = null;
let backup = null;

try {
  const extId = await resolveExtensionId(browser);
  if (!extId) throw new Error("readit is not installed in this browser");
  if (!process.env.READIT_SKIP_RELOAD) {
    const ok = await reloadExtension(browser, extId);
    console.log(ok ? "Reloaded readit" : "Could not click Reload (continuing)");
  }
  const extPage = await newPage();
  await extPage.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: "domcontentloaded" });
  store = settingsStore(extPage);
  backup = await store.get();
  if (!backup) throw new Error("no readit settings stored yet — open Reddit once first");
  fs.writeFileSync(backupFile, JSON.stringify(backup));

  // Known state: comment sort on (fixed "new"), the other two off.
  await patchSettings(store, (s) => {
    s.paused = false;
    s.flags = { ...s.flags, commentSort: true, openInNewTab: false, allFeed: false };
    s.commentSortPrefs = { mode: "fixed", sort: "new", applyOnDirectLoad: false, remembered: {} };
    s.linkPrefs = { posts: true, communities: false, users: false, inModQueue: false };
    s.allFeedPrefs = { sort: "hot", navLink: true, rewriteLinks: true };
    return s;
  });

  const page = await newPage();
  await page.goto(SUB_URL, { waitUntil: "domcontentloaded" });
  await waitFor(page, () => document.querySelectorAll("shreddit-post").length > 3);

  // —— selectors the features depend on ——
  const sel = await page.evaluate(() => ({
    pdp: document.querySelector("shreddit-post")?.getAttribute("pdp-target") ?? null,
    topSection: !!document.querySelector("left-nav-top-section"),
    fullLink: !!document.querySelector('shreddit-post a[slot="full-post-link"]'),
  }));
  record("habits.selectors", sel.pdp !== null && sel.topSection && sel.fullLink ? "pass" : "fail", JSON.stringify(sel));

  // —— comment sort: feed links carry ?sort=new ——
  const stamped = await waitFor(page, () => {
    const links = [...document.querySelectorAll('shreddit-post a[slot="full-post-link"]')];
    return links.length > 0 && links.every((a) => /[?&]sort=new\b/.test(a.getAttribute("href") || ""));
  });
  const linkStats = await page.evaluate(() => {
    const links = [...document.querySelectorAll('shreddit-post a[href*="/comments/"]')];
    return { total: links.length, sorted: links.filter((a) => /[?&]sort=/.test(a.getAttribute("href") || "")).length };
  });
  record("habits.sort.links", stamped ? "pass" : "fail", `${linkStats.sorted}/${linkStats.total} thread links sorted`);

  // —— comment sort: a card click lands on the sorted thread ——
  // Top of the day, so the thread has comments and Reddit renders its sort menu.
  await page.goto(`${SUB_URL}top/?t=day`, { waitUntil: "domcontentloaded" });
  await waitFor(page, () =>
    [...document.querySelectorAll('shreddit-post a[slot="full-post-link"]')].some((a) =>
      /[?&]sort=new\b/.test(a.getAttribute("href") || ""),
    ),
  );
  const box = await page.evaluate(() => {
    const posts = [...document.querySelectorAll("shreddit-post")];
    const post =
      posts.find((p) => Number(p.getAttribute("comment-count")) >= 5) ?? posts[1] ?? posts[0];
    post.scrollIntoView({ block: "center" });
    const r = post.getBoundingClientRect();
    return { x: r.right - 40, y: r.top + r.height * 0.55 };
  });
  await sleep(300);
  await page.mouse.click(box.x, box.y);
  const onThread = await waitFor(page, () => /\/comments\//.test(location.pathname));
  await waitFor(page, () => !!document.querySelector('shreddit-sort-dropdown[telemetry-source="comment_sort"]'));
  const thread = await page.evaluate(() => ({
    url: location.pathname + location.search,
    label: document
      .querySelector('shreddit-sort-dropdown[telemetry-source="comment_sort"]')
      ?.getAttribute("button-aria-label"),
  }));
  record(
    "habits.sort.click",
    onThread && /sort=new/.test(thread.url) && thread.label === "Sort by New" ? "pass" : "fail",
    `${thread.url} · ${thread.label}`,
  );
  const threadPath = thread.url.split("?")[0];

  // —— remember mode: a pick in the sort menu is stored for the subreddit ——
  // Uses a stand-in menu so Reddit's real dropdown (and the account) are untouched.
  await patchSettings(store, (s) => {
    s.commentSortPrefs.mode = "remember";
    return s;
  });
  await page.evaluate(() => {
    const menu = document.createElement("shreddit-sort-dropdown");
    menu.setAttribute("telemetry-source", "comment_sort");
    menu.id = "readit-smoke-sort";
    menu.style.display = "none";
    menu.innerHTML = '<data value="OLD"><span id="readit-smoke-sort-old">Old</span></data>';
    document.body.append(menu);
    document.getElementById("readit-smoke-sort-old").dispatchEvent(
      new MouseEvent("click", { bubbles: true, composed: true }),
    );
    menu.remove();
  });
  await sleep(1200);
  const remembered = (await store.get()).commentSortPrefs.remembered;
  record(
    "habits.sort.remember",
    remembered[SUB.toLowerCase()] === "old" ? "pass" : "fail",
    JSON.stringify(remembered),
  );

  // —— direct load: redirect timing (did the unsorted page paint first?) ——
  await patchSettings(store, (s) => {
    s.commentSortPrefs = { ...s.commentSortPrefs, mode: "fixed", sort: "top", applyOnDirectLoad: true };
    return s;
  });
  const direct = await newPage();
  const cdp = await direct.createCDPSession();
  await cdp.send("Page.enable");
  await cdp.send("Page.setLifecycleEventsEnabled", { enabled: true });
  const mainFrameId = (await cdp.send("Page.getFrameTree")).frameTree.frame.id;
  const lifecycle = [];
  cdp.on("Page.lifecycleEvent", (e) => {
    if (e.frameId === mainFrameId) lifecycle.push({ name: e.name, loaderId: e.loaderId, t: e.timestamp });
  });
  const t0 = Date.now();
  await direct.goto(`https://www.reddit.com${threadPath}`, { waitUntil: "domcontentloaded" });
  await waitFor(direct, () => /[?&]sort=top\b/.test(location.search), undefined, 10000);
  const redirectMs = Date.now() - t0;
  const loaders = [...new Set(lifecycle.map((e) => e.loaderId))];
  const firstLoaderPaints = lifecycle.filter(
    (e) => e.loaderId === loaders[0] && /^first(Contentful|Meaningful)?Paint$/.test(e.name),
  );
  const landed = direct.url();
  record(
    "habits.sort.direct",
    /[?&]sort=top\b/.test(landed) ? "pass" : "fail",
    `→ ${new URL(landed).search} in ${redirectMs}ms; main-frame documents=${loaders.length}; unsorted page painted=${firstLoaderPaints.length > 0 ? firstLoaderPaints.map((e) => e.name).join("+") : "no"}`,
  );
  await direct.close();

  // —— open in new tab ——
  await patchSettings(store, (s) => {
    s.flags = { ...s.flags, commentSort: false, openInNewTab: true };
    s.commentSortPrefs.applyOnDirectLoad = false;
    return s;
  });
  await page.goto(SUB_URL, { waitUntil: "domcontentloaded" });
  await waitFor(page, () => document.querySelectorAll("shreddit-post").length > 3);
  const blank = await waitFor(page, () =>
    [...document.querySelectorAll("shreddit-post")].every((p) => p.getAttribute("pdp-target") === "_blank"),
  );
  record("habits.newtab.stamp", blank ? "pass" : "fail", "pdp-target=_blank on every post");
  const before = page.url();
  // Only new tabs count (Reddit also spins up iframes such as reCAPTCHA).
  const newTabs = [];
  const onTarget = (t) => {
    if (t.type() === "page") newTabs.push(t);
  };
  browser.on("targetcreated", onTarget);
  const box2 = await page.evaluate(() => {
    const post = [...document.querySelectorAll("shreddit-post")].find(
      (p) => p.getBoundingClientRect().top > 120,
    );
    post.scrollIntoView({ block: "center" });
    const r = post.getBoundingClientRect();
    return { x: r.right - 40, y: r.top + r.height * 0.55 };
  });
  await sleep(300);
  await page.mouse.click(box2.x, box2.y);
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(150);
    target = newTabs.find((t) => /\/comments\//.test(t.url())) ?? null;
  }
  browser.off("targetcreated", onTarget);
  for (const t of newTabs) {
    const tabPage = await t.page().catch(() => null);
    if (tabPage) opened.push(tabPage);
  }
  const tabUrl = target?.url() ?? "";
  record(
    "habits.newtab.click",
    target && /\/comments\//.test(tabUrl) && page.url() === before ? "pass" : "fail",
    target ? `new tab ${new URL(tabUrl).pathname}; original stayed on ${new URL(page.url()).pathname}` : "no new tab",
  );

  // —— Pop-out: posts open in a dialog over the feed ——
  await patchSettings(store, (s) => {
    s.flags = { ...s.flags, openInNewTab: true };
    s.linkPrefs = { ...s.linkPrefs, posts: true, postsOpenIn: "popout" };
    return s;
  });
  const popPage = page;
  // The new-tab check left its tab in front; clicks belong on this one.
  for (const t of newTabs) {
    const tabPage = await t.page().catch(() => null);
    await tabPage?.close().catch(() => {});
  }
  await popPage.bringToFront();
  const popState = () =>
    popPage.evaluate(() => {
      const r = document.getElementById("readit-popout-host")?.shadowRoot;
      const f = r?.querySelector("iframe");
      let d = null;
      try {
        d = f?.contentDocument ?? null;
      } catch {
        /* cross-origin */
      }
      const shown = (sel) => {
        const e = d?.querySelector(sel);
        return e ? getComputedStyle(e).display !== "none" : null;
      };
      return {
        open: !!r,
        top: location.pathname + location.search,
        frame: f?.contentWindow?.location.pathname ?? null,
        title: r?.querySelector(".t")?.textContent ?? "",
        loadingHidden: r?.querySelector(".loading")?.hidden ?? null,
        comments: d?.querySelectorAll("shreddit-comment").length ?? 0,
        header: shown("reddit-header-large"),
        rightRail: shown("#right-sidebar-container"),
        back: shown("pdp-back-button"),
        overflow: document.documentElement.style.overflow,
      };
    });
  const waitPopReady = () =>
    waitFor(
      popPage,
      () => {
        const r = document.getElementById("readit-popout-host")?.shadowRoot;
        const d = r?.querySelector("iframe")?.contentDocument;
        return !!(r?.querySelector(".loading")?.hidden && d?.querySelector("shreddit-comment"));
      },
      undefined,
      25000,
    );
  await popPage.goto(`${SUB_URL}top/?t=day`, { waitUntil: "domcontentloaded" });
  await waitFor(popPage, () => document.querySelectorAll("shreddit-post").length > 3);
  // readit starts at document_idle, after the server-rendered posts exist.
  await waitFor(popPage, () => document.documentElement.classList.contains("readit-active"));
  await sleep(800);
  const feedUrl = await popPage.evaluate(() => location.pathname + location.search);
  const card = await popPage.evaluate(() => {
    const post = document.querySelectorAll("shreddit-post")[1];
    post.scrollIntoView({ block: "center" });
    const r = post.getBoundingClientRect();
    return { x: r.right - 60, y: r.top + r.height * 0.5, path: new URL(post.getAttribute("permalink"), location.origin).pathname };
  });
  await sleep(300);
  const pagesBefore = (await browser.pages()).length;
  await popPage.mouse.click(card.x, card.y);
  await waitPopReady();
  const pop1 = await popState();
  record(
    "habits.popout.open",
    pop1.open && pop1.top === feedUrl && pop1.frame === card.path && pop1.comments > 0 && pop1.loadingHidden && (await browser.pages()).length === pagesBefore
      ? "pass"
      : "fail",
    `frame ${pop1.frame} · ${pop1.comments} comments · feed URL kept: ${pop1.top === feedUrl}`,
  );
  record(
    "habits.popout.chrome",
    pop1.header === false && pop1.rightRail === false && pop1.back === false && pop1.overflow === "hidden" ? "pass" : "fail",
    `header=${pop1.header} rail=${pop1.rightRail} back=${pop1.back} scroll-lock=${pop1.overflow}`,
  );
  await popPage.screenshot({ path: path.join(outDir, "popout.png") });

  // Next post
  await popPage.evaluate(() =>
    document.getElementById("readit-popout-host")?.shadowRoot?.querySelector('button[aria-label="Next post"]')?.click(),
  );
  await waitFor(popPage, (prev) => {
    const f = document.getElementById("readit-popout-host")?.shadowRoot?.querySelector("iframe");
    return f?.contentWindow?.location.pathname !== prev;
  }, pop1.frame);
  await waitPopReady();
  const pop2 = await popState();
  record(
    "habits.popout.next",
    pop2.open && pop2.frame && pop2.frame !== pop1.frame && pop2.title && pop2.title !== pop1.title ? "pass" : "fail",
    `${pop2.frame} · “${pop2.title.slice(0, 40)}”`,
  );

  // Unsent comment: closing asks first. Text is typed, never submitted.
  const framed = popPage.frames().find((f) => f.url().includes(pop2.frame));
  let draftOk = false;
  let draftDetail = "no framed page";
  if (framed) try {
    await framed.evaluate(() => {
      const host = document.querySelector("comment-composer-host");
      host?.scrollIntoView({ block: "center" });
      (host?.querySelector("faceplate-textarea-input") ?? host)?.click();
    });
    const editor = await framed
      .waitForSelector('comment-composer-host [contenteditable="true"], shreddit-composer [contenteditable="true"]', { timeout: 8000 })
      .catch(() => null);
    if (editor) {
      await editor.evaluate((e) => {
        e.scrollIntoView({ block: "center" });
        e.focus();
      });
      await popPage.keyboard.type("readit smoke draft (never sent)", { delay: 5 });
      // Esc while typing belongs to Reddit's composer, not the pop-out.
      await popPage.keyboard.press("Escape");
      await sleep(300);
      const stillOpen = await popPage.evaluate(() => !!document.getElementById("readit-popout-host"));
      record("habits.popout.esc-typing", stillOpen ? "pass" : "fail", `open after Esc in the composer: ${stillOpen}`);
      await popPage.evaluate(() =>
        document.getElementById("readit-popout-host")?.shadowRoot?.querySelector('button[aria-label="Close"]')?.click(),
      );
      await sleep(300);
      const asked = await popPage.evaluate(() => {
        const r = document.getElementById("readit-popout-host")?.shadowRoot;
        return !!r && r.querySelector(".confirm")?.hidden === false;
      });
      await popPage.evaluate(() =>
        document.getElementById("readit-popout-host")?.shadowRoot?.querySelector(".confirm .discard")?.click(),
      );
      await sleep(300);
      const closed = !(await popPage.evaluate(() => !!document.getElementById("readit-popout-host")));
      draftOk = asked && closed;
      draftDetail = `asked before closing: ${asked} · closed after Discard: ${closed}`;
    } else {
      draftDetail = "composer did not open";
    }
  } catch (err) {
    draftDetail = `error: ${err instanceof Error ? err.message : err}`;
  }
  record("habits.popout.draft", draftOk ? "pass" : "fail", draftDetail);

  // Comments pill (a link inside the card's shadow DOM) also opens the pop-out.
  const pill = await popPage.evaluate(() => {
    const post = document.querySelectorAll("shreddit-post")[2];
    post.scrollIntoView({ block: "center" });
    const a = post.shadowRoot?.querySelector('a[name="comments-action-button"]');
    const r = a?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, path: new URL(post.getAttribute("permalink"), location.origin).pathname } : null;
  });
  if (pill) {
    await sleep(300);
    await popPage.mouse.click(pill.x, pill.y);
    await waitPopReady();
    const pop3 = await popState();
    record("habits.popout.comments", pop3.open && pop3.frame === pill.path && pop3.top === feedUrl ? "pass" : "fail", `${pop3.frame}`);
    // Esc closes and gives the page its scrolling back.
    await popPage.evaluate(() => document.getElementById("readit-popout-host")?.shadowRoot?.querySelector('button[aria-label="Close"]')?.focus());
    await popPage.keyboard.press("Escape");
    await sleep(300);
    const pop4 = await popState();
    record("habits.popout.esc", !pop4.open && pop4.overflow === "" ? "pass" : "fail", `open=${pop4.open} overflow="${pop4.overflow}"`);
  } else {
    record("habits.popout.comments", "skip", "comments pill not found");
    record("habits.popout.esc", "skip", "needs an open pop-out");
  }

  // —— Browser Back closes the pop-out ——
  // Positions come from the Navigation API (history.state is Reddit's too).
  const isOpen = () => popPage.evaluate(() => !!document.getElementById("readit-popout-host"));
  const histInfo = () =>
    popPage.evaluate(() => ({
      idx: navigation.currentEntry.index,
      path: location.pathname + location.search,
      y: Math.round(scrollY),
      card: !!window.__smokeCard?.isConnected,
    }));
  const openCard = async (index) => {
    const pt = await popPage.evaluate((i) => {
      const post = document.querySelectorAll("shreddit-post")[i];
      post.scrollIntoView({ block: "center" });
      window.__smokeCard = post;
      const r = post.getBoundingClientRect();
      return { x: r.right - 60, y: r.top + r.height / 2 };
    }, index);
    await sleep(300);
    const before = await histInfo();
    await popPage.mouse.click(pt.x, pt.y);
    await waitPopReady();
    return before;
  };
  const clickClose = () =>
    popPage.evaluate(() =>
      document.getElementById("readit-popout-host")?.shadowRoot?.querySelector('button[aria-label="Close"]')?.click(),
    );
  const goBack = async () => {
    await popPage.evaluate(() => history.back());
    await sleep(1000);
  };

  const h0 = await openCard(1);
  const h1 = await histInfo();
  await goBack();
  const h2 = await histInfo();
  record(
    "habits.popout.back",
    h1.idx === h0.idx + 1 && !(await isOpen()) && h2.idx === h0.idx && h2.card && Math.abs(h2.y - h0.y) <= 4 && h2.path === feedUrl
      ? "pass"
      : "fail",
    `entry pushed: ${h1.idx === h0.idx + 1} · closed by Back: ${!(await isOpen())} · same feed card: ${h2.card} · scroll ${h0.y}→${h2.y}`,
  );

  // Forward reopens it; Back after “next post” still closes in one step.
  await popPage.evaluate(() => history.forward());
  await waitPopReady();
  const reopenedByForward = await isOpen();
  await popPage.evaluate(() =>
    document.getElementById("readit-popout-host")?.shadowRoot?.querySelector('button[aria-label="Next post"]')?.click(),
  );
  await sleep(1500);
  await waitPopReady();
  await goBack();
  const h3 = await histInfo();
  record(
    "habits.popout.forward-next",
    reopenedByForward && !(await isOpen()) && h3.idx === h0.idx && h3.card ? "pass" : "fail",
    `Forward reopened: ${reopenedByForward} · one Back after Next closed it: ${!(await isOpen())} · idx ${h3.idx}/${h0.idx}`,
  );

  // × steps off the entry, so the next Back leaves the feed page as usual.
  const h4 = await openCard(1);
  await clickClose();
  await sleep(1200);
  const h5 = await histInfo();
  record(
    "habits.popout.close-rewinds",
    h5.idx === h4.idx && !(await isOpen()) && h5.card && Math.abs(h5.y - h4.y) <= 4 ? "pass" : "fail",
    `back on the feed entry: ${h5.idx === h4.idx} · scroll ${h4.y}→${h5.y}`,
  );

  // A navigation inside the frame (its own history entry) still unwinds on ×.
  const h6a = await openCard(2);
  const otherThread = await popPage.evaluate(
    () => document.querySelectorAll("shreddit-post")[3]?.getAttribute("permalink"),
  );
  await popPage.evaluate((href) => {
    const f = document.getElementById("readit-popout-host")?.shadowRoot?.querySelector("iframe");
    f?.contentWindow?.location.assign(href);
  }, otherThread);
  await sleep(3500);
  await clickClose();
  await sleep(2500);
  const h6 = await histInfo();
  record(
    "habits.popout.close-after-frame-nav",
    h6.idx === h6a.idx && h6.path === feedUrl && !(await isOpen()) ? "pass" : "fail",
    `back on the feed entry: ${h6.idx === h6a.idx} (idx ${h6.idx}/${h6a.idx})`,
  );

  // Back with an unsent comment puts the entry back and asks first.
  const h7 = await openCard(1);
  const framedB = popPage.frames().find((fr) => fr !== popPage.mainFrame() && /\/comments\//.test(fr.url()));
  if (framedB) {
    try {
      await framedB.evaluate(() => {
        const host = document.querySelector("comment-composer-host");
        host?.scrollIntoView({ block: "center" });
        (host?.querySelector("faceplate-textarea-input") ?? host)?.click();
      });
      const ed = await framedB.waitForSelector(
        'comment-composer-host [contenteditable="true"], shreddit-composer [contenteditable="true"]',
        { timeout: 8000 },
      );
      await ed.evaluate((e) => e.focus());
      await popPage.keyboard.type("readit smoke draft (never sent)", { delay: 5 });
      await goBack();
      const asked = await popPage.evaluate(
        () => document.getElementById("readit-popout-host")?.shadowRoot?.querySelector(".confirm")?.hidden === false,
      );
      const hB = await histInfo();
      await popPage.evaluate(() =>
        document.getElementById("readit-popout-host")?.shadowRoot?.querySelector(".confirm .discard")?.click(),
      );
      await sleep(1200);
      const hC = await histInfo();
      record(
        "habits.popout.back-draft",
        asked && hB.idx === h7.idx + 1 && !(await isOpen()) && hC.idx === h7.idx ? "pass" : "fail",
        `asked: ${asked} · entry restored: ${hB.idx === h7.idx + 1} · after Discard on the feed entry: ${hC.idx === h7.idx}`,
      );
    } catch (err) {
      record("habits.popout.back-draft", "fail", String(err instanceof Error ? err.message : err));
    }
  } else {
    record("habits.popout.back-draft", "fail", "no framed page");
  }

  // A community link inside the pop-out opens in the tab, closing the dialog.
  await popPage.mouse.click(card.x, card.y).catch(() => {});
  const reopened = await waitPopReady();
  const framed2 = popPage.frames().find((f) => /\/comments\//.test(f.url()) && f !== popPage.mainFrame());
  if (reopened && framed2) {
    // The click navigates the tab, which can tear down this frame mid-call.
    const clickedSub = await framed2.evaluate(() => {
      // The post header's community link, wherever Reddit renders it.
      const find = (root) => {
        for (const a of root.querySelectorAll("a[href]")) {
          const r = a.getBoundingClientRect();
          if (/^(https:\/\/www\.reddit\.com)?\/r\/[^/]+\/?$/.test(a.getAttribute("href") || "") && r.width > 0) return a;
        }
        for (const el of root.querySelectorAll("*")) {
          const hit = el.shadowRoot && find(el.shadowRoot);
          if (hit) return hit;
        }
        return null;
      };
      const a = find(document);
      const href = a?.getAttribute("href") ?? null;
      if (a) setTimeout(() => a.click(), 0);
      return href;
    }).catch(() => "navigated");
    if (!clickedSub) console.log("  (no community link found in the pop-out)");
    const left = await waitFor(popPage, () => !document.getElementById("readit-popout-host") && /^\/r\/AskReddit\/?$/i.test(location.pathname), undefined, 12000);
    record("habits.popout.links", left ? "pass" : "fail", `tab now at ${new URL(popPage.url()).pathname}`);
  } else {
    record("habits.popout.links", "fail", "could not reopen the pop-out");
  }

  // —— All · Global ——
  await patchSettings(store, (s) => {
    s.flags = { ...s.flags, openInNewTab: false, allFeed: true };
    return s;
  });
  await page.goto(SUB_URL, { waitUntil: "domcontentloaded" });
  const hasLink = await waitFor(page, () => {
    const top = document.querySelector("left-nav-top-section");
    return !!top?.nextElementSibling?.classList.contains("readit-all-link-wrap");
  });
  const linkInfo = await page.evaluate(() => {
    const a = document.querySelector(".readit-all-link");
    const r = a?.getBoundingClientRect();
    return {
      href: a?.getAttribute("href") ?? null,
      visible: !!r && r.width > 0 && r.height > 0,
      rail: !!document.querySelector('#readit-nav-rail a[href*="geo_filter=global"]'),
      railMounted: !!document.querySelector("#readit-nav-rail"),
    };
  });
  record(
    "habits.all.navlink",
    hasLink && linkInfo.href === "/r/popular/hot/?geo_filter=global" ? "pass" : "fail",
    JSON.stringify(linkInfo),
  );
  if (linkInfo.railMounted) {
    const inRail = await waitFor(page, () => !!document.querySelector('#readit-nav-rail a[href*="geo_filter=global"]'));
    record("habits.all.rail", inRail ? "pass" : "fail", "All · Global item in the compact nav rail");
  } else {
    record("habits.all.rail", "skip", "nav rail not mounted (left nav wider than 168px)");
  }
  await page.screenshot({ path: path.join(outDir, "all-link.png") });

  await page.evaluate(() => {
    const a = document.createElement("a");
    a.id = "readit-smoke-all";
    a.href = "/r/all/";
    a.textContent = "r/all";
    document.querySelector("shreddit-feed")?.before(a) ?? document.body.append(a);
  });
  const rewritten = await waitFor(page, () =>
    document.getElementById("readit-smoke-all")?.getAttribute("href") === "/r/popular/hot/?geo_filter=global",
  );
  record("habits.all.rewrite", rewritten ? "pass" : "fail", "in-page /r/all link → global Popular");
  await page.evaluate(() => document.getElementById("readit-smoke-all")?.remove());

  const navOk = await page.evaluate(() => {
    const a = document.querySelector(".readit-all-link");
    if (!a) return false;
    a.click();
    return true;
  });
  const onAll = navOk && (await waitFor(page, () => /\/r\/popular\/hot\//.test(location.pathname) && /geo_filter=global/i.test(location.search)));
  // Reddit may route this in-app; readit re-applies on its location change.
  await waitFor(page, () => document.querySelector(".readit-all-link")?.getAttribute("aria-current") === "page");
  const current = await page.evaluate(() => document.querySelector(".readit-all-link")?.getAttribute("aria-current"));
  record("habits.all.open", onAll && current === "page" ? "pass" : "fail", `${new URL(page.url()).pathname}${new URL(page.url()).search} · aria-current=${current}`);

  // —— switching everything off restores Reddit's own attributes ——
  await patchSettings(store, (s) => {
    s.flags = { ...s.flags, commentSort: true, openInNewTab: true, allFeed: true };
    s.commentSortPrefs.applyOnDirectLoad = false;
    return s;
  });
  await page.goto(SUB_URL, { waitUntil: "domcontentloaded" });
  await waitFor(page, () => document.querySelectorAll('shreddit-post[pdp-target="_blank"]').length > 3);
  await patchSettings(store, (s) => {
    s.flags = { ...s.flags, commentSort: false, openInNewTab: false, allFeed: false };
    return s;
  });
  const clean = await waitFor(page, () =>
    !document.querySelector("[data-readit-orig-href], [data-readit-orig-pdp-target], [data-readit-orig-target], .readit-all-link-wrap") &&
    [...document.querySelectorAll("shreddit-post")].every((p) => p.getAttribute("pdp-target") === "_self"),
  );
  record("habits.teardown", clean ? "pass" : "fail", "no stamps, pdp-target back to _self, nav link removed");
} catch (err) {
  record("habits.run", "fail", err instanceof Error ? err.message : String(err));
} finally {
  if (store && backup) {
    try {
      await store.set(backup);
      console.log("Restored your readit settings");
    } catch (err) {
      console.error("Could not restore settings — backup at", repoRelative(root, backupFile), err);
    }
  }
  for (const p of opened.reverse()) await p.close().catch(() => {});
  // Tabs Reddit opened for us (the new-tab check) that we never got a handle on.
  for (const t of browser.targets()) {
    if (t.type() !== "page" || preexisting.has(t)) continue;
    if (!/^(https:\/\/[a-z]+\.reddit\.com\/|chrome-extension:\/\/|about:blank)/.test(t.url())) continue;
    const p = await t.page().catch(() => null);
    await p?.close().catch(() => {});
  }
  await browser.disconnect();
}

const failed = results.filter((r) => r.status === "fail").length;
fs.writeFileSync(
  path.join(outDir, "results.json"),
  JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
);
console.log(`\n${results.length - failed}/${results.length} ok · ${repoRelative(root, outDir)}/results.json`);
process.exit(failed ? 1 : 0);
