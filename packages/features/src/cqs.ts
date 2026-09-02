import type {
  CqsRiskConfidence,
  CqsRiskEvent,
  CqsSnapshot,
  CqsTier,
  ReaditSettings,
} from "@readit/schema";
import { createId } from "@readit/schema";
import type { FeatureModule } from "./utils.js";
import { clearMarks, isProcessed, markProcessed } from "./utils.js";

export const CQS_TIERS: readonly CqsTier[] = [
  "Lowest",
  "Low",
  "Moderate",
  "High",
  "Highest",
] as const;

const TIER_RANK: Record<CqsTier, number> = {
  Lowest: 0,
  Low: 1,
  Moderate: 2,
  High: 3,
  Highest: 4,
};

/** Parse a WhatIsMyCQS-style bot reply (often a bare tier word). */
export function parseCqsTierFromText(text: string): CqsTier | null {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > 120) return null;
  for (const tier of [...CQS_TIERS].sort((a, b) => b.length - a.length)) {
    const exact = new RegExp(`^\\s*${tier}\\s*[.!]?\\s*$`, "i");
    if (exact.test(cleaned)) return tier;
  }
  for (const tier of [...CQS_TIERS].sort((a, b) => b.length - a.length)) {
    const phrase = new RegExp(
      `(?:cqs|contributor\\s*quality(?:\\s*score)?)\\s*(?:is|:)?\\s*${tier}\\b`,
      "i",
    );
    if (phrase.test(cleaned)) return tier;
  }
  return null;
}

export function latestCqsTier(
  snapshots: CqsSnapshot[],
): CqsTier | null {
  if (!snapshots.length) return null;
  return [...snapshots].sort((a, b) => b.checkedAt - a.checkedAt)[0]?.tier ?? null;
}

export function tierDelta(
  prev: CqsTier | null,
  next: CqsTier,
): "up" | "down" | "same" | "first" {
  if (!prev) return "first";
  const d = TIER_RANK[next] - TIER_RANK[prev];
  if (d > 0) return "up";
  if (d < 0) return "down";
  return "same";
}

type RiskWeights = Record<CqsRiskEvent["kind"], number>;

const RISK_WEIGHT: RiskWeights = {
  burst: 18,
  near_duplicate: 22,
  promo_link: 14,
  removal: 20,
  captcha: 25,
  unverified: 12,
  self_delete: 8,
  restriction: 30,
  check: 0,
};

