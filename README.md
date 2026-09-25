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

## Test

```bash
npm test                 # unit checks: layout + settings hardening (run in CI)
npm run check:versions   # workspace + lockfile versions agree (run in CI)
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

No analytics. No remote servers. Optional sync of lightweight prefs can be enabled later (`syncLightweight`); packs and usernotes stay local + JSON export.

## Docs

- [Coexistence](docs/coexistence.md) — uBlock, Stylus, Moderator Toolbox
- [Smoke checklist](docs/smoke-checklist.md) — selector / feature health
- [Store listing draft](docs/store-listing.md) — Chrome Web Store copy

## Releases

Version source of truth: `extension/package.json` (WXT writes it into the Chrome manifest).

1. Bump every workspace (root, `extension/`, `packages/*`) and `package-lock.json` together:

   ```bash
   npm run version:set -- 0.2.3
   ```

   CI fails (`npm run check:versions`) if these drift apart.
2. Merge to `main` (or `master`).
3. GitHub Actions [`.github/workflows/release.yml`](.github/workflows/release.yml) builds `readit-<version>-chrome.zip` and publishes a GitHub Release tagged `v<version>`.

Local zip without releasing:

```bash
npm run zip
# → dist/readit-<version>-chrome.zip
```

## Assets

`icons/` holds the full-size logo and mascot source art. The toolbar icons in `extension/public/icon/` and the in-page mascots in `extension/public/mascots/` are downscaled from it.

## License

MIT
