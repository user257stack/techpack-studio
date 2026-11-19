import { useEffect, useMemo, useState } from "react";
import { Archive, KeyRound, Loader2, Sparkles } from "lucide-react";
import { cn } from "../../lib/cn";
import { getBlob, updateProject, useBlobUrls, useLive, listViews, type Project, type View } from "../../lib/db";
import { groupGenerations } from "../../lib/generations";
import { friendlyError, createGemini } from "../../lib/gemini";
import { downloadZip, onWhite, prepareImage, saveBlob, slug } from "../../lib/image";
import { recordCorrection, renderView, runGeneration } from "../../lib/pipeline";
import { useSettings } from "../../lib/settings";
import { readAnalysis } from "../../model/analysis";
import { DEFAULT_SELECTION, DETAIL_OPTIONS, planViews, viewLabel, type DetailName, type ViewMode, type ViewSelection } from "../../model/views";
import { Button, Input, Label, Switch, Textarea, toast } from "../ui";
import { RiotAvatar, RiotNote } from "../Riot";
import { UploadDropzone } from "./UploadDropzone";
import { ViewCard } from "./ViewCard";
import { HistoryStrip, Lightbox } from "./HistoryAndLightbox";

type Phase = "idle" | "analyzing" | "generating";

export function MockupGenerator({ project, onOpenSettings }: { project: Project; onOpenSettings: () => void }) {
  const settings = useSettings();
  const { data: views } = useLive(() => listViews(project.id), [project.id], [] as View[]);
  const generations = useMemo(() => groupGenerations(views), [views]);

  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [garmentType, setGarmentType] = useState(project.garmentType);
  const [notes, setNotes] = useState(project.notes);
  const [selection, setSelection] = useState<ViewSelection>(DEFAULT_SELECTION);
  const [mode, setMode] = useState<ViewMode>("realistic");
  const [factoryWhite, setFactoryWhite] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [running, setRunning] = useState<Record<string, number>>({});
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [zipping, setZipping] = useState(false);

  useEffect(() => {
    if (!photo) return setPhotoUrl(null);
    const u = URL.createObjectURL(photo);
    setPhotoUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);

  const active = generations.find((g) => g.id === activeId) ?? generations[0];
  const urls = useBlobUrls([project.originalImageId, ...views.map((v) => v.imageId)]);
  const previewUrl = photoUrl ?? (project.originalImageId ? urls[project.originalImageId] ?? null : null);
  const hasSource = !!photo || !!project.originalImageId;
  const busy = phase !== "idle";
  const planned = planViews(selection, mode);
  const startRun = (id: string) => setRunning((r) => ({ ...r, [id]: Date.now() }));
  const endRun = (id: string) => setRunning(({ [id]: _, ...rest }) => rest);

  async function onPick(file: File) {
    try {
      setPhoto(await prepareImage(file));
    } catch {
      toast.error("Riot couldn't open that image. Try a different file.");
    }
  }

  async function onGenerate() {
    if (!settings.apiKey) {
      toast.error("Add your Google AI key to generate mockups.");
      return onOpenSettings();
    }
    if (!hasSource) return void toast.error("Drop in a garment photo first.");
    if (planned.length === 0) return void toast.error("Pick at least one view.");
    try {
      setPhase("analyzing");
      const res = await runGeneration(
        { project, photo, garmentType, notes, planned, mode, whiteBackground: factoryWhite },
        createGemini(settings),
        { onPhase: setPhase, onGeneration: setActiveId, onViewStart: startRun, onViewEnd: endRun },
      );
      setPhoto(null);
      if (res.done > 0) toast.success(`Riot finished ${res.done} of ${res.total} views.`);
      const firstFail = res.failed[0];
      if (firstFail) toast.error(`${viewLabel(firstFail.viewType, firstFail.detailName)}: ${firstFail.error ?? "Riot couldn't finish this view."}`);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setPhase("idle");
    }
  }

  async function runOne(viewId: string, fn: () => Promise<View | undefined>) {
    if (!settings.apiKey) {
      toast.error("Add your Google AI key to generate mockups.");
      return onOpenSettings();
    }
    startRun(viewId);
    try {
      const v = await fn();
      if (v?.status === "failed") toast.error(`${viewLabel(v.viewType, v.detailName)}: ${v.error ?? "Riot couldn't finish this view."}`);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      endRun(viewId);
    }
  }

  const fileName = (v: View) => `${slug(project.styleNumber || project.styleName)}-${v.viewType}${v.detailName ? `-${v.detailName}` : ""}.png`;
  const doneViews = (active?.views ?? []).filter((v) => v.status === "done" && v.imageId && urls[v.imageId]);
  const lightboxItems = doneViews.map((v) => ({ id: v.id, url: urls[v.imageId!]!, label: viewLabel(v.viewType, v.detailName) }));

  async function downloadOne(v: View) {
    const blob = v.imageId ? await getBlob(v.imageId) : undefined;
    if (blob) saveBlob(factoryWhite ? await onWhite(blob) : blob, fileName(v));
  }

  async function downloadAll() {
    setZipping(true);
    try {
      const files = [];
      for (const v of doneViews) {
        const blob = v.imageId ? await getBlob(v.imageId) : undefined;
        if (blob) files.push({ blob, name: fileName(v) });
      }
      await downloadZip(files, `${slug(project.styleNumber || project.styleName)}-views.zip`, factoryWhite);
    } catch {
      toast.error("Riot couldn't bundle the ZIP. Try again.");
    } finally {
      setZipping(false);
    }
  }

  const analysis = readAnalysis(project.analysis);
  const settled = active && active.views.every((v) => v.status === "done" || v.status === "failed") && !active.views.some((v) => running[v.id]);
  const inferredLabels = (active?.views ?? []).filter((v) => v.isInferred).map((v) => viewLabel(v.viewType, v.detailName));
  const checks = (analysis?.riot_note.length ? analysis.riot_note : analysis?.not_visible.map((n) => `Not visible in the photo: ${n}.`) ?? []).slice(0, 4);

  const toggle = (k: keyof Omit<ViewSelection, "details">) => (on: boolean) => setSelection((s) => ({ ...s, [k]: on }));
  const toggleDetail = (d: DetailName) => setSelection((s) => ({ ...s, details: s.details.includes(d) ? s.details.filter((x) => x !== d) : [...s.details, d] }));
  const statusText = phase === "analyzing" ? "Riot is reading your garment…" : phase === "generating" ? "Riot is generating your views…" : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      <header className="mb-6 sm:mb-8">
        <p className="eyebrow">{[project.brand, project.season, project.styleNumber].filter(Boolean).join(" · ") || "Mockup Generator"}</p>
        <h1 className="editorial-title mt-1.5 text-3xl sm:text-4xl">{project.styleName}</h1>
      </header>

      {!settings.apiKey && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-3xl border border-primary/30 bg-primary-soft p-5">
          <KeyRound className="size-5 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Add your Google AI key to generate mockups.</p>
            <p className="text-xs text-muted-foreground">It stays in this browser. The tech pack pages below work without it.</p>
          </div>
          <Button className="rounded-full" onClick={onOpenSettings}>Add key</Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-10">
        <section className="space-y-5">
          <UploadDropzone previewUrl={previewUrl} onFile={onPick} disabled={busy} />
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gt">Garment type <span className="font-normal">(optional)</span></Label>
              <Input id="gt" value={garmentType} onChange={(e) => setGarmentType(e.target.value)} onBlur={() => void updateProject(project.id, { garmentType: garmentType.trim() })} placeholder="Denim chore jacket" disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes <span className="font-normal">(optional)</span></Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => void updateProject(project.id, { notes: notes.trim() })} placeholder="cropped, boxy fit, drop shoulder" disabled={busy} />
            </div>
          </div>

          <div>
            <p className="eyebrow mb-2">Mode</p>
            <div className="grid grid-cols-2 rounded-2xl border border-border bg-card p-1">
              {(["realistic", "flat"] as const).map((m) => (
                <button key={m} type="button" disabled={busy} onClick={() => setMode(m)} aria-pressed={mode === m}
                  className={cn("rounded-xl py-2 text-sm font-medium transition-colors", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {m === "realistic" ? "Realistic mockup" : "Technical flat"}
                </button>
              ))}
            </div>
            {mode === "flat" && <p className="mt-2 text-xs text-muted-foreground">Technical flats cover front and back only.</p>}
          </div>

          <div>
            <p className="eyebrow mb-2">Views</p>
            <div className="grid grid-cols-2 gap-2">
              {(["front", "back", "left", "right", "three_quarter", "flat_lay"] as const).map((k) => {
                const off = mode === "flat" && k !== "front" && k !== "back";
                const disabled = busy || off;
                return (
                  <label key={k} className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-sm transition-colors hover:border-foreground/20", selection[k] && !off && "border-primary/40", disabled && "cursor-not-allowed opacity-40")}>
                    <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={selection[k] && !off} disabled={disabled} onChange={(e) => toggle(k)(e.target.checked)} />
                    {viewLabel(k)}
                  </label>
                );
              })}
            </div>
            <p className="eyebrow mb-2 mt-4">Details</p>
            <div className="flex flex-wrap gap-2">
              {DETAIL_OPTIONS.map((d) => {
                const on = selection.details.includes(d);
                return (
                  <button key={d} type="button" disabled={busy || mode === "flat"} onClick={() => toggleDetail(d)} aria-pressed={on}
                    className={cn("rounded-full border px-3 py-1.5 text-sm capitalize transition-colors disabled:opacity-40", on && mode !== "flat" ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground")}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
            <div>
              <Label htmlFor="white" className="text-sm font-medium text-foreground">White background</Label>
              <p className="text-xs text-muted-foreground">Pure white for factory use.</p>
            </div>
            <Switch id="white" label="White background" checked={factoryWhite} onChange={setFactoryWhite} />
          </div>

          <Button size="lg" className="w-full rounded-full shadow-lift" onClick={onGenerate} disabled={busy || !hasSource || planned.length === 0}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {busy ? statusText : `Generate ${planned.length} view${planned.length === 1 ? "" : "s"}`}
          </Button>
        </section>

        <section className="min-w-0 space-y-6">
          {phase === "analyzing" && (
            <div className="animate-rise flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
              <RiotAvatar size="sm" /><p className="text-sm">{statusText}</p><Loader2 className="ml-auto size-4 animate-spin text-primary" />
            </div>
          )}
          {active ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="eyebrow">{active.mode === "flat" ? "Technical flats" : "Mockups"} · {active.views.length} views</p>
                <Button variant="outline" size="sm" className="rounded-full" onClick={downloadAll} disabled={doneViews.length === 0 || zipping}>
                  {zipping ? <Loader2 className="animate-spin" /> : <Archive />} Download all as ZIP
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {active.views.map((v) => (
                  <ViewCard key={v.id} view={v} url={v.imageId ? urls[v.imageId] : undefined} startedAt={running[v.id]} factoryWhite={factoryWhite}
                    onOpen={() => { const i = lightboxItems.findIndex((x) => x.id === v.id); if (i >= 0) setLightbox(i); }}
                    onRegenerate={() => runOne(v.id, () => renderView(v.id, createGemini(settings)))}
                    onEdit={(instruction) => runOne(v.id, () => renderView(v.id, createGemini(settings), { instruction }))}
                    onCorrect={(correction) => runOne(v.id, async () => { await recordCorrection(v.id, correction); return renderView(v.id, createGemini(settings), { correction }); })}
                    onDownload={() => void downloadOne(v)} />
                ))}
              </div>
              {settled && doneViews.length > 0 && <RiotNote inferred={inferredLabels} checks={checks} />}
              <HistoryStrip generations={generations} activeId={active.id} urls={urls} onSelect={setActiveId} />
            </>
          ) : (
            <EmptyResults />
          )}
        </section>
      </div>

      <Lightbox items={lightboxItems} index={lightbox} factoryWhite={factoryWhite} onIndex={setLightbox} onClose={() => setLightbox(null)}
        onDownload={(id) => { const v = doneViews.find((x) => x.id === id); if (v) void downloadOne(v); }} />
    </div>
  );
}

function EmptyResults() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex items-start gap-3 rounded-3xl border border-border bg-card p-6 shadow-card sm:col-span-2">
        <RiotAvatar />
        <div>
          <p className="font-medium">Riot is ready when you are.</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">Give me one clear photo or sketch. I'll build the front first, then match back and sides to it so the set stays consistent.</p>
        </div>
      </div>
      {["Front", "Back", "Left", "Right"].map((l) => (
        <div key={l} className="relative aspect-[2/3] rounded-3xl border border-dashed border-border bg-card/50"><span className="absolute left-4 top-4 text-xs font-medium text-muted-foreground">{l}</span></div>
      ))}
    </div>
  );
}
