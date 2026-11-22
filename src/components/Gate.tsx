import { useEffect, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button, Input } from "./ui";

// SHA-256 of the access password. The password itself is not stored in the code.
// To change it: run  echo -n 'new password' | sha256sum  and paste the result here.
const PASSWORD_HASH = "534265cf7aa1134a54d3e432497598e433f7cc292383526cb114900b441dbc0d";
const KEY = "seamsheet.unlocked";

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function wasUnlocked(): boolean {
  try { return localStorage.getItem(KEY) === PASSWORD_HASH; } catch { return false; }
}

export function Gate({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(wasUnlocked);
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!ok) document.title = "Studio locked"; }, [ok]);
  if (ok) return <>{children}</>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if ((await sha256(value)) === PASSWORD_HASH) {
        try { localStorage.setItem(KEY, PASSWORD_HASH); } catch { /* private mode: stays unlocked for this visit only */ }
        setOk(true);
      } else {
        setError(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-card">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary"><Lock className="size-5" /></div>
        <h1 className="mt-4 text-center text-xl font-semibold">Studio is locked</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">Enter the password to continue.</p>
        <Input type="password" autoFocus autoComplete="current-password" value={value} aria-label="Password" placeholder="Password" className="mt-5"
          onChange={(e) => { setValue(e.target.value); setError(false); }} />
        {error && <p role="alert" className="mt-2 text-sm text-destructive">Wrong password.</p>}
        <Button type="submit" className="mt-4 w-full" disabled={busy || !value}>Unlock</Button>
      </form>
    </main>
  );
}
