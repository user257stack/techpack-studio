// Backup and restore: everything in the app as one .zip you can keep, move to another browser, or
// re-import after clearing site data. Format: manifest.json, projects.json, views.json, blobs/<id>.
import type JSZip from "jszip";
import { exportAll, getBlob, importRecords, type Project, type View } from "./db";
import { saveBlob } from "./image";

const FORMAT = "seamsheet-backup";
const VERSION = 1;

export async function buildBackup(): Promise<Blob> {
  const { default: JSZipLib } = await import("jszip"); // loaded on demand, keeps the first page load small
  const { projects, views, blobIds } = await exportAll();
  const zip = new JSZipLib();
  const types: Record<string, string> = {};
  for (const id of blobIds) {
    const blob = await getBlob(id);
    if (!blob) continue;
    types[id] = blob.type || "application/octet-stream";
    zip.file(`blobs/${id}`, await blob.arrayBuffer());
  }
  zip.file("manifest.json", JSON.stringify({ format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), blobTypes: types }, null, 2));
  zip.file("projects.json", JSON.stringify(projects));
  zip.file("views.json", JSON.stringify(views));
  return zip.generateAsync({ type: "blob", compression: "STORE" });
}

export async function downloadBackup() {
  const blob = await buildBackup();
  saveBlob(blob, `seamsheet-backup-${new Date().toISOString().slice(0, 10)}.zip`);
}

export interface ImportResult {
  projects: number;
  views: number;
  images: number;
}

/** Merges a backup into local storage. Records with the same id are replaced; nothing else is touched. */
export async function restoreBackup(file: Blob): Promise<ImportResult> {
  let zip: JSZip;
  try {
    const { default: JSZipLib } = await import("jszip");
    zip = await JSZipLib.loadAsync(await file.arrayBuffer());
  } catch {
    throw new Error("That file isn't a SeamSheet backup (.zip).");
  }
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new Error("That file isn't a SeamSheet backup.");
  const manifest = JSON.parse(await manifestFile.async("string")) as { format?: string; version?: number; blobTypes?: Record<string, string> };
  if (manifest.format !== FORMAT) throw new Error("That file isn't a SeamSheet backup.");
  if ((manifest.version ?? 0) > VERSION) throw new Error("This backup was made by a newer version of the app. Update the app and try again.");

  const read = async <T,>(name: string): Promise<T[]> => {
    const f = zip.file(name);
    const data = f ? (JSON.parse(await f.async("string")) as unknown) : [];
    return Array.isArray(data) ? (data as T[]) : [];
  };
  const projects = (await read<Project>("projects.json")).filter((p) => p && typeof p.id === "string");
  const views = (await read<View>("views.json")).filter((v) => v && typeof v.id === "string" && typeof v.projectId === "string");

  const blobs: { id: string; blob: Blob }[] = [];
  for (const [id, type] of Object.entries(manifest.blobTypes ?? {})) {
    const f = zip.file(`blobs/${id}`);
    if (f) blobs.push({ id, blob: new Blob([await f.async("arraybuffer")], { type }) });
  }
  await importRecords(projects, views, blobs);
  return { projects: projects.length, views: views.length, images: blobs.length };
}

/** Asks the browser not to evict our data when disk space is low. Returns whether it was granted. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

