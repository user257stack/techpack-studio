import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base "./" keeps every asset path relative, so the built site works from any folder or sub-path
// (GitHub Pages project sites, a shared hosting directory, even opened from a USB stick via a local server).
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  test: { environment: "jsdom", include: ["src/**/*.{test,spec}.{ts,tsx}"] },
});
