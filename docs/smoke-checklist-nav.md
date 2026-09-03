# Nav (left sidebar) — full smoke checklist

End-to-end coverage of **thin / compact Nav**: icon rail, community avatars + bold names under, section icons, tooltips, alignment, and no clipping.

**Latest automated run:** 2026-09-03 · **24 pass / 2 fail / 0 skip**

**Harness:** `npm run smoke:nav` (Playwright) · `npm run smoke:nav:brave` (CDP `:9222`)

**Evidence:** [`docs/smoke-evidence/nav/`](smoke-evidence/nav/) · results: [`results.json`](smoke-evidence/nav/results.json)

**Unit:** `npm run test:layout` (includes `classifyNavSection` + compact CSS markers)

Legend: **A** automated · **U** unit · Status: ✓ pass · ✗ fail · — skip

---

## Screenshots map

| File | What it shows |
| --- | --- |
| `00-nav-wide.png` | Classic layout, Nav ~272px (labels visible) |
| `01-nav-mid.png` | Nav ~140px (compact threshold) |
| `02-nav-min.png` | Nav at 64px icon rail |
| `03-nav-min-crop.png` | Cropped Nav column at 64px |
| `04-nav-communities.png` | Compact communities: avatar + subname |
| `05-nav-sections.png` | Compact section headers with synthetic icons |
| `06-nav-tooltips-probe.png` | After hover / title probe on a community |

---

## 0. Unit / shell

| ID | Check | Kind | Shot | Status |
| --- | --- | --- | --- | --- |
| `nav.unit` | Layout unit suite passes (incl. nav compact classifier/CSS) | U | — | ✓ |
| `nav.shell_home` | Reddit home loads; FAB + layout slots active | A | — | ✓ |
| `nav.flag_enabled` | Enable layout columns; Classic preset | A | `00-nav-wide.png` | ✓ |

## 1. Wide Nav (baseline)

| ID | Check | Kind | Shot | Status |
| --- | --- | --- | --- | --- |
| `nav.wide.not_compact` | Nav ≥ 200px → no `readit-nav-compact` | A | — | ✓ |
| `nav.wide.labels_visible` | Primary links show readable text (not font-size 0) | A | — | ✗ |
| `nav.wide.icons_present` | Chrome rows (Home/Popular/…) still expose SVG/img | A | — | ✗ |

## 2. Compact mode arming

| ID | Check | Kind | Shot | Status |
| --- | --- | --- | --- | --- |
| `nav.compact.class_mid` | Nav → 140px arms `readit-nav-compact` | A | `01-nav-mid.png` | ✓ |
| `nav.compact.class_min` | Nav → 64px keeps compact class | A | `02-nav-min.png` | ✓ |
| `nav.compact.width_var` | `--readit-left-nav-width` matches slider (64px) | A | — | ✓ |

## 3. Avatars & community names

| ID | Check | Kind | Shot | Status |
| --- | --- | --- | --- | --- |
| `nav.community.stamped` | ≥1 `a[data-readit-nav-kind=community]` with `.readit-nav-subname` | A | `04-nav-communities.png` | ✓ |
| `nav.community.name_accuracy` | Subname matches `/r/{name}` from href (case-insensitive) | A | — | ✓ |
| `nav.community.tooltip` | Community `title` / `aria-label` contains `r/{name}` | A | `06-nav-tooltips-probe.png` | ✓ |
| `nav.community.subname_style` | Subname ~9px (±2) and font-weight ≥600 | A | — | ✓ |
| `nav.community.avatar_visible` | Community avatar (img/faceplate-img/[avatar]) w/h ≥ 20px | A | — | ✓ |
| `nav.community.avatar_not_clipped` | Avatar box stays inside Nav slot bounds | A | — | ✓ |
| `nav.community.stack_layout` | Avatar center above subname (subname.top ≥ avatar.bottom − 2) | A | — | ✓ |

## 4. Alignment & chrome icons

| ID | Check | Kind | Shot | Status |
| --- | --- | --- | --- | --- |
| `nav.align.icons_centered` | Sample chrome/community icons \|centerΔ\| ≤ 12px vs Nav mid | A | `03-nav-min-crop.png` | ✓ |
| `nav.align.no_sideways_ellipsis` | No truncated “Start a co…” style labels dominating compact text | A | — | ✓ |
| `nav.chrome.icons_kept` | Home/Popular-style rows keep visible SVG when compact | A | — | ✓ |

## 5. Section icons & clutter

| ID | Check | Kind | Shot | Status |
| --- | --- | --- | --- | --- |
| `nav.section.stamped` | ≥1 `summary[data-readit-nav-kind=section]` with section id | A | `05-nav-sections.png` | ✓ |
| `nav.section.icon_pseudo` | Section `::before` mask/content present (computed) | A | — | ✓ |
| `nav.clutter.tags_hidden` | `.readit-user-tag` / note `::before` not visible in Nav | A | — | ✓ |
| `nav.clutter.stars_hidden` | Favorite/star controls not visible in compact Nav | A | — | ✓ |

## 6. Visual regression shots

| ID | Check | Kind | Shot | Status |
| --- | --- | --- | --- | --- |
| `nav.visual.min_shot` | Min Nav screenshot captured | A | `02-nav-min.png` | ✓ |
| `nav.visual.crop_shot` | Cropped Nav screenshot captured | A | `03-nav-min-crop.png` | ✓ |

---

## How to re-run

```bash
npm run smoke:nav
# or against Brave CDP:
npm run smoke:nav:brave
```
