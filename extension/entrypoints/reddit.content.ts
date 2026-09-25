import {
  appendCqsRiskEvent,
  appendCqsSnapshot,
  createFeatureRuntime,
  emitReadit,
  isReaditMutation,
  onReadit,
  rememberCommentSort,
} from "@readit/features";
import type { ReaditSettings } from "@readit/schema";
import {
  COMMENT_SORT_MEMORY_MAX,
  normalizeColumnOrder,
  placementsFromColumnOrder,
} from "@readit/schema";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { loadSettings, mutateSettings, watchSettings } from "../lib/settings";
import { markMainScriptActive, withSubOverride } from "../lib/overrides";
import { loadVisitedPosts } from "../lib/visited";
import { mountStudio } from "../studio/mount";
import "../studio/studio.css";

export default defineContentScript({
  matches: ["*://*.reddit.com/*"],
  // New Reddit only: Old Reddit has none of the DOM these scripts target.
  excludeMatches: ["*://old.reddit.com/*"],
  cssInjectionMode: "ui",
  async main(ctx) {
    const runtime = createFeatureRuntime({
      mascotUrl: (icon) => browser.runtime.getURL(`/mascots/${icon}.png`),
      visitedPosts: await loadVisitedPosts(),
    });
    let settings = await loadSettings();
    // From here this script owns the stylesheet; early.content stops re-applying.
    markMainScriptActive();
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
    // No `.then(reapply)`: the storage watcher above already re-applies each
    // write once (it used to run the full apply twice per write).
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
        }));
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
        });
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
        }));
      }),

      onReadit("layout-separators", (detail) => {
        void mutateSettings((current) => ({
          ...current,
          layoutSlots: {
            ...current.layoutSlots,
            preset: "custom",
            separators: detail.separators.slice(0, 3),
          },
        }));
      }),

      onReadit("layout-width-locks", (detail) => {
        void mutateSettings((current) => ({
          ...current,
          layoutSlots: {
            ...current.layoutSlots,
            widthLocks: detail.widthLocks,
          },
        }));
      }),

      onReadit("comment-sort-picked", (detail) => {
        const prefs = settings.commentSortPrefs;
        if (prefs.mode !== "remember") return;
        const remembered = rememberCommentSort(
          prefs.remembered,
          detail.subreddit,
          detail.sort,
          COMMENT_SORT_MEMORY_MAX,
        );
        if (remembered === prefs.remembered) return;
        void mutateSettings((current) => ({
          ...current,
          commentSortPrefs: {
            ...current.commentSortPrefs,
            remembered: rememberCommentSort(
              current.commentSortPrefs.remembered,
              detail.subreddit,
              detail.sort,
              COMMENT_SORT_MEMORY_MAX,
            ),
          },
        }));
      }),

      onReadit("cqs-persist", (detail) => {
        if (detail.type === "submit_stamps") return;
        void mutateSettings((current) =>
          detail.type === "snapshot"
            ? appendCqsSnapshot(current, detail.snapshot)
            : appendCqsRiskEvent(current, detail.event),
        );
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

    // Debounced, but never postponed past SCAN_MAX_WAIT_MS: Home's feed
    // (video players, lazy cards) mutates without pause, and a plain
    // trailing debounce left new cards unstyled for seconds.
    const SCAN_DEBOUNCE_MS = 180;
    const SCAN_MAX_WAIT_MS = 600;
    let timer: number | undefined;
    let pendingSince = 0;
    const observer = new MutationObserver((mutations) => {
      if (isReaditMutation(mutations)) return;
      const now = performance.now();
      if (!pendingSince) pendingSince = now;
      window.clearTimeout(timer);
      const wait = Math.min(SCAN_DEBOUNCE_MS, Math.max(0, pendingSince + SCAN_MAX_WAIT_MS - now));
      timer = window.setTimeout(() => {
        pendingSince = 0;
        runtime.scanDom(withSubOverride(settings));
      }, wait);
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
