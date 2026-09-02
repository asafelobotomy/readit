import type {
  CssTokens,
  HideNoise,
  LayoutColumnPanel,
  LayoutPreset,
  LayoutSlotsConfig,
  MediaMode,
  ReaditSettings,
} from "@readit/schema";
import { normalizeColumnOrder } from "@readit/schema";

const STYLE_ID = "readit-css-engine";

export function tokensToCssVars(tokens: CssTokens): Record<string, string> {
  const gap = 8 + Math.round((1 - tokens.density) * 16);
  const pad = 6 + Math.round((1 - tokens.density) * 10);
  return {
    "--readit-feed-width": `${tokens.feedWidthPx}px`,
    "--readit-gap": `${gap}px`,
    "--readit-pad": `${pad}px`,
    "--readit-font-scale": String(tokens.fontScale),
    "--readit-radius": `${tokens.radiusPx}px`,
    "--readit-accent": tokens.accent,
  };
}

function hideRules(hide: HideNoise): string[] {
  const rules: string[] = [];
  if (hide.promoted) {
    rules.push(
      `shreddit-ad-post,
[data-testid="ad-post"],
[id*="promoted"],
faceplate-tracker[noun="ad"] { display: none !important; }`,
    );
  }
  if (hide.recommended) {
    rules.push(
      `[data-testid="recommended-posts"],
[aria-label*="Recommended"],
aside [href*="/r/popular"],
shreddit-async-loader[nameid*="recommendations"] { display: none !important; }`,
    );
  }
  if (hide.sidebars) {
    rules.push(
      `#right-sidebar-container,
aside[aria-label*="community"],
[data-testid="frontpage-sidebar"],
[data-testid="subreddit-sidebar"] { display: none !important; }`,
    );
  }
  if (hide.getApp) {
    rules.push(
      `a[href*="app.reddit.com"],
button[aria-label*="Get App"],
[data-testid="get-app-button"] { display: none !important; }`,
    );
  }
  if (hide.premiumUpsell) {
    rules.push(
      `[data-testid="premium-navbar"],
a[href*="/premium"],
[id*="premium"] { display: none !important; }`,
    );
  }
  if (hide.joinConversation) {
    rules.push(
      `[placeholder*="Join the conversation" i],
faceplate-textarea-input[placeholder*="Join the conversation" i],
[aria-label*="Join the conversation" i] {
  display: none !important;
}`,
    );
  }
  if (hide.relatedCommunities) {
    rules.push(
      `faceplate-tracker[noun="related_communities"],
[id*="related-communities" i],
[data-testid="related-communities"],
[data-faceplate-tracking-context*="related_communities"] {
  display: none !important;
}`,
    );
  }
  if (hide.redditPro) {
    rules.push(
      `a[href*="reddit.com/pro"],
[aria-label*="Reddit Pro" i],
[data-testid*="reddit-pro" i] {
  display: none !important;
}`,
    );
  }
  if (hide.aiSummary) {
    rules.push(
      `[aria-label*="AI summary" i],
[data-testid*="ai-summary" i],
faceplate-tracker[noun*="ai_summary"] {
  display: none !important;
}`,
    );
  }
  if (hide.searchAnswers) {
    rules.push(
      `[data-testid*="search-answer" i],
[aria-label*="Search answers" i],
faceplate-tracker[noun*="search_answer"],
reddit-search-answers,
shreddit-search-answer {
  display: none !important;
}`,
    );
  }
  if (hide.announcements) {
    rules.push(
      `[data-testid*="announcement" i],
[aria-label*="Announcement" i],
faceplate-tracker[noun*="announcement"] {
  display: none !important;
}`,
    );
  }
  if (hide.awards) {
    rules.push(
      `/* readit-hide:awards */
shreddit-post button[aria-label*="Award" i],
shreddit-comment button[aria-label*="Award" i],
[data-testid*="award" i],
faceplate-tracker[noun*="award"] {
  display: none !important;
}`,
    );
  }
  if (hide.crosspost) {
    rules.push(
      `/* readit-hide:crosspost */
shreddit-post button[aria-label*="Crosspost" i],
shreddit-post button[aria-label*="cross post" i],
[data-testid*="crosspost" i],
faceplate-tracker[noun*="crosspost"] {
  display: none !important;
}`,
    );
  }
  if (hide.joinButton) {
    rules.push(
      `/* readit-hide:joinButton */
shreddit-feed shreddit-post faceplate-tracker[noun="join"],
shreddit-feed shreddit-post button[aria-label^="Join" i],
shreddit-feed shreddit-post a[aria-label^="Join" i] {
  display: none !important;
}`,
    );
  }
  return rules;
}

