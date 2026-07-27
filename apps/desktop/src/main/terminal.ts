import { randomUUID } from "node:crypto";
import type { IPty } from "node-pty";
import { spawn } from "node-pty";
import type { TerminalSession } from "../shared/rpc-schema.ts";

const MAX_BUFFER_SIZE = 2 * 1024 * 1024;

type ManagedTerminal = TerminalSession & {
  process: IPty;
  output: string[];
  outputSize: number;
  sequence: number;
};

const terminals = new Map<string, ManagedTerminal>();

function publicSession(terminal: ManagedTerminal): TerminalSession {
  return {
    id: terminal.id,
    projectDir: terminal.projectDir,
    exited: terminal.exited,
    exitCode: terminal.exitCode,
  };
}

export function listTerminals(projectDir: string): TerminalSession[] {
  return [...terminals.values()]
    .filter((terminal) => terminal.projectDir === projectDir)
    .map(publicSession);
}

export function createTerminal(
  projectDir: string,
  onData: (payload: { projectDir: string; terminalId: string; data: string; sequence: number }) => void,
  onExit: (payload: { projectDir: string; terminalId: string; exitCode: number }) => void,
): TerminalSession {
  const id = randomUUID();
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const pty = spawn("powershell.exe", ["-NoLogo"], {
    name: "xterm-256color",
    cols: 100,
    rows: 24,
    cwd: projectDir,
    env,
  });
  const terminal: ManagedTerminal = {
    id,
    projectDir,
    process: pty,
    output: [],
    outputSize: 0,
    sequence: 0,
    exited: false,
  };
  terminals.set(id, terminal);

  pty.onData((data) => {
    const current = terminals.get(id);
    if (!current) return;
    current.output.push(data);
    current.outputSize += data.length;
    while (current.outputSize > MAX_BUFFER_SIZE && current.output.length > 1) {
      current.outputSize -= current.output.shift()!.length;
    }
    current.sequence += 1;
    onData({ projectDir, terminalId: id, data, sequence: current.sequence });
  });

  pty.onExit(({ exitCode }) => {
    const current = terminals.get(id);
    if (!current) return;
    current.exited = true;
    current.exitCode = exitCode;
    onExit({ projectDir, terminalId: id, exitCode });
  });

  return publicSession(terminal);
}

export function terminalSnapshot(projectDir: string, terminalId: string): { output: string; sequence: number } {
  const terminal = terminals.get(terminalId);
  if (!terminal || terminal.projectDir !== projectDir) throw new Error("Terminal not found");
  return { output: terminal.output.join(""), sequence: terminal.sequence };
}

export function writeTerminal(projectDir: string, terminalId: string, data: string): void {
  const terminal = terminals.get(terminalId);
  if (!terminal || terminal.projectDir !== projectDir || terminal.exited) return;
  terminal.process.write(data);
}

export function resizeTerminal(projectDir: string, terminalId: string, cols: number, rows: number): void {
  const terminal = terminals.get(terminalId);
  if (!terminal || terminal.projectDir !== projectDir || terminal.exited) return;
  terminal.process.resize(cols, rows);
}

export function closeTerminal(projectDir: string, terminalId: string): void {
  const terminal = terminals.get(terminalId);
  if (!terminal || terminal.projectDir !== projectDir) return;
  terminals.delete(terminalId);
  if (!terminal.exited) terminal.process.kill();
}

export function closeProjectTerminals(projectDir: string): void {
  for (const terminal of [...terminals.values()]) {
    if (terminal.projectDir === projectDir) closeTerminal(projectDir, terminal.id);
  }
}

export function stopAllTerminals(): void {
  const all = [...terminals.values()];
  terminals.clear();
  for (const terminal of all) {
    if (!terminal.exited) terminal.process.kill();
  }
}
