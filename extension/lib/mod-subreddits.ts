import { normalizeSubredditName } from "@readit/schema";

/**
 * Page limit for /subreddits/mine/moderator.json (100 per page). Kept small
 * on purpose: this is the only request readit makes to Reddit's data
 * endpoints, and it must stay a modest, user-triggered lookup of the signed-in
 * user's own list (see README → Network access).
 */
const MAX_PAGES = 3;
/** Pause between pages so the lookup never bursts. */
const PAGE_DELAY_MS = 750;

/**
 * Ask Reddit which subreddits the signed-in user moderates (same-origin
 * request with the user's session). Only ever called from the Mod tab's
 * "Detect my subreddits" button, never automatically. Includes the user's
 * profile subreddit (`u_<name>`) when they moderate it. Results are only
 * suggestions — the Mod tab lets the user choose which to link.
 */
export async function detectModeratedSubreddits(): Promise<string[]> {
  const found: string[] = [];
  let after = "";
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
    const url = new URL("/subreddits/mine/moderator.json", location.origin);
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);
    const res = await fetch(url, { credentials: "include" });
    if (res.status === 401 || res.status === 403) {
      throw new Error("Sign in to Reddit to detect your subreddits.");
    }
    if (res.status === 429) {
      throw new Error("Reddit asked us to slow down. Try again in a few minutes.");
    }
    if (!res.ok) throw new Error(`Reddit returned ${res.status}.`);
    const json = (await res.json()) as {
      data?: {
        after?: string | null;
        children?: { data?: { display_name?: string } }[];
      };
    };
    for (const child of json.data?.children ?? []) {
      const name = normalizeSubredditName(child.data?.display_name ?? "");
      if (name) found.push(name);
    }
    after = json.data?.after ?? "";
    if (!after) break;
  }
  return [...new Set(found)];
}

/** `u_name` → `u/name`, otherwise `r/name`. */
export function displaySubredditName(name: string): string {
  return name.startsWith("u_") ? `u/${name.slice(2)}` : `r/${name}`;
}
