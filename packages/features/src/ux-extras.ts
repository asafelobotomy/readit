import { effectiveMarkReadMode } from "@readit/schema";
import type { FeatureContext, FeatureModule } from "./utils.js";
import { clearMarks, isProcessed, markProcessed } from "./utils.js";

export const MARK_READ_MAX_VISITED = 400;

/** Union of two histories (oldest first), `newer` ordered last, capped to the newest entries. */
export function mergeVisited(
  older: readonly string[],
  newer: readonly string[],
): string[] {
  const set = new Set<string>();
  for (const key of [...older, ...newer]) {
    set.delete(key);
    set.add(key);
  }
  return [...set].slice(-MARK_READ_MAX_VISITED);
}

/** In-memory history for this tab, seeded once from the host's store. */
let visited: Set<string> | null = null;

function visitedSet(ctx: FeatureContext): Set<string> {
  if (!visited) {
    visited = new Set(
      (ctx.visitedPosts?.initial ?? []).slice(-MARK_READ_MAX_VISITED),
    );
  }
  return visited;
}

export function rememberVisited(ctx: FeatureContext, key: string): void {
  const set = visitedSet(ctx);
  // Already the newest entry: nothing changes. On a comments page apply()
  // re-remembers the current post on every DOM-mutation scan, which used to
  // rewrite the whole history to storage each time.
  if ([...set].at(-1) === key) return;
  // Re-insert so recently seen posts are evicted last.
  set.delete(key);
  set.add(key);
  while (set.size > MARK_READ_MAX_VISITED) {
    set.delete(set.values().next().value as string);
  }
  ctx.visitedPosts?.save([...set]);
}

function postKey(post: Element): string | null {
  const permalink =
    post.getAttribute("permalink") ||
    post.getAttribute("content-href") ||
    post.querySelector('a[href*="/comments/"]')?.getAttribute("href");
  if (!permalink) return null;
  try {
    const u = new URL(permalink, location.origin);
    return u.pathname.replace(/\/$/, "");
  } catch {
    return permalink;
  }
}

function applyDim(post: HTMLElement, opacity: number): void {
  post.style.opacity = String(opacity);
  post.dataset.readitVisited = "1";
}

type MarkReadLive = {
  ctx: FeatureContext;
  mode: "open" | "onScroll";
  opacity: number;
};

/** Current settings for the long-lived listener/observer below. */
let markReadLive: MarkReadLive | null = null;
let markReadClick: ((ev: Event) => void) | null = null;
let markReadIo: IntersectionObserver | null = null;
let markReadObserved = new WeakSet<Element>();

const POST_LINK_SELECTOR = 'a[href*="/comments/"], a[slot="title"]';

function stampVisited(post: Element): void {
  if (!markReadLive) return;
  const key = postKey(post);
  if (!key) return;
  rememberVisited(markReadLive.ctx, key);
  applyDim(post as HTMLElement, markReadLive.opacity);
}

/**
 * One delegated listener for "open" mode. Per-post listeners used to be
 * added on every enable (duplicates after off → on) and were never removed,
 * so they kept stamping after switching to "on scroll".
 */
function onPostLinkClick(ev: Event): void {
  if (markReadLive?.mode !== "open") return;
  const path = ev.composedPath();
  const link = path.find(
    (n): n is Element => n instanceof Element && n.matches(POST_LINK_SELECTOR),
  );
  if (!link) return;
  const post = path.find(
    (n): n is Element => n instanceof Element && n.localName === "shreddit-post",
  );
  if (post) stampVisited(post);
}

function stopMarkReadObserver(): void {
  markReadIo?.disconnect();
  markReadIo = null;
  markReadObserved = new WeakSet();
}

