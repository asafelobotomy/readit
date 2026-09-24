import type { FeatureModule } from "./utils.js";
import { clearMarks, isProcessed, markProcessed } from "./utils.js";

/** True when J/K must not navigate (composer / search / contenteditable). */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  if (!("tagName" in target) && !("parentElement" in target)) return false;
  const el =
    "tagName" in target && typeof (target as { tagName?: string }).tagName === "string"
      ? (target as HTMLElement)
      : ((target as { parentElement?: HTMLElement | null }).parentElement ?? null);
  if (!el || typeof el.tagName !== "string") return false;
  const closest =
    typeof el.closest === "function" ? el.closest.bind(el) : () => null;
  if (closest("#readit-root, readit-studio")) return true;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  if (closest('[contenteditable="true"]')) return true;
  if (closest("shreddit-composer, faceplate-textarea-input, faceplate-search-input")) {
    return true;
  }
  if (typeof el.getAttribute === "function" && el.getAttribute("role") === "textbox") {
    return true;
  }
  return false;
}

/** Viewport y where a post counts as "current" — just below Reddit's sticky header. */
export const KB_NAV_ANCHOR_PX = 64;
const KB_NAV_SLOP_PX = 4;

/**
 * Which post J/K should move to, from the posts' viewport tops
 * (getBoundingClientRect().top, in feed order).
 *
 * The old code compared `offsetTop` (relative to each post's offset parent,
 * not the page) against scrollY, and after scrolling a post to the top it
 * counted the *next* post as current, so J skipped one.
 */
export function nextPostIndex(
  tops: readonly number[],
  key: "j" | "k",
  anchor = KB_NAV_ANCHOR_PX,
): number | null {
  if (!tops.length) return null;
  let current = -1;
  for (let i = 0; i < tops.length; i++) {
    if (tops[i]! <= anchor + KB_NAV_SLOP_PX) current = i;
    else break;
  }
  if (key === "j") return Math.min(tops.length - 1, current + 1);
  if (current < 0) return 0;
  // K on a post that is partly scrolled past goes back to its own start.
  if (tops[current]! < anchor - KB_NAV_SLOP_PX) return current;
  return Math.max(0, current - 1);
}

