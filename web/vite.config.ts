import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Live answers on a local copy (D49): the page asks /api, as on Vercel (web/api/index.py), and the dev and preview
// servers pass it to the Redshift API on port 8000 (make api, from a shell where GEMINI_API_KEY is set). Without
// that API the page says live answers are off and the checked answers still work.
const api = {
  "/api": { target: "http://127.0.0.1:8000", changeOrigin: true, rewrite: (p: string) => p.replace(/^\/api/, "") },
};

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 1500 },
  server: { proxy: api },
  preview: { proxy: api },
  // index.css is let through so tokens.test.ts can read the tokens as text (vitest stubs other CSS as empty).
  test: { environment: "jsdom", css: { include: [/src[\\/]index\.css/] } },
} as never);
