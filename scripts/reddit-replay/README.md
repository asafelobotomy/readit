# Reddit replay: smoke runs without the live site

A local, offline copy of the Reddit pages the smoke suites use, so readit can be
smoke-tested without visiting reddit.com every time. It isn't a mock: it is
Reddit's own app (its server-rendered HTML, scripts, styles and fonts) with the
answers it gave on the day, served back at the real addresses so readit's
content scripts match exactly as they do live.

Nothing Reddit-derived is committed. Recordings live in
`~/.cache/readit/reddit-replay/<stamp>/` (`READIT_REPLAY_DIR` moves it):

```
<stamp>/set.json    when, which browser, signed in or out, pages, leak-check result
<stamp>/log.json    every recorded request: method, address, status, content type, body file
<stamp>/bodies/     the response bodies (scrubbed text, or binary like fonts)
```

## 1. Record (live, read-only, once in a while)

```bash
READIT_CDP=chrome npm run replay:record [-- --pages=home,thread]
```

Recording attaches to a Chromium you already run over CDP, the same way
`smoke:habits` does (`READIT_CDP` takes the same values; for Chrome, switch on
remote debugging in `chrome://inspect`). It has to be your own browser: Reddit
shows a fresh automated browser a "Prove your humanity" check, and recording
stops if it sees one — answer it yourself in that browser, then run again.

It opens its own tab, visits each page in `pages.mjs` (load, scroll the feed a
few times, rest 4–8 s), closes the tab and disconnects. It never clicks, types,
votes or joins.

What it keeps and what it doesn't:

- Kept: Reddit's HTML, scripts, styles, fonts, UI images and API answers.
- Never stored: cookies, request and response headers (only the content type
  and redirect targets), post and profile media (they replay as placeholders),
  telemetry.
- Signed in, it reads your name and id from `/api/me.json` before capture
  starts and replaces both everywhere, keeping length and case. Values under
  names like `token`, `csrf`, `session`, `auth` (attributes, JSON, hidden
  inputs) are faked too.
- The leak check then searches every stored body and address for your name,
  your id, every faked value and every reddit.com cookie value. Any hit fails
  the run; replay won't use a set that failed. It prints kinds and counts,
  never the strings.

A signed-out recording matches what the default (fresh-profile) smoke run
sees. A signed-in one adds your joined communities to the left nav, which the
nav-rail checks need.

## 2. Replay

```bash
npm run smoke:replay          # smoke-reddit against the newest clean recording
npm run smoke:layout:replay
npm run smoke:nav:replay
npm run smoke:edit:replay
READIT_REPLAY=<stamp> npm run smoke:replay   # a particular recording
```

`READIT_REPLAY` switches a Playwright-mode suite (not `READIT_CDP`) onto the
recording:

- Reddit requests are answered from the recording: the exact address first
  (repeats in recorded order), otherwise the same path with the most similar
  query (feed cursors differ run to run).
- Post media gets placeholders; telemetry gets an empty 204.
- Every other host is refused, Reddit's service worker is blocked, and the
  browser starts with an unreachable proxy, so a request that ever slips past
  the replay fails instead of reaching the internet.
- Each suite uses its own `-replay` browser profile, so a live run's cached
  service worker can't answer behind the replay's back.

At the end the suite prints what the replay served and every request it
couldn't answer. A missed page is the cue to add it to `pages.mjs` and record
again.

`npm run test:replay` (part of `npm test`) checks the scrub, host and matching
helpers on made-up data.

## What the replay can't test

- Anything that changes Reddit state (votes, joins, posts, mod actions): only
  recorded answers exist.
- Fresh data: the feed is as it was when recorded, and lists end where the
  recording stopped scrolling.
- Pages and partial loads the recording never fetched (they show up as misses).
- Firefox: the replay drives Chromium through Playwright, like the live smoke
  suites.
