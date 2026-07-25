import { execFile, spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { app, shell } from "electron";
import type { InstalledEditor } from "../shared/rpc-schema.ts";

const execFileAsync = promisify(execFile);

type EditorSpec = InstalledEditor & {
  executables: string[];
  paths: string[];
};

type ScannedEditor = { editor: InstalledEditor; executable?: string };

const EXPLORER: InstalledEditor = { id: "explorer", name: "Explorer", icon: "explorer" };

const local = process.env["LOCALAPPDATA"];
const programFiles = process.env["ProgramFiles"];
const programFilesX86 = process.env["ProgramFiles(x86)"];

function under(root: string | undefined, ...parts: string[]): string[] {
  return root ? [join(root, ...parts)] : [];
}

const editorSpecs: EditorSpec[] = [
  {
    id: "cursor",
    name: "Cursor",
    icon: "cursor",
    executables: ["Cursor.exe"],
    paths: under(local, "Programs", "Cursor", "Cursor.exe"),
  },
  {
    id: "vscode",
    name: "Visual Studio Code",
    icon: "code",
    executables: ["Code.exe"],
    paths: [
      ...under(local, "Programs", "Microsoft VS Code", "Code.exe"),
      ...under(programFiles, "Microsoft VS Code", "Code.exe"),
      ...under(programFilesX86, "Microsoft VS Code", "Code.exe"),
    ],
  },
  {
    id: "antigravity",
    name: "Google Antigravity",
    icon: "antigravity",
    executables: ["Antigravity IDE.exe", "Antigravity.exe"],
    paths: [
      ...under(local, "Programs", "Antigravity IDE", "Antigravity IDE.exe"),
      ...under(local, "Programs", "Antigravity", "Antigravity.exe"),
    ],
  },
  {
    id: "windsurf",
    name: "Windsurf",
    icon: "windsurf",
    executables: ["Windsurf.exe"],
    paths: under(local, "Programs", "Windsurf", "Windsurf.exe"),
  },
  {
    id: "vscode-insiders",
    name: "Visual Studio Code Insiders",
    icon: "code",
    executables: ["Code - Insiders.exe"],
    paths: under(local, "Programs", "Microsoft VS Code Insiders", "Code - Insiders.exe"),
  },
  {
    id: "vscodium",
    name: "VSCodium",
    icon: "code",
    executables: ["VSCodium.exe"],
    paths: [
      ...under(local, "Programs", "VSCodium", "VSCodium.exe"),
      ...under(programFiles, "VSCodium", "VSCodium.exe"),
    ],
  },
  {
    id: "zed",
    name: "Zed",
    icon: "code",
    executables: ["Zed.exe"],
    paths: under(local, "Programs", "Zed", "Zed.exe"),
  },
  {
    id: "visual-studio",
    name: "Visual Studio",
    icon: "code",
    executables: ["devenv.exe"],
    paths: ["Community", "Professional", "Enterprise"].flatMap((edition) => [
      ...under(programFiles, "Microsoft Visual Studio", "2022", edition, "Common7", "IDE", "devenv.exe"),
      ...under(programFilesX86, "Microsoft Visual Studio", "2019", edition, "Common7", "IDE", "devenv.exe"),
    ]),
  },
  {
    id: "sublime-text",
    name: "Sublime Text",
    icon: "code",
    executables: ["sublime_text.exe"],
    paths: [...under(programFiles, "Sublime Text", "sublime_text.exe"), ...under(programFilesX86, "Sublime Text", "sublime_text.exe")],
  },
  {
    id: "notepad-plus-plus",
    name: "Notepad++",
    icon: "code",
    executables: ["notepad++.exe"],
    paths: [...under(programFiles, "Notepad++", "notepad++.exe"), ...under(programFilesX86, "Notepad++", "notepad++.exe")],
  },
];

const jetBrainsEditors = [
  ["intellij-idea", "IntelliJ IDEA", "idea64.exe"],
  ["webstorm", "WebStorm", "webstorm64.exe"],
  ["rider", "JetBrains Rider", "rider64.exe"],
  ["pycharm", "PyCharm", "pycharm64.exe"],
  ["clion", "CLion", "clion64.exe"],
  ["goland", "GoLand", "goland64.exe"],
  ["phpstorm", "PhpStorm", "phpstorm64.exe"],
  ["rubymine", "RubyMine", "rubymine64.exe"],
  ["rustrover", "RustRover", "rustrover64.exe"],
] as const;

async function registeredExecutables(): Promise<Map<string, string>> {
  if (process.platform !== "win32") return new Map();
  const roots = [
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths",
    "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths",
    "HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths",
  ];
  const outputs = await Promise.all(
    roots.map(async (root) => {
      try {
        return (
          await execFileAsync("reg.exe", ["query", root, "/s"], {
            maxBuffer: 4 * 1024 * 1024,
            windowsHide: true,
            timeout: 8_000,
          })
        ).stdout;
      } catch {
        return "";
      }
    }),
  );
  const registered = new Map<string, string>();
  for (const output of outputs) {
    let executable = "";
    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("HKEY_")) {
        executable = basename(trimmed).toLowerCase();
        continue;
      }
      const value = trimmed.match(/^\(Default\)\s+REG_(?:EXPAND_)?SZ\s+(.+\.exe)\s*$/i)?.[1]?.replace(/^"|"$/g, "");
      if (executable && value && existsSync(value) && !registered.has(executable)) registered.set(executable, value);
    }
  }
  return registered;
}

