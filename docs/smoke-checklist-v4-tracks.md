# Smoke checklist — feedback roadmap tracks (settings v4)

**Scope:** Now / Next / Later from the peer-feedback canvas.  
**Harness:** `npm run test:layout` (unit) + `npm run smoke` / `npm run smoke:brave` (E2E).  
**Evidence:** [`docs/smoke-evidence/`](smoke-evidence/) · [`results.json`](smoke-evidence/results.json)

Legend: **U** = unit · **A** = automated E2E · **M** = manual · ✓ pass · ✗ fail · — skip

**Latest run:** 2026-09-02T13:09:25.887Z · **85 pass / 0 fail / 6 skip** · mode `launch-playwright`  
**Tracks:** 21 automated ✓ · 1 manual —

---

## Audit summary (code review)

| Track | Item | Implementation | Verdict |
| --- | --- | --- | --- |
| Now | Chrome noise pack | `HideNoise` + `hideRules` + Simple UI | Present · smoke ✓ |
| Now | Keyboard focus guard | `isEditableTarget` in `keyboardNavFeature` | Present · unit ✓ |
| Now | New Reddit positioning | README, `LOAD_IN_CHROME.txt`, Studio brand blurb | Present · smoke ✓ |
| Next | Mark read / dim visited | `markReadFeature` + Create controls | Present · smoke ✓ |
| Next | Flair / karma filters + block helpers | `FilterRule` kinds + Curate UI | Present · smoke ✓ |
| Next | Feature health overview | Advanced tab counts + non-ok list | Present · smoke ✓ |
| Next | Export/import dry-run | `previewImport` + confirm on import | Present · unit ✓ |
| Later | Anti-refresh | `antiRefreshFeature` + CSS class | Present · smoke ✓ |
| Later | Comment quote / formatting | `commentUxFeature` + Create toggle | Present · smoke ✓ (25 Quote btns) |
| Later | Studio i18n | `en`/`zh` + Advanced locale | Present · smoke ✓ |
| Later | Account switcher | Create button → menu or `/settings/account` | Present · smoke ✓ |

---

## Track Now

| ID | Check | Kind | Status |
| --- | --- | --- | --- |
| `unit.noise_css` | Stylesheet emits AI-summary hide when enabled | U | ✓ |
| `unit.kb_focus_guard` | `isEditableTarget` treats INPUT as editable | U | ✓ |
| `track.now.noise_pack_ui` | Simple shows Chrome noise pack rows | A | ✓ |
| `track.now.noise_toggle_css` | Toggle AI summary → CSS recipe present | A | ✓ |
| `track.now.positioning_blurb` | Simple profiles blurb mentions New Reddit / Toolbox | A | ✓ |
| `track.now.docs_positioning` | README states New Reddit only (static audit) | A | ✓ |

## Track Next

| ID | Check | Kind | Status |
| --- | --- | --- | --- |
| `unit.import_preview` | `previewImport` dry-run accepts v4 bundle | U | ✓ |
| `track.next.mark_read_controls` | Create: mark-read checkbox + mode select | A | ✓ |
| `track.next.mark_read_apply` | Enable mark-read → flag on / visited path armed | A | ✓ |
| `track.next.filter_kinds` | Curate select offers flair + karmaMax | A | ✓ |
| `track.next.block_helpers` | Curate “Block this subreddit” / “Block typed user” | A | ✓ |
| `track.next.health_overview` | Advanced health overview shows ok/degraded counts | A | ✓ |
| `track.next.locale_switch` | Advanced locale → 中文 updates Studio copy | A | ✓ |
| `track.next.export_schema_stamp` | Export bundle includes schemaVersion (unit/E2E) | U | ✓ |

## Track Later

| ID | Check | Kind | Status |
| --- | --- | --- | --- |
| `track.later.anti_refresh_toggle` | Enable anti-refresh → `html.readit-anti-refresh` | A | ✓ |
| `track.later.comment_ux_toggle` | Enable comment UX flag sticks in Create | A | ✓ |
| `track.later.account_switcher_btn` | Account switcher control present | A | ✓ |
| `track.later.quote_dom` | On post page with comments, Quote button appears when enabled | A | ✓ |
| `track.later.anti_refresh_manual` | Home “new posts” chip hidden in real feed | M | — |

---

## Re-run

```bash
npm run test:layout
npm run build
npm run smoke
# or with Brave CDP:
npm run smoke:brave
```
