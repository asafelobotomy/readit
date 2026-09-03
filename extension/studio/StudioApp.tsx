import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  CQS_TIERS,
  ALL_FEATURES,
  applyLayoutPreset,
  cleanRedditUrl,
  COLUMN_PANEL_LABELS,
  computeCqsRiskScore,
  confidenceLabel,
  LAYOUT_SLOTS,
  latestCqsTier,
  resolveSlots,
  setSlotZone,
  syncSidebarsHide,
  toReddIt,
} from "@readit/features";
import {
  createId,
  formatProfileLayoutBlurb,
  LAYOUT_WIDTH_LIMITS,
  normalizeColumnOrder,
  resizePadInBudget,
  resizePanelInBudget,
  type CqsTier,
  type ElementRule,
  type FilterRule,
  type LayoutPreset,
  type LayoutSlotId,
  type LayoutZone,
  type MarkReadMode,
  type ReaditSettings,
  type StudioLocale,
  type UserNote,
  type UserTag,
} from "@readit/schema";
import {
  exportSettings,
  importSettings,
  loadSettings,
  patchSettings,
  saveSettings,
  switchProfile,
  validateImport,
  watchSettings,
} from "../lib/settings";
import type { StudioApi } from "./mount";
import { STUDIO_LOCALES, t } from "./i18n";
import { EditToolbox, KOFI_URL, REPO_URL } from "./EditToolbox";

type Tab =
  | "simple"
  | "layout"
  | "advanced"
  | "curate"
  | "create"
  | "cqs"
  | "mod"
  | "library";

type UndoEntry = {
  label: string;
  settings: ReaditSettings;
};

type CtxMenuState = {
  x: number;
  y: number;
  slotId: LayoutSlotId | null;
  target: Element | null;
};

const LAYOUT_PRESETS: { id: LayoutPreset; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "navRight", label: "Nav right" },
  { id: "dualLeft", label: "Dual left" },
  { id: "dualRight", label: "Dual right" },
  { id: "singleColumn", label: "Single column" },
];

const COLUMN_POSITION_LABELS = ["Left", "Center", "Right"] as const;

