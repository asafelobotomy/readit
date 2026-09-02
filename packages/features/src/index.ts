import { applyStylesheet, removeStylesheet } from "@readit/css-engine";
import type { FeatureFlags, FeatureHealth, ReaditSettings } from "@readit/schema";
import {
  absoluteTimestampsFeature,
  alwaysShowActionsFeature,
  cannedRepliesFeature,
  cleanLinksFeature,
  isEditableTarget,
  keyboardNavFeature,
  opHighlightFeature,
  readingModeFeature,
  savedLibraryFeature,
  userTagsFeature,
} from "./reader-creator.js";
import {
  cqsTrackerFeature,
  appendCqsRiskEvent,
  appendCqsSnapshot,
  computeCqsRiskScore,
  confidenceLabel,
  latestCqsTier,
  parseCqsTierFromText,
  CQS_TIERS,
  tierDelta,
} from "./cqs.js";
import {
  elementRulesFeature,
  filtersFeature,
  hideNoiseFeature,
  resizeFeedFeature,
} from "./hide-and-filter.js";
import {
  applyColumnOrder,
  applyLayoutPreset,
  clearLayoutSlotMarks,
  COLUMN_PANEL_LABELS,
  LAYOUT_SLOTS,
  layoutSlotsFeature,
  layoutSlotsHealth,
  moveLayoutPanelToIndex,
  presetToColumnOrder,
  presetToPlacements,
  resolveSlots,
  setSlotZone,
  stampLayoutSlots,
  swapLayoutColumns,
  syncSidebarsHide,
} from "./layout-slots.js";
import {
  antiRefreshFeature,
  commentUxFeature,
  markReadFeature,
} from "./ux-extras.js";
import {
  followingFeedFeature,
  lurkerModeFeature,
} from "./feed-philosophy.js";
import {
  modHighlightFeature,
  modMacrosFeature,
  modQuickActionsFeature,
  modUsernotesFeature,
} from "./mod.js";
import type { FeatureContext, FeatureModule } from "./utils.js";
import {
  cleanRedditUrl,
  currentSubreddit,
  detectToolbox,
  isModRoute,
  toReddIt,
} from "./utils.js";

export const ALL_FEATURES: FeatureModule[] = [
  hideNoiseFeature,
  resizeFeedFeature,
  layoutSlotsFeature,
  elementRulesFeature,
  filtersFeature,
  userTagsFeature,
  readingModeFeature,
  savedLibraryFeature,
  absoluteTimestampsFeature,
  opHighlightFeature,
  alwaysShowActionsFeature,
  cleanLinksFeature,
  cannedRepliesFeature,
  keyboardNavFeature,
  markReadFeature,
  antiRefreshFeature,
  commentUxFeature,
  followingFeedFeature,
  lurkerModeFeature,
  cqsTrackerFeature,
  modQuickActionsFeature,
  modMacrosFeature,
  modUsernotesFeature,
  modHighlightFeature,
];

/** Features safe to re-run on DOM mutations (idempotent via marks). */
const SCAN_FEATURE_IDS = new Set([
  "filters",
  "userTags",
  "absoluteTimestamps",
  "opHighlight",
  "alwaysShowActions",
  "modQuickActions",
  "modUsernotes",
  "modHighlight",
  "cqsTracker",
  "layoutSlots",
  "markRead",
  "commentUx",
  "followingFeed",
]);

export type FeatureRuntime = {
  applyAll: (settings: ReaditSettings) => void;
  /** Incremental DOM pass without tearing down CSS/listeners. */
  scanDom: (settings: ReaditSettings) => void;
  teardownAll: () => void;
  getHealth: () => Record<string, FeatureHealth>;
  getToolboxDetected: () => boolean;
};

function isFlagEnabled(settings: ReaditSettings, id: string): boolean {
  if (settings.paused) return false;
  if (id in settings.flags) {
    return Boolean(settings.flags[id as keyof FeatureFlags]);
  }
  return true;
}

