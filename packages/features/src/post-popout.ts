import { isThreadHref } from "./link-stamp.js";

/**
 * Post pop-out: read a post — comments, replies, votes, sorting, everything
 * Reddit's own post page does — in a dialog over the feed, without leaving
 * it. The dialog frames Reddit's real post page (same origin, which Reddit's
 * `X-Frame-Options: SAMEORIGIN` allows) and hides that page's own header and
 * side columns, so nothing is re-implemented and the login carries over.
 */

export const POPOUT_HOST_ID = "readit-popout-host";

/**
 * Browser Back closes the pop-out. Opening it pushes a history entry for the
 * same URL, and popstate is routed through `window[POPSTATE_GUARD_KEY]`.
 * early.content registers that listener at document_start, ahead of
 * Reddit's router, so an event readit handles is stopped before Reddit
 * re-renders the feed for it. (Both content scripts share this isolated
 * world's `window`, which page scripts cannot see.)
 */
export const POPSTATE_GUARD_KEY = "__readitPopstateGuard";
/** Set by early.content once its document_start listener is in place. */
export const POPSTATE_EARLY_KEY = "__readitPopstateEarly";
/**
 * Reddit's router also watches the Navigation API's `navigate` event (and
 * intercepts it, which delays the commit). early.content stops that event
 * for readit's own push/replace (flagged while it runs) and for Back/Forward
 * steps onto or off a pop-out entry (keys listed here).
 */
export const POPOUT_PUSHING_KEY = "__readitPopoutPushing";
export const POPOUT_NAV_KEYS_KEY = "__readitPopoutNavKeys";

type NavigationLike = { currentEntry?: { key?: string } | null };

function sharedWindow(): Record<string, unknown> {
  return window as unknown as Record<string, unknown>;
}

function popoutNavKeys(): Set<string> {
  const w = sharedWindow();
  let keys = w[POPOUT_NAV_KEYS_KEY] as Set<string> | undefined;
  if (!keys) {
    keys = new Set();
    w[POPOUT_NAV_KEYS_KEY] = keys;
  }
  return keys;
}

/**
 * Key of the current session-history entry. Entries are tracked by Navigation
 * API key: `history.state` reads null in an extension's isolated world, even
 * for entries readit pushed itself.
 */
function currentKey(): string | null {
  return (
    (window as unknown as { navigation?: NavigationLike }).navigation?.currentEntry?.key ?? null
  );
}

/** Run readit's own history write without Reddit's router reacting to it. */
function ownHistoryWrite(write: () => void): string | null {
  const w = sharedWindow();
  w[POPOUT_PUSHING_KEY] = true;
  try {
    write();
  } finally {
    w[POPOUT_PUSHING_KEY] = false;
  }
  const key = currentKey();
  if (key) popoutNavKeys().add(key);
  return key;
}

/** Same URL, marked for anyone inspecting history; readit reads keys, not this. */
function entryState(): object {
  return { readitPopout: true };
}



/** Controls inside a post card that do their own thing — never a pop-out. */
const CARD_CONTROL_SELECTOR = [
  "button",
  '[role="button"]',
  "input",
  "textarea",
  "select",
  "label",
  "summary",
  "faceplate-dropdown-menu",
  "faceplate-hovercard",
  "shreddit-post-overflow-menu",
  "shreddit-player",
  "gallery-carousel",
].join(", ");

/** What the click-path helper needs from an element (real or test double). */
export type PathElement = {
  localName: string;
  matches(selector: string): boolean;
  getAttribute(name: string): string | null;
  querySelector?(selector: string): PathElement | null;
};

/**
 * The post a feed click should open in the pop-out, or null to let Reddit
 * handle it. Walks the click's composed path from the target out to its
 * `shreddit-post`: a thread link opens (with whatever sort it carries), any
 * other link or control is left alone, and a click on the card body opens
 * the card's own post.
 */
export function popoutHrefFromPath(path: readonly unknown[]): string | null {
  for (const node of path) {
    const el = node as Partial<PathElement> | null;
    if (!el || typeof el.matches !== "function" || !el.localName) continue;
    const e = el as PathElement;
    if (e.localName === "a") {
      const href = e.getAttribute("href") ?? "";
      if (e.getAttribute("target") === "_blank") return null;
      return isThreadHref(href) ? href : null;
    }
    if (e.matches(CARD_CONTROL_SELECTOR)) return null;
    if (e.localName === "shreddit-post") {
      const link = e.querySelector?.('a[slot="full-post-link"]');
      const href = link?.getAttribute("href") || e.getAttribute("permalink") || "";
      return isThreadHref(href) ? href : null;
    }
  }
  return null;
}

