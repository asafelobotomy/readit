/**
 * Unit checks for layout slot presets + CSS recipes + keyboard focus guard.
 * Run: npm run test:layout
 */
import assert from "node:assert/strict";
import { buildStylesheet, LAYOUT_RECIPE_MARKER } from "../packages/css-engine/src/index.ts";
import { isEditableTarget } from "../packages/features/src/reader-creator.ts";
import {
  applyLayoutPreset,
  addLayoutSeparator,
  moveLayoutSeparator,
  removeLayoutSeparator,
  layoutSlotsHealth,
  presetToPlacements,
  resolveSlots,
  swapLayoutColumns,
} from "../packages/features/src/layout-slots.ts";
import {
  classifyNavSection,
  modelFingerprint,
  type NavModel,
} from "../packages/features/src/nav-rail.ts";
import {
  applyProfile,
  BUILTIN_PROFILES,
  buildLayoutTracks,
  clampColumnGap,
  clampPagePad,
  clampPanelWidth,
  createDefaultSettings,
  fitLayoutWidths,
  formatProfileLayoutBlurb,
  previewImport,
  resizePadInBudget,
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
  assert.equal(clampPanelWidth("leftNav", 500), 400);
  assert.equal(clampPanelWidth("main", 200), 480);
  assert.equal(clampPanelWidth("main", 2000), 1600);
  assert.equal(clampPanelWidth("rightRail", 100), 280);
  assert.equal(clampPanelWidth("rightRail", 250), 280);
  assert.equal(clampPanelWidth("rightRail", 300), 300);
  assert.equal(clampPanelWidth("rightRail", 500), 400);
});

check("page pad + column gap defaults and CSS", () => {
  const settings = createDefaultSettings();
  // Focus Reader recipe uses 48px pads; classic columns still expose pad CSS vars.
  assert.equal(settings.layoutSlots.widths.pagePadLeftPx, 48);
  assert.equal(settings.layoutSlots.widths.pagePadRightPx, 48);
  assert.equal(settings.layoutSlots.widths.columnGapPx, 12);
  assert.equal(clampPagePad(-10), 0);
  assert.equal(clampPagePad(999), 160);
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
  assert.ok(fitted.rightRailPx >= 280);
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
  assert.equal(next.rightRailPx, 280);
  // Remaining after rail min: 1128 - 280 = 848 for main+nav; main wants 900 → nav shrinks.
  assert.equal(next.feedWidthPx + next.leftNavPx + next.rightRailPx, 1128);
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
});

check("resizePadInBudget donates shrink to feed", () => {
  const order = ["leftNav", "main", "rightRail"] as const;
  const next = resizePadInBudget(
    {
      leftNavPx: 64,
      rightRailPx: 280,
      feedWidthPx: 700,
      pagePadLeftPx: 160,
      pagePadRightPx: 48,
      columnGapPx: 8,
    },
    [...order],
    "left",
    24,
    1920,
  );
  assert.equal(next.pagePadLeftPx, 24);
  assert.equal(next.feedWidthPx, 700 + (160 - 24));
});

check("huge legacy pads clamp and cannot starve columns", () => {
  const order = ["leftNav", "main", "rightRail"] as const;
  const fitted = fitLayoutWidths(
    {
      leftNavPx: 64,
      rightRailPx: 160,
      feedWidthPx: 720,
      pagePadLeftPx: 480,
      pagePadRightPx: 480,
      columnGapPx: 12,
    },
    [...order],
    1920,
  );
  assert.ok(fitted.pagePadLeftPx <= 160);
  assert.ok(fitted.pagePadRightPx <= 160);
  assert.ok(fitted.rightRailPx >= 280);
  assert.ok(fitted.feedWidthPx >= 480);
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
        iconSvg: "<svg></svg>",
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

check("CSS compact nav/rail containment", () => {
  const settings = createDefaultSettings();
  settings.flags.layoutSlots = true;
  settings.layoutSlots = applyLayoutPreset(settings.layoutSlots, "classic");
  settings.layoutSlots.widths = {
    ...settings.layoutSlots.widths,
    leftNavPx: 64,
    rightRailPx: 160, // legacy thin — must clamp in recipe
  };
  const css = buildStylesheet(settings);
  assert.match(css, /readit-nav-compact/);
  assert.match(css, /readit-rail-compact/);
  assert.match(css, /--readit-right-rail-width:\s*280px/);
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
  assert.match(css, /outline:\s*none/);
  assert.match(css, /\[data-drop="1"\][\s\S]*?border-style:\s*dashed/);
  assert.match(css, /\[data-readit-slot\][\s\S]*?pointer-events:\s*none/);
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

check("schema v8 column order defaults", () => {
  const settings = createDefaultSettings();
  assert.equal(settings.version, SETTINGS_VERSION);
  assert.equal(SETTINGS_VERSION, 8);
  assert.deepEqual(settings.layoutSlots.separators, []);
  assert.equal(settings.layoutSlots.gutterTheme, "plain");
  assert.equal(settings.layoutSlots.zoomAll, 1);
  assert.equal(settings.knobs.tokens.fontFamily, "system");
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
    tracks.map((t) => (t.type === "panel" ? t.panel : `sep:${t.widthPx}`)),
    ["leftNav", "sep:24", "main", "sep:40", "rightRail"],
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
    tracks.map((t) => (t.type === "panel" ? t.panel : "sep")),
    ["leftNav", "main", "sep", "rightRail"],
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
