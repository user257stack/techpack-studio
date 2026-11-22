// Tech pack data model. Pure (no I/O) so it stays testable; the studio stores one of these
// per project in projects.techpack (jsonb) and every field is optional on disk.
import { z } from "zod";
import type { GarmentAnalysis } from "./analysis";

const s = z.string().catch("");
const id = z.string().catch(() => newId());

export const newId = () => Math.random().toString(36).slice(2, 10);

const DEFAULT_SIZES = ["XS", "S", "M", "L", "XL"];

export const SIZE_PRESETS: Record<string, string[]> = {
  "XS – XL": DEFAULT_SIZES,
  "S – XXL": ["S", "M", "L", "XL", "XXL"],
  "XS – XXL": ["XS", "S", "M", "L", "XL", "XXL"],
  "Numeric 6 – 14": ["6", "8", "10", "12", "14"],
  "One size": ["OS"],
};

export const sizingSchema = z.object({
  unit: z.enum(["cm", "in"]).catch("cm"),
  sizes: z.array(z.string()).catch(DEFAULT_SIZES),
  baseSize: s,
  rows: z
    .array(
      z.object({
        id,
        code: s,
        name: s,
        base: s, // measurement at the base size, kept as text so "52.5" and "52 1/2" both survive typing
        tolerance: s,
        grade: s, // change per size step
      }),
    )
    .catch([]),
  notes: s,
});

export const materialKinds = [
  "Main fabric", "Contrast fabric", "Lining", "Interlining", "Rib / trim fabric", "Thread",
  "Zipper", "Button", "Snap / hardware", "Drawcord", "Elastic", "Other trim",
] as const;

export const fabricsSchema = z.object({
  rows: z
    .array(
      z.object({
        id,
        kind: s,
        name: s,
        composition: s,
        weight: s,
        color: s,
        supplier: s,
        placement: s,
        consumption: s,
      }),
    )
    .catch([]),
  notes: s,
});

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * A numbered pin on a drawing. `view` is a view key ("front", "back", "detail:collar"), not a view id,
 * so pins survive regenerating the flat. `rowId` points at a construction row; the number shown on the
 * pin is that row's position in the table, so the pin and the table can never disagree.
 */
export const calloutSchema = z.object({
  id,
  view: s,
  rowId: s,
  x: z.number().catch(0.5).transform(clamp01), // 0..1 across the image
  y: z.number().catch(0.5).transform(clamp01), // 0..1 down the image
});

export const constructionSchema = z.object({
  rows: z
    .array(z.object({ id, area: s, seam: s, stitch: s, spi: s, notes: s }))
    .catch([]),
  notes: s,
  callouts: z.array(calloutSchema).catch([]),
});

export type Callout = z.infer<typeof calloutSchema>;

export const colorsSchema = z.object({
  colorways: z
    .array(z.object({ id, name: s, pantone: s, hex: s, parts: s, notes: s }))
    .catch([]),
  artwork: z
    .array(z.object({ id, name: s, technique: s, placement: s, size: s, colors: s, notes: s }))
    .catch([]),
});

export const labelsSchema = z.object({
  labels: z
    .array(z.object({ id, type: s, content: s, placement: s, material: s }))
    .catch([]),
  packing: z
    .object({
      fold: s,
      polybag: s,
      cartonQty: s,
      barcode: s,
      hangtag: s,
      notes: s,
    })
    .catch({ fold: "", polybag: "", cartonQty: "", barcode: "", hangtag: "", notes: "" }),
});

export const SAMPLE_STAGES = ["Proto", "Fit sample", "Size set", "Pre-production", "Top of production"] as const;
export const SAMPLE_STATUS = ["Planned", "Requested", "Received", "Approved", "Rejected"] as const;

export const fitSchema = z.object({
  samples: z
    .array(z.object({ id, stage: s, requested: s, received: s, status: s, comments: s }))
    .catch([]),
  fitNotes: z
    .array(z.object({ id, area: s, issue: s, correction: s, status: s }))
    .catch([]),
});

export const techpackSchema = z.object({
  sizing: sizingSchema.catch(sizingSchema.parse({})),
  fabrics: fabricsSchema.catch(fabricsSchema.parse({})),
  construction: constructionSchema.catch(constructionSchema.parse({})),
  colors: colorsSchema.catch(colorsSchema.parse({})),
  labels: labelsSchema.catch(labelsSchema.parse({})),
  fit: fitSchema.catch(fitSchema.parse({})),
});

export type Techpack = z.infer<typeof techpackSchema>;
export type SectionKey = keyof Techpack;

