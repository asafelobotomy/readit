import type {
  FeatureHealth,
  LayoutColumnPanel,
  LayoutSeparator,
  LayoutSlotId,
  LayoutSlotsConfig,
  LayoutZone,
  ReaditSettings,
} from "@readit/schema";
import {
  applyLayoutPreset,
  budgetColumnOrder,
  buildLayoutTracks,
  clampColumnGap,
  clampPagePad,
  clampPanelWidth,
  clampSeparatorWidth,
  clampChromeHeight,
  createId,
  fitLayoutWidths,
  isStackedPair,
  MAX_LAYOUT_SEPARATORS,
  mirrorStackedWidths,
  movePanelToIndex,
  insertPanelAtIndex,
  normalizeColumnOrder,
  placementsFromColumnOrder,
  presetToColumnOrder,
  presetToPlacements,
  resizePadInBudget,
  resizePanelInBudget,
  resolveGridTemplateColumns,
  swapColumnPanels,
  widthLockSet,
  type FitLayoutMode,
  type LayoutWidthBudget,
} from "@readit/schema";
import type { FeatureModule } from "./utils.js";
import {
  mountNavRail,
  NAV_COMPACT_MAX_PX,
  navRailNeedsRemount,
  unmountNavRail,
} from "./nav-rail.js";

export type SlotDefinition = {
  id: LayoutSlotId;
  label: string;
  selectors: string[];
};

/** Stable New Reddit chrome landmarks (not feed posts). */
export const LAYOUT_SLOTS: readonly SlotDefinition[] = [
  {
    id: "topNav",
    label: "Top nav",
    selectors: [
      "reddit-header-large",
      "reddit-header",
      "#reddit-header",
      "header[role='banner']",
      "shreddit-app header",
    ],
  },
  {
    id: "leftNav",
    label: "Left nav",
    selectors: [
      "#left-sidebar-container",
      "#left-sidebar",
      "reddit-sidebar-nav",
      "#flex-left-nav-container",
    ],
  },
  {
    id: "main",
    label: "Main feed",
    selectors: ["#main-content", "main.main", "main"],
  },
  {
    id: "rightRail",
    label: "Right rail",
    selectors: [
      "#right-sidebar-container",
      "[data-testid='frontpage-sidebar']",
      "[data-testid='subreddit-sidebar']",
    ],
  },
  {
    id: "subHeader",
    label: "Subreddit header",
    selectors: ["shreddit-subreddit-header"],
  },
  {
    id: "bottomChrome",
    label: "Bottom chrome",
    selectors: [
      "#readit-bottom-chrome-host",
      "[data-testid='bottom-nav']",
    ],
  },
] as const;

export type ResolvedSlot = {
  id: LayoutSlotId;
  label: string;
  el: Element | null;
  health: FeatureHealth;
};

export const COLUMN_PANEL_LABELS: Record<LayoutColumnPanel, string> = {
  leftNav: "Nav",
  main: "Feed",
  rightRail: "Rail",
};

export { applyLayoutPreset, presetToColumnOrder, presetToPlacements };

export function resolveSlots(doc: ParentNode = document): ResolvedSlot[] {
  return LAYOUT_SLOTS.map((def) => {
    let el: Element | null = null;
    for (const sel of def.selectors) {
      try {
        el = doc.querySelector(sel);
      } catch {
        el = null;
      }
      if (el) break;
    }
    return {
      id: def.id,
      label: def.label,
      el,
      health: el ? "ok" : "degraded",
    };
  });
}

export function stampLayoutSlots(doc: Document = document): ResolvedSlot[] {
  const resolved = resolveSlots(doc);
  for (const slot of resolved) {
    if (!slot.el) continue;
    slot.el.setAttribute("data-readit-slot", slot.id);
  }
  // Mark shell parent when both left + subgrid exist (display:contents flattens)
  const left = doc.querySelector('[data-readit-slot="leftNav"]');
  const subgrid = doc.querySelector("#subgrid-container");
  const parent = left?.parentElement;
  if (parent && subgrid && parent.contains(subgrid)) {
    parent.setAttribute("data-readit-layout-shell", "1");
  } else {
    const grid = doc.querySelector(".grid-container");
    if (grid) grid.setAttribute("data-readit-layout-shell", "1");
  }
  return resolved;
}

export function clearLayoutSlotMarks(doc: Document = document): void {
  doc
    .querySelectorAll("[data-readit-slot]")
    .forEach((el) => el.removeAttribute("data-readit-slot"));
  doc
    .querySelectorAll("[data-readit-layout-shell]")
    .forEach((el) => el.removeAttribute("data-readit-layout-shell"));
}

export function layoutSlotsHealth(resolved: ResolvedSlot[]): FeatureHealth {
  const critical = resolved.filter((s) => s.id === "leftNav" || s.id === "main");
  if (critical.every((s) => s.health === "degraded")) return "broken";
  if (resolved.some((s) => s.health === "degraded")) return "degraded";
  return "ok";
}

/** Apply a new column order (swap semantics already resolved by caller). */
export function applyColumnOrder(
  config: LayoutSlotsConfig,
  order: readonly LayoutColumnPanel[],
): LayoutSlotsConfig {
  const columnOrder = normalizeColumnOrder(order);
  return {
    ...config,
    preset: "custom",
    columnOrder,
    placements: placementsFromColumnOrder(columnOrder, config.placements),
  };
}

export function swapLayoutColumns(
  config: LayoutSlotsConfig,
  a: LayoutColumnPanel,
  b: LayoutColumnPanel,
): LayoutSlotsConfig {
  return applyColumnOrder(
    config,
    swapColumnPanels(config.columnOrder, a, b),
  );
}

export function moveLayoutPanelToIndex(
  config: LayoutSlotsConfig,
  panel: LayoutColumnPanel,
  targetIndex: number,
): LayoutSlotsConfig {
  return applyColumnOrder(
    config,
    movePanelToIndex(config.columnOrder, panel, targetIndex),
  );
}

export function setSlotZone(
  config: LayoutSlotsConfig,
  slot: LayoutSlotId,
  zone: LayoutZone,
): LayoutSlotsConfig {
  if (slot === "subHeader") {
    return {
      ...config,
      preset: "custom",
      placements: { ...config.placements, subHeader: zone },
    };
  }
  if (slot !== "leftNav" && slot !== "main" && slot !== "rightRail") {
    return config;
  }
  if (zone === "hidden") {
    return {
      ...config,
      preset: "custom",
      placements: { ...config.placements, [slot]: "hidden" },
    };
  }
  const targetIndex =
    zone === "left" || zone === "stackedLeft"
      ? 0
      : zone === "center"
        ? 1
        : 2;
  return moveLayoutPanelToIndex(config, slot, targetIndex);
}

/** Bridge Simple “Hide sidebars” → single-column placements. */
export function syncSidebarsHide(
  settings: ReaditSettings,
  hideSidebars: boolean,
): ReaditSettings {
  if (hideSidebars) {
    return {
      ...settings,
      knobs: {
        ...settings.knobs,
        hide: { ...settings.knobs.hide, sidebars: true },
      },
      layoutSlots: applyLayoutPreset(settings.layoutSlots, "singleColumn"),
      flags: { ...settings.flags, layoutSlots: true },
    };
  }
  if (settings.layoutSlots.preset === "singleColumn") {
    return {
      ...settings,
      knobs: {
        ...settings.knobs,
        hide: { ...settings.knobs.hide, sidebars: false },
      },
      layoutSlots: applyLayoutPreset(settings.layoutSlots, "classic"),
    };
  }
  return {
    ...settings,
    knobs: {
      ...settings.knobs,
      hide: { ...settings.knobs.hide, sidebars: false },
    },
  };
}

export type LayoutWidthsPersistDetail = {
  leftNavPx: number;
  rightRailPx: number;
  feedWidthPx: number;
  pagePadLeftPx: number;
  pagePadRightPx: number;
  columnGapPx?: number;
};

export type LayoutOrderPersistDetail = {
  columnOrder: LayoutColumnPanel[];
};

export type LayoutPadsPersistDetail = {
  pagePadLeftPx: number;
  pagePadRightPx: number;
};

const RESIZE_HOST_ID = "readit-col-resize-host";

type PagePadSide = "left" | "right";
type FrameKind = "panel" | "pad" | "separator" | "chrome";

type LiveWidths = LayoutWidthBudget;

function viewportBudgetPx(): number {
  return document.documentElement.clientWidth || window.innerWidth || 0;
}

function widthsFromSettings(settings: ReaditSettings): LiveWidths {
  const w = settings.layoutSlots.widths;
  return {
    leftNavPx: w.leftNavPx,
    rightRailPx: w.rightRailPx,
    feedWidthPx: settings.knobs.tokens.feedWidthPx,
    pagePadLeftPx: w.pagePadLeftPx ?? 24,
    pagePadRightPx: w.pagePadRightPx ?? 24,
    columnGapPx: w.columnGapPx ?? 12,
  };
}

function visibleColumnPanels(settings: ReaditSettings): LayoutColumnPanel[] {
  const order = normalizeColumnOrder(settings.layoutSlots.columnOrder);
  return order.filter((id) => settings.layoutSlots.placements[id] !== "hidden");
}

function panelWidthPx(panel: LayoutColumnPanel, live: LiveWidths): number {
  switch (panel) {
    case "leftNav":
      return live.leftNavPx;
    case "main":
      return live.feedWidthPx;
    case "rightRail":
      return live.rightRailPx;
    default: {
      const _exhaustive: never = panel;
      return _exhaustive;
    }
  }
}

let stackRailObserver: ResizeObserver | null = null;

/**
 * rightRail is positioned absolute in stacked mode (see css-engine's stacked
 * branch — a grid item spanning/sharing a track with much-taller `main`
 * would otherwise inflate that track and push rightRail far down). Its
 * offset below leftNav is therefore driven by leftNav's live rendered
 * height instead of CSS Grid row placement.
 */
function syncStackedRailOffset(): void {
  const nav = document.querySelector(
    '[data-readit-slot="leftNav"]',
  ) as HTMLElement | null;
  if (!nav) return;
  const gap =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--readit-column-gap",
      ),
    ) || 12;
  const height = nav.getBoundingClientRect().height;
  document.documentElement.style.setProperty(
    "--readit-stack-rail-top",
    `${Math.round(height + gap)}px`,
  );
  // Containing block is the stack grid area (definite grid-column) — keep
  // inset at 0. The var exists so CSS can opt into a synced offset later.
  document.documentElement.style.setProperty("--readit-stack-rail-left", "0px");
}

function ensureStackRailObserver(): void {
  if (stackRailObserver) {
    syncStackedRailOffset();
    return;
  }
  const nav = document.querySelector('[data-readit-slot="leftNav"]');
  if (!nav) return;
  stackRailObserver = new ResizeObserver(() => syncStackedRailOffset());
  stackRailObserver.observe(nav);
  syncStackedRailOffset();
}

