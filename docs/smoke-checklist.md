# End-to-end smoke checklist (New Reddit)

**Latest automated run:** 2026-09-02 · **90 pass / 0 fail / 7 skip** · mode `launch-playwright` (Wave A included)

Automated harness: `npm run smoke` (Playwright Chromium) or `npm run smoke:brave` (puppeteer → Brave CDP on `:9222`).

Unit (layout recipes): `npm run test:layout`

Evidence: [`docs/smoke-evidence/`](smoke-evidence/) · results: [`results.json`](smoke-evidence/results.json)

**Feedback tracks (v4):** focused audit + checklist → [`smoke-checklist-v4-tracks.md`](smoke-checklist-v4-tracks.md)

> Brave CDP: quit Brave, start with `--remote-debugging-port=9222 '--remote-allow-origins=*'` (quote `*` in fish). Confirm `curl -s http://127.0.0.1:9222/json/version` returns JSON.

Legend: **A** = automated · **M** = manual / needs credentials · **S** = skipped by design · **U** = unit (node)

Status marks filled after the run: ✓ pass · ✗ fail · — skip

---

## Full coverage plan

| Area | Intent |
| --- | --- |
| Shell | Extension loads, early CSS, FAB/studio, tabs, undo, pause, popup |
| Profiles | All five builtin profiles apply knobs/flags |
| Simple | Hide/density/media/NSFW/sync/picker |
| Layout | Presets, stamps, recipes, widths, health, sidebars bridge, edit mode — full suite: [`smoke-checklist-layout.md`](smoke-checklist-layout.md) · FAB / toolbox island: [`smoke-checklist-edit.md`](smoke-checklist-edit.md) |
| Nav | Compact icon rail, avatars, subnames, section icons, alignment — [`smoke-checklist-nav.md`](smoke-checklist-nav.md) |
| Advanced | Feature search/health, sub override, keyboard nav |
| Curate | Filters, tags, reading mode |
| Create | Clean links, canned replies, timestamps, OP/actions flags |
| CQS | Tab UI, enable, manual tier, prefs |
| Mod | Desk profile, quick bar, macros, usernotes |
| Library | Save + remove queue items |
| Routes | Home, subreddit, post, SPA soft-nav |
| Coexist | Toolbox attr; Old Reddit out of scope |
| Unit | `presetToPlacements` + CSS recipe markers |

---

## 0. Shell / load

| ID | Check | Kind | Status |
| --- | --- | --- | --- |
| `shell.extension_loads` | Extension target / SW present | A | ✓ |
| `shell.early_css` | `#readit-css-engine` + `html.readit-active` | A | ✓ |
| `shell.fab_present` | `readit-studio` shadow `.readit-fab` | A | ✓ |
| `shell.fab_opens_studio` | FAB opens `.readit-drawer` | A | ✓ |
| `shell.tabs_present` | Tabs: Simple, Layout, Advanced, Curate, Create, CQS, Mod, Library | A | ✓ |
| `shell.export_control` | Export button present | A | ✓ |
| `shell.undo` | Undo after a commit restores prior state | A | ✓ |
| `shell.pause_resume` | Studio Pause clears `readit-active`; Resume restores | A | ✓ |
| `shell.popup_loads` | `chrome-extension://…/popup.html` renders | A | ✓ |
| `shell.popup_profile` | Popup profile `<select>` switches active profile | A | ✓ |
| `shell.popup_pause` | Popup Pause/Resume updates page classes | A | ✓ |
| `shell.popup_open_studio` | Popup Open studio opens drawer on Reddit tab | A | ✓ |

## 1. Profiles (Simple cards)

| ID | Check | Kind | Status |
| --- | --- | --- | --- |
| `profile.focus_reader` | Focus Reader → feed ~980px, op highlight | A | ✓ |
| `profile.dense_power` | Dense Power → 1100px, keyboard nav armed | A | ✓ |
| `profile.creator_desk` | Creator Desk → ~1000px | A | ✓ |
| `profile.minimal_media` | Minimal Media → ~900px | A | ✓ |
| `profile.mod_desk` | Mod Desk → queue density + mod flags UI | A | ✓ |

## 2. Simple knobs

| ID | Check | Kind | Status |
| --- | --- | --- | --- |
| `simple.hide_sidebars_toggle` | Hide sidebars checkbox flips | A | ✓ |
| `simple.hide_promoted_toggle` | Hide promoted checkbox flips | A | ✓ |
| `simple.density_font` | Density + font scale update CSS vars | A | ✓ |
| `simple.media_mode` | Media → Links on feed | A | ✓ |
| `simple.quiet_nsfw` | Quiet NSFW adds `nsfw_quiet` filter | A | ✓ |
| `simple.sync_lightweight` | Sync lightweight checkbox toggles | A | ✓ |
| `simple.picker_arm_esc` | Element picker banner; Esc cancels | A | ✓ |
| `simple.noise_pack_ui` | Chrome noise pack section visible | A | ✓ |

## 3. Layout (slot chrome)

