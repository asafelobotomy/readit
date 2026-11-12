// Self-checks for the Reddit replay helpers on made-up data.
// Run: node --test scripts/reddit-replay/
import assert from "node:assert/strict";
import test from "node:test";
import { fakeShape, isMediaUrl, isPublicStaticAsset, isRedditUrl, isTelemetryUrl } from "./lib.mjs";
import { answerFor } from "./replay.mjs";
import { createScrubber, findLeaks } from "./scrub.mjs";

test("account name and id are replaced everywhere, case kept, length kept", () => {
  const s = createScrubber({ name: "Some_User42", id: "abc12345" });
  const out = s.text(
    '<a href="/user/Some_User42/">u/some_user42</a> {"author_fullname":"t2_abc12345","id":"abc12345"}',
  );
  assert.equal(out.toLowerCase().includes("some_user42"), false);
  assert.equal(out.includes("abc12345"), false);
  const fake = fakeShape("some_user42", "user");
  assert.ok(out.includes(`/user/${fake[0].toUpperCase()}`), out);
  assert.ok(out.includes(`u/${fake}`));
  assert.deepEqual(findLeaks(out, s.needles()), {});
});

test("names inside other words are left alone", () => {
  const s = createScrubber({ name: "ann" });
  assert.equal(s.text("annual planning, Ann said"), `annual planning, ${s.text("Ann")} said`);
  assert.notEqual(s.text("Ann"), "Ann");
});

test("sign-in values in attributes, JSON and hidden inputs are faked and listed", () => {
  const s = createScrubber();
  const html =
    '<shreddit-app csrf-token="AbCdEf123456789" token=\'zzzzzzzzzz\'>' +
    '<input type="hidden" name="csrf_token" value="0123456789abcdef">' +
    '<script>{"accessToken":"eyJhbGciOi.payload.sig","session":"st-998877665544","isAuth":true}</script>';
  const out = s.text(html);
  for (const secret of ["AbCdEf123456789", "zzzzzzzzzz", "0123456789abcdef", "eyJhbGciOi.payload.sig", "st-998877665544"]) {
    assert.equal(out.includes(secret), false, secret);
    assert.ok(s.secrets.has(secret), secret);
  }
  assert.ok(out.includes('"isAuth":true'));
  assert.equal(out.length, html.length);
});

test("post authors, page-view ids, feed cursors and addresses are not credentials", () => {
  const s = createScrubber();
  const html =
    '<shreddit-post author="SomePoster" author-id="t2_9z8y7x6w" author-avatar-url="https://www.redditstatic.com/avatars/x.png" ' +
    'composer-session-id="aaaa-bbbb-cccc" data-feed-token="cursor123456" token-refresh-url="/svc/shreddit/token">' +
    '<script>{"authorFlair":"blueflair1","session_id_hash":"abcdefgh12"}</script>';
  assert.equal(s.text(html), html);
  assert.equal(s.secrets.size, 0);
});

test("credential names match with a data- prefix and in unquoted script keys", () => {
  const s = createScrubber();
  const out = s.text('<div data-token="abcdefgh123"></div><script>x={token:"zyxwvut9876",loid:"0000abcd1234"}</script>');
  for (const v of ["abcdefgh123", "zyxwvut9876", "0000abcd1234"]) assert.equal(out.includes(v), false, v);
});

test("template expressions in code are not faked", () => {
  const s = createScrubber();
  const js = "render(){return t.x`<devvit-wrapper loid=\"${this.loid}\"></devvit-wrapper>`}";
  assert.equal(s.text(js), js);
});

test("Reddit's public bundles are recognised (stored as served)", () => {
  assert.ok(isPublicStaticAsset("https://www.redditstatic.com/js/concat?prefix=x&chunks=y", "script"));
  assert.ok(isPublicStaticAsset("https://www.redditstatic.com/shreddit/en-US/app.css", ""));
  assert.equal(isPublicStaticAsset("https://www.reddit.com/svc/shreddit/feeds/x", "fetch"), false);
  assert.equal(isPublicStaticAsset("https://www.redditstatic.com/shreddit/page.html", "document"), false);
});

test("the leak check reports kinds and counts, never the values", () => {
  const s = createScrubber({ name: "leaky_person" });
  const hits = findLeaks("hi leaky_person and Leaky_Person, cookie=supersecretcookievalue", s.needles(["supersecretcookievalue"]));
  assert.deepEqual(hits, { account: 2, cookie: 1 });
});

test("host classification", () => {
  assert.ok(isRedditUrl("https://www.reddit.com/r/pics/"));
  assert.ok(isRedditUrl("https://www.redditstatic.com/shreddit/en-US/app.js"));
  assert.equal(isRedditUrl("https://evil.example/?x=reddit.com"), false);
  assert.equal(isRedditUrl("https://reddit.com.evil.example/"), false);
  assert.ok(isMediaUrl("https://i.redd.it/abc.jpg", "image"));
  assert.ok(isMediaUrl("https://preview.redd.it/abc.png?width=640", "image"));
  assert.ok(isMediaUrl("https://styles.redditmedia.com/t5_2qh1i/styles/icon.png", "image"));
  assert.equal(isMediaUrl("https://www.redditstatic.com/shreddit/assets/snoo.svg", "image"), false);
  assert.equal(isMediaUrl("https://www.reddit.com/svc/shreddit/feeds/x", "fetch"), false);
  assert.ok(isTelemetryUrl("https://w3-reporting.reddit.com/reports"));
  assert.equal(isTelemetryUrl("https://www.reddit.com/r/news/"), false);
});

function rec(entries) {
  const byUrl = new Map();
  const byPath = new Map();
  for (const e of entries) {
    const k = `${e.method} ${e.url}`;
    byUrl.set(k, [...(byUrl.get(k) || []), e]);
    const u = new URL(e.url);
    const pk = `${e.method} ${u.host}${u.pathname}`;
    byPath.set(pk, [...(byPath.get(pk) || []), e]);
  }
  return { byUrl, byPath };
}

test("answers: exact address in recorded order, then the closest query", () => {
  const r = rec([
    { method: "GET", url: "https://www.reddit.com/svc/feed?after=a&sort=hot", body: "1" },
    { method: "GET", url: "https://www.reddit.com/svc/feed?after=a&sort=hot", body: "2" },
    { method: "GET", url: "https://www.reddit.com/svc/feed?after=b&sort=new", body: "3" },
  ]);
  const cursor = new Map();
  const exact = "https://www.reddit.com/svc/feed?after=a&sort=hot";
  assert.equal(answerFor(r, "GET", exact, null, cursor).hit.body, "1");
  assert.equal(answerFor(r, "GET", exact, null, cursor).hit.body, "2");
  assert.equal(answerFor(r, "GET", exact, null, cursor).hit.body, "2", "the last answer sticks");
  const near = answerFor(r, "GET", "https://www.reddit.com/svc/feed?after=z&sort=new", null, cursor);
  assert.equal(near.exact, false);
  assert.equal(near.hit.body, "3");
  assert.equal(answerFor(r, "GET", "https://www.reddit.com/other", null, cursor), null);
});
