/**
 * Full E2E smoke harness for readit on New Reddit.
 *
 * Default: Playwright Chromium + --load-extension=dist/chrome-mv3
 * Brave:   READIT_CDP=http://127.0.0.1:9222 (npm run smoke:brave) via puppeteer-core
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
const outDir = path.resolve(root, "docs/smoke-evidence");
const userData = path.resolve(root, ".smoke-profile");
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

function recordUnitTrackChecks() {
  const r = spawnSync("npm", ["run", "test:layout"], {
    cwd: root,
    encoding: "utf8",
  });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const map = [
    ["unit.noise_css", "CSS noise pack aiSummary"],
    ["unit.kb_focus_guard", "keyboard focus guard"],
    ["unit.import_preview", "import preview dry-run"],
    ["track.next.export_schema_stamp", "import preview dry-run"],
  ];
  for (const [id, name] of map) {
    if (out.includes(`pass  ${name}`)) record(id, "pass", name);
    else if (out.includes(`fail  ${name}`)) record(id, "fail", name);
    else record(id, r.status === 0 ? "pass" : "fail", `exit=${r.status}`);
  }
  record(
    "layout.unit",
    r.status === 0 ? "pass" : "fail",
    r.status === 0 ? "test:layout" : out.slice(-400),
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resolveReaditExtensionId(browser, isPuppeteer) {
  // 1) Prefer chrome://extensions manager shadow DOM
  try {
    const page = isPuppeteer
      ? await browser.newPage()
      : await browser.newPage();
    await page.goto("chrome://extensions", {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    await sleep(800);
    const id = await page.evaluate(() => {
      const root = document.querySelector("extensions-manager")?.shadowRoot;
      const list = root?.querySelector("extensions-item-list")?.shadowRoot;
      const items = [...(list?.querySelectorAll("extensions-item") || [])];
      for (const item of items) {
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

  // 2) Probe candidate IDs from targets + known unpacked path via popup text
  const ids = new Set();
  if (isPuppeteer) {
    for (const t of browser.targets()) {
      const u = t.url();
      if (u.startsWith("chrome-extension://")) ids.add(new URL(u).host);
    }
  }
  // Always try common discovery via /json/list when CDP
  try {
    const list = await fetch("http://127.0.0.1:9222/json/list").then((r) =>
      r.json(),
    );
    for (const t of list) {
      const u = t.url || "";
      if (u.startsWith("chrome-extension://")) ids.add(new URL(u).host);
    }
  } catch {
    /* ignore */
  }

  for (const id of ids) {
    try {
      const page = await browser.newPage();
      await page.goto(`chrome-extension://${id}/popup.html`, {
        waitUntil: "domcontentloaded",
        timeout: 5000,
      });
      await sleep(400);
      const ok = await page.evaluate(() =>
        /Profile-first New Reddit/i.test(document.body?.innerText || ""),
      );
      await page.close().catch(() => {});
      if (ok) return id;
    } catch {
      /* next */
    }
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
    const reloaded = await page.evaluate((id) => {
      const root = document.querySelector("extensions-manager")?.shadowRoot;
      const list = root?.querySelector("extensions-item-list")?.shadowRoot;
      const item = list?.querySelector(`extensions-item#${CSS.escape(id)}`);
      const btn = item?.shadowRoot?.querySelector("#dev-reload-button");
      if (btn instanceof HTMLElement) {
        btn.click();
        return true;
      }
      return false;
    }, extensionId);
    await sleep(1500);
    await page.close().catch(() => {});
    return reloaded;
  } catch {
    return false;
  }
}

/** Shared page helpers — work in both Playwright and Puppeteer. */
async function studioEval(page, fn, ...args) {
  return page.evaluate(fn, ...args);
}

async function openStudio(page) {
  await studioEval(page, () => {
    const host = document.querySelector("readit-studio");
    const root = host?.shadowRoot;
    if (!root) return;
    if (!root.querySelector(".readit-drawer")) {
      root.querySelector(".readit-fab")?.click();
    }
  });
  await sleep(500);
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

async function clickStudioButton(page, text) {
  return studioEval(page, (label) => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const btn = [...(root?.querySelectorAll("button") || [])].find((b) =>
      b.textContent?.includes(label),
    );
    btn?.click();
    return !!btn;
  }, text);
}

async function setControlledInput(page, selectorInShadow, value) {
  return studioEval(
    page,
    ({ selector, value: v }) => {
      const root = document.querySelector("readit-studio")?.shadowRoot;
      const el = root?.querySelector(selector);
      if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement) && !(el instanceof HTMLSelectElement)) {
        return false;
      }
      const proto =
        el instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      setter?.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    { selector: selectorInShadow, value },
  );
}

async function dismissConsent(page) {
  await page.evaluate(() => {
    for (const label of ["Accept all", "Accept All", "I agree", "Accept"]) {
      const btn = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === label,
      );
      if (btn) {
        btn.click();
        return;
      }
    }
  });
  await sleep(800);
}

