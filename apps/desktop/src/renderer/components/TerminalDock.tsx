import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { SplitHorizontalIcon } from "@phosphor-icons/react/SplitHorizontal";
import { TerminalWindowIcon } from "@phosphor-icons/react/TerminalWindow";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import { XIcon } from "@phosphor-icons/react/X";
import { toast } from "sonner";
import type { ShellProfile, TerminalSession } from "../../shared/rpc-schema.ts";
import { findTerminalLinks } from "../lib/terminalLinks.ts";
import { useAppStore } from "../lib/store.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { DropdownMenu as Menu, DropdownMenuContent as MenuPopup, DropdownMenuGroup as MenuGroup, DropdownMenuItem as MenuItem, DropdownMenuTrigger as MenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable.tsx";
import { rpc } from "@/lib/rpc.ts";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";

function columnForTextOffset(line: { length: number; getCell(index: number): { getChars(): string; getWidth(): number } | undefined }, offset: number) {
  let textOffset = 0;
  for (let index = 0; index < line.length; index += 1) {
    const cell = line.getCell(index);
    const chars = cell?.getChars() ?? "";
    if (!chars) continue;
    if (textOffset >= offset) return index + 1;
    textOffset += chars.length;
    if (textOffset >= offset) return index + cell!.getWidth();
  }
  return line.length;
}

function updateWorkingDirectory(cwdRef: { current: string }, controlRef: { current: string }, data: string) {
  const control = `${controlRef.current}${data}`;
  for (const match of control.matchAll(/\x1b]7;file:\/\/[^/]*([^\x07\x1b]*)(?:\x07|\x1b\\)/g)) {
    try {
      cwdRef.current = decodeURIComponent(match[1]).replace(/^\/([A-Za-z]:)/, "$1");
    } catch {}
  }
  controlRef.current = control.slice(-4096);
}

