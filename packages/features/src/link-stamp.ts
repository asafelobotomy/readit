import type {
  AllFeedSort,
  CommentSort,
  ReaditSettings,
} from "@readit/schema";
import { CommentSortSchema, normalizeSubredditName } from "@readit/schema";

/**
 * Shared helpers for the features that retarget Reddit's own links
 * (commentSort, openInNewTab, allFeed). Each change is an attribute on
 * Reddit's element with the original kept beside it, so every feature can
 * restore exactly what it changed — and attribute writes never trigger the
 * content script's childList-only rescan.
 */

const ABSENT = "\u0000";

function origAttr(attr: string): string {
  return `data-readit-orig-${attr}`;
}

function setAttr(attr: string): string {
  return `data-readit-set-${attr}`;
}

/**
 * True when Reddit rewrote `attr` after readit stamped it (a re-render, or
 * an element reused for another post). The saved original is then stale and
 * must not be written back or used to derive a new value.
 */
function changedByReddit(el: Element, attr: string): boolean {
  return (
    el.hasAttribute(origAttr(attr)) &&
    el.getAttribute(attr) !== el.getAttribute(setAttr(attr))
  );
}

function forget(el: Element, attr: string): void {
  el.removeAttribute(origAttr(attr));
  el.removeAttribute(setAttr(attr));
}

/** Original value of `attr` before readit changed it (null = was absent). */
export function originalAttr(el: Element, attr: string): string | null {
  const saved = el.getAttribute(origAttr(attr));
  if (saved === null || changedByReddit(el, attr)) return el.getAttribute(attr);
  return saved === ABSENT ? null : saved;
}

/** Set `attr`, remembering the pre-readit value the first time. */
export function stampAttr(el: Element, attr: string, value: string): void {
  if (changedByReddit(el, attr)) forget(el, attr);
  if (!el.hasAttribute(origAttr(attr))) {
    el.setAttribute(origAttr(attr), el.getAttribute(attr) ?? ABSENT);
  }
  if (el.getAttribute(attr) !== value) el.setAttribute(attr, value);
  el.setAttribute(setAttr(attr), value);
}

/** Put `attr` back on one element and forget the saved original. */
export function restoreAttr(el: Element, attr: string): void {
  const saved = el.getAttribute(origAttr(attr));
  if (saved === null) return;
  if (!changedByReddit(el, attr)) {
    if (saved === ABSENT) el.removeAttribute(attr);
    else el.setAttribute(attr, saved);
  }
  forget(el, attr);
}

/** Restore `attr` on every element under `root` that readit stamped. */
export function restoreAllAttr(
  attr: string,
  root: ParentNode = document,
  filter: (el: Element) => boolean = () => true,
): void {
  root.querySelectorAll(`[${origAttr(attr)}]`).forEach((el) => {
    if (filter(el)) restoreAttr(el, attr);
  });
}

const REDDIT_HOST_RE = /(^|\.)reddit\.com$/i;

/** `/r/<sub>/comments/<id>[/<slug>]/` — a whole thread, not one comment. */
const THREAD_PATH_RE = /^\/r\/[^/]+\/comments\/[a-z0-9]+(?:\/[^/]*)?\/?$/i;

