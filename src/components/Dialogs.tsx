import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, Loader2, ShieldAlert, Upload, XCircle } from "lucide-react";
import { createProject, updateProject, type Project } from "../lib/db";
import { downloadBackup, requestPersistence, restoreBackup } from "../lib/backup";
import { testConnection } from "../lib/gemini";
import { DEFAULT_SETTINGS, saveSettings, useSettings } from "../lib/settings";
import { Button, Input, Label, Modal, toast } from "./ui";

const EMPTY = { styleName: "", styleNumber: "", season: "", brand: "", garmentType: "" };

/** Create a project, or edit one when `project` is given. */
export function ProjectDialog({ open, onClose, project, onSaved }: { open: boolean; onClose: () => void; project?: Project; onSaved: (id: string) => void }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setForm(project ? { styleName: project.styleName, styleNumber: project.styleNumber, season: project.season, brand: project.brand, garmentType: project.garmentType } : EMPTY);
  }, [open, project]);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (project) {
        await updateProject(project.id, { ...form, styleName: form.styleName.trim() || "Untitled style" });
        onSaved(project.id);
      } else {
        const p = await createProject(form);
        void requestPersistence(); // ask the browser not to evict our data
        toast.success("Project ready. Drop in a photo and I'll get to work.");
        onSaved(p.id);
      }
      onClose();
    } catch {
      toast.error("Couldn't save the project. Your browser may be blocking local storage.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={project ? "Project details" : "New project"} description="One style per project. You can leave anything blank for now.">
      <form onSubmit={submit} className="grid gap-4">
        <F id="sn" label="Style name"><Input id="sn" autoFocus value={form.styleName} onChange={set("styleName")} placeholder="Drop One Hoodie" /></F>
        <div className="grid grid-cols-2 gap-3">
          <F id="no" label="Style number"><Input id="no" value={form.styleNumber} onChange={set("styleNumber")} placeholder="E-001" /></F>
          <F id="se" label="Season"><Input id="se" value={form.season} onChange={set("season")} placeholder="SS27" /></F>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <F id="br" label="Brand"><Input id="br" value={form.brand} onChange={set("brand")} /></F>
          <F id="gt2" label="Garment type"><Input id="gt2" value={form.garmentType} onChange={set("garmentType")} placeholder="Hoodie" /></F>
        </div>
        <Button type="submit" size="lg" className="mt-1 rounded-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />} {project ? "Save" : "Create project"}</Button>
      </form>
    </Modal>
  );
}

const F = ({ id, label, children }: { id: string; label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{children}</div>
);

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const current = useSettings();
  const [form, setForm] = useState(current);
  const [test, setTest] = useState<"idle" | "testing" | "ok" | { error: string }>("idle");
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm(current);
    setTest("idle");
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dirty = form.apiKey !== current.apiKey || form.visionModel !== current.visionModel || form.imageModel !== current.imageModel;

  async function runTest() {
    setTest("testing");
    try {
      await testConnection({ ...form, apiKey: form.apiKey.trim() });
      setTest("ok");
    } catch (err) {
      setTest({ error: err instanceof Error ? err.message : "The test failed." });
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Settings" description="Everything here stays in this browser." wide>
      <div className="space-y-7">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Google AI key (for mockups)</h3>
          <div className="space-y-1.5">
            <Label htmlFor="key">API key</Label>
            <Input id="key" type="password" autoComplete="off" spellCheck={false} value={form.apiKey} onChange={(e) => { setForm({ ...form, apiKey: e.target.value }); setTest("idle"); }} placeholder="Paste your key" />
            <p className="text-xs text-muted-foreground">
              Get one free from <a className="font-medium text-primary underline-offset-4 hover:underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>. Image generation may need billing enabled on your Google account.
            </p>
          </div>
          <div className="flex gap-2 rounded-2xl border border-warning/30 bg-warning-soft p-3 text-xs">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <p>The key is saved in this browser only and sent only to Google. Anyone who can use this browser profile can read it, so don't add it on a shared computer. Photos you generate from are sent to Google to be processed.</p>
          </div>
          <details className="rounded-2xl border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Model names</summary>
            <p className="mt-2 text-xs text-muted-foreground">Google renames models often. If generation stops working with a "model" error, put the current names here.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <F id="vm" label="Reads the photo"><Input id="vm" value={form.visionModel} onChange={(e) => setForm({ ...form, visionModel: e.target.value })} /></F>
              <F id="im" label="Draws the views"><Input id="im" value={form.imageModel} onChange={(e) => setForm({ ...form, imageModel: e.target.value })} /></F>
            </div>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setForm({ ...form, visionModel: DEFAULT_SETTINGS.visionModel, imageModel: DEFAULT_SETTINGS.imageModel })}>Reset to defaults</Button>
          </details>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => { saveSettings(form); toast.success("Settings saved."); onClose(); }} disabled={!dirty} className="rounded-full">Save</Button>
            <Button variant="outline" onClick={runTest} disabled={!form.apiKey.trim() || test === "testing"} className="rounded-full">
              {test === "testing" && <Loader2 className="animate-spin" />} Test key
            </Button>
            {test === "ok" && <span className="inline-flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="size-4" /> Key works</span>}
            {typeof test === "object" && <span className="inline-flex items-center gap-1.5 text-sm text-destructive"><XCircle className="size-4 shrink-0" /> {test.error}</span>}
          </div>
        </section>

        <section className="space-y-3 border-t border-border pt-6">
          <h3 className="text-sm font-semibold">Backup & restore</h3>
          <p className="text-sm text-muted-foreground">Your projects and images live in this browser. Clearing site data or switching browser would lose them, so export a backup now and then. A backup never includes your API key.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" disabled={busy !== null}
              onClick={async () => { setBusy("export"); try { await downloadBackup(); } catch { toast.error("Couldn't build the backup."); } finally { setBusy(null); } }}>
              {busy === "export" ? <Loader2 className="animate-spin" /> : <Download />} Export backup
            </Button>
            <Button variant="outline" className="rounded-full" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
              {busy === "import" ? <Loader2 className="animate-spin" /> : <Upload />} Restore from backup
            </Button>
            <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setBusy("import");
                try {
                  const r = await restoreBackup(f);
                  toast.success(`Restored ${r.projects} project${r.projects === 1 ? "" : "s"} and ${r.images} image${r.images === 1 ? "" : "s"}.`);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Couldn't restore that file.");
                } finally {
                  setBusy(null);
                }
              }} />
          </div>
          <p className="text-xs text-muted-foreground">
            {persisted === true ? "This browser has promised to keep your data." : persisted === false ? (
              <>The browser may clear your data if disk space runs low. <button className="font-medium text-primary underline-offset-4 hover:underline" onClick={async () => setPersisted(await requestPersistence())}>Ask it not to</button>, and keep backups.</>
            ) : "Storage protection status isn't available in this browser."}
          </p>
        </section>
      </div>
    </Modal>
  );
}
