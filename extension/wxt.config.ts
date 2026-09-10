import { defineConfig } from "wxt";
import preact from "@preact/preset-vite";

export default defineConfig({
  modules: [],
  // Chrome "Load unpacked" must point at the built folder (contains manifest.json),
  // not this source directory. Output: <repo>/dist/chrome-mv3
  outDir: "../dist",
  vite: () => ({
    plugins: [preact()],
  }),
  zip: {
    // Prefer a stable product name over the npm package name (@readit/extension).
    artifactTemplate: "readit-{{packageVersion}}-{{browser}}.zip",
  },
  manifest: {
    name: "readit",
    description:
      "Profile-first New Reddit workspace for readers, creators, and mods — live in-page customization.",
    permissions: ["storage", "activeTab"],
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
  },
});
