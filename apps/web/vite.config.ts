import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // API_PROXY=https://testnet.ontoppad.com previews against live data without running the api locally
  server: { proxy: { "/api": { target: process.env.API_PROXY ?? "http://127.0.0.1:8787", changeOrigin: true } } },
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
