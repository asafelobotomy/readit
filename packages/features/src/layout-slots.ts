import type {
  FeatureHealth,
  LayoutColumnPanel,
  LayoutSlotId,
  LayoutSlotsConfig,
  LayoutZone,
  ReaditSettings,
} from "@readit/schema";
import {
  applyLayoutPreset,
  fitLayoutWidths,
  movePanelToIndex,
  normalizeColumnOrder,
  placementsFromColumnOrder,
  presetToColumnOrder,
  presetToPlacements,
  resizePadInBudget,
  resizePanelInBudget,
  swapColumnPanels,
  type LayoutWidthBudget,
} from "@readit/schema";
import type { FeatureModule } from "./utils.js";

export type SlotDefinition = {
  id: LayoutSlotId;
  label: string;
  selectors: string[];
};

/** Stable New Reddit chrome landmarks (not feed posts). */
export const LAYOUT_SLOTS: readonly SlotDefinition[] = [
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
type FrameKind = "panel" | "pad";

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

function applyLiveColumnWidths(
  settings: ReaditSettings,
  live: LiveWidths,
): void {
  const root = document.documentElement;
  root.style.setProperty("--readit-left-nav-width", `${live.leftNavPx}px`);
  root.style.setProperty("--readit-right-rail-width", `${live.rightRailPx}px`);
  root.style.setProperty("--readit-feed-width", `${live.feedWidthPx}px`);
  root.style.setProperty("--readit-page-pad-left", `${live.pagePadLeftPx}px`);
  root.style.setProperty("--readit-page-pad-right", `${live.pagePadRightPx}px`);
  root.style.setProperty("--readit-column-gap", `${live.columnGapPx}px`);
  const tracks = visibleColumnPanels(settings)
    .map((id) => `${panelWidthPx(id, live)}px`)
    .join(" ");
  if (tracks) root.style.setProperty("--readit-grid-cols", tracks);
  const shell = document.querySelector(
    "[data-readit-layout-shell]",
  ) as HTMLElement | null;
  if (!shell) return;
  // Prefer the CSS var (beats stylesheet !important literals via var()).
  shell.style.removeProperty("grid-template-columns");
  shell.style.paddingLeft = `${live.pagePadLeftPx}px`;
  shell.style.paddingRight = `${live.pagePadRightPx}px`;
}

/** Fit current settings to the viewport and paint CSS vars / shell tracks. */
export function applyFittedShellWidths(settings: ReaditSettings): LiveWidths {
  const fitted = fitLayoutWidths(
    widthsFromSettings(settings),
    visibleColumnPanels(settings),
    viewportBudgetPx(),
  );
  applyLiveColumnWidths(settings, fitted);
  return fitted;
}

function clearLiveColumnOverrides(): void {
  const root = document.documentElement;
  root.style.removeProperty("--readit-grid-cols");
  const shell = document.querySelector(
    "[data-readit-layout-shell]",
  ) as HTMLElement | null;
  if (!shell) return;
  shell.style.removeProperty("grid-template-columns");
  shell.style.removeProperty("padding-left");
  shell.style.removeProperty("padding-right");
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
  shell: HTMLElement,
  padPx: number,
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
  const r = shell.getBoundingClientRect();
  if (r.width < 8 || r.height < 8 || padPx < 4) {
    handle.style.display = "none";
    return;
  }
  handle.style.display = "block";
  handle.style.left =
    side === "left"
      ? `${Math.round(r.left + padPx - 5)}px`
      : `${Math.round(r.right - padPx - 5)}px`;
  handle.style.top = `${Math.round(r.top)}px`;
  handle.style.height = `${Math.round(Math.min(r.height, window.innerHeight - r.top))}px`;
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
        ? `Drag to move ${labelText}`
        : `Drag to swap ${labelText} with the other pad`;
    label.setAttribute(
      "aria-label",
      kind === "panel"
        ? `Move ${labelText} column`
        : `Move ${labelText}`,
    );
    frame.appendChild(label);
    host.appendChild(frame);
  } else {
    const label = frame.querySelector(".readit-frame-label");
    if (label && label.textContent !== labelText) label.textContent = labelText;
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
    host.appendChild(line);
  }
  return line;
}

