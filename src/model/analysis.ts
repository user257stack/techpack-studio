import { z } from "zod";

const str = z.preprocess((v) => (v == null ? "" : typeof v === "string" ? v : String(v)), z.string());
const strArr = z.preprocess(
  (v) => (v == null ? [] : Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []),
  z.array(z.preprocess((x) => (typeof x === "string" ? x : JSON.stringify(x)), z.string())),
);

export const garmentAnalysisSchema = z.object({
  garment_type: str,
  silhouette_fit: str,
  colors: strArr,
  fabric_appearance: str,
  neckline_collar: str,
  sleeves_cuffs: str,
  hem: str,
  closures: strArr,
  pockets: strArr,
  seams_topstitching: str,
  prints_logos: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(
      z.preprocess(
        (x) => (typeof x === "string" ? { description: x, placement: "" } : x),
        z.object({ description: str, placement: str }),
      ),
    ),
  ),
  hardware: strArr,
  not_visible: strArr,
  riot_note: strArr,
  user_corrections: z
    .array(z.object({ view_type: z.string(), note: z.string(), at: z.string() }))
    .optional(),
});

export type GarmentAnalysis = z.infer<typeof garmentAnalysisSchema>;
export type UserCorrection = NonNullable<GarmentAnalysis["user_corrections"]>[number];

/** Pull the first JSON object out of a model reply and validate it. Throws on failure. */
export function parseAnalysis(raw: string): GarmentAnalysis {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in reply");
  const json: unknown = JSON.parse(raw.slice(start, end + 1));
  return garmentAnalysisSchema.parse(json);
}

/** Safe read of whatever is stored in projects.analysis. */
export function readAnalysis(value: unknown): GarmentAnalysis | null {
  const r = garmentAnalysisSchema.safeParse(value);
  return r.success ? r.data : null;
}

export const ANALYSIS_INSTRUCTION =
  "Describe this garment for a tech pack. Be precise and literal. Do not invent details that are not visible. List anything you cannot see in not_visible.";

export const ANALYSIS_SHAPE = `Return JSON only, exactly this shape:
{"garment_type": string, "silhouette_fit": string, "colors": string[], "fabric_appearance": string, "neckline_collar": string, "sleeves_cuffs": string, "hem": string, "closures": string[], "pockets": string[], "seams_topstitching": string, "prints_logos": [{"description": string, "placement": string}], "hardware": string[], "not_visible": string[], "riot_note": string[]}
riot_note: 2 to 4 short, plain-language things the designer should double-check (one sentence each).`;