export default function TerminalDock({
  projectDir,
  onMinimize,
}: {
  projectDir: string;
  onMinimize: () => void;
}) {
  const [terminals, setTerminals] = useState<TerminalSession[]>([]);
  const [shells, setShells] = useState<ShellProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const preferredShellId = useAppStore((s) => s.preferences.preferredShellId);
  const setPreference = useAppStore((s) => s.setPreference);

  useEffect(() => {
    let cancelled = false;
    void rpc.request.terminalEnsure({ projectDir, shellId: preferredShellId || undefined }).then(
      ({ terminals: next }) => {
        if (!cancelled) setTerminals(next);
      },
      (reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
    void rpc.request.terminalListShells({}).then(
      ({ shells: next }) => {
        if (!cancelled) setShells(next);
      },
      () => {},
    );
    const offExit = rpc.events.on("terminalExit", ({ projectDir: exitedProject, terminalId, exitCode }) => {
      if (exitedProject !== projectDir) return;
      setTerminals((current) =>
        current.map((terminal) =>
          terminal.id === terminalId ? { ...terminal, exited: true, exitCode } : terminal,
        ),
      );
    });
    const offRestart = rpc.events.on("terminalRestart", ({ projectDir: restartedProject, terminal }) => {
      if (restartedProject !== projectDir) return;
      setTerminals((current) => current.map((session) => (session.id === terminal.id ? terminal : session)));
    });
    return () => {
      cancelled = true;
      offExit();
      offRestart();
    };
  }, [projectDir, preferredShellId]);

  async function addSplit(shellId?: string, name?: string) {
    try {
      const { terminal } = await rpc.request.terminalCreate({ projectDir, shellId, name });
      setTerminals((current) => [...current, terminal]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function duplicateSplit(session: TerminalSession) {
    await addSplit(session.shellId, `${session.name} copy`);
  }

  async function restartSplit(terminalId: string) {
    try {
      const { terminal } = await rpc.request.terminalRestart({ projectDir, terminalId });
      setTerminals((current) => current.map((session) => (session.id === terminalId ? terminal : session)));
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function renameSplit(terminalId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setTerminals((current) =>
      current.map((session) => (session.id === terminalId ? { ...session, name: trimmed } : session)),
    );
    try {
      await rpc.request.terminalRename({ projectDir, terminalId, name: trimmed });
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : String(reason));
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
      <ContextMenu>
        {/* min-h rather than h: the buttons inside grow to a thumb-sized floor
            on a touch screen, and a fixed bar height would clip them. */}
        <ContextMenuTrigger render={<header className="flex min-h-8 shrink-0 items-center gap-2 border-b bg-sidebar/40 px-2" />}>
        <TerminalWindowIcon aria-hidden="true" className="shrink-0 text-muted-foreground" />
        <span className="flex-1 text-xs font-medium">Terminal</span>
        <ShellSplitButton
          shells={shells}
          preferredShellId={preferredShellId}
          onChoose={(shellId) => setPreference("preferredShellId", shellId)}
          onSplit={(shellId) => void addSplit(shellId)}
        />
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
        </ContextMenuTrigger>
        <TerminalChromeMenu addSplit={() => void addSplit(preferredShellId || undefined)} closeAll={closeAll} closing={closing} />
      </ContextMenu>

      {error ? (
        <div role="alert" className="flex min-h-0 flex-1 items-center justify-center px-4 text-sm text-destructive">
          Could not start a shell: {error}
        </div>
      ) : terminals.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-muted-foreground" role="status">
          Starting a shell…
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
              onSplit={() => void addSplit(preferredShellId || undefined)}
              onCloseAll={closeAll}
              onDuplicate={() => void duplicateSplit(terminal)}
              onRestart={() => void restartSplit(terminal.id)}
              onRename={(name) => void renameSplit(terminal.id, name)}
            />
          ))}
        </ResizablePanelGroup>
      )}
    </section>
  );
}

function ShellSplitButton({
  shells,
  preferredShellId,
  onChoose,
  onSplit,
}: {
  shells: ShellProfile[];
  preferredShellId: string;
  onChoose: (shellId: string) => void;
  onSplit: (shellId?: string) => void;
}) {
  if (shells.length === 0) {
    return (
      <Button variant="ghost" size="icon-xs" onClick={() => onSplit()} title="Split terminal" aria-label="Split terminal">
        <SplitHorizontalIcon />
      </Button>
    );
  }
  const selected = shells.find((shell) => shell.id === preferredShellId);
  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onSplit(preferredShellId || undefined)}
        title={selected ? `Split terminal (${selected.name})` : "Split terminal"}
        aria-label="Split terminal"
      >
        <SplitHorizontalIcon />
      </Button>
      <Menu>
        <MenuTrigger
          render={<Button variant="ghost" size="icon-xs" className="px-0" />}
          title="Choose a shell"
          aria-label="Choose a shell"
        >
          <CaretDownIcon />
        </MenuTrigger>
        <MenuPopup align="end" className="min-w-44">
           <MenuGroup>{shells.map((shell) => (
            <MenuItem
              key={shell.id}
              role="menuitemradio"
              aria-checked={shell.id === preferredShellId}
              onClick={() => onChoose(shell.id)}
              className="text-sm"
            >
              <span className="min-w-0 flex-1 truncate">{shell.name}</span>
              {shell.id === preferredShellId ? <CheckIcon className="ml-auto" aria-hidden /> : null}
            </MenuItem>
           ))}</MenuGroup>
        </MenuPopup>
      </Menu>
    </div>
  );
}

function TerminalSplit({
  session,
  projectDir,
  defaultSize,
  showHandle,
  closing,
  onClose,
  onSplit,
  onCloseAll,
  onDuplicate,
  onRestart,
  onRename,
}: {
  session: TerminalSession;
  projectDir: string;
  defaultSize: string;
  showHandle: boolean;
  closing: boolean;
  onClose: () => void;
  onSplit: () => void;
  onCloseAll: () => Promise<void>;
  onDuplicate: () => void;
  onRestart: () => void;
  onRename: (name: string) => void;
}) {
  const [editingName, setEditingName] = useState(false);

  return (
    <>
      {showHandle ? <ResizableHandle className="hover:bg-ring focus-visible:bg-ring" /> : null}
      <ResizablePanel id={session.id} defaultSize={defaultSize}>
        <div className="flex h-full min-h-0 flex-col">
          <ContextMenu>
            <ContextMenuTrigger render={<div className="flex min-h-7 shrink-0 items-center gap-1.5 border-b px-2" />}>
              <StatusDot session={session} />
              {editingName ? (
                <Input
                  autoFocus
                  defaultValue={session.name}
                  className="h-5 flex-1 px-1 text-xs"
                  onBlur={(event) => {
                    onRename(event.currentTarget.value);
                    setEditingName(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") setEditingName(false);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-xs font-medium"
                  onClick={() => setEditingName(true)}
                  title={session.exited ? `${session.name} — exited (code ${session.exitCode ?? "unknown"})` : session.name}
                >
                  {session.name}
                </button>
              )}
              <Button variant="ghost" size="icon-xs" onClick={onClose} disabled={closing} title="Close terminal" aria-label="Close terminal">
                <XIcon />
              </Button>
            </ContextMenuTrigger>
            <TerminalChromeMenu
              addSplit={onSplit}
              close={onClose}
              closeAll={onCloseAll}
              closing={closing}
              onDuplicate={onDuplicate}
              onRestart={onRestart}
              onRename={() => setEditingName(true)}
            />
          </ContextMenu>
          <TerminalSurface
            session={session}
            projectDir={projectDir}
            onSplit={onSplit}
            onClose={onClose}
            onCloseAll={onCloseAll}
            onDuplicate={onDuplicate}
            onRestart={onRestart}
            closing={closing}
          />
        </div>
      </ResizablePanel>
    </>
  );
}

function StatusDot({ session }: { session: TerminalSession }) {
  if (!session.exited) {
    return <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />;
  }
  const failed = (session.exitCode ?? 0) !== 0;
  return (
    <span
      className={`size-1.5 shrink-0 rounded-full ${failed ? "bg-destructive" : "bg-muted-foreground"}`}
      role="status"
      aria-label={`Exited with code ${session.exitCode ?? "unknown"}`}
      title={`Exited (code ${session.exitCode ?? "unknown"})`}
    />
  );
}

function TerminalSurface({
  session,
  projectDir,
  onSplit,
  onClose,
  onCloseAll,
  onDuplicate,
  onRestart,
  closing,
}: {
  session: TerminalSession;
  projectDir: string;
  onSplit: () => void;
  onClose: () => void;
  onCloseAll: () => Promise<void>;
  onDuplicate: () => void;
  onRestart: () => void;
  closing: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const cwdRef = useRef(projectDir);
  const controlRef = useRef("");
  const [selection, setSelection] = useState("");
  const fontSize = useAppStore((s) => s.preferences.terminalFontSize);
  const scrollback = useAppStore((s) => s.preferences.terminalScrollback);
  const cursorBlink = useAppStore((s) => s.preferences.terminalCursorBlink);
  const preferredEditorId = useAppStore((s) => s.preferences.preferredEditorId);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    cwdRef.current = projectDir;
    controlRef.current = "";

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
    terminalRef.current = terminal;
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

    const linkProvider = terminal.registerLinkProvider({
      provideLinks(bufferLineNumber, callback) {
        const line = terminal.buffer.active.getLine(bufferLineNumber - 1);
        if (!line) return callback(undefined);
        const text = line.translateToString(true);
        const found = findTerminalLinks(text);
        if (found.length === 0) return callback(undefined);
        callback(
          found.map((match) => ({
            text: text.slice(match.start, match.end),
            range: {
              start: { x: columnForTextOffset(line, match.start), y: bufferLineNumber },
              end: { x: columnForTextOffset(line, match.end), y: bufferLineNumber },
            },
            activate: () => {
              if (match.kind === "url") {
                void rpc.request.openExternal({ url: match.url });
                return;
              }
              void rpc.request
                .openFileIn({ projectDir: cwdRef.current, file: match.file, editorId: preferredEditorId, line: match.line, column: match.column })
                .then((result) => {
                  if (!result.ok) toast.error(result.error ?? `Could not open ${match.file}.`);
                });
            },
          })),
        );
      },
    });

    let disposed = false;
    let snapshotSequence = -1;
    let live = false;
    const pending: { data: string; sequence: number }[] = [];
    const offData = rpc.events.on("terminalData", (payload) => {
      if (payload.projectDir !== projectDir || payload.terminalId !== session.id) return;
      updateWorkingDirectory(cwdRef, controlRef, payload.data);
      if (live) terminal.write(payload.data);
      else pending.push(payload);
    });
    const offExit = rpc.events.on("terminalExit", (payload) => {
      if (payload.projectDir !== projectDir || payload.terminalId !== session.id) return;
      terminal.write(`\r\n[Process exited with code ${payload.exitCode}]\r\n`);
    });
    const input = terminal.onData((data) => {
      void rpc.request.terminalWrite({ projectDir, terminalId: session.id, data });
    });

    void rpc.request.terminalSnapshot({ projectDir, terminalId: session.id }).then(
      ({ output, sequence }) => {
        if (disposed) return;
        snapshotSequence = sequence;
        updateWorkingDirectory(cwdRef, controlRef, output);
        terminal.write(output);
        for (const item of pending) {
          if (item.sequence > snapshotSequence) {
            updateWorkingDirectory(cwdRef, controlRef, item.data);
            terminal.write(item.data);
          }
        }
        live = true;
        if (session.exited) terminal.write(`\r\n[Process exited with code ${session.exitCode ?? "unknown"}]\r\n`);
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
      linkProvider.dispose();
      offData();
      offExit();
      terminal.dispose();
      terminalRef.current = null;
    };
    // A preference change rebuilds the surface rather than mutating the live
    // terminal's options. The pty and its output live in the main process, and
    // the snapshot above restores the scrollback, so a rebuild is invisible —
    // the same path a project switch already takes. A restart bumps `session`
    // (a new object from the main process) for the same reason.
  }, [projectDir, session, fontSize, scrollback, cursorBlink, preferredEditorId]);

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={<div ref={containerRef} className="terminal-surface min-h-0 flex-1 px-2 py-1.5" />}
        onContextMenuCapture={() => setSelection(terminalRef.current?.getSelection() ?? "")}
      />
      <ContextMenuContent className="w-48">
        <ContextMenuItem disabled={!selection} onClick={() => void navigator.clipboard.writeText(selection).then(() => terminalRef.current?.clearSelection())}>
          Copy
        </ContextMenuItem>
        <ContextMenuItem onClick={() => void navigator.clipboard.readText().then((text) => terminalRef.current?.paste(text))}>
          Paste
        </ContextMenuItem>
        <ContextMenuItem onClick={() => terminalRef.current?.selectAll()}>Select all</ContextMenuItem>
        <ContextMenuItem
          onClick={() =>
            void rpc.request
              .terminalClear({ projectDir, terminalId: session.id })
              .then(() => terminalRef.current?.clear())
          }
        >
          Clear terminal
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onSplit}>Split terminal</ContextMenuItem>
        <ContextMenuItem onClick={onDuplicate}>Duplicate terminal</ContextMenuItem>
        <ContextMenuItem onClick={onRestart}>Restart terminal</ContextMenuItem>
        <ContextMenuItem disabled={closing} onClick={onClose}>Close this terminal</ContextMenuItem>
        <ContextMenuItem disabled={closing} onClick={() => void onCloseAll()}>Kill all terminals</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function TerminalChromeMenu({
  addSplit,
  close,
  closeAll,
  closing,
  onDuplicate,
  onRestart,
  onRename,
}: {
  addSplit: () => void;
  close?: () => void;
  closeAll: () => Promise<void>;
  closing: boolean;
  onDuplicate?: () => void;
  onRestart?: () => void;
  onRename?: () => void;
}) {
  return (
    <ContextMenuContent className="w-48">
      <ContextMenuItem onClick={addSplit}>Split terminal</ContextMenuItem>
      {onRename ? <ContextMenuItem onClick={onRename}>Rename</ContextMenuItem> : null}
      {onDuplicate ? <ContextMenuItem onClick={onDuplicate}>Duplicate terminal</ContextMenuItem> : null}
      {onRestart ? <ContextMenuItem onClick={onRestart}>Restart terminal</ContextMenuItem> : null}
      {close ? <ContextMenuItem disabled={closing} onClick={close}>Close this terminal</ContextMenuItem> : null}
      <ContextMenuItem disabled={closing} onClick={() => void closeAll()}>Kill all terminals</ContextMenuItem>
    </ContextMenuContent>
  );
}