/**
 * CSS for the framed post page: drop Reddit's header, nav and right rail
 * (the dialog is the chrome now) and let the post use the freed width.
 * Grid names are from the live post page (2026-09-24).
 */
export const FRAMED_POST_CSS = `
reddit-header-large,
#left-sidebar-container,
#right-sidebar-container,
pdp-back-button {
  display: none !important;
}
shreddit-app {
  padding-top: 0 !important;
}
.grid-container {
  grid-template-columns: minmax(0, 1fr) !important;
}
#subgrid-container {
  grid-column: 1 / -1 !important;
  width: 100% !important;
  max-width: 940px !important;
  margin-inline: auto !important;
  padding-inline: 24px !important;
  padding-top: 12px !important;
}
.main-container {
  grid-template-columns: minmax(0, 1fr) !important;
}
`;

/** True when the framed page has a comment typed but not sent. */
export function hasCommentDraft(doc: Document): boolean {
  for (const el of doc.querySelectorAll<HTMLElement>(
    'comment-composer-host [contenteditable="true"], shreddit-composer [contenteditable="true"]',
  )) {
    if ((el.textContent ?? "").trim()) return true;
  }
  for (const host of doc.querySelectorAll("comment-composer-host faceplate-textarea-input")) {
    const area = host.shadowRoot?.querySelector("textarea");
    if (area?.value.trim()) return true;
  }
  return false;
}

/**
 * Element check that works across frames: nodes from the framed post page
 * come from the iframe's own realm, so `instanceof Element` is false there.
 */
function isElement(node: unknown): node is Element {
  return !!node && (node as Node).nodeType === 1;
}

// —— Dialog ————————————————————————————————————————————————————————

const DIALOG_CSS = `
:host { all: initial; }
.backdrop {
  position: fixed; inset: 0; z-index: 2147483000;
  display: grid; place-items: center;
  background: rgb(0 0 0 / 0.62);
  font: 14px/1.4 -apple-system, "Segoe UI", system-ui, sans-serif;
  animation: fade 120ms ease-out;
}
.panel {
  width: min(1040px, calc(100vw - 32px));
  height: calc(100vh - 32px);
  display: grid; grid-template-rows: auto 1fr;
  overflow: hidden;
  border-radius: 16px;
  background: var(--color-neutral-background, #0e1113);
  color: var(--color-neutral-content-strong, #eef1f3);
  border: 1px solid var(--color-neutral-border-weak, rgb(255 255 255 / 0.12));
  box-shadow: 0 24px 64px rgb(0 0 0 / 0.5);
  position: relative;
}
.bar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px 8px 12px;
  border-bottom: 1px solid var(--color-neutral-border-weak, rgb(255 255 255 / 0.12));
  min-width: 0;
}
.title { flex: 1; min-width: 0; display: grid; }
.sub { font-size: 12px; color: var(--color-neutral-content-weak, #8ba2ad); }
.t { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
button, a.btn {
  all: unset; box-sizing: border-box; cursor: pointer;
  height: 32px; min-width: 32px; padding: 0 10px;
  display: inline-grid; place-items: center;
  border-radius: 999px; font-size: 13px; font-weight: 600;
  color: var(--color-neutral-content-strong, #eef1f3);
  background: var(--color-neutral-background-container-strong, #21272a);
}
button:hover, a.btn:hover { background: var(--color-neutral-background-container-strong-hover, #2a3236); }
button:focus-visible, a.btn:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
button:disabled { opacity: 0.4; cursor: default; }
.close { font-size: 18px; padding: 0; }
.body { position: relative; min-height: 0; }
iframe { width: 100%; height: 100%; border: 0; display: block; background: inherit; }
.loading {
  position: absolute; inset: 0; display: grid; place-items: center;
  background: var(--color-neutral-background, #0e1113);
  color: var(--color-neutral-content-weak, #8ba2ad);
}
.loading[hidden], .confirm[hidden] { display: none; }
.confirm {
  position: absolute; left: 50%; bottom: 20px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 12px; border-radius: 12px;
  background: var(--color-neutral-background-container-strong, #21272a);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.4);
}
.confirm .danger { background: #d93a00; color: #fff; }
@keyframes fade { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .backdrop { animation: none; } }
@media (max-width: 640px) {
  .panel { width: 100vw; height: 100vh; border-radius: 0; }
  .newtab { display: none; }
}
`;