function teardownStackRailObserver(): void {
  stackRailObserver?.disconnect();
  stackRailObserver = null;
  document.documentElement.style.removeProperty("--readit-stack-rail-top");
  document.documentElement.style.removeProperty("--readit-stack-rail-left");
}

function applyLiveColumnWidths(
  settings: ReaditSettings,
  live: LiveWidths,
): void {
  const root = document.documentElement;
  root.style.setProperty(
    "--readit-left-nav-width",
    `${clampPanelWidth("leftNav", live.leftNavPx)}px`,
  );
  root.style.setProperty(
    "--readit-right-rail-width",
    `${clampPanelWidth("rightRail", live.rightRailPx)}px`,
  );
  root.style.setProperty(
    "--readit-feed-width",
    `${clampPanelWidth("main", live.feedWidthPx)}px`,
  );
  root.style.setProperty("--readit-page-pad-left", `${clampPagePad(live.pagePadLeftPx)}px`);
  root.style.setProperty("--readit-page-pad-right", `${clampPagePad(live.pagePadRightPx)}px`);
  root.style.setProperty("--readit-column-gap", `${clampColumnGap(live.columnGapPx)}px`);
  applyChromeCssVars(settings);

  const shellReady =
    !!root.querySelector?.("[data-readit-layout-shell]") ||
    !!document.querySelector("[data-readit-layout-shell]");
  const leftReady = !!document.querySelector('[data-readit-slot="leftNav"]');
  if (!shellReady || !leftReady) {
    root.classList.add("readit-layout-pending");
    root.classList.remove("readit-nav-compact");
    root.style.removeProperty("--readit-grid-cols");
    return;
  }
  root.classList.remove("readit-layout-pending");

  root.classList.toggle("readit-nav-compact", live.leftNavPx <= NAV_COMPACT_MAX_PX);
  root.classList.toggle("readit-rail-compact", live.rightRailPx <= NAV_COMPACT_MAX_PX);
  if (live.leftNavPx <= NAV_COMPACT_MAX_PX) mountNavRail();
  else unmountNavRail();

  if (isStackedPair(settings.layoutSlots.placements)) {
    // Stacked mode's CSS references the width vars directly (see css-engine's
    // stacked branch) rather than a generic joined grid-template-columns list.
    // Still publish pad+content tracks so chrome/geometry share one builder.
    const stackedTracks = buildLayoutTracks(settings.layoutSlots);
    const tracks = resolveGridTemplateColumns(stackedTracks, live);
    if (tracks) root.style.setProperty("--readit-grid-cols", tracks);
    ensureStackRailObserver();
  } else {
    teardownStackRailObserver();
    const tracks = resolveGridTemplateColumns(
      buildLayoutTracks(settings.layoutSlots),
      live,
    );
    if (tracks) root.style.setProperty("--readit-grid-cols", tracks);
    syncSeparatorNodes(settings);
  }
  const shell = document.querySelector(
    "[data-readit-layout-shell]",
  ) as HTMLElement | null;
  if (!shell) return;
  shell.style.removeProperty("grid-template-columns");
  // Pads are grid tracks — keep shell padding at 0 so chrome offsets match.
  shell.style.paddingLeft = "0px";
  shell.style.paddingRight = "0px";
}

function applyChromeCssVars(settings: ReaditSettings): void {
  const root = document.documentElement;
  const chrome = settings.layoutSlots.chrome ?? {
    topNav: "top" as const,
    bottomChrome: "hidden" as const,
    topNavPx: 56,
    bottomChromePx: 0,
  };
  const topZone = chrome.topNav;
  const topPx = Math.max(0, Math.round(chrome.topNavPx ?? 56));
  const bottomPx = Math.max(0, Math.round(chrome.bottomChromePx ?? 0));

  if (topZone === "bottom") {
    root.style.setProperty("--readit-chrome-top", "0px");
    root.style.setProperty(
      "--readit-chrome-bottom",
      `${topPx || bottomPx || 56}px`,
    );
    root.dataset.readitChromeTop = "bottom";
  } else if (topZone === "hidden") {
    root.style.setProperty("--readit-chrome-top", "0px");
    root.style.setProperty(
      "--readit-chrome-bottom",
      `${chrome.bottomChrome === "bottom" ? bottomPx : 0}px`,
    );
    root.dataset.readitChromeTop = "hidden";
  } else {
    root.style.setProperty("--readit-chrome-top", `${topPx}px`);
    root.style.setProperty(
      "--readit-chrome-bottom",
      `${chrome.bottomChrome === "bottom" ? bottomPx : 0}px`,
    );
    root.dataset.readitChromeTop = "top";
  }
  root.dataset.readitChromeBottom = chrome.bottomChrome;
}

export function setChromeTopNavZone(
  config: LayoutSlotsConfig,
  zone: "top" | "bottom" | "hidden",
): LayoutSlotsConfig {
  return {
    ...config,
    chrome: {
      ...(config.chrome ?? {
        topNav: "top",
        bottomChrome: "hidden",
        topNavPx: 56,
        bottomChromePx: 0,
      }),
      topNav: zone,
    },
  };
}

export function setChromeTopNavHeight(
  config: LayoutSlotsConfig,
  heightPx: number,
): LayoutSlotsConfig {
  return {
    ...config,
    chrome: {
      ...(config.chrome ?? {
        topNav: "top",
        bottomChrome: "hidden",
        topNavPx: 56,
        bottomChromePx: 0,
      }),
      topNavPx: clampChromeHeight("topNav", heightPx),
    },
  };
}

export function separatorExtraPx(settings: ReaditSettings): number {
  return (settings.layoutSlots.separators || []).reduce(
    (sum, s) => sum + clampSeparatorWidth(s.widthPx),
    0,
  );
}

export function separatorTrackCount(settings: ReaditSettings): number {
  return Math.min(
    MAX_LAYOUT_SEPARATORS,
    (settings.layoutSlots.separators || []).length,
  );
}

/** Fit current settings to the viewport and paint CSS vars / shell tracks. */
export function applyFittedShellWidths(
  settings: ReaditSettings,
  mode: FitLayoutMode = "overflow",
): LiveWidths {
  const placements = settings.layoutSlots.placements;
  const locked = widthLockSet(settings.layoutSlots.widthLocks);
  const fitted = mirrorStackedWidths(
    fitLayoutWidths(
      mirrorStackedWidths(widthsFromSettings(settings), placements),
      budgetColumnOrder(visibleColumnPanels(settings), placements),
      viewportBudgetPx(),
      separatorExtraPx(settings),
      locked,
      mode,
      separatorTrackCount(settings),
    ),
    placements,
  );
  applyLiveColumnWidths(settings, fitted);
  return fitted;
}

function syncSeparatorNodes(settings: ReaditSettings): void {
  const shell = document.querySelector(
    "[data-readit-layout-shell]",
  ) as HTMLElement | null;
  if (!shell) return;
  const wanted = new Set(
    (settings.layoutSlots.separators || []).map((s) => s.id),
  );
  for (const el of [
    ...shell.querySelectorAll("[data-readit-separator]"),
  ]) {
    const id = el.getAttribute("data-readit-separator");
    if (!id || !wanted.has(id)) el.remove();
  }
  for (const sep of settings.layoutSlots.separators || []) {
    let node = shell.querySelector(
      `[data-readit-separator="${CSS.escape(sep.id)}"]`,
    ) as HTMLElement | null;
    if (!node) {
      node = document.createElement("div");
      node.setAttribute("data-readit-separator", sep.id);
      node.setAttribute("aria-hidden", "true");
      shell.appendChild(node);
    }
  }
}

function clearLiveColumnOverrides(): void {
  const root = document.documentElement;
  root.style.removeProperty("--readit-grid-cols");
  root.classList.remove(
    "readit-nav-compact",
    "readit-rail-compact",
    "readit-layout-pending",
  );
  unmountNavRail();
  const shell = document.querySelector(
    "[data-readit-layout-shell]",
  ) as HTMLElement | null;
  if (!shell) return;
  shell.style.removeProperty("grid-template-columns");
  shell.style.removeProperty("padding-left");
  shell.style.removeProperty("padding-right");
}

/** True when left+main+shell are stamped and ready for compact/grid chrome. */
function layoutChromeReady(resolved: ResolvedSlot[]): boolean {
  const left = resolved.find((s) => s.id === "leftNav")?.el;
  const main = resolved.find((s) => s.id === "main")?.el;
  const shell = document.querySelector("[data-readit-layout-shell]");
  return !!(left && main && shell);
}

let layoutRecoveryObserver: MutationObserver | null = null;
let layoutRecoveryTimer = 0;
let layoutRecoveryPollTimer = 0;
let layoutRecoverySettings: ReaditSettings | null = null;

/** Drop compact/grid chrome immediately when stamps are gone (SPA mid-flight). */
function softSuspendLayoutChromeIfNeeded(): boolean {
  const leftStamped = !!document.querySelector('[data-readit-slot="leftNav"]');
  const shell = !!document.querySelector("[data-readit-layout-shell]");
  if (leftStamped && shell) {
    document.documentElement.classList.remove("readit-layout-pending");
    return false;
  }
  const root = document.documentElement;
  root.classList.add("readit-layout-pending");
  root.classList.remove("readit-nav-compact");
  root.style.removeProperty("--readit-grid-cols");
  return true;
}

function chromeStampMissing(): boolean {
  return !document.querySelector('[data-readit-slot="topNav"]');
}

function scheduleLayoutRecovery(settings: ReaditSettings, delayMs = 50): void {
  layoutRecoverySettings = settings;
  window.clearTimeout(layoutRecoveryTimer);
  layoutRecoveryTimer = window.setTimeout(() => {
    if (!layoutRecoverySettings) return;
    recoverLayoutChrome(layoutRecoverySettings);
  }, delayMs);
}

function recoverLayoutChrome(settings: ReaditSettings): void {
  if (!settings.flags.layoutSlots || settings.paused) return;
  if (softSuspendLayoutChromeIfNeeded()) {
    // Keep trying to restamp while pending.
    scheduleLayoutRecovery(settings, 120);
  }
  const resolved = stampLayoutSlots();
  applyChromeCssVars(settings);
  // Header nodes are often replaced by Reddit without tearing down columns —
  // keep polling until topNav is stamped again.
  if (chromeStampMissing()) {
    scheduleLayoutRecovery(settings, 400);
  }
  const ready = layoutChromeReady(resolved);
  const root = document.documentElement;
  root.classList.toggle("readit-layout-pending", !ready);
  root.classList.toggle(
    "readit-layout-degraded",
    layoutSlotsHealth(resolved) === "degraded" ||
      layoutSlotsHealth(resolved) === "broken",
  );

  if (!ready) {
    root.style.removeProperty("--readit-grid-cols");
    root.classList.remove("readit-nav-compact");
    return;
  }

  syncLiveWidthsFromSettings(settings);
  if (settings.layoutSlots.widths.leftNavPx <= NAV_COMPACT_MAX_PX) {
    root.classList.add("readit-nav-compact");
    mountNavRail();
  } else if (navRailNeedsRemount()) {
    mountNavRail();
  }
}

