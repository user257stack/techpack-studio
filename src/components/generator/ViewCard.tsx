import { useEffect, useState } from "react";
import { AlertTriangle, Download, Eye, Flag, Loader2, RotateCw, Sparkles, Wand2 } from "lucide-react";
import { cn } from "../../lib/cn";
import { viewLabel } from "../../model/views";
import type { View } from "../../lib/db";
import { Button, Modal, Textarea } from "../ui";

function useFakeProgress(active: boolean, startedAt: number | undefined) {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!active) return setP(0);
    const start = startedAt ?? Date.now();
    const id = setInterval(() => setP(Math.min(95, 100 * (1 - Math.exp(-((Date.now() - start) / 1000) / 22)))), 400);
    return () => clearInterval(id);
  }, [active, startedAt]);
  return p;
}

export function ViewCard({ view, url, startedAt, factoryWhite, onOpen, onRegenerate, onEdit, onCorrect, onDownload }: {
  view: View; url: string | undefined; startedAt: number | undefined; factoryWhite: boolean;
  onOpen: () => void; onRegenerate: () => void; onEdit: (instruction: string) => void; onCorrect: (correction: string) => void; onDownload: () => void;
}) {
  const working = view.status === "generating" || startedAt !== undefined;
  const pending = view.status === "pending" && !working;
  const failed = view.status === "failed" && !working;
  const progress = useFakeProgress(working, startedAt);
  const label = viewLabel(view.viewType, view.detailName);
  const [dialog, setDialog] = useState<null | "edit" | "wrong">(null);
  const [text, setText] = useState("");

  const submit = () => {
    const t = text.trim();
    if (t.length < 2) return;
    if (dialog === "edit") onEdit(t); else onCorrect(t);
    setDialog(null);
    setText("");
  };

  return (
    <article className="group animate-rise flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-card">
      <div className={cn("relative overflow-hidden", view.viewType === "detail" ? "aspect-square" : "aspect-[2/3]", factoryWhite ? "bg-factory" : "bg-studio")}>
        {url && !working ? (
          <button type="button" onClick={onOpen} className="block size-full cursor-zoom-in" aria-label={`Open ${label}`}>
            <img src={url} alt={`${label} view`} className="size-full object-contain transition-transform duration-500 group-hover:scale-[1.02]" />
          </button>
        ) : (
          <div className="shimmer absolute inset-0" />
        )}
        {working && (
          <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-border bg-card/90 p-3 backdrop-blur">
            <p className="flex items-center gap-2 text-xs font-medium"><Loader2 className="size-3.5 animate-spin text-primary" /> Riot is generating your {label.toLowerCase()} view…</p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
          </div>
        )}
        {pending && (
          <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-border bg-card/90 p-3 text-xs text-muted-foreground backdrop-blur">
            Queued. {view.viewType === "front" ? "Up next." : "Waiting on the front view for consistency."}
          </div>
        )}
        {failed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertTriangle className="size-6 text-destructive" />
            <p className="text-sm font-medium">This view didn't come through.</p>
            {view.error && <p className="text-xs text-muted-foreground">{view.error}</p>}
            <Button size="sm" variant="outline" onClick={onRegenerate}><RotateCw /> Try again</Button>
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="rounded-full border border-border bg-card/90 px-2.5 py-1 text-xs font-semibold backdrop-blur">{label}</span>
          {view.isInferred && <span title="Not visible in your photo. Assumed, confirm with sample." className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">Inferred</span>}
          {view.mode === "flat" && <span className="rounded-full border border-border bg-card/90 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur">Flat</span>}
        </div>
      </div>

      <div className="flex items-center gap-1 border-t border-border p-2">
        <Button variant="ghost" size="icon" aria-label="Open" title="Open" onClick={onOpen} disabled={!url || working}><Eye /></Button>
        <Button variant="ghost" size="icon" aria-label="Regenerate" title="Regenerate" onClick={onRegenerate} disabled={working}><RotateCw /></Button>
        <Button variant="ghost" size="sm" className="gap-1.5 px-2.5" aria-label="Edit with Riot" title="Edit with Riot" disabled={!url || working} onClick={() => setDialog("edit")}><Wand2 /> Edit</Button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Mark as wrong" title="Mark as wrong" onClick={() => setDialog("wrong")} disabled={working}><Flag /></Button>
          <Button variant="ghost" size="icon" aria-label="Download" title="Download" onClick={onDownload} disabled={!url || working}><Download /></Button>
        </div>
      </div>
      {view.correctionNote && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">Your correction:</span> {view.correctionNote}</p>
      )}

      <Modal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={<span className="flex items-center gap-2">{dialog === "edit" ? <Sparkles className="size-4 text-primary" /> : <Flag className="size-4 text-primary" />}{dialog === "edit" ? `Edit ${label} with Riot` : `What's wrong with the ${label.toLowerCase()} view?`}</span>}
        description={dialog === "edit" ? "Say what to change. I'll leave everything else alone." : "Tell me what's actually true. I'll treat it as fact, re-run only this view and remember it for the rest."}
      >
        <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} className="min-h-24 rounded-2xl" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
          placeholder={dialog === "edit" ? "Make the zipper pull silver" : "The back has a centre vent, no yoke"} />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
          <Button onClick={submit} disabled={text.trim().length < 2} className="rounded-full">{dialog === "edit" ? "Apply edit" : "Fix this view"}</Button>
        </div>
      </Modal>
    </article>
  );
}
