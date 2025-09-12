// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const target = "http://127.0.0.1:8000";

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
      // --- mantém sua regra existente (/api) ---
      "/api": {
        target,
        changeOrigin: true,
        ws: true, // upgrade WS em /api/ws/... (se existir)
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

      // --- novas regras explícitas (sem remover nada do /api) ---
      "/opc": {
        target,
        changeOrigin: true,
        ws: false, // HTTP apenas (latest/history). Pode deixar true se preferir.
        secure: false,
      },
      "/mpu": {
        target,
        changeOrigin: true,
        ws: false, // HTTP apenas (ids/latest/history)
        secure: false,
      },
      "/ws": {
        target,
        changeOrigin: true,
        ws: true,  // WebSockets: /ws/opc e /ws/mpu
        secure: false,
      },
    },
  },

  preview: {
    port: 8080,
    strictPort: true,
    proxy: {
      "/api": {
        target,
        changeOrigin: true,
        ws: true,
      },
      "/opc": {
        target,
        changeOrigin: true,
        ws: false,
      },
      "/mpu": {
        target,
        changeOrigin: true,
        ws: false,
      },
      "/ws": {
        target,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
