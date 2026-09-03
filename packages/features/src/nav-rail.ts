/**
 * Purpose-built compact Nav rail: scrape Reddit’s left nav into a model,
 * render #readit-nav-rail, and keep joined communities in sync.
 */

export const NAV_COMPACT_MAX_PX = 168;

export const NAV_RAIL_ID = "readit-nav-rail";

export type NavSectionId =
  | "recent"
  | "communities"
  | "custom"
  | "games"
  | "resources"
  | "best"
  | "moderation"
  | "other";

export type NavItemKind = "chrome" | "action" | "community";

export type NavItem = {
  kind: NavItemKind;
  href: string;
  label: string;
  /** Subreddit name without r/ for community rows. */
  name?: string;
  iconSrc?: string;
  iconSvg?: string;
  sectionId?: NavSectionId;
};

export type NavSection = {
  id: NavSectionId;
  label: string;
  items: NavItem[];
};

export type NavModel = {
  chrome: NavItem[];
  sections: NavSection[];
};

const SECTION_ORDER: readonly NavSectionId[] = [
  "games",
  "custom",
  "recent",
  "communities",
  "resources",
  "best",
  "moderation",
  "other",
] as const;

const SECTION_LABELS: Record<NavSectionId, string> = {
  recent: "Recent",
  communities: "Communities",
  custom: "Custom Feeds",
  games: "Games",
  resources: "Resources",
  best: "Best of Reddit",
  moderation: "Moderation",
  other: "More",
};

