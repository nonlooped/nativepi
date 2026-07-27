import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { SplitHorizontalIcon } from "@phosphor-icons/react/SplitHorizontal";
import { TerminalWindowIcon } from "@phosphor-icons/react/TerminalWindow";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import { XIcon } from "@phosphor-icons/react/X";
import type { TerminalSession } from "../../shared/rpc-schema.ts";
import { useAppStore } from "../lib/store.ts";
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
              // A single terminal needs no chrome: the dock header already names it
              // and can close it. Splits do, or an individual split cannot be closed.
              showChrome={terminals.length > 1}
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
  showChrome,
  closing,
  onClose,
}: {
  session: TerminalSession;
  projectDir: string;
  defaultSize: string;
  showHandle: boolean;
  showChrome: boolean;
  closing: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {showHandle ? <ResizableHandle className="hover:bg-ring focus-visible:bg-ring" /> : null}
      <ResizablePanel id={session.id} defaultSize={defaultSize}>
        <div className="flex h-full min-h-0 flex-col">
          {showChrome ? (
            <div className="flex h-7 shrink-0 items-center justify-end border-b px-2">
              <Button variant="ghost" size="icon-xs" onClick={onClose} disabled={closing} title="Close terminal" aria-label="Close terminal">
                <XIcon />
              </Button>
            </div>
          ) : null}
          <TerminalSurface session={session} projectDir={projectDir} />
        </div>
      </ResizablePanel>
    </>
  );
}

function TerminalSurface({ session, projectDir }: { session: TerminalSession; projectDir: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fontSize = useAppStore((s) => s.preferences.terminalFontSize);
  const scrollback = useAppStore((s) => s.preferences.terminalScrollback);
  const cursorBlink = useAppStore((s) => s.preferences.terminalCursorBlink);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const styles = getComputedStyle(document.documentElement);
    const terminal = new Terminal({
      cursorBlink,
      cursorStyle: "block",
      fontFamily: "Consolas, 'Cascadia Mono', ui-monospace, monospace",
      fontSize,
      lineHeight: 1.2,
      scrollback,
      screenReaderMode: true,
      theme: {
        background: styles.getPropertyValue("--background").trim(),
        foreground: styles.getPropertyValue("--foreground").trim(),
        cursor: styles.getPropertyValue("--foreground").trim(),
        selectionBackground: styles.getPropertyValue("--accent").trim(),
      },
    });
    // xterm has no copy binding of its own: Ctrl+Shift+C always copies, and plain
    // Ctrl+C copies only when something is selected, otherwise it stays an interrupt.
    // Copying clears the selection so the next Ctrl+C interrupts as usual.
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown" || !event.ctrlKey || event.altKey || event.code !== "KeyC") return true;
      if (!event.shiftKey && !terminal.hasSelection()) return true;
      const selection = terminal.getSelection();
      if (selection) {
        void navigator.clipboard.writeText(selection);
        terminal.clearSelection();
      }
      return false;
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
    // A preference change rebuilds the surface rather than mutating the live
    // terminal's options. The pty and its output live in the main process, and
    // the snapshot above restores the scrollback, so a rebuild is invisible —
    // the same path a project switch already takes.
  }, [projectDir, session, fontSize, scrollback, cursorBlink]);

  return <div ref={containerRef} className="terminal-surface min-h-0 flex-1 px-2 py-1.5" />;
}
