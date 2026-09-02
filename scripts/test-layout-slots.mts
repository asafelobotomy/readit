/**
 * Unit checks for layout slot presets + CSS recipes + keyboard focus guard.
 * Run: npm run test:layout
 */
import assert from "node:assert/strict";
import { buildStylesheet, LAYOUT_RECIPE_MARKER } from "../packages/css-engine/src/index.ts";
import { isEditableTarget } from "../packages/features/src/reader-creator.ts";
import {
  applyLayoutPreset,
  layoutSlotsHealth,
  presetToPlacements,
  resolveSlots,
  swapLayoutColumns,
} from "../packages/features/src/layout-slots.ts";
import {
  applyProfile,
  BUILTIN_PROFILES,
  clampColumnGap,
  clampPagePad,
  clampPanelWidth,
  createDefaultSettings,
  fitLayoutWidths,
  formatProfileLayoutBlurb,
  previewImport,
  resizePanelInBudget,
  SETTINGS_VERSION,
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

check("clampPanelWidth limits", () => {
  assert.equal(clampPanelWidth("leftNav", 20), 64);
  assert.equal(clampPanelWidth("leftNav", 500), 420);
  assert.equal(clampPanelWidth("main", 200), 480);
  assert.equal(clampPanelWidth("main", 2000), 1600);
  assert.equal(clampPanelWidth("rightRail", 250), 250);
});

check("page pad + column gap defaults and CSS", () => {
  const settings = createDefaultSettings();
  // Focus Reader recipe uses 48px pads; classic columns still expose pad CSS vars.
  assert.equal(settings.layoutSlots.widths.pagePadLeftPx, 48);
  assert.equal(settings.layoutSlots.widths.pagePadRightPx, 48);
  assert.equal(settings.layoutSlots.widths.columnGapPx, 12);
  assert.equal(clampPagePad(-10), 0);
  assert.equal(clampPagePad(999), 480);
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
  assert.match(css, /padding-left:\s*var\(--readit-page-pad-left/);
  assert.match(css, /column-gap:\s*var\(--readit-column-gap/);
  assert.match(css, /readit-pad-resize/);
  assert.match(css, /--readit-grid-cols/);
  assert.match(css, /var\(--readit-grid-cols/);
  assert.match(css, /contain:\s*inline-size/);
});

check("fitLayoutWidths respects right gutter", () => {
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
  assert.ok(fitted.pagePadRightPx >= 0);
  assert.ok(fitted.leftNavPx >= 64);
  assert.ok(fitted.rightRailPx >= 200);
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
  // Content budget 1128; growing main steals from rightRail then leftNav mins.
  assert.equal(next.rightRailPx, 200);
  assert.equal(next.leftNavPx, 64);
  assert.equal(next.feedWidthPx, 1128 - 200 - 64);
  assert.ok(next.feedWidthPx < 900);
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
  assert.match(css, /shreddit-async-loader/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /overflow-wrap:\s*break-word/);
  assert.match(css, /@container readit-nav/);
  assert.match(css, /container-name:\s*readit-nav/);
});

check("CSS edit-mode labeled frames", () => {
  const settings = createDefaultSettings();
  settings.flags.layoutSlots = true;
  settings.layoutSlots.editMode = true;
  const css = buildStylesheet(settings);
  assert.match(css, /readit-layout-frame/);
  assert.match(css, /readit-frame-label/);
  assert.match(css, /readit-drop-line/);
  assert.match(css, /outline:\s*none/);
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

check("CSS waveA lurker styles", () => {
  const settings = createDefaultSettings();
  const css = buildStylesheet(settings);
  assert.match(css, /readit-lurker/);
});

check("schema v7 column order defaults", () => {
  const settings = createDefaultSettings();
  assert.equal(settings.version, SETTINGS_VERSION);
  assert.equal(SETTINGS_VERSION, 7);
  assert.equal(settings.layoutSlots.preset, "singleColumn");
  assert.equal(settings.layoutSlots.widths.pagePadLeftPx, 48);
  assert.equal(settings.layoutSlots.editMode, false);
  assert.equal(settings.feedPrefs.feedDensity, "comfortable");
  assert.equal(settings.keyboardNavPrefs.mode, "defer");
  assert.equal(settings.flags.followingFeed, true);
  assert.equal(settings.flags.lurkerMode, false);
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

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall layout unit checks passed");
