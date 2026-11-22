import { useMemo } from "react";
import { Check, Circle, Printer } from "lucide-react";
import { Button } from "../ui";
import { listViews, useBlobUrls, useLive, type View } from "../../lib/db";
import { groupGenerations, pickPinnableViews } from "../../lib/generations";
import { viewKey, viewLabel } from "../../model/views";
import { calloutsForView, gradeRow, sectionStatuses, type Section } from "../../model/techpack";
import { PinnedFigure } from "./callouts";
import { Panel, SectionShell } from "./ui";
import type { SectionProps } from "./sections";

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Nothing entered.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[0.8125rem]">
        <thead>
          <tr>{head.map((h) => <th key={h} className="border-b border-border px-2 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="break-inside-avoid">
              {r.map((c, j) => <td key={j} className="border-b border-border/60 px-2 py-1.5 align-top">{c || <span className="text-muted-foreground">–</span>}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid-page">
      <h2 className="mb-2 border-b-2 border-foreground pb-1 text-sm font-bold uppercase tracking-[0.12em]">{title}</h2>
      {children}
    </section>
  );
}

const Note = ({ text }: { text: string }) => (text.trim() ? <p className="mt-2 whitespace-pre-wrap text-[0.8125rem] text-muted-foreground">{text}</p> : null);

export function SummarySection({ project, tp, badge, onGo }: SectionProps & { onGo: (s: Section) => void }) {
  const { data: views } = useLive(() => listViews(project.id), [project.id], [] as View[]);
  // Newest generation that actually produced images.
  const latest = useMemo(
    () => groupGenerations(views).find((g) => g.views.some((v) => v.status === "done" && v.imageId)),
    [views],
  );
  const shown = latest?.views.filter((v) => v.status === "done" && v.imageId) ?? [];
  // Drawings that carry callout pins, in sheet order, each with its numbered pins.
  const pinned = useMemo(
    () => pickPinnableViews(views).map((v) => ({ v, pins: calloutsForView(tp.construction, viewKey(v.viewType, v.detailName)) })).filter((x) => x.pins.length > 0),
    [views, tp.construction],
  );
  const urls = useBlobUrls([...shown.map((v) => v.imageId), ...pinned.map((x) => x.v.imageId), project.originalImageId]);
  const statuses = sectionStatuses(tp);
  const z = tp.sizing;
  const baseSize = z.sizes.includes(z.baseSize) ? z.baseSize : z.sizes[Math.floor((z.sizes.length - 1) / 2)] ?? "";
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  return (
    <SectionShell
      title="Project Summary"
      description="Everything from this style on one sheet. Print it or save as PDF to send to your factory."
      badge={badge}
      actions={<Button className="rounded-full" onClick={() => window.print()}><Printer /> Print / Save PDF</Button>}
    >
      <Panel title="Completeness" className="print:hidden">
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {statuses.map((s) => (
            <li key={s.key}>
              <button onClick={() => onGo(s.key)} className="flex w-full items-center gap-3 rounded-2xl border border-border px-3 py-2.5 text-left transition-colors hover:bg-accent">
                {s.done ? <Check className="size-4 shrink-0 text-success" /> : <Circle className="size-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{s.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {!latest && (
          <p className="mt-3 text-xs text-muted-foreground">
            No mockups yet. <button className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => onGo("mockups")}>Generate views</button> to include them on the sheet.
          </p>
        )}
      </Panel>

      <article className="space-y-7 rounded-3xl border border-border bg-card p-6 shadow-card print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-8" aria-label="Tech pack sheet">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="eyebrow">Tech pack</p>
            <h2 className="editorial-title mt-1 text-3xl">{project.styleName}</h2>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-[0.8125rem]">
            {([
              ["Style no.", project.styleNumber],
              ["Season", project.season],
              ["Brand", project.brand],
              ["Garment", project.garmentType],
              ["Date", today],
            ] as const).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>
            ))}
          </dl>
        </header>

        {(shown.length > 0 || project.originalImageId) && (
          <Block title="Views">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {project.originalImageId && urls[project.originalImageId] && (
                <figure className="break-inside-avoid"><img src={urls[project.originalImageId]} alt="Original photo" className="aspect-[4/5] w-full rounded-xl border border-border bg-factory object-contain" /><figcaption className="mt-1 text-center text-xs text-muted-foreground">Reference photo</figcaption></figure>
              )}
              {shown.map((v) => v.imageId && urls[v.imageId] && (
                <figure key={v.id} className="break-inside-avoid"><img src={urls[v.imageId]} alt={viewLabel(v.viewType, v.detailName)} className="aspect-[4/5] w-full rounded-xl border border-border bg-factory object-contain" /><figcaption className="mt-1 text-center text-xs text-muted-foreground">{viewLabel(v.viewType, v.detailName)}{v.isInferred ? " (inferred)" : ""}</figcaption></figure>
              ))}
            </div>
            {shown.some((v) => v.isInferred) && <p className="mt-2 text-xs text-muted-foreground">Views marked inferred were not visible in the photo; confirm them against a sample.</p>}
          </Block>
        )}

        <Block title={`Sizing (${z.unit})`}>
          <Table
            head={["Code", "Point of measure", "Tol.", ...z.sizes.map((s) => (s === baseSize ? `${s} (base)` : s))]}
            rows={z.rows.filter((r) => r.name || r.base).map((r) => [r.code, r.name, r.tolerance, ...gradeRow(r, z.sizes, baseSize, z.unit)])}
          />
          <Note text={z.notes} />
        </Block>

        <Block title="Fabrics & trims">
          <Table head={["Type", "Description", "Composition", "Weight", "Colour", "Supplier", "Used on", "Qty"]} rows={tp.fabrics.rows.map((r) => [r.kind, r.name, r.composition, r.weight, r.color, r.supplier, r.placement, r.consumption])} />
          <Note text={tp.fabrics.notes} />
        </Block>

        <Block title="Construction">
          {pinned.length > 0 && (
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {pinned.map(({ v, pins }) => v.imageId && urls[v.imageId] && (
                <PinnedFigure key={v.id} url={urls[v.imageId]!} label={viewLabel(v.viewType, v.detailName)} pins={pins} />
              ))}
            </div>
          )}
          <Table head={["#", "Area", "Seam", "Stitch", "SPI", "Notes"]} rows={tp.construction.rows.map((r, i) => [String(i + 1), r.area, r.seam, r.stitch, r.spi, r.notes])} />
          <Note text={tp.construction.notes} />
        </Block>

        <Block title="Colours">
          <div className="space-y-1">
            {tp.colors.colorways.length === 0 && <p className="text-sm text-muted-foreground">Nothing entered.</p>}
            {tp.colors.colorways.map((c) => (
              <div key={c.id} className="flex items-start gap-3 border-b border-border/60 py-1.5 text-[0.8125rem] break-inside-avoid">
                <span className="mt-0.5 size-5 shrink-0 rounded-md border border-border" style={{ background: /^#[0-9a-f]{3,8}$/i.test(c.hex) ? c.hex : "transparent" }} aria-hidden />
                <span className="w-40 font-medium">{c.name || "–"}</span>
                <span className="w-32 text-muted-foreground">{c.pantone}</span>
                <span className="w-24 text-muted-foreground">{c.parts}</span>
                <span className="min-w-0 flex-1 text-muted-foreground">{c.notes}</span>
              </div>
            ))}
          </div>
        </Block>

        <Block title="Artwork">
          <Table head={["Artwork", "Technique", "Placement", "Size", "Colours", "Notes"]} rows={tp.colors.artwork.map((r) => [r.name, r.technique, r.placement, r.size, r.colors, r.notes])} />
        </Block>

        <Block title="Labels & packing">
          <Table head={["Label", "Content", "Placement", "Material"]} rows={tp.labels.labels.map((r) => [r.type, r.content, r.placement, r.material])} />
          {Object.values(tp.labels.packing).some((v) => v) && (
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-[0.8125rem] sm:grid-cols-2">
              {([["Fold", tp.labels.packing.fold], ["Polybag", tp.labels.packing.polybag], ["Hangtag", tp.labels.packing.hangtag], ["Barcode / SKU", tp.labels.packing.barcode], ["Units per carton", tp.labels.packing.cartonQty]] as const)
                .filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex gap-2"><dt className="w-28 shrink-0 text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}
            </dl>
          )}
          <Note text={tp.labels.packing.notes} />
        </Block>

        <Block title="Fit & samples">
          <Table head={["Stage", "Requested", "Received", "Status", "Comments"]} rows={tp.fit.samples.map((r) => [r.stage, r.requested, r.received, r.status, r.comments])} />
          {tp.fit.fitNotes.length > 0 && (
            <div className="mt-4"><Table head={["Area", "Issue", "Correction", "Status"]} rows={tp.fit.fitNotes.map((r) => [r.area, r.issue, r.correction, r.status])} /></div>
          )}
        </Block>

        {project.notes && <Block title="Project notes"><Note text={project.notes} /></Block>}
      </article>
    </SectionShell>
  );
}
