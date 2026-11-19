import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { cn } from "../../lib/cn";
import type { Generation } from "../../lib/generations";
import { Button, Modal } from "../ui";

const when = (iso: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function HistoryStrip({ generations, activeId, urls, onSelect }: { generations: Generation[]; activeId: string | null; urls: Record<string, string>; onSelect: (id: string) => void }) {
  if (generations.length < 2) return null;
  return (
    <section>
      <p className="eyebrow mb-3">History</p>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {generations.map((g) => {
          const thumb = g.views.find((v) => v.viewType === "front" && v.imageId) ?? g.views.find((v) => v.imageId);
          const src = thumb?.imageId ? urls[thumb.imageId] : undefined;
          return (
            <button key={g.id} type="button" onClick={() => onSelect(g.id)}
              className={cn("flex w-28 shrink-0 flex-col overflow-hidden rounded-2xl border bg-card text-left transition-all", activeId === g.id ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-foreground/20")}>
              <div className="aspect-square bg-studio">{src ? <img src={src} alt="" className="size-full object-contain" /> : <div className="shimmer size-full" />}</div>
              <div className="px-2.5 py-2">
                <p className="text-xs font-medium">{when(g.createdAt)}</p>
                <p className="text-[0.6875rem] text-muted-foreground">{g.views.length} views · {g.mode === "flat" ? "Flat" : "Realistic"}</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export interface LightboxItem { id: string; url: string; label: string }

export function Lightbox({ items, index, factoryWhite, onIndex, onClose, onDownload }: {
  items: LightboxItem[]; index: number | null; factoryWhite: boolean; onIndex: (i: number) => void; onClose: () => void; onDownload: (id: string) => void;
}) {
  const item = index !== null ? items[index] : undefined;
  const go = (d: number) => index !== null && items.length > 0 && onIndex((index + d + items.length) % items.length);
  useEffect(() => {
    if (!item) return;
    const on = (e: KeyboardEvent) => { if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });
  return (
    <Modal open={!!item} onClose={onClose} title={item?.label ?? ""} wide>
      {item && (
        <>
          <div className={cn("flex max-h-[70vh] items-center justify-center overflow-hidden rounded-2xl", factoryWhite ? "bg-factory" : "bg-studio")}>
            <img src={item.url} alt={item.label} className="max-h-[70vh] w-auto object-contain" />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => go(-1)} aria-label="Previous"><ChevronLeft /></Button>
            <Button variant="ghost" size="icon" onClick={() => go(1)} aria-label="Next"><ChevronRight /></Button>
            <span className="text-xs text-muted-foreground">{(index ?? 0) + 1} / {items.length}</span>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => onDownload(item.id)}><Download /> Download</Button>
          </div>
        </>
      )}
    </Modal>
  );
}
