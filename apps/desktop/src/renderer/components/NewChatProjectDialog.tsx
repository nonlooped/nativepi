import type { Project } from "../../shared/rpc-schema.ts";
import { useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { FolderIcon } from "@phosphor-icons/react/Folder";
import { FolderOpenIcon } from "@phosphor-icons/react/FolderOpen";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { useAppStore } from "../lib/store.ts";
import { useWorkProjects } from "../lib/workProjects.ts";
import { rpc } from "../lib/rpc.ts";
import { Button } from "@/components/ui/button.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
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
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0" closeClassName="top-2.5 right-3">
        <DialogTitle className="sr-only">Choose a project</DialogTitle>
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
          aria-label="Choose a project for the new chat"
        >
          <div className="relative border-b">
            <MagnifyingGlassIcon
              className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Combobox.Input
              autoFocus
              placeholder="Choose a project"
              aria-label="Search projects"
              className="h-12 w-full rounded-none border-0 bg-transparent pr-12 pl-11 text-base outline-none placeholder:text-muted-foreground/80"
            />
          </div>

          <Combobox.List className="flex max-h-[min(24rem,calc(var(--app-height,100dvh)-9rem))] min-h-32 flex-col gap-0.5 overflow-y-auto p-2">
            {matches.length > 0 ? (
              <div className="px-2 pb-1 pt-0.5 text-xs font-medium text-muted-foreground">Projects</div>
            ) : null}
            {matches.map((project, index) => (
              <Combobox.Item
                key={project.path}
                value={project}
                index={index}
                onClick={() => void startChat(project.path)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-accent/60 data-highlighted:bg-accent data-highlighted:text-accent-foreground"
              >
                <FolderIcon
                  className="shrink-0 text-muted-foreground"
                  weight={project.path === activeProjectPath ? "fill" : "regular"}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{project.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{project.path === workRoot ? "General work on your device" : project.path}</span>
                </span>
                {project.path === activeProjectPath ? (
                  <span className="shrink-0 text-xs text-muted-foreground">Current</span>
                ) : null}
              </Combobox.Item>
            ))}
            {matches.length === 0 ? (
              <p className="flex min-h-28 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                {projects.length === 0 ? "No projects yet." : `No projects match “${query.trim()}”.`}
              </p>
            ) : null}
          </Combobox.List>
        </Combobox.Root>

        <div className="flex items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
          <Button variant="ghost" size="sm" className="mr-auto" onClick={() => void openAnotherFolder()}>
            <FolderOpenIcon data-icon="inline-start" />
            Open folder
          </Button>
          <span className="hidden items-center gap-1.5 sm:flex">
            <Kbd>↑↓</Kbd> navigate
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <Kbd>Enter</Kbd> select
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
