import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { build, type Plugin } from "esbuild";
import { piServices } from "./pi/services.ts";
import type { GraphicalExtension } from "../shared/pi-types.ts";

/**
 * React and `@nativepi/extension-api` are provided by NativePi: those specifiers
 * are rewritten to read from the host's already-loaded modules (exposed on
 * `globalThis.__NATIVEPI_HOST__`) so extension components share NativePi's single
 * React instance instead of bundling their own.
 */

// Names re-exported from the host's React so `import { useState } from "react"`
// resolves statically. Covers the React 19 public surface an extension may use.
const REACT_EXPORTS = [
  "Children", "Component", "Fragment", "Profiler", "PureComponent", "StrictMode", "Suspense",
  "cloneElement", "createContext", "createElement", "createRef", "forwardRef", "isValidElement",
  "lazy", "memo", "startTransition", "use", "useActionState", "useCallback", "useContext",
  "useDebugValue", "useDeferredValue", "useEffect", "useEffectEvent", "useId", "useImperativeHandle",
  "useInsertionEffect", "useLayoutEffect", "useMemo", "useOptimistic", "useReducer", "useRef",
  "useState", "useSyncExternalStore", "useTransition", "version",
];
const JSX_EXPORTS = ["jsx", "jsxs", "Fragment"];
const JSX_DEV_EXPORTS = ["jsxDEV", "Fragment"];
const API_EXPORTS = ["defineRenderer", "version"];

// NativePi's interface components, lent to extensions so their UI carries real
// styles. Tailwind cannot see extension code, so a class an extension writes has
// no rule behind it and only a shared component can look native.
const UI_EXPORTS = [
  "Button",
  "Dialog", "DialogTrigger", "DialogClose", "DialogContent", "DialogHeader",
  "DialogFooter", "DialogTitle", "DialogDescription",
  "Menu", "MenuTrigger", "MenuContent", "MenuGroup", "MenuLabel", "MenuItem", "MenuSeparator", "SettingsActionRow",
];

const HOST_MODULES: Record<string, string[]> = {
  react: REACT_EXPORTS,
  "react/jsx-runtime": JSX_EXPORTS,
  "react/jsx-dev-runtime": JSX_DEV_EXPORTS,
  "@nativepi/extension-api": API_EXPORTS,
  "@nativepi/extension-api/ui": UI_EXPORTS,
};

function configureEsbuildBinary() {
  if (process.env["ESBUILD_BINARY_PATH"] || !process.resourcesPath) return;
  const binary = path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    "node_modules",
    "@esbuild",
    `${process.platform}-${process.arch}`,
    ...(process.platform === "win32" ? ["esbuild.exe"] : ["bin", "esbuild"]),
  );
  if (existsSync(binary)) process.env["ESBUILD_BINARY_PATH"] = binary;
}

function shimFor(key: string, names: string[]): string {
  const m = `globalThis.__NATIVEPI_HOST__[${JSON.stringify(key)}]`;
  const named = names.map((n) => `export const ${n} = ${m}[${JSON.stringify(n)}];`).join("\n");
  return `const __m = ${m};\nexport default (__m.default ?? __m);\n${named}\n`;
}

const hostGlobalsPlugin: Plugin = {
  name: "nativepi-host-globals",
  setup(pluginBuild) {
    const filter = /^(react|react\/jsx-runtime|react\/jsx-dev-runtime|@nativepi\/extension-api(\/ui)?)$/;
    pluginBuild.onResolve({ filter }, (args) => ({ path: args.path, namespace: "nativepi-host" }));
    pluginBuild.onLoad({ filter: /.*/, namespace: "nativepi-host" }, (args) => ({
      contents: shimFor(args.path, HOST_MODULES[args.path] ?? []),
      loader: "js",
    }));
  },
};

function candidateRoots(projectDir: string): string[] {
  const roots = new Set<string>([projectDir]);
  try {
    for (const pkg of piServices(projectDir).pm.listConfiguredPackages()) {
      if (pkg.installedPath) roots.add(pkg.installedPath);
    }
  } catch {
  }
  return [...roots];
}

async function readManifest(root: string): Promise<{ name: string; renderer: string } | null> {
  try {
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
      name?: string;
      nativepi?: { renderer?: string };
    };
    const renderer = pkg.nativepi?.renderer;
    if (!renderer) return null;
    return { name: pkg.name ?? path.basename(root), renderer };
  } catch {
    return null;
  }
}

export async function loadGraphicalExtensions(projectDir: string): Promise<GraphicalExtension[]> {
  // child_process cannot launch esbuild's executable from app.asar. Its package
  // is deliberately unpacked for distribution, so point esbuild at that copy.
  configureEsbuildBinary();
  const extensions = await Promise.all(candidateRoots(projectDir).map(async (root) => {
    const manifest = await readManifest(root);
    if (!manifest) return null;
    const entry = path.resolve(root, manifest.renderer);
    try {
      const result = await build({
        entryPoints: [entry],
        bundle: true,
        format: "esm",
        platform: "browser",
        jsx: "automatic",
        write: false,
        logLevel: "silent",
        plugins: [hostGlobalsPlugin],
      });
      return { id: root, name: manifest.name, code: result.outputFiles[0]?.text ?? "" };
    } catch (err) {
      return { id: root, name: manifest.name, code: "", error: err instanceof Error ? err.message : String(err) };
    }
  }));
  return extensions.filter((extension): extension is GraphicalExtension => extension !== null);
}
