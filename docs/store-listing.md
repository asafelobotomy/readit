# Chrome Web Store listing (draft)

## Name

readit — New Reddit profiles & studio

## Short description

Customize New Reddit with profiles, live in-page controls, filters, and mod tools. English, Chrome, New Reddit only.

## Detailed description

readit turns New Reddit into a personal workspace for readers, creators, and moderators.

**Simple mode** — pick a profile (Focus Reader, Dense Power, Creator Desk, Minimal Media, Mod Desk) and tweak a handful of knobs: feed width, density, hide noise, media behavior.

**Advanced mode** — searchable feature explorer, element picker, per-subreddit overrides, and health status when Reddit’s DOM shifts.

**On-page studio** — customize Reddit without digging through a popup wall of toggles. Drag feed width, undo changes, export/import your setup.

**Curate** — keyword/user/subreddit filters, user tags, reading mode, local reading queues.

**Create** — canned replies, clean share links, absolute timestamps, OP highlight.

**Mod Desk** — Toolbox-inspired macros, local usernotes, and quick actions for New Reddit (soft-disables when Moderator Toolbox is already installed).

Privacy: settings stay in your browser. No analytics. No accounts.

Not affiliated with Reddit.

## Category

Productivity / Social & Communication

## Privacy policy summary

readit stores its settings (profiles, filters, tags, usernotes, macros, saved items) and mark-read history in the extension's own `chrome.storage.local`, which Reddit's pages cannot read. Optional lightweight sync (off by default) copies only the active profile, simple/advanced mode and paused state to `chrome.storage.sync`. No remote servers. No analytics. No sale of data.

## Permissions

- `storage` — the local settings above, and optional lightweight sync.
- Host access to `*.reddit.com` — to customize New Reddit pages, and so the popup can reach the Reddit tab it opens the studio in.
