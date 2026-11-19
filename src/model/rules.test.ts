import { describe, expect, it } from "vitest";
import { DEFAULT_SELECTION, isViewInferred, planViews } from "./views";
import { buildEditPrompt, buildViewPrompt } from "./prompts";
import { parseAnalysis, type GarmentAnalysis } from "./analysis";
import { RIOT_CORE, withRiot } from "./riot";

const analysis: GarmentAnalysis = parseAnalysis(
  JSON.stringify({
    garment_type: "jacket", silhouette_fit: "boxy", colors: ["navy"], fabric_appearance: "cotton twill",
    neckline_collar: "point collar", sleeves_cuffs: "long, button cuff", hem: "straight", closures: ["5 buttons"],
    pockets: ["2 patch chest pockets"], seams_topstitching: "double needle", prints_logos: [], hardware: [],
    not_visible: ["back yoke"], riot_note: ["Check button size"],
  }),
);

describe("view planning", () => {
  it("defaults to front, back, left, right", () => {
    expect(planViews(DEFAULT_SELECTION, "realistic").map((v) => v.view_type)).toEqual(["front", "back", "left", "right"]);
  });
  it("technical flat mode only produces front and back", () => {
    const all = { ...DEFAULT_SELECTION, three_quarter: true, flat_lay: true, details: ["collar" as const] };
    expect(planViews(all, "flat").map((v) => v.view_type)).toEqual(["front", "back"]);
  });
  it("front always comes first", () => {
    const sel = { ...DEFAULT_SELECTION, details: ["pocket" as const] };
    expect(planViews(sel, "realistic")[0]?.view_type).toBe("front");
  });
});

describe("inferred views", () => {
  it("marks back, left and right as inferred", () => {
    for (const v of ["back", "left", "right"] as const) expect(isViewInferred(v, null, analysis)).toBe(true);
  });
  it("front is seen, not inferred", () => {
    expect(isViewInferred("front", null, analysis)).toBe(false);
  });
  it("a detail missing from the photo is inferred", () => {
    expect(isViewInferred("detail", "zipper", analysis)).toBe(true);
    expect(isViewInferred("detail", "pocket", analysis)).toBe(false);
  });
});

describe("prompts", () => {
  it("realistic views start with the reference-garment base prompt", () => {
    const p = buildViewPrompt({ viewType: "back", mode: "realistic", analysis, notes: "drop shoulder" });
    expect(p.startsWith("Use the reference image as the exact garment.")).toBe(true);
    expect(p).toContain("Straight-on back view of the same garment.");
    expect(p).toContain("Notes: drop shoulder.");
  });
  it("technical flat replaces the base prompt", () => {
    const p = buildViewPrompt({ viewType: "back", mode: "flat", analysis });
    expect(p).not.toContain("ghost mannequin");
    expect(p).toContain("View: back.");
  });
  it("designer corrections are added as ground truth", () => {
    const p = buildViewPrompt({ viewType: "left", mode: "realistic", analysis, correction: "No side pockets" });
    expect(p).toContain("No side pockets");
  });
  it("edit prompt keeps everything else identical", () => {
    expect(buildEditPrompt("make buttons silver")).toBe(
      "Edit the provided view of the garment: make buttons silver. Change only what was asked. Keep everything else (color, fabric, proportions, background, framing) identical.",
    );
  });
});

describe("analysis parsing", () => {
  it("extracts JSON wrapped in extra text", () => {
    expect(parseAnalysis('Here: {"garment_type":"tee"} done').garment_type).toBe("tee");
  });
  it("rejects replies without JSON", () => {
    expect(() => parseAnalysis("sorry")).toThrow();
  });
});

describe("Riot", () => {
  it("later features append to RIOT_CORE", () => {
    expect(withRiot("Sizing rules.")).toBe(`${RIOT_CORE}\n\nSizing rules.`);
  });
});
