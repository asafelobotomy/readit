/**
 * Unit checks for settings hardening: private event bus, field-level settings
 * repair, import preview, mark-read history, and element-picker guards.
 * Run: npm run test:hardening
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  buildStylesheet,
  isSafeElementRuleSelector,
} from "../packages/css-engine/src/index.ts";
import { emitReadit, onReadit } from "../packages/features/src/bus.ts";
import {
  MARK_READ_MAX_VISITED,
  mergeVisited,
} from "../packages/features/src/ux-extras.ts";
import {
  createDefaultSettings,
  migrateSettings,
  previewImport,
  ReaditSettingsSchema,
  repairSettings,
  SETTINGS_VERSION,
  unwrapImport,
  type ReaditSettings,
} from "../packages/schema/src/index.ts";
import { buildSelector, isStudioEvent } from "../extension/studio/picker.ts";

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

/** Defaults as they round-trip through chrome.storage (JSON). */
function stored(): Record<string, any> {
  return JSON.parse(JSON.stringify(createDefaultSettings()));
}

// —— 1. Private event bus (page scripts can neither forge nor read) ——

check("bus delivers payloads and unsubscribes", () => {
  const got: number[] = [];
  const off = onReadit("layout-pads", (d) => got.push(d.pagePadLeftPx));
  emitReadit("layout-pads", { pagePadLeftPx: 10, pagePadRightPx: 20 });
  off();
  emitReadit("layout-pads", { pagePadLeftPx: 99, pagePadRightPx: 99 });
  assert.deepEqual(got, [10]);
});

check("bus signal events carry optional payloads", () => {
  let opened = 0;
  let updated: ReaditSettings | undefined | "unset" = "unset";
  const offs = [
    onReadit("open-studio", () => (opened += 1)),
    onReadit("settings-updated", (d) => (updated = d)),
  ];
  emitReadit("open-studio");
  emitReadit("settings-updated");
  offs.forEach((off) => off());
  assert.equal(opened, 1);
  assert.equal(updated, undefined);
});

check("bus ignores same-named window events", () => {
  let hits = 0;
  const off = onReadit("layout-widths", () => (hits += 1));
  // What a reddit.com script would do: dispatch on the shared global target.
  globalThis.dispatchEvent?.(
    new CustomEvent("layout-widths", { detail: { feedWidthPx: 99999 } }),
  );
  globalThis.dispatchEvent?.(
    new CustomEvent("readit:layout-widths", { detail: { feedWidthPx: 99999 } }),
  );
  off();
  assert.equal(hits, 0);
});

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

