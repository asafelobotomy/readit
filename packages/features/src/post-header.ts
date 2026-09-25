import type { FeatureModule } from "./utils.js";

/**
 * Split post header (feedPrefs.postHeader = "split"). Feed cards:
 *
 *   [ sub / author ]  [        title         ]  [ Join  ⋯  ]
 *   [              ]  [ emote • time (abs)   ]  [ Suggested ]
 *
 * and the post page:
 *
 *   [ avatar ] [ r/sub    ]  [        title         ]  [ ⋯ ]
 *   [        ] [ u/author ]  [    • time (abs)      ]
 *
 * Reddit renders these from three templates, named by SPLIT_ATTR's value:
 *
 * - "card": the title lives inside shreddit-post's shadow DOM (div.flex >
 *   div.flex-col > h2 > slot), which page CSS can't reach. The host becomes a
 *   grid (page CSS, see css-engine) and a small style in the card's shadow
 *   root unwraps the title's wrappers so the h2 is a grid item of the host.
 * - "grid": link posts with a thumbnail lay everything out in a light-DOM
 *   grid (credit row, then title block beside the thumbnail); page CSS alone
 *   re-templates it.
 * - "page": the post page. Its title is a light-DOM h1 slotted straight into
 *   the same shadow div.flex > div.flex-col, so unwrapping those makes the
 *   h1 itself a grid item that page CSS places.
 *
 * Everything keys off SPLIT_ATTR on the host, so removing the attribute
 * restores Reddit's layout even while the shadow style stays behind.
 */
export const SPLIT_ATTR = "data-readit-split-header";
type SplitKind = "card" | "grid" | "page";
const STYLE_ATTR = "data-readit-post-header";

/** Below this card width the three columns crowd the title — stay stacked. */
const MIN_SPLIT_WIDTH_PX = 560;

/** Shadow wrappers around the title; the h2 is what gets placed. */
const TITLE_HEADING = "h2.condensed-post-title-heading";

const HOST = `:host(:is([${SPLIT_ATTR}="card"], [${SPLIT_ATTR}="page"]))`;
const SHADOW_CSS = `
${HOST} > div.flex,
${HOST} > div.flex > div.flex-col {
  display: contents !important;
}
${HOST} > div,
${HOST} > rpl-action-bar > div,
${HOST} > div.flex > div:not(.flex-col),
${HOST} > div.flex > div.flex-col > :not(${TITLE_HEADING}) {
  grid-column: lead-start / end !important;
}
${HOST} ${TITLE_HEADING} {
  grid-column: mid-start / mid-end !important;
  grid-row: 1 !important;
  align-self: end !important;
  min-width: 0 !important;
  margin: 0 !important;
}
/* Post page: a link thumbnail stays beside the title. */
:host([${SPLIT_ATTR}="page"]) > div.flex > div:not(.flex-col) {
  grid-column: mid-end / ctl-start !important;
  grid-row: 1 / span 2 !important;
  align-self: start !important;
}`;

/** The shadow template that wraps the title in div.flex > div.flex-col. */
function hasShadowTitle(post: Element, title: string): boolean {
  // `:scope` matches nothing in a ShadowRoot query, so start from its children.
  const top = post.shadowRoot?.children ?? [];
  return Array.from(top).some(
    (el) =>
      el.matches("div.flex") &&
      el.querySelector(`:scope > div.flex-col > ${title}`),
  );
}

/** Which template a post uses, or null when the split CSS can't place it
 * (other views, cards Reddit hasn't rendered yet, unknown templates). */
function splitKind(post: Element): SplitKind | null {
  if (post.getAttribute("view-context") === "CommentsPage") {
    const ok =
      post.querySelector(':scope > [slot="credit-bar"] > span.flex > div.flex-col') &&
      post.querySelector(':scope > [slot="title"]') &&
      hasShadowTitle(post, 'slot[name="title"]');
    return ok ? "page" : null;
  }
  if (post.getAttribute("view-type") !== "cardView") return null;
  if (
    post.querySelector(':scope > div.grid > div > [slot="credit-bar"] > span.flex-wrap') &&
    post.querySelector(':scope > div.grid > div [slot="title"]')
  ) {
    return "grid";
  }
  if (!post.querySelector(':scope > [slot="credit-bar"] > span.flex-wrap')) {
    return null;
  }
  return hasShadowTitle(post, `${TITLE_HEADING} slot[name="title"]`) ? "card" : null;
}

function ensureShadowStyle(root: ShadowRoot): void {
  if (root.querySelector(`style[${STYLE_ATTR}]`)) return;
  const style = document.createElement("style");
  style.setAttribute(STYLE_ATTR, "");
  style.textContent = SHADOW_CSS;
  root.append(style);
}

let resize: ResizeObserver | null = null;
const observed = new Map<Element, SplitKind>();

function setSplit(post: Element, width: number): void {
  const kind = observed.get(post);
  if (kind && width >= MIN_SPLIT_WIDTH_PX) {
    if (post.getAttribute(SPLIT_ATTR) !== kind) post.setAttribute(SPLIT_ATTR, kind);
  } else if (post.hasAttribute(SPLIT_ATTR)) {
    post.removeAttribute(SPLIT_ATTR);
  }
}

function clearAll(): void {
  resize?.disconnect();
  resize = null;
  observed.clear();
  for (const post of document.querySelectorAll(`[${SPLIT_ATTR}]`)) {
    post.removeAttribute(SPLIT_ATTR);
  }
  for (const post of document.querySelectorAll("shreddit-post")) {
    post.shadowRoot?.querySelector(`style[${STYLE_ATTR}]`)?.remove();
  }
}

export const postHeaderFeature: FeatureModule = {
  id: "postHeader",
  tier: "simple",
  audience: ["reader", "creator", "moderator"],
  category: "style",
  label: "Split post header",
  description:
    "Feed cards and the post page show the subreddit left, the title with its time centered, and the controls right.",
  apply(ctx) {
    if (ctx.settings.feedPrefs.postHeader !== "split") {
      if (resize || document.querySelector(`[${SPLIT_ATTR}]`)) clearAll();
      return;
    }
    // Cards Reddit recycled or removed since the last scan.
    for (const post of observed.keys()) {
      if (!post.isConnected) {
        resize?.unobserve(post);
        observed.delete(post);
      }
    }
    resize ??= new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSplit(entry.target, entry.contentRect.width);
      }
    });
    for (const post of document.querySelectorAll("shreddit-post")) {
      if (observed.has(post)) continue;
      // Lazily rendered cards have no credit bar yet — a later scan picks
      // them up once Reddit fills them in.
      const kind = splitKind(post);
      if (!kind) continue;
      if (kind !== "grid") ensureShadowStyle(post.shadowRoot!);
      observed.set(post, kind);
      // The first callback lands before paint, so cards don't flash stacked.
      resize.observe(post);
    }
  },
  teardown() {
    clearAll();
  },
  health: () => "ok",
};
