import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import { gzipSync } from "node:zlib";
import os from "node:os";
import path from "node:path";
// @ts-expect-error — plain .mjs script, no types
import { pickDataset, countOf, ensureDataset } from "../../scripts/ensure-dataset.mjs";

const good = (n: number) =>
  JSON.stringify({ generatedAt: "2026-07-23", count: n, categoryGroups: [], satellites: Array.from({ length: n }, (_, i) => ({ noradId: i })) });
const empty = '{"generatedAt":"","count":0,"categoryGroups":[],"satellites":[]}';

describe("countOf", () => {
  it("reads count / falls back to array length / 0 on garbage", () => {
    expect(countOf(good(5))).toBe(5);
    expect(countOf('{"satellites":[{},{}]}')).toBe(2);
    expect(countOf("not json")).toBe(0);
    expect(countOf("")).toBe(0);
  });
});

describe("pickDataset", () => {
  it("keeps a fresh non-empty dataset", () => {
    expect(pickDataset(good(3), good(9)).source).toBe("fresh");
  });
  it("restores the seed when fresh is empty", () => {
    const r = pickDataset(empty, good(9));
    expect(r.source).toBe("seed");
    expect(countOf(r.json)).toBe(9);
  });
  it("falls back to a placeholder when both are empty", () => {
    const r = pickDataset(empty, "");
    expect(r.source).toBe("placeholder");
    expect(countOf(r.json)).toBe(0);
  });
});

describe("ensureDataset (file IO)", () => {
  it("restores from a gzipped seed when satellites.json is empty", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ds-"));
    const outPath = path.join(dir, "satellites.json");
    const seedGzPath = path.join(dir, "satellites.seed.json.gz");
    await fs.writeFile(outPath, empty);
    await fs.writeFile(seedGzPath, gzipSync(Buffer.from(good(7))));

    const res = await ensureDataset({ outPath, seedPath: path.join(dir, "nope.json"), seedGzPath });
    expect(res.source).toBe("seed");
    expect(res.count).toBe(7);
    expect(countOf(await fs.readFile(outPath, "utf8"))).toBe(7);
  });

  it("keeps a freshly built dataset untouched", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ds-"));
    const outPath = path.join(dir, "satellites.json");
    await fs.writeFile(outPath, good(12));
    const res = await ensureDataset({ outPath, seedPath: path.join(dir, "a.json"), seedGzPath: path.join(dir, "b.gz") });
    expect(res.source).toBe("fresh");
    expect(res.count).toBe(12);
  });
});
