/**
 * Unit checks for settings hardening: private event bus, field-level settings
 * repair, import preview, mark-read history, element-picker guards, and the
 * medium-severity fixes (mod actions, import URLs/selectors, filters, CQS
 * attribution, mutation ownership), and the low-severity ones (J/K targeting,
 * lightweight sync, exact-name filters, mark-read mode).
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
  isSubmitButton,
  isInsideUserContent,
  isOwnRemovalMarker,
  normalizeUsername,
} from "../packages/features/src/cqs.ts";
import {
  filtersFeature,
  parseRedditScore,
  postMatchesRule,
  type FilterablePost,
} from "../packages/features/src/hide-and-filter.ts";
import {
  findNativeModControl,
  isModeratedPost,
  matchesNativeModLabel,
  modHighlightFeature,
} from "../packages/features/src/mod.ts";
import {
  isReaditMutation,
  READIT_OWNED_SELECTOR,
} from "../packages/features/src/mutations.ts";
import {
  allFeedUrl,
  commentSortFromMenuValue,
  directLoadCommentSortUrl,
  isAllFeedPage,
  isAllHref,
  originalAttr,
  rememberCommentSort,
  resolveCommentSort,
  restoreAttr,
  stampAttr,
  withCommentSort,
} from "../packages/features/src/link-stamp.ts";
import { popoutHrefFromPath } from "../packages/features/src/post-popout.ts";
import { nextPostIndex } from "../packages/features/src/reader-creator.ts";
import {
  isFormattingToggleLabel,
  MARK_READ_MAX_VISITED,
  mergeVisited,
  rememberVisited,
} from "../packages/features/src/ux-extras.ts";
import {
  applyLightweightSync,
  applyProfile,
  createDefaultSettings,
  effectiveMarkReadMode,
  isSafeHttpUrl,
  parseLightweightSync,
  migrateSettings,
  normalizeSubredditName,
  previewImport,
  ReaditSettingsSchema,
  repairSettings,
  SETTINGS_VERSION,
  unwrapImport,
  type FilterRule,
  type ReaditSettings,
} from "../packages/schema/src/index.ts";
import { buildSelector, isStudioEvent } from "../extension/studio/picker.ts";
import { isFeedTabCandidate } from "../packages/features/src/feed-philosophy.ts";

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
    "a:not(",
    '[title="x',
    "a[href",
    "a)",
    "a\\",
    "@media screen",
    "  ",
  ]) {
    assert.equal(isSafeElementRuleSelector(bad), false, bad);
  }
  for (const good of [
    "shreddit-post > div:nth-of-type(2)",
    '[data-testid="frontpage-sidebar"]',
    "#right-sidebar-container",
    'a[title="(x"]',
    "div:not(.a, .b)",
    "#a\\:b",
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
  assert.ok(
    css.includes(
      ":is(#right-sidebar-container):not(readit-studio, :has(readit-studio)) { display: none !important; }",
    ),
  );
});

// —— 5. Mod quick actions only report what really happened ——

check("subreddit names normalize for mod linking", () => {
  assert.equal(normalizeSubredditName("r/Cherry_Jammm_"), "cherry_jammm_");
  assert.equal(normalizeSubredditName("/r/AskReddit/"), "askreddit");
  assert.equal(normalizeSubredditName("https://www.reddit.com/r/pics/"), "pics");
  assert.equal(normalizeSubredditName("u/CherryJammm"), "u_cherryjammm");
  assert.equal(normalizeSubredditName("u_cherryjammm"), "u_cherryjammm");
  assert.equal(normalizeSubredditName("askreddit"), "askreddit");
  assert.equal(normalizeSubredditName("r/has space"), null);
  assert.equal(normalizeSubredditName(""), null);
  assert.equal(normalizeSubredditName("r/<script>"), null);
});

check("modSubreddits: stored normalized, deduped, bad entries dropped", () => {
  const raw = {
    ...createDefaultSettings(),
    modSubreddits: ["r/Pics", "pics", "bad name!", "u/Me"],
  };
  const migrated = migrateSettings(raw);
  assert.deepEqual(migrated.modSubreddits, ["pics", "u_me"]);
  assert.deepEqual(createDefaultSettings().modSubreddits, []);
  const legacy = { ...createDefaultSettings() } as Record<string, unknown>;
  delete legacy.modSubreddits;
  assert.deepEqual(migrateSettings(legacy).modSubreddits, []);
});

check("mod quick actions only on linked subreddits", () => {
  const post = (attrs: Record<string, string>) =>
    ({ getAttribute: (k: string) => attrs[k] ?? null }) as unknown as Element;
  const linked = new Set(["cherry_jammm_", "u_cherryjammm"]);
  assert.equal(isModeratedPost(post({ "subreddit-name": "cherry_jammm_" }), linked), true);
  assert.equal(isModeratedPost(post({ "subreddit-name": "Cherry_Jammm_" }), linked), true);
  assert.equal(isModeratedPost(post({ "subreddit-prefixed-name": "r/cherry_jammm_" }), linked), true);
  assert.equal(isModeratedPost(post({ "subreddit-name": "u_cherryjammm" }), linked), true);
  assert.equal(isModeratedPost(post({ "subreddit-name": "AskReddit" }), linked), false);
  assert.equal(isModeratedPost(post({}), linked), false);
  // Nothing linked → no mod tools anywhere.
  assert.equal(isModeratedPost(post({ "subreddit-name": "cherry_jammm_" }), new Set()), false);
});

check("mod labels match whole names only", () => {
  assert.equal(matchesNativeModLabel("Lock", "Lock post"), true);
  assert.equal(matchesNativeModLabel("Lock", "Lock comments"), true);
  assert.equal(matchesNativeModLabel("Lock", "Block user"), false);
  assert.equal(matchesNativeModLabel("Lock", "Unlock"), false);
  assert.equal(matchesNativeModLabel("Remove", "Remove"), true);
  assert.equal(matchesNativeModLabel("Remove", "Remove from saved"), false);
  assert.equal(matchesNativeModLabel("Spam", "Mark as spam"), true);
  assert.equal(matchesNativeModLabel("Spam", "Report spam wave"), false);
  assert.equal(matchesNativeModLabel("Approve", "  approve  POST "), true);
  assert.equal(matchesNativeModLabel("Approve", null), false);
});

function fakeLabeled(label: string, inReaditBar = false) {
  return {
    getAttribute: (n: string) => (n === "aria-label" ? label : null),
    closest: (sel: string) => (inReaditBar && sel.includes("readit-mod-bar") ? {} : null),
  };
}

check("native mod control lookup skips readit's own bar and near-misses", () => {
  const block = fakeLabeled("Block user");
  const ours = fakeLabeled("Lock", true);
  const post = {
    shadowRoot: null,
    querySelectorAll: () => [block, ours],
  } as unknown as Element;
  assert.equal(findNativeModControl(post, "Lock"), null);

  const real = fakeLabeled("Lock post");
  const shadowPost = {
    shadowRoot: { querySelectorAll: () => [real] },
    querySelectorAll: () => [block],
  } as unknown as Element;
  assert.equal(findNativeModControl(shadowPost, "Lock"), real);
});

// —— 6. Imported packs can't carry script URLs or stylesheet injection ——

check("only http(s) URLs are safe link targets", () => {
  assert.equal(isSafeHttpUrl("https://www.reddit.com/r/x/comments/1/"), true);
  assert.equal(isSafeHttpUrl("http://redd.it/abc"), true);
  for (const bad of [
    "javascript:alert(1)",
    " JavaScript:alert(1)",
    "data:text/html,<b>x</b>",
    "/r/relative",
    "",
  ]) {
    assert.equal(isSafeHttpUrl(bad), false, bad);
  }
});

check("imports drop script URLs and unsafe selectors, keep the rest", () => {
  const settings = stored();
  settings.savedItems = [
    { id: "s1", url: "javascript:alert(document.cookie)", title: "evil", folderId: "inbox", addedAt: 1 },
    { id: "s2", url: "https://www.reddit.com/r/x/", title: "ok", folderId: "inbox", addedAt: 2 },
  ];
  settings.elementRules = [
    { id: "e1", selector: "a{} body{background:url(https://evil.example/)}", action: "hide", label: "", enabled: true },
    { id: "e2", selector: "#right-sidebar-container", action: "hide", label: "", enabled: true },
  ];
  settings.usernotes = [
    { id: "n1", username: "bob", type: "misc", text: "hi", link: "javascript:x", createdAt: 1 },
  ];
  const preview = previewImport({ kind: "readit-export", exportedAt: 1, settings });
  assert.equal(preview.ok, true);
  assert.match(preview.warnings[0] ?? "", /reset to defaults/);
  const m = migrateSettings(unwrapImport({ kind: "readit-export", exportedAt: 1, settings }));
  assert.deepEqual(m.savedItems.map((i) => i.id), ["s2"]);
  assert.deepEqual(m.elementRules.map((r) => r.id), ["e2"]);
  assert.equal(m.usernotes.length, 1);
  assert.equal(m.usernotes[0]!.link, undefined);
});

// —— 7. Filters ——

check("vote counts parse like Reddit renders them", () => {
  assert.equal(parseRedditScore("1,234"), 1234);
  assert.equal(parseRedditScore("1.2k"), 1200);
  assert.equal(parseRedditScore("3.4M"), 3_400_000);
  assert.equal(parseRedditScore("-5"), -5);
  assert.equal(parseRedditScore("42"), 42);
  assert.equal(parseRedditScore(""), null);
  assert.equal(parseRedditScore("Vote"), null);
  assert.equal(parseRedditScore(null), null);
  assert.equal(parseRedditScore(undefined), null);
});

const basePost: FilterablePost = {
  text: "",
  author: "",
  subreddit: "",
  link: "",
  flair: "",
  score: null,
};
const karmaRule: FilterRule = {
  id: "k",
  kind: "karmaMax",
  pattern: "100",
  enabled: true,
} as FilterRule;

check("karma ceiling ignores unknown scores and reads k/M", () => {
  assert.equal(postMatchesRule({ ...basePost, score: null }, karmaRule), false);
  assert.equal(postMatchesRule({ ...basePost, score: parseRedditScore("1.2k") }, karmaRule), false);
  assert.equal(postMatchesRule({ ...basePost, score: 50 }, karmaRule), true);
});

type FakePost = {
  attrs: Map<string, string>;
  style: { display: string };
  textContent: string;
  childElementCount: number;
  getAttribute: (n: string) => string | null;
  setAttribute: (n: string, v: string) => void;
  removeAttribute: (n: string) => void;
  querySelector: () => null;
};

function fakePost(text: string): FakePost {
  const attrs = new Map<string, string>();
  return {
    attrs,
    style: { display: "" },
    textContent: text,
    childElementCount: 1,
    getAttribute: (n) => attrs.get(n) ?? null,
    setAttribute: (n, v) => void attrs.set(n, v),
    removeAttribute: (n) => void attrs.delete(n),
    querySelector: () => null,
  };
}

check("editing or removing a filter rule unhides the posts it hid", () => {
  const posts = [fakePost("big spoiler inside"), fakePost("cats")];
  const prevDocument = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = {
    querySelectorAll: (sel: string) =>
      sel.includes("[data-readit-feature-filters")
        ? posts.filter((p) => p.attrs.has("data-readit-feature-filters"))
        : posts,
  };
  try {
    const settings = createDefaultSettings();
    settings.flags.filters = true;
    const ctx = (filters: FilterRule[]) => ({
      settings: { ...settings, filters },
      subreddit: null,
      pathname: "/",
    });
    const spoiler = { id: "f", kind: "keyword", pattern: "spoiler", enabled: true } as FilterRule;

    filtersFeature.apply(ctx([spoiler]));
    assert.deepEqual(posts.map((p) => p.style.display), ["none", ""]);

    filtersFeature.apply(ctx([{ ...spoiler, enabled: false }]));
    assert.deepEqual(posts.map((p) => p.style.display), ["", ""]);

    filtersFeature.apply(ctx([{ ...spoiler, pattern: "cats" }]));
    assert.deepEqual(posts.map((p) => p.style.display), ["", "none"]);

    filtersFeature.apply(ctx([]));
    assert.deepEqual(posts.map((p) => p.style.display), ["", ""]);
  } finally {
    filtersFeature.teardown({} as never);
    (globalThis as { document?: unknown }).document = prevDocument;
  }
});

// —— 8. CQS signals are attributed to the user's own content ——

function inAuthored(author: string | null, userContent = true) {
  return {
    closest: (sel: string) =>
      author !== null && (sel.includes("shreddit-comment") || (userContent && sel.includes(".md")))
        ? { getAttribute: (n: string) => (n === "author" ? author : null) }
        : null,
  };
}

check("usernames normalize", () => {
  assert.equal(normalizeUsername(" u/Alice "), "alice");
  assert.equal(normalizeUsername("/u/Bob/"), "bob");
  assert.equal(normalizeUsername(""), "");
  assert.equal(normalizeUsername(undefined), "");
});

check("removal markers only count on your own content", () => {
  assert.equal(isOwnRemovalMarker(inAuthored("someone_else"), "me"), false);
  assert.equal(isOwnRemovalMarker(inAuthored("Me"), "u/me"), true);
  // No configured username → can't attribute → ignored.
  assert.equal(isOwnRemovalMarker(inAuthored("me"), ""), false);
  assert.equal(isOwnRemovalMarker(inAuthored(null), "me"), false);
});

check("restriction text inside posts/comments is not account messaging", () => {
  assert.equal(isInsideUserContent(inAuthored("anyone")), true);
  assert.equal(isInsideUserContent({ closest: () => null }), false);
});

// —— 9. Mutation filter judges changed nodes, not data-readit-* attributes ——

const READIT_OWNED = new Set(["readit-user-tag", "readit-mod-bar", "readit-layout-frame"]);

function el(cls: string, parent: FakeNode | null = null): FakeNode {
  const node: FakeNode = {
    nodeType: 1,
    cls,
    parentElement: parent,
    closest(_sel: string) {
      for (let n: FakeNode | null = node; n; n = n.parentElement) {
        if (READIT_OWNED.has(n.cls)) return n;
      }
      return null;
    },
  };
  return node;
}
type FakeNode = {
  nodeType: number;
  cls: string;
  parentElement: FakeNode | null;
  closest: (sel: string) => FakeNode | null;
};
const text = (parent: FakeNode | null) => ({ nodeType: 3, parentElement: parent });

check("Reddit updates inside readit-stamped elements still trigger a rescan", () => {
  // #main-content carries data-readit-slot, but it is Reddit's element.
  const main = el("main-content");
  const feedSwap = { target: main, addedNodes: [el("shreddit-feed")], removedNodes: [] };
  assert.equal(isReaditMutation([feedSwap]), false);

  const mixed = {
    target: main,
    addedNodes: [el("readit-user-tag"), el("shreddit-post")],
    removedNodes: [],
  };
  assert.equal(isReaditMutation([mixed]), false);
});

check("readit's own insertions and in-widget edits are skipped", () => {
  const link = el("a");
  const badge = { target: link, addedNodes: [el("readit-user-tag")], removedNodes: [] };
  const bar = el("readit-mod-bar");
  const btn = el("button", bar);
  const relabel = { target: btn, addedNodes: [text(btn)], removedNodes: [text(null)] };
  const frameGone = { target: el("host"), addedNodes: [], removedNodes: [el("readit-layout-frame")] };
  assert.equal(isReaditMutation([badge, relabel, frameGone]), true);
  const emptyOnReddit = { target: link, addedNodes: [], removedNodes: [] };
  assert.equal(isReaditMutation([emptyOnReddit]), false);
});

// —— Low severity ——

check("J/K picks the next/previous post from viewport tops", () => {
  // Post 1 sits at the anchor (just scrolled there): J → 2, K → 0.
  const tops = [-900, 64, 700, 1400];
  assert.equal(nextPostIndex(tops, "j"), 2);
  assert.equal(nextPostIndex(tops, "k"), 0);
  // Mid-post (current top above the anchor): K returns to its start.
  assert.equal(nextPostIndex([-300, 500], "k"), 0);
  assert.equal(nextPostIndex([-300, 500], "j"), 1);
  // Top of the feed, nothing above the anchor yet.
  assert.equal(nextPostIndex([120, 800], "j"), 0);
  assert.equal(nextPostIndex([120, 800], "k"), 0);
  // End of the feed stays on the last post.
  assert.equal(nextPostIndex([-2000, 64], "j"), 1);
  assert.equal(nextPostIndex([], "j"), null);
});

check("synced payloads are validated", () => {
  assert.deepEqual(
    parseLightweightSync({ activeProfileId: "dense-power", mode: "advanced", paused: true }),
    { activeProfileId: "dense-power", mode: "advanced", paused: true },
  );
  for (const bad of [
    null,
    "x",
    { activeProfileId: "a", mode: "turbo", paused: false },
    { activeProfileId: 5, mode: "simple", paused: false },
    { activeProfileId: "a", mode: "simple" },
  ]) {
    assert.equal(parseLightweightSync(bad), null, JSON.stringify(bad));
  }
});

check("applying a synced profile brings its knobs, ignores unknown ids", () => {
  const base = createDefaultSettings();
  const switched = applyLightweightSync(base, {
    activeProfileId: "dense-power",
    mode: base.mode,
    paused: false,
  });
  assert.equal(switched.activeProfileId, "dense-power");
  assert.deepEqual(switched.knobs, applyProfile(base, "dense-power").knobs);

  const unknown = applyLightweightSync(base, {
    activeProfileId: "only-on-other-device",
    mode: "advanced",
    paused: true,
  });
  assert.equal(unknown.activeProfileId, base.activeProfileId);
  assert.equal(unknown.mode, "advanced");
  assert.equal(unknown.paused, true);

  // Identical payload → same object, so pull doesn't re-save (no sync echo).
  const same = applyLightweightSync(base, {
    activeProfileId: base.activeProfileId,
    mode: base.mode,
    paused: base.paused,
  });
  assert.equal(same, base);
});

check("user/subreddit filters match whole names", () => {
  const user = { id: "u", kind: "user", pattern: "u/bob", enabled: true } as FilterRule;
  assert.equal(postMatchesRule({ ...basePost, author: "bob" }, user), true);
  assert.equal(postMatchesRule({ ...basePost, author: "u/Bob" }, user), true);
  assert.equal(postMatchesRule({ ...basePost, author: "bobby" }, user), false);
  const sub = { id: "s", kind: "subreddit", pattern: "pics", enabled: true } as FilterRule;
  assert.equal(postMatchesRule({ ...basePost, subreddit: "r/pics" }, sub), true);
  assert.equal(postMatchesRule({ ...basePost, subreddit: "r/picsofdogs" }, sub), false);
});

check("mark-read mode shown matches the mode in effect", () => {
  assert.equal(effectiveMarkReadMode("off"), "open");
  assert.equal(effectiveMarkReadMode("onScroll"), "onScroll");
  const base = createDefaultSettings();
  assert.equal(base.markReadPrefs.mode, "off");
  const profile = base.profiles.find((p) => p.flags.markRead);
  assert.ok(profile, "a builtin profile enables mark-read");
  const next = applyProfile(base, profile.id);
  assert.equal(next.flags.markRead, true);
  assert.equal(next.markReadPrefs.mode, "open");
});

check("formatting auto-expand only matches whole-word format labels", () => {
  assert.equal(isFormattingToggleLabel("Show formatting options"), true);
  assert.equal(isFormattingToggleLabel("Format"), true);
  assert.equal(isFormattingToggleLabel("More information"), false);
  assert.equal(isFormattingToggleLabel("Transformation details"), false);
  assert.equal(isFormattingToggleLabel(null), false);
});

check("mod-route highlight clears after navigating off a mod route", () => {
  const classes = new Set<string>();
  const prevDocument = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = {
    documentElement: {
      classList: {
        toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)),
        remove: (c: string) => classes.delete(c),
      },
    },
  };
  try {
    const settings = createDefaultSettings();
    settings.flags.modHighlight = true;
    const ctx = (pathname: string) => ({ settings, subreddit: null, pathname });
    modHighlightFeature.apply(ctx("/r/pics/about/modqueue"));
    assert.equal(classes.has("readit-mod-route"), true);
    modHighlightFeature.apply(ctx("/r/pics/"));
    assert.equal(classes.has("readit-mod-route"), false);
  } finally {
    (globalThis as { document?: unknown }).document = prevDocument;
  }
});

check("re-remembering the newest visited post does not re-save history", () => {
  const saves: string[][] = [];
  const ctx = {
    settings: createDefaultSettings(),
    subreddit: null,
    pathname: "/",
    visitedPosts: { initial: [], save: (keys: string[]) => saves.push(keys) },
  };
  rememberVisited(ctx, "/r/a/comments/1");
  rememberVisited(ctx, "/r/a/comments/1");
  rememberVisited(ctx, "/r/a/comments/1");
  assert.equal(saves.length, 1);
  rememberVisited(ctx, "/r/a/comments/2");
  rememberVisited(ctx, "/r/a/comments/1");
  assert.equal(saves.length, 3);
  assert.deepEqual(saves.at(-1)?.slice(-2), ["/r/a/comments/2", "/r/a/comments/1"]);
});

check("posts that passed the filters are not re-read until they change", () => {
  let reads = 0;
  const post = fakePost("");
  Object.defineProperty(post, "textContent", {
    get: () => {
      reads++;
      return "cats";
    },
  });
  const prevDocument = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = {
    querySelectorAll: (sel: string) =>
      sel.includes("[data-readit-feature-filters") ? [] : [post],
  };
  try {
    const settings = createDefaultSettings();
    settings.flags.filters = true;
    const rule = { id: "f", kind: "keyword", pattern: "dogs", enabled: true } as FilterRule;
    const ctx = { settings: { ...settings, filters: [rule] }, subreddit: null, pathname: "/" };
    filtersFeature.apply(ctx);
    filtersFeature.apply(ctx);
    assert.equal(reads, 1);
    post.childElementCount = 2; // hydrated
    filtersFeature.apply(ctx);
    assert.equal(reads, 2);
    filtersFeature.apply({ ...ctx, settings: { ...ctx.settings, filters: [{ ...rule, pattern: "cat" }] } });
    assert.equal(reads, 3);
    assert.equal(post.style.display, "none");
  } finally {
    filtersFeature.teardown({} as never);
    (globalThis as { document?: unknown }).document = prevDocument;
  }
});

/** Minimal element double: `ancestors` are the selectors `closest()` matches. */
function fakeControl(
  tag: string,
  opts: { text?: string; attrs?: Record<string, string>; ancestors?: string[] } = {},
) {
  const attrs = opts.attrs ?? {};
  const ancestors = opts.ancestors ?? [];
  return {
    tagName: tag.toUpperCase(),
    textContent: opts.text ?? "",
    getAttribute: (n: string) => attrs[n] ?? null,
    closest: (sel: string) =>
      sel.split(",").some((part) => ancestors.includes(part.trim())) ? {} : null,
  } as unknown as Element;
}

