import { useState } from "react";
import { FolderIcon } from "@phosphor-icons/react/Folder";
import { useAppStore } from "../lib/store.ts";
import { Button } from "./ui/button.tsx";
import WorktreeDialog from "./WorktreeDialog.tsx";

export default function WorkspaceSwitcher() {
  const path = useAppStore(s => s.activeProjectPath);
  const hidden = useAppStore(s => s.destination === "chat" || s.activeProjectPath === s.workRoot);
  const isRepo = useAppStore(s => s.git?.isRepo ?? false);
  const name = useAppStore(s => s.projects.find(p => p.path === s.activeProjectPath)?.name);
  const [open, setOpen] = useState(false);
  if (!path || hidden) return null;
  const label = name ?? path.split(/[\\/]/).filter(Boolean).at(-1) ?? "Project folder";
  return <>{isRepo ? <Button variant="ghost" className="max-w-56 min-w-0 gap-1.5 rounded-lg px-2" title="Choose the folder for this work, or create a separate workspace" onClick={() => setOpen(true)}><FolderIcon /><span className="truncate">{label}</span></Button>
    : <span className="flex h-8 min-w-0 items-center gap-1.5 px-2 text-sm text-muted-foreground"><FolderIcon className="size-4 shrink-0" /><span className="truncate">{label}</span></span>}
    <WorktreeDialog projectPath={open ? path : null} onClose={() => setOpen(false)} />
  </>;
}