type Popout = {
  host: HTMLElement;
  frame: HTMLIFrameElement;
  postId: string | null;
  /** Path the frame was sent to; the cover lifts once that page is there. */
  expectPath: string;
  sub: HTMLElement;
  title: HTMLElement;
  openPage: HTMLAnchorElement;
  newTab: HTMLAnchorElement;
  prev: HTMLButtonElement;
  next: HTMLButtonElement;
  loading: HTMLElement;
  confirm: HTMLElement;
  pending: (() => void) | null;
  timer: number;
  restoreOverflow: string;
  restoreFocus: Element | null;
  /** Whether the frame has been navigated once (later loads replace). */
  navigated: boolean;
};

let current: Popout | null = null;
let feedListening = false;

/** Key of the history entry the open pop-out owns. */
let entryKey: string | null = null;
/** Post shown by each pop-out entry, so Forward can open it again. */
const entryHrefs = new Map<string, string>();
/** Set while stepping history back off a closed pop-out's entry. */
let rewindKey: string | null = null;
let rewindTimer = 0;

function onOwnEntry(): boolean {
  return !!entryKey && currentKey() === entryKey;
}

/** Step back off the pop-out's entry (retrying past framed-page entries). */
function rewind(key: string, tries = 0): void {
  rewindKey = key;
  window.clearTimeout(rewindTimer);
  history.back();
  rewindTimer = window.setTimeout(() => {
    if (rewindKey !== key) return;
    if (currentKey() === key && tries < 8) rewind(key, tries + 1);
    else rewindKey = null;
  }, 400);
}

/** Put the feed back where it was once the browser's own scroll restore ran. */
function keepScroll(): void {
  const y = window.scrollY;
  const put = () => {
    if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
  };
  window.setTimeout(put, 0);
  window.setTimeout(put, 60);
}

