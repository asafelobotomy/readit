# readit

Profile-first MV3 extension for **New Reddit (shreddit)** in Chrome and Firefox — readers, creators, and moderators.

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
4. Select the build folder inside your clone (it must contain `manifest.json`):

```text
<your clone>/dist/chrome-mv3
```

Do **not** load `<your clone>/extension` — that is WXT source and has no `manifest.json`.

For HMR during development:

```bash
npm run dev
```

Then load `<your clone>/dist/chrome-mv3-dev` instead (path is also printed by WXT).

### Load in Firefox

Requires Firefox 140 or later (ESR 140 included).

```bash
npm run build:firefox
```

1. Open `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…**
3. Pick `<your clone>/dist/firefox-mv3/manifest.json`

Temporary add-ons are removed when Firefox restarts. `npm run dev:firefox` builds `dist/firefox-mv3-dev` with HMR and launches a fresh Firefox profile with it installed.

If the toolbar popup says readit can't access reddit.com, click **Allow access to reddit.com** (Firefox lets users revoke an extension's site access in `about:addons` → readit → **Permissions**), then reload your Reddit tabs.

#### Firefox differences

- The post pop-out's Back-button handling uses the Navigation API. Where a Firefox build lacks it, the pop-out still opens and closes with its own controls, but Back navigates the page instead of closing it.
- Settings export downloads through a `data:` URL instead of a `blob:` URL, since a `blob:` made in a Firefox content script doesn't belong to reddit.com.
- The smoke scripts drive Chromium over CDP; there is no Firefox smoke suite. `npm run lint:firefox` runs Mozilla's add-on validator on the Firefox build.

## Test

```bash
npm test                 # unit checks: layout + settings hardening (run in CI)
npm run check:versions   # workspace + lockfile versions agree (run in CI)
npm run lint:firefox     # AMO validator on dist/firefox-mv3 (run in CI; build:firefox first)
npm run smoke            # end-to-end against live New Reddit (local only)
npm run smoke:habits     # classic habits against your own browser (see below)
```

The `READIT_CDP` smoke variants connect to a browser you already run. `READIT_CDP=chrome` reads `DevToolsActivePort`, which Chrome writes when remote debugging is switched on in `chrome://inspect` (that mode has no `/json/version` endpoint). A `ws://…` endpoint or `http://127.0.0.1:<port>` also works. `smoke:habits` backs up readit's settings before it runs and restores them afterwards, opens and closes only its own tabs, and never votes, joins or changes your Reddit account.

Smoke runs save screenshots and `results.json` to the git-ignored `.smoke-evidence/`. To refresh the committed `results.json` files under `docs/smoke-evidence/`, run with `READIT_EVIDENCE_DIR=docs/smoke-evidence`; screenshots are never committed (they were purged from history to keep clones small).

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
| `storage` | Profiles, filters, tags, macros, usernotes, mark-read history (local); optional lightweight sync |
| Host `*.reddit.com` | Content scripts + CSS on New Reddit; also covers the popup's `tabs.query`/`sendMessage` to Reddit tabs, so neither `tabs` nor `activeTab` is requested |

The Firefox build declares `data_collection_permissions: none` and the add-on ID `readit@asafelobotomy.github.io` (`extension/wxt.config.ts`). Keep that ID once a build is published: AMO and `storage.sync` are keyed to it.

No analytics. No remote servers. Optional sync of lightweight prefs can be enabled later (`syncLightweight`); packs and usernotes stay local + JSON export.

## Docs

- [Coexistence](docs/coexistence.md) — uBlock, Stylus, Moderator Toolbox
- [Smoke checklist](docs/smoke-checklist.md) — selector / feature health
- [Store listing draft](docs/store-listing.md) — Chrome Web Store / AMO copy

## Releases

Version source of truth: `extension/package.json` (WXT writes it into both manifests).

1. Bump every workspace (root, `extension/`, `packages/*`) and `package-lock.json` together:

   ```bash
   npm run version:set -- 0.2.3
   ```

   CI fails (`npm run check:versions`) if these drift apart.
2. Merge to `main` (or `master`).
3. GitHub Actions [`.github/workflows/release.yml`](.github/workflows/release.yml) builds `readit-<version>-chrome.zip`, `readit-<version>-firefox.zip` and `readit-<version>-sources.zip`, and publishes them as a GitHub Release tagged `v<version>`.

Local zips without releasing:

```bash
npm run zip
# → dist/readit-<version>-chrome.zip
npm run zip:firefox
# → dist/readit-<version>-firefox.zip + dist/readit-<version>-sources.zip
```

For [addons.mozilla.org](https://addons.mozilla.org/developers/), upload the Firefox zip, and the sources zip when AMO asks for source code (the bundle is minified). Reviewers rebuild it with `npm ci && npm run build:firefox`, which reproduces `dist/firefox-mv3` byte for byte.

## Assets

`icons/` holds the full-size logo and mascot source art. The toolbar icons in `extension/public/icon/` and the in-page mascots in `extension/public/mascots/` are downscaled from it.

## License

MIT
