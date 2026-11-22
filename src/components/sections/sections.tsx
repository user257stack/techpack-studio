import { Sparkles } from "lucide-react";
import { Button, Input, NativeSelect, toast } from "../ui";
import type { Project } from "../../lib/db";
import { readAnalysis } from "../../model/analysis";
import {
  SAMPLE_STAGES, SAMPLE_STATUS, SEAM_PRESETS, SIZE_PRESETS, STANDARD_POMS, gradeRow, materialKinds,
  newId, prefillFromAnalysis, pruneCallouts, type Section, type Techpack,
} from "../../model/techpack";
import { CalloutBoard } from "./callouts";
import { Field, NotesField, Panel, RowTable, SectionShell } from "./ui";

export interface SectionProps {
  project: Project;
  tp: Techpack;
  update: <K extends keyof Techpack>(key: K, value: Techpack[K]) => void;
  replace: (tp: Techpack) => void;
  badge: React.ReactNode;
}

function PrefillButton({ project, tp, replace }: Pick<SectionProps, "project" | "tp" | "replace">) {
  const analysis = readAnalysis(project.analysis);
  return (
    <Button
      variant="outline"
      className="rounded-full"
      disabled={!analysis}
      title={analysis ? undefined : "Generate mockups first so Riot can read the garment"}
      onClick={() => {
        if (!analysis) return;
        const { techpack, added } = prefillFromAnalysis(tp, analysis);
        if (!added.length) return void toast("Nothing to add. Sections that already have rows are left alone.");
        replace(techpack);
        toast.success(`Added ${added.join(", ")} from Riot's reading of your photo. Check each one.`);
      }}
    >
      <Sparkles /> Prefill from photo
    </Button>
  );
}

