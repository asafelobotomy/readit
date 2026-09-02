import type { ReaditSettings } from "@readit/schema";
import { storage } from "wxt/utils/storage";
import { loadSettings, saveSettings } from "./settings";

const SYNC_KEY = "sync:readitLightweight";

export type LightweightSync = {
  activeProfileId: string;
  mode: ReaditSettings["mode"];
  paused: boolean;
};

/** Push a tiny preference subset to chrome.storage.sync when enabled. */
export async function pushLightweightSync(
  settings: ReaditSettings,
): Promise<void> {
  if (!settings.syncLightweight) return;
  const payload: LightweightSync = {
    activeProfileId: settings.activeProfileId,
    mode: settings.mode,
    paused: settings.paused,
  };
  await storage.setItem(SYNC_KEY, payload);
}

export async function pullLightweightSync(): Promise<ReaditSettings> {
  const settings = await loadSettings();
  if (!settings.syncLightweight) return settings;
  const remote = await storage.getItem<LightweightSync>(SYNC_KEY);
  if (!remote) return settings;
  return saveSettings({
    ...settings,
    activeProfileId: remote.activeProfileId || settings.activeProfileId,
    mode: remote.mode || settings.mode,
    paused: remote.paused ?? settings.paused,
  });
}
