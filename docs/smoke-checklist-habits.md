# Classic habits — smoke checklist

Old-Reddit habits on New Reddit (0.3.0): **sticky comment sort**, **open in new tab or pop-out**, and **All · Global** in place of the r/all that Reddit removed.

**Latest automated run:** 2026-09-25 · **25 pass / 0 fail / 0 skip** (logged-in Chrome 154, nav-right layout with compact rail)

**Harness:** `npm run smoke:habits` (CDP; defaults to `READIT_CDP=chrome`)

**Evidence:** `.smoke-evidence/habits/results.json`, `all-link.png` and `popout.png` (git-ignored)

**Unit:** `npm run test:hardening` covers `withCommentSort`, sort resolution and memory, the direct-load redirect, the r/all helpers, and attribute stamp/restore (including when Reddit rewrites a stamped link), and which clicks the pop-out takes over.

Legend: **A** automated · **U** unit

---

## How each feature hooks into Reddit

| Feature | Hook (checked live 2026-09-24) |
| --- | --- |
| Comment sort | Reddit applies `?sort=confidence\|top\|new\|old\|controversial\|qa` on the server. readit adds it to thread links; card, title and comment-button clicks all follow the stamped href. |
| Remember mode | Reddit's menu options are `<data value="CONFIDENCE">` inside `shreddit-sort-dropdown[telemetry-source="comment_sort"]`. |
| Direct loads | `early.content` calls `location.replace()`. The unsorted page never paints, and the redirect costs about 0.4 s (6.39 s vs 5.96 s, 3 runs). |
| New tab | `shreddit-post[pdp-target]`: setting it to `_blank` makes Reddit's own card handler open a tab. |
| Pop-out | A same-origin `<iframe>` of the real post page (`X-Frame-Options: SAMEORIGIN`). readit hides `reddit-header-large`, `#left-sidebar-container`, `#right-sidebar-container` and `pdp-back-button`, and widens `.grid-container` / `#subgrid-container`. Logged-in state, replying, voting and sorting all carry over. |
| Back closes the pop-out | Opening pushes a same-URL entry; Back pops it. Entries are tracked by Navigation API key (`history.state` reads null in an extension's isolated world). `early.content` listens at `document_start`, ahead of Reddit, for `popstate` and `navigate`, and stops both for readit's own entries — otherwise Reddit's router intercepts the push and delays its commit. Next/previous use `location.replace` in the frame, so they add no Back steps. |
| All · Global | `/r/all` returns a 301 to `/` (logged in or out). The link goes to `/r/popular/<sort>/?geo_filter=global` and sits right after `left-nav-top-section` (a Lit shadow host), in the light DOM. |

---

## Checks

| ID | What | Type | Status |
| --- | --- | --- | --- |
| `habits.selectors` | `pdp-target`, `left-nav-top-section`, `a[slot="full-post-link"]` present | A | ✓ |
| `habits.sort.links` | Every feed thread link carries `?sort=` | A | ✓ |
| `habits.sort.click` | Card click → thread URL has the sort; dropdown reads “Sort by New” | A | ✓ |
| `habits.sort.remember` | A menu pick is stored for that subreddit (stand-in menu; account untouched) | A | ✓ |
| `habits.sort.direct` | Direct load redirects to the sort; the unsorted document never paints | A | ✓ |
| `habits.newtab.stamp` | `pdp-target="_blank"` on every feed post | A | ✓ |
| `habits.newtab.click` | Card click opens a new tab; original tab stays put | A | ✓ |
| `habits.popout.open` | Card click opens the post in the pop-out; the feed URL and tab count stay the same | A | ✓ |
| `habits.popout.chrome` | Reddit's header, right rail and back arrow are hidden in the frame; the page stops scrolling underneath | A | ✓ |
| `habits.popout.next` | Next post loads the following feed post | A | ✓ |
| `habits.popout.esc-typing` | Esc while typing a comment stays with Reddit's composer | A | ✓ |
| `habits.popout.draft` | Closing with an unsent comment asks first (the text is never submitted) | A | ✓ |
| `habits.popout.comments` | The card's comments button (shadow DOM) opens the pop-out too | A | ✓ |
| `habits.popout.esc` | Esc closes and restores scrolling | A | ✓ |
| `habits.popout.back` | Back closes it; same feed card element, same scroll position | A | ✓ |
| `habits.popout.forward-next` | Forward reopens it; after Next, one Back still closes | A | ✓ |
| `habits.popout.close-rewinds` | × steps off the pop-out entry, so the next Back leaves the feed as usual | A | ✓ |
| `habits.popout.close-after-frame-nav` | × still unwinds after a navigation inside the frame | A | ✓ |
| `habits.popout.back-draft` | Back with an unsent comment restores the entry and asks first | A | ✓ |
| `habits.popout.links` | A community link inside the pop-out closes it and opens the page in the tab | A | ✓ |
| `habits.all.navlink` | Left-nav link present with the global Popular href | A | ✓ |
| `habits.all.rail` | Item appears in the compact nav rail (skipped when the rail is not mounted) | A | ✓ |
| `habits.all.rewrite` | An in-page `/r/all` link is retargeted | A | ✓ |
| `habits.all.open` | Link opens global Popular and marks itself `aria-current="page"` | A | ✓ |
| `habits.teardown` | Turning all three off removes every stamp and the nav link | A | ✓ |
