import { useEffect, useState } from "react";
import { CircleNotchIcon } from "@phosphor-icons/react/CircleNotch";
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
      <DialogContent className="min-w-0 gap-3">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex items-center gap-2 text-title">
            Trust this project?
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-body-muted-foreground">
            Trust allows this folder’s Pi extensions and skills to run with your permissions, including code discovered later.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-2">
          <p className="min-w-0 max-w-full font-mono text-xs break-all text-muted-foreground" title={trustPrompt.projectPath}>
            {trustPrompt.projectPath}
          </p>
          <LocalCodeSummary projectPath={trustPrompt.projectPath} />
        </div>

        <p className="min-w-0 text-xs leading-relaxed text-body-muted-foreground">
          Without trust, local extensions and skills stay disabled.
        </p>

        <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end sm:border-t sm:border-border/60 sm:pt-5">
          <Button variant="outline" size="lg" className="w-full max-w-full whitespace-normal sm:w-auto" onClick={dismissTrust}>
            Open without trust
          </Button>
          <Button size="lg" className="w-full max-w-full whitespace-normal sm:w-auto" onClick={() => void trustActiveProject()}>
            Trust and load code
          </Button>
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
        Checking local code…
      </p>
    );
  }

  if (state.failed) {
    return <p className="text-xs text-warning">Could not list local extensions.</p>;
  }

  if (state.names.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium">
        {state.names.length} local {state.names.length === 1 ? "item" : "items"} would run:
      </p>
      <ul className="flex min-w-0 max-h-32 flex-col gap-1 overflow-x-hidden overflow-y-auto rounded-md border bg-muted/40 px-2.5 py-2">
        {state.names.map((name) => (
          <li key={name} className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={name}>
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}
