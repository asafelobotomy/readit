import { panelContentAlign, type ContentAlign } from "@readit/schema";
import type { FeatureModule } from "./utils.js";

/**
 * Page CSS can't reach inside Reddit's web components, and some of them
 * truncate labels in their own shadow DOM (e.g. games-drawer items in the
 * left nav use Tailwind's `.truncate`). Inject a small wrap stylesheet into
 * open shadow roots — only within the nav and rail, never post/comment bodies.
 */
const STYLE_ATTR = "data-readit-text-wrap";
const WRAP_CSS = `
.truncate,
[class*="text-ellipsis"],
[class*="whitespace-nowrap"],
[class*="line-clamp"] {
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: clip !important;
  -webkit-line-clamp: unset !important;
  overflow-wrap: break-word !important;
}`;

const COMMUNITY_HOST = "left-nav-community-item";
const COMMUNITY_ROW = "a.flex.justify-between";
const COMMUNITY_GROUP = `${COMMUNITY_ROW} > span.flex.items-center.min-w-0`;
const COMMUNITY_AVATAR = `${COMMUNITY_GROUP} > :first-child`;
const COMMUNITY_TEXT = `${COMMUNITY_GROUP} > span.flex-col`;
const COMMUNITY_NAME = `${COMMUNITY_ROW} div.truncate`;
const COMMUNITY_STAR = `${COMMUNITY_ROW} > span.shrink-0`;

/** Width of the gap after the avatar and of the star column, in px. */
const AVATAR_GAP_PX = 8;
const STAR_COLUMN_PX = 32;

/**
 * Nav community rows (avatar + one-word "r/name" + star) have two layouts,
 * chosen for the whole nav at once (see syncCommunityRows):
 *
 * - inline: avatar left, name beside it, star right (float layout, so the
 *   name keeps the row width between avatar and star);
 * - stacked (data-readit-stack on the host): used for every row as soon as
 *   any name doesn't fit beside its avatar, and always for centered text.
 *   The avatar is centered over the name, the star sits directly beside the
 *   avatar, and the name is centered below at full row width. Right-aligned
 *   text mirrors this to the right.
 *
 * Names wider than even the full row stay on one line with an ellipsis.
 */
const COMMUNITY_ROW_CSS = `
${COMMUNITY_ROW} {
  display: flow-root !important;
  position: relative !important;
  padding-block: 4px !important;
}
${COMMUNITY_GROUP} {
  display: contents !important;
}
${COMMUNITY_AVATAR} {
  float: left !important;
  margin-inline-end: ${AVATAR_GAP_PX}px !important;
}
${COMMUNITY_TEXT} {
  display: block !important;
  min-width: 0 !important;
  min-height: 32px !important;
  padding-block: 6px !important;
  box-sizing: border-box !important;
}
${COMMUNITY_TEXT}::before {
  content: "" !important;
  float: right !important;
  width: ${STAR_COLUMN_PX}px !important;
  height: 32px !important;
}
${COMMUNITY_STAR} {
  position: absolute !important;
  top: 4px !important;
  inset-inline-end: var(--rem16, 16px) !important;
  height: 32px !important;
  display: flex !important;
  align-items: center !important;
}
${COMMUNITY_NAME} {
  overflow-wrap: normal !important;
  word-break: normal !important;
}
/* Inline, right-aligned text: the row mirrors (avatar right, star left). */
:host([data-readit-align="end"]:not([data-readit-stack])) ${COMMUNITY_AVATAR} {
  float: right !important;
  margin-inline: ${AVATAR_GAP_PX}px 0 !important;
}
:host([data-readit-align="end"]:not([data-readit-stack])) ${COMMUNITY_TEXT} {
  text-align: end !important;
}
:host([data-readit-align="end"]:not([data-readit-stack])) ${COMMUNITY_TEXT}::before {
  float: left !important;
}
:host([data-readit-align="end"]:not([data-readit-stack])) ${COMMUNITY_STAR} {
  inset-inline-end: auto !important;
  inset-inline-start: var(--rem16, 16px) !important;
}
/* Stacked: avatar centered over the centered name, star right beside it. */
:host([data-readit-stack]) ${COMMUNITY_AVATAR} {
  float: none !important;
  display: flex !important;
  justify-content: center !important;
  width: fit-content !important;
  margin: 0 auto 2px !important;
}
:host([data-readit-stack]) ${COMMUNITY_TEXT} {
  text-align: center !important;
  min-height: 0 !important;
  padding-block: 0 4px !important;
}
:host([data-readit-stack]) ${COMMUNITY_TEXT}::before {
  display: none !important;
}
:host([data-readit-stack]) ${COMMUNITY_STAR} {
  inset-inline-end: auto !important;
  inset-inline-start: calc(50% + var(--readit-avatar-half, 16px) + 4px) !important;
}
/* Stacked + right-aligned: the same block pinned to the right edge. */
:host([data-readit-stack][data-readit-align="end"]) ${COMMUNITY_AVATAR} {
  margin: 0 0 2px auto !important;
}
:host([data-readit-stack][data-readit-align="end"]) ${COMMUNITY_TEXT} {
  text-align: end !important;
}
:host([data-readit-stack][data-readit-align="end"]) ${COMMUNITY_STAR} {
  inset-inline-start: auto !important;
  inset-inline-end: calc(var(--rem16, 16px) + 2 * var(--readit-avatar-half, 16px) + 4px) !important;
}`;