function addJetBrainsInstallations(found: Map<string, ScannedEditor>): void {
  const roots = [
    ...(programFiles ? [join(programFiles, "JetBrains")] : []),
    ...(local ? [join(local, "JetBrains", "Toolbox", "apps")] : []),
  ];
  for (const root of roots) {
    scanJetBrainsDirectory(root, 3, found);
  }
}

function scanJetBrainsDirectory(
  directory: string,
  depth: number,
  found: Map<string, ScannedEditor>,
): void {
  if (!existsSync(directory)) return;
  for (const [id, name, filename] of jetBrainsEditors) {
    const executable = join(directory, "bin", filename);
    if (existsSync(executable) && !found.has(id)) found.set(id, { editor: { id, name, icon: "code" }, executable });
  }
  if (depth === 0 || jetBrainsEditors.every(([id]) => found.has(id))) return;
  let children;
  try {
    children = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const child of children) {
    if (child.isDirectory()) scanJetBrainsDirectory(join(directory, child.name), depth - 1, found);
  }
}

function explorerEntry(): ScannedEditor {
  const path = process.env["WINDIR"] ? join(process.env["WINDIR"], "explorer.exe") : undefined;
  return {
    editor: EXPLORER,
    executable: path && existsSync(path) ? path : undefined,
  };
}

async function scanEditors(): Promise<Map<string, ScannedEditor>> {
  const found = new Map<string, ScannedEditor>();
  // Path checks first — registry scan is best-effort and must not block the list.
  for (const spec of editorSpecs) {
    const executable = spec.paths.find(existsSync);
    if (executable) {
      const { executables: _executables, paths: _paths, ...editor } = spec;
      found.set(spec.id, { editor, executable });
    }
  }
  try {
    addJetBrainsInstallations(found);
  } catch {
    // ignore
  }
  try {
    const registered = await registeredExecutables();
    for (const spec of editorSpecs) {
      if (found.has(spec.id)) continue;
      const executable = spec.executables.map((name) => registered.get(name.toLowerCase())).find(Boolean);
      if (executable) {
        const { executables: _executables, paths: _paths, ...editor } = spec;
        found.set(spec.id, { editor, executable });
      }
    }
    for (const [id, name, filename] of jetBrainsEditors) {
      if (found.has(id)) continue;
      const executable = registered.get(filename.toLowerCase());
      if (executable) found.set(id, { editor: { id, name, icon: "code" }, executable });
    }
  } catch {
    // ignore
  }
  found.set("explorer", explorerEntry());
  return found;
}

async function withIcon(editor: InstalledEditor, executable?: string): Promise<InstalledEditor> {
  if (!executable) return editor;
  try {
    const iconUrl = (await app.getFileIcon(executable, { size: "small" })).toDataURL();
    return { ...editor, iconUrl };
  } catch {
    return editor;
  }
}

/** Always includes Explorer first so the menu is never empty on Windows. */
export async function listInstalledEditors(): Promise<InstalledEditor[]> {
  let scanned: Map<string, ScannedEditor>;
  try {
    scanned = await scanEditors();
  } catch {
    scanned = new Map([["explorer", explorerEntry()]]);
  }
  if (!scanned.has("explorer")) scanned.set("explorer", explorerEntry());

  const rest = [...scanned.values()].filter(({ editor }) => editor.id !== "explorer");
  const ordered = [scanned.get("explorer")!, ...rest];
  return Promise.all(ordered.map(({ editor, executable }) => withIcon(editor, executable)));
}

export async function openProjectIn(projectDir: string, editorId: string): Promise<void> {
  if (!statSync(projectDir).isDirectory()) throw new Error("The project folder no longer exists.");
  if (editorId === "explorer") {
    const error = await shell.openPath(projectDir);
    if (error) throw new Error(error);
    return;
  }
  const target = (await scanEditors()).get(editorId);
  if (!target?.executable) throw new Error("That editor is no longer installed.");
  const executable = target.executable;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [projectDir], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("spawn", resolve);
    child.once("error", reject);
    child.unref();
  });
}
