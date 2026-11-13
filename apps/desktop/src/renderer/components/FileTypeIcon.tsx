import { useSyncExternalStore } from "react";
import { fileIconCatalog, subscribeFileIcons } from "../lib/fileIcons.ts";
import { cn } from "@/lib/utils.ts";

/**
 * The icon for a file, chosen from its name.
 *
 * Decorative on purpose: every place this appears, the file name is right next
 * to it, so the icon repeats what the label already says and screen readers are
 * better off skipping it.
 *
 * The markup is the catalog's own SVG source, which ships with the app. The
 * path only ever selects an entry; it is never interpolated into the markup.
 */
export default function FileTypeIcon({ path, size = 16, className }: { path: string; size?: number; className?: string }) {
  const catalog = useSyncExternalStore(subscribeFileIcons, fileIconCatalog);
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 select-none [&>svg]:size-full", className)}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={catalog ? { __html: catalog.iconSvg(path) } : undefined}
    />
  );
}
