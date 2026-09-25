/**
 * Every root element readit inserts into the page. Nodes inside these are
 * readit's too (nav rail items, frame labels, studio shadow host).
 */
export const READIT_OWNED_SELECTOR = [
  "readit-studio",
  "#readit-root",
  "#readit-css-engine",
  "#readit-cqs-banner",
  "#readit-col-resize-host",
  "#readit-nav-rail",
  "#readit-header-mascot",
  "#readit-bottom-chrome-host",
  ".readit-all-link-wrap",
  "#readit-popout-host",
  "[data-readit-separator]",
  "[data-readit-resize-host]",
  ".readit-mod-bar",
  ".readit-user-tag",
  ".readit-abs-time",
  ".readit-quote-btn",
  ".readit-cqs-banner",
  ".readit-col-resize",
  ".readit-pad-resize",
  ".readit-layout-frame",
  ".readit-frame-label",
  ".readit-drop-line",
  ".readit-drop-label",
  ".readit-drop-moving",
].join(", ");

/** Minimal shapes so the check runs against real DOM or test doubles. */
type ElementLike = {
  nodeType: number;
  closest?: (selector: string) => unknown;
};
type NodeLike = { nodeType: number; parentElement?: ElementLike | null };
type MutationLike = {
  target: NodeLike;
  addedNodes: ArrayLike<NodeLike>;
  removedNodes: ArrayLike<NodeLike>;
};

const ELEMENT_NODE = 1;

function ownedElement(el: ElementLike | null | undefined): boolean {
  return Boolean(el && el.nodeType === ELEMENT_NODE && el.closest?.(READIT_OWNED_SELECTOR));
}

/** True when `node` is (inside) an element readit created. */
export function isReaditNode(node: NodeLike | null | undefined): boolean {
  if (!node) return false;
  if (node.nodeType === ELEMENT_NODE) return ownedElement(node as ElementLike);
  return ownedElement(node.parentElement);
}

/**
 * True when a mutation batch only reflects readit's own DOM work, so the
 * content script can skip a rescan.
 *
 * Ownership is decided by the nodes that changed — readit's own inserted
 * elements, or changes inside them — not by `data-readit-*` attributes. Readit
 * stamps those on Reddit's elements too (`#main-content`, the right rail, the
 * layout shell), so the old attribute test ignored Reddit's own updates inside
 * them, e.g. the sidebar partial loading or a feed swap after navigation.
 */
export function isReaditMutation(mutations: readonly MutationLike[]): boolean {
  return mutations.every((m) => {
    if (isReaditNode(m.target)) return true;
    const changed = [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)];
    return changed.length > 0 && changed.every((n) => isReaditNode(n));
  });
}
