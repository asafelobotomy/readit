import { useEffect, useState } from "preact/hooks";
import {
  addLayoutSeparator,
  applyLayoutPreset,
  getEditSelection,
} from "@readit/features";
import type {
  FontFamily,
  FontWeight,
  GutterTheme,
  LayoutColumnPanel,
  LayoutPreset,
  ReaditSettings,
} from "@readit/schema";
import { clampZoom, MAX_LAYOUT_SEPARATORS } from "@readit/schema";

const REPO_URL = "https://github.com/asafelobotomy/readit";
const KOFI_URL = "https://ko-fi.com/U5R225QZH3";

export { REPO_URL, KOFI_URL };

const LAYOUT_PRESETS: { id: LayoutPreset; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "navRight", label: "Nav right" },
  { id: "dualLeft", label: "Dual L" },
  { id: "dualRight", label: "Dual R" },
  { id: "singleColumn", label: "Single" },
];

const FONT_FAMILIES: { id: FontFamily; label: string }[] = [
  { id: "system", label: "System" },
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
  { id: "mono", label: "Mono" },
];

const GUTTER_THEMES: { id: GutterTheme; label: string }[] = [
  { id: "plain", label: "Plain" },
  { id: "line", label: "Line" },
  { id: "soft", label: "Soft" },
  { id: "paper", label: "Paper" },
  { id: "inset", label: "Inset" },
];

function measureToolboxPosition(): { top: number; left: number } {
  const search =
    document.querySelector("faceplate-search-input") ||
    document.querySelector("#search-input") ||
    document.querySelector('input[type="search"]') ||
    document.querySelector('[placeholder*="Search" i]');
  if (search instanceof Element) {
    const r = search.getBoundingClientRect();
    if (r.width > 40 && r.top >= 0) {
      return {
        top: Math.max(8, Math.round(r.top + r.height / 2 - 18)),
        left: Math.min(
          window.innerWidth - 420,
          Math.round(r.right + 12),
        ),
      };
    }
  }
  return { top: 56, left: Math.max(16, Math.round(window.innerWidth / 2 - 200)) };
}

type Props = {
  settings: ReaditSettings;
  commit: (
    label: string,
    mutator: (s: ReaditSettings) => ReaditSettings,
  ) => Promise<void>;
};

