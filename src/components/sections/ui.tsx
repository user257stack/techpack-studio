import type { ReactNode } from "react";
import { AlertTriangle, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { Button, Input, Label, Textarea } from "../ui";
import { cn } from "../../lib/cn";
import { newId } from "../../model/techpack";
import type { SaveState } from "./useTechpack";

export function SaveBadge({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === "error")
    return (
      <button onClick={onRetry} className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
        <AlertTriangle className="size-3.5" /> Not saved. Retry
      </button>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
      {state === "saving" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5 text-success" />}
      {state === "saving" ? "Saving…" : "Saved"}
    </span>
  );
}

export function SectionShell({
  eyebrow = "Tech pack",
  title,
  description,
  actions,
  badge,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-8 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div className="max-w-2xl">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="editorial-title mt-1.5 text-3xl sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {badge}
          {actions}
        </div>
      </header>
      <div className="mt-8 space-y-8">{children}</div>
    </div>
  );
}

export function Panel({ title, hint, children, className }: { title?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-3xl border border-border bg-card p-5 shadow-card sm:p-6", className)}>
      {title && (
        <div className="mb-4">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function NotesField({ label = "Notes", value, onChange, placeholder }: { label?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Field label={label}>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} className="rounded-xl" />
    </Field>
  );
}

export interface Column<T> {
  key: keyof T & string;
  label: string;
  placeholder?: string;
  suggestions?: readonly string[];
  type?: "text" | "color" | "wide" | "date";
  className?: string;
}

/** Editable table of rows with add / remove. Rows must have an `id`. Scrolls sideways on phones. */
export function RowTable<T extends { id: string }>({
  columns,
  rows,
  onChange,
  makeRow,
  addLabel,
  empty,
  extraHeads = [],
  extraCells,
  afterAdd,
  numbered = false,
}: {
  columns: Column<T>[];
  rows: T[];
  onChange: (rows: T[]) => void;
  makeRow: () => Omit<T, "id">;
  addLabel: string;
  empty: string;
  extraHeads?: string[];
  extraCells?: (row: T) => ReactNode[];
  afterAdd?: ReactNode;
  /** Adds a leading "#" column with each row's position (1, 2, 3…). */
  numbered?: boolean;
}) {
  const set = (id: string, key: keyof T, value: string) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  const listId = (key: string) => `dl-${key}`;

  return (
    <div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[640px] border-separate border-spacing-y-1.5 text-sm">
            <thead>
              <tr className="text-left">
                {numbered && <th className="eyebrow w-8 px-1 pb-1 text-center">#</th>}
                {columns.map((c) => (
                  <th key={c.key} className="eyebrow px-1 pb-1">{c.label}</th>
                ))}
                {extraHeads.map((h) => (
                  <th key={h} className="eyebrow px-1 pb-1 text-right">{h}</th>
                ))}
                <th className="w-9" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  {numbered && <td className="w-8 px-1 pt-2.5 text-center align-top text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</td>}
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-1 align-top", c.className)}>
                      {c.type === "color" ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            aria-label={`${c.label} picker`}
                            value={/^#[0-9a-f]{6}$/i.test(String(r[c.key])) ? String(r[c.key]) : "#000000"}
                            onChange={(e) => set(r.id, c.key, e.target.value)}
                            className="size-9 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent p-0.5"
                          />
                          <Input value={String(r[c.key] ?? "")} onChange={(e) => set(r.id, c.key, e.target.value)} placeholder="#000000" className="h-9 w-24 rounded-lg px-2" />
                        </div>
                      ) : (
                        <>
                          <Input
                            value={String(r[c.key] ?? "")}
                            onChange={(e) => set(r.id, c.key, e.target.value)}
                            placeholder={c.placeholder}
                            list={c.suggestions ? listId(c.key) : undefined}
                            type={c.type === "date" ? "date" : "text"}
                            aria-label={c.label}
                            className={cn("h-9 rounded-lg px-2", c.type === "wide" && "min-w-48")}
                          />
                        </>
                      )}
                    </td>
                  ))}
                  {extraCells?.(r).map((cell, i) => (
                    <td key={i} className="px-1 text-right align-middle tabular-nums text-muted-foreground">{cell}</td>
                  ))}
                  <td className="align-middle">
                    <Button variant="ghost" size="icon" className="size-8" aria-label="Remove row" onClick={() => onChange(rows.filter((x) => x.id !== r.id))}>
                      <Trash2 className="text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {columns.filter((c) => c.suggestions).map((c) => (
            <datalist key={c.key} id={listId(c.key)}>
              {c.suggestions!.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="soft" size="sm" className="rounded-full" onClick={() => onChange([...rows, { id: newId(), ...makeRow() } as T])}>
          <Plus /> {addLabel}
        </Button>
        {afterAdd}
      </div>
    </div>
  );
}
