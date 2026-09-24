import { createDefaultSettings } from "./profiles.js";
import {
  ExportBundleSchema,
  ReaditSettingsSchema,
  SETTINGS_VERSION,
  type ReaditSettings,
} from "./types.js";

export type RepairResult = {
  settings: ReaditSettings;
  /** Dotted paths that failed validation and were dropped or reset to defaults. */
  resetPaths: string[];
};

/** Upper bound on validate→drop rounds; each round drops at least one value. */
const MAX_REPAIR_ROUNDS = 200;

/** Placeholder for array elements dropped this round (spliced after the round). */
const DROPPED = Symbol("dropped");

type PathKey = string | number;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getAt(root: unknown, path: readonly PathKey[]): unknown {
  let node: unknown = root;
  for (const key of path) {
    if (node === DROPPED || typeof node !== "object" || node === null) {
      return undefined;
    }
    node = (node as Record<PathKey, unknown>)[key];
  }
  return node === DROPPED ? undefined : node;
}

/**
 * Validate settings field-by-field instead of all-or-nothing.
 *
 * Every value that fails `ReaditSettingsSchema` is dropped — array elements are
 * removed, object fields deleted so their schema default applies, and when a
 * field has no default its enclosing object/element goes instead. Top-level
 * keys fall back to `createDefaultSettings()`. Unknown keys are stripped by the
 * schema. The result always satisfies the schema, so one bad value (a
 * too-small feed width, a forged `separators` string) can no longer switch
 * validation off for the whole settings object.
 *
 * Returns null only when `raw` is not an object or cannot be cloned.
 */
export function repairSettings(raw: unknown): RepairResult | null {
  if (!isPlainObject(raw)) return null;
  const defaults = createDefaultSettings() as unknown as Record<string, unknown>;
  let value: Record<string, unknown>;
  try {
    // JSON round-trip: detaches from the caller's object and normalizes
    // NaN/Infinity to null the same way chrome.storage would.
    value = JSON.parse(
      JSON.stringify({ ...defaults, ...raw, version: SETTINGS_VERSION }),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }

  const resetPaths: string[] = [];
  const resetTopLevel = new Set<string>();

  for (let round = 0; round < MAX_REPAIR_ROUNDS; round++) {
    const parsed = ReaditSettingsSchema.safeParse(value);
    if (parsed.success) return { settings: parsed.data, resetPaths };

    const touchedArrays = new Set<unknown[]>();
    for (const issue of parsed.error.issues) {
      let path: PathKey[] = [...issue.path];
      // A missing value (deleted last round, or absent in the input) has no
      // default at this level — drop the enclosing object/element instead.
      while (path.length > 1 && getAt(value, path) === undefined) {
        path = path.slice(0, -1);
      }
      if (path.length === 0) return null;

      if (path.length === 1) {
        const key = String(path[0]);
        if (resetTopLevel.has(key)) return null;
        resetTopLevel.add(key);
        value[key] = structuredClone(defaults[key]);
      } else {
        const parent = getAt(value, path.slice(0, -1));
        const last = path[path.length - 1]!;
        if (Array.isArray(parent)) {
          parent[Number(last)] = DROPPED;
          touchedArrays.add(parent);
        } else if (isPlainObject(parent)) {
          delete parent[String(last)];
        }
      }
      resetPaths.push(path.join("."));
    }
    for (const arr of touchedArrays) {
      const kept = arr.filter((item) => item !== DROPPED);
      arr.length = 0;
      arr.push(...kept);
    }
  }
  return null;
}

export type ImportPreview = {
  ok: boolean;
  kind: "bundle" | "raw" | "invalid";
  schemaVersion: number | null;
  exportedAt: number | null;
  profileCount: number;
  filterCount: number;
  tagCount: number;
  warnings: string[];
  errors: string[];
};

function looksLikeSettings(v: unknown): v is Record<string, unknown> {
  return (
    isPlainObject(v) &&
    Array.isArray(v.profiles) &&
    typeof v.activeProfileId === "string"
  );
}

function looksLikeBundle(
  v: unknown,
): v is { kind: "readit-export"; settings: unknown } & Record<string, unknown> {
  return isPlainObject(v) && v.kind === "readit-export" && "settings" in v;
}

/** The settings object inside an import payload (export bundle or raw settings). */
export function unwrapImport(raw: unknown): unknown {
  return looksLikeBundle(raw) ? raw.settings : raw;
}

function numberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function resetWarning(paths: string[]): string {
  const shown = paths.slice(0, 5).join(", ");
  const more = paths.length > 5 ? ` (+${paths.length - 5} more)` : "";
  return `${paths.length} invalid field(s) will be reset to defaults: ${shown}${more}.`;
}

export function previewImport(raw: unknown): ImportPreview {
  const warnings: string[] = [];
  const errors: string[] = [];
  const invalid = (message: string): ImportPreview => ({
    ok: false,
    kind: "invalid",
    schemaVersion: null,
    exportedAt: null,
    profileCount: 0,
    filterCount: 0,
    tagCount: 0,
    warnings,
    errors: [...errors, message],
  });

  const bundle = looksLikeBundle(raw);
  const inner = unwrapImport(raw);
  // Require the settings core so arbitrary JSON can't "import" as defaults.
  if (!looksLikeSettings(inner)) return invalid("Unrecognized export format.");

  const repaired = repairSettings(inner);
  if (!repaired) return invalid("Unrecognized export format.");
  if (repaired.resetPaths.length) warnings.push(resetWarning(repaired.resetPaths));

  const settings = repaired.settings;
  if (bundle) {
    const strict = ExportBundleSchema.safeParse(raw);
    const v =
      (strict.success ? strict.data.schemaVersion : numberOrNull(raw.schemaVersion)) ??
      numberOrNull(inner.version) ??
      SETTINGS_VERSION;
    if (v > SETTINGS_VERSION) {
      warnings.push(
        `Export schema ${v} is newer than this build (${SETTINGS_VERSION}); some fields may be dropped.`,
      );
    }
    if (v < SETTINGS_VERSION) {
      warnings.push(`Export schema ${v} will migrate to ${SETTINGS_VERSION} on import.`);
    }
    return {
      ok: true,
      kind: "bundle",
      schemaVersion: v,
      exportedAt: numberOrNull(raw.exportedAt),
      profileCount: settings.profiles.length,
      filterCount: settings.filters.length,
      tagCount: settings.tags.length,
      warnings,
      errors,
    };
  }

  warnings.push("Raw settings object (no export wrapper) — will migrate on import.");
  return {
    ok: true,
    kind: "raw",
    schemaVersion: numberOrNull(inner.version),
    exportedAt: null,
    profileCount: settings.profiles.length,
    filterCount: settings.filters.length,
    tagCount: settings.tags.length,
    warnings,
    errors,
  };
}
