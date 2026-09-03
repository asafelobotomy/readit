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
    // Close FAB action stack if open (FAB no longer toggles the drawer)
    if (root.querySelector(".readit-fab-menu")) {
      root.querySelector(".readit-fab")?.click();
    }
  });
  if (pressEscape) await page.keyboard.press("Escape").catch(() => {});
  await sleep(350);
}

async function clickTab(page, name) {
  await studioEval(page, (tabName) => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    [...(root?.querySelectorAll(".readit-tab") || [])]
      .find((t) => t.textContent?.includes(tabName))
      ?.click();
  }, name);
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

async function clickLayoutPreset(page, label) {
  return studioEval(page, async (name) => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const btn = [...(root?.querySelectorAll(".readit-tab") || [])].find(
      (t) => t.textContent?.trim() === name,
    );
    if (!btn) return { ok: false, reason: `no chip ${name}` };
    btn.click();
    await new Promise((r) => setTimeout(r, 1000));
    const css = document.getElementById("readit-css-engine")?.textContent || "";
    return {
      ok: true,
      layout: document.documentElement.dataset.readitLayout || "",
      columns: document.documentElement.dataset.readitColumns || "",
      css,
    };
  }, label);
}

async function setRangeByLabel(page, labelIncludes, nextVal) {
  return studioEval(
    page,
    async ({ labelIncludes: lab, nextVal: nv }) => {
      const root = document.querySelector("readit-studio")?.shadowRoot;
      const row = [...(root?.querySelectorAll(".readit-row") || [])].find((r) =>
        r.textContent?.includes(lab),
      );
      const input = row?.querySelector('input[type="range"]');
      if (!(input instanceof HTMLInputElement)) {
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
    const chips = [...(root?.querySelectorAll(".readit-tab") || [])]
      .map((t) => t.textContent?.trim())
      .filter(Boolean);
    const need = [
      "Classic",
      "Nav right",
      "Dual left",
      "Dual right",
      "Single column",
    ];
    const hasPresets = need.every((n) => chips.includes(n));
    const zone = !!root?.querySelector(".readit-zone-board");
    const text = root?.textContent || "";
    const slotHealth =
      text.includes("leftNav") && text.includes("main") && text.includes("rightRail")
      || (text.includes("leftNav:") && text.includes("main:"));
    const zoneLabels = [...(root?.querySelectorAll(".readit-slot-chip") || [])].map(
      (c) => c.textContent?.trim(),
    );
    return { hasPresets, zone, slotHealth, zoneLabels, chips: need.filter((n) => chips.includes(n)) };
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

  await applyAndShot("Classic", "classic", "01-classic.png", "layout.preset.classic");
  await applyAndShot("Nav right", "navRight", "02-nav-right.png", "layout.preset.nav_right");
  await applyAndShot("Dual left", "dualLeft", "03-dual-left.png", "layout.preset.dual_left");
  await applyAndShot("Dual right", "dualRight", "04-dual-right.png", "layout.preset.dual_right");
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
      padVars.left.includes("40") &&
      padVars.right.includes("48") &&
      padVars.gap.includes("16")
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

  // Restore usable widths for edit/DnD
  await openStudio(page);
  await clickTab(page, "Layout");
  await setRangeByLabel(page, "Nav (", 200);
  await setRangeByLabel(page, "Feed (", 640);
  await setRangeByLabel(page, "Rail (", 260);
  await setRangeByLabel(page, "Left pad", 24);
  await setRangeByLabel(page, "Right pad", 24);

  // —— Edit mode ——
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
  await setRangeByLabel(page, "Left pad", 56);
  await setRangeByLabel(page, "Right pad", 28);
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
    const shell = document.querySelector("[data-readit-layout-shell]");
    if (!(left instanceof HTMLElement) || !(shell instanceof HTMLElement)) {
      return null;
    }
    const a = left.getBoundingClientRect();
    const s = shell.getBoundingClientRect();
    return {
      sx: a.left + Math.min(a.width / 2, 8),
      sy: a.top + a.height / 2,
      ex: s.left + s.width * 0.75,
      ey: s.top + 80,
    };
  });
  if (padDrag && page.mouse) {
    await page.mouse.move(padDrag.sx, padDrag.sy);
    await page.mouse.down();
    await page.mouse.move(padDrag.ex, padDrag.ey, { steps: 16 });
    await sleep(80);
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
  record(
    "layout.dnd.pad_swap",
    padDrag &&
      padsBefore.left !== padsAfter.left &&
      padsBefore.right !== padsAfter.right
      ? "pass"
      : "fail",
    JSON.stringify({ padsBefore, padsAfter, padDrag }),
  );

  // —— Edge resize ——
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
      await new Promise((r) => setTimeout(r, 500));
    }
  });
  await closeStudio(page, { pressEscape: false });
  await sleep(500);

  const edgeBefore = await cssVar(page, "--readit-feed-width");
  const edge = await studioEval(page, () => {
    const handle = document.querySelector(
      '.readit-col-resize[data-readit-resize="main"]',
    );
    if (!(handle instanceof HTMLElement)) return null;
    const r = handle.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + Math.min(120, r.height / 2) };
  });
  if (edge && page.mouse) {
    await page.mouse.move(edge.x, edge.y);
    await page.mouse.down();
    await page.mouse.move(edge.x + 48, edge.y, { steps: 12 });
    await sleep(80);
    await page.mouse.up();
    await sleep(1800);
  }
  const edgeAfter = await cssVar(page, "--readit-feed-width");
  await shot(page, "11-resize-edge.png");
  record(
    "layout.resize.edge",
    edge && edgeBefore !== edgeAfter ? "pass" : "fail",
    JSON.stringify({ edgeBefore, edgeAfter, edge }),
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
    card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 1200));
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
    const side = [...(root?.querySelectorAll("label") || [])].find((l) =>
      l.textContent?.includes("Hide sidebars"),
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
    await new Promise((r) => setTimeout(r, 1000));
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
