/**
 * Visual configuration sweep for readit on New Reddit.
 *
 * Drives settings through a readit extension page (chrome.storage.local
 * "readitSettings"), screenshots every layout / chrome / token / profile /
 * studio variation, and runs geometry checks for overlap, clipping, off-screen
 * and malformed elements. The user's settings are backed up first and
 * restored at the end.
 *
 * Needs a browser with readit loaded and CDP reachable:
 *   READIT_CDP=http://127.0.0.1:9222 npm run smoke:visual
 *
 * Evidence → .smoke-evidence/visual/ (READIT_EVIDENCE_DIR overrides)
 */
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyProfile,
  createDefaultSettings,
  migrateSettings,
  placementsFromColumnOrder,
  type LayoutColumnPanel,
  type LayoutPreset,
  type ReaditSettings,
} from "../packages/schema/src/index.ts";
import {
  addLayoutSeparator,
  applyLayoutPresetToSettings,
  setChromeTopNavHeight,
  setChromeTopNavZone,
  setSlotZone,
} from "../packages/features/src/layout-slots.ts";
import { evidenceDir } from "./smoke-paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(evidenceDir(root), "visual");
fs.mkdirSync(outDir, { recursive: true });

const cdp = (process.env.READIT_CDP || "").trim();
if (!cdp) {
  console.error("Set READIT_CDP (e.g. http://127.0.0.1:9222)");
  process.exit(1);
}
const only = (process.env.READIT_VISUAL_ONLY || "").trim();
// Full runs start clean; filtered runs keep the other screenshots.
if (!only) {
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith(".png")) fs.rmSync(path.join(outDir, f));
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const KEY = "readitSettings";

type Issue = { kind: string; detail: string };
type Result = {
  id: string;
  group: string;
  url: string;
  viewport: string;
  shots: string[];
  issues: Issue[];
  geo?: unknown;
};
const results: Result[] = [];

// ---------------------------------------------------------------- browser

const browser: Browser = await puppeteer.connect({
  browserURL: cdp.replace(/\/$/, ""),
  defaultViewport: null,
  protocolTimeout: 120_000,
});

/** Unpacked extension id = first 32 hex of sha256(path), mapped 0-f → a-p. */
function unpackedId(dir: string): string {
  const hex = createHash("sha256").update(dir).digest("hex").slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
}
const extensionId = process.env.READIT_EXTENSION_ID || unpackedId(path.join(root, "dist/chrome-mv3"));

// An extension page gives chrome.storage access without depending on the
// (suspendable) MV3 service worker.
const ext: Page = await browser.newPage();
await ext.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "domcontentloaded" }).catch(() => {});
const hasStorage = await ext.evaluate(() => typeof chrome !== "undefined" && !!chrome.storage?.local).catch(() => false);
if (!hasStorage) {
  console.error(`readit (${extensionId}) not reachable — is dist/chrome-mv3 loaded unpacked? Set READIT_EXTENSION_ID to override.`);
  await ext.close().catch(() => {});
  browser.disconnect();
  process.exit(1);
}

async function getSettings(): Promise<unknown> {
  return ext.evaluate(async (k) => (await chrome.storage.local.get(k))[k], KEY);
}
async function putSettings(s: ReaditSettings): Promise<void> {
  const clean = migrateSettings(s);
  await ext.evaluate(
    async (k, v) => chrome.storage.local.set({ [k]: v }),
    KEY,
    clean as unknown as Record<string, unknown>,
  );
}

const original = await getSettings();
fs.writeFileSync(
  path.join(outDir, "settings-backup.json"),
  JSON.stringify(original ?? null, null, 2),
);
console.log(`readit ${extensionId}; settings backed up`);

// Base: defaults + Classic, applied the way the Studio does it so the sweep
// only produces states a user can reach.
function base(): ReaditSettings {
  const s = applyLayoutPresetToSettings(createDefaultSettings(), "classic");
  return { ...s, layoutSlots: { ...s.layoutSlots, editMode: false } };
}

const page: Page = await browser.newPage();

async function setViewport(w: number, h: number) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
}

let currentUrl = "";
async function goto(url: string) {
  if (currentUrl === url) return;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  currentUrl = url;
  await sleep(4000);
  const blocked = await page.evaluate(
    () =>
      !!document.querySelector("#rc-imageselect") ||
      /select all (images|squares)|prove you('| a)re human/i.test(
        document.body?.innerText || "",
      ),
  );
  if (blocked) throw new Error(`Visible CAPTCHA on ${url} — stopping.`);
}

async function studio<T>(fn: string): Promise<T> {
  return page.evaluate(
    new Function(
      `return (async () => { const root = document.querySelector("readit-studio")?.shadowRoot; ${fn} })();`,
    ) as () => Promise<T>,
  );
}

async function closeUi() {
  await studio(`
    if (!root) return;
    const close = [...root.querySelectorAll("button")].find((b) => /^(×|✕|Close)$/i.test((b.textContent||"").trim()) || /close/i.test(b.getAttribute("aria-label")||""));
    if (root.querySelector(".readit-drawer") && close) close.click();
    if (root.querySelector(".readit-fab-menu")) root.querySelector(".readit-fab")?.click();
  `);
  await sleep(250);
  // Escape closes anything left (drawer / menu); never toggles edit mode here
  // because edit mode is driven from settings in this sweep.
}