export function isPopoutOpen(): boolean {
  return current !== null;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

function feedPosts(): Element[] {
  return [...document.querySelectorAll("shreddit-post")].filter(
    (p) => !p.closest(`#${POPOUT_HOST_ID}`),
  );
}

function postById(id: string | null): Element | null {
  if (!id) return null;
  return feedPosts().find((p) => p.getAttribute("id") === id) ?? null;
}

/** The feed post before/after the one showing, if it is still on the page. */
function neighbour(step: -1 | 1): Element | null {
  const posts = feedPosts();
  const at = posts.findIndex((p) => p.getAttribute("id") === current?.postId);
  if (at < 0) return null;
  return posts[at + step] ?? null;
}

function hrefForPost(post: Element): string | null {
  return popoutHrefFromPath([post]);
}

function frameDoc(): Document | null {
  try {
    return current?.frame.contentDocument ?? null;
  } catch {
    return null;
  }
}

/** Run `action` now, or after the user confirms dropping an unsent comment. */
function guardDraft(action: () => void): void {
  if (!current) return;
  const doc = frameDoc();
  if (doc && hasCommentDraft(doc)) {
    current.pending = action;
    current.confirm.hidden = false;
    current.confirm.querySelector<HTMLButtonElement>(".keep")?.focus();
    return;
  }
  action();
}

function syncHeader(post: Element | null): void {
  if (!current) return;
  const doc = frameDoc();
  const framedUrl = (() => {
    try {
      const href = current.frame.contentWindow?.location.href;
      return href && href !== "about:blank" ? href : null;
    } catch {
      return null;
    }
  })();
  if (framedUrl) {
    current.openPage.href = framedUrl;
    current.newTab.href = framedUrl;
  }
  const title =
    post?.getAttribute("post-title") ||
    doc?.querySelector("shreddit-post")?.getAttribute("post-title") ||
    doc?.title.replace(/\s*:\s*r\/[^:]+$/, "") ||
    "";
  const sub =
    post?.getAttribute("subreddit-prefixed-name") ||
    doc?.querySelector("shreddit-post")?.getAttribute("subreddit-prefixed-name") ||
    "";
  if (title && current.title.textContent !== title) current.title.textContent = title;
  if (current.sub.textContent !== sub) current.sub.textContent = sub;
  current.prev.disabled = !neighbour(-1);
  current.next.disabled = !neighbour(1);
}

/**
 * Wire the framed post page: hide its chrome, route Esc/back/links. Runs as
 * soon as the page's head exists (polled) — the frame's `load` event waits
 * for every ad and image, long after the post is readable.
 */
function prepareFrame(): void {
  const doc = frameDoc();
  if (!current || !doc || doc.URL === "about:blank" || !doc.documentElement) return;
  if (!doc.getElementById("readit-popout-framed")) {
    const style = doc.createElement("style");
    style.id = "readit-popout-framed";
    style.textContent = FRAMED_POST_CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  // Keep the cover up until the requested post's app shell is there to show
  // (right after next/previous the old post's document is still in place).
  if (
    !current.loading.hidden &&
    new URL(doc.URL).pathname === current.expectPath &&
    doc.querySelector("shreddit-app")
  ) {
    current.loading.hidden = true;
  }
  if ((doc as Document & { __readitPopout?: boolean }).__readitPopout) return;
  (doc as Document & { __readitPopout?: boolean }).__readitPopout = true;

  doc.addEventListener("keydown", onKeydown, true);
  doc.addEventListener(
    "click",
    (ev) => {
      const path = ev.composedPath();
      // Reddit's back arrow would walk the tab's history — close instead.
      if (path.some((n) => isElement(n) && n.localName === "pdp-back-button")) {
        ev.preventDefault();
        ev.stopPropagation();
        requestClosePostPopout();
        return;
      }
      if (ev.defaultPrevented || ev.button !== 0) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const link = path.find(
        (n): n is HTMLAnchorElement => isElement(n) && n.localName === "a",
      );
      const href = link?.getAttribute("href");
      if (!link || !href || link.target === "_blank" || href.startsWith("#")) return;
      let url: URL;
      try {
        url = new URL(href, doc.baseURI);
      } catch {
        return;
      }
      if (url.origin !== location.origin || isThreadHref(url.href)) return;
      // A community, profile or search page: show it in the tab, not in here.
      ev.preventDefault();
      ev.stopPropagation();
      guardDraft(() => leaveTo(url.href));
    },
    true,
  );
  syncHeader(postById(current.postId));
  try {
    current.frame.contentWindow?.focus();
  } catch {
    /* focus stays on the dialog */
  }
}

function onKeydown(ev: KeyboardEvent): void {
  if (!current || ev.key !== "Escape" || ev.defaultPrevented) return;
  if (!current.confirm.hidden) {
    current.confirm.hidden = true;
    current.pending = null;
    ev.preventDefault();
    return;
  }
  const target = ev.composedPath()[0];
  // Esc inside Reddit's composer or a menu belongs to Reddit.
  if (
    isElement(target) &&
    (target.closest('[contenteditable="true"], textarea, input, [role="menu"]') ||
      (target as HTMLElement).isContentEditable)
  ) {
    return;
  }
  ev.preventDefault();
  requestClosePostPopout();
}

function show(post: Element | null, href: string, updateEntry = false): void {
  if (!current) return;
  current.postId = post?.getAttribute("id") ?? null;
  current.loading.hidden = false;
  current.title.textContent = post?.getAttribute("post-title") ?? "";
  current.sub.textContent = post?.getAttribute("subreddit-prefixed-name") ?? "";
  const abs = new URL(href, location.origin).href;
  current.expectPath = new URL(abs).pathname;
  current.openPage.href = abs;
  current.newTab.href = abs;
  if (current.navigated) {
    // replace(): stepping to another post must not add a Back step.
    try {
      current.frame.contentWindow?.location.replace(abs);
    } catch {
      current.frame.src = abs;
    }
  } else {
    current.navigated = true;
    current.frame.src = abs;
  }
  // Next/previous: Forward onto this entry later should open the new post.
  if (updateEntry && onOwnEntry()) entryHrefs.set(entryKey!, abs);
  // Keep the feed underneath lined up with what's open, so closing lands there.
  post?.scrollIntoView({ block: "center" });
  syncHeader(post);
}

function step(dir: -1 | 1): void {
  const post = neighbour(dir);
  const href = post && hrefForPost(post);
  if (!post || !href) return;
  guardDraft(() => show(post, href, true));
}

/** Open `href` (a thread) in the pop-out; `post` is its feed card, if any. */
export function openPostPopout(href: string, post: Element | null = null): void {
  if (current) {
    guardDraft(() => show(post, href, true));
    return;
  }
  // Without the Navigation API there is no reliable entry key: skip the
  // history entry (Back then leaves the page, as before).
  const key = currentKey()
    ? ownHistoryWrite(() => history.pushState(entryState(), "", location.href))
    : null;
  if (key) entryHrefs.set(key, new URL(href, location.origin).href);
  buildPopout(href, post, key);
}

function buildPopout(href: string, post: Element | null, key: string | null): void {
  entryKey = key;
  installPopstateGuard();
  const host = el("div", { id: POPOUT_HOST_ID });
  const root = host.attachShadow({ mode: "open" });
  const style = el("style");
  style.textContent = DIALOG_CSS;

  const backdrop = el("div", { class: "backdrop" });
  const panel = el("div", {
    class: "panel",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": "Post",
  });
  const bar = el("div", { class: "bar" });
  const prev = el("button", { type: "button", title: "Previous post", "aria-label": "Previous post" }, "‹");
  const next = el("button", { type: "button", title: "Next post", "aria-label": "Next post" }, "›");
  const titleBox = el("div", { class: "title" });
  const sub = el("span", { class: "sub" });
  const title = el("span", { class: "t" });
  titleBox.append(sub, title);
  const openPage = el("a", { class: "btn", title: "Open this post as a page" }, "Open page");
  const newTab = el("a", { class: "btn newtab", target: "_blank", rel: "noopener" }, "New tab");
  const close = el("button", { type: "button", class: "close", title: "Close (Esc)", "aria-label": "Close" }, "×");
  bar.append(prev, next, titleBox, openPage, newTab, close);

  const body = el("div", { class: "body" });
  const loading = el("div", { class: "loading" }, "Loading post…");
  const frame = el("iframe", { title: "Post" });
  const confirm = el("div", { class: "confirm", hidden: "", role: "alertdialog" });
  confirm.append(
    el("span", {}, "You have an unsent comment."),
    el("button", { type: "button", class: "danger discard" }, "Discard"),
    el("button", { type: "button", class: "keep" }, "Keep writing"),
  );
  body.append(frame, loading, confirm);
  panel.append(bar, body);
  backdrop.append(panel);
  root.append(style, backdrop);

  current = {
    host,
    frame,
    postId: null,
    expectPath: "",
    sub,
    title,
    openPage,
    newTab,
    prev,
    next,
    loading,
    confirm,
    pending: null,
    timer: 0,
    restoreOverflow: document.documentElement.style.overflow,
    restoreFocus: document.activeElement,
    navigated: false,
  };

  backdrop.addEventListener("click", (ev) => {
    if (ev.target === backdrop) requestClosePostPopout();
  });
  close.addEventListener("click", () => requestClosePostPopout());
  prev.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));
  openPage.addEventListener("click", (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
    ev.preventDefault();
    const url = openPage.href;
    guardDraft(() => leaveTo(url));
  });
  confirm.querySelector(".discard")?.addEventListener("click", () => {
    const action = current?.pending;
    if (!current || !action) return;
    current.pending = null;
    current.confirm.hidden = true;
    action();
  });
  confirm.querySelector(".keep")?.addEventListener("click", () => {
    if (!current) return;
    current.pending = null;
    current.confirm.hidden = true;
    try {
      current.frame.contentWindow?.focus();
    } catch {
      /* ignore */
    }
  });
  frame.addEventListener("load", prepareFrame);
  document.addEventListener("keydown", onKeydown, true);

  document.documentElement.style.overflow = "hidden";
  document.documentElement.appendChild(host);
  let ticks = 0;
  current.timer = window.setInterval(() => {
    prepareFrame();
    if (++ticks % 5 === 0) syncHeader(postById(current?.postId ?? null));
  }, 200);
  show(post, href);
  close.focus();
}

