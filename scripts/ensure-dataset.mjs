#!/usr/bin/env node
/**
 * Guarantee a non-empty satellites.json after `build:data` in the Docker build.
 *
 * The Railway build environment can't always reach CelesTrak, so `build:data`
 * may fail (exit non-zero, leaving any bundled dataset intact) or — more rarely
 * — succeed with an empty result. This script reconciles both cases:
 *
 *   1. If satellites.json has satellites, keep it (freshly built or bundled).
 *   2. Else, if a bundled seed (satellites.seed.json) has satellites, restore it.
 *   3. Else, write an empty placeholder so the app shows its "dataset empty" hint
 *      instead of failing to load.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const OUT = path.resolve("public/data/satellites.json");
const SEED = path.resolve("public/data/satellites.seed.json");

async function count(file) {
  try {
    const d = JSON.parse(await fs.readFile(file, "utf8"));
    return typeof d.count === "number" ? d.count : d.satellites?.length ?? 0;
  } catch {
    return 0;
  }
}

const fresh = await count(OUT);
if (fresh > 0) {
  console.log(`[ensure-dataset] dataset ok (${fresh} satellites)`);
} else {
  const seeded = await count(SEED);
  if (seeded > 0) {
    await fs.copyFile(SEED, OUT);
    console.log(`[ensure-dataset] build:data empty; restored bundled seed (${seeded} satellites)`);
  } else {
    console.log("[ensure-dataset] no dataset available; writing empty placeholder");
    await fs.writeFile(
      OUT,
      JSON.stringify({ generatedAt: "", count: 0, categoryGroups: [], satellites: [] }),
    );
  }
}