/** Every page in the studio sidebar, in order. */
export const SECTIONS = ["mockups", "sizing", "fabrics", "construction", "colors", "labels", "fit", "summary"] as const;
export type Section = (typeof SECTIONS)[number];

/** Read whatever is stored (null, partial, or from an older version) into a full Techpack. */
export function readTechpack(raw: unknown): Techpack {
  return techpackSchema.parse(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {});
}

// ---------------------------------------------------------------------------------- sizing

/** Parse "52", "52.5", "52,5" or "52 1/2" into a number. Returns null when it isn't a number. */
export function parseMeasure(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  const mixed = t.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const [, w, a, b] = mixed;
    return Number(b) === 0 ? null : Number(w) + Math.sign(Number(w) || 1) * (Number(a) / Number(b));
  }
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[2]) === 0 ? null : Number(frac[1]) / Number(frac[2]);
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

function fmt(v: number, unit: "cm" | "in") {
  const r = Math.round(v * 100) / 100;
  return unit === "cm" ? String(Math.round(v * 10) / 10) : String(r);
}

/** Measurement of one point of measure at every size, graded from the base size. */
export function gradeRow(
  row: { base: string; grade: string },
  sizes: string[],
  baseSize: string,
  unit: "cm" | "in",
): string[] {
  const base = parseMeasure(row.base);
  const step = parseMeasure(row.grade) ?? 0;
  const baseIdx = Math.max(0, sizes.indexOf(baseSize));
  return sizes.map((_, i) => (base == null ? "" : fmt(base + step * (i - baseIdx), unit)));
}

export const STANDARD_POMS: { code: string; name: string; tolerance: string; grade: string }[] = [
  { code: "A", name: "Chest (1 in below armhole)", tolerance: "±1", grade: "4" },
  { code: "B", name: "Waist", tolerance: "±1", grade: "4" },
  { code: "C", name: "Hem width (relaxed)", tolerance: "±1", grade: "4" },
  { code: "D", name: "Shoulder width", tolerance: "±0.5", grade: "1" },
  { code: "E", name: "Body length (HPS to hem)", tolerance: "±1", grade: "1.5" },
  { code: "F", name: "Sleeve length (CB or shoulder)", tolerance: "±0.5", grade: "1" },
  { code: "G", name: "Bicep", tolerance: "±0.5", grade: "1.5" },
  { code: "H", name: "Cuff opening (relaxed)", tolerance: "±0.5", grade: "0.5" },
  { code: "I", name: "Neck width (seam to seam)", tolerance: "±0.5", grade: "0.5" },
  { code: "J", name: "Front neck drop", tolerance: "±0.3", grade: "0.2" },
];

// ------------------------------------------------------------------------------- callouts

/** The number printed on a pin: the row's place in the construction table, or null if the row is gone. */
export function calloutNumber(rows: { id: string }[], rowId: string): number | null {
  const i = rows.findIndex((r) => r.id === rowId);
  return i < 0 ? null : i + 1;
}

/** Pins on one view that still point at an existing row, with their numbers, lowest number first. */
export function calloutsForView(c: Techpack["construction"], view: string): (Callout & { n: number })[] {
  return c.callouts
    .filter((k) => k.view === view)
    .flatMap((k) => {
      const n = calloutNumber(c.rows, k.rowId);
      return n == null ? [] : [{ ...k, n }];
    })
    .sort((a, b) => a.n - b.n);
}

/** Drops pins whose row was deleted. */
export function pruneCallouts(callouts: Callout[], rows: { id: string }[]): Callout[] {
  const ids = new Set(rows.map((r) => r.id));
  return callouts.filter((k) => ids.has(k.rowId));
}

/** Pins a row on a view. A row has one pin per view, so pinning again moves it (and keeps its id). */
export function placeCallout(callouts: Callout[], view: string, rowId: string, x: number, y: number): Callout[] {
  const at = { x: clamp01(x), y: clamp01(y) };
  const has = callouts.some((k) => k.view === view && k.rowId === rowId);
  return has
    ? callouts.map((k) => (k.view === view && k.rowId === rowId ? { ...k, ...at } : k))
    : [...callouts, { id: newId(), view, rowId, ...at }];
}

export const removeCallout = (callouts: Callout[], id: string): Callout[] => callouts.filter((k) => k.id !== id);

// ---------------------------------------------------------------------------- suggestions

export const SEAM_PRESETS = [
  "Shoulder seam", "Side seam", "Armhole", "Sleeve seam", "Neckline", "Hem", "Cuff", "Pocket attach", "Waistband", "Inseam",
];

