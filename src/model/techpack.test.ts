import { describe, expect, it } from "vitest";
import { garmentAnalysisSchema } from "./analysis";
import { gradeRow, parseMeasure, prefillFromAnalysis, readTechpack, sectionStatuses } from "./techpack";

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
