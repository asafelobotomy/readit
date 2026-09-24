import path from "node:path";

/**
 * Where smoke runs write screenshots + results.json.
 *
 * Defaults to the git-ignored `.smoke-evidence/` so routine runs don't add
 * megabytes of screenshots to the repo. READIT_EVIDENCE_DIR=docs/smoke-evidence
 * refreshes the committed results.json files; screenshots written there are
 * git-ignored too (they were purged from history to keep clones small).
 */
export function evidenceDir(root, sub = "") {
  const base = process.env.READIT_EVIDENCE_DIR
    ? path.resolve(root, process.env.READIT_EVIDENCE_DIR)
    : path.resolve(root, ".smoke-evidence");
  return sub ? path.join(base, sub) : base;
}

/** Repo-relative path for anything written into results (no home dirs). */
export function repoRelative(root, p) {
  return path.relative(root, p) || ".";
}