const HOST_CSS: Record<string, string> = {
  [COMMUNITY_HOST]: COMMUNITY_ROW_CSS,
};

/**
 * Content alignment inside shadow roots (edit toolbar "Text"), keyed off the
 * host's data-readit-align. Mirrors the page rules: plain flex rows justify;
 * two-part rows (content … controls) grow their leading group and align it.
 */
const ALIGN_STYLE_ATTR = "data-readit-align-css";
const alignRules = (align: "center" | "end", justify: string) => `
:host([data-readit-align="${align}"]) .flex:not(.flex-col):not([class*="justify-between"]):not([class*="justify-around"]):not([class*="justify-evenly"]) {
  justify-content: ${justify} !important;
}
:host([data-readit-align="${align}"]) [class*="justify-between"] > .flex:first-child:not(.flex-col) {
  flex-grow: 1 !important;
  justify-content: ${justify} !important;
}
:host([data-readit-align="${align}"]) [class*="justify-between"]:has(> :only-child) {
  justify-content: ${justify} !important;
}`;
const ALIGN_CSS =
  alignRules("center", "center") +
  alignRules("end", "flex-end") +
  `
/* A post's action bar ends in an empty ms-auto spacer whose auto margin
   soaks up all free space, so justify-content alone can't move the row. */
:host([data-readit-align]) .shreddit-post-container > .ms-auto {
  margin-inline-start: 0 !important;
}`;

/** Marks a community name readit deliberately ellipsized (checks skip it). */
const ELLIPSIS_ATTR = "data-readit-ellipsis";
const ELLIPSIS_PROPS = ["white-space", "overflow", "text-overflow", "clear"] as const;
const STACK_ATTR = "data-readit-stack";
const ALIGN_ATTR = "data-readit-align";
const PANELS = ["leftNav", "main", "rightRail"] as const;

let measureCtx: CanvasRenderingContext2D | null = null;

/** One-line width of a community name in its own font. */
function nameWidth(name: HTMLElement): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  const text = (name.textContent || "").trim();
  if (!measureCtx) return name.scrollWidth;
  const cs = getComputedStyle(name);
  measureCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return Math.ceil(measureCtx.measureText(text).width);
}

function rowInnerWidth(row: HTMLElement): number {
  const cs = getComputedStyle(row);
  return (
    row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
  );
}

