// vite.config.ts
import { defineConfig, type ProxyOptions, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// === Altere aqui, se quiser hardcode ===
const API_TARGET_DEFAULT = "http://127.0.0.1:8000";

// Permite sobrescrever via: VITE_API_TARGET=http://10.13.109.228:8000
const rawTarget = process.env.VITE_API_TARGET || API_TARGET_DEFAULT;
const target = rawTarget.replace(/\/+$/, ""); // sem / no fim

// Plugin para logar o target ao iniciar (dev/preview)
function logProxyTarget(): Plugin {
  return {
    name: "log-proxy-target",
    configureServer() {
      console.log(`[vite] proxy target (dev) => ${target}`);
    },
    configurePreviewServer() {
      console.log(`[vite] proxy target (preview) => ${target}`);
    },
  };
}

function mkProxy(ws: boolean): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    ws,
    secure: false,
    timeout: 60_000,
    proxyTimeout: 60_000,
    configure: (proxy) => {
      proxy.on("error", (err: any) => {
        const code = err?.code || "";
        if (!["ECONNRESET", "ECONNABORTED", "ECONNREFUSED"].includes(code)) {
          console.error("[vite-proxy] error:", code, err?.message);
        }
      });
      proxy.on("proxyReq", (_proxyReq: any, req: any) => {
        // console.log("[vite-proxy] →", req.method, req.path || req.url);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), logProxyTarget()],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // ⬇️ força Vite/Rollup a usar a build ESM do hls.js
      "hls.js": "hls.js/dist/hls.min.js",
    },
  },

  // Ajuda o otimizador de deps do Vite a pré-resolver hls.js
  optimizeDeps: {
    include: ["hls.js"],
  },

  server: {
    host: true, // aceita conexões da LAN
    port: 8080,
    strictPort: true,
    proxy: {
      "/api": mkProxy(true),     // WS se existir sob /api
      "/opc": mkProxy(false),
      "/mpu": mkProxy(false),
      "/ws": mkProxy(true),

      // 🔽 aceita chamadas do front em /simulation/* e reescreve para /api/simulation/*
      "/simulation": {
        ...mkProxy(false),
        rewrite: (path) => path.replace(/^\/simulation/, "/api/simulation"),
      },
    },
  },

  preview: {
    port: 8080,
    strictPort: true,
    proxy: {
      "/api": mkProxy(true),
      "/opc": mkProxy(false),
      "/mpu": mkProxy(false),
      "/ws": mkProxy(true),
      "/simulation": {
        ...mkProxy(false),
        rewrite: (path) => path.replace(/^\/simulation/, "/api/simulation"),
      },
    },
  },
});
