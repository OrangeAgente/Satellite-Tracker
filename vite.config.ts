import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    watch: {
      usePolling: true,
      interval: 400,
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
  },
  worker: {
    format: "es",
  },
  build: {
    rollupOptions: {
      output: {
        // Split the heavy, rarely-changing 3D/React dependencies out of the app
        // chunk so a UI tweak doesn't invalidate ~800 KB of cached vendor code.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](three|@react-three)[\\/]/.test(id)) return "vendor-three";
          if (/[\\/]node_modules[\\/](react-dom|react|scheduler)[\\/]/.test(id)) return "vendor-react";
          return undefined;
        },
      },
    },
  },
});