/** Ellipsis for a name wider than the whole row; the full name moves to a tooltip. */
function fitCommunityName(root: ShadowRoot): void {
  const name = root.querySelector<HTMLElement>(COMMUNITY_NAME);
  const row = root.querySelector<HTMLElement>(COMMUNITY_ROW);
  if (!name || !row) return;
  for (const prop of ELLIPSIS_PROPS) name.style.removeProperty(prop);
  if (name.hasAttribute(ELLIPSIS_ATTR)) {
    name.removeAttribute(ELLIPSIS_ATTR);
    name.removeAttribute("title");
  }
  if (nameWidth(name) <= rowInnerWidth(row) + 1) return;
  name.style.setProperty("white-space", "nowrap", "important");
  name.style.setProperty("overflow", "hidden", "important");
  name.style.setProperty("text-overflow", "ellipsis", "important");
  // overflow:hidden makes the name a block that won't overlap floats, so it
  // would squeeze in beside them; clear puts it under the avatar at full width.
  name.style.setProperty("clear", "both", "important");
  name.setAttribute(ELLIPSIS_ATTR, "");
  if (!name.title) name.title = (name.textContent || "").trim();
}

/** Whether this row's name fits on one line beside its avatar (inline layout). */
function fitsInline(root: ShadowRoot): boolean {
  const name = root.querySelector<HTMLElement>(COMMUNITY_NAME);
  const row = root.querySelector<HTMLElement>(COMMUNITY_ROW);
  const avatar = root.querySelector<HTMLElement>(COMMUNITY_AVATAR);
  if (!name || !row || !avatar) return true;
  const room =
    rowInnerWidth(row) -
    avatar.getBoundingClientRect().width -
    AVATAR_GAP_PX -
    STAR_COLUMN_PX;
  return nameWidth(name) <= room + 1;
}

/**
 * Decide the community-row layout for the whole nav: stacked for every row
 * when centered, or as soon as any one name doesn't fit beside its avatar —
 * so the column never mixes the two layouts.
 */
function syncCommunityRows(roots: ShadowRoot[], align: ContentAlign): void {
  if (!roots.length) return;
  const stack = align === "center" || !roots.every(fitsInline);
  for (const root of roots) {
    const host = root.host as HTMLElement;
    if (stack) {
      if (!host.hasAttribute(STACK_ATTR)) host.setAttribute(STACK_ATTR, "");
      const avatar = root.querySelector<HTMLElement>(COMMUNITY_AVATAR);
      const half = avatar ? avatar.getBoundingClientRect().width / 2 : 16;
      host.style.setProperty("--readit-avatar-half", `${Math.round(half) || 16}px`);
    } else {
      host.removeAttribute(STACK_ATTR);
      host.style.removeProperty("--readit-avatar-half");
    }
    fitCommunityName(root);
  }
}

/**
 * Prepare one shadow root: alignment (every column) and — in the nav and
 * rail only — the wrap stylesheet. Community rows are collected for the
 * column-wide layout decision.
 */
function processShadowRoot(
  root: ShadowRoot,
  align: ContentAlign,
  wrap: boolean,
  communities: ShadowRoot[],
): void {
  const host = root.host.tagName.toLowerCase();
  if (align === "start") root.host.removeAttribute(ALIGN_ATTR);
  else if (root.host.getAttribute(ALIGN_ATTR) !== align) {
    root.host.setAttribute(ALIGN_ATTR, align);
  }
  if (align !== "start" && !root.querySelector(`style[${ALIGN_STYLE_ATTR}]`)) {
    const style = document.createElement("style");
    style.setAttribute(ALIGN_STYLE_ATTR, "");
    style.textContent = ALIGN_CSS;
    root.append(style);
  }
  if (wrap) {
    if (!root.querySelector(`style[${STYLE_ATTR}]`)) {
      const style = document.createElement("style");
      style.setAttribute(STYLE_ATTR, "");
      style.textContent = WRAP_CSS + (HOST_CSS[host] ?? "");
      root.append(style);
    }
    if (host === COMMUNITY_HOST) communities.push(root);
  }
  for (const el of root.querySelectorAll("*")) {
    if (el.shadowRoot) processShadowRoot(el.shadowRoot, align, wrap, communities);
  }
}