check("no settings/persist traffic over window events", () => {
  const root = new URL("..", import.meta.url).pathname;
  const offenders: string[] = [];
  for (const file of [
    ...sourceFiles(join(root, "packages")),
    ...sourceFiles(join(root, "extension")),
  ]) {
    const src = readFileSync(file, "utf8");
    // The MAIN-world left-nav bridge is the one allowed payload-free signal.
    const hits = src.match(
      /(window\.dispatchEvent\(\s*new CustomEvent\(\s*["']readit:|addEventListener\(\s*(window,\s*)?["']readit:(?!hydrate-left-nav))/g,
    );
    if (hits) offenders.push(`${file}: ${hits.join(" | ")}`);
  }
  assert.deepEqual(offenders, []);
});

// —— 2. Field-level settings repair ——

check("valid settings repair to themselves with nothing reset", () => {
  const r = repairSettings(stored());
  assert.ok(r);
  assert.deepEqual(r.resetPaths, []);
  assert.deepEqual(r.settings, ReaditSettingsSchema.parse(stored()));
});

check("one out-of-range value no longer disables validation", () => {
  const raw = stored();
  raw.knobs.tokens.feedWidthPx = 2000;
  raw.layoutSlots.widthLocks = "oops";
  raw.evil = "x";
  raw.filters = [
    { id: "f1", kind: "keyword", pattern: "spoiler", enabled: true },
  ];
  const r = repairSettings(raw);
  assert.ok(r);
  assert.equal(r.settings.knobs.tokens.feedWidthPx, 920);
  assert.deepEqual(r.settings.layoutSlots.widthLocks, {});
  assert.equal("evil" in r.settings, false);
  // Unrelated user data survives.
  assert.equal(r.settings.filters.length, 1);
  assert.equal(r.settings.filters[0]!.pattern, "spoiler");
  assert.ok(r.resetPaths.includes("knobs.tokens.feedWidthPx"));
  assert.ok(ReaditSettingsSchema.safeParse(r.settings).success);
});

check("forged separators string is dropped (stylesheet crash)", () => {
  const raw = stored();
  raw.flags.layoutSlots = true;
  raw.layoutSlots.separators = "abc";
  const m = migrateSettings(raw);
  assert.ok(Array.isArray(m.layoutSlots.separators));
  assert.doesNotThrow(() => buildStylesheet(m));
});

check("non-array profiles fall back to builtins instead of throwing", () => {
  const raw = stored();
  raw.profiles = "nope";
  const m = migrateSettings(raw);
  assert.ok(m.profiles.length >= 5);
  assert.ok(ReaditSettingsSchema.safeParse(m).success);
});

check("invalid array elements are dropped individually", () => {
  const raw = stored();
  raw.tags = [
    { username: "good", label: "ok", color: "#123456", updatedAt: 1 },
    { username: "nolabel", color: "#123456", updatedAt: 1 },
    { username: "badtime", label: "x", color: "#123456", updatedAt: "soon" },
    { username: "alsogood", label: "ok2", color: "#abcdef", updatedAt: 2 },
  ];
  const r = repairSettings(raw);
  assert.ok(r);
  assert.deepEqual(
    r.settings.tags.map((t) => t.username),
    ["good", "alsogood"],
  );
});

check("NaN/null widths (storage JSON) repair to defaults", () => {
  const raw = stored();
  raw.subredditOverrides = [
    { subreddit: "pics", tokens: { feedWidthPx: Number.NaN } },
    { subreddit: "aww", tokens: { feedWidthPx: 300 } },
    { subreddit: "news", tokens: { feedWidthPx: 1000 } },
  ];
  const m = migrateSettings(raw);
  const bySub = Object.fromEntries(
    m.subredditOverrides.map((o) => [o.subreddit, o.tokens?.feedWidthPx]),
  );
  assert.equal(bySub.pics, undefined);
  assert.equal(bySub.aww, undefined);
  assert.equal(bySub.news, 1000);
  assert.ok(ReaditSettingsSchema.safeParse(m).success);
});

check("migrate output always satisfies the schema", () => {
  const corruptions: Array<(raw: Record<string, any>) => void> = [
    (r) => (r.layoutSlots = 7),
    (r) => (r.knobs = null),
    (r) => (r.cqsSnapshots = [{ tier: "Mythic" }]),
    (r) => (r.elementRules = [{ selector: 5 }]),
    (r) => (r.profiles = [{ id: "x" }]),
    (r) => (r.version = 3),
  ];
  for (const corrupt of corruptions) {
    const raw = stored();
    corrupt(raw);
    const m = migrateSettings(raw);
    assert.ok(ReaditSettingsSchema.safeParse(m).success, corrupt.toString());
    assert.equal(m.version, SETTINGS_VERSION);
  }
});

check("repair does not mutate its input", () => {
  const raw = stored();
  raw.knobs.tokens.feedWidthPx = 2000;
  repairSettings(raw);
  assert.equal(raw.knobs.tokens.feedWidthPx, 2000);
});

// —— 2b. Import preview uses the same repair ——

check("import preview accepts a repairable bundle with a warning", () => {
  const settings = stored();
  settings.subredditOverrides = [
    { subreddit: "aww", tokens: { feedWidthPx: 300 } },
  ];
  const bundle = {
    kind: "readit-export",
    exportedAt: 123,
    schemaVersion: SETTINGS_VERSION,
    settings,
  };
  const preview = previewImport(bundle);
  assert.equal(preview.ok, true);
  assert.equal(preview.kind, "bundle");
  assert.equal(preview.exportedAt, 123);
  assert.match(preview.warnings[0] ?? "", /reset to defaults/);
  assert.equal(unwrapImport(bundle), settings);
});

check("import preview of a clean bundle has no reset warning", () => {
  const preview = previewImport({
    kind: "readit-export",
    exportedAt: 1,
    schemaVersion: SETTINGS_VERSION,
    settings: stored(),
  });
  assert.equal(preview.ok, true);
  assert.deepEqual(preview.warnings, []);
});

check("import preview rejects arbitrary JSON", () => {
  for (const junk of [{ foo: 1 }, [], "x", null, { kind: "readit-export", settings: {} }]) {
    assert.equal(previewImport(junk).ok, false, JSON.stringify(junk));
  }
  const raw = previewImport(stored());
  assert.equal(raw.ok, true);
  assert.equal(raw.kind, "raw");
});

// —— 3. Mark-read history (no page localStorage) ——

check("mark-read history no longer touches page localStorage", () => {
  const src = readFileSync(
    new URL("../packages/features/src/ux-extras.ts", import.meta.url),
    "utf8",
  );
  assert.equal(/localStorage/.test(src), false);
});

check("mergeVisited unions, keeps newest last, and caps", () => {
  assert.deepEqual(mergeVisited(["a", "b"], ["b", "c"]), ["a", "b", "c"]);
  assert.deepEqual(mergeVisited(["a", "b", "c"], ["a"]), ["b", "c", "a"]);
  const many = Array.from({ length: MARK_READ_MAX_VISITED + 10 }, (_, i) => `p${i}`);
  const merged = mergeVisited(many, []);
  assert.equal(merged.length, MARK_READ_MAX_VISITED);
  assert.equal(merged.at(-1), `p${MARK_READ_MAX_VISITED + 9}`);
});

// —— 4. Element picker cannot hide readit itself ——

type FakeEl = {
  tagName: string;
  id: string;
  parentElement: FakeEl | null;
  children: FakeEl[];
  closest: (sel: string) => FakeEl | null;
  getAttribute: (name: string) => string | null;
};

function fakeEl(tagName: string, parent: FakeEl | null = null, id = ""): FakeEl {
  const el: FakeEl = {
    tagName: tagName.toUpperCase(),
    id,
    parentElement: parent,
    children: [],
    closest(sel) {
      const wanted = sel.split(",").map((s) => s.trim().toLowerCase());
      for (let n: FakeEl | null = el; n; n = n.parentElement) {
        if (wanted.includes(n.tagName.toLowerCase())) return n;
        if (n.id && wanted.includes(`#${n.id.toLowerCase()}`)) return n;
      }
      return null;
    },
    getAttribute: () => null,
  };
  parent?.children.push(el);
  return el;
}

check("picker treats clicks inside the studio shadow tree as studio clicks", () => {
  const html = fakeEl("html");
  const body = fakeEl("body", html);
  const host = fakeEl("readit-studio", body);
  const inner = fakeEl("div", null, "readit-root");
  const fab = fakeEl("button", inner);
  // Document-level listener: target is retargeted to the host, but
  // composedPath() still includes the shadow-tree nodes.
  const fromFab = { composedPath: () => [fab, inner, { host }, host, body, html] };
  assert.equal(isStudioEvent(fromFab as unknown as Event), true);
  const hostOnly = { composedPath: () => [host, body, html] };
  assert.equal(isStudioEvent(hostOnly as unknown as Event), true);

  const post = fakeEl("shreddit-post", body);
  const fromReddit = { composedPath: () => [post, body, html] };
  assert.equal(isStudioEvent(fromReddit as unknown as Event), false);
});

check("buildSelector refuses readit UI and page roots", () => {
  const html = fakeEl("html");
  const body = fakeEl("body", html);
  const host = fakeEl("readit-studio", body);
  const insideStudio = fakeEl("div", host);
  for (const el of [html, body, host, insideStudio]) {
    assert.equal(buildSelector(el as unknown as Element), null, el.tagName);
  }
  const post = fakeEl("shreddit-post", body, "t3_abc");
  assert.equal(buildSelector(post as unknown as Element), "#t3_abc");
});

check("stylesheet skips unsafe element-rule selectors", () => {
  for (const bad of [
    "readit-studio",
    "html > readit-studio",
    "body > READIT-STUDIO",
    "#readit-root",
    "body",
    ":root",
    "a{} body{background:url(https://evil.example/x)} b",
    "div /* swallow",
    "  ",
  ]) {
    assert.equal(isSafeElementRuleSelector(bad), false, bad);
  }
  for (const good of [
    "shreddit-post > div:nth-of-type(2)",
    '[data-testid="frontpage-sidebar"]',
    "#right-sidebar-container",
  ]) {
    assert.equal(isSafeElementRuleSelector(good), true, good);
  }

  const s = createDefaultSettings();
  s.flags.elementRules = true;
  s.elementRules = [
    { id: "a", selector: "body > readit-studio", action: "hide", label: "", enabled: true },
    { id: "b", selector: "#right-sidebar-container", action: "hide", label: "", enabled: true },
  ];
  const css = buildStylesheet(s);
  assert.equal(css.includes("readit-studio { display: none"), false);
  assert.ok(css.includes("#right-sidebar-container { display: none !important; }"));
});

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall hardening unit checks passed");