function startLayoutRecoveryPoll(settings: ReaditSettings, ms = 2500): void {
  layoutRecoverySettings = settings;
  // apply() re-runs on every DOM-mutation scan while layoutSlots is enabled,
  // which during any feed churn would otherwise restart this interval's
  // window continuously and keep it polling forever. Let an in-flight poll's
  // window run out — the settings snapshot above still stays fresh.
  if (layoutRecoveryPollTimer) return;
  const started = Date.now();
  layoutRecoveryPollTimer = window.setInterval(() => {
    if (!layoutRecoverySettings) {
      window.clearInterval(layoutRecoveryPollTimer);
      layoutRecoveryPollTimer = 0;
      return;
    }
    recoverLayoutChrome(layoutRecoverySettings);
    // Always run the full window — Reddit often replaces a healthy shell
    // shortly after first paint during SPA / route transitions.
    if (Date.now() - started > ms) {
      window.clearInterval(layoutRecoveryPollTimer);
      layoutRecoveryPollTimer = 0;
    }
  }, 80);
}

function mountLayoutRecoveryObserver(settings: ReaditSettings): void {
  layoutRecoverySettings = settings;
  if (layoutRecoveryObserver) return;
  layoutRecoveryObserver = new MutationObserver(() => {
    if (!layoutRecoverySettings) return;
    // Sync suspend first to avoid a malformed compact frame without a rail.
    if (softSuspendLayoutChromeIfNeeded()) {
      scheduleLayoutRecovery(layoutRecoverySettings, 30);
      return;
    }
    if (
      layoutRecoverySettings.layoutSlots.widths.leftNavPx <= NAV_COMPACT_MAX_PX &&
      navRailNeedsRemount()
    ) {
      scheduleLayoutRecovery(layoutRecoverySettings, 30);
      return;
    }
    if (chromeStampMissing()) {
      scheduleLayoutRecovery(layoutRecoverySettings, 30);
      return;
    }
    // Host may have been replaced with a new stamped-less node.
    const left = document.querySelector("#left-sidebar-container");
    if (left && !left.hasAttribute("data-readit-slot")) {
      scheduleLayoutRecovery(layoutRecoverySettings, 30);
    }
  });
  layoutRecoveryObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function teardownLayoutRecoveryObserver(): void {
  layoutRecoveryObserver?.disconnect();
  layoutRecoveryObserver = null;
  window.clearTimeout(layoutRecoveryTimer);
  window.clearInterval(layoutRecoveryPollTimer);
  layoutRecoveryTimer = 0;
  layoutRecoveryPollTimer = 0;
  layoutRecoverySettings = null;
  document.documentElement.classList.remove("readit-layout-pending");
}

function ensureResizeHost(): HTMLElement {
  let host = document.getElementById(RESIZE_HOST_ID) as HTMLElement | null;
  if (!host) {
    host = document.createElement("div");
    host.id = RESIZE_HOST_ID;
    host.setAttribute("data-readit-resize-host", "1");
    document.documentElement.appendChild(host);
  }
  return host;
}

function removeResizeHost(): void {
  document.getElementById(RESIZE_HOST_ID)?.remove();
}

function placePadHandle(
  host: HTMLElement,
  side: PagePadSide,
  edgeX: number,
  top: number,
  height: number,
  padPx: number,
  shellWidth: number,
  locked = false,
): void {
  let handle = host.querySelector(
    `.readit-pad-resize[data-readit-pad="${side}"]`,
  ) as HTMLButtonElement | null;
  if (!handle) {
    handle = document.createElement("button");
    handle.type = "button";
    handle.className = "readit-pad-resize";
    handle.dataset.readitPad = side;
    handle.setAttribute(
      "aria-label",
      side === "left" ? "Resize left page padding" : "Resize right page padding",
    );
    handle.title =
      side === "left"
        ? "Drag edge to resize left padding"
        : "Drag edge to resize right padding";
    host.appendChild(handle);
  }
  if (shellWidth < 8 || height < 8 || padPx < 4) {
    handle.style.display = "none";
    return;
  }
  handle.style.display = "block";
  handle.dataset.locked = locked ? "1" : "0";
  handle.title = locked
    ? "Size locked — unlock to resize"
    : side === "left"
      ? "Drag edge to resize left padding"
      : "Drag edge to resize right padding";
  // Shared edge with the neighboring column (same anchor model for L + R).
  handle.style.left = `${Math.round(edgeX - 5)}px`;
  handle.style.top = `${Math.round(top)}px`;
  handle.style.height = `${Math.round(height)}px`;
}

/** Session selection for edit toolbox (panel ids + separator ids). */
let editSelection = new Set<string>();

export function getEditSelection(): string[] {
  return [...editSelection];
}

function emitEditSelection(): void {
  window.dispatchEvent(
    new CustomEvent("readit:edit-selection", {
      detail: { selected: getEditSelection() },
    }),
  );
}

function toggleEditSelection(id: string, on: boolean): void {
  if (on) editSelection.add(id);
  else editSelection.delete(id);
  emitEditSelection();
}


function dispatchWidthLocksPersist(widthLocks: Record<string, boolean>): void {
  window.dispatchEvent(
    new CustomEvent("readit:layout-width-locks", {
      detail: { widthLocks },
    }),
  );
}

function lockKeyForFrame(kind: FrameKind, id: string): string {
  if (kind === "pad") return id === "left" ? "pad:left" : "pad:right";
  return id;
}

function syncFrameLock(
  frame: HTMLElement,
  lockKey: string,
  settings: ReaditSettings,
): void {
  const locked = !!settings.layoutSlots.widthLocks?.[lockKey];
  frame.dataset.sizeLocked = locked ? "1" : "0";
  let btn = frame.querySelector(".readit-frame-lock") as HTMLButtonElement | null;
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "readit-frame-lock";
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!layoutSettings) return;
      const kind = frame.dataset.kind as FrameKind;
      const id = frame.dataset.id || "";
      const key = lockKeyForFrame(kind, id);
      const prev = { ...(layoutSettings.layoutSlots.widthLocks || {}) };
      if (prev[key]) delete prev[key];
      else prev[key] = true;
      layoutSettings = {
        ...layoutSettings,
        layoutSlots: { ...layoutSettings.layoutSlots, widthLocks: prev },
      };
      syncFrameLock(frame, key, layoutSettings);
      schedulePlaceHandles(layoutSettings);
      dispatchWidthLocksPersist(prev);
    });
    frame.appendChild(btn);
  }
  btn.dataset.locked = locked ? "1" : "0";
  btn.title = locked
    ? "Unlock size (neighbors may resize this)"
    : "Lock size (neighbors won't change this width)";
  btn.setAttribute(
    "aria-label",
    locked ? "Unlock column size" : "Lock column size",
  );
  btn.textContent = locked ? "L" : "○";
}

function ensureFrame(
  host: HTMLElement,
  kind: FrameKind,
  id: string,
  labelText: string,
): HTMLElement {
  let frame = host.querySelector(
    `.readit-layout-frame[data-kind="${kind}"][data-id="${id}"]`,
  ) as HTMLElement | null;
  if (!frame) {
    frame = document.createElement("div");
    frame.className = "readit-layout-frame";
    frame.dataset.kind = kind;
    frame.dataset.id = id;
    const label = document.createElement("button");
    label.type = "button";
    label.className = "readit-frame-label";
    label.dataset.kind = kind;
    label.dataset.id = id;
    label.textContent = labelText;
    label.title =
      kind === "panel"
        ? `Drag anywhere on ${labelText} to move`
        : kind === "separator"
          ? `Drag to place between columns · resize from either edge`
          : kind === "chrome"
            ? `${labelText} — theme via Studio · place top/bottom in Layout`
            : `Drag to swap ${labelText} with the other pad`;
    label.setAttribute(
      "aria-label",
      kind === "panel"
        ? `Move ${labelText} column`
        : kind === "separator"
          ? `Move separator ${labelText}`
          : `Move ${labelText}`,
    );
    frame.appendChild(label);
    if (kind === "panel" || kind === "separator") {
      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "readit-frame-select";
      check.title = "Select for Zoom / Font";
      check.setAttribute("aria-label", `Select ${labelText}`);
      check.addEventListener("click", (ev) => {
        ev.stopPropagation();
      });
      check.addEventListener("change", () => {
        toggleEditSelection(id, check.checked);
        frame!.dataset.selected = check.checked ? "1" : "0";
      });
      frame.appendChild(check);
    }
    if (kind === "separator") {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "readit-frame-remove";
      remove.textContent = "×";
      remove.title = "Remove separator";
      remove.setAttribute("aria-label", "Remove separator");
      remove.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (!layoutSettings) return;
        const nextSlots = removeLayoutSeparator(
          layoutSettings.layoutSlots,
          id,
        );
        layoutSettings = {
          ...layoutSettings,
          layoutSlots: nextSlots,
        };
        editSelection.delete(id);
        emitEditSelection();
        liveWidths = applyFittedShellWidths(layoutSettings);
        schedulePlaceHandles(layoutSettings);
        dispatchSeparatorsPersist(nextSlots.separators || []);
      });
      frame.appendChild(remove);
    }
    host.appendChild(frame);
  } else {
    const label = frame.querySelector(".readit-frame-label");
    if (label && label.textContent !== labelText) label.textContent = labelText;
  }
  const check = frame.querySelector(
    ".readit-frame-select",
  ) as HTMLInputElement | null;
  if (check) {
    const on = editSelection.has(id);
    check.checked = on;
    frame.dataset.selected = on ? "1" : "0";
  }
  if (layoutSettings) {
    syncFrameLock(frame, lockKeyForFrame(kind, id), layoutSettings);
  }
  return frame;
}

function positionFrame(
  frame: HTMLElement,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  if (width < 4 || height < 8) {
    frame.style.display = "none";
    return;
  }
  frame.style.display = "block";
  // Integer CSS left/top/width/height avoids subpixel outline jitter while
  // resizing; overlays are independent of slot overflow boxes.
  frame.style.left = `${Math.round(left)}px`;
  frame.style.top = `${Math.round(top)}px`;
  frame.style.width = `${Math.round(width)}px`;
  frame.style.height = `${Math.round(height)}px`;
}

function ensureDropLine(host: HTMLElement): HTMLElement {
  let line = host.querySelector(".readit-drop-line") as HTMLElement | null;
  if (!line) {
    line = document.createElement("div");
    line.className = "readit-drop-line";
    line.setAttribute("aria-hidden", "true");
    host.appendChild(line);
  }
  return line;
}