export function EditToolbox({ settings, commit }: Props) {
  const [pos, setPos] = useState(() => measureToolboxPosition());
  const [selected, setSelected] = useState<string[]>(() => getEditSelection());
  const cfg = settings.layoutSlots;
  const tokens = settings.knobs.tokens;
  const sepCount = cfg.separators?.length ?? 0;

  useEffect(() => {
    const rem = () => setPos(measureToolboxPosition());
    rem();
    window.addEventListener("resize", rem);
    window.addEventListener("wxt:locationchange", rem);
    const t = window.setInterval(rem, 1200);
    return () => {
      window.removeEventListener("resize", rem);
      window.removeEventListener("wxt:locationchange", rem);
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const onSel = (ev: Event) => {
      const detail = (ev as CustomEvent<{ selected?: string[] }>).detail;
      setSelected(detail?.selected || []);
    };
    window.addEventListener("readit:edit-selection", onSel);
    return () => window.removeEventListener("readit:edit-selection", onSel);
  }, []);

  const selectedPanels = selected.filter((id) =>
    id === "leftNav" || id === "main" || id === "rightRail",
  ) as LayoutColumnPanel[];
  const zoomTarget: "all" | "selected" =
    selectedPanels.length > 0 ? "selected" : "all";

  const currentZoom =
    zoomTarget === "all"
      ? cfg.zoomAll ?? 1
      : clampZoom(
          cfg.zoomByPanel?.[selectedPanels[0]!] ?? cfg.zoomAll ?? 1,
        );

  return (
    <div
      class="readit-edit-toolbox"
      style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
      role="toolbar"
      aria-label="readit layout edit"
    >
      <div class="readit-edit-toolbox-group" title="Layout modes">
        {LAYOUT_PRESETS.map((p) => (
          <button
            type="button"
            key={p.id}
            class="readit-edit-chip"
            data-active={cfg.preset === p.id ? "true" : "false"}
            onClick={() =>
              void commit(`Layout ${p.label}`, (s) => ({
                ...s,
                flags: { ...s.flags, layoutSlots: true },
                layoutSlots: applyLayoutPreset(s.layoutSlots, p.id),
              }))
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      <div class="readit-edit-toolbox-group" title="Font">
        <select
          class="readit-edit-select"
          value={tokens.fontFamily || "system"}
          onChange={(e) => {
            const fontFamily = (e.currentTarget as HTMLSelectElement)
              .value as FontFamily;
            void commit("Font family", (s) => ({
              ...s,
              knobs: {
                ...s.knobs,
                tokens: { ...s.knobs.tokens, fontFamily },
              },
            }));
          }}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          class="readit-edit-select"
          value={String(tokens.fontWeight || 400)}
          onChange={(e) => {
            const fontWeight = Number(
              (e.currentTarget as HTMLSelectElement).value,
            ) as FontWeight;
            void commit("Font weight", (s) => ({
              ...s,
              knobs: {
                ...s.knobs,
                tokens: { ...s.knobs.tokens, fontWeight },
              },
            }));
          }}
        >
          <option value="400">Regular</option>
          <option value="500">Medium</option>
          <option value="600">Semibold</option>
          <option value="700">Bold</option>
        </select>
        <label class="readit-edit-zoom">
          Size
          <input
            type="range"
            min="0.85"
            max="1.4"
            step="0.05"
            value={tokens.fontScale}
            onChange={(e) => {
              const fontScale = Number(
                (e.currentTarget as HTMLInputElement).value,
              );
              void commit("Font size", (s) => ({
                ...s,
                knobs: {
                  ...s.knobs,
                  tokens: { ...s.knobs.tokens, fontScale },
                },
              }));
            }}
          />
        </label>
      </div>

      <div class="readit-edit-toolbox-group" title="Zoom">
        <span class="readit-edit-label">
          Zoom {zoomTarget === "all" ? "All" : "Sel"}
        </span>
        <button
          type="button"
          class="readit-edit-chip"
          onClick={() => {
            const next = clampZoom(currentZoom - 0.05);
            void applyZoom(commit, settings, selectedPanels, next);
          }}
        >
          −
        </button>
        <span class="readit-edit-label">{Math.round(currentZoom * 100)}%</span>
        <button
          type="button"
          class="readit-edit-chip"
          onClick={() => {
            const next = clampZoom(currentZoom + 0.05);
            void applyZoom(commit, settings, selectedPanels, next);
          }}
        >
          +
        </button>
      </div>

      <div class="readit-edit-toolbox-group">
        <button
          type="button"
          class="readit-edit-chip"
          disabled={sepCount >= MAX_LAYOUT_SEPARATORS}
          title={
            sepCount >= MAX_LAYOUT_SEPARATORS
              ? "Maximum 3 separators"
              : "Add blank separator after selected column (or main)"
          }
          onClick={() => {
            const after: LayoutColumnPanel =
              selectedPanels[0] || "main";
            void commit("Add separator", (s) => ({
              ...s,
              layoutSlots: addLayoutSeparator(s.layoutSlots, after),
            }));
          }}
        >
          + Sep ({sepCount}/3)
        </button>
        <select
          class="readit-edit-select"
          value={cfg.gutterTheme || "plain"}
          title="Gutter theme"
          onChange={(e) => {
            const gutterTheme = (e.currentTarget as HTMLSelectElement)
              .value as GutterTheme;
            void commit("Gutter theme", (s) => ({
              ...s,
              layoutSlots: { ...s.layoutSlots, gutterTheme },
            }));
          }}
        >
          {GUTTER_THEMES.map((g) => (
            <option key={g.id} value={g.id}>
              Gutter: {g.label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        class="readit-edit-chip primary"
        onClick={() =>
          void commit("Exit layout edit", (s) => ({
            ...s,
            layoutSlots: { ...s.layoutSlots, editMode: false },
          }))
        }
      >
        Done
      </button>
    </div>
  );
}

async function applyZoom(
  commit: Props["commit"],
  _settings: ReaditSettings,
  selectedPanels: LayoutColumnPanel[],
  next: number,
): Promise<void> {
  const z = clampZoom(next);
  if (selectedPanels.length === 0) {
    await commit("Zoom all", (s) => ({
      ...s,
      layoutSlots: {
        ...s.layoutSlots,
        zoomAll: z,
        zoomByPanel: {},
      },
    }));
    return;
  }
  await commit("Zoom selected", (s) => {
    const zoomByPanel = { ...(s.layoutSlots.zoomByPanel || {}) };
    for (const p of selectedPanels) zoomByPanel[p] = z;
    return {
      ...s,
      layoutSlots: { ...s.layoutSlots, zoomByPanel },
    };
  });
}
