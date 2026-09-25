import type { FeatureModule } from "./utils.js";

/**
 * Reddit layout quirks that live in shreddit-post's shadow DOM, where the
 * page stylesheet (css-engine's redditQuirkRules) can't reach.
 *
 * - Post page: the action bar's container has a 24px top margin on top of
 *   the title's (or media's) own spacing, leaving a ~40px gap before the
 *   vote/comment/share row. Feed cards don't have it.
 * - Action-bar pills have a fixed height plus 8px block padding, so scaled
 *   text overflows them. Without the padding the (flex, centered) label
 *   fits and the pill keeps Reddit's height.
 */
const STYLE_ATTR = "data-readit-reddit-fixes";

const SHADOW_CSS = `
:host([view-context="CommentsPage"]) rpl-action-bar > div.shreddit-post-container {
  margin-top: 8px !important;
}
.rpl-cab.h-xl {
  padding-block: 0 !important;
}`;

const styled = new WeakSet<ShadowRoot>();

export const redditFixesFeature: FeatureModule = {
  id: "redditFixes",
  tier: "simple",
  audience: ["reader", "creator", "moderator"],
  category: "style",
  label: "Reddit layout fixes",
  description:
    "Tightens the gap above the post page's action bar and keeps action buttons from clipping their labels.",
  apply() {
    for (const post of document.querySelectorAll("shreddit-post")) {
      const root = post.shadowRoot;
      if (!root || styled.has(root)) continue;
      styled.add(root);
      if (root.querySelector(`style[${STYLE_ATTR}]`)) continue;
      const style = document.createElement("style");
      style.setAttribute(STYLE_ATTR, "");
      style.textContent = SHADOW_CSS;
      root.append(style);
    }
  },
  teardown() {
    for (const post of document.querySelectorAll("shreddit-post")) {
      const root = post.shadowRoot;
      if (!root) continue;
      root.querySelector(`style[${STYLE_ATTR}]`)?.remove();
      styled.delete(root);
    }
  },
  health: () => "ok",
};
