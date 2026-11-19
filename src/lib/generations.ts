import type { View } from "./db";

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