function mediaRules(mode: MediaMode): string[] {
  if (mode === "links_on_feed") {
    return [
      `shreddit-feed shreddit-post media-lightbox-img,
shreddit-feed shreddit-player,
shreddit-feed [slot="post-media-container"] {
  display: none !important;
}`,
    ];
  }
  if (mode === "autoplay_off") {
    return [
      `shreddit-player[autoplay],
video[autoplay] { autoplay: false !important; }`,
    ];
  }
  return [];
}

function layoutRules(): string {
  return `
/* Cap the feed column only — never shreddit-app / page chrome.
   Constraining shreddit-app + margin-inline:auto centered the whole shell
   (~300px blank gutters) and squished left-nav + feed into a narrow block. */
html.readit-active #main-content,
html.readit-active [data-readit-slot="main"],
html.readit-active shreddit-feed {
  max-width: var(--readit-feed-width) !important;
  width: 100% !important;
  min-width: 0 !important;
}

/* Thin scrollbar gutters stay reserved; only the thumb fades in on column hover
   so revealing the bar never reflows / clips column chrome. */
html.readit-active {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
html.readit-active *,
html.readit-active *::before,
html.readit-active *::after {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
html.readit-active *::-webkit-scrollbar {
  width: 6px !important;
  height: 6px !important;
  background: transparent !important;
}
html.readit-active *::-webkit-scrollbar-track {
  background: transparent !important;
}
html.readit-active *::-webkit-scrollbar-thumb {
  background: transparent !important;
  border-radius: 999px !important;
  border: 1px solid transparent !important;
  background-clip: padding-box !important;
}

/* Column hover → paint the thumb (gutter already reserved) */
html.readit-active [data-readit-slot]:hover,
html.readit-active [data-readit-slot]:hover * {
  scrollbar-color: color-mix(in srgb, CanvasText 35%, transparent) transparent;
}
html.readit-active [data-readit-slot]:hover::-webkit-scrollbar-thumb,
html.readit-active [data-readit-slot]:hover *::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, CanvasText 32%, transparent) !important;
  background-clip: padding-box !important;
}
html.readit-active [data-readit-slot]:hover::-webkit-scrollbar-thumb:hover,
html.readit-active [data-readit-slot]:hover *::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, CanvasText 50%, transparent) !important;
  background-clip: padding-box !important;
}

/* Feed drives document scroll — reveal page thumb while hovering main */
html.readit-active:has([data-readit-slot="main"]:hover) {
  scrollbar-color: color-mix(in srgb, CanvasText 35%, transparent) transparent;
}
html.readit-active:has([data-readit-slot="main"]:hover)::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, CanvasText 32%, transparent) !important;
  background-clip: padding-box !important;
}

/* Reddit centers a fixed m:w-[1120px] subgrid in the wide grid track on large
   viewports, leaving a blank column between left nav and the post. Stretch the
   subgrid so main + right rail sit flush after the nav. */
html.readit-active .grid-container.flex-nav-expanded {
  grid-template-columns: var(--readit-left-nav-width, 272px) minmax(0, 1fr) !important;
}
html.readit-active #subgrid-container {
  width: 100% !important;
  max-width: none !important;
  justify-self: stretch !important;
  margin-inline: 0 !important;
}
html.readit-active #subgrid-container .main-container {
  width: 100% !important;
  max-width: none !important;
  justify-content: flex-start !important;
}

html.readit-active shreddit-feed,
html.readit-active shreddit-post {
  font-size: calc(1rem * var(--readit-font-scale));
}

html.readit-active shreddit-post {
  border-radius: var(--readit-radius) !important;
  margin-block: var(--readit-gap) !important;
  padding: var(--readit-pad) !important;
  border: var(--readit-card-border, none);
}

html.readit-queue-density shreddit-post {
  margin-block: 4px !important;
  padding: 4px 8px !important;
}

html.readit-op-highlight [data-author][data-op="true"],
html.readit-op-highlight .author-op,
html.readit-op-highlight shreddit-comment[is-op],
html.readit-op-highlight shreddit-comment[author][data-is-op="true"] {
  outline: 2px solid var(--readit-accent);
  outline-offset: 2px;
  border-radius: 4px;
}

html.readit-mod-highlight [data-readit-actioned="true"] {
  opacity: 0.55;
}

html.readit-mod-highlight [data-readit-has-note="true"]::before {
  content: "note";
  display: inline-block;
  font-size: 10px;
  margin-right: 4px;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--readit-accent);
  color: #fff;
  vertical-align: middle;
}

html.readit-anti-refresh [aria-label*="View new posts" i],
html.readit-anti-refresh [aria-label*="New posts" i],
html.readit-anti-refresh button:has([aria-label*="refresh" i]),
html.readit-anti-refresh [data-testid*="new-posts" i],
html.readit-anti-refresh faceplate-tracker[noun*="refresh_feed"] {
  display: none !important;
}

/* Wave A — compact feed (Sink It–style density) */
html.readit-feed-compact shreddit-post {
  margin-block: 4px !important;
  padding: 6px 10px !important;
}
html.readit-feed-compact [slot="post-media-container"],
html.readit-feed-compact shreddit-player {
  max-height: 120px !important;
  overflow: hidden !important;
}
html.readit-feed-compact h3[slot="title"],
html.readit-feed-compact a[slot="title"] {
  font-size: calc(0.95rem * var(--readit-font-scale)) !important;
}

/* Wave A — lurker mode */
html.readit-lurker shreddit-post button[aria-label*="upvote" i],
html.readit-lurker shreddit-post button[aria-label*="downvote" i],
html.readit-lurker shreddit-comment button[aria-label*="upvote" i],
html.readit-lurker shreddit-comment button[aria-label*="downvote" i],
html.readit-lurker shreddit-post [data-click-id="upvote"],
html.readit-lurker shreddit-post [data-click-id="downvote"] {
  pointer-events: none !important;
  opacity: 0.55 !important;
}
`;
}

