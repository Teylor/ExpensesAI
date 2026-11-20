import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "AgenticF — Finanzas Personales Agentic-First",
        short_name: "AgenticF",
        description:
          "PWA offline-first y multimoneda de finanzas personales con paridad total UI ↔ Agente.",
        theme_color: "#09090b",
        background_color: "#09090b",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: "/index.html",
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    allowedHosts: [".ts.net"],
    ...(process.env.CHOKIDAR_USEPOLLING === "true"
      ? {
          watch: {
            usePolling: true,
            interval: Number(process.env.CHOKIDAR_INTERVAL ?? 300),
          },
        }
      : {}),
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
