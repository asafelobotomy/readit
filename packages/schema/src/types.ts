import { z } from "zod";

export const SETTINGS_VERSION = 9 as const;

/** Strict hex color — CSS tokens are interpolated raw into stylesheets, so
 * anything else risks CSS injection (rule breakout via imported settings). */
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Only http(s) URLs may be stored for links the studio renders — a
 * `javascript:` URL in an imported pack would run in reddit.com when clicked.
 */
export function isSafeHttpUrl(raw: string): boolean {
  try {
    const { protocol } = new URL(raw);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Element rules are interpolated into readit's stylesheet as selectors, so
 * they must stay a plain selector list (no braces / comment openers that would
 * inject or swallow rules) and must never target readit's own UI or the page
 * roots. Older pickers could save a rule hiding `<readit-studio>` itself,
 * which made the studio unreachable.
 */
export function isSafeElementRuleSelector(selector: string): boolean {
  const s = selector.trim();
  if (!s || /[{}]|\/\*/.test(s) || s.startsWith("@")) return false;
  if (!hasBalancedSelectorSyntax(s)) return false;
  if (/readit-studio|#readit-root/i.test(s)) return false;
  if (/^(?:html|head|body|:root)$/i.test(s)) return false;
  return true;
}

/**
 * Brackets, parens and quotes must close. An unclosed `(`, `[` or string
 * doesn't break out of the rule, but it swallows every rule emitted after
 * it (the tokenizer keeps reading until the matching close).
 */
function hasBalancedSelectorSyntax(s: string): boolean {
  const closers: string[] = [];
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "\\") {
      if (i === s.length - 1) return false;
      i++;
      continue;
    }
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\n") return false;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(") closers.push(")");
    else if (c === "[") closers.push("]");
    else if ((c === ")" || c === "]") && closers.pop() !== c) return false;
  }
  return quote === null && closers.length === 0;
}

export const AudienceSchema =z.enum(["reader", "creator", "moderator"]);
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
/**
 * New Reddit's `--font-sans` stack. readit's own UI uses it so it renders in
 * the same face as Reddit; a `system-ui`-led stack resolves differently on
 * Linux (Adwaita Sans vs Reddit's Arial substitute). Keep extension/studio/studio.css in sync.
 */