check("CQS counts composer submits, not 'Hide post' or a feed Save", () => {
  assert.equal(isSubmitButton(fakeControl("button", { text: "Comment", ancestors: ["shreddit-composer"] })), true);
  assert.equal(isSubmitButton(fakeControl("button", { text: " Post ", attrs: { type: "submit" } })), true);
  assert.equal(isSubmitButton(fakeControl("button", { text: "Hide post", ancestors: ["form"] })), false);
  assert.equal(isSubmitButton(fakeControl("button", { text: "Save" })), false);
  assert.equal(isSubmitButton(fakeControl("button", { text: "Share post" })), false);
});

check("Following feed switch never picks a follow toggle", () => {
  assert.equal(isFeedTabCandidate(fakeControl("faceplate-tab")), true);
  assert.equal(isFeedTabCandidate(fakeControl("a", { attrs: { href: "/?feed=following" } })), true);
  assert.equal(isFeedTabCandidate(fakeControl("button", { ancestors: ["[role='tablist']"] })), true);
  assert.equal(isFeedTabCandidate(fakeControl("button")), false);
  assert.equal(
    isFeedTabCandidate(fakeControl("button", { attrs: { role: "tab" }, ancestors: ["faceplate-hovercard"] })),
    false,
  );
  assert.equal(isFeedTabCandidate(fakeControl("a", { attrs: { href: "/u/x" }, ancestors: ["shreddit-post"] })), false);
});

