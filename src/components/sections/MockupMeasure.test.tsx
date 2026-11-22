import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, saveSettings } from "../../lib/settings";
import type { Techpack } from "../../model/techpack";
import { MockupMeasure } from "./MockupMeasure";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A plain recorder instead of vi.fn(): vitest's own tracking of rejected promises would flag the
// deliberate failure in the last test as unhandled.
const ai = vi.hoisted(() => ({
  calls: [] as unknown[][],
  impl: async (..._args: unknown[]): Promise<string> => "",
}));
vi.mock("../../lib/gemini", async (orig) => ({
  ...(await orig<typeof import("../../lib/gemini")>()),
  createGemini: () => ({
    describe: async (...args: unknown[]) => {
      ai.calls.push(args);
      return ai.impl(...args);
    },
    draw: vi.fn(),
  }),
}));
vi.mock("../../lib/image", () => ({ prepareImage: async (b: Blob) => b }));

type Rows = Techpack["sizing"]["rows"];
const row = (id: string, name: string, base: string): Rows[number] => ({ id, code: "", name, base, tolerance: "", grade: "" });

const openSettings = vi.fn();
let root: Root | undefined;
let host: HTMLElement | undefined;

function Harness({ start }: { start: Rows }) {
  const [rows, setRows] = useState(start);
  return (
    <>
      <MockupMeasure rows={rows} unit="cm" baseSize="M" onRows={setRows} onOpenSettings={openSettings} />
      <output data-testid="bases">{JSON.stringify(rows.map((r) => [r.id, r.base]))}</output>
    </>
  );
}

const flush = (ms = 20) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const bases = () => JSON.parse(host!.querySelector("[data-testid=bases]")!.textContent!) as [string, string][];
const button = (re: RegExp) => Array.from(host!.querySelectorAll("button")).find((b) => re.test(b.textContent ?? ""))!;
const click = (el: Element) => act(async () => void el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const typeInto = (el: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const field = (label: string) => host!.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;

async function mount(rows: Rows) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<Harness start={rows} />));
  await flush();
}

async function upload() {
  const input = host!.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [new File(["x"], "flat.png", { type: "image/png" })], configurable: true });
  await act(async () => void input.dispatchEvent(new Event("change", { bubbles: true })));
  await flush();
}

beforeAll(() => {
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => {};
});
beforeEach(() => { ai.calls.length = 0; ai.impl = async () => ""; });
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("MockupMeasure", () => {
  it("sends the designer to Settings instead of calling the AI when there is no key", async () => {
    saveSettings({ ...DEFAULT_SETTINGS, apiKey: "" });
    openSettings.mockClear();
    await mount([row("a", "Sleeve length", "21")]);
    expect(host!.textContent).toContain("needs your Google AI key");
    await typeInto(field("Describe a change"), "shorten the sleeve 2 cm");
    await click(button(/Suggest changes/));
    expect(openSettings).toHaveBeenCalled();
    expect(ai.calls).toHaveLength(0);
  });

  it("proposes a typed change, applies it, and undoes it", async () => {
    saveSettings({ ...DEFAULT_SETTINGS, apiKey: "test-key" });
    ai.impl = async () => '[{"id":"a","value":19,"note":"2 cm shorter"}]';
    await mount([row("a", "Sleeve length", "21"), row("b", "Hem width", "52")]);

    await typeInto(field("Describe a change"), "shorten the sleeve 2 cm");
    await click(button(/Suggest changes/));
    await flush();

    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]![0]).toBeNull(); // text only, no image
    expect(ai.calls[0]![2]).toContain("shorten the sleeve 2 cm");
    expect(field("Proposed Sleeve length").value).toBe("19");
    expect(bases()).toEqual([["a", "21"], ["b", "52"]]); // nothing changes until Apply

    await click(button(/Apply ticked points/));
    expect(bases()).toEqual([["a", "19"], ["b", "52"]]);
    expect(host!.textContent).toContain("Applied 1 point to size M");

    await click(button(/Undo last apply/));
    expect(bases()).toEqual([["a", "21"], ["b", "52"]]);
  });

  it("breaks down an uploaded mockup against the known measurement and leaves low confidence unticked", async () => {
    saveSettings({ ...DEFAULT_SETTINGS, apiKey: "test-key" });
    ai.impl = async () => JSON.stringify({
      garment_note: "Boxy tee.",
      points: [
        { id: "a", ratio: 1, confidence: "high" },
        { id: "b", ratio: 2.5, confidence: "medium", note: "Sleeves overlap" },
        { id: "c", ratio: 0.9, confidence: "low" },
      ],
    });
    await mount([row("a", "Sleeve length", "21"), row("b", "Hem width", ""), row("c", "Neck width", "")]);

    expect(button(/Break down mockup/).hasAttribute("disabled")).toBe(true); // needs an image first
    await upload();
    await click(button(/Break down mockup/));
    await flush();

    expect(ai.calls[0]![0]).toBeInstanceOf(Blob); // the image went with the request
    expect(ai.calls[0]![2]).toContain('"Sleeve length" measures 21 cm'); // blank value falls back to the table
    expect(field("Proposed Hem width").value).toBe("52.5");
    expect(field("Apply Hem width").checked).toBe(true);
    expect(field("Apply Neck width").checked).toBe(false);
    expect(host!.textContent).toContain("Boxy tee.");

    await typeInto(field("Proposed Hem width"), "52 1/4"); // hand edits are kept exactly as typed
    await click(button(/Apply ticked points/));
    expect(bases()).toEqual([["a", "21"], ["b", "52 1/4"], ["c", ""]]);
  });

  it("says what went wrong when the AI call fails and leaves the table alone", async () => {
    saveSettings({ ...DEFAULT_SETTINGS, apiKey: "test-key" });
    ai.impl = async () => { throw new Error("Google rejected your API key. Check it in Settings."); };
    await mount([row("a", "Sleeve length", "21")]);
    await typeInto(field("Describe a change"), "shorten the sleeve");
    await click(button(/Suggest changes/));
    await flush();
    expect(host!.textContent).toContain("Google rejected your API key");
    expect(bases()).toEqual([["a", "21"]]);
  });
});
