import type { ReactElement } from "react";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { FileArrowUpIcon } from "@phosphor-icons/react/FileArrowUp";
import { FolderOpenIcon } from "@phosphor-icons/react/FolderOpen";
import { absoluteProjectPath, editorName, fileManagerName } from "@/lib/paths.ts";
import { rpc } from "@/lib/rpc.ts";
import { useAppStore } from "@/lib/store.ts";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";

export default function FileContextMenu({
  projectDir,
  file,
  patch,
  untracked = false,
  children,
}: {
  projectDir: string;
  file: string;
  patch?: string;
  untracked?: boolean;
  children: ReactElement;
}) {
  const editorId = useAppStore((s) => s.preferences.preferredEditorId);
  const absolutePath = absoluteProjectPath(projectDir, file);

  async function copyDiff() {
    const text = patch ?? (await rpc.request.gitDiff({ projectDir, file, untracked })).diff.patch;
    await navigator.clipboard.writeText(text);
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className="w-56">
        <ContextMenuItem onClick={() => void rpc.request.openFileIn({ projectDir, file, editorId })}>
          <FileArrowUpIcon /> Open in {editorName(editorId)}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => void rpc.request.showInFolder({ path: absolutePath })}>
          <FolderOpenIcon /> Reveal in {fileManagerName()}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => void navigator.clipboard.writeText(file)}>
          <CopyIcon /> Copy relative path
        </ContextMenuItem>
        <ContextMenuItem onClick={() => void navigator.clipboard.writeText(absolutePath)}>
          <CopyIcon /> Copy absolute path
        </ContextMenuItem>
        <ContextMenuItem onClick={() => void copyDiff()}>
          <CopyIcon /> Copy diff as patch
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
