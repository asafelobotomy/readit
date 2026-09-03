/**
 * Full edit-mode / FAB / toolbox island smoke harness.
 *
 * Default: Playwright Chromium + --load-extension=dist/chrome-mv3
 * Brave:   READIT_CDP=http://127.0.0.1:9222 (npm run smoke:edit:brave)
 *
 * Evidence → docs/smoke-evidence/edit/
 * Checklist → docs/smoke-checklist-edit.md (statuses patched at end)
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
const outDir = path.resolve(root, "docs/smoke-evidence/edit");
const checklistPath = path.resolve(root, "docs/smoke-checklist-edit.md");
const userData = path.resolve(root, ".smoke-profile-edit");
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

async function shot(page, name) {
  try {
    await page.screenshot({
      path: path.join(outDir, name),
      fullPage: false,
    });
  } catch (err) {
    console.warn("shot failed", name, err);
  }
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

async function openFabMenu(page) {
  await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    if (!root) return;
    if (!root.querySelector(".readit-fab-menu")) {
      root.querySelector(".readit-fab")?.click();
    }
  });
  await sleep(250);
}

async function clickFabAction(page, label) {
  return studioEval(page, (lab) => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const btn = [...(root?.querySelectorAll(".readit-fab-action") || [])].find(
      (b) => (b.textContent || "").trim() === lab,
    );
    btn?.click();
    return !!btn;
  }, label);
}

async function enterEditMode(page) {
  await openFabMenu(page);
  const ok = await clickFabAction(page, "Edit Mode");
  await sleep(900);
  return ok;
}

async function clickToolboxChip(page, text) {
  return studioEval(page, (lab) => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const btn = [...(root?.querySelectorAll(".readit-edit-chip") || [])].find(
      (b) => (b.textContent || "").trim() === lab,
    );
    btn?.click();
    return !!btn;
  }, text);
}

async function setToolboxSelect(page, matchOption, value) {
  return studioEval(
    page,
    ({ matchOption: m, value: v }) => {
      const root = document.querySelector("readit-studio")?.shadowRoot;
      const selects = [...(root?.querySelectorAll(".readit-edit-select") || [])];
      const sel = selects.find((s) =>
        [...s.options].some((o) => new RegExp(m, "i").test(o.textContent || "")),
      );
      if (!(sel instanceof HTMLSelectElement)) return false;
      const proto = HTMLSelectElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      desc?.set?.call(sel, v);
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      return sel.value === v;
    },
    { matchOption, value },
  );
}

function patchChecklist(resultsList) {
  if (!fs.existsSync(checklistPath)) return;
  let md = fs.readFileSync(checklistPath, "utf8");
  const byId = new Map(resultsList.map((r) => [r.id, r.status]));
  md = md.replace(
    /^\| `(edit\.[^`]+)` \| (.+) \| ([AUM]) \| ([^|]*) \| ([^|]*)\|$/gm,
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
  // Manual rows without Shot column
  md = md.replace(
    /^\| `(edit\.manual\.[^`]+)` \| (.+) \| ([AUM]) \| ([^|]*)\|$/gm,
    (full, id, check, kind, _status) => {
      const st = byId.get(id);
      const mark =
        st === "pass"
          ? "✓"
          : st === "fail"
            ? "✗"
            : st === "skip"
              ? "—"
              : (_status || "").trim();
      return `| \`${id}\` | ${check} | ${kind} | ${mark} |`;
    },
  );
  const pass = resultsList.filter((r) => r.status === "pass").length;
  const fail = resultsList.filter((r) => r.status === "fail").length;
  const skip = resultsList.filter((r) => r.status === "skip").length;
  const stamp = `**Latest automated run:** ${new Date().toISOString().slice(0, 10)} · **${pass} pass / ${fail} fail / ${skip} skip**`;
  if (md.includes("**Latest automated run:**")) {
    md = md.replace(/\*\*Latest automated run:\*\*[^\n]*/, stamp);
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
  const unit = spawnSync("npm", ["run", "test:layout"], {
    cwd: root,
    encoding: "utf8",
  });
  record(
    "edit.unit",
    unit.status === 0 ? "pass" : "fail",
    unit.status === 0 ? "test:layout" : `${unit.stdout || ""}${unit.stderr || ""}`.slice(-500),
  );

  await page.goto("https://www.reddit.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await sleep(4500);
  await dismissConsent(page);
  await shot(page, "00-home.png");

  const shell = await studioEval(page, () => {
    const host = document.querySelector("readit-studio");
    return {
      host: !!host,
      fab: !!host?.shadowRoot?.querySelector(".readit-fab"),
      active: document.documentElement.classList.contains("readit-active"),
    };
  });
  record(
    "edit.shell_home",
    shell.host && shell.fab && shell.active ? "pass" : "fail",
    JSON.stringify(shell),
  );

  // —— FAB stack ——
  await openFabMenu(page);
  const stack = await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const labels = [...(root?.querySelectorAll(".readit-fab-action") || [])].map(
      (b) => (b.textContent || "").trim(),
    );
    const need = ["Edit Mode", "Settings", "GitHub", "Ko-fi"];
    return {
      ok: need.every((n) => labels.includes(n)),
      labels,
      menu: !!root?.querySelector(".readit-fab-menu"),
    };
  });
  await shot(page, "01-fab-stack.png");
  record(
    "edit.fab_stack_open",
    stack.ok ? "pass" : "fail",
    JSON.stringify(stack),
  );

  await studioEval(page, () => {
    document.querySelector("readit-studio")?.shadowRoot?.querySelector(".readit-fab")?.click();
  });
  await sleep(200);
  // Esc closes stack if still open
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(250);
  const closed = await studioEval(
    page,
    () =>
      !document
        .querySelector("readit-studio")
        ?.shadowRoot?.querySelector(".readit-fab-menu"),
  );
  record("edit.fab_stack_toggle", closed ? "pass" : "fail");

  await openFabMenu(page);
  await clickFabAction(page, "Settings");
  await sleep(500);
  const drawer = await studioEval(
    page,
    () =>
      !!document
        .querySelector("readit-studio")
        ?.shadowRoot?.querySelector(".readit-drawer"),
  );
  await shot(page, "11-settings-drawer.png");
  record("edit.fab_settings_drawer", drawer ? "pass" : "fail");

  // Close drawer
  await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    [...(root?.querySelectorAll("button") || [])]
      .find((b) => /^Close$/i.test((b.textContent || "").trim()))
      ?.click();
  });
  await sleep(350);

  const viaEvent = await studioEval(page, async () => {
    // Ensure edit mode off before testing open-studio → Settings only
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    window.dispatchEvent(new CustomEvent("readit:open-studio"));
    await new Promise((r) => setTimeout(r, 450));
    const root = document.querySelector("readit-studio")?.shadowRoot;
    return {
      drawer: !!root?.querySelector(".readit-drawer"),
      edit: document.documentElement.classList.contains("readit-layout-edit"),
      toolbox: !!root?.querySelector(".readit-edit-toolbox"),
    };
  });
  record(
    "edit.open_studio_event",
    viaEvent.drawer && !viaEvent.edit && !viaEvent.toolbox ? "pass" : "fail",
    JSON.stringify(viaEvent),
  );
  await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    [...(root?.querySelectorAll("button") || [])]
      .find((b) => /^Close$/i.test((b.textContent || "").trim()))
      ?.click();
  });
  await sleep(300);

  // —— Enter edit mode ——
  const entered = await enterEditMode(page);
  const editState = await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const box = root?.querySelector(".readit-edit-toolbox");
    const r = box?.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    return {
      entered: document.documentElement.classList.contains("readit-layout-edit"),
      toolbox: !!box,
      island: box?.getAttribute("data-readit-edit-island") === "1",
      geom: r
        ? {
            top: Math.round(r.top),
            bottom: Math.round(r.bottom),
            left: Math.round(r.left),
            width: Math.round(r.width),
            height: Math.round(r.height),
            nearBottom: r.bottom > vh - 120 && r.top > vh * 0.45,
            notTopSearch: r.top > 80,
            centeredish: Math.abs(r.left + r.width / 2 - vw / 2) < vw * 0.35,
          }
        : null,
      chips: [...(root?.querySelectorAll(".readit-edit-chip") || [])].map((b) =>
        (b.textContent || "").trim(),
      ),
      selects: root?.querySelectorAll(".readit-edit-select").length || 0,
      frames: document.querySelectorAll(".readit-layout-frame").length,
      checks: document.querySelectorAll(".readit-frame-select").length,
    };
  });
  await shot(page, "02-toolbox-island.png");
  record(
    "edit.enter_edit_mode",
    entered && editState.entered ? "pass" : "fail",
    JSON.stringify({ entered, edit: editState.entered }),
  );
  record(
    "edit.toolbox_present",
    editState.toolbox && editState.island ? "pass" : "fail",
    JSON.stringify(editState),
  );
  record(
    "edit.toolbox_bottom_island",
    editState.geom?.nearBottom && editState.geom?.notTopSearch
      ? "pass"
      : "fail",
    JSON.stringify(editState.geom),
  );
  const needChips = ["Classic", "Nav right", "Done"];
  record(
    "edit.toolbox_groups",
    needChips.every((c) => editState.chips.includes(c)) &&
      editState.chips.some((x) => x.startsWith("+ Sep")) &&
      editState.selects >= 2
      ? "pass"
      : "fail",
    JSON.stringify({ chips: editState.chips, selects: editState.selects }),
  );

  await sleep(400);
  const frames = await studioEval(page, () => ({
    frames: document.querySelectorAll(".readit-layout-frame").length,
    checks: document.querySelectorAll(".readit-frame-select").length,
    panels: [
      ...document.querySelectorAll(
        '.readit-layout-frame[data-kind="panel"] .readit-frame-select',
      ),
    ].length,
  }));
  await shot(page, "03-frames-select.png");
  record(
    "edit.frames_and_checkboxes",
    frames.frames >= 3 && frames.checks >= 3 ? "pass" : "fail",
    JSON.stringify(frames),
  );

  // —— Presets ——
  await clickToolboxChip(page, "Classic");
  await sleep(700);
  const classic = await studioEval(page, () => ({
    layout: document.documentElement.dataset.readitLayout || "",
    active: document
      .querySelector("readit-studio")
      ?.shadowRoot?.querySelector('.readit-edit-chip[data-active="true"]')
      ?.textContent?.trim(),
  }));
  record(
    "edit.preset.classic",
    /classic/i.test(classic.layout) || classic.active === "Classic"
      ? "pass"
      : "fail",
    JSON.stringify(classic),
  );

  await clickToolboxChip(page, "Nav right");
  await sleep(900);
  const navRight = await studioEval(page, () => {
    const css = document.getElementById("readit-css-engine")?.textContent || "";
    return {
      layout: document.documentElement.dataset.readitLayout || "",
      recipe: /navRight|nav.?right/i.test(css) || /navRight/i.test(document.documentElement.dataset.readitLayout || ""),
    };
  });
  await shot(page, "04-preset-nav-right.png");
  record(
    "edit.preset.nav_right",
    /navRight/i.test(navRight.layout) || navRight.recipe ? "pass" : "fail",
    JSON.stringify(navRight),
  );

  await clickToolboxChip(page, "Single");
  await sleep(900);
  const single = await studioEval(
    page,
    () => document.documentElement.dataset.readitLayout || "",
  );
  record(
    "edit.preset.single",
    /singleColumn/i.test(single) ? "pass" : "fail",
    single,
  );
  await clickToolboxChip(page, "Classic");
  await sleep(700);

  // —— Font ——
  await setToolboxSelect(page, "Serif|Sans|Mono|System", "serif");
  await sleep(600);
  const fontFamily = await studioEval(page, () =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--readit-font-family")
      .trim(),
  );
  await shot(page, "05-font-serif.png");
  record(
    "edit.font_family_serif",
    /serif|Georgia|Times/i.test(fontFamily) ? "pass" : "fail",
    fontFamily,
  );

  await setToolboxSelect(page, "Regular|Bold|Medium", "700");
  await sleep(500);
  const fontWeight = await studioEval(page, () =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--readit-font-weight")
      .trim(),
  );
  record(
    "edit.font_weight_bold",
    fontWeight === "700" ? "pass" : "fail",
    fontWeight,
  );

  const scale = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const range = root?.querySelector('.readit-edit-zoom input[type="range"]');
    if (!(range instanceof HTMLInputElement)) return { ok: false, reason: "no range" };
    const before = getComputedStyle(document.documentElement)
      .getPropertyValue("--readit-font-scale")
      .trim();
    range.value = "1.2";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    const after = getComputedStyle(document.documentElement)
      .getPropertyValue("--readit-font-scale")
      .trim();
    return { ok: after !== before || after === "1.2", before, after };
  });
  record("edit.font_scale", scale.ok ? "pass" : "fail", JSON.stringify(scale));

  // —— Zoom all ——
  // Clear selection first
  await studioEval(page, () => {
    for (const c of document.querySelectorAll(".readit-frame-select")) {
      if (c instanceof HTMLInputElement && c.checked) c.click();
    }
  });
  await sleep(300);
  const zoomAll = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const labelBefore = [...(root?.querySelectorAll(".readit-edit-label") || [])]
      .map((el) => el.textContent || "")
      .join(" ");
    const plus = [...(root?.querySelectorAll(".readit-edit-chip") || [])].find(
      (b) => (b.textContent || "").trim() === "+",
    );
    plus?.click();
    plus?.click();
    await new Promise((r) => setTimeout(r, 700));
    const css = document.getElementById("readit-css-engine")?.textContent || "";
    const labelAfter = [...(root?.querySelectorAll(".readit-edit-label") || [])]
      .map((el) => el.textContent || "")
      .join(" ");
    return {
      ok: /Zoom All/i.test(labelBefore) && /zoom:\s*1\./i.test(css),
      labelBefore,
      labelAfter,
      hasZoomCss: /zoom:\s*1\./i.test(css),
    };
  });
  await shot(page, "06-zoom-all.png");
  record("edit.zoom_all_step", zoomAll.ok ? "pass" : "fail", JSON.stringify(zoomAll));

  // —— Zoom selected ——
  const zoomSel = await studioEval(page, async () => {
    const feedCheck = document.querySelector(
      '.readit-layout-frame[data-id="main"] .readit-frame-select, .readit-layout-frame[data-kind="panel"] .readit-frame-select',
    );
    if (feedCheck instanceof HTMLInputElement && !feedCheck.checked) {
      feedCheck.click();
    }
    await new Promise((r) => setTimeout(r, 400));
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const labels = [...(root?.querySelectorAll(".readit-edit-label") || [])]
      .map((el) => (el.textContent || "").trim())
      .join(" | ");
    const plus = [...(root?.querySelectorAll(".readit-edit-chip") || [])].find(
      (b) => (b.textContent || "").trim() === "+",
    );
    plus?.click();
    await new Promise((r) => setTimeout(r, 700));
    const css = document.getElementById("readit-css-engine")?.textContent || "";
    return {
      labels,
      selLabel: /Zoom Sel/i.test(labels),
      panelZoom: /data-readit-slot="(main|leftNav|rightRail)"[\s\S]{0,80}zoom:/i.test(
        css,
      ) || /zoomByPanel|zoom:\s*1\./i.test(css),
      selected: !!document.querySelector('.readit-layout-frame[data-selected="1"]'),
    };
  });
  await shot(page, "07-zoom-selected.png");
  record(
    "edit.zoom_label_sel",
    zoomSel.selLabel ? "pass" : "fail",
    JSON.stringify(zoomSel),
  );
  record(
    "edit.zoom_selected_step",
    zoomSel.selected && zoomSel.panelZoom ? "pass" : "fail",
    JSON.stringify(zoomSel),
  );

  // —— Separators ——
  // Reset selection-ish; add up to 3
  const sep = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const clickSep = () => {
      const btn = [...(root?.querySelectorAll(".readit-edit-chip") || [])].find(
        (b) => /^\+ Sep/.test((b.textContent || "").trim()),
      );
      btn?.click();
      return btn;
    };
    clickSep();
    await new Promise((r) => setTimeout(r, 500));
    clickSep();
    await new Promise((r) => setTimeout(r, 500));
    clickSep();
    await new Promise((r) => setTimeout(r, 700));
    const fourth = clickSep();
    await new Promise((r) => setTimeout(r, 400));
    const label =
      [...(root?.querySelectorAll(".readit-edit-chip") || [])].find((b) =>
        /^\+ Sep/.test((b.textContent || "").trim()),
      )?.textContent || "";
    const disabled = [...(root?.querySelectorAll(".readit-edit-chip") || [])].some(
      (b) =>
        /^\+ Sep/.test((b.textContent || "").trim()) &&
        b instanceof HTMLButtonElement &&
        b.disabled,
    );
    const nodes = document.querySelectorAll("[data-readit-separator]").length;
    return {
      label: label.trim(),
      disabled,
      nodes,
      fourthWasDisabled: fourth instanceof HTMLButtonElement ? fourth.disabled : false,
    };
  });
  await shot(page, "08-separators.png");
  record(
    "edit.separator_add",
    sep.nodes >= 1 ? "pass" : "fail",
    JSON.stringify(sep),
  );
  record(
    "edit.separator_max_3",
    sep.nodes === 3 && sep.disabled && /3\/3/.test(sep.label)
      ? "pass"
      : "fail",
    JSON.stringify(sep),
  );

  const dual = await studioEval(page, () => {
    const host = document.getElementById("readit-col-resize-host");
    const panelLeft = host?.querySelectorAll(
      '.readit-col-resize[data-edge="left"]:not([data-kind="separator"])',
    ).length;
    const panelRight = host?.querySelectorAll(
      '.readit-col-resize[data-edge="right"]:not([data-kind="separator"])',
    ).length;
    const sepLeft = host?.querySelectorAll(
      '.readit-col-resize[data-kind="separator"][data-edge="left"]',
    ).length;
    const sepRight = host?.querySelectorAll(
      '.readit-col-resize[data-kind="separator"][data-edge="right"]',
    ).length;
    const removeBtns = document.querySelectorAll(".readit-frame-remove").length;
    return { panelLeft, panelRight, sepLeft, sepRight, removeBtns };
  });
  record(
    "edit.column_dual_resize",
    (dual.panelLeft || 0) >= 3 && (dual.panelRight || 0) >= 3 ? "pass" : "fail",
    JSON.stringify(dual),
  );
  record(
    "edit.separator_dual_resize",
    (dual.sepLeft || 0) >= 1 && (dual.sepRight || 0) >= 1 ? "pass" : "fail",
    JSON.stringify(dual),
  );

  const removed = await studioEval(page, async () => {
    const before = document.querySelectorAll("[data-readit-separator]").length;
    const btn = document.querySelector(".readit-frame-remove");
    if (!(btn instanceof HTMLElement)) return { ok: false, reason: "no x", before };
    btn.click();
    await new Promise((r) => setTimeout(r, 600));
    const after = document.querySelectorAll("[data-readit-separator]").length;
    return { ok: after === before - 1, before, after };
  });
  record(
    "edit.separator_remove_x",
    removed.ok ? "pass" : "fail",
    JSON.stringify(removed),
  );

  // —— Gutter ——
  await setToolboxSelect(page, "Gutter:", "line");
  await sleep(600);
  const gutter = await studioEval(page, () =>
    document.documentElement.classList.contains("readit-gutter-line"),
  );
  await shot(page, "09-gutter-line.png");
  record("edit.gutter_theme_line", gutter ? "pass" : "fail");

  // —— Done ——
  await clickToolboxChip(page, "Done");
  await sleep(700);
  const done = await studioEval(page, () => ({
    edit: document.documentElement.classList.contains("readit-layout-edit"),
    toolbox: !!document
      .querySelector("readit-studio")
      ?.shadowRoot?.querySelector(".readit-edit-toolbox"),
    frames: document.querySelectorAll(".readit-layout-frame").length,
  }));
  await shot(page, "10-done.png");
  record(
    "edit.done_exits",
    !done.edit && !done.toolbox && done.frames === 0 ? "pass" : "fail",
    JSON.stringify(done),
  );

  // —— Esc ——
  await enterEditMode(page);
  await sleep(500);
  await page.keyboard.press("Escape");
  await sleep(700);
  const esc = await studioEval(page, () => ({
    edit: document.documentElement.classList.contains("readit-layout-edit"),
    toolbox: !!document
      .querySelector("readit-studio")
      ?.shadowRoot?.querySelector(".readit-edit-toolbox"),
  }));
  record(
    "edit.esc_exits",
    !esc.edit && !esc.toolbox ? "pass" : "fail",
    JSON.stringify(esc),
  );

  record("edit.manual.island_vs_fab", "skip", "visual");
  record("edit.manual.github_kofi", "skip", "external tabs");
} catch (err) {
  record("edit.harness.error", "fail", String(err));
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
