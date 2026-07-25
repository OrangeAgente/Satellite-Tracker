import type { Dataset } from "../types";

export async function loadDataset(): Promise<Dataset> {
  // Default caching on purpose: the server sends `Cache-Control: max-age=300`
  // plus an ETag, so revalidation is a 304 instead of a 6.5 MB re-download.
  const res = await fetch("/data/satellites.json");
  if (!res.ok) throw new Error(`Failed to load dataset: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as Dataset;
  if (!Array.isArray(data.satellites)) {
    throw new Error("Dataset is malformed: missing satellites array");
  }
  return data;
}