/** Take the dialog down; history is the caller's business. */
function dismiss(): void {
  if (!current) return;
  const { host, timer, restoreOverflow, restoreFocus } = current;
  current = null;
  window.clearInterval(timer);
  document.removeEventListener("keydown", onKeydown, true);
  document.documentElement.style.overflow = restoreOverflow;
  host.remove();
  if (restoreFocus instanceof HTMLElement && restoreFocus.isConnected) {
    restoreFocus.focus({ preventScroll: true });
  }
}

/**
 * Close now, even with an unsent comment (also used on teardown), and step
 * back off the pop-out's history entry so Back keeps meaning “the page
 * before this feed”.
 */
export function closePostPopout(): void {
  if (!current) return;
  const key = onOwnEntry() ? entryKey : null;
  dismiss();
  entryKey = null;
  if (key) rewind(key);
}

/** Close, asking first if a comment would be lost. */
export function requestClosePostPopout(): void {
  guardDraft(closePostPopout);
}

/** Leave for another page; it takes the pop-out entry's place in history. */
function leaveTo(url: string): void {
  const own = onOwnEntry();
  dismiss();
  entryKey = null;
  if (own) location.replace(url);
  else location.assign(url);
}

/**
 * popstate handling; true = readit handled it (Reddit's router must not
 * see it). Back from an open pop-out closes it — or, with an unsent
 * comment, puts the entry back and asks first. Forward onto a closed
 * pop-out's entry opens that post again.
 */
