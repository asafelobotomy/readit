import type { LayoutPlacements, LayoutPreset, ReaditSettings } from "./types.js";
import {
  CLASSIC_COLUMN_ORDER,
  CLASSIC_LAYOUT_PLACEMENTS,
  ReaditSettingsSchema,
  SETTINGS_VERSION,
  columnOrderFromPlacements,
  normalizeColumnOrder,
  placementsFromColumnOrder,
} from "./types.js";
import { BUILTIN_PROFILES, createDefaultSettings } from "./profiles.js";

function ensureBuiltinProfiles(settings: ReaditSettings): ReaditSettings {
  const byId = new Map(settings.profiles.map((p) => [p.id, p]));
  let changed = false;
  for (const builtin of BUILTIN_PROFILES) {
    if (!byId.has(builtin.id)) {
      byId.set(builtin.id, structuredClone(builtin));
      changed = true;
    } else if (byId.get(builtin.id)?.builtin) {
      const existing = byId.get(builtin.id)!;
      const flagKeys = Object.keys(builtin.flags) as Array<
        keyof typeof builtin.flags
      >;
      const missingFlag = flagKeys.some(
        (k) => existing.flags[k] === undefined,
      );
      const metaChanged =
        existing.name !== builtin.name ||
        existing.description !== builtin.description;
      if (metaChanged || missingFlag) {
        byId.set(builtin.id, {
          ...existing,
          name: builtin.name,
          description: builtin.description,
          audiences: builtin.audiences,
          builtin: true,
          knobs: structuredClone(builtin.knobs),
          flags: {
            ...structuredClone(builtin.flags),
            ...existing.flags,
            ...Object.fromEntries(
              flagKeys
                .filter((k) => existing.flags[k] === undefined)
                .map((k) => [k, builtin.flags[k]]),
            ),
          },
        });
        changed = true;
      }
    }
  }
  if (!changed && settings.profiles.length === byId.size) return settings;
  return {
    ...settings,
    profiles: Array.from(byId.values()),
  };
}

/**
 * Versioned settings migrations. v1 is the baseline; future bumps append
 * transforms here so upgrades never wipe user data.
 */
export function migrateSettings(raw: unknown): ReaditSettings {
  const defaults = createDefaultSettings();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  const record = raw as Record<string, unknown>;
  const version =
    typeof record.version === "number" ? record.version : 0;

  if (version < 1) {
    const merged = {
      ...defaults,
      ...record,
      version: 1,
      profiles:
        Array.isArray(record.profiles) && record.profiles.length > 0
          ? record.profiles
          : defaults.profiles,
    };
    const parsed = ReaditSettingsSchema.safeParse({
      ...merged,
      version: SETTINGS_VERSION,
    });
    let base = parsed.success ? parsed.data : defaults;
    base = ensureBuiltinProfiles(applyV2CqsDefaults(base));
    base = applyV3LayoutDefaults(base);
    base = applyV4FeedbackDefaults(base);
    base = applyV5WaveADefaults(base);
    base = applyV6ColumnOrderDefaults(base);
    return applyV8EditChromeDefaults(applyV7ProfileLayoutRecipes(base));
  }

  const parsed = ReaditSettingsSchema.safeParse({
    ...record,
    version: SETTINGS_VERSION,
  });
  let base = parsed.success
    ? parsed.data
    : ensureBuiltinProfiles({
        ...defaults,
        ...(raw as Partial<ReaditSettings>),
        version: SETTINGS_VERSION,
      } as ReaditSettings);

  base = ensureBuiltinProfiles(base);

  if (version < 2) {
    base = applyV2CqsDefaults(base);
  }
  if (version < 3) {
    base = applyV3LayoutDefaults(base);
  }
  if (version < 4) {
    base = applyV4FeedbackDefaults(base);
  }
  if (version < 5) {
    base = applyV5WaveADefaults(base);
  }
  if (version < 6) {
    base = applyV6ColumnOrderDefaults(base);
  }
  if (version < 7) {
    base = applyV7ProfileLayoutRecipes(base);
  }
  if (version < 8) {
    base = applyV8EditChromeDefaults(base);
  }

  return { ...base, version: SETTINGS_VERSION };
}

