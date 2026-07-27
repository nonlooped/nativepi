import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { SplitHorizontalIcon } from "@phosphor-icons/react/SplitHorizontal";
import { TerminalWindowIcon } from "@phosphor-icons/react/TerminalWindow";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import { XIcon } from "@phosphor-icons/react/X";
import type { TerminalSession } from "../../shared/rpc-schema.ts";
import { Button } from "@/components/ui/button.tsx";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable.tsx";
import { rpc } from "@/lib/rpc.ts";

export default function TerminalDock({
  projectDir,
  onMinimize,
}: {
  projectDir: string;
  onMinimize: () => void;
}) {
  const [terminals, setTerminals] = useState<TerminalSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void rpc.request.terminalEnsure({ projectDir }).then(
      ({ terminals: next }) => {
        if (!cancelled) setTerminals(next);
      },
      (reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
    const offExit = rpc.events.on("terminalExit", ({ projectDir: exitedProject, terminalId, exitCode }) => {
      if (exitedProject !== projectDir) return;
      setTerminals((current) =>
        current.map((terminal) =>
          terminal.id === terminalId ? { ...terminal, exited: true, exitCode } : terminal,
        ),
      );
    });
    return () => {
      cancelled = true;
      offExit();
    };
  }, [projectDir]);

  async function addSplit() {
    try {
      const { terminal } = await rpc.request.terminalCreate({ projectDir });
      setTerminals((current) => [...current, terminal]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function closeSplit(terminalId: string) {
    if (closing) return;
    setClosing(true);
    try {
      await rpc.request.terminalClose({ projectDir, terminalId });
      const next = terminals.filter((terminal) => terminal.id !== terminalId);
      setTerminals(next);
      if (next.length === 0) onMinimize();
      else setClosing(false);
    } catch (reason) {
      setClosing(false);
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function closeAll() {
    if (closing) return;
    setClosing(true);
    try {
      await Promise.all(
        terminals.map((terminal) => rpc.request.terminalClose({ projectDir, terminalId: terminal.id })),
      );
      setTerminals([]);
      onMinimize();
    } catch (reason) {
      setClosing(false);
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  return (
    <section aria-label="Integrated terminal" className="terminal-dock-enter flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-8 shrink-0 items-center gap-2 border-b bg-sidebar/40 px-2">
        <TerminalWindowIcon aria-hidden="true" className="shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium">Terminal</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" title={projectDir}>
          {projectDir}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => void addSplit()}
          title="Split terminal"
          aria-label="Split terminal"
        >
          <SplitHorizontalIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => void closeAll()}
          disabled={terminals.length === 0 || closing}
          title="Kill all terminals"
          aria-label="Kill all terminals"
        >
          <TrashIcon />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onMinimize} title="Minimize terminal" aria-label="Minimize terminal">
          <XIcon />
        </Button>
      </header>

      {error ? (
        <div role="alert" className="flex min-h-0 flex-1 items-center justify-center px-4 text-sm text-destructive">
          Could not start PowerShell: {error}
        </div>
      ) : terminals.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-muted-foreground" role="status">
          Starting PowerShell…
        </div>
      ) : (
        <ResizablePanelGroup orientation="horizontal">
          {terminals.map((terminal, index) => (
            <TerminalSplit
              key={terminal.id}
              session={terminal}
              projectDir={projectDir}
              defaultSize={`${100 / terminals.length}%`}
              showHandle={index > 0}
              closing={closing}
              onClose={() => void closeSplit(terminal.id)}
            />
          ))}
        </ResizablePanelGroup>
      )}
    </section>
  );
}

function TerminalSplit({
  session,
  projectDir,
  defaultSize,
  showHandle,
  closing,
  onClose,
}: {
  session: TerminalSession;
  projectDir: string;
  defaultSize: string;
  showHandle: boolean;
  closing: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {showHandle ? <ResizableHandle className="hover:bg-ring focus-visible:bg-ring" /> : null}
      <ResizablePanel id={session.id} defaultSize={defaultSize}>
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-7 shrink-0 items-center gap-2 border-b px-2 text-[11px] text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">PowerShell</span>
            {session.exited ? <span>Exited {session.exitCode ?? ""}</span> : null}
            <Button variant="ghost" size="icon-xs" onClick={onClose} disabled={closing} title="Close terminal" aria-label="Close terminal">
              <XIcon />
            </Button>
          </div>
          <TerminalSurface session={session} projectDir={projectDir} />
        </div>
      </ResizablePanel>
    </>
  );
}

function TerminalSurface({ session, projectDir }: { session: TerminalSession; projectDir: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const styles = getComputedStyle(document.documentElement);
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily: "Consolas, 'Cascadia Mono', ui-monospace, monospace",
      fontSize: 13,
      lineHeight: 1.2,
      scrollback: 5000,
      screenReaderMode: true,
      theme: {
        background: styles.getPropertyValue("--background").trim(),
        foreground: styles.getPropertyValue("--foreground").trim(),
        cursor: styles.getPropertyValue("--foreground").trim(),
        selectionBackground: styles.getPropertyValue("--accent").trim(),
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);

    let disposed = false;
    let snapshotSequence = -1;
    let live = false;
    const pending: { data: string; sequence: number }[] = [];
    const offData = rpc.events.on("terminalData", (payload) => {
      if (payload.projectDir !== projectDir || payload.terminalId !== session.id) return;
      if (live) terminal.write(payload.data);
      else pending.push(payload);
    });
    const offExit = rpc.events.on("terminalExit", (payload) => {
      if (payload.projectDir !== projectDir || payload.terminalId !== session.id) return;
      terminal.write(`\r\n[PowerShell exited with code ${payload.exitCode}]\r\n`);
    });
    const input = terminal.onData((data) => {
      void rpc.request.terminalWrite({ projectDir, terminalId: session.id, data });
    });

    void rpc.request.terminalSnapshot({ projectDir, terminalId: session.id }).then(
      ({ output, sequence }) => {
        if (disposed) return;
        snapshotSequence = sequence;
        terminal.write(output);
        for (const item of pending) {
          if (item.sequence > snapshotSequence) terminal.write(item.data);
        }
        live = true;
        if (session.exited) terminal.write(`\r\n[PowerShell exited with code ${session.exitCode ?? "unknown"}]\r\n`);
      },
      () => {},
    );

    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (disposed || container.clientWidth === 0 || container.clientHeight === 0) return;
        fit.fit();
        void rpc.request.terminalResize({
          projectDir,
          terminalId: session.id,
          cols: terminal.cols,
          rows: terminal.rows,
        });
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    terminal.focus();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      input.dispose();
      offData();
      offExit();
      terminal.dispose();
    };
  }, [projectDir, session]);

  return <div ref={containerRef} className="terminal-surface min-h-0 flex-1 px-2 py-1.5" />;
}
