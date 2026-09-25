/**
 * Unit checks for layout slot presets + CSS recipes + keyboard focus guard.
 * Run: npm run test:layout
 */
import assert from "node:assert/strict";
import { buildStylesheet, LAYOUT_RECIPE_MARKER } from "../packages/css-engine/src/index.ts";
import { isEditableTarget } from "../packages/features/src/reader-creator.ts";
import {
  applyLayoutPreset,
  applyLayoutPresetToSettings,
  addLayoutSeparator,
  moveLayoutSeparator,
  removeLayoutSeparator,
  layoutSlotsHealth,
  presetToPlacements,
  resolveSlots,
  setSlotZone,
  swapLayoutColumns,
} from "../packages/features/src/layout-slots.ts";
import {
  classifyNavSection,
  modelFingerprint,
  type NavModel,
} from "../packages/features/src/nav-rail.ts";
import {
  applyProfile,
  panelContentAlign,
  fillPadsForAlign,
  shellZoomFactor,
  BUILTIN_PROFILES,
  buildLayoutTracks,
  clampColumnGap,
  clampPagePad,
  clampPanelWidth,
  createDefaultSettings,
  fitLayoutWidths,
  formatProfileLayoutBlurb,
  budgetColumnOrder,
  isStackedPair,
  LAYOUT_WIDTH_LIMITS,
  mirrorStackedWidths,
  previewImport,
  resizePadInBudget,
  resizePanelInBudget,
  centerPadsInViewport,
  fitOverflowOnly,
  widthLockSet,
  SETTINGS_VERSION,
  insertPanelAtIndex,
  movePanelToIndex,
  swapColumnPanels,
} from "../packages/schema/src/index.ts";

