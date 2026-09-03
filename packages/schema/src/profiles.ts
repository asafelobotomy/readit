import type {
  LayoutPreset,
  LayoutSlotsConfig,
  LayoutWidths,
  ProfilePack,
  ReaditSettings,
} from "./types.js";
import {
  CLASSIC_COLUMN_ORDER,
  CLASSIC_LAYOUT_PLACEMENTS,
  SETTINGS_VERSION,
  applyLayoutPreset,
  normalizeColumnOrder,
} from "./types.js";

const emptyActionHide = {
  awards: false,
  crosspost: false,
  joinButton: false,
} as const;

function profileLayoutRecipe(
  preset: LayoutPreset,
  widths: LayoutWidths,
): LayoutSlotsConfig {
  return applyLayoutPreset(
    {
      preset: "classic",
      placements: { ...CLASSIC_LAYOUT_PLACEMENTS },
      columnOrder: [...CLASSIC_COLUMN_ORDER],
      widths,
      editMode: false,
      separators: [],
      gutterTheme: "plain",
      zoomAll: 1,
      zoomByPanel: {},
    },
    preset,
  );
}

const focusReader: ProfilePack = {
  id: "focus-reader",
  name: "Focus Reader",
  description: "Wide text, media demoted, sidebars and promoted hidden.",
  audiences: ["reader"],
  builtin: true,
  knobs: {
    tokens: {
      feedWidthPx: 980,
      density: 0.35,
      fontFamily: "system",
      fontWeight: 400,
      fontScale: 1.08,
      radiusPx: 10,
      accent: "#ff4500",
      themeMode: "system",
    },
    hide: {
      promoted: true,
      recommended: true,
      sidebars: true,
      getApp: true,
      premiumUpsell: true,
      joinConversation: false,
      relatedCommunities: false,
      redditPro: false,
      aiSummary: false,
      searchAnswers: false,
      announcements: false,
      ...emptyActionHide,
    },
    mediaMode: "links_on_feed",
    quietNsfw: false,
    showNotes: true,
    queueDensity: false,
    macroBar: false,
  },
  flags: {
    hideNoise: true,
    resizeFeed: true,
    elementRules: true,
    filters: true,
    userTags: true,
    readingMode: true,
    savedLibrary: true,
    cannedReplies: false,
    cleanLinks: true,
    absoluteTimestamps: false,
    opHighlight: true,
    alwaysShowActions: false,
    modQuickActions: false,
    modMacros: false,
    modUsernotes: false,
    modHighlight: false,
    keyboardNav: false,
    cqsTracker: false,
    layoutSlots: true,
    markRead: false,
    antiRefresh: false,
    commentUx: false,
    followingFeed: true,
    lurkerMode: false,
  },
  layoutSlots: profileLayoutRecipe("singleColumn", {
    leftNavPx: 272,
    rightRailPx: 316,
    pagePadLeftPx: 48,
    pagePadRightPx: 48,
    columnGapPx: 12,
  }),
};

const densePower: ProfilePack = {
  id: "dense-power",
  name: "Dense Power",
  description:
    "Compact cards, Following-first Home, official hotkeys by default (opt into readit J/K).",
  audiences: ["reader", "creator"],
  builtin: true,
  knobs: {
    tokens: {
      feedWidthPx: 1100,
      density: 0.85,
      fontFamily: "system",
      fontWeight: 400,
      fontScale: 0.95,
      radiusPx: 4,
      accent: "#0079d3",
      themeMode: "system",
    },
    hide: {
      promoted: true,
      recommended: true,
      sidebars: false,
      getApp: true,
      premiumUpsell: true,
      joinConversation: false,
      relatedCommunities: false,
      redditPro: false,
      aiSummary: false,
      searchAnswers: false,
      announcements: false,
      awards: true,
      crosspost: true,
      joinButton: true,
    },
    mediaMode: "autoplay_off",
    quietNsfw: false,
    showNotes: true,
    queueDensity: false,
    macroBar: false,
  },
  flags: {
    hideNoise: true,
    resizeFeed: true,
    elementRules: true,
    filters: true,
    userTags: true,
    readingMode: true,
    savedLibrary: true,
    cannedReplies: true,
    cleanLinks: true,
    absoluteTimestamps: true,
    opHighlight: true,
    alwaysShowActions: true,
    modQuickActions: false,
    modMacros: false,
    modUsernotes: false,
    modHighlight: false,
    /** Armed; mode defaults to defer via keyboardNavPrefs */
    keyboardNav: true,
    cqsTracker: false,
    layoutSlots: true,
    markRead: true,
    antiRefresh: true,
    commentUx: false,
    followingFeed: true,
    lurkerMode: false,
  },
  layoutSlots: profileLayoutRecipe("classic", {
    leftNavPx: 240,
    rightRailPx: 280,
    pagePadLeftPx: 16,
    pagePadRightPx: 16,
    columnGapPx: 8,
  }),
};

