import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative asset paths, so the demo build can be hosted under any path (e.g. GitHub Pages).
  base: "./",
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8000" } },
});