function ensureDropLabel(host: HTMLElement): HTMLElement {
  let label = host.querySelector(".readit-drop-label") as HTMLElement | null;
  if (!label) {
    label = document.createElement("div");
    label.className = "readit-drop-label";
    label.setAttribute("aria-hidden", "true");
    host.appendChild(label);
  }
  return label;
}

function panelShortLabel(panel: LayoutColumnPanel): string {
  return COLUMN_PANEL_LABELS[panel];
}

function positionDropLabel(
  label: HTMLElement,
  text: string,
  left: number,
  top: number,
): void {
  label.textContent = text;
  label.style.display = "block";
  label.style.left = `${Math.round(left)}px`;
  label.style.top = `${Math.round(top)}px`;
}

/** Blueprint geometry from shell + panel-owned widths (not flaky slot DOM boxes). */
function computePanelGeometry(
  settings: ReaditSettings,
  live: LiveWidths,
): {
  panel: LayoutColumnPanel;
  mid: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
}[] {
  const panels = visibleColumnPanels(settings);
  const shell = document.querySelector(
    "[data-readit-layout-shell]",
  ) as HTMLElement | null;
  if (!(shell instanceof HTMLElement) || panels.length === 0) {
    return collectPanelHitRects(panels).map((r) => ({
      ...r,
      width: r.right - r.left,
    }));
  }
  const r = shell.getBoundingClientRect();
  const top = Math.max(0, r.top);
  const bottom = Math.max(top + 8, Math.min(r.bottom, window.innerHeight));
  const gap = live.columnGapPx;
  const placements = settings.layoutSlots.placements;

  // Stacked dual: nav+rail share one horizontal column; vertical extent comes
  // from live DOM so edit frames match the absolute-rail layout.
  if (isStackedPair(placements)) {
    const stackW = live.leftNavPx;
    const feedW = live.feedWidthPx;
    const isDualRight = placements.leftNav === "stackedRight";
    let stackLeft = r.left + live.pagePadLeftPx + gap;
    let mainLeft = stackLeft + stackW + gap;
    if (isDualRight) {
      mainLeft = r.left + live.pagePadLeftPx + gap;
      stackLeft = mainLeft + feedW + gap;
    }
    const navEl = document.querySelector(
      '[data-readit-slot="leftNav"]',
    ) as HTMLElement | null;
    const railEl = document.querySelector(
      '[data-readit-slot="rightRail"]',
    ) as HTMLElement | null;
    const navR = navEl?.getBoundingClientRect();
    const railR = railEl?.getBoundingClientRect();
    const out: {
      panel: LayoutColumnPanel;
      mid: number;
      left: number;
      right: number;
      top: number;
      bottom: number;
      width: number;
    }[] = [];
    for (const panel of panels) {
      if (panel === "main") {
        out.push({
          panel,
          left: mainLeft,
          right: mainLeft + feedW,
          mid: mainLeft + feedW / 2,
          top,
          bottom,
          width: feedW,
        });
        continue;
      }
      const dom = panel === "leftNav" ? navR : railR;
      const panelTop = dom ? Math.max(0, dom.top) : top;
      const panelBottom = dom
        ? Math.max(panelTop + 8, Math.min(window.innerHeight, dom.bottom))
        : bottom;
      out.push({
        panel,
        left: stackLeft,
        right: stackLeft + stackW,
        mid: stackLeft + stackW / 2,
        top: panelTop,
        bottom: panelBottom,
        width: stackW,
      });
    }
    return out;
  }

  let x = r.left;
  const out: {
    panel: LayoutColumnPanel;
    mid: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
  }[] = [];
  const tracks = buildLayoutTracks(settings.layoutSlots);
  for (const track of tracks) {
    if (track.type === "pad") {
      x +=
        (track.side === "left" ? live.pagePadLeftPx : live.pagePadRightPx) +
        gap;
      continue;
    }
    if (track.type === "separator") {
      x += track.widthPx + gap;
      continue;
    }
    const width = panelWidthPx(track.panel, live);
    if (width < 4) {
      x += width + gap;
      continue;
    }
    out.push({
      panel: track.panel,
      left: x,
      right: x + width,
      mid: x + width / 2,
      top,
      bottom,
      width,
    });
    x += width + gap;
  }
  return out;
}

function computeSeparatorGeometry(
  settings: ReaditSettings,
  live: LiveWidths,
): {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
}[] {
  const shell = document.querySelector(
    "[data-readit-layout-shell]",
  ) as HTMLElement | null;
  if (!(shell instanceof HTMLElement)) return [];
  const r = shell.getBoundingClientRect();
  const top = Math.max(0, r.top);
  const bottom = Math.max(top + 8, Math.min(r.bottom, window.innerHeight));
  let x = r.left;
  const gap = live.columnGapPx;
  const out: {
    id: string;
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
  }[] = [];
  for (const track of buildLayoutTracks(settings.layoutSlots)) {
    if (track.type === "pad") {
      x +=
        (track.side === "left" ? live.pagePadLeftPx : live.pagePadRightPx) +
        gap;
      continue;
    }
    if (track.type === "panel") {
      x += panelWidthPx(track.panel, live) + gap;
      continue;
    }
    const width = track.widthPx;
    out.push({
      id: track.id,
      left: x,
      right: x + width,
      top,
      bottom,
      width,
    });
    x += width + gap;
  }
  return out;
}

export function addLayoutSeparator(
  config: LayoutSlotsConfig,
  after: LayoutColumnPanel = "main",
): LayoutSlotsConfig {
  const seps = config.separators || [];
  if (seps.length >= MAX_LAYOUT_SEPARATORS) return config;
  const next: LayoutSeparator = {
    id: createId("sep"),
    after,
    widthPx: 24,
  };
  return {
    ...config,
    preset: "custom",
    separators: [...seps, next],
  };
}

/** Place an existing separator after a different column (between columns). */
export function moveLayoutSeparator(
  config: LayoutSlotsConfig,
  sepId: string,
  after: LayoutColumnPanel,
): LayoutSlotsConfig {
  const seps = config.separators || [];
  if (!seps.some((s) => s.id === sepId)) return config;
  return {
    ...config,
    preset: "custom",
    separators: seps.map((s) => (s.id === sepId ? { ...s, after } : s)),
  };
}

export function removeLayoutSeparator(
  config: LayoutSlotsConfig,
  sepId: string,
): LayoutSlotsConfig {
  const seps = config.separators || [];
  if (!seps.some((s) => s.id === sepId)) return config;
  return {
    ...config,
    preset: "custom",
    separators: seps.filter((s) => s.id !== sepId),
  };
}

function dispatchSeparatorsPersist(separators: LayoutSeparator[]): void {
  window.dispatchEvent(
    new CustomEvent("readit:layout-separators", {
      detail: { separators },
    }),
  );
}

function placeColResizeHandle(
  host: HTMLElement,
  id: string,
  edge: "left" | "right",
  geo: { left: number; right: number; top: number; bottom: number; width: number },
  opts: { kind?: "separator"; label: string; locked?: boolean },
): void {
  const sel = `.readit-col-resize[data-readit-resize="${CSS.escape(id)}"][data-edge="${edge}"]`;
  let handle = host.querySelector(sel) as HTMLButtonElement | null;
  if (!handle) {
    handle = document.createElement("button");
    handle.type = "button";
    handle.className = "readit-col-resize";
    handle.dataset.readitResize = id;
    handle.dataset.edge = edge;
    if (opts.kind === "separator") handle.dataset.kind = "separator";
    handle.setAttribute(
      "aria-label",
      `Resize ${opts.label} (${edge} edge)`,
    );
    handle.title = `Drag ${edge} edge to resize ${opts.label}`;
    host.appendChild(handle);
  }
  const height = geo.bottom - geo.top;
  if (geo.width < 4 || height < 8) {
    handle.style.display = "none";
    return;
  }
  handle.style.display = "block";
  handle.dataset.locked = opts.locked ? "1" : "0";
  handle.title = opts.locked
    ? "Size locked — unlock to resize"
    : `Drag ${edge} edge to resize ${opts.label}`;
  handle.style.left =
    edge === "right"
      ? `${Math.round(geo.right - 5)}px`
      : `${Math.round(geo.left - 5)}px`;
  handle.style.top = `${Math.round(geo.top)}px`;
  handle.style.height = `${Math.round(height)}px`;
}