check("broad element rules can never hide the studio host", () => {
  const s = createDefaultSettings();
  s.flags.elementRules = true;
  s.elementRules = [
    { id: "a", selector: "body > *", action: "hide", label: "", enabled: true },
    { id: "b", selector: "html > body", action: "dim", label: "", enabled: true },
  ];
  const css = buildStylesheet(s);
  assert.ok(css.includes(":is(body > *):not(readit-studio, :has(readit-studio)) { display: none !important; }"));
  assert.ok(css.includes(":is(html > body):not(readit-studio, :has(readit-studio)) { opacity: 0.35 !important; }"));
});

// —— Classic habits (0.3.0): comment sort, new tab, All · Global ——

check("withCommentSort adds ?sort= to thread links only", () => {
  const thread = "/r/AskReddit/comments/1wpfkk1/whats_up/";
  assert.equal(withCommentSort(thread, "top"), `${thread}?sort=top`);
  assert.equal(
    withCommentSort(`https://www.reddit.com${thread}?utm_source=x#c`, "new"),
    `https://www.reddit.com${thread}?utm_source=x&sort=new#c`,
  );
  // No slug, no trailing slash.
  assert.equal(
    withCommentSort("/r/pics/comments/abc123", "old"),
    "/r/pics/comments/abc123?sort=old",
  );
  // Already sorted, single-comment permalink, feeds, other sites: untouched.
  assert.equal(withCommentSort(`${thread}?sort=new`, "top"), null);
  assert.equal(withCommentSort("/r/pics/comments/abc123/comment/def456/", "top"), null);
  assert.equal(withCommentSort("/r/pics/", "top"), null);
  assert.equal(withCommentSort("https://example.com/r/x/comments/abc/", "top"), null);
  // Idempotent: a stamped link needs no second change.
  assert.equal(withCommentSort(withCommentSort(thread, "qa")!, "qa"), null);
});

