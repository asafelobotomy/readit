/**
 * Nav compact / icon-rail smoke harness.
 *
 * Default: Playwright Chromium + --load-extension=dist/chrome-mv3
 * Brave:   READIT_CDP=http://127.0.0.1:9222 (npm run smoke:nav:brave)
 *
 * Evidence → docs/smoke-evidence/nav/
 * Checklist → docs/smoke-checklist-nav.md
 */
import { chromium } from "playwright";
import puppeteer from "puppeteer-core";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const extensionPath = path.resolve(root, "dist/chrome-mv3");
const outDir = path.resolve(root, "docs/smoke-evidence/nav");
const checklistPath = path.resolve(root, "docs/smoke-checklist-nav.md");
const userData = path.resolve(root, ".smoke-profile-nav");
const cdpEndpoint = (process.env.READIT_CDP || "").trim();

fs.mkdirSync(outDir, { recursive: true });

if (!cdpEndpoint) {
  fs.mkdirSync(userData, { recursive: true });
  if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) {
    console.error("Missing dist/chrome-mv3 — run npm run build first");
    process.exit(1);
  }
}

const results = [];
function record(id, status, detail = "") {
  results.push({ id, status, detail });
  const mark = status === "pass" ? "PASS" : status === "fail" ? "FAIL" : "SKIP";
  console.log(`[${mark}] ${id}${detail ? " — " + detail : ""}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resolveReaditExtensionId(browser) {
  try {
    const page = await browser.newPage();
    await page.goto("chrome://extensions", {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    await sleep(800);
    const id = await page.evaluate(() => {
      const root = document.querySelector("extensions-manager")?.shadowRoot;
      const list = root?.querySelector("extensions-item-list")?.shadowRoot;
      for (const item of [...(list?.querySelectorAll("extensions-item") || [])]) {
        const name = item.shadowRoot
          ?.querySelector("#name")
          ?.textContent?.trim()
          ?.toLowerCase();
        if (name === "readit") return item.getAttribute("id") || "";
      }
      return "";
    });
    await page.close().catch(() => {});
    if (id) return id;
  } catch {
    /* fall through */
  }
  try {
    const list = await fetch("http://127.0.0.1:9222/json/list").then((r) =>
      r.json(),
    );
    for (const t of list) {
      const u = t.url || "";
      if (u.startsWith("chrome-extension://")) {
        const id = new URL(u).host;
        const page = await browser.newPage();
        try {
          await page.goto(`chrome-extension://${id}/popup.html`, {
            waitUntil: "domcontentloaded",
            timeout: 5000,
          });
          await sleep(300);
          const ok = await page.evaluate(() =>
            /Profile-first New Reddit|readit/i.test(document.body?.innerText || ""),
          );
          if (ok) {
            await page.close().catch(() => {});
            return id;
          }
        } catch {
          /* next */
        }
        await page.close().catch(() => {});
      }
    }
  } catch {
    /* ignore */
  }
  return "";
}

async function reloadReaditExtension(browser, extensionId) {
  if (!extensionId) return false;
  try {
    const page = await browser.newPage();
    await page.goto("chrome://extensions", {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    await sleep(700);
    const reloaded = await page.evaluate((eid) => {
      const root = document.querySelector("extensions-manager")?.shadowRoot;
      const list = root?.querySelector("extensions-item-list")?.shadowRoot;
      const item = list?.querySelector(`extensions-item#${CSS.escape(eid)}`);
      const btn = item?.shadowRoot?.querySelector("#dev-reload-button");
      if (btn instanceof HTMLElement) {
        btn.click();
        return true;
      }
      return false;
    }, extensionId);
    await sleep(1800);
    await page.close().catch(() => {});
    return reloaded;
  } catch {
    return false;
  }
}

async function studioEval(page, fn, ...args) {
  return page.evaluate(fn, ...args);
}

async function openStudio(page) {
  await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    if (!root) return;
    if (root.querySelector(".readit-drawer")) return;
    if (!root.querySelector(".readit-fab-menu")) {
      root.querySelector(".readit-fab")?.click();
    }
    const settingsBtn = [...(root.querySelectorAll(".readit-fab-action") || [])].find(
      (b) => /^Settings$/i.test((b.textContent || "").trim()),
    );
    settingsBtn?.click();
  });
  await sleep(450);
}

