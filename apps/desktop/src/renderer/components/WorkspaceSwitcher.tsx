import { useState } from "react";
import { FolderIcon } from "@phosphor-icons/react/Folder";
import { GitBranchIcon } from "@phosphor-icons/react/GitBranch";
import { useAppStore } from "../lib/store.ts";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import WorktreeDialog from "./WorktreeDialog.tsx";

export default function WorkspaceSwitcher() {
  const path = useAppStore((s) => s.activeProjectPath);
  const isRepo = useAppStore((s) => s.git?.isRepo ?? false);
  const [worktreePath, setWorktreePath] = useState<string | null>(null);
  if (!path) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <FolderIcon /> Current checkout
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Workspace</DropdownMenuLabel>
            <DropdownMenuItem><FolderIcon /> Current checkout</DropdownMenuItem>
            <DropdownMenuItem disabled={!isRepo} onClick={() => setWorktreePath(path)}><GitBranchIcon /> New worktree</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <WorktreeDialog projectPath={worktreePath} onClose={() => setWorktreePath(null)} />
    </>
  );
}