export const markReadFeature: FeatureModule = {
  id: "markRead",
  tier: "advanced",
  audience: ["reader", "creator", "moderator"],
  category: "reading",
  label: "Mark read / dim visited",
  description: "Dim posts you have opened or scrolled past.",
  apply(ctx) {
    if (!ctx.settings.flags.markRead) return;
    const prefs = ctx.settings.markReadPrefs;
    const mode = effectiveMarkReadMode(prefs.mode);
    markReadLive = { ctx, mode, opacity: prefs.dimOpacity };
    const visited = visitedSet(ctx);
    const posts = document.querySelectorAll("shreddit-post");

    posts.forEach((post) => {
      const key = postKey(post);
      if (key && visited.has(key)) applyDim(post as HTMLElement, prefs.dimOpacity);
    });

    if (mode === "open" && !markReadClick) {
      markReadClick = onPostLinkClick;
      document.addEventListener("click", markReadClick, true);
    }

    if (mode === "onScroll") {
      // One observer for the page; only newly rendered posts get observed
      // (it used to be rebuilt over every post on each DOM-mutation scan).
      markReadIo ??= new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
              stampVisited(entry.target);
            }
          }
        },
        { threshold: [0.55] },
      );
      posts.forEach((p) => {
        if (markReadObserved.has(p)) return;
        markReadObserved.add(p);
        markReadIo!.observe(p);
      });
    } else {
      stopMarkReadObserver();
    }

    if (/\/comments\//.test(location.pathname)) {
      rememberVisited(ctx, location.pathname.replace(/\/$/, ""));
    }
  },
  teardown() {
    if (markReadClick) {
      document.removeEventListener("click", markReadClick, true);
      markReadClick = null;
    }
    stopMarkReadObserver();
    markReadLive = null;
    document.querySelectorAll("[data-readit-visited]").forEach((el) => {
      (el as HTMLElement).style.opacity = "";
      delete (el as HTMLElement).dataset.readitVisited;
    });
  },
  health: () =>
    document.querySelector("shreddit-post") || /\/comments\//.test(location.pathname)
      ? "ok"
      : "degraded",
};

export const antiRefreshFeature: FeatureModule = {
  id: "antiRefresh",
  tier: "advanced",
  audience: ["reader", "creator"],
  category: "reading",
  label: "Disable home auto-refresh",
  description: "Hide “new posts” refresh chips that yank the feed.",
  apply(ctx) {
    if (!ctx.settings.flags.antiRefresh) return;
    document.documentElement.classList.add("readit-anti-refresh");
  },
  teardown() {
    document.documentElement.classList.remove("readit-anti-refresh");
  },
  health: () => "ok",
};

/**
 * Whole-word "format"/"formatting" only. The old `aria-label*="Format" i`
 * substring match also hit "Information" (and "Transformation"), so any collapsed
 * "More information" disclosure on the page got auto-clicked open.
 */
export function isFormattingToggleLabel(label: string | null | undefined): boolean {
  return /\bformat(?:ting)?\b/i.test(String(label ?? ""));
}

/** Reddit's comment composers: the rich editor, or its plain-text fallback. */
const QUOTE_COMPOSER_SELECTOR =
  'shreddit-composer [contenteditable="true"], shreddit-composer textarea';

/**
 * A comment's text as quote paragraphs (each a list of lines): lines trimmed,
 * whitespace-only lines treated as paragraph breaks.
 */
export function quoteParagraphs(text: string): string[][] {
  const paras: string[][] = [[]];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (line) paras[paras.length - 1]!.push(line);
    else if (paras[paras.length - 1]!.length) paras.push([]);
  }
  return paras.filter((p) => p.length);
}

/** Markdown blockquote (markdown editor, clipboard fallback). */
export function quoteMarkdown(text: string): string {
  return quoteParagraphs(text)
    .map((p) => p.map((l) => `> ${l}`).join("\n"))
    .join("\n>\n");
}

/**
 * Paste a real blockquote into Reddit's rich-text editor (Lexical). Text
 * inserted there is taken literally — a `>` posts as a character and line
 * breaks are dropped — but Lexical turns pasted HTML into quote blocks.
 * Resolves false when the editor ignored the paste. Lexical applies it on
 * its next update, so the check waits a frame.
 */
async function pasteQuote(
  editor: HTMLElement,
  paras: string[][],
  markdown: string,
): Promise<boolean> {
  const html = document.createElement("div");
  const quote = document.createElement("blockquote");
  for (const lines of paras) {
    const p = document.createElement("p");
    lines.forEach((line, i) => {
      if (i) p.append(document.createElement("br"));
      p.append(line);
    });
    quote.append(p);
  }
  const after = document.createElement("p");
  after.append(document.createElement("br"));
  html.append(quote, after);
  const before = editor.innerHTML;
  const data = new DataTransfer();
  data.setData("text/html", html.innerHTML);
  data.setData("text/plain", `${markdown}\n\n`);
  editor.focus();
  editor.dispatchEvent(
    new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
  );
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  return editor.innerHTML !== before;
}

