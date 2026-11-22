import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Check, Crosshair, Trash2 } from "lucide-react";
import { cn } from "../../lib/cn";
import { listViews, useBlobUrls, useLive, type View } from "../../lib/db";
import { pickPinnableViews } from "../../lib/generations";
import { viewKey, viewLabel } from "../../model/views";
import { calloutsForView, placeCallout, removeCallout, type Callout, type Section, type Techpack } from "../../model/techpack";
import type { Project } from "../../lib/db";
import { Button } from "../ui";
import { Panel } from "./ui";

/** The numbered circle. Forced to print in colour so callouts survive "Save as PDF". */
function PinDot({ n, selected }: { n: number; selected?: boolean }) {
  return (
    <span
      className={cn(
        "callout-pin inline-flex size-6 items-center justify-center rounded-full bg-primary text-[0.6875rem] font-bold leading-none tabular-nums text-primary-foreground shadow ring-2 ring-white",
        selected && "size-7 ring-[3px] ring-primary-soft outline outline-2 outline-primary",
      )}
    >
      {n}
    </span>
  );
}

const rowName = (r: { area: string; seam: string; notes: string }) => r.area.trim() || r.seam.trim() || r.notes.trim() || "Untitled row";

type Pin = Callout & { n: number };

/** Read-only drawing with its pins, for the printed summary. */
export function PinnedFigure({ url, label, pins }: { url: string; label: string; pins: Pin[] }) {
  return (
    <figure className="break-inside-avoid">
      <div className="relative mx-auto w-fit max-w-full rounded-xl border border-border bg-factory">
        <img src={url} alt={`${label} with numbered construction callouts`} className="block h-auto max-h-[26rem] w-auto max-w-full" />
        {pins.map((p) => (
          <span key={p.id} aria-hidden className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
            <PinDot n={p.n} />
          </span>
        ))}
      </div>
      <figcaption className="mt-1 text-center text-xs text-muted-foreground">{label} · callouts match the numbers below</figcaption>
    </figure>
  );
}

/**
 * Click the drawing to pin the chosen construction row on it; drag a pin to move it; arrow keys nudge a
 * focused pin and Delete removes it. Pins are stored in the tech pack (construction.callouts), so they are
 * saved, backed up and printed with everything else.
 */