function placeEditChrome(settings: ReaditSettings): void {
  if (!settings.layoutSlots.editMode) {
    removeResizeHost();
    return;
  }
  // Freeze chrome geometry while a column drag is in progress so mid-drag
  // refresh cannot fight the overlay-only drop preview.
  if (columnDragging) return;
  if (!liveWidths) {
    liveWidths = applyFittedShellWidths(settings);
  }
  const locks = widthLockSet(settings.layoutSlots.widthLocks);
  const host = ensureResizeHost();
  const panels = visibleColumnPanels(settings);
  const sepIds = new Set(
    (settings.layoutSlots.separators || []).map((s) => s.id),
  );
  const needed = new Set([...panels.map(String), ...sepIds]);
  for (const el of [...host.querySelectorAll(".readit-col-resize")]) {
    const id = el.getAttribute("data-readit-resize");
    if (!id || !needed.has(id)) el.remove();
  }
  for (const el of [
    ...host.querySelectorAll(
      '.readit-layout-frame[data-kind="panel"], .readit-layout-frame[data-kind="separator"], .readit-layout-frame[data-kind="chrome"]',
    ),
  ]) {
    const id = el.getAttribute("data-id");
    if (!id || !needed.has(id)) el.remove();
  }

  const panelRects = computePanelGeometry(settings, liveWidths);
  const sepRects = computeSeparatorGeometry(settings, liveWidths);
  const firstPanel = panelRects[0];
  const lastPanel = panelRects[panelRects.length - 1];
  let contentRight = lastPanel?.right ?? 0;
  for (const sep of sepRects) {
    contentRight = Math.max(contentRight, sep.right);
  }
  const shell = document.querySelector(
    "[data-readit-layout-shell]",
  ) as HTMLElement | null;
  const shellRect = shell?.getBoundingClientRect();
  const cssRightEdge = shellRect
    ? shellRect.right - liveWidths.pagePadRightPx
    : contentRight;
  // Right pad is fixed to the shell's right edge (viewport), matching left pad
  // at the shell start. Free space between content and the pad is intentional.
  const rightPadInner = cssRightEdge;

  for (const geo of panelRects) {
    const panel = geo.panel;
    const height = geo.bottom - geo.top;
    if (geo.width < 8 || height < 8) {
      for (const edge of ["left", "right"] as const) {
        const h = host.querySelector(
          `.readit-col-resize[data-readit-resize="${panel}"][data-edge="${edge}"]`,
        );
        if (h instanceof HTMLElement) h.style.display = "none";
      }
      const stale = host.querySelector(
        `.readit-layout-frame[data-kind="panel"][data-id="${panel}"]`,
      );
      if (stale instanceof HTMLElement) stale.style.display = "none";
      continue;
    }
    const label = COLUMN_PANEL_LABELS[panel];
    const isFirst = firstPanel?.panel === panel;
    const isLast = lastPanel?.panel === panel;
    // Outer edges abutting page pads are owned by the pad handle so L/R
    // gutters share one anchored edge with their neighbor column.
    if (!isFirst) {
      placeColResizeHandle(host, panel, "left", geo, {
        label,
        locked: locks.has(panel),
      });
    } else {
      const h = host.querySelector(
        `.readit-col-resize[data-readit-resize="${panel}"][data-edge="left"]`,
      );
      if (h instanceof HTMLElement) h.style.display = "none";
    }
    // Keep the last panel's right handle when free space separates it from
    // the right-pad chrome (pad handle sits on the pad's inner edge).
    const abutsRightPad =
      isLast && Math.abs(geo.right - rightPadInner) < 1.5;
    if (!abutsRightPad) {
      placeColResizeHandle(host, panel, "right", geo, {
        label,
        locked: locks.has(panel),
      });
    } else {
      const h = host.querySelector(
        `.readit-col-resize[data-readit-resize="${panel}"][data-edge="right"]`,
      );
      if (h instanceof HTMLElement) h.style.display = "none";
    }

    const frame = ensureFrame(host, "panel", panel, label);
    positionFrame(frame, geo.left, geo.top, geo.width, height);
  }

  // Page chrome frames (header / sub-header)
  for (const chromeId of ["topNav", "subHeader"] as const) {
    const el = document.querySelector(
      `[data-readit-slot="${chromeId}"]`,
    ) as HTMLElement | null;
    if (!(el instanceof HTMLElement)) {
      const stale = host.querySelector(
        `.readit-layout-frame[data-kind="chrome"][data-id="${chromeId}"]`,
      );
      if (stale instanceof HTMLElement) stale.style.display = "none";
      continue;
    }
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    const label = chromeId === "topNav" ? "Header" : "Sub header";
    const frame = ensureFrame(host, "chrome", chromeId, label);
    positionFrame(frame, r.left, r.top, r.width, r.height);
  }

  if (isStackedPair(settings.layoutSlots.placements)) {
    // Stacked panels share one column edge — leftNav owns the single resize
    // handle (sized to the union of both rects); rightRail's own is hidden.
    for (const edge of ["left", "right"] as const) {
      const railHandle = host.querySelector(
        `.readit-col-resize[data-readit-resize="rightRail"][data-edge="${edge}"]`,
      );
      if (railHandle instanceof HTMLElement) railHandle.style.display = "none";
    }
    const navGeo = panelRects.find((g) => g.panel === "leftNav");
    const railGeo = panelRects.find((g) => g.panel === "rightRail");
    if (navGeo && railGeo) {
      const unionTop = Math.min(navGeo.top, railGeo.top);
      const unionBottom = Math.max(navGeo.bottom, railGeo.bottom);
      for (const edge of ["left", "right"] as const) {
        const h = host.querySelector(
          `.readit-col-resize[data-readit-resize="leftNav"][data-edge="${edge}"]`,
        );
        if (h instanceof HTMLElement) {
          h.style.top = `${Math.round(unionTop)}px`;
          h.style.height = `${Math.round(unionBottom - unionTop)}px`;
        }
      }
    }
  }

  for (const geo of sepRects) {
    const height = geo.bottom - geo.top;
    if (geo.width < 4 || height < 8) {
      for (const edge of ["left", "right"] as const) {
        const h = host.querySelector(
          `.readit-col-resize[data-readit-resize="${CSS.escape(geo.id)}"][data-edge="${edge}"]`,
        );
        if (h instanceof HTMLElement) h.style.display = "none";
      }
      continue;
    }
    placeColResizeHandle(host, geo.id, "left", geo, {
      kind: "separator",
      label: "separator",
      locked: locks.has(geo.id),
    });
    const sepAbutsRightPad = Math.abs(geo.right - rightPadInner) < 1.5;
    if (!sepAbutsRightPad) {
      placeColResizeHandle(host, geo.id, "right", geo, {
        kind: "separator",
        label: "separator",
        locked: locks.has(geo.id),
      });
    } else {
      const h = host.querySelector(
        `.readit-col-resize[data-readit-resize="${CSS.escape(geo.id)}"][data-edge="right"]`,
      );
      if (h instanceof HTMLElement) h.style.display = "none";
    }
    const frame = ensureFrame(host, "separator", geo.id, "Sep");
    positionFrame(frame, geo.left, geo.top, geo.width, height);
  }

  if (shell && shellRect && liveWidths && firstPanel && lastPanel) {
    const r = shellRect;
    const top = Math.max(0, r.top);
    const height = Math.min(r.bottom, window.innerHeight) - top;
    // Pad chrome: left at shell start, right fixed to shell's right edge.
    const leftPadPx = liveWidths.pagePadLeftPx;
    const rightPadPx = liveWidths.pagePadRightPx;
    const leftEdge = r.left + leftPadPx;
    const rightEdge = cssRightEdge;

    placePadHandle(
      host,
      "left",
      leftEdge,
      top,
      height,
      leftPadPx,
      r.width,
      locks.has("pad:left"),
    );
    placePadHandle(
      host,
      "right",
      rightEdge,
      top,
      height,
      rightPadPx,
      r.width,
      locks.has("pad:right"),
    );

    const leftFrame = ensureFrame(
      host,
      "pad",
      "left",
      leftPadPx < 72 ? "L" : "Left pad",
    );
    positionFrame(leftFrame, r.left, top, leftPadPx, height);
    syncFrameLock(leftFrame, "pad:left", settings);
    const rightFrame = ensureFrame(
      host,
      "pad",
      "right",
      rightPadPx < 72 ? "R" : "Right pad",
    );
    positionFrame(rightFrame, rightEdge, top, rightPadPx, height);
    syncFrameLock(rightFrame, "pad:right", settings);
  } else {
    for (const el of [
      ...host.querySelectorAll(".readit-pad-resize"),
      ...host.querySelectorAll('.readit-layout-frame[data-kind="pad"]'),
    ]) {
      el.remove();
    }
  }

  ensureDropLine(host);
  panelHitRects = panelRects;
}

function schedulePlaceHandles(settings: ReaditSettings): void {
  window.cancelAnimationFrame(placeHandlesRaf);
  placeHandlesRaf = window.requestAnimationFrame(() => {
    placeEditChrome(settings);
  });
}

let resizeCleanup: (() => void) | null = null;
let fitCleanup: (() => void) | null = null;
let placeHandlesRaf = 0;
let resizeListenersBound = false;
let resizeDragging = false;
let columnDragging = false;
let liveWidths: LiveWidths | null = null;
let layoutSettings: ReaditSettings | null = null;
let panelHitRects: {
  panel: LayoutColumnPanel;
  mid: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}[] = [];

type ColumnDragSession = {
  kind: FrameKind;
  id: string;
  panels: LayoutColumnPanel[];
  dragFrame: HTMLElement | null;
  /** Insert / replace intent while dragging a panel or separator. */
  pendingDrop: DropIntent | null;
  pendingPadTarget: PagePadSide | null;
};

/** Center = replace/swap; edge / gap = insert between or beside. */
type DropIntent =
  | {
      mode: "replace";
      target: LayoutColumnPanel;
    }
  | {
      mode: "insert";
      /** Final index in columnOrder after the move. */
      finalIndex: number;
      /** For separators: panel that the separator sits after. */
      after: LayoutColumnPanel;
      gapX: number;
      top: number;
      bottom: number;
      /** Adjacent columns to push apart (gap preview). */
      splitLeft: LayoutColumnPanel | null;
      splitRight: LayoutColumnPanel | null;
      /** Single-side nudge when placing beside an outer column. */
      nudgePanel: LayoutColumnPanel | null;
      nudgeDir: "left" | "right" | null;
    };

const DROP_EDGE_FRAC = 0.3;
/** Thin overlay caret width (px) — never nudges real columns. */
const DROP_CARET_PX = 4;

let columnDragSession: ColumnDragSession | null = null;

type ResizeSession =
  | {
      type: "panel";
      panel: LayoutColumnPanel;
      panels: LayoutColumnPanel[];
      edge: "left" | "right";
      startX: number;
      startW: number;
      baseline: LiveWidths;
    }
  | {
      type: "pad";
      side: PagePadSide;
      panels: LayoutColumnPanel[];
      startX: number;
      startPad: number;
      baseline: LiveWidths;
    }
  | {
      type: "separator";
      id: string;
      edge: "left" | "right";
      startX: number;
      startW: number;
      /** Panel immediately left of the separator (pinned when resizing left edge). */
      leftPanel: LayoutColumnPanel;
      panels: LayoutColumnPanel[];
      baseline: LiveWidths;
    };

let resizeSession: ResizeSession | null = null;

function syncLiveWidthsFromSettings(settings: ReaditSettings): void {
  if (resizeDragging || columnDragging) return;
  liveWidths = applyFittedShellWidths(settings, "overflow");
}

function mountViewportFit(settings: ReaditSettings): void {
  layoutSettings = settings;
  stampLayoutSlots();
  // Center once on mount so leftover viewport becomes equal pads — but not
  // mid-drag, where an unrelated settings change (e.g. a knob toggle) would
  // otherwise stomp the width the user is actively dragging.
  if (!resizeDragging && !columnDragging) {
    liveWidths = applyFittedShellWidths(settings, "center");
  }

  if (fitCleanup) return;
  const onViewportResize = () => {
    if (!layoutSettings || resizeDragging || columnDragging) return;
    liveWidths = applyFittedShellWidths(layoutSettings, "center");
    if (layoutSettings.layoutSlots.editMode) {
      schedulePlaceHandles(layoutSettings);
    }
  };
  window.addEventListener("resize", onViewportResize);
  fitCleanup = () => {
    window.removeEventListener("resize", onViewportResize);
    fitCleanup = null;
  };
}

function collectPanelHitRects(
  panels: LayoutColumnPanel[],
): {
  panel: LayoutColumnPanel;
  mid: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}[] {
  const out: {
    panel: LayoutColumnPanel;
    mid: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
  }[] = [];
  for (const panel of panels) {
    const slot = document.querySelector(`[data-readit-slot="${panel}"]`);
    if (!(slot instanceof HTMLElement)) continue;
    const r = slot.getBoundingClientRect();
    const top = Math.max(0, r.top);
    const bottom = Math.min(r.bottom, window.innerHeight);
    if (r.width < 8 || bottom - top < 8) continue;
    out.push({
      panel,
      mid: r.left + r.width / 2,
      left: r.left,
      right: r.right,
      top,
      bottom,
    });
  }
  return out;
}

