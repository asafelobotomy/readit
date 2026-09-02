/**
 * Unit checks for layout slot presets + CSS recipes + keyboard focus guard.
 * Run: npm run test:layout
 */
import assert from "node:assert/strict";
import { buildStylesheet, LAYOUT_RECIPE_MARKER } from "../packages/css-engine/src/index.ts";
import { isEditableTarget } from "../packages/features/src/reader-creator.ts";
import {
  layoutSlotsHealth,
  presetToPlacements,
  resolveSlots,
} from "../packages/features/src/layout-slots.ts";
import {
  createDefaultSettings,
  previewImport,
  SETTINGS_VERSION,
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
  settings.layoutSlots = {
    ...settings.layoutSlots,
    preset: "navRight",
    placements: presetToPlacements("navRight"),
  };
  const css = buildStylesheet(settings);
  assert.ok(css.includes(LAYOUT_RECIPE_MARKER));
  assert.match(css, /readit-layout:navRight/);
  assert.match(css, /data-readit-slot="leftNav"/);
  assert.match(css, /flex-direction: row-reverse/);
});

check("CSS singleColumn recipe", () => {
  const settings = createDefaultSettings();
  settings.flags.layoutSlots = true;
  settings.layoutSlots = {
    ...settings.layoutSlots,
    preset: "singleColumn",
    placements: presetToPlacements("singleColumn"),
  };
  const css = buildStylesheet(settings);
  assert.match(css, /readit-layout:singleColumn/);
  assert.match(css, /#left-sidebar-container/);
  assert.match(css, /#right-sidebar-container/);
  assert.match(css, /display: none !important/);
});

check("CSS noise pack aiSummary", () => {
  const settings = createDefaultSettings();
  settings.knobs.hide.aiSummary = true;
  const css = buildStylesheet(settings);
  assert.match(css, /ai-summary|ai_summary/i);
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