| ID | Check | Kind | Status |
| --- | --- | --- | --- |
| `layout.unit` | `npm run test:layout` — presets + CSS recipes | U | ✓ |
| `layout.tab_ui` | Layout tab presets + zone board | A | ✓ |
| `layout.presets_chips` | Classic / Nav right / Dual left / Dual right / Single column chips | A | ✓ |
| `layout.nav_right` | Nav right → `data-readit-slot` + `readit-layout:navRight` | A | ✓ |
| `layout.dual_left` | Dual left → recipe marker in stylesheet | A | ✓ |
| `layout.single_column` | Single column hides sidebars via recipe | A | ✓ |
| `layout.reset_classic` | Classic restores default recipe | A | ✓ |
| `layout.widths` | Left nav width slider updates `--readit-left-nav-width` | A | ✓ |
| `layout.slot_health` | Slot health labels (`leftNav`/`main`/…) visible | A | ✓ |
| `layout.hide_sidebars_bridge` | Simple Hide sidebars → `singleColumn` recipe | A | ✓ |
| `layout.edit_mode` | Edit layout banner; Esc exits edit mode | A | ✓ |

## 4. Advanced

| ID | Check | Kind | Status |
| --- | --- | --- | --- |
| `advanced.feature_search` | Search `keyboard` filters list | A | ✓ |
| `advanced.feature_health` | Health chips (`ok`/`degraded`/`broken`) visible | A | ✓ |
| `advanced.sub_override` | Add AskReddit width override; applies on `/r/AskReddit` | A | ✓ |
| `advanced.keyboard_nav` | Dense Power → `window.__readitKb === true` | A | ✓ |
| `advanced.health_overview` | Health overview counts ok/degraded/broken | A | ✓ |

## 5. Curate

| ID | Check | Kind | Status |
| --- | --- | --- | --- |
| `curate.add_filter` | Add keyword `smoke-test-filter-xyz` | A | ✓ |
| `curate.user_tag` | Save tag; list shows `u/… — …` | A | ✓ |
| `curate.user_tag_dom` | `.readit-user-tag` appears next to matching user link | A | ✓ |
| `curate.reading_mode` | Reading mode overlay `.readit-reading` | A | ✓ |

## 6. Create

| ID | Check | Kind | Status |
| --- | --- | --- | --- |
| `create.clean_link` | Copy clean / redd.it toast | A | ✓ |
| `create.canned_copy` | Copy canned reply → toast Copied reply | A | ✓ |
| `create.absolute_timestamps` | Flag on → `.readit-abs-time` on post page | A | ✓ |
| `create.op_highlight` | `html.readit-op-highlight` when flag on | A | ✓ |
| `create.always_show_actions` | Flag toggle sticks in UI | A | ✓ |
| `create.feed_ux_controls` | Mark-read / anti-refresh / comment UX / account switcher | A | ✓ |

## 6b. Feedback tracks (v4) — see full table in [`smoke-checklist-v4-tracks.md`](smoke-checklist-v4-tracks.md)

| ID | Check | Kind | Status |
| --- | --- | --- | --- |
| `unit.noise_css` | Noise pack CSS | U | ✓ |
| `unit.kb_focus_guard` | Editable target guard | U | ✓ |
| `unit.import_preview` | Import dry-run | U | ✓ |
| `track.now.*` / `track.next.*` / `track.later.*` | Track E2E probes (21 A ✓ · 1 M —) | A | ✓ |

## 7. CQS

| ID | Check | Kind | Status |
| --- | --- | --- | --- |
| `cqs.tab_ui` | CQS tab shows tracker enable + tier controls | A | ✓ |
| `cqs.enable_toggle` | Enable CQS tracker checkbox flips | A | ✓ |
| `cqs.manual_tier` | Manual tier select commits (toast / select value) | A | ✓ |
| `cqs.prefs_toggle` | Burst warn pref checkbox flips | A | ✓ |
| `cqs.bot_parse` | Parse tier on r/WhatIsMyCQS | M | — |
| `cqs.risk_banner` | Risk banner after burst heuristic | M | — |

## 8. Mod

| ID | Check | Kind | Status |
| --- | --- | --- | --- |
| `mod.desk_profile` | Mod Desk + Mod tab content | A | ✓ |
| `mod.quick_bar` | `.readit-mod-bar` on `shreddit-post` | A | ✓ |
| `mod.macro_copy` | Macro Copy → toast | A | ✓ |
| `mod.usernote` | Save note → list + `data-readit-has-note` when user on page | A | ✓ |
| `mod.toolbox_notice` | Toolbox soft-disable notice | S | — |
| `routes.modqueue` | `/about/modqueue` | S | — |

## 9. Library

| ID | Check | Kind | Status |
| --- | --- | --- | --- |
| `library.save_queue` | Save current page to queue lists item | A | ✓ |
| `library.remove` | Remove saved item | A | ✓ |

## 10. Routes / SPA

| ID | Check | Kind | Status |
| --- | --- | --- | --- |
| `routes.home` | `www.reddit.com` | A | ✓ |
| `routes.subreddit` | `/r/AskReddit` FAB | A | ✓ |
| `routes.post_comments` | Comments URL | A | ✓ |
| `routes.spa_soft_nav` | In-page nav keeps FAB + CSS | A | ✓ |

## 11. Coexistence

| ID | Check | Kind | Status |
| --- | --- | --- | --- |
| `coexist.toolbox_attr` | `data-readit-toolbox` is `0` or `1` | A | ✓ |
| `coexist.old_reddit` | Old Reddit unsupported (manual) | S | — |

---

## Re-run

```bash
npm run test:layout
npm run build
npm run smoke
npm run smoke:layout
# Brave Origin:
npm run smoke:brave
npm run smoke:layout:brave
```
