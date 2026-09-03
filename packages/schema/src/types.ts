import { z } from "zod";

export const SETTINGS_VERSION = 8 as const;

export const AudienceSchema = z.enum(["reader", "creator", "moderator"]);
export type Audience = z.infer<typeof AudienceSchema>;

export const FeatureTierSchema = z.enum(["simple", "advanced"]);
export type FeatureTier = z.infer<typeof FeatureTierSchema>;

export const ThemeModeSchema = z.enum(["system", "light", "dark"]);
export type ThemeMode = z.infer<typeof ThemeModeSchema>;

export const MediaModeSchema = z.enum(["normal", "links_on_feed", "autoplay_off"]);
export type MediaMode = z.infer<typeof MediaModeSchema>;

export const FeatureHealthSchema = z.enum(["ok", "degraded", "broken"]);
export type FeatureHealth = z.infer<typeof FeatureHealthSchema>;

/** CSS / layout tokens applied via :root custom properties */
export const FontFamilySchema = z.enum(["system", "serif", "sans", "mono"]);
export type FontFamily = z.infer<typeof FontFamilySchema>;

export const FontWeightSchema = z.union([
  z.literal(400),
  z.literal(500),
  z.literal(600),
  z.literal(700),
]);
export type FontWeight = z.infer<typeof FontWeightSchema>;

export const CssTokensSchema = z.object({
  feedWidthPx: z.number().min(480).max(1600).default(920),
  density: z.number().min(0).max(1).default(0.45),
  fontScale: z.number().min(0.85).max(1.4).default(1),
  fontFamily: FontFamilySchema.default("system"),
  fontWeight: FontWeightSchema.default(400),
  radiusPx: z.number().min(0).max(24).default(8),
  accent: z.string().default("#ff4500"),
  themeMode: ThemeModeSchema.default("system"),
});
export type CssTokens = z.infer<typeof CssTokensSchema>;

export const HideNoiseSchema = z.object({
  promoted: z.boolean().default(true),
  recommended: z.boolean().default(true),
  sidebars: z.boolean().default(false),
  getApp: z.boolean().default(true),
  premiumUpsell: z.boolean().default(true),
  /** Chrome noise pack (New Reddit) */
  joinConversation: z.boolean().default(false),
  relatedCommunities: z.boolean().default(false),
  redditPro: z.boolean().default(false),
  aiSummary: z.boolean().default(false),
  searchAnswers: z.boolean().default(false),
  announcements: z.boolean().default(false),
  /** Wave A — action-bar declutter */
  awards: z.boolean().default(false),
  crosspost: z.boolean().default(false),
  /** Hide Join pills on feed post cards (not subreddit header Join) */
  joinButton: z.boolean().default(false),
});
export type HideNoise = z.infer<typeof HideNoiseSchema>;

export const FilterRuleSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "keyword",
    "user",
    "subreddit",
    "url",
    "flair",
    /** Pattern is a max score threshold, e.g. "0" hides ≤0 karma */
    "karmaMax",
  ]),
  pattern: z.string().min(1),
  enabled: z.boolean().default(true),
});
export type FilterRule = z.infer<typeof FilterRuleSchema>;

export const UserTagSchema = z.object({
  username: z.string(),
  label: z.string(),
  color: z.string().default("#666666"),
  note: z.string().default(""),
  severity: z.enum(["none", "info", "warn", "danger"]).default("none"),
  updatedAt: z.number(),
});
export type UserTag = z.infer<typeof UserTagSchema>;

export const SavedItemSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  folderId: z.string().default("inbox"),
  addedAt: z.number(),
});
export type SavedItem = z.infer<typeof SavedItemSchema>;

export const SavedFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type SavedFolder = z.infer<typeof SavedFolderSchema>;

export const CannedReplySchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  subreddit: z.string().optional(),
});
export type CannedReply = z.infer<typeof CannedReplySchema>;

export const ModMacroSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  kind: z.enum(["removal", "ban", "approve", "reply"]),
  subreddit: z.string().optional(),
});
export type ModMacro = z.infer<typeof ModMacroSchema>;

export const UserNoteSchema = z.object({
  id: z.string(),
  username: z.string(),
  type: z.enum(["good", "spam", "ban", "misc"]),
  text: z.string(),
  link: z.string().optional(),
  subreddit: z.string().optional(),
  createdAt: z.number(),
});
export type UserNote = z.infer<typeof UserNoteSchema>;

export const ElementRuleSchema = z.object({
  id: z.string(),
  selector: z.string(),
  action: z.enum(["hide", "dim"]),
  label: z.string().default(""),
  enabled: z.boolean().default(true),
});
export type ElementRule = z.infer<typeof ElementRuleSchema>;