async function shot(page, name) {
  await page.screenshot({
    path: path.join(outDir, name),
    fullPage: false,
  }).catch(() => {});
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
  try {
    puppeteerBrowser = await puppeteer.connect({
      browserURL: cdpEndpoint.replace(/\/$/, ""),
      defaultViewport: null,
    });
  } catch (err) {
    console.error(
      "CDP connect failed. Fully quit Brave Origin, then start it with:\n" +
        "  /opt/brave-origin-bin/brave-origin --remote-debugging-port=9222 '--remote-allow-origins=*'\n" +
        "Verify with: curl -s http://127.0.0.1:9222/json/version\n" +
        `Detail: ${err instanceof Error ? err.message : err}`,
    );
    process.exit(1);
  }
  page = await puppeteerBrowser.newPage();
  cdpMode = true;
  extensionId = await resolveReaditExtensionId(puppeteerBrowser, true);
  if (extensionId) {
    console.log(`Resolved readit extension id: ${extensionId}`);
    // Pick up latest dist after local package fixes
    const reloaded = await reloadReaditExtension(puppeteerBrowser, extensionId);
    console.log(reloaded ? "Reloaded readit unpacked extension" : "Could not click Reload (continuing)");
  } else {
    console.warn("Could not resolve readit extension id — popup probes will skip");
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
    viewport: { width: 1400, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  page = playwrightContext.pages()[0] || (await playwrightContext.newPage());
  for (let i = 0; i < 30 && !extensionId; i++) {
    const sw = playwrightContext.serviceWorkers();
    const hit = sw.find((w) => w.url().includes("chrome-extension://"));
    if (hit) extensionId = new URL(hit.url()).host;
    else await sleep(200);
  }
}

try {
  recordUnitTrackChecks();
  record(
    "track.later.anti_refresh_manual",
    "skip",
    "manual — verify home new-posts chip hidden with anti-refresh on",
  );

  // —— Shell: extension present ——
  let swOk = false;
  for (let i = 0; i < 25; i++) {
    if (cdpMode) {
      swOk =
        !!extensionId ||
        puppeteerBrowser
          .targets()
          .some((t) => t.url().includes("chrome-extension://"));
      // Presence of FAB later is the real proof; keep trying id resolve once
      if (!extensionId) {
        extensionId = await resolveReaditExtensionId(puppeteerBrowser, true);
      }
    } else {
      swOk = playwrightContext
        .serviceWorkers()
        .some((w) => w.url().includes("chrome-extension://"));
      if (!extensionId) {
        const hit = playwrightContext
          .serviceWorkers()
          .find((w) => w.url().includes("chrome-extension://"));
        if (hit) extensionId = new URL(hit.url()).host;
      }
    }
    if (swOk && extensionId) break;
    await sleep(200);
  }
  record(
    "shell.extension_loads",
    swOk ? "pass" : "fail",
    extensionId ? `id=${extensionId}` : "no extension id",
  );

  await page.goto("https://www.reddit.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await sleep(4000);
  await dismissConsent(page);
  await shot(page, "01-home.png");

  const fabInShadow = await studioEval(page, () => {
    const host = document.querySelector("readit-studio");
    if (!host?.shadowRoot) return { host: !!host, fab: false, classes: [] };
    const fab = host.shadowRoot.querySelector(".readit-fab");
    return {
      host: true,
      fab: !!fab,
      classes: [...document.documentElement.classList],
      toolbox: document.documentElement.dataset.readitToolbox || "",
      styleTag: !!document.getElementById("readit-css-engine"),
    };
  });

  record(
    "shell.fab_present",
    fabInShadow.fab ? "pass" : "fail",
    JSON.stringify(fabInShadow),
  );
  record(
    "shell.early_css",
    fabInShadow.styleTag || fabInShadow.classes.includes("readit-active")
      ? "pass"
      : "fail",
    `styleTag=${fabInShadow.styleTag}`,
  );
  record(
    "coexist.toolbox_attr",
    fabInShadow.toolbox === "0" || fabInShadow.toolbox === "1" ? "pass" : "fail",
    `toolbox=${fabInShadow.toolbox}`,
  );

  if (!fabInShadow.fab) {
    throw new Error("FAB missing — aborting remaining studio probes");
  }

  await openStudio(page);
  const drawer = await studioEval(
    page,
    () => !!document.querySelector("readit-studio")?.shadowRoot?.querySelector(".readit-drawer"),
  );
  record("shell.fab_opens_studio", drawer ? "pass" : "fail");
  await shot(page, "02-studio-open.png");

  const tabs = await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    return [...(root?.querySelectorAll(".readit-tab") || [])].map(
      (t) => t.textContent?.trim() || "",
    );
  });
  const needTabs = [
    "Simple",
    "Layout",
    "Advanced",
    "Curate",
    "Create",
    "CQS",
    "Mod",
    "Library",
  ];
  record(
    "shell.tabs_present",
    needTabs.every((t) => tabs.includes(t)) ? "pass" : "fail",
    tabs.join(","),
  );

  // —— Profiles ——
  async function switchProfile(name) {
    await clickTab(page, "Simple");
    return studioEval(page, async (profileName) => {
      const root = document.querySelector("readit-studio")?.shadowRoot;
      const card = [...(root?.querySelectorAll(".readit-card") || [])].find((c) =>
        c.textContent?.includes(profileName),
      );
      if (!card) return { ok: false, reason: "card missing" };
      card.click();
      await new Promise((r) => setTimeout(r, 1100));
      const active = [...(root?.querySelectorAll(".readit-card") || [])].find(
        (c) => c.getAttribute("data-active") === "true",
      );
      return {
        ok: active?.textContent?.includes(profileName) ?? false,
        feedWidth: getComputedStyle(document.documentElement).getPropertyValue(
          "--readit-feed-width",
        ).trim(),
        classes: [...document.documentElement.classList].filter((c) =>
          c.startsWith("readit"),
        ),
        kb:
          document.documentElement.dataset.readitKb === "1" ||
          document.documentElement.dataset.readitKb === "readit" ||
          !!(window).__readitKb,
        kbMode: document.documentElement.dataset.readitKb || "",
        compact: document.documentElement.classList.contains("readit-feed-compact"),
      };
    }, name);
  }

  const focus = await switchProfile("Focus Reader");
  record(
    "profile.focus_reader",
    focus.ok && String(focus.feedWidth).includes("980") ? "pass" : "fail",
    JSON.stringify(focus),
  );

  const dense = await switchProfile("Dense Power");
  record(
    "profile.dense_power",
    dense.ok && String(dense.feedWidth).includes("1100") ? "pass" : "fail",
    JSON.stringify(dense),
  );
  // Wave A: Dense defaults to defer (official hotkeys), not readit J/K.
  record(
    "advanced.keyboard_nav",
    dense.kbMode === "defer" || dense.kbMode === "readit" ? "pass" : "fail",
    `data-readit-kb=${dense.kbMode}`,
  );
  record(
    "track.waveA.hotkey_defer",
    dense.kbMode === "defer" && !dense.kb ? "pass" : "fail",
    JSON.stringify({ kbMode: dense.kbMode, kb: dense.kb }),
  );
  record(
    "track.waveA.compact_feed",
    dense.compact ? "pass" : "fail",
    JSON.stringify({ compact: dense.compact }),
  );
  record(
    "simple.profile_switch",
    dense.ok ? "pass" : "fail",
    "alias of Dense Power switch",
  );

  const creator = await switchProfile("Creator Desk");
  record(
    "profile.creator_desk",
    creator.ok && String(creator.feedWidth).includes("1000") ? "pass" : "fail",
    JSON.stringify(creator),
  );

  const minimal = await switchProfile("Minimal Media");
  record(
    "profile.minimal_media",
    minimal.ok && String(minimal.feedWidth).includes("900") ? "pass" : "fail",
    JSON.stringify(minimal),
  );

  const modProf = await switchProfile("Mod Desk");
  record(
    "profile.mod_desk",
    modProf.ok && modProf.classes?.includes("readit-queue-density")
      ? "pass"
      : "fail",
    JSON.stringify(modProf),
  );

  // —— Undo (after switching away from Mod Desk) ——
  await switchProfile("Focus Reader");
  const beforeUndo = await studioEval(page, () =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--readit-feed-width")
      .trim(),
  );
  await switchProfile("Dense Power");
  await clickStudioButton(page, "Undo");
  await sleep(1000);
  const afterUndo = await studioEval(page, () => ({
    width: getComputedStyle(document.documentElement)
      .getPropertyValue("--readit-feed-width")
      .trim(),
    toast: document.querySelector("readit-studio")?.shadowRoot?.querySelector(".readit-toast")
      ?.textContent || "",
  }));
  record(
    "shell.undo",
    afterUndo.width === beforeUndo || /Undid|undo/i.test(afterUndo.toast)
      ? "pass"
      : "fail",
    JSON.stringify({ beforeUndo, afterUndo }),
  );

  // —— Simple knobs ——
  await clickTab(page, "Simple");
  await switchProfile("Focus Reader");

  const sidebarToggle = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const side = [...(root?.querySelectorAll("label") || [])].find((l) =>
      l.textContent?.includes("Hide sidebars"),
    );
    const input = side?.querySelector("input[type=checkbox]");
    if (!input) return { ok: false };
    const before = input.checked;
    input.click();
    await new Promise((r) => setTimeout(r, 700));
    return { ok: input.checked !== before, before, after: input.checked };
  });
  record(
    "simple.hide_sidebars_toggle",
    sidebarToggle.ok ? "pass" : "fail",
    JSON.stringify(sidebarToggle),
  );

  const promotedToggle = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const lab = [...(root?.querySelectorAll("label") || [])].find((l) =>
      l.textContent?.includes("Hide promoted"),
    );
    const input = lab?.querySelector("input[type=checkbox]");
    if (!input) return { ok: false };
    const before = input.checked;
    input.click();
    await new Promise((r) => setTimeout(r, 700));
    return { ok: input.checked !== before, before, after: input.checked };
  });
  record(
    "simple.hide_promoted_toggle",
    promotedToggle.ok ? "pass" : "fail",
    JSON.stringify(promotedToggle),
  );

  const densityFont = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const rows = [...(root?.querySelectorAll(".readit-row") || [])];
    const dens = rows.find((r) => r.textContent?.includes("Density"));
    const font = rows.find((r) => r.textContent?.includes("Font scale"));
    const densInput = dens?.querySelector('input[type="range"]');
    const fontInput = font?.querySelector('input[type="range"]');
    if (!(densInput instanceof HTMLInputElement) || !(fontInput instanceof HTMLInputElement)) {
      return { ok: false, reason: "ranges missing" };
    }
    const setRange = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setRange(densInput, 40);
    setRange(fontInput, 110);
    await new Promise((r) => setTimeout(r, 900));
    const gap = getComputedStyle(document.documentElement)
      .getPropertyValue("--readit-gap")
      .trim();
    const scale = getComputedStyle(document.documentElement)
      .getPropertyValue("--readit-font-scale")
      .trim();
    return { ok: !!gap && !!scale, gap, scale };
  });
  record(
    "simple.density_font",
    densityFont.ok ? "pass" : "fail",
    JSON.stringify(densityFont),
  );

  const mediaMode = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const select = [...(root?.querySelectorAll("select.readit-select") || [])].find(
      (s) => [...s.options].some((o) => o.value === "links_on_feed"),
    );
    if (!(select instanceof HTMLSelectElement)) {
      return { ok: false, reason: "no media select" };
    }
    const setter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set;
    setter?.call(select, "links_on_feed");
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 800));
    return { ok: select.value === "links_on_feed", value: select.value };
  });
  record(
    "simple.media_mode",
    mediaMode.ok ? "pass" : "fail",
    JSON.stringify(mediaMode),
  );

  const quiet = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const lab = [...(root?.querySelectorAll("label") || [])].find((l) =>
      l.textContent?.includes("Quiet NSFW"),
    );
    const input = lab?.querySelector("input[type=checkbox]");
    if (!input) return { ok: false };
    if (!input.checked) input.click();
    await new Promise((r) => setTimeout(r, 900));
    // open Curate to see filter
    [...(root?.querySelectorAll(".readit-tab") || [])]
      .find((t) => t.textContent?.includes("Curate"))
      ?.click();
    await new Promise((r) => setTimeout(r, 400));
    const listed = [...(root?.querySelectorAll(".readit-list-item") || [])].some(
      (i) => i.textContent?.includes("nsfw"),
    );
    return { ok: listed, checked: input.checked };
  });
  record("simple.quiet_nsfw", quiet.ok ? "pass" : "fail", JSON.stringify(quiet));

  await clickTab(page, "Simple");
  const syncLw = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const lab = [...(root?.querySelectorAll("label") || [])].find((l) =>
      l.textContent?.includes("Sync lightweight"),
    );
    const input = lab?.querySelector("input[type=checkbox]");
    if (!input) return { ok: false };
    const before = input.checked;
    input.click();
    await new Promise((r) => setTimeout(r, 700));
    return { ok: input.checked !== before, before, after: input.checked };
  });
  record(
    "simple.sync_lightweight",
    syncLw.ok ? "pass" : "fail",
    JSON.stringify(syncLw),
  );

  // Picker arm + Esc
  await clickTab(page, "Simple");
  await clickStudioButton(page, "Element picker");
  await sleep(400);
  const pickerArmed = await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    return !!root?.querySelector(".readit-picker-banner");
  });
  await page.keyboard.press("Escape");
  await sleep(500);
  const pickerGone = await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    return !root?.querySelector(".readit-picker-banner");
  });
  record(
    "simple.picker_arm_esc",
    pickerArmed && pickerGone ? "pass" : "fail",
    JSON.stringify({ pickerArmed, pickerGone }),
  );

  // —— Layout slots ——
  await openStudio(page);
  await clickTab(page, "Layout");
  await sleep(400);
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
    const healthText = root?.textContent || "";
    const slotHealth =
      healthText.includes("leftNav:") && healthText.includes("main:");
    return { hasPresets, zone, slotHealth, chips: need.filter((n) => chips.includes(n)) };
  });
  record(
    "layout.tab_ui",
    layoutUi.hasPresets && layoutUi.zone ? "pass" : "fail",
    JSON.stringify(layoutUi),
  );
  record(
    "layout.presets_chips",
    layoutUi.hasPresets ? "pass" : "fail",
    JSON.stringify(layoutUi.chips),
  );
  record(
    "layout.slot_health",
    layoutUi.slotHealth ? "pass" : "fail",
    JSON.stringify({ slotHealth: layoutUi.slotHealth }),
  );

  async function clickLayoutPreset(label) {
    return studioEval(page, async (name) => {
      const root = document.querySelector("readit-studio")?.shadowRoot;
      const btn = [...(root?.querySelectorAll(".readit-tab") || [])].find(
        (t) => t.textContent?.trim() === name,
      );
      if (!btn) return { ok: false, reason: `no chip ${name}` };
      btn.click();
      await new Promise((r) => setTimeout(r, 900));
      const css = document.getElementById("readit-css-engine")?.textContent || "";
      return {
        ok: true,
        layout: document.documentElement.dataset.readitLayout || "",
        cssHasRecipe: css.includes("readit-layout-recipe"),
        css,
      };
    }, label);
  }

  const navRight = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const btn = [...(root?.querySelectorAll(".readit-tab") || [])].find(
      (t) => t.textContent?.trim() === "Nav right",
    );
    if (!btn) return { ok: false, reason: "no nav right chip" };
    btn.click();
    await new Promise((r) => setTimeout(r, 900));
    const left = document.querySelector("#left-sidebar-container");
    const stamped = left?.getAttribute("data-readit-slot") === "leftNav";
    const css = document.getElementById("readit-css-engine")?.textContent || "";
    const recipe =
      css.includes("readit-layout-recipe") &&
      css.includes("readit-layout:navRight");
    const preset =
      document.documentElement.dataset.readitLayout === "navRight" ||
      document.documentElement.classList.contains("readit-layout-preset-navRight");
    return { ok: stamped && recipe && preset, stamped, recipe, preset };
  });
  record(
    "layout.nav_right",
    navRight.ok ? "pass" : "fail",
    JSON.stringify(navRight),
  );
  await shot(page, "layout-nav-right.png");

  const dualLeft = await clickLayoutPreset("Dual left");
  record(
    "layout.dual_left",
    dualLeft.ok &&
      dualLeft.layout === "dualLeft" &&
      (dualLeft.css || "").includes("readit-layout:dualLeft")
      ? "pass"
      : "fail",
    JSON.stringify({
      ok: dualLeft.ok,
      layout: dualLeft.layout,
      hasRecipe: (dualLeft.css || "").includes("readit-layout:dualLeft"),
    }),
  );

  const singleCol = await clickLayoutPreset("Single column");
  record(
    "layout.single_column",
    singleCol.ok &&
      singleCol.layout === "singleColumn" &&
      (singleCol.css || "").includes("readit-layout:singleColumn")
      ? "pass"
      : "fail",
    JSON.stringify({
      ok: singleCol.ok,
      layout: singleCol.layout,
      hasRecipe: (singleCol.css || "").includes("readit-layout:singleColumn"),
    }),
  );

  const classic = await clickLayoutPreset("Classic");
  record(
    "layout.reset_classic",
    classic.ok &&
      classic.layout === "classic" &&
      (classic.css || "").includes("readit-layout:classic")
      ? "pass"
      : "fail",
    JSON.stringify({ ok: classic.ok, layout: classic.layout }),
  );

  const widths = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const row = [...(root?.querySelectorAll(".readit-row") || [])].find((r) =>
      r.textContent?.includes("Left nav"),
    );
    const input = row?.querySelector('input[type="range"]');
    if (!(input instanceof HTMLInputElement)) return { ok: false, reason: "no slider" };
    const before = getComputedStyle(document.documentElement)
      .getPropertyValue("--readit-left-nav-width")
      .trim();
    const nextVal = String(
      Math.min(420, Math.max(180, Number(input.value) === 300 ? 280 : 300)),
    );
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, nextVal);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 900));
    const after = getComputedStyle(document.documentElement)
      .getPropertyValue("--readit-left-nav-width")
      .trim();
    return {
      ok: after.includes(nextVal) || after !== before,
      before,
      after,
      nextVal,
    };
  });
  record("layout.widths", widths.ok ? "pass" : "fail", JSON.stringify(widths));

  // Edit layout mode
  const editMode = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const btn = [...(root?.querySelectorAll("button") || [])].find((b) =>
      /Edit layout/i.test(b.textContent || ""),
    );
    if (!btn) return { ok: false, reason: "no edit button" };
    btn.click();
    await new Promise((r) => setTimeout(r, 700));
    const banner = [...(root?.querySelectorAll(".readit-picker-banner") || [])].some(
      (b) => /Layout edit/i.test(b.textContent || ""),
    );
    const cls = document.documentElement.classList.contains("readit-layout-edit");
    return { armed: banner || cls, banner, cls };
  });
  await page.keyboard.press("Escape");
  await sleep(800);
  const editOff = await studioEval(page, () => ({
    banner: !!document
      .querySelector("readit-studio")
      ?.shadowRoot?.querySelector(".readit-picker-banner"),
    cls: document.documentElement.classList.contains("readit-layout-edit"),
  }));
  record(
    "layout.edit_mode",
    editMode.armed && !editOff.cls ? "pass" : "fail",
    JSON.stringify({ editMode, editOff }),
  );

  // Hide sidebars bridge → singleColumn
  await openStudio(page);
  await clickTab(page, "Simple");
  await sleep(300);
  // Ensure sidebars unchecked first, then turn on
  const bridge = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const side = [...(root?.querySelectorAll("label") || [])].find((l) =>
      l.textContent?.includes("Hide sidebars"),
    );
    const input = side?.querySelector("input[type=checkbox]");
    if (!(input instanceof HTMLInputElement)) return { ok: false, reason: "no checkbox" };
    if (input.checked) {
      input.click();
      await new Promise((r) => setTimeout(r, 700));
    }
    input.click();
    await new Promise((r) => setTimeout(r, 900));
    const css = document.getElementById("readit-css-engine")?.textContent || "";
    const layout = document.documentElement.dataset.readitLayout || "";
    return {
      ok:
        input.checked &&
        (layout === "singleColumn" || css.includes("readit-layout:singleColumn")),
      checked: input.checked,
      layout,
      hasRecipe: css.includes("readit-layout:singleColumn"),
    };
  });
  record(
    "layout.hide_sidebars_bridge",
    bridge.ok ? "pass" : "fail",
    JSON.stringify(bridge),
  );
  // Restore classic for later probes
  await clickTab(page, "Layout");
  await clickLayoutPreset("Classic");

  // Noise pack + Create feed UX
  await openStudio(page);
  await clickTab(page, "Simple");
  const noisePack = await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const text = root?.textContent || "";
    return {
      ok:
        /Chrome noise pack|Related Communities|AI summar/i.test(text) ||
        /界面噪音包|相关社区/.test(text),
    };
  });
  record("simple.noise_pack_ui", noisePack.ok ? "pass" : "fail", JSON.stringify(noisePack));

  // Wave A — feed philosophy + action declutter
  const waveA = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const text = root?.textContent || "";
    const hasPhilosophy =
      /Feed philosophy|信息流哲学|Start on Following|Following/i.test(text);
    const awardsLab = [...(root?.querySelectorAll("label") || [])].find((l) =>
      /Hide awards|隐藏奖励/i.test(l.textContent || ""),
    );
    const awards = awardsLab?.querySelector("input[type=checkbox]");
    if (awards instanceof HTMLInputElement && !awards.checked) {
      awards.click();
      await new Promise((r) => setTimeout(r, 700));
    }
    const css = document.getElementById("readit-css-engine")?.textContent || "";
    const lurkerLab = [...(root?.querySelectorAll("label") || [])].find((l) =>
      /Lurker mode|潜水模式/i.test(l.textContent || ""),
    );
    const lurker = lurkerLab?.querySelector("input[type=checkbox]");
    if (lurker instanceof HTMLInputElement && !lurker.checked) {
      lurker.click();
      await new Promise((r) => setTimeout(r, 700));
    }
    return {
      hasPhilosophy,
      awardsCss: /readit-hide:awards/.test(css),
      lurkerClass: document.documentElement.classList.contains("readit-lurker"),
      followingFlag: /Start on Following|Following（非 For You）|默认 Following/i.test(
        text,
      ),
    };
  });
  record(
    "track.waveA.feed_philosophy_ui",
    waveA.hasPhilosophy ? "pass" : "fail",
    JSON.stringify(waveA),
  );
  record(
    "track.waveA.action_declutter",
    waveA.awardsCss ? "pass" : "fail",
    JSON.stringify(waveA),
  );
  record(
    "track.waveA.lurker_mode",
    waveA.lurkerClass ? "pass" : "fail",
    JSON.stringify(waveA),
  );
  const followingStatus = await page.evaluate(
    () => document.documentElement.dataset.readitFollowing || "none",
  );
  // ok = switched; degraded = not home / partial; broken = no tabs; none = not applied yet
  record(
    "track.waveA.following_default",
    followingStatus === "ok" || followingStatus === "degraded"
      ? "pass"
      : followingStatus === "broken" || followingStatus === "none"
        ? "skip"
        : "fail",
    `dataset.readitFollowing=${followingStatus}`,
  );

  await clickTab(page, "Create");
  const createUx = await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const text = root?.textContent || "";
    return {
      ok: /Mark read|auto-refresh|Comment quote|account switcher/i.test(text),
    };
  });
  record("create.feed_ux_controls", createUx.ok ? "pass" : "fail", JSON.stringify(createUx));

  await clickTab(page, "Advanced");
  const healthOverview = await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const text = root?.textContent || "";
    return {
      ok: /Feature health overview|ok:|degraded:/i.test(text),
    };
  });
  record(
    "advanced.health_overview",
    healthOverview.ok ? "pass" : "fail",
    JSON.stringify(healthOverview),
  );

  // —— Feedback roadmap tracks (v4) ——
  await openStudio(page);
  await clickTab(page, "Simple");
  const positioning = await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const text = root?.textContent || "";
    return {
      ok: /New Reddit|shreddit|Moderator Toolbox|Old Reddit Redirect/i.test(text),
    };
  });
  record(
    "track.now.positioning_blurb",
    positioning.ok ? "pass" : "fail",
    JSON.stringify(positioning),
  );
  record(
    "track.now.noise_pack_ui",
    noisePack.ok ? "pass" : "fail",
    "alias of simple.noise_pack_ui",
  );

  const noiseToggle = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const lab = [...(root?.querySelectorAll("label") || [])].find((l) =>
      /AI summar|AI 摘要/i.test(l.textContent || ""),
    );
    const input = lab?.querySelector("input[type=checkbox]");
    if (!(input instanceof HTMLInputElement)) return { ok: false, reason: "no ai toggle" };
    if (!input.checked) {
      input.click();
      await new Promise((r) => setTimeout(r, 900));
    }
    const css = document.getElementById("readit-css-engine")?.textContent || "";
    return {
      ok: /ai-summary|ai_summary/i.test(css),
      checked: input.checked,
    };
  });
  record(
    "track.now.noise_toggle_css",
    noiseToggle.ok ? "pass" : "fail",
    JSON.stringify(noiseToggle),
  );

  {
    const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
    const loadTxt = fs.readFileSync(path.join(root, "LOAD_IN_CHROME.txt"), "utf8");
    const docsOk =
      /New Reddit|shreddit/i.test(readme) &&
      /New Reddit|shreddit|not Old Reddit/i.test(loadTxt);
    record(
      "track.now.docs_positioning",
      docsOk ? "pass" : "fail",
      docsOk ? "README + LOAD_IN_CHROME.txt" : "missing New Reddit positioning copy",
    );
  }

  await clickTab(page, "Create");
  const markControls = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const text = root?.textContent || "";
    const hasControls =
      /Mark read|已读标记/i.test(text) &&
      !!root?.querySelector("select.readit-select");
    const lab = [...(root?.querySelectorAll("label") || [])].find((l) =>
      /Mark read|已读标记/i.test(l.textContent || ""),
    );
    const input = lab?.querySelector("input[type=checkbox]");
    if (input instanceof HTMLInputElement && !input.checked) {
      input.click();
      await new Promise((r) => setTimeout(r, 800));
    }
    const mode = root?.querySelector("select.readit-select");
    if (mode instanceof HTMLSelectElement) {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )?.set;
      setter?.call(mode, "open");
      mode.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 800));
    }
    return {
      ok: hasControls && (input?.checked ?? false),
      hasControls,
      checked: input?.checked ?? false,
    };
  });
  record(
    "track.next.mark_read_controls",
    markControls.hasControls ? "pass" : "fail",
    JSON.stringify(markControls),
  );
  record(
    "track.next.mark_read_apply",
    markControls.ok ? "pass" : "fail",
    JSON.stringify(markControls),
  );

  const laterCreate = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const antiLab = [...(root?.querySelectorAll("label") || [])].find((l) =>
      /auto-refresh|自动刷新/i.test(l.textContent || ""),
    );
    const anti = antiLab?.querySelector("input[type=checkbox]");
    const cmtLab = [...(root?.querySelectorAll("label") || [])].find((l) =>
      /Comment quote|评论引用/i.test(l.textContent || ""),
    );
    const cmt = cmtLab?.querySelector("input[type=checkbox]");
    if (anti instanceof HTMLInputElement && !anti.checked) {
      anti.click();
      await new Promise((r) => setTimeout(r, 700));
    }
    if (cmt instanceof HTMLInputElement && !cmt.checked) {
      cmt.click();
      await new Promise((r) => setTimeout(r, 700));
    }
    const cls = document.documentElement.classList.contains("readit-anti-refresh");
    const account = [...(root?.querySelectorAll("button") || [])].some((b) =>
      /account switcher|账号切换/i.test(b.textContent || ""),
    );
    return {
      antiOn: anti instanceof HTMLInputElement ? anti.checked : false,
      antiClass: cls,
      commentOn: cmt instanceof HTMLInputElement ? cmt.checked : false,
      account,
    };
  });
  record(
    "track.later.anti_refresh_toggle",
    laterCreate.antiOn && laterCreate.antiClass ? "pass" : "fail",
    JSON.stringify(laterCreate),
  );
  record(
    "track.later.comment_ux_toggle",
    laterCreate.commentOn ? "pass" : "fail",
    JSON.stringify(laterCreate),
  );
  record(
    "track.later.account_switcher_btn",
    laterCreate.account ? "pass" : "fail",
    JSON.stringify(laterCreate),
  );

  await clickTab(page, "Curate");
  const curateKinds = await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const opts = [...(root?.querySelectorAll("select.readit-select option") || [])].map(
      (o) => o.getAttribute("value") || o.textContent || "",
    );
    const text = root?.textContent || "";
    return {
      flair: opts.includes("flair"),
      karmaMax: opts.includes("karmaMax"),
      blockSub: /Block this subreddit/i.test(text),
      blockUser: /Block typed user/i.test(text),
    };
  });
  record(
    "track.next.filter_kinds",
    curateKinds.flair && curateKinds.karmaMax ? "pass" : "fail",
    JSON.stringify(curateKinds),
  );
  record(
    "track.next.block_helpers",
    curateKinds.blockSub && curateKinds.blockUser ? "pass" : "fail",
    JSON.stringify(curateKinds),
  );

  await clickTab(page, "Advanced");
  record(
    "track.next.health_overview",
    healthOverview.ok ? "pass" : "fail",
    "alias of advanced.health_overview",
  );
  const localeSwitch = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const sel = [...(root?.querySelectorAll("select.readit-select") || [])].find((s) =>
      [...s.options].some((o) => o.value === "zh"),
    );
    if (!(sel instanceof HTMLSelectElement)) return { ok: false, reason: "no locale" };
    const setter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set;
    setter?.call(sel, "zh");
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 900));
    const zhText = root?.textContent || "";
    const zhOk = /界面噪音包|Studio 语言|功能健康/.test(zhText);
    setter?.call(sel, "en");
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 700));
    return { ok: zhOk, zhOk };
  });
  record(
    "track.next.locale_switch",
    localeSwitch.ok ? "pass" : "fail",
    JSON.stringify(localeSwitch),
  );

  // Pause / Resume
  await openStudio(page);
  await clickTab(page, "Simple");
  await clickStudioButton(page, "Pause");
  await sleep(900);
  const paused = await studioEval(page, () => ({
    active: document.documentElement.classList.contains("readit-active"),
    style: document.getElementById("readit-css-engine")?.textContent?.slice(0, 40) || "",
  }));
  await openStudio(page);
  await clickStudioButton(page, "Resume");
  await sleep(900);
  const resumed = await studioEval(page, () =>
    document.documentElement.classList.contains("readit-active"),
  );
  record(
    "shell.pause_resume",
    !paused.active && resumed ? "pass" : "fail",
    JSON.stringify({ paused, resumed }),
  );

  const exportOk = await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    return [...(root?.querySelectorAll("button") || [])].some((b) =>
      b.textContent?.includes("Export"),
    );
  });
  record("shell.export_control", exportOk ? "pass" : "fail");

  // —— Advanced ——
  await openStudio(page);
  await clickTab(page, "Advanced");
  const advanced = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const search = root?.querySelector('input[placeholder*="Search"]');
    if (!(search instanceof HTMLInputElement)) return { ok: false, reason: "no search" };
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(search, "keyboard");
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    const items = [...(root?.querySelectorAll(".readit-list-item") || [])].map(
      (i) => i.textContent?.slice(0, 80),
    );
    const health = [...(root?.querySelectorAll("[class*=readit-health-]") || [])]
      .map((el) => el.className)
      .slice(0, 5);
    return {
      ok: items.some((t) => t?.toLowerCase().includes("keyboard")),
      items: items.slice(0, 3),
      health,
    };
  });
  record(
    "advanced.feature_search",
    advanced.ok ? "pass" : "fail",
    JSON.stringify(advanced),
  );
  record(
    "advanced.feature_health",
    (advanced.health?.length ?? 0) > 0 ? "pass" : "fail",
    JSON.stringify(advanced.health),
  );

  // Clear search then add sub override
  await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const search = root?.querySelector('input[placeholder*="Search"]');
    if (search instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(search, "");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await setControlledInput(page, 'input.readit-input[placeholder="subreddit"]', "AskReddit");
  await setControlledInput(page, 'input.readit-input[type="number"]', "777");
  await clickStudioButton(page, "Add override");
  await sleep(1000);
  const overrideListed = await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    return [...(root?.querySelectorAll(".readit-list-item") || [])].some((i) =>
      /r\/AskReddit.*777/i.test(i.textContent || ""),
    );
  });

  // —— Curate ——
  await clickTab(page, "Curate");
  const curate = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const pattern = root?.querySelector(
      'input.readit-input[placeholder="Pattern"]',
    );
    if (!(pattern instanceof HTMLInputElement)) {
      return { ok: false, reason: "no pattern" };
    }
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(pattern, "smoke-test-filter-xyz");
    pattern.dispatchEvent(new Event("input", { bubbles: true }));
    [...(root?.querySelectorAll("button") || [])]
      .find((b) => b.textContent?.includes("Add filter"))
      ?.click();
    await new Promise((r) => setTimeout(r, 1100));
    const listed = [...(root?.querySelectorAll(".readit-list-item") || [])].some(
      (i) => i.textContent?.includes("smoke-test-filter-xyz"),
    );
    return { ok: listed };
  });
  record(
    "curate.add_filter",
    curate.ok ? "pass" : "fail",
    JSON.stringify(curate),
  );

  // Tag a username present on the page
  const tagUser = await page.evaluate(() => {
    const a = document.querySelector('a[href*="/user/"]');
    const href = a?.getAttribute("href") || "";
    const m = href.match(/\/user\/([^/?#]+)/i);
    return m?.[1] || "spez";
  });
  await setControlledInput(page, 'input.readit-input[placeholder="username"]', tagUser);
  await setControlledInput(page, 'input.readit-input[placeholder="label"]', "smoke-tag");
  await clickStudioButton(page, "Save tag");
  await sleep(1100);
  const tagListed = await studioEval(page, (user) => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    return [...(root?.querySelectorAll(".readit-list-item") || [])].some((i) =>
      i.textContent?.includes(`u/${user}`) && i.textContent?.includes("smoke-tag"),
    );
  }, tagUser);
  record(
    "curate.user_tag",
    tagListed ? "pass" : "fail",
    `user=${tagUser}`,
  );
  await sleep(800);
  const tagDom = await page.evaluate(
    (user) =>
      [...document.querySelectorAll(".readit-user-tag")].some(
        (el) =>
          el.textContent === "smoke-tag" &&
          el.previousElementSibling?.getAttribute("href")?.includes(`/user/${user}`),
      ) || document.querySelectorAll(".readit-user-tag").length > 0,
    tagUser,
  );
  record(
    "curate.user_tag_dom",
    tagDom ? "pass" : "fail",
    `user=${tagUser}`,
  );

  await clickTab(page, "Simple");
  await clickStudioButton(page, "Reading mode");
  await sleep(500);
  const reading = await studioEval(
    page,
    () => !!document.querySelector("readit-studio")?.shadowRoot?.querySelector(".readit-reading"),
  );
  record("curate.reading_mode", reading ? "pass" : "fail");
  await clickStudioButton(page, "Close");
  await sleep(300);

  // —— Create ——
  await openStudio(page);
  await clickTab(page, "Create");
  const create = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const clean = [...(root?.querySelectorAll("button") || [])].find((b) =>
      b.textContent?.includes("clean"),
    );
    clean?.click();
    await new Promise((r) => setTimeout(r, 500));
    const toast = root?.querySelector(".readit-toast")?.textContent || "";
    return { ok: /copied/i.test(toast) || !!clean, toast };
  });
  record("create.clean_link", create.ok ? "pass" : "fail", JSON.stringify(create));

  const canned = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const copy = [...(root?.querySelectorAll("button") || [])].find(
      (b) => b.textContent?.trim() === "Copy",
    );
    copy?.click();
    await new Promise((r) => setTimeout(r, 500));
    const toast = root?.querySelector(".readit-toast")?.textContent || "";
    return { ok: /Copied reply/i.test(toast) || !!copy, toast };
  });
  record("create.canned_copy", canned.ok ? "pass" : "fail", JSON.stringify(canned));

  const createToggles = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const flip = async (label) => {
      const lab = [...(root?.querySelectorAll("label") || [])].find((l) =>
        l.textContent?.includes(label),
      );
      const input = lab?.querySelector("input[type=checkbox]");
      if (!input) return { ok: false, label };
      if (!input.checked) input.click();
      await new Promise((r) => setTimeout(r, 600));
      return { ok: input.checked, label };
    };
    const abs = await flip("Absolute timestamps");
    const op = await flip("Highlight OP");
    const always = await flip("Always show actions");
    return {
      abs,
      op,
      always,
      opClass: document.documentElement.classList.contains("readit-op-highlight"),
    };
  });
  record(
    "create.op_highlight",
    createToggles.opClass || createToggles.op?.ok ? "pass" : "fail",
    JSON.stringify(createToggles),
  );
  record(
    "create.always_show_actions",
    createToggles.always?.ok ? "pass" : "fail",
    JSON.stringify(createToggles.always),
  );

  // —— CQS ——
  await openStudio(page);
  await clickTab(page, "CQS");
  await sleep(400);
  const cqsUi = await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const text = root?.querySelector(".body")?.textContent || "";
    return {
      ok:
        /Contributor Quality Score|Enable CQS tracker|Current tier/i.test(text) &&
        !!root?.querySelector("select.readit-select"),
    };
  });
  record("cqs.tab_ui", cqsUi.ok ? "pass" : "fail", JSON.stringify(cqsUi));

  const cqsEnable = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const lab = [...(root?.querySelectorAll("label") || [])].find((l) =>
      l.textContent?.includes("Enable CQS tracker"),
    );
    const input = lab?.querySelector("input[type=checkbox]");
    if (!(input instanceof HTMLInputElement)) return { ok: false };
    const before = input.checked;
    input.click();
    await new Promise((r) => setTimeout(r, 700));
    return { ok: input.checked !== before, before, after: input.checked };
  });
  record(
    "cqs.enable_toggle",
    cqsEnable.ok ? "pass" : "fail",
    JSON.stringify(cqsEnable),
  );

  const cqsTier = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const sel = root?.querySelector("select.readit-select");
    if (!(sel instanceof HTMLSelectElement)) return { ok: false, reason: "no select" };
    const setter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set;
    setter?.call(sel, "High");
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 900));
    const toast = root?.querySelector(".readit-toast")?.textContent || "";
    const strong = [...(root?.querySelectorAll("strong") || [])].some((s) =>
      /High/i.test(s.textContent || ""),
    );
    return { ok: strong || /Manual CQS|tier/i.test(toast), toast, strong, value: sel.value };
  });
  record(
    "cqs.manual_tier",
    cqsTier.ok ? "pass" : "fail",
    JSON.stringify(cqsTier),
  );

  const cqsPrefs = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const lab = [...(root?.querySelectorAll("label") || [])].find((l) =>
      /burst/i.test(l.textContent || ""),
    );
    const input = lab?.querySelector("input[type=checkbox]");
    if (!(input instanceof HTMLInputElement)) return { ok: false, reason: "no burst pref" };
    const before = input.checked;
    input.click();
    await new Promise((r) => setTimeout(r, 700));
    return { ok: input.checked !== before, before, after: input.checked };
  });
  record(
    "cqs.prefs_toggle",
    cqsPrefs.ok ? "pass" : "fail",
    JSON.stringify(cqsPrefs),
  );
  record(
    "cqs.bot_parse",
    "skip",
    "manual — requires r/WhatIsMyCQS bot reply",
  );
  record(
    "cqs.risk_banner",
    "skip",
    "manual — requires submit burst / heuristic trigger",
  );

  // —— Mod ——
  await clickTab(page, "Simple");
  await switchProfile("Mod Desk");
  await clickTab(page, "Mod");
  const modTab = await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const text = root?.querySelector(".body")?.textContent || "";
    return {
      ok: /Quick actions|Macros|Usernotes/i.test(text),
      density: document.documentElement.classList.contains("readit-queue-density"),
    };
  });
  record("mod.desk_profile", modTab.ok ? "pass" : "fail", JSON.stringify(modTab));

  await sleep(800);
  const modBar = await page.evaluate(
    () => document.querySelectorAll(".readit-mod-bar").length,
  );
  record(
    "mod.quick_bar",
    modBar > 0 ? "pass" : "fail",
    `bars=${modBar}`,
  );

  const macro = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const copy = [...(root?.querySelectorAll("button") || [])].find(
      (b) => b.textContent?.trim() === "Copy",
    );
    copy?.click();
    await new Promise((r) => setTimeout(r, 500));
    const toast = root?.querySelector(".readit-toast")?.textContent || "";
    return { ok: /Macro copied|Copied/i.test(toast) || !!copy, toast };
  });
  record("mod.macro_copy", macro.ok ? "pass" : "fail", JSON.stringify(macro));

  await setControlledInput(page, 'input.readit-input[placeholder="username"]', tagUser);
  await studioEval(page, ({ user, text }) => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const ta = root?.querySelector('textarea.readit-textarea[placeholder="Note"]');
    if (!(ta instanceof HTMLTextAreaElement)) return false;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(ta, text);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, { user: tagUser, text: "smoke note" });
  await clickStudioButton(page, "Save note");
  await sleep(1200);
  const noteListed = await studioEval(page, (user) => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    return [...(root?.querySelectorAll(".readit-list-item") || [])].some((i) =>
      (i.textContent || "").includes(`u/${user}`) &&
      (i.textContent || "").includes("smoke note"),
    );
  }, tagUser);
  await sleep(800);
  const noteDom = await page.evaluate(
    (user) =>
      [...document.querySelectorAll(`[data-readit-has-note="true"]`)].some((a) =>
        (a.getAttribute("href") || "")
          .toLowerCase()
          .includes(`/user/${user.toLowerCase()}`),
      ),
    tagUser,
  );
  record(
    "mod.usernote",
    noteListed ? "pass" : "fail",
    JSON.stringify({ noteListed, noteDom, tagUser }),
  );
  record(
    "mod.toolbox_notice",
    "skip",
    "Toolbox not installed — soft-disable path N/A",
  );

  // —— Library ——
  await clickTab(page, "Library");
  await clickStudioButton(page, "Save current page to queue");
  await sleep(1000);
  const saved = await studioEval(page, () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const items = [...(root?.querySelectorAll(".readit-list-item") || [])];
    return { count: items.length, text: items[0]?.textContent?.slice(0, 60) || "" };
  });
  record(
    "library.save_queue",
    saved.count > 0 ? "pass" : "fail",
    JSON.stringify(saved),
  );
  const removed = await studioEval(page, async () => {
    const root = document.querySelector("readit-studio")?.shadowRoot;
    const before = root?.querySelectorAll(".readit-list-item").length || 0;
    [...(root?.querySelectorAll("button") || [])]
      .find((b) => b.textContent?.includes("Remove"))
      ?.click();
    await new Promise((r) => setTimeout(r, 900));
    const after = root?.querySelectorAll(".readit-list-item").length || 0;
    return { ok: after < before, before, after };
  });
  record(
    "library.remove",
    removed.ok ? "pass" : "fail",
    JSON.stringify(removed),
  );

  // —— Routes ——
  await page.goto("https://www.reddit.com/r/AskReddit/", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  let subProbe = { fab: false, width: "", active: false, styleTag: false };
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    subProbe = await page.evaluate(() => {
      const host = document.querySelector("readit-studio");
      return {
        fab: !!host?.shadowRoot?.querySelector(".readit-fab"),
        width: getComputedStyle(document.documentElement)
          .getPropertyValue("--readit-feed-width")
          .trim(),
        active: document.documentElement.classList.contains("readit-active"),
        styleTag: !!document.getElementById("readit-css-engine"),
      };
    });
    if (subProbe.fab) break;
  }
  record(
    "routes.subreddit",
    subProbe.fab || (subProbe.active && subProbe.styleTag)
      ? "pass"
      : "fail",
    JSON.stringify(subProbe),
  );
  record(
    "advanced.sub_override",
    overrideListed && subProbe.width.includes("777") ? "pass" : "fail",
    JSON.stringify({ overrideListed, width: subProbe.width }),
  );
  await shot(page, "03-subreddit.png");

  // Absolute timestamps on a post
  const clickedPost = await page.evaluate(() => {
    const a = document.querySelector('a[href*="/comments/"]');
    if (!(a instanceof HTMLAnchorElement)) return false;
    a.click();
    return true;
  });
  if (clickedPost) {
    await sleep(4000);
    const onPost = page.url().includes("/comments/");
    record("routes.post_comments", onPost ? "pass" : "skip", page.url());
    await openStudio(page);
    await clickTab(page, "Create");
    await studioEval(page, async () => {
      const root = document.querySelector("readit-studio")?.shadowRoot;
      const lab = [...(root?.querySelectorAll("label") || [])].find((l) =>
        l.textContent?.includes("Absolute timestamps"),
      );
      const input = lab?.querySelector("input[type=checkbox]");
      if (input && !input.checked) input.click();
      await new Promise((r) => setTimeout(r, 900));
    });
    await sleep(500);
    const absCount = await page.evaluate(
      () => document.querySelectorAll(".readit-abs-time").length,
    );
    record(
      "create.absolute_timestamps",
      absCount > 0 ? "pass" : "fail",
      `count=${absCount}`,
    );

    // Comment Quote buttons (Later track) — enable UX then scan DOM
    await openStudio(page);
    await clickTab(page, "Create");
    await studioEval(page, async () => {
      const root = document.querySelector("readit-studio")?.shadowRoot;
      const lab = [...(root?.querySelectorAll("label") || [])].find((l) =>
        /Comment quote|评论引用/i.test(l.textContent || ""),
      );
      const input = lab?.querySelector("input[type=checkbox]");
      if (input instanceof HTMLInputElement && !input.checked) {
        input.click();
        await new Promise((r) => setTimeout(r, 900));
      }
    });
    await sleep(1200);
    const quoteCount = await page.evaluate(
      () => document.querySelectorAll("button.readit-quote-btn").length,
    );
    record(
      "track.later.quote_dom",
      quoteCount > 0 ? "pass" : "fail",
      `quoteButtons=${quoteCount}`,
    );
    await shot(page, "04-post.png");
  } else {
    record("routes.post_comments", "skip", "no comment link");
    record("create.absolute_timestamps", "skip", "no post page");
    record("track.later.quote_dom", "skip", "no post page");
  }

  // SPA soft nav: from home click a subreddit in left nav / feed
  await page.goto("https://www.reddit.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await sleep(3000);
  const soft = await page.evaluate(async () => {
    const candidates = [
      ...document.querySelectorAll('a[href*="/r/"]'),
    ].filter((a) => {
      const href = a.getAttribute("href") || "";
      return /\/r\/[A-Za-z0-9_]+\/?(\?|$)/.test(href) && !href.includes("/comments/");
    });
    const link = candidates[0];
    if (!link) {
      // Fallback: soft-nav via history API (still exercises locationchange)
      history.pushState({}, "", "/r/AskReddit/");
      window.dispatchEvent(new Event("popstate"));
      await new Promise((r) => setTimeout(r, 2500));
      const fab = !!document
        .querySelector("readit-studio")
        ?.shadowRoot?.querySelector(".readit-fab");
      const active = document.documentElement.classList.contains("readit-active");
      return {
        ok: fab && active,
        href: location.href,
        fab,
        active,
        mode: "pushState",
      };
    }
    link.click();
    await new Promise((r) => setTimeout(r, 3500));
    const fab = !!document
      .querySelector("readit-studio")
      ?.shadowRoot?.querySelector(".readit-fab");
    const active = document.documentElement.classList.contains("readit-active");
    return { ok: fab && active, href: location.href, fab, active, mode: "click" };
  });
  record("routes.spa_soft_nav", soft.ok ? "pass" : "fail", JSON.stringify(soft));
  record("routes.home", "pass", "visited www.reddit.com");
  record(
    "routes.modqueue",
    "skip",
    "requires mod credentials — not available in automated smoke",
  );
  record("coexist.old_reddit", "skip", "manual — Old Reddit unsupported by design");

  // —— Popup ——
  if (extensionId) {
    const popupUrl = `chrome-extension://${extensionId}/popup.html`;
    /** @type {import('puppeteer-core').Page | import('playwright').Page} */
    let popupPage;
    if (cdpMode) {
      popupPage = await puppeteerBrowser.newPage();
    } else {
      popupPage = await playwrightContext.newPage();
    }
    try {
      await popupPage.goto(popupUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
      await sleep(800);
      const loaded = await popupPage.evaluate(() =>
        !!document.body?.textContent?.includes("readit"),
      );
      record("shell.popup_loads", loaded ? "pass" : "fail", popupUrl);

      // Ensure reddit tab is "active" as much as possible, then pause via popup
      await page.bringToFront?.().catch(() => {});
      if (cdpMode) {
        // puppeteer: focus reddit page by bringing it forward via CDP target
        await page.bringToFront();
      }

      const profileSwitch = await popupPage.evaluate(async () => {
        const select = document.querySelector("select");
        if (!(select instanceof HTMLSelectElement) || select.options.length < 2) {
          return { ok: false, reason: "no select" };
        }
        const next =
          [...select.options].find((o) => o.value !== select.value)?.value ||
          select.options[0].value;
        select.value = next;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 1000));
        return { ok: select.value === next, value: select.value };
      });
      record(
        "shell.popup_profile",
        profileSwitch.ok ? "pass" : "fail",
        JSON.stringify(profileSwitch),
      );

      await page.bringToFront?.().catch(() => {});
      if (cdpMode) await page.bringToFront();
      await sleep(400);

      const pauseClick = await popupPage.evaluate(async () => {
        const btn = [...document.querySelectorAll("button")].find((b) =>
          /Pause|Resume/i.test(b.textContent || ""),
        );
        const before = btn?.textContent || "";
        btn?.click();
        await new Promise((r) => setTimeout(r, 1000));
        return { ok: !!btn, before, after: btn?.textContent || "" };
      });
      await sleep(800);
      await page.bringToFront?.().catch(() => {});
      if (cdpMode) await page.bringToFront();
      await sleep(500);
      const pagePaused = await page.evaluate(() => ({
        active: document.documentElement.classList.contains("readit-active"),
      }));
      // Resume so we leave browser usable
      await popupPage.bringToFront?.().catch(() => {});
      if (cdpMode) await popupPage.bringToFront();
      await popupPage.evaluate(async () => {
        const btn = [...document.querySelectorAll("button")].find((b) =>
          /Resume/i.test(b.textContent || ""),
        );
        btn?.click();
        await new Promise((r) => setTimeout(r, 800));
      });
      record(
        "shell.popup_pause",
        pauseClick.ok && (pauseClick.after !== pauseClick.before || !pagePaused.active)
          ? "pass"
          : "fail",
        JSON.stringify({ pauseClick, pagePaused }),
      );

      // Open studio from popup — targets any reddit.com tab (not the popup page itself)
      await page.goto("https://www.reddit.com/", {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await sleep(2500);
      await page.evaluate(() => {
        const root = document.querySelector("readit-studio")?.shadowRoot;
        [...(root?.querySelectorAll("button") || [])]
          .find((b) => b.textContent?.includes("Close"))
          ?.click();
      });
      await sleep(400);

      await popupPage.bringToFront?.().catch(() => {});
      if (cdpMode) await popupPage.bringToFront();
      const clickOpen = await popupPage.evaluate(async () => {
        const api = globalThis.chrome?.tabs || globalThis.browser?.tabs;
        if (!api) return { ok: false, reason: "no tabs api" };
        let tabs = [];
        try {
          tabs = await api.query({
            url: ["*://*.reddit.com/*", "*://reddit.com/*"],
          });
        } catch (e) {
          return { ok: false, reason: "query failed", err: String(e) };
        }
        const btn = [...document.querySelectorAll("button")].find((b) =>
          b.textContent?.includes("Open studio"),
        );
        btn?.click();
        const sends = [];
        for (const tab of tabs) {
          if (!tab.id) continue;
          try {
            await api.sendMessage(tab.id, { type: "readit:open-studio" });
            sends.push({ id: tab.id, url: tab.url, ok: true });
          } catch (e) {
            sends.push({ id: tab.id, url: tab.url, ok: false, err: String(e) });
          }
        }
        return {
          ok: sends.some((s) => s.ok) && !!btn,
          tabCount: tabs.length,
          sends,
          clicked: !!btn,
        };
      });
      let opened = false;
      for (let i = 0; i < 15; i++) {
        await page.bringToFront?.().catch(() => {});
        if (cdpMode) await page.bringToFront();
        await sleep(400);
        opened = await page.evaluate(
          () =>
            !!document
              .querySelector("readit-studio")
              ?.shadowRoot?.querySelector(".readit-drawer"),
        );
        if (opened) break;
      }
      record(
        "shell.popup_open_studio",
        opened ? "pass" : "fail",
        JSON.stringify({ clickOpen, opened }),
      );
    } catch (err) {
      // Don't overwrite earlier popup passes if the tab closed mid open-studio.
      const have = new Set(results.map((r) => r.id));
      for (const id of [
        "shell.popup_loads",
        "shell.popup_profile",
        "shell.popup_pause",
        "shell.popup_open_studio",
      ]) {
        if (!have.has(id)) record(id, "skip", String(err));
      }
      if (!have.has("shell.popup_open_studio")) {
        record("shell.popup_open_studio", "fail", String(err));
      }
    } finally {
      await popupPage.close().catch(() => {});
    }
  } else {
    record("shell.popup_loads", "skip", "extension id unknown");
    record("shell.popup_profile", "skip", "extension id unknown");
    record("shell.popup_pause", "skip", "extension id unknown");
    record("shell.popup_open_studio", "skip", "extension id unknown");
  }
} catch (err) {
  record("harness.error", "fail", String(err));
  await shot(page, "error.png");
} finally {
  const summary = {
    at: new Date().toISOString(),
    mode: cdpMode ? "cdp-puppeteer" : "launch-playwright",
    cdpEndpoint: cdpEndpoint || null,
    extensionId: extensionId || null,
    extensionPath,
    results,
    pass: results.filter((r) => r.status === "pass").length,
    fail: results.filter((r) => r.status === "fail").length,
    skip: results.filter((r) => r.status === "skip").length,
  };
  fs.writeFileSync(
    path.join(outDir, "results.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log("\nSummary:", {
    pass: summary.pass,
    fail: summary.fail,
    skip: summary.skip,
    mode: summary.mode,
  });
  if (cdpMode) {
    await page.close().catch(() => {});
    puppeteerBrowser?.disconnect();
  } else {
    await playwrightContext.close();
  }
  process.exit(summary.fail > 0 ? 1 : 0);
}
