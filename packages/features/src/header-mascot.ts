import { resolveProfileIcon } from "@readit/schema";
import type { FeatureModule } from "./utils.js";

const MASCOT_ID = "readit-header-mascot";
const MASCOT_HEIGHT_PX = 44;
/** Breathing room above/below the mascot inside the grown header bar. */
const HEADER_PADDING_PX = 16;
const NATURAL_HEIGHT_ATTR = "data-readit-natural-height";

/** Reddit's own header logo — stable id, with a couple of DOM-shape fallbacks
 * in case Reddit renames it (mirrors the defensive style used for LAYOUT_SLOTS). */
function findRedditLogoAnchor(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>("#reddit-logo") ??
    document.querySelector<HTMLElement>(
      [
        "reddit-header-large a[aria-label='Home']",
        "reddit-header a[aria-label='Home']",
        "header[role='banner'] a[aria-label='Home']",
      ].join(", "),
    )
  );
}

/**
 * Reddit's header bar has a fixed `height` (not just min-height), so a mascot
 * taller than that bleeds above/below it instead of growing it. Force the
 * bar to at least fit the mascot plus padding, remembering each element's
 * original height (once) so we never shrink it below Reddit's own default.
 */
function growHeaderToFit(anchor: HTMLElement): void {
  const target = MASCOT_HEIGHT_PX + HEADER_PADDING_PX;
  for (const el of [anchor.closest("nav"), anchor.closest("header")]) {
    if (!(el instanceof HTMLElement)) continue;
    const naturalAttr = el.getAttribute(NATURAL_HEIGHT_ATTR);
    const natural = naturalAttr
      ? Number(naturalAttr)
      : el.getBoundingClientRect().height;
    if (!naturalAttr) el.setAttribute(NATURAL_HEIGHT_ATTR, String(natural));
    el.style.setProperty("height", `${Math.max(natural, target)}px`, "important");
  }
}

function restoreHeaderHeight(): void {
  document.querySelectorAll<HTMLElement>(`[${NATURAL_HEIGHT_ATTR}]`).forEach((el) => {
    el.style.removeProperty("height");
    el.removeAttribute(NATURAL_HEIGHT_ATTR);
  });
}

export const headerMascotFeature: FeatureModule = {
  id: "headerMascot",
  tier: "simple",
  audience: ["reader", "creator", "moderator"],
  category: "style",
  label: "Header mascot",
  description:
    "Show the active profile's readit mascot next to Reddit's own header logo.",
  apply(ctx) {
    if (!ctx.settings.flags.headerMascot || !ctx.mascotUrl) {
      document.getElementById(MASCOT_ID)?.remove();
      restoreHeaderHeight();
      return;
    }
    const profile = ctx.settings.profiles.find(
      (p) => p.id === ctx.settings.activeProfileId,
    );
    const icon = profile && resolveProfileIcon(profile, ctx.settings);
    if (!icon) {
      document.getElementById(MASCOT_ID)?.remove();
      restoreHeaderHeight();
      return;
    }
    const anchor = findRedditLogoAnchor();
    if (!anchor) return; // header not mounted yet — next scan retries

    let img = document.getElementById(MASCOT_ID) as HTMLImageElement | null;
    if (!img || img.previousElementSibling !== anchor) {
      img?.remove();
      img = document.createElement("img");
      img.id = MASCOT_ID;
      img.alt = "readit";
      img.style.height = `${MASCOT_HEIGHT_PX}px`;
      img.style.width = "auto";
      img.style.marginInlineStart = "6px";
      img.style.verticalAlign = "middle";
      img.style.pointerEvents = "none";
      anchor.insertAdjacentElement("afterend", img);
    }
    const url = ctx.mascotUrl(icon);
    if (img.src !== url) img.src = url;
    growHeaderToFit(anchor);
  },
  teardown() {
    document.getElementById(MASCOT_ID)?.remove();
    restoreHeaderHeight();
  },
  health: () => "ok",
};