export const SubredditOverrideSchema = z.object({
  subreddit: z.string(),
  tokens: CssTokensSchema.partial().optional(),
  hide: HideNoiseSchema.partial().optional(),
  mediaMode: MediaModeSchema.optional(),
});
export type SubredditOverride = z.infer<typeof SubredditOverrideSchema>;

export const FeatureFlagsSchema = z.object({
  hideNoise: z.boolean().default(true),
  resizeFeed: z.boolean().default(true),
  elementRules: z.boolean().default(true),
  filters: z.boolean().default(true),
  userTags: z.boolean().default(true),
  readingMode: z.boolean().default(true),
  savedLibrary: z.boolean().default(true),
  cannedReplies: z.boolean().default(true),
  cleanLinks: z.boolean().default(true),
  absoluteTimestamps: z.boolean().default(true),
  opHighlight: z.boolean().default(true),
  alwaysShowActions: z.boolean().default(false),
  modQuickActions: z.boolean().default(false),
  modMacros: z.boolean().default(false),
  modUsernotes: z.boolean().default(false),
  modHighlight: z.boolean().default(false),
  keyboardNav: z.boolean().default(false),
  /** CQS Ratings Tracker — tier log + contribution risk heuristics */
  cqsTracker: z.boolean().default(false),
  /** Page-chrome layout slots (left nav / main / right rail) */
  layoutSlots: z.boolean().default(true),
  /** Dim / mark visited posts */
  markRead: z.boolean().default(false),
  /** Opt out of home “new posts” auto-refresh UX */
  antiRefresh: z.boolean().default(false),
  /** Comment quote + formatting defaults */
  commentUx: z.boolean().default(false),
  /** Prefer Following over For You on Home */
  followingFeed: z.boolean().default(false),
  /** Disable vote pointer-events (read-only lurk) */
  lurkerMode: z.boolean().default(false),
});
export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;

export const MarkReadModeSchema = z.enum(["off", "open", "onScroll"]);
export type MarkReadMode = z.infer<typeof MarkReadModeSchema>;

export const MarkReadPrefsSchema = z.object({
  mode: MarkReadModeSchema.default("off"),
  dimOpacity: z.number().min(0.15).max(0.9).default(0.45),
});
export type MarkReadPrefs = z.infer<typeof MarkReadPrefsSchema>;

export const CommentUxPrefsSchema = z.object({
  quoteButton: z.boolean().default(true),
  showFormatting: z.boolean().default(true),
});
export type CommentUxPrefs = z.infer<typeof CommentUxPrefsSchema>;

export const FeedDensitySchema = z.enum(["comfortable", "compact"]);
export type FeedDensity = z.infer<typeof FeedDensitySchema>;

export const FeedPrefsSchema = z.object({
  /** When followingFeed is on, prefer Following tab on Home */
  followingDefault: z.boolean().default(true),
  feedDensity: FeedDensitySchema.default("comfortable"),
});
export type FeedPrefs = z.infer<typeof FeedPrefsSchema>;

export const KeyboardNavModeSchema = z.enum(["defer", "readit"]);
export type KeyboardNavMode = z.infer<typeof KeyboardNavModeSchema>;

export const KeyboardNavPrefsSchema = z.object({
  /** defer = let Reddit own J/K; readit = scroll between shreddit-posts */
  mode: KeyboardNavModeSchema.default("defer"),
});
export type KeyboardNavPrefs = z.infer<typeof KeyboardNavPrefsSchema>;

export const StudioLocaleSchema = z.enum(["en", "zh"]);
export type StudioLocale = z.infer<typeof StudioLocaleSchema>;

export const LayoutZoneSchema = z.enum([
  "left",
  "center",
  "right",
  "hidden",
  "stackedLeft",
  "stackedRight",
]);
export type LayoutZone = z.infer<typeof LayoutZoneSchema>;

export const LayoutSlotIdSchema = z.enum([
  "leftNav",
  "main",
  "rightRail",
  "subHeader",
]);
export type LayoutSlotId = z.infer<typeof LayoutSlotIdSchema>;

/** The three page columns that can be permuted (panel-owned widths). */
export const LayoutColumnPanelSchema = z.enum([
  "leftNav",
  "main",
  "rightRail",
]);
export type LayoutColumnPanel = z.infer<typeof LayoutColumnPanelSchema>;

export const LayoutPresetSchema = z.enum([
  "classic",
  "navRight",
  "dualLeft",
  "dualRight",
  "singleColumn",
  "custom",
]);
export type LayoutPreset = z.infer<typeof LayoutPresetSchema>;

