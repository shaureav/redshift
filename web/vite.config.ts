import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 1500 },
  // index.css is let through so tokens.test.ts can read the tokens as text (vitest stubs other CSS as empty).
  test: { environment: "jsdom", css: { include: [/src[\\/]index\.css/] } },
} as never);
