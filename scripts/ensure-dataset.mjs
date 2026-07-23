/**
 * Guarantee a non-empty satellites.json after `build:data` in the Docker build.
 *
 * The Railway build environment can't always reach CelesTrak, so `build:data`
 * may fail (exit non-zero, no output) or — more rarely — succeed with an empty
 * result. A git-tracked gzipped seed (satellites.seed.json.gz) is bundled so a
 * failed/empty refresh still deploys a usable dataset:
 *
 *   1. If satellites.json has satellites, keep it (freshly built by build:data).
 *   2. Else, if the bundled seed has satellites, restore it.
 *   3. Else, write an empty placeholder so the app shows its "dataset empty"
 *      hint instead of failing to load.
 */
import { promises as fs } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EMPTY = JSON.stringify({ generatedAt: "", count: 0, categoryGroups: [], satellites: [] });

export function countOf(text) {
  try {
    const d = JSON.parse(text);
    return typeof d.count === "number" ? d.count : d.satellites?.length ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Pure decision: given the freshly built dataset text and a seed text (either
 * may be empty/invalid), choose which dataset to ship and why.
 * @returns {{ source: "fresh"|"seed"|"placeholder", json: string }}
 */
export function pickDataset(freshText, seedText) {
  if (countOf(freshText) > 0) return { source: "fresh", json: freshText };
  if (countOf(seedText) > 0) return { source: "seed", json: seedText };
  return { source: "placeholder", json: EMPTY };
}

async function readText(p) {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return "";
  }
}

async function readSeed(seedPath, seedGzPath) {
  const raw = await readText(seedPath);
  if (raw) return raw;
  try {
    return gunzipSync(await fs.readFile(seedGzPath)).toString("utf8");
  } catch {
    return "";
  }
}

export async function ensureDataset(opts = {}) {
  const dir = path.resolve("public/data");
  const outPath = opts.outPath ?? path.join(dir, "satellites.json");
  const seedPath = opts.seedPath ?? path.join(dir, "satellites.seed.json");
  const seedGzPath = opts.seedGzPath ?? path.join(dir, "satellites.seed.json.gz");

  const fresh = await readText(outPath);
  const seed = await readSeed(seedPath, seedGzPath);
  const { source, json } = pickDataset(fresh, seed);
  if (source !== "fresh") await fs.writeFile(outPath, json);
  return { source, count: countOf(json) };
}

// Run as a CLI only when invoked directly (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ensureDataset().then(({ source, count }) => {
    const msg =
      source === "fresh"
        ? `dataset ok (${count} satellites)`
        : source === "seed"
          ? `build:data empty; restored bundled seed (${count} satellites)`
          : "no dataset available; writing empty placeholder";
    console.log(`[ensure-dataset] ${msg}`);
  });
}
