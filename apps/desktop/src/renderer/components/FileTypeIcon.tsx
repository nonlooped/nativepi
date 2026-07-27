import { fileIconUrl } from "../lib/fileIcons.ts";
import { cn } from "@/lib/utils.ts";

/**
 * The icon for a file, chosen from its name.
 *
 * Decorative on purpose: every place this appears, the file name is right next
 * to it, so the icon repeats what the label already says and screen readers are
 * better off skipping it.
 */
export default function FileTypeIcon({ path, size = 16, className }: { path: string; size?: number; className?: string }) {
  return (
    <img
      src={fileIconUrl(path)}
      alt=""
      aria-hidden
      draggable={false}
      className={cn("shrink-0 select-none object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