export const LayoutPlacementsSchema = z.object({
  leftNav: LayoutZoneSchema.default("left"),
  main: LayoutZoneSchema.default("center"),
  rightRail: LayoutZoneSchema.default("right"),
  subHeader: LayoutZoneSchema.default("right"),
});
export type LayoutPlacements = z.infer<typeof LayoutPlacementsSchema>;

export const LayoutWidthsSchema = z.object({
  /** Icon-rail floor (64) → comfortable labeled nav (400). */
  leftNavPx: z.preprocess(
    (v) => (typeof v === "number" ? v : 272),
    z.number().transform((n) => Math.min(400, Math.max(64, Math.round(n)))),
  ),
  /** Readable widgets (280) → wide rail (400). */
  rightRailPx: z.preprocess(
    (v) => (typeof v === "number" ? v : 316),
    z.number().transform((n) => Math.min(400, Math.max(280, Math.round(n)))),
  ),
  /** Outer page gutter (left of first column). */
  pagePadLeftPx: z.preprocess(
    (v) => (typeof v === "number" ? v : 24),
    z.number().transform((n) => Math.min(160, Math.max(0, Math.round(n)))),
  ),
  /** Outer page gutter (right of last column). */
  pagePadRightPx: z.preprocess(
    (v) => (typeof v === "number" ? v : 24),
    z.number().transform((n) => Math.min(160, Math.max(0, Math.round(n)))),
  ),
  /** Gap between the three columns (prevents chrome overlap). */
  columnGapPx: z.preprocess(
    (v) => (typeof v === "number" ? v : 12),
    z.number().transform((n) => Math.min(48, Math.max(0, Math.round(n)))),
  ),
});
export type LayoutWidths = z.infer<typeof LayoutWidthsSchema>;

export const LAYOUT_WIDTH_LIMITS = {
  leftNav: { min: 64, max: 400 },
  /** Floor keeps Recent Posts / widgets readable (no vertical letter stacks). */
  rightRail: { min: 280, max: 400 },
  main: { min: 480, max: 1600 },
  /** Keep gutters modest so pads cannot starve nav/feed/rail. */
  pagePad: { min: 0, max: 160 },
  columnGap: { min: 0, max: 48 },
  separator: { min: 8, max: 120 },
} as const;

export const MAX_LAYOUT_SEPARATORS = 3 as const;

export const GutterThemeSchema = z.enum([
  "plain",
  "line",
  "soft",
  "paper",
  "inset",
]);
export type GutterTheme = z.infer<typeof GutterThemeSchema>;

export const LayoutSeparatorSchema = z.object({
  id: z.string(),
  after: LayoutColumnPanelSchema,
  widthPx: z.preprocess(
    (v) => (typeof v === "number" ? v : 24),
    z
      .number()
      .transform((n) =>
        Math.min(
          LAYOUT_WIDTH_LIMITS.separator.max,
          Math.max(LAYOUT_WIDTH_LIMITS.separator.min, Math.round(n)),
        ),
      ),
  ),
});
export type LayoutSeparator = z.infer<typeof LayoutSeparatorSchema>;

export function clampSeparatorWidth(px: number): number {
  return Math.min(
    LAYOUT_WIDTH_LIMITS.separator.max,
    Math.max(LAYOUT_WIDTH_LIMITS.separator.min, Math.round(px)),
  );
}

export function clampZoom(n: number): number {
  return Math.min(1.5, Math.max(0.85, Math.round(n * 100) / 100));
}

export function clampPanelWidth(
  panel: LayoutColumnPanel,
  px: number,
): number {
  const lim =
    panel === "main"
      ? LAYOUT_WIDTH_LIMITS.main
      : panel === "leftNav"
        ? LAYOUT_WIDTH_LIMITS.leftNav
        : LAYOUT_WIDTH_LIMITS.rightRail;
  return Math.min(lim.max, Math.max(lim.min, Math.round(px)));
}

export function clampPagePad(px: number): number {
  return Math.min(
    LAYOUT_WIDTH_LIMITS.pagePad.max,
    Math.max(LAYOUT_WIDTH_LIMITS.pagePad.min, Math.round(px)),
  );
}

export function clampColumnGap(px: number): number {
  return Math.min(
    LAYOUT_WIDTH_LIMITS.columnGap.max,
    Math.max(LAYOUT_WIDTH_LIMITS.columnGap.min, Math.round(px)),
  );
}

