/**
 * Element picker helpers (hide/dim rules). Kept free of Preact/WXT imports so
 * the unit tests can load them under plain Node.
 */

/** Tag of the WXT shadow-root host that contains the whole studio UI. */
export const STUDIO_HOST_TAG = "readit-studio";

type NodeLike = {
  tagName?: unknown;
  id?: unknown;
};

function isStudioNode(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const { tagName, id } = node as NodeLike;
  return (
    (typeof tagName === "string" && tagName.toLowerCase() === STUDIO_HOST_TAG) ||
    id === "readit-root"
  );
}

/**
 * True when an event originated in readit's own UI.
 *
 * The studio lives in a shadow root, so a document-level listener sees
 * `event.target` retargeted to the `<readit-studio>` host — a plain
 * `target.closest("#readit-root")` never matches. `composedPath()` still
 * lists the nodes inside the shadow tree (and the host itself).
 */
export function isStudioEvent(ev: Pick<Event, "composedPath">): boolean {
  return ev.composedPath().some(isStudioNode);
}

/** Page roots — hiding one blanks the whole tab. */
const ROOT_TAGS = new Set(["html", "head", "body"]);

/**
 * Build a stable-ish CSS selector for a picked Reddit element, or null when
 * the element must not become a hide/dim rule (readit's own UI, page roots).
 */
export function buildSelector(el: Element): string | null {
  if (ROOT_TAGS.has(el.tagName.toLowerCase())) return null;
  if (isStudioNode(el) || el.closest?.(`${STUDIO_HOST_TAG}, #readit-root`)) {
    return null;
  }
  if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) return `#${el.id}`;
  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node && depth < 4) {
    let part = node.tagName.toLowerCase();
    const testId = node.getAttribute("data-testid");
    if (testId) {
      part += `[data-testid="${CSS.escape(testId)}"]`;
      parts.unshift(part);
      break;
    }
    const parent: Element | null = node.parentElement;
    if (parent) {
      const tag = node.tagName;
      const siblings = Array.from(parent.children).filter(
        (c): c is Element => c.tagName === tag,
      );
      if (siblings.length > 1) {
        part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
    }
    parts.unshift(part);
    node = parent;
    depth += 1;
  }
  return parts.length ? parts.join(" > ") : null;
}
