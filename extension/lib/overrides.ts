import { currentSubreddit } from "@readit/features";
import type { ReaditSettings } from "@readit/schema";

/** Settings with the current subreddit's override (width, hide, media) merged in. */
export function withSubOverride(
  settings: ReaditSettings,
  pathname: string = location.pathname,
): ReaditSettings {
  const sub = currentSubreddit(pathname);
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

/**
 * Set by the main content script once it owns styling. early.content and
 * reddit.content share this isolated world's `window`, which page scripts
 * cannot see.
 */
export const MAIN_SCRIPT_FLAG = "__readitMainActive";

export function markMainScriptActive(): void {
  (window as unknown as Record<string, boolean>)[MAIN_SCRIPT_FLAG] = true;
}

export function isMainScriptActive(): boolean {
  return Boolean((window as unknown as Record<string, boolean>)[MAIN_SCRIPT_FLAG]);
}
