# Layout edit mode + toolbar — full smoke checklist

End-to-end coverage of the **FAB action stack**, **bottom edit toolbox island**, column selection, layout presets from the toolbar, font/zoom, separators (max 3), gutter themes, and Done/Esc exit.

**Latest automated run:** 2026-09-03 · **28 pass / 0 fail / 2 skip**

**Harness:** `npm run smoke:edit` (Playwright) · `npm run smoke:edit:brave` (CDP `:9222`)

**Evidence:** [`docs/smoke-evidence/edit/`](smoke-evidence/edit/) · results: [`results.json`](smoke-evidence/edit/results.json)

**Unit:** `npm run test:layout` (separator budget, zoom/font/gutter CSS)

Legend: **A** automated · **U** unit · Status: ✓ pass · ✗ fail · — skip

---

## Screenshots map

| File | What it shows |
| --- | --- |
| `00-home.png` | Home + FAB |
| `01-fab-stack.png` | FAB upward action stack open |
| `02-toolbox-island.png` | Edit Mode: bottom floating toolbox island |
| `03-frames-select.png` | Edit frames + selection checkboxes |
| `04-preset-nav-right.png` | Toolbox preset → nav right |
| `05-font-serif.png` | Font family serif applied |
| `06-zoom-all.png` | Zoom All stepped up |
| `07-zoom-selected.png` | Zoom Sel on selected column |
| `08-separators.png` | Three separators added; +Sep disabled |
| `09-gutter-line.png` | Gutter theme line class on html |
| `10-done.png` | Done exits edit; toolbox gone |
| `11-settings-drawer.png` | FAB → Settings opens drawer |

---

## 0. Unit / shell

| ID | Check | Kind | Shot | Status |
| --- | --- | --- | --- | --- |
| `edit.unit` | `npm run test:layout` all pass | U | — | ✓ |
| `edit.shell_home` | Reddit home; FAB present; readit-active | A | `00-home.png` | ✓ |

## 1. FAB action stack

| ID | Check | Kind | Shot | Status |
| --- | --- | --- | --- | --- |
| `edit.fab_stack_open` | FAB click opens menu with Edit Mode / Settings / GitHub / Ko-fi | A | `01-fab-stack.png` | ✓ |
| `edit.fab_stack_toggle` | Second FAB click closes the stack | A | — | ✓ |
| `edit.fab_settings_drawer` | Settings opens Studio drawer (not edit mode) | A | `11-settings-drawer.png` | ✓ |
| `edit.open_studio_event` | `readit:open-studio` opens Settings drawer | A | — | ✓ |

## 2. Edit Mode + toolbox island

| ID | Check | Kind | Shot | Status |
| --- | --- | --- | --- | --- |
| `edit.enter_edit_mode` | Edit Mode → `readit-layout-edit` + editMode | A | — | ✓ |
| `edit.toolbox_present` | `.readit-edit-toolbox[data-readit-edit-island]` mounted | A | `02-toolbox-island.png` | ✓ |
| `edit.toolbox_bottom_island` | Toolbox fixed near bottom-center (not search-aligned top) | A | — | ✓ |
| `edit.toolbox_groups` | Presets, font selects, zoom, +Sep, gutter, Done present | A | — | ✓ |
| `edit.frames_and_checkboxes` | Column frames + `.readit-frame-select` checkboxes | A | `03-frames-select.png` | ✓ |

## 3. Layout presets (toolbar)

| ID | Check | Kind | Shot | Status |
| --- | --- | --- | --- | --- |
| `edit.preset.classic` | Classic chip → layout classic | A | — | ✓ |
| `edit.preset.nav_right` | Nav right chip → recipe / data attr | A | `04-preset-nav-right.png` | ✓ |
| `edit.preset.single` | Single chip → singleColumn | A | — | ✓ |

## 4. Font Format/Style

| ID | Check | Kind | Shot | Status |
| --- | --- | --- | --- | --- |
| `edit.font_family_serif` | Font → Serif updates `--readit-font-family` | A | `05-font-serif.png` | ✓ |
| `edit.font_weight_bold` | Weight → Bold updates `--readit-font-weight` | A | — | ✓ |
| `edit.font_scale` | Size range changes `--readit-font-scale` | A | — | ✓ |

## 5. Zoom (All / selected)

| ID | Check | Kind | Shot | Status |
| --- | --- | --- | --- | --- |
| `edit.zoom_all_step` | With no selection, Zoom + writes zoomAll CSS | A | `06-zoom-all.png` | ✓ |
| `edit.zoom_selected_step` | Select Feed checkbox; Zoom + writes panel zoom | A | `07-zoom-selected.png` | ✓ |
| `edit.zoom_label_sel` | Toolbox shows "Zoom Sel" when a column is selected | A | — | ✓ |

## 6. Separators + gutter

| ID | Check | Kind | Shot | Status |
| --- | --- | --- | --- | --- |
| `edit.separator_add` | +Sep inserts separator node / track | A | — | ✓ |
| `edit.separator_max_3` | After 3, +Sep disabled; count shows 3/3 | A | `08-separators.png` | ✓ |
| `edit.separator_dual_resize` | Separator has left+right resize edges | A | — | ✓ |
| `edit.separator_remove_x` | × on separator frame removes it | A | — | ✓ |
| `edit.column_dual_resize` | Each panel has left+right resize handles | A | — | ✓ |
| `edit.gutter_theme_line` | Gutter → Line adds `readit-gutter-line` | A | `09-gutter-line.png` | ✓ |

## 7. Exit

| ID | Check | Kind | Shot | Status |
| --- | --- | --- | --- | --- |
| `edit.done_exits` | Done clears edit class + removes toolbox | A | `10-done.png` | ✓ |
| `edit.esc_exits` | Esc exits edit mode when menu closed | A | — | ✓ |

---

## Manual / visual (optional)

| ID | Check | Kind | Status |
| --- | --- | --- | --- |
| `edit.manual.island_vs_fab` | Island does not cover FAB; usable on narrow viewport | M | — |
| `edit.manual.github_kofi` | GitHub / Ko-fi open in new tabs | M | — |
