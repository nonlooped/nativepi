import manifest from "material-icon-theme/dist/material-icons.json";

/**
 * The Material Icon Theme catalog: the manifest VS Code reads, plus the ~1250
 * SVGs it points at, inlined.
 *
 * This module exists to be a chunk. Nothing on the first screen needs a file
 * icon, and together the manifest and the icons are well over a megabyte, so
 * `fileIcons.ts` pulls it in on demand rather than letting it sit in the entry
 * bundle where it would delay first paint over the public tunnel.
 *
 * The SVGs are inlined as source rather than emitted as files because a file
 * per icon costs an HTTP request per visible row: eighty icons measured at
 * eleven seconds over that tunnel, against one request for all of them here.
 */

const DEFAULT_ICON = "file";

const ICON_SOURCES = import.meta.glob<string>("@material-icons/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

const SVG_BY_FILE = new Map<string, string>(
  Object.entries(ICON_SOURCES).map(([path, svg]) => [path.slice(path.lastIndexOf("/") + 1), svg]),
);

const iconDefinitions: Record<string, { iconPath: string }> = manifest.iconDefinitions;
const fileNames: Record<string, string> = manifest.fileNames;
const fileExtensions: Record<string, string> = manifest.fileExtensions;

/** The last path segment, for either separator, with any trailing slash ignored. */
function basename(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return cut === -1 ? trimmed : trimmed.slice(cut + 1);
}

/**
 * The catalog's name for a path's icon, e.g. `nodejs` for `package.json`.
 *
 * A whole-name match wins, so `tsconfig.json` is a TypeScript config rather than
 * generic JSON. Failing that, extensions are tried longest first, which is what
 * separates `types.d.ts` and `Button.test.tsx` from any other `.ts` file.
 */
export function iconName(path: string): string {
  const name = basename(path).toLowerCase();
  if (!name) return DEFAULT_ICON;

  const byName = fileNames[name];
  if (byName) return byName;

  const parts = name.split(".");
  for (let i = 1; i < parts.length; i++) {
    const byExtension = fileExtensions[parts.slice(i).join(".")];
    if (byExtension) return byExtension;
  }

  return DEFAULT_ICON;
}

const svgCache = new Map<string, string>();

/** The SVG source for `path`, always resolvable: unknown types fall back to a blank page. */
export function iconSvg(path: string): string {
  const cached = svgCache.get(path);
  if (cached !== undefined) return cached;

  // The manifest points at `./../icons/<name>.svg`, and clones add a `.clone`
  // infix, so the file name is read off the definition rather than rebuilt.
  const iconPath = iconDefinitions[iconName(path)]?.iconPath ?? "";
  const svg = SVG_BY_FILE.get(basename(iconPath)) ?? SVG_BY_FILE.get(`${DEFAULT_ICON}.svg`) ?? "";

  svgCache.set(path, svg);
  return svg;
}
