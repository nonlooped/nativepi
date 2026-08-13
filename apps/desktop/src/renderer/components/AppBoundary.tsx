import { Component, type ReactNode } from "react";
import NativePiWordmark from "./NativePiWordmark.tsx";
import WindowControls from "./WindowControls.tsx";
import { isDesktopShell } from "../lib/platform.ts";
import { rpc } from "../lib/rpc.ts";
import { Button } from "@/components/ui/button.tsx";

interface State {
  error?: string;
}

/**
 * Last-resort boundary around the whole renderer. Without it, a render error
 * anywhere outside an extension slot unmounts the root and leaves a blank
 * frameless window with no close button and no way back. The window `error`
 * listener in `main.tsx` never sees an error a boundary catches, so this one
 * reports to the main process itself.
 */
export default class AppBoundary extends Component<{ children: ReactNode }, State> {
  state: State = {};

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  override componentDidCatch(error: unknown): void {
    if (!isDesktopShell) return;
    void rpc.request
      .reportRendererError({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      .catch(() => {});
  }

  override render(): ReactNode {
    if (this.state.error === undefined) return this.props.children;
    return (
      <div className="relative flex h-full items-center justify-center overflow-hidden bg-background text-foreground">
        <div role="alert" className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
          <NativePiWordmark display />
          <p className="text-sm text-body-muted-foreground">
            NativePi hit an error it could not recover from. Reloading the window is safe:
            conversations live in Pi's session files and drafts are preserved.
          </p>
          <p className="max-w-full break-words font-mono text-xs text-muted-foreground">{this.state.error}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload window
          </Button>
        </div>
        <WindowControls />
      </div>
    );
  }
}
