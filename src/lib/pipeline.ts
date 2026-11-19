// The photo-to-mockup pipeline, ported from the original server functions. It runs in the browser
// against local storage and an injected AI client, so it can be tested without a network.
import { friendlyError, AiError, type AiClient } from "./gemini";
import { deleteBlob, getBlob, getProject, getView, listViews, putBlob, putViews, uid, updateProject, updateView, type Project, type View } from "./db";
import { withRiot } from "../model/riot";
import { ANALYSIS_INSTRUCTION, ANALYSIS_SHAPE, parseAnalysis, readAnalysis, type GarmentAnalysis } from "../model/analysis";
import { buildEditPrompt, buildViewPrompt } from "../model/prompts";
import { isViewInferred, type PlannedView, type ViewMode } from "../model/views";

const MAX_VIEW_RETRIES = 2;
const CONCURRENCY = 2;

export async function analyzeProject(
  projectId: string,
  image: Blob,
  hints: { garmentType?: string; notes?: string },
  ai: AiClient,
): Promise<GarmentAnalysis> {
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found.");
  const hintText = [
    hints.garmentType ? `Designer says garment type: ${hints.garmentType}.` : "",
    hints.notes ? `Designer notes: ${hints.notes}.` : "",
  ].filter(Boolean).join(" ");

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await ai.describe(
        image,
        withRiot("Task: garment analysis for a tech pack. Report only what the photo shows. Return JSON only."),
        `${ANALYSIS_INSTRUCTION}\n${ANALYSIS_SHAPE}\n${hintText}${attempt > 0 ? "\nYour last reply was not valid JSON. Reply with the JSON object only." : ""}`,
      );
      const analysis = parseAnalysis(text);
      // Designer corrections outlive a re-analysis.
      const prev = readAnalysis(project.analysis);
      if (prev?.user_corrections?.length) analysis.user_corrections = prev.user_corrections;
      await updateProject(projectId, { analysis });
      return analysis;
    } catch (err) {
      lastErr = err;
      if (err instanceof AiError) break;
    }
  }
  throw new Error(lastErr instanceof AiError ? friendlyError(lastErr) : "Riot couldn't read this photo. Try a clearer, well-lit shot.");
}

interface RenderOpts {
  correction?: string | null;
  instruction?: string | null;
}

export async function renderView(viewId: string, ai: AiClient, opts: RenderOpts = {}): Promise<View | undefined> {
  const view = await getView(viewId);
  if (!view) throw new Error("View not found.");
  const project = await getProject(view.projectId);
  if (!project) throw new Error("Project not found.");
  await updateView(viewId, { status: "generating", error: null });

  try {
    let refs: Blob[];
    let prompt: string;
    if (opts.instruction) {
      const current = view.imageId ? await getBlob(view.imageId) : undefined;
      if (!current) throw new Error("Nothing to edit yet. Generate this view first.");
      refs = [current];
      prompt = buildEditPrompt(opts.instruction);
    } else {
      const sourceId = view.sourceImageId ?? project.originalImageId;
      const source = sourceId ? await getBlob(sourceId) : undefined;
      if (!source) throw new Error("Upload a garment photo first.");
      refs = [source];
      if (view.viewType !== "front") {
        const siblings = await listViews(view.projectId);
        const front = siblings.find((v) => v.generationId === view.generationId && v.viewType === "front" && v.status === "done" && v.imageId);
        const frontBlob = front?.imageId ? await getBlob(front.imageId) : undefined;
        if (frontBlob) refs.push(frontBlob);
      }
      prompt = buildViewPrompt({
        viewType: view.viewType,
        mode: view.mode,
        detailName: view.detailName,
        analysis: readAnalysis(project.analysis),
        garmentType: project.garmentType,
        notes: project.notes,
        whiteBackground: view.whiteBackground,
        correction: opts.correction ?? view.correctionNote,
      });
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_VIEW_RETRIES; attempt++) {
      try {
        const img = await ai.draw(refs, prompt, view.viewType === "detail" ? "1:1" : "2:3");
        const imageId = await putBlob(img);
        if (view.imageId) await deleteBlob(view.imageId);
        return await updateView(viewId, { status: "done", imageId, error: null });
      } catch (err) {
        lastErr = err;
        if (err instanceof AiError && err.terminal) break;
      }
    }
    throw lastErr;
  } catch (err) {
    console.error("renderView failed", viewId, err);
    return await updateView(viewId, { status: "failed", error: friendlyError(err) });
  }
}

export async function recordCorrection(viewId: string, correction: string): Promise<void> {
  const view = await getView(viewId);
  if (!view) throw new Error("View not found.");
  const project = await getProject(view.projectId);
  if (!project) throw new Error("Project not found.");
  await updateView(viewId, { correctionNote: correction });
  const analysis = readAnalysis(project.analysis);
  if (analysis) {
    analysis.user_corrections = [...(analysis.user_corrections ?? []), { view_type: view.viewType, note: correction, at: new Date().toISOString() }];
    await updateProject(project.id, { analysis });
  }
}

export interface GenerateInput {
  project: Project;
  /** A newly chosen (already shrunk) photo, or null to reuse the project's current one. */
  photo: Blob | null;
  garmentType: string;
  notes: string;
  planned: PlannedView[];
  mode: ViewMode;
  whiteBackground: boolean;
}

export interface GenerateHooks {
  onPhase?: (p: "analyzing" | "generating") => void;
  onGeneration?: (generationId: string) => void;
  onViewStart?: (viewId: string) => void;
  onViewEnd?: (viewId: string) => void;
}

/** Reads the photo, then draws the planned views: front first, the rest two at a time. */
export async function runGeneration(input: GenerateInput, ai: AiClient, hooks: GenerateHooks = {}) {
  const { project } = input;
  let sourceId = project.originalImageId;
  if (input.photo) sourceId = await putBlob(input.photo);
  const source = sourceId ? await getBlob(sourceId) : undefined;
  if (!sourceId || !source) throw new Error("Drop in a garment photo first.");
  await updateProject(project.id, { garmentType: input.garmentType.trim(), notes: input.notes.trim(), originalImageId: sourceId });

  hooks.onPhase?.("analyzing");
  const analysis = await analyzeProject(project.id, source, { garmentType: input.garmentType.trim(), notes: input.notes.trim() }, ai);

  const generationId = uid();
  const now = Date.now();
  const views: View[] = input.planned.map((p, i) => ({
    id: uid(),
    projectId: project.id,
    generationId,
    viewType: p.view_type,
    mode: input.mode,
    detailName: p.detail_name,
    sourceImageId: sourceId,
    imageId: null,
    status: "pending",
    isInferred: isViewInferred(p.view_type, p.detail_name, analysis),
    correctionNote: null,
    error: null,
    whiteBackground: input.whiteBackground,
    createdAt: new Date(now + i).toISOString(), // keeps the planned order stable
  }));
  await putViews(views);
  hooks.onGeneration?.(generationId);
  hooks.onPhase?.("generating");

  const run = async (v: View) => {
    hooks.onViewStart?.(v.id);
    try {
      return await renderView(v.id, ai);
    } finally {
      hooks.onViewEnd?.(v.id);
    }
  };
  const front = views.find((v) => v.viewType === "front");
  const rest = views.filter((v) => v !== front);
  const results: (View | undefined)[] = [];
  if (front) results.push(await run(front));
  const queue = [...rest];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let v = queue.shift(); v; v = queue.shift()) results.push(await run(v));
    }),
  );
  return { generationId, total: views.length, done: results.filter((v) => v?.status === "done").length, failed: results.filter((v) => v?.status === "failed") };
}
