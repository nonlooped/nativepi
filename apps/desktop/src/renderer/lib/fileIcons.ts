import manifest from "material-icon-theme/dist/material-icons.json";

/**
 * The icon that belongs to a path, from the Material Icon Theme catalog.
 *
 * Nothing here is a hand-written list of file types. The package ships the same
 * manifest VS Code reads — a couple of thousand filenames and extensions mapped
 * onto around 1250 SVGs — and this file only does the lookup that manifest
 * describes, so `package.json` gets the Node icon and `main.go` gets the gopher
 * without this app knowing either of those facts.
 *
 * The catalog also carries `_light` variants for icons that would vanish on a
 * pale background. The window is dark-only (`index.html` pins `class="dark"`),
 * so the default set is the right one; if a light theme ever lands, the
 * manifest's `light` maps are the place to start.
 */

const DEFAULT_ICON = "file";

/**
 * Every icon in the catalog, keyed by file name.
 *
 * Eager because a list of changed files asks for a dozen icons the moment it
 * renders, and a lazy import per row would flash empty first. `no-inline` keeps
 * them as emitted files: the small ones would otherwise become base64 data URIs
 * and drag several megabytes into the startup bundle.
 */
const ICON_URLS = import.meta.glob<string>("@material-icons/*.svg", {
  query: "?url&no-inline",
  import: "default",
  eager: true,
});

const URL_BY_FILE = new Map<string, string>(
  Object.entries(ICON_URLS).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1), url]),
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
export function fileIconName(path: string): string {
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

const urlCache = new Map<string, string>();

/** The URL of the icon for `path`, always resolvable: unknown types fall back to a blank page. */
export function fileIconUrl(path: string): string {
  const cached = urlCache.get(path);
  if (cached !== undefined) return cached;

  const name = fileIconName(path);
  // The manifest points at `./../icons/<name>.svg`, and clones add a `.clone`
  // infix, so the file name is read off the definition rather than rebuilt.
  const iconPath = iconDefinitions[name]?.iconPath ?? "";
  const url = URL_BY_FILE.get(basename(iconPath)) ?? URL_BY_FILE.get(`${DEFAULT_ICON}.svg`) ?? "";

  urlCache.set(path, url);
  return url;
}
