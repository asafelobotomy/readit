import type { ReaditSettings } from "@readit/schema";
import { emitReadit } from "./bus.js";
import {
  allFeedUrl,
  commentSortFromMenuValue,
  isAllFeedPage,
  isAllHref,
  originalAttr,
  resolveCommentSort,
  restoreAllAttr,
  restoreAttr,
  stampAttr,
  subredditOfHref,
  withCommentSort,
} from "./link-stamp.js";
import { closePostPopout, listenForPopoutClicks } from "./post-popout.js";
import type { FeatureModule } from "./utils.js";
import { currentSubreddit, isModRoute } from "./utils.js";

/**
 * Old-Reddit habits on New Reddit: a sticky comment sort, posts in a new
 * tab, and an “All · Global” stand-in for the r/all Reddit removed. All
 * three retarget Reddit's own links (see link-stamp.ts) instead of
 * intercepting clicks, so Reddit's router, middle-click and mark-read keep
 * working unchanged.
 */

// —— Comment sort ——————————————————————————————————————————————

const THREAD_LINK_SELECTOR = 'a[href*="/comments/"]';

/** Settings the long-lived listeners below read; null while disabled. */
let sortSettings: ReaditSettings | null = null;
let sortListeners: Array<[string, (ev: Event) => void]> = [];

function stampSortLink(a: Element, settings: ReaditSettings): void {
  const original = originalAttr(a, "href");
  if (!original) return;
  const sub =
    a.closest("shreddit-post")?.getAttribute("subreddit-name") ||
    subredditOfHref(original);
  const next = withCommentSort(original, resolveCommentSort(settings, sub));
  if (next) stampAttr(a, "href", next);
  else restoreAttr(a, "href");
}

function linkFromEvent(ev: Event, selector: string): Element | null {
  for (const node of ev.composedPath()) {
    if (node instanceof Element && node.matches(selector)) return node;
  }
  return null;
}

/**
 * Safety net for links Reddit re-rendered after the last scan: re-stamp the
 * link the pointer (or Enter) is about to follow. Nothing is prevented.
 */
function onBeforeFollow(ev: Event): void {
  if (!sortSettings) return;
  if (ev instanceof KeyboardEvent && ev.key !== "Enter") return;
  const a = linkFromEvent(ev, THREAD_LINK_SELECTOR);
  if (a) stampSortLink(a, sortSettings);
}

/** Remember mode: a pick from Reddit's own comment sort menu. */
function onSortMenuClick(ev: Event): void {
  if (sortSettings?.commentSortPrefs.mode !== "remember") return;
  const path = ev.composedPath();
  const inMenu = path.some(
    (n) =>
      n instanceof Element &&
      n.matches('shreddit-sort-dropdown[telemetry-source="comment_sort"]'),
  );
  if (!inMenu) return;
  const option = path.find(
    (n): n is Element => n instanceof Element && n.localName === "data",
  );
  const sort = commentSortFromMenuValue(option?.getAttribute("value") ?? null);
  const subreddit = currentSubreddit(location.pathname);
  if (sort && subreddit) emitReadit("comment-sort-picked", { subreddit, sort });
}

export const commentSortFeature: FeatureModule = {
  id: "commentSort",
  tier: "simple",
  audience: ["reader", "creator", "moderator"],
  category: "reading",
  label: "Sticky comment sort",
  description:
    "Open threads in your comment sort (per subreddit, or the last one you picked).",
  apply(ctx) {
    if (!ctx.settings.flags.commentSort) return;
    sortSettings = ctx.settings;
    if (!sortListeners.length) {
      sortListeners = [
        ["pointerdown", onBeforeFollow],
        ["keydown", onBeforeFollow],
        ["click", onSortMenuClick],
      ];
      for (const [type, fn] of sortListeners) {
        document.addEventListener(type, fn, true);
      }
    }
    document
      .querySelectorAll(THREAD_LINK_SELECTOR)
      .forEach((a) => stampSortLink(a, ctx.settings));
  },
  teardown() {
    for (const [type, fn] of sortListeners) {
      document.removeEventListener(type, fn, true);
    }
    sortListeners = [];
    sortSettings = null;
    restoreAllAttr("href", document, (el) =>
      /\/comments\//.test(originalAttr(el, "href") ?? ""),
    );
  },
  health: () =>
    document.querySelector(THREAD_LINK_SELECTOR) ||
    /\/comments\//.test(location.pathname)
      ? "ok"
      : "degraded",
};