export const REDDIT_FONT_STACK = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif`;

/** "system" keeps Reddit's own font (inherits); the rest replace it. */
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
  /** UI text: titles, names, meta, buttons, sidebars. */
  fontWeight: FontWeightSchema.default(400),
  /** Post and comment bodies (markdown); bold and headings stay bold. */
  bodyFontWeight: FontWeightSchema.default(400),
  radiusPx: z.number().min(0).max(24).default(8),
  accent: z.string().regex(HEX_COLOR_RE).catch("#ff4500"),
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
  color: z.string().regex(HEX_COLOR_RE).catch("#666666"),
  note: z.string().default(""),
  severity: z.enum(["none", "info", "warn", "danger"]).default("none"),
  updatedAt: z.number(),
});
export type UserTag = z.infer<typeof UserTagSchema>;

export const SavedItemSchema = z.object({
  id: z.string(),
  url: z.string().refine(isSafeHttpUrl, "Only http(s) URLs"),
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
  link: z.string().refine(isSafeHttpUrl, "Only http(s) URLs").optional(),
  subreddit: z.string().optional(),
  createdAt: z.number(),
});
export type UserNote = z.infer<typeof UserNoteSchema>;

export const ElementRuleSchema = z.object({
  id: z.string(),
  selector: z.string().refine(isSafeElementRuleSelector, "Unsafe selector"),
  action: z.enum(["hide", "dim"]),
  label: z.string().default(""),
  enabled: z.boolean().default(true),
});
export type ElementRule = z.infer<typeof ElementRuleSchema>;

/** Values Reddit's comment page accepts for `?sort=` (`confidence` = Best). */
export const CommentSortSchema = z.enum([
  "confidence",
  "top",
  "new",
  "old",
  "controversial",
  "qa",
]);
export type CommentSort = z.infer<typeof CommentSortSchema>;

export const SubredditOverrideSchema = z.object({
  subreddit: z.string(),
  tokens: CssTokensSchema.partial().optional(),
  hide: HideNoiseSchema.partial().optional(),
  mediaMode: MediaModeSchema.optional(),
  commentSort: CommentSortSchema.optional(),
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
  /** Reserved: expanding overflow menus into the action bar isn't built yet,
   * so nothing reads this. Kept so saved settings and profiles still load. */
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
  /** Show the active profile's mascot next to Reddit's own header logo */
  headerMascot: z.boolean().default(true),
  /** Open comment threads in a chosen sort (adds ?sort= to post links) */
  commentSort: z.boolean().default(false),
  /** Open posts (and optionally communities / users) in a new tab */
  openInNewTab: z.boolean().default(false),
  /** “All · Global” nav link + /r/all links rewritten to global Popular */
  allFeed: z.boolean().default(false),
});
export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;

export const MarkReadModeSchema = z.enum(["off", "open", "onScroll"]);
export type MarkReadMode = z.infer<typeof MarkReadModeSchema>;

/**
 * Mode actually in effect while the markRead flag is on. The flag is the
 * on/off switch; a stored "off" mode under an enabled flag (e.g. from a
 * profile that turns the flag on) means the default, "open".
 */
export function effectiveMarkReadMode(
  mode: MarkReadMode,
): Exclude<MarkReadMode, "off"> {
  return mode === "off" ? "open" : mode;
}

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

/** Remembered per-subreddit comment sorts kept at most (oldest dropped). */
export const COMMENT_SORT_MEMORY_MAX = 200;

export const CommentSortModeSchema = z.enum(["fixed", "remember"]);
export type CommentSortMode = z.infer<typeof CommentSortModeSchema>;

export const CommentSortPrefsSchema = z.object({
  /** fixed = always `sort`; remember = the last sort picked in each subreddit */
  mode: CommentSortModeSchema.default("fixed"),
  sort: CommentSortSchema.default("top"),
  /**
   * Also redirect comment pages opened directly (bookmarks, other sites).
   * Measured live: the unsorted page never paints; costs ~0.4s per load.
   */
  applyOnDirectLoad: z.boolean().default(true),
  /** Subreddit (normalized) → last sort picked there; insertion order = age */
  remembered: z.record(CommentSortSchema).default({}),
});
export type CommentSortPrefs = z.infer<typeof CommentSortPrefsSchema>;

/** Where a post opens from a feed: a browser tab, or a pop-out in this tab. */
export const PostsOpenInSchema = z.enum(["tab", "popout"]);
export type PostsOpenIn = z.infer<typeof PostsOpenInSchema>;

export const LinkPrefsSchema = z.object({
  /** Post cards, titles and comment links */
  posts: z.boolean().default(true),
  postsOpenIn: PostsOpenInSchema.default("tab"),
  communities: z.boolean().default(false),
  users: z.boolean().default(false),
  /** Also on mod queue routes */
  inModQueue: z.boolean().default(false),
});
export type LinkPrefs = z.infer<typeof LinkPrefsSchema>;

/** Sorts Reddit offers on /r/popular (see its feed sort menu). */
export const AllFeedSortSchema = z.enum(["best", "hot", "new", "top", "rising"]);
export type AllFeedSort = z.infer<typeof AllFeedSortSchema>;

export const AllFeedPrefsSchema = z.object({
  sort: AllFeedSortSchema.default("hot"),
  /** Add an “All · Global” link to the left nav (and nav rail) */
  navLink: z.boolean().default(true),
  /** Point in-page /r/all links at global Popular (Reddit redirects /r/all home) */
  rewriteLinks: z.boolean().default(true),
});
export type AllFeedPrefs = z.infer<typeof AllFeedPrefsSchema>;

export const FeedDensitySchema = z.enum(["comfortable", "compact"]);
export type FeedDensity = z.infer<typeof FeedDensitySchema>;

/**
 * Feed card header: Reddit's own stacked credit line above the title, or
 * split into three columns (subreddit/author | title over time | Join/menu
 * over the recommendation label).
 */
export const PostHeaderLayoutSchema = z.enum(["stacked", "split"]);
export type PostHeaderLayout = z.infer<typeof PostHeaderLayoutSchema>;

export const FeedPrefsSchema = z.object({
  /** When followingFeed is on, prefer Following tab on Home */
  followingDefault: z.boolean().default(true),
  feedDensity: FeedDensitySchema.default("comfortable"),
  postHeader: PostHeaderLayoutSchema.default("stacked"),
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
  "topNav",
  "bottomChrome",
]);
export type LayoutSlotId = z.infer<typeof LayoutSlotIdSchema>;

/** Placement for page chrome (header / dock) — distinct from column zones. */
export const ChromeZoneSchema = z.enum(["top", "bottom", "hidden"]);
export type ChromeZone = z.infer<typeof ChromeZoneSchema>;

export const CHROME_HEIGHT_LIMITS = {
  topNav: { min: 32, max: 160 },
  bottomChrome: { min: 0, max: 160 },
} as const;

export function clampChromeHeight(
  which: "topNav" | "bottomChrome",
  px: number,
): number {
  const { min, max } = CHROME_HEIGHT_LIMITS[which];
  return Math.min(max, Math.max(min, Math.round(px)));
}

export const LayoutChromeSchema = z.object({
  topNav: ChromeZoneSchema.default("top"),
  bottomChrome: ChromeZoneSchema.default("hidden"),
  topNavPx: z.preprocess(
    (v) => (typeof v === "number" ? v : 56),
    z.number().transform((n) => clampChromeHeight("topNav", n)),
  ),
  bottomChromePx: z.preprocess(
    (v) => (typeof v === "number" ? v : 0),
    z.number().transform((n) => clampChromeHeight("bottomChrome", n)),
  ),
});
export type LayoutChrome = z.infer<typeof LayoutChromeSchema>;

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

/** Shared min/max for nav + rail (icon compact → labeled). */
const SIDE_COLUMN_LIMITS = { min: 64, max: 400 } as const;
/**
 * The rail has no icon mode like the nav: below ~240px its cards break into
 * unreadable fragments, so it keeps a readable floor.
 */
const RAIL_COLUMN_LIMITS = { min: 240, max: 400 } as const;

export const LayoutWidthsSchema = z.object({
  /** Icon-rail floor (64) → comfortable labeled nav (400). */
  leftNavPx: z.preprocess(
    (v) => (typeof v === "number" ? v : 272),
    z
      .number()
      .transform((n) =>
        Math.min(
          SIDE_COLUMN_LIMITS.max,
          Math.max(SIDE_COLUMN_LIMITS.min, Math.round(n)),
        ),
      ),
  ),
  /** Readable floor (240) → wide rail (400); no compact rail mode. */
  rightRailPx: z.preprocess(
    (v) => (typeof v === "number" ? v : 316),
    z
      .number()
      .transform((n) =>
        Math.min(
          RAIL_COLUMN_LIMITS.max,
          Math.max(RAIL_COLUMN_LIMITS.min, Math.round(n)),
        ),
      ),
  ),
  /** Outer page gutter (left of first column). */
  pagePadLeftPx: z.preprocess(
    (v) => (typeof v === "number" ? v : 24),
    z.number().transform((n) => Math.min(1600, Math.max(0, Math.round(n)))),
  ),
  /** Outer page gutter (right of last column). */
  pagePadRightPx: z.preprocess(
    (v) => (typeof v === "number" ? v : 24),
    z.number().transform((n) => Math.min(1600, Math.max(0, Math.round(n)))),
  ),
  /** Gap between the three columns (prevents chrome overlap). */
  columnGapPx: z.preprocess(
    (v) => (typeof v === "number" ? v : 12),
    z.number().transform((n) => Math.min(48, Math.max(0, Math.round(n)))),
  ),
});
export type LayoutWidths = z.infer<typeof LayoutWidthsSchema>;

export const LAYOUT_WIDTH_LIMITS = {
  leftNav: SIDE_COLUMN_LIMITS,
  rightRail: RAIL_COLUMN_LIMITS,
  main: { min: 480, max: 1600 },
  /**
   * Outer gutters. High enough that equal left/right pads can center a
   * min-size column+separator shell on ultrawide viewports without leaving
   * a dead void between the last track and the right pad.
   */
  pagePad: { min: 0, max: 1600 },
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

/** Where leftover viewport width goes once columns are fitted. */
export const LayoutAlignSchema = z.enum(["left", "center", "right"]);
export type LayoutAlign = z.infer<typeof LayoutAlignSchema>;

/** Alignment of text, icons and avatars inside a column (edit toolbar). */
export const ContentAlignSchema = z.enum(["start", "center", "end"]);
export type ContentAlign = z.infer<typeof ContentAlignSchema>;

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

/**
 * Zoom applied to the whole layout shell: zoomAll, unless per-panel zoom is
 * set (the two are never compounded). CSS zoom scales the px column tracks,
 * so width budgets must fit the viewport divided by this factor.
 */
export function shellZoomFactor(config: {
  zoomAll?: number;
  zoomByPanel?: Partial<Record<"leftNav" | "main" | "rightRail", number>>;
}): number {
  const panel = config.zoomByPanel || {};
  const hasPanelZoom = (["leftNav", "main", "rightRail"] as const).some(
    (p) => typeof panel[p] === "number",
  );
  return hasPanelZoom ? 1 : clampZoom(config.zoomAll ?? 1);
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

/**
 * Widths below which a panel stops being readable (rail text breaks into
 * fragments, nav drops into icon mode). Overflow shrinks every panel to these
 * first and only then to the hard minimums, instead of crushing the last
 * panel (usually the rail) to 64px while the feed keeps its full width.
 */
const READABLE_PANEL_FLOOR_PX: Record<LayoutColumnPanel, number> = {
  leftNav: 180,
  main: 480,
  rightRail: 240,
};

function stealWidthFromPanel(
  w: LayoutWidthBudget,
  panel: LayoutColumnPanel,
  need: number,
  locked?: ReadonlySet<string>,
  floorPx?: number,
): number {
  if (need <= 0) return 0;
  if (locked?.has(panel)) return 0;
  const cur = readPanelWidth(panel, w);
  const min = Math.max(panelWidthLimits(panel).min, floorPx ?? 0);
  const steal = Math.min(need, Math.max(0, cur - min));
  if (steal > 0) writePanelWidth(panel, w, cur - steal);
  return steal;
}

function giveWidthToPanel(
  w: LayoutWidthBudget,
  panel: LayoutColumnPanel,
  amount: number,
  locked?: ReadonlySet<string>,
): number {
  if (amount <= 0) return 0;
  if (locked?.has(panel)) return 0;
  const cur = readPanelWidth(panel, w);
  const max = panelWidthLimits(panel).max;
  const give = Math.min(amount, Math.max(0, max - cur));
  if (give > 0) writePanelWidth(panel, w, cur + give);
  return give;
}

function stealWidthFromPad(
  w: LayoutWidthBudget,
  side: "left" | "right",
  need: number,
  locked?: ReadonlySet<string>,
): number {
  if (need <= 0) return 0;
  if (locked?.has(side === "left" ? "pad:left" : "pad:right")) return 0;
  const cur = side === "left" ? w.pagePadLeftPx : w.pagePadRightPx;
  const steal = Math.min(
    need,
    Math.max(0, cur - LAYOUT_WIDTH_LIMITS.pagePad.min),
  );
  if (steal <= 0) return 0;
  if (side === "left") w.pagePadLeftPx = cur - steal;
  else w.pagePadRightPx = cur - steal;
  return steal;
}

function giveWidthToPad(
  w: LayoutWidthBudget,
  side: "left" | "right",
  amount: number,
  locked?: ReadonlySet<string>,
): number {
  if (amount <= 0) return 0;
  if (locked?.has(side === "left" ? "pad:left" : "pad:right")) return 0;
  const cur = side === "left" ? w.pagePadLeftPx : w.pagePadRightPx;
  const give = Math.min(
    amount,
    Math.max(0, LAYOUT_WIDTH_LIMITS.pagePad.max - cur),
  );
  if (give <= 0) return 0;
  if (side === "left") w.pagePadLeftPx = cur + give;
  else w.pagePadRightPx = cur + give;
  return give;
}

/**
 * Split remaining viewport pixels into left/right pads.
 * Unlocked pads share equally (centering). A locked pad keeps its size;
 * the other pad absorbs the rest (clamped).
 */
function distributePadsEqual(
  w: LayoutWidthBudget,
  padBudget: number,
  locked?: ReadonlySet<string>,
): void {
  const budget = Math.max(0, Math.round(padBudget));
  const leftLocked = !!locked?.has("pad:left");
  const rightLocked = !!locked?.has("pad:right");
  const max = LAYOUT_WIDTH_LIMITS.pagePad.max;
  const min = LAYOUT_WIDTH_LIMITS.pagePad.min;

  if (leftLocked && rightLocked) {
    w.pagePadLeftPx = clampPagePad(w.pagePadLeftPx);
    w.pagePadRightPx = clampPagePad(w.pagePadRightPx);
    return;
  }
  if (leftLocked) {
    const left = clampPagePad(w.pagePadLeftPx);
    w.pagePadLeftPx = left;
    w.pagePadRightPx = Math.min(max, Math.max(min, budget - left));
    return;
  }
  if (rightLocked) {
    const right = clampPagePad(w.pagePadRightPx);
    w.pagePadRightPx = right;
    w.pagePadLeftPx = Math.min(max, Math.max(min, budget - right));
    return;
  }

  // Both unlocked → equal pads so columns stay centered in the viewport.
  let each = Math.floor(budget / 2);
  each = Math.min(max, Math.max(min, each));
  w.pagePadLeftPx = each;
  w.pagePadRightPx = each;
  // If max capped both sides, leftover is intentional void (ultra-wide + fat columns).
  const used = each * 2;
  if (used < budget && each < max) {
    // Odd leftover pixel — prefer right so left edge stays stable.
    w.pagePadRightPx = Math.min(max, each + (budget - used));
  }
}

/** How leftover viewport is applied after overflow clamping. */
export type FitLayoutMode = "overflow" | "center";

/**
 * Clamp pads + columns into the viewport.
 *
 * - `overflow` (default for live resize): shrink when over budget; keep
 *   requested pad sizes when under budget (no equal re-center).
 * - `center`: split leftover viewport equally into left/right pads.
 *
 * Gap math matches CSS pads-as-tracks: `(panels + seps + 2 pads - 1) * gap`.
 */
export function fitLayoutWidths(
  widths: LayoutWidthBudget,
  visibleOrder: readonly LayoutColumnPanel[],
  viewportPx: number,
  /** Extra track widths (separators) counted against the viewport budget. */
  extraTracksPx = 0,
  locked?: ReadonlySet<string>,
  mode: FitLayoutMode = "center",
  /** Number of separator tracks (for column-gap count). */
  extraTrackCount = 0,
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
  const sepCount = Math.max(0, Math.round(extraTrackCount));
  // Pads are first/last grid tracks — include them in the gap count.
  const trackCount = order.length + sepCount + 2;
  const gaps = gapTotalPx(trackCount, next.columnGapPx);
  const extras = Math.max(0, Math.round(extraTracksPx));
  const minCols = order.reduce(
    (sum, panel) => sum + panelWidthLimits(panel).min,
    0,
  );
  const minShell = minCols + gaps + extras;

  // Shrink columns if tracks alone exceed the viewport.
  let trackUsed = sumPanelWidths(order, next) + gaps + extras;
  let trackExcess = trackUsed - viewport;
  if (trackExcess > 0) {
    for (let i = order.length - 1; i >= 0 && trackExcess > 0; i--) {
      const panel = order[i]!;
      trackExcess -= stealWidthFromPanel(
        next,
        panel,
        trackExcess,
        locked,
        READABLE_PANEL_FLOOR_PX[panel],
      );
    }
    for (let i = order.length - 1; i >= 0 && trackExcess > 0; i--) {
      trackExcess -= stealWidthFromPanel(next, order[i]!, trackExcess, locked);
    }
    trackUsed = sumPanelWidths(order, next) + gaps + extras;
  }

  let padBudget = viewport - trackUsed;

  // Still short after columns hit mins — collapse unlocked pads then steal again.
  if (padBudget < 0) {
    if (!locked?.has("pad:left")) next.pagePadLeftPx = 0;
    if (!locked?.has("pad:right")) next.pagePadRightPx = 0;
    let still = sumPanelWidths(order, next) + gaps + extras - viewport;
    if (still > 0) {
      for (let i = order.length - 1; i >= 0 && still > 0; i--) {
        still -= stealWidthFromPanel(next, order[i]!, still, locked);
      }
    }
    trackUsed = sumPanelWidths(order, next) + gaps + extras;
    padBudget = Math.max(0, viewport - trackUsed);
  }

  // Locked pads may demand more than padBudget — shrink unlocked columns to honor them.
  if (locked?.has("pad:left") || locked?.has("pad:right")) {
    const lockedPadNeed =
      (locked?.has("pad:left") ? next.pagePadLeftPx : 0) +
      (locked?.has("pad:right") ? next.pagePadRightPx : 0);
    if (lockedPadNeed > padBudget) {
      let need = lockedPadNeed - padBudget;
      for (let i = order.length - 1; i >= 0 && need > 0; i--) {
        need -= stealWidthFromPanel(next, order[i]!, need, locked);
      }
      trackUsed = sumPanelWidths(order, next) + gaps + extras;
      padBudget = Math.max(0, viewport - trackUsed);
    }
  }

  if (viewport < minShell) {
    if (!locked?.has("pad:left")) next.pagePadLeftPx = 0;
    if (!locked?.has("pad:right")) next.pagePadRightPx = 0;
    return next;
  }

  if (mode === "center") {
    distributePadsEqual(next, padBudget, locked);
  } else {
    // Overflow-only: clamp requested pads so they fit, but do not re-center.
    let padUsed = next.pagePadLeftPx + next.pagePadRightPx;
    if (padUsed > padBudget) {
      // Split the shortfall across both pads so equal pads stay equal (and a
      // centered layout stays centered); whatever one side can't give (lock
      // or zero floor) comes from the other.
      let overflow = padUsed - padBudget;
      const half = Math.ceil(overflow / 2);
      overflow -= stealWidthFromPad(next, "right", half, locked);
      overflow -= stealWidthFromPad(next, "left", overflow, locked);
      overflow -= stealWidthFromPad(next, "right", overflow, locked);
    }
  }

  return next;
}

/** Equal-pad centering after an overflow fit (explicit user/toolbox action). */
export function centerPadsInViewport(
  widths: LayoutWidthBudget,
  visibleOrder: readonly LayoutColumnPanel[],
  viewportPx: number,
  extraTracksPx = 0,
  locked?: ReadonlySet<string>,
  extraTrackCount = 0,
): LayoutWidthBudget {
  return fitLayoutWidths(
    widths,
    visibleOrder,
    viewportPx,
    extraTracksPx,
    locked,
    "center",
    extraTrackCount,
  );
}

/**
 * Turn leftover viewport into explicit pads on the side(s) the alignment
 * puts it (center splits it), so the columns land exactly where
 * justify-content already drew them. Used before a resize drag: with no
 * leftover left for the grid to re-align, the far pad absorbs the drag and
 * the opposite column edge stays pinned under the cursor.
 */
export function fillPadsForAlign(
  widths: LayoutWidthBudget,
  visibleOrder: readonly LayoutColumnPanel[],
  viewportPx: number,
  align: LayoutAlign = "center",
  extraTracksPx = 0,
  locked?: ReadonlySet<string>,
  extraTrackCount = 0,
): LayoutWidthBudget {
  const order = visibleOrder.length
    ? [...visibleOrder]
    : (["main"] as LayoutColumnPanel[]);
  const trackCount = order.length + Math.max(0, Math.round(extraTrackCount)) + 2;
  const used =
    sumPanelWidths(order, widths) +
    widths.pagePadLeftPx +
    widths.pagePadRightPx +
    gapTotalPx(trackCount, widths.columnGapPx) +
    Math.max(0, Math.round(extraTracksPx));
  let leftover = Math.floor(Math.max(0, viewportPx) - used);
  if (leftover <= 0) return widths;
  // A locked pad that would need to grow can't take its share without
  // moving the columns; leave the layout as drawn rather than jump.
  const needs =
    align === "left" ? ["pad:right"] : align === "right" ? ["pad:left"] : ["pad:left", "pad:right"];
  if (needs.some((k) => locked?.has(k))) return widths;
  const next = { ...widths };
  const give = (side: "left" | "right", amount: number): number => {
    if (amount <= 0) return 0;
    const cur = side === "left" ? next.pagePadLeftPx : next.pagePadRightPx;
    const add = Math.min(amount, Math.max(0, LAYOUT_WIDTH_LIMITS.pagePad.max - cur));
    if (side === "left") next.pagePadLeftPx = cur + add;
    else next.pagePadRightPx = cur + add;
    return add;
  };
  if (align === "left") {
    give("right", leftover);
  } else if (align === "right") {
    give("left", leftover);
  } else {
    leftover -= give("left", Math.floor(leftover / 2));
    give("right", leftover);
  }
  return next;
}

/** Overflow clamp without rewriting pad equality (live edge resize). */
export function fitOverflowOnly(
  widths: LayoutWidthBudget,
  visibleOrder: readonly LayoutColumnPanel[],
  viewportPx: number,
  extraTracksPx = 0,
  locked?: ReadonlySet<string>,
  extraTrackCount = 0,
): LayoutWidthBudget {
  return fitLayoutWidths(
    widths,
    visibleOrder,
    viewportPx,
    extraTracksPx,
    locked,
    "overflow",
    extraTrackCount,
  );
}

/**
 * Grow/shrink one panel. The dragged edge is the one that moves:
 * - right edge: grow into free space / steal from the right
 * - left edge: always trade with the left side so the right edge stays pinned
 *
 * Locked panels/pads are never resized by neighbor cascade.
 * After the trade, overflow-only fit preserves pad sizes (use Center to equalize).
 */
export function resizePanelInBudget(
  widths: LayoutWidthBudget,
  visibleOrder: readonly LayoutColumnPanel[],
  panel: LayoutColumnPanel,
  desiredPx: number,
  viewportPx: number,
  edge: "left" | "right" = "right",
  extraTracksPx = 0,
  locked?: ReadonlySet<string>,
  extraTrackCount = 0,
): LayoutWidthBudget {
  const order = visibleOrder.filter(Boolean);
  const idx = order.indexOf(panel);
  const next: LayoutWidthBudget = {
    ...widths,
    columnGapPx: clampColumnGap(widths.columnGapPx),
    pagePadLeftPx: clampPagePad(widths.pagePadLeftPx),
    pagePadRightPx: clampPagePad(widths.pagePadRightPx),
  };
  if (idx < 0 || locked?.has(panel)) {
    return fitLayoutWidths(
      next,
      order,
      viewportPx,
      extraTracksPx,
      locked,
      "overflow",
      extraTrackCount,
    );
  }

  const before = readPanelWidth(panel, next);
  const target = clampPanelWidth(panel, desiredPx);
  const delta = target - before;

  if (edge === "left") {
    if (delta > 0) {
      let need = delta;
      for (let i = idx - 1; i >= 0 && need > 0; i--) {
        need -= stealWidthFromPanel(next, order[i]!, need, locked);
      }
      // Do not steal from pads here — overflow fit keeps pad sizes so the
      // pinned right edge does not jump (use Center to re-equalize pads).
      writePanelWidth(panel, next, before + (delta - need));
    } else if (delta < 0) {
      writePanelWidth(panel, next, target);
      let freed = before - readPanelWidth(panel, next);
      if (idx > 0) {
        freed -= giveWidthToPanel(next, order[idx - 1]!, freed, locked);
      }
      // Leftover freed width stays as free space until Center runs.
    }
  } else {
    writePanelWidth(panel, next, target);
    if (delta < 0 && panel !== "main" && order.includes("main")) {
      const freed = before - readPanelWidth(panel, next);
      if (freed > 0) giveWidthToPanel(next, "main", freed, locked);
    }
    const sepCount = Math.max(0, Math.round(extraTrackCount));
    const gaps = gapTotalPx(order.length + sepCount + 2, next.columnGapPx);
    const extras = Math.max(0, Math.round(extraTracksPx));
    const budget =
      Math.max(0, Math.round(viewportPx)) -
      next.pagePadLeftPx -
      next.pagePadRightPx -
      gaps -
      extras;
    let excess = sumPanelWidths(order, next) - budget;
    if (excess > 0) {
      excess -= stealWidthFromPad(next, "right", excess, locked);
      for (let i = order.length - 1; i > idx && excess > 0; i--) {
        excess -= stealWidthFromPanel(next, order[i]!, excess, locked);
      }
      if (excess > 0) {
        excess -= stealWidthFromPad(next, "left", excess, locked);
      }
      if (excess > 0) {
        excess -= stealWidthFromPanel(next, panel, excess, locked);
      }
    }
  }

  return fitLayoutWidths(
    next,
    order,
    viewportPx,
    extraTracksPx,
    locked,
    "overflow",
    extraTrackCount,
  );
}

/**
 * Change a page pad. Unlocked left/right pads stay equal (mirrored).
 * Desired pad size sets the margin budget: columns grow/shrink so
 * `2 * pad ≈ viewport - tracks`, eliminating dead space beside the shell.
 */
export function resizePadInBudget(
  widths: LayoutWidthBudget,
  visibleOrder: readonly LayoutColumnPanel[],
  side: "left" | "right",
  desiredPx: number,
  viewportPx: number,
  extraTracksPx = 0,
  locked?: ReadonlySet<string>,
  extraTrackCount = 0,
): LayoutWidthBudget {
  const padKey = side === "left" ? "pad:left" : "pad:right";
  const otherKey = side === "left" ? "pad:right" : "pad:left";
  const order = visibleOrder.filter(Boolean);
  const next: LayoutWidthBudget = {
    ...widths,
    columnGapPx: clampColumnGap(widths.columnGapPx),
    pagePadLeftPx: clampPagePad(widths.pagePadLeftPx),
    pagePadRightPx: clampPagePad(widths.pagePadRightPx),
  };
  if (locked?.has(padKey)) {
    return fitLayoutWidths(
      next,
      order,
      viewportPx,
      extraTracksPx,
      locked,
      "overflow",
      extraTrackCount,
    );
  }

  const desired = clampPagePad(desiredPx);
  const mirror = !locked?.has(otherKey);
  if (mirror) {
    next.pagePadLeftPx = desired;
    next.pagePadRightPx = desired;
  } else if (side === "left") {
    next.pagePadLeftPx = desired;
  } else {
    next.pagePadRightPx = desired;
  }

  const sepCount = Math.max(0, Math.round(extraTrackCount));
  const gaps = gapTotalPx(order.length + sepCount + 2, next.columnGapPx);
  const extras = Math.max(0, Math.round(extraTracksPx));
  const viewport = Math.max(0, Math.round(viewportPx));
  const padTotal = next.pagePadLeftPx + next.pagePadRightPx;
  const trackBudget = Math.max(0, viewport - padTotal);
  let trackUsed = sumPanelWidths(order, next) + gaps + extras;

  if (trackUsed > trackBudget) {
    let need = trackUsed - trackBudget;
    if (side === "left") {
      for (let i = 0; i < order.length && need > 0; i++) {
        need -= stealWidthFromPanel(next, order[i]!, need, locked);
      }
    } else {
      for (let i = order.length - 1; i >= 0 && need > 0; i--) {
        need -= stealWidthFromPanel(next, order[i]!, need, locked);
      }
    }
  } else if (trackUsed < trackBudget) {
    // Shrinking pads → grow columns so the equal-pad fit can honor desired.
    let spare = trackBudget - trackUsed;
    if (order.includes("main")) {
      spare -= giveWidthToPanel(next, "main", spare, locked);
    }
    for (const panel of order) {
      if (spare <= 0) break;
      if (panel === "main") continue;
      spare -= giveWidthToPanel(next, panel, spare, locked);
    }
  }

  return fitLayoutWidths(
    next,
    order,
    viewportPx,
    extraTracksPx,
    locked,
    "overflow",
    extraTrackCount,
  );
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
  /** Column alignment in the viewport (edit toolbar). */
  align: LayoutAlignSchema.default("center"),
  /** Content alignment for every column (edit toolbar "Text All"). */
  contentAlign: ContentAlignSchema.default("start"),
  /** Per-column content alignment overrides ("Text Sel"). */
  contentAlignByPanel: z
    .object({
      leftNav: ContentAlignSchema.optional(),
      main: ContentAlignSchema.optional(),
      rightRail: ContentAlignSchema.optional(),
    })
    .default({}),
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
  /**
   * Size locks (not position). Keys: `leftNav` | `main` | `rightRail` |
   * `pad:left` | `pad:right` | separator id. Locked widths are skipped when
   * neighbors resize or the viewport fit steals slack.
   */
  widthLocks: z.record(z.string(), z.boolean()).default({}),
  /** Top/bottom page chrome (header, dock) — moveable / resizable. */
  chrome: LayoutChromeSchema.default({}),
});
export type LayoutSlotsConfig = z.infer<typeof LayoutSlotsConfigSchema>;

/** Build a lock set from persisted widthLocks (truthy entries only). */
export function widthLockSet(
  locks: Record<string, boolean> | null | undefined,
): Set<string> {
  const out = new Set<string>();
  if (!locks) return out;
  for (const [k, v] of Object.entries(locks)) {
    if (v) out.add(k);
  }
  return out;
}

/** Interleaved panel + separator tracks for grid template building. */
export type LayoutTrack =
  | { type: "pad"; side: "left" | "right" }
  | { type: "panel"; panel: LayoutColumnPanel }
  | { type: "separator"; id: string; widthPx: number };

/**
 * Ordered grid tracks: optional outer pads, then panels with interleaved
 * separators. Pads as tracks keep chrome/CSS geometry on one list.
 * Stacked dual emits two content tracks (nav+rail share one column).
 */
export function buildLayoutTracks(
  config: Pick<LayoutSlotsConfig, "columnOrder" | "separators" | "placements">,
  opts: { includePads?: boolean } = {},
): LayoutTrack[] {
  const includePads = opts.includePads !== false;
  const out: LayoutTrack[] = [];
  if (includePads) out.push({ type: "pad", side: "left" });

  if (isStackedPair(config.placements)) {
    const isDualRight = config.placements.leftNav === "stackedRight";
    if (isDualRight) {
      out.push({ type: "panel", panel: "main" });
      out.push({ type: "panel", panel: "leftNav" });
    } else {
      out.push({ type: "panel", panel: "leftNav" });
      out.push({ type: "panel", panel: "main" });
    }
  } else {
    const order = normalizeColumnOrder(config.columnOrder);
    const visible = order.filter(
      (id) => config.placements[id] !== "hidden",
    );
    const seps = (config.separators || []).slice(0, MAX_LAYOUT_SEPARATORS);
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
  }

  if (includePads) out.push({ type: "pad", side: "right" });
  return out;
}

/** Pixel width for one track from a width budget. */
export function resolveTrackWidthPx(
  track: LayoutTrack,
  widths: LayoutWidthBudget,
): number {
  switch (track.type) {
    case "pad":
      return track.side === "left"
        ? clampPagePad(widths.pagePadLeftPx)
        : clampPagePad(widths.pagePadRightPx);
    case "panel":
      return readPanelWidth(track.panel, widths);
    case "separator":
      return clampSeparatorWidth(track.widthPx);
    default: {
      const _exhaustive: never = track;
      return _exhaustive;
    }
  }
}

/** `grid-template-columns` value from the shared track list. */
export function resolveGridTemplateColumns(
  tracks: readonly LayoutTrack[],
  widths: LayoutWidthBudget,
): string {
  return tracks
    .map((t) => `${resolveTrackWidthPx(t, widths)}px`)
    .join(" ");
}

/** Gaps between every adjacent track (pads + panels + separators). */
export function layoutTracksGapTotal(
  trackCount: number,
  columnGapPx: number,
): number {
  return gapTotalPx(trackCount, columnGapPx);
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

/** True when leftNav+rightRail are stacked together in one visual column. */
export function isStackedPair(placements: LayoutPlacements): boolean {
  return (
    (placements.leftNav === "stackedLeft" && placements.rightRail === "stackedLeft") ||
    (placements.leftNav === "stackedRight" && placements.rightRail === "stackedRight")
  );
}

/** In stacked mode rightRail mirrors leftNav's width (they share one grid column). */
/**
 * Stacked nav + rail share one column, so it can't go below the rail's
 * readable floor (the nav's icon mode is unavailable in dual layouts).
 */
export function stackedColumnWidth(leftNavPx: number): number {
  return Math.max(LAYOUT_WIDTH_LIMITS.rightRail.min, leftNavPx);
}

export function mirrorStackedWidths(
  widths: LayoutWidthBudget,
  placements: LayoutPlacements,
): LayoutWidthBudget {
  if (!isStackedPair(placements)) return widths;
  const shared = stackedColumnWidth(widths.leftNavPx);
  return { ...widths, leftNavPx: shared, rightRailPx: shared };
}

/** Drop the mirrored panel from budget sums so its column isn't double-counted. */
export function budgetColumnOrder(
  order: readonly LayoutColumnPanel[],
  placements: LayoutPlacements,
): LayoutColumnPanel[] {
  return isStackedPair(placements)
    ? order.filter((p) => p !== "rightRail")
    : [...order];
}

export function applyLayoutPreset(
  config: LayoutSlotsConfig,
  preset: LayoutPreset,
): LayoutSlotsConfig {
  if (preset === "custom") {
    return { ...config, preset: "custom" };
  }
  const columnOrder = presetToColumnOrder(preset);
  const placements: LayoutPlacements = {
    ...presetToPlacements(preset),
    subHeader:
      preset === "singleColumn"
        ? "hidden"
        : (config.placements.subHeader ?? "right"),
  };
  const next: LayoutSlotsConfig = {
    ...config,
    preset,
    columnOrder,
    placements,
  };
  // Stacked dual shares one column — persist mirrored rail width so Studio /
  // CSS paint / live fit never diverge. Per-panel zoom on the stack is cleared
  // (Zoom Sel would scale nav/rail past the grid track and overlap the feed).
  if (isStackedPair(placements)) {
    const shared = stackedColumnWidth(next.widths.leftNavPx);
    next.widths = {
      ...next.widths,
      leftNavPx: shared,
      rightRailPx: shared,
    };
    if (next.zoomByPanel) {
      next.zoomByPanel = {
        ...next.zoomByPanel,
        leftNav: 1,
        rightRail: 1,
      };
    }
  }
  return next;
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

/** Swap two panels in the column order (used when dropping onto a column center). */
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

/**
 * Reorder by removing `panel` and inserting it at `finalIndex`.
 * `finalIndex` is the index in the array **after** removal (slot-between, not swap).
 */
export function insertPanelAtIndex(
  order: readonly LayoutColumnPanel[],
  panel: LayoutColumnPanel,
  finalIndex: number,
): LayoutColumnPanel[] {
  const next = normalizeColumnOrder(order);
  const from = next.indexOf(panel);
  if (from < 0) return next;
  next.splice(from, 1);
  const to = Math.max(0, Math.min(next.length, Math.round(finalIndex)));
  next.splice(to, 0, panel);
  return next;
}

/**
 * Move `panel` into absolute position `targetIndex`; the panel currently
 * occupying that slot takes `panel`'s old spot (swap, not insert).
 * Used by setSlotZone, which maps a fixed left/center/right zone to an
 * absolute index — insertPanelAtIndex's post-removal indexing would shift
 * an untouched third panel. Between-column drag moves use insertPanelAtIndex
 * directly instead of this function.
 */
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
  /**
   * Your Reddit username (no u/). When set, removal markers and
   * r/WhatIsMyCQS tiers only count on your own content; when empty,
   * removal markers are ignored (they can't be attributed to you).
   */
  username: z.string().max(40).default(""),
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
  /** Creator Desk: hide feed posts Reddit hasn't flagged over_18. */
  showOnlyNsfw: z.boolean().default(false),
});
export type SimpleKnobs = z.infer<typeof SimpleKnobsSchema>;

/** Ids of the bundled mascot art under extension/public/mascots/*.png */
export const ProfileIconIdSchema = z.enum([
  "base",
  "bear",
  "turle",
  "robot",
  "star",
  "mod",
  "egirl",
  "nsfw",
]);
export type ProfileIconId = z.infer<typeof ProfileIconIdSchema>;

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
  /** Default mascot icon for this profile's card/badge. */
  icon: ProfileIconIdSchema.optional(),
  /** Alternate mascot icons the user may pick instead of `icon`. */
  iconOptions: z.array(ProfileIconIdSchema).default([]),
});
export type ProfilePack = z.infer<typeof ProfilePackSchema>;

/**
 * Normalize user input or Reddit data to the form Reddit's post
 * `subreddit-name` attribute uses: lowercase, no `r/` prefix; profile
 * subreddits are `u_<username>`. Returns null for anything that isn't a
 * plausible subreddit name.
 */
export function normalizeSubredditName(input: string): string | null {
  let s = String(input ?? "").trim().toLowerCase();
  s = s.replace(/^https?:\/\/(?:[a-z]+\.)?reddit\.com/, "");
  s = s.replace(/^\/+/, "").replace(/\/+$/, "");
  const profile = s.match(/^(?:u|user)\/([a-z0-9_-]+)$/);
  if (profile) s = `u_${profile[1]}`;
  else s = s.replace(/^r\//, "");
  return /^(?:u_[a-z0-9_-]{2,30}|[a-z0-9_]{2,21})$/.test(s) ? s : null;
}

/** Effective content alignment for a column: its override, else the global one. */
export function panelContentAlign(
  config: {
    contentAlign?: ContentAlign;
    contentAlignByPanel?: Partial<Record<LayoutColumnPanel, ContentAlign>>;
  },
  panel: LayoutColumnPanel,
): ContentAlign {
  return config.contentAlignByPanel?.[panel] ?? config.contentAlign ?? "start";
}

/** A linked moderated subreddit, stored normalized (see normalizeSubredditName). */
export const ModSubredditSchema = z
  .string()
  .transform((v, ctx) => {
    const name = normalizeSubredditName(v);
    if (!name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "not a subreddit name" });
      return z.NEVER;
    }
    return name;
  });

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
  /**
   * Subreddits the user moderates, linked in the Mod tab. Mod quick actions
   * only appear on posts from these; empty means no mod tools anywhere.
   */
  modSubreddits: z
    .array(ModSubredditSchema)
    .default([])
    .transform((names) => [...new Set(names)]),
  cqsSnapshots: z.array(CqsSnapshotSchema).default([]),
  cqsRiskEvents: z.array(CqsRiskEventSchema).default([]),
  cqsPrefs: CqsPrefsSchema.default({}),
  layoutSlots: LayoutSlotsConfigSchema.default({}),
  markReadPrefs: MarkReadPrefsSchema.default({}),
  commentUxPrefs: CommentUxPrefsSchema.default({}),
  feedPrefs: FeedPrefsSchema.default({}),
  keyboardNavPrefs: KeyboardNavPrefsSchema.default({}),
  commentSortPrefs: CommentSortPrefsSchema.default({}),
  linkPrefs: LinkPrefsSchema.default({}),
  allFeedPrefs: AllFeedPrefsSchema.default({}),
  studioLocale: StudioLocaleSchema.default("en"),
  featureHealth: z.record(FeatureHealthSchema).default({}),
  toolboxDetected: z.boolean().default(false),
  syncLightweight: z.boolean().default(false),
  /** Per-profile mascot icon pick, keyed by profile id (must be one of that profile's iconOptions). */
  profileIconChoice: z.record(ProfileIconIdSchema).default({}),
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

export function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

/**
 * Resolves which mascot icon a profile card should show: the user's saved pick
 * from `iconOptions` (falling back to the profile default), except Creator Desk
 * forces the "nsfw" mascot while `knobs.showOnlyNsfw` is on.
 */
export function resolveProfileIcon(
  profile: ProfilePack,
  settings: Pick<ReaditSettings, "knobs" | "profileIconChoice">,
): ProfileIconId | undefined {
  if (profile.id === "creator-desk" && settings.knobs.showOnlyNsfw) {
    return "nsfw";
  }
  const choice = settings.profileIconChoice[profile.id];
  if (choice && profile.iconOptions.includes(choice)) return choice;
  return profile.icon;
}
