import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// `import.meta.glob` cannot take a bare package specifier, and the icon set is a
// plain directory of SVGs rather than an entry point, so it gets an alias
// pointing at wherever the package actually landed in node_modules.
const materialIcons = resolve(
  dirname(createRequire(import.meta.url).resolve("material-icon-theme/package.json")),
  "icons",
);

// One ID is compiled into all three Electron contexts. The dev launcher also
// writes it outside the process, which lets an older window discover that a
// newer launch was attempted even when that attempt lost the port race.
const devGeneration = process.env["NATIVEPI_DEV_GENERATION"] ?? "";
const devDefine = {
  __NATIVEPI_DEV_GENERATION__: JSON.stringify(devGeneration),
};

export default defineConfig({
  main: {
    define: devDefine,
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/main/index.ts"),
          // Pi runs in its own process, started from this second entry rather than
          // from Pi's `rpc-entry`: it installs the extension UI context that makes
          // pi-tui components render in the window. See `main/pi/host/entry.ts`.
          "pi-host": resolve("src/main/pi/host/entry.ts"),
        },
        // Anything with native binaries or platform-specific binary lookups has to
        // stay external: bundling moves the module's relative require() paths to
        // out/main/, where the .node files it looks for do not exist.
        external: [
          "electron",
          /^electron\//,
          /^@earendil-works\//,
          "node-pty",
          "esbuild",
          /^@esbuild\//,
        ],
      },
    },
  },
  preload: {
    define: devDefine,
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/preload/index.ts"),
        },
        external: ["electron", /^electron\//],
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    define: devDefine,
    resolve: {
      alias: {
        "@": resolve("src/renderer"),
        "@material-icons": materialIcons,
      },
    },
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      tailwindcss(),
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/renderer/index.html"),
        },
        output: {
          // The renderer is also served over a public tunnel that runs at a few
          // hundred KB/s, where a single entry chunk means a blank page until
          // the last byte lands. These four are the heavy, independently useful
          // pieces: the terminal, the markdown/syntax stack, and the icon font
          // are all worth deferring past first paint.
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            // Anchored to the package root: an unanchored `react` also matches
            // `@phosphor-icons/react` and every other `*.react` package.
            if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
            if (id.includes("@xterm")) return "terminal";
            // Deliberately not shiki: its ~600 language grammars are already
            // dynamically imported one at a time, and naming them here would
            // collapse the lot into a single 22 MB chunk.
            if (/streamdown|@pierre[\\/]diffs/.test(id)) return "markdown";
          },
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  },
});
