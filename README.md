# readit

Profile-first Chrome MV3 extension for **New Reddit (shreddit)** — readers, creators, and moderators.

**Positioning:** New Reddit only. It does **not** restore Old Reddit (use [Old Reddit Redirect](https://github.com/tom-james-watson/old-reddit-redirect) if that is your goal). Soft-disables overlapping Mod Desk modules when **Moderator Toolbox** is detected.

Studio UI ships English by default with an experimental Chinese locale switch in Advanced.

Clean-room implementation (inspired by RedditEnhancer / Moderator Toolbox workflows; no copied source).

## Stack

- [WXT](https://wxt.dev) + Preact + TypeScript
- Packages: `@readit/schema`, `@readit/css-engine`, `@readit/features`
- App: `extension/`

## Develop

```bash
npm install
npm run build
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked**
4. Select this folder (must contain `manifest.json`):

```text
~/GitHub/readit/dist/chrome-mv3
```

Do **not** load `~/GitHub/readit/extension` — that is WXT source and has no `manifest.json`.

For HMR during development:

```bash
npm run dev
```

Then load `~/GitHub/readit/dist/chrome-mv3-dev` instead (path is also printed by WXT).

## Profiles

| Profile | Audience |
| --- | --- |
| Focus Reader | Readers |
| Dense Power | Readers / creators |
| Creator Desk | Creators |
| Minimal Media | Readers |
| Mod Desk | Moderators |

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Profiles, filters, tags, macros, usernotes (local) |
| `activeTab` | Popup → open studio / pause on the current Reddit tab |
| Host `*.reddit.com` | Content scripts + CSS on New Reddit |

No analytics. No remote servers. Optional sync of lightweight prefs can be enabled later (`syncLightweight`); packs and usernotes stay local + JSON export.

## Docs

- [Coexistence](docs/coexistence.md) — uBlock, Stylus, Moderator Toolbox
- [Smoke checklist](docs/smoke-checklist.md) — selector / feature health
- [Store listing draft](docs/store-listing.md) — Chrome Web Store copy

## Releases

Version source of truth: `extension/package.json` (WXT writes it into the Chrome manifest).

1. Bump `version` in `extension/package.json` (and keep workspace `packages/*/package.json` in sync).
2. Merge to `main` (or `master`).
3. GitHub Actions [`.github/workflows/release.yml`](.github/workflows/release.yml) builds `readit-<version>-chrome.zip` and publishes a GitHub Release tagged `v<version>`.

Local zip without releasing:

```bash
npm run zip
# → dist/readit-<version>-chrome.zip
```

## License

MIT