/**
 * Starting points taken from Riot's photo analysis. Only fills sections that are still empty so it
 * never overwrites what the designer typed, and returns what it added so the UI can say so.
 */
export function prefillFromAnalysis(tp: Techpack, a: GarmentAnalysis): { techpack: Techpack; added: string[] } {
  const next: Techpack = structuredClone(tp);
  const added: string[] = [];

  if (!next.colors.colorways.length && a.colors.length) {
    next.colors.colorways = a.colors.map((c) => ({ id: newId(), name: c, pantone: "", hex: "", parts: "Body", notes: "" }));
    added.push(`${a.colors.length} colour${a.colors.length > 1 ? "s" : ""}`);
  }
  if (!next.colors.artwork.length && a.prints_logos.length) {
    next.colors.artwork = a.prints_logos
      .filter((p) => p.description)
      .map((p) => ({ id: newId(), name: p.description, technique: "", placement: p.placement, size: "", colors: "", notes: "" }));
    if (next.colors.artwork.length) added.push(`${next.colors.artwork.length} artwork item${next.colors.artwork.length > 1 ? "s" : ""}`);
  }
  if (!next.fabrics.rows.length) {
    const rows: Techpack["fabrics"]["rows"] = [];
    if (a.fabric_appearance) {
      rows.push({ id: newId(), kind: "Main fabric", name: a.fabric_appearance, composition: "", weight: "", color: a.colors[0] ?? "", supplier: "", placement: "Body", consumption: "" });
    }
    for (const c of a.closures) rows.push({ id: newId(), kind: "Other trim", name: c, composition: "", weight: "", color: "", supplier: "", placement: "Closure", consumption: "" });
    for (const h of a.hardware) rows.push({ id: newId(), kind: "Snap / hardware", name: h, composition: "", weight: "", color: "", supplier: "", placement: "", consumption: "" });
    if (rows.length) {
      next.fabrics.rows = rows;
      added.push(`${rows.length} material${rows.length > 1 ? "s" : ""}`);
    }
  }
  if (!next.construction.rows.length) {
    const rows: Techpack["construction"]["rows"] = [];
    const add = (area: string, notes: string) => notes && rows.push({ id: newId(), area, seam: "", stitch: "", spi: "", notes });
    add("Neckline", a.neckline_collar);
    add("Sleeve / cuff", a.sleeves_cuffs);
    add("Hem", a.hem);
    add("Seams / topstitching", a.seams_topstitching);
    for (const p of a.pockets) add("Pocket", p);
    if (rows.length) {
      next.construction.rows = rows;
      added.push(`${rows.length} construction detail${rows.length > 1 ? "s" : ""}`);
    }
  }
  return { techpack: next, added };
}

// ------------------------------------------------------------------------------ completeness

export interface SectionStatus {
  key: SectionKey;
  label: string;
  done: boolean;
  detail: string;
}

export function sectionStatuses(tp: Techpack): SectionStatus[] {
  const filled = <T extends Record<string, unknown>>(rows: T[], ...keys: (keyof T)[]) =>
    rows.filter((r) => keys.some((k) => String(r[k] ?? "").trim())).length;
  const measured = tp.sizing.rows.filter((r) => parseMeasure(r.base) != null).length;
  const mats = filled(tp.fabrics.rows, "name", "composition");
  const cons = filled(tp.construction.rows, "seam", "stitch", "notes");
  const cols = filled(tp.colors.colorways, "name", "pantone", "hex");
  const labs = filled(tp.labels.labels, "content", "type");
  const smp = tp.fit.samples.length;
  return [
    { key: "sizing", label: "Sizing", done: measured >= 3 && !!tp.sizing.baseSize, detail: `${measured} measurement${measured === 1 ? "" : "s"}` },
    { key: "fabrics", label: "Fabrics & Trims", done: mats >= 1, detail: `${mats} material${mats === 1 ? "" : "s"}` },
    { key: "construction", label: "Construction", done: cons >= 1, detail: `${cons} detail${cons === 1 ? "" : "s"}` },
    { key: "colors", label: "Colors & Artwork", done: cols >= 1, detail: `${cols} colourway${cols === 1 ? "" : "s"}, ${tp.colors.artwork.length} artwork` },
    { key: "labels", label: "Labels & Packing", done: labs >= 1, detail: `${labs} label${labs === 1 ? "" : "s"}` },
    { key: "fit", label: "Fit & Samples", done: smp >= 1, detail: `${smp} sample${smp === 1 ? "" : "s"}` },
  ];
}