const creatorDesk: ProfilePack = {
  id: "creator-desk",
  name: "Creator Desk",
  description: "Canned replies, clean links, CQS tracker, absolute timestamps, tags.",
  audiences: ["creator"],
  builtin: true,
  knobs: {
    tokens: {
      feedWidthPx: 1000,
      density: 0.5,
      fontFamily: "system",
      fontWeight: 400,
      fontScale: 1,
      radiusPx: 8,
      accent: "#46d160",
      themeMode: "system",
    },
    hide: {
      promoted: true,
      recommended: false,
      sidebars: false,
      getApp: true,
      premiumUpsell: true,
      joinConversation: false,
      relatedCommunities: false,
      redditPro: false,
      aiSummary: false,
      searchAnswers: false,
      announcements: false,
      ...emptyActionHide,
    },
    mediaMode: "normal",
    quietNsfw: false,
    showNotes: true,
    queueDensity: false,
    macroBar: false,
  },
  flags: {
    hideNoise: true,
    resizeFeed: true,
    elementRules: true,
    filters: true,
    userTags: true,
    readingMode: true,
    savedLibrary: true,
    cannedReplies: true,
    cleanLinks: true,
    absoluteTimestamps: true,
    opHighlight: true,
    alwaysShowActions: true,
    modQuickActions: false,
    modMacros: false,
    modUsernotes: false,
    modHighlight: false,
    keyboardNav: false,
    cqsTracker: true,
    layoutSlots: true,
    markRead: false,
    antiRefresh: false,
    commentUx: false,
    followingFeed: false,
    lurkerMode: false,
  },
  layoutSlots: profileLayoutRecipe("classic", {
    leftNavPx: 272,
    rightRailPx: 340,
    pagePadLeftPx: 24,
    pagePadRightPx: 24,
    columnGapPx: 12,
  }),
};

const minimalMedia: ProfilePack = {
  id: "minimal-media",
  name: "Minimal Media",
  description: "Images and videos as links on feeds; galleries on post pages.",
  audiences: ["reader"],
  builtin: true,
  knobs: {
    tokens: {
      feedWidthPx: 900,
      density: 0.4,
      fontFamily: "system",
      fontWeight: 400,
      fontScale: 1.05,
      radiusPx: 8,
      accent: "#ff4500",
      themeMode: "system",
    },
    hide: {
      promoted: true,
      recommended: true,
      sidebars: false,
      getApp: true,
      premiumUpsell: true,
      joinConversation: false,
      relatedCommunities: false,
      redditPro: false,
      aiSummary: false,
      searchAnswers: false,
      announcements: false,
      ...emptyActionHide,
    },
    mediaMode: "links_on_feed",
    quietNsfw: true,
    showNotes: true,
    queueDensity: false,
    macroBar: false,
  },
  flags: {
    hideNoise: true,
    resizeFeed: true,
    elementRules: true,
    filters: true,
    userTags: false,
    readingMode: true,
    savedLibrary: true,
    cannedReplies: false,
    cleanLinks: true,
    absoluteTimestamps: false,
    opHighlight: false,
    alwaysShowActions: false,
    modQuickActions: false,
    modMacros: false,
    modUsernotes: false,
    modHighlight: false,
    keyboardNav: false,
    cqsTracker: false,
    layoutSlots: true,
    markRead: false,
    antiRefresh: false,
    commentUx: false,
    followingFeed: true,
    lurkerMode: false,
  },
  layoutSlots: profileLayoutRecipe("classic", {
    leftNavPx: 260,
    rightRailPx: 300,
    pagePadLeftPx: 32,
    pagePadRightPx: 32,
    columnGapPx: 12,
  }),
};

const modDesk: ProfilePack = {
  id: "mod-desk",
  name: "Mod Desk",
  description: "Queue-focused layout, macros, usernotes, mod quick actions.",
  audiences: ["moderator"],
  builtin: true,
  knobs: {
    tokens: {
      feedWidthPx: 1200,
      density: 0.9,
      fontFamily: "system",
      fontWeight: 400,
      fontScale: 0.92,
      radiusPx: 4,
      accent: "#d93900",
      themeMode: "system",
    },
    hide: {
      promoted: true,
      recommended: true,
      sidebars: false,
      getApp: true,
      premiumUpsell: true,
      joinConversation: false,
      relatedCommunities: false,
      redditPro: false,
      aiSummary: false,
      searchAnswers: false,
      announcements: false,
      ...emptyActionHide,
    },
    mediaMode: "autoplay_off",
    quietNsfw: false,
    showNotes: true,
    queueDensity: true,
    macroBar: true,
  },
  flags: {
    hideNoise: true,
    resizeFeed: true,
    elementRules: true,
    filters: true,
    userTags: true,
    readingMode: false,
    savedLibrary: true,
    cannedReplies: true,
    cleanLinks: true,
    absoluteTimestamps: true,
    opHighlight: true,
    alwaysShowActions: true,
    modQuickActions: true,
    modMacros: true,
    modUsernotes: true,
    modHighlight: true,
    keyboardNav: true,
    cqsTracker: false,
    layoutSlots: true,
    markRead: false,
    antiRefresh: false,
    commentUx: false,
    followingFeed: false,
    lurkerMode: false,
  },
  layoutSlots: profileLayoutRecipe("navRight", {
    leftNavPx: 240,
    rightRailPx: 360,
    pagePadLeftPx: 16,
    pagePadRightPx: 16,
    columnGapPx: 8,
  }),
};

