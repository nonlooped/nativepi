import type { Project } from "../../shared/rpc-schema.ts";
import { useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { DesktopIcon } from "@phosphor-icons/react/Desktop";
import { FolderIcon } from "@phosphor-icons/react/Folder";
import { FolderOpenIcon } from "@phosphor-icons/react/FolderOpen";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { useAppStore } from "../lib/store.ts";
import { useWorkProjects } from "../lib/workProjects.ts";
import { rpc } from "../lib/rpc.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog.tsx";

export default function NewChatProjectDialog({
  open,
  onOpenChange,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: () => void;
}) {
  const projects = useWorkProjects();
  const workRoot = useAppStore(s => s.workRoot);
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const newChatIn = useAppStore((s) => s.newChatIn);
  const [query, setQuery] = useState("");
  const search = query.trim().toLocaleLowerCase();
  const ordered = [...projects].sort((left, right) => {
    if (left.path === activeProjectPath) return -1;
    if (right.path === activeProjectPath) return 1;
    return 0;
  });
  const matches = search
    ? ordered.filter((project) => `${project.name}\n${project.path}`.toLocaleLowerCase().includes(search))
    : ordered;

  async function startChat(path: string) {
    onOpenChange(false);
    await newChatIn(path);
    onNavigate?.();
  }

  async function openAnotherFolder() {
    const { path } = await rpc.request.pickProject({});
    if (!path) return;
    onOpenChange(false);
    await newChatIn(path);
    onNavigate?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 overflow-hidden rounded-lg border-0 p-0 text-xs shadow-md ring-1 ring-foreground/10 sm:p-0" closeClassName="top-1.5 right-1.5">
        <DialogTitle className="sr-only">New Work chat</DialogTitle>
        <DialogDescription className="sr-only">
          Choose a project folder, or start without a project.
        </DialogDescription>

        <Combobox.Root<Project>
          items={matches}
          inline
          open={open}
          itemToStringLabel={(project) => project.name}
          filter={null}
          inputValue={query}
          onInputValueChange={setQuery}
          autoHighlight
          aria-label="Choose where to start the chat"
        >
          <div className="mx-2 flex shrink-0 items-center gap-2 border-b border-border/50 pr-8 focus-within:border-ring">
            <MagnifyingGlassIcon
              className="ml-1 size-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <Combobox.Input
              autoFocus
              placeholder="Search projects…"
              aria-label="Search projects"
              className="h-10 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <Combobox.List className="flex min-h-0 max-h-[min(24rem,calc(var(--app-height,100dvh)-8rem))] flex-col gap-0.5 overflow-y-auto overscroll-contain p-1.5">
            {matches.map((project, index) => (
              <Combobox.Item
                key={project.path}
                value={project}
                index={index}
                onClick={() => void startChat(project.path)}
                className="flex w-full shrink-0 cursor-default items-center gap-2.5 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-muted/70 data-highlighted:bg-accent/80 data-highlighted:text-accent-foreground"
              >
                {project.path === workRoot ? (
                  <DesktopIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <FolderIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] font-medium">{project.name}</span>
                  <span className="truncate text-[11px] leading-4 text-muted-foreground">{project.path === workRoot ? "General work on your device" : project.path}</span>
                </span>
                {project.path === activeProjectPath ? (
                  <span className="shrink-0 text-[11px] text-muted-foreground">Current</span>
                ) : null}
              </Combobox.Item>
            ))}
            {matches.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                {projects.length === 0 ? "No projects yet." : `No projects match “${query.trim()}”.`}
              </p>
            ) : null}
          </Combobox.List>
        </Combobox.Root>

        <div className="shrink-0 border-t border-border/50 p-1.5">
          <Button variant="ghost" size="sm" className="h-8 w-full justify-start gap-2.5 px-2" onClick={() => void openAnotherFolder()}>
            <FolderOpenIcon className="size-4" aria-hidden="true" />
            Open folder…
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