export function panelWidthLimits(panel: LayoutColumnPanel): {
  min: number;
  max: number;
} {
  switch (panel) {
    case "main":
      return LAYOUT_WIDTH_LIMITS.main;
    case "leftNav":
      return LAYOUT_WIDTH_LIMITS.leftNav;
    case "rightRail":
      return LAYOUT_WIDTH_LIMITS.rightRail;
    default: {
      const _exhaustive: never = panel;
      return _exhaustive;
    }
  }
}

/** Mutable layout geometry used for viewport fitting / live resize. */
export type LayoutWidthBudget = {
  leftNavPx: number;
  rightRailPx: number;
  feedWidthPx: number;
  pagePadLeftPx: number;
  pagePadRightPx: number;
  columnGapPx: number;
};

function readPanelWidth(
  panel: LayoutColumnPanel,
  w: LayoutWidthBudget,
): number {
  switch (panel) {
    case "leftNav":
      return w.leftNavPx;
    case "main":
      return w.feedWidthPx;
    case "rightRail":
      return w.rightRailPx;
    default: {
      const _exhaustive: never = panel;
      return _exhaustive;
    }
  }
}

function writePanelWidth(
  panel: LayoutColumnPanel,
  w: LayoutWidthBudget,
  px: number,
): void {
  switch (panel) {
    case "leftNav":
      w.leftNavPx = px;
      return;
    case "main":
      w.feedWidthPx = px;
      return;
    case "rightRail":
      w.rightRailPx = px;
      return;
    default: {
      const _exhaustive: never = panel;
      return _exhaustive;
    }
  }
}

function sumPanelWidths(
  order: readonly LayoutColumnPanel[],
  w: LayoutWidthBudget,
): number {
  return order.reduce((sum, panel) => sum + readPanelWidth(panel, w), 0);
}

function gapTotalPx(
  columnCount: number,
  columnGapPx: number,
): number {
  return Math.max(0, columnCount - 1) * columnGapPx;
}

function stealWidthFromPanel(
  w: LayoutWidthBudget,
  panel: LayoutColumnPanel,
  need: number,
): number {
  if (need <= 0) return 0;
  const cur = readPanelWidth(panel, w);
  const min = panelWidthLimits(panel).min;
  const steal = Math.min(need, Math.max(0, cur - min));
  if (steal > 0) writePanelWidth(panel, w, cur - steal);
  return steal;
}

/**
 * Clamp pads + columns so they never exceed the viewport.
 * Overflow is taken from rightmost columns first, then pads if columns
 * are already at their minimums.
 */
export function fitLayoutWidths(
  widths: LayoutWidthBudget,
  visibleOrder: readonly LayoutColumnPanel[],
  viewportPx: number,
  /** Extra track widths (separators) counted against the viewport budget. */
  extraTracksPx = 0,
): LayoutWidthBudget {
  const order = visibleOrder.length
    ? [...visibleOrder]
    : (["main"] as LayoutColumnPanel[]);
  const next: LayoutWidthBudget = {
    leftNavPx: clampPanelWidth("leftNav", widths.leftNavPx),
    rightRailPx: clampPanelWidth("rightRail", widths.rightRailPx),
    feedWidthPx: clampPanelWidth("main", widths.feedWidthPx),
    pagePadLeftPx: clampPagePad(widths.pagePadLeftPx),
    pagePadRightPx: clampPagePad(widths.pagePadRightPx),
    columnGapPx: clampColumnGap(widths.columnGapPx),
  };

  const viewport = Math.max(0, Math.round(viewportPx));
  const gaps = gapTotalPx(order.length, next.columnGapPx);
  const extras = Math.max(0, Math.round(extraTracksPx));
  const minCols = order.reduce(
    (sum, panel) => sum + panelWidthLimits(panel).min,
    0,
  );
  const minShell = minCols + gaps + extras;

  // Pads cannot leave less than the minimum column shell.
  let padBudget = Math.max(0, viewport - minShell);
  let padSum = next.pagePadLeftPx + next.pagePadRightPx;
  if (padSum > padBudget) {
    if (padBudget <= 0 || padSum <= 0) {
      next.pagePadLeftPx = 0;
      next.pagePadRightPx = 0;
    } else {
      const left = clampPagePad(
        Math.round((next.pagePadLeftPx / padSum) * padBudget),
      );
      next.pagePadLeftPx = Math.min(left, padBudget);
      next.pagePadRightPx = clampPagePad(padBudget - next.pagePadLeftPx);
    }
  }

  const contentBudget = Math.max(
    minCols,
    viewport - next.pagePadLeftPx - next.pagePadRightPx - gaps - extras,
  );
  let excess = sumPanelWidths(order, next) - contentBudget;
  if (excess > 0) {
    for (let i = order.length - 1; i >= 0 && excess > 0; i--) {
      excess -= stealWidthFromPanel(next, order[i]!, excess);
    }
  }
  return next;
}

