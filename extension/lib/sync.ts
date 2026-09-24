import {
  applyLightweightSync,
  parseLightweightSync,
  type LightweightSync,
  type ReaditSettings,
} from "@readit/schema";
import { storage } from "wxt/utils/storage";
import { loadSettings, saveSettings } from "./settings";

export const SYNC_KEY = "sync:readitLightweight";

export type { LightweightSync };

function payloadOf(settings: ReaditSettings): LightweightSync {
  return {
    activeProfileId: settings.activeProfileId,
    mode: settings.mode,
    paused: settings.paused,
  };
}

function samePayload(a: LightweightSync | null, b: LightweightSync): boolean {
  return (
    !!a &&
    a.activeProfileId === b.activeProfileId &&
    a.mode === b.mode &&
    a.paused === b.paused
  );
}

/** Last payload this context wrote (or read), to skip redundant sync writes. */
let lastSynced: LightweightSync | null = null;

/**
 * Push the tiny preference subset to chrome.storage.sync when enabled.
 *
 * Every local save calls this, so it only writes when the synced fields
 * actually changed (sync has a small per-minute write quota), and it never
 * throws: a failed sync write must not fail the local save.
 */
export async function pushLightweightSync(
  settings: ReaditSettings,
): Promise<void> {
  if (!settings.syncLightweight) return;
  const payload = payloadOf(settings);
  if (samePayload(lastSynced, payload)) return;
  try {
    await storage.setItem(SYNC_KEY, payload);
    lastSynced = payload;
  } catch (err) {
    console.warn("[readit] lightweight sync write failed", err);
  }
}

export async function readLightweightSync(): Promise<LightweightSync | null> {
  try {
    return parseLightweightSync(await storage.getItem(SYNC_KEY));
  } catch {
    return null;
  }
}

/**
 * Pull remote prefs into local settings when sync is enabled. Saves only on
 * an actual change, so a pull → save → push round trip settles instead of
 * echoing between devices.
 */
export async function pullLightweightSync(
  remoteRaw?: unknown,
): Promise<ReaditSettings> {
  const settings = await loadSettings();
  if (!settings.syncLightweight) return settings;
  const remote =
    remoteRaw === undefined
      ? await readLightweightSync()
      : parseLightweightSync(remoteRaw);
  if (!remote) return settings;
  lastSynced = remote;
  const next = applyLightweightSync(settings, remote);
  return next === settings ? settings : saveSettings(next);
}

/** Background-only: pull on startup and whenever another device pushes. */
export function startLightweightSync(): () => void {
  void pullLightweightSync();
  return storage.watch(SYNC_KEY, (value) => {
    if (value) void pullLightweightSync(value);
  });
}
