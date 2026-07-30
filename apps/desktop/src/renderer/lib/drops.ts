import { rpc } from "./rpc.ts";

/**
 * What a drop is carrying, sorted into the four things NativePi can do with it.
 *
 * A drop is the same gesture everywhere in the window, so what it means has to
 * be decided from the payload rather than from where it landed: a folder is a
 * project, a Pi session file is a chat to import, an image is an attachment, and
 * anything else is a path the agent should be pointed at. Deciding that in one
 * place is what keeps the window and the composer from disagreeing about a drop
 * that hits both.
 *
 * Paths come from Electron's `webUtils`, which a browser has no answer for, so
 * everything but the images is empty over a remote link.
 */
export interface Dropped {
  /** Directories, each one a project to add or open. */
  folders: string[];
  /** `.jsonl` files, each one a Pi session to import. */
  sessions: string[];
  /** Images, as the `File` the attachment path already reads bytes from. */
  images: File[];
  /** Everything else, as paths to mention in the message. */
  files: string[];
}

const EMPTY: Dropped = { folders: [], sessions: [], images: [], files: [] };

/**
 * Whether a drag still in the air is carrying files at all.
 *
 * `items` describes only kinds and mime types until the drop, and a folder
 * reports neither a type nor a size, so nothing more specific than "these are
 * files" can be known while the pointer is moving. Everything that decides what
 * the drop means happens in `classifyDrop`.
 */
export function draggingFiles(transfer: DataTransfer | null): boolean {
  if (!transfer) return false;
  return transfer.types.includes("Files") || [...transfer.items].some((item) => item.kind === "file");
}

/**
 * Sort a drop into `Dropped`.
 *
 * Read from `items` rather than `files`, because `webkitGetAsEntry` is the only
 * thing that separates a folder from a file with no extension and it hangs off
 * the item, not off the `File`. Both have to be read synchronously: the entries
 * are revoked as soon as the event handler returns.
 */
export function classifyDrop(transfer: DataTransfer | null): Dropped {
  if (!transfer) return EMPTY;
  const dropped: Dropped = { folders: [], sessions: [], images: [], files: [] };

  for (const item of transfer.items) {
    if (item.kind !== "file") continue;
    const isDirectory = item.webkitGetAsEntry()?.isDirectory ?? false;
    const file = item.getAsFile();
    // A directory yields a `File` with no bytes behind it, so only its path is
    // of any use, and a browser that cannot supply one has nothing to offer.
    const path = file ? rpc.filePath(file) : "";

    if (isDirectory) {
      if (path) dropped.folders.push(path);
    } else if (path.toLowerCase().endsWith(".jsonl")) {
      dropped.sessions.push(path);
    } else if (file?.type.startsWith("image/")) {
      dropped.images.push(file);
    } else if (path) {
      dropped.files.push(path);
    }
  }

  return dropped;
}

/**
 * How a dropped path should read as an `@` mention.
 *
 * Relative to the project when it is inside it, which is the form the file menu
 * offers and the form Pi resolves. A file from somewhere else keeps its absolute
 * path: shortening it would point the agent at a file that does not exist, and
 * refusing it would silently drop something the user aimed at the composer.
 * Slashes are normalized either way, because a chip runs to the next space and a
 * backslash before one would swallow it.
 */
export function mentionPath(projectDir: string, path: string): string {
  const root = projectDir.replace(/[\\/]+$/, "");
  const inside = path.toLowerCase().startsWith(`${root.toLowerCase()}\\`)
    || path.toLowerCase().startsWith(`${root.toLowerCase()}/`);
  return (inside ? path.slice(root.length + 1) : path).replace(/\\/g, "/");
}
