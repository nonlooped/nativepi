import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import type { IPty } from "node-pty";
import { spawn } from "node-pty";
import type { ShellProfile, TerminalSession } from "../shared/rpc-schema.ts";

const MAX_BUFFER_SIZE = 2 * 1024 * 1024;

type ManagedTerminal = TerminalSession & {
  process: IPty;
  output: string[];
  outputSize: number;
  sequence: number;
};

const terminals = new Map<string, ManagedTerminal>();

/**
 * Shells NativePi knows how to look for. Detection is PATH-first with a few
 * well-known install locations as a fallback, the same shape `editors.ts`
 * uses for applications — adding a shell for another platform is one entry
 * here, not a new branch.
 */
const SHELL_CANDIDATES: { id: string; name: string; executable: string; paths: string[]; args: string[] }[] = [
  { id: "pwsh", name: "PowerShell 7", executable: "pwsh.exe", paths: [], args: ["-NoLogo"] },
  { id: "powershell", name: "Windows PowerShell", executable: "powershell.exe", paths: [], args: ["-NoLogo"] },
  { id: "cmd", name: "Command Prompt", executable: "cmd.exe", paths: [], args: [] },
  {
    id: "gitbash",
    name: "Git Bash",
    executable: "bash.exe",
    paths: [
      join(process.env["ProgramFiles"] ?? "", "Git", "bin", "bash.exe"),
      join(process.env["ProgramFiles(x86)"] ?? "", "Git", "bin", "bash.exe"),
    ],
    args: ["--login", "-i"],
  },
  { id: "wsl", name: "WSL", executable: "wsl.exe", paths: [], args: [] },
];

function findOnPath(executable: string): string | undefined {
  const path = process.env["PATH"] ?? "";
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, executable);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function resolveCandidate(candidate: { executable: string; paths: string[] }): string | undefined {
  return findOnPath(candidate.executable) ?? candidate.paths.find(existsSync);
}

export function listShellProfiles(): ShellProfile[] {
  if (process.platform !== "win32") return [{ id: "default", name: process.env["SHELL"] || "Shell" }];
  return SHELL_CANDIDATES.filter((candidate) => resolveCandidate(candidate) !== undefined).map(
    ({ id, name }) => ({ id, name }),
  );
}

function resolveShell(shellId: string | undefined): { id: string; path: string; args: string[] } {
  if (process.platform !== "win32") {
    return {
      id: "default",
      path: process.env["SHELL"] || "/bin/bash",
      args: process.platform === "darwin" ? ["-l"] : [],
    };
  }
  const candidate = SHELL_CANDIDATES.find((entry) => entry.id === shellId);
  const resolved = candidate ? resolveCandidate(candidate) : undefined;
  if (candidate && resolved) return { id: candidate.id, path: resolved, args: candidate.args };
  const path = findOnPath("pwsh.exe") ?? "powershell.exe";
  return { id: "pwsh", path, args: ["-NoLogo"] };
}

function shellEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    // PSModulePath is per-edition. If the app was launched from pwsh (7), its
    // value points at PowerShell 7's module tree, and inheriting it into a
    // Windows PowerShell 5.1 session makes 5.1 load PS7 modules it cannot run
    // ("Cannot load PSReadLine module"). Dropping it lets each host build its own.
    if (key.toUpperCase() === "PSMODULEPATH") continue;
    env[key] = value;
  }
  return env;
}

function publicSession(terminal: ManagedTerminal): TerminalSession {
  return {
    id: terminal.id,
    projectDir: terminal.projectDir,
    name: terminal.name,
    shellId: terminal.shellId,
    exited: terminal.exited,
    exitCode: terminal.exitCode,
  };
}

export function listTerminals(projectDir: string): TerminalSession[] {
  return [...terminals.values()]
    .filter((terminal) => terminal.projectDir === projectDir)
    .map(publicSession);
}

/** The project of every terminal still holding a live shell, one entry each. */
export function liveTerminalProjects(): string[] {
  return [...terminals.values()].filter((terminal) => !terminal.exited).map((terminal) => terminal.projectDir);
}

function nextTerminalName(projectDir: string): string {
  const used = new Set(
    [...terminals.values()].filter((terminal) => terminal.projectDir === projectDir).map((terminal) => terminal.name),
  );
  let index = 1;
  while (used.has(`Terminal ${index}`)) index += 1;
  return `Terminal ${index}`;
}