let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`pass  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`fail  ${name}`);
    console.error(err);
  }
}

check("presetToPlacements classic", () => {
  const p = presetToPlacements("classic");
  assert.equal(p.leftNav, "left");
  assert.equal(p.main, "center");
  assert.equal(p.rightRail, "right");
});

check("presetToPlacements navRight", () => {
  const p = presetToPlacements("navRight");
  assert.equal(p.leftNav, "right");
  assert.equal(p.rightRail, "left");
  assert.equal(p.main, "center");
});

check("presetToPlacements singleColumn", () => {
  const p = presetToPlacements("singleColumn");
  assert.equal(p.leftNav, "hidden");
  assert.equal(p.rightRail, "hidden");
});

check("presetToPlacements dualLeft", () => {
  const p = presetToPlacements("dualLeft");
  assert.equal(p.leftNav, "stackedLeft");
  assert.equal(p.rightRail, "stackedLeft");
});

check("isStackedPair detects dual presets only", () => {
  assert.equal(isStackedPair(presetToPlacements("dualLeft")), true);
  assert.equal(isStackedPair(presetToPlacements("dualRight")), true);
  assert.equal(isStackedPair(presetToPlacements("classic")), false);
  assert.equal(isStackedPair(presetToPlacements("navRight")), false);
  // Hiding one panel breaks the pair — graceful fallback to normal columns.
  const partial = { ...presetToPlacements("dualLeft"), rightRail: "hidden" as const };
  assert.equal(isStackedPair(partial), false);
});

check("mirrorStackedWidths + budgetColumnOrder exclude the mirrored panel", () => {
  const placements = presetToPlacements("dualLeft");
  const widths = {
    leftNavPx: 220,
    rightRailPx: 350,
    feedWidthPx: 600,
    pagePadLeftPx: 24,
    pagePadRightPx: 24,
    columnGapPx: 12,
  };
  const mirrored = mirrorStackedWidths(widths, placements);
  // Shared stack column can't go below the rail's readable floor (240).
  assert.equal(mirrored.rightRailPx, 240);
  assert.equal(mirrored.leftNavPx, 240);
  const wide = mirrorStackedWidths({ ...widths, leftNavPx: 300 }, placements);
  assert.equal(wide.leftNavPx, 300);
  assert.equal(wide.rightRailPx, 300);

  const order = budgetColumnOrder(["leftNav", "main", "rightRail"], placements);
  assert.deepEqual(order, ["leftNav", "main"]);

  const classicPlacements = presetToPlacements("classic");
  assert.deepEqual(
    budgetColumnOrder(["leftNav", "main", "rightRail"], classicPlacements),
    ["leftNav", "main", "rightRail"],
  );
  assert.equal(mirrorStackedWidths(widths, classicPlacements).rightRailPx, 350);
});

check("applyLayoutPreset dual mirrors rail width + clears stack zoom", () => {
  const base = createDefaultSettings().layoutSlots;
  base.widths = { ...base.widths, leftNavPx: 240, rightRailPx: 400 };
  base.zoomByPanel = { leftNav: 1.1, main: 1.05, rightRail: 1.2 };
  const dual = applyLayoutPreset(base, "dualLeft");
  assert.equal(dual.widths.leftNavPx, 240);
  assert.equal(dual.widths.rightRailPx, 240);
  assert.equal(dual.zoomByPanel?.leftNav, 1);
  assert.equal(dual.zoomByPanel?.rightRail, 1);
  assert.equal(dual.zoomByPanel?.main, 1.05);

  const classic = applyLayoutPreset(
    { ...base, widths: { ...base.widths, leftNavPx: 240, rightRailPx: 400 } },
    "classic",
  );
  assert.equal(classic.widths.rightRailPx, 400);
});

check("resolveSlots fixture", () => {
  const doc = {
    querySelector(sel: string) {
      if (sel === "#left-sidebar-container") return { id: "left" };
      if (sel === "#main-content") return { id: "main" };
      return null;
    },
  } as unknown as ParentNode;
  const resolved = resolveSlots(doc);
  assert.equal(resolved.find((s) => s.id === "leftNav")?.health, "ok");
  assert.equal(resolved.find((s) => s.id === "main")?.health, "ok");
  assert.equal(resolved.find((s) => s.id === "rightRail")?.health, "degraded");
  assert.equal(layoutSlotsHealth(resolved), "degraded");
});

check("CSS navRight recipe", () => {
  const settings = createDefaultSettings();
  settings.flags.layoutSlots = true;
  settings.layoutSlots = applyLayoutPreset(settings.layoutSlots, "navRight");
  const css = buildStylesheet(settings);
  assert.ok(css.includes(LAYOUT_RECIPE_MARKER));
  assert.match(css, /readit-layout:columns/);
  assert.match(css, /rightRail\|main\|leftNav/);
  assert.match(css, /display: contents/);
  assert.deepEqual(settings.layoutSlots.columnOrder, [
    "rightRail",
    "main",
    "leftNav",
  ]);
});

check("CSS singleColumn recipe", () => {
  const settings = createDefaultSettings();
  settings.flags.layoutSlots = true;
  settings.layoutSlots = applyLayoutPreset(
    settings.layoutSlots,
    "singleColumn",
  );
  const css = buildStylesheet(settings);
  assert.match(css, /readit-layout:singleColumn/);
  assert.match(css, /#left-sidebar-container/);
  assert.match(css, /#right-sidebar-container/);
  assert.match(css, /display: none !important/);
});

check("CSS dualLeft recipe", () => {
  const settings = createDefaultSettings();
  settings.flags.layoutSlots = true;
  settings.layoutSlots = applyLayoutPreset(settings.layoutSlots, "dualLeft");
  const css = buildStylesheet(settings);
  assert.match(css, /readit-layout:stacked dualLeft/);
  assert.match(
    css,
    /grid-template-columns: var\(--readit-grid-cols, var\(--readit-page-pad-left, 24px\) var\(--readit-left-nav-width\) var\(--readit-feed-width\) var\(--readit-page-pad-right, 24px\)\) !important/,
  );
  assert.match(css, /grid-template-rows: auto !important/);
  assert.match(
    css,
    /\[data-readit-slot="leftNav"\] \{\n\s*grid-row: 1 !important/,
  );
  // rightRail is taken out of grid flow (position:absolute) so its height
  // never inflates the shared row's track — see syncStackedRailOffset.
  assert.match(
    css,
    /\[data-readit-slot="rightRail"\] \{[\s\S]*?grid-column: 2 \/ span 1 !important;\n\s*grid-row: 1 \/ span 1 !important;\n\s*position: absolute !important;\n\s*top: var\(--readit-stack-rail-top, 0px\) !important/,
  );
  // Shared stack width — rail must use the nav width var (not 100% / rail var).
  assert.match(
    css,
    /\[data-readit-slot="rightRail"\] \{[\s\S]*?width: var\(--readit-left-nav-width\) !important/,
  );
  assert.match(css, /\[data-readit-slot="main"\][\s\S]*?grid-row: 1 !important/);
});

check("CSS dualRight recipe", () => {
  const settings = createDefaultSettings();
  settings.flags.layoutSlots = true;
  settings.layoutSlots = applyLayoutPreset(settings.layoutSlots, "dualRight");
  const css = buildStylesheet(settings);
  assert.match(css, /readit-layout:stacked dualRight/);
  assert.match(
    css,
    /grid-template-columns: var\(--readit-grid-cols, var\(--readit-page-pad-left, 24px\) var\(--readit-feed-width\) var\(--readit-left-nav-width\) var\(--readit-page-pad-right, 24px\)\) !important/,
  );
  assert.match(
    css,
    /\[data-readit-slot="rightRail"\] \{[\s\S]*?grid-column: 3 \/ span 1 !important;\n\s*grid-row: 1 \/ span 1 !important;\n\s*position: absolute !important/,
  );
  assert.match(
    css,
    /\[data-readit-slot="rightRail"\] \{[\s\S]*?width: var\(--readit-left-nav-width\) !important/,
  );
});

check("column swap helper", () => {
  const swapped = swapColumnPanels(
    ["leftNav", "main", "rightRail"],
    "main",
    "leftNav",
  );
  assert.deepEqual(swapped, ["main", "leftNav", "rightRail"]);
  const settings = createDefaultSettings();
  const next = swapLayoutColumns(settings.layoutSlots, "main", "rightRail");
  assert.deepEqual(next.columnOrder, ["leftNav", "rightRail", "main"]);
  assert.equal(next.preset, "custom");
  assert.equal(next.placements.main, "right");
  assert.equal(next.placements.rightRail, "center");
});

check("insertPanelAtIndex slots between without swap", () => {
  // finalIndex is post-removal: drag rightRail to front
  assert.deepEqual(
    insertPanelAtIndex(["leftNav", "main", "rightRail"], "rightRail", 0),
    ["rightRail", "leftNav", "main"],
  );
  // drag leftNav to end
  assert.deepEqual(
    insertPanelAtIndex(["leftNav", "main", "rightRail"], "leftNav", 2),
    ["main", "rightRail", "leftNav"],
  );
  // drag main between leftNav and rightRail (index 1 after removal)
  assert.deepEqual(
    insertPanelAtIndex(["leftNav", "main", "rightRail"], "main", 1),
    ["leftNav", "main", "rightRail"],
  );
  // drag main before leftNav
  assert.deepEqual(
    insertPanelAtIndex(["leftNav", "main", "rightRail"], "main", 0),
    ["main", "leftNav", "rightRail"],
  );
  // drag leftNav between main and rightRail (after removal index 1)
  assert.deepEqual(
    insertPanelAtIndex(["leftNav", "main", "rightRail"], "leftNav", 1),
    ["main", "leftNav", "rightRail"],
  );
});

check("movePanelToIndex swaps rather than shifts an untouched panel", () => {
  // rightRail -> zone "left" (index 0) must swap with leftNav only, leaving
  // main untouched — setSlotZone relies on this absolute-index swap.
  assert.deepEqual(
    movePanelToIndex(["leftNav", "main", "rightRail"], "rightRail", 0),
    ["rightRail", "main", "leftNav"],
  );
  assert.deepEqual(
    movePanelToIndex(["leftNav", "main", "rightRail"], "leftNav", 2),
    ["rightRail", "main", "leftNav"],
  );
});

check("setSlotZone moves only the targeted panel", () => {
  const settings = createDefaultSettings();
  const next = setSlotZone(settings.layoutSlots, "rightRail", "left");
  assert.deepEqual(next.columnOrder, ["rightRail", "main", "leftNav"]);
});

check("clampPanelWidth limits", () => {
  assert.equal(clampPanelWidth("leftNav", 20), 64);
  assert.equal(clampPanelWidth("leftNav", 500), 400);
  assert.equal(clampPanelWidth("main", 200), 480);
  assert.equal(clampPanelWidth("main", 2000), 1600);
  // Rail has no icon mode, so it keeps a readable floor above the nav's.
  assert.equal(clampPanelWidth("rightRail", 20), 240);
  assert.equal(clampPanelWidth("rightRail", 100), 240);
  assert.equal(clampPanelWidth("rightRail", 300), 300);
  assert.equal(clampPanelWidth("rightRail", 500), 400);
  assert.equal(LAYOUT_WIDTH_LIMITS.rightRail.min, 240);
  assert.equal(LAYOUT_WIDTH_LIMITS.leftNav.max, LAYOUT_WIDTH_LIMITS.rightRail.max);
});

check("page pad + column gap defaults and CSS", () => {
  const settings = createDefaultSettings();
  // Focus Reader recipe uses 48px pads; classic columns still expose pad CSS vars.
  assert.equal(settings.layoutSlots.widths.pagePadLeftPx, 48);
  assert.equal(settings.layoutSlots.widths.pagePadRightPx, 48);
  assert.equal(settings.layoutSlots.widths.columnGapPx, 12);
  assert.equal(clampPagePad(-10), 0);
  assert.equal(clampPagePad(999), 999);
  assert.equal(clampPagePad(2000), 1600);
  assert.equal(clampColumnGap(100), 48);
  settings.flags.layoutSlots = true;
  settings.layoutSlots = applyLayoutPreset(settings.layoutSlots, "classic");
  settings.layoutSlots.widths = {
    ...settings.layoutSlots.widths,
    pagePadLeftPx: 24,
    pagePadRightPx: 24,
    columnGapPx: 12,
  };
  const css = buildStylesheet(settings);
  assert.match(css, /--readit-page-pad-left:\s*24px/);
  assert.match(css, /--readit-page-pad-right:\s*24px/);
  assert.match(css, /--readit-column-gap:\s*12px/);
  assert.match(css, /padding-left:\s*0 !important/);
  assert.match(css, /var\(--readit-page-pad-left/);
  assert.match(css, /column-gap:\s*var\(--readit-column-gap/);
  assert.match(css, /readit-pad-resize/);
  assert.match(css, /--readit-grid-cols/);
  assert.match(css, /var\(--readit-grid-cols/);
  assert.match(css, /contain:\s*inline-size/);
});

check("fitLayoutWidths centers with equal pads and fills the viewport", () => {
  const order = ["leftNav", "main", "rightRail"] as const;
  const fitted = fitLayoutWidths(
    {
      leftNavPx: 200,
      rightRailPx: 200,
      feedWidthPx: 600,
      pagePadLeftPx: 24,
      pagePadRightPx: 24,
      columnGapPx: 12,
    },
    [...order],
    1600,
  );
  // 3 panels + 2 pads → 4 gaps
  const gaps = 48;
  const tracks =
    fitted.feedWidthPx + fitted.leftNavPx + fitted.rightRailPx + gaps;
  assert.equal(fitted.pagePadLeftPx, fitted.pagePadRightPx);
  assert.equal(
    fitted.pagePadLeftPx + fitted.pagePadRightPx + tracks,
    1600,
  );
  assert.ok(fitted.leftNavPx >= 64);
  assert.ok(fitted.rightRailPx >= 64);
  assert.ok(fitted.feedWidthPx >= 480);
});

check("fitLayoutWidths shrinks columns before starving equal pads on narrow viewports", () => {
  const order = ["main", "leftNav", "rightRail"] as const;
  const fitted = fitLayoutWidths(
    {
      leftNavPx: 420,
      rightRailPx: 420,
      feedWidthPx: 1100,
      pagePadLeftPx: 200,
      pagePadRightPx: 200,
      columnGapPx: 12,
    },
    [...order],
    1200,
  );
  const gaps = 24;
  const used =
    fitted.pagePadLeftPx +
    fitted.pagePadRightPx +
    gaps +
    fitted.feedWidthPx +
    fitted.leftNavPx +
    fitted.rightRailPx;
  assert.ok(used <= 1200, `used ${used} > 1200`);
  assert.equal(fitted.pagePadLeftPx, fitted.pagePadRightPx);
  assert.ok(fitted.leftNavPx >= 64);
  assert.ok(fitted.rightRailPx >= 64);
  assert.ok(fitted.feedWidthPx >= 480);
});

check("resizePanelInBudget shrinks neighbors to the right", () => {
  const order = ["main", "leftNav", "rightRail"] as const;
  const next = resizePanelInBudget(
    {
      leftNavPx: 300,
      rightRailPx: 300,
      feedWidthPx: 600,
      pagePadLeftPx: 24,
      pagePadRightPx: 24,
      columnGapPx: 12,
    },
    [...order],
    "main",
    900,
    1200,
  );
  const used =
    next.feedWidthPx +
    next.leftNavPx +
    next.rightRailPx +
    next.pagePadLeftPx +
    next.pagePadRightPx +
    24;
  assert.ok(used <= 1200);
  // Overflow fit may collapse the right pad first — equality is Center's job.
  assert.ok(next.pagePadLeftPx + next.pagePadRightPx <= 48);
  assert.ok(next.rightRailPx >= 64);
  assert.ok(next.leftNavPx >= 64);
  assert.ok(next.feedWidthPx <= 900);
});

check("resizePanelInBudget donates shrink to feed", () => {
  const order = ["leftNav", "main", "rightRail"] as const;
  const next = resizePanelInBudget(
    {
      leftNavPx: 272,
      rightRailPx: 316,
      feedWidthPx: 600,
      pagePadLeftPx: 24,
      pagePadRightPx: 24,
      columnGapPx: 12,
    },
    [...order],
    "leftNav",
    64,
    1920,
  );
  assert.equal(next.leftNavPx, 64);
  assert.equal(next.feedWidthPx, 600 + (272 - 64));
  assert.equal(next.rightRailPx, 316);
  assert.equal(next.pagePadLeftPx, next.pagePadRightPx);
});

check("resizePadInBudget shrink grows columns then keeps equal pads", () => {
  const order = ["leftNav", "main", "rightRail"] as const;
  const next = resizePadInBudget(
    {
      leftNavPx: 64,
      rightRailPx: 280,
      feedWidthPx: 700,
      pagePadLeftPx: 200,
      pagePadRightPx: 200,
      columnGapPx: 8,
    },
    [...order],
    "left",
    40,
    1920,
  );
  assert.equal(next.pagePadLeftPx, next.pagePadRightPx);
  assert.equal(next.pagePadLeftPx, 40);
  // Freed margin goes into feed (main) first.
  assert.ok(next.feedWidthPx > 700);
});

check("fitLayoutWidths can center min-size columns with large equal pads", () => {
  const order = ["leftNav", "main", "rightRail"] as const;
  const fitted = fitLayoutWidths(
    {
      leftNavPx: 64,
      rightRailPx: 64,
      feedWidthPx: 480,
      pagePadLeftPx: 24,
      pagePadRightPx: 24,
      columnGapPx: 12,
    },
    [...order],
    1920,
  );
  const gaps = 48;
  const tracks =
    fitted.leftNavPx + fitted.feedWidthPx + fitted.rightRailPx + gaps;
  assert.equal(fitted.pagePadLeftPx, fitted.pagePadRightPx);
  assert.equal(fitted.pagePadLeftPx + fitted.pagePadRightPx + tracks, 1920);
  assert.ok(fitted.pagePadLeftPx > 160);
  assert.ok(fitted.pagePadLeftPx <= LAYOUT_WIDTH_LIMITS.pagePad.max);
});

check("resizePanelInBudget can shrink pads so columns reach max", () => {
  const order = ["leftNav", "main", "rightRail"] as const;
  const next = resizePanelInBudget(
    {
      leftNavPx: 272,
      rightRailPx: 316,
      feedWidthPx: 600,
      pagePadLeftPx: 160,
      pagePadRightPx: 160,
      columnGapPx: 12,
    },
    [...order],
    "main",
    900,
    1600,
    "right",
  );
  assert.equal(next.feedWidthPx, 900);
  assert.ok(
    next.pagePadLeftPx + next.pagePadRightPx < 320 || next.leftNavPx < 272,
  );
});

check("resizePadInBudget grows mirrored pads by shrinking columns", () => {
  const order = ["leftNav", "main", "rightRail"] as const;
  const next = resizePadInBudget(
    {
      leftNavPx: 272,
      rightRailPx: 316,
      feedWidthPx: 700,
      pagePadLeftPx: 24,
      pagePadRightPx: 24,
      columnGapPx: 12,
    },
    [...order],
    "right",
    120,
    1400,
  );
  assert.equal(next.pagePadLeftPx, 120);
  assert.equal(next.pagePadRightPx, 120);
  const used =
    next.pagePadLeftPx +
    next.pagePadRightPx +
    24 +
    next.feedWidthPx +
    next.leftNavPx +
    next.rightRailPx;
  assert.ok(used <= 1400, `used ${used}`);
  assert.ok(next.rightRailPx <= 316);
  assert.ok(next.rightRailPx >= 64);
});

check("resizePadInBudget grow with free space keeps columns until pads need room", () => {
  const order = ["leftNav", "main", "rightRail"] as const;
  const next = resizePadInBudget(
    {
      leftNavPx: 64,
      rightRailPx: 280,
      feedWidthPx: 600,
      pagePadLeftPx: 24,
      pagePadRightPx: 24,
      columnGapPx: 12,
    },
    [...order],
    "right",
    100,
    1920,
  );
  // 100px pads fit without stealing — feed can grow into leftover instead.
  assert.equal(next.pagePadLeftPx, 100);
  assert.equal(next.pagePadRightPx, 100);
  assert.equal(next.rightRailPx, 280);
  assert.ok(next.feedWidthPx >= 600);
});

check("resizePanelInBudget shifts when free space remains", () => {
  const order = ["main", "leftNav", "rightRail"] as const;
  const next = resizePanelInBudget(
    {
      leftNavPx: 272,
      rightRailPx: 316,
      feedWidthPx: 600,
      pagePadLeftPx: 24,
      pagePadRightPx: 24,
      columnGapPx: 12,
    },
    [...order],
    "main",
    800,
    1920,
  );
  assert.equal(next.feedWidthPx, 800);
  assert.equal(next.leftNavPx, 272);
  assert.equal(next.rightRailPx, 316);
});

check("hover-reveal scrollbars", () => {
  const css = buildStylesheet(createDefaultSettings());
  assert.match(css, /scrollbar-color:\s*transparent transparent/);
  assert.match(css, /\[data-readit-slot\]:hover/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /:has\(\[data-readit-slot="main"\]:hover\)/);
});

check("CSS column resize handle styles", () => {
  const settings = createDefaultSettings();
  settings.flags.layoutSlots = true;
  settings.layoutSlots.editMode = true;
  const css = buildStylesheet(settings);
  assert.match(css, /readit-col-resize/);
  assert.match(css, /readit-frame-remove/);
  assert.match(css, /readit-frame-lock/);
  assert.match(css, /data-edge="left"/);
  assert.match(css, /cursor:\s*col-resize/);
});

check("CSS column sticky scroll rails", () => {
  const settings = applyProfile(createDefaultSettings(), "dense-power");
  settings.flags.layoutSlots = true;
  const css = buildStylesheet(settings);
  assert.match(css, /position:\s*sticky/);
  assert.match(css, /--readit-chrome-top/);
  assert.match(css, /100vh - var\(--readit-chrome-top/);
  assert.match(css, /#flex-left-nav-container/);
  assert.match(css, /position:\s*absolute/);
  assert.match(css, /grid-row:\s*1/);
  assert.match(css, /\[data-readit-layout-shell\] > shreddit-async-loader/);
  assert.match(css, /grid-column:\s*1\s*\/\s*-1/);
  assert.doesNotMatch(
    css,
    /\[data-readit-layout-shell\] shreddit-async-loader \{\s*display:\s*none/,
  );
  assert.doesNotMatch(
    css,
    /\[data-readit-layout-shell\] > shreddit-async-loader \{\s*display:\s*contents/,
  );
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /overflow-wrap:\s*break-word/);
  assert.match(css, /@container readit-nav/);
  assert.match(css, /container-name:\s*readit-nav/);
});

check("nav compact section classifier", () => {
  assert.equal(classifyNavSection("RECENT"), "recent");
  assert.equal(classifyNavSection("Communities"), "communities");
  assert.equal(classifyNavSection("CUSTOM FEEDS"), "custom");
  assert.equal(classifyNavSection("GAMES ON REDDIT"), "games");
  assert.equal(classifyNavSection("RESOURCES"), "resources");
  assert.equal(classifyNavSection("Best of Reddit"), "best");
});

check("nav rail model fingerprint stable", () => {
  const model: NavModel = {
    chrome: [
      {
        kind: "chrome",
        href: "/",
        label: "Home",
      },
    ],
    sections: [
      {
        id: "communities",
        label: "Communities",
        items: [
          {
            kind: "community",
            href: "/r/pics/",
            label: "r/pics",
            name: "pics",
            iconSrc: "https://example.com/a.png",
          },
        ],
      },
    ],
  };
  const a = modelFingerprint(model);
  const b = modelFingerprint(model);
  assert.equal(a, b);
  assert.match(a, /community:\/r\/pics/);
});

check("CSS compact nav community subname + section icons", () => {
  const settings = createDefaultSettings();
  settings.flags.layoutSlots = true;
  settings.layoutSlots = applyLayoutPreset(settings.layoutSlots, "classic");
  const css = buildStylesheet(settings);
  assert.match(css, /#readit-nav-rail/);
  assert.match(css, /readit-nav-subname/);
  assert.match(css, /:not\(#readit-nav-rail\)/);
  assert.match(css, /readit-nav-rail-section-icon/);
  assert.match(css, /data-readit-nav-section="recent"/);
  assert.match(css, /mask-image:\s*url\("data:image\/svg\+xml/);
});

check("CSS compact nav containment; legacy thin rail clamps to its floor", () => {
  const settings = createDefaultSettings();
  settings.flags.layoutSlots = true;
  settings.layoutSlots = applyLayoutPreset(settings.layoutSlots, "classic");
  settings.layoutSlots.widths = {
    ...settings.layoutSlots.widths,
    leftNavPx: 64,
    rightRailPx: 160, // legacy thin — clamps to the rail's 240 floor
  };
  const css = buildStylesheet(settings);
  assert.match(css, /readit-nav-compact/);
  assert.doesNotMatch(css, /readit-rail-compact/);
  assert.match(css, /--readit-right-rail-width:\s*240px/);
  assert.match(css, /\[data-readit-slot="rightRail"\] \*/);
  assert.match(css, /word-break:\s*normal/);
  assert.match(css, /\.readit-user-tag/);
  assert.match(css, /writing-mode:\s*horizontal-tb/);
});

check("CSS edit-mode labeled frames", () => {
  const settings = createDefaultSettings();
  settings.flags.layoutSlots = true;
  settings.layoutSlots.editMode = true;
  const css = buildStylesheet(settings);
  assert.match(css, /readit-layout-frame/);
  assert.match(css, /readit-frame-label/);
  assert.match(css, /readit-drop-line/);
  assert.match(css, /readit-drop-label/);
  assert.match(css, /readit-drop-moving/);
  // Overlay caret stays thin — no wide gap pill that malforms neighbors.
  assert.match(css, /\.readit-drop-line \{[\s\S]*?width:\s*4px/);
  assert.doesNotMatch(css, /width:\s*40px\s*!important/);
  assert.doesNotMatch(css, /data-nudge/);
  assert.doesNotMatch(css, /data-readit-drop-preview/);
  assert.match(css, /outline:\s*none/);
  assert.match(css, /\[data-drop="1"\][\s\S]*?border-style:\s*dashed/);
  assert.match(css, /\[data-readit-slot\][\s\S]*?pointer-events:\s*none/);
  assert.match(
    css,
    /\[data-readit-dragging-kind\][\s\S]*?\.readit-col-resize/,
  );
  assert.doesNotMatch(css, /\[data-readit-slot\]\s*\{\s*outline:\s*2px dashed/);
});

check("CSS feed width does not constrain shreddit-app", () => {
  const css = buildStylesheet(createDefaultSettings());
  assert.match(css, /#main-content/);
  assert.match(css, /--readit-feed-width/);
  // Page shell must stay full-bleed; capping shreddit-app caused blank gutters.
  assert.doesNotMatch(
    css,
    /html\.readit-active shreddit-app[\s\S]*?max-width:\s*var\(--readit-feed-width\)/,
  );
});

check("CSS reclaim subgrid gutters", () => {
  const css = buildStylesheet(createDefaultSettings());
  assert.match(css, /#subgrid-container/);
  assert.match(css, /grid-template-columns/);
  assert.match(css, /justify-self:\s*stretch/);
});

check("CSS noise pack aiSummary", () => {
  const settings = createDefaultSettings();
  settings.knobs.hide.aiSummary = true;
  const css = buildStylesheet(settings);
  assert.match(css, /ai-summary|ai_summary/i);
});

check("CSS waveA awards hide", () => {
  const settings = createDefaultSettings();
  settings.knobs.hide.awards = true;
  const css = buildStylesheet(settings);
  assert.match(css, /readit-hide:awards/);
});

check("CSS waveA compact density class styles", () => {
  const settings = createDefaultSettings();
  settings.feedPrefs.feedDensity = "compact";
  const css = buildStylesheet(settings);
  assert.match(css, /readit-feed-compact/);
});

check("CSS split post header only when chosen, spacers follow main alignment", () => {
  const settings = createDefaultSettings();
  assert.equal(settings.feedPrefs.postHeader, "stacked");
  assert.doesNotMatch(buildStylesheet(settings), /readit-post-header:split/);

  settings.feedPrefs.postHeader = "split";
  assert.match(buildStylesheet(settings), /readit-post-header:page/);
  const spacers = (css: string) => {
    const lead = css.match(/\[mid-start\] ([^\n]+)\n/);
    const trail = css.match(/\[trail\] ([^\n]+)\n/);
    assert.ok(lead && trail, "split grid template present");
    return [lead[1], trail[1]];
  };
  settings.layoutSlots.contentAlign = "start";
  assert.deepEqual(spacers(buildStylesheet(settings)), ["0px", "minmax(0, 1fr)"]);
  settings.layoutSlots.contentAlign = "center";
  assert.deepEqual(spacers(buildStylesheet(settings)), ["minmax(0, 1fr)", "minmax(0, 1fr)"]);
  settings.layoutSlots.contentAlignByPanel = { main: "end" };
  assert.deepEqual(spacers(buildStylesheet(settings)), ["minmax(0, 1fr)", "0px"]);

  // Without layout slots there is no column alignment — start layout.
  settings.flags.layoutSlots = false;
  assert.deepEqual(spacers(buildStylesheet(settings)), ["0px", "minmax(0, 1fr)"]);
});

check("CSS waveA lurker styles", () => {
  const settings = createDefaultSettings();
  const css = buildStylesheet(settings);
  assert.match(css, /readit-lurker/);
});

check("schema v9 column order + chrome defaults", () => {
  const settings = createDefaultSettings();
  assert.equal(settings.version, SETTINGS_VERSION);
  assert.equal(SETTINGS_VERSION, 9);
  assert.deepEqual(settings.layoutSlots.separators, []);
  assert.equal(settings.layoutSlots.gutterTheme, "plain");
  assert.equal(settings.layoutSlots.zoomAll, 1);
  assert.equal(settings.knobs.tokens.fontFamily, "system");
  assert.equal(settings.layoutSlots.chrome?.topNav ?? "top", "top");
  assert.equal(settings.layoutSlots.chrome?.topNavPx ?? 56, 56);
});

check("CSS page chrome slot rules", () => {
  const settings = createDefaultSettings();
  settings.flags.layoutSlots = true;
  const css = buildStylesheet(settings);
  assert.match(css, /data-readit-slot="topNav"/);
  assert.match(css, /data-readit-chrome-top="bottom"/);
  assert.match(css, /--readit-chrome-bottom/);
});

check("separator tracks interleave after panel", () => {
  const tracks = buildLayoutTracks({
    columnOrder: ["leftNav", "main", "rightRail"],
    placements: {
      leftNav: "left",
      main: "center",
      rightRail: "right",
      subHeader: "right",
    },
    separators: [
      { id: "sep1", after: "leftNav", widthPx: 24 },
      { id: "sep2", after: "main", widthPx: 40 },
    ],
  });
  assert.deepEqual(
    tracks.map((t) =>
      t.type === "panel"
        ? t.panel
        : t.type === "pad"
          ? `pad:${t.side}`
          : `sep:${t.widthPx}`,
    ),
    ["pad:left", "leftNav", "sep:24", "main", "sep:40", "rightRail", "pad:right"],
  );
});

check("fitLayoutWidths accounts for separator extras", () => {
  const base = {
    leftNavPx: 272,
    rightRailPx: 316,
    feedWidthPx: 900,
    pagePadLeftPx: 24,
    pagePadRightPx: 24,
    columnGapPx: 12,
  };
  const without = fitLayoutWidths(base, ["leftNav", "main", "rightRail"], 1200);
  const withSep = fitLayoutWidths(
    base,
    ["leftNav", "main", "rightRail"],
    1200,
    200,
  );
  assert.ok(
    withSep.feedWidthPx < without.feedWidthPx,
    `expected separator extras to shrink feed (${withSep.feedWidthPx} < ${without.feedWidthPx})`,
  );
});

check("addLayoutSeparator caps at 3", () => {
  let cfg = createDefaultSettings().layoutSlots;
  cfg = addLayoutSeparator(cfg, "leftNav");
  cfg = addLayoutSeparator(cfg, "main");
  cfg = addLayoutSeparator(cfg, "rightRail");
  assert.equal(cfg.separators.length, 3);
  const capped = addLayoutSeparator(cfg, "main");
  assert.equal(capped.separators.length, 3);
  assert.equal(capped, cfg);
});

check("moveLayoutSeparator relocates after another panel", () => {
  let cfg = createDefaultSettings().layoutSlots;
  cfg = addLayoutSeparator(cfg, "leftNav");
  const id = cfg.separators[0]!.id;
  cfg = moveLayoutSeparator(cfg, id, "main");
  assert.equal(cfg.separators[0]!.after, "main");
  const tracks = buildLayoutTracks({
    columnOrder: ["leftNav", "main", "rightRail"],
    placements: {
      leftNav: "left",
      main: "center",
      rightRail: "right",
      subHeader: "right",
    },
    separators: cfg.separators,
  });
  assert.deepEqual(
    tracks.map((t) =>
      t.type === "panel" ? t.panel : t.type === "pad" ? `pad:${t.side}` : "sep",
    ),
    ["pad:left", "leftNav", "main", "sep", "rightRail", "pad:right"],
  );
});

check("removeLayoutSeparator drops by id", () => {
  let cfg = createDefaultSettings().layoutSlots;
  cfg = addLayoutSeparator(cfg, "main");
  cfg = addLayoutSeparator(cfg, "leftNav");
  const id = cfg.separators[0]!.id;
  cfg = removeLayoutSeparator(cfg, id);
  assert.equal(cfg.separators.length, 1);
  assert.notEqual(cfg.separators[0]!.id, id);
});

check("resizePanelInBudget left edge steals from left neighbors", () => {
  const next = resizePanelInBudget(
    {
      leftNavPx: 200,
      rightRailPx: 300,
      feedWidthPx: 600,
      pagePadLeftPx: 24,
      pagePadRightPx: 24,
      columnGapPx: 12,
    },
    ["leftNav", "main", "rightRail"],
    "main",
    800,
    1200,
    "left",
  );
  assert.ok(next.leftNavPx < 200 || next.feedWidthPx <= 800);
  assert.equal(next.pagePadLeftPx, next.pagePadRightPx);
});

check("resizePanelInBudget left edge trades only with left columns", () => {
  const next = resizePanelInBudget(
    {
      leftNavPx: 200,
      rightRailPx: 300,
      feedWidthPx: 600,
      pagePadLeftPx: 100,
      pagePadRightPx: 100,
      columnGapPx: 12,
    },
    ["leftNav", "main", "rightRail"],
    "main",
    650,
    1600,
    "left",
  );
  assert.equal(next.feedWidthPx, 650);
  assert.equal(next.leftNavPx, 150);
  assert.equal(next.rightRailPx, 300);
  assert.equal(next.pagePadLeftPx, next.pagePadRightPx);
});

check("resizePanelInBudget left edge cannot steal from locked left neighbors", () => {
  const next = resizePanelInBudget(
    {
      leftNavPx: 200,
      rightRailPx: 300,
      feedWidthPx: 600,
      pagePadLeftPx: 100,
      pagePadRightPx: 100,
      columnGapPx: 12,
    },
    ["leftNav", "main", "rightRail"],
    "main",
    650,
    1600,
    "left",
    0,
    widthLockSet({ leftNav: true }),
  );
  // Left nav locked and pads are not stolen on left-edge — growth is refused.
  assert.equal(next.leftNavPx, 200);
  assert.ok(next.feedWidthPx <= 600);
  assert.equal(next.pagePadLeftPx, next.pagePadRightPx);
});

check("resizePadInBudget mirrors both pads and shrinks the near side first", () => {
  const next = resizePadInBudget(
    {
      leftNavPx: 200,
      rightRailPx: 300,
      feedWidthPx: 600,
      pagePadLeftPx: 24,
      pagePadRightPx: 24,
      columnGapPx: 12,
    },
    ["leftNav", "main", "rightRail"],
    "left",
    80,
    1200,
  );
  assert.equal(next.pagePadLeftPx, 80);
  assert.equal(next.pagePadRightPx, 80);
  // Growing both pads on a tight viewport steals from the left first.
  assert.ok(next.leftNavPx < 200);
  assert.equal(next.rightRailPx, 300);
});

check("resizePanelInBudget left edge pins the right edge (trade only left)", () => {
  const base = {
    leftNavPx: 220,
    rightRailPx: 280,
    feedWidthPx: 520,
    pagePadLeftPx: 40,
    pagePadRightPx: 40,
    columnGapPx: 12,
  };
  const next = resizePanelInBudget(
    base,
    ["leftNav", "main", "rightRail"],
    "main",
    620,
    1600,
    "left",
  );
  assert.equal(next.feedWidthPx, 620);
  assert.equal(next.rightRailPx, 280);
  assert.equal(next.leftNavPx, 120);
  assert.equal(next.pagePadLeftPx, 40);
  assert.equal(next.pagePadRightPx, 40);
});

check("width locks skip locked neighbors during right-edge grow", () => {
  const next = resizePanelInBudget(
    {
      leftNavPx: 200,
      rightRailPx: 320,
      feedWidthPx: 700,
      pagePadLeftPx: 24,
      pagePadRightPx: 24,
      columnGapPx: 12,
    },
    ["leftNav", "main", "rightRail"],
    "main",
    900,
    1200,
    "right",
    0,
    widthLockSet({ rightRail: true, "pad:right": true }),
  );
  assert.equal(next.rightRailPx, 320);
  assert.equal(next.pagePadRightPx, 24);
  assert.ok(next.feedWidthPx < 900);
});

check("width locks prevent resizing a locked panel", () => {
  const next = resizePanelInBudget(
    {
      leftNavPx: 200,
      rightRailPx: 300,
      feedWidthPx: 600,
      pagePadLeftPx: 24,
      pagePadRightPx: 24,
      columnGapPx: 12,
    },
    ["leftNav", "main", "rightRail"],
    "leftNav",
    280,
    1600,
    "right",
    0,
    widthLockSet({ leftNav: true }),
  );
  assert.equal(next.leftNavPx, 200);
});

check("locked pad is not stolen by fitLayoutWidths", () => {
  const next = fitLayoutWidths(
    {
      leftNavPx: 400,
      rightRailPx: 400,
      feedWidthPx: 900,
      pagePadLeftPx: 80,
      pagePadRightPx: 120,
      columnGapPx: 12,
    },
    ["leftNav", "main", "rightRail"],
    1000,
    0,
    widthLockSet({ "pad:right": true }),
  );
  assert.equal(next.pagePadRightPx, 120);
});

check("resizePanelInBudget overflow preserves unequal pads under budget", () => {
  const next = resizePanelInBudget(
    {
      leftNavPx: 200,
      rightRailPx: 280,
      feedWidthPx: 600,
      pagePadLeftPx: 40,
      pagePadRightPx: 120,
      columnGapPx: 12,
    },
    ["leftNav", "main", "rightRail"],
    "main",
    700,
    1920,
    "right",
  );
  assert.equal(next.feedWidthPx, 700);
  assert.equal(next.pagePadLeftPx, 40);
  assert.equal(next.pagePadRightPx, 120);
  assert.equal(next.leftNavPx, 200);
  assert.equal(next.rightRailPx, 280);
});

check("resizePanelInBudget right edge pin keeps left pad when shrinking", () => {
  const base = {
    leftNavPx: 220,
    rightRailPx: 280,
    feedWidthPx: 700,
    pagePadLeftPx: 60,
    pagePadRightPx: 90,
    columnGapPx: 12,
  };
  const next = resizePanelInBudget(
    base,
    ["leftNav", "main", "rightRail"],
    "main",
    600,
    1920,
    "right",
  );
  assert.equal(next.feedWidthPx, 600);
  assert.equal(next.pagePadLeftPx, 60);
  assert.equal(next.pagePadRightPx, 90);
  assert.equal(next.leftNavPx, 220);
});

check("resizePanelInBudget left edge pin keeps right pad and rightRail", () => {
  const next = resizePanelInBudget(
    {
      leftNavPx: 220,
      rightRailPx: 280,
      feedWidthPx: 520,
      pagePadLeftPx: 40,
      pagePadRightPx: 80,
      columnGapPx: 12,
    },
    ["leftNav", "main", "rightRail"],
    "main",
    620,
    1600,
    "left",
  );
  assert.equal(next.feedWidthPx, 620);
  assert.equal(next.rightRailPx, 280);
  assert.equal(next.leftNavPx, 120);
  assert.equal(next.pagePadLeftPx, 40);
  assert.equal(next.pagePadRightPx, 80);
});

check("centerPadsInViewport equalizes leftover into pads", () => {
  const centered = centerPadsInViewport(
    {
      leftNavPx: 200,
      rightRailPx: 280,
      feedWidthPx: 700,
      pagePadLeftPx: 40,
      pagePadRightPx: 120,
      columnGapPx: 12,
    },
    ["leftNav", "main", "rightRail"],
    1920,
  );
  assert.equal(centered.pagePadLeftPx, centered.pagePadRightPx);
  assert.ok(centered.pagePadLeftPx > 120);
  const overflow = fitOverflowOnly(
    {
      leftNavPx: 200,
      rightRailPx: 280,
      feedWidthPx: 700,
      pagePadLeftPx: 40,
      pagePadRightPx: 120,
      columnGapPx: 12,
    },
    ["leftNav", "main", "rightRail"],
    1920,
  );
  assert.equal(overflow.pagePadLeftPx, 40);
  assert.equal(overflow.pagePadRightPx, 120);
});

check("CSS gutter theme + zoom + font tokens", () => {
  const settings = createDefaultSettings();
  settings.flags.layoutSlots = true;
  settings.layoutSlots.gutterTheme = "line";
  settings.layoutSlots.zoomAll = 1.1;
  settings.knobs.tokens.fontFamily = "serif";
  settings.knobs.tokens.fontWeight = 600;
  const css = buildStylesheet(settings);
  assert.match(css, /readit-gutter-line/);
  assert.match(css, /zoom:\s*1\.1/);
  assert.match(css, /--readit-font-family/);
  assert.match(css, /--readit-font-weight:\s*600/);
});

check("CSS typography goes through Reddit's tokens and utilities", () => {
  const settings = createDefaultSettings();
  settings.knobs.tokens.fontFamily = "system";
  settings.knobs.tokens.fontWeight = 400;
  settings.knobs.tokens.fontScale = 1;
  assert.doesNotMatch(buildStylesheet(settings), /--font-body-2:/, "neutral settings leave Reddit's type alone");

  settings.knobs.tokens.fontFamily = "serif";
  settings.knobs.tokens.fontWeight = 700;
  settings.knobs.tokens.fontScale = 1.2;
  const css = buildStylesheet(settings);
  // Weight: regular text takes the setting, heavier text keeps its own floor.
  assert.match(css, /--font-body-2: 700 0\.875rem\/1\.25rem ui-serif/);
  assert.match(css, /--font-label-2-weight: 700;/);
  assert.match(css, /\.font-normal \{ font-weight: 700; \}/);
  // Scale: tokens and light-DOM utilities scale together, from Reddit's 14px base.
  assert.match(css, /--font-body-2: 700 1\.05rem\/1\.5rem ui-serif/);
  assert.match(css, /:is\(\.text-14, \.text-14-scalable\) \{ font-size: 1\.05rem; line-height: 1\.5rem; \}/);
  assert.match(css, /min-width: 768px[\s\S]*\.xs\\:text-24/);
  assert.match(css, /shreddit-comment-tree\) \{\n  font-size: 1\.05rem;\n\}/);
  // Reddit redeclares tokens on theme containers; ours must follow them down.
  assert.match(css, /html\.readit-active \[class\*="theme-"\] \{\n  font-family: ui-serif[^\n]*\n  --font-sans: ui-serif/);
  assert.doesNotMatch(css, /calc\(1rem \* var\(--readit-font-scale\)\)/);

  // Body copy stays regular under a bold setting; emphasis and headings stay bold.
  assert.match(css, /html\.readit-active \.md \{\n  font-weight: 400;\n  line-height: 1\.4286;/);
  assert.match(css, /\.md :is\(strong, b\),\nhtml\.readit-active \.md\.md :is\(h1, h2, h3, h4, h5, h6\) \{ font-weight: 700; \}/);
  // Markdown headings get a real hierarchy, scaled inside content.
  assert.match(css, /html\.readit-active \.md\.md h1 \{ font-size: 1\.25rem; line-height: 1\.625rem; \}/);
  assert.match(css, /shreddit-comment-tree\) \.md\.md h2 \{ font-size: 1\.35rem; line-height: 1\.8rem; \}/);

  // Body weight is its own setting.
  settings.knobs.tokens.bodyFontWeight = 500;
  const bodyMedium = buildStylesheet(settings);
  assert.match(bodyMedium, /html\.readit-active \.md \{\n  font-weight: 500;/);
  assert.match(bodyMedium, /\.md :is\(strong, b\)/);
  assert.equal(createDefaultSettings().knobs.tokens.bodyFontWeight, 400);

  settings.knobs.tokens.fontWeight = 500;
  const medium = buildStylesheet(settings);
  assert.match(medium, /--font-body-1-weight: 500;/);
  assert.match(medium, /--font-label-1-weight: 600;/);
  assert.match(medium, /--font-title-1-weight: 700;/);
});

check("builtin profiles own layout recipes", () => {
  for (const p of BUILTIN_PROFILES) {
    assert.equal(p.flags.layoutSlots, true, p.id);
    assert.ok(p.layoutSlots, `${p.id} missing layoutSlots`);
    assert.equal(p.layoutSlots!.editMode, false);
    assert.ok(formatProfileLayoutBlurb(p));
  }
  assert.equal(BUILTIN_PROFILES.find((p) => p.id === "focus-reader")?.layoutSlots?.preset, "singleColumn");
  assert.deepEqual(
    BUILTIN_PROFILES.find((p) => p.id === "mod-desk")?.layoutSlots?.columnOrder,
    ["rightRail", "main", "leftNav"],
  );
  assert.equal(
    BUILTIN_PROFILES.find((p) => p.id === "dense-power")?.layoutSlots?.widths
      .columnGapPx,
    8,
  );
});

check("applyProfile wires layout recipes", () => {
  const base = createDefaultSettings();
  const focus = applyProfile(base, "focus-reader");
  assert.equal(focus.layoutSlots.preset, "singleColumn");
  assert.equal(focus.layoutSlots.widths.pagePadLeftPx, 48);
  assert.equal(focus.layoutSlots.editMode, false);

  const dense = applyProfile(base, "dense-power");
  assert.deepEqual(dense.layoutSlots.columnOrder, [
    "leftNav",
    "main",
    "rightRail",
  ]);
  assert.equal(dense.layoutSlots.widths.columnGapPx, 8);
  assert.equal(dense.flags.layoutSlots, true);

  const mod = applyProfile(base, "mod-desk");
  assert.equal(mod.layoutSlots.preset, "navRight");
  assert.deepEqual(mod.layoutSlots.columnOrder, [
    "rightRail",
    "main",
    "leftNav",
  ]);
  assert.equal(mod.flags.layoutSlots, true);
  assert.equal(mod.layoutSlots.editMode, false);
});

check("keyboard focus guard", () => {
  assert.equal(isEditableTarget(null), false);
  const input = {
    tagName: "INPUT",
    closest: () => null,
    isContentEditable: false,
    getAttribute: () => null,
    parentElement: null,
  };
  assert.equal(isEditableTarget(input as unknown as Element), true);
});

check("import preview dry-run", () => {
  const settings = createDefaultSettings();
  const preview = previewImport({
    kind: "readit-export",
    exportedAt: Date.now(),
    schemaVersion: SETTINGS_VERSION,
    settings,
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.kind, "bundle");
  assert.equal(preview.schemaVersion, SETTINGS_VERSION);
});

check("overflow fit keeps side panels readable before crushing one", () => {
  const widths = {
    leftNavPx: 272,
    rightRailPx: 316,
    feedWidthPx: 980,
    pagePadLeftPx: 24,
    pagePadRightPx: 24,
    columnGapPx: 12,
  };
  const order = ["leftNav", "main", "rightRail"] as const;
  for (const vw of [1366, 1024]) {
    const fit = fitLayoutWidths(widths, order, vw, 0, undefined, "overflow");
    assert.ok(fit.rightRailPx >= 240, `${vw}: rail ${fit.rightRailPx}`);
    assert.ok(fit.feedWidthPx >= 480, `${vw}: feed ${fit.feedWidthPx}`);
    assert.ok(fit.leftNavPx >= 180, `${vw}: nav ${fit.leftNavPx}`);
    const used =
      fit.leftNavPx + fit.feedWidthPx + fit.rightRailPx +
      fit.pagePadLeftPx + fit.pagePadRightPx + 4 * fit.columnGapPx;
    assert.ok(used <= vw, `${vw}: fits (${used})`);
  }
  // Pads that must shrink shrink evenly, so centered layouts stay centered.
  const tight = fitLayoutWidths({ ...widths, pagePadLeftPx: 48, pagePadRightPx: 48 }, order, 1366, 0, undefined, "overflow");
  assert.ok(Math.abs(tight.pagePadLeftPx - tight.pagePadRightPx) <= 1, `pads ${tight.pagePadLeftPx}/${tight.pagePadRightPx}`);
  // A deliberately narrow nav (icon mode) is never widened by the floor.
  const narrow = fitLayoutWidths({ ...widths, leftNavPx: 64 }, order, 1366, 0, undefined, "overflow");
  assert.equal(narrow.leftNavPx, 64);
});

check("zoom: shell factor and zoomed nav stays inside its track", () => {
  assert.equal(shellZoomFactor({ zoomAll: 1.5 }), 1.5);
  assert.equal(shellZoomFactor({ zoomAll: 1.5, zoomByPanel: { main: 1.2 } }), 1);
  assert.equal(shellZoomFactor({}), 1);
  const settings = createDefaultSettings();
  settings.flags.layoutSlots = true;
  settings.layoutSlots = {
    ...applyLayoutPreset(settings.layoutSlots, "classic"),
    zoomByPanel: { leftNav: 1.5 },
  };
  const css = buildStylesheet(settings);
  assert.match(css, /zoom: 1\.5;\n  width: calc\(var\(--readit-left-nav-width\) \/ 1\.5\) !important;/);
});

check("fillPadsForAlign turns leftover into pads on the aligned side", () => {
  const w = {
    leftNavPx: 272,
    rightRailPx: 316,
    feedWidthPx: 760,
    pagePadLeftPx: 24,
    pagePadRightPx: 24,
    columnGapPx: 12,
  };
  const order = ["leftNav", "main", "rightRail"] as const;
  // used = 1348 panels + 48 pads + 4 gaps * 12 = 1444 → leftover 476 at 1920
  const c = fillPadsForAlign(w, order, 1920, "center");
  assert.equal(c.pagePadLeftPx, 24 + 238);
  assert.equal(c.pagePadRightPx, 24 + 238);
  const l = fillPadsForAlign(w, order, 1920, "left");
  assert.deepEqual([l.pagePadLeftPx, l.pagePadRightPx], [24, 500]);
  const r = fillPadsForAlign(w, order, 1920, "right");
  assert.deepEqual([r.pagePadLeftPx, r.pagePadRightPx], [500, 24]);
  // A locked pad that would need to grow leaves the layout as drawn.
  assert.equal(fillPadsForAlign(w, order, 1920, "center", 0, new Set(["pad:left"])), w);
  // …but only the pad the alignment actually grows matters.
  const lr = fillPadsForAlign(w, order, 1920, "left", 0, new Set(["pad:left"]));
  assert.deepEqual([lr.pagePadLeftPx, lr.pagePadRightPx], [24, 500]);
  assert.equal(fillPadsForAlign(w, order, 1200, "center"), w);
});

check("column alignment drives grid justify-content (centered by default)", () => {
  const cases = [
    [undefined, "center"],
    ["center", "center"],
    ["left", "start"],
    ["right", "end"],
  ] as const;
  for (const preset of ["classic", "dualLeft"] as const) {
    for (const [align, justify] of cases) {
      const settings = createDefaultSettings();
      settings.flags.layoutSlots = true;
      settings.layoutSlots = applyLayoutPreset(settings.layoutSlots, preset);
      if (align) settings.layoutSlots.align = align;
      const css = buildStylesheet(settings);
      assert.match(
        css,
        new RegExp(`\\[data-readit-layout-shell\\] \\{[^}]*justify-content: ${justify} !important`),
        `${preset}/${align ?? "default"}`,
      );
    }
  }
  assert.equal(createDefaultSettings().layoutSlots.align, "center");
  const single = createDefaultSettings();
  single.flags.layoutSlots = true;
  single.layoutSlots = { ...applyLayoutPreset(single.layoutSlots, "singleColumn"), align: "left" };
  assert.match(buildStylesheet(single), /margin-left: var\(--readit-page-pad-left, 24px\) !important;\n  margin-right: auto/);
});

check("headings, titles and nav/rail labels wrap instead of truncating", () => {
  for (const preset of ["classic", "dualLeft"] as const) {
    const settings = createDefaultSettings();
    settings.flags.layoutSlots = true;
    settings.layoutSlots = applyLayoutPreset(settings.layoutSlots, preset);
    const css = buildStylesheet(settings);
    const rules = (slot: string) =>
      [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, sel]) => sel!.includes(`[data-readit-slot="${slot}"]`) && !sel!.includes("readit-nav-compact") && !sel!.includes("@container"))
        .map(([, sel, body]) => ({ sel: sel!, body: body! }));
    for (const slot of ["rightRail", "main"]) {
      for (const { sel, body } of rules(slot)) {
        assert.doesNotMatch(body, /text-overflow:\s*ellipsis/, `${preset} ${slot}: ${sel.trim().slice(0, 80)}`);
        assert.doesNotMatch(body, /-webkit-line-clamp:\s*\d/, `${preset} ${slot}: ${sel.trim().slice(0, 80)}`);
      }
    }
    assert.match(css, /\[slot="title"\] \{[^}]*white-space: normal !important/);
  }
});

check("feed media: backdrops untouched, images centered, galleries unzoomed", () => {
  const settings = createDefaultSettings();
  settings.flags.layoutSlots = true;
  settings.layoutSlots = applyLayoutPreset(settings.layoutSlots, "classic");
  let css = buildStylesheet(settings);
  assert.match(css, /\[slot="post-media-container"\] img:not\(\.absolute\) \{[^}]*object-fit: contain !important;[^}]*object-position: center/);
  assert.doesNotMatch(css, /img\.absolute \{[^}]*object-fit/);
  assert.doesNotMatch(css, /gallery-carousel \{[^}]*zoom/);
  settings.layoutSlots = { ...settings.layoutSlots, zoomByPanel: { main: 1.25 } };
  css = buildStylesheet(settings);
  assert.match(css, /gallery-carousel \{\n  zoom: 0\.8 !important;\n  width: calc\(100% \* 1\.25\)/);
});

check("content alignment: global, per-column override, body follows, code stays start", () => {
  const base = createDefaultSettings();
  base.flags.layoutSlots = true;
  base.layoutSlots = applyLayoutPreset(base.layoutSlots, "classic");
  assert.equal(base.layoutSlots.contentAlign, "start");
  assert.doesNotMatch(buildStylesheet(base), /readit-content-align:/);

  const all = structuredClone(base);
  all.layoutSlots.contentAlign = "center";
  const cssAll = buildStylesheet(all);
  for (const p of ["leftNav", "main", "rightRail"]) {
    assert.match(cssAll, new RegExp(`readit-content-align:${p}:center`));
  }
  assert.match(cssAll, /justify-content: center !important/);
  assert.match(cssAll, /:not\(\[class\*="justify-between"\]\)/);
  // Body copy follows the column; only code keeps start alignment.
  assert.doesNotMatch(cssAll, /\[slot="text-body"\][^{]*\{\n  text-align: start/);
  assert.match(cssAll, /:is\(pre, code\) \{\n  text-align: start !important/);
  assert.match(cssAll, /list-style-position: inside !important/);

  const one = structuredClone(base);
  one.layoutSlots.contentAlign = "center";
  one.layoutSlots.contentAlignByPanel = { main: "end", rightRail: "start" };
  const cssOne = buildStylesheet(one);
  assert.match(cssOne, /readit-content-align:leftNav:center/);
  assert.match(cssOne, /readit-content-align:main:end/);
  assert.match(cssOne, /justify-content: flex-end !important/);
  assert.doesNotMatch(cssOne, /readit-content-align:rightRail/);
  assert.equal(panelContentAlign(one.layoutSlots, "rightRail"), "start");
  assert.equal(panelContentAlign(one.layoutSlots, "leftNav"), "center");
});

check("stacked nav is not sticky (rail sits below it)", () => {
  for (const preset of ["dualLeft", "dualRight"] as const) {
    const settings = createDefaultSettings();
    settings.flags.layoutSlots = true;
    settings.layoutSlots = applyLayoutPreset(settings.layoutSlots, preset);
    const css = buildStylesheet(settings);
    const rule = css.match(
      /\[data-readit-slot="leftNav"\] \{\n  grid-row: 1 !important;[^}]*\}/,
    )?.[0];
    assert.ok(rule, `${preset}: stacked leftNav rule present`);
    assert.match(rule!, /position: relative !important/);
    assert.match(rule!, /top: auto !important/);
  }
});

check("leaving single column via any preset shows sidebars again", () => {
  // Focus Reader = single column + hide.sidebars. Picking Classic (e.g. from
  // the edit toolbox) must drop the CSS hide, or the rail keeps an empty track.
  const focus = applyProfile(createDefaultSettings(), "focus-reader");
  assert.equal(focus.knobs.hide.sidebars, true);
  const classic = applyLayoutPresetToSettings(focus, "classic");
  assert.equal(classic.layoutSlots.preset, "classic");
  assert.equal(classic.knobs.hide.sidebars, false);
  const single = applyLayoutPresetToSettings(classic, "singleColumn");
  assert.equal(single.knobs.hide.sidebars, true);
  const dual = applyLayoutPresetToSettings(createDefaultSettings(), "dualLeft");
  assert.equal(dual.knobs.hide.sidebars, false);
  assert.equal(dual.flags.layoutSlots, true);
});

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall layout unit checks passed");
