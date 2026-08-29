import { defineConfig } from "vite";

/** Relative base so the build works on GitHub Pages project sites and file:// previews. */
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
  },
});
