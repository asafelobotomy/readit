/**
 * MAIN-world pointer bridge — CDP mouse moves land in the page world but often
 * miss the isolated content-script world. Write coords to a shared DOM attribute
 * the layout editor observes.
 */
export default defineContentScript({
  matches: ["*://*.reddit.com/*"],
  // New Reddit only: Old Reddit has none of the DOM these scripts target.
  excludeMatches: ["*://old.reddit.com/*"],
  world: "MAIN",
  runAt: "document_start",
  main() {
    const w = window as Window & {
      __readitPointerBridge?: boolean;
      __readitBridgeDragging?: boolean;
    };
    if (w.__readitPointerBridge) return;
    w.__readitPointerBridge = true;

    const ATTR = "data-readit-pointer";

    const emit = (type: "move" | "up", ev: MouseEvent) => {
      // Only the layout editor reads this. Without the gate every drag on
      // every Reddit page (text selection, scrollbars) rewrote <html>'s
      // attributes twice per mouse move, even with readit paused.
      if (!document.documentElement.classList.contains("readit-layout-edit")) {
        return;
      }
      document.documentElement.setAttribute(
        ATTR,
        `${type}:${Math.round(ev.clientX)}:${Math.round(ev.clientY)}:${ev.buttons}:${Date.now()}`,
      );
    };

    const arm = (ev: Event) => {
      const t = ev.target;
      if (
        t instanceof Element &&
        t.closest?.(
          ".readit-layout-frame, .readit-frame-label, .readit-col-resize, .readit-pad-resize",
        )
      ) {
        w.__readitBridgeDragging = true;
      }
    };

    window.addEventListener("pointerdown", arm, true);
    window.addEventListener("mousedown", arm, true);
    window.addEventListener(
      "mousemove",
      (ev) => {
        if (ev.buttons || w.__readitBridgeDragging) emit("move", ev);
      },
      true,
    );
    window.addEventListener(
      "mouseup",
      (ev) => {
        if (w.__readitBridgeDragging) emit("up", ev);
        w.__readitBridgeDragging = false;
      },
      true,
    );
    window.addEventListener(
      "pointermove",
      (ev) => {
        if (ev.buttons || w.__readitBridgeDragging) emit("move", ev);
      },
      true,
    );
    window.addEventListener(
      "pointerup",
      (ev) => {
        if (w.__readitBridgeDragging) emit("up", ev);
        w.__readitBridgeDragging = false;
      },
      true,
    );
  },
});