/** v2: CQS tracker storage + Creator Desk default enable. */
function applyV2CqsDefaults(settings: ReaditSettings): ReaditSettings {
  const profiles = settings.profiles.map((p) => {
    if (p.id !== "creator-desk" || !p.builtin) return p;
    return {
      ...p,
      description:
        "Canned replies, clean links, CQS tracker, absolute timestamps, tags.",
      flags: { ...p.flags, cqsTracker: true },
    };
  });
  const flags =
    settings.activeProfileId === "creator-desk"
      ? { ...settings.flags, cqsTracker: true }
      : settings.flags;
  return {
    ...settings,
    profiles,
    flags,
    cqsSnapshots: settings.cqsSnapshots ?? [],
    cqsRiskEvents: settings.cqsRiskEvents ?? [],
    cqsPrefs: settings.cqsPrefs ?? {
      warnBurst: true,
      warnDuplicate: true,
      warnPromo: true,
      burstWindowMs: 600_000,
      burstLimit: 8,
    },
  };
}

/** v3: layout slot config + enable flag on Focus / Dense / Creator. */
function applyV3LayoutDefaults(settings: ReaditSettings): ReaditSettings {
  const enableIds = new Set(["focus-reader", "dense-power", "creator-desk"]);
  const profiles = settings.profiles.map((p) => {
    if (!p.builtin) return p;
    return {
      ...p,
      flags: {
        ...p.flags,
        layoutSlots: enableIds.has(p.id) ? true : (p.flags.layoutSlots ?? false),
      },
    };
  });
  const enableLive = enableIds.has(settings.activeProfileId);
  return {
    ...settings,
    profiles,
    flags: {
      ...settings.flags,
      layoutSlots: settings.flags.layoutSlots ?? enableLive,
    },
    layoutSlots: settings.layoutSlots ?? {
      preset: "classic" as LayoutPreset,
      placements: { ...CLASSIC_LAYOUT_PLACEMENTS } as LayoutPlacements,
      columnOrder: [...CLASSIC_COLUMN_ORDER],
      widths: {
        leftNavPx: 272,
        rightRailPx: 316,
        pagePadLeftPx: 24,
        pagePadRightPx: 24,
        columnGapPx: 12,
      },
      editMode: false,
    },
  };
}

/** v4: chrome noise pack + mark-read / anti-refresh / comment UX prefs. */
function applyV4FeedbackDefaults(settings: ReaditSettings): ReaditSettings {
  const hide = settings.knobs.hide;
  return {
    ...settings,
    knobs: {
      ...settings.knobs,
      hide: {
        ...hide,
        joinConversation: hide.joinConversation ?? false,
        relatedCommunities: hide.relatedCommunities ?? false,
        redditPro: hide.redditPro ?? false,
        aiSummary: hide.aiSummary ?? false,
        searchAnswers: hide.searchAnswers ?? false,
        announcements: hide.announcements ?? false,
      },
    },
    flags: {
      ...settings.flags,
      markRead: settings.flags.markRead ?? false,
      antiRefresh: settings.flags.antiRefresh ?? false,
      commentUx: settings.flags.commentUx ?? false,
    },
    markReadPrefs: settings.markReadPrefs ?? {
      mode: "off",
      dimOpacity: 0.45,
    },
    commentUxPrefs: settings.commentUxPrefs ?? {
      quoteButton: true,
      showFormatting: true,
    },
    studioLocale: settings.studioLocale ?? "en",
  };
}

