import { normalizeSubredditName } from "@readit/schema";
import type { FeatureModule } from "./utils.js";
import {
  clearMarks,
  detectToolbox,
  isModRoute,
  isProcessed,
  markProcessed,
  unmarkProcessed,
} from "./utils.js";

function softDisableIfToolbox(ctx: { settings: { toolboxDetected: boolean; flags: { modQuickActions: boolean } } }): boolean {
  return ctx.settings.toolboxDetected;
}

export type ModQuickAction = "Approve" | "Remove" | "Spam" | "Lock";

/**
 * Accessible names readit accepts for each native mod control. Whole-label
 * matches only: the old `aria-label*="Lock"` substring match also hit
 * "Block …" and "Unlock", and "Remove" hit unrelated "Remove …" buttons.
 */
const NATIVE_MOD_LABELS: Record<ModQuickAction, RegExp> = {
  Approve: /^approve(?: (?:post|comment|content))?$/i,
  Remove: /^remove(?: (?:post|comment|content))?$/i,
  Spam: /^(?:(?:mark|remove) as )?spam$/i,
  Lock: /^lock(?: (?:post|comment|comments|thread))?$/i,
};

export function matchesNativeModLabel(
  action: ModQuickAction,
  ariaLabel: string | null | undefined,
): boolean {
  return NATIVE_MOD_LABELS[action].test(
    String(ariaLabel ?? "").replace(/\s+/g, " ").trim(),
  );
}

type QueryRoot = {
  querySelectorAll: (selector: string) => ArrayLike<Element> & Iterable<Element>;
};

/** Native control for `action` inside the post (light DOM or open shadow root). */
export function findNativeModControl(
  post: Element,
  action: ModQuickAction,
): HTMLElement | null {
  const roots: QueryRoot[] = [post];
  if (post.shadowRoot) roots.push(post.shadowRoot);
  for (const root of roots) {
    for (const el of root.querySelectorAll("[aria-label]")) {
      if (el.closest(".readit-mod-bar")) continue;
      if (matchesNativeModLabel(action, el.getAttribute("aria-label"))) {
        return el as HTMLElement;
      }
    }
  }
  return null;
}

/** Whether `post` belongs to one of the user's linked moderated subreddits. */
export function isModeratedPost(
  post: Element,
  linked: ReadonlySet<string>,
): boolean {
  if (linked.size === 0) return false;
  const raw =
    post.getAttribute("subreddit-name") ||
    post.getAttribute("subreddit-prefixed-name") ||
    "";
  const name = normalizeSubredditName(raw);
  return !!name && linked.has(name);
}

export const modQuickActionsFeature: FeatureModule = {
  id: "modQuickActions",
  tier: "advanced",
  audience: ["moderator"],
  category: "mod",
  label: "Mod quick actions",
  description: "Surface approve/remove/spam/lock affordances on posts.",
  apply(ctx) {
    if (!ctx.settings.flags.modQuickActions) return;
    if (softDisableIfToolbox(ctx)) return;

    // Only on subreddits the user linked as moderated (Mod tab). Re-run on
    // every settings change / DOM scan, so unlinking removes existing bars.
    const linked = new Set(ctx.settings.modSubreddits);
    document.querySelectorAll("shreddit-post").forEach((post) => {
      const allowed = isModeratedPost(post, linked);
      if (!allowed) {
        if (isProcessed(post, "modQuickActions")) {
          post.querySelector(":scope > .readit-mod-bar")?.remove();
          unmarkProcessed(post, "modQuickActions");
        }
        return;
      }
      if (isProcessed(post, "modQuickActions")) return;
      const bar = document.createElement("div");
      bar.className = "readit-mod-bar";
      bar.style.cssText =
        "display:flex;gap:6px;flex-wrap:wrap;margin:6px 0;font-size:12px;";
      for (const label of ["Approve", "Remove", "Spam", "Lock"] as const) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = label;
        btn.style.cssText =
          "padding:2px 8px;border-radius:4px;border:1px solid #888;background:transparent;cursor:pointer;";
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          // readit has no mod API of its own — it can only press Reddit's
          // control. Never report success (or dim the post) when there is
          // nothing to press.
          const native = findNativeModControl(post, label);
          if (!native) {
            btn.textContent = `${label}: not available here`;
            btn.title =
              "Reddit's own control for this action isn't on this post — use the post's mod menu.";
            window.setTimeout(() => {
              btn.textContent = label;
            }, 2500);
            return;
          }
          native.click();
          post.setAttribute("data-readit-actioned", "true");
          btn.textContent = `${label} ✓`;
          btn.title = "Pressed Reddit's control — confirm in Reddit's dialog if one opens.";
        });
        bar.append(btn);
      }
      post.prepend(bar);
      markProcessed(post, "modQuickActions");
    });
  },
  teardown() {
    document.querySelectorAll(".readit-mod-bar").forEach((el) => el.remove());
    clearMarks("modQuickActions");
  },
  health: () => (detectToolbox() ? "degraded" : "ok"),
};

export const modMacrosFeature: FeatureModule = {
  id: "modMacros",
  tier: "advanced",
  audience: ["moderator"],
  category: "mod",
  label: "Mod macros",
  description: "Local removal/ban/approve macro library (studio).",
  apply() {},
  teardown() {},
  health: () => "ok",
};

export const modUsernotesFeature: FeatureModule = {
  id: "modUsernotes",
  tier: "advanced",
  audience: ["moderator"],
  category: "mod",
  label: "Usernotes",
  description: "Local-first moderator notes on users.",
  apply(ctx) {
    if (!ctx.settings.flags.modUsernotes) return;
    if (ctx.settings.toolboxDetected) return;
    const byUser = new Map<string, number>();
    for (const n of ctx.settings.usernotes) {
      const key = n.username.toLowerCase();
      byUser.set(key, (byUser.get(key) || 0) + 1);
    }
    // Reconcile both ways so deleting a user's last note clears the marker.
    document.querySelectorAll('a[href*="/user/"]').forEach((a) => {
      const href = a.getAttribute("href") || "";
      const user = href.match(/\/user\/([^/?#]+)/i)?.[1];
      const hasNote = Boolean(user && byUser.has(user.toLowerCase()));
      if (hasNote) {
        if (a.getAttribute("data-readit-has-note") !== "true") {
          a.setAttribute("data-readit-has-note", "true");
        }
      } else if (a.hasAttribute("data-readit-has-note")) {
        a.removeAttribute("data-readit-has-note");
      }
    });
  },
  teardown() {
    document
      .querySelectorAll("[data-readit-has-note]")
      .forEach((el) => el.removeAttribute("data-readit-has-note"));
  },
};

export const modHighlightFeature: FeatureModule = {
  id: "modHighlight",
  tier: "advanced",
  audience: ["moderator"],
  category: "mod",
  label: "Mod highlighting",
  description: "Dim actioned items and mark users with notes (CSS).",
  apply(ctx) {
    if (!ctx.settings.flags.modHighlight) return;
    // Toggle, not add: apply() re-runs on SPA navigation, and an add-only
    // class stayed on after leaving the mod queue for a normal page.
    document.documentElement.classList.toggle(
      "readit-mod-route",
      isModRoute(ctx.pathname),
    );
  },
  teardown() {
    document.documentElement.classList.remove("readit-mod-route");
  },
  health: () => "ok",
};
