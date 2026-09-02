import {
  appendCqsRiskEvent,
  appendCqsSnapshot,
  createFeatureRuntime,
  currentSubreddit,
} from "@readit/features";
import type {
  CqsRiskEvent,
  CqsSnapshot,
  LayoutColumnPanel,
  ReaditSettings,
} from "@readit/schema";
import {
  normalizeColumnOrder,
  placementsFromColumnOrder,
} from "@readit/schema";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { loadSettings, saveSettings, watchSettings } from "../lib/settings";
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

function isReaditMutation(mutations: MutationRecord[]): boolean {
  const isOurs = (node: Node | null): boolean => {
    if (!node) return false;
    if (node instanceof Element) {
      if (node.id === "readit-css-engine" || node.id === "readit-root") return true;
      if (node.id === "readit-cqs-banner") return true;
      if (node.id === "readit-col-resize-host") return true;
      if (node.tagName?.toLowerCase() === "readit-studio") return true;
      if (node.classList?.contains("readit-mod-bar")) return true;
      if (node.classList?.contains("readit-user-tag")) return true;
      if (node.classList?.contains("readit-abs-time")) return true;
      if (node.classList?.contains("readit-cqs-banner")) return true;
      if (node.classList?.contains("readit-col-resize")) return true;
      if (node.classList?.contains("readit-pad-resize")) return true;
      if (node.classList?.contains("readit-layout-frame")) return true;
      if (node.classList?.contains("readit-frame-label")) return true;
      if (node.classList?.contains("readit-drop-line")) return true;
      if (node.getAttributeNames?.().some((n) => n.startsWith("data-readit-"))) {
        return true;
      }
      return Boolean(
        node.closest?.("readit-studio, #readit-root, #readit-cqs-banner"),
      );
    }
    return isOurs(node.parentElement);
  };
  return mutations.every((m) => isOurs(m.target));
}

type CqsPersistDetail =
  | { type: "snapshot"; snapshot: CqsSnapshot }
  | { type: "risk"; event: CqsRiskEvent }
  | { type: "submit_stamps"; stamps: number[] };

export default defineContentScript({
  matches: ["*://*.reddit.com/*"],
  cssInjectionMode: "ui",
  async main(ctx) {
    const runtime = createFeatureRuntime();
    let settings = await loadSettings();
    runtime.applyAll(withSubOverride(settings));

    const reapply = (next: ReaditSettings) => {
      settings = next;
      runtime.applyAll(withSubOverride(next));
      window.dispatchEvent(
        new CustomEvent("readit:settings-updated", { detail: next }),
      );
    };

    watchSettings(reapply);

    let persistBusy = false;
    ctx.addEventListener(window, "readit:layout-widths", (ev) => {
      void (async () => {
          const detail = (
          ev as CustomEvent<{
            leftNavPx?: number;
            rightRailPx?: number;
            feedWidthPx?: number;
            pagePadLeftPx?: number;
            pagePadRightPx?: number;
            columnGapPx?: number;
          }>
        ).detail;
        if (!detail || persistBusy) return;
        persistBusy = true;
        try {
          const current = await loadSettings();
          const next = await saveSettings({
            ...current,
            layoutSlots: {
              ...current.layoutSlots,
              widths: {
                ...current.layoutSlots.widths,
                leftNavPx:
                  detail.leftNavPx ?? current.layoutSlots.widths.leftNavPx,
                rightRailPx:
                  detail.rightRailPx ?? current.layoutSlots.widths.rightRailPx,
                pagePadLeftPx:
                  detail.pagePadLeftPx ??
                  current.layoutSlots.widths.pagePadLeftPx ??
                  24,
                pagePadRightPx:
                  detail.pagePadRightPx ??
                  current.layoutSlots.widths.pagePadRightPx ??
                  24,
                columnGapPx:
                  detail.columnGapPx ??
                  current.layoutSlots.widths.columnGapPx ??
                  12,
              },
            },
            knobs: {
              ...current.knobs,
              tokens: {
                ...current.knobs.tokens,
                feedWidthPx:
                  detail.feedWidthPx ?? current.knobs.tokens.feedWidthPx,
              },
            },
          });
          reapply(next);
        } finally {
          persistBusy = false;
        }
      })();
    });

    ctx.addEventListener(window, "readit:layout-order", (ev) => {
      void (async () => {
        const detail = (
          ev as CustomEvent<{ columnOrder?: LayoutColumnPanel[] }>
        ).detail;
        if (!detail?.columnOrder?.length || persistBusy) return;
        persistBusy = true;
        try {
          const current = await loadSettings();
          const columnOrder = normalizeColumnOrder(detail.columnOrder);
          const next = await saveSettings({
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
          });
          reapply(next);
        } finally {
          persistBusy = false;
        }
      })();
    });

    ctx.addEventListener(window, "readit:layout-pads", (ev) => {
      void (async () => {
        const detail = (
          ev as CustomEvent<{
            pagePadLeftPx?: number;
            pagePadRightPx?: number;
          }>
        ).detail;
        if (!detail || persistBusy) return;
        persistBusy = true;
        try {
          const current = await loadSettings();
          const next = await saveSettings({
            ...current,
            layoutSlots: {
              ...current.layoutSlots,
              widths: {
                ...current.layoutSlots.widths,
                pagePadLeftPx:
                  detail.pagePadLeftPx ??
                  current.layoutSlots.widths.pagePadLeftPx ??
                  24,
                pagePadRightPx:
                  detail.pagePadRightPx ??
                  current.layoutSlots.widths.pagePadRightPx ??
                  24,
              },
            },
          });
          reapply(next);
        } finally {
          persistBusy = false;
        }
      })();
    });

    ctx.addEventListener(window, "readit:cqs-persist", (ev) => {
      void (async () => {
        const detail = (ev as CustomEvent<CqsPersistDetail>).detail;
        if (!detail || persistBusy) return;
        if (detail.type === "submit_stamps") return;
        persistBusy = true;
        try {
          const current = await loadSettings();
          let next = current;
          if (detail.type === "snapshot") {
            next = appendCqsSnapshot(current, detail.snapshot);
          } else if (detail.type === "risk") {
            next = appendCqsRiskEvent(current, detail.event);
          }
          if (next !== current) {
            next = await saveSettings(next);
            reapply(next);
          }
        } finally {
          persistBusy = false;
        }
      })();
    });

    ctx.addEventListener(window, "wxt:locationchange", () => {
      runtime.applyAll(withSubOverride(settings));
    });

    let timer: number | undefined;
    const observer = new MutationObserver((mutations) => {
      if (isReaditMutation(mutations)) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        runtime.scanDom(withSubOverride(settings));
      }, 300);
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
        window.dispatchEvent(new CustomEvent("readit:open-studio"));
      }
      if (msg?.type === "readit:settings-changed") {
        window.dispatchEvent(new CustomEvent("readit:settings-updated"));
      }
    });
  },
});
