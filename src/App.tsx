import { useRef, useState } from "react";
import { Boxes, FileText, Images, Menu, Palette, Pencil, Plus, Ruler, Scissors, Settings, Shirt, Tag, Trash2, Upload } from "lucide-react";
import { cn } from "./lib/cn";
import { deleteProject, listProjects, useLive, type Project } from "./lib/db";
import { restoreBackup } from "./lib/backup";
import { useRoute } from "./lib/route";
import type { Section } from "./model/techpack";
import { BrandMark, RiotAvatar } from "./components/Riot";
import { ProjectDialog, SettingsDialog } from "./components/Dialogs";
import { ProjectView } from "./components/sections/ProjectView";
import { Button, NativeSelect, Toaster, toast } from "./components/ui";

const NAV: { key: Section; label: string; icon: typeof Images }[] = [
  { key: "mockups", label: "Mockup Generator", icon: Images },
  { key: "sizing", label: "Sizing", icon: Ruler },
  { key: "fabrics", label: "Fabrics & Trims", icon: Boxes },
  { key: "construction", label: "Construction", icon: Scissors },
  { key: "colors", label: "Colors & Artwork", icon: Palette },
  { key: "labels", label: "Labels & Packing", icon: Tag },
  { key: "fit", label: "Fit & Samples", icon: Shirt },
  { key: "summary", label: "Project Summary", icon: FileText },
];

export default function App() {
  const { data: projects, loading } = useLive(listProjects, [], [] as Project[]);
  const [route, go] = useRoute();
  const [dialog, setDialog] = useState<null | "new" | "edit" | "settings">(null);
  const [menu, setMenu] = useState(false);
  const restoreRef = useRef<HTMLInputElement>(null);

  const project = projects.find((p) => p.id === route.projectId) ?? projects[0];
  const section = route.section;

  async function onDelete(p: Project) {
    if (!window.confirm(`Delete "${p.styleName}" and all its images and tech pack data? This can't be undone. Export a backup first if you might want it back.`)) return;
    await deleteProject(p.id);
    go({ projectId: null });
    toast.success("Project deleted.");
  }

  const sidebar = (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <div className="px-1 pt-1"><BrandMark /></div>
      <div className="space-y-2">
        <p className="eyebrow px-1">Project</p>
        {project ? (
          <div className="flex items-center gap-1.5">
            <NativeSelect aria-label="Project" value={project.id} onChange={(e) => { go({ projectId: e.target.value }); setMenu(false); }} className="h-9 min-w-0 flex-1">
              {projects.map((p) => <option key={p.id} value={p.id}>{p.styleName}</option>)}
            </NativeSelect>
            <Button variant="ghost" size="icon" aria-label="Edit project details" title="Edit details" onClick={() => setDialog("edit")}><Pencil /></Button>
            <Button variant="ghost" size="icon" aria-label="Delete project" title="Delete project" onClick={() => void onDelete(project)}><Trash2 /></Button>
          </div>
        ) : (
          <p className="px-1 text-sm text-muted-foreground">No projects yet.</p>
        )}
        <Button variant="outline" className="w-full justify-start rounded-xl" onClick={() => { setDialog("new"); setMenu(false); }}><Plus /> New project</Button>
      </div>
      <nav aria-label="Tech pack sections" className="space-y-0.5">
        <p className="eyebrow px-1 pb-1">Tech pack</p>
        {NAV.map(({ key, label, icon: Icon }) => (
          <button key={key} disabled={!project} aria-current={section === key ? "page" : undefined}
            onClick={() => { go({ projectId: project?.id ?? null, section: key }); setMenu(false); }}
            className={cn("flex h-9 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-medium transition-colors disabled:opacity-40", section === key ? "bg-primary-soft text-primary" : "hover:bg-accent")}>
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </nav>
      <div className="mt-auto space-y-1 border-t border-border pt-3">
        <Button variant="ghost" className="w-full justify-start rounded-xl" onClick={() => { setDialog("settings"); setMenu(false); }}><Settings /> Settings & backup</Button>
        <p className="px-3 text-[0.6875rem] text-muted-foreground">Saved on this device. No account, no server.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh md:pl-72">
      <aside data-app-chrome className={cn("fixed inset-y-0 left-0 z-40 w-72 border-r border-border bg-sidebar transition-transform md:translate-x-0", menu ? "translate-x-0" : "-translate-x-full")}>{sidebar}</aside>
      {menu && <button aria-label="Close menu" data-app-chrome className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setMenu(false)} />}

      <main>
        <div data-app-chrome className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur md:hidden">
          <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setMenu(true)}><Menu /></Button>
          <span className="truncate text-sm font-medium">{project?.styleName ?? "SeamSheet Studio"}</span>
        </div>

        {loading ? (
          <div className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-8"><div className="shimmer h-10 w-64 rounded-xl" /></div>
        ) : project ? (
          <ProjectView key={project.id} project={project} section={section} onGo={(s) => go({ projectId: project.id, section: s })} onOpenSettings={() => setDialog("settings")} />
        ) : (
          <div className="flex min-h-[80dvh] flex-col items-center justify-center px-6 text-center">
            <RiotAvatar size="lg" />
            <h1 className="editorial-title mt-5 text-3xl">Start your first style.</h1>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">One project per style. Turn a photo into mockups, then build the full tech pack. Everything stays on this device.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button size="lg" className="rounded-full" onClick={() => setDialog("new")}><Plus /> New project</Button>
              <Button size="lg" variant="outline" className="rounded-full" onClick={() => restoreRef.current?.click()}><Upload /> Restore a backup</Button>
              <input ref={restoreRef} type="file" accept=".zip,application/zip" className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  try { const r = await restoreBackup(f); toast.success(`Restored ${r.projects} project${r.projects === 1 ? "" : "s"}.`); }
                  catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't restore that file."); }
                }} />
            </div>
          </div>
        )}
      </main>

      <ProjectDialog open={dialog === "new"} onClose={() => setDialog(null)} onSaved={(id) => go({ projectId: id, section: "mockups" })} />
      <ProjectDialog open={dialog === "edit"} project={project} onClose={() => setDialog(null)} onSaved={() => {}} />
      <SettingsDialog open={dialog === "settings"} onClose={() => setDialog(null)} />
      <Toaster />
    </div>
  );
}
