import type { GarmentAnalysis } from "./analysis";

export type ViewType = "front" | "back" | "left" | "right" | "three_quarter" | "flat_lay" | "detail";
export type ViewMode = "realistic" | "flat";
export const DETAIL_OPTIONS = ["collar", "cuff", "hem", "pocket", "zipper"] as const;
export type DetailName = (typeof DETAIL_OPTIONS)[number];

export const VIEW_LABELS: Record<ViewType, string> = {
  front: "Front",
  back: "Back",
  left: "Left",
  right: "Right",
  three_quarter: "3/4",
  flat_lay: "Flat-lay",
  detail: "Detail",
};

export function viewLabel(viewType: string, detailName?: string | null): string {
  if (viewType === "detail" && detailName) return `Detail · ${detailName[0]?.toUpperCase()}${detailName.slice(1)}`;
  return VIEW_LABELS[viewType as ViewType] ?? viewType;
}

/** Stable key for an angle ("front", "detail:collar"), the same across regenerations. Callout pins use it. */
export const viewKey = (viewType: string, detailName?: string | null): string =>
  viewType === "detail" && detailName ? `detail:${detailName}` : viewType;

export interface ViewSelection {
  front: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  three_quarter: boolean;
  flat_lay: boolean;
  details: DetailName[];
}

export const DEFAULT_SELECTION: ViewSelection = {
  front: true,
  back: true,
  left: true,
  right: true,
  three_quarter: false,
  flat_lay: false,
  details: [],
};

export interface PlannedView {
  view_type: ViewType;
  detail_name: string | null;
}

/** Same views in both modes. Front runs first so the other views can stay consistent with it. */
export function planViews(sel: ViewSelection, _mode: ViewMode = "realistic"): PlannedView[] {
  const out: PlannedView[] = [];
  const push = (v: ViewType) => out.push({ view_type: v, detail_name: null });
  if (sel.front) push("front");
  if (sel.back) push("back");
  if (sel.left) push("left");
  if (sel.right) push("right");
  if (sel.three_quarter) push("three_quarter");
  if (sel.flat_lay) push("flat_lay");
  for (const d of sel.details) out.push({ view_type: "detail", detail_name: d });
  return out;
}

const DETAIL_KEYWORDS: Record<string, string[]> = {
  collar: ["collar", "neck", "hood", "lapel"],
  cuff: ["cuff", "sleeve end", "wrist"],
  hem: ["hem"],
  pocket: ["pocket"],
  zipper: ["zip", "zipper"],
};

/**
 * A view is inferred when the photo cannot show it: back, sides and 3/4 always;
 * a detail when the analysis lists it as not visible or found none of it.
 */
export function isViewInferred(
  viewType: ViewType,
  detailName: string | null,
  analysis: GarmentAnalysis | null,
): boolean {
  if (viewType === "back" || viewType === "left" || viewType === "right" || viewType === "three_quarter") return true;
  if (viewType !== "detail" || !detailName) return false;
  if (!analysis) return true;
  const keys = DETAIL_KEYWORDS[detailName] ?? [detailName];
  const hit = (s: string) => keys.some((k) => s.toLowerCase().includes(k));
  if (analysis.not_visible.some(hit)) return true;
  if (detailName === "pocket") return analysis.pockets.length === 0;
  if (detailName === "zipper")
    return ![...analysis.closures, ...analysis.hardware].some(hit);
  return false;
}
