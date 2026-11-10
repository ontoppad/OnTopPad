import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: (id) =>
          id.includes("node_modules/three")
            ? "three"
            : id.includes("lightweight-charts")
              ? "charts"
              : id.includes("node_modules/viem") || id.includes("node_modules/ox") || id.includes("@noble")
                ? "viem"
                : undefined,
      },
    },
  },
});