check("comment sort resolves override, then remembered, then default", () => {
  const s = createDefaultSettings();
  s.commentSortPrefs.sort = "top";
  s.commentSortPrefs.remembered = { askreddit: "new" };
  assert.equal(resolveCommentSort(s, "AskReddit"), "top"); // fixed mode ignores memory
  s.commentSortPrefs.mode = "remember";
  assert.equal(resolveCommentSort(s, "AskReddit"), "new");
  assert.equal(resolveCommentSort(s, "pics"), "top");
  assert.equal(resolveCommentSort(s, null), "top");
  s.subredditOverrides = [{ subreddit: "r/AskReddit", commentSort: "qa" }];
  assert.equal(resolveCommentSort(s, "askreddit"), "qa");
});

check("Reddit's comment sort menu values map to URL sorts", () => {
  assert.equal(commentSortFromMenuValue("CONFIDENCE"), "confidence");
  assert.equal(commentSortFromMenuValue("QA"), "qa");
  assert.equal(commentSortFromMenuValue("LIVE"), null);
  assert.equal(commentSortFromMenuValue(null), null);
});

check("remembered sorts move to newest and stay capped", () => {
  const start = { a_sub: "top", b_sub: "new" } as const;
  const same = rememberCommentSort({ ...start }, "b_sub", "new", 3);
  assert.deepEqual(same, start);
  const moved = rememberCommentSort({ ...start }, "A_Sub", "old", 3);
  assert.deepEqual(Object.entries(moved), [["b_sub", "new"], ["a_sub", "old"]]);
  const capped = rememberCommentSort({ a1: "top", a2: "top", a3: "top" }, "a4", "new", 3);
  assert.deepEqual(Object.keys(capped), ["a2", "a3", "a4"]);
  const unchanged = { x_sub: "top" } as const;
  assert.equal(rememberCommentSort(unchanged, "not a sub!", "new", 3), unchanged);
});

