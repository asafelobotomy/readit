import {
  appendCqsRiskEvent,
  appendCqsSnapshot,
  createFeatureRuntime,
  currentSubreddit,
  syncSidebarsHide,
} from "@readit/features";
import type {
  CqsRiskEvent,
  CqsSnapshot,
  LayoutColumnPanel,
  LayoutPreset,
  ReaditSettings,
} from "@readit/schema";
import {
  applyLayoutPreset,
  normalizeColumnOrder,
  placementsFromColumnOrder,
} from "@readit/schema";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { loadSettings, mutateSettings, watchSettings } from "../lib/settings";
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
    const runtime = createFeatureRuntime({
      mascotUrl: (icon) => browser.runtime.getURL(`/mascots/${icon}.png`),
    });
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

    ctx.addEventListener(window, "readit:layout-widths", (ev) => {
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
      if (!detail) return;
      void mutateSettings((current) => ({
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
              detail.columnGapPx ?? current.layoutSlots.widths.columnGapPx ?? 12,
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
      })).then(reapply);
    });

    ctx.addEventListener(window, "readit:layout-order", (ev) => {
      const detail = (
        ev as CustomEvent<{ columnOrder?: LayoutColumnPanel[] }>
      ).detail;
      if (!detail?.columnOrder?.length) return;
      void mutateSettings((current) => {
        const columnOrder = normalizeColumnOrder(detail.columnOrder!);
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
    });

    ctx.addEventListener(window, "readit:layout-pads", (ev) => {
      const detail = (
        ev as CustomEvent<{
          pagePadLeftPx?: number;
          pagePadRightPx?: number;
        }>
      ).detail;
      if (!detail) return;
      void mutateSettings((current) => ({
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
      })).then(reapply);
    });

    ctx.addEventListener(window, "readit:layout-separators", (ev) => {
      const detail = (
        ev as CustomEvent<{
          separators?: ReaditSettings["layoutSlots"]["separators"];
        }>
      ).detail;
      if (!detail?.separators) return;
      void mutateSettings((current) => ({
        ...current,
        layoutSlots: {
          ...current.layoutSlots,
          preset: "custom",
          separators: detail.separators!.slice(0, 3),
        },
      })).then(reapply);
    });

    ctx.addEventListener(window, "readit:layout-width-locks", (ev) => {
      const detail = (
        ev as CustomEvent<{
          widthLocks?: Record<string, boolean>;
        }>
      ).detail;
      if (!detail?.widthLocks) return;
      void mutateSettings((current) => ({
        ...current,
        layoutSlots: {
          ...current.layoutSlots,
          widthLocks: detail.widthLocks!,
        },
      })).then(reapply);
    });

    ctx.addEventListener(window, "readit:layout-preset", (ev) => {
      const detail = (ev as CustomEvent<{ preset?: LayoutPreset }>).detail;
      const preset = detail?.preset;
      if (!preset) return;
      void mutateSettings((current) => {
        let next: ReaditSettings = {
          ...current,
          flags: { ...current.flags, layoutSlots: true },
          layoutSlots: applyLayoutPreset(current.layoutSlots, preset),
        };
        if (preset === "singleColumn") {
          next = syncSidebarsHide(next, true);
        } else if (
          current.layoutSlots.preset === "singleColumn" ||
          current.knobs.hide.sidebars
        ) {
          next = syncSidebarsHide(next, false);
        }
        return next;
      }).then(reapply);
    });

    ctx.addEventListener(window, "readit:cqs-persist", (ev) => {
      const detail = (ev as CustomEvent<CqsPersistDetail>).detail;
      if (!detail || detail.type === "submit_stamps") return;
      void mutateSettings((current) => {
        if (detail.type === "snapshot") {
          return appendCqsSnapshot(current, detail.snapshot);
        }
        if (detail.type === "risk") {
          return appendCqsRiskEvent(current, detail.event);
        }
        return current;
      }).then(reapply);
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
        window.dispatchEvent(new CustomEvent("readit:open-studio"));
      }
      if (msg?.type === "readit:settings-changed") {
        window.dispatchEvent(new CustomEvent("readit:settings-updated"));
      }
    });
  },
});
