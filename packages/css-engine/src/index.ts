import type {
  CssTokens,
  HideNoise,
  LayoutColumnPanel,
  LayoutPreset,
  LayoutSlotsConfig,
  MediaMode,
  ReaditSettings,
} from "@readit/schema";
import {
  clampColumnGap,
  clampPagePad,
  clampPanelWidth,
  clampZoom,
  buildLayoutTracks,
  normalizeColumnOrder,
} from "@readit/schema";

const STYLE_ID = "readit-css-engine";

export function tokensToCssVars(tokens: CssTokens): Record<string, string> {
  const gap = 8 + Math.round((1 - tokens.density) * 16);
  const pad = 6 + Math.round((1 - tokens.density) * 10);
  const family =
    tokens.fontFamily === "serif"
      ? "ui-serif, Georgia, Cambria, Times New Roman, Times, serif"
      : tokens.fontFamily === "mono"
        ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        : tokens.fontFamily === "sans"
          ? "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
          : "inherit";
  return {
    "--readit-feed-width": `${tokens.feedWidthPx}px`,
    "--readit-gap": `${gap}px`,
    "--readit-pad": `${pad}px`,
    "--readit-font-scale": String(tokens.fontScale),
    "--readit-font-family": family,
    "--readit-font-weight": String(tokens.fontWeight ?? 400),
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
  font-family: var(--readit-font-family, inherit);
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
  /* Beat Reddit Tailwind .hidden (nav is m:block-only below breakpoint). */
  display: block !important;
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
  overflow-y: auto !important;
  overscroll-behavior: contain !important;
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
/* Progressive tighten as the column narrows (before full icon-rail mode). */
@container readit-nav (max-width: 160px) {
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] > div,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] #flex-left-nav-container {
    padding-inline: 4px !important;
    scrollbar-gutter: auto !important;
  }
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] reddit-sidebar-nav,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] #left-sidebar {
    padding-inline: 4px !important;
  }
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
/* Icon rail — shrink past ~label width; center icons/avatars without clipping.
   Selectors must match or beat the panel rules above (container query alone loses). */
