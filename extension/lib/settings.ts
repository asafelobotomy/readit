import {
  applyProfile,
  createDefaultSettings,
  migrateSettings,
  previewImport,
  ReaditSettingsSchema,
  SETTINGS_VERSION,
  type ExportBundle,
  type ImportPreview,
  type ReaditSettings,
  unwrapImport,
} from "@readit/schema";
import { storage } from "wxt/utils/storage";
import { mutateAgainstFresh } from "./settings-cas";
import { pushLightweightSync } from "./sync";

const KEY = "local:readitSettings";

export const settingsItem = storage.defineItem<ReaditSettings>(KEY, {
  fallback: createDefaultSettings(),
});

export async function loadSettings(): Promise<ReaditSettings> {
  const raw = await storage.getItem(KEY);
  if (!raw) {
    const defaults = createDefaultSettings();
    await settingsItem.setValue(defaults);
    return defaults;
  }

  const migrated = migrateSettings(raw);
  if (!migrated.profiles.length) {
    const defaults = createDefaultSettings();
    await settingsItem.setValue(defaults);
    return defaults;
  }

  const rawVersion =
    typeof raw === "object" &&
    raw !== null &&
    "version" in raw &&
    typeof (raw as { version: unknown }).version === "number"
      ? (raw as { version: number }).version
      : 0;

  // Also heal storage when validation had to drop invalid values, so the
  // repaired copy is what later reads (and exports) see.
  if (
    rawVersion !== migrated.version ||
    !ReaditSettingsSchema.safeParse(raw).success
  ) {
    await settingsItem.setValue(migrated);
  }
  return migrated;
}

/** Every write is re-validated field-by-field; invalid values never reach storage. */
export async function saveSettings(
  settings: ReaditSettings,
): Promise<ReaditSettings> {
  const clean = migrateSettings(settings);
  await settingsItem.setValue(clean);
  await pushLightweightSync(clean);
  return clean;
}

/**
 * Serializes read-modify-write cycles within this JS context so concurrent
 * callers (e.g. two quick Studio edits, or a Studio commit racing a content-script
 * persist handler) queue instead of racing on a stale `loadSettings()` snapshot —
 * a race that previously let the second writer silently clobber the first.
 * Other contexts (the popup, other tabs) can't join this queue, so each write
 * also re-checks storage and re-runs the mutator if one of them wrote first.
 * Mutators may therefore run more than once and must not have side effects.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

export async function mutateSettings(
  mutator: (
    current: ReaditSettings,
  ) => ReaditSettings | Promise<ReaditSettings>,
): Promise<ReaditSettings> {
  const run = writeQueue.catch(() => undefined).then(() =>
    mutateAgainstFresh({
      readRaw: () => storage.getItem(KEY),
      load: loadSettings,
      mutator,
      save: saveSettings,
    }),
  );
  writeQueue = run.catch(() => undefined);
  return run;
}

export async function switchProfile(profileId: string): Promise<ReaditSettings> {
  return mutateSettings((current) => applyProfile(current, profileId));
}

export async function exportSettings(): Promise<ExportBundle> {
  const settings = await loadSettings();
  return {
    kind: "readit-export",
    exportedAt: Date.now(),
    schemaVersion: SETTINGS_VERSION,
    settings,
  };
}

export function validateImport(raw: unknown): ImportPreview {
  return previewImport(raw);
}

/** Validated, migrated settings from an import payload; throws when unusable. */
export function settingsFromImport(raw: unknown): ReaditSettings {
  const preview = previewImport(raw);
  if (!preview.ok) {
    throw new Error(preview.errors.join("; ") || "Invalid import");
  }
  return migrateSettings(unwrapImport(raw));
}

export function watchSettings(
  cb: (settings: ReaditSettings) => void,
): () => void {
  return storage.watch(KEY, (value) => {
    cb(migrateSettings(value ?? createDefaultSettings()));
  });
}
