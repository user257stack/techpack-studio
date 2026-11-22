// Reading measurements off a flat mockup. Pure (no I/O): builds the prompts, reads the AI's reply
// defensively, and turns it into proposals the designer reviews before anything touches the sizing table.
// A picture has no scale, so the AI only judges proportions. One real measurement the designer already
// knows (the reference) turns those proportions into real numbers.

export type Unit = "cm" | "in";
export type Confidence = "high" | "medium" | "low";

export interface PomRef {
  id: string;
  name: string;
}

export interface Proposal {
  rowId: string;
  /** Proposed measurement at the base size, in the sizing unit. */
  value: number;
  /** Only set for estimates read from an image. */
  confidence: Confidence | null;
  note: string;
}

const SYSTEM = "You measure flat garment mockups for fashion tech packs. Reply with JSON only, no commentary.";

/** Nearest 0.5 cm, or nearest 1/8 in, as the text the sizing table stores. */
export function formatMeasure(v: number, unit: Unit): string {
  return String(unit === "cm" ? Math.round(v * 2) / 2 : Math.round(v * 8) / 8);
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Reads JSON out of a reply that may be bare, fenced in ```json, or wrapped in a sentence. */
export function extractJson(text: string): unknown {
  const t = text.trim();
  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  let v = tryParse(t);
  if (v !== undefined) return v;
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    v = tryParse(fence[1].trim());
    if (v !== undefined) return v;
  }
  const start = t.search(/[[{]/);
  const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (start >= 0 && end > start) {
    v = tryParse(t.slice(start, end + 1));
    if (v !== undefined) return v;
  }
  return null;
}

function listFrom(json: unknown, key: string): unknown[] {
  if (Array.isArray(json)) return json;
  if (isRecord(json) && Array.isArray(json[key])) return json[key] as unknown[];
  return [];
}

const cleanNote = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 120) : "");

// ------------------------------------------------------------------------------ from an image

export function measurePrompt(args: { points: PomRef[]; reference: PomRef; referenceValue: number; unit: Unit }): { system: string; prompt: string } {
  const { points, reference, referenceValue, unit } = args;
  const prompt = [
    "The attached image is a flat mockup of a garment. It has no scale, so judge proportions only.",
    `One real measurement is known: "${reference.name}" measures ${referenceValue} ${unit}.`,
    "Estimate every point of measure below as a RATIO to that reference: ratio = this point's length divided by the reference point's length.",
    "Measure each point the way a tech pack does: on the flat garment, one side only (not doubled around the body).",
    "Skip any point you cannot see or judge. Do not guess wildly.",
    "",
    `Points: ${JSON.stringify(points.map((p) => ({ id: p.id, name: p.name })))}`,
    "",
    "Reply with only this JSON, and include the reference point itself with ratio 1:",
    '{"garment_note": string, "points": [{"id": string, "ratio": number, "confidence": "high" | "medium" | "low", "note": string}]}',
    "Use only ids from the list. Leave note empty unless it helps, and keep it under 12 words.",
  ].join("\n");
  return { system: SYSTEM, prompt };
}

/** Turns the AI's ratios into proposals. Ignores unknown ids and implausible numbers. */
export function parseRatios(text: string, points: PomRef[], referenceValue: number, unit: Unit): { proposals: Proposal[]; note: string } {
  const json = extractJson(text);
  const known = new Set(points.map((p) => p.id));
  const seen = new Set<string>();
  const proposals: Proposal[] = [];
  for (const item of listFrom(json, "points")) {
    if (!isRecord(item)) continue;
    const id = String(item.id ?? "");
    const ratio = Number(item.ratio);
    if (!known.has(id) || seen.has(id) || !Number.isFinite(ratio) || ratio <= 0) continue;
    const value = ratio * referenceValue;
    if (value > referenceValue * 6 || value < referenceValue / 50) continue;
    seen.add(id);
    const confidence: Confidence = item.confidence === "high" || item.confidence === "low" ? item.confidence : "medium";
    proposals.push({ rowId: id, value: Number(formatMeasure(value, unit)), confidence, note: cleanNote(item.note) });
  }
  const note = isRecord(json) ? cleanNote(json.garment_note) : "";
  return { proposals, note };
}

// ------------------------------------------------------------------------- from a typed change

export interface PointValue extends PomRef {
  value: number;
}

export function changePrompt(args: { points: PointValue[]; instruction: string; unit: Unit; sizeLabel: string }): { system: string; prompt: string } {
  const { points, instruction, unit, sizeLabel } = args;
  const prompt = [
    `You are editing the points of measure of a garment tech pack at base size ${sizeLabel}. All values are flat, one-sided measurements in ${unit}.`,
    "",
    `Current points: ${JSON.stringify(points.map((p) => ({ id: p.id, name: p.name, value: p.value })))}`,
    "",
    "The designer's requested change:",
    '"""',
    instruction.trim().slice(0, 600),
    '"""',
    "",
    `Return the points that must change, each with its new absolute value in ${unit}. Keep related points consistent where it matters (for example sleeve opening against bicep).`,
    'Reply with only a JSON array: [{"id": string, "value": number, "note": string}]. Use only ids from the list, keep each note under 12 words, and return [] if the change cannot be applied.',
  ].join("\n");
  return { system: SYSTEM, prompt };
}

/** Turns the AI's edits into proposals. Ignores unknown ids and values that are wildly off the current one. */
export function parseChanges(text: string, points: PointValue[], unit: Unit): Proposal[] {
  const byId = new Map(points.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const out: Proposal[] = [];
  for (const item of listFrom(extractJson(text), "changes")) {
    if (!isRecord(item)) continue;
    const id = String(item.id ?? "");
    const current = byId.get(id);
    const value = Number(item.value);
    if (!current || seen.has(id) || !Number.isFinite(value) || value < 0) continue;
    if (current.value > 0 && (value > current.value * 3 || value < current.value * 0.2)) continue;
    seen.add(id);
    out.push({ rowId: id, value: Number(formatMeasure(value, unit)), confidence: null, note: cleanNote(item.note) });
  }
  return out;
}

// --------------------------------------------------------------------------------------- apply

/** Writes the chosen values into the base column, as typed. Every other row, and every other column, is untouched. */
export function applyProposals<T extends { id: string; base: string }>(rows: T[], chosen: { rowId: string; base: string }[]): T[] {
  const byId = new Map(chosen.map((c) => [c.rowId, c.base]));
  return rows.map((r) => (byId.has(r.id) ? { ...r, base: byId.get(r.id)! } : r));
}

/** Puts back the earlier base values for the rows that still exist. */
export function restoreBases<T extends { id: string; base: string }>(rows: T[], before: { rowId: string; base: string }[]): T[] {
  const byId = new Map(before.map((b) => [b.rowId, b.base]));
  return rows.map((r) => (byId.has(r.id) ? { ...r, base: byId.get(r.id)! } : r));
}