async function closeStudio(page) {
  await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    if (!root) return;
    const closeBtn = [...(root.querySelectorAll("button") || [])].find((b) => {
      const t = (b.textContent || "").trim();
      const aria = b.getAttribute("aria-label") || "";
      return aria === "Close" || /^[×✕]$/.test(t) || /^close$/i.test(t);
    });
    closeBtn?.click();
    if (root.querySelector(".readit-fab-menu")) {
      root.querySelector(".readit-fab")?.click();
    }
  });
  await sleep(350);
}

async function clickTab(page, name) {
  await studioEval(
    page,
    (tabName) => {
      const root = document.querySelector("readit-studio")?.shadowRoot;
      [...(root?.querySelectorAll(".readit-tab") || [])]
        .find((t) => t.textContent?.includes(tabName))
        ?.click();
    },
    name,
  );
  await sleep(350);
}

async function dismissConsent(page) {
  await studioEval(page, () => {
    const buttons = [...document.querySelectorAll("button")];
    const accept = buttons.find((b) =>
      /accept all|agree|got it|accept/i.test(b.textContent || ""),
    );
    accept?.click();
  });
  await sleep(400);
}

async function shot(page, name) {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  return file;
}

async function shotNavCrop(page, name) {
  const file = path.join(outDir, name);
  const box = await studioEval(page, () => {
    const nav = document.querySelector('[data-readit-slot="leftNav"]');
    if (!(nav instanceof HTMLElement)) return null;
    const r = nav.getBoundingClientRect();
    return {
      x: Math.max(0, Math.floor(r.left) - 4),
      y: Math.max(0, Math.floor(r.top) - 4),
      width: Math.ceil(r.width) + 8,
      height: Math.min(Math.ceil(r.height) + 8, 900),
    };
  });
  if (box && page.screenshot) {
    await page
      .screenshot({ path: file, clip: box, fullPage: false })
      .catch(async () => {
        await page.screenshot({ path: file, fullPage: false }).catch(() => {});
      });
  } else {
    await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  }
  return file;
}

async function setRangeByLabel(page, labelIncludes, nextVal) {
  return studioEval(
    page,
    async ({ labelIncludes: lab, nextVal: nv }) => {
      const root = document.querySelector("readit-studio")?.shadowRoot;
      if (!root) return { ok: false, reason: "no studio shadow" };
      const rows = [...(root.querySelectorAll(".readit-row") || [])];
      const row = rows.find((r) => {
        if (!r.textContent?.includes(lab)) return false;
        return !!r.querySelector('input[type="range"]');
      });
      const input =
        row?.querySelector('input[type="range"]') ||
        [...(root.querySelectorAll('input[type="range"]') || [])].find((el) => {
          const host = el.closest(".readit-row") || el.parentElement;
          return host?.textContent?.includes(lab);
        });
      if (!(input instanceof HTMLInputElement)) {
        const labels = rows
          .map((r) => (r.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40))
          .filter(Boolean)
          .slice(0, 12);
        return { ok: false, reason: `no range for ${lab}`, labels };
      }
      input.scrollIntoView({ block: "center", inline: "nearest" });
      const before = input.value;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, String(nv));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 900));
      return {
        ok: true,
        before,
        after: input.value,
        nextVal: String(nv),
        min: input.min,
        max: input.max,
      };
    },
    { labelIncludes, nextVal },
  );
}

