// @vitest-environment node
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { AiError, type AiClient } from "./gemini";
import { createProject, deleteProject, getBlob, getProject, listProjects, listViews, putBlob, updateProject, updateView } from "./db";
import { buildBackup, restoreBackup } from "./backup";
import { recordCorrection, renderView, runGeneration } from "./pipeline";
import { DEFAULT_SELECTION, planViews } from "../model/views";
import { readAnalysis } from "../model/analysis";

const png = (label: string) => new Blob([label], { type: "image/png" });
const text = async (b: Blob | undefined) => (b ? await b.text() : undefined);

const ANALYSIS = JSON.stringify({
  garment_type: "hoodie", silhouette_fit: "boxy", colors: ["black"], fabric_appearance: "heavy fleece",
  neckline_collar: "hood", sleeves_cuffs: "ribbed cuffs", hem: "ribbed hem", closures: [], pockets: ["kangaroo"],
  seams_topstitching: "flatlock", prints_logos: [], hardware: [], not_visible: [], riot_note: ["Check hood depth"],
});

function fakeAi(opts: { failViews?: number; terminal?: boolean } = {}) {
  const calls = { describe: 0, draw: [] as { refs: string[]; prompt: string }[] };
  let drawn = 0;
  const ai: AiClient = {
    async describe() {
      calls.describe++;
      return "Here you go:\n" + ANALYSIS;
    },
    async draw(refs, prompt) {
      calls.draw.push({ refs: await Promise.all(refs.map((r) => r.text())), prompt });
      drawn++;
      if (opts.terminal) throw new AiError("quota", "quota");
      if (opts.failViews && drawn <= opts.failViews) throw new Error("boom");
      return png(`img-${drawn}`);
    },
  };
  return { ai, calls };
}

beforeEach(async () => {
  for (const p of await listProjects()) await deleteProject(p.id);
});

describe("storage", () => {
  it("updating a missing project does not create one", async () => {
    await updateProject("ghost", { styleName: "x" });
    expect(await getProject("ghost")).toBeUndefined();
    expect(await updateView("ghost", { status: "done" })).toBeUndefined();
  });

  it("creates, patches and deletes a project with its views and images", async () => {
    const p = await createProject({ styleName: "  Hoodie " });
    expect(p.styleName).toBe("Hoodie");
    await updateProject(p.id, { season: "SS27" });
    expect((await getProject(p.id))?.season).toBe("SS27");

    const orig = await putBlob(png("orig"));
    await updateProject(p.id, { originalImageId: orig });
    const { ai } = fakeAi();
    const fresh = (await getProject(p.id))!;
    const r = await runGeneration({ project: fresh, photo: null, garmentType: "", notes: "", planned: planViews(DEFAULT_SELECTION, "realistic").slice(0, 2), mode: "realistic", whiteBackground: false }, ai);
    expect(r.done).toBe(2);
    const views = await listViews(p.id);
    const ids = views.map((v) => v.imageId!);
    expect(await Promise.all(ids.map(getBlob))).toHaveLength(2);

    await deleteProject(p.id);
    expect(await getProject(p.id)).toBeUndefined();
    expect(await listViews(p.id)).toEqual([]);
    expect(await getBlob(orig)).toBeUndefined();
    for (const id of ids) expect(await getBlob(id)).toBeUndefined();
  });
});

