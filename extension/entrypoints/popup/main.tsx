import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { CSSProperties } from "preact";
import {
  REDDIT_FONT_STACK,
  resolveProfileIcon,
  type ReaditSettings,
} from "@readit/schema";
import {
  loadSettings,
  mutateSettings,
  switchProfile,
} from "../../lib/settings";

const REDDIT_TAB_URLS = ["*://*.reddit.com/*", "*://reddit.com/*"];

/**
 * The Reddit tab the user means: the active tab when it is Reddit, else the
 * most recently used Reddit tab in this window (the popup can also be open as
 * a normal tab, e.g. in smoke runs). Only that one tab gets the studio —
 * previously every Reddit tab in every window opened it.
 */
async function studioTargetTabId(): Promise<number | null> {
  const [active] = await browser.tabs.query({
    active: true,
    currentWindow: true,
    url: REDDIT_TAB_URLS,
  });
  if (active?.id != null) return active.id;
  const inWindow = await browser.tabs.query({
    currentWindow: true,
    url: REDDIT_TAB_URLS,
  });
  const recent = inWindow
    .filter((t) => t.id != null)
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  return recent?.id ?? null;
}

function Popup() {
  const [settings, setSettings] = useState<ReaditSettings | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  if (!settings) {
    return (
      <div style={{ padding: 12, width: 280, fontFamily: REDDIT_FONT_STACK }}>
        Loading…
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 12,
        width: 300,
        fontFamily: REDDIT_FONT_STACK,
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          {(() => {
            const active = settings.profiles.find(
              (p) => p.id === settings.activeProfileId,
            );
            const icon = active && resolveProfileIcon(active, settings);
            return icon ? (
              <img
                src={`/mascots/${icon}.png`}
                alt=""
                width={28}
                height={24}
                style={{ objectFit: "contain", flexShrink: 0 }}
              />
            ) : null;
          })()}
          <select
            style={{
              display: "block",
              width: "100%",
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
        </div>
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          type="button"
          style={btnStyle}
          onClick={async () => {
            try {
              const tabId = await studioTargetTabId();
              if (tabId === null) {
                setNotice("Open a Reddit tab first.");
                return;
              }
              let opened = false;
              try {
                await browser.tabs.sendMessage(tabId, {
                  type: "readit:open-studio",
                });
                opened = true;
              } catch {
                setNotice("Reload the Reddit tab, then try again.");
              }
              if (opened) {
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
            // Toggle the stored value, not the popup's snapshot, which can be
            // stale if the studio or another device changed it meanwhile.
            const next = await mutateSettings((current) => ({
              ...current,
              paused: !current.paused,
            }));
            setSettings(next);
            try {
              const redditTabs = await browser.tabs.query({
                url: REDDIT_TAB_URLS,
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
      {notice && (
        <p style={{ fontSize: 12, color: "#ffb86b", margin: "10px 0 0" }}>
          {notice}
        </p>
      )}
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