check("direct-load sort redirect follows the flag and its setting", () => {
  const s = createDefaultSettings();
  const url = "https://www.reddit.com/r/pics/comments/abc123/title/";
  s.flags.commentSort = false;
  assert.equal(directLoadCommentSortUrl(s, url), null);
  s.flags.commentSort = true;
  s.commentSortPrefs.applyOnDirectLoad = false;
  assert.equal(directLoadCommentSortUrl(s, url), null);
  s.commentSortPrefs.applyOnDirectLoad = true;
  assert.equal(directLoadCommentSortUrl(s, url), `${url}?sort=top`);
  assert.equal(directLoadCommentSortUrl(s, `${url}?sort=new`), null); // no loop
  s.paused = true;
  assert.equal(directLoadCommentSortUrl(s, url), null);
});

check("All · Global targets global Popular and recognises r/all links", () => {
  assert.equal(allFeedUrl("hot"), "/r/popular/hot/?geo_filter=global");
  assert.ok(isAllHref("/r/all/"));
  assert.ok(isAllHref("https://www.reddit.com/r/all/top/?t=day"));
  assert.ok(!isAllHref("/r/allthingsdogs/"));
  assert.ok(!isAllHref("https://example.com/r/all/"));
  assert.ok(isAllFeedPage("https://www.reddit.com/r/popular/hot/?geo_filter=GLOBAL"));
  assert.ok(!isAllFeedPage("https://www.reddit.com/r/popular/"));
});