/**
 * Grow/shrink one panel. Extra width first eats free space (neighbors shift
 * toward the opposite gutter). If the shell is full, columns to the right of
 * the handle shrink down to their mins; the handle itself is clamped last.
 */
export function resizePanelInBudget(
  widths: LayoutWidthBudget,
  visibleOrder: readonly LayoutColumnPanel[],
  panel: LayoutColumnPanel,
  desiredPx: number,
  viewportPx: number,
): LayoutWidthBudget {
  const order = visibleOrder.filter(Boolean);
  const idx = order.indexOf(panel);
  const next: LayoutWidthBudget = {
    ...widths,
    columnGapPx: clampColumnGap(widths.columnGapPx),
    pagePadLeftPx: clampPagePad(widths.pagePadLeftPx),
    pagePadRightPx: clampPagePad(widths.pagePadRightPx),
  };
  if (idx < 0) return fitLayoutWidths(next, order, viewportPx);

  const before = readPanelWidth(panel, next);
  writePanelWidth(panel, next, clampPanelWidth(panel, desiredPx));

  // Shrinking nav/rail donates the freed pixels to the feed (up to main.max)
  // so the feed can grow toward the largest size the viewport allows.
  if (panel !== "main" && order.includes("main")) {
    const after = readPanelWidth(panel, next);
    const freed = before - after;
    if (freed > 0) {
      writePanelWidth(
        "main",
        next,
        clampPanelWidth("main", next.feedWidthPx + freed),
      );
    }
  }

  const gaps = gapTotalPx(order.length, next.columnGapPx);
  const budget =
    Math.max(0, Math.round(viewportPx)) -
    next.pagePadLeftPx -
    next.pagePadRightPx -
    gaps;
  let excess = sumPanelWidths(order, next) - budget;
  if (excess > 0) {
    for (let i = order.length - 1; i > idx && excess > 0; i--) {
      excess -= stealWidthFromPanel(next, order[i]!, excess);
    }
    if (excess > 0) {
      excess -= stealWidthFromPanel(next, panel, excess);
    }
  }
  return fitLayoutWidths(next, order, viewportPx);
}

/** Change a page pad; columns shrink from the right to honor the gutters. */
export function resizePadInBudget(
  widths: LayoutWidthBudget,
  visibleOrder: readonly LayoutColumnPanel[],
  side: "left" | "right",
  desiredPx: number,
  viewportPx: number,
): LayoutWidthBudget {
  const order = visibleOrder.filter(Boolean);
  const next: LayoutWidthBudget = {
    ...widths,
    columnGapPx: clampColumnGap(widths.columnGapPx),
  };
  const before =
    side === "left" ? next.pagePadLeftPx : next.pagePadRightPx;
  if (side === "left") next.pagePadLeftPx = clampPagePad(desiredPx);
  else next.pagePadRightPx = clampPagePad(desiredPx);
  const after =
    side === "left" ? next.pagePadLeftPx : next.pagePadRightPx;
  // Shrinking a pad donates freed pixels to the feed (up to main.max).
  const freed = before - after;
  if (freed > 0 && order.includes("main")) {
    next.feedWidthPx = clampPanelWidth("main", next.feedWidthPx + freed);
  }
  return fitLayoutWidths(next, order, viewportPx);
}

export const CLASSIC_COLUMN_ORDER: LayoutColumnPanel[] = [
  "leftNav",
  "main",
  "rightRail",
];

export const CLASSIC_LAYOUT_PLACEMENTS: LayoutPlacements = {
  leftNav: "left",
  main: "center",
  rightRail: "right",
  subHeader: "right",
};

/** Ensure a unique permutation of the three column panels. */
export function normalizeColumnOrder(
  raw: readonly string[] | null | undefined,
): LayoutColumnPanel[] {
  const allowed: LayoutColumnPanel[] = ["leftNav", "main", "rightRail"];
  const seen = new Set<LayoutColumnPanel>();
  const out: LayoutColumnPanel[] = [];
  for (const id of raw ?? []) {
    if (
      (id === "leftNav" || id === "main" || id === "rightRail") &&
      !seen.has(id)
    ) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of allowed) {
    if (!seen.has(id)) out.push(id);
  }
  return out.slice(0, 3) as LayoutColumnPanel[];
}

const LayoutColumnOrderSchema = z
  .array(LayoutColumnPanelSchema)
  .length(3)
  .default([...CLASSIC_COLUMN_ORDER])
  .transform((arr) => normalizeColumnOrder(arr));

