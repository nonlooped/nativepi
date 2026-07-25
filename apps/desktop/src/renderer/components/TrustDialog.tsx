import { useEffect, useState } from "react";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
import { ShieldWarningIcon } from "@phosphor-icons/react/ShieldWarning";
import { useAppStore } from "../lib/store.ts";
import { rpc } from "../lib/rpc.ts";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";

export default function TrustDialog() {
  const trustPrompt = useAppStore((s) => s.trustPrompt);
  const trustActiveProject = useAppStore((s) => s.trustActiveProject);
  const dismissTrust = useAppStore((s) => s.dismissTrust);

  if (!trustPrompt) return null;

  return (
    <Dialog open onOpenChange={(next) => !next && dismissTrust()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-base font-semibold">
            <ShieldWarningIcon weight="fill" className="size-5 text-warning" />
            Trust this project?
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            This folder contains local Pi extensions or skills. Running the agent here will execute that code with your
            permissions. Only trust folders whose contents you recognize.
          </DialogDescription>
        </DialogHeader>

        <p
          className="rounded-md border bg-muted/40 px-2.5 py-2 font-mono text-xs break-all"
          title={trustPrompt.projectPath}
        >
          {trustPrompt.projectPath}
        </p>

        <LocalCodeSummary projectPath={trustPrompt.projectPath} />

        <p className="text-xs leading-relaxed text-muted-foreground">
          Continuing without trust keeps project-local extensions and skills disabled. NativePi will ask again next
          time, and you can change this later from the project status in the header.
        </p>

        {/*
          Not `destructive`: in this palette coral means "this destroys
          something", and for a developer opening their own repository the
          correct action then looks like a delete button. The warning is carried
          by the icon, the copy, and the enumerated file list — the affirmative
          keeps the ordinary primary treatment, and Escape still takes the safe
          path.
        */}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={dismissTrust}>
            Continue without local extensions
          </Button>
          <Button onClick={() => void trustActiveProject()}>Trust and load local code</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LocalCodeSummary({ projectPath }: { projectPath: string }) {
  const [state, setState] = useState<{ names: string[]; failed: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState(null);
    void rpc.request
      .listPackages({ projectDir: projectPath })
      .then((result) => {
        if (cancelled) return;
        const names = [
          ...result.extensions.filter((extension) => extension.enabled).map((extension) => extension.path),
          ...result.packages.filter((pkg) => pkg.scope === "project").map((pkg) => pkg.source),
        ];
        setState({ names: [...new Set(names)], failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ names: [], failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  if (state === null) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CircleNotchIcon className="animate-spin" />
        Checking what this folder would run…
      </p>
    );
  }

  if (state.failed) {
    return <p className="text-xs text-warning">Could not read this folder's extensions. Trust it only if you know it.</p>;
  }

  if (state.names.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Pi reported no resolvable extensions yet. Trusting also allows any it discovers later in this folder.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium">
        {state.names.length} local {state.names.length === 1 ? "item" : "items"} would run:
      </p>
      <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-md border bg-muted/40 px-2.5 py-2">
        {state.names.map((name) => (
          <li key={name} className="truncate font-mono text-xs text-muted-foreground" title={name}>
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}
