import { app } from "electron";
import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspect } from "node:util";
import { redactDiagnosticsText } from "../shared/diagnostics.ts";
import type { NativePiState } from "../shared/rpc-schema.ts";
import type { PiSettings } from "../shared/pi-settings.ts";
import type { PackageListing } from "./packages.ts";
import type { TerminalDiagnostics } from "./terminal.ts";

const MAX_LOGS = 300;
const MAX_CRASHES = 20;
const MAX_DIAGNOSTIC_FILE_SIZE = 1024 * 1024;
const logs: string[] = [];
let installed = false;

type CrashRecord = {
  timestamp: string;
  process: "main" | "renderer";
  kind: string;
  message: string;
  stack?: string;
};

function crashFile() {
  return path.join(app.getPath("userData"), "diagnostic-crashes.jsonl");
}

function logFile() {
  return path.join(app.getPath("logs"), "nativepi.log");
}

function text(value: unknown) {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack ?? value.message;
  return inspect(value, { depth: 4, breakLength: 160 });
}

function addLog(source: "main" | "renderer", level: string, message: string) {
  const entry = `${new Date().toISOString()} [${source}:${level}] ${message}`;
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
  try {
    mkdirSync(path.dirname(logFile()), { recursive: true });
    appendFileSync(logFile(), `${entry}\n`, "utf8");
    rotate(logFile());
  } catch {
    // The in-memory copy still makes the current run exportable.
  }
}

function rotate(file: string) {
  try {
    if (statSync(file).size <= MAX_DIAGNOSTIC_FILE_SIZE) return;
    const previous = `${file}.previous`;
    rmSync(previous, { force: true });
    renameSync(file, previous);
  } catch {
    // A missing or locked diagnostic file is safe to leave alone.
  }
}

function persistCrash(record: CrashRecord) {
  try {
    mkdirSync(path.dirname(crashFile()), { recursive: true });
    appendFileSync(crashFile(), `${JSON.stringify(record)}\n`, "utf8");
    rotate(crashFile());
  } catch {
    // Diagnostics must never become a second failure while reporting the first.
  }
}

export function installDiagnostics() {
  if (installed) return;
  installed = true;
  rotate(logFile());
  rotate(crashFile());

  for (const level of ["log", "info", "warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...values: unknown[]) => {
      addLog("main", level, values.map(text).join(" "));
      original(...values);
    };
  }

  process.on("uncaughtExceptionMonitor", (error) => {
    persistCrash({
      timestamp: new Date().toISOString(),
      process: "main",
      kind: "uncaughtException",
      message: error.message,
      stack: error.stack,
    });
  });
}

export function recordRendererLog(level: number, message: string) {
  addLog("renderer", ["debug", "info", "warning", "error"][level] ?? String(level), message);
}

export function recordRendererCrash(kind: string, message: string, stack?: string) {
  persistCrash({ timestamp: new Date().toISOString(), process: "renderer", kind, message, stack });
}

function redactDiagnostics(value: string, privatePaths: string[] = []) {
  return redactDiagnosticsText(value, {
    home: app.getPath("home"),
    userData: app.getPath("userData"),
    privatePaths,
  });
}

async function recentLines(file: string, limit: number) {
  const contents = await Promise.all([`${file}.previous`, file].map((candidate) => readFile(candidate, "utf8").catch(() => "")));
  return contents.join("\n").split("\n").filter(Boolean).slice(-limit);
}

async function recentLogs() {
  const persisted = await recentLines(logFile(), MAX_LOGS);
  return persisted.length > 0 ? persisted : logs;
}

async function recentCrashes() {
  return (await recentLines(crashFile(), MAX_CRASHES)).flatMap((line): CrashRecord[] => {
    try {
      const value = JSON.parse(line) as CrashRecord;
      return value?.timestamp && value?.process && value?.message ? [value] : [];
    } catch {
      return [];
    }
  });
}

function safePiSettings(settings: PiSettings | undefined) {
  if (!settings) return "Unavailable";
  return {
    ...settings,
    shellPath: settings.shellPath ? path.basename(settings.shellPath) : "",
    shellCommandPrefix: settings.shellCommandPrefix ? "<configured; redacted>" : "",
    npmCommand: settings.npmCommand ? "<configured; redacted>" : "",
  };
}

function safeNativePiState(state: NativePiState) {
  const { customThemes, ...preferences } = state.preferences;
  return {
    reopenLastProject: state.reopenLastProject,
    preferences: { ...preferences, customThemeCount: customThemes.length },
    projectCount: state.projects.length,
    favoriteModelCount: state.favoriteModels.length,
    keybindingOverrideCount: Object.keys(state.keybindingOverrides).length,
  };
}

export async function createDiagnosticsReport(input: {
  appVersion: string;
  piVersion: string;
  projectDir?: string;
  state: NativePiState;
  piSettings?: PiSettings;
  piSettingsError?: string;
  packages?: PackageListing;
  packageError?: string;
  terminal: TerminalDiagnostics;
}) {
  const [crashes, recentLogEntries] = await Promise.all([recentCrashes(), recentLogs()]);
  const privatePaths = [input.projectDir ?? "", ...input.state.projects.map((project) => project.path)];
  const packages = input.packages?.packages.map(({ source, scope, filtered, local }) => ({
    source: local ? "<local package>" : redactDiagnostics(source, privatePaths),
    scope,
    filtered,
    local,
  })) ?? [];
  const extensions = input.packages?.extensions.map(({ path: extensionPath, ...extension }) => ({
    ...extension,
    path: extensionPath ? "<extension path>" : "",
    source: redactDiagnostics(extension.source, privatePaths),
  })) ?? [];
  const report = `# NativePi diagnostics

Generated: ${new Date().toISOString()}
Sensitive values and local paths are automatically redacted. Review before sharing.

## Versions

- NativePi: ${input.appVersion}
- Bundled Pi: ${input.piVersion}
- Electron: ${process.versions.electron ?? "unknown"}
- Chromium: ${process.versions.chrome ?? "unknown"}
- Node: ${process.versions.node}

## System

- OS: ${os.type()} ${os.release()} (${process.platform})
- Architecture: ${process.arch}
- CPU: ${os.cpus()[0]?.model ?? "unknown"}
- Memory: ${Math.round(os.totalmem() / 1024 / 1024)} MiB

## Terminal backend

\`\`\`json
${JSON.stringify(input.terminal, null, 2)}
\`\`\`

## Packages

\`\`\`json
${JSON.stringify({ packages, extensions, errors: input.packages?.errors ?? (input.packageError ? [input.packageError] : []) }, null, 2)}
\`\`\`

## Configuration

\`\`\`json
${JSON.stringify({ nativePi: safeNativePiState(input.state), pi: safePiSettings(input.piSettings), piSettingsError: input.piSettingsError }, null, 2)}
\`\`\`

## Crash information

\`\`\`json
${JSON.stringify(crashes.length > 0 ? crashes : "No recorded main or renderer crashes.", null, 2)}
\`\`\`

## Recent application logs

\`\`\`text
${recentLogEntries.length > 0 ? recentLogEntries.join("\n") : "No application logs recorded."}
\`\`\`
`;
  return redactDiagnostics(report, privatePaths);
}