/** Marker comment included in stylesheet for smoke / tests. */
export const LAYOUT_RECIPE_MARKER = "/* readit-layout-recipe */";

function panelTrack(
  panel: LayoutColumnPanel,
  widths: LayoutSlotsConfig["widths"],
  feedWidthPx: number,
): string {
  switch (panel) {
    case "leftNav":
      return `${widths.leftNavPx}px`;
    case "main":
      return `${feedWidthPx}px`;
    case "rightRail":
      return `${widths.rightRailPx}px`;
    default: {
      const _exhaustive: never = panel;
      return _exhaustive;
    }
  }
}

function panelWidthRules(
  panel: LayoutColumnPanel,
  column: number,
): string {
  switch (panel) {
    case "leftNav":
      return `html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] {
  grid-column: ${column} !important;
  grid-row: 1 !important;
  width: var(--readit-left-nav-width) !important;
  max-width: var(--readit-left-nav-width) !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
  position: sticky !important;
  top: var(--readit-chrome-top, 56px) !important;
  align-self: start !important;
  height: calc(100vh - var(--readit-chrome-top, 56px)) !important;
  max-height: calc(100vh - var(--readit-chrome-top, 56px)) !important;
  overflow-x: clip !important;
  overflow-y: visible !important;
  isolation: isolate !important;
  z-index: 3 !important;
  container-type: inline-size !important;
  container-name: readit-nav !important;
  overflow-wrap: normal !important;
  word-break: normal !important;
}
/* Reddit expands left nav with position:fixed — rebind into our sticky column */
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] > div,
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] #flex-left-nav-container {
  position: absolute !important;
  inset: 0 !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100% !important;
  max-width: none !important;
  height: 100% !important;
  max-height: none !important;
  box-sizing: border-box !important;
  padding-inline: 6px !important;
  overflow-x: clip !important;
  overflow-y: auto !important;
  overscroll-behavior: contain !important;
  scrollbar-gutter: stable !important;
  border-left: 1px solid color-mix(in srgb, CanvasText 20%, transparent) !important;
  overflow-wrap: normal !important;
  word-break: normal !important;
}
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] reddit-sidebar-nav,
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] #left-sidebar {
  position: relative !important;
  inset: auto !important;
  width: 100% !important;
  max-width: none !important;
  height: auto !important;
  max-height: none !important;
  overflow-x: clip !important;
  overflow-y: visible !important;
  box-sizing: border-box !important;
  padding-inline: 8px !important;
}
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] #flex-left-nav-contents,
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] nav,
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] details,
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] summary,
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] ul,
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] li,
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] faceplate-tracker,
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] faceplate-expandable-section-helper,
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] faceplate-auto-height-animator,
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] [id="RECENT"],
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] [id="COMMUNITIES"],
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] [id^="recent-communities"],
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] [id*="communities-section"] {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
}
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] a,
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] button {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
}
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] a > span,
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] a [class*="truncate"],
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] li span {
  min-width: 0 !important;
  flex: 1 1 auto !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] img,
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] svg,
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] video {
  max-width: 100% !important;
  max-height: 40px !important;
  width: auto !important;
  height: auto !important;
  object-fit: contain !important;
  flex-shrink: 0 !important;
}
/* Reddit hangs the collapse control at right:-16px (into the feed). Keep it
   inside the content box (clear of the stable scrollbar gutter). */
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] div:has(> rpl-tooltip) {
  right: 4px !important;
  left: auto !important;
  width: auto !important;
}
/* Icon rail — shrink past ~label width and keep only avatars / icons */
@container readit-nav (max-width: 104px) {
  reddit-sidebar-nav,
  #left-sidebar {
    padding-inline: 2px !important;
  }
  #flex-left-nav-container,
  [data-readit-slot="leftNav"] > div {
    padding-inline: 2px !important;
    scrollbar-gutter: auto !important;
  }
  a,
  button,
  summary {
    justify-content: center !important;
    align-items: center !important;
    padding-inline: 0 !important;
    gap: 0 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    font-size: 0 !important;
    line-height: 0 !important;
    color: transparent !important;
  }
  a svg,
  a img,
  a i,
  a [avatar],
  a faceplate-img,
  button svg,
  button img,
  button i,
  summary svg,
  summary i {
    font-size: 16px !important;
    line-height: normal !important;
    color: inherit !important;
    max-width: 32px !important;
    max-height: 32px !important;
  }
  a > span.flex.items-center.gap-xs {
    justify-content: center !important;
    gap: 0 !important;
    flex: 0 0 auto !important;
    overflow: visible !important;
  }
  a > span.flex.items-center.gap-xs > span:not(:has(img, svg, [avatar], faceplate-img, i)) {
    display: none !important;
  }
  a > span.flex.items-center.shrink-0,
  summary span:not(:has(svg, i)),
  div:has(> rpl-tooltip) {
    display: none !important;
  }
}`;
    case "main":
      return `html.readit-active.readit-layout-slots [data-readit-slot="main"],
html.readit-active.readit-layout-slots #main-content {
  grid-column: ${column} !important;
  grid-row: 1 !important;
  width: var(--readit-feed-width) !important;
  max-width: var(--readit-feed-width) !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
  /* Feed drives document scroll — do not lock to viewport */
  position: relative !important;
  top: auto !important;
  align-self: start !important;
  height: auto !important;
  max-height: none !important;
  overflow-x: clip !important;
  overflow-y: visible !important;
  isolation: isolate !important;
  z-index: 1 !important;
  contain: inline-size !important;
  max-width: 100% !important;
  overflow-wrap: break-word !important;
  word-break: normal !important;
}
html.readit-active.readit-layout-slots [data-readit-slot="main"] shreddit-post,
html.readit-active.readit-layout-slots [data-readit-slot="main"] article {
  max-width: 100% !important;
  overflow-x: clip !important;
  box-sizing: border-box !important;
}
html.readit-active.readit-layout-slots [data-readit-slot="main"] h1,
html.readit-active.readit-layout-slots [data-readit-slot="main"] h2,
html.readit-active.readit-layout-slots [data-readit-slot="main"] h3,
html.readit-active.readit-layout-slots [data-readit-slot="main"] a[slot="title"],
html.readit-active.readit-layout-slots [data-readit-slot="main"] [slot="title"] {
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  display: -webkit-box !important;
  -webkit-box-orient: vertical !important;
  -webkit-line-clamp: 3 !important;
  max-width: 100% !important;
  overflow-wrap: break-word !important;
  word-break: break-word !important;
}
html.readit-active.readit-layout-slots [data-readit-slot="main"] img,
html.readit-active.readit-layout-slots [data-readit-slot="main"] video,
html.readit-active.readit-layout-slots [data-readit-slot="main"] canvas,
html.readit-active.readit-layout-slots [data-readit-slot="main"] iframe,
html.readit-active.readit-layout-slots [data-readit-slot="main"] shreddit-player,
html.readit-active.readit-layout-slots [data-readit-slot="main"] [slot="post-media-container"] {
  max-width: 100% !important;
  height: auto !important;
  object-fit: contain !important;
}
html.readit-active.readit-layout-slots [data-readit-slot="main"] img.absolute,
html.readit-active.readit-layout-slots [data-readit-slot="main"] [class*="absolute"] img {
  max-width: 100% !important;
  width: auto !important;
  left: 0 !important;
  right: 0 !important;
  inset-inline: 0 !important;
}`;
    case "rightRail":
      return `html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] {
  grid-column: ${column} !important;
  grid-row: 1 !important;
  width: var(--readit-right-rail-width) !important;
  max-width: var(--readit-right-rail-width) !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
  position: sticky !important;
  top: var(--readit-chrome-top, 56px) !important;
  align-self: start !important;
  height: calc(100vh - var(--readit-chrome-top, 56px)) !important;
  max-height: calc(100vh - var(--readit-chrome-top, 56px)) !important;
  overflow-x: clip !important;
  overflow-y: auto !important;
  overscroll-behavior: contain !important;
  scrollbar-gutter: stable !important;
  isolation: isolate !important;
  z-index: 3 !important;
  padding-inline: 8px !important;
  max-width: 100% !important;
  overflow-wrap: break-word !important;
  word-break: break-word !important;
}
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] img,
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] video,
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] canvas,
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] iframe {
  max-width: 100% !important;
  height: auto !important;
  object-fit: contain !important;
}`;
    default: {
      const _exhaustive: never = panel;
      return _exhaustive;
    }
  }
}