/** Minimal attribute store standing in for a DOM element. */
function attrEl(init: Record<string, string> = {}) {
  const attrs = new Map(Object.entries(init));
  return {
    getAttribute: (n: string) => attrs.get(n) ?? null,
    setAttribute: (n: string, v: string) => void attrs.set(n, v),
    hasAttribute: (n: string) => attrs.has(n),
    removeAttribute: (n: string) => void attrs.delete(n),
  } as unknown as Element;
}

check("link stamps restore exactly what readit changed", () => {
  const a = attrEl({ href: "/r/pics/comments/abc/" });
  stampAttr(a, "href", "/r/pics/comments/abc/?sort=top");
  stampAttr(a, "href", "/r/pics/comments/abc/?sort=new"); // re-stamp keeps the first original
  assert.equal(originalAttr(a, "href"), "/r/pics/comments/abc/");
  restoreAttr(a, "href");
  assert.equal(a.getAttribute("href"), "/r/pics/comments/abc/");
  assert.equal(a.getAttribute("data-readit-orig-href"), null);

  const post = attrEl();
  stampAttr(post, "target", "_blank");
  restoreAttr(post, "target");
  assert.equal(post.hasAttribute("target"), false); // was absent → removed again
});

check("a link Reddit rewrote after stamping is never rolled back", () => {
  const a = attrEl({ href: "/r/pics/comments/old1/" });
  stampAttr(a, "href", "/r/pics/comments/old1/?sort=top");
  // Reddit reuses the element for another post.
  a.setAttribute("href", "/r/pics/comments/new2/");
  assert.equal(originalAttr(a, "href"), "/r/pics/comments/new2/");
  stampAttr(a, "href", "/r/pics/comments/new2/?sort=top");
  restoreAttr(a, "href");
  assert.equal(a.getAttribute("href"), "/r/pics/comments/new2/");
  // Rewritten, then disabled: leave Reddit's value alone.
  stampAttr(a, "href", "/r/pics/comments/new2/?sort=top");
  a.setAttribute("href", "/r/pics/comments/third/");
  restoreAttr(a, "href");
  assert.equal(a.getAttribute("href"), "/r/pics/comments/third/");
});