type ComposerLike = { closest: (selector: string) => unknown };

/**
 * Where a comment's Quote goes: that comment's own open reply box, else the
 * post's top-level composer. Taking the first composer on the page put the
 * quote in the post composer even while a reply box was open, and a nested
 * reply's box belongs to that reply, not to the comment being quoted.
 */
export function pickQuoteComposer<T extends ComposerLike>(
  composers: readonly T[],
  comment: unknown,
): T | null {
  return (
    composers.find((c) => c.closest("shreddit-comment") === comment) ??
    composers.find((c) => !c.closest("shreddit-comment")) ??
    null
  );
}

export const commentUxFeature: FeatureModule = {
  id: "commentUx",
  tier: "advanced",
  audience: ["creator", "moderator", "reader"],
  category: "create",
  label: "Comment UX",
  description: "Quote selection into the composer; expand formatting controls.",
  apply(ctx) {
    if (!ctx.settings.flags.commentUx) return;
    const prefs = ctx.settings.commentUxPrefs;

    if (prefs.showFormatting) {
      document
        .querySelectorAll(
          'button[aria-label*="format" i], [data-testid="format-button"]',
        )
        .forEach((btn) => {
          if (isProcessed(btn, "commentUxFmt")) return;
          if (
            btn.getAttribute("data-testid") !== "format-button" &&
            !isFormattingToggleLabel(btn.getAttribute("aria-label"))
          ) {
            return;
          }
          const expanded = btn.getAttribute("aria-expanded");
          if (expanded === "false") {
            try {
              (btn as HTMLElement).click();
            } catch {
              /* ignore */
            }
          }
          markProcessed(btn, "commentUxFmt");
        });
    }

    if (!prefs.quoteButton) return;

    document.querySelectorAll("shreddit-comment").forEach((comment) => {
      if (isProcessed(comment, "commentUxQuote")) return;
      const actions =
        comment.querySelector('[slot="actionRow"], [data-testid="comment-action-row"]') ||
        comment;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "readit-quote-btn";
      btn.textContent = "Quote";
      btn.title = "Quote into composer";
      // Own the text box: Reddit's action row would otherwise lend it
      // nowrap / hidden overflow and a fixed height that clips the label.
      btn.style.cssText =
        "margin-left:6px;font-size:11px;line-height:1.3;padding:2px 6px;height:auto;min-height:0;white-space:normal;overflow:visible;text-overflow:clip;border:1px solid #555;border-radius:4px;background:#222;color:#eee;cursor:pointer;";
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const bodyEl = comment.querySelector<HTMLElement>(
          '[id*="-post-rtjson-content"], .md, [slot="comment"]',
        );
        // innerText keeps paragraph breaks; textContent ran them together
        // with the markup's indentation.
        const text = bodyEl?.innerText || bodyEl?.textContent || "";
        const quote = quoteMarkdown(text);
        if (!quote) return;
        const composer = pickQuoteComposer(
          [...document.querySelectorAll<HTMLElement>(QUOTE_COMPOSER_SELECTOR)],
          comment,
        );
        if (composer) {
          if (composer instanceof HTMLTextAreaElement) {
            composer.value = `${composer.value}${composer.value ? "\n\n" : ""}${quote}\n\n`;
            composer.dispatchEvent(new Event("input", { bubbles: true }));
            composer.focus();
          } else if (!(await pasteQuote(composer, quoteParagraphs(text), quote))) {
            composer.focus();
            document.execCommand("insertText", false, `${quote}\n\n`);
          }
        } else {
          void navigator.clipboard?.writeText(quote);
        }
      });
      actions.appendChild(btn);
      markProcessed(comment, "commentUxQuote");
    });
  },
  teardown() {
    document.querySelectorAll(".readit-quote-btn").forEach((el) => el.remove());
    clearMarks("commentUxQuote");
    clearMarks("commentUxFmt");
  },
  health: () =>
    document.querySelector("shreddit-comment, shreddit-composer") ? "ok" : "degraded",
};
