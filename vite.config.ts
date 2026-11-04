import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Plain single-page app: loaded by the Tauri window in production. In development the
// local server (bun server/main.ts) runs on 8787 and is proxied here.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/ws": { target: "ws://127.0.0.1:8787", ws: true },
    },
    watch: { ignored: ["**/src-tauri/**", "**/data/**"] },
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    tailwindcss(),
    viteReact(),
  ],
  build: {
    target: "es2022",
  },
});