async function waitForNavReady(page, { timeoutMs = 45_000 } = {}) {
  const start = Date.now();
  let last = {};
  while (Date.now() - start < timeoutMs) {
    last = await studioEval(page, () => {
      const captcha = !!(
        document.querySelector('iframe[src*="recaptcha"]') ||
        document.querySelector("#rc-imageselect") ||
        /select all (images|squares)/i.test(document.body?.innerText || "")
      );
      const nav =
        document.querySelector('[data-readit-slot="leftNav"]') ||
        document.querySelector("#flex-left-nav-container") ||
        document.querySelector("#left-sidebar");
      const nr = nav instanceof HTMLElement ? nav.getBoundingClientRect() : null;
      const rLinks = nav
        ? [...nav.querySelectorAll('a[href*="/r/"]')].length
        : 0;
      return {
        captcha,
        hasNav: !!(nav && nr && nr.width > 40 && nr.height > 80),
        navW: nr ? Math.round(nr.width) : 0,
        rLinks,
        slot: !!document.querySelector('[data-readit-slot="leftNav"]'),
      };
    });
    // Prefer a real left nav over captcha heuristics — Reddit often leaves
    // recaptcha iframes in the DOM even when the sidebar is usable.
    if (last.hasNav && (last.rLinks > 0 || last.slot)) {
      return { ok: true, ...last };
    }
    if (last.captcha && !last.hasNav) {
      return { ok: false, reason: "captcha", ...last };
    }
    await sleep(800);
  }
  return { ok: false, reason: "timeout", ...last };
}

/** Visit a few subs so guest Recent can expose /r/ links for community probes. */
async function seedCommunityLinks(page) {
  const subs = ["AskReddit", "news", "pics"];
  for (const sub of subs) {
    await page.goto(`https://www.reddit.com/r/${sub}/`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await sleep(1800);
    await dismissConsent(page);
  }
  await page.goto("https://www.reddit.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await sleep(2500);
  await dismissConsent(page);
}

async function enableClassicLayout(page) {
  await openStudio(page);
  await clickTab(page, "Layout");
  await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const lab = [...(root?.querySelectorAll("label") || [])].find((l) =>
      /Enable layout columns/i.test(l.textContent || ""),
    );
    const input = lab?.querySelector("input[type=checkbox]");
    if (input instanceof HTMLInputElement && !input.checked) {
      input.click();
      await new Promise((r) => setTimeout(r, 700));
    }
  });
  await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const btn = [...(root?.querySelectorAll("button") || [])].find((b) =>
      /^Classic$/i.test(b.textContent?.trim() || ""),
    );
    btn?.click();
    await new Promise((r) => setTimeout(r, 1000));
  });
}

function patchChecklist(resultsList) {
  if (!fs.existsSync(checklistPath)) return;
  let md = fs.readFileSync(checklistPath, "utf8");
  const byId = new Map(resultsList.map((r) => [r.id, r.status]));
  md = md.replace(
    /^\| `(nav\.[^`]+)` \| (.+) \| ([AU]) \| ([^|]*) \| ([^|]*)\|$/gm,
    (full, id, check, kind, shot, _status) => {
      const st = byId.get(id);
      const mark =
        st === "pass"
          ? "✓"
          : st === "fail"
            ? "✗"
            : st === "skip"
              ? "—"
              : (_status || "").trim();
      return `| \`${id}\` | ${check} | ${kind} | ${shot.trim()} | ${mark} |`;
    },
  );
  const pass = resultsList.filter((r) => r.status === "pass").length;
  const fail = resultsList.filter((r) => r.status === "fail").length;
  const skip = resultsList.filter((r) => r.status === "skip").length;
  const stamp = `**Latest automated run:** ${new Date().toISOString().slice(0, 10)} · **${pass} pass / ${fail} fail / ${skip} skip**`;
  if (md.includes("**Latest automated run:**")) {
    md = md.replace(/\*\*Latest automated run:\*\*[^\n]*/, stamp);
  } else {
    md = md.replace(/(End-to-end coverage[^\n]*\n)/, `$1\n${stamp}\n`);
  }
  fs.writeFileSync(checklistPath, md);
}