export function StudioApp({ api }: { api: StudioApi }) {
  const [open, setOpen] = useState(false);
  const [fabMenu, setFabMenu] = useState(false);
  const [tab, setTab] = useState<Tab>("simple");
  const [settings, setSettings] = useState<ReaditSettings>(api.getSettings());
  const [toast, setToast] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [reading, setReading] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  const undoStack = useRef<UndoEntry[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const next = await loadSettings();
    setSettings(next);
  };

  useEffect(() => {
    void refresh();
    const onOpen = () => setOpen(true);
    const onUpdated = async (ev: Event) => {
      const detail = (ev as CustomEvent<ReaditSettings>).detail;
      const toolbox =
        document.documentElement.dataset.readitToolbox === "1";
      if (detail) {
        setSettings({ ...detail, toolboxDetected: detail.toolboxDetected || toolbox });
        return;
      }
      const next = await loadSettings();
      setSettings({ ...next, toolboxDetected: toolbox });
    };
    window.addEventListener("readit:open-studio", onOpen);
    window.addEventListener("readit:settings-updated", onUpdated);
    const unwatch = watchSettings((next) => {
      setSettings({
        ...next,
        toolboxDetected:
          document.documentElement.dataset.readitToolbox === "1",
      });
    });
    return () => {
      window.removeEventListener("readit:open-studio", onOpen);
      window.removeEventListener("readit:settings-updated", onUpdated);
      unwatch();
    };
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  const pushUndo = (label: string, before: ReaditSettings) => {
    undoStack.current.push({ label, settings: structuredClone(before) });
    if (undoStack.current.length > 30) undoStack.current.shift();
  };

  const commit = async (
    label: string,
    mutator: (s: ReaditSettings) => ReaditSettings,
  ) => {
    const before = await loadSettings();
    pushUndo(label, before);
    const next = await saveSettings(mutator(before));
    setSettings(next);
    flash(label);
  };

  const undo = async () => {
    const entry = undoStack.current.pop();
    if (!entry) {
      flash("Nothing to undo");
      return;
    }
    const next = await saveSettings(entry.settings);
    setSettings(next);
    flash(`Undid: ${entry.label}`);
  };

  useEffect(() => {
    if (!picker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPicker(false);
        flash("Picker cancelled");
      }
    };
    const onClick = async (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const target = e.target as Element | null;
      if (!target || target.closest("#readit-root")) return;
      const selector = buildSelector(target);
      if (!selector) {
        flash("Could not build selector");
        return;
      }
      const rule: ElementRule = {
        id: createId("el"),
        selector,
        action: "hide",
        label: target.tagName.toLowerCase(),
        enabled: true,
      };
      await commit("Hide element", (s) => ({
        ...s,
        elementRules: [...s.elementRules, rule],
        flags: { ...s.flags, elementRules: true },
      }));
      setPicker(false);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [picker]);

  useEffect(() => {
    if (!fabMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFabMenu(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target;
      if (
        t instanceof Element &&
        t.closest(".readit-fab-wrap, .readit-fab-menu")
      ) {
        return;
      }
      setFabMenu(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [fabMenu]);

  useEffect(() => {
    if (!settings.layoutSlots.editMode || settings.paused) {
      setCtxMenu(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (fabMenu) {
        setFabMenu(false);
        return;
      }
      setCtxMenu((prev) => {
        if (prev) return null;
        void commit("Exit layout edit", (s) => ({
          ...s,
          layoutSlots: { ...s.layoutSlots, editMode: false },
        }));
        flash("Layout edit off");
        return null;
      });
    };
    const onContext = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target || target.closest("#readit-root")) return;
      e.preventDefault();
      e.stopPropagation();
      const slotEl = target.closest("[data-readit-slot]");
      const raw = slotEl?.getAttribute("data-readit-slot") as LayoutSlotId | null;
      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        slotId: raw ?? null,
        target,
      });
    };
    const onClick = () => setCtxMenu(null);
    document.addEventListener("contextmenu", onContext, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("contextmenu", onContext, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [settings.layoutSlots.editMode, settings.paused, fabMenu]);

  const health = useMemo(() => api.getHealth(), [settings, open]);
  const slotHealth = useMemo(() => {
    try {
      return resolveSlots(document);
    } catch {
      return [];
    }
  }, [settings, open, tab]);

  return (
    <>
      <div class="readit-fab-wrap">
        {fabMenu && (
          <div class="readit-fab-menu" role="menu">
            <button
              type="button"
              class="readit-fab-action"
              role="menuitem"
              onClick={() => {
                setFabMenu(false);
                void commit("Enter layout edit", (s) => ({
                  ...s,
                  flags: { ...s.flags, layoutSlots: true },
                  layoutSlots: { ...s.layoutSlots, editMode: true },
                }));
              }}
            >
              Edit Mode
            </button>
            <button
              type="button"
              class="readit-fab-action"
              role="menuitem"
              onClick={() => {
                setFabMenu(false);
                setOpen(true);
              }}
            >
              Settings
            </button>
            <button
              type="button"
              class="readit-fab-action"
              role="menuitem"
              onClick={() => {
                setFabMenu(false);
                window.open(REPO_URL, "_blank", "noopener,noreferrer");
              }}
            >
              GitHub
            </button>
            <button
              type="button"
              class="readit-fab-action"
              role="menuitem"
              onClick={() => {
                setFabMenu(false);
                window.open(KOFI_URL, "_blank", "noopener,noreferrer");
              }}
            >
              Ko-fi
            </button>
          </div>
        )}
        <button
          type="button"
          class="readit-fab"
          title={
            settings.paused
              ? "readit paused — click to open"
              : fabMenu
                ? "Close menu"
                : "readit actions"
          }
          style={settings.paused ? { opacity: 0.55 } : undefined}
          aria-expanded={fabMenu}
          aria-haspopup="menu"
          onClick={() => setFabMenu((v) => !v)}
        >
          r
        </button>
      </div>

      {settings.layoutSlots.editMode && !settings.paused && (
        <EditToolbox settings={settings} commit={commit} />
      )}

      {open && !settings.paused && (
        <div
          class="readit-handle"
          title="Drag to resize feed"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startW = settings.knobs.tokens.feedWidthPx;
            const onMove = (ev: MouseEvent) => {
              const delta = ev.clientX - startX;
              const next = Math.min(1600, Math.max(480, startW + delta * 2));
              document.documentElement.style.setProperty(
                "--readit-feed-width",
                `${next}px`,
              );
              (window as unknown as { __readitWidth?: number }).__readitWidth =
                next;
            };
            const onUp = async () => {
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
              const w =
                (window as unknown as { __readitWidth?: number }).__readitWidth ??
                startW;
              await commit("Resize feed", (s) => ({
                ...s,
                knobs: {
                  ...s.knobs,
                  tokens: { ...s.knobs.tokens, feedWidthPx: w },
                },
              }));
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
        />
      )}

      {picker && (
        <div class="readit-picker-banner">
          Click any Reddit UI element to hide it (Esc to cancel)
        </div>
      )}

      {settings.layoutSlots.editMode && !settings.paused && (
        <div class="readit-picker-banner">
          Column edit unlocked — drag anywhere on a column card to reorder; edges
          to resize (Esc locks)
        </div>
      )}

      {ctxMenu && (
        <LayoutContextMenu
          menu={ctxMenu}
          onClose={() => setCtxMenu(null)}
          onAction={async (action) => {
            const menu = ctxMenu;
            setCtxMenu(null);
            if (action.type === "hideSlot" && menu.slotId && menu.slotId !== "main") {
              await commit("Hide slot", (s) => ({
                ...s,
                flags: { ...s.flags, layoutSlots: true },
                layoutSlots: setSlotZone(s.layoutSlots, menu.slotId!, "hidden"),
              }));
              return;
            }
            if (
              action.type === "moveSlot" &&
              menu.slotId &&
              (menu.slotId === "leftNav" ||
                menu.slotId === "main" ||
                menu.slotId === "rightRail")
            ) {
              await commit(`Move ${menu.slotId}`, (s) => ({
                ...s,
                flags: { ...s.flags, layoutSlots: true },
                layoutSlots: setSlotZone(
                  s.layoutSlots,
                  menu.slotId!,
                  action.zone,
                ),
              }));
              return;
            }
            if (action.type === "resetPreset") {
              await commit("Reset layout", (s) => ({
                ...s,
                layoutSlots: applyLayoutPreset(s.layoutSlots, "classic"),
                knobs: {
                  ...s.knobs,
                  hide: { ...s.knobs.hide, sidebars: false },
                },
              }));
              return;
            }
            if (
              (action.type === "hideEl" || action.type === "dimEl") &&
              menu.target
            ) {
              const selector = buildSelector(menu.target);
              if (!selector) {
                flash("Could not build selector");
                return;
              }
              const rule: ElementRule = {
                id: createId("el"),
                selector,
                action: action.type === "hideEl" ? "hide" : "dim",
                label: menu.target.tagName.toLowerCase(),
                enabled: true,
              };
              await commit(
                action.type === "hideEl" ? "Hide element" : "Dim element",
                (s) => ({
                  ...s,
                  elementRules: [...s.elementRules, rule],
                  flags: { ...s.flags, elementRules: true },
                }),
              );
              return;
            }
            if (action.type === "unhideEl" && menu.target) {
              const selector = buildSelector(menu.target);
              if (!selector) return;
              await commit("Remove matching rule", (s) => ({
                ...s,
                elementRules: s.elementRules.filter((r) => r.selector !== selector),
              }));
            }
          }}
        />
      )}

      {reading && <ReadingOverlay onClose={() => setReading(false)} />}

      {open && (
        <aside class="readit-drawer">
          <header>
            <h1>readit</h1>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" class="readit-btn" onClick={() => void undo()}>
                Undo
              </button>
              <button
                type="button"
                class="readit-btn"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
          </header>
          <div class="body">
            <div class="readit-tabs">
              {(
                [
                  ["simple", "Simple"],
                  ["layout", "Layout"],
                  ["advanced", "Advanced"],
                  ["curate", "Curate"],
                  ["create", "Create"],
                  ["cqs", "CQS"],
                  ["mod", "Mod"],
                  ["library", "Library"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  class="readit-tab"
                  data-active={String(tab === id)}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "simple" && (
              <SimpleTab
                settings={settings}
                onProfile={async (id) => {
                  const before = await loadSettings();
                  pushUndo("Switch profile", before);
                  const next = await switchProfile(id);
                  setSettings(next);
                  flash(`Profile: ${id}`);
                }}
                onCommit={commit}
                onPause={async () => {
                  const next = await patchSettings({
                    paused: !settings.paused,
                  });
                  setSettings(next);
                }}
                onExport={async () => {
                  const bundle = await exportSettings();
                  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
                    type: "application/json",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `readit-export-${Date.now()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  flash("Exported settings");
                }}
                onImportClick={() => fileRef.current?.click()}
                onReading={() => setReading(true)}
                onPicker={() => {
                  setPicker(true);
                  setOpen(false);
                  flash("Picker armed");
                }}
              />
            )}

            {tab === "layout" && (
              <LayoutTab
                settings={settings}
                slotHealth={slotHealth}
                onCommit={commit}
                onCloseDrawer={() => setOpen(false)}
              />
            )}

            {tab === "advanced" && (
              <AdvancedTab
                settings={settings}
                health={health}
                onCommit={commit}
                onPicker={() => {
                  setPicker(true);
                  setOpen(false);
                }}
              />
            )}

            {tab === "curate" && (
              <CurateTab settings={settings} onCommit={commit} />
            )}
            {tab === "create" && (
              <CreateTab settings={settings} onCommit={commit} flash={flash} />
            )}
            {tab === "cqs" && (
              <CqsTab settings={settings} onCommit={commit} flash={flash} />
            )}
            {tab === "mod" && (
              <ModTab settings={settings} onCommit={commit} flash={flash} />
            )}
            {tab === "library" && (
              <LibraryTab settings={settings} onCommit={commit} />
            )}

            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.currentTarget.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const raw = JSON.parse(text) as unknown;
                  const preview = validateImport(raw);
                  if (!preview.ok) {
                    flash(preview.errors[0] || "Import invalid");
                    return;
                  }
                  const warn =
                    preview.warnings[0] != null
                      ? ` · ${preview.warnings[0]}`
                      : "";
                  const ok = window.confirm(
                    `${t(settings.studioLocale, "exportPreview")}\n` +
                      `schema ${preview.schemaVersion ?? "?"} · ` +
                      `${preview.profileCount} profiles · ` +
                      `${preview.filterCount} filters · ` +
                      `${preview.tagCount} tags${warn}\n\nImport now?`,
                  );
                  if (!ok) {
                    flash("Import cancelled");
                    return;
                  }
                  const next = await importSettings(raw);
                  setSettings(next);
                  flash("Imported settings");
                } catch {
                  flash("Import failed");
                }
                e.currentTarget.value = "";
              }}
            />
          </div>
        </aside>
      )}

      {toast && <div class="readit-toast">{toast}</div>}
    </>
  );
}

function LayoutTab({
  settings,
  slotHealth,
  onCommit,
  onCloseDrawer,
}: {
  settings: ReaditSettings;
  slotHealth: ReturnType<typeof resolveSlots>;
  onCommit: (
    label: string,
    mutator: (s: ReaditSettings) => ReaditSettings,
  ) => Promise<void>;
  onCloseDrawer: () => void;
}) {
  const cfg = settings.layoutSlots;
  const order = normalizeColumnOrder(cfg.columnOrder);
  const canMove = cfg.editMode && !settings.paused && settings.flags.layoutSlots;
  const healthById = new Map(slotHealth.map((s) => [s.id, s]));

  const applyPreset = (preset: LayoutPreset) => {
    void onCommit(`Layout: ${preset}`, (s) => {
      const next = {
        ...s,
        flags: { ...s.flags, layoutSlots: true },
        layoutSlots: applyLayoutPreset(s.layoutSlots, preset),
      };
      if (preset === "singleColumn") {
        return {
          ...next,
          knobs: {
            ...next.knobs,
            hide: { ...next.knobs.hide, sidebars: true },
          },
        };
      }
      if (s.layoutSlots.preset === "singleColumn" || s.knobs.hide.sidebars) {
        return {
          ...next,
          knobs: {
            ...next.knobs,
            hide: { ...next.knobs.hide, sidebars: false },
          },
        };
      }
      return next;
    });
  };

  return (
    <>
      <div class="readit-section">
        <h2>Layout</h2>
        <p class="readit-muted">
          Three columns — Nav, Feed, Rail. Each keeps its own width when moved.
        </p>
        <div class="readit-row">
          <label>
            <input
              type="checkbox"
              checked={settings.flags.layoutSlots}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                void onCommit("Layout slots flag", (s) => ({
                  ...s,
                  flags: { ...s.flags, layoutSlots: checked },
                }));
              }}
            />
            Enable layout columns
          </label>
        </div>
        <div class="readit-row" style={{ marginTop: 8 }}>
          <label>
            <input
              type="checkbox"
              checked={cfg.editMode}
              disabled={!settings.flags.layoutSlots || settings.paused}
              onChange={(e) => {
                const next = e.currentTarget.checked;
                void onCommit(
                  next ? "Allow column moves" : "Lock columns",
                  (s) => ({
                    ...s,
                    flags: { ...s.flags, layoutSlots: true },
                    layoutSlots: { ...s.layoutSlots, editMode: next },
                  }),
                );
              }}
            />
            Allow moving columns
          </label>
        </div>
        <p class="readit-muted" style={{ marginTop: 4 }}>
          Off by default so browsing never nudges the layout. Turn on, then drag
          anywhere on a column / pad card on the page to reorder; drag edges to
          resize. Links are disabled while editing.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {LAYOUT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              class="readit-tab"
              data-active={String(cfg.preset === p.id)}
              onClick={() => applyPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
          {cfg.preset === "custom" && (
            <span class="readit-health-degraded">custom</span>
          )}
        </div>
      </div>

      <div class="readit-section">
        <h2>Columns</h2>
        {!canMove && (
          <p class="readit-muted">
            Enable “Allow moving columns”, then drag a column card on the page.
          </p>
        )}
        {canMove && (
          <p class="readit-muted">
            On-page: drag a column card onto another to swap (dashed target), or
            drag Left/Right pad labels across the page to swap gutters.
          </p>
        )}
        <div class="readit-zone-board">
          {order.map((panel, index) => (
            <div key={`${panel}-${index}`} class="readit-zone-col">
              <div class="readit-zone-label">
                {COLUMN_POSITION_LABELS[index]}
              </div>
              <div class="readit-slot-chip" data-active="false">
                {COLUMN_PANEL_LABELS[panel]}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div class="readit-section">
        <h2>Widths</h2>
        <p class="readit-muted">
          Panel-owned — travel with the panel when moved. Outer pads fill blank
          viewport edges (default 24px). Drag edges on-page when “Allow moving
          columns” is on. Nav {LAYOUT_WIDTH_LIMITS.leftNav.min}–{LAYOUT_WIDTH_LIMITS.leftNav.max}px
          (icon rail ≤168px: avatars + bold names under, section icons, hover tips); Rail {LAYOUT_WIDTH_LIMITS.rightRail.min}–{LAYOUT_WIDTH_LIMITS.rightRail.max}px
          (widgets stay readable).
          Thinning nav/rail grows the feed up to {LAYOUT_WIDTH_LIMITS.main.max}px.
          Pads max {LAYOUT_WIDTH_LIMITS.pagePad.max}px so gutters cannot starve columns.
        </p>
        <div class="readit-row">
          <span>Nav ({cfg.widths.leftNavPx}px)</span>
          <input
            type="range"
            min={LAYOUT_WIDTH_LIMITS.leftNav.min}
            max={LAYOUT_WIDTH_LIMITS.leftNav.max}
            value={cfg.widths.leftNavPx}
            disabled={cfg.placements.leftNav === "hidden"}
            onChange={(e) => {
              const v = Number(e.currentTarget.value);
              void onCommit("Nav width", (s) => {
                const order = normalizeColumnOrder(s.layoutSlots.columnOrder).filter(
                  (id) => s.layoutSlots.placements[id] !== "hidden",
                );
                const fitted = resizePanelInBudget(
                  {
                    leftNavPx: s.layoutSlots.widths.leftNavPx,
                    rightRailPx: s.layoutSlots.widths.rightRailPx,
                    feedWidthPx: s.knobs.tokens.feedWidthPx,
                    pagePadLeftPx: s.layoutSlots.widths.pagePadLeftPx ?? 24,
                    pagePadRightPx: s.layoutSlots.widths.pagePadRightPx ?? 24,
                    columnGapPx: s.layoutSlots.widths.columnGapPx ?? 12,
                  },
                  order,
                  "leftNav",
                  v,
                  window.innerWidth || document.documentElement.clientWidth || 0,
                );
                return {
                  ...s,
                  knobs: {
                    ...s.knobs,
                    tokens: {
                      ...s.knobs.tokens,
                      feedWidthPx: fitted.feedWidthPx,
                    },
                  },
                  layoutSlots: {
                    ...s.layoutSlots,
                    widths: {
                      ...s.layoutSlots.widths,
                      leftNavPx: fitted.leftNavPx,
                      rightRailPx: fitted.rightRailPx,
                      pagePadLeftPx: fitted.pagePadLeftPx,
                      pagePadRightPx: fitted.pagePadRightPx,
                      columnGapPx: fitted.columnGapPx,
                    },
                  },
                };
              });
            }}
          />
        </div>
        <div class="readit-row">
          <span>Feed ({settings.knobs.tokens.feedWidthPx}px)</span>
          <input
            type="range"
            min={LAYOUT_WIDTH_LIMITS.main.min}
            max={LAYOUT_WIDTH_LIMITS.main.max}
            value={settings.knobs.tokens.feedWidthPx}
            onChange={(e) => {
              const v = Number(e.currentTarget.value);
              void onCommit("Feed width", (s) => ({
                ...s,
                knobs: {
                  ...s.knobs,
                  tokens: { ...s.knobs.tokens, feedWidthPx: v },
                },
              }));
            }}
          />
        </div>
        <div class="readit-row">
          <span>Rail ({cfg.widths.rightRailPx}px)</span>
          <input
            type="range"
            min={LAYOUT_WIDTH_LIMITS.rightRail.min}
            max={LAYOUT_WIDTH_LIMITS.rightRail.max}
            value={cfg.widths.rightRailPx}
            disabled={cfg.placements.rightRail === "hidden"}
            onChange={(e) => {
              const v = Number(e.currentTarget.value);
              void onCommit("Rail width", (s) => {
                const order = normalizeColumnOrder(s.layoutSlots.columnOrder).filter(
                  (id) => s.layoutSlots.placements[id] !== "hidden",
                );
                const fitted = resizePanelInBudget(
                  {
                    leftNavPx: s.layoutSlots.widths.leftNavPx,
                    rightRailPx: s.layoutSlots.widths.rightRailPx,
                    feedWidthPx: s.knobs.tokens.feedWidthPx,
                    pagePadLeftPx: s.layoutSlots.widths.pagePadLeftPx ?? 24,
                    pagePadRightPx: s.layoutSlots.widths.pagePadRightPx ?? 24,
                    columnGapPx: s.layoutSlots.widths.columnGapPx ?? 12,
                  },
                  order,
                  "rightRail",
                  v,
                  window.innerWidth || document.documentElement.clientWidth || 0,
                );
                return {
                  ...s,
                  knobs: {
                    ...s.knobs,
                    tokens: {
                      ...s.knobs.tokens,
                      feedWidthPx: fitted.feedWidthPx,
                    },
                  },
                  layoutSlots: {
                    ...s.layoutSlots,
                    widths: {
                      ...s.layoutSlots.widths,
                      leftNavPx: fitted.leftNavPx,
                      rightRailPx: fitted.rightRailPx,
                      pagePadLeftPx: fitted.pagePadLeftPx,
                      pagePadRightPx: fitted.pagePadRightPx,
                      columnGapPx: fitted.columnGapPx,
                    },
                  },
                };
              });
            }}
          />
        </div>
        <div class="readit-row">
          <span>Left pad ({cfg.widths.pagePadLeftPx ?? 24}px)</span>
          <input
            type="range"
            min={LAYOUT_WIDTH_LIMITS.pagePad.min}
            max={LAYOUT_WIDTH_LIMITS.pagePad.max}
            value={cfg.widths.pagePadLeftPx ?? 24}
            onChange={(e) => {
              const v = Number(e.currentTarget.value);
              void onCommit("Left page pad", (s) => {
                const order = normalizeColumnOrder(s.layoutSlots.columnOrder).filter(
                  (id) => s.layoutSlots.placements[id] !== "hidden",
                );
                const fitted = resizePadInBudget(
                  {
                    leftNavPx: s.layoutSlots.widths.leftNavPx,
                    rightRailPx: s.layoutSlots.widths.rightRailPx,
                    feedWidthPx: s.knobs.tokens.feedWidthPx,
                    pagePadLeftPx: s.layoutSlots.widths.pagePadLeftPx ?? 24,
                    pagePadRightPx: s.layoutSlots.widths.pagePadRightPx ?? 24,
                    columnGapPx: s.layoutSlots.widths.columnGapPx ?? 12,
                  },
                  order,
                  "left",
                  v,
                  window.innerWidth || document.documentElement.clientWidth || 0,
                );
                return {
                  ...s,
                  knobs: {
                    ...s.knobs,
                    tokens: {
                      ...s.knobs.tokens,
                      feedWidthPx: fitted.feedWidthPx,
                    },
                  },
                  layoutSlots: {
                    ...s.layoutSlots,
                    widths: {
                      ...s.layoutSlots.widths,
                      leftNavPx: fitted.leftNavPx,
                      rightRailPx: fitted.rightRailPx,
                      pagePadLeftPx: fitted.pagePadLeftPx,
                      pagePadRightPx: fitted.pagePadRightPx,
                      columnGapPx: fitted.columnGapPx,
                    },
                  },
                };
              });
            }}
          />
        </div>
        <div class="readit-row">
          <span>Right pad ({cfg.widths.pagePadRightPx ?? 24}px)</span>
          <input
            type="range"
            min={LAYOUT_WIDTH_LIMITS.pagePad.min}
            max={LAYOUT_WIDTH_LIMITS.pagePad.max}
            value={cfg.widths.pagePadRightPx ?? 24}
            onChange={(e) => {
              const v = Number(e.currentTarget.value);
              void onCommit("Right page pad", (s) => {
                const order = normalizeColumnOrder(s.layoutSlots.columnOrder).filter(
                  (id) => s.layoutSlots.placements[id] !== "hidden",
                );
                const fitted = resizePadInBudget(
                  {
                    leftNavPx: s.layoutSlots.widths.leftNavPx,
                    rightRailPx: s.layoutSlots.widths.rightRailPx,
                    feedWidthPx: s.knobs.tokens.feedWidthPx,
                    pagePadLeftPx: s.layoutSlots.widths.pagePadLeftPx ?? 24,
                    pagePadRightPx: s.layoutSlots.widths.pagePadRightPx ?? 24,
                    columnGapPx: s.layoutSlots.widths.columnGapPx ?? 12,
                  },
                  order,
                  "right",
                  v,
                  window.innerWidth || document.documentElement.clientWidth || 0,
                );
                return {
                  ...s,
                  knobs: {
                    ...s.knobs,
                    tokens: {
                      ...s.knobs.tokens,
                      feedWidthPx: fitted.feedWidthPx,
                    },
                  },
                  layoutSlots: {
                    ...s.layoutSlots,
                    widths: {
                      ...s.layoutSlots.widths,
                      leftNavPx: fitted.leftNavPx,
                      rightRailPx: fitted.rightRailPx,
                      pagePadLeftPx: fitted.pagePadLeftPx,
                      pagePadRightPx: fitted.pagePadRightPx,
                      columnGapPx: fitted.columnGapPx,
                    },
                  },
                };
              });
            }}
          />
        </div>
        <div class="readit-row">
          <span>Column gap ({cfg.widths.columnGapPx ?? 12}px)</span>
          <input
            type="range"
            min={0}
            max={48}
            value={cfg.widths.columnGapPx ?? 12}
            onChange={(e) => {
              const v = Number(e.currentTarget.value);
              void onCommit("Column gap", (s) => ({
                ...s,
                layoutSlots: {
                  ...s.layoutSlots,
                  widths: { ...s.layoutSlots.widths, columnGapPx: v },
                },
              }));
            }}
          />
        </div>
      </div>

      <div class="readit-section">
        <h2>Slot health</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {LAYOUT_SLOTS.map((def) => {
            const h = healthById.get(def.id);
            const status = h?.el ? "ok" : "missing";
            return (
              <span
                key={def.id}
                class={
                  status === "ok" ? "readit-health-ok" : "readit-health-degraded"
                }
                style={{ fontSize: 12 }}
              >
                {def.id}: {status}
              </span>
            );
          })}
        </div>
      </div>

      <div class="readit-section">
        <h2>Page edit</h2>
        <button
          type="button"
          class={`readit-btn${cfg.editMode ? " primary" : ""}`}
          disabled={!settings.flags.layoutSlots || settings.paused}
          onClick={() => {
            const next = !cfg.editMode;
            void onCommit(next ? "Allow column moves" : "Lock columns", (s) => ({
              ...s,
              flags: { ...s.flags, layoutSlots: true },
              layoutSlots: { ...s.layoutSlots, editMode: next },
            }));
            if (next) onCloseDrawer();
          }}
        >
          {cfg.editMode
            ? "Editing on page — Esc to lock"
            : "Edit on page (drag cards + edges)"}
        </button>
      </div>
    </>
  );
}

type CtxAction =
  | { type: "hideSlot" }
  | { type: "moveSlot"; zone: LayoutZone }
  | { type: "resetPreset" }
  | { type: "hideEl" }
  | { type: "dimEl" }
  | { type: "unhideEl" };

function LayoutContextMenu({
  menu,
  onClose,
  onAction,
}: {
  menu: CtxMenuState;
  onClose: () => void;
  onAction: (action: CtxAction) => void;
}) {
  const isSlot = Boolean(menu.slotId);
  return (
    <div
      class="readit-ctx-menu"
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {isSlot &&
        (menu.slotId === "leftNav" ||
          menu.slotId === "main" ||
          menu.slotId === "rightRail") && (
          <>
            {menu.slotId !== "main" && (
              <button
                type="button"
                onClick={() => onAction({ type: "hideSlot" })}
              >
                Hide panel
              </button>
            )}
            <button
              type="button"
              onClick={() => onAction({ type: "moveSlot", zone: "left" })}
            >
              Swap to Left
            </button>
            <button
              type="button"
              onClick={() => onAction({ type: "moveSlot", zone: "center" })}
            >
              Swap to Center
            </button>
            <button
              type="button"
              onClick={() => onAction({ type: "moveSlot", zone: "right" })}
            >
              Swap to Right
            </button>
            <button
              type="button"
              onClick={() => onAction({ type: "resetPreset" })}
            >
              Reset to Classic
            </button>
          </>
        )}
      {isSlot && menu.slotId === "subHeader" && (
        <>
          <button type="button" onClick={() => onAction({ type: "hideSlot" })}>
            Hide slot
          </button>
          <button
            type="button"
            onClick={() => onAction({ type: "resetPreset" })}
          >
            Reset to Classic
          </button>
        </>
      )}
      {!isSlot && (
        <>
          <button type="button" onClick={() => onAction({ type: "hideEl" })}>
            Hide element
          </button>
          <button type="button" onClick={() => onAction({ type: "dimEl" })}>
            Dim element
          </button>
          <button type="button" onClick={() => onAction({ type: "unhideEl" })}>
            Unhide matching rule
          </button>
        </>
      )}
      <button type="button" class="readit-ctx-cancel" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}

function SimpleTab({
  settings,
  onProfile,
  onCommit,
  onPause,
  onExport,
  onImportClick,
  onReading,
  onPicker,
}: {
  settings: ReaditSettings;
  onProfile: (id: string) => void;
  onCommit: (
    label: string,
    mutator: (s: ReaditSettings) => ReaditSettings,
  ) => Promise<void>;
  onPause: () => void;
  onExport: () => void;
  onImportClick: () => void;
  onReading: () => void;
  onPicker: () => void;
}) {
  return (
    <>
      <div class="readit-section">
        <h2>Profiles</h2>
        <p class="readit-muted">{t(settings.studioLocale, "brandBlurb")}</p>
        {settings.profiles.map((p) => {
          const layoutBlurb = formatProfileLayoutBlurb(p);
          return (
            <div
              key={p.id}
              class="readit-card"
              data-active={String(p.id === settings.activeProfileId)}
              onClick={() => onProfile(p.id)}
            >
              <strong>{p.name}</strong>
              <span>{p.description}</span>
              {layoutBlurb && <span class="readit-muted">{layoutBlurb}</span>}
            </div>
          );
        })}
      </div>

      <div class="readit-section">
        <h2>Simple knobs</h2>
        <div class="readit-row">
          <span>Feed width ({settings.knobs.tokens.feedWidthPx}px)</span>
          <input
            type="range"
            min={480}
            max={1600}
            value={settings.knobs.tokens.feedWidthPx}
            onInput={(e) => {
              const v = Number(e.currentTarget.value);
              document.documentElement.style.setProperty(
                "--readit-feed-width",
                `${v}px`,
              );
            }}
            onChange={(e) => {
              const v = Number(e.currentTarget.value);
              void onCommit("Feed width", (s) => ({
                ...s,
                knobs: {
                  ...s.knobs,
                  tokens: { ...s.knobs.tokens, feedWidthPx: v },
                },
              }));
            }}
          />
        </div>
        <div class="readit-row">
          <span>Density</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.knobs.tokens.density * 100)}
            onChange={(e) => {
              const v = Number(e.currentTarget.value) / 100;
              void onCommit("Density", (s) => ({
                ...s,
                knobs: {
                  ...s.knobs,
                  tokens: { ...s.knobs.tokens, density: v },
                },
              }));
            }}
          />
        </div>
        <div class="readit-row">
          <span>Font scale</span>
          <input
            type="range"
            min={85}
            max={140}
            value={Math.round(settings.knobs.tokens.fontScale * 100)}
            onChange={(e) => {
              const v = Number(e.currentTarget.value) / 100;
              void onCommit("Font scale", (s) => ({
                ...s,
                knobs: {
                  ...s.knobs,
                  tokens: { ...s.knobs.tokens, fontScale: v },
                },
              }));
            }}
          />
        </div>
        {(
          [
            ["promoted", "Hide promoted"],
            ["recommended", "Hide recommended"],
            ["sidebars", "Hide sidebars"],
            ["getApp", "Hide Get App"],
          ] as const
        ).map(([key, label]) => (
          <div class="readit-row" key={key}>
            <label>
              <input
                type="checkbox"
                checked={settings.knobs.hide[key]}
                onChange={(e) => {
                  const checked = e.currentTarget.checked;
                  if (key === "sidebars") {
                    void onCommit(label, (s) => syncSidebarsHide(s, checked));
                    return;
                  }
                  void onCommit(label, (s) => ({
                    ...s,
                    knobs: {
                      ...s.knobs,
                      hide: { ...s.knobs.hide, [key]: checked },
                    },
                  }));
                }}
              />
              {label}
            </label>
          </div>
        ))}
        <h2 style={{ marginTop: 14 }}>{t(settings.studioLocale, "noisePack")}</h2>
        {(
          [
            ["joinConversation", "joinConversation"],
            ["relatedCommunities", "relatedCommunities"],
            ["redditPro", "redditPro"],
            ["aiSummary", "aiSummary"],
            ["searchAnswers", "searchAnswers"],
            ["announcements", "announcements"],
            ["premiumUpsell", "premiumUpsell"],
            ["awards", "awards"],
            ["crosspost", "crosspost"],
            ["joinButton", "joinButton"],
          ] as const
        ).map(([key, labelKey]) => (
          <div class="readit-row" key={key}>
            <label>
              <input
                type="checkbox"
                checked={Boolean(settings.knobs.hide[key])}
                onChange={(e) => {
                  const checked = e.currentTarget.checked;
                  const label =
                    labelKey === "premiumUpsell"
                      ? "Hide Premium upsell"
                      : t(settings.studioLocale, labelKey);
                  void onCommit(label, (s) => ({
                    ...s,
                    knobs: {
                      ...s.knobs,
                      hide: { ...s.knobs.hide, [key]: checked },
                    },
                    flags: { ...s.flags, hideNoise: true },
                  }));
                }}
              />
              {labelKey === "premiumUpsell"
                ? "Hide Premium upsell"
                : t(settings.studioLocale, labelKey)}
            </label>
          </div>
        ))}
        <h2 style={{ marginTop: 14 }}>{t(settings.studioLocale, "feedPhilosophy")}</h2>
        <div class="readit-row">
          <label>
            <input
              type="checkbox"
              checked={settings.flags.followingFeed}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                void onCommit(t(settings.studioLocale, "followingFeed"), (s) => ({
                  ...s,
                  flags: { ...s.flags, followingFeed: checked },
                  feedPrefs: { ...s.feedPrefs, followingDefault: checked },
                }));
              }}
            />
            {t(settings.studioLocale, "followingFeed")}
          </label>
        </div>
        <div class="readit-row">
          <label>
            <input
              type="checkbox"
              checked={settings.flags.lurkerMode}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                void onCommit(t(settings.studioLocale, "lurkerMode"), (s) => ({
                  ...s,
                  flags: { ...s.flags, lurkerMode: checked },
                }));
              }}
            />
            {t(settings.studioLocale, "lurkerMode")}
          </label>
        </div>
        <div class="readit-row">
          <span>{t(settings.studioLocale, "feedDensity")}</span>
          <select
            class="readit-select"
            style={{ width: 160 }}
            value={settings.feedPrefs.feedDensity}
            onChange={(e) => {
              const value = e.currentTarget.value as "comfortable" | "compact";
              void onCommit(t(settings.studioLocale, "feedDensity"), (s) => ({
                ...s,
                feedPrefs: { ...s.feedPrefs, feedDensity: value },
              }));
            }}
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </div>
        <div class="readit-row">
          <span>Media</span>
          <select
            class="readit-select"
            style={{ width: 160 }}
            value={settings.knobs.mediaMode}
            onChange={(e) => {
              const value = e.currentTarget.value as ReaditSettings["knobs"]["mediaMode"];
              void onCommit("Media mode", (s) => ({
                ...s,
                knobs: { ...s.knobs, mediaMode: value },
              }));
            }}
          >
            <option value="normal">Normal</option>
            <option value="links_on_feed">Links on feed</option>
            <option value="autoplay_off">Autoplay off</option>
          </select>
        </div>
        <div class="readit-row">
          <label>
            <input
              type="checkbox"
              checked={settings.knobs.quietNsfw}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                void onCommit("Quiet NSFW", (s) => ({
                  ...s,
                  knobs: { ...s.knobs, quietNsfw: checked },
                  filters: checked
                    ? ensureNsfwFilter(s.filters)
                    : s.filters.filter((f) => f.id !== "nsfw_quiet"),
                }));
              }}
            />
            Quiet NSFW
          </label>
        </div>
      </div>

      <div class="readit-section">
        <h2>Actions</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" class="readit-btn primary" onClick={onReading}>
            Reading mode
          </button>
          <button type="button" class="readit-btn" onClick={onPicker}>
            Element picker
          </button>
          <button type="button" class="readit-btn" onClick={onPause}>
            {settings.paused ? "Resume" : "Pause"}
          </button>
          <button type="button" class="readit-btn" onClick={onExport}>
            Export
          </button>
          <button type="button" class="readit-btn" onClick={onImportClick}>
            Import
          </button>
        </div>
        <div class="readit-row">
          <label>
            <input
              type="checkbox"
              checked={settings.syncLightweight}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                void onCommit("Lightweight sync", (s) => ({
                  ...s,
                  syncLightweight: checked,
                }));
              }}
            />
            Sync lightweight prefs (profile id / mode / pause)
          </label>
        </div>
        {settings.toolboxDetected && (
          <p class="readit-muted" style={{ marginTop: 10 }}>
            Moderator Toolbox detected — overlapping Mod Desk modules soft-disabled.
          </p>
        )}
      </div>
    </>
  );
}

function AdvancedTab({
  settings,
  health,
  onCommit,
  onPicker,
}: {
  settings: ReaditSettings;
  health: Record<string, string>;
  onCommit: (
    label: string,
    mutator: (s: ReaditSettings) => ReaditSettings,
  ) => Promise<void>;
  onPicker: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = ALL_FEATURES.filter((f) => {
    const hay = `${f.label} ${f.description} ${f.category}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <>
      <div class="readit-section">
        <h2>{t(settings.studioLocale, "healthOverview")}</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {(["ok", "degraded", "broken"] as const).map((status) => {
            const n = Object.values(health).filter((h) => h === status).length;
            return (
              <span class={`readit-health-${status}`} style={{ fontSize: 12 }}>
                {status}: {n}
              </span>
            );
          })}
        </div>
        <div class="readit-list" style={{ marginTop: 8 }}>
          {ALL_FEATURES.filter((f) => (health[f.id] || "ok") !== "ok").map(
            (f) => (
              <div class="readit-list-item">
                <div class="readit-row">
                  <span>{f.label}</span>
                  <span class={`readit-health-${health[f.id] || "ok"}`}>
                    {health[f.id] || "ok"}
                  </span>
                </div>
              </div>
            ),
          )}
        </div>
      </div>

      <div class="readit-section">
        <h2>{t(settings.studioLocale, "locale")}</h2>
        <select
          class="readit-select"
          value={settings.studioLocale}
          onChange={(e) => {
            const value = e.currentTarget.value as StudioLocale;
            void onCommit("Studio locale", (s) => ({
              ...s,
              studioLocale: value,
            }));
          }}
        >
          {STUDIO_LOCALES.map((loc) => (
            <option value={loc.id}>{loc.label}</option>
          ))}
        </select>
      </div>

      <div class="readit-section">
        <h2>{t(settings.studioLocale, "keyboardMode")}</h2>
        <p class="readit-muted">{t(settings.studioLocale, "keyboardCheat")}</p>
        <div class="readit-row">
          <label>
            <input
              type="checkbox"
              checked={settings.flags.keyboardNav}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                void onCommit("Keyboard navigation", (s) => ({
                  ...s,
                  flags: { ...s.flags, keyboardNav: checked },
                }));
              }}
            />
            Enable keyboard nav feature
          </label>
        </div>
        <div class="readit-row">
          <span>{t(settings.studioLocale, "keyboardMode")}</span>
          <select
            class="readit-select"
            style={{ width: 200 }}
            value={settings.keyboardNavPrefs.mode}
            disabled={!settings.flags.keyboardNav}
            onChange={(e) => {
              const value = e.currentTarget.value as "defer" | "readit";
              void onCommit(t(settings.studioLocale, "keyboardMode"), (s) => ({
                ...s,
                keyboardNavPrefs: { ...s.keyboardNavPrefs, mode: value },
              }));
            }}
          >
            <option value="defer">{t(settings.studioLocale, "keyboardDefer")}</option>
            <option value="readit">{t(settings.studioLocale, "keyboardReadit")}</option>
          </select>
        </div>
      </div>

      <div class="readit-section">
        <h2>Mode</h2>
        <div class="readit-row">
          <label>
            <input
              type="radio"
              name="mode"
              checked={settings.mode === "simple"}
              onChange={() =>
                void onCommit("Simple mode", (s) => ({ ...s, mode: "simple" }))
              }
            />
            Prefer Simple
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              checked={settings.mode === "advanced"}
              onChange={() =>
                void onCommit("Advanced mode", (s) => ({
                  ...s,
                  mode: "advanced",
                }))
              }
            />
            Prefer Advanced
          </label>
        </div>
        <button type="button" class="readit-btn" onClick={onPicker}>
          Pick element to hide
        </button>
      </div>

      <div class="readit-section">
        <h2>Features</h2>
        <input
          class="readit-input"
          placeholder="Search features…"
          value={q}
          onInput={(e) => setQ(e.currentTarget.value)}
        />
        <div class="readit-list" style={{ marginTop: 8 }}>
          {filtered.map((f) => {
            const enabled =
              f.id in settings.flags
                ? Boolean(
                    settings.flags[f.id as keyof typeof settings.flags],
                  )
                : true;
            const h = health[f.id] || "ok";
            return (
              <div class="readit-list-item" key={f.id}>
                <div class="readit-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        void onCommit(f.label, (s) => ({
                          ...s,
                          flags: { ...s.flags, [f.id]: checked },
                        }));
                      }}
                    />
                    <strong>{f.label}</strong>
                  </label>
                  <span class={`readit-health-${h}`}>{h}</span>
                </div>
                <div class="readit-muted">
                  {f.category} · {f.tier} · {f.description}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div class="readit-section">
        <h2>Element rules</h2>
        {settings.elementRules.length === 0 && (
          <p class="readit-muted">No picker rules yet.</p>
        )}
        {settings.elementRules.map((rule) => (
          <div class="readit-list-item" key={rule.id}>
            <div class="readit-row">
              <code style={{ fontSize: 11 }}>{rule.selector}</code>
              <button
                type="button"
                class="readit-btn"
                onClick={() =>
                  void onCommit("Remove rule", (s) => ({
                    ...s,
                    elementRules: s.elementRules.filter((r) => r.id !== rule.id),
                  }))
                }
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div class="readit-section">
        <h2>Per-subreddit override</h2>
        <SubOverrideForm
          onAdd={(sub, width) =>
            void onCommit("Sub override", (s) => ({
              ...s,
              subredditOverrides: [
                ...s.subredditOverrides.filter(
                  (o) => o.subreddit.toLowerCase() !== sub.toLowerCase(),
                ),
                {
                  subreddit: sub,
                  tokens: { feedWidthPx: width },
                },
              ],
            }))
          }
        />
        {settings.subredditOverrides.map((o) => (
          <div class="readit-list-item" key={o.subreddit}>
            r/{o.subreddit} · width {o.tokens?.feedWidthPx ?? "—"}
          </div>
        ))}
      </div>
    </>
  );
}

function CurateTab({
  settings,
  onCommit,
}: {
  settings: ReaditSettings;
  onCommit: (
    label: string,
    mutator: (s: ReaditSettings) => ReaditSettings,
  ) => Promise<void>;
}) {
  const [kind, setKind] = useState<FilterRule["kind"]>("keyword");
  const [pattern, setPattern] = useState("");
  const [tagUser, setTagUser] = useState("");
  const [tagLabel, setTagLabel] = useState("");
  const patternRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div class="readit-section">
        <h2>Filters</h2>
        <select
          class="readit-select"
          value={kind}
          onChange={(e) => setKind(e.currentTarget.value as FilterRule["kind"])}
        >
          <option value="keyword">Keyword</option>
          <option value="user">User</option>
          <option value="subreddit">Subreddit</option>
          <option value="url">URL</option>
          <option value="flair">Flair</option>
          <option value="karmaMax">Karma ≤ (number)</option>
        </select>
        <div style={{ height: 8 }} />
        <input
          ref={patternRef}
          class="readit-input"
          placeholder="Pattern"
          value={pattern}
          onInput={(e) => setPattern(e.currentTarget.value)}
        />
        <div style={{ height: 8 }} />
        <button
          type="button"
          class="readit-btn primary"
          onClick={() => {
            const value = (patternRef.current?.value || pattern).trim();
            if (!value) return;
            const rule: FilterRule = {
              id: createId("flt"),
              kind,
              pattern: value,
              enabled: true,
            };
            void onCommit("Add filter", (s) => ({
              ...s,
              filters: [...s.filters, rule],
              flags: { ...s.flags, filters: true },
            }));
            setPattern("");
            if (patternRef.current) patternRef.current.value = "";
          }}
        >
          Add filter
        </button>
        <div class="readit-list" style={{ marginTop: 8 }}>
          {settings.filters.map((f) => (
            <div class="readit-list-item" key={f.id}>
              <div class="readit-row">
                <span>
                  {f.kind}: {f.pattern}
                </span>
                <button
                  type="button"
                  class="readit-btn"
                  onClick={() =>
                    void onCommit("Remove filter", (s) => ({
                      ...s,
                      filters: s.filters.filter((x) => x.id !== f.id),
                    }))
                  }
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div class="readit-section">
        <h2>Quick block helpers</h2>
        <p class="readit-muted">
          Adds a filter for the current subreddit or a typed user (one click).
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            class="readit-btn"
            onClick={() => {
              const sub = location.pathname.match(/^\/r\/([^/]+)/i)?.[1];
              if (!sub) return;
              void onCommit(`Block r/${sub}`, (s) => ({
                ...s,
                filters: [
                  ...s.filters,
                  {
                    id: createId("flt"),
                    kind: "subreddit",
                    pattern: sub,
                    enabled: true,
                  },
                ],
                flags: { ...s.flags, filters: true },
              }));
            }}
          >
            Block this subreddit
          </button>
          <button
            type="button"
            class="readit-btn"
            onClick={() => {
              const user = tagUser.trim().replace(/^u\//i, "");
              if (!user) return;
              void onCommit(`Block u/${user}`, (s) => ({
                ...s,
                filters: [
                  ...s.filters,
                  {
                    id: createId("flt"),
                    kind: "user",
                    pattern: user,
                    enabled: true,
                  },
                ],
                flags: { ...s.flags, filters: true },
              }));
            }}
          >
            Block typed user
          </button>
        </div>
      </div>

      <div class="readit-section">
        <h2>User tags</h2>
        <input
          class="readit-input"
          placeholder="username"
          value={tagUser}
          onInput={(e) => setTagUser(e.currentTarget.value)}
        />
        <div style={{ height: 8 }} />
        <input
          class="readit-input"
          placeholder="label"
          value={tagLabel}
          onInput={(e) => setTagLabel(e.currentTarget.value)}
        />
        <div style={{ height: 8 }} />
        <button
          type="button"
          class="readit-btn primary"
          onClick={() => {
            if (!tagUser.trim() || !tagLabel.trim()) return;
            const tag: UserTag = {
              username: tagUser.trim().replace(/^u\//, ""),
              label: tagLabel.trim(),
              color: "#0079d3",
              note: "",
              severity: "info",
              updatedAt: Date.now(),
            };
            void onCommit("Add tag", (s) => ({
              ...s,
              tags: [
                ...s.tags.filter(
                  (t) => t.username.toLowerCase() !== tag.username.toLowerCase(),
                ),
                tag,
              ],
              flags: { ...s.flags, userTags: true },
            }));
            setTagUser("");
            setTagLabel("");
          }}
        >
          Save tag
        </button>
        <div class="readit-list" style={{ marginTop: 8 }}>
          {settings.tags.map((t) => (
            <div class="readit-list-item" key={t.username}>
              u/{t.username} — {t.label}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function CreateTab({
  settings,
  onCommit,
  flash,
}: {
  settings: ReaditSettings;
  onCommit: (
    label: string,
    mutator: (s: ReaditSettings) => ReaditSettings,
  ) => Promise<void>;
  flash: (msg: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  return (
    <>
      <div class="readit-section">
        <h2>Feed & comments</h2>
        <div class="readit-row">
          <label>
            <input
              type="checkbox"
              checked={settings.flags.markRead}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                void onCommit(t(settings.studioLocale, "markRead"), (s) => ({
                  ...s,
                  flags: { ...s.flags, markRead: checked },
                  markReadPrefs: {
                    ...s.markReadPrefs,
                    mode: checked
                      ? s.markReadPrefs.mode === "off"
                        ? "open"
                        : s.markReadPrefs.mode
                      : "off",
                  },
                }));
              }}
            />
            {t(settings.studioLocale, "markRead")}
          </label>
        </div>
        <div class="readit-row">
          <span>Mark mode</span>
          <select
            class="readit-select"
            style={{ width: 140 }}
            value={settings.markReadPrefs.mode}
            onChange={(e) => {
              const mode = e.currentTarget.value as MarkReadMode;
              void onCommit("Mark-read mode", (s) => ({
                ...s,
                flags: { ...s.flags, markRead: mode !== "off" },
                markReadPrefs: { ...s.markReadPrefs, mode },
              }));
            }}
          >
            <option value="off">Off</option>
            <option value="open">On open</option>
            <option value="onScroll">On scroll</option>
          </select>
        </div>
        <div class="readit-row">
          <label>
            <input
              type="checkbox"
              checked={settings.flags.antiRefresh}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                void onCommit(t(settings.studioLocale, "antiRefresh"), (s) => ({
                  ...s,
                  flags: { ...s.flags, antiRefresh: checked },
                }));
              }}
            />
            {t(settings.studioLocale, "antiRefresh")}
          </label>
        </div>
        <div class="readit-row">
          <label>
            <input
              type="checkbox"
              checked={settings.flags.commentUx}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                void onCommit(t(settings.studioLocale, "commentUx"), (s) => ({
                  ...s,
                  flags: { ...s.flags, commentUx: checked },
                }));
              }}
            />
            {t(settings.studioLocale, "commentUx")}
          </label>
        </div>
        <button
          type="button"
          class="readit-btn"
          onClick={() => {
            const switcher =
              document.querySelector<HTMLElement>(
                'button[aria-label*="account" i], button[id*="USER_DROPDOWN" i], [data-testid="user-drawer-button"]',
              ) || null;
            if (switcher) {
              switcher.click();
              flash("Opened account menu");
              return;
            }
            location.assign("https://www.reddit.com/settings/account");
          }}
        >
          {t(settings.studioLocale, "accountSwitcher")}
        </button>
      </div>

      <div class="readit-section">
        <h2>Canned replies</h2>
        <input
          class="readit-input"
          placeholder="Title"
          value={title}
          onInput={(e) => setTitle(e.currentTarget.value)}
        />
        <div style={{ height: 8 }} />
        <textarea
          class="readit-textarea"
          placeholder="Body"
          value={body}
          onInput={(e) => setBody(e.currentTarget.value)}
        />
        <div style={{ height: 8 }} />
        <button
          type="button"
          class="readit-btn primary"
          onClick={() => {
            if (!title.trim() || !body.trim()) return;
            void onCommit("Add canned reply", (s) => ({
              ...s,
              cannedReplies: [
                ...s.cannedReplies,
                { id: createId("cr"), title: title.trim(), body: body.trim() },
              ],
              flags: { ...s.flags, cannedReplies: true },
            }));
            setTitle("");
            setBody("");
          }}
        >
          Save reply
        </button>
        <div class="readit-list" style={{ marginTop: 8 }}>
          {settings.cannedReplies.map((r) => (
            <div class="readit-list-item" key={r.id}>
              <div class="readit-row">
                <strong>{r.title}</strong>
                <button
                  type="button"
                  class="readit-btn"
                  onClick={async () => {
                    await navigator.clipboard.writeText(r.body);
                    flash("Copied reply");
                  }}
                >
                  Copy
                </button>
              </div>
              <div class="readit-muted">{r.body}</div>
            </div>
          ))}
        </div>
      </div>

      <div class="readit-section">
        <h2>Clean link</h2>
        <button
          type="button"
          class="readit-btn"
          onClick={async () => {
            const cleaned = cleanRedditUrl(location.href);
            const short = toReddIt(location.href);
            await navigator.clipboard.writeText(short || cleaned);
            flash(short ? `Copied ${short}` : "Copied clean URL");
          }}
        >
          Copy clean / redd.it link
        </button>
        <div class="readit-row" style={{ marginTop: 8 }}>
          <label>
            <input
              type="checkbox"
              checked={settings.flags.absoluteTimestamps}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                void onCommit("Absolute timestamps", (s) => ({
                  ...s,
                  flags: { ...s.flags, absoluteTimestamps: checked },
                }));
              }}
            />
            Absolute timestamps
          </label>
        </div>
        <div class="readit-row">
          <label>
            <input
              type="checkbox"
              checked={settings.flags.opHighlight}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                void onCommit("OP highlight", (s) => ({
                  ...s,
                  flags: { ...s.flags, opHighlight: checked },
                }));
              }}
            />
            Highlight OP
          </label>
        </div>
        <div class="readit-row">
          <label>
            <input
              type="checkbox"
              checked={settings.flags.alwaysShowActions}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                void onCommit("Always show actions", (s) => ({
                  ...s,
                  flags: { ...s.flags, alwaysShowActions: checked },
                }));
              }}
            />
            Always show actions
          </label>
        </div>
      </div>
    </>
  );
}

function ModTab({
  settings,
  onCommit,
  flash,
}: {
  settings: ReaditSettings;
  onCommit: (
    label: string,
    mutator: (s: ReaditSettings) => ReaditSettings,
  ) => Promise<void>;
  flash: (msg: string) => void;
}) {
  const [user, setUser] = useState("");
  const [note, setNote] = useState("");
  const [macroTitle, setMacroTitle] = useState("");
  const [macroBody, setMacroBody] = useState("");

  return (
    <>
      {settings.toolboxDetected && (
        <p class="readit-muted">
          Toolbox detected — Mod quick actions / usernote markers soft-disabled to
          avoid DOM fights.
        </p>
      )}
      <div class="readit-section">
        <h2>Mod Desk toggles</h2>
        {(
          [
            ["modQuickActions", "Quick actions"],
            ["modMacros", "Macros"],
            ["modUsernotes", "Usernotes"],
            ["modHighlight", "Highlighting"],
            ["queueDensity", "Queue density"],
            ["macroBar", "Macro bar"],
            ["showNotes", "Show notes"],
          ] as const
        ).map(([key, label]) => {
          const checked =
            key in settings.flags
              ? Boolean(settings.flags[key as keyof typeof settings.flags])
              : Boolean(settings.knobs[key as keyof typeof settings.knobs]);
          return (
            <div class="readit-row" key={key}>
              <label>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const on = e.currentTarget.checked;
                    void onCommit(label, (s) => {
                      if (key in s.flags) {
                        return {
                          ...s,
                          flags: { ...s.flags, [key]: on },
                        };
                      }
                      return {
                        ...s,
                        knobs: { ...s.knobs, [key]: on },
                      };
                    });
                  }}
                />
                {label}
              </label>
            </div>
          );
        })}
      </div>

      <div class="readit-section">
        <h2>Macros</h2>
        <input
          class="readit-input"
          placeholder="Title"
          value={macroTitle}
          onInput={(e) => setMacroTitle(e.currentTarget.value)}
        />
        <div style={{ height: 8 }} />
        <textarea
          class="readit-textarea"
          placeholder="Macro body"
          value={macroBody}
          onInput={(e) => setMacroBody(e.currentTarget.value)}
        />
        <div style={{ height: 8 }} />
        <button
          type="button"
          class="readit-btn primary"
          onClick={() => {
            if (!macroTitle.trim() || !macroBody.trim()) return;
            void onCommit("Add macro", (s) => ({
              ...s,
              modMacros: [
                ...s.modMacros,
                {
                  id: createId("mm"),
                  title: macroTitle.trim(),
                  body: macroBody.trim(),
                  kind: "removal",
                },
              ],
              flags: { ...s.flags, modMacros: true },
            }));
            setMacroTitle("");
            setMacroBody("");
          }}
        >
          Save macro
        </button>
        <div class="readit-list" style={{ marginTop: 8 }}>
          {settings.modMacros.map((m) => (
            <div class="readit-list-item" key={m.id}>
              <div class="readit-row">
                <strong>
                  [{m.kind}] {m.title}
                </strong>
                <button
                  type="button"
                  class="readit-btn"
                  onClick={async () => {
                    await navigator.clipboard.writeText(m.body);
                    flash("Macro copied");
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div class="readit-section">
        <h2>Usernotes (local)</h2>
        <input
          class="readit-input"
          placeholder="username"
          value={user}
          onInput={(e) => setUser(e.currentTarget.value)}
        />
        <div style={{ height: 8 }} />
        <textarea
          class="readit-textarea"
          placeholder="Note"
          value={note}
          onInput={(e) => setNote(e.currentTarget.value)}
        />
        <div style={{ height: 8 }} />
        <button
          type="button"
          class="readit-btn primary"
          onClick={() => {
            if (!user.trim() || !note.trim()) return;
            const entry: UserNote = {
              id: createId("un"),
              username: user.trim().replace(/^u\//, ""),
              type: "misc",
              text: note.trim(),
              link: location.href,
              createdAt: Date.now(),
            };
            void onCommit("Add usernote", (s) => ({
              ...s,
              usernotes: [...s.usernotes, entry],
              flags: { ...s.flags, modUsernotes: true, modHighlight: true },
            }));
            setUser("");
            setNote("");
          }}
        >
          Save note
        </button>
        <div class="readit-list" style={{ marginTop: 8 }}>
          {settings.usernotes.map((n) => (
            <div class="readit-list-item" key={n.id}>
              u/{n.username}: {n.text}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function LibraryTab({
  settings,
  onCommit,
}: {
  settings: ReaditSettings;
  onCommit: (
    label: string,
    mutator: (s: ReaditSettings) => ReaditSettings,
  ) => Promise<void>;
}) {
  return (
    <div class="readit-section">
      <h2>Reading queue / saves</h2>
      <button
        type="button"
        class="readit-btn primary"
        onClick={() => {
          const title =
            document.querySelector("h1")?.textContent?.trim() ||
            document.title;
          void onCommit("Save page", (s) => ({
            ...s,
            savedItems: [
              {
                id: createId("sv"),
                url: location.href,
                title,
                folderId: "queue",
                addedAt: Date.now(),
              },
              ...s.savedItems,
            ],
            flags: { ...s.flags, savedLibrary: true },
          }));
        }}
      >
        Save current page to queue
      </button>
      <div class="readit-list" style={{ marginTop: 8 }}>
        {settings.savedFolders.map((folder) => (
          <div key={folder.id}>
            <strong>{folder.name}</strong>
            {settings.savedItems
              .filter((i) => i.folderId === folder.id)
              .map((item) => (
                <div class="readit-list-item" key={item.id}>
                  <div class="readit-row">
                    <a href={item.url} style={{ color: "#7db7ff" }}>
                      {item.title}
                    </a>
                    <button
                      type="button"
                      class="readit-btn"
                      onClick={() =>
                        void onCommit("Remove save", (s) => ({
                          ...s,
                          savedItems: s.savedItems.filter((x) => x.id !== item.id),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CqsTab({
  settings,
  onCommit,
  flash,
}: {
  settings: ReaditSettings;
  onCommit: (
    label: string,
    mutator: (s: ReaditSettings) => ReaditSettings,
  ) => Promise<void>;
  flash: (msg: string) => void;
}) {
  const tier = latestCqsTier(settings.cqsSnapshots);
  const risk = computeCqsRiskScore(settings.cqsRiskEvents);
  const riskTone =
    risk >= 60 ? "#f08fa4" : risk >= 30 ? "#ffb84d" : "#7dcea0";

  return (
    <>
      <div class="readit-section">
        <h2>Contributor Quality Score</h2>
        <p class="readit-muted">
          Reddit only exposes a <strong>tier</strong> (not a raw score). Ground
          truth comes from{" "}
          <a
            href="https://www.reddit.com/r/WhatIsMyCQS/"
            style={{ color: "#7db7ff" }}
          >
            r/WhatIsMyCQS
          </a>
          . The risk meter is a local heuristic — never labeled as estimated CQS.
        </p>
        <div class="readit-row" style={{ marginTop: 10 }}>
          <label>
            <input
              type="checkbox"
              checked={settings.flags.cqsTracker}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                void onCommit("CQS tracker", (s) => ({
                  ...s,
                  flags: { ...s.flags, cqsTracker: checked },
                }));
              }}
            />
            Enable CQS tracker (bot parse + pre-submit risk checks)
          </label>
        </div>
      </div>

      <div class="readit-section">
        <h2>Current tier</h2>
        <div class="readit-row">
          <strong style={{ fontSize: 22 }}>{tier ?? "Unknown"}</strong>
          <span class="readit-muted">
            {settings.cqsSnapshots[0]
              ? `Checked ${new Date(settings.cqsSnapshots[0].checkedAt).toLocaleString()} · ${settings.cqsSnapshots[0].source}`
              : "No checks logged yet"}
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          <button
            type="button"
            class="readit-btn primary"
            onClick={() => {
              location.assign("https://www.reddit.com/r/WhatIsMyCQS/");
            }}
          >
            Check on r/WhatIsMyCQS
          </button>
          <select
            class="readit-select"
            value={tier ?? ""}
            onChange={(e) => {
              const value = e.currentTarget.value as CqsTier | "";
              if (!value) return;
              void onCommit("Manual CQS tier", (s) => ({
                ...s,
                cqsSnapshots: [
                  {
                    id: createId("cqs"),
                    tier: value,
                    checkedAt: Date.now(),
                    source: "manual" as const,
                    note: "",
                  },
                  ...s.cqsSnapshots,
                ].slice(0, 40),
                flags: { ...s.flags, cqsTracker: true },
              }));
            }}
          >
            <option value="">Log tier manually…</option>
            {CQS_TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div class="readit-section">
        <h2>Contribution risk (heuristic)</h2>
        <div class="readit-row">
          <strong style={{ color: riskTone, fontSize: 20 }}>{risk}</strong>
          <span class="readit-muted">0–100 from recent local events (24h decay)</span>
        </div>
        <div class="readit-row">
          <label>
            <input
              type="checkbox"
              checked={settings.cqsPrefs.warnBurst}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                void onCommit("CQS burst warn", (s) => ({
                  ...s,
                  cqsPrefs: { ...s.cqsPrefs, warnBurst: checked },
                }));
              }}
            />
            Warn on burst submits
          </label>
        </div>
        <div class="readit-row">
          <label>
            <input
              type="checkbox"
              checked={settings.cqsPrefs.warnDuplicate}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                void onCommit("CQS dup warn", (s) => ({
                  ...s,
                  cqsPrefs: { ...s.cqsPrefs, warnDuplicate: checked },
                }));
              }}
            />
            Warn on near-duplicate drafts
          </label>
        </div>
        <div class="readit-row">
          <label>
            <input
              type="checkbox"
              checked={settings.cqsPrefs.warnPromo}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                void onCommit("CQS promo warn", (s) => ({
                  ...s,
                  cqsPrefs: { ...s.cqsPrefs, warnPromo: checked },
                }));
              }}
            />
            Warn on promo / link-heavy drafts
          </label>
        </div>
        <p class="readit-muted" style={{ marginTop: 8 }}>
          Official tip: verify your email in Reddit prefs — Help lists account
          security as a CQS signal. Avoid removals, bans, and spam-like bursts.
        </p>
        <a
          href="https://www.reddit.com/settings/account"
          style={{ color: "#7db7ff", fontSize: 12 }}
        >
          Open Reddit account settings
        </a>
      </div>

      <div class="readit-section">
        <h2>Tier history</h2>
        {settings.cqsSnapshots.length === 0 && (
          <p class="readit-muted">No snapshots yet.</p>
        )}
        <div class="readit-list">
          {settings.cqsSnapshots.slice(0, 12).map((s) => (
            <div class="readit-list-item" key={s.id}>
              <strong>{s.tier}</strong>
              <div class="readit-muted">
                {new Date(s.checkedAt).toLocaleString()} · {s.source}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div class="readit-section">
        <h2>Risk event log</h2>
        {settings.cqsRiskEvents.length === 0 && (
          <p class="readit-muted">No risk events yet.</p>
        )}
        <div class="readit-list">
          {settings.cqsRiskEvents.slice(0, 15).map((e) => (
            <div class="readit-list-item" key={e.id}>
              <div class="readit-row">
                <strong>{e.kind}</strong>
                <span class="readit-muted">{confidenceLabel(e.confidence)}</span>
              </div>
              <div class="readit-muted">{e.message}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button
            type="button"
            class="readit-btn"
            onClick={() => {
              void onCommit("Clear CQS logs", (s) => ({
                ...s,
                cqsSnapshots: [],
                cqsRiskEvents: [],
              }));
              flash("CQS logs cleared");
            }}
          >
            Clear logs
          </button>
        </div>
      </div>

      <div class="readit-section">
        <h2>Learn more</h2>
        <div class="readit-list">
          <div class="readit-list-item">
            <a
              href="https://support.reddithelp.com/hc/en-us/articles/19023371170196-What-is-the-Contributor-Quality-Score"
              style={{ color: "#7db7ff" }}
            >
              Reddit Help — What is CQS?
            </a>
          </div>
          <div class="readit-list-item">
            <a
              href="https://www.reddit.com/r/NewToReddit/wiki/common-questions/cqs"
              style={{ color: "#7db7ff" }}
            >
              r/NewToReddit wiki — CQS
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

function ReadingOverlay({ onClose }: { onClose: () => void }) {
  const title =
    document.querySelector("h1")?.textContent?.trim() || document.title;
  const body =
    document.querySelector('[slot="text-body"], .Post text, shreddit-post [id*="post-rtjson"]')
      ?.textContent ||
    Array.from(document.querySelectorAll("shreddit-comment"))
      .slice(0, 40)
      .map((c) => c.textContent?.trim())
      .filter(Boolean)
      .join("\n\n") ||
    "No readable text found on this page.";

  return (
    <div class="readit-reading">
      <div class="readit-row">
        <h1 style={{ margin: 0 }}>{title}</h1>
        <button type="button" class="readit-btn" onClick={onClose}>
          Close
        </button>
      </div>
      <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{body}</p>
    </div>
  );
}

function SubOverrideForm({
  onAdd,
}: {
  onAdd: (sub: string, width: number) => void;
}) {
  const [sub, setSub] = useState("");
  const [width, setWidth] = useState(1000);
  return (
    <div>
      <input
        class="readit-input"
        placeholder="subreddit"
        value={sub}
        onInput={(e) => setSub(e.currentTarget.value)}
      />
      <div style={{ height: 8 }} />
      <input
        class="readit-input"
        type="number"
        value={width}
        onInput={(e) => setWidth(Number(e.currentTarget.value))}
      />
      <div style={{ height: 8 }} />
      <button
        type="button"
        class="readit-btn"
        onClick={() => {
          if (!sub.trim()) return;
          onAdd(sub.trim().replace(/^r\//, ""), width);
          setSub("");
        }}
      >
        Add override
      </button>
    </div>
  );
}

function ensureNsfwFilter(filters: FilterRule[]): FilterRule[] {
  if (filters.some((f) => f.id === "nsfw_quiet")) return filters;
  return [
    ...filters,
    {
      id: "nsfw_quiet",
      kind: "keyword",
      pattern: "nsfw",
      enabled: true,
    },
  ];
}

function buildSelector(el: Element): string | null {
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