type PanelGeo = {
  panel: LayoutColumnPanel;
  left: number;
  right: number;
  top: number;
  bottom: number;
  mid: number;
  width?: number;
};

/**
 * Resolve insert-vs-replace from pointer X.
 * - Over column center → replace (swap) that column
 * - Over column left/right edge or in a gap → insert beside / between
 *
 * `finalIndex` is the desired index in the order **after** removing `dragging`
 * (post-removal), so `insertPanelAtIndex` can splice without further shifting.
 */
function resolveDropIntent(
  order: readonly LayoutColumnPanel[],
  rects: PanelGeo[],
  clientX: number,
  dragging: LayoutColumnPanel | null,
): DropIntent | null {
  if (rects.length === 0) return null;
  const sorted = [...rects].sort((a, b) => a.left - b.left);
  const others = dragging
    ? sorted.filter((r) => r.panel !== dragging)
    : sorted;
  if (others.length === 0) return null;

  const orderList = [...order];
  const orderWithout = dragging
    ? orderList.filter((p) => p !== dragging)
    : orderList;

  const indexBefore = (panel: LayoutColumnPanel): number => {
    const i = orderWithout.indexOf(panel);
    return i < 0 ? 0 : i;
  };
  const indexAfter = (panel: LayoutColumnPanel): number => {
    const i = orderWithout.indexOf(panel);
    return i < 0 ? orderWithout.length : i + 1;
  };

  const insertAt = (
    finalIndex: number,
    after: LayoutColumnPanel,
    gapX: number,
    top: number,
    bottom: number,
    splitLeft: LayoutColumnPanel | null,
    splitRight: LayoutColumnPanel | null,
    nudgePanel: LayoutColumnPanel | null,
    nudgeDir: "left" | "right" | null,
  ): DropIntent => ({
    mode: "insert",
    finalIndex,
    after,
    gapX,
    top,
    bottom,
    splitLeft,
    splitRight,
    nudgePanel,
    nudgeDir,
  });

  for (let i = 0; i < others.length - 1; i++) {
    const a = others[i]!;
    const b = others[i + 1]!;
    const gapLeft = a.right;
    const gapRight = b.left;
    const midGap = (gapLeft + gapRight) / 2;
    if (clientX >= gapLeft - 8 && clientX <= gapRight + 8) {
      return insertAt(
        indexAfter(a.panel),
        a.panel,
        midGap,
        Math.min(a.top, b.top),
        Math.max(a.bottom, b.bottom),
        a.panel,
        b.panel,
        null,
        null,
      );
    }
  }

  for (const r of others) {
    if (clientX < r.left || clientX >= r.right) continue;
    const w = Math.max(1, r.right - r.left);
    const rel = (clientX - r.left) / w;
    const idx = orderList.indexOf(r.panel);
    if (idx < 0) continue;

    if (rel < DROP_EDGE_FRAC) {
      if (idx === 0 || orderWithout[0] === r.panel) {
        return insertAt(
          0,
          r.panel,
          r.left,
          r.top,
          r.bottom,
          null,
          r.panel,
          r.panel,
          "right",
        );
      }
      const prevInFull = orderList[idx - 1]!;
      const prev =
        prevInFull === dragging ? orderList[idx - 2] : prevInFull;
      const prevRect = prev
        ? sorted.find((x) => x.panel === prev)
        : undefined;
      if (!prev) {
        return insertAt(
          0,
          r.panel,
          r.left,
          r.top,
          r.bottom,
          null,
          r.panel,
          r.panel,
          "right",
        );
      }
      return insertAt(
        indexBefore(r.panel),
        prev,
        prevRect ? (prevRect.right + r.left) / 2 : r.left,
        r.top,
        r.bottom,
        prev,
        r.panel,
        null,
        null,
      );
    }

    if (rel > 1 - DROP_EDGE_FRAC) {
      const isLastVisible =
        orderWithout[orderWithout.length - 1] === r.panel;
      if (isLastVisible) {
        return insertAt(
          orderWithout.length,
          r.panel,
          r.right,
          r.top,
          r.bottom,
          r.panel,
          null,
          r.panel,
          "left",
        );
      }
      const nextInFull = orderList[idx + 1]!;
      const nextP =
        nextInFull === dragging ? orderList[idx + 2] : nextInFull;
      const nextRect = nextP
        ? sorted.find((x) => x.panel === nextP)
        : undefined;
      if (!nextP) {
        return insertAt(
          orderWithout.length,
          r.panel,
          r.right,
          r.top,
          r.bottom,
          r.panel,
          null,
          r.panel,
          "left",
        );
      }
      return insertAt(
        indexAfter(r.panel),
        r.panel,
        nextRect ? (r.right + nextRect.left) / 2 : r.right,
        r.top,
        r.bottom,
        r.panel,
        nextP,
        null,
        null,
      );
    }

    if (!dragging) {
      const nextP = orderWithout[indexAfter(r.panel)] ?? null;
      return insertAt(
        indexAfter(r.panel),
        r.panel,
        r.right,
        r.top,
        r.bottom,
        r.panel,
        nextP,
        null,
        null,
      );
    }
    return { mode: "replace", target: r.panel };
  }

  const first = others[0]!;
  const last = others[others.length - 1]!;
  if (clientX < first.left) {
    return insertAt(
      0,
      first.panel,
      first.left,
      first.top,
      first.bottom,
      null,
      first.panel,
      first.panel,
      "right",
    );
  }
  if (clientX >= last.right) {
    return insertAt(
      orderWithout.length,
      last.panel,
      last.right,
      last.top,
      last.bottom,
      last.panel,
      null,
      last.panel,
      "left",
    );
  }
  return null;
}

function clearDropHints(host: HTMLElement): void {
  resetDropPreview(host);
  for (const el of host.querySelectorAll(".readit-layout-frame[data-dragging]")) {
    el.removeAttribute("data-dragging");
  }
  delete host.dataset.readitDraggingKind;
  const moving = host.querySelector(".readit-drop-moving") as HTMLElement | null;
  if (moving) moving.style.display = "none";
}

/** Clear insert/replace preview without dropping the dragging affordance. */
function resetDropPreview(host: HTMLElement): void {
  for (const el of host.querySelectorAll(".readit-layout-frame[data-drop]")) {
    el.removeAttribute("data-drop");
  }
  const line = host.querySelector(".readit-drop-line") as HTMLElement | null;
  if (line) {
    line.style.display = "none";
    line.removeAttribute("data-mode");
  }
  const label = host.querySelector(".readit-drop-label") as HTMLElement | null;
  if (label) {
    label.style.display = "none";
    label.textContent = "";
  }
}

/**
 * Overlay-only drop feedback: never translate real columns.
 * - Source: dimmed dragging frame + "Moving Nav/Feed/Rail/Sep" chip
 * - Insert: thin caret + "Insert here"
 * - Swap: dashed target frame + "Swap with Y" (panels only)
 */
function applyDropPreview(
  host: HTMLElement,
  intent: DropIntent,
  source: { kind: FrameKind; id: string } | null,
): void {
  const line = ensureDropLine(host);
  const label = ensureDropLabel(host);
  const moving = ensureMovingChip(host);

  if (source) {
    const srcFrame = host.querySelector(
      `.readit-layout-frame[data-kind="${source.kind}"][data-id="${CSS.escape(source.id)}"]`,
    ) as HTMLElement | null;
    if (srcFrame) {
      const r = srcFrame.getBoundingClientRect();
      const name =
        source.kind === "panel"
          ? panelShortLabel(source.id as LayoutColumnPanel)
          : source.kind === "separator"
            ? "Sep"
            : source.id;
      moving.textContent = `Moving ${name}`;
      moving.style.display = "block";
      moving.style.left = `${Math.round(r.left + 8)}px`;
      moving.style.top = `${Math.round(Math.max(8, r.top + 28))}px`;
    }
  } else {
    moving.style.display = "none";
  }

  if (intent.mode === "replace") {
    const dropFrame = host.querySelector(
      `.readit-layout-frame[data-kind="panel"][data-id="${intent.target}"]`,
    ) as HTMLElement | null;
    if (dropFrame) {
      dropFrame.dataset.drop = "replace";
      const r = dropFrame.getBoundingClientRect();
      positionDropLabel(
        label,
        `Swap with ${panelShortLabel(intent.target)}`,
        r.left + r.width / 2,
        Math.max(8, r.top + 8),
      );
      label.dataset.anchor = "center";
    }
    line.style.display = "none";
    return;
  }

  line.style.display = "block";
  line.dataset.mode = "insert";
  line.style.left = `${Math.round(intent.gapX - DROP_CARET_PX / 2)}px`;
  line.style.top = `${Math.round(intent.top)}px`;
  line.style.height = `${Math.round(intent.bottom - intent.top)}px`;
  line.style.width = `${DROP_CARET_PX}px`;
  positionDropLabel(
    label,
    "Insert here",
    intent.gapX,
    Math.max(8, intent.top + 12),
  );
  label.dataset.anchor = "center";
}

function ensureMovingChip(host: HTMLElement): HTMLElement {
  let chip = host.querySelector(".readit-drop-moving") as HTMLElement | null;
  if (!chip) {
    chip = document.createElement("div");
    chip.className = "readit-drop-moving";
    chip.setAttribute("aria-hidden", "true");
    host.appendChild(chip);
  }
  return chip;
}

function refreshChromeAfterOrder(settings: ReaditSettings): void {
  layoutSettings = settings;
  liveWidths = applyFittedShellWidths(settings);
  // Two frames so grid tracks settle before measuring/placing blueprints.
  window.cancelAnimationFrame(placeHandlesRaf);
  placeHandlesRaf = window.requestAnimationFrame(() => {
    placeHandlesRaf = window.requestAnimationFrame(() => {
      placeEditChrome(settings);
    });
  });
}

function mountColumnResize(settings: ReaditSettings): void {
  if (
    !settings.flags.layoutSlots ||
    settings.paused ||
    !settings.layoutSlots.editMode ||
    settings.layoutSlots.preset === "singleColumn"
  ) {
    resizeCleanup?.();
    resizeCleanup = null;
    return;
  }

  layoutSettings = settings;
  stampLayoutSlots();
  syncLiveWidthsFromSettings(settings);
  placeEditChrome(settings);

  if (resizeListenersBound) return;

  try {
    bindColumnEditListeners();
    resizeListenersBound = true;
  } catch (err) {
    console.warn("[readit] layout edit bind failed", err);
  }
}