export function onPopoutPopstate(): boolean {
  const here = currentKey();
  if (rewindKey) {
    if (here === rewindKey) return true; // the retry timer steps again
    rewindKey = null;
    window.clearTimeout(rewindTimer);
    keepScroll();
    return true; // back on the feed entry: Reddit already shows it
  }
  if (current) {
    if (here && here === entryKey) return true;
    keepScroll();
    const doc = frameDoc();
    if (doc && hasCommentDraft(doc)) {
      // Back would lose the comment: put the entry back and ask.
      const key = ownHistoryWrite(() => history.pushState(entryState(), "", location.href));
      if (key) entryHrefs.set(key, current.openPage.href);
      entryKey = key;
      guardDraft(closePostPopout);
      return true;
    }
    dismiss();
    entryKey = null;
    return true;
  }
  const href = here ? entryHrefs.get(here) : undefined;
  if (href) {
    keepScroll();
    if (feedListening && isThreadHref(href)) buildPopout(href, null, here);
    return true;
  }
  return false;
}

function onPopstateFallback(ev: PopStateEvent): void {
  if (onPopoutPopstate()) ev.stopImmediatePropagation();
}

let fallbackInstalled = false;

/**
 * Publish the guard for early.content's listener. If that listener isn't
 * there (readit reloaded without a page reload), listen here instead —
 * after Reddit's router, so it may also react, but Back still closes.
 */
function installPopstateGuard(): void {
  const w = window as unknown as Record<string, unknown>;
  w[POPSTATE_GUARD_KEY] = onPopoutPopstate;
  if (!w[POPSTATE_EARLY_KEY] && !fallbackInstalled) {
    fallbackInstalled = true;
    window.addEventListener("popstate", onPopstateFallback, true);
  }
}

// —— Feed click → pop-out ——————————————————————————————————————————————

function onFeedClick(ev: MouseEvent): void {
  if (ev.defaultPrevented || ev.button !== 0) return;
  if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  const path = ev.composedPath();
  if (path.some((n) => isElement(n) && n.id === POPOUT_HOST_ID)) return;
  const href = popoutHrefFromPath(path);
  if (!href) return;
  const post =
    path.find((n): n is Element => isElement(n) && n.localName === "shreddit-post") ?? null;
  // stopPropagation (not stopImmediate): mark-read's document listener still sees it.
  ev.preventDefault();
  ev.stopPropagation();
  openPostPopout(href, post);
}

/** Route plain left-clicks on feed posts into the pop-out. */
export function listenForPopoutClicks(on: boolean): void {
  if (on) installPopstateGuard();
  if (on === feedListening) return;
  feedListening = on;
  if (on) document.addEventListener("click", onFeedClick, true);
  else document.removeEventListener("click", onFeedClick, true);
}
