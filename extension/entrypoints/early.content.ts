import { applyStylesheet } from "@readit/css-engine";
import {
  directLoadCommentSortUrl,
  POPOUT_NAV_KEYS_KEY,
  POPOUT_PUSHING_KEY,
  POPSTATE_EARLY_KEY,
  POPSTATE_GUARD_KEY,
} from "@readit/features";
import { loadSettings, watchSettings } from "../lib/settings";
import { isMainScriptActive, withSubOverride } from "../lib/overrides";

/**
 * Early inject — apply CSS tokens before paint to reduce FOUC.
 *
 * Only until the main content script starts: after that it owns the
 * stylesheet, and re-applying here too rebuilt it twice per settings change
 * (and without the subreddit override or Toolbox state).
 */
export default defineContentScript({
  matches: ["*://*.reddit.com/*"],
  // New Reddit only: Old Reddit has none of the DOM these scripts target.
  excludeMatches: ["*://old.reddit.com/*"],
  runAt: "document_start",
  async main() {
    // Registered before Reddit's own scripts run, so readit sees Back first:
    // when the post pop-out handles it, Reddit's router never does.
    const w = window as unknown as Record<string, unknown>;
    window.addEventListener(
      "popstate",
      (ev) => {
        const guard = w[POPSTATE_GUARD_KEY];
        if (typeof guard === "function" && guard()) ev.stopImmediatePropagation();
      },
      true,
    );
    // Reddit's router also intercepts Navigation API `navigate` events. Keep
    // it out of readit's own pop-out entries: its push/replace, and Back or
    // Forward onto/off such an entry (popstate above then does the work).
    type NavEvent = Event & {
      navigationType?: string;
      destination?: { key?: string };
    };
    const navigationApi = (window as unknown as {
      navigation?: EventTarget & { currentEntry?: { key?: string } | null };
    }).navigation;
    navigationApi?.addEventListener(
      "navigate",
      (ev) => {
        const e = ev as NavEvent;
        const keys = w[POPOUT_NAV_KEYS_KEY] as Set<string> | undefined;
        const ours =
          w[POPOUT_PUSHING_KEY] === true ||
          (e.navigationType === "traverse" &&
            !!keys &&
            (keys.has(navigationApi.currentEntry?.key ?? "") || keys.has(e.destination?.key ?? "")));
        if (ours) ev.stopImmediatePropagation();
      },
      true,
    );
    w[POPSTATE_EARLY_KEY] = true;

    const settings = await loadSettings();
    // Sticky comment sort for pages opened directly. Only on a fresh load:
    // a reload or Back should land where the user already was.
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    const sorted = directLoadCommentSortUrl(settings, location.href);
    if (sorted && (!nav || nav.type === "navigate")) {
      location.replace(sorted);
      return;
    }
    if (isMainScriptActive()) return;
    if (document.documentElement) applyStylesheet(withSubOverride(settings));
    const unwatch = watchSettings((next) => {
      if (isMainScriptActive()) {
        unwatch();
        return;
      }
      if (document.documentElement) applyStylesheet(withSubOverride(next));
    });
  },
});
