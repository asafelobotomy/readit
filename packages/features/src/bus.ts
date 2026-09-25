import type {
  CommentSort,
  CqsRiskEvent,
  CqsSnapshot,
  LayoutSeparator,
  ReaditSettings,
} from "@readit/schema";
import type {
  LayoutOrderPersistDetail,
  LayoutPadsPersistDetail,
  LayoutWidthsPersistDetail,
} from "./layout-slots.js";

export type CqsPersistDetail =
  | { type: "snapshot"; snapshot: CqsSnapshot }
  | { type: "risk"; event: CqsRiskEvent }
  | { type: "submit_stamps"; stamps: number[] };

/** Payload per internal event. `undefined` = signal with no payload. */
export type ReaditBusEvents = {
  "layout-widths": LayoutWidthsPersistDetail;
  "layout-order": LayoutOrderPersistDetail;
  "layout-pads": LayoutPadsPersistDetail;
  "layout-separators": { separators: LayoutSeparator[] };
  "layout-width-locks": { widthLocks: Record<string, boolean> };
  "edit-selection": { selected: string[] };
  "cqs-persist": CqsPersistDetail;
  /** A sort picked in Reddit's comment sort menu (remember mode). */
  "comment-sort-picked": { subreddit: string; sort: CommentSort };
  "open-studio": undefined;
  /** Carries fresh settings when known; `undefined` means "reload from storage". */
  "settings-updated": ReaditSettings | undefined;
};

export type ReaditBusEvent = keyof ReaditBusEvents;

/**
 * In-extension event bus for the isolated content-script world.
 *
 * Replaces the old `readit:*` CustomEvents on `window`: window events
 * are shared with reddit.com's own scripts, which could both forge events the
 * content script persists to storage and read the settings it broadcast
 * (usernotes, tags, filters). This module-level EventTarget is only reachable
 * from code bundled into the extension.
 */
const target = new EventTarget();

export function emitReadit<K extends ReaditBusEvent>(
  type: K,
  ...args: undefined extends ReaditBusEvents[K]
    ? [detail?: ReaditBusEvents[K]]
    : [detail: ReaditBusEvents[K]]
): void {
  target.dispatchEvent(new CustomEvent(type, { detail: args[0] }));
}

/** Subscribe to an internal event; returns an unsubscribe function. */
export function onReadit<K extends ReaditBusEvent>(
  type: K,
  cb: (detail: ReaditBusEvents[K]) => void,
): () => void {
  const listener = (ev: Event) => {
    // CustomEvent stores an omitted detail as null; payload-free signals
    // are typed as undefined.
    const detail = (ev as CustomEvent<ReaditBusEvents[K] | null>).detail;
    cb((detail ?? undefined) as ReaditBusEvents[K]);
  };
  target.addEventListener(type, listener);
  return () => target.removeEventListener(type, listener);
}
