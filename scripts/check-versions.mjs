/**
 * Fails when the workspace package versions (or their package-lock entries)
 * drift apart. extension/package.json is the source of truth for releases.
 * Fix drift with: npm run version:set -- <version>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

const rootPkg = readJson("package.json");
const workspaceDirs = ["extension", ...fs
  .readdirSync(path.join(root, "packages"))
  .map((d) => `packages/${d}`)
  .filter((d) => fs.existsSync(path.join(root, d, "package.json")))];

const expected = readJson("extension/package.json").version;
const lock = readJson("package-lock.json");
const found = [
  ["package.json", rootPkg.version],
  ...workspaceDirs.map((d) => [`${d}/package.json`, readJson(`${d}/package.json`).version]),
  ["package-lock.json (root)", lock.version],
  ["package-lock.json packages[\"\"]", lock.packages?.[""]?.version],
  ...workspaceDirs.map((d) => [`package-lock.json packages["${d}"]`, lock.packages?.[d]?.version]),
];

const drift = found.filter(([, v]) => v !== expected);
if (drift.length) {
  console.error(`Version drift (expected ${expected} from extension/package.json):`);
  for (const [where, v] of drift) console.error(`  ${where}: ${v ?? "missing"}`);
  console.error("Fix with: npm run version:set -- <version>");
  process.exit(1);
}
console.log(`All ${found.length} version fields at ${expected}`);