export const LayoutSlotsConfigSchema = z.object({
  preset: LayoutPresetSchema.default("classic"),
  placements: LayoutPlacementsSchema.default({}),
  /** Left→right panel permutation; each panel keeps its own width. */
  columnOrder: LayoutColumnOrderSchema,
  widths: LayoutWidthsSchema.default({}),
  /** When false, column chips / page edit moves are locked. */
  editMode: z.boolean().default(false),
  /** Blank resizable tracks between columns (max 3). */
  separators: z
    .array(LayoutSeparatorSchema)
    .max(MAX_LAYOUT_SEPARATORS)
    .default([]),
  gutterTheme: GutterThemeSchema.default("plain"),
  /** Global visual zoom (1 = 100%). */
  zoomAll: z.preprocess(
    (v) => (typeof v === "number" ? v : 1),
    z.number().transform((n) => clampZoom(n)),
  ),
  /** Per-panel zoom overrides (take precedence when set). */
  zoomByPanel: z
    .object({
      leftNav: z.number().optional(),
      main: z.number().optional(),
      rightRail: z.number().optional(),
    })
    .default({}),
});
export type LayoutSlotsConfig = z.infer<typeof LayoutSlotsConfigSchema>;

/** Interleaved panel + separator tracks for grid template building. */
export type LayoutTrack =
  | { type: "panel"; panel: LayoutColumnPanel }
  | { type: "separator"; id: string; widthPx: number };

export function buildLayoutTracks(
  config: Pick<LayoutSlotsConfig, "columnOrder" | "separators" | "placements">,
): LayoutTrack[] {
  const order = normalizeColumnOrder(config.columnOrder);
  const visible = order.filter(
    (id) => config.placements[id] !== "hidden",
  );
  const seps = (config.separators || []).slice(0, MAX_LAYOUT_SEPARATORS);
  const out: LayoutTrack[] = [];
  for (const panel of visible) {
    out.push({ type: "panel", panel });
    for (const sep of seps) {
      if (sep.after === panel) {
        out.push({
          type: "separator",
          id: sep.id,
          widthPx: clampSeparatorWidth(sep.widthPx),
        });
      }
    }
  }
  return out;
}

export function presetToColumnOrder(preset: LayoutPreset): LayoutColumnPanel[] {
  switch (preset) {
    case "classic":
    case "singleColumn":
    case "dualLeft":
    case "dualRight":
    case "custom":
      return [...CLASSIC_COLUMN_ORDER];
    case "navRight":
      return ["rightRail", "main", "leftNav"];
    default: {
      const _exhaustive: never = preset;
      return _exhaustive;
    }
  }
}

export function presetToPlacements(preset: LayoutPreset): LayoutPlacements {
  switch (preset) {
    case "classic":
      return { ...CLASSIC_LAYOUT_PLACEMENTS };
    case "navRight":
      return placementsFromColumnOrder(["rightRail", "main", "leftNav"]);
    case "dualLeft":
      return {
        leftNav: "stackedLeft",
        main: "center",
        rightRail: "stackedLeft",
        subHeader: "stackedLeft",
      };
    case "dualRight":
      return {
        leftNav: "stackedRight",
        main: "center",
        rightRail: "stackedRight",
        subHeader: "stackedRight",
      };
    case "singleColumn":
      return {
        leftNav: "hidden",
        main: "center",
        rightRail: "hidden",
        subHeader: "hidden",
      };
    case "custom":
      return { ...CLASSIC_LAYOUT_PLACEMENTS };
    default: {
      const _exhaustive: never = preset;
      return _exhaustive;
    }
  }
}

export function applyLayoutPreset(
  config: LayoutSlotsConfig,
  preset: LayoutPreset,
): LayoutSlotsConfig {
  if (preset === "custom") {
    return { ...config, preset: "custom" };
  }
  const columnOrder = presetToColumnOrder(preset);
  return {
    ...config,
    preset,
    columnOrder,
    placements: {
      ...presetToPlacements(preset),
      subHeader:
        preset === "singleColumn"
          ? "hidden"
          : (config.placements.subHeader ?? "right"),
    },
  };
}

export function placementsFromColumnOrder(
  order: readonly LayoutColumnPanel[],
  prev?: LayoutPlacements,
): LayoutPlacements {
  const zones: Array<"left" | "center" | "right"> = [
    "left",
    "center",
    "right",
  ];
  const next: LayoutPlacements = {
    ...(prev ?? CLASSIC_LAYOUT_PLACEMENTS),
    subHeader: prev?.subHeader ?? "right",
  };
  normalizeColumnOrder(order).forEach((panel, i) => {
    next[panel] = zones[i]!;
  });
  return next;
}

