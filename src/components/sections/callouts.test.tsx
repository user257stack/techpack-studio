import "fake-indexeddb/auto";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createProject, putBlob, putViews, uid, type Project, type View } from "../../lib/db";
import { readTechpack, type Techpack } from "../../model/techpack";
import { CalloutBoard } from "./callouts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const flush = (ms = 30) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

function Harness({ project, start }: { project: Project; start: Techpack["construction"] }) {
  const [c, setC] = useState(start);
  return <CalloutBoard project={project} construction={c} onChange={(callouts) => setC({ ...c, callouts })} onGo={() => {}} />;
}

let root: Root | undefined;
let host: HTMLElement | undefined;

beforeAll(() => {
  // jsdom has no layout or pointer capture: give the 200 x 400 drawing a fixed box.
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => {};
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

async function mount(withDrawing: boolean) {
  const project = await createProject({ styleName: "Test hoodie" });
  if (withDrawing) {
    const imageId = await putBlob(new Blob(["png"], { type: "image/png" }));
    const view: View = {
      id: uid(), projectId: project.id, generationId: "g1", viewType: "front", mode: "flat", detailName: null, sourceImageId: null,
      imageId, status: "done", isInferred: false, correctionNote: null, error: null, whiteBackground: false, createdAt: new Date().toISOString(),
    };
    await putViews([view]);
  }
  const start = readTechpack({
    construction: { rows: [{ id: "r1", area: "Neckline" }, { id: "r2", area: "Hem" }], callouts: [] },
  }).construction;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<Harness project={project} start={start} />));
  await flush(80);
  return host;
}

const pins = (h: HTMLElement) => Array.from(h.querySelectorAll<HTMLButtonElement>('button[aria-label^="Callout"]'));
const surface = (h: HTMLElement) => h.querySelector<HTMLElement>("div.absolute.inset-0")!;
const click = (el: Element, x: number, y: number) =>
  act(() => void el.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y })));
const mouse = (el: Element, type: string, x = 0, y = 0) =>
  act(() => void el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })));
const key = (el: Element, k: string) =>
  act(() => void el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })));

describe("CalloutBoard", () => {
  it("points the designer to the generator when there is no drawing yet", async () => {
    const h = await mount(false);
    expect(h.textContent).toContain("No finished drawings yet");
    expect(h.querySelector("img")).toBeNull();
  });

  it("places pins in row order, then moves, nudges and removes them", async () => {
    const h = await mount(true);
    expect(h.querySelector("img")).not.toBeNull();
    expect(pins(h)).toHaveLength(0);

    // Row 1 is the target first; the next click pins row 2.
    await click(surface(h), 50, 100);
    await click(surface(h), 100, 200);
    let [one, two] = pins(h);
    expect(pins(h)).toHaveLength(2);
    expect(one!.getAttribute("aria-label")).toContain("Callout 1: Neckline");
    expect(one!.style.left).toBe("25%");
    expect(one!.style.top).toBe("25%");
    expect(two!.getAttribute("aria-label")).toContain("Callout 2: Hem");
    expect(two!.style.left).toBe("50%");

    // Clicking a pin selects it and does not drop a new one.
    await click(two!, 100, 200);
    expect(pins(h)).toHaveLength(2);

    // Dragging moves the same pin.
    await mouse(one!, "pointerdown", 50, 100);
    await mouse(one!, "pointermove", 150, 300);
    await mouse(one!, "pointerup");
    [one] = pins(h);
    expect(one!.style.left).toBe("75%");
    expect(one!.style.top).toBe("75%");

    // After the drag ends, further pointer movement must not drag it.
    await mouse(one!, "pointermove", 10, 10);
    expect(pins(h)[0]!.style.left).toBe("75%");

    // Arrow keys nudge by 1%, Shift by 5%.
    await key(one!, "ArrowRight");
    expect(pins(h)[0]!.style.left).toBe("76%");
    await act(() => void one!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true, bubbles: true, cancelable: true })));
    expect(pins(h)[0]!.style.left).toBe("71%");

    // Delete removes just that pin.
    await key(pins(h)[0]!, "Delete");
    expect(pins(h)).toHaveLength(1);
    expect(pins(h)[0]!.getAttribute("aria-label")).toContain("Callout 2");
  });

  it("pins at the centre for keyboard users", async () => {
    const h = await mount(true);
    const btn = Array.from(h.querySelectorAll("button")).find((b) => b.textContent?.includes("Pin at centre"))!;
    await act(() => void btn.click());
    expect(pins(h)).toHaveLength(1);
    expect(pins(h)[0]!.style.left).toBe("50%");
    expect(pins(h)[0]!.style.top).toBe("50%");
  });
});

vi.setConfig({ testTimeout: 15000 });