export function CalloutBoard({ project, construction, onChange, onGo }: {
  project: Project;
  construction: Techpack["construction"];
  onChange: (callouts: Callout[]) => void;
  onGo: (s: Section) => void;
}) {
  const { data: views } = useLive(() => listViews(project.id), [project.id], [] as View[]);
  const pinnable = useMemo(() => pickPinnableViews(views), [views]);
  const [viewId, setViewId] = useState<string | null>(null);
  const [activeRow, setActiveRow] = useState<string | null>(null);
  const [selectedPin, setSelectedPin] = useState<string | null>(null);
  const dragging = useRef<string | null>(null);
  const surface = useRef<HTMLDivElement>(null);

  const current = pinnable.find((v) => v.id === viewId) ?? pinnable[0];
  const urls = useBlobUrls([current?.imageId]);
  const url = current?.imageId ? urls[current.imageId] : undefined;
  const key = current ? viewKey(current.viewType, current.detailName) : "";
  const pins = calloutsForView(construction, key);
  const pinnedRows = new Set(pins.map((p) => p.rowId));
  const rows = construction.rows;
  const target = rows.find((r) => r.id === activeRow) ?? rows.find((r) => !pinnedRows.has(r.id)) ?? rows[0];
  const targetPin = target ? pins.find((p) => p.rowId === target.id) : undefined;

  const pinRow = (rowId: string, x: number, y: number) => onChange(placeCallout(construction.callouts, key, rowId, x, y));
  const afterPlace = (rowId: string) => {
    const i = rows.findIndex((r) => r.id === rowId);
    const next = [...rows.slice(i + 1), ...rows.slice(0, i)].find((r) => r.id !== rowId && !pinnedRows.has(r.id));
    setActiveRow(next?.id ?? rowId);
  };
  const at = (clientX: number, clientY: number) => {
    const r = surface.current?.getBoundingClientRect();
    return r && r.width > 0 && r.height > 0 ? { x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height } : null;
  };

  function onSurfaceClick(e: React.MouseEvent) {
    if (!target) return;
    const p = at(e.clientX, e.clientY);
    if (!p) return;
    pinRow(target.id, p.x, p.y);
    afterPlace(target.id);
  }
  function onPinDown(e: PointerEvent<HTMLButtonElement>, pin: Pin) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = pin.id;
    setSelectedPin(pin.id);
    setActiveRow(pin.rowId);
  }
  function onPinMove(e: PointerEvent<HTMLButtonElement>, pin: Pin) {
    if (dragging.current !== pin.id) return;
    const p = at(e.clientX, e.clientY);
    if (p) pinRow(pin.rowId, p.x, p.y);
  }
  function onPinKey(e: KeyboardEvent<HTMLButtonElement>, pin: Pin) {
    const step = e.shiftKey ? 0.05 : 0.01;
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = move[e.key];
    if (d) {
      e.preventDefault();
      pinRow(pin.rowId, pin.x + d[0], pin.y + d[1]);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onChange(removeCallout(construction.callouts, pin.id));
      setSelectedPin(null);
    }
  }

  if (pinnable.length === 0) {
    return (
      <Panel title="Callouts on the flat" hint="Number the construction details directly on your drawing.">
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No finished drawings yet.{" "}
          <button className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => onGo("mockups")}>
            Generate a technical flat
          </button>{" "}
          and it will show up here, ready to pin.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Callouts on the flat" hint="Pick a row, then click the drawing to pin it. Drag a pin to move it. Pin numbers are the row numbers in the table above, so they stay in step as you edit.">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Drawing to annotate">
            {pinnable.map((v) => {
              const on = v.id === current?.id;
              const count = calloutsForView(construction, viewKey(v.viewType, v.detailName)).length;
              return (
                <button key={v.id} type="button" aria-pressed={on} onClick={() => setViewId(v.id)}
                  className={cn("rounded-full border px-3 py-1.5 text-sm transition-colors", on ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground")}>
                  {viewLabel(v.viewType, v.detailName)}{v.mode === "flat" ? " · flat" : ""}{count > 0 ? ` (${count})` : ""}
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-border bg-factory p-2">
            {url ? (
              <div className="relative mx-auto w-fit max-w-full">
                <img src={url} alt={`${viewLabel(current!.viewType, current!.detailName)} drawing`} draggable={false} className="block h-auto max-h-[70vh] w-auto max-w-full select-none" />
                <div ref={surface} className={cn("absolute inset-0", target ? "cursor-crosshair" : "cursor-not-allowed")} onClick={onSurfaceClick}>
                  {pins.map((p) => (
                    <button key={p.id} type="button" onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => onPinDown(e, p)} onPointerMove={(e) => onPinMove(e, p)}
                      onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }}
                      onKeyDown={(e) => onPinKey(e, p)} onFocus={() => setSelectedPin(p.id)}
                      aria-label={`Callout ${p.n}: ${rowName(rows[p.n - 1]!)}. Arrow keys move it, Delete removes it.`}
                      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full active:cursor-grabbing"
                      style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
                      <PinDot n={p.n} selected={selectedPin === p.id} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="shimmer aspect-[2/3] w-full max-w-sm rounded-xl" />
            )}
          </div>
        </div>

        <div className="space-y-3">
          {rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Add a construction detail in the table above, then pin it here.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {target ? <>Next click pins <span className="font-semibold text-foreground">{rows.indexOf(target) + 1}. {rowName(target)}</span>{targetPin ? " (moves its pin)." : "."}</> : null}
              </p>
              <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
                {rows.map((r, i) => (
                  <li key={r.id}>
                    <button type="button" aria-pressed={target?.id === r.id} onClick={() => setActiveRow(r.id)}
                      className={cn("flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-1.5 text-left text-sm transition-colors", target?.id === r.id ? "border-primary bg-primary-soft" : "border-border hover:bg-accent")}>
                      <PinDot n={i + 1} />
                      <span className="min-w-0 flex-1 truncate">{rowName(r)}</span>
                      {pinnedRows.has(r.id) && <Check className="size-4 shrink-0 text-success" aria-label="Pinned on this drawing" />}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="rounded-full" disabled={!target} onClick={() => { if (target) { pinRow(target.id, 0.5, 0.5); afterPlace(target.id); } }}>
                  <Crosshair /> Pin at centre
                </Button>
                <Button variant="ghost" size="sm" className="rounded-full" disabled={!targetPin} onClick={() => targetPin && onChange(removeCallout(construction.callouts, targetPin.id))}>
                  <Trash2 /> Remove pin
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Keyboard: Tab to a pin, arrow keys to nudge (Shift for bigger steps), Delete to remove.</p>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
