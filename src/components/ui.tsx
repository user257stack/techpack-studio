import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "../lib/cn";

// ------------------------------------------------------------------------------------ Button
const variants = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  soft: "bg-primary-soft text-primary hover:bg-primary-soft/70",
  outline: "border border-input bg-card hover:bg-accent",
  ghost: "hover:bg-accent",
  destructive: "bg-destructive text-white hover:bg-destructive/90",
} as const;
const sizes = { default: "h-9 px-4 text-sm", sm: "h-8 px-3 text-xs", lg: "h-12 px-6 text-base", icon: "size-8 p-0" } as const;

export function Button({ variant = "default", size = "default", className, type = "button", ...props }: ComponentProps<"button"> & { variant?: keyof typeof variants; size?: keyof typeof sizes }) {
  return (
    <button
      type={type}
      className={cn("inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0", variants[variant], sizes[size], className)}
      {...props}
    />
  );
}

// ------------------------------------------------------------------------------------ Fields
export const Input = ({ className, ...p }: ComponentProps<"input">) => (
  <input className={cn("h-10 w-full rounded-xl border border-input bg-card px-3 text-sm placeholder:text-muted-foreground disabled:opacity-60", className)} {...p} />
);
export const Textarea = ({ className, ...p }: ComponentProps<"textarea">) => (
  <textarea className={cn("min-h-20 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground disabled:opacity-60", className)} {...p} />
);
export const Label = ({ className, ...p }: ComponentProps<"label">) => <label className={cn("text-xs font-medium text-muted-foreground", className)} {...p} />;
export const NativeSelect = ({ className, ...p }: ComponentProps<"select">) => (
  <select className={cn("h-10 w-full rounded-xl border border-input bg-card px-3 text-sm", className)} {...p} />
);

export function Switch({ checked, onChange, id, label }: { checked: boolean; onChange: (v: boolean) => void; id?: string; label: string }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-primary" : "bg-input")}>
      <span className={cn("absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform", checked && "translate-x-5")} />
    </button>
  );
}

// ------------------------------------------------------------------------------------ Modal
/** A native <dialog>: focus trapping, Escape to close and the backdrop come from the browser. */
export function Modal({ open, onClose, title, description, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; description?: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}
      className={cn("m-auto w-[calc(100%-2rem)] rounded-3xl border border-border bg-card p-0 text-foreground shadow-lift", wide ? "max-w-3xl" : "max-w-md")}>
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
              {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
            </div>
            <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}><X /></Button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

// ------------------------------------------------------------------------------------ Toasts
type ToastItem = { id: number; kind: "success" | "error" | "info"; text: string };
const listeners = new Set<(t: ToastItem) => void>();
let nextId = 1;
const push = (kind: ToastItem["kind"], text: string) => listeners.forEach((l) => l({ id: nextId++, kind, text }));
export const toast = Object.assign((text: string) => push("info", text), {
  success: (t: string) => push("success", t),
  error: (t: string) => push("error", t),
});

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const on = (t: ToastItem) => {
      setItems((x) => [...x.slice(-3), t]);
      window.setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), t.kind === "error" ? 7000 : 4000);
    };
    listeners.add(on);
    return () => void listeners.delete(on);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite" data-app-chrome>
      {items.map((t) => (
        <div key={t.id} className={cn("animate-rise pointer-events-auto max-w-md rounded-2xl border px-4 py-3 text-sm shadow-lift", t.kind === "error" ? "border-destructive/40 bg-card text-destructive" : "border-border bg-card")}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