function bindColumnEditListeners(): void {
  const finishColumnDrag = () => {
    const session = columnDragSession;
    const host = ensureResizeHost();
    document.documentElement.classList.remove("readit-col-dragging");
    clearDropHints(host);
    delete host.dataset.readitDragging;
    columnDragging = false;
    columnDragSession = null;
    if (!session || !layoutSettings) return;

    if (session.kind === "panel") {
      const typed = session.id as LayoutColumnPanel;
      const intent = session.pendingDrop;
      if (!intent) return;
      let nextOrder: LayoutColumnPanel[];
      if (intent.mode === "replace") {
        if (intent.target === typed) return;
        nextOrder = swapColumnPanels(
          layoutSettings.layoutSlots.columnOrder,
          typed,
          intent.target,
        );
      } else {
        const from = layoutSettings.layoutSlots.columnOrder.indexOf(typed);
        if (from === intent.finalIndex) return;
        // No-op if already immediately before the insert slot after removal
        nextOrder = insertPanelAtIndex(
          layoutSettings.layoutSlots.columnOrder,
          typed,
          intent.finalIndex,
        );
        if (
          nextOrder.join(",") ===
          normalizeColumnOrder(layoutSettings.layoutSlots.columnOrder).join(",")
        ) {
          return;
        }
      }
      const nextSettings: ReaditSettings = {
        ...layoutSettings,
        layoutSlots: applyColumnOrder(layoutSettings.layoutSlots, nextOrder),
      };
      refreshChromeAfterOrder(nextSettings);
      window.dispatchEvent(
        new CustomEvent("readit:layout-order", {
          detail: { columnOrder: nextOrder } satisfies LayoutOrderPersistDetail,
        }),
      );
      return;
    }

    if (session.kind === "separator") {
      const intent = session.pendingDrop;
      // resolveDropIntent is always called with dragging=null for separators
      // (see the call site above), so it can only ever produce "insert".
      if (!intent || intent.mode === "replace") return;
      const after = intent.after;
      const nextSlots = moveLayoutSeparator(
        layoutSettings.layoutSlots,
        session.id,
        after,
      );
      layoutSettings = { ...layoutSettings, layoutSlots: nextSlots };
      liveWidths = applyFittedShellWidths(layoutSettings);
      schedulePlaceHandles(layoutSettings);
      dispatchSeparatorsPersist(nextSlots.separators || []);
      return;
    }

    if (liveWidths && session.pendingPadTarget) {
      window.dispatchEvent(
        new CustomEvent("readit:layout-pads", {
          detail: {
            pagePadLeftPx: liveWidths.pagePadRightPx,
            pagePadRightPx: liveWidths.pagePadLeftPx,
          } satisfies LayoutPadsPersistDetail,
        }),
      );
    }
  };

  const finishResize = () => {
    document.documentElement.classList.remove("readit-col-resizing");
    for (const h of document.querySelectorAll(
      ".readit-col-resize[data-active], .readit-pad-resize[data-active]",
    )) {
      h.removeAttribute("data-active");
    }
    const session = resizeSession;
    resizeSession = null;
    resizeDragging = false;
    if (session?.type === "separator" && layoutSettings) {
      dispatchSeparatorsPersist(layoutSettings.layoutSlots.separators || []);
      // Left-edge resize also trades width with the neighbor panel.
      if (session.edge === "left" && liveWidths) {
        window.dispatchEvent(
          new CustomEvent("readit:layout-widths", {
            detail: { ...liveWidths } satisfies LayoutWidthsPersistDetail,
          }),
        );
      }
      return;
    }
    if (!liveWidths) return;
    const detail: LayoutWidthsPersistDetail = { ...liveWidths };
    window.dispatchEvent(new CustomEvent("readit:layout-widths", { detail }));
  };

  const onPointerDown = (ev: PointerEvent | MouseEvent) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement) || !liveWidths || !layoutSettings) return;
    if (columnDragSession || resizeSession) return;
    const panels = budgetColumnOrder(
      visibleColumnPanels(layoutSettings),
      layoutSettings.layoutSlots.placements,
    );
    const host = ensureResizeHost();

    const label = t.closest(".readit-frame-label") as HTMLElement | null;
    const frameHit = t.closest(".readit-layout-frame") as HTMLElement | null;
    const dragFrom = label || frameHit;
    if (dragFrom) {
      const kind = (dragFrom.dataset.kind ||
        frameHit?.dataset.kind) as FrameKind | undefined;
      const id = dragFrom.dataset.id || frameHit?.dataset.id;
      if (!kind || !id) return;
      // Stacked leftNav/rightRail share one column edge — reordering them via
      // drag isn't well-defined (their rects overlap horizontally). Resize
      // stays available through the shared handle placed above.
      if (
        kind === "panel" &&
        (id === "leftNav" || id === "rightRail") &&
        isStackedPair(layoutSettings.layoutSlots.placements)
      ) {
        return;
      }
      // Don't start a column drag from the resize handle / select / remove.
      if (
        t.closest(
          ".readit-col-resize, .readit-pad-resize, .readit-frame-select, .readit-frame-remove, .readit-frame-lock",
        )
      )
        return;
      ev.preventDefault();
      ev.stopPropagation();
      const dragFrame = host.querySelector(
        `.readit-layout-frame[data-kind="${kind}"][data-id="${id}"]`,
      ) as HTMLElement | null;
      if (dragFrame) dragFrame.dataset.dragging = "1";
      columnDragging = true;
      document.documentElement.classList.add("readit-col-dragging");
      host.dataset.readitDragging = `${kind}:${id}`;
      host.dataset.readitDraggingKind = "column";
      columnDragSession = {
        kind,
        id,
        panels,
        dragFrame,
        pendingDrop: null,
        pendingPadTarget: null,
      };
      return;
    }

    const padHandle = t.closest(".readit-pad-resize") as HTMLElement | null;
    if (padHandle) {
      const side = padHandle.dataset.readitPad as PagePadSide | undefined;
      if (!side) return;
      if (
        widthLockSet(layoutSettings.layoutSlots.widthLocks).has(
          side === "left" ? "pad:left" : "pad:right",
        )
      ) {
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      resizeDragging = true;
      padHandle.dataset.active = "1";
      document.documentElement.classList.add("readit-col-resizing");
      resizeSession = {
        type: "pad",
        side,
        panels,
        startX: ev.clientX,
        startPad:
          side === "left" ? liveWidths.pagePadLeftPx : liveWidths.pagePadRightPx,
        baseline: mirrorStackedWidths(
          { ...liveWidths },
          layoutSettings.layoutSlots.placements,
        ),
      };
      return;
    }

    const handle = t.closest(".readit-col-resize") as HTMLElement | null;
    if (!handle) return;
    const resizeId = handle.dataset.readitResize;
    if (!resizeId) return;
    const isSep =
      handle.dataset.kind === "separator" ||
      (layoutSettings.layoutSlots.separators || []).some(
        (s) => s.id === resizeId,
      );
    ev.preventDefault();
    ev.stopPropagation();
    resizeDragging = true;
    handle.dataset.active = "1";
    document.documentElement.classList.add("readit-col-resizing");
    if (isSep) {
      const sep = (layoutSettings.layoutSlots.separators || []).find(
        (s) => s.id === resizeId,
      );
      if (widthLockSet(layoutSettings.layoutSlots.widthLocks).has(resizeId)) {
        return;
      }
      const edge =
        handle.dataset.edge === "left" || handle.dataset.edge === "right"
          ? handle.dataset.edge
          : "right";
      resizeSession = {
        type: "separator",
        id: resizeId,
        edge,
        startX: ev.clientX,
        startW: sep?.widthPx ?? 24,
        leftPanel: sep?.after ?? "leftNav",
        panels,
        baseline: mirrorStackedWidths(
          { ...liveWidths },
          layoutSettings.layoutSlots.placements,
        ),
      };
      return;
    }
    const panel = resizeId as LayoutColumnPanel;
    if (widthLockSet(layoutSettings.layoutSlots.widthLocks).has(panel)) {
      return;
    }
    const edge =
      handle.dataset.edge === "left" || handle.dataset.edge === "right"
        ? handle.dataset.edge
        : "right";
    resizeSession = {
      type: "panel",
      panel,
      panels,
      edge,
      startX: ev.clientX,
      startW: panelWidthPx(panel, liveWidths),
      baseline: mirrorStackedWidths(
        { ...liveWidths },
        layoutSettings.layoutSlots.placements,
      ),
    };
  };

  const onDragMove = (moveEv: MouseEvent | CustomEvent) => {
    if (!layoutSettings || !liveWidths) return;
    const host = ensureResizeHost();
    const clientX =
      "detail" in moveEv && moveEv.detail && typeof moveEv.detail === "object"
        ? Number((moveEv.detail as { clientX?: number }).clientX)
        : (moveEv as MouseEvent).clientX;
    if (!Number.isFinite(clientX)) return;

    // Recover session if pointerdown armed the DOM but module state was lost
    // (duplicate listener worlds / mid-gesture re-entry).
    if (!columnDragSession && host.dataset.readitDragging) {
      const [kind, id] = host.dataset.readitDragging.split(":") as [
        FrameKind,
        string,
      ];
      if (kind && id) {
        const panels = visibleColumnPanels(layoutSettings);
        columnDragSession = {
          kind,
          id,
          panels,
          dragFrame: host.querySelector(
            `.readit-layout-frame[data-kind="${kind}"][data-id="${id}"]`,
          ) as HTMLElement | null,
          pendingDrop: null,
          pendingPadTarget: null,
        };
        columnDragging = true;
        host.dataset.readitDraggingKind = "column";
      }
    }

    if (!columnDragSession && !resizeSession) return;

    if (columnDragSession) {
      const session = columnDragSession;
      resetDropPreview(host);
      if (session.dragFrame) session.dragFrame.dataset.dragging = "1";
      if (session.kind === "panel" || session.kind === "separator") {
        const typed =
          session.kind === "panel"
            ? (session.id as LayoutColumnPanel)
            : null;
        const rects =
          liveWidths && layoutSettings
            ? computePanelGeometry(layoutSettings, liveWidths)
            : collectPanelHitRects(session.panels);
        panelHitRects = rects;
        const intent = resolveDropIntent(
          layoutSettings.layoutSlots.columnOrder,
          rects,
          clientX,
          // Separators never replace columns — null forces insert-zone resolution.
          session.kind === "separator" ? null : typed,
        );
        session.pendingDrop = intent;
        if (session.pendingDrop) {
          applyDropPreview(host, session.pendingDrop, {
            kind: session.kind,
            id: session.id,
          });
        }
        return;
      }

      const side = session.id as PagePadSide;
      const opposite: PagePadSide = side === "left" ? "right" : "left";
      const oppFrame = host.querySelector(
        `.readit-layout-frame[data-kind="pad"][data-id="${opposite}"]`,
      ) as HTMLElement | null;
      const shell = document.querySelector(
        "[data-readit-layout-shell]",
      ) as HTMLElement | null;
      const mid = shell
        ? shell.getBoundingClientRect().left +
          shell.getBoundingClientRect().width / 2
        : window.innerWidth / 2;
      const overOpposite = side === "left" ? clientX > mid : clientX < mid;
      session.pendingPadTarget = overOpposite ? opposite : null;
      if (overOpposite && oppFrame) oppFrame.dataset.drop = "1";
      return;
    }

    if (!resizeSession) return;
    if (resizeSession.type === "pad") {
      const desired =
        resizeSession.startPad +
        (resizeSession.side === "left"
          ? clientX - resizeSession.startX
          : resizeSession.startX - clientX);
      liveWidths = mirrorStackedWidths(
        resizePadInBudget(
          resizeSession.baseline,
          resizeSession.panels,
          resizeSession.side,
          desired,
          viewportBudgetPx(),
          separatorExtraPx(layoutSettings),
          widthLockSet(layoutSettings.layoutSlots.widthLocks),
          separatorTrackCount(layoutSettings),
        ),
        layoutSettings.layoutSlots.placements,
      );
      applyLiveColumnWidths(layoutSettings, liveWidths);
      schedulePlaceHandles(layoutSettings);
      return;
    }

    if (resizeSession.type === "separator") {
      const sepId = resizeSession.id;
      // Right edge: grow/shrink naturally (right edge moves).
      // Left edge: pin the right edge by trading width with the left neighbor
      // panel — otherwise grid growth always moves the separator's right side.
      const delta =
        resizeSession.edge === "right"
          ? clientX - resizeSession.startX
          : resizeSession.startX - clientX;
      const desired = clampSeparatorWidth(resizeSession.startW + delta);
      let applied = desired - resizeSession.startW;
      let seps = (layoutSettings.layoutSlots.separators || []).map((s) =>
        s.id === sepId ? { ...s, widthPx: desired } : s,
      );
      if (resizeSession.edge === "left" && applied !== 0) {
        const neighborStart = panelWidthPx(
          resizeSession.leftPanel,
          resizeSession.baseline,
        );
        const tentativeExtras = seps.reduce(
          (sum, s) => sum + clampSeparatorWidth(s.widthPx),
          0,
        );
        liveWidths = mirrorStackedWidths(
          resizePanelInBudget(
            resizeSession.baseline,
            resizeSession.panels,
            resizeSession.leftPanel,
            neighborStart - applied,
            viewportBudgetPx(),
            "right",
            tentativeExtras,
            widthLockSet(layoutSettings.layoutSlots.widthLocks),
          ),
          layoutSettings.layoutSlots.placements,
        );
        const neighborAfter = panelWidthPx(
          resizeSession.leftPanel,
          liveWidths,
        );
        // Only keep the sep delta the neighbor actually absorbed so the
        // separator's right edge stays pinned when the neighbor is locked/minned.
        const actualTrade = neighborStart - neighborAfter;
        const corrected = clampSeparatorWidth(
          resizeSession.startW + actualTrade,
        );
        applied = corrected - resizeSession.startW;
        seps = (layoutSettings.layoutSlots.separators || []).map((s) =>
          s.id === sepId ? { ...s, widthPx: corrected } : s,
        );
        layoutSettings = {
          ...layoutSettings,
          layoutSlots: {
            ...layoutSettings.layoutSlots,
            separators: seps,
            preset: "custom",
          },
        };
        applyLiveColumnWidths(layoutSettings, liveWidths);
      } else {
        layoutSettings = {
          ...layoutSettings,
          layoutSlots: {
            ...layoutSettings.layoutSlots,
            separators: seps,
            preset: "custom",
          },
        };
        liveWidths = applyFittedShellWidths(layoutSettings, "overflow");
      }
      schedulePlaceHandles(layoutSettings);
      return;
    }

    const delta =
      resizeSession.edge === "right"
        ? clientX - resizeSession.startX
        : resizeSession.startX - clientX;
    liveWidths = mirrorStackedWidths(
      resizePanelInBudget(
        resizeSession.baseline,
        resizeSession.panels,
        resizeSession.panel,
        resizeSession.startW + delta,
        viewportBudgetPx(),
        resizeSession.edge,
        separatorExtraPx(layoutSettings),
        widthLockSet(layoutSettings.layoutSlots.widthLocks),
        separatorTrackCount(layoutSettings),
      ),
      layoutSettings.layoutSlots.placements,
    );
    applyLiveColumnWidths(layoutSettings, liveWidths);
    schedulePlaceHandles(layoutSettings);
  };

  const onDragUp = () => {
    if (columnDragSession) {
      finishColumnDrag();
      return;
    }
    if (resizeSession) finishResize();
  };

  const onBridgePointer = (ev: Event) => {
    const detail = (ev as CustomEvent).detail as
      | { type?: string; clientX?: number; clientY?: number }
      | undefined;
    if (!detail?.type) return;
    if (detail.type === "move") {
      onDragMove(ev as CustomEvent);
      return;
    }
    if (detail.type === "up") onDragUp();
  };

  const onBridgeAttr = () => {
    const raw = document.documentElement.getAttribute("data-readit-pointer");
    if (!raw) return;
    const [type, xStr, yStr] = raw.split(":");
    const clientX = Number(xStr);
    const clientY = Number(yStr);
    if (type === "move" && Number.isFinite(clientX)) {
      onDragMove(
        new CustomEvent("readit-bridge-pointer", {
          detail: { type: "move", clientX, clientY },
        }),
      );
      return;
    }
    if (type === "up") onDragUp();
  };

  const bridgeAttrObserver = new MutationObserver(onBridgeAttr);

  const onScrollOrResize = () => {
    if (layoutSettings && !columnDragging) schedulePlaceHandles(layoutSettings);
  };

  // Chrome (this extension's only target) dispatches PointerEvent for every
  // mouse interaction — binding the legacy mouse* events too made every drag
  // tick and drag-end fire twice.
  const host = ensureResizeHost();
  host.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onDragMove, true);
  window.addEventListener("pointerup", onDragUp, true);
  window.addEventListener("pointercancel", onDragUp, true);
  document.documentElement.addEventListener(
    "readit-bridge-pointer",
    onBridgePointer,
    true,
  );
  bridgeAttrObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-readit-pointer"],
  });
  window.addEventListener("scroll", onScrollOrResize, true);

  resizeCleanup = () => {
    host.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onDragMove, true);
    window.removeEventListener("pointerup", onDragUp, true);
    window.removeEventListener("pointercancel", onDragUp, true);
    document.documentElement.removeEventListener(
      "readit-bridge-pointer",
      onBridgePointer,
      true,
    );
    bridgeAttrObserver.disconnect();
    window.removeEventListener("scroll", onScrollOrResize, true);
    document.documentElement.removeAttribute("data-readit-pointer");
    window.cancelAnimationFrame(placeHandlesRaf);
    document.documentElement.classList.remove(
      "readit-col-resizing",
      "readit-col-dragging",
    );
    columnDragSession = null;
    resizeSession = null;
    removeResizeHost();
    resizeListenersBound = false;
    resizeDragging = false;
    columnDragging = false;
  };
}