export function columnOrderFromPlacements(
  placements: LayoutPlacements,
): LayoutColumnPanel[] {
  const rank = (zone: LayoutZone): number => {
    switch (zone) {
      case "left":
      case "stackedLeft":
        return 0;
      case "center":
        return 1;
      case "right":
      case "stackedRight":
        return 2;
      case "hidden":
        return 99;
      default: {
        const _exhaustive: never = zone;
        return _exhaustive;
      }
    }
  };
  const panels: LayoutColumnPanel[] = ["leftNav", "main", "rightRail"];
  return normalizeColumnOrder(
    [...panels].sort(
      (a, b) => rank(placements[a]) - rank(placements[b]) || a.localeCompare(b),
    ),
  );
}

/** Swap two panels in the column order (used when moving feed ↔ sidebar). */
export function swapColumnPanels(
  order: readonly LayoutColumnPanel[],
  a: LayoutColumnPanel,
  b: LayoutColumnPanel,
): LayoutColumnPanel[] {
  const next = normalizeColumnOrder(order);
  const i = next.indexOf(a);
  const j = next.indexOf(b);
  if (i < 0 || j < 0 || i === j) return next;
  const tmp = next[i]!;
  next[i] = next[j]!;
  next[j] = tmp;
  return next;
}

/** Move `panel` into position index; the displaced panel takes `panel`'s old spot. */
export function movePanelToIndex(
  order: readonly LayoutColumnPanel[],
  panel: LayoutColumnPanel,
  targetIndex: number,
): LayoutColumnPanel[] {
  const next = normalizeColumnOrder(order);
  const from = next.indexOf(panel);
  const to = Math.max(0, Math.min(2, targetIndex));
  if (from < 0 || from === to) return next;
  return swapColumnPanels(next, panel, next[to]!);
}

export const CqsTierSchema = z.enum([
  "Lowest",
  "Low",
  "Moderate",
  "High",
  "Highest",
]);
export type CqsTier = z.infer<typeof CqsTierSchema>;

export const CqsSnapshotSchema = z.object({
  id: z.string(),
  tier: CqsTierSchema,
  checkedAt: z.number(),
  source: z.enum(["whatismycqs", "manual"]).default("manual"),
  note: z.string().default(""),
});
export type CqsSnapshot = z.infer<typeof CqsSnapshotSchema>;

export const CqsRiskConfidenceSchema = z.enum([
  "official",
  "official_adjacent",
  "community",
  "heuristic",
  "speculative",
]);
export type CqsRiskConfidence = z.infer<typeof CqsRiskConfidenceSchema>;

export const CqsRiskEventSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "burst",
    "near_duplicate",
    "promo_link",
    "removal",
    "captcha",
    "unverified",
    "self_delete",
    "restriction",
    "check",
  ]),
  confidence: CqsRiskConfidenceSchema,
  message: z.string(),
  at: z.number(),
  path: z.string().default(""),
});
export type CqsRiskEvent = z.infer<typeof CqsRiskEventSchema>;

export const CqsPrefsSchema = z.object({
  warnBurst: z.boolean().default(true),
  warnDuplicate: z.boolean().default(true),
  warnPromo: z.boolean().default(true),
  burstWindowMs: z.number().min(60_000).max(3_600_000).default(600_000),
  burstLimit: z.number().min(3).max(40).default(8),
});
export type CqsPrefs = z.infer<typeof CqsPrefsSchema>;

export const SimpleKnobsSchema = z.object({
  tokens: CssTokensSchema.default({}),
  hide: HideNoiseSchema.default({}),
  mediaMode: MediaModeSchema.default("normal"),
  quietNsfw: z.boolean().default(false),
  showNotes: z.boolean().default(true),
  queueDensity: z.boolean().default(false),
  macroBar: z.boolean().default(false),
});
export type SimpleKnobs = z.infer<typeof SimpleKnobsSchema>;

export const ProfilePackSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  audiences: z.array(AudienceSchema).default(["reader"]),
  builtin: z.boolean().default(false),
  knobs: SimpleKnobsSchema,
  flags: FeatureFlagsSchema.default({}),
  /** Optional column-layout recipe applied on profile switch. */
  layoutSlots: LayoutSlotsConfigSchema.optional(),
});
export type ProfilePack = z.infer<typeof ProfilePackSchema>;