@container readit-nav (max-width: 168px) {
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] > div,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] #flex-left-nav-container {
    padding-inline: 0 !important;
    scrollbar-gutter: auto !important;
  }
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] reddit-sidebar-nav,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] #left-sidebar {
    padding-inline: 0 !important;
  }
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] a,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] button,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] summary {
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    padding-inline: 0 !important;
    margin-inline: 0 !important;
    gap: 0 !important;
    white-space: nowrap !important;
    overflow: visible !important;
    font-size: 0 !important;
    line-height: 0 !important;
    color: transparent !important;
  }
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] li,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] faceplate-tracker,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] faceplate-expandable-section-helper {
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    padding-inline: 0 !important;
    margin-inline: 0 !important;
  }
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] left-nav-community-item,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] [role="listitem"] {
    display: flex !important;
    justify-content: center !important;
    padding-inline: 0 !important;
    margin-inline: 0 !important;
  }
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] a > span,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] a [class*="truncate"],
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] li span {
    flex: 0 0 auto !important;
    min-width: 0 !important;
    max-width: 100% !important;
    overflow: visible !important;
    text-overflow: clip !important;
  }
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] a svg,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] a img,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] a i,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] a [avatar],
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] a faceplate-img,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] button svg,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] button img,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] button i,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] summary svg,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] summary i {
    font-size: 16px !important;
    line-height: normal !important;
    color: inherit !important;
    width: min(28px, 70cqi) !important;
    height: min(28px, 70cqi) !important;
    max-width: min(28px, 70cqi) !important;
    max-height: min(28px, 70cqi) !important;
    margin-inline: auto !important;
    object-fit: cover !important;
    flex-shrink: 0 !important;
  }
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] a faceplate-img,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] a [avatar] {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    overflow: hidden !important;
    border-radius: 50% !important;
  }
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] a faceplate-img img,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] a [avatar] img {
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
    max-height: none !important;
    object-fit: cover !important;
  }
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] a > span.flex.items-center.gap-xs {
    justify-content: center !important;
    gap: 0 !important;
    flex: 0 0 auto !important;
    overflow: visible !important;
    width: auto !important;
    max-width: 100% !important;
  }
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] a > span.flex.items-center.gap-xs > span:not(:has(img, svg, [avatar], faceplate-img, i)) {
    display: none !important;
  }
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] a > span.flex.items-center.shrink-0,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] summary span:not(:has(svg, i)),
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] div:has(> rpl-tooltip),
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] .readit-user-tag,
  html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] [data-readit-has-note="true"]::before {
    display: none !important;
    content: none !important;
  }
}
/* Compact nav: hide Reddit DOM; #readit-nav-rail owns the icon rail UI. */
html.readit-active.readit-layout-slots.readit-nav-compact [data-readit-slot="leftNav"] {
  position: sticky !important;
  top: var(--readit-chrome-top, 56px) !important;
  height: calc(100vh - var(--readit-chrome-top, 56px)) !important;
  max-height: calc(100vh - var(--readit-chrome-top, 56px)) !important;
  overflow-x: hidden !important;
  overflow-y: hidden !important;
  scrollbar-gutter: auto !important;
}
html.readit-active.readit-layout-slots.readit-nav-compact [data-readit-slot="leftNav"] > :not(#readit-nav-rail) {
  /* Keep in DOM for scraping, but invisible and non-interactive */
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  overflow: hidden !important;
  clip: rect(0 0 0 0) !important;
  clip-path: inset(50%) !important;
  white-space: nowrap !important;
  border: 0 !important;
  padding: 0 !important;
  margin: -1px !important;
  pointer-events: none !important;
  opacity: 0 !important;
}
html.readit-active.readit-layout-slots.readit-nav-compact #readit-nav-rail {
  display: flex !important;
  flex-direction: column !important;
  align-items: stretch !important;
  gap: 4px !important;
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  height: 100% !important;
  max-height: 100% !important;
  box-sizing: border-box !important;
  padding: 6px 2px 12px !important;
  margin: 0 !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  overscroll-behavior: contain !important;
  scrollbar-gutter: stable !important;
  color: inherit !important;
  z-index: 2 !important;
}
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-chrome,
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-body,
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-section {
  display: flex !important;
  flex-direction: column !important;
  align-items: stretch !important;
  gap: 2px !important;
  width: 100% !important;
  min-width: 0 !important;
}
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-section {
  margin-top: 6px !important;
  padding-top: 6px !important;
  border-top: 1px solid color-mix(in srgb, CanvasText 12%, transparent) !important;
}
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-item,
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-section-head {
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  align-items: center !important;
  gap: 2px !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
  padding: 6px 2px !important;
  margin: 0 !important;
  text-decoration: none !important;
  color: inherit !important;
  border-radius: 6px !important;
  overflow: hidden !important;
}
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-item:hover,
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-item:focus-visible {
  background: color-mix(in srgb, CanvasText 8%, transparent) !important;
  outline: none !important;
}
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-icon,
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-icon img,
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-icon svg,
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-glyph {
  width: 28px !important;
  height: 28px !important;
  max-width: 28px !important;
  max-height: 28px !important;
  margin: 0 auto !important;
  flex-shrink: 0 !important;
  object-fit: cover !important;
  border-radius: 50% !important;
  display: block !important;
}
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-icon-svg,
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-icon-svg svg {
  border-radius: 0 !important;
  color: inherit !important;
}
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-glyph {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  font: 700 12px/1 ui-sans-serif, system-ui, sans-serif !important;
  background: color-mix(in srgb, CanvasText 14%, transparent) !important;
  border-radius: 8px !important;
}
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-subname {
  font-size: 9px !important;
  font-weight: 700 !important;
  font-synthesis: weight !important;
  line-height: 1.15 !important;
  color: CanvasText !important;
  max-width: 100% !important;
  width: 100% !important;
  text-align: center !important;
  padding-inline: 1px !important;
  overflow-wrap: break-word !important;
  word-break: normal !important;
  white-space: normal !important;
  display: -webkit-box !important;
  -webkit-box-orient: vertical !important;
  -webkit-line-clamp: 2 !important;
  overflow: hidden !important;
}
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-section-icon {
  display: block !important;
  width: 22px !important;
  height: 22px !important;
  margin: 0 auto !important;
  flex-shrink: 0 !important;
  background-color: color-mix(in srgb, CanvasText 78%, transparent) !important;
  -webkit-mask-repeat: no-repeat !important;
  mask-repeat: no-repeat !important;
  -webkit-mask-position: center !important;
  mask-position: center !important;
  -webkit-mask-size: contain !important;
  mask-size: contain !important;
}
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-section-icon[data-readit-nav-section="recent"] {
  -webkit-mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'><circle cx='12' cy='12' r='9'/><path d='M12 7v5l3 2'/></svg>") !important;
  mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'><circle cx='12' cy='12' r='9'/><path d='M12 7v5l3 2'/></svg>") !important;
}
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-section-icon[data-readit-nav-section="communities"] {
  -webkit-mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'><circle cx='9' cy='8' r='3'/><circle cx='17' cy='9' r='2.5'/><path d='M3 19c0-3 3-5 6-5s6 2 6 5'/><path d='M14 19c.3-2 2-3.5 4.5-3.5 1.2 0 2.3.4 3 1'/></svg>") !important;
  mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'><circle cx='9' cy='8' r='3'/><circle cx='17' cy='9' r='2.5'/><path d='M3 19c0-3 3-5 6-5s6 2 6 5'/><path d='M14 19c.3-2 2-3.5 4.5-3.5 1.2 0 2.3.4 3 1'/></svg>") !important;
}
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-section-icon[data-readit-nav-section="custom"] {
  -webkit-mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'><path d='M4 6h16M4 12h10M4 18h13'/></svg>") !important;
  mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'><path d='M4 6h16M4 12h10M4 18h13'/></svg>") !important;
}
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-section-icon[data-readit-nav-section="games"] {
  -webkit-mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'><rect x='2' y='8' width='20' height='10' rx='4'/><path d='M8 12h2m-1-1v2M16 12h.01M18 12h.01'/></svg>") !important;
  mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'><rect x='2' y='8' width='20' height='10' rx='4'/><path d='M8 12h2m-1-1v2M16 12h.01M18 12h.01'/></svg>") !important;
}
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-section-icon[data-readit-nav-section="resources"] {
  -webkit-mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'><path d='M4 5h7a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H4z'/><path d='M20 5h-7a3 3 0 0 0-3 3v12a3 3 0 0 1 3-3h7z'/></svg>") !important;
  mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'><path d='M4 5h7a3 3 0 0 0-3 3v12a3 3 0 0 1 3-3h7z'/></svg>") !important;
}
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-section-icon[data-readit-nav-section="best"] {
  -webkit-mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'><path d='M12 3l2.2 5.5L20 10l-4.5 3.5L17 20l-5-3.2L7 20l1.5-6.5L4 10l5.8-1.5z'/></svg>") !important;
  mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'><path d='M12 3l2.2 5.5L20 10l-4.5 3.5L17 20l-5-3.2L7 20l1.5-6.5L4 10l5.8-1.5z'/></svg>") !important;
}
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-section-icon[data-readit-nav-section="moderation"],
html.readit-active.readit-layout-slots.readit-nav-compact .readit-nav-rail-section-icon[data-readit-nav-section="other"] {
  -webkit-mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'><circle cx='12' cy='12' r='3'/><path d='M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2'/></svg>") !important;
  mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'><circle cx='12' cy='12' r='3'/><path d='M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2'/></svg>") !important;
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
/* Cap replaced media to the feed column — never force height:auto on
   iframes/players (collapses Devvit webviews and aspect-ratio shells). */
html.readit-active.readit-layout-slots [data-readit-slot="main"] img,
html.readit-active.readit-layout-slots [data-readit-slot="main"] video,
html.readit-active.readit-layout-slots [data-readit-slot="main"] canvas {
  max-width: 100% !important;
  height: auto !important;
  object-fit: contain !important;
}
html.readit-active.readit-layout-slots [data-readit-slot="main"] iframe,
html.readit-active.readit-layout-slots [data-readit-slot="main"] shreddit-player,
html.readit-active.readit-layout-slots [data-readit-slot="main"] [slot="post-media-container"] {
  max-width: 100% !important;
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
  display: block !important;
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
  container-type: inline-size !important;
  container-name: readit-rail !important;
}
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"],
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] *,
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] *::before,
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] *::after {
  overflow-wrap: normal !important;
  word-break: normal !important;
  word-wrap: normal !important;
  hyphens: none !important;
  writing-mode: horizontal-tb !important;
}
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] img,
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] video,
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] canvas,
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] iframe {
  max-width: 100% !important;
  height: auto !important;
  object-fit: contain !important;
}
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] h1,
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] h2,
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] h3,
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] button,
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] a,
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] p,
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] li,
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] span,
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] label {
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  max-width: 100% !important;
  min-width: 0 !important;
}
html.readit-active.readit-layout-slots.readit-rail-compact [data-readit-slot="rightRail"] {
  padding-inline: 6px !important;
  scrollbar-gutter: auto !important;
}
html.readit-active.readit-layout-slots.readit-rail-compact [data-readit-slot="rightRail"] * {
  max-width: 100% !important;
  box-sizing: border-box !important;
}
/* Multi-line titles: clamp instead of letter-stack or hard clip */
html.readit-active.readit-layout-slots.readit-rail-compact [data-readit-slot="rightRail"] h3,
html.readit-active.readit-layout-slots.readit-rail-compact [data-readit-slot="rightRail"] a[href*="/comments/"] {
  white-space: normal !important;
  display: -webkit-box !important;
  -webkit-box-orient: vertical !important;
  -webkit-line-clamp: 2 !important;
  overflow: hidden !important;
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
  const leftW = clampPanelWidth("leftNav", widths.leftNavPx);
  const rightW = clampPanelWidth("rightRail", widths.rightRailPx);
  const feedW = clampPanelWidth("main", feedWidthPx);
  const padL = clampPagePad(widths.pagePadLeftPx ?? 24);
  const padR = clampPagePad(widths.pagePadRightPx ?? 24);
  const gap = clampColumnGap(widths.columnGapPx ?? 12);

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
  pointer-events: auto;
  cursor: grab;
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
  border-style: dashed;
  border-width: 2px;
  border-color: var(--readit-accent);
  background: color-mix(in srgb, var(--readit-accent) 18%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--readit-accent) 40%, transparent);
}
html.readit-layout-edit .readit-layout-frame[data-dragging="1"] {
  opacity: 0.45;
  cursor: grabbing;
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
html.readit-layout-edit .readit-frame-select {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 2;
  pointer-events: auto;
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--readit-accent);
  cursor: pointer;
}
html.readit-layout-edit .readit-layout-frame[data-kind="separator"] .readit-frame-select {
  right: 28px;
}
html.readit-layout-edit .readit-frame-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 3;
  pointer-events: auto;
  width: 22px;
  height: 22px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 4px;
  font: 700 16px/1 ui-sans-serif, system-ui, sans-serif;
  color: #fff;
  background: color-mix(in srgb, #b91c1c 88%, #000);
  cursor: pointer;
}
html.readit-layout-edit .readit-frame-remove:hover {
  background: #dc2626;
}
html.readit-layout-edit .readit-layout-frame[data-selected="1"] {
  box-shadow: inset 0 0 0 2px var(--readit-accent);
  background: color-mix(in srgb, var(--readit-accent) 12%, transparent);
}
/* Block Reddit links/buttons under edit chrome so the whole card is draggable. */
html.readit-layout-edit [data-readit-slot],
html.readit-layout-edit [data-readit-slot] * {
  pointer-events: none !important;
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
html.readit-layout-edit .readit-col-resize[data-edge="left"]::after {
  left: auto;
  right: 4px;
}
html.readit-layout-edit .readit-col-resize[data-edge="left"]:hover::after,
html.readit-layout-edit .readit-col-resize[data-edge="left"][data-active="1"]::after {
  left: auto;
  right: 3.5px;
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
  } else if (preset === "dualLeft" || preset === "dualRight") {
    // dual* kept as stacking recipes (phase-1 permutation is the primary path)
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
  } else {
  parts.push(`/* readit-layout:columns ${order.join("|")} */`);

  const tracksList = buildLayoutTracks({
    columnOrder: order,
    separators: config.separators || [],
    placements,
  });
  const tracks = tracksList
    .map((t) =>
      t.type === "panel"
        ? panelTrack(t.panel, widths, feedW)
        : `${t.widthPx}px`,
    )
    .join(" ");

  parts.push(`html.readit-active.readit-layout-slots [data-readit-layout-shell] {
  display: grid !important;
  grid-template-columns: var(--readit-grid-cols, ${tracks || "minmax(0, 1fr)"}) !important;
  grid-template-rows: auto !important;
  grid-auto-flow: row !important;
  grid-auto-columns: unset !important;
  grid-auto-rows: auto !important;
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
  position: relative !important;
}
/* Flatten Reddit nesting so nav / feed / rail become peer grid items */
html.readit-active.readit-layout-slots [data-readit-layout-shell] > #subgrid-container,
html.readit-active.readit-layout-slots [data-readit-layout-shell] .main-container {
  display: contents !important;
}
/* Direct-child loaders: span the full grid so they don't steal a single track
   (which previously wrapped the layout onto a second row). Never use
   display:none (hides SPA subreddit content → stuck snoo) or display:contents
   on this custom element (Chromium collapses slotted children to 0×0). */
html.readit-active.readit-layout-slots [data-readit-layout-shell] > shreddit-async-loader {
  display: block !important;
  grid-column: 1 / -1 !important;
  grid-row: auto !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
}
/* Unknown shell peers (ads, drawers) — flatten so they don't add auto-columns */
html.readit-active.readit-layout-slots [data-readit-layout-shell] > :not([data-readit-slot]):not([data-readit-separator]):not(#subgrid-container):not(.main-container):not(shreddit-async-loader) {
  display: contents !important;
}
html.readit-active.readit-layout-slots [data-readit-layout-shell] #subgrid-container > :not([data-readit-slot]):not(.main-container):not(#main-content):not([id*="right-sidebar"]) {
  display: contents !important;
}
html.readit-active.readit-layout-slots [data-readit-separator] {
  display: block !important;
  grid-row: 1 !important;
  min-width: 0 !important;
  align-self: stretch !important;
  pointer-events: none !important;
  background: transparent !important;
}
/* Pending SPA restamp: don't force compact hide / sticky chrome on unstamped nav */
html.readit-active.readit-layout-slots.readit-layout-pending.readit-nav-compact #left-sidebar-container:not([data-readit-slot]),
html.readit-active.readit-layout-slots.readit-layout-pending #left-sidebar-container:not([data-readit-slot]) {
  position: sticky !important;
}`);

  tracksList.forEach((track, i) => {
    const col = i + 1;
    if (track.type === "panel") {
      parts.push(panelWidthRules(track.panel, col));
    } else {
      parts.push(`html.readit-active.readit-layout-slots [data-readit-separator="${track.id}"] {
  grid-column: ${col} !important;
  width: ${track.widthPx}px !important;
  max-width: ${track.widthPx}px !important;
}`);
    }
  });

  if (placements.leftNav === "hidden") parts.push(hide("leftNav"));
  if (placements.rightRail === "hidden") parts.push(hide("rightRail"));
  if (placements.subHeader === "hidden") parts.push(hide("subHeader"));
  }

  // Zoom — either global on shell, or per-panel (not both compounded).
  const zoomAll = clampZoom(config.zoomAll ?? 1);
  const panelZooms = config.zoomByPanel || {};
  const hasPanelZoom = (["leftNav", "main", "rightRail"] as const).some(
    (p) => typeof panelZooms[p] === "number",
  );
  if (!hasPanelZoom && zoomAll !== 1) {
    parts.push(`html.readit-active.readit-layout-slots [data-readit-layout-shell] {
  zoom: ${zoomAll};
}`);
  } else if (hasPanelZoom) {
    for (const panel of ["leftNav", "main", "rightRail"] as const) {
      const z = clampZoom(
        typeof panelZooms[panel] === "number" ? panelZooms[panel]! : zoomAll,
      );
      if (z === 1) continue;
      parts.push(`html.readit-active.readit-layout-slots [data-readit-slot="${panel}"] {
  zoom: ${z};
}`);
    }
  }

  parts.push(`html.readit-active {
  font-family: var(--readit-font-family, inherit);
}
html.readit-active.readit-layout-slots [data-readit-slot] {
  font-weight: var(--readit-font-weight, inherit);
}`);

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
    parts.push(`/* gutter themes */
html.readit-active.readit-layout-slots.readit-gutter-line [data-readit-layout-shell] {
  box-shadow:
    inset var(--readit-page-pad-left, 24px) 0 0 0 color-mix(in srgb, CanvasText 8%, transparent),
    inset calc(-1 * var(--readit-page-pad-right, 24px)) 0 0 0 color-mix(in srgb, CanvasText 8%, transparent);
}
html.readit-active.readit-layout-slots.readit-gutter-soft [data-readit-layout-shell] {
  background-image:
    linear-gradient(90deg, color-mix(in srgb, CanvasText 6%, transparent), transparent var(--readit-page-pad-left, 24px)),
    linear-gradient(270deg, color-mix(in srgb, CanvasText 6%, transparent), transparent var(--readit-page-pad-right, 24px));
  background-repeat: no-repeat;
}
html.readit-active.readit-layout-slots.readit-gutter-paper [data-readit-layout-shell] {
  background-image:
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 11px,
      color-mix(in srgb, CanvasText 5%, transparent) 12px
    );
  background-size: var(--readit-page-pad-left, 24px) 100%, var(--readit-page-pad-right, 24px) 100%;
  background-position: left top, right top;
  background-repeat: no-repeat;
}
html.readit-active.readit-layout-slots.readit-gutter-inset [data-readit-layout-shell] {
  box-shadow:
    inset 8px 0 16px -10px color-mix(in srgb, CanvasText 35%, transparent),
    inset -8px 0 16px -10px color-mix(in srgb, CanvasText 35%, transparent);
}`);
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
    if (cls.startsWith("readit-gutter-")) root.classList.remove(cls);
  }
  if (!settings.paused && settings.flags.layoutSlots) {
    const preset: LayoutPreset = settings.layoutSlots.preset;
    root.classList.add(`readit-layout-preset-${preset}`);
    root.dataset.readitLayout = preset;
    const gutter = settings.layoutSlots.gutterTheme || "plain";
    root.classList.add(`readit-gutter-${gutter}`);
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
    root.classList.remove("readit-nav-compact", "readit-rail-compact");
    return;
  }

  for (const [k, v] of Object.entries(tokensToCssVars(settings.knobs.tokens))) {
    root.style.setProperty(k, v);
  }
  if (settings.flags.layoutSlots) {
    const w = settings.layoutSlots.widths;
    const leftNavPx = clampPanelWidth("leftNav", w.leftNavPx);
    const rightRailPx = clampPanelWidth("rightRail", w.rightRailPx);
    const pagePadLeftPx = clampPagePad(w.pagePadLeftPx ?? 24);
    const pagePadRightPx = clampPagePad(w.pagePadRightPx ?? 24);
    const columnGapPx = clampColumnGap(w.columnGapPx ?? 12);
    const order = settings.layoutSlots.columnOrder;
    const visible = order.filter(
      (id) => settings.layoutSlots.placements[id] !== "hidden",
    );
    const feed = clampPanelWidth("main", settings.knobs.tokens.feedWidthPx);
    const tracks = visible
      .map((id) => {
        switch (id) {
          case "leftNav":
            return `${leftNavPx}px`;
          case "main":
            return `${feed}px`;
          case "rightRail":
            return `${rightRailPx}px`;
          default: {
            const _exhaustive: never = id;
            return _exhaustive;
          }
        }
      })
      .join(" ");
    root.style.setProperty("--readit-left-nav-width", `${leftNavPx}px`);
    root.style.setProperty("--readit-right-rail-width", `${rightRailPx}px`);
    root.style.setProperty("--readit-page-pad-left", `${pagePadLeftPx}px`);
    root.style.setProperty("--readit-page-pad-right", `${pagePadRightPx}px`);
    root.style.setProperty("--readit-column-gap", `${columnGapPx}px`);
    if (tracks) root.style.setProperty("--readit-grid-cols", tracks);
    // Compact/rail-compact classes are owned by layout-slots after the shell +
    // rail are stamped — setting them here (esp. from early.js) hides Reddit's
    // nav before #readit-nav-rail exists and malforms the page on load/SPA.
  } else {
    root.style.removeProperty("--readit-left-nav-width");
    root.style.removeProperty("--readit-right-rail-width");
    root.style.removeProperty("--readit-page-pad-left");
    root.style.removeProperty("--readit-page-pad-right");
    root.style.removeProperty("--readit-column-gap");
    root.style.removeProperty("--readit-grid-cols");
    root.classList.remove("readit-nav-compact", "readit-rail-compact");
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
