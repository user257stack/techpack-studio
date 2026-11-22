import type { View } from "./db";
import { viewKey } from "../model/views";

export interface Generation {
  id: string;
  createdAt: string;
  mode: string;
  views: View[];
}

/** Groups views by the generation (one press of Generate) they came from, newest first. */
export function groupGenerations(views: View[]): Generation[] {
  const map = new Map<string, Generation>();
  for (const v of views) {
    const g = map.get(v.generationId);
    if (g) g.views.push(v);
    else map.set(v.generationId, { id: v.generationId, createdAt: v.createdAt, mode: v.mode, views: [v] });
  }
  return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const ANGLE_ORDER = ["front", "back", "left", "right", "three_quarter", "flat_lay", "detail"];

/**
 * One finished image per angle, for placing callouts and printing them. Technical flats win over
 * realistic mockups (callouts belong on line art), then the newest wins. Returned in sheet order.
 * The editor and the printed summary both use this, so what you pin is what prints.
 */
export function pickPinnableViews(views: View[]): View[] {
  const best = new Map<string, View>();
  for (const v of views) {
    if (v.status !== "done" || !v.imageId) continue;
    const key = viewKey(v.viewType, v.detailName);
    const cur = best.get(key);
    const better = !cur || (v.mode === "flat" && cur.mode !== "flat") || (v.mode === cur.mode && v.createdAt > cur.createdAt);
    if (better) best.set(key, v);
  }
  return Array.from(best.values()).sort(
    (a, b) =>
      ANGLE_ORDER.indexOf(a.viewType) - ANGLE_ORDER.indexOf(b.viewType) || (a.detailName ?? "").localeCompare(b.detailName ?? ""),
  );
}
