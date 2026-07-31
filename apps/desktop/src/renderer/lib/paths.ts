/**
 * `projectDir` always carries the host platform's own path style (Windows
 * paths on Windows, POSIX paths elsewhere), so that is what decides the
 * separator here rather than the renderer's own platform.
 */
export function absoluteProjectPath(projectDir: string, relativePath: string): string {
  const windowsStyle = /^[a-z]:[\\/]/i.test(projectDir) || projectDir.startsWith("\\\\");
  if (windowsStyle) {
    if (/^(?:[a-z]:[\\/]|[\\/]{2})/i.test(relativePath)) return relativePath.replace(/\//g, "\\");
    return `${projectDir.replace(/[\\/]+$/, "")}\\${relativePath.replace(/^[/\\]+/, "").replace(/\//g, "\\")}`;
  }
  if (relativePath.startsWith("/")) return relativePath;
  return `${projectDir.replace(/\/+$/, "")}/${relativePath.replace(/^\/+/, "")}`;
}

/**
 * The platform's own file manager, named the way its own users would name it.
 * Detected the same way `shortcuts.ts` detects macOS, so the two never disagree.
 */
export function fileManagerName(): string {
  return "file manager";
}

export function editorName(id: string): string {
  const names: Record<string, string> = {
    cursor: "Cursor",
    vscode: "Visual Studio Code",
    antigravity: "Google Antigravity",
    windsurf: "Windsurf",
    "vscode-insiders": "Visual Studio Code Insiders",
    vscodium: "VSCodium",
    zed: "Zed",
    "visual-studio": "Visual Studio",
    "sublime-text": "Sublime Text",
    "notepad-plus-plus": "Notepad++",
    "intellij-idea": "IntelliJ IDEA",
    webstorm: "WebStorm",
    rider: "JetBrains Rider",
    pycharm: "PyCharm",
    clion: "CLion",
    goland: "GoLand",
    phpstorm: "PhpStorm",
    rubymine: "RubyMine",
    rustrover: "RustRover",
    explorer: fileManagerName(),
  };
  return names[id] ?? "editor";
}