// ------------------------------------------------------------------------------- sizing
export function SizingSection({ tp, update, badge }: SectionProps) {
  const z = tp.sizing;
  const set = (patch: Partial<typeof z>) => update("sizing", { ...z, ...patch });
  const baseSize = z.sizes.includes(z.baseSize) ? z.baseSize : z.sizes[Math.floor((z.sizes.length - 1) / 2)] ?? "";
  const presetName = Object.entries(SIZE_PRESETS).find(([, v]) => v.join() === z.sizes.join())?.[0] ?? "custom";
  const setSizes = (sizes: string[]) => set({ sizes, baseSize: sizes[Math.floor((sizes.length - 1) / 2)] ?? "" });

  return (
    <SectionShell
      title="Sizing"
      description="Points of measure with tolerance and grading. Enter the measurement at your base size and how much it changes per size; every other size is worked out for you."
      badge={badge}
    >
      <Panel title="Size range">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Preset">
            <NativeSelect value={presetName} onChange={(e) => { const preset = SIZE_PRESETS[e.target.value]; if (preset) setSizes(preset); }}>
              {Object.keys(SIZE_PRESETS).map((k) => <option key={k} value={k}>{k}</option>)}
              <option value="custom">Custom</option>
            </NativeSelect>
          </Field>
          <Field label="Sizes (comma separated)" className="sm:col-span-2">
            <Input
              key={z.sizes.join()}
              defaultValue={z.sizes.join(", ")}
              
              onBlur={(e) => {
                const sizes = Array.from(new Set(e.target.value.split(",").map((x) => x.trim()).filter(Boolean))).slice(0, 14);
                if (sizes.length) setSizes(sizes);
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Base size">
              <NativeSelect value={baseSize} onChange={(e) => set({ baseSize: e.target.value })}>
                {z.sizes.map((s) => <option key={s} value={s}>{s}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Unit">
              <NativeSelect value={z.unit} onChange={(e) => set({ unit: e.target.value as "cm" | "in" })}>
                <option value="cm">cm</option>
                <option value="in">in</option>
              </NativeSelect>
            </Field>
          </div>
        </div>
      </Panel>

      <Panel title="Points of measure" hint={`All measurements in ${z.unit}. Fractions like 52 1/2 are fine.`}>
        <RowTable
          columns={[
            { key: "code", label: "Code", className: "w-16" },
            { key: "name", label: "Point of measure", type: "wide", placeholder: "Chest" },
            { key: "tolerance", label: "Tol.", className: "w-20", placeholder: "±1" },
            { key: "base", label: `Base (${baseSize || "–"})`, className: "w-24" },
            { key: "grade", label: "Grade / size", className: "w-24" },
          ]}
          rows={z.rows}
          onChange={(rows) => set({ rows })}
          makeRow={() => ({ code: "", name: "", base: "", tolerance: "", grade: "" })}
          addLabel="Add measurement"
          empty="No measurements yet. Add your own or start from the standard set."
          extraHeads={z.sizes}
          extraCells={(r) => gradeRow(r, z.sizes, baseSize, z.unit).map((v, i) => (
            <span key={i} className={z.sizes[i] === baseSize ? "font-semibold text-foreground" : undefined}>{v || "–"}</span>
          ))}
          afterAdd={
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => {
                const have = new Set(z.rows.map((r) => r.name.trim().toLowerCase()));
                const add = STANDARD_POMS.filter((p) => !have.has(p.name.toLowerCase())).map((p) => ({ id: newId(), ...p, base: "" }));
                if (!add.length) return void toast("The standard set is already in the table.");
                set({ rows: [...z.rows, ...add], baseSize });
                toast.success(`Added ${add.length} standard measurements. Fill in the base values; tolerances and grades are typical starting points for tops, so adjust them for your piece.`);
              }}
            >
              Add standard measurements
            </Button>
          }
        />
      </Panel>
      <NotesField value={z.notes} onChange={(notes) => set({ notes })} placeholder="How to measure, stretch allowances, shrinkage, wash tolerance…" />
    </SectionShell>
  );
}

// ------------------------------------------------------------------------------- fabrics
export function FabricsSection(p: SectionProps) {
  const f = p.tp.fabrics;
  const set = (patch: Partial<typeof f>) => p.update("fabrics", { ...f, ...patch });
  return (
    <SectionShell
      title="Fabrics & Trims"
      description="Every material that goes into the garment: fabric, lining, thread, zips, buttons and hardware."
      badge={p.badge}
      actions={<PrefillButton project={p.project} tp={p.tp} replace={p.replace} />}
    >
      <Panel title="Bill of materials">
        <RowTable
          columns={[
            { key: "kind", label: "Type", suggestions: materialKinds, className: "w-40", placeholder: "Main fabric" },
            { key: "name", label: "Description", type: "wide", placeholder: "Brushed cotton fleece" },
            { key: "composition", label: "Composition", placeholder: "80% cotton 20% poly", type: "wide" },
            { key: "weight", label: "Weight", className: "w-24", placeholder: "380 gsm" },
            { key: "color", label: "Colour", className: "w-28" },
            { key: "supplier", label: "Supplier / ref", className: "w-32" },
            { key: "placement", label: "Used on", className: "w-28", placeholder: "Body" },
            { key: "consumption", label: "Consumption", className: "w-28", placeholder: "1.6 m" },
          ]}
          rows={f.rows}
          onChange={(rows) => set({ rows })}
          makeRow={() => ({ kind: "", name: "", composition: "", weight: "", color: "", supplier: "", placement: "", consumption: "" })}
          addLabel="Add material"
          empty="No materials yet."
        />
      </Panel>
      <NotesField value={f.notes} onChange={(notes) => set({ notes })} placeholder="Handfeel, shrinkage, testing requirements, alternatives…" />
    </SectionShell>
  );
}

// -------------------------------------------------------------------------- construction
export function ConstructionSection(p: SectionProps & { onGo: (s: Section) => void }) {
  const c = p.tp.construction;
  const set = (patch: Partial<typeof c>) => p.update("construction", { ...c, ...patch });
  return (
    <SectionShell
      title="Construction"
      description="How each seam and finish is sewn: seam type, stitch, stitches per inch and any special instructions. Pin each one on your drawing to give the factory numbered callouts."
      badge={p.badge}
      actions={<PrefillButton project={p.project} tp={p.tp} replace={p.replace} />}
    >
      <Panel title="Seams & finishes" hint="The # is the callout number shown on the drawing below.">
        <RowTable
          numbered
          columns={[
            { key: "area", label: "Area", suggestions: SEAM_PRESETS, className: "w-40", placeholder: "Side seam" },
            { key: "seam", label: "Seam type", placeholder: "4-thread overlock", type: "wide" },
            { key: "stitch", label: "Stitch", className: "w-32", placeholder: "Topstitch" },
            { key: "spi", label: "SPI", className: "w-16", placeholder: "10" },
            { key: "notes", label: "Notes", type: "wide", placeholder: "Bartack at pocket corners" },
          ]}
          rows={c.rows}
          onChange={(rows) => set({ rows, callouts: pruneCallouts(c.callouts, rows) })}
          makeRow={() => ({ area: "", seam: "", stitch: "", spi: "", notes: "" })}
          addLabel="Add detail"
          empty="No construction details yet."
          afterAdd={
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => {
                const have = new Set(c.rows.map((r) => r.area.trim().toLowerCase()));
                const add = SEAM_PRESETS.filter((a) => !have.has(a.toLowerCase())).map((area) => ({ id: newId(), area, seam: "", stitch: "", spi: "", notes: "" }));
                if (!add.length) return void toast("All the common areas are already in the table.");
                set({ rows: [...c.rows, ...add] });
              }}
            >
              Add common areas
            </Button>
          }
        />
      </Panel>
      <CalloutBoard project={p.project} construction={c} onChange={(callouts) => set({ callouts })} onGo={p.onGo} />
      <NotesField label="General construction notes" value={c.notes} onChange={(notes) => set({ notes })} placeholder="Pressing, thread tension, bartacks, seam allowance…" />
    </SectionShell>
  );
}

// ---------------------------------------------------------------------- colors & artwork
export function ColorsSection(p: SectionProps) {
  const c = p.tp.colors;
  const set = (patch: Partial<typeof c>) => p.update("colors", { ...c, ...patch });
  return (
    <SectionShell
      title="Colors & Artwork"
      description="Colourways with Pantone references, and every print, embroidery or logo with its placement and size."
      badge={p.badge}
      actions={<PrefillButton project={p.project} tp={p.tp} replace={p.replace} />}
    >
      <Panel title="Colourways">
        <RowTable
          columns={[
            { key: "name", label: "Colour name", placeholder: "Jet black" },
            { key: "pantone", label: "Pantone / ref", className: "w-36", placeholder: "19-0303 TCX" },
            { key: "hex", label: "Swatch", type: "color", className: "w-44" },
            { key: "parts", label: "Used on", className: "w-32", placeholder: "Body" },
            { key: "notes", label: "Notes", type: "wide" },
          ]}
          rows={c.colorways}
          onChange={(colorways) => set({ colorways })}
          makeRow={() => ({ name: "", pantone: "", hex: "", parts: "", notes: "" })}
          addLabel="Add colour"
          empty="No colours yet."
        />
      </Panel>
      <Panel title="Artwork & embellishment">
        <RowTable
          columns={[
            { key: "name", label: "Artwork", type: "wide", placeholder: "Chest logo" },
            { key: "technique", label: "Technique", className: "w-36", placeholder: "Embroidery" },
            { key: "placement", label: "Placement", className: "w-40", placeholder: "Left chest, 8 cm from HPS" },
            { key: "size", label: "Size", className: "w-28", placeholder: "7 × 3 cm" },
            { key: "colors", label: "Colours", className: "w-32" },
            { key: "notes", label: "Notes", type: "wide" },
          ]}
          rows={c.artwork}
          onChange={(artwork) => set({ artwork })}
          makeRow={() => ({ name: "", technique: "", placement: "", size: "", colors: "", notes: "" })}
          addLabel="Add artwork"
          empty="No artwork yet."
        />
      </Panel>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------- labels & packing
const LABEL_TYPES = ["Main label", "Care label", "Size label", "Hangtag", "Woven flag", "Heat transfer", "Country of origin", "Barcode sticker"];

export function LabelsSection(p: SectionProps) {
  const l = p.tp.labels;
  const set = (patch: Partial<typeof l>) => p.update("labels", { ...l, ...patch });
  const pk = (patch: Partial<typeof l.packing>) => set({ packing: { ...l.packing, ...patch } });
  return (
    <SectionShell
      title="Labels & Packing"
      description="Every label and where it sits, then how the finished garment is folded, bagged and cartoned."
      badge={p.badge}
    >
      <Panel title="Labels & tags">
        <RowTable
          columns={[
            { key: "type", label: "Label", suggestions: LABEL_TYPES, className: "w-40", placeholder: "Main label" },
            { key: "content", label: "Content", type: "wide", placeholder: "EASYDE woven logo, white on black" },
            { key: "placement", label: "Placement", className: "w-44", placeholder: "Centre back neck, 2 cm below seam" },
            { key: "material", label: "Material", className: "w-32", placeholder: "Woven damask" },
          ]}
          rows={l.labels}
          onChange={(labels) => set({ labels })}
          makeRow={() => ({ type: "", content: "", placement: "", material: "" })}
          addLabel="Add label"
          empty="No labels yet."
        />
      </Panel>
      <Panel title="Packing">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fold method"><Input value={l.packing.fold} onChange={(e) => pk({ fold: e.target.value })} placeholder="Fold in thirds, logo facing up"  /></Field>
          <Field label="Polybag"><Input value={l.packing.polybag} onChange={(e) => pk({ polybag: e.target.value })} placeholder="Self-seal, 30 × 40 cm, suffocation warning"  /></Field>
          <Field label="Hangtag"><Input value={l.packing.hangtag} onChange={(e) => pk({ hangtag: e.target.value })} placeholder="Attach with plastic loop at side seam"  /></Field>
          <Field label="Barcode / SKU"><Input value={l.packing.barcode} onChange={(e) => pk({ barcode: e.target.value })}  /></Field>
          <Field label="Units per carton"><Input value={l.packing.cartonQty} onChange={(e) => pk({ cartonQty: e.target.value })} placeholder="24, solid sizes"  /></Field>
        </div>
        <div className="mt-4"><NotesField label="Packing notes" value={l.packing.notes} onChange={(notes) => pk({ notes })} /></div>
      </Panel>
    </SectionShell>
  );
}

// ------------------------------------------------------------------------ fit & samples
export function FitSection(p: SectionProps) {
  const f = p.tp.fit;
  const set = (patch: Partial<typeof f>) => p.update("fit", { ...f, ...patch });
  return (
    <SectionShell
      title="Fit & Samples"
      description="Track each sample round and keep the fit comments and corrections that came out of it."
      badge={p.badge}
    >
      <Panel title="Sample tracker">
        <RowTable
          columns={[
            { key: "stage", label: "Stage", suggestions: SAMPLE_STAGES, className: "w-44", placeholder: "Proto" },
            { key: "requested", label: "Requested", type: "date", className: "w-40" },
            { key: "received", label: "Received", type: "date", className: "w-40" },
            { key: "status", label: "Status", suggestions: SAMPLE_STATUS, className: "w-32" },
            { key: "comments", label: "Comments", type: "wide" },
          ]}
          rows={f.samples}
          onChange={(samples) => set({ samples })}
          makeRow={() => ({ stage: "", requested: "", received: "", status: "Planned", comments: "" })}
          addLabel="Add sample"
          empty="No samples yet."
        />
      </Panel>
      <Panel title="Fit comments & corrections">
        <RowTable
          columns={[
            { key: "area", label: "Area", className: "w-40", placeholder: "Sleeve" },
            { key: "issue", label: "Issue", type: "wide", placeholder: "Too tight at bicep" },
            { key: "correction", label: "Correction", type: "wide", placeholder: "Add 1 cm at bicep" },
            { key: "status", label: "Status", className: "w-32", suggestions: ["Open", "Fixed", "Verified"], placeholder: "Open" },
          ]}
          rows={f.fitNotes}
          onChange={(fitNotes) => set({ fitNotes })}
          makeRow={() => ({ area: "", issue: "", correction: "", status: "Open" })}
          addLabel="Add comment"
          empty="No fit comments yet."
        />
      </Panel>
    </SectionShell>
  );
}
