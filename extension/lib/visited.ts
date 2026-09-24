import { mergeVisited, type VisitedPostsStore } from "@readit/features";
import { storage } from "wxt/utils/storage";

const KEY = "local:readitVisitedPosts";
/** Where older builds kept it: reddit.com's own localStorage, readable by page scripts. */
const LEGACY_PAGE_KEY = "readit.visitedPosts";
const FLUSH_DELAY_MS = 400;

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Mark-read history in chrome.storage.local. Moves any legacy copy out of the
 * page's localStorage on first load, and debounces writes; each flush merges
 * with what other tabs stored so concurrent tabs don't drop each other's history.
 */
export async function loadVisitedPosts(): Promise<VisitedPostsStore> {
  let initial = strings(await storage.getItem<string[]>(KEY));

  try {
    const legacy = localStorage.getItem(LEGACY_PAGE_KEY);
    if (legacy !== null) {
      let parsed: unknown = [];
      try {
        parsed = JSON.parse(legacy);
      } catch {
        /* corrupt legacy value — just remove it */
      }
      initial = mergeVisited(strings(parsed), initial);
      await storage.setItem(KEY, initial);
      localStorage.removeItem(LEGACY_PAGE_KEY);
    }
  } catch {
    /* localStorage can throw (blocked site data) — nothing to migrate */
  }

  let pending: string[] | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = async () => {
    const keys = pending;
    pending = null;
    if (!keys) return;
    const stored = strings(await storage.getItem<string[]>(KEY));
    await storage.setItem(KEY, mergeVisited(stored, keys));
  };

  return {
    initial,
    save(keys) {
      pending = keys;
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), FLUSH_DELAY_MS);
    },
  };
}
