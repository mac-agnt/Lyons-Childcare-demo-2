import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // The whole demo ships as one screen; one ~1.3 MB chunk (~350 kB gzipped) is expected.
  build: { chunkSizeWarningLimit: 1600 },
});
