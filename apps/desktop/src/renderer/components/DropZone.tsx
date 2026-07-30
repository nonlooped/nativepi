import { useEffect, useState } from "react";
import { FolderOpenIcon } from "@phosphor-icons/react/FolderOpen";
import { classifyDrop, draggingFiles } from "../lib/drops.ts";
import { isRemote } from "../lib/rpc.ts";
import { showDropRejected, showHint } from "../lib/toast.tsx";
import { useAppStore } from "../lib/store.ts";

/**
 * The window as a drop target for the two things that open something.
 *
 * A folder is a project and a Pi session file is a chat, and both are otherwise
 * reached through a dialog the user has to find first. Dragging one in is the
 * shorter route, and it works anywhere the composer has not claimed the drag:
 * the composer stops propagation, because a file aimed at the message box is a
 * message about that file rather than something to open.
 *
 * The window also has to answer every other drop, whether or not it can do
 * anything with it. Chromium's default for a dropped file is to navigate to it,
 * which in a packaged app replaces the window with the file and loses the state
 * behind it.
 */
export default function DropZone() {
  const [over, setOver] = useState(false);
  const openProjectPath = useAppStore((s) => s.openProjectPath);
  const importSession = useAppStore((s) => s.importSession);
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);

  useEffect(() => {
    // A browser reaching NativePi over a link has no path behind a dropped file,
    // so nothing here can work and the window keeps its default handling.
    if (isRemote) return;

    let idle = 0;
    const dragOver = (event: DragEvent) => {
      if (!draggingFiles(event.dataTransfer)) return;
      event.preventDefault();
      // The composer answers its own drops and draws its own target, so the
      // window steps back rather than covering it with a second one.
      const target = event.target;
      setOver(!(target instanceof Element && target.closest(".composer-surface")));
      // `dragover` repeats for as long as the pointer is over the window, so
      // its absence is the only signal that the drag left it or ended
      // elsewhere. A leave counter is the usual alternative and needs every
      // enter and leave in the tree to stay balanced.
      clearTimeout(idle);
      idle = window.setTimeout(() => setOver(false), 600);
    };

    const open = async ({ folders, sessions, images, files }: ReturnType<typeof classifyDrop>) => {
      for (const folder of folders) await openProjectPath(folder);
      if (folders.length > 0) showHint(folders.length === 1 ? "Project opened" : `${folders.length} projects opened`);

      // Into the folder that came with them when there was one: dropping a
      // project and its chats together should not import them somewhere else.
      const target = folders.at(-1) ?? activeProjectPath;
      if (sessions.length > 0 && !target) {
        showDropRejected("Open a project before importing a chat into it.");
        return;
      }
      let imported = 0;
      for (const session of sessions) if (await importSession(target ?? undefined, session)) imported++;
      if (imported > 0) showHint(imported === 1 ? "Chat imported" : `${imported} chats imported`);

      if (folders.length === 0 && sessions.length === 0 && images.length + files.length > 0) {
        showDropRejected("Drop files on the message box to add them to a message.");
      }
    };

    const drop = (event: DragEvent) => {
      // Files only: dragging a selection inside the composer is a drop too, and
      // preventing that one would break moving text with the mouse.
      if (!draggingFiles(event.dataTransfer)) return;
      event.preventDefault();
      clearTimeout(idle);
      setOver(false);
      void open(classifyDrop(event.dataTransfer));
    };

    window.addEventListener("dragover", dragOver);
    window.addEventListener("drop", drop);
    return () => {
      clearTimeout(idle);
      window.removeEventListener("dragover", dragOver);
      window.removeEventListener("drop", drop);
    };
  }, [activeProjectPath, importSession, openProjectPath]);

  if (!over) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-background/80 p-6"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-ring px-10 py-8 text-center">
        <FolderOpenIcon weight="fill" className="size-7 text-muted-foreground" />
        <p className="font-heading text-base font-medium">Drop to open</p>
        <p className="max-w-xs text-sm leading-5 text-muted-foreground">
          A folder becomes a project. A Pi chat file is imported into this one.
        </p>
      </div>
    </div>
  );
}