function layoutSlotRecipes(
  config: LayoutSlotsConfig,
  feedWidthPx: number,
): string {
  const { placements, widths, preset } = config;
  const order = normalizeColumnOrder(config.columnOrder);
  const leftW = widths.leftNavPx;
  const rightW = widths.rightRailPx;
  const feedW = feedWidthPx;
  const padL = widths.pagePadLeftPx ?? 24;
  const padR = widths.pagePadRightPx ?? 24;
  const gap = widths.columnGapPx ?? 12;

  const parts: string[] = [
    LAYOUT_RECIPE_MARKER,
    `html.readit-active.readit-layout-slots {
  --readit-left-nav-width: ${leftW}px;
  --readit-right-rail-width: ${rightW}px;
  --readit-page-pad-left: ${padL}px;
  --readit-page-pad-right: ${padR}px;
  --readit-column-gap: ${gap}px;
  --readit-chrome-top: 56px;
  --readit-card-border: 1px solid color-mix(in srgb, var(--readit-accent) 18%, transparent);
}`,
    /* Edit-mode: labeled overlay frames + resize / drag */
    `html.readit-layout-edit [data-readit-slot] {
  outline: none !important;
}
html.readit-layout-edit .readit-layout-frame {
  position: fixed;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: 2px solid color-mix(in srgb, var(--readit-accent) 75%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--readit-accent) 8%, transparent);
  z-index: 2147482990;
  pointer-events: none;
  touch-action: none;
  overflow: hidden;
}
html.readit-layout-edit .readit-layout-frame[data-kind="pad"] {
  border-style: dashed;
  background: color-mix(in srgb, CanvasText 6%, transparent);
  z-index: 2147482985;
}
html.readit-layout-edit .readit-layout-frame[data-kind="panel"] {
  z-index: 2147482992;
}
html.readit-layout-edit .readit-layout-frame[data-drop="1"] {
  border-color: var(--readit-accent);
  background: color-mix(in srgb, var(--readit-accent) 18%, transparent);
}
html.readit-layout-edit .readit-layout-frame[data-dragging="1"] {
  opacity: 0.45;
}
html.readit-layout-edit .readit-frame-label {
  position: absolute;
  top: 4px;
  left: 4px;
  pointer-events: auto;
  cursor: grab;
  z-index: 1;
  border: 0;
  border-radius: 4px;
  padding: 2px 8px;
  font: 600 11px/1.2 ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0.02em;
  color: #fff;
  background: color-mix(in srgb, var(--readit-accent) 92%, #000);
  touch-action: none;
  user-select: none;
}
html.readit-layout-edit .readit-frame-label:active {
  cursor: grabbing;
}
html.readit-layout-edit .readit-drop-line {
  position: fixed;
  width: 3px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 2px;
  background: var(--readit-accent);
  z-index: 2147482995;
  pointer-events: none;
  display: none;
}
html.readit-layout-edit .readit-col-resize,
html.readit-layout-edit .readit-pad-resize {
  position: fixed;
  width: 10px;
  margin: 0;
  padding: 0;
  border: 0;
  cursor: col-resize;
  z-index: 2147483000;
  background: transparent;
  touch-action: none;
}
html.readit-layout-edit .readit-col-resize::after,
html.readit-layout-edit .readit-pad-resize::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 4px;
  width: 2px;
  border-radius: 1px;
  background: color-mix(in srgb, var(--readit-accent) 85%, #fff);
  opacity: 0.85;
}
html.readit-layout-edit .readit-pad-resize::after {
  background: color-mix(in srgb, CanvasText 40%, var(--readit-accent));
}
html.readit-layout-edit .readit-col-resize:hover::after,
html.readit-layout-edit .readit-col-resize[data-active="1"]::after,
html.readit-layout-edit .readit-pad-resize:hover::after,
html.readit-layout-edit .readit-pad-resize[data-active="1"]::after {
  opacity: 1;
  width: 3px;
  left: 3.5px;
}
html.readit-layout-edit.readit-col-resizing,
html.readit-layout-edit.readit-col-resizing * {
  cursor: col-resize !important;
  user-select: none !important;
}
html.readit-layout-edit.readit-col-dragging,
html.readit-layout-edit.readit-col-dragging * {
  cursor: grabbing !important;
  user-select: none !important;
}`,
  ];

  const hide = (slot: string) =>
    `html.readit-active.readit-layout-slots [data-readit-slot="${slot}"] {
  display: none !important;
}`;

  if (preset === "singleColumn") {
    parts.push(`/* readit-layout:singleColumn */`);
    parts.push(`html.readit-active.readit-layout-slots [data-readit-slot="leftNav"],
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"],
html.readit-active.readit-layout-slots [data-readit-slot="subHeader"],
html.readit-active.readit-layout-slots #left-sidebar-container,
html.readit-active.readit-layout-slots #right-sidebar-container {
  display: none !important;
}
html.readit-active.readit-layout-slots #main-content,
html.readit-active.readit-layout-slots [data-readit-slot="main"] {
  max-width: var(--readit-feed-width) !important;
  width: 100% !important;
  margin-inline: auto !important;
}`);
    return parts.join("\n\n");
  }

  // dual* kept as stacking recipes (phase-1 permutation is the primary path)
  if (preset === "dualLeft" || preset === "dualRight") {
    parts.push(`/* readit-layout:${preset} */`);
    const stackSide = preset === "dualLeft" ? "flex-start" : "flex-end";
    parts.push(`html.readit-active.readit-layout-slots [data-readit-layout-shell] {
  display: flex !important;
  flex-wrap: wrap !important;
  justify-content: ${stackSide} !important;
  width: 100% !important;
}
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] {
  width: var(--readit-left-nav-width) !important;
  max-width: var(--readit-left-nav-width) !important;
  flex: 0 0 var(--readit-left-nav-width) !important;
}
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] {
  width: var(--readit-right-rail-width) !important;
  max-width: var(--readit-right-rail-width) !important;
  flex: 0 0 var(--readit-right-rail-width) !important;
}`);
    return parts.join("\n\n");
  }

  parts.push(`/* readit-layout:columns ${order.join("|")} */`);

  const visible = order.filter((id) => placements[id] !== "hidden");
  const tracks = visible
    .map((id) => panelTrack(id, widths, feedW))
    .join(" ");

  parts.push(`html.readit-active.readit-layout-slots [data-readit-layout-shell] {
  display: grid !important;
  grid-template-columns: var(--readit-grid-cols, ${tracks || "minmax(0, 1fr)"}) !important;
  grid-template-rows: auto !important;
  grid-auto-flow: column !important;
  column-gap: var(--readit-column-gap, 12px) !important;
  row-gap: 0 !important;
  justify-content: start !important;
  align-items: start !important;
  box-sizing: border-box !important;
  width: 100% !important;
  max-width: none !important;
  padding-left: var(--readit-page-pad-left, 24px) !important;
  padding-right: var(--readit-page-pad-right, 24px) !important;
  overflow-x: clip !important;
}
/* Flatten Reddit nesting so nav / feed / rail become peer grid items */
html.readit-active.readit-layout-slots [data-readit-layout-shell] > #subgrid-container,
html.readit-active.readit-layout-slots [data-readit-layout-shell] .main-container {
  display: contents !important;
}
/* Extra shreddit loaders must not steal a grid cell / create a second row */
html.readit-active.readit-layout-slots [data-readit-layout-shell] shreddit-async-loader {
  display: none !important;
}`);

  visible.forEach((panel, i) => {
    parts.push(panelWidthRules(panel, i + 1));
  });

  if (placements.leftNav === "hidden") parts.push(hide("leftNav"));
  if (placements.rightRail === "hidden") parts.push(hide("rightRail"));
  if (placements.subHeader === "hidden") parts.push(hide("subHeader"));

  return parts.join("\n\n");
}