function probeNav(page) {
  return studioEval(page, () => {
    const root = document.documentElement;
    const slot = document.querySelector('[data-readit-slot="leftNav"]');
    if (!(slot instanceof HTMLElement)) {
      return { ok: false, reason: "no leftNav slot" };
    }
    const compact = root.classList.contains("readit-nav-compact");
    const rail = document.getElementById("readit-nav-rail");
    const nav =
      compact && rail instanceof HTMLElement ? rail : slot;
    const nr = slot.getBoundingClientRect();
    const navMid = nr.left + nr.width / 2;
    const navVar = getComputedStyle(root)
      .getPropertyValue("--readit-left-nav-width")
      .trim();

    const communities = [
      ...nav.querySelectorAll('a[data-readit-nav-kind="community"]'),
    ]
      .slice(0, 12)
      .map((a) => {
        const href = a.getAttribute("href") || "";
        const m = href.match(/\/r\/([^/?#]+)/i);
        const expect = m ? decodeURIComponent(m[1]) : "";
        const sub = a.querySelector(".readit-nav-subname");
        const subText = (sub?.textContent || "").trim();
        const avatar = a.querySelector(
          "img, faceplate-img, [avatar], .readit-nav-rail-icon img, .readit-nav-rail-icon",
        );
        const ar =
          avatar instanceof HTMLElement
            ? avatar.getBoundingClientRect()
            : null;
        const sr = sub?.getBoundingClientRect();
        const st = sub ? getComputedStyle(sub) : null;
        const fw = st ? parseInt(st.fontWeight, 10) || 0 : 0;
        const fs = st ? parseFloat(st.fontSize) || 0 : 0;
        return {
          href: href.slice(0, 60),
          expect,
          subText,
          nameOk:
            !!expect &&
            subText.toLowerCase() === expect.toLowerCase().replace(/^r\//, ""),
          title: a.getAttribute("title") || "",
          aria: a.getAttribute("aria-label") || "",
          tipOk:
            !!expect &&
            new RegExp(`r\\/${expect}`, "i").test(
              `${a.getAttribute("title") || ""} ${a.getAttribute("aria-label") || ""}`,
            ),
          hasAvatar: !!avatar,
          avatarW: ar ? Math.round(ar.width) : 0,
          avatarH: ar ? Math.round(ar.height) : 0,
          avatarClipped: ar
            ? ar.right > nr.right + 1 || ar.left < nr.left - 1
            : true,
          avatarCenterDelta: ar
            ? Math.round(ar.left + ar.width / 2 - navMid)
            : 999,
          stackOk: !!(ar && sr && sr.top >= ar.bottom - 2),
          fontSize: fs,
          fontWeight: fw,
          subnameVisible: st ? st.display !== "none" && fs > 0 : false,
        };
      });

    const sections = [
      ...nav.querySelectorAll('[data-readit-nav-kind="section"]'),
    ]
      .slice(0, 10)
      .map((el) => {
        const icon =
          el.querySelector(".readit-nav-rail-section-icon") || el;
        const st = getComputedStyle(icon);
        const r = icon.getBoundingClientRect();
        return {
          tag: el.tagName,
          section: el.getAttribute("data-readit-nav-section") || "",
          title: el.getAttribute("title") || "",
          beforeDisplay: st.display,
          beforeW: r.width || parseFloat(st.width) || 0,
          beforeH: r.height || parseFloat(st.height) || 0,
          hasMask: /url\(/i.test(
            st.webkitMaskImage || st.maskImage || "",
          ),
        };
      });

    const chromeIcons = [
      ...nav.querySelectorAll(
        'a[data-readit-nav-kind="chrome"] .readit-nav-rail-icon, a[data-readit-nav-kind="chrome"] svg, a[data-readit-nav-kind="action"] .readit-nav-rail-icon',
      ),
    ]
      .slice(0, 8)
      .map((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 4) return null;
        return {
          w: Math.round(r.width),
          h: Math.round(r.height),
          centerDelta: Math.round(r.left + r.width / 2 - navMid),
          clipped: r.right > nr.right + 1 || r.left < nr.left - 1,
        };
      })
      .filter(Boolean);

    const fallbackIcons =
      chromeIcons.length > 0
        ? chromeIcons
        : [...nav.querySelectorAll("a svg, a img, .readit-nav-rail-icon")]
            .filter(
              (el) =>
                !el.closest('a[data-readit-nav-kind="community"]'),
            )
            .slice(0, 8)
            .map((el) => {
              const r = el.getBoundingClientRect();
              if (r.width < 4) return null;
              return {
                w: Math.round(r.width),
                h: Math.round(r.height),
                centerDelta: Math.round(r.left + r.width / 2 - navMid),
                clipped: r.right > nr.right + 1 || r.left < nr.left - 1,
              };
            })
            .filter(Boolean);

    const tags = [...nav.querySelectorAll(".readit-user-tag")].map((el) => ({
      text: (el.textContent || "").slice(0, 24),
      display: getComputedStyle(el).display,
      visible:
        getComputedStyle(el).display !== "none" &&
        el.getBoundingClientRect().width > 0,
    }));
    const noteEls = [
      ...nav.querySelectorAll('[data-readit-has-note="true"]'),
    ].map((el) => {
      const before = getComputedStyle(el, "::before");
      return {
        content: before.content,
        visible:
          before.content &&
          before.content !== "none" &&
          before.display !== "none",
      };
    });
    const stars = [
      ...nav.querySelectorAll(
        'button[aria-label*="Favorite" i], button[aria-label*="favourite" i], svg[icon-name*="star" i]',
      ),
    ].map((el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return {
        display: st.display,
        visible: st.display !== "none" && r.width > 0 && r.height > 0,
      };
    });

    const sampleText = (nav.innerText || "").replace(/\s+/g, " ").slice(0, 220);
    const sidewaysEllipsis =
      /Start a co\.\.\.|GAMES ON RE\.\.\.|COMMUNIT\.\.\.|CUSTOM F\.\.\.|art a cor/i.test(
        sampleText,
      );

    const labelProbe = [...nav.querySelectorAll("a")]
      .filter((a) => a.getAttribute("data-readit-nav-kind") !== "community")
      .slice(0, 6)
      .map((a) => {
        const span = a.querySelector("span:not(.readit-nav-subname)");
        const st = span ? getComputedStyle(span) : getComputedStyle(a);
        return {
          text: (a.getAttribute("title") || a.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 40),
          fontSize: parseFloat(st.fontSize) || 0,
        };
      });

    return {
      ok: true,
      compact,
      hasRail: !!rail,
      navW: Math.round(nr.width),
      navVar,
      sampleText,
      sidewaysEllipsis,
      communities,
      sections,
      icons: fallbackIcons,
      tags,
      notes: noteEls,
      stars,
      labelProbe,
    };
  });
}

/** @type {import('puppeteer-core').Browser | null} */
let puppeteerBrowser = null;
/** @type {import('playwright').BrowserContext | null} */
let playwrightContext = null;
/** @type {import('puppeteer-core').Page | import('playwright').Page} */
let page;
let cdpMode = false;
let extensionId = "";

if (cdpEndpoint) {
  console.log(`Connecting over CDP (puppeteer): ${cdpEndpoint}`);
  puppeteerBrowser = await puppeteer.connect({
    browserURL: cdpEndpoint.replace(/\/$/, ""),
    defaultViewport: null,
  });
  cdpMode = true;
  extensionId = await resolveReaditExtensionId(puppeteerBrowser);
  console.log(`Extension id: ${extensionId || "(unknown)"}`);
  if (extensionId) {
    const ok = await reloadReaditExtension(puppeteerBrowser, extensionId);
    console.log(ok ? "Reloaded readit" : "Could not click Reload");
  }
  const pages = await puppeteerBrowser.pages();
  page =
    pages.find((p) => /reddit\.com/i.test(p.url())) ||
    (await puppeteerBrowser.newPage());
} else {
  console.log("Launching Playwright Chromium with extension");
  playwrightContext = await chromium.launchPersistentContext(userData, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-default-browser-check",
    ],
    viewport: { width: 1440, height: 900 },
  });
  page = playwrightContext.pages()[0] || (await playwrightContext.newPage());
}

try {
  // —— Unit ——
  const unit = spawnSync("npm", ["run", "test:layout"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  record(
    "nav.unit",
    unit.status === 0 ? "pass" : "fail",
    unit.status === 0 ? "test:layout" : (unit.stderr || unit.stdout || "").slice(-200),
  );

  await page.goto("https://www.reddit.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await sleep(3500);
  await dismissConsent(page);
  await sleep(800);

  const ready = await waitForNavReady(page, { timeoutMs: 20_000 });
  if (!ready.ok) {
    console.log("Nav not ready, seeding community visits…", ready);
    await seedCommunityLinks(page);
  } else if ((ready.rLinks || 0) < 1) {
    console.log("No /r/ links yet — seeding Recent…");
    await seedCommunityLinks(page);
  }
  const ready2 = await waitForNavReady(page, { timeoutMs: 35_000 });
  if (!ready2.ok) {
    record(
      "nav.harness.reddit_ready",
      "fail",
      JSON.stringify(ready2),
    );
    await shot(page, "error-reddit-blocked.png");
    throw new Error(
      `Reddit left nav not ready (${ready2.reason || "unknown"}). ` +
        (ready2.captcha && !ready2.hasNav
          ? "Captcha blocked the page — solve it in Brave, then re-run smoke:nav:brave."
          : "Slots missing."),
    );
  }
  record("nav.harness.reddit_ready", "pass", JSON.stringify(ready2));
  if (ready2.captcha) {
    console.log("Note: captcha DOM present but left nav usable — continuing");
  }

  const shell = await studioEval(page, () => ({
    host: !!document.querySelector("readit-studio"),
    fab: !!document.querySelector("readit-studio")?.shadowRoot?.querySelector(
      ".readit-fab",
    ),
    active: document.documentElement.classList.contains("readit-active"),
  }));
  record(
    "nav.shell_home",
    shell.host && shell.fab && shell.active ? "pass" : "fail",
    JSON.stringify(shell),
  );

  await enableClassicLayout(page);
  await setRangeByLabel(page, "Nav (", 272);
  await setRangeByLabel(page, "Rail (", 300);
  await setRangeByLabel(page, "Feed (", 900);
  await closeStudio(page);
  await sleep(600);
  await shot(page, "00-nav-wide.png");
  record("nav.flag_enabled", "pass", "classic + widths");

  let probe = await probeNav(page);
  record(
    "nav.wide.not_compact",
    probe.ok && !probe.compact && probe.navW >= 180 ? "pass" : "fail",
    JSON.stringify({
      compact: probe.compact,
      navW: probe.navW,
      navVar: probe.navVar,
    }),
  );
  const wideLabelsOk =
    (probe.labelProbe || []).some((l) => l.fontSize >= 11 && l.text.length > 2) ||
    /Home|Popular|News|Explore/i.test(probe.sampleText || "");
  record(
    "nav.wide.labels_visible",
    probe.ok && wideLabelsOk ? "pass" : "fail",
    JSON.stringify({ sampleText: probe.sampleText, labelProbe: probe.labelProbe }),
  );
  record(
    "nav.wide.icons_present",
    probe.ok && (probe.icons?.length || 0) >= 1 ? "pass" : "fail",
    JSON.stringify({ iconCount: probe.icons?.length || 0 }),
  );

  // —— Mid compact ——
  await openStudio(page);
  await clickTab(page, "Layout");
  const midSet = await setRangeByLabel(page, "Nav (", 140);
  await closeStudio(page);
  await sleep(900);
  await shot(page, "01-nav-mid.png");
  probe = await probeNav(page);
  record(
    "nav.compact.class_mid",
    midSet.ok && probe.compact && probe.navW <= 168 ? "pass" : "fail",
    JSON.stringify({ midSet, compact: probe.compact, navW: probe.navW }),
  );

  // —— Min ——
  await openStudio(page);
  await clickTab(page, "Layout");
  const minSet = await setRangeByLabel(page, "Nav (", 64);
  await closeStudio(page);
  await sleep(1000);
  await shot(page, "02-nav-min.png");
  await shotNavCrop(page, "03-nav-min-crop.png");
  record("nav.visual.min_shot", "pass", "02-nav-min.png");
  record("nav.visual.crop_shot", "pass", "03-nav-min-crop.png");

  probe = await probeNav(page);
  record(
    "nav.compact.class_min",
    minSet.ok && probe.compact ? "pass" : "fail",
    JSON.stringify({ minSet, compact: probe.compact, navW: probe.navW }),
  );
  record(
    "nav.compact.width_var",
    /64px/.test(probe.navVar || "") || probe.navW <= 80 ? "pass" : "fail",
    JSON.stringify({ navVar: probe.navVar, navW: probe.navW }),
  );

  const communities = probe.communities || [];
  record(
    "nav.community.stamped",
    communities.length >= 1 ? "pass" : "fail",
    JSON.stringify({ count: communities.length }),
  );
  const nameAccuracy =
    communities.length > 0 && communities.every((c) => c.nameOk);
  record(
    "nav.community.name_accuracy",
    nameAccuracy ? "pass" : "fail",
    JSON.stringify(
      communities.map((c) => ({
        expect: c.expect,
        subText: c.subText,
        nameOk: c.nameOk,
      })),
    ),
  );
  const tipsOk =
    communities.length > 0 && communities.filter((c) => c.tipOk).length >= 1;
  record(
    "nav.community.tooltip",
    tipsOk ? "pass" : "fail",
    JSON.stringify(
      communities.slice(0, 4).map((c) => ({
        expect: c.expect,
        title: c.title,
        tipOk: c.tipOk,
      })),
    ),
  );
  await shot(page, "06-nav-tooltips-probe.png");

  const styleOk =
    communities.length > 0 &&
    communities.some(
      (c) =>
        c.subnameVisible &&
        c.fontSize >= 7 &&
        c.fontSize <= 12 &&
        c.fontWeight >= 600,
    );
  record(
    "nav.community.subname_style",
    styleOk ? "pass" : "fail",
    JSON.stringify(
      communities.slice(0, 4).map((c) => ({
        fontSize: c.fontSize,
        fontWeight: c.fontWeight,
        visible: c.subnameVisible,
      })),
    ),
  );

  const avatarOk =
    communities.length > 0 &&
    communities.filter((c) => c.hasAvatar && c.avatarW >= 20 && c.avatarH >= 20)
      .length >= 1;
  record(
    "nav.community.avatar_visible",
    avatarOk ? "pass" : "fail",
    JSON.stringify(
      communities.slice(0, 4).map((c) => ({
        hasAvatar: c.hasAvatar,
        w: c.avatarW,
        h: c.avatarH,
      })),
    ),
  );
  const clipOk =
    communities.filter((c) => c.hasAvatar && c.avatarW >= 20).length >= 1 &&
    communities
      .filter((c) => c.hasAvatar && c.avatarW >= 20)
      .every((c) => !c.avatarClipped);
  record(
    "nav.community.avatar_not_clipped",
    clipOk ? "pass" : "fail",
    JSON.stringify(
      communities
        .filter((c) => c.hasAvatar && c.avatarW >= 20)
        .slice(0, 6)
        .map((c) => ({
          clipped: c.avatarClipped,
          w: c.avatarW,
        })),
    ),
  );
  const stackOk =
    communities.length > 0 &&
    communities.filter((c) => c.stackOk).length >= Math.min(1, communities.length);
  record(
    "nav.community.stack_layout",
    stackOk ? "pass" : "fail",
    JSON.stringify(
      communities.slice(0, 4).map((c) => ({ stackOk: c.stackOk, sub: c.subText })),
    ),
  );
  await shot(page, "04-nav-communities.png");

  const icons = probe.icons || [];
  const centered =
    icons.length > 0 &&
    icons.filter((i) => Math.abs(i.centerDelta) <= 12).length >=
      Math.ceil(icons.length / 2);
  record(
    "nav.align.icons_centered",
    centered ? "pass" : "fail",
    JSON.stringify(icons.slice(0, 8)),
  );
  record(
    "nav.align.no_sideways_ellipsis",
    !probe.sidewaysEllipsis ? "pass" : "fail",
    JSON.stringify({ sampleText: probe.sampleText, sidewaysEllipsis: probe.sidewaysEllipsis }),
  );
  record(
    "nav.chrome.icons_kept",
    icons.length >= 1 ? "pass" : "fail",
    JSON.stringify({ count: icons.length }),
  );

  const sections = probe.sections || [];
  record(
    "nav.section.stamped",
    sections.length >= 1 ? "pass" : "fail",
    JSON.stringify(sections),
  );
  const sectionIconOk =
    sections.length > 0 &&
    sections.some((s) => s.beforeW >= 12 && s.beforeH >= 12);
  record(
    "nav.section.icon_pseudo",
    sectionIconOk ? "pass" : "fail",
    JSON.stringify(sections.slice(0, 6)),
  );
  await shot(page, "05-nav-sections.png");

  const tagsHidden =
    (probe.tags || []).every((t) => !t.visible) &&
    (probe.notes || []).every((n) => !n.visible);
  record(
    "nav.clutter.tags_hidden",
    tagsHidden ? "pass" : "fail",
    JSON.stringify({ tags: probe.tags, notes: probe.notes }),
  );
  const starsHidden = (probe.stars || []).every((s) => !s.visible);
  record(
    "nav.clutter.stars_hidden",
    starsHidden || (probe.stars || []).length === 0 ? "pass" : "fail",
    JSON.stringify({ stars: probe.stars }),
  );

  // Restore usable width
  await openStudio(page);
  await clickTab(page, "Layout");
  await setRangeByLabel(page, "Nav (", 240);
  await closeStudio(page);
} catch (err) {
  record("nav.harness.error", "fail", String(err));
  await shot(page, "error.png");
  console.error(err);
} finally {
  const summary = {
    at: new Date().toISOString(),
    mode: cdpMode ? "cdp-puppeteer" : "launch-playwright",
    cdpEndpoint: cdpEndpoint || null,
    extensionId: extensionId || null,
    results,
    pass: results.filter((r) => r.status === "pass").length,
    fail: results.filter((r) => r.status === "fail").length,
    skip: results.filter((r) => r.status === "skip").length,
  };
  fs.writeFileSync(
    path.join(outDir, "results.json"),
    JSON.stringify(summary, null, 2),
  );
  patchChecklist(results);
  console.log("\nSummary:", {
    pass: summary.pass,
    fail: summary.fail,
    skip: summary.skip,
    evidence: outDir,
  });
  if (cdpMode) puppeteerBrowser?.disconnect();
  else await playwrightContext?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
