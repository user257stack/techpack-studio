import { describe, expect, it } from "vitest";
import { garmentAnalysisSchema } from "./analysis";
import {
  calloutNumber, calloutsForView, gradeRow, parseMeasure, placeCallout, prefillFromAnalysis, pruneCallouts, readTechpack,
  removeCallout, sectionStatuses,
} from "./techpack";

describe("parseMeasure", () => {
  it.each([
    ["52", 52],
    ["52.5", 52.5],
    ["52,5", 52.5],
    ["52 1/2", 52.5],
    ["1/4", 0.25],
    ["  7 ", 7],
  ])("reads %s", (text, want) => expect(parseMeasure(text)).toBeCloseTo(want));

  it.each(["", "abc", "5/0", "5 1/0"])("rejects %j", (text) => expect(parseMeasure(text)).toBeNull());
});

describe("gradeRow", () => {
  const sizes = ["S", "M", "L", "XL"];
  it("grades up and down from the base size", () => {
    expect(gradeRow({ base: "52", grade: "4" }, sizes, "M", "cm")).toEqual(["48", "52", "56", "60"]);
  });
  it("keeps the base when there is no grade", () => {
    expect(gradeRow({ base: "20", grade: "" }, sizes, "S", "cm")).toEqual(["20", "20", "20", "20"]);
  });
  it("returns blanks when the base is not a number", () => {
    expect(gradeRow({ base: "", grade: "4" }, sizes, "M", "cm")).toEqual(["", "", "", ""]);
  });
  it("falls back to the first size when the base size is unknown", () => {
    expect(gradeRow({ base: "10", grade: "2" }, sizes, "XXL", "in")).toEqual(["10", "12", "14", "16"]);
  });
  it("rounds inch values to two decimals", () => {
    expect(gradeRow({ base: "20", grade: "0.333" }, ["S", "M"], "S", "in")).toEqual(["20", "20.33"]);
  });
});

describe("readTechpack", () => {
  it("fills every section from null or junk", () => {
    for (const raw of [null, undefined, "x", 5, [], {}]) {
      const tp = readTechpack(raw);
      expect(tp.sizing.sizes.length).toBeGreaterThan(0);
      expect(tp.fabrics.rows).toEqual([]);
      expect(tp.labels.packing.fold).toBe("");
    }
  });
  it("keeps valid data and repairs a broken section without losing the rest", () => {
    const tp = readTechpack({
      sizing: { unit: "in", sizes: ["S", "M"], baseSize: "M", rows: "oops" },
      fabrics: { rows: [{ id: "a", name: "Cotton fleece" }] },
    });
    expect(tp.sizing.unit).toBe("in");
    expect(tp.sizing.rows).toEqual([]);
    expect(tp.fabrics.rows[0]).toMatchObject({ id: "a", name: "Cotton fleece", kind: "" });
  });
});

describe("prefillFromAnalysis", () => {
  const analysis = garmentAnalysisSchema.parse({
    colors: ["Black", "Red"],
    fabric_appearance: "Heavy brushed fleece",
    closures: ["Metal zip"],
    hardware: ["Brass eyelets"],
    pockets: ["Kangaroo pocket"],
    neckline_collar: "Hood with drawcord",
    hem: "Ribbed hem",
    prints_logos: [{ description: "Chest logo", placement: "Left chest" }],
  });

  it("fills empty sections and reports what it added", () => {
    const { techpack, added } = prefillFromAnalysis(readTechpack(null), analysis);
    expect(techpack.colors.colorways.map((c) => c.name)).toEqual(["Black", "Red"]);
    expect(techpack.colors.artwork[0]).toMatchObject({ name: "Chest logo", placement: "Left chest" });
    expect(techpack.fabrics.rows.map((r) => r.name)).toEqual(["Heavy brushed fleece", "Metal zip", "Brass eyelets"]);
    expect(techpack.construction.rows.map((r) => r.area)).toEqual(["Neckline", "Hem", "Pocket"]);
    expect(added.length).toBe(4);
  });

  it("never overwrites what the designer already typed", () => {
    const base = readTechpack({ colors: { colorways: [{ id: "x", name: "Ecru" }] } });
    const { techpack, added } = prefillFromAnalysis(base, analysis);
    expect(techpack.colors.colorways).toHaveLength(1);
    expect(techpack.colors.colorways[0]?.name).toBe("Ecru");
    expect(added.join(" ")).not.toMatch(/colour/);
  });
});

