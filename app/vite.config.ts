import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // The build stamps its own version into the bundle so a diagnostics export
  // can name the build that produced it (`src/appVersion.ts` has the full
  // reasoning). `APP_VERSION` is the same variable the server already reads
  // for `GET /api/health`; `Dockerfile`'s BUILD stage and `ios:build` each
  // pass it, and it falls back to "dev" when nothing set one — which is the
  // honest answer for a local `pnpm dev`.
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(
      process.env.APP_VERSION ?? "dev",
    ),
  },
  server: {
    proxy: {
      "/api": "http://localhost:8080",
    },
  },
  build: {
    outDir: "dist/client",
  },
});
