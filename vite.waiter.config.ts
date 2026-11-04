import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The waiter phone app. Built into dist-waiter/ and served by the local server at /waiter.
export default defineConfig({
  root: path.resolve(import.meta.dirname, "waiter"),
  base: "/waiter/",
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  plugins: [tailwindcss(), viteReact()],
  build: {
    outDir: path.resolve(import.meta.dirname, "dist-waiter"),
    emptyOutDir: true,
    target: "es2020",
  },
});
