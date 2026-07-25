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

const HOST_MODULES: Record<string, string[]> = {
  react: REACT_EXPORTS,
  "react/jsx-runtime": JSX_EXPORTS,
  "react/jsx-dev-runtime": JSX_DEV_EXPORTS,
  "@nativepi/extension-api": API_EXPORTS,
};

function shimFor(key: string, names: string[]): string {
  const m = `globalThis.__NATIVEPI_HOST__[${JSON.stringify(key)}]`;
  const named = names.map((n) => `export const ${n} = ${m}[${JSON.stringify(n)}];`).join("\n");
  return `const __m = ${m};\nexport default (__m.default ?? __m);\n${named}\n`;
}

const hostGlobalsPlugin: Plugin = {
  name: "nativepi-host-globals",
  setup(pluginBuild) {
    const filter = /^(react|react\/jsx-runtime|react\/jsx-dev-runtime|@nativepi\/extension-api)$/;
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
  const out: GraphicalExtension[] = [];
  for (const root of candidateRoots(projectDir)) {
    const manifest = await readManifest(root);
    if (!manifest) continue;
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
      out.push({ id: root, name: manifest.name, code: result.outputFiles[0]?.text ?? "" });
    } catch (err) {
      out.push({ id: root, name: manifest.name, code: "", error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}