function cleanLabel(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function subredditFromHref(href: string): string | null {
  const m = href.match(/\/r\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

export function classifyNavSection(text: string): NavSectionId {
  const t = text.toUpperCase();
  if (/RECENT/.test(t)) return "recent";
  if (/COMMUNIT/.test(t)) return "communities";
  if (/CUSTOM\s*FEED/.test(t)) return "custom";
  if (/GAMES/.test(t)) return "games";
  if (/RESOURCE/.test(t)) return "resources";
  if (/BEST\s*OF/.test(t)) return "best";
  if (/MODERAT|QUEUE|MOD\b/.test(t)) return "moderation";
  return "other";
}

function classifyActionSection(label: string): NavSectionId {
  const lower = label.toLowerCase();
  if (/start a community|create community/.test(lower)) return "communities";
  if (/manage/.test(lower)) return "other";
  if (/about|advertise|help|blog|career|press|developer/.test(lower)) {
    return "resources";
  }
  if (/privacy|user agreement|accessib|reddit rules/.test(lower)) {
    return "resources";
  }
  if (/best of/.test(lower)) return "best";
  return "other";
}

function findRedditNavRoot(doc: Document = document): HTMLElement | null {
  const slot = doc.querySelector('[data-readit-slot="leftNav"]');
  if (slot instanceof HTMLElement) {
    const inner =
      slot.querySelector("#flex-left-nav-container") ||
      slot.querySelector("reddit-sidebar-nav") ||
      slot.querySelector("#left-sidebar") ||
      slot.querySelector("#flex-left-nav-contents");
    if (inner instanceof HTMLElement) return inner;
    return slot;
  }
  const fallback =
    doc.querySelector("#flex-left-nav-container") ||
    doc.querySelector("#left-sidebar") ||
    doc.querySelector("reddit-sidebar-nav");
  return fallback instanceof HTMLElement ? fallback : null;
}

function findRailHost(doc: Document = document): HTMLElement | null {
  const slot = doc.querySelector('[data-readit-slot="leftNav"]');
  return slot instanceof HTMLElement ? slot : findRedditNavRoot(doc);
}

function avatarSrcFrom(el: Element): string | undefined {
  const img =
    el.querySelector("img[src]") ||
    el.querySelector("faceplate-img img[src]") ||
    el.querySelector("[avatar] img[src]");
  if (img instanceof HTMLImageElement && img.src) return img.src;
  const fp = el.querySelector("faceplate-img[src], [avatar][src]");
  const src = fp?.getAttribute("src");
  return src || undefined;
}

function iconSvgFrom(el: Element): string | undefined {
  const svg = el.querySelector("svg");
  if (!(svg instanceof SVGElement)) return undefined;
  const clone = svg.cloneNode(true) as SVGElement;
  clone.removeAttribute("class");
  clone.setAttribute("aria-hidden", "true");
  clone.setAttribute("focusable", "false");
  return clone.outerHTML;
}

function normalizeHref(href: string): string {
  try {
    const u = new URL(href, "https://www.reddit.com");
    if (u.hostname.endsWith("reddit.com")) {
      return `${u.pathname}${u.search}` || "/";
    }
  } catch {
    /* keep raw */
  }
  return href;
}

function isSkippableNavLink(label: string, href: string): boolean {
  if (/collapse\s*navigation/i.test(label)) return true;
  if (/^#/.test(href)) return true;
  return false;
}

function ensureSection(
  map: Map<NavSectionId, NavSection>,
  id: NavSectionId,
  label?: string,
): NavSection {
  let section = map.get(id);
  if (!section) {
    section = {
      id,
      label: label || SECTION_LABELS[id],
      items: [],
    };
    map.set(id, section);
  } else if (label && label.length > section.label.length) {
    section.label = label;
  }
  return section;
}

function itemKey(item: NavItem): string {
  return `${item.kind}:${normalizeHref(item.href)}:${item.name || item.label}`;
}

function communityKey(item: NavItem): string {
  return (item.name || subredditFromHref(item.href) || item.label)
    .toLowerCase()
    .replace(/^r\//, "");
}

/** Keep last-known joined communities so accordion collapse / hide doesn’t wipe the rail. */
let cachedJoinedCommunities: NavItem[] = [];

/**
 * Compact layout often leaves CommonLeftNav as a lazy faceplate-partial that never
 * intersects the viewport — so joined communities never hydrate. Force-load it
 * via the MAIN-world bridge (isolated scripts cannot call faceplate loadContent).
 */
function findLeftNavPartials(root: ParentNode): Element[] {
  const fromContainer = [
    ...root.querySelectorAll(
      "#left-nav-persistent-container faceplate-partial, #flex-left-nav-contents faceplate-partial",
    ),
  ];
  if (fromContainer.length > 0) return fromContainer;
  return [...root.querySelectorAll("faceplate-partial")].filter((el) => {
    const name = (el.getAttribute("name") || "").toLowerCase();
    const src = (el.getAttribute("src") || "").toLowerCase();
    return (
      /left.?nav|commonleftnav/i.test(name) ||
      /common-left-nav|left-nav/i.test(src)
    );
  });
}

function leftNavHasCommunityController(scope: ParentNode): boolean {
  return !!scope.querySelector("left-nav-communities-controller");
}

const HYDRATE_REQ_ATTR = "data-readit-hydrate-left-nav";
const HYDRATE_DONE_ATTR = "data-readit-hydrate-left-nav-done";

export function ensureLeftNavHydrated(
  doc: Document = document,
): Promise<boolean> {
  if (leftNavHasCommunityController(doc)) return Promise.resolve(true);

  // Best-effort direct call (works in page world / tests; usually undefined in isolated CS).
  for (const partial of findLeftNavPartials(findRedditNavRoot(doc) || doc)) {
    const anyPartial = partial as Element & {
      loadContent?: () => unknown | Promise<unknown>;
      loading?: string;
    };
    try {
      partial.setAttribute("loading", "eager");
      if (typeof anyPartial.loading === "string") anyPartial.loading = "eager";
      const ret = anyPartial.loadContent?.();
      if (ret && typeof (ret as Promise<unknown>).then === "function") {
        return (ret as Promise<unknown>)
          .then(() => leftNavHasCommunityController(doc))
          .catch(() => leftNavHasCommunityController(doc));
      }
      if (typeof anyPartial.loadContent === "function") {
        return Promise.resolve(leftNavHasCommunityController(doc));
      }
    } catch {
      /* fall through to MAIN bridge */
    }
  }

  return new Promise((resolve) => {
    const rootEl = doc.documentElement;
    const prevDone = rootEl.getAttribute(HYDRATE_DONE_ATTR);
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      obs.disconnect();
      window.clearTimeout(timer);
      resolve(leftNavHasCommunityController(doc));
    };

    const obs = new MutationObserver(() => {
      if (leftNavHasCommunityController(doc)) finish();
      const done = rootEl.getAttribute(HYDRATE_DONE_ATTR);
      if (done && done !== prevDone) {
        // Give shadow content a tick to attach after faceplate render.
        window.setTimeout(finish, 50);
      }
    });
    obs.observe(rootEl, {
      attributes: true,
      attributeFilter: [HYDRATE_DONE_ATTR],
    });
    const navRoot = findRedditNavRoot(doc);
    if (navRoot) {
      obs.observe(navRoot, { childList: true, subtree: true });
    } else if (doc.body) {
      obs.observe(doc.body, { childList: true, subtree: true });
    }

    rootEl.setAttribute(HYDRATE_REQ_ATTR, String(Date.now()));
    rootEl.dispatchEvent(new CustomEvent("readit:hydrate-left-nav"));

    const timer = window.setTimeout(finish, 5000);
  });
}

/** Reddit often keeps Communities closed until expanded — open before scrape. */
function expandRedditNavSections(root: HTMLElement): void {
  for (const details of root.querySelectorAll("details")) {
    if (details instanceof HTMLDetailsElement) details.open = true;
  }
  for (const el of root.querySelectorAll("[aria-expanded='false']")) {
    if (!(el instanceof HTMLElement)) continue;
    const label = cleanLabel(
      `${el.textContent || ""} ${el.getAttribute("aria-label") || ""}`,
    );
    if (!/communit|recent|custom\s*feed|games|resource|moderat/i.test(label)) {
      continue;
    }
    el.setAttribute("aria-expanded", "true");
    const controlled = el.getAttribute("aria-controls");
    if (controlled) {
      const panel = root.querySelector(`#${CSS.escape(controlled)}`);
      if (panel instanceof HTMLElement) {
        panel.removeAttribute("hidden");
        panel.style.display = "";
      }
    }
  }
}

function communityFromShadowItem(el: Element): NavItem | null {
  const prefixed =
    el.getAttribute("prefixedname") ||
    el.getAttribute("prefixedName") ||
    "";
  const nameFromAttr = prefixed.replace(/^r\//i, "").trim();
  const shadow = el.shadowRoot;
  const link = shadow?.querySelector("a[href]");
  const hrefRaw =
    (link instanceof HTMLAnchorElement && link.getAttribute("href")) ||
    (nameFromAttr ? `/r/${nameFromAttr}/` : "");
  const sub = nameFromAttr || subredditFromHref(hrefRaw || "");
  if (!sub) return null;
  const avatarAttr = (el.getAttribute("avatarsrc") || "").trim();
  const img = shadow?.querySelector("img[src]");
  const iconSrc =
    avatarAttr ||
    (img instanceof HTMLImageElement ? img.src : img?.getAttribute("src") || undefined);
  return {
    kind: "community",
    href: normalizeHref(hrefRaw || `/r/${sub}/`),
    label: prefixed || `r/${sub}`,
    name: sub,
    iconSrc: iconSrc || undefined,
  };
}

/**
 * Joined communities live in left-nav-communities-controller’s shadow DOM
 * (not queryable via light-DOM a[href]).
 */
function collectCommunityFromAnchor(
  anchor: HTMLAnchorElement,
): NavItem | null {
  const hrefRaw = anchor.getAttribute("href") || "";
  const sub = subredditFromHref(hrefRaw);
  if (!sub) return null;
  if (anchor.closest(`#${NAV_RAIL_ID}`)) return null;
  const label = cleanLabel(anchor.textContent || "");
  if (isSkippableNavLink(label, hrefRaw)) return null;
  return {
    kind: "community",
    href: normalizeHref(hrefRaw),
    label: label || `r/${sub}`,
    name: sub,
    iconSrc: avatarSrcFrom(anchor),
  };
}

function scrapeJoinedCommunitiesFromControllers(
  scope: ParentNode,
): NavItem[] {
  const out: NavItem[] = [];
  const seen = new Set<string>();
  const controllers = [
    ...scope.querySelectorAll("left-nav-communities-controller"),
  ];
  for (const controller of controllers) {
    const shadow = controller.shadowRoot;
    if (!shadow) continue;
    for (const itemEl of shadow.querySelectorAll("left-nav-community-item")) {
      const item = communityFromShadowItem(itemEl);
      if (!item) continue;
      const key = communityKey(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function mergeCommunityLists(...lists: NavItem[][]): NavItem[] {
  const byName = new Map<string, NavItem>();
  for (const list of lists) {
    for (const item of list) {
      if (item.kind !== "community") continue;
      const key = communityKey(item);
      if (!key) continue;
      const prev = byName.get(key);
      if (!prev) {
        byName.set(key, item);
        continue;
      }
      // Prefer entry that has an avatar.
      if (!prev.iconSrc && item.iconSrc) byName.set(key, item);
    }
  }
  return [...byName.values()];
}

function applyJoinedCommunityCache(model: NavModel): NavModel {
  const recent =
    model.sections.find((s) => s.id === "recent")?.items.filter(
      (i) => i.kind === "community",
    ) || [];
  const communitiesSec = model.sections.find((s) => s.id === "communities");
  const scrapedJoined =
    communitiesSec?.items.filter((i) => i.kind === "community") || [];

  if (scrapedJoined.length > 0) {
    cachedJoinedCommunities = mergeCommunityLists(
      cachedJoinedCommunities,
      scrapedJoined,
    );
  }

  const joined = mergeCommunityLists(cachedJoinedCommunities, scrapedJoined);
  if (joined.length === 0 && recent.length === 0) return model;

  const sections = [...model.sections];
  let comm = sections.find((s) => s.id === "communities");
  if (!comm) {
    comm = {
      id: "communities",
      label: SECTION_LABELS.communities,
      items: [],
    };
    sections.push(comm);
  }
  const nonCommunity = comm.items.filter((i) => i.kind !== "community");
  // Keep Manage / actions, then full joined list (cached + scraped).
  comm.items = [...nonCommunity, ...joined];
  sections.sort(
    (a, b) => SECTION_ORDER.indexOf(a.id) - SECTION_ORDER.indexOf(b.id),
  );
  return { ...model, sections };
}

/** Scrape Reddit’s left nav into a stable model for the custom rail. */
export function scrapeNavModel(doc: Document = document): NavModel {
  const root = findRedditNavRoot(doc);
  const chrome: NavItem[] = [];
  const sectionMap = new Map<NavSectionId, NavSection>();
  const seen = new Set<string>();

  if (!(root instanceof HTMLElement)) {
    return applyJoinedCommunityCache({ chrome: [], sections: [] });
  }

  expandRedditNavSections(root);

  for (const summary of root.querySelectorAll("summary")) {
    if (!(summary instanceof HTMLElement)) continue;
    const label = cleanLabel(summary.textContent || "");
    if (!label || label.length > 80) continue;
    const id = classifyNavSection(label);
    ensureSection(sectionMap, id, label);
  }

  // Joined list lives in left-nav-communities-controller shadow DOM.
  for (const item of scrapeJoinedCommunitiesFromControllers(root)) {
    const key = itemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    ensureSection(sectionMap, "communities").items.push(item);
  }
  // Fallback: controllers sometimes sit outside the slot inner root.
  if (!sectionMap.get("communities")?.items.some((i) => i.kind === "community")) {
    for (const item of scrapeJoinedCommunitiesFromControllers(doc)) {
      const key = itemKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      ensureSection(sectionMap, "communities").items.push(item);
    }
  }

  // Prefer explicit community list items when present (light DOM / older markup).
  for (const host of root.querySelectorAll(
    "left-nav-community-item, #COMMUNITIES a[href], [id='communities-section'] a[href*='/r/'], [id='communities'] a[href*='/r/']",
  )) {
    if (host.tagName.toLowerCase() === "left-nav-community-item") {
      const item = communityFromShadowItem(host);
      if (!item) continue;
      const key = itemKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      ensureSection(sectionMap, "communities").items.push(item);
      continue;
    }
    const anchor =
      host instanceof HTMLAnchorElement
        ? host
        : host.querySelector("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) continue;
    const item = collectCommunityFromAnchor(anchor);
    if (!item) continue;
    const key = itemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    ensureSection(sectionMap, "communities").items.push(item);
  }

  for (const anchor of root.querySelectorAll("a[href]")) {
    if (!(anchor instanceof HTMLAnchorElement)) continue;
    if (anchor.closest(`#${NAV_RAIL_ID}`)) continue;
    const hrefRaw = anchor.getAttribute("href") || "";
    if (!hrefRaw) continue;
    const href = normalizeHref(hrefRaw);
    const label = cleanLabel(anchor.textContent || "");
    if (isSkippableNavLink(label, hrefRaw)) continue;

    const details = anchor.closest("details");
    const summary = details?.querySelector("summary");
    const summaryLabel = summary
      ? cleanLabel(summary.textContent || "")
      : "";
    const parentSectionId = summaryLabel
      ? classifyNavSection(summaryLabel)
      : null;

    const sub = subredditFromHref(href);
    if (sub) {
      const item = collectCommunityFromAnchor(anchor);
      if (!item) continue;
      const key = itemKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      if (parentSectionId) {
        ensureSection(sectionMap, parentSectionId, summaryLabel).items.push(
          item,
        );
      } else if (
        sectionMap
          .get("communities")
          ?.items.some((i) => i.kind === "community")
      ) {
        // Joined list already came from the shadow controller; bare /r/ links
        // without a section are usually Recent / promo, not Communities.
        ensureSection(sectionMap, "recent").items.push(item);
      } else {
        ensureSection(sectionMap, "communities").items.push(item);
      }
      continue;
    }

    const hasIcon = !!(
      anchor.querySelector("svg, img, faceplate-img, [avatar], i")
    );
    const tip =
      cleanLabel(anchor.getAttribute("aria-label") || "") ||
      cleanLabel(anchor.getAttribute("title") || "") ||
      label;

    if (parentSectionId) {
      const item: NavItem = {
        kind: hasIcon ? "chrome" : "action",
        href,
        label: tip || label || href,
        iconSrc: avatarSrcFrom(anchor),
        iconSvg: iconSvgFrom(anchor),
        sectionId: parentSectionId,
      };
      const key = itemKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      ensureSection(sectionMap, parentSectionId, summaryLabel).items.push(
        item,
      );
      continue;
    }

    const item: NavItem = {
      kind: hasIcon ? "chrome" : "action",
      href,
      label: tip || label || href,
      iconSrc: avatarSrcFrom(anchor),
      iconSvg: iconSvgFrom(anchor),
      sectionId: hasIcon ? undefined : classifyActionSection(tip || label),
    };
    const key = itemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    chrome.push(item);
  }

  const sections = SECTION_ORDER.map((id) => sectionMap.get(id)).filter(
    (s): s is NavSection => !!s && (s.items.length > 0 || !!s.label),
  );
  for (const id of SECTION_ORDER) {
    if (sectionMap.has(id) && !sections.some((s) => s.id === id)) {
      sections.push(sectionMap.get(id)!);
    }
  }
  sections.sort(
    (a, b) => SECTION_ORDER.indexOf(a.id) - SECTION_ORDER.indexOf(b.id),
  );

  return applyJoinedCommunityCache({ chrome, sections });
}

export function modelFingerprint(model: NavModel): string {
  const chrome = model.chrome.map(itemKey).join("|");
  const sections = model.sections
    .map(
      (s) =>
        `${s.id}:${s.items.map(itemKey).join(",")}`,
    )
    .join(";");
  return `${chrome}::${sections}`;
}

function el(
  tag: string,
  attrs: Record<string, string | undefined> = {},
  children: (Node | string)[] = [],
): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === "") continue;
    node.setAttribute(k, v);
  }
  for (const child of children) {
    if (typeof child === "string") node.appendChild(document.createTextNode(child));
    else node.appendChild(child);
  }
  return node;
}

function fallbackGlyph(label: string): HTMLElement {
  const letter = (label.replace(/^r\//i, "").trim()[0] || "?").toUpperCase();
  return el(
    "span",
    { class: "readit-nav-rail-glyph", "aria-hidden": "true" },
    [letter],
  );
}

function renderIcon(item: NavItem): HTMLElement {
  if (item.iconSrc) {
    return el("img", {
      class: "readit-nav-rail-icon",
      src: item.iconSrc,
      alt: "",
      decoding: "async",
      referrerpolicy: "no-referrer",
    });
  }
  if (item.iconSvg) {
    const wrap = el("span", {
      class: "readit-nav-rail-icon readit-nav-rail-icon-svg",
      "aria-hidden": "true",
    });
    wrap.innerHTML = item.iconSvg;
    return wrap;
  }
  if (item.kind === "action" || item.sectionId) {
    const sid = item.sectionId || classifyActionSection(item.label);
    return el("span", {
      class: "readit-nav-rail-icon readit-nav-rail-section-icon",
      "data-readit-nav-section": sid,
      "aria-hidden": "true",
    });
  }
  return fallbackGlyph(item.label);
}

function renderLink(item: NavItem): HTMLElement {
  const tip =
    item.kind === "community" && item.name
      ? `r/${item.name}`
      : item.label;
  const a = el("a", {
    class: "readit-nav-rail-item",
    href: item.href,
    title: tip,
    "aria-label": tip,
    "data-readit-nav-kind": item.kind,
    "data-readit-nav-section": item.sectionId,
  });
  a.appendChild(renderIcon(item));
  if (item.kind === "community") {
    const name = item.name || item.label.replace(/^r\//i, "");
    a.appendChild(
      el(
        "span",
        {
          class: "readit-nav-subname",
          "aria-hidden": "true",
        },
        [name],
      ),
    );
  }
  return a;
}

function renderSection(section: NavSection): HTMLElement {
  const block = el("section", {
    class: "readit-nav-rail-section",
    "data-readit-nav-section": section.id,
  });
  const header = el(
    "div",
    {
      class: "readit-nav-rail-section-head",
      "data-readit-nav-kind": "section",
      "data-readit-nav-section": section.id,
      title: section.label,
      role: "heading",
      "aria-level": "2",
      "aria-label": section.label,
    },
    [
      el("span", {
        class: "readit-nav-rail-section-icon",
        "data-readit-nav-section": section.id,
        "aria-hidden": "true",
      }),
    ],
  );
  block.appendChild(header);
  for (const item of section.items) {
    block.appendChild(renderLink(item));
  }
  return block;
}

/** Build a fresh rail element from a model (not attached). */
export function buildNavRail(model: NavModel): HTMLElement {
  const nav = el("nav", {
    id: NAV_RAIL_ID,
    "data-readit-nav-rail": "1",
    "aria-label": "readit navigation",
  });
  const chrome = el("div", { class: "readit-nav-rail-chrome" });
  for (const item of model.chrome) {
    chrome.appendChild(renderLink(item));
  }
  nav.appendChild(chrome);
  const body = el("div", { class: "readit-nav-rail-body" });
  for (const section of model.sections) {
    body.appendChild(renderSection(section));
  }
  nav.appendChild(body);
  return nav;
}

export function renderNavRail(
  model: NavModel,
  doc: Document = document,
): HTMLElement | null {
  const host = findRailHost(doc);
  if (!(host instanceof HTMLElement)) return null;
  const next = buildNavRail(model);
  const prev = doc.getElementById(NAV_RAIL_ID);
  if (prev && prev.parentElement === host) {
    host.replaceChild(next, prev);
  } else {
    prev?.remove();
    host.insertBefore(next, host.firstChild);
  }
  return next;
}

let railObservers: MutationObserver[] = [];
const watchedShadowRoots = new Set<ShadowRoot>();
let railRefreshTimer = 0;
let joinClickBound = false;
let pageshowBound = false;
let lastFingerprint = "";
let mounted = false;
/** Last Reddit nav root we attached observers to (SPA replaces this node). */
let observedNavRoot: HTMLElement | null = null;

function disconnectRailObservers(): void {
  for (const obs of railObservers) obs.disconnect();
  railObservers = [];
  watchedShadowRoots.clear();
}

function watchNodeForRail(
  node: Node,
  onChange: () => void,
  attributeFilter: string[],
): void {
  const obs = new MutationObserver(onChange);
  obs.observe(node, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter,
  });
  railObservers.push(obs);
}

/** Light DOM + community controller / item shadow roots (joined list lives there). */
function attachRailObservers(root: HTMLElement): void {
  const onChange = () => {
    attachCommunityShadowObservers(root, onChange);
    scheduleRailRefreshDebounced(150);
  };
  disconnectRailObservers();
  watchNodeForRail(root, onChange, [
    "href",
    "src",
    "aria-label",
    "open",
    "hidden",
    "avatarsrc",
    "prefixedname",
  ]);
  attachCommunityShadowObservers(root, onChange);
}

function attachCommunityShadowObservers(
  root: HTMLElement,
  onChange: () => void,
): void {
  for (const controller of root.querySelectorAll(
    "left-nav-communities-controller",
  )) {
    const shadow = controller.shadowRoot;
    if (shadow && !watchedShadowRoots.has(shadow)) {
      watchedShadowRoots.add(shadow);
      watchNodeForRail(shadow, onChange, [
        "href",
        "src",
        "avatarsrc",
        "prefixedname",
      ]);
    }
    if (!shadow) continue;
    for (const item of shadow.querySelectorAll("left-nav-community-item")) {
      const itemShadow = item.shadowRoot;
      if (itemShadow && !watchedShadowRoots.has(itemShadow)) {
        watchedShadowRoots.add(itemShadow);
        watchNodeForRail(itemShadow, onChange, ["href", "src"]);
      }
    }
  }
}

function scheduleRailRefresh(delayMs = 120): void {
  window.setTimeout(() => {
    if (!mounted) return;
    refreshNavRail();
  }, delayMs);
}

/** Debounced refresh for MutationObserver bursts. */
function scheduleRailRefreshDebounced(delayMs = 150): void {
  window.clearTimeout(railRefreshTimer);
  railRefreshTimer = window.setTimeout(() => {
    if (!mounted) return;
    refreshNavRail();
  }, delayMs);
}

export function refreshNavRail(doc: Document = document): NavModel {
  const root = findRedditNavRoot(doc);
  if (root && mounted) {
    attachCommunityShadowObservers(root, () =>
      scheduleRailRefreshDebounced(150),
    );
  }
  const model = scrapeNavModel(doc);
  const joinedCount =
    model.sections
      .find((s) => s.id === "communities")
      ?.items.filter((i) => i.kind === "community").length || 0;
  if (mounted && joinedCount === 0 && !leftNavHasCommunityController(doc)) {
    void ensureLeftNavHydrated(doc).then((ok) => {
      if (ok && mounted) scheduleRailRefreshDebounced(120);
    });
  }
  const fp = modelFingerprint(model);
  if (fp === lastFingerprint && doc.getElementById(NAV_RAIL_ID)) {
    return model;
  }
  lastFingerprint = fp;
  renderNavRail(model, doc);
  return model;
}

function onJoinLeaveClick(ev: Event): void {
  const t = ev.target;
  if (!(t instanceof Element)) return;
  if (t.closest(`#${NAV_RAIL_ID}`)) return;
  const control = t.closest("button, a, faceplate-tracker");
  if (!(control instanceof Element)) return;
  const text = cleanLabel(
    `${control.textContent || ""} ${control.getAttribute("aria-label") || ""}`,
  );
  if (!/^(join|joined|leave|joined community)/i.test(text) &&
    !/\b(join|leave)\b/i.test(text)) {
    return;
  }
  // Reddit rewrites the sidebar after join/leave — refresh a few times.
  scheduleRailRefresh(400);
  scheduleRailRefresh(1200);
  scheduleRailRefresh(2500);
}

function onPageShow(): void {
  if (!mounted) return;
  void ensureLeftNavHydrated().then(() => {
    if (mounted) scheduleRailRefresh(80);
  });
  scheduleRailRefresh(200);
}

/** Mount custom rail + live sync while compact Nav is active. */
export function mountNavRail(doc: Document = document): void {
  mounted = true;
  const root = findRedditNavRoot(doc);
  if (root) expandRedditNavSections(root);
  // SPA navigation replaces the left-nav host — always rebind observers.
  if (root && root !== observedNavRoot) {
    attachRailObservers(root);
    observedNavRoot = root;
  } else if (root && railObservers.length === 0) {
    attachRailObservers(root);
    observedNavRoot = root;
  }
  refreshNavRail(doc);
  void ensureLeftNavHydrated(doc).then((ok) => {
    if (!mounted) return;
    if (ok) {
      const latest = findRedditNavRoot(doc);
      if (latest) expandRedditNavSections(latest);
      refreshNavRail(doc);
    }
  });
  // Communities often hydrate after accordion open — re-scrape shortly after.
  scheduleRailRefresh(350);
  scheduleRailRefresh(1200);
  scheduleRailRefresh(2500);
  if (!joinClickBound) {
    document.addEventListener("click", onJoinLeaveClick, true);
    joinClickBound = true;
  }
  if (!pageshowBound) {
    window.addEventListener("pageshow", onPageShow);
    pageshowBound = true;
  }
}

export function unmountNavRail(doc: Document = document): void {
  mounted = false;
  window.clearTimeout(railRefreshTimer);
  disconnectRailObservers();
  observedNavRoot = null;
  lastFingerprint = "";
  doc.getElementById(NAV_RAIL_ID)?.remove();
}

/** True when compact rail should be present but is missing from the live DOM. */
export function navRailNeedsRemount(doc: Document = document): boolean {
  if (!mounted) return false;
  const host = findRailHost(doc);
  if (!(host instanceof HTMLElement)) return true;
  return !doc.getElementById(NAV_RAIL_ID);
}

/** @deprecated Prefer mountNavRail — kept for export compatibility. */
export function stampNavCompact(doc: Document = document): number {
  const model = scrapeNavModel(doc);
  return (
    model.chrome.length +
    model.sections.reduce((n, s) => n + 1 + s.items.length, 0)
  );
}

export function clearNavCompactStamps(_doc: Document = document): void {
  /* stamps removed — rail owns compact UI */
}

export function mountNavCompactObserver(): void {
  mountNavRail();
}

export function unmountNavCompactObserver(): void {
  unmountNavRail();
}
