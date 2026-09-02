import {
  applyProfile,
  createDefaultSettings,
  ExportBundleSchema,
  migrateSettings,
  previewImport,
  SETTINGS_VERSION,
  type ExportBundle,
  type ImportPreview,
  type ReaditSettings,
} from "@readit/schema";
import { storage } from "wxt/utils/storage";
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

  if (rawVersion !== migrated.version) {
    await settingsItem.setValue(migrated);
  }
  return migrated;
}

export async function saveSettings(
  settings: ReaditSettings,
): Promise<ReaditSettings> {
  await settingsItem.setValue(settings);
  await pushLightweightSync(settings);
  return settings;
}

export async function patchSettings(
  patch: Partial<ReaditSettings>,
): Promise<ReaditSettings> {
  const current = await loadSettings();
  const next = { ...current, ...patch };
  return saveSettings(next);
}

export async function switchProfile(profileId: string): Promise<ReaditSettings> {
  const current = await loadSettings();
  return saveSettings(applyProfile(current, profileId));
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

export async function importSettings(raw: unknown): Promise<ReaditSettings> {
  const preview = previewImport(raw);
  if (!preview.ok) {
    throw new Error(preview.errors.join("; ") || "Invalid import");
  }
  const parsed = ExportBundleSchema.safeParse(raw);
  if (parsed.success) {
    return saveSettings(migrateSettings(parsed.data.settings));
  }
  return saveSettings(migrateSettings(raw));
}

export function watchSettings(
  cb: (settings: ReaditSettings) => void,
): () => void {
  return storage.watch(KEY, (value) => {
    cb(migrateSettings(value ?? createDefaultSettings()));
  });
}