function teardownLayoutGeometry(): void {
  resizeCleanup?.();
  resizeCleanup = null;
  fitCleanup?.();
  fitCleanup = null;
  teardownLayoutRecoveryObserver();
  teardownStackRailObserver();
  clearLiveColumnOverrides();
  liveWidths = null;
  layoutSettings = null;
  panelHitRects = [];
  removeResizeHost();
  if (editSelection.size) {
    editSelection.clear();
    emitEditSelection();
  }
}

/** Last preset apply() saw — a preset switch invalidates any edit-toolbox selection. */
let lastAppliedPreset: string | null = null;

export const layoutSlotsFeature: FeatureModule = {
  id: "layoutSlots",
  tier: "simple",
  audience: ["reader", "creator", "moderator"],
  category: "layout",
  label: "Layout slots",
  description:
    "Permute and resize nav / feed / right rail (panel-owned widths).",
  apply(ctx) {
    if (!ctx.settings.flags.layoutSlots || ctx.settings.paused) {
      clearLayoutSlotMarks();
      document.documentElement.classList.remove(
        "readit-layout-edit",
        "readit-layout-degraded",
        "readit-layout-pending",
        "readit-col-resizing",
        "readit-col-dragging",
        "readit-nav-compact",
        "readit-rail-compact",
      );
      unmountNavRail();
      delete document.documentElement.dataset.readitLayout;
      delete document.documentElement.dataset.readitColumns;
      teardownLayoutGeometry();
      return;
    }
    if (
      lastAppliedPreset !== null &&
      lastAppliedPreset !== ctx.settings.layoutSlots.preset &&
      editSelection.size
    ) {
      editSelection.clear();
      emitEditSelection();
    }
    lastAppliedPreset = ctx.settings.layoutSlots.preset;
    const resolved = stampLayoutSlots();
    const health = layoutSlotsHealth(resolved);
    const ready = layoutChromeReady(resolved);
    document.documentElement.dataset.readitLayout =
      ctx.settings.layoutSlots.preset;
    document.documentElement.dataset.readitColumns =
      normalizeColumnOrder(ctx.settings.layoutSlots.columnOrder).join(",");
    document.documentElement.classList.toggle(
      "readit-layout-edit",
      ctx.settings.layoutSlots.editMode,
    );
    document.documentElement.classList.toggle(
      "readit-layout-degraded",
      health === "degraded" || health === "broken",
    );
    document.documentElement.classList.toggle(
      "readit-layout-pending",
      !ready,
    );
    mountLayoutRecoveryObserver(ctx.settings);
    mountViewportFit(ctx.settings);
    mountColumnResize(ctx.settings);
    if (!ready) {
      document.documentElement.style.removeProperty("--readit-grid-cols");
      document.documentElement.classList.remove("readit-nav-compact");
      scheduleLayoutRecovery(ctx.settings, 40);
      startLayoutRecoveryPoll(ctx.settings, 3000);
      return;
    }
    if (
      ctx.settings.layoutSlots.widths.leftNavPx <= NAV_COMPACT_MAX_PX ||
      document.documentElement.classList.contains("readit-nav-compact") ||
      navRailNeedsRemount()
    ) {
      mountNavRail();
    }
    // Keep polling through Reddit's delayed shell replacement.
    startLayoutRecoveryPoll(ctx.settings, 2800);
  },
  teardown() {
    clearLayoutSlotMarks();
    delete document.documentElement.dataset.readitLayout;
    delete document.documentElement.dataset.readitColumns;
    document.documentElement.classList.remove(
      "readit-layout-edit",
      "readit-layout-degraded",
      "readit-layout-pending",
      "readit-col-resizing",
      "readit-col-dragging",
      "readit-nav-compact",
      "readit-rail-compact",
    );
    unmountNavRail();
    teardownLayoutGeometry();
  },
  health: () => layoutSlotsHealth(resolveSlots()),
};

