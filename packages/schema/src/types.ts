import { z } from "zod";

export const SETTINGS_VERSION = 4 as const;

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
export const CssTokensSchema = z.object({
  feedWidthPx: z.number().min(480).max(1600).default(920),
  density: z.number().min(0).max(1).default(0.45),
  fontScale: z.number().min(0.85).max(1.4).default(1),
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
  leftNavPx: z.number().min(180).max(420).default(272),
  rightRailPx: z.number().min(200).max(420).default(316),
});
export type LayoutWidths = z.infer<typeof LayoutWidthsSchema>;

export const LayoutSlotsConfigSchema = z.object({
  preset: LayoutPresetSchema.default("classic"),
  placements: LayoutPlacementsSchema.default({}),
  widths: LayoutWidthsSchema.default({}),
  editMode: z.boolean().default(false),
});
export type LayoutSlotsConfig = z.infer<typeof LayoutSlotsConfigSchema>;

export const CLASSIC_LAYOUT_PLACEMENTS: LayoutPlacements = {
  leftNav: "left",
  main: "center",
  rightRail: "right",
  subHeader: "right",
};

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