/** True for a reddit.com link to a whole comment thread. */
export function isThreadHref(href: string): boolean {
  try {
    const url = new URL(href, "https://www.reddit.com");
    return REDDIT_HOST_RE.test(url.hostname) && THREAD_PATH_RE.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * `href` with `?sort=<sort>` added when it points at a comment thread that
 * has no sort yet. Returns null when nothing should change: other pages,
 * single-comment permalinks (context views), off-site links, or a link that
 * already carries a sort. Keeps the relative/absolute form of the input.
 */
export function withCommentSort(
  href: string,
  sort: CommentSort,
  origin = "https://www.reddit.com",
): string | null {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }
  if (!REDDIT_HOST_RE.test(url.hostname)) return null;
  if (!THREAD_PATH_RE.test(url.pathname)) return null;
  if (url.searchParams.has("sort")) return null;
  url.searchParams.set("sort", sort);
  if (/^https?:\/\//i.test(href) || href.startsWith("//")) return url.toString();
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Map a value from Reddit's sort menu (`<data value="CONFIDENCE">`). */
export function commentSortFromMenuValue(value: string | null): CommentSort | null {
  const parsed = CommentSortSchema.safeParse(String(value ?? "").toLowerCase());
  return parsed.success ? parsed.data : null;
}

/**
 * Sort for threads in `subreddit`: that subreddit's override, then (in
 * remember mode) the last sort picked there, then the global default.
 */
export function resolveCommentSort(
  settings: Pick<ReaditSettings, "commentSortPrefs" | "subredditOverrides">,
  subreddit: string | null,
): CommentSort {
  const prefs = settings.commentSortPrefs;
  const sub = subreddit ? normalizeSubredditName(subreddit) : null;
  if (sub) {
    const override = settings.subredditOverrides.find(
      (o) => normalizeSubredditName(o.subreddit) === sub,
    )?.commentSort;
    if (override) return override;
    if (prefs.mode === "remember") {
      const remembered = prefs.remembered[sub];
      if (remembered) return remembered;
    }
  }
  return prefs.sort;
}

/** Subreddit a thread link belongs to, from its path. */
export function subredditOfHref(href: string): string | null {
  try {
    const url = new URL(href, "https://www.reddit.com");
    return url.pathname.match(/^\/r\/([^/]+)/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Record `sort` as `subreddit`'s remembered sort, newest last, capped to
 * `max` entries. Returns the same object when nothing changes.
 */
export function rememberCommentSort(
  remembered: Record<string, CommentSort>,
  subreddit: string,
  sort: CommentSort,
  max: number,
): Record<string, CommentSort> {
  const sub = normalizeSubredditName(subreddit);
  if (!sub) return remembered;
  const keys = Object.keys(remembered);
  if (remembered[sub] === sort && keys.at(-1) === sub) return remembered;
  const next: Record<string, CommentSort> = {};
  for (const key of keys) if (key !== sub) next[key] = remembered[key]!;
  next[sub] = sort;
  const all = Object.keys(next);
  for (const key of all.slice(0, Math.max(0, all.length - max))) delete next[key];
  return next;
}

/** Global Popular — the closest thing New Reddit still has to r/all. */
export function allFeedUrl(sort: AllFeedSort): string {
  return `/r/popular/${sort}/?geo_filter=global`;
}

/** True for links to /r/all (any sort), which Reddit now redirects home. */
export function isAllHref(href: string): boolean {
  try {
    const url = new URL(href, "https://www.reddit.com");
    if (!REDDIT_HOST_RE.test(url.hostname)) return false;
    return /^\/r\/all(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

/** True when the page is global Popular (the All · Global view). */
export function isAllFeedPage(href: string): boolean {
  try {
    const url = new URL(href, "https://www.reddit.com");
    return (
      /^\/r\/popular(?:\/|$)/i.test(url.pathname) &&
      (url.searchParams.get("geo_filter") || "").toLowerCase() === "global"
    );
  } catch {
    return false;
  }
}

/**
 * Where a directly loaded comment page (bookmark, another site, typed URL)
 * should go so it opens in the user's sort, or null to stay put. In-app
 * navigation never needs this: those links already carry the sort.
 */
export function directLoadCommentSortUrl(
  settings: Pick<
    ReaditSettings,
    "paused" | "flags" | "commentSortPrefs" | "subredditOverrides"
  >,
  href: string,
): string | null {
  if (settings.paused || !settings.flags.commentSort) return null;
  if (!settings.commentSortPrefs.applyOnDirectLoad) return null;
  return withCommentSort(
    href,
    resolveCommentSort(settings, subredditOfHref(href)),
  );
}