describe("pipeline", () => {
  it("analyses once, draws the front first, and hands the front to later views as a reference", async () => {
    const p = await createProject({ styleName: "Hoodie" });
    const { ai, calls } = fakeAi();
    const r = await runGeneration(
      { project: p, photo: png("photo"), garmentType: "Hoodie", notes: "boxy", planned: planViews({ ...DEFAULT_SELECTION, left: false, right: false }, "realistic"), mode: "realistic", whiteBackground: true },
      ai,
    );
    expect(calls.describe).toBe(1);
    expect(r).toMatchObject({ total: 2, done: 2 });
    expect(calls.draw[0]?.refs).toEqual(["photo"]);
    expect(calls.draw[0]?.prompt).toMatch(/front view/i);
    expect(calls.draw[1]?.refs).toEqual(["photo", "img-1"]);
    expect(calls.draw[1]?.prompt).toMatch(/back view/i);
    expect(calls.draw[0]?.prompt).toContain("pure white");

    const saved = (await getProject(p.id))!;
    expect(saved.garmentType).toBe("Hoodie");
    expect(readAnalysis(saved.analysis)?.garment_type).toBe("hoodie");
    const views = await listViews(p.id);
    expect(views.map((v) => v.viewType)).toEqual(["front", "back"]);
    expect(views.find((v) => v.viewType === "back")?.isInferred).toBe(true);
  });

  it("retries a flaky draw, but gives up at once on a quota error", async () => {
    const p = await createProject({ styleName: "A" });
    const flaky = fakeAi({ failViews: 2 });
    const ok = await runGeneration({ project: p, photo: png("p"), garmentType: "", notes: "", planned: [{ view_type: "front", detail_name: null }], mode: "realistic", whiteBackground: false }, flaky.ai);
    expect(ok.done).toBe(1);
    expect(flaky.calls.draw).toHaveLength(3);

    const q = await createProject({ styleName: "B" });
    const quota = fakeAi({ terminal: true });
    const bad = await runGeneration({ project: q, photo: png("p"), garmentType: "", notes: "", planned: [{ view_type: "front", detail_name: null }], mode: "realistic", whiteBackground: false }, quota.ai);
    expect(quota.calls.draw).toHaveLength(1);
    expect(bad.failed).toHaveLength(1);
    expect(bad.failed[0]?.error).toBe("quota");
  });

  it("an edit uses the current image, a regenerate replaces it and frees the old one", async () => {
    const p = await createProject({ styleName: "C" });
    const { ai, calls } = fakeAi();
    await runGeneration({ project: p, photo: png("p"), garmentType: "", notes: "", planned: [{ view_type: "front", detail_name: null }], mode: "realistic", whiteBackground: false }, ai);
    const [v] = await listViews(p.id);
    const firstImage = v!.imageId!;
    await renderView(v!.id, ai, { instruction: "make the zip silver" });
    expect(calls.draw.at(-1)?.refs).toEqual(["img-1"]);
    expect(calls.draw.at(-1)?.prompt).toContain("make the zip silver");
    const [after] = await listViews(p.id);
    expect(after!.imageId).not.toBe(firstImage);
    expect(await getBlob(firstImage)).toBeUndefined();
    expect(await text(await getBlob(after!.imageId!))).toBe("img-2");
  });

  it("a correction is remembered and survives re-analysis", async () => {
    const p = await createProject({ styleName: "D" });
    const { ai } = fakeAi();
    await runGeneration({ project: p, photo: png("p"), garmentType: "", notes: "", planned: [{ view_type: "front", detail_name: null }], mode: "realistic", whiteBackground: false }, ai);
    const [v] = await listViews(p.id);
    await recordCorrection(v!.id, "pocket is zippered");
    expect(readAnalysis((await getProject(p.id))!.analysis)?.user_corrections?.[0]?.note).toBe("pocket is zippered");
    await runGeneration({ project: (await getProject(p.id))!, photo: null, garmentType: "", notes: "", planned: [{ view_type: "front", detail_name: null }], mode: "realistic", whiteBackground: false }, ai);
    expect(readAnalysis((await getProject(p.id))!.analysis)?.user_corrections).toHaveLength(1);
  });
});

describe("backup", () => {
  it("round-trips projects, tech pack data and images", async () => {
    const p = await createProject({ styleName: "Round trip", styleNumber: "RT-1" });
    await updateProject(p.id, { techpack: { sizing: { unit: "in" } } });
    const { ai } = fakeAi();
    await runGeneration({ project: (await getProject(p.id))!, photo: png("photo"), garmentType: "", notes: "", planned: [{ view_type: "front", detail_name: null }], mode: "realistic", whiteBackground: false }, ai);
    const before = (await listViews(p.id))[0]!;
    const zip = await buildBackup();

    await deleteProject(p.id);
    expect(await listProjects()).toHaveLength(0);

    const res = await restoreBackup(zip);
    expect(res).toMatchObject({ projects: 1, views: 1 });
    expect(res.images).toBe(2);
    const back = (await getProject(p.id))!;
    expect(back.styleNumber).toBe("RT-1");
    expect(back.techpack).toEqual({ sizing: { unit: "in" } });
    const [view] = await listViews(p.id);
    expect(view).toEqual(before);
    expect(await text(await getBlob(view!.imageId!))).toBe("img-1");
    expect((await getBlob(view!.imageId!))?.type).toBe("image/png");
  });

  it("rejects files that are not backups", async () => {
    await expect(restoreBackup(new Blob(["nope"]))).rejects.toThrow(/backup/i);
    const JSZip = (await import("jszip")).default;
    const z = new JSZip();
    z.file("manifest.json", JSON.stringify({ format: "other" }));
    await expect(restoreBackup(new Blob([await z.generateAsync({ type: "arraybuffer" })]))).rejects.toThrow(/backup/i);
    const newer = new JSZip();
    newer.file("manifest.json", JSON.stringify({ format: "seamsheet-backup", version: 99 }));
    await expect(restoreBackup(new Blob([await newer.generateAsync({ type: "arraybuffer" })]))).rejects.toThrow(/newer/i);
  });
});