check("classic-habit defaults, profiles and repair of older settings", () => {
  const d = createDefaultSettings();
  assert.equal(d.flags.commentSort, true); // Focus Reader
  assert.equal(d.flags.allFeed, true);
  assert.equal(d.flags.openInNewTab, false);
  assert.deepEqual(d.commentSortPrefs, {
    mode: "fixed",
    sort: "top",
    applyOnDirectLoad: true,
    remembered: {},
  });
  const dense = applyProfile(d, "dense-power");
  assert.equal(dense.flags.openInNewTab, true);
  const minimal = applyProfile(d, "minimal-media");
  assert.equal(minimal.flags.commentSort, false);

  // Settings saved by 0.2.3 have none of the new keys.
  const old = stored();
  delete old.commentSortPrefs;
  delete old.linkPrefs;
  delete old.allFeedPrefs;
  for (const k of ["commentSort", "openInNewTab", "allFeed"]) delete old.flags[k];
  old.subredditOverrides = [{ subreddit: "pics", commentSort: "bogus" }];
  const repaired = repairSettings(old)!.settings;
  assert.equal(repaired.flags.commentSort, false);
  assert.equal(repaired.allFeedPrefs.sort, "hot");
  assert.equal(repaired.linkPrefs.posts, true);
  assert.equal(repaired.subredditOverrides[0]?.commentSort, undefined);
});

