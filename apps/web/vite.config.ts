import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "lenis": fileURLToPath(new URL("./src/lib/lenis.ts", import.meta.url)),
      "@warrant/contracts": fileURLToPath(
        new URL("../../packages/contracts/src/index.ts", import.meta.url)
      ),
      "@warrant/test-fixtures": fileURLToPath(
        new URL("../../packages/test-fixtures/src/index.ts", import.meta.url)
      ),
    },
  },
  server: {
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
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          three: ["three"],
          icons: ["lucide-react"],
        },
      },
    },
  },
});
