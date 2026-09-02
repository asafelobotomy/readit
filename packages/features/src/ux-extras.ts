import type { FeatureModule } from "./utils.js";
import { clearMarks, isProcessed, markProcessed } from "./utils.js";

const VISITED_KEY = "readit.visitedPosts";
const MAX_VISITED = 400;

function loadVisited(): Set<string> {
  try {
    const raw = localStorage.getItem(VISITED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveVisited(set: Set<string>): void {
  const arr = Array.from(set).slice(-MAX_VISITED);
  try {
    localStorage.setItem(VISITED_KEY, JSON.stringify(arr));
  } catch {
    /* quota */
  }
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
    const mode = prefs.mode === "off" ? "open" : prefs.mode;
    const visited = loadVisited();
    const opacity = prefs.dimOpacity;

    const stamp = (post: Element) => {
      const key = postKey(post);
      if (!key) return;
      visited.add(key);
      applyDim(post as HTMLElement, opacity);
      saveVisited(visited);
    };

    document.querySelectorAll("shreddit-post").forEach((post) => {
      const key = postKey(post);
      if (key && visited.has(key)) {
        applyDim(post as HTMLElement, opacity);
      }
      if (isProcessed(post, "markRead")) return;
      markProcessed(post, "markRead");

      if (mode === "open") {
        post.addEventListener(
          "click",
          (ev) => {
            const t = ev.target as Element | null;
            if (t?.closest('a[href*="/comments/"], a[slot="title"]')) {
              stamp(post);
            }
          },
          true,
        );
      }
    });

    const prev = (window as unknown as { __readitMarkReadIo?: IntersectionObserver })
      .__readitMarkReadIo;
    prev?.disconnect();
    delete (window as unknown as { __readitMarkReadIo?: IntersectionObserver })
      .__readitMarkReadIo;

    if (mode === "onScroll") {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            if (entry.intersectionRatio < 0.55) continue;
            stamp(entry.target);
          }
        },
        { threshold: [0.55] },
      );
      document.querySelectorAll("shreddit-post").forEach((p) => io.observe(p));
      (window as unknown as { __readitMarkReadIo?: IntersectionObserver }).__readitMarkReadIo =
        io;
    }

    if (/\/comments\//.test(location.pathname)) {
      const path = location.pathname.replace(/\/$/, "");
      visited.add(path);
      saveVisited(visited);
    }
  },
  teardown() {
    (window as unknown as { __readitMarkReadIo?: IntersectionObserver }).__readitMarkReadIo
      ?.disconnect();
    document.querySelectorAll("[data-readit-visited]").forEach((el) => {
      (el as HTMLElement).style.opacity = "";
      delete (el as HTMLElement).dataset.readitVisited;
    });
    clearMarks("markRead");
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
          'button[aria-label*="formatting" i], button[aria-label*="Format" i], [data-testid="format-button"]',
        )
        .forEach((btn) => {
          if (isProcessed(btn, "commentUxFmt")) return;
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
      btn.style.cssText =
        "margin-left:6px;font-size:11px;padding:2px 6px;border:1px solid #555;border-radius:4px;background:#222;color:#eee;cursor:pointer;";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const body =
          comment.querySelector('[id*="-post-rtjson-content"], .md, [slot="comment"]')
            ?.textContent ||
          comment.textContent ||
          "";
        const quote = body
          .trim()
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n");
        const composer =
          document.querySelector<HTMLElement>(
            'div[contenteditable="true"], shreddit-composer textarea, faceplate-textarea-input textarea',
          ) || null;
        if (composer) {
          if (composer instanceof HTMLTextAreaElement) {
            composer.value = `${composer.value}${composer.value ? "\n\n" : ""}${quote}\n\n`;
            composer.dispatchEvent(new Event("input", { bubbles: true }));
            composer.focus();
          } else {
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
