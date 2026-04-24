import type { Dataset } from "../types";

export async function loadDataset(): Promise<Dataset> {
  const res = await fetch("/data/satellites.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load dataset: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as Dataset;
  if (!Array.isArray(data.satellites)) {
    throw new Error("Dataset is malformed: missing satellites array");
  }
  return data;
}
