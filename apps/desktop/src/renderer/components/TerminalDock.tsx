import { useEffect, useEffectEvent, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { ColumnsIcon } from "@phosphor-icons/react/Columns";
import { RowsIcon } from "@phosphor-icons/react/Rows";
import { PlusIcon } from "@phosphor-icons/react/Plus";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import { toast } from "sonner";
import type { ShellProfile, TerminalSession } from "../../shared/rpc-schema.ts";
import { findTerminalLinks } from "../lib/terminalLinks.ts";
import { currentTerminalColors, THEME_CHANGE_EVENT } from "../lib/themes.ts";
import { useAppStore } from "../lib/store.ts";
import { useReducedMotion } from "../lib/motion.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { DropdownMenu as Menu, DropdownMenuContent as MenuPopup, DropdownMenuGroup as MenuGroup, DropdownMenuItem as MenuItem, DropdownMenuTrigger as MenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable.tsx";
import { rpc } from "@/lib/rpc.ts";
import { cn } from "@/lib/utils.ts";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import { attachTerminal } from "../lib/terminalAttachment.ts";
import { createTerminalDock, type DockState } from "../lib/terminalDock.ts";
import ConfirmDialog from "./ConfirmDialog.tsx";

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
  const [state, setState] = useState<DockState>({ terminals: [], shells: [], error: null, closing: false, restarts: {} });
  const { terminals, shells, error, closing, restarts } = state;
  const [confirmingKillAll, setConfirmingKillAll] = useState(false);
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const preferredShellId = useAppStore((s) => s.preferences.preferredShellId);
  const setPreference = useAppStore((s) => s.setPreference);
  const controller = useRef<ReturnType<typeof createTerminalDock> | null>(null);
  const preferredShell = useEffectEvent(() => preferredShellId || undefined);
  const minimized = useEffectEvent(onMinimize);
  useEffect(() => {
    const dock = createTerminalDock(projectDir, setState, minimized, message => toast.error(message));
    controller.current = dock;
    void dock.start(preferredShell());
    const offExit = rpc.events.on("terminalExit", payload => { if (payload.projectDir === projectDir) dock.exited(payload.terminalId, payload.exitCode); });
    const offRestart = rpc.events.on("terminalRestart", payload => { if (payload.projectDir === projectDir) dock.restarted(payload.terminal); });
    return () => { controller.current = null; dock.dispose(); offExit(); offRestart(); };
  }, [projectDir]);
  const addSplit = (shellId?: string, name?: string) => controller.current?.create(shellId, name);
  const duplicateSplit = (session: TerminalSession) => addSplit(session.shellId, `${session.name} copy`);
  const restartSplit = (id: string) => controller.current?.restart(id);
  const renameSplit = (id: string, name: string) => { if (name.trim()) void controller.current?.rename(id, name); };
  const closeSplit = (id: string) => controller.current?.close(id);
  const closeAll = () => controller.current?.close();

  return (
    <section aria-label="Integrated terminal" className="terminal-dock terminal-dock-enter relative flex h-full min-h-0 flex-col bg-sidebar">
      <ContextMenu>
        <ContextMenuTrigger render={<div role="toolbar" aria-label="Terminal controls" className="absolute right-2 top-1.5 z-20 flex items-center gap-0.5 rounded-lg bg-sidebar/95 shadow-sm p-0.5 text-muted-foreground" />}>
          <Button variant="ghost" size="icon-xs" disabled={closing} title="Split terminal side by side" aria-label="Split terminal side by side" onClick={() => {
            setOrientation("horizontal");
            void addSplit(preferredShellId || undefined);
          }}><ColumnsIcon /></Button>
          <Button variant="ghost" size="icon-xs" disabled={closing} title="Split terminal above and below" aria-label="Split terminal above and below" onClick={() => {
            setOrientation("vertical");
            void addSplit(preferredShellId || undefined);
          }}><RowsIcon /></Button>
          <NewTerminalButton
            shells={shells}
            preferredShellId={preferredShellId}
            disabled={closing}
            onChoose={(shellId) => setPreference("preferredShellId", shellId)}
            onCreate={(shellId) => void addSplit(shellId)}
          />
          <Button variant="ghost" size="icon-xs" onClick={() => setConfirmingKillAll(true)} disabled={terminals.length === 0 || closing} title="Kill all terminals" aria-label="Kill all terminals">
            <TrashIcon />
          </Button>
        </ContextMenuTrigger>
        <TerminalChromeMenu
          addSplit={() => void addSplit(preferredShellId || undefined)}
          closeAll={() => setConfirmingKillAll(true)}
          closing={closing}
          onHide={onMinimize}
        />
      </ContextMenu>

      <ConfirmDialog
        open={confirmingKillAll}
        title={terminals.length === 1 ? "Close this terminal?" : `Close all ${terminals.length} terminals?`}
        description="The shells end along with whatever they are running. Their scrollback goes with them."
        confirmLabel={terminals.length === 1 ? "Close terminal" : "Close all"}
        destructive
        onConfirm={() => {
          setConfirmingKillAll(false);
          void closeAll();
        }}
        onCancel={() => setConfirmingKillAll(false)}
      />

      {error ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-10">
          <p role="alert" className="max-w-xl text-center text-sm text-destructive">Could not start a shell: {error}</p>
          <Button variant="outline" size="sm" onClick={() => void controller.current?.start(preferredShellId || undefined)}>Retry</Button>
        </div>
      ) : terminals.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-muted-foreground" role="status">
          Starting a shell…
        </div>
      ) : (
        <ResizablePanelGroup orientation={orientation}>
          {terminals.map((terminal, index) => (
            <TerminalSplit
              key={terminal.id}
              session={terminal}
              projectDir={projectDir}
              defaultSize={`${100 / terminals.length}%`}
              showHandle={index > 0}
              showTitle={terminals.length > 1}
              reserveToolbar={orientation === "horizontal" ? index === terminals.length - 1 : index === 0}
              onHide={onMinimize}
              closing={closing}
              restartCount={restarts[terminal.id] ?? 0}
              onClose={() => void closeSplit(terminal.id)}
              onSplit={() => void addSplit(preferredShellId || undefined)}
              onCloseAll={() => setConfirmingKillAll(true)}
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

function NewTerminalButton({
  shells,
  preferredShellId,
  onChoose,
  onCreate,
  disabled,
}: {
  shells: ShellProfile[];
  preferredShellId: string;
  onChoose: (shellId: string) => void;
  onCreate: (shellId?: string) => void;
  disabled: boolean;
}) {
  if (shells.length <= 1) {
    return (
      <Button variant="ghost" size="icon-xs" disabled={disabled} onClick={() => onCreate(preferredShellId || undefined)} title="New terminal" aria-label="New terminal">
        <PlusIcon />
      </Button>
    );
  }
  const selected = shells.find((shell) => shell.id === preferredShellId);
  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={disabled}
        onClick={() => onCreate(preferredShellId || undefined)}
        title={selected ? `New terminal (${selected.name})` : "New terminal"}
        aria-label="New terminal"
      >
        <PlusIcon />
      </Button>
      <Menu>
        <MenuTrigger
          render={<Button variant="ghost" size="icon-xs" className="px-0" />}
          disabled={disabled}
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
  showTitle,
  reserveToolbar,
  onHide,
  closing,
  restartCount,
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
  showTitle: boolean;
  reserveToolbar: boolean;
  onHide: () => void;
  closing: boolean;
  restartCount: number;
  onClose: () => void;
  onSplit: () => void;
  onCloseAll: () => void;
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
          {showTitle || editingName ? <ContextMenu>
            <ContextMenuTrigger render={<div className={cn("flex min-h-9 shrink-0 items-center gap-1.5 px-3", reserveToolbar && "pr-32")} />}>
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
                  title={session.exited ? `${session.name}, exited with code ${session.exitCode ?? "unknown"}` : session.name}
                >
                  {session.name}
                </button>
              )}
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
          </ContextMenu> : null}
          <TerminalSurface
            session={session}
            restartCount={restartCount}
            projectDir={projectDir}
            onSplit={onSplit}
            onClose={onClose}
            onCloseAll={onCloseAll}
            onDuplicate={onDuplicate}
            onRestart={onRestart}
            closing={closing}
            onRename={() => setEditingName(true)}
            onHide={onHide}
          />
        </div>
      </ResizablePanel>
    </>
  );
}

function StatusDot({ session }: { session: TerminalSession }) {
  if (!session.exited) {
    return <span className="size-1.5 shrink-0 rounded-full bg-active" aria-hidden="true" />;
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
  restartCount,
  projectDir,
  onSplit,
  onClose,
  onCloseAll,
  onDuplicate,
  onRestart,
  closing,
  onRename,
  onHide,
}: {
  session: TerminalSession;
  restartCount: number;
  projectDir: string;
  onSplit: () => void;
  onClose: () => void;
  onCloseAll: () => void;
  onDuplicate: () => void;
  onRestart: () => void;
  closing: boolean;
  onRename: () => void;
  onHide: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const cwdRef = useRef(projectDir);
  const controlRef = useRef("");
  const [selection, setSelection] = useState("");
  const [attachError, setAttachError] = useState(false);
  const [attachAttempt, setAttachAttempt] = useState(0);
  const fontSize = useAppStore((s) => s.preferences.terminalFontSize);
  const scrollback = useAppStore((s) => s.preferences.terminalScrollback);
  const cursorBlink = useAppStore((s) => s.preferences.terminalCursorBlink);
  const reducedMotion = useReducedMotion();
  const preferredEditorId = useAppStore((s) => s.preferences.preferredEditorId);
  const terminalId = session.id;

  // A shell that had already exited before this surface mounted has no exit
  // event left to send, so the notice has to come from the session. Read as an
  // effect event because it is a fact about the moment of mounting: letting it
  // into the dependencies would rebuild the whole terminal when a process ends.
  const noticeIfAlreadyExited = useEffectEvent((terminal: Terminal) => {
    if (session.exited) terminal.write(`\r\n[Process exited with code ${session.exitCode ?? "unknown"}]\r\n`);
  });

  // Likewise for the editor a file link opens in: a preference the link handler
  // reads when it fires, not one the terminal has to be rebuilt around.
  const openFileLink = useEffectEvent((file: string, line?: number, column?: number) => {
    void rpc.request
      .openFileIn({ projectDir: cwdRef.current, file, editorId: preferredEditorId, line, column })
      .then((result) => {
        if (!result.ok) toast.error(result.error ?? `Could not open ${file}.`);
      });
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    cwdRef.current = projectDir;
    controlRef.current = "";

    const terminal = new Terminal({
      allowTransparency: true,
      cursorBlink: cursorBlink && !reducedMotion,
      cursorStyle: "block",
      fontFamily: "Consolas, 'Cascadia Mono', ui-monospace, monospace",
      fontSize,
      lineHeight: 1.2,
      scrollback,
      // Shells often emit light ANSI colors even on light backgrounds.
      minimumContrastRatio: 4.5,
      theme: currentTerminalColors(),
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
    fitRef.current = fit;
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
              openFileLink(match.file, match.line, match.column);
            },
          })),
        );
      },
    });

    setAttachError(false);
    let disposed = false;
    const detach = attachTerminal(projectDir, terminalId, data => {
      updateWorkingDirectory(cwdRef, controlRef, data);
      terminal.write(data);
    }, () => noticeIfAlreadyExited(terminal), () => setAttachError(true));
    const offExit = rpc.events.on("terminalExit", (payload) => {
      if (payload.projectDir !== projectDir || payload.terminalId !== terminalId) return;
      terminal.write(`\r\n[Process exited with code ${payload.exitCode}]\r\n`);
    });
    const input = terminal.onData((data) => {
      void rpc.request.terminalWrite({ projectDir, terminalId, data });
    });

    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (disposed || container.clientWidth === 0 || container.clientHeight === 0) return;
        fit.fit();
        void rpc.request.terminalResize({
          projectDir,
          terminalId,
          cols: terminal.cols,
          rows: terminal.rows,
        });
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const applyColors = () => {
      terminal.options.theme = currentTerminalColors();
    };
    window.addEventListener(THEME_CHANGE_EVENT, applyColors);
    resize();
    terminal.focus();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener(THEME_CHANGE_EVENT, applyColors);
      input.dispose();
      linkProvider.dispose();
      detach();
      offExit();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
    // Rebuilt only for a different terminal, or the same one restarted — a
    // restart keeps its id and empties its buffer in the main process, so the
    // counter is the only thing saying the scrollback on screen is dead.
    // Everything else that used to be in here was a preference, and those are
    // now applied to the live terminal below: dragging the font-size slider
    // rebuilt this once per step, and renaming a tab threw away the selection
    // and scroll position of a shell that had not moved.
  }, [projectDir, terminalId, restartCount, attachAttempt]);

  // Preferences, applied in place rather than by reconstruction.
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.fontSize = fontSize;
    terminal.options.scrollback = scrollback;
    fitRef.current?.fit();
    void rpc.request.terminalResize({ projectDir, terminalId, cols: terminal.cols, rows: terminal.rows });
  }, [projectDir, terminalId, fontSize, scrollback]);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.options.cursorBlink = cursorBlink && !reducedMotion;
  }, [cursorBlink, reducedMotion]);

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div ref={containerRef} className="terminal-surface relative min-h-0 flex-1 px-3 py-3">
            {attachError ? (
              <div className="absolute inset-0 z-10 grid place-content-center gap-2 bg-background/90 text-center text-sm">
                <span>Could not attach to this terminal.</span>
                <Button size="sm" variant="outline" onClick={() => {
                  setAttachError(false);
                  setAttachAttempt((attempt) => attempt + 1);
                }}>Retry</Button>
              </div>
            ) : null}
          </div>
        }
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
        <ContextMenuItem onClick={onRename}>Rename terminal</ContextMenuItem>
        <ContextMenuItem onClick={onRestart}>Restart terminal</ContextMenuItem>
        <ContextMenuItem disabled={closing} onClick={onClose}>Close this terminal</ContextMenuItem>
        <ContextMenuItem disabled={closing} onClick={onCloseAll}>Kill all terminals</ContextMenuItem>
        <ContextMenuItem onClick={onHide}>Hide terminal panel</ContextMenuItem>
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
  onHide,
}: {
  addSplit: () => void;
  close?: () => void;
  closeAll: () => void;
  closing: boolean;
  onDuplicate?: () => void;
  onRestart?: () => void;
  onRename?: () => void;
  onHide?: () => void;
}) {
  return (
    <ContextMenuContent className="w-48">
      <ContextMenuItem onClick={addSplit}>Split terminal</ContextMenuItem>
      {onRename ? <ContextMenuItem onClick={onRename}>Rename</ContextMenuItem> : null}
      {onDuplicate ? <ContextMenuItem onClick={onDuplicate}>Duplicate terminal</ContextMenuItem> : null}
      {onRestart ? <ContextMenuItem onClick={onRestart}>Restart terminal</ContextMenuItem> : null}
      {close ? <ContextMenuItem disabled={closing} onClick={close}>Close this terminal</ContextMenuItem> : null}
      <ContextMenuItem disabled={closing} onClick={closeAll}>Kill all terminals</ContextMenuItem>
      {onHide ? <ContextMenuItem onClick={onHide}>Hide terminal panel</ContextMenuItem> : null}
    </ContextMenuContent>
  );
}