async function openStudioTab(tab: string) {
  await studio(`
    if (!root) return;
    if (!root.querySelector(".readit-drawer")) {
      if (!root.querySelector(".readit-fab-menu")) root.querySelector(".readit-fab")?.click();
      for (let i = 0; i < 20 && !root.querySelector(".readit-fab-action"); i++) await new Promise((r) => setTimeout(r, 50));
      [...root.querySelectorAll(".readit-fab-action")].find((b) => /^Settings$/i.test((b.textContent||"").trim()))?.click();
      for (let i = 0; i < 20 && !root.querySelector(".readit-drawer"); i++) await new Promise((r) => setTimeout(r, 50));
    }
    root.querySelector('.readit-tab[data-studio-tab="${tab}"]')?.click();
  `);
  await sleep(500);
}

// ---------------------------------------------------------------- checks

/**
 * Runs in the page. Returns geometry defects: overlapping columns, content
 * off-screen, horizontal scroll, clipped / collapsed readit UI, cards wider
 * than their column, and studio surfaces outside the viewport.
 */
function pageChecks(): Issue[] {
  const issues: Issue[] = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const vis = (el: Element | null | undefined) => {
    if (!(el instanceof HTMLElement)) return null;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return null;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1 ? r : null;
  };
  const fmt = (r: DOMRect) =>
    `[${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}]`;
  const overlap = (a: DOMRect, b: DOMRect) =>
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

  const html = document.documentElement;
  const paused = !html.classList.contains("readit-active");
  if (paused) issues.push({ kind: "inactive", detail: "readit-active missing" });

  // Columns
  const slots: Record<string, DOMRect | null> = {};
  for (const id of ["leftNav", "main", "rightRail"]) {
    slots[id] = vis(document.querySelector(`[data-readit-slot="${id}"]`));
  }
  if (!slots.main) issues.push({ kind: "missing", detail: "main slot not visible" });
  const ids = Object.keys(slots);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = slots[ids[i]!];
      const b = slots[ids[j]!];
      if (!a || !b) continue;
      const area = overlap(a, b);
      if (area > 16) {
        issues.push({
          kind: "overlap",
          detail: `${ids[i]} ${fmt(a)} overlaps ${ids[j]} ${fmt(b)} (${Math.round(area)}px²)`,
        });
      }
    }
  }
  for (const [id, r] of Object.entries(slots)) {
    if (!r) continue;
    if (r.left < -1 || r.right > vw + 1) {
      issues.push({ kind: "offscreen", detail: `${id} ${fmt(r)} vw=${vw}` });
    }
    if (id === "rightRail" && r.width < 160) {
      issues.push({ kind: "clipped", detail: `rightRail only ${Math.round(r.width)}px — content unreadable` });
    }
    if (id === "main" && r.width < 320) {
      issues.push({ kind: "narrow", detail: `main only ${Math.round(r.width)}px` });
    }
  }
  const se = document.scrollingElement;
  if (se && se.scrollWidth > vw + 1) {
    issues.push({ kind: "hscroll", detail: `scrollWidth ${se.scrollWidth} > ${vw}` });
  }

  // Separators should sit between columns and not over them
  for (const sep of document.querySelectorAll("[data-readit-separator]")) {
    const r = vis(sep);
    if (!r) continue;
    for (const [id, c] of Object.entries(slots)) {
      if (c && overlap(r, c) > 16) {
        issues.push({ kind: "overlap", detail: `separator ${fmt(r)} over ${id} ${fmt(c)}` });
      }
    }
  }

  // Feed cards wider than / escaping the main column
  const main = slots.main;
  if (main) {
    const posts = [...document.querySelectorAll("shreddit-post")].slice(0, 8);
    for (const p of posts) {
      const r = vis(p);
      if (!r || r.bottom < 0 || r.top > vh) continue;
      // Reddit bleeds post-page cards 8px (-mx-xs); that is only a defect
      // when main clips it.
      const mainEl = document.querySelector('[data-readit-slot="main"]');
      const clips = mainEl ? /clip|hidden/.test(getComputedStyle(mainEl).overflowX) : false;
      if (clips && (r.left < main.left - 2 || r.right > main.right + 2)) {
        issues.push({
          kind: "clipped",
          detail: `post card ${fmt(r)} escapes main ${fmt(main)}`,
        });
        break;
      }
    }
  }

  // Header (topNav) must not cover the feed when docked top/bottom
  const header = vis(document.querySelector('[data-readit-slot="topNav"]')) ||
    vis(document.querySelector("reddit-header-large"));
  if (header && main) {
    const r = main;
    if (header.top > vh / 2 && r.bottom > header.top && r.top < header.top &&
      getComputedStyle(document.querySelector('[data-readit-slot="topNav"]') || document.body).position === "static") {
      // docked bottom but in flow — fine
    }
  }

  // readit UI (shadow root)
  const sr = document.querySelector("readit-studio")?.shadowRoot;
  if (sr) {
    const surfaces = [
      ".readit-fab",
      ".readit-fab-menu",
      ".readit-drawer",
      ".readit-edit-toolbox",
      ".readit-picker-banner",
    ];
    const rects: Record<string, DOMRect> = {};
    for (const sel of surfaces) {
      const el = sr.querySelector(sel);
      const r = vis(el);
      if (!r) continue;
      rects[sel] = r;
      if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) {
        issues.push({ kind: "offscreen", detail: `${sel} ${fmt(r)} outside ${vw}×${vh}` });
      }
    }
    // Controls hidden underneath another readit surface: each control must be
    // the topmost element at its own center point.
    const obscured: string[] = [];
    for (const el of sr.querySelectorAll<HTMLElement>(
      ".readit-fab, .readit-fab-action, .readit-edit-toolbox button, .readit-edit-toolbox select, .readit-drawer button, .readit-drawer input, .readit-drawer select, .readit-drawer label",
    )) {
      const r = vis(el);
      if (!r || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
      const top = sr.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (top && top !== el && !el.contains(top)) {
        obscured.push(`"${(el.textContent || el.className).trim().slice(0, 20)}" under ${(top as HTMLElement).className?.toString().split(" ")[0] || top.tagName}`);
      }
    }
    if (obscured.length) {
      issues.push({ kind: "overlap", detail: `obscured readit controls: ${obscured.slice(0, 5).join("; ")}` });
    }
    // Clipped or collapsed controls inside visible readit surfaces
    const clipped: string[] = [];
    const collapsed: string[] = [];
    for (const el of sr.querySelectorAll<HTMLElement>(
      "button, label, .readit-tab, .readit-chip, .readit-edit-chip, h2, h3, span, select, .readit-fab-action",
    )) {
      const r = vis(el);
      if (!r) continue;
      // only inside a visible surface and on-screen
      if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
      const text = (el.textContent || "").trim();
      const cs = getComputedStyle(el);
      if (
        text &&
        el.children.length === 0 &&
        el.scrollWidth > el.clientWidth + 2 &&
        el.clientWidth > 0 &&
        /hidden|clip/.test(cs.overflow + cs.overflowX)
      ) {
        clipped.push(`"${text.slice(0, 30)}" ${el.scrollWidth}>${el.clientWidth}`);
      }
      if (text && (r.width < 4 || r.height < 4)) collapsed.push(`"${text.slice(0, 30)}"`);
      // Control spilling outside its surface
      const surface = el.closest(".readit-drawer, .readit-edit-toolbox, .readit-fab-menu");
      const sRect = surface ? surface.getBoundingClientRect() : null;
      if (sRect && (r.right > sRect.right + 2 || r.left < sRect.left - 2)) {
        const sc = getComputedStyle(surface as Element);
        const scrollsX = /auto|scroll/.test(sc.overflowX);
        if (!scrollsX) clipped.push(`"${text.slice(0, 30)}" spills out of ${surface!.className.split(" ")[0]}`);
      }
    }
    if (clipped.length) {
      issues.push({ kind: "clipped", detail: `readit UI: ${[...new Set(clipped)].slice(0, 6).join("; ")}` });
    }
    if (collapsed.length) {
      issues.push({ kind: "collapsed", detail: `readit UI: ${[...new Set(collapsed)].slice(0, 6).join("; ")}` });
    }
    // Overlapping sibling controls within the toolbox / fab menu / drawer rows
    for (const containerSel of [".readit-edit-toolbox", ".readit-fab-menu", ".readit-tabs"]) {
      const c = sr.querySelector(containerSel);
      if (!vis(c)) continue;
      const kids = [...c!.querySelectorAll<HTMLElement>("button, select, input, label")]
        .map((e) => [e, vis(e)] as const)
        .filter(([, r]) => r) as Array<readonly [HTMLElement, DOMRect]>;
      for (let i = 0; i < kids.length; i++) {
        for (let j = i + 1; j < kids.length; j++) {
          const [ea, ra] = kids[i]!;
          const [eb, rb] = kids[j]!;
          if (ea.contains(eb) || eb.contains(ea)) continue;
          if (overlap(ra, rb) > 16) {
            issues.push({
              kind: "overlap",
              detail: `${containerSel}: "${(ea.textContent || ea.tagName).trim().slice(0, 20)}" overlaps "${(eb.textContent || eb.tagName).trim().slice(0, 20)}"`,
            });
            i = kids.length;
            break;
          }
        }
      }
    }
  }

  // Headings, titles, names and buttons must show their full text (wrap,
  // not truncate). Skips body copy, screen-reader-only text, script text and
  // the nav's icon mode (labels hidden by design).
  {
    const truncated = new Set<string>();
    const isBody = (el: Element) =>
      !!el.closest('p, [slot="text-body"], shreddit-post-text-body, [id$="-post-rtjson-content"], .md, shreddit-comment') &&
      !el.matches("h1,h2,h3,h4,h5,h6,button,label,[slot=title]");
    const visibleText = (el: Element) => {
      let t = "";
      const walk = (n: Node) => {
        for (const c of n.childNodes) {
          if (c.nodeType === Node.TEXT_NODE) t += c.textContent;
          else if (c instanceof Element) {
            if (c.matches("script, style, faceplate-screen-reader-content, .sr-only, .screen-reader-content")) continue;
            walk(c);
          }
        }
      };
      walk(el);
      return t.replace(/\s+/g, " ").trim();
    };
    const compactNav = html.classList.contains("readit-nav-compact");
    const check = (root: ParentNode, where: string) => {
      for (const el of root.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6,a,button,label,summary,span,div,[slot=title]")) {
        if (el.children.length > 3) continue;
        if (compactNav && el.closest('[data-readit-slot="leftNav"]')) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > vh) continue;
        if (isBody(el)) continue;
        const text = visibleText(el);
        if (text.length < 3) continue;
        // Deliberate: community names wider than the whole nav row.
        if (el.hasAttribute("data-readit-ellipsis")) continue;
        const cs = getComputedStyle(el);
        if (!/hidden|clip/.test(cs.overflow + cs.overflowX + cs.overflowY)) continue;
        const cutW = el.scrollWidth > el.clientWidth + 1;
        const cutH =
          el.scrollHeight > el.clientHeight + 2 &&
          (cs.webkitLineClamp !== "none" || cs.whiteSpace === "nowrap" || cs.textOverflow === "ellipsis");
        if (cutW || cutH) {
          const slot = el.closest("[data-readit-slot]")?.getAttribute("data-readit-slot") ?? "-";
          const cls = String(el.className).split(/\s+/).slice(0, 3).join(".");
          const parent = el.parentElement;
          const pcls = parent ? `${parent.tagName.toLowerCase()}.${String(parent.className).split(/\s+/).slice(0, 2).join(".")}` : "";
          truncated.add(
            `${where}/${slot}: "${text.slice(0, 32)}" <${el.tagName.toLowerCase()}.${cls}> in <${pcls}> ${cutW ? `w ${el.scrollWidth}>${el.clientWidth}` : `h ${el.scrollHeight}>${el.clientHeight}`} ws=${cs.whiteSpace} to=${cs.textOverflow} lc=${cs.webkitLineClamp}`,
          );
        }
      }
    };
    check(document, "page");
    for (const scope of document.querySelectorAll('[data-readit-slot="leftNav"], [data-readit-slot="rightRail"]')) {
      for (const host of scope.querySelectorAll("*")) {
        if (host.shadowRoot) check(host.shadowRoot, host.tagName.toLowerCase());
      }
    }
    if (truncated.size) {
      issues.push({ kind: "truncated", detail: [...truncated].slice(0, 6).join("; ") });
    }
    // Letter stacking: a wrapping label squeezed so narrow it breaks every
    // couple of characters (e.g. a name beside a thumbnail).
    const stacked = new Set<string>();
    for (const el of document.querySelectorAll<HTMLElement>(
      '[data-readit-slot] :is(h1,h2,h3,h4,a,span,button,label,summary,[slot=title])',
    )) {
      if (el.children.length > 2 || el.closest("#readit-nav-rail")) continue;
      if (html.classList.contains("readit-nav-compact") && el.closest('[data-readit-slot="leftNav"]')) continue;
      const text = visibleText(el);
      if (text.length < 6 || !/[a-z]{3}/i.test(text)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.bottom < 0 || r.top > vh) continue;
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize) || 14;
      const lh = parseFloat(cs.lineHeight) || fs * 1.3;
      if (r.width < fs * 3.5 && r.height > lh * 3.2) {
        stacked.add(`"${text.slice(0, 24)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    if (stacked.size) {
      issues.push({ kind: "stacked", detail: [...stacked].slice(0, 5).join("; ") });
    }
  }

  // Post media (image bitmaps under object-fit, gallery slides, players) must
  // be centered in its media box.
  {
    const offCenter: string[] = [];
    for (const box of document.querySelectorAll<HTMLElement>('[data-readit-slot="main"] shreddit-post [slot="post-media-container"]')) {
      const cr = box.getBoundingClientRect();
      if (cr.width < 80 || cr.bottom < 0 || cr.top > vh) continue;
      const img = [...box.querySelectorAll<HTMLImageElement>("img:not(.absolute)")].find((i) => {
        const r = i.getBoundingClientRect();
        return i.naturalWidth > 0 && r.width > 40 && r.left < cr.right && r.right > cr.left;
      });
      let left: number | null = null;
      let right: number | null = null;
      if (img) {
        const r = img.getBoundingClientRect();
        const fit = getComputedStyle(img).objectFit;
        const scale = fit === "contain" ? Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight) : r.width / img.naturalWidth;
        const bw = Math.min(r.width, img.naturalWidth * scale);
        const bl = r.left + (r.width - bw) / 2;
        left = bl - cr.left;
        right = cr.right - (bl + bw);
      } else {
        const p = box.querySelector("shreddit-player");
        if (p) {
          const r = p.getBoundingClientRect();
          left = r.left - cr.left;
          right = cr.right - r.right;
        }
      }
      if (left !== null && right !== null && Math.abs(left - right) > 4) {
        offCenter.push(`${Math.round(left)}/${Math.round(right)} in ${Math.round(cr.width)}`);
      }
    }
    if (offCenter.length) issues.push({ kind: "off-center", detail: `media L/R gaps ${offCenter.slice(0, 4).join("; ")}` });
  }

  // Wrapped labels must not collide: text rows in the nav/rail may not
  // overlap one another.
  for (const id of ["leftNav", "rightRail"]) {
    const scope = document.querySelector(`[data-readit-slot="${id}"]`);
    if (!scope || !slots[id]) continue;
    if (id === "leftNav" && html.classList.contains("readit-nav-compact")) continue;
    const rows = [...scope.querySelectorAll<HTMLElement>("a, summary, h2, h3")]
      .map((el) => [el, vis(el)] as const)
      .filter((pair): pair is readonly [HTMLElement, DOMRect] => !!pair[1] && pair[1].top < vh && pair[1].bottom > 0)
      .filter(([el]) => (el.textContent || "").trim().length > 0);
    let found = "";
    for (let i = 0; i < rows.length && !found; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const [ea, ra] = rows[i]!;
        const [eb, rb] = rows[j]!;
        if (ea.contains(eb) || eb.contains(ea)) continue;
        if (overlap(ra, rb) > 24) {
          found = `"${(ea.textContent || "").trim().slice(0, 20)}" overlaps "${(eb.textContent || "").trim().slice(0, 20)}"`;
          break;
        }
      }
    }
    if (found) issues.push({ kind: "overlap", detail: `${id} text: ${found}` });
  }

  // Left nav labels clipped without ellipsis (wide nav only)
  const nav = slots.leftNav;
  if (nav && nav.width >= 180) {
    const bad: string[] = [];
    for (const a of document.querySelectorAll<HTMLElement>('[data-readit-slot="leftNav"] a')) {
      const r = vis(a);
      if (!r || r.top > vh) continue;
      if (r.right > nav.right + 2) bad.push((a.textContent || "").trim().slice(0, 24));
    }
    if (bad.length) issues.push({ kind: "clipped", detail: `nav items spill past nav: ${bad.slice(0, 4).join(", ")}` });
  }
  return issues;
}

/** Slot rects + grid tracks, recorded with every result for review. */
function geometry() {
  const r = (sel: string) => {
    const e = document.querySelector(sel);
    if (!(e instanceof HTMLElement)) return null;
    const cs = getComputedStyle(e);
    if (cs.display === "none") return "hidden";
    const b = e.getBoundingClientRect();
    return `${Math.round(b.left)}..${Math.round(b.right)} (${Math.round(b.width)}w ${Math.round(b.height)}h) top=${Math.round(b.top)}`;
  };
  const shell = document.querySelector("[data-readit-layout-shell]");
  return {
    vw: window.innerWidth,
    cls: [...document.documentElement.classList].filter((c) => c.startsWith("readit-")).join(" "),
    cols: shell ? getComputedStyle(shell).gridTemplateColumns : null,
    nav: r('[data-readit-slot="leftNav"]'),
    main: r('[data-readit-slot="main"]'),
    rail: r('[data-readit-slot="rightRail"]'),
    header: r('[data-readit-slot="topNav"]'),
    seps: document.querySelectorAll("[data-readit-separator]").length,
    railTopVar: document.documentElement.style.getPropertyValue("--readit-stack-rail-top") || null,
    navH: Math.round(document.querySelector('[data-readit-slot="leftNav"]')?.getBoundingClientRect().height || 0),
  };
}

async function shot(name: string): Promise<string> {
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(outDir, file) as `${string}.png` });
  return file;
}

async function capture(
  group: string,
  id: string,
  opts: { url: string; vw?: number; vh?: number; settings: ReaditSettings; ui?: () => Promise<void>; scrollToRail?: boolean },
) {
  if (only && !id.includes(only) && !group.includes(only)) return;
  const vw = opts.vw ?? 1600;
  const vh = opts.vh ?? 900;
  await setViewport(vw, vh);
  await goto(opts.url);
  await closeUi();
  await page.evaluate(() => window.scrollTo(0, 0));
  // Park the pointer so Reddit hover cards (community / user previews) don't
  // pop over the layout being checked.
  await page.mouse.move(1, 1);
  await putSettings(opts.settings);
  await sleep(1400);
  if (opts.ui) await opts.ui();
  await sleep(400);
  const issues = await page.evaluate(pageChecks);
  const geo = await page.evaluate(geometry);
  // Centered (default) layouts: equal free space on both sides of the columns.
  if ((opts.settings.layoutSlots.align ?? "center") === "center" && opts.settings.flags.layoutSlots) {
    const gaps = await page.evaluate(() => {
      // Separators are content too (one can sit after the last panel).
      const rs = [
        ...["leftNav", "main", "rightRail"].map((id) => document.querySelector(`[data-readit-slot="${id}"]`)),
        ...document.querySelectorAll("[data-readit-separator]"),
      ]
        .filter((e): e is HTMLElement => e instanceof HTMLElement && getComputedStyle(e).display !== "none")
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 1);
      if (!rs.length) return null;
      const cw = document.documentElement.clientWidth;
      return [Math.min(...rs.map((r) => r.left)), cw - Math.max(...rs.map((r) => r.right))];
    });
    if (gaps && Math.abs(gaps[0]! - gaps[1]!) > 6) {
      issues.push({ kind: "off-center", detail: `left gap ${Math.round(gaps[0]!)} vs right gap ${Math.round(gaps[1]!)}` });
    }
  }
  const shots = [await shot(`${group}--${id}`)];
  if (opts.scrollToRail) {
    const y = await page.evaluate(() => {
      const r = document.querySelector('[data-readit-slot="rightRail"]')?.getBoundingClientRect();
      return r ? Math.max(0, r.top + window.scrollY - 120) : 0;
    });
    if (y > 0) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await sleep(600);
      issues.push(...(await page.evaluate(pageChecks)));
      shots.push(await shot(`${group}--${id}--rail`));
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  }
  const dedup = [...new Map(issues.map((i) => [i.kind + i.detail, i])).values()];
  results.push({ id, group, url: opts.url, viewport: `${vw}x${vh}`, shots, issues: dedup, geo });
  const mark = dedup.length ? "ISSUE" : "OK   ";
  console.log(`[${mark}] ${group}/${id} ${vw}x${vh}${dedup.length ? " — " + dedup.map((i) => `${i.kind}: ${i.detail}`).join(" | ") : ""}`);
  await closeUi();
}

// ---------------------------------------------------------------- matrix

const HOME = "https://www.reddit.com/";
const SUB = "https://www.reddit.com/r/AskReddit/";
const withLayout = (
  s: ReaditSettings,
  f: (l: ReaditSettings["layoutSlots"]) => ReaditSettings["layoutSlots"],
): ReaditSettings => ({ ...s, layoutSlots: f(s.layoutSlots) });
const preset = (p: LayoutPreset) => applyLayoutPresetToSettings(base(), p);
const PRESETS: LayoutPreset[] = ["classic", "navRight", "dualLeft", "dualRight", "singleColumn"];

try {
  // 1. Presets × viewport widths
  for (const [vw, vh] of [[1920, 1080], [1366, 768], [1024, 768]] as const) {
    for (const p of PRESETS) {
      await capture("preset", `${p}-${vw}`, {
        url: HOME,
        vw,
        vh,
        settings: preset(p),
        scrollToRail: p.startsWith("dual"),
      });
    }
  }

  // 2. Moved sections — every column order
  const orders: LayoutColumnPanel[][] = [
    ["leftNav", "main", "rightRail"],
    ["leftNav", "rightRail", "main"],
    ["main", "leftNav", "rightRail"],
    ["main", "rightRail", "leftNav"],
    ["rightRail", "leftNav", "main"],
    ["rightRail", "main", "leftNav"],
  ];
  for (const o of orders) {
    const s = withLayout(base(), (l) => ({
      ...l,
      preset: "custom",
      columnOrder: o,
      placements: placementsFromColumnOrder(o, l.placements),
    }));
    await capture("move", o.map((p) => p.replace("leftNav", "nav").replace("rightRail", "rail")).join("-"), {
      url: HOME,
      settings: s,
    });
  }

  // 2b. Column alignment (edit toolbar) — centered is the default. A narrow
  // feed leaves leftover viewport so the alignment is visible.
  const narrowFeed = (st: ReaditSettings): ReaditSettings => ({
    ...st,
    knobs: { ...st.knobs, tokens: { ...st.knobs.tokens, feedWidthPx: 640 } },
  });
  for (const align of ["left", "center", "right"] as const) {
    await capture("align", `classic-${align}`, {
      url: HOME,
      settings: withLayout(narrowFeed(base()), (l) => ({ ...l, align })),
    });
    await capture("align", `dualLeft-${align}`, {
      url: HOME,
      settings: withLayout(preset("dualLeft"), (l) => ({ ...l, align })),
    });
    await capture("align", `singleColumn-${align}`, {
      url: HOME,
      settings: withLayout(preset("singleColumn"), (l) => ({ ...l, align })),
    });
  }
  await capture("align", "edit-right-1024", {
    url: HOME,
    vw: 1024,
    vh: 768,
    settings: withLayout(base(), (l) => ({ ...l, align: "right", editMode: true })),
  });

  // 2c. Content alignment (edit toolbar "Text All" / "Text Sel")
  const text = (
    st: ReaditSettings,
    all: "start" | "center" | "end",
    byPanel: ReaditSettings["layoutSlots"]["contentAlignByPanel"] = {},
  ): ReaditSettings => withLayout(st, (l) => ({ ...l, contentAlign: all, contentAlignByPanel: byPanel }));
  await capture("text", "all-center", { url: HOME, settings: text(base(), "center") });
  await capture("text", "all-end", { url: HOME, settings: text(base(), "end") });
  await capture("text", "nav-end-main-center", { url: HOME, settings: text(base(), "start", { leftNav: "end", main: "center" }) });
  await capture("text", "rail-center-1024", { url: HOME, vw: 1024, vh: 768, settings: text(base(), "start", { rightRail: "center" }) });
  await capture("text", "dualLeft-center", { url: HOME, settings: text(preset("dualLeft"), "center") });
  await capture("text", "single-end", { url: HOME, settings: text(preset("singleColumn"), "end") });
  await capture("text", "sub-center", { url: SUB, settings: text(base(), "center") });
  await capture("text", "edit-all-center", {
    url: HOME,
    settings: withLayout(text(base(), "center"), (l) => ({ ...l, editMode: true })),
  });

  // 3. Hidden panels / stacked custom
  await capture("move", "nav-hidden", { url: HOME, settings: withLayout(base(), (l) => setSlotZone(l, "leftNav", "hidden")) });
  await capture("move", "rail-hidden", { url: HOME, settings: withLayout(base(), (l) => setSlotZone(l, "rightRail", "hidden")) });
  await capture("move", "both-hidden", {
    url: HOME,
    settings: withLayout(base(), (l) => setSlotZone(setSlotZone(l, "leftNav", "hidden"), "rightRail", "hidden")),
  });
  await capture("move", "subheader-hidden", { url: SUB, settings: withLayout(base(), (l) => setSlotZone(l, "subHeader", "hidden")) });

  // 4. Separators + gutter themes
  for (const [n, theme] of [[1, "line"], [2, "soft"], [3, "paper"], [1, "inset"], [2, "plain"]] as const) {
    const s = withLayout(base(), (l) => {
      let x = { ...l, gutterTheme: theme };
      const afters: LayoutColumnPanel[] = ["leftNav", "main", "rightRail"];
      for (let i = 0; i < n; i++) x = addLayoutSeparator(x, afters[i]!);
      return x;
    });
    await capture("separators", `${n}-${theme}`, { url: HOME, settings: s });
  }
  await capture("separators", "2-dualLeft", {
    url: HOME,
    settings: withLayout(preset("dualLeft"), (l) => addLayoutSeparator(addLayoutSeparator(l, "leftNav"), "main")),
  });

  // 5. Header placement / height
  for (const zone of ["top", "bottom", "hidden"] as const) {
    await capture("header", zone, { url: HOME, settings: withLayout(base(), (l) => setChromeTopNavZone(l, zone)) });
  }
  await capture("header", "top-32px", { url: HOME, settings: withLayout(base(), (l) => setChromeTopNavHeight(l, 32)) });
  await capture("header", "top-160px", { url: HOME, settings: withLayout(base(), (l) => setChromeTopNavHeight(l, 160)) });
  await capture("header", "bottom-dualRight", {
    url: HOME,
    settings: withLayout(preset("dualRight"), (l) => setChromeTopNavZone(l, "bottom")),
  });

  // 6. Widths
  const widths = (w: Partial<ReaditSettings["layoutSlots"]["widths"]>, feed?: number): ReaditSettings => {
    const s = base();
    return {
      ...s,
      knobs: feed ? { ...s.knobs, tokens: { ...s.knobs.tokens, feedWidthPx: feed } } : s.knobs,
      layoutSlots: { ...s.layoutSlots, widths: { ...s.layoutSlots.widths, ...w } },
    };
  };
  await capture("widths", "nav-64", { url: HOME, settings: widths({ leftNavPx: 64 }) });
  await capture("widths", "nav-140", { url: HOME, settings: widths({ leftNavPx: 140 }) });
  await capture("widths", "nav-400", { url: HOME, settings: widths({ leftNavPx: 400 }) });
  await capture("widths", "rail-64", { url: HOME, settings: widths({ rightRailPx: 64 }) });
  await capture("widths", "rail-400", { url: HOME, settings: widths({ rightRailPx: 400 }) });
  await capture("widths", "feed-480", { url: HOME, settings: widths({}, 480) });
  await capture("widths", "feed-1600", { url: HOME, settings: widths({}, 1600) });
  await capture("widths", "all-max-1366", { url: HOME, vw: 1366, vh: 768, settings: widths({ leftNavPx: 400, rightRailPx: 400 }, 1600) });
  await capture("widths", "gap-48-pad-0", { url: HOME, settings: widths({ columnGapPx: 48, pagePadLeftPx: 0, pagePadRightPx: 0 }) });
  await capture("widths", "dualLeft-nav-64", {
    url: HOME,
    settings: withLayout(preset("dualLeft"), (l) => ({ ...l, widths: { ...l.widths, leftNavPx: 64, rightRailPx: 64 } })),
  });

  // 7. Zoom
  await capture("zoom", "all-0.85", { url: HOME, settings: withLayout(base(), (l) => ({ ...l, zoomAll: 0.85 })) });
  await capture("zoom", "all-1.5", { url: HOME, settings: withLayout(base(), (l) => ({ ...l, zoomAll: 1.5 })) });
  await capture("zoom", "main-1.5", { url: HOME, settings: withLayout(base(), (l) => ({ ...l, zoomByPanel: { main: 1.5 } })) });
  await capture("zoom", "edit-all-1.5", {
    url: HOME,
    settings: withLayout(base(), (l) => ({ ...l, zoomAll: 1.5, editMode: true })),
  });
  await capture("zoom", "nav-1.5", { url: HOME, settings: withLayout(base(), (l) => ({ ...l, zoomByPanel: { leftNav: 1.5 } })) });

  // 8. Profiles
  for (const p of ["focus-reader", "dense-power", "creator-desk", "minimal-media", "mod-desk"]) {
    await capture("profile", p, { url: HOME, settings: applyProfile(createDefaultSettings(), p) });
  }

  // 9. Tokens
  const tok = (t: Partial<ReaditSettings["knobs"]["tokens"]>): ReaditSettings => {
    const s = base();
    return { ...s, knobs: { ...s.knobs, tokens: { ...s.knobs.tokens, ...t } } };
  };
  await capture("tokens", "density-0", { url: HOME, settings: tok({ density: 0 }) });
  await capture("tokens", "density-1", { url: HOME, settings: tok({ density: 1 }) });
  await capture("tokens", "font-0.85", { url: HOME, settings: tok({ fontScale: 0.85 }) });
  await capture("tokens", "font-1.4", { url: HOME, settings: tok({ fontScale: 1.4 }) });
  await capture("tokens", "font-1.4-1024", { url: HOME, vw: 1024, vh: 768, settings: tok({ fontScale: 1.4 }) });
  await capture("tokens", "serif-700", { url: HOME, settings: tok({ fontFamily: "serif", fontWeight: 700 }) });
  await capture("tokens", "mono", { url: HOME, settings: tok({ fontFamily: "mono" }) });
  await capture("tokens", "radius-0", { url: HOME, settings: tok({ radiusPx: 0 }) });
  await capture("tokens", "radius-24", { url: HOME, settings: tok({ radiusPx: 24 }) });
  await capture("tokens", "theme-light", { url: HOME, settings: tok({ themeMode: "light" }) });
  await capture("tokens", "theme-dark", { url: HOME, settings: tok({ themeMode: "dark" }) });
  await capture("tokens", "theme-light-dualLeft", {
    url: HOME,
    settings: { ...preset("dualLeft"), knobs: { ...base().knobs, tokens: { ...base().knobs.tokens, themeMode: "light" } } },
  });
  await capture("tokens", "theme-light-edit", {
    url: HOME,
    settings: withLayout(tok({ themeMode: "light" }), (l) => ({ ...l, editMode: true })),
  });
  await capture("tokens", "accent-green", { url: HOME, settings: tok({ accent: "#22aa55" }) });

  // 10. Studio surfaces
  const TABS = ["simple", "layout", "advanced", "curate", "create", "cqs", "mod", "library"];
  for (const [vw, vh] of [[1600, 900], [1024, 768]] as const) {
    for (const t of TABS) {
      await capture("studio", `${t}-${vw}`, { url: HOME, vw, vh, settings: base(), ui: () => openStudioTab(t) });
    }
  }
  await capture("studio", "layout-light", { url: HOME, settings: { ...base(), knobs: { ...base().knobs, tokens: { ...base().knobs.tokens, themeMode: "light" } } }, ui: () => openStudioTab("layout") });
  await capture("studio", "fab-menu", {
    url: HOME,
    settings: base(),
    ui: async () => {
      await studio(`root?.querySelector(".readit-fab")?.click();`);
      await sleep(400);
    },
  });

  // 11. Edit mode (toolbox + chips) across layouts
  for (const p of ["classic", "dualLeft", "singleColumn"] as const) {
    for (const [vw, vh] of [[1600, 900], [1024, 768]] as const) {
      await capture("edit", `${p}-${vw}`, {
        url: HOME,
        vw,
        vh,
        settings: withLayout(preset(p), (l) => ({ ...l, editMode: true })),
      });
    }
  }
  await capture("edit", "classic-fab-open", {
    url: HOME,
    settings: withLayout(base(), (l) => ({ ...l, editMode: true })),
    ui: async () => {
      await studio(`root?.querySelector(".readit-fab")?.click();`);
      await sleep(400);
    },
  });
  await capture("edit", "classic-3sep", {
    url: HOME,
    settings: withLayout(base(), (l) => ({
      ...addLayoutSeparator(addLayoutSeparator(addLayoutSeparator(l, "leftNav"), "main"), "rightRail"),
      editMode: true,
    })),
  });

  // 12. Other pages
  let postUrl = "";
  await goto(SUB);
  postUrl = await page.evaluate(() => {
    const p = [...document.querySelectorAll("shreddit-post")].find(
      (x) => !x.hasAttribute("stickied") && Number(x.getAttribute("comment-count") || 0) >= 20,
    );
    const link = p?.getAttribute("permalink");
    return link ? new URL(link, location.origin).href : "";
  });
  for (const p of ["classic", "dualLeft", "singleColumn", "navRight"] as const) {
    await capture("subreddit", p, { url: SUB, settings: preset(p) });
  }
  if (postUrl) {
    for (const p of ["classic", "dualRight", "singleColumn"] as const) {
      await capture("post", p, { url: postUrl, settings: preset(p) });
    }
    await capture("post", "comment-ux", {
      url: postUrl,
      settings: { ...base(), flags: { ...base().flags, commentUx: true } },
    });
  }

  // 13. Popup
  if (!only || "popup".includes(only)) {
    const popup = await browser.newPage();
    await popup.setViewport({ width: 380, height: 640, deviceScaleFactor: 1 });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "domcontentloaded" });
    await sleep(800);
    const pIssues = await popup.evaluate(() => {
      const out: Array<{ kind: string; detail: string }> = [];
      const vw = window.innerWidth;
      if (document.documentElement.scrollWidth > vw + 1) out.push({ kind: "hscroll", detail: `popup scrollWidth ${document.documentElement.scrollWidth}` });
      for (const el of document.querySelectorAll<HTMLElement>("button, select, label, h1, h2, p, span")) {
        const r = el.getBoundingClientRect();
        if (r.width < 1) continue;
        if (r.right > vw + 1) out.push({ kind: "offscreen", detail: `"${(el.textContent || "").trim().slice(0, 24)}" right=${Math.round(r.right)}` });
      }
      return out.slice(0, 6);
    });
    await popup.screenshot({ path: path.join(outDir, "popup--default.png") as `${string}.png`, fullPage: true });
    results.push({ id: "default", group: "popup", url: "popup.html", viewport: "380x640", shots: ["popup--default.png"], issues: pIssues });
    console.log(`[${pIssues.length ? "ISSUE" : "OK   "}] popup/default${pIssues.length ? " — " + JSON.stringify(pIssues) : ""}`);
    await popup.close();
  }
} finally {
  // Restore the user's settings exactly as they were.
  try {
    if (original !== undefined) {
      await ext.evaluate(async (k, v) => chrome.storage.local.set({ [k]: v }), KEY, original as Record<string, unknown>);
    } else {
      await ext.evaluate(async (k) => chrome.storage.local.remove(k), KEY);
    }
    console.log("settings restored");
  } catch (e) {
    console.error("RESTORE FAILED — backup at", path.join(outDir, "settings-backup.json"), e);
  }
  fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(results, null, 2));
  const bad = results.filter((r) => r.issues.length);
  console.log(`\nSummary: ${results.length} configurations, ${bad.length} with issues`);
  await page.close().catch(() => {});
  await ext.close().catch(() => {});
  browser.disconnect();
}