/** Heuristic 0–100 risk from recent events (not an estimated CQS). */
export function computeCqsRiskScore(
  events: CqsRiskEvent[],
  windowMs = 24 * 60 * 60 * 1000,
): number {
  const now = Date.now();
  let score = 0;
  for (const e of events) {
    if (now - e.at > windowMs) continue;
    const ageFactor = 1 - (now - e.at) / windowMs;
    score += (RISK_WEIGHT[e.kind] ?? 0) * (0.45 + 0.55 * ageFactor);
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function confidenceLabel(c: CqsRiskConfidence): string {
  switch (c) {
    case "official":
      return "Official";
    case "official_adjacent":
      return "Official-adjacent";
    case "community":
      return "Community";
    case "heuristic":
      return "Heuristic";
    case "speculative":
      return "Speculative";
    default: {
      const _exhaustive: never = c;
      return _exhaustive;
    }
  }
}

function emitPersist(
  detail:
    | { type: "snapshot"; snapshot: CqsSnapshot }
    | { type: "risk"; event: CqsRiskEvent }
    | { type: "submit_stamps"; stamps: number[] },
): void {
  window.dispatchEvent(new CustomEvent("readit:cqs-persist", { detail }));
}

function showPageBanner(message: string, severity: "info" | "warn" = "warn"): void {
  document.getElementById("readit-cqs-banner")?.remove();
  const el = document.createElement("div");
  el.id = "readit-cqs-banner";
  el.className = "readit-cqs-banner";
  el.setAttribute("data-readit-cqs", "1");
  el.style.cssText = [
    "position:fixed",
    "left:16px",
    "right:16px",
    "bottom:16px",
    "z-index:2147483645",
    "padding:12px 14px",
    "border-radius:10px",
    "font:13px/1.4 system-ui,sans-serif",
    "display:flex",
    "gap:12px",
    "align-items:flex-start",
    "justify-content:space-between",
    severity === "warn"
      ? "background:#3a2210;color:#ffd7a8;border:1px solid #a86b2d"
      : "background:#1a2a3a;color:#cfe6ff;border:1px solid #3d6d9e",
  ].join(";");
  const text = document.createElement("div");
  text.textContent = message;
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Dismiss";
  close.style.cssText =
    "flex-shrink:0;padding:4px 10px;border-radius:6px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;";
  close.addEventListener("click", () => el.remove());
  el.append(text, close);
  document.documentElement.append(el);
  window.setTimeout(() => el.remove(), 12_000);
}

function draftTextFromComposer(): string {
  const areas = [
    ...document.querySelectorAll<HTMLElement>(
      'div[contenteditable="true"], textarea, shreddit-composer textarea, faceplate-textarea textarea',
    ),
  ];
  return areas
    .map((el) => ("value" in el ? String((el as HTMLTextAreaElement).value) : el.innerText))
    .join("\n")
    .trim();
}

function looksPromotional(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  const linkCount = (text.match(/https?:\/\//gi) || []).length;
  if (linkCount >= 2) return true;
  if (linkCount >= 1 && text.length < 160) return true;
  return /\b(use my (code|link)|check out my|sign up|affiliate|promo code|dm me for)\b/i.test(
    lower,
  );
}

function similarity(a: string, b: string): number {
  const na = a.toLowerCase().replace(/\s+/g, " ").trim();
  const nb = b.toLowerCase().replace(/\s+/g, " ").trim();
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const wa = new Set(na.split(" ").filter((w) => w.length > 2));
  const wb = new Set(nb.split(" ").filter((w) => w.length > 2));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter += 1;
  return inter / Math.max(wa.size, wb.size);
}

type CqsRuntime = {
  settings: ReaditSettings | null;
  recentBodies: string[];
  submitStamps: number[];
  clickHandler: ((e: Event) => void) | null;
};

function getRuntime(): CqsRuntime {
  const w = window as unknown as { __readitCqs?: CqsRuntime };
  if (!w.__readitCqs) {
    w.__readitCqs = {
      settings: null,
      recentBodies: [],
      submitStamps: [],
      clickHandler: null,
    };
  }
  return w.__readitCqs;
}

function scanWhatIsMyCqs(): void {
  if (!/\/r\/whatismycqs\b/i.test(location.pathname)) return;
  const comments = document.querySelectorAll(
    "shreddit-comment, [data-testid='comment'], .Comment",
  );
  for (const node of comments) {
    if (isProcessed(node, "cqsTracker")) continue;
    const text =
      node.querySelector('[id*="-post-rtjson-content"], [slot="comment"]')
        ?.textContent ||
      node.textContent ||
      "";
    const tier = parseCqsTierFromText(text.slice(0, 200));
    if (!tier) continue;
    markProcessed(node, "cqsTracker");
    const snapshot: CqsSnapshot = {
      id: createId("cqs"),
      tier,
      checkedAt: Date.now(),
      source: "whatismycqs",
      note: "",
    };
    emitPersist({ type: "snapshot", snapshot });
    document.documentElement.dataset.readitCqsTier = tier;
    showPageBanner(
      `readit logged your CQS tier: ${tier} (from r/WhatIsMyCQS — tier only, not a raw score).`,
      "info",
    );
    break;
  }
}

function scanFriction(ctxSettings: ReaditSettings): void {
  const path = location.pathname;
  // Captcha / human verification cues
  const captcha = document.querySelector(
    'iframe[src*="captcha"], [data-testid*="captcha" i], #captcha, .captcha',
  );
  if (captcha && !isProcessed(captcha, "cqsCap")) {
    markProcessed(captcha, "cqsCap");
    emitPersist({
      type: "risk",
      event: {
        id: createId("cqr"),
        kind: "captcha",
        confidence: "official_adjacent",
        message: "Human verification / captcha challenge detected — slow down submissions.",
        at: Date.now(),
        path,
      },
    });
  }

  // Removed markers on own content (best-effort)
  document
    .querySelectorAll(
      '[data-removed="true"], shreddit-post[is-removed], [aria-label*="removed" i]',
    )
    .forEach((el) => {
      if (isProcessed(el, "cqsRem")) return;
      markProcessed(el, "cqsRem");
      emitPersist({
        type: "risk",
        event: {
          id: createId("cqr"),
          kind: "removal",
          confidence: "community",
          message: "Possible removal/filter marker on page — avoid repeat posting in this community.",
          at: Date.now(),
          path,
        },
      });
    });

  // Restriction banners
  const restrict = [...document.querySelectorAll("h1, h2, p, faceplate-banner")].find(
    (el) =>
      /account (has been )?(suspended|banned|locked|restricted)|ban evasion|inauthentic activity/i.test(
        el.textContent || "",
      ),
  );
  if (restrict && !isProcessed(restrict, "cqsRes")) {
    markProcessed(restrict, "cqsRes");
    emitPersist({
      type: "risk",
      event: {
        id: createId("cqr"),
        kind: "restriction",
        confidence: "official_adjacent",
        message:
          "Account restriction messaging detected. Do not attempt workarounds — review Reddit Help.",
        at: Date.now(),
        path,
      },
    });
  }

  void ctxSettings;
}

function attachSubmitGuards(settings: ReaditSettings): void {
  const rt = getRuntime();
  rt.settings = settings;
  if (rt.clickHandler) return;

  rt.clickHandler = (e: Event) => {
    const live = getRuntime().settings;
    if (!live?.flags.cqsTracker || live.paused) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest("button, [role='button']");
    if (!btn) return;
    const label = (btn.textContent || "").trim().toLowerCase();
    if (!/^(comment|reply|post|save)$/.test(label) && !/\b(comment|post|reply)\b/.test(label)) {
      return;
    }
    if (btn.closest("readit-studio, #readit-root, #readit-cqs-banner")) return;

    const prefs = live.cqsPrefs;
    const draft = draftTextFromComposer();
    const now = Date.now();
    rt.submitStamps = rt.submitStamps.filter(
      (t) => now - t < prefs.burstWindowMs,
    );

    const warnings: string[] = [];

    if (prefs.warnBurst && rt.submitStamps.length + 1 >= prefs.burstLimit) {
      warnings.push(
        `Burst risk (heuristic): ${rt.submitStamps.length + 1} submits in ${Math.round(prefs.burstWindowMs / 60000)}m.`,
      );
      emitPersist({
        type: "risk",
        event: {
          id: createId("cqr"),
          kind: "burst",
          confidence: "heuristic",
          message: warnings[warnings.length - 1]!,
          at: now,
          path: location.pathname,
        },
      });
    }

    if (prefs.warnDuplicate && draft.length > 24) {
      const dup = rt.recentBodies.some((b) => similarity(b, draft) >= 0.82);
      if (dup) {
        warnings.push(
          "Near-duplicate body (heuristic): this looks very similar to a recent comment/post.",
        );
        emitPersist({
          type: "risk",
          event: {
            id: createId("cqr"),
            kind: "near_duplicate",
            confidence: "heuristic",
            message: warnings[warnings.length - 1]!,
            at: now,
            path: location.pathname,
          },
        });
      }
    }

    if (prefs.warnPromo && looksPromotional(draft)) {
      warnings.push(
        "Promo/link density (heuristic): outbound links or salesy phrasing can look spammy.",
      );
      emitPersist({
        type: "risk",
        event: {
          id: createId("cqr"),
          kind: "promo_link",
          confidence: "heuristic",
          message: warnings[warnings.length - 1]!,
          at: now,
          path: location.pathname,
        },
      });
    }

    if (warnings.length) {
      showPageBanner(
        `CQS risk check — ${warnings.join(" ")} This is not your CQS score; Reddit only exposes tiers.`,
        "warn",
      );
    }

    rt.submitStamps.push(now);
    emitPersist({ type: "submit_stamps", stamps: rt.submitStamps });
    if (draft.length > 12) {
      rt.recentBodies = [draft, ...rt.recentBodies].slice(0, 12);
    }
  };

  document.addEventListener("click", rt.clickHandler, true);
}

export const cqsTrackerFeature: FeatureModule = {
  id: "cqsTracker",
  tier: "advanced",
  audience: ["creator", "reader", "moderator"],
  category: "create",
  label: "CQS Ratings Tracker",
  description:
    "Log Contributor Quality Score tiers from r/WhatIsMyCQS and warn on contribution-risk heuristics.",
  apply(ctx) {
    if (!ctx.settings.flags.cqsTracker) return;
    scanWhatIsMyCqs();
    scanFriction(ctx.settings);
    attachSubmitGuards(ctx.settings);
  },
  teardown() {
    const rt = getRuntime();
    if (rt.clickHandler) {
      document.removeEventListener("click", rt.clickHandler, true);
      rt.clickHandler = null;
    }
    document.getElementById("readit-cqs-banner")?.remove();
    clearMarks("cqsTracker");
    clearMarks("cqsCap");
    clearMarks("cqsRem");
    clearMarks("cqsRes");
    delete document.documentElement.dataset.readitCqsTier;
  },
  health: () => "ok",
};

/** Trim helpers used by content-script persistence. */
export function appendCqsSnapshot(
  settings: ReaditSettings,
  snapshot: CqsSnapshot,
  max = 40,
): ReaditSettings {
  const prev = latestCqsTier(settings.cqsSnapshots);
  const snapshots = [snapshot, ...settings.cqsSnapshots]
    .filter(
      (s, i, arr) =>
        arr.findIndex(
          (x) => x.tier === s.tier && Math.abs(x.checkedAt - s.checkedAt) < 5000,
        ) === i,
    )
    .slice(0, max);
  const riskEvents = [...settings.cqsRiskEvents];
  const delta = tierDelta(prev, snapshot.tier);
  if (delta !== "same") {
    riskEvents.unshift({
      id: createId("cqr"),
      kind: "check",
      confidence: "official",
      message:
        delta === "first"
          ? `Logged CQS tier ${snapshot.tier}`
          : `CQS tier ${delta}: now ${snapshot.tier}`,
      at: snapshot.checkedAt,
      path: "/r/WhatIsMyCQS/",
    });
  }
  return {
    ...settings,
    cqsSnapshots: snapshots,
    cqsRiskEvents: riskEvents.slice(0, 80),
  };
}

export function appendCqsRiskEvent(
  settings: ReaditSettings,
  event: CqsRiskEvent,
  max = 80,
): ReaditSettings {
  // Dedupe identical kind within 2 minutes
  const recent = settings.cqsRiskEvents[0];
  if (
    recent &&
    recent.kind === event.kind &&
    event.at - recent.at < 120_000 &&
    recent.message === event.message
  ) {
    return settings;
  }
  return {
    ...settings,
    cqsRiskEvents: [event, ...settings.cqsRiskEvents].slice(0, max),
  };
}
