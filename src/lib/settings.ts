import { useSyncExternalStore } from "react";

export interface Settings {
  /** Your own Google AI (Gemini) API key. Stored only in this browser and sent only to Google. */
  apiKey: string;
  /** Reads the garment photo. */
  visionModel: string;
  /** Draws the mockup views. */
  imageModel: string;
}

// Model names change often, so they are editable in Settings rather than baked in.
export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  visionModel: "gemini-3-flash-preview",
  imageModel: "gemini-3.1-flash-image",
};

const KEY = "seamsheet.settings.v1";
let cache: Settings | null = null;
const listeners = new Set<() => void>();

export function loadSettings(): Settings {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    cache = {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      visionModel: parsed.visionModel || DEFAULT_SETTINGS.visionModel,
      imageModel: parsed.imageModel || DEFAULT_SETTINGS.imageModel,
    };
  } catch {
    cache = { ...DEFAULT_SETTINGS };
  }
  return cache;
}

export function saveSettings(next: Settings) {
  cache = {
    apiKey: next.apiKey.trim(),
    visionModel: next.visionModel.trim() || DEFAULT_SETTINGS.visionModel,
    imageModel: next.imageModel.trim() || DEFAULT_SETTINGS.imageModel,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* private mode: the key lasts until the tab closes */
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => void listeners.delete(cb)),
    loadSettings,
    () => DEFAULT_SETTINGS,
  );
}
