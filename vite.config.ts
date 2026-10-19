import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  // Tauri expects a fixed port and fails if it is not available.
  clearScreen: false,
  server: host
    ? {
        port: 1420,
        strictPort: true,
        host,
        hmr: { protocol: "ws", host, port: 1421 },
        watch: { ignored: ["**/src-tauri/**"] },
      }
    : {
        port: 1420,
        strictPort: true,
        watch: { ignored: ["**/src-tauri/**"] },
      },

  // Produce a build that the Tauri webview can consume.
  build: {
    target: "es2022",
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },

  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
  },
});
