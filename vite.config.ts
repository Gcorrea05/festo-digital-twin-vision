// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  server: {
    host: true,
    port: 8080,
    strictPort: true,
    proxy: {
      // ÚNICA regra – cobre HTTP e WebSocket
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        ws: true,        // habilita upgrade WS em /api/ws/...
        secure: false,
        timeout: 60_000,
        proxyTimeout: 60_000,
        configure: (proxy) => {
          proxy.on("error", (err: any) => {
            const code = err?.code;
            if (code !== "ECONNRESET" && code !== "ECONNABORTED") {
              console.error("[vite-proxy] error:", code, err?.message);
            }
          });
        },
      },
    },
  },

  preview: {
    port: 8080,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