export const BUILTIN_PROFILES: ProfilePack[] = [
  focusReader,
  densePower,
  creatorDesk,
  minimalMedia,
  modDesk,
];

export function createDefaultSettings(): ReaditSettings {
  const active = focusReader;
  return {
    version: SETTINGS_VERSION,
    paused: false,
    mode: "simple",
    activeProfileId: active.id,
    profiles: BUILTIN_PROFILES.map((p) => structuredClone(p)),
    knobs: structuredClone(active.knobs),
    flags: structuredClone(active.flags),
    filters: [],
    tags: [],
    elementRules: [],
    subredditOverrides: [],
    savedFolders: [
      { id: "inbox", name: "Inbox" },
      { id: "queue", name: "Reading queue" },
    ],
    savedItems: [],
    cannedReplies: [
      {
        id: "cr_thanks",
        title: "Thanks",
        body: "Thanks for sharing — really helpful!",
      },
      {
        id: "cr_clarify",
        title: "Clarify",
        body: "Could you clarify what you mean here?",
      },
    ],
    modMacros: [
      {
        id: "mm_spam",
        title: "Spam removal",
        body: "Removed as spam / off-topic for this community.",
        kind: "removal",
      },
      {
        id: "mm_rule",
        title: "Rule reminder",
        body: "Removed for breaking community rules. Please review the sidebar.",
        kind: "removal",
      },
    ],
    usernotes: [],
    cqsSnapshots: [],
    cqsRiskEvents: [],
    cqsPrefs: {
      warnBurst: true,
      warnDuplicate: true,
      warnPromo: true,
      burstWindowMs: 600_000,
      burstLimit: 8,
    },
    layoutSlots: structuredClone(
      active.layoutSlots ??
        profileLayoutRecipe("classic", {
          leftNavPx: 272,
          rightRailPx: 316,
          pagePadLeftPx: 24,
          pagePadRightPx: 24,
          columnGapPx: 12,
        }),
    ),
    markReadPrefs: {
      mode: "off",
      dimOpacity: 0.45,
    },
    commentUxPrefs: {
      quoteButton: true,
      showFormatting: true,
    },
    feedPrefs: {
      followingDefault: true,
      feedDensity: "comfortable",
    },
    keyboardNavPrefs: {
      mode: "defer",
    },
    studioLocale: "en",
    featureHealth: {},
    toolboxDetected: false,
    syncLightweight: false,
  };
}

export function applyProfile(
  settings: ReaditSettings,
  profileId: string,
): ReaditSettings {
  const profile =
    settings.profiles.find((p) => p.id === profileId) ??
    BUILTIN_PROFILES.find((p) => p.id === profileId);
  if (!profile) return settings;

  const compactIds = new Set(["dense-power", "minimal-media"]);
  return {
    ...settings,
    activeProfileId: profile.id,
    knobs: structuredClone(profile.knobs),
    flags: { ...settings.flags, ...structuredClone(profile.flags) },
    feedPrefs: {
      ...settings.feedPrefs,
      followingDefault: profile.flags.followingFeed
        ? true
        : settings.feedPrefs.followingDefault,
      feedDensity: compactIds.has(profile.id) ? "compact" : "comfortable",
    },
    layoutSlots: profile.layoutSlots
      ? {
          ...structuredClone(profile.layoutSlots),
          editMode: false,
        }
      : settings.layoutSlots,
  };
}

/** Short Studio blurb for a profile’s column-layout recipe. */
export function formatProfileLayoutBlurb(
  profile: ProfilePack,
): string | null {
  if (!profile.flags.layoutSlots || !profile.layoutSlots) return null;
  const layout = profile.layoutSlots;
  if (layout.preset === "singleColumn") return "Layout: single column";
  const labels: Record<"leftNav" | "main" | "rightRail", string> = {
    leftNav: "nav",
    main: "feed",
    rightRail: "rail",
  };
  const order = normalizeColumnOrder(layout.columnOrder)
    .filter((id) => layout.placements[id] !== "hidden")
    .map((id) => labels[id])
    .join(" · ");
  return order ? `Layout: ${order}` : null;
}
