import { useCallback, useRef, useState } from "react";
import { ImageUp, RefreshCw } from "lucide-react";
import { cn } from "../../lib/cn";
import { toast } from "../ui";

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 25 * 1024 * 1024;

export function UploadDropzone({ previewUrl, onFile, disabled }: { previewUrl: string | null; onFile: (f: File) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const accept = useCallback(
    (f: File | undefined) => {
      if (!f) return;
      if (!ACCEPT.includes(f.type)) return void toast.error("Riot reads JPG, PNG or WEBP. Try another file.");
      if (f.size > MAX_BYTES) return void toast.error("That file is over 25 MB. A smaller photo works fine.");
      onFile(f);
    },
    [onFile],
  );
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); accept(e.dataTransfer.files[0]); }}
      className={cn("group relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-3xl border border-dashed bg-card text-left shadow-card transition-all hover:-translate-y-0.5 sm:aspect-[4/3] lg:aspect-[4/5]", over ? "border-primary bg-primary-soft" : "border-border hover:border-primary/50", disabled && "pointer-events-none opacity-70")}
    >
      <input ref={input} type="file" accept={ACCEPT.join(",")} className="hidden" onChange={(e) => { accept(e.target.files?.[0]); e.target.value = ""; }} />
      {previewUrl ? (
        <>
          <img src={previewUrl} alt="Garment reference" className="absolute inset-0 size-full bg-studio object-contain p-4" />
          <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs font-medium backdrop-blur">
            <RefreshCw className="size-3.5" /> Replace photo
          </span>
        </>
      ) : (
        <div className="flex flex-col items-center px-6 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary transition-transform group-hover:scale-105"><ImageUp className="size-6" /></div>
          <p className="mt-4 font-medium">Drop a garment photo or sketch</p>
          <p className="mt-1 text-sm text-muted-foreground">JPG, PNG or WEBP. Front-facing works best.</p>
        </div>
      )}
    </button>
  );
}
