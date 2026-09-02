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
    if (!map.size) return;

    document.querySelectorAll('a[href*="/user/"]').forEach((a) => {
      if (isProcessed(a, "userTags")) return;
      const href = a.getAttribute("href") || "";
      const m = href.match(/\/user\/([^/?#]+)/i);
      if (!m) return;
      const tag = map.get(m[1].toLowerCase());
      if (!tag) return;
      const badge = document.createElement("span");
      badge.className = "readit-user-tag";
      badge.textContent = tag.label;
      badge.title = tag.note || tag.label;
      badge.style.cssText = `margin-left:4px;padding:0 5px;border-radius:3px;font-size:11px;background:${tag.color};color:#fff;vertical-align:middle;`;
      a.after(badge);
      markProcessed(a, "userTags");
    });
  },
  teardown() {
    document.querySelectorAll(".readit-user-tag").forEach((el) => el.remove());
    clearMarks("userTags");
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
  description: "J/K scroll between posts in the feed.",
  apply(ctx) {
    if (!ctx.settings.flags.keyboardNav) return;
    if ((window as unknown as { __readitKb?: boolean }).__readitKb) return;
    (window as unknown as { __readitKb?: boolean }).__readitKb = true;
    document.documentElement.dataset.readitKb = "1";

    const handler = (e: KeyboardEvent) => {
      if (!ctx.settings.flags.keyboardNav) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (isEditableTarget(target)) return;
      if (e.key !== "j" && e.key !== "k" && e.key !== "J" && e.key !== "K") return;
      e.preventDefault();
      const posts = Array.from(
        document.querySelectorAll<HTMLElement>("shreddit-post"),
      ).filter((p) => p.offsetParent !== null);
      if (!posts.length) return;
      const y = window.scrollY + 80;
      let idx = posts.findIndex((p) => p.offsetTop >= y - 20);
      if (idx < 0) idx = 0;
      if (e.key.toLowerCase() === "j") idx = Math.min(posts.length - 1, idx + 1);
      else idx = Math.max(0, idx - 1);
      posts[idx]?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    delete document.documentElement.dataset.readitKb;
  },
};
