/**
 * MAIN-world left-nav hydrate — Reddit’s CommonLeftNav is a lazy faceplate-partial.
 * Compact layout never intersects it, so joined communities never load.
 * Isolated content scripts cannot call page custom-element methods; this bridge can.
 */
export default defineContentScript({
  matches: ["*://*.reddit.com/*"],
  world: "MAIN",
  runAt: "document_start",
  main() {
    const w = window as Window & { __readitLeftNavHydrate?: boolean };
    if (w.__readitLeftNavHydrate) return;
    w.__readitLeftNavHydrate = true;

    const ATTR_REQ = "data-readit-hydrate-left-nav";
    const ATTR_DONE = "data-readit-hydrate-left-nav-done";

    type FaceplatePartial = Element & {
      loadContent?: () => unknown | Promise<unknown>;
      loading?: string;
      isLoading?: boolean;
    };

    function findPartials(): FaceplatePartial[] {
      const scoped = [
        ...document.querySelectorAll(
          "#left-nav-persistent-container faceplate-partial, #flex-left-nav-contents faceplate-partial",
        ),
      ] as FaceplatePartial[];
      if (scoped.length > 0) return scoped;
      return [...document.querySelectorAll("faceplate-partial")].filter((el) => {
        const name = (el.getAttribute("name") || "").toLowerCase();
        const src = (el.getAttribute("src") || "").toLowerCase();
        return (
          /left.?nav|commonleftnav/i.test(name) ||
          /common-left-nav|left-nav/i.test(src)
        );
      }) as FaceplatePartial[];
    }

    async function hydrate(): Promise<void> {
      if (document.querySelector("left-nav-communities-controller")) {
        document.documentElement.setAttribute(ATTR_DONE, String(Date.now()));
        return;
      }
      const partials = findPartials();
      for (const partial of partials) {
        if (partial.isLoading) continue;
        try {
          partial.setAttribute("loading", "eager");
        } catch {
          /* ignore */
        }
        try {
          if (typeof partial.loading === "string") partial.loading = "eager";
        } catch {
          /* ignore */
        }
        try {
          const ret = partial.loadContent?.();
          if (ret && typeof (ret as Promise<unknown>).then === "function") {
            await (ret as Promise<unknown>);
          }
        } catch {
          /* ignore */
        }
      }
      document.documentElement.setAttribute(ATTR_DONE, String(Date.now()));
    }

    document.documentElement.addEventListener(
      "readit:hydrate-left-nav",
      () => {
        void hydrate();
      },
    );

    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.attributeName === ATTR_REQ) {
          void hydrate();
        }
      }
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [ATTR_REQ],
    });
  },
});
