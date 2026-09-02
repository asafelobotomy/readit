import type { FeatureModule } from "./utils.js";
import {
  clearMarks,
  detectToolbox,
  isModRoute,
  isProcessed,
  markProcessed,
} from "./utils.js";

function softDisableIfToolbox(ctx: { settings: { toolboxDetected: boolean; flags: { modQuickActions: boolean } } }): boolean {
  return ctx.settings.toolboxDetected;
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

    document.querySelectorAll("shreddit-post").forEach((post) => {
      if (isProcessed(post, "modQuickActions")) return;
      const bar = document.createElement("div");
      bar.className = "readit-mod-bar";
      bar.style.cssText =
        "display:flex;gap:6px;flex-wrap:wrap;margin:6px 0;font-size:12px;";
      for (const label of ["Approve", "Remove", "Spam", "Lock"]) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = label;
        btn.style.cssText =
          "padding:2px 8px;border-radius:4px;border:1px solid #888;background:transparent;cursor:pointer;";
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          post.setAttribute("data-readit-actioned", "true");
          btn.textContent = `${label} ✓`;
          // Prefer native overflow menu click when present
          const native = post.querySelector<HTMLElement>(
            `button[aria-label*="${label}" i], [aria-label*="${label}" i]`,
          );
          native?.click();
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
    document.querySelectorAll('a[href*="/user/"]').forEach((a) => {
      const href = a.getAttribute("href") || "";
      const m = href.match(/\/user\/([^/?#]+)/i);
      if (!m) return;
      if (byUser.has(m[1].toLowerCase())) {
        a.setAttribute("data-readit-has-note", "true");
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
    if (isModRoute(ctx.pathname)) {
      document.documentElement.classList.add("readit-mod-route");
    }
  },
  teardown() {
    document.documentElement.classList.remove("readit-mod-route");
  },
  health: () => "ok",
};