export function createFeatureRuntime(): FeatureRuntime {
  let last: ReaditSettings | null = null;
  let lastEnabled = new Map<string, boolean>();
  let toolboxDetected = false;
  const health: Record<string, FeatureHealth> = {};

  const ctxFrom = (settings: ReaditSettings): FeatureContext => ({
    settings: { ...settings, toolboxDetected },
    subreddit: currentSubreddit(location.pathname),
    pathname: location.pathname,
  });

  return {
    applyAll(settings) {
      toolboxDetected = detectToolbox();
      const next = { ...settings, toolboxDetected };
      last = next;
      applyStylesheet(next);

      for (const feature of ALL_FEATURES) {
        const enabled = isFlagEnabled(next, feature.id);
        const wasEnabled = lastEnabled.get(feature.id) ?? false;
        const ctx = ctxFrom(next);
        try {
          if (!enabled) {
            if (wasEnabled) feature.teardown(ctx);
            lastEnabled.set(feature.id, false);
          } else if (!wasEnabled) {
            void feature.apply(ctx);
            lastEnabled.set(feature.id, true);
          } else if (SCAN_FEATURE_IDS.has(feature.id)) {
            void feature.apply(ctx);
            lastEnabled.set(feature.id, true);
          } else if (feature.id === "keyboardNav" || feature.id === "followingFeed") {
            feature.teardown(ctx);
            void feature.apply(ctx);
            lastEnabled.set(feature.id, true);
          } else {
            lastEnabled.set(feature.id, true);
          }
          health[feature.id] = feature.health?.() ?? "ok";
        } catch {
          health[feature.id] = "broken";
        }
      }

      document.documentElement.dataset.readitToolbox = toolboxDetected
        ? "1"
        : "0";
    },
    scanDom(settings) {
      toolboxDetected = detectToolbox();
      const next = { ...settings, toolboxDetected };
      last = next;
      if (next.paused) return;
      for (const feature of ALL_FEATURES) {
        if (!SCAN_FEATURE_IDS.has(feature.id)) continue;
        if (!isFlagEnabled(next, feature.id)) continue;
        try {
          void feature.apply(ctxFrom(next));
          lastEnabled.set(feature.id, true);
          health[feature.id] = feature.health?.() ?? "ok";
        } catch {
          health[feature.id] = "broken";
        }
      }
      document.documentElement.dataset.readitToolbox = toolboxDetected
        ? "1"
        : "0";
    },
    teardownAll() {
      if (!last) {
        removeStylesheet();
        return;
      }
      for (const feature of ALL_FEATURES) {
        try {
          feature.teardown(ctxFrom(last));
        } catch {
          /* ignore */
        }
      }
      lastEnabled.clear();
      removeStylesheet();
      last = null;
    },
    getHealth() {
      return { ...health };
    },
    getToolboxDetected() {
      return toolboxDetected;
    },
  };
}

export type { FeatureContext, FeatureModule };
export {
  cleanRedditUrl,
  currentSubreddit,
  detectToolbox,
  isModRoute,
  toReddIt,
};
export {
  appendCqsRiskEvent,
  appendCqsSnapshot,
  computeCqsRiskScore,
  confidenceLabel,
  latestCqsTier,
  parseCqsTierFromText,
  CQS_TIERS,
  tierDelta,
};
export {
  applyColumnOrder,
  applyLayoutPreset,
  clearLayoutSlotMarks,
  COLUMN_PANEL_LABELS,
  LAYOUT_SLOTS,
  layoutSlotsFeature,
  layoutSlotsHealth,
  moveLayoutPanelToIndex,
  presetToColumnOrder,
  presetToPlacements,
  resolveSlots,
  setSlotZone,
  stampLayoutSlots,
  swapLayoutColumns,
  syncSidebarsHide,
};
export type {
  LayoutOrderPersistDetail,
  LayoutPadsPersistDetail,
  LayoutWidthsPersistDetail,
  ResolvedSlot,
  SlotDefinition,
} from "./layout-slots.js";
export {
  antiRefreshFeature,
  commentUxFeature,
  markReadFeature,
};
export {
  followingFeedFeature,
  lurkerModeFeature,
  switchHomeToFollowing,
} from "./feed-philosophy.js";
export { isEditableTarget };