export function buildStylesheet(settings: ReaditSettings): string {
  if (settings.paused) {
    return `/* readit paused */`;
  }

  const vars = tokensToCssVars(settings.knobs.tokens);
  const varBlock = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");

  const parts = [
    `:root {\n${varBlock}\n}`,
    layoutRules(),
    ...hideRules(settings.knobs.hide),
    ...mediaRules(settings.knobs.mediaMode),
  ];

  if (settings.flags.layoutSlots) {
    parts.push(
      layoutSlotRecipes(
        settings.layoutSlots,
        settings.knobs.tokens.feedWidthPx,
      ),
    );
  }

  for (const rule of settings.elementRules) {
    if (!rule.enabled) continue;
    if (rule.action === "hide") {
      parts.push(`${rule.selector} { display: none !important; }`);
    } else {
      parts.push(`${rule.selector} { opacity: 0.35 !important; }`);
    }
  }

  return parts.join("\n\n");
}

export function applyStylesheet(settings: ReaditSettings): void {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    (document.documentElement || document.head).appendChild(el);
  }
  el.textContent = buildStylesheet(settings);

  const root = document.documentElement;
  root.classList.toggle("readit-active", !settings.paused);
  root.classList.toggle(
    "readit-queue-density",
    !settings.paused && settings.knobs.queueDensity,
  );
  root.classList.toggle(
    "readit-op-highlight",
    !settings.paused && settings.flags.opHighlight,
  );
  root.classList.toggle(
    "readit-mod-highlight",
    !settings.paused && settings.flags.modHighlight,
  );
  root.classList.toggle(
    "readit-anti-refresh",
    !settings.paused && settings.flags.antiRefresh,
  );
  root.classList.toggle(
    "readit-lurker",
    !settings.paused && settings.flags.lurkerMode,
  );
  root.classList.toggle(
    "readit-feed-compact",
    !settings.paused && settings.feedPrefs.feedDensity === "compact",
  );
  root.classList.toggle(
    "readit-layout-slots",
    !settings.paused && settings.flags.layoutSlots,
  );
  root.classList.toggle(
    "readit-layout-edit",
    !settings.paused &&
      settings.flags.layoutSlots &&
      settings.layoutSlots.editMode,
  );

  for (const cls of Array.from(root.classList)) {
    if (cls.startsWith("readit-layout-preset-")) root.classList.remove(cls);
  }
  if (!settings.paused && settings.flags.layoutSlots) {
    const preset: LayoutPreset = settings.layoutSlots.preset;
    root.classList.add(`readit-layout-preset-${preset}`);
    root.dataset.readitLayout = preset;
  } else {
    delete root.dataset.readitLayout;
  }

  if (settings.paused) {
    for (const key of Object.keys(tokensToCssVars(settings.knobs.tokens))) {
      root.style.removeProperty(key);
    }
    root.style.removeProperty("--readit-left-nav-width");
    root.style.removeProperty("--readit-right-rail-width");
    root.style.removeProperty("--readit-page-pad-left");
    root.style.removeProperty("--readit-page-pad-right");
    root.style.removeProperty("--readit-column-gap");
    root.style.removeProperty("--readit-grid-cols");
    return;
  }

  for (const [k, v] of Object.entries(tokensToCssVars(settings.knobs.tokens))) {
    root.style.setProperty(k, v);
  }
  if (settings.flags.layoutSlots) {
    const w = settings.layoutSlots.widths;
    const order = settings.layoutSlots.columnOrder;
    const visible = order.filter(
      (id) => settings.layoutSlots.placements[id] !== "hidden",
    );
    const feed = settings.knobs.tokens.feedWidthPx;
    const tracks = visible
      .map((id) => {
        switch (id) {
          case "leftNav":
            return `${w.leftNavPx}px`;
          case "main":
            return `${feed}px`;
          case "rightRail":
            return `${w.rightRailPx}px`;
          default: {
            const _exhaustive: never = id;
            return _exhaustive;
          }
        }
      })
      .join(" ");
    root.style.setProperty("--readit-left-nav-width", `${w.leftNavPx}px`);
    root.style.setProperty("--readit-right-rail-width", `${w.rightRailPx}px`);
    root.style.setProperty(
      "--readit-page-pad-left",
      `${w.pagePadLeftPx ?? 24}px`,
    );
    root.style.setProperty(
      "--readit-page-pad-right",
      `${w.pagePadRightPx ?? 24}px`,
    );
    root.style.setProperty(
      "--readit-column-gap",
      `${w.columnGapPx ?? 12}px`,
    );
    if (tracks) root.style.setProperty("--readit-grid-cols", tracks);
  }
}

export function removeStylesheet(): void {
  document.getElementById(STYLE_ID)?.remove();
  const root = document.documentElement;
  root.classList.remove(
    "readit-active",
    "readit-queue-density",
    "readit-op-highlight",
    "readit-mod-highlight",
    "readit-layout-slots",
    "readit-layout-edit",
    "readit-layout-degraded",
    "readit-anti-refresh",
    "readit-lurker",
    "readit-feed-compact",
  );
  for (const cls of Array.from(root.classList)) {
    if (cls.startsWith("readit-layout-preset-")) root.classList.remove(cls);
  }
  delete root.dataset.readitLayout;
}
