// The pages a recording visits, in order. The smoke suites open these (see
// scripts/smoke-*.mjs); a replayed run reports any request the recording
// can't answer, which is the cue to add a page here.
//
// `scrolls` turns the feed to load more posts (Reddit fetches them as you
// scroll). A page with `pick` instead of `path` opens the link that picker
// chose on the page named in `from` — the same link a smoke suite clicks
// there, so the replay has the page the suite lands on. `count` records the
// picker's first few links: readit's own UI (nav rail, recents) can reorder
// what comes first once a suite has changed its settings.
// smoke-reddit's soft-nav check clicks the home page's Popular link, which is
// /r/popular/ below.
export const PAGES = [
  { slug: "home", path: "/", scrolls: 3 },
  { slug: "askreddit", path: "/r/AskReddit/", scrolls: 3 },
  { slug: "thread", from: "askreddit", pick: "busyThread" },
  { slug: "news", path: "/r/news/", scrolls: 1 },
  { slug: "pics", path: "/r/pics/", scrolls: 1 },
  { slug: "popular", path: "/r/popular/", scrolls: 1 },
  { slug: "all", path: "/r/all/", scrolls: 1 },
];

/**
 * Link pickers, run in the page right after it loads (before scrolling).
 * Each mirrors a smoke suite's own choice; keep them in step.
 */
export const PICKERS = {
  // smoke-reddit "Absolute timestamps on a post": the first non-stickied post
  // with 5+ comments, else the first comments link.
  busyThread: () => {
    const post = [...document.querySelectorAll("shreddit-post")].find(
      (p) => !p.hasAttribute("stickied") && Number(p.getAttribute("comment-count") || 0) >= 5,
    );
    const a =
      post?.querySelector('a[href*="/comments/"]') ||
      document.querySelector('a[href*="/comments/"]');
    return a ? [new URL(a.getAttribute("href"), location.origin).href] : [];
  },
};
