/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In dev, /api is proxied to the local attendance server. In production the server serves dist/ itself (same origin).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 127.0.0.1 (not "localhost") avoids Windows resolving to IPv6 ::1 first. secure:false accepts the server's own HTTPS certificate.
    proxy: { "/api": { target: process.env.API_URL ?? "http://127.0.0.1:3000", changeOrigin: true, secure: false } },
  },
  test: { environment: "jsdom", setupFiles: ["./test/setup.ts"], globals: true },
});
