// Vite lib config for the frozen 0.1.0 simulation archive. Bundles only
// the simulation/E3 public entry (src/index.ts) and its existing runtime
// dependency (zod) into one browser-compatible ESM file. No Node builtins,
// no secrets, no model provider code.
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");

export default {
  root: pkgRoot,
  logLevel: "warn",
  build: {
    outDir: path.join(here, "0.1.0"),
    emptyOutDir: false,
    sourcemap: false,
    minify: false,
    target: "es2022",
    lib: {
      entry: path.join(pkgRoot, "src", "index.ts"),
      formats: ["es"],
      fileName: () => "runtime.mjs",
    },
    rollupOptions: {
      external: [],
      output: { codeSplitting: false },
    },
  },
};
