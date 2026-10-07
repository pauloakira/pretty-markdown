import { cp, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

/** Where the app serves pdf.js's data files from (see PDF_ASSETS_BASE in the viewer). */
const PDFJS_ASSETS_URL = "/pdfjs/";
/** pdf.js data folders fetched at runtime: CJK character maps, the standard 14 fonts,
 * wasm image decoders (JPEG 2000, JBIG2) + colour management, and ICC profiles. */
const PDFJS_ASSET_DIRS = ["cmaps", "standard_fonts", "wasm", "iccs"];

/**
 * Ships pdf.js's runtime data files with the app so PDFs render fully offline: served
 * from node_modules in dev, copied into the build output for production. Without the
 * character maps, CJK text and some non-embedded fonts render wrong or not at all.
 */
function pdfjsAssets(): Plugin {
  const pdfjsRoot = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
  let outDir = "dist";

  return {
    name: "pdfjs-assets",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use(PDFJS_ASSETS_URL, async (req, res, next) => {
        const relative = normalize(decodeURIComponent((req.url ?? "").split("?")[0])).replace(/^[/\\]+/, "");
        const [dir] = relative.split(/[/\\]/);
        const file = join(pdfjsRoot, relative);
        // Only the asset folders, and never a path that escapes them.
        if (!PDFJS_ASSET_DIRS.includes(dir) || !file.startsWith(join(pdfjsRoot, dir) + sep)) {
          next();
          return;
        }
        try {
          if (!(await stat(file)).isFile()) throw new Error("not a file");
          if (file.endsWith(".wasm")) res.setHeader("Content-Type", "application/wasm");
          res.end(await readFile(file));
        } catch {
          next();
        }
      });
    },
    async writeBundle() {
      await Promise.all(
        PDFJS_ASSET_DIRS.map((dir) =>
          cp(join(pdfjsRoot, dir), join(outDir, PDFJS_ASSETS_URL, dir), { recursive: true }),
        ),
      );
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), pdfjsAssets()],

  build: {
    // Split the heavy math engines into their own chunks so they don't bloat the main
    // app chunk. MathJax (all TeX packages) is large but only the fallback renderer;
    // a future optimization is to load it lazily on first use. pdf.js gets its own chunk
    // too, but that one is loaded on demand (the first time a PDF tab is shown).
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules/mathjax-full")) return "mathjax";
          if (id.includes("node_modules/katex")) return "katex";
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 1900,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