/** Main-column alignment last applied — the feed is large, so it's only
 * walked while aligned (or once more to reset it). */
let lastMainAlign: ContentAlign = "start";
let lastNavAlign: ContentAlign = "start";
let navResize: ResizeObserver | null = null;
let observedNav: Element | null = null;
let resizeRaf = 0;

function collectCommunityRoots(scope: Element): ShadowRoot[] {
  const out: ShadowRoot[] = [];
  const walk = (root: ParentNode) => {
    for (const el of root.querySelectorAll("*")) {
      if (!el.shadowRoot) continue;
      if (el.tagName.toLowerCase() === COMMUNITY_HOST) out.push(el.shadowRoot);
      walk(el.shadowRoot);
    }
  };
  walk(scope);
  return out;
}

/** Re-decide the community layout when the nav's width changes. */
function watchNavWidth(nav: Element): void {
  if (observedNav === nav) return;
  navResize?.disconnect();
  observedNav = nav;
  let lastWidth = Math.round(nav.getBoundingClientRect().width);
  navResize = new ResizeObserver(() => {
    const width = Math.round(nav.getBoundingClientRect().width);
    if (width === lastWidth) return;
    lastWidth = width;
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() =>
      syncCommunityRows(collectCommunityRoots(nav), lastNavAlign),
    );
  });
  navResize.observe(nav);
}

export const textWrapFeature: FeatureModule = {
  id: "textWrap",
  tier: "simple",
  audience: ["reader", "creator", "moderator"],
  category: "style",
  label: "Wrap labels",
  description:
    "Nav/rail labels wrap instead of truncating; column text alignment reaches Reddit's own components.",
  apply(ctx) {
    for (const panel of PANELS) {
      const align = panelContentAlign(ctx.settings.layoutSlots, panel);
      if (panel === "main") {
        if (align === "start" && lastMainAlign === "start") continue;
        lastMainAlign = align;
      }
      const scope = document.querySelector(`[data-readit-slot="${panel}"]`);
      if (!scope) continue;
      const communities: ShadowRoot[] = [];
      for (const el of scope.querySelectorAll("*")) {
        if (el.shadowRoot) {
          processShadowRoot(el.shadowRoot, align, panel !== "main", communities);
        }
      }
      if (panel === "leftNav") {
        lastNavAlign = align;
        syncCommunityRows(communities, align);
        watchNavWidth(scope);
      }
    }
  },
  teardown() {
    navResize?.disconnect();
    navResize = null;
    observedNav = null;
    cancelAnimationFrame(resizeRaf);
    const remove = (root: ShadowRoot) => {
      root.querySelector(`style[${STYLE_ATTR}]`)?.remove();
      root.querySelector(`style[${ALIGN_STYLE_ATTR}]`)?.remove();
      const host = root.host as HTMLElement;
      host.removeAttribute(ALIGN_ATTR);
      host.removeAttribute(STACK_ATTR);
      host.style.removeProperty("--readit-avatar-half");
      const name = root.querySelector<HTMLElement>(COMMUNITY_NAME);
      if (name) {
        for (const prop of ELLIPSIS_PROPS) name.style.removeProperty(prop);
        if (name.hasAttribute(ELLIPSIS_ATTR)) {
          name.removeAttribute(ELLIPSIS_ATTR);
          name.removeAttribute("title");
        }
      }
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) remove(el.shadowRoot);
      }
    };
    for (const el of document.querySelectorAll("*")) {
      if (el.shadowRoot) remove(el.shadowRoot);
    }
    lastMainAlign = "start";
    lastNavAlign = "start";
  },
  health: () => "ok",
};
