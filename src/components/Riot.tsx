import { cn } from "../lib/cn";
import { RIOT_SAMPLE_LINE } from "../model/riot";

export function RiotAvatar({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const s = { sm: "size-6 text-xs rounded-md", md: "size-8 text-sm rounded-lg", lg: "size-12 text-xl rounded-xl" }[size];
  return (
    <div aria-label="Riot" className={cn("grid shrink-0 place-items-center bg-primary font-extrabold tracking-tighter text-primary-foreground shadow-card", s, className)}>R</div>
  );
}

export function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <div className="grid size-7 place-items-center rounded-lg border border-border bg-card">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M8 3 4 6v4l2 1v10h12V11l2-1V6l-4-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3Z" />
          <path d="M12 6v15" strokeDasharray="1.5 2" />
        </svg>
      </div>
      <span className="text-[0.95rem] font-semibold tracking-tight">SeamSheet <span className="text-primary">Studio</span></span>
    </div>
  );
}

export function RiotNote({ inferred, checks }: { inferred: string[]; checks: string[] }) {
  return (
    <aside className="animate-rise rounded-3xl border border-border bg-card p-5 shadow-card sm:p-6">
      <div className="flex items-center gap-3">
        <RiotAvatar />
        <div>
          <p className="eyebrow">Riot's note</p>
          <p className="text-sm font-medium">Here's what I saw, and what I assumed.</p>
        </div>
      </div>
      {inferred.length > 0 && (
        <p className="mt-4 text-sm">
          <span className="font-medium">Inferred, not seen:</span>{" "}
          <span className="text-muted-foreground">{inferred.join(", ")}. Assumed, confirm with sample.</span>
        </p>
      )}
      {checks.length > 0 && (
        <ul className="mt-3 space-y-2">
          {checks.map((c, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 border-t border-border pt-3 text-sm font-semibold">{RIOT_SAMPLE_LINE}</p>
    </aside>
  );
}
