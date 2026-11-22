// Direct browser-to-Google client for the Gemini API. There is no server in between: the request
// goes from this page to generativelanguage.googleapis.com with the key from Settings.
import type { Settings } from "./settings";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export type AiErrorKind = "no_key" | "auth" | "quota" | "rate" | "blocked" | "model" | "bad_request" | "server" | "network" | "empty";

export class AiError extends Error {
  constructor(public kind: AiErrorKind, message: string) {
    super(message);
    this.name = "AiError";
  }
  /** Retrying the same request cannot help. */
  get terminal() {
    return this.kind === "no_key" || this.kind === "auth" || this.kind === "quota" || this.kind === "rate" || this.kind === "blocked" || this.kind === "model";
  }
}

export interface AiClient {
  /** Look at one image (or, with null, just read the prompt) and answer in text. */
  describe(image: Blob | null, system: string, prompt: string): Promise<string>;
  /** Draw a new image from reference images and a prompt. */
  draw(refs: Blob[], prompt: string, aspect: "2:3" | "1:1"): Promise<Blob>;
}

export function friendlyError(err: unknown): string {
  if (err instanceof AiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

interface Part {
  text?: string;
  thought?: boolean;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
}
interface GenResponse {
  candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

function mapHttpError(status: number, message: string): AiError {
  const m = message.toLowerCase();
  if (status === 401 || status === 403 || m.includes("api key not valid") || m.includes("api_key_invalid"))
    return new AiError("auth", "Google rejected your API key. Check it in Settings.");
  if (status === 429) {
    return m.includes("quota") || m.includes("billing")
      ? new AiError("quota", "You've hit your Google AI quota. Check your plan or billing, then try again.")
      : new AiError("rate", "Google is rate limiting this key. Wait a minute and try again.");
  }
  if (status === 404) return new AiError("model", "Google doesn't recognise that model name. Update it in Settings.");
  if (status === 400) return new AiError("bad_request", message || "Google couldn't process that request.");
  if (status >= 500) return new AiError("server", "Google's AI service had a problem. Try again.");
  return new AiError("bad_request", message || `Request failed (${status}).`);
}

async function generate(settings: Settings, model: string, body: unknown): Promise<GenResponse> {
  if (!settings.apiKey) throw new AiError("no_key", "Add your Google AI API key in Settings to generate.");
  let res: Response;
  try {
    res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": settings.apiKey },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AiError("network", "Couldn't reach Google. Check your connection and try again.");
  }
  if (!res.ok) {
    let message = "";
    try {
      message = ((await res.json()) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      /* not JSON */
    }
    throw mapHttpError(res.status, message);
  }
  return (await res.json()) as GenResponse;
}

function assertNotBlocked(r: GenResponse) {
  if (r.promptFeedback?.blockReason)
    throw new AiError("blocked", "Google's safety filter blocked that request. Try a different photo or wording.");
}

export function createGemini(settings: Settings): AiClient {
  return {
    async describe(image, system, prompt) {
      const parts: Part[] = [{ text: prompt }];
      if (image) parts.push({ inlineData: { mimeType: image.type || "image/jpeg", data: await toBase64(image) } });
      const r = await generate(settings, settings.visionModel, {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts }],
      });
      assertNotBlocked(r);
      const text = (r.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
      if (!text.trim()) throw new AiError("empty", "The AI returned no text.");
      return text;
    },

    async draw(refs, prompt, aspect) {
      const parts: Part[] = [{ text: prompt }];
      for (const ref of refs) parts.push({ inlineData: { mimeType: ref.type || "image/png", data: await toBase64(ref) } });
      const body = (withAspect: boolean) => ({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          ...(withAspect ? { imageConfig: { aspectRatio: aspect } } : {}),
        },
      });
      let r: GenResponse;
      try {
        r = await generate(settings, settings.imageModel, body(true));
      } catch (err) {
        // Google has moved the aspect-ratio field between API revisions. If it rejects ours, ask for the
        // shape in the prompt instead of failing the whole view.
        if (err instanceof AiError && err.kind === "bad_request" && /imageConfig|aspect|unknown name|invalid json/i.test(err.message)) {
          parts[0] = { text: `${prompt} Output a ${aspect === "2:3" ? "portrait 2:3" : "square 1:1"} image.` };
          r = await generate(settings, settings.imageModel, body(false));
        } else throw err;
      }
      assertNotBlocked(r);
      const cand = r.candidates?.[0];
      for (const p of cand?.content?.parts ?? []) {
        if (p.thought) continue;
        const inline = p.inlineData ?? (p.inline_data ? { mimeType: p.inline_data.mime_type, data: p.inline_data.data } : undefined);
        if (inline?.data) return fromBase64(inline.data, inline.mimeType || "image/png");
      }
      if (cand?.finishReason && /SAFETY|PROHIBITED|BLOCK/i.test(cand.finishReason))
        throw new AiError("blocked", "Google's safety filter blocked that image. Try a different photo or wording.");
      throw new AiError("empty", "The image model returned no image.");
    },
  };
}

/** Cheap check that the key and vision model work. */
export async function testConnection(settings: Settings): Promise<void> {
  const r = await generate(settings, settings.visionModel, { contents: [{ role: "user", parts: [{ text: "Reply with the single word: ok" }] }] });
  assertNotBlocked(r);
}
