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
    if (!rules.length) return;

    const posts = document.querySelectorAll("shreddit-post, article, [data-testid='post-container']");
    posts.forEach((post) => {
      if (isProcessed(post, "filters")) return;
      const text = (post.textContent || "").toLowerCase();
      const author =
        post.getAttribute("author") ||
        post.querySelector('[href*="/user/"]')?.textContent ||
        "";
      const sub =
        post.getAttribute("subreddit-prefixed-name") ||
        post.getAttribute("subreddit-name") ||
        "";
      const link =
        post.querySelector("a[href]")?.getAttribute("href") || "";
      const flair =
        post.getAttribute("flair-text") ||
        post.querySelector('[data-testid="post-flair"], shreddit-post-flair, faceplate-tracker[noun="post_flair"]')
          ?.textContent ||
        "";
      const scoreRaw =
        post.getAttribute("score") ||
        post.querySelector('[score], faceplate-number')?.getAttribute("score") ||
        post.querySelector("[id*='vote-text']")?.textContent ||
        "";
      const score = Number(String(scoreRaw).replace(/[^\d.-]/g, ""));

      const hit = rules.some((rule) => {
        const p = rule.pattern.toLowerCase();
        switch (rule.kind) {
          case "keyword":
            return text.includes(p);
          case "user":
            return author.toLowerCase().includes(p.replace(/^u\//, ""));
          case "subreddit":
            return sub.toLowerCase().includes(p.replace(/^r\//, ""));
          case "url":
            return link.toLowerCase().includes(p);
          case "flair":
            return flair.toLowerCase().includes(p);
          case "karmaMax": {
            const max = Number(rule.pattern);
            if (!Number.isFinite(max) || !Number.isFinite(score)) return false;
            return score <= max;
          }
          default: {
            const _exhaustive: never = rule.kind;
            return _exhaustive;
          }
        }
      });

      if (hit) {
        (post as HTMLElement).style.display = "none";
        markProcessed(post, "filters");
      }
    });
  },
  teardown() {
    document.querySelectorAll("[data-readit-feature-filters]").forEach((el) => {
      (el as HTMLElement).style.display = "";
    });
    clearMarks("filters");
  },
  health: () =>
    document.querySelector("shreddit-post") ? "ok" : "degraded",
};
