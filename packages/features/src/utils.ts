import type { FeatureFlags, FeatureHealth, ReaditSettings } from "@readit/schema";

export type FeatureContext = {
  settings: ReaditSettings;
  /** Current subreddit name without r/, if known */
  subreddit: string | null;
  /** Pathname for route-aware features */
  pathname: string;
};

export type FeatureModule = {
  id: keyof FeatureFlags | string;
  tier: "simple" | "advanced";
  audience: Array<"reader" | "creator" | "moderator">;
  category: string;
  label: string;
  description: string;
  apply: (ctx: FeatureContext) => void | Promise<void>;
  teardown: (ctx: FeatureContext) => void;
  health?: () => FeatureHealth;
};

const ATTR = "data-readit-feature";

export function markProcessed(el: Element, featureId: string): void {
  el.setAttribute(`${ATTR}-${featureId}`, "1");
}

export function isProcessed(el: Element, featureId: string): boolean {
  return el.getAttribute(`${ATTR}-${featureId}`) === "1";
}

export function clearMarks(featureId: string): void {
  document
    .querySelectorAll(`[${ATTR}-${featureId}]`)
    .forEach((el) => el.removeAttribute(`${ATTR}-${featureId}`));
}

export function currentSubreddit(pathname: string): string | null {
  const m = pathname.match(/^\/r\/([^/]+)/i);
  return m ? m[1] : null;
}

export function isModRoute(pathname: string): boolean {
  return (
    pathname.includes("/about/modqueue") ||
    pathname.includes("/about/reports") ||
    pathname.includes("/about/spam") ||
    pathname.includes("/mod/") ||
    pathname.startsWith("/mod") ||
    pathname.includes("/message/moderator")
  );
}

export function detectToolbox(): boolean {
  return Boolean(
    document.documentElement.dataset.tbActive ||
      document.querySelector("#tb-bottombar, .mod-toolbox, [id^='tb-']"),
  );
}

export function cleanRedditUrl(href: string): string {
  try {
    const url = new URL(href, location.origin);
    const strip = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "share_id",
      "ref",
      "ref_source",
      "context",
    ];
    for (const key of strip) url.searchParams.delete(key);
    return url.toString();
  } catch {
    return href;
  }
}

export function toReddIt(href: string): string | null {
  try {
    const url = new URL(href, location.origin);
    const m = url.pathname.match(/\/comments\/([a-z0-9]+)/i);
    if (m) return `https://redd.it/${m[1]}`;
    return null;
  } catch {
    return null;
  }
}
