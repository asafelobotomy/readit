import type {
  CssTokens,
  HideNoise,
  LayoutPreset,
  LayoutSlotsConfig,
  LayoutZone,
  MediaMode,
  ReaditSettings,
} from "@readit/schema";

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
html.readit-active shreddit-app,
html.readit-active main,
html.readit-active [id="main-content"] {
  max-width: var(--readit-feed-width) !important;
  margin-inline: auto !important;
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
`;
}

function zoneOrder(zone: LayoutZone): number {
  switch (zone) {
    case "left":
    case "stackedLeft":
      return 1;
    case "center":
      return 2;
    case "right":
    case "stackedRight":
      return 3;
    case "hidden":
      return 99;
    default: {
      const _exhaustive: never = zone;
      return _exhaustive;
    }
  }
}

/** Marker comment included in stylesheet for smoke / tests. */
export const LAYOUT_RECIPE_MARKER = "/* readit-layout-recipe */";

function layoutSlotRecipes(config: LayoutSlotsConfig): string {
  const { placements, widths, preset } = config;
  const leftW = widths.leftNavPx;
  const rightW = widths.rightRailPx;

  const parts: string[] = [
    LAYOUT_RECIPE_MARKER,
    `html.readit-active.readit-layout-slots {
  --readit-left-nav-width: ${leftW}px;
  --readit-right-rail-width: ${rightW}px;
  --readit-card-border: 1px solid color-mix(in srgb, var(--readit-accent) 18%, transparent);
}`,
    /* Edit-mode outlines */
    `html.readit-layout-edit [data-readit-slot] {
  outline: 2px dashed color-mix(in srgb, var(--readit-accent) 70%, transparent);
  outline-offset: -2px;
}
html.readit-layout-edit [data-readit-slot]:hover {
  outline-color: var(--readit-accent);
  outline-style: solid;
}`,
  ];

  if (preset === "classic") {
    parts.push(`/* readit-layout:classic */`);
    parts.push(`html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] {
  width: var(--readit-left-nav-width) !important;
  max-width: var(--readit-left-nav-width) !important;
  flex: 0 0 var(--readit-left-nav-width) !important;
}
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] {
  width: var(--readit-right-rail-width) !important;
  max-width: var(--readit-right-rail-width) !important;
}`);
    return parts.join("\n\n");
  }

  parts.push(`/* readit-layout:${preset} */`);

  parts.push(`html.readit-active.readit-layout-slots [data-readit-layout-shell] {
  display: flex !important;
  flex-direction: row !important;
  align-items: flex-start !important;
  width: 100% !important;
}
html.readit-active.readit-layout-slots [data-readit-layout-shell] > #subgrid-container {
  display: flex !important;
  flex: 1 1 auto !important;
  min-width: 0 !important;
}`);

  const hide = (slot: string) =>
    `html.readit-active.readit-layout-slots [data-readit-slot="${slot}"] {
  display: none !important;
}`;

  if (placements.leftNav === "hidden") parts.push(hide("leftNav"));
  if (placements.rightRail === "hidden") parts.push(hide("rightRail"));
  if (placements.subHeader === "hidden") parts.push(hide("subHeader"));

  if (placements.leftNav !== "hidden") {
    parts.push(`html.readit-active.readit-layout-slots [data-readit-slot="leftNav"] {
  width: var(--readit-left-nav-width) !important;
  max-width: var(--readit-left-nav-width) !important;
  flex: 0 0 var(--readit-left-nav-width) !important;
  order: ${zoneOrder(placements.leftNav)} !important;
}`);
  }
  if (placements.rightRail !== "hidden") {
    parts.push(`html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] {
  width: var(--readit-right-rail-width) !important;
  max-width: var(--readit-right-rail-width) !important;
  flex: 0 0 var(--readit-right-rail-width) !important;
  order: ${zoneOrder(placements.rightRail)} !important;
}`);
  }

  parts.push(`html.readit-active.readit-layout-slots [data-readit-slot="main"],
html.readit-active.readit-layout-slots #main-content {
  order: ${zoneOrder(placements.main)} !important;
  flex: 1 1 auto !important;
  min-width: 0 !important;
}`);

  if (placements.subHeader !== "hidden") {
    parts.push(`html.readit-active.readit-layout-slots [data-readit-slot="subHeader"] {
  order: ${zoneOrder(placements.subHeader)} !important;
}`);
  }

  if (preset === "navRight") {
    parts.push(`html.readit-active.readit-layout-slots [data-readit-layout-shell] > [data-readit-slot="leftNav"] {
  order: 3 !important;
}
html.readit-active.readit-layout-slots [data-readit-layout-shell] > #subgrid-container {
  order: 1 !important;
  flex-direction: row-reverse !important;
}`);
  }

  if (preset === "dualLeft" || preset === "dualRight") {
    const stackSide = preset === "dualLeft" ? "flex-start" : "flex-end";
    parts.push(`html.readit-active.readit-layout-slots [data-readit-layout-shell] {
  flex-wrap: wrap !important;
  justify-content: ${stackSide} !important;
}
html.readit-active.readit-layout-slots [data-readit-slot="leftNav"],
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] {
  display: flex !important;
  flex-direction: column !important;
}
/* Fallback when dual stack can't share a column cleanly */
html.readit-active.readit-layout-slots.readit-layout-degraded [data-readit-slot="rightRail"] {
  position: sticky !important;
  top: 48px !important;
  max-height: calc(100vh - 64px) !important;
  overflow: auto !important;
}`);
    if (preset === "dualLeft") {
      parts.push(`html.readit-active.readit-layout-slots [data-readit-layout-shell] > [data-readit-slot="leftNav"] {
  order: 1 !important;
}
html.readit-active.readit-layout-slots [data-readit-layout-shell] > #subgrid-container {
  order: 2 !important;
  flex: 1 1 60% !important;
}
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] {
  order: 1 !important;
}`);
    } else {
      parts.push(`html.readit-active.readit-layout-slots [data-readit-layout-shell] > [data-readit-slot="leftNav"] {
  order: 3 !important;
}
html.readit-active.readit-layout-slots [data-readit-layout-shell] > #subgrid-container {
  order: 1 !important;
  flex: 1 1 60% !important;
}
html.readit-active.readit-layout-slots [data-readit-slot="rightRail"] {
  order: 3 !important;
}`);
    }
  }

  if (preset === "singleColumn") {
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
  }

  if (preset === "custom") {
    parts.push(`html.readit-active.readit-layout-slots [data-readit-layout-shell] > [data-readit-slot="leftNav"] {
  order: ${zoneOrder(placements.leftNav)} !important;
}
html.readit-active.readit-layout-slots [data-readit-layout-shell] > #subgrid-container {
  order: ${zoneOrder(placements.main)} !important;
}`);
  }

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
    parts.push(layoutSlotRecipes(settings.layoutSlots));
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
    return;
  }

  for (const [k, v] of Object.entries(tokensToCssVars(settings.knobs.tokens))) {
    root.style.setProperty(k, v);
  }
  if (settings.flags.layoutSlots) {
    root.style.setProperty(
      "--readit-left-nav-width",
      `${settings.layoutSlots.widths.leftNavPx}px`,
    );
    root.style.setProperty(
      "--readit-right-rail-width",
      `${settings.layoutSlots.widths.rightRailPx}px`,
    );
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
  );
  for (const cls of Array.from(root.classList)) {
    if (cls.startsWith("readit-layout-preset-")) root.classList.remove(cls);
  }
  delete root.dataset.readitLayout;
}
