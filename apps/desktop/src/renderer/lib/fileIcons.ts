/**
 * On-demand access to the file icon catalog.
 *
 * The catalog itself is a megabyte of manifest and SVG source, so it lives in
 * `materialIcons.ts` and is fetched the first time anything asks for an icon.
 * This module is only the loader: a subscription for React, and a promise for
 * the imperative composer chips.
 *
 * Icons resolve one tick late on the very first ask. That is deliberate — the
 * alternative is a megabyte in the entry chunk, which over the public tunnel is
 * a megabyte of blank page before anything renders at all.
 */

type Catalog = typeof import("./materialIcons.ts");

let catalog: Catalog | undefined;
let pending: Promise<Catalog> | undefined;
const listeners = new Set<() => void>();

function load(): Promise<Catalog> {
  pending ??= import("./materialIcons.ts").then((loaded) => {
    catalog = loaded;
    for (const listener of listeners) listener();
    return loaded;
  });
  return pending;
}

/** Subscribe to the catalog arriving; starts the load on first subscriber. */
export function subscribeFileIcons(listener: () => void): () => void {
  void load();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The catalog if it has arrived, for a synchronous render. */
export function fileIconCatalog(): Catalog | undefined {
  return catalog;
}

/** The SVG source for a path, waiting for the catalog if it is not loaded yet. */
export async function fileIconSvg(path: string): Promise<string> {
  return (catalog ?? (await load())).iconSvg(path);
}
