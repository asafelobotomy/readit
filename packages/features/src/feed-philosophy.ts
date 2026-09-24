import type { FeatureModule } from "./utils.js";

function isHomePath(pathname: string): boolean {
  return pathname === "/" || pathname === "";
}

/** Places a "Following" control is a follow toggle or a profile link, not the feed tab. */
const NOT_FEED_TAB_SELECTOR =
  "shreddit-post, shreddit-comment, faceplate-hovercard, [role='dialog'], #right-sidebar-container, aside";
const TAB_CONTAINER_SELECTOR =
  "[role='tablist'], faceplate-tabgroup, faceplate-tab-group, nav";

type TabCandidate = Pick<Element, "tagName" | "getAttribute" | "closest">;

/**
 * Whether a control can be the Home feed tab. A plain `<button>` labelled
 * "Following" is usually a follow toggle (clicking it unfollows), so buttons
 * only count inside a tab list; links and real tabs count anywhere outside
 * posts, comments, hovercards, dialogs and the sidebar.
 */
export function isFeedTabCandidate(el: TabCandidate): boolean {
  if (el.closest(NOT_FEED_TAB_SELECTOR)) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "faceplate-tab" || el.getAttribute("role") === "tab") return true;
  if (tag === "a") return el.getAttribute("href") !== null;
  if (tag === "button") return Boolean(el.closest(TAB_CONTAINER_SELECTOR));
  return false;
}

function findFeedTab(label: RegExp): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(
    'button, a, [role="tab"], faceplate-tab',
  );
  for (const el of candidates) {
    const text = (el.textContent || "").trim();
    if (label.test(text) && isFeedTabCandidate(el)) return el;
  }
  return null;
}

function isTabActive(el: HTMLElement): boolean {
  if (el.getAttribute("aria-selected") === "true") return true;
  if (el.getAttribute("aria-current") === "page") return true;
  if (el.classList.contains("active")) return true;
  const pressed = el.getAttribute("aria-pressed");
  if (pressed === "true") return true;
  return false;
}

/**
 * Tracks the Home URL we've already auto-switched once, so a manual switch
 * back to For You isn't fought on every debounced DOM-mutation rescan.
 */
let autoSwitchedHref: string | null = null;

/**
 * Prefer Home → Following over For You when the experiment tabs are present.
 * Only forces the switch once per Home visit — after that, a user who
 * deliberately picks For You is left alone until they navigate away and back.
 */
export function switchHomeToFollowing(): "ok" | "degraded" | "broken" {
  if (!isHomePath(location.pathname)) {
    autoSwitchedHref = null;
    return "degraded";
  }

  const following = findFeedTab(/^Following$/i);
  const forYou = findFeedTab(/^For You$/i);
  if (!following && !forYou) return "broken";
  if (!following) return "degraded";
  if (isTabActive(following) || autoSwitchedHref === location.href) {
    autoSwitchedHref = location.href;
    return "ok";
  }
  try {
    following.click();
    autoSwitchedHref = location.href;
    return "ok";
  } catch {
    return "broken";
  }
}

export const followingFeedFeature: FeatureModule = {
  id: "followingFeed",
  tier: "simple",
  audience: ["reader", "creator"],
  category: "feed",
  label: "Following feed default",
  description: "On Home, prefer the Following tab over For You.",
  apply(ctx) {
    if (!ctx.settings.flags.followingFeed) return;
    if (!ctx.settings.feedPrefs.followingDefault) return;
    const status = switchHomeToFollowing();
    document.documentElement.dataset.readitFollowing = status;
  },
  teardown() {
    delete document.documentElement.dataset.readitFollowing;
  },
  health() {
    const v = document.documentElement.dataset.readitFollowing;
    if (v === "ok" || v === "degraded" || v === "broken") return v;
    return "degraded";
  },
};

export const lurkerModeFeature: FeatureModule = {
  id: "lurkerMode",
  tier: "simple",
  audience: ["reader"],
  category: "feed",
  label: "Lurker mode",
  description: "Disable vote taps on posts and comments (CSS).",
  apply(ctx) {
    document.documentElement.classList.toggle(
      "readit-lurker",
      Boolean(ctx.settings.flags.lurkerMode),
    );
  },
  teardown() {
    document.documentElement.classList.remove("readit-lurker");
  },
  health: () => "ok",
};
