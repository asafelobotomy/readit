import type { FilterRule } from "@readit/schema";
import type { FeatureModule } from "./utils.js";
import { clearMarks, isProcessed, markProcessed } from "./utils.js";

/** CSS-first hide/resize are applied by css-engine; this module tracks health. */
export const hideNoiseFeature: FeatureModule = {
  id: "hideNoise",
  tier: "simple",
  audience: ["reader", "creator", "moderator"],
  category: "hide",
  label: "Hide noise",
  description: "Hide promoted, recommended, chrome noise, get-app, and premium upsells.",
  apply() {},
  teardown() {},
  health: () =>
    document.querySelector("shreddit-app, shreddit-feed") ? "ok" : "degraded",
};

export const resizeFeedFeature: FeatureModule = {
  id: "resizeFeed",
  tier: "simple",
  audience: ["reader", "creator", "moderator"],
  category: "layout",
  label: "Resize feed",
  description: "Constrain feed width and density via CSS tokens.",
  apply() {},
  teardown() {},
  health: () => "ok",
};

export const elementRulesFeature: FeatureModule = {
  id: "elementRules",
  tier: "advanced",
  audience: ["reader", "creator", "moderator"],
  category: "hide",
  label: "Element rules",
  description: "User-picked hide/dim selectors from the studio picker.",
  apply() {},
  teardown() {},
  health: () => "ok",
};

/**
 * Parse a Reddit vote count as rendered ("1,234", "1.2k", "3.4M", "-5").
 * Returns null when no number is present (e.g. "Vote", or no score element),
 * so a karma ceiling can't treat an unknown score as 0 and hide the post.
 */
export function parseRedditScore(raw: string | null | undefined): number | null {
  const m = String(raw ?? "")
    .replace(/,/g, "")
    .match(/(-?\d+(?:\.\d+)?)\s*([km])?/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2]?.toLowerCase();
  return Math.round(unit === "k" ? n * 1e3 : unit === "m" ? n * 1e6 : n);
}

export type FilterablePost = {
  text: string;
  author: string;
  subreddit: string;
  link: string;
  flair: string;
  score: number | null;
};

/** "u/Name", "/r/pics/", " Pics " → "name" / "pics". */
function bareName(raw: string, prefix: "u" | "r"): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(new RegExp(`^/?${prefix}/`), "")
    .replace(/\/+$/, "");
}

export function postMatchesRule(post: FilterablePost, rule: FilterRule): boolean {
  const p = rule.pattern.toLowerCase();
  switch (rule.kind) {
    case "keyword":
      return post.text.toLowerCase().includes(p);
    // Whole names: "bob" must not hide u/bobby, nor "pics" r/picsofdogs.
    case "user":
      return bareName(post.author, "u") === bareName(p, "u");
    case "subreddit":
      return bareName(post.subreddit, "r") === bareName(p, "r");
    case "url":
      return post.link.toLowerCase().includes(p);
    case "flair":
      return post.flair.toLowerCase().includes(p);
    case "karmaMax": {
      const max = Number(rule.pattern);
      if (!Number.isFinite(max) || post.score === null) return false;
      return post.score <= max;
    }
    default: {
      const _exhaustive: never = rule.kind;
      return _exhaustive;
    }
  }
}

function readPost(post: Element): FilterablePost {
  return {
    text: post.textContent || "",
    author:
      post.getAttribute("author") ||
      post.querySelector('[href*="/user/"]')?.textContent ||
      "",
    subreddit:
      post.getAttribute("subreddit-prefixed-name") ||
      post.getAttribute("subreddit-name") ||
      "",
    link: post.querySelector("a[href]")?.getAttribute("href") || "",
    flair:
      post.getAttribute("flair-text") ||
      post.querySelector('[data-testid="post-flair"], shreddit-post-flair, faceplate-tracker[noun="post_flair"]')
        ?.textContent ||
      "",
    score: parseRedditScore(
      post.getAttribute("score") ??
        post.querySelector("[score], faceplate-number")?.getAttribute("score") ??
        post.querySelector("[id*='vote-text']")?.textContent,
    ),
  };
}

/** Rule set the currently hidden posts were evaluated against. */
let appliedRulesKey: string | null = null;

function unhideFiltered(): void {
  document.querySelectorAll("[data-readit-feature-filters]").forEach((el) => {
    (el as HTMLElement).style.display = "";
  });
  clearMarks("filters");
}

export const filtersFeature: FeatureModule = {
  id: "filters",
  tier: "advanced",
  audience: ["reader", "creator", "moderator"],
  category: "filters",
  label: "Content filters",
  description: "Hide posts by keyword, user, subreddit, URL, flair, or karma ceiling.",
  apply(ctx) {
    if (!ctx.settings.flags.filters) return;
    const rules = ctx.settings.filters.filter((r) => r.enabled);
    // Editing, disabling or deleting a rule must bring back the posts it hid,
    // not just stop hiding new ones.
    const rulesKey = JSON.stringify(rules.map((r) => [r.kind, r.pattern]));
    if (rulesKey !== appliedRulesKey) {
      unhideFiltered();
      appliedRulesKey = rulesKey;
    }
    if (!rules.length) return;

    const posts = document.querySelectorAll("shreddit-post, article, [data-testid='post-container']");
    posts.forEach((post) => {
      if (isProcessed(post, "filters")) return;
      const data = readPost(post);
      if (rules.some((rule) => postMatchesRule(data, rule))) {
        (post as HTMLElement).style.display = "none";
        markProcessed(post, "filters");
      }
    });
  },
  teardown() {
    unhideFiltered();
    appliedRulesKey = null;
  },
  health: () =>
    document.querySelector("shreddit-post") ? "ok" : "degraded",
};
