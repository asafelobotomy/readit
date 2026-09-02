import { applyStylesheet } from "@readit/css-engine";
import type { ReaditSettings } from "@readit/schema";
import { loadSettings, watchSettings } from "../lib/settings";

/**
 * Early inject — apply CSS tokens before paint to reduce FOUC.
 */
export default defineContentScript({
  matches: ["*://*.reddit.com/*"],
  runAt: "document_start",
  async main() {
    let settings = await loadSettings();
    const apply = (next: ReaditSettings) => {
      settings = next;
      if (document.documentElement) {
        applyStylesheet(settings);
      }
    };
    apply(settings);
    watchSettings(apply);
  },
});
