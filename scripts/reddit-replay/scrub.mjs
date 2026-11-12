// Scrubbing for recorded Reddit pages. Applied at record time, so the
// recording account's name, id and sign-in values never reach the disk.
import { escapeRegExp, fakeShape } from "./lib.mjs";

/**
 * Attribute / key names whose values are sign-in material — whole names only
 * (an optional `data-` prefix aside). Substrings over-match: "auth" is in
 * every post's `author`, and `*-session-id` / `feed-token` are page-view ids
 * and feed cursors, not credentials.
 */
const SECRET_NAME =
  "(?:data-)?(?:token|access[_-]?token|refresh[_-]?token|auth[_-]?token|id[_-]?token|token[_-]?v2|" +
  "csrf|csrf[_-]?token|x[_-]?csrf[_-]?token|bearer|authorization|session|session[_-]?token|" +
  "reddit[_-]?session|loid|edgebucket|jwt|password|secret|client[_-]?secret)";

// key="value" / key='value' (HTML attributes)
const SECRET_ATTR = new RegExp(`(\\s${SECRET_NAME}\\s*=\\s*)(["'])([^"']{8,})\\2`, "gi");
// "key":"value" / 'key': 'value' / key: "value" (JSON and inline script)
const SECRET_JSON = new RegExp(
  `((?<![\\w-])(["']?)${SECRET_NAME}\\2\\s*:\\s*)(["'])([^"'\\\\]{8,})\\3`,
  "gi",
);
// name="csrf_token" value="…" (hidden form inputs)
const SECRET_INPUT = new RegExp(
  `(<input[^>]*\\bname\\s*=\\s*["']${SECRET_NAME}["'][^>]*\\bvalue\\s*=\\s*)(["'])([^"']{8,})\\2`,
  "gi",
);

/** Keep the case pattern of `match` on a same-length `fake`. */
function sameCase(match, fake) {
  let out = "";
  for (let i = 0; i < fake.length; i++) {
    const m = match[i] ?? "";
    out += m && m === m.toUpperCase() && m !== m.toLowerCase() ? fake[i].toUpperCase() : fake[i];
  }
  return out;
}

/**
 * A scrubber for one recording account. `identity` is what `/api/me.json`
 * said: `{ name, id }` (both optional — a logged-out recording has neither).
 * `secrets` collects every sign-in value replaced, for the leak check.
 */
export function createScrubber(identity = {}) {
  const secrets = new Set();
  const people = [];
  const name = String(identity.name || "").trim();
  const id = String(identity.id || "").replace(/^t2_/, "").trim();
  if (name.length >= 3) {
    const fake = fakeShape(name.toLowerCase(), "user");
    // Usernames are [A-Za-z0-9_-]: match whole names only, any case.
    people.push({
      re: new RegExp(`(?<![A-Za-z0-9_-])${escapeRegExp(name)}(?![A-Za-z0-9_-])`, "gi"),
      to: (m) => sameCase(m, fake),
      needle: name,
    });
  }
  if (id.length >= 4) {
    const fake = fakeShape(id, "user-id");
    people.push({
      re: new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(id)}(?![A-Za-z0-9])`, "g"),
      to: () => fake,
      needle: id,
    });
  }

  const fakeSecret = (value) => {
    // Short or boolean-ish values aren't credentials.
    if (/^(true|false|null|undefined|none)$/i.test(value)) return value;
    // Addresses (a token-refresh endpoint, say) aren't credentials, and faking
    // them would break the requests the app builds from them.
    if (/^(https?:\/\/|\/)/i.test(value)) return value;
    // A template expression in code (`loid="${e.loid}"`), not a value.
    if (value.includes("${")) return value;
    secrets.add(value);
    return fakeShape(value, "secret");
  };

  /** Scrub one text body (HTML, JSON, inline script) or URL. */
  function text(body) {
    let out = String(body);
    out = out.replace(SECRET_INPUT, (_m, pre, q, v) => `${pre}${q}${fakeSecret(v)}${q}`);
    out = out.replace(SECRET_ATTR, (_m, pre, q, v) => `${pre}${q}${fakeSecret(v)}${q}`);
    out = out.replace(SECRET_JSON, (_m, pre, _q, q, v) => `${pre}${q}${fakeSecret(v)}${q}`);
    for (const p of people) out = out.replace(p.re, p.to);
    return out;
  }

  /** The strings that must not survive anywhere in the recording. */
  function needles(extra = []) {
    return [
      ...people.map((p) => ({ kind: "account", value: p.needle })),
      ...[...secrets].map((value) => ({ kind: "secret", value })),
      ...extra.filter((v) => typeof v === "string" && v.length >= 8).map((value) => ({ kind: "cookie", value })),
    ];
  }

  return { text, needles, secrets };
}

/**
 * Every needle found in `body`, as kinds and counts — never the strings
 * themselves, so a failing check doesn't print the account's data.
 */
export function findLeaks(body, needles) {
  const hits = {};
  const lower = String(body).toLowerCase();
  for (const n of needles) {
    const v = n.kind === "account" ? n.value.toLowerCase() : n.value;
    const hay = n.kind === "account" ? lower : String(body);
    if (!v || !hay.includes(v)) continue;
    if (n.kind === "account") {
      // Whole-word only: a 3-letter name inside other words isn't a leak.
      const re = new RegExp(`(?<![a-z0-9_-])${escapeRegExp(v)}(?![a-z0-9_-])`, "g");
      const count = (lower.match(re) || []).length;
      if (count) hits[n.kind] = (hits[n.kind] || 0) + count;
    } else {
      hits[n.kind] = (hits[n.kind] || 0) + hay.split(v).length - 1;
    }
  }
  return hits;
}

/** Is a response body text we should scrub (rather than binary)? */
export function isTextType(contentType = "", type = "") {
  return (
    /^(text\/|application\/(json|javascript|x-javascript|xml|xhtml|ld\+json|manifest\+json))|\+json|svg/i.test(
      contentType,
    ) || /^(document|xhr|fetch|script|stylesheet)$/i.test(type)
  );
}
