// Local storage for everything the app keeps: projects, views and image blobs live in IndexedDB.
// Nothing here talks to a network. Writes that read-then-modify use idb-keyval's update(), which
// runs in a single transaction, so the tech pack autosave and the generator never overwrite each other.
import { createStore, del, delMany, get, set, update, values, keys, type UseStore } from "idb-keyval";
import { useEffect, useRef, useState } from "react";
import type { ViewMode, ViewType } from "../model/views";

export type ViewStatus = "pending" | "generating" | "done" | "failed";

export interface Project {
  id: string;
  styleName: string;
  styleNumber: string;
  season: string;
  brand: string;
  garmentType: string;
  notes: string;
  originalImageId: string | null;
  analysis: unknown;
  techpack: unknown;
  createdAt: string;
}

export interface View {
  id: string;
  projectId: string;
  generationId: string;
  viewType: ViewType;
  mode: ViewMode;
  detailName: string | null;
  sourceImageId: string | null;
  imageId: string | null;
  status: ViewStatus;
  isInferred: boolean;
  correctionNote: string | null;
  error: string | null;
  whiteBackground: boolean;
  createdAt: string;
}

// Stores are created lazily so tests can install a fake IndexedDB first.
const stores: Record<string, UseStore> = {};
const store = (name: "projects" | "views" | "blobs") => (stores[name] ??= createStore(`seamsheet-${name}`, "kv"));

const bus = new EventTarget();
const notify = () => bus.dispatchEvent(new Event("change"));

export const uid = () => crypto.randomUUID();

// ------------------------------------------------------------------------------ projects
export async function listProjects(): Promise<Project[]> {
  const all = await values<Project>(store("projects"));
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const getProject = (id: string) => get<Project>(id, store("projects"));

export async function createProject(input: Partial<Pick<Project, "styleName" | "styleNumber" | "season" | "brand" | "garmentType">>): Promise<Project> {
  const p: Project = {
    id: uid(),
    styleName: input.styleName?.trim() || "Untitled style",
    styleNumber: input.styleNumber?.trim() ?? "",
    season: input.season?.trim() ?? "",
    brand: input.brand?.trim() ?? "",
    garmentType: input.garmentType?.trim() ?? "",
    notes: "",
    originalImageId: null,
    analysis: null,
    techpack: null,
    createdAt: new Date().toISOString(),
  };
  await set(p.id, p, store("projects"));
  notify();
  return p;
}

export async function updateProject(id: string, patch: Partial<Omit<Project, "id" | "createdAt">>): Promise<void> {
  // Never create a record by updating a missing one (e.g. a project deleted while its autosave was pending).
  if (!(await getProject(id))) return;
  await update<Project>(id, (old) => ({ ...(old as Project), ...patch }), store("projects"));
  notify();
}

export async function deleteProject(id: string): Promise<void> {
  const project = await getProject(id);
  const views = await listViews(id);
  const blobIds = new Set<string>();
  if (project?.originalImageId) blobIds.add(project.originalImageId);
  for (const v of views) {
    if (v.imageId) blobIds.add(v.imageId);
    if (v.sourceImageId) blobIds.add(v.sourceImageId);
  }
  await delMany(views.map((v) => v.id), store("views"));
  await delMany([...blobIds], store("blobs"));
  await del(id, store("projects"));
  notify();
}

// --------------------------------------------------------------------------------- views
export async function listViews(projectId: string): Promise<View[]> {
  const all = await values<View>(store("views"));
  return all.filter((v) => v.projectId === projectId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const getView = (id: string) => get<View>(id, store("views"));

export async function putViews(views: View[]): Promise<void> {
  await Promise.all(views.map((v) => set(v.id, v, store("views"))));
  notify();
}

export async function updateView(id: string, patch: Partial<Omit<View, "id" | "projectId">>): Promise<View | undefined> {
  if (!(await getView(id))) return undefined;
  let next: View | undefined;
  await update<View>(id, (old) => (next = { ...(old as View), ...patch }), store("views"));
  notify();
  return next;
}

// --------------------------------------------------------------------------------- blobs
export async function putBlob(blob: Blob, id: string = uid()): Promise<string> {
  await set(id, blob, store("blobs"));
  return id;
}
export const getBlob = (id: string) => get<Blob>(id, store("blobs"));
export const deleteBlob = (id: string) => del(id, store("blobs"));

// ------------------------------------------------------------------------ bulk (backup)
export async function exportAll() {
  const projects = await values<Project>(store("projects"));
  const views = await values<View>(store("views"));
  const blobIds = (await keys<string>(store("blobs"))) as string[];
  return { projects, views, blobIds };
}

export async function importRecords(projects: Project[], views: View[], blobs: { id: string; blob: Blob }[]) {
  await Promise.all(blobs.map((b) => set(b.id, b.blob, store("blobs"))));
  await Promise.all(views.map((v) => set(v.id, v, store("views"))));
  await Promise.all(projects.map((p) => set(p.id, p, store("projects"))));
  notify();
}

// ----------------------------------------------------------------------------- React hooks
/** Re-runs `load` on mount, when `deps` change, and whenever anything in the local database changes. */
export function useLive<T>(load: () => Promise<T>, deps: unknown[], initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  useEffect(() => {
    let alive = true;
    const run = () => {
      const mine = ++seq.current;
      load()
        .then((d) => alive && mine === seq.current && (setData(d), setLoading(false)))
        .catch(() => alive && setLoading(false));
    };
    run();
    bus.addEventListener("change", run);
    return () => {
      alive = false;
      bus.removeEventListener("change", run);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading };
}

/** Object URLs for stored image blobs. They are revoked when the component unmounts. */
export function useBlobUrls(ids: (string | null | undefined)[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const made = useRef<Record<string, string>>({});
  const key = Array.from(new Set(ids.filter((x): x is string => !!x))).sort().join("|");
  useEffect(() => {
    let alive = true;
    const wanted = key ? key.split("|") : [];
    const missing = wanted.filter((id) => !made.current[id]);
    if (!missing.length) return;
    void Promise.all(
      missing.map(async (id) => {
        const blob = await getBlob(id);
        if (blob && alive && !made.current[id]) made.current[id] = URL.createObjectURL(blob);
      }),
    ).then(() => alive && setUrls({ ...made.current }));
    return () => {
      alive = false;
    };
  }, [key]);
  useEffect(() => () => Object.values(made.current).forEach((u) => URL.revokeObjectURL(u)), []);
  return urls;
}
