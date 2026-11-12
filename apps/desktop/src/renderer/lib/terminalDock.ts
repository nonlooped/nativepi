import type { ShellProfile, TerminalSession } from "../../shared/rpc-schema.ts";
import { rpc } from "./rpc.ts";

export interface DockState {
  terminals: TerminalSession[];
  shells: ShellProfile[];
  error: string | null;
  closing: boolean;
  restarts: Record<string, number>;
}

/** Owns membership; mounted xterms own only attachment/output. Hiding a dock never kills a shell. */
export function createTerminalDock(projectDir: string, publish: (state: DockState) => void, minimize: () => void, notice: (error: string) => void) {
  let state: DockState = { terminals: [], shells: [], error: null, closing: false, restarts: {} };
  let disposed = false;
  let busy = false;
  let starting: Promise<void> | undefined;
  let eventVersion = 0;
  const events = new Map<string, {
    restart?: { version: number; terminal: TerminalSession };
    exit?: { version: number; exitCode: number };
  }>();
  const overlay = (terminal: TerminalSession, since: number) => {
    const event = events.get(terminal.id);
    const current = event?.restart && event.restart.version > since ? event.restart.terminal : terminal;
    return event?.exit && event.exit.version > since && event.exit.version > (event.restart?.version ?? 0)
      ? { ...current, exited: true, exitCode: event.exit.exitCode } : current;
  };
  const update = (patch: Partial<DockState>) => { state = { ...state, ...patch }; if (!disposed) publish(state); };
  const upsert = (terminal: TerminalSession) => update({ terminals: state.terminals.some(item => item.id === terminal.id)
    ? state.terminals.map(item => item.id === terminal.id ? terminal : item) : [...state.terminals, terminal], error: null });
  const fail = (error: unknown) => {
    if (disposed) return;
    const message = error instanceof Error ? error.message : String(error);
    if (state.terminals.length) notice(message); else update({ error: message });
  };
  async function mutate(work: () => Promise<void>, closing = false) {
    if (disposed || busy) return;
    busy = true;
    update({ closing });
    try { await starting; if (!disposed) await work(); } catch (error) { fail(error); }
    finally { busy = false; if (!disposed) update({ closing: false }); }
  }
  return {
    start(shellId?: string) {
      starting = (async () => {
        try {
          const result = await rpc.request.terminalEnsure({ projectDir, shellId });
          if (!disposed) update({ terminals: result.terminals.map(item => overlay(item, 0)), error: null });
        } catch (error) { fail(error); }
      })();
      void rpc.request.terminalListShells({}).then(result => { if (!disposed) update({ shells: result.shells }); }, () => {});
      return starting;
    },
    create(shellId?: string, name?: string) { return mutate(async () => {
      const version = eventVersion;
      const result = await rpc.request.terminalCreate({ projectDir, shellId, name });
      if (!disposed) upsert(overlay(result.terminal, version));
    }); },
    restart(terminalId: string) { return mutate(async () => {
      const version = eventVersion;
      const result = await rpc.request.terminalRestart({ projectDir, terminalId });
      if (!disposed && state.terminals.some(item => item.id === terminalId)) upsert(overlay(result.terminal, version));
    }); },
    rename(terminalId: string, name: string) { return mutate(async () => {
      const result = await rpc.request.terminalRename({ projectDir, terminalId, name: name.trim() });
      if (!result.ok) throw new Error("Unable to rename this shell.");
      if (!disposed) update({ terminals: state.terminals.map(item => item.id === terminalId ? { ...item, name: name.trim() } : item) });
    }); },
    close(terminalId?: string) { return mutate(async () => {
      const ids = terminalId ? [terminalId] : state.terminals.map(item => item.id);
      // Each confirmed close updates membership even if another close fails.
      const results = await Promise.allSettled(ids.map(async id => {
        const result = await rpc.request.terminalClose({ projectDir, terminalId: id });
        if (!result.ok) throw new Error("Unable to close this shell.");
        if (!disposed) update({ terminals: state.terminals.filter(item => item.id !== id) });
      }));
      if (!disposed && !state.terminals.length) minimize();
      const failure = results.find(result => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    }, true); },
    exited(terminalId: string, exitCode: number) {
      events.set(terminalId, { ...events.get(terminalId), exit: { version: ++eventVersion, exitCode } });
      update({ terminals: state.terminals.map(item => item.id === terminalId ? { ...item, exited: true, exitCode } : item) });
    },
    restarted(terminal: TerminalSession) {
      events.set(terminal.id, { restart: { version: ++eventVersion, terminal } });
      if (state.terminals.some(item => item.id === terminal.id)) upsert(terminal);
      update({ restarts: { ...state.restarts, [terminal.id]: (state.restarts[terminal.id] ?? 0) + 1 } });
    },
    dispose() { disposed = true; },
  };
}
