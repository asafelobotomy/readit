/**
 * Read-modify-write against settings that other extension contexts (popup,
 * other Reddit tabs, the background sync) may write at the same time. Kept
 * free of WXT imports so the unit tests can load it under plain Node.
 *
 * chrome.storage has no compare-and-set, so this is optimistic: snapshot the
 * stored value, derive the next settings, and re-check the stored value just
 * before saving. If another context wrote in between, the mutator runs again
 * on the fresh settings instead of saving over them. What remains is the few
 * milliseconds between that last check and the write.
 */
export type FreshMutation<S> = {
  /** The raw stored value, compared before/after to detect other writers. */
  readRaw: () => Promise<unknown>;
  /** Current settings, validated (may heal storage, which just retries once). */
  load: () => Promise<S>;
  mutator: (current: S) => S | Promise<S>;
  save: (next: S) => Promise<S>;
  /** After this many tries the last result is saved anyway. */
  maxAttempts?: number;
};

export const MAX_MUTATE_ATTEMPTS = 5;

function fingerprint(raw: unknown): string {
  return JSON.stringify(raw ?? null);
}

export async function mutateAgainstFresh<S>({
  readRaw,
  load,
  mutator,
  save,
  maxAttempts = MAX_MUTATE_ATTEMPTS,
}: FreshMutation<S>): Promise<S> {
  for (let attempt = 1; ; attempt++) {
    const before = fingerprint(await readRaw());
    const next = await mutator(await load());
    if (attempt >= maxAttempts || fingerprint(await readRaw()) === before) {
      return save(next);
    }
  }
}
