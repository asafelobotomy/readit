# Layout features — full smoke checklist

End-to-end coverage of **layout slots**: presets, widths/pads/gaps, edit-mode chrome (labeled frames + resize edges), drag-and-drop reorder, min-width containment, profile recipes, and the Simple “Hide sidebars” bridge.

**Latest automated run:** 2026-09-03 · **17 pass / 13 fail / 0 skip**

**Harness:** `npm run smoke:layout` (Playwright) · `npm run smoke:layout:brave` (CDP `:9222`)

**Evidence:** [`docs/smoke-evidence/layout/`](smoke-evidence/layout/) · results: [`results.json`](smoke-evidence/layout/results.json)

**Unit:** `npm run test:layout`

Legend: **A** automated · **U** unit · Status: ✓ pass · ✗ fail · — skip

---

## Screenshots map

| File | What it shows |
| --- | --- |
| `00-home-baseline.png` | Home before layout edits |
| `01-classic.png` | Classic preset |
| `02-nav-right.png` | Nav right preset |
| `03-dual-left.png` | Dual left preset |
| `04-dual-right.png` | Dual right preset |
| `05-single-column.png` | Single column |
| `06-widths-nav-min.png` | Nav at min (icon rail) |
| `07-widths-pads-gap.png` | Pads + column gap applied |
| `08-edit-frames.png` | Edit mode: labeled frames + edge handles |
| `09-dnd-after-reorder.png` | After dragging Feed to another slot |
| `10-pad-swap.png` | After swapping L/R pads |
| `11-resize-edge.png` | After dragging a column resize edge |
| `12-profile-focus-reader.png` | Focus Reader layout recipe |
| `13-profile-mod-desk.png` | Mod Desk layout recipe |
| `14-hide-sidebars-bridge.png` | Simple Hide sidebars → single column |
| `15-esc-locked.png` | Esc exits edit mode |

---

## 0. Unit / shell

| ID | Check | Kind | Shot | Status |
| --- | --- | --- | --- | --- |
| `layout.unit` | `npm run test:layout` all pass | U | — | ✓ |
| `layout.shell_home` | Reddit home loads; FAB present | A | `00-home-baseline.png` | ✓ |
| `layout.flag_enabled` | Enable layout columns in Studio | A | — | ✗ |

## 1. Presets

| ID | Check | Kind | Shot | Status |
| --- | --- | --- | --- | --- |
| `layout.tab_ui` | Layout tab: presets + zone board | A | — | ✗ |
| `layout.preset.classic` | Classic → `data-readit-layout=classic` + recipe CSS | A | `01-classic.png` | ✓ |
| `layout.preset.nav_right` | Nav right → recipe + stamped slots | A | `02-nav-right.png` | ✗ |
| `layout.preset.dual_left` | Dual left recipe | A | `03-dual-left.png` | ✓ |
| `layout.preset.dual_right` | Dual right recipe | A | `04-dual-right.png` | ✗ |
| `layout.preset.single_column` | Single column hides sidebars | A | `05-single-column.png` | ✓ |
| `layout.zone_board` | Zone board shows Nav/Feed/Rail labels | A | — | ✗ |
| `layout.slot_health` | Slot health lines for leftNav/main/rightRail | A | — | ✗ |

## 2. Widths, pads, gap

| ID | Check | Kind | Shot | Status |
| --- | --- | --- | --- | --- |
| `layout.width.nav` | Nav slider updates `--readit-left-nav-width` | A | — | ✓ |
| `layout.width.nav_min` | Nav → 64px; icon rail / no vertical label soup | A | `06-widths-nav-min.png` | ✓ |
| `layout.width.feed` | Feed slider updates `--readit-feed-width` | A | — | ✗ |
| `layout.width.rail` | Rail slider updates `--readit-right-rail-width` | A | — | ✗ |
| `layout.width.pads_gap` | Left/right pad + column gap CSS vars update | A | `07-widths-pads-gap.png` | ✗ |
| `layout.width.fit_budget` | Wide nav+feed+rail still fits viewport (no overflow past right pad) | A | — | ✓ |

## 3. Edit mode chrome

| ID | Check | Kind | Shot | Status |
| --- | --- | --- | --- | --- |
| `layout.edit.allow_moving` | “Allow moving columns” arms edit | A | — | ✓ |
| `layout.edit.banner` | Banner: drag labels / edges (Esc locks) | A | — | ✓ |
| `layout.edit.frames` | Five frames: Feed, Nav, Rail, L/R pads (or L/R) | A | `08-edit-frames.png` | ✓ |
| `layout.edit.no_slot_outline` | Slot outline not dashed (overlay frames only) | A | — | ✓ |
| `layout.edit.resize_handles` | `.readit-col-resize` + `.readit-pad-resize` present | A | — | ✓ |
| `layout.edit.esc_lock` | Esc clears `readit-layout-edit` + frames | A | `15-esc-locked.png` | ✓ |

## 4. Drag-and-drop + edge resize

| ID | Check | Kind | Shot | Status |
| --- | --- | --- | --- | --- |
| `layout.dnd.column_reorder` | Drag Feed label → new index; `data-readit-columns` changes | A | `09-dnd-after-reorder.png` | ✓ |
| `layout.dnd.pad_swap` | Drag L pad across midline → pads swap widths | A | `10-pad-swap.png` | ✗ |
| `layout.resize.edge` | Drag column edge changes panel width var | A | `11-resize-edge.png` | ✓ |

## 5. Profile recipes + Simple bridge

| ID | Check | Kind | Shot | Status |
| --- | --- | --- | --- | --- |
| `layout.profile.focus_reader` | Focus Reader applies single-column-ish layout recipe | A | `12-profile-focus-reader.png` | ✗ |
| `layout.profile.mod_desk` | Mod Desk applies navRight (or documented) recipe | A | `13-profile-mod-desk.png` | ✓ |
| `layout.bridge.hide_sidebars` | Simple Hide sidebars → singleColumn | A | `14-hide-sidebars-bridge.png` | ✗ |
| `layout.reset_classic` | Classic restores default after probes | A | — | ✗ |

---

## Re-run

```bash
npm run build
npm run test:layout
npm run smoke:layout:brave   # preferred when Brave CDP is up
# or
npm run smoke:layout
```
