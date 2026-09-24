import { applyProfile } from "./profiles.js";
import { ReaditSettingsSchema, type ReaditSettings } from "./types.js";

/** The tiny preference subset mirrored to chrome.storage.sync. */
export type LightweightSync = {
  activeProfileId: string;
  mode: ReaditSettings["mode"];
  paused: boolean;
};

const ModeSchema = ReaditSettingsSchema.shape.mode.removeDefault();

/** Validate a synced payload from another device (never trust its shape). */
export function parseLightweightSync(raw: unknown): LightweightSync | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const mode = ModeSchema.safeParse(r.mode);
  if (typeof r.activeProfileId !== "string" || !mode.success) return null;
  if (typeof r.paused !== "boolean") return null;
  return { activeProfileId: r.activeProfileId, mode: mode.data, paused: r.paused };
}

/**
 * Apply a remote payload. Switching profile goes through applyProfile so the
 * profile's knobs/layout come along (not just its id); unknown profile ids
 * (e.g. a custom profile that only exists on the other device) are ignored.
 */
export function applyLightweightSync(
  settings: ReaditSettings,
  remote: LightweightSync,
): ReaditSettings {
  let next = settings;
  if (
    remote.activeProfileId !== settings.activeProfileId &&
    settings.profiles.some((p) => p.id === remote.activeProfileId)
  ) {
    next = applyProfile(next, remote.activeProfileId);
  }
  if (remote.mode !== next.mode || remote.paused !== next.paused) {
    next = { ...next, mode: remote.mode, paused: remote.paused };
  }
  return next;
}
