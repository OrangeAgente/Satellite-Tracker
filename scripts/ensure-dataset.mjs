#!/usr/bin/env node
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

const OUT = path.resolve("public/data/satellites.json");
const SEED = path.resolve("public/data/satellites.seed.json");
const SEED_GZ = path.resolve("public/data/satellites.seed.json.gz");

function countOf(text) {
  try {
    const d = JSON.parse(text);
    return typeof d.count === "number" ? d.count : d.satellites?.length ?? 0;
  } catch {
    return 0;
  }
}

async function readOut() {
  try {
    return await fs.readFile(OUT, "utf8");
  } catch {
    return "";
  }
}

async function readSeed() {
  // Prefer an already-decompressed seed, else the gzipped one.
  try {
    return await fs.readFile(SEED, "utf8");
  } catch {
    /* fall through */
  }
  try {
    return gunzipSync(await fs.readFile(SEED_GZ)).toString("utf8");
  } catch {
    return "";
  }
}

const fresh = countOf(await readOut());
if (fresh > 0) {
  console.log(`[ensure-dataset] dataset ok (${fresh} satellites)`);
} else {
  const seed = await readSeed();
  const seeded = countOf(seed);
  if (seeded > 0) {
    await fs.writeFile(OUT, seed);
    console.log(`[ensure-dataset] build:data empty; restored bundled seed (${seeded} satellites)`);
  } else {
    console.log("[ensure-dataset] no dataset available; writing empty placeholder");
    await fs.writeFile(
      OUT,
      JSON.stringify({ generatedAt: "", count: 0, categoryGroups: [], satellites: [] }),
    );
  }
}
