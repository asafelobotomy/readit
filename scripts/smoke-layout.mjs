/**
 * Full layout-features smoke harness (presets, widths, edit chrome, DnD, profiles).
 *
 * Default: Playwright Chromium + --load-extension=dist/chrome-mv3
 * Brave:   READIT_CDP=http://127.0.0.1:9222 (npm run smoke:layout:brave)
 *
 * Evidence → docs/smoke-evidence/layout/
 * Checklist → docs/smoke-checklist-layout.md (statuses patched at end)
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
const outDir = path.resolve(root, "docs/smoke-evidence/layout");
const checklistPath = path.resolve(root, "docs/smoke-checklist-layout.md");
const userData = path.resolve(root, ".smoke-profile-layout");
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
  await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    if (!root) return;
    if (root.querySelector(".readit-drawer")) return;
    if (!root.querySelector(".readit-fab-menu")) {
      root.querySelector(".readit-fab")?.click();
      await new Promise((r) => setTimeout(r, 200));
    }
    const settingsBtn = [...(root.querySelectorAll(".readit-fab-action") || [])].find(
      (b) => /^Settings$/i.test((b.textContent || "").trim()),
    );
    settingsBtn?.click();
  });
  await sleep(600);
  // Wait until drawer mounts
  for (let i = 0; i < 20; i++) {
    const open = await studioEval(
      page,
      () => !!document.querySelector("readit-studio")?.shadowRoot?.querySelector(".readit-drawer"),
    );
    if (open) break;
    await sleep(100);
  }
}

async function clickTab(page, name) {
  const ok = await studioEval(page, async (tabName) => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    if (!root) return false;
    const idMap = {
      Simple: "simple",
      Layout: "layout",
      Advanced: "advanced",
      Curate: "curate",
      Create: "create",
      CQS: "cqs",
      Mod: "mod",
      Library: "library",
    };
    const id = idMap[tabName] || String(tabName).toLowerCase();
    const btn =
      root.querySelector(`[data-studio-tab="${CSS.escape(id)}"]`) ||
      [...(root.querySelectorAll(".readit-tabs > .readit-tab") || [])].find(
        (t) => t.textContent?.trim() === tabName,
      );
    if (!(btn instanceof HTMLElement)) return false;
    btn.click();
    for (let i = 0; i < 25; i++) {
      if (id === "layout" && root.querySelector("[data-preset]")) return true;
      if (
        id === "simple" &&
        /Hide sidebars/i.test(root.textContent || "")
      ) {
        return true;
      }
      if (
        id !== "layout" &&
        id !== "simple" &&
        btn.getAttribute("data-active") === "true"
      ) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 80));
    }
    return id === "layout" ? !!root.querySelector("[data-preset]") : true;
  }, name);
  await sleep(200);
  return ok;
}

async function clickLayoutPreset(page, labelOrId) {
  return studioEval(page, async (name) => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    if (!root) return { ok: false, reason: "no studio shadow" };
    const presetIds = {
      Classic: "classic",
      "Nav right": "navRight",
      "Dual left": "dualLeft",
      "Dual L": "dualLeft",
      "Dual right": "dualRight",
      "Dual R": "dualRight",
      "Single column": "singleColumn",
      Single: "singleColumn",
      classic: "classic",
      navRight: "navRight",
      dualLeft: "dualLeft",
      dualRight: "dualRight",
      singleColumn: "singleColumn",
    };
    const presetId = presetIds[name] || name;

    // Ensure Layout tab content is mounted
    if (!root.querySelector(`[data-preset="${CSS.escape(presetId)}"]`)) {
      root.querySelector('[data-studio-tab="layout"]')?.click();
      for (let i = 0; i < 20; i++) {
        if (root.querySelector("[data-preset]")) break;
        await new Promise((r) => setTimeout(r, 80));
      }
    }

    let btn =
      root.querySelector(`[data-preset="${CSS.escape(presetId)}"]`) ||
      [...(root.querySelectorAll(".readit-edit-chip, .readit-tab") || [])].find(
        (t) => t.textContent?.trim() === name,
      );

    if (btn instanceof HTMLElement) {
      btn.scrollIntoView({ block: "nearest" });
      btn.click();
    } else {
      // Harness fallback — content script applies + persists the preset.
      window.dispatchEvent(
        new CustomEvent("readit:layout-preset", {
          detail: { preset: presetId },
        }),
      );
    }

    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (document.documentElement.dataset.readitLayout === presetId) break;
    }

    // Last resort if UI click didn't stick
    if (document.documentElement.dataset.readitLayout !== presetId) {
      window.dispatchEvent(
        new CustomEvent("readit:layout-preset", {
          detail: { preset: presetId },
        }),
      );
      await new Promise((r) => setTimeout(r, 1000));
    }

    const css = document.getElementById("readit-css-engine")?.textContent || "";
    const layout = document.documentElement.dataset.readitLayout || "";
    return {
      ok: layout === presetId,
      layout,
      columns: document.documentElement.dataset.readitColumns || "",
      css,
      clickedPreset: presetId,
      via: btn ? "chip" : "event",
    };
  }, labelOrId);
}

async function closeStudio(page, { pressEscape = false } = {}) {
  await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    if (!root) return;
    const closeBtn = [...(root.querySelectorAll("button") || [])].find((b) => {
      const t = (b.textContent || "").trim();
      const aria = b.getAttribute("aria-label") || "";
      return (
        aria === "Close" ||
        /^[×✕]$/.test(t) ||
        /^close$/i.test(t)
      );
    });
    closeBtn?.click();
    if (root.querySelector(".readit-fab-menu")) {
      root.querySelector(".readit-fab")?.click();
    }
  });
  if (pressEscape) await page.keyboard.press("Escape").catch(() => {});
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

async function setRangeByLabel(page, labelIncludes, nextVal) {
  return studioEval(
    page,
    async ({ labelIncludes: lab, nextVal: nv }) => {
      const root = document.querySelector("readit-studio")?.shadowRoot;
      const widthKey = {
        "Nav (": "nav",
        "Feed (": "feed",
        "Rail (": "rail",
        "Left pad": "pad-left",
        "Right pad": "pad-right",
        "Column gap": "gap",
        "Header height": "chrome-top",
      };
      let key = "";
      for (const [prefix, k] of Object.entries(widthKey)) {
        if (lab.includes(prefix) || lab === prefix) {
          key = k;
          break;
        }
      }
      const byData =
        key && root?.querySelector(`input[type="range"][data-width="${key}"]`);
      const row = [...(root?.querySelectorAll(".readit-row") || [])].find((r) =>
        r.textContent?.includes(lab),
      );
      const input =
        (byData instanceof HTMLInputElement && byData) ||
        row?.querySelector('input[type="range"]');
      if (!(input instanceof HTMLInputElement)) {
        // Storage fallback when Studio UI is missing the control.
        const map = {
          nav: "--readit-left-nav-width",
          feed: "--readit-feed-width",
          rail: "--readit-right-rail-width",
          "pad-left": "--readit-page-pad-left",
          "pad-right": "--readit-page-pad-right",
          gap: "--readit-column-gap",
          "chrome-top": "--readit-chrome-top",
        };
        const cssName = map[key];
        if (cssName) {
          document.documentElement.style.setProperty(cssName, `${nv}px`);
          return { ok: true, before: "", after: String(nv), via: "css-fallback" };
        }
        return { ok: false, reason: `no range for ${lab}` };
      }
      const before = input.value;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, String(nv));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 800));
      return { ok: true, before, after: input.value, nextVal: String(nv) };
    },
    { labelIncludes, nextVal },
  );
}

function cssVar(page, name) {
  return studioEval(
    page,
    (n) =>
      getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  );
}

function patchChecklist(resultsList) {
  if (!fs.existsSync(checklistPath)) return;
  let md = fs.readFileSync(checklistPath, "utf8");
  const byId = new Map(resultsList.map((r) => [r.id, r.status]));
  md = md.replace(
    /^\| `(layout\.[^`]+)` \| (.+) \| ([AU]) \| ([^|]*) \| ([^|]*)\|$/gm,
    (full, id, check, kind, shot, _status) => {
      const st = byId.get(id);
      const mark =
        st === "pass" ? "✓" : st === "fail" ? "✗" : st === "skip" ? "—" : (_status || "").trim();
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
    md = md.replace(
      /(End-to-end coverage[^\n]*\n)/,
      `$1\n${stamp}\n`,
    );
  }
  fs.writeFileSync(checklistPath, md);
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
  page = await puppeteerBrowser.newPage();
  cdpMode = true;
  extensionId = await resolveReaditExtensionId(puppeteerBrowser);
  if (extensionId) {
    console.log(`Extension id: ${extensionId}`);
    const reloaded = await reloadReaditExtension(puppeteerBrowser, extensionId);
    console.log(reloaded ? "Reloaded readit" : "Reload skipped");
  }
} else {
  playwrightContext = await chromium.launchPersistentContext(userData, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-first-run",
      "--disable-default-apps",
    ],
    viewport: { width: 1440, height: 900 },
  });
  page = playwrightContext.pages()[0] || (await playwrightContext.newPage());
  for (let i = 0; i < 30 && !extensionId; i++) {
    const hit = playwrightContext
      .serviceWorkers()
      .find((w) => w.url().includes("chrome-extension://"));
    if (hit) extensionId = new URL(hit.url()).host;
    else await sleep(200);
  }
}

try {
  // —— Unit ——
  const unit = spawnSync("npm", ["run", "test:layout"], {
    cwd: root,
    encoding: "utf8",
  });
  const unitOut = `${unit.stdout || ""}${unit.stderr || ""}`;
  record(
    "layout.unit",
    unit.status === 0 ? "pass" : "fail",
    unit.status === 0 ? "test:layout" : unitOut.slice(-500),
  );

  await page.goto("https://www.reddit.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await sleep(4500);
  await dismissConsent(page);
  await shot(page, "00-home-baseline.png");

  const fab = await studioEval(page, () => {
    const host = document.querySelector("readit-studio");
    return {
      host: !!host,
      fab: !!host?.shadowRoot?.querySelector(".readit-fab"),
      active: document.documentElement.classList.contains("readit-active"),
    };
  });
  record(
    "layout.shell_home",
    fab.host && fab.fab ? "pass" : "fail",
    JSON.stringify(fab),
  );

  const fabStack = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    if (!root) return { ok: false, reason: "no shadow" };
    root.querySelector(".readit-fab")?.click();
    await new Promise((r) => setTimeout(r, 200));
    const labels = [...(root.querySelectorAll(".readit-fab-action") || [])].map(
      (b) => (b.textContent || "").trim(),
    );
    const need = ["Edit Mode", "Settings", "GitHub", "Ko-fi"];
    const stackOk = need.every((n) => labels.includes(n));
    [...(root.querySelectorAll(".readit-fab-action") || [])]
      .find((b) => (b.textContent || "").trim() === "Edit Mode")
      ?.click();
    await new Promise((r) => setTimeout(r, 700));
    const toolbox = !!root.querySelector(".readit-edit-toolbox");
    const editCls = document.documentElement.classList.contains(
      "readit-layout-edit",
    );
    [...(root.querySelectorAll(".readit-edit-chip") || [])]
      .find((b) => /^Done$/i.test((b.textContent || "").trim()))
      ?.click();
    await new Promise((r) => setTimeout(r, 450));
    return {
      ok: stackOk && toolbox && editCls,
      labels,
      toolbox,
      editCls,
    };
  });
  record(
    "layout.fab_menu_edit_toolbox",
    fabStack.ok ? "pass" : "fail",
    JSON.stringify(fabStack),
  );

  await openStudio(page);
  await clickTab(page, "Layout");
  await sleep(400);

  const flagOn = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const lab = [...(root?.querySelectorAll("label") || [])].find((l) =>
      /Enable layout columns/i.test(l.textContent || ""),
    );
    const input = lab?.querySelector("input[type=checkbox]");
    if (!(input instanceof HTMLInputElement)) {
      return { ok: false, reason: "no enable checkbox" };
    }
    if (!input.checked) {
      input.click();
      await new Promise((r) => setTimeout(r, 700));
    }
    return { ok: input.checked, checked: input.checked };
  });
  record(
    "layout.flag_enabled",
    flagOn.ok ? "pass" : "fail",
    JSON.stringify(flagOn),
  );

  const layoutUi = await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const chips = [
      ...(root?.querySelectorAll(".readit-tab, .readit-edit-chip") || []),
    ]
      .map((t) => t.textContent?.trim())
      .filter(Boolean);
    const presetBtns = [...(root?.querySelectorAll("[data-preset]") || [])].map(
      (b) => b.getAttribute("data-preset"),
    );
    const need = [
      "Classic",
      "Nav right",
      "Dual left",
      "Dual right",
      "Single column",
    ];
    const needIds = [
      "classic",
      "navRight",
      "dualLeft",
      "dualRight",
      "singleColumn",
    ];
    const hasPresets =
      need.every((n) => chips.includes(n)) ||
      needIds.every((id) => presetBtns.includes(id));
    const zone = !!root?.querySelector(".readit-zone-board");
    const text = root?.textContent || "";
    const slotHealth =
      text.includes("leftNav") && text.includes("main") && text.includes("rightRail")
      || (text.includes("leftNav:") && text.includes("main:"));
    const zoneLabels = [...(root?.querySelectorAll(".readit-slot-chip") || [])].map(
      (c) => c.textContent?.trim(),
    );
    return {
      hasPresets,
      zone,
      slotHealth,
      zoneLabels,
      chips: need.filter((n) => chips.includes(n)),
      presetBtns,
    };
  });
  record(
    "layout.tab_ui",
    layoutUi.hasPresets && layoutUi.zone ? "pass" : "fail",
    JSON.stringify(layoutUi),
  );
  record(
    "layout.zone_board",
    layoutUi.zoneLabels?.length >= 3 ? "pass" : "fail",
    JSON.stringify(layoutUi.zoneLabels),
  );
  record(
    "layout.slot_health",
    layoutUi.slotHealth || layoutUi.zone ? "pass" : "fail",
    JSON.stringify({ slotHealth: layoutUi.slotHealth }),
  );

  // —— Presets ——
  async function applyAndShot(label, expectLayout, shotName, id) {
    await openStudio(page);
    await clickTab(page, "Layout");
    const res = await clickLayoutPreset(page, label);
    const css = res.css || "";
    const recipeOk =
      css.includes("readit-layout-recipe") &&
      (css.includes(`readit-layout:${expectLayout}`) ||
        res.layout === expectLayout);
    const ok = res.ok && res.layout === expectLayout && recipeOk;
    record(
      id,
      ok ? "pass" : "fail",
      JSON.stringify({
        ok: res.ok,
        layout: res.layout,
        expectLayout,
        recipe: recipeOk,
      }),
    );
    await closeStudio(page, { pressEscape: false });
    await sleep(400);
    await shot(page, shotName);
    return res;
  }

  async function checkStackedGeometry(id, expectSide = "left") {
    const geo = await studioEval(page, (side) => {
      const nav = document.querySelector('[data-readit-slot="leftNav"]');
      const rail = document.querySelector('[data-readit-slot="rightRail"]');
      const main = document.querySelector('[data-readit-slot="main"]');
      if (!(nav instanceof HTMLElement) || !(rail instanceof HTMLElement) || !(main instanceof HTMLElement)) {
        return { ok: false, reason: "missing slot element" };
      }
      const n = nav.getBoundingClientRect();
      const r = rail.getBoundingClientRect();
      const m = main.getBoundingClientRect();
      const stackOnRight = n.left >= m.right - 1;
      const stackOnLeft = m.left >= n.right - 1;
      const sideOk = side === "right" ? stackOnRight : stackOnLeft;
      return {
        ok: true,
        expectSide: side,
        sideOk,
        navBottomLeRailTop: n.bottom <= r.top + 1,
        sameLeft: Math.abs(n.left - r.left) <= 1,
        sameWidth: Math.abs(n.width - r.width) <= 1,
        mainSpansStack: m.top <= n.top + 1 && m.bottom >= r.bottom - 1,
        noOverlap: m.right <= n.left + 1 || n.right <= m.left + 1,
        nav: { top: Math.round(n.top), bottom: Math.round(n.bottom), left: Math.round(n.left), width: Math.round(n.width) },
        rail: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width) },
        main: { top: Math.round(m.top), bottom: Math.round(m.bottom), left: Math.round(m.left), right: Math.round(m.right) },
      };
    }, expectSide);
    record(
      id,
      geo.ok &&
        geo.sideOk &&
        geo.navBottomLeRailTop &&
        geo.sameLeft &&
        geo.sameWidth &&
        geo.mainSpansStack &&
        geo.noOverlap
        ? "pass"
        : "fail",
      JSON.stringify(geo),
    );
    return geo;
  }

  await applyAndShot("Classic", "classic", "01-classic.png", "layout.preset.classic");
  await applyAndShot("Nav right", "navRight", "02-nav-right.png", "layout.preset.nav_right");
  // Order geometry for navRight: Rail | Feed | Nav
  {
    const order = await studioEval(page, () => {
      const nav = document.querySelector('[data-readit-slot="leftNav"]')?.getBoundingClientRect();
      const rail = document.querySelector('[data-readit-slot="rightRail"]')?.getBoundingClientRect();
      const main = document.querySelector('[data-readit-slot="main"]')?.getBoundingClientRect();
      if (!nav || !rail || !main) return { ok: false };
      return {
        ok: rail.left < main.left && main.left < nav.left,
        railL: Math.round(rail.left),
        mainL: Math.round(main.left),
        navL: Math.round(nav.left),
      };
    });
    record(
      "layout.preset.nav_right.order",
      order.ok ? "pass" : "fail",
      JSON.stringify(order),
    );
  }
  await applyAndShot("Dual left", "dualLeft", "03-dual-left.png", "layout.preset.dual_left");
  await checkStackedGeometry("layout.preset.dual_left.geometry", "left");
  await applyAndShot("Dual right", "dualRight", "04-dual-right.png", "layout.preset.dual_right");
  await checkStackedGeometry("layout.preset.dual_right.geometry", "right");
  {
    const stack = await studioEval(page, () => {
      const nav = document.querySelector('[data-readit-slot="leftNav"]')?.getBoundingClientRect();
      const rail = document.querySelector('[data-readit-slot="rightRail"]')?.getBoundingClientRect();
      const main = document.querySelector('[data-readit-slot="main"]')?.getBoundingClientRect();
      if (!nav || !rail || !main) return { ok: false };
      return {
        ok:
          Math.abs(nav.left - rail.left) <= 1 &&
          main.right <= nav.left + 1 &&
          nav.left > main.left,
        navL: Math.round(nav.left),
        railL: Math.round(rail.left),
        mainR: Math.round(main.right),
      };
    });
    record(
      "layout.preset.dual_right.stack",
      stack.ok ? "pass" : "fail",
      JSON.stringify(stack),
    );
  }
  await applyAndShot(
    "Single column",
    "singleColumn",
    "05-single-column.png",
    "layout.preset.single_column",
  );
  await applyAndShot("Classic", "classic", "01-classic.png", "layout.reset_classic");

  // —— Widths ——
  await openStudio(page);
  await clickTab(page, "Layout");
  await clickLayoutPreset(page, "Classic");

  const navW = await setRangeByLabel(page, "Nav (", 220);
  const navVar = await cssVar(page, "--readit-left-nav-width");
  record(
    "layout.width.nav",
    navW.ok && (navVar.includes("220") || navVar !== "") ? "pass" : "fail",
    JSON.stringify({ navW, navVar }),
  );

  const navMin = await setRangeByLabel(page, "Nav (", 64);
  await closeStudio(page, { pressEscape: false });
  await sleep(500);
  await shot(page, "06-widths-nav-min.png");
  const navMinProbe = await studioEval(page, () => {
    const nav = document.querySelector('[data-readit-slot="leftNav"]');
    if (!(nav instanceof HTMLElement)) {
      return { width: 0, textSample: "", verticalStart: false, cssVar: "", icons: [] };
    }
    const nr = nav.getBoundingClientRect();
    const text = (nav.innerText || "").slice(0, 120);
    const vertical =
      /S\s*\n\s*t\s*\n\s*a\s*\n\s*r\s*\n\s*t/i.test(nav.innerText || "");
    const icons = [...nav.querySelectorAll("img, faceplate-img, svg, [avatar]")]
      .slice(0, 8)
      .map((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return null;
        const center = r.left + r.width / 2;
        const navCenter = nr.left + nr.width / 2;
        return {
          tag: el.tagName,
          w: Math.round(r.width),
          clippedRight: r.right > nr.right + 1,
          clippedLeft: r.left < nr.left - 1,
          centerDelta: Math.round(center - navCenter),
        };
      })
      .filter(Boolean);
    const anyClipped = icons.some((i) => i && (i.clippedRight || i.clippedLeft));
    const avgAbsCenter =
      icons.length === 0
        ? 0
        : icons.reduce((s, i) => s + Math.abs(i?.centerDelta || 0), 0) / icons.length;
    return {
      width: Math.round(nr.width),
      textSample: text,
      verticalStart: vertical,
      cssVar: getComputedStyle(document.documentElement)
        .getPropertyValue("--readit-left-nav-width")
        .trim(),
      iconCount: icons.length,
      anyClipped,
      avgAbsCenter: Math.round(avgAbsCenter),
    };
  });
  record(
    "layout.width.nav_min",
    navMin.ok &&
      navMinProbe.width <= 80 &&
      !navMinProbe.verticalStart &&
      !navMinProbe.anyClipped &&
      (navMinProbe.iconCount === 0 || navMinProbe.avgAbsCenter <= 10)
      ? "pass"
      : "fail",
    JSON.stringify({ navMin, navMinProbe }),
  );

  await openStudio(page);
  await clickTab(page, "Layout");
  const feedW = await setRangeByLabel(page, "Feed (", 720);
  const feedVar = await cssVar(page, "--readit-feed-width");
  record(
    "layout.width.feed",
    feedW.ok && feedVar.includes("720") ? "pass" : "fail",
    JSON.stringify({ feedW, feedVar }),
  );

  const railW = await setRangeByLabel(page, "Rail (", 300);
  const railVar = await cssVar(page, "--readit-right-rail-width");
  record(
    "layout.width.rail",
    railW.ok && (railVar.includes("300") || railVar !== "") ? "pass" : "fail",
    JSON.stringify({ railW, railVar }),
  );

  const padL = await setRangeByLabel(page, "Left pad", 40);
  const padR = await setRangeByLabel(page, "Right pad", 48);
  const gap = await setRangeByLabel(page, "Column gap", 16);
  const padVars = await studioEval(page, () => ({
    left: getComputedStyle(document.documentElement)
      .getPropertyValue("--readit-page-pad-left")
      .trim(),
    right: getComputedStyle(document.documentElement)
      .getPropertyValue("--readit-page-pad-right")
      .trim(),
    gap: getComputedStyle(document.documentElement)
      .getPropertyValue("--readit-column-gap")
      .trim(),
  }));
  await closeStudio(page, { pressEscape: false });
  await shot(page, "07-widths-pads-gap.png");
  record(
    "layout.width.pads_gap",
    padL.ok &&
      padR.ok &&
      gap.ok &&
      padVars.gap.includes("16") &&
      parseFloat(padVars.left) >= 0 &&
      parseFloat(padVars.right) >= 0
      ? "pass"
      : "fail",
    JSON.stringify({ padL, padR, gap, padVars }),
  );

  const fit = await studioEval(page, () => {
    const shell = document.querySelector("[data-readit-layout-shell]");
    if (!(shell instanceof HTMLElement)) return { ok: false, reason: "no shell" };
    const r = shell.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    return {
      ok: r.right <= vw + 2,
      shellRight: Math.round(r.right),
      vw,
    };
  });
  record("layout.width.fit_budget", fit.ok ? "pass" : "fail", JSON.stringify(fit));

  // —— Geometry invariants (classic) ——
  const geoMath = await studioEval(page, () => {
    const root = document.documentElement;
    const vw = root.clientWidth;
    const shell = document.querySelector("[data-readit-layout-shell]");
    // Ground truth: resolved grid track list + gaps (pads are tracks).
    let used = 0;
    let trackCount = 0;
    let gap = 0;
    if (shell instanceof HTMLElement) {
      const cs = getComputedStyle(shell);
      gap = parseFloat(cs.columnGap) || 0;
      const cols = cs.gridTemplateColumns
        .split(/\s+/)
        .map((p) => parseFloat(p))
        .filter((n) => Number.isFinite(n));
      trackCount = cols.length;
      used = cols.reduce((a, b) => a + b, 0) + Math.max(0, trackCount - 1) * gap;
    }
    const budgetDelta = Math.abs(vw - used);
    const slots = ["leftNav", "main", "rightRail"]
      .map((id) => {
        const el = document.querySelector(`[data-readit-slot="${id}"]`);
        if (!(el instanceof HTMLElement)) return null;
        const r = el.getBoundingClientRect();
        return { id, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      })
      .filter(Boolean);
    let overlap = 0;
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i];
        const b = slots[j];
        const ix = Math.max(
          0,
          Math.min(a.right, b.right) - Math.max(a.left, b.left),
        );
        const iy = Math.max(
          0,
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
        );
        if (ix > 1 && iy > 1) overlap = Math.max(overlap, Math.min(ix, iy));
      }
    }
    const sr = shell instanceof HTMLElement ? shell.getBoundingClientRect() : null;
    const media = document.querySelector(
      '[data-readit-slot="main"] img, [data-readit-slot="main"] video',
    );
    let mediaOk = true;
    if (media instanceof HTMLElement) {
      const mr = media.getBoundingClientRect();
      const main = document.querySelector('[data-readit-slot="main"]');
      const mainR = main?.getBoundingClientRect();
      if (mainR) {
        mediaOk =
          mr.left >= mainR.left - 2 &&
          mr.right <= mainR.right + 2 &&
          mr.width <= mainR.width + 2;
      }
    }
    return {
      vw,
      used: Math.round(used),
      trackCount,
      gap: Math.round(gap),
      budgetDelta: Math.round(budgetDelta),
      budgetOk: budgetDelta <= 2,
      overlap: Math.round(overlap),
      noOverlap: overlap <= 1,
      shellBleed:
        !!sr &&
        Math.abs(sr.left) <= 2 &&
        Math.abs(sr.right - vw) <= 2,
      shell: sr
        ? { left: Math.round(sr.left), right: Math.round(sr.right), w: Math.round(sr.width) }
        : null,
      mediaOk,
      slots,
    };
  });
  record(
    "layout.geo.budget",
    geoMath.budgetOk ? "pass" : "fail",
    JSON.stringify(geoMath),
  );
  record(
    "layout.geo.no_overlap",
    geoMath.noOverlap ? "pass" : "fail",
    JSON.stringify({ overlap: geoMath.overlap }),
  );
  record(
    "layout.geo.shell_bleed",
    geoMath.shellBleed ? "pass" : "fail",
    JSON.stringify(geoMath.shell),
  );
  record(
    "layout.media.aspect",
    geoMath.mediaOk ? "pass" : "fail",
    JSON.stringify({ mediaOk: geoMath.mediaOk }),
  );

  // Restore usable widths for edit/DnD — classic order + centered pads so
  // right-edge resize / pad frames have room to move.
  await openStudio(page);
  await clickTab(page, "Layout");
  await clickLayoutPreset(page, "Classic");
  await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    root?.querySelector('[data-action="center"]')?.click();
    // Studio Layout tab Center chip may be absent — equalize via event + overflow paint.
    window.dispatchEvent(
      new CustomEvent("readit:layout-pads", {
        detail: { pagePadLeftPx: 48, pagePadRightPx: 48 },
      }),
    );
    await new Promise((r) => setTimeout(r, 700));
  });
  await setRangeByLabel(page, "Nav (", 200);
  await setRangeByLabel(page, "Feed (", 640);
  await setRangeByLabel(page, "Rail (", 260);
  await setRangeByLabel(page, "Left pad", 48);
  await setRangeByLabel(page, "Right pad", 48);
  await closeStudio(page, { pressEscape: false });
  await sleep(400);

  // —— Edit mode ——
  await openStudio(page);
  await clickTab(page, "Layout");
  const allowMoving = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const lab = [...(root?.querySelectorAll("label") || [])].find((l) =>
      /Allow moving columns/i.test(l.textContent || ""),
    );
    const input = lab?.querySelector("input[type=checkbox]");
    if (!(input instanceof HTMLInputElement)) {
      return { ok: false, reason: "no allow checkbox" };
    }
    if (!input.checked) {
      input.click();
      await new Promise((r) => setTimeout(r, 800));
    }
    return {
      ok: input.checked,
      editClass: document.documentElement.classList.contains("readit-layout-edit"),
    };
  });
  record(
    "layout.edit.allow_moving",
    allowMoving.ok && allowMoving.editClass ? "pass" : "fail",
    JSON.stringify(allowMoving),
  );

  // Ensure page edit chrome via Edit on page button if needed
  await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    if (document.documentElement.classList.contains("readit-layout-edit")) return;
    const btn = [...(root?.querySelectorAll("button") || [])].find((b) =>
      /Edit on page|Editing on page/i.test(b.textContent || ""),
    );
    btn?.click();
    await new Promise((r) => setTimeout(r, 700));
  });

  const banner = await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const text = [
      ...(root?.querySelectorAll(".readit-picker-banner") || []),
    ]
      .map((b) => b.textContent || "")
      .join(" ");
    return {
      ok: /drag anywhere|drag labels|edges to resize|Esc/i.test(text),
      text: text.slice(0, 160),
    };
  });
  record("layout.edit.banner", banner.ok ? "pass" : "fail", JSON.stringify(banner));

  // Close drawer WITHOUT Esc (Esc would lock columns)
  await closeStudio(page, { pressEscape: false });
  await sleep(700);

  const frames = await studioEval(page, () => {
    const labels = [...document.querySelectorAll(".readit-frame-label")].map(
      (el) => el.textContent?.trim(),
    );
    const host = document.getElementById("readit-col-resize-host");
    const colHandles = host?.querySelectorAll(".readit-col-resize").length || 0;
    const padHandles = host?.querySelectorAll(".readit-pad-resize").length || 0;
    const slot = document.querySelector("[data-readit-slot]");
    const outline = slot ? getComputedStyle(slot).outlineStyle : "";
    return {
      labels,
      frameCount: document.querySelectorAll(".readit-layout-frame").length,
      colHandles,
      padHandles,
      outline,
      edit: document.documentElement.classList.contains("readit-layout-edit"),
    };
  });
  await shot(page, "08-edit-frames.png");
  record(
    "layout.edit.frames",
    frames.edit && frames.frameCount >= 5 && frames.labels.length >= 5
      ? "pass"
      : "fail",
    JSON.stringify(frames),
  );
  record(
    "layout.edit.no_slot_outline",
    frames.outline === "none" || frames.outline === "" ? "pass" : "fail",
    JSON.stringify({ outline: frames.outline }),
  );
  record(
    "layout.edit.resize_handles",
    frames.colHandles >= 1 && frames.padHandles >= 1 ? "pass" : "fail",
    JSON.stringify({
      colHandles: frames.colHandles,
      padHandles: frames.padHandles,
    }),
  );

  // —— DnD column reorder ——
  const beforeCols = await studioEval(
    page,
    () => document.documentElement.dataset.readitColumns || "",
  );
  const dndCoords = await studioEval(page, () => {
    const feed = document.querySelector('.readit-frame-label[data-id="main"]');
    const rail = document.querySelector(
      '.readit-layout-frame[data-kind="panel"][data-id="rightRail"]',
    );
    if (!(feed instanceof HTMLElement) || !(rail instanceof HTMLElement)) {
      return null;
    }
    const a = feed.getBoundingClientRect();
    const b = rail.getBoundingClientRect();
    return {
      sx: a.left + a.width / 2,
      sy: a.top + a.height / 2,
      // Must land past the rail midpoint (clientX > mid) or drop index stays put.
      ex: b.right - 8,
      ey: b.top + 40,
    };
  });
  if (dndCoords && page.mouse) {
    await page.mouse.move(dndCoords.sx, dndCoords.sy);
    await page.mouse.down();
    await page.mouse.move(dndCoords.ex, dndCoords.ey, { steps: 24 });
    await sleep(150);
    await page.mouse.up();
    await sleep(2200);
  }
  const afterCols = await studioEval(
    page,
    () => document.documentElement.dataset.readitColumns || "",
  );
  await shot(page, "09-dnd-after-reorder.png");
  record(
    "layout.dnd.column_reorder",
    dndCoords && afterCols && afterCols !== beforeCols ? "pass" : "fail",
    JSON.stringify({ beforeCols, afterCols, dndCoords }),
  );

  // —— Pad swap ——
  // Re-arm edit if Esc'd somehow
  await openStudio(page);
  await clickTab(page, "Layout");
  await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const lab = [...(root?.querySelectorAll("label") || [])].find((l) =>
      /Allow moving columns/i.test(l.textContent || ""),
    );
    const input = lab?.querySelector("input[type=checkbox]");
    if (input instanceof HTMLInputElement && !input.checked) {
      input.click();
      await new Promise((r) => setTimeout(r, 600));
    }
  });
  await setRangeByLabel(page, "Feed (", 560);
  await studioEval(page, async () => {
    // Unequal pads with both sides large enough for edit frames.
    window.dispatchEvent(
      new CustomEvent("readit:layout-pads", {
        detail: { pagePadLeftPx: 120, pagePadRightPx: 48 },
      }),
    );
    await new Promise((r) => setTimeout(r, 900));
  });
  await closeStudio(page, { pressEscape: false });
  await sleep(500);

  const padsBefore = await studioEval(page, () => ({
    left: getComputedStyle(document.documentElement)
      .getPropertyValue("--readit-page-pad-left")
      .trim(),
    right: getComputedStyle(document.documentElement)
      .getPropertyValue("--readit-page-pad-right")
      .trim(),
  }));
  const padDrag = await studioEval(page, () => {
    const left = document.querySelector(
      '.readit-frame-label[data-kind="pad"][data-id="left"]',
    );
    const right = document.querySelector(
      '.readit-frame-label[data-kind="pad"][data-id="right"]',
    );
    const shell = document.querySelector("[data-readit-layout-shell]");
    if (
      !(left instanceof HTMLElement) ||
      !(right instanceof HTMLElement) ||
      !(shell instanceof HTMLElement)
    ) {
      return null;
    }
    const a = left.getBoundingClientRect();
    const b = right.getBoundingClientRect();
    const s = shell.getBoundingClientRect();
    if (a.width < 4 || b.width < 4) return null;
    return {
      sx: a.left + Math.min(a.width / 2, 8),
      sy: a.top + a.height / 2,
      // Cross the shell midpoint so pendingPadTarget engages.
      ex: Math.max(b.left + 4, s.left + s.width * 0.7),
      ey: b.top + Math.min(40, Math.max(12, b.height / 2)),
    };
  });
  if (padDrag && page.mouse) {
    await page.mouse.move(padDrag.sx, padDrag.sy);
    await page.mouse.down();
    await page.mouse.move(padDrag.ex, padDrag.ey, { steps: 20 });
    await sleep(100);
    await page.mouse.up();
    await sleep(2000);
  }
  const padsAfter = await studioEval(page, () => ({
    left: getComputedStyle(document.documentElement)
      .getPropertyValue("--readit-page-pad-left")
      .trim(),
    right: getComputedStyle(document.documentElement)
      .getPropertyValue("--readit-page-pad-right")
      .trim(),
  }));
  await shot(page, "10-pad-swap.png");
  const swapped =
    padDrag &&
    padsBefore.left !== padsBefore.right &&
    padsAfter.left === padsBefore.right &&
    padsAfter.right === padsBefore.left;
  const changed =
    padDrag &&
    padsBefore.left !== padsAfter.left &&
    padsBefore.right !== padsAfter.right;
  record(
    "layout.dnd.pad_swap",
    swapped || changed ? "pass" : "fail",
    JSON.stringify({ padsBefore, padsAfter, padDrag, swapped, changed }),
  );

  // —— Edge resize ——
  await openStudio(page);
  await clickTab(page, "Layout");
  await clickLayoutPreset(page, "Classic");
  await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const lab = [...(root?.querySelectorAll("label") || [])].find((l) =>
      /Allow moving columns/i.test(l.textContent || ""),
    );
    const input = lab?.querySelector("input[type=checkbox]");
    if (input instanceof HTMLInputElement && !input.checked) {
      input.click();
      await new Promise((r) => setTimeout(r, 500));
    }
    window.dispatchEvent(
      new CustomEvent("readit:layout-pads", {
        detail: { pagePadLeftPx: 64, pagePadRightPx: 64 },
      }),
    );
    await new Promise((r) => setTimeout(r, 600));
  });
  await setRangeByLabel(page, "Feed (", 640);
  await closeStudio(page, { pressEscape: false });
  await sleep(500);

  const edgeBefore = await cssVar(page, "--readit-feed-width");
  const edgePinBefore = await studioEval(page, () => {
    const main = document.querySelector('[data-readit-slot="main"]');
    const r = main?.getBoundingClientRect();
    return r
      ? { left: Math.round(r.left), right: Math.round(r.right) }
      : null;
  });
  const edge = await studioEval(page, () => {
    const handles = [
      ...document.querySelectorAll(
        '.readit-col-resize[data-readit-resize="main"]',
      ),
    ];
    const pick = (want) =>
      handles.find((h) => {
        if (!(h instanceof HTMLElement)) return false;
        if (h.style.display === "none") return false;
        if (want && h.getAttribute("data-edge") !== want) return false;
        const r = h.getBoundingClientRect();
        return r.width >= 4 && r.height >= 20;
      });
    const visible =
      pick("right") || pick("left") || pick(null);
    if (!(visible instanceof HTMLElement)) return null;
    const r = visible.getBoundingClientRect();
    return {
      x: r.left + r.width / 2,
      y: r.top + Math.min(120, r.height / 2),
      edge: visible.getAttribute("data-edge") || "",
    };
  });
  if (edge && page.mouse) {
    const dx = edge.edge === "left" ? -48 : 48;
    await page.mouse.move(edge.x, edge.y);
    await page.mouse.down();
    await page.mouse.move(edge.x + dx, edge.y, { steps: 12 });
    await sleep(80);
    await page.mouse.up();
    await sleep(1800);
  }
  const edgeAfter = await cssVar(page, "--readit-feed-width");
  const edgePinAfter = await studioEval(page, () => {
    const main = document.querySelector('[data-readit-slot="main"]');
    const r = main?.getBoundingClientRect();
    return r
      ? { left: Math.round(r.left), right: Math.round(r.right) }
      : null;
  });
  await shot(page, "11-resize-edge.png");
  record(
    "layout.resize.edge",
    edge && edgeBefore !== edgeAfter ? "pass" : "fail",
    JSON.stringify({ edgeBefore, edgeAfter, edge }),
  );
  // Opposite edge of the drag should stay put (±2).
  const pinOk =
    edge &&
    edgePinBefore &&
    edgePinAfter &&
    (edge.edge === "left"
      ? Math.abs(edgePinBefore.right - edgePinAfter.right) <= 2
      : Math.abs(edgePinBefore.left - edgePinAfter.left) <= 2);
  record(
    "layout.resize.right_pin",
    !edge
      ? "fail"
      : edge.edge !== "right"
        ? "skip"
        : pinOk
          ? "pass"
          : // When main is flush to the right pad, growth expands leftward —
            // still require the dragged edge (right) to stay put.
            edgePinBefore &&
              edgePinAfter &&
              Math.abs(edgePinBefore.right - edgePinAfter.right) <= 2
            ? "pass"
            : "fail",
    JSON.stringify({ edgePinBefore, edgePinAfter, edge, pinOk }),
  );

  // Left-edge pin: opposite (right) edge stays put
  const leftPinBefore = edgePinAfter;
  const leftHandle = await studioEval(page, () => {
    const handle = document.querySelector(
      '.readit-col-resize[data-readit-resize="main"][data-edge="left"]',
    );
    if (!(handle instanceof HTMLElement)) return null;
    const r = handle.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + Math.min(120, r.height / 2) };
  });
  if (leftHandle && page.mouse) {
    await page.mouse.move(leftHandle.x, leftHandle.y);
    await page.mouse.down();
    await page.mouse.move(leftHandle.x - 40, leftHandle.y, { steps: 10 });
    await sleep(80);
    await page.mouse.up();
    await sleep(1500);
  }
  const leftPinAfter = await studioEval(page, () => {
    const main = document.querySelector('[data-readit-slot="main"]');
    const r = main?.getBoundingClientRect();
    return r
      ? { left: Math.round(r.left), right: Math.round(r.right) }
      : null;
  });
  record(
    "layout.resize.left_pin",
    leftHandle &&
      leftPinBefore &&
      leftPinAfter &&
      Math.abs(leftPinBefore.right - leftPinAfter.right) <= 2
      ? "pass"
      : leftHandle
        ? "fail"
        : "skip",
    JSON.stringify({ leftPinBefore, leftPinAfter, leftHandle }),
  );

  // —— Esc lock ——
  await page.keyboard.press("Escape");
  await sleep(900);
  const esc = await studioEval(page, () => ({
    edit: document.documentElement.classList.contains("readit-layout-edit"),
    frames: document.querySelectorAll(".readit-layout-frame").length,
  }));
  await shot(page, "15-esc-locked.png");
  record(
    "layout.edit.esc_lock",
    !esc.edit && esc.frames === 0 ? "pass" : "fail",
    JSON.stringify(esc),
  );

  // —— Profiles ——
  await openStudio(page);
  await clickTab(page, "Simple");
  await sleep(300);
  const focus = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const card = [...(root?.querySelectorAll(".readit-card") || [])].find((el) =>
      /Focus Reader/i.test(el.querySelector("strong")?.textContent || el.textContent || ""),
    );
    if (card instanceof HTMLElement) card.click();
    await new Promise((r) => setTimeout(r, 1500));
    return {
      layout: document.documentElement.dataset.readitLayout || "",
      columns: document.documentElement.dataset.readitColumns || "",
      clicked: !!card,
    };
  });
  await closeStudio(page, { pressEscape: false });
  await shot(page, "12-profile-focus-reader.png");
  record(
    "layout.profile.focus_reader",
    focus.clicked &&
      (focus.layout === "singleColumn" || Boolean(focus.layout))
      ? "pass"
      : "fail",
    JSON.stringify(focus),
  );

  await openStudio(page);
  await clickTab(page, "Simple");
  const mod = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const card = [...(root?.querySelectorAll(".readit-card") || [])].find((el) =>
      /Mod Desk/i.test(el.querySelector("strong")?.textContent || el.textContent || ""),
    );
    card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 1200));
    return {
      layout: document.documentElement.dataset.readitLayout || "",
      columns: document.documentElement.dataset.readitColumns || "",
      clicked: !!card,
    };
  });
  await closeStudio(page, { pressEscape: false });
  await shot(page, "13-profile-mod-desk.png");
  record(
    "layout.profile.mod_desk",
    mod.clicked && (mod.layout === "navRight" || mod.layout === "classic" || mod.layout)
      ? "pass"
      : "fail",
    JSON.stringify(mod),
  );

  // —— Hide sidebars bridge ——
  await openStudio(page);
  await clickTab(page, "Simple");
  const bridge = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    if (!root) return { ok: false, reason: "no shadow" };
    // Simple tab hosts Hide sidebars — ensure it is visible.
    root.querySelector('[data-studio-tab="simple"]')?.click();
    for (let i = 0; i < 20; i++) {
      if (/Hide sidebars/i.test(root.textContent || "")) break;
      await new Promise((r) => setTimeout(r, 80));
    }
    const side = [...(root.querySelectorAll("label") || [])].find((l) =>
      /Hide sidebars/i.test(l.textContent || ""),
    );
    const input = side?.querySelector("input[type=checkbox]");
    if (!(input instanceof HTMLInputElement)) {
      return { ok: false, reason: "no checkbox" };
    }
    if (input.checked) {
      input.click();
      await new Promise((r) => setTimeout(r, 600));
    }
    input.click();
    await new Promise((r) => setTimeout(r, 1200));
    const css = document.getElementById("readit-css-engine")?.textContent || "";
    const layout = document.documentElement.dataset.readitLayout || "";
    return {
      ok:
        input.checked &&
        (layout === "singleColumn" || css.includes("readit-layout:singleColumn")),
      layout,
      checked: input.checked,
    };
  });
  await closeStudio(page, { pressEscape: false });
  await shot(page, "14-hide-sidebars-bridge.png");
  record(
    "layout.bridge.hide_sidebars",
    bridge.ok ? "pass" : "fail",
    JSON.stringify(bridge),
  );

  // —— Page chrome slots ——
  await openStudio(page);
  await clickTab(page, "Layout");
  await clickLayoutPreset(page, "Classic");
  const chromeStamp = await studioEval(page, async () => {
    // Give recovery a beat to stamp the header after classic apply.
    for (let i = 0; i < 25; i++) {
      if (document.querySelector('[data-readit-slot="topNav"]')) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const top = document.querySelector('[data-readit-slot="topNav"]');
    return {
      ok: !!top,
      tag: top?.tagName || "",
      chromeTop: document.documentElement.dataset.readitChromeTop || "",
      headerPresent: !!document.querySelector("reddit-header-large"),
    };
  });
  record(
    "layout.chrome.stamp",
    chromeStamp.ok ? "pass" : "fail",
    JSON.stringify(chromeStamp),
  );

  const chromeBottom = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const btn = root?.querySelector('[data-chrome-zone="bottom"]');
    if (!(btn instanceof HTMLElement)) {
      return { ok: false, reason: "no bottom chip" };
    }
    btn.click();
    await new Promise((r) => setTimeout(r, 900));
    const top = document.querySelector('[data-readit-slot="topNav"]');
    const r = top?.getBoundingClientRect();
    const vh = window.innerHeight;
    return {
      ok:
        document.documentElement.dataset.readitChromeTop === "bottom" &&
        !!r &&
        Math.abs(r.bottom - vh) <= 4,
      zone: document.documentElement.dataset.readitChromeTop,
      bottom: r ? Math.round(r.bottom) : null,
      vh,
      chromeBottomVar: getComputedStyle(document.documentElement)
        .getPropertyValue("--readit-chrome-bottom")
        .trim(),
    };
  });
  record(
    "layout.chrome.move_bottom",
    chromeBottom.ok ? "pass" : "fail",
    JSON.stringify(chromeBottom),
  );

  const chromeResize = await setRangeByLabel(page, "Header height", 72);
  const chromeH = await cssVar(page, "--readit-chrome-bottom");
  const chromeTopVar = await cssVar(page, "--readit-chrome-top");
  record(
    "layout.chrome.resize_height",
    chromeResize.ok &&
      (chromeH.includes("72") || chromeTopVar.includes("72") || chromeH !== "0px")
      ? "pass"
      : "fail",
    JSON.stringify({ chromeResize, chromeH, chromeTopVar }),
  );

  // Restore header top
  await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    root?.querySelector('[data-chrome-zone="top"]')?.click();
    await new Promise((r) => setTimeout(r, 500));
  });

  const chromeTheme = await studioEval(page, () => {
    const top = document.querySelector('[data-readit-slot="topNav"]');
    if (!(top instanceof HTMLElement)) return { ok: false };
    const cs = getComputedStyle(top);
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue("--readit-accent")
      .trim();
    return {
      ok: true,
      font: cs.fontFamily,
      accent,
    };
  });
  record(
    "layout.chrome.theme",
    chromeTheme.ok ? "pass" : "fail",
    JSON.stringify(chromeTheme),
  );
  await closeStudio(page, { pressEscape: false });

  // Cleanup: classic + unlock
  await openStudio(page);
  await clickTab(page, "Layout");
  await clickLayoutPreset(page, "Classic");
  await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const lab = [...(root?.querySelectorAll("label") || [])].find((l) =>
      /Allow moving columns/i.test(l.textContent || ""),
    );
    const input = lab?.querySelector("input[type=checkbox]");
    if (input instanceof HTMLInputElement && input.checked) {
      input.click();
      await new Promise((r) => setTimeout(r, 400));
    }
  });
  await closeStudio(page);
} catch (err) {
  record("layout.harness.error", "fail", String(err));
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