/** v5: Wave A feed philosophy — Following default, lurker, compact, hotkey defer. */
function applyV5WaveADefaults(settings: ReaditSettings): ReaditSettings {
  const hide = settings.knobs.hide;
  const followingIds = new Set(["focus-reader", "dense-power", "minimal-media"]);
  const compactIds = new Set(["dense-power", "minimal-media"]);
  const profiles = settings.profiles.map((p) => {
    if (!p.builtin) return p;
    return {
      ...p,
      flags: {
        ...p.flags,
        followingFeed:
          p.flags.followingFeed ?? followingIds.has(p.id),
        lurkerMode: p.flags.lurkerMode ?? false,
        // Keep keyboardNav flag as “feature armed”; mode defaults to defer
        keyboardNav: p.flags.keyboardNav ?? false,
      },
      knobs: {
        ...p.knobs,
        hide: {
          ...p.knobs.hide,
          awards: p.knobs.hide.awards ?? false,
          crosspost: p.knobs.hide.crosspost ?? false,
          joinButton: p.knobs.hide.joinButton ?? false,
        },
      },
    };
  });
  const enableFollowing = followingIds.has(settings.activeProfileId);
  const enableCompact = compactIds.has(settings.activeProfileId);
  return {
    ...settings,
    profiles,
    knobs: {
      ...settings.knobs,
      hide: {
        ...hide,
        awards: hide.awards ?? false,
        crosspost: hide.crosspost ?? false,
        joinButton: hide.joinButton ?? false,
      },
    },
    flags: {
      ...settings.flags,
      followingFeed: settings.flags.followingFeed ?? enableFollowing,
      lurkerMode: settings.flags.lurkerMode ?? false,
    },
    feedPrefs: settings.feedPrefs ?? {
      followingDefault: true,
      feedDensity: enableCompact ? "compact" : "comfortable",
    },
    keyboardNavPrefs: settings.keyboardNavPrefs ?? {
      mode: "defer",
    },
  };
}

/** v6: three-column panel permutation (panel-owned widths). */
function applyV6ColumnOrderDefaults(settings: ReaditSettings): ReaditSettings {
  const layout = settings.layoutSlots;
  const columnOrder = normalizeColumnOrder(
    layout.columnOrder?.length
      ? layout.columnOrder
      : columnOrderFromPlacements(layout.placements),
  );
  const widths = {
    leftNavPx: layout.widths.leftNavPx ?? 272,
    rightRailPx: layout.widths.rightRailPx ?? 316,
    pagePadLeftPx: layout.widths.pagePadLeftPx ?? 24,
    pagePadRightPx: layout.widths.pagePadRightPx ?? 24,
    columnGapPx: layout.widths.columnGapPx ?? 12,
  };
  return {
    ...settings,
    layoutSlots: {
      ...layout,
      columnOrder,
      placements: placementsFromColumnOrder(columnOrder, layout.placements),
      widths,
      editMode: layout.editMode ?? false,
    },
  };
}

/** v7: attach column-layout recipes to builtin profile packs. */
function applyV7ProfileLayoutRecipes(settings: ReaditSettings): ReaditSettings {
  const byBuiltin = new Map(BUILTIN_PROFILES.map((p) => [p.id, p]));
  const profiles = settings.profiles.map((p) => {
    if (!p.builtin) return p;
    const builtin = byBuiltin.get(p.id);
    if (!builtin?.layoutSlots) return p;
    return {
      ...p,
      flags: {
        ...p.flags,
        layoutSlots: builtin.flags.layoutSlots,
      },
      layoutSlots: structuredClone(builtin.layoutSlots),
    };
  });
  return { ...settings, profiles };
}

/** v8: edit toolbox — separators, gutter theme, zoom, font family/weight. */
function applyV8EditChromeDefaults(settings: ReaditSettings): ReaditSettings {
  const layout = settings.layoutSlots;
  const tokens = settings.knobs.tokens;
  return {
    ...settings,
    knobs: {
      ...settings.knobs,
      tokens: {
        ...tokens,
        fontFamily: tokens.fontFamily ?? "system",
        fontWeight: tokens.fontWeight ?? 400,
      },
    },
    layoutSlots: {
      ...layout,
      separators: layout.separators ?? [],
      gutterTheme: layout.gutterTheme ?? "plain",
      zoomAll: layout.zoomAll ?? 1,
      zoomByPanel: layout.zoomByPanel ?? {},
    },
  };
}
