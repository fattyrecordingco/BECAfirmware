import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: resolve(__dirname, "ui"),
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: resolve(__dirname, "ui", "index.html"),
        control: resolve(__dirname, "ui", "control.html"),
        prototype: resolve(__dirname, "ui", "prototype.html")
      }
    }
  },
  server: {
    port: 1420,
    strictPort: true
  }
});