// —— Open in new tab ——————————————————————————————————————————————

const COMMUNITY_HREF_RE =
  /^(?:https?:\/\/(?:[a-z]+\.)?reddit\.com)?\/r\/[^/?#]+\/?(?:[?#].*)?$/i;
const USER_HREF_RE =
  /^(?:https?:\/\/(?:[a-z]+\.)?reddit\.com)?\/(?:u|user)\/[^/?#]+\/?(?:[?#].*)?$/i;

function setOrRestore(el: Element, attr: string, value: string, on: boolean): void {
  if (on) stampAttr(el, attr, value);
  else restoreAttr(el, attr);
}

export const openInNewTabFeature: FeatureModule = {
  id: "openInNewTab",
  tier: "simple",
  audience: ["reader", "creator", "moderator"],
  category: "reading",
  label: "Open in new tab / pop-out",
  description:
    "Open posts from feeds in a new tab or a pop-out over the feed (communities and users optional).",
  apply(ctx) {
    if (!ctx.settings.flags.openInNewTab) return;
    const prefs = ctx.settings.linkPrefs;
    const onThread = /\/comments\//.test(ctx.pathname);
    const offRoute =
      onThread || (isModRoute(ctx.pathname) && !prefs.inModQueue);
    const postsOn = prefs.posts && !offRoute;
    const newTab = postsOn && prefs.postsOpenIn === "tab";
    listenForPopoutClicks(postsOn && prefs.postsOpenIn === "popout");
    document.querySelectorAll("shreddit-post").forEach((post) => {
      if (post.closest("#readit-popout-host")) return;
      // Reddit's own switch: the card's click handler opens pdp-target.
      setOrRestore(post, "pdp-target", "_blank", newTab);
      post
        .querySelectorAll('a[slot="full-post-link"], a[slot="title"]')
        .forEach((a) => setOrRestore(a, "target", "_blank", newTab));
      post.querySelectorAll("a[href]").forEach((a) => {
        const href = originalAttr(a, "href") ?? "";
        if (COMMUNITY_HREF_RE.test(href)) {
          setOrRestore(a, "target", "_blank", prefs.communities && !offRoute);
        } else if (USER_HREF_RE.test(href)) {
          setOrRestore(a, "target", "_blank", prefs.users && !offRoute);
        }
      });
    });
  },
  teardown() {
    listenForPopoutClicks(false);
    closePostPopout();
    restoreAllAttr("pdp-target");
    restoreAllAttr("target");
  },
  health: () => "ok",
};

// —— All · Global ——————————————————————————————————————————————

const ALL_LINK_WRAP_CLASS = "readit-all-link-wrap";
const ALL_LINK_CLASS = "readit-all-link";
const ALL_LINK_LABEL = "All · Global";

/** Reddit's globe glyph is not in the page, so ship a 20×20 one. */
const GLOBE_PATH =
  "M10 1a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm6.93 8.25h-3.2a14.3 14.3 0 0 0-1.35-5.6 7.52 7.52 0 0 1 4.55 5.6ZM10 2.6c.8.9 2 3.1 2.23 6.65H7.77C8 5.7 9.2 3.5 10 2.6ZM7.62 3.65a14.3 14.3 0 0 0-1.35 5.6h-3.2a7.52 7.52 0 0 1 4.55-5.6Zm-4.55 7.1h3.2a14.3 14.3 0 0 0 1.35 5.6 7.52 7.52 0 0 1-4.55-5.6ZM10 17.4c-.8-.9-2-3.1-2.23-6.65h4.46C12 14.3 10.8 16.5 10 17.4Zm2.38-1.05a14.3 14.3 0 0 0 1.35-5.6h3.2a7.52 7.52 0 0 1-4.55 5.6Z";

const NAV_LINK_CLASSES =
  "flex justify-between relative px-md gap-xs text-secondary-plain hover:text-secondary-plain-hover active:bg-interactive-pressed hover:bg-neutral-background-hover hover:no-underline cursor-pointer py-2xs -outline-offset-1 s:rounded-2 no-underline";

function buildAllLink(href: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = ALL_LINK_WRAP_CLASS;
  const a = document.createElement("a");
  a.className = `${ALL_LINK_CLASS} ${NAV_LINK_CLASSES}`;
  a.href = href;
  a.title = "Global Popular — the closest thing to r/all on New Reddit";
  a.style.paddingInlineEnd = "16px";

  const row = document.createElement("span");
  row.className = "flex items-center gap-xs min-w-0 shrink";
  const iconBox = document.createElement("span");
  iconBox.className =
    "flex shrink-0 items-center justify-center h-xl w-xl text-20 leading-4";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", GLOBE_PATH);
  svg.appendChild(path);
  iconBox.appendChild(svg);
  const text = document.createElement("span");
  text.className = "flex flex-col justify-center min-w-0 shrink py-[var(--rem6)]";
  const label = document.createElement("span");
  label.className = "text-body-2";
  label.textContent = ALL_LINK_LABEL;
  text.appendChild(label);
  row.append(iconBox, text);
  a.appendChild(row);
  wrap.appendChild(a);
  return wrap;
}

function removeAllLink(): void {
  document.querySelectorAll(`.${ALL_LINK_WRAP_CLASS}`).forEach((el) => el.remove());
}

/**
 * Keep one link directly after Reddit's Home/Popular block. That block is a
 * Lit component with its own shadow root, so the link sits beside it in the
 * light DOM rather than inside Reddit's template (which would re-render it
 * away) — and where the nav rail's scrape can see it.
 */
function syncAllLink(href: string): boolean {
  const top = document.querySelector("left-nav-top-section");
  if (!top?.parentElement) {
    removeAllLink();
    return false;
  }
  let wrap = top.nextElementSibling;
  if (!wrap?.classList.contains(ALL_LINK_WRAP_CLASS)) {
    removeAllLink();
    wrap = buildAllLink(href);
    top.after(wrap);
  }
  const a = wrap.querySelector<HTMLAnchorElement>(`.${ALL_LINK_CLASS}`);
  if (!a) return false;
  if (a.getAttribute("href") !== href) a.setAttribute("href", href);
  const current = isAllFeedPage(location.href);
  a.classList.toggle("bg-neutral-background-selected", current);
  a.classList.toggle("bg-transparent", !current);
  if (current) a.setAttribute("aria-current", "page");
  else a.removeAttribute("aria-current");
  return true;
}

let allNavHealthy = true;

export const allFeedFeature: FeatureModule = {
  id: "allFeed",
  tier: "simple",
  audience: ["reader", "creator"],
  category: "feed",
  label: "All · Global",
  description:
    "Reddit removed r/all; link to global Popular instead and retarget /r/all links.",
  apply(ctx) {
    if (!ctx.settings.flags.allFeed) return;
    const prefs = ctx.settings.allFeedPrefs;
    const href = allFeedUrl(prefs.sort);
    // Stamped links no longer contain /r/all, so find them by their marker too.
    document
      .querySelectorAll('a[href*="/r/all"], a[data-readit-orig-href]')
      .forEach((a) => {
        if (a.closest(`.${ALL_LINK_WRAP_CLASS}`)) return;
        if (!isAllHref(originalAttr(a, "href") ?? "")) return;
        setOrRestore(a, "href", href, prefs.rewriteLinks);
      });
    if (prefs.navLink) allNavHealthy = syncAllLink(href);
    else {
      removeAllLink();
      allNavHealthy = true;
    }
  },
  teardown() {
    removeAllLink();
    allNavHealthy = true;
    restoreAllAttr("href", document, (el) =>
      isAllHref(originalAttr(el, "href") ?? ""),
    );
  },
  health: () => (allNavHealthy ? "ok" : "degraded"),
};
