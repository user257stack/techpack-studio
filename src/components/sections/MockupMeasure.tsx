import { useEffect, useMemo, useRef, useState } from "react";
import { ImageUp, Loader2, Sparkles, Undo2 } from "lucide-react";
import { Button, Input, NativeSelect, toast } from "../ui";
import { cn } from "../../lib/cn";
import { createGemini, friendlyError } from "../../lib/gemini";
import { prepareImage } from "../../lib/image";
import { useSettings } from "../../lib/settings";
import {
  applyProposals, changePrompt, formatMeasure, measurePrompt, parseChanges, parseRatios, restoreBases,
  type Confidence, type Proposal,
} from "../../model/mockupMeasure";
import { parseMeasure, type Techpack } from "../../model/techpack";
import { Field, Panel } from "./ui";

type Rows = Techpack["sizing"]["rows"];

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 25 * 1024 * 1024;

interface Draft {
  rowId: string;
  text: string;
  use: boolean;
  confidence: Confidence | null;
  note: string;
}
type Msg = { tone: "info" | "warn" | "ok"; text: string } | null;

const TONE = { info: "text-muted-foreground", warn: "text-warning", ok: "text-foreground" } as const;
const CHIP: Record<Confidence, string> = {
  high: "bg-primary-soft text-primary",
  medium: "bg-muted text-muted-foreground",
  low: "bg-warning-soft text-warning",
};

/**
 * Sizing helper: reads a flat mockup against one known measurement, or a typed change request, and
 * proposes base-size values. Nothing is written to the table until the designer ticks and applies.
 */
