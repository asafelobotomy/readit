import { applyStylesheet } from "@readit/css-engine";
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
    const settings = await loadSettings();
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