function placeEditChrome(settings: ReaditSettings): void {
  if (!settings.layoutSlots.editMode) {
    removeResizeHost();
    return;
  }
  const host = ensureResizeHost();
  const panels = visibleColumnPanels(settings);
  const needed = new Set(panels.map(String));
  for (const el of [...host.querySelectorAll(".readit-col-resize")]) {
    const id = el.getAttribute("data-readit-resize");
    if (!id || !needed.has(id)) el.remove();
  }
  for (const el of [...host.querySelectorAll('.readit-layout-frame[data-kind="panel"]')]) {
    const id = el.getAttribute("data-id");
    if (!id || !needed.has(id)) el.remove();
  }

  const panelRects: { panel: LayoutColumnPanel; mid: number; left: number; right: number; top: number; bottom: number }[] =
    [];

  for (const panel of panels) {
    let handle = host.querySelector(
      `.readit-col-resize[data-readit-resize="${panel}"]`,
    ) as HTMLButtonElement | null;
    if (!handle) {
      handle = document.createElement("button");
      handle.type = "button";
      handle.className = "readit-col-resize";
      handle.dataset.readitResize = panel;
      handle.setAttribute("aria-label", `Resize ${COLUMN_PANEL_LABELS[panel]}`);
      handle.title = `Drag edge to resize ${COLUMN_PANEL_LABELS[panel]}`;
      host.appendChild(handle);
    }
    const slot = document.querySelector(`[data-readit-slot="${panel}"]`);
    if (!(slot instanceof HTMLElement)) {
      handle.style.display = "none";
      const stale = host.querySelector(
        `.readit-layout-frame[data-kind="panel"][data-id="${panel}"]`,
      );
      if (stale instanceof HTMLElement) stale.style.display = "none";
      continue;
    }
    const r = slot.getBoundingClientRect();
    const top = Math.max(0, r.top);
    const height = Math.min(r.bottom, window.innerHeight) - top;
    if (r.width < 8 || height < 8) {
      handle.style.display = "none";
      const stale = host.querySelector(
        `.readit-layout-frame[data-kind="panel"][data-id="${panel}"]`,
      );
      if (stale instanceof HTMLElement) stale.style.display = "none";
      continue;
    }
    handle.style.display = "block";
    handle.style.left = `${Math.round(r.right - 5)}px`;
    handle.style.top = `${Math.round(top)}px`;
    handle.style.height = `${Math.round(height)}px`;

    const frame = ensureFrame(
      host,
      "panel",
      panel,
      COLUMN_PANEL_LABELS[panel],
    );
    positionFrame(frame, r.left, top, r.width, height);
    panelRects.push({
      panel,
      mid: r.left + r.width / 2,
      left: r.left,
      right: r.right,
      top,
      bottom: top + height,
    });
  }

  const shell = document.querySelector(
    "[data-readit-layout-shell]",
  ) as HTMLElement | null;
  if (shell && liveWidths) {
    const r = shell.getBoundingClientRect();
    const top = Math.max(0, r.top);
    const height = Math.min(r.bottom, window.innerHeight) - top;
    const leftPad = liveWidths.pagePadLeftPx;
    const rightPad = liveWidths.pagePadRightPx;

    placePadHandle(host, "left", shell, leftPad);
    placePadHandle(host, "right", shell, rightPad);

    const leftFrame = ensureFrame(
      host,
      "pad",
      "left",
      leftPad < 72 ? "L" : "Left pad",
    );
    positionFrame(leftFrame, r.left, top, leftPad, height);
    const rightFrame = ensureFrame(
      host,
      "pad",
      "right",
      rightPad < 72 ? "R" : "Right pad",
    );
    positionFrame(rightFrame, r.right - rightPad, top, rightPad, height);
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
  pendingDropIndex: number;
  pendingPadTarget: PagePadSide | null;
};

let columnDragSession: ColumnDragSession | null = null;

type ResizeSession =
  | {
      type: "panel";
      panel: LayoutColumnPanel;
      panels: LayoutColumnPanel[];
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
    };

let resizeSession: ResizeSession | null = null;

function syncLiveWidthsFromSettings(settings: ReaditSettings): void {
  if (resizeDragging || columnDragging) return;
  liveWidths = applyFittedShellWidths(settings);
}

function mountViewportFit(settings: ReaditSettings): void {
  layoutSettings = settings;
  stampLayoutSlots();
  syncLiveWidthsFromSettings(settings);

  if (fitCleanup) return;
  const onViewportResize = () => {
    if (!layoutSettings || resizeDragging || columnDragging) return;
    liveWidths = applyFittedShellWidths(layoutSettings);
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

function dropIndexForX(
  panels: LayoutColumnPanel[],
  rects: { panel: LayoutColumnPanel; mid: number }[],
  clientX: number,
  dragging: LayoutColumnPanel,
): number {
  if (rects.length === 0) return panels.indexOf(dragging);
  // Insert relative to midpoints of other columns (stable while dragging).
  const others = rects.filter((r) => r.panel !== dragging);
  let index = 0;
  for (const r of others) {
    if (clientX > r.mid) index += 1;
  }
  return Math.max(0, Math.min(panels.length - 1, index));
}

function clearDropHints(host: HTMLElement): void {
  for (const el of host.querySelectorAll(".readit-layout-frame[data-drop]")) {
    el.removeAttribute("data-drop");
  }
  for (const el of host.querySelectorAll(".readit-layout-frame[data-dragging]")) {
    el.removeAttribute("data-dragging");
  }
  const line = host.querySelector(".readit-drop-line") as HTMLElement | null;
  if (line) line.style.display = "none";
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
      const from = session.panels.indexOf(typed);
      if (
        from >= 0 &&
        session.pendingDropIndex >= 0 &&
        session.pendingDropIndex !== from
      ) {
        const nextOrder = movePanelToIndex(
          layoutSettings.layoutSlots.columnOrder,
          typed,
          session.pendingDropIndex,
        );
        window.dispatchEvent(
          new CustomEvent("readit:layout-order", {
            detail: { columnOrder: nextOrder } satisfies LayoutOrderPersistDetail,
          }),
        );
      }
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
    resizeSession = null;
    if (!liveWidths) {
      resizeDragging = false;
      return;
    }
    const detail: LayoutWidthsPersistDetail = { ...liveWidths };
    resizeDragging = false;
    window.dispatchEvent(new CustomEvent("readit:layout-widths", { detail }));
  };

  const onPointerDown = (ev: PointerEvent | MouseEvent) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement) || !liveWidths || !layoutSettings) return;
    if (columnDragSession || resizeSession) return;
    const panels = visibleColumnPanels(layoutSettings);
    const host = ensureResizeHost();

    const label = t.closest(".readit-frame-label") as HTMLElement | null;
    if (label) {
      const kind = label.dataset.kind as FrameKind | undefined;
      const id = label.dataset.id;
      if (!kind || !id) return;
      ev.preventDefault();
      ev.stopPropagation();
      const dragFrame = host.querySelector(
        `.readit-layout-frame[data-kind="${kind}"][data-id="${id}"]`,
      ) as HTMLElement | null;
      if (dragFrame) dragFrame.dataset.dragging = "1";
      columnDragging = true;
      document.documentElement.classList.add("readit-col-dragging");
      host.dataset.readitDragging = `${kind}:${id}`;
      columnDragSession = {
        kind,
        id,
        panels,
        dragFrame,
        pendingDropIndex:
          kind === "panel" ? panels.indexOf(id as LayoutColumnPanel) : -1,
        pendingPadTarget: null,
      };
      return;
    }

    const padHandle = t.closest(".readit-pad-resize") as HTMLElement | null;
    if (padHandle) {
      const side = padHandle.dataset.readitPad as PagePadSide | undefined;
      if (!side) return;
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
        baseline: { ...liveWidths },
      };
      return;
    }

    const handle = t.closest(".readit-col-resize") as HTMLElement | null;
    if (!handle) return;
    const panel = handle.dataset.readitResize as LayoutColumnPanel | undefined;
    if (!panel) return;
    ev.preventDefault();
    ev.stopPropagation();
    resizeDragging = true;
    handle.dataset.active = "1";
    document.documentElement.classList.add("readit-col-resizing");
    resizeSession = {
      type: "panel",
      panel,
      panels,
      startX: ev.clientX,
      startW: panelWidthPx(panel, liveWidths),
      baseline: { ...liveWidths },
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
          pendingDropIndex:
            kind === "panel" ? panels.indexOf(id as LayoutColumnPanel) : -1,
          pendingPadTarget: null,
        };
        columnDragging = true;
      }
    }

    if (!columnDragSession && !resizeSession) return;

    if (columnDragSession) {
      const session = columnDragSession;
      clearDropHints(host);
      if (session.dragFrame) session.dragFrame.dataset.dragging = "1";
      if (session.kind === "panel") {
        const typed = session.id as LayoutColumnPanel;
        const rects = collectPanelHitRects(session.panels);
        panelHitRects = rects;
        session.pendingDropIndex = dropIndexForX(
          session.panels,
          rects,
          clientX,
          typed,
        );
        const from = session.panels.indexOf(typed);
        const line = ensureDropLine(host);
        if (session.pendingDropIndex === from || rects.length === 0) {
          line.style.display = "none";
          return;
        }
        const ordered = [...rects].sort((a, b) => a.left - b.left);
        const x =
          session.pendingDropIndex >= ordered.length
            ? ordered[ordered.length - 1]!.right
            : ordered[session.pendingDropIndex]!.left;
        const top = ordered[0]?.top ?? 0;
        const bottom = ordered[0]?.bottom ?? window.innerHeight;
        line.style.display = "block";
        line.style.left = `${Math.round(x - 1)}px`;
        line.style.top = `${Math.round(top)}px`;
        line.style.height = `${Math.round(bottom - top)}px`;
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
      liveWidths = resizePadInBudget(
        resizeSession.baseline,
        resizeSession.panels,
        resizeSession.side,
        desired,
        viewportBudgetPx(),
      );
      applyLiveColumnWidths(layoutSettings, liveWidths);
      schedulePlaceHandles(layoutSettings);
      return;
    }

    liveWidths = resizePanelInBudget(
      resizeSession.baseline,
      resizeSession.panels,
      resizeSession.panel,
      resizeSession.startW + (clientX - resizeSession.startX),
      viewportBudgetPx(),
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

  const host = ensureResizeHost();
  host.addEventListener("pointerdown", onPointerDown);
  host.addEventListener("mousedown", onPointerDown);
  window.addEventListener("pointermove", onDragMove, true);
  window.addEventListener("mousemove", onDragMove, true);
  window.addEventListener("pointerup", onDragUp, true);
  window.addEventListener("mouseup", onDragUp, true);
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
    host.removeEventListener("mousedown", onPointerDown);
    window.removeEventListener("pointermove", onDragMove, true);
    window.removeEventListener("mousemove", onDragMove, true);
    window.removeEventListener("pointerup", onDragUp, true);
    window.removeEventListener("mouseup", onDragUp, true);
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
  clearLiveColumnOverrides();
  liveWidths = null;
  layoutSettings = null;
  panelHitRects = [];
  removeResizeHost();
}

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
        "readit-col-resizing",
        "readit-col-dragging",
      );
      delete document.documentElement.dataset.readitLayout;
      delete document.documentElement.dataset.readitColumns;
      teardownLayoutGeometry();
      return;
    }
    const resolved = stampLayoutSlots();
    const health = layoutSlotsHealth(resolved);
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
    mountViewportFit(ctx.settings);
    mountColumnResize(ctx.settings);
  },
  teardown() {
    clearLayoutSlotMarks();
    delete document.documentElement.dataset.readitLayout;
    delete document.documentElement.dataset.readitColumns;
    document.documentElement.classList.remove(
      "readit-layout-edit",
      "readit-layout-degraded",
      "readit-col-resizing",
      "readit-col-dragging",
    );
    teardownLayoutGeometry();
  },
  health: () => layoutSlotsHealth(resolveSlots()),
};

