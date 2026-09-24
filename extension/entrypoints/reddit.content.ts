import {
  appendCqsRiskEvent,
  appendCqsSnapshot,
  createFeatureRuntime,
  currentSubreddit,
  emitReadit,
  isReaditMutation,
  onReadit,
} from "@readit/features";
import type { ReaditSettings } from "@readit/schema";
import {
  normalizeColumnOrder,
  placementsFromColumnOrder,
} from "@readit/schema";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { loadSettings, mutateSettings, watchSettings } from "../lib/settings";
import { loadVisitedPosts } from "../lib/visited";
import { mountStudio } from "../studio/mount";
import "../studio/studio.css";

function withSubOverride(settings: ReaditSettings): ReaditSettings {
  const sub = currentSubreddit(location.pathname);
  if (!sub) return settings;
  const override = settings.subredditOverrides.find(
    (o) => o.subreddit.toLowerCase() === sub.toLowerCase(),
  );
  if (!override) return settings;
  return {
    ...settings,
    knobs: {
      ...settings.knobs,
      tokens: { ...settings.knobs.tokens, ...override.tokens },
      hide: { ...settings.knobs.hide, ...override.hide },
      mediaMode: override.mediaMode ?? settings.knobs.mediaMode,
    },
  };
}

export default defineContentScript({
  matches: ["*://*.reddit.com/*"],
  cssInjectionMode: "ui",
  async main(ctx) {
    const runtime = createFeatureRuntime({
      mascotUrl: (icon) => browser.runtime.getURL(`/mascots/${icon}.png`),
      visitedPosts: await loadVisitedPosts(),
    });
    let settings = await loadSettings();
    runtime.applyAll(withSubOverride(settings));

    const reapply = (next: ReaditSettings) => {
      settings = next;
      runtime.applyAll(withSubOverride(next));
      // Internal bus only — a window event would hand the full settings
      // (usernotes, tags, filters) to reddit.com's own scripts.
      emitReadit("settings-updated", next);
    };

    watchSettings(reapply);

    // Persist requests from the layout editor / CQS tracker. These arrive on
    // the extension-private bus, never on `window`, so page scripts cannot
    // forge storage writes; saveSettings() re-validates every write anyway.
    const unsubscribers = [
      onReadit("layout-widths", (detail) => {
        void mutateSettings((current) => ({
          ...current,
          layoutSlots: {
            ...current.layoutSlots,
            widths: {
              ...current.layoutSlots.widths,
              leftNavPx: detail.leftNavPx,
              rightRailPx: detail.rightRailPx,
              pagePadLeftPx: detail.pagePadLeftPx,
              pagePadRightPx: detail.pagePadRightPx,
              columnGapPx:
                detail.columnGapPx ?? current.layoutSlots.widths.columnGapPx ?? 12,
            },
          },
          knobs: {
            ...current.knobs,
            tokens: {
              ...current.knobs.tokens,
              feedWidthPx: detail.feedWidthPx,
            },
          },
        })).then(reapply);
      }),

      onReadit("layout-order", (detail) => {
        if (!detail.columnOrder.length) return;
        void mutateSettings((current) => {
          const columnOrder = normalizeColumnOrder(detail.columnOrder);
          return {
            ...current,
            flags: { ...current.flags, layoutSlots: true },
            layoutSlots: {
              ...current.layoutSlots,
              preset: "custom",
              columnOrder,
              placements: placementsFromColumnOrder(
                columnOrder,
                current.layoutSlots.placements,
              ),
            },
          };
        }).then(reapply);
      }),

      onReadit("layout-pads", (detail) => {
        void mutateSettings((current) => ({
          ...current,
          layoutSlots: {
            ...current.layoutSlots,
            widths: {
              ...current.layoutSlots.widths,
              pagePadLeftPx: detail.pagePadLeftPx,
              pagePadRightPx: detail.pagePadRightPx,
            },
          },
        })).then(reapply);
      }),

      onReadit("layout-separators", (detail) => {
        void mutateSettings((current) => ({
          ...current,
          layoutSlots: {
            ...current.layoutSlots,
            preset: "custom",
            separators: detail.separators.slice(0, 3),
          },
        })).then(reapply);
      }),

      onReadit("layout-width-locks", (detail) => {
        void mutateSettings((current) => ({
          ...current,
          layoutSlots: {
            ...current.layoutSlots,
            widthLocks: detail.widthLocks,
          },
        })).then(reapply);
      }),

      onReadit("cqs-persist", (detail) => {
        if (detail.type === "submit_stamps") return;
        void mutateSettings((current) =>
          detail.type === "snapshot"
            ? appendCqsSnapshot(current, detail.snapshot)
            : appendCqsRiskEvent(current, detail.event),
        ).then(reapply);
      }),
    ];
    ctx.onInvalidated(() => {
      for (const off of unsubscribers) off();
    });

    ctx.addEventListener(window, "wxt:locationchange", () => {
      const next = withSubOverride(settings);
      runtime.applyAll(next);
      // Reddit replaces shell/nav asynchronously — follow-up scans remount rail.
      window.setTimeout(() => runtime.scanDom(withSubOverride(settings)), 80);
      window.setTimeout(() => runtime.scanDom(withSubOverride(settings)), 350);
      window.setTimeout(() => runtime.scanDom(withSubOverride(settings)), 1200);
    });

    let timer: number | undefined;
    const observer = new MutationObserver((mutations) => {
      if (isReaditMutation(mutations)) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        runtime.scanDom(withSubOverride(settings));
      }, 180);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    const ui = await createShadowRootUi(ctx, {
      name: "readit-studio",
      position: "overlay",
      zIndex: 2147483646,
      onMount(container) {
        const host = document.createElement("div");
        host.id = "readit-root";
        container.append(host);
        return mountStudio(host, {
          getSettings: () => ({
            ...settings,
            toolboxDetected: runtime.getToolboxDetected(),
          }),
          getHealth: () => runtime.getHealth(),
        });
      },
      onRemove(api) {
        api?.unmount();
      },
    });

    ui.mount();

    browser.runtime.onMessage.addListener((msg) => {
      if (msg?.type === "readit:open-studio") {
        emitReadit("open-studio");
      }
      if (msg?.type === "readit:settings-changed") {
        emitReadit("settings-updated");
      }
    });
  },
});