export const userTagsFeature: FeatureModule = {
  id: "userTags",
  tier: "advanced",
  audience: ["reader", "creator", "moderator"],
  category: "tags",
  label: "User tags",
  description: "Show local labels next to usernames.",
  apply(ctx) {
    if (!ctx.settings.flags.userTags) return;
    const map = new Map(
      ctx.settings.tags.map((t) => [t.username.toLowerCase(), t]),
    );

    // Reconcile every link each pass (not just unprocessed ones) so edited
    // labels/colors and deleted tags show up without a reload.
    document.querySelectorAll('a[href*="/user/"]').forEach((a) => {
      const href = a.getAttribute("href") || "";
      const user = href.match(/\/user\/([^/?#]+)/i)?.[1];
      const tag = user ? map.get(user.toLowerCase()) : undefined;
      const next = a.nextElementSibling;
      let badge =
        next instanceof HTMLElement && next.classList.contains("readit-user-tag")
          ? next
          : null;
      if (!tag) {
        badge?.remove();
        return;
      }
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "readit-user-tag";
        badge.style.cssText =
          "margin-left:4px;padding:0 5px;border-radius:3px;font-size:11px;color:#fff;vertical-align:middle;";
        a.after(badge);
      }
      // Only write on change: every write is a DOM mutation.
      const title = tag.note || tag.label;
      if (badge.textContent !== tag.label) badge.textContent = tag.label;
      if (badge.title !== title) badge.title = title;
      if (badge.dataset.color !== tag.color) {
        badge.dataset.color = tag.color;
        badge.style.background = tag.color;
      }
    });
  },
  teardown() {
    document.querySelectorAll(".readit-user-tag").forEach((el) => el.remove());
  },
};

export const readingModeFeature: FeatureModule = {
  id: "readingMode",
  tier: "advanced",
  audience: ["reader", "creator"],
  category: "reading",
  label: "Reading mode hook",
  description: "Exposes post/comment text for the studio reading overlay.",
  apply() {},
  teardown() {},
  health: () => "ok",
};

export const savedLibraryFeature: FeatureModule = {
  id: "savedLibrary",
  tier: "advanced",
  audience: ["reader", "creator", "moderator"],
  category: "library",
  label: "Saved library",
  description: "Local folders and reading queues managed in the studio.",
  apply() {},
  teardown() {},
  health: () => "ok",
};

export const absoluteTimestampsFeature: FeatureModule = {
  id: "absoluteTimestamps",
  tier: "advanced",
  audience: ["creator", "moderator"],
  category: "productivity",
  label: "Absolute timestamps",
  description: "Show full date/time next to relative timestamps.",
  apply(ctx) {
    if (!ctx.settings.flags.absoluteTimestamps) return;
    document.querySelectorAll("time, faceplate-timeago time").forEach((t) => {
      if (isProcessed(t, "absoluteTimestamps")) return;
      const dt = t.getAttribute("datetime");
      if (!dt) return;
      const d = new Date(dt);
      if (Number.isNaN(d.getTime())) return;
      const span = document.createElement("span");
      span.className = "readit-abs-time";
      span.textContent = ` (${d.toLocaleString()})`;
      span.style.cssText = "opacity:0.75;font-size:0.9em;";
      t.after(span);
      markProcessed(t, "absoluteTimestamps");
    });
  },
  teardown() {
    document.querySelectorAll(".readit-abs-time").forEach((el) => el.remove());
    clearMarks("absoluteTimestamps");
  },
};

export const opHighlightFeature: FeatureModule = {
  id: "opHighlight",
  tier: "simple",
  audience: ["reader", "creator", "moderator"],
  category: "style",
  label: "Highlight OP",
  description: "Visually emphasize original poster comments (CSS class).",
  apply(ctx) {
    if (!ctx.settings.flags.opHighlight) return;
    document.querySelectorAll("shreddit-comment").forEach((c) => {
      if (c.hasAttribute("is-op") || c.getAttribute("data-op") === "true") {
        c.setAttribute("data-op", "true");
      }
    });
  },
  teardown() {},
};

export const alwaysShowActionsFeature: FeatureModule = {
  id: "alwaysShowActions",
  tier: "advanced",
  audience: ["creator", "moderator"],
  category: "productivity",
  label: "Always show actions",
  description: "Expand overflow menus into the action bar when possible.",
  apply(ctx) {
    if (!ctx.settings.flags.alwaysShowActions) return;
    document
      .querySelectorAll('shreddit-post [aria-haspopup="menu"], shreddit-comment [aria-haspopup="menu"]')
      .forEach((btn) => {
        if (isProcessed(btn, "alwaysShowActions")) return;
        (btn as HTMLElement).style.outline = "1px dashed var(--readit-accent)";
        markProcessed(btn, "alwaysShowActions");
      });
  },
  teardown() {
    clearMarks("alwaysShowActions");
  },
};

export const cleanLinksFeature: FeatureModule = {
  id: "cleanLinks",
  tier: "advanced",
  audience: ["creator", "moderator"],
  category: "productivity",
  label: "Clean share links",
  description: "Strip tracking params from share URLs when copying via studio.",
  apply() {},
  teardown() {},
  health: () => "ok",
};

export const cannedRepliesFeature: FeatureModule = {
  id: "cannedReplies",
  tier: "advanced",
  audience: ["creator", "moderator"],
  category: "create",
  label: "Canned replies",
  description: "Insert saved reply templates from the studio.",
  apply() {},
  teardown() {},
  health: () => "ok",
};

export const keyboardNavFeature: FeatureModule = {
  id: "keyboardNav",
  tier: "advanced",
  audience: ["reader", "creator", "moderator"],
  category: "productivity",
  label: "Keyboard navigation",
  description:
    "Defer to Reddit’s J/K hotkeys by default, or use readit scroll-between-posts.",
  apply(ctx) {
    if (!ctx.settings.flags.keyboardNav) return;
    const mode = ctx.settings.keyboardNavPrefs?.mode ?? "defer";
    document.documentElement.dataset.readitKb = mode;

    // Defer: do not register a listener — official Reddit owns J/K/A/Z.
    if (mode !== "readit") {
      const existing = (
        window as unknown as { __readitKbHandler?: (e: KeyboardEvent) => void }
      ).__readitKbHandler;
      if (existing) {
        window.removeEventListener("keydown", existing);
        delete (window as unknown as { __readitKbHandler?: unknown }).__readitKbHandler;
      }
      (window as unknown as { __readitKb?: boolean }).__readitKb = false;
      return;
    }

    if ((window as unknown as { __readitKb?: boolean }).__readitKb) return;
    (window as unknown as { __readitKb?: boolean }).__readitKb = true;

    const handler = (e: KeyboardEvent) => {
      if (!ctx.settings.flags.keyboardNav) return;
      if ((ctx.settings.keyboardNavPrefs?.mode ?? "defer") !== "readit") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (isEditableTarget(target)) return;
      if (e.key !== "j" && e.key !== "k" && e.key !== "J" && e.key !== "K") return;
      e.preventDefault();
      const posts = Array.from(
        document.querySelectorAll<HTMLElement>("shreddit-post"),
      ).filter((p) => p.getClientRects().length > 0);
      const tops = posts.map((p) => p.getBoundingClientRect().top);
      const idx = nextPostIndex(tops, e.key.toLowerCase() === "j" ? "j" : "k");
      if (idx === null) return;
      // Land below the sticky header rather than underneath it.
      window.scrollTo({
        top: window.scrollY + tops[idx]! - KB_NAV_ANCHOR_PX,
        behavior: "smooth",
      });
    };
    window.addEventListener("keydown", handler);
    (window as unknown as { __readitKbHandler?: (e: KeyboardEvent) => void }).__readitKbHandler =
      handler;
  },
  teardown() {
    const handler = (window as unknown as { __readitKbHandler?: (e: KeyboardEvent) => void })
      .__readitKbHandler;
    if (handler) window.removeEventListener("keydown", handler);
    (window as unknown as { __readitKb?: boolean }).__readitKb = false;
    delete (window as unknown as { __readitKbHandler?: unknown }).__readitKbHandler;
    delete document.documentElement.dataset.readitKb;
  },
};
