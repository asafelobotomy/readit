import type { FeatureModule } from "./utils.js";

function isHomePath(pathname: string): boolean {
  return pathname === "/" || pathname === "";
}

function findFeedTab(label: RegExp): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(
    'button, a, [role="tab"], faceplate-tab',
  );
  for (const el of candidates) {
    const text = (el.textContent || "").trim();
    if (label.test(text)) return el;
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
 * Prefer Home → Following over For You when the experiment tabs are present.
 */
export function switchHomeToFollowing(): "ok" | "degraded" | "broken" {
  if (!isHomePath(location.pathname)) return "degraded";

  const following = findFeedTab(/^Following$/i);
  const forYou = findFeedTab(/^For You$/i);
  if (!following && !forYou) return "broken";
  if (!following) return "degraded";
  if (isTabActive(following)) return "ok";
  try {
    following.click();
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
