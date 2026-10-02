import { defineConfig } from "wxt";
import preact from "@preact/preset-vite";

/**
 * Firefox add-on ID. AMO and storage.sync key everything to it, so it must
 * never change once a build has been published.
 */
const GECKO_ID = "readit@asafelobotomy.github.io";

export default defineConfig({
  modules: [],
  // MV3 for every browser. WXT defaults Firefox to MV2, which ignores the
  // `world: "MAIN"` content scripts (left-nav hydrate, pointer bridge): they
  // would run in the isolated world, where page custom-element methods are
  // hidden behind Xray wrappers.
  manifestVersion: 3,
  // "Load unpacked" / "Load Temporary Add-on" must point at the built folder
  // (contains manifest.json), not this source directory.
  // Output: <repo>/dist/chrome-mv3, <repo>/dist/firefox-mv3
  outDir: "../dist",
  vite: () => ({
    plugins: [preact()],
  }),
  zip: {
    // Prefer a stable product name over the npm package name (@readit/extension).
    artifactTemplate: "readit-{{packageVersion}}-{{browser}}.zip",
    // AMO asks for the source of bundled code; `wxt zip -b firefox` writes it.
    sourcesTemplate: "readit-{{packageVersion}}-sources.zip",
    // The whole monorepo: the bundle pulls in packages/* too. (WXT 0.21
    // prints a "Could not get stats" warning per file here; it only affects
    // its size table, not the zip.)
    sourcesRoot: "..",
    excludeSources: [
      "dist/**",
      ".smoke-evidence/**",
      "docs/smoke-evidence/**",
      "icons/**",
      "**/.wxt/**",
      "**/.output/**",
    ],
  },
  manifest: ({ browser }) => ({
    name: "readit",
    description:
      "Profile-first New Reddit workspace for readers, creators, and mods — live in-page customization.",
    permissions: ["storage"],
    host_permissions: ["*://*.reddit.com/*"],
    optional_permissions: [],
    web_accessible_resources: [
      {
        // Mascot art rendered into the Reddit page (header, profile cards)
        // must be reachable from the reddit.com origin's own DOM.
        resources: ["mascots/*"],
        matches: ["*://*.reddit.com/*"],
      },
    ],
    icons: {
      "16": "icon/16.png",
      "32": "icon/32.png",
      "48": "icon/48.png",
      "128": "icon/128.png",
    },
    ...(browser === "firefox" && {
      browser_specific_settings: {
        gecko: {
          id: GECKO_ID,
          // 128: MV3 `world: "MAIN"` content scripts.
          // 140: `data_collection_permissions` (first ESR with both).
          strict_min_version: "140.0",
          // readit sends nothing anywhere (see README → Permissions).
          data_collection_permissions: { required: ["none"] },
        },
        // Android only gained `data_collection_permissions` in 142.
        gecko_android: { strict_min_version: "142.0" },
      },
    }),
  }),
});
