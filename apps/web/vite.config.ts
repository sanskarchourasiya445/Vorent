import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "lenis": fileURLToPath(new URL("./src/lib/lenis.ts", import.meta.url)),
    },
  },
  server: {
    allowedHosts: ['antivirus-spiffy-unlit.ngrok-free.dev'],
    port: 5173,
    proxy: {
      "/health": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