export const ReaditSettingsSchema = z.object({
  version: z.literal(SETTINGS_VERSION).default(SETTINGS_VERSION),
  paused: z.boolean().default(false),
  mode: z.enum(["simple", "advanced"]).default("simple"),
  activeProfileId: z.string().default("focus-reader"),
  profiles: z.array(ProfilePackSchema).default([]),
  /** Live knobs — usually a copy of the active profile, editable in studio */
  knobs: SimpleKnobsSchema.default({}),
  flags: FeatureFlagsSchema.default({}),
  filters: z.array(FilterRuleSchema).default([]),
  tags: z.array(UserTagSchema).default([]),
  elementRules: z.array(ElementRuleSchema).default([]),
  subredditOverrides: z.array(SubredditOverrideSchema).default([]),
  savedFolders: z.array(SavedFolderSchema).default([
    { id: "inbox", name: "Inbox" },
    { id: "queue", name: "Reading queue" },
  ]),
  savedItems: z.array(SavedItemSchema).default([]),
  cannedReplies: z.array(CannedReplySchema).default([]),
  modMacros: z.array(ModMacroSchema).default([]),
  usernotes: z.array(UserNoteSchema).default([]),
  cqsSnapshots: z.array(CqsSnapshotSchema).default([]),
  cqsRiskEvents: z.array(CqsRiskEventSchema).default([]),
  cqsPrefs: CqsPrefsSchema.default({}),
  layoutSlots: LayoutSlotsConfigSchema.default({}),
  markReadPrefs: MarkReadPrefsSchema.default({}),
  commentUxPrefs: CommentUxPrefsSchema.default({}),
  feedPrefs: FeedPrefsSchema.default({}),
  keyboardNavPrefs: KeyboardNavPrefsSchema.default({}),
  studioLocale: StudioLocaleSchema.default("en"),
  featureHealth: z.record(FeatureHealthSchema).default({}),
  toolboxDetected: z.boolean().default(false),
  syncLightweight: z.boolean().default(false),
});
export type ReaditSettings = z.infer<typeof ReaditSettingsSchema>;

export const ExportBundleSchema = z.object({
  kind: z.literal("readit-export"),
  exportedAt: z.number(),
  /** Settings schema version stamped at export for dry-run validation */
  schemaVersion: z.number().optional(),
  settings: ReaditSettingsSchema,
});
export type ExportBundle = z.infer<typeof ExportBundleSchema>;

export type ImportPreview = {
  ok: boolean;
  kind: "bundle" | "raw" | "invalid";
  schemaVersion: number | null;
  exportedAt: number | null;
  profileCount: number;
  filterCount: number;
  tagCount: number;
  warnings: string[];
  errors: string[];
};

export function previewImport(raw: unknown): ImportPreview {
  const warnings: string[] = [];
  const errors: string[] = [];
  const bundle = ExportBundleSchema.safeParse(raw);
  if (bundle.success) {
    const v = bundle.data.schemaVersion ?? bundle.data.settings.version;
    if (v > SETTINGS_VERSION) {
      warnings.push(
        `Export schema ${v} is newer than this build (${SETTINGS_VERSION}); some fields may be dropped.`,
      );
    }
    if (v < SETTINGS_VERSION) {
      warnings.push(
        `Export schema ${v} will migrate to ${SETTINGS_VERSION} on import.`,
      );
    }
    return {
      ok: true,
      kind: "bundle",
      schemaVersion: v,
      exportedAt: bundle.data.exportedAt,
      profileCount: bundle.data.settings.profiles.length,
      filterCount: bundle.data.settings.filters.length,
      tagCount: bundle.data.settings.tags.length,
      warnings,
      errors,
    };
  }
  const asSettings = ReaditSettingsSchema.safeParse({
    ...(typeof raw === "object" && raw ? raw : {}),
    version: SETTINGS_VERSION,
  });
  if (asSettings.success) {
    warnings.push("Raw settings object (no export wrapper) — will migrate on import.");
    return {
      ok: true,
      kind: "raw",
      schemaVersion:
        typeof raw === "object" &&
        raw &&
        "version" in raw &&
        typeof (raw as { version: unknown }).version === "number"
          ? (raw as { version: number }).version
          : null,
      exportedAt: null,
      profileCount: asSettings.data.profiles.length,
      filterCount: asSettings.data.filters.length,
      tagCount: asSettings.data.tags.length,
      warnings,
      errors,
    };
  }
  errors.push("Unrecognized export format.");
  return {
    ok: false,
    kind: "invalid",
    schemaVersion: null,
    exportedAt: null,
    profileCount: 0,
    filterCount: 0,
    tagCount: 0,
    warnings,
    errors,
  };
}

export function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}