function spawnPty(projectDir: string, shellId: string | undefined): { pty: IPty; resolvedShellId: string } {
  const shell = resolveShell(shellId);
  const pty = spawn(shell.path, shell.args, {
    name: "xterm-256color",
    cols: 100,
    rows: 24,
    cwd: projectDir,
    env: shellEnv(),
  });
  return { pty, resolvedShellId: shell.id };
}

function attachHandlers(
  id: string,
  projectDir: string,
  onData: (payload: { projectDir: string; terminalId: string; data: string; sequence: number }) => void,
  onExit: (payload: { projectDir: string; terminalId: string; exitCode: number }) => void,
): void {
  const terminal = terminals.get(id);
  if (!terminal) return;
  const process = terminal.process;
  process.onData((data) => {
    const current = terminals.get(id);
    if (!current || current.process !== process) return;
    current.output.push(data);
    current.outputSize += data.length;
    while (current.outputSize > MAX_BUFFER_SIZE && current.output.length > 1) {
      current.outputSize -= current.output.shift()!.length;
    }
    current.sequence += 1;
    onData({ projectDir, terminalId: id, data, sequence: current.sequence });
  });

  process.onExit(({ exitCode }) => {
    const current = terminals.get(id);
    if (!current || current.process !== process) return;
    current.exited = true;
    current.exitCode = exitCode;
    onExit({ projectDir, terminalId: id, exitCode });
  });
}

export function createTerminal(
  projectDir: string,
  shellId: string | undefined,
  name: string | undefined,
  onData: (payload: { projectDir: string; terminalId: string; data: string; sequence: number }) => void,
  onExit: (payload: { projectDir: string; terminalId: string; exitCode: number }) => void,
): TerminalSession {
  const id = randomUUID();
  const { pty, resolvedShellId } = spawnPty(projectDir, shellId);
  const terminal: ManagedTerminal = {
    id,
    projectDir,
    name: name?.trim() || nextTerminalName(projectDir),
    shellId: resolvedShellId,
    process: pty,
    output: [],
    outputSize: 0,
    sequence: 0,
    exited: false,
  };
  terminals.set(id, terminal);
  attachHandlers(id, projectDir, onData, onExit);
  return publicSession(terminal);
}

export function renameTerminal(projectDir: string, terminalId: string, name: string): void {
  const terminal = terminals.get(terminalId);
  if (!terminal || terminal.projectDir !== projectDir) return;
  const trimmed = name.trim();
  if (trimmed) terminal.name = trimmed;
}

/** Kills the running shell and starts a fresh one under the same id, name, and profile. */
export function restartTerminal(
  projectDir: string,
  terminalId: string,
  onData: (payload: { projectDir: string; terminalId: string; data: string; sequence: number }) => void,
  onExit: (payload: { projectDir: string; terminalId: string; exitCode: number }) => void,
): TerminalSession {
  const terminal = terminals.get(terminalId);
  if (!terminal || terminal.projectDir !== projectDir) throw new Error("Terminal not found");
  if (!terminal.exited) terminal.process.kill();
  const { pty, resolvedShellId } = spawnPty(projectDir, terminal.shellId);
  terminal.process = pty;
  terminal.shellId = resolvedShellId;
  terminal.output = [];
  terminal.outputSize = 0;
  terminal.sequence = 0;
  terminal.exited = false;
  terminal.exitCode = undefined;
  attachHandlers(terminalId, projectDir, onData, onExit);
  return publicSession(terminal);
}

export function terminalSnapshot(projectDir: string, terminalId: string): { output: string; sequence: number } {
  const terminal = terminals.get(terminalId);
  if (!terminal || terminal.projectDir !== projectDir) throw new Error("Terminal not found");
  return { output: terminal.output.join(""), sequence: terminal.sequence };
}

export function clearTerminal(projectDir: string, terminalId: string): void {
  const terminal = terminals.get(terminalId);
  if (!terminal || terminal.projectDir !== projectDir) return;
  terminal.output = [];
  terminal.outputSize = 0;
  // PSReadLine redraws the current prompt and any typed input after clearing,
  // so the fresh output remains replayable when the terminal surface remounts.
  if (!terminal.exited) terminal.process.write("\x0c");
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