export function MockupMeasure({ rows, unit, baseSize, onRows, onOpenSettings }: {
  rows: Rows;
  unit: "cm" | "in";
  baseSize: string;
  onRows: (rows: Rows) => void;
  onOpenSettings: () => void;
}) {
  const settings = useSettings();
  const hasKey = !!settings.apiKey;
  const named = useMemo(() => rows.filter((r) => r.name.trim()), [rows]);
  const fileInput = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);

  const [img, setImg] = useState<{ blob: Blob; url: string } | null>(null);
  const [over, setOver] = useState(false);
  const [refId, setRefId] = useState("");
  const [refValue, setRefValue] = useState("");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<null | "image" | "change">(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [undo, setUndo] = useState<{ size: string; before: { rowId: string; base: string }[] } | null>(null);

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  // The reference defaults to the first point that already has a number, and its value to that number.
  const ref = named.find((r) => r.id === refId) ?? named.find((r) => parseMeasure(r.base) != null) ?? named[0];
  const refText = refValue.trim() || ref?.base || "";

  const view = rows.flatMap((r) => {
    const d = drafts.find((x) => x.rowId === r.id);
    return d ? [{ r, d }] : [];
  });

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!ACCEPT.includes(file.type)) return void toast.error("Use a JPG, PNG or WEBP image. Export SVG and PDF mockups to PNG first.");
    if (file.size > MAX_BYTES) return void toast.error("That file is over 25 MB. Export a smaller version.");
    try {
      const blob = await prepareImage(file);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setImg({ blob, url });
      setMsg({ tone: "info", text: `${file.name} is ready. Check the known measurement, then break it down.` });
    } catch {
      toast.error("Couldn't read that image. Try a PNG or JPG.");
    }
  }

  function putDrafts(ps: Proposal[]) {
    setDrafts((cur) => {
      const ids = new Set(ps.map((p) => p.rowId));
      return [
        ...cur.filter((d) => !ids.has(d.rowId)),
        ...ps.map((p) => ({ rowId: p.rowId, text: String(p.value), use: p.confidence !== "low", confidence: p.confidence, note: p.note })),
      ];
    });
  }

  function needKey() {
    toast("Add your Google AI key in Settings first.");
    onOpenSettings();
  }

  async function analyze() {
    if (!hasKey) return needKey();
    if (!img) return void setMsg({ tone: "warn", text: "Add your mockup image first." });
    if (!ref) return void setMsg({ tone: "warn", text: "Add at least one named measurement in the table below first, for example Body length, or use Add standard measurements." });
    const refVal = parseMeasure(refText);
    if (refVal == null || refVal <= 0) return void setMsg({ tone: "warn", text: `Enter the real value of "${ref.name}" in ${unit}, for example 70.` });
    setBusy("image");
    setMsg({ tone: "info", text: "Reading the mockup. This can take up to a minute." });
    try {
      const { system, prompt } = measurePrompt({ points: named, reference: ref, referenceValue: refVal, unit });
      const reply = await createGemini(settings).describe(img.blob, system, prompt);
      const { proposals, note } = parseRatios(reply, named, refVal, unit);
      if (!proposals.length) {
        setMsg({ tone: "warn", text: "Couldn't read measurements from that image. Try a flat, front-on mockup with the whole garment in frame." });
        return;
      }
      putDrafts(proposals);
      setMsg({ tone: "ok", text: `${proposals.length} point${proposals.length === 1 ? "" : "s"} estimated${note ? `. ${note}` : ""} Low-confidence points are unticked. Check the numbers, then apply.` });
    } catch (e) {
      setMsg({ tone: "warn", text: friendlyError(e) });
    } finally {
      setBusy(null);
    }
  }

  async function suggest() {
    if (!hasKey) return needKey();
    if (!instruction.trim()) return void setMsg({ tone: "warn", text: 'Describe the change first, for example "make the hem 3 cm wider".' });
    const points = named.flatMap((r) => {
      const v = parseMeasure(r.base);
      return v == null ? [] : [{ id: r.id, name: r.name, value: v }];
    });
    if (!points.length) return void setMsg({ tone: "warn", text: "Fill in at least one base measurement first, or break down a mockup." });
    setBusy("change");
    setMsg({ tone: "info", text: "Working out the change." });
    try {
      const { system, prompt } = changePrompt({ points, instruction, unit, sizeLabel: baseSize });
      const reply = await createGemini(settings).describe(null, system, prompt);
      const proposals = parseChanges(reply, points, unit);
      if (!proposals.length) {
        setMsg({ tone: "warn", text: "No changes could be worked out from that. Try naming the point and the amount." });
        return;
      }
      putDrafts(proposals);
      setMsg({ tone: "ok", text: `${proposals.length} point${proposals.length === 1 ? "" : "s"} proposed. Check the numbers, then apply.` });
    } catch (e) {
      setMsg({ tone: "warn", text: friendlyError(e) });
    } finally {
      setBusy(null);
    }
  }

  function apply() {
    const chosen = view.flatMap(({ d }) => (d.use && parseMeasure(d.text) != null ? [{ rowId: d.rowId, base: d.text.trim() }] : []));
    if (!chosen.length) return void setMsg({ tone: "warn", text: "Tick at least one point that has a valid number." });
    const before = chosen.map((c) => ({ rowId: c.rowId, base: rows.find((r) => r.id === c.rowId)?.base ?? "" }));
    onRows(applyProposals(rows, chosen));
    setUndo({ size: baseSize, before });
    const done = new Set(chosen.map((c) => c.rowId));
    setDrafts((cur) => cur.filter((d) => !done.has(d.rowId)));
    setMsg({ tone: "ok", text: `Applied ${chosen.length} point${chosen.length === 1 ? "" : "s"} to size ${baseSize}. Other sizes regrade from them.` });
  }

  function undoApply() {
    if (!undo) return;
    if (undo.size !== baseSize) {
      setUndo(null);
      return void setMsg({ tone: "warn", text: "The base size changed since you applied, so this can no longer be undone." });
    }
    onRows(restoreBases(rows, undo.before));
    setUndo(null);
    setMsg({ tone: "ok", text: "Undid the last apply." });
  }

  return (
    <Panel
      title="Measure from a mockup"
      hint="Upload your finished flat mockup. The AI reads its proportions against one measurement you know and proposes values for the points below. Nothing changes until you apply."
    >
      {!hasKey && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-warning-soft px-4 py-3 text-sm">
          <span>This needs your Google AI key. The image is sent to Google only when you press Break down.</span>
          <Button size="sm" variant="outline" className="rounded-full" onClick={onOpenSettings}>Add key</Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void pick(e.dataTransfer.files[0]); }}
          className={cn("relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed bg-card text-center transition-colors", over ? "border-primary bg-primary-soft" : "border-border hover:border-primary/50")}
        >
          <input ref={fileInput} type="file" accept={ACCEPT.join(",")} aria-label="Mockup image" className="hidden"
            onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
          {img ? (
            <>
              <img src={img.url} alt="Uploaded mockup" className="absolute inset-0 size-full bg-studio object-contain p-3" />
              <span className="absolute bottom-3 right-3 rounded-full border border-border bg-card/90 px-3 py-1 text-xs font-medium backdrop-blur">Replace image</span>
            </>
          ) : (
            <span className="flex flex-col items-center gap-2 px-6 text-sm text-muted-foreground">
              <span className="grid size-11 place-items-center rounded-2xl bg-primary-soft text-primary"><ImageUp className="size-5" /></span>
              <span className="font-medium text-foreground">Drop your mockup here</span>
              <span>or click to choose a JPG, PNG or WEBP</span>
            </span>
          )}
        </button>

        <div className="space-y-4">
          <Field label="Known measurement">
            <NativeSelect aria-label="Known measurement" value={ref?.id ?? ""} disabled={!named.length}
              onChange={(e) => { setRefId(e.target.value); setRefValue(""); }}>
              {named.length ? named.map((r) => <option key={r.id} value={r.id}>{r.name}</option>) : <option value="">Name a measurement in the table first</option>}
            </NativeSelect>
          </Field>
          <Field label={`Its real value (${unit})`}>
            <Input inputMode="decimal" aria-label="Real value of the known measurement" value={refValue}
              placeholder={ref?.base || "e.g. 70"} onChange={(e) => setRefValue(e.target.value)} />
          </Field>
          <p className="text-xs text-muted-foreground">
            Use a number from your pattern or a sample, such as body length. Leave it blank to use the value already in the table. A flat, front-on mockup works best.
          </p>
          <Button className="rounded-full" onClick={() => void analyze()} disabled={busy !== null || !img}>
            {busy === "image" ? <Loader2 className="animate-spin" /> : <Sparkles />} Break down mockup
          </Button>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <Field label="Or describe a change to the measurements">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input aria-label="Describe a change" value={instruction} placeholder="Shorten the sleeve 2 cm and widen the hem 3 cm"
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void suggest(); } }} />
            <Button variant="outline" onClick={() => void suggest()} disabled={busy !== null}>
              {busy === "change" && <Loader2 className="animate-spin" />} Suggest changes
            </Button>
          </div>
        </Field>
      </div>

      {(msg || undo) && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {msg && <p role="status" aria-live="polite" className={cn("text-sm", TONE[msg.tone])}>{msg.text}</p>}
          {undo && <Button variant="outline" size="sm" className="rounded-full" onClick={undoApply}><Undo2 /> Undo last apply</Button>}
        </div>
      )}

      {view.length > 0 && (
        <div className="mt-6">
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[560px] border-separate border-spacing-y-1.5 text-sm">
              <thead>
                <tr className="text-left">
                  <th className="w-8" />
                  <th className="eyebrow px-1 pb-1">Point</th>
                  <th className="eyebrow px-1 pb-1 text-right">Now</th>
                  <th className="eyebrow w-32 px-1 pb-1">Proposed ({baseSize || "–"})</th>
                  <th className="eyebrow px-1 pb-1 text-right">Change</th>
                  <th className="eyebrow px-1 pb-1">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {view.map(({ r, d }) => {
                  const now = parseMeasure(r.base);
                  const next = parseMeasure(d.text);
                  const delta = now != null && next != null ? next - now : null;
                  const set = (patch: Partial<Draft>) => setDrafts((cur) => cur.map((x) => (x.rowId === d.rowId ? { ...x, ...patch } : x)));
                  return (
                    <tr key={r.id}>
                      <td className="px-1 align-middle">
                        <input type="checkbox" className="size-4 accent-primary" checked={d.use} aria-label={`Apply ${r.name}`} onChange={(e) => set({ use: e.target.checked })} />
                      </td>
                      <td className="px-1 align-middle font-medium">
                        {r.name}
                        {d.note && <span className="block text-xs font-normal text-muted-foreground">{d.note}</span>}
                      </td>
                      <td className="px-1 text-right align-middle tabular-nums text-muted-foreground">{r.base || "–"}</td>
                      <td className="px-1 align-middle">
                        <Input inputMode="decimal" aria-label={`Proposed ${r.name}`} value={d.text} className="h-9 w-28 rounded-lg px-2"
                          onChange={(e) => set({ text: e.target.value, use: true })} />
                      </td>
                      <td className="px-1 text-right align-middle tabular-nums text-muted-foreground">
                        {delta == null ? "–" : Math.abs(delta) < 0.05 ? "same" : `${delta > 0 ? "+" : "−"}${formatMeasure(Math.abs(delta), unit)}`}
                      </td>
                      <td className="px-1 align-middle">
                        {d.confidence && <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", CHIP[d.confidence])}>{d.confidence}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button className="rounded-full" onClick={apply}>Apply ticked points</Button>
            <Button variant="ghost" className="rounded-full" onClick={() => { setDrafts([]); setMsg(null); }}>Discard</Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
