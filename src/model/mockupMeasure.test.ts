import { describe, expect, it } from "vitest";
import { applyProposals, changePrompt, extractJson, formatMeasure, measurePrompt, parseChanges, parseRatios, restoreBases } from "./mockupMeasure";

const points = [
  { id: "a", name: "Body length" },
  { id: "b", name: "Chest" },
  { id: "c", name: "Sleeve" },
];

describe("formatMeasure", () => {
  it("rounds cm to the nearest half", () => {
    expect(formatMeasure(52.3, "cm")).toBe("52.5");
    expect(formatMeasure(52.2, "cm")).toBe("52");
  });
  it("rounds inches to the nearest eighth", () => {
    expect(formatMeasure(20.06, "in")).toBe("20");
    expect(formatMeasure(20.1, "in")).toBe("20.125");
  });
});

describe("extractJson", () => {
  it("reads bare, fenced and wrapped JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Here you go:\n```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Sure. {"a":3} Hope that helps.')).toEqual({ a: 3 });
    expect(extractJson("[1,2]")).toEqual([1, 2]);
  });
  it("returns null when there is no JSON", () => {
    expect(extractJson("I can't tell.")).toBeNull();
    expect(extractJson("")).toBeNull();
  });
});

describe("measurePrompt", () => {
  it("names the reference, its value and every point id", () => {
    const { prompt } = measurePrompt({ points, reference: points[0]!, referenceValue: 70, unit: "cm" });
    expect(prompt).toContain('"Body length" measures 70 cm');
    for (const p of points) expect(prompt).toContain(p.id);
  });
});

describe("parseRatios", () => {
  const reply = JSON.stringify({
    garment_note: "Looks like a boxy tee.",
    points: [
      { id: "a", ratio: 1, confidence: "high", note: "" },
      { id: "b", ratio: 0.74, confidence: "medium", note: "Sleeves overlap the body" },
      { id: "c", ratio: 0.31, confidence: "low", note: "" },
    ],
  });

  it("scales ratios by the reference and rounds to the table's precision", () => {
    const { proposals, note } = parseRatios(reply, points, 70, "cm");
    expect(proposals.map((p) => [p.rowId, p.value, p.confidence])).toEqual([
      ["a", 70, "high"],
      ["b", 52, "medium"],
      ["c", 21.5, "low"],
    ]);
    expect(note).toBe("Looks like a boxy tee.");
  });

  it("drops unknown ids, duplicates, non-numbers and implausible sizes", () => {
    const bad = JSON.stringify({
      points: [
        { id: "zzz", ratio: 0.5 },
        { id: "a", ratio: "wide" },
        { id: "b", ratio: -1 },
        { id: "c", ratio: 40 },
        { id: "b", ratio: 0.7 },
        { id: "b", ratio: 0.8 },
      ],
    });
    const { proposals } = parseRatios(bad, points, 70, "cm");
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ rowId: "b", value: 49 });
  });

  it("treats an unknown confidence as medium and survives garbage", () => {
    const { proposals } = parseRatios('{"points":[{"id":"a","ratio":1,"confidence":"certain"}]}', points, 10, "cm");
    expect(proposals[0]?.confidence).toBe("medium");
    expect(parseRatios("no idea", points, 10, "cm")).toEqual({ proposals: [], note: "" });
  });

  it("accepts a bare array", () => {
    expect(parseRatios('[{"id":"a","ratio":1}]', points, 10, "cm").proposals).toHaveLength(1);
  });
});

describe("changes", () => {
  const pts = [
    { id: "a", name: "Sleeve length", value: 21 },
    { id: "b", name: "Hem width", value: 52 },
  ];

  it("builds a prompt with the instruction and current values", () => {
    const { prompt } = changePrompt({ points: pts, instruction: "shorten the sleeve 2 cm", unit: "cm", sizeLabel: "M" });
    expect(prompt).toContain("shorten the sleeve 2 cm");
    expect(prompt).toContain('"value":21');
    expect(prompt).toContain("base size M");
  });

  it("reads edits, ignoring unknown ids and values far from the current one", () => {
    const reply = '[{"id":"a","value":19,"note":"2 cm shorter"},{"id":"b","value":400},{"id":"x","value":5},{"id":"a","value":18}]';
    const out = parseChanges(reply, pts, "cm");
    expect(out).toEqual([{ rowId: "a", value: 19, confidence: null, note: "2 cm shorter" }]);
  });

  it("returns nothing for an empty or unreadable reply", () => {
    expect(parseChanges("[]", pts, "cm")).toEqual([]);
    expect(parseChanges("sorry", pts, "cm")).toEqual([]);
  });
});

describe("applyProposals and restoreBases", () => {
  const rows = [
    { id: "a", name: "Body length", base: "70", grade: "1.5" },
    { id: "b", name: "Chest", base: "", grade: "4" },
    { id: "c", name: "Sleeve", base: "21", grade: "1" },
  ];

  it("writes only the chosen rows' base values and leaves everything else alone", () => {
    const next = applyProposals(rows, [{ rowId: "b", base: "52 1/4" }]);
    expect(next[1]).toEqual({ id: "b", name: "Chest", base: "52 1/4", grade: "4" });
    expect(next[0]).toBe(rows[0]);
    expect(next[2]).toBe(rows[2]);
  });

  it("restores earlier bases, skipping rows that were deleted since", () => {
    const applied = applyProposals(rows, [{ rowId: "a", base: "71" }, { rowId: "c", base: "19" }]);
    const withoutC = applied.filter((r) => r.id !== "c");
    const back = restoreBases(withoutC, [{ rowId: "a", base: "70" }, { rowId: "c", base: "21" }]);
    expect(back.map((r) => r.base)).toEqual(["70", ""]);
  });
});
