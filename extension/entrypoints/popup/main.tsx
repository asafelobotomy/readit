import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { CSSProperties } from "preact";
import type { ReaditSettings } from "@readit/schema";
import {
  loadSettings,
  patchSettings,
  switchProfile,
} from "../../lib/settings";

function Popup() {
  const [settings, setSettings] = useState<ReaditSettings | null>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  if (!settings) {
    return (
      <div style={{ padding: 12, width: 280, fontFamily: "system-ui" }}>
        Loading…
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 12,
        width: 300,
        fontFamily: "system-ui, sans-serif",
        color: "#eee",
        background: "#121213",
      }}
    >
      <strong style={{ fontSize: 15 }}>readit</strong>
      <p style={{ fontSize: 12, color: "#999", margin: "6px 0 12px" }}>
        Profile-first New Reddit workspace
      </p>

      <label style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
        Active profile
        <select
          style={{
            display: "block",
            width: "100%",
            marginTop: 4,
            padding: 6,
            borderRadius: 6,
            border: "1px solid #444",
            background: "#1a1a1b",
            color: "#eee",
          }}
          value={settings.activeProfileId}
          onChange={async (e) => {
            const next = await switchProfile(e.currentTarget.value);
            setSettings(next);
          }}
        >
          {settings.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          type="button"
          style={btnStyle}
          onClick={async () => {
            try {
              const redditTabs = await browser.tabs.query({
                url: ["*://*.reddit.com/*", "*://reddit.com/*"],
              });
              if (!redditTabs.length) return;
              const results = await Promise.all(
                redditTabs.map(async (tab) => {
                  if (!tab.id) return false;
                  try {
                    await browser.tabs.sendMessage(tab.id, {
                      type: "readit:open-studio",
                    });
                    return true;
                  } catch {
                    return false;
                  }
                }),
              );
              if (results.some(Boolean)) {
                // Toolbar popups are small; skip close when opened as a normal tab (smoke/CDP).
                if (window.outerWidth <= 420 && window.outerHeight <= 640) {
                  try {
                    window.close();
                  } catch {
                    /* ignore */
                  }
                }
              }
            } catch {
              // tabs.query may fail in restricted hosts
            }
          }}
        >
          Open studio
        </button>
        <button
          type="button"
          style={btnStyle}
          onClick={async () => {
            const next = await patchSettings({ paused: !settings.paused });
            setSettings(next);
            try {
              const redditTabs = await browser.tabs.query({
                url: ["*://*.reddit.com/*", "*://reddit.com/*"],
              });
              await Promise.all(
                redditTabs.map(async (tab) => {
                  if (!tab.id) return;
                  try {
                    await browser.tabs.sendMessage(tab.id, {
                      type: "readit:settings-changed",
                    });
                  } catch {
                    // Tab may not have content script yet
                  }
                }),
              );
            } catch {
              // tabs.query may fail without tabs permission in some hosts
            }
          }}
        >
          {settings.paused ? "Resume" : "Pause"} extension
        </button>
      </div>
    </div>
  );
}

const btnStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #555",
  background: "#222",
  color: "#eee",
  cursor: "pointer",
  fontSize: 13,
};

render(<Popup />, document.getElementById("app")!);
