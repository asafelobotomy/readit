import { normalizeSubredditName } from "@readit/schema";

/** Page limit for /subreddits/mine/moderator.json (100 per page). */
const MAX_PAGES = 10;

/**
 * Ask Reddit which subreddits the signed-in user moderates (same-origin
 * request with the user's session). Includes the user's profile subreddit
 * (`u_<name>`) when they moderate it. Results are only suggestions — the
 * Mod tab lets the user choose which to link.
 */
export async function detectModeratedSubreddits(): Promise<string[]> {
  const found: string[] = [];
  let after = "";
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL("/subreddits/mine/moderator.json", location.origin);
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);
    const res = await fetch(url, { credentials: "include" });
    if (res.status === 401 || res.status === 403) {
      throw new Error("Sign in to Reddit to detect your subreddits.");
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