describe("sectionStatuses", () => {
  it("starts incomplete and flips as data is added", () => {
    expect(sectionStatuses(readTechpack(null)).every((x) => !x.done)).toBe(true);
    const tp = readTechpack({
      sizing: {
        baseSize: "M",
        rows: [{ base: "52" }, { base: "70" }, { base: "20" }],
      },
      fit: { samples: [{ stage: "Proto" }] },
    });
    const done = Object.fromEntries(sectionStatuses(tp).map((x) => [x.key, x.done]));
    expect(done["sizing"]).toBe(true);
    expect(done["fit"]).toBe(true);
    expect(done["fabrics"]).toBe(false);
  });
});

describe("callouts", () => {
  const rows = [{ id: "r1" }, { id: "r2" }, { id: "r3" }];

  it("loads old tech packs that have no callouts", () => {
    expect(readTechpack({ construction: { rows: [{ id: "r1", area: "Hem" }], notes: "x" } }).construction.callouts).toEqual([]);
  });

  it("repairs bad coordinates instead of dropping the pin", () => {
    const tp = readTechpack({ construction: { callouts: [{ id: "a", view: "front", rowId: "r1", x: 4, y: "nope" }] } });
    expect(tp.construction.callouts[0]).toMatchObject({ x: 1, y: 0.5 });
  });

  it("numbers a pin by its row's place in the table", () => {
    expect(calloutNumber(rows, "r2")).toBe(2);
    expect(calloutNumber(rows, "gone")).toBeNull();
  });

  it("pins a row once per view: pinning again moves it and keeps its id", () => {
    const one = placeCallout([], "front", "r1", 0.2, 0.3);
    const moved = placeCallout(one, "front", "r1", 0.6, 0.7);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ id: one[0]!.id, x: 0.6, y: 0.7 });
    expect(placeCallout(moved, "back", "r1", 0.5, 0.5)).toHaveLength(2);
  });

  it("keeps coordinates inside the drawing", () => {
    expect(placeCallout([], "front", "r1", -3, 9)[0]).toMatchObject({ x: 0, y: 1 });
  });

  it("lists a view's pins in number order and ignores pins whose row is gone", () => {
    let k = placeCallout([], "front", "r3", 0.1, 0.1);
    k = placeCallout(k, "front", "r1", 0.2, 0.2);
    k = placeCallout(k, "front", "ghost", 0.3, 0.3);
    k = placeCallout(k, "back", "r2", 0.4, 0.4);
    const c = readTechpack({ construction: { rows, callouts: k } }).construction;
    expect(calloutsForView(c, "front").map((p) => p.n)).toEqual([1, 3]);
    expect(calloutsForView(c, "back").map((p) => p.n)).toEqual([2]);
  });

  it("renumbers automatically when a row above is deleted", () => {
    const k = placeCallout([], "front", "r3", 0.5, 0.5);
    const after = rows.filter((r) => r.id !== "r1");
    expect(calloutsForView({ rows: after as never, notes: "", callouts: k }, "front")[0]?.n).toBe(2);
  });

  it("prunes pins when their row is deleted, and removes one by id", () => {
    const k = placeCallout(placeCallout([], "front", "r1", 0.1, 0.1), "front", "r2", 0.2, 0.2);
    expect(pruneCallouts(k, [{ id: "r2" }])).toHaveLength(1);
    expect(removeCallout(k, k[0]!.id)).toHaveLength(1);
  });
});
