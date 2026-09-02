import type {
  FeatureHealth,
  LayoutPlacements,
  LayoutPreset,
  LayoutSlotId,
  LayoutSlotsConfig,
  LayoutZone,
  ReaditSettings,
} from "@readit/schema";
import { CLASSIC_LAYOUT_PLACEMENTS } from "@readit/schema";
import type { FeatureModule } from "./utils.js";

export type SlotDefinition = {
  id: LayoutSlotId;
  label: string;
  selectors: string[];
};

/** Stable New Reddit chrome landmarks (not feed posts). */
export const LAYOUT_SLOTS: readonly SlotDefinition[] = [
  {
    id: "leftNav",
    label: "Left nav",
    selectors: [
      "#left-sidebar-container",
      "#left-sidebar",
      "reddit-sidebar-nav",
      "#flex-left-nav-container",
    ],
  },
  {
    id: "main",
    label: "Main feed",
    selectors: ["#main-content", "main.main", "main"],
  },
  {
    id: "rightRail",
    label: "Right rail",
    selectors: [
      "#right-sidebar-container",
      "[data-testid='frontpage-sidebar']",
      "[data-testid='subreddit-sidebar']",
    ],
  },
  {
    id: "subHeader",
    label: "Subreddit header",
    selectors: ["shreddit-subreddit-header"],
  },
] as const;

export type ResolvedSlot = {
  id: LayoutSlotId;
  label: string;
  el: Element | null;
  health: FeatureHealth;
};

export function presetToPlacements(preset: LayoutPreset): LayoutPlacements {
  switch (preset) {
    case "classic":
      return { ...CLASSIC_LAYOUT_PLACEMENTS };
    case "navRight":
      return {
        leftNav: "right",
        main: "center",
        rightRail: "left",
        subHeader: "left",
      };
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

export function resolveSlots(doc: ParentNode = document): ResolvedSlot[] {
  return LAYOUT_SLOTS.map((def) => {
    let el: Element | null = null;
    for (const sel of def.selectors) {
      try {
        el = doc.querySelector(sel);
      } catch {
        el = null;
      }
      if (el) break;
    }
    return {
      id: def.id,
      label: def.label,
      el,
      health: el ? "ok" : "degraded",
    };
  });
}

export function stampLayoutSlots(doc: Document = document): ResolvedSlot[] {
  const resolved = resolveSlots(doc);
  for (const slot of resolved) {
    if (!slot.el) continue;
    slot.el.setAttribute("data-readit-slot", slot.id);
  }
  // Mark shell parent when both left + subgrid exist
  const left = doc.querySelector('[data-readit-slot="leftNav"]');
  const subgrid = doc.querySelector("#subgrid-container");
  const parent = left?.parentElement;
  if (parent && subgrid && parent.contains(subgrid)) {
    parent.setAttribute("data-readit-layout-shell", "1");
  }
  return resolved;
}

export function clearLayoutSlotMarks(doc: Document = document): void {
  doc
    .querySelectorAll("[data-readit-slot]")
    .forEach((el) => el.removeAttribute("data-readit-slot"));
  doc
    .querySelectorAll("[data-readit-layout-shell]")
    .forEach((el) => el.removeAttribute("data-readit-layout-shell"));
}

export function layoutSlotsHealth(resolved: ResolvedSlot[]): FeatureHealth {
  const critical = resolved.filter((s) => s.id === "leftNav" || s.id === "main");
  if (critical.every((s) => s.health === "degraded")) return "broken";
  if (resolved.some((s) => s.health === "degraded")) return "degraded";
  return "ok";
}

export function applyLayoutPreset(
  config: LayoutSlotsConfig,
  preset: LayoutPreset,
): LayoutSlotsConfig {
  if (preset === "custom") {
    return { ...config, preset: "custom" };
  }
  return {
    ...config,
    preset,
    placements: presetToPlacements(preset),
  };
}

export function setSlotZone(
  config: LayoutSlotsConfig,
  slot: LayoutSlotId,
  zone: LayoutZone,
): LayoutSlotsConfig {
  if (slot === "main") {
    return config;
  }
  return {
    ...config,
    preset: "custom",
    placements: { ...config.placements, [slot]: zone, main: "center" },
  };
}

/** Bridge Simple “Hide sidebars” → single-column placements. */
export function syncSidebarsHide(
  settings: ReaditSettings,
  hideSidebars: boolean,
): ReaditSettings {
  if (hideSidebars) {
    return {
      ...settings,
      knobs: {
        ...settings.knobs,
        hide: { ...settings.knobs.hide, sidebars: true },
      },
      layoutSlots: applyLayoutPreset(settings.layoutSlots, "singleColumn"),
      flags: { ...settings.flags, layoutSlots: true },
    };
  }
  // Restoring: only leave singleColumn if that was the active preset
  if (settings.layoutSlots.preset === "singleColumn") {
    return {
      ...settings,
      knobs: {
        ...settings.knobs,
        hide: { ...settings.knobs.hide, sidebars: false },
      },
      layoutSlots: applyLayoutPreset(settings.layoutSlots, "classic"),
    };
  }
  return {
    ...settings,
    knobs: {
      ...settings.knobs,
      hide: { ...settings.knobs.hide, sidebars: false },
    },
  };
}

export const layoutSlotsFeature: FeatureModule = {
  id: "layoutSlots",
  tier: "simple",
  audience: ["reader", "creator", "moderator"],
  category: "layout",
  label: "Layout slots",
  description:
    "Rearrange page chrome (left nav, right rail, subreddit header) via CSS recipes.",
  apply(ctx) {
    if (!ctx.settings.flags.layoutSlots || ctx.settings.paused) {
      clearLayoutSlotMarks();
      document.documentElement.classList.remove(
        "readit-layout-edit",
        "readit-layout-degraded",
      );
      return;
    }
    const resolved = stampLayoutSlots();
    const health = layoutSlotsHealth(resolved);
    document.documentElement.dataset.readitLayout =
      ctx.settings.layoutSlots.preset;
    document.documentElement.classList.toggle(
      "readit-layout-edit",
      ctx.settings.layoutSlots.editMode,
    );
    document.documentElement.classList.toggle(
      "readit-layout-degraded",
      health === "degraded" || health === "broken",
    );
  },
  teardown() {
    clearLayoutSlotMarks();
    delete document.documentElement.dataset.readitLayout;
    document.documentElement.classList.remove(
      "readit-layout-edit",
      "readit-layout-degraded",
    );
  },
  health: () => layoutSlotsHealth(resolveSlots()),
};
