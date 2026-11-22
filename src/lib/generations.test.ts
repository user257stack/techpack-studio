import { describe, expect, it } from "vitest";
import type { View } from "./db";
import { pickPinnableViews } from "./generations";
import { viewKey } from "../model/views";

let n = 0;
const view = (o: Partial<View>): View => ({
  id: `v${++n}`, projectId: "p", generationId: "g", viewType: "front", mode: "flat", detailName: null, sourceImageId: null,
  imageId: `img${n}`, status: "done", isInferred: false, correctionNote: null, error: null, whiteBackground: false,
  createdAt: `2026-01-01T00:00:${String(n).padStart(2, "0")}Z`, ...o,
});

describe("viewKey", () => {
  it("is stable per angle and separates details", () => {
    expect(viewKey("front")).toBe("front");
    expect(viewKey("detail", "collar")).toBe("detail:collar");
    expect(viewKey("detail", "cuff")).not.toBe(viewKey("detail", "collar"));
  });
});

describe("pickPinnableViews", () => {
  it("skips views that are not finished", () => {
    const out = pickPinnableViews([view({ status: "failed" }), view({ status: "generating" }), view({ imageId: null })]);
    expect(out).toEqual([]);
  });

  it("keeps the newest image per angle", () => {
    const older = view({ viewType: "back" });
    const newer = view({ viewType: "back" });
    expect(pickPinnableViews([older, newer]).map((v) => v.id)).toEqual([newer.id]);
  });

  it("prefers a technical flat over a newer realistic mockup", () => {
    const flat = view({ mode: "flat" });
    const realistic = view({ mode: "realistic" });
    expect(pickPinnableViews([flat, realistic]).map((v) => v.id)).toEqual([flat.id]);
    expect(pickPinnableViews([realistic, flat]).map((v) => v.id)).toEqual([flat.id]);
  });

  it("returns sheet order: front, back, sides, then details by name", () => {
    const out = pickPinnableViews([
      view({ viewType: "detail", detailName: "pocket" }),
      view({ viewType: "back" }),
      view({ viewType: "detail", detailName: "collar" }),
      view({ viewType: "front" }),
    ]);
    expect(out.map((v) => viewKey(v.viewType, v.detailName))).toEqual(["front", "back", "detail:collar", "detail:pocket"]);
  });
});
