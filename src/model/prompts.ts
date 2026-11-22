import type { GarmentAnalysis } from "./analysis";
import type { ViewMode, ViewType } from "./views";

export const VIEW_SUFFIX: Record<Exclude<ViewType, "detail">, string> = {
  front: "Straight-on front view, symmetrical, garment hanging naturally.",
  back: "Straight-on back view of the same garment. Show back seams, yoke, back neck label area, and any back print. Infer plausible back construction consistent with the front.",
  left: "Left side profile view, 90 degrees, showing the side seam, sleeve profile, and pocket/hem shape.",
  right: "Right side profile view, 90 degrees, mirror-consistent with the left view.",
  three_quarter: "Front three-quarter view at 45 degrees.",
  flat_lay: "Top-down flat-lay on a white surface, sleeves laid naturally.",
};

const FLAT_ANGLE: Record<Exclude<ViewType, "detail">, string> = {
  front: "straight-on front, symmetrical.",
  back: "straight-on back, symmetrical. Infer plausible back construction consistent with the front.",
  left: "left side profile, 90 degrees, showing the side seam, sleeve profile and pocket/hem shape.",
  right: "right side profile, 90 degrees, mirror-consistent with the left view.",
  three_quarter: "front three-quarter view at 45 degrees, drawn as line art.",
  flat_lay: "top-down flat-lay outline with sleeves laid naturally.",
};

const join = (xs: string[]) => xs.filter(Boolean).join(", ");

export function describeGarment(a: GarmentAnalysis | null, garmentTypeHint?: string | null) {
  const garment = join([garmentTypeHint || a?.garment_type || "garment", a?.silhouette_fit ?? ""]);
  const color = a ? join(a.colors) || "as in reference" : "as in reference";
  const fabric = a?.fabric_appearance || "as in reference";
  const details = a
    ? join([
        a.neckline_collar && `neckline/collar: ${a.neckline_collar}`,
        a.sleeves_cuffs && `sleeves/cuffs: ${a.sleeves_cuffs}`,
        a.hem && `hem: ${a.hem}`,
        a.closures.length ? `closures: ${join(a.closures)}` : "",
        a.pockets.length ? `pockets: ${join(a.pockets)}` : "",
        a.seams_topstitching && `seams: ${a.seams_topstitching}`,
        a.prints_logos.length
          ? `prints/logos: ${a.prints_logos.map((p) => `${p.description}${p.placement ? ` at ${p.placement}` : ""}`).join("; ")}`
          : "",
        a.hardware.length ? `hardware: ${join(a.hardware)}` : "",
      ])
    : "as in reference";
  return { garment, color, fabric, details: details || "as in reference" };
}

export interface ViewPromptInput {
  viewType: ViewType;
  mode: ViewMode;
  detailName?: string | null;
  analysis: GarmentAnalysis | null;
  garmentType?: string | null;
  notes?: string | null;
  whiteBackground?: boolean;
  correction?: string | null;
}

export function buildViewPrompt(input: ViewPromptInput): string {
  const { viewType, mode, analysis } = input;
  const corrections = [
    ...(analysis?.user_corrections ?? []).map((c) => c.note),
    ...(input.correction ? [input.correction] : []),
  ];
  const uniqueCorrections = Array.from(new Set(corrections));
  const correctionText = uniqueCorrections.length
    ? ` Designer corrections (ground truth, these override anything else): ${uniqueCorrections.join(" | ")}.`
    : "";

  if (mode === "flat") {
    const angle =
      viewType === "detail"
        ? `Close-up technical drawing of the ${input.detailName || "detail"} only, showing construction, seams and stitching.`
        : FLAT_ANGLE[viewType];
    return `Convert the reference garment into a clean technical flat sketch (fashion CAD style): black vector-style line art on a pure white background, uniform line weight, no shading, no color fill, no model. Show all seams, topstitching (dashed lines), darts, pockets, closures, and hem details. View: ${angle} Proportionally accurate to the reference.${correctionText}`;
  }

  const d = describeGarment(analysis, input.garmentType);
  const background = input.whiteBackground
    ? "pure white (#FFFFFF) seamless studio background"
    : "plain white or light grey seamless studio background";
  const base = `Use the reference image as the exact garment. Keep identical color, fabric texture, proportions, stitching, trims, logos and print placement. Do not redesign or add details. Garment: ${d.garment}. Color: ${d.color}. Fabric: ${d.fabric}. Details: ${d.details}. Notes: ${input.notes?.trim() || "none"}. Photographed as a ghost mannequin (invisible mannequin) product shot, centered, full garment in frame, ${background}, soft even lighting, no model, no props, no shadows cutting the garment, high resolution.`;
  const suffix =
    viewType === "detail"
      ? `Close-up macro shot of the ${input.detailName || "detail"}, showing stitching and material texture, same color and fabric as the garment.`
      : VIEW_SUFFIX[viewType];
  return `${base} ${suffix}${correctionText}`;
}

export function buildEditPrompt(instruction: string): string {
  return `Edit the provided view of the garment: ${instruction.trim()}. Change only what was asked. Keep everything else (color, fabric, proportions, background, framing) identical.`;
}