check("the All · Global nav link counts as readit's own node", () => {
  assert.ok(READIT_OWNED_SELECTOR.split(", ").includes(".readit-all-link-wrap"));
});

/** Composed-path stand-in: selector matching by tag / attribute only. */
function pathEl(
  localName: string,
  attrs: Record<string, string> = {},
  children: Record<string, ReturnType<typeof pathEl>> = {},
) {
  return {
    localName,
    getAttribute: (n: string) => attrs[n] ?? null,
    querySelector: (sel: string) => children[sel] ?? null,
    matches: (sel: string) =>
      sel.split(",").some((part) => {
        const p = part.trim();
        if (p === localName) return true;
        const m = p.match(/^\[(\w[\w-]*)="([^"]+)"\]$/);
        return !!m && attrs[m[1]!] === m[2];
      }),
  };
}

check("pop-out opens thread clicks and leaves every other control to Reddit", () => {
  const thread = "/r/pics/comments/abc123/title/?sort=top";
  const post = pathEl("shreddit-post", { permalink: "/r/pics/comments/abc123/title/" }, {
    'a[slot="full-post-link"]': pathEl("a", { href: thread }),
  });
  // Card body, title link, shadow-DOM comments link → the post.
  assert.equal(popoutHrefFromPath([pathEl("div"), post]), thread);
  assert.equal(popoutHrefFromPath([pathEl("span"), pathEl("a", { href: thread, slot: "title" }), post]), thread);
  assert.equal(
    popoutHrefFromPath([pathEl("a", { href: "/r/pics/comments/abc123/title/", name: "comments-action-button" }), post]),
    "/r/pics/comments/abc123/title/",
  );
  // Votes, menus, community / user / outside links, video, new-tab links → Reddit.
  assert.equal(popoutHrefFromPath([pathEl("svg"), pathEl("button"), post]), null);
  assert.equal(popoutHrefFromPath([pathEl("div", { role: "button" }), post]), null);
  assert.equal(popoutHrefFromPath([pathEl("a", { href: "/r/pics/" }), post]), null);
  assert.equal(popoutHrefFromPath([pathEl("a", { href: "https://example.com/story" }), post]), null);
  assert.equal(popoutHrefFromPath([pathEl("shreddit-player"), post]), null);
  assert.equal(popoutHrefFromPath([pathEl("a", { href: thread, target: "_blank" }), post]), null);
  // Outside any post card: never.
  assert.equal(popoutHrefFromPath([pathEl("div"), pathEl("main")]), null);
  // Falls back to the card's permalink when the overlay link is missing.
  const bare = pathEl("shreddit-post", { permalink: "/r/pics/comments/abc123/title/" });
  assert.equal(popoutHrefFromPath([bare]), "/r/pics/comments/abc123/title/");
});

check("posts open in a tab unless the pop-out is chosen", () => {
  assert.equal(createDefaultSettings().linkPrefs.postsOpenIn, "tab");
  const old = stored();
  delete old.linkPrefs.postsOpenIn;
  assert.equal(repairSettings(old)!.settings.linkPrefs.postsOpenIn, "tab");
  assert.ok(READIT_OWNED_SELECTOR.split(", ").includes("#readit-popout-host"));
});

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall hardening unit checks passed");
